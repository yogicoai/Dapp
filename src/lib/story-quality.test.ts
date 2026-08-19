import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isBlockingStoryQualityIssue, repairStoryContinuity, validateStoryQuality } from "./story-quality.ts";
import type { ParsedStory } from "./story-format.ts";

const direction = { narration: "normal", dialogue: "happy", intensity: 0.8, pace: "normal" } as const;

function story(texts: string[]): ParsedStory {
  return {
    title: "민이의 별빛 산책",
    summary: "민이가 친구와 별빛을 만나요.",
    characters: [{ name: "민이", description: "노란 모자를 쓴 아이" }],
    pages: texts.map((text, index) => ({ pageNo: index + 1, text, imagePrompt: "등장인물 1명: 민이. 장소: 별빛 숲길 — 푸른 나무와 둥근 돌길. 민이가 별빛 길을 걷는다.", voiceDirection: direction })),
  };
}

describe("validateStoryQuality", () => {
  it("정상적인 아동용 페이지는 통과한다", () => {
    const result = validateStoryQuality(story([
      "민이는 친구와 별빛 길을 천천히 걸었어요. 작은 별 하나가 두 사람 앞에서 반짝였어요.",
      "두 친구는 길을 잃은 별을 하늘로 돌려보냈어요. 그리고 환하게 웃으며 집으로 돌아왔어요.",
    ]), { childName: "민이", age: 6, expectedPages: 2 });
    assert.deepEqual(result, []);
  });

  it("중복 페이지와 누락된 이름을 함께 잡는다", () => {
    const duplicate = "친구는 숲길에서 작은 별을 발견했어요. 별은 집으로 돌아가고 싶다고 말했어요.";
    const result = validateStoryQuality(story([duplicate, duplicate]), { childName: "수아", age: 6, expectedPages: 2 });
    assert.ok(result.some((item) => item.includes("주인공 이름")));
    assert.ok(result.some((item) => item.includes("중복")));
  });

  it("본문의 친구가 삽화 설명에서 빠지면 실패한다", () => {
    const value = story(["민이는 태이와 블록을 만들며 환하게 웃었어요. 두 친구는 정말 즐거웠어요."]);
    value.characters.push({ name: "태이", description: "초록색 옷을 입은 친구" });
    const result = validateStoryQuality(value, { childName: "민이", age: 6, expectedPages: 1 });
    assert.ok(result.some((item) => item.includes("누락된 본문 인물: '태이'")));
  });

  it("같은 장소의 고정 특징이 페이지마다 바뀌면 실패한다", () => {
    const value = story([
      "민이는 놀이방에서 블록을 높이 쌓았어요. 알록달록한 집이 완성됐어요.",
      "민이는 놀이방에서 완성된 집을 보며 환하게 웃었어요. 정말 뿌듯했어요.",
    ]);
    value.pages[1].imagePrompt = "등장인물 1명: 민이. 장소: 별빛 숲길 — 붉은 벽과 유리 바닥. 민이가 웃는다.";
    const result = validateStoryQuality(value, { childName: "민이", age: 6, expectedPages: 2 });
    assert.ok(result.some((item) => item.includes("고정 특징이 바뀌었습니다")));
  });

  it("이동 설명 없이 다음 페이지 장소가 바뀌면 실패한다", () => {
    const value = story([
      "민이는 놀이방에서 블록을 쌓으며 즐겁게 웃었어요. 멋진 집이 완성됐어요.",
      "민이는 미끄럼틀 옆에서 손뼉을 쳤어요. 오늘도 정말 즐거웠어요.",
    ]);
    value.pages[1].imagePrompt = "등장인물 1명: 민이. 장소: 동네 놀이터 — 노란 미끄럼틀과 둥근 모래밭. 민이가 손뼉을 친다.";
    const result = validateStoryQuality(value, { childName: "민이", age: 6, expectedPages: 2 });
    assert.ok(result.some((item) => item.includes("이동 과정이 없습니다")));
  });

  it("본문에 이동 과정이 있으면 장소 전환을 허용한다", () => {
    const value = story([
      "민이는 놀이방에서 블록을 정리했어요. 엄마와 놀이터로 가기로 했어요.",
      "놀이터에 도착한 민이는 노란 미끄럼틀 옆에서 손뼉을 치며 환하게 웃었어요.",
    ]);
    value.pages[1].imagePrompt = "등장인물 1명: 민이. 장소: 동네 놀이터 — 노란 미끄럼틀과 둥근 모래밭. 민이가 손뼉을 친다.";
    const result = validateStoryQuality(value, { childName: "민이", age: 6, expectedPages: 2 });
    assert.ok(!result.some((item) => item.includes("이동 과정이 없습니다")));
  });

  it("이동 없는 장소 변경은 이전 장소로 자동 보정한다", () => {
    const value = story([
      "민이는 놀이방에서 블록을 쌓았어요. 멋진 집이 완성되어 환하게 웃었어요.",
      "민이는 완성한 블록 집을 보며 손뼉을 쳤어요. 정말 마음에 들었어요.",
    ]);
    value.pages[1].imagePrompt = "등장인물 1명: 민이. 장소: 낯선 공원 — 큰 미끄럼틀. 민이가 손뼉을 친다.";
    const repaired = repairStoryContinuity(value);
    assert.ok(repaired.pages[1].imagePrompt.includes("장소: 놀이방 —"));
    assert.ok(!repaired.pages[1].imagePrompt.includes("낯선 공원"));
  });

  it("본문의 집과 이미지 지시의 숲이 충돌하면 생성 전에 집으로 교정한다", () => {
    const value = story([
      "오늘은 하온이가 손꼽아 기다리던 날이에요. 태이네 집에 놀러 가는 날이거든요.",
      "태이네 집에서 하온이와 태이는 장난감을 함께 보며 신나게 이야기했어요.",
    ]);
    value.pages[0].imagePrompt = "등장인물 2명: 하온이, 태이. 장소: 푸른 숲길 — 키 큰 나무와 꽃덤불. 두 아이가 이야기한다.";
    value.pages[1].imagePrompt = "등장인물 2명: 하온이, 태이. 장소: 푸른 숲길 — 키 큰 나무와 꽃덤불. 두 아이가 웃는다.";

    const repaired = repairStoryContinuity(value);

    assert.match(repaired.pages[0].imagePrompt, /장소: 태이네 집 —/);
    assert.match(repaired.pages[1].imagePrompt, /장소: 태이네 집 —/);
    // 친구 집도 요즘 집이어야 한다 — '놀러 간다' 장면에서 옛날 집이 제일 잘 튀어나온다.
    assert.match(repaired.pages[0].imagePrompt, /아파트|마루|소파/);
    assert.ok(repaired.pages.every((page) => !page.imagePrompt.includes("숲길")));
  });

  it("방법이나 상대방 같은 일반 단어를 집 장소로 오인하지 않는다", () => {
    const value = story([
      "민이는 좋은 방법을 생각하며 상대방의 이야기를 차분히 들었어요. 친구도 고개를 끄덕였어요.",
    ]);
    value.pages[0].imagePrompt = "등장인물 1명: 민이. 장소: 별빛 숲길 — 키 큰 나무와 둥근 돌길. 민이가 생각한다.";

    const repaired = repairStoryContinuity(value);

    assert.ok(repaired.pages[0].imagePrompt.includes("장소: 별빛 숲길"));
  });

  it("같은 물건은 처음 적은 한 줄로 되돌린다 — 아이스크림이 쪽마다 바뀌지 않게", () => {
    const value = story([
      "민이는 분홍 아이스크림을 받아 들고 활짝 웃었어요. 정말 신이 났어요.",
      "민이는 아이스크림을 한 입 먹고 눈을 동그랗게 떴어요. 참 달콤했어요.",
    ]);
    value.pages[0].imagePrompt =
      "등장인물 1명: 민이. 물건: 아이스크림 — 분홍색 동그란 덩어리 하나, 갈색 콘 위에. 민이가 웃는다.";
    // 모델이 말을 바꾼 경우 — 컵에 담긴 초코 두 덩이가 되어 다른 물건이 된다.
    value.pages[1].imagePrompt =
      "등장인물 1명: 민이. 물건: 아이스크림 — 초코색 두 덩이, 유리컵에 스프링클을 얹고. 민이가 먹는다.";

    const repaired = repairStoryContinuity(value);

    assert.match(repaired.pages[1].imagePrompt, /물건: 아이스크림 — 분홍색 동그란 덩어리 하나, 갈색 콘 위에/);
    assert.ok(!repaired.pages[1].imagePrompt.includes("스프링클"));
    // 물건 줄만 갈아 끼우고 그 쪽의 행동은 건드리지 않는다.
    assert.ok(repaired.pages[1].imagePrompt.includes("민이가 먹는다"));
  });

  it("물건이 둘이어도 각자 자기 첫 줄로 되돌린다", () => {
    const value = story([
      "민이는 노란 곰인형과 빨간 우산을 챙겼어요. 오늘은 비가 온대요.",
      "민이는 우산을 펴고 곰인형을 꼭 안았어요. 빗방울 소리가 즐거웠어요.",
    ]);
    value.pages[0].imagePrompt =
      "등장인물 1명: 민이. 물건: 곰인형 — 노란 갈색, 아이 팔만 한 크기. 물건: 우산 — 빨간색 동그란 우산 하나. 민이가 챙긴다.";
    value.pages[1].imagePrompt =
      "등장인물 1명: 민이. 물건: 곰인형 — 흰색 작은 토끼 모양. 물건: 우산 — 파란 줄무늬 우산. 민이가 안는다.";

    const repaired = repairStoryContinuity(value);

    assert.match(repaired.pages[1].imagePrompt, /물건: 곰인형 — 노란 갈색, 아이 팔만 한 크기/);
    assert.match(repaired.pages[1].imagePrompt, /물건: 우산 — 빨간색 동그란 우산 하나/);
  });

  it("처음 나오는 물건은 그대로 둔다 — 새 물건까지 옛 물건으로 바꾸지 않는다", () => {
    const value = story([
      "민이는 노란 곰인형을 안고 잠들었어요. 아주 포근한 밤이었어요.",
      "다음 날 민이는 빨간 풍선을 손에 쥐고 뛰어갔어요. 바람이 시원했어요.",
    ]);
    value.pages[0].imagePrompt = "등장인물 1명: 민이. 물건: 곰인형 — 노란 갈색, 아이 팔만 한 크기. 민이가 안는다.";
    value.pages[1].imagePrompt = "등장인물 1명: 민이. 물건: 풍선 — 빨간색 동그란 풍선 하나. 민이가 뛴다.";

    const repaired = repairStoryContinuity(value);

    assert.match(repaired.pages[1].imagePrompt, /물건: 풍선 — 빨간색 동그란 풍선 하나/);
  });

  it("자리를 옮긴 문장을 알아본다 — 못 알아보면 그림이 계속 앞 장소에 머문다", () => {
    // 실제로 겪었다: 「하얀 고래 책」은 집 식탁 장면에서도 도서관을 그렸고,
    // 「첫눈」은 눈사람을 만드는 쪽까지 거실이었다. 이동 표현을 못 잡아서다.
    const moved = [
      ["현관문을 열자 찬 바람이 들어왔어요.", "밖으로 나온 것"],
      ["집에 들어와 창가에 앉았어요.", "안으로 들어온 것"],
      ["저녁에 식탁에서 책을 펼쳤어요.", "때가 바뀐 것"],
      ["집에 오는 길에 비가 내렸어요.", "오는 길"],
      ["사흘이 지났어요.", "날이 지난 것"],
    ] as const;
    for (const [text, why] of moved) {
      const value = story(["하온이는 도서관에서 책을 빌렸어요. 파란 표지였어요.", text]);
      value.pages[0].imagePrompt = "등장인물 1명: 하온. 장소: 도서관 — 나무 책장과 큰 창문. 하온이가 책을 든다.";
      value.pages[1].imagePrompt = "등장인물 1명: 하온. 장소: 집 — 따뜻한 벽과 나무 바닥. 하온이가 앉는다.";
      const repaired = repairStoryContinuity(value);
      assert.ok(
        !repaired.pages[1].imagePrompt.includes("도서관"),
        `${why}을 못 알아봐서 앞 장소로 되돌렸다: ${text}`,
      );
    }
  });

  it("자리를 안 옮긴 문장은 앞 장소를 그대로 지킨다", () => {
    const value = story([
      "하온이는 놀이방에서 블록을 쌓았어요. 높이높이 쌓았어요.",
      "친구가 옆에 앉았어요. 둘이 함께 쌓았어요.",
    ]);
    value.pages[0].imagePrompt = "등장인물 1명: 하온. 장소: 놀이방 — 크림색 벽과 나무 마루. 하온이가 쌓는다.";
    value.pages[1].imagePrompt = "등장인물 2명: 하온, 친구. 장소: 낯선 공원 — 큰 미끄럼틀. 둘이 쌓는다.";
    const repaired = repairStoryContinuity(value);
    assert.ok(repaired.pages[1].imagePrompt.includes("놀이방"), "이동이 없는데 장소가 바뀌었다");
  });

  it("장소 권고는 제작을 막지 않고 안전·중복 오류만 막는다", () => {
    assert.equal(isBlockingStoryQualityIssue("2쪽 삽화에 고정 장소 설명이 없습니다."), false);
    assert.equal(isBlockingStoryQualityIssue("2쪽 본문이 다른 페이지와 중복됩니다."), true);
  });
});
