import { NextResponse } from "next/server";
import { callerOf, type Caller } from "@/lib/api-auth";
import { ftpErrorCode, uploadHitDeadline, uploadManyToCafe24 } from "@/lib/cafe24";
import { DEV_ONLY_MESSAGE, isDevUser } from "@/lib/dev-mode";
import { headChartRatio } from "@/lib/family-head";
import {
  OUTFIT_BODIES_JSON,
  OUTFIT_BODY_EXTS,
  acceptOutfitSource,
  bodyChartWho,
  bodyImagePath,
  bodyKey,
  bodyVersion,
  normalizeBodyLibrary,
  outfitFileStem,
  parseOutfitRequest,
  rateCheck,
  type BodyLibrary,
  type MemberOutfit,
  type OutfitRequest,
} from "@/lib/family-outfit";
import { OutfitError, composeWithBody, prepareHead, type HeadPrep } from "@/lib/family-outfit-image";
import {
  REF_TIMEOUT_MS,
  UPLOAD_DEADLINE_MS,
  UPLOAD_MIN_MS,
  UPLOAD_SAFETY_MS,
  stageClock,
  uploadLeft,
} from "@/lib/family-portrait-budget";
import { stretchGoal } from "@/lib/family-stretch";

/*
 * 보통 몇 초(원본·몸 받기 + 합치기 1~2초 + cafe24 한 장)지만 cafe24 가 느린 날을 위해 가족 그림과 같은 60초
 * (배포 Hobby 한도). 올리기는 55초(UPLOAD_DEADLINE_MS)에 끊는다.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 가족 사진관 '옷 갈아입기' — 고정된 가족 한 사람의 머리를 테마 몸에 얹는다(사장님 2026-09-30, 제안서 (B) — lib/family-outfit).
 *
 * **그림 모델·토큰·DB 를 부르지 않는다 — 고객 한 명에 드는 돈 0원.** 몸은 우리가 미리 그려 둔 몸 창고
 * (public/family-outfits/bodies/<테마>/<몸>.webp, 없으면 .png + bodies.json — 이 사이트에서 받는다)에서 가져오고, 머리(얼굴·머리카락)는
 * 원본 그림 픽셀 그대로 얹는다(lib/family-outfit-image). 머리 층은 이 요청 메모리에만 있다 — 로그·응답에 싣지 않는다.
 *
 * POST { memberId, theme, portraitUrl, body, headRatio?, opaque?, age? }
 *   로그인 → (출시 전) 개발자 모드만 → 입력 검사 → 원본 주소 검사(이 회원 폴더의 이 사람 가족 그림만 — api/family/portrait 가
 *   올리는 이름) → 분당 제한·동시 제한(이 인스턴스 메모리) → 원본·몸 창고 목록·몸 그림 받기 → 머리 떼기·몸 맞추기·합치기
 *   → cafe24 한 장(그 회원 폴더) → { url, at, from, v }.
 *   몸 창고에 그 몸이 없으면 404 body-missing — 화면은 그 사람만 평소 옷으로 두고 넘어간다.
 * 한 번 만든 옷은 화면이 사람마다 기억한다(member.outfits — from 이 지금 원본이고 v 가 지금 몸 판이면 다시 부르지 않는다).
 */

/**
 * 모든 회원에게 연다(사장님 2026-09-30 "fe 만 되는게 아니라 모든 애들 맞춤으로") — 손님마다 자기 가족 머리로 합치고 AI·쿠키가 없어 0원.
 * 다시 fe 만 보게 하려면 false 로(화면 쪽 가림은 family/page.tsx·page.tsx 의 옷 갈아입기 줄).
 */
const OUTFIT_RELEASED = true;

const MAX_BODY_BYTES = 4 * 1024;
/** 원본 그림 받기 상한 — 가족 그림은 보통 150KB 안팎(가로 720 팔레트 PNG) */
const SOURCE_MAX_BYTES = 5 * 1024 * 1024;
/** 몸 창고 몸 그림 상한 */
const BODY_MAX_BYTES = 12 * 1024 * 1024;
/** bodies.json 상한 */
const LIBRARY_MAX_BYTES = 256 * 1024;
/** 한 회원이 이 인스턴스에서 동시에 입히는 수(화면은 두 사람씩 부른다) */
const OUTFIT_MAX_INFLIGHT = 3;
/** 한 회원이 1분에 부를 수 있는 수(가족 8명 × 테마 몇 개를 바로바로 눌러도 넉넉하게) */
const OUTFIT_PER_MINUTE = 40;

const PROD = process.env.NODE_ENV === "production";
/** 몸 창고 목록·몸 그림 기억 시간 — 배포에서는 길게(창고는 배포로만 바뀐다), 개발 중에는 짧게(창고를 채우는 중이라) */
const LIBRARY_TTL_MS = PROD ? 5 * 60_000 : 15_000;
const LIBRARY_FAIL_TTL_MS = 15_000;
const BODY_TTL_MS = PROD ? 30 * 60_000 : 15_000;
const BODY_CACHE_MAX = 16;

const inflight = new Map<string, number>();
const recent = new Map<string, number[]>();
let libraryCache: { origin: string; at: number; ttl: number; lib: BodyLibrary | null } | null = null;
const bodyCache = new Map<string, { at: number; buf: Buffer }>();

class WorkTimeout extends Error {
  constructor() {
    super("시간 초과");
    this.name = "WorkTimeout";
  }
}

function fail(status: number, error: string, code: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, code, ...(extra ?? {}) }, { status });
}

/** 가족 그림 폴더 — 회원 uid(api/family/portrait folderOf 와 같은 규칙 — 같은 폴더에 올린다) */
function folderOf(caller: Caller): string {
  return caller.uid.toLowerCase().replace(/[^a-f0-9-]/g, "").slice(0, 40) || "member";
}

/** 이 회원의 가족 그림 폴더 주소(api/family/portrait familyUrlPrefix 와 같은 규칙) */
function familyUrlPrefix(folder: string): string | null {
  const base = (process.env.CAFE24_PUBLIC_BASE_URL ?? "").trim().replace(/\/+$/, "");
  if (!/^https:\/\//i.test(base)) return null;
  const dir = (process.env.CAFE24_UPLOAD_DIR ?? "").trim().replace(/^\/+|\/+$/g, "");
  return `${base}/${[dir, "family", folder].filter(Boolean).join("/")}/`;
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new WorkTimeout()), ms);
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

type Fetched = { ok: true; buf: Buffer } | { ok: false; status: number };

/** 받기 — ms 안에, max 바이트까지만(넘으면 끊는다). 못 받으면 status(망 오류·시간 초과는 0). */
async function fetchCapped(url: string, max: number, ms: number): Promise<Fetched> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) return { ok: false, status: res.status };
    if (Number(res.headers.get("content-length") ?? 0) > max || !res.body) return { ok: false, status: 413 };
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) {
        await reader.cancel().catch(() => {});
        return { ok: false, status: 413 };
      }
      chunks.push(value);
    }
    return { ok: true, buf: Buffer.concat(chunks) };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

/** 몸 창고 목록(bodies.json) — 이 사이트에서, 잠깐 기억해 둔다. 못 읽으면 null(짧게 기억). */
async function loadLibrary(origin: string): Promise<BodyLibrary | null> {
  const now = Date.now();
  if (libraryCache && libraryCache.origin === origin && now - libraryCache.at < libraryCache.ttl) return libraryCache.lib;
  const got = await fetchCapped(new URL(OUTFIT_BODIES_JSON, origin).toString(), LIBRARY_MAX_BYTES, REF_TIMEOUT_MS);
  let lib: BodyLibrary | null = null;
  if (got.ok) {
    try {
      lib = normalizeBodyLibrary(JSON.parse(got.buf.toString("utf8")));
    } catch {
      lib = null;
    }
  }
  libraryCache = { origin, at: now, ttl: lib ? LIBRARY_TTL_MS : LIBRARY_FAIL_TTL_MS, lib };
  return lib;
}

/**
 * 몸 그림 — 이 사이트에서, WebP 가 먼저 없으면 PNG(OUTFIT_BODY_EXTS — 몸 판마다 따로 기억). 둘 다 없으면(404) "missing",
 * 못 받으면(망·시간 초과·너무 큼) null.
 */
async function loadBody(origin: string, input: OutfitRequest, version: string): Promise<Buffer | "missing" | null> {
  const key = `${origin}|${bodyKey(input.theme, input.body)}@${version}`;
  const now = Date.now();
  const hit = bodyCache.get(key);
  if (hit && now - hit.at < BODY_TTL_MS) return hit.buf;
  let missing = true;
  for (const ext of OUTFIT_BODY_EXTS) {
    const url = new URL(bodyImagePath(input.theme, input.body, ext), origin).toString();
    const got = await fetchCapped(url, BODY_MAX_BYTES, REF_TIMEOUT_MS);
    if (got.ok) {
      bodyCache.set(key, { at: now, buf: got.buf });
      while (bodyCache.size > BODY_CACHE_MAX) {
        const oldest = bodyCache.keys().next().value;
        if (oldest === undefined) break;
        bodyCache.delete(oldest);
      }
      return got.buf;
    }
    if (got.status !== 404) missing = false;
  }
  return missing ? "missing" : null;
}

/** 분당 제한(이 인스턴스) — 지난 1분 요청 시각만 들고 있다 */
function takeSlot(uid: string, now: number): { ok: boolean; retryAfter: number } {
  const r = rateCheck(recent.get(uid) ?? [], now, OUTFIT_PER_MINUTE, 60_000);
  recent.set(uid, r.kept);
  if (recent.size > 500) {
    for (const [k, v] of recent) if (v.every((t) => now - t >= 60_000)) recent.delete(k);
  }
  return { ok: r.ok, retryAfter: r.retryAfter };
}

/** 오류를 로그용 짧은 글로 */
function brief(e: unknown): string {
  if (e instanceof OutfitError) return `OutfitError ${e.code}${e.detail ? ` ${e.detail}` : ""}`;
  if (e instanceof WorkTimeout) return "시간 초과";
  return e instanceof Error ? e.name : "오류";
}

/* ─────────────────────────────── 경로 ─────────────────────────────── */

export async function POST(request: Request) {
  const startedAt = Date.now();

  // ① 로그인 · 출시 전에는 개발자 모드만(화면에서 가려도 주소를 직접 부를 수 있으니 여기서 막는다)
  const caller = await callerOf(request);
  if (!caller) return fail(401, "로그인이 필요합니다.", "login");
  if (!OUTFIT_RELEASED && !isDevUser(caller.username)) return fail(403, DEV_ONLY_MESSAGE, "dev");

  // ② 입력
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return fail(413, "요청이 너무 커요.", "input");
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "요청 본문이 JSON이 아닙니다.", "input");
  }
  const parsed = parseOutfitRequest(body);
  if (typeof parsed === "string") return fail(400, parsed, "input");
  const input = parsed;

  // 원본 주소 — 이 회원 폴더의, 이 사람을 그린 가족 그림만(요청이 보낸 폴더는 쓰지 않는다)
  const folder = folderOf(caller);
  const prefix = familyUrlPrefix(folder);
  if (!prefix) {
    console.error("[family/outfit] CAFE24_PUBLIC_BASE_URL 이 없거나 https 가 아님 — 옷 그림을 올릴 곳이 없다");
    return fail(503, "옷 갈아입기 준비가 아직 안 됐어요. 관리자에게 알려 주세요.", "setup");
  }
  if (!acceptOutfitSource(input.portraitUrl, prefix, input.memberId)) {
    console.warn("[family/outfit] 원본 주소를 받지 않음", input.memberId, input.theme);
    return fail(400, "이 그림으로는 옷을 갈아입힐 수 없어요. 얼굴을 다시 고정한 뒤 해 주세요.", "source");
  }

  // ③ 몰림 막기(이 인스턴스) — 분당 · 동시
  const slot = takeSlot(caller.uid, startedAt);
  if (!slot.ok) {
    return fail(429, "옷을 너무 자주 갈아입었어요. 잠깐 뒤에 다시 해 주세요.", "rate", { retryAfter: slot.retryAfter });
  }
  const busyNow = inflight.get(caller.uid) ?? 0;
  if (busyNow >= OUTFIT_MAX_INFLIGHT) {
    return fail(429, "옷을 한꺼번에 너무 많이 입히고 있어요. 잠깐만 기다려 주세요.", "busy", { retryAfter: 2 });
  }
  inflight.set(caller.uid, busyNow + 1);
  try {
    return await dress(input, folder, new URL(request.url).origin, startedAt);
  } finally {
    const n = (inflight.get(caller.uid) ?? 1) - 1;
    if (n <= 0) inflight.delete(caller.uid);
    else inflight.set(caller.uid, n);
  }
}

async function dress(input: OutfitRequest, folder: string, origin: string, startedAt: number): Promise<NextResponse> {
  const clock = stageClock(startedAt);
  clock.mark("auth");

  // ④ 원본 · 몸 창고 목록을 나란히 받는다
  const [source, lib] = await Promise.all([
    fetchCapped(input.portraitUrl, SOURCE_MAX_BYTES, REF_TIMEOUT_MS),
    loadLibrary(origin),
  ]);
  if (!lib) {
    console.error("[family/outfit] 몸 창고 목록(bodies.json)을 못 읽음");
    return fail(503, "옷을 아직 준비하고 있어요. 잠시 뒤에 다시 해 주세요.", "library");
  }
  const meta = lib[bodyKey(input.theme, input.body)];
  if (!meta) return fail(404, "이 옷은 아직 준비 중이에요.", "body-missing");
  const version = bodyVersion(meta);
  const bodyImage = await loadBody(origin, input, version);
  if (bodyImage === "missing") return fail(404, "이 옷은 아직 준비 중이에요.", "body-missing");
  if (!bodyImage) return fail(502, "옷 그림을 불러오지 못했어요. 잠시 뒤 다시 해 주세요.", "body-fetch");
  if (!source.ok) return fail(502, "가족 그림을 불러오지 못했어요. 잠시 뒤 다시 해 주세요.", "source-fetch");
  clock.mark("refs");

  // ⑤ 머리 떼기 — 옷을 갈아입힐 수 없는 그림이면 422
  let prep: HeadPrep;
  try {
    const who = bodyChartWho(input.body, input.age);
    prep = await prepareHead(source.buf, {
      headRatio: input.headRatio,
      fallbackRatio: stretchGoal(headChartRatio(who.role, who.age)),
      opaque: input.opaque,
    });
  } catch (e) {
    console.warn("[family/outfit] 머리 떼기 실패", input.memberId, input.theme, brief(e));
    return fail(422, "이 그림은 옷을 갈아입히기 어려워요. 얼굴을 다시 고정한 뒤 해 주세요.", "source");
  }

  // ⑥ 몸 맞추기·합치기
  let composed: Awaited<ReturnType<typeof composeWithBody>>;
  try {
    composed = await composeWithBody(prep, bodyImage, meta);
  } catch (e) {
    console.error("[family/outfit] 합치기 실패", input.memberId, bodyKey(input.theme, input.body), brief(e));
    return fail(500, "옷을 입히지 못했어요. 잠시 뒤 다시 해 주세요.", "compose");
  }
  clock.mark("cutout");
  // 숫자와 갈래만(그림·색·주소는 찍지 않는다)
  console.info(
    "[family/outfit] 합침",
    input.memberId,
    bodyKey(input.theme, input.body),
    prep.neck.method,
    prep.neck.longHair ? "긴 머리" : "짧은 머리",
    `cut ${prep.neck.cut}/${prep.height}`,
    `배율 ${composed.stats.place.scale.toFixed(3)}`,
    `목 ${composed.stats.neckFit.toFixed(2)}`,
    composed.stats.skinShift ? "살색 맞춤" : "살색 그대로",
    `${Math.round(composed.data.length / 1024)}KB`,
  );

  // ⑦ 올리기 — 남은 시간 안에서만. 매번 새 이름(cafe24 는 ?v= 를 무시한다), 끝의 임의 32자로 주소를 못 맞히게.
  let pic: MemberOutfit;
  try {
    const left = uploadLeft(startedAt);
    if (left < UPLOAD_MIN_MS) throw new WorkTimeout();
    const stem = outfitFileStem(folder, input.memberId, input.theme, Date.now(), crypto.randomUUID().replace(/-/g, ""));
    const [up] = await withTimeout(
      uploadManyToCafe24([{ remotePath: `${stem}.${composed.ext}`, data: composed.data }], {
        deadline: startedAt + UPLOAD_DEADLINE_MS,
      }),
      left + UPLOAD_SAFETY_MS,
    );
    pic = { url: up.url, at: new Date().toISOString(), from: input.portraitUrl, v: version };
  } catch (e) {
    const code = e instanceof WorkTimeout ? "deadline" : ftpErrorCode(e);
    const outOfTime = e instanceof WorkTimeout || uploadHitDeadline(e);
    console.error("[family/outfit] 올리기 실패", input.memberId, input.theme, code, clock.summary());
    if (outOfTime) return fail(504, "옷을 입히는 데 너무 오래 걸려서 멈췄어요. 잠시 뒤 다시 해 주세요.", "timeout", { detail: code });
    return fail(502, "옷 그림을 올리지 못했어요. 잠시 뒤 다시 해 주세요.", "upload", { detail: code });
  }
  clock.mark("upload");
  console.info("[family/outfit] 단계 시간", input.memberId, input.theme, clock.summary());

  return NextResponse.json({ ...pic, theme: input.theme, memberId: input.memberId });
}
