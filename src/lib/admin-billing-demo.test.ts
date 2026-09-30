/**
 * 관리실 '결제·구독' 시연 데이터 시험(2026-09-30).
 *
 * 시연 줄은 화면에만 있어야 한다 — DB 에 쓰이거나 서버로 가면 가짜 결제가 진짜 기록에 섞인다. 그래서
 *  · 모든 줄이 demo:true 이고 id 가 demo- 로 시작하며 uuid 가 아니다(처리 경로가 거절한다).
 *  · 시연 모듈은 서버·DB·저장소를 부르는 글자가 없고, 서버 경로(src/app/api)는 이 모듈을 가져오지 않는다.
 *  · 결제·구독 화면에서 쓰는 길은 billing-actions.tsx 둘뿐이고, 둘 다 보내기 전에 시연 id 를 막는다.
 *  · 줄끼리 맞는다(금액은 요금제 값, 환불액 = 끝난 환불 합, SQL 의 상태·금액 규칙).
 *  · 같은 한국 날짜면 늘 같은 줄(새로 고침해도 같은 화면).
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { isUuid } from "./admin.ts";
import {
  PAYMENT_STATUSES,
  REFUND_STATUSES,
  SUBSCRIPTION_STATUSES,
  canRequestRefund,
  canWithdrawRefund,
  parseRefundRequest,
  parseRefundWithdraw,
  refundableAmount,
} from "./admin-billing.ts";
import { demoBilling } from "./admin-billing-demo.ts";
import { parseAdminId } from "./admin-console.ts";
import { PLANS, PLAN_IDS, isPlanId } from "./plans.ts";

const SRC = new URL("../", import.meta.url); // src/
const at = (rel: string) => new URL(rel, SRC);
const read = (rel: string) => readFileSync(at(rel), "utf8");

function listFiles(dirRel: string): string[] {
  const dir = at(`${dirRel}/`);
  if (!existsSync(dir)) return [];
  return (readdirSync(dir, { recursive: true }) as unknown[])
    .map((f) => String(f).replace(/\\/g, "/"))
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .map((f) => `${dirRel}/${f}`);
}

const NOW = new Date("2026-09-30T05:00:00Z"); // 한국 14:00
const KST_MIDNIGHT = Date.parse("2026-09-29T15:00:00Z");
const d = demoBilling(NOW);
const nestedRefunds = d.payments.flatMap((p) => p.refunds);
const nestedSubs = d.payments.flatMap((p) => (p.subscription ? [p.subscription] : []));
const allRows = [...d.payments, ...d.subscriptions, ...d.refunds, ...nestedRefunds, ...nestedSubs];

describe("시연 줄 표시", () => {
  it("줄 수: 결제 ~14 · 구독 6 · 환불 3 이상", () => {
    assert.ok(d.payments.length >= 12 && d.payments.length <= 16, String(d.payments.length));
    assert.equal(d.subscriptions.length, 6);
    assert.ok(d.refunds.length >= 3);
  });
  it("모든 줄이 demo:true · id 는 demo- 로 시작 · uuid 아님 · 겹치지 않음", () => {
    for (const r of allRows) {
      assert.equal(r.demo, true, r.id);
      assert.match(r.id, /^demo-/);
      assert.equal(isUuid(r.id), false, r.id);
    }
    for (const list of [d.payments, d.subscriptions, d.refunds]) {
      assert.equal(new Set(list.map((r) => r.id)).size, list.length);
    }
  });
  it("처리 경로는 모든 시연 id 를 거절한다(서버로 가도 DB 에 닿지 않는다)", () => {
    for (const r of allRows) assert.deepEqual(parseAdminId(r.id), { ok: false, error: "시연 데이터는 처리할 수 없어요." });
    for (const p of d.payments) assert.equal(parseRefundRequest({ paymentId: p.id, amount: 1, reason: "시연 확인" }).ok, false);
    for (const r of d.refunds) assert.equal(parseRefundWithdraw({ refundId: r.id }).ok, false);
  });
  it("시연 줄에는 단추가 켜지지 않는다", () => {
    for (const p of d.payments) assert.equal(canRequestRefund(p, p.refunds), false, p.id);
    for (const r of d.refunds) assert.equal(canWithdrawRefund(r), false, r.id);
  });
  it("회원 이름은 누가 봐도 가짜, 영수증 주소는 없음, 원문에는 '시연' 표시", () => {
    for (const r of allRows) if ("ownerUsername" in r && r.ownerUsername) assert.match(r.ownerUsername, /^시연회원\d{2}$/);
    for (const p of d.payments) {
      assert.equal(p.receiptUrl, null);
      assert.equal((p.raw as Record<string, unknown>)["시연"], true);
    }
    assert.ok(d.payments.some((p) => p.owner === null), "탈퇴한 회원 줄이 하나는 있다(보관 모습)");
  });
});

describe("시연 줄은 모든 상태를 보여 준다", () => {
  it("결제 · 구독 · 환불 상태가 빠짐없이 · 해지 예약도", () => {
    assert.deepEqual([...new Set(d.payments.map((p) => p.status))].sort(), [...PAYMENT_STATUSES].sort());
    assert.deepEqual([...new Set(d.subscriptions.map((s) => s.status))].sort(), [...SUBSCRIPTION_STATUSES].sort());
    assert.deepEqual([...new Set(d.refunds.map((r) => r.status))].sort(), [...REFUND_STATUSES].sort());
    assert.ok(d.subscriptions.some((s) => s.cancelAtPeriodEnd && ["trialing", "active", "past_due"].includes(s.status)));
    assert.deepEqual([...new Set(d.payments.map((p) => p.product))].sort(), [...PLAN_IDS].sort());
  });
});

describe("시연 줄끼리 맞는다(SQL 규칙과 같게)", () => {
  it("금액은 요금제 값 그대로", () => {
    for (const p of d.payments) {
      assert.ok(isPlanId(p.product), p.product);
      assert.equal(p.amount, PLANS[p.product as keyof typeof PLANS].priceWon, p.id);
      assert.match(p.orderId, /^[A-Za-z0-9_-]{6,64}$/);
      assert.equal(p.currency, "KRW");
    }
    for (const s of d.subscriptions) assert.ok(["monthly", "yearly"].includes(s.plan), s.plan);
  });
  it("환불액·상태·승인 시각 규칙(payments_refund_status · payments_approved)", () => {
    for (const p of d.payments) {
      if (p.status === "refunded") assert.equal(p.refundedAmount, p.amount, p.id);
      else if (p.status === "partial_refunded") assert.ok(p.refundedAmount > 0 && p.refundedAmount < p.amount, p.id);
      else assert.equal(p.refundedAmount, 0, p.id);
      if (["paid", "refunded", "partial_refunded"].includes(p.status)) assert.ok(p.approvedAt, p.id);
      const done = d.refunds.filter((r) => r.paymentId === p.id && r.status === "done").reduce((s, r) => s + r.amount, 0);
      assert.equal(p.refundedAmount, done, `${p.id}: 환불액 = 끝난 환불 합`);
      assert.ok(refundableAmount(p, p.refunds) >= 0);
    }
  });
  it("환불 줄은 있는 결제를 가리키고, 그 결제 금액을 넘지 않으며, 주인·주문번호가 같다", () => {
    const byId = new Map(d.payments.map((p) => [p.id, p]));
    for (const r of d.refunds) {
      const p = byId.get(r.paymentId);
      assert.ok(p, r.id);
      assert.ok(r.amount >= 1 && r.amount <= p.amount, r.id);
      assert.equal(r.orderId, p.orderId);
      assert.equal(r.ownerUsername, p.ownerUsername);
      assert.ok(r.reason.trim().length >= 2);
    }
  });
  it("결제 상세의 환불·구독 묶음이 목록과 같다", () => {
    for (const p of d.payments) {
      assert.deepEqual(p.refunds.map((r) => r.id).sort(), d.refunds.filter((r) => r.paymentId === p.id).map((r) => r.id).sort());
      if (p.subscriptionId) assert.equal(p.subscription?.id, p.subscriptionId);
      else assert.equal(p.subscription, null);
    }
    const subIds = new Set(d.subscriptions.map((s) => s.id));
    for (const p of d.payments) if (p.subscriptionId) assert.ok(subIds.has(p.subscriptionId), p.id);
  });
  it("살아 있는 구독은 한 사람에 하나, 기간 끝 > 시작", () => {
    const live = d.subscriptions.filter((s) => s.owner && ["trialing", "active", "past_due"].includes(s.status));
    assert.equal(new Set(live.map((s) => s.owner)).size, live.length);
    for (const s of d.subscriptions) {
      if (s.currentPeriodStart && s.currentPeriodEnd) assert.ok(Date.parse(s.currentPeriodEnd) > Date.parse(s.currentPeriodStart), s.id);
    }
  });
  it("최신순이다(DB 함수와 같은 순서)", () => {
    const desc = (xs: string[]) => xs.every((x, i) => i === 0 || xs[i - 1] >= x);
    assert.ok(desc(d.payments.map((p) => p.createdAt)));
    assert.ok(desc(d.subscriptions.map((s) => s.createdAt)));
    assert.ok(desc(d.refunds.map((r) => r.requestedAt)));
  });
  it("지난 기록은 오늘 0시 조금 뒤까지만 — 아침에 열어도 미래 시각이 거의 없다", () => {
    const limit = KST_MIDNIGHT + 60 * 60_000;
    for (const p of d.payments) assert.ok(Date.parse(p.createdAt) <= limit, p.id);
    for (const r of d.refunds) assert.ok(Date.parse(r.requestedAt) <= limit, r.id);
    assert.ok(d.payments.some((p) => Date.parse(p.createdAt) >= KST_MIDNIGHT), "'오늘' 거르기에 걸리는 줄이 있다");
  });
});

describe("같은 한국 날짜면 늘 같다", () => {
  it("같은 날 다른 시각 → 똑같은 줄", () => {
    assert.deepEqual(demoBilling(new Date("2026-09-29T15:00:00Z")), d); // 한국 0시
    assert.deepEqual(demoBilling(new Date("2026-09-30T14:59:59Z")), d); // 한국 23:59
  });
  it("다음 날은 하루씩 밀린다", () => {
    const next = demoBilling(new Date("2026-09-30T15:00:00Z"));
    assert.equal(Date.parse(next.payments[0].createdAt) - Date.parse(d.payments[0].createdAt), 86_400_000);
  });
});

describe("시연 모듈은 화면에만", () => {
  const src = read("lib/admin-billing-demo.ts");
  it("서버·DB·브라우저 저장소로 가는 글자가 없다", () => {
    for (const w of ["fetch(", ".rpc(", ".insert(", ".upsert(", ".update(", ".delete(", "authedFetch", "getSupabase", "@/lib/supabase", "localStorage", "sessionStorage", "createClient"]) {
      assert.ok(!src.includes(w), `시연 모듈에 "${w}"`);
    }
  });
  it("가져오는 것은 plans.ts 와 admin-billing.ts 뿐", () => {
    const specs = [...src.matchAll(/\bfrom\s*["']([^"']+)["']/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(specs)].sort(), ["./admin-billing.ts", "./plans.ts"]);
  });
  it("결제사 상품·간편결제 상표 이름이 없다", () => {
    assert.doesNotMatch(src, /toss|portone|iamport|inicis|nicepay|kakao|naver|payco|카카오|네이버|토스|페이코/i);
  });
  it("서버 경로는 시연 모듈을 가져오지 않고, 가져오는 곳은 결제·구독 화면과 시험뿐", () => {
    const all = (readdirSync(SRC, { recursive: true }) as unknown[])
      .map((f) => String(f).replace(/\\/g, "/"))
      .filter((f) => /\.(ts|tsx)$/.test(f));
    const importers = all.filter((f) => f !== "lib/admin-billing-demo.ts" && /admin-billing-demo/.test(read(f)));
    for (const f of importers) {
      assert.ok(!f.startsWith("app/api/"), `서버 경로가 시연 모듈을 가져온다: ${f}`);
      assert.ok(f.startsWith("components/admin/billing/") || f.endsWith(".test.ts"), `허용 밖에서 가져온다: ${f}`);
    }
    assert.ok(importers.some((f) => f.startsWith("components/admin/billing/")), "결제·구독 화면이 시연 모듈을 쓴다");
  });
});

describe("결제·구독 화면에서 쓰는 길은 billing-actions.tsx 둘뿐이다", () => {
  const files = listFiles("components/admin/billing");
  it("화면 파일이 있다", () => {
    for (const f of ["BillingPage.tsx", "billing-actions.tsx", "PaymentDrawer.tsx", "RefundDrawer.tsx"]) {
      assert.ok(files.includes(`components/admin/billing/${f}`), f);
    }
  });
  it("쓰기 경로(refund-request · refund-withdraw)는 billing-actions.tsx 에만, 각각 한 번", () => {
    for (const f of files) {
      const src = read(f);
      const hits = src.match(/\/api\/admin\/billing\/refund-(request|withdraw)/g) ?? [];
      if (f.endsWith("/billing-actions.tsx")) assert.equal(hits.length, 2, f);
      else assert.equal(hits.length, 0, `${f}: 쓰기 경로는 billing-actions.tsx 에서만`);
    }
  });
  it("다른 화면 파일은 api 를 직접 부르지 않는다(읽기는 useAdminQuery)", () => {
    for (const f of files) {
      if (f.endsWith("/billing-actions.tsx")) continue;
      const src = read(f);
      assert.doesNotMatch(src, /\bapi\s*(<[^>]*>)?\s*\(/, `${f}: api() 를 직접 부른다`);
      assert.ok(!src.includes("authedFetch") && !src.includes("fetch("), f);
    }
  });
  it("쓰기 함수마다 보내기 전에 시연 줄을 막는다", () => {
    const src = read("components/admin/billing/billing-actions.tsx");
    const bodies = src.split("const submit = async").slice(1);
    assert.equal(bodies.length, 2, "submit 이 둘");
    for (const b of bodies) {
      const guard = b.indexOf("isDemoId(");
      const send = b.indexOf("await api");
      assert.ok(guard >= 0 && send > guard, "isDemoId 확인이 api 보다 먼저");
      assert.match(b.slice(0, send), /\.demo \|\| isDemoId\(/);
    }
  });
  it("띠·시연 스위치·결제 화면 상태(글자 그대로)", () => {
    const src = read("components/admin/billing/BillingPage.tsx");
    assert.ok(src.includes("결제 연동 전 — 실제 결제 데이터가 아직 없어요"));
    assert.ok(src.includes("시연 데이터 보기"));
    assert.ok(src.includes("payDemoState(process.env.NEXT_PUBLIC_PAY_DEMO)"));
    assert.ok(!src.includes("pay-demo\""), "결제 시연 모듈을 가져오지 않는다");
  });
});
