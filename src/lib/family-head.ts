/**
 * 우리 가족 캐릭터 — 머리 비율(키 ÷ 머리). 사장님 2026-09-29: "지금도 생성한거 보면 아빠만 머리가 너무 크게 나와".
 *
 * 사람마다 따로 그려 단체 사진(components/family/FamilyGroupPhoto)에서 실제 키 비율로 나란히 세운다. 그래서 그림마다
 * 머리 비율이 다르면 얼굴 크기가 들쭉날쭉해진다. 프롬프트에 비율표를 적어도 Gemini 는 어른 남자를 1:4 쯤으로 그려
 * (표는 1:5.5) 아빠 얼굴만 커 보였다. 고치는 길(사장님 승인):
 *  ① 비율 견본 그림 — 표의 비율로 선 회색 마네킹을 참고 그림으로 붙인다(lib/family-guide, 값 없음).
 *  ② 그린 뒤 머리 재기 — 값싼 글 모델로 머리·전신 상자를 재고, 표에서 많이 벗어나면 같은 쿠키로 한 번만 다시 그려
 *     표에 더 가까운 쪽을 남긴다(lib/family-head-check, api/family/portrait). 다시 그리기는 사진이 아니라 **처음 그림**을
 *     첫째 참고 그림으로 삼아 같은 캐릭터의 비율만 고친다(2026-09-29 오후 — 아래 family-portrait-prompt headRedrawRecipe).
 *  ③ 단체 사진 얼굴 크기표(2026-09-29 밤 "가족들이 얼굴 크기에 대한 비율이 있어야") — 잰 비율(FamilyPortrait.headRatio)이
 *     있으면 그림을 머리·몸·발 칸으로 나눠 세워, 키는 실제 키 그대로 두고 얼굴은 표(FACE_SIZE)대로 보이게 한다(faceLayout).
 *     이미 그린 그림도 다시 그리지 않고 고쳐진다. (처음엔 키를 ±10% 안에서 반만 맞췄다 — 예전 groupHeights, 뺐다.)
 *  ④ 몸 늘이기(2026-09-29 밤 "엄마가 아직도 얼굴이 너무 크게 나왔어") — ②까지 거쳐도 머리가 크면 머리는 그대로 두고 목 ~ 발목만
 *     세로로 늘여 비율을 표 × 0.8 쪽으로 옮긴다(lib/family-stretch, 값 없음). 저장하는 headRatio 는 늘인 뒤 비율이다.
 *
 * 이 파일은 ①~④가 같이 쓰는 표와 셈만 둔다. 단체 사진(브라우저)도 쓰므로 sharp·fetch 없는 순수 함수만.
 */

// 타입만 가져온다(런타임에는 지워진다) — family.ts 가 이 파일의 값을 부르므로 값까지 부르면 서로 물린다.
import type { FamilyRole } from "./family.ts";

/* ─────────────────────────────── 얼굴 비율표 ─────────────────────────────── */

/*
 * 가족 얼굴 비율표(사장님 2026-09-29: "각각 얼굴 비율이 있어야") — 머리 : 키.
 *   아이 6살까지 1:5 · 7~9살 1:5.5 · 10~12살 1:6 · 청소년 1:6.5 · 어른(엄마·아빠·조부모) 1:7
 * 처음(같은 날 오전)엔 아이 1:4 · 어른 1:5.5 로 두었는데, 비율 견본을 붙이자 모델이 그 값을 오히려 넘겨 그려
 * 아이가 대두(약 1:3.5)가 됐다 — 사장님: "이전 그림이 더 좋은데, 애기 머리가 너무 대두". 모델은 머리를 표보다
 * 20% 안팎 크게 그리는 버릇이 있어, 예전 값(아이 1:5 · 어른 1:7)을 표로 두면 결과가 사장님이 고른 앞 그림
 * (아이 약 1:4.2)쯤으로 나온다. 얼굴 크기도 아이가 어른의 약 84% 로 고르게 맞는다.
 * 값은 '키 ÷ 머리'(4 = 머리가 키의 1/4). 머리 = 머리카락 맨 위 ~ 턱, 키 = 머리카락 맨 위 ~ 신발 바닥.
 */
export const TEEN_HEAD_RATIO = 6.5;
export const ADULT_HEAD_RATIO = 7;

/** 아이 나이 → 비율. 나이를 모르면(0·없음) 6살까지와 같다. */
export function kidHeadRatio(age?: number | null): number {
  return !age || age <= 6 ? 5 : age <= 9 ? 5.5 : 6;
}

/**
 * 이 사람의 표 비율 — 그림 프롬프트(lib/family-portrait-prompt identityOf)의 갈래와 같다:
 * 아이(child)는 나이대로, 형제·친구는 12살까지 아이 · 13~19살 청소년 · 20살부터 어른, 엄마·아빠·조부모는 어른.
 * age 는 그릴 때 보낸 나이다 — 아이는 설정의 아이 나이, 형제·친구는 member.age(family-ui portraitRequest).
 */
export function headChartRatio(role: FamilyRole, age?: number | null): number {
  switch (role) {
    case "child":
      return kidHeadRatio(age);
    case "sibling":
    case "friend":
      if (!age || age <= 12) return kidHeadRatio(age);
      return age <= 19 ? TEEN_HEAD_RATIO : ADULT_HEAD_RATIO;
    default:
      return ADULT_HEAD_RATIO;
  }
}

/** 4 → '1/4', 4.5 → '1/4.5', 4.213 → '1/4.2' (프롬프트·로그용) */
export function ratioText(ratio: number): string {
  return `1/${Math.round(ratio * 10) / 10}`;
}

/* ─────────────────────────────── 잰 비율 ─────────────────────────────── */

/** 믿을 만한 잰 비율의 범위 — 이 밖이면 잘못 잰 것으로 보고 버린다(저장할 때도). */
export const HEAD_RATIO_MIN = 2;
export const HEAD_RATIO_MAX = 10;

/** 저장·응답에서 받은 값 → 0.01 단위 비율. 숫자가 아니거나 범위 밖이면 undefined(모름). */
export function cleanHeadRatio(x: unknown): number | undefined {
  if (typeof x !== "number" || !Number.isFinite(x)) return undefined;
  const r = Math.round(x * 100) / 100;
  return r >= HEAD_RATIO_MIN && r <= HEAD_RATIO_MAX ? r : undefined;
}

/** [위, 왼, 아래, 오른] 0~1000 비율 — Gemini 가 그림 속 자리를 알려 주는 꼴(쪽 그림 hotspots box 와 같다). 픽셀이 아니다. */
export type Box = [number, number, number, number];

/** 머리 재기가 잰 두 상자(lib/family-head-check readHeadBoxes) — 머리(머리카락 맨 위 ~ 턱)·전신(같은 위 ~ 신발 바닥) */
export type HeadBoxes = { head: Box; figure: Box };

/** 네 값이 0~1000 안이고 위<아래·왼<오른인 상자만 */
export function readBox(x: unknown): Box | null {
  if (!Array.isArray(x) || x.length !== 4) return null;
  if (!x.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1000)) return null;
  const [top, left, bottom, right] = x as number[];
  return top < bottom && left < right ? [top, left, bottom, right] : null;
}

/** 머리가 전신 상자 위로 이만큼(0~1000)까지는 삐져나와도 받는다 — 두 상자를 따로 재서 몇 칸 어긋난다 */
const HEAD_ABOVE_SLACK = 25;
/** 머리 상자가 그림 높이의 이만큼(0~1000)보다 작으면 못 잰 것 */
const HEAD_MIN_SPAN = 15;
/** 전신 상자가 그림 높이의 이만큼보다 작으면 전신이 아니다(그림은 전신이 위아래 80~88%를 채우게 그린다) */
const FIGURE_MIN_SPAN = 300;
/** 가족 그림은 늘 3:4(가로 3 : 세로 4) — 0~1000 상자의 세로 칸 ÷ 가로 칸에 이 값을 곱하면 화면에서의 세로 ÷ 가로다 */
const PORTRAIT_H_OVER_W = 4 / 3;
/**
 * 머리 상자의 화면 세로 ÷ 가로가 이보다 크면 머리만 잰 게 아니다 — 턱 아래로 늘어진 긴 머리·땋은 머리·올림머리가 들어갔다
 * (머리만이면 1.0~1.4 쯤, 긴 머리까지 들어가면 1.7~2.2 쯤). 그대로 믿으면 머리가 크다고 잘못 보고 값(약 95원)을 들여
 * 머리를 작게 다시 그려 버린다 — 못 잰 것으로 친다(다시 그리지 않고, 단체 사진도 실제 키 그대로).
 */
const HEAD_MAX_TALL = 1.6;
/**
 * 전신 상자의 화면 세로 ÷ 가로가 이보다 작으면 선 사람이 아니다 — 가로·세로를 바꿔 적은 답([xmin, ymin, …])이다.
 * 팔을 조금 벌리고 선 전신은 2 쯤 넘고, 바꿔 적으면 1 안팎이다.
 */
const FIGURE_MIN_TALL = 1.4;

/** 상자의 화면 세로 ÷ 가로(3:4 그림) */
function tallness(b: Box): number {
  return ((b[2] - b[0]) / (b[3] - b[1])) * PORTRAIT_H_OVER_W;
}

/**
 * 머리·전신 상자 → 비율(키 ÷ 머리 높이, 0.01 단위).
 * 키와 머리를 **같은 위(머리 상자 위 = 머리카락 맨 위)**에서 잰다 — 표의 정의(키 = 머리카락 맨 위 ~ 신발 바닥)와 같다.
 * 전신 상자 위를 쓰면 올림머리·모자까지 들어가 키가 늘고, 큰 머리가 덜 커 보인다(머리 상자는 그것을 빼라고 부탁했다).
 * 머리가 전신 안에 있지 않거나, 너무 작거나, 머리 상자에 긴 머리가 든 것 같거나(HEAD_MAX_TALL), 가로·세로를 바꿔 적은 것
 * 같거나(FIGURE_MIN_TALL), 비율이 믿을 범위 밖이면 null(못 잼).
 */
export function headRatioFromBoxes(head: Box, figure: Box): number | null {
  const headSpan = head[2] - head[0];
  const tall = figure[2] - head[0];
  if (headSpan < HEAD_MIN_SPAN || tall < FIGURE_MIN_SPAN || figure[2] - figure[0] < FIGURE_MIN_SPAN) return null;
  if (head[0] < figure[0] - HEAD_ABOVE_SLACK || head[2] > figure[2]) return null;
  if (tallness(head) > HEAD_MAX_TALL || tallness(figure) < FIGURE_MIN_TALL) return null;
  return cleanHeadRatio(tall / headSpan) ?? null;
}

/* ─────────────────────────────── 다시 그릴지 ─────────────────────────────── */

/**
 * 비율이 표보다 이만큼 넘게 작으면(= 머리가 크다) 다시 그린다 — 어른 7 이면 5.6 아래, 아이 5 면 4 아래.
 * 모델이 늘 20% 안팎 크게 그리므로 그 정도는 봐준다(사장님이 고른 아이 앞 그림 ≈ 4.2 는 통과).
 */
export const HEAD_TOO_BIG = 0.2;
/** 비율이 표보다 이만큼 넘게 크면(= 머리가 작다) 다시 그린다 — 어른 7 이면 8.4 위. 작은 쪽은 덜 거슬려 더 너그럽다. */
export const HEAD_TOO_SMALL = 0.2;

export type HeadVerdict = "ok" | "big" | "small";

/**
 * 다시 그릴 까닭 — 표 비율·처음 그림의 잰 비율·어느 쪽으로 벗어났나(숫자와 갈래뿐).
 * lib/family-head-check evenOutHead 가 만들고, 다시 그리기 프롬프트(lib/family-portrait-prompt headRedrawRecipe)가 쓴다.
 */
export type HeadFix = { target: number; verdict: Exclude<HeadVerdict, "ok">; measured: number };

/** 잰 비율이 표에 맞나 — big: 머리가 너무 크다 · small: 너무 작다 · ok: 봐줄 만하다 */
export function headVerdict(ratio: number, target: number): HeadVerdict {
  if (ratio < target * (1 - HEAD_TOO_BIG)) return "big";
  if (ratio > target * (1 + HEAD_TOO_SMALL)) return "small";
  return "ok";
}

/** 표에서 얼마나 벗어났나 — 배율로 잰다(|ln(잰 값 ÷ 표)|). 1/4.4 와 1/6.9 가 5.5 에서 같은 만큼(1.25배) 벗어난 것으로 친다. */
export function headMiss(ratio: number, target: number): number {
  return Math.abs(Math.log(ratio / target));
}

/** 두 장 가운데 표에 더 가까운 쪽 — 같으면 처음 것(바꿀 까닭이 없다) */
export function closerHead(first: number, second: number, target: number): "first" | "second" {
  return headMiss(second, target) < headMiss(first, target) ? "second" : "first";
}

/* ─────────────────────────────── 단체 사진 — 얼굴 크기표 ─────────────────────────────── */

/*
 * 얼굴 크기표(사장님 2026-09-29, 홈 가족 사진을 보고) — "가족들이 얼굴 크기에 대한 비율이 있어야 할 것 같아",
 * "아빠·아이 얼굴 크기가 내가 볼 때 정확하게 맞아 — 그게 맞게 나와야 할 듯".
 *
 * 왜: 사람마다 따로 그려 실제 키대로 세우면 얼굴 크기는 그림마다 잰 비율(키 ÷ 머리)을 따라 들쭉날쭉하다. 셀카 같은
 * 사진으로 그린 엄마(잰 비율 4.56)는 옆 아빠(약 5.6)보다 얼굴이 눈에 띄게 컸다 — 예전 고르기(groupHeights, 키를 ±10%
 * 안에서 반만 맞춤)로는 엄마 키만 163 → 147cm 꼴로 줄고 얼굴은 여전히 아빠의 1.06배였다. 이미 그린 그림은 다시 그리지 않고
 * 단체 사진에서 고친다.
 *
 * 어떻게(components/family/FamilyGroupPhoto): 키는 지금처럼 실제 키(lib/family heightFor)가 먼저다. 잰 비율이 있는 사람은
 * 그림 한 장을 세로로 칸을 나눠 세운다 —
 *  - 머리 칸(머리카락 맨 위 ~ 턱 아래 목 조금): 가로·세로 **같은 배율**로, 보이는 머리 높이 = 이 표 × FACE_UNIT_CM.
 *    얼굴은 절대 찌그러지지 않는다.
 *  - 몸 칸(목 ~ 발목): 가로는 머리 칸과 같은 배율, 세로만 늘이거나 줄여 키를 맞춘다(FACE_FIT.bodyMin ~ bodyMax).
 *  - 발 칸(발목 ~ 신발 바닥): 머리 칸과 같은 배율 — 신발이 길쭉하거나 납작해 보이지 않게(lib/family-stretch 와 같은 까닭).
 * 몸 배율이 범위를 넘으면 그 끝에서 멈추고 키가 조금(FACE_FIT.give, 이웃 키와의 차이 안) 양보한다. 그래도 모자라면
 * 그때만 얼굴이 표에서 조금 벗어난다(키 순서가 뒤집히거나 몸이 찌그러지는 것보다 낫다).
 *
 * 값 — 보이는 머리 높이(머리카락 맨 위 ~ 턱), 아빠(어른 남자) = 1:
 *   어른 남자 1 · 어른 여자 0.94 · 아이 6살까지 0.8 · 7~9살 0.85 · 10~12살 0.9 · 청소년(13~19살) 0.95
 * 아이 0.8 은 사장님이 맞다고 한 지금 화면에서 잰 값과 같다: 아빠 5.6(175cm) 옆 5살 아이 4.2(110cm)가 예전 고르기로
 * 170.8 · 101.2cm 에 서서 얼굴이 30.5 : 24.1 = 0.79 였다(아이 그림에 잰 값이 없으면 110cm 그대로 서서, 실제로 4.2 쯤
 * 그려졌다면 약 0.86 → 이제 0.84). 아빠는 아래 FACE_UNIT_CM 덕에 예전과 똑같이 선다(몸 칸 배율 1). 아이는 예전 고르기가
 * 줄였던 키(101.2)를 되찾아 제 키 110cm 로 서고 몸 칸만 약 1.08배 — 얼굴 크기 사이는 그대로다.
 */
export const FACE_SIZE = {
  /** 어른 남자 — 아빠·할아버지·20살부터의 남자 형제·친구 */
  man: 1,
  /** 어른 여자 — 엄마·할머니·20살부터의 여자 형제·친구 */
  woman: 0.94,
  /** 아이 6살까지(나이를 모르면 여기) */
  kid6: 0.8,
  /** 아이 7~9살 */
  kid9: 0.85,
  /** 아이 10~12살 */
  kid12: 0.9,
  /** 청소년 13~19살 */
  teen: 0.95,
} as const;

/** 아이 나이 → 얼굴 크기(표). 13살부터는 청소년. 나이를 모르면(0·없음) 6살까지와 같다. */
function kidFace(age?: number | null): number {
  if (!age || age <= 6) return FACE_SIZE.kid6;
  if (age <= 9) return FACE_SIZE.kid9;
  return age <= 12 ? FACE_SIZE.kid12 : FACE_SIZE.teen;
}

/**
 * 이 사람의 얼굴 크기(표, 아빠 = 1). age 는 **키와 같은 나이**를 넘긴다(lib/family heightCm — 아이는 설정의 아이 나이,
 * 형제·친구는 member.age, 없으면 아이 나이). 키와 얼굴이 같은 나이를 따라야 몸 칸이 억지로 늘거나 줄지 않는다.
 * 20살부터의 형제·친구는 성별로 어른 남자·여자, 성별을 모르면 둘의 가운데.
 */
export function faceSize(role: FamilyRole, age?: number | null, gender?: "girl" | "boy"): number {
  switch (role) {
    case "dad":
    case "grandpa":
      return FACE_SIZE.man;
    case "mom":
    case "grandma":
      return FACE_SIZE.woman;
    case "child":
      return kidFace(age);
    case "sibling":
    case "friend":
      if (!age || age <= 19) return kidFace(age);
      return gender === "boy" ? FACE_SIZE.man : gender === "girl" ? FACE_SIZE.woman : (FACE_SIZE.man + FACE_SIZE.woman) / 2;
  }
}

/**
 * 얼굴 크기표 1 의 머리 높이(cm — 단체 사진의 키와 같은 단위) = 보통 키 아빠 175cm ÷ 5.6 = 31.25.
 * 5.6 = 어른 표(ADULT_HEAD_RATIO 7) × 0.8 — 그림 모델이 실제로 그리는 비율(표보다 머리를 20% 안팎 크게 그리는 버릇)이고,
 * 몸 늘이기가 맞추는 비율(lib/family-stretch STRETCH_GOAL_SHARE)이며, 사장님이 "정확하게 맞다"고 한 아빠 그림의 잰 비율이다.
 * 그래서 그 아빠(175cm·5.6)는 몸 칸 배율이 딱 1 — 예전처럼 그림 그대로 선다. 키 칩으로 아빠 키가 달라도 얼굴은 같은
 * 크기다(사람 머리 크기는 키만큼 다르지 않다 — 큰 아빠는 몸 칸이 조금 길어진다).
 * (family.ts ADULT_HEIGHT_CM 을 부르면 서로 물려 숫자로 둔다 — 같은지는 시험이 본다.)
 */
export const FACE_UNIT_CM = 175 / (ADULT_HEAD_RATIO * 0.8);

/** 칸 나누기의 조절 값(FACE_FIT) — 시험·눈으로 보기 스크립트가 다른 값을 대 볼 수 있게 꼴만 따로 둔다. */
export type FaceFitOptions = {
  neckGap: number;
  feetShare: number;
  bodyMin: number;
  bodyMax: number;
  totalMax: number;
  give: number;
};

/**
 * 칸 나누기의 조절 값(눈으로 본 뒤 정했다 — 2026-09-29, 실제 Gemini 그림·예시 그림으로 홈 크기 단체 사진을 그려 봄).
 *  - neckGap: 턱선 아래 머리 높이의 이만큼까지 머리 칸(같은 배율)에 넣는다 — 턱·입이 몸 칸에 들어가 늘어나지 않게.
 *    몸 늘이기(lib/family-stretch NECK_GAP 0.15)보다 넉넉하다: 그쪽은 잰 상자의 픽셀로 턱을 찾지만, 여기서는 **그림 높이 ÷
 *    잰 비율**로 턱을 어림한다. 잘린 그림은 올림머리·똥머리·모자 꼭대기까지 들어 있는데 잰 비율은 그것을 뺀 머리카락 맨
 *    위부터라(lib/family-head-check), 그만큼 턱을 높게 잡는다. 0.15 면 머리 위로 머리 높이의 약 0.2 만 솟아도 턱·입이
 *    늘었다(엄마 4.56 에 0.4 짜리 똥머리면 얼굴 아래 15% 가 1.3 배로). 0.35 면 약 0.5 까지 괜찮다. 늘어난 목·어깨 몫은
 *    고른 배율이라 찌그러지지 않고, 사장님 아빠(5.6)는 그대로 배율 1·아이 0.80·엄마 0.94 도 그대로다(엄마 키만 약 159cm).
 *    (솟은 만큼 머리를 크게 어림해 그런 그림은 얼굴이 표보다 조금 작게 선다 — 찌그러지는 것보다 낫다.)
 *  - feetShare: 전신 아래 이만큼(발목 ~ 신발 바닥)은 같은 배율(family-stretch FEET_SHARE 와 같다). 발 칸 없이 두 칸으로
 *    해 봐도 홈 크기에선 거의 같았지만, 늘인 신발이 부츠처럼 길어지지 않게 몸 늘이기와 같은 자리에서 멈춘다.
 *  - bodyMin·bodyMax: 몸 칸 세로 배율(가로 대비)의 범위. 사장님 엄마(4.56)는 얼굴 0.94·제 키 163cm 에 약 1.35 가 필요해
 *    1.3 에서 멈추고 키가 조금 양보한다 — 홈 크기에서 1.3 과 1.35 는 눈으로 거의 같았다.
 *    줄이는 쪽(머리가 작게 그려진 그림)은 0.85 까지 — 더 줄이면 땅딸막하다.
 *  - totalMax: 굽기 때 늘인 배율(FamilyPortrait.bodyStretch) × 여기 몸 칸 배율의 한도. 새로 그린 그림은 굽기 때 이미
 *    몸을 늘였을 수 있어(family-stretch STRETCH_MAX 1.35) 둘이 겹치면 1.75 까지 간다 — family-stretch 가 적어 둔 대로
 *    1.5 는 윗옷이 튜닉처럼, 1.55 는 길쭉하고 "더 올려도 1.45 까지만". 그래서 늘인 그림은 몸 칸 한도를 1.45 ÷ 굽기 배율로
 *    낮춘다(1.35 로 늘인 그림이면 약 1.07). 굽기 배율이 없는 그림(예전 그림·사장님 엄마)은 bodyMax 그대로.
 *  - give: 몸 배율이 끝에 닿았을 때 키가 양보하는 한도(±5%) — 그 안에서도 이웃 키와의 차이의 GROUP_GAP_SHARE 까지만.
 */
export const FACE_FIT: Readonly<FaceFitOptions> = {
  neckGap: 0.35,
  feetShare: 0.08,
  bodyMin: 0.85,
  bodyMax: 1.3,
  totalMax: 1.45,
  give: 0.05,
};

/**
 * 굽기 때 늘인 배율(FamilyPortrait.bodyStretch)로 믿을 범위 — 몸 늘이기 상한(family-stretch STRETCH_MAX 1.35)에 여유를 둔 값.
 * 이 파일이 family-stretch(sharp)를 부르면 브라우저 단체 사진까지 sharp 가 딸려 와 숫자로 둔다.
 */
export const BODY_STRETCH_MAX = 1.5;

/** 저장·응답에서 받은 굽기 배율 → 0.01 단위. 1 보다 크고 BODY_STRETCH_MAX 까지만, 아니면 undefined(늘이지 않음·모름). */
export function cleanBodyStretch(x: unknown): number | undefined {
  if (typeof x !== "number" || !Number.isFinite(x)) return undefined;
  const v = Math.round(x * 100) / 100;
  return v > 1 && v <= BODY_STRETCH_MAX ? v : undefined;
}

/**
 * 흰 바탕 그림(opaque — 바탕 지우기 실패)의 위·아래 여백(그림 높이 비율). lib/cutout 이 원래 그림 긴 변의 3% 를 남기고
 * 자르므로, 전신이 그림 높이의 80~88% 인 3:4 그림이면 잘린 그림 높이의 약 3.3% 다. 투명 그림은 여백이 없다(0).
 * 칸을 나눌 때(fitFace)는 이 여백을 빼고 머리·턱 자리와 키를 잰다 — 사람(여백 뺀 높이)이 실제 키로, 얼굴이 표대로 선다.
 * 나누지 않는 그림(잰 비율 없음)은 예전처럼 그림 전체 높이 = 실제 키(여백만큼 약 7% 작게)다.
 */
export const OPAQUE_PAD = 0.033;

/**
 * 바로 위·아래 키 사람과의 차이 가운데 이만큼까지만 키가 양보한다. 두 사람이 서로 끝까지 다가가도 차이의 30%는 남아,
 * 키 순서가 뒤집히지 않는다(아이가 부모만큼 커 보이거나 아빠가 엄마보다 작아 보이지 않게).
 */
export const GROUP_GAP_SHARE = 0.35;
/**
 * 키가 같은 사람끼리는 사이 차이가 0이라 위 규칙으로 묶을 수 없다 — 대신 한 사람이 이만큼(±3%)까지만 움직인다.
 * 둘이 반대로 움직여도 약 6% 안이다(엄마·아빠가 같은 175cm 인데 달라 보이지 않게, 같은 나이 아이 둘도).
 */
export const GROUP_SAME_CM_CAP = 0.03;
/** 몸 칸이 이보다 짧으면(그림 높이 비율) 나누지 않는다 — 잰 비율이 이상한 것(머리가 그림의 절반을 넘는 등) */
const MIN_BODY_SHARE = 0.2;

export type FaceSlot = {
  /** 실제 키(cm) — lib/family heightFor */
  cm: number;
  /** 그린 뒤 잰 비율(키 ÷ 머리). 없으면 나누지 않고 실제 키 그대로(예전 그림 — 예전과 같다). */
  headRatio?: number;
  /** 얼굴 크기표 값(faceSize) */
  face: number;
  /** 그림 위·아래 여백(흰 바탕 그림이면 OPAQUE_PAD, 투명이면 0·없음) */
  pad?: number;
  /** 굽기 때 이미 늘인 몸 배율(FamilyPortrait.bodyStretch). 없으면 1(안 늘였음·예전 그림) — FACE_FIT.totalMax 를 본다. */
  baked?: number;
};

/** 칸 나누기 — 줄 자리는 모두 **그림 높이** 대비(0 = 맨 위, 1 = 맨 아래), 길이는 cm 단위(키와 같은 단위). */
export type FaceSplit = {
  /** 그림 전체를 가로·세로 같은 배율로 세웠을 때의 높이 — 머리 칸·발 칸의 배율이자 세 칸 모두의 가로 배율 */
  scale: number;
  /** 머리 칸이 끝나는 줄(턱 + 목 조금) */
  cut: number;
  /** 발 칸이 시작하는 줄(발목쯤). 몸 칸 = cut ~ foot */
  foot: number;
  /** 몸 칸 세로 배율(가로 대비). 1 이면 그림 그대로 */
  stretch: number;
  /** 보이는 머리 높이(머리카락 맨 위 ~ 턱) */
  head: number;
};

export type FacePlan = {
  /** 그림이 차지하는 전체 높이(cm 단위, 흰 바탕 그림은 여백까지). 나누지 않으면 실제 키 그대로(예전과 같다). */
  height: number;
  /**
   * 칸을 나눌 때만 — 사람이 선 키(여백 뺀 높이, cm 단위). 투명 그림이면 height 와 같다. 부르는 쪽은 (없으면 height)
   * 가장 큰 값을 무대 높이에 맞춘다 — 흰 바탕 그림이 가장 커도 여백 때문에 모두가 작아지지 않게.
   */
  figure?: number;
  /** 칸을 나눌 때만. 없으면 그림 한 장을 height 로(예전과 같다). */
  split?: FaceSplit;
};

/**
 * 한 사람이 키를 양보할 수 있는 한도(아래로 down · 위로 up, 비율) — give 와 이웃 키와의 차이의 GROUP_GAP_SHARE 가운데
 * 작은 쪽, 키가 같은 사람이 있으면 GROUP_SAME_CM_CAP 까지(예전 groupHeights 의 묶음 그대로, 한도만 ±10% → give).
 */
export function heightGive(cms: readonly number[], i: number, give: number = FACE_FIT.give): { down: number; up: number } {
  const cm = cms[i];
  const tall = [...new Set(cms)].sort((a, b) => a - b);
  const at = tall.indexOf(cm);
  let down = at > 0 ? Math.min(give, (GROUP_GAP_SHARE * (cm - tall[at - 1])) / cm) : give;
  let up = at >= 0 && at < tall.length - 1 ? Math.min(give, (GROUP_GAP_SHARE * (tall[at + 1] - cm)) / cm) : give;
  if (cms.some((c, j) => j !== i && c === cm)) {
    down = Math.min(down, GROUP_SAME_CM_CAP);
    up = Math.min(up, GROUP_SAME_CM_CAP);
  }
  return { down: Math.max(0, down), up: Math.max(0, up) };
}

/**
 * 한 사람 — 얼굴을 표에, 키를 실제 키에 맞추는 칸 나누기. give 는 heightGive 의 한도(없으면 키는 한 치도 양보 안 함).
 *
 * 그림 높이를 1 로 두면 머리 = (1 − 2·여백) ÷ 잰 비율, 머리 칸 = 여백 + 머리 × (1 + neckGap),
 * 발 칸 = 여백 + 전신 × feetShare, 몸 칸 = 나머지. 그림 전체를 고르게 세운 높이를 S, 몸 칸 세로 배율을 v 라 하면
 *     보이는 머리 = S × 머리,   사람 키 = S × (머리 칸 + 발 칸 + v × 몸 칸 − 2·여백)
 * 머리 = 표 × FACE_UNIT_CM 에서 S 를, 사람 키 = 실제 키에서 v 를 구한다(여백은 머리·발 칸에 들어 고르게 선다 — 흰 바탕
 * 그림도 사람이 실제 키로, 몸 칸이 여백 몫만큼 눌리지 않는다). v 의 범위는 bodyMin ~ bodyMax, 굽기 때 늘인 그림은 위쪽을
 * totalMax ÷ 굽기 배율로 더 낮춘다(1 아래로는 안 내린다). v 가 범위 밖이면 끝에 두고 키가 give 안에서 양보한다 — 그래도
 * 모자라면 키를 give 끝에 두고 S 를 다시 구한다(이때만 얼굴이 표에서 벗어난다).
 * 잰 비율이 없거나 값이 이상하면 나누지 않는다(키 = 실제 키, 예전과 같다).
 */
export function fitFace(
  slot: FaceSlot,
  give: { down: number; up: number } = { down: 0, up: 0 },
  o: FaceFitOptions = FACE_FIT,
): FacePlan {
  const { cm, headRatio: r, face } = slot;
  if (r === undefined || !(r > 0) || !(cm > 0) || !(face > 0)) return { height: cm };
  const pad = Math.min(0.2, Math.max(0, slot.pad ?? 0));
  const figure = 1 - 2 * pad;
  const head = figure / r;
  const cut = pad + head * (1 + o.neckGap);
  const foot = 1 - pad - figure * o.feetShare;
  const body = foot - cut;
  if (!(body >= MIN_BODY_SHARE)) return { height: cm };
  const still = 1 - body;
  // 굽기 때 늘인 만큼 여기서 덜 늘인다 — 둘을 곱해 totalMax 를 넘지 않게(늘인 그림을 다시 줄이지는 않는다: 1 아래로 안 감).
  const baked = cleanBodyStretch(slot.baked) ?? 1;
  const bodyMax = Math.max(1, Math.min(o.bodyMax, o.totalMax / baked));

  let scale = (face * FACE_UNIT_CM) / head;
  const want = (cm / scale + 2 * pad - still) / body;
  const stretch = Math.min(bodyMax, Math.max(o.bodyMin, want));
  /** 사람 키 ÷ S(몸 칸 배율이 정해진 뒤) */
  const tallShare = still + stretch * body - 2 * pad;
  let fig = cm;
  if (stretch !== want) {
    fig = Math.min(cm * (1 + give.up), Math.max(cm * (1 - give.down), scale * tallShare));
    scale = fig / tallShare;
  }
  // 그림 전체 = 사람 + 위·아래 여백(고른 배율) — 투명 그림이면 사람 키 그대로(맞으면 실제 키와 한 치도 안 다르다)
  const height = fig + 2 * pad * scale;
  return { height, figure: fig, split: { scale, cut, foot, stretch, head: scale * head } };
}

/**
 * 단체 사진 한 줄 — 사람마다 fitFace(키 양보 한도는 줄 안의 이웃 키로 heightGive). 잰 비율이 없는 사람은 실제 키 그대로.
 *
 * 예전 groupHeights(잰 비율로 키를 ±10% 안에서 반만 맞춤)는 뺐다 — 키를 줄여 얼굴을 맞추면 엄마처럼 키만 작아지고
 * 얼굴은 여전히 커서 둘 다 틀려 보였다. 이제 키는 실제 키, 얼굴은 표 — 둘을 몸 칸이 잇는다. 예전 것 가운데 키 순서를
 * 지키는 묶음(이웃 차이의 35%·같은 키 ±3%)만 heightGive 로 남았다.
 */
export function faceLayout(slots: readonly FaceSlot[], o: FaceFitOptions = FACE_FIT): FacePlan[] {
  const cms = slots.map((s) => s.cm);
  return slots.map((s, i) => fitFace(s, heightGive(cms, i, o.give), o));
}
