import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  EXTRA,
  FAMILY_CHARACTERS_IN_PASS,
  FAQ,
  PASS,
  PASS_FEATURES,
  PLANS,
  PLANS_PREVIEW_NOTE,
  REFUND_SUMMARY,
  TRIAL,
  TRIAL_FEATURES,
  billingDayText,
  booksText,
  formatDateKo,
  isPlanId,
  monthlyEquivalent,
  nextBillingDate,
  passFeatures,
  priceLabel,
  won,
  yearlyDiscountPct,
} from "./plans.ts";

const ymd = (d: Date | null) => (d ? [d.getFullYear(), d.getMonth() + 1, d.getDate()] : null);

describe("요금제 값 — 권고안 4장 그대로", () => {
  it("가격(부가세 포함)", () => {
    assert.equal(PLANS.monthly.priceWon, 12_900);
    assert.equal(PLANS.yearly.priceWon, 119_000);
    assert.equal(PLANS.extra3.priceWon, 4_900);
    assert.equal(TRIAL.priceWon, 0);
  });

  it("책 수 · 구독자 전용", () => {
    assert.equal(PASS.booksPerMonth, 6);
    assert.equal(EXTRA.books, 3);
    assert.equal(PLANS.monthly.books, 6);
    assert.equal(PLANS.yearly.books, 6);
    assert.equal(PLANS.extra3.books, 3);
    assert.equal(PLANS.extra3.subscriberOnly, true);
    assert.equal(PLANS.monthly.subscriberOnly, false);
    assert.equal(PLANS.yearly.subscriberOnly, false);
    assert.equal(TRIAL.books, 1);
    assert.equal(TRIAL.voices, 1);
    assert.equal(TRIAL.keepDays, 7);
  });

  it("isPlanId", () => {
    assert.equal(isPlanId("monthly"), true);
    assert.equal(isPlanId("weekly"), false);
    assert.equal(isPlanId(1), false);
  });
});

describe("글자 도우미", () => {
  it("won — 쉼표와 원", () => {
    assert.equal(won(12900), "12,900원");
    assert.equal(won(119000), "119,000원");
    assert.equal(won(0), "0원");
    assert.equal(won(4900), "4,900원");
    assert.equal(won(1234567), "1,234,567원");
  });

  it("연간 월 환산 · 할인율은 계산해서", () => {
    assert.equal(monthlyEquivalent(PLANS.yearly), 9917);
    assert.equal(monthlyEquivalent(PLANS.monthly), 12900);
    assert.equal(yearlyDiscountPct(), 23);
  });

  it("priceLabel", () => {
    assert.equal(priceLabel(PLANS.monthly), "월 12,900원");
    assert.equal(priceLabel(PLANS.yearly), "연 119,000원");
    assert.equal(priceLabel(PLANS.extra3), "4,900원");
  });

  it("booksText", () => {
    assert.equal(booksText(6), "6권");
  });

  it("nextBillingDate — 그 날이 없으면 그 달 마지막 날", () => {
    assert.deepEqual(ymd(nextBillingDate(new Date(2026, 8, 30), PLANS.monthly)), [2026, 10, 30]);
    assert.deepEqual(ymd(nextBillingDate(new Date(2026, 0, 31), PLANS.monthly)), [2026, 2, 28]);
    assert.deepEqual(ymd(nextBillingDate(new Date(2028, 0, 31), PLANS.monthly)), [2028, 2, 29]);
    assert.deepEqual(ymd(nextBillingDate(new Date(2028, 1, 29), PLANS.yearly)), [2029, 2, 28]);
    assert.deepEqual(ymd(nextBillingDate(new Date(2026, 11, 15), PLANS.monthly)), [2027, 1, 15]);
    assert.equal(nextBillingDate(new Date(2026, 8, 30), PLANS.extra3), null);
  });

  it("formatDateKo", () => {
    assert.equal(formatDateKo(new Date(2026, 9, 30)), "2026. 10. 30.");
    assert.equal(formatDateKo(new Date(2026, 8, 3)), "2026. 9. 3.");
  });

  it("billingDayText", () => {
    assert.equal(billingDayText(new Date(2026, 8, 30), PLANS.monthly), "매달 30일(그 날이 없는 달은 마지막 날)");
    assert.equal(billingDayText(new Date(2026, 8, 15), PLANS.monthly), "매달 15일");
    assert.equal(billingDayText(new Date(2026, 8, 30), PLANS.yearly), "매년 9월 30일");
  });
});

describe("구성 줄", () => {
  it("가족 캐릭터 수는 FAMILY_CHARACTERS_IN_PASS 에서 온다", () => {
    assert.equal(FAMILY_CHARACTERS_IN_PASS, 4);
    assert.ok(PASS_FEATURES.includes("우리 가족 캐릭터 4명까지"));
    const three = passFeatures({ ...PASS, familyCharacters: 3 });
    assert.ok(three.includes("우리 가족 캐릭터 3명까지"));
    assert.ok(!three.includes("우리 가족 캐릭터 4명까지"));
  });

  it("패스 구성은 권고안 그대로", () => {
    assert.deepEqual([...PASS_FEATURES], [
      "매달 새 동화책 6권",
      "가족 목소리 2개 (엄마·아빠·할머니·할아버지 중)",
      "다시 듣기 무제한",
      "아이 프로필 2개",
      "우리 가족 캐릭터 4명까지",
    ]);
    assert.ok(TRIAL_FEATURES.includes("첫 동화 1권"));
    assert.ok(TRIAL_FEATURES.some((t) => t.includes("7일")));
  });

  it("고객에게 보이는 글에 내부 화폐 이름이 없다(권으로만)", () => {
    const all = JSON.stringify({ PLANS, PASS_FEATURES, TRIAL_FEATURES, FAQ, REFUND_SUMMARY, PLANS_PREVIEW_NOTE });
    assert.doesNotMatch(all, /토큰|쿠키|크레딧/);
  });
});

describe("대외비 — 권고안의 비용 숫자·낱말이 시연 코드에 없다(G12)", () => {
  const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
  const payDir = new URL("../components/pay/", import.meta.url);
  const payFiles = (() => {
    try {
      return (readdirSync(payDir, { recursive: true }) as string[])
        .map((f) => String(f).replace(/\\/g, "/"))
        .filter((f) => /\.(ts|tsx)$/.test(f));
    } catch {
      return [];
    }
  })();

  const sources: [string, string][] = [
    ["lib/plans.ts", read("./plans.ts")],
    ["lib/pay-demo.ts", read("./pay-demo.ts")],
    ["lib/business-info.ts", read("./business-info.ts")],
    ...payFiles.map((f): [string, string] => [`components/pay/${f}`, readFileSync(new URL(f, payDir), "utf8")]),
  ];

  it("components/pay 파일을 실제로 읽었다", () => {
    assert.ok(payFiles.length > 0);
  });

  for (const [name, src] of sources) {
    it(name, () => {
      assert.doesNotMatch(src, /원가|마진|공헌|실수령|수수료|고정비|770|4,?950/);
    });
  }
});
