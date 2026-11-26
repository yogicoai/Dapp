/**
 * 구글 플레이 구매를 확인하고 DB 에 적는 순서(서버 전용) — 경로 api/billing/google/verify · sync 가 부른다.
 *
 *   ① 구글에 직접 묻는다(앱이 보낸 토큰은 꾸밀 수 있다) → ② DB 함수(google_play_apply_*)가 토큰을 그 회원에게 묶고
 *      요금제·이번 달 몫·스타트팩 크레딧·결제 기록을 맞춘다 → ③ 이용권을 줬으면 구글에 확정(acknowledge, 3일 안).
 *   확정을 못 했으면 다음 동기화가 다시 한다(DB 가 acknowledged 를 기억한다).
 *
 * DB 는 부른 회원의 로그인(caller.db) 그대로 부른다 — 서비스 키는 쓰지 않는다. 함수는 서버 열쇠(deps.key)가 맞아야 돈다.
 * 구매 토큰·열쇠는 로그·응답에 남기지 않는다.
 *
 * 순수한 판단(needsCheck · summarize)과 순서는 시험(google-play-server.test.ts)이 가짜 구글·DB 로 돌려 본다.
 * 상대 경로만 쓴다 — node --test 가 @/ 별칭을 못 읽는다.
 */
import {
  GooglePlayError,
  acknowledgeProduct,
  acknowledgeSubscription,
  getProductPurchase,
  getSubscriptionPurchase,
  googlePlayProduct,
  isPurchaseToken,
  isSellingNow,
  passSlice,
  readProduct,
  readSubscription,
  type GooglePlayClient,
} from "./google-play.ts";

/** 관리실 요금제 값 가운데 지급에 쓰는 것(lib/plans PlanTerms 와 같은 모양의 일부) */
export type BillingTerms = {
  monthly: { priceWon: number; booksPerMonth: number; drawTokensPerMonth: number; drawTokensFirstMonth: number };
  yearly: { priceWon: number; booksPerMonth: number; drawTokensPerMonth: number; drawTokensFirstMonth: number };
  starter: { priceWon: number; books: number; familyCharacters: number };
};

export type BillingDeps = {
  gp: GooglePlayClient;
  /** DB 함수에 내는 서버 열쇠(lib/google-play billingServerKey) */
  key: string;
  /** 요금제 값 — 지급할 때만 읽는다(동기화만 하고 지급이 없으면 안 읽는다) */
  terms: () => Promise<BillingTerms>;
  now: () => number;
};

/** DB 를 부르는 모양 — supabase-js 의 rpc 만 쓴다 */
export type BillingDb = {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
};

export type VerifyCode = "invalid" | "mismatch" | "not-paid" | "pending" | "other-owner" | "not-ready" | "google" | "db";

export const VERIFY_MESSAGE: Readonly<Record<VerifyCode, string>> = {
  invalid: "결제 정보를 확인하지 못했어요.",
  mismatch: "고른 상품과 결제한 상품이 달라요.",
  "not-paid": "결제가 끝나지 않았어요.",
  pending: "결제를 기다리고 있어요. 결제가 끝나면 바로 열려요.",
  "other-owner": "이 결제는 다른 계정에서 이미 쓰고 있어요.",
  "not-ready": "결제 확인을 준비하고 있어요. 잠시 뒤에 다시 해 주세요.",
  google: "구글 결제 확인이 잠시 안 돼요. 잠시 뒤에 다시 해 주세요.",
  db: "결제는 확인했지만 이용권을 적지 못했어요. 잠시 뒤에 이 화면을 다시 열어 주세요.",
};

export type VerifyOk = {
  ok: true;
  productId: string;
  /** 지금 요금제(member_plans.plan) · 끝나는 때 */
  plan: string | null;
  endsAt: string | null;
  /** 이번 확인으로 이번 달 몫·스타트팩을 새로 줬나 */
  granted: boolean;
};
export type VerifyFail = { ok: false; status: number; code: VerifyCode; error: string };
export type VerifyResult = VerifyOk | VerifyFail;

function fail(status: number, code: VerifyCode): VerifyFail {
  return { ok: false, status, code, error: VERIFY_MESSAGE[code] };
}

/** 구글 API 오류 → 답. 토큰이 없거나 지난 것(400·404·410)은 '확인 못함', 권한(401·403)은 준비 전, 그 밖은 잠시 뒤 */
function googleFail(e: unknown): VerifyFail {
  const status = e instanceof GooglePlayError ? e.status : 0;
  if (status === 400 || status === 404 || status === 410) return fail(400, "invalid");
  if (status === 401 || status === 403) {
    console.error("[google-play] 구글 권한 오류", status);
    return fail(503, "not-ready");
  }
  console.error("[google-play] 구글 확인 실패", status || (e instanceof Error ? e.name : "unknown"));
  return fail(502, "google");
}

/** DB 오류 → 답. 함수가 없거나(SQL 전) 열쇠가 안 맞으면(42501) 준비 전 */
function dbFail(error: { code?: string; message?: string }): VerifyFail {
  console.error("[google-play] DB 오류", error.code ?? "", (error.message ?? "").slice(0, 120));
  if (error.code === "42501" || error.code === "PGRST202" || error.code === "42883" || error.code === "PGRST205") {
    return fail(503, "not-ready");
  }
  return fail(500, "db");
}

const clamp = (n: number, lo: number, hi: number) => (Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : lo);
const ORDER_RE = /^[A-Za-z0-9._:-]{1,200}$/;
const orderOrNull = (v: string | null) => (v && ORDER_RE.test(v) ? v : null);

/** 확정 — 실패해도 이용권은 이미 줬다. 다음 동기화가 다시 한다(3일 안). */
async function acknowledgeSafely(run: () => Promise<unknown>, db: BillingDb, key: string, token: string): Promise<boolean> {
  try {
    await run();
  } catch (e) {
    console.error("[google-play] 확정 실패 — 다음 동기화가 다시 해요", e instanceof GooglePlayError ? e.status : "");
    return false;
  }
  const { error } = await db.rpc("google_play_mark_ack", { p_key: key, p_token: token });
  if (error) console.error("[google-play] 확정 표시 실패", error.code ?? "");
  return true;
}

type ApplyRow = { ok?: boolean; reason?: string; plan?: string | null; ends_at?: string | null; granted?: boolean };

async function applySubscription(db: BillingDb, productId: string, plan: "monthly" | "yearly", token: string, deps: BillingDeps): Promise<VerifyResult> {
  let raw;
  try {
    raw = await getSubscriptionPurchase(deps.gp, token);
  } catch (e) {
    return googleFail(e);
  }
  const now = deps.now();
  const s = readSubscription(raw, now);
  if (s.productId !== productId) return fail(400, "mismatch");
  const terms = (await deps.terms())[plan];
  const orderId = orderOrNull(s.orderId);
  const slice = s.paid && s.expiresAt ? passSlice({ plan, expiresAt: s.expiresAt, orderId, token, now }) : null;
  const { data, error } = await db.rpc("google_play_apply_subscription", {
    p_key: deps.key,
    p_token: token,
    p_product: productId,
    p_state: s.state,
    p_entitled: s.entitled,
    p_paid: s.paid,
    p_expires_at: s.expiresAt,
    p_auto_renew: s.autoRenew,
    p_order_id: orderId,
    p_acknowledged: s.acknowledged,
    p_test: s.test,
    p_linked_token: isPurchaseToken(s.linkedPurchaseToken) ? s.linkedPurchaseToken : null,
    p_amount: clamp(s.priceWon ?? terms.priceWon, 0, 1_000_000),
    p_slice_ref: slice?.ref ?? null,
    p_slice_start: slice?.start ?? null,
    p_slice_end: slice?.end ?? null,
    p_books: clamp(terms.booksPerMonth, 0, 20),
    p_draws: clamp(terms.drawTokensPerMonth, 0, 20),
    p_draws_first: clamp(terms.drawTokensFirstMonth, 0, 20),
  });
  if (error) return dbFail(error);
  const r = (data ?? {}) as ApplyRow;
  if (r.ok === false) return fail(409, "other-owner");
  if (s.entitled && !s.acknowledged) {
    await acknowledgeSafely(() => acknowledgeSubscription(deps.gp, productId, token), db, deps.key, token);
  }
  if (!s.entitled) return fail(409, s.state === "SUBSCRIPTION_STATE_PENDING" ? "pending" : "not-paid");
  return { ok: true, productId, plan: r.plan ?? null, endsAt: r.ends_at ?? null, granted: r.granted === true };
}

async function applyStarter(db: BillingDb, productId: string, token: string, deps: BillingDeps): Promise<VerifyResult> {
  let raw;
  try {
    raw = await getProductPurchase(deps.gp, productId, token);
  } catch (e) {
    return googleFail(e);
  }
  const p = readProduct(raw);
  const starter = (await deps.terms()).starter;
  const { data, error } = await db.rpc("google_play_apply_product", {
    p_key: deps.key,
    p_token: token,
    p_product: productId,
    p_paid: p.paid,
    p_pending: p.pending,
    p_order_id: orderOrNull(p.orderId),
    p_acknowledged: p.acknowledged,
    p_test: p.test,
    p_amount: clamp(starter.priceWon, 0, 1_000_000),
    p_books: clamp(starter.books, 0, 10),
    p_draws: clamp(starter.familyCharacters, 0, 10),
  });
  if (error) return dbFail(error);
  const r = (data ?? {}) as ApplyRow;
  if (r.ok === false) return fail(409, "other-owner");
  // 스타트팩은 한 번만 사는 상품 — 소비하지 않고 확정만 한다(그래서 같은 구글 계정은 다시 살 수 없다)
  if (p.paid && !p.acknowledged) {
    await acknowledgeSafely(() => acknowledgeProduct(deps.gp, productId, token), db, deps.key, token);
  }
  if (!p.paid) return fail(409, p.pending ? "pending" : "not-paid");
  return { ok: true, productId, plan: r.plan ?? null, endsAt: r.ends_at ?? null, granted: r.granted === true };
}

/** 구매 하나 확인 — 앱이 결제 직후 보낸 토큰, 또는 동기화가 다시 묻는 토큰 */
export async function verifyPurchase(db: BillingDb, productId: unknown, token: unknown, deps: BillingDeps): Promise<VerifyResult> {
  const product = googlePlayProduct(productId);
  if (!product || !isSellingNow(product.productId) || !isPurchaseToken(token)) return fail(400, "invalid");
  if (product.kind === "subscription" && product.plan) return applySubscription(db, product.productId, product.plan, token, deps);
  if (product.kind === "starter") return applyStarter(db, product.productId, token, deps);
  return fail(400, "invalid");
}

/* ─────────────────────────── 동기화 ─────────────────────────── */

/** google_play_my_purchases 한 줄 */
export type PurchaseRow = {
  token: string;
  product_id: string;
  kind: "subscription" | "product";
  state: string;
  expires_at: string | null;
  auto_renew: boolean | null;
  acknowledged: boolean;
  granted: boolean;
  test: boolean;
  checked_at: string;
};

/** 다시 물을 때 — 30분 지났거나, 확정 전이거나, 만료가 지났는데 상태가 아직 살아 있을 때(갱신·만료를 맞춘다) */
export const SYNC_STALE_MS = 30 * 60_000;
const SYNC_EXPIRED_RECHECK_MS = 2 * 60_000;
/** 한 번 동기화에 구글에 묻는 최대 수 */
export const SYNC_MAX_CHECKS = 6;

const LIVE_STATES = new Set(["SUBSCRIPTION_STATE_ACTIVE", "SUBSCRIPTION_STATE_IN_GRACE_PERIOD", "SUBSCRIPTION_STATE_CANCELED"]);

export function needsCheck(r: PurchaseRow, now: number): boolean {
  if (!isSellingNow(r.product_id)) return false;
  const age = now - Date.parse(r.checked_at);
  if (r.kind === "product") {
    if (r.state === "cancelled") return false;
    return !r.granted || !r.acknowledged || (r.state === "pending" && age > SYNC_EXPIRED_RECHECK_MS);
  }
  if (r.state === "SUBSCRIPTION_STATE_EXPIRED") return false; // 끝난 토큰은 되살아나지 않는다(다시 구독하면 새 토큰)
  if (!r.acknowledged) return true;
  const expires = r.expires_at ? Date.parse(r.expires_at) : NaN;
  if (Number.isFinite(expires) && expires <= now) return !(age < SYNC_EXPIRED_RECHECK_MS);
  return !(age < SYNC_STALE_MS);
}

export type SyncSummary = {
  /** 살아 있는 구독(가장 늦게 끝나는 것) — 화면이 '이용 중 · 구독 관리'를 보인다 */
  active: { productId: string; expiresAt: string; autoRenew: boolean; canceled: boolean } | null;
  /** 스타트팩을 산 적이 있나(한 번만 사는 상품) */
  starterOwned: boolean;
};

export function summarize(rows: readonly PurchaseRow[], now: number): SyncSummary {
  let active: SyncSummary["active"] = null;
  for (const r of rows) {
    if (r.kind !== "subscription" || !LIVE_STATES.has(r.state) || !r.expires_at) continue;
    if (Date.parse(r.expires_at) <= now) continue;
    if (!active || Date.parse(r.expires_at) > Date.parse(active.expiresAt)) {
      active = {
        productId: r.product_id,
        expiresAt: r.expires_at,
        autoRenew: r.auto_renew === true,
        canceled: r.state === "SUBSCRIPTION_STATE_CANCELED",
      };
    }
  }
  const starterOwned = rows.some((r) => r.product_id === "starter_pack" && r.granted);
  return { active, starterOwned };
}

function rowsOf(data: unknown): PurchaseRow[] {
  if (!Array.isArray(data)) return [];
  return data.filter(
    (r): r is PurchaseRow =>
      !!r && typeof r === "object" && typeof (r as PurchaseRow).token === "string" && typeof (r as PurchaseRow).product_id === "string",
  );
}

async function myPurchases(db: BillingDb, key: string): Promise<PurchaseRow[] | VerifyFail> {
  const { data, error } = await db.rpc("google_play_my_purchases", { p_key: key });
  if (error) return dbFail(error);
  return rowsOf(data);
}

export type Offered = { productId: string; purchaseToken: string };

/** 앱이 보낸 '내 구매'(Digital Goods listPurchases) 모양 거르기 — 파는 상품·토큰 모양만, 10개까지 */
export function parseOffered(body: unknown): Offered[] {
  const list = body && typeof body === "object" ? (body as { purchases?: unknown }).purchases : null;
  if (!Array.isArray(list)) return [];
  const out: Offered[] = [];
  for (const p of list.slice(0, 10)) {
    const o = p && typeof p === "object" ? (p as Record<string, unknown>) : {};
    if (isSellingNow(o.productId) && isPurchaseToken(o.purchaseToken)) out.push({ productId: o.productId, purchaseToken: o.purchaseToken });
  }
  return out;
}

/**
 * 동기화 — 이 회원의 구매를 구글에 다시 묻고(갱신·해지·환불·확정) DB 를 맞춘다.
 * offered: 앱이 플레이에서 읽은 내 구매 — DB 에 없던 토큰(다른 기기에서 샀거나 확인이 끊긴 결제)을 이어 붙인다.
 */
export async function syncPurchases(db: BillingDb, deps: BillingDeps, offered: readonly Offered[]): Promise<(SyncSummary & { checked: number }) | VerifyFail> {
  const list = await myPurchases(db, deps.key);
  if (!Array.isArray(list)) return list;
  const now = deps.now();
  const known = new Set(list.map((r) => r.token));
  const todo: { productId: string; token: string }[] = [];
  for (const o of offered) {
    if (!known.has(o.purchaseToken) && !todo.some((t) => t.token === o.purchaseToken)) todo.push({ productId: o.productId, token: o.purchaseToken });
  }
  for (const r of list) if (needsCheck(r, now)) todo.push({ productId: r.product_id, token: r.token });
  let checked = 0;
  for (const t of todo.slice(0, SYNC_MAX_CHECKS)) {
    const r = await verifyPurchase(db, t.productId, t.token, deps);
    checked += 1;
    if (!r.ok && r.code === "not-ready") return r;
  }
  const after = checked > 0 ? await myPurchases(db, deps.key) : list;
  if (!Array.isArray(after)) return after;
  return { checked, ...summarize(after, deps.now()) };
}
