import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  asFamilyOffer,
  asLibraryAccess,
  DEFAULT_FAMILY_OFFER,
  familyOfferOf,
  CREDIT_COST_MAX,
  CREDIT_PACKS_MAX,
  defaultLibraryTiers,
  defaultOfferSettings,
  describeOfferChange,
  libraryAccessOf,
  libraryLock,
  normalizeCreditCosts,
  normalizeCreditPacks,
  normalizeLibraryTiers,
  offerLogFromRow,
  offerSettingsFromRow,
  offerViewOf,
  OPEN_LIBRARY,
  PACK_CREDITS_MAX,
  PACK_PRICE_MAX,
  PACK_PRICE_MIN,
  PASS_TERM_FIELDS,
  STARTER_TERM_FIELDS,
  clonePlanTerms,
  normalizePlanTerms,
  parseOfferPatch,
  parsePlanTerms,
  termValueText,
  tierOpens,
  type CatalogBook,
  type LibraryKind,
} from "./offer-settings.ts";
import { viewerTierOf } from "./member-plan.ts";
import { DEFAULT_CREDIT_COSTS, DEFAULT_CREDIT_PACKS, DEFAULT_PLAN_TERMS, PASS, PASS_YEARLY, STARTER } from "./plans.ts";

/** 작은 책 목록 — 세계명작 12권(3번째는 숨김) + 전래동화 11권 */
function fakeCatalog(): CatalogBook[] {
  const make = (kind: LibraryKind, n: number, hiddenAt: number[] = []) =>
    Array.from({ length: n }, (_, i) => ({
      id: `${kind}-b${i + 1}`,
      kind,
      title: `${kind === "classic" ? "명작" : "전래"} ${i + 1}`,
      cover: null,
      hidden: hiddenAt.includes(i),
    }));
  return [...make("classic", 12, [2]), ...make("folk", 11)];
}

/** 진짜 서가 — library-catalog.ts 와 같은 규칙으로 JSON 을 읽는다(그 파일은 @/ 경로라 시험이 바로 못 읽는다) */
function realCatalog(): CatalogBook[] {
  const read = (rel: string, kind: LibraryKind) =>
    (JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8")) as { id: string; title: string; hidden?: boolean }[]).map(
      (b) => ({ id: b.id, kind, title: b.title, cover: null, hidden: b.hidden === true }),
    );
  return [...read("../data/classic-books.json", "classic"), ...read("../data/folk-books.json", "folk")];
}

const CAT = fakeCatalog();
const IDS = new Set(CAT.map((b) => b.id));

describe("기본 단계 — 서가 앞에서 5권씩 무료, 10권까지 스타트팩, 나머지 가족 패스", () => {
  it("숨긴 책은 순서에서 빼고 가족 패스", () => {
    const t = defaultLibraryTiers(CAT);
    // 세계명작: 1·2·4·5·6 무료(3은 숨김), 7~11 스타트팩, 12 가족 패스
    assert.deepEqual(
      ["classic-b1", "classic-b2", "classic-b4", "classic-b5", "classic-b6"].map((id) => t[id]),
      ["free", "free", "free", "free", "free"],
    );
    assert.equal(t["classic-b3"], "pass");
    assert.deepEqual(
      ["classic-b7", "classic-b8", "classic-b9", "classic-b10", "classic-b11"].map((id) => t[id]),
      ["starter", "starter", "starter", "starter", "starter"],
    );
    assert.equal(t["classic-b12"], "pass");
    assert.equal(t["folk-b5"], "free");
    assert.equal(t["folk-b6"], "starter");
    assert.equal(t["folk-b11"], "pass");
  });

  it("진짜 서가로 세면 무료 5+5 · 스타트팩 10+10 · 가족 패스 40권(숨긴 3권 빼고)", () => {
    const real = realCatalog();
    const view = offerViewOf(defaultOfferSettings(real), real);
    assert.deepEqual({ ...view.free, titles: view.free.titles.length }, { classics: 5, folk: 5, titles: 10 });
    assert.deepEqual(view.starter, { classics: 10, folk: 10 });
    assert.equal(view.libraryBooks, 40);
    assert.ok(view.free.titles.includes("신데렐라"));
    assert.ok(view.free.titles.includes("흥부와 놀부"));
  });
});

describe("요금제 화면 값 — 단계는 겹쳐 열린다", () => {
  it("tierOpens", () => {
    assert.equal(tierOpens("free", "free"), true);
    assert.equal(tierOpens("free", "starter"), false);
    assert.equal(tierOpens("starter", "free"), true);
    assert.equal(tierOpens("pass", "starter"), true);
    assert.equal(tierOpens("starter", "pass"), false);
  });

  it("고른 대로 센다 — 스타트팩 권수는 무료 책을 포함, 숨긴 책은 무료여도 세지 않는다", () => {
    const s = defaultOfferSettings(CAT);
    s.libraryTiers["classic-b3"] = "free"; // 숨긴 책
    s.libraryTiers["classic-b12"] = "starter";
    s.libraryTiers["folk-b1"] = "pass";
    const v = offerViewOf(s, CAT);
    assert.deepEqual([v.free.classics, v.free.folk], [5, 4]);
    assert.deepEqual([v.starter.classics, v.starter.folk], [11, 9]);
    assert.equal(v.libraryBooks, 22);
    assert.ok(!v.free.titles.includes("명작 3"));
    assert.ok(!v.free.titles.includes("전래 1"));
  });
});

describe("DB 값 읽기 — 틀린 값은 기본값으로", () => {
  it("줄이 없으면 기본값, 스위치는 꺼짐", () => {
    const s = offerSettingsFromRow(null, CAT);
    assert.equal(s.gateOn, false);
    assert.deepEqual(s.libraryTiers, defaultLibraryTiers(CAT));
    assert.deepEqual(s.creditPacks, [...DEFAULT_CREDIT_PACKS]);
    assert.deepEqual(s.creditCosts, { ...DEFAULT_CREDIT_COSTS });
  });

  it("단계 — 모르는 책·틀린 단계는 버리고 빈 책은 기본값", () => {
    const t = normalizeLibraryTiers({ "classic-b1": "pass", "classic-b2": "gold", "folk-zzz": "free", "folk-b6": "free" }, CAT);
    assert.equal(t["classic-b1"], "pass");
    assert.equal(t["classic-b2"], "free");
    assert.equal(t["folk-b6"], "free");
    assert.ok(!("folk-zzz" in t));
    assert.equal(Object.keys(t).length, CAT.length);
  });

  it("묶음 — 값이 싼 순서, 같은 값은 앞 것만, 틀린 것은 빼고, 다섯 개까지, 없으면 null", () => {
    assert.deepEqual(
      normalizeCreditPacks([
        { priceWon: 9900, credits: 105 },
        { priceWon: 4900, credits: 50 },
        { priceWon: 4900, credits: 60 },
        { priceWon: 100, credits: 1 },
        { priceWon: 19900, credits: 2.5 },
        "x",
      ]),
      [
        { priceWon: 4900, credits: 50 },
        { priceWon: 9900, credits: 105 },
      ],
    );
    assert.equal(normalizeCreditPacks([]), null);
    assert.equal(normalizeCreditPacks({}), null);
    const many = Array.from({ length: 9 }, (_, i) => ({ priceWon: 1000 * (i + 1), credits: 10 * (i + 1) }));
    assert.equal(normalizeCreditPacks(many)?.length, CREDIT_PACKS_MAX);
  });

  it("쓰는 값 — 없거나 틀린 칸은 기본값, 0 크레딧은 받는다", () => {
    assert.deepEqual(normalizeCreditCosts({ book: 40, voice: -1, draw: 0, extra: 9 }), {
      ...DEFAULT_CREDIT_COSTS,
      book: 40,
      draw: 0,
    });
  });
});

describe("바꾸기 검사(parseOfferPatch) — 하나라도 틀리면 아무것도 안 바꾼다", () => {
  const ok = (patch: unknown) => parseOfferPatch({ patch, note: "10월 확정안" }, IDS);
  const err = (patch: unknown, note = "10월 확정안") => {
    const r = parseOfferPatch({ patch, note }, IDS);
    assert.equal(r.ok, false);
    return r.ok ? "" : r.error;
  };

  it("맞는 바꾸기는 DB 칸 이름으로, 묶음은 값이 싼 순서로", () => {
    const r = ok({
      libraryTiers: { "classic-b1": "starter", "folk-b2": "pass" },
      gateOn: true,
      creditPacks: [
        { priceWon: 9900, credits: 105 },
        { priceWon: 4900, credits: 50 },
      ],
      creditCosts: { book: 50, character: 20, voice: 15, draw: 0 },
    });
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.deepEqual(r.value.patch, {
      library_tiers: { "classic-b1": "starter", "folk-b2": "pass" },
      library_gate_on: true,
      credit_packs: [
        { priceWon: 4900, credits: 50 },
        { priceWon: 9900, credits: 105 },
      ],
      credit_costs: { book: 50, character: 20, voice: 15, draw: 0 },
    });
    assert.equal(r.value.note, "10월 확정안");
  });

  it("사유 · 빈 바꾸기 · 모르는 항목", () => {
    assert.match(err({ gateOn: true }, " 1 "), /두 글자/);
    assert.match(err({ gateOn: true }, "가".repeat(501)), /500자/);
    assert.match(err({}), /바꿀 항목/);
    assert.match(err({ price: 1 }), /모르는 항목/);
    assert.equal(parseOfferPatch([], IDS).ok, false);
  });

  it("단계 — 모르는 책 · 틀린 단계 · 빈 목록", () => {
    assert.match(err({ libraryTiers: { "classic-nope": "free" } }), /모르는 동화/);
    assert.match(err({ libraryTiers: { "classic-b1": "gold" } }), /가운데서 골라/);
    assert.match(err({ libraryTiers: {} }), /모양이 아니에요/);
    assert.match(err({ gateOn: "yes" }), /켜기·끄기/);
  });

  it("묶음 — 개수 · 값 범위 · 정수 · 같은 값", () => {
    assert.match(err({ creditPacks: [] }), /1~5개/);
    assert.match(
      err({ creditPacks: Array.from({ length: CREDIT_PACKS_MAX + 1 }, (_, i) => ({ priceWon: 1000 + i, credits: 10 })) }),
      /1~5개/,
    );
    assert.match(err({ creditPacks: [{ priceWon: PACK_PRICE_MIN - 1, credits: 10 }] }), /묶음 값/);
    assert.match(err({ creditPacks: [{ priceWon: PACK_PRICE_MAX + 1, credits: 10 }] }), /묶음 값/);
    assert.match(err({ creditPacks: [{ priceWon: 4900, credits: 0 }] }), /묶음 크레딧/);
    assert.match(err({ creditPacks: [{ priceWon: 4900, credits: 1.5 }] }), /묶음 크레딧/);
    assert.match(
      err({
        creditPacks: [
          { priceWon: 4900, credits: 50 },
          { priceWon: 4900, credits: 60 },
        ],
      }),
      /두 개/,
    );
  });

  it("쓰는 값 — 네 칸 모두, 모르는 칸 없이, 0~최대 정수", () => {
    assert.match(err({ creditCosts: { book: 50, character: 20, voice: 15 } }), /가족 그리기/);
    assert.match(err({ creditCosts: { book: 50, character: 20, voice: 15, draw: 5, tip: 1 } }), /모르는 항목/);
    assert.match(err({ creditCosts: { book: CREDIT_COST_MAX + 1, character: 20, voice: 15, draw: 5 } }), /동화 1권/);
    assert.match(err({ creditCosts: { book: -1, character: 20, voice: 15, draw: 5 } }), /동화 1권/);
  });
});

describe("책장 자물쇠", () => {
  const s = defaultOfferSettings(CAT);
  const on = { ...libraryAccessOf(s), gateOn: true };

  it("스위치가 꺼져 있으면 아무것도 잠그지 않는다", () => {
    assert.equal(libraryLock(libraryAccessOf(s), "classic-b12", "free"), null);
    assert.equal(libraryLock(OPEN_LIBRARY, "folk-b11", "free"), null);
  });

  it("비회원(무료) — 무료 책만 열리고, 잠긴 책은 필요한 단계를 알려 준다", () => {
    const viewer = viewerTierOf(false, null);
    assert.equal(viewer, "free");
    assert.equal(libraryLock(on, "classic-b1", viewer), null);
    assert.equal(libraryLock(on, "classic-b7", viewer), "starter");
    assert.equal(libraryLock(on, "classic-b12", viewer), "pass");
  });

  it("요금제 지정이 없는 회원은 무료 회원과 같다(10-20) · 관리자는 전부 · 내가 만든 책은 잠그지 않는다 · 모르는 책은 가족 패스", () => {
    assert.equal(viewerTierOf(true, null), "free");
    assert.equal(libraryLock(on, "classic-b1", viewerTierOf(true, null)), null);
    assert.equal(libraryLock(on, "classic-b12", viewerTierOf(true, null)), "pass");
    assert.equal(libraryLock(on, "classic-b12", viewerTierOf(true, null, true)), null);
    assert.equal(libraryLock(on, "my-123", "free"), null);
    assert.equal(libraryLock(on, "classic-new", "free"), "pass");
    assert.equal(libraryLock(on, "classic-new", "starter"), "pass");
  });

  it("공개 경로의 답 읽기 — 틀린 칸은 버린다", () => {
    const a = asLibraryAccess({ gateOn: true, tiers: { "classic-b1": "free", "my-1": "free", "folk-b2": "gold" } });
    assert.deepEqual(a, { gateOn: true, tiers: { "classic-b1": "free" } });
    assert.deepEqual(asLibraryAccess(null), OPEN_LIBRARY);
    assert.deepEqual(asLibraryAccess({ gateOn: "true" }), OPEN_LIBRARY);
  });

  it("가족 액자 안내 값 — 관리실 값(가족 패스 캐릭터 수 · 캐릭터 크레딧), 틀리면 기본값", () => {
    const s = offerSettingsFromRow({ credit_costs: { book: 50, character: 30, voice: 15, draw: 5 } }, CAT);
    assert.deepEqual(familyOfferOf(s), { characters: s.plans.monthly.familyCharacters, characterCredits: 30 });
    assert.deepEqual(asFamilyOffer({ family: { characters: 4, characterCredits: 20 } }), { characters: 4, characterCredits: 20 });
    assert.deepEqual(asFamilyOffer({ family: { characters: "4", characterCredits: -1 } }), DEFAULT_FAMILY_OFFER);
    assert.deepEqual(asFamilyOffer(null), DEFAULT_FAMILY_OFFER);
  });
});

describe("이력 글", () => {
  it("단계 — 바뀐 책만, 여덟 줄이 넘으면 줄인다, 첫 저장은 기본값에서", () => {
    const before = defaultLibraryTiers(CAT);
    const after = { ...before, "classic-b1": "pass", "folk-b6": "free" };
    assert.deepEqual(describeOfferChange("library_tiers", before, after, CAT), ["명작 1: 무료 → 가족 패스", "전래 6: 스타트팩 → 무료"]);
    assert.deepEqual(describeOfferChange("library_tiers", {}, after, CAT), ["명작 1: 무료 → 가족 패스", "전래 6: 스타트팩 → 무료"]);
    const allPass = Object.fromEntries(CAT.map((b) => [b.id, "pass"]));
    const lines = describeOfferChange("library_tiers", before, allPass, CAT);
    assert.equal(lines.length, 9);
    assert.match(lines[8], /^그 밖에 \d+권$/);
  });

  it("스위치 · 묶음 · 쓰는 값", () => {
    assert.deepEqual(describeOfferChange("library_gate_on", false, true, CAT), ["꺼짐 → 켜짐"]);
    assert.deepEqual(describeOfferChange("credit_packs", [], [{ priceWon: 5000, credits: 50 }], CAT), [
      "4,900원 50크레딧 · 9,900원 105크레딧 · 19,900원 220크레딧",
      "→ 5,000원 50크레딧",
    ]);
    assert.deepEqual(describeOfferChange("credit_costs", {}, { ...DEFAULT_CREDIT_COSTS, book: 45 }, CAT), [
      "동화 1권 더 만들기: 50크레딧 → 45크레딧",
    ]);
    assert.deepEqual(describeOfferChange("unknown", 1, 2, CAT), []);
  });

  it("이력 줄 읽기", () => {
    const row = offerLogFromRow(
      { id: 7, field: "library_gate_on", old_value: false, new_value: true, note: "시험", changed_by_username: "yogico", at: "2026-10-01T09:00:00Z" },
      CAT,
    );
    assert.deepEqual(row, {
      id: 7,
      field: "library_gate_on",
      label: "책장에 적용",
      lines: ["꺼짐 → 켜짐"],
      note: "시험",
      by: "yogico",
      at: "2026-10-01T09:00:00Z",
    });
    assert.equal(offerLogFromRow({ id: 1 }, CAT), null);
  });
});

describe("요금제 값(가족 패스 월간·연간 · 스타트팩) — 관리실에서 바꾼다(2026-10-02)", () => {
  it("기본값은 plans.ts 의 확정안과 같다", () => {
    assert.equal(DEFAULT_PLAN_TERMS.monthly.priceWon, 19_900);
    assert.equal(DEFAULT_PLAN_TERMS.yearly.priceWon, 199_000);
    assert.equal(DEFAULT_PLAN_TERMS.monthly.familyCharacters, PASS.familyCharacters);
    assert.equal(DEFAULT_PLAN_TERMS.yearly.familyCharacters, PASS_YEARLY.familyCharacters);
    assert.equal(DEFAULT_PLAN_TERMS.yearly.voices, PASS_YEARLY.voices);
    assert.deepEqual(DEFAULT_PLAN_TERMS.starter, {
      priceWon: STARTER.priceWon,
      books: STARTER.books,
      familyCharacters: STARTER.familyCharacters,
      voices: STARTER.voices,
    });
    // 기본값도 받는 범위 안이어야 한다(관리실에서 그대로 저장할 수 있게)
    assert.deepEqual(parsePlanTerms(DEFAULT_PLAN_TERMS), { ok: true, terms: DEFAULT_PLAN_TERMS });
  });

  it("DB 값 읽기 — 빠지거나 범위 밖인 칸은 기본값, 맞는 칸은 그대로", () => {
    const t = normalizePlanTerms({
      monthly: { priceWon: 17_900, booksPerMonth: 0, voices: "2" },
      yearly: { familyCharacters: 8 },
      starter: { priceWon: 0, books: 2 },
    });
    assert.equal(t.monthly.priceWon, 17_900);
    assert.equal(t.monthly.booksPerMonth, DEFAULT_PLAN_TERMS.monthly.booksPerMonth); // 0 은 범위 밖
    assert.equal(t.monthly.voices, DEFAULT_PLAN_TERMS.monthly.voices); // 글자는 받지 않는다
    assert.equal(t.yearly.familyCharacters, 8);
    assert.equal(t.yearly.priceWon, DEFAULT_PLAN_TERMS.yearly.priceWon);
    assert.equal(t.starter.priceWon, 0); // 스타트팩은 0원(무료로 주기)도 된다
    assert.equal(t.starter.books, 2);
    assert.deepEqual(normalizePlanTerms(null), DEFAULT_PLAN_TERMS);
    assert.deepEqual(offerSettingsFromRow({ plan_settings: { monthly: { priceWon: 15_900 } } }, CAT).plans.monthly.priceWon, 15_900);
  });

  it("바꾸기 검사 — 세 묶음 모든 칸 · 범위 · 모르는 칸", () => {
    const good = clonePlanTerms(DEFAULT_PLAN_TERMS);
    good.monthly.priceWon = 17_900;
    good.yearly.voices = 3;
    const r = parseOfferPatch({ patch: { plans: good }, note: "가격 조정" }, IDS);
    assert.ok(r.ok);
    if (r.ok) assert.deepEqual(r.value.patch, { plan_settings: good });

    const bad = (mutate: (t: Record<string, Record<string, unknown>>) => void) => {
      const t = JSON.parse(JSON.stringify(DEFAULT_PLAN_TERMS)) as Record<string, Record<string, unknown>>;
      mutate(t);
      const out = parsePlanTerms(t);
      assert.equal(out.ok, false);
      return out.ok ? "" : out.error;
    };
    assert.match(bad((t) => delete t.starter), /스타트팩 값이 빠졌어요/);
    assert.match(bad((t) => (t.monthly.priceWon = 500)), /가족 패스\(월간\) 값\(부가세 포함\)은\(는\) 1,000원~10,000,000원/);
    assert.match(bad((t) => (t.yearly.familyCharacters = 0)), /가족 패스\(연간\) 가족 캐릭터/);
    assert.match(bad((t) => (t.starter.voices = 1.5)), /스타트팩 (가족|AI 성우) 목소리/);
    assert.match(bad((t) => (t.monthly.tip = 1)), /모르는 항목이에요: tip/);
    assert.match(bad((t) => (t.weekly = {})), /모르는 항목이에요: weekly/);
    assert.equal(parsePlanTerms("x").ok, false);
  });

  it("이력 글 — 바뀐 칸만 '이름: 앞 → 뒤'", () => {
    const after = clonePlanTerms(DEFAULT_PLAN_TERMS);
    after.monthly.priceWon = 17_900;
    after.yearly.familyCharacters = 8;
    after.starter.books = 2;
    assert.deepEqual(describeOfferChange("plan_settings", {}, after, CAT), [
      "가족 패스(월간) 값(부가세 포함): 19,900원 → 17,900원",
      "가족 패스(연간) 가족 캐릭터: 6명 → 8명",
      "스타트팩 동화 만들기: 1권 → 2권",
    ]);
    assert.deepEqual(describeOfferChange("plan_settings", DEFAULT_PLAN_TERMS, DEFAULT_PLAN_TERMS, CAT), ["바뀐 값 없음"]);
  });

  it("요금제 화면 값에 실린다 · 칸 이름과 단위", () => {
    const s = defaultOfferSettings(CAT);
    s.plans.monthly.priceWon = 16_900;
    assert.equal(offerViewOf(s, CAT).plans.monthly.priceWon, 16_900);
    assert.equal(termValueText("원", 19_900), "19,900원");
    assert.equal(termValueText("명", 4), "4명");
    assert.deepEqual(
      PASS_TERM_FIELDS.map((f) => f.key).sort(),
      Object.keys(DEFAULT_PLAN_TERMS.monthly).sort(),
    );
    assert.deepEqual(
      STARTER_TERM_FIELDS.map((f) => f.key).sort(),
      Object.keys(DEFAULT_PLAN_TERMS.starter).sort(),
    );
  });
});

describe("DB 함수와 화면 검사가 같은 규칙을 쓴다(supabase-offer-settings.sql)", () => {
  const sql = readFileSync(new URL("../../supabase-offer-settings.sql", import.meta.url), "utf8");
  it("칸 · 개수 · 범위", () => {
    assert.ok(sql.includes("array['library_tiers','library_gate_on','credit_packs','credit_costs','plan_settings']"));
    assert.ok(sql.includes(`jsonb_array_length(v) > ${CREDIT_PACKS_MAX}`));
    assert.ok(sql.includes(`offer_int_ok(e -> 'priceWon', ${PACK_PRICE_MIN}, ${PACK_PRICE_MAX})`));
    assert.ok(sql.includes(`offer_int_ok(e -> 'credits', 1, ${PACK_CREDITS_MAX})`));
    assert.ok(sql.includes(`offer_int_ok(t.value, 0, ${CREDIT_COST_MAX})`));
    assert.ok(sql.includes("not in ('free','starter','pass')"));
    assert.ok(sql.includes("not in ('book','character','voice','draw')"));
  });
  it("요금제 값 — 칸마다 앱과 같은 범위(가족 패스 월간·연간 · 스타트팩)", () => {
    for (const f of PASS_TERM_FIELDS) {
      assert.ok(sql.includes(`offer_int_ok(e -> '${f.key}', ${f.min}, ${f.max})`), f.key);
    }
    for (const f of STARTER_TERM_FIELDS) {
      assert.ok(sql.includes(`offer_int_ok(e -> '${f.key}', ${f.min}, ${f.max})`), `starter ${f.key}`);
    }
    // 모르는 칸을 막는 목록도 앱과 같다
    assert.ok(sql.includes(`not in (${STARTER_TERM_FIELDS.map((f) => `'${f.key}'`).join(",")})`));
    for (const f of PASS_TERM_FIELDS) assert.ok(sql.includes(`'${f.key}'`), f.key);
  });
  it("바꾸기는 회사 계정만, 이력은 마스터만, 표는 공개 칸만 읽기", () => {
    assert.ok(sql.includes("if not public.is_pricing_admin() then"));
    assert.ok(sql.includes("if not public.is_master_user() then"));
    assert.match(sql, /grant select \(id, library_tiers, library_gate_on, credit_packs, credit_costs, plan_settings, updated_at\)/);
    assert.ok(!/grant select[^;]*updated_by/.test(sql));
  });
});
