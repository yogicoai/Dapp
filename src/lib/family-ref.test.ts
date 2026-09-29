import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  acceptFamilyRef,
  clearFamilyRefCacheForTests,
  familyFolderOf,
  familyRefMemberId,
  familyUrlPrefix,
  fetchFamilyRef,
  fetchFamilyRefCached,
} from "./family-ref.ts";

/*
 * 가족 그림 주소 — 서버가 이 회원 폴더의 우리가 올린 참고용 JPEG 만 받아 오는지.
 */

const UID = "0A1B2C3D-1111-2222-3333-444455556666";
const ENV = { CAFE24_PUBLIC_BASE_URL: "https://yogibo.openhost.cafe24.com/", CAFE24_UPLOAD_DIR: "/app/img/dapp/" };
const PREFIX = "https://yogibo.openhost.cafe24.com/app/img/dapp/family/0a1b2c3d-1111-2222-3333-444455556666/";
const HEX = "0123456789abcdef0123456789abcdef";
const REF = `${PREFIX}child-1759100000000-${HEX}-ref.jpg`;

describe("familyFolderOf · familyUrlPrefix — 올리는 쪽(api/family/portrait)과 같은 주소", () => {
  it("uid 는 소문자 uuid 글자만", () => {
    assert.equal(familyFolderOf(UID), "0a1b2c3d-1111-2222-3333-444455556666");
    assert.equal(familyFolderOf("../ZZ/"), "member");
  });

  it("끝 슬래시·앞뒤 슬래시가 있어도 같은 주소", () => {
    const folder = familyFolderOf(UID);
    assert.equal(familyUrlPrefix(ENV, folder), PREFIX);
    assert.equal(
      familyUrlPrefix({ CAFE24_PUBLIC_BASE_URL: "https://yogibo.openhost.cafe24.com", CAFE24_UPLOAD_DIR: "app/img/dapp" }, folder),
      PREFIX,
    );
    assert.equal(
      familyUrlPrefix({ CAFE24_PUBLIC_BASE_URL: "https://x.cafe24.com//" }, folder),
      `https://x.cafe24.com/family/${folder}/`,
    );
  });

  it("설정이 없거나 https 가 아니면 null — 고정 얼굴 없이 예전처럼", () => {
    const folder = familyFolderOf(UID);
    assert.equal(familyUrlPrefix({}, folder), null);
    assert.equal(familyUrlPrefix({ CAFE24_PUBLIC_BASE_URL: "http://x.cafe24.com" }, folder), null);
    assert.equal(familyUrlPrefix({ CAFE24_PUBLIC_BASE_URL: "https://x.cafe24.com?a=1" }, folder), null);
    assert.equal(familyUrlPrefix({ CAFE24_PUBLIC_BASE_URL: "https://user@x.cafe24.com" }, folder), null);
    assert.equal(familyUrlPrefix(ENV, ""), null);
    assert.equal(familyUrlPrefix(ENV, "../x"), null);
  });
});

describe("acceptFamilyRef — 이 회원 폴더의 참고용 JPEG 만", () => {
  it("우리가 올린 이름 꼴이면 그대로 돌려준다", () => {
    assert.equal(acceptFamilyRef(REF, PREFIX), REF);
    assert.equal(acceptFamilyRef(`${PREFIX}m-a1b2c3d4e5f6-1759100000000-${HEX}-ref.jpg`, PREFIX), `${PREFIX}m-a1b2c3d4e5f6-1759100000000-${HEX}-ref.jpg`);
  });

  it("남의 폴더·다른 호스트·http 는 받지 않는다", () => {
    const other = PREFIX.replace("0a1b2c3d", "ffffffff");
    assert.equal(acceptFamilyRef(`${other}child-1759100000000-${HEX}-ref.jpg`, PREFIX), null);
    assert.equal(acceptFamilyRef(REF.replace("yogibo.openhost.cafe24.com", "evil.example.com"), PREFIX), null);
    assert.equal(acceptFamilyRef(REF.replace("https://", "http://"), PREFIX), null);
    assert.equal(acceptFamilyRef("https://169.254.169.254/latest/meta-data/", PREFIX), null);
  });

  it("화면용 PNG·쿼리·조각·경로 넘기·다른 이름 꼴은 받지 않는다", () => {
    assert.equal(acceptFamilyRef(REF.replace("-ref.jpg", ".png"), PREFIX), null);
    assert.equal(acceptFamilyRef(`${REF}?v=2`, PREFIX), null);
    assert.equal(acceptFamilyRef(`${REF}#x`, PREFIX), null);
    assert.equal(acceptFamilyRef(`${PREFIX}../ffffffff-1111-2222-3333-444455556666/child-1759100000000-${HEX}-ref.jpg`, PREFIX), null);
    assert.equal(acceptFamilyRef(`${PREFIX}%2e%2e/child-1759100000000-${HEX}-ref.jpg`, PREFIX), null);
    assert.equal(acceptFamilyRef(`${PREFIX}sub/child-1759100000000-${HEX}-ref.jpg`, PREFIX), null);
    assert.equal(acceptFamilyRef(`${PREFIX}child-1759100000000-abc-ref.jpg`, PREFIX), null);
    assert.equal(acceptFamilyRef(`${PREFIX}Child-1759100000000-${HEX}-ref.jpg`, PREFIX), null);
    assert.equal(acceptFamilyRef(`${PREFIX}child-1759100000000-${HEX}-ref.jpg.png`, PREFIX), null);
  });

  it("너무 긴 주소·글자가 아닌 값·설정 없음은 받지 않는다", () => {
    // 저장 규칙(lib/family normalizePortrait)과 같이 500자까지 — 꼴이 맞아도 길면 받지 않는다.
    const longPrefix = familyUrlPrefix(
      { CAFE24_PUBLIC_BASE_URL: "https://x.cafe24.com", CAFE24_UPLOAD_DIR: "d".repeat(420) },
      familyFolderOf(UID),
    );
    const longRef = `${longPrefix}child-1759100000000-${HEX}-ref.jpg`;
    assert.ok(longRef.length > 500);
    assert.equal(acceptFamilyRef(longRef, longPrefix), null);
    assert.equal(acceptFamilyRef(42, PREFIX), null);
    assert.equal(acceptFamilyRef(undefined, PREFIX), null);
    assert.equal(acceptFamilyRef(REF, null), null);
  });

  it("사람 id 를 주면 파일 이름의 id 와 같아야 한다", () => {
    assert.equal(acceptFamilyRef(REF, PREFIX, { memberId: "child" }), REF);
    assert.equal(acceptFamilyRef(REF, PREFIX, { memberId: "mom" }), null);
  });
});

describe("familyRefMemberId — 파일 이름의 사람 id", () => {
  it("mom·dad·child·m-… 를 읽는다", () => {
    assert.equal(familyRefMemberId(REF, PREFIX), "child");
    assert.equal(familyRefMemberId(`${PREFIX}mom-1759100000000-${HEX}-ref.jpg`, PREFIX), "mom");
    assert.equal(familyRefMemberId(`${PREFIX}m-a1b2c3d4e5f6-1759100000000-${HEX}-ref.jpg`, PREFIX), "m-a1b2c3d4e5f6");
  });

  it("폴더가 다르거나 이름 꼴이 아니면 null", () => {
    assert.equal(familyRefMemberId(REF, null), null);
    assert.equal(familyRefMemberId(REF.replace("0a1b2c3d", "ffffffff"), PREFIX), null);
    assert.equal(familyRefMemberId(REF.replace("-ref.jpg", ".png"), PREFIX), null);
  });
});

/* ─────────── 받아 오기 — 가짜 fetch 로(네트워크 없음) ─────────── */

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

function fakeFetch(
  make: (url: string, init: RequestInit) => Response | Promise<Response>,
  seen: { url?: string; init?: RequestInit } = {},
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.url = String(input);
    seen.init = init;
    return make(String(input), init ?? {});
  }) as typeof fetch;
}

describe("fetchFamilyRef — 넘겨주기 없이, 시간·크기를 잘라, JPEG 만", () => {
  it("JPEG 을 받으면 base64 로 돌려주고, 넘겨주기를 따라가지 않게 부른다", async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    const got = await fetchFamilyRef(REF, { fetchImpl: fakeFetch(() => new Response(JPEG), seen) });
    assert.deepEqual(got, { mimeType: "image/jpeg", data: Buffer.from(JPEG).toString("base64") });
    assert.equal(seen.url, REF);
    assert.equal(seen.init?.redirect, "error");
    assert.ok(seen.init?.signal);
  });

  it("실패 응답·JPEG 아닌 내용은 null", async () => {
    assert.equal(await fetchFamilyRef(REF, { fetchImpl: fakeFetch(() => new Response("no", { status: 404 })) }), null);
    assert.equal(await fetchFamilyRef(REF, { fetchImpl: fakeFetch(() => new Response("<html>hi</html>")) }), null);
    assert.equal(await fetchFamilyRef(REF, { fetchImpl: fakeFetch(() => new Response(new Uint8Array(0))) }), null);
  });

  it("크기 상한을 넘으면 null — 적힌 길이로도, 실제로 받은 길이로도", async () => {
    const big = new Uint8Array(64);
    big.set([0xff, 0xd8, 0xff]);
    const declared = fakeFetch(() => new Response(JPEG, { headers: { "content-length": "999999" } }));
    assert.equal(await fetchFamilyRef(REF, { fetchImpl: declared, maxBytes: 32 }), null);
    const streamed = fakeFetch(
      () =>
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(big.slice(0, 32));
              c.enqueue(big.slice(32));
              c.close();
            },
          }),
        ),
    );
    assert.equal(await fetchFamilyRef(REF, { fetchImpl: streamed, maxBytes: 40 }), null);
    assert.ok(await fetchFamilyRef(REF, { fetchImpl: fakeFetch(() => new Response(big)), maxBytes: 64 }));
  });

  it("던지거나(넘겨주기 거절 등) 시간이 지나면 null — 절대 던지지 않는다", async () => {
    const throws = fakeFetch(() => {
      throw new TypeError("fetch failed: redirect mode is set to error");
    });
    assert.equal(await fetchFamilyRef(REF, { fetchImpl: throws }), null);
    const hangs = fakeFetch(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const started = Date.now();
    assert.equal(await fetchFamilyRef(REF, { fetchImpl: hangs, timeoutMs: 30 }), null);
    assert.ok(Date.now() - started < 2000);
  });
});

describe("fetchFamilyRefCached — 쪽마다 같은 얼굴을 다시 받지 않는다(얼굴 고정 3단계)", () => {
  it("같은 주소는 한 번만 받는다 — 동시에 불러도, 나중에 불러도", async () => {
    clearFamilyRefCacheForTests();
    let calls = 0;
    const fetchImpl = fakeFetch(() => {
      calls++;
      return new Response(JPEG);
    });
    const [a, b] = await Promise.all([fetchFamilyRefCached(REF, { fetchImpl }), fetchFamilyRefCached(REF, { fetchImpl })]);
    const c = await fetchFamilyRefCached(REF, { fetchImpl });
    assert.equal(calls, 1);
    assert.deepEqual(a, { mimeType: "image/jpeg", data: Buffer.from(JPEG).toString("base64") });
    assert.deepEqual(b, a);
    assert.deepEqual(c, a);
  });

  it("실패는 기억하지 않는다 — 다음에 다시 받아 본다", async () => {
    clearFamilyRefCacheForTests();
    let calls = 0;
    const flaky = fakeFetch(() => (++calls === 1 ? new Response("no", { status: 503 }) : new Response(JPEG)));
    assert.equal(await fetchFamilyRefCached(REF, { fetchImpl: flaky }), null);
    assert.ok(await fetchFamilyRefCached(REF, { fetchImpl: flaky }));
    assert.equal(calls, 2);
  });

  it("15분이 지나면 다시 받는다", async () => {
    clearFamilyRefCacheForTests();
    let calls = 0;
    let clock = 1_000_000;
    const fetchImpl = fakeFetch(() => {
      calls++;
      return new Response(JPEG);
    });
    await fetchFamilyRefCached(REF, { fetchImpl, now: () => clock });
    clock += 14 * 60 * 1000;
    await fetchFamilyRefCached(REF, { fetchImpl, now: () => clock });
    assert.equal(calls, 1);
    clock += 2 * 60 * 1000;
    await fetchFamilyRefCached(REF, { fetchImpl, now: () => clock });
    assert.equal(calls, 2);
  });

  it("24장을 넘으면 가장 오래 안 쓴 것부터 뺀다", async () => {
    clearFamilyRefCacheForTests();
    const seen: string[] = [];
    const fetchImpl = fakeFetch((url) => {
      seen.push(url);
      return new Response(JPEG);
    });
    const urlOf = (i: number) => `${PREFIX}mom-17591000000${String(i).padStart(2, "0")}-${HEX}-ref.jpg`;
    for (let i = 0; i < 25; i++) await fetchFamilyRefCached(urlOf(i), { fetchImpl });
    assert.equal(seen.length, 25);
    await fetchFamilyRefCached(urlOf(24), { fetchImpl }); // 남아 있다
    assert.equal(seen.length, 25);
    await fetchFamilyRefCached(urlOf(0), { fetchImpl }); // 빠졌다 — 다시 받는다
    assert.equal(seen.length, 26);
  });
});
