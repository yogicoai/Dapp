import { describe, it } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";

import { removeWhiteBackground } from "./cutout.ts";

type RGB = [number, number, number];
const WHITE: RGB = [255, 255, 255];
const BLUE: RGB = [40, 90, 200];

/** (x, y) 마다 색을 정해 작은 가짜 그림(PNG)을 만든다. */
async function paint(w: number, h: number, color: (x: number, y: number) => RGB): Promise<Buffer> {
  const buf = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = color(x, y);
      const o = (y * w + x) * 3;
      buf[o] = r;
      buf[o + 1] = g;
      buf[o + 2] = b;
    }
  }
  return sharp(buf, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}

/** 결과 PNG 를 RGBA 픽셀로 읽는다. */
async function pixels(png: Buffer) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number) => {
    const o = (y * info.width + x) * 4;
    return { r: data[o], g: data[o + 1], b: data[o + 2], a: data[o + 3] };
  };
  return { w: info.width, h: info.height, at, data };
}

const inRect = (x: number, y: number, l: number, t: number, r: number, b: number) =>
  x >= l && x < r && y >= t && y < b;

describe("removeWhiteBackground — 가장자리에서 이어진 흰색만 지운다", () => {
  it("흰 바탕은 지우고, 사각형 안쪽 흰 점은 남긴다(여백도 잘린다)", async () => {
    // 200×200 흰 바탕 · 파란 사각형(60~140, 40~160) · 가운데 흰 점 10×10(95~105)
    const input = await paint(200, 200, (x, y) => {
      if (inRect(x, y, 95, 95, 105, 105)) return WHITE;
      if (inRect(x, y, 60, 40, 140, 160)) return BLUE;
      return WHITE;
    });
    const out = await removeWhiteBackground(input);
    assert.equal(out.transparent, true);
    assert.ok(Math.abs(out.clearedRatio - 0.76) < 1e-9, `지운 비율 ${out.clearedRatio}`);

    const meta = await sharp(out.png).metadata();
    assert.equal(meta.format, "png");
    assert.equal(meta.hasAlpha, true);

    const p = await pixels(out.png);
    // 투명 여백이 잘려 사각형 크기만 남는다
    assert.equal(p.w, 80);
    assert.equal(p.h, 120);
    // 사각형 모서리는 파랗고 불투명
    assert.deepEqual(p.at(0, 0), { r: 40, g: 90, b: 200, a: 255 });
    assert.deepEqual(p.at(79, 119), { r: 40, g: 90, b: 200, a: 255 });
    // 가운데 흰 점(원래 95~105 → 잘린 뒤 35~45, 55~65)은 흰색 그대로, 뚫리지 않는다
    for (const [x, y] of [[35, 55], [40, 60], [44, 64]] as const) {
      assert.deepEqual(p.at(x, y), { r: 255, g: 255, b: 255, a: 255 }, `흰 점 (${x},${y})`);
    }
    // 사각형 안에는 투명한 곳이 하나도 없다
    for (let i = 3; i < p.data.length; i += 4) assert.equal(p.data[i], 255);
  });

  it("가장자리와 이어진 흰 틈(다리 사이 같은 곳)은 지운다", async () => {
    // 사각형 아래쪽에 위로 파인 흰 틈(95~105, 120~160) — 바깥 흰 바탕과 이어져 있다
    const input = await paint(200, 200, (x, y) => {
      if (inRect(x, y, 95, 120, 105, 160)) return WHITE;
      if (inRect(x, y, 60, 40, 140, 160)) return BLUE;
      return WHITE;
    });
    const out = await removeWhiteBackground(input);
    assert.equal(out.transparent, true);
    const p = await pixels(out.png);
    assert.equal(p.w, 80);
    assert.equal(p.h, 120);
    // 틈(잘린 뒤 x 35~45, y 80~120)은 투명
    assert.equal(p.at(40, 100).a, 0);
    assert.equal(p.at(40, 119).a, 0);
    // 틈 양옆은 그대로
    assert.equal(p.at(30, 100).a, 255);
    assert.equal(p.at(50, 100).a, 255);
  });

  it("경계의 옅은 픽셀은 반투명으로, 섞인 흰색을 빼 흰 테두리가 남지 않는다", async () => {
    // 파란 사각형을 1픽셀 옅은 회색(225) 테두리가 두른다 — 거의 흰색 기준(236)보다 어두워 안 지워진다
    const input = await paint(200, 200, (x, y) => {
      if (inRect(x, y, 60, 40, 140, 160)) return BLUE;
      if (inRect(x, y, 59, 39, 141, 161)) return [225, 225, 225];
      return WHITE;
    });
    const out = await removeWhiteBackground(input);
    assert.equal(out.transparent, true);
    const p = await pixels(out.png);
    assert.equal(p.w, 82);
    assert.equal(p.h, 122);
    const edge = p.at(0, 60);
    assert.ok(edge.a > 0 && edge.a < 255, `테두리 알파 ${edge.a}`);
    assert.ok(edge.r < 225, `테두리 색에서 흰색이 빠져야 한다: ${edge.r}`);
    // 안쪽 파란색은 그대로
    assert.deepEqual(p.at(1, 60), { r: 40, g: 90, b: 200, a: 255 });
  });

  it("바탕에 떨어진 작은 얼룩은 지워서 여백 자르기가 늘어나지 않는다", async () => {
    const input = await paint(200, 200, (x, y) => {
      if (inRect(x, y, 5, 5, 7, 7)) return [120, 120, 120]; // 2×2 얼룩
      if (inRect(x, y, 60, 40, 140, 160)) return BLUE;
      return WHITE;
    });
    const out = await removeWhiteBackground(input);
    assert.equal(out.transparent, true);
    const p = await pixels(out.png);
    assert.equal(p.w, 80);
    assert.equal(p.h, 120);
  });
});

describe("removeWhiteBackground — 지우기를 믿지 못하면 흰 바탕 그대로", () => {
  it("바탕을 색으로 칠한 그림(지운 비율 < 0.25)은 transparent=false, 흰 바탕 PNG", async () => {
    const input = await paint(100, 100, (x, y) => (inRect(x, y, 0, 0, 10, 10) ? WHITE : [200, 60, 60]));
    const out = await removeWhiteBackground(input);
    assert.equal(out.transparent, false);
    assert.ok(out.clearedRatio < 0.25);
    const meta = await sharp(out.png).metadata();
    assert.equal(meta.hasAlpha, false);
    assert.equal(meta.width, 100);
    assert.equal(meta.height, 100);
  });

  it("거의 빈 그림(지운 비율 > 0.95)도 transparent=false, 여백만 잘린다", async () => {
    // 200×200 에 4×4 파란 점 하나 — 지운 비율 0.9996
    const input = await paint(200, 200, (x, y) => (inRect(x, y, 100, 100, 104, 104) ? BLUE : WHITE));
    const out = await removeWhiteBackground(input);
    assert.equal(out.transparent, false);
    assert.ok(out.clearedRatio > 0.95);
    const meta = await sharp(out.png).metadata();
    assert.equal(meta.hasAlpha, false);
    // 점 4px + 양쪽 여백 6px(긴 변 200 × 0.03)
    assert.equal(meta.width, 16);
    assert.equal(meta.height, 16);
  });

  it("전부 흰색이면 자르지 않고 그대로", async () => {
    const input = await paint(60, 80, () => WHITE);
    const out = await removeWhiteBackground(input);
    assert.equal(out.transparent, false);
    assert.equal(out.clearedRatio, 1);
    const meta = await sharp(out.png).metadata();
    assert.equal(meta.width, 60);
    assert.equal(meta.height, 80);
  });
});
