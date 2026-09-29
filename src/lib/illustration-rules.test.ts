import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkRuleLines,
  genderFromDescription,
  heroFromStory,
  heroLockLines,
  pageVehicle,
  readHero,
  safetyRuleLines,
  vehicleInteriorLines,
} from "./illustration-rules.ts";

/*
 * 쪽 그림 프롬프트에 어떤 규칙 줄이 붙고 안 붙는지.
 * 장면은 실제로 틀리게 나온 책(my-mu0issap)의 쪽들을 본떴다.
 */

const joined = (lines: string[]) => lines.join("\n");
const BELT_FOR_CAR = /seat belt clearly fastened|Everyone wears a seat belt/;
const LEFT_HAND = /LEFT-hand drive/;
const SHOES_IN_CAR = /Inside a car, shoes stay ON/;
const NO_BELTS = /NO seat belts/;

const busPage = pageVehicle({
  locationName: "2층 관광버스 위층",
  locationDescription: "지붕 없는 위층과 노란 좌석",
  sceneBody: "하온이와 엄마 아빠가 위층 앞자리에 나란히 앉아 남산을 본다.",
  storyText: "2층 관광버스 위층 앞자리에 셋이 나란히 앉았다. 남산이 보였어요.",
});
const carPage = pageVehicle({
  locationName: "자동차 안",
  locationDescription: "뒷좌석과 창문",
  sceneBody: "하온이가 뒷좌석 카시트에 앉아 창밖을 본다.",
  storyText: "하온이는 엄마 아빠와 함께 차를 타고 할머니 댁으로 떠났어요.",
});
const yardPage = pageVehicle({
  locationName: "경복궁 앞마당",
  locationDescription: "넓은 흙마당과 커다란 나무 문",
  sceneBody: "하온이가 마당을 걷는다.",
  storyText: "하온이는 관광버스를 타고 온 길을 떠올리며 넓은 마당을 걸었어요.",
  bookContext: "2층 관광버스 위층은 노란 좌석 · 경복궁은 커다란 나무 문",
});
const gotOffPage = pageVehicle({
  // 옛 판정이 박아 둔 틀린 장소 줄 그대로
  locationName: "버스에서",
  locationDescription: "나란히 놓인 좌석과 천장 손잡이, 창밖 풍경이 흐르는 차량 안",
  sceneBody: "셋이 커다란 문을 지난다.",
  storyText: "버스에서 내려 커다란 문을 지나자 한복 입은 사람들이 보였어요.",
});

describe("pageVehicle — 이 쪽이 어느 탈것 안인가", () => {
  it("관광버스 위층은 대중교통, 지붕 없는 위층", () => {
    assert.equal(busPage.vehicle, "transit");
    assert.equal(busPage.openDeck, true);
  });

  it("자동차 뒷좌석은 승용차", () => {
    assert.equal(carPage.vehicle, "car");
  });

  it("마당 장면은 본문에 '버스'가 스쳐도 탈것이 아니다", () => {
    assert.equal(yardPage.vehicle, null);
    assert.equal(yardPage.vehicleNearby, true);
  });

  it("버스에서 내린 쪽 — 탈것 아님, 내림, 장소 줄은 틀린 것", () => {
    assert.equal(gotOffPage.vehicle, null);
    assert.equal(gotOffPage.gotOff, true);
    assert.equal(gotOffPage.staleVehicleLocation, true);
  });

  it("장소 줄이 모르는 곳(도로)이면 장면 문장을 본다", () => {
    const page = pageVehicle({ locationName: "고속도로", locationDescription: "", sceneBody: "하온이가 뒷좌석에서 창밖을 본다.", storyText: "" });
    assert.equal(page.vehicle, "car");
  });

  it("거실 장면은 본문 낱말 '차를 타고'로 차 안이 되지 않는다", () => {
    const page = pageVehicle({ locationName: "거실", locationDescription: "밝은 나무 마루", sceneBody: "하온이가 가방을 싼다.", storyText: "내일은 차를 타고 바다에 갈 거예요." });
    assert.equal(page.vehicle, null);
  });
});

describe("safetyRuleLines — 어떤 줄이 붙고 안 붙나", () => {
  it("버스 장면: 벨트·카시트 금지가 붙고, 승용차 벨트·왼쪽 핸들·차 안 신발은 안 붙는다", () => {
    const out = joined(safetyRuleLines(busPage, null));
    assert.match(out, NO_BELTS);
    assert.match(out, /NO child car seats/);
    assert.match(out, /OPEN upper deck/);
    assert.doesNotMatch(out, BELT_FOR_CAR);
    assert.doesNotMatch(out, LEFT_HAND);
    assert.doesNotMatch(out, SHOES_IN_CAR);
    assert.doesNotMatch(out, /CAR INTERIOR/);
  });

  it("승용차 장면: 벨트·왼쪽 핸들·차 안 신발·좌석 규칙이 붙는다", () => {
    const out = joined(safetyRuleLines(carPage, null));
    assert.match(out, BELT_FOR_CAR);
    assert.match(out, LEFT_HAND);
    assert.match(out, SHOES_IN_CAR);
    assert.match(out, /CAR INTERIOR/);
    assert.doesNotMatch(out, /PUBLIC TRANSPORT/);
  });

  it("마당 장면: 차 규칙 없음, 탈것 아님을 일러 준다", () => {
    const out = joined(safetyRuleLines(yardPage, false));
    assert.doesNotMatch(out, BELT_FOR_CAR);
    assert.doesNotMatch(out, LEFT_HAND);
    assert.doesNotMatch(out, /CAR INTERIOR/);
    assert.match(out, /NOT inside any vehicle/);
  });

  it("버스에서 내린 장면: 바깥에, 탈것 실내 없음", () => {
    const out = joined(safetyRuleLines(gotOffPage, null));
    assert.match(out, /ALREADY OFF THE VEHICLE/);
    assert.doesNotMatch(out, BELT_FOR_CAR);
    assert.doesNotMatch(out, /PUBLIC TRANSPORT/);
  });

  it("탈것 이야기가 없는 책(거실)에는 벨트 말을 아예 꺼내지 않는다 — 서 있는 사람 줄만", () => {
    const page = pageVehicle({ locationName: "거실", locationDescription: "밝은 나무 마루", sceneBody: "하온이가 블록을 쌓는다.", storyText: "하온이는 블록을 높이 쌓았어요." });
    const out = joined(safetyRuleLines(page, true));
    assert.doesNotMatch(out, /NOT inside any vehicle/);
    assert.doesNotMatch(out, BELT_FOR_CAR);
    assert.match(out, /Indoors at home Koreans do not wear shoes/);
  });

  it("버스·차 안은 실내로 잡혀도 '집 안에서는 신발을 벗는다' 줄이 붙지 않는다", () => {
    const bus = pageVehicle({ locationName: "어린이집 버스 안", locationDescription: "노란 좌석 줄과 넓은 창", sceneBody: "하온이는 창가 자리에 앉는다.", storyText: "하온이는 버스에 올라탔어요." });
    assert.equal(bus.vehicle, "transit");
    assert.doesNotMatch(joined(safetyRuleLines(bus, true)), /Indoors at home Koreans do not wear shoes/);
    const car = joined(safetyRuleLines(carPage, true));
    assert.doesNotMatch(car, /Indoors at home Koreans do not wear shoes/);
    assert.match(car, SHOES_IN_CAR);
  });

  it("탈것 안 배경 줄 — 건물·교실이 아니라 탈것 실내, 창밖 풍경은 크게 보여도 된다", () => {
    const bus = joined(vehicleInteriorLines("transit", "어린이집 버스 안"));
    assert.match(bus, /"어린이집 버스 안" is the inside of a bus, train or subway/);
    assert.match(bus, /NOT a building and NOT a room/);
    assert.match(bus, /No classroom/);
    assert.match(bus, /may show clearly through the windows/);
    assert.doesNotMatch(bus, /INSIDE a building|small view through a window/);
    assert.match(joined(vehicleInteriorLines("car", "아빠 차")), /inside of a car/);
  });

  it("어느 장면이든: 가구 위에 서지 않기, 서 있는 사람은 벨트 없음", () => {
    for (const page of [busPage, carPage, yardPage, gotOffPage]) {
      const out = joined(safetyRuleLines(page, null));
      assert.match(out, /Never draw a child standing on a sofa/);
      assert.match(out, /STANDING never wears a seat belt/);
    }
  });
});

describe("heroLockLines — 주인공 성별·생김새 고정", () => {
  it("남자아이: 성별, 긴 머리·단발 금지, 머리 장식 금지, 남의 소품 옮기지 않기", () => {
    const out = joined(heroLockLines({ name: "하온", gender: "boy", looks: "short black bowl-cut hair" }));
    assert.match(out, /하온 IS A BOY/);
    assert.match(out, /bob-cut/);
    assert.match(out, /NO hair clips, NO flowers, NO ribbons/);
    assert.match(out, /short black bowl-cut hair/);
    assert.match(out, /Never move them onto 하온/);
  });

  it("성별을 모르면 성별 낱말 없이 머리 모양·길이만", () => {
    const out = joined(heroLockLines({ name: "하온" }));
    assert.doesNotMatch(out, /\bBOY\b|\bGIRL\b/);
    assert.match(out, /hair shape and hair length exactly as on the sheet/);
  });

  it("주인공이 없으면 줄도 없다", () => {
    assert.deepEqual(heroLockLines(null), []);
  });
});

describe("readHero · heroFromStory — 주인공 정보가 없던 옛 책", () => {
  const cast = [
    { name: "하온", description: "짧은 검은 바가지 머리에 노란 반팔을 입은 남자아이" },
    { name: "엄마", description: "긴 머리" },
  ];

  it("요청에 hero 가 있으면 그대로", () => {
    assert.deepEqual(readHero({ name: "하온", gender: "boy", looks: "short hair" }, cast), { name: "하온", gender: "boy", looks: "short hair" });
  });

  it("없으면 cast 첫 사람과 설명으로 물러서고, 설명에서 성별을 짐작한다", () => {
    const hero = readHero(undefined, cast);
    assert.equal(hero?.name, "하온");
    assert.equal(hero?.gender, "boy");
    assert.match(hero?.looks ?? "", /바가지 머리/);
  });

  it("설명에 성별이 없으면 성별을 박지 않는다", () => {
    assert.equal(genderFromDescription("노란 반팔, 하늘색 반바지"), undefined);
    assert.equal(genderFromDescription("여자아이와 남자아이"), undefined);
  });

  it("만들기 화면: unspecified 는 싣지 않는다", () => {
    assert.deepEqual(heroFromStory([{ name: "하온" }], "unspecified", ""), { name: "하온" });
    assert.deepEqual(heroFromStory([{ name: "하온" }], "boy", "short hair"), { name: "하온", gender: "boy", looks: "short hair" });
    assert.equal(heroFromStory([], "boy", ""), undefined);
  });
});

describe("checkRuleLines — 검수에 붙는 FAIL 규칙은 좁게", () => {
  it("버스 장면 + 남자아이: 성별·머리 장식, 서 있는 사람 벨트, 대중교통 벨트", () => {
    const out = joined(checkRuleLines({ hero: { name: "하온", gender: "boy" }, page: busPage }));
    assert.match(out, /a BOY/);
    assert.match(out, /hair clip, flower, ribbon/);
    assert.match(out, /STANDING wears a seat belt/);
    assert.match(out, /bus, train or subway: FAIL if anyone wears a seat belt/);
    // 지붕 없는 위층은 바깥이다 — '교실로 그리면 FAIL'은 닫힌 탈것 안에만 붙인다.
    assert.doesNotMatch(out, /instead of inside the vehicle/);
  });

  it("버스 안 쪽: 교실·방으로 그리면 FAIL, 창밖 풍경은 FAIL 아님", () => {
    const page = pageVehicle({ locationName: "어린이집 버스 안", locationDescription: "노란 좌석 줄과 넓은 창", sceneBody: "하온이는 창가 자리에 앉는다.", storyText: "하온이는 버스에 올라탔어요. 창밖으로 나무들이 휙휙 지나갔어요." });
    const out = joined(checkRuleLines({ page }));
    assert.match(out, /drawn in a classroom, a house room or another building instead of inside the vehicle/);
    assert.match(out, /Scenery through the vehicle windows is correct/);
  });

  it("내린 장면: 탈것 실내면 FAIL", () => {
    const out = joined(checkRuleLines({ hero: null, page: gotOffPage }));
    assert.match(out, /already GOT OFF/);
  });

  it("승용차 장면에는 벨트 금지 규칙을 붙이지 않는다", () => {
    const out = joined(checkRuleLines({ hero: null, page: carPage }));
    assert.doesNotMatch(out, /FAIL if anyone wears a seat belt/);
    assert.doesNotMatch(out, /not inside a vehicle/);
  });

  it("주인공이 이 쪽에 없으면 주인공 규칙은 없다", () => {
    const out = joined(checkRuleLines({ hero: null, page: yardPage }));
    assert.doesNotMatch(out, /main child/);
    assert.match(out, /not inside a vehicle/);
  });
});

/*
 * 2차 검토 — 맞는 그림을 떨어뜨리거나, 진짜 차 안에서 벨트가 사라지는 경우.
 */
describe("pageVehicle — 2차 검토에서 잡힌 경우", () => {
  it("버스 위층에서 '내려다보니' — 내린 게 아니다. 장소 잠금을 버리지 않는다", () => {
    const page = pageVehicle({
      locationName: "2층 서울시티투어버스 위층",
      locationDescription: "지붕 없는 위층과 노란 좌석",
      sceneBody: "셋이 위층 좌석에 앉아 남산 타워를 본다.",
      storyText: "2층 버스에서 내려다보니 남산 타워가 보였어요.",
    });
    assert.equal(page.gotOff, false);
    assert.equal(page.staleVehicleLocation, false);
    assert.equal(page.vehicle, "transit");
    assert.doesNotMatch(joined(checkRuleLines({ page })), /already GOT OFF/);
  });

  it("케이블카에서 내려다보니 — 케이블카 안 그대로", () => {
    const page = pageVehicle({ locationName: "케이블카 안", sceneBody: "케이블카에서 내려다보니 바다가 반짝인다.", storyText: "" });
    assert.equal(page.staleVehicleLocation, false);
    assert.equal(page.vehicle, "transit");
  });

  it("본문은 내렸다는데 장면 문장이 버스에 앉아 있다 — 장소 줄(버스)을 믿는다", () => {
    const page = pageVehicle({
      locationName: "2층 관광버스 위층",
      sceneBody: "하온이가 버스 좌석에 앉아 손을 흔든다.",
      storyText: "조금 뒤 버스에서 내렸어요.",
    });
    assert.equal(page.staleVehicleLocation, false);
  });

  it("부사가 낀 '버스에서 천천히 내려' — 장소 줄이 버스여도 틀린 줄로 본다", () => {
    const page = pageVehicle({
      locationName: "버스에서",
      locationDescription: "나란히 놓인 좌석과 손잡이, 대중교통 안",
      sceneBody: "셋이 커다란 문을 지난다.",
      storyText: "버스에서 천천히 내려 커다란 문을 지나자 한복 입은 사람들이 보였어요.",
    });
    assert.equal(page.gotOff, true);
    assert.equal(page.staleVehicleLocation, true);
    assert.doesNotMatch(joined(safetyRuleLines(page, null)), /PUBLIC TRANSPORT/);
  });

  it("장소 이름 '아빠 차' — 승용차 벨트 규칙이 붙고 '벨트 없음'은 안 붙는다", () => {
    const page = pageVehicle({
      locationName: "아빠 차",
      locationDescription: "창밖으로 흐르는 바다 풍경",
      sceneBody: "하온이가 창밖을 보며 웃는다.",
      storyText: "아빠 차를 타고 바다로 갔어요.",
    });
    assert.equal(page.vehicle, "car");
    assert.match(joined(safetyRuleLines(page, null)), BELT_FOR_CAR);
    assert.doesNotMatch(joined(checkRuleLines({ page })), /not inside a vehicle/);
  });

  it("'할머니 댁 가는 길' + 본문 '뒷자리에서 창밖' — 길은 머무는 곳이 아니라 차 안으로 본다", () => {
    const page = pageVehicle({ locationName: "할머니 댁 가는 길", sceneBody: "하온이가 창밖을 본다.", storyText: "뒷자리에서 창밖을 봤어요." });
    assert.equal(page.vehicle, "car");
  });

  it("장소 줄 없는 쪽: 장난감 자동차 · 녹차 — 차 안이 아니다", () => {
    for (const storyText of ["하온이는 장난감 자동차를 가지고 놀았어요.", "따뜻한 녹차에서 김이 났어요."]) {
      const out = joined(safetyRuleLines(pageVehicle({ storyText }), true));
      assert.doesNotMatch(out, /CAR INTERIOR/, storyText);
    }
  });

  it("거리에 택시가 지나가도, 창밖으로 버스가 지나가도 탈것 안이 아니다", () => {
    assert.equal(pageVehicle({ locationName: "큰길", sceneBody: "빨간 택시가 지나가는 거리에서 하온이가 손을 흔든다." }).vehicle, null);
    assert.equal(pageVehicle({ locationName: "도로", sceneBody: "창밖으로 버스가 지나가는 것을 보는 하온이." }).vehicle, null);
  });

  it("보통 관광버스 안은 지붕 없는 위층이 아니다 · '2층 집'은 버스와 무관하다", () => {
    assert.equal(pageVehicle({ locationName: "관광버스 안", sceneBody: "하온이가 창밖을 본다." }).openDeck, false);
    assert.equal(
      pageVehicle({ locationName: "지하철 안", storyText: "2층 집에 사는 할머니를 만나러 지하철을 탔어요." }).openDeck,
      false,
    );
  });

  it("거실 장면인데 장면 문장이 뒷좌석이라고 하면 '벨트 없음'을 박지 않는다", () => {
    const page = pageVehicle({ locationName: "거실", sceneBody: "하온이가 뒷좌석에서 창밖을 본다.", storyText: "" });
    assert.equal(page.vehicle, null);
    assert.equal(page.vehicleNearby, false);
  });
});

describe("안전 줄 — 탈것 이야기가 없으면 'seat belt' 낱말을 꺼내지 않는다", () => {
  it("옛이야기 쪽(탈것 없음)", () => {
    const page = pageVehicle({ storyText: "나무꾼은 연못가에서 도끼를 떨어뜨렸어요." });
    assert.doesNotMatch(joined(safetyRuleLines(page, null)), /seat belt/i);
    assert.doesNotMatch(joined(checkRuleLines({ page })), /seat belt/i);
  });
});

describe("주인공 장식 — 본문이 직접 씌우면 금지·FAIL 에서 뺀다", () => {
  const hero = { name: "하온", gender: "boy" as const };
  const text = "하온이도 친구가 준 꽃을 머리에 꽂았어요.";

  it("프롬프트: 꽃 금지 문장이 빠지고 본문 장식만 허락", () => {
    const out = joined(heroLockLines(hero, text));
    assert.doesNotMatch(out, /NO flowers/);
    assert.match(out, /only the head accessory that the story text itself puts on 하온/);
  });

  it("검수: 장식 FAIL 이 빠진다", () => {
    const out = joined(checkRuleLines({ hero, storyText: text }));
    assert.doesNotMatch(out, /hair clip, flower/);
    assert.match(out, /bob-cut/);
  });

  it("다른 사람이 꽃을 단 쪽은 그대로 금지", () => {
    const other = "분홍 저고리, 머리에 꽃을 단 아이까지 있었어요. 하온이는 눈이 동그래졌어요.";
    assert.match(joined(heroLockLines(hero, other)), /NO flowers/);
    assert.match(joined(checkRuleLines({ hero, storyText: other })), /hair clip, flower/);
  });
});
