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

/** 기승전결. 줄거리 단계의 출력이자 본문 단계의 입력. */
export const ACTS = ["기", "승", "전", "결"] as const;
export type ActName = (typeof ACTS)[number];

export type OutlineAct = {
  act: ActName;
  text: string;
};

export type ParsedOutline = {
  title: string;
  summary: string;
  acts: OutlineAct[];
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
};

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
 * 줄거리(1단계)를 파싱한다.
 *
 * 본문을 바로 뽑지 않고 줄거리를 먼저 받는 이유는 원가다. 삽화 8장이 ₩440인데
 * 줄거리는 ₩22라, 부모가 마음에 들 때까지 굴려도 부담이 없다. 확정된 뒤에야
 * 비싼 단계로 넘어간다. 덤으로 출력이 짧아 기승전결 구조가 덜 흔들린다.
 */
export function parseOutline(raw: string): ParsedOutline {
  const blocks = toBlocks(raw);
  if (blocks.length === 0) {
    throw new StoryParseError("마커를 하나도 찾지 못했습니다.");
  }

  let title = "";
  let summary = "";
  const acts: OutlineAct[] = [];
  let current: OutlineAct | null = null;

  const flush = () => {
    if (current) acts.push(current);
    current = null;
  };

  for (const block of blocks) {
    const inlineOrBody = block.inline || joinBody(block);

    switch (block.tag) {
      case "TITLE":
        title = inlineOrBody;
        break;

      case "SUMMARY":
        summary = inlineOrBody;
        break;

      case "ACT": {
        flush();
        const act = ACTS.find((a) => a === block.inline);
        if (!act) {
          throw new StoryParseError(`@@ACT@@가 기·승·전·결이 아닙니다: "${block.inline}"`);
        }
        current = { act, text: "" };
        break;
      }

      case "TEXT":
        if (!current) throw new StoryParseError("@@ACT@@ 없이 @@TEXT@@가 먼저 나왔습니다.");
        current.text = inlineOrBody;
        break;

      default:
        break;
    }
  }
  flush();

  if (!title) throw new StoryParseError("@@TITLE@@이 없습니다.");

  // 4막이 전부 있어야 한다. 하나라도 빠지면 본문 단계에서 구조가 무너진다.
  const missing = ACTS.filter((a) => !acts.some((x) => x.act === a && x.text));
  if (missing.length > 0) {
    throw new StoryParseError(`${missing.join("·")} 막이 비어 있습니다.`);
  }

  // 모델이 순서를 바꿔 내놔도 기승전결로 세운다.
  acts.sort((a, b) => ACTS.indexOf(a.act) - ACTS.indexOf(b.act));

  return { title, summary, acts };
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
    const inlineOrBody = block.inline || joinBody(block);

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
        current = { pageNo, text: "", imagePrompt: "" };
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
