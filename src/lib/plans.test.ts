import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  DEFAULT_PLAN_TERMS,
  plansOf,
  CREDIT_USES,
  CREDIT_USE_LABEL,
  DEFAULT_CREDIT_COSTS,
  DEFAULT_CREDIT_PACKS,
  DEFAULT_OFFER_VIEW,
  EXTRA,
  FAMILY_CHARACTERS_IN_PASS,
  FAMILY_CHARACTERS_IN_YEARLY,
  FAQ,
  FREE,
  PASS,
  PASS_FEATURES,
  PASS_YEARLY,
  PLANS,
  PLANS_PREVIEW_NOTE,
  REFUND_SUMMARY,
  STARTER,
  billingDayText,
  creditsText,
  freeFeatures,
  libraryCountText,
  passFeaturesFor,
  planFaq,
  starterFeatures,
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

describe("요금제 값 — 권고안 4장 구조 + 사장님 최종안(2026-10-01 가족 패스 월 19,900원)", () => {
  it("가격(부가세 포함)", () => {
    assert.equal(PLANS.monthly.priceWon, 19_900);
    assert.equal(PLANS.yearly.priceWon, 199_000);
    assert.equal(PLANS.extra3.priceWon, 9_900);
    assert.equal(STARTER.priceWon, 4_900);
  });

  it("책 수 · 구독자 전용", () => {
    assert.equal(PASS.booksPerMonth, 4);
    assert.equal(EXTRA.books, 3);
    assert.equal(PLANS.monthly.books, 4);
    assert.equal(PLANS.yearly.books, 4);
    assert.equal(PLANS.extra3.books, 3);
    assert.equal(PLANS.extra3.subscriberOnly, true);
    assert.equal(PLANS.monthly.subscriberOnly, false);
    assert.equal(PLANS.yearly.subscriberOnly, false);
  });

  it("월간 — 가족 캐릭터 4명 · 가족 목소리 1명(한 달 1번 다시 만들기), 연간 — 6명 · 2명(2026-10-01)", () => {
    assert.equal(PASS.familyCharacters, 4);
    assert.equal(PASS.voices, 1);
    assert.equal(PASS.voiceRemakesPerMonth, 1);
    assert.equal(PASS_YEARLY.familyCharacters, 6);
    assert.equal(PASS_YEARLY.voices, 2);
    assert.equal(PASS_YEARLY.booksPerMonth, PASS.booksPerMonth);
    assert.equal(PASS_YEARLY.drawTokensPerMonth, PASS.drawTokensPerMonth);
    assert.equal(FAMILY_CHARACTERS_IN_YEARLY, 6);
  });

  it("스타트팩 — 동화 1권 · 캐릭터 1명 · 목소리 1명 · 명작·전래 10권씩, 무료 — 5권씩", () => {
    assert.deepEqual({ ...STARTER }, { priceWon: 4_900, books: 1, voices: 1, familyCharacters: 1, classics: 10, folk: 10 });
    assert.deepEqual({ ...FREE }, { classics: 5, folk: 5 });
  });

  it("마음껏 듣는 권수 = 서가에 보이는 세계명작·전래동화(숨긴 책 빼고)", () => {
    const visible = (rel: string) =>
      (JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8")) as { hidden?: boolean }[]).filter((b) => !b.hidden).length;
    assert.equal(PASS.libraryBooks, visible("../data/classic-books.json") + visible("../data/folk-books.json"));
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
    assert.equal(monthlyEquivalent(PLANS.yearly), 16583);
    assert.equal(monthlyEquivalent(PLANS.monthly), 19900);
    assert.equal(yearlyDiscountPct(), 17);
  });

  it("priceLabel", () => {
    assert.equal(priceLabel(PLANS.monthly), "월 19,900원");
    assert.equal(priceLabel(PLANS.yearly), "연 199,000원");
    assert.equal(priceLabel(PLANS.extra3), "9,900원");
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

  it("패스 구성은 2026-10-01 확정안(19,900원 · 4권) — 아이 프로필 줄은 없앴다(아이도 가족 캐릭터)", () => {
    assert.deepEqual([...PASS_FEATURES], [
      "매달 새 동화책 4권",
      "우리 가족 캐릭터 4명까지",
      "가족 목소리 1명 (한 달에 1번 다시 만들기)",
      "가족 그리기 토큰 매달 5개 (첫 달 10개)",
      "세계명작·전래동화 40권 마음껏 듣기",
      "다시 듣기 무제한",
    ]);
    assert.ok(!PASS_FEATURES.some((f) => f.includes("아이 프로필")));
  });

  it("연간은 캐릭터 6명 · 목소리 2명, 마음껏 듣는 권수는 관리실 값(offer)을 따른다", () => {
    const yearly = passFeaturesFor("yearly");
    assert.ok(yearly.includes("우리 가족 캐릭터 6명까지"));
    assert.ok(yearly.includes("가족 목소리 2명 (한 달에 1번 다시 만들기)"));
    assert.deepEqual(passFeaturesFor("monthly"), [...PASS_FEATURES]);
    assert.ok(passFeaturesFor("monthly", { ...DEFAULT_OFFER_VIEW, libraryBooks: 41 }).includes("세계명작·전래동화 41권 마음껏 듣기"));
  });

  it("무료 · 스타트팩 구성 — 권수는 offer 에서, 0권인 쪽은 빼고, 무료가 없으면 빈 목록", () => {
    assert.deepEqual(freeFeatures(), ["세계명작 5권 · 전래동화 5권 듣기", "가입하지 않아도 들을 수 있어요"]);
    assert.deepEqual(starterFeatures(), [
      "우리 아이 동화 1권 만들기",
      "우리 가족 캐릭터 1명",
      "가족 목소리 1명",
      "세계명작 10권 · 전래동화 10권 듣기",
      "처음 한 번만 살 수 있어요",
    ]);
    const onlyFolk = { ...DEFAULT_OFFER_VIEW, free: { classics: 0, folk: 3, titles: [] } };
    assert.deepEqual(freeFeatures(onlyFolk), ["전래동화 3권 듣기", "가입하지 않아도 들을 수 있어요"]);
    assert.deepEqual(freeFeatures({ ...DEFAULT_OFFER_VIEW, free: { classics: 0, folk: 0, titles: [] } }), []);
    assert.equal(libraryCountText(0, 0), "");
  });

  it("크레딧 — 기본 묶음은 값이 싼 순서, 첫 묶음 = 동화 1권", () => {
    assert.deepEqual(
      DEFAULT_CREDIT_PACKS.map((p) => p.priceWon),
      [...DEFAULT_CREDIT_PACKS].map((p) => p.priceWon).sort((a, b) => a - b),
    );
    assert.equal(DEFAULT_CREDIT_PACKS[0].credits, DEFAULT_CREDIT_COSTS.book);
    assert.deepEqual([...CREDIT_USES], ["book", "character", "voice", "draw"]);
    for (const k of CREDIT_USES) assert.ok(CREDIT_USE_LABEL[k].length > 0);
    assert.equal(creditsText(1050), "1,050크레딧");
  });

  it("자주 묻는 질문 — 크레딧 값·무료 권수는 offer 를 따른다, 무료 체험 질문은 없다", () => {
    const qs = FAQ.map((f) => f.q);
    assert.ok(!qs.some((q) => q.includes("무료 체험")));
    const more = FAQ.find((f) => f.q === "이번 달 책을 다 만들면요?");
    assert.ok(more?.a.includes("동화 1권에 50크레딧"));
    assert.ok(more?.a.includes("4,900원(50크레딧)부터"));
    const custom = planFaq({ ...DEFAULT_OFFER_VIEW, creditPacks: [{ priceWon: 3_000, credits: 30 }], creditCosts: { ...DEFAULT_CREDIT_COSTS, book: 40 } });
    const a = custom.find((f) => f.q === "이번 달 책을 다 만들면요?")?.a ?? "";
    assert.ok(a.includes("동화 1권에 40크레딧") && a.includes("3,000원(30크레딧)부터"), a);
    // 무료로 연 책이 없으면 '가입하지 않아도' 질문을 빼고
    const noFree = planFaq({ ...DEFAULT_OFFER_VIEW, free: { classics: 0, folk: 0, titles: [] } });
    assert.ok(!noFree.some((f) => f.q.includes("가입하지 않아도")));
  });

  it("고객에게 보이는 글 — 동화는 권으로, 단위 이름은 '가족 그리기 토큰'과 '크레딧'뿐(2026-10-01 사장님 확정)", () => {
    const all = JSON.stringify({
      PLANS,
      PASS_FEATURES,
      yearly: passFeaturesFor("yearly"),
      free: freeFeatures(),
      starter: starterFeatures(),
      CREDIT_USE_LABEL,
      FAQ,
      REFUND_SUMMARY,
      PLANS_PREVIEW_NOTE,
    });
    assert.doesNotMatch(all, /쿠키/);
    assert.doesNotMatch(all.replace(/가족 그리기 토큰/g, ""), /토큰/);
    assert.ok(PASS_FEATURES.some((f) => f.startsWith("가족 그리기 토큰")));
  });
});

describe("요금제 값(관리실) — 화면은 넘겨받은 값으로 그린다(2026-10-02)", () => {
  const custom = {
    monthly: { ...DEFAULT_PLAN_TERMS.monthly, priceWon: 17_900, booksPerMonth: 5 },
    yearly: { ...DEFAULT_PLAN_TERMS.yearly, priceWon: 179_000, voices: 3 },
    starter: { ...DEFAULT_PLAN_TERMS.starter, priceWon: 3_900, books: 2 },
  };
  const offer = { ...DEFAULT_OFFER_VIEW, plans: custom };

  it("기본 요금제 목록은 기본값으로 만든 것과 같다", () => {
    assert.deepEqual(plansOf(DEFAULT_PLAN_TERMS), PLANS);
  });

  it("값·권수는 terms 에서, 이름·주기·추가 3권은 그대로", () => {
    const p = plansOf(custom);
    assert.equal(p.monthly.priceWon, 17_900);
    assert.equal(p.monthly.books, 5);
    assert.equal(p.yearly.priceWon, 179_000);
    assert.equal(p.yearly.name, "가족 패스 (연간)");
    assert.deepEqual(p.extra3, PLANS.extra3);
    assert.equal(priceLabel(p.monthly), "월 17,900원");
  });

  it("연간 할인율은 넘겨받은 값으로 — 싸지 않으면 0 이하", () => {
    assert.equal(yearlyDiscountPct(plansOf(custom)), 17);
    const pricey = plansOf({ ...custom, yearly: { ...custom.yearly, priceWon: 250_000 } });
    assert.ok(yearlyDiscountPct(pricey) <= 0);
  });

  it("구성 줄 · 스타트팩 · 자주 묻는 질문이 관리실 값을 따른다", () => {
    assert.ok(passFeaturesFor("monthly", offer).includes("매달 새 동화책 5권"));
    assert.ok(passFeaturesFor("yearly", offer).includes("가족 목소리 3명 (한 달에 1번 다시 만들기)"));
    assert.ok(starterFeatures(offer).includes("우리 아이 동화 2권 만들기"));
    const starterQ = planFaq(offer).find((f) => f.q === "스타트팩은 무엇인가요?");
    assert.ok(starterQ?.a.startsWith("처음 한 번만 살 수 있는 3,900원 꾸러미예요. 우리 아이 동화 2권"), starterQ?.a);
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
