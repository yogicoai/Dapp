import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  knownPlaceFamily,
  locationKeyOf,
  mentionsToyVehicle,
  mentionsVehicle,
  placeRuleNotes,
  placeVehicleKind,
  repairStoryContinuity,
  ridingAtEnd,
  schoolShuttleRide,
  validateStoryQuality,
  vehicleState,
} from "./story-quality.ts";
import { checkRuleLines, pageVehicle, safetyRuleLines } from "./illustration-rules.ts";
import type { ParsedStory } from "./story-format.ts";

/*
 * 놀잇감 탈것은 장소가 아니다.
 *
 * 실제 사고(2026-09-29 사장님): 어린이집 가게 놀이 책 3쪽 — "하온이랑 도준이가 음식 모형을 꺼냈어요. /
 * 자동차 안에 가득가득 채워 넣었어요. / 그때 선생님이 다가왔어요 …". 그림은 진짜 차 뒷좌석에 벨트를 맨
 * 아이들과 앞자리에서 몸을 돌린 선생님이었다. 오프라인으로 돌려 보니 클로드가 교실을 적든, 장소 줄을 빼든
 * 코드가 '자동차 안'(점수 1)을 있는 곳으로 뽑아 "뒷좌석 안전벨트 … 승용차 안"으로 갈아 끼웠다.
 * 앞 쪽과 같은 교실을 지키는 문도 "안에 가득"의 '에 가'를 옮긴 말로 읽어 열려 있었다.
 */

const direction = { narration: "normal", dialogue: "happy", intensity: 0.5, pace: "normal" } as const;

function book(pages: [string, string][]): ParsedStory {
  return {
    title: "음식 차 놀이",
    summary: "",
    characters: [{ name: "하온", description: "짧은 머리 남자아이" }, { name: "도준", description: "남자아이" }],
    pages: pages.map(([text, imagePrompt], index) => ({ pageNo: index + 1, text, imagePrompt, voiceDirection: direction })),
  };
}
const placeOf = (prompt: string) => /장소\s*:[^.\n]*/.exec(prompt)?.[0] ?? "";

const CLASS = "장소: 어린이집 교실 — 밝은 나무 바닥, 낮은 장난감 선반, 크림색 벽과 큰 창, 오전 햇빛.";
const P1 = "하온이는 어린이집 교실에서 도준이랑 놀았어요.";
const P3 = [
  "하온이랑 도준이가 음식 모형을 꺼냈어요.",
  "자동차 안에 가득가득 채워 넣었어요.",
  "그때 선생님이 다가왔어요.",
  "\"이건 뭐예요?\"",
  "선생님이 궁금한 표정으로 물었어요.",
  "하온이가 활짝 웃으며 대답했어요.",
  "\"음식을 파는 차예요!\"",
].join("\n");
const cast = "등장인물 3명: 하온, 도준, 선생님.";

describe("장난감 자동차에 음식 모형을 채운 쪽 — 교실 그대로", () => {
  for (const [label, prompt] of [
    ["클로드가 교실", `${cast} ${CLASS} 하온이와 도준이가 장난감 자동차 안에 음식 모형을 채운다.`],
    ["장소 줄 없음", `${cast} 하온이와 도준이가 자동차 안에 음식 모형을 채운다.`],
    ["클로드가 '자동차 안'(앞 쪽은 교실)", `${cast} 장소: 자동차 안 — 회색 바닥 매트, 뒷좌석, 창문, 오전 햇빛. 둘이 음식 모형을 채운다.`],
  ] as const) {
    it(label, () => {
      const repaired = repairStoryContinuity(book([[P1, `등장인물 1명: 하온. ${CLASS} 하온이가 논다.`], [P3, prompt]]));
      const line = placeOf(repaired.pages[1].imagePrompt);
      assert.match(line, /어린이집 교실/, line);
      assert.doesNotMatch(line, /뒷좌석|승용차/, line);
    });
  }

  it("첫 쪽이어도 클로드의 교실을 차 안으로 바꾸지 않는다", () => {
    const repaired = repairStoryContinuity(book([[P3, `${cast} ${CLASS} 둘이 음식 모형을 채운다.`]]));
    assert.match(placeOf(repaired.pages[0].imagePrompt), /어린이집 교실/);
  });

  it("탈것 안이 아니고, 탈것 이야기(벨트 줄)도 아니다 — 놀잇감 줄만 붙는다", () => {
    assert.equal(ridingAtEnd(P3), null);
    assert.equal(vehicleState(P3).kind, null);
    assert.equal(mentionsVehicle(P3), false);
    assert.equal(mentionsToyVehicle(P3), true);
    const page = pageVehicle({ locationName: "어린이집 교실", locationDescription: "밝은 나무 바닥", sceneBody: "둘이 음식 모형을 채운다.", storyText: P3 });
    assert.equal(page.vehicle, null);
    assert.equal(page.vehicleNearby, false);
    assert.equal(page.toyVehicle, true);
    const draw = safetyRuleLines(page, true).join("\n");
    assert.match(draw, /TOY VEHICLE/);
    assert.doesNotMatch(draw, /seat belt|CAR INTERIOR|car seat/i);
    const check = checkRuleLines({ page, storyText: P3 }).join("\n");
    assert.match(check, /toy: FAIL if the characters are drawn inside a real car/);
    assert.doesNotMatch(check, /seat belt/i);
  });

  it("장소 줄이 없어도 차 안 규칙이 붙지 않는다", () => {
    const page = pageVehicle({ storyText: P3 });
    assert.equal(page.vehicle, null);
    assert.doesNotMatch(safetyRuleLines(page, null).join("\n"), /CAR INTERIOR|seat belt/i);
  });

  it("장난감 말이 없는 가게 놀이도, 탄 말이 없으면 클로드의 교실을 믿는다(권고도 내지 않는다)", () => {
    const text = "하온이와 도준이는 자동차 안에서 음식을 팔았어요. 선생님이 손님이 되었어요.";
    const repaired = repairStoryContinuity(book([[text, `${cast} ${CLASS} 둘이 음식을 판다.`]]));
    assert.match(placeOf(repaired.pages[0].imagePrompt), /어린이집 교실/);
    assert.deepEqual(placeRuleNotes(repaired), []);
  });
});

describe("탈것을 그릇으로 쓴 말 · 놀잇감 탈것은 타고 있는 게 아니다", () => {
  for (const text of [
    "음식 모형을 자동차 안에 넣었어요.",
    "블록을 기차 안에 쏙 넣었어요.",
    "자동차에 음식 모형을 실었어요.",
    "레고로 만든 버스 안에 곰인형을 앉혔어요.",
    "기차 놀이를 했어요. 하온이가 맨 앞이에요.",
    "상자 자동차를 만들었어요. 하온이는 자동차 안에 앉았어요.",
  ]) {
    it(text, () => {
      assert.equal(ridingAtEnd(text), null);
      assert.equal(vehicleState(text).kind, null);
      assert.equal(pageVehicle({ storyText: text }).vehicle, null);
    });
  }

  it("장소 이름이 놀잇감이면 탈것이 아니다", () => {
    for (const name of ["장난감 자동차 안", "종이 상자 자동차", "레고로 만든 기차"]) assert.equal(placeVehicleKind(name), null, name);
    assert.equal(placeVehicleKind("아빠 차"), "car");
    assert.equal(placeVehicleKind("미니버스 안"), "transit");
  });
});

/*
 * 올라타는 놀잇감 — 정한 것(2026-09-29):
 *   · 놀잇감 말이 **바로 앞에 붙은** 탈것은 올라타도 놀잇감이다("장난감 자동차에 올라탔어요" → 방·교실 그대로).
 *   · 앞에서 놀잇감을 말했어도 **맨 낱말에 올라탄** 것은 진짜 탈것으로 본다("장난감 자동차를 꼭 안고 자동차에
 *     올라탔어요"). 잘못 읽으면 진짜 차에 탄 아이가 벨트 없이 방바닥에 그려진다. 대본 규칙이 놀잇감을 나올 때마다
 *     '상자 자동차'처럼 쓰게 하니, 맨 낱말에 올라타는 놀잇감은 드물다.
 */
describe("올라타는 놀잇감 — 정한 것", () => {
  it("장난감 자동차에 올라탔어요 → 탈것 아님, 놀잇감 줄", () => {
    const text = "하온이는 장난감 자동차에 올라탔어요.";
    assert.equal(ridingAtEnd(text), null);
    assert.equal(vehicleState(text).kind, null);
    const page = pageVehicle({ storyText: text });
    assert.equal(page.vehicle, null);
    assert.equal(page.toyVehicle, true);
  });

  it("맨 낱말에 올라탄 것은 진짜 탈것", () => {
    assert.equal(ridingAtEnd("장난감 자동차를 꼭 안고 자동차에 올라탔어요."), "car");
    assert.equal(ridingAtEnd("상자 자동차를 만들었어요. 하온이는 자동차에 올라탔어요."), "car");
  });
});

describe("진짜 탈것은 그대로", () => {
  for (const [text, kind] of [
    ["아빠 차에 탔어요. 차 안에서 노래를 불렀어요.", "car"],
    ["엄마가 차 안에서 안전벨트를 채워 주셨어요.", "car"],
    ["짐을 자동차 안에 싣고 가족은 차에 올라탔어요.", "car"],
    ["장난감을 챙겨서 아빠 차에 탔어요.", "car"],
    ["하온이는 장난감을 들고 뒷자리에 앉았어요.", "car"],
    ["기차 안에서 도시락을 먹었어요.", "transit"],
    ["블록 놀이를 마치고 어린이집 버스에 올라탔어요. 창밖으로 나무가 휙휙 지나갔어요.", "transit"],
  ] as const) {
    it(`${text} → ${kind}`, () => {
      assert.equal(ridingAtEnd(text), kind);
      assert.equal(pageVehicle({ storyText: text }).vehicle, kind);
    });
  }

  it("놀이 뒤 어린이집 버스는 통학 버스(벨트)", () => {
    const text = "블록 놀이를 마치고 어린이집 버스에 올라탔어요. 창밖으로 나무가 휙휙 지나갔어요.";
    assert.equal(schoolShuttleRide(text), "shuttle");
    assert.equal(pageVehicle({ storyText: text }).schoolBus, true);
  });

  it("교실 쪽이라도 정말 버스에 올라탔으면 버스 안으로 바꾼다", () => {
    const text = "하온이는 어린이집 앞에서 버스에 올라탔어요. 버스 안에서 창밖을 봤어요.";
    const repaired = repairStoryContinuity(book([[text, `등장인물 1명: 하온. ${CLASS} 하온이가 앉는다.`]]));
    assert.match(placeOf(repaired.pages[0].imagePrompt), /버스/);
  });
});

/*
 * 검토(2026-09-29 밤)에서 잡힌 것 — 놀잇감 규칙이 진짜 탈것·진짜 장소까지 먹지 않게.
 *   · 쪽 앞에 놀잇감 아무거나(장난감 공룡·장난감을 정리)가 나왔다고 뒤의 맨 '자동차'를 놀잇감으로 보지 않는다 —
 *     **같은 탈것의 놀잇감**(상자 자동차 → 자동차)일 때만.
 *   · 버스 안에 앉았다·안으로 들어갔다·창가 좌석에 앉았다도 탄 말이다(교실을 버스 안으로 고친다).
 *   · 장난감 가게·꼬마 도서관·새로 만든 놀이터는 진짜 곳이다.
 *   · '에 가득'을 뺀 좁은 이동 목록은 장소 고치기에만 — 대본 다시 쓰기(유료) 검사는 예전처럼 넓게.
 */
describe("놀잇감 규칙이 진짜 탈것·장소를 먹지 않는다", () => {
  const LIVING = "장소: 우리 집 거실 — 크림색 벽, 낮은 소파.";
  const P1_HOME: [string, string] = ["하온이는 거실에서 놀았어요.", `등장인물 1명: 하온. ${LIVING} 하온이가 논다.`];

  it("장난감 공룡을 챙기고 자동차 안에서 노래 — 클로드의 '아빠 차 안'을 지킨다", () => {
    const text = "하온이는 장난감 공룡을 챙겼어요. 온 가족이 자동차 안에서 바다 노래를 불렀어요.";
    const repaired = repairStoryContinuity(book([P1_HOME, [text, "등장인물 1명: 하온. 장소: 아빠 차 안 — 뒷좌석과 창문. 가족이 노래한다."]]));
    assert.match(placeOf(repaired.pages[1].imagePrompt), /아빠 차 안/);
    const page = pageVehicle({ locationName: "아빠 차 안", locationDescription: "뒷좌석과 창문", sceneBody: "가족이 노래한다.", storyText: text });
    assert.equal(page.vehicle, "car");
    assert.equal(page.toyVehicle, false);
    assert.doesNotMatch(checkRuleLines({ page, storyText: text }).join("\n"), /is a toy/);
  });

  it("장난감 트럭을 쥐고 자동차 안에서 잠듦 — 트럭은 자동차가 아니다, 차 안으로 고친다", () => {
    const text = "하온이는 장난감 트럭을 꼭 쥐었어요. 자동차 안에서 스르르 잠이 들었어요.";
    assert.equal(vehicleState(text).kind, "car");
    const repaired = repairStoryContinuity(book([P1_HOME, [text, "등장인물 1명: 하온. 장소: 시골 가는 길 — 논과 산. 하온이가 잔다."]]));
    assert.match(placeOf(repaired.pages[1].imagePrompt), /자동차 안/);
  });

  for (const [text, kind] of [
    ["하온이는 장난감을 정리하고 차 안에 앉았어요.", "car"],
    ["장난감 기차를 꼭 쥐었어요. 지하철 안은 사람들로 북적북적했어요.", "transit"],
  ] as const) {
    it(`${text} → ${kind}`, () => assert.equal(vehicleState(text).kind, kind));
  }

  it("같은 탈것의 놀잇감을 맨 이름으로 줄이면 놀잇감이다", () => {
    for (const text of [
      "장난감 자동차를 꺼냈어요. 자동차가 부릉부릉 달렸어요.",
      "블록으로 만든 기차에 인형을 태웠어요. 기차 안에 곰돌이가 앉았어요.",
    ]) {
      assert.equal(vehicleState(text).kind, null, text);
      assert.equal(mentionsToyVehicle(text), true, text);
    }
  });

  for (const [label, text, claude] of [
    ["버스 안에 앉았어요", "하온이는 친구들과 교실을 나와 버스 안에 앉았어요. 모두 신이 났어요.", "장소: 어린이집 교실 — 밝은 벽"],
    ["버스 안으로 들어갔어요", "친구들과 함께 버스 안으로 들어갔어요.", "장소: 어린이집 앞마당 — 흙바닥"],
  ] as const) {
    it(`${label} — 클로드가 떠나온 곳을 적었으면 버스 안으로 고친다`, () => {
      const repaired = repairStoryContinuity(
        book([["하온이는 어린이집 교실에서 놀았어요.", `등장인물 1명: 하온. ${CLASS} 논다.`], [text, `등장인물 1명: 하온. ${claude}. 앉는다.`]]),
      );
      assert.match(placeOf(repaired.pages[1].imagePrompt), /버스 안/);
    });
  }

  it("창가 좌석에 앉았는데 장소가 교실 — 첫 쪽이면 버스 안으로, 앞 쪽과 같은 교실이면(옮긴 말 없음) 권고를 남긴다", () => {
    const text = "하온이는 창가 좌석에 앉았어요. 버스 안은 조용했어요.";
    const alone = repairStoryContinuity(book([[text, `등장인물 1명: 하온. ${CLASS} 앉는다.`]]));
    assert.match(placeOf(alone.pages[0].imagePrompt), /버스 안/);
    const kept = repairStoryContinuity(
      book([["하온이는 어린이집 교실에서 놀았어요.", `등장인물 1명: 하온. ${CLASS} 논다.`], [text, `등장인물 1명: 하온. ${CLASS} 앉는다.`]]),
    );
    assert.equal(placeRuleNotes(kept).length, 1);
  });

  it("장난감 가게·꼬마 도서관·새로 만든 놀이터는 진짜 곳 — 같은 가게는 한 열쇠", () => {
    assert.equal(knownPlaceFamily("장난감 가게"), "shop");
    assert.equal(locationKeyOf("장난감 가게"), locationKeyOf("장난감 가게 안"));
    assert.equal(knownPlaceFamily("꼬마 도서관"), "library");
    assert.equal(knownPlaceFamily("새로 만든 놀이터"), "playground");
    assert.equal(knownPlaceFamily("상자 텃밭"), "yard");
    const repaired = repairStoryContinuity(
      book([
        ["엄마랑 장난감 가게에 갔어요.", "등장인물 1명: 하온. 장소: 장난감 가게 — 진열대. 간다."],
        ["장난감 가게 안에서 곰 인형을 골랐어요.", "등장인물 1명: 하온. 장소: 장난감 가게 안 — 진열대. 고른다."],
      ]),
    );
    assert.equal(placeOf(repaired.pages[1].imagePrompt), placeOf(repaired.pages[0].imagePrompt));
  });

  it("인형의 집·장난감 집은 집(거실)이 아니다 — 교실 그대로", () => {
    const text = "하온이는 인형의 집 안에 곰 인형을 눕혔어요.";
    const repaired = repairStoryContinuity(book([[text, `등장인물 1명: 하온. ${CLASS} 하온이가 논다.`]]));
    assert.match(placeOf(repaired.pages[0].imagePrompt), /어린이집 교실/);
  });

  it("'에 가득'만 있는 장소 바뀜은 대본 다시 쓰기 항목을 새로 만들지 않는다(예전 그대로)", () => {
    const story = {
      ...book([
        ["하온이는 거실에서 그림책을 읽었어요. 창밖에 낙엽이 떨어졌어요.", `등장인물 1명: 하온. ${LIVING} 읽는다.`],
        ["하온이는 놀이터에 가득 쌓인 낙엽을 밟았어요. 바스락바스락 소리가 났어요.", "등장인물 1명: 하온. 장소: 동네 놀이터 — 미끄럼틀. 밟는다."],
      ]),
    };
    const issues = validateStoryQuality(story, { childName: "하온", age: 5, expectedPages: 2 });
    assert.deepEqual(issues.filter((i) => /이동 과정/.test(i)), []);
  });
});
