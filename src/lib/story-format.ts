import type { VoiceDirection, VoiceEmotion, VoicePace } from "@/lib/types";

/**
 * 스토리 생성 결과를 파싱한다.
 *
 * 모델에게 JSON을 시키지 않고 마커가 박힌 평문을 받는다. 인수인계 문서에 기록된
 * 이유가 있다: 한국어 동화는 대사가 많아 따옴표가 계속 나오는데, JSON으로 받으면
 * 이스케이프가 깨져 절반 가까이 파싱에 실패했다. 마커 평문은 따옴표를 신경 쓸
 * 필요가 없어서 이 문제가 원천적으로 사라진다.
 *
 * 기대 형식:
 *
 *   @@TITLE@@ 아린이의 반짝 보물 찾기
 *   @@SUMMARY@@ 아린이가 친구들과 보물을 찾아 떠나는 이야기
 *   @@CHARACTER@@ 아린 | 일곱 살 여자아이, 노란 우비, 단발머리
 *   @@CHARACTER@@ 효담 | 아린이의 친구, 파란 모자
 *   @@PAGE@@ 1
 *   @@TEXT@@
 *   어느 맑은 날, 아린이는 마당에서 지도를 주웠어요.
 *   "어? 이거 보물 지도잖아!"
 *   @@IMG@@ 마당에서 낡은 지도를 펼쳐 든 아린이, 맑은 하늘
 *   @@PAGE@@ 2
 *   ...
 */

/**
 * 줄거리는 **장면 단위**다. 기승전결 4막이 아니라 "1장면·2장면…" 리스트로,
 * 부모가 고른 장면 수(pageCount)만큼 나온다. 기승전결은 사라진 게 아니라 이
 * 장면들이 전체적으로 시작→사건→해결을 이루도록 배열되는 것으로 녹아든다.
 *
 * 이렇게 하면 줄거리의 각 장면이 본문의 각 쪽, 나아가 삽화 한 장과 1:1로 맞는다.
 */
export type OutlineScene = {
  sceneNo: number;
  text: string;
};

export type ParsedOutline = {
  title: string;
  summary: string;
  scenes: OutlineScene[];
};

export type StoryCharacter = {
  name: string;
  description: string;
};

export type ParsedPage = {
  pageNo: number;
  /** 화면에 낭독·표시되는 본문. */
  text: string;
  /** 삽화 생성 프롬프트로 넘어갈 장면 묘사. */
  imagePrompt: string;
  voiceDirection: VoiceDirection;
};

const DEFAULT_VOICE_DIRECTION: VoiceDirection = {
  narration: "normal",
  dialogue: "normal",
  intensity: 0.5,
  pace: "normal",
};

const VOICE_EMOTIONS = new Set<VoiceEmotion>(["normal", "toneup", "happy", "sad", "angry"]);
const VOICE_PACES = new Set<VoicePace>(["slow", "normal", "lively"]);

function parseVoiceDirection(value: string): VoiceDirection {
  const fields = Object.fromEntries(
    value.split("|").map((part) => {
      const [key, ...rest] = part.split("=");
      return [key?.trim().toLowerCase(), rest.join("=").trim().toLowerCase()];
    }),
  );
  const narration = VOICE_EMOTIONS.has(fields.narration as VoiceEmotion)
    ? (fields.narration as VoiceEmotion)
    : DEFAULT_VOICE_DIRECTION.narration;
  const dialogue = VOICE_EMOTIONS.has(fields.dialogue as VoiceEmotion)
    ? (fields.dialogue as VoiceEmotion)
    : DEFAULT_VOICE_DIRECTION.dialogue;
  const pace = VOICE_PACES.has(fields.pace as VoicePace)
    ? (fields.pace as VoicePace)
    : DEFAULT_VOICE_DIRECTION.pace;
  const rawIntensity = Number(fields.intensity);
  const intensity = Number.isFinite(rawIntensity)
    ? Math.min(0.65, Math.max(0.3, rawIntensity))
    : DEFAULT_VOICE_DIRECTION.intensity;
  return { narration, dialogue, intensity, pace };
}

export type ParsedStory = {
  title: string;
  summary: string;
  characters: StoryCharacter[];
  pages: ParsedPage[];
};

export class StoryParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoryParseError";
  }
}

const MARKER = /^@@([A-Z]+)@@[ \t]*(.*)$/;

type Block = { tag: string; inline: string; body: string[] };

/** 평문을 마커 단위 블록으로 쪼갠다. 마커 없는 줄은 직전 블록의 본문이 된다. */
function toBlocks(raw: string): Block[] {
  const blocks: Block[] = [];

  for (const line of raw.replace(/\r\n?/g, "\n").split("\n")) {
    const m = line.match(MARKER);
    if (m) {
      blocks.push({ tag: m[1], inline: m[2].trim(), body: [] });
    } else if (blocks.length > 0) {
      blocks[blocks.length - 1].body.push(line);
    }
    // 첫 마커 앞의 잡담(“네, 동화를 만들어 드릴게요!”)은 버린다.
  }

  return blocks;
}

function joinBody(block: Block): string {
  return block.body.join("\n").trim();
}

/**
 * 마커 한 줄에 붙은 글과 그 아래 줄들을 **모두** 합친다.
 *
 * 예전에는 `block.inline || joinBody(block)`이었다 — 마커 줄에 한 글자라도 있으면
 * 아래 줄을 통째로 버렸다. 그래서 모델이 이렇게 쓰면 뒷줄이 다 사라졌다:
 *
 *   @@IMG@@ 등장인물 1명: 하온.
 *   하온이가 서가 앞에서 책을 펼친다. 장소: 도서관 — 나무 책장과 창문.
 *
 * 남는 것은 "등장인물 1명: 하온."뿐이라, 그림 모델은 인원수만 알고 무엇을
 * 그릴지는 모르는 채 그렸다(실제로 세 권이 그렇게 나왔다). 장소·물건 잠금도
 * 같이 날아가서, 애써 넣은 규칙이 하나도 닿지 않았다.
 *
 * 줄이 나뉘는 건 모델의 자유다. 파서가 거기에 맞춰야지 그 반대가 아니다.
 */
function markerContent(block: Block): string {
  const body = joinBody(block);
  if (!block.inline) return body;
  if (!body) return block.inline;
  return `${block.inline}\n${body}`;
}

/**
 * 줄거리(1단계)를 파싱한다.
 *
 * 본문을 바로 뽑지 않고 줄거리를 먼저 받는 이유는 원가다. 삽화 8장이 ₩440인데
 * 줄거리는 ₩22라, 부모가 마음에 들 때까지 굴려도 부담이 없다. 확정된 뒤에야
 * 비싼 단계로 넘어간다. 덤으로 출력이 짧아 이야기 구조가 덜 흔들린다.
 *
 * 장면 단위(@@SCENE@@ 1 / @@TEXT@@ …)로 받는다. 본문 파싱(@@PAGE@@)과 같은 얼개다.
 */
export function parseOutline(raw: string): ParsedOutline {
  const blocks = toBlocks(raw);
  if (blocks.length === 0) {
    throw new StoryParseError("마커를 하나도 찾지 못했습니다.");
  }

  let title = "";
  let summary = "";
  const scenes: OutlineScene[] = [];
  let current: OutlineScene | null = null;

  const flush = () => {
    if (current) scenes.push(current);
    current = null;
  };

  for (const block of blocks) {
    const inlineOrBody = markerContent(block);

    switch (block.tag) {
      case "TITLE":
        title = inlineOrBody;
        break;

      case "SUMMARY":
        summary = inlineOrBody;
        break;

      case "SCENE": {
        flush();
        const sceneNo = Number.parseInt(block.inline, 10);
        if (!Number.isFinite(sceneNo)) {
          throw new StoryParseError(`@@SCENE@@ 번호를 읽을 수 없습니다: "${block.inline}"`);
        }
        current = { sceneNo, text: "" };
        break;
      }

      case "TEXT":
        if (!current) throw new StoryParseError("@@SCENE@@ 없이 @@TEXT@@가 먼저 나왔습니다.");
        current.text = inlineOrBody;
        break;

      default:
        break;
    }
  }
  flush();

  if (!title) throw new StoryParseError("@@TITLE@@이 없습니다.");
  if (scenes.length === 0) throw new StoryParseError("장면을 하나도 찾지 못했습니다.");

  const empty = scenes.find((s) => !s.text);
  if (empty) throw new StoryParseError(`${empty.sceneNo}장면 줄거리가 비어 있습니다.`);

  // 모델이 번호를 건너뛰거나 순서를 바꿔도 1,2,3…으로 다시 세운다.
  scenes.sort((a, b) => a.sceneNo - b.sceneNo);
  scenes.forEach((s, i) => {
    s.sceneNo = i + 1;
  });

  return { title, summary, scenes };
}

export function parseStory(raw: string): ParsedStory {
  const blocks = toBlocks(raw);
  if (blocks.length === 0) {
    throw new StoryParseError("마커를 하나도 찾지 못했습니다.");
  }

  let title = "";
  let summary = "";
  const characters: StoryCharacter[] = [];
  const pages: ParsedPage[] = [];

  // @@PAGE@@를 만나면 새 페이지를 열고, @@TEXT@@/@@IMG@@는 열린 페이지에 붙는다.
  let current: ParsedPage | null = null;
  const flush = () => {
    if (current) pages.push(current);
    current = null;
  };

  for (const block of blocks) {
    const inlineOrBody = markerContent(block);

    switch (block.tag) {
      case "TITLE":
        title = inlineOrBody;
        break;

      case "SUMMARY":
        summary = inlineOrBody;
        break;

      case "CHARACTER": {
        // "이름 | 생김새" — 구분자가 없으면 통째로 이름 취급한다.
        const [name, ...rest] = inlineOrBody.split("|");
        if (name.trim()) {
          characters.push({
            name: name.trim(),
            description: rest.join("|").trim(),
          });
        }
        break;
      }

      case "PAGE": {
        flush();
        const pageNo = Number.parseInt(block.inline, 10);
        if (!Number.isFinite(pageNo)) {
          throw new StoryParseError(`@@PAGE@@ 번호를 읽을 수 없습니다: "${block.inline}"`);
        }
        current = {
          pageNo,
          text: "",
          imagePrompt: "",
          voiceDirection: { ...DEFAULT_VOICE_DIRECTION },
        };
        break;
      }

      case "TEXT":
        if (!current) throw new StoryParseError("@@PAGE@@ 없이 @@TEXT@@가 먼저 나왔습니다.");
        current.text = inlineOrBody;
        break;

      case "IMG":
        if (!current) throw new StoryParseError("@@PAGE@@ 없이 @@IMG@@가 먼저 나왔습니다.");
        current.imagePrompt = inlineOrBody;
        break;

      case "VOICE":
        if (!current) throw new StoryParseError("@@PAGE@@ 없이 @@VOICE@@가 먼저 나왔습니다.");
        current.voiceDirection = parseVoiceDirection(inlineOrBody);
        break;

      default:
        // 모르는 마커는 조용히 무시한다. 모델이 새 마커를 지어내도 죽지 않아야 한다.
        break;
    }
  }
  flush();

  if (!title) throw new StoryParseError("@@TITLE@@이 없습니다.");
  if (pages.length === 0) throw new StoryParseError("페이지를 하나도 찾지 못했습니다.");

  const empty = pages.find((p) => !p.text);
  if (empty) throw new StoryParseError(`${empty.pageNo}쪽 본문이 비어 있습니다.`);

  // 모델이 번호를 건너뛰거나 중복해도 화면 순서는 어긋나면 안 된다.
  pages.sort((a, b) => a.pageNo - b.pageNo);
  pages.forEach((p, i) => {
    p.pageNo = i + 1;
  });

  return { title, summary, characters, pages };
}
