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
    assert.ok(repaired.pages[1].imagePrompt.includes("장소: 놀이방 — 따뜻한 벽과 나무 바닥"));
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

    assert.match(repaired.pages[0].imagePrompt, /장소: 태이네 집 — 따뜻한 벽과 나무 바닥/);
    assert.match(repaired.pages[1].imagePrompt, /장소: 태이네 집 — 따뜻한 벽과 나무 바닥/);
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

  it("장소 권고는 제작을 막지 않고 안전·중복 오류만 막는다", () => {
    assert.equal(isBlockingStoryQualityIssue("2쪽 삽화에 고정 장소 설명이 없습니다."), false);
    assert.equal(isBlockingStoryQualityIssue("2쪽 본문이 다른 페이지와 중복됩니다."), true);
  });
});
