/**
 * 우리 가족 캐릭터 — 머리가 크게 나온 그림의 몸 늘이기(사장님 승인 2026-09-29 밤 "그래도 아빠 비율이랑 비교해봐 엄마가 아직도
 * 얼굴이 너무 크게 나왔어").
 *
 * 왜: 얼굴이 꽉 찬 사진(셀카)으로 그리면 그림 모델이 사진의 큰 얼굴을 그대로 옮긴다. 비율 견본·다시 그리기(lib/family-head
 * ①②)를 붙여도 엄마가 처음 3.94 → 다시 그림 4.56 에 머물러, 옆에 선 아빠(약 5.6)보다 얼굴이 눈에 띄게 컸다. 그림 모델에 또
 * 맡기면 값(약 95원)과 시간이 들고 또 안 따를 수 있어서, 마지막에 **값 없이 늘 같은 결과**로 몸을 늘인다.
 *
 * 어떻게: 머리 재기(lib/family-head-check)가 잰 머리·전신 상자로
 *  - 머리카락 맨 위 ~ 턱 아래 조금(목 윗부분, NECK_GAP)까지는 **그대로** — 얼굴을 건드리지 않아 닮음이 그대로 남는다.
 *  - 그 아래 ~ 발목쯤(전신 아래 FEET_SHARE 는 신발이라 그대로)까지의 띠만 **세로로** 한 번에 늘인다(bicubic — 아래 stretchFigure).
 *  - 가로는 그대로라 몸이 조금 날씬해 보인다(사장님이 받아들인 값).
 * 늘인 만큼 키가 커져 머리 비율(키 ÷ 머리)이 STRETCH_GOAL(표 × 0.8)쪽으로 간다. 띠 배율은 STRETCH_MAX 까지만.
 *
 * 언제: 잰 비율이 STRETCH_GOAL 보다 STRETCH_MARGIN 넘게 작을 때만(머리가 크다). 칩·사진·대신 그리기·모든 역할 같다.
 * 못 쟀으면(상자 없음) 늘이지 않는다. 머리가 작은 쪽(비율이 큼)은 건드리지 않는다.
 *
 * 흰 바탕 지우기(lib/cutout) **전에** 흰 바탕 그림에 한다 — 지우기가 늘인 뒤의 윤곽에서 알파를 새로 풀어서 가장자리가 깨끗하다
 * (투명 PNG 를 늘이면 알파도 번져 테두리에 옅은 띠·구멍이 생길 수 있다). 상자는 0~1000 비율이라 그림 크기에 그대로 맞는다.
 * 띠 경계에서 이어지는 줄은 원래 줄 그대로라 턱선·발목선에 끊김이 없다(띠 첫 줄 = 원래 띠 첫 줄, 끝 줄 = 원래 끝 줄).
 * 걸리는 시간: 그림 한 장 풀고·띠 늘이고·다시 PNG 로 — 보통 수십~백여 ms(sharp).
 *
 * 이 파일은 그림을 저장하거나 보내지 않는다. 부른 쪽(api/family/portrait)은 숫자(늘이기 전·후 비율, 배율)만 찍는다.
 */

import sharp from "sharp";
import { cleanHeadRatio, headRatioFromBoxes, type HeadBoxes } from "./family-head.ts";

/**
 * 늘여서 맞출 비율 = 표 × 이 값. 그림 모델은 머리를 표보다 20% 안팎 크게 그리는 버릇이 있어(lib/family-head 비율표),
 * 표 그대로(어른 7)로 늘이면 다른 식구(늘이지 않은 그림)보다 얼굴이 작아진다. 표 × 0.8 은 어른 5.6 — 사장님이 받아들인
 * 아빠(약 5.6)와 같고, 6살까지 아이 4.0 — 사장님이 고른 아이 앞 그림(약 4.2)은 건드리지 않는다. 다시 그릴지 가르는 선
 * (lib/family-head HEAD_TOO_BIG, 표 × 0.8)과도 같은 자리라 '봐줄 만한' 그림과 늘인 그림이 한 줄에 선다.
 */
export const STRETCH_GOAL_SHARE = 0.8;
/**
 * 아이(표 6 이하 — 12살까지)는 표 × 0.88 까지 늘인다 — 6살까지 4.4 · 7~9살 4.84 · 10~12살 5.28.
 * 사장님(2026-09-29, 늘인 어른 줄을 보고): "저 느낌으로 가면 될 듯 … 이제 아이까지도 저 느낌으로". 예시 아이 그림에
 * 1.15~1.35 를 대 보니 4.2~4.4 까지 자연스러웠다(얼굴은 그대로, 키가 크고 조금 날씬해짐). 사장님이 고른 아이 앞 그림
 * (약 4.2)은 여유폭 안이라 거의 그대로다. 단체 사진의 얼굴 크기는 얼굴 크기 비율표(lib/family-head)가 따로 맞춘다.
 */
export const KID_STRETCH_GOAL_SHARE = 0.88;
/**
 * 맞출 비율보다 이만큼 넘게 작을 때만 늘인다 — 어른이면 5.32 아래, 아이(표 5)면 4.18 아래.
 * 그 사이(얼굴 크기 5% 안팎 차이)는 눈에 안 띄고, 늘이면 괜히 날씬해진다.
 */
export const STRETCH_MARGIN = 0.05;
/**
 * 띠를 늘이는 배율 상한 — 눈으로 본 뒤 정했다(2026-09-29, 예시 엄마·아빠·아이 그림에 1.15·1.25·1.35·1.5 를 대 봄).
 * 1.35 까지는 키가 큰 사람처럼 자연스럽고 턱선·발목선에 이음매가 안 보인다(윗옷이 조금 길어지고 몸이 조금 날씬해진다).
 * 1.5 는 스웨터·셔츠·티셔츠가 튜닉처럼 길어지고 팔이 길쭉해 어색하다. 엄마 4.56 은 약 1.34 로 5.6 에 닿고,
 * 3.94 는 이 상한에서 약 4.8 까지 간다. 실제 Gemini 그림(손을 가슴에 얹은 엄마·아빠)으로도 봤다 — 1.35 는 150·400px 에서
 * 자연스럽고(3배 확대하면 손가락이 조금 길다), 1.45 는 봐줄 만하나 가늘고, 1.55 는 길쭉하다. 더 올려도 1.45 까지만.
 */
export const STRETCH_MAX = 1.35;
/**
 * 턱선 아래 머리 높이의 이만큼 내려가서부터 늘인다 — 글 모델의 턱 자리는 몇 칸(0~1000) 어긋나므로, 턱이 조금 높게 잡혀도
 * 턱·입이 늘어나지 않게 목 윗부분을 비워 둔다. 0.1 이면 턱을 머리 높이의 10% 높게 잡았을 때 얼굴 아래쪽이 조금 길어졌다
 * (2026-09-29 실제 그림에 대 봄, 20% 면 턱이 눈에 띄게 늘어남) — 0.15 로 여유를 둔다. 목은 짧아 띠가 거의 줄지 않는다
 * (엄마 4.56 은 여전히 상한 안에서 5.6, 3.94 는 약 4.81).
 */
export const NECK_GAP = 0.15;
/**
 * 전신(머리카락 맨 위 ~ 신발 바닥) 아래 이만큼은 그대로 — 신발이 길쭉해 보이지 않게 발목쯤에서 멈춘다.
 * 아이는 신발이 커서(전신의 약 9%) 조금 넉넉히 8% — 그래도 목이 긴 양말은 윗부분이 조금 늘어난다(눈으로 봐서 괜찮았다).
 */
export const FEET_SHARE = 0.08;
/** 늘일 띠가 이보다 짧으면(픽셀) 늘이지 않는다 — 상자가 이상한 것 */
const MIN_BAND_PX = 40;

/** 이 사람의 늘여서 맞출 비율 — 어른·청소년은 표 × STRETCH_GOAL_SHARE, 아이(표 6 이하)는 표 × KID_STRETCH_GOAL_SHARE */
export function stretchGoal(chart: number): number {
  return chart * (chart <= 6 ? KID_STRETCH_GOAL_SHARE : STRETCH_GOAL_SHARE);
}

export type StretchPlan = {
  /** 늘이기 시작 줄(픽셀) — 이 줄 위(머리·목 윗부분)는 그대로 */
  top: number;
  /** 늘이기 끝 줄(픽셀, 이 줄은 안 든다) — 이 줄부터 아래(발목 아래·신발)는 그대로 */
  bottom: number;
  /** 늘인 띠의 새 높이(픽셀) */
  bandOut: number;
  /** 그림의 새 높이(픽셀) — 가로는 그대로 */
  height: number;
  /** 띠를 늘인 배율(bandOut ÷ (bottom − top)) */
  factor: number;
  /** 잰 비율(늘이기 전) */
  before: number;
  /** 늘인 뒤 비율(0.01 단위) — 머리는 그대로, 키만 늘었다. 저장·단체 사진에 쓴다. */
  after: number;
};

/**
 * 늘일지·얼마나 — 상자(0~1000)와 그림 높이(픽셀)로 셈만 한다. 늘일 까닭이 없거나 상자를 믿을 수 없으면 null.
 * 비율은 머리 재기와 같은 정의(lib/family-head headRatioFromBoxes — 키 = 머리카락 맨 위 ~ 신발 바닥).
 */
export function planStretch(o: { boxes: HeadBoxes; height: number; chart: number }): StretchPlan | null {
  const { head, figure } = o.boxes;
  const H = o.height;
  if (!Number.isInteger(H) || H <= 0 || !(o.chart > 0)) return null;
  const before = headRatioFromBoxes(head, figure);
  if (before === null) return null;
  const goal = stretchGoal(o.chart);
  if (!(before < goal * (1 - STRETCH_MARGIN))) return null;

  const px = (v: number) => (v / 1000) * H;
  const headTop = px(head[0]);
  const chin = px(head[2]);
  const feet = px(figure[2]);
  const headH = chin - headTop;
  const tall = feet - headTop;
  const top = Math.round(chin + NECK_GAP * headH);
  const bottom = Math.round(feet - FEET_SHARE * tall);
  const band = bottom - top;
  if (band < MIN_BAND_PX || top < 0 || bottom > H) return null;

  // 머리는 그대로이니 늘인 뒤 비율 = (키 + 늘어난 만큼) ÷ 머리. 맞출 비율에 닿는 배율, 상한까지만(픽셀 반올림도 상한을 넘지 않게).
  const want = 1 + (goal * headH - tall) / band;
  const bandOut = Math.min(Math.round(band * want), Math.floor(band * STRETCH_MAX));
  if (bandOut <= band) return null;
  const after = cleanHeadRatio((tall + bandOut - band) / headH);
  if (after === undefined) return null;
  return { top, bottom, bandOut, height: H + bandOut - band, factor: bandOut / band, before, after };
}

/**
 * 잰 그림을 건넬 때의 비율 — 늘일 그림이면 늘인 뒤 비율, 아니면 잰 비율 그대로. 머리 재기가 처음·다시 그린 그림을 견줄 때
 * 쓴다(lib/family-head-check evenOutHead effective): 머리가 큰 그림은 뒤에서 값 없이 늘여 고치므로 늘인 뒤 값으로 견준다.
 * 상자는 0~1000 비율이라 높이 1000 으로 셈한다(실제 그림 높이로 셈한 값과 0.01 안팎 차이). 상자가 없으면 늘이지 않으니 그대로.
 */
export function ratioAfterStretch(ratio: number, boxes: HeadBoxes | null, chart: number): number {
  if (!boxes) return ratio;
  return planStretch({ boxes, height: 1000, chart })?.after ?? ratio;
}

/**
 * 흰 바탕 그림(그린 그대로, 지우기 전) → 몸을 늘인 PNG. 늘일 까닭이 없으면 null(부른 쪽은 원래 그림을 쓴다).
 * 채널(알파 있음·없음)은 들어온 그대로 둔다. 띠만 한 번에 늘이고 위·아래 줄은 원래 픽셀 그대로 잇는다.
 * 늘이기는 bicubic — sharp 는 키울 때 kernel 을 보간(nearest·linear·cubic)으로 바꿔 쓰고 lanczos 는 cubic 이 된다
 * (sharp 0.34 문서, lanczos 는 줄일 때만). 그래서 kernel 을 cubic 으로 적어 둔다(lanczos3 로 적어도 결과가 같다 — 2026-09-29 확인).
 * 던질 수 있다(그림을 못 읽음 등) — 부른 쪽은 잡아서 원래 그림으로 간다.
 */
export async function stretchFigure(
  input: Buffer,
  o: { boxes: HeadBoxes; chart: number },
): Promise<{ image: Buffer; plan: StretchPlan } | null> {
  const { data, info } = await sharp(input).raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const plan = planStretch({ boxes: o.boxes, height: H, chart: o.chart });
  if (!plan) return null;

  const row = W * C;
  const band = await sharp(data.subarray(plan.top * row, plan.bottom * row), {
    raw: { width: W, height: plan.bottom - plan.top, channels: C },
  })
    .resize(W, plan.bandOut, { fit: "fill", kernel: "cubic" })
    .raw()
    .toBuffer();
  const out = Buffer.concat([data.subarray(0, plan.top * row), band, data.subarray(plan.bottom * row)]);
  // 곧바로 지우기(lib/cutout)가 다시 풀 중간 그림이라 압축은 가볍게 — 빨리 만드는 쪽.
  const image = await sharp(out, { raw: { width: W, height: plan.height, channels: C } })
    .png({ compressionLevel: 1 })
    .toBuffer();
  return { image, plan };
}
