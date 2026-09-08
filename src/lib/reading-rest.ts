/**
 * 조각과 조각 사이의 '숨' — 읽어 주는 사람이 잠깐 쉬는 시간.
 *
 * 왜 필요한가: 낭독을 배역별 조각으로 나눠 구운 뒤로, 한 조각이 끝나면 다음 조각이
 * 0초 만에 이어졌다. 사람이 읽어 줄 때는 마침표에서 한 번, 말하는 사람이 바뀔 때
 * 한 번 더 쉬는데 그게 통째로 없으니 "쉼없이 계속 읽어 준다"가 됐다(사장님 지적).
 *
 * 어디까지가 이 파일의 일인가: **얼마나 쉴지만** 정한다. 실제로 기다리는 것과
 * 도중에 멈췄을 때 처리는 뷰어가 한다.
 */

/** 조각 하나 — 쉼을 정하는 데 필요한 것만. */
export type RestSegment = {
  /** 그 조각이 읽은 글. 끝맺음 부호로 얼마나 쉴지가 갈린다. */
  text: string;
  /** 누가 읽었나 — "narration" 이거나 배역 이름. 바뀌면 더 쉰다. */
  who: string;
};

/**
 * 기본 숨(ms). 쉼표도 마침표도 없이 이어지는 자리에서도 이만큼은 띄운다.
 * 0.26초는 짧아 보이지만, 조각 경계가 붙어 있던 것과 비교하면 확실히 들린다.
 */
const BASE = 260;
/** 마침표로 끝나는 문장 뒤. */
const SENTENCE = 340;
/** 느낌표·물음표 뒤 — 되받는 말이 나오기 전에 한 박자 더 준다. */
const EXCLAIM = 460;
/** 말끝을 흐릴 때(…) — 여운을 남기는 자리라 제일 길다. */
const TRAIL = 620;
/** 말하는 사람이 바뀔 때 더 얹는 시간. 누가 말하는지 아이가 알아채는 데 필요하다. */
const SPEAKER_CHANGE = 220;
/** 쪽이 넘어갈 때 — 그림이 바뀌므로 조각 사이보다 넉넉히 쉰다. */
const PAGE_TURN = 900;

/** 아무리 빨리 읽어도 이보다 짧게는 안 쉰다(ms). */
const MIN = 120;
/** 아무리 느리게 읽어도 이보다 길게는 안 쉰다(ms) — 끊긴 것처럼 들리면 안 된다. */
const MAX = 1400;

/**
 * 끝맺음 부호만 남긴다.
 *
 * 조각 글에는 따옴표와 줄바꿈이 붙어 있다("이제 더 이상 줄 떡이 없어요…"\n).
 * 그대로 보면 마지막 글자가 따옴표라 아무 규칙에도 안 걸린다.
 */
function tailOf(text: string): string {
  return text
    .normalize("NFC")
    .replace(/["'“”‘’」』\s]+$/u, "")
    .slice(-3);
}

/**
 * 조각 하나가 끝난 뒤 얼마나 쉴지(ms).
 *
 * @param prev 방금 끝난 조각
 * @param next 다음에 나올 조각. 없으면(쪽의 마지막) 쪽 넘김 쉼을 준다.
 * @param rate 재생 속도(1이 보통). 빠르게 들으면 쉼도 같은 비율로 줄인다 —
 *             빨리 읽는데 쉼만 그대로면 뚝뚝 끊긴다.
 */
export function restAfter(prev: RestSegment, next: RestSegment | null, rate = 1): number {
  const tail = tailOf(prev.text);
  let ms: number;
  if (/[…‥]$|\.\.\.$/.test(tail)) ms = TRAIL;
  else if (/[!?！？]$/.test(tail)) ms = EXCLAIM;
  else if (/[.。]$/.test(tail)) ms = SENTENCE;
  else ms = BASE;

  if (!next) {
    // 쪽의 마지막 조각 — 그림이 바뀌는 만큼 넉넉히. 끝맺음 규칙보다 이쪽이 세다.
    ms = Math.max(ms, PAGE_TURN);
  } else if (next.who !== prev.who) {
    ms += SPEAKER_CHANGE;
  }

  const scaled = ms / (rate > 0 ? rate : 1);
  return Math.round(Math.min(MAX, Math.max(MIN, scaled)));
}
