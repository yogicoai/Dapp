import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkRuleLines, pageVehicle, safetyRuleLines } from "./illustration-rules.ts";
import {
  isIndoorPlace,
  locationKeyOf,
  neighbourPlaceClauses,
  placeClauseOf,
  repairStaleVehiclePages,
  repairStaleVehicleScene,
  repairStoryContinuity,
  vehicleState,
} from "./story-quality.ts";
import { pickLocationDetail } from "./scene-edit.ts";

/*
 * 저장된 탈것 장소 줄 — 어제(2026-09-29) 만든 책 3쪽을 한 쪽 다시 그리기 했더니 또 차 뒷좌석(2026-09-30 사장님).
 * 판정은 고쳤지만 책에 저장된 "장소: 자동차 안 — 뒷좌석 안전벨트 …"를 다시 그리기가 그대로 보냈다.
 */
const CANNED_CAR = "장소: 자동차 안 — 뒷좌석 안전벨트와 창문, 앞자리 등받이가 보이는 승용차 안, 창밖으로 흐르는 도시 풍경";
const CLASS = "장소: 어린이집 교실 — 밝은 나무 바닥, 낮은 장난감 선반, 크림색 벽과 큰 창, 오전 햇빛";
const P3 = [
  "하온이랑 도준이가 음식 모형을 꺼냈어요.",
  "자동차 안에 가득가득 채워 넣었어요.",
  "그때 선생님이 다가왔어요.",
  "\"이건 뭐예요?\"",
  "선생님이 궁금한 표정으로 물었어요.",
  "하온이가 활짝 웃으며 대답했어요.",
  "\"음식을 파는 차예요!\"",
].join("\n");
const SCENE3 = `등장인물 3명: 하온, 도준, 선생님. ${CANNED_CAR}. 하온이와 도준이가 장난감 자동차 짐칸에 음식 모형을 가득 채우고, 선생님이 다가와 궁금한 표정으로 바라본다.`;
const P2 = `등장인물 2명: 하온, 도준. ${CLASS}. 둘이 교실 바닥에 장난감 자동차를 세운다.`;
const P4 = `등장인물 3명: 하온, 도준, 선생님. ${CLASS}. 선생님이 김밥 모형을 들고 웃는다.`;
const DETAIL = "어린이집 교실은 밝은 나무 바닥, 낮은 장난감 선반, 크림색 벽과 큰 창, 오전 햇빛 · 자동차 안은 뒷좌석 안전벨트와 창문, 앞자리 등받이가 보이는 승용차 안, 창밖으로 흐르는 도시 풍경";
const placeOf = (s: string) => /장소\s*:\s*([^\n—.-]+?)\s*[—-]\s*([^\n.]+)/.exec(s);
const body = (s: string) => s.replace(/등장인물\s*\d+\s*명(?:\s*:[^.\n]*)?\.?/g, "").replace(/(?:장소|물건)\s*:[^.\n]*\.?/g, "");

describe("저장된 '자동차 안' 줄 — 다시 그리기는 책의 진짜 장소로", () => {
  it("앞·뒤 쪽이 교실이면 그 줄 그대로 — 열쇠가 교실이라 교실 장소 시트·기준 쪽을 받는다", () => {
    const r = repairStaleVehicleScene({ scene: SCENE3, storyText: P3, neighbours: [P2, P4] });
    assert.equal(r.changed, true);
    assert.ok(r.scene.includes(`${CLASS}.`), r.scene);
    assert.doesNotMatch(r.scene, /뒷좌석|승용차|자동차 안 —/);
    assert.match(r.scene, /^등장인물 3명: 하온, 도준, 선생님\. /);
    assert.match(r.scene, /장난감 자동차 짐칸에 음식 모형을/);
    assert.equal(locationKeyOf(placeOf(r.scene)![1]), locationKeyOf("어린이집 교실"));
  });

  it("고친 장면으로 그리면 — 장소 잠금·검수 정답은 교실, 벨트·차 안 줄 없음, 놀잇감 줄만(부모 장소 칸에 옛 차 설명이 남아도)", () => {
    const fixed = repairStaleVehicleScene({ scene: SCENE3, storyText: P3, neighbours: [P2, P4] }).scene;
    const loc = placeOf(fixed)!;
    const page = pageVehicle({ locationName: loc[1].trim(), locationDescription: loc[2].trim(), sceneBody: body(fixed), storyText: P3, bookContext: DETAIL });
    assert.equal(page.vehicle, null);
    assert.equal(page.staleVehicleLocation, false);
    assert.equal(page.toyVehicle, true);
    assert.equal(page.vehicleNearby, false);
    const indoor = isIndoorPlace(loc[1].trim(), loc[2].trim());
    assert.equal(indoor, true);
    const draw = safetyRuleLines(page, indoor).join("\n");
    assert.match(draw, /TOY VEHICLE/);
    assert.doesNotMatch(draw, /seat belt|CAR INTERIOR|car seat/i);
    const check = checkRuleLines({ page, storyText: P3 }).join("\n");
    assert.match(check, /is a toy/);
    assert.doesNotMatch(check, /seat belt/i);
    assert.doesNotMatch(pickLocationDetail(DETAIL, loc[1].trim()), /뒷좌석|승용차/);
  });

  it("고친 장면은 다시 넣어도 그대로(저장한 뒤 다음 다시 그리기)", () => {
    const once = repairStaleVehicleScene({ scene: SCENE3, storyText: P3, neighbours: [P2, P4] }).scene;
    assert.deepEqual(repairStaleVehicleScene({ scene: once, storyText: P3, neighbours: [P2, P4] }), { scene: once, changed: false });
  });

  it("앞·뒤 쪽을 모르는 부르는 쪽(옛 화면·만들기) — 선생님이 나오면 어린이집 교실", () => {
    const r = repairStaleVehicleScene({ scene: SCENE3, storyText: P3 });
    assert.equal(r.changed, true);
    assert.match(placeOf(r.scene)![1], /어린이집 교실/);
  });

  it("본문이 곳을 말하면 그곳 — 앞 쪽이 같은 곳이면 앞 쪽 줄 그대로", () => {
    const text = "교실에서 하온이는 음식 모형을 자동차 안에 넣었어요.";
    const scene = `등장인물 1명: 하온. ${CANNED_CAR}. 하온이가 논다.`;
    assert.match(placeOf(repairStaleVehicleScene({ scene, storyText: text }).scene)![1], /교실/);
    const LIVING = "등장인물 1명: 하온. 장소: 우리 집 거실 — 크림색 벽, 낮은 소파. 논다.";
    // 앞 쪽은 거실이어도 본문이 교실이라고 하면 교실(글이 먼저다).
    assert.match(placeOf(repairStaleVehicleScene({ scene, storyText: text, neighbours: [LIVING] }).scene)![1], /교실/);
    // 본문이 곳을 말하지 않으면 앞 쪽 거실.
    const r = repairStaleVehicleScene({ scene, storyText: "하온이는 음식 모형을 자동차 안에 넣었어요.", neighbours: [LIVING] });
    assert.match(placeOf(r.scene)![1], /우리 집 거실/);
  });

  it("아무 단서도 없으면 장소 줄을 뺀다 — 잠금 없이, 놀잇감 줄만", () => {
    const text = "하온이는 음식 모형을 자동차 안에 넣었어요.";
    const r = repairStaleVehicleScene({ scene: `등장인물 1명: 하온. ${CANNED_CAR}. 하온이가 논다.`, storyText: text });
    assert.equal(r.changed, true);
    assert.equal(placeOf(r.scene), null);
    assert.equal(r.scene, "등장인물 1명: 하온. 하온이가 논다.");
    const page = pageVehicle({ sceneBody: body(r.scene), storyText: text, bookContext: DETAIL });
    assert.equal(page.toyVehicle, true);
    assert.doesNotMatch(safetyRuleLines(page, null).join("\n"), /seat belt|CAR INTERIOR/i);
  });

  it("라우트가 직접 고치는 경우(옛 화면) — pageVehicle 이 저장된 줄을 놀잇감 탈것으로 버린다", () => {
    const loc = placeOf(SCENE3)!;
    const page = pageVehicle({ locationName: loc[1].trim(), locationDescription: loc[2].trim(), sceneBody: body(SCENE3), storyText: P3, bookContext: DETAIL });
    assert.equal(page.staleVehicleLocation, true);
    assert.equal(page.toyVehicle, true);
    assert.equal(page.vehicle, null);
    assert.equal(page.vehicleNearby, false);
    assert.doesNotMatch(safetyRuleLines(page, null).join("\n"), /seat belt|CAR INTERIOR/i);
  });
});

describe("진짜 탈것 쪽은 한 글자도 바꾸지 않는다", () => {
  const cases: [string, string, string, (string | undefined)[]?][] = [
    ["아빠 차 — 누구 차인지 밝힘", "등장인물 1명: 하온. 장소: 아빠 차 안 — 뒷좌석과 창문. 하온이가 논다.", "하온이는 장난감 자동차를 가지고 놀았어요."],
    ["창밖 — 타고 가는 중", `등장인물 1명: 하온. ${CANNED_CAR}. 하온이가 창밖을 본다.`, "하온이는 장난감 자동차를 꼭 쥐었어요. 창밖으로 바다가 보였어요."],
    ["앞 쪽도 같은 차 — 이어 타는 중", `등장인물 1명: 하온. ${CANNED_CAR}. 하온이가 논다.`, "하온이는 장난감 자동차를 가지고 놀았어요.", [`등장인물 1명: 하온. ${CANNED_CAR}. 잔다.`]],
    ["차 안에서 잠듦", `등장인물 1명: 하온. ${CANNED_CAR}. 잔다.`, "하온이는 장난감 트럭을 꼭 쥐었어요. 자동차 안에서 스르르 잠이 들었어요."],
    ["기차 안 도시락 — 놀잇감 없음", "등장인물 1명: 하온. 장소: 기차 안 — 창가 좌석과 넓은 창. 먹는다.", "기차 안에서 도시락을 먹었어요."],
    ["버스 창밖 — 탈것 낱말 없음", "등장인물 2명: 하온, 도준. 장소: 노란 버스 안 — 노란 좌석. 본다.", "창밖으로 포도밭이 보였어요."],
    ["어린이집 버스 탑승", "등장인물 1명: 하온. 장소: 버스 안 — 좌석과 손잡이. 앉는다.", "블록 놀이를 마치고 어린이집 버스에 올라탔어요. 창밖으로 나무가 휙휙 지나갔어요."],
    ["장난감을 챙겨 아빠 차에 탐", `등장인물 1명: 하온. ${CANNED_CAR}. 앉는다.`, "장난감 자동차를 챙겨서 자동차에 올라탔어요."],
    ["버스에서 내림 — 옛 staleVehicleLocation 그대로(장면은 안 고침)", "등장인물 1명: 하온. 장소: 시내버스 안 — 좌석과 손잡이. 걷는다.", "버스에서 내려 커다란 문을 지나자 넓은 마당이 나왔어요."],
  ];
  for (const [label, scene, text, neighbours] of cases) {
    it(label, () => {
      assert.deepEqual(repairStaleVehicleScene({ scene, storyText: text, neighbours }), { scene, changed: false });
    });
  }

  it("진짜 차 안 쪽의 pageVehicle 은 예전 그대로(승용차 줄·벨트)", () => {
    const text = "하온이는 장난감 자동차를 꼭 쥐었어요. 창밖으로 바다가 보였어요.";
    const page = pageVehicle({ locationName: "자동차 안", locationDescription: "뒷좌석 안전벨트와 창문", sceneBody: "하온이가 창밖을 본다.", storyText: text });
    assert.equal(page.vehicle, "car");
    assert.equal(page.staleVehicleLocation, false);
    assert.match(safetyRuleLines(page, null).join("\n"), /CAR INTERIOR/);
  });
});

describe("놀잇감 탈것의 자리(뒷자리·카시트)도 차 안이 아니다 — 만들기 흐름에 남아 있던 같은 사고", () => {
  it("상자 자동차 뒷자리 · 블록 자동차 뒷좌석 · 장난감 자동차 카시트 → 탈것 아님", () => {
    const dir = { narration: "normal", dialogue: "happy", intensity: 0.5, pace: "normal" } as const;
    for (const text of ["하온이는 상자 자동차 뒷자리에 인형을 앉혔어요.", "블록 자동차 뒷좌석에 공룡을 앉혔어요.", "도준이가 장난감 자동차 카시트에 인형을 앉혔어요."]) {
      assert.equal(vehicleState(text).kind, null, text);
      const out = repairStoryContinuity({ title: "", summary: "", characters: [], pages: [{ pageNo: 1, text, imagePrompt: `등장인물 1명: 하온. ${CLASS}. 논다.`, voiceDirection: dir }] });
      assert.match(out.pages[0].imagePrompt, /어린이집 교실/, text);
      // 이미 저장된 '장소: 뒷자리 — 뒷좌석 안전벨트 …'도 다시 그릴 때 고친다.
      const saved = `등장인물 1명: 하온. 장소: 뒷자리 — 뒷좌석 안전벨트와 창문, 앞자리 등받이가 보이는 승용차 안, 창밖으로 흐르는 도시 풍경. 논다.`;
      assert.equal(repairStaleVehicleScene({ scene: saved, storyText: text, neighbours: [P2] }).scene, `등장인물 1명: 하온. ${CLASS}. 논다.`);
    }
  });
  it("진짜 차 뒷자리는 그대로", () => {
    assert.equal(vehicleState("하온이는 장난감 자동차를 쥐고 뒷자리에 앉았어요.").kind, "car");
    assert.equal(vehicleState("아빠 차 뒷자리에 앉았어요.").kind, "car");
  });
});

describe("다시 그리기·만들기 화면이 앞·뒤 쪽 장소를 건네는 길", () => {
  it("placeClauseOf — 장면 지시에서 장소 줄만(없으면 빈 글)", () => {
    assert.equal(placeClauseOf(P2), CLASS);
    assert.equal(placeClauseOf("등장인물 1명: 하온. 하온이가 논다."), "");
    assert.equal(placeClauseOf(undefined), "");
  });

  it("이어 타는 중 — 라우트가 앞·뒤 쪽 이름을 넘기면 pageVehicle 도 차 안을 그대로 둔다", () => {
    const text = "하온이는 장난감 자동차를 가지고 놀았어요.";
    const loc = placeOf(CANNED_CAR)!;
    const input = { locationName: loc[1].trim(), locationDescription: loc[2].trim(), sceneBody: "하온이가 논다.", storyText: text };
    assert.equal(pageVehicle(input).staleVehicleLocation, true);
    const riding = pageVehicle({ ...input, neighbourPlaces: ["자동차 안"] });
    assert.equal(riding.vehicle, "car");
    assert.equal(riding.staleVehicleLocation, false);
    // 앞·뒤 쪽이 다른 곳(교실)이면 이어 타는 중이 아니다.
    assert.equal(pageVehicle({ ...input, neighbourPlaces: ["어린이집 교실"] }).staleVehicleLocation, true);
  });

  it("앞 쪽 설명에 '$'가 있어도 글자 그대로 옮긴다", () => {
    const odd = "등장인물 1명: 하온. 장소: 어린이집 교실 — 벽에 $& 모양 스티커와 낮은 선반. 논다.";
    const r = repairStaleVehicleScene({ scene: SCENE3, storyText: P3, neighbours: [odd] });
    assert.ok(r.scene.includes("장소: 어린이집 교실 — 벽에 $& 모양 스티커와 낮은 선반."), r.scene);
  });

  it("여러 줄 장면 지시에서 장소 줄을 빼도 줄 바꿈은 남는다(라우트가 줄 단위로 장면 문장을 읽는다)", () => {
    const scene = ["등장인물 1명: 하온.", `${CANNED_CAR}.`, "하온이가 논다."].join("\n");
    const r = repairStaleVehicleScene({ scene, storyText: "하온이는 음식 모형을 자동차 안에 넣었어요." });
    assert.equal(r.changed, true);
    assert.equal(r.scene, ["등장인물 1명: 하온.", "하온이가 논다."].join("\n"));
  });
});

/*
 * 검토(2026-09-30)에서 나온 빈틈 — 놀이 말(출발·운전·도착), 서로 보증하는 놀잇감 두 쪽, 통학 버스 이름 갈래,
 * 클로드가 제 말로 적은 한 쪽짜리 차 안, 만들기 화면의 옛 열쇠.
 */
describe("놀이에서 하는 말(출발·운전·도착)은 탄 흔적이 아니다", () => {
  const base = "하온이랑 도준이가 음식 모형을 꺼냈어요.\n자동차 안에 가득가득 채워 넣었어요.\n";
  for (const line of ["\"부릉부릉, 음식 차 출발!\"", "하온이가 운전사 흉내를 냈어요.", "음식 차가 도착했어요."]) {
    it(line, () => {
      const r = repairStaleVehicleScene({ scene: SCENE3, storyText: base + line, neighbours: [P2, P4] });
      assert.equal(r.changed, true);
      assert.ok(r.scene.includes(`${CLASS}.`), r.scene);
    });
  }
  for (const text of ["아빠 차가 출발했어요. 하온이는 장난감 자동차를 꼭 쥐었어요.", "하온이는 장난감 자동차를 꼭 쥐었어요. 버스가 출발했어요."]) {
    it(`진짜 탈것이 출발 — ${text}`, () => {
      const scene = `등장인물 1명: 하온. ${CANNED_CAR}. 앉는다.`;
      assert.deepEqual(repairStaleVehicleScene({ scene, storyText: text, neighbours: [P2, P4] }), { scene, changed: false });
    });
  }
});

describe("옆 쪽 장소 줄 — 옛 줄끼리 '이어 타는 중'으로 보증하지 않는다(neighbourPlaceClauses)", () => {
  const page = (text: string, prompt: string) => ({ text, imagePrompt: prompt });
  const cls = (text: string) => page(text, `등장인물 1명: 하온. ${CLASS}. 논다.`);
  const car = (text: string) => page(text, `등장인물 1명: 하온. ${CANNED_CAR}. 논다.`);

  it("놀잇감 쪽이 나란히 둘 — 둘 다 교실로", () => {
    const pages = [cls("교실에서 놀았어요."), cls("장난감 자동차를 세웠어요."), car(P3), car("하온이는 장난감 자동차에 김밥 모형을 더 넣었어요."), cls("선생님이 웃었어요.")];
    assert.deepEqual(neighbourPlaceClauses(pages, 2), [CLASS, CLASS]);
    const fixed = repairStaleVehiclePages(pages);
    assert.match(placeClauseOf(fixed[2].imagePrompt), /어린이집 교실/);
    assert.match(placeClauseOf(fixed[3].imagePrompt), /어린이집 교실/);
    assert.equal(fixed[0], pages[0]);
    assert.equal(fixed[4], pages[4]);
  });

  it("옆 쪽이 기성 차 줄인데 탄 말이 '자동차 안에 가득 찬' 낱말뿐이면 보증하지 않는다 — 사장님 3쪽은 교실", () => {
    const pages = [cls("가게 놀이를 했어요."), cls("장난감 자동차를 세웠어요."), car(P3), car("선생님이 자동차 안에 가득 찬 김밥을 하나 골랐어요."), cls("선생님이 김밥을 먹었어요.")];
    assert.deepEqual(neighbourPlaceClauses(pages, 2), [CLASS]);
    assert.match(placeClauseOf(repairStaleVehiclePages(pages)[2].imagePrompt), /어린이집 교실/);
  });

  it("진짜로 탄 쪽에서 이어지는 놀잇감 쪽들은 차 안 그대로", () => {
    const home = page("하온이는 현관에서 신발을 신었어요.", "등장인물 1명: 하온. 장소: 우리 집 현관 — 신발장. 신는다.");
    const pages = [home, car("하온이는 아빠 차에 올라탔어요."), car("하온이는 장난감 자동차를 가지고 놀았어요."), car("하온이는 장난감 자동차를 꼭 쥐었어요."), page("할머니 댁에 도착했어요.", "등장인물 1명: 하온. 장소: 할머니 댁 마당 — 감나무. 뛴다.")];
    const fixed = repairStaleVehiclePages(pages);
    fixed.forEach((p, i) => assert.equal(p, pages[i], `${i + 1}쪽`));
    assert.equal(neighbourPlaceClauses(pages, 3)[0], CANNED_CAR);
  });

  it("옆 쪽이 '아빠 차 안에서 노래' — 탄 말이 없어도 주인을 밝힌 차라 보증한다(다음 장난감 쪽은 차 안 그대로)", () => {
    const home = page("하온이는 현관에서 신발을 신었어요.", "등장인물 1명: 하온. 장소: 우리 집 현관 — 신발장. 신는다.");
    const yard = page("할머니 댁에 도착했어요.", "등장인물 1명: 하온. 장소: 할머니 댁 마당 — 감나무. 뛴다.");
    const pages = [home, car("아빠 차 안에서 신나게 노래를 불렀어요."), car("하온이는 장난감 자동차를 가지고 놀았어요."), yard];
    assert.equal(neighbourPlaceClauses(pages, 2)[0], CANNED_CAR);
    repairStaleVehiclePages(pages).forEach((p, i) => assert.equal(p, pages[i], `${i + 1}쪽`));
  });

  it("쪽 번호가 책 밖이면 빈 목록", () => {
    assert.deepEqual(neighbourPlaceClauses([cls("놀았어요.")], 3), []);
  });
});

describe("통학 버스 이름 갈래 — 앞·뒤 쪽이 탈것이면 이어 타는 중", () => {
  const BUS = "장소: 어린이집 버스 안 — 낮은 노란 좌석과 작은 안전벨트, 큰 창문";
  const text = "선생님이 가방에서 장난감 버스를 꺼냈어요. \"우리 버스랑 똑같죠?\" 하온이랑 도준이가 까르르 웃었어요.";
  const canned = "등장인물 3명: 하온, 도준, 선생님. 장소: 버스 안 — 나란히 놓인 좌석과 손잡이, 창밖 풍경이 흐르는 시내버스·지하철 같은 대중교통 안. 선생님이 장난감 버스를 들어 보인다.";

  it("클로드가 적은 '버스 안' — 어린이집 버스·포도밭 사이여도 그대로", () => {
    const scene = "등장인물 3명: 하온, 도준, 선생님. 장소: 버스 안 — 낮은 노란 좌석과 작은 안전벨트, 큰 창문. 선생님이 장난감 버스를 들어 보이고 아이들이 웃는다.";
    for (const neighbours of [[BUS, BUS], [BUS, "장소: 포도밭 — 초록 포도 덩굴"]]) {
      assert.deepEqual(repairStaleVehicleScene({ scene, storyText: text, neighbours }), { scene, changed: false });
    }
  });

  it("기성 버스 줄 — 어린이집 버스 안·통학버스 안(다른 열쇠)이나 자동차 안 곁이어도 그대로", () => {
    for (const neighbours of [[BUS, "장소: 통학버스 안 — 노란 좌석"], ["장소: 자동차 안 — 뒷좌석", "장소: 자동차 안 — 뒷좌석"]]) {
      assert.deepEqual(repairStaleVehicleScene({ scene: canned, storyText: text, neighbours }), { scene: canned, changed: false });
    }
    const loc = placeOf(canned)!;
    const page = pageVehicle({ locationName: loc[1].trim(), locationDescription: loc[2].trim(), sceneBody: body(canned), storyText: text, neighbourPlaces: ["어린이집 버스 안"] });
    assert.equal(page.vehicle, "transit");
    assert.equal(page.staleVehicleLocation, false);
  });
});

describe("클로드가 제 말로 적은 차 안은 건드리지 않는다 — 기성 설명(옛 판정이 박은 줄)만", () => {
  const neighbours = ["장소: 우리 집 현관 — 신발장", "장소: 할머니 댁 마당 — 감나무"];
  it("장난감 자동차를 쥐고 차에서 잠듦 · 차 안에 간식을 담음", () => {
    const cases: [string, string][] = [
      ["등장인물 1명: 하온. 장소: 자동차 안 — 뒷좌석 카시트와 창문, 앞자리 등받이. 하온이가 장난감 자동차를 꼭 쥐고 잠들어 있다.", "하온이는 장난감 자동차를 꼭 쥐었어요. 그리고 스르르 잠이 들었어요."],
      ["등장인물 1명: 하온. 장소: 자동차 안 — 뒷좌석 카시트와 창문, 앞자리 등받이. 하온이가 노래한다.", "엄마가 차 안에 간식을 가득 담았어요. 하온이는 신이 나서 노래를 불렀어요."],
    ];
    for (const [scene, text] of cases) {
      assert.deepEqual(repairStaleVehicleScene({ scene, storyText: text, neighbours }), { scene, changed: false });
      const loc = placeOf(scene)!;
      const page = pageVehicle({ locationName: loc[1].trim(), locationDescription: loc[2].trim(), sceneBody: body(scene), storyText: text, neighbourPlaces: ["우리 집 현관", "할머니 댁 마당"] });
      assert.equal(page.vehicle, "car", text);
      assert.match(safetyRuleLines(page, null).join("\n"), /CAR INTERIOR/);
    }
  });

  it("옛 책의 예전 기성 설명(09-14·08-19 전)도 알아본다", () => {
    for (const clause of ["장소: 차 안 — 창밖 풍경이 흐르는 좌석과 손잡이", "장소: 자동차 안 — 나란히 놓인 좌석과 천장 손잡이, 창밖 풍경이 흐르는 차량 안"]) {
      const r = repairStaleVehicleScene({ scene: `등장인물 1명: 하온. ${clause}. 논다.`, storyText: P3, neighbours: [P2, P4] });
      assert.equal(r.scene, `등장인물 1명: 하온. ${CLASS}. 논다.`, clause);
    }
  });

  it("표시로 쓰는 기성 설명 = 지금 만들기가 차 안에 붙이는 줄", () => {
    const text = "하온이는 아빠 차 안에서 벨트를 맸어요.";
    const out = repairStoryContinuity({ title: "", summary: "", characters: [], pages: [{ pageNo: 1, text, imagePrompt: `등장인물 1명: 하온. ${CLASS}. 앉는다.`, voiceDirection: { narration: "normal", dialogue: "happy", intensity: 0.5, pace: "normal" } }] });
    assert.equal(placeOf(out.pages[0].imagePrompt)![2].trim(), placeOf(CANNED_CAR)![2].trim());
  });
});

describe("만들기 화면 — 그리기 전에 고친 줄로 열쇠·장소 기준 그림을 고른다(repairStaleVehiclePages)", () => {
  it("고친 쪽만 새 객체, 열쇠는 교실", () => {
    const pages = [
      { pageNo: 1, text: "하온이는 교실에서 놀았어요.", imagePrompt: `등장인물 1명: 하온. ${CLASS}. 논다.` },
      { pageNo: 2, text: "하온이는 음식 모형을 자동차 안에 넣었어요. 선생님이 웃었어요.", imagePrompt: `등장인물 1명: 하온. ${CANNED_CAR}. 논다.` },
      { pageNo: 3, text: "하온이는 교실에서 김밥을 먹었어요.", imagePrompt: `등장인물 1명: 하온. ${CLASS}. 먹는다.` },
    ];
    const fixed = repairStaleVehiclePages(pages);
    assert.equal(fixed[0], pages[0]);
    assert.equal(fixed[2], pages[2]);
    assert.equal(fixed[1].pageNo, 2);
    assert.equal(fixed[1].imagePrompt, `등장인물 1명: 하온. ${CLASS}. 논다.`);
    assert.equal(locationKeyOf(placeOf(fixed[1].imagePrompt)![1]), locationKeyOf("어린이집 교실"));
    // 고친 책은 다시 넣어도 그대로.
    repairStaleVehiclePages(fixed).forEach((p, i) => assert.equal(p, fixed[i]));
  });
});
