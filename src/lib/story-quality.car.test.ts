import test from "node:test";
import assert from "node:assert/strict";
import { isInsideCar } from "./story-quality.ts";

/*
 * 차 안 판정 — 이 장면에만 좌석 규칙이 붙는다.
 * 너무 넓게 잡으면 엉뚱한 쪽에 규칙이 붙어 구도가 아이 쪽으로 당겨지고,
 * 너무 좁게 잡으면 정작 차 안 그림이 또 무너진다.
 */

test("차 안이라고 봐야 하는 것", async (t) => {
  const yes = [
    ["차 안", "달리는 승용차의 뒷좌석"],
    ["자동차 안", ""],
    ["승용차", "가족이 함께 탄 차"],
    ["뒷자리", "아이가 앉아 있다"],
    ["", "하온이는 엄마 아빠와 함께 차를 타고 무주로 떠났어요."],
    ["", "카시트에 앉아 창밖을 바라보았어요."],
    ["택시 안", ""],
    ["", "조수석에 앉은 엄마가 뒤를 돌아보았어요."],
  ];
  for (const [name, desc] of yes) {
    await t.test(`${name || desc.slice(0, 20)}`, () => {
      assert.equal(isInsideCar(name, desc), true);
    });
  }
});

test("차 안이 아닌 것", async (t) => {
  const no = [
    ["주차장", "마트 앞 주차장에 차가 서 있다"],
    ["정비소", "차를 고치는 곳"],
    ["세차장", ""],
    ["주유소", "차에 기름을 넣는다"],
    ["놀이터", "미끄럼틀과 그네"],
    ["거실", "소파와 텔레비전"],
    ["", "기차를 타고 할머니 댁에 갔어요."],
    ["", ""],
  ];
  for (const [name, desc] of no) {
    await t.test(`${name || desc.slice(0, 20) || "빈 값"}`, () => {
      assert.equal(isInsideCar(name, desc), false);
    });
  }
});

test("차가 나오지만 실내가 아닌 곳이 이긴다", () => {
  // '주차장에 세운 차 안'처럼 둘 다 나오면 주차장 쪽을 따른다 —
  // 서 있는 차는 좌석이 뒤엉킬 만큼 좁게 잡을 이유가 없고, 규칙이 구도를 당겨 버린다.
  assert.equal(isInsideCar("주차장", "차 안에서 기다렸어요"), false);
});
