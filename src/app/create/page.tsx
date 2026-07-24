"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BookViewer } from "@/components/BookViewer";
import { useTheme } from "@/components/ThemeProvider";
import { VoiceInput } from "@/components/VoiceInput";
import { ART_STYLES } from "@/lib/art-styles";
import { loadChild, saveChild } from "@/lib/prefs";
import { useEscClose } from "@/lib/use-esc-close";
import type { Book } from "@/lib/types";

type Gender = "girl" | "boy" | "unspecified";
type Scene = { sceneNo: number; text: string };
type Outline = { title: string; summary: string; scenes: Scene[] };
type StoryPage = { pageNo: number; text: string; imagePrompt: string };
type Character = { name: string; description: string };
type Story = { title: string; summary: string; characters: Character[]; pages: StoryPage[] };

type Step = "child" | "theme" | "style" | "outline" | "story" | "illustrate" | "done";

/**
 * 삽화(Gemini) 생성 스위치 — 테스트 동안은 글만 받는다(이미지는 토큰이 크다).
 * 이미지 준비가 되면 true로만 바꾸면 "그림까지 그리기"가 다시 살아난다.
 */
const IMAGES_ENABLED = false;

const AGES = [3, 4, 5, 6, 7, 8];
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
  { t: "엄마 아빠랑", e: "👨‍👩‍👧" },
  { t: "동물 친구랑", e: "🐶" },
  { t: "형·누나·동생이랑", e: "👦" },
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
  { t: "선생님이랑", e: "👩‍🏫" },
  { t: "엄마 아빠랑", e: "👨‍👩‍👧" },
  { t: "동생이랑", e: "👶" },
  { t: "혼자서", e: "🧒" },
];
const FEELINGS = [
  { t: "신났어요", e: "😄" },
  { t: "속상했어요", e: "😢" },
  { t: "무서웠어요", e: "😨" },
  { t: "뿌듯했어요", e: "😊" },
  { t: "화났어요", e: "😠" },
];

/**
 * 「감정 동화」용 — 아이가 느낀 마음. 감정에 이름을 붙여 다루는 감정동화가 된다.
 * 아이가 말로 표현하기 어려워하는 마음일수록 이야기로 다뤄줄 값어치가 크다 —
 * 그래서 화·무서움뿐 아니라 외로움·걱정·서운함·질투처럼 이름 붙이기 힘든 마음까지
 * 폭넓게 담았다. 긍정 감정(뿌듯·설렘)도 몇 개 둬서 "좋은 마음"도 이야기가 되게 한다.
 */
const EMOTIONS = [
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

/**
 * 분위기 — 옛 앱의 무드 6종을 이어받았다.
 * ko는 이야기 톤(클로드)에, en은 삽화 조명·색감(Gemini)에 실린다.
 */
const MOODS = [
  { ko: "따뜻하고 포근한", en: "warm cozy soft lighting", icon: "/icons/mood-cozy.webp" },
  { ko: "신나고 활기찬", en: "bright energetic vibrant colors", icon: "/icons/mood-energetic.webp" },
  { ko: "마법같이 몽환적인", en: "dreamy magical sparkling atmosphere", icon: "/icons/mood-magical.webp" },
  { ko: "차분하고 잔잔한", en: "calm gentle serene mood", icon: "/icons/mood-calm.webp" },
  { ko: "용감한 모험", en: "adventurous heroic exciting, kid-friendly", icon: "/icons/mood-adventure.webp" },
  { ko: "장난스럽고 웃긴", en: "playful silly humorous", icon: "/icons/mood-funny.webp" },
];

/** 장면(쪽) 수 선택지 3~8. 삽화를 켜면 쪽수가 곧 그림 장수(=크레딧)라 8이 상한. */
const PAGE_OPTIONS = [3, 4, 5, 6, 7, 8];

/**
 * 나이에 맞는 장면 수를 추천한다 — 어린 아이는 짧게, 큰 아이는 넉넉히.
 * 강제는 아니고 별표(추천)로만 표시한다.
 */
function recommendedPages(age: number | null): number {
  if (age === null) return 6;
  if (age <= 4) return 4;
  if (age <= 6) return 6;
  return 8;
}

/** 조사를 떼어 지칭어를 만든다 — "친구랑"→"친구", "동생이랑"→"동생". */
function companionTerm(who: string): string {
  return who.replace(/(이랑|랑|이와|와|과|하고)$/u, "");
}

/**
 * 동행 이름 입력 — "친구랑" 같은 사람 동행을 골랐을 때만 뜬다. 이름을 넣으면 그
 * 이름을 그대로 쓰고, 비우면 "친구"처럼 지칭어로만 부른다("친구토토" 엉킴 방지).
 * "혼자서"엔 뜨지 않는다.
 */
function WhoNameInput({
  who,
  value,
  onChange,
}: {
  who: string;
  value: string;
  onChange: (v: string) => void;
}) {
  if (!who || who === "혼자서") return null;
  const term = companionTerm(who);
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
        className="w-full rounded-2xl border-2 border-dashed border-neutral-200 px-4 py-2.5 text-sm font-bold outline-none focus:border-neutral-400"
      />
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
      className="rounded-full px-8 py-3.5 text-lg font-extrabold transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export default function CreatePage() {
  // 주제 입력 상태 이름이 theme이라, UI 테마는 ui로 받는다.
  const { theme: ui } = useTheme();
  const { accent, accentDark, accentSoft } = ui.colors;

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

  // 입력값
  const [name, setName] = useState("");
  const [age, setAge] = useState<number | null>(null);
  const [gender, setGender] = useState<Gender>("girl");
  const [theme, setTheme] = useState("");
  // 주제 고르기 1단계 — 펼쳐진 갈래 카드. null이면 아직 안 골랐다.
  const [themeGroup, setThemeGroup] = useState<string | null>(null);
  // 이야기 갈래 — 오늘의 이야기(실경험) / 상상 이야기(칩) / 감정 동화(마음). null=미선택.
  const [storyMode, setStoryMode] = useState<"today" | "imagine" | "emotion" | null>(null);
  // 이야기 재료 — 누구랑·무슨 일. 세부주제(theme)와 함께 씨앗을 이룬다.
  const [who, setWho] = useState("");
  // 동행의 실제 이름(선택). "친구랑" 고르고 이름을 넣으면 그 이름을 그대로 쓴다.
  const [whoName, setWhoName] = useState("");
  const [happening, setHappening] = useState("");
  const [extra, setExtra] = useState("");
  // 「오늘의 이야기」 전용 — 어디서·무슨 일(자유)·기분. 누구랑(who)은 공유한다.
  const [place, setPlace] = useState("");
  const [todayEvent, setTodayEvent] = useState("");
  const [feeling, setFeeling] = useState("");
  // 「감정 동화」 전용 — 어떤 마음·그런 마음이 든 상황. 누구랑(who)은 공유한다.
  const [emotion, setEmotion] = useState("");
  const [situation, setSituation] = useState("");

  useEffect(() => {
    const saved = loadChild();
    if (!saved) return;
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
        : [theme, who, happening, extra.trim()].filter(Boolean).join(", ");
  // 그림체 — 지금은 저장만 한다. Gemini 삽화가 붙으면 이 스타일의 prompt가 쓰인다.
  const [artStyle, setArtStyle] = useState(ART_STYLES[0].id);
  const [mood, setMood] = useState(MOODS[0]);
  // 장면(쪽) 수 3~8. 나이에 맞는 추천값으로 시작한다(부모가 바꿀 수 있다).
  const [pageCount, setPageCount] = useState(() => recommendedPages(null));

  // 생성 결과
  const [outline, setOutline] = useState<Outline | null>(null);
  const [story, setStory] = useState<Story | null>(null);
  // 쪽별 삽화(data URL). 실패한 쪽은 null → 뷰어가 플레이스홀더를 그린다.
  const [pageImages, setPageImages] = useState<(string | null)[]>([]);
  const [drawn, setDrawn] = useState(0);

  const child = { name: name.trim(), age: age ?? 0, gender };

  // 동행 칩을 누르면(또는 껐다 켜면) 이름은 초기화한다 — "친구랑"에 넣은 이름이
  // "동생이랑"으로 바꿔도 남아 엉키는 걸 막는다.
  function chooseWho(t: string) {
    setWho((prev) => (prev === t ? "" : t));
    setWhoName("");
  }

  async function makeOutline() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
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
            storyMode === "today"
              ? {
                  kind: "today",
                  subject: "",
                  who,
                  whoName: whoName.trim(),
                  happening: todayEvent.trim(),
                  place,
                  feeling,
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
                    happening,
                    place: "",
                    feeling: "",
                    emotion: "",
                    situation: "",
                    extra: extra.trim(),
                  },
          pageCount,
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

  async function makeStory() {
    if (!outline || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const r = await fetch("/api/story", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ child, outline, mood: mood.ko }),
        signal: ac.signal,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "동화를 만들지 못했어요.");
      setStory(data.story);
      // 바로 그림으로 가지 않는다 — 부모가 이야기를 읽어보고, 마음에 들 때만
      // 그림(비용의 80%)을 만든다. 그림 없이도 테마 배경 위 글 동화로 볼 수 있다.
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
    // 삽화는 쪽당 과금이라 취소가 중요하다 — ESC나 화면 이탈 시 남은 쪽을 그리지 않는다.
    const ac = new AbortController();
    abortRef.current = ac;
    const images: (string | null)[] = [];
    try {
      const sheetRes = await fetch("/api/character-sheet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ characters: s.characters, artStyleId: artStyle }),
        signal: ac.signal,
      });
      const sheetData = await sheetRes.json();
      if (!sheetRes.ok) throw new Error(sheetData.error ?? "캐릭터 생성 실패");
      const sheet = sheetData.image as string;

      for (let i = 0; i < s.pages.length; i++) {
        if (ac.signal.aborted) break;
        const r = await fetch("/api/illustrate-page", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            scene: s.pages[i].imagePrompt,
            artStyleId: artStyle,
            characterSheet: sheet,
            mood: mood.en,
          }),
          signal: ac.signal,
        });
        const d = await r.json();
        images.push(r.ok ? (d.image as string) : null);
        setDrawn(i + 1);
        setPageImages([...images]);
      }
    } catch (e) {
      // 취소는 정상 경로. 그 외 실패(키 없음 등)는 글만으로 진행한다.
      if ((e as Error).name !== "AbortError") console.warn("[illustrate]", e);
    }
    // 취소했더라도 그때까지 그린 쪽으로 완성 화면을 보여준다 (나머지는 플레이스홀더).
    setPageImages(images);
    setStep("done");
  }

  // 완성 → 뷰어. 삽화가 있으면 넣고, 실패한 쪽은 플레이스홀더.
  if (step === "done" && story) {
    const book: Book = {
      id: "new",
      lang: "ko",
      title: story.title,
      summary: story.summary,
      pages: story.pages.map((p, i) => ({ text: p.text, image: pageImages[i] ?? null })),
    };
    return <BookViewer book={book} />;
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

      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center px-6 py-8">
        {/* 뒤로 / 홈 */}
        <Link
          href="/"
          className="absolute left-4 top-4 rounded-full bg-white/70 px-4 py-2 text-sm font-bold text-neutral-700 backdrop-blur"
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
              {step === "outline" ? "동화를 그리고 있어요…" : "이야기를 짓고 있어요…"}
            </p>
          </div>
        )}

        <div className="rounded-[28px] bg-white/85 p-7 shadow-xl backdrop-blur">
          {/* ── 1. 아이 정보 ── */}
          {step === "child" && (
            <section className="flex flex-col gap-5">
              <h1 className="text-center text-2xl font-extrabold text-neutral-800">
                누구의 동화를 만들까요?
              </h1>

              <div>
                <label className="mb-1.5 block text-sm font-bold text-neutral-500">이름</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={20}
                  placeholder="아이 이름"
                  className="w-full rounded-2xl border-2 border-neutral-200 px-4 py-3 text-lg font-bold outline-none focus:border-neutral-400"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-bold text-neutral-500">나이</label>
                <div className="flex flex-wrap gap-2">
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
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-bold text-neutral-500">성별</label>
                <div className="flex gap-2">
                  {GENDERS.map((g) => (
                    <button
                      key={g.value}
                      type="button"
                      onClick={() => setGender(g.value)}
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
              <h1 className="text-center text-2xl font-extrabold text-neutral-800">
                {storyMode === "today"
                  ? `${name}에게 오늘 무슨 일이 있었어요?`
                  : storyMode === "imagine"
                    ? `${name}의 동화, 무슨 이야기로 할까요?`
                    : `${name}의 동화, 어떤 이야기를 만들까요?`}
              </h1>

              {/* 갈래 고르기 — 오늘 겪은 일(실경험)이냐 상상 이야기냐. 둘은 입력 방식이 다르다. */}
              {storyMode === null && (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                  </div>
                  <div className="flex justify-center">
                    <BigButton tone="white" onClick={() => setStep("child")}>
                      ← 뒤로
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
                          <span className="text-base leading-none">{it.e}</span>
                          {it.t}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-bold text-neutral-400">누구랑 있었어요?</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {TODAY_WHO.map((it) => (
                        <button
                          key={it.t}
                          type="button"
                          onClick={() => chooseWho(it.t)}
                          style={who === it.t ? { background: accent } : undefined}
                          className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold transition ${
                            who === it.t ? "text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                          }`}
                        >
                          <span className="text-base leading-none">{it.e}</span>
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
                      className="w-full rounded-2xl border-2 border-neutral-200 px-4 py-3 text-base font-bold outline-none focus:border-neutral-400"
                    />
                  </div>

                  <WhoNameInput who={who} value={whoName} onChange={setWhoName} />

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
                          <span className="text-base leading-none">{it.e}</span>
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

                  <div className="mt-2 flex justify-center gap-3">
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
                          <span className="text-base leading-none">{it.e}</span>
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
                    <div className="flex justify-center py-1">
                      <VoiceInput onResult={(t) => setSituation(t)} />
                    </div>
                    <textarea
                      value={situation}
                      onChange={(e) => setSituation(e.target.value.slice(0, 200))}
                      rows={2}
                      placeholder="예: 동생이 내 장난감을 가져갔을 때"
                      className="w-full rounded-2xl border-2 border-neutral-200 px-4 py-3 text-base font-bold outline-none focus:border-neutral-400"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-bold text-neutral-400">
                      누구랑 있었어요? <span className="font-medium">(선택)</span>
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {TODAY_WHO.map((it) => (
                        <button
                          key={it.t}
                          type="button"
                          onClick={() => chooseWho(it.t)}
                          style={who === it.t ? { background: accent } : undefined}
                          className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold transition ${
                            who === it.t ? "text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                          }`}
                        >
                          <span className="text-base leading-none">{it.e}</span>
                          {it.t}
                        </button>
                      ))}
                    </div>
                  </div>

                  <WhoNameInput who={who} value={whoName} onChange={setWhoName} />

                  {seed && (
                    <p className="rounded-2xl bg-neutral-50 px-4 py-2.5 text-center text-sm font-bold text-neutral-500">
                      🌱 {name.trim() || "우리 아이"}의 마음 이야기 — <span className="text-neutral-800">{seed}</span>
                    </p>
                  )}

                  <div className="mt-2 flex justify-center gap-3">
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
                          <span className="text-[13px] leading-tight">{group.label}</span>
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
                      {WHO_OPTIONS.map((it) => (
                        <button
                          key={it.t}
                          type="button"
                          onClick={() => chooseWho(it.t)}
                          style={who === it.t ? { background: accent } : undefined}
                          className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold transition ${
                            who === it.t ? "text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                          }`}
                        >
                          <span className="text-base leading-none">{it.e}</span>
                          {it.t}
                        </button>
                      ))}
                    </div>
                  </div>

                  <WhoNameInput who={who} value={whoName} onChange={setWhoName} />

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
                          <span className="text-base leading-none">{it.e}</span>
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
                      className="w-full rounded-2xl border-2 border-neutral-200 px-4 py-3 text-base font-bold outline-none focus:border-neutral-400"
                    />
                  </div>

                  {seed && (
                    <p className="rounded-2xl bg-neutral-50 px-4 py-2.5 text-center text-sm font-bold text-neutral-500">
                      🌱 {name.trim() || "우리 아이"}의 <span className="text-neutral-800">{seed}</span> 이야기
                    </p>
                  )}

                  <div className="mt-2 flex justify-center gap-3">
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

          {/* ── 3. 그림체 + 분위기 + 특별한 날 ── */}
          {step === "style" && (
            <section className="flex flex-col gap-5">
              <h1 className="text-center text-2xl font-extrabold text-neutral-800">
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
                      <span className="text-[11px] font-bold leading-tight text-neutral-700">
                        {s.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* 분위기 — 이야기 톤과 그림 조명에 함께 반영된다 */}
              <div>
                <p className="mb-1.5 text-xs font-bold text-neutral-400">분위기</p>
                <div className="flex flex-wrap gap-2">
                  {MOODS.map((m) => (
                    <button
                      key={m.ko}
                      type="button"
                      onClick={() => setMood(m)}
                      style={mood.ko === m.ko ? { background: accent } : undefined}
                      className={`flex items-center gap-1.5 rounded-full py-1.5 pl-1.5 pr-3.5 text-sm font-bold transition ${
                        mood.ko === m.ko
                          ? "text-white"
                          : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                      }`}
                    >
                      <span className="h-7 w-7 overflow-hidden rounded-full bg-white">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={m.icon} alt="" className="h-full w-full object-cover" />
                      </span>
                      {m.ko}
                    </button>
                  ))}
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
                  ⭐ {age ?? "우리 아이"}세에게 알맞은 길이예요
                  {IMAGES_ENABLED
                    ? ` · 그림은 장면당 약 55원 (${pageCount}장 ≈ ${pageCount * 55}원)`
                    : " · 지금은 글만 만들어 장면 수와 상관없이 무료예요"}
                </p>
              </div>

              {error && <p className="text-center text-sm font-bold text-red-600">{error}</p>}

              <div className="mt-2 flex justify-center gap-3">
                <BigButton tone="white" onClick={() => setStep("theme")}>
                  ← 뒤로
                </BigButton>
                <BigButton accent={accent} accentDark={accentDark} onClick={makeOutline}>
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
              <h1 className="text-center text-2xl font-extrabold text-neutral-800">
                동화를 그리고 있어요…
              </h1>
              <p className="text-sm font-bold text-neutral-500">
                {drawn} / {story.pages.length} 쪽
              </p>
              <div className="h-3 w-full overflow-hidden rounded-full bg-neutral-100">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${(drawn / story.pages.length) * 100}%`,
                    background: accent,
                  }}
                />
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
              <h1 className="text-center text-2xl font-extrabold text-neutral-800">
                이 이야기로 만들까요?
              </h1>
              <div className="rounded-2xl p-5" style={{ background: accentSoft }}>
                <h2 className="text-center text-xl font-extrabold text-neutral-800">
                  {outline.title}
                </h2>
                <ol className="mt-3 flex flex-col gap-2.5">
                  {outline.scenes.map((s) => (
                    <li key={s.sceneNo} className="flex gap-2.5">
                      <span style={{ background: accent }}
                        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-white">
                        {s.sceneNo}
                      </span>
                      <p className="text-sm font-medium leading-relaxed text-neutral-700">
                        {s.text}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>

              {error && <p className="text-center text-sm font-bold text-red-600">{error}</p>}

              <div className="mt-1 flex flex-col items-center gap-2">
                <BigButton accent={accent} accentDark={accentDark} onClick={makeStory}>이 이야기로 동화 만들기 📖</BigButton>
                <button
                  type="button"
                  onClick={makeOutline}
                  className="text-sm font-bold text-neutral-500 underline"
                >
                  다른 이야기로 다시 짓기 🔄
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
              <h1 className="text-center text-2xl font-extrabold text-neutral-800">
                이야기가 완성됐어요!
              </h1>
              <div className="rounded-2xl p-5" style={{ background: accentSoft }}>
                <h2 className="text-center text-xl font-extrabold text-neutral-800">
                  {story.title}
                </h2>
                {/* 쪽별로 나눠 보여준다 — 책이 어떻게 넘어갈지 그대로 보인다. */}
                <ol className="mt-4 flex max-h-[42dvh] flex-col gap-3 overflow-y-auto pr-1">
                  {story.pages.map((p) => (
                    <li key={p.pageNo} className="flex gap-2.5">
                      <span
                        style={{ background: accent }}
                        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-white"
                      >
                        {p.pageNo}
                      </span>
                      <p className="text-sm font-medium leading-relaxed text-neutral-700">
                        {p.text}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>

              {error && <p className="text-center text-sm font-bold text-red-600">{error}</p>}

              <div className="mt-1 flex flex-col items-center gap-2">
                <div className="flex flex-wrap justify-center gap-3">
                  {IMAGES_ENABLED && (
                    <BigButton
                      accent={accent}
                      accentDark={accentDark}
                      onClick={() => illustrate(story)}
                    >
                      그림까지 그리기 🎨
                    </BigButton>
                  )}
                  {/* 이미지 off일 때는 글 동화 버튼이 메인이 된다. */}
                  {IMAGES_ENABLED ? (
                    <BigButton
                      tone="white"
                      onClick={() => {
                        setPageImages([]);
                        setStep("done");
                      }}
                    >
                      글 동화로 바로 보기 📖
                    </BigButton>
                  ) : (
                    <BigButton
                      accent={accent}
                      accentDark={accentDark}
                      onClick={() => {
                        setPageImages([]);
                        setStep("done");
                      }}
                    >
                      이 이야기로 동화 보기 📖
                    </BigButton>
                  )}
                </div>
                {IMAGES_ENABLED && (
                  <p className="text-[11px] font-medium text-neutral-400">
                    그림은 1~2분 정도 걸려요 · 글 동화는 바로 읽을 수 있어요
                  </p>
                )}
                <button
                  type="button"
                  onClick={makeStory}
                  className="text-xs font-bold text-neutral-400 underline"
                >
                  같은 줄거리로 다시 쓰기 🔄
                </button>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
