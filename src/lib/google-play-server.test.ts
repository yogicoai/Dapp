import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { GooglePlayClient } from "./google-play.ts";
import { GooglePlayError } from "./google-play.ts";
import {
  SYNC_MAX_CHECKS,
  needsCheck,
  parseOffered,
  summarize,
  syncPurchases,
  verifyPurchase,
  type BillingDb,
  type BillingDeps,
  type BillingTerms,
  type PurchaseRow,
} from "./google-play-server.ts";

const NOW = Date.parse("2026-12-01T00:00:00Z");
const TOKEN = "tok." + "a".repeat(40);
const TERMS: BillingTerms = {
  monthly: { priceWon: 9900, booksPerMonth: 4, drawTokensPerMonth: 5, drawTokensFirstMonth: 10 },
  yearly: { priceWon: 99000, booksPerMonth: 4, drawTokensPerMonth: 5, drawTokensFirstMonth: 10 },
  starter: { priceWon: 4900, books: 1, familyCharacters: 1 },
};

type Call = { method: "GET" | "POST"; path: string };

function fakeGoogle(answers: Record<string, unknown | Error>): { gp: GooglePlayClient; calls: Call[] } {
  const calls: Call[] = [];
  const answer = (method: "GET" | "POST", path: string) => {
    calls.push({ method, path });
    const key = Object.keys(answers).find((k) => path.includes(k));
    const a = key ? answers[key] : {};
    if (a instanceof Error) return Promise.reject(a);
    return Promise.resolve(a);
  };
  return {
    calls,
    gp: {
      packageName: "kr.yogico.voicestory",
      get: <T,>(p: string) => answer("GET", p) as Promise<T>,
      post: <T,>(p: string) => answer("POST", p) as Promise<T>,
    },
  };
}

function fakeDb(replies: Record<string, { data?: unknown; error?: { code?: string; message?: string } | null }>) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const db: BillingDb = {
    rpc(fn, args) {
      calls.push({ fn, args });
      const r = replies[fn] ?? { data: null };
      return Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
    },
  };
  return { db, calls };
}

const deps = (gp: GooglePlayClient): BillingDeps => ({ gp, key: "k".repeat(64), terms: async () => TERMS, now: () => NOW });

const activeSub = {
  subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
  acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING",
  latestOrderId: "GPA.1234-5678-9012-34567",
  lineItems: [
    {
      productId: "family_pass",
      expiryTime: "2026-12-20T00:00:00Z",
      autoRenewingPlan: { autoRenewEnabled: true, recurringPrice: { currencyCode: "KRW", units: "9900" } },
      offerDetails: { basePlanId: "monthly" },
    },
  ],
};

describe("구독 확인 — 구글에 묻고, DB 에 적고, 확정", () => {
  it("결제된 월간 구독: 이번 달 몫을 넣어 DB 를 부르고, 확정한 뒤 확정 표시", async () => {
    const { gp, calls } = fakeGoogle({ "subscriptionsv2/tokens/": activeSub, ":acknowledge": {} });
    const { db, calls: dbCalls } = fakeDb({
      google_play_apply_subscription: { data: { ok: true, plan: "monthly", ends_at: "2026-12-20T00:00:00Z", granted: true } },
      google_play_mark_ack: { data: true },
    });
    const r = await verifyPurchase(db, "family_pass", TOKEN, deps(gp));
    assert.deepEqual(r, { ok: true, productId: "family_pass", plan: "monthly", endsAt: "2026-12-20T00:00:00Z", granted: true });
    const apply = dbCalls.find((c) => c.fn === "google_play_apply_subscription")!.args;
    assert.equal(apply.p_entitled, true);
    assert.equal(apply.p_paid, true);
    assert.equal(apply.p_amount, 9900);
    assert.equal(apply.p_books, 4);
    assert.equal(apply.p_draws, 5);
    assert.equal(apply.p_draws_first, 10);
    assert.equal(apply.p_slice_ref, "GPA.1234-5678-9012-34567#0");
    assert.equal(apply.p_slice_end, "2026-12-20T00:00:00.000Z");
    // 인자는 늘 전부(PostgREST 는 이름으로 함수를 고른다)
    assert.equal(Object.keys(apply).length, 19);
    assert.ok(calls.some((c) => c.method === "POST" && c.path.includes("/purchases/subscriptions/family_pass/tokens/") && c.path.endsWith(":acknowledge")));
    assert.ok(dbCalls.some((c) => c.fn === "google_play_mark_ack"));
  });
  it("이미 확정된 구매는 다시 확정하지 않는다", async () => {
    const { gp, calls } = fakeGoogle({
      "subscriptionsv2/tokens/": { ...activeSub, acknowledgementState: "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED" },
    });
    const { db } = fakeDb({ google_play_apply_subscription: { data: { ok: true, plan: "monthly", granted: false } } });
    const r = await verifyPurchase(db, "family_pass", TOKEN, deps(gp));
    assert.equal(r.ok, true);
    assert.ok(!calls.some((c) => c.method === "POST"));
  });
  it("유예 기간은 이용권은 이어 주되 새 달 몫은 미룬다(결제가 확인될 때)", async () => {
    const { gp } = fakeGoogle({ "subscriptionsv2/tokens/": { ...activeSub, subscriptionState: "SUBSCRIPTION_STATE_IN_GRACE_PERIOD" } });
    const { db, calls } = fakeDb({ google_play_apply_subscription: { data: { ok: true, plan: "monthly" } } });
    await verifyPurchase(db, "family_pass", TOKEN, deps(gp));
    const apply = calls[0].args;
    assert.equal(apply.p_entitled, true);
    assert.equal(apply.p_paid, false);
    assert.equal(apply.p_slice_ref, null);
  });
  it("고른 상품과 다른 구독 토큰이면 DB 를 부르지 않는다", async () => {
    const { gp } = fakeGoogle({ "subscriptionsv2/tokens/": activeSub });
    const { db, calls } = fakeDb({});
    const r = await verifyPurchase(db, "family_pass_yearly", TOKEN, deps(gp));
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.code, "mismatch");
    assert.equal(calls.length, 0);
  });
  it("남의 토큰이면 409 · 확정하지 않는다", async () => {
    const { gp, calls } = fakeGoogle({ "subscriptionsv2/tokens/": activeSub });
    const { db } = fakeDb({ google_play_apply_subscription: { data: { ok: false, reason: "other_owner" } } });
    const r = await verifyPurchase(db, "family_pass", TOKEN, deps(gp));
    assert.deepEqual(!r.ok && [r.status, r.code], [409, "other-owner"]);
    assert.ok(!calls.some((c) => c.method === "POST"));
  });
  it("만료된 구독은 DB 에 적되(요금제를 끝내려고) 실패로 답한다", async () => {
    const { gp } = fakeGoogle({
      "subscriptionsv2/tokens/": { ...activeSub, subscriptionState: "SUBSCRIPTION_STATE_EXPIRED" },
    });
    const { db, calls } = fakeDb({ google_play_apply_subscription: { data: { ok: true, plan: "monthly" } } });
    const r = await verifyPurchase(db, "family_pass", TOKEN, deps(gp));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].args.p_entitled, false);
    assert.deepEqual(!r.ok && r.code, "not-paid");
  });
  it("구글이 토큰을 모르면 400 · 권한 오류면 준비 전 503", async () => {
    let g = fakeGoogle({ "subscriptionsv2/tokens/": new GooglePlayError("x", 410) });
    let r = await verifyPurchase(fakeDb({}).db, "family_pass", TOKEN, deps(g.gp));
    assert.deepEqual(!r.ok && [r.status, r.code], [400, "invalid"]);
    g = fakeGoogle({ "subscriptionsv2/tokens/": new GooglePlayError("x", 403) });
    r = await verifyPurchase(fakeDb({}).db, "family_pass", TOKEN, deps(g.gp));
    assert.deepEqual(!r.ok && [r.status, r.code], [503, "not-ready"]);
  });
  it("DB 함수가 없거나 열쇠가 안 맞으면 준비 전(503)", async () => {
    for (const code of ["PGRST202", "42501", "42883"]) {
      const { gp } = fakeGoogle({ "subscriptionsv2/tokens/": activeSub });
      const { db } = fakeDb({ google_play_apply_subscription: { error: { code } } });
      const r = await verifyPurchase(db, "family_pass", TOKEN, deps(gp));
      assert.deepEqual(!r.ok && [r.status, r.code], [503, "not-ready"], code);
    }
  });
  it("파는 상품·토큰 모양이 아니면 구글에 묻지도 않는다", async () => {
    const { gp, calls } = fakeGoogle({});
    for (const [p, t] of [
      ["credit_pack_1", TOKEN],
      ["family_pass", "짧음"],
      ["nope", TOKEN],
      [42, TOKEN],
    ] as const) {
      const r = await verifyPurchase(fakeDb({}).db, p, t, deps(gp));
      assert.deepEqual(!r.ok && r.code, "invalid");
    }
    assert.equal(calls.length, 0);
  });
});

describe("스타트팩 확인", () => {
  const paid = { purchaseState: 0, consumptionState: 0, acknowledgementState: 0, orderId: "GPA.9999-0000", purchaseType: 0 };
  it("결제됨: 관리실 스타트팩 구성으로 적고, 소비하지 않고 확정만", async () => {
    const { gp, calls } = fakeGoogle({ "/purchases/products/starter_pack/tokens/": paid });
    const { db, calls: dbCalls } = fakeDb({ google_play_apply_product: { data: { ok: true, plan: "starter", granted: true } } });
    const r = await verifyPurchase(db, "starter_pack", TOKEN, deps(gp));
    assert.equal(r.ok, true);
    const a = dbCalls[0].args;
    assert.deepEqual([a.p_books, a.p_draws, a.p_amount, a.p_test, a.p_paid], [1, 1, 4900, true, true]);
    assert.equal(Object.keys(a).length, 11);
    assert.ok(calls.some((c) => c.method === "POST" && c.path.endsWith(":acknowledge")));
    assert.ok(!calls.some((c) => c.path.endsWith(":consume")));
  });
  it("대기 중 결제는 주지 않고 pending", async () => {
    const { gp } = fakeGoogle({ "/purchases/products/starter_pack/tokens/": { purchaseState: 2 } });
    const { db } = fakeDb({ google_play_apply_product: { data: { ok: true, granted: false } } });
    const r = await verifyPurchase(db, "starter_pack", TOKEN, deps(gp));
    assert.deepEqual(!r.ok && r.code, "pending");
  });
});

describe("동기화 — 다시 물을 때 · 요약 · 앱이 보낸 내 구매", () => {
  const row = (o: Partial<PurchaseRow>): PurchaseRow => ({
    token: TOKEN,
    product_id: "family_pass",
    kind: "subscription",
    state: "SUBSCRIPTION_STATE_ACTIVE",
    expires_at: "2026-12-20T00:00:00Z",
    auto_renew: true,
    acknowledged: true,
    granted: false,
    test: false,
    checked_at: new Date(NOW - 60_000).toISOString(),
    ...o,
  });
  it("needsCheck: 방금 본 것은 건너뛰고, 30분 지났거나 확정 전이거나 만료가 지났으면 다시", () => {
    assert.equal(needsCheck(row({}), NOW), false);
    assert.equal(needsCheck(row({ checked_at: new Date(NOW - 31 * 60_000).toISOString() }), NOW), true);
    assert.equal(needsCheck(row({ acknowledged: false }), NOW), true);
    assert.equal(needsCheck(row({ expires_at: new Date(NOW - 1000).toISOString(), checked_at: new Date(NOW - 3 * 60_000).toISOString() }), NOW), true);
    assert.equal(needsCheck(row({ state: "SUBSCRIPTION_STATE_EXPIRED", checked_at: "2026-01-01T00:00:00Z" }), NOW), false);
    assert.equal(needsCheck(row({ kind: "product", product_id: "starter_pack", state: "paid", granted: true }), NOW), false);
    assert.equal(needsCheck(row({ kind: "product", product_id: "starter_pack", state: "paid", granted: true, acknowledged: false }), NOW), true);
    assert.equal(needsCheck(row({ kind: "product", product_id: "starter_pack", state: "cancelled", acknowledged: false }), NOW), false);
    assert.equal(needsCheck(row({ product_id: "credit_pack_1", acknowledged: false }), NOW), false, "아직 안 파는 상품");
  });
  it("summarize: 살아 있는 구독(가장 늦게 끝나는 것)과 스타트팩", () => {
    const s = summarize(
      [
        row({ product_id: "family_pass", expires_at: "2026-12-20T00:00:00Z" }),
        row({ product_id: "family_pass_yearly", expires_at: "2027-11-20T00:00:00Z", state: "SUBSCRIPTION_STATE_CANCELED", auto_renew: false }),
        row({ product_id: "family_pass", state: "SUBSCRIPTION_STATE_ON_HOLD", expires_at: "2027-12-20T00:00:00Z" }),
        row({ kind: "product", product_id: "starter_pack", state: "paid", granted: true, expires_at: null }),
      ],
      NOW,
    );
    assert.deepEqual(s.active, { productId: "family_pass_yearly", expiresAt: "2027-11-20T00:00:00Z", autoRenew: false, canceled: true });
    assert.equal(s.starterOwned, true);
    assert.deepEqual(summarize([], NOW), { active: null, starterOwned: false });
  });
  it("parseOffered: 파는 상품·토큰 모양만, 10개까지", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ productId: "family_pass", purchaseToken: `tok.${i}${"b".repeat(30)}` }));
    assert.equal(parseOffered({ purchases: many }).length, 10);
    assert.deepEqual(parseOffered({ purchases: [{ productId: "credit_pack_1", purchaseToken: TOKEN }, { productId: "family_pass" }] }), []);
    assert.deepEqual(parseOffered(null), []);
    assert.deepEqual(parseOffered({ purchases: "x" }), []);
  });
  it("syncPurchases: DB 에 없던 앱 구매와 오래된 줄만 구글에 묻고, 최대 수를 넘지 않는다", async () => {
    const { gp, calls } = fakeGoogle({ "subscriptionsv2/tokens/": activeSub, ":acknowledge": {} });
    let listCalls = 0;
    const stale = Array.from({ length: 8 }, (_, i) =>
      row({ token: `stale.${i}${"c".repeat(30)}`, checked_at: "2026-11-01T00:00:00Z" }),
    );
    const fresh = row({ token: `fresh.${"d".repeat(30)}` });
    const db: BillingDb = {
      rpc(fn) {
        if (fn === "google_play_my_purchases") {
          listCalls += 1;
          return Promise.resolve({ data: [fresh, ...stale], error: null });
        }
        return Promise.resolve({ data: { ok: true, plan: "monthly", granted: false }, error: null });
      },
    };
    const r = await syncPurchases(db, deps(gp), [{ productId: "family_pass", purchaseToken: `new.${"e".repeat(30)}` }, { productId: "family_pass", purchaseToken: fresh.token }]);
    assert.ok(!("ok" in r));
    assert.equal((r as { checked: number }).checked, SYNC_MAX_CHECKS);
    const asked = calls.filter((c) => c.method === "GET").map((c) => c.path);
    assert.equal(asked.length, SYNC_MAX_CHECKS);
    assert.ok(asked[0].includes(`new.${"e".repeat(30)}`), "앱이 보낸 새 토큰부터");
    assert.ok(!asked.some((p) => p.includes("fresh.")), "방금 본 줄은 묻지 않는다");
    assert.equal(listCalls, 2, "물은 뒤 목록을 다시 읽어 요약");
  });
  it("syncPurchases: 준비 전(열쇠·SQL)이면 그대로 알린다", async () => {
    const { gp } = fakeGoogle({});
    const { db } = fakeDb({ google_play_my_purchases: { error: { code: "PGRST202" } } });
    const r = await syncPurchases(db, deps(gp), []);
    assert.deepEqual("ok" in r && [r.ok, r.code], [false, "not-ready"]);
  });
});
