import Anthropic from "@anthropic-ai/sdk";
import {
  ACTS,
  parseOutline,
  parseStory,
  type ParsedOutline,
  type ParsedStory,
} from "./story-format";

const client = new Anthropic();
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

/** 기승전결 4막 × 2쪽. 8이 아니면 막당 쪽수가 안 떨어진다. */
export const PAGE_COUNT = 8;

export type Gender = "girl" | "boy" | "unspecified";

export type ChildProfile = {
  name: string;
  age: number;
  gender: Gender;
};

/**
 * 나이는 쪽수가 아니라 쪽당 글자수로 반영한다.
 *
 * 권당 원가의 80%가 삽화(쪽당 ₩55)라, 쪽수를 건드리면 원가가 흔들리고 가격표가
 * 나이마다 갈린다. 글자수는 TTS만 건드리는데 그건 권당 ₩55라 두 배가 돼도 무시할
 * 수준이다. 비싼 축을 고정하고 싼 축을 변수로 둔다.
 */
/**
 * 숫자는 실측으로 잡았다.
 *
 * "65자 안팎" 같은 표현은 덜 먹혀서 6세에 평균 50자가 나왔다 — 하한을 명시하니
 * 63자로 들어왔다. 반대로 미취학 구간은 처음에 35~50자로 잡았다가 29자가 나왔는데,
 * 읽어보니 그 나이 그림책은 원래 그 정도다(그림이 말하고 글은 거든다). 목표가 틀린
 * 것이라 실측에 맞췄다.
 */
function lengthGuide(age: number): string {
  if (age <= 5) {
    return "쪽당 1~2문장, 30~45자. 아이가 아는 쉬운 단어만 쓴다.";
  }
  if (age <= 7) {
    return "쪽당 2~3문장, 60~75자. 50자 아래로 내려가면 너무 심심하다.";
  }
  return "쪽당 3~4문장, 80~100자. 70자 아래로 내려가지 않는다. 조금 어려운 단어를 섞어도 된다.";
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

지금은 **줄거리**만 짓는다. 본문이 아니라 뼈대다. 각 막은 1~2문장으로, 무슨 일이
일어나는지만 적는다.

출력은 아래 마커 형식만. 앞뒤에 다른 말을 붙이지 않는다.

@@TITLE@@ 제목
@@SUMMARY@@ 한 문장 요약
@@ACT@@ 기
@@TEXT@@ ...
@@ACT@@ 승
@@TEXT@@ ...
@@ACT@@ 전
@@TEXT@@ ...
@@ACT@@ 결
@@TEXT@@ ...`;

export async function generateOutline(input: {
  child: ChildProfile;
  theme: string;
  /** 특별한 날(생일·돌·졸업·동생). 있으면 그 날을 축하하는 이야기가 된다. */
  occasion?: string;
  /** 분위기(무드). 이야기 톤에 반영한다. */
  mood?: string;
}): Promise<ParsedOutline> {
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
          `주제: ${input.theme}`,
          ...(input.occasion
            ? [
                `특별한 날: ${input.occasion} — 이 날을 축하하는 이야기로 지어라. 축하가 결말에 자연스럽게 스며들게 한다.`,
              ]
            : []),
          ...(input.mood ? [`분위기: ${input.mood} — 이야기 전체 톤에 반영한다.`] : []),
        ].join("\n"),
      },
    ],
  });

  return parseOutline(textOf(message));
}

const STORY_SYSTEM = `${VOICE}

확정된 줄거리를 ${PAGE_COUNT}쪽 본문으로 옮긴다. 이야기를 새로 짓지 말고, 주어진
기승전결을 그대로 따른다. **각 막을 2쪽씩** 나눈다 (기 1-2, 승 3-4, 전 5-6, 결 7-8).

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
  const outlineText = input.outline.acts
    .map((a) => `[${a.act}] ${a.text}`)
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
          `분량: ${lengthGuide(input.child.age)}`,
          ...(input.occasion
            ? [`특별한 날: ${input.occasion} — 축하가 이야기에 자연스럽게 스며들게.`]
            : []),
          ...(input.mood ? [`분위기: ${input.mood}`] : []),
          "",
          `제목: ${input.outline.title}`,
          "줄거리:",
          outlineText,
        ].join("\n"),
      },
    ],
  });

  const story = parseStory(textOf(message));

  if (story.pages.length !== PAGE_COUNT) {
    throw new Error(
      `${PAGE_COUNT}쪽이어야 하는데 ${story.pages.length}쪽이 나왔습니다.`,
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

export { ACTS };
