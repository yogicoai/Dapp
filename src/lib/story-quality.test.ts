import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateStoryQuality } from "./story-quality.ts";
import type { ParsedStory } from "./story-format.ts";

const direction = { narration: "normal", dialogue: "happy", intensity: 0.8, pace: "normal" } as const;

function story(texts: string[]): ParsedStory {
  return {
    title: "민이의 별빛 산책",
    summary: "민이가 친구와 별빛을 만나요.",
    characters: [{ name: "민이", description: "노란 모자를 쓴 아이" }],
    pages: texts.map((text, index) => ({ pageNo: index + 1, text, imagePrompt: "별빛 길", voiceDirection: direction })),
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
});
