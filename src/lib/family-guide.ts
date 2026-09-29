/**
 * 우리 가족 캐릭터 — 비율 견본 그림(사장님 승인 2026-09-29, lib/family-head ①).
 *
 * 글로 '머리는 키의 1/5.5'라고 적어도 Gemini 는 어른을 1:4 쯤으로 그렸다. 그래서 표의 비율대로 선 민무늬 회색 마네킹
 * (정면·선 자세·팔은 몸에서 조금 떨어짐·흰 바탕, 머리 높이마다 옅은 가로줄, 글자·숫자 없음)을 참고 그림으로 붙인다.
 * 프롬프트(lib/family-portrait-prompt)는 이 그림을 '머리:키 비율만 맞출 것 — 마네킹 몸 모양·회색·줄·빈 얼굴은 절대 따라 하지
 * 말 것(자세는 POSE 줄)'으로 적는다. 마네킹 머리(달걀 위 ~ 턱)는 그리는 사람의 '머리카락 맨 위 ~ 턱'에 맞춘다고 적는다.
 *
 * 파일로 두지 않고 서버가 그때그때 SVG → PNG 로 만든다(sharp, 수십 ms, 인스턴스마다 비율별로 한 번만 만들고 기억한다).
 * 우리 주소로 받아 오는 길(그림체 견본처럼)이 없어 느려지거나 실패할 일이 없고, 비율표를 바꾸면 그림도 따라 바뀐다.
 * 값이 들지 않는다. 만들기에 실패하면 null — 견본 없이 예전처럼 그린다.
 * 눈으로 보려면: node -e "import('./src/lib/family-guide.ts').then(async m=>require('fs').writeFileSync('g.png',Buffer.from((await m.guideImage(5.5)).data,'base64')))"
 */

import sharp from "sharp";
import type { GeneratedImage } from "./gemini.ts";

/** 3:4 — 그리는 그림(3:4 전신)과 같은 비, 작게(참고 그림은 비율만 보여 주면 된다) */
export const GUIDE_WIDTH = 480;
export const GUIDE_HEIGHT = 640;
/** 위·아래 여백 — 그림 프롬프트 FRAMING(위아래 6~10%)의 가운데 */
export const GUIDE_MARGIN = 0.08;

const FIGURE = "#b4b4b4";
/**
 * 가로줄 — 236(#ececec) 이상으로 옅게. 흰 바탕 지우기(lib/cutout WHITE_MIN 236)가 '거의 흰색'으로 보는 밝기라,
 * 그림 모델이 줄을 따라 그려 버려도 바탕과 함께 지워진다(더 짙으면 투명 PNG 에 반투명 회색 줄로 남는다).
 */
export const GUIDE_LINE = "#ececec";

/** 소수 한 자리로 — SVG 글이 짧고 같은 값이면 늘 같은 글이 나오게 */
const n = (x: number) => String(Math.round(x * 10) / 10);

/**
 * 비율 견본 SVG. ratio = 키 ÷ 머리(4 · 4.5 · 5 · 5.5 …).
 * 머리(타원 위 ~ 턱)가 정확히 키(머리 위 ~ 발바닥)의 1/ratio 이고, 가로줄은 머리 위부터 머리 높이마다 + 발바닥에 긋는다.
 * 몸(목·몸통·팔·다리·발) 모양은 비율에 맞춰 대충만 — 아이 비율(1:5 아래)은 다리가 짧고 어깨가 좁다.
 */
export function guideSvg(ratio: number): string {
  const W = GUIDE_WIDTH;
  const H = GUIDE_HEIGHT;
  const top = H * GUIDE_MARGIN;
  const sole = H - H * GUIDE_MARGIN;
  const tall = sole - top;
  const head = tall / ratio;
  const cx = W / 2;
  const kid = ratio < 5;

  const headW = head * (kid ? 0.8 : 0.74);
  const chin = top + head;
  const shoulderY = chin + head * 0.16;
  // 다리(가랑이 ~ 발바닥)가 키에서 차지하는 몫 — 1:4 는 0.38, 1:5.5 는 0.46 쯤
  const legShare = Math.min(0.48, Math.max(0.36, 0.38 + (ratio - 4) * 0.055));
  const crotchY = sole - tall * legShare;
  const shoulderW = tall * (kid ? 0.235 : 0.25);
  const hipW = shoulderW * 0.8;
  const round = shoulderW * 0.2;

  const armW = tall * (kid ? 0.055 : 0.05);
  const legW = tall * (kid ? 0.08 : 0.072);
  const footH = tall * 0.035;
  // 다리 바깥 선이 엉덩이 선과 맞게(엉덩이 모서리가 삐져나오지 않게)
  const legX = hipW / 2 - legW / 2 - hipW * 0.02;
  // 팔 — 어깨에서 허벅지 위까지, 몸에서 조금 떨어지게 비스듬히(손이 몸에 닿지 않게: 그림 프롬프트 POSE 와 같은 자세)
  const armTopX = shoulderW / 2 - armW * 0.55;
  const armTopY = shoulderY + armW * 0.6;
  const handX = shoulderW / 2 + tall * 0.045;
  const handY = crotchY + tall * 0.04;
  // 다리 — 둥근 끝이 발바닥 조금 위에서 끝나게(발 타원이 발바닥을 맡는다)
  const legTop = crotchY - legW * 0.3;
  const legBottom = sole - footH * 0.4 - legW / 2;

  const lines: number[] = [];
  for (let k = 0; k <= Math.floor(ratio + 1e-9); k++) lines.push(top + k * head);
  if (sole - lines[lines.length - 1] > 1) lines.push(sole);

  const torso = [
    `M${n(cx - shoulderW / 2 + round)} ${n(shoulderY)}`,
    `L${n(cx + shoulderW / 2 - round)} ${n(shoulderY)}`,
    `Q${n(cx + shoulderW / 2)} ${n(shoulderY)} ${n(cx + shoulderW / 2)} ${n(shoulderY + round)}`,
    `L${n(cx + hipW / 2)} ${n(crotchY)}`,
    `Q${n(cx)} ${n(crotchY + legW * 0.35)} ${n(cx - hipW / 2)} ${n(crotchY)}`,
    `L${n(cx - shoulderW / 2)} ${n(shoulderY + round)}`,
    `Q${n(cx - shoulderW / 2)} ${n(shoulderY)} ${n(cx - shoulderW / 2 + round)} ${n(shoulderY)}`,
    "Z",
  ].join(" ");

  const limb = (x1: number, y1: number, x2: number, y2: number, w: number) =>
    `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${FIGURE}" stroke-width="${n(w)}" stroke-linecap="round"/>`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="#ffffff"/>`,
    ...lines.map(
      (y) => `<line x1="${n(W * 0.08)}" y1="${n(y)}" x2="${n(W * 0.92)}" y2="${n(y)}" stroke="${GUIDE_LINE}" stroke-width="2"/>`,
    ),
    `<g fill="${FIGURE}">`,
    // 머리 — 위 = top, 아래(턱) = chin. 목이 턱 아래로만 보이게 목을 먼저 깐다.
    `<rect x="${n(cx - headW * 0.17)}" y="${n(chin - head * 0.2)}" width="${n(headW * 0.34)}" height="${n(shoulderY - chin + head * 0.3)}" rx="${n(headW * 0.08)}"/>`,
    `<ellipse cx="${n(cx)}" cy="${n(top + head / 2)}" rx="${n(headW / 2)}" ry="${n(head / 2)}"/>`,
    `<path d="${torso}"/>`,
    `<ellipse cx="${n(cx - legX - legW * 0.12)}" cy="${n(sole - footH / 2)}" rx="${n(legW * 0.62)}" ry="${n(footH / 2)}"/>`,
    `<ellipse cx="${n(cx + legX + legW * 0.12)}" cy="${n(sole - footH / 2)}" rx="${n(legW * 0.62)}" ry="${n(footH / 2)}"/>`,
    "</g>",
    limb(cx - armTopX, armTopY, cx - handX, handY, armW),
    limb(cx + armTopX, armTopY, cx + handX, handY, armW),
    limb(cx - legX, legTop, cx - legX, legBottom, legW),
    limb(cx + legX, legTop, cx + legX, legBottom, legW),
    "</svg>",
  ].join("");
}

/** 비율별로 한 번만 만든다(인스턴스 메모리). 실패하면 기억하지 않는다 — 다음 요청이 다시 해 본다. */
const made = new Map<number, Promise<GeneratedImage | null>>();

/**
 * 비율 견본 PNG(참고 그림 꼴). 절대 던지지 않는다 — 실패하면 null(견본 없이 그린다).
 * 팔레트 PNG 라 몇 KB 다(회색 둘·흰색뿐).
 */
export function guideImage(ratio: number): Promise<GeneratedImage | null> {
  if (!(ratio >= 2 && ratio <= 10)) return Promise.resolve(null);
  const key = Math.round(ratio * 100) / 100;
  const hit = made.get(key);
  if (hit) return hit;
  const job = sharp(Buffer.from(guideSvg(key)))
    .png({ palette: true, colours: 16, compressionLevel: 9 })
    .toBuffer()
    .then(
      (buf): GeneratedImage => ({ mimeType: "image/png", data: buf.toString("base64") }),
      () => {
        made.delete(key);
        return null;
      },
    );
  made.set(key, job);
  return job;
}
