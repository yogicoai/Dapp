import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import {
  base64Bytes,
  checkPickedFile,
  fitPhotoSize,
  PHOTO_BAD_FORMAT_MESSAGE,
  PHOTO_FALLBACK_NOTE,
  PHOTO_LONG_SIDE,
  PHOTO_PICK_MAX_BYTES,
  PHOTO_SEND_MAX_BYTES,
  PHOTO_TOO_BIG_MESSAGE,
  PORTRAIT_BODY_MAX_BYTES,
  PORTRAIT_PHOTO_MAX_BYTES,
  readPhotoFallback,
  readPortraitPhoto,
} from "./family-photo.ts";

/** 진짜 그림 파일(작은 사진 대신) — 파일 머리(매직 바이트) 검사까지 거치게 */
async function sample(format: "jpeg" | "png" | "webp"): Promise<string> {
  // 잡티를 뿌려 파일이 너무 작지 않게(민짜 PNG 는 수백 바이트라 '사진이 아니다'에 걸린다)
  const img = sharp({
    create: {
      width: 96,
      height: 96,
      channels: 3,
      background: { r: 200, g: 120, b: 90 },
      noise: { type: "gaussian", mean: 128, sigma: 40 },
    },
  });
  const buf = await (format === "jpeg" ? img.jpeg() : format === "png" ? img.png() : img.webp()).toBuffer();
  return buf.toString("base64");
}

describe("readPortraitPhoto — 서버가 받는 사진 검사(값을 받기 전)", () => {
  it("없으면 사진 없이(칩으로) 그린다", () => {
    assert.deepEqual(readPortraitPhoto(undefined), { photo: null });
    assert.deepEqual(readPortraitPhoto(null), { photo: null });
    assert.deepEqual(readPortraitPhoto(""), { photo: null });
  });

  it("JPEG·PNG·WEBP 를 data URL 또는 {mimeType, data} 로 받는다", async () => {
    const jpg = await sample("jpeg");
    assert.deepEqual(readPortraitPhoto(`data:image/jpeg;base64,${jpg}`), { photo: { mimeType: "image/jpeg", data: jpg } });
    const png = await sample("png");
    assert.deepEqual(readPortraitPhoto({ mimeType: "image/png", data: png }), { photo: { mimeType: "image/png", data: png } });
    const webp = await sample("webp");
    assert.deepEqual(readPortraitPhoto(`data:image/webp;base64,${webp}`), { photo: { mimeType: "image/webp", data: webp } });
  });

  it("다른 형식·글자만 바꿔 단 파일·깨진 base64 는 거절한다", async () => {
    const jpg = await sample("jpeg");
    const png = await sample("png");
    const bad = (raw: unknown) => assert.deepEqual(readPortraitPhoto(raw), { error: PHOTO_BAD_FORMAT_MESSAGE });
    bad(`data:image/gif;base64,${jpg}`);
    bad(`data:text/plain;base64,${jpg}`);
    bad({ mimeType: "image/svg+xml", data: jpg });
    bad(`data:image/jpeg;base64,${png}`); // 글자는 JPEG 인데 속은 PNG
    bad({ mimeType: "image/png", data: jpg });
    bad(`data:image/jpeg;base64,${jpg.slice(0, -1)}`); // 길이가 4의 배수가 아니다
    bad(`data:image/jpeg;base64,${jpg.slice(0, 40)}<script>${jpg.slice(48)}`);
    bad("https://example.com/me.jpg");
    bad(12345);
    bad({ mimeType: "image/jpeg" });
    bad(`data:image/jpeg;base64,/9j/AAAA`); // 너무 작다(사진이 아니다)
  });

  it("풀어서 2.5MB 가 넘으면 '너무 커요' — 정규식에 넣기 전에 길이로 막는다", () => {
    const big = "A".repeat(Math.ceil((PORTRAIT_PHOTO_MAX_BYTES + 10) / 3) * 4);
    assert.deepEqual(readPortraitPhoto(`data:image/jpeg;base64,${big}`), { error: PHOTO_TOO_BIG_MESSAGE });
  });

  it("오류 글자에 사진 내용이 섞이지 않는다(로그·응답으로 새지 않게)", async () => {
    const jpg = await sample("jpeg");
    const r = readPortraitPhoto(`data:image/gif;base64,${jpg}`);
    assert.ok("error" in r && !r.error.includes(jpg.slice(0, 12)));
  });

  it("한도끼리 맞물린다 — 브라우저가 보내는 양 < 서버 사진 한도, base64 로 부푼 사진 한도 < 본문 한도 < Vercel 4.5MB", () => {
    assert.ok(PHOTO_SEND_MAX_BYTES < PORTRAIT_PHOTO_MAX_BYTES);
    assert.ok(Math.ceil(PORTRAIT_PHOTO_MAX_BYTES / 3) * 4 + 2_000 < PORTRAIT_BODY_MAX_BYTES);
    assert.ok(PORTRAIT_BODY_MAX_BYTES < 4.5 * 1024 * 1024);
  });

  it("base64Bytes — 끝 '=' 만큼 뺀다", () => {
    assert.equal(base64Bytes("QUJD"), 3);
    assert.equal(base64Bytes("QUI="), 2);
    assert.equal(base64Bytes("QQ=="), 1);
  });
});

describe("대신 그리기 표시(응답 photoFallback)", () => {
  it("아는 값만 받고, 갈래마다 화면에 보일 한 줄이 있다", () => {
    assert.equal(readPhotoFallback("features"), "features");
    assert.equal(readPhotoFallback("looks"), "looks");
    for (const v of [undefined, null, "", "FEATURES", 1, { kind: "features" }]) assert.equal(readPhotoFallback(v), null);
    assert.equal(PHOTO_FALLBACK_NOTE.features, "사진은 그대로 쓰지 못해 사진 속 특징으로 그렸어요");
    assert.match(PHOTO_FALLBACK_NOTE.looks, /고르신 특징으로 그렸어요/);
  });
});

describe("브라우저에서 고른 사진", () => {
  it("사진이 아니거나 비었거나 터무니없이 크면 부모가 읽을 말", () => {
    assert.equal(checkPickedFile({ type: "image/jpeg", size: 3_000_000 }), null);
    assert.equal(checkPickedFile({ type: "image/heic", size: 3_000_000 }), null, "여는 건 브라우저에 맡긴다");
    assert.equal(checkPickedFile({ type: "", size: 3_000_000 }), null, "형식이 빈 갤러리 파일은 풀어 보고 정한다");
    assert.equal(checkPickedFile({ type: "application/pdf", size: 1000 }), "사진 파일만 올릴 수 있어요.");
    assert.match(checkPickedFile({ type: "image/png", size: 0 }) ?? "", /빈 파일/);
    assert.equal(checkPickedFile({ type: "image/png", size: PHOTO_PICK_MAX_BYTES + 1 }), PHOTO_TOO_BIG_MESSAGE);
  });

  it("긴 변을 1024px 로 줄이고(키우지 않는다), 너무 작은 사진은 받지 않는다", () => {
    assert.deepEqual(fitPhotoSize(4032, 3024), { width: PHOTO_LONG_SIDE, height: 768 });
    assert.deepEqual(fitPhotoSize(3024, 4032), { width: 768, height: PHOTO_LONG_SIDE });
    assert.deepEqual(fitPhotoSize(800, 600), { width: 800, height: 600 });
    assert.equal(fitPhotoSize(120, 900), null);
    assert.equal(fitPhotoSize(Number.NaN, 900), null);
  });
});
