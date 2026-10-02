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
  /** 생김새 + (있으면) 이 책의 옷 — 시트·쪽 그림·검수가 예전처럼 이 한 줄을 본다. */
  description: string;
  /**
   * 이 책의 옷(2026-09-29~, `이름 | 생김새 | 이 책의 옷`) — 책마다 바뀐다. 고정 가족은 가족 그림의 옷 대신 이것을 입는다
   * (api/character-sheet 옷 카드). 두 칸짜리 옛 줄엔 없다.
   */
  outfit?: string;
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

/*
 * 마커 줄. 모델이 마커를 꾸며 쓰는 일에 대비한다(2026-10-01, 대본 모델을 Sonnet 5.5 로 바꾼 날):
 * 앞에 공백·'**'·'#'·'-'·'>'를 붙이거나 뒤에 '**'를 붙인 꼴(**@@TITLE@@** 제목)도 같은 마커로 읽는다.
 * 마커 이름은 @@대문자@@ 뿐이라 본문 글과 헷갈릴 일이 없다.
 */
const MARKER = /^[\s>*#_`-]*@@([A-Z]+)@@[*_`]*[ \t]*(.*)$/;
/** 코드 울타리(```) 줄 — 모델이 답 전체를 코드 블록에 담으면 생긴다. 본문에 넣지 않는다. */
const FENCE = /^\s*```/;

type Block = { tag: string; inline: string; body: string[] };

/** 평문을 마커 단위 블록으로 쪼갠다. 마커 없는 줄은 직전 블록의 본문이 된다. */
function toBlocks(raw: string): Block[] {
  const blocks: Block[] = [];

  for (const line of raw.replace(/\r\n?/g, "\n").split("\n")) {
    if (FENCE.test(line)) continue;
    const m = line.match(MARKER);
    if (m) {
      // 마커 뒤 글 끝의 꾸밈(**제목**의 끝 '**')만 걷는다.
      blocks.push({ tag: m[1], inline: m[2].replace(/[*_`]+$/, "").trim(), body: [] });
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
        /*
         * "이름 | 생김새" — 구분자가 없으면 통째로 이름 취급한다.
         *
         * 한 표시 안에 여러 줄이 올 수 있다. 실제로 클로드가 네 사람을
         * @@CHARACTER@@ 하나에 네 줄로 적어 보낸 적이 있는데, 예전 코드는 첫 줄만
         * 이름으로 보고 **나머지 셋을 첫 사람의 생김새로 붙여** 버렸다. 그 결과
         * 캐릭터 시트도 쪽별 인물 잠금도 한 명만 알았고, 남의 설명이 섞여 들어가
         * 네 살 아이 대사가 '용' 톤으로 읽히기까지 했다(마트'용' 장바구니).
         * 줄마다 한 사람으로 읽는다.
         *
         * 셋째 칸 = 이 책의 옷(2026-09-29~). 설명(description)에도 이어 붙인다 — 시트·쪽 그림·검수는 예전처럼
         * 설명 한 줄만 보면 되고, 옷 칸은 고정 가족의 옷 카드와 쪽 그림의 '이 책의 옷' 줄만 따로 쓴다.
         * 칸이 더 있으면(클로드가 옷 안에 | 를 씀) 쉼표로 이어 옷 칸에 합친다. 두 칸짜리 줄은 예전 그대로(outfit 없음).
         */
        for (const line of inlineOrBody.split(/[\r\n]+/)) {
          const row = line.trim();
          if (!row) continue;
          const [name, looks = "", ...more] = row.split("|");
          if (!name.trim()) continue;
          const outfit = more.map((part) => part.trim()).filter(Boolean).join(", ");
          characters.push({
            name: name.trim(),
            description: [looks.trim(), outfit].filter(Boolean).join(", "),
            ...(outfit ? { outfit } : {}),
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
