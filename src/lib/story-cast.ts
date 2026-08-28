// 상대 경로로 부른다 — 테스트 러너와 낭독 굽는 스크립트가 @/ 별칭을 못 읽는다.
import { attributeSpeakers, splitDialogue, type CastMember } from "./speaker-tone.ts";

/**
 * 한 쪽을 '누가 읽을지'까지 정해진 조각으로 나눈다.
 *
 * 왜 필요한가 — 전래동화·세계명작은 낭독을 미리 구워 두는데, 예전엔 한 쪽이 통짜
 * mp3 하나여서 토끼 대사도 나레이션 성우가 읽었다. 아이 눈에는 그림 속 토끼가
 * 말하는데 소리는 할머니 목소리인 셈이다.
 *
 * 이제 쪽을 지문/대사로 쪼개고 대사마다 배역을 붙여, 배역별 성우로 따로 굽는다.
 * 뷰어는 그 조각들을 차례로 이어서 튼다.
 */

/** 나레이션(지문)을 가리키는 배역 이름. 실제 등장인물 이름과 겹치지 않게 영어로 둔다. */
export const NARRATION = "narration";

/**
 * 대사집 한 줄 — "이 대사는 누구 말이다".
 *
 * 자동 판정(attributeSpeakers)은 앞뒤 지문의 주어를 보고 짐작하는데, 실제 책에서
 * 11개 중 4개를 틀렸다. 예: 토끼가 하품하며 하는 말인데 바로 앞 지문의 주어가
 * '거북이'라 거북이 대사로 잡혔다. 그래서 손으로 못박을 수단을 둔다.
 */
export type CastLine = {
  text: string;
  who: string;
  /**
   * 읽기용 표기(선택). 화면에는 text가 그대로 보이고, 성우는 이걸 읽는다.
   *
   * TTS는 글자를 곧이곧대로 읽어서 "자, 준비… 시작!"이 밋밋하게 나온다.
   * 출발 신호는 늘어뜨려야 그럴듯하다 — say에 "자아, 준비이… 시작!"을 적으면
   * 아이가 보는 글은 그대로면서 소리만 늘어난다.
   * 맞춤법이 틀린 글을 아이에게 보여주지 않으면서 연기를 살리는 방법이다.
   */
  say?: string;
  /**
   * 이 줄의 연기(감정 프리셋). 안 적으면 굽는 쪽이 글자를 보고 정한다(emotionOf).
   *
   * 글자만 보는 자동 판정은 "으악! 뜨거워!" 같은 우스운 비명을 슬픔으로 잡는다 —
   * '으악'이 슬픔 신호라서다. 놀라 호들갑 떠는 줄은 여기 "toneup" 처럼 못 박는다.
   * (2026-08-27 사장님: 뜨거워 비명 둘이 너무 천천히 나온다)
   */
  feel?: string;
};

export type PlannedSegment = {
  /** 배역 이름. 지문이면 NARRATION. */
  who: string;
  /** 그 조각의 원문. 이어 붙이면 쪽 본문과 정확히 같다(색칠이 글자 수로 돌기 때문). */
  text: string;
  dialogue: boolean;
  /** 성우가 실제로 읽을 글(대사집의 say). 없으면 text를 읽는다. */
  say?: string;
  /** 이 줄에 못 박은 연기(대사집의 feel). 없으면 굽는 쪽이 정한다. */
  feel?: string;
};

/** 대사집과 견주기 위해 따옴표·공백·문장부호를 털어낸다. */
function normalize(text: string): string {
  return text
    .normalize("NFC")
    .replace(/["“”‘’']/g, "")
    .replace(/\s+/g, "")
    .trim();
}

/**
 * 쪽 본문을 조각으로 나누고 조각마다 배역을 정한다.
 *
 * 정하는 순서 — 뒤로 갈수록 세다:
 *   ① 지문은 무조건 나레이션
 *   ② 자동 판정(앞뒤 지문의 주어)
 *   ③ 대사집에 적힌 것 — 여기 적혀 있으면 무조건 이긴다
 *
 * 대사집은 **글로 맞춘다**(순서가 아니라). 순서로 맞추면 본문을 한 글자만 고쳐도
 * 배역이 통째로 밀린다.
 */
export function planPageVoices(input: {
  text: string;
  /** 이 쪽의 대사집(선택). 자동 판정이 틀린 것만 적으면 된다. */
  lines?: CastLine[];
  /** 자동 판정에 쓸 등장인물. 이름은 본문에 나오는 그대로(토끼·거북이). */
  cast?: CastMember[];
  /** 등장인물 이름 → 배역 이름 (토끼 → rabbit). 없으면 이름을 그대로 쓴다. */
  roleOf?: Record<string, string>;
}): PlannedSegment[] {
  const segments = splitDialogue(input.text);
  const guessed = attributeSpeakers(segments, input.cast ?? []);
  const script = scriptOf(input.lines ?? []);

  const planned: PlannedSegment[] = [];
  segments.forEach((segment, i) => {
    if (!segment.dialogue) {
      // 아주 짧은 대사는 조각내기 단계에서 지문에 붙어 버린다("안 돼!", "빨리 가자!").
      // 대사집에 적혀 있으면 여기서 다시 떼어낸다.
      planned.push(...rescueShortLines(segment.text, script));
      return;
    }
    const told = script.get(normalize(segment.text));
    if (told) {
      planned.push({ who: told.who, text: segment.text, dialogue: true, say: told.say, feel: told.feel });
      return;
    }
    const name = guessed[i];
    const role = name ? (input.roleOf?.[name] ?? name) : NARRATION;
    // 따옴표 대사가 연달아 붙으면("…올라와야지!"\n"앗, 안 돼!") 조각내기가 한 덩어리로
    // 묶는다. 대사집에 각각 적혀 있으면 덩어리 안에서 갈라 서로 다른 목소리를 준다.
    planned.push(...splitByScript(segment.text, script, role));
  });
  return planned;
}

/**
 * 한 대사 덩어리 안의 따옴표 대사를 대사집으로 갈라낸다.
 *
 * 대사집에 적힌 것만 떼고, 나머지(적히지 않은 대사·사이의 공백)는 자동 판정한 배역에
 * 그대로 둔다. 사이 공백은 앞 조각 꼬리에 붙여 조각을 이어 붙이면 원문과 같게 한다.
 */
function splitByScript(text: string, script: Script, fallback: string): PlannedSegment[] {
  const whole = { who: fallback, text, dialogue: true };
  if (script.size === 0) return [whole];
  const out: PlannedSegment[] = [];
  let at = 0;
  let hit = false;
  const push = (piece: PlannedSegment) => {
    const prev = out[out.length - 1];
    if (prev && piece.text.trim() === "") prev.text += piece.text;
    else out.push(piece);
  };
  for (const match of text.matchAll(QUOTED)) {
    const told = script.get(normalize(match[0]));
    if (!told) continue;
    hit = true;
    const start = match.index ?? 0;
    if (start > at) push({ who: fallback, text: text.slice(at, start), dialogue: true });
    push({ who: told.who, text: match[0], dialogue: true, say: told.say, feel: told.feel });
    at = start + match[0].length;
  }
  if (!hit) return [whole];
  if (at < text.length) push({ who: fallback, text: text.slice(at), dialogue: true });
  return out;
}

/** 대사집 찾아보기 — 글로 찾되, 같은 글이 여러 줄이면 본문 순서대로 하나씩 내준다. */
type Script = { size: number; get(key: string): CastLine | undefined };

function scriptOf(lines: CastLine[]): Script {
  const queues = new Map<string, CastLine[]>();
  for (const line of lines) {
    const key = normalize(line.text);
    const queue = queues.get(key) ?? [];
    queue.push(line);
    queues.set(key, queue);
  }
  return {
    size: lines.length,
    get(key) {
      const queue = queues.get(key);
      if (!queue) return undefined;
      // "좋아!" "좋아!" 처럼 같은 말을 다른 배역이 잇달아 하면 적힌 순서대로 준다.
      // 마지막 줄은 남겨 둔다 — 본문에 더 나와도 계속 맞아야 하므로.
      return queue.length > 1 ? queue.shift() : queue[0];
    },
  };
}

/**
 * 따옴표로 묶인 부분을 찾는다. 곧은 것과 굽은 것, 큰것과 작은것 넷 다.
 *
 * 작은따옴표는 속마음이다(마음속으로 하는 말). 이름을 감싼 것까지 걸리지만,
 * 여기 걸린 것 가운데 **대사집에 적힌 줄만** 되살리므로 이름이 대사가 되지는 않는다.
 */
const QUOTED = /"[^"]*"|“[^”]*”|'[^']*'|‘[^’]*’/g;

/**
 * 지문 안에 숨은 짧은 대사를 대사집의 힘으로 떼어낸다.
 *
 * 조각내기(splitDialogue)는 다섯 글자가 안 되는 조각을 앞에 붙인다 — 통짜로 읽을
 * 때는 그게 자연스럽지만, 배역을 입힐 때는 "안 돼!"처럼 아이가 제일 좋아할 외침이
 * 통째로 나레이션 목소리가 되어 버린다.
 *
 * 그 규칙 자체를 바꾸면 실시간 낭독의 끊어 읽기와 글자 색칠까지 흔들리므로,
 * **대사집에 적힌 줄만** 여기서 되살린다. 안 적힌 짧은 말은 그대로 둔다.
 */
function rescueShortLines(text: string, script: Script): PlannedSegment[] {
  if (script.size === 0) return [{ who: NARRATION, text, dialogue: false }];
  const out: PlannedSegment[] = [];
  let at = 0;
  for (const match of text.matchAll(QUOTED)) {
    const told = script.get(normalize(match[0]));
    if (!told) continue;
    const start = match.index ?? 0;
    if (start > at) out.push({ who: NARRATION, text: text.slice(at, start), dialogue: false });
    out.push({ who: told.who, text: match[0], dialogue: true, say: told.say, feel: told.feel });
    at = start + match[0].length;
  }
  if (out.length === 0) return [{ who: NARRATION, text, dialogue: false }];
  if (at < text.length) out.push({ who: NARRATION, text: text.slice(at), dialogue: false });
  return out;
}

/**
 * 대사집이 실제 본문과 맞는지 확인한다.
 *
 * 본문을 고치면 대사집이 조용히 안 맞게 되고, 그러면 그 대사만 나레이션 목소리로
 * 돌아간다 — 듣기 전에는 아무도 모른다. 그래서 굽기 전에 걸러낸다.
 */
export function unmatchedLines(pageText: string, lines: CastLine[] = []): CastLine[] {
  /*
   * 조각내기 결과가 아니라 **본문 원문의 따옴표**를 본다.
   *
   * 짧은 대사는 조각내기에서 지문에 붙는데, 그걸 기준으로 삼으면 멀쩡히 본문에
   * 있는 대사집 줄을 "본문에 없다"고 잘못 신고한다.
   */
  const inPage = new Set([...pageText.matchAll(QUOTED)].map((m) => normalize(m[0])));
  return lines.filter((l) => !inPage.has(normalize(l.text)));
}

/** 배역이 정해지지 않은 대사 — 굽기 전에 사람이 정해 줘야 한다. */
export function unassignedDialogue(segments: PlannedSegment[]): PlannedSegment[] {
  return segments.filter((s) => s.dialogue && s.who === NARRATION);
}
