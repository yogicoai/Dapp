/**
 * 가족 사진관 '옷 갈아입기'의 그림 다루기(서버 전용 — sharp). 셈은 모두 lib/family-outfit(순수 함수)에 있고, 여기는
 * 그림을 풀고(PNG·WEBP → RGBA) 키우고/줄이고 다시 무손실로 싸는 일만 한다. 화면에서 부르지 말 것(sharp 가 딸려 간다).
 * 그림 모델·토큰·DB 는 부르지 않는다 — 고객 한 명에 드는 돈 0원(lib/family-outfit 머리말).
 *
 *  prepareHead(원본) — 원본 그림(고정된 투명 PNG, 흰 바탕 그림이면 먼저 바탕을 지운다)에서 목 줄을 찾아 머리 층을 뗀다.
 *    원본이 옷을 갈아입힐 수 없는 그림이면 OutfitError('source-…').
 *  composeWithBody(준비, 몸 그림, 몸 칸) — 몸 창고의 머리 없는 몸을 원본 목 줄·발끝에 맞춰 키우고/줄이고, 목 폭·목과 손 살색을
 *    원본에 맞춘 뒤, 목 위는 지우고 원래 머리 층을 **한 픽셀도 바꾸지 않고** 얹어 무손실 그림으로. 몸이 이상하면 OutfitError('body-…').
 */

import sharp from "sharp";
import { removeWhiteBackground } from "./cutout.ts";
import {
  bodyNeckColor,
  bodyOverlap,
  bodySolidDepth,
  composeOutfit,
  findNeck,
  fitNeckWidth,
  joinRows,
  matchBodySkin,
  matchNeckJoin,
  neckBandEnd,
  neckCentre,
  neckFitRatio,
  placeBody,
  scaleBodyMeta,
  skinTarget,
  splitHead,
  trimToContent,
  type BodyMeta,
  type BodyPlacement,
  type HeadSplit,
  type NeckFind,
  type Rgb,
  type RgbaImage,
} from "./family-outfit.ts";

export type OutfitErrorCode = "source-read" | "source-opaque" | "source-neck" | "body-read" | "body-meta" | "compose";

/** 옷 갈아입기 실패 — code 만 로그·응답에 싣는다(그림은 싣지 않는다) */
export class OutfitError extends Error {
  readonly code: OutfitErrorCode;
  readonly detail?: string;
  constructor(code: OutfitErrorCode, detail?: string) {
    super(`옷 갈아입기 실패 (${code}${detail ? ` ${detail}` : ""})`);
    this.name = "OutfitError";
    this.code = code;
    this.detail = detail;
  }
}

/** 풀어 볼 그림의 픽셀 상한 — 가족 그림은 가로 720 안팎(약 150만 픽셀), 몸 창고 몸도 몇백만 픽셀. 압축 폭탄을 막는다. */
export const OUTFIT_MAX_PIXELS = 16_000_000;

export type HeadPrep = {
  /** 원본(바탕 지운 투명 RGBA) 크기 */
  width: number;
  height: number;
  neck: NeckFind;
  split: HeadSplit;
  /** 원본 RGBA — 살색 맞추기에 쓴다(이 요청 메모리에만) */
  original: RgbaImage;
  /** 원본을 흰 바탕에서 지웠나(opaque 원본) */
  cutoutSource: boolean;
};

async function toRgba(input: Buffer): Promise<RgbaImage> {
  const { data, info } = await sharp(input, { limitInputPixels: OUTFIT_MAX_PIXELS })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) throw new Error("RGBA 가 아님");
  return { data, width: info.width, height: info.height };
}

/** 네 귀퉁이가 거의 다 불투명이면 흰 바탕 그림(opaque 원본)이다 */
function looksOpaque(img: RgbaImage): boolean {
  const { width: W, height: H, data } = img;
  const corners = [0, W - 1, (H - 1) * W, H * W - 1];
  return corners.filter((p) => data[p * 4 + 3] > 200).length >= 3;
}

/**
 * 원본 → 목 줄·머리 층. headRatio 는 원본 그림에 적힌 잰 머리 비율(없으면 폭만 보고 찾는다),
 * fallbackRatio 는 비율이 없을 때 머리카락·살색을 뜰 자리 어림(표 비율 × 0.8), opaque 는 흰 바탕 원본.
 */
export async function prepareHead(
  source: Buffer,
  o: { headRatio?: number; fallbackRatio?: number; opaque?: boolean } = {},
): Promise<HeadPrep> {
  let img: RgbaImage;
  try {
    img = await toRgba(source);
  } catch {
    throw new OutfitError("source-read");
  }
  let cutoutSource = false;
  if (o.opaque || looksOpaque(img)) {
    const cut = await removeWhiteBackground(source).catch(() => null);
    if (!cut || !cut.transparent) throw new OutfitError("source-opaque");
    img = await toRgba(cut.png);
    cutoutSource = true;
  }
  const neck = findNeck(img, { headRatio: o.headRatio, fallbackRatio: o.fallbackRatio });
  if (!neck) throw new OutfitError("source-neck");
  const split = splitHead(img, neck);
  return { width: img.width, height: img.height, neck, split, original: img, cutoutSource };
}

export type ComposeStats = {
  place: BodyPlacement;
  /** 몸 목을 cut 위로 겹친 줄 수 */
  overlap: number;
  /** 목 폭 맞추기 배율(1 이면 안 함)·고친 줄 수 */
  neckFit: number;
  neckRows: number;
  /** 살색을 옮긴 만큼(안 했으면 null) */
  skinShift: Rgb | null;
  /** 목 이음매에서 옮긴 색 차이(안 했으면 null) */
  joined: Rgb | null;
};

export type OutfitImage = {
  /** 무손실 그림(WebP lossless — 머리 층 픽셀이 그대로다) */
  data: Buffer;
  ext: "webp";
  contentType: "image/webp";
  width: number;
  height: number;
  /** 원본 그림 (0,0)이 결과 그림에서 놓인 자리 — 머리 층이 한 픽셀도 안 바뀌었는지 시험이 견준다 */
  offsetX: number;
  offsetY: number;
  stats: ComposeStats;
};

/**
 * 몸만 팔레트로 줄이기(고를 수 있음 — 기본 null = 안 한다, 몸 창고 그림 그대로).
 * 결과는 무손실이라 가로 720 가족 그림이면 한 사람 옷 그림이 0.6~0.9MB 다(원본 가족 그림 ~0.15MB). 홈이 무겁게 느껴지면
 * 128 로 바꾼다 — 원본 배율로 맞춘 몸을 128색으로 줄인 뒤 합쳐 0.25MB 안팎이 된다. 얼굴·머리 층은 그대로이고, 옷의 작은 무늬
 * 색이 조금 바뀔 수 있다(시험 그림: 티셔츠의 노란 해가 살구색으로).
 */
export const OUTFIT_BODY_COLOURS: number | null = null;

/**
 * 무손실로 싼다 — 머리 층(원본 얼굴)의 픽셀을 한 개도 바꾸지 않는다(팔레트 PNG 로 줄이면 얼굴 색이 다른 칸으로 옮겨질 수 있다).
 * WebP 무손실은 같은 그림의 무손실 PNG 보다 가볍다(홈에 여러 사람이 뜬다). 알파가 0 인(보이지 않는) 픽셀의 색만 바뀔 수 있고
 * 보이는 픽셀은 RGBA 그대로다(시험이 머리 층을 한 바이트씩 견준다).
 */
export async function encodeOutfit(img: RgbaImage): Promise<Buffer> {
  return sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } })
    .webp({ lossless: true, effort: 4 })
    .toBuffer();
}

/**
 * 몸 창고 몸(투명 WebP·PNG) + 칸 → 합친 투명 그림과 셈 기록. 원본 그림의 머리 층은 한 픽셀도 바꾸지 않고 얹는다.
 *  ① 몸 풀기(칸 크기와 다르면 비율이 같을 때만 칸을 옮긴다)
 *  ② 몸 목 줄 → 원본 cut 조금 위(겹침 — 몸 목 맨 윗줄의 옅은 가장자리는 지워진다), 몸 발끝 → 원본 발끝(같은 배율), 목 가운데 맞추기
 *  ③ 목 폭 맞추기(목 둘레만 — 어깨·옷은 그대로)
 *  ④ 살색 맞추기(목·손·팔·다리 덩어리만, 한 채널 SKIN_SHIFT_MAX 까지)
 *  ⑤ 목 이음매(원본 목 끝줄 색을 몸 목 위쪽 몇 줄에 옅어지게)
 *  ⑥ 합치기(목 위 지우기 · 발끝 아래 자르기 · 머리 층 얹기) → 잘라 내기 → 무손실로 싸기
 */
export async function composeWithBody(
  prep: HeadPrep,
  bodyImage: Buffer,
  rawMeta: BodyMeta,
  opts: { bodyColours?: number | null } = {},
): Promise<OutfitImage> {
  const bodyColours = opts.bodyColours === undefined ? OUTFIT_BODY_COLOURS : opts.bodyColours;
  // ①
  let raw: RgbaImage;
  try {
    raw = await toRgba(bodyImage);
  } catch {
    throw new OutfitError("body-read");
  }
  const meta = scaleBodyMeta(rawMeta, raw.width, raw.height);
  if (!meta) throw new OutfitError("body-meta", "size");

  // ② — 가운데는 원본 목 바깥 폭 가운데(픽셀 번호 — placeBody 가 반 픽셀을 더해 이어진 좌표로)
  const { neck } = prep;
  const centre = neckCentre(neck);
  // 몸 목 윗가장자리(반투명)가 cut 위로 올라가 지워질 만큼 겹친다
  const scale0 = (neck.bottom - neck.cut) / Math.max(1, meta.feetY - meta.neckY);
  const overlap = bodyOverlap(neck.head, bodySolidDepth(raw, meta), scale0);
  const place = placeBody({ cut: neck.cut, bottom: neck.bottom, cx: centre }, meta, overlap);
  if (!place) throw new OutfitError("body-meta", "span");
  let body: RgbaImage;
  try {
    const { data, info } = await sharp(raw.data, { raw: { width: raw.width, height: raw.height, channels: 4 } })
      .resize(place.width, place.height, { fit: "fill", kernel: place.scale > 1 ? "cubic" : "lanczos3" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.channels !== 4) throw new Error("RGBA 가 아님");
    body = { data, width: info.width, height: info.height };
  } catch {
    throw new OutfitError("compose", "resize");
  }

  // ③ — 겹친 몸 목 맨 윗줄부터
  const k0 = neckFitRatio(neck, meta, place.scale);
  const to = neckBandEnd(body, place, neck);
  const neckRows = fitNeckWidth(body, {
    left: place.left,
    top: place.top,
    cut: neck.cut - overlap,
    to,
    cx: centre + 0.5,
    k0,
  });

  // ④ — 몸 살색은 칸 값이 먼저, 없으면 맞춘 몸 목에서 뜬다
  const target = skinTarget(prep.original, neck);
  const source = meta.skin ?? bodyNeckColor(body, place, neck);
  const band = Math.max(2, Math.round(0.12 * neck.head));
  const skinShift =
    target && source
      ? matchBodySkin(body, { source, target, neckRows: [neck.cut - place.top, neck.cut - place.top + band] })
      : null;

  // ⑤
  const joined = matchNeckJoin(body, place, prep.original, neck, {
    x0: neck.outerLeft - 2,
    x1: neck.outerRight + 2,
    rows: joinRows(neck.head),
  });

  // (고를 수 있음) 몸만 팔레트로 — 머리 층은 건드리지 않는다
  if (bodyColours && bodyColours >= 2 && bodyColours <= 256) {
    try {
      const pal = await sharp(body.data, { raw: { width: body.width, height: body.height, channels: 4 } })
        .png({ palette: true, colours: Math.round(bodyColours), dither: 1, effort: 8 })
        .toBuffer();
      body = await toRgba(pal);
    } catch {
      throw new OutfitError("compose", "palette");
    }
  }

  // ⑥
  const composed = composeOutfit({
    head: prep.split.head,
    body,
    left: place.left,
    top: place.top,
    cut: neck.cut,
    bottom: neck.bottom,
  });
  const trimmed = trimToContent(composed.image);
  if (!trimmed) throw new OutfitError("compose", "empty");
  const data = await encodeOutfit(trimmed.image);
  return {
    data,
    ext: "webp",
    contentType: "image/webp",
    width: trimmed.image.width,
    height: trimmed.image.height,
    offsetX: composed.ox - trimmed.x,
    offsetY: composed.oy - trimmed.y,
    stats: { place, overlap, neckFit: neckRows > 0 ? k0 : 1, neckRows, skinShift, joined },
  };
}
