import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkRuleLines, pageVehicle, safetyRuleLines, schoolBusPlaceKeys, vehicleInteriorLines } from "./illustration-rules.ts";
import { locationKeyOf, schoolShuttleName, schoolShuttleRide, sheetMatchesKey } from "./story-quality.ts";

/*
 * 어린이 통학 버스(어린이집·유치원·학원 버스)는 아이들이 벨트를 맨 모습으로 그린다 — 세림이법(2026-09-29 사장님 "조아").
 * 시내버스·기차·지하철·2층 버스는 예전처럼 "벨트·카시트 없음", 승용차는 예전 승용차 줄 그대로다.
 * 아래 '그대로' 시험은 줄을 글자 그대로 적어 둔다 — 통학 버스 일로 다른 탈것의 문장이 한 글자라도 바뀌면 떨어진다.
 */

const joined = (lines: string[]) => lines.join("\n");
const SHUTTLE_BELT = /SCHOOL SHUTTLE — .*buckled child-size seat belt \(lap-and-shoulder style\)/;
const VINEYARD_TRIP = "어린이집 친구들이랑 포도밭 가는 날, 버스에 올라탔어요";

describe("schoolShuttleName — 장소 이름", () => {
  for (const name of ["어린이집 버스 안", "유치원 버스 안", "통학버스 안", "노란 셔틀버스 안", "통학 버스 안", "학원 버스", "학원 차", "어린이집 차", "유치원 차 안", "등원 버스 안", "하원 차량", "스쿨버스 안", "노란 어린이집 버스"]) {
    it(`${name} → 통학 버스`, () => assert.equal(schoolShuttleName(name), "shuttle"));
  }
  // 다른 탈것을 대놓고 부르는 이름 — 본문에 어린이집 말이 있어도 통학 버스가 아니다.
  for (const name of ["시내버스 안", "2층 버스 위층", "기차 안", "마을버스 안", "고속버스 안", "지하철 안", "아빠 차", "공항 셔틀버스 안", "놀이공원 셔틀버스 안", "동물원 셔틀버스 안", "캠핑장 셔틀버스 안"]) {
    it(`${name} → 다른 탈것`, () => assert.equal(schoolShuttleName(name, "어린이집 친구들이랑 셔틀버스를 탔어요."), "other"));
  }
  for (const name of ["버스 안", "버스 정류장", "어린이집 교실", "자동차 안", "셔틀콕", "어린이집 차고", "노란 버스 안", "셔틀버스 안"]) {
    it(`${name} → 이름만으로는 모른다`, () => assert.equal(schoolShuttleName(name), null));
  }

  it("'노란 버스'·맨 '셔틀'은 같은 쪽에 어린이집·유치원·학원·등하원 말이 있을 때만", () => {
    assert.equal(schoolShuttleName("노란 버스 안", "오늘은 어린이집 친구들이랑 포도밭에 가는 날이에요."), "shuttle");
    assert.equal(schoolShuttleName("노란 버스 안", "엄마랑 시장에 갔어요."), null);
    // 놀이공원 셔틀 — 가족 나들이의 셔틀은 통학 버스가 아니다(2026-09-29 검토).
    assert.equal(schoolShuttleName("셔틀버스 안", "아빠 엄마랑 셔틀버스를 타고 놀이공원에 가요."), null);
    assert.equal(schoolShuttleName("셔틀버스 안", "유치원 친구들이랑 셔틀버스에 탔어요."), "shuttle");
  });

  it("아이 이름 '하원이'는 어린이집 말이 아니다 — 하원 시간·하원 버스는 맞다", () => {
    assert.equal(schoolShuttleName("노란 버스 안", "하원이랑 엄마랑 노란 버스를 탔어요."), null);
    assert.equal(schoolShuttleName("노란 버스 안", "하원 시간에 노란 버스를 탔어요."), "shuttle");
  });
});

describe("schoolShuttleRide — 이 쪽에서 탄 탈것", () => {
  for (const text of [
    "하온이는 어린이집 버스에 올라탔어요.",
    "어린이집 버스가 왔어요. 하온이는 버스에 올라탔어요.",
    "선생님이 \"어린이집 버스에 타세요!\" 했어요. 하온이는 버스에 올라탔어요.",
    "어린이집 버스가 포도밭을 지나갔어요.",
    // 탄 버스 밖으로 다른 탈것이 지나가도 탄 버스는 그대로다.
    "하온이는 어린이집 버스에 올라탔어요. 창밖으로 택시가 쌩 지나갔어요.",
    "어린이집 버스를 타고 가는데 창밖으로 기차가 칙칙폭폭 지나갔어요.",
    "오늘은 어린이집 버스를 타고 포도밭에 가요. 버스가 출발했어요!",
    // 버스에서 벨트를 맸다 — 시내버스엔 벨트가 없다.
    "노란 버스에 올라탔어요. 선생님이 안전벨트를 딸깍 채워 주셨어요.",
    "하온이는 안전벨트를 딸깍 맸어요. 포도밭으로 출발!",
  ]) {
    it(`"${text}" → 통학 버스`, () => assert.equal(schoolShuttleRide(text), "shuttle"));
  }
  // 어린이집 버스는 나오지만 탄 건 다른 버스 — 엄마·할머니와 탄 시내버스가 벨트 맨 통학 버스로 그려졌다(2026-09-29 검토).
  for (const text of [
    "어린이집 버스를 놓쳐서 엄마랑 버스를 탔어요.",
    "어린이집 버스를 놓쳤어요! 하온이는 엄마랑 버스를 타고 가요.",
    "하온이는 엄마랑 버스를 탔어요. 창밖으로 노란 어린이집 버스가 지나갔어요.",
    "엄마랑 버스에 탔어요. 창밖에 유치원 버스가 보였어요.",
    "내일은 어린이집 버스를 타고 소풍 가요. 오늘은 엄마랑 버스를 탔어요.",
    "할머니랑 버스를 탔어요. 옛날엔 학교 버스도 없었대요.",
    "어린이집 버스를 놓쳐서 엄마랑 시내버스를 탔어요.",
    "하온이는 엄마랑 시내버스를 탔어요.",
    "아빠 엄마랑 놀이공원 셔틀버스를 탔어요.",
  ]) {
    it(`"${text}" → 다른 버스`, () => assert.equal(schoolShuttleRide(text), "other"));
  }
  for (const text of ["어린이집 친구들이랑 포도밭 가는 날, 버스에 올라탔어요", "창밖으로 커다란 포도밭이 보였어요.", "하원이랑 엄마랑 노란 버스를 탔어요.", ""]) {
    it(`"${text}" → 이 글로는 모른다`, () => assert.equal(schoolShuttleRide(text), null));
  }

  it("차(car) 쪽은 어린이집 차·학원 차를 탄 말만 — 창밖으로 본 어린이집 버스·어린이집 차는 아니다", () => {
    assert.equal(schoolShuttleRide("하온이는 유치원 차에 올라탔어요.", "car"), "shuttle");
    assert.equal(schoolShuttleRide("하온이는 차를 타고 가다가 창밖으로 어린이집 버스를 봤어요.", "car"), "other");
    assert.equal(schoolShuttleRide("창밖으로 어린이집 차를 봤어요.", "car"), "other");
    assert.equal(schoolShuttleRide("아빠 차에 타서 안전벨트를 맸어요.", "car"), "other");
    // 승용차에서 벨트를 매는 건 늘 맞다 — 벨트만으로 통학 버스로 바꾸지 않는다.
    assert.equal(schoolShuttleRide("차에 타서 안전벨트를 맸어요.", "car"), null);
  });
});

describe("pageVehicle — 통학 버스 쪽", () => {
  const ride = (locationName: string, storyText = "하온이는 버스에 올라탔어요.") =>
    pageVehicle({ locationName, locationDescription: "노란 좌석 줄과 넓은 창", sceneBody: "하온이는 창가 자리에 앉는다.", storyText });

  it(`장소 '어린이집 버스 안' + "${VINEYARD_TRIP}" → 통학 버스`, () => {
    const page = ride("어린이집 버스 안", VINEYARD_TRIP);
    assert.equal(page.vehicle, "transit");
    assert.equal(page.schoolBus, true);
    assert.equal(page.openDeck, false);
  });

  for (const name of ["어린이집 버스 안", "유치원 버스 안", "통학버스 안", "노란 셔틀버스 안"]) {
    it(`장소 '${name}' → 통학 버스`, () => assert.equal(ride(name).schoolBus, true));
  }
  for (const name of ["시내버스 안", "버스 안", "2층 버스 위층", "기차 안", "지하철 안"]) {
    it(`장소 '${name}' → 통학 버스 아님, 대중교통 그대로`, () => {
      const page = ride(name);
      assert.equal(page.vehicle, "transit");
      assert.equal(page.schoolBus, false);
    });
  }

  it("맨 '버스 안'은 어린이집 친구들이 타도 통학 버스로 치지 않는다 · 본문이 통학 버스를 말하면 통학 버스", () => {
    assert.equal(ride("버스 안", VINEYARD_TRIP).schoolBus, false);
    assert.equal(ride("버스 안", "하온이는 노란 어린이집 버스에 올라탔어요.").schoolBus, true);
    assert.equal(ride("버스 안", "어린이집 버스가 왔어요. 하온이는 버스에 올라탔어요.").schoolBus, true);
  });

  // 2026-09-29 검토 — 엄마·할머니와 탄 시내버스가 '어린이집 버스' 낱말 하나로 벨트 맨 통학 버스가 됐다.
  for (const [locationName, storyText] of [
    ["버스 안", "어린이집 버스를 놓쳐서 엄마랑 버스를 탔어요."],
    ["버스 안", "어린이집 버스를 놓쳤어요! 하온이는 엄마랑 버스를 타고 가요."],
    ["버스 안", "하온이는 엄마랑 버스를 탔어요. 창밖으로 노란 어린이집 버스가 지나갔어요."],
    ["버스 안", "엄마랑 버스에 탔어요. 창밖에 유치원 버스가 보였어요."],
    ["버스 안", "내일은 어린이집 버스를 타고 소풍 가요. 오늘은 엄마랑 버스를 탔어요."],
    ["버스 안", "할머니랑 버스를 탔어요. 옛날엔 학교 버스도 없었대요."],
    ["버스 안", "하원이랑 엄마랑 노란 버스를 탔어요."],
    ["노란 버스 안", "하원이랑 엄마랑 노란 버스를 탔어요."],
    ["노란 버스 안", "어린이집 버스를 놓쳐서 엄마랑 버스를 탔어요."],
    ["버스 정류장", "어린이집 버스를 놓쳐서 엄마랑 버스에 올라탔어요."],
  ] as const) {
    it(`장소 '${locationName}' + "${storyText}" → 대중교통 그대로`, () => {
      const page = pageVehicle({ locationName, sceneBody: "하온이는 창가 자리에 앉는다.", storyText });
      assert.equal(page.vehicle, "transit");
      assert.equal(page.schoolBus, false);
      assert.match(joined(safetyRuleLines(page, null)), /Draw NO seat belts/);
    });
  }

  it("놀이공원·동물원·캠핑장·공항 셔틀은 통학 버스가 아니다 — 설명이 '셔틀버스'를 되풀이해도", () => {
    for (const locationName of ["놀이공원 셔틀버스 안", "동물원 셔틀버스 안", "캠핑장 셔틀버스 안"]) {
      assert.equal(pageVehicle({ locationName, storyText: "아빠 엄마랑 셔틀버스를 타고 놀이공원에 가요." }).schoolBus, false);
    }
    const airport = pageVehicle({ locationName: "공항 셔틀버스 안", locationDescription: "파란 좌석이 줄지어 있는 셔틀버스 안", storyText: "셔틀버스를 탔어요." });
    assert.equal(airport.schoolBus, false);
    assert.equal(pageVehicle({ locationName: "셔틀버스 안", storyText: "아빠 엄마랑 셔틀버스를 타고 놀이공원에 가요." }).schoolBus, false);
  });

  it("장소 이름이 통학 버스면 설명·본문에 스친 다른 탈것으로 뒤집지 않는다", () => {
    const named = pageVehicle({ locationName: "어린이집 버스 안", locationDescription: "창밖으로 기차가 지나가는 노란 버스", storyText: "하온이는 친구들이랑 버스에 앉았어요." });
    assert.equal(named.schoolBus, true);
    assert.equal(ride("버스 안", "어린이집 버스를 타고 가는데 창밖으로 기차가 칙칙폭폭 지나갔어요.").schoolBus, true);
    assert.equal(ride("버스 안", "하온이는 어린이집 버스에 올라탔어요. 창밖으로 택시가 쌩 지나갔어요.").schoolBus, true);
  });

  it("버스에서 아이가 벨트를 맸다는 쪽은 통학 버스 — 벨트 맨 그림을 떨어뜨리지 않는다", () => {
    const teacher = pageVehicle({
      locationName: "노란 버스 안",
      sceneBody: "선생님이 하온이의 안전벨트를 채워 준다",
      storyText: "노란 버스에 올라탔어요. 선생님이 안전벨트를 딸깍 채워 주셨어요.",
    });
    assert.equal(teacher.schoolBus, true);
    assert.doesNotMatch(joined(checkRuleLines({ page: teacher })), /FAIL if anyone wears a seat belt/);
    assert.equal(ride("버스 안", "하온이는 안전벨트를 딸깍 맸어요. 포도밭으로 출발!").schoolBus, true);
    // 이름이 다른 탈것이면 벨트 말로 바꾸지 않는다.
    assert.equal(ride("시내버스 안", "하온이는 안전벨트를 딸깍 맸어요.").schoolBus, false);
  });

  it("버스 정류장·어린이집 교실은 탈것 안이 아니다", () => {
    assert.equal(pageVehicle({ locationName: "어린이집 교실", sceneBody: "하온이가 블록을 쌓는다.", storyText: "하온이는 블록을 쌓았어요." }).schoolBus, false);
    assert.equal(pageVehicle({ locationName: "버스 정류장", sceneBody: "하온이가 버스를 기다린다.", storyText: "버스를 기다렸어요." }).vehicle, null);
  });

  it("어린이집 차는 승용차가 아니라 통학 버스 줄 — 아빠 차는 그대로 승용차", () => {
    const shuttle = pageVehicle({ locationName: "어린이집 차", sceneBody: "하온이가 창밖을 본다.", storyText: "하온이는 어린이집 차에 탔어요." });
    assert.equal(shuttle.vehicle, "transit");
    assert.equal(shuttle.schoolBus, true);
    const car = pageVehicle({ locationName: "아빠 차", sceneBody: "하온이가 창밖을 본다.", storyText: "아빠 차를 타고 바다로 갔어요." });
    assert.equal(car.vehicle, "car");
    assert.equal(car.schoolBus, false);
  });

  it("통학 버스에서 내린 쪽은 통학 버스가 아니다", () => {
    const page = pageVehicle({ locationName: "포도밭", sceneBody: "하온이가 포도밭 입구에 선다.", storyText: "어린이집 버스에서 내려 포도밭으로 뛰어갔어요." });
    assert.equal(page.gotOff, true);
    assert.equal(page.schoolBus, false);
  });
});

/*
 * 한 번 탄 버스는 내릴 때까지 같은 버스 — 같은 장소 줄의 쪽들은 장소 시트·같은 장소 기준 쪽을 나눠 쓴다.
 * 앞 쪽만 통학 버스(벨트)이고 뒤 쪽이 벨트 금지면, 벨트 맨 앞 쪽 그림을 기준으로 받은 뒤 쪽이 검수에서 떨어진다.
 */
describe("schoolBusPlaceKeys — 같은 장소 줄은 같은 버스", () => {
  const YELLOW = "장소: 노란 버스 안 — 창가 좌석과 창밖으로 지나가는 논밭.";
  const book = [
    { imagePrompt: "등장인물 1명: 하온. 장소: 어린이집 앞 — 낮은 담장과 노란 대문. 하온이가 손을 흔든다.", text: "어린이집 앞에 친구들이 모였어요." },
    { imagePrompt: `등장인물 1명: 하온. ${YELLOW} 하온이가 창가 자리에 앉는다.`, text: "어린이집 친구들이랑 포도밭 가는 날, 노란 버스에 올라탔어요." },
    { imagePrompt: `등장인물 1명: 하온. ${YELLOW} 하온이가 창밖을 본다.`, text: "창밖으로 커다란 포도밭이 보였어요. \"우와, 포도다!\"" },
  ];

  it("앞 쪽이 통학 버스면 그 장소 열쇠가 잡히고, 뒤 쪽도 통학 버스가 된다", () => {
    const keys = schoolBusPlaceKeys(book);
    assert.deepEqual([...keys], [locationKeyOf("노란 버스 안")]);
    const later = { locationName: "노란 버스 안", locationDescription: "창가 좌석과 창밖으로 지나가는 논밭", sceneBody: "하온이가 창밖을 본다.", storyText: book[2].text };
    assert.equal(pageVehicle(later).schoolBus, false);
    const same = pageVehicle({ ...later, schoolBusPlace: keys.has(locationKeyOf("노란 버스 안")) });
    assert.equal(same.schoolBus, true);
    assert.doesNotMatch(joined(checkRuleLines({ page: same })), /FAIL if anyone wears a seat belt/);
  });

  it("'버스 안'으로 탄 쪽도 같다 — 어린이집 버스에 올라탄 쪽 다음 쪽", () => {
    const keys = schoolBusPlaceKeys([
      { imagePrompt: "장소: 버스 안 — 노란 좌석 줄. 하온이가 앉는다.", text: "하온이는 어린이집 버스에 올라탔어요." },
      { imagePrompt: "장소: 버스 안 — 노란 좌석 줄. 하온이가 창밖을 본다.", text: "창밖으로 나무가 휙휙 지나가요." },
    ]);
    assert.equal(keys.has(locationKeyOf("버스 안")), true);
  });

  it("통학 버스가 없는 책은 비어 있다 · 탈것이 아닌 장소는 세지 않는다", () => {
    assert.equal(schoolBusPlaceKeys([{ imagePrompt: "장소: 버스 안 — 파란 좌석. 하온이가 앉는다.", text: "엄마랑 버스를 탔어요." }]).size, 0);
    assert.equal(schoolBusPlaceKeys([{ imagePrompt: "장소: 어린이집 버스 정류장 — 노란 표지판. 하온이가 버스에 탄다.", text: "하온이는 버스에 올라탔어요." }]).size, 0);
    assert.equal(schoolBusPlaceKeys([{ text: "어린이집 버스에 탔어요." }, {}]).size, 0);
  });

  it("같은 장소 줄이어도 본문이 다른 탈것을 대놓고 말한 쪽·이름이 다른 탈것인 쪽은 그대로", () => {
    const mom = pageVehicle({ locationName: "노란 버스 안", storyText: "하온이는 엄마랑 시내버스를 탔어요.", schoolBusPlace: true });
    assert.equal(mom.schoolBus, false);
    assert.equal(pageVehicle({ locationName: "시내버스 안", storyText: "창밖을 봤어요.", schoolBusPlace: true }).schoolBus, false);
    // 장소 줄이 탈것이 아니면(본문에서 탈것을 찾은 쪽) 쓰지 않는다 — 열쇠가 그 탈것이 아니다.
    assert.equal(pageVehicle({ locationName: "포도밭 가는 길", storyText: "버스에 탔어요.", schoolBusPlace: true }).schoolBus, false);
  });
});

/*
 * 장소 시트·같은 장소 기준 쪽은 열쇠로 나눠 쓴다 — 통학 버스가 시내버스·아빠 차와 같은 열쇠면
 * 벨트 맨 좌석 그림이 벨트 금지 쪽의 기준이 된다(2026-09-29 검토).
 */
describe("locationKeyOf — 이름으로 통학 버스인 곳은 따로 묶는다", () => {
  it("통학버스·스쿨버스·등원 버스·노란 셔틀버스는 시내버스와 다른 열쇠, 학원 차는 아빠 차와 다른 열쇠", () => {
    for (const name of ["통학버스 안", "스쿨버스 안", "등원 버스 안", "노란 셔틀버스 안"]) {
      assert.equal(locationKeyOf(name), "shuttle:transit", name);
      assert.notEqual(locationKeyOf(name), locationKeyOf("시내버스 안"));
    }
    assert.equal(locationKeyOf("학원 차"), "shuttle:car");
    assert.notEqual(locationKeyOf("학원 차"), locationKeyOf("아빠 차"));
  });

  it("원래 열쇠는 그대로 — 어린이집 버스·어린이집 차·맨 버스·노란 버스·시내버스·기차·아빠 차", () => {
    assert.equal(locationKeyOf("어린이집 버스 안"), "school:transit");
    assert.equal(locationKeyOf("어린이집 차"), "school:car");
    for (const name of ["버스 안", "노란 버스 안", "셔틀버스 안", "시내버스 안", "기차 안"]) assert.equal(locationKeyOf(name), "transit", name);
    assert.equal(locationKeyOf("아빠 차"), "car");
  });

  it("옛 책의 시트(옛 열쇠 'transit')도 이름으로 다시 찾는다 — 시내버스 시트는 통학버스 쪽에 붙지 않는다", () => {
    assert.equal(sheetMatchesKey({ key: "transit", name: "통학버스 안" }, locationKeyOf("통학버스 안")), true);
    assert.equal(sheetMatchesKey({ key: "transit", name: "시내버스 안" }, locationKeyOf("통학버스 안")), false);
    assert.equal(sheetMatchesKey({ key: "car", name: "학원 차" }, locationKeyOf("학원 차")), true);
  });
});

describe("그리기 줄 — 벨트 문장은 통학 버스에만", () => {
  const shuttle = pageVehicle({ locationName: "어린이집 버스 안", locationDescription: "노란 좌석 줄과 넓은 창", sceneBody: "하온이는 창가 자리에 앉는다.", storyText: VINEYARD_TRIP });
  const city = pageVehicle({ locationName: "시내버스 안", sceneBody: "하온이는 창가 자리에 앉는다.", storyText: "하온이는 엄마랑 시내버스를 탔어요." });

  it("통학 버스: 아이용 벨트를 맨다, 벨트 금지·승용차 줄은 없다", () => {
    const out = joined(safetyRuleLines(shuttle, null));
    assert.match(out, SHUTTLE_BELT);
    assert.match(out, /No child car seats, and no one stands in the aisle while the bus is moving/);
    assert.doesNotMatch(out, /NO seat belts|PUBLIC TRANSPORT|CAR INTERIOR|LEFT-hand drive/);
  });

  it("시내버스: 벨트 금지 그대로, 통학 버스 줄 없음", () => {
    const out = joined(safetyRuleLines(city, null));
    assert.match(out, /Draw NO seat belts and NO child car seats/);
    assert.doesNotMatch(out, /SCHOOL SHUTTLE|child-size seat belt/);
  });

  it("탈것 안 배경 줄(쪽 그림·장소 시트): 통학 버스 좌석엔 작은 벨트, 벨트 금지 없음", () => {
    const out = joined(vehicleInteriorLines("transit", "어린이집 버스 안", true));
    assert.match(out, /inside of a children's daycare or school shuttle bus/);
    assert.match(out, /each with a small child-size seat belt/);
    assert.doesNotMatch(out, /NO seat belts|no seat belts/);
    assert.doesNotMatch(joined(vehicleInteriorLines("transit", "시내버스 안")), /seat belt/);
  });

  it("장소 시트 라우트와 같은 판단 — 벨트 좌석은 이름만으로 통학 버스일 때만(열쇠와 같은 기준)", () => {
    const place = pageVehicle({ locationName: "어린이집 버스 안", locationDescription: "노란 좌석 줄과 넓은 창" });
    assert.equal(place.vehicle, "transit");
    assert.equal(schoolShuttleName("어린이집 버스 안"), "shuttle");
    assert.match(joined(vehicleInteriorLines(place.vehicle!, "어린이집 버스 안", true)), /small child-size seat belt/);
    // '노란 버스 안'은 설명의 어린이집 말로 쪽 그림은 통학 버스가 돼도, 시트는 시내버스와 같은 열쇠라 보통 버스 실내다.
    assert.equal(pageVehicle({ locationName: "노란 버스 안", locationDescription: "어린이집 아이들이 앉는 낮은 좌석" }).schoolBus, true);
    assert.equal(schoolShuttleName("노란 버스 안"), null);
    assert.equal(locationKeyOf("노란 버스 안"), locationKeyOf("시내버스 안"));
  });
});

describe("검수 줄 — 통학 버스는 벨트로 떨어뜨리지 않는다", () => {
  const shuttle = pageVehicle({ locationName: "어린이집 버스 안", locationDescription: "노란 좌석 줄과 넓은 창", sceneBody: "하온이는 창가 자리에 앉는다.", storyText: VINEYARD_TRIP });
  const city = pageVehicle({ locationName: "시내버스 안", sceneBody: "하온이는 창가 자리에 앉는다.", storyText: "하온이는 엄마랑 시내버스를 탔어요." });

  it("통학 버스: 벨트 FAIL 없음, 벨트가 안 보여도 FAIL 아님, 교실 FAIL·서 있는 사람 벨트 FAIL 은 그대로", () => {
    const lines = checkRuleLines({ hero: { name: "하온", gender: "boy" }, page: shuttle, storyText: VINEYARD_TRIP });
    const out = joined(lines);
    assert.doesNotMatch(out, /FAIL if anyone wears a seat belt/);
    assert.match(out, /children wearing seat belts in their seats is correct and never a FAIL/);
    assert.match(out, /do not FAIL the page because a belt is missing, hidden or hard to see/);
    // 새 FAIL 은 없다 — 통학 버스 줄은 FAIL 을 '하지 말라'고만 한다.
    const shuttleLine = lines.find((line) => /shuttle bus/.test(line)) ?? "";
    assert.doesNotMatch(shuttleLine, /FAIL if/);
    assert.match(out, /FAIL if a person who is STANDING wears a seat belt/);
    assert.match(out, /drawn in a classroom, a house room or another building instead of inside the vehicle/);
  });

  it("시내버스: 벨트를 매면 FAIL 그대로", () => {
    assert.match(joined(checkRuleLines({ page: city })), /This page is on a bus, train or subway: FAIL if anyone wears a seat belt or sits in a child car seat/);
  });
});

/*
 * 그대로 — 통학 버스가 아닌 쪽의 줄을 글자 그대로 적어 둔다.
 */
describe("통학 버스가 아닌 쪽은 한 글자도 그대로", () => {
  const SAFETY_BASE = [
    "CHILD SAFETY — a small child copies what they see in a picture book. Never draw a child in a posture that would be dangerous in real life.",
    "Never draw a child standing on a sofa, chair, table, window sill, railing or stair rail. If the text says they jumped up or sprang up, draw them standing on the floor or sitting up on the seat.",
  ];
  const STANDING = "A person who is STANDING never wears a seat belt.";
  const PUBLIC = "PUBLIC TRANSPORT — this scene is on a bus, train or subway, NOT in a car. Draw NO seat belts and NO child car seats on anyone. People sit on ordinary seats, or stand holding a handrail or strap.";
  const CHECK_STANDING = "FAIL if a person who is STANDING wears a seat belt.";
  const CHECK_TRANSIT = "This page is on a bus, train or subway: FAIL if anyone wears a seat belt or sits in a child car seat.";
  const CHECK_ROOM = "FAIL if the characters are drawn in a classroom, a house room or another building instead of inside the vehicle. Scenery through the vehicle windows is correct and is not a FAIL.";
  const interior = (place: string, what: string, room: string) => [
    `VEHICLE INTERIOR — "${place}" is the inside of ${what} on the move, NOT a building and NOT a room. Draw its seats, its ${room} and its side windows, seen from inside.`,
    "No classroom, no house room, no desks, no shelves, no toy storage and no room furniture anywhere in it.",
    "The passing scenery outside (trees, fields, streets) may show clearly through the windows, but everyone stays inside the vehicle.",
    "PRESENT-DAY KOREA — a modern vehicle interior, with modern scenery outside.",
  ];

  for (const [label, locationName, storyText] of [
    ["시내버스", "시내버스 안", "하온이는 엄마랑 시내버스를 탔어요."],
    ["맨 버스 + 어린이집 친구들", "버스 안", VINEYARD_TRIP],
    ["기차", "기차 안", "기차를 탔어요. 창밖에 눈이 펑펑 내렸어요."],
    ["지하철", "지하철 안", "하온이는 엄마랑 지하철을 탔어요."],
  ] as const) {
    it(`${label}: 안전 줄 · 검수 줄 · 배경 줄`, () => {
      const page = pageVehicle({ locationName, sceneBody: "하온이는 창가 자리에 앉는다.", storyText });
      assert.equal(page.schoolBus, false);
      assert.deepEqual(safetyRuleLines(page, null), [...SAFETY_BASE, STANDING, PUBLIC]);
      assert.deepEqual(checkRuleLines({ page }), [CHECK_STANDING, CHECK_TRANSIT, CHECK_ROOM]);
      assert.deepEqual(vehicleInteriorLines(page.vehicle!, locationName, page.schoolBus), interior(locationName, "a bus, train or subway", "aisle and floor"));
    });
  }

  it("2층 버스 위층: 지붕 없는 위층 줄, 교실 FAIL 없음", () => {
    const page = pageVehicle({ locationName: "2층 관광버스 위층", locationDescription: "지붕 없는 위층과 노란 좌석", sceneBody: "셋이 위층 앞자리에 앉는다.", storyText: "2층 관광버스 위층 앞자리에 셋이 나란히 앉았다." });
    assert.equal(page.schoolBus, false);
    assert.deepEqual(safetyRuleLines(page, null), [
      ...SAFETY_BASE,
      STANDING,
      PUBLIC,
      "This is the OPEN upper deck of a double-decker sightseeing tour bus: rows of ordinary seats under open sky with a low side rail — no roof, no ceiling straps, no seat belts, no car seats.",
    ]);
    assert.deepEqual(checkRuleLines({ page }), [CHECK_STANDING, CHECK_TRANSIT]);
  });

  it("승용차(아빠 차): 승용차 줄 그대로, 벨트 FAIL 없음", () => {
    const page = pageVehicle({ locationName: "아빠 차", locationDescription: "창밖으로 흐르는 바다 풍경", sceneBody: "하온이가 창밖을 보며 웃는다.", storyText: "아빠 차를 타고 바다로 갔어요." });
    assert.equal(page.schoolBus, false);
    assert.deepEqual(safetyRuleLines(page, null), [
      ...SAFETY_BASE,
      STANDING,
      "In a moving car the child is seated facing FORWARD in a rear seat with the seat belt clearly fastened across their chest and lap (or strapped into a child seat). Never draw a child kneeling, standing, turned backwards, leaning out, or without a visible belt while the car is moving. Adults in the car wear their belts too.",
      "Korean cars are LEFT-hand drive: the steering wheel and the driver are on the LEFT side of the car.",
      "Inside a car, shoes stay ON.",
      "CAR INTERIOR — this scene happens inside a moving car. Car cabins are the easiest place to draw wrong, so follow these exactly.",
      "SEATS: a Korean car is LEFT-hand drive. The driver sits in the FRONT-LEFT seat with both hands on the steering wheel. The front passenger sits FRONT-RIGHT. Children sit in the REAR seats, never in front.",
      "ONE PERSON PER SEAT, and every person sits properly ON a seat — never between two seats, never floating in the aisle, never half in the front row and half in the back. Draw the seat backs and headrests clearly so it is obvious which row each person is in.",
      "FRAME IT CLOSE ON THE CHILD. Put the camera inside the cabin beside the child in the rear seat, close enough that the child fills much of the picture. Adults appear only partly — the back of a head, a shoulder, or a face turned in profile past the front seat back. Do not attempt a wide view of the whole cabin with every passenger fully visible.",
      "Everyone wears a seat belt, clearly visible across chest and lap. The child faces FORWARD, seated, belt fastened. Never kneeling, standing, turned around, or leaning out of a window.",
      "EACH PERSON APPEARS EXACTLY ONCE IN THE CAR. An adult who is in a front seat must NOT also appear in the back seat, and vice versa. Count the people before you finish: the picture contains each named person one single time.",
      "The window shows the passing scenery outside; do not draw a second car interior, a mirrored cabin, or a doubled row of seats.",
    ]);
    assert.deepEqual(checkRuleLines({ page }), [CHECK_STANDING]);
    assert.deepEqual(vehicleInteriorLines("car", "아빠 차", page.schoolBus), interior("아빠 차", "a car", "cabin"));
  });

  it("탈것 아닌 쪽(거실 · 버스에서 내린 마당)", () => {
    const living = pageVehicle({ locationName: "거실", locationDescription: "밝은 나무 마루", sceneBody: "하온이가 블록을 쌓는다.", storyText: "하온이는 블록을 높이 쌓았어요." });
    assert.deepEqual(safetyRuleLines(living, true), [
      ...SAFETY_BASE,
      "Indoors at home Koreans do not wear shoes, and shoes are left at the entrance, not in the middle of the living room.",
    ]);
    assert.deepEqual(checkRuleLines({ page: living }), []);
    const yard = pageVehicle({ locationName: "포도밭", sceneBody: "하온이가 포도밭 입구에 선다.", storyText: "어린이집 버스에서 내려 포도밭으로 뛰어갔어요." });
    assert.deepEqual(safetyRuleLines(yard, false), [
      ...SAFETY_BASE,
      STANDING,
      "ALREADY OFF THE VEHICLE — the text says they have already GOT OFF. Draw them standing or walking at the place they arrived, off the vehicle. No bus, train, subway or car interior, no vehicle seats, NO seat belts, NO car seats.",
    ]);
    assert.deepEqual(checkRuleLines({ page: yard }), [
      CHECK_STANDING,
      "The story text says they have already GOT OFF the vehicle: FAIL if they are drawn inside a bus, train, subway or car interior, or sitting in vehicle seats.",
    ]);
  });
});
