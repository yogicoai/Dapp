import { test } from "node:test";
import assert from "node:assert/strict";
import { OPENAI_IMAGE_SIZES, generateImageOpenAI } from "./openai-image.ts";
import { imageProvider } from "./gemini.ts";

test("앱 비율은 gpt-image-1 이 받는 세 크기로만 간다", () => {
  assert.equal(OPENAI_IMAGE_SIZES["4:3"], "1536x1024");
  assert.equal(OPENAI_IMAGE_SIZES["3:4"], "1024x1536");
  assert.equal(OPENAI_IMAGE_SIZES["1:1"], "1024x1024");
});

test("IMAGE_PROVIDER 는 openai 일 때만 openai, 나머지는 gemini", () => {
  const before = process.env.IMAGE_PROVIDER;
  try {
    delete process.env.IMAGE_PROVIDER;
    assert.equal(imageProvider(), "gemini");
    process.env.IMAGE_PROVIDER = " OpenAI ";
    assert.equal(imageProvider(), "openai");
    process.env.IMAGE_PROVIDER = "gpt";
    assert.equal(imageProvider(), "gemini");
  } finally {
    if (before === undefined) delete process.env.IMAGE_PROVIDER;
    else process.env.IMAGE_PROVIDER = before;
  }
});

test("키가 없으면 503으로 알린다 — 라우트가 같은 길로 안내문을 보낸다", async () => {
  const before = process.env.OPENAI_API_KEY;
  try {
    delete process.env.OPENAI_API_KEY;
    await assert.rejects(
      () => generateImageOpenAI({ prompt: "x", aspectRatio: "1:1" }),
      (e: unknown) => (e as { status?: number }).status === 503,
    );
  } finally {
    if (before !== undefined) process.env.OPENAI_API_KEY = before;
  }
});
