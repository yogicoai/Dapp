/**
 * 관리실 '결제·구독' 순수 함수 시험(2026-09-30).
 *
 *  · 상태 이름·색이 모든 상태를 덮고, TS 상태 목록이 SQL check (status in (…)) 와 똑같은가.
 *  · 거르기(주소 → 서버 인자 · 시연 줄)가 DB 함수와 같은 뜻인가.
 *  · 환불 가능액·요청 검사 — 틀리면 고객에게 틀린 금액을 말한다.
 *  · CSV 수식 주입 막기, 결제 키 가리기, 영수증 링크 검사, 원문 자르기.
 *  · supabase-admin-console.sql 본문이 supabase-setup.sql 26번과 한 글자도 다르지 않은가.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  CANCEL_SCHEDULED,
  PAYMENT_CSV,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_CHIPS,
  REFUND_STATUSES,
  REFUND_STATUS_CHIPS,
  SUBSCRIPTION_STATUSES,
  SUBSCRIPTION_STATUS_CHIPS,
  billingListPath,
  canRequestRefund,
  canWithdrawRefund,
  csvFilename,
  filterBillingRows,
  formatPeriodRange,
  hasBillingFilter,
  isDemoId,
  isNotFoundDbError,
  isSafeReceiptUrl,
  josa,
  jumpPatch,
  mapPaymentDetail,
  mapPaymentRow,
  mapRefundRow,
  mapSubscriptionRow,
  maskKey,
  memberText,
  parseBillingQuery,
  parseRefundRequest,
  parseRefundWithdraw,
  parseWonInput,
  paymentStatusMeta,
  planLabel,
  rawPreview,
  readBillingFilter,
  refundStatusMeta,
  refundableAmount,
  statusCounts,
  subscriptionStatusMeta,
  summarizePayments,
  toBillingList,
  toCsv,
  type PgPayment,
} from "./admin-billing.ts";

const ROOT = new URL("../../", import.meta.url);
const readRoot = (rel: string) => readFileSync(new URL(rel, ROOT), "utf8");

const UUID = "0f8e6c2a-1b2c-4d3e-8f90-a1b2c3d4e5f6";
const UUID2 = "1a2b3c4d-5e6f-4a1b-9c2d-3e4f5a6b7c8d";
const NOW = Date.parse("2026-09-30T05:00:00Z"); // 한국 14:00

function payment(p: Partial<PgPayment> = {}): PgPayment {
  return {
    id: UUID,
    orderId: "ORD-0001",
    owner: UUID2,
    ownerUsername: "alice",
    product: "monthly",
    orderName: null,
    amount: 12_900,
    currency: "KRW",
    status: "paid",
    refundedAmount: 0,
    method: "카드",
    pg: "toss",
    subscriptionId: null,
    requestedAt: "2026-09-30T01:00:00Z",
    approvedAt: "2026-09-30T01:00:40Z",
    cancelledAt: null,
    createdAt: "2026-09-30T01:00:00Z",
    ...p,
  };
}

/* ── 상태 ─────────────────────────────────────────────────────────────── */

/** SQL 표 하나의 check (status in (…)) 값 목록. */
function sqlStatuses(sql: string, table: string): string[] {
  const start = sql.indexOf(`create table if not exists public.${table} (`);
  assert.ok(start >= 0, `${table} 표를 SQL 에서 못 찾았다`);
  const end = sql.indexOf(");\n", start);
  const block = sql.slice(start, end);
  const m = /status\s+text[^\n]*\n?\s*check \(status in \(([^)]*)\)\)/.exec(block);
  assert.ok(m, `${table} 의 status check 를 못 찾았다`);
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
}

describe("상태 목록은 SQL 과 같다", () => {
  const sql = readRoot("supabase-admin-console.sql");
  it("payments", () => assert.deepEqual(sqlStatuses(sql, "payments"), [...PAYMENT_STATUSES]));
  it("subscriptions", () => assert.deepEqual(sqlStatuses(sql, "subscriptions"), [...SUBSCRIPTION_STATUSES]));
  it("payment_refunds", () => assert.deepEqual(sqlStatuses(sql, "payment_refunds"), [...REFUND_STATUSES]));
  it("구독 목록 함수는 cancel_scheduled 도 받는다", () => {
    assert.match(sql, new RegExp(`'${CANCEL_SCHEDULED}'`));
  });
});

describe("상태 이름·색", () => {
  it("모든 결제 상태에 한국어 이름이 있다(글자 그대로가 아니다)", () => {
    for (const s of PAYMENT_STATUSES) assert.notEqual(paymentStatusMeta(s).label, s, s);
    assert.deepEqual(paymentStatusMeta("paid"), { label: "결제 완료", tone: "green" });
    assert.deepEqual(paymentStatusMeta("cancelled"), { label: "결제 전 취소", tone: "gray" });
    assert.equal(paymentStatusMeta("partial_refunded").tone, "amber");
    assert.equal(paymentStatusMeta("failed").tone, "red");
  });
  it("모든 구독·환불 상태에 이름이 있다", () => {
    for (const s of SUBSCRIPTION_STATUSES) assert.notEqual(subscriptionStatusMeta(s, false).label, s, s);
    for (const s of REFUND_STATUSES) assert.notEqual(refundStatusMeta(s).label, s, s);
    assert.equal(subscriptionStatusMeta("past_due", false).tone, "red");
    assert.equal(refundStatusMeta("withdrawn").label, "요청 취소");
  });
  it("모르는 상태는 회색 글자 그대로(지어내지 않는다)", () => {
    assert.deepEqual(paymentStatusMeta("chargeback"), { label: "chargeback", tone: "gray" });
    assert.deepEqual(refundStatusMeta(""), { label: "–", tone: "gray" });
    assert.deepEqual(paymentStatusMeta("constructor"), { label: "constructor", tone: "gray" });
  });
  it("해지 예약 꼬리표는 살아 있는 구독에만", () => {
    assert.deepEqual(subscriptionStatusMeta("active", true).extra, { label: "해지 예약", tone: "amber" });
    assert.ok(subscriptionStatusMeta("trialing", true).extra);
    assert.equal(subscriptionStatusMeta("cancelled", true).extra, undefined);
    assert.equal(subscriptionStatusMeta("active", false).extra, undefined);
  });
  it("칩 목록은 '전체' + 그 목록의 상태를 모두 덮는다", () => {
    assert.equal(PAYMENT_STATUS_CHIPS[0].value, "all");
    assert.deepEqual(PAYMENT_STATUS_CHIPS.slice(1).map((c) => c.value).sort(), [...PAYMENT_STATUSES].sort());
    assert.deepEqual(REFUND_STATUS_CHIPS.slice(1).map((c) => c.value), [...REFUND_STATUSES]);
    assert.deepEqual(
      SUBSCRIPTION_STATUS_CHIPS.slice(1).map((c) => c.value).sort(),
      [...SUBSCRIPTION_STATUSES, CANCEL_SCHEDULED].sort(),
    );
  });
  it("요금제 이름은 plans.ts 에서, 모르는 코드는 그대로", () => {
    assert.equal(planLabel("monthly"), "가족 패스 (월간)");
    assert.equal(planLabel("yearly"), "가족 패스 (연간)");
    assert.equal(planLabel("extra3"), "추가 3권");
    assert.equal(planLabel("starter"), "스타트팩");
    assert.equal(planLabel("credit"), "크레딧");
    assert.equal(planLabel("weekly"), "weekly");
    assert.equal(planLabel(""), "–");
  });
});

/* ── 거르기 ───────────────────────────────────────────────────────────── */

describe("parseBillingQuery — 서버가 받는 주소 칸", () => {
  const sp = (s: string) => new URLSearchParams(s);
  it("기본값: 전체 · 200건", () => {
    const r = parseBillingQuery(sp(""), NOW, "payments");
    assert.ok(r.ok);
    assert.deepEqual(r.value, { status: null, q: null, period: "all", from: null, to: null, owner: null, subscription: null, limit: 200 });
  });
  it("오늘 = 한국 0시부터(UTC 전날 15시)", () => {
    const r = parseBillingQuery(sp("period=today&status=paid&q=%20alice%20"), NOW, "payments");
    assert.ok(r.ok);
    assert.equal(r.value.from, "2026-09-29T15:00:00.000Z");
    assert.equal(r.value.to, null);
    assert.equal(r.value.status, "paid");
    assert.equal(r.value.q, "alice");
  });
  it("모르는 상태 · 65자 검색어 · id 아닌 owner · 모르는 기간은 400", () => {
    assert.equal(parseBillingQuery(sp("status=paidd"), NOW, "payments").ok, false);
    assert.equal(parseBillingQuery(sp(`q=${"가".repeat(65)}`), NOW, "payments").ok, false);
    assert.equal(parseBillingQuery(sp(`q=${"가".repeat(64)}`), NOW, "payments").ok, true);
    assert.equal(parseBillingQuery(sp("owner=abc"), NOW, "payments").ok, false);
    assert.equal(parseBillingQuery(sp("subscription=demo-s01"), NOW, "payments").ok, false);
    assert.equal(parseBillingQuery(sp("period=90d"), NOW, "payments").ok, false);
  });
  it("해지 예약은 구독 목록에서만", () => {
    assert.equal(parseBillingQuery(sp("status=cancel_scheduled"), NOW, "subscriptions").ok, true);
    assert.equal(parseBillingQuery(sp("status=cancel_scheduled"), NOW, "payments").ok, false);
    assert.equal(parseBillingQuery(sp("status=requested"), NOW, "payments").ok, false);
    assert.equal(parseBillingQuery(sp("status=requested"), NOW, "refunds").ok, true);
  });
  it("owner·subscription 은 대문자 uuid 도 소문자로 · 맞지 않는 목록에서는 버린다", () => {
    const r = parseBillingQuery(sp(`owner=${UUID.toUpperCase()}&subscription=${UUID2}`), NOW, "payments");
    assert.ok(r.ok);
    assert.equal(r.value.owner, UUID);
    assert.equal(r.value.subscription, UUID2);
    const s = parseBillingQuery(sp(`subscription=${UUID2}&period=today`), NOW, "subscriptions");
    assert.ok(s.ok);
    assert.equal(s.value.subscription, null);
    assert.equal(s.value.from, null, "구독은 기간으로 거르지 않는다");
    const f = parseBillingQuery(sp(`owner=${UUID}`), NOW, "refunds");
    assert.ok(f.ok);
    assert.equal(f.value.owner, null);
  });
  it("limit 은 1~500", () => {
    const lim = (v: string) => {
      const r = parseBillingQuery(sp(`limit=${v}`), NOW, "refunds");
      assert.ok(r.ok);
      return r.value.limit;
    };
    assert.equal(lim("0"), 1);
    assert.equal(lim("999999"), 500);
    assert.equal(lim("abc"), 200);
    assert.equal(lim("50"), 50);
  });
});

describe("readBillingFilter — 화면은 이상한 주소도 '전체'로 연다", () => {
  it("모르는 값은 기본값, 검색어는 64자로 자른다", () => {
    const f = readBillingFilter(new URLSearchParams(`status=x&period=1y&q=${"a".repeat(70)}`), "payments");
    assert.deepEqual(f, { status: "all", q: "a".repeat(64), period: "all" });
    assert.equal(hasBillingFilter(f), true);
    assert.equal(hasBillingFilter({ status: "all", q: "", period: "all" }), false);
  });
  it("기간은 결제에만", () => {
    assert.equal(readBillingFilter(new URLSearchParams("period=7d"), "payments").period, "7d");
    assert.equal(readBillingFilter(new URLSearchParams("period=7d"), "refunds").period, "all");
    assert.equal(readBillingFilter(new URLSearchParams("status=cancel_scheduled"), "subscriptions").status, CANCEL_SCHEDULED);
  });
  it("목록 경로는 기본값을 빼고 만든다", () => {
    assert.equal(billingListPath("payments", { status: "all", q: "", period: "all" }), "/api/admin/billing/payments");
    assert.equal(
      billingListPath("payments", { status: "paid", q: "앨리스", period: "7d" }),
      `/api/admin/billing/payments?status=paid&q=${encodeURIComponent("앨리스").replace(/%20/g, "+")}&period=7d`,
    );
    assert.equal(billingListPath("refunds", { status: "all", q: "", period: "7d" }), "/api/admin/billing/refunds");
    assert.equal(
      billingListPath("payments", { status: "all", q: "", period: "all" }, { subscription: UUID }),
      `/api/admin/billing/payments?subscription=${UUID}`,
    );
  });
  it("다른 탭으로 건너가기는 거르기를 풀고 id·찾을 말을 넣는다", () => {
    assert.deepEqual(jumpPatch("payments", "x"), { tab: null, id: "x", status: null, period: null, q: null });
    assert.deepEqual(jumpPatch("subscriptions", "s", "alice"), { tab: "subscriptions", id: "s", status: null, period: null, q: "alice" });
    assert.equal(jumpPatch("refunds", "r", "a".repeat(80)).q?.length, 64);
  });
});

describe("filterBillingRows — DB 함수와 같은 뜻", () => {
  const rows = [
    payment({ id: "a", orderId: "ORD-AAAA01", ownerUsername: "Alice", status: "paid", createdAt: "2026-09-29T15:00:00.000Z" }),
    payment({ id: "b", orderId: "ORD-BBBB02", ownerUsername: "bob", status: "failed", createdAt: "2026-09-29T14:59:59.999Z" }),
    payment({ id: "c", orderId: "ORD-CCCC03", owner: null, ownerUsername: "carol", status: "paid", subscriptionId: "s1" }),
  ];
  it("q 는 주문번호 정확히 같음 또는 아이디 포함(대소문자 무시)", () => {
    assert.deepEqual(filterBillingRows(rows, { q: "ORD-BBBB02" }).map((r) => r.id), ["b"]);
    assert.deepEqual(filterBillingRows(rows, { q: "ORD-BBBB" }).map((r) => r.id), [], "주문번호 일부로는 찾지 않는다");
    assert.deepEqual(filterBillingRows(rows, { q: "ALI" }).map((r) => r.id), ["a"]);
    assert.deepEqual(filterBillingRows(rows, { q: "  " }).length, 3);
  });
  it("기간은 [from, to) — 한국 0시 경계", () => {
    assert.deepEqual(filterBillingRows(rows.slice(0, 2), { from: "2026-09-29T15:00:00.000Z" }).map((r) => r.id), ["a"]);
    assert.deepEqual(filterBillingRows(rows.slice(0, 2), { to: "2026-09-29T15:00:00.000Z" }).map((r) => r.id), ["b"]);
  });
  it("상태 · owner · subscription · 'all'", () => {
    assert.deepEqual(filterBillingRows(rows, { status: "paid" }).map((r) => r.id), ["a", "c"]);
    assert.equal(filterBillingRows(rows, { status: "all" }).length, 3);
    assert.deepEqual(filterBillingRows(rows, { subscription: "s1" }).map((r) => r.id), ["c"]);
    assert.deepEqual(filterBillingRows(rows, { owner: UUID2 }).map((r) => r.id), ["a", "b"]);
  });
  it("해지 예약은 살아 있는 구독 중 cancelAtPeriodEnd 인 것만", () => {
    const subs = [
      { id: "1", status: "active", cancelAtPeriodEnd: true, owner: null, ownerUsername: "a" },
      { id: "2", status: "cancelled", cancelAtPeriodEnd: true, owner: null, ownerUsername: "b" },
      { id: "3", status: "active", cancelAtPeriodEnd: false, owner: null, ownerUsername: "c" },
    ];
    assert.deepEqual(filterBillingRows(subs, { status: CANCEL_SCHEDULED }).map((r) => r.id), ["1"]);
    assert.deepEqual(statusCounts(subs, SUBSCRIPTION_STATUS_CHIPS), {
      all: 3, active: 2, trialing: 0, past_due: 0, cancel_scheduled: 1, cancelled: 1, expired: 0,
    });
  });
});

/* ── 돈 ─────────────────────────────────────────────────────────────────── */

describe("환불 가능액 · 단추", () => {
  it("결제 금액 − 환불된 금액 − 처리 기다리는 요청", () => {
    const p = payment({ amount: 119_000, status: "partial_refunded", refundedAmount: 59_500 });
    assert.equal(refundableAmount(p, []), 59_500);
    assert.equal(
      refundableAmount(p, [
        { amount: 10_000, status: "requested" },
        { amount: 5_000, status: "withdrawn" },
        { amount: 3_000, status: "failed" },
        { amount: 59_500, status: "done" },
      ]),
      49_500,
      "요청됨만 뺀다(끝난 환불은 이미 refundedAmount 에 있다)",
    );
  });
  it("결제 완료·부분 환불 말고는 0, 음수는 없다", () => {
    for (const s of ["pending", "failed", "cancelled", "refunded"]) assert.equal(refundableAmount(payment({ status: s }), []), 0, s);
    assert.equal(refundableAmount(payment(), [{ amount: 99_999, status: "requested" }]), 0);
  });
  it("canRequestRefund: 시연·대기·전액 환불·전부 요청됨은 거짓", () => {
    assert.equal(canRequestRefund(payment(), []), true);
    assert.equal(canRequestRefund(payment({ demo: true }), []), false);
    assert.equal(canRequestRefund(payment({ id: "demo-p01" }), []), false);
    assert.equal(canRequestRefund(payment({ status: "pending" }), []), false);
    assert.equal(canRequestRefund(payment({ status: "refunded", refundedAmount: 12_900 }), []), false);
    assert.equal(canRequestRefund(payment(), [{ amount: 12_900, status: "requested" }]), false);
  });
  it("canWithdrawRefund: 요청됨인 실제 줄만", () => {
    assert.equal(canWithdrawRefund({ id: UUID, status: "requested" }), true);
    assert.equal(canWithdrawRefund({ id: UUID, status: "done" }), false);
    assert.equal(canWithdrawRefund({ id: "demo-r01", status: "requested" }), false);
    assert.equal(canWithdrawRefund({ id: UUID, status: "requested", demo: true }), false);
  });
  it("summarizePayments: 승인된 결제(전액 환불 포함)를 센다", () => {
    const s = summarizePayments([
      payment({ amount: 12_900 }),
      payment({ amount: 119_000, status: "partial_refunded", refundedAmount: 59_500 }),
      payment({ amount: 12_900, status: "refunded", refundedAmount: 12_900 }),
      payment({ amount: 4_900, status: "pending" }),
      payment({ amount: 4_900, status: "failed" }),
    ]);
    assert.deepEqual(s, { paidCount: 3, paidWon: 144_800, refundedWon: 72_400, netWon: 72_400 });
    assert.deepEqual(summarizePayments([]), { paidCount: 0, paidWon: 0, refundedWon: 0, netWon: 0 });
  });
});

describe("입력 검사", () => {
  it("parseWonInput: 쉼표 허용, 1원 ~ max", () => {
    assert.deepEqual(parseWonInput("12,900", 12_900), { ok: true, value: 12_900 });
    assert.deepEqual(parseWonInput(" 500 ", 12_900), { ok: true, value: 500 });
    assert.equal(parseWonInput("12901", 12_900).ok, false);
    assert.equal(parseWonInput("0", 12_900).ok, false);
    assert.equal(parseWonInput("1e3", 12_900).ok, false);
    assert.equal(parseWonInput("-1", 12_900).ok, false);
    assert.equal(parseWonInput("1.5", 12_900).ok, false);
    const none = parseWonInput("1", 0);
    assert.ok(!none.ok && /없어요/.test(none.error));
  });
  it("parseRefundRequest: 범위 · 사유 · 시연 id 거절 · uuid 소문자", () => {
    const ok = parseRefundRequest({ paymentId: UUID.toUpperCase(), amount: 12_900, reason: "  환불해 주세요 " });
    assert.deepEqual(ok, { ok: true, value: { paymentId: UUID, amount: 12_900, reason: "환불해 주세요" } });
    assert.deepEqual(parseRefundRequest({ paymentId: UUID, amount: "500", reason: "ab" }), {
      ok: true,
      value: { paymentId: UUID, amount: 500, reason: "ab" },
    });
    const demo = parseRefundRequest({ paymentId: "demo-p01", amount: 1, reason: "시연이에요" });
    assert.deepEqual(demo, { ok: false, error: "시연 데이터는 처리할 수 없어요." });
    assert.equal(parseRefundRequest({ paymentId: "abc", amount: 1, reason: "ab" }).ok, false);
    for (const amount of [0, -1, 1.5, 10_000_001, "1e3", null, "12,900"]) {
      assert.equal(parseRefundRequest({ paymentId: UUID, amount, reason: "ab" }).ok, false, String(amount));
    }
    assert.equal(parseRefundRequest({ paymentId: UUID, amount: 10_000_000, reason: "ab" }).ok, true);
    assert.equal(parseRefundRequest({ paymentId: UUID, amount: 1, reason: "a" }).ok, false);
    assert.equal(parseRefundRequest({ paymentId: UUID, amount: 1, reason: "a".repeat(501) }).ok, false);
    assert.equal(parseRefundRequest(null).ok, false);
    assert.equal(parseRefundRequest([UUID]).ok, false);
  });
  it("parseRefundWithdraw: 메모는 선택, 500자까지", () => {
    assert.deepEqual(parseRefundWithdraw({ refundId: UUID }), { ok: true, value: { refundId: UUID, note: null } });
    assert.deepEqual(parseRefundWithdraw({ refundId: UUID, note: "  " }), { ok: true, value: { refundId: UUID, note: null } });
    assert.equal(parseRefundWithdraw({ refundId: UUID, note: "a".repeat(501) }).ok, false);
    assert.deepEqual(parseRefundWithdraw({ refundId: "demo-r01" }), { ok: false, error: "시연 데이터는 처리할 수 없어요." });
  });
  it("isDemoId", () => {
    assert.equal(isDemoId("demo-p01"), true);
    assert.equal(isDemoId(" DEMO-x"), true);
    assert.equal(isDemoId(UUID), false);
    assert.equal(isDemoId(null), false);
  });
  it("DB 의 '찾을 수 없어요'(42501)만 404 로 본다", () => {
    assert.equal(isNotFoundDbError({ code: "42501", message: "결제를 찾을 수 없어요." }), true);
    assert.equal(isNotFoundDbError({ code: "42501", message: "권한이 없습니다." }), false);
    assert.equal(isNotFoundDbError({ code: "22023", message: "결제를 찾을 수 없어요." }), false);
    assert.equal(isNotFoundDbError(null), false);
  });
});

/* ── DB 줄 → 화면 ──────────────────────────────────────────────────────── */

describe("DB 줄 바꾸기", () => {
  it("결제 목록 줄 + 전체 수·잘림", () => {
    const list = toBillingList(
      [
        { id: UUID, order_id: "ORD-1", owner: null, owner_username: "gone", product: "monthly", amount: "12900", status: "paid", refunded_amount: 0, currency: "KRW", created_at: "2026-09-30T00:00:00Z", requested_at: "2026-09-30T00:00:00Z", total_count: 7 },
      ],
      mapPaymentRow,
    );
    assert.equal(list.schemaReady, true);
    assert.equal(list.total, 7);
    assert.equal(list.truncated, true);
    assert.equal(list.rows[0].amount, 12_900);
    assert.equal(list.rows[0].owner, null);
    assert.equal(list.rows[0].ownerUsername, "gone");
    assert.equal(list.rows[0].subscriptionId, null);
    assert.deepEqual(toBillingList(null, mapPaymentRow), { schemaReady: true, rows: [], total: 0, truncated: false });
  });
  it("구독 줄: 자동결제는 등록 여부만", () => {
    const s = mapSubscriptionRow({ id: UUID, plan: "yearly", status: "active", cancel_at_period_end: true, has_billing_key: true, billing_key_ref: "secret-ref", created_at: "x" });
    assert.equal(s.hasBillingKey, true);
    assert.equal(s.cancelAtPeriodEnd, true);
    assert.ok(!JSON.stringify(s).includes("secret-ref"), "자동결제 키 이름이 새지 않는다");
  });
  it("환불 줄", () => {
    const r = mapRefundRow({ id: UUID, payment_id: UUID2, order_id: "ORD-1", amount: 500, reason: "r", status: "requested", requested_at: "t" });
    assert.equal(r.paymentId, UUID2);
    assert.equal(r.orderId, "ORD-1");
    assert.equal(r.processedAt, null);
  });
  it("상세: 결제 키·원문·환불·구독, 안전하지 않은 영수증 주소는 버린다", () => {
    const d = mapPaymentDetail({
      payment: {
        id: UUID, order_id: "ORD-1", product: "monthly", amount: 12900, status: "paid", refunded_amount: 0,
        pg_payment_key: "tgen_20260930ABCDEFA1B2", raw: { a: 1 }, receipt_url: "javascript:alert(1)",
        failure_code: null, subscription_id: UUID2, created_at: "t", requested_at: "t",
      },
      refunds: [{ id: "r1", payment_id: UUID, order_id: "ORD-1", amount: 100, reason: "x", status: "requested", requested_at: "t" }, "junk"],
      subscription: { id: UUID2, plan: "monthly", status: "active", has_billing_key: false, created_at: "t" },
    });
    assert.ok(d);
    assert.equal(d.pgPaymentKey, "tgen_20260930ABCDEFA1B2");
    assert.deepEqual(d.raw, { a: 1 });
    assert.equal(d.receiptUrl, null);
    assert.equal(d.refunds.length, 1);
    assert.equal(d.subscription?.id, UUID2);
    assert.equal(mapPaymentDetail({ payment: null }), null);
    assert.equal(mapPaymentDetail("x"), null);
    const safe = mapPaymentDetail({ payment: { id: UUID, receipt_url: "https://receipt.example.com/r/1" }, refunds: null, subscription: null });
    assert.equal(safe?.receiptUrl, "https://receipt.example.com/r/1");
    assert.deepEqual(safe?.refunds, []);
  });
});

/* ── 보여 주기 ─────────────────────────────────────────────────────────── */

describe("보여 주기", () => {
  it("maskKey: 앞 9 + 끝 4, 짧으면 앞만, 없으면 –", () => {
    assert.equal(maskKey("tgen_20260930ABCDEFA1B2"), "tgen_2026…A1B2");
    assert.equal(maskKey("abcdefghijklmn"), "abcdefghi…klmn");
    assert.equal(maskKey("abcdefghijklm"), "abcd…", "13자 이하는 앞만 — 끝을 보이지 않는다");
    assert.equal(maskKey("ab"), "a…");
    assert.equal(maskKey(""), "–");
    assert.equal(maskKey(null), "–");
  });
  it("isSafeReceiptUrl: https 만", () => {
    assert.equal(isSafeReceiptUrl("https://dashboard.example.com/receipt?id=1"), true);
    for (const u of [
      "javascript:alert(1)",
      "http://example.com/r",
      "data:text/html,<script>alert(1)</script>",
      "https://user:pass@example.com/r",
      `https://example.com/${"a".repeat(500)}`,
      "//example.com",
      "",
      42,
      null,
    ]) {
      assert.equal(isSafeReceiptUrl(u), false, String(u));
    }
  });
  it("rawPreview: 글자로, 길면 자르고, 순환 참조에도 멈추지 않는다", () => {
    assert.equal(rawPreview(null), "");
    assert.equal(rawPreview({ a: 1 }), '{\n  "a": 1\n}');
    const long = rawPreview({ s: "x".repeat(100) }, 20);
    assert.ok(long.startsWith('{\n  "s": "xxxxxxxxxx'.slice(0, 20)));
    assert.match(long, /자 더 있어요\)$/);
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    assert.match(rawPreview(loop), /바꾸지 못했어요/);
    assert.equal(rawPreview("<script>alert(1)</script>"), '"<script>alert(1)</script>"', "HTML 은 글자 그대로(화면이 글자로만 넣는다)");
  });
  it("formatPeriodRange: 한국 날짜 M/D–M/D, 해가 다르면 해까지", () => {
    assert.equal(formatPeriodRange("2026-09-29T15:30:00Z", "2026-10-29T15:30:00Z"), "9/30–10/30");
    assert.equal(formatPeriodRange("2026-12-15T00:00:00Z", "2027-01-15T00:00:00Z"), "2026/12/15–2027/1/15");
    assert.equal(formatPeriodRange(null, "2026-10-01T00:00:00Z"), "–");
  });
  it("memberText: 탈퇴한 회원은 아이디 사진과 함께", () => {
    assert.equal(memberText(UUID, "alice"), "alice");
    assert.equal(memberText(null, "alice"), "탈퇴한 회원 · alice");
    assert.equal(memberText(null, null), "탈퇴한 회원");
  });
  it("josa: 받침에 맞는 조사", () => {
    assert.equal(josa("결제", "이가"), "결제가");
    assert.equal(josa("구독", "이가"), "구독이");
    assert.equal(josa("환불 요청", "을를"), "환불 요청을");
    assert.equal(josa("결제", "을를"), "결제를");
    assert.equal(josa("PG", "이가"), "PG가");
  });
});

describe("CSV", () => {
  const cols = [
    { header: "이름", value: (r: { a: unknown }) => r.a as string | number | null },
  ];
  it("수식 주입 막기 — = + - @ 탭 CR 로 시작하는 글자 칸에 ' 를 붙인다", () => {
    const rows = [{ a: "=1+1" }, { a: "+x" }, { a: "-x" }, { a: "@x" }, { a: "\tx" }, { a: "\rx" }, { a: "=HYPERLINK(\"http://x\")" }];
    const lines = toCsv(rows, cols).split("\r\n");
    assert.equal(lines[0], "이름");
    assert.equal(lines[1], "'=1+1");
    assert.equal(lines[2], "'+x");
    assert.equal(lines[3], "'-x");
    assert.equal(lines[4], "'@x");
    assert.equal(lines[5], "'\tx");
    assert.equal(lines[6], "\"'\rx\"", "CR 로 시작하면 ' 를 붙이고 따옴표로 감싼다");
    assert.equal(lines[7], "\"'=HYPERLINK(\"\"http://x\"\")\"");
  });
  it("쉼표·따옴표·줄바꿈은 따옴표로, 숫자는 그대로(음수도), 빈 값은 빈 칸, 줄 끝은 CRLF", () => {
    const csv = toCsv([{ a: "a,b" }, { a: 'say "hi"' }, { a: "줄\n바꿈" }, { a: -500 }, { a: null }, { a: 12_900 }, { a: " 앞공백" }], cols);
    assert.equal(csv, '이름\r\n"a,b"\r\n"say ""hi"""\r\n"줄\n바꿈"\r\n-500\r\n\r\n12900\r\n" 앞공백"\r\n');
  });
  it("결제 CSV 는 한국 시각·한국어 상태로", () => {
    const csv = toCsv([payment({ owner: null, ownerUsername: "gone" })], PAYMENT_CSV);
    assert.match(csv, /2026\. 9\. 30\. 10:00/);
    assert.match(csv, /탈퇴한 회원 · gone/);
    assert.match(csv, /결제 완료/);
    assert.match(csv, /가족 패스 \(월간\)/);
  });
  it("파일 이름: 한국 날짜 · 시연은 '시연-'", () => {
    assert.equal(csvFilename("payments", false, Date.parse("2026-09-30T15:30:00Z")), "payments-20261001.csv");
    assert.equal(csvFilename("refunds", true, NOW), "시연-refunds-20260930.csv");
  });
});

/* ── SQL 두 곳이 같은가 ───────────────────────────────────────────────── */

describe("SQL 26번", () => {
  it("supabase-admin-console.sql 본문 = supabase-setup.sql 26번(표시 줄 사이 글자 그대로)", () => {
    const START = "-- ▼ 26번 시작 (supabase-admin-console.sql 과 같은 내용)";
    const END = "-- ▲ 26번 끝";
    const body = (sql: string) => {
      const norm = sql.replace(/\r\n/g, "\n");
      const a = norm.indexOf(START);
      const b = norm.indexOf(END, a);
      assert.ok(a >= 0 && b > a, "26번 표시 줄을 못 찾았다");
      return norm.slice(a, b + END.length);
    };
    assert.equal(body(readRoot("supabase-admin-console.sql")), body(readRoot("supabase-setup.sql")));
  });
});
