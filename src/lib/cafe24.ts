import { Client, FTPError, type AccessOptions } from "basic-ftp";
import { Readable } from "node:stream";

/**
 * cafe24 이미지호스팅에 파일을 FTP로 올리고 공개 URL을 돌려준다.
 *
 * 만든 동화의 이미지·음성은 무거운 파일이라 DB가 아니라 여기(정액 파일 창고)에 둔다.
 * DB(Supabase)에는 이 함수가 돌려준 URL만 저장한다. 서버 전용 — 클라이언트에서 import 금지.
 *
 * 필요한 .env.local:
 *   CAFE24_FTP_HOST         FTP 주소
 *   CAFE24_FTP_PORT         포트 (기본 21)
 *   CAFE24_FTP_USER         FTP 아이디
 *   CAFE24_FTP_PASS         FTP 비밀번호
 *   CAFE24_FTP_SECURE       "true"면 FTPS (기본 false)
 *   CAFE24_UPLOAD_DIR       업로드 기준 폴더 (예: "/" 또는 "/storybook")
 *   CAFE24_PUBLIC_BASE_URL  공개 URL 앞부분 (예: "https://xxx.cafe24.com")
 *
 * 올리기(uploadManyToCafe24, 2026-09-30 — 배포에서 가족 그림 두 사람이 한꺼번에 '그림을 올리지 못했어요'):
 *   - 여러 파일을 **한 번 로그인한 한 세션**으로 차례로 올린다. FTP 는 로그인·폴더 찾기·전송 방식 고르기까지 명령마다
 *     서버와 한 번씩 주고받는데, 배포 함수가 미국에 있으면 한 번에 0.2초쯤이라 파일마다 새로 접속하면 몇 초씩 든다.
 *     파일마다 세션을 따로 열면 cafe24 에 동시 접속도 그만큼 늘어난다(가족 그림 두 사람 = 네 개).
 *   - 폴더는 CWD 한 번으로 들어가고, 없을 때(5xx)만 한 칸씩 만들며 들어간다(ensureDir — 칸마다 MKD·CWD 두 번씩 주고받는다).
 *   - 접속이 잠깐 끊기거나 막힌 오류(아래 RETRYABLE)면 **아직 못 올린 파일만** 새 세션으로 한 번 더 올린다.
 *     비밀번호(530)·권한/경로(550·553)·용량(452·552)·설정 빠짐은 다시 해도 같으니 바로 멈춘다.
 *   - deadline 을 주면 그 시각에 연결을 끊는다(함수 제한에 잘려 값만 나가고 되돌리기도 못 도는 일을 막는다). 그렇게 끝나면
 *     코드는 closed — 연결 문제가 아니라 시간이 모자란 것이다(uploadHitDeadline 으로 가린다).
 *   - 실패는 Cafe24UploadError 로 던진다 — 시도마다 짧은 코드(ftpErrorCode)만 싣는다. basic-ftp 원문에는 서버 주소·포트,
 *     PASV 로 받은 IP 가 들어 있어 로그·응답에 원문을 넣지 않는다.
 * uploadToCafe24(한 파일)는 예전 모양 그대로 — 안에서 uploadManyToCafe24 를 부른다(다시 걸기도 같이 받는다).
 */

export type UploadResult = { url: string; remotePath: string };

/** 한 번에 올릴 파일 하나 — remotePath 는 uploadToCafe24 와 같은 규칙(기준 폴더 아래 상대 경로, 앞 슬래시 없이) */
export type UploadItem = { remotePath: string; data: Buffer };

/**
 * 한 세션에서 쓰는 basic-ftp Client 의 몫 — 시험에서 가짜로 바꿔 끼우려고 필요한 것만 적는다.
 * (진짜 Client 는 이 모양에 그대로 맞는다.)
 */
export type FtpSession = {
  access(options: AccessOptions): Promise<unknown>;
  pwd(): Promise<string>;
  cd(path: string): Promise<unknown>;
  ensureDir(path: string): Promise<void>;
  uploadFrom(source: Readable, toRemotePath: string): Promise<unknown>;
  close(): void;
};

export type UploadManyOptions = {
  /** 이 시각(Date.now 기준)이 되면 연결을 끊는다. 없으면 basic-ftp 의 멈춤 제한(idle)만. */
  deadline?: number;
  /** 잠깐 끊긴 오류면 한 번 더(기본 true) */
  retry?: boolean;
  /** 시험용 — 새 세션 만들기(idleMs = 명령·전송이 이만큼 멈추면 끊는 basic-ftp 제한) */
  newClient?: (idleMs: number) => FtpSession;
  /** 다시 걸기 전 쉬는 시간(기본 300ms) */
  retryDelayMs?: number;
  /** 시험용 시계 */
  now?: () => number;
};

/** 명령·전송이 이만큼 멈추면 basic-ftp 가 끊는다(예전 값 그대로) */
const IDLE_MS = 20_000;
/**
 * deadline 이 있으면 멈춤 제한을 남은 시간의 절반으로 줄인다(5초 ~ 20초) — 한 번 멈춰도 다시 걸 시간이 남게.
 * 명령 하나는 미국 배포에서도 0.2초쯤이라 5초면 넉넉하다.
 */
const IDLE_MIN_MS = 5_000;
/** 다시 걸려면 deadline 까지 이만큼은 남아야 한다 — 서울 배포면 두 파일에 1초도 안 걸린다 */
const RETRY_MIN_LEFT_MS = 2_000;
const RETRY_DELAY_MS = 300;

/**
 * 다시 걸어 볼 오류(ftpErrorCode 값) — 연결이 잠깐 끊기거나 서버가 잠시 바빴던 것.
 * 421 = 접속이 너무 많음·서비스 잠시 안 됨, 425 = 데이터 연결을 못 엶, 426 = 전송 중 끊김.
 */
const RETRYABLE = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "EPIPE",
  "ECONNABORTED",
  "EAI_AGAIN",
  "ftp-421",
  "ftp-425",
  "ftp-426",
  "passive",
  "timeout-data",
  "timeout-control",
  "fin",
]);

/** .env 설정이 빠졌다 — 다시 해도 같다(코드 env) */
class Cafe24ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Cafe24ConfigError";
  }
}

/**
 * 마감(deadline)에 걸렸다 — 시작하기 전에 이미 지났거나, 올리는 도중 마감 타이머가 연결을 끊었다(코드 closed).
 * 끊긴 명령이 무슨 글로 끝나든(sendOnce 참고) 타이머가 울렸으면 이것으로 바꿔 던진다 — 시간이 모자란 것을 연결 오류로
 * 잘못 읽지 않게.
 */
class Cafe24DeadlinePassed extends Error {
  constructor(cause?: unknown) {
    super("cafe24 올리기 마감이 지남", cause === undefined ? undefined : { cause });
    this.name = "Cafe24DeadlinePassed";
  }
}

/**
 * 올리기 실패. codes = 시도마다 짧은 오류 코드(ftpErrorCode — 예 ["ftp-421", "ftp-421"]), sent = 그중 올라간 파일 수.
 * message 에도 코드만 적는다(원문은 cause 에만 — 로그에 통째로 찍지 말 것).
 */
export class Cafe24UploadError extends Error {
  readonly codes: string[];
  readonly sent: number;
  readonly total: number;
  constructor(codes: string[], sent: number, total: number, cause: unknown) {
    super(`cafe24 올리기 실패 (${codes.join(" → ")}, ${sent}/${total})`, { cause });
    this.name = "Cafe24UploadError";
    this.codes = codes;
    this.sent = sent;
    this.total = total;
  }
}

/**
 * 앞뒤 줄바꿈(CR/LF)을 뗀다 — `echo 비번 | vercel env add` 처럼 넣으면 값 끝에 줄바꿈이 붙는다. 그대로 보내면 basic-ftp 가
 * 'Invalid command: Contains control characters. (PASS <비밀번호>…)'로 멈추는데 그 글에 비밀번호가 그대로 든다.
 * FTP 명령에는 줄바꿈이 들어갈 수 없으니(명령 끝 표시) 떼어도 진짜 값이 바뀌지 않는다. 가운데 줄바꿈은 그대로 두어 env-ctrl 로 알린다.
 */
function stripCrlf(v: string): string {
  return v.replace(/^[\r\n]+|[\r\n]+$/g, "");
}

function need(name: string): string {
  const v = stripCrlf(process.env[name] ?? "");
  if (!v) throw new Cafe24ConfigError(`${name}가 .env.local에 없습니다.`);
  return v;
}

function accessOptions(): AccessOptions {
  return {
    host: need("CAFE24_FTP_HOST"),
    port: Number(process.env.CAFE24_FTP_PORT ?? 21),
    user: need("CAFE24_FTP_USER"),
    password: need("CAFE24_FTP_PASS"),
    secure: stripCrlf(process.env.CAFE24_FTP_SECURE ?? "") === "true",
  };
}

/** 진단용 — 특정 폴더의 내용을 나열한다. 웹 루트(www 등)가 어디인지 찾을 때 쓴다. */
export async function listCafe24(dir = "/"): Promise<string[]> {
  const client = new Client(15_000);
  try {
    await client.access(accessOptions());
    const list = await client.list(dir);
    return list.map((f) => `${f.isDirectory ? "[폴더]" : "[파일]"} ${f.name}`);
  } finally {
    client.close();
  }
}

/**
 * 홈(웹 루트) 기준 상대 경로 조립. 앞 슬래시를 떼야 FTP 홈 아래에 만들어져 웹에 보인다.
 * CAFE24_UPLOAD_DIR(예: "storybook")를 접두로 붙인다.
 */
function relPathOf(remotePath: string): string {
  // 줄바꿈도 뗀다(need 와 같은 까닭 — 폴더 이름에 붙으면 CWD 명령이 control characters 로 멈춘다).
  const base = (process.env.CAFE24_UPLOAD_DIR ?? "").replace(/^[/\r\n]+|[/\r\n]+$/g, "");
  const rel = remotePath.replace(/^\/+/, "");
  return [base, rel].filter(Boolean).join("/");
}

/**
 * 오류 → 로그·응답에 실어도 되는 짧은 코드. 원문(message)은 돌려주지 않는다 — basic-ftp 원문에는 서버 주소·포트,
 * PASV 로 받은 IP 가 들어 있다.
 *   ftp-<숫자>        서버가 답한 FTP 오류(421 접속 많음 · 530 로그인 · 550 경로 · 552/452 용량 · 553 파일 이름 …)
 *   E<대문자>         소켓 오류(ECONNREFUSED 접속 거절 · ECONNRESET 끊김 · ENOTFOUND 주소 못 찾음 …)
 *   passive           데이터 연결(PASV/EPSV)을 못 엶
 *   timeout-control   명령에 답이 멈춤(basic-ftp 멈춤 제한)
 *   timeout-data      전송이 멈춤
 *   fin               서버가 연결을 먼저 끊음
 *   closed            마감(deadline)에 우리가 끊음 = 시간이 모자람(uploadHitDeadline)
 *   env               .env 설정이 빠짐
 *   env-ctrl          보낼 명령에 줄바꿈 같은 글자가 섞임 — 거의 늘 Vercel 환경변수(아이디·비밀번호·폴더) 가운데 줄바꿈.
 *                     원문에 비밀번호가 들 수 있어 Cafe24UploadError 의 cause 에도 싣지 않는다.
 *   other             그 밖
 * Cafe24UploadError 는 시도마다의 코드를 '>' 로 잇는다(예 "ftp-421>ftp-421").
 */
export function ftpErrorCode(e: unknown): string {
  if (e instanceof Cafe24UploadError) return e.codes.join(">");
  if (e instanceof Cafe24ConfigError) return "env";
  if (e instanceof Cafe24DeadlinePassed) return "closed";
  if (e instanceof FTPError) return `ftp-${e.code}`;
  const message = e instanceof Error ? e.message : "";
  // 맨 먼저 — 이 원문에는 보내려던 명령(PASS 비밀번호 포함)이 그대로 든다.
  if (/Invalid command: Contains control characters/.test(message)) return "env-ctrl";
  if (/User closed client/.test(message)) return "closed";
  if (
    /Timeout when trying to open data connection|Can't open data connection in passive mode|None of the available transfer strategies/.test(
      message,
    )
  ) {
    return "passive";
  }
  if (/Timeout \(data socket\)/.test(message)) return "timeout-data";
  if (/Timeout \(control socket\)/.test(message)) return "timeout-control";
  if (/Server sent FIN packet unexpectedly|Server closed connection unexpectedly|Socket closed due to transmission error/.test(message)) {
    return "fin";
  }
  const code = (e as { code?: unknown } | null)?.code;
  if (typeof code === "string" && /^E[A-Z0-9_]{2,30}$/.test(code)) return code;
  return "other";
}

/** 다시 걸어 볼 오류인가(RETRYABLE) */
export function retryableFtpError(e: unknown): boolean {
  return RETRYABLE.has(ftpErrorCode(e));
}

/**
 * 올리기가 **마감에 걸려** 끝났나 — 마지막 시도의 코드가 closed(마감 타이머가 끊음·시작 전에 이미 지남)면 true.
 * 연결 오류가 아니라 시간이 모자란 것이라, 부르는 쪽은 '올리지 못했어요'(서버 문제)가 아니라 '너무 오래 걸렸어요'로
 * 알린다(api/family/portrait — 2026-09-30 검토: 마감 1초 앞 cafe24 가 먼저 끊도록 맞춰 둔 탓에 시간 초과가 502 로 나갔다).
 * 앞 시도가 421 이어도 다시 건 마지막 시도가 마감에 끊겼으면 시간 문제다(예 "ftp-421>closed").
 */
export function uploadHitDeadline(e: unknown): boolean {
  return ftpErrorCode(e).split(">").at(-1) === "closed";
}

type Planned = { full: string; dir: string; filename: string; data: Buffer };

/** 폴더에 들어간다 — CWD 한 번, 없으면(서버가 5xx) 한 칸씩 만들며. 연결 문제(4xx·소켓)는 그대로 던진다. */
async function enterDir(client: FtpSession, dir: string): Promise<void> {
  try {
    await client.cd(dir);
  } catch (e) {
    if (!(e instanceof FTPError && e.code >= 500)) throw e;
    await client.ensureDir(dir); // 홈 기준 상대 → 웹 루트 아래에 생성, cwd 이동
  }
}

/**
 * 한 세션으로 아직 못 올린 파일(results[i] 가 빈 것)을 올린다. 올라간 파일은 곧바로 results 에 적는다 — 도중에 끊겨도
 * 다시 걸 때 그 파일은 건너뛴다.
 */
async function sendOnce(
  client: FtpSession,
  plan: Planned[],
  results: (UploadResult | undefined)[],
  base: string,
  access: AccessOptions,
  deadline: number | undefined,
  now: () => number,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** 마감 타이머가 울려 우리가 끊었나 — 그러면 어떤 오류로 끝났든 closed(시간 모자람)로 던진다 */
  let fired = false;
  try {
    if (deadline !== undefined) {
      const ms = deadline - now();
      if (ms <= 0) throw new Cafe24DeadlinePassed();
      // 마감에 끊는다 — 하던 명령이 'User closed client' 로 끝난다(코드 closed).
      timer = setTimeout(() => {
        fired = true;
        client.close();
      }, ms);
    }
    await client.access(access);
    // 로그인 직후 작업 폴더 = FTP 홈(웹 루트). 폴더가 둘 이상일 때만 홈을 물어 두고 폴더 사이에 되돌아간다.
    const dirs = [...new Set(plan.filter((_, i) => !results[i]).map((p) => p.dir))];
    const home = dirs.length > 1 ? await client.pwd() : null;
    for (let d = 0; d < dirs.length; d++) {
      if (d > 0 && home !== null) await client.cd(home);
      if (dirs[d]) await enterDir(client, dirs[d]);
      for (let i = 0; i < plan.length; i++) {
        if (results[i] || plan[i].dir !== dirs[d]) continue;
        // 시도마다 새 스트림 — 한 번 읽은 스트림은 다시 못 읽는다.
        await client.uploadFrom(Readable.from(plan[i].data), plan[i].filename);
        results[i] = { url: `${base}/${plan[i].full}`, remotePath: plan[i].full };
      }
    }
  } catch (e) {
    // 끊긴 뒤의 오류 글은 경우마다 다르다(데이터 연결을 고르던 중이면 'None of the available transfer strategies…'로 싸이고,
    // 데이터 소켓 오류가 먼저 올라오기도 한다). 마감에 우리가 끊은 것이면 원문과 상관없이 closed(시간 모자람)로.
    if (fired && !(e instanceof Cafe24DeadlinePassed)) throw new Cafe24DeadlinePassed(e);
    throw e;
  } finally {
    clearTimeout(timer);
    client.close();
  }
}

/**
 * 여러 파일을 한 FTP 세션으로 올린다(머리글). 돌려주는 순서는 items 순서 그대로.
 * 잠깐 끊긴 오류면 아직 못 올린 파일만 새 세션으로 한 번 더 — deadline 이 있으면 그때까지 RETRY_MIN_LEFT_MS 가 남을 때만.
 * 실패하면 Cafe24UploadError(시도마다의 짧은 코드), .env 설정이 빠졌으면 올리기 전에 바로 던진다(코드 env).
 */
export async function uploadManyToCafe24(items: UploadItem[], opts: UploadManyOptions = {}): Promise<UploadResult[]> {
  if (items.length === 0) return [];
  const now = opts.now ?? Date.now;
  // 설정은 올리기 전에 모두 읽는다 — 빠졌으면 파일을 반쯤 올려 두지 않고 바로 멈춘다.
  const access = accessOptions();
  const base = need("CAFE24_PUBLIC_BASE_URL").replace(/\/+$/, "");
  const plan: Planned[] = items.map(({ remotePath, data }) => {
    const full = relPathOf(remotePath); // 홈 기준 상대경로
    const cut = full.lastIndexOf("/");
    return {
      full,
      dir: cut >= 0 ? full.slice(0, cut) : "",
      filename: cut >= 0 ? full.slice(cut + 1) : full,
      data,
    };
  });
  const newClient = opts.newClient ?? ((idleMs: number) => new Client(idleMs));
  const delay = opts.retryDelayMs ?? RETRY_DELAY_MS;
  const results: (UploadResult | undefined)[] = new Array(items.length).fill(undefined);
  const codes: string[] = [];

  for (let attempt = 0; ; attempt++) {
    const left = opts.deadline === undefined ? Infinity : opts.deadline - now();
    const idleMs = Number.isFinite(left) ? Math.min(IDLE_MS, Math.max(IDLE_MIN_MS, Math.floor(left / 2))) : IDLE_MS;
    try {
      await sendOnce(newClient(idleMs), plan, results, base, access, opts.deadline, now);
      return results as UploadResult[];
    } catch (e) {
      const code = ftpErrorCode(e);
      codes.push(code);
      const sent = results.filter(Boolean).length;
      const leftNow = opts.deadline === undefined ? Infinity : opts.deadline - now();
      const again = attempt === 0 && opts.retry !== false && RETRYABLE.has(code) && leftNow - delay >= RETRY_MIN_LEFT_MS;
      // env-ctrl 원문에는 보내려던 명령(PASS 비밀번호)이 들어 있다 — cause 로도 들고 다니지 않는다(누가 통째로 찍어도 안 새게).
      if (!again) throw new Cafe24UploadError(codes, sent, items.length, code === "env-ctrl" ? undefined : e);
      // 코드·개수·남은 시간만 — 원문(주소·포트)은 찍지 않는다.
      console.warn(
        "[cafe24] 올리기 다시 시도",
        code,
        `${sent}/${items.length} 올림`,
        Number.isFinite(leftNow) ? `남음 ${Math.round(leftNow)}ms` : "마감 없음",
      );
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    }
  }
}

/**
 * remotePath는 기준 폴더 아래 상대 경로 (앞 슬래시 없이). 예: "folk/haedal/p1.png"
 * 중간 폴더는 자동으로 만든다. 절대경로(맨 앞 /)를 쓰면 서버 진짜 루트에 생겨 웹에서
 * 안 보이므로, 반드시 FTP 홈(=웹 루트) 기준 상대경로로 올린다.
 * 한 파일짜리 uploadManyToCafe24 — 돌려주는 값은 예전과 같다(실패는 Cafe24UploadError).
 */
export async function uploadToCafe24(remotePath: string, data: Buffer, opts?: UploadManyOptions): Promise<UploadResult> {
  const [result] = await uploadManyToCafe24([{ remotePath, data }], opts);
  return result;
}
