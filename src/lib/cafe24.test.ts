import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Readable } from "node:stream";
import { inspect } from "node:util";
import { FTPError, type AccessOptions } from "basic-ftp";
import {
  Cafe24UploadError,
  ftpErrorCode,
  retryableFtpError,
  uploadHitDeadline,
  uploadManyToCafe24,
  uploadToCafe24,
  type FtpSession,
} from "./cafe24.ts";

// 가짜 설정 — 진짜 서버에는 닿지 않는다(모든 시험이 가짜 세션을 끼운다).
process.env.CAFE24_FTP_HOST = "ftp.example.test";
process.env.CAFE24_FTP_USER = "tester";
process.env.CAFE24_FTP_PASS = "not-a-secret";
process.env.CAFE24_UPLOAD_DIR = "/a/b/c/";
process.env.CAFE24_PUBLIC_BASE_URL = "https://img.example.test/";
delete process.env.CAFE24_FTP_SECURE;

const DIR = "a/b/c/family/u1";

/**
 * 가짜 FTP 세션 — 세션마다 부른 명령을 적는다.
 * fail(op, session) 이 오류를 돌려주면 그 명령에서 던진다. hang(op, session) 이 true 면 close() 가 불릴 때까지 멈춘다.
 * closeError = 멈춘 명령이 close() 로 끊길 때 던질 오류(기본 basic-ftp 의 'User closed client during task').
 * logins = access 에 넘어온 설정(비밀번호 줄바꿈 떼기를 본다).
 */
function rig(
  o: {
    fail?: (op: string, session: number) => unknown;
    hang?: (op: string, session: number) => boolean;
    closeError?: () => Error;
  } = {},
) {
  const calls: string[][] = [];
  const idle: number[] = [];
  const logins: AccessOptions[] = [];
  const newClient = (idleMs: number): FtpSession => {
    const session = calls.length;
    const log: string[] = [];
    calls.push(log);
    idle.push(idleMs);
    let abort: ((e: Error) => void) | null = null;
    let closed = false;
    const step = async (op: string) => {
      if (closed) throw new Error("Client is closed because User closed client");
      log.push(op);
      const err = o.fail?.(op, session);
      if (err) throw err;
      if (o.hang?.(op, session)) {
        await new Promise<never>((_, reject) => {
          abort = reject;
        });
      }
    };
    return {
      access: (options: AccessOptions) => {
        logins.push(options);
        return step("access");
      },
      pwd: async () => {
        await step("pwd");
        return "/home";
      },
      cd: (p: string) => step(`cd ${p}`),
      ensureDir: (p: string) => step(`ensureDir ${p}`),
      uploadFrom: async (src: Readable, name: string) => {
        let bytes = 0;
        for await (const chunk of src) bytes += (chunk as Buffer).length;
        await step(`stor ${name} ${bytes}`);
      },
      close: () => {
        if (closed) return;
        closed = true;
        log.push("close");
        abort?.(o.closeError ? o.closeError() : new Error("User closed client during task"));
      },
    };
  };
  return { newClient, calls, idle, logins };
}

const png = Buffer.alloc(150, 1);
const jpg = Buffer.alloc(90, 2);
const two = [
  { remotePath: "family/u1/mom-1-x.png", data: png },
  { remotePath: "family/u1/mom-1-x-ref.jpg", data: jpg },
];

describe("uploadManyToCafe24 — 한 세션으로 여러 파일", () => {
  it("두 파일 → 로그인 한 번, 폴더 한 번, 차례로 두 번 올리고 닫는다. 주소는 넣은 순서대로", async () => {
    const r = rig();
    const out = await uploadManyToCafe24(two, { newClient: r.newClient });
    assert.deepEqual(r.calls, [
      ["access", `cd ${DIR}`, "stor mom-1-x.png 150", "stor mom-1-x-ref.jpg 90", "close"],
    ]);
    assert.deepEqual(out, [
      { url: `https://img.example.test/${DIR}/mom-1-x.png`, remotePath: `${DIR}/mom-1-x.png` },
      { url: `https://img.example.test/${DIR}/mom-1-x-ref.jpg`, remotePath: `${DIR}/mom-1-x-ref.jpg` },
    ]);
  });

  it("폴더가 없으면(CWD 550) 한 칸씩 만들며 들어간다", async () => {
    const r = rig({ fail: (op) => (op === `cd ${DIR}` ? new FTPError({ code: 550, message: "550 No such directory" }) : null) });
    await uploadManyToCafe24(two, { newClient: r.newClient });
    assert.deepEqual(r.calls[0].slice(0, 3), ["access", `cd ${DIR}`, `ensureDir ${DIR}`]);
    assert.equal(r.calls.length, 1);
  });

  it("CWD 가 4xx(연결 문제)면 폴더를 만들지 않고 오류로 본다", async () => {
    const r = rig({
      fail: (op, s) => (s === 0 && op.startsWith("cd ") ? new FTPError({ code: 421, message: "421 Too many" }) : null),
    });
    await uploadManyToCafe24(two, { newClient: r.newClient, retryDelayMs: 0 });
    assert.ok(!r.calls[0].some((c) => c.startsWith("ensureDir")));
    assert.equal(r.calls.length, 2); // 421 → 다시 한 번
  });

  it("둘째 파일에서 421 → 새 세션으로 그 파일만 다시 올린다", async () => {
    const r = rig({
      fail: (op, s) =>
        s === 0 && op.startsWith("stor mom-1-x-ref.jpg") ? new FTPError({ code: 421, message: "421 Too many connections" }) : null,
    });
    const out = await uploadManyToCafe24(two, { newClient: r.newClient, retryDelayMs: 0 });
    assert.equal(r.calls.length, 2);
    assert.deepEqual(r.calls[1], ["access", `cd ${DIR}`, "stor mom-1-x-ref.jpg 90", "close"]);
    assert.deepEqual(
      out.map((x) => x.remotePath),
      [`${DIR}/mom-1-x.png`, `${DIR}/mom-1-x-ref.jpg`],
    );
  });

  it("데이터 연결을 못 열면(passive) 한 번 더", async () => {
    const r = rig({
      fail: (op, s) =>
        s === 0 && op.startsWith("stor ")
          ? new Error("None of the available transfer strategies work. Last error response was 'Error: Timeout'.")
          : null,
    });
    await uploadManyToCafe24(two, { newClient: r.newClient, retryDelayMs: 0 });
    assert.equal(r.calls.length, 2);
    assert.equal(r.calls[1].filter((c) => c.startsWith("stor ")).length, 2);
  });

  it("로그인 거절(530)은 다시 하지 않는다 — 코드만 싣는다", async () => {
    const r = rig({ fail: (op) => (op === "access" ? new FTPError({ code: 530, message: "530 Login incorrect." }) : null) });
    await assert.rejects(uploadManyToCafe24(two, { newClient: r.newClient, retryDelayMs: 0 }), (e: unknown) => {
      assert.ok(e instanceof Cafe24UploadError);
      assert.deepEqual(e.codes, ["ftp-530"]);
      assert.equal(e.sent, 0);
      assert.equal(ftpErrorCode(e), "ftp-530");
      assert.doesNotMatch(e.message, /example\.test|Login incorrect/);
      return true;
    });
    assert.equal(r.calls.length, 1);
  });

  it("다시 해도 421 이면 두 번에서 멈춘다(코드 둘)", async () => {
    const r = rig({ fail: (op) => (op === "access" ? new FTPError({ code: 421, message: "421 busy" }) : null) });
    await assert.rejects(uploadManyToCafe24(two, { newClient: r.newClient, retryDelayMs: 0 }), (e: unknown) => {
      assert.ok(e instanceof Cafe24UploadError);
      assert.equal(ftpErrorCode(e), "ftp-421>ftp-421");
      return true;
    });
    assert.equal(r.calls.length, 2);
  });

  it("마감이 2초도 안 남았으면 다시 하지 않는다", async () => {
    const r = rig({ fail: (op) => (op.startsWith("stor ") ? new FTPError({ code: 421, message: "421 busy" }) : null) });
    await assert.rejects(
      uploadManyToCafe24(two, { newClient: r.newClient, retryDelayMs: 0, deadline: Date.now() + 1_500 }),
      Cafe24UploadError,
    );
    assert.equal(r.calls.length, 1);
  });

  it("마감이 지나면 연결을 끊는다(close) — 코드 closed, 다시 하지 않는다", async () => {
    const r = rig({ hang: (op) => op.startsWith("stor ") });
    const t0 = Date.now();
    await assert.rejects(
      uploadManyToCafe24(two, { newClient: r.newClient, retryDelayMs: 0, deadline: Date.now() + 60 }),
      (e: unknown) => {
        assert.ok(e instanceof Cafe24UploadError);
        assert.deepEqual(e.codes, ["closed"]);
        return true;
      },
    );
    assert.ok(Date.now() - t0 < 2_000);
    assert.equal(r.calls.length, 1);
    assert.equal(r.calls[0].at(-1), "close");
  });

  it("마감에 끊긴 오류가 passive 글로 싸여 와도 closed(시간 모자람) — 다시 걸지 않는다", async () => {
    // 데이터 연결을 고르던 중에 끊기면 basic-ftp 는 'None of the available transfer strategies…'로 싸서 던진다(passive 는
    // 원래 다시 걸기 대상). 마감 타이머가 울렸으면 원문과 상관없이 closed.
    const r = rig({
      hang: (op) => op.startsWith("stor "),
      closeError: () => new Error("None of the available transfer strategies work. Last error response was 'Error: Timeout'."),
    });
    await assert.rejects(
      uploadManyToCafe24(two, { newClient: r.newClient, retryDelayMs: 0, deadline: Date.now() + 60 }),
      (e: unknown) => {
        assert.ok(e instanceof Cafe24UploadError);
        assert.deepEqual(e.codes, ["closed"]);
        assert.equal(uploadHitDeadline(e), true);
        return true;
      },
    );
    assert.equal(r.calls.length, 1);
  });

  it("421 뒤 다시 건 세션이 마감에 끊기면 ftp-421>closed — 시간 모자람으로 본다", async () => {
    const r = rig({
      fail: (op, s) => (s === 0 && op === "access" ? new FTPError({ code: 421, message: "421 busy" }) : null),
      hang: (op, s) => s === 1 && op.startsWith("stor "),
    });
    await assert.rejects(
      uploadManyToCafe24(two, { newClient: r.newClient, retryDelayMs: 0, deadline: Date.now() + 2_300 }),
      (e: unknown) => {
        assert.equal(ftpErrorCode(e), "ftp-421>closed");
        assert.equal(uploadHitDeadline(e), true);
        return true;
      },
    );
    assert.equal(r.calls.length, 2);
  });

  it("이미 마감이 지났으면 접속하지 않는다", async () => {
    const r = rig();
    await assert.rejects(uploadManyToCafe24(two, { newClient: r.newClient, deadline: Date.now() - 1 }), (e: unknown) => {
      assert.equal(ftpErrorCode(e), "closed");
      assert.equal(uploadHitDeadline(e), true);
      return true;
    });
    assert.deepEqual(r.calls, [["close"]]);
  });

  it("마감이 있으면 멈춤 제한을 남은 시간의 절반으로(5~20초)", async () => {
    const r = rig();
    await uploadManyToCafe24(two, { newClient: r.newClient, deadline: Date.now() + 12_000 });
    await uploadManyToCafe24(two, { newClient: r.newClient, deadline: Date.now() + 4_000 });
    await uploadManyToCafe24(two, { newClient: r.newClient });
    assert.ok(r.idle[0] >= 5_900 && r.idle[0] <= 6_000, String(r.idle[0]));
    assert.equal(r.idle[1], 5_000);
    assert.equal(r.idle[2], 20_000);
  });

  it("폴더가 둘이면 홈을 한 번 물어 두고 폴더 사이에 되돌아간다", async () => {
    const r = rig();
    const out = await uploadManyToCafe24(
      [
        { remotePath: "books/x/p1.webp", data: png },
        { remotePath: "family/u1/a.png", data: jpg },
        { remotePath: "books/x/p2.webp", data: jpg },
      ],
      { newClient: r.newClient },
    );
    assert.deepEqual(r.calls[0], [
      "access",
      "pwd",
      "cd a/b/c/books/x",
      "stor p1.webp 150",
      "stor p2.webp 90",
      "cd /home",
      `cd ${DIR}`,
      "stor a.png 90",
      "close",
    ]);
    assert.deepEqual(
      out.map((x) => x.remotePath),
      ["a/b/c/books/x/p1.webp", `${DIR}/a.png`, "a/b/c/books/x/p2.webp"],
    );
  });

  it("설정이 빠졌으면 접속하지 않고 env", async () => {
    const saved = process.env.CAFE24_FTP_PASS;
    delete process.env.CAFE24_FTP_PASS;
    try {
      const r = rig();
      await assert.rejects(uploadManyToCafe24(two, { newClient: r.newClient }), (e: unknown) => {
        assert.equal(ftpErrorCode(e), "env");
        return true;
      });
      assert.equal(r.calls.length, 0);
    } finally {
      process.env.CAFE24_FTP_PASS = saved;
    }
  });

  it("환경변수 끝의 줄바꿈(CR/LF)은 떼고 로그인한다 — echo 로 넣은 Vercel 값", async () => {
    const saved = { user: process.env.CAFE24_FTP_USER, pass: process.env.CAFE24_FTP_PASS, dir: process.env.CAFE24_UPLOAD_DIR };
    process.env.CAFE24_FTP_USER = "tester\r\n";
    process.env.CAFE24_FTP_PASS = "not-a-secret\n";
    process.env.CAFE24_UPLOAD_DIR = "/a/b/c/\n";
    try {
      const r = rig();
      const out = await uploadManyToCafe24(two, { newClient: r.newClient });
      assert.equal(r.logins[0].user, "tester");
      assert.equal(r.logins[0].password, "not-a-secret");
      assert.equal(r.calls[0][1], `cd ${DIR}`);
      assert.equal(out[0].remotePath, `${DIR}/mom-1-x.png`);
    } finally {
      process.env.CAFE24_FTP_USER = saved.user;
      process.env.CAFE24_FTP_PASS = saved.pass;
      process.env.CAFE24_UPLOAD_DIR = saved.dir;
    }
  });

  it("명령에 줄바꿈이 섞이면 env-ctrl — 다시 걸지 않고, 비밀번호가 든 원문은 cause 에도 싣지 않는다", async () => {
    const leaked = "Invalid command: Contains control characters. (PASS pw-SECRET-123\nx)";
    const r = rig({ fail: (op) => (op === "access" ? new Error(leaked) : null) });
    await assert.rejects(uploadManyToCafe24(two, { newClient: r.newClient, retryDelayMs: 0 }), (e: unknown) => {
      assert.ok(e instanceof Cafe24UploadError);
      assert.deepEqual(e.codes, ["env-ctrl"]);
      assert.equal(e.cause, undefined);
      // 누가 오류를 통째로 찍어도(console.error(e) = inspect) 비밀번호가 나오지 않는다.
      assert.doesNotMatch(inspect(e, { depth: 5 }), /pw-SECRET-123/);
      assert.equal(uploadHitDeadline(e), false);
      return true;
    });
    assert.equal(r.calls.length, 1);
  });

  it("빈 목록은 접속하지 않는다", async () => {
    const r = rig();
    assert.deepEqual(await uploadManyToCafe24([], { newClient: r.newClient }), []);
    assert.equal(r.calls.length, 0);
  });
});

describe("uploadToCafe24 — 한 파일, 예전 모양 그대로", () => {
  it("url·remotePath 하나를 돌려준다", async () => {
    const r = rig();
    const out = await uploadToCafe24("folk/haedal/p1.png", png, { newClient: r.newClient });
    assert.deepEqual(out, { url: "https://img.example.test/a/b/c/folk/haedal/p1.png", remotePath: "a/b/c/folk/haedal/p1.png" });
    assert.deepEqual(r.calls, [["access", "cd a/b/c/folk/haedal", "stor p1.png 150", "close"]]);
  });

  it("기준 폴더가 없고 파일이 홈 바로 아래면 폴더에 들어가지 않는다", async () => {
    const saved = process.env.CAFE24_UPLOAD_DIR;
    delete process.env.CAFE24_UPLOAD_DIR;
    try {
      const r = rig();
      const out = await uploadToCafe24("/p.png", png, { newClient: r.newClient });
      assert.equal(out.remotePath, "p.png");
      assert.deepEqual(r.calls, [["access", "stor p.png 150", "close"]]);
    } finally {
      process.env.CAFE24_UPLOAD_DIR = saved;
    }
  });
});

describe("ftpErrorCode — 짧은 코드만(원문·주소 없이)", () => {
  const withCode = (message: string, code: string) => Object.assign(new Error(message), { code });
  const cases: [unknown, string, boolean][] = [
    [new FTPError({ code: 421, message: "421 Too many connections (8) from this IP" }), "ftp-421", true],
    [new FTPError({ code: 425, message: "425 Can't open data connection" }), "ftp-425", true],
    [new FTPError({ code: 426, message: "426 Transfer aborted" }), "ftp-426", true],
    [new FTPError({ code: 530, message: "530 Login incorrect." }), "ftp-530", false],
    [new FTPError({ code: 550, message: "550 Permission denied" }), "ftp-550", false],
    [new FTPError({ code: 552, message: "552 Quota exceeded" }), "ftp-552", false],
    [new FTPError({ code: 452, message: "452 Insufficient storage" }), "ftp-452", false],
    [new FTPError({ code: 553, message: "553 Bad file name" }), "ftp-553", false],
    [withCode("connect ECONNREFUSED 10.0.0.1:21 (control socket)", "ECONNREFUSED"), "ECONNREFUSED", false],
    [withCode("read ECONNRESET (control socket)", "ECONNRESET"), "ECONNRESET", true],
    [withCode("connect ETIMEDOUT 10.0.0.1:21", "ETIMEDOUT"), "ETIMEDOUT", true],
    [withCode("getaddrinfo EAI_AGAIN ftp.example.test", "EAI_AGAIN"), "EAI_AGAIN", true],
    [withCode("getaddrinfo ENOTFOUND ftp.example.test", "ENOTFOUND"), "ENOTFOUND", false],
    [new Error("Timeout when trying to open data connection to 10.0.0.2:50000"), "passive", true],
    [withCode("Can't open data connection in passive mode: connect ECONNREFUSED 10.0.0.2:50000", "ECONNREFUSED"), "passive", true],
    [new Error("None of the available transfer strategies work. Last error response was 'x'."), "passive", true],
    [new Error("Timeout (data socket)"), "timeout-data", true],
    [withCode("Client is closed because Timeout (control socket)", "0"), "timeout-control", true],
    [new Error("Server sent FIN packet unexpectedly, closing connection."), "fin", true],
    [withCode("Client is closed because read ECONNRESET (data socket)", "ECONNRESET"), "ECONNRESET", true],
    [new Error("Invalid command: Contains control characters. (PASS pw\n)"), "env-ctrl", false],
    [new Error("User closed client during task"), "closed", false],
    [withCode("Client is closed because User closed client", "0"), "closed", false],
    [new Error("something else at 10.0.0.1"), "other", false],
    ["문자열", "other", false],
    [null, "other", false],
  ];
  for (const [e, code, retry] of cases) {
    it(`${code}${retry ? " (다시)" : ""} ← ${e instanceof Error ? e.message.slice(0, 50) : String(e)}`, () => {
      assert.equal(ftpErrorCode(e), code);
      assert.equal(retryableFtpError(e), retry);
      assert.match(ftpErrorCode(e), /^[a-zA-Z0-9_-]{2,30}$/);
    });
  }
});

describe("uploadHitDeadline — 마감에 끊긴 것(시간 모자람)만 true", () => {
  const up = (codes: string[]) => new Cafe24UploadError(codes, 0, 2, null);
  const cases: [unknown, boolean][] = [
    [up(["closed"]), true],
    [up(["passive", "closed"]), true],
    [up(["ftp-421", "closed"]), true],
    [up(["ftp-421"]), false],
    [up(["ftp-421", "ftp-421"]), false],
    [up(["passive"]), false],
    [up(["timeout-control"]), false],
    [up(["ftp-530"]), false],
    [up(["env"]), false],
    [up(["env-ctrl"]), false],
    [new Error("User closed client during task"), true],
    [new FTPError({ code: 421, message: "421 busy" }), false],
    [new Error("something else"), false],
    [null, false],
  ];
  for (const [e, hit] of cases) {
    it(`${ftpErrorCode(e)} → ${hit}`, () => {
      assert.equal(uploadHitDeadline(e), hit);
    });
  }
});
