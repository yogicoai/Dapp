import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";

import {
  GOOGLE_PLAY_PRODUCTS,
  SELLING_NOW,
  billingKeyHash,
  billingServerKey,
  googlePlayClientFromEnv,
  googlePlayProduct,
  isPurchaseToken,
  isSellingNow,
  parseServiceAccount,
  passSlice,
  playSubscriptionsUrl,
  readProduct,
  readSubscription,
  serviceAccountJwt,
  subscriptionProductOfPlan,
} from "./google-play.ts";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const SA_JSON = {
  type: "service_account",
  project_id: "test",
  client_email: "play-billing@test.iam.gserviceaccount.com",
  private_key: PEM,
  token_uri: "https://oauth2.googleapis.com/token",
};
const SA_B64 = Buffer.from(JSON.stringify(SA_JSON)).toString("base64");

describe("구글 플레이 상품 표(11-26 콘솔 등록과 같아야 한다)", () => {
  it("구독 둘(월·연 따로) + 스타트팩 + 크레딧 셋", () => {
    assert.deepEqual(
      GOOGLE_PLAY_PRODUCTS.map((p) => p.productId),
      ["family_pass", "family_pass_yearly", "starter_pack", "credit_pack_1", "credit_pack_2", "credit_pack_3"],
    );
    assert.equal(googlePlayProduct("family_pass")?.plan, "monthly");
    assert.equal(googlePlayProduct("family_pass_yearly")?.plan, "yearly");
    assert.equal(googlePlayProduct("credit_pack_3")?.creditPackIndex, 2);
    assert.equal(googlePlayProduct("yearly"), null);
    assert.equal(googlePlayProduct(42), null);
    assert.equal(subscriptionProductOfPlan("monthly"), "family_pass");
    assert.equal(subscriptionProductOfPlan("yearly"), "family_pass_yearly");
  });
  it("구매 토큰 모양", () => {
    assert.ok(isPurchaseToken("abcdEFGH1234.AO-J1Oxyz_" + "a".repeat(40)));
    assert.ok(!isPurchaseToken("짧음"));
    assert.ok(!isPurchaseToken("has space in it ........................"));
    assert.ok(!isPurchaseToken(undefined));
  });
  it("1단계에 파는 것은 구독 둘 + 스타트팩 — 크레딧 묶음은 2단계", () => {
    assert.deepEqual([...SELLING_NOW], ["family_pass", "family_pass_yearly", "starter_pack"]);
    assert.ok(isSellingNow("starter_pack"));
    assert.ok(!isSellingNow("credit_pack_1"));
    assert.ok(!isSellingNow(undefined));
  });
  it("정기 결제 관리 주소", () => {
    assert.equal(
      playSubscriptionsUrl("family_pass", "kr.yogico.voicestory"),
      "https://play.google.com/store/account/subscriptions?sku=family_pass&package=kr.yogico.voicestory",
    );
  });
});

describe("서버 열쇠(DB 함수 문)", () => {
  it("서비스 계정 키에서 뽑고, 같은 키면 같은 열쇠 · DB 지문은 sha256(열쇠)", () => {
    const env = { GOOGLE_PLAY_SA_BASE64: SA_B64 } as unknown as NodeJS.ProcessEnv;
    const k = billingServerKey(env)!;
    assert.match(k, /^[0-9a-f]{64}$/);
    assert.equal(billingServerKey(env), k);
    assert.match(billingKeyHash(k), /^[0-9a-f]{64}$/);
    assert.notEqual(billingKeyHash(k), k);
    assert.equal(billingServerKey({} as NodeJS.ProcessEnv), null);
  });
  it("다른 키면 다른 열쇠", () => {
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const b64 = Buffer.from(JSON.stringify({ ...SA_JSON, private_key: other })).toString("base64");
    assert.notEqual(
      billingServerKey({ GOOGLE_PLAY_SA_BASE64: b64 } as unknown as NodeJS.ProcessEnv),
      billingServerKey({ GOOGLE_PLAY_SA_BASE64: SA_B64 } as unknown as NodeJS.ProcessEnv),
    );
  });
});

describe("이번 달 몫 기간(passSlice)", () => {
  const base = { orderId: "GPA.1", token: "t".repeat(30) };
  it("월간: 결제한 한 달 그대로 한 칸, 열쇠는 주문번호#0", () => {
    const s = passSlice({ ...base, plan: "monthly", expiresAt: "2026-12-26T03:00:00Z", now: Date.parse("2026-12-01T00:00:00Z") })!;
    assert.deepEqual(s, { ref: "GPA.1#0", start: "2026-11-26T03:00:00.000Z", end: "2026-12-26T03:00:00.000Z", index: 0 });
  });
  it("연간: 결제한 1년을 달마다 — 지금 칸만, 끝은 만료를 넘지 않는다", () => {
    const exp = "2027-11-26T03:00:00Z";
    const first = passSlice({ ...base, plan: "yearly", expiresAt: exp, now: Date.parse("2026-11-27T00:00:00Z") })!;
    assert.deepEqual([first.index, first.start, first.end], [0, "2026-11-26T03:00:00.000Z", "2026-12-26T03:00:00.000Z"]);
    const mid = passSlice({ ...base, plan: "yearly", expiresAt: exp, now: Date.parse("2027-03-30T00:00:00Z") })!;
    assert.deepEqual([mid.ref, mid.start, mid.end], ["GPA.1#4", "2027-03-26T03:00:00.000Z", "2027-04-26T03:00:00.000Z"]);
    const last = passSlice({ ...base, plan: "yearly", expiresAt: exp, now: Date.parse("2027-11-25T00:00:00Z") })!;
    assert.deepEqual([last.index, last.end], [11, "2027-11-26T03:00:00.000Z"]);
  });
  it("월말: 1월 31일 시작은 2월 마지막 날에 칸이 바뀐다", () => {
    const s = passSlice({ ...base, plan: "yearly", expiresAt: "2028-01-31T00:00:00Z", now: Date.parse("2027-02-28T12:00:00Z") })!;
    assert.deepEqual([s.index, s.start, s.end], [1, "2027-02-28T00:00:00.000Z", "2027-03-31T00:00:00.000Z"]);
  });
  it("만료가 지났으면 null · 주문번호가 없으면 토큰 지문(토큰 자체는 안 넣는다)", () => {
    assert.equal(passSlice({ ...base, plan: "monthly", expiresAt: "2026-11-01T00:00:00Z", now: Date.parse("2026-12-01T00:00:00Z") }), null);
    const s = passSlice({ plan: "monthly", orderId: null, token: "secret-token-value-xyz", expiresAt: "2026-12-26T00:00:00Z", now: Date.parse("2026-12-01T00:00:00Z") })!;
    assert.match(s.ref, /^tok-[0-9a-f]{16}-\d+#0$/);
    assert.ok(!s.ref.includes("secret"));
  });
});

describe("서비스 계정 · JWT", () => {
  it("base64 JSON 을 읽고, 틀리면 null", () => {
    const sa = parseServiceAccount(SA_B64);
    assert.equal(sa?.clientEmail, SA_JSON.client_email);
    assert.equal(parseServiceAccount(""), null);
    assert.equal(parseServiceAccount("bm90IGpzb24="), null);
    assert.equal(parseServiceAccount(Buffer.from(JSON.stringify({ ...SA_JSON, type: "user" })).toString("base64")), null);
  });
  it("RS256 서명 — 공개 키로 검증되고, 범위·대상·만료가 맞다", () => {
    const sa = parseServiceAccount(SA_B64)!;
    const jwt = serviceAccountJwt(sa, 1_800_000_000);
    const [h, c, s] = jwt.split(".");
    const v = createVerify("RSA-SHA256");
    v.update(`${h}.${c}`);
    assert.ok(v.verify(publicKey, Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64")));
    const claims = JSON.parse(Buffer.from(c, "base64").toString("utf8"));
    assert.equal(claims.scope, "https://www.googleapis.com/auth/androidpublisher");
    assert.equal(claims.aud, SA_JSON.token_uri);
    assert.equal(claims.exp - claims.iat, 3600);
  });
  it("환경변수가 없거나 패키지 이름이 틀리면 클라이언트를 만들지 않는다", () => {
    assert.equal(googlePlayClientFromEnv({} as NodeJS.ProcessEnv), null);
    assert.equal(googlePlayClientFromEnv({ GOOGLE_PLAY_SA_BASE64: SA_B64, GOOGLE_PLAY_PACKAGE: "nope" } as unknown as NodeJS.ProcessEnv), null);
    assert.equal(
      googlePlayClientFromEnv({ GOOGLE_PLAY_SA_BASE64: SA_B64, GOOGLE_PLAY_PACKAGE: "kr.yogico.voicestory" } as unknown as NodeJS.ProcessEnv)
        ?.packageName,
      "kr.yogico.voicestory",
    );
  });
});

describe("구글 응답 해석", () => {
  const NOW = Date.parse("2026-12-01T00:00:00Z");
  const sub = (state: string, expiry: string) => ({
    subscriptionState: state,
    acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING",
    latestOrderId: "GPA.1234-5678-9012-34567",
    lineItems: [{ productId: "family_pass", expiryTime: expiry, autoRenewingPlan: { autoRenewEnabled: true }, offerDetails: { basePlanId: "monthly" } }],
  });
  it("결제됨·유예·해지 예약(기간 남음)은 이용권을 준다", () => {
    for (const s of ["SUBSCRIPTION_STATE_ACTIVE", "SUBSCRIPTION_STATE_IN_GRACE_PERIOD", "SUBSCRIPTION_STATE_CANCELED"]) {
      assert.equal(readSubscription(sub(s, "2026-12-20T00:00:00Z"), NOW).entitled, true, s);
    }
  });
  it("보류·일시중지·만료, 또는 기간이 지났으면 주지 않는다", () => {
    for (const s of ["SUBSCRIPTION_STATE_ON_HOLD", "SUBSCRIPTION_STATE_PAUSED", "SUBSCRIPTION_STATE_EXPIRED", "SUBSCRIPTION_STATE_PENDING"]) {
      assert.equal(readSubscription(sub(s, "2026-12-20T00:00:00Z"), NOW).entitled, false, s);
    }
    assert.equal(readSubscription(sub("SUBSCRIPTION_STATE_ACTIVE", "2026-11-30T00:00:00Z"), NOW).entitled, false);
  });
  it("상품·요금제·주문번호·확정 여부를 꺼낸다", () => {
    const r = readSubscription(sub("SUBSCRIPTION_STATE_ACTIVE", "2026-12-20T00:00:00Z"), NOW);
    assert.equal(r.productId, "family_pass");
    assert.equal(r.basePlanId, "monthly");
    assert.equal(r.orderId, "GPA.1234-5678-9012-34567");
    assert.equal(r.acknowledged, false);
    assert.equal(r.test, false);
  });
  it("값이 들어온 기간(paid)은 결제됨·해지 예약만 — 유예 기간은 이용권만", () => {
    const at = "2026-12-20T00:00:00Z";
    assert.equal(readSubscription(sub("SUBSCRIPTION_STATE_ACTIVE", at), NOW).paid, true);
    assert.equal(readSubscription(sub("SUBSCRIPTION_STATE_CANCELED", at), NOW).paid, true);
    const grace = readSubscription(sub("SUBSCRIPTION_STATE_IN_GRACE_PERIOD", at), NOW);
    assert.deepEqual([grace.entitled, grace.paid], [true, false]);
    assert.equal(readSubscription(sub("SUBSCRIPTION_STATE_ACTIVE", "2026-11-30T00:00:00Z"), NOW).paid, false);
  });
  it("정기 결제 값(원) — 원화만", () => {
    const withPrice = (p: unknown) => ({
      ...sub("SUBSCRIPTION_STATE_ACTIVE", "2026-12-20T00:00:00Z"),
      lineItems: [{ productId: "family_pass", expiryTime: "2026-12-20T00:00:00Z", autoRenewingPlan: { autoRenewEnabled: true, recurringPrice: p } }],
    });
    assert.equal(readSubscription(withPrice({ currencyCode: "KRW", units: "9900" }) as never, NOW).priceWon, 9900);
    assert.equal(readSubscription(withPrice({ currencyCode: "KRW", units: "9899", nanos: 600_000_000 }) as never, NOW).priceWon, 9900);
    assert.equal(readSubscription(withPrice({ currencyCode: "USD", units: "7" }) as never, NOW).priceWon, null);
    assert.equal(readSubscription(sub("SUBSCRIPTION_STATE_ACTIVE", "2026-12-20T00:00:00Z"), NOW).priceWon, null);
  });
  it("단품: 결제됨·대기·소비·시험 구매", () => {
    assert.deepEqual(readProduct({ purchaseState: 0, consumptionState: 0, acknowledgementState: 0, orderId: "GPA.1", purchaseType: 0 }), {
      paid: true,
      pending: false,
      consumed: false,
      acknowledged: false,
      orderId: "GPA.1",
      test: true,
    });
    assert.equal(readProduct({ purchaseState: 2 }).pending, true);
    assert.equal(readProduct({ purchaseState: 1 }).paid, false);
  });
});
