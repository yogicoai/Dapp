/**
 * 관리실 '결제·구독' 시연 데이터(2026-09-30) — 화면에만 있는 예시 줄.
 *
 * 왜 있나: 결제사(PG)를 붙이기 전이라 실제 결제 표가 비어 있다. 사장님이 고객사에 "결제가 생기면 이렇게 보여요"를
 * 보여 줄 수 있게, '시연 데이터 보기'(주소 ?demo=1)를 켜면 이 줄들을 그린다.
 *
 * 지키는 것(admin-billing-demo.test.ts 가 본다):
 *  · 순수 함수 하나 — 서버·DB·브라우저 저장소를 부르지 않는다. DB 에 절대 쓰지 않는다.
 *  · 모든 id 는 demo- 로 시작한다(uuid 가 아니다) → 처리 경로(parseAdminId)가 "시연 데이터는 처리할 수 없어요"로 거절한다.
 *  · 모든 줄에 demo: true — 화면이 '시연' 배지와 줄무늬를 붙이고 단추를 끈다.
 *  · 같은 한국 날짜 안에서는 몇 번을 불러도 똑같다(새로 고침해도 같은 화면).
 *  · 금액은 요금제(plans.ts) 값 그대로, 회원 이름은 누가 봐도 가짜(시연회원01…), 결제사 상품 이름은 쓰지 않는다.
 *  · 줄끼리 맞는다 — 환불액 = 끝난 환불의 합, 상태·금액 규칙은 SQL(payments_refund_status 등)과 같다.
 * 가져오는 것은 plans.ts 와 admin-billing.ts 뿐이다. 서버 경로(src/app/api)는 이 파일을 가져오지 않는다.
 */
import type { PgPaymentDetail, PgRefund, PgSubscription } from "./admin-billing.ts";
import { PLANS, type PlanId } from "./plans.ts";

export type BillingDemoData = {
  payments: PgPaymentDetail[];
  subscriptions: PgSubscription[];
  refunds: PgRefund[];
};

const HOUR = 3_600_000;
const DAY = 86_400_000;
const KST = 9 * HOUR; // 한국은 서머타임이 없다

/** 한국 날짜 오늘 0시(ms). 시연 줄의 시각은 모두 여기서 센다 — 그래서 하루 동안은 늘 같은 줄이 나온다. */
function kstMidnight(now: Date): number {
  const shifted = now.getTime() + KST;
  return shifted - (((shifted % DAY) + DAY) % DAY) - KST;
}

type MemberKey = "01" | "02" | "03" | "04" | "05" | "06" | "07";
const member = (k: MemberKey) => ({ owner: `demo-m${k}`, ownerUsername: `시연회원${k}` });
/** 탈퇴한 회원 — 주인 칸이 비고 가입 아이디 사진만 남는다(결제 기록 5년 보관 모습). */
const LEFT_MEMBER = { owner: null, ownerUsername: "시연회원07" };

export function demoBilling(now: Date): BillingDemoData {
  const base = kstMidnight(now);
  /** days 일 전 한국 시각 hh:mm 의 ISO. '오늘' 줄은 0시 조금 뒤로 둔다 — 아침에 열어도 미래 시각이 보이지 않게. */
  const at = (days: number, hh: number, mm = 0) => new Date(base - days * DAY + hh * HOUR + mm * 60_000).toISOString();
  const later = (days: number, hh = 0) => new Date(base + days * DAY + hh * HOUR).toISOString();

  /* ── 구독 6 — 상태마다 하나 + 해지 예약 ── */
  const sub = (
    id: string,
    who: { owner: string | null; ownerUsername: string },
    plan: PlanId,
    status: string,
    o: { start: string; end: string; next: string | null; cancelAtEnd?: boolean; cancelledAt?: string | null; key: boolean; created: string },
  ): PgSubscription => ({
    id,
    ...who,
    plan,
    status,
    currentPeriodStart: o.start,
    currentPeriodEnd: o.end,
    nextBillingAt: o.next,
    cancelAtPeriodEnd: o.cancelAtEnd ?? false,
    cancelledAt: o.cancelledAt ?? null,
    hasBillingKey: o.key,
    createdAt: o.created,
    demo: true,
  });

  const subscriptions: PgSubscription[] = [
    sub("demo-s01", member("01"), "monthly", "active", {
      start: at(0, 0, 41), end: later(30, 0), next: later(30, 0), key: true, created: at(31, 0, 38),
    }),
    sub("demo-s03", member("03"), "monthly", "trialing", {
      start: at(2, 20, 40), end: later(5, 20), next: later(5, 20), key: true, created: at(2, 20, 40),
    }),
    sub("demo-s04", member("04"), "monthly", "past_due", {
      start: at(32, 9, 0), end: at(2, 9, 0), next: later(1, 9), key: true, created: at(32, 8, 55),
    }),
    sub("demo-s02", member("02"), "yearly", "active", {
      start: at(40, 21, 10), end: later(325, 21), next: null, cancelAtEnd: true, key: true, created: at(40, 21, 8),
    }),
    sub("demo-s05", member("05"), "monthly", "cancelled", {
      start: at(50, 14, 0), end: at(20, 14, 0), next: null, cancelledAt: at(20, 15, 30), key: false, created: at(50, 13, 58),
    }),
    sub("demo-s06", member("06"), "yearly", "expired", {
      start: at(400, 11, 0), end: at(35, 11, 0), next: null, key: false, created: at(400, 10, 57),
    }),
  ];

  /* ── 결제 14 — 상태마다 하나 이상 ── */
  type PayInput = {
    n: string;
    who: { owner: string | null; ownerUsername: string };
    product: PlanId;
    status: string;
    created: string;
    method: string;
    subscriptionId?: string;
    refunded?: number;
    approved?: boolean;
    cancelledAt?: string;
    failure?: { code: string; message: string };
  };
  const pay = (p: PayInput): PgPaymentDetail => {
    const plan = PLANS[p.product];
    const approved = p.approved ?? ["paid", "partial_refunded", "refunded"].includes(p.status);
    const orderId = `DEMO-${p.n.padStart(4, "0")}`;
    return {
      id: `demo-p${p.n}`,
      orderId,
      ...p.who,
      product: plan.id,
      orderName: plan.name,
      amount: plan.priceWon,
      currency: "KRW",
      status: p.status,
      refundedAmount: p.refunded ?? 0,
      method: p.method,
      pg: "demo",
      subscriptionId: p.subscriptionId ?? null,
      requestedAt: p.created,
      approvedAt: approved ? new Date(Date.parse(p.created) + 40_000).toISOString() : null,
      cancelledAt: p.cancelledAt ?? null,
      createdAt: p.created,
      pgPaymentKey: approved || p.status === "failed" ? `demo_paykey_${p.n.padStart(4, "0")}_A1B2` : null,
      receiptUrl: null,
      failureCode: p.failure?.code ?? null,
      failureMessage: p.failure?.message ?? null,
      raw: { 시연: true, orderId, status: p.status, method: p.method },
      refunds: [],
      subscription: null,
      demo: true,
    };
  };

  const payments: PgPaymentDetail[] = [
    pay({ n: "01", who: member("01"), product: "monthly", status: "paid", created: at(0, 0, 41), method: "카드", subscriptionId: "demo-s01" }),
    pay({ n: "02", who: member("01"), product: "extra3", status: "paid", created: at(0, 0, 26), method: "간편결제" }),
    pay({ n: "03", who: member("03"), product: "monthly", status: "pending", created: at(0, 0, 12), method: "카드" }),
    pay({
      n: "04", who: member("04"), product: "monthly", status: "failed", created: at(2, 9, 0), method: "카드", subscriptionId: "demo-s04",
      failure: { code: "DEMO_CARD_LIMIT", message: "카드 한도를 넘었어요(시연)." },
    }),
    pay({ n: "05", who: member("02"), product: "extra3", status: "cancelled", created: at(3, 22, 15), method: "계좌이체", cancelledAt: at(3, 22, 19) }),
    pay({ n: "06", who: member("04"), product: "extra3", status: "paid", created: at(5, 19, 30), method: "간편결제" }),
    pay({ n: "07", who: member("05"), product: "extra3", status: "paid", created: at(12, 16, 20), method: "카드" }),
    pay({
      n: "08", who: member("05"), product: "monthly", status: "refunded", created: at(20, 14, 0), method: "카드", subscriptionId: "demo-s05",
      refunded: PLANS.monthly.priceWon, cancelledAt: at(19, 11, 0),
    }),
    pay({ n: "09", who: member("04"), product: "monthly", status: "paid", created: at(32, 9, 0), method: "카드", subscriptionId: "demo-s04" }),
    pay({ n: "10", who: member("01"), product: "monthly", status: "paid", created: at(31, 0, 41), method: "카드", subscriptionId: "demo-s01" }),
    pay({ n: "11", who: member("02"), product: "yearly", status: "paid", created: at(40, 21, 10), method: "카드", subscriptionId: "demo-s02" }),
    pay({ n: "12", who: member("05"), product: "monthly", status: "paid", created: at(50, 14, 0), method: "카드", subscriptionId: "demo-s05" }),
    pay({ n: "13", who: LEFT_MEMBER, product: "monthly", status: "paid", created: at(63, 18, 45), method: "휴대폰" }),
    pay({
      n: "14", who: member("06"), product: "yearly", status: "partial_refunded", created: at(400, 11, 0), method: "카드", subscriptionId: "demo-s06",
      refunded: 59_500, cancelledAt: at(380, 10, 0),
    }),
  ];

  /* ── 결제 환불 5 — 상태마다 하나 이상. 끝난(done) 환불의 합 = 그 결제의 환불액 ── */
  const byId = new Map(payments.map((p) => [p.id, p]));
  const refund = (
    n: string,
    paymentId: string,
    amount: number,
    status: string,
    reason: string,
    requested: string,
    o: { processed?: string; by?: string | null; note?: string | null; failure?: string | null } = {},
  ): PgRefund => {
    const p = byId.get(paymentId)!;
    return {
      id: `demo-r${n}`,
      paymentId,
      orderId: p.orderId,
      owner: p.owner,
      ownerUsername: p.ownerUsername,
      amount,
      reason,
      status,
      requestedByUsername: "시연관리자",
      processedByUsername: o.by ?? null,
      processedNote: o.note ?? null,
      failureMessage: o.failure ?? null,
      requestedAt: requested,
      processedAt: o.processed ?? null,
      demo: true,
    };
  };

  const refunds: PgRefund[] = [
    refund("01", "demo-p07", 4_900, "requested", "아이 생일 선물로 샀는데 같은 책을 이미 받았대요.", at(0, 0, 52)),
    refund("02", "demo-p06", 4_900, "withdrawn", "잘못 누른 줄 알았는데 쓰신다고 하셔서 요청을 거뒀어요.", at(4, 10, 0), {
      processed: at(4, 10, 20), by: "시연관리자", note: "고객이 계속 쓰기로 함",
    }),
    refund("03", "demo-p09", 12_900, "failed", "결제일을 착각하셨다고 해요.", at(15, 13, 0), {
      processed: at(15, 13, 1), failure: "결제사가 취소를 받지 않았어요(시연).",
    }),
    refund("04", "demo-p08", PLANS.monthly.priceWon, "done", "결제 뒤 7일 안에 한 권도 만들지 않으셨어요.", at(19, 10, 40), {
      processed: at(19, 11, 0), note: "결제사 취소 끝(시연)",
    }),
    refund("05", "demo-p14", 59_500, "done", "해지 요청 — 남은 기간만큼 돌려드렸어요.", at(380, 9, 30), {
      processed: at(380, 10, 0), note: "결제사 부분 취소 끝(시연)",
    }),
  ];

  // 상세 서랍이 쓰는 묶음 — 그 결제의 환불(최신순)과 그 결제의 구독.
  const subById = new Map(subscriptions.map((s) => [s.id, s]));
  for (const p of payments) {
    p.refunds = refunds.filter((r) => r.paymentId === p.id).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    p.subscription = p.subscriptionId ? (subById.get(p.subscriptionId) ?? null) : null;
  }

  // DB 함수와 같은 순서(최신순)로 준다.
  payments.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  subscriptions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  refunds.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  return { payments, subscriptions, refunds };
}
