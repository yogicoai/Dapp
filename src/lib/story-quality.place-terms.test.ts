import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { placeTermsOf, validateStoryQuality } from "./story-quality.ts";
import type { ParsedStory } from "./story-format.ts";

/*
 * 장소 칸 → 본문에 나와야 할 낱말(2026-10-23).
 * "어린이집과 공원"을 통째로 찾아서 본문이 "어린이집"·"공원"을 따로 쓰면 늘 빠졌다고 나왔고,
 * 그때마다 대본을 한 편 통째로 다시 썼다(같은 주문 세 번 모두 — 값·시간 두 배).
 */

describe("placeTermsOf", () => {
  it("'와·과·랑·이랑·하고'로 이은 곳을 나눈다", () => {
    assert.deepEqual(placeTermsOf("어린이집과 공원"), ["어린이집", "공원"]);
    assert.deepEqual(placeTermsOf("놀이터와 도서관"), ["놀이터", "도서관"]);
    assert.deepEqual(placeTermsOf("키즈카페랑 마트"), ["키즈카페", "마트"]);
    assert.deepEqual(placeTermsOf("수영장하고 공원"), ["수영장", "공원"]);
  });

  it("쉼표·가운뎃점·'및'으로 나눈다", () => {
    assert.deepEqual(placeTermsOf("키즈카페, 놀이터"), ["키즈카페", "놀이터"]);
    assert.deepEqual(placeTermsOf("바닷가·캠핑장"), ["바닷가", "캠핑장"]);
    assert.deepEqual(placeTermsOf("어린이집 및 공원"), ["어린이집", "공원"]);
  });

  it("여러 낱말인 곳은 마지막 낱말(가리키는 곳)만 본다 — 한 글자면 통째로", () => {
    assert.deepEqual(placeTermsOf("집 근처 놀이터"), ["놀이터"]);
    assert.deepEqual(placeTermsOf("할머니 댁"), ["할머니 댁"]);
  });

  it("끝의 '에서·에·으로·로'는 뗀다", () => {
    assert.deepEqual(placeTermsOf("공원에서"), ["공원"]);
    assert.deepEqual(placeTermsOf("동물원으로"), ["동물원"]);
  });

  it("낱말 속 '과·와'는 자르지 않는다", () => {
    assert.deepEqual(placeTermsOf("과자 가게"), ["가게"]);
    assert.deepEqual(placeTermsOf("학교 과학실"), ["과학실"]);
    assert.deepEqual(placeTermsOf("와플 가게"), ["가게"]);
  });

  it("한 글자 곳은 빼고, 같은 낱말은 한 번만", () => {
    assert.deepEqual(placeTermsOf("집이랑 마트"), ["마트"]);
    assert.deepEqual(placeTermsOf("공원, 공원"), ["공원"]);
    assert.deepEqual(placeTermsOf(""), []);
  });
});

describe("validateStoryQuality — 장소 칸", () => {
  const direction = { narration: "normal", dialogue: "normal", intensity: 0.5, pace: "normal" } as const;
  const story: ParsedStory = {
    title: "하온이의 비눗방울",
    summary: "",
    characters: [{ name: "하온", description: "다섯 살 아이" }],
    pages: [
      {
        pageNo: 1,
        text: "어린이집 교실에서 하온이가 피노키오 책을 펼쳤어요. 고래 뱃속 물방울이 반짝였어요.",
        imagePrompt: "등장인물 1명: 하온. 장소: 어린이집 교실 — 밝은 나무 마루. 하온이는 책을 펼친다.",
        voiceDirection: direction,
      },
      {
        pageNo: 2,
        text: "하온이는 친구들이랑 공원에 나가 비눗방울을 후 불었어요. 방울이 동동 떠올랐어요.",
        imagePrompt: "등장인물 1명: 하온. 장소: 공원 — 초록 잔디. 하온이는 비눗방울을 분다.",
        voiceDirection: direction,
      },
    ],
  };
  const placeIssues = (requiredTerms: string[]) =>
    validateStoryQuality(story, { childName: "하온", age: 5, expectedPages: 2, requiredTerms }).filter((issue) =>
      issue.startsWith("처음 입력한 핵심 정보"),
    );

  it("곳마다 나오면 빠졌다고 하지 않는다(통째로 찾던 예전엔 빠졌다고 했다)", () => {
    assert.deepEqual(placeIssues(placeTermsOf("어린이집과 공원")), []);
    assert.equal(placeIssues(["어린이집과 공원"]).length, 1);
  });

  it("정말 빠진 곳은 여전히 잡는다", () => {
    assert.deepEqual(placeIssues(placeTermsOf("어린이집과 수영장")), ["처음 입력한 핵심 정보 '수영장'이 이야기에서 빠졌습니다."]);
  });
});
