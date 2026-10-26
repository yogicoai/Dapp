import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { castPortraits, storyFamilyLookLines, storyFamilyLooks } from "./family-cast.ts";
import type { FamilyMember, FamilyPortrait } from "./family.ts";

/*
 * 동화 등장인물 ↔ 우리 가족 캐릭터 짝짓기.
 * 이름은 클로드가 정한다(주인공 = 아이 이름, 같이 나오는 사람 = 적어 준 이름이나 호칭 — anthropic.ts whoLine).
 * 헷갈리면 붙이지 않는다 — 남의 얼굴이 붙는 것이 새 얼굴보다 나쁘다.
 */

const pic = (id: string): FamilyPortrait => ({
  url: `https://x.cafe24.com/family/u/${id}.png`,
  ref: `https://x.cafe24.com/family/u/${id}-ref.jpg`,
  at: "2026-09-28T00:00:00.000Z",
});
/** 고정한 사람(그림 있음) */
const fixed = (m: Omit<FamilyMember, "portrait">): FamilyMember => ({ ...m, portrait: pic(m.id) });

const child = fixed({ id: "child", role: "child", callName: "하온" });
const mom = fixed({ id: "mom", role: "mom", callName: "엄마" });
const dad = fixed({ id: "dad", role: "dad", callName: "아빠" });
const chars = (...names: string[]) => names.map((name) => ({ name, description: "" }));
const pick = (names: string[], family: FamilyMember[] | undefined, max?: number) =>
  castPortraits(chars(...names), family, max === undefined ? {} : { max }).map((p) => [p.name, p.memberId]);

describe("뺀 사람(회색 카드, 2026-10-26) — 등장인물 얼굴·이야기 생김새에서 빠진다", () => {
  it("뺀 엄마·단짝 친구는 얼굴을 붙이지 않고, 이야기에도 건네지 않는다", () => {
    const offMom = { ...mom, inactive: true };
    const friend = fixed({ id: "m-f", role: "friend", callName: "친구", name: "서준" });
    assert.deepEqual(pick(["하온", "엄마", "서준"], [child, offMom, { ...friend, inactive: true }]), [["하온", "child"]]);
    assert.deepEqual(pick(["하온", "엄마", "서준"], [child, mom, friend]), [["하온", "child"], ["엄마", "mom"], ["서준", "m-f"]]);
    assert.deepEqual(storyFamilyLooks([{ ...friend, inactive: true }]), []);
    assert.deepEqual(storyFamilyLooks([friend]), [{ who: "서준(단짝 친구)", fixed: true }]);
  });
});

describe("castPortraits — 주인공", () => {
  it("아이 호칭과 같은 이름이면 아이 그림 — '하온이'도 하온", () => {
    assert.deepEqual(castPortraits(chars("하온"), [child]), [
      { name: "하온", ref: child.portrait!.ref, memberId: "child", role: "child" },
    ]);
    assert.deepEqual(pick(["하온이"], [child]), [["하온이", "child"]]);
    assert.deepEqual(pick(["하온 (5세)"], [child]), [["하온 (5세)", "child"]]);
  });

  it("받침 없는 이름은 '이'를 떼지 않는다", () => {
    const jiwoo = fixed({ id: "child", role: "child", callName: "지우" });
    assert.deepEqual(pick(["지우"], [jiwoo]), [["지우", "child"]]);
    assert.deepEqual(pick(["서연"], [jiwoo]), []);
  });

  it("주인공은 호칭 낱말로 짝짓지 않는다 · 이름이 다르면 붙이지 않는다", () => {
    assert.deepEqual(pick(["엄마"], [child, mom]), []);
    assert.deepEqual(pick(["하린"], [child]), []);
  });

  it("이름이 같은 형제가 주인공일 수 있다 — 아이와 둘 다 맞으면 헷갈려서 안 붙인다", () => {
    const harin = fixed({ id: "m-harin000001", role: "sibling", callName: "여동생", name: "하린" });
    assert.deepEqual(pick(["하린", "하온"], [child, harin]), [
      ["하린", "m-harin000001"],
      ["하온", "child"],
    ]);
    const sameName = fixed({ id: "m-twin00000001", role: "sibling", callName: "남동생", name: "하온" });
    assert.deepEqual(pick(["하온"], [child, sameName]), []);
  });
});

describe("castPortraits — 엄마·아빠", () => {
  it("엄마·아빠·어머니·아버지 그대로", () => {
    assert.deepEqual(pick(["하온", "엄마", "아빠"], [child, mom, dad]), [
      ["하온", "child"],
      ["엄마", "mom"],
      ["아빠", "dad"],
    ]);
    assert.deepEqual(pick(["하온", "어머니", "아버지"], [child, mom, dad]), [
      ["하온", "child"],
      ["어머니", "mom"],
      ["아버지", "dad"],
    ]);
  });

  it("'하온이 엄마'·'우리 엄마'는 엄마, '서연이 엄마'는 남이다", () => {
    assert.deepEqual(pick(["하온", "하온이 엄마"], [child, mom]), [
      ["하온", "child"],
      ["하온이 엄마", "mom"],
    ]);
    assert.deepEqual(pick(["하온", "우리 아빠"], [child, dad]), [
      ["하온", "child"],
      ["우리 아빠", "dad"],
    ]);
    assert.deepEqual(pick(["하온", "서연이 엄마"], [child, mom]), [["하온", "child"]]);
  });

  it("괄호에 이름이나 호칭을 적어도 알아본다", () => {
    assert.deepEqual(pick(["하온", "엄마 (지은)"], [child, mom]), [
      ["하온", "child"],
      ["엄마 (지은)", "mom"],
    ]);
    assert.deepEqual(pick(["하온", "지은(엄마)"], [child, mom]), [
      ["하온", "child"],
      ["지은(엄마)", "mom"],
    ]);
  });
});

describe("castPortraits — 할머니·할아버지", () => {
  const oeHalmeoni = fixed({ id: "m-grandma0001", role: "grandma", callName: "외할머니" });
  const chinHalmeoni = fixed({ id: "m-grandma0002", role: "grandma", callName: "친할머니" });

  it("할머니가 한 분이면 그냥 '할머니'도 그분", () => {
    assert.deepEqual(pick(["하온", "할머니"], [child, oeHalmeoni]), [
      ["하온", "child"],
      ["할머니", "m-grandma0001"],
    ]);
  });

  it("두 분이면 그냥 '할머니'는 헷갈려서 안 붙이고, 호칭이 같으면 그분", () => {
    assert.deepEqual(pick(["하온", "할머니"], [child, oeHalmeoni, chinHalmeoni]), [["하온", "child"]]);
    assert.deepEqual(pick(["하온", "친할머니"], [child, oeHalmeoni, chinHalmeoni]), [
      ["하온", "child"],
      ["친할머니", "m-grandma0002"],
    ]);
  });

  it("한 분만 고정해도 두 분이면 헷갈린다(고정 안 한 분까지 센다)", () => {
    const looksOnly: FamilyMember = { id: "m-grandma0002", role: "grandma", callName: "친할머니", looksOnly: true };
    assert.deepEqual(pick(["하온", "할머니"], [child, oeHalmeoni, looksOnly]), [["하온", "child"]]);
  });

  it("호칭이 '할머니'인 분이 있으면 그분이 먼저", () => {
    const halmeoni = fixed({ id: "m-grandma0003", role: "grandma", callName: "할머니" });
    assert.deepEqual(pick(["하온", "할머니"], [child, halmeoni, oeHalmeoni]), [
      ["하온", "child"],
      ["할머니", "m-grandma0003"],
    ]);
  });

  it("'외할머니'인데 가족엔 '할머니'로만 있으면 같은 분인지 몰라 안 붙인다", () => {
    const halmeoni = fixed({ id: "m-grandma0003", role: "grandma", callName: "할머니" });
    assert.deepEqual(pick(["하온", "외할머니"], [child, halmeoni]), [["하온", "child"]]);
  });

  it("할아버지도 같다", () => {
    const grandpa = fixed({ id: "m-grandpa0001", role: "grandpa", callName: "외할아버지" });
    assert.deepEqual(pick(["하온", "할아버지"], [child, grandpa]), [
      ["하온", "child"],
      ["할아버지", "m-grandpa0001"],
    ]);
  });
});

describe("castPortraits — 형제", () => {
  it("이름으로", () => {
    const harin = fixed({ id: "m-sib000000001", role: "sibling", callName: "여동생", name: "하린" });
    assert.deepEqual(pick(["하온", "하린이"], [child, harin]), [
      ["하온", "child"],
      ["하린이", "m-sib000000001"],
    ]);
  });

  it("형=오빠, 누나=언니 — 호칭이 딱 맞는 사람이 없고 그 자리에 한 명뿐일 때", () => {
    const oppa = fixed({ id: "m-sib000000002", role: "sibling", callName: "오빠" });
    assert.deepEqual(pick(["하온", "형"], [child, oppa]), [
      ["하온", "child"],
      ["형", "m-sib000000002"],
    ]);
    const unnie = fixed({ id: "m-sib000000003", role: "sibling", callName: "언니" });
    assert.deepEqual(pick(["하온", "누나"], [child, unnie]), [
      ["하온", "child"],
      ["누나", "m-sib000000003"],
    ]);
    const hyung = fixed({ id: "m-sib000000004", role: "sibling", callName: "형" });
    assert.deepEqual(pick(["하온", "형"], [child, oppa, hyung]), [
      ["하온", "child"],
      ["형", "m-sib000000004"],
    ]);
    const oppa2 = fixed({ id: "m-sib000000005", role: "sibling", callName: "오빠" });
    assert.deepEqual(pick(["하온", "형"], [child, oppa, oppa2]), [["하온", "child"]]);
  });

  it("'동생'은 남동생·여동생 가운데 한 명뿐일 때만", () => {
    const brother = fixed({ id: "m-sib000000006", role: "sibling", callName: "남동생" });
    const sister = fixed({ id: "m-sib000000007", role: "sibling", callName: "여동생" });
    assert.deepEqual(pick(["하온", "동생"], [child, brother]), [
      ["하온", "child"],
      ["동생", "m-sib000000006"],
    ]);
    assert.deepEqual(pick(["하온", "동생이"], [child, brother]), [
      ["하온", "child"],
      ["동생이", "m-sib000000006"],
    ]);
    assert.deepEqual(pick(["하온", "하온이 동생"], [child, brother]), [
      ["하온", "child"],
      ["하온이 동생", "m-sib000000006"],
    ]);
    assert.deepEqual(pick(["하온", "동생"], [child, brother, sister]), [["하온", "child"]]);
    assert.deepEqual(pick(["하온", "여동생"], [child, brother, sister]), [
      ["하온", "child"],
      ["여동생", "m-sib000000007"],
    ]);
  });
});

describe("castPortraits — 단짝 친구", () => {
  const seoyeon = fixed({ id: "m-friend00001", role: "friend", callName: "친구", name: "서연" });

  it("이름으로만 — 그냥 '친구'는 누구와도 짝짓지 않는다", () => {
    assert.deepEqual(pick(["하온", "서연"], [child, seoyeon]), [
      ["하온", "child"],
      ["서연", "m-friend00001"],
    ]);
    assert.deepEqual(pick(["하온", "서연이"], [child, seoyeon]), [
      ["하온", "child"],
      ["서연이", "m-friend00001"],
    ]);
    assert.deepEqual(pick(["하온", "친구"], [child, seoyeon]), [["하온", "child"]]);
  });

  it("이름 없는 단짝 친구는 붙지 않는다", () => {
    const noName = fixed({ id: "m-friend00002", role: "friend", callName: "친구" });
    assert.deepEqual(pick(["하온", "친구"], [child, noName]), [["하온", "child"]]);
  });
});

describe("castPortraits — 호칭은 주인공이 우리 아이일 때만", () => {
  const seoyeon = fixed({ id: "m-friend00001", role: "friend", callName: "친구", name: "서연" });
  const grandma = fixed({ id: "m-grandma0001", role: "grandma", callName: "할머니" });

  it("주인공이 가족이 아니면(사촌·단짝 친구) '엄마'는 그 아이의 엄마 — 붙이지 않는다", () => {
    assert.deepEqual(pick(["서준", "엄마"], [child, mom]), []);
    assert.deepEqual(pick(["서준", "아빠", "할머니"], [child, dad, grandma]), []);
    assert.deepEqual(pick(["서연", "엄마"], [child, mom, seoyeon]), []);
    assert.deepEqual(pick(["서연", "서연이 엄마"], [child, mom, seoyeon]), []);
  });

  it("주인공이 가족이 아니어도 이름으로는 짝짓는다", () => {
    assert.deepEqual(pick(["서연", "하온"], [child, seoyeon]), [["하온", "child"]]);
  });

  it("아이 얼굴을 고정하지 않았어도 주인공이 아이면 호칭은 우리 가족", () => {
    const unfixedChild: FamilyMember = { id: "child", role: "child", callName: "하온" };
    assert.deepEqual(pick(["하온", "엄마"], [unfixedChild, mom]), [["엄마", "mom"]]);
  });

  it("형제가 주인공이면 엄마·아빠·할머니는 같은 분, 형제 호칭은 누구인지 몰라 안 붙인다", () => {
    const hajun = fixed({ id: "m-hajun000001", role: "sibling", callName: "형", name: "하준" });
    const harin = fixed({ id: "m-harin000001", role: "sibling", callName: "여동생", name: "하린" });
    const family = [child, hajun, harin, mom, grandma];
    // 하준이의 '동생'은 하온일 수도 하린일 수도 있다 — 하린(여자아이) 얼굴을 붙이지 않는다
    assert.deepEqual(pick(["하준", "동생"], family), [["하준", "m-hajun000001"]]);
    assert.deepEqual(pick(["하린", "오빠"], family), [["하린", "m-harin000001"]]);
    assert.deepEqual(pick(["하준", "엄마", "할머니", "하온"], family), [
      ["하준", "m-hajun000001"],
      ["엄마", "mom"],
      ["할머니", "m-grandma0001"],
      ["하온", "child"],
    ]);
    assert.deepEqual(pick(["하준", "하준이 엄마"], family), [
      ["하준", "m-hajun000001"],
      ["하준이 엄마", "mom"],
    ]);
  });
});

describe("castPortraits — 고정한 그림만 · 한 사람 한 번 · 상한", () => {
  it("확인 전 그림(draft·prevDraft)·특징만 저장한 사람은 붙이지 않는다", () => {
    const draftOnly: FamilyMember = { id: "mom", role: "mom", callName: "엄마", draft: pic("mom"), prevDraft: pic("mom-old") };
    const looksOnly: FamilyMember = { id: "dad", role: "dad", callName: "아빠", looksOnly: true };
    assert.deepEqual(pick(["하온", "엄마", "아빠"], [child, draftOnly, looksOnly]), [["하온", "child"]]);
  });

  it("한 사람은 앞 인물 하나에만", () => {
    assert.deepEqual(pick(["하온", "엄마", "어머니"], [child, mom]), [
      ["하온", "child"],
      ["엄마", "mom"],
    ]);
  });

  it("이야기에 없는 가족은 붙이지 않는다", () => {
    const grandma = fixed({ id: "m-grandma0001", role: "grandma", callName: "할머니" });
    assert.deepEqual(pick(["하온", "엄마"], [child, mom, dad, grandma]), [
      ["하온", "child"],
      ["엄마", "mom"],
    ]);
  });

  it("주인공 먼저 등장인물 순서로 시트의 6명 모두(상한을 주면 그만큼)", () => {
    // 2026-10-01 — 예전 4명 상한에선 6명 가족의 할머니·할아버지가 고정 얼굴 없이 그려졌다.
    const grandma = fixed({ id: "m-grandma0001", role: "grandma", callName: "할머니" });
    const grandpa = fixed({ id: "m-grandpa0001", role: "grandpa", callName: "할아버지" });
    const siwoo = fixed({ id: "m-sibling0001", role: "sibling", callName: "형", name: "시우" });
    const family = [grandpa, grandma, dad, mom, siwoo, child];
    const names = ["하온", "시우", "엄마", "아빠", "할머니", "할아버지"];
    assert.deepEqual(
      pick(names, family).map(([name]) => name),
      ["하온", "시우", "엄마", "아빠", "할머니", "할아버지"],
    );
    assert.deepEqual(
      pick(names, family, 2).map(([name]) => name),
      ["하온", "시우"],
    );
  });

  it("시트가 그리는 앞 6명만 본다", () => {
    const seoyeon = fixed({ id: "m-friend00001", role: "friend", callName: "친구", name: "서연" });
    assert.deepEqual(pick(["하온", "가", "나", "다", "라", "마", "서연"], [child, seoyeon]), [["하온", "child"]]);
  });

  it("가족이 없거나 등장인물이 없으면 빈 목록", () => {
    assert.deepEqual(castPortraits(chars("하온"), undefined), []);
    assert.deepEqual(castPortraits(chars("하온"), []), []);
    assert.deepEqual(castPortraits([], [child]), []);
    assert.deepEqual(castPortraits(undefined, [child]), []);
  });
});

/* ─────────── 이야기에 건네는 가족 생김새(2026-10-01 사장님 "아바타와 너무 달라" ④) ─────────── */

describe("storyFamilyLooks — 할머니·할아버지·형제·단짝 친구 생김새를 이야기에", () => {
  it("고른 생김새는 옷 빼고 그대로, 그림이 고정됐으면 fixed 표시", () => {
    const grandma: FamilyMember = {
      id: "m-grandma0001",
      role: "grandma",
      callName: "할머니",
      looks: { hair: "짧은 파마머리", hairColor: "희끗희끗", color: "보라", outfit: "카디건" },
      portrait: pic("m-grandma0001"),
    };
    const [g] = storyFamilyLooks([grandma]);
    assert.equal(g.who, "할머니");
    assert.equal(g.fixed, true);
    assert.match(g.line ?? "", /파마/);
    assert.match(g.line ?? "", /안경을 쓰지 않는다/);
    assert.doesNotMatch(g.line ?? "", /카디건|보라/); // 옷은 책마다 이야기가 정한다
  });

  it("사진으로 그린 고정 그림은 칩을 건네지 않고 '그림 그대로'만", () => {
    const grandpa: FamilyMember = {
      id: "m-grandpa0001",
      role: "grandpa",
      callName: "외할아버지",
      looks: { hair: "대머리" },
      portrait: { ...pic("m-grandpa0001"), fromPhoto: true },
    };
    assert.deepEqual(storyFamilyLooks([grandpa]), [{ who: "외할아버지", fixed: true }]);
  });

  it("형제는 '이름(호칭)', 단짝 친구는 '이름(단짝 친구)' — 이름 없는 형제·친구는 건네지 않는다", () => {
    const siwoo: FamilyMember = { id: "m-sib01", role: "sibling", callName: "형", name: "시우", portrait: pic("m-sib01") };
    const nameless: FamilyMember = { id: "m-sib02", role: "sibling", callName: "동생", portrait: pic("m-sib02") };
    const seoyeon: FamilyMember = { id: "m-fr01", role: "friend", callName: "친구", name: "서연", looks: { hair: "양갈래" } };
    const friendNoName: FamilyMember = { id: "m-fr02", role: "friend", callName: "친구", looks: { hair: "단발" } };
    const got = storyFamilyLooks([siwoo, nameless, seoyeon, friendNoName]);
    assert.deepEqual(got.map((l) => l.who), ["시우(형)", "서연(단짝 친구)"]);
    assert.equal(got[1].fixed, undefined);
  });

  it("아이·엄마·아빠는 따로 가니 빼고, 생김새도 그림도 없는 사람도 뺀다", () => {
    const bare: FamilyMember = { id: "m-grandma0002", role: "grandma", callName: "친할머니" };
    assert.deepEqual(storyFamilyLooks([child, mom, dad, bare]), []);
    assert.deepEqual(storyFamilyLooks(undefined), []);
  });
});

describe("storyFamilyLookLines — 이야기 프롬프트 줄", () => {
  it("고른 생김새는 엄마·아빠와 같은 말로, 이/가는 받침대로", () => {
    const lines = storyFamilyLookLines([
      { who: "할머니", line: "짧은 파마머리", fixed: true },
      { who: "하준(형)", line: "스포츠머리" },
    ]);
    assert.equal(lines[0], "할머니가 이야기에 나오면 생김새는 이대로 쓴다(부모가 직접 고름, 여기 없는 것은 지어내지 않는다): 짧은 파마머리");
    assert.match(lines[1], /^하준\(형\)이 이야기에 나오면/);
  });

  it("그림만 고정된 사람은 '가족 그림 그대로'라고만 적게 한다", () => {
    const lines = storyFamilyLookLines([
      { who: "외할아버지", fixed: true },
      { who: "시우(형)", fixed: true },
    ]);
    assert.deepEqual(lines, [
      "가족 그림이 정해져 있는 사람: 외할아버지, 시우(형). 이 사람이 이야기에 나오면 @@CHARACTER@@ 생김새 칸에 머리·얼굴을 지어내지 말고 '가족 그림 그대로'라고만 쓴다.",
    ]);
    assert.deepEqual(storyFamilyLookLines(undefined), []);
    assert.deepEqual(storyFamilyLookLines([]), []);
  });
});
