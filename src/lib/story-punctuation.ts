// 상대 경로로 부른다 — 테스트 러너(node --test)가 @/ 별칭을 못 읽는다.
import { breathe } from "./story-cast.ts";
import { continuesByWord, continuesSentence } from "./reading-rest.ts";

/**
 * 문장부호와 숨 — 성우가 어디서 쉬는지는 글의 부호가 정한다.
 *
 * 왜 필요한가(2026-09-29 사장님): "책이 써질 때 마침표·쉼표 같은 게 안 나타나니,
 * 동화를 읽을 때 너무 끊임없이 읽는다." 합성기는 마침표에서 0.4~0.6초 쉬고 쉼표에서
 * 짧게 숨을 쉬는데, 부호가 없으면 한 번도 쉬지 않는다(story-cast.ts breathe 참고).
 * 만든 동화를 재 보니 전래·명작보다 쉼표는 적고 한 숨은 길었다 — 쉼표·마침표 없이
 * 22자 넘게 이어 읽는 자리가 전래 3%, 명작 2%인데 만든 동화는 31%였다.
 * 대본 프롬프트에 분량(쪽당 글자수) 규칙만 있고 부호·숨 규칙이 하나도 없었던 탓이다.
 *
 * 그런데 고치고 나니 반대쪽으로 넘어갔다(2026-09-30 사장님: "하온이 푸드트럭 대본만 봐도
 * 꺼냈어요 어요 어요 요 요 이런 식으로 끊임이 너무 많이 발생"). 한 쪽이 "~어요." 로 끝나는
 * 15자 남짓 문장 일곱 개였다 — 쉼표도 이음말도 없고, 말한 사람 문장("…물었어요.")이 대사마다
 * 따로 섰다. 길이는 전래·명작과 비슷했는데(중앙값 15자 대 18자) 끝소리가 한 가지뿐이라 뚝뚝
 * 끊겨 들렸다. 전래·명작은 지문 끝이 ~어요 46%·~지요 23%·~답니다 14%로 섞이고, 지문의 27%에
 * 쉼표가 있으며, 짧고 밋밋한 '~어요.' 지문이 세 번 잇따르는 쪽은 하나도 없다.
 * 그래서 이음말·쉼표로 잇는 쪽으로 눈금을 넓히고, 끊김도 짚는다.
 *
 * 이 파일이 하는 일은 넷이다.
 *   ① breathLimits·sentenceRule — 나이별 한 문장 길이와 숨 길이. 프롬프트와 검사가 같은 눈금을 쓴다.
 *   ② tidyPunctuation — 글자는 한 자도 안 바꾸고, 빠진 끝 부호와 띄어쓰기만 바로잡는다.
 *   ③ reviewPunctuation — 기계가 고칠 수 없어 짚기만 하는 자리(긴 문장·긴 숨·길게 이은 문장,
 *      짧은 문장이 뚝뚝 끊기는 자리·같은 끝말이 되풀이되는 자리).
 *      돈 드는 다시 쓰기를 새로 부르지 않는다 — 다른 이유로 다시 쓸 때 함께 넘겨 줄 뿐이다.
 *   ④ breathForSpeech — 합성에 보낼 글에만 쉼표를 더한다. 화면 글과 글자 색칠은 그대로다.
 *
 * 글자 수는 띄어쓰기·부호를 뺀 글자(한글·영문·숫자)로 센다. 사람 눈에 보이는 '한 숨'의
 * 길이에 가장 가깝고, 전래·명작으로 눈금을 맞출 때도 이렇게 셌다.
 *
 * 순수 함수만 둔다(브라우저·API 의존 없음) — 시험으로 굳히기 위해서다.
 */

/* ── ① 나이별 눈금 ── */

export type BreathLimits = {
  /** 한 문장의 알맞은 길이(글자). 프롬프트에 '안팎'으로 준다. */
  target: number;
  /** 한 문장 상한 — 넘으면 둘로 나눠야 한다. */
  max: number;
  /** 쉼표·마침표 없이 이어 읽는 한 숨의 상한. */
  breath: number;
  /** 한 문장 안에서 쉼표 없이 이어 붙이는 말(-고·-서·-는데…)의 상한. */
  links: number;
  /** '짧고 밋밋한' 문장으로 치는 길이(글자) — 이보다 짧고 쉼표·이음 없이 '~요.'로 끝나면 끊김 후보. */
  short: number;
  /** 짧고 밋밋한 지문이 이만큼 잇따르면 뚝뚝 끊겨 들린다. 0이면 끊김을 보지 않는다(2세 이하). */
  shortRun: number;
};

/*
 * 눈금 — 나이별 쪽당 분량(anthropic.ts lengthGuide)을 문장 수로 나눈 값에 맞췄다.
 * 예: 5세는 쪽당 4~5문장·120~150자(띄어쓰기 포함)라 한 문장이 띄어쓰기 빼고 24자쯤이다.
 * 숨 상한은 전래·명작에서 거의 걸리지 않을 만큼(22자를 넘는 숨이 전래 3%·명작 2%)으로 잡았다.
 *
 * 한 문장 상한(max)은 09-30에 넓혔다. 전래·명작 지문은 p95 32자·p99 39자다 — 이음말과
 * 쉼표로 한 호흡을 두 토막으로 나눈 문장이 그만큼 길다. 25자(4세)로 막으니 모델이 이음말을
 * 전부 마침표로 바꿔 '~어요.'만 줄줄이 냈다. 대신 쉼표 없는 한 숨(breath)은 그대로 막는다 —
 * 긴 문장은 되지만 숨 쉴 자리가 없는 긴 문장은 안 된다.
 *
 * 2~3세는 숨 상한을 문장 상한과 같거나 가깝게 둔다. 숨을 한 문장 길이(12·15자)로 잡으면
 * "하온이는 엄마 손을 잡고 놀이터에 갔어요"(17자) 같은 보통 문장마다 쉼표가 들어가,
 * '끊임없이'가 '뚝뚝'으로 바뀐다. 이 나이는 문장을 짧게 끊는 것만으로 숨이 충분하다.
 * 2세 이하는 같은 말을 되풀이하는 것이 곧 리듬이라 끊김을 보지 않는다(shortRun 0).
 * 3세는 한 쪽이 2~3문장뿐이라 넷째부터 본다 — 셋으로 잡으면 3세 글을 길게 쓰라는 말이 된다.
 *
 * 4·5세 숨 상한은 09-30에 20자에서 22자로 올렸다. 20자면 한 문장 알맞은 길이(22·24자)보다
 * 짧아, 이음말 없는 보통 한 마디 문장("…곳에는 커다란 나무가 있었어요" 꼴)마다 쉼표를 요구했다 —
 * 모델이 할 수 있는 건 문장을 쪼개거나 '-고,'를 억지로 붙이는 것뿐이라 다시 뚝뚝 끊긴다.
 * 22자는 처음 눈금을 잡은 자리다(넘는 숨이 전래 3%·명작 2%). 20자면 전래 8%가 걸렸다.
 * 합성용 쉼표(breathForSpeech)는 20자 그대로다 — 소리는 조금 더 자주 숨을 쉬어도 괜찮다.
 */
const LIMITS: [maxAge: number, limits: BreathLimits][] = [
  [2, { target: 12, max: 16, breath: 16, links: 0, short: 0, shortRun: 0 }],
  [3, { target: 16, max: 24, breath: 18, links: 1, short: 14, shortRun: 4 }],
  [4, { target: 22, max: 32, breath: 22, links: 2, short: 18, shortRun: 3 }],
  [5, { target: 24, max: 35, breath: 22, links: 2, short: 20, shortRun: 3 }],
  [6, { target: 26, max: 38, breath: 22, links: 2, short: 20, shortRun: 3 }],
  [7, { target: 28, max: 40, breath: 22, links: 3, short: 22, shortRun: 3 }],
];
/** 8세 이상. */
const OLDER: BreathLimits = { target: 30, max: 45, breath: 25, links: 3, short: 22, shortRun: 3 };

export function breathLimits(age: number): BreathLimits {
  for (const [maxAge, limits] of LIMITS) if (age <= maxAge) return limits;
  return OLDER;
}

/** 잇따라도 되는 짧은 문장 수를 우리말 수로 — "두 개까지만". */
const COUNT_WORD: Record<number, string> = { 1: "한", 2: "두", 3: "세", 4: "네" };

/**
 * 프롬프트 한 줄 — 쪽당 분량 뒤에 붙인다. 분량은 '얼마나 쓰나', 이 줄은 '어떻게 잇고 끊나'다.
 * 분량을 늘리라는 말만 있으면 모델은 문장을 늘여 채운다(만든 동화의 한 숨이 길어진 까닭).
 *
 * 09-29 판은 "분량이 모자라면 짧은 문장을 하나 더 쓴다"였다. 모델은 이 말과 '넉넉하게'의
 * "문장 수를 1.5배로"를 겹쳐 듣고 이음말을 모두 마침표로 바꿨다 — 푸드트럭 쪽이 그렇게 나왔다.
 * 지금은 이어지는 일은 이음말로 잇게 하고, 모자란 분량은 문장 개수가 아니라 장면의 말로 채운다.
 */
export function sentenceRule(age: number): string {
  const l = breathLimits(age);
  const head = `한 문장은 띄어쓰기를 뺀 글자로 ${l.target}자 안팎, 길어도 ${l.max}자를 넘기지 않는다. `;
  if (l.links === 0) {
    // 2세 이하 — 같은 말을 되풀이하는 짧은 문장이 곧 리듬이다. 잇지도, 쉼표를 억지로 넣지도 않는다.
    return (
      head +
      "짧게 끊은 문장은 한 숨에 읽히니 쉼표를 억지로 넣지 않고, 문장을 이어 붙이지 않고 한 문장에 한 가지만 말한다. " +
      "쪽 분량이 모자라면 문장을 늘이지 말고 짧은 문장을 하나 더 쓴다(위 문장 수를 하나쯤 넘어도 된다)."
    );
  }
  /*
   * 쪽 분량(띄어쓰기 포함 글자수)과 문장 길이(띄어쓰기 뺀 글자)가 부딪힐 때 어느 쪽을 굽힐지.
   * 문장을 늘이면 숨이 길어지고, 문장을 쪼개면 뚝뚝 끊긴다 — 둘 다 아니고 장면의 말(소리·표정·
   * 몸짓·짧은 대사)을 더하게 한다. 그러면 문장 수가 조금 늘어도 문장마다 하는 일이 달라 리듬이 산다.
   */
  /*
   * '짧은'이 몇 자인지, 대사가 끼면 다시 세는지까지 숫자로 준다 — 검사(reviewRhythm)와 같은 눈으로.
   * 말로만 "짧은 문장"이라 하면 모델은 10자 남짓만 짧다고 여기고, 대사가 끼면 새로 센다고 여긴다.
   * 그러면 푸드트럭 쪽(지문 셋·대사·지문 둘)을 규칙을 지킨 글로 안다.
   * 같은 끝소리는 대사가 끼면 다시 센다 — 대사는 다른 목소리라 되풀이가 끊기고, 대사를 사이에 둔
   * 두 지문은 이을 수도 없다. 쉼표가 든 긴 문장은 제 안에서 가락이 바뀌어 세지 않는다.
   */
  const allowed = COUNT_WORD[l.shortRun - 1] ?? String(l.shortRun - 1);
  return (
    head +
    `이어지는 일은 이음말(-고·-아서·-자·-더니·-면서)로 한 문장에 잇되 이음은 ${l.links}번까지, ` +
    `쉼표나 마침표 없이 ${l.breath}자를 넘게 이어 읽히지 않게 이음말 뒤나 긴 앞말 뒤에 쉼표를 둔다. ` +
    `쉼표·이음 없이 ${l.short}자 이하로 끝나는 짧은 지문은 ${allowed} 개까지만 잇따르게 하고, 사이에 대사가 끼어도 지문끼리 이어 센다. ` +
    `대사 없이 이어지는 쉼표 없는 지문도 같은 끝소리로는 ${allowed} 개까지만 잇는다. ` +
    "쪽 분량이 모자라면 장면을 보여 주는 말(소리·표정·몸짓·짧은 대사)을 더하고, 문장을 잘게 쪼개 개수를 채우지 않는다."
  );
}

/* ── 공통 도구 ── */

/** 띄어쓰기·부호를 뺀 글자 수. */
export function letters(text: string): number {
  return text.replace(/[^가-힣A-Za-z0-9]/g, "").length;
}

/** 한글 음절의 받침 번호(0이면 받침 없음). 한글 음절이 아니면 -1. */
function jong(ch: string | undefined): number {
  if (!ch) return -1;
  const code = ch.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return -1;
  return (code - 0xac00) % 28;
}

/** 큰따옴표·작은따옴표로 묶인 자리 [시작, 끝) — 대사와 속마음, 이름을 감싼 따옴표. */
function quoteRanges(line: string): [number, number][] {
  const ranges: [number, number][] = [];
  for (const m of line.matchAll(/"[^"\n]*"|“[^”\n]*”|'[^'\n]*'|‘[^’\n]*’/g)) {
    const at = m.index ?? 0;
    ranges.push([at, at + m[0].length]);
  }
  return ranges;
}

/* ── ② 안전한 자동 손질 ── */

/*
 * 문장이 끝났다고 볼 수 있는 낱말 끝 — 지문(해요체·합쇼체·해라체).
 * 받침 ㅆ·ㄴ + '다'(했다·갔다·한다·간다)와 '니다'·'이다'만 받는다. '바다'·'사다리'처럼
 * 이름씨가 '다'로 끝나는 경우가 있어서 '다' 하나로는 문장 끝이라고 못 한다.
 */
function endsSentence(word: string): boolean {
  if (/(?:요|죠)$/.test(word)) return !NOT_FINAL_YO.test(word);
  if (!/다$/.test(word)) return false;
  if (NOT_FINAL_DA.test(word)) return false;
  if (/(?:니다|이다)$/.test(word)) return true;
  const before = jong(word.slice(-2, -1));
  return before === 20 || before === 4; // ㅆ(했다·갔다), ㄴ(한다·간다)
}

/** '요'로 끝나지만 문장 끝이 아닌 이름씨(낱말 통째) — 요요·필요·중요·동요·민요·고요. */
const NOT_FINAL_YO = /^["“'‘]?(?:요요|필요|불필요|중요|동요|민요|고요|주요|수요)$/;

/**
 * 받침 ㄴ + '다'·'이다'로 끝나지만 이름씨인 낱말 — "커다란 판다⏎인형을", "시원한 사이다⏎한 모금".
 * '판다'는 '(땅을) 판다'일 수도 있지만, 점을 못 찍는 쪽이 문장 한가운데에 찍는 쪽보다 낫다.
 */
const NOT_FINAL_DA = /^["“'‘]?(?:[가-힣]{0,2}판다|베란다|사이다|린다|아만다|라벤다)$/;

/**
 * 따옴표 안이 '말'로 보이는가 — 끝 부호를 넣어도 되는 대사인지.
 * "피노키오"처럼 책 이름·낱말 하나를 감싼 따옴표에는 점을 찍지 않는다.
 * 말은 대개 두 낱말 이상이거나, 말끝(-요·-다·-자·-어·-야…)으로 끝난다.
 */
function looksSpoken(inner: string): boolean {
  const t = inner.trim();
  return /\s/.test(t) || /(?:요|죠|다|자|어|아|야|지|네|까|니|냐|게|래|줘|봐|해|와|워|돼|걸|데|든)$/.test(t);
}

/*
 * 한 줄 안에서 '분명히 문장이 끝난 낱말' — 뒤에 빈칸과 새 말이 오는데 부호가 없으면
 * 마침표가 빠진 것이다("공원에 갔어요 비눗방울을 불었어요").
 * 줄 끝보다 훨씬 엄하게 본다. 이름씨가 이렇게 끝나는 일은 없다고 할 만한 것만 둔다
 * ('요요'·'필요'·'동요'는 '요'로 끝나서, 해요체 전부를 받으면 낱말 가운데에 점이 찍힌다).
 */
const CLEAR_END = /(?:어요|아요|여요|해요|에요|예요|네요|세요|래요|대요|지요|군요|니다|까요)$/;

/*
 * 따옴표 없이 옮긴 말 뒤에 오는 '말하는 움직임' — "괜찮아요 웃으며 말했어요"는 한 문장이다.
 * 사이에 꾸밈말 한 낱말(웃으며·작게·조용히)까지는 건너 본다. '친구를 불렀어요'처럼
 * 목적어가 끼면 새 문장이라 건너지 않는다. 놓쳐도 점이 하나 덜 찍힐 뿐이라 넓게 잡는다.
 */
const SPEECH_AHEAD =
  /^\s+(?:[가-힣]*(?:며|면서|게|히|듯이|듯)\s+)?(?:말하|말했|인사|대답|대꾸|답했|답하|불렀|외쳤|외치|소리쳤|소리치|속삭|물었|중얼|되뇌|여쭈|여쭸|생각했|생각하|고민했|고민하)/;

/** 끝 부호 — 물음이면 ?, 아니면 마침표. */
function endMark(word: string, dialogue: boolean): string {
  if (/까요?$/.test(word)) return "?";
  // 대사의 '-니·-냐'는 거의 늘 물음이다("어디 가니?"). 지문의 '-니'는 이음일 수 있어 뺀다.
  if (dialogue && /(?:니|냐)$/.test(word)) return "?";
  return ".";
}

/** 이미 숨을 주는 줄 끝 — 끝 부호·쉼표·말줄임·줄표 따위. */
const ALREADY_ENDED = /[.!?…‥~,;:—\-)\]」』'’]$/;

/**
 * 한 줄 안, 따옴표 밖에서 빠진 마침표를 넣는다.
 * 다음 낱말이 그 말을 잇는 말(하고·라고·말했어요…)이면 넣지 않는다 —
 * "좋아요 하고 웃었어요"는 한 문장이다.
 */
function fixInsideLine(line: string): string {
  const quotes = quoteRanges(line);
  const inQuote = (i: number) => quotes.some(([a, b]) => i >= a && i < b);
  return line.replace(/([가-힣]+)( +)(?=[가-힣"“'‘])/g, (whole, word: string, space: string, at: number) => {
    if (!CLEAR_END.test(word) || inQuote(at)) return whole;
    const rest = line.slice(at + word.length);
    if (continuesSentence(rest) || SPEECH_AHEAD.test(rest)) return whole;
    return `${word}${endMark(word, false)}${space}`;
  });
}

/** 따옴표 앞이 비었거나 문장이 끝났다 — 대사가 문장 첫머리에 온 자리다. */
function quoteStartsSentence(before: string): boolean {
  const t = before.trimEnd();
  return t === "" || /[.!?…‥]["”'’]?$/.test(t);
}

/**
 * 한 줄 안, 대사 바로 뒤에 말한 사람이 오는데 대사에 끝 부호가 없는 자리 —
 * '"하온아, 이리 와 볼래" 엄마가 불렀어요' → '"하온아, 이리 와 볼래?" 엄마가 불렀어요'.
 * 부호가 없으면 대사와 지문 사이가 문장 한가운데로 읽혀 0.15초만 쉰다.
 *
 * 줄 끝 대사(fixLineEnd)보다 엄하게 본다 — 말끝이 분명하고, 대사가 문장 첫머리에 오고,
 * 뒤가 '노래를·책을'처럼 따옴표를 이름으로 받는 말이 아닐 때만 넣는다
 * ('"아기 상어" 노래를 불렀어요'의 상어에 점을 찍으면 안 된다).
 */
const SPOKEN_END = /(?:요|죠|다|자|어|아|야|지|네|까|니|냐|게|래|줘|봐|해|와|워|돼|걸|데|든)$/;
const NAMES_QUOTE =
  /^\s+(?:노래|동요|노랫말|책|그림책|동화|동화책|이야기|놀이|게임|그림|간판|글자|글씨|이름|제목|말|소리|춤)(?:[을를이가은는도과와의에]|이라|라)?(?![가-힣])/;
function fixQuoteInLine(line: string): string {
  // 곧은 따옴표 짝이 안 맞으면 대사가 여러 줄에 걸친 것 — 짝을 잘못 지어 지문을 대사로 볼 수 있다.
  const straightPaired = (line.match(/"/g) ?? []).length % 2 === 0;
  return line.replace(/"([^"\n]*)"|“([^”\n]*)”/g, (whole: string, straight: string | undefined, curly: string | undefined, at: number) => {
    if (straight !== undefined && !straightPaired) return whole;
    const inner = straight ?? curly ?? "";
    const after = line.slice(at + whole.length);
    if (!/^\s+[가-힣]/.test(after) || continuesSentence(after) || NAMES_QUOTE.test(after)) return whole;
    if (!quoteStartsSentence(line.slice(0, at))) return whole;
    const trimmed = inner.trimEnd();
    if (!/[가-힣]$/.test(trimmed) || !SPOKEN_END.test(trimmed)) return whole;
    const word = trimmed.split(/\s/).pop() ?? "";
    return `${whole[0]}${trimmed}${endMark(word, true)}${whole.slice(-1)}`;
  });
}

/** 줄 끝에 빠진 끝 부호를 넣는다. next 는 다음 줄(없으면 쪽의 끝). */
function fixLineEnd(line: string, next: string | null): string {
  if (!line) return line;
  const endsWithQuote = /["”]$/.test(line);
  // 다음 줄이 앞말을 잇는다("형님"⏎하고 불렀어요) — 여기서 문장이 끝나지 않는다.
  // '말했어요·대답…'으로 잇는 것은 대사 뒤에서만 본다 — '끄덕였어요⏎대답 대신 웃었어요'는 새 문장이다.
  if (next !== null && (endsWithQuote ? continuesSentence(` ${next}`) : continuesByWord(` ${next}`))) return line;

  // 대사로 끝나는 줄 — 따옴표 안에 부호가 없으면 따옴표 안쪽에 넣는다("같이 가자.").
  if (endsWithQuote) {
    const inner = line.slice(0, -1);
    // 곧은 따옴표는 한 줄 안에 짝이 맞아야 닫는 따옴표다. 짝이 안 맞으면 대사가 여러 줄에 걸친 것.
    if (line.endsWith('"') && (line.match(/"/g) ?? []).length % 2 !== 0) return line;
    const open = line.endsWith('"') ? inner.lastIndexOf('"') : inner.lastIndexOf("“");
    if (open < 0) return line;
    // 문장 한가운데의 따옴표는 대사가 아니라 이름·제목이다('읽은 책은 "피노키오와 고래"').
    if (!quoteStartsSentence(inner.slice(0, open))) return line;
    const spoken = inner.slice(open + 1);
    if (!/[가-힣]$/.test(spoken) || !looksSpoken(spoken)) return line; // 이미 부호가 있거나 책 이름 같은 낱말
    const word = spoken.split(/\s/).pop() ?? "";
    return `${inner}${endMark(word, true)}${line.slice(-1)}`;
  }

  if (ALREADY_ENDED.test(line)) return line;
  const word = line.split(/\s/).pop() ?? "";
  if (!endsSentence(word)) return line; // 소리말·이름씨로 끝나는 줄은 건드리지 않는다
  return `${line}${endMark(word, false)}`;
}

/**
 * 쪽 글의 부호를 안전하게 손본다 — **글자는 한 자도 바꾸지 않는다.**
 *
 * 하는 일:
 *   · 부호 모양 맞추기(한글 뒤에서만): 。．→.  ！→!  ？→?  ，→,  ...(점 셋 이상)····→…
 *   · 띄어쓰기: 부호 앞 빈칸은 떼고, 부호 뒤에 한글이 바로 붙으면 한 칸 띄운다. 겹친 빈칸·빈 줄은 하나로.
 *   · 줄 끝·쪽 끝에 빠진 마침표(물음이면 ?)를 넣는다. 대사면 따옴표 안쪽에 넣는다.
 *   · 한 줄 안에서 분명히 끝난 문장("갔어요 비눗방울을")에 빠진 마침표를 넣는다.
 *
 * 하지 않는 일: 쉼표 넣기, 문장 나누기, 낱말 고치기 — 그건 뜻을 알아야 해서 모델 몫이다.
 * 소리말("짤랑짤랑")이나 이름씨로 끝나는 줄에도 점을 찍지 않는다 — 일부러 그렇게 둔 줄일 수 있다.
 */
export function tidyPunctuation(text: string): string {
  if (!text) return text;
  let t = text.normalize("NFC").replace(/\r\n?/g, "\n");

  // 부호 모양 — 전각 부호와 점 세 개 말줄임을 한 가지로. 한글 뒤에서만 바꾼다
  // (일본어 책의 。·！는 그 말의 바른 부호다).
  const HALF: Record<string, string> = { "。": ".", "．": ".", "！": "!", "？": "?", "，": "," };
  t = t
    .replace(/([가-힣])([。．！？，])/g, (_all, ch: string, mark: string) => `${ch}${HALF[mark]}`)
    .replace(/([가-힣])(?:\.{3,}|·{3,})/g, "$1…");

  // 띄어쓰기 — "했어요 ." → "했어요.",  "했어요.하온이는" → "했어요. 하온이는"
  // 부호 뒤가 따옴표일 때는 띄우지 않는다 — 닫는 따옴표("같이 가자.")일 수 있다.
  t = t.replace(/([가-힣])[ \t]+([.,!?])/g, "$1$2").replace(/([가-힣][.!?,])(?=[가-힣])/g, "$1 ");

  // 겹친 빈칸은 하나로, 빈 줄은 한 줄까지만 — 빈 줄은 문단을 가르는 일부러 둔 틈일 수 있다(걸리버 끝 쪽).
  const lines = t
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").trim())
    .filter((line, i, all) => line !== "" || (i > 0 && all[i - 1] !== ""));
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  while (lines.length > 0 && lines[0] === "") lines.shift();

  return lines
    .map((line, i) => {
      // 다음 글줄(빈 줄 건너뜀) — 없으면 쪽의 끝이다.
      const next = lines.slice(i + 1).find((l) => l !== "") ?? null;
      return fixLineEnd(fixInsideLine(fixQuoteInLine(line)), next);
    })
    .join("\n");
}

/**
 * 쪽마다 tidyPunctuation — 글 말고 다른 칸(그림 설명·목소리)은 그대로 둔다.
 *
 * 만든 동화는 빈 줄도 없앤다. 문장마다 줄을 바꾸라고 했더니 모델이 문장 사이를 한 줄씩
 * 띄우면, 뷰어(whitespace-pre-line)가 문장마다 빈 줄을 그려 그림 위 자막이 두 배로 높아진다.
 * 빈 줄은 딸린 책(걸리버 끝 쪽)의 일부러 둔 틈이라 tidyPunctuation 자체는 남긴다.
 */
export function tidyPages<T extends { text: string }>(pages: T[]): T[] {
  return pages.map((page) => ({ ...page, text: tidyPunctuation(page.text).replace(/\n{2,}/g, "\n") }));
}

/* ── ③ 짚기만 하는 검사 ── */

/**
 * 성우가 쉬는 단위로 문장을 나눈다 — 끝 부호(. ! ? …)와 그 뒤에 붙은 닫는 따옴표까지.
 *
 * prose-quality.splitSentences 와 달리 따옴표 안에서도 끊는다. 합성기는 대사 안의
 * 마침표에서도 쉬므로, '숨'을 재는 자리에서는 그게 맞다. 말줄임표도 끝으로 친다.
 */
export function speechSentences(text: string): string[] {
  const out: string[] = [];
  let at = 0;
  for (const m of text.matchAll(/[.!?…‥]+["'”’」』)]*/g)) {
    const end = (m.index ?? 0) + m[0].length;
    const piece = text.slice(at, end).trim();
    if (piece) out.push(piece);
    at = end;
  }
  const tail = text.slice(at).trim();
  if (tail) out.push(tail);
  return out;
}

/** 한 숨 — 쉼표·줄바꿈·줄표·큰따옴표 사이(끝 부호는 이미 문장으로 나뉘어 있다). */
function breaths(sentence: string): string[] {
  return sentence.split(/[,，、;:—\n"“”…‥.!?]+/).filter((piece) => letters(piece) > 0);
}

/*
 * 문장을 이어 붙이는 말끝(이음). 쉼표 없이 여럿이 이어지면 한 숨이 길어진다.
 *
 * 헷갈리는 것은 막아 둔다:
 *   · '-서'는 '에서'(공원에서)와 이름씨(순서·엽서)를 빼려고 받침 없는 ㅏ·ㅓ·ㅐ·ㅕ·ㅘ·ㅝ·ㅙ·ㅚ 뒤만 본다.
 *   · '-다가'는 '바다가'를 뺀다.
 *   · '-지만'은 '강아지만'·'바지만'·'편지만'(… 만) 을 빼려고 받침 ㄴ·ㄹ·ㅁ·ㅇ·없음 뒤는 뺀다(하지만·이지만은 받는다).
 *   · '-자'는 세 글자 이상이고 받침 없는 음절 뒤만, 모자·의자·사자 같은 이름씨는 뺀다.
 */
const SEO_VOWELS = new Set([0, 1, 4, 6, 9, 10, 11, 14]); // ㅏ ㅐ ㅓ ㅕ ㅘ ㅙ ㅚ ㅝ (중성 번호)
/** 한글 음절의 중성(모음) 번호. 한글 음절이 아니면 -1. */
function medial(ch: string | undefined): number {
  if (!ch) return -1;
  const code = ch.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return -1;
  return Math.floor(((code - 0xac00) % 588) / 28);
}

/** 합성용 쉼표를 넣어도 되는 이음 — 뜻이 분명해 잘못 넣을 걱정이 없는 것만. */
function isClearLink(word: string): boolean {
  if (/(?:는데|은데|던데|면서|며|더니|자마자)$/.test(word)) return true;
  if (/지만$/.test(word)) {
    // 받침 ㄱ 뒤 '지만'은 먹지만·작지만이지만, 쪽지·딱지 같은 이름씨 + '만'이기도 하다.
    if (/(?:쪽지|딱지|낙지|벽지|약지)만$/.test(word)) return false;
    const before = word.slice(-3, -2);
    if (before === "하" || before === "이") return true;
    const j = jong(before);
    return j > 0 && ![4, 8, 16, 21].includes(j);
  }
  if (/자$/.test(word) && word.length >= 3) {
    if (/(?:모자|사자|의자|과자|여자|부자|피자|기자|주자|지휘자|보호자|사회자|관리자|안내자|참가자|후보자)$/.test(word)) return false;
    return jong(word.slice(-2, -1)) === 0;
  }
  return false;
}

/** 검사에서 세는 이음 — 합성용보다 넓다(-고·-서·-다가·-니까·-려고·-도록까지). */
function isLink(word: string, next: string | undefined): boolean {
  if (isClearLink(word)) return true;
  if (/(?:니까|려고|도록)$/.test(word)) return true;
  if (/다가$/.test(word)) return !/바다가$/.test(word);
  if (/고$/.test(word) && word.length >= 2) {
    if (/(?:최고|창고|냉장고|광고|금고|사고)$/.test(word)) return false;
    // '-고 싶다·-고 있다·-고 말았다·-고 나서'는 한 덩어리 — 이음으로 세지 않는다.
    return !/^(?:싶|있|계시|계셨|계신|말았|말고|나서|나니|보니)/.test(next ?? "");
  }
  if (/서$/.test(word) && word.length >= 2) {
    const before = word.slice(-2, -1);
    if (before === "에") return false;
    return jong(before) === 0 && SEO_VOWELS.has(medial(before));
  }
  return false;
}

/** 낱말 앞뒤의 따옴표·괄호를 걷어 낸다. 끝에 부호가 남으면 이미 숨을 쉬는 자리다. */
function bare(word: string): string {
  return word.replace(/^["“'‘(]+/, "").replace(/["”'’)]+$/, "");
}

/**
 * 한 문장 안에서 쉼표 없이 이어 붙인 이음의 수.
 *
 * 대사·소리말을 받는 '하고·라고'는 이음이 아니다 — '"같이 놀자!" 하고 말했어요',
 * '멍멍 하고 짖어요'는 프롬프트가 권하는 모양이다. '숙제를 하고 놀았어요'의 '하고'만 센다.
 */
function countLinks(sentence: string): number {
  const words = sentence.split(/\s+/).filter(Boolean);
  let n = 0;
  for (let i = 0; i < words.length - 1; i++) {
    const w = bare(words[i]);
    if (!/[가-힣]$/.test(w) || /[,，、;:—]$/.test(words[i])) continue;
    if (/["”'’](?:이?라고|하고)$/.test(w)) continue; // "가자"라고 — 따옴표에 붙은 인용
    if (/^(?:하고|라고|이라고)$/.test(w)) {
      const prev = i > 0 ? bare(words[i - 1]) : "";
      // 문장 첫머리(대사 뒤에서 끊긴 자리)·대사 바로 뒤·되풀이 소리말(멍멍·콩콩) 뒤
      if (i === 0 || /["”'’!?…]$/.test(words[i - 1]) || /^([가-힣]{1,2})\1+$/.test(prev)) continue;
    }
    if (isLink(w, bare(words[i + 1]))) n += 1;
  }
  return n;
}

export type PunctuationFinding = {
  /**
   * long-sentence — 한 문장이 나이 상한보다 길다(숨 쉴 자리에서 나눌 자리).
   * long-breath   — 쉼표·마침표 없이 이어 읽는 숨이 길다(쉼표 넣을 자리).
   * chained       — '-고·-서·-는데'로 쉼표 없이 여러 번 이어 붙였다.
   * quote-no-mark — 대사가 끝났는데 따옴표 안에 부호가 없다.
   * choppy        — 쉼표·이음 없는 짧은 '~요.' 지문이 잇따른다(뚝뚝 끊겨 들린다).
   * same-ending   — 대사 없이 이어지는 한 호흡짜리 지문이 같은 끝말(두 글자)로 잇따른다(끝소리가 되풀이된다).
   */
  kind: "long-sentence" | "long-breath" | "chained" | "quote-no-mark" | "choppy" | "same-ending";
  /** 몇 쪽인지(1부터). */
  page: number;
  /** 걸린 문장(또는 대사) 앞부분. */
  excerpt: string;
  /** 모델·로그에 넘기는 한 줄. */
  message: string;
};

function excerptOf(text: string, max = 24): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/** 성우가 쉬는 단위 한 문장 — 대사(또는 대사에 붙은 '하고 외쳤어요' 토막)인지 함께 적는다. */
type SpokenPiece = { text: string; dialogue: boolean };

/**
 * speechSentences 와 같은 자리에서 자르되, 대사인지 지문인지 가른다.
 *
 * 따옴표 안에서도 마침표로 끊기므로, 세 문장짜리 대사의 가운데 문장에는 따옴표가 없다
 * ("안녕. 나는 토끼야. 반가워."). 그래서 문장 첫머리가 열린 큰따옴표 안인지를 앞 글에서 센다.
 * 작은따옴표는 속마음·책 이름('의좋은 형제')에도 써서 대사로 치지 않는다.
 * 대사 바로 뒤의 "하고 외쳤어요"·"라며 웃었어요" 토막은 그 대사의 꼬리라 대사 쪽에 붙인다.
 */
function spokenPieces(text: string): SpokenPiece[] {
  const out: SpokenPiece[] = [];
  let at = 0;
  const take = (end: number) => {
    const raw = text.slice(at, end);
    const piece = raw.trim();
    if (piece) {
      const before = text.slice(0, at + raw.indexOf(piece));
      const insideStraight = (before.match(/"/g) ?? []).length % 2 === 1;
      const insideCurly = (before.match(/“/g) ?? []).length > (before.match(/”/g) ?? []).length;
      const prev = out[out.length - 1];
      const tail = Boolean(prev?.dialogue && /["”]$/.test(prev.text) && continuesSentence(raw));
      out.push({ text: piece, dialogue: insideStraight || insideCurly || /["“”]/.test(piece) || tail });
    }
    at = end;
  };
  for (const m of text.matchAll(/[.!?…‥]+["'”’」』)]*/g)) take((m.index ?? 0) + m[0].length);
  take(text.length);
  return out;
}

/** 문장 끝의 부호·따옴표·빈칸을 걷어 낸 말. */
function coreOf(sentence: string): string {
  return sentence.replace(/[\s.!?…‥"'“”‘’」』)]+$/u, "");
}

/** 끝 부호의 갈래 — 같은 끝말이라도 느낌표·물음표는 가락이 달라 따로 본다. 부호가 없으면 마침표로 친다. */
function endMarkOf(sentence: string): string {
  const mark = sentence.replace(/["'“”‘’」』)\s]+$/u, "").slice(-1);
  if (mark === "!" || mark === "?") return mark;
  if (mark === "…" || mark === "‥") return "…";
  return ".";
}

/*
 * 끝맺음이 이미 '다른 소리'인 해요체 — 이것으로 끝난 문장은 밋밋한 '~어요.'로 치지 않는다.
 * 전래·명작이 뚝뚝 끊기지 않는 까닭이 이 끝말들을 섞는 데 있다(~지요 23%·~답니다 14%).
 */
const VARIED_YO = /(?:지요|죠|네요|군요|거든요|잖아요|걸요|는데요|은데요|래요|대요|까요)$/;

/**
 * 짧고 밋밋한 지문 — 쉼표·이음 없이, 평서 '~요.'(-어요·-았어요·-해요·-예요…)로 끝나는 짧은 문장.
 * 이런 문장이 잇따르면 문장마다 0.4~0.6초씩 쉬면서 같은 끝소리를 되풀이해 뚝뚝 끊겨 들린다.
 * 한두 개는 힘줄 자리로 좋다 — 잇따를 때만 문제다(reviewPunctuation 에서 센다).
 */
function isFlatShort(sentence: string, short: number): boolean {
  if (endMarkOf(sentence) !== ".") return false; // 느낌표·물음표·말줄임은 가락이 달라 끊김으로 치지 않는다
  if (/[,，、;:—]/.test(sentence)) return false;
  if (letters(sentence) > short || countLinks(sentence) > 0) return false;
  const core = coreOf(sentence);
  return /요$/.test(core) && !VARIED_YO.test(core);
}

/**
 * 조건(ok)을 채우고 서로 같은(same) 지문이 min 개 이상 잇따르는 자리 — 자리마다 문장 번호 목록.
 *
 * 대사는 세지 않는다. 대사에서 줄을 끊을지는 dialogue 로 고른다.
 *   · "skip"  — 건너뛰고 앞뒤 지문을 이어 센다. 끊김(choppy)이 이렇게 센다 — 푸드트럭 쪽처럼
 *               대사 사이사이에 짧은 '~어요.' 지문이 끼어도 귀에는 똑같이 뚝뚝 끊겨 들린다.
 *   · "break" — 대사에서 줄을 끊는다. 같은 끝소리(same-ending)가 이렇게 센다 — 대사는 다른
 *               목소리라 되풀이가 끊기고, 대사를 사이에 둔 두 지문은 이을 수도 없다(09-30 검토:
 *               대사마다 말한 사람 문장이 붙는 보통 쪽이 '~어요.'만으로 줄줄이 걸렸다).
 */
function runsOf(
  pieces: SpokenPiece[],
  same: (a: SpokenPiece, b: SpokenPiece) => boolean,
  ok: (p: SpokenPiece) => boolean,
  min: number,
  dialogue: "skip" | "break",
): number[][] {
  const runs: number[][] = [];
  let run: number[] = [];
  const close = () => {
    if (run.length >= min) runs.push(run);
    run = [];
  };
  pieces.forEach((p, i) => {
    if (p.dialogue) {
      if (dialogue === "break") close();
      return;
    }
    if (!ok(p)) return close();
    if (run.length > 0 && !same(pieces[run[run.length - 1]], p)) close();
    run.push(i);
  });
  close();
  return runs;
}

/**
 * 쪽 하나에서 뚝뚝 끊기는 자리를 찾는다 — 짧고 밋밋한 지문이 잇따르는 곳(choppy, 대사를 건너 센다)과
 * 대사 없이 한 호흡짜리 지문이 같은 끝소리로 잇따르는 곳(same-ending). 잇따르는 줄 하나에 한 번만 신고하고,
 * choppy 로 잡힌 줄과 겹치는 same-ending 은 다시 신고하지 않는다(한 문제를 두 번 세지 않게).
 *
 * 발췌는 모델이 쓴 문장 그대로다 — 새 예문을 주면 그 문장을 베낀다.
 */
function reviewRhythm(text: string, pageNo: number, l: BreathLimits): PunctuationFinding[] {
  if (l.shortRun <= 0) return [];
  const pieces = spokenPieces(text);
  const found: PunctuationFinding[] = [];
  const taken = new Set<number>();

  for (const run of runsOf(pieces, () => true, (p) => isFlatShort(p.text, l.short), l.shortRun, "skip")) {
    run.forEach((i) => taken.add(i));
    const excerpt = excerptOf(pieces[run[0]].text);
    found.push({
      kind: "choppy",
      page: pageNo,
      excerpt,
      message: `${pageNo}쪽 「${excerpt}」부터 짧은 문장이 ${run.length}번 잇따라요. 이어지는 일은 이음말로 한 문장에 잇고 쉼표로 숨을 줘요.`,
    });
  }

  /*
   * 같은 끝소리 — 대사 없이 이어지는 '한 호흡짜리' 지문만 센다.
   *
   * 처음(09-30 아침)엔 대사를 건너뛰고 모든 지문을 셌다. 그랬더니 요즘 이야기의 보통 과거형
   * 지문(했어요·물었어요·웃었어요)이 대사마다 붙는 말한 사람 문장과 함께 줄줄이 걸렸다 —
   * 대사를 사이에 둔 두 문장은 이을 수도 없어, 모델이 고칠 길은 끝을 '-지요'로 바꾸는 것뿐이었다.
   * 전래·명작은 지문 끝의 40%가 -지요·-니다라 안 걸리지만, 요즘 이야기에 그 말투를 뿌리면 옛날이야기가 된다.
   * 그래서 대사에서 줄을 끊고(runsOf "break"), 쉼표로 제 안에서 가락이 바뀌는 긴 문장은 세지 않는다.
   * 짧은 문장은 쉼표가 있어도 끝소리가 귀에 남아 센다.
   */
  const ending = (p: SpokenPiece) => `${coreOf(p.text).slice(-2)}${endMarkOf(p.text)}`;
  const sameEnding = (a: SpokenPiece, b: SpokenPiece) => ending(a) === ending(b);
  const oneBreath = (p: SpokenPiece) =>
    /[가-힣]{2}$/.test(coreOf(p.text)) && (!/[,，、;:—]/.test(p.text) || letters(p.text) <= l.short);
  for (const run of runsOf(pieces, sameEnding, oneBreath, l.shortRun, "break")) {
    if (run.some((i) => taken.has(i))) continue;
    const first = pieces[run[0]];
    const excerpt = excerptOf(first.text);
    const end = ending(first);
    // '끝맺는 말을 바꿔요'를 앞세우지 않는다 — 모델이 -지요·-답니다를 뿌려 옛날이야기 말투가 된다.
    found.push({
      kind: "same-ending",
      page: pageNo,
      excerpt,
      message: `${pageNo}쪽 「${excerpt}」부터 '~${end}'로 끝나는 지문이 ${run.length}번 잇따라요. 이어지는 두 문장을 이음말로 잇거나, 문장 길이를 달리하거나, 인물의 물음·놀라움을 섞어요.`,
    });
  }
  return found;
}

/**
 * 쪽 글을 소리 내어 읽듯 훑고 숨이 막히거나 뚝뚝 끊기는 자리를 찾는다. 아무것도 고치지 않는다.
 *
 * 한 문장에 한 가지만 신고한다(긴 문장 > 긴 숨 > 길게 이음 순서) — 같은 문장이
 * 세 번 걸려 목록을 채우면 다른 쪽의 문제가 가려진다.
 * 긴 쪽만 보면 모델이 문장을 잘게 쪼개 버린다(09-30 푸드트럭 쪽) — 끊김도 함께 본다.
 */
export function reviewPunctuation(pages: { text: string }[], age: number): PunctuationFinding[] {
  const l = breathLimits(age);
  const findings: PunctuationFinding[] = [];
  pages.forEach((page, index) => {
    const pageNo = index + 1;
    const text = (page.text ?? "").normalize("NFC");

    for (const sentence of speechSentences(text)) {
      const n = letters(sentence);
      const excerpt = excerptOf(sentence);
      if (n > l.max) {
        findings.push({
          kind: "long-sentence",
          page: pageNo,
          excerpt,
          message: `${pageNo}쪽 「${excerpt}」 — 한 문장이 ${n}자예요(이 나이는 ${l.max}자까지). 숨 쉴 자리에서 둘로 나눠요.`,
        });
        continue;
      }
      const longest = Math.max(0, ...breaths(sentence).map(letters));
      if (longest > l.breath) {
        findings.push({
          kind: "long-breath",
          page: pageNo,
          excerpt,
          message: `${pageNo}쪽 「${excerpt}」 — 쉼표 없이 ${longest}자를 이어 읽어요(${l.breath}자까지). 숨 쉴 자리에 쉼표를 넣어요.`,
        });
        continue;
      }
      const links = countLinks(sentence);
      if (links > l.links) {
        findings.push({
          kind: "chained",
          page: pageNo,
          excerpt,
          message: `${pageNo}쪽 「${excerpt}」 — '-고·-서·-는데'로 ${links}번 이어 붙였어요. 이음 뒤에 쉼표를 넣거나 문장을 끊어요.`,
        });
      }
    }

    findings.push(...reviewRhythm(text, pageNo, l));

    // 대사가 끝났는데 따옴표 안에 부호가 없다 — 뒤에 '하고·라고'가 오면 문장이 이어지는 것이라 괜찮다.
    for (const m of text.matchAll(/"([^"\n]*)"|“([^”\n]*)”/g)) {
      const inner = (m[1] ?? m[2] ?? "").trim();
      if (!/[가-힣]$/.test(inner) || !looksSpoken(inner)) continue;
      const after = text.slice((m.index ?? 0) + m[0].length);
      if (!after.trim() || continuesSentence(after)) continue;
      findings.push({
        kind: "quote-no-mark",
        page: pageNo,
        excerpt: excerptOf(m[0]),
        message: `${pageNo}쪽 ${excerptOf(m[0])} — 대사 끝에 부호가 없어요. 따옴표 안에 . ! ? 중 하나를 넣어요.`,
      });
    }
  });
  return findings;
}

/**
 * 부모의 완성 원고로 만든 책에서 다시 쓸 때 넘길 것만 남긴다 — 부호·숨(쉼표 넣기, 너무 긴 문장
 * 나누기)만 두고, 끊김(choppy)·같은 끝소리(same-ending)는 뺀다.
 *
 * 완성 원고는 "부호를 채우는 데서 그친다"고 일러 두었다(anthropic.ts materialLines). 끊김·끝소리
 * 권고는 문장을 잇거나 끝을 바꾸라는 말이라, 다른 이유로 다시 쓸 때 함께 넘기면 부모의 문장을
 * 고쳐 쓰게 된다. 빼는 것은 다시 쓰기 요청에서만이다 — 로그에는 그대로 남긴다.
 */
export function withoutRewording(findings: PunctuationFinding[]): PunctuationFinding[] {
  return findings.filter((f) => f.kind !== "choppy" && f.kind !== "same-ending");
}

/**
 * 다시 쓰기 요청에 덧붙일 한 줄. 너무 많이 주면 모델이 부호만 고치다 이야기를 흐트러뜨려
 * 앞의 몇 개만 준다 — 나머지는 프롬프트 규칙이 함께 잡는다.
 * 이 줄은 다른 이유(validateStoryQuality)로 다시 쓸 때만 붙는다 — 이 점검만으로 다시 쓰지 않는다.
 *
 * 머리말은 '나눠라' 한쪽으로 밀지 않는다(09-29 판 "숨 쉴 자리가 부족한 곳"은 쪼개는 쪽으로만 밀었다).
 */
export function punctuationRetryLine(findings: PunctuationFinding[], max = 5): string {
  if (findings.length === 0) return "";
  const shown = findings.slice(0, max).map((f) => f.message);
  const more = findings.length > max ? ` (그 밖에 ${findings.length - max}곳 더)` : "";
  return `읽는 리듬 점검 — 숨이 너무 길거나 뚝뚝 끊기는 곳이다. 함께 고친다: ${shown.join(" / ")}${more}`;
}

/* ── ④ 합성용 숨 ── */

/**
 * 합성용 쉼표를 넣기 시작하는 숨 길이(글자). 나이를 모르는 자리라 09-29의 5세 눈금(20자)에 맞췄다.
 *
 * breathLimits 에서 빌리지 않고 숫자로 박아 둔다 — 09-30에 글쓰기 눈금(5세 숨)을 22자로 넓혔는데,
 * 합성 쪽까지 따라 넓어지면 성우가 쉬는 자리가 줄어 오히려 빨리 읽힌다(사장님: "너무 빠르다").
 */
const SPEECH_BREATH = 20;

/**
 * 문장을 여는 말 — 긴 문장이면 이 뒤에서 한 번 숨을 쉰다.
 * '어느 날 아침'은 한 덩어리라 가르지 않는다("어느 날, 아침 하온이는" ✗).
 */
const OPENER =
  /^(\s*["“'‘]?)(그때|그런데|그래서|그러자|그러다가|그러더니|그러고는|하지만|그러나|어느 날(?! (?:아침|저녁|밤|낮|새벽|오후|오전))|그 순간|그날 밤)(?= )/;

/**
 * 같은 소리말을 되풀이한 자리("톡 톡 톡", "콩콩 콩콩").
 * 한 글자이거나 같은 글자를 겹친 두 글자만 소리말로 본다 — '옛날 옛날'·'나도 나도'는 소리말이 아니다.
 */
const REPEATED = /(?<![가-힣])([가-힣]{1,2})((?: \1)+)(?![가-힣])/g;
function isSoundWord(word: string): boolean {
  return word.length === 1 || word[0] === word[1];
}

/** 한 숨이 길면 그 안의 분명한 이음 뒤에 쉼표를 넣는다. */
function commaLinks(piece: string): string {
  if (letters(piece) <= SPEECH_BREATH) return piece;
  return piece.replace(/([가-힣]+)(?= )/g, (word: string, _w: string, at: number) => {
    /*
     * 뒤에 서술어 한 낱말만 남았으면 넣지 않는다 — "흐느끼며 말했어요"는 어떻게 말했는지를
     * 이르는 한 덩어리다. 가르면 두 가지 일처럼 들리고, 지문으로 싣는 감정이 끊긴다.
     */
    const after = piece.slice(at + word.length).replace(/[\s.!?…‥"”'’)」』]+$/, "").trim();
    if (!/\s/.test(after)) return word;
    return isClearLink(word) ? `${word},` : word;
  });
}

/**
 * 합성에 보낼 글 — 숨 쉴 자리에 쉼표를 더한다. **화면 글에는 쓰지 않는다.**
 *
 * 화면 글은 그대로 두고 소리만 바꾸는 이유: 글자 색칠이 '몇 번째 글자까지'로 돌아서
 * 화면 글에 한 글자만 더해도 색칠이 밀린다. 대사집의 say 와 같은 방식이다.
 *
 * 넣는 자리(모두 이미 숨 쉬는 자리에는 넣지 않는다):
 *   · 부호 없이 줄만 바꾼 자리 — breathe 와 같다
 *   · 되풀이한 소리말 사이 — "톡 톡 톡" → "톡, 톡, 톡"
 *   · 한 숨이 긴 문장에서만: 여는 말 뒤(그때, 그런데…)와 분명한 이음 뒤(-는데, -지만, -면서, -더니, -자…)
 *
 * 글자는 더하지도 빼지도 않는다 — 쉼표만 더한다.
 */
export function breathForSpeech(text: string): string {
  if (!text) return text;
  const lined = breathe(text.normalize("NFC")).replace(REPEATED, (all: string, word: string, rest: string) =>
    isSoundWord(word) ? `${word}${rest.replace(/ /g, ", ")}` : all,
  );

  // 문장마다 — 끝 부호에서 자른 조각을 그대로 이어 붙여야 원문 순서가 지켜진다.
  const pieces: string[] = [];
  let at = 0;
  for (const m of lined.matchAll(/[.!?…‥]+["'”’」』)]*/g)) {
    const end = (m.index ?? 0) + m[0].length;
    pieces.push(lined.slice(at, end));
    at = end;
  }
  pieces.push(lined.slice(at));

  return pieces
    .map((sentence) => {
      const longest = Math.max(0, ...breaths(sentence).map(letters));
      if (longest <= SPEECH_BREATH) return sentence;
      const opened = sentence.replace(OPENER, "$1$2,");
      // 쉼표·줄바꿈으로 나뉜 숨마다 따로 본다 — 이미 짧은 숨은 건드리지 않는다.
      return opened
        .split(/(,\s*|\n)/)
        .map((piece) => (piece === "\n" || /^,\s*$/.test(piece) ? piece : commaLinks(piece)))
        .join("");
    })
    .join("");
}
