/**
 * 혜택 코드 — 손님 화면이 쓰는 넣기·읽기(본인 줄만 보인다, RLS). 셈과 글은 lib/promo-codes.
 *  · redeemPromoCode — 코드 넣기(DB 함수 redeem_promo_code — 진짜 문지기)
 *  · loadMyPromos — 내가 받은 혜택(설정 화면)
 *  · loadMyLibraryPass — 지금 열린 전체 듣기가 있나(책장 단계를 가족 패스로)
 *  · loadCreditBudget — 크레딧으로 만든 책을 마무리하는 중인가(만들기 화면 잠금)
 *  · 링크로 왔는데 로그인 전 — 코드를 이 기기에 잠깐 두고 로그인 뒤 이어서 넣는다
 * 표·함수가 없거나(SQL 전) 못 읽으면 빈 값 — 화면은 지금처럼 돈다.
 */
import {
  libraryPassUntil,
  myPromosOf,
  normalizePromoCode,
  PENDING_CODE_KEY,
  pendingCodeOf,
  pendingCodeRecord,
  redeemReplyOf,
  type MyPromo,
  type RedeemReply,
} from "./promo-codes";
import { currentUid, getSupabase } from "./supabase";

export type RedeemResult = RedeemReply | { ok: false; reason: "login" | "error"; message: string };

export async function redeemPromoCode(raw: string): Promise<RedeemResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, reason: "error", message: "서버(Supabase)가 설정되지 않았어요." };
  if (!(await currentUid())) return { ok: false, reason: "login", message: "로그인한 뒤에 넣을 수 있어요." };
  try {
    const { data, error } = await sb.rpc("redeem_promo_code", { p_code: normalizePromoCode(raw) });
    if (error) {
      const missing = ["PGRST202", "42883"].includes(String(error.code ?? ""));
      return { ok: false, reason: "error", message: missing ? "혜택 코드는 곧 열려요." : "코드를 넣지 못했어요. 잠시 뒤 다시 해 주세요." };
    }
    const reply = redeemReplyOf(data);
    if (!reply) return { ok: false, reason: "error", message: "코드를 넣지 못했어요. 잠시 뒤 다시 해 주세요." };
    if (reply.ok) forgetMyPromos();
    return reply;
  } catch {
    return { ok: false, reason: "error", message: "코드를 넣지 못했어요. 인터넷 연결을 확인해 주세요." };
  }
}

let cached: { uid: string; rows: Promise<unknown[]> } | null = null;

function myRows(uid: string): Promise<unknown[]> {
  if (cached && cached.uid === uid) return cached.rows;
  const rows = (async (): Promise<unknown[]> => {
    const sb = getSupabase();
    if (!sb) return [];
    const { data, error } = await sb
      .from("promo_redemptions")
      .select("label,book_credits,draw_credits,library_until,at")
      .eq("owner", uid)
      .order("at", { ascending: false })
      .limit(50);
    return error || !Array.isArray(data) ? [] : data;
  })().catch(() => []);
  cached = { uid, rows };
  return rows;
}

/** 코드를 넣은 뒤 — 다음 읽기는 새로 */
export function forgetMyPromos(): void {
  cached = null;
}

export async function loadMyPromos(): Promise<MyPromo[]> {
  const uid = await currentUid();
  return uid ? myPromosOf(await myRows(uid)) : [];
}

/** 지금 열린 전체 듣기(요기보 회원 혜택 등)가 있나 — 책장·동화 보기가 단계를 '가족 패스'로 본다 */
export async function loadMyLibraryPass(uid: string): Promise<boolean> {
  return libraryPassUntil(await myRows(uid), Date.now()) !== null;
}

export async function loadMyLibraryPassUntil(uid: string): Promise<string | null> {
  return libraryPassUntil(await myRows(uid), Date.now());
}

export type CreditBudget = { outlinesLeft: number; imagesLeft: number; storyLive: boolean };

/** 크레딧으로 만드는 사람의 한도(credit_ai_budget 본인 줄) — 없으면 0 */
export async function loadCreditBudget(): Promise<CreditBudget> {
  const empty: CreditBudget = { outlinesLeft: 0, imagesLeft: 0, storyLive: false };
  const uid = await currentUid();
  const sb = getSupabase();
  if (!uid || !sb) return empty;
  try {
    const { data, error } = await sb
      .from("credit_ai_budget")
      .select("outlines_left,images_left,story_until")
      .eq("owner", uid)
      .maybeSingle();
    if (error || !data) return empty;
    const r = data as { outlines_left?: unknown; images_left?: unknown; story_until?: unknown };
    const until = typeof r.story_until === "string" ? Date.parse(r.story_until) : Number.NaN;
    return {
      outlinesLeft: Math.max(0, Number(r.outlines_left) || 0),
      imagesLeft: Math.max(0, Number(r.images_left) || 0),
      storyLive: Number.isFinite(until) && until > Date.now(),
    };
  } catch {
    return empty;
  }
}

/* ── 링크로 왔는데 로그인 전 ─────────────────────────────────────────────── */

export function savePendingCode(code: string): void {
  try {
    localStorage.setItem(PENDING_CODE_KEY, pendingCodeRecord(normalizePromoCode(code), Date.now()));
  } catch {
    /* 저장이 막힌 창(사생활 보호 등) — 로그인 뒤 링크를 한 번 더 누르면 된다 */
  }
}

export function clearPendingCode(): void {
  try {
    localStorage.removeItem(PENDING_CODE_KEY);
  } catch {
    /* 위와 같다 */
  }
}

/** 로그인 뒤 갈 곳 — 넣다 만 코드가 있으면 그 링크 화면(로그인 화면이 부른다) */
export function pendingPromoPath(): string | null {
  try {
    const code = pendingCodeOf(localStorage.getItem(PENDING_CODE_KEY), Date.now());
    return code ? `/code/${code}` : null;
  } catch {
    return null;
  }
}
