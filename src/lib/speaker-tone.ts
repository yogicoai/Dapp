/**
 * 배역에 따라 낭독 톤을 바꾼다 — 성우를 나누지 않고 한 사람이 목소리를 바꾸는 방식.
 *
 * 왜 배역마다 성우를 따로 두지 않는가: 이 앱의 낭독은 부모 목소리가 심장이다.
 * 아빠 목소리로 읽다가 할머니 대사만 낯선 성우가 끼어들면 아이에게는 "아빠가
 * 읽어주다 모르는 사람이 끼어든" 것이 된다. 그림책은 원래 한 사람이 다 읽는다 —
 * 잠자리에서 부모가 목소리를 바꿔 가며 읽는 그 결을 그대로 옮긴다.
 *
 * 그래서 바꾸는 것은 '누가 읽느냐'가 아니라 '어떻게 읽느냐'다.
 *   · 할머니 대사 → 느리게, 조금 낮게
 *   · 작은 동물  → 빠르게, 조금 높게
 *   · 지문       → 손대지 않는다
 *
 * Typecast API에는 음높이 조절이 없어서 재생 속도로 만든다. 속도만 바꾸면
 * '느린 같은 목소리'라 배역이 잘 안 들리므로, 배역 대사에 한해 음높이도 같이
 * 움직이게 한다(preservesPitch를 끈다). 폭은 0.86~1.08로 좁게 잡는다 —
 * 더 벌리면 만화 같아지고, 아이가 무서워한다.
 *
 * 이 파일은 순수 함수만 둔다(브라우저·API 의존 없음) — 시험으로 굳히기 위해서다.
 */

/** splitDialogue가 내주는 조각 모양. 이어 붙이면 원문과 같아야 한다. */
export type DialogueSegment = { text: string; dialogue: boolean };

export type CastMember = { name: string; description?: string };

export type SpeakerTone = {
  /** 재생 속도 배수. 1이면 그대로 읽는다. */
  rate: number;
  /** 속도와 함께 음높이도 움직일지 — 할머니는 낮게, 작은 동물은 높게 들린다. */
  shiftPitch: boolean;
  /** 어떤 배역으로 읽었는지. 시험과 눈으로 확인하는 용도. */
  label: string;
};

/*
 * 배역별 톤. 위에서부터 먼저 맞는 것을 쓴다 — 순서가 곧 우선순위다.
 *
 * '아기'와 '작은 동물'을 큰 동물보다 위에 두는 이유: "아기곰"은 곰이 아니라
 * 아기로 읽어야 맞다. 아래에 두면 곰 규칙이 먼저 걸려 묵직해진다.
 */
const TONE_RULES: { words: string[]; rate: number; shiftPitch: boolean; label: string }[] = [
  { words: ["아기", "아가"], rate: 1.08, shiftPitch: true, label: "아기" },
  {
    words: [
      "토끼", "다람쥐", "참새", "병아리", "생쥐", "새앙쥐", "개구리", "나비", "여우", "고양이",
      // 전래·명작에 실제로 나오는 작은 것들 (딸린 동화 본문에서 뽑았다)
      "제비", "까치", "개미", "베짱이", "강아지", "다람이", "요정", "난쟁이", "벌",
    ],
    rate: 1.06,
    shiftPitch: true,
    label: "작은 동물",
  },
  { words: ["할머니", "할멈", "외할머니", "친할머니"], rate: 0.9, shiftPitch: true, label: "할머니" },
  { words: ["할아버지", "할아범", "영감", "촌장"], rate: 0.88, shiftPitch: true, label: "할아버지" },
  {
    words: [
      "호랑이", "곰", "사자", "늑대", "용왕", "용", "도깨비", "거인", "괴물", "고래", "코끼리",
      "임금", "원님", "마녀", "대감", "스님", "신선",
    ],
    rate: 0.86,
    shiftPitch: true,
    label: "큰 인물",
  },
  {
    // 느긋하고 묵직한 동물 — 큰 인물만큼 낮추면 무섭게 들린다.
    words: ["돼지", "당나귀", "거북", "황소", "염소", "오리", "코뿔소", "하마"],
    rate: 0.94,
    shiftPitch: true,
    label: "느긋한 동물",
  },
  {
    words: ["엄마", "어머니", "아빠", "아버지", "아저씨", "아주머니", "선생님", "이모", "삼촌", "고모"],
    rate: 0.96,
    shiftPitch: false,
    label: "어른",
  },
];

/** 배역을 알아냈지만 위 어디에도 안 맞으면 아이로 본다 — 주인공과 친구들이 여기다. */
const CHILD_TONE: SpeakerTone = { rate: 1.03, shiftPitch: false, label: "아이" };
/** 누가 말하는지 못 알아냈을 때. 모르면 손대지 않는 것이 맞다. */
const PLAIN_TONE: SpeakerTone = { rate: 1, shiftPitch: false, label: "그대로" };

const ROLE_WORDS = TONE_RULES.flatMap((rule) => rule.words);

function nfc(text: string): string {
  return text.normalize("NFC");
}

function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/*
 * 주격 조사 — "할머니가 말했어요"의 '가'.
 *
 * 이걸 굳이 보는 이유: 이름만 찾으면 "할머니가 하온이를 보았어요"에서 뒤에 있는
 * 하온이가 말한 것으로 잡힌다(실제로 흔한 문장이다). 말하는 사람은 목적어가 아니라
 * 주어다. 그래서 이름 뒤가 '가·는·은·도·이'일 때만 화자 후보로 센다.
 *
 * 뒤따르는 부정 조건은 이름 끝의 '이'가 목적격 '이름이를'로 이어지는 경우를 막는다.
 * "하온이를"은 '하온' + '이'까지 맞아떨어져서, 막지 않으면 주어로 잘못 읽힌다.
 */
const SUBJECT_PARTICLE = "(?:께서는|께서|가|는|은|도|이)";
const NOT_ANOTHER_PARTICLE = "(?![를을에게한테와과의로써])";
/** 아는 이름만이 아니라 '주어로 쓰인 말' 전부를 뽑는다. 아래 주석 참고. */
const ANY_SUBJECT = new RegExp(`([가-힣]{2,8}?)\\s*${SUBJECT_PARTICLE}${NOT_ANOTHER_PARTICLE}`, "g");

/**
 * 이 글에서 주어로 쓰인 말들을 나온 차례대로.
 *
 * 왜 아는 이름만 찾지 않는가 — 그게 엉뚱한 사람을 화자로 만들기 때문이다.
 * `제비가 물어다 준 박씨를 흥부는 뜰에 심었어요. "이게 웬 박씨일까?"`
 * 여기서 아는 이름(제비)만 찾으면 제비가 말한 것이 된다. 실제로 딸린 전래동화에서
 * 그렇게 잘못 잡혔다. 흥부는 등장인물 목록에 없어서 후보에 없었을 뿐인데도.
 *
 * 그래서 주어를 전부 뽑은 뒤 **대사에 가장 가까운 주어**만 본다. 그게 아는 배역이면
 * 톤을 주고, 모르는 말이면 아무것도 하지 않는다. 틀린 목소리는 밋밋한 목소리보다 나쁘다.
 */
function subjectTokens(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(ANY_SUBJECT)) found.push(match[1]);
  return found;
}

/** 주어로 쓰인 말이 우리가 아는 배역인가. '하온이도'의 '하온이'는 '하온'으로 친다. */
function matchCandidate(token: string, candidates: string[]): string | null {
  return (
    candidates.find(
      (name) => token === name || token.startsWith(name) || name.startsWith(token),
    ) ?? null
  );
}

/**
 * 화자 후보 이름들 — 등장인물 이름 + 이 쪽에 실제로 나온 배역 낱말.
 *
 * 배역 낱말까지 넣는 이유: 할머니가 @@CHARACTER@@에 안 적혀 있어도
 * "할머니가 말했어요"라고 쓰여 있으면 톤은 알 수 있다. 우리에게 필요한 건
 * 그 사람이 누구인지가 아니라 어떤 목소리로 읽을지뿐이다.
 *
 * 긴 이름을 앞에 둔다 — '박 할머니'가 있으면 '할머니'보다 먼저 맞아야 한다.
 */
function speakerCandidates(pageText: string, cast: CastMember[]): string[] {
  const names = new Set<string>();
  for (const member of cast) {
    const name = nfc(member.name ?? "").trim();
    if (!name) continue;
    names.add(name);
    // "박 할머니"처럼 띄어쓴 이름은 본문에서 뒷말만 쓰이는 일이 잦다.
    const tail = name.split(/\s+/).pop();
    if (tail && tail !== name && tail.length >= 2) names.add(tail);
  }
  for (const word of ROLE_WORDS) {
    if (pageText.includes(word)) names.add(word);
  }
  return [...names].sort((a, b) => b.length - a.length);
}

/** 대사 앞 지문에서 화자 — 대사에 가장 가까운, 즉 마지막 주어를 본다. */
function lastSubject(text: string, candidates: string[]): string | null {
  const tokens = subjectTokens(text);
  const nearest = tokens[tokens.length - 1];
  return nearest ? matchCandidate(nearest, candidates) : null;
}

/** 대사 뒤 지문에서 화자 — 대사에 가장 가까운, 즉 첫 주어를 본다. */
function firstSubject(text: string, candidates: string[]): string | null {
  const nearest = subjectTokens(text)[0];
  return nearest ? matchCandidate(nearest, candidates) : null;
}

/**
 * 조각마다 누가 말한 것인지 찾는다. 지문 조각과 못 찾은 대사는 null.
 *
 * 찾는 순서가 중요하다. 앞 지문을 먼저 본다:
 *   `할머니가 말했어요. "하온이 왔구나."`  ← 앞을 봐야 할머니가 나온다.
 * 앞에서 못 찾으면 뒤 지문을 본다:
 *   `"하온이 왔구나." 할머니가 두 팔을 벌렸어요.`  ← 이건 뒤에 있다.
 * 순서를 뒤집으면 첫 예문에서 대사 속 '하온이'를 화자로 잡는다.
 */
function tooShort(s: string): boolean {
  return s.replace(/[\s"“”…!?,.~—-]/g, "").length < 5;
}

/**
 * 따옴표로 묶인 대사와 지문을 나눈다.
 * 이어 붙이면 원문과 정확히 같아야 한다 (색칠 동기화가 글자 수로 돌기 때문).
 */
/*
 * 속마음도 그 인물이 읽는다 — 작은따옴표로 감싼 문장.
 *
 * 아이 책은 소리 내어 하는 말은 큰따옴표, 마음속으로 하는 말은 작은따옴표로 쓴다.
 * 예전엔 큰따옴표만 대사로 쳐서, 흥부의 '이만하면 우리 아이들 저녁은 먹이겠구나.'
 * 같은 속마음이 통째로 나레이션 목소리로 나갔다. 그림 속에서 흥부가 생각하는데
 * 소리는 이야기 할아버지인 셈이다.
 *
 * 다만 작은따옴표를 전부 대사로 치면 안 된다 — 이름을 감쌀 때도 쓴다
 * (사람들은 '혹부리 영감'이라고 불렀어요). 그래서 **문장으로 끝나는 것만** 대사로 본다:
 * 속마음은 . ! ? … 로 닫히고, 이름은 그렇지 않다. 실제 19권을 훑어 아홉 곳 중
 * 일곱이 속마음, 둘이 이름이었고 이 규칙으로 정확히 갈렸다.
 */
const QUOTED_SPLIT = /("[^"]*"|“[^”]*”|'[^']*'|‘[^’]*’)/;

/** 이 조각이 대사인가 — 큰따옴표는 늘, 작은따옴표는 문장으로 끝날 때만. */
export function isQuotedLine(s: string): boolean {
  if (/^["“]/.test(s)) return true;
  if (!/^['‘]/.test(s)) return false;
  const inner = s.slice(1, -1).trim();
  return /[.!?…]$/.test(inner);
}

export function splitDialogue(text: string): { text: string; dialogue: boolean }[] {
  const parts = text.split(QUOTED_SPLIT).filter((s) => s.length > 0);
  const segs = parts.map((s) => ({ text: s, dialogue: isQuotedLine(s) }));

  // 짧은 조각은 앞 조각에 붙인다. 맨 앞이 짧으면 뒤 조각에 붙인다.
  const merged: { text: string; dialogue: boolean }[] = [];
  for (const s of segs) {
    const prev = merged[merged.length - 1];
    if (prev && tooShort(s.text)) {
      prev.text += s.text;
      continue;
    }
    merged.push({ ...s });
  }
  while (merged.length >= 2 && tooShort(merged[0].text)) {
    merged[1].text = merged[0].text + merged[1].text;
    merged.shift();
  }
  return merged;
}

export function attributeSpeakers(
  segments: DialogueSegment[],
  cast: CastMember[] = [],
): (string | null)[] {
  const pageText = nfc(segments.map((s) => s.text).join(""));
  const candidates = speakerCandidates(pageText, cast);
  if (candidates.length === 0) return segments.map(() => null);

  return segments.map((segment, index) => {
    if (!segment.dialogue) return null;

    for (let i = index - 1; i >= 0; i--) {
      if (segments[i].dialogue) continue;
      const found = lastSubject(nfc(segments[i].text), candidates);
      if (found) return found;
      break; // 바로 앞 지문에 주어가 없으면 더 거슬러 올라가지 않는다
    }
    for (let i = index + 1; i < segments.length; i++) {
      if (segments[i].dialogue) continue;
      const found = firstSubject(nfc(segments[i].text), candidates);
      if (found) return found;
      break;
    }
    return null;
  });
}

/**
 * 그 배역을 어떤 톤으로 읽을지. 화자를 모르면 손대지 않는다(rate 1).
 *
 * 이름만으로 모자랄 때가 있어 등장인물 설명도 함께 본다 — 이름이 '두리'인데
 * 설명이 '마을을 지키는 늙은 호랑이'면 이름으로는 알 수 없다.
 */
export function speakerTone(speaker: string | null, cast: CastMember[] = []): SpeakerTone {
  if (!speaker) return PLAIN_TONE;
  const name = nfc(speaker);
  const member = cast.find((c) => nfc(c.name ?? "") === name);
  const haystack = `${name} ${nfc(member?.description ?? "")}`;
  for (const rule of TONE_RULES) {
    if (rule.words.some((word) => haystack.includes(word))) {
      return { rate: rule.rate, shiftPitch: rule.shiftPitch, label: rule.label };
    }
  }
  return CHILD_TONE;
}

/** 조각별 톤 — 지문은 언제나 그대로, 대사만 배역 톤으로 읽는다. */
export function segmentTones(
  segments: DialogueSegment[],
  cast: CastMember[] = [],
): SpeakerTone[] {
  const speakers = attributeSpeakers(segments, cast);
  return segments.map((segment, index) =>
    segment.dialogue ? speakerTone(speakers[index], cast) : PLAIN_TONE,
  );
}
