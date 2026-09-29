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

/**
 * 문장이 아직 안 끝났을 때(줄이 안 바뀜) — 거의 쉬지 않는다.
 *
 * 따옴표 때문에 문장 한가운데가 잘리는 자리가 있다("안 돼!" 하고 외쳤어요).
 * 거기서 마침표만큼 쉬면 한 문장이 두 문장처럼 들린다.
 */
const SAME_LINE = 90;

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

/*
 * 앞말에 붙어 문장을 잇는 말 — 이게 오면 앞 조각의 느낌표·마침표는 문장 끝이 아니다.
 *   붙여 쓰는 것:  "좋아!"라며 · "같이 가자"고 · "안 돼!"하고
 *   띄어 쓰는 것:  "안 돼!" 하고 외쳤어요 · "우와!" 소리쳤어요
 * 낱말 통째로만 본다 — '하온이가'·'하니가'(이름)나 '고양이가'가 '하'·'고'로 시작한다고
 * 잇는 말로 잡으면, 새 문장인데도 쉬지 않고 붙여 읽는다.
 * '하고는·하고서·하는데·하길래·면서'도 잇는 말이다 — 빠뜨리면 "잘 먹겠습니다!" 하고는 …
 * 사이를 0.68초 쉬어, 뒷말이 떨어져 나온 토막처럼 들린다.
 */
const ATTACHED =
  /^(?:고|며|면서|라고|라며|라면서|라는|이라고|이라며|이라면서|이라는|하고(?:는|서|선)?|하며|하면서|하자|하니|하는|하는데|하던|하더니|하길래)(?![가-힣])/;
const SPACED_WORD =
  /^\s+(?:하고(?:는|서|선)?|하며|하면서|하자|하자마자|하니|하니까|하더니|하는|하는데|하던|하곤|하길래|하듯|하듯이|하면|라고|라며|라면서|라는|이라고|이라며|이라면서|이라는|한다)(?![가-힣])/;
/*
 * 말하는 움직임 — "우와!" 소리쳤어요. 낱말 머리만 본다.
 * '대답'·'중얼'은 뒷말까지 본다 — '대답 대신 웃었어요'·'중얼중얼 자장가를'은 새 문장이다.
 */
const SPACED_VERB = /^\s+(?:했|말하|말했|소리치|소리쳤|외치|외쳤|속삭|대답(?:했|하)|물었|중얼(?:거|댔|대))/;

/**
 * 다음 글이 앞 문장을 이어 가는가 — "안 돼!" 뒤의 ' 하고 외쳤어요'처럼.
 * 쉼을 정할 때와, 빠진 마침표를 넣을지 정할 때(story-punctuation.ts) 같은 눈으로 본다.
 */
export function continuesSentence(next: string): boolean {
  const t = next.normalize("NFC");
  return ATTACHED.test(t) || SPACED_WORD.test(t) || SPACED_VERB.test(t);
}

/**
 * 잇는 말 낱말(하고·라고·하며…)로만 이어 가는가 — 말하는 움직임(말했어요·물었어요)은 빼고 본다.
 * 대사로 끝나지 않은 줄 뒤에서 쓴다: '끄덕였어요⏎대답했어요'는 앞말을 잇는 게 아니라 새 문장이다.
 */
export function continuesByWord(next: string): boolean {
  const t = next.normalize("NFC");
  return ATTACHED.test(t) || SPACED_WORD.test(t);
}

/** 끝맺음 부호로 끝났나(닫는 따옴표·빈칸은 걷어 내고 본다). */
function endsWithMark(text: string): boolean {
  return /[.!?…‥。！？]$/.test(tailOf(text));
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
  const speakerChanged = Boolean(next) && next!.who !== prev.who;

  /*
   * 줄이 바뀌었나 — 원고에서 줄바꿈은 곧 '문장이 끝났다'는 표시다.
   * 줄바꿈은 앞 조각 끝에 붙기도 하고 다음 조각 앞에 붙기도 해서 둘 다 본다.
   *
   * 줄이 안 바뀌었어도 끝맺음 부호로 끝났고 다음 조각이 그 문장을 잇는 말(하고·라고…)이
   * 아니면 문장이 끝난 것이다. 만든 동화는 한 쪽이 통째로 한 줄이라, 예전에는
   * '…소리쳐요.' 다음 "우와!" 사이도 문장 한가운데로 보고 0.15초만 쉬었다
   * (2026-09-29 사장님: 끊임없이 읽는다). 전래·명작은 문장마다 줄을 바꿔 두어 거의 그대로다.
   */
  const lineBroke = /\n\s*$/.test(prev.text) || /^\s*\n/.test(next?.text ?? "");
  if (next && !lineBroke && !(endsWithMark(prev.text) && !continuesSentence(next.text))) {
    // 한 문장이 이어지는 중이다. 여기서 길게 쉬면 두 문장처럼 들린다.
    const ms = SAME_LINE + (speakerChanged ? 60 : 0);
    return Math.round(Math.min(MAX, Math.max(MIN, ms / (rate > 0 ? rate : 1))));
  }

  const tail = tailOf(prev.text);
  let ms: number;
  if (/[…‥]$|\.\.\.$/.test(tail)) ms = TRAIL;
  else if (/[!?！？]$/.test(tail)) ms = EXCLAIM;
  else if (/[.。]$/.test(tail)) ms = SENTENCE;
  else ms = BASE;

  if (!next) {
    // 쪽의 마지막 조각 — 그림이 바뀌는 만큼 넉넉히. 끝맺음 규칙보다 이쪽이 세다.
    ms = Math.max(ms, PAGE_TURN);
  } else if (speakerChanged) {
    ms += SPEAKER_CHANGE;
  }

  const scaled = ms / (rate > 0 ? rate : 1);
  return Math.round(Math.min(MAX, Math.max(MIN, scaled)));
}
