import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { currentReadingChunk, readingChunks, splitStorySentences } from "./reading-chunks.ts";

describe("readingChunks", () => {
  it("자막으로 나눠도 원문이 정확히 유지된다", () => {
    const text = "드디어 공연장에 도착했어요! 커다란 무대와 반짝이는 조명이 하온이를 반겨 주었어요.";
    assert.equal(readingChunks(text, 24).map((chunk) => chunk.text).join(""), text);
  });

  it("긴 문장은 쉼표나 공백 가까이에서 짧게 나눈다", () => {
    const text = "누나와 형들이 신나는 음악에 맞추어 춤을 추자, 하온이도 엄마와 함께 손뼉을 쳤어요.";
    const chunks = readingChunks(text, 28);
    assert.ok(chunks.length > 1);
    assert.ok(chunks.every((chunk) => chunk.text.length <= 28));
  });

  it("현재 읽은 글자 위치에 맞는 자막만 고른다", () => {
    const text = "첫 번째 문장이에요. 두 번째 문장이에요.";
    const secondStart = splitStorySentences(text)[0].length;
    assert.match(currentReadingChunk(text, secondStart).text, /두 번째/);
  });
});
