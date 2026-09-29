import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import {
  CLOSEUP_ASPECT,
  CLOSEUP_LONG_SIDE,
  CLOSEUP_MARGIN,
  CLOSEUP_MAX_SHARE,
  CLOSEUP_MAX_UPSCALE,
  CLOSEUP_MIN_FACE_PX,
  closeUpSize,
  faceCloseUp,
  faceCropRect,
  type CropRect,
} from "./family-closeup.ts";
import type { Box } from "./family-head.ts";
import type { PortraitPhoto } from "./family-photo.ts";

/** 얼굴 상자(0~1000) → 사진 픽셀 */
function facePx(box: Box, w: number, h: number) {
  return { left: (box[1] / 1000) * w, top: (box[0] / 1000) * h, right: (box[3] / 1000) * w, bottom: (box[2] / 1000) * h };
}

/** 자른 칸이 사진 안이고, 정수이고, 얼굴 상자를 다 담는다 */
function assertSane(rect: CropRect, box: Box, w: number, h: number, note = "") {
  const f = facePx(box, w, h);
  for (const v of Object.values(rect)) assert.ok(Number.isInteger(v), `정수 ${note}`);
  assert.ok(rect.left >= 0 && rect.top >= 0, `사진 안 ${note}`);
  assert.ok(rect.left + rect.width <= w && rect.top + rect.height <= h, `사진 안 ${note}`);
  assert.ok(rect.left <= f.left + 1e-9 && rect.top <= f.top + 1e-9, `얼굴 위·왼쪽을 담는다 ${note}`);
  assert.ok(rect.left + rect.width >= f.right - 1 && rect.top + rect.height >= f.bottom - 1, `얼굴 아래·오른쪽을 담는다 ${note}`);
  assert.ok((rect.width * rect.height) / (w * h) <= CLOSEUP_MAX_SHARE, `사진의 절반 이하 ${note}`);
}

describe("faceCropRect — 얼굴 상자 → 자를 칸(여백·3:4·사진 안으로)", () => {
  it("상반신 사진 — 머리카락(위 0.65)·턱과 목(아래 0.35)·귀(옆 0.4) 여백, 3:4 로 넓힌 칸", () => {
    // 768×1024 사진, 얼굴 = x 307.2~460.8(153.6px) · y 204.8~460.8(256px)
    const box: Box = [200, 400, 450, 600];
    const rect = faceCropRect(box, 768, 1024);
    assert.deepEqual(rect, { left: 192, top: 38, width: 384, height: 512 });
    assertSane(rect, box, 768, 1024);
    assert.equal(rect.width / rect.height, CLOSEUP_ASPECT);
    // 여백 몫 그대로 — 위 0.65·얼굴 높이, 아래 0.35·얼굴 높이
    const f = facePx(box, 768, 1024);
    assert.ok(Math.abs(f.top - rect.top - CLOSEUP_MARGIN.top * 256) < 1);
    assert.ok(Math.abs(rect.top + rect.height - f.bottom - CLOSEUP_MARGIN.bottom * 256) < 1);
  });

  it("얼굴이 넓으면 세로를 가운데 기준으로 늘려 3:4", () => {
    const box: Box = [300, 350, 450, 650]; // 1000×1000 사진에서 300×150px — 가로:세로 2 는 너무 납작하다
    assert.equal(faceCropRect(box, 1000, 1000), null);
    const round: Box = [300, 400, 460, 580]; // 180×160px
    const rect = faceCropRect(round, 1000, 1000);
    assert.ok(rect);
    assertSane(rect, round, 1000, 1000);
    assert.ok(Math.abs(rect.width / rect.height - CLOSEUP_ASPECT) < 0.01, `${rect.width}×${rect.height}`);
  });

  it("사진 모서리의 얼굴 — 칸을 사진 안으로 밀고, 얼굴은 잘리지 않는다", () => {
    const topLeft: Box = [0, 0, 150, 120];
    const a = faceCropRect(topLeft, 1024, 768);
    assert.ok(a);
    assert.equal(a.left, 0);
    assert.equal(a.top, 0);
    assertSane(a, topLeft, 1024, 768, "왼쪽 위");
    const bottomRight: Box = [850, 850, 1000, 1000];
    const b = faceCropRect(bottomRight, 1000, 1000);
    assert.deepEqual(b, { left: 730, top: 640, width: 270, height: 360 });
    assertSane(b, bottomRight, 1000, 1000, "오른쪽 아래");
  });

  it("칸이 사진보다 크면 사진 크기로 줄인다(꼴이 조금 달라져도 얼굴은 자르지 않는다)", () => {
    // 가로로 긴 사진(1024×300)의 큰 얼굴 — 세로가 사진을 넘는다
    const box: Box = [100, 400, 900, 600];
    const rect = faceCropRect(box, 1024, 300);
    assert.ok(rect);
    assert.equal(rect.top, 0);
    assert.equal(rect.height, 300);
    assertSane(rect, box, 1024, 300);
  });

  it("쓰지 않는 상자는 null — 얼굴이 너무 작다·얼굴 꼴이 아니다·이미 얼굴 사진이다·사진 크기가 이상하다", () => {
    // 얼굴 짧은 변이 CLOSEUP_MIN_FACE_PX 보다 작다(1024×768 에서 약 31px)
    assert.equal(faceCropRect([500, 500, 540, 530], 1024, 768), null);
    // 딱 그 경계는 받는다
    const edge = faceCropRect([500, 500, 500 + (CLOSEUP_MIN_FACE_PX / 768) * 1000 + 1, 550], 1024, 768);
    assert.ok(edge, "짧은 변이 경계 이상이면 받는다");
    // 몸 전체 같은 길쭉한 상자·가로로 뭉갠 상자
    assert.equal(faceCropRect([100, 450, 900, 500], 1024, 768), null);
    assert.equal(faceCropRect([400, 100, 450, 900], 1024, 768), null);
    // 셀카 — 자른 칸이 사진 절반을 넘는다
    assert.equal(faceCropRect([150, 150, 850, 850], 768, 1024), null);
    // 사진 크기가 이상하다
    assert.equal(faceCropRect([200, 400, 450, 600], 0, 1024), null);
    assert.equal(faceCropRect([200, 400, 450, 600], Number.NaN, 1024), null);
    assert.equal(faceCropRect([200, 400, 450, 600], 767.5, 1024), null);
  });

  it("어느 상자든 쓰면 늘 사진 안·정수·얼굴을 다 담고·절반 이하", () => {
    let used = 0;
    for (const [w, h] of [
      [768, 1024],
      [1024, 768],
      [1024, 1024],
      [480, 1024],
      [161, 200],
    ]) {
      for (let y0 = 0; y0 < 1000; y0 += 90) {
        for (let x0 = 0; x0 < 1000; x0 += 90) {
          for (const size of [60, 150, 300]) {
            const box: Box = [y0, x0, Math.min(1000, y0 + size), Math.min(1000, x0 + size * 0.8)];
            if (!(box[0] < box[2] && box[1] < box[3])) continue;
            const rect = faceCropRect(box, w, h);
            if (!rect) continue;
            used++;
            assertSane(rect, box, w, h, `${w}×${h} ${JSON.stringify(box)}`);
          }
        }
      }
    }
    assert.ok(used > 100, `${used}`);
  });
});

describe("closeUpSize — 긴 변 768px 로, 키우기는 3배까지", () => {
  it("꼴은 그대로 긴 변만 맞춘다", () => {
    assert.deepEqual(closeUpSize({ width: 384, height: 512 }), { width: 576, height: CLOSEUP_LONG_SIDE });
    assert.deepEqual(closeUpSize({ width: 900, height: 1200 }), { width: 576, height: CLOSEUP_LONG_SIDE }, "크면 줄인다");
  });

  it("작은 얼굴은 3배까지만 — 너무 키워 뭉갠 얼굴이 기준이 되지 않게", () => {
    assert.deepEqual(closeUpSize({ width: 100, height: 133 }), { width: 100 * CLOSEUP_MAX_UPSCALE, height: 133 * CLOSEUP_MAX_UPSCALE });
  });
});

describe("faceCloseUp — 사진에서 얼굴을 잘라 키운 JPEG", () => {
  // 800×1000 사진 — 얼굴 상자 자리(x 480~640 · y 100~300)만 빨강, 나머지는 파랑.
  const W = 800;
  const H = 1000;
  const BOX: Box = [100, 600, 300, 800];
  async function sample(opts: { orientation?: number } = {}): Promise<PortraitPhoto> {
    const raw = Buffer.alloc(W * H * 3);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const red = x >= 480 && x < 640 && y >= 100 && y < 300;
        raw.set(red ? [220, 30, 30] : [30, 30, 220], (y * W + x) * 3);
      }
    }
    let img = sharp(raw, { raw: { width: W, height: H, channels: 3 } });
    if (opts.orientation) img = img.withMetadata({ orientation: opts.orientation });
    const buf = await img.jpeg({ quality: 90 }).toBuffer();
    return { mimeType: "image/jpeg", data: buf.toString("base64") };
  }

  async function pixel(img: { data: string }, x: number, y: number): Promise<number[]> {
    const { data } = await sharp(Buffer.from(img.data, "base64"))
      .extract({ left: x, top: y, width: 1, height: 1 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    return [...data];
  }

  it("상자 순서 [위, 왼, 아래, 오른]대로 자른다 — 가운데가 얼굴(빨강), 가장자리는 바탕(파랑), 긴 변 768 JPEG", async () => {
    const out = await faceCloseUp(await sample(), BOX);
    assert.ok(out);
    assert.equal(out.mimeType, "image/jpeg");
    const meta = await sharp(Buffer.from(out.data, "base64")).metadata();
    assert.equal(meta.format, "jpeg");
    // 자른 칸 300×400(→ 1.92배) = 576×768
    assert.deepEqual([meta.width, meta.height], [576, CLOSEUP_LONG_SIDE]);
    const [r, , b] = await pixel(out, 288, 400);
    assert.ok(r > 150 && b < 100, `가운데는 얼굴 ${r},${b}`);
    const [r2, , b2] = await pixel(out, 10, 740);
    assert.ok(b2 > 150 && r2 < 100, `아래 왼쪽은 바탕 ${r2},${b2}`);
  });

  it("쓰지 않을 상자·회전 정보가 있는 사진·깨진 사진은 null — 던지지 않고, 아무것도 찍지 않는다", async () => {
    const saved = { log: console.log, info: console.info, warn: console.warn, error: console.error };
    const logs: string[] = [];
    const capture = (...a: unknown[]) => {
      logs.push(a.map(String).join(" "));
    };
    Object.assign(console, { log: capture, info: capture, warn: capture, error: capture });
    try {
      const photo = await sample();
      assert.equal(await faceCloseUp(photo, [500, 500, 510, 510]), null, "너무 작은 얼굴");
      const rotated = await sample({ orientation: 6 });
      assert.equal((await sharp(Buffer.from(rotated.data, "base64")).metadata()).orientation, 6);
      assert.equal(await faceCloseUp(rotated, BOX), null, "회전 정보가 있으면 상자와 방향이 어긋날 수 있다");
      assert.equal(await faceCloseUp({ mimeType: "image/jpeg", data: Buffer.from("not an image at all").toString("base64") }, BOX), null);
    } finally {
      Object.assign(console, saved);
    }
    assert.deepEqual(logs, []);
  });
});
