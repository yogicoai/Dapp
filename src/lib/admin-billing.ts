/**
 * 관리실 '결제·구독'(2026-09-30) — 실제 결제(원) 기록을 읽고 보여 주는 순수 함수.
 *
 * 왜 따로 두나: 결제 상태 이름·색, 환불 가능 금액, 거르기, CSV 내보내기는 틀리면
 * 마스터가 고객에게 틀린 금액을 말하거나 엑셀에서 수식이 실행된다. 화면·서버 경로가 같은 규칙을 쓰고
 * admin-billing.test.ts 로 시험하려고 여기 모은다.
 *
 * '결제'라는 말이 둘이다 — 이 파일은 **실제 결제(원)** 쪽이다(payments · subscriptions · payment_refunds,
 * supabase-admin-console.sql). 토큰으로 대본·그림 값을 낸 기록(token_ledger)은 admin.ts 가 맡는다.
 * 상태 목록은 SQL 의 check (status in (…)) 와 같아야 한다(시험이 SQL 파일을 읽어 맞춰 본다).
 *
 * 상대 경로(.ts)만 쓴다 — 테스트 러너(node --test)가 @/ 별칭을 못 읽는다.
 * 결제 시연 모듈은 가져오지 않는다(pay-demo 규칙). 요금제 이름은 plans.ts 한 곳에서 온다.
 */
import { isUuid, parseOptionalNote, type Parsed } from "./admin.ts";
import { clampLimit, formatKstDateTime, isPeriodPreset, kstDayKey, kstRange, parseAdminId, withParams, type PeriodPreset } from "./admin-console.ts";
import { PLANS, isPlanId } from "./plans.ts";

/* ── 상태 목록(SQL 과 같은 순서·값) ─────────────────────────────────────── */

export const PAYMENT_STATUSES = ["pending", "paid", "failed", "cancelled", "refunded", "partial_refunded"] as const;
export const SUBSCRIPTION_STATUSES = ["trialing", "active", "past_due", "cancelled", "expired"] as const;
export const REFUND_STATUSES = ["requested", "done", "failed", "withdrawn"] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export type RefundStatus = (typeof REFUND_STATUSES)[number];

/** 구독 거르기에만 있는 가짜 상태 — '해지 예약'(살아 있는데 기간 끝에 끝나는 것). SQL master_subscriptions_list 와 같다. */
export const CANCEL_SCHEDULED = "cancel_scheduled";
/** 살아 있는 구독 — 한 사람에 하나만(SQL subscriptions_one_live). 해지 예약은 이 셋 중에서만 뜻이 있다. */
export const LIVE_SUBSCRIPTION_STATUSES: readonly string[] = ["trialing", "active", "past_due"];
/** 승인된(돈이 한 번은 나간) 결제 — 합계의 '결제 완료'로 센다. 전액 환불도 한 번은 결제된 것이다. */
const APPROVED: readonly string[] = ["paid", "partial_refunded", "refunded"];
/** 환불을 더 요청할 수 있는 결제 상태(SQL master_request_payment_refund 와 같다). */
const REFUNDABLE: readonly string[] = ["paid", "partial_refunded"];

export type BillingKind = "payments" | "subscriptions" | "refunds";
export const BILLING_KINDS: readonly BillingKind[] = ["payments", "subscriptions", "refunds"];

/* ── 행 모양(화면 ↔ 서버) ──────────────────────────────────────────────── */

/**
 * 결제 한 줄. status 는 글자 그대로 둔다 — 결제사를 붙일 때 상태가 늘어도 화면이 깨지지 않고
 * 모르는 상태는 회색 글자로 보인다(paymentStatusMeta). demo 는 화면에만 있는 시연 줄 표시.
 */
export type PgPayment = {
  id: string;
  orderId: string;
  owner: string | null;
  /** 가입 아이디 사진 — 탈퇴해 owner 가 비어도 남는다. */
  ownerUsername: string | null;
  product: string;
  orderName: string | null;
  amount: number;
  currency: string;
  status: string;
  refundedAmount: number;
  method: string | null;
  pg: string | null;
  subscriptionId: string | null;
  requestedAt: string;
  approvedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  demo?: true;
};

export type PgSubscription = {
  id: string;
  owner: string | null;
  ownerUsername: string | null;
  plan: string;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  nextBillingAt: string | null;
  cancelAtPeriodEnd: boolean;
  cancelledAt: string | null;
  /** 자동결제 키가 등록됐나 — 키 이름(billing_key_ref)은 관리실에도 보내지 않는다. */
  hasBillingKey: boolean;
  createdAt: string;
  demo?: true;
};

export type PgRefund = {
  id: string;
  paymentId: string;
  orderId: string | null;
  owner: string | null;
  ownerUsername: string | null;
  amount: number;
  reason: string;
  status: string;
  requestedByUsername: string | null;
  processedByUsername: string | null;
  processedNote: string | null;
  failureMessage: string | null;
  requestedAt: string;
  processedAt: string | null;
  demo?: true;
};

export type PgPaymentDetail = PgPayment & {
  pgPaymentKey: string | null;
  receiptUrl: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  /** 결제사 응답 원문(서버가 카드번호 등은 저장 전에 뺀다). 화면은 글자로만 보여 준다. */
  raw: unknown;
  refunds: PgRefund[];
  subscription: PgSubscription | null;
};

/** 목록 응답. schemaReady:false 면 사장님이 SQL 을 아직 안 돌린 것 — 빈 목록 + '데이터베이스 준비 전'. */
export type BillingList<R> = { schemaReady: boolean; rows: R[]; total: number; truncated: boolean };
export type PaymentDetailResponse = { schemaReady: boolean; payment: PgPaymentDetail | null };

/* ── 상태 이름·색 ──────────────────────────────────────────────────────── */

/** 배지 색 — kit 의 BadgeTone 중 시연(demo)을 뺀 것. 색만으로 뜻을 전하지 않는다(늘 글자와 함께). */
export type BillingTone = "gray" | "blue" | "green" | "amber" | "red";
export type StatusMeta = { label: string; tone: BillingTone };

const PAYMENT_META: Record<PaymentStatus, StatusMeta> = {
  pending: { label: "결제 대기", tone: "blue" },
  paid: { label: "결제 완료", tone: "green" },
  failed: { label: "결제 실패", tone: "red" },
  // 승인 전에 멈춘 것 — 돈이 나가지 않았다. 승인 뒤 되돌린 것(refunded)과 헷갈리지 않게 말을 나눈다.
  cancelled: { label: "결제 전 취소", tone: "gray" },
  refunded: { label: "전액 환불", tone: "amber" },
  partial_refunded: { label: "부분 환불", tone: "amber" },
};

const SUBSCRIPTION_META: Record<SubscriptionStatus, StatusMeta> = {
  trialing: { label: "체험 중", tone: "blue" },
  active: { label: "이용 중", tone: "green" },
  past_due: { label: "결제 밀림", tone: "red" },
  cancelled: { label: "해지됨", tone: "gray" },
  expired: { label: "만료", tone: "gray" },
};

const REFUND_META: Record<RefundStatus, StatusMeta> = {
  requested: { label: "요청됨", tone: "blue" },
  done: { label: "환불 완료", tone: "green" },
  failed: { label: "환불 실패", tone: "red" },
  withdrawn: { label: "요청 취소", tone: "gray" },
};

function metaOf<K extends string>(table: Record<K, StatusMeta>, s: string): StatusMeta {
  return Object.prototype.hasOwnProperty.call(table, s) ? table[s as K] : { label: s || "–", tone: "gray" };
}

export function paymentStatusMeta(s: string): StatusMeta {
  return metaOf(PAYMENT_META, s);
}

/** 구독 상태 + '해지 예약' 꼬리표(살아 있는 구독에서만 — 이미 끝난 구독에 붙으면 뜻이 없다). */
export function subscriptionStatusMeta(s: string, cancelAtPeriodEnd: boolean): StatusMeta & { extra?: StatusMeta } {
  const base = metaOf(SUBSCRIPTION_META, s);
  if (cancelAtPeriodEnd && LIVE_SUBSCRIPTION_STATUSES.includes(s)) return { ...base, extra: { label: "해지 예약", tone: "amber" } };
  return base;
}

export function refundStatusMeta(s: string): StatusMeta {
  return metaOf(REFUND_META, s);
}

/** 거르기 칩 — '전체' 다음에 보일 순서(자주 보는 것부터). value 'all' 은 거르지 않음. */
export const PAYMENT_STATUS_CHIPS: readonly { value: string; label: string }[] = [
  { value: "all", label: "전체" },
  ...(["paid", "pending", "failed", "cancelled", "partial_refunded", "refunded"] as const).map((s) => ({
    value: s,
    label: PAYMENT_META[s].label,
  })),
];
export const SUBSCRIPTION_STATUS_CHIPS: readonly { value: string; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "active", label: "이용 중" },
  { value: "trialing", label: "체험 중" },
  { value: "past_due", label: "결제 밀림" },
  { value: CANCEL_SCHEDULED, label: "해지 예약" },
  { value: "cancelled", label: "해지됨" },
  { value: "expired", label: "만료" },
];
export const REFUND_STATUS_CHIPS: readonly { value: string; label: string }[] = [
  { value: "all", label: "전체" },
  ...REFUND_STATUSES.map((s) => ({ value: s, label: REFUND_META[s].label })),
];

/** 상품(요금제 코드) → 고객이 보는 이름. 모르는 코드는 그대로 보여 준다(없는 이름을 지어내지 않는다). */
export function planLabel(code: string): string {
  return isPlanId(code) ? PLANS[code].name : code || "–";
}

/* ── 거르기(주소 → 서버 · 시연 줄) ─────────────────────────────────────── */

function statusesOf(kind: BillingKind): readonly string[] {
  if (kind === "payments") return PAYMENT_STATUSES;
  if (kind === "subscriptions") return [...SUBSCRIPTION_STATUSES, CANCEL_SCHEDULED];
  return REFUND_STATUSES;
}

export const MAX_BILLING_Q = 64;

export type BillingQuery = {
  status: string | null;
  q: string | null;
  period: PeriodPreset;
  from: string | null;
  to: string | null;
  owner: string | null;
  subscription: string | null;
  limit: number;
};

/**
 * 서버 경로가 받은 주소 칸 → DB 함수 인자. 이상한 값은 400 으로 돌려보낸다(조용히 '전체'로 바꾸면
 * 마스터가 거른 줄 알고 전체를 본다). 화면은 readBillingFilter 로 미리 걸러 보내므로 평소엔 여기서 막힐 일이 없다.
 *  · status: 그 목록의 상태만(구독은 cancel_scheduled 도) · q: 앞뒤 공백 뗀 64자까지
 *  · period: 결제만(한국 날짜 0시로 끊는다) · owner: 결제·구독만 · subscription: 결제만 · limit: 1~500(기본 200)
 */
export function parseBillingQuery(sp: URLSearchParams, now: Date | number, kind: BillingKind): Parsed<BillingQuery> {
  const rawStatus = (sp.get("status") ?? "").trim();
  if (rawStatus && !statusesOf(kind).includes(rawStatus)) return { ok: false, error: "모르는 상태예요." };
  const q = (sp.get("q") ?? "").trim();
  if (q.length > MAX_BILLING_Q) return { ok: false, error: `검색어는 ${MAX_BILLING_Q}자까지예요.` };

  let period: PeriodPreset = "all";
  const rawPeriod = (sp.get("period") ?? "").trim();
  if (kind === "payments" && rawPeriod) {
    if (!isPeriodPreset(rawPeriod)) return { ok: false, error: "모르는 기간이에요." };
    period = rawPeriod;
  }
  const range = kstRange(period, now);

  const uuidParam = (name: string, allowed: boolean): Parsed<string | null> => {
    const v = (sp.get(name) ?? "").trim();
    if (!v || !allowed) return { ok: true, value: null };
    return isUuid(v) ? { ok: true, value: v.toLowerCase() } : { ok: false, error: "id 모양이 아니에요." };
  };
  const owner = uuidParam("owner", kind !== "refunds");
  if (!owner.ok) return owner;
  const subscription = uuidParam("subscription", kind === "payments");
  if (!subscription.ok) return subscription;

  return {
    ok: true,
    value: {
      status: rawStatus || null,
      q: q || null,
      period,
      from: range.from,
      to: range.to,
      owner: owner.value,
      subscription: subscription.value,
      limit: clampLimit(sp.get("limit") ?? undefined),
    },
  };
}

/** 화면 쪽 거르기 값 — 주소를 손으로 고쳐 이상한 값이 와도 '전체'로 읽는다(화면은 늘 열려야 한다). */
export type BillingFilterState = { status: string; q: string; period: PeriodPreset };

export function readBillingFilter(sp: URLSearchParams, kind: BillingKind): BillingFilterState {
  const s = (sp.get("status") ?? "").trim();
  const q = (sp.get("q") ?? "").trim().slice(0, MAX_BILLING_Q);
  const p = (sp.get("period") ?? "").trim();
  return {
    status: statusesOf(kind).includes(s) ? s : "all",
    q,
    period: kind === "payments" && isPeriodPreset(p) ? p : "all",
  };
}

/** 거르기가 하나라도 걸렸나 — '거르기 풀기' 단추와 '조건에 맞는 … 없어요' 문구에 쓴다. */
export function hasBillingFilter(f: BillingFilterState): boolean {
  return f.status !== "all" || f.q !== "" || f.period !== "all";
}

/** 목록 서버 경로 — 기본값(전체)은 주소에서 뺀다. extra 는 owner·subscription 같은 좁히기. */
export function billingListPath(kind: BillingKind, f: BillingFilterState, extra: Record<string, string | null> = {}): string {
  return `/api/admin/billing/${kind}${withParams("", {
    status: f.status === "all" ? null : f.status,
    q: f.q || null,
    period: kind === "payments" && f.period !== "all" ? f.period : null,
    ...extra,
  })}`;
}

/** 다른 탭의 서랍으로 건너가는 주소 조각 — 거르기는 풀고, 필요하면 찾을 말(q)을 넣는다. */
export function jumpPatch(kind: BillingKind, id: string, q?: string | null): Record<string, string | null> {
  return { tab: kind === "payments" ? null : kind, id, status: null, period: null, q: q ? q.slice(0, MAX_BILLING_Q) : null };
}

export type BillingFilter = {
  status?: string | null;
  q?: string | null;
  from?: string | null;
  to?: string | null;
  owner?: string | null;
  subscription?: string | null;
};

type Filterable = {
  status: string;
  owner: string | null;
  ownerUsername: string | null;
  orderId?: string | null;
  subscriptionId?: string | null;
  cancelAtPeriodEnd?: boolean;
  createdAt?: string;
};

/**
 * 시연 줄을 화면에서 거른다 — DB 함수(master_*_list)와 같은 뜻으로:
 *  · q = 주문번호와 정확히 같거나, 아이디에 (대소문자 없이) 들어 있거나 · 기간은 만든 시각 [from, to)
 *  · 'all'·빈 값은 거르지 않는다 · 순서는 그대로(시연 모듈이 최신순으로 준다).
 */
export function filterBillingRows<R extends Filterable>(rows: readonly R[], f: BillingFilter): R[] {
  const status = f.status && f.status !== "all" ? f.status : null;
  const q = (f.q ?? "").trim().slice(0, MAX_BILLING_Q);
  const ql = q.toLowerCase();
  const from = f.from ? Date.parse(f.from) : null;
  const to = f.to ? Date.parse(f.to) : null;
  return rows.filter((r) => {
    if (status === CANCEL_SCHEDULED) {
      if (!(r.cancelAtPeriodEnd && LIVE_SUBSCRIPTION_STATUSES.includes(r.status))) return false;
    } else if (status && r.status !== status) return false;
    if (q && !(r.orderId === q || (r.ownerUsername ?? "").toLowerCase().includes(ql))) return false;
    if ((from !== null || to !== null) && r.createdAt) {
      const t = Date.parse(r.createdAt);
      if (from !== null && t < from) return false;
      if (to !== null && t >= to) return false;
    }
    if (f.owner && r.owner !== f.owner) return false;
    if (f.subscription && r.subscriptionId !== f.subscription) return false;
    return true;
  });
}

/** 칩 옆 숫자(시연일 때만 — 실제 목록은 거른 결과만 받아 와서 상태별 수를 모른다). */
export function statusCounts<R extends Filterable>(rows: readonly R[], chips: readonly { value: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of chips) out[c.value] = c.value === "all" ? rows.length : filterBillingRows(rows, { status: c.value }).length;
  return out;
}

/* ── 돈 ─────────────────────────────────────────────────────────────────── */

/**
 * 더 환불할 수 있는 금액 = 결제 금액 − 이미 환불된 금액 − 처리 기다리는 요청 합.
 * SQL master_request_payment_refund 와 같은 셈이다(화면이 먼저 알려 주고, DB 가 줄을 잠그고 다시 센다).
 */
export function refundableAmount(
  p: Pick<PgPayment, "amount" | "refundedAmount" | "status">,
  refunds: readonly Pick<PgRefund, "amount" | "status">[],
): number {
  if (!REFUNDABLE.includes(p.status)) return 0;
  const pending = refunds.filter((r) => r.status === "requested").reduce((s, r) => s + (Number(r.amount) || 0), 0);
  return Math.max(0, Math.floor(p.amount - p.refundedAmount - pending));
}

/** [환불 요청 기록] 단추를 보일까 — 시연 줄은 늘 아니다(눌러도 아무 일도 일어나면 안 된다). */
export function canRequestRefund(p: Pick<PgPayment, "id" | "amount" | "refundedAmount" | "status" | "demo">, refunds: readonly Pick<PgRefund, "amount" | "status">[]): boolean {
  if (p.demo || isDemoId(p.id)) return false;
  return refundableAmount(p, refunds) > 0;
}

/** [요청 취소] 단추를 보일까 — 아직 '요청됨'인 실제 줄만. */
export function canWithdrawRefund(r: Pick<PgRefund, "id" | "status" | "demo">): boolean {
  return !r.demo && !isDemoId(r.id) && r.status === "requested";
}

export type PaymentSummary = { paidCount: number; paidWon: number; refundedWon: number; netWon: number };

/** 이 목록 기준 합계 — 한 번이라도 승인된 결제(전액 환불 포함)를 '결제 완료'로 센다. */
export function summarizePayments(rows: readonly Pick<PgPayment, "status" | "amount" | "refundedAmount">[]): PaymentSummary {
  let paidCount = 0;
  let paidWon = 0;
  let refundedWon = 0;
  for (const r of rows) {
    if (!APPROVED.includes(r.status)) continue;
    paidCount += 1;
    paidWon += Number(r.amount) || 0;
    refundedWon += Number(r.refundedAmount) || 0;
  }
  return { paidCount, paidWon, refundedWon, netWon: paidWon - refundedWon };
}

/* ── 입력 검사(처리 요청) ──────────────────────────────────────────────── */

export const MAX_REFUND_WON = 10_000_000;

/** 시연 줄 id 인가(demo-…). 시연 줄은 DB 에 없다 — 서버로 보내지 않는다. */
export function isDemoId(v: unknown): boolean {
  return typeof v === "string" && /^demo-/i.test(v.trim());
}

/** 금액 칸 글자 → 원(정수). 쉼표는 받아 준다. 1원 ~ max원. */
export function parseWonInput(v: unknown, max: number): Parsed<number> {
  const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.replace(/[,\s]/g, "") : "";
  if (!/^\d{1,9}$/.test(s)) return { ok: false, error: "금액을 숫자로 적어 주세요." };
  const n = Number(s);
  const cap = Math.max(0, Math.min(MAX_REFUND_WON, Math.floor(max)));
  if (n < 1 || n > cap) return { ok: false, error: cap >= 1 ? `환불 금액은 1원 ~ ${groupWon(cap)}이에요.` : "더 환불할 수 있는 금액이 없어요." };
  return { ok: true, value: n };
}

const groupWon = (n: number) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}원`;

/** POST /api/admin/billing/refund-request 본문. DB 가 다시 보지만 친절한 문구는 여기서. */
export function parseRefundRequest(body: unknown): Parsed<{ paymentId: string; amount: number; reason: string }> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "요청 본문이 JSON 객체가 아니에요." };
  const b = body as Record<string, unknown>;
  const id = parseAdminId(b.paymentId);
  if (!id.ok) return id;
  const amount =
    typeof b.amount === "number" ? b.amount : typeof b.amount === "string" && /^\s*\d{1,9}\s*$/.test(b.amount) ? Number(b.amount) : NaN;
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_REFUND_WON) {
    return { ok: false, error: "환불 금액은 1원 ~ 10,000,000원 사이의 정수로 적어 주세요." };
  }
  const reason = typeof b.reason === "string" ? b.reason.trim() : "";
  if (reason.length < 2 || reason.length > 500) return { ok: false, error: "환불 사유를 2~500자로 적어 주세요." };
  return { ok: true, value: { paymentId: id.value, amount, reason } };
}

/** POST /api/admin/billing/refund-withdraw 본문 — 메모는 선택(500자). */
export function parseRefundWithdraw(body: unknown): Parsed<{ refundId: string; note: string | null }> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "요청 본문이 JSON 객체가 아니에요." };
  const b = body as Record<string, unknown>;
  const id = parseAdminId(b.refundId);
  if (!id.ok) return id;
  const note = parseOptionalNote(b.note, 500);
  if (!note.ok) return note;
  return { ok: true, value: { refundId: id.value, note: note.value } };
}

/**
 * DB 함수가 '못 찾음'을 권한 오류(42501)로 알린다(남의 것인지 없는 것인지 알려 주지 않으려고).
 * 서버 경로는 이것만 404 로 바꾼다 — 403 이면 관리자 페이지가 로그인부터 다시 확인하러 간다.
 */
export function isNotFoundDbError(err: { code?: string | null; message?: string | null } | null | undefined): boolean {
  return String(err?.code ?? "") === "42501" && /찾을 수 없어요/.test(String(err?.message ?? ""));
}

/* ── DB 줄 → 화면 모양 ─────────────────────────────────────────────────── */

type Raw = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};
const obj = (v: unknown): Raw | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : null);

export function mapPaymentRow(r: Raw): PgPayment {
  return {
    id: String(r.id ?? ""),
    orderId: String(r.order_id ?? ""),
    owner: str(r.owner),
    ownerUsername: str(r.owner_username),
    product: String(r.product ?? ""),
    orderName: str(r.order_name),
    amount: num(r.amount),
    currency: str(r.currency) ?? "KRW",
    status: String(r.status ?? ""),
    refundedAmount: num(r.refunded_amount),
    method: str(r.method),
    pg: str(r.pg),
    subscriptionId: str(r.subscription_id),
    requestedAt: String(r.requested_at ?? r.created_at ?? ""),
    approvedAt: str(r.approved_at),
    cancelledAt: str(r.cancelled_at),
    createdAt: String(r.created_at ?? ""),
  };
}

export function mapSubscriptionRow(r: Raw): PgSubscription {
  return {
    id: String(r.id ?? ""),
    owner: str(r.owner),
    ownerUsername: str(r.owner_username),
    plan: String(r.plan ?? ""),
    status: String(r.status ?? ""),
    currentPeriodStart: str(r.current_period_start),
    currentPeriodEnd: str(r.current_period_end),
    nextBillingAt: str(r.next_billing_at),
    cancelAtPeriodEnd: r.cancel_at_period_end === true,
    cancelledAt: str(r.cancelled_at),
    hasBillingKey: r.has_billing_key === true,
    createdAt: String(r.created_at ?? ""),
  };
}

export function mapRefundRow(r: Raw): PgRefund {
  return {
    id: String(r.id ?? ""),
    paymentId: String(r.payment_id ?? ""),
    orderId: str(r.order_id),
    owner: str(r.owner),
    ownerUsername: str(r.owner_username),
    amount: num(r.amount),
    reason: String(r.reason ?? ""),
    status: String(r.status ?? ""),
    requestedByUsername: str(r.requested_by_username),
    processedByUsername: str(r.processed_by_username),
    processedNote: str(r.processed_note),
    failureMessage: str(r.failure_message),
    requestedAt: String(r.requested_at ?? ""),
    processedAt: str(r.processed_at),
  };
}

/** master_payment_detail 의 json({payment, refunds, subscription}) → 화면 모양. 결제가 없으면 null. */
export function mapPaymentDetail(data: unknown): PgPaymentDetail | null {
  const d = obj(data);
  const p = obj(d?.payment);
  if (!d || !p || !p.id) return null;
  const refunds = Array.isArray(d.refunds) ? d.refunds.map((x) => obj(x)).filter((x): x is Raw => !!x).map(mapRefundRow) : [];
  const sub = obj(d.subscription);
  const receipt = p.receipt_url;
  return {
    ...mapPaymentRow(p),
    pgPaymentKey: str(p.pg_payment_key),
    receiptUrl: isSafeReceiptUrl(receipt) ? receipt : null,
    failureCode: str(p.failure_code),
    failureMessage: str(p.failure_message),
    raw: p.raw ?? null,
    refunds,
    subscription: sub ? mapSubscriptionRow(sub) : null,
  };
}

/** DB 함수 목록(… total_count) → 목록 응답. total 은 거른 전체 수, rows 는 그중 limit 만큼. */
export function toBillingList<R>(data: unknown, map: (r: Raw) => R): BillingList<R> {
  const list = Array.isArray(data) ? data.map((x) => obj(x)).filter((x): x is Raw => !!x) : [];
  const rows = list.map(map);
  const total = Math.max(rows.length, list.length ? num(list[0].total_count) : 0);
  return { schemaReady: true, rows, total, truncated: total > rows.length };
}

/* ── 보여 주기 ─────────────────────────────────────────────────────────── */

/** 결제 키 가리기 — 앞 9자 + 끝 4자("tgen_2026…A1B2"). 짧은 값은 앞만 조금. 없으면 "–". */
export function maskKey(k: string | null | undefined): string {
  if (typeof k !== "string" || !k) return "–";
  if (k.length > 13) return `${k.slice(0, 9)}…${k.slice(-4)}`;
  return `${k.slice(0, Math.max(1, Math.min(4, Math.ceil(k.length / 3))))}…`;
}

/** 영수증 링크로 열어도 되나 — https 만, 500자까지, 주소로 읽혀야 하고 아이디·비밀번호가 붙으면 안 된다. */
export function isSafeReceiptUrl(u: unknown): u is string {
  if (typeof u !== "string" || u.length === 0 || u.length > 500) return false;
  try {
    const url = new URL(u);
    return url.protocol === "https:" && !!url.hostname && !url.username && !url.password;
  } catch {
    return false;
  }
}

export const RAW_PREVIEW_MAX = 20_000;

/** 결제사 원문을 글자로 — 화면에는 <pre> 안의 글자로만 넣는다(HTML 로 넣지 않는다). 너무 길면 자른다. */
export function rawPreview(raw: unknown, max = RAW_PREVIEW_MAX): string {
  let s: string;
  try {
    s = raw === undefined || raw === null ? "" : JSON.stringify(raw, null, 2) ?? "";
  } catch {
    s = "(원문을 글자로 바꾸지 못했어요)";
  }
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n… (${groupDigitsPlain(s.length - max)}자 더 있어요)`;
}

const groupDigitsPlain = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** 구독 기간 'M/D–M/D'(한국 날짜). 해가 다르면 해도 붙인다. 하나라도 없으면 "–". */
export function formatPeriodRange(start: string | null | undefined, end: string | null | undefined): string {
  const a = kstDayKey(start);
  const b = kstDayKey(end);
  if (!a || !b) return "–";
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  if (ay !== by) return `${ay}/${am}/${ad}–${by}/${bm}/${bd}`;
  return `${am}/${ad}–${bm}/${bd}`;
}

/**
 * 받침에 맞는 조사 — "결제가 · 구독이 · 결제를 · 구독을". 빈 화면 문구가 명사를 바꿔 끼우므로 손으로 고르지 않는다.
 * 한글 음절이 아니면(숫자·영문으로 끝나면) 받침 없는 쪽을 쓴다.
 */
export function josa(word: string, pair: "이가" | "을를" | "은는"): string {
  const code = word.charCodeAt(word.length - 1);
  const hangul = code >= 0xac00 && code <= 0xd7a3;
  const batchim = hangul && (code - 0xac00) % 28 !== 0;
  return `${word}${batchim ? pair[0] : pair[1]}`;
}

/** 탈퇴(주인 칸이 빈) 줄의 회원 표시 — 가입 아이디 사진을 함께. */
export function memberText(owner: string | null, ownerUsername: string | null): string {
  if (owner) return ownerUsername || "(아이디 없음)";
  return ownerUsername ? `탈퇴한 회원 · ${ownerUsername}` : "탈퇴한 회원";
}

/* ── CSV ────────────────────────────────────────────────────────────────── */

export type CsvColumn<R> = { header: string; value: (r: R) => string | number | null | undefined };

/**
 * CSV(RFC 4180) — 쉼표·따옴표·줄바꿈이 든 칸은 따옴표로 감싸고, 줄 끝은 \r\n.
 * 엑셀 수식 주입 막기: 글자 칸이 = + - @ 탭 CR 로 시작하면 앞에 ' 를 붙인다
 * (고객이 적은 사유·주문명에 "=HYPERLINK(…)"가 들어와도 마스터 PC 에서 실행되지 않게).
 * 숫자 칸은 숫자 그대로(음수도). 엑셀이 한글을 읽게 하는 BOM 은 내려받는 쪽이 앞에 붙인다.
 */
export function toCsv<R>(rows: readonly R[], cols: readonly CsvColumn<R>[]): string {
  const cell = (v: string | number | null | undefined): string => {
    if (v === null || v === undefined) return "";
    if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.map((c) => cell(c.header)).join(",")];
  for (const r of rows) lines.push(cols.map((c) => cell(c.value(r))).join(","));
  return `${lines.join("\r\n")}\r\n`;
}

/** 내려받을 파일 이름 — payments-20260930.csv · 시연은 앞에 '시연-'. 날짜는 한국 날짜. */
export function csvFilename(kind: BillingKind, demo: boolean, nowMs: number): string {
  const day = kstDayKey(new Date(nowMs).toISOString()).replace(/-/g, "") || "date";
  return `${demo ? "시연-" : ""}${kind}-${day}.csv`;
}

export const PAYMENT_CSV: readonly CsvColumn<PgPayment>[] = [
  { header: "주문일시(한국)", value: (r) => formatKstDateTime(r.createdAt) },
  { header: "주문번호", value: (r) => r.orderId },
  { header: "회원", value: (r) => memberText(r.owner, r.ownerUsername) },
  { header: "상품", value: (r) => planLabel(r.product) },
  { header: "금액(원)", value: (r) => r.amount },
  { header: "통화", value: (r) => r.currency },
  { header: "결제수단", value: (r) => r.method },
  { header: "결제사", value: (r) => r.pg },
  { header: "상태", value: (r) => paymentStatusMeta(r.status).label },
  { header: "환불액(원)", value: (r) => r.refundedAmount },
  { header: "승인 시각(한국)", value: (r) => (r.approvedAt ? formatKstDateTime(r.approvedAt) : "") },
  { header: "취소 시각(한국)", value: (r) => (r.cancelledAt ? formatKstDateTime(r.cancelledAt) : "") },
];

export const SUBSCRIPTION_CSV: readonly CsvColumn<PgSubscription>[] = [
  { header: "회원", value: (r) => memberText(r.owner, r.ownerUsername) },
  { header: "요금제", value: (r) => planLabel(r.plan) },
  { header: "상태", value: (r) => subscriptionStatusMeta(r.status, r.cancelAtPeriodEnd).label },
  { header: "해지 예약", value: (r) => (subscriptionStatusMeta(r.status, r.cancelAtPeriodEnd).extra ? "예" : "") },
  { header: "이번 기간 시작(한국)", value: (r) => (r.currentPeriodStart ? formatKstDateTime(r.currentPeriodStart) : "") },
  { header: "이번 기간 끝(한국)", value: (r) => (r.currentPeriodEnd ? formatKstDateTime(r.currentPeriodEnd) : "") },
  { header: "다음 결제일(한국)", value: (r) => (r.nextBillingAt ? formatKstDateTime(r.nextBillingAt) : "") },
  { header: "자동결제", value: (r) => (r.hasBillingKey ? "등록됨" : "") },
  { header: "시작일(한국)", value: (r) => formatKstDateTime(r.createdAt) },
];

export const REFUND_CSV: readonly CsvColumn<PgRefund>[] = [
  { header: "요청일시(한국)", value: (r) => formatKstDateTime(r.requestedAt) },
  { header: "주문번호", value: (r) => r.orderId },
  { header: "회원", value: (r) => memberText(r.owner, r.ownerUsername) },
  { header: "금액(원)", value: (r) => r.amount },
  { header: "사유", value: (r) => r.reason },
  { header: "상태", value: (r) => refundStatusMeta(r.status).label },
  { header: "요청자", value: (r) => r.requestedByUsername },
  { header: "처리자", value: (r) => r.processedByUsername },
  { header: "처리 시각(한국)", value: (r) => (r.processedAt ? formatKstDateTime(r.processedAt) : "") },
];
