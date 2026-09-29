/**
 * 가족 그림(우리 가족 캐릭터) 주소 검사와 받아 오기 — 서버가 **이 회원 폴더의 우리가 올린 파일만** 받게 한다.
 *
 * 왜 있나(2026-09-29): 가족 화면에서 고정한 얼굴(FamilyMember.portrait)을 동화 인물 시트(api/character-sheet)에
 * 참고 그림으로 붙인다(같은 날 오후부터는 쪽 그림 api/illustrate-page 에도 — 잠깐 기억하는 fetchFamilyRefCached). 주소는 브라우저가 보내므로, 서버가 아무 주소나 받아 오면 남의 가족 그림을 끌어오거나
 * 서버가 내부 주소를 대신 두드리는 길(SSRF)이 생긴다. 그래서
 *   · https + cafe24 공개 주소 + family/<이 회원 uid 폴더>/ 로 시작하고,
 *   · 그 뒤는 우리가 지은 파일 이름(<사람 id>-<시각>-<32자리 16진수>-ref.jpg)과 글자 하나까지 같아야 하고,
 *   · 받을 때도 넘겨주기(redirect)를 따라가지 않고, 시간·크기를 자르고, JPEG 인지 첫 바이트로 확인한다.
 *
 * 규칙 원본은 api/family/portrait 의 folderOf · familyUrlPrefix · acceptStyleRef 다(그 파일이 올리는 쪽).
 * 그 라우트는 지금 '사진으로 할게요' 작업이 커밋 전이라 손대지 않았다 — 그 작업이 들어간 뒤 이 파일을 쓰게 옮긴다.
 * 여기 규칙은 참고용 -ref.jpg 하나만 받는다(화면용 투명 PNG 는 투명 칸이 검정·바둑판으로 읽힐 수 있다).
 *
 * 브라우저·Supabase·Next 없이 돌아간다 — node --test 로 시험한다(family-ref.test.ts).
 */

/** 가족 그림 폴더 — 회원 uid 에서 uuid 글자만(api/family/portrait folderOf 와 같다). */
export function familyFolderOf(uid: string): string {
  return uid.toLowerCase().replace(/[^a-f0-9-]/g, "").slice(0, 40) || "member";
}

/** 주소 규칙에 쓰는 설정 두 칸 — process.env 를 그대로 넘겨도 된다. */
export type FamilyRefEnv = {
  CAFE24_PUBLIC_BASE_URL?: string;
  CAFE24_UPLOAD_DIR?: string;
  [key: string]: string | undefined;
};

/**
 * 이 회원의 가족 그림 폴더 주소 — cafe24.ts 가 올린 파일 주소를 만드는 규칙과 같다:
 *   CAFE24_PUBLIC_BASE_URL + '/' + CAFE24_UPLOAD_DIR + '/family/<폴더>/'
 * 설정이 없거나 https 가 아니면 null — 그러면 고정 얼굴을 하나도 받지 않고 예전처럼 글로만 그린다.
 */
export function familyUrlPrefix(env: FamilyRefEnv, folder: string): string | null {
  const base = (env.CAFE24_PUBLIC_BASE_URL ?? "").trim().replace(/\/+$/, "");
  if (!/^https:\/\/[^/?#@\s]+(?:\/[^?#@\s]*)?$/i.test(base)) return null;
  if (!folder || !/^[a-z0-9-]{1,40}$/.test(folder)) return null;
  const dir = (env.CAFE24_UPLOAD_DIR ?? "").trim().replace(/^\/+|\/+$/g, "");
  return `${base}/${[dir, "family", folder].filter(Boolean).join("/")}/`;
}

/** 가족 그림 주소 최대 길이 — 저장할 때(lib/family normalizePortrait)와 같다. */
export const FAMILY_REF_MAX_LENGTH = 500;

/** 폴더 뒤 파일 이름 — 참고용 JPEG 만. 슬래시·물음표·% 가 낄 자리가 없다(경로 넘기·쿼리 막기). */
const REF_FILE = /^([a-z0-9-]{1,40})-(\d{10,16})-[a-f0-9]{32}-ref\.jpg$/;

/**
 * 가족 그림 참고 주소를 받을지 — 받으면 그 주소, 아니면 null.
 * memberId 를 주면 파일 이름의 사람 id 도 같아야 한다(엄마 자리에 아빠 그림을 끼우지 못하게).
 */
export function acceptFamilyRef(
  raw: unknown,
  prefix: string | null,
  opts: { memberId?: string } = {},
): string | null {
  if (typeof raw !== "string" || !prefix) return null;
  if (!raw || raw.length > FAMILY_REF_MAX_LENGTH) return null;
  if (!/^https:\/\//.test(raw) || /[?#\s\\]/.test(raw)) return null;
  if (!raw.startsWith(prefix)) return null;
  const m = REF_FILE.exec(raw.slice(prefix.length));
  if (!m) return null;
  if (opts.memberId !== undefined && m[1] !== opts.memberId) return null;
  return raw;
}

/**
 * 검사를 통과한 주소(acceptFamilyRef)의 사람 id — 파일 이름 앞머리(mom·dad·child·m-…). 규칙에 안 맞으면 null.
 * 인물 이름('엄마 (지은)'·'어머니' …)이 아니라 이 id 로 엄마·아빠 줄을 고른다(lib/sheet-prompt fixedAdultNotes).
 */
export function familyRefMemberId(url: string, prefix: string | null): string | null {
  if (!prefix || !url.startsWith(prefix)) return null;
  return REF_FILE.exec(url.slice(prefix.length))?.[1] ?? null;
}

/** 받아 온 참고 그림 — lib/gemini GeneratedImage 와 같은 모양(sharp 를 부르지 않으려고 여기 따로 적는다). */
export type FamilyRefImage = { mimeType: string; data: string };

/** 참고 그림 받기 제한 시간 — 넘으면 그 사람은 글로만 그린다(api/family/portrait REF_TIMEOUT_MS 와 같다). */
export const FAMILY_REF_TIMEOUT_MS = 6_000;
/** 참고 그림 최대 크기 — 1024px JPEG(품질 85)는 보통 100~300KB 다. */
export const FAMILY_REF_MAX_BYTES = 2 * 1024 * 1024;

function isJpeg(buf: Uint8Array): boolean {
  return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

/** 본문을 max 바이트까지만 읽는다 — 넘으면 null(끝까지 받지 않고 끊는다). */
async function readCapped(res: Response, max: number): Promise<Uint8Array | null> {
  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    return buf.byteLength > max ? null : buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/**
 * 검사를 통과한 가족 그림 주소(acceptFamilyRef)를 받아 온다. 못 받으면 null — 절대 던지지 않는다.
 * 넘겨주기를 따라가지 않고(redirect: error), 제한 시간이 지나면 끊고, 크기를 자르고, JPEG 가 아니면 버린다.
 * lib/gemini loadReferenceImage 는 아무 주소나 받고 시간 제한도 없어서 여기엔 쓰지 않는다.
 */
export async function fetchFamilyRef(
  url: string,
  opts: { timeoutMs?: number; maxBytes?: number; fetchImpl?: typeof fetch } = {},
): Promise<FamilyRefImage | null> {
  const { timeoutMs = FAMILY_REF_TIMEOUT_MS, maxBytes = FAMILY_REF_MAX_BYTES, fetchImpl = fetch } = opts;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { redirect: "error", signal: ac.signal });
    if (!res.ok) return null;
    const declared = Number(res.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > maxBytes) return null;
    const buf = await readCapped(res, maxBytes);
    if (!buf || !isJpeg(buf)) return null;
    return { mimeType: "image/jpeg", data: Buffer.from(buf).toString("base64") };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/*
 * 받아 온 가족 그림 잠깐 기억(2026-09-29 얼굴 고정 3단계) — 쪽 그림 서버가 쪽마다(8~12번) 같은 얼굴을 다시 받지 않게.
 * 안전한 까닭: 가족 그림은 올릴 때마다 새 이름(<사람 id>-<시각>-<임의 32자>)이고 덮어쓰지 않는다 — 주소가 같으면 그림도 같다.
 * 부르는 쪽은 **먼저 acceptFamilyRef 로 이 회원 폴더인지 검사**한 뒤에만 이 함수를 부른다 — 그래서 남의 주소로는
 * 기억에 닿지도 못한다. 성공만 기억한다(실패는 다음 쪽에서 다시 받아 본다). 서버 한 대 안에서만 산다.
 */
const REF_CACHE_MAX = 24;
const REF_CACHE_TTL_MS = 15 * 60 * 1000;
const refCache = new Map<string, { at: number; image: FamilyRefImage }>();
/** 같은 주소를 동시에 받는 요청(쪽 세 장이 한꺼번에)은 한 번만 받는다. */
const refInFlight = new Map<string, Promise<FamilyRefImage | null>>();

/** fetchFamilyRef + 잠깐 기억. 못 받으면 null — 절대 던지지 않는다. */
export async function fetchFamilyRefCached(
  url: string,
  opts: { timeoutMs?: number; maxBytes?: number; fetchImpl?: typeof fetch; now?: () => number } = {},
): Promise<FamilyRefImage | null> {
  const now = opts.now ?? Date.now;
  const hit = refCache.get(url);
  if (hit && now() - hit.at < REF_CACHE_TTL_MS) {
    // 최근에 쓴 것을 뒤로 — 넘치면 오래 안 쓴 것부터 뺀다.
    refCache.delete(url);
    refCache.set(url, hit);
    return hit.image;
  }
  if (hit) refCache.delete(url);
  const pending = refInFlight.get(url);
  if (pending) return pending;
  const job = fetchFamilyRef(url, opts)
    .then((image) => {
      if (image) {
        refCache.set(url, { at: now(), image });
        while (refCache.size > REF_CACHE_MAX) {
          const oldest = refCache.keys().next().value;
          if (oldest === undefined) break;
          refCache.delete(oldest);
        }
      }
      return image;
    })
    .finally(() => refInFlight.delete(url));
  refInFlight.set(url, job);
  return job;
}

/** 시험에서만 쓴다 — 기억을 비운다. */
export function clearFamilyRefCacheForTests(): void {
  refCache.clear();
  refInFlight.clear();
}
