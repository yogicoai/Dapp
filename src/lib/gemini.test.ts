import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import {
  detectBlankCanvasBorder,
  isRetryableStatus,
  repairBlankCanvasBorder,
  retryDelayMs,
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
