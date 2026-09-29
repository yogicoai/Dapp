/**
 * 우리 가족 캐릭터 '사진으로 할게요' — 얼굴 클로즈업 참고 그림(사장님 2026-09-29 "아이와 부모 얼굴이 조금 더 비슷하게 —
 * 그림만 보고도 누구다 이런 느낌 날 수 있게").
 *
 * 상반신·전신 사진에서 얼굴은 작다(긴 변 1024px 사진에 얼굴 100~250px). 그림 모델이 사진을 통째로 보면 눈매·눈썹·턱처럼
 * 사람을 알아보게 하는 곳이 평균 얼굴 쪽으로 흐려진다. 그래서 특징 카드(lib/family-photo-card)가 같은 답에 함께 적어 주는
 * 얼굴 상자(face box — [위, 왼, 아래, 오른] 0~1000 비율, 머리 재기와 같은 꼴, 이마 ~ 턱 · 귀 ~ 귀)로 사진에서 얼굴을
 * 넉넉히(머리카락·턱·목 조금) 3:4 로 잘라, 조금 키운(긴 변 CLOSEUP_LONG_SIDE 까지, 많아야 CLOSEUP_MAX_UPSCALE 배) JPEG 를
 * 사진 바로 뒤(둘째) 참고 그림으로 붙인다(api/family/portrait). 글 모델은 예전 그대로 한 번이라 값이 거의 늘지 않는다.
 *
 * 쓰지 않는 때 — 조용히 넘어가 클로즈업 없이 예전처럼 그린다(null):
 *  - 상자가 이상하다: 얼굴이 너무 작다(CLOSEUP_MIN_FACE_PX — 키워도 뭉개진다), 얼굴 꼴이 아니다(가로:세로가 너무 납작하거나 길쭉하다)
 *  - 사진이 이미 얼굴 사진이다: 자른 칸이 사진의 CLOSEUP_MAX_SHARE 를 넘는다 — 더 보여 줄 게 없다(참고 그림만 늘어난다)
 *  - 사진에 회전 정보(EXIF orientation)가 있다: 글 모델이 잰 상자와 우리가 자르는 방향이 어긋날 수 있다. 화면은 캔버스로
 *    다시 구워 보내 회전 정보가 없다(components/family/photo.ts) — 경로를 직접 부른 사진만 해당된다.
 *  - 풀기·자르기 실패
 *
 * 개인정보: 클로즈업은 사진에서 잘라 낸 것이라 **사진과 똑같이 다룬다** — 이 요청 메모리에서 그림 모델로 넘기기만 하고
 * DB·cafe24·로그·응답 어디에도 넣지 않으며, 사진을 버릴 때 같이 버린다. 얼굴 상자 숫자도 찍지 않는다.
 * 자르는 셈(faceCropRect·closeUpSize)은 순수 함수라 node --test 로 시험한다(family-closeup.test.ts).
 */

import sharp from "sharp";
import type { Box } from "./family-head.ts";
import type { PortraitPhoto } from "./family-photo.ts";
import type { GeneratedImage } from "./gemini.ts";

/** 클로즈업 긴 변 — 그림 모델이 얼굴을 한 조각(768px 안팎)으로 크게 보게. 이보다 크면 줄인다. */
export const CLOSEUP_LONG_SIDE = 768;
/** 키우기 상한 — 작은 얼굴을 너무 키우면 뭉갠 얼굴이 기준이 된다 */
export const CLOSEUP_MAX_UPSCALE = 3;
/** 얼굴 상자의 짧은 변이 이보다 작으면(사진 픽셀) 클로즈업을 만들지 않는다 */
export const CLOSEUP_MIN_FACE_PX = 48;
/** 자른 칸이 사진 넓이의 이 몫을 넘으면 사진이 이미 얼굴 사진이다 — 만들지 않는다 */
export const CLOSEUP_MAX_SHARE = 0.5;
/** 자르는 꼴 — 가로 : 세로 = 3 : 4(머리·목이 드는 세로 꼴) */
export const CLOSEUP_ASPECT = 3 / 4;
/**
 * 얼굴 상자(이마 ~ 턱, 귀 ~ 귀) 둘레에 더하는 여백 — 얼굴 높이(위·아래)와 너비(양옆)에 대한 몫.
 * 위는 머리카락(부푼 파마·올림머리까지), 아래는 턱과 목 조금, 옆은 귀와 옆머리.
 */
export const CLOSEUP_MARGIN = { top: 0.65, bottom: 0.35, side: 0.4 } as const;
/** 얼굴 상자 가로 ÷ 세로(픽셀) 범위 — 이 밖이면 얼굴 상자가 아니다(몸 전체 상자·가로로 뭉갠 상자 …) */
const FACE_ASPECT_MIN = 0.45;
const FACE_ASPECT_MAX = 1.6;
/** 클로즈업 JPEG 품질 — 얼굴 결이 살게 조금 높게 */
const CLOSEUP_QUALITY = 88;

/** 사진에서 자를 칸(정수 픽셀, sharp extract 꼴) */
export type CropRect = { left: number; top: number; width: number; height: number };

/**
 * 얼굴 상자 → 자를 칸. 여백을 더하고 3:4 로 맞춘 뒤(모자란 쪽을 가운데 기준으로 넓힌다) 사진 안으로 민다.
 * 사진보다 크면 사진 크기로 줄인다(꼴이 조금 달라져도 얼굴은 자르지 않는다). 쓰지 않을 상자(머리글)면 null.
 * width·height 는 사진 픽셀 크기(회전 정보를 적용하지 않은 그대로).
 */
export function faceCropRect(box: Box, width: number, height: number): CropRect | null {
  if (!(Number.isInteger(width) && Number.isInteger(height) && width >= 1 && height >= 1)) return null;
  const [y0, x0, y1, x1] = box;
  const faceLeft = (x0 / 1000) * width;
  const faceTop = (y0 / 1000) * height;
  const faceW = ((x1 - x0) / 1000) * width;
  const faceH = ((y1 - y0) / 1000) * height;
  if (!(Math.min(faceW, faceH) >= CLOSEUP_MIN_FACE_PX)) return null;
  const aspect = faceW / faceH;
  if (aspect < FACE_ASPECT_MIN || aspect > FACE_ASPECT_MAX) return null;

  let left = faceLeft - faceW * CLOSEUP_MARGIN.side;
  let top = faceTop - faceH * CLOSEUP_MARGIN.top;
  let w = faceW * (1 + 2 * CLOSEUP_MARGIN.side);
  let h = faceH * (1 + CLOSEUP_MARGIN.top + CLOSEUP_MARGIN.bottom);
  if (w / h < CLOSEUP_ASPECT) {
    const grown = h * CLOSEUP_ASPECT;
    left -= (grown - w) / 2;
    w = grown;
  } else {
    const grown = w / CLOSEUP_ASPECT;
    top -= (grown - h) / 2;
    h = grown;
  }
  w = Math.min(w, width);
  h = Math.min(h, height);
  left = Math.min(Math.max(left, 0), width - w);
  top = Math.min(Math.max(top, 0), height - h);

  // 정수 픽셀로 — 사진 밖으로 한 픽셀도 나가지 않게(sharp extract 는 넘으면 던진다)
  const l = Math.floor(left);
  const t = Math.floor(top);
  const rect: CropRect = {
    left: l,
    top: t,
    width: Math.max(1, Math.min(width - l, Math.round(w))),
    height: Math.max(1, Math.min(height - t, Math.round(h))),
  };
  if ((rect.width * rect.height) / (width * height) > CLOSEUP_MAX_SHARE) return null;
  return rect;
}

/** 자른 칸 → 클로즈업 크기. 긴 변을 CLOSEUP_LONG_SIDE 로(키우는 건 CLOSEUP_MAX_UPSCALE 배까지), 꼴은 그대로. */
export function closeUpSize(rect: { width: number; height: number }): { width: number; height: number } {
  const k = Math.min(CLOSEUP_LONG_SIDE / Math.max(rect.width, rect.height), CLOSEUP_MAX_UPSCALE);
  return { width: Math.max(1, Math.round(rect.width * k)), height: Math.max(1, Math.round(rect.height * k)) };
}

/**
 * 사진 + 얼굴 상자 → 얼굴 클로즈업 JPEG(참고 그림 꼴). 절대 던지지 않는다 — 쓰지 않을 때(머리글)나 실패하면 null.
 * 오류를 찍지 않는다(사진에서 나온 것이라).
 */
export async function faceCloseUp(photo: PortraitPhoto, box: Box): Promise<GeneratedImage | null> {
  try {
    const buf = Buffer.from(photo.data, "base64");
    const meta = await sharp(buf).metadata();
    if (meta.orientation !== undefined && meta.orientation !== 1) return null;
    const rect = faceCropRect(box, meta.width, meta.height);
    if (!rect) return null;
    const size = closeUpSize(rect);
    const out = await sharp(buf)
      .extract(rect)
      .resize(size.width, size.height, { fit: "fill", kernel: "lanczos3" })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: CLOSEUP_QUALITY })
      .toBuffer();
    return { mimeType: "image/jpeg", data: out.toString("base64") };
  } catch {
    return null;
  }
}
