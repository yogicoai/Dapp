import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  locationKeyOf,
  placeRuleNotes,
  repairStoryContinuity,
  ridingAtEnd,
  sheetMatchesKey,
  validateStoryQuality,
  vehicleState,
} from "./story-quality.ts";
import { pageVehicle } from "./illustration-rules.ts";
import type { ParsedStory } from "./story-format.ts";

/*
 * 쪽마다 장소 정하기 — 그림은 그 쪽이 **끝나는 자리**다.
 *
 * 실제 사고(2026-09-29 사장님): 1쪽 본문이 "어린이집 친구들이랑 포도밭에 가는 날 → 버스에 올라탔어요 →
 * 창밖으로 나무들이 휙휙"인데, 그림은 어린이집 교실 창가에 앉은 아이였다. 오프라인으로 돌려 보니
 * 클로드가 '버스 안'을 적어도 코드가 "어린이집 — 밝은 벽과 큰 창문, 낮은 책상과 장난감 수납장"으로
 * 갈아 끼웠다('어린이집 친구들'의 어린이집을 있는 곳으로 읽었다).
 */

const direction = { narration: "normal", dialogue: "happy", intensity: 0.5, pace: "normal" } as const;

const PAGE1 = [
  "오늘은 어린이집 친구들이랑 포도밭에 가는 날이에요.",
  "하온이는 노란 모자를 꾹 눌러쓰고 버스에 올라탔어요.",
  "창밖으로 나무들이 휙휙 지나갔어요.",
  "\"포도밭에 가면 뭐가 있을까?\"",
  "하온이가 창밖을 보며 혼잣말을 했어요.",
].join("\n");
const VINEYARD = "장소: 포도밭 — 갈색 흙길, 줄지어 선 초록 포도 덩굴, 나무 기둥과 철사, 작은 나무 바구니, 낮의 밝은 햇빛.";

function book(pages: [string, string][]): ParsedStory {
  return {
    title: "포도밭 가는 날",
    summary: "",
    characters: [{ name: "하온", description: "짧은 머리 남자아이" }],
    pages: pages.map(([text, imagePrompt], index) => ({ pageNo: index + 1, text, imagePrompt, voiceDirection: direction })),
  };
}

const placeOf = (prompt: string) => /장소\s*:[^.\n]*/.exec(prompt)?.[0] ?? "";

describe("클로드가 적은 탈것 장소를 떠나온 곳으로 바꾸지 않는다", () => {
  for (const [label, prompt] of [
    ["한 줄 지시 · 어린이집 버스 안", "등장인물 1명: 하온. 장소: 어린이집 버스 안 — 회색 통로 바닥, 노란 좌석 줄, 넓은 창, 작은 가방걸이, 아침 햇빛. 하온이는 창가 자리에 앉아 창밖을 본다."],
    ["한 줄 지시 · 버스 안 + 버스 창가 자리", "등장인물 1명: 하온. 장소: 버스 안 — 회색 통로 바닥, 파란 좌석 줄, 큰 창문, 손잡이, 아침 햇빛. 하온이는 버스 창가 자리에 앉아 창밖을 본다."],
    ["한 줄 지시 · 시내버스 안", "등장인물 1명: 하온. 장소: 시내버스 안 — 회색 통로 바닥, 파란 좌석 줄, 큰 창문, 손잡이, 아침 햇빛. 하온이는 창가 자리에 앉는다."],
  ] as const) {
    it(label, () => {
      const repaired = repairStoryContinuity(book([[PAGE1, prompt]]));
      const line = placeOf(repaired.pages[0].imagePrompt);
      assert.match(line, /버스 안/, line);
      assert.doesNotMatch(line, /낮은 책상|장난감 수납장/, line);
    });
  }

  it("그림 판단도 버스 안으로 본다 — '탈것 아님'이 붙지 않는다", () => {
    const prompt = "등장인물 1명: 하온. 장소: 어린이집 버스 안 — 회색 통로 바닥, 노란 좌석 줄, 넓은 창, 아침 햇빛. 하온이는 창가 자리에 앉는다.";
    const repaired = repairStoryContinuity(book([[PAGE1, prompt]]));
    const m = /장소\s*:\s*([^\n—.-]+?)\s*[—-]\s*([^\n.]+)/.exec(repaired.pages[0].imagePrompt)!;
    const page = pageVehicle({ locationName: m[1].trim(), locationDescription: m[2].trim(), sceneBody: "하온이는 창가 자리에 앉는다.", storyText: PAGE1 });
    assert.equal(page.vehicle, "transit");
    assert.equal(page.gotOff, false);
  });

  it("버스를 타고 어딘가에 도착했으면 클로드의 '버스 안'을 믿지 않고 본문을 따른다", () => {
    const repaired = repairStoryContinuity(
      book([
        ["하온이는 거실에서 가방을 챙겼어요.", "등장인물 1명: 하온. 장소: 하온이네 거실 — 밝은 나무 마루, 하늘색 소파, 크림색 벽, 오후 햇빛. 하온이는 가방을 챙긴다."],
        ["하온이는 버스를 타고 놀이터에 도착했어요. 미끄럼틀이 반짝였어요.", "등장인물 1명: 하온. 장소: 버스 안 — 파란 좌석 줄, 큰 창문. 하온이는 버스에서 창밖을 본다."],
      ]),
    );
    assert.match(placeOf(repaired.pages[1].imagePrompt), /놀이터/);
  });
});

describe("'어린이집 친구들'의 어린이집은 있는 곳이 아니다", () => {
  it("소풍 날 아침 거실 장면이 어린이집으로 바뀌지 않는다", () => {
    const repaired = repairStoryContinuity(
      book([
        [
          "오늘은 어린이집 친구들이랑 소풍 가는 날이에요. 하온이는 두근두근했어요.",
          "등장인물 1명: 하온. 장소: 하온이네 거실 — 밝은 나무 마루, 하늘색 소파, 크림색 벽과 큰 창, 아침 햇빛. 하온이는 가방을 멘다.",
        ],
      ]),
    );
    assert.match(placeOf(repaired.pages[0].imagePrompt), /거실/);
  });

  it("'어린이집에서'는 여전히 있는 곳이다", () => {
    const repaired = repairStoryContinuity(
      book([
        [
          "하온이는 어린이집에서 친구들이랑 블록을 쌓았어요.",
          "등장인물 1명: 하온. 장소: 숲속 — 키 큰 나무와 흙길. 하온이가 블록을 쌓는다.",
        ],
      ]),
    );
    assert.match(placeOf(repaired.pages[0].imagePrompt), /어린이집/);
  });
});

describe("버스에서 내린 다음 쪽은 앞 쪽 건물 안으로 붙지 않는다", () => {
  const PAGE2 = "버스가 멈추자 하온이는 폴짝 내렸어요.\n포도밭에는 보랏빛 포도가 주렁주렁 달려 있었어요.";

  it("1쪽이 버스 안이면 2쪽 포도밭은 그대로다", () => {
    const repaired = repairStoryContinuity(
      book([
        [PAGE1, "등장인물 1명: 하온. 장소: 어린이집 버스 안 — 회색 통로 바닥, 노란 좌석 줄, 넓은 창, 아침 햇빛. 하온이는 창가 자리에 앉는다."],
        [PAGE2, `등장인물 1명: 하온. ${VINEYARD} 하온이는 포도밭 입구에 서 있다.`],
      ]),
    );
    assert.equal(placeOf(repaired.pages[1].imagePrompt), placeOf(VINEYARD));
  });

  it("1쪽이 어린이집으로 남아도 '내렸어요'를 이동으로 본다 — '어린이집 포도밭 … 어린이집 안'이 되지 않는다", () => {
    const value = book([
      [PAGE1, "등장인물 1명: 하온. 장소: 어린이집 교실 — 밝은 나무 바닥, 큰 창문, 크림색 벽, 낮은 책상, 아침 햇빛. 하온이는 창가에 앉는다."],
      [PAGE2, `등장인물 1명: 하온. ${VINEYARD} 하온이는 포도밭 입구에 서 있다.`],
    ]);
    const repaired = repairStoryContinuity(value);
    assert.doesNotMatch(placeOf(repaired.pages[1].imagePrompt), /어린이집/);
    const issues = validateStoryQuality(repaired, { childName: "하온", age: 5, expectedPages: 2 });
    assert.ok(!issues.some((issue) => issue.includes("이동 과정이 없습니다")), issues.join(" / "));
  });

  it("거실 다음 쪽에서 버스에 올라탄 쪽은 거실로 되돌리지 않는다", () => {
    const repaired = repairStoryContinuity(
      book([
        ["하온이는 거실에서 가방을 챙겼어요.", "등장인물 1명: 하온. 장소: 하온이네 거실 — 밝은 나무 마루, 하늘색 소파, 크림색 벽, 오후 햇빛. 하온이는 가방을 챙긴다."],
        ["하온이는 엄마랑 버스에 올라탔어요. 하온이는 창가에 앉았어요.", "등장인물 2명: 하온, 엄마. 장소: 시내버스 안 — 회색 통로 바닥, 파란 좌석 줄, 큰 창문, 손잡이, 낮의 햇빛. 하온이는 엄마 옆 창가 자리에 앉는다."],
      ]),
    );
    assert.match(placeOf(repaired.pages[1].imagePrompt), /시내버스 안/);
  });

  it("탈것과 무관한 '내렸어요'·'탔어요'는 이동이 아니다 — 앞 장소를 지킨다", () => {
    for (const text of ["창밖에 눈이 소복소복 내렸어요.", "하온이는 흔들 목마를 신나게 탔어요."]) {
      const repaired = repairStoryContinuity(
        book([
          ["하온이는 거실에서 블록을 쌓았어요.", "등장인물 1명: 하온. 장소: 하온이네 거실 — 밝은 나무 마루, 하늘색 소파. 하온이가 쌓는다."],
          [text, "등장인물 1명: 하온. 장소: 낯선 바닷가 — 파도와 모래. 하온이가 본다."],
        ]),
      );
      assert.match(placeOf(repaired.pages[1].imagePrompt), /거실/, text);
    }
  });
});

describe("locationKeyOf — 탈것 이름은 탈것으로 묶는다", () => {
  it("'노란 어린이집 버스'는 교실과 다른 곳, '어린이집 버스 안'과 같은 곳", () => {
    assert.notEqual(locationKeyOf("노란 어린이집 버스"), locationKeyOf("어린이집 교실"));
    assert.equal(locationKeyOf("노란 어린이집 버스"), locationKeyOf("어린이집 버스 안"));
  });

  it("어린이집 버스와 시내버스는 다른 버스, 아빠 차는 자동차 안과 같은 차", () => {
    assert.notEqual(locationKeyOf("어린이집 버스 안"), locationKeyOf("시내버스 안"));
    assert.equal(locationKeyOf("아빠 차"), locationKeyOf("자동차 안"));
  });

  it("탈것이 들어 있어도 끝말이 탈것이 아니면 그대로", () => {
    assert.equal(locationKeyOf("버스 정류장"), locationKeyOf("동네 골목"));
    assert.notEqual(locationKeyOf("자동차 박물관"), locationKeyOf("자동차 안"));
  });
});

describe("ridingAtEnd — 이 쪽이 탈것 안에서 끝나는가", () => {
  for (const [text, kind] of [
    [PAGE1, "transit"],
    ["하온이는 기차를 탔어요. 창밖으로 바다가 보였어요.", "transit"],
    ["아빠 차에 탔어요. 하온이는 벨트를 딸깍 맸어요.", "car"],
    ["하온이는 버스 안으로 들어갔어요.", "transit"],
    ["버스를 탔어요. \"포도밭에 도착하면 뭐 할까?\"", "transit"],
    ["하온이는 버스를 타고 놀이터에 도착했어요.", null],
    ["버스에서 폴짝 내렸어요.", null],
    ["버스를 타고 가다가 포도밭으로 들어섰어요.", null],
    ["버스 정류장에서 버스를 기다렸어요.", null],
    ["하온이는 그네를 탔어요.", null],
    // 대사는 일어난 일이 아니다 — 아직 타고 있다.
    ["하온이는 아빠 차에 탔어요. \"아빠, 언제 도착해요?\"", "car"],
    ["하온이는 아빠 차에 탔어요. \"언제 도착하지?\"", "car"],
    // 가서 닿은 말(갔어요·왔어요) — 그곳에서 끝난다. 방향·자리로 간 것은 아니다.
    ["하온이는 아빠 차를 타고 공원에 갔어요. 공원에서 킥보드를 탔어요.", null],
    ["버스를 타고 바닷가에 왔어요.", null],
    ["버스를 탔어요. 버스는 앞으로 갔어요.", "transit"],
    ["하온이는 버스를 타고 가다가 창가 자리로 갔어요.", "transit"],
    // 탄 뒤 따로 내린 말 / 무엇을 내린 말 · 하늘에서 내린 말
    ["버스에 탔어요. 한참 뒤 하온이는 친구 손을 잡고 내렸어요.", null],
    ["아빠 차에 탔어요. 아빠가 창문을 살짝 내렸어요.", "car"],
    ["기차를 탔어요. 창밖에 눈이 펑펑 내렸어요.", "transit"],
    ["버스가 멈추자 하온이는 친구들과 함께 내렸어요.", null],
    // 밖에서 보는 탈것 · 장난감 · 놀이 기구
    ["창밖 길에서 노란 버스가 멈췄어요.", null],
    ["하온이는 장난감 자동차에 올라탔어요.", null],
    ["놀이공원에서 꼬마 기차를 탔어요.", null],
  ] as const) {
    it(`${text.split("\n")[0]} → ${kind}`, () => {
      assert.equal(ridingAtEnd(text), kind);
    });
  }
});

describe("placeRuleNotes — 장소 줄 권고(로그용)", () => {
  it("타고 가는 쪽인데 장소가 떠나온 곳이면 적는다", () => {
    const notes = placeRuleNotes(
      book([[PAGE1, "등장인물 1명: 하온. 장소: 어린이집 교실 — 밝은 나무 바닥, 큰 창문. 하온이는 창가에 앉는다."]]),
    );
    assert.equal(notes.length, 1);
    assert.match(notes[0], /1쪽.*타고 가는 중.*어린이집 교실/);
  });

  it("장소가 탈것 안이면 적지 않는다", () => {
    const notes = placeRuleNotes(
      book([[PAGE1, "등장인물 1명: 하온. 장소: 어린이집 버스 안 — 노란 좌석 줄, 넓은 창. 하온이는 창가에 앉는다."]]),
    );
    assert.deepEqual(notes, []);
  });

  it("도착했는데 장소가 앞 쪽과 같은 곳이거나 탈것이면 적는다", () => {
    const bus = "등장인물 1명: 하온. 장소: 어린이집 버스 안 — 노란 좌석 줄, 넓은 창. 하온이는 창가에 앉는다.";
    const notes = placeRuleNotes(
      book([
        [PAGE1, bus],
        ["드디어 포도밭에 도착했어요. 하온이는 두 팔을 벌렸어요.", bus],
      ]),
    );
    assert.equal(notes.length, 1);
    assert.match(notes[0], /2쪽.*포도밭.*어린이집 버스 안/);
  });

  it("도착한 곳을 장소로 적었으면 적지 않는다", () => {
    const notes = placeRuleNotes(
      book([
        [PAGE1, "등장인물 1명: 하온. 장소: 어린이집 버스 안 — 노란 좌석 줄, 넓은 창. 하온이는 창가에 앉는다."],
        ["드디어 포도밭에 도착했어요. 하온이는 두 팔을 벌렸어요.", `등장인물 1명: 하온. ${VINEYARD} 하온이가 두 팔을 벌린다.`],
        ["하온이는 교실에 도착했어요.", "등장인물 1명: 하온. 장소: 어린이집 교실 — 밝은 나무 바닥. 하온이가 들어선다."],
      ]),
    );
    assert.deepEqual(notes, []);
  });
});

describe("검토에서 잡힌 경우 — 맞게 적은 장소를 바꾸지 않는다", () => {
  const LIVING = "등장인물 1명: 하온. 장소: 하온이네 거실 — 밝은 나무 마루, 하늘색 소파. 하온이가 논다.";
  const BUS = "등장인물 1명: 하온. 장소: 어린이집 버스 안 — 회색 통로 바닥, 노란 좌석 줄, 넓은 창, 아침 햇빛. 하온이는 창가 자리에 앉는다.";

  it("차에 탄 쪽의 대사 '언제 도착해요?' — 클로드의 '아빠 차 안'을 할머니 댁으로 바꾸지 않는다", () => {
    const repaired = repairStoryContinuity(
      book([
        [
          "오늘은 할머니네 집에 가는 날이에요. 하온이는 아빠 차에 탔어요. \"아빠, 언제 도착해요?\"",
          "등장인물 1명: 하온. 장소: 아빠 차 안 — 뒷좌석과 창문. 하온이가 뒷좌석에 앉는다.",
        ],
      ]),
    );
    assert.match(placeOf(repaired.pages[0].imagePrompt), /아빠 차 안/);
  });

  it("차를 타고 공원에 갔으면 — 클로드가 '자동차 안'을 적어도 공원이다(본문이 먼저)", () => {
    const repaired = repairStoryContinuity(
      book([
        [
          "하온이는 아빠 차를 타고 공원에 갔어요. 공원에서 킥보드를 신나게 탔어요.",
          "등장인물 1명: 하온. 장소: 자동차 안 — 뒷좌석과 창문. 하온이가 앉는다.",
        ],
      ]),
    );
    assert.match(placeOf(repaired.pages[0].imagePrompt), /공원/);
  });

  it("탈것이 나오기만 하는 쪽(창밖에 선 버스 · 장난감 자동차)은 옮긴 게 아니다 — 앞 쪽 거실을 지킨다", () => {
    for (const text of ["창밖 길에서 노란 버스가 멈췄어요. 하온이는 손을 흔들었어요.", "하온이는 장난감 자동차 안에 곰인형을 태웠어요."]) {
      const repaired = repairStoryContinuity(book([["하온이는 거실에서 블록을 쌓았어요.", LIVING], [text, LIVING]]));
      assert.match(placeOf(repaired.pages[1].imagePrompt), /거실/, text);
    }
  });

  it("이미 버스에 앉아 있는 다음 쪽 장소가 엉뚱하게 바뀌면 버스 안으로 되돌린다", () => {
    const repaired = repairStoryContinuity(
      book([
        ["하온이는 친구 옆 자리에 앉아 있었어요.", BUS],
        ["버스 창가에서 하온이는 친구들과 노래를 불렀어요.", `등장인물 1명: 하온. ${VINEYARD} 하온이가 노래한다.`],
      ]),
    );
    assert.match(placeOf(repaired.pages[1].imagePrompt), /어린이집 버스 안/);
  });

  it("'버스가 멈추자 … 함께 내렸어요'는 내린 것이다 — 포도밭 쪽을 버스 안으로 보지 않는다", () => {
    const text = "버스가 멈추자 하온이는 친구들과 함께 내렸어요. 포도밭에는 포도가 주렁주렁했어요.";
    assert.equal(vehicleState(text).gotOff, true);
    assert.equal(vehicleState("버스가 멈추자 창밖에 눈이 펑펑 내렸어요.").gotOff, false);
    const page = pageVehicle({ locationName: "포도밭", sceneBody: "하온이가 포도밭 입구에 선다.", storyText: text });
    assert.equal(page.vehicle, null);
    assert.deepEqual(placeRuleNotes(book([[PAGE1, BUS], [text, `등장인물 1명: 하온. ${VINEYARD} 하온이가 선다.`]])), []);
  });
});

describe("placeRuleNotes — 틀린 권고를 내지 않는다", () => {
  it("안으로·꿈나라로·입으로 들어간 것, 놀이 기구·장난감 탈것", () => {
    const room = "등장인물 1명: 하온. 장소: 어린이집 교실 — 밝은 나무 바닥. 하온이가 논다.";
    const bed = "등장인물 1명: 하온. 장소: 하온이 방 — 하얀 침대. 하온이가 눕는다.";
    const vine = `등장인물 1명: 하온. ${VINEYARD} 하온이가 먹는다.`;
    const park = "등장인물 1명: 하온. 장소: 놀이공원 — 회전목마와 꼬마 기차 길. 하온이가 탄다.";
    const living = "등장인물 1명: 하온. 장소: 하온이네 거실 — 밝은 나무 마루. 하온이가 논다.";
    for (const pages of [
      [["하온이는 교실에서 놀았어요.", room], ["하온이는 다시 교실 안으로 들어갔어요.", room]],
      [["하온이는 침대에 누웠어요.", bed], ["하온이는 스르르 꿈나라로 들어갔어요.", bed]],
      [["하온이는 포도를 땄어요.", vine], ["포도알이 하온이 입으로 쏙 들어갔어요.", vine]],
      [["놀이공원에서 꼬마 기차를 탔어요.", park]],
      [["하온이는 거실에서 놀았어요.", living], ["하온이는 장난감 자동차에 올라탔어요.", living]],
    ] as [string, string][][]) {
      assert.deepEqual(placeRuleNotes(book(pages)), [], pages.map((page) => page[0]).join(" / "));
    }
  });
});

describe("열쇠 — 어린이집 안의 자리 이름은 그대로 어린이집이다", () => {
  it("형님반·동생반·선생님 방·가방 걸이·차고는 교실과 같은 열쇠(옛 책 열쇠와 같다)", () => {
    for (const name of ["어린이집 형님반", "유치원 동생반", "어린이집 선생님 방", "어린이집 가방 걸이", "어린이집 차고"]) {
      assert.equal(locationKeyOf(name), locationKeyOf("어린이집 교실"), name);
    }
  });

  it("옛 열쇠로 저장된 장소 그림도 이름으로 찾는다", () => {
    assert.equal(sheetMatchesKey({ key: "아빠차", name: "아빠 차" }, locationKeyOf("자동차 안")), true);
    assert.equal(sheetMatchesKey({ key: "school", name: "어린이집 교실" }, locationKeyOf("어린이집 버스 안")), false);
    assert.equal(sheetMatchesKey({ key: "school", name: "어린이집 교실" }, ""), false);
  });
});
