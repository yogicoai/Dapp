/**
 * 우리 가족 캐릭터 — 머리 비율(키 ÷ 머리). 사장님 2026-09-29: "지금도 생성한거 보면 아빠만 머리가 너무 크게 나와".
 *
 * 사람마다 따로 그려 단체 사진(components/family/FamilyGroupPhoto)에서 실제 키 비율로 나란히 세운다. 그래서 그림마다
 * 머리 비율이 다르면 얼굴 크기가 들쭉날쭉해진다. 프롬프트에 비율표를 적어도 Gemini 는 어른 남자를 1:4 쯤으로 그려
 * (표는 1:5.5) 아빠 얼굴만 커 보였다. 고치는 길 셋(사장님 승인):
 *  ① 비율 견본 그림 — 표의 비율로 선 회색 마네킹을 참고 그림으로 붙인다(lib/family-guide, 값 없음).
 *  ② 그린 뒤 머리 재기 — 값싼 글 모델로 머리·전신 상자를 재고, 표에서 많이 벗어나면 같은 쿠키로 한 번만 다시 그려
 *     표에 더 가까운 쪽을 남긴다(lib/family-head-check, api/family/portrait).
 *  ③ 단체 사진 고르기 — 잰 비율(FamilyPortrait.headRatio)이 있으면 사람마다 크기를 살짝 맞춘다(groupHeights).
 *
 * 이 파일은 ①②③이 같이 쓰는 표와 셈만 둔다. 단체 사진(브라우저)도 쓰므로 sharp·fetch 없는 순수 함수만.
 */

// 타입만 가져온다(런타임에는 지워진다) — family.ts 가 이 파일의 값을 부르므로 값까지 부르면 서로 물린다.
import type { FamilyRole } from "./family.ts";

/* ─────────────────────────────── 얼굴 비율표 ─────────────────────────────── */

/*
 * 가족 얼굴 비율표(사장님 2026-09-29: "각각 얼굴 비율이 있어야") — 머리 : 키.
 *   아이 6살까지 1:4 · 7~9살 1:4.5 · 10~12살 1:5 · 청소년 1:5.5 · 어른(엄마·아빠·조부모) 1:5.5
 * 값은 '키 ÷ 머리'(4 = 머리가 키의 1/4). 머리 = 머리카락 맨 위 ~ 턱, 키 = 머리카락 맨 위 ~ 신발 바닥.
 */
export const TEEN_HEAD_RATIO = 5.5;
export const ADULT_HEAD_RATIO = 5.5;

/** 아이 나이 → 비율. 나이를 모르면(0·없음) 6살까지와 같다. */
export function kidHeadRatio(age?: number | null): number {
  return !age || age <= 6 ? 4 : age <= 9 ? 4.5 : 5;
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

/** 비율이 표보다 이만큼 넘게 작으면(= 머리가 크다) 다시 그린다 — 5.5 면 4.67 아래 */
export const HEAD_TOO_BIG = 0.15;
/** 비율이 표보다 이만큼 넘게 크면(= 머리가 작다) 다시 그린다 — 5.5 면 6.6 위. 작은 쪽은 덜 거슬려 더 너그럽다. */
export const HEAD_TOO_SMALL = 0.2;

export type HeadVerdict = "ok" | "big" | "small";

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

/* ─────────────────────────────── 단체 사진 ─────────────────────────────── */

/** 머리를 표에 맞추는 배율을 이만큼만 섞는다(0 = 실제 키 그대로, 1 = 머리를 표에 딱 맞춤) */
export const GROUP_HEAD_WEIGHT = 0.5;
/** 한 사람 크기를 실제 키 배율에서 최대 이만큼만 바꾼다(±10%) */
export const GROUP_HEAD_CAP = 0.1;
/**
 * 바로 위·아래 키 사람과의 차이 가운데 이만큼까지만 다가간다. 두 사람이 서로 끝까지 다가가도 차이의 30%는 남아,
 * 키 순서가 뒤집히지 않는다(아이가 부모만큼 커 보이거나 아빠가 엄마보다 작아 보이지 않게).
 */
export const GROUP_GAP_SHARE = 0.35;
/**
 * 키가 같은 사람끼리는 사이 차이가 0이라 위 규칙으로 묶을 수 없다 — 대신 한 사람이 이만큼(±3%)까지만 움직인다.
 * 둘이 반대로 움직여도 약 6% 안이다(엄마·아빠가 같은 175cm 인데 20% 달라 보이지 않게, 같은 나이 아이 둘도).
 */
export const GROUP_SAME_CM_CAP = 0.03;

export type GroupPerson = {
  /** 실제 키(cm) — lib/family heightFor */
  cm: number;
  /** 그린 뒤 잰 비율(키 ÷ 머리). 없으면 이 사람은 실제 키 그대로. */
  headRatio?: number;
  /** 이 사람의 표 비율(headChartRatio) */
  target: number;
};

/**
 * 단체 사진에 세울 키 — cm 와 같은 단위(서로의 비만 뜻이 있다). 부르는 쪽은 가장 큰 값을 무대 높이에 맞춘다.
 *
 * 한 사람을 k 배로 그리면 머리 높이는 (실제 키 배율 × k ÷ 잰 비율)이다. 머리를 표(실제 키 배율 ÷ 표 비율)에 맞추려면
 * k = 잰 비율 ÷ 표 비율. 이걸 다 따르면 키가 틀려 보이니 실제 키(k=1)와 반씩 섞는다:
 *     k = 1 + GROUP_HEAD_WEIGHT × (잰 비율 ÷ 표 비율 − 1)
 * 그리고 두 가지로 묶는다.
 *  ① ±GROUP_HEAD_CAP(10%) 안에서만.
 *  ② 바로 아래 키(나보다 작은 사람 가운데 가장 큰 키)까지 차이의 GROUP_GAP_SHARE 만큼만 줄고, 바로 위 키까지 차이의
 *     GROUP_GAP_SHARE 만큼만 커진다 — 둘이 서로 다가가도 차이의 30%가 남아 키 순서가 그대로다.
 *  ③ 나와 키가 같은 사람이 있으면 ±GROUP_SAME_CM_CAP(3%) 안에서만 — 둘이 반대로 움직여도 약 6% 안.
 * 예: 아빠(175cm)가 1:4.2 로 그려졌으면(표 1:5.5) 섞은 값은 0.88 이지만, 엄마(163cm)와의 차이 때문에 약 0.976 까지만 준다.
 * 잰 비율을 모르는 사람은 k = 1(오늘과 같다).
 */
export function groupHeights(people: readonly GroupPerson[]): number[] {
  const tall = [...new Set(people.map((p) => p.cm))].sort((a, b) => a - b);
  return people.map((p, i) => {
    const ratio = p.headRatio;
    if (ratio === undefined || !(p.cm > 0) || !(p.target > 0)) return p.cm;
    const want = 1 + GROUP_HEAD_WEIGHT * (ratio / p.target - 1);
    const at = tall.indexOf(p.cm);
    const below = at > 0 ? tall[at - 1] : undefined;
    const above = at >= 0 && at < tall.length - 1 ? tall[at + 1] : undefined;
    let down = Math.min(GROUP_HEAD_CAP, below === undefined ? GROUP_HEAD_CAP : (GROUP_GAP_SHARE * (p.cm - below)) / p.cm);
    let up = Math.min(GROUP_HEAD_CAP, above === undefined ? GROUP_HEAD_CAP : (GROUP_GAP_SHARE * (above - p.cm)) / p.cm);
    if (people.some((q, j) => j !== i && q.cm === p.cm)) {
      down = Math.min(down, GROUP_SAME_CM_CAP);
      up = Math.min(up, GROUP_SAME_CM_CAP);
    }
    const k = Math.min(1 + up, Math.max(1 - down, want));
    return p.cm * k;
  });
}
