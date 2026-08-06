import Anthropic from "@anthropic-ai/sdk";
import {
  parseOutline,
  parseStory,
  type ParsedOutline,
  type ParsedStory,
} from "./story-format";

const client = new Anthropic();
// 이야기 생성 모델 — 가성비 Sonnet 기본(원가 약 1/5). 품질이 필요한 순간엔
// 환경변수 ANTHROPIC_MODEL로 Opus 등으로 바꿀 수 있다.
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";

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
 * 먹힌다(하한이 없으면 6세도 50자로 내려온다).
 *
 * 중요 — 이건 아이가 직접 '읽는' 책이 아니라 성우가 '읽어주는(TTS)' 책이다. 그래서
 * 글자수 상한을 읽기 난이도에 묶을 필요가 없다. 미취학이라도 '듣기'로는 훨씬 긴
 * 문장을 이해하고 즐긴다. 문장 난이도(쉬운 단어)는 나이에 맞게 지키되, 분량은
 * 듣기 기준으로 넉넉히 준다 — 짧으면 이야기가 허전해 만든 값어치가 안 난다.
 */
function lengthGuide(age: number, longer = false): string {
  const base = ((): string => {
    if (age <= 3) {
      return "쪽당 2~3문장, 55~75자. 아주 쉬운 말과 의성어·의태어(콩콩, 반짝반짝)를 쓰고, 같은 말을 리듬처럼 반복한다. 3세는 '무엇을 했다'만 안다 — 이유나 시간 순서를 길게 설명하지 않는다.";
    }
    if (age === 4) {
      return "쪽당 3~4문장, 90~120자. 아이가 늘 쓰는 쉬운 단어만 쓰되 장면을 생생하게 그린다. 소리(와르르, 쿵쿵)와 움직임, 짧은 대사를 살린다. '그래서'로 이어지는 인과를 넣어도 좋다.";
    }
    if (age === 5) {
      return "쪽당 4~5문장, 120~150자. '~해서 ~했어요' 같은 원인과 결과를 넣는다. 5세는 '왜'를 궁금해하니 행동에 이유가 보이게 한다.";
    }
    if (age === 6) {
      return "쪽당 5~6문장, 150~180자. 감정과 이유를 함께 담고('무서웠지만 용기를 냈어요'), 앞뒤 사건이 매끄럽게 이어지게 한다. 6세는 이야기의 흐름을 따라온다.";
    }
    if (age === 7) {
      return "쪽당 6~7문장, 180~210자. 조금 긴 문장과 새로운 낱말을 섞어도 된다. 7세는 인물의 마음이 변해가는 걸 이해한다.";
    }
    return "쪽당 7~8문장, 210~250자. 문장을 여러 겹으로 엮고 조금 어려운 단어를 섞어도 된다. 8세 이상은 작은 반전과 여운을 즐긴다.";
  })();
  if (!longer) return base;
  // "넉넉하게(길게)" — 쪽수가 적어도 각 쪽을 위 기준의 약 1.5배 분량으로 채운다.
  // 문장 난이도(쉬운 단어)는 그대로 두고, 묘사·감각·짧은 대사·인물의 마음을 더 얹는다.
  return (
    base +
    " 단, 이 이야기는 '넉넉하게(길게)'로 골랐다 — 각 쪽을 위 글자수 기준의 약 1.5배로 늘려, 장면의 묘사와 소리·냄새·감촉 같은 감각, 짧은 대사, 인물의 마음을 더 풍부하게 담는다. 쪽수가 적어도 각 쪽이 허전하지 않게 충분히 채운다. 문장 난이도(쉬운 단어)는 나이에 맞게 그대로 지킨다."
  );
}

function describeChild(child: ChildProfile): string {
  const gender =
    child.gender === "girl" ? "여자아이" : child.gender === "boy" ? "남자아이" : "아이";
  // 이름 표기 강조 — 모델이 흔한 이름으로 바꿔치기하는 사고(하온→하윤)를 막는다.
  // 시스템 규칙만으론 부족해서, 쓰는 지점에서 한 번 더 못박는다.
  // 단, '이름을 바꾸지 마라'를 너무 세게 걸면 조사까지 굳어 "하온은"처럼 어색해진다.
  // 한국어 이름은 받침이 있으면 '이'를 붙여 부르는 게 자연스럽다 — 그건 같은 이름이다.
  return [
    `${child.name} (${child.age}세, ${gender}) — 주인공 이름은 "${child.name}"이다.`,
    `다른 이름이나 비슷한 이름으로 바꾸는 것은 절대 금지(예: 하온→하윤).`,
    `다만 한국어 조사는 자연스럽게 붙인다: ${josaGuide(child.name)}`,
  ].join(" ");
}

/**
 * 한국어 이름 뒤 조사 안내를 이름에 맞춰 만들어 준다.
 *
 * 받침이 있는 이름(하온·서준)은 '이'를 붙여 "하온이는/하온이가/하온아!"로 부르는 것이
 * 자연스럽고, 받침이 없는 이름(지우·서아)은 붙이지 않는다("지우는/지우가/지우야!").
 * 이걸 알려주지 않으면 "하온은 웃었어요"처럼 어른 문서 같은 문장이 나온다.
 */
function josaGuide(name: string): string {
  const last = name.trim().slice(-1);
  const code = last.charCodeAt(0);
  const isHangul = code >= 0xac00 && code <= 0xd7a3;
  const hasBatchim = isHangul && (code - 0xac00) % 28 !== 0;
  if (!isHangul) return `이름 뒤 조사는 한국어로 자연스럽게 쓴다.`;
  if (!hasBatchim) {
    return `"${name}"은 받침이 없으니 '이'를 붙이지 않는다 — ${name}는/${name}가/${name}를/${name}랑/${name}의, 부를 때는 "${name}야!".`;
  }
  // 받침 있는 이름은 '이'를 붙인 "이름이"가 기본형이고, 그 뒤에 조사가 또 붙는다.
  // 여기서 가장 흔한 사고가 주격이다 — "하온이 열쇠를 돌렸어요"는 문법상 되지만
  // 동화 문장으로는 어색하고, "하온이가 열쇠를 돌렸어요"가 맞다. 조사별로 못박는다.
  return [
    `"${name}"은 받침이 있으니 '${name}이'가 기본형이고, 그 뒤에 조사를 붙인다.`,
    `맞는 표기: ${name}이가(주어) / ${name}이는 / ${name}이를 / ${name}이한테 / ${name}이랑 / ${name}이의 / 부를 때 "${name}아!"`,
    `틀린 표기(절대 쓰지 말 것): "${name}은", "${name}는", "${name}가", "${name}를", 그리고 주어 자리에 "${name}이"만 쓰는 것.`,
    `예: (X) ${name}이 열쇠를 돌렸어요 → (O) ${name}이가 열쇠를 돌렸어요.`,
  ].join(" ");
}

const VOICE = `너는 한국 유아·아동용 그림동화 작가다. 아이가 주인공인 동화를 짓는다.

지금 쓰는 것은 **그림동화책의 본문**이다. 부모가 아이 옆에서 소리 내어 읽어 줄 글이고,
한 쪽마다 그림 한 장이 함께 놓인다. 줄거리 요약도, 시나리오도, 설명문도 아니다.
그러니 소리 내어 읽었을 때 자연스럽고 리듬이 살아야 하고, 아이가 귀로 듣고 바로
그림이 떠오르는 문장이어야 한다. 어른에게 보고하는 말투(–했다, –하였음)는 쓰지 않는다.

지켜야 할 것:
- 아이 이름은 준 그대로 쓴다 — 한 글자도 바꾸거나(하온→하윤 금지) 비슷한 이름으로 만들지 않는다.
- 다만 조사는 한국어답게 붙인다. 받침 있는 이름은 '이'를 붙인 "하온이"가 기본형이고,
  그 뒤에 조사를 또 붙인다 — 하온이가·하온이는·하온이를·하온이한테·하온이의, 부를 땐 "하온아!".
  받침 없는 이름은 그대로 "지우가·지우는·지우를·지우야!"로 쓴다.
  '이'를 붙인 건 다른 이름이 아니라 같은 이름을 자연스럽게 부르는 것이다.
  특히 **주어 자리**를 조심한다. 가장 흔한 실수가 여기다:
    (X) 하온은 웃었어요 / (X) 하온이 열쇠를 돌렸어요 / (X) 하온가 달렸어요
    (O) 하온이는 웃었어요 / (O) 하온이가 열쇠를 돌렸어요 / (O) 하온이가 달렸어요
  주어로 쓸 땐 "이름이"에서 멈추지 말고 반드시 "이름이가"까지 쓴다.
  같은 규칙을 친구·동생 등 다른 등장인물 이름에도 똑같이 적용한다.
- 결말에는 아이가 스스로 해낸 것이 남는다. 어른이 대신 해결해주지 않는다.
  단, '실제 결말'이 재료로 주어지면 그 사실이 우선이다 — 실제로 일어난 일(혼남 등)을
  지우거나 미화하지 않고 그대로 담은 뒤, 그 안에서 아이가 배우고 회복하게 한다.
- 교훈은 설교하지 않는다(어른이 "이럴 땐 이렇게 해야 해" 하고 가르치지 않는다).
  대신 마지막 쪽에서 아이가 '배운 것'이 한 문장으로 또렷이 남게 한다 —
  아이 스스로 깨달아 말하는 형태가 가장 좋다. 그 문장은 이 아이가 이번에 실제로
  해낸 행동에서 나와야 한다(이 지침에 적힌 문장을 그대로 가져다 쓰지 않는다).
- 성별로 소재를 가르지 않는다. 주제는 아이가 고른 그대로 쓴다.
- 주제가 감정(화남·무서움·슬픔·질투·부끄러움 등)이면 감정동화로 짓는다:
  감정에 이름을 붙여주고, 몸으로 느끼는 감각(가슴이 콩닥콩닥, 얼굴이 뜨끈)으로
  표현한다. 감정 자체를 나쁘다고 하지 않는다.
  감정동화는 밋밋하게 흐르지 않게 반드시 굴곡을 준다:
  ① 감정을 행동으로 한 번 충분히 터뜨린다(발을 쿵쿵 구름, 확 밀쳐버림, 엉엉 욺).
  ② 가장 힘든 '바닥'을 지난다(혼자 주저앉음, 눈물이 핑, 상황이 더 엉망이 됨).
     이 바닥이 있어야 뒤의 반전이 진짜 위로가 된다 — 바로 해결로 넘어가지 않는다.
  ③ 아이가 스스로 마음을 가라앉히고, 스스로 방법을 '깨달아' 해결한다.
     어른이 해결책을 알려주지 않는다 — 깨달음은 아이 머리에서 나오고, 그래서 뿌듯하다.
     가라앉히는 방법은 아래 목록에서 이 아이·이 상황에 가장 어울리는 것을 하나 고른다.
     목록의 앞쪽을 습관적으로 고르지 말고, 재료(감정·상황·나이)에 정말 맞는 것을 고른다.
     특히 '심호흡'과 '마음을 말로 꺼내기'는 이미 흔하게 쓰였으니, 다른 방법이 조금이라도
     어울리면 그쪽을 고른다 — 같은 집에서 여러 편을 만들어도 해결법이 겹치면 안 된다:
     그림이나 낙서로 마음 꺼내기 / 인형·강아지에게 털어놓기 / 몸으로 털어내기(달리기·베개 두드리기) /
     잠깐 조용한 자리로 피해 있기 / 좋아하는 노래를 부르기 / 물 마시고 세수하기 /
     천천히 열까지 세기 / 방법을 바꿔 다시 해보기 / 상대 마음을 상상해 보기 /
     마음을 말로 꺼내기 / 심호흡.
- 배경과 소품은 재료에서 나온 것을 쓴다. 재료에 없는 장면을 습관처럼 끌어오지 않는다
  (특히 '블록 성 쌓기'처럼 매번 반복되는 소재는 피하고, 아이가 실제로 말한 것에서 만든다).`;

const OUTLINE_SYSTEM = `${VOICE}

지금은 **줄거리**만 짓는다. 본문이 아니라 뼈대다. 정해진 장면 수만큼 장면을 나눠,
각 장면은 1~2문장으로 그 장면에서 무슨 일이 일어나는지만 적는다.

말투는 딱딱한 요약체("~한다", "~된다")를 쓰지 말고, 부모가 읽어 편한 부드러운
동화 말투("~해요", "~했어요")로 적는다. 뼈대라도 문장은 다정하게 들리게 한다.

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
  ending: string; // 오늘: 일이 어떻게 끝났나(잘 해결·혼남·아직 속상 등) — 각색 정확도의 핵심
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
      m.ending
        ? `- 실제 결말(반드시 지킬 사실): "${m.ending}". 이 일은 이야기 안에서 실제로 일어나야 한다 — 지우거나 다른 결말로 미화하면 안 된다. 그 사실을 담은 뒤에, 마지막 쪽에서 아이가 배우거나 마음이 다독여지게 마무리한다.`
        : "",
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

/**
 * 이름 가드 — 생성 결과에 주인공 이름이 정확히 들어있는지. 모델이 흔한 이름으로
 * 바꿔치기하는 사고(하온→하윤)를 프롬프트로 막아도 확률적으로 재발할 수 있어,
 * 서버가 최종 검사하고 틀리면 한 번 다시 짓는다. (아이 이름은 이 앱의 핵심 가치)
 */
function nameOk(name: string, text: string): boolean {
  return text.includes(name);
}

/**
 * '이름' 칸에 들어와도 이름이 아닌 말들. 부모가 "누구랑"의 이름 칸에 "동생"처럼
 * 적는 일이 있어서, 조사 교정이 이런 낱말을 망가뜨리지 않도록 막아 둔다.
 */
const COMMON_NOUNS = new Set([
  "동생", "형", "누나", "언니", "오빠", "친구", "엄마", "아빠",
  "할머니", "할아버지", "선생님", "이모", "삼촌", "고모", "사촌",
]);

/**
 * 이름 뒤 조사 교정 — 프롬프트로 막아도 확률적으로 새는 것을 마지막에 손본다.
 *
 * 받침 있는 이름은 '이'를 붙인 "하온이"가 기본형인데, 모델이 종종 이걸 빠뜨려
 * "하온은 웃었어요"(딱딱함)나 "하온가 달렸어요"(비문)를 낸다. 부모가 읽어 주는
 * 글이라 이런 문장 하나가 바로 티가 나서, 명백히 틀린 형태만 골라 고친다.
 *
 * 손대지 않는 것: "하온이 열쇠를 …". 주어일 수도("하온이가"의 누락) 소유일 수도
 * ("하온이의 열쇠") 있어 기계가 판단할 수 없다. 그건 프롬프트에 맡긴다.
 */
export function fixNameJosa(name: string, text: string): string {
  const trimmed = name.trim();
  if (!trimmed || !text) return text;
  // 보통명사에는 이 규칙이 통하지 않는다 — "동생은 웃었어요"는 맞는 말인데
  // "동생이는"으로 바꿔버리면 오히려 틀린다. 사람 이름일 때만 손댄다.
  if (COMMON_NOUNS.has(trimmed)) return text;
  const last = trimmed.slice(-1);
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return text; // 한글 이름만
  if ((code - 0xac00) % 28 === 0) return text; // 받침 없는 이름은 '이'를 붙이지 않는다

  const esc = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // 조사 뒤에 한글이 이어지면 다른 낱말일 수 있으니 건드리지 않는다.
  const rules: [RegExp, string][] = [
    [new RegExp(`${esc}은(?![가-힣])`, "g"), `${trimmed}이는`], // 딱딱함
    [new RegExp(`${esc}는(?![가-힣])`, "g"), `${trimmed}이는`], // 비문
    [new RegExp(`${esc}가(?![가-힣])`, "g"), `${trimmed}이가`], // 비문
    [new RegExp(`${esc}를(?![가-힣])`, "g"), `${trimmed}이를`], // 비문
    [new RegExp(`${esc}야(?![가-힣])`, "g"), `${trimmed}아`], // 부를 때
  ];
  return rules.reduce((out, [re, to]) => out.replace(re, to), text);
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

  // 이름 가드 — 최대 2회. 1회차에 이름이 틀리면 경고를 덧붙여 한 번만 다시 짓는다.
  let outline: ParsedOutline | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
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
            attempt > 1
              ? `경고: 직전 생성에서 주인공 이름 표기가 틀렸다. 이름은 "${input.child.name}"이다 — 비슷한 다른 이름 절대 금지. (조사는 자연스럽게: ${josaGuide(input.child.name)})`
              : "",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    });

    outline = parseOutline(textOf(message));

    if (outline.scenes.length !== pageCount) {
      throw new Error(
        `${pageCount}장면이어야 하는데 ${outline.scenes.length}장면이 나왔습니다.`,
      );
    }

    const joined = outline.title + " " + outline.scenes.map((s) => s.text).join(" ");
    if (nameOk(input.child.name, joined)) break;
    if (attempt === 2) {
      // 두 번 다 틀리면 그대로 내보내되 로그를 남긴다 — 부모가 줄거리에서 보고 다시 지을 수 있다.
      console.warn(`[outline] 이름 불일치 2회: "${input.child.name}"`);
    }
  }

  // 부모가 줄거리를 먼저 보고 고르므로, 여기서부터 조사가 맞아야 한다.
  const names = [input.child.name, input.material.whoName].filter(Boolean);
  const fix = (t: string) => names.reduce((s, n) => fixNameJosa(n, s), t);
  return {
    ...outline!,
    title: fix(outline!.title),
    scenes: outline!.scenes.map((s) => ({ ...s, text: fix(s.text) })),
  };
}

const STORY_SYSTEM = `${VOICE}

확정된 줄거리는 장면별로 나뉘어 있다. **1장면 → 1쪽**으로, 장면 하나를 한 쪽 본문으로
옮긴다. 이야기를 새로 짓거나 장면을 합치거나 나누지 말고, 장면 개수 그대로 쪽을 낸다
(@@PAGE@@ 번호가 장면 번호와 일치해야 한다). 각 장면의 줄거리에 살을 붙여 본문으로만
만든다.

@@TEXT@@에 쓰는 것이 **아이가 실제로 보게 될 동화책 한 쪽의 글**이다. 부모가 그 자리에서
소리 내어 읽어 준다. 쓰고 나면 반드시 소리 내어 읽어 보듯 확인한다 — 읽다가 걸리는 곳,
숨이 안 쉬어지는 긴 문장, 조사가 어색한 곳이 있으면 고쳐서 낸다.
특히 이름 뒤 조사를 매 쪽 확인한다: 주어 자리는 "하온이는/하온이가"이지 "하온은"이나
"하온이"가 아니다. 이 실수가 가장 자주 나오니 쪽마다 눈으로 짚는다.

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
  /** 넉넉하게(길게) — 쪽수가 적어도 각 쪽 분량을 늘려 이야기를 더 풍부하게. */
  longer?: boolean;
}): Promise<ParsedStory> {
  // 쪽수는 줄거리 장면 수를 그대로 따른다 — 장면 1개 = 쪽 1개.
  const pageCount = input.outline.scenes.length;

  const outlineText = input.outline.scenes
    .map((s) => `${s.sceneNo}장면: ${s.text}`)
    .join("\n");

  // 이름 가드 — 줄거리와 같은 방식. 본문에서 이름이 틀리면 한 번 다시 짓는다.
  let story: ParsedStory | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: STORY_SYSTEM,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      messages: [
        {
          role: "user",
          content: [
            `아이: ${describeChild(input.child)}`,
            `장면 수: ${pageCount}장면 (이 개수만큼, 장면 하나당 한 쪽씩 낸다)`,
            `쪽당 분량: ${lengthGuide(input.child.age, input.longer)}`,
            ...(input.occasion
              ? [`특별한 날: ${input.occasion} — 축하가 이야기에 자연스럽게 스며들게.`]
              : []),
            ...(input.mood ? [`분위기: ${input.mood}`] : []),
            ...(attempt > 1
              ? [
                  `경고: 직전 생성에서 주인공 이름 표기가 틀렸다. 이름은 "${input.child.name}"이다 — 비슷한 다른 이름 절대 금지. (조사는 자연스럽게: ${josaGuide(input.child.name)})`,
                ]
              : []),
            "",
            `제목: ${input.outline.title}`,
            "장면별 줄거리:",
            outlineText,
          ].join("\n"),
        },
      ],
    });

    story = parseStory(textOf(message));

    if (story.pages.length !== pageCount) {
      throw new Error(
        `${pageCount}쪽이어야 하는데 ${story.pages.length}쪽이 나왔습니다.`,
      );
    }

    const joined = story.title + " " + story.pages.map((p) => p.text).join(" ");
    if (nameOk(input.child.name, joined)) break;
    if (attempt === 2) {
      console.warn(`[story] 이름 불일치 2회: "${input.child.name}"`);
    }
  }

  // 아이가 보게 될 최종 본문이라 여기서 한 번 더 조사를 맞춘다.
  // 등장인물 이름은 손대지 않는다 — 모델이 "동생"처럼 보통명사를 인물 이름으로
  // 넣는 일이 있어, 확실히 사람 이름인 주인공만 고친다.
  const fix = (t: string) => fixNameJosa(input.child.name, t);
  return {
    ...story!,
    title: fix(story!.title),
    pages: story!.pages.map((p) => ({ ...p, text: fix(p.text) })),
  };
}

function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}
