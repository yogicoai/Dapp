"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BookViewer } from "@/components/BookViewer";
import { WaitShowcase } from "@/components/WaitShowcase";
import classicBooksJson from "@/data/classic-books.json";
import folkBooksJson from "@/data/folk-books.json";
import { useTheme } from "@/components/ThemeProvider";
import { VoiceGlyph } from "@/components/VoiceGlyph";
import { VoiceInput } from "@/components/VoiceInput";
import { QuestionFlow, type FlowOption, type FlowPos, type FlowQuestion } from "@/components/create/QuestionFlow";
import { ChargeConfirm } from "@/components/create/ChargeConfirm";
import { MakeSteps } from "@/components/create/MakeSteps";
import {
  BestFriendChip,
  bestFriendEntry,
  hasBestFriendInfo,
  isBestFriendIn,
} from "@/components/create/BestFriendChip";
import { ART_STYLES } from "@/lib/art-styles";
import { bestFriend, heightFor, type FamilyMember } from "@/lib/family";
import { castPortraits } from "@/lib/family-cast";
import { loadSession, spendTokens, spendTokensEntry } from "@/lib/auth";
import { authedFetch, currentUid, getSupabase } from "@/lib/supabase";
import {
  capFailures,
  chargeProblem,
  cloneJob,
  insertJob,
  isEmbeddedImage,
  isJobId,
  jobWriteProblem,
  judgeSpendAfterError,
  looksNetworkish,
  planFromJob,
  readJob,
  readJobResult,
  readPaidMarker,
  readRecentIllustrationLedger,
  recoverFromChargeRefusal,
  storyManuscript,
  stripEmbeddedArt,
  updateJob,
  waitAtMost,
  type DrawingNow,
  type JobFailure,
  type PaidMarker,
} from "@/lib/book-jobs";
import {
  loadChild,
  loadChildRemote,
  AGES,
  AGE_OVER,
  countMyBooks,
  looksToPrompt,
  parentLooksToPrompt,
  saveChild,
  saveMyBook,
} from "@/lib/prefs";
import { looksToDrawingPrompt } from "@/lib/child-looks";
import { heroFromStory, schoolBusPlaceKeys } from "@/lib/illustration-rules";
import { locationKeyOf, sheetMatchesKey } from "@/lib/story-quality";
import { tidyPunctuation } from "@/lib/story-punctuation";
import { pickLocationDetail } from "@/lib/scene-edit";
import {
  EMPTY_COUNTS,
  clearDrawProgress,
  describeDrawCounts,
  drawProgressKey,
  loadDrawProgress,
  saveDrawProgress,
  type DrawCounts,
} from "@/lib/draw-progress";
import { rewriteScene, suggestLocationDetail } from "@/lib/scene-edit";
import { illustrationCost, scriptCost as scriptCostOf } from "@/lib/pricing";
import {
  isRedoExhausted,
  makeScriptBlock,
  paidPlot,
  redoLeft,
  restorePaidOutline,
  restorePendingPlot,
  resumeStep,
  reusablePlot,
  type PendingPlot,
} from "@/lib/create-flow";
import { useEscClose } from "@/lib/use-esc-close";
import { usePricing } from "@/lib/use-pricing";
import { useScreenWakeLock } from "@/lib/use-wake-lock";
import { alertIfAway, primeChime } from "@/lib/away-notice";
import {
  busyWaitText,
  drawNotice,
  drawProgressLine,
  formatUsual,
  noticeFor,
  noticeText,
  pickShowcaseBooks,
  uploadLine,
  usualWaitSec,
  waitLine,
  type BusyKind,
  type NoticeKind,
  type NoticeState,
  type ScriptStage,
} from "@/lib/waiting";
import { asBooks } from "@/lib/types";
import type { Book, NarrationStyle, VoiceDirection } from "@/lib/types";
import { fetchTypecastVoiceAudio, findTypecast, NARRATOR_PRESETS, prewarmBookAudio, TYPECAST_VOICES } from "@/lib/voices";
import { loadParentVoices, PARENT_VOICE_TEST_TEXT, type ParentVoice } from "@/lib/parent-voice";

type Gender = "girl" | "boy" | "unspecified";
type Scene = { sceneNo: number; text: string };
type Outline = { title: string; summary: string; scenes: Scene[] };
type StoryPage = { pageNo: number; text: string; imagePrompt: string; voiceDirection: VoiceDirection };
/** outfit — 이 책의 옷(@@CHARACTER@@ 셋째 칸, 2026-09-29 저녁~). 옛 대본엔 없다. */
type Character = { name: string; description: string; outfit?: string };
type Story = { title: string; summary: string; characters: Character[]; pages: StoryPage[] };
type StoryMode = "today" | "imagine" | "emotion" | "direct";

/*
 * 줄거리 확인 단계("outline")는 2026-09-29 없앴다(사장님: "너무 과정 과정이 길어지는 것 같아서").
 * 성우 화면의 '대본 만들기' 한 번에 줄거리를 짓고 대본까지 쓴다(makeScript). 줄거리는 이제 화면에 따로 안 보이고,
 * 고치는 곳은 대본 화면 하나다. 옛 임시저장의 "outline" 은 되살릴 때 resumeStep 이 다른 단계로 바꾼다.
 */
type Step = "child" | "theme" | "style" | "story" | "illustrate" | "done";

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
 * '직접 입력' 칩 — 어디서·누구랑 장 맨 끝에 붙는다(2026-09-28 사장님: 보기에 없는 곳·사람도 적게).
 * 누르면 그 장에 짧은 글 칸이 열리고, 적은 글이 칩을 고른 것과 똑같이 place·who 값이 된다.
 * 누르고 바로 넘기지 않는다(holdOn) — 적고 나서 '다음'을 누른다.
 * 값으로 쓰이지 않는 보기라 place·who 에 "직접 입력"이 들어가는 일은 없다.
 */
const OWN_INPUT: FlowOption = { t: "직접 입력", e: "✏️" };

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

/*
 * 「상상 동화」·「감정 동화」의 바라는 마무리 칩(WISH_ENDINGS)은 2026-09-28 질문과 함께 뺐다 —
 * 답이 서버로 가지 않고 있었다. 자세한 사정과 되살리는 법은 storyQuestions 의 상상 이야기 주석.
 */

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

/** 장면 지시의 `장소: 이름 — 특징.`을 읽는다. 없으면 null. */
function locationOfImagePrompt(prompt: string): { name: string; description: string } | null {
  const match = /장소\s*:\s*([^\n—.-]+?)\s*[—-]\s*([^\n.]+)/.exec(prompt ?? "");
  return match ? { name: match[1].trim(), description: match[2].trim() } : null;
}

/**
 * 장소를 묶는 열쇠 — 이름 글자가 아니라 계열로.
 * "놀이터"·"동네 놀이터"·"아파트 놀이터"가 셋 다 다른 키가 되어 각자 첫 그림을 새로
 * 상상하던 문제를 막는다.
 */
function locationKeyFromImagePrompt(prompt: string): string {
  const location = locationOfImagePrompt(prompt);
  return location ? locationKeyOf(location.name) : "";
}

/** 만들 때 그린 장소 기준 그림 한 장. */
type LocationSheet = { key: string; name: string; description: string; image: string; onePlace?: boolean };
/** 시트에 원본이 선 고정 가족 한 사람 — 쪽 그림 서버가 주소를 다시 검사한다(api/illustrate-page). */
type SheetPortraitRef = { name: string; ref: string; memberId: string };
/** 쪽 그림 한 장의 응답(api/illustrate-page) */
type PageImageReply = {
  ok: boolean;
  status: number;
  data: {
    image?: string;
    error?: string;
    code?: string;
    qualityChecked?: boolean;
    qualityPassed?: boolean;
    qualityWarning?: string;
    qualityIssue?: "text" | "border" | "other";
  };
};

/**
 * 장면(쪽) 수는 5로 고정한다 (사장님 결정, 2026-09-08. 그전엔 6이었다).
 *
 * 왜 고정인가 — 예전엔 3~8 가운데 고르게 했다. 쪽수가 곧 그림 장수(=크레딧)라,
 * 장수를 고르게 두면 책마다 값이 달라져 크레딧을 셈하고 안내하기가 어려워진다.
 * 한 권이 늘 같은 값이면 부모도 우리도 헷갈리지 않는다.
 *
 * 왜 6에서 5로 — 6장이면 그리다 실패하는 일이 잦았다(사장님). 그림 한 장은 표지도
 * 캐릭터 시트도 아닌 본문 한 쪽이고, 한 권에 시트까지 더하면 요청이 8~9번 나간다.
 * 장수를 줄이면 한 권을 만드는 동안 429(몰림)에 걸릴 자리가 그만큼 줄고, 한 장이
 * 끝내 실패했을 때 책에서 비는 비율도 준다. 값도 한 권 12토큰에서 10토큰으로 내려간다.
 *
 * 길이 조절은 '넉넉하게' 스위치로 한다 — 쪽수가 아니라 쪽마다의 글 양이 는다.
 *
 * 2026-09-28 다시 6으로(사장님: "6장면으로 만들어요 · 대본 6개"). 그림을 우리 배경을 참조로 물려
 * 장면째 그리는 방식으로 바꾸면서 쪽 수를 늘리기로 했다. 한 권 값은 12토큰(대본 6 + 그림 6).
 * 요청이 권당 7번 이상이라 429(몰림)는 첫 몇 권에서 다시 지켜볼 것.
 */
const FIXED_PAGE_COUNT = 6;

/** 조사를 떼어 지칭어를 만든다 — "친구랑"→"친구", "동생이랑"→"동생". */
function companionTerm(who: string): string {
  return who.replace(/(이랑|랑|이와|와|과|하고)$/u, "");
}

/**
 * '누구랑'에 직접 적은 말 → who 값. 칩 값("친구랑"·"선생님이랑")과 같은 꼴로 조사를 붙여 둔다 —
 * 요약 줄·답 칩에 "사촌 형이랑"으로 나오고, companionTerm(이 화면)·whoLine(서버, 같은 식)이 떼면 적은 말이 그대로 남는다.
 *
 * - 이미 조사를 붙여 적었으면("이모랑"·"사촌 형이랑"·"삼촌하고") 그대로 둔다 — 또 붙이면 "이모랑이랑"이 된다.
 * - 받침이 있으면 '이랑', 없으면 '랑'. 단 끝 글자가 '이'면(고양이) '하고' — "고양이랑"은 companionTerm 이
 *   '이랑'을 떼어 "고양"만 남긴다(서버도 같은 식이라 그쪽을 고칠 수 없다).
 * 조사로 끝나는 이름("하랑")은 조사로 읽혀 "하"가 된다 — 이름은 '친구랑' 칩 + 이름 칸으로 받는 게 맞다.
 */
function ownWho(typed: string): string {
  const t = typed.trim();
  if (!t) return "";
  if (companionTerm(t) !== t && companionTerm(t).trim()) return t;
  if (hasBatchim(t)) return `${t}이랑`;
  return t.endsWith("이") ? `${t}하고` : `${t}랑`;
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
            className={`min-h-11 shrink-0 rounded-full px-3.5 text-sm font-bold transition ${
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
  /** "outline" 은 2026-09-29 전 임시저장에만 있다(그 화면은 없앴다) — 되살릴 때 resumeStep 이 바꾼다. */
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
  /**
   * 어디서·누구랑 '직접 입력' 칸의 글(null·없음 = 칸 닫힘). 값 자체는 place·who 에 있고, 이건 이어서 만들 때
   * '직접 입력'이 골라진 채·적던 글 그대로 열리게 한다. 없던 칸이라 옛 임시저장엔 없다(선택 칸 — 형식 숫자는 그대로).
   */
  placeOwn?: string | null;
  whoOwn?: string | null;
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
  /**
   * 옛 칸 — 대본 값을 내기 **전** 줄거리 화면에서 다시 지은 횟수였다. 그 화면이 없어져 읽지 않는다
   * (값을 낸 뒤 '새로 짓기' 횟수와 뜻이 달라, 옮겨 오면 새로 짓기를 헛되이 막는다). 새 임시저장엔 없다.
   */
  outlineRetries?: number;
  /** 대본 화면에서 '다른 이야기로 새로 짓기'를 한 횟수 — 새로고침해도 이어지게. 없던 칸이라 옛 임시저장엔 없다. */
  replots?: number;
  /** 대본 값(글 값)을 이미 받았는지 — 새로고침해도 두 번 받지 않게. */
  scriptCharged?: boolean;
  /**
   * 대본 값을 낸 줄거리 — 새로 짓기를 해도 서버가 이 줄거리로 세어 값을 또 받지 않는다(lib/create-flow paidPlot).
   * 없던 칸이라 옛 임시저장엔 없다 — 그때는 outline 이 곧 값을 낸 줄거리다(선택 칸 — 형식 숫자는 그대로).
   */
  paidOutline?: Outline | null;
  /**
   * 줄거리는 나왔는데 대본을 못 받은 것 — 대본을 기다리다 끊긴 채 저장된 임시저장에만 있다.
   * 서버가 대본 값을 이미 받았을 수 있어서, 다음 '대본 만들기'는 이 줄거리로 쓴다(lib/create-flow reusablePlot).
   * 없던 칸이라 옛 임시저장엔 없다(선택 칸 — 형식 숫자는 그대로).
   */
  pendingPlot?: PendingPlot<Outline> | null;
  /** 부모가 대본 문장·제목을 고쳤는지 — 다시 만들기 전에 '고친 것이 사라져요'를 묻는다. 없던 칸(선택). */
  scriptEdited?: boolean;
  storyRewrites?: number;
  locationDetail?: string;
  /**
   * 만들기 기록(book_jobs) id — 서버가 대본을 쓰면서 만든 줄.
   * 새로고침·이어 하기에도 같은 기록에 이어 적어야 한 번의 만들기가 한 줄로 보인다.
   */
  jobId?: string | null;
};

/*
 * '그림 값은 냈는데 책장에 못 넣은' 표시 — 그리기 보관 열쇠마다 하나.
 * 저장이 실패하면 그리기 보관을 지우지 않는다. 그 뒤 다시 저장할 때 값을 또 받지 않게 한다.
 * (읽기 판단은 book-jobs.ts 의 readPaidMarker)
 */
const PAID_MARKER_KEY = "voice-storybook:unsaved-paid";
function loadPaidMarker(progressKey: string): PaidMarker | null {
  if (typeof window === "undefined" || !progressKey) return null;
  try {
    return readPaidMarker(window.localStorage.getItem(`${PAID_MARKER_KEY}:${progressKey}`), Date.now());
  } catch {
    return null;
  }
}
function savePaidMarker(progressKey: string, marker: PaidMarker): void {
  if (typeof window === "undefined" || !progressKey) return;
  try {
    window.localStorage.setItem(`${PAID_MARKER_KEY}:${progressKey}`, JSON.stringify(marker));
  } catch {
    /* 표시를 못 남겨도 기록(book_jobs)으로 한 번 더 가린다 */
  }
}
function clearPaidMarker(progressKey: string): void {
  if (typeof window === "undefined" || !progressKey) return;
  try {
    window.localStorage.removeItem(`${PAID_MARKER_KEY}:${progressKey}`);
  } catch {
    /* 무시 */
  }
}

/*
 * '그림 값 요청을 보냈다' 표시 — 결제 요청 **직전에** 남긴다(값을 냈다는 표시가 아니다).
 *
 * 왜: 그리기 시작이나 finish 가 새로 열거나 갈아탄 기록 id 는 임시저장에 안 쓰인다. 결제가 서버에서
 * 커밋됐는데 응답이 오기 전(최대 20초) 부모가 새로고침·창 닫기를 하면 '값 냈음' 표시는 안 남고 기록 id 도
 * 잃는다. 돌아와 다시 그리면 새 줄을 열어 그 줄에 값을 또 받았다. 이 표시가 있으면 다음 finish 가
 * 그 기록을 읽어 확인한 뒤 이어 간다(값이 붙었으면 받지 않고, 안 붙었으면 그 줄에서 받는다).
 */
const CHARGING_MARKER_KEY = "voice-storybook:charging";
function loadChargingMarker(progressKey: string): PaidMarker | null {
  if (typeof window === "undefined" || !progressKey) return null;
  try {
    return readPaidMarker(window.localStorage.getItem(`${CHARGING_MARKER_KEY}:${progressKey}`), Date.now());
  } catch {
    return null;
  }
}
function saveChargingMarker(progressKey: string, marker: PaidMarker): void {
  if (typeof window === "undefined" || !progressKey) return;
  try {
    window.localStorage.setItem(`${CHARGING_MARKER_KEY}:${progressKey}`, JSON.stringify(marker));
  } catch {
    /* 못 남기면 예전과 같다 — 기록 읽기로 한 번 더 가린다 */
  }
}
function clearChargingMarker(progressKey: string): void {
  if (typeof window === "undefined" || !progressKey) return;
  try {
    window.localStorage.removeItem(`${CHARGING_MARKER_KEY}:${progressKey}`);
  } catch {
    /* 무시 */
  }
}

/*
 * 새 책 id. 시각 뒤에 난수 꼬리를 붙인다(2026-09-14 고침).
 * 예전 id(my-<밀리초>)는 다른 회원 책과 겹칠 수 있었다. 겹치면 저장이 권한 오류로 막히는데,
 * 그 id 는 그림 값과 함께 기록에 못 박혀 바꿀 수 없어 '다시 저장하기'가 영원히 실패했다.
 * 모양은 charge_illustration 의 ^my-[A-Za-z0-9_-]{1,77}$ 안이다.
 */
function newBookId(): string {
  let tail = "";
  try {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    tail = Array.from(bytes, (b) => (b % 36).toString(36)).join("");
  } catch {
    tail = Math.random().toString(36).slice(2, 8);
  }
  return `my-${Date.now().toString(36)}-${tail}`;
}

/**
 * 재료 한 줄(seed) — 미리보기 겸 재료 화면 '다음' 버튼 조건. 갈래마다 다른 재료를 이어 붙인다.
 * 화면 값과 임시저장 값(이어 만들기에서 어느 장부터 열지)에 같은 식을 쓰려고 밖으로 뺐다.
 */
function materialSeed(
  v: Pick<
    CreateDraft,
    | "storyMode" | "place" | "who" | "todayEvent" | "feeling" | "emotion" | "situation" | "theme" | "happening"
    | "extra" | "directMode" | "directOpening" | "directDevelopment" | "directCrisis" | "directEnding" | "directText"
  >,
): string {
  return v.storyMode === "today"
    ? [v.place, v.who, v.todayEvent.trim(), v.feeling].filter(Boolean).join(", ")
    : v.storyMode === "emotion"
      ? [v.emotion, v.situation.trim(), v.who].filter(Boolean).join(", ")
      : v.storyMode === "direct"
        ? v.directMode === "guided"
          ? [v.directOpening, v.directDevelopment, v.directCrisis, v.directEnding].filter(Boolean).join(" ")
          : v.directText.trim()
        : [v.theme, v.who, v.happening, v.extra.trim()].filter(Boolean).join(", ");
}

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
 * 대본 화면에서 '다른 이야기로 새로 짓기'를 할 수 있는 횟수(대본 한 번에).
 *
 * 예전엔 대본 값을 내기 전 줄거리 화면에서 3번까지 공짜로 다시 지었다(MAX_OUTLINE_RETRIES).
 * 2026-09-29 그 화면을 없애고 이 단추를 대본 화면으로 옮겼다. 새로 짓기는 대본까지 새로 쓰므로
 * 대본 값의 무료 다시 쓰기 횟수(가격표 max_free_rewrites, 기본 2 — 서버가 센다)를 '같은 줄거리로
 * 다시 쓰기'와 함께 쓴다(lib/create-flow redoLeft). 이 숫자는 관리실에서 무료 횟수를 크게 늘렸을 때
 * 줄거리 짓기만 끝없이 돌지 않게 거는 윗선이다. 새 재료로 대본을 새로 만들면 0으로 돌아간다.
 */
const MAX_REPLOTS = 3;

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
  bare = false,
  bestFriend,
}: {
  friends: FriendEntry[];
  onChange: (v: FriendEntry[]) => void;
  accent: string;
  /** 참이면 제목·안내 줄을 뺀다 — 한 장에 질문 하나 화면에서는 질문 줄이 제목이고 '건너뛰기'가 (선택)을 대신한다. */
  bare?: boolean;
  /** 가족 캐릭터에 넣어 둔 단짝 친구 — 있으면 '단짝 친구 불러오기' 칩을 띄운다(이름·성별만 채운다, BestFriendChip). */
  bestFriend?: FamilyMember | null;
}) {
  const patch = (i: number, p: Partial<FriendEntry>) =>
    onChange(friends.map((f, idx) => (idx === i ? { ...f, ...p } : f)));

  /*
   * 단짝 친구 불러오기 — 이름·성별이 다 빈 첫 칸에 채우고, 빈 칸이 없으면 한 칸 더한다(3명까지).
   * 이미 들어 있거나 채울 자리가 없으면 칩을 숨긴다.
   */
  const buddy = bestFriend ? bestFriendEntry(bestFriend) : null;
  const emptyAt = friends.findIndex((f) => !f.name.trim() && !f.gender);
  const showBuddy =
    bestFriend &&
    buddy &&
    hasBestFriendInfo(buddy) &&
    !friends.some((f) => isBestFriendIn(buddy, f.name, f.gender)) &&
    (emptyAt >= 0 || friends.length < MAX_FRIENDS);
  const callBuddy = () => {
    if (!buddy) return;
    if (emptyAt >= 0) patch(emptyAt, buddy);
    else onChange([...friends, buddy]);
  };

  return (
    <div className="flex flex-col gap-2">
      {!bare && (
        <p className="text-xs font-bold text-neutral-400">
          친구들 <span className="font-medium">(선택 · 최대 {MAX_FRIENDS}명)</span>
        </p>
      )}
      {showBuddy && <BestFriendChip friend={bestFriend} onPick={callBuddy} className="self-start" />}
      {friends.map((f, i) => (
        // 폰에서는 이름 칸을 한 줄 다 쓰고 성별·빼기는 아랫줄에 — 한 줄에 몰면 이름 칸이 글자 몇 개 폭으로 줄었다.
        <div key={i} className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
          <input
            value={f.name}
            onChange={(e) => patch(i, { name: e.target.value.slice(0, 20) })}
            maxLength={20}
            placeholder={`친구 ${i + 1} 이름`}
            aria-label={`친구 ${i + 1} 이름`}
            className="min-h-11 min-w-0 flex-1 rounded-2xl border-2 border-dashed border-neutral-200 bg-white text-neutral-900 px-3.5 py-2 text-sm font-bold outline-none focus:border-neutral-400"
          />
          <div className="flex items-center gap-1.5">
            <GenderChips value={f.gender} onChange={(g) => patch(i, { gender: g })} accent={accent} />
            <button
              type="button"
              onClick={() => onChange(friends.filter((_, idx) => idx !== i))}
              aria-label={`친구 ${i + 1} 빼기`}
              className="ml-auto min-h-11 min-w-11 shrink-0 rounded-full bg-neutral-100 text-sm font-bold text-neutral-500 hover:bg-neutral-200 sm:ml-0"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
      {friends.length < MAX_FRIENDS && (
        <button
          type="button"
          onClick={() => onChange([...friends, { name: "", gender: "" }])}
          className="min-h-11 self-start rounded-full bg-neutral-100 px-4 text-sm font-extrabold text-neutral-600 hover:bg-neutral-200"
        >
          + 친구 더하기
        </button>
      )}
      {!bare && (
        <p className="text-[11px] font-medium text-neutral-400">
          이름을 적으면 그 이름이 그대로 동화에 나와요. 안 적으면 &lsquo;친구&rsquo;라고만 나와요.
        </p>
      )}
    </div>
  );
}

/** 끝 글자에 받침이 있나 — 조사(은/는, 이라고/라고)를 맞춘다. "선생님는"·"선생님라고"가 나오던 것. */
function hasBatchim(word: string): boolean {
  const c = word.charCodeAt(word.length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
}

/**
 * 누구랑 다음 장 — 함께 나오는 사람의 이름(선택)과, 호칭으로 알 수 없으면 성별.
 * "친구들이랑"이면 친구 한 명씩 받는 입력으로 간다.
 *
 * 이 칸은 '아이 이름' 칸으로 오해받은 적이 있다(베타 제보) — 라벨이 "아빠 이름"뿐이고 예시가 '토토, 민지'라
 * 아이 이름처럼 보였다. 이제 장 제목이 "함께 나오는 ○○ 이름은요?"로 누구 이름인지 밝히고,
 * 안 적어도 된다는 것은 칸 안 안내글과 '건너뛰기' 버튼이 말한다.
 */
function WhoNameInput({
  who,
  value,
  onChange,
  gender,
  onGenderChange,
  friends,
  onFriendsChange,
  accent,
  bestFriend,
}: {
  who: string;
  value: string;
  onChange: (v: string) => void;
  gender: string;
  onGenderChange: (v: string) => void;
  friends: FriendEntry[];
  onFriendsChange: (v: FriendEntry[]) => void;
  accent: string;
  /** 가족 캐릭터의 단짝 친구 — '친구랑'·'친구들이랑'일 때만 '단짝 친구 불러오기' 칩으로 쓴다. */
  bestFriend?: FamilyMember | null;
}) {
  if (!who || who === "혼자서") return null;
  if (who === "친구들이랑") {
    return <FriendsInput friends={friends} onChange={onFriendsChange} accent={accent} bare bestFriend={bestFriend} />;
  }
  const term = companionTerm(who);
  const askGender = !GENDER_KNOWN.has(term);
  // 친구 한 명('친구랑') — 단짝 친구를 불러오면 이름 칸·성별을 그 친구로 바꾼다(이름이 없으면 이름 칸은 비운다).
  const buddy = who === "친구랑" && bestFriend ? bestFriendEntry(bestFriend) : null;
  const showBuddy = bestFriend && buddy && hasBestFriendInfo(buddy) && !isBestFriendIn(buddy, value, gender);
  return (
    <div className="flex flex-col gap-3">
      {showBuddy && (
        <BestFriendChip
          friend={bestFriend}
          onPick={() => {
            onChange(buddy.name);
            onGenderChange(buddy.gender);
          }}
          className="self-center"
        />
      )}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 20))}
        maxLength={20}
        aria-label={`함께 나오는 ${term} 이름`}
        placeholder={`안 적으면 그냥 '${term}'${hasBatchim(term) ? "이라고" : "라고"} 나와요`}
        className="w-full rounded-2xl border-2 border-dashed border-neutral-200 bg-white text-neutral-900 px-4 py-3 text-base font-bold outline-none focus:border-neutral-400"
      />
      {askGender && (
        <div className="flex items-center justify-center gap-1.5">
          <span className="text-sm font-bold text-neutral-500">
            {term}
            {hasBatchim(term) ? "은" : "는"}
          </span>
          <GenderChips value={gender} onChange={onGenderChange} accent={accent} />
        </div>
      )}
    </div>
  );
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

/*
 * 기다리는 동안 감상할 제공 동화 — 전래동화·세계명작 서가 그대로(뷰어가 '다음 동화'로 찾는 목록과 같다).
 * 표지 줄은 숨긴 책·표지 없는 책을 뺀 것만 보여 준다(pickShowcaseBooks).
 */
const SHELF_BOOKS: Book[] = [...asBooks(folkBooksJson), ...asBooks(classicBooksJson)];
const SHOWCASE_BOOKS = pickShowcaseBooks(asBooks(folkBooksJson), asBooks(classicBooksJson));

export default function CreatePage() {
  // 주제 입력 상태 이름이 theme이라, UI 테마는 ui로 받는다.
  const { theme: ui } = useTheme();
  const { accent, accentDark, accentSoft } = ui.colors;
  const router = useRouter();
  // 값 안내 숫자(대본 값·그림 값·권수 상한)는 관리실에서 정한 가격표에서 읽는다.
  // 못 읽으면 지금까지 쓰던 상수 그대로다 — 화면이 비거나 만들기가 막히지 않는다.
  const pricing = usePricing();

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
      // 권수 상한 확인용 — 숫자만 센다. 예전엔 책을 통째로 받아 세느라(삽화 포함)
      // 만들기 화면을 열 때마다 수십 MB가 오갔다.
      setBookCount(await countMyBooks());
      // 계정에 저장된 아이 정보를 서버에서 되살려 폼에 채운다 (로컬 캐시가 비어 있어도 복구).
      const remoteChild = await loadChildRemote();
      if (alive && remoteChild) {
        setName(remoteChild.name);
        setAge(remoteChild.age);
        setGender(remoteChild.gender);
        // 다른 기기에서 넣은 단짝 친구도 불러오기 칩에 뜨게 — 서버 값과 합친 가족에서 다시 찾는다.
        setMyBestFriend(bestFriend(remoteChild.family) ?? null);
        if (remoteChild.name && remoteChild.age !== null) setStep("theme");
        setPageCount(FIXED_PAGE_COUNT);
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
  const bookLimitReached = !master && bookCount >= pricing.max_books_per_user;
  /*
   * 갈래를 새로 고르면 결말을 비운다.
   *
   * 결말은 갈래마다 뜻이 다르다 — 오늘 이야기에서는 실제로 있었던 사실이고,
   * 상상·감정에서는 부모가 바라는 마무리다. 안 비우면 오늘 이야기에서 고른
   * "혼났어요"가 상상 동화까지 따라가 공룡 나라 이야기가 혼나는 것으로 끝난다.
   */
  const chooseStoryMode = (m: typeof storyMode) => {
    setEnding("");
    setStoryMode(m);
    // 새 갈래는 아직 답이 없는 첫 질문부터 연다(QuestionFlow 의 initial=null).
    setFlowAt(null);
  };

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
  /*
   * 기다리는 동안 띄워 보는 제공 동화(id). null 이면 안 띄웠다.
   *
   * 다른 페이지(/book/…)로 가지 않고 이 화면 위에 띄운다 — 이 화면이 사라지면 아래
   * '화면을 떠나면 요청을 끊는다'가 돌아 그리던 그림·쓰던 대본이 끊긴다.
   */
  const [showcaseId, setShowcaseId] = useState<string | null>(null);
  /*
   * ⚠ 책을 띄워 둔 동안은 이 ESC(=그리기·대본 멈춤)를 끈다.
   * 뷰어도 ESC 로 닫히는데, 둘 다 켜 두면 책을 닫으려던 ESC 한 번에 그리던 그림까지 멈춘다.
   */
  useEscClose(() => abortRef.current?.abort(), (busy || step === "illustrate") && !showcaseId);
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
  /*
   * 재료 질문 화면(한 장에 질문 하나)이 지금 몇 번째 장인지 — 그림·성우 단계에 갔다가 돌아와도
   * 같은 장(대개 '이렇게 만들어요' 요약)에서 다시 열리게 여기 둔다. null 이면 아직 답이 없는 첫 질문부터.
   */
  const [flowAt, setFlowAt] = useState<FlowPos | null>(null);
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
  /*
   * 어디서·누구랑의 '직접 입력' 칸에 적은 글 그대로(null = 칸이 닫혀 있다).
   * 값은 place·who 가 들고 있고(칩과 같은 자리 — 재료·요약·답 칩이 그대로 읽는다), 이 둘은 칸에 보일 글과
   * '직접 입력'이 골라져 있는지만 맡는다. who 는 조사를 붙인 꼴("사촌 형이랑")이라 칸 글을 따로 들어야
   * 적는 도중 글자가 바뀌지 않는다. 임시저장에도 담는다.
   */
  const [placeOwn, setPlaceOwn] = useState<string | null>(null);
  const [whoOwn, setWhoOwn] = useState<string | null>(null);
  /*
   * 가족 캐릭터에 넣어 둔 단짝 친구(없으면 null) — 친구 칸의 '단짝 친구 불러오기' 칩.
   * 이 기기 값(loadChild)으로 먼저 채우고, 계정 값(loadChildRemote)이 오면 다시 채운다.
   */
  const [myBestFriend, setMyBestFriend] = useState<FamilyMember | null>(null);
  // 「오늘의 이야기」 전용 — 어디서·무슨 일(자유)·기분. 누구랑(who)은 공유한다.
  const [place, setPlace] = useState("");
  const [todayEvent, setTodayEvent] = useState("");
  const [feeling, setFeeling] = useState("");
  // 「오늘의 이야기」 — 일이 어떻게 끝났나 (각색 정확도의 핵심 재료)
  const [ending, setEnding] = useState("");
  // 「감정 동화」 전용 — 어떤 마음·그런 마음이 든 상황. 누구랑(who)은 공유한다.
  const [emotion, setEmotion] = useState("");
  const [situation, setSituation] = useState("");
  // 「직접 이야기 쓰기」 — 글 한 칸(2026-09-28: 기승전결 네 칸은 오히려 헷갈려서 없앰, 사장님).
  // directMode 는 늘 "full" — 서버가 글 길이를 보고 짧으면 풀어 쓰고, 길면 원고를 지키며 나눈다.
  const [directMode, setDirectMode] = useState<"guided" | "full">("full");
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
    setMyBestFriend(bestFriend(saved.family) ?? null);
    if (saved.name && saved.age !== null) setStep("theme");
    setPageCount(FIXED_PAGE_COUNT);
  }, []);

  // 재료 미리보기 겸 "다음" 버튼 활성 조건. 갈래마다 다른 재료를 이어 붙인다(식은 materialSeed).
  const seed = materialSeed({
    storyMode, place, who, todayEvent, feeling, emotion, situation, theme, happening, extra,
    directMode, directOpening, directDevelopment, directCrisis, directEnding, directText,
  });
  const directReady = directText.trim().length >= 20;
  const directFeedback = storyMode === "direct"
    ? [directText.trim().length < 20 ? "이야기를 한두 문장 이상 적어 주세요." : ""].filter(Boolean)
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
   *
   * 2026-09-28: 올리는 칸은 없앴다(사장님 — 모든 동화를 수채화 한 가지로). 값은 늘 null 이지만,
   * 인물 시트·이어 그리기 코드가 이 값을 그대로 읽으므로 자리는 남겨 둔다.
   */
  const [drawing] = useState<string | null>(null);

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
   * 이미 주소(https://…)인 것은 건너뛴다 — '다시 저장하기'가 못 올린 장만 다시 올리게.
   *
   * 못 올린 장은 어떻게 하나 (2026-09-14 정함):
   *  · 먼저 한 번 더 올려 본다. 실패의 대부분은 순간 끊김이다.
   *  · 그래도 안 되면 **쪽 그림·표지는 base64 로 책에 남긴다.** 부모가 값을 내고 받은
   *    그림이고, 저장 전에 1280px 로 줄여 둬서 한 장에 수백 KB 다. 버리면 빈 쪽이 된다.
   *  · **인물 시트·장소 시트는 못 올리면 책에서 뺀다.** 줄이지 않은 원본이라 한 장에
   *    1~2MB 인데, 읽는 사람에게는 안 보이고 나중에 한 쪽 다시 그릴 때 기준으로만 쓴다
   *    (없으면 뷰어가 옆 쪽 그림을 기준으로 삼는다). 이걸 넣으면 책 한 줄이 수 MB 가 되어
   *    바로 그 저장이 더 잘 실패한다 — 그림 하나 때문에 책 전체를 잃는 셈이다.
   *    원본은 그리기 보관(IndexedDB)과 화면 메모리에 남아 '다시 저장하기' 때 다시 올린다.
   *  · 몇 장을 못 올렸는지·왜인지는 failures 로 돌려준다 — 기록(book_jobs)에 남긴다.
   */
  async function hostArtwork(
    bookId: string,
    pageArt: (string | null)[],
    cover: string | null,
    sheet: string | null = null,
    locationSheets: LocationSheet[] = [],
  ): Promise<{
    images: (string | null)[];
    cover: string | null;
    sheet: string | null;
    locationSheets: LocationSheet[];
    failures: JobFailure[];
  }> {
    type UploadJob = { name: string; page?: number; kind: "art" | "sheet"; dataUrl: string; put: (url: string) => void; drop: () => void };
    const jobs: UploadJob[] = [];
    const images = [...pageArt];
    let coverOut = cover;
    let sheetOut = sheet;
    let locationsOut = locationSheets.map((s) => ({ ...s }));
    const droppedLocations = new Set<number>();

    if (isEmbeddedImage(cover)) {
      jobs.push({ name: "cover", kind: "art", dataUrl: cover, put: (u) => (coverOut = u), drop: () => {} });
    }
    if (isEmbeddedImage(sheet)) {
      jobs.push({ name: "sheet", kind: "sheet", dataUrl: sheet, put: (u) => (sheetOut = u), drop: () => (sheetOut = null) });
    }
    locationsOut.forEach((s, i) => {
      if (!isEmbeddedImage(s.image)) return;
      jobs.push({
        name: `loc${i + 1}`,
        kind: "sheet",
        dataUrl: s.image,
        put: (u) => (locationsOut[i].image = u),
        drop: () => droppedLocations.add(i),
      });
    });
    pageArt.forEach((im, i) => {
      if (isEmbeddedImage(im)) {
        jobs.push({ name: `p${i + 1}`, page: i + 1, kind: "art", dataUrl: im, put: (u) => (images[i] = u), drop: () => {} });
      }
    });
    const result = (failures: JobFailure[]) => {
      locationsOut = locationsOut.filter((_, i) => !droppedLocations.has(i));
      return { images, cover: coverOut, sheet: sheetOut, locationSheets: locationsOut, failures };
    };
    if (jobs.length === 0) return result([]);

    /** 한 장 올리기 — 성공하면 null, 실패하면 이유. 절대 던지지 않는다. */
    const uploadOne = async (job: UploadJob): Promise<string | null> => {
      try {
        const res = await authedFetch("/api/upload-art", {
          method: "POST",
          headers: { "content-type": "application/json" },
          // 폴더는 서버가 부른 사람(마스터면 책 주인)으로 정한다 — owner 는 보내지 않는다.
          body: JSON.stringify({ bookId, name: job.name, image: job.dataUrl }),
        });
        if (res.ok) {
          const { url } = (await res.json().catch(() => ({}))) as { url?: string };
          if (url) {
            job.put(url);
            return null;
          }
          return "서버가 주소를 돌려주지 않았어요";
        }
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        return `${data.error ?? "올리기 실패"} (HTTP ${res.status})`;
      } catch (e) {
        return (e as Error)?.message || "네트워크 오류";
      }
    };

    const pageJobs = jobs.filter((j) => j.page !== undefined).length;
    setUploading({ done: 0, total: jobs.length, pages: pageJobs });
    const failed: { job: UploadJob; reason: string }[] = [];
    for (let i = 0; i < jobs.length; i++) {
      const reason = await uploadOne(jobs[i]);
      if (reason) failed.push({ job: jobs[i], reason });
      setUploading({ done: i + 1, total: jobs.length, pages: pageJobs });
    }
    // 못 올린 장은 잠깐 쉬었다 한 번 더 — 조용히 넘기면 책이 통째로 base64가 되어
    // 수 MB짜리 줄이 DB에 들어간다(실제로 났다).
    const failures: JobFailure[] = [];
    if (failed.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      for (const f of failed) {
        const again = await uploadOne(f.job);
        if (!again) continue;
        console.warn("[hostArtwork] 올리기 실패", f.job.name, again);
        if (f.job.kind === "sheet") f.job.drop(); // 위 설명: 시트는 base64 로 넣지 않는다
        failures.push({
          page: f.job.page,
          stage: "upload",
          reason: `${f.job.name}: ${again}${f.job.kind === "sheet" ? " — 책에서 뺌" : " — base64로 남김"}`,
        });
      }
    }
    setUploading(null);
    return result(failures);
  }

  /*
   * 그림 비율은 항상 4:3(가로) — 사장님 결정(2026-08-28).
   *
   * 그림책 구도는 원래 가로다(마주 보기·걸어가기·인물+장소 한 화면). 세로는 인물이 위로
   * 몰리고 아래가 비는 일이 반복됐고, 참조 그림(시트·견본)도 전부 가로라 가로가 참조를
   * 더 잘 따른다. 제공 책 14권도 모두 4:3. 옛 책은 저장된 shape를 그대로 쓴다.
   */
  const screenShape: "tablet" | "phone" = "tablet";
  const mood = deriveAutomaticMood({
    storyMode, emotion, theme, happening, todayEvent, feeling,
    directStory: directMode === "full" ? directText : `${directOpening} ${directDevelopment} ${directCrisis} ${directEnding}`,
  });
  // 읽어줄 성우 — 만든 동화에 박아 저장한다(book.narrator). 뷰어가 이 성우로 읽는다.
  // 기본 선택을 두지 않는다("") — 부모가 직접 골라 들어보고 정하게 유도한다.
  const [narratorVoice, setNarratorVoice] = useState<string>("");
  // 제작할 때 한 번만 고르고 책에 고정한다. 뷰어에서 바꾸지 않아 TTS 재합성을 막는다.
  // 낭독 느낌은 늘 '자연스럽게' — 고르는 칸은 없앴다(사장님 결정, 2026-08-28).
  const narrationStyle: NarrationStyle = "natural";
  /*
   * 이 계정에 등록된 엄마·아빠 목소리. 동화를 다 만든 뒤 앞 쪽 낭독을 미리 구울 때,
   * 부모 목소리가 있으면 그게 기본 성우가 되므로 그것으로 구워야 캐시가 맞는다.
   */
  const [parentVoices, setParentVoices] = useState<ParentVoice[]>([]);
  useEffect(() => {
    loadParentVoices().then(setParentVoices).catch(() => {});
  }, []);
  // 이야기 길이 — 쪽수가 적어도 각 쪽을 더 길고 풍부하게 연출할지.
  // 이야기 길이는 늘 '넉넉하게' — 고르는 칸은 없앴다(사장님 결정, 2026-08-28). 쪽수 고정과 짝.
  const longerStory = true;
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
  // 장면(쪽) 수 — 6으로 고정(FIXED_PAGE_COUNT). 화면에서 고르지 않는다.
  const [pageCount, setPageCount] = useState(FIXED_PAGE_COUNT);
  /*
   * 값은 두 번에 나눠 받는다 — 대본을 만들 때 글 값, 그림을 붙일 때 그림 값.
   * 둘을 더하면 예전과 같다(쪽당 2토큰). 나누기만 한 것이지 올린 게 아니다.
   * 숫자는 관리실 가격표(pricing)에서 — 실제로 깎는 DB 함수(charge_story·charge_illustration)와 같은 표다.
   * (예전엔 이 화면만 lib/tokens 상수를 보여 줘서, 관리실에서 값을 바꾸면 단추 숫자와 실제가 어긋날 수 있었다.)
   */
  const scriptCost = scriptCostOf(pageCount, pricing);
  const imageCost = illustrationCost(pageCount, pricing);
  /*
   * 마스터는 토큰이 들지 않는다(auth.spendTokens에서 면제). 그런데 화면이 잔액으로
   * 버튼을 먼저 막고 있어서, 서버만 면제해 봐야 잔액이 바닥나면 못 만들었다.
   * 여기서도 같이 면제해야 실제로 계속 만들 수 있다.
   */
  const shortOnTokens = !master && tokens < scriptCost;

  /*
   * 생성 결과 — 줄거리는 화면에 따로 안 보인다(2026-09-29 줄거리 확인 화면을 없앴다).
   * 대본을 쓸 때·같은 줄거리로 다시 쓸 때 서버에 보내려고 들고 있다. 고치는 곳은 대본 화면 하나다.
   */
  const [outline, setOutline] = useState<Outline | null>(null);
  /** 대본 값을 낸 줄거리 — 대본 화면에서 새로 지어도 이것으로 세어 값을 또 받지 않는다(lib/create-flow paidPlot). */
  const [paidOutline, setPaidOutline] = useState<Outline | null>(null);
  /*
   * 줄거리는 나왔는데 대본을 아직 못 받은 것 — '대본 만들기'에서 줄거리가 오자마자 적고, 대본을 받으면 비운다.
   * 서버는 대본을 쓰기 전에 값을 받으므로, 대본을 기다리다 끊기면(ESC·새로고침·폰이 탭을 닫음) 값만 나갔을 수 있다.
   * 그때 줄거리를 새로 지으면 값을 또 받는다 — 그래서 다음 '대본 만들기'는 재료가 그대로면 이 줄거리로 쓴다
   * (lib/create-flow reusablePlot). 서버가 값 낸 줄을 찾으면 무료, 못 찾으면(값이 안 나갔거나 되돌림) 한 번 받는다.
   */
  const [pendingPlot, setPendingPlot] = useState<PendingPlot<Outline> | null>(null);

  const [story, setStory] = useState<Story | null>(null);
  /*
   * 그림 값이 모자란 채로 그리기 시작하면, 다 그린 뒤 저장에서 막힌다 —
   * 그때는 이미 Gemini 값이 다 나간 뒤다. 시작 전에 막아야 손해가 없다.
   * 잔액은 대본 값을 낸 뒤의 것이라, 여기서 다시 본다.
   */
  const shortOnImageTokens =
    !master && story ? tokens < illustrationCost(story.pages.length, pricing) : false;
  // 쪽별 삽화(data URL). 실패한 쪽은 null → 뷰어가 플레이스홀더를 그린다.
  const [pageImages, setPageImages] = useState<(string | null)[]>([]);
  const [drawn, setDrawn] = useState(0);
  /**
   * 다 그린 그림을 cafe24로 올리는 단계(저장 직전). null이면 아직 그 단계가 아니다.
   * 한 장씩 순서대로 올리느라 몇 초 걸려서, 화면이 멈춘 것처럼 보이지 않게 진행을 보여준다.
   */
  /** pages — 올릴 것 중 쪽 그림 장수(나머지는 표지·인물·장소 기준 그림). */
  const [uploading, setUploading] = useState<{ done: number; total: number; pages: number } | null>(null);
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
   * 줄거리·대본을 기다린 시간(ms) — 기다림 막 아래에 "1분 12초 지났어요"로 보인다.
   * 그림은 위 drawStartRef·tick 으로 따로 센다. 끝나면 0으로 돌린다.
   */
  const [busyElapsed, setBusyElapsed] = useState(0);
  /*
   * 기다림 막이 무엇을 기다리나 — 대본 만들기(줄거리→대본)·대본 다시 쓰기·다시 저장. 단추를 누를 때 정한다.
   * null 이면 단계로 어림한다. 막이 걷히면 비운다.
   */
  const [busyKind, setBusyKind] = useState<BusyKind | null>(null);
  /** 대본 만들기 기다림 안에서 지금 걸음 — 줄거리를 짓는 중이냐, 대본을 쓰는 중이냐(기다림 막 문구). */
  const [busyStage, setBusyStage] = useState<ScriptStage>("outline");
  /** 이번 그리기에서 '이어서 그리기'로 되살린 장수 — 그림 그리기 단추를 누를 때 적는다. */
  const drawRestoredRef = useRef(0);
  useEffect(() => {
    if (!busy) return;
    const startedAt = Date.now();
    const id = setInterval(() => setBusyElapsed(Date.now() - startedAt), 1000);
    return () => {
      clearInterval(id);
      setBusyElapsed(0);
      setBusyKind(null); // 막이 걷히면 무엇을 기다렸는지도 비운다
    };
  }, [busy]);
  /*
   * 대본 화면에서 '다른 이야기로 새로 짓기'를 한 횟수(MAX_REPLOTS 까지).
   *
   * 토큰은 더 받지 않지만, 누를 때마다 줄거리·대본 글 값은 우리가 낸다 — 마음에 드는 이야기를
   * 고를 자유는 주되, 끝없이 돌려 보는 건 막는다. 무료 횟수 셈은 서버가 따로 한다(storyRewrites).
   * 새로고침으로 초기화되지 않게 임시저장에 함께 담는다. 새 재료로 대본을 새로 만들면 0으로 되돌린다.
   */
  const [replots, setReplots] = useState(0);

  /**
   * 대본 값(글 값)을 이미 받았는지.
   *
   * 대본을 만들 때 한 번만 받는다. 새로고침해도 두 번 받지 않도록 임시저장에 함께 담는다.
   * 재료를 바꿔 새로 지으면 0으로 되돌린다 — 그건 다른 이야기다.
   */
  const [scriptCharged, setScriptCharged] = useState(false);
  /**
   * 대본 값을 낸 뒤 무료로 다시 만든 횟수 — 같은 줄거리로 다시 쓰기와 다른 이야기로 새로 짓기를 합친 것.
   * 서버(charge_story)가 센 값을 받아 둔다(charge.rewrites). 남은 횟수는 redo(아래)가 셈한다.
   */
  const [storyRewrites, setStoryRewrites] = useState(0);
  /** 부모가 대본 문장·제목을 고쳤는지 — 다시 만들면 고친 것이 사라지므로 먼저 묻는다. 새 대본이 오면 비운다. */
  const [scriptEdited, setScriptEdited] = useState(false);
  /**
   * 값이 나가는 단추의 확인 창 — "script"(대본 만들기) · "draw"(그림 그리기). 사장님(2026-09-29): "누르면 얼마의 크래딧이
   * 발생됩니다 — 확인하고 생성되게". 관리자는 값이 안 나가서 묻지 않는다.
   */
  const [chargeAsk, setChargeAsk] = useState<null | "script" | "draw">(null);
  /*
   * 다시 만들기가 끝났다는 한 줄 — 같은 이야기로 다시 쓰면 제목이 그대로라 바뀐 줄 모른다.
   * 잠깐 보이고 사라진다(redoNoteTimerRef).
   */
  const [redoNote, setRedoNote] = useState("");
  const redoNoteTimerRef = useRef<number | null>(null);
  /** 대본 쪽 목록(스크롤 칸) — 다시 만든 뒤 맨 위로 올린다. */
  const pageListRef = useRef<HTMLOListElement | null>(null);
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
  /**
   * 그 시트에 고정 얼굴(우리 가족 캐릭터)이 붙은 등장인물 이름 — 서버가 실제로 붙였다고 답한 것만.
   * 쪽 그림 요청과 책의 등장인물에 fixed 로 단다(얼굴·머리는 설명 글보다 시트를 따르게).
   */
  const fixedCastRef = useRef<Set<string>>(new Set());
  /**
   * 그 시트에 얼굴이 붙은 고정 가족의 원본 그림 주소, 시트에 선 순서(왼쪽부터) — 쪽 그림마다 원본을 함께 붙인다
   * (2026-09-29 사장님 "얼굴이 달라 특히" — 시트만 보고 그리면 얼굴이 한 번 더 흐른다). 책에도 남겨 한 쪽 다시 그리기가 쓴다.
   */
  const sheetPortraitsRef = useRef<SheetPortraitRef[]>([]);
  const sheetOrderRef = useRef<string[]>([]);
  /** 옷 카드로 이 책의 옷을 입은 고정 가족(2026-09-29 저녁~) — 쪽 그림이 가족 그림 옷 대신 이 책의 옷을 입힌다. 책에도 남긴다. */
  const sheetOutfitsRef = useRef<string[]>([]);
  // 장소 시트(장소마다 한 장)도 같이 저장한다 — 다시 그릴 때 같은 곳이 나오게.
  const locationSheetsRef = useRef<LocationSheet[]>([]);
  /*
   * 그리기 진행 보관(IndexedDB) — 그리다 나가도 그린 장을 잃지 않게.
   * 열쇠는 이야기 내용+그림체. 완성해서 저장하면 지운다.
   */
  const drawProgressKeyRef = useRef("");
  /** 이번 책에서 실제로 Gemini를 부른 장수 — 완성 화면에 보여 주고 크레딧 셈의 근거가 된다. */
  const drawCountsRef = useRef<DrawCounts>({ ...EMPTY_COUNTS });
  const [drawSummary, setDrawSummary] = useState("");
  /** 이 대본으로 그리다 만 그림이 몇 장 남아 있는지 — 버튼 글씨에 쓴다. */
  const [resumablePages, setResumablePages] = useState(0);
  /** 이 대본으로 그림 값을 이미 냈는데 책장에 못 넣은 책이 있는지 — 버튼 글씨·잔액 검사에 쓴다. */
  const [unsavedPaid, setUnsavedPaid] = useState(false);

  /*
   * 만들기 기록(book_jobs) id.
   *
   * 서버가 대본을 쓰면서 한 줄을 만들어 id 를 돌려준다. 그 뒤 그리기·올리기·저장 단계를
   * 같은 줄에 적는다 — 컴플레인이 오면 마스터가 "어디까지 갔고 왜 멈췄나"를 본다.
   * state 는 임시저장에 담기 위해, ref 는 오래 걸리는 그리기·저장 도중에 최신 값을 읽기 위해 둘 다 둔다.
   * 기록 표가 없는 DB 면 늘 null 이고, 그래도 만들기는 예전처럼 돈다.
   */
  const [jobId, setJobIdState] = useState<string | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const setJobId = (id: string | null) => {
    jobIdRef.current = id;
    setJobIdState(id);
  };
  /*
   * 기록 쓰기는 한 줄로 세워 보낸다 — 쪽 그림 진행을 묶어 보내는 사이에 '저장 중'이 먼저
   * 도착했다가 늦게 온 '그리는 중'에 덮이는 일이 없게. 실패해도 흐름은 막지 않는다.
   */
  const jobQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  function recordJob(patch: Record<string, unknown>, id?: string | null): Promise<boolean> {
    if (id === null) return Promise.resolve(false);
    // 부를 때의 기록 id 로 적는다(저장 성공 뒤 곧바로 id 를 비워도 '저장됨'이 그 기록에 가게).
    // 부를 때 아직 id 가 없으면 **차례가 왔을 때의** id 로 적는다 — 그리기 시작에서 기록을 새로
    // 여는 일도 같은 줄에 서 있어서, 그 사이에 부른 기록이 버려지지 않게.
    const fixed = id === undefined ? jobIdRef.current : id;
    const run = jobQueueRef.current
      .then(() => updateJob(getSupabase(), fixed ?? jobIdRef.current, patch))
      .catch(() => false);
    jobQueueRef.current = run;
    return run;
  }
  /**
   * 대본을 버리고 끝낸 기록을 '취소'로 닫는다.
   * 아직 그림 값을 안 낸 단계(writing·script·drawing)만 닫는다 — 값을 내고 저장을 못 한
   * 기록은 취소가 아니라 마스터가 처리할 사고라 그대로 둔다.
   */
  async function closeJobAsCancelled(id: string | null): Promise<void> {
    if (!id) return;
    const job = await readJob(getSupabase(), id);
    if (!job || job.illustration_entry || !["writing", "script", "drawing"].includes(job.status)) return;
    await recordJob({ status: "cancelled" }, id);
  }
  /** 이번 그리기에서 쪽마다 못 그린 이유 — 저장 단계 기록에도 함께 남긴다. */
  const drawFailuresRef = useRef<JobFailure[]>([]);
  /*
   * 책장에 넣지 못한 책.
   *
   * 저장이 실패하면 완성 화면으로 넘어가지 않고 이 책을 붙들고 '다시 저장하기'를 띄운다.
   * 그림 값은 이미 나갔다 — 책을 버리면 안 된다.
   */
  const [saveFailure, setSaveFailure] = useState<{ book: Book; reason: string; illustrated: boolean } | null>(null);
  // 대본을 기다리거나 그림을 그리는(책장에 넣는) 동안 화면이 저절로 꺼지지 않게 — 꺼지면 그리기가 멈춘다.
  const screenHeld = useScreenWakeLock(busy || (step === "illustrate" && !saveFailure));

  /*
   * 다 됐을 때 알리기 — 대본이 나옴·동화 완성·책장에 못 넣음.
   *
   * 무엇이 바뀌었는지는 앞 화면 상태와 비교해 noticeFor 가 고른다(만들기 흐름은 건드리지 않고 보기만 한다).
   *  · 부모가 다른 탭·앱을 보고 있으면: 탭 제목·짧은 소리(alertIfAway). 보고 있으면 조용히.
   *  · 띄운 책을 보고 있으면: 책 위에 배너("✅ 동화가 완성됐어요 [보러 가기]").
   */
  const [notice, setNotice] = useState<NoticeKind | null>(null);
  const noticeStateRef = useRef<NoticeState>({ step, busy, saveFailed: false });
  const showcaseOpenRef = useRef(false);
  useEffect(() => {
    showcaseOpenRef.current = showcaseId !== null;
  }, [showcaseId]);
  useEffect(() => {
    const next: NoticeState = { step, busy, saveFailed: saveFailure !== null };
    const kind = noticeFor(noticeStateRef.current, next);
    noticeStateRef.current = next;
    if (!kind) return;
    alertIfAway(kind);
    if (showcaseOpenRef.current) setNotice(kind);
  }, [step, busy, saveFailure]);
  /*
   * 띄운 책은 방문 기록(history)에 한 칸을 남긴다.
   *
   * 왜: 부모는 책을 닫으려고 휴대폰 뒤로 버튼(TWA)·뒤로 가기 몸짓을 쓴다. 기록이 없으면
   * 브라우저가 만들기 앞 화면으로 돌아가고, 이 화면이 사라지면서(언마운트) 쓰던 대본·그리던
   * 그림 요청이 끊긴다. 한 칸을 남겨 두면 뒤로 가기는 그 칸만 걷어내고 → popstate 에서 책만 닫는다.
   * 주소(url)는 바꾸지 않는다 — 같은 /create 에 머물러 Next 라우터가 화면을 새로 그리지 않는다.
   * 닫기 단추·ESC 로 닫으면 남긴 칸을 history.back() 으로 걷어낸다(앞으로 가기에 책이 남지 않게).
   */
  const showcasePushedRef = useRef(false);
  const openShowcase = (id: string) => {
    if (!showcasePushedRef.current && typeof window !== "undefined") {
      try {
        window.history.pushState({ showcase: id }, "");
        showcasePushedRef.current = true;
      } catch {
        // 기록을 못 남겨도 책은 연다(닫기 단추·ESC 는 그대로 된다).
      }
    }
    setShowcaseId(id);
  };
  const closeShowcase = () => {
    setShowcaseId(null);
    setNotice(null);
    if (showcasePushedRef.current) {
      showcasePushedRef.current = false;
      window.history.back();
    }
  };
  useEffect(() => {
    if (!showcaseId) return;
    const onPop = () => {
      // 우리가 남긴 칸이 걷혔다 = 뒤로 가기로 책을 닫았다. 페이지는 그대로 둔다.
      if (!showcasePushedRef.current) return;
      showcasePushedRef.current = false;
      setShowcaseId(null);
      setNotice(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [showcaseId]);
  /*
   * 책을 띄운 동안 뒤 만들기 화면이 쓸려 움직이지 않게 몸통 스크롤을 잠근다.
   * (대본 미리 읽기로 긴 그림 화면 — 쪽을 넘기려고 쓸다가 뒤 화면이 따라 움직이면 닫았을 때 자리가 바뀐다.)
   */
  useEffect(() => {
    if (!showcaseId) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showcaseId]);
  const showcaseBook = showcaseId ? SHELF_BOOKS.find((b) => b.id === showcaseId) ?? null : null;
  /*
   * 띄운 책 — 두 기다림(대본·그림) 어디서 열어도 같은 자리에 뜬다.
   * z-[60]: 임시저장 물음(z-50)·기다림 막(z-20)보다 위. 뷰어는 fixed 라 제 안의 z 는 이 안에 갇힌다.
   *
   * ⚠ 이 요소는 화면 맨 앞 자리(key="showcase")에 둔다 — 그림 화면과 완성 화면 모두.
   *   자리가 다르면 동화가 완성되는 순간 React 가 뷰어를 새로 만들어, 듣던 낭독이 끊기고 첫 쪽으로 돌아간다.
   */
  const showcaseOverlay = showcaseBook ? (
    <div
      key="showcase"
      className="fixed inset-0 z-[60] overscroll-contain"
      role="dialog"
      aria-modal="true"
      aria-label={`${showcaseBook.title} 보기`}
    >
      <BookViewer
        key={showcaseBook.id}
        book={showcaseBook}
        onClose={closeShowcase}
        onOpenBook={(id) => setShowcaseId(id)}
      />
      {notice && (
        <div
          className="pointer-events-none fixed inset-x-0 z-10 flex justify-center px-4"
          style={{ top: "calc(4rem + env(safe-area-inset-top))" }}
        >
          <div
            role="status"
            className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-2 rounded-3xl bg-white/95 py-2 pl-4 pr-2 shadow-2xl"
          >
            <span className="break-keep text-[14px] font-extrabold text-neutral-800">
              {noticeText(notice).banner}
            </span>
            <button
              type="button"
              onClick={closeShowcase}
              className="rounded-full px-4 py-2 text-sm font-extrabold text-white shadow"
              style={{ background: accent }}
            >
              {noticeText(notice).action}
            </button>
            {/* 이 책은 끝까지 듣고 가고 싶을 때 — 배너만 치우고 책·낭독은 그대로 둔다. */}
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="알림 닫고 계속 읽기"
              className="flex h-9 w-9 items-center justify-center rounded-full text-base font-extrabold text-neutral-400 hover:bg-neutral-100"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  ) : null;

  /*
   * 대본 화면의 '다시 만들기' 남은 횟수 — 같은 줄거리로 다시 쓰기·다른 이야기로 새로 짓기가 무료 횟수를 함께 쓴다.
   * 무료 횟수는 관리실 가격표 값(서버 charge_story 가 같은 값으로 센다). null = 관리자(세지 않음).
   */
  const redo = redoLeft({
    master,
    used: storyRewrites,
    maxFree: pricing.max_free_rewrites,
    replots,
    maxReplots: MAX_REPLOTS,
  });

  // 완성 화면 아래 '① 대본 ✓ › ② 그림 ✓ › ③ 동화 완성' 알약 — 닫으면 다시 안 띄운다.
  const [doneStepsOpen, setDoneStepsOpen] = useState(true);
  /*
   * 순서 줄은 몇 초 보여 주고 스스로 걷는다 — 두 줄짜리 알약이 가로 폰에서 첫 쪽 자막(뷰어 아래쪽)을 가린다.
   * 그린 장수 한 줄(drawSummary)은 예전처럼 ✕ 를 누를 때까지 남는다.
   */
  useEffect(() => {
    if (step !== "done" || !doneStepsOpen) return;
    const id = window.setTimeout(() => setDoneStepsOpen(false), 6000);
    return () => window.clearTimeout(id);
  }, [step, doneStepsOpen]);

  const draftContent = JSON.stringify({
    version: CREATE_DRAFT_VERSION,
    savedAt: 0,
    step: (["child", "theme", "style", "story"] as Step[]).includes(step) ? step : "theme",
    name, age, gender, theme, themeGroup, storyMode, who, whoName, whoGender, friends,
    happening, extra, place, placeOwn, whoOwn, todayEvent, feeling, ending, emotion, situation,
    artStyle, screenShape, narratorVoice, narrationStyle, longerStory, pageCount, outline, story,
    directMode, directOpening, directDevelopment, directCrisis, directEnding, directText,
    replots, scriptCharged, paidOutline, pendingPlot, scriptEdited, storyRewrites, locationDetail, jobId,
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

  /*
   * 대본 화면에 왔을 때, 이 대본으로 그리다 만 그림이 있는지 본다 — 버튼 글씨가 바뀐다.
   * 상태 갱신은 비동기 안에서만 한다(렌더 중 setState 규칙).
   */
  useEffect(() => {
    let cancelled = false;
    const key = step === "story" && story ? drawProgressKey(draftOwner ?? "guest", story, artStyle) : "";
    const lookup = key ? loadDrawProgress(key) : Promise.resolve(null);
    void lookup.then((progress) => {
      if (cancelled) return;
      setResumablePages(progress ? progress.images.filter(Boolean).length : 0);
      // 그림 값을 내고 책장에 못 넣은 책 — 다시 누르면 값 없이 저장만 다시 한다.
      // 표시만 본다(2026-09-14 고침) — 그리기 보관이 용량 초과 등으로 안 남았어도 값은 이미 냈다.
      // 예전엔 보관이 없으면 이 안내가 안 뜨고, 잔액이 모자라면 버튼이 잠겨 다시 저장할 길이 없었다.
      setUnsavedPaid(Boolean(key && loadPaidMarker(key)));
    });
    return () => {
      cancelled = true;
    };
  }, [step, story, artStyle, draftOwner]);

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
    // '직접 입력' 칸 — 골라져 있었으면 적던 글 그대로 다시 연다(값은 위 place·who 에 이미 있다).
    setPlaceOwn(typeof draft.placeOwn === "string" ? draft.placeOwn.slice(0, 20) : null);
    setWhoOwn(typeof draft.whoOwn === "string" ? draft.whoOwn.slice(0, 20) : null);
    setTodayEvent(draft.todayEvent);
    setFeeling(draft.feeling);
    setEnding(draft.ending);
    setEmotion(draft.emotion);
    setSituation(draft.situation);
    // 기승전결 칸은 없앴다 — 예전 임시저장이 기승전결이면 네 칸을 이어 글 한 칸으로 옮긴다.
    const oldGuided = [draft.directOpening, draft.directDevelopment, draft.directCrisis, draft.directEnding]
      .map((part) => (part ?? "").trim())
      .filter(Boolean)
      .join("\n");
    setDirectMode("full");
    setDirectOpening("");
    setDirectDevelopment("");
    setDirectCrisis("");
    setDirectEnding("");
    setDirectText(draft.directMode === "guided" && !draft.directText?.trim() ? oldGuided : draft.directText);
    // 옛 outlineRetries(값 내기 전 줄거리 다시 짓기)는 읽지 않는다 — 뜻이 다르다(CreateDraft 설명).
    setReplots(draft.replots ?? 0);
    setScriptCharged(draft.scriptCharged ?? false);
    // 옛 값 낸 임시저장엔 값 낸 줄거리 칸이 없다 — 저장된 줄거리로 채운다(lib/create-flow restorePaidOutline).
    setPaidOutline(restorePaidOutline(draft));
    // 대본을 기다리다 끊긴 줄거리 — 성우 화면으로 되살릴 때만(옛 '줄거리 확인' 것도 여기로).
    setPendingPlot(restorePendingPlot(draft));
    setScriptEdited(draft.scriptEdited ?? false);
    setStoryRewrites(draft.storyRewrites ?? 0);
    setLocationDetail(draft.locationDetail ?? "");
    // 만들기 기록 — 이어서 만들어도 같은 줄에 적는다.
    setJobId(isJobId(draft.jobId) ? draft.jobId : null);
    // 적어 둔 것이 있으면 손댄 것으로 본다 — 이어서 만들 때 덮어쓰지 않게.
    locationTouchedRef.current = Boolean(draft.locationDetail);
    // 그림체는 이제 수채화 하나뿐 — 예전 임시저장에 다른 그림체가 남아 있어도 수채화로 이어 간다.
    setArtStyle(ART_STYLES[0].id);
    // 비율은 4:3 고정 — 초안의 값은 쓰지 않는다.
    setNarratorVoice(draft.narratorVoice);
    // 낭독 느낌은 늘 '자연스럽게' — 초안 값은 쓰지 않는다.
    // 길이는 늘 '넉넉하게' — 초안 값은 쓰지 않는다.
    // 예전 초안에 다른 쪽수가 남아 있어도 고정값으로 — 값이 책마다 달라지지 않게.
    setPageCount(FIXED_PAGE_COUNT);
    /*
     * 어느 화면으로 되살릴지는 resumeStep(lib/create-flow)이 정한다.
     * 옛 '줄거리 확인'(outline) 임시저장은 성우 화면으로 — 되살리자마자 대본을 이어 쓰면 부모가 누르지도 않은
     * 대본 값이 나간다. 성우 화면의 '대본 만들기 · 토큰 N개'를 눌러야 값이 나간다.
     * 그 줄거리는 위 pendingPlot 으로 들고 가서 단추를 누르면 그대로 대본으로 쓴다(부모가 보고 고친 줄거리이고,
     * 옛 화면에서 '네, 만들게요' 뒤 끊겼다면 서버가 값 낸 줄을 찾아 또 받지 않는다).
     * 대본 화면이 아니면 outline·story 칸은 비운다 — 대본 화면에서 쓰는 칸이다.
     */
    const resumeAt = resumeStep(draft);
    setOutline(resumeAt === "story" ? draft.outline : null);
    setStory(resumeAt === "story" ? draft.story : null);
    setStep(resumeAt);
    // 재료 질문 화면 — 재료가 하나라도 있으면 요약 장부터(일부러 건너뛴 질문을 다시 들이밀지 않는다),
    // 아무것도 없으면 첫 질문부터. 재료 단계 뒤(그림·성우…)에서 멈췄으면 돌아올 때 요약 장.
    const flowMode = draft.storyMode === "today" || draft.storyMode === "emotion" || draft.storyMode === "imagine";
    setFlowAt(
      draft.step === "child"
        ? null
        : draft.step === "theme"
          ? flowMode && materialSeed(draft)
            ? "summary"
            : null
          : "summary",
    );
    draftBaselineRef.current = null;
    setPendingDraft(null);
    setDraftReady(true);
  }

  function discardCreateDraft(): void {
    // 이어 만들지 않기로 했다 — 그 대본의 기록은 '취소'로 닫는다(사고 목록에 멈춘 건으로 안 뜨게).
    // 그림 값을 내고 저장 못 한 기록이면 닫지 않는다: 그건 취소가 아니라 처리할 사고다.
    if (isJobId(pendingDraft?.jobId)) void closeJobAsCancelled(pendingDraft.jobId);
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
  /*
   * 평소 옷(좋아하는 옷 색·엄마 아빠 평소 옷)은 이야기에 주지 않는다(clothes:false, 2026-09-29 저녁 사장님 "옷은 그 주제안에서
   * 랜덤으로 교체되게") — 주면 클로드가 그 옷을 책마다 그대로 옮겨 적는다. 옷은 이야기가 책마다 정한다(이 책의 옷 칸).
   */
  const child = {
    name: name.trim(),
    age: age ?? 0,
    gender,
    looks: looksToPrompt(loadChild()?.looks, { clothes: false }) || undefined,
    // 엄마·아빠 생김새(선택) — 안 주면 모델이 안경·수염을 지어낸다.
    parentLooks: {
      // 역할을 넘긴다 — 수염은 아빠만(가족 그림·설정 미리보기와 같은 문장).
      mom: parentLooksToPrompt(loadChild()?.parents?.mom, "mom", { clothes: false }) || undefined,
      dad: parentLooksToPrompt(loadChild()?.parents?.dad, "dad", { clothes: false }) || undefined,
    },
  };

  // '누구랑' 칩 — 아이 성별에 맞는 형제 호칭을 끼워 만든다.
  // 오늘의 이야기는 '혼자서'를 사람 칩 맨 끝에 두는 순서를 지킨다('직접 입력'은 그 뒤, whoQuestions 가 붙인다).
  const todayWho = [...TODAY_WHO.slice(0, -1), ...siblingOptions(gender), TODAY_WHO[TODAY_WHO.length - 1]];
  const imagineWho = [...WHO_OPTIONS, ...siblingOptions(gender)];

  // 동행 칩을 누르면(또는 껐다 켜면) 이름은 초기화한다 — "친구랑"에 넣은 이름이
  // "동생이랑"으로 바꿔도 남아 엉키는 걸 막는다.
  /** 성별 바꾸기 — 이미 고른 손위 형제 호칭(형/오빠·누나/언니)도 함께 맞춰 준다. */
  function chooseGender(g: Gender) {
    setGender(g);
    // 직접 적은 동행("형"이라고 적음)은 적은 말 그대로 둔다 — 바꾸면 칸의 글과 값이 어긋난다.
    if (whoOwn !== null) return;
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

  /**
   * '누구랑' 장의 보기 누르기 — 칩은 예전 그대로 chooseWho, '직접 입력'은 글 칸을 열고 닫는다.
   *
   * 적어 둔 동행에서 칩으로 바꿀 때는 그 칩을 바로 고른다. chooseWho 는 같은 값이면 해제하는데,
   * "엄마"라고 적어 둔 뒤(who = "엄마랑") '엄마랑' 칩을 누르면 해제로 읽혀 빈 값으로 넘어가 버린다.
   * 어느 쪽이든 동행이 바뀌니 이름·성별·친구 칸은 비운다(chooseWho 와 같은 이유).
   */
  function pickWho(t: string) {
    const own = t === OWN_INPUT.t;
    if (!own && whoOwn === null) {
      chooseWho(t);
      return;
    }
    // 처음 누르면 빈 칸을 연다(앞서 고른 칩은 풀린다). 다시 누르면 닫고 비운다 — 다른 칩의 '다시 누르면 해제'와 같다.
    setWhoOwn(own && whoOwn === null ? "" : null);
    setWho(own ? "" : t);
    setWhoName("");
    setWhoGender("");
    setFriends([{ name: "", gender: "" }]);
  }

  /** '어디서' 장의 보기 누르기 — pickWho 와 같은 틀. 칩을 고르면 직접 적은 곳은 지운다. */
  function pickPlace(t: string) {
    if (t === OWN_INPUT.t) {
      setPlaceOwn(placeOwn === null ? "" : null);
      setPlace("");
      return;
    }
    setPlace(placeOwn === null && place === t ? "" : t);
    setPlaceOwn(null);
  }

  /*
   * 재료 질문 — 한 장에 하나씩(QuestionFlow). 2026-09-28 사장님: 한 화면에 쭉 나열하면 복잡하다.
   *
   * 질문·보기·값은 예전 한 화면 그대로다 — 순서만 한 장씩으로 나눴다. '다음'은 예전처럼 seed(재료 하나 이상)가
   * 있을 때만 켜지므로, 질문 하나하나는 모두 건너뛸 수 있다.
   */
  function pickThemeGroup(label: string) {
    const next = themeGroup === label ? null : label;
    setThemeGroup(next);
    // **다른** 갈래로 바꿀 때만 앞 갈래의 세부 이야기를 비운다 — 세부 장이 새 갈래 칩만 보여 줘서, 남겨 두면
    // 안 보이는 채로 재료에 섞인다. 같은 카드를 다시 눌러 해제할 때는 예전처럼 그대로 둔다(다시 켜면 살아 있다).
    if (next === null) return;
    const items = THEME_GROUPS.find((g) => g.label === next)?.items ?? [];
    if (!items.some((it) => it.t === theme)) setTheme("");
  }

  function storyQuestions(): FlowQuestion[] {
    const textClass =
      "w-full rounded-2xl border-2 border-neutral-200 bg-white text-neutral-900 px-4 py-3 text-base font-bold outline-none focus:border-neutral-400";
    /** 칩과 글 칸이 같은 값을 쓰는 장 — 칸에 직접 적은 글이 있으면 칩을 눌러도 넘기지 않는다(덮인 것을 보고 고치게). */
    const typedOwn = (value: string, options: FlowOption[]) =>
      value.trim() !== "" && !options.some((o) => o.t === value);
    /*
     * 누구랑 — 두 장으로 나눈다. 동행 칩은 누르면 바로 넘어가고, 이름·성별·친구 칸은 바로 뒤 장에 따로 둔다.
     * (한 장에 두면 13개 칩 아래 이름 칸이 폰 화면 밖에 떠서, 눌러도 아무 일 없는 것처럼 보였다.)
     * 값(who·whoName·whoGender·friends)과 재료는 예전 그대로다.
     *
     * '직접 입력'(맨 끝 칩)은 이 장에 글 칸을 연다 — 적은 말에 조사를 붙인 것(ownWho: "사촌 형"→"사촌 형이랑")이
     * 칩 값과 똑같이 who 가 된다. 직접 적은 동행은 이름 장을 건너뛴다('혼자서'와 같은 hidden):
     *  · 적은 말이 곧 그 사람을 가리킨다("사촌 형", "태권도 사범님", "사촌 형 민준") — 이름을 또 물을 까닭이 없다.
     *  · 이름 장은 호칭으로 성별을 모르면 성별을 묻는데, "사촌 형"·"이모"에 여자/남자를 묻는 건 어색하다.
     *  · 서버(whoLine)는 어른인지를 정해 둔 호칭 목록(ADULT_COMPANIONS)으로만 안다. "태권도 사범님"에 성별을 실어
     *    보내면 '남자아이다 — 그림에서도 남자아이로'가 붙어 사범님이 어린이로 그려진다. 안 보내면 모델이 말에서 읽는다.
     */
    const whoQuestions = (title: string, options: FlowOption[]): FlowQuestion[] => {
      const term = companionTerm(who);
      const nameAnswer =
        who === "친구들이랑"
          ? friends
              .filter((f) => f.name.trim() || f.gender)
              .map((f) => f.name.trim() || f.gender)
              .join(", ")
          : [whoName.trim(), whoGender].filter(Boolean).join(" · ");
      return [
        {
          id: "who",
          title,
          answer: who,
          options: [...options, OWN_INPUT],
          value: whoOwn !== null ? OWN_INPUT.t : who,
          onPick: pickWho,
          holdOn: (t) => t === OWN_INPUT.t,
          children: whoOwn !== null && (
            <input
              value={whoOwn}
              onChange={(e) => {
                const typed = e.target.value.slice(0, 20);
                setWhoOwn(typed);
                setWho(ownWho(typed));
              }}
              maxLength={20}
              autoFocus
              aria-label={`${title} 직접 적기`}
              placeholder="예: 사촌 형, 태권도 사범님"
              className={textClass}
            />
          ),
        },
        {
          id: "whoName",
          title: `함께 나오는 ${term} 이름은요?`,
          hidden: !who || who === "혼자서" || whoOwn !== null,
          answer: nameAnswer,
          children: (
            <WhoNameInput
              who={who}
              value={whoName}
              onChange={setWhoName}
              gender={whoGender}
              onGenderChange={setWhoGender}
              friends={friends}
              onFriendsChange={setFriends}
              accent={accent}
              bestFriend={myBestFriend}
            />
          ),
        },
      ];
    };

    if (storyMode === "today") {
      return [
        {
          // 어디서 — 칩 또는 '직접 입력' 칸(적은 곳이 칩과 똑같이 place 가 된다).
          id: "place",
          title: "어디에서 있었던 일이에요?",
          answer: place,
          options: [...TODAY_PLACES, OWN_INPUT],
          value: placeOwn !== null ? OWN_INPUT.t : place,
          onPick: pickPlace,
          holdOn: (t) => t === OWN_INPUT.t,
          children: placeOwn !== null && (
            <input
              value={placeOwn}
              onChange={(e) => {
                const typed = e.target.value.slice(0, 20);
                setPlaceOwn(typed);
                setPlace(typed.trim());
              }}
              maxLength={20}
              autoFocus
              aria-label="어디에서 있었던 일이에요? 직접 적기"
              placeholder="예: 태권도장, 사촌 집"
              className={textClass}
            />
          ),
        },
        ...whoQuestions("누구랑 있었어요?", todayWho),
        {
          // 무슨 일 — 여기만 자유롭게. 말로도 글로도 받는다 (실경험의 핵심).
          id: "event",
          title: "어떤 일이 있었어요?",
          answer: todayEvent.trim(),
          children: (
            <>
              {/* 마이크는 지금 모든 기기에서 숨김(VoiceInput 의 VOICE_INPUT_ENABLED) — 켜면 여기 뜬다. */}
              <VoiceInput onResult={(t) => setTodayEvent(t)} />
              <textarea
                value={todayEvent}
                onChange={(e) => setTodayEvent(e.target.value.slice(0, 200))}
                rows={3}
                aria-label="어떤 일이 있었어요?"
                placeholder="예: 그네를 타다가 넘어졌는데 친구가 일으켜 줬어요"
                className={textClass}
              />
            </>
          ),
        },
        {
          id: "feeling",
          title: "그때 기분이 어땠어요?",
          answer: feeling,
          options: FEELINGS,
          value: feeling,
          onPick: (t) => setFeeling(feeling === t ? "" : t),
        },
        /*
         * 어떻게 끝났나 — 이게 있어야 실제와 다른 결말(혼난 일을 칭찬으로 등)이 안 나온다.
         * 칩으로 고르거나 직접 적는다. 칩만 두면 네 가지 결말만 돌고 돌아 "또 같은 마무리"가 된다.
         */
        {
          id: "ending",
          title: "일이 어떻게 끝났어요?",
          answer: ending.trim(),
          options: TODAY_ENDINGS,
          value: ending,
          onPick: (t) => setEnding(ending === t ? "" : t),
          holdOn: () => typedOwn(ending, TODAY_ENDINGS),
          children: (
            <input
              value={ending}
              onChange={(e) => setEnding(e.target.value.slice(0, 120))}
              placeholder="있었던 그대로 적어도 돼요 · 예: 결국 사과하고 다시 같이 놀았어요"
              aria-label="일이 어떻게 끝났어요? 직접 적기"
              className={textClass}
            />
          ),
        },
      ];
    }

    if (storyMode === "emotion") {
      return [
        {
          id: "emotion",
          title: "어떤 마음이 들었어요?",
          answer: emotion,
          options: EMOTIONS,
          value: emotion,
          onPick: (t) => setEmotion(emotion === t ? "" : t),
        },
        {
          // 언제 그런 마음이 들었나 — 흔한 상황 칩(백지 공포 제거)을 누르거나 말·글로 적는다.
          id: "situation",
          title: "언제 그런 마음이 들었어요?",
          answer: situation.trim(),
          options: EMOTION_TIMES,
          value: situation,
          onPick: (t) => setSituation(situation === t ? "" : t),
          holdOn: () => typedOwn(situation, EMOTION_TIMES),
          layout: "wide",
          children: (
            <>
              <VoiceInput onResult={(t) => setSituation(t)} />
              <textarea
                value={situation}
                onChange={(e) => setSituation(e.target.value.slice(0, 200))}
                rows={2}
                aria-label="언제 그런 마음이 들었어요? 직접 적기"
                placeholder="직접 적어도 돼요 · 예: 동생이 내 장난감을 가져갔을 때"
                className={textClass}
              />
            </>
          ),
        },
        ...whoQuestions("누구랑 있었어요?", todayWho),
      ];
    }

    /*
     * 상상 이야기 — 갈래 카드 → 세부 칩 → 누구랑 → 무슨 일 → 더 넣을 것.
     *
     * 상상·감정의 '어떻게 끝나면 좋을까요?'(바라는 마무리 칩 6개 + 직접 적기) 장은 2026-09-28 뺐다.
     * 예전 한 화면에도 있었지만 그 답은 서버로 가지 않았다 — requestOutline 의 material 에 ending 이 없고,
     * buildStoryMaterial 은 ""를 보낸다. 효과 없는 장이 한 번 더 누르게만 해서 '최대한 심플'에 어긋났다.
     * 되살리려면 칩 목록(WISH_ENDINGS, 커밋 d813142)과 함께 두 material 에 ending 을 실어야 한다
     * (서버 anthropic.ts 는 상상·감정의 ending 을 이미 받을 줄 안다).
     */
    const group = THEME_GROUPS.find((g) => g.label === themeGroup);
    return [
      {
        id: "group",
        title: `${name}의 동화, 무슨 이야기로 할까요?`,
        answer: themeGroup ?? "",
        options: THEME_GROUPS.map((g) => ({ t: g.label, icon: g.icon })),
        value: themeGroup ?? "",
        onPick: pickThemeGroup,
        layout: "cards",
      },
      {
        id: "theme",
        title: "그중에서 무엇으로 할까요?",
        hidden: !group,
        answer: theme,
        options: group?.items ?? [],
        value: theme,
        onPick: (t) => setTheme(theme === t ? "" : t),
      },
      ...whoQuestions("누구랑 함께할까요?", imagineWho),
      {
        id: "happening",
        title: "무슨 일이 생길까요?",
        answer: happening,
        options: HAPPENING_OPTIONS,
        value: happening,
        onPick: (t) => setHappening(happening === t ? "" : t),
        layout: "wide",
      },
      {
        id: "extra",
        title: "더 넣고 싶은 이야기가 있나요?",
        answer: extra.trim(),
        children: (
          <>
            <VoiceInput onResult={(t) => setExtra(t.slice(0, 200))} />
            <input
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              maxLength={200}
              aria-label="더 넣고 싶은 이야기"
              placeholder={(group?.example ?? "예: 마법 숲에서 반짝이는 보물을 찾아요").replace(
                "OO",
                name.trim() || "우리 아이",
              )}
              className={textClass}
            />
          </>
        ),
      },
    ];
  }

  /** '이렇게 만들어요' 한 줄 — 예전 한 화면 끝의 🌱 미리보기와 같은 문장. */
  function storySummary(): React.ReactNode {
    if (!seed) return null;
    const hero = name.trim() || "우리 아이";
    if (storyMode === "today") {
      return <>🌱 {hero}의 오늘 이야기 — <span className="text-neutral-800">{seed}</span></>;
    }
    if (storyMode === "emotion") {
      return <>🌱 {hero}의 마음 이야기 — <span className="text-neutral-800">{seed}</span></>;
    }
    return <>🌱 {hero}의 <span className="text-neutral-800">{seed}</span> 이야기</>;
  }

  /** 재료가 하나도 없을 때 요약 장의 한 줄 — seed 에 들어가는 질문만 말한다(갈래·마무리만으로는 못 만든다). */
  const storyEmptyHint =
    storyMode === "today"
      ? "어디서·누구랑·무슨 일·기분 중 하나는 있어야 만들 수 있어요."
      : storyMode === "emotion"
        ? "마음·언제·누구랑 중 하나는 있어야 만들 수 있어요."
        : "세부 이야기·누구랑·무슨 일·더 넣을 이야기 중 하나는 있어야 만들 수 있어요.";

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
   * 줄거리 짓기 — /api/outline. 회원 토큰은 들지 않는다(글 값 약 22원은 우리가 낸다).
   *
   * 줄거리는 부모에게 따로 보여 주지 않고 곧바로 대본으로 이어 쓴다(makeScript·redoScript).
   * 실패하면 던진다 — 부른 쪽이 알린다. 이때는 대본 값이 나가지 않는다(대본 요청을 보내지 않는다).
   */
  async function requestOutline(signal: AbortSignal): Promise<Outline> {
    const r = await authedFetch("/api/outline", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: outlineRequestBody(),
      signal,
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error ?? "줄거리를 만들지 못했어요.");
    return data.outline as Outline;
  }

  /**
   * 줄거리 요청 본문(JSON 글) — 아이·재료·장면 수·분위기.
   * '대본을 못 받은 줄거리'를 다시 써도 되는지(재료가 그대로인지) 가리는 열쇠로도 쓴다(pendingPlot.basis).
   */
  function outlineRequestBody(): string {
    return JSON.stringify({
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
    });
  }

  /*
   * 성우 화면에서 — 대본을 기다리다 끊긴 줄거리를 이번 '대본 만들기'가 다시 쓸지(재료가 그대로일 때만),
   * 그리고 단추를 막을 까닭(권수 상한·잔액). 이어 쓸 때는 잔액으로 막지 않는다(lib/create-flow makeScriptBlock).
   */
  const resumePlot = step === "style" ? reusablePlot(pendingPlot, outlineRequestBody()) : null;
  const makeBlock = makeScriptBlock({ shortOnTokens, bookLimitReached, resuming: resumePlot !== null });

  /**
   * 첫 단추 '대본 만들기' — 줄거리를 짓고, 나오자마자 대본까지 이어 쓴다(한 번 기다림).
   *
   * 2026-09-29 사장님: "'이야기 짓기'가 대본 완성인가 생각할 것 같아 … 너무 과정 과정이 길어지는 것 같아서."
   * 예전엔 줄거리 확인 화면('이 이야기로 만들까요?')을 한 번 거친 뒤 '네, 만들게요'에서 대본 값을 냈다.
   * 이제 그 화면 없이 곧바로 대본 화면에 내린다 — 읽고 고치는 곳은 대본 화면 하나다.
   *
   * 값: 대본 값은 예전과 똑같이 대본을 쓸 때 서버가 받는다(charge_story). 단추에 값을 밝혀 두었다.
   *  · 줄거리가 안 나오면 대본 요청을 보내지 않으므로 값이 나가지 않는다.
   *  · 대본이 실패하면 서버가 되돌린다(refund_story).
   *  · 줄거리가 온 뒤 대본을 기다리다 끊기면 값만 나갔을 수 있다 — 그 줄거리를 pendingPlot 에 적어 두고,
   *    다음에 누르면 새로 짓지 않고 그 줄거리로 쓴다(서버가 값 낸 줄을 찾아 무료로 쓴다. 예전 줄거리 화면과 같다).
   * 새 재료로 새 대본을 만드는 것이라 값을 새로 받고, 앞 대본의 셈(다시 만들기 횟수 등)은 처음부터다.
   */
  async function makeScript() {
    if (busyRef.current) return;
    // 단추도 막혀 있지만 한 번 더 — 값이 걸린 요청이다.
    const basis = outlineRequestBody();
    const reuse = reusablePlot(pendingPlot, basis);
    if (makeScriptBlock({ shortOnTokens, bookLimitReached, resuming: reuse !== null })) return;
    busyRef.current = true;
    setBusy(true);
    setBusyKind("script");
    // 끊긴 줄거리로 이어 쓰면 줄거리 짓기를 건너뛴다 — 기다림 막도 곧바로 '대본을 쓰고 있어요'.
    setBusyStage(reuse ? "story" : "outline");
    setError("");
    // 새 재료로 새 대본 = 다른 이야기다. 대본을 새로 만들면 글 값을 다시 받는다.
    // 앞 대본의 기록은 '취소(다른 대본으로 바꿈)'로 닫고, 새 대본은 새 줄에 적는다.
    if (jobIdRef.current) void closeJobAsCancelled(jobIdRef.current);
    setJobId(null);
    setScriptCharged(false);
    setPaidOutline(null);
    setStoryRewrites(0);
    setReplots(0);
    setLocationDetail("");
    locationTouchedRef.current = false;
    const ac = new AbortController();
    abortRef.current = ac;
    // 다음에 또 만들 때 아이 정보를 다시 안 묻도록 저장해 둔다.
    saveChild({ name: name.trim(), age, gender });
    try {
      const plot = reuse ?? (await requestOutline(ac.signal));
      // 대본 요청을 보내기 전에 적는다 — 이 뒤로 끊기면 서버가 값을 받았을 수 있다(임시저장에도 담긴다).
      if (!reuse) setPendingPlot({ plot, basis });
      setBusyStage("story");
      // again: false — 서버가 이 줄거리의 값 낸 줄을 찾으면 무료(다시 쓰기 한 번), 없으면 값을 받는다.
      if (await writeScript(plot, { again: false, keepPaidJob: false, newPlot: true, signal: ac.signal })) {
        setPendingPlot(null);
      }
    } catch (e) {
      // ESC로 취소한 경우는 오류가 아니다 — 조용히 성우 화면에 남는다(줄거리는 pendingPlot 에 남아 다음에 이어 쓴다).
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
    // 부모가 고친 글도 만든 대본과 같이 부호만 손본다(빠진 마침표·띄어쓰기) — 성우가 문장 끝에서 쉬게.
    // 글자는 한 자도 바꾸지 않는다(lib/story-punctuation tidyPunctuation).
    const text = tidyPunctuation(pageDraft.normalize("NFC").trim());
    if (!text) {
      setEditingPage(null);
      return; // 빈 쪽은 만들지 않는다 — 고치기 전 문장을 그대로 둔다
    }
    // 실제로 바뀌었을 때만 '고쳤음' — 다시 만들기 전에 고친 것이 사라진다고 묻는다.
    if (story && story.pages[index]?.text !== text) setScriptEdited(true);
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
    if (story && story.title !== title) setScriptEdited(true);
    setStory((prev) => (prev ? { ...prev, title } : prev));
    setEditingTitle(false);
  }

  /**
   * 대본 쓰기 — /api/story. 대본 값은 서버가 받는다(charge_story). 성공하면 대본 화면으로 간다.
   *
   * @param plot 대본으로 풀어 쓸 줄거리
   * @param opts.again 이미 값을 낸 대본을 다시 만드는 것(같은 줄거리로 다시 쓰기·다른 이야기로 새로 짓기).
   *   값은 더 받지 않는다 — '값을 낸 줄거리'(paidPlot)를 함께 보내 서버가 그 줄거리의 무료 횟수로 센다.
   *   이걸 안 보내면 새 줄거리는 지문이 달라 값을 또 받는다. 그래서 보낼 것이 없으면 요청하지 않는다.
   * @param opts.keepPaidJob 그림 값을 내고 책장에 못 넣은 기록이 있다 — 그 기록을 되열지 않게 기록 id 를 안 보낸다.
   * @param opts.newPlot 새 줄거리다 — 장소 칸을 새 이야기에서 다시 뽑는다(앞 이야기의 장소가 남지 않게).
   * @returns 대본을 받았으면 true. 옛 DB(값을 서버가 안 받음)에서 잔액이 모자라 멈췄으면 false(알림은 이미 띄웠다).
   *   요청이 실패하면 던진다 — 지금 화면·대본은 그대로다.
   */
  async function writeScript(
    plot: Outline,
    opts: { again: boolean; keepPaidJob: boolean; newPlot: boolean; signal: AbortSignal },
  ): Promise<boolean> {
    const { again, keepPaidJob, newPlot, signal } = opts;
    const anchor = again ? paidPlot(scriptCharged, paidOutline, outline) : null;
    if (again && !anchor) throw new Error("다시 만들 대본을 찾지 못했어요. 새로 만들기를 눌러 주세요.");
    const r = await authedFetch("/api/story", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        child,
        outline: plot,
        material: buildStoryMaterial(),
        mood: mood.ko,
        longer: longerStory,
        narrationStyle,
        // 다시 만들기면 같은 기록을 고치게 한다(새 줄을 만들지 않게).
        jobId: again && !keepPaidJob ? jobIdRef.current : null,
        // 다시 만들기면 값을 낸 줄거리로 센다 — 새로 지은 줄거리라도 값을 또 받지 않는다(서버 storyChargeKey).
        ...(anchor ? { paidOutline: anchor } : {}),
      }),
      signal,
    });
    const data = await r.json();
    // 서버가 만든(또는 고친) 기록 id — 실패했어도 받아 둔다(실패 기록과 이어지게).
    if (isJobId(data?.jobId)) setJobId(data.jobId);
    if (!r.ok) {
      // 무료 횟수를 다 썼다는 서버 말("같은 줄거리로 다시 쓰기 …")은 새로 짓기에는 틀려서 쉬운 말로 바꾸고, 남은 횟수도 0으로 맞춘다.
      if (again && isRedoExhausted(r.status, data?.error)) {
        setStoryRewrites(pricing.max_free_rewrites);
        throw new Error("무료로 다시 만들기를 다 썼어요. 문장을 눌러 직접 고치실 수 있어요.");
      }
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
    /*
     * 값은 이제 서버가 받는다 — 만들기 전에, 그리고 '다시 만들기' 횟수까지 DB 가 센다
     * (supabase-setup.sql 의 charge_story).
     *
     * 예전엔 여기 브라우저에서 깎았다. 그래서 경로를 직접 부르면 대본이 공짜였다.
     * 서버가 이미 받았으면(charge 가 오면) 여기서는 잔액 표시만 맞춘다.
     * 아직 SQL 을 안 돌린 DB 면 charge 가 없다 — 그때만 예전처럼 여기서 깎는다(처음 대본만).
     */
    const charge = data.charge as
      | { charged: number; rewrites: number; tokens: number }
      | null
      | undefined;
    if (charge) {
      setTokens(charge.tokens);
      setStoryRewrites(charge.rewrites);
    } else if (!master && !again) {
      const cost = scriptCostOf(story.pages.length, pricing);
      if (!(await spendTokens(cost, "story"))) {
        setError(`토큰이 부족해요. 대본을 만들려면 ${cost}개가 필요해요.`);
        return false; // 성우 화면에 그대로 남는다 — 대본은 버린다
      }
      setTokens((t) => Math.max(0, t - cost));
    }
    // 처음 값을 낸 대본이면 그 줄거리를 '값을 낸 줄거리'로 적어 둔다 — 다시 만들 때 이것으로 센다.
    // 다시 만들기인데 적힌 것이 없으면(옛 임시저장) 이번에 보낸 것을 적는다 — 아래 setOutline 이 줄거리를
    // 새 것으로 바꾼 뒤에도 다음 다시 만들기가 값 낸 줄거리로 세어지게(안 그러면 두 번째에 값이 또 나갔다).
    if (!again) setPaidOutline(plot);
    else if (!paidOutline && anchor) setPaidOutline(anchor);
    setScriptCharged(true);
    if (!charge && again) setStoryRewrites((n) => n + 1);
    setEditingPage(null); // 새 대본이니 고치던 자리는 닫는다
    setEditingTitle(false);
    setScriptEdited(false); // 새 대본 — 부모가 고친 것이 아직 없다
    /*
     * 장소 칸을 이야기에서 뽑아 미리 채운다.
     *
     * 빈칸을 내밀면 대부분 그냥 넘어간다 — 뭘 적어야 할지 모르기 때문이다.
     * 클로드는 이미 쪽마다 `장소: 골목 — 회색 시멘트 담과 물웅덩이.`를 적어 뒀으니,
     * 그걸 사람이 읽는 한 줄로 바꿔 두면 부모는 고치기만 하면 된다.
     * 이미 손댄 값은 건드리지 않는다 — 단, 새 줄거리면 앞 이야기의 장소라 새로 뽑는다.
     */
    if (newPlot) locationTouchedRef.current = false;
    if (!locationTouchedRef.current) {
      setLocationDetail(suggestLocationDetail(story.pages.map((p) => p.imagePrompt)));
    }
    setOutline(plot);
    setStory(story);
    setStep("story");
    return true;
  }

  /**
   * 다시 만들기가 끝났다고 잠깐 알리고 새 대본의 맨 위(제목·첫 쪽)를 보여 준다.
   * 기다림 막이 걷히면 부모는 아래 '다시 만들기' 칸에 그대로 있고, 같은 이야기로 다시 쓰면 제목도 같아서
   * 바뀐 줄 몰랐다.
   */
  function showRedoDone(kind: "same" | "new") {
    if (redoNoteTimerRef.current !== null) window.clearTimeout(redoNoteTimerRef.current);
    setRedoNote(kind === "new" ? "새 이야기로 대본을 다시 만들었어요 ✓" : "같은 이야기로 문장을 새로 썼어요 ✓");
    redoNoteTimerRef.current = window.setTimeout(() => setRedoNote(""), 6000);
    const smooth = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // 새 대본이 그려진 다음에 올린다.
    window.requestAnimationFrame(() => {
      pageListRef.current?.scrollTo({ top: 0 });
      window.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
    });
  }

  /**
   * 대본 화면의 '다시 만들기' — 토큰은 더 받지 않는다(무료 횟수 안에서, 서버가 센다).
   *  · "same" 같은 이야기로 문장만 다시 쓰기 — 줄거리는 그대로, 글만 새로.
   *  · "new"  다른 이야기로 새로 짓기 — 줄거리부터 새로 짓고 대본까지 이어 쓴다.
   *           (예전 줄거리 화면의 '다른 이야기로 다시 짓기'를 옮겼다. 값을 낸 뒤라 값을 낸 줄거리로 센다.)
   * 둘은 무료 횟수를 함께 쓴다(lib/create-flow redoLeft). 실패하면 지금 대본을 그대로 두고 알린다.
   */
  async function redoScript(kind: "same" | "new") {
    if (!outline || busyRef.current) return;
    /*
     * 대본 값을 이미 받은 뒤 다시 부르는 것 = 다시 만들기. 값은 더 받지 않으니 횟수로 막는다.
     * 값을 냈다는 표시가 없는 대본(있어선 안 되지만 깨진 임시저장 등)은 다시 만들지 않는다 —
     * 그대로 보내면 서버가 새 대본 값을 받는데, 단추는 '토큰 없이'라고 말하고 있다.
     */
    if (!scriptCharged) {
      setError("이 대본은 다시 만들 수 없어요. ‘재료 바꿔 새로 만들기’를 눌러 새로 만들어 주세요.");
      return;
    }
    const left = kind === "new" ? redo.replot : redo.rewrite;
    if (left !== null && left <= 0) {
      setError("무료로 다시 만들기를 다 썼어요. 문장을 눌러 직접 고치실 수 있어요.");
      return;
    }
    // 부모가 고친 문장·제목은 새 대본으로 바뀌며 사라진다(되돌릴 길이 없다) — 고쳤으면 먼저 묻는다.
    if (scriptEdited && !window.confirm("고치신 문장은 새 대본으로 바뀌면서 사라져요.\n그래도 다시 만들까요?")) {
      return;
    }
    /*
     * 그림 값을 내고 책장에 못 넣은 책이 이 대본에 있으면 먼저 묻는다.
     * 다시 만들면 대본이 바뀌어 그 책을 이 화면에서 다시 저장할 길이 없어진다(기록은 서버에 남아
     * 마스터가 되살릴 수 있다). 기록 id 도 보내지 않는다 — 값 낸 기록을 되열지 않게(서버도 막는다).
     */
    const keepPaidJob = unsavedPaid;
    if (
      keepPaidJob &&
      !window.confirm(
        "그림 값을 낸 책이 아직 책장에 들어가지 않았어요.\n다시 만들면 그 책은 이 화면에서 다시 저장할 수 없어요. (고객센터에서는 찾아 드릴 수 있어요)\n그래도 다시 만들까요?",
      )
    ) {
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setBusyKind(kind === "new" ? "script" : "story");
    setBusyStage("outline");
    setError("");
    setRedoNote("");
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      let plot = outline;
      if (kind === "new") {
        // 줄거리 짓기 값은 누를 때 나간다(우리 몫) — 실패해도 한 번으로 센다.
        setReplots((n) => n + 1);
        plot = await requestOutline(ac.signal);
        setBusyStage("story");
      }
      if (await writeScript(plot, { again: true, keepPaidJob, newPlot: kind === "new", signal: ac.signal })) {
        showRedoDone(kind);
      }
    } catch (e) {
      // ESC로 취소한 경우는 오류가 아니다 — 지금 대본이 그대로 남는다.
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
    /*
     * 못 그린 이유를 모아 둔다.
     *
     * 예전에는 실패를 통째로 삼키고 images[i] = null 만 했다. 그래서 부모 화면에는
     * 아무 말도 안 뜨고, 뷰어는 그림 없는 쪽을 앱 배경으로 채웠다 — 베타 제보
     * "2페이지부터 전부 앱 배경 이미지로 나온다"가 바로 이것이다.
     * 왜 안 됐는지를 알아야 기다렸다 다시 할지, 오늘은 그만둘지 정할 수 있다.
     */
    const drawFailures: string[] = [];
    /*
     * 참조로 다시 올려보낼 그림은 줄여서 보낸다.
     *
     * 쪽 그림 한 장은 2~3MB인데, 우리는 그 그림을 뒤 쪽의 그림체·장소 기준으로
     * 서버에 다시 올린다. 원본 그대로 실으면 캐릭터 시트·장소 시트와 합쳐 요청이
     * 서버 한도(4.5MB)를 넘어 413으로 거절당한다. 413은 본문이 JSON이 아니라
     * 오류 이유조차 안 남아, 화면에는 "그림 3장을 못 그렸어요"만 뜨고 까닭이 없었다.
     * 기준 그림은 얼굴·색·그림체만 보면 되므로 1024px면 충분하다.
     */
    const shrunkRefs = new Map<string, string>();
    const asReference = async (dataUrl: string) => {
      if (!dataUrl) return "";
      const hit = shrunkRefs.get(dataUrl);
      if (hit) return hit;
      const small = await shrinkDataUrl(dataUrl, 1024, 0.82);
      if (shrunkRefs.size > 8) shrunkRefs.clear();
      shrunkRefs.set(dataUrl, small);
      return small;
    };
    locationSheetsRef.current = [];
    /*
     * 그리다 만 것이 있으면 이어서 그린다.
     *
     * 시트·장소 시트·그린 쪽을 IndexedDB에 두고, 같은 대본(내용+그림체)으로 다시 오면
     * 있는 것은 건너뛴다. 그림 단계에서 앱을 닫아도 이미 낸 돈이 헛되지 않는다.
     */
    const progressKey = drawProgressKey(draftOwner ?? "guest", s, artStyle);
    drawProgressKeyRef.current = progressKey;
    const saved = await loadDrawProgress(progressKey);
    const counts: DrawCounts = { ...EMPTY_COUNTS, ...(saved?.counts ?? {}) };
    drawCountsRef.current = counts;
    setSaveFailure(null);

    /*
     * 만들기 기록 — 그리기 시작. 부모가 대본 화면에서 고친 본문·그림체·장소 설명까지 원고로 남긴다
     * (마스터가 되살리거나 빈 쪽을 다시 그릴 때 이 원고를 쓴다).
     * 쪽 진행은 몇 초마다 묶어서 적는다 — 쪽마다 쓰면 요청이 많고, 안 쓰면 30분 멈춤 판정에 걸린다.
     */
    const pageFailures: JobFailure[] = [];
    drawFailuresRef.current = pageFailures;
    const failedPages = new Set<number>();
    /*
     * 값을 내고 저장 못 한 책이면 그 값을 낸 기록으로 잇는다(2026-09-14 고침).
     * 임시저장은 그리기·완성 단계에서 안 쓰여서, 그때 열거나 갈아탄 기록 id 는 임시저장에 없다.
     * 표시를 먼저 안 보면 여기서 빈 'drawing' 줄을 새로 열었다가 finish 에서 표시의 기록으로 갈아타,
     * 영영 멈춘 줄이 남고 하루 60줄 상한도 깎였다.
     */
    const paidAtStart = loadPaidMarker(progressKey);
    if (paidAtStart?.jobId) setJobId(paidAtStart.jobId);
    // 결제 요청을 보낸 채 창이 닫혔던 기록도 그 줄로 잇는다 — 값이 붙었는지는 아래 읽기와 finish 가 본다.
    else {
      const chargingAtStart = loadChargingMarker(progressKey);
      if (chargingAtStart?.jobId) setJobId(chargingAtStart.jobId);
    }
    const drawingManuscript = {
      ...storyManuscript(s),
      artStyleId: artStyle,
      shape: screenShape,
      locationDetail: locationDetail.trim() || undefined,
    };
    // 기록 열기·원고 적기는 기록 줄에 세워 뒤에서 한다 — 기다리지 않는다(기록은 보조 수단).
    jobQueueRef.current = jobQueueRef.current
      .then(async () => {
        const sb = getSupabase();
        if (!jobIdRef.current) {
          // 기록 없이 온 대본 — 이 기능을 넣기 전에 만든 임시저장이거나, 서버가 기록을 못 만든 경우.
          // 여기서라도 한 줄을 연다. 그래야 그림 값이 기록에 이어진다(못 열면 예전처럼 기록 없이 간다).
          const uid = await currentUid();
          const opened = uid
            ? await insertJob(sb, { owner: uid, status: "drawing", page_count: s.pages.length, manuscript: drawingManuscript })
            : null;
          if (opened && !jobIdRef.current) setJobId(opened);
          return;
        }
        const id = jobIdRef.current;
        const base = { status: "drawing", page_count: s.pages.length, error: null };
        /*
         * 값을 낸 기록(책 id·그림 값이 붙음)의 원고는 덮지 않는다(2026-09-14 고침).
         * 그 원고에는 저장 직전에 적은 올린 그림 주소가 들어 있다 — 마스터가 책을 되살리는 재료다.
         * 그림 없는 대본 원고로 덮은 뒤 도중에 멈추면 그림 없는 책만 되살아난다.
         * 읽지 못하면(모름) 역시 덮지 않는다.
         */
        if (paidAtStart) {
          await updateJob(sb, id, base);
          return;
        }
        const read = await readJobResult(sb, id);
        const paid = !read.ok || Boolean(read.job && (read.job.book_id || read.job.illustration_entry));
        await updateJob(sb, id, paid ? base : { ...base, manuscript: drawingManuscript });
      })
      .catch(() => false);
    let lastReport = 0;
    let reportTimer: ReturnType<typeof setTimeout> | null = null;
    const reportDraw = (now = false) => {
      const send = () => {
        reportTimer = null;
        lastReport = Date.now();
        void recordJob({
          drawn: Math.min(200, images.filter(Boolean).length),
          draw_failed: Math.min(200, failedPages.size),
          failures: capFailures(pageFailures),
        });
      };
      if (now) {
        if (reportTimer) clearTimeout(reportTimer);
        send();
      } else if (Date.now() - lastReport > 5000) {
        send();
      } else if (!reportTimer) {
        reportTimer = setTimeout(send, 5000);
      }
    };
    const persist = () =>
      void saveDrawProgress({
        key: progressKey,
        savedAt: 0,
        sheet: sheetImageRef.current,
        sheetFixed: [...fixedCastRef.current],
        sheetPortraits: [...sheetPortraitsRef.current],
        sheetOrder: [...sheetOrderRef.current],
        sheetOutfits: [...sheetOutfitsRef.current],
        locationSheets: locationSheetsRef.current,
        images: [...images],
        passed: [...passedRef.current],
        counts: { ...counts },
      });
    const passedRef = { current: [] as boolean[] };
    try {
      const child = loadChild();
      /*
       * 이 책의 옷이 있는 대본(2026-09-29 저녁~)이면 좋아하는 옷 색·평소 옷을 그림에 주지 않는다 — 이 책의 옷과 부딪친다.
       * 옛 대본(옷 칸 없음)은 예전 그대로.
       */
      const outfitStory = s.characters.some((c) => c.outfit);
      const heroLooks = looksToPrompt(child?.looks, { clothes: !outfitStory });
      // 그림 모델에는 영어로 — 영어 규칙 사이에 한국어 한 줄이 끼는 것보다 확실히 읽힌다.
      const heroLooksEn = looksToDrawingPrompt(child?.looks, { clothes: !outfitStory });
      let sheet = saved?.sheet ?? null;
      // 이어 그리기면 그 시트에 고정 얼굴이 붙었던 이름 그대로(옛 보관본엔 없다 = 고정 얼굴 없이 그린 시트).
      fixedCastRef.current = new Set(sheet ? (saved?.sheetFixed ?? []) : []);
      // 원본 그림 주소·시트 순서도 그대로(옛 보관본엔 없다 = 쪽마다 시트만 보고 그린다).
      sheetPortraitsRef.current = sheet ? (saved?.sheetPortraits ?? []) : [];
      sheetOrderRef.current = sheet ? (saved?.sheetOrder ?? []) : [];
      sheetOutfitsRef.current = sheet ? (saved?.sheetOutfits ?? []) : [];
      if (!sheet) {
        /*
         * 우리 가족 캐릭터의 고정 얼굴 — 이야기에 나오는 사람만, 고정한 그림(portrait)만(lib/family-cast).
         * 가족 규칙(사장님 2026-09-28): 고정한 사람은 동화마다 그 모습 그대로. 예전엔 시트에 얼굴이 안 가서
         * 고정한 하온과 다른 하온이 그려졌다(2026-09-29 '하온이의 나뭇잎 보물찾기').
         * 다른 기기에서 방금 고정한 얼굴도 잡게 서버 가족을 한 번 더 읽는다(3초까지만 — 못 읽으면 이 기기 값).
         */
        const family = (await waitAtMost(loadChildRemote(), 3000, null))?.family ?? child?.family;
        const portraits = castPortraits(s.characters, family);
        /*
         * withCard — 이 책의 옷을 옷 카드로 입혀도 되나(서버는 이 칸이 true 일 때만 옷 카드를 그린다). 이 화면은 sheetOutfits 를 받아
         * 쪽 그림·책에 넘기므로 true 를 보낼 수 있다 — 배포 전에 열어 둔 화면은 이 칸이 없어 값만 나가는 옷 카드를 부르지 않는다.
         */
        const requestSheet = async (withPortraits: boolean, withCard = false) => {
          const res = await authedFetch("/api/character-sheet", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              characters: s.characters,
              ...(withCard ? { outfitCard: true } : {}),
              artStyleId: artStyle,
              drawing, // 아이가 그린 주인공(선택) — 있으면 이 그림에서 캐릭터를 따온다
              // 설정에 저장해 둔 아이 특징(머리·안경·옷 색·주근깨…) — 주인공을 "우리 애 같게".
              looks: heroLooks,
              looksEn: heroLooksEn,
              // 나이·성별은 이야기에만 가고 시트에는 안 갔다 — 다섯 살이 여덟 살 얼굴로 나오던 구멍.
              heroAge: age ?? child?.age ?? null,
              heroGender: gender !== "unspecified" ? gender : child?.gender,
              // 엄마·아빠도 부모가 고른 대로 — 안경은 여기 적혔을 때만 그린다.
              // 이 책의 옷이 있으면 평소 옷은 빼고 — 옷은 등장인물 설명(이 책의 옷)을 따른다.
              adultLooks: {
                엄마: parentLooksToPrompt(child?.parents?.mom, "mom", { clothes: !outfitStory }) || undefined,
                아빠: parentLooksToPrompt(child?.parents?.dad, "dad", { clothes: !outfitStory }) || undefined,
              },
              // 고정 얼굴 — 서버에 필요한 것만(등장인물 이름·참고 그림 주소·사람 id). 서버가 주소를 다시 검사한다.
              // 키(cm)·머리 비율 — 수채화 책은 서버가 원본 그림으로 시트를 짠다(키대로 발끝 맞춤, 얼굴 오리기. lib/sheet-compose).
              ...(withPortraits
                ? {
                    portraits: portraits.map((p) => {
                      const member = family?.find((m) => m.id === p.memberId);
                      return {
                        name: p.name,
                        ref: p.ref,
                        memberId: p.memberId,
                        ...(member
                          ? {
                              heightCm: heightFor(member, { age: age ?? child?.age ?? null, parents: child?.parents }),
                              headRatio: member.portrait?.headRatio,
                            }
                          : {}),
                      };
                    }),
                  }
                : {}),
            }),
            signal: ac.signal,
          });
          // .json()을 ok 검사보다 먼저 부르면, 프록시가 HTML 오류 페이지를 주는 순간
          // "Unexpected token '<'" 같은 알 수 없는 말이 부모에게 그대로 뜬다.
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
            image?: string;
            code?: string;
            fixed?: unknown;
            /** 시트에 선 순서(왼쪽부터) — 원본 픽셀로 짠 시트만 */
            order?: unknown;
            /** "portraits"(고정 가족뿐) | "mixed"(나머지만 AI) — 없으면 예전 AI 시트 */
            composed?: unknown;
            /** 옷 카드로 이 책의 옷을 입은 고정 가족 이름 */
            sheetOutfits?: unknown;
            /** 옷 카드를 그렸지만 못 써서 가족 그림 옷으로 짰다 */
            outfitFallback?: unknown;
            /** 이 요청에서 부른 AI 그림 수(옷 카드 + 나머지 사람) — 없으면 예전 서버 */
            drawn?: unknown;
            /** 옷 카드를 기다린 뒤 시트를 못 짰다 — 옷 카드 없이 다시 부르라는 뜻 */
            retryWithoutCard?: unknown;
          };
          return { res, data };
        };
        const withFaces = portraits.length > 0;
        // 옷 카드는 가족 얼굴로 짜는 시트에서만, 이 책의 옷이 있는 대본에서만(서버가 수채화·고정 가족 모두의 옷 글을 다시 본다).
        const withCard = withFaces && outfitStory;
        // 얼굴 없이 보낸 요청이거나 부모가 멈췄으면 예전처럼 그대로 던진다.
        let reply = await requestSheet(withFaces, withCard).catch((e: unknown) => {
          if (!withFaces || ac.signal.aborted) throw e;
          return null;
        });
        /*
         * 섞인 시트(고정 가족 원본 + 나머지 사람만 AI)의 AI 그림이 실패했다(code "subsheet") — 그 AI 그림엔 가족 얼굴이
         * 붙지 않았으니 얼굴 탓이 아니다. 얼굴을 붙인 채로 한 번 더 부른다. 바로 얼굴 없이 가면 잠깐의 5xx 한 번에
         * 책 전체가 고정 얼굴을 잃는다(검토 2026-09-29). 또 실패하면 아래에서 얼굴 없이 — AI 한 번씩이라 값은 같다.
         */
        if (withFaces && reply?.data.code === "subsheet" && !ac.signal.aborted) {
          // 동시에 그린 옷 카드는 값이 나갔다 — 그린 장수에 넣는다.
          if (typeof reply.data.drawn === "number") counts.sheet += reply.data.drawn;
          /*
           * retryWithoutCard — 옷 카드를 기다린 뒤 시트 짜기가 실패했다(서버가 60초 안에 AI 시트를 또 그릴 시간이 없었다).
           * 옷 카드 없이 다시 부른다 — 같은 옷 카드를 또 그리면 값만 두 번 나가고 짜기는 또 실패한다(검토 2026-09-29).
           */
          const dropCard = reply.data.retryWithoutCard === true;
          pageFailures.push({
            stage: "sheet",
            reason: dropCard
              ? `옷 카드 뒤 시트 짜기 실패(HTTP ${reply.res.status}) → 옷 카드 없이 가족 얼굴 그대로 한 번 더`
              : `친구 등 나머지 인물 그림 실패(HTTP ${reply.res.status}) → 가족 얼굴 그대로 한 번 더`,
          });
          reply = await requestSheet(true, withCard && !dropCard).catch((e: unknown) => {
            if (ac.signal.aborted) throw e;
            return null;
          });
        }
        /*
         * 고정 얼굴을 붙인 시트가 실패했다 — 얼굴 없이 한 번 더 그린다. 책 만들기를 여기서 멈추지 않는다.
         * 거절(422 portrait)만이 아니다: 얼굴을 붙이면 요청이 길어져 60초 제한(504)·5xx·그림 없는 답·연결 끊김도
         * 늘고, 같은 얼굴로 다시 눌러 봐야 또 실패할 수 있다(2026-09-29 검토). 로그인(401)·잦은 요청(429)은 얼굴
         * 탓이 아니라 그대로 둔다. 기록에는 남긴다(마스터가 어느 책이 얼굴 없이 그려졌는지 알게).
         */
        const faceSheetFailed =
          withFaces &&
          !ac.signal.aborted &&
          (!reply || ((!reply.res.ok || !reply.data.image) && reply.res.status !== 401 && reply.res.status !== 429));
        if (faceSheetFailed) {
          // 실패한 요청이라도 그 안에서 그린 옷 카드·나머지 그림은 값이 나갔다(서버가 drawn 으로 알려 준다).
          if (typeof reply?.data.drawn === "number") counts.sheet += reply.data.drawn;
          pageFailures.push({
            stage: "sheet",
            reason:
              reply?.data.code === "portrait"
                ? "고정 얼굴로 인물 시트를 못 그림 → 얼굴 없이 다시 그림"
                : `고정 얼굴 시트 실패(${reply ? `HTTP ${reply.res.status}` : "연결 끊김"}) → 얼굴 없이 다시 그림`,
          });
          reply = await requestSheet(false);
        }
        // 첫 요청이 연결 끊김으로 실패한 직후 부모가 멈춘 경우뿐이다 — 멈춤으로 넘긴다(오류 문구를 띄우지 않게).
        if (!reply) throw new DOMException("그리기를 멈췄어요.", "AbortError");
        const { res: sheetRes, data: sheetData } = reply;
        if (!sheetRes.ok) {
          throw new Error(sheetData.error ?? `캐릭터 그림을 만들지 못했어요 (HTTP ${sheetRes.status})`);
        }
        sheet = sheetData.image ?? null;
        if (!sheet) throw new Error("캐릭터 그림을 받지 못했어요. 잠시 뒤 다시 시도해 주세요.");
        // 그린 장수 — 서버가 부른 AI 그림 수(옷 카드 + 나머지 사람). 옛 서버는 수를 안 준다: 원본으로만 짠 시트는 0, 그 밖 1.
        counts.sheet +=
          typeof sheetData.drawn === "number" ? sheetData.drawn : sheetData.composed === "portraits" ? 0 : 1;
        // 서버가 실제로 붙인 얼굴만(주소가 이상하거나 못 받은 사람은 빠진다).
        fixedCastRef.current = new Set(
          Array.isArray(sheetData.fixed) ? sheetData.fixed.filter((n): n is string => typeof n === "string") : [],
        );
        // 그 사람들의 원본 주소 — 쪽마다 함께 붙인다(서버가 수채화 책·이 회원 폴더인지 다시 본다). 얼굴 없이 다시 그린 시트면 빈다.
        sheetPortraitsRef.current = portraits
          .filter((p) => fixedCastRef.current.has(p.name))
          .map((p) => ({ name: p.name, ref: p.ref, memberId: p.memberId }));
        sheetOrderRef.current = Array.isArray(sheetData.order)
          ? sheetData.order.filter((n): n is string => typeof n === "string")
          : [];
        // 옷 카드로 이 책의 옷을 입은 고정 가족 — 얼굴이 실제로 붙은 사람만.
        sheetOutfitsRef.current = Array.isArray(sheetData.sheetOutfits)
          ? sheetData.sheetOutfits.filter((n): n is string => typeof n === "string" && fixedCastRef.current.has(n))
          : [];
        // 옷 카드를 그렸는데 못 썼다 — 책은 가족 그림 옷으로 간다. 마스터가 어느 책인지 알게 남긴다.
        if (sheetData.outfitFallback === true) {
          pageFailures.push({ stage: "sheet", reason: "옷 카드 실패 → 가족 그림 옷으로" });
        }
      }
      sheetImageRef.current = sheet;
      locationSheetsRef.current = saved?.locationSheets ? [...saved.locationSheets] : [];
      persist();

      /*
       * 장소 시트 — 인물 시트의 장소판.
       *
       * 인물은 시트(그림)로 잠갔는데 장소는 글 한 줄뿐이라 쪽마다 다른 계곡이 그려졌다.
       * 장소마다(책당 보통 1~2곳, 상한 3) 인물 없는 기준 그림을 먼저 한 장 그려 두고,
       * 그 장소의 모든 쪽에 참조로 넣는다. 한 장이라도 실패하면 그 장소만 예전 방식
       * (같은 장소의 첫 통과 그림)으로 간다 — 여기서 책 만들기를 막지 않는다.
       * 장수가 곧 비용이라 순서대로 한 장씩 그린다.
       */
      /*
       * 두 쪽 이상 나오는 장소만 시트를 그린다.
       *
       * 시트의 목적은 "여러 쪽에서 같은 곳이 나오게"다. 한 쪽에만 나오는 장소(지나가는
       * 길·차 안)는 기준이 필요 없고, 장당 값이 나가니 안 그린다. 장소가 셋인 책에서
       * 3장 → 1장으로 준다(사장님 결정, 2026-08-28).
       */
      const pagesPerKey = new Map<string, number>();
      for (const page of s.pages) {
        const key = locationKeyFromImagePrompt(page.imagePrompt);
        if (key) pagesPerKey.set(key, (pagesPerKey.get(key) ?? 0) + 1);
      }
      const wanted: LocationSheet[] = [];
      for (const page of s.pages) {
        const location = locationOfImagePrompt(page.imagePrompt);
        if (!location) continue;
        const key = locationKeyOf(location.name);
        if (!key || (pagesPerKey.get(key) ?? 0) < 2 || wanted.some((w) => w.key === key)) continue;
        // 이어 그리기 — 이미 있는 장소 시트는 다시 그리지 않는다.
        // 옛 열쇠로 저장된 시트도 이름으로 알아본다(sheetMatchesKey) — 못 알아보면 같은 장소 그림을 한 장 더 산다.
        if (locationSheetsRef.current.some((l) => sheetMatchesKey(l, key) && l.image)) continue;
        wanted.push({ key, name: location.name, description: location.description, image: "" });
        if (wanted.length + locationSheetsRef.current.length >= 3) break;
      }
      for (const want of wanted) {
        if (ac.signal.aborted) break;
        try {
          const r = await authedFetch("/api/location-sheet", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name: want.name,
              description: want.description,
              artStyleId: artStyle,
              shape: screenShape,
              // 부모가 적은 장소 칸에서 이 장소 부분만 — 다른 장소 설명이 섞이지 않게.
              detail: pickLocationDetail(locationDetail.trim(), want.name),
            }),
            signal: ac.signal,
          });
          const data = (await r.json().catch(() => ({}))) as { image?: string; error?: string };
          if (r.ok && data.image) {
            // onePlace — 탈것·다른 곳을 섞지 않는 규칙으로 그린 시트. 뷰어가 섞였을지 모르는 옛 시트와 가른다.
            locationSheetsRef.current.push({ ...want, image: data.image, onePlace: true });
            counts.location += 1;
            persist();
          } else {
            console.warn("[illustrate] 장소 시트 실패", want.name, data.error);
          }
        } catch (e) {
          if ((e as Error).name === "AbortError") break;
          console.warn("[illustrate] 장소 시트 실패", want.name, e);
        }
      }
      const locationSheetFor = (prompt: string) =>
        locationSheetsRef.current.find((l) => sheetMatchesKey(l, locationKeyFromImagePrompt(prompt)))?.image ?? "";
      // 어린이 통학 버스인 장소(열쇠) — 한 번 탄 통학 버스는 쪽마다 같은 버스로(벨트) 그린다(api/illustrate-page schoolBusPlace).
      const schoolBusKeys = schoolBusPlaceKeys(s.pages);

      // 삽화는 쪽마다 독립이다(캐릭터 일관성은 위에서 만든 캐릭터 시트가 잡아준다).
      // 예전엔 한 장씩 줄 세워 그려서 8쪽이면 '한 장 시간 × 8'을 기다려야 했다 —
      // 만들기가 느리다는 피드백(2번)의 가장 큰 원인이었다. 이제 여러 장을 동시에 그린다.
      /*
       * 동시 2장.
       *
       * 예전엔 3장이었는데, 실패한 책들의 기록이 한 방향을 가리켰다 —
       * **줄 세워 그린 쪽은 다 성공하고, 동시에 쏜 순간부터 무너졌다.**
       * 6쪽짜리 두 권이 똑같이 `성공 성공 성공 성공 실패 실패`였는데,
       * 앞 넷은 순서대로 그린 쪽(1쪽·장소별 첫 쪽)이고 뒤 둘이 동시 요청분이었다.
       * Gemini의 분당 한도에 우리가 스스로 부딪히고 있었던 것이다.
       */
      const CONCURRENT_IMAGES = 2;
      /*
       * 한 번 몰림(429)을 만나면 그때부터는 띄엄띄엄 보낸다.
       *
       * 한도에 걸린 뒤에도 같은 속도로 계속 쏘면 남은 쪽이 줄줄이 다 실패한다
       * (실제로 한 권의 2쪽 이후가 통째로 비었다). 한 번 데면 속도를 늦춘다.
       */
      let crowdedUntil = 0;
      const pace = async () => {
        const wait = crowdedUntil - Date.now();
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      };
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
      passedRef.current = passed;
      let done = 0;
      let cursor = 0;
      const claimedPages = new Set<number>();
      // 이어 그리기 — 지난번에 그린 쪽은 그대로 쓰고 건너뛴다.
      if (saved?.images?.length === s.pages.length) {
        saved.images.forEach((im, i) => {
          if (!im) return;
          images[i] = im;
          passed[i] = Boolean(saved.passed?.[i]);
          claimedPages.add(i);
          done++;
          if (passed[i]) {
            const key = locationKeyFromImagePrompt(s.pages[i].imagePrompt);
            if (key && !locationReferences.has(key)) locationReferences.set(key, { image: im, scene: s.pages[i].imagePrompt });
          }
        });
        setDrawn(done);
        setPageImages([...images]);
      }
      // 비용 상한일 뿐 실패 사유가 아니다 — 여기 걸려도 그림은 그대로 책에 들어간다.
      const MAX_QA_REDRAWS_PER_BOOK = Math.max(2, Math.ceil(s.pages.length / 3));
      let qaRedrawsUsed = 0;
      // 그림에 글자가 박힌 경우 전용 예산 — 이건 취향 문제가 아니라 명백한 불량이다.
      const MAX_TEXT_REDRAWS_PER_BOOK = Math.max(2, Math.ceil(s.pages.length / 3));
      let textRedrawsUsed = 0;
      // 원본 얼굴을 붙인 쪽이 그림 모델에 두 번 거절되면 이 책의 남은 쪽은 얼굴 없이(시트만) — 쪽마다 거절·다시 그리기로 늦어지지 않게.
      let portraitRefusals = 0;
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
            const requestImage = async (qualityCorrection = "", withFaces = true): Promise<PageImageReply> => {
              // 고정 가족 원본 얼굴 — 시트에 얼굴이 붙은 사람의 원본 주소(서버가 이 쪽에 보이는 사람만 골라 붙인다).
              const faces = withFaces && portraitRefusals < 2 ? sheetPortraitsRef.current : [];
              const locationKey = locationKeyFromImagePrompt(s.pages[i].imagePrompt);
              const sameLocationReference = locationKey ? locationReferences.get(locationKey) : undefined;
              // 그림체 기준은 '검사를 통과한' 그림에서만 가져온다. 떨어진 그림을 기준으로
              // 삼으면 그 어긋남이 뒤 쪽으로 번진다.
              const styleSeed = passed[0] ? 0 : passed.findIndex(Boolean);
              const styleFallback = styleSeed >= 0 ? images[styleSeed] : null;
              /*
               * 기준 그림은 줄여서 보낸다.
               *
               * 이 그림은 앞 쪽에서 그린 '완성 쪽 그림'이라 2~3MB다. 원본 그대로 실으면
               * 캐릭터 시트·장소 시트와 합쳐 요청이 서버 한도(4.5MB)를 넘고, 413으로
               * 조용히 거절당한다. 앞 쪽이 그려질수록 뒤 쪽이 무너지던 까닭이 이것이다.
               */
              const styleReference = await asReference(
                sameLocationReference?.image ?? styleFallback ?? "",
              );
              const styleReferenceScene =
                sameLocationReference?.scene ??
                (styleFallback && styleSeed >= 0 ? s.pages[styleSeed].imagePrompt : "");
              await pace();
              const r = await authedFetch("/api/illustrate-page", {
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
                  // 부모가 대본 화면에서 적어 준 장소 — 서버가 이 쪽의 장소 부분만 골라 쓴다.
                  locationDetail: locationDetail.trim(),
                  // 이 쪽 장소의 기준 그림 — 있으면 모든 쪽이 같은 곳을 그린다.
                  locationSheet: locationSheetFor(s.pages[i].imagePrompt),
                  schoolBusPlace: Boolean(locationKey) && schoolBusKeys.has(locationKey),
                  // 책 전체 인물을 보내되 서버가 장면에 이름이 있는 인물만 골라 잠근다.
                  cast: s.characters.map((c, characterIndex) => ({
                    name: c.name,
                    // 주인공 머리결 선택을 페이지 QA에도 넣어 시트 이후 다시 곱슬로 변하지 않게 한다.
                    description:
                      characterIndex === 0 && (heroLooksEn || heroLooks)
                        ? `${c.description}, ${heroLooksEn || heroLooks}`
                        : c.description,
                    // 고정 얼굴로 시트를 그린 사람 — 얼굴·머리는 설명 글보다 시트를 따르게(api/illustrate-page).
                    ...(fixedCastRef.current.has(c.name) ? { fixed: true } : {}),
                    // 이 책의 옷 — 옷 카드로 입은 고정 가족 줄이 이 글을 쓴다.
                    ...(c.outfit ? { outfit: c.outfit } : {}),
                  })),
                  // 주인공 성별·생김새 — 시트에만 가고 쪽 그림엔 안 가서 남자아이가 단발·꽃핀으로 나왔다.
                  hero: heroFromStory(
                    s.characters,
                    gender !== "unspecified" ? gender : child?.gender,
                    heroLooksEn || heroLooks,
                  ),
                  // 고정 가족 원본 그림 주소·시트에 선 순서 — 얼굴이 시트를 거쳐 또 흐르지 않게(api/illustrate-page).
                  ...(faces.length ? { portraits: faces } : {}),
                  ...(sheetOrderRef.current.length ? { sheetOrder: sheetOrderRef.current } : {}),
                  ...(sheetOutfitsRef.current.length ? { sheetOutfits: sheetOutfitsRef.current } : {}),
                }),
                signal: ac.signal,
              });
              // 몰림을 만났다 — 남은 요청들의 속도를 늦춘다.
              if (r.status === 429) crowdedUntil = Date.now() + 20_000;
              // ok 검사보다 .json()이 먼저면 HTML 오류 페이지에서 SyntaxError가 난다.
              const data = (await r.json().catch(() => ({}))) as PageImageReply["data"];
              /*
               * 원본 얼굴을 붙인 쪽을 그림 모델이 거절했다(422 portrait) — 이 쪽만 얼굴 없이(시트만) 한 번 더.
               * 품질검사 다시 그리기 예산은 쓰지 않는다(그림이 아예 안 나온 것이다). 기록에는 남긴다.
               */
              if (faces.length && r.status === 422 && data.code === "portrait") {
                portraitRefusals++;
                pageFailures.push({ page: i + 1, stage: "draw", reason: "가족 원본 얼굴로 못 그림 → 얼굴 없이 다시 그림" });
                return requestImage(qualityCorrection, false);
              }
              return { ok: r.ok, status: r.status, data };
            };

            /*
             * 품질검사는 '다시 그릴지'만 정한다. '버릴지'는 정하지 않는다.
             *
             * 예전엔 검사에 떨어진 그림을 null로 만들었고, 그 null 하나가 책 저장을
             * 통째로 막았다. 이미 결제한 그림을 버리고 책까지 못 만드는 이중 손해였다.
             * 이제 다시 그려 보되, 그것도 신통찮으면 처음 그림을 그대로 쓴다.
             */
            const first = await requestImage();
            if (first.ok && first.data.image) counts.pages += 1;
            /*
             * 이유 없는 실패를 없앤다.
             *
             * 413(요청이 너무 큼)이나 프록시 오류는 본문이 JSON이 아니라 error가 비어
             * 있었다. 그래서 화면에는 "그림 3장을 못 그렸어요"만 뜨고 까닭 줄이 통째로
             * 사라졌다 — 부모도 우리도 왜 안 됐는지 알 길이 없었다.
             */
            if (!first.ok) {
              const reason =
                first.data.error ||
                (first.status === 413
                  ? "참고 그림이 너무 커서 서버가 요청을 거절했어요."
                  : `서버가 그림을 돌려주지 않았어요 (오류 ${first.status}).`);
              drawFailures.push(reason);
              pageFailures.push({ page: i + 1, stage: "draw", reason: `${reason} (HTTP ${first.status})` });
            } else if (!first.data.image) {
              pageFailures.push({ page: i + 1, stage: "draw", reason: "그림 없이 성공 응답이 왔어요" });
            }
            let image = first.ok ? (first.data.image ?? null) : null;
            /*
             * '검사 통과'와 '검사 못 함'을 가른다.
             *
             * 예전엔 검사기가 장애를 만나도 통과로 돌려줘서, 검사 안 된 그림이 책 전체의
             * 그림체·장소 기준 그림(styleSeed·locationReferences)이 됐다. 이제 실제로
             * 검사돼 통과한 그림만 기준으로 쓴다.
             */
            let ok =
              first.ok &&
              Boolean(image) &&
              first.data.qualityPassed === true &&
              first.data.qualityChecked !== false;

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

            // 검사를 못 한 그림으로 다시 그리기 예산을 태우지 않는다 — 잘못이 있는지조차 모른다.
            if (image && !ok && first.data.qualityChecked !== false && canRedraw) {
              // 증분은 await 전에 동기적으로 실행돼 동시 worker끼리도 예산을 넘기지 않는다.
              if (isTextIssue) textRedrawsUsed++;
              else qaRedrawsUsed++;
              const second = await requestImage(
                isTextIssue
                  ? "The previous attempt drew readable words inside the picture. Draw the same scene with absolutely no writing of any kind."
                  : (first.data.qualityWarning ?? "Character mismatch"),
              );
              if (second.ok && second.data.image) counts.redraws += 1;
              if (
                second.ok &&
                second.data.image &&
                second.data.qualityPassed === true &&
                second.data.qualityChecked !== false
              ) {
                image = second.data.image;
                ok = true;
              } else if (isTextIssue && second.ok && second.data.image && second.data.qualityIssue !== "text") {
                // 글자는 지워졌고 다른 지적만 남았다면 그쪽이 낫다 — 글자보다는 낫다.
                image = second.data.image;
              } else if (
                first.data.qualityIssue === "border" &&
                second.ok &&
                second.data.image &&
                second.data.qualityIssue !== "border" &&
                second.data.qualityIssue !== "text"
              ) {
                // 흰 여백은 없어지고 취향 지적만 남았다 — 흰 테두리가 보이는 그림보다 낫다.
                image = second.data.image;
              }
            }

            images[i] = image; // 그린 그림은 검사 결과와 무관하게 남긴다
            passed[i] = ok;
            if (image) failedPages.delete(i);
            else failedPages.add(i);
            persist(); // 한 장 그릴 때마다 보관 — 여기서 나가도 이 장은 남는다
            if (image && ok) {
              const locationKey = locationKeyFromImagePrompt(s.pages[i].imagePrompt);
              if (locationKey && !locationReferences.has(locationKey)) {
                locationReferences.set(locationKey, { image, scene: s.pages[i].imagePrompt });
              }
            }
          } catch (e) {
            if ((e as Error).name === "AbortError") return;
            // 한 장이 실패해도 나머지는 계속 그린다 — 그 쪽만 플레이스홀더가 된다.
            // 다만 이유는 반드시 남긴다(예전엔 여기서 조용히 사라졌다).
            console.warn("[illustrate] 쪽 그림 실패", i + 1, e);
            drawFailures.push((e as Error).message || "알 수 없는 오류");
            pageFailures.push({ page: i + 1, stage: "draw", reason: (e as Error).message || "알 수 없는 오류" });
            failedPages.add(i);
            images[i] = null;
          }
          done++;
          setDrawn(done);
          setPageImages([...images]);
          reportDraw();
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
      /*
       * 장소 기준이 모두 준비된 뒤 나머지 장면을 병렬로 그린다.
       *
       * ⚠ 반드시 `() => drawWorker()` 로 감싼다. `Array.from(…, drawWorker)` 로 쓰면
       *   Array.from 이 mapFn 을 (값, 인덱스)로 부르기 때문에 drawWorker(undefined, 0)·
       *   drawWorker(undefined, 1) 이 되어, 두 번째 인자가 requestedIndex('이 쪽만 그려라')
       *   로 새어 들어간다. drawWorker 첫 줄이 `if (claimedPages.has(requestedIndex)) return`
       *   이라 결과가 이랬다:
       *     · 0쪽은 바로 위에서 이미 찜했으므로 **첫 일꾼은 언제나 즉시 종료**
       *     · 1쪽이 장소 시드로 찜혀 있으면 둘째 일꾼도 즉시 종료
       *       → **2쪽부터 끝까지 한 장도 안 그려진다**
       *   "그림이 다 안 생긴다"는 신고의 원인이었다(2026-09-14 확인).
       */
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENT_IMAGES, s.pages.length) }, () => drawWorker()),
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
        if (reportTimer) clearTimeout(reportTimer);
        // 기록: 인물 시트에서 멈춰 대본 단계로 돌아갔다.
        void recordJob({
          status: "script",
          error: `인물 시트 실패: ${(e as Error).message || "알 수 없는 오류"}`.slice(0, 500),
          failures: capFailures([...pageFailures, { stage: "sheet", reason: (e as Error).message || "알 수 없는 오류" }]),
        });
        setError((e as Error).message || "삽화를 그리지 못했어요. 다시 시도해주세요.");
        setStep("story");
        return;
      }
    }
    /*
     * 못 그린 쪽이 있으면 반드시 말해 준다.
     *
     * 책은 그대로 저장한다(이미 결제한 그림을 버리지 않는다는 원칙 그대로). 다만
     * 아무 말 없이 넘어가면 부모는 "앱이 이상한 배경을 넣었다"고만 느낀다.
     * 이유를 한 줄이라도 보여 줘야 기다렸다 다시 그릴지 판단할 수 있다.
     */
    const missing = images.filter((im) => !im).length;
    if (missing > 0 && !ac.signal.aborted) {
      // 같은 이유가 여러 번 쌓이므로 한 번씩만 보여 준다.
      const reasons = [...new Set(drawFailures)].slice(0, 2);
      window.alert(
        [
          `그림 ${missing}장을 못 그렸어요.`,
          reasons.length ? `\n이유: ${reasons.join(" / ")}` : "",
          "\n\n동화는 그대로 저장돼요. 못 그린 쪽은 글만 보이고,",
          "\n책을 열어서 그 쪽만 다시 그릴 수 있어요.",
        ].join(""),
      );
    }
    // 그리기 끝 — 묶어 두던 진행을 마지막으로 한 번 적는다.
    reportDraw(true);
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
    setSaveFailure(null);
    /*
     * 여기서는 '그림 값'만 받는다 — 글 값은 대본이 나왔을 때 이미 받았다.
     * 그림 없이 끝내면 더 받을 것이 없다(글 동화 한 권 값을 이미 낸 셈이다).
     */
    const illustrated = images.some(Boolean);
    const cost = illustrated ? illustrationCost(s.pages.length, pricing) : 0;
    const progressKey = drawProgressKeyRef.current;

    /*
     * 책 id 는 **그림 값을 받기 전에** 한 번만 정한다.
     *
     * 값을 받는 함수(charge_illustration)가 결제와 함께 기록에 책 id 를 못 박는다. 그래야
     * 저장이 실패해도 "이 결제는 이 책 id 였다"가 남아 마스터가 찾고 되살릴 수 있다.
     * 지난번에 값을 내고 저장만 실패한 책이면 그때 정한 id 를 그대로 쓰고 값은 다시 받지 않는다:
     *  ① 이 기기의 표시(localStorage) ② 기록(book_jobs)에 붙은 그림 값 — 둘 중 하나라도 있으면.
     */
    // 앞서 보낸 기록 쓰기가 끝난 뒤에 읽는다 — 단 3초까지만. 기록 요청이 매달려도 값 받기·저장은 간다.
    await waitAtMost(jobQueueRef.current, 3000, undefined);
    let paidMarker = progressKey ? loadPaidMarker(progressKey) : null;
    const drawingNow: DrawingNow = { pageTexts: s.pages.map((p) => p.text), artStyleId: artStyle };
    /** 지금 그리는 원고 — 값을 받기 직전·새 줄을 열 때 기록에 적는다(같은 그림인지 가리는 근거). */
    const drawingManuscript = {
      ...storyManuscript(s),
      artStyleId: artStyle,
      shape: screenShape,
      locationDetail: locationDetail.trim() || undefined,
    };
    const sb = getSupabase();
    /** 값을 받지 않고 멈춘다 — 받았는지 모르거나 기록을 못 적었을 때. 그린 그림은 보관에 남아 있다. */
    const stopBeforeCharge = (message: string) => {
      void recordJob({ status: "script", error: `그림 값 받기 전 멈춤: ${message}`.slice(0, 500) });
      setError(message);
      setStep("story");
    };
    /*
     * 표시가 있어도 기록을 읽을 수 있으면 환불 여부를 본다(2026-09-14 더함).
     * 마스터가 그림 값을 환불해 준 뒤에도 이 기기 표시(이레)로 '값 냈음'이 되어, 같은 책을 값 없이 다시 저장했다.
     * 환불된 값은 낸 값이 아니다 — 표시를 지우고 아래에서 새 줄로 받는다. 못 읽으면 예전처럼 표시를 믿는다.
     */
    if (paidMarker?.jobId) {
      const markerRead = await readJobResult(sb, paidMarker.jobId);
      if (markerRead.ok && markerRead.job?.illustration_entry && markerRead.job.illustration_refunded === true) {
        clearPaidMarker(progressKey);
        paidMarker = null;
        setJobId(markerRead.job.id);
      }
    }
    // 결제 요청을 보낸 채 끊겼던 흔적 — 그 기록·책 id 로 잇는다. 값을 냈다는 뜻은 아니라 아래에서 기록으로 확인한다.
    const chargingMarker = progressKey && !paidMarker ? loadChargingMarker(progressKey) : null;
    // 값을 낸 그 기록으로 잇는다(임시저장에 남은 id 는 값을 내기 전 것일 수 있다).
    if (paidMarker?.jobId) setJobId(paidMarker.jobId);
    else if (chargingMarker?.jobId) setJobId(chargingMarker.jobId);
    let bookId = paidMarker?.bookId ?? chargingMarker?.bookId ?? newBookId();
    let alreadyPaid = Boolean(paidMarker);
    if (jobIdRef.current && !paidMarker) {
      const read = await readJobResult(sb, jobIdRef.current);
      if (read.ok && read.job) {
        // 같은 그림일 때만 '값 냈음'을 인정한다(planFromJob 설명) — 그림체·대본을 바꿔 새로 그렸으면 새 책이다.
        const plan = planFromJob(read.job, drawingNow);
        if (plan.needsCheck && cost > 0) {
          stopBeforeCharge(
            "이 책의 그림 값 기록을 확인하지 못했어요. 두 번 받지 않도록 여기서 멈췄어요 — '의견 보내기'로 알려 주시면 확인해 드릴게요.",
          );
          return;
        }
        if (!plan.reuse) {
          // 이미 끝난 기록(저장됨·취소)·다른 그림·환불된 값 — 새로 만드는 것이니 새 줄에 **지금 원고로** 적는다.
          // 옛 줄의 책 id 는 그 줄에 못 박혀 있으니 새 책 id 를 쓴다.
          setJobId(await cloneJob(sb, read.job, await currentUid(), "uploading", drawingManuscript));
          bookId = newBookId();
        } else {
          if (plan.bookId) {
            bookId = plan.bookId;
            alreadyPaid = plan.alreadyPaid;
          }
          /*
           * 값을 받기 **직전에** 지금 원고를 기록에 적는다(2026-09-14 더함).
           * 그리기 시작의 원고 쓰기는 기다리지 않고, 못 읽으면 덮지도 않는다. 그래서 부모가 대본을 고친 뒤
           * 망이 불안하면 기록엔 고치기 전 원고가 남았고, 결제만 붙은 채 멈추면 다음 판단이 '다른 그림'이 되어
           * 그림 값을 한 번 더 받았다. 값이 아직 안 붙은 줄만 적는다 — 붙은 줄의 원고(올린 그림 주소)는 지킨다.
           * 못 적으면 받지 않고 멈춘다(돈은 아직 안 나갔다).
           */
          if (cost > 0 && !alreadyPaid && !read.job.illustration_entry) {
            const wrote = await updateJob(sb, jobIdRef.current, { manuscript: drawingManuscript });
            if (!wrote) {
              stopBeforeCharge("인터넷 연결이 불안해서 그림 값 받기를 멈췄어요. 그린 그림은 남아 있으니 잠시 뒤 다시 눌러 주세요.");
              return;
            }
          }
        }
      } else if (!read.ok && !read.missing && cost > 0) {
        /*
         * 못 읽었으면(모름) 받지 않고 멈춘다(2026-09-14 고침). 예전엔 그대로 받으러 가서 결제 함수의 거절에 기댔는데,
         * 그 사이 원고를 못 적어 뒤의 '같은 그림' 판단이 흐려졌다. 기록을 못 읽을 망이면 결제 응답도 끊기기 쉽다.
         */
        stopBeforeCharge("인터넷 연결이 불안해서 만들기 기록을 확인하지 못했어요. 그린 그림은 남아 있으니 잠시 뒤 다시 눌러 주세요.");
        return;
      }
    }

    if (cost > 0 && !alreadyPaid) {
      const charged = await chargeIllustration(cost, bookId, drawingNow, drawingManuscript);
      // 받았거나 분명히 못 받았으면 '요청 보냄' 표시는 끝났다. 모르면 남겨 두어 다음에 그 기록부터 확인한다.
      if (charged.ok || !charged.uncertain) clearChargingMarker(progressKey);
      if (!charged.ok) {
        // 값을 못 받았으면(또는 받았는지 모르면) 저장하지 않는다. 그리기 보관은 남아 있어 다시 누르면 이어서 된다.
        void recordJob({ status: "script", error: `그림 값 받기 실패: ${charged.error}`.slice(0, 500) });
        setError(
          charged.insufficient
            ? `토큰이 부족해서 저장하지 못했어요. (그림에 ${cost}개 필요) 충전한 뒤 '그림 만들기'를 다시 눌러 주세요.`
            : charged.uncertain
              ? charged.error
              : `그림 값을 받지 못해서 저장을 멈췄어요. 그린 그림은 남아 있으니 잠시 뒤 '이어서 그리기'를 다시 눌러 주세요. (${charged.error})`,
        );
        setStep("story");
        return;
      }
      // 기록을 다시 읽어 보니 이미 값을 낸 책이었으면 그 책 id 로 저장한다.
      bookId = charged.bookId;
      // 마스터는 실제로 차감되지 않으니 화면 잔액도 그대로 둔다(안 그러면 숫자만 줄어 헷갈린다).
      // 이미 낸 값이면(alreadyPaid) 이번에 줄어든 것이 없다.
      if (!master && !charged.alreadyPaid) {
        if (typeof charged.tokens === "number") setTokens(charged.tokens);
        else setTokens((t) => Math.max(0, t - cost));
      }
      // 값을 냈다는 표시 — 저장이 실패해 다시 올 때 또 받지 않게. 저장에 성공하면 지운다.
      savePaidMarker(progressKey, { bookId, jobId: jobIdRef.current, at: Date.now() });
    } else if (jobIdRef.current) {
      // 기록으로 '이미 냄'을 확인한 경우도 표시를 남긴다 — 저장이 또 실패하면 다시 만들기 화면에
      // '저장 못 한 책 다시 저장하기'가 뜨게(실패 화면이 그렇게 약속한다).
      if (cost > 0 && alreadyPaid && !paidMarker) {
        savePaidMarker(progressKey, { bookId, jobId: jobIdRef.current, at: Date.now() });
      }
      // 값을 받지 않는 경우(글만·이미 냄)도 올리기 단계와 책 id 를 적는다.
      void recordJob({ status: "uploading", book_id: bookId });
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
     * 비용이 없고, 책 여는 속도도 빨라진다. 못 올린 장을 어떻게 하는지는 hostArtwork 설명.
     */
    const hosted = await hostArtwork(bookId, slim, cover, sheetImageRef.current, locationSheetsRef.current);

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
      locationSheets: hosted.locationSheets.length ? hosted.locationSheets : undefined,
      locationDetail: locationDetail.trim() || undefined,
      // fixed — 고정 얼굴로 시트를 그린 사람. 한 쪽만 다시 그릴 때도 얼굴·머리는 시트를 따르게 남긴다.
      cast: s.characters.map((c) => ({
        name: c.name,
        description: c.description,
        ...(fixedCastRef.current.has(c.name) ? { fixed: true } : {}),
        // 이 책의 옷 — 한 쪽만 다시 그릴 때도 같은 옷(옛 대본엔 없다).
        ...(c.outfit ? { outfit: c.outfit } : {}),
      })),
      // 고정 가족 원본 그림 주소·시트에 선 순서 — 한 쪽만 다시 그릴 때도 원본 얼굴을 붙인다(옛 책은 없다).
      portraits: sheetPortraitsRef.current.length ? [...sheetPortraitsRef.current] : undefined,
      sheetOrder: sheetOrderRef.current.length ? [...sheetOrderRef.current] : undefined,
      // 옷 카드로 이 책의 옷을 입은 고정 가족 — 한 쪽 다시 그리기도 칸 위의 옷을 입힌다.
      sheetOutfits: sheetOutfitsRef.current.length ? [...sheetOutfitsRef.current] : undefined,
      // 한 쪽만 다시 그릴 때도 주인공 성별·생김새를 못 박게 남긴다(이 책의 옷이 있으면 좋아하는 옷 색은 빼고 — 그릴 때와 같게).
      hero: heroFromStory(
        s.characters,
        gender !== "unspecified" ? gender : loadChild()?.gender,
        looksToDrawingPrompt(loadChild()?.looks, { clothes: !s.characters.some((c) => c.outfit) }),
      ),
      pages: s.pages.map((p, i) => ({
        text: p.text,
        imagePrompt: p.imagePrompt,
        voiceDirection: p.voiceDirection,
        image: hosted.images[i] ?? null,
      })),
    };
    await commitBook(book, illustrated, hosted.failures);
  }

  /**
   * 그림 값 받기 — 가능하면 결제와 기록 연결을 한 번에(charge_illustration).
   *
   * 따로 하면(spend_tokens 뒤 기록 고치기) 두 번째가 끊겼을 때 "돈은 나갔는데 어느 기록에도
   * 안 이어진 결제"가 된다. 기록이 없거나 함수가 없는 옛 DB 면 예전처럼 spend_tokens 로 물러선다.
   * 금액·과금 규칙은 바꾸지 않는다(쪽수 × 단가 그대로).
   *
   * 이중 과금 막기(2026-09-14 고침):
   *  · '이미 그림 값이 붙은 기록'이라는 거절은 곧바로 새로 받을 신호가 아니다. 앞선 판단이 기록을
   *    못 읽었다는 뜻일 수 있다(응답만 끊긴 결제). 기록을 다시 읽어 recoverFromChargeRefusal 로 정하고,
   *    못 읽으면 받지 않고 멈춘다.
   *  · 응답이 끊기면 '못 받음'이 아니라 '모름'이다. 기록(옛 DB 면 잔액)으로 확인한 뒤 정한다.
   */
  async function chargeIllustration(
    cost: number,
    bookId: string,
    now: DrawingNow,
    /** 지금 그리는 원고 — 새 줄을 열거나 그 줄에서 다시 받기 전에 기록에 적는다. */
    drawingManuscript: Record<string, unknown>,
  ): Promise<
    | { ok: true; bookId: string; alreadyPaid: boolean; tokens?: number }
    | { ok: false; error: string; insufficient: boolean; uncertain?: boolean }
  > {
    const UNCERTAIN =
      "그림 값이 나갔는지 확인하지 못했어요(인터넷 연결이 불안해요). 잠시 뒤 다시 눌러 주세요 — 다시 누르면 먼저 기록을 확인해서, 이미 받았으면 또 받지 않아요.";
    /** 결제 요청 직전 표시 — 응답 전에 창이 닫혀도 다음에 이 기록부터 확인한다(saveChargingMarker 설명). */
    const markCharging = (job: string | null, id: string) =>
      saveChargingMarker(drawProgressKeyRef.current, { bookId: id, jobId: job, at: Date.now() });
    const sb = getSupabase();
    if (sb && jobIdRef.current) {
      const callRpc = async (job: string, id: string) => {
        markCharging(job, id);
        try {
          let q = sb.rpc("charge_illustration", { p_job: job, p_amount: cost, p_book_id: id });
          // 돈 요청이 끝없이 매달리면 부모 화면이 멈춘다 — 20초가 넘으면 '모름'으로 다룬다.
          if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
            q = q.abortSignal(AbortSignal.timeout(20_000));
          }
          return await q;
        } catch (e) {
          return { data: null, error: { code: "", message: (e as Error)?.message ?? String(e) } };
        }
      };
      /** 응답이 끊겼을 때 — 기록에 이 책 id 로 값이 붙었는지 본다. 모르면 null. */
      const chargedAfterAll = async (job: string, id: string): Promise<boolean | null> => {
        const read = await readJobResult(sb, job);
        if (!read.ok) return null;
        const j = read.job;
        // 마스터는 장부 id 가 null 로 붙는다(면제) — 책 id 로만 본다.
        return Boolean(j && j.book_id === id && (j.illustration_entry || master));
      };

      let targetBook = bookId;
      let res = await callRpc(jobIdRef.current, targetBook);
      let kind = res.error ? chargeProblem(res.error) : null;
      let fallbackToSpend = kind === "missing" || kind === "no-job";

      if (kind === "already-charged" || kind === "other-book") {
        const read = await readJobResult(sb, jobIdRef.current);
        const recovery = recoverFromChargeRefusal(read, now);
        if (recovery.action === "already-paid") {
          return { ok: true, bookId: recovery.bookId, alreadyPaid: true };
        }
        if (recovery.action === "stop" || !read.ok || !read.job) {
          return { ok: false, insufficient: false, uncertain: true, error: UNCERTAIN };
        }
        if (recovery.action === "retry-same-job") {
          // 값은 없고 책 id 만 정해진 줄(마스터·글만 책) — 그 책 id 로 다시 받는다.
          // 받기 전에 지금 원고를 적는다 — 값만 붙고 원고가 옛것이면 다음 판단이 '다른 그림'이 된다. 못 적으면 멈춘다.
          targetBook = recovery.bookId ?? bookId;
          if (!(await updateJob(sb, jobIdRef.current, { manuscript: drawingManuscript }))) {
            return { ok: false, insufficient: false, error: "만들기 기록을 적지 못했어요(인터넷 연결). 잠시 뒤 다시 눌러 주세요." };
          }
          res = await callRpc(jobIdRef.current, targetBook);
          kind = res.error ? chargeProblem(res.error) : null;
        } else {
          // new-job: 기록을 **읽고 확인한** 끝난 기록·다른 그림 — 새 책이니 새 값이 맞다(예전 규칙).
          // 새 줄에는 옛 원고가 아니라 지금 원고를 적는다(cloneJob 설명).
          const fresh = await cloneJob(sb, read.job, await currentUid(), "drawing", drawingManuscript);
          if (fresh) {
            setJobId(fresh);
            res = await callRpc(fresh, targetBook);
            kind = res.error ? chargeProblem(res.error) : null;
          } else {
            // 새 줄을 못 열었다(하루 상한 등). 확인된 새 책이라 기록 없이 받는다 — 옛 줄에는 잇지 않는다
            // (옛 줄의 그림 값·책 id 는 지킴이가 못 바꾸게 해서 어차피 거절된다).
            setJobId(null);
            fallbackToSpend = true;
          }
        }
      }

      if (!fallbackToSpend) {
        if (!res.error) {
          const d = (res.data ?? {}) as { entry?: string | null; tokens?: number };
          return {
            ok: true,
            bookId: targetBook,
            alreadyPaid: false,
            tokens: typeof d.tokens === "number" ? d.tokens : undefined,
          };
        }
        if (kind === "other" && jobWriteProblem(res.error) === "network" && jobIdRef.current) {
          const confirmed = await chargedAfterAll(jobIdRef.current, targetBook);
          if (confirmed === true) return { ok: true, bookId: targetBook, alreadyPaid: false };
          if (confirmed === null) return { ok: false, insufficient: false, uncertain: true, error: UNCERTAIN };
          // 기록에 값이 안 붙었다 = 안 나갔다. 아래 보통 실패로 알린다(다시 눌러도 안전하다).
        }
        return {
          ok: false,
          insufficient: kind === "insufficient",
          error: String(res.error.message ?? "알 수 없는 오류").slice(0, 120),
        };
      }
      // missing(옛 DB) · no-job(기록 없음) · 새 줄을 못 연 확인된 새 책 → 아래 옛 방식으로 받는다
    }

    /*
     * 옛 방식(spend_tokens). 기록으로 '받았나'를 확인할 수 없으니 장부의 그림 값 줄로 본다(judgeSpendAfterError).
     * 응답이 끊겨 실패로 보여도 새 그림 값 줄이 생겼으면 받은 것이다. 그걸 실패로 알리면 부모가 다시 눌러
     * 한 번 더 깎였다. 예전엔 잔액 차이로 봤는데, 다른 탭의 결제·마스터 충전이 섞여 공짜 저장이나 두 번 결제가
     * 났다(2026-09-14 고침). 확인이 안 되면 '모름'으로 알리고 다시 누르지 말라고 한다.
     */
    const before = master ? null : await readRecentIllustrationLedger(getSupabase());
    markCharging(null, bookId);
    const spent = await spendTokensEntry(cost, "illustration");
    if (!spent.ok) {
      if (/부족/.test(spent.error)) return { ok: false, insufficient: true, error: spent.error };
      if (!master) {
        const after = await readRecentIllustrationLedger(getSupabase());
        const judged = judgeSpendAfterError({ before, after, cost, networkish: looksNetworkish(spent.error) });
        if (judged.verdict === "paid") {
          void recordJob({ illustration_entry: judged.entry, book_id: bookId, status: "uploading" });
          return { ok: true, bookId, alreadyPaid: false };
        }
        if (judged.verdict === "unknown") {
          return {
            ok: false,
            insufficient: false,
            uncertain: true,
            error:
              "그림 값이 나갔는지 확인하지 못했어요. 설정에서 잔액을 먼저 확인해 주세요 — 줄었으면 다시 누르지 말고 '의견 보내기'로 알려 주세요.",
          };
        }
      }
      return { ok: false, insufficient: false, error: spent.error };
    }
    // 옛 방식으로 받았으면 기록에 따로 잇는다(끊기면 사고 목록이 '안 이어진 결제'로 찾아 준다).
    void recordJob({ illustration_entry: spent.entry ?? undefined, book_id: bookId, status: "uploading" });
    return { ok: true, bookId, alreadyPaid: false };
  }

  /**
   * 책장에 넣기 — 성공이 확인된 뒤에만 임시저장·그리기 보관을 지우고 완성 화면으로 간다.
   *
   * 예전엔 저장 결과를 안 보고 곧바로 둘 다 지웠다. 저장이 실패하면 책은 서버에도
   * 기기에도 없고 토큰만 나갔다(2026-09-14 확인된 사고). 이제:
   *  ① 저장 전에 원고(주소만)·못 올린 장수를 기록에 적는다 — 저장이 실패해도 원고는 서버에 남는다
   *  ② 저장이 실패하면 책을 붙들고 이유와 '다시 저장하기'를 보여 준다. 보관은 안 지운다
   *     (새로고침해도 '이어서 그리기'로 값 없이 다시 저장할 수 있다)
   */
  async function commitBook(book: Book, illustrated: boolean, uploadFailures: JobFailure[]) {
    const { manuscript } = stripEmbeddedArt(book);
    // 원고를 먼저 적되 4초까지만 기다린다 — 기록 요청이 매달려도 책 저장은 시작해야 한다.
    await waitAtMost(recordJob({
      status: "saving",
      book_id: book.id,
      manuscript,
      upload_failed: Math.min(200, uploadFailures.length),
      failures: capFailures([...drawFailuresRef.current, ...uploadFailures]),
    }), 4000, false);

    const saved = await saveMyBook(book); // Supabase에 저장 (뷰어가 /book/[id]로 열 수 있게)
    if (!saved.ok) {
      console.error("[finish] 책 저장 실패", saved.code, saved.reason);
      void recordJob({ status: "failed", error: `책 저장 실패(${saved.code}): ${saved.reason}`.slice(0, 500) });
      setSaveFailure({ book, reason: saved.reason, illustrated });
      setStep("illustrate"); // 실패 안내는 그리기 화면 자리에 띄운다(창 닫기 경고도 그대로 걸린다)
      return;
    }

    void recordJob({ status: "saved", error: null });
    setSaveFailure(null);
    clearCreateDraft(draftOwner);
    draftBaselineRef.current = null;
    // 책이 저장됐으니 그리기 진행 보관은 지운다. 그린 장수는 완성 화면에 보여 준다.
    if (drawProgressKeyRef.current) {
      void clearDrawProgress(drawProgressKeyRef.current);
      clearPaidMarker(drawProgressKeyRef.current);
      clearChargingMarker(drawProgressKeyRef.current);
    }
    setJobId(null); // 이 만들기는 끝났다 — 다음 책은 새 기록
    setResumablePages(0);
    setUnsavedPaid(false);
    setDrawSummary(illustrated ? describeDrawCounts(drawCountsRef.current) : "");

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

  /**
   * '다시 저장하기' — 값은 다시 받지 않는다. 못 올린 그림만 다시 올리고 저장을 다시 시도한다.
   * 시트는 저장 전에 책에서 뺐을 수 있으니(hostArtwork 설명) 화면 메모리의 원본으로 다시 올려 본다.
   */
  async function retrySave() {
    if (!saveFailure || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const { book, illustrated } = saveFailure;
      const sheetSource = book.characterSheet ?? sheetImageRef.current;
      // 이미 올린 장소 시트는 주소를, 못 올려 뺀 것은 메모리의 원본을 쓴다.
      const locationSource = locationSheetsRef.current.length
        ? locationSheetsRef.current.map((l) => book.locationSheets?.find((b) => b.key === l.key && b.image) ?? l)
        : (book.locationSheets ?? []);
      setSaveFailure(null); // 올리는 동안은 진행 막대를 보여 준다
      const hosted = await hostArtwork(
        book.id,
        book.pages.map((p) => p.image ?? null),
        book.coverImage ?? null,
        sheetSource,
        locationSource,
      );
      const next: Book = {
        ...book,
        coverImage: hosted.cover,
        characterSheet: hosted.sheet,
        locationSheets: hosted.locationSheets.length ? hosted.locationSheets : undefined,
        pages: book.pages.map((p, i) => ({ ...p, image: hosted.images[i] ?? null })),
      };
      await commitBook(next, illustrated, hosted.failures);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  // 완성 → 저장해 둔 책을 뷰어로 보여준다.
  if (step === "done" && finalBook) {
    /*
     * 제공 동화를 보던 중에 완성됐으면 그 책을 갑자기 치우지 않는다 — 배너의 '보러 가기'나
     * 닫기를 누르면 그때 완성된 책을 연다. 두 뷰어를 겹쳐 띄우면 방향키·ESC 가 둘 다 먹는다.
     * 아래 그림 화면과 똑같이 맨 앞 자리에 두어야 듣던 책이 새로 열리지 않는다(showcaseOverlay 설명 참고).
     */
    if (showcaseOverlay) return <>{showcaseOverlay}</>;
    return (
      <>
        <BookViewer book={finalBook} />
        {/*
          완성 알약 — 만드는 순서의 끝(① 대본 ✓ › ② 그림 ✓ › ③ 동화 완성)과, 이번에 실제로 그린 장수
          (저장 단계의 '10장' — 표지 썸네일 포함 — 과 헷갈리지 않게 따로 보여 준다).
          뷰어 위쪽은 닫기·설정 단추가 차지해서 예전 그린 장수 알약 자리(아래)에 둔다. ✕ 로 닫는다.
        */}
        {(doneStepsOpen || drawSummary) && (
          <div className="pointer-events-none fixed inset-x-0 bottom-20 z-30 flex justify-center px-4">
            <div
              role="status"
              className="pointer-events-auto flex max-w-full items-center gap-1 rounded-3xl bg-neutral-900/80 py-1.5 pl-4 pr-1 text-white shadow-lg backdrop-blur"
            >
              <div className="flex min-w-0 flex-col items-center gap-1">
                {doneStepsOpen && <MakeSteps current={2} accent={accent} tone="dark" />}
                {drawSummary && (
                  <p className="break-keep text-center text-[12px] font-bold text-white">🎨 {drawSummary}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setDoneStepsOpen(false);
                  setDrawSummary("");
                }}
                aria-label="안내 닫기"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-extrabold text-white/90 hover:bg-white/10"
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // 그리기 시작부터 흐른 시간 — tick 이 1초마다 바뀌어 다시 그리므로 그때마다 새로 잰다.
  void tick;
  const drawElapsedMs = step === "illustrate" ? Date.now() - drawStartRef.current : 0;

  return (
    <>
    {/* 띄운 책은 맨 앞 자리 — 완성 화면으로 바뀌어도 같은 자리라 뷰어가 이어진다. */}
    {showcaseOverlay}
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
        {/*
          busy 는 세 곳에서 켜진다: 대본 만들기(성우 화면의 첫 단추 — 줄거리를 짓고 곧바로 대본까지, 대본 화면의 '다른 이야기로 새로 짓기'),
          같은 줄거리로 다시 쓰기(대본 화면), 다시 저장하기(그림 화면).
          단계(step)만으로는 다시 쓰기와 새로 짓기를 못 가르므로, 단추를 누를 때 정한 busyKind 로 고른다.
          대본 만들기는 한 번 기다리지만 안에서 두 걸음이라(줄거리 30초 → 대본 2분) 큰 문구만 바꿔 지금 걸음을 말한다.
          (작은 진행 줄 '줄거리 짓기 · 대본 쓰기'를 따로 두면 ①②③ 밖의 단계처럼 보여 '이야기 짓기 vs 대본' 헷갈림이
          되살아난다 — 그래서 두지 않는다.) 대본은 2분 넘게 걸리니 흐르는 시간과 감상할 동화를 함께 둔다.
          대본을 기다리는 막 맨 위에는 만드는 순서(① 대본 만들기 › ② 그림 그리기 › ③ 동화 완성)를 둔다 —
          처음 누른 부모가 이 기다림이 무엇이고 뒤에 무엇이 남았는지 여기서 처음 본다.
        */}
        {chargeAsk === "script" && (
          <ChargeConfirm
            title={`토큰 ${scriptCost}개가 나가요`}
            lines={[
              resumePlot
                ? "아까 지은 줄거리로 대본을 이어서 써요. 그때 대본 값이 이미 나갔다면 다시 받지 않아요."
                : "줄거리를 짓고 대본까지 한 번에 써요.",
              `내 잔액 ${tokens}개`,
              ...(IMAGES_ENABLED ? [`그림 값 ${imageCost}개는 대본을 읽어 보고 고친 뒤, 그릴 때 따로 내요.`] : []),
            ]}
            confirmLabel="대본 만들기"
            accent={accent}
            accentDark={accentDark}
            onCancel={() => setChargeAsk(null)}
            onConfirm={() => {
              setChargeAsk(null);
              // 확인을 누른 이 순간이 사용자 동작이다 — 대본이 나왔을 때 소리를 낼 수 있게 소리 장치를 깨워 둔다.
              primeChime();
              void makeScript();
            }}
          />
        )}
        {chargeAsk === "draw" && story && (
          <ChargeConfirm
            title={`토큰 ${illustrationCost(story.pages.length, pricing)}개가 나가요`}
            lines={[
              resumablePages > 0
                ? `그려 둔 ${resumablePages}장에 이어서 나머지를 그려요.`
                : "이 대본으로 그림을 그려 동화를 완성해요.",
              `내 잔액 ${tokens}개`,
              "그리기 시작하면 대본은 더 고칠 수 없어요.",
            ]}
            confirmLabel="그림 그리기"
            accent={accent}
            accentDark={accentDark}
            onCancel={() => setChargeAsk(null)}
            onConfirm={() => {
              setChargeAsk(null);
              primeChime();
              // 이어서 그리기면 되살릴 장수를 기억한다 — 진행 줄이 그 장들을 방금 그린 장으로 세지 않게.
              drawRestoredRef.current = resumablePages;
              illustrate(story);
            }}
          />
        )}
        {busy && (() => {
          const kind: BusyKind = busyKind ?? (step === "illustrate" ? "save" : "script");
          const wait = busyWaitText(kind, busyStage);
          return (
            // justify-center 를 바깥에 두면 낮은 화면(가로 폰)에서 넘친 윗부분이 스크롤로도 안 닿는다 — 안쪽 my-auto 로 가운데 맞춘다.
            <div className="fixed inset-0 z-20 flex flex-col overflow-y-auto bg-black/40 px-4 py-6 backdrop-blur-sm">
              <div className="my-auto flex w-full flex-col items-center gap-4">
                {kind !== "save" && (
                  <MakeSteps current={0} accent={accent} tone="dark" className="rounded-full bg-black/30 px-3 py-1.5" />
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ui.art.loading}
                  alt=""
                  width={1168}
                  height={880}
                  className="h-auto w-full max-w-[14rem] shrink-0 rounded-3xl border-4 border-white shadow-lg motion-safe:animate-[float_3s_ease-in-out_infinite]"
                />
                <p className="break-keep text-center text-lg font-extrabold text-white drop-shadow" aria-live="polite">
                  {wait.headline}
                </p>
                {wait.line && (
                  <p className="break-keep text-center text-sm font-bold text-white/90 drop-shadow">
                    {waitLine(wait.line, busyElapsed)}
                  </p>
                )}
                {wait.showcase && (
                  <div className="mt-2 w-full max-w-md">
                    <WaitShowcase books={SHOWCASE_BOOKS} onOpen={openShowcase} tone="dark" />
                  </div>
                )}
              </div>
            </div>
          );
        })()}

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
              {/* 오늘·상상·감정은 질문 한 줄이 곧 제목이라(QuestionFlow) 여기 제목은 갈래 고르기·직접 쓰기에만 둔다. */}
              {(storyMode === null || storyMode === "direct") && (
                <h1 className="break-keep text-center text-2xl font-extrabold text-neutral-800">
                  {storyMode === "direct" ? "이야기를 직접 적어 주세요" : `${name}의 동화, 어떤 이야기를 만들까요?`}
                </h1>
              )}

              {/* 갈래 고르기 — 오늘 겪은 일(실경험)이냐 상상 이야기냐. 둘은 입력 방식이 다르다. */}
              {storyMode === null && (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => chooseStoryMode("today")}
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
                      onClick={() => chooseStoryMode("imagine")}
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
                      onClick={() => chooseStoryMode("emotion")}
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
                      onClick={() => chooseStoryMode("direct")}
                      className="flex flex-col items-center gap-2 rounded-3xl bg-neutral-100 p-5 transition hover:bg-neutral-200"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/icons/topic-direct.webp" alt="" className="h-16 w-16 object-contain" />
                      <b className="text-lg text-neutral-800">직접 이야기 쓰기</b>
                      <span className="text-sm font-bold text-neutral-500">
                        우리 이야기를 직접 적어요
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

              {/* ── 직접 이야기 쓰기 — 글 한 칸(기승전결 칸은 2026-09-28 없앰, 사장님: 더 헷갈린다) ── */}
              {storyMode === "direct" && (
                <>
                  <div className="flex flex-col gap-2">
                    <p className="break-keep text-xs font-bold leading-relaxed text-neutral-500">
                      누가, 어디서, 무슨 일이 있었고 어떻게 끝났는지 편하게 적어 주세요. 짧게 적으면 그 내용을 살려
                      동화로 풀어 드리고, 길게 쓴 이야기는 내용을 바꾸지 않고 다듬어 장면으로 나눠 드려요.
                    </p>
                    <div className="flex justify-center"><VoiceInput onResult={setDirectText} /></div>
                    <textarea
                      value={directText}
                      onChange={(event) => setDirectText(event.target.value.slice(0, 5000))}
                      rows={8}
                      placeholder={`예: 오늘 ${name || "우리 아이"}가 놀이터에서 넘어졌는데, 친구 서준이가 일으켜 줬어요. 둘이 손을 잡고 미끄럼틀을 타며 깔깔 웃었어요.`}
                      className="w-full rounded-2xl border-2 border-neutral-200 bg-white text-neutral-900 px-4 py-3 text-sm font-bold leading-relaxed outline-none focus:border-neutral-400"
                    />
                    <p className="text-right text-[11px] font-bold text-neutral-400">{directText.length} / 5000자</p>
                  </div>

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
                    <FriendsInput friends={friends} onChange={setFriends} accent={accent} bestFriend={myBestFriend} />
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

              {/*
                ── 오늘의 이야기·감정 동화·상상 이야기 — 한 장에 질문 하나(2026-09-28 사장님: 한 화면에 쭉 나열하면 복잡하다) ──
                질문 목록은 storyQuestions(), 요약 한 줄은 storySummary(). 갈래마다 새로 연다(key).
              */}
              {(storyMode === "today" || storyMode === "emotion" || storyMode === "imagine") && (
                <QuestionFlow
                  key={storyMode}
                  questions={storyQuestions()}
                  initial={flowAt}
                  onMove={setFlowAt}
                  onExit={() => {
                    setFlowAt(null);
                    setStoryMode(null);
                  }}
                  onFinish={() => setStep("style")}
                  summary={storySummary()}
                  emptyHint={storyEmptyHint}
                  canFinish={Boolean(seed)}
                  accent={accent}
                  accentDark={accentDark}
                  accentSoft={accentSoft}
                />
              )}
            </section>
          )}

          {/* ── 3. 그림체 + 화면 모양 + 특별한 날 ── */}
          {step === "style" && (
            <section className="flex flex-col gap-5">
              <h1 className="break-keep text-center text-2xl font-extrabold text-neutral-800">
                누가 읽어 줄까요?
              </h1>
              {/*
               * 그림체 고르기와 '아이가 그린 그림으로 주인공 만들기'는 없앴다 — 사장님 결정(2026-09-28):
               * 이제 모든 동화는 따뜻한 수채화 한 가지(artStyle 은 늘 ART_STYLES[0] = watercolor).
               * 가족 캐릭터 그림도 수채화라, 그림체를 섞으면 고정한 얼굴과 책 그림이 따로 논다.
               */}
              <p className="-mt-3 text-center text-xs font-bold text-neutral-400">그림은 모두 따뜻한 수채화로 그려요</p>

              {/* 화면 비율 선택은 없앴다 — 항상 4:3 가로(screenShape 참고). */}

              {/* 장면 수 — 고정(FIXED_PAGE_COUNT). 고르는 칸 대신 값만 알려 준다(쪽수 = 그림 장수 = 크레딧이라
                  고르게 두면 책마다 값이 달라져 크레딧 안내가 어려웠다). */}
              <div>
                <p className="mb-1.5 text-xs font-bold text-neutral-400">
                  한 권의 길이
                </p>
                <p className="rounded-2xl bg-neutral-100 px-4 py-3 text-sm font-extrabold text-neutral-700">
                  {pageCount}장면으로 만들어요
                  <span className="ml-2 text-[11px] font-bold text-neutral-400">
                    · <b className="text-neutral-600">대본 {scriptCost}개</b>
                    {IMAGES_ENABLED ? ` + 그림 ${imageCost}개` : ""} 토큰
                  </span>
                </p>
              </div>

              {/* 이야기 길이(늘 넉넉하게)·낭독 느낌(늘 자연스럽게) 선택 칸은 없앴다 —
                  사장님 결정(2026-08-28). 고를 것이 적을수록 만들기가 빠르다. */}

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
                        <VoiceGlyph voice={voice} className="-my-0.5 h-6 w-6" />
                        {voice.label} 목소리
                      </button>
                    );
                  })}
                  {/* 나레이션용으로 고른 성우만, 정해진 순서로 — 배역용 성우는 숨긴다. */}
                  {NARRATOR_PRESETS.map((v) => {
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
                        <VoiceGlyph voice={v} className="-my-0.5 h-6 w-6" />
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

              {/*
                * 만드는 순서 소개 — 값이 나가는 첫 단추 바로 위에서 먼저 보여 준다(사장님: "순서를 알려줘야 할 듯").
                * 이 단추가 ① 대본 만들기이고, 그림(값이 따로)과 완성이 뒤에 남았다는 걸 누르기 전에 안다.
                */}
              <MakeSteps current={0} accent={accent} className="-mx-3" />

              {error && <p className="text-center text-sm font-bold text-red-600">{error}</p>}

              {/*
                * 첫 단추 — 줄거리를 짓고 곧바로 대본까지 쓴다(makeScript). 2026-09-29 사장님: '이야기 짓기'가
                * 대본 완성인지 헷갈리고 과정이 길다 → 줄거리 확인 화면을 없애고 단추 이름을 하는 일 그대로 '대본 만들기'로.
                * 이 단추에서 대본 값이 나가므로(예전 '네, 만들게요' 자리) 값을 단추에 밝히고, 그림 값은 따로라고 적는다.
                * 잔액이 모자라거나 권수 상한이면 누르기 전에 막는다(예전 확인 칸과 같은 검사 — makeBlock).
                * 대본을 기다리다 끊긴 줄거리가 있으면(resumePlot) 그 줄거리로 이어 쓰고, 잔액으로는 막지 않는다.
                */}
              <div className="mt-2 flex flex-col items-center gap-2">
                {/* 폰에서 두 단추가 한 줄에 안 들어가면 '대본 만들기'가 위, '뒤로'가 아래로 접힌다(wrap-reverse). */}
                <div className="flex flex-wrap-reverse justify-center gap-3">
                  <BigButton
                    tone="white"
                    onClick={() => {
                      // 재료 화면으로 간다 — 재료를 모르는(옛 임시저장의) 끊긴 줄거리는 여기서 버린다.
                      // 재료를 아는 것은 들고 있다가, 돌아와서 재료가 그대로면 이어 쓴다(reusablePlot).
                      if (pendingPlot && pendingPlot.basis === null) setPendingPlot(null);
                      setStep("theme");
                    }}
                  >
                    ← 뒤로
                  </BigButton>
                  <BigButton
                    accent={accent}
                    accentDark={accentDark}
                    disabled={makeBlock !== null}
                    onClick={() => {
                      // 성우를 안 골랐으면 진행 대신 골라달라고 안내한다.
                      if (!narratorVoice) {
                        setError("함께 동화를 읽어줄 성우를 먼저 골라주세요 🎙️");
                        return;
                      }
                      if (makeBlock) return;
                      // 값이 나가니 먼저 확인 창(ChargeConfirm)으로 묻는다 — 관리자는 값이 안 나가 바로 만든다.
                      if (!master) {
                        setChargeAsk("script");
                        return;
                      }
                      // 대본이 나왔을 때 소리를 낼 수 있게 — 누른 이 순간에 소리 장치를 깨워 둔다.
                      primeChime();
                      void makeScript();
                    }}
                  >
                    대본 만들기 ✍️{master ? "" : ` · 토큰 ${scriptCost}개`}
                  </BigButton>
                </div>
                <p className="flex items-center justify-center gap-1 break-keep text-center text-[11px] font-medium leading-relaxed text-neutral-500">
                  <span aria-hidden className="inline-block shrink-0 rounded-full" style={{ width: 11, height: 11, background: "radial-gradient(circle at 35% 30%, #ffe08a, #e0a020)" }} />
                  <span>
                    {master
                      ? "관리자는 토큰이 들지 않아요."
                      : `지금은 대본 값 ${scriptCost}개만 나가요 (내 잔액 ${tokens}개).`}
                    {IMAGES_ENABLED && !master && ` 그림 값 ${imageCost}개는 대본을 읽어 본 뒤 그릴 때 내요.`}
                  </span>
                </p>
                {resumePlot ? (
                  // 대본을 기다리다 끊긴 줄거리로 이어 쓴다 — 그때 값이 나갔으면 서버가 또 받지 않는다.
                  <p className="break-keep text-center text-[11px] font-bold text-neutral-600">
                    아까 지은 줄거리로 대본을 이어서 써요 · 보통 {formatUsual(usualWaitSec("story"))}쯤 걸려요
                    {!master && (
                      <>
                        <br />
                        그때 대본 값이 이미 나갔다면 다시 받지 않아요.
                      </>
                    )}
                  </p>
                ) : (
                  <p className="break-keep text-center text-[11px] font-medium text-neutral-500">
                    줄거리를 짓고 대본까지 한 번에 써요 · 보통 {formatUsual(usualWaitSec("script"))}쯤 걸려요
                  </p>
                )}
                {makeBlock === "limit" ? (
                  <p className="break-keep text-center text-xs font-bold text-red-600">
                    베타에서는 아이디당 최대 {pricing.max_books_per_user}권까지 만들 수 있어요.
                    <br />설정 › 내 동화에서 지우면 다시 만들 수 있어요.
                  </p>
                ) : makeBlock === "tokens" ? (
                  <p className="break-keep text-center text-xs font-bold text-red-600">
                    토큰이 부족해요. 설정에서 충전할 수 있어요.
                  </p>
                ) : null}
              </div>
            </section>
          )}

          {/* ── 5-1. 책장에 넣지 못함 ──
              저장이 실패하면 완성 화면으로 가지 않는다. 그림 값은 이미 나갔으니 책을 붙들고
              이유와 '다시 저장하기'를 보여 준다. 그리기 보관을 지우지 않았으므로 창을 닫아도
              다시 들어와 '저장 못 한 책 다시 저장하기'로 이어 갈 수 있다. */}
          {step === "illustrate" && saveFailure && (
            <section className="flex flex-col items-center gap-4 py-4">
              {/* 만드는 순서 — 책장에 넣는 것까지가 ② 그림 그리기다(아직 ③ 동화 완성이 아니다). */}
              <MakeSteps current={1} accent={accent} className="-mx-3" />
              <h1 className="break-keep text-center text-2xl font-extrabold text-neutral-800">
                책장에 넣지 못했어요
              </h1>
              <p className="break-keep rounded-2xl bg-red-50 px-4 py-3 text-center text-sm font-bold text-red-700">
                {saveFailure.reason}
              </p>
              <p className="break-keep text-center text-sm font-medium leading-relaxed text-neutral-600">
                {saveFailure.illustrated && !master
                  ? "그림 값은 이미 받았어요. 다시 저장해도 값을 또 받지 않아요."
                  : "만든 동화는 아직 이 화면에 그대로 있어요."}
                <br />
                {/* 글만 있는 책은 '값 냈음' 표시가 안 남아 다시 만들기 화면에 그 버튼이 뜨지 않는다 — 지킬 수 없는 약속을 하지 않는다. */}
                {saveFailure.illustrated
                  ? "창을 닫아도 이 기기에 이레 동안 남아 있어요. 다시 만들기에 들어오면 ‘저장 못 한 책 다시 저장하기’가 보여요."
                  : "이 화면에서 ‘다시 저장하기’를 눌러 주세요. 창을 닫으면 다시 만들어야 해요."}
              </p>
              <BigButton accent={accent} accentDark={accentDark} onClick={() => {
                  // 저장이 끝나(또 실패해) 알릴 때 소리를 낼 수 있게 — 누른 순간 소리 장치를 깨워 둔다.
                  primeChime();
                  setBusyKind("save");
                  retrySave();
                }} disabled={busy}>
                {busy ? "저장하는 중…" : "다시 저장하기 📚"}
              </BigButton>
              <p className="break-keep text-center text-[11px] font-medium text-neutral-400">
                여러 번 해도 안 되면 &lsquo;의견 보내기&rsquo;로 알려 주세요. 만든 기록이 남아 있어서 찾아 드릴 수 있어요.
              </p>
            </section>
          )}

          {/* ── 5. 그림 그리는 중 ── */}
          {step === "illustrate" && story && !saveFailure && (
            <section className="flex flex-col items-center gap-5 py-4">
              {/* 만드는 순서 — 지금 ② 그림 그리기(대본은 끝났다). */}
              <MakeSteps current={1} accent={accent} className="-mx-3" />
              {/* 나라 마스코트가 마법책에 그리는 그림 — 마스코트가 이미 들어 있어 따로 띄우지 않는다. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={ui.art.loading}
                alt=""
                width={1168}
                height={880}
                className="h-auto w-full max-w-xs rounded-3xl border-4 border-white shadow-lg motion-safe:animate-[float_3s_ease-in-out_infinite]"
              />
              <h1 className="break-keep text-center text-2xl font-extrabold text-neutral-800">
                {uploading || busy ? "동화를 책장에 넣고 있어요…" : "동화를 그리고 있어요…"}
              </h1>
              {/* 남은 시간 어림 — 지금까지 그린 속도로 계산한다. 언제 끝날지 알면
                  같은 시간도 훨씬 짧게 느껴진다(피드백 2번). */}
              <p className="break-keep text-center text-sm font-bold text-neutral-500">
                {uploading ? (
                  // 5쪽 책에 "파일 8"만 보이면 무엇이 8장인지 모른다 — 쪽 그림과 표지·기준 그림을 갈라 말한다.
                  uploadLine(uploading.done, uploading.total, uploading.pages)
                ) : (
                  // 첫 쪽이 나오기 전(인물·장소 시트 준비)엔 "0 / 5 쪽" 대신 준비 중이라고 말한다.
                  drawProgressLine(drawn, story.pages.length, drawElapsedMs, drawRestoredRef.current)
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
              {/* 흐르는 시간 — 그리기 시작부터. 막대가 안 움직이는 시트 준비 동안에도 초가 올라간다. */}
              {!uploading && (
                <p className="break-keep text-center text-sm font-bold text-neutral-600">
                  {/* 이어서 그리기면 남은 쪽 수로 '보통'을 잡는다 — 한 장 남았는데 "보통 4분"이라 하지 않게. */}
                  {waitLine("draw", drawElapsedMs, Math.max(0, story.pages.length - drawRestoredRef.current))}
                </p>
              )}
              {/*
                닫아도 그린 그림은 사라지지 않는다 — 그리기 보관(draw-progress)이 이 기기에 남아
                다시 들어오면 '이어서 그리기'로 그린 장을 건너뛰고, 값을 낸 책은 '다시 저장하기'로 값 없이 저장된다.
                예전 문구("닫으면 그리던 그림이 사라져요")는 보관이 생긴 뒤로 틀린 말이었다.
              */}
              {/*
                솔직하게 말한다 — 그리기는 이 기기가 한다. 아래 동화를 열어 읽는 건 괜찮지만(같은 화면 위에 뜬다),
                창을 닫거나 기기를 끄면 멈춘다. 멈춰도 그린 장은 남아 이어서 그린다.
                화면 붙잡기(wake lock)가 된 기기에서만 "화면이 꺼지지 않게"를 약속한다.
              */}
              <p className="break-keep text-center text-[11px] font-medium leading-relaxed text-neutral-400">
                {screenHeld
                  ? "다 그릴 때까지 화면이 꺼지지 않게 해 둘게요. "
                  : "다 그릴 때까지 화면을 켜 두세요. "}
                아래 동화를 열어 읽으셔도 그림은 계속 그려져요.
                <br />
                창을 닫거나 기기를 끄면 잠시 멈추고, 다시 만들기에 들어오면 그린 장부터 이어서 그려요.
              </p>
              <WaitShowcase books={SHOWCASE_BOOKS} onOpen={openShowcase} tone="light" />
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

          {/* ── 4. 대본 읽고 고치기 — 그림(비용의 80%)은 여기서 마음에 들었을 때만 만든다.
              2026-09-29부터 '대본 만들기' 단추가 곧바로 여기로 온다(줄거리 확인 화면은 없앴다).
              그림을 그리기 전에 읽고 고치는 곳은 이 화면 하나다. ── */}
          {step === "story" && story && (
            <section className="flex flex-col gap-4">
              {/* 만드는 순서 — 지금 ① 대본 만들기(읽고 고치는 중). 다음이 ② 그림 그리기라는 걸 보여 준다. */}
              <MakeSteps current={0} accent={accent} className="-mx-3" />
              <h1 className="break-keep text-center text-2xl font-extrabold text-neutral-800">
                대본이 완성됐어요!
              </h1>
              <p className="-mt-2 break-keep text-center text-xs font-medium text-neutral-400">
                그림은 아직 그리지 않았어요. 문장을 눌러 마음에 들게 고친 뒤,
                <br />그 글 그대로 그림을 그려요.
              </p>
              {/*
                다시 만들기가 끝났다는 한 줄 — 몇 초 뒤 사라진다(showRedoDone).
                비었을 때도 sr-only 로 자리를 남긴다 — 알림 영역(role=status)이 처음부터 있어야 화면 읽기가 새 글을 읽어 준다
                (sr-only 는 겹쳐 놓여 칸 사이 간격도 안 생긴다).
              */}
              <p
                role="status"
                className={redoNote ? "-my-1 break-keep text-center text-sm font-extrabold" : "sr-only"}
                style={{ color: accentDark }}
              >
                {redoNote}
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
                <ol ref={pageListRef} className="mt-4 flex max-h-[42dvh] flex-col gap-3 overflow-y-auto pr-1">
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
                  {/* 한 줄(120자)에서 세 줄(300자)로 — 장소마다 바닥·큰 물체·색·가구·빛까지
                      담기게 자동으로 채워 두고, 부모는 고치기만 하면 된다(사장님 제안). */}
                  <textarea
                    id="location-detail"
                    rows={3}
                    value={locationDetail}
                    onChange={(e) => {
                      locationTouchedRef.current = true;
                      setLocationDetail(e.target.value.slice(0, 300));
                    }}
                    placeholder="예: 계곡은 회색 자갈 바닥에 넓적한 바위 하나, 짙은 초록 나무 · 거실은 크림색 벽과 밝은 나무 마루, 하늘색 소파 · 아이스크림은 분홍색 한 덩이"
                    className="mt-2 w-full resize-none rounded-xl border-2 border-neutral-100 bg-neutral-50 px-3 py-2.5 text-sm font-medium leading-relaxed text-neutral-700 outline-none placeholder:text-neutral-300 focus:border-neutral-200"
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
                      disabled={shortOnImageTokens && !unsavedPaid}
                      onClick={() => {
                        if (shortOnImageTokens && !unsavedPaid) return;
                        // 그림 값이 나가는 길이면 먼저 확인 창으로 묻는다(이미 낸 책을 다시 저장할 때·관리자는 바로).
                        if (!master && !unsavedPaid) {
                          setChargeAsk("draw");
                          return;
                        }
                        // 다 그렸을 때 소리를 낼 수 있게 — 누른 이 순간에 소리 장치를 깨워 둔다.
                        primeChime();
                        // 이어서 그리기면 되살릴 장수를 기억한다 — 진행 줄이 그 장들을 '방금 그린 장'으로 세지 않게.
                        drawRestoredRef.current = resumablePages;
                        illustrate(story);
                      }}
                    >
                      {unsavedPaid
                        ? resumablePages > 0
                          ? "저장 못 한 책 다시 저장하기 📚 (그림 값은 이미 냈어요)"
                          : // 그리기 보관이 이 기기에 안 남았다 — 다시 그려야 하지만 값은 또 받지 않는다.
                            "다시 그려서 저장하기 🎨 (그림 값은 이미 냈어요)"
                        : resumablePages > 0
                        ? `이어서 그리기 🎨 (그려 둔 ${resumablePages}장 있음)`
                        : // 첫 단추('대본 만들기 · 토큰 N개')처럼 값이 나가는 단추에는 값을 단추에 밝힌다.
                          `이 글로 그림 그리기 🎨${master ? "" : ` · 토큰 ${illustrationCost(story.pages.length, pricing)}개`}`}
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
                  (shortOnImageTokens && !unsavedPaid ? (
                    <p className="break-keep text-center text-xs font-bold text-red-600">
                      그림을 그리려면 토큰 {illustrationCost(story.pages.length, pricing)}개가 더 필요해요
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
                        : `그림을 그리면 토큰 ${illustrationCost(story.pages.length, pricing)}개가 더 들어요 (내 잔액 ${tokens}개)`}
                      <br />
                      {drawNotice(story.pages.length)} · 그동안 명작·전래동화를 읽고 계셔도 돼요
                    </p>
                  ))}
                {/*
                  * 다시 만들기 두 가지 — 토큰은 더 받지 않는다(대본 값은 이미 냈다). 그래서 횟수로
                  * 막는다 — 안 그러면 무한정 다시 만들 수 있고, 값은 우리가 문다.
                  *  · 같은 이야기로 문장만 다시 쓰기: 줄거리는 그대로, 글만 새로.
                  *  · 다른 이야기로 새로 짓기: 줄거리부터 새로(2026-09-29 없앤 줄거리 화면의 '다른 이야기로 다시 짓기'를 이리 옮겼다).
                  * 둘이 무료 횟수를 함께 쓴다 — 서버(charge_story)가 값을 낸 줄거리 하나에 세기 때문이다(lib/create-flow redoLeft).
                  * 부모가 둘을 헷갈리지 않게 단추마다 무엇이 바뀌는지 한 줄씩 단다.
                  */}
                <div className="mt-2 flex w-full flex-col gap-2 rounded-2xl bg-white/70 p-3 ring-1 ring-black/5">
                  <p className="break-keep text-center text-xs font-extrabold text-neutral-600">
                    대본이 마음에 안 드세요?{" "}
                    {/* 두 단추가 한 횟수를 함께 쓴다 — '각각 N번'으로 읽히지 않게 '합쳐'를 밝힌다. */}
                    {redo.rewrite === null
                      ? ""
                      : redo.rewrite > 0
                        ? `아래 두 가지를 합쳐 토큰 없이 ${redo.rewrite}번 더 할 수 있어요`
                        : "무료로 다시 만들기를 다 썼어요 — 문장을 눌러 직접 고칠 수 있어요"}
                  </p>
                  <button
                    type="button"
                    onClick={() => void redoScript("same")}
                    disabled={busy || redo.rewrite === 0}
                    className="flex min-h-11 w-full flex-col items-center justify-center rounded-2xl bg-white px-4 py-2 text-center shadow-sm ring-1 ring-black/10 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="break-keep text-sm font-extrabold text-neutral-700">✍️ 같은 이야기로 문장만 다시 쓰기</span>
                    <span className="break-keep text-[11px] font-medium text-neutral-500">줄거리는 그대로 두고 글만 새로 써요</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void redoScript("new")}
                    disabled={busy || redo.replot === 0}
                    className="flex min-h-11 w-full flex-col items-center justify-center rounded-2xl bg-white px-4 py-2 text-center shadow-sm ring-1 ring-black/10 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="break-keep text-sm font-extrabold text-neutral-700">🔄 다른 이야기로 새로 짓기</span>
                    <span className="break-keep text-[11px] font-medium text-neutral-500">
                      {redo.replot === 0 && redo.rewrite !== 0
                        ? `새로 짓기는 대본 한 번에 ${MAX_REPLOTS}번까지예요`
                        : "같은 재료로 줄거리부터 새로 지어요"}
                    </span>
                  </button>
                  <p className="break-keep text-center text-[11px] font-medium text-neutral-500">
                    {master ? "관리자는 횟수를 세지 않아요 · " : ""}지금 대본과 고친 문장은 새 대본으로 바뀌어요 · 보통{" "}
                    {formatUsual(usualWaitSec("story"))}~{formatUsual(usualWaitSec("script"))}
                  </p>
                </div>
                {/*
                  * 처음부터 다시 가는 길 — 재료(누구랑·무슨 일…)부터 바꾸고 싶을 때.
                  * 새 재료로 만드는 대본은 새 이야기라 대본 값을 다시 받는다 — 버리기 전에 반드시 물어본다.
                  */}
                <button
                  type="button"
                  onClick={() => {
                    if (
                      !master &&
                      !window.confirm(
                        `지금 대본을 버리고 재료부터 새로 만들까요?\n이미 낸 대본 값 ${scriptCostOf(story.pages.length, pricing)}개는 돌려받을 수 없어요.`,
                      )
                    ) {
                      return;
                    }
                    void closeJobAsCancelled(jobIdRef.current);
                    setJobId(null);
                    setStory(null);
                    setOutline(null);
                    setPaidOutline(null);
                    setPendingPlot(null);
                    setScriptEdited(false);
                    setScriptCharged(false);
                    setStoryRewrites(0);
                    setReplots(0);
                    setLocationDetail("");
                    locationTouchedRef.current = false;
                    setEditingPage(null);
                    setEditingTitle(false);
                    setError("");
                    setStep("theme");
                  }}
                  className="min-h-11 px-3 text-xs font-bold text-neutral-500"
                >
                  ← 재료 바꿔 새로 만들기 (대본 값을 다시 내요)
                </button>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
    </>
  );
}
