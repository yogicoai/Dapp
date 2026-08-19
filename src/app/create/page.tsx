"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BookViewer } from "@/components/BookViewer";
import { useTheme } from "@/components/ThemeProvider";
import { VoiceInput } from "@/components/VoiceInput";
import { ART_STYLES } from "@/lib/art-styles";
import { loadSession, spendTokens } from "@/lib/auth";
import {
  loadChild,
  loadChildRemote,
  AGES,
  AGE_OVER,
  countMyBooks,
  looksToPrompt,
  saveChild,
  saveMyBook,
} from "@/lib/prefs";
import { rewriteScene, suggestLocationDetail } from "@/lib/scene-edit";
import {
  illustrationTokenCost,
  MAX_BOOKS_PER_USER,
  scriptTokenCost,
} from "@/lib/tokens";
import { useEscClose } from "@/lib/use-esc-close";
import type { Book, NarrationStyle, VoiceDirection } from "@/lib/types";
import { fetchTypecastVoiceAudio, findTypecast, prewarmBookAudio, TYPECAST_VOICES } from "@/lib/voices";
import { loadParentVoices, PARENT_VOICE_TEST_TEXT, type ParentVoice } from "@/lib/parent-voice";

type Gender = "girl" | "boy" | "unspecified";
type Scene = { sceneNo: number; text: string };
type Outline = { title: string; summary: string; scenes: Scene[] };
type StoryPage = { pageNo: number; text: string; imagePrompt: string; voiceDirection: VoiceDirection };
type Character = { name: string; description: string };
type Story = { title: string; summary: string; characters: Character[]; pages: StoryPage[] };
type StoryMode = "today" | "imagine" | "emotion" | "direct";

type Step = "child" | "theme" | "style" | "outline" | "story" | "illustrate" | "done";

/**
 * 삽화(Gemini) 생성 스위치. 켜면 이야기 완성 후 "그림까지 그리기 🎨" 버튼이 뜨고,
 * 누를 때만 Gemini 삽화(장당 약 ₩55)를 그린다. 켠다고 자동 과금되진 않는다.
 */
const IMAGES_ENABLED = true;

const GENDERS: { value: Gender; label: string; icon: string }[] = [
  { value: "girl", label: "여자", icon: "/icons/gender-girl.webp" },
  { value: "boy", label: "남자", icon: "/icons/gender-boy.webp" },
];

/**
 * 주제 네 갈래 — 글 못 읽는 아이도 고르도록 "그림 카드 → 세부 칩" 2단계로 보여준다.
 * 카드(힉스필드 스티커)를 누르면 그 갈래의 칩이 펼쳐진다. 칩에는 이모지를 붙여
 * 미취학 아이에게 시각 단서를 준다.
 *
 * 재미·동화나라는 아이가 고르고, 습관은 부모가 고른다.
 * 습관 주제가 부모가 지갑을 여는 이유라 재미 못지않게 중요하다.
 * 감정(마음)은 여기 두지 않는다 — 별도 「감정 동화」 모드로 뺐다(중복 제거).
 */
const THEME_GROUPS = [
  {
    label: "신나는 이야기",
    icon: "/icons/topic-fun.webp",
    // 입력창 예시 — "OO"는 아이 이름으로 바뀐다. 갈래를 고르면 예시도 따라 바뀌어
    // "이런 걸 적으면 되는구나"를 보여준다 (칩만 눌러도 되고 직접 적어도 된다).
    example: "예: OO가 아기 공룡을 만나 함께 모험을 떠나요",
    items: [
      { t: "공룡", e: "🦖" },
      { t: "우주", e: "🚀" },
      { t: "바다", e: "🐳" },
      { t: "동물 친구", e: "🐰" },
      { t: "마법", e: "✨" },
      { t: "숲속 모험", e: "🌲" },
    ],
  },
  {
    label: "동화나라 이야기",
    icon: "/icons/topic-fairytale.webp",
    example: "예: OO가 마법 나라의 공주님이 되어 무도회에 가요",
    items: [
      { t: "공주님 이야기", e: "👑" },
      { t: "왕자님 이야기", e: "🤴" },
      { t: "이솝우화처럼", e: "🦊" },
      { t: "일상 이야기", e: "🏠" },
    ],
  },
  {
    label: "좋은 습관 이야기",
    icon: "/icons/topic-habits.webp",
    example: "예: 양치질을 싫어하는 OO가 치카치카 용사가 돼요",
    items: [
      { t: "밥 잘 먹기", e: "🍚" },
      { t: "잠자기", e: "🌙" },
      { t: "양치질", e: "🪥" },
      { t: "배변 훈련", e: "🚽" },
      { t: "친구와 나누기", e: "🤝" },
      { t: "심부름", e: "🏃" },
    ],
  },
];

/**
 * 이야기 재료 — "오늘 있었던 일을 적으세요"는 백지 공포를 준다. 대신 재료를
 * 칩으로 골라 담으면 클로드가 기승전결로 엮는다. 갈래와 무관하게 어디에나
 * 어울리는 범용 재료라 조건 분기 없이 모든 주제에 얹는다. 안 골라도 된다.
 */
const WHO_OPTIONS = [
  { t: "혼자서", e: "🧒" },
  { t: "친구랑", e: "👫" },
  { t: "친구들이랑", e: "🧑‍🤝‍🧑", icon: "/icons/who-friends.webp" },
  { t: "엄마랑", e: "👩" },
  { t: "아빠랑", e: "👨" },
  { t: "엄마 아빠랑", e: "👨‍👩‍👧" },
  { t: "할머니랑", e: "👵" },
  { t: "할아버지랑", e: "👴" },
  { t: "동물 친구랑", e: "🐶" },
];
const HAPPENING_OPTIONS = [
  { t: "신나는 모험을 떠나요", e: "🗺️" },
  { t: "무언가를 찾으러 가요", e: "🔍" },
  { t: "새 친구를 만나요", e: "🤗" },
  { t: "어려움을 이겨내요", e: "💪" },
  { t: "실수하고 뉘우쳐요", e: "🌱" },
  { t: "소중한 걸 배워요", e: "🎁" },
];

/**
 * 「오늘의 이야기」 — 아이가 실제 겪은 일을 유도 질문으로 받는다.
 * "오늘 있었던 일 적으세요"의 백지 공포를 없애려 어디·누구·기분은 칩으로,
 * "무슨 일"만 자유롭게 적게 한다.
 */
const TODAY_PLACES = [
  { t: "유치원", e: "🏫" },
  { t: "어린이집", e: "🧸" },
  { t: "놀이터", e: "🎠" },
  { t: "집", e: "🏠" },
  { t: "할머니 댁", e: "👵" },
  { t: "마트", e: "🛒" },
  { t: "병원", e: "🏥" },
  { t: "동물원", e: "🦁" },
  { t: "바깥 나들이", e: "🌳" },
];
const TODAY_WHO = [
  { t: "친구랑", e: "👫" },
  { t: "친구들이랑", e: "🧑‍🤝‍🧑", icon: "/icons/who-friends.webp" },
  { t: "선생님이랑", e: "👩‍🏫" },
  { t: "엄마랑", e: "👩" },
  { t: "아빠랑", e: "👨" },
  { t: "엄마 아빠랑", e: "👨‍👩‍👧" },
  { t: "할머니랑", e: "👵" },
  { t: "할아버지랑", e: "👴" },
  { t: "혼자서", e: "🧒" },
];

/**
 * 형제 호칭은 '말하는 아이'의 성별로 정해진다 — 여자아이는 오빠·언니,
 * 남자아이는 형·누나. 아이 성별을 이미 받아 두었으니 묻지 않고 맞는 말만 보여준다.
 * ("형/오빠" 같은 병기는 어른의 사정이고, 아이는 자기 말이 그대로 나와야 자기 이야기가 된다.)
 * 동생도 남/여로 나눈다 — 그래야 이야기의 호칭도, 삽화 속 아기 모습도 맞는다.
 */
function siblingOptions(gender: Gender): { t: string; e: string }[] {
  return [
    { t: gender === "boy" ? "형이랑" : "오빠랑", e: "👦" },
    { t: gender === "boy" ? "누나랑" : "언니랑", e: "👧" },
    { t: "남동생이랑", e: "👶" },
    { t: "여동생이랑", e: "👶" },
  ];
}

/** 성별을 바꾸면 이미 고른 손위 형제 호칭도 새 성별에 맞게 바꿔 준다. */
const SIBLING_SWAP: Record<string, { boy: string; girl: string }> = {
  형이랑: { boy: "형이랑", girl: "오빠랑" },
  오빠랑: { boy: "형이랑", girl: "오빠랑" },
  누나랑: { boy: "누나랑", girl: "언니랑" },
  언니랑: { boy: "누나랑", girl: "언니랑" },
};
const FEELINGS = [
  { t: "신났어요", e: "😄" },
  { t: "속상했어요", e: "😢" },
  { t: "무서웠어요", e: "😨" },
  { t: "뿌듯했어요", e: "😊" },
  { t: "화났어요", e: "😠" },
  { t: "긴장했어요", e: "😬" },
  { t: "서운했어요", e: "🙁" },
];

/**
 * 「오늘의 이야기」 — 일이 어떻게 끝났는지. 이게 없으면 AI가 결말을 지어내서
 * 실제와 다른 각색이 나온다(예: 혼난 일을 칭찬으로 끝냄). 각색 정확도의 핵심 재료.
 */
const TODAY_ENDINGS = [
  { t: "잘 해결됐어요", e: "😊" },
  { t: "칭찬받았어요", e: "🌟" },
  { t: "혼났어요", e: "😅" },
  { t: "아직 속상해요", e: "😢" },
];

/**
 * 「감정 동화」 — 그런 마음이 든 흔한 상황 칩. 자유입력의 백지 공포를 없애고,
 * 상황이 구체적일수록 감정동화의 위로가 정확해진다. 누르면 입력칸에 채워져 고칠 수 있다.
 */
const EMOTION_TIMES = [
  { t: "엄마 아빠가 꼭 안아줬을 때", e: "🤗" },
  { t: "좋아하는 친구와 함께 놀 때", e: "💞" },
  { t: "귀여운 동물 친구를 만났을 때", e: "🐶" },
  { t: "동생이 장난감을 뺏었을 때", e: "🧸" },
  { t: "친구가 같이 안 놀아줘서", e: "😞" },
  { t: "엄마 아빠한테 혼나서", e: "😢" },
  { t: "깜깜한 밤이 무서워서", e: "🌙" },
  { t: "유치원에 처음 가는 날", e: "🏫" },
  { t: "동생만 예뻐하는 것 같아서", e: "👶" },
  { t: "잘하고 싶은데 잘 안 돼서", e: "💦" },
];

/**
 * 「감정 동화」용 — 아이가 느낀 마음. 감정에 이름을 붙여 다루는 감정동화가 된다.
 * 아이가 말로 표현하기 어려워하는 마음일수록 이야기로 다뤄줄 값어치가 크다 —
 * 그래서 화·무서움뿐 아니라 외로움·걱정·서운함·질투처럼 이름 붙이기 힘든 마음까지
 * 폭넓게 담았다. 긍정 감정(뿌듯·설렘)도 몇 개 둬서 "좋은 마음"도 이야기가 되게 한다.
 */
const EMOTIONS = [
  { t: "좋아해요", e: "❤️" },
  { t: "화가 나요", e: "😠" },
  { t: "무서워요", e: "😨" },
  { t: "슬퍼요", e: "😢" },
  { t: "샘이 나요", e: "😾" },
  { t: "부끄러워요", e: "😳" },
  { t: "속상해요", e: "😔" },
  { t: "외로워요", e: "🥺" },
  { t: "걱정돼요", e: "😟" },
  { t: "답답해요", e: "😤" },
  { t: "서운해요", e: "🙁" },
  { t: "미안해요", e: "😞" },
  { t: "뿌듯해요", e: "😊" },
  { t: "설레요", e: "🤗" },
  { t: "심심해요", e: "😑" },
];

/** 사용자에게 별도로 묻지 않고 이야기 재료에서 글의 톤과 삽화 조명을 정한다. */
function deriveAutomaticMood(input: {
  storyMode: StoryMode | null;
  emotion: string;
  theme: string;
  happening: string;
  todayEvent: string;
  feeling: string;
  directStory: string;
}): { ko: string; en: string } {
  const clues = `${input.emotion} ${input.theme} ${input.happening} ${input.todayEvent} ${input.feeling} ${input.directStory}`;
  if (/(무서|걱정|슬퍼|외로|속상|서운|미안|샘이|답답|화가)/.test(clues)) {
    return {
      ko: "아이의 감정을 차분히 인정하고 마지막에는 따뜻하고 안심되는",
      en: "calm gentle reassuring atmosphere, softly warm and safe ending",
    };
  }
  if (/(좋아해요|뿌듯|설레|칭찬|친구|가족|안아)/.test(clues)) {
    return { ko: "따뜻하고 밝으며 다정한", en: "warm bright affectionate atmosphere, soft joyful light" };
  }
  if (/(마법|공주|왕자|별|꿈)/.test(clues)) {
    return { ko: "따뜻하고 신비로운", en: "warm dreamy magical atmosphere, gentle sparkling light" };
  }
  if (/(공룡|우주|바다|모험|찾으러|용감)/.test(clues)) {
    return { ko: "신나고 용감하지만 아이에게 안전한", en: "bright adventurous energetic atmosphere, wholesome and child-safe" };
  }
  if (/(잠자기|밤|조용|휴식)/.test(clues)) {
    return { ko: "조용하고 포근한", en: "calm cozy bedtime atmosphere, soft low-contrast lighting" };
  }
  return input.storyMode === "today"
    ? { ko: "자연스럽고 따뜻한 일상의", en: "natural warm everyday atmosphere, soft realistic picture-book light" }
    : { ko: "따뜻하고 포근한", en: "warm cozy soft lighting" };
}

function locationKeyFromImagePrompt(prompt: string): string {
  const match = /장소\s*:\s*([^\n—.-]+?)\s*[—-]/.exec(prompt);
  return match?.[1].replace(/\s+/g, "").normalize("NFC") ?? "";
}

/** 장면(쪽) 수 선택지 3~8. 삽화를 켜면 쪽수가 곧 그림 장수(=크레딧)라 8이 상한. */
const PAGE_OPTIONS = [3, 4, 5, 6, 7, 8];

/**
 * 나이에 맞는 장면 수를 추천한다 — 어린 아이는 짧게, 큰 아이는 넉넉히.
 * 강제는 아니고 별표(추천)로만 표시한다.
 */
function recommendedPages(age: number | null): number {
  if (age === null) return 6;
  // 1~2세는 이야기를 따라가기보다 그림을 보는 나이라 짧게 시작한다.
  if (age <= 2) return 3;
  if (age <= 4) return 4;
  if (age <= 6) return 6;
  return 8;
}

/** 조사를 떼어 지칭어를 만든다 — "친구랑"→"친구", "동생이랑"→"동생". */
function companionTerm(who: string): string {
  return who.replace(/(이랑|랑|이와|와|과|하고)$/u, "");
}

/**
 * 호칭만으로 성별을 알 수 있는 동행 — 이 사람들에겐 성별을 묻지 않는다.
 * 엄마·아빠·할머니·형·언니·남동생 …은 이미 답이 나와 있고,
 * 동물 친구에게 "여자아이/남자아이"를 묻는 건 말이 안 된다.
 * 남는 건 친구·선생님 — 이름만으로는 알 수 없어 모델이 짐작하다 틀리는 자리다.
 */
const GENDER_KNOWN = new Set([
  "혼자서", "엄마", "아빠", "엄마 아빠", "할머니", "할아버지",
  "형", "오빠", "누나", "언니", "남동생", "여동생", "동물 친구",
]);

/**
 * 동행 이름·성별 입력 — "친구랑" 같은 사람 동행을 골랐을 때만 뜬다.
 *
 * 이름: 넣으면 그 이름을 그대로 쓰고, 비우면 "친구"처럼 지칭어로만 부른다
 * ("친구토토" 엉킴 방지). "혼자서"엔 뜨지 않는다.
 *
 * 성별: 호칭으로 알 수 없는 동행(친구·선생님)에만 묻는다. 안 물으면 모델이
 * 이름으로 짐작해 남자 친구가 여자아이로 그려진다 — 실제 친구가 주인공 옆에
 * 서는 책이라 아이가 바로 알아본다.
 */
/** 여자/남자 고르는 작은 칩 한 쌍. 같은 걸 다시 누르면 해제된다(안 고르면 모델이 정한다). */
function GenderChips({
  value,
  onChange,
  accent,
}: {
  value: string;
  onChange: (v: string) => void;
  accent: string;
}) {
  return (
    <>
      {["여자", "남자"].map((g) => {
        const on = value === g;
        return (
          <button
            key={g}
            type="button"
            onClick={() => onChange(on ? "" : g)}
            aria-pressed={on}
            style={on ? { background: accent } : undefined}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold transition ${
              on ? "text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            {g === "여자" ? "👧 여자" : "👦 남자"}
          </button>
        );
      })}
    </>
  );
}

export type FriendEntry = { name: string; gender: string };

/*
 * 임시저장 형식이 바뀌면 이 숫자를 올린다 — 옛 임시저장은 버려진다.
 *
 * 2 → 3: 값을 대본과 그림 두 번에 나눠 받게 바꿨다. 옛 임시저장에는 '대본 값을
 * 냈는지'가 없어서, 그대로 이어 만들면 그림 값만 내고 책이 나온다. TTL이 10분이라
 * 걸리는 사람도 거의 없지만, 값이 걸린 일이니 버리는 쪽이 맞다.
 */
const CREATE_DRAFT_VERSION = 3;
/*
 * 임시저장이 살아 있는 시간 — 값을 냈느냐로 갈린다.
 *
 * 재료만 고르다 만 것은 10분이면 된다. 어제 채우다 만 화면이 오늘 되살아나면
 * 오히려 당황스럽다.
 *
 * 그런데 대본이 나온 뒤는 다르다. 그때는 이미 대본 값을 냈다. 아이가 부르거나
 * 전화가 와서 자리를 비운 사이에 지워 버리면, 낸 토큰과 대본이 같이 사라진다.
 * 예전엔 마지막에 한 번에 받아서 날아가도 손해가 없었지만 이제는 아니다.
 * 그래서 값을 낸 임시저장은 이레 동안 지키고, 부모가 돌아와 이어서 만들게 한다.
 */
const CREATE_DRAFT_TTL_MS = 10 * 60 * 1000;
const PAID_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CREATE_DRAFT_KEY = "voice-storybook:create-draft";

type CreateDraft = {
  version: number;
  savedAt: number;
  step: "child" | "theme" | "style" | "outline" | "story";
  name: string;
  age: number | null;
  gender: Gender;
  theme: string;
  themeGroup: string | null;
  storyMode: StoryMode | null;
  who: string;
  whoName: string;
  whoGender: string;
  friends: FriendEntry[];
  happening: string;
  extra: string;
  place: string;
  todayEvent: string;
  feeling: string;
  ending: string;
  emotion: string;
  situation: string;
  artStyle: string;
  screenShape: "tablet" | "phone";
  narratorVoice: string;
  narrationStyle?: NarrationStyle;
  longerStory: boolean;
  pageCount: number;
  outline: Outline | null;
  story: Story | null;
  directMode: "guided" | "full";
  directOpening: string;
  directDevelopment: string;
  directCrisis: string;
  directEnding: string;
  directText: string;
  /** 지금까지 이야기를 다시 지은 횟수 — 새로고침해도 이어지게 임시저장에 함께 담는다. */
  outlineRetries?: number;
  /** 대본 값(글 값)을 이미 받았는지 — 새로고침해도 두 번 받지 않게. */
  scriptCharged?: boolean;
  storyRewrites?: number;
  locationDetail?: string;
};

function createDraftKey(owner: string): string {
  return `${CREATE_DRAFT_KEY}:${owner}`;
}

function loadCreateDraft(owner: string): CreateDraft | null {
  if (typeof window === "undefined") return null;
  const key = createDraftKey(owner);
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || "null") as CreateDraft | null;
    // 대본 값을 낸 임시저장은 오래 지킨다 — 지우면 낸 토큰까지 같이 사라진다.
    const ttl = value?.scriptCharged ? PAID_DRAFT_TTL_MS : CREATE_DRAFT_TTL_MS;
    if (!value || value.version !== CREATE_DRAFT_VERSION || Date.now() - value.savedAt > ttl) {
      window.localStorage.removeItem(key);
      return null;
    }
    return value;
  } catch {
    window.localStorage.removeItem(key);
    return null;
  }
}

function clearCreateDraft(owner: string | null): void {
  if (typeof window === "undefined" || !owner) return;
  window.localStorage.removeItem(createDraftKey(owner));
}

/**
 * 같은 재료로 이야기를 다시 지을 수 있는 횟수.
 *
 * 다시 짓기는 회원 토큰이 안 드는 단계지만, 누를 때마다 글 생성 값은 실제로 나간다.
 * 마음에 드는 이야기를 고를 자유(3번이면 서로 꽤 다른 이야기 넷을 보게 된다)와
 * 끝없이 돌려 보는 것 사이의 선이다. 재료를 바꾸면 0으로 되돌아간다.
 */
const MAX_OUTLINE_RETRIES = 3;

/**
 * 같은 줄거리로 대본을 다시 쓸 수 있는 횟수.
 *
 * 대본 값은 처음 한 번만 받으므로 다시 쓰기는 부모에게 공짜다 — 대신 우리가 API 값을
 * 문다. 문장이 조금 어색해서 한두 번 다시 쓰는 건 당연한 일이니 넉넉히 두 번 준다.
 * 그 이상 마음에 안 들면 줄거리부터 바꾸는 게 맞다.
 */
const MAX_STORY_REWRITES = 2;

/** "친구들이랑"에서 친구를 몇 명까지 받을지. 주인공까지 넷이면 그림 한 장에 담기는 한계다. */
const MAX_FRIENDS = 3;

/**
 * 친구 여러 명 입력 — 한 명씩 이름과 성별을 따로 받는다.
 *
 * 뭉뚱그려 "친구들"로만 넘기면 모델이 이름을 지어내고 생김새도 서로 닮게 그린다.
 * 한 명씩 세워 두면 이야기에서도 그림에서도 각자 다른 사람으로 남는다.
 */
function FriendsInput({
  friends,
  onChange,
  accent,
}: {
  friends: FriendEntry[];
  onChange: (v: FriendEntry[]) => void;
  accent: string;
}) {
  const patch = (i: number, p: Partial<FriendEntry>) =>
    onChange(friends.map((f, idx) => (idx === i ? { ...f, ...p } : f)));

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-bold text-neutral-400">
        친구들 <span className="font-medium">(선택 · 최대 {MAX_FRIENDS}명)</span>
      </p>
      {friends.map((f, i) => (
        <div key={i} className="flex flex-wrap items-center gap-1.5">
          <input
            value={f.name}
            onChange={(e) => patch(i, { name: e.target.value.slice(0, 20) })}
            maxLength={20}
            placeholder={`친구 ${i + 1} 이름`}
            className="min-w-0 flex-1 rounded-2xl border-2 border-dashed border-neutral-200 bg-white text-neutral-900 px-3.5 py-2 text-sm font-bold outline-none focus:border-neutral-400"
          />
          <GenderChips value={f.gender} onChange={(g) => patch(i, { gender: g })} accent={accent} />
          <button
            type="button"
            onClick={() => onChange(friends.filter((_, idx) => idx !== i))}
            aria-label={`친구 ${i + 1} 빼기`}
            className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-bold text-neutral-500 hover:bg-neutral-200"
          >
            ✕
          </button>
        </div>
      ))}
      {friends.length < MAX_FRIENDS && (
        <button
          type="button"
          onClick={() => onChange([...friends, { name: "", gender: "" }])}
          className="self-start rounded-full bg-neutral-100 px-3.5 py-1.5 text-xs font-extrabold text-neutral-600 hover:bg-neutral-200"
        >
          + 친구 더하기
        </button>
      )}
      <p className="text-[11px] font-medium text-neutral-400">
        이름을 적으면 그 이름이 그대로 동화에 나와요. 안 적으면 &lsquo;친구&rsquo;라고만 나와요.
      </p>
    </div>
  );
}

function WhoNameInput({
  who,
  value,
  onChange,
  gender,
  onGenderChange,
  friends,
  onFriendsChange,
  accent,
}: {
  who: string;
  value: string;
  onChange: (v: string) => void;
  gender: string;
  onGenderChange: (v: string) => void;
  friends: FriendEntry[];
  onFriendsChange: (v: FriendEntry[]) => void;
  accent: string;
}) {
  if (!who || who === "혼자서") return null;
  // "친구들이랑"은 한 명씩 받는 전용 입력으로 간다.
  if (who === "친구들이랑") {
    return <FriendsInput friends={friends} onChange={onFriendsChange} accent={accent} />;
  }
  const term = companionTerm(who);
  const askGender = !GENDER_KNOWN.has(term);
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-bold text-neutral-400">
        {term} 이름 <span className="font-medium">(선택)</span>
      </p>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 20))}
        maxLength={20}
        placeholder="이름만 적어요 (예: 토토, 민지)"
        className="w-full rounded-2xl border-2 border-dashed border-neutral-200 bg-white text-neutral-900 px-4 py-2.5 text-sm font-bold outline-none focus:border-neutral-400"
      />
      {askGender && (
        <div className="mt-1 flex items-center gap-1.5">
          <span className="text-xs font-bold text-neutral-400">{term}는</span>
          <GenderChips value={gender} onChange={onGenderChange} accent={accent} />
        </div>
      )}
    </div>
  );
}

/**
 * 칩 앞의 그림 — 전용 아이콘이 있으면 그림, 없으면 이모지.
 * 칩 목록이 여러 벌이고 목록마다 항목 모양이 조금씩 달라, 한 자리에서 처리한다.
 */
function ChipIcon({ emoji, icon }: { emoji: string; icon?: string }) {
  if (icon) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={icon} alt="" aria-hidden className="h-6 w-6 shrink-0 object-contain" />;
  }
  return <span className="text-base leading-none">{emoji}</span>;
}

/** 밝은 톤 공통 버튼. 강조색은 활성 테마에서 온다. */
function BigButton({
  children,
  onClick,
  disabled,
  tone = "accent",
  accent,
  accentDark,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "accent" | "white";
  accent?: string;
  accentDark?: string;
}) {
  const style =
    tone === "accent"
      ? { background: accent, color: "#fff", boxShadow: `0 6px 0 ${accentDark}` }
      : { background: "#fff", color: "#404040", boxShadow: "0 6px 0 rgba(0,0,0,0.12)" };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={style}
      // break-keep — 좁은 폰에서 "네, 만들게\n요"처럼 음절 중간에 꺾이는 걸 막는다(어절 단위로만
      // 줄바꿈). max-w-full로 긴 라벨도 카드 밖으로 안 삐져나간다. 폰에선 패딩·글자 한 단계 작게.
      className="max-w-full break-keep rounded-full px-6 py-3 text-base font-extrabold transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 sm:px-8 sm:py-3.5 sm:text-lg"
    >
      {children}
    </button>
  );
}

export default function CreatePage() {
  // 주제 입력 상태 이름이 theme이라, UI 테마는 ui로 받는다.
  const { theme: ui } = useTheme();
  const { accent, accentDark, accentSoft } = ui.colors;
  const router = useRouter();

  // 로그인 게이트 + 토큰 잔액 + 이미 만든 권수(5권 제한). 로그인 안 했으면 로그인으로.
  const [tokens, setTokens] = useState(0);
  const [master, setMaster] = useState(false);
  const [bookCount, setBookCount] = useState(0);
  useEffect(() => {
    let alive = true;
    (async () => {
      const s = await loadSession();
      if (!alive) return;
      if (!s.uid) {
        router.replace("/login");
        return;
      }
      setTokens(s.profile?.tokens ?? 0);
      setMaster(s.isMaster);
      setDraftOwner(s.uid);
      // 삽화를 cafe24에 올릴 때 회원별 폴더 이름으로 쓴다.
      setAcctId(s.profile?.username ?? null);
      // 권수 상한 확인용 — 숫자만 센다. 예전엔 책을 통째로 받아 세느라(삽화 포함)
      // 만들기 화면을 열 때마다 수십 MB가 오갔다.
      setBookCount(await countMyBooks());
      // 계정에 저장된 아이 정보를 서버에서 되살려 폼에 채운다 (로컬 캐시가 비어 있어도 복구).
      const remoteChild = await loadChildRemote();
      if (alive && remoteChild) {
        setName(remoteChild.name);
        setAge(remoteChild.age);
        setGender(remoteChild.gender);
        if (remoteChild.name && remoteChild.age !== null) setStep("theme");
        setPageCount(recommendedPages(remoteChild.age));
      }
      if (alive) {
        const savedDraft = loadCreateDraft(s.uid);
        if (savedDraft) setPendingDraft(savedDraft);
        else setDraftReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [router]);
  // 베타 권수 제한(마스터 제외).
  const bookLimitReached = !master && bookCount >= MAX_BOOKS_PER_USER;

  // 설정(⚙️)에 아이 정보가 있으면 미리 채우고 아이정보 단계는 건너뛴다.
  // 주제가 첫 질문이다 — 아이가 고를 것부터. 형제 동화는 재료 화면의 "누구랑"에서 다룬다.
  // 저장된 아이 정보는 서버 렌더 이후에 읽는다. 초기 HTML은 항상 같은 단계로
  // 렌더한 뒤, 마운트 후 저장값이 있으면 주제 단계로 이동시킨다.
  const [step, setStep] = useState<Step>("child");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // 생성 중에는 ESC로 취소한다 — 진행 중인 요청을 끊는다. 삽화 단계도 멈출 수 있다.
  const abortRef = useRef<AbortController | null>(null);
  // Enter 연타 등으로 같은 요청이 두 번 나가는 것을 막는다 (state와 달리 즉시 반영).
  const busyRef = useRef(false);
  useEscClose(() => abortRef.current?.abort(), busy || step === "illustrate");
  // 화면을 떠나면 진행 중인 요청도 끊는다 — 아무도 안 볼 삽화에 비용을 쓰지 않는다.
  useEffect(() => () => abortRef.current?.abort(), []);

  /*
   * 그림을 그리는 동안 창을 닫으려 하면 한 번 물어본다.
   *
   * 8쪽을 그리다 6쪽에서 닫으면 그 여섯 장이 그대로 사라진다. 다시 들어와도
   * 대본은 남지만 그림은 처음부터 다시 그려야 하고, 그림 값을 또 낸다.
   * 브라우저가 보여 주는 문구는 우리가 정할 수 없다(보안상 고정 문구다) —
   * 그래도 '닫으면 뭔가 잃는다'는 신호는 준다.
   */
  useEffect(() => {
    if (step !== "illustrate") return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [step]);

  // 로그인한 아이디 — 삽화를 올릴 cafe24 폴더 이름(books/<아이디>/…)으로 쓴다.
  const [acctId, setAcctId] = useState<string | null>(null);
  const [draftOwner, setDraftOwner] = useState<string | null>(null);
  const [pendingDraft, setPendingDraft] = useState<CreateDraft | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const draftBaselineRef = useRef<string | null>(null);

  // 입력값
  const [name, setName] = useState("");
  const [age, setAge] = useState<number | null>(null);
  const [gender, setGender] = useState<Gender>("girl");
  const [theme, setTheme] = useState("");
  // 주제 고르기 1단계 — 펼쳐진 갈래 카드. null이면 아직 안 골랐다.
  const [themeGroup, setThemeGroup] = useState<string | null>(null);
  // 이야기 갈래 — 오늘의 이야기(실경험) / 상상 이야기(칩) / 감정 동화(마음). null=미선택.
  const [storyMode, setStoryMode] = useState<StoryMode | null>(null);
  // 이야기 재료 — 누구랑·무슨 일. 세부주제(theme)와 함께 씨앗을 이룬다.
  const [who, setWho] = useState("");
  // 동행의 실제 이름(선택). "친구랑" 고르고 이름을 넣으면 그 이름을 그대로 쓴다.
  const [whoName, setWhoName] = useState("");
  // 동행의 성별(선택, "여자"/"남자"). 친구·선생님처럼 호칭으로 알 수 없을 때만 묻는다.
  const [whoGender, setWhoGender] = useState("");
  // "친구들이랑"을 골랐을 때 친구 한 명 한 명(이름·성별). 최대 3명.
  const [friends, setFriends] = useState<FriendEntry[]>([{ name: "", gender: "" }]);
  const [happening, setHappening] = useState("");
  const [extra, setExtra] = useState("");
  // 「오늘의 이야기」 전용 — 어디서·무슨 일(자유)·기분. 누구랑(who)은 공유한다.
  const [place, setPlace] = useState("");
  const [todayEvent, setTodayEvent] = useState("");
  const [feeling, setFeeling] = useState("");
  // 「오늘의 이야기」 — 일이 어떻게 끝났나 (각색 정확도의 핵심 재료)
  const [ending, setEnding] = useState("");
  // 「감정 동화」 전용 — 어떤 마음·그런 마음이 든 상황. 누구랑(who)은 공유한다.
  const [emotion, setEmotion] = useState("");
  const [situation, setSituation] = useState("");
  // 「직접 이야기 구성」 — 기승전결 안내 작성 또는 완성 원고 붙여넣기.
  const [directMode, setDirectMode] = useState<"guided" | "full">("guided");
  const [directOpening, setDirectOpening] = useState("");
  const [directDevelopment, setDirectDevelopment] = useState("");
  const [directCrisis, setDirectCrisis] = useState("");
  const [directEnding, setDirectEnding] = useState("");
  const [directText, setDirectText] = useState("");

  useEffect(() => {
    const saved = loadChild();
    if (!saved) return;
    // 저장된 아이 정보를 마운트 후 폼에 채운다 (하이드레이션 안전 — 서버 렌더엔 없음).
    setName(saved.name);
    setAge(saved.age);
    setGender(saved.gender);
    if (saved.name && saved.age !== null) setStep("theme");
    setPageCount(recommendedPages(saved.age));
  }, []);

  // 재료 미리보기 겸 "다음" 버튼 활성 조건. 갈래마다 다른 재료를 이어 붙인다.
  const seed =
    storyMode === "today"
      ? [place, who, todayEvent.trim(), feeling].filter(Boolean).join(", ")
      : storyMode === "emotion"
        ? [emotion, situation.trim(), who].filter(Boolean).join(", ")
        : storyMode === "direct"
          ? directMode === "guided"
            ? [directOpening, directDevelopment, directCrisis, directEnding].filter(Boolean).join(" ")
            : directText.trim()
        : [theme, who, happening, extra.trim()].filter(Boolean).join(", ");
  const directReady = directMode === "guided"
    ? [directOpening, directDevelopment, directCrisis, directEnding].every((part) => part.trim().length >= 8)
    : directText.trim().length >= 80;
  const directFeedback = storyMode === "direct"
    ? directMode === "guided"
      ? [
          !directOpening.trim() ? "시작에 주인공과 장소를 적어 주세요." : "",
          !directDevelopment.trim() ? "전개에 어떤 일이 생겼는지 적어 주세요." : "",
          !directCrisis.trim() ? "위기에 해결해야 할 어려움을 적어 주세요." : "",
          !directEnding.trim() ? "결말에 해결 방법과 남은 마음을 적어 주세요." : "",
          [directOpening, directDevelopment, directCrisis, directEnding].some((part) => part.trim() && part.trim().length < 8)
            ? "각 부분을 한 문장 이상 적으면 장면 구성이 더 정확해져요."
            : "",
        ].filter(Boolean)
      : [
          directText.trim().length < 80 ? "완성 원고를 80자 이상 적어 주세요." : "",
          directText.trim() && !/[.!?。！？]$/.test(directText.trim()) ? "마지막 문장을 마무리하면 결말을 더 정확히 나눌 수 있어요." : "",
        ].filter(Boolean)
    : [];
  // 그림체 — 지금은 저장만 한다. Gemini 삽화가 붙으면 이 스타일의 prompt가 쓰인다.
  const [artStyle, setArtStyle] = useState(ART_STYLES[0].id);
  /**
   * 어느 화면에서 볼 동화인가 — 삽화를 그 비율로 그린다.
   * 태블릿=가로 4:3, 핸드폰=세로 3:4. 지금 쓰는 기기를 기본으로 잡아두고 바꿀 수 있게 한다
   * (뷰어는 그림 실제 비율을 읽어 무대를 맞추므로, 어느 쪽을 골라도 잘림 없이 나온다).
   */
  /**
   * 아이가 그린 주인공 그림(선택) — 캐릭터 시트를 이 그림에서 따온다.
   * 시트 한 장이 모든 쪽 삽화의 기준이라, 여기만 넣으면 8쪽 내내 그 캐릭터가 나온다.
   * 사진이 아니라 '그림'을 받는다: 얼굴 데이터를 다루지 않아 안전하고,
   * "내가 그린 애가 주인공"이라는 몰입이 훨씬 크다(피드백 7번).
   */
  const [drawing, setDrawing] = useState<string | null>(null);
  const [drawingBusy, setDrawingBusy] = useState(false);

  /**
   * data URL 이미지를 줄여 다시 data URL로 만든다.
   *
   * Gemini가 준 삽화는 장당 약 1MB(base64)라, 그대로 저장하면 책 한 권이 8MB가 되고
   * 책장을 열 때 그걸 전부 내려받아 느려진다(피드백 5번의 진짜 원인).
   * 화면에 필요한 크기로 줄이고 WebP로 다시 구우면 8분의 1로 준다.
   * 변환이 안 되는 브라우저면 원본을 그대로 쓴다 — 저장 자체는 절대 막지 않는다.
   */
  async function shrinkDataUrl(dataUrl: string, maxSide: number, quality: number): Promise<string> {
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("이미지 변환 실패"));
        img.src = dataUrl;
      });
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      let out = canvas.toDataURL("image/webp", quality);
      // 사파리 등 WebP 인코딩을 못 하는 브라우저는 png를 돌려준다 — 그땐 jpeg로.
      if (!out.startsWith("data:image/webp")) out = canvas.toDataURL("image/jpeg", quality);
      return out.length < dataUrl.length ? out : dataUrl;
    } catch {
      return dataUrl;
    }
  }

  /**
   * 삽화를 cafe24로 옮기고 URL로 바꿔 돌려준다 (표지 + 각 쪽).
   *
   * 왜: 그림을 base64로 책 데이터에 넣으면 책을 열 때마다 그림 전체가 Supabase에서
   * 빠져나간다. 회원 4명으로도 한 달 전송량이 무료 한도의 두 배를 넘겼다(2026-08-06).
   * cafe24는 이미 결제해 둔 파일 창고라 추가 비용이 없다.
   *
   * 한 장씩 따로 올린다 — 한 번에 다 보내면 서버 요청 한도(4.5MB)에 걸린다.
   * 실패한 장은 원래 base64를 그대로 쓴다. 그림도 다 그렸고 토큰도 이미 냈는데
   * 파일 올리기가 안 됐다고 동화를 통째로 잃게 할 수는 없다.
   */
  async function hostArtwork(
    bookId: string,
    pageArt: (string | null)[],
    cover: string | null,
    sheet: string | null = null,
  ): Promise<{ images: (string | null)[]; cover: string | null; sheet: string | null }> {
    const jobs: { name: string; dataUrl: string; put: (url: string) => void }[] = [];
    const images = [...pageArt];
    let coverOut = cover;
    let sheetOut = sheet;

    if (cover) jobs.push({ name: "cover", dataUrl: cover, put: (u) => (coverOut = u) });
    if (sheet) jobs.push({ name: "sheet", dataUrl: sheet, put: (u) => (sheetOut = u) });
    pageArt.forEach((im, i) => {
      if (im) jobs.push({ name: `p${i + 1}`, dataUrl: im, put: (u) => (images[i] = u) });
    });
    if (jobs.length === 0) return { images, cover: coverOut, sheet: sheetOut };

    setUploading({ done: 0, total: jobs.length });
    // 회원 아이디로 폴더를 나눈다 — 나중에 사람이 직접 찾아보거나 지울 수 있게.
    const owner = acctId ?? "guest";
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      try {
        const res = await fetch("/api/upload-art", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ owner, bookId, name: job.name, image: job.dataUrl }),
        });
        if (res.ok) {
          const { url } = (await res.json()) as { url?: string };
          if (url) job.put(url);
        }
      } catch {
        /* 이 장만 base64로 남는다 — 다음 장을 계속 올린다 */
      }
      setUploading({ done: i + 1, total: jobs.length });
    }
    setUploading(null);
    return { images, cover: coverOut, sheet: sheetOut };
  }

  /** 올린 그림을 캔버스로 줄여 data URL로 만든다 — 원본 사진은 몇 MB라 그대로 보내면 느리다. */
  async function pickDrawing(file: File) {
    setDrawingBusy(true);
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("그림을 읽지 못했어요."));
        img.src = url;
      });
      const MAX = 768;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      setDrawing(canvas.toDataURL("image/jpeg", 0.85));
    } catch (e) {
      setError((e as Error).message || "그림을 읽지 못했어요.");
    } finally {
      setDrawingBusy(false);
    }
  }

  const [screenShape, setScreenShape] = useState<"tablet" | "phone">("tablet");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 화면 크기는 클라 전용, 마운트 후 판별
    setScreenShape(window.innerWidth < 700 ? "phone" : "tablet");
  }, []);
  const mood = deriveAutomaticMood({
    storyMode, emotion, theme, happening, todayEvent, feeling,
    directStory: directMode === "full" ? directText : `${directOpening} ${directDevelopment} ${directCrisis} ${directEnding}`,
  });
  // 읽어줄 성우 — 만든 동화에 박아 저장한다(book.narrator). 뷰어가 이 성우로 읽는다.
  // 기본 선택을 두지 않는다("") — 부모가 직접 골라 들어보고 정하게 유도한다.
  const [narratorVoice, setNarratorVoice] = useState<string>("");
  // 제작할 때 한 번만 고르고 책에 고정한다. 뷰어에서 바꾸지 않아 TTS 재합성을 막는다.
  const [narrationStyle, setNarrationStyle] = useState<NarrationStyle>("natural");
  /*
   * 이 계정에 등록된 엄마·아빠 목소리. 동화를 다 만든 뒤 앞 쪽 낭독을 미리 구울 때,
   * 부모 목소리가 있으면 그게 기본 성우가 되므로 그것으로 구워야 캐시가 맞는다.
   */
  const [parentVoices, setParentVoices] = useState<ParentVoice[]>([]);
  useEffect(() => {
    loadParentVoices().then(setParentVoices).catch(() => {});
  }, []);
  // 이야기 길이 — 쪽수가 적어도 각 쪽을 더 길고 풍부하게 연출할지.
  const [longerStory, setLongerStory] = useState(false);
  // 성우를 고르면 미리 구운 샘플(진짜 그 성우 목소리, static mp3)을 들려준다 — 크레딧 0.
  const narratorPreviewRef = useRef<HTMLAudioElement | null>(null);
  async function pickNarrator(id: string) {
    setNarratorVoice(id);
    try {
      const el = narratorPreviewRef.current ?? new Audio();
      narratorPreviewRef.current = el;
      if (id.startsWith("parent:")) {
        const parent = parentVoices.find((voice) => voice.role === id.slice("parent:".length));
        if (!parent) return;
        const blob = await fetchTypecastVoiceAudio(parent.voiceId, PARENT_VOICE_TEST_TEXT);
        el.src = URL.createObjectURL(blob);
      } else {
        el.src = `/casting/preview-${id}.mp3`;
      }
      el.currentTime = 0;
      void el.play().catch(() => {});
    } catch {
      /* 무시 */
    }
  }
  // 장면(쪽) 수 3~8. 나이에 맞는 추천값으로 시작한다(부모가 바꿀 수 있다).
  const [pageCount, setPageCount] = useState(() => recommendedPages(null));
  /*
   * 값은 두 번에 나눠 받는다 — 대본을 만들 때 글 값, 그림을 붙일 때 그림 값.
   * 둘을 더하면 예전과 같다(쪽당 2토큰). 나누기만 한 것이지 올린 게 아니다.
   */
  const scriptCost = scriptTokenCost(pageCount);
  const imageCost = illustrationTokenCost(pageCount);
  /*
   * 마스터는 토큰이 들지 않는다(auth.spendTokens에서 면제). 그런데 화면이 잔액으로
   * 버튼을 먼저 막고 있어서, 서버만 면제해 봐야 잔액이 바닥나면 못 만들었다.
   * 여기서도 같이 면제해야 실제로 계속 만들 수 있다.
   */
  const shortOnTokens = !master && tokens < scriptCost;

  // 생성 결과
  const [outline, setOutline] = useState<Outline | null>(null);

  /*
   * 줄거리 고치기 — 지금 고르고 있는 자리("title" 또는 장면 번호)와 입력 중인 글.
   *
   * 고치는 자리를 여기로 잡은 이유: 그림도 낭독도 아직 안 만들었다. 완성된 뒤에
   * 글을 고치면 그 쪽 낭독을 다시 합성해야 해서 크레딧이 또 나가고, 그림은 옛 글에
   * 맞춰진 채로 남아 어긋난다. 여기서 고치면 둘 다 없어서 얼마든지 고쳐도 공짜다.
   */
  const [editScene, setEditScene] = useState<number | "title" | null>(null);
  const [sceneDraft, setSceneDraft] = useState("");

  function saveSceneEdit() {
    const text = sceneDraft.trim();
    if (!text) return;
    setOutline((prev) => {
      if (!prev) return prev;
      if (editScene === "title") return { ...prev, title: text };
      return {
        ...prev,
        scenes: prev.scenes.map((s) => (s.sceneNo === editScene ? { ...s, text } : s)),
      };
    });
    setEditScene(null);
  }

  const [story, setStory] = useState<Story | null>(null);
  /*
   * 그림 값이 모자란 채로 그리기 시작하면, 다 그린 뒤 저장에서 막힌다 —
   * 그때는 이미 Gemini 값이 다 나간 뒤다. 시작 전에 막아야 손해가 없다.
   * 잔액은 대본 값을 낸 뒤의 것이라, 여기서 다시 본다.
   */
  const shortOnImageTokens =
    !master && story ? tokens < illustrationTokenCost(story.pages.length) : false;
  // 쪽별 삽화(data URL). 실패한 쪽은 null → 뷰어가 플레이스홀더를 그린다.
  const [pageImages, setPageImages] = useState<(string | null)[]>([]);
  const [drawn, setDrawn] = useState(0);
  /**
   * 다 그린 그림을 cafe24로 올리는 단계(저장 직전). null이면 아직 그 단계가 아니다.
   * 한 장씩 순서대로 올리느라 몇 초 걸려서, 화면이 멈춘 것처럼 보이지 않게 진행을 보여준다.
   */
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  // 그리기 시작 시각 — 지금까지 걸린 시간으로 남은 시간을 어림한다.
  const drawStartRef = useRef(0);
  // 기다리는 동안 1초마다 다시 그려 남은 시간·미리보기가 살아 움직이게 한다.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (step !== "illustrate") return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [step]);
  // 완성해 책장에 저장한 책 — done 화면은 이걸 뷰어로 보여준다(id="new" 대신 진짜 id).
  const [finalBook, setFinalBook] = useState<Book | null>(null);
  /*
   * 이야기를 다시 지은 횟수.
   *
   * 다시 짓기는 회원 토큰이 안 드는 단계다(토큰은 책이 저장될 때 한 번만 빠진다).
   * 그런데 누를 때마다 글 생성 값은 실제로 나간다 — 마음에 드는 이야기를 고를 자유는
   * 주되, 끝없이 돌려 보는 건 막는다.
   *
   * 새로고침으로 초기화되지 않게 임시저장에 함께 담는다. 재료를 바꾸면 0으로 되돌린다 —
   * 다른 이야기를 짓는 것이지 같은 것을 다시 돌리는 게 아니기 때문이다.
   */
  const [outlineRetries, setOutlineRetries] = useState(0);

  /**
   * 대본 값(글 값)을 이미 받았는지.
   *
   * 대본을 만들 때 한 번만 받는다. 새로고침해도 두 번 받지 않도록 임시저장에 함께 담는다.
   * 재료를 바꿔 새로 지으면 0으로 되돌린다 — 그건 다른 이야기다.
   */
  const [scriptCharged, setScriptCharged] = useState(false);
  /** 같은 줄거리로 대본을 다시 쓴 횟수. */
  const [storyRewrites, setStoryRewrites] = useState(0);
  /** 대본에서 지금 고치고 있는 쪽 번호. null이면 아무것도 안 고치는 중. */
  const [editingPage, setEditingPage] = useState<number | null>(null);
  const [pageDraft, setPageDraft] = useState("");
  /** 제목을 고치는 중인지. */
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  /**
   * 그림 그리기 전에 부모가 덧붙이는 장소 설명(선택).
   *
   * 장소는 글로만 잠겨 있어서 쪽마다 흔들린다. 부모가 "우리 동네 계곡은 자갈밭이고
   * 큰 바위가 하나 있어요"처럼 한 줄 적어 주면 그림이 훨씬 덜 흔들린다.
   */
  const [locationDetail, setLocationDetail] = useState("");
  /**
   * 장소 칸을 부모가 손댔는지.
   *
   * 대본이 나오면 이 칸을 이야기에서 뽑아 미리 채워 준다. 그런데 부모가 이미 고쳐
   * 둔 것을 다시 쓸 때 덮어 버리면, 애써 적은 것이 말없이 사라진다.
   * (설정 화면의 아이 특징에서 똑같은 사고가 났던 적이 있다.)
   */
  const locationTouchedRef = useRef(false);
  // 캐릭터 시트는 책에 함께 저장한다 — 나중에 한 쪽만 다시 그릴 때 얼굴 기준이 된다.
  const sheetImageRef = useRef<string | null>(null);

  // 본문 생성은 토큰이 드는 단계라, 줄거리 화면에서 한 번 더 확인받는다(실수 방지).
  const [confirmMake, setConfirmMake] = useState(false);

  const draftContent = JSON.stringify({
    version: CREATE_DRAFT_VERSION,
    savedAt: 0,
    step: (["child", "theme", "style", "outline", "story"] as Step[]).includes(step) ? step : "theme",
    name, age, gender, theme, themeGroup, storyMode, who, whoName, whoGender, friends,
    happening, extra, place, todayEvent, feeling, ending, emotion, situation,
    artStyle, screenShape, narratorVoice, narrationStyle, longerStory, pageCount, outline, story,
    directMode, directOpening, directDevelopment, directCrisis, directEnding, directText,
    outlineRetries, scriptCharged, storyRewrites, locationDetail,
  });

  useEffect(() => {
    if (!draftReady || !draftOwner || step === "illustrate" || step === "done") return;
    if (draftBaselineRef.current === null) {
      draftBaselineRef.current = draftContent;
      return;
    }
    if (draftBaselineRef.current === draftContent) return;
    const timer = window.setTimeout(() => {
      const draft = { ...(JSON.parse(draftContent) as CreateDraft), savedAt: Date.now() };
      window.localStorage.setItem(createDraftKey(draftOwner), JSON.stringify(draft));
      draftBaselineRef.current = draftContent;
    }, 500);
    return () => window.clearTimeout(timer);
  }, [draftContent, draftOwner, draftReady, step]);

  useEffect(() => {
    if (!draftReady || !draftOwner || step === "illustrate" || step === "done") return;
    const saveBeforeLeaving = () => {
      if (draftBaselineRef.current === draftContent) return;
      const draft = { ...(JSON.parse(draftContent) as CreateDraft), savedAt: Date.now() };
      window.localStorage.setItem(createDraftKey(draftOwner), JSON.stringify(draft));
    };
    window.addEventListener("pagehide", saveBeforeLeaving);
    return () => window.removeEventListener("pagehide", saveBeforeLeaving);
  }, [draftContent, draftOwner, draftReady, step]);

  function restoreCreateDraft(draft: CreateDraft): void {
    setName(draft.name);
    setAge(draft.age);
    setGender(draft.gender);
    setTheme(draft.theme);
    setThemeGroup(draft.themeGroup);
    setStoryMode(draft.storyMode);
    setWho(draft.who);
    setWhoName(draft.whoName);
    setWhoGender(draft.whoGender);
    setFriends(draft.friends.length > 0 ? draft.friends.slice(0, MAX_FRIENDS) : [{ name: "", gender: "" }]);
    setHappening(draft.happening);
    setExtra(draft.extra);
    setPlace(draft.place);
    setTodayEvent(draft.todayEvent);
    setFeeling(draft.feeling);
    setEnding(draft.ending);
    setEmotion(draft.emotion);
    setSituation(draft.situation);
    setDirectMode(draft.directMode);
    setDirectOpening(draft.directOpening);
    setDirectDevelopment(draft.directDevelopment);
    setDirectCrisis(draft.directCrisis);
    setDirectEnding(draft.directEnding);
    setDirectText(draft.directText);
    setOutlineRetries(draft.outlineRetries ?? 0);
    setScriptCharged(draft.scriptCharged ?? false);
    setStoryRewrites(draft.storyRewrites ?? 0);
    setLocationDetail(draft.locationDetail ?? "");
    // 적어 둔 것이 있으면 손댄 것으로 본다 — 이어서 만들 때 덮어쓰지 않게.
    locationTouchedRef.current = Boolean(draft.locationDetail);
    setArtStyle(ART_STYLES.some((style) => style.id === draft.artStyle) ? draft.artStyle : ART_STYLES[0].id);
    setScreenShape(draft.screenShape === "phone" ? "phone" : "tablet");
    setNarratorVoice(draft.narratorVoice);
    setNarrationStyle(draft.narrationStyle ?? "natural");
    setLongerStory(draft.longerStory);
    setPageCount(Math.min(8, Math.max(3, draft.pageCount)));
    setOutline(draft.outline);
    setStory(draft.story);
    setStep(draft.step);
    draftBaselineRef.current = null;
    setPendingDraft(null);
    setDraftReady(true);
  }

  function discardCreateDraft(): void {
    clearCreateDraft(draftOwner);
    draftBaselineRef.current = null;
    setPendingDraft(null);
    setDraftReady(true);
  }

  /*
   * 이야기·줄거리 요청에 넘길 아이 정보.
   *
   * 생김새(looks)까지 함께 보낸다. 예전에는 이 값이 그림 그리는 쪽에만 가서,
   * 클로드가 생김새를 모른 채 인물 설명을 지어냈다("짧은 검정 곱슬머리"). 그 뒤
   * 캐릭터 시트에서 부모가 고른 값과 부딪혀, 고른 대로 안 그려지는 원인이 됐다.
   * 이제 이야기를 쓸 때부터 알려 줘서 인물 설명 자체가 이 값으로 나온다.
   */
  const child = {
    name: name.trim(),
    age: age ?? 0,
    gender,
    looks: looksToPrompt(loadChild()?.looks) || undefined,
  };

  // '누구랑' 칩 — 아이 성별에 맞는 형제 호칭을 끼워 만든다.
  // 오늘의 이야기는 '혼자서'를 맨 끝에 두는 순서를 지킨다.
  const todayWho = [...TODAY_WHO.slice(0, -1), ...siblingOptions(gender), TODAY_WHO[TODAY_WHO.length - 1]];
  const imagineWho = [...WHO_OPTIONS, ...siblingOptions(gender)];

  // 동행 칩을 누르면(또는 껐다 켜면) 이름은 초기화한다 — "친구랑"에 넣은 이름이
  // "동생이랑"으로 바꿔도 남아 엉키는 걸 막는다.
  /** 성별 바꾸기 — 이미 고른 손위 형제 호칭(형/오빠·누나/언니)도 함께 맞춰 준다. */
  function chooseGender(g: Gender) {
    setGender(g);
    setWho((prev) => {
      const swap = SIBLING_SWAP[prev];
      return swap ? (g === "boy" ? swap.boy : swap.girl) : prev;
    });
  }

  function chooseWho(t: string) {
    setWho((prev) => (prev === t ? "" : t));
    setWhoName("");
    setWhoGender(""); // 이름과 같은 이유 — 다른 동행으로 바꿨는데 앞의 성별이 남으면 안 된다
    setFriends([{ name: "", gender: "" }]);
  }

  function buildStoryMaterial() {
    const common = {
      who,
      whoName: whoName.trim(),
      whoGender,
      friends: friends.filter((friend) => friend.name.trim() || friend.gender),
    };
    if (storyMode === "today") {
      return { kind: "today", subject: "", ...common, happening: todayEvent.trim(), place, feeling, ending, emotion: "", situation: "", extra: "", directMode: "", directOpening: "", directDevelopment: "", directCrisis: "", directEnding: "", directText: "" };
    }
    if (storyMode === "emotion") {
      return { kind: "emotion", subject: "", ...common, happening: "", place: "", feeling: "", ending: "", emotion, situation: situation.trim(), extra: "", directMode: "", directOpening: "", directDevelopment: "", directCrisis: "", directEnding: "", directText: "" };
    }
    if (storyMode === "direct") {
      return {
        kind: "direct", subject: "", ...common, happening: "", place: "", feeling: "", ending: "", emotion: "", situation: "", extra: "",
        directMode, directOpening: directOpening.trim(), directDevelopment: directDevelopment.trim(),
        directCrisis: directCrisis.trim(), directEnding: directEnding.trim(), directText: directText.trim(),
      };
    }
    return { kind: "imagine", subject: theme, ...common, happening, place: "", feeling: "", ending: "", emotion: "", situation: "", extra: extra.trim(), directMode: "", directOpening: "", directDevelopment: "", directCrisis: "", directEnding: "", directText: "" };
  }

  /**
   * 줄거리 짓기. 이미 줄거리가 있는데 또 부르면 '다시 짓기'다.
   *
   * @param isRetry 다시 짓기인지 — 횟수를 세고, 다 썼으면 막는다.
   */
  async function makeOutline(isRetry = false) {
    if (busyRef.current) return;
    if (isRetry && !master && outlineRetries >= MAX_OUTLINE_RETRIES) {
      setError(
        `이야기 다시 짓기는 ${MAX_OUTLINE_RETRIES}번까지예요. 재료를 바꾸면 새로 지을 수 있어요.`,
      );
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    if (isRetry) setOutlineRetries((n) => n + 1);
    // 새 줄거리 = 다른 이야기다. 대본을 새로 만들면 글 값을 다시 받는다.
    setScriptCharged(false);
    setStoryRewrites(0);
    setLocationDetail("");
    locationTouchedRef.current = false;
    const ac = new AbortController();
    abortRef.current = ac;
    // 다음에 또 만들 때 아이 정보를 다시 안 묻도록 저장해 둔다.
    saveChild({ name: name.trim(), age, gender });
    try {
      const r = await fetch("/api/outline", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          child,
          // 항목별로 보낸다(콤마로 안 뭉침). 갈래에 따라 재료 형태가 다르다:
          // 오늘=실경험(어디·누구·무슨일·기분), 상상=칩 조합(소재·누구·사건·자유).
          material:
            storyMode === "direct"
              ? buildStoryMaterial()
              : storyMode === "today"
              ? {
                  kind: "today",
                  subject: "",
                  who,
                  whoName: whoName.trim(),
                  whoGender,
                  friends: who === "친구들이랑" ? friends.filter((x) => x.name.trim() || x.gender) : [],
                  happening: todayEvent.trim(),
                  place,
                  feeling,
                  ending,
                  emotion: "",
                  situation: "",
                  extra: "",
                }
              : storyMode === "emotion"
                ? {
                    kind: "emotion",
                    subject: "",
                    who,
                    whoName: whoName.trim(),
                  whoGender,
                  friends: who === "친구들이랑" ? friends.filter((x) => x.name.trim() || x.gender) : [],
                    happening: "",
                    place: "",
                    feeling: "",
                    emotion,
                    situation: situation.trim(),
                    extra: "",
                  }
                : {
                    kind: "imagine",
                    subject: theme,
                    who,
                    whoName: whoName.trim(),
                  whoGender,
                  friends: who === "친구들이랑" ? friends.filter((x) => x.name.trim() || x.gender) : [],
                    happening,
                    place: "",
                    feeling: "",
                    emotion: "",
                    situation: "",
                    extra: extra.trim(),
                  },
          pageCount,
          // 사용자가 고르지 않아도 재료에서 계산한 톤을 글과 삽화에 동일하게 넘긴다.
          mood: mood.ko,
        }),
        signal: ac.signal,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "줄거리를 만들지 못했어요.");
      setOutline(data.outline);
      setStep("outline");
    } catch (e) {
      // ESC로 취소한 경우는 오류가 아니다 — 조용히 원래 화면에 남는다.
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  /**
   * 대본에서 한 쪽 문장을 부모가 고친 것을 반영한다.
   *
   * 본문만 바꾸면 안 된다. 그림은 본문이 아니라 따로 적힌 장면 지시를 보고 그리기
   * 때문에, 본문만 고치면 "사과를 배로" 바꿔도 그림에는 사과가 그대로 남는다.
   * 장면 지시의 잠금 줄(인물·장소·물건)은 두고 '일어나는 일'만 갈아 끼운다.
   */
  function savePageText(index: number) {
    // 맥에서 입력한 한글은 자모가 분리된 형태(NFD)로 들어올 수 있다. 그대로 두면
    // 동글 같은 글꼴에서 ◆?로 깨져 보인다 — 저장 전에 한 번 합쳐 둔다.
    const text = pageDraft.normalize("NFC").trim();
    if (!text) {
      setEditingPage(null);
      return; // 빈 쪽은 만들지 않는다 — 고치기 전 문장을 그대로 둔다
    }
    setStory((prev) =>
      prev
        ? {
            ...prev,
            pages: prev.pages.map((p, i) =>
              i === index
                ? {
                    ...p,
                    text,
                    // 등장인물도 고친 문장 기준으로 다시 센다 — 빠진 인물이 그림에 남지 않게.
                    imagePrompt: rewriteScene(
                      p.imagePrompt,
                      text,
                      prev.characters.map((c) => c.name),
                    ),
                  }
                : p,
            ),
          }
        : prev,
    );
    setEditingPage(null);
  }

  /** 제목도 고칠 수 있어야 한다 — 책장에서 제일 먼저 보이는 것이 제목이다. */
  function saveTitle() {
    const title = titleDraft.normalize("NFC").trim().slice(0, 40);
    if (!title) {
      setEditingTitle(false);
      return; // 제목 없는 책은 만들지 않는다
    }
    setStory((prev) => (prev ? { ...prev, title } : prev));
    setEditingTitle(false);
  }

  async function makeStory() {
    if (!outline || busyRef.current) return;
    // 대본을 이미 받은 뒤 다시 부르는 것 = 다시 쓰기. 값은 더 받지 않으니 횟수로 막는다.
    const isRewrite = scriptCharged;
    if (isRewrite && !master && storyRewrites >= MAX_STORY_REWRITES) {
      setError(
        `같은 줄거리로 다시 쓰기는 ${MAX_STORY_REWRITES}번까지예요. 문장을 눌러 직접 고치실 수 있어요.`,
      );
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const r = await fetch("/api/story", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          child,
          outline,
          material: buildStoryMaterial(),
          mood: mood.ko,
          longer: longerStory,
          narrationStyle,
        }),
        signal: ac.signal,
      });
      const data = await r.json();
      if (!r.ok) {
        const detail = Array.isArray(data.detail) ? data.detail.slice(0, 2).join(" ") : "";
        throw new Error([data.error ?? "동화를 만들지 못했어요.", detail].filter(Boolean).join(" "));
      }
      /*
       * 대본이 나왔으면 여기서 글 값을 받고 멈춘다 — 그림은 아직 그리지 않는다.
       *
       * 예전엔 대본과 그림을 한 번에 만들고 끝에서 값을 한꺼번에 받았다. 그러면 부모가
       * 대본을 보기도 전에 그림 값까지 나가서, 이야기가 마음에 안 들어도 되돌릴 수 없었다.
       * 이제 대본을 먼저 읽고 고친 뒤 "이걸로 그림 만들자" 할 때 그림 값을 낸다.
       */
      const story = data.story as Story;
      if (!master && !scriptCharged) {
        const cost = scriptTokenCost(story.pages.length);
        if (!(await spendTokens(cost))) {
          setError(`토큰이 부족해요. 대본을 만들려면 ${cost}개가 필요해요.`);
          return; // 줄거리 화면에 그대로 남는다 — 대본은 버린다
        }
        setTokens((t) => Math.max(0, t - cost));
      }
      setScriptCharged(true);
      if (isRewrite) setStoryRewrites((n) => n + 1);
      setEditingPage(null); // 새 대본이니 고치던 자리는 닫는다
      setEditingTitle(false);
      /*
       * 장소 칸을 이야기에서 뽑아 미리 채운다.
       *
       * 빈칸을 내밀면 대부분 그냥 넘어간다 — 뭘 적어야 할지 모르기 때문이다.
       * 클로드는 이미 쪽마다 `장소: 골목 — 회색 시멘트 담과 물웅덩이.`를 적어 뒀으니,
       * 그걸 사람이 읽는 한 줄로 바꿔 두면 부모는 고치기만 하면 된다.
       * 이미 손댄 값은 건드리지 않는다.
       */
      if (!locationTouchedRef.current) {
        setLocationDetail(suggestLocationDetail(story.pages.map((p) => p.imagePrompt)));
      }
      setStory(story);
      setStep("story");
    } catch (e) {
      // ESC로 취소한 경우는 오류가 아니다 — 줄거리 화면에 그대로 남는다.
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  /**
   * 삽화 — 캐릭터 시트 1장 → 쪽마다 시트를 참조로 재주입(인물 일관성).
   * 역할 분담: 장면 묘사는 클로드가 이미 써놨고(@@IMG@@), Gemini는 그리기만 한다.
   * 키가 없거나 실패하면 글만으로 보여준다 — 삽화가 없다고 동화를 막지 않는다.
   */
  async function illustrate(s: Story) {
    setStep("illustrate");
    setDrawn(0);
    drawStartRef.current = Date.now();
    // 삽화는 쪽당 과금이라 취소가 중요하다 — ESC나 화면 이탈 시 남은 쪽을 그리지 않는다.
    const ac = new AbortController();
    abortRef.current = ac;
    const images: (string | null)[] = [];
    const locationReferences = new Map<string, { image: string; scene: string }>();
    try {
      const heroLooks = looksToPrompt(loadChild()?.looks);
      const sheetRes = await fetch("/api/character-sheet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          characters: s.characters,
          artStyleId: artStyle,
          drawing, // 아이가 그린 주인공(선택) — 있으면 이 그림에서 캐릭터를 따온다
          // 설정에 저장해 둔 아이 특징(머리·안경·옷 색·주근깨…) — 주인공을 "우리 애 같게".
          looks: heroLooks,
        }),
        signal: ac.signal,
      });
      // .json()을 ok 검사보다 먼저 부르면, 프록시가 HTML 오류 페이지를 주는 순간
      // "Unexpected token '<'" 같은 알 수 없는 말이 부모에게 그대로 뜬다.
      const sheetData = (await sheetRes.json().catch(() => ({}))) as { error?: string; image?: string };
      if (!sheetRes.ok) {
        throw new Error(sheetData.error ?? `캐릭터 그림을 만들지 못했어요 (HTTP ${sheetRes.status})`);
      }
      const sheet = sheetData.image;
      if (!sheet) throw new Error("캐릭터 그림을 받지 못했어요. 잠시 뒤 다시 시도해 주세요.");
      sheetImageRef.current = sheet;

      // 삽화는 쪽마다 독립이다(캐릭터 일관성은 위에서 만든 캐릭터 시트가 잡아준다).
      // 예전엔 한 장씩 줄 세워 그려서 8쪽이면 '한 장 시간 × 8'을 기다려야 했다 —
      // 만들기가 느리다는 피드백(2번)의 가장 큰 원인이었다. 이제 여러 장을 동시에 그린다.
      // 동시 3장: 더 늘리면 Gemini 쪽에서 몰아친다고 막을 수 있어 안전선을 둔다.
      const CONCURRENT_IMAGES = 3;
      images.length = s.pages.length;
      images.fill(null);
      /**
       * 쪽마다 품질검사를 통과했는지. 그림 자체와 따로 둔다.
       *
       * 검사에 떨어져도 그림은 버리지 않는다(이미 결제한 그림이다). 다만 통과한
       * 그림만 뒤 쪽의 '그림체·장소 기준'으로 쓴다 — 안 그러면 떨어진 1쪽이 책 전체의
       * 기준이 되어 나머지까지 끌고 내려간다.
       */
      const passed: boolean[] = new Array(s.pages.length).fill(false);
      let done = 0;
      let cursor = 0;
      const claimedPages = new Set<number>();
      // 비용 상한일 뿐 실패 사유가 아니다 — 여기 걸려도 그림은 그대로 책에 들어간다.
      const MAX_QA_REDRAWS_PER_BOOK = Math.max(2, Math.ceil(s.pages.length / 3));
      let qaRedrawsUsed = 0;
      // 그림에 글자가 박힌 경우 전용 예산 — 이건 취향 문제가 아니라 명백한 불량이다.
      const MAX_TEXT_REDRAWS_PER_BOOK = Math.max(2, Math.ceil(s.pages.length / 3));
      let textRedrawsUsed = 0;
      const nextUnclaimedPage = (): number | null => {
        while (cursor < s.pages.length && claimedPages.has(cursor)) cursor++;
        if (cursor >= s.pages.length) return null;
        const index = cursor++;
        claimedPages.add(index);
        return index;
      };
      const drawWorker = async (singlePage = false, requestedIndex?: number): Promise<void> => {
        for (;;) {
          let i: number | null;
          if (requestedIndex !== undefined) {
            if (claimedPages.has(requestedIndex)) return;
            i = requestedIndex;
            claimedPages.add(i);
            requestedIndex = undefined;
          } else {
            i = nextUnclaimedPage();
          }
          if (i === null || ac.signal.aborted) return;
          try {
            const requestImage = async (qualityCorrection = "") => {
              const locationKey = locationKeyFromImagePrompt(s.pages[i].imagePrompt);
              const sameLocationReference = locationKey ? locationReferences.get(locationKey) : undefined;
              // 그림체 기준은 '검사를 통과한' 그림에서만 가져온다. 떨어진 그림을 기준으로
              // 삼으면 그 어긋남이 뒤 쪽으로 번진다.
              const styleSeed = passed[0] ? 0 : passed.findIndex(Boolean);
              const styleFallback = styleSeed >= 0 ? images[styleSeed] : null;
              const styleReference = sameLocationReference?.image ?? styleFallback ?? "";
              const styleReferenceScene =
                sameLocationReference?.scene ??
                (styleFallback && styleSeed >= 0 ? s.pages[styleSeed].imagePrompt : "");
              const r = await fetch("/api/illustrate-page", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  scene: s.pages[i].imagePrompt,
                  storyText: s.pages[i].text,
                  artStyleId: artStyle,
                  characterSheet: sheet,
                  // 같은 장소의 통과 이미지를 우선 참조하고, 없으면 첫 페이지를 그림체 기준으로만 쓴다.
                  styleReference,
                  styleReferenceScene,
                  mood: mood.en,
                  shape: screenShape,
                  qualityCorrection,
                  // 부모가 대본 화면에서 적어 준 장소 — 모든 쪽이 같은 곳을 그리게 하는 유일한 끈이다.
                  locationDetail: locationDetail.trim(),
                  // 책 전체 인물을 보내되 서버가 장면에 이름이 있는 인물만 골라 잠근다.
                  cast: s.characters.map((c, characterIndex) => ({
                    name: c.name,
                    // 주인공 머리결 선택을 페이지 QA에도 넣어 시트 이후 다시 곱슬로 변하지 않게 한다.
                    description:
                      characterIndex === 0 && heroLooks
                        ? `${c.description}, ${heroLooks}`
                        : c.description,
                  })),
                }),
                signal: ac.signal,
              });
              // ok 검사보다 .json()이 먼저면 HTML 오류 페이지에서 SyntaxError가 난다.
              const data = (await r.json().catch(() => ({}))) as {
                image?: string;
                qualityPassed?: boolean;
                qualityWarning?: string;
                qualityIssue?: "text" | "other";
              };
              return { ok: r.ok, data };
            };

            /*
             * 품질검사는 '다시 그릴지'만 정한다. '버릴지'는 정하지 않는다.
             *
             * 예전엔 검사에 떨어진 그림을 null로 만들었고, 그 null 하나가 책 저장을
             * 통째로 막았다. 이미 결제한 그림을 버리고 책까지 못 만드는 이중 손해였다.
             * 이제 다시 그려 보되, 그것도 신통찮으면 처음 그림을 그대로 쓴다.
             */
            const first = await requestImage();
            let image = first.ok ? (first.data.image ?? null) : null;
            let ok = first.ok && first.data.qualityPassed !== false && Boolean(image);

            /*
             * 그림 안에 글자가 그려진 경우는 예산과 따로 센다.
             *
             * '그림체가 조금 다르다'는 사람에 따라 갈리지만, 그림에 박힌 엉터리 글자는
             * 언제나 잘못이고 한눈에 보인다(실제로 한국어 본문을 옮긴 듯한 영어 문장이
             * 그려져 나왔다). 예산이 떨어졌다는 이유로 그대로 책에 넣으면 안 된다.
             */
            const isTextIssue = first.data.qualityIssue === "text";
            const canRedraw = isTextIssue
              ? textRedrawsUsed < MAX_TEXT_REDRAWS_PER_BOOK
              : qaRedrawsUsed < MAX_QA_REDRAWS_PER_BOOK;

            if (image && !ok && canRedraw) {
              // 증분은 await 전에 동기적으로 실행돼 동시 worker끼리도 예산을 넘기지 않는다.
              if (isTextIssue) textRedrawsUsed++;
              else qaRedrawsUsed++;
              const second = await requestImage(
                isTextIssue
                  ? "The previous attempt drew readable words inside the picture. Draw the same scene with absolutely no writing of any kind."
                  : (first.data.qualityWarning ?? "Character mismatch"),
              );
              if (second.ok && second.data.image && second.data.qualityPassed !== false) {
                image = second.data.image;
                ok = true;
              } else if (isTextIssue && second.ok && second.data.image && second.data.qualityIssue !== "text") {
                // 글자는 지워졌고 다른 지적만 남았다면 그쪽이 낫다 — 글자보다는 낫다.
                image = second.data.image;
              }
            }

            images[i] = image; // 그린 그림은 검사 결과와 무관하게 남긴다
            passed[i] = ok;
            if (image && ok) {
              const locationKey = locationKeyFromImagePrompt(s.pages[i].imagePrompt);
              if (locationKey && !locationReferences.has(locationKey)) {
                locationReferences.set(locationKey, { image, scene: s.pages[i].imagePrompt });
              }
            }
          } catch (e) {
            if ((e as Error).name === "AbortError") return;
            // 한 장이 실패해도 나머지는 계속 그린다 — 그 쪽만 플레이스홀더가 된다.
            images[i] = null;
          }
          done++;
          setDrawn(done);
          setPageImages([...images]);
          if (singlePage) return;
        }
      };
      // 첫 페이지는 책 전체 그림체 기준이다. 이어서 장소별 첫 장만 먼저 확정해
      // 같은 집·놀이터의 후속 장면이 실제 통과 이미지를 환경 기준으로 참조하게 한다.
      await drawWorker(true, 0);
      const seededLocations = new Set<string>();
      const locationSeedPages: number[] = [];
      s.pages.forEach((page, index) => {
        const key = locationKeyFromImagePrompt(page.imagePrompt);
        if (!key || seededLocations.has(key)) return;
        seededLocations.add(key);
        if (index !== 0) locationSeedPages.push(index);
      });
      for (const index of locationSeedPages) {
        await drawWorker(true, index);
      }
      // 장소 기준이 모두 준비된 뒤 나머지 장면은 최대 3장씩 병렬 생성한다.
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENT_IMAGES, s.pages.length) }, drawWorker),
      );
      /*
       * 여기서 막지 않는다.
       *
       * 예전엔 한 장이라도 비면 저장을 통째로 막고 검토 화면으로 돌려보냈다. 그런데
       * 그 시점엔 이미 8~11장을 다 결제한 뒤였고, 다시 시도하면 성공한 쪽까지 새로
       * 그려서 같은 돈을 또 냈다. 못 그린 쪽은 뷰어가 글만 보여 주므로 책은 성립한다.
       */
    } catch (e) {
      // 취소는 정상 경로 — 그때까지 그린 쪽으로 조용히 마무리한다.
      //
      // 여기로 오는 실패는 사실상 캐릭터 시트뿐이다(쪽 그림은 위에서 다 삼킨다).
      // 시트는 쪽 그림에 돈이 나가기 '전'이라 여기서 돌려보내도 손해가 없다.
      if ((e as Error).name !== "AbortError") {
        console.warn("[illustrate]", e);
        setError((e as Error).message || "삽화를 그리지 못했어요. 다시 시도해주세요.");
        setStep("story");
        return;
      }
    }
    // 취소했더라도 그때까지 그린 쪽으로 완성 화면을 보여준다 (나머지는 플레이스홀더).
    setPageImages(images);
    await finish(images, s);
  }

  /**
   * 완성 → 책장에 저장하고 뷰어로. 진짜 id를 붙여 저장해야 "우리 가족 책장"에 남고
   * /book/[id]로 다시 열 수 있다(예전엔 id="new"로 한 번 보고 사라졌다).
   * story는 인자로 받는다 — setStory 직후엔 state가 아직 안 바뀌어 있어서다.
   */
  async function finish(images: (string | null)[], s: Story | null = story) {
    if (!s) return;
    /*
     * 여기서는 '그림 값'만 받는다 — 글 값은 대본이 나왔을 때 이미 받았다.
     * 그림 없이 끝내면 더 받을 것이 없다(글 동화 한 권 값을 이미 낸 셈이다).
     */
    const illustrated = images.some(Boolean);
    const cost = illustrated ? illustrationTokenCost(s.pages.length) : 0;
    if (cost > 0) {
      // 차감 결과를 반드시 확인한다: 서버 잔액이 부족하거나 갱신에 실패하면 저장하지
      // 않고 이유를 알린다(무료 생성 방지 + 부모가 원인을 알 수 있게).
      if (!(await spendTokens(cost))) {
        setError(
          `토큰이 부족해서 저장하지 못했어요. (그림에 ${cost}개 필요) 충전한 뒤 '그림 만들기'를 다시 눌러 주세요.`,
        );
        setStep("story");
        return;
      }
      // 마스터는 실제로 차감되지 않으니 화면 잔액도 그대로 둔다(안 그러면 숫자만 줄어 헷갈린다).
      if (!master) setTokens((t) => Math.max(0, t - cost));
    }
    // 저장 전에 삽화를 화면 크기로 줄인다 — 원본(장당 약 1MB)을 그대로 넣으면 책이
    // 8MB가 되어 책장·책 열기가 둘 다 느려진다. 표지는 더 작게 따로 만들어 두어
    // 책장이 본문을 안 받고도 표지를 보여줄 수 있게 한다.
    const slim = await Promise.all(
      images.map((im) => (im ? shrinkDataUrl(im, 1280, 0.82) : Promise.resolve(null))),
    );
    const firstArt = images.find(Boolean) ?? null;
    const cover = firstArt ? await shrinkDataUrl(firstArt, 420, 0.8) : null;

    /*
     * 삽화를 cafe24로 옮기고 DB에는 URL만 남긴다.
     *
     * 예전엔 그림을 base64로 책 데이터 안에 넣었는데, 그러면 책을 열 때마다 그림
     * 전체가 Supabase에서 빠져나간다 — 회원 4명으로도 한 달 전송량이 무료 한도의
     * 두 배를 넘겼다(2026-08-06 실측). cafe24는 이미 결제해 둔 파일 창고라 추가
     * 비용이 없고, 책 여는 속도도 빨라진다.
     *
     * 올리기가 실패하면 그 장만 base64로 그대로 둔다 — 여기서 막으면 애써 만든
     * 동화가 통째로 날아간다. 그림은 이미 다 그려졌고 토큰도 이미 냈다.
     */
    const bookId = `my-${Date.now().toString(36)}`;
    const hosted = await hostArtwork(bookId, slim, cover, sheetImageRef.current);

    const book: Book = {
      id: bookId,
      lang: "ko",
      title: s.title,
      summary: s.summary,
      // 고른 성우를 책에 박는다 — 뷰어가 이 성우로 읽어준다(방법 B).
      narrator: narratorVoice,
      narrationStyle,
      coverImage: hosted.cover,
      pageCount: s.pages.length,
      // 나중에 한 쪽만 다시 그릴 때 쓸 재료를 함께 남긴다 — 이게 없으면 다시 그린
      // 그림만 화풍·인물·비율이 어긋나 오히려 더 눈에 띈다.
      artStyleId: artStyle,
      shape: screenShape,
      characterSheet: hosted.sheet,
      locationDetail: locationDetail.trim() || undefined,
      cast: s.characters.map((c) => ({ name: c.name, description: c.description })),
      pages: s.pages.map((p, i) => ({
        text: p.text,
        imagePrompt: p.imagePrompt,
        voiceDirection: p.voiceDirection,
        image: hosted.images[i] ?? null,
      })),
    };
    await saveMyBook(book); // Supabase에 저장 (뷰어가 /book/[id]로 열 수 있게)
    clearCreateDraft(draftOwner);
    draftBaselineRef.current = null;

    /*
     * 앞 몇 쪽 낭독을 미리 구워 둔다 — 열자마자 소리가 나게.
     * 지금은 읽기를 눌러야 그때 합성해서 첫 쪽에서 몇 초 기다리는데, 아이는 그
     * 몇 초를 못 기다린다. 만들기가 끝난 직후엔 부모가 결과를 보고 있으니 그 사이가
     * 굽기 좋은 시간이다.
     *
     * 기다리지 않는다(await 없음) — 완성 화면은 바로 띄우고 뒤에서 조용히 굽는다.
     * 목소리는 책을 열었을 때 실제로 쓰일 것과 같아야 캐시가 맞는다: 부모 목소리가
     * 있으면 그게 기본이므로 그걸로, 없으면 만들 때 고른 성우로 굽는다.
     */
    const selectedParent = narratorVoice.startsWith("parent:")
      ? parentVoices.find((voice) => voice.role === narratorVoice.slice("parent:".length))
      : undefined;
    if (selectedParent) {
      prewarmBookAudio(book.pages, { kind: "parent", voiceId: selectedParent.voiceId });
    } else {
      const preset = findTypecast(narratorVoice);
      if (preset) prewarmBookAudio(book.pages, { kind: "preset", preset });
    }

    setFinalBook(book);
    setStep("done");
  }

  // 완성 → 저장해 둔 책을 뷰어로 보여준다.
  if (step === "done" && finalBook) {
    return <BookViewer book={finalBook} />;
  }

  return (
    <div className="relative min-h-dvh w-full overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={ui.background}
        alt=""
        className="fixed inset-0 -z-10 h-full w-full object-cover"
      />
      <div className="fixed inset-0 -z-10 bg-white/25" />

      {pendingDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-5 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="draft-title">
          <div className="w-full max-w-sm rounded-[28px] bg-white p-6 text-center shadow-2xl">
            <div className="text-4xl" aria-hidden>📝</div>
            <h2 id="draft-title" className="mt-2 text-xl font-extrabold text-neutral-800">
              작성 중이던 동화가 있어요
            </h2>
            <p className="mt-2 break-keep text-sm font-medium leading-relaxed text-neutral-600">
              10분 동안 임시로 보관해 두었어요. 이어서 만들까요?
            </p>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={discardCreateDraft} className="flex-1 rounded-full bg-neutral-100 px-4 py-3 text-sm font-extrabold text-neutral-600">
                새로 시작
              </button>
              <button type="button" onClick={() => restoreCreateDraft(pendingDraft)} className="flex-1 rounded-full px-4 py-3 text-sm font-extrabold text-white shadow" style={{ background: accent }}>
                이어서 만들기
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center px-6 py-8">
        {/* 뒤로 / 홈 — absolute면 스크롤 때 위로 밀려 나가고 카드가 덮어버린다(폰 실측).
            fixed+z-10으로 항상 보이게 (busy 오버레이 z-20보다는 아래라 로딩 중엔 가려진다). */}
        <Link
          href="/"
          className="fixed left-4 top-4 z-10 rounded-full bg-white/70 px-4 py-2 text-sm font-bold text-neutral-700 shadow-md backdrop-blur"
        >
          ← 서재
        </Link>

        {/* 로딩 오버레이 */}
        {busy && (
          <div className="fixed inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/40 backdrop-blur-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ui.mascot}
              alt=""
              className="h-24 w-24 animate-[float_1.5s_ease-in-out_infinite] rounded-full border-4 border-white"
            />
            <p className="text-lg font-extrabold text-white drop-shadow">
              {step === "outline" ? "동화를 그리고 있어요…" : "대본을 쓰고 있어요…"}
            </p>
          </div>
        )}

        <div className="rounded-[28px] bg-white/85 p-7 shadow-xl backdrop-blur">
          {/* ── 1. 아이 정보 ── */}
          {step === "child" && (
            <section className="flex flex-col gap-5">
              <h1 className="break-keep text-center text-2xl font-extrabold text-neutral-800">
                누구의 동화를 만들까요?
              </h1>

              <div>
                <label className="mb-1.5 block text-sm font-bold text-neutral-500">이름</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={20}
                  placeholder="아이 이름"
                  className="w-full rounded-2xl border-2 border-neutral-200 bg-white text-neutral-900 px-4 py-3 text-lg font-bold outline-none focus:border-neutral-400"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-bold text-neutral-500">나이</label>
                <div className="flex flex-wrap items-center gap-2">
                  {AGES.map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setAge(a)}
                      style={age === a ? { background: accent } : undefined}
                      className={`h-12 w-12 rounded-full text-lg font-extrabold transition ${
                        age === a
                          ? "scale-110 text-white shadow"
                          : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                      }`}
                    >
                      {a}
                    </button>
                  ))}
                  {/* 8세 위로는 한 살 단위로 나눌 만큼 글 수준이 달라지지 않는다 —
                      하나로 묶어 목록이 끝없이 길어지지 않게 한다. */}
                  <button
                    type="button"
                    onClick={() => setAge(AGE_OVER)}
                    style={age === AGE_OVER ? { background: accent } : undefined}
                    className={`h-12 rounded-full px-4 text-sm font-extrabold transition ${
                      age === AGE_OVER
                        ? "scale-105 text-white shadow"
                        : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                    }`}
                  >
                    8세 이상
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-bold text-neutral-500">성별</label>
                <div className="flex gap-2">
                  {GENDERS.map((g) => (
                    <button
                      key={g.value}
                      type="button"
                      onClick={() => chooseGender(g.value)}
                      style={gender === g.value ? { background: accent } : undefined}
                      className={`flex flex-1 flex-col items-center gap-1 rounded-2xl py-3 font-bold transition ${
                        gender === g.value
                          ? "text-white shadow"
                          : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                      }`}
                    >
                      <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={g.icon} alt="" className="h-10 w-10 object-contain" />
                      </span>
                      <span className="text-sm">{g.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-2 flex justify-center">
                <BigButton
                  accent={accent}
                  accentDark={accentDark}
                  onClick={() => setStep("theme")}
                  disabled={!name.trim() || age === null}
                >
                  다음 →
                </BigButton>
              </div>
            </section>
          )}

          {/* ── 2. 주제 ── */}
          {step === "theme" && (
            <section className="flex flex-col gap-5">
              <h1 className="break-keep text-center text-2xl font-extrabold text-neutral-800">
                {storyMode === "today"
                  ? `${name}에게 오늘 무슨 일이 있었어요?`
                  : storyMode === "imagine"
                    ? `${name}의 동화, 무슨 이야기로 할까요?`
                    : storyMode === "direct"
                      ? "직접 만든 이야기를 들려주세요"
                    : `${name}의 동화, 어떤 이야기를 만들까요?`}
              </h1>

              {/* 갈래 고르기 — 오늘 겪은 일(실경험)이냐 상상 이야기냐. 둘은 입력 방식이 다르다. */}
              {storyMode === null && (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setStoryMode("today")}
                      className="flex flex-col items-center gap-2 rounded-3xl bg-neutral-100 p-5 transition hover:bg-neutral-200"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/icons/topic-today.webp" alt="" className="h-16 w-16 object-contain" />
                      <b className="text-lg text-neutral-800">오늘의 이야기</b>
                      <span className="text-sm font-bold text-neutral-500">
                        오늘 있었던 일을 동화로
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setStoryMode("imagine")}
                      className="flex flex-col items-center gap-2 rounded-3xl bg-neutral-100 p-5 transition hover:bg-neutral-200"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/icons/topic-imagine.webp" alt="" className="h-16 w-16 object-contain" />
                      <b className="text-lg text-neutral-800">상상 이야기</b>
                      <span className="text-sm font-bold text-neutral-500">
                        공룡 나라·공주님 같은 상상 동화
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setStoryMode("emotion")}
                      className="flex flex-col items-center gap-2 rounded-3xl bg-neutral-100 p-5 transition hover:bg-neutral-200"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/icons/topic-emotion.webp" alt="" className="h-16 w-16 object-contain" />
                      <b className="text-lg text-neutral-800">감정 동화</b>
                      <span className="text-sm font-bold text-neutral-500">
                        아이 마음을 다독이는 동화
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setStoryMode("direct")}
                      className="flex flex-col items-center gap-2 rounded-3xl bg-neutral-100 p-5 transition hover:bg-neutral-200"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/icons/topic-direct.webp" alt="" className="h-16 w-16 object-contain" />
                      <b className="text-lg text-neutral-800">직접 이야기 구성</b>
                      <span className="text-sm font-bold text-neutral-500">
                        기승전결을 쓰거나 완성 원고 붙여넣기
                      </span>
                    </button>
                  </div>
                  <div className="flex justify-center">
                    <BigButton tone="white" onClick={() => setStep("child")}>
                      ← 뒤로
                    </BigButton>
                  </div>
                </>
              )}

              {/* ── 직접 이야기 구성 — 기승전결 안내 작성 또는 완성 원고 ── */}
              {storyMode === "direct" && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setDirectMode("guided")}
                      style={directMode === "guided" ? { background: accent } : undefined}
                      className={`rounded-2xl px-3 py-3 text-sm font-extrabold ${directMode === "guided" ? "text-white shadow" : "bg-neutral-100 text-neutral-600"}`}
                    >
                      🧩 기승전결 안내 작성
                    </button>
                    <button
                      type="button"
                      onClick={() => setDirectMode("full")}
                      style={directMode === "full" ? { background: accent } : undefined}
                      className={`rounded-2xl px-3 py-3 text-sm font-extrabold ${directMode === "full" ? "text-white shadow" : "bg-neutral-100 text-neutral-600"}`}
                    >
                      📄 완성 원고 붙여넣기
                    </button>
                  </div>

                  {directMode === "guided" ? (
                    <div className="flex flex-col gap-3">
                      {[
                        { key: "기 · 시작", hint: "누가 어디에서 무엇을 하고 있었나요?", value: directOpening, set: setDirectOpening },
                        { key: "승 · 전개", hint: "어떤 사건이나 만남이 생겼나요?", value: directDevelopment, set: setDirectDevelopment },
                        { key: "전 · 위기", hint: "주인공이 해결해야 할 어려움은 무엇인가요?", value: directCrisis, set: setDirectCrisis },
                        { key: "결 · 결말", hint: "어떻게 해결되고 어떤 마음이 남았나요?", value: directEnding, set: setDirectEnding },
                      ].map((part) => (
                        <label key={part.key} className="block">
                          <span className="mb-1 block text-sm font-extrabold text-neutral-700">{part.key}</span>
                          <textarea
                            value={part.value}
                            onChange={(event) => part.set(event.target.value.slice(0, 800))}
                            rows={2}
                            placeholder={part.hint}
                            className="w-full rounded-2xl border-2 border-neutral-200 bg-white text-neutral-900 px-4 py-3 text-sm font-bold leading-relaxed outline-none focus:border-neutral-400"
                          />
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <p className="text-xs font-bold text-neutral-500">
                        작성한 사건·인물·결말은 바꾸지 않고 맞춤법, 문장 길이와 페이지 구분만 다듬어요.
                      </p>
                      <div className="flex justify-center"><VoiceInput onResult={setDirectText} /></div>
                      <textarea
                        value={directText}
                        onChange={(event) => setDirectText(event.target.value.slice(0, 5000))}
                        rows={10}
                        placeholder="완성한 이야기를 여기에 적거나 붙여넣어 주세요."
                        className="w-full rounded-2xl border-2 border-neutral-200 bg-white text-neutral-900 px-4 py-3 text-sm font-bold leading-relaxed outline-none focus:border-neutral-400"
                      />
                      <p className="text-right text-[11px] font-bold text-neutral-400">{directText.length} / 5000자</p>
                    </div>
                  )}

                  {/*
                    * 직접 쓴 이야기에도 등장인물의 성별을 받는다.
                    *
                    * 글에 이름은 적혀 있으니 누가 나오는지는 알아낸다. 그런데 성별은
                    * 이름만으로 알 수 없어서, 예전에 남자 친구가 여자로 그려졌다.
                    * (그래서 다른 갈래에는 이미 이 칸이 있는데 여기만 빠져 있었다.)
                    */}
                  <div className="rounded-2xl bg-neutral-50 px-4 py-3">
                    <p className="mb-1.5 break-keep text-xs font-bold text-neutral-500">
                      이야기에 친구가 나오나요? 이름과 성별을 알려 주시면 그림에서 헷갈리지 않아요.
                    </p>
                    <FriendsInput friends={friends} onChange={setFriends} accent={accent} />
                  </div>

                  <div className={`rounded-2xl px-4 py-3 text-sm font-bold leading-relaxed ${directFeedback.length > 0 ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>
                    {directFeedback.length > 0 ? (
                      <ul className="list-inside list-disc space-y-1">
                        {directFeedback.map((feedback) => <li key={feedback}>{feedback}</li>)}
                      </ul>
                    ) : (
                      <p>✅ 이야기의 기본 흐름이 준비됐어요. 다음 단계에서 페이지별 장면으로 나눠 드릴게요.</p>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap justify-center gap-3">
                    <BigButton tone="white" onClick={() => setStoryMode(null)}>← 뒤로</BigButton>
                    <BigButton accent={accent} accentDark={accentDark} onClick={() => setStep("style")} disabled={!directReady}>
                      다음 →
                    </BigButton>
                  </div>
                </>
              )}

              {/* ── 오늘의 이야기 — 유도 질문(어디·누구·무슨일·기분) ── */}
              {storyMode === "today" && (
                <>
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-bold text-neutral-400">어디에서 있었던 일이에요?</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {TODAY_PLACES.map((it) => (
                        <button
                          key={it.t}
                          type="button"
                          onClick={() => setPlace(place === it.t ? "" : it.t)}
                          style={place === it.t ? { background: accent } : undefined}
                          className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold transition ${
                            place === it.t ? "text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                          }`}
                        >
                          <ChipIcon emoji={it.e} icon={(it as { icon?: string }).icon} />
                          {it.t}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-bold text-neutral-400">누구랑 있었어요?</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {todayWho.map((it) => (
                        <button
                          key={it.t}
                          type="button"
                          onClick={() => chooseWho(it.t)}
                          style={who === it.t ? { background: accent } : undefined}
                          className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold transition ${
                            who === it.t ? "text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                          }`}
                        >
                          <ChipIcon emoji={it.e} icon={(it as { icon?: string }).icon} />
                          {it.t}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 무슨 일 — 여기만 자유롭게. 말로도 글로도 받는다 (실경험의 핵심). */}
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-bold text-neutral-400">
                      어떤 일이 있었어요? <span className="font-medium">(말로 해도 돼요)</span>
                    </p>
                    <div className="flex justify-center py-1">
                      <VoiceInput onResult={(t) => setTodayEvent(t)} />
                    </div>
                    <textarea
                      value={todayEvent}
                      onChange={(e) => setTodayEvent(e.target.value.slice(0, 200))}
                      rows={2}
                      placeholder="예: 그네를 타다가 넘어졌는데 친구가 일으켜 줬어요"
                      className="w-full rounded-2xl border-2 border-neutral-200 bg-white text-neutral-900 px-4 py-3 text-base font-bold outline-none focus:border-neutral-400"
                    />
                  </div>

                  <WhoNameInput
                    who={who}
                    value={whoName}
                    onChange={setWhoName}
                    gender={whoGender}
                    onGenderChange={setWhoGender}
                    friends={friends}
                    onFriendsChange={setFriends}
                    accent={accent}
                  />

                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-bold text-neutral-400">그때 기분이 어땠어요?</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {FEELINGS.map((it) => (
                        <button
                          key={it.t}
                          type="button"
                          onClick={() => setFeeling(feeling === it.t ? "" : it.t)}
                          style={feeling === it.t ? { background: accent } : undefined}
                          className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold transition ${
                            feeling === it.t ? "text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                          }`}
                        >
                          <ChipIcon emoji={it.e} icon={(it as { icon?: string }).icon} />
                          {it.t}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 어떻게 끝났나 — 이게 있어야 실제와 다른 결말(혼난 일을 칭찬으로 등)이 안 나온다. */}
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-bold text-neutral-400">
                      일이 어떻게 끝났어요? <span className="font-medium">(선택)</span>
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {TODAY_ENDINGS.map((it) => (
                        <button
                          key={it.t}
                          type="button"
                          onClick={() => setEnding(ending === it.t ? "" : it.t)}
                          style={ending === it.t ? { background: accent } : undefined}
                          className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold transition ${
                            ending === it.t ? "text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                          }`}
                        >
                          <ChipIcon emoji={it.e} icon={(it as { icon?: string }).icon} />
                          {it.t}
                        </button>
                      ))}
                    </div>
                  </div>

                  {seed && (
                    <p className="rounded-2xl bg-neutral-50 px-4 py-2.5 text-center text-sm font-bold text-neutral-500">
                      🌱 {name.trim() || "우리 아이"}의 오늘 이야기 — <span className="text-neutral-800">{seed}</span>
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap justify-center gap-3">
                    <BigButton tone="white" onClick={() => setStoryMode(null)}>
                      ← 뒤로
                    </BigButton>
                    <BigButton accent={accent} accentDark={accentDark} onClick={() => setStep("style")} disabled={!seed}>
                      다음 →
                    </BigButton>
                  </div>
                </>
              )}

              {/* ── 감정 동화 — 어떤 마음·언제 그랬나(선택)·누구랑(선택) ── */}
              {storyMode === "emotion" && (
                <>
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-bold text-neutral-400">어떤 마음이 들었어요?</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {EMOTIONS.map((it) => (
                        <button
                          key={it.t}
                          type="button"
                          onClick={() => setEmotion(emotion === it.t ? "" : it.t)}
                          style={emotion === it.t ? { background: accent } : undefined}
                          className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold transition ${
                            emotion === it.t ? "text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                          }`}
                        >
                          <ChipIcon emoji={it.e} icon={(it as { icon?: string }).icon} />
                          {it.t}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 언제 그런 마음이 들었나 — 상황을 자유롭게. 감정에 맥락을 준다. */}
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-bold text-neutral-400">
                      언제 그런 마음이 들었어요? <span className="font-medium">(선택, 말로도 돼요)</span>
                    </p>
                    {/* 흔한 상황 칩 — 누르면 아래 칸에 채워지고, 그대로 쓰거나 고쳐도 된다(백지 공포 제거). */}
                    <div className="flex flex-wrap justify-center gap-2">
                      {EMOTION_TIMES.map((it) => (
                        <button
                          key={it.t}
                          type="button"
                          onClick={() => setSituation(situation === it.t ? "" : it.t)}
                          style={situation === it.t ? { background: accent } : undefined}
                          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                            situation === it.t ? "text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                          }`}
                        >
                          <span className="text-sm leading-none">{it.e}</span>
                          {it.t}
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-center py-1">
                      <VoiceInput onResult={(t) => setSituation(t)} />
                    </div>
                    <textarea
                      value={situation}
                      onChange={(e) => setSituation(e.target.value.slice(0, 200))}
                      rows={2}
                      placeholder="예: 동생이 내 장난감을 가져갔을 때"
                      className="w-full rounded-2xl border-2 border-neutral-200 bg-white text-neutral-900 px-4 py-3 text-base font-bold outline-none focus:border-neutral-400"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-bold text-neutral-400">
                      누구랑 있었어요? <span className="font-medium">(선택)</span>
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {todayWho.map((it) => (
                        <button
                          key={it.t}
                          type="button"
                          onClick={() => chooseWho(it.t)}
                          style={who === it.t ? { background: accent } : undefined}
                          className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold transition ${
                            who === it.t ? "text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                          }`}
                        >
                          <ChipIcon emoji={it.e} icon={(it as { icon?: string }).icon} />
                          {it.t}
                        </button>
                      ))}
                    </div>
                  </div>

                  <WhoNameInput
                    who={who}
                    value={whoName}
                    onChange={setWhoName}
                    gender={whoGender}
                    onGenderChange={setWhoGender}
                    friends={friends}
                    onFriendsChange={setFriends}
                    accent={accent}
                  />

                  {seed && (
                    <p className="rounded-2xl bg-neutral-50 px-4 py-2.5 text-center text-sm font-bold text-neutral-500">
                      🌱 {name.trim() || "우리 아이"}의 마음 이야기 — <span className="text-neutral-800">{seed}</span>
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap justify-center gap-3">
                    <BigButton tone="white" onClick={() => setStoryMode(null)}>
                      ← 뒤로
                    </BigButton>
                    <BigButton accent={accent} accentDark={accentDark} onClick={() => setStep("style")} disabled={!seed}>
                      다음 →
                    </BigButton>
                  </div>
                </>
              )}

              {/* ── 상상 이야기 — 갈래 카드 + 세부 칩 + 누구랑·무슨일 ── */}
              {storyMode === "imagine" && (
                <>
                  <div className="grid grid-cols-3 gap-2.5">
                    {THEME_GROUPS.map((group) => {
                      const active = themeGroup === group.label;
                      return (
                        <button
                          key={group.label}
                          type="button"
                          onClick={() => setThemeGroup(active ? null : group.label)}
                          aria-pressed={active}
                          style={active ? { background: accent } : undefined}
                          className={`flex flex-col items-center gap-1.5 rounded-2xl py-3 font-bold transition ${
                            active
                              ? "text-white shadow"
                              : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                          }`}
                        >
                          <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={group.icon} alt="" className="h-14 w-14 object-contain" />
                          </span>
                          <span className="break-keep text-center text-[13px] leading-tight">{group.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {(() => {
                    const group = THEME_GROUPS.find((g) => g.label === themeGroup);
                    if (!group) {
                      return (
                        <p className="text-center text-sm font-bold text-neutral-400">
                          👆 카드를 눌러 골라보세요
                        </p>
                      );
                    }
                    return (
                      <div className="flex flex-wrap justify-center gap-2">
                        {group.items.map((it) => (
                          <button
                            key={it.t}
                            type="button"
                            onClick={() => setTheme(it.t)}
                            style={theme === it.t ? { background: accent } : undefined}
                            className={`flex items-center gap-1.5 rounded-full px-4 py-2.5 text-[15px] font-bold transition ${
                              theme === it.t
                                ? "text-white"
                                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                            }`}
                          >
                            <span className="text-lg leading-none">{it.e}</span>
                            {it.t}
                          </button>
                        ))}
                      </div>
                    );
                  })()}

                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-bold text-neutral-400">누구랑 함께할까요?</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {imagineWho.map((it) => (
                        <button
                          key={it.t}
                          type="button"
                          onClick={() => chooseWho(it.t)}
                          style={who === it.t ? { background: accent } : undefined}
                          className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold transition ${
                            who === it.t ? "text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                          }`}
                        >
                          <ChipIcon emoji={it.e} icon={(it as { icon?: string }).icon} />
                          {it.t}
                        </button>
                      ))}
                    </div>
                  </div>

                  <WhoNameInput
                    who={who}
                    value={whoName}
                    onChange={setWhoName}
                    gender={whoGender}
                    onGenderChange={setWhoGender}
                    friends={friends}
                    onFriendsChange={setFriends}
                    accent={accent}
                  />

                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-bold text-neutral-400">무슨 일이 생길까요?</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {HAPPENING_OPTIONS.map((it) => (
                        <button
                          key={it.t}
                          type="button"
                          onClick={() => setHappening(happening === it.t ? "" : it.t)}
                          style={happening === it.t ? { background: accent } : undefined}
                          className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold transition ${
                            happening === it.t ? "text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                          }`}
                        >
                          <ChipIcon emoji={it.e} icon={(it as { icon?: string }).icon} />
                          {it.t}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-1.5 text-xs font-bold text-neutral-400">
                      더 넣고 싶은 이야기가 있나요? <span className="font-medium">(선택)</span>
                    </p>
                    <input
                      value={extra}
                      onChange={(e) => setExtra(e.target.value)}
                      maxLength={200}
                      placeholder={(
                        THEME_GROUPS.find((g) => g.label === themeGroup)?.example ??
                        "예: 마법 숲에서 반짝이는 보물을 찾아요"
                      ).replace("OO", name.trim() || "우리 아이")}
                      className="w-full rounded-2xl border-2 border-neutral-200 bg-white text-neutral-900 px-4 py-3 text-base font-bold outline-none focus:border-neutral-400"
                    />
                  </div>

                  {seed && (
                    <p className="rounded-2xl bg-neutral-50 px-4 py-2.5 text-center text-sm font-bold text-neutral-500">
                      🌱 {name.trim() || "우리 아이"}의 <span className="text-neutral-800">{seed}</span> 이야기
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap justify-center gap-3">
                    <BigButton tone="white" onClick={() => setStoryMode(null)}>
                      ← 뒤로
                    </BigButton>
                    <BigButton accent={accent} accentDark={accentDark} onClick={() => setStep("style")} disabled={!seed}>
                      다음 →
                    </BigButton>
                  </div>
                </>
              )}
            </section>
          )}

          {/* ── 3. 그림체 + 화면 모양 + 특별한 날 ── */}
          {step === "style" && (
            <section className="flex flex-col gap-5">
              <h1 className="break-keep text-center text-2xl font-extrabold text-neutral-800">
                어떤 그림으로 그릴까요?
              </h1>

              <div className="grid grid-cols-3 gap-2.5">
                {ART_STYLES.map((s) => {
                  const active = artStyle === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setArtStyle(s.id)}
                      aria-pressed={active}
                      style={active ? { borderColor: accent, background: accentSoft } : undefined}
                      className={`flex flex-col items-center gap-1.5 rounded-2xl border-[3px] p-2.5 transition ${
                        active
                          ? "shadow"
                          : "border-transparent bg-neutral-100 hover:bg-neutral-200"
                      }`}
                    >
                      {s.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={s.image}
                          alt=""
                          className="aspect-square w-full rounded-xl object-cover"
                        />
                      ) : (
                        <span className="flex aspect-square w-full items-center justify-center rounded-xl bg-white text-4xl">
                          {s.emoji}
                        </span>
                      )}
                      <span className="break-keep text-center text-[11px] font-bold leading-tight text-neutral-700">
                        {s.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* 아이가 그린 그림으로 주인공 만들기 — 이 그림이 캐릭터 시트의 원본이 되고,
                  시트가 모든 쪽 삽화의 기준이라 8쪽 내내 그 캐릭터가 나온다. */}
              <div className="flex flex-col items-center gap-2 rounded-3xl bg-neutral-100 px-5 py-4">
                <p className="break-keep text-center text-sm font-extrabold text-neutral-700">
                  🖍️ 아이가 그린 그림으로 주인공을 만들까요? <span className="font-bold text-neutral-400">(선택)</span>
                </p>
                {drawing ? (
                  <div className="flex flex-col items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={drawing}
                      alt="아이가 그린 주인공"
                      className="h-28 w-28 rounded-2xl border-4 border-white object-cover shadow"
                    />
                    <button
                      type="button"
                      onClick={() => setDrawing(null)}
                      className="rounded-full bg-white px-4 py-1.5 text-xs font-extrabold text-neutral-500 shadow-sm transition hover:bg-neutral-50"
                    >
                      ✕ 이 그림 빼기
                    </button>
                  </div>
                ) : (
                  <label className="cursor-pointer rounded-full bg-white px-5 py-2.5 text-sm font-extrabold text-neutral-700 shadow-sm transition hover:bg-neutral-50">
                    {drawingBusy ? "읽는 중…" : "📷 그림 사진 올리기"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void pickDrawing(f);
                        e.target.value = ""; // 같은 파일을 다시 골라도 반응하게
                      }}
                    />
                  </label>
                )}
                <p className="break-keep text-center text-[11px] font-medium leading-relaxed text-neutral-400">
                  아이가 그린 주인공을 사진으로 찍어 올리면, 그 그림을 살려 동화 주인공으로
                  그려줘요. 올린 그림은 캐릭터를 만드는 데만 쓰고 저장하지 않아요.
                </p>
              </div>

              {/* 어느 화면에서 볼지 — 삽화를 그 비율로 그린다. 핸드폰은 세로,
                  태블릿은 가로. 기기에 맞춰 그려야 그림이 화면을 꽉 채운다. */}
              <div className="flex flex-col gap-2">
                <p className="break-keep text-center text-sm font-bold text-neutral-500">
                  어디에서 볼 동화인가요?
                </p>
                <div className="flex flex-wrap justify-center gap-2.5">
                  {(
                    [
                      { id: "phone", label: "핸드폰", hint: "세로 그림", icon: "/icons/shape-phone.webp" },
                      { id: "tablet", label: "태블릿·PC", hint: "가로 그림", icon: "/icons/shape-tablet.webp" },
                    ] as const
                  ).map((o) => {
                    const active = screenShape === o.id;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setScreenShape(o.id)}
                        aria-pressed={active}
                        style={active ? { borderColor: accent, background: accentSoft } : undefined}
                        className={`flex items-center gap-2 rounded-2xl border-[3px] px-4 py-2.5 transition ${
                          active ? "shadow" : "border-transparent bg-neutral-100 hover:bg-neutral-200"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={o.icon} alt="" aria-hidden className="h-9 w-9 shrink-0 object-contain" />
                        <span className="flex flex-col items-start leading-tight">
                          <span className="break-keep text-sm font-extrabold text-neutral-700">
                            {o.label}
                          </span>
                          <span className="break-keep text-[11px] font-bold text-neutral-400">
                            {o.hint}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 장면 수 — 이야기를 몇 쪽으로 나눌지. 나이 추천값을 별로 표시한다.
                  글만 받는 지금은 장수와 상관없이 무료, 삽화를 켜면 장면당 과금. */}
              <div>
                <p className="mb-1.5 text-xs font-bold text-neutral-400">
                  몇 장면으로 만들까요?
                </p>
                <div className="flex flex-wrap gap-2">
                  {PAGE_OPTIONS.map((n) => {
                    const active = pageCount === n;
                    const rec = n === recommendedPages(age);
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setPageCount(n)}
                        style={active ? { background: accent } : undefined}
                        className={`relative h-11 min-w-[3.4rem] rounded-full px-3 text-sm font-extrabold transition ${
                          active
                            ? "scale-105 text-white shadow"
                            : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                        }`}
                      >
                        {n}장
                        {rec && (
                          <span className="absolute -right-1 -top-1.5 text-sm leading-none">
                            ⭐
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[11px] font-medium text-neutral-400">
                  ⭐ {age ?? "우리 아이"}세에게 알맞은 길이예요 · 이 장수면{" "}
                  <b className="text-neutral-600">대본 {scriptCost}개</b>
                  {IMAGES_ENABLED ? ` + 그림 ${imageCost}개` : ""} 토큰이 들어요
                </p>
              </div>

              {/* 이야기 길이 — 쪽수(장면 수)와 별개로, 각 쪽을 얼마나 길게 채울지.
                  장면 수가 적어도 "넉넉하게"를 고르면 각 쪽 분량이 늘어 이야기가 풍성해진다. */}
              <div>
                <p className="mb-1.5 text-xs font-bold text-neutral-400">이야기 길이</p>
                <div className="flex gap-2">
                  {[
                    { v: false, label: "간결하게", desc: "나이에 맞는 기본 분량" },
                    { v: true, label: "넉넉하게", desc: "각 쪽을 더 길고 풍부하게" },
                  ].map((o) => {
                    const active = longerStory === o.v;
                    return (
                      <button
                        key={o.label}
                        type="button"
                        onClick={() => setLongerStory(o.v)}
                        aria-pressed={active}
                        style={active ? { background: accent } : undefined}
                        className={`flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2.5 font-bold transition ${
                          active
                            ? "text-white shadow"
                            : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                        }`}
                      >
                        <span className="text-sm">{o.label}</span>
                        <span className={`text-[10px] font-medium ${active ? "text-white/85" : "text-neutral-400"}`}>
                          {o.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[11px] font-medium text-neutral-400">
                  장면 수가 적어도 ‘넉넉하게’를 고르면 이야기를 더 길게 들려줘요.
                </p>
              </div>

              {/* 낭독 느낌 — 제작할 때 한 번 고른 뒤 페이지별 음성 지시에 박아 둔다.
                  완성된 책에서는 변경 UI를 제공하지 않아 같은 본문을 다른 톤으로 재합성하지 않는다. */}
              <div>
                <p className="mb-1.5 text-xs font-bold text-neutral-400">
                  낭독 느낌 <span className="font-medium">(제작 후 고정)</span>
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: "cozy", icon: "🌙", label: "포근하게", desc: "느리고 편안하게" },
                      { id: "natural", icon: "📖", label: "자연스럽게", desc: "차분한 기본 낭독" },
                      { id: "lively", icon: "✨", label: "조금 신나게", desc: "리듬만 살짝 경쾌하게" },
                    ] as const
                  ).map((option) => {
                    const active = narrationStyle === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setNarrationStyle(option.id)}
                        aria-pressed={active}
                        style={active ? { borderColor: accent, background: accentSoft } : undefined}
                        className={`flex min-w-0 flex-col items-center gap-0.5 rounded-2xl border-[3px] px-2 py-3 text-center transition ${
                          active
                            ? "shadow-sm"
                            : "border-transparent bg-neutral-100 hover:bg-neutral-200"
                        }`}
                      >
                        <span className="text-xl" aria-hidden>{option.icon}</span>
                        <span className="break-keep text-xs font-extrabold text-neutral-700">{option.label}</span>
                        <span className="break-keep text-[10px] font-medium leading-tight text-neutral-400">{option.desc}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 break-keep text-[11px] font-medium leading-relaxed text-neutral-400">
                  처음 만든 음성을 이 기기에 저장해 같은 브라우저에서 다시 들을 때는 추가
                  토큰이 들지 않아요. 부모 목소리는 원래 음색을 지키기 위해 자연스럽게 읽어요.
                </p>
              </div>

              {/* 읽어줄 성우 — 만든 동화에 박아 저장한다(book.narrator). 뷰어가 이 성우로
                  읽어준다. 실시간 합성이 켜지면 만들 때 한 번 구워 재생은 늘 무료가 된다. */}
              <div>
                <p className="mb-1.5 text-xs font-bold text-neutral-400">
                  읽어줄 성우 <span className="font-medium">(눌러서 들어보고 골라요)</span>
                  <span className="text-rose-500"> *</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {parentVoices.map((voice) => {
                    const id = `parent:${voice.role}`;
                    const active = narratorVoice === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => void pickNarrator(id)}
                        aria-pressed={active}
                        style={active ? { background: accent } : undefined}
                        className={`flex items-center gap-1.5 rounded-full py-1.5 pl-2.5 pr-3.5 text-sm font-bold transition ${active ? "text-white" : "bg-amber-100 text-amber-800 hover:bg-amber-200"}`}
                      >
                        <span>{voice.emoji}</span>
                        {voice.label} 목소리
                      </button>
                    );
                  })}
                  {TYPECAST_VOICES.map((v) => {
                    const active = narratorVoice === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => void pickNarrator(v.id)}
                        aria-pressed={active}
                        style={active ? { background: accent } : undefined}
                        className={`flex items-center gap-1.5 rounded-full py-1.5 pl-2.5 pr-3.5 text-sm font-bold transition ${
                          active
                            ? "text-white"
                            : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                        }`}
                      >
                        <span>{v.emoji}</span>
                        {v.label}
                      </button>
                    );
                  })}
                </div>
                {narratorVoice ? (
                  <p className="mt-1.5 text-[11px] font-medium text-neutral-400">
                    {narratorVoice.startsWith("parent:")
                      ? "승인한 부모 목소리로 이 동화를 읽어 줍니다."
                      : TYPECAST_VOICES.find((v) => v.id === narratorVoice)?.desc}
                  </p>
                ) : (
                  // 아직 안 골랐으면 고르라고 한 번 더 안내한다.
                  <p className="mt-1.5 text-[11px] font-bold text-rose-500">
                    🎙️ 함께 동화를 읽어줄 성우를 골라주세요.
                  </p>
                )}
              </div>

              {error && <p className="text-center text-sm font-bold text-red-600">{error}</p>}

              <div className="mt-2 flex flex-wrap justify-center gap-3">
                <BigButton tone="white" onClick={() => setStep("theme")}>
                  ← 뒤로
                </BigButton>
                <BigButton
                  accent={accent}
                  accentDark={accentDark}
                  onClick={() => {
                    // 성우를 안 골랐으면 진행 대신 골라달라고 안내한다.
                    if (!narratorVoice) {
                      setError("함께 동화를 읽어줄 성우를 먼저 골라주세요 🎙️");
                      return;
                    }
                    makeOutline();
                  }}
                >
                  이야기 짓기 ✨
                </BigButton>
              </div>
            </section>
          )}

          {/* ── 5. 그림 그리는 중 ── */}
          {step === "illustrate" && story && (
            <section className="flex flex-col items-center gap-5 py-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={ui.mascot}
                alt=""
                className="h-24 w-24 animate-[float_1.5s_ease-in-out_infinite] rounded-full border-4 border-white shadow-lg"
              />
              <h1 className="break-keep text-center text-2xl font-extrabold text-neutral-800">
                {uploading ? "동화를 책장에 넣고 있어요…" : "동화를 그리고 있어요…"}
              </h1>
              {/* 남은 시간 어림 — 지금까지 그린 속도로 계산한다. 언제 끝날지 알면
                  같은 시간도 훨씬 짧게 느껴진다(피드백 2번). */}
              <p className="break-keep text-center text-sm font-bold text-neutral-500">
                {uploading ? (
                  `그림 ${uploading.done} / ${uploading.total} 장 저장했어요`
                ) : (
                  <>
                    {drawn} / {story.pages.length} 쪽
                    {(() => {
                      void tick; // 1초마다 다시 계산되게 하는 의존값
                      if (drawn === 0 || drawn >= story.pages.length) return "";
                      const perPage = (Date.now() - drawStartRef.current) / drawn;
                      const left = Math.ceil((perPage * (story.pages.length - drawn)) / 1000);
                      return left > 0 ? ` · 약 ${left}초 남았어요` : "";
                    })()}
                  </>
                )}
              </p>
              <div className="h-3 w-full overflow-hidden rounded-full bg-neutral-100">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: uploading
                      ? `${(uploading.done / uploading.total) * 100}%`
                      : `${(drawn / story.pages.length) * 100}%`,
                    background: accent,
                  }}
                />
              </div>
              {/* 닫으면 그때까지 그린 그림이 사라지고 그림 값을 다시 낸다 — 미리 말해 준다. */}
              <p className="break-keep text-center text-[11px] font-medium text-neutral-400">
                이 화면을 닫으면 그리던 그림이 사라져요. 잠깐만 기다려 주세요.
              </p>
              {/* 기다리는 동안 이야기를 먼저 읽는다 — 글은 이미 다 나와 있으니
                  그림을 기다리며 한 쪽씩 보여준다. 빈 화면을 보며 기다리지 않게. */}
              <div className="w-full rounded-3xl bg-white/80 px-5 py-4 shadow-inner">
                <p className="mb-1.5 break-keep text-center text-[11px] font-extrabold tracking-wide text-neutral-400">
                  📖 그림을 기다리는 동안 먼저 읽어보세요
                </p>
                <p className="break-keep text-center text-base font-bold leading-relaxed text-neutral-700">
                  {story.pages[Math.floor(tick / 6) % story.pages.length]?.text}
                </p>
              </div>

              {/* 그려진 쪽 미리보기 — 기다림이 설렘이 되게 */}
              {pageImages.filter(Boolean).length > 0 && (
                <div className="flex flex-wrap justify-center gap-1.5">
                  {pageImages.map((img, i) =>
                    img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={img}
                        alt=""
                        className="h-12 w-16 rounded-md object-cover shadow"
                      />
                    ) : null,
                  )}
                </div>
              )}
            </section>
          )}

          {/* ── 4. 줄거리 확인 ── */}
          {step === "outline" && outline && (
            <section className="flex flex-col gap-4">
              <h1 className="break-keep text-center text-2xl font-extrabold text-neutral-800">
                이 이야기로 만들까요?
              </h1>
              {/* 고치는 자리는 여기다 — 그림도 크레딧도 쓰기 전이라, 마음에 안 드는
                  장면을 지금 고치면 공짜이고 그림이 어긋날 일도 없다.
                  완성된 뒤에 글만 고치면 그림은 그대로라 오히려 어긋난다. */}
              <p className="-mt-2 self-center break-keep rounded-xl bg-white/90 px-4 py-2 text-center text-sm font-bold leading-relaxed text-neutral-700 shadow-sm ring-1 ring-black/5">
                아래 내용이 동화 속 이야기로 표현돼요.<br />
                바꾸고 싶은 부분을 눌러 수정해 주세요.
              </p>
              <div className="rounded-2xl p-5" style={{ background: accentSoft }}>
                {editScene === "title" ? (
                  <div className="flex flex-col gap-2">
                    <input
                      value={sceneDraft}
                      onChange={(e) => setSceneDraft(e.target.value.slice(0, 60))}
                      autoFocus
                      className="w-full rounded-xl border-2 border-neutral-300 bg-white text-neutral-900 px-3 py-2 text-center text-lg font-extrabold outline-none focus:border-neutral-500"
                    />
                    <div className="flex justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditScene(null)}
                        className="rounded-full bg-white/70 px-4 py-1.5 text-xs font-extrabold text-neutral-600"
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        onClick={saveSceneEdit}
                        className="rounded-full bg-neutral-800 px-4 py-1.5 text-xs font-extrabold text-white"
                      >
                        확인
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setSceneDraft(outline.title);
                      setEditScene("title");
                    }}
                    className="w-full rounded-xl px-2 py-1 text-center text-xl font-extrabold text-neutral-800 transition hover:bg-white/50"
                  >
                    {outline.title}
                  </button>
                )}
                <ol className="mt-3 flex flex-col gap-2.5">
                  {outline.scenes.map((s) => (
                    <li key={s.sceneNo} className="flex gap-2.5">
                      <span style={{ background: accent }}
                        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-white">
                        {s.sceneNo}
                      </span>
                      {editScene === s.sceneNo ? (
                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                          <textarea
                            value={sceneDraft}
                            onChange={(e) => setSceneDraft(e.target.value)}
                            rows={3}
                            autoFocus
                            className="w-full resize-y rounded-xl border-2 border-neutral-300 bg-white text-neutral-900 p-2.5 text-sm font-medium leading-relaxed outline-none focus:border-neutral-500"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditScene(null)}
                              className="rounded-full bg-white/70 px-4 py-1.5 text-xs font-extrabold text-neutral-600"
                            >
                              취소
                            </button>
                            <button
                              type="button"
                              onClick={saveSceneEdit}
                              disabled={!sceneDraft.trim()}
                              className="rounded-full bg-neutral-800 px-4 py-1.5 text-xs font-extrabold text-white disabled:opacity-40"
                            >
                              확인
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setSceneDraft(s.text);
                            setEditScene(s.sceneNo);
                          }}
                          className="min-w-0 flex-1 rounded-xl px-2 py-1 text-left text-sm font-medium leading-relaxed text-neutral-700 transition hover:bg-white/50"
                        >
                          {s.text}
                        </button>
                      )}
                    </li>
                  ))}
                </ol>
              </div>

              {error && <p className="text-center text-sm font-bold text-red-600">{error}</p>}

              <div className="mt-1 flex flex-col items-center gap-2">
                {confirmMake ? (
                  <div className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-neutral-200 p-3">
                    <p className="text-sm font-extrabold text-neutral-700">
                      이 줄거리로 대본을 만들까요?
                    </p>
                    <p className="flex items-center justify-center gap-1 break-keep text-center text-[11px] font-medium text-neutral-400">
                      <span aria-hidden className="inline-block shrink-0 rounded-full" style={{ width: 11, height: 11, background: "radial-gradient(circle at 35% 30%, #ffe08a, #e0a020)" }} />
                      {outline.scenes.length}장 ·{" "}
                      {master
                        ? "관리자는 토큰이 들지 않아요"
                        : `지금은 대본 값 ${scriptTokenCost(outline.scenes.length)}개만 나가요 (내 잔액 ${tokens}개). 그림은 대본을 읽어 보고 정해요.`}
                    </p>
                    {bookLimitReached ? (
                      <p className="text-center text-xs font-bold text-red-600">
                        베타에서는 아이디당 최대 {MAX_BOOKS_PER_USER}권까지 만들 수 있어요.
                        <br />설정 › 내 동화에서 지우면 다시 만들 수 있어요.
                      </p>
                    ) : shortOnTokens ? (
                      <p className="text-center text-xs font-bold text-red-600">
                        토큰이 부족해요. 설정에서 충전할 수 있어요.
                      </p>
                    ) : null}
                    <div className="flex flex-wrap justify-center gap-3">
                      <BigButton
                        accent={accent}
                        accentDark={accentDark}
                        onClick={() => {
                          if (shortOnTokens || bookLimitReached) return;
                          setConfirmMake(false);
                          makeStory();
                        }}
                      >
                        네, 만들게요 ✓
                      </BigButton>
                      <BigButton tone="white" onClick={() => setConfirmMake(false)}>
                        아니요
                      </BigButton>
                    </div>
                  </div>
                ) : (
                  <BigButton accent={accent} accentDark={accentDark} onClick={() => setConfirmMake(true)}>
                    {/* 여기서는 글만 짓는다 — 그림은 대본을 읽어 보고 정한다. */}
                    이야기로 대본 구성하기 ✍️
                  </BigButton>
                )}
                <button
                  type="button"
                  onClick={() => makeOutline(true)}
                  disabled={!master && outlineRetries >= MAX_OUTLINE_RETRIES}
                  className="text-sm font-bold text-neutral-500 underline disabled:no-underline disabled:opacity-50"
                >
                  {!master && outlineRetries >= MAX_OUTLINE_RETRIES
                    ? "다시 짓기를 다 썼어요 — 재료를 바꾸면 새로 지을 수 있어요"
                    : `다른 이야기로 다시 짓기 🔄${master ? "" : ` (${MAX_OUTLINE_RETRIES - outlineRetries}번 남음)`}`}
                </button>
                <button
                  type="button"
                  onClick={() => setStep("theme")}
                  className="text-xs font-bold text-neutral-400"
                >
                  ← 주제 바꾸기
                </button>
              </div>
            </section>
          )}

          {/* ── 4.5 완성된 이야기 읽어보기 — 그림(비용의 80%)은 여기서 마음에
              들었을 때만 만든다. 아니면 테마 배경 위 글 동화로 바로 본다. ── */}
          {step === "story" && story && (
            <section className="flex flex-col gap-4">
              <h1 className="break-keep text-center text-2xl font-extrabold text-neutral-800">
                대본이 완성됐어요!
              </h1>
              <p className="-mt-2 break-keep text-center text-xs font-medium text-neutral-400">
                그림은 아직 그리지 않았어요. 문장을 눌러 마음에 들게 고친 뒤,
                <br />그 글 그대로 그림을 그려요.
              </p>
              <div className="rounded-2xl p-5" style={{ background: accentSoft }}>
                {/* 제목도 눌러서 고친다 — 책장에서 제일 먼저 보이는 것이 제목이다. */}
                {editingTitle ? (
                  <div className="flex flex-col gap-2">
                    <input
                      autoFocus
                      value={titleDraft}
                      onChange={(e) => setTitleDraft(e.target.value.slice(0, 40))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveTitle();
                        if (e.key === "Escape") setEditingTitle(false);
                      }}
                      className="w-full rounded-xl border-2 border-white bg-white/90 px-3 py-2 text-center text-xl font-extrabold text-neutral-800 outline-none"
                    />
                    <div className="flex justify-center gap-2">
                      <button
                        type="button"
                        onClick={saveTitle}
                        style={{ background: accent }}
                        className="rounded-full px-4 py-1.5 text-xs font-extrabold text-white"
                      >
                        확인
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingTitle(false)}
                        className="rounded-full bg-white px-4 py-1.5 text-xs font-extrabold text-neutral-500"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setTitleDraft(story.title);
                      setEditingTitle(true);
                    }}
                    className="mx-auto flex w-full items-center justify-center gap-1.5 rounded-xl px-2 py-1 text-center transition-colors hover:bg-white/50"
                  >
                    <span className="break-keep text-xl font-extrabold text-neutral-800">
                      {story.title}
                    </span>
                    <span className="shrink-0 text-[11px] font-bold text-neutral-400 underline">
                      고치기
                    </span>
                  </button>
                )}
                {/* 쪽별로 나눠 보여준다 — 책이 어떻게 넘어갈지 그대로 보인다.
                    문장을 누르면 그 자리에서 고칠 수 있다(그림은 고친 글을 보고 그린다). */}
                <ol className="mt-4 flex max-h-[42dvh] flex-col gap-3 overflow-y-auto pr-1">
                  {story.pages.map((p, pageIndex) => (
                    <li key={p.pageNo} className="flex gap-2.5">
                      <span
                        style={{ background: accent }}
                        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-white"
                      >
                        {p.pageNo}
                      </span>
                      {editingPage === pageIndex ? (
                        <div className="flex flex-1 flex-col gap-2">
                          <textarea
                            autoFocus
                            rows={4}
                            value={pageDraft}
                            onChange={(e) => setPageDraft(e.target.value.slice(0, 400))}
                            className="w-full rounded-xl border-2 border-white bg-white/90 p-3 text-sm font-medium leading-relaxed text-neutral-700 outline-none"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => savePageText(pageIndex)}
                              style={{ background: accent }}
                              className="rounded-full px-4 py-1.5 text-xs font-extrabold text-white"
                            >
                              확인
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingPage(null)}
                              className="rounded-full bg-white px-4 py-1.5 text-xs font-extrabold text-neutral-500"
                            >
                              취소
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPage(pageIndex);
                            setPageDraft(p.text);
                          }}
                          className="flex-1 rounded-xl px-2 py-1 text-left text-sm font-medium leading-relaxed text-neutral-700 transition-colors hover:bg-white/60"
                        >
                          {p.text}
                          <span className="ml-1.5 whitespace-nowrap text-[11px] font-bold text-neutral-400 underline">
                            고치기
                          </span>
                        </button>
                      )}
                    </li>
                  ))}
                </ol>
              </div>

              {/*
                * 장소 다듬기 — 그림이 쪽마다 다른 곳처럼 보이는 문제의 실질적인 해결책.
                *
                * 인물은 캐릭터 그림 한 장이 기준을 잡아 주는데, 장소는 그런 게 없어서
                * 모델이 쪽마다 "계곡"을 새로 상상한다. 부모가 아이가 실제로 아는 곳을
                * 한 줄 적어 주면 모든 쪽이 같은 곳을 그린다. 안 적어도 그만이다.
                */}
              {IMAGES_ENABLED && (
                <div className="rounded-2xl border-2 border-neutral-100 bg-white p-4">
                  <label
                    htmlFor="location-detail"
                    className="block break-keep text-sm font-extrabold text-neutral-700"
                  >
                    그림 속 장소나 물건을 좀 더 알려 주실래요?{" "}
                    <span className="font-bold text-neutral-400">(안 쓰셔도 돼요)</span>
                  </label>
                  <input
                    id="location-detail"
                    value={locationDetail}
                    onChange={(e) => {
                      locationTouchedRef.current = true;
                      setLocationDetail(e.target.value.slice(0, 120));
                    }}
                    placeholder="예: 계곡은 회색 자갈 바닥에 넓적한 바위 하나, 아이스크림은 분홍색 한 덩이"
                    className="mt-2 w-full rounded-xl border-2 border-neutral-100 bg-neutral-50 px-3 py-2.5 text-sm font-medium text-neutral-700 outline-none placeholder:text-neutral-300 focus:border-neutral-200"
                  />
                  <p className="mt-1.5 break-keep text-[11px] font-medium text-neutral-400">
                    {locationDetail && !locationTouchedRef.current
                      ? "이야기에서 뽑아 미리 적어 뒀어요. 마음에 안 들면 고치셔도 돼요."
                      : "장소는 자세히, 물건은 단순하게 적어 주시면 모든 쪽이 같아 보여요."}
                  </p>
                </div>
              )}

              {error && <p className="text-center text-sm font-bold text-red-600">{error}</p>}

              <div className="mt-1 flex flex-col items-center gap-2">
                <div className="flex flex-wrap justify-center gap-3">
                  {IMAGES_ENABLED && (
                    <BigButton
                      accent={accent}
                      accentDark={accentDark}
                      disabled={shortOnImageTokens}
                      onClick={() => {
                        if (shortOnImageTokens) return;
                        illustrate(story);
                      }}
                    >
                      이 글로 그림 그리기 🎨
                    </BigButton>
                  )}
                  {/*
                    * 글만 있는 동화로 끝내는 길은 내지 않는다.
                    *
                    * 그림 그리기 버튼 바로 옆에 있어서 잘못 눌러 그림 없는 책이
                    * 만들어졌다(실제로 겪었다). 이 앱은 그림동화를 만들러 오는 곳이고,
                    * 글만 남은 책을 원하는 사람은 사실상 없다.
                    * 그림을 아예 끈 상태(IMAGES_ENABLED=false)에서만 이 길이 유일하므로
                    * 그때는 그대로 낸다.
                    */}
                  {!IMAGES_ENABLED && (
                    <BigButton accent={accent} accentDark={accentDark} onClick={() => finish([])}>
                      이 이야기로 동화 보기 📖
                    </BigButton>
                  )}
                </div>
                {IMAGES_ENABLED &&
                  (shortOnImageTokens ? (
                    <p className="break-keep text-center text-xs font-bold text-red-600">
                      그림을 그리려면 토큰 {illustrationTokenCost(story.pages.length)}개가 더 필요해요
                      (내 잔액 {tokens}개).
                      <br />
                      <span className="font-medium text-neutral-500">
                        이 이야기는 이레 동안 보관돼요. 충전한 뒤에 이어서 그리시면 돼요.
                      </span>
                    </p>
                  ) : (
                    <p className="break-keep text-center text-[11px] font-medium text-neutral-400">
                      {master
                        ? "관리자는 토큰이 들지 않아요"
                        : `그림을 그리면 토큰 ${illustrationTokenCost(story.pages.length)}개가 더 들어요 (내 잔액 ${tokens}개)`}
                      <br />그림은 1~2분 정도 걸려요
                    </p>
                  ))}
                {/*
                  * 다시 쓰기는 토큰을 더 받지 않는다(대본 값은 이미 냈다). 그래서 횟수로
                  * 막는다 — 안 그러면 무한정 다시 쓸 수 있고, 값은 우리가 문다.
                  */}
                <button
                  type="button"
                  onClick={makeStory}
                  disabled={!master && storyRewrites >= MAX_STORY_REWRITES}
                  className="text-xs font-bold text-neutral-400 underline disabled:no-underline disabled:opacity-50"
                >
                  {!master && storyRewrites >= MAX_STORY_REWRITES
                    ? "다시 쓰기를 모두 썼어요"
                    : `같은 줄거리로 다시 쓰기 🔄${master ? "" : ` (${MAX_STORY_REWRITES - storyRewrites}번 남음)`}`}
                </button>
                {/*
                  * 처음부터 다시 가는 길 — 이게 없으면 대본이 통째로 마음에 안 들 때
                  * 갇힌다(다시 쓰기는 같은 줄거리 안에서만 돈다).
                  * 다만 이야기 값은 이미 냈으니, 버리기 전에 반드시 물어본다.
                  */}
                <button
                  type="button"
                  onClick={() => {
                    if (
                      !master &&
                      !window.confirm(
                        `지금 이야기를 버리고 재료부터 새로 만들까요?\n이미 낸 이야기 값 ${scriptTokenCost(story.pages.length)}개는 돌려받을 수 없어요.`,
                      )
                    ) {
                      return;
                    }
                    setStory(null);
                    setOutline(null);
                    setScriptCharged(false);
                    setStoryRewrites(0);
                    setOutlineRetries(0);
                    setLocationDetail("");
                    locationTouchedRef.current = false;
                    setEditingPage(null);
                    setEditingTitle(false);
                    setError("");
                    setStep("theme");
                  }}
                  className="text-xs font-bold text-neutral-400"
                >
                  ← 재료 바꿔 새로 만들기
                </button>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
