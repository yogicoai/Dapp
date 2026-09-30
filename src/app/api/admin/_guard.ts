import { NextResponse } from "next/server";
import { callerOf, type Caller } from "@/lib/api-auth";
import { httpStatusForDb } from "@/lib/admin";
import { isSchemaMissing } from "@/lib/admin-console";

/**
 * 관리실 서버 경로의 문지기 — /api/admin/* 는 전부 이 함수로 감싸서 내보낸다.
 *
 * 왜 감싸기인가: 이 앱은 로그인 세션을 브라우저에 두어서(쿠키 아님) 서버 페이지·미들웨어는
 * 누가 왔는지 모른다. 서버가 신원을 아는 길은 요청의 Bearer 토큰(callerOf)뿐이다.
 * 경로마다 "맨 앞에서 마스터 확인"을 손으로 적으면 언젠가 하나를 빠뜨린다 — 그 경로 하나로
 * 전 회원의 결제·원고가 열린다. 그래서 확인을 통과해야만 본문 함수가 불리게 모양으로 묶는다.
 *
 *  · 로그인 안 함 → 401, 마스터 아님 → 403 (DB 의 profiles.is_master 로 판단한다)
 *  · 통과해도 DB 는 마스터의 토큰(caller.db)으로 부른다 — master_* 함수의 is_master_user()
 *    와 RLS 마스터 열람 정책이 한 번 더 막는다. 서비스 키는 쓰지 않는다.
 *  · 응답은 전부 Cache-Control: no-store — 고객 결제·원고가 브라우저·CDN 캐시에 남지 않게.
 */
export type AdminHandler = (caller: Caller, request: Request) => Promise<Response>;

const NO_STORE = { "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex" };

export function json(body: unknown, status = 200): Response {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function fail(error: string, status: number, extra: Record<string, unknown> = {}): Response {
  return json({ error, ...extra }, status);
}

/** supabase-js 오류를 그대로 화면에 보낸다 — DB 함수의 한국어 거절 문구를 마스터가 읽어야 한다. */
export function dbFail(
  err: { code?: string | null; message?: string | null } | null | undefined,
  extra: Record<string, unknown> = {},
): Response {
  const message = String(err?.message ?? "").trim() || "데이터베이스 오류가 났어요.";
  return fail(message, httpStatusForDb(err?.code), { code: err?.code ?? null, ...extra });
}

export function masterOnly(handler: AdminHandler) {
  return async function guarded(request: Request): Promise<Response> {
    const caller = await callerOf(request);
    if (!caller) return fail("로그인이 필요합니다.", 401);
    if (!caller.isMaster) return fail("마스터만 쓸 수 있어요.", 403);
    try {
      return await handler(caller, request);
    } catch (e) {
      console.error("[admin]", new URL(request.url).pathname, e);
      return fail("관리실 서버 오류가 났어요. 잠시 뒤 다시 해 주세요.", 500);
    }
  };
}

/**
 * 표·함수가 아직 없으면(사장님이 새 SQL 을 아직 안 돌렸으면) 500 대신 200 + { schemaReady:false, ...빈값 }.
 * 관리자 페이지가 "데이터베이스 준비 전이에요"라고 말하게 — 빨간 오류 화면으로 겁주지 않는다.
 * 그 밖의 오류는 dbFail 그대로(DB 의 한국어 거절 문구를 보여 준다).
 */
export function dbFailOrNotReady(
  err: { code?: string | null; message?: string | null } | null | undefined,
  notReady: Record<string, unknown>,
): Response {
  if (isSchemaMissing(err)) return json({ ...notReady, schemaReady: false });
  return dbFail(err);
}

/**
 * 본문이 너무 큰가(Content-Length 로 먼저 본다). 약관 본문처럼 긴 글을 받는 경로가
 * 본문을 다 읽기 전에 거절하려고 쓴다. 길이 머리글이 없으면 false — 그때는 파서가 길이를 다시 본다.
 */
export function bodyTooLarge(request: Request, maxBytes: number): boolean {
  const n = Number(request.headers.get("content-length") ?? "");
  return Number.isFinite(n) && n > maxBytes;
}

/** POST 본문 — JSON 객체가 아니면 null. */
export async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await request.json();
    return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
