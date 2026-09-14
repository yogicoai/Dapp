import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isInsideCar, placeVehicleKind, repairStoryContinuity, vehicleState } from "./story-quality.ts";
import type { ParsedStory } from "./story-format.ts";

/*
 * 탈것 판정 — 승용차·택시(벨트 규칙) / 버스·기차·지하철(벨트·카시트 금지) / 아님.
 *
 * 실제 사고(fe 계정 my-mu0issap): 관광버스를 승용차로 읽어 버스 위층 가족이 벨트를 맸고,
 * "버스에서 내려"를 버스 안으로 읽어 궁궐 마당 쪽이 버스 실내 카시트 그림이 됐다.
 */

describe("vehicleState — 어느 탈것 안인가", () => {
  it("버스에서 내려 문을 지나면 버스 안이 아니다 — 내린 것이다", () => {
    const state = vehicleState("버스에서 내려 커다란 문을 지나자 한복 입은 사람들이 보였어요.");
    assert.equal(state.kind, null);
    assert.equal(state.gotOff, true);
  });

  for (const text of ["2층 관광버스 위층 앞자리에 셋이 나란히 앉았다", "시내버스 안, 노란 좌석", "기차를 타고 바다로", "지하철 안"]) {
    it(`대중교통: ${text}`, () => {
      assert.deepEqual(vehicleState(text), { kind: "transit", gotOff: false });
      assert.equal(isInsideCar(text), false, "승용차로 읽으면 벨트 규칙이 붙는다");
    });
  }

  for (const text of ["자동차 뒷좌석 카시트", "택시 안에서 창밖을 본다"]) {
    it(`승용차·택시: ${text}`, () => {
      assert.deepEqual(vehicleState(text), { kind: "car", gotOff: false });
      assert.equal(isInsideCar(text), true);
    });
  }

  it("경복궁 넓은 마당은 어느 탈것도 아니다", () => {
    assert.deepEqual(vehicleState("경복궁 넓은 마당"), { kind: null, gotOff: false });
  });

  it("버스 뒷자리는 버스다 — 자리 낱말만으로 승용차가 되지 않는다", () => {
    assert.equal(vehicleState("버스 뒷자리에 앉았어요").kind, "transit");
  });

  it("마지막에 나온 탈것을 따른다", () => {
    assert.equal(vehicleState("택시에서 내려 기차를 탔어요").kind, "transit");
    assert.equal(vehicleState("버스를 타고 가다가 버스에서 내렸어요").gotOff, true);
  });

  it("정류장에서 기다리는 버스는 아직 탄 게 아니다", () => {
    assert.equal(vehicleState("버스 정류장에서 기다렸어요").kind, null);
    assert.equal(vehicleState("버스를 기다렸어요").kind, null);
  });
});

describe("repairStoryContinuity — 내린 장면을 버스 실내로 바꾸지 않는다", () => {
  const direction = { narration: "normal", dialogue: "happy", intensity: 0.8, pace: "normal" } as const;
  const story: ParsedStory = {
    title: "하온이의 서울 나들이",
    summary: "하온이가 가족과 서울을 구경해요.",
    characters: [{ name: "하온", description: "짧은 검은 바가지 머리, 노란 반팔, 하늘색 반바지 남자아이" }],
    pages: [
      {
        pageNo: 1,
        text: "하온이는 엄마 아빠와 2층 관광버스 위층 앞자리에 나란히 앉았어요. 바람이 시원했어요.",
        imagePrompt: "등장인물 3명: 하온, 엄마, 아빠. 장소: 2층 관광버스 위층 — 지붕 없는 위층과 노란 좌석. 셋이 앞자리에 앉아 웃는다.",
        voiceDirection: direction,
      },
      {
        pageNo: 2,
        text: "버스에서 내려 커다란 문을 지나자 넓은 마당이 나왔어요. 하온이는 눈이 동그래졌어요.",
        imagePrompt: "등장인물 3명: 하온, 엄마, 아빠. 장소: 경복궁 앞마당 — 넓은 흙마당과 커다란 나무 문. 셋이 문을 지나 마당으로 걸어 들어온다.",
        voiceDirection: direction,
      },
    ],
  };

  it("3쪽 장소 줄이 경복궁 마당으로 남는다", () => {
    const repaired = repairStoryContinuity(story);
    const second = repaired.pages[1].imagePrompt;
    assert.ok(second.includes("장소: 경복궁 앞마당"), second);
    assert.ok(!/버스|대중교통|손잡이/.test(second.split("셋이")[0]), second);
  });

  it("버스 위층 쪽은 시내버스 실내 설명으로 갈아 끼우지 않는다", () => {
    const repaired = repairStoryContinuity(story);
    const first = repaired.pages[0].imagePrompt;
    assert.ok(!first.includes("손잡이"), first);
  });
});

/*
 * 2차 검토에서 잡힌 말투들 — 부사가 끼거나, '내려다보다'처럼 내리지 않은 말, 맨 낱말.
 */
describe("vehicleState — 내렸나 · 타고 있나를 말투가 달라도 알아본다", () => {
  for (const text of [
    "버스에서 천천히 내려 커다란 문을 지나자",
    "버스에서 폴짝 내렸어요",
    "버스에서 모두 내린 뒤 문으로 걸어갔어요",
    "버스에서 폴짝 뛰어내렸어요",
    "버스가 멈추자 가족은 내렸어요",
    "버스 밖으로 나왔어요",
  ]) {
    it(`내림: ${text}`, () => {
      assert.deepEqual(vehicleState(text), { kind: null, gotOff: true });
    });
  }

  for (const [text, kind] of [
    ["2층 버스에서 내려다보니 남산 타워가 보였어요.", "transit"],
    ["케이블카에서 내려다보니 바다가 반짝였어요", "transit"],
    ["차 안에서 내리는 비를 보았어요", "car"],
    ["버스에서 내릴 준비를 했어요", "transit"],
    ["기차 안에서 창밖을 보니 눈이 내렸어요", "transit"],
  ] as const) {
    it(`내린 게 아님: ${text}`, () => {
      assert.deepEqual(vehicleState(text), { kind, gotOff: false });
    });
  }

  for (const text of [
    "하온이는 장난감 자동차를 가지고 놀았어요.",
    "따뜻한 녹차에서 김이 났어요",
    "풍차에서 바람 소리가 났어요",
    "빨간 택시가 지나가는 거리에서 손을 흔들어요",
    "창밖으로 버스가 지나가요",
    "자동차 박물관",
    "택시 승강장",
    "장난감 기차 가게",
  ]) {
    it(`맨 낱말은 타고 있는 게 아니다: ${text}`, () => {
      assert.equal(vehicleState(text).kind, null);
      assert.equal(isInsideCar(text), false);
    });
  }
});

describe("placeVehicleKind — 장소 이름은 끝말로 본다", () => {
  for (const [name, kind] of [
    ["아빠 차", "car"],
    ["승용차", "car"],
    ["지하철 안", "transit"],
    ["2층 서울시티투어버스 위층", "transit"],
    ["버스에서", "transit"],
    ["자동차 박물관", null],
    ["택시 승강장", null],
    ["경복궁 앞마당", null],
  ] as const) {
    it(`${name} → ${kind}`, () => {
      assert.equal(placeVehicleKind(name), kind);
    });
  }
});

describe("repairStoryContinuity — 부사가 끼어도 내린 쪽을 버스 실내로 바꾸지 않는다", () => {
  const direction = { narration: "normal", dialogue: "happy", intensity: 0.8, pace: "normal" } as const;
  const make = (secondText: string): ParsedStory => ({
    title: "하온이의 서울 나들이",
    summary: "하온이가 가족과 서울을 구경해요.",
    characters: [{ name: "하온", description: "남자아이" }],
    pages: [
      {
        pageNo: 1,
        text: "하온이는 엄마 아빠와 2층 관광버스 위층 앞자리에 나란히 앉았어요. 바람이 시원했어요.",
        imagePrompt: "등장인물 3명: 하온, 엄마, 아빠. 장소: 2층 관광버스 위층 — 지붕 없는 위층과 노란 좌석. 셋이 앞자리에 앉아 웃는다.",
        voiceDirection: direction,
      },
      {
        pageNo: 2,
        text: secondText,
        imagePrompt: "등장인물 3명: 하온, 엄마, 아빠. 장소: 경복궁 앞마당 — 넓은 흙마당과 커다란 나무 문. 셋이 마당으로 걸어 들어온다.",
        voiceDirection: direction,
      },
    ],
  });
  for (const text of [
    "버스에서 천천히 내려 커다란 문을 지나자 넓은 마당이 나왔어요.",
    "버스에서 폴짝 내렸어요. 커다란 문을 지나 마당으로 갔어요.",
    "버스에서 모두 내린 뒤 커다란 문을 지나 마당에 갔어요.",
  ]) {
    it(text, () => {
      const second = repairStoryContinuity(make(text)).pages[1].imagePrompt;
      assert.ok(second.includes("장소: 경복궁 앞마당"), second);
      assert.ok(!/대중교통|손잡이/.test(second), second);
    });
  }

  it("창문 있는 보통 관광버스 안은 '지붕 없는 2층 위층'이 되지 않는다", () => {
    const story = make("하온이는 관광버스 안에서 창밖을 봤어요. 할머니 댁이 가까워졌어요.");
    story.pages[1].imagePrompt = "등장인물 1명: 하온. 장소: 관광버스 안 — 창문과 파란 좌석. 하온이가 창밖을 본다.";
    const second = repairStoryContinuity(story).pages[1].imagePrompt;
    assert.ok(!second.includes("지붕 없이"), second);
  });
});
