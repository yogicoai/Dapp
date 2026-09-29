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
 * 이 파일이 하는 일은 넷이다.
 *   ① breathLimits·sentenceRule — 나이별 한 문장 길이와 숨 길이. 프롬프트와 검사가 같은 눈금을 쓴다.
 *   ② tidyPunctuation — 글자는 한 자도 안 바꾸고, 빠진 끝 부호와 띄어쓰기만 바로잡는다.
 *   ③ reviewPunctuation — 기계가 고칠 수 없어 짚기만 하는 자리(긴 문장·긴 숨·길게 이은 문장).
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
};

/*
 * 눈금 — 나이별 쪽당 분량(anthropic.ts lengthGuide)을 문장 수로 나눈 값에 맞췄다.
 * 예: 5세는 쪽당 4~5문장·120~150자(띄어쓰기 포함)라 한 문장이 띄어쓰기 빼고 24자쯤이다.
 * 숨 상한은 전래·명작에서 거의 걸리지 않을 만큼(22자를 넘는 숨이 전래 3%·명작 2%)으로 잡았다.
 *
 * 2~3세는 숨 상한을 문장 상한과 같거나 가깝게 둔다. 숨을 한 문장 길이(12·15자)로 잡으면
 * "하온이는 엄마 손을 잡고 놀이터에 갔어요"(17자) 같은 보통 문장마다 쉼표가 들어가,
 * '끊임없이'가 '뚝뚝'으로 바뀐다. 이 나이는 문장을 짧게 끊는 것만으로 숨이 충분하다.
 */
const LIMITS: [maxAge: number, limits: BreathLimits][] = [
  [2, { target: 12, max: 16, breath: 16, links: 0 }],
  [3, { target: 15, max: 20, breath: 18, links: 1 }],
  [4, { target: 20, max: 25, breath: 18, links: 1 }],
  [5, { target: 24, max: 30, breath: 20, links: 2 }],
  [6, { target: 26, max: 32, breath: 22, links: 2 }],
  [7, { target: 28, max: 35, breath: 22, links: 2 }],
];
/** 8세 이상. */
const OLDER: BreathLimits = { target: 30, max: 40, breath: 25, links: 3 };

export function breathLimits(age: number): BreathLimits {
  for (const [maxAge, limits] of LIMITS) if (age <= maxAge) return limits;
  return OLDER;
}

/**
 * 프롬프트 한 줄 — 쪽당 분량 뒤에 붙인다. 분량은 '얼마나 쓰나', 이 줄은 '어떻게 끊나'다.
 * 분량을 늘리라는 말만 있으면 모델은 문장을 늘여 채운다(만든 동화의 한 숨이 길어진 까닭).
 */
export function sentenceRule(age: number): string {
  const l = breathLimits(age);
  const links =
    l.links === 0
      ? "문장을 이어 붙이지 않고 한 문장에 한 가지만 말한다"
      : `한 문장에 '-고·-서·-는데·-면서' 같은 이음은 ${l.links}번까지만 쓴다`;
  // 숨 상한이 문장 상한만 하면(2세 이하) 숨 규칙은 문장 규칙과 같다 — 쉼표를 억지로 넣게 하지 않는다.
  const breath =
    l.breath >= l.max
      ? "짧게 끊은 문장은 한 숨에 읽히니 쉼표를 억지로 넣지 않고"
      : `쉼표나 마침표 없이 ${l.breath}자를 넘게 이어 읽히지 않게 하고`;
  /*
   * 쪽 분량(띄어쓰기 포함 글자수)과 문장 길이(띄어쓰기 뺀 글자)가 부딪힐 때 어느 쪽을 굽힐지.
   * 2~4세는 적힌 문장 수의 아래쪽 × 한 문장 길이가 쪽 분량 하한에 못 미친다 — 이 줄이 없으면
   * 모델은 문장을 늘여 분량을 채운다(고치려던 바로 그 문제).
   */
  return (
    `한 문장은 띄어쓰기를 뺀 글자로 ${l.target}자 안팎, 길어도 ${l.max}자를 넘기지 않는다. ` +
    `${breath}, ${links}. ` +
    "쪽 분량이 모자라면 문장을 늘이지 말고 짧은 문장을 하나 더 쓴다(위 문장 수를 하나쯤 넘어도 된다)."
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
   * long-sentence — 한 문장이 나이 상한보다 길다(둘로 나눌 자리).
   * long-breath   — 쉼표·마침표 없이 이어 읽는 숨이 길다(쉼표 넣을 자리).
   * chained       — '-고·-서·-는데'로 쉼표 없이 여러 번 이어 붙였다.
   * quote-no-mark — 대사가 끝났는데 따옴표 안에 부호가 없다.
   */
  kind: "long-sentence" | "long-breath" | "chained" | "quote-no-mark";
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

/**
 * 쪽 글을 소리 내어 읽듯 훑고 숨이 막히는 자리를 찾는다. 아무것도 고치지 않는다.
 *
 * 한 문장에 한 가지만 신고한다(긴 문장 > 긴 숨 > 길게 이음 순서) — 같은 문장이
 * 세 번 걸려 목록을 채우면 다른 쪽의 문제가 가려진다.
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
          message: `${pageNo}쪽 「${excerpt}」 — 한 문장이 ${n}자예요(이 나이는 ${l.max}자까지). 두 문장으로 나눠요.`,
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
 * 다시 쓰기 요청에 덧붙일 한 줄. 너무 많이 주면 모델이 부호만 고치다 이야기를 흐트러뜨려
 * 앞의 몇 개만 준다 — 나머지는 프롬프트 규칙이 함께 잡는다.
 */
export function punctuationRetryLine(findings: PunctuationFinding[], max = 5): string {
  if (findings.length === 0) return "";
  const shown = findings.slice(0, max).map((f) => f.message);
  const more = findings.length > max ? ` (그 밖에 ${findings.length - max}곳 더)` : "";
  return `문장부호·숨 점검 — 성우가 숨 쉴 자리가 부족한 곳이다. 함께 고친다: ${shown.join(" / ")}${more}`;
}

/* ── ④ 합성용 숨 ── */

/** 합성용 쉼표를 넣기 시작하는 숨 길이(글자). 나이를 모르는 자리라 5세 눈금에 맞췄다. */
const SPEECH_BREATH = breathLimits(5).breath;

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
