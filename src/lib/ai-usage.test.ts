import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  bindAiUsageSink,
  geminiPrice,
  geminiUsageRow,
  openaiImageUsageRow,
  reportAiUsage,
  resetAiUsageForTests,
  setDefaultAiUsageSink,
  settleAiUsage,
  withAiUsage,
  type AiUsageRecord,
} from "./ai-usage.ts";

const OCT = new Date("2026-10-13T03:00:00Z");

describe("가격표 — 구글 공식 가격(2026-10-09 판)", () => {
  it("그림 모델 — 이름이 비슷한 것끼리 섞이지 않는다", () => {
    assert.deepEqual(geminiPrice("gemini-3.1-flash-image", OCT), { in: 0.5, out: 3, imageOut: 60 });
    assert.deepEqual(geminiPrice("gemini-3.1-flash-lite-image", OCT), { in: 0.25, out: 1.5, imageOut: 30 });
    assert.deepEqual(geminiPrice("gemini-2.5-flash-image", OCT), { in: 0.3, out: 2.5, imageOut: 30 });
    assert.deepEqual(geminiPrice("gemini-nano-banana-2.1", OCT), { in: 1.5, out: 7.5, imageOut: 30 });
    assert.deepEqual(geminiPrice("gemini-3-pro-image", OCT), { in: 2, out: 12, imageOut: 120 });
  });

  it("글 모델 — lite 는 lite 값, 그림 값은 없다", () => {
    assert.deepEqual(geminiPrice("gemini-2.5-flash", OCT), { in: 0.3, out: 2.5 });
    assert.deepEqual(geminiPrice("gemini-2.5-flash-lite", OCT), { in: 0.1, out: 0.4 });
    assert.deepEqual(geminiPrice("gemini-3.5-flash-lite", OCT), { in: 0.3, out: 2.5 });
    assert.deepEqual(geminiPrice("gemini-3.1-flash-lite", OCT), { in: 0.25, out: 1.5 });
    assert.deepEqual(geminiPrice("gemini-3-flash-preview", OCT), { in: 0.5, out: 3 });
  });

  it("3.6·3.8 flash 는 2027-01-01 부터 값이 오른다 — 그날 값으로 계산", () => {
    assert.deepEqual(geminiPrice("gemini-3.8-flash", OCT), { in: 0.75, out: 3.75 });
    assert.deepEqual(geminiPrice("gemini-3.6-flash", new Date("2026-12-31T23:00:00Z")), { in: 0.75, out: 3.75 });
    assert.deepEqual(geminiPrice("gemini-3.6-flash", new Date("2027-01-01T00:00:00Z")), { in: 1.5, out: 7.5 });
  });

  it("앞에 models/ 가 붙어도 읽고, 가격표에 없는 모델은 null", () => {
    assert.deepEqual(geminiPrice("models/gemini-3.1-flash-image", OCT), { in: 0.5, out: 3, imageOut: 60 });
    assert.equal(geminiPrice("gemini-9-ultra", OCT), null);
    assert.equal(geminiPrice("gemini-flash-latest", OCT), null);
  });
});

describe("구글 답 → 기록 한 줄", () => {
  const image = { inlineData: { mimeType: "image/png", data: "AAAA" } };

  it("그림 한 장(3.1, 1K = 1120토큰) — 입력 값 + 그림 값", () => {
    const row = geminiUsageRow(
      "gemini-3.1-flash-image",
      "image",
      {
        modelVersion: "gemini-3.1-flash-image",
        candidates: [{ content: { parts: [image] } }],
        usageMetadata: {
          promptTokenCount: 1800,
          candidatesTokenCount: 1120,
          totalTokenCount: 2920,
          candidatesTokensDetails: [{ modality: "IMAGE", tokenCount: 1120 }],
        },
      },
      OCT,
    );
    assert.ok(row);
    assert.equal(row.provider, "gemini");
    assert.equal(row.outcome, "image");
    assert.equal(row.images, 1);
    assert.equal(row.tokensIn, 1800);
    assert.equal(row.tokensImageOut, 1120);
    assert.equal(row.tokensOut, 0);
    // 1800 × $0.50 + 1120 × $60, 100만 토큰당
    assert.equal(row.usd, 0.0681);
    assert.deepEqual((row.raw as { promptTokenCount: number }).promptTokenCount, 1800);
  });

  it("종류별 토큰을 안 갈라 줘도 그림이 온 답이면 출력 전부를 그림으로 센다(2.5 = 1290토큰 $0.039)", () => {
    const row = geminiUsageRow(
      "gemini-2.5-flash-image",
      "image",
      { candidates: [{ content: { parts: [image] } }], usageMetadata: { promptTokenCount: 0, candidatesTokenCount: 1290 } },
      OCT,
    );
    assert.equal(row?.model, "gemini-2.5-flash-image");
    assert.equal(row?.tokensImageOut, 1290);
    assert.equal(row?.usd, 0.0387);
  });

  it("그림과 함께 온 글 토큰은 글 값으로 따로 센다", () => {
    const row = geminiUsageRow(
      "gemini-3.1-flash-image",
      "image",
      {
        candidates: [{ content: { parts: [{ text: "here" }, image] } }],
        usageMetadata: {
          promptTokenCount: 1000,
          candidatesTokenCount: 1150,
          candidatesTokensDetails: [
            { modality: "TEXT", tokenCount: 30 },
            { modality: "IMAGE", tokenCount: 1120 },
          ],
        },
      },
      OCT,
    );
    assert.equal(row?.tokensOut, 30);
    assert.equal(row?.tokensImageOut, 1120);
    // 1000 × 0.5 + 30 × 3 + 1120 × 60
    assert.equal(row?.usd, 0.06779);
  });

  it("검수 — 별칭으로 불러도 실제로 답한 모델로 적고, 생각 토큰도 출력 값", () => {
    const row = geminiUsageRow(
      "gemini-flash-latest",
      "check",
      {
        modelVersion: "gemini-3.6-flash",
        candidates: [{ content: { parts: [{ text: "PASS" }] } }],
        usageMetadata: { promptTokenCount: 2500, candidatesTokenCount: 12, thoughtsTokenCount: 300 },
      },
      OCT,
    );
    assert.equal(row?.asked, "gemini-flash-latest");
    assert.equal(row?.model, "gemini-3.6-flash");
    assert.equal(row?.outcome, "text");
    assert.equal(row?.tokensOut, 312);
    // 2500 × 0.75 + 312 × 3.75
    assert.equal(row?.usd, 0.003045);
  });

  it("그림 없이 끝난 답·안전 검사로 막힌 답도 남는다(입력 값은 나간다)", () => {
    const none = geminiUsageRow(
      "gemini-3.1-flash-image",
      "image",
      { candidates: [{ content: { parts: [{ text: "sorry" }] } }], usageMetadata: { promptTokenCount: 2000, candidatesTokenCount: 8 } },
      OCT,
    );
    assert.equal(none?.outcome, "no-image");
    assert.equal(none?.images, 0);
    assert.equal(none?.usd, 0.001024);
    const blocked = geminiUsageRow(
      "gemini-3.1-flash-image",
      "image",
      { promptFeedback: { blockReason: "SAFETY" }, usageMetadata: { promptTokenCount: 2000 } },
      OCT,
    );
    assert.equal(blocked?.outcome, "blocked");
    assert.equal(blocked?.usd, 0.001);
  });

  it("가격표에 없는 모델 — 토큰은 남기고 금액은 비운다", () => {
    const row = geminiUsageRow("gemini-flash-latest", "check", { usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 5 } }, OCT);
    assert.equal(row?.model, "gemini-flash-latest");
    assert.equal(row?.tokensIn, 100);
    assert.equal(row?.usd, null);
  });

  it("셀 것이 없는 답(usageMetadata 없음)은 줄을 만들지 않는다", () => {
    assert.equal(geminiUsageRow("gemini-3.1-flash-image", "image", { candidates: [] }, OCT), null);
    assert.equal(geminiUsageRow("gemini-3.1-flash-image", "image", null, OCT), null);
  });

  it("OpenAI 그림 — 토큰만 남기고 금액은 비운다", () => {
    const row = openaiImageUsageRow("gpt-image-1", { data: [{ b64_json: "AAAA" }], usage: { input_tokens: 900, output_tokens: 1056 } });
    assert.equal(row?.provider, "openai");
    assert.equal(row?.tokensIn, 900);
    assert.equal(row?.tokensImageOut, 1056);
    assert.equal(row?.images, 1);
    assert.equal(row?.usd, null);
    assert.equal(openaiImageUsageRow("gpt-image-1", { data: [{ b64_json: "AAAA" }] }), null);
  });
});

describe("기록 보내기 — 그리기를 막지도 늦추지도 않는다", () => {
  const ROW = geminiUsageRow(
    "gemini-3.1-flash-image",
    "image",
    { candidates: [{ content: { parts: [{ inlineData: { data: "AAAA" } }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 1120 } },
    OCT,
  );
  afterEach(() => resetAiUsageForTests());

  it("경로 안에서 부른 호출은 그 경로 이름으로, 답을 돌려주기 전에 다 적힌다", async () => {
    const written: AiUsageRecord[] = [];
    const result = await withAiUsage("illustrate-page", async () => {
      bindAiUsageSink(async (records) => {
        await new Promise((r) => setTimeout(r, 20));
        written.push(...records);
      });
      reportAiUsage(ROW);
      // 기다리지 않고 바로 돌아온다
      assert.equal(written.length, 0);
      return "done";
    });
    assert.equal(result, "done");
    assert.equal(written.length, 1);
    assert.equal(written[0].route, "illustrate-page");
    assert.equal(written[0].env, "local");
    assert.equal(written[0].model, "gemini-3.1-flash-image");
    assert.equal(written[0].tokens_image_out, 1120);
    assert.equal(written[0].images, 1);
  });

  it("경로끼리 섞이지 않는다 — 동시에 도는 두 요청이 제 이름으로 남는다", async () => {
    const seen: string[] = [];
    const sink = async (records: AiUsageRecord[]) => void seen.push(...records.map((r) => r.route));
    await Promise.all(
      ["character-sheet", "location-sheet"].map((route, i) =>
        withAiUsage(route, async () => {
          bindAiUsageSink(sink);
          await new Promise((r) => setTimeout(r, 10 * (2 - i)));
          reportAiUsage(ROW);
        }),
      ),
    );
    assert.deepEqual(seen.sort(), ["character-sheet", "location-sheet"]);
  });

  it("적다가 실패해도 던지지 않는다 — 일은 그대로 끝난다", async () => {
    const logs: unknown[][] = [];
    const { log, warn } = console;
    console.log = (...a: unknown[]) => void logs.push(a);
    console.warn = (...a: unknown[]) => void logs.push(a);
    try {
      const result = await withAiUsage("family-portrait", async () => {
        bindAiUsageSink(async () => {
          throw new Error("relation ai_usage does not exist");
        });
        reportAiUsage(ROW);
        return 7;
      });
      assert.equal(result, 7);
    } finally {
      console.log = log;
      console.warn = warn;
    }
    // 못 적은 줄은 서버 로그에 남는다(조용히 사라지지 않게)
    assert.ok(logs.some((a) => String(a[0]).includes("못 적은 줄")));
  });

  it("스크립트 — 범위 밖 호출은 기본으로 정해 둔 곳에 script 로", async () => {
    const written: AiUsageRecord[] = [];
    setDefaultAiUsageSink({ route: "draw-book-pages", env: "script", sink: async (r) => void written.push(...r) });
    reportAiUsage(ROW);
    await settleAiUsage();
    assert.equal(written.length, 1);
    assert.equal(written[0].route, "draw-book-pages");
    assert.equal(written[0].env, "script");
  });

  it("줄이 없으면(null) 아무것도 하지 않는다", async () => {
    let called = 0;
    setDefaultAiUsageSink({ route: "x", env: "script", sink: async () => void called++ });
    reportAiUsage(null);
    await settleAiUsage();
    assert.equal(called, 0);
  });
});
