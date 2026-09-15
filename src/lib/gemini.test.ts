import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import {
  detectBlankCanvasBorder,
  GeminiError,
  generateImage,
  geminiBlocked,
  isRetryableStatus,
  measureBlankBands,
  openAIFallbackAvailable,
  readQuotaHint,
  repairBlankCanvasBorder,
  resetImageFallbackForTests,
  retryDelayMs,
  shouldFallbackToOpenAI,
} from "./gemini.ts";

async function imageWithSvg(svg: string) {
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return { mimeType: "image/png", data: png.toString("base64") };
}

describe("detectBlankCanvasBorder", () => {
  it("캔버스 왼쪽의 흰 띠를 불량으로 잡는다", async () => {
    const image = await imageWithSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#6b9b67"/><rect width="24" height="300" fill="white"/></svg>',
    );
    assert.match((await detectBlankCanvasBorder(image)) ?? "", /left/);
  });

  it("가장자리까지 칠해진 밝은 그림은 통과시킨다", async () => {
    const image = await imageWithSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#d8ebef"/><circle cx="200" cy="40" r="30" fill="white"/></svg>',
    );
    assert.equal(await detectBlankCanvasBorder(image), null);
  });

  it("흰 띠를 추가 생성 없이 잘라내고 원래 크기로 복원한다", async () => {
    const image = await imageWithSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#6b9b67"/><rect width="24" height="300" fill="white"/></svg>',
    );
    const repaired = await repairBlankCanvasBorder(image);
    const metadata = await sharp(Buffer.from(repaired.data, "base64")).metadata();
    assert.deepEqual([metadata.width, metadata.height], [400, 300]);
    assert.equal(await detectBlankCanvasBorder(repaired), null);
  });

  // 2026-09-15 하온이 소풍 1쪽: 왼쪽·위 흰 띠 옆이 크림색 부엌 벽·냉장고였다. 예전 trim 은 벽까지 먹어
  // 잘림 상한을 넘겼고 '원본 유지'로 흰 띠가 책에 그대로 들어갔다.
  const KITCHEN_WITH_BANDS =
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">' +
    '<rect width="400" height="300" fill="#f4eee2"/>' + // 크림색 벽 (밝지만 흰색은 아님)
    '<rect x="0" y="0" width="90" height="220" fill="#f7f4ee"/>' + // 거의 흰 냉장고
    '<rect x="0" y="220" width="400" height="80" fill="#c89a6a"/>' + // 나무 바닥
    '<rect x="180" y="120" width="60" height="120" fill="#3b6fb6"/>' + // 아이
    '<rect width="24" height="300" fill="white"/><rect width="400" height="12" fill="white"/></svg>';

  it("흰 띠 옆이 밝은 벽이어도 띠만 잘라 확대해 채운다", async () => {
    const image = await imageWithSvg(KITCHEN_WITH_BANDS);
    assert.match((await detectBlankCanvasBorder(image)) ?? "", /top.*left|left.*top/);
    const bands = await measureBlankBands(image);
    assert.ok(bands && bands.left >= 24 && bands.left < 30, `왼쪽 띠 ${bands?.left}`);
    assert.ok(bands && bands.top >= 12 && bands.top < 18, `위 띠 ${bands?.top}`);
    const repaired = await repairBlankCanvasBorder(image);
    const meta = await sharp(Buffer.from(repaired.data, "base64")).metadata();
    assert.deepEqual([meta.width, meta.height], [400, 300]);
    assert.equal(await detectBlankCanvasBorder(repaired), null, "흰 띠가 남지 않는다");
    // 아이(파란 네모)는 잘리지 않고 남아 있다.
    const { data, info } = await sharp(Buffer.from(repaired.data, "base64")).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const at = (Math.round(info.height * 0.55) * info.width + Math.round(info.width * 0.52)) * info.channels;
    assert.ok(data[at + 2] > 150 && data[at] < 100, "가운데 아이가 그대로 있다");
  });

  it("투명한 띠도 흰 테두리로 잡아 고친다 — 화면에선 흰색으로 비친다", async () => {
    const png = await sharp({ create: { width: 400, height: 300, channels: 4, background: { r: 107, g: 155, b: 103, alpha: 1 } } })
      .composite([{ input: await sharp({ create: { width: 30, height: 300, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).png().toBuffer(), left: 0, top: 0, blend: "dest-out" }])
      .png()
      .toBuffer();
    const image = { mimeType: "image/png", data: png.toString("base64") };
    assert.match((await detectBlankCanvasBorder(image)) ?? "", /left/);
    const repaired = await repairBlankCanvasBorder(image);
    assert.equal(await detectBlankCanvasBorder(repaired), null);
  });

  it("여백이 너무 두꺼우면(한 변 20% 넘음) 확대하지 않고 남긴다 — 라우트가 다시 그리게 한다", async () => {
    const image = await imageWithSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#6b9b67"/><rect width="100" height="300" fill="white"/></svg>',
    );
    const repaired = await repairBlankCanvasBorder(image);
    assert.equal(repaired.data, image.data, "원본 그대로");
    assert.ok(await detectBlankCanvasBorder(repaired), "흰 띠가 남았다고 알린다");
  });
});

describe("isRetryableStatus", () => {
  it("몰림·서버 문제·타임아웃은 다시 걸어 본다", () => {
    for (const status of [408, 409, 429, 500, 502, 503, 504]) {
      assert.equal(isRetryableStatus(status), true, `${status}는 재시도 대상`);
    }
  });

  it("키·요청·안전필터 문제는 다시 걸지 않는다 — 몇 번을 해도 같다", () => {
    for (const status of [400, 401, 403, 404, 422]) {
      assert.equal(isRetryableStatus(status), false, `${status}는 재시도 대상이 아님`);
    }
  });
});

describe("retryDelayMs", () => {
  it("서버가 알려준 시간을 따르되 10초를 넘지 않는다", () => {
    assert.equal(retryDelayMs(1, "3"), 3000);
    assert.equal(retryDelayMs(1, "99"), 10_000);
  });

  it("알려주지 않으면 시도할수록 길어진다", () => {
    // 흔들림(±30%)이 있어 구간으로 확인한다.
    const first = retryDelayMs(1);
    const third = retryDelayMs(3);
    assert.ok(first >= 560 && first <= 1040, `1회차 ${first}ms`);
    assert.ok(third >= 2240 && third <= 4160, `3회차 ${third}ms`);
  });

  it("이상한 Retry-After는 무시하고 기본 간격을 쓴다", () => {
    for (const bad of [null, "", "soon", "-5", "0"]) {
      const delay = retryDelayMs(1, bad);
      assert.ok(delay >= 560 && delay <= 1040, `${JSON.stringify(bad)} → ${delay}ms`);
    }
  });
});

const MINUTE_BODY = '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"quotaMetric":"generate_content_free_tier_requests","quotaId":"GenerateRequestsPerMinutePerProjectPerModel"}]},{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"35s"}]}}';
const DAY_BODY = '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel"}]}]}}';
const SPEND_CAP_BODY = '{"error":{"code":429,"message":"Your project has exceeded its monthly spending cap. Please go to AI Studio at https://ai.studio/spend to manage your project spend cap. Learn more at https://ai.google.dev/gemini-api/docs/billing#project-spend-caps.","status":"RESOURCE_EXHAUSTED"}}';

describe("Gemini 가 한도·결제로 막히면 GPT 로 대신 그린다", () => {
  const exhausted = Object.assign(new GeminiError("한도", 429), { quotaExhausted: true });
  const crowded = new GeminiError("몰림", 429);

  it("넘길지: 한도·결제 막힘이고 OpenAI 키가 있을 때만", () => {
    assert.equal(shouldFallbackToOpenAI(exhausted, { openaiKey: "sk-x" }), true);
    assert.equal(shouldFallbackToOpenAI(crowded, { openaiKey: "sk-x" }), false, "몰림은 기다리면 된다");
    assert.equal(shouldFallbackToOpenAI(new GeminiError("안전필터", 422), { openaiKey: "sk-x" }), false);
    assert.equal(shouldFallbackToOpenAI(exhausted, { openaiKey: "" }), false, "키가 없으면 넘길 수 없다");
    assert.equal(shouldFallbackToOpenAI(exhausted, { openaiKey: "sk-x", fallback: "off" }), false, "끄면 안 넘긴다");
    assert.equal(shouldFallbackToOpenAI(new Error("그냥 오류"), { openaiKey: "sk-x" }), false);
    assert.equal(openAIFallbackAvailable({ openaiKey: " sk-x ", fallback: "on" }), true);
  });

  it("실제 흐름: 지출 한도 429 → 다시 시도하지 않고 GPT 로 그리고, 다음 그림은 Gemini 를 건너뛴다", async () => {
    const saved = {
      fetch: globalThis.fetch,
      provider: process.env.IMAGE_PROVIDER,
      gkey: process.env.GEMINI_API_KEY,
      okey: process.env.OPENAI_API_KEY,
      fallback: process.env.IMAGE_FALLBACK,
      warn: console.warn,
    };
    const calls: string[] = [];
    try {
      resetImageFallbackForTests();
      delete process.env.IMAGE_PROVIDER;
      delete process.env.IMAGE_FALLBACK;
      process.env.GEMINI_API_KEY = "g-test";
      process.env.OPENAI_API_KEY = "sk-test";
      console.warn = () => {};
      globalThis.fetch = (async (url: string | URL) => {
        const u = String(url);
        calls.push(u.includes("openai.com") ? "openai" : "gemini");
        if (u.includes("openai.com")) {
          return new Response(JSON.stringify({ data: [{ b64_json: "R1BU" }] }), { status: 200 });
        }
        return new Response(SPEND_CAP_BODY, { status: 429 });
      }) as typeof fetch;

      const first = await generateImage({ prompt: "사과", aspectRatio: "1:1" });
      assert.equal(first.data, "R1BU", "GPT 가 그린 그림이 돌아온다");
      assert.deepEqual(calls, ["gemini", "openai"], "Gemini 는 한 번만 두드리고(다시 시도 없음) GPT 로 넘어간다");
      assert.equal(geminiBlocked(), true);

      calls.length = 0;
      await generateImage({ prompt: "배", aspectRatio: "1:1" });
      assert.deepEqual(calls, ["openai"], "막힌 동안엔 Gemini 를 건너뛴다");
    } finally {
      globalThis.fetch = saved.fetch;
      console.warn = saved.warn;
      for (const [k, v] of [["IMAGE_PROVIDER", saved.provider], ["GEMINI_API_KEY", saved.gkey], ["OPENAI_API_KEY", saved.okey], ["IMAGE_FALLBACK", saved.fallback]] as const) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
      }
      resetImageFallbackForTests();
    }
  });

  it("몰림(분당 한도)은 GPT 로 넘기지 않는다 — 기다렸다 Gemini 로 다시", async () => {
    const saved = { fetch: globalThis.fetch, gkey: process.env.GEMINI_API_KEY, okey: process.env.OPENAI_API_KEY };
    const calls: string[] = [];
    try {
      resetImageFallbackForTests();
      process.env.GEMINI_API_KEY = "g-test";
      process.env.OPENAI_API_KEY = "sk-test";
      let n = 0;
      globalThis.fetch = (async (url: string | URL) => {
        const u = String(url);
        calls.push(u.includes("openai.com") ? "openai" : "gemini");
        n += 1;
        if (n === 1) return new Response(MINUTE_BODY.replace('"35s"', '"0.01s"'), { status: 429 });
        return new Response(
          JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "R0VN" } }] } }] }),
          { status: 200 },
        );
      }) as typeof fetch;
      const img = await generateImage({ prompt: "사과", aspectRatio: "1:1" });
      assert.equal(img.data, "R0VN");
      assert.deepEqual(calls, ["gemini", "gemini"]);
      assert.equal(geminiBlocked(), false);
    } finally {
      globalThis.fetch = saved.fetch;
      if (saved.gkey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = saved.gkey;
      if (saved.okey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = saved.okey;
      resetImageFallbackForTests();
    }
  });
});

describe("readQuotaHint — 429가 '잠깐 몰림'인지 '오늘 다 씀'인지 가른다", () => {
  it("분당 한도면 기다릴 시간을 읽고 daily는 아니다", () => {
    const hint = readQuotaHint(MINUTE_BODY);
    assert.equal(hint.retryDelay, "35s");
    assert.equal(hint.daily, false);
  });

  it("일일 한도면 daily로 표시한다 — 기다려도 안 되는 경우다", () => {
    assert.equal(readQuotaHint(DAY_BODY).daily, true);
  });

  it("JSON이 아니어도 터지지 않는다 (프록시 오류 페이지 등)", () => {
    assert.deepEqual(readQuotaHint("<html>502</html>"), { daily: false, spendCap: false });
    assert.deepEqual(readQuotaHint(""), { daily: false, spendCap: false });
  });

  it("월 지출 한도(2026-09-15 운영에서 실제로 받은 원문)는 spendCap — details 가 비어 있어도 잡는다", () => {
    const hint = readQuotaHint(SPEND_CAP_BODY);
    assert.equal(hint.spendCap, true);
    assert.equal(hint.daily, false);
  });

  it("분당 한도(몰림)는 spendCap 이 아니다 — 기다리면 되는 경우를 GPT 로 넘기지 않게", () => {
    assert.equal(readQuotaHint(MINUTE_BODY).spendCap, false);
  });

  it("구글이 주는 \"35s\" 꼴을 재시도 간격으로 쓸 수 있다", () => {
    // 예전엔 Number("35s")가 NaN이라 이 값을 통째로 버리고 0.8초만 기다렸다.
    assert.equal(retryDelayMs(1, "35s", 45_000), 35_000);
    // 상한은 지킨다.
    assert.equal(retryDelayMs(1, "600s", 45_000), 45_000);
  });
});
