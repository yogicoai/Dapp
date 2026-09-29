/**
 * '사진으로 할게요' — 고른 사진을 브라우저에서 줄여 JPEG data URL 로 만든다(브라우저 전용).
 *
 *  - 긴 변 1024px, JPEG 품질 0.85(그래도 1.5MB 가 넘으면 0.7 로 한 번 더). 보내는 양이 서버 한도보다 한참 작다.
 *  - 폰 사진의 회전 정보(EXIF)는 createImageBitmap(imageOrientation 'from-image')로 풀어 똑바로 세운다.
 *    못 쓰는 브라우저는 <img> 로 푼다(요즘 브라우저는 <img> 에 회전 정보를 알아서 적용한다).
 *  - 캔버스로 다시 구우므로 원본의 EXIF(찍은 곳 위치·기기 정보)는 따라가지 않는다.
 *  - 결과는 부르는 쪽(가족 화면)이 메모리(React state)에만 둔다 — 저장 금지(lib/family-photo.ts 머리글).
 * 규칙 숫자와 검사(형식·크기)는 lib/family-photo.ts 가 원본이다.
 */

import {
  checkPickedFile,
  fitPhotoSize,
  PHOTO_BAD_FORMAT_MESSAGE,
  PHOTO_QUALITY,
  PHOTO_SEND_MAX_BYTES,
} from "@/lib/family-photo";

export type PreparedPhoto = { ok: true; dataUrl: string } | { ok: false; message: string };

type Decoded = { source: CanvasImageSource; width: number; height: number; done: () => void };

/** 회전 정보를 풀어 사진을 연다. 못 열면 null(HEIC 를 못 여는 브라우저 등). */
async function decode(file: File): Promise<Decoded | null> {
  if (typeof createImageBitmap === "function") {
    for (const opts of [{ imageOrientation: "from-image" } as ImageBitmapOptions, undefined]) {
      try {
        const bmp = await createImageBitmap(file, opts);
        return { source: bmp, width: bmp.width, height: bmp.height, done: () => bmp.close() };
      } catch {
        // 옵션을 모르는 브라우저 — 옵션 없이, 그래도 안 되면 <img> 로
      }
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      done: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

/** data URL 의 base64 가 풀었을 때 몇 바이트인지(대략) */
const dataUrlBytes = (u: string) => Math.floor(((u.length - u.indexOf(",") - 1) * 3) / 4);

/** 고른 파일 → 줄인 JPEG data URL. 실패하면 부모가 읽을 말. */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const bad = checkPickedFile(file);
  if (bad) return { ok: false, message: bad };

  const img = await decode(file);
  if (!img) return { ok: false, message: "이 사진은 열 수 없어요. 다른 사진을 골라 주세요." };
  const canvas = document.createElement("canvas");
  try {
    const size = fitPhotoSize(img.width, img.height);
    if (!size) return { ok: false, message: "사진이 너무 작아요. 얼굴이 크게 나온 사진을 골라 주세요." };
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ok: false, message: PHOTO_BAD_FORMAT_MESSAGE };
    // 투명한 PNG 는 흰 바탕 위에 — JPEG 에는 투명이 없어 검게 나온다.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img.source, 0, 0, size.width, size.height);
    let dataUrl = canvas.toDataURL("image/jpeg", PHOTO_QUALITY);
    if (dataUrlBytes(dataUrl) > PHOTO_SEND_MAX_BYTES) dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    if (!dataUrl.startsWith("data:image/jpeg;base64,") || dataUrlBytes(dataUrl) > PHOTO_SEND_MAX_BYTES) {
      return { ok: false, message: PHOTO_BAD_FORMAT_MESSAGE };
    }
    return { ok: true, dataUrl };
  } catch {
    return { ok: false, message: "이 사진은 열 수 없어요. 다른 사진을 골라 주세요." };
  } finally {
    img.done();
    // 캔버스 메모리를 바로 놓는다(폰에서 큰 캔버스가 남아 있지 않게).
    canvas.width = 0;
    canvas.height = 0;
  }
}
