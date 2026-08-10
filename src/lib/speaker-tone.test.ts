import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { attributeSpeakers, segmentTones, speakerTone } from "./speaker-tone.ts";

/*
 * splitDialogue와 같은 방식으로 쪼갠 모양을 손으로 만든다.
 * (splitDialogue 자체는 voices.ts에 있는데 그 파일은 브라우저 것들을 들고 있어
 *  node --test로 못 불러온다. 여기서는 톤 판단만 시험한다.)
 */
function seg(...parts: [string, boolean][]) {
  return parts.map(([text, dialogue]) => ({ text, dialogue }));
}

const cast = [
  { name: "하온", description: "일곱 살 여자아이, 갈색 단발" },
  { name: "할머니", description: "하온이의 할머니, 흰 머리에 분홍 앞치마" },
];

describe("attributeSpeakers", () => {
  it("대사 앞 지문에서 화자를 찾는다", () => {
    const segments = seg(["할머니가 활짝 웃었어요. ", false], ['"하온이 왔구나."', true]);
    assert.deepEqual(attributeSpeakers(segments, cast), [null, "할머니"]);
  });

  it("앞 지문에 화자가 없으면 뒤 지문에서 찾는다", () => {
    const segments = seg(['"하온이 왔구나."', true], [" 할머니가 두 팔을 벌렸어요.", false]);
    assert.deepEqual(attributeSpeakers(segments, cast), ["할머니", null]);
  });

  it("목적어를 화자로 잡지 않는다 — '할머니가 하온이를 보았어요'", () => {
    // 이름만 찾으면 뒤에 있는 '하온이'가 말한 것으로 잡힌다. 실제로 흔한 문장이다.
    const segments = seg(["할머니가 하온이를 보았어요. ", false], ['"많이 컸구나."', true]);
    assert.deepEqual(attributeSpeakers(segments, cast), [null, "할머니"]);
  });

  it("앞 지문이 있으면 대사 속 이름에 끌려가지 않는다", () => {
    const segments = seg(["할머니가 말했어요. ", false], ['"하온이가 왔구나."', true]);
    assert.deepEqual(attributeSpeakers(segments, cast), [null, "할머니"]);
  });

  it("주고받는 대화에서 화자가 각각 붙는다", () => {
    const segments = seg(
      ["할머니가 웃었어요. ", false],
      ['"어서 오렴."', true],
      [" 하온이도 웃었어요. ", false],
      ['"할머니 보고 싶었어요."', true],
    );
    assert.deepEqual(attributeSpeakers(segments, cast), [null, "할머니", null, "하온"]);
  });

  it("등장인물에 없는 배역도 본문에 나오면 알아본다", () => {
    // 톤을 정하는 데 필요한 건 '누구인지'가 아니라 '어떤 목소리인지'뿐이다.
    const segments = seg(["호랑이가 어슬렁 다가왔어요. ", false], ['"게 섰거라!"', true]);
    assert.deepEqual(attributeSpeakers(segments, [{ name: "하온" }]), [null, "호랑이"]);
  });

  it("아는 배역이 문장 앞쪽에 있어도, 정작 말한 사람이 딴 사람이면 붙이지 않는다", () => {
    // 딸린 전래동화에서 실제로 잘못 잡혔던 문장이다. 흥부는 등장인물 목록에 없어서
    // 후보가 아닌데, 아는 이름(제비)만 찾으면 제비가 말한 것이 되어 버린다.
    const segments = seg(
      ["제비가 물어다 준 박씨를 흥부는 뜰에 심었어요. ", false],
      ['"이게 웬 박씨일까?"', true],
    );
    assert.deepEqual(attributeSpeakers(segments, [{ name: "제비" }]), [null, null]);
  });

  it("화자를 못 찾으면 null — 아무 이름이나 붙이지 않는다", () => {
    const segments = seg(["바람이 살랑 불었어요. ", false], ['"참 좋다."', true]);
    assert.deepEqual(attributeSpeakers(segments, cast), [null, null]);
  });

  it("지문 조각에는 화자를 붙이지 않는다", () => {
    const segments = seg(["할머니가 웃었어요.", false]);
    assert.deepEqual(attributeSpeakers(segments, cast), [null]);
  });
});

describe("speakerTone", () => {
  it("할머니는 느리고 낮게 읽는다", () => {
    const tone = speakerTone("할머니", cast);
    assert.ok(tone.rate < 1, "할머니는 느려야 한다");
    assert.equal(tone.shiftPitch, true, "낮게 들리려면 음높이도 함께 움직여야 한다");
  });

  it("작은 동물은 빠르고 높게 읽는다", () => {
    const tone = speakerTone("토끼");
    assert.ok(tone.rate > 1);
    assert.equal(tone.shiftPitch, true);
  });

  it("아기곰은 곰이 아니라 아기로 읽는다", () => {
    // 규칙 순서가 뒤집히면 묵직한 곰 목소리가 된다.
    assert.ok(speakerTone("아기곰").rate > 1);
  });

  it("이름으로 알 수 없으면 등장인물 설명을 본다", () => {
    const tone = speakerTone("두리", [{ name: "두리", description: "마을을 지키는 늙은 호랑이" }]);
    assert.equal(tone.label, "큰 인물");
  });

  it("화자를 모르면 손대지 않는다", () => {
    const tone = speakerTone(null);
    assert.equal(tone.rate, 1);
    assert.equal(tone.shiftPitch, false);
  });

  it("주인공과 친구는 아이 톤 — 과하지 않게", () => {
    const tone = speakerTone("하온", cast);
    assert.equal(tone.label, "아이");
    assert.equal(tone.shiftPitch, false, "아이는 음높이를 건드리면 만화처럼 들린다");
  });

  it("톤 폭이 좁게 유지된다 — 넓히면 만화가 된다", () => {
    for (const name of ["할머니", "할아버지", "호랑이", "토끼", "아기", "엄마", "하온"]) {
      const { rate } = speakerTone(name, cast);
      assert.ok(rate >= 0.86 && rate <= 1.08, `${name} 톤이 범위를 벗어났다: ${rate}`);
    }
  });
});

describe("segmentTones", () => {
  it("지문은 그대로 두고 대사만 배역 톤으로 읽는다", () => {
    const segments = seg(["할머니가 웃었어요. ", false], ['"어서 오렴."', true]);
    const tones = segmentTones(segments, cast);
    assert.equal(tones[0].rate, 1, "지문은 손대지 않는다");
    assert.ok(tones[1].rate < 1, "할머니 대사는 느리게");
  });

  it("조각 수만큼 톤이 나온다", () => {
    const segments = seg(["가 ", false], ['"나"', true], [" 다", false]);
    assert.equal(segmentTones(segments, cast).length, 3);
  });
});
