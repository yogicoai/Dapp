import Anthropic from "@anthropic-ai/sdk";
import {
  parseOutline,
  parseStory,
  type ParsedOutline,
  type ParsedStory,
} from "./story-format";

const client = new Anthropic();
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

/**
 * 장면(쪽) 수는 부모가 3~8에서 고른다. 기승전결 네 막을 이 쪽수에 맞게 배분하되
 * 어떤 쪽수든 '시작 → 사건 → 해결'은 다 담는다(pageGuide 참고).
 *
 * 삽화를 켜면 쪽수가 곧 원가라(쪽당 ₩55·2크레딧) 상한을 8로 묶는다. 하한 3은
 * 아주 어린 아이용 최소 서사.
 */
export const MIN_PAGE_COUNT = 3;
export const MAX_PAGE_COUNT = 8;
export const DEFAULT_PAGE_COUNT = 8;

/** 넘어온 쪽수를 3~8로 가둔다. 없거나 이상하면 기본값. 클라이언트 값은 안 믿는다. */
function clampPageCount(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return DEFAULT_PAGE_COUNT;
  return Math.min(MAX_PAGE_COUNT, Math.max(MIN_PAGE_COUNT, v));
}

/** 고른 쪽수에 기승전결을 어떻게 나눠 담을지 일러준다. */
function pageGuide(n: number): string {
  if (n <= 3) return `${n}쪽: 기(1쪽) → 승·전을 한데 묶어(1쪽) → 결(1쪽)로 압축한다.`;
  if (n === 4) return "4쪽: 기·승·전·결을 각각 1쪽씩.";
  if (n <= 6) return `${n}쪽: 기승전결을 배분하되 사건과 위기(승·전)에 쪽을 더 준다.`;
  if (n === 7) return "7쪽: 기(1) 승(2) 전(2) 결(2)처럼 뒤로 갈수록 넉넉히.";
  return "8쪽: 기·승·전·결을 각 2쪽씩(기 1-2, 승 3-4, 전 5-6, 결 7-8).";
}

export type Gender = "girl" | "boy" | "unspecified";

export type ChildProfile = {
  name: string;
  age: number;
  gender: Gender;
};

/**
 * 나이는 쪽수가 아니라 쪽당 글자수·문장 난이도로 반영한다.
 *
 * 권당 원가의 80%가 삽화(쪽당 ₩55)라, 쪽수를 건드리면 원가가 흔들리고 가격표가
 * 나이마다 갈린다. 글자수는 TTS만 건드리는데 그건 권당 ₩55라 두 배가 돼도 무시할
 * 수준이다. 비싼 축을 고정하고 싼 축을 변수로 둔다.
 *
 * 한 살 차이도 아이한테는 딴 세상이다 — 3세는 "무엇을 했다"만 알고, 6세는 "왜"를
 * 따지며, 8세는 반전을 즐긴다. 그래서 구간(≤5/≤7/8+)이 아니라 **나이별로** 분량과
 * 문장 난이도, 그 나이가 좋아하는 결까지 따로 일러준다. 글자수 하한을 명시해야
 * 먹힌다(하한이 없으면 6세도 50자로 내려온다). 미취학은 원래 글이 짧다 — 그 나이
 * 그림책이 그렇다(그림이 말하고 글은 거든다).
 */
function lengthGuide(age: number): string {
  if (age <= 3) {
    return "쪽당 1문장, 20~35자. 아주 쉬운 말과 의성어·의태어(콩콩, 반짝반짝)를 쓰고, 같은 말을 리듬처럼 반복한다. 3세는 '무엇을 했다'만 안다 — 이유나 시간 순서를 길게 설명하지 않는다.";
  }
  if (age === 4) {
    return "쪽당 1~2문장, 40~55자. 아이가 늘 쓰는 쉬운 단어만 쓴다. '그래서'로 이어지는 짧은 인과 하나 정도는 좋다. 4세는 상상 놀이를 좋아하니 장면이 생생하게.";
  }
  if (age === 5) {
    return "쪽당 2문장, 55~70자. '~해서 ~했어요' 같은 원인과 결과를 넣는다. 5세는 '왜'를 궁금해하니 행동에 이유가 보이게 한다.";
  }
  if (age === 6) {
    return "쪽당 2~3문장, 70~85자. 60자 아래로 내려가면 심심하다. 감정과 이유를 함께 담고('무서웠지만 용기를 냈어요'), 앞뒤 사건이 매끄럽게 이어지게 한다. 6세는 이야기의 흐름을 따라온다.";
  }
  if (age === 7) {
    return "쪽당 3문장, 85~100자. 조금 긴 문장과 새로운 낱말을 한둘 섞어도 된다. 7세는 인물의 마음이 변해가는 걸 이해한다.";
  }
  return "쪽당 3~4문장, 100~120자. 90자 아래로 내려가지 않는다. 문장을 여러 겹으로 엮고 조금 어려운 단어를 섞어도 된다. 8세 이상은 작은 반전과 여운을 즐긴다.";
}

function describeChild(child: ChildProfile): string {
  const gender =
    child.gender === "girl" ? "여자아이" : child.gender === "boy" ? "남자아이" : "아이";
  return `${child.name} (${child.age}세, ${gender})`;
}

const VOICE = `너는 한국 유아·아동용 그림동화 작가다. 아이가 주인공인 동화를 짓는다.

지켜야 할 것:
- 결말에는 아이가 스스로 해낸 것이 남는다. 어른이 대신 해결해주지 않는다.
- 교훈을 설교하지 않는다. 이야기 안에서 저절로 남게 한다.
- 성별로 소재를 가르지 않는다. 주제는 아이가 고른 그대로 쓴다.
- 주제가 감정(화남·무서움·슬픔·질투·부끄러움 등)이면 감정동화로 짓는다:
  감정에 이름을 붙여주고, 몸으로 느끼는 감각(가슴이 콩닥콩닥, 얼굴이 뜨끈)으로
  표현한다. 감정 자체를 나쁘다고 하지 않는다 — 아이가 감정을 알아차리고
  스스로 가라앉히는 과정이 이야기가 된다.`;

const OUTLINE_SYSTEM = `${VOICE}

지금은 **줄거리**만 짓는다. 본문이 아니라 뼈대다. 정해진 장면 수만큼 장면을 나눠,
각 장면은 1~2문장으로 그 장면에서 무슨 일이 일어나는지만 적는다.

장면 수가 몇이든 전체 흐름은 '시작 → 사건 → 위기 → 해결'(기승전결)을 이루게 배열한다.
각 장면은 하나의 그림으로 그릴 수 있는 뚜렷한 한 장면이어야 한다(한 장면에 여러 사건을
욱여넣지 않는다).

출력은 아래 마커 형식만. 앞뒤에 다른 말을 붙이지 않는다. @@SCENE@@ 번호는 1부터
차례로, 정해진 장면 수만큼 낸다.

@@TITLE@@ 제목
@@SUMMARY@@ 한 문장 요약
@@SCENE@@ 1
@@TEXT@@ ...
@@SCENE@@ 2
@@TEXT@@ ...`;

/**
 * 이야기 재료 — 만들기 화면에서 고른 것들. 콤마로 뭉치지 않고 항목별 라벨을
 * 붙여 넘겨야 클로드가 각 재료의 역할을 정확히 반영한다.
 *
 * 세 갈래가 있다:
 * · today   「오늘의 이야기」 — 아이가 실제 겪은 일(어디서·누구랑·무슨 일·기분)을
 *   따뜻한 동화로 각색한다.
 * · imagine 「상상 이야기」 — 소재·인물·사건 재료로 상상 동화를 짓는다.
 * · emotion 「감정 동화」 — 아이가 느낀 마음(화·무서움·슬픔 등)을 다루는 감정동화.
 */
export type StoryMaterial = {
  kind: "today" | "imagine" | "emotion";
  subject: string; // 상상: 소재(공룡 등)
  who: string; // 누구랑 (공통) — 칩 라벨(친구랑·동생이랑 등)
  whoName: string; // 동행의 실제 이름(선택). 있으면 그 이름을 그대로 쓴다.
  happening: string; // 무슨 일 (오늘=자유 서술, 상상=사건 칩)
  place: string; // 오늘: 어디서
  feeling: string; // 오늘: 그때 기분
  emotion: string; // 감정: 어떤 마음(화가 나요 등)
  situation: string; // 감정: 그런 마음이 든 상황
  extra: string; // 상상: 아이가 자유롭게 더한 이야기
};

/**
 * "누구랑" 한 줄을 만든다.
 *
 * 핵심: 이름을 넣었으면 그 이름을 그대로 등장인물 이름으로 쓰고, 안 넣었으면
 * 이름을 **지어내지 말고** 칩 그대로("친구", "동생")로만 부른다. 안 그러면
 * "친구 토토와..."처럼 칩 라벨에 지어낸 이름이 엉겨붙는다.
 */
function whoLine(label: string, who: string, whoName: string): string {
  if (!who) return "";
  if (whoName) {
    return `${label}: ${whoName} (실제 이름이다 — 이 이름을 그대로 등장인물 이름으로 쓴다)`;
  }
  // "친구랑"→"친구", "동생이랑"→"동생", "엄마랑"→"엄마". 조사만 떼어 지칭어로.
  const term = who.replace(/(이랑|랑|이와|와|과|하고)$/u, "");
  return `${label}: ${term} (이름을 지어내지 말고 '${term}'라고만 부른다)`;
}

function materialLines(m: StoryMaterial): string[] {
  if (m.kind === "today") {
    return [
      "아래는 아이가 오늘 실제로 겪은 일이다. 이 경험을 살려 따뜻한 동화로 각색한다.",
      "완전히 다른 이야기로 바꾸지 말고, 실제 있었던 일의 결을 지키되 아이가 주인공으로",
      "빛나게 하고, 속상한 일이면 마지막엔 마음이 풀리게 한다.",
      m.place ? `- 어디에서: ${m.place}` : "",
      whoLine("- 누구랑", m.who, m.whoName),
      m.happening ? `- 무슨 일이 있었나: ${m.happening}` : "",
      m.feeling ? `- 그때 아이 기분: ${m.feeling}` : "",
    ];
  }
  if (m.kind === "emotion") {
    return [
      m.emotion
        ? `아이가 '${m.emotion}' 마음을 느꼈다. 이 감정을 다루는 감정동화를 짓는다.`
        : "아이의 마음을 다루는 감정동화를 짓는다.",
      "감정에 이름을 붙여 주고, 몸으로 느끼는 감각(가슴이 콩닥콩닥, 얼굴이 뜨끈 등)으로",
      "표현하며, 아이가 스스로 감정을 알아차리고 다독이는 과정을 이야기로 만든다.",
      "감정 자체를 나쁘다고 하지 않는다.",
      m.situation ? `- 그런 마음이 든 때: ${m.situation}` : "",
      whoLine("- 누구랑", m.who, m.whoName),
    ];
  }
  return [
    "아래 재료를 모두 살려서 상상 이야기를 짓는다:",
    m.subject ? `- 이야기 소재: ${m.subject}` : "",
    whoLine("- 함께하는 이", m.who, m.whoName),
    m.happening ? `- 중심 사건: ${m.happening}` : "",
    m.extra ? `- 아이가 더 넣고 싶은 이야기: ${m.extra}` : "",
  ];
}

export async function generateOutline(input: {
  child: ChildProfile;
  material: StoryMaterial;
  /** 장면(쪽) 수 3~8. 없으면 기본 8장면. 줄거리를 이 개수만큼 장면으로 나눈다. */
  pageCount?: number;
  /** 특별한 날(생일·돌·졸업·동생). 있으면 그 날을 축하하는 이야기가 된다. */
  occasion?: string;
  /** 분위기(무드). 이야기 톤에 반영한다. */
  mood?: string;
}): Promise<ParsedOutline> {
  // 넘어온 쪽수를 3~8로 가둔다 — 클라이언트 값은 믿지 않는다.
  const pageCount = clampPageCount(input.pageCount);

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: OUTLINE_SYSTEM,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    messages: [
      {
        role: "user",
        content: [
          `아이: ${describeChild(input.child)}`,
          `장면 수: ${pageCount}장면 — ${pageGuide(pageCount)}`,
          ...materialLines(input.material),
          input.occasion
            ? `특별한 날: ${input.occasion} — 이 날을 축하하는 이야기로 지어라. 축하가 결말에 자연스럽게 스며들게 한다.`
            : "",
          input.mood ? `분위기: ${input.mood} — 이야기 전체 톤에 반영한다.` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });

  const outline = parseOutline(textOf(message));

  if (outline.scenes.length !== pageCount) {
    throw new Error(
      `${pageCount}장면이어야 하는데 ${outline.scenes.length}장면이 나왔습니다.`,
    );
  }

  return outline;
}

const STORY_SYSTEM = `${VOICE}

확정된 줄거리는 장면별로 나뉘어 있다. **1장면 → 1쪽**으로, 장면 하나를 한 쪽 본문으로
옮긴다. 이야기를 새로 짓거나 장면을 합치거나 나누지 말고, 장면 개수 그대로 쪽을 낸다
(@@PAGE@@ 번호가 장면 번호와 일치해야 한다). 각 장면의 줄거리에 살을 붙여 본문으로만
만든다.

@@IMG@@에는 그 쪽의 **장면만** 적는다 — 누가 어디서 무엇을 하는지. 그림체나 화면
구도는 적지 않는다. 그건 삽화를 그릴 때 따로 붙는다.

출력은 아래 마커 형식만. 앞뒤에 다른 말을 붙이지 않는다.

@@TITLE@@ 제목
@@SUMMARY@@ 한 문장 요약
@@CHARACTER@@ 이름 | 생김새와 특징
@@PAGE@@ 1
@@TEXT@@ ...
@@IMG@@ ...
@@PAGE@@ 2
...`;

export async function generateStory(input: {
  child: ChildProfile;
  outline: ParsedOutline;
  occasion?: string;
  mood?: string;
}): Promise<ParsedStory> {
  // 쪽수는 줄거리 장면 수를 그대로 따른다 — 장면 1개 = 쪽 1개.
  const pageCount = input.outline.scenes.length;

  const outlineText = input.outline.scenes
    .map((s) => `${s.sceneNo}장면: ${s.text}`)
    .join("\n");

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: STORY_SYSTEM,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    messages: [
      {
        role: "user",
        content: [
          `아이: ${describeChild(input.child)}`,
          `장면 수: ${pageCount}장면 (이 개수만큼, 장면 하나당 한 쪽씩 낸다)`,
          `쪽당 분량: ${lengthGuide(input.child.age)}`,
          ...(input.occasion
            ? [`특별한 날: ${input.occasion} — 축하가 이야기에 자연스럽게 스며들게.`]
            : []),
          ...(input.mood ? [`분위기: ${input.mood}`] : []),
          "",
          `제목: ${input.outline.title}`,
          "장면별 줄거리:",
          outlineText,
        ].join("\n"),
      },
    ],
  });

  const story = parseStory(textOf(message));

  if (story.pages.length !== pageCount) {
    throw new Error(
      `${pageCount}쪽이어야 하는데 ${story.pages.length}쪽이 나왔습니다.`,
    );
  }

  return story;
}

function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}
