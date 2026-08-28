"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  loadBgmOn,
  loadBookProgress,
  loadSfxOn,
  loadBookLayout,
  loadMyBooksBrief,
  loadTextPos,
  loadTextScale,
  type BookLayout,
  saveBgmOn,
  saveBookLayout,
  saveBookProgress,
  saveTextScale,
  TEXT_SCALES,
  hotspotHintSeen,
  markHotspotHintSeen,
  updateBookData,
  loadStoryFont,
  type StoryFont,
  STORY_FONTS,
  loadStoryWeight,
  type StoryWeight,
  STORY_WEIGHTS,
  storyWeightForFont,
} from "@/lib/prefs";
import { loadSession } from "@/lib/auth";
import { fitScale } from "@/lib/fit-text";
import classicBooksJson from "@/data/classic-books.json";
import folkBooksJson from "@/data/folk-books.json";
import { enterStoryMode, exitStoryMode } from "@/lib/story-mode";
import type { Book } from "@/lib/types";
import { asBooks } from "@/lib/types";
import { locationKeyOf } from "@/lib/story-quality";
import {
  applyPlaybackRate,
  buildPresetUtterance,
  fetchGoogleAudio,
  fetchTypecastVoiceAudio,
  findPreset,
  findTypecast,
  CLIENT_TTS_ENABLED,
  DEFAULT_VOICE_RATE,
  GOOGLE_TTS_ENABLED,
  loadSelectedVoiceId,
  loadVoiceRate,
  prefetchTypecastPageAudio,
  saveSelectedVoiceId,
  saveVoiceRate,
  startTypecastPageAudio,
  NARRATOR_PRESETS,
  TYPECAST_VOICES,
  warmUpVoices,
  type PendingSegment,
} from "@/lib/voices";
import { loadParentVoices, type ParentVoice } from "@/lib/parent-voice";
import { OrientationHint } from "./OrientationHint";
import { useTheme } from "./ThemeProvider";
import { currentReadingChunk, splitStorySentences } from "@/lib/reading-chunks";

const SWIPE_THRESHOLD_PX = 50;

/**
 * 한 권에 다시 그릴 수 있는 그림 수 (마스터 제외).
 *
 * 왜 여느냐 — 그림 하나가 이상하게 나왔을 때 돈 낸 부모가 할 수 있는 게 아무것도
 * 없으면, 그건 환불 사유고 아이 앱에서는 "이 앱 이상하다"가 된다.
 * 왜 한 장이냐 — 한 장에 약 55원이 실제로 나간다. 무제한이면 마음에 들 때까지
 * 돌리게 되고 그 값은 우리가 문다. 한 장이면 "제일 이상한 쪽 하나"는 구제된다.
 */
const FREE_REDRAWS_PER_BOOK = 1;

/** Web Speech 폴백용 읽기 속도(초당 글자). 경계 이벤트가 안 오는 기기에서 쓴다. */
const FALLBACK_CHARS_PER_SEC = 5.5;

/**
 * 본문이 준비된 칸보다 길면 스크롤을 만들지 않고 글자만 단계적으로 줄인다.
 * 실제 DOM 크기를 재므로 글꼴·기기·가로세로·사용자 글자 크기가 달라도 맞는다.
 */
function AutoFitStoryText({
  children,
  fitKey,
  baseSize,
  textScale,
  fontScale,
  fontWeight,
  className,
}: {
  children: React.ReactNode;
  /**
   * 이 글이 바뀌면 다시 재라는 표시 — 보통 그 쪽 본문.
   *
   * 없으면 쪽을 넘겨도 다시 재지 않는다. 글꼴·글자 크기가 그대로면 효과가 다시 돌지
   * 않아서, 짧은 쪽에서 정한 배율(1)이 긴 쪽에 그대로 남아 글이 잘렸다.
   */
  fitKey: string;
  baseSize: string;
  textScale: number;
  fontScale: number;
  fontWeight: number;
  className: string;
}) {
  const ref = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    const text = ref.current;
    const box = text?.parentElement;
    if (!text || !box) return;

    const fit = () => {
      text.style.setProperty("--story-fit", "1");
      /*
       * 두 가지를 함께 본다.
       *
       * ① 부모 칸을 넘는가 — 펼침면 종이처럼 높이가 정해진 칸에서 쓴다.
       * ② 스스로 잘리는가(scrollHeight > clientHeight) — 그림 위 자막처럼 부모가
       *    글에 맞춰 늘어나는 칸에서는 ①이 늘 통과해 버린다. 그 칸은 부모가 아니라
       *    본문에 걸린 max-h 가 자르므로, 잘리는지는 글 자신에게 물어야 한다.
       *    이걸 빠뜨려서 긴 쪽 마지막 줄이 뭉텅 잘려 나갔다.
       */
      const availableHeight = Math.min(box.clientHeight, window.innerHeight * 0.76);
      const availableWidth = box.clientWidth;
      const fitsAt = (scale: number) => {
        text.style.setProperty("--story-fit", String(scale));
        const clipped =
          text.scrollHeight > text.clientHeight + 1 || text.scrollWidth > text.clientWidth + 1;
        return (
          !clipped &&
          text.scrollHeight <= availableHeight + 1 &&
          text.scrollWidth <= availableWidth + 1
        );
      };
      // 얼마나 줄일지 고르는 셈법은 fit-text.ts 에 떼어 두고 테스트로 지킨다.
      text.style.setProperty("--story-fit", String(fitScale(fitsAt)));
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    void document.fonts?.ready.then(fit);
    return () => observer.disconnect();
  }, [baseSize, fitKey, fontScale, fontWeight, textScale]);

  return (
    <p
      ref={ref}
      style={{
        fontSize: `calc(${baseSize} * ${textScale} * ${fontScale} * var(--story-fit, 1))`,
        fontWeight,
      }}
      className={`${className} overflow-hidden`}
    >
      {children}
    </p>
  );
}

/** 핫스팟 라벨 → 한국어 이름 (스크린리더·접근성용). */
const HOTSPOT_KO: Record<string, string> = {
  heungbu: "흥부",
  nolbu: "놀부",
  swallow: "제비",
  dokkaebi: "도깨비",
  rabbit: "토끼",
  tortoise: "거북이",
  owl: "부엉이",
  kongjwi: "콩쥐",
  toad: "두꺼비",
  sparrow: "참새",
  fairy: "선녀님",
  magistrate: "원님",
  ox: "소",
  pig1: "첫째 돼지",
  pig2: "둘째 돼지",
  pig3: "막내 돼지",
  pigs: "아기 돼지들",
  mompig: "엄마 돼지",
  wolf: "늑대",
  duckling: "아기 오리",
  duckmom: "엄마 오리",
  swan: "백조",
  redhood: "빨간 모자",
  mother: "엄마",
  grandma: "할머니",
  hunter: "사냥꾼",
  donkey: "당나귀",
  dog: "개",
  cat: "고양이",
  rooster: "수탉",
  robber: "도둑",
  ant: "개미",
  littleant: "꼬마 개미",
  grasshopper: "베짱이",
  countrymouse: "시골 쥐",
  citymouse: "도시 쥐",
  brother: "오빠",
  sister: "여동생",
  tiger: "호랑이",
  spirit: "산신령",
  woodcutter: "나무꾼",
  greedy: "욕심쟁이",
};

export function BookViewer({ book }: { book: Book }) {
  const router = useRouter();
  // 그림 없는 쪽의 배경으로 쓴다 — 글 동화도 테마(동화나라) 안에서 읽힌다.
  const { theme: ui } = useTheme();
  // 글자 위치(위/아래) — 설정에서 고른다. 뷰어는 열 때마다 새로 읽으면 충분하다.
  // localStorage 값은 첫 서버 렌더와 다를 수 있으므로 첫 렌더는 기본값으로 맞춘다.
  // 마운트 후 저장된 위치를 읽어야 hydration mismatch가 발생하지 않는다.
  const [textPos, setTextPos] = useState<ReturnType<typeof loadTextPos>>("bottom");
  // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage는 클라 전용, 마운트 후 반영(hydration 안전)
  useEffect(() => setTextPos(loadTextPos()), []);
  // 책 보는 방식 — 가로에서 '꽉 찬 그림'이냐 '펼침면(그림|글 반반)'이냐.
  const [layout, setLayout] = useState<BookLayout>("full");
  // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage는 클라 전용, 마운트 후 반영
  useEffect(() => setLayout(loadBookLayout()), []);
  const spread = layout === "spread";
  // 글자 크기 배율 — 책 안에서 바로 바꾼다("보다가 작네" 싶을 때). 계정별로 저장된다.
  const [textScale, setTextScale] = useState(1);
  const [sizeMenu, setSizeMenu] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage는 클라 전용, 마운트 후 반영
  useEffect(() => setTextScale(loadTextScale()), []);
  /*
   * 본문 글꼴 — 부모가 설정에서 고른다. 글꼴마다 같은 px에서도 보이는 크기가 달라서,
   * 글자 크기 배율(textScale)에 글꼴 배율(font.scale)을 함께 곱해야 어떤 글꼴을 골라도
   * 비슷한 크기로 보인다. 줄 간격도 글꼴이 들고 있는 값을 쓴다.
   */
  const [font, setFont] = useState<StoryFont>(STORY_FONTS[0]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage는 클라 전용
  useEffect(() => setFont(loadStoryFont()), []);
  // 글자 굵기 — 예전엔 모든 글꼴에 600이 박혀 있어, 400뿐인 글꼴은 늘 가짜 굵기였다.
  const [weight, setWeight] = useState<StoryWeight>(STORY_WEIGHTS[1]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage는 클라 전용
  useEffect(() => setWeight(loadStoryWeight()), []);
  const applyTextScale = (s: number) => {
    setTextScale(s);
    saveTextScale(s);
    setSizeMenu(false);
  };
  const applyBookLayout = (next: BookLayout) => {
    setLayout(next);
    saveBookLayout(next);
    setSizeMenu(false);

    // 모바일 세로에서 펼침면을 고르면 클릭 제스처 안에서 곧바로 전체화면·가로 고정을
    // 요청한다. Android Chrome/Samsung Internet은 자동 전환되고, 강제 회전을 막는
    // iPhone Safari에서는 저장된 값만 유지되어 사용자가 직접 돌렸을 때 적용된다.
    if (
      next === "spread" &&
      typeof window !== "undefined" &&
      window.matchMedia("(orientation: portrait)").matches &&
      (window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0)
    ) {
      enterStoryMode();
    }
  };
  const [index, setIndex] = useState(0);
  const lastIndex = book.pages.length - 1;
  const completedThisVisitRef = useRef(false);
  const progressBookRef = useRef<string | null>(null);
  const [progressReady, setProgressReady] = useState(false);

  // 쪽별 그림의 실제 비율(가로÷세로) — 그림이 로드되면 잰다. 책마다 그림 비율이 달라서
  // (흥부 4:3, 해님달님 2.36:1 등) 4:3 고정 틀은 와이드 그림에서 위아래가 뜨고 '짤린'
  // 것처럼 보였다. 실측 비율로 무대 틀을 맞추면 어떤 그림이든 꽉 찬다. 기본값 4:3.
  const [imgRatios, setImgRatios] = useState<Record<number, number>>({});

  // 이어보기 — 서재로 나갔다 다시 들어오면 읽던 쪽부터 보인다.
  // animate=false로 시작해, 마운트 직후의 "읽던 쪽으로 점프"는 애니메이션 없이
  // 즉시 이동시키고(휘리릭 넘어가는 어색함 방지), 그 뒤 넘김부터 부드럽게 굴린다.
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    const saved = loadBookProgress(book.id);
    completedThisVisitRef.current = false;
    progressBookRef.current = null;
    const resumeAt = saved > 0 && saved < lastIndex ? saved : 0;
    if (saved >= lastIndex) {
      // 예전 버전에서 마지막 쪽이 저장된 책도 다음 방문부터 첫 쪽으로 정리한다.
      saveBookProgress(book.id, 0);
    }
    let cancelled = false;
    // 외부 저장소 값을 읽은 뒤 다음 microtask에서 반영해 동기 effect 연쇄 렌더를 피한다.
    queueMicrotask(() => {
      if (cancelled) return;
      setIndex(resumeAt);
      progressBookRef.current = book.id;
      setProgressReady(true);
    });
    const t = setTimeout(() => setAnimate(true), 80);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [book.id, lastIndex]);

  // 중간에 나가면 이어 보고, 마지막 쪽까지 도달한 책은 다음 방문에 처음부터 본다.
  // 완독 뒤 같은 방문에서 앞장을 다시 보더라도 완료 상태(0)를 덮어쓰지 않는다.
  useEffect(() => {
    if (!progressReady || progressBookRef.current !== book.id) return;
    if (index >= lastIndex) completedThisVisitRef.current = true;
    saveBookProgress(book.id, completedThisVisitRef.current ? 0 : index);
  }, [book.id, index, lastIndex, progressReady]);

  /**
   * 읽어주기 — 노래방처럼, 읽힌 글자가 색으로 표시된다.
   *
   * · mp3(성우/부모 목소리)가 있으면 그걸 틀고, 재생 진행에 비례해 색을 채운다.
   *   (단어 타임스탬프가 없어서 비례 방식 — 체감상 충분히 따라간다)
   * · 없으면 브라우저 내장 TTS(Web Speech). onboundary가 실제 읽는 글자
   *   위치를 주므로 정확히 따라간다. 경계 이벤트가 없는 기기는 속도 추정 폴백.
   * · 한 쪽이 끝나면 자동으로 다음 쪽으로 넘어가 계속 읽는다 (이어 읽기).
   *   아이가 한 번 누르면 끝까지 듣는 게 목표다.
   */
  const [reading, setReading] = useState(false);
  const [highlight, setHighlight] = useState(0); // 현재 쪽에서 색칠된 글자 수
  const readingRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fallbackTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearFallback = () => {
    if (fallbackTimer.current) clearInterval(fallbackTimer.current);
    fallbackTimer.current = null;
  };

  // 재생 순번 — 읽는 중에 넘겨서 재생이 갈아타면, 이전 재생의 콜백(끝남 이벤트,
  // 뒤늦게 도착한 성우 음성, 취소로 인한 오류 이벤트)이 새 재생을 방해하지 못하게
  // 순번이 다르면 전부 무시한다.
  const runIdRef = useRef(0);

  // 소리 — 책장 넘김 효과음(짧아서 낭독과 안 겹침) + 배경음(토글로 켜고 끈다).
  const sfxRef = useRef<HTMLAudioElement | null>(null);
  // 넘김 소리가 나는 동안 잠가 둔다 — 자세한 이유는 go()의 주석 참고.
  const sfxBusy = useRef(false);
  const sfxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const [bgmOn, setBgmOn] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage는 클라 전용, 마운트 후 반영
  useEffect(() => setBgmOn(loadBgmOn()), []);

  // 재생 속도 — 뷰어 안에서 바로 바꾼다(유튜브식). 설정값을 초기값으로.
  // rateRef는 readPage가 매번 최신 속도를 읽게 하고, 재생 중이면 즉시 반영한다.
  const [rate, setRate] = useState(DEFAULT_VOICE_RATE);
  const rateRef = useRef(DEFAULT_VOICE_RATE);
  const [speedMenu, setSpeedMenu] = useState(false);
  /*
   * 읽어주는 동안에는 조작 단추를 감춘다.
   *
   * 단추가 네 귀퉁이를 다 차지해서 정작 그림과 글이 가린다는 지적이 있었다
   * (2026-08-27). 읽기를 시작하면 사라지고, 멈추면 스스로 돌아온다.
   * 읽는 도중에 손대고 싶으면 왼쪽 위 손잡이를 누른다.
   *
   * 상태를 따로 두지 않고 reading 에서 끌어낸다 — 효과 안에서 상태를 바꾸면
   * 읽기 시작과 감추기가 두 번에 나뉘어 한 박자 깜빡인다.
   * 멈춤 단추는 감추지 않는다 — 그걸 감추면 읽기를 멈출 방법이 없어진다.
   */
  const [chromeShown, setChromeShown] = useState(false);
  const chromeOff = reading && !chromeShown;
  /* 감출 때는 눌리지도 않게 한다 — 안 보이는 단추가 눌리면 더 당황스럽다. */
  const chromeCls = chromeOff
    ? "opacity-0 pointer-events-none transition-opacity duration-500"
    : "opacity-100 transition-opacity duration-300";
  useEffect(() => {
    const r = loadVoiceRate();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 저장된 속도를 마운트 후 반영
    setRate(r);
    rateRef.current = r;
  }, []);
  // 이야기 끝남 — 마지막 쪽 낭독이 끝나면 "다시 듣기"를 띄운다.
  const [ended, setEnded] = useState(false);

  /*
   * 본문 고치기 (마스터 전용, 내가 만든 동화만).
   *
   * 글자가 소실돼 ◆? 로 나오는 쪽이 있었는데, 소실된 글자는 어떤 코드로도 되살릴 수
   * 없다 — 사람이 다시 써 넣는 수밖에 없다. 그 한 글자 때문에 동화를 다시 만들면
   * 토큰과 그림이 통째로 날아가므로, 글만 고치는 길을 둔다.
   * (제공 동화는 파일로 관리하니 여기서 손대지 않는다.)
   */
  const [master, setMaster] = useState(false);
  /*
   * 고치기 도구를 띄울 조건 — 내가 만든 동화이고, 마스터일 때만.
   *
   * 예전엔 '이 쪽 그림 다시 그리기'가 모든 회원에게 보였다(한 권에 한 장까지).
   * 사장님 지시로 일단 감춘다 — 그림 생성이 요즘 자주 실패하고 할당량도 빠듯한데,
   * 다시 그리기는 눌러 놓고 기다리다 실패하면 오히려 기분이 상하는 자리다.
   * 마스터에게는 그대로 남겨 둔다(글 고치기와 같은 자리).
   *
   * 이걸 감추면 **만들 때 그림을 못 받은 빈 쪽을 회원이 스스로 채울 길도 없어진다**
   * — 그 쪽은 문의를 받아 마스터가 채워 줘야 한다.
   *
   * 주의 — master 는 위에서 선언한 뒤에 읽어야 한다. 순서가 뒤집히면
   * "Cannot access 'master' before initialization" 으로 뷰어가 통째로 죽는다.
   */
  /**
   * 내가 만든 동화인가 — 세션을 볼지 말지 정하는 값. master 와 달리 곧바로 안다.
   *
   * 세션 조회를 이 값으로만 막는다. editable(마스터까지 본 값)로 막으면 고리가 생긴다:
   * editable 이 master 에 기대는데 master 를 정해 주는 것이 그 효과라, 처음 false 인
   * master 때문에 효과가 그대로 빠져나가고 master 는 영영 false 로 남는다
   * — 마스터가 로그인해도 도구가 안 뜬다.
   */
  const mine = book.id.startsWith("my-");
  /** 다시 그린 그림을 올릴 cafe24 폴더 이름 — 만들 때와 같이 회원 아이디로 나눈다. */
  const [redrawOwner, setRedrawOwner] = useState("guest");
  useEffect(() => {
    if (!mine) return;
    loadSession()
      .then((s) => {
        setMaster(s.isMaster);
        if (s.profile?.username) setRedrawOwner(s.profile.username);
      })
      .catch(() => {});
  }, [mine]);
  /** 고치기 도구(글 고치기 · 그림 다시 그리기)를 띄울지 — 마스터만. */
  const editable = mine && master;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveText() {
    setSaving(true);
    try {
      const next: Book = {
        ...book,
        pages: book.pages.map((p, i) => (i === index ? { ...p, text: draft.normalize("NFC") } : p)),
      };
      const ok = await updateBookData(book.id, next);
      if (!ok) {
        window.alert("고친 글을 저장하지 못했어요. 권한(SQL)을 확인해 주세요.");
        return;
      }
      // 저장한 글로 다시 그린다. 본문은 낭독·색칠 등 여러 곳에서 쓰여, 새로 읽어
      // 오는 편이 어중간하게 갈아끼우는 것보다 확실하다.
      window.location.reload();
    } finally {
      setSaving(false);
    }
  }

  /*
   * 이 쪽 그림 다시 그리기 (내가 만든 동화만). 일반 회원은 한 권에 한 장까지.
   *
   * 삽화가 실패해도 책은 저장되게 바꾼 뒤로, 그림이 빠진 쪽이 남을 수 있다.
   * 그 한 쪽 때문에 동화를 통째로 다시 만들면 토큰과 나머지 그림이 다 날아가므로,
   * 그 쪽만 다시 그리는 길을 둔다.
   *
   * 어긋나지 않게 하는 것이 핵심이다. 만들 때 남겨 둔 그림체·인물·비율을 쓰고,
   * 옆 쪽의 성공한 그림을 '이 책은 이렇게 생겼다'는 기준으로 함께 보낸다.
   * 예전 책은 그 재료가 없으므로 본문과 옆 쪽 그림만으로 최선을 다한다.
   */
  const [redrawing, setRedrawing] = useState(false);
  /** 고치기 도구를 펼쳤는지 — 평소엔 접어 둬서 그림을 가리지 않는다. */
  const [toolsOpen, setToolsOpen] = useState(false);
  /** 이 책에서 다시 그릴 수 있는 장수. 마스터는 제한 없음. */
  const redrawsLeft = master
    ? Number.POSITIVE_INFINITY
    : FREE_REDRAWS_PER_BOOK - (book.redrawsUsed ?? 0);
  /*
   * 그림이 아예 없는 쪽은 '다시 그리기'가 아니라 '못 받은 그림을 받는 것'이다.
   *
   * 만들 때 이미 그 쪽 값을 냈는데 Gemini 쪽 사정으로 못 받은 경우다. 여기에
   * 한 권 1장 제한을 걸면, 다섯 쪽이 비어도 한 쪽밖에 못 채운다.
   * 그래서 빈 쪽 채우기는 횟수에서 빼지 않는다.
   */
  const fillingBlank = !book.pages[index]?.image;

  async function redrawPage() {
    const page = book.pages[index];
    const scene = page.imagePrompt?.trim() || page.text;
    if (!scene) return;
    if (redrawsLeft <= 0 && !fillingBlank) {
      window.alert(
        `그림 다시 그리기는 한 권에 ${FREE_REDRAWS_PER_BOOK}장까지예요.\n이 책은 이미 사용하셨어요.`,
      );
      return;
    }
    if (
      !window.confirm(
        fillingBlank
          ? `${index + 1}쪽은 만들 때 그림을 못 받은 쪽이에요.\n지금 그려 드릴까요?\n\n다시 그리기 횟수는 쓰지 않아요.`
          : master
          ? `${index + 1}쪽 그림을 다시 그릴까요?\n\n글과 목소리는 그대로예요.`
          : `${index + 1}쪽 그림을 다시 그릴까요?\n\n한 권에 ${FREE_REDRAWS_PER_BOOK}장까지 다시 그릴 수 있어요.\n이걸 쓰면 이 책에서는 더 못 바꿔요.\n글과 목소리는 그대로예요.`,
      )
    ) {
      return;
    }

    setRedrawing(true);
    try {
      /*
       * 참조로 보낼 옆 쪽 그림을 고른다.
       *
       * 예전에는 **그림이 있는 첫 쪽**을 그냥 집었다. 그래서 놀이터 쪽을 다시 그리는데
       * 어린이집 현관 그림이 기준으로 갔고, 다시 그린 놀이터의 미끄럼틀 모양이 나머지
       * 쪽과 달라졌다(실제로 났다). 같은 장소를 그린 쪽이 있으면 그쪽을 먼저 쓴다.
       */
      // 이름 글자가 아니라 계열로 묶는다 — "놀이터"와 "동네 놀이터"는 같은 곳이다.
      const placeOf = (prompt: string | undefined) => {
        const name = /장소\s*:\s*([^—\-\n.]+)/.exec(prompt ?? "")?.[1]?.trim() ?? "";
        return name ? locationKeyOf(name) : "";
      };
      const here = placeOf(page.imagePrompt);
      const others = book.pages.filter((p, i) => i !== index && p.image);
      const sibling =
        (here ? others.find((p) => placeOf(p.imagePrompt) === here) : undefined) ?? others[0];
      // 만들 때 그린 장소 시트가 있으면 그것이 장소의 기준이다.
      const locationSheet = here ? book.locationSheets?.find((s) => s.key === here)?.image ?? "" : "";
      const res = await fetch("/api/illustrate-page", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scene,
          storyText: page.text,
          artStyleId: book.artStyleId,
          // 얼굴의 기준 — 이게 빠지면 다시 그린 쪽만 옷과 얼굴이 달라진다.
          characterSheet: book.characterSheet ?? "",
          styleReference: sibling?.image ?? "",
          styleReferenceScene: sibling?.imagePrompt ?? "",
          shape: book.shape,
          cast: book.cast ?? [],
          // 만들 때 부모가 적어 둔 장소 — 이게 있어야 다시 그린 쪽도 같은 곳이 된다.
          locationDetail: book.locationDetail ?? "",
          locationSheet,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { image?: string; error?: string };
      if (!res.ok || !data.image) {
        window.alert(data.error ?? "그림을 그리지 못했어요. 잠시 뒤 다시 눌러 주세요.");
        return;
      }

      /*
       * 그림은 cafe24로 올리고 책에는 주소만 남긴다 — 그림을 책 데이터에 넣으면
       * 책을 열 때마다 그 그림이 DB에서 빠져나가 전송량을 먹는다(8/6에 옮긴 이유).
       * 올리기가 실패하면 그림 자체는 살리되 예전 방식으로 넣는다.
       */
      let stored = data.image;
      try {
        const up = await fetch("/api/upload-art", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            owner: redrawOwner,
            bookId: book.id,
            name: `p${index + 1}-redraw-${Date.now().toString(36)}`,
            image: data.image,
          }),
        });
        if (up.ok) {
          const { url } = (await up.json()) as { url?: string };
          if (url) stored = url;
        }
      } catch {
        /* 못 올려도 그림은 남긴다 */
      }

      const next: Book = {
        ...book,
        pages: book.pages.map((p, i) => (i === index ? { ...p, image: stored } : p)),
        // 표지가 비어 있던 책이면 이 그림으로 채워 준다 — 책장에서 무지개로 보이던 것.
        coverImage: book.coverImage ?? stored,
        // 마스터는 세지 않는다. 그림이 나온 뒤에 올린다 — 실패한 시도로 기회를 잃으면 안 된다.
        // 빈 쪽을 채운 것은 횟수에서 빼지 않는다 — 못 받은 그림을 받은 것뿐이다.
        redrawsUsed:
          master || fillingBlank ? book.redrawsUsed : (book.redrawsUsed ?? 0) + 1,
      };
      if (!(await updateBookData(book.id, next))) {
        window.alert("그림은 그렸는데 저장하지 못했어요. 권한(SQL)을 확인해 주세요.");
        return;
      }
      window.location.reload();
    } catch (e) {
      window.alert((e as Error).message || "그림을 그리지 못했어요.");
    } finally {
      setRedrawing(false);
    }
  }

  /**
   * 다음 동화 — 이야기가 끝나면 "다음 것도 보자"가 자연스럽다. 서재로 나갔다
   * 다시 고르게 하지 않는다. 같은 서가(전래·명작·우리 가족) 안에서 다음 책을 찾는다.
   * 마지막 책이면 null이라 버튼을 띄우지 않는다.
   */
  const [nextBook, setNextBook] = useState<{ id: string; title: string } | null>(null);
  useEffect(() => {
    if (!ended) return;
    let alive = true;
    (async () => {
      const pickNext = (list: { id: string; title: string; hidden?: boolean }[]) => {
        const shown = list.filter((b) => !b.hidden);
        const at = shown.findIndex((b) => b.id === book.id);
        return at >= 0 && at + 1 < shown.length ? shown[at + 1] : null;
      };
      if (book.id.startsWith("folk-")) {
        setNextBook(pickNext(asBooks(folkBooksJson)));
      } else if (book.id.startsWith("classic-")) {
        setNextBook(pickNext(asBooks(classicBooksJson)));
      } else if (book.id.startsWith("my-")) {
        // 내가 만든 책은 계정에서 목록을 가져온다(제목·id만이라 가볍다).
        const mine = await loadMyBooksBrief().catch(() => []);
        if (alive) setNextBook(pickNext(mine));
      }
    })();
    return () => {
      alive = false;
    };
  }, [ended, book.id]);

  // 이어듣기 — 정지한 자리를 기억한다. readPage가 시작한 쪽(currentPageRef)과 그때의
  // 순번(run)을 함께 담아, 다시 누를 때 "같은 쪽·같은 재생"일 때만 이어서 튼다.
  const currentPageRef = useRef(0);
  const pausedRef = useRef<{ run: number; page: number } | null>(null);

  // 성우 음성을 만드는 중 — 눌렀는데 소리가 안 나면 고장으로 오해하니(베타 피드백 4번)
  // 버튼과 안내로 "준비 중"을 보여준다. 첫 소리가 나면 내린다.
  const [preparing, setPreparing] = useState(false);
  // IndexedDB 캐시는 보통 즉시 열리므로 짧은 로딩에는 안내를 띄우지 않는다.
  const [showPreparing, setShowPreparing] = useState(false);
  // 준비에 걸린 초 — 숫자가 올라가는 걸 보면 멈춘 게 아니라 되는 중임을 안다.
  const [prepSecs, setPrepSecs] = useState(0);
  useEffect(() => {
    if (!preparing) {
      const resetId = window.setTimeout(() => {
        setShowPreparing(false);
        setPrepSecs(0);
      }, 0);
      return () => window.clearTimeout(resetId);
    }
    const startedAt = Date.now();
    const revealId = window.setTimeout(() => setShowPreparing(true), 400);
    const id = setInterval(() => setPrepSecs(Math.round((Date.now() - startedAt) / 1000)), 1000);
    return () => {
      window.clearTimeout(revealId);
      clearInterval(id);
    };
  }, [preparing]);
  // 미리받아 둔 다음 쪽 번호 — 같은 쪽을 두 번 미리받지 않게.
  const prefetchedRef = useRef(-1);

  // 나레이션 성우 — 책 안에서 바로 바꾼다("읽다가 마음에 안 들면"). 초기값은 설정값.
  // voiceIdRef는 readPage가 최신 성우를 읽게 하고, overriddenRef는 "사용자가 이 책에서
  // 성우를 직접 바꿨다"는 표시다 — 이 경우엔 완성작이라도 고른 성우로 합성한다(의도적).
  const [voiceId, setVoiceId] = useState<string>("basic");
  const voiceIdRef = useRef<string>("basic");
  const overriddenRef = useRef(false);
  const [voiceMenu, setVoiceMenu] = useState(false);
  // 이 회원의 복제된 부모 목소리(엄마·아빠) — 창작 동화 성우 선택지 맨 앞에 얹는다.
  const [parentVoices, setParentVoices] = useState<ParentVoice[]>([]);
  useEffect(() => {
    loadParentVoices().then(setParentVoices).catch(() => {});
  }, []);
  // 성우 선택지 —
  // · 제공 동화(전래·세계명작): 그 책에 설정한 성우(narrators = 대표·서브·기존 구운)만.
  //   전부 미리 구운 파일이라 아무리 바꿔 들어도 크레딧 0. (전체 성우를 열면 안 구운
  //   성우의 첫 재생마다 크레딧이 나가서 사장님 지시로 뺐다 — 2026-07-31)
  // · '내가 만든 동화'(id가 my-): 부모 목소리(복제) + 성우 전체(만들 때 고른 성우로 낭독).
  const isCreated = book.id.startsWith("my-");

  /*
   * 쪽마다 그림 크기가 달라 보이지 않게.
   *
   * 만든 동화는 모든 쪽을 같은 비율로 그린다. 그런데 한 장이 조금 다르게 나오면
   * 화면이 그 쪽만 다른 크기로 그려서 오히려 차이가 도드라진다. 그래서 내가 만든
   * 책은 첫 쪽 비율로 전부 통일한다 — 살짝 어긋난 장도 같은 크기로 보인다.
   *
   * 제공 동화(전래·세계명작)는 쪽마다 그림 비율이 진짜로 다르므로(해님달님 2.36:1 등)
   * 통일하면 안 된다. 그건 쪽마다 잰 값을 그대로 쓴다.
   */
  const ratioOf = (i: number): number =>
    (isCreated ? imgRatios[0] : undefined) ?? imgRatios[i] ?? 4 / 3;
  const parentChoices = parentVoices.map((p) => ({
    id: `parent:${p.role}`,
    label: `${p.label} 목소리`,
    emoji: p.emoji,
  }));
  // 창작 동화는 성우 전체(16명)를 열지 않는다(2026-07-31 사장님 지시) — 바꿔 들을 때마다
  // 실시간 합성 크레딧이 나가서다.
  // "성우를 고른 책은 그 성우까지만" (2026-08-05): 만들 때 가을이를 골랐으면 가을이만
  // 보여 준다. 부끄(기본)는 아무도 안 고른 옛 책에서만 대신 나온다.
  // 부모 목소리(엄마·아빠)는 이 규칙과 별개로 늘 함께 보여 준다 — 무료이고 이 앱의 핵심이다.
  const bookNarr = book.narrator ? TYPECAST_VOICES.find((v) => v.id === book.narrator) : null;
  const booqoo = TYPECAST_VOICES.find((v) => v.id === "tc-booqoo");
  const voiceChoices: readonly { id: string; label: string; emoji: string }[] = isCreated
    ? [...parentChoices, ...(bookNarr ? [bookNarr] : booqoo ? [booqoo] : [])]
    : book.narrators
      ? (book.narrators
          .map((id) => TYPECAST_VOICES.find((v) => v.id === id))
          .filter(Boolean) as typeof TYPECAST_VOICES)
      : NARRATOR_PRESETS; // 추천 목록이 없는 옛 책도 나레이션용 16명만
  useEffect(() => {
    // 추천 성우가 있으면 그 첫 번째, 아니면 만든 동화의 성우(book.narrator), 아니면 설정값.
    // 단, 저장된 설정값이 부모 목소리(parent:)면 '내가 만든 동화'에서만 잇는다 —
    // 제공·샘플 책이 부모 클론 목소리(유료 합성)를 몰래 상속하는 걸 막는다.
    // '내가 만든 동화'는 부모 목소리(엄마·아빠)가 있으면 그게 기본으로 먼저 나온다
    // (2026-07-31 사장님 지시). 부모 목소리는 마운트 후 비동기로 도착하므로 이 효과가
    // 다시 돌며 얹는다 — 단, 사용자가 이 책에서 성우를 직접 바꿨으면 그 뜻을 지킨다.
    const isMine = book.id.startsWith("my-");
    const stored = loadSelectedVoiceId();
    const safeStored = stored.startsWith("parent:") && !isMine ? "tc-booqoo" : stored;
    if (overriddenRef.current) return; // 직접 고른 성우를 뒤늦게 덮지 않는다
    // 창작 동화는 메뉴에 없는 성우로 읽히면 안 된다 — 메뉴는 '고른 성우(+부모)'뿐인데
    // 저장된 다른 성우로 읽으면 목록과 실제 소리가 어긋난다. 그래서 부모 → 이 책의 성우
    // → 부끄 순으로만 정한다(설정에 저장된 값은 쓰지 않는다).
    const savedParent = book.narrator?.startsWith("parent:") && parentVoices.some(
      (voice) => `parent:${voice.role}` === book.narrator,
    );
    const v = isMine
      ? savedParent
        ? book.narrator!
        : TYPECAST_VOICES.some((voice) => voice.id === book.narrator)
          ? book.narrator!
          : parentVoices.length > 0
            ? `parent:${parentVoices[0].role}`
            : "tc-booqoo"
      : book.narrators?.[0] ?? book.narrator ?? safeStored;
    setVoiceId(v);
    voiceIdRef.current = v;
  }, [book.narrators, book.narrator, book.id, parentVoices]);

  /**
   * "그림 속 친구를 눌러 보세요" 안내 — 처음 한 번만.
   *
   * 인물을 누르면 말하는 기능이 있는데 아무 표시가 없어서, 있는 줄 모르고 지나가는
   * 부모가 많았다. 눌러 볼 곳이 실제로 있는 책에서만, 계정당 한 번만 띄운다.
   * 화면을 어지럽히지 않게 잠깐 떴다 사라지고, 누르면 바로 닫힌다.
   */
  const hasHotspots = book.pages.some((p) => (p.hotspots?.length ?? 0) > 0);
  const [tapHint, setTapHint] = useState(false);
  useEffect(() => {
    if (!hasHotspots || hotspotHintSeen()) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 첫 진입 안내
    setTapHint(true);
    markHotspotHintSeen(); // 띄운 순간 본 것으로 친다 — 두 번 보여 주지 않는다
    const t = setTimeout(() => setTapHint(false), 6000);
    return () => clearTimeout(t);
  }, [hasHotspots]);

  // 캐릭터 클릭 반응 — 정지 그림이라 캐릭터 자체는 못 움직이지만, 누른 자리에서
  // 반짝이가 통통 튀어올라 "반응하는" 느낌을 준다. key로 매 클릭마다 다시 튼다.
  const burstKey = useRef(0);
  const [burst, setBurst] = useState<{ cx: number; cy: number; key: number } | null>(null);

  // 캐릭터 대사 — 본문 낭독과 별도 채널.
  // speaking: 지금 말하는 캐릭터 — 말풍선과 반짝임 표시용. 소리가 끝나면 사라진다.
  const sayRef = useRef<HTMLAudioElement | null>(null);
  // 대사가 나오는 동안 낭독을 잠깐 멈춘 상태 — TTS 추정 타이머도 같이 멈춘다.
  const narrPausedRef = useRef(false);
  const [speaking, setSpeaking] = useState<{
    page: number;
    label: string;
    line: string;
    box: [number, number, number, number];
  } | null>(null);
  const playHotspot = (
    h: { label: string; box: [number, number, number, number]; audio: string; line: string },
    page: number,
  ) => {
    const el = sayRef.current ?? new Audio();
    sayRef.current = el;
    el.src = h.audio;
    el.currentTime = 0;

    // 낭독 중이면 잠깐 멈춘다 — 대사가 끝나면 이어서 읽는다. 두 소리가 겹치면
    // 아이가 둘 다 못 알아듣는다.
    const narr = audioRef.current;
    const run = runIdRef.current;
    const wasNarrating = readingRef.current;
    if (wasNarrating) {
      narr?.pause();
      if (typeof window !== "undefined") window.speechSynthesis?.pause();
      narrPausedRef.current = true;
    }
    const done = () => {
      setSpeaking(null);
      if (!wasNarrating) return;
      narrPausedRef.current = false;
      // 대사를 듣는 사이 쪽을 넘겼거나 정지했으면 건드리지 않는다.
      if (run !== runIdRef.current || !readingRef.current) return;
      narr?.play().catch(() => {});
      if (typeof window !== "undefined") window.speechSynthesis?.resume();
    };

    setSpeaking({ page, label: h.label, line: h.line, box: h.box });
    // 누른 캐릭터 자리에서 반짝이가 튀어오른다 (그림 틀 기준 %좌표).
    setBurst({
      cx: (h.box[1] + h.box[3]) / 20,
      cy: (h.box[0] + h.box[2]) / 20,
      key: ++burstKey.current,
    });
    el.onended = done;
    el.onerror = done;
    el.play().catch(done);
  };

  /** 소리만 멈춘다 — 읽기 모드는 유지. 넘겨서 이어 읽을 때 쓴다. */
  const haltPlayback = () => {
    runIdRef.current++;
    narrPausedRef.current = false;
    setHighlight(0);
    clearFallback();
    pausedRef.current = null; // 핸들러를 떼므로 여기서 멈춘 건 이어들을 수 없다
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    const el = audioRef.current;
    if (el) {
      el.onended = null;
      el.ontimeupdate = null;
      el.pause();
    }
  };

  /**
   * 정지 버튼 — '일시정지'다. haltPlayback과 달리 순번(runId)도 핸들러도 건드리지 않아
   * 오디오가 멈춘 자리를 그대로 들고 있다가, 다시 누르면 그 지점부터 이어서 재생된다.
   * (예전엔 정지 후 다시 누르면 그 쪽을 처음부터 다시 읽었다 — 베타 피드백 6번.)
   * 브라우저 기계음(speechSynthesis)은 중간 재개가 브라우저마다 제멋대로라 이어듣기
   * 대상에서 빼고 취소한다 — 그 경로는 성우를 못 받을 때만 쓰는 폴백이다.
   */
  const pausePlayback = useCallback(() => {
    narrPausedRef.current = false;
    setPreparing(false);
    clearFallback();
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    const el = audioRef.current;
    // 지금 실제로 소리가 나던 중이어야 '이어들을 자리'가 의미가 있다.
    const resumable = !!el && !el.paused && el.currentTime > 0;
    pausedRef.current = resumable ? { run: runIdRef.current, page: currentPageRef.current } : null;
    el?.pause();
  }, []);

  const stopReading = useCallback(() => {
    readingRef.current = false;
    setReading(false);
    pausePlayback();
  }, [pausePlayback]);

  // 캐릭터 대사(핫스팟) 정지 — 쪽을 넘기거나 화면을 떠날 때 목소리가 남지 않게.
  // 낭독(haltPlayback)과 별개 채널이라 따로 멈춰줘야 한다. onended/onerror도 떼서
  // '대사 끝나면 낭독 재개' 콜백이 뒤늦게 안 튀게 한다.
  const stopSay = useCallback(() => {
    narrPausedRef.current = false;
    const el = sayRef.current;
    if (el) {
      el.onended = null;
      el.onerror = null;
      el.pause();
    }
    setSpeaking(null);
  }, []);

  // 이어 읽기를 위해 자기 자신을 다시 부르는 재귀 함수라 훅으로 감싸지 않는다.
  // 이벤트 핸들러에서만 호출되므로 메모이제이션이 필요 없다.
  function readPage(i: number) {
    const page = book.pages[i];
    // 이 재생의 순번. 넘김으로 갈아타면 순번이 앞서 나가고, 이 재생의 콜백은
    // 전부 무효가 된다.
    const run = ++runIdRef.current;
    // 처음부터 새로 읽는 것이므로 이어들을 자리는 버린다.
    currentPageRef.current = i;
    pausedRef.current = null;
    setHighlight(0);
    const total = page.text.length;

    const finishThen = () => {
      if (run !== runIdRef.current) return;
      setHighlight(total);
      clearFallback();
      if (!readingRef.current) return;
      if (i < lastIndex) {
        setIndex(i + 1);
        readPage(i + 1);
      } else {
        readingRef.current = false;
        setReading(false);
        setEnded(true); // 마지막 쪽까지 다 읽음 → "다시 듣기" 안내를 띄운다
        saveBookProgress(book.id, 0); // 끝까지 봤으니 이어보기 위치는 처음으로 초기화
      }
    };

    // 재생 속도 — 뷰어에서 고른 값(rateRef)을 TTS·mp3 모두에 적용한다.
    const rateBoost = rateRef.current;

    // mp3든 성우 음성이든 오디오 재생은 전부 이 길 — 진행률 비례로 색을 채운다.
    const playViaAudio = (audioSrc: string) => {
      const el = audioRef.current ?? new Audio();
      audioRef.current = el;
      el.src = audioSrc;
      // 속도를 바꿔도 음높이는 그대로 (부모 목소리 왜곡 방지).
      applyPlaybackRate(el, rateBoost);
      el.ontimeupdate = () => {
        if (el.duration > 0) {
          setHighlight(Math.min(total, Math.round((el.currentTime / el.duration) * total)));
        }
      };
      el.onended = finishThen;
      el.play()
        .then(() => setPreparing(false))
        .catch((e: unknown) => {
          // 자동재생 차단 등 — 읽기 중단으로 처리. 단, 넘김으로 갈아타며 생긴
          // 중단 오류(pause에 의한 취소)는 새 재생을 건드리면 안 된다.
          setPreparing(false);
          if ((e as Error)?.name === "AbortError" || narrPausedRef.current) return;
          if (run === runIdRef.current) stopReading();
        });
    };

    /**
     * 미리 구운 파일 여러 개를 차례로 튼다.
     *
     * 배역별로 나눠 구운 쪽(지문=나레이션 성우, 대사=배역 성우)을 위해서다.
     * 글자 색칠은 조각의 글자 수로 나눠 이어 붙인다 — 통짜 하나를 시간 비례로
     * 칠하는 것보다 정확하다.
     */
    const playFileSequence = (srcs: { src: string; chars: number }[]) => {
      const el = audioRef.current ?? new Audio();
      audioRef.current = el;
      const all = srcs.reduce((n, s) => n + s.chars, 0) || 1;
      let i = 0;
      let before = 0; // 앞 조각들이 이미 칠한 글자 수
      const next = () => {
        if (run !== runIdRef.current || !readingRef.current) return;
        if (i >= srcs.length) {
          finishThen();
          return;
        }
        const seg = srcs[i];
        i += 1;
        el.src = seg.src;
        applyPlaybackRate(el, rateBoost);
        el.ontimeupdate = () => {
          if (el.duration > 0) {
            const within = (el.currentTime / el.duration) * seg.chars;
            setHighlight(Math.min(total, Math.round(((before + within) / all) * total)));
          }
        };
        el.onended = () => {
          before += seg.chars;
          next();
        };
        /*
         * 한 조각이 없거나 깨졌으면 거기서 멈추지 말고 다음 조각으로 넘어간다 —
         * 굽다 만 파일 하나 때문에 쪽 전체가 조용해지면 안 된다.
         *
         * 다만 '지금 틀려던 그 파일'이 실패했을 때만 넘어간다. 대사 재생이나
         * 쪽 넘김으로 src가 이미 바뀐 뒤 뒤늦게 날아온 오류까지 받아 주면,
         * 멀쩡한 조각을 소리 없이 건너뛰어 문장이 통째로 사라진다.
         */
        el.onerror = () => {
          if (!el.src.endsWith(seg.src)) return;
          before += seg.chars;
          next();
        };
        el.play()
          .then(() => setPreparing(false))
          .catch((e: unknown) => {
            setPreparing(false);
            /*
             * 캐릭터를 눌러 대사가 나오는 동안은 낭독을 pause()로 멈춘다.
             * 그런데 조각이 막 시작하는 순간에 누르면, 아직 끝나지 않은 play()가
             * pause() 때문에 AbortError로 깨진다. 그걸 '재생 실패'로 보고 낭독을
             * 통째로 멈춰 버리면, 대사가 끝나도 이어 읽지 않는다.
             *
             * 조각으로 나눈 뒤로 한 쪽에 play()가 서른 번 넘게 일어나서 이 틈이
             * 훨씬 넓어졌다 — 그래서 여기서 확실히 갈라 준다.
             */
            if ((e as Error)?.name === "AbortError" || narrPausedRef.current) return;
            if (run === runIdRef.current) stopReading();
          });
      };
      next();
    };

    const bundled = page.audio ?? page.legacyAudio ?? null;
    const selectedId = voiceIdRef.current;
    const tc = findTypecast(selectedId);

    // 이 책의 추천 성우(narrators) 중 하나를 골랐으면, 그 성우로 미리 구운 파일을
    // 재생한다 — 파일 재생이라 크레딧 0·즉시.
    if (book.narrators?.includes(selectedId)) {
      /*
       * 배역별로 나눠 구운 쪽이면 조각을 이어서 튼다.
       * 지문 조각만 고른 성우로 갈아 끼우고(seg-pN-i → seg-{성우}-pN-i),
       * 대사 조각은 배역이 성우를 정하므로 그대로 둔다.
       */
      if (page.segments?.length) {
        playFileSequence(
          page.segments.map((seg) => ({
            src:
              seg.who === "narration"
                ? seg.src.replace("seg-", `seg-${selectedId}-`)
                : seg.src,
            chars: seg.text.length,
          })),
        );
        return;
      }
      if (page.audio) {
        playViaAudio(page.audio.replace("narr-", `narr-${selectedId}-`));
        return;
      }
    }

    // 성우 음성 — 조각을 '오는 대로' 이어서 재생한다. 조각들은 이미 동시에 합성이
    // 걸려 있어서, 첫 조각만 도착하면 소리가 나기 시작하고 나머지는 듣는 동안 채워진다.
    // 색칠은 조각의 글자 범위를 따라가서 통짜 비례보다 정확하다.
    const playPending = (segments: PendingSegment[]) => {
      const el = audioRef.current ?? new Audio();
      audioRef.current = el;
      let si = 0;
      const playNext = async () => {
        if (run !== runIdRef.current || !readingRef.current) return;
        if (si >= segments.length) {
          finishThen();
          return;
        }
        const seg = segments[si];
        si += 1;
        let blob: Blob;
        try {
          blob = await seg.audio;
        } catch {
          // 합성 실패(크레딧 잠금·오프라인 등) — 딸린 파일이나 기계음으로 물러난다.
          if (run !== runIdRef.current || !readingRef.current) return;
          setPreparing(false);
          if (bundled) playViaAudio(bundled);
          else speakWithBrowser();
          return;
        }
        if (run !== runIdRef.current || !readingRef.current) return;
        const url = URL.createObjectURL(blob);
        el.src = url;
        // 책 읽기 리듬을 유지한다. lively도 말이 급해지지 않을 정도로만 움직인다.
        const paceMultiplier = seg.pace === "slow" ? 0.94 : seg.pace === "lively" ? 1.03 : 1;
        /*
         * 배역 톤 — 할머니 대사는 느리고 낮게, 작은 동물은 빠르고 높게.
         * 성우를 바꾸는 게 아니라 한 성우가 목소리를 바꾸는 것이라, 합성 요청도
         * 크레딧도 늘지 않는다. 지문 조각은 tone이 '그대로'라 아무 영향이 없다.
         */
        applyPlaybackRate(
          el,
          rateBoost * paceMultiplier * (seg.tone?.rate ?? 1),
          seg.tone?.shiftPitch ?? false,
        );
        el.ontimeupdate = () => {
          if (el.duration > 0) {
            setHighlight(
              Math.min(
                seg.to,
                seg.from + Math.round((el.currentTime / el.duration) * (seg.to - seg.from)),
              ),
            );
          }
        };
        el.onended = () => {
          URL.revokeObjectURL(url);
          void playNext();
        };
        el.play()
          .then(() => {
            // 첫 소리가 났으니 '준비 중' 표시를 내린다.
            setPreparing(false);
            prefetchNext();
          })
          .catch(() => {
            URL.revokeObjectURL(url);
            if (run === runIdRef.current) stopReading();
          });
      };
      void playNext();
    };

    /**
     * 다음 쪽을 미리 합성해둔다 — 넘어가는 순간 기다림 없이 소리가 나게.
     * 실시간 합성 성우일 때만(구운 파일은 원래 즉시), 딱 한 쪽만 앞서 받는다.
     */
    const prefetchNext = () => {
      if (prefetchedRef.current === i + 1) return;
      const next = book.pages[i + 1];
      if (!next) return;
      const nextBundled = next.audio ?? next.legacyAudio ?? null;
      // 다음 쪽이 구운 파일로 재생될 상황이면 미리받을 게 없다(크레딧도 안 쓴다).
      if (book.narrators?.includes(selectedId) && next.audio) return;
      if (nextBundled && (!overriddenRef.current || (tc !== null && book.narrator === tc.id))) return;
      if (!tc) return;
      prefetchedRef.current = i + 1;
      prefetchTypecastPageAudio(tc, next.text, next.voiceDirection);
    };

    // 완성작(전래·세계명작)은 기본적으로 딸린 나레이션을 쓴다 — 파일 재생이라 무료이고,
    // 책마다 큐레이션된 성우다. 그래서 설정에서 고른 목소리는 '내가 만든 동화'에만
    // 적용되어, 완성작을 읽을 때 크레딧이 새지 않는다.
    // 단, 사용자가 이 책 안에서 성우를 '직접 바꾼'(overriddenRef) 경우엔 그 뜻을 존중해
    // 고른 성우로 합성한다(의도한 크레딧). 고른 게 이 책 나레이터면 그대로 무료 파일.
    if (bundled && (!overriddenRef.current || (tc !== null && book.narrator === tc.id))) {
      playViaAudio(bundled);
      return;
    }

    // 여기까지 왔으면 실시간 합성 차례 — 지금은 CLIENT_TTS_ENABLED=true라 아래 구글 분기는
    // 죽어 있고(조건 항상 false) 모든 실시간 낭독이 그다음 Typecast(연기톤) 분기로 간다.
    // 구글은 Typecast를 끄면(CLIENT_TTS_ENABLED=false) 살아나는 무료 폴백 엔진이다.
    if (tc && GOOGLE_TTS_ENABLED && !CLIENT_TTS_ENABLED) {
      // 폴백 엔진: Google Cloud TTS(무료 티어·감정 없음). 실패(키 없음·한도·오프라인)하면
      // 딸린 파일이 있으면 그걸, 없으면 브라우저 기계음으로 물러난다 — 크레딧 안 나감.
      fetchGoogleAudio(selectedId, page.text)
        .then((blob) => {
          if (run !== runIdRef.current || !readingRef.current) return;
          playViaAudio(URL.createObjectURL(blob));
        })
        .catch(() => {
          if (run !== runIdRef.current || !readingRef.current) return;
          if (bundled) playViaAudio(bundled);
          else speakWithBrowser();
        });
      return;
    }

    // 부모 목소리(복제) — 감정 프리셋 없이 '본연의 목소리 그대로' 읽는다.
    // (감정 연기를 입혀봤더니 클론 음색이 변형돼 "아빠 같지 않다"는 실청 피드백으로 뺌,
    //  2026-07-31 사장님 결정. 연기는 성우 몫, 부모 목소리는 똑같음이 가치.)
    // 같은 (목소리, 문장)은 기기에 캐시되어 다시 들을 땐 0원. 실패(키 없음·크레딧
    // 소진)하면 딸린 파일이 있으면 그걸, 없으면 브라우저 기계음으로 물러난다.
    if (selectedId.startsWith("parent:")) {
      const role = selectedId.slice("parent:".length);
      const pv = parentVoices.find((p) => p.role === role);
      if (pv) {
        setPreparing(true);
        fetchTypecastVoiceAudio(pv.voiceId, page.text)
          .then((blob) => {
            if (run !== runIdRef.current || !readingRef.current) return;
            playViaAudio(URL.createObjectURL(blob));
          })
          .catch(() => {
            if (run !== runIdRef.current || !readingRef.current) return;
            setPreparing(false);
            if (bundled) playViaAudio(bundled);
            else speakWithBrowser();
          });
        return;
      }
    }

    if (tc) {
      // 기본 경로(현재 활성) — Typecast 감정 연기 합성. CLIENT_TTS_ENABLED=true라
      // 창작 동화·제공 동화(비번들 성우) 모두 여기로 온다.
      // 조각 합성을 한꺼번에 걸어두고(startTypecast…) 첫 조각이 오는 대로 재생한다.
      try {
        setPreparing(true);
        playPending(startTypecastPageAudio(tc, page.text, page.voiceDirection, book.cast ?? []));
      } catch {
        // 실시간 합성 꺼짐(client-tts-disabled) — 딸린 파일이 있으면 그걸(무료),
        // 없으면 브라우저 기계음으로 대체한다. 크레딧은 안 나간다.
        setPreparing(false);
        if (bundled) playViaAudio(bundled);
        else speakWithBrowser();
      }
      return;
    }

    speakWithBrowser();

    function speakWithBrowser() {
      setPreparing(false);
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        // 읽어줄 수단이 없음
        stopReading();
        return;
      }
      // 설정에서 고른 캐릭터 목소리(높낮이·속도). 엄마·아빠(커스텀)는 클로닝이
      // 붙기 전까지 기본 프리셋으로 읽는다.
      const preset = findPreset(voiceIdRef.current) ?? findPreset("basic")!;
      const u = buildPresetUtterance(page.text, preset, rateBoost);
      let boundaryFired = false;
      u.onboundary = (e) => {
        boundaryFired = true;
        clearFallback();
        setHighlight(Math.min(total, e.charIndex + (e.charLength || 2)));
      };
      u.onend = finishThen;
      // 넘김으로 갈아타면 cancel()이 이 utterance에 오류 이벤트를 쏜다 — 무시.
      u.onerror = () => {
        if (run === runIdRef.current) stopReading();
      };
      window.speechSynthesis.speak(u);

      // 일부 기기(특히 모바일)는 boundary를 안 준다 → 속도 추정으로 채운다.
      let elapsed = 0;
      fallbackTimer.current = setInterval(() => {
        if (boundaryFired) return clearFallback();
        // 캐릭터 대사가 나오는 동안은 낭독이 멈춰 있다 — 추정도 같이 멈춘다.
        if (narrPausedRef.current) return;
        elapsed += 0.25;
        // 프리셋·음성에 따라 과장된 실제 말하기 속도(u.rate) 기준으로 추정한다.
        setHighlight(
          Math.min(total, Math.round(elapsed * FALLBACK_CHARS_PER_SEC * u.rate)),
        );
      }, 250);
    }
  }

  const startReading = () => {
    setEnded(false);
    // 지난번에 손잡이로 꺼내 뒀더라도, 새로 읽을 때는 다시 감춘다.
    // 열려 있던 메뉴도 같이 닫는다 — 단추만 사라지고 메뉴가 남으면 붕 뜬다.
    setChromeShown(false);
    setSizeMenu(false);
    setSpeedMenu(false);
    setVoiceMenu(false);
    // 정지했던 자리가 살아 있으면(같은 쪽·같은 재생) 처음부터가 아니라 그 지점부터 잇는다.
    // 오디오 엘리먼트가 멈춘 위치와 핸들러를 그대로 들고 있어서 play()만 하면 이어진다.
    const p = pausedRef.current;
    const el = audioRef.current;
    if (p && p.run === runIdRef.current && p.page === index && el && !el.ended) {
      pausedRef.current = null;
      readingRef.current = true;
      setReading(true);
      applyPlaybackRate(el, rateRef.current);
      el.play().catch(() => stopReading());
      return;
    }
    readingRef.current = true;
    setReading(true);
    readPage(index);
  };

  // 다시 듣기 — 이야기가 끝난 그 자리에서 처음 쪽으로 돌아가 바로 다시 읽는다.
  // (예전엔 서재로 나갔다 다시 들어와야 했다.)
  const replayFromStart = () => {
    setEnded(false);
    setIndex(0);
    readingRef.current = true;
    setReading(true);
    readPage(0);
  };

  // 재생 속도 변경 — 재생 중이면 지금 오디오에 즉시 반영, 다음 쪽부턴 rateRef로.
  const applyRate = (r: number) => {
    setRate(r);
    rateRef.current = r;
    saveVoiceRate(r);
    setSpeedMenu(false);
    if (audioRef.current) applyPlaybackRate(audioRef.current, r);
  };

  // 나레이션 성우 변경 — 책 안에서 바로. 사용자가 직접 바꾼 것이므로 overridden 표시
  // (완성작이라도 고른 성우로 합성). 전역에도 저장해 다음에도 이 성우가 기본이 된다.
  // 읽는 중이면 이 쪽부터 새 성우로 다시 읽어준다.
  const pickVoice = (id: string) => {
    setVoiceId(id);
    voiceIdRef.current = id;
    overriddenRef.current = true;
    // 부모 목소리(parent:)는 전역 기본값으론 저장하지 않는다 — 제공 책까지
    // 유료 클론 합성으로 끌려가는 걸 막는다(이 책 안에서만 적용).
    if (!id.startsWith("parent:")) saveSelectedVoiceId(id);
    setVoiceMenu(false);
    if (readingRef.current) {
      haltPlayback();
      readPage(index);
    } else {
      // 멈춘 상태에서 성우를 바꿨다면 이어들을 자리는 버린다 — 안 그러면 다시 눌렀을 때
      // 남아 있던 옛 목소리 오디오가 이어서 나온다.
      pausedRef.current = null;
    }
  };

  // 사용자가 직접 넘기면: 읽는 중이 아니면 그냥 이동, 읽는 중이면 멈추지 않고
  // 넘어간 쪽을 바로 이어서 읽는다 — 아이가 넘겨도 이야기가 계속 따라온다.
  // 넘김 연타 잠금 — 넘김 애니메이션이 도는 짧은 사이에 또 누르면(연타) 여러 장이
  // 한꺼번에 넘어가 버린다. 한 번 넘기면 450ms 동안 추가 넘김을 무시한다.
  const lastTurnAtRef = useRef(0);
  const go = useCallback(
    (next: number) => {
      const clamped = Math.min(lastIndex, Math.max(0, next));
      if (clamped !== index) {
        // eslint-disable-next-line react-hooks/purity -- 이벤트 핸들러 전용(넘김 연타 잠금) 시각
        const now = Date.now();
        if (now - lastTurnAtRef.current < 450) return; // 연타 무시
        lastTurnAtRef.current = now;
      }
      if (clamped !== index) {
        setEnded(false); // 넘기면 "다시 듣기" 안내는 닫는다
        stopSay(); // 넘김과 동시에 캐릭터 대사 음성을 끊는다(다음 쪽까지 새어 나가지 않게)
      }
      /*
       * 책장 넘김 효과음 — 실제로 쪽이 바뀔 때만. 설정에서 끌 수 있다.
       *
       * 빠르게 여러 장을 넘기면 소리가 끝나기 전에 매번 처음부터 다시 재생돼
       * '쫙쫙쫙' 하고 끊겨 들렸다. 전엔 el.paused로 막아 봤는데 안 잡혔다 —
       * play()는 비동기라 실제로 소리가 나기 전까지 paused가 잠깐 true로 남아,
       * 그 사이에 들어온 두 번째 넘김이 검사를 통과해 처음부터 다시 틀어 버린다.
       *
       * 그래서 브라우저 상태를 믿지 말고 우리가 직접 잠근다. 소리를 틀 때 잠그고
       * 끝나면 푼다. ended가 안 오는 경우(탭 전환 등)를 대비해 시간제한도 같이 건다.
       */
      if (clamped !== index && loadSfxOn() && !sfxBusy.current) {
        const el = sfxRef.current ?? new Audio("/sfx/page-turn.mp3");
        sfxRef.current = el;
        sfxBusy.current = true;
        const unlock = () => {
          sfxBusy.current = false;
          if (sfxTimer.current) clearTimeout(sfxTimer.current);
          sfxTimer.current = null;
        };
        const stopAndUnlock = () => {
          el.pause();
          el.currentTime = 0;
          unlock();
        };
        el.onended = unlock;
        if (sfxTimer.current) clearTimeout(sfxTimer.current);
        // 원본 파일은 약 9초로 뒤쪽에 넘김 소리가 더 남아 있다. 첫 효과음만 쓰고
        // 실제 오디오까지 정지해야 빠르게 넘긴 횟수만큼 나중에 몰려 나오지 않는다.
        sfxTimer.current = setTimeout(stopAndUnlock, 750);
        el.pause();
        el.currentTime = 0;
        el.volume = 0.5;
        el.play().catch(unlock);
      }
      setIndex(clamped);
      if (readingRef.current && clamped !== index) {
        haltPlayback();
        readPage(clamped);
      }
    },
    // haltPlayback·readPage는 렌더마다 새로 생기는 일반 함수라 의존성에서 뺀다 —
    // 넣으면 go가 매 렌더 바뀌어 이 함수를 쓰는 이펙트가 계속 재구독한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lastIndex, index],
  );

  // 뷰어를 떠날 때 소리를 끄고, 전체화면·가로 고정도 되돌린다.
  useEffect(() => stopReading, [stopReading]);
  useEffect(() => () => {
    if (sfxTimer.current) clearTimeout(sfxTimer.current);
    sfxTimer.current = null;
    sfxBusy.current = false;
    const sfx = sfxRef.current;
    if (sfx) {
      sfx.pause();
      sfx.currentTime = 0;
    }
  }, []);
  // 화면을 떠날 때(서재로 나가기·주소 이동 등) 캐릭터 대사 음성도 확실히 끊는다.
  useEffect(() => () => stopSay(), [stopSay]);
  useEffect(() => () => exitStoryMode(), []);

  // 배경음 — 켜면 잔잔히 반복, 끄면 멈춘다. 낭독을 덮지 않게 볼륨을 아주 낮게.
  useEffect(() => {
    const el = bgmRef.current ?? new Audio("/sfx/bgm.mp3");
    bgmRef.current = el;
    el.loop = true;
    // 낭독·대사를 덮지 않게 아주 은은하게 (0.12 → 0.06으로 반 줄임).
    el.volume = 0.06;
    if (bgmOn) el.play().catch(() => {});
    else el.pause();
    return () => el.pause();
  }, [bgmOn]);

  // 반짝이 이펙트는 잠깐 떴다 사라진다 — 애니메이션이 끝날 때쯤 지운다.
  useEffect(() => {
    if (!burst) return;
    const t = setTimeout(() => setBurst(null), 750);
    return () => clearTimeout(t);
  }, [burst]);

  // "가로로 보기" 버튼 상태 — 전체화면 여부를 따라간다 (브라우저 뒤로가기로
  // 빠져나가는 경우까지 이벤트로 감지).
  const [storyMode, setStoryMode] = useState(false);
  useEffect(() => {
    const onChange = () => setStoryMode(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // 크롬은 음성 목록이 늦게 채워진다 — 첫 "읽어주기"부터 배정 음성이 적용되게 예열.
  useEffect(() => warmUpVoices(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 길게 누르면 자동 반복으로 "읽기 정지→서재 이탈"이 연달아 터진다 — 반복은 무시.
      if (e.repeat) return;
      if (e.key === "ArrowRight") go(index + 1);
      else if (e.key === "ArrowLeft") go(index - 1);
      // ESC — 읽는 중이면 먼저 멈추고, 아니면 서재로 나간다 ("← 서재"와 같다).
      else if (e.key === "Escape") {
        if (readingRef.current) stopReading();
        else router.push("/");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, go, router, stopReading]);

  const swipeOriginX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    swipeOriginX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (swipeOriginX.current === null) return;
    const dx = e.changedTouches[0].clientX - swipeOriginX.current;
    if (Math.abs(dx) > SWIPE_THRESHOLD_PX) go(index + (dx < 0 ? 1 : -1));
    swipeOriginX.current = null;
  };

  return (
    <div
      className="fixed inset-0 select-none overflow-hidden bg-neutral-950"
      // 고른 글꼴과 그 글꼴에 맞는 줄 간격을 .font-story가 받아 쓴다.
      style={
        { "--story-font": font.family, "--story-leading": String(font.leading) } as React.CSSProperties
      }
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <OrientationHint />

      {/*
        책장 넘김 연출. 지나간 쪽이 아래 모서리를 축으로 살짝 기울며 왼쪽으로
        쓸려 나간다 — 그림책 장을 손으로 넘기는 손맛. 넘어가는 동안 아래 깔린
        다음 쪽이 드러나고, 뒤로 가면 나갔던 장이 다시 쓸려 들어온다.
      */}
      {/* relative z-0 — 쪽들의 zIndex 경쟁을 이 안에 가둔다. 쪽수가 아무리
          늘어도(전래동화 16쪽) 버튼·링크가 항상 위에 남는다. */}
      <div className="relative z-0 h-full w-full">
        {book.pages.map((page, i) => {
          // 낭독 글자를 노래방처럼 색칠해 보여준다 — 가로 오버레이·세로 패널 두 곳에서 같은 내용을 쓴다.
          /**
           * @param onPaper 펼침면의 '종이' 위에 놓이는 글인지. 종이 위에서는 흰 글씨가
           *   안 보이므로 어두운 글씨로 바꾼다(색칠도 진한 주황으로).
           *   같은 본문이 어두운 밴드와 종이 두 곳에 쓰여서 색을 갈라 준다.
           */
          const renderRuns = (onPaper = false, focusCurrent = false) => {
            const done = onPaper ? "text-amber-600" : "text-amber-300";
            const rest = onPaper ? "text-neutral-800" : "text-white";
            const live = i === index && reading;
            // 꽉 찬 그림은 재생 전후 모두 같은 한두 줄 자막 슬롯을 쓴다.
            // 재생을 눌러도 레이아웃은 움직이지 않고 이 자리에서 색칠만 시작된다.
            if (focusCurrent) {
              const chunk = currentReadingChunk(page.text, highlight);
              return (
                <span
                  key={chunk.from}
                  className="block animate-[subtitle-in_180ms_ease-out] text-balance"
                >
                  {chunk.text.split("").map((ch, k) => (
                    <span key={k} className={chunk.from + k < highlight ? done : rest}>
                      {ch}
                    </span>
                  ))}
                </span>
              );
            }
            /*
             * 문장마다 줄을 바꾼다. 한 덩어리로 흘리면 줄이 아무 데서나 끊겨
             * 문서처럼 딱딱해 보인다 — 그림책은 문장 단위로 놓인다.
             * 문장 사이를 한 줄 띄워 숨 쉴 자리를 준다.
             *
             * 글자를 더하거나 빼지 않는 게 중요하다. 낭독 색칠이 '몇 번째 글자까지'로
             * 도는데, 여기서 공백 하나만 손대도 색칠이 어긋난다. 그래서 자르기만 하고
             * 이어 붙이면 원문 그대로가 되게 한다.
             */
            let at = 0;
            return splitStorySentences(page.text).map((sentence, si) => {
              const start = at;
              at += sentence.length;
              return (
                /*
                 * 문장 사이 간격 — 줄 간격(1.4)과 어울리게 아주 얕게만 준다.
                 *
                 * 두 번 줄였다. 0.7em은 한 문장이 두 줄로 넘어갈 때 '줄 사이'와 '문장
                 * 사이'가 나란히 보여 간격이 제각각으로 읽혔고, 0.45em도 여전히 멀었다.
                 * 문장마다 줄이 바뀌는 것만으로 이미 나뉘어 보이므로, 여기서 할 일은
                 * 살짝 숨을 주는 것뿐이다. em이라 글자를 키워도 비율은 그대로다.
                 */
                <span key={si} className="block [&+&]:mt-[0.25em]">
                  {live ? (
                    sentence
                      .split("")
                      .map((ch, k) => (
                        <span key={k} className={start + k < highlight ? done : rest}>
                          {ch}
                        </span>
                      ))
                  ) : (
                    <span className={rest}>{sentence}</span>
                  )}
                </span>
              );
            });
          };

          /*
           * 그림 위에 얹는 오버레이 — 그림이 화면을 꽉 채울 때 쓴다.
           * (세로에선 그림을 가리지 않게, 그림 아래 전용 자리에 따로 글을 놓는다.)
           *
           * display를 밖에서 받는 이유: 글 없는 쪽에서는 늘 보이지만, 그림 있는 쪽에서는
           * 가로에서만 보여야 한다("hidden landscape:…"). 그런데 가운데·좌·우 위치는
           * flex가 필요하고 위·아래는 block이라, 한 문자열로 못 묶는다.
           * 위치 목록에 flex를 섞어 두면 hidden과 부딪혀 어느 쪽이 이길지 불안정해진다.
           */
          const posNeedsFlex = textPos === "center" || textPos === "left" || textPos === "right";
          const overlayText = (
            display: string,
            size: string,
            focusCurrent = false,
            position: typeof textPos = textPos,
          ) => (
            <div
              className={`absolute ${
                focusCurrent && position === "bottom"
                  ? "inset-x-[6%] bottom-4 px-[2%] py-2 landscape:bottom-28"
                  : {
                      bottom:
                        "inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-[6%] pb-[6%] pt-[14%]",
                      top: "inset-x-0 top-0 bg-gradient-to-b from-black/85 via-black/55 to-transparent px-[6%] pt-[6%] pb-[14%]",
                      center: "inset-0 items-center justify-center p-[6%]",
                      left: "inset-y-0 left-0 w-[46%] items-center pl-[5%] pr-[2%]",
                      right: "inset-y-0 right-0 w-[46%] items-center pr-[5%] pl-[2%]",
                    }[position]
              } ${display}`}
            >
              {/*
               * 그림 위 자막은 **줄이지 않는다**.
               *
               * 예전엔 칸을 재서 글자를 자동으로 축소했다. 그런데 쪽마다 글자
               * 크기가 들쭉날쭉해 읽기 불편하다는 지적이 있었다(2026-08-27).
               * 쪽당 90~110자로 짧아진 지금은 줄일 일이 거의 없다.
               * 대신 max-h 와 overflow-hidden 을 걷어내 칸이 글에 맞춰 늘어나게
               * 둔다 — 줄이지도, 자르지도 않는다. 긴 쪽에서는 자막 띠가 조금 더
               * 올라올 뿐이다. 종이 펼침면은 칸 높이가 고정이라 그대로 줄인다.
               */}
              <p
                style={{
                  fontSize: `calc(${size} * ${textScale} * ${font.scale})`,
                  fontWeight: storyWeightForFont(font, weight),
                }}
                className={`font-story whitespace-pre-line break-keep text-pretty text-center drop-shadow-md ${
                  focusCurrent && position === "bottom"
                    ? "mx-auto w-full max-w-[min(46rem,82vw)] [text-shadow:0_1px_2px_rgba(0,0,0,0.7),0_3px_7px_rgba(0,0,0,0.5)]"
                    : position === "bottom" || position === "top"
                      ? "mx-auto w-full max-w-[max(20rem,60vw)]"
                    : "w-full rounded-3xl bg-black/55 p-5 backdrop-blur-[2px] sm:p-6"
                } ${position === "center" ? "max-w-[max(20rem,55vw)]" : ""}`}
              >
                {renderRuns(false, focusCurrent)}
              </p>
            </div>
          );
          return (
          <section
            key={i}
            // bg 불투명 필수 — 블러 배경이 반투명(70%)이라 바탕이 비치면
            // 아래 깔린 다음 쪽의 글자가 유령처럼 새어 보인다.
            className="absolute inset-0 h-full w-full bg-neutral-950"
            style={{
              transformOrigin: "left bottom",
              transform:
                i < index ? "translateX(-118%) rotate(-7deg)" : "translateX(0) rotate(0deg)",
              // 520ms — 0.82초는 "안 눌렸나?" 싶어 연타를 부르던 길이라 한 김 줄였다.
              // (연타 잠금 450ms와 짝) 마운트 직후 '이어보기' 점프는 animate=false라 즉시 이동.
              transition: animate ? "transform 520ms cubic-bezier(0.22, 0.61, 0.36, 1)" : "none",
              // 안 넘긴 쪽은 현재 쪽이 맨 위, 넘긴 쪽은 넘어가는 동안 그 위에 뜬다
              zIndex: i < index ? book.pages.length + i : book.pages.length - i,
              boxShadow: "0 0 44px rgba(0,0,0,0.45)",
            }}
          >
            {page.image ? (
              <>
                {/* 뒤 블러로 화면을 꽉 채워 letterbox 빈 자리를 메운다(그림 잘림 없음). */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={page.image}
                  alt=""
                  aria-hidden
                  className="absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-[32px] saturate-[.7]"
                />
                {/* 현재 장면의 색만 은은하게 남기는 앰비언트 배경. 별도의 테마 그림을
                    섞지 않아 장소가 충돌하지 않고, 상단 버튼도 밝은 그림에 묻히지 않는다. */}
                <div
                  aria-hidden
                  className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,10,10,0.28)_0%,rgba(10,10,10,0.16)_48%,rgba(10,10,10,0.2)_100%)]"
                />
                {/* 무대 — 꽉 찬 그림은 모바일에서도 원본 비율의 실제 그림 영역에
                    본문을 겹친다. 펼침면의 [그림+글자] 책 구조는 가로에서만 유지한다.
                    세로 화면도 전체 높이의 정중앙에 둔다. 하단 버튼 자리를 무대에서
                    미리 빼면 세로 이미지가 화면 위쪽으로 밀려 보이기 때문이다.
                    틀 비율은 그림 실측(--ar) — 4:3 고정이면 와이드 그림이 '짤려' 보인다. */}
                {/*
                  펼침면 무대 — 그림과 종이가 '한 권의 책'으로 딱 맞아야 한다.
                  예전엔 종이가 늘 화면 절반(50vw)이라, 그림보다 종이가 넓고 높아
                  오른쪽에 크림빛 여백이 남았다(사장님 지적 — 책이 아니라 배경처럼 보인다).

                  그래서 무대 자체를 책 크기로 잡는다. 두 쪽이 나란한 책의 가로세로비는
                  그림 비율(--ar)의 두 배다. 화면 안에 넣으려면 가로·세로 어느 쪽이 먼저
                  닿는지에 따라 크기가 정해지므로, 둘 다 min()으로 눌러 준다:
                    너비 = min(화면 너비, 그림비×2 × 화면 높이)
                    높이 = min(화면 높이, 화면 너비 ÷ (그림비×2))
                  이렇게 잡으면 절반씩 나눈 두 쪽이 각각 정확히 그림 비율이 되어,
                  그림과 종이의 높이·너비가 저절로 맞는다.
                  가운데 정렬은 inset-0(좌우 0) + mx-auto로 한다.
                */}
                <div
                  className={`absolute inset-0 flex items-center justify-center portrait:flex-col ${
                    spread
                      ? "landscape:mx-auto landscape:my-auto landscape:w-[min(100vw,calc(var(--ar)*2*100dvh))] landscape:h-[min(100dvh,calc(100vw/(var(--ar)*2)))]"
                      : ""
                  }`}
                  style={{ "--ar": String(ratioOf(i)) } as React.CSSProperties}
                >
                  <div
                    className={`relative shrink-0 overflow-hidden shadow-[0_0_28px_rgba(0,0,0,0.18)] ${
                      spread
                        ? // 펼침면 — 왼쪽 쪽. 무대가 이미 책 크기라 절반이 곧 한 쪽이다.
                          "[aspect-ratio:var(--ar)] portrait:w-full landscape:h-full landscape:w-1/2"
                        : "[aspect-ratio:var(--ar)] portrait:w-full landscape:w-[min(100%,calc(var(--ar)*100dvh))]"
                    }`}
                    style={{ "--ar": String(ratioOf(i)) } as React.CSSProperties}
                  >
                    {page.video ? (
                      <video
                        key={i === index ? `on-${i}` : `off-${i}`}
                        src={i === index ? page.video : undefined}
                        poster={page.image}
                        autoPlay={i === index}
                        muted
                        playsInline
                        onEnded={(e) => {
                          const el = e.currentTarget;
                          const plays = Number(el.dataset.plays || "0") + 1;
                          el.dataset.plays = String(plays);
                          if (plays < 2) {
                            el.currentTime = 0;
                            el.play().catch(() => {});
                          }
                        }}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={page.image}
                        alt=""
                        onLoad={(e) => {
                          // 그림 실측 비율을 기록 — 무대 틀·핫스팟 틀이 이 비율로 맞춰진다.
                          const el = e.currentTarget;
                          if (!el.naturalWidth || !el.naturalHeight) return;
                          const r = el.naturalWidth / el.naturalHeight;
                          setImgRatios((prev) =>
                            Math.abs((prev[i] ?? 0) - r) < 0.001 ? prev : { ...prev, [i]: r },
                          );
                        }}
                        className={`h-full w-full object-contain ${
                          i === index && reading ? "animate-[breathe_10s_ease-in-out_infinite]" : ""
                        }`}
                      />
                    )}
                    {/* 꽉 찬 그림의 자막. 세로 화면에서는 저장된 보기 방식과 관계없이
                        항상 그림 안에 현재 한두 줄만 표시한다. 펼침면의 전체 본문 종이는
                        가로 화면에서만 적용한다.
                        예전엔 여기가 '하단 밴드'로 굳어 있어서, 설정에서 글자 위치를
                        바꿔도 그림 있는 책에서는 아무 반응이 없었다(설정이 안 먹는
                        것처럼 보이던 원인). 이제 글 없는 쪽과 같은 오버레이를 써서
                        위·아래·가운데·좌·우가 그대로 반영된다.
                        펼침면에서는 글이 옆 종이로 빠지므로 이 오버레이를 쓰지 않는다. */}
                    {overlayText(
                      spread ? "block landscape:hidden" : "block",
                      "clamp(1.35rem,2.9vw,2.05rem)",
                      true,
                      "bottom",
                    )}
                  </div>
                  {/* 글자 칸.
                      · 세로(폰) + 꽉 찬 그림: 사용하지 않고 그림 위 오버레이를 쓴다.
                      · 세로(폰): 저장된 보기 방식과 무관하게 이 칸을 숨긴다.
                      · 가로 + 펼침면: 오른쪽 절반의 '종이' — 진짜 그림책 펼침면이 된다.
                      · 가로 + 꽉 찬 그림: 이 칸은 숨고 위의 하단 밴드가 대신한다.
                      아래 버튼(재생·배속·넘김)을 안 가리게 여백을 넉넉히 둔다. */}
                  <div
                    style={
                      spread
                        ? ({
                            // 종이 느낌 — 그림을 깔면 쪽마다 밝기가 달라 글이 묻힌다.
                            // 결이 아주 옅은 아이보리 종이 + 왼쪽 가장자리에 책등(접힘) 그림자.
                            // 이 그림자 하나가 '펼친 책'으로 보이게 하는 핵심이다.
                            "--paper":
                              "radial-gradient(circle at 20% 10%, rgba(0,0,0,0.018) 0.5px, transparent 0.6px), radial-gradient(circle at 70% 60%, rgba(0,0,0,0.015) 0.5px, transparent 0.6px), linear-gradient(180deg,#fffdf6 0%,#fdf8ea 55%,#f8f1de 100%)",
                          } as React.CSSProperties)
                        : undefined
                    }
                    className={`shrink-0 items-center justify-center overflow-hidden ${
                      spread
                        ? "hidden landscape:flex landscape:h-full landscape:w-1/2 landscape:bg-[image:var(--paper)] landscape:bg-[length:14px_14px,18px_18px,100%_100%] landscape:px-[7%] landscape:pb-24 landscape:pt-8 landscape:shadow-[inset_18px_0_28px_-18px_rgba(90,60,20,0.35)]"
                        : "hidden"
                    }`}
                  >
                    {/* 가로 + 펼침면 — 종이 위 어두운 글씨. 색칠도 종이에 맞춰 진한 주황. */}
                    {spread && (
                      // 종이 한 쪽에 8쪽짜리 본문(150~250자)이 들어가야 해서, 글자가 크면
                      // 넘쳐 스크롤바가 생긴다 — 그림책에 스크롤바가 보이면 책이 아니게 된다.
                      // 길면 AutoFitStoryText가 실제 칸을 재서 스크롤 없이 자동 축소한다.
                      <AutoFitStoryText
                        fitKey={page.text}
                        baseSize="clamp(0.95rem,1.85vw,1.45rem)"
                        textScale={textScale}
                        fontScale={font.scale}
                        fontWeight={storyWeightForFont(font, weight)}
                        className="font-story hidden max-h-full max-w-[34rem] whitespace-pre-line break-keep text-pretty text-center landscape:block"
                      >
                        {renderRuns(true)}
                      </AutoFitStoryText>
                    )}
                  </div>
                </div>
              </>
            ) : (
              // 그림 없는 쪽(글 동화)은 테마 배경 위에 글을 얹는다.
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ui.background} alt="" className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-white/20" />
                {overlayText(posNeedsFlex ? "flex" : "block", "clamp(1.7rem,3.6vw,2.15rem)")}
              </>
            )}
          </section>
          );
        })}
      </div>

      {/* 아래 가운데 넘김 바 — 우측 상단 ◀▶는 작고 눈에 잘 안 띄어서, 크고 분명한
          '다음 장'을 아래에 하나 더 둔다. 지금 몇 쪽인지도 같이 보여 준다
          (아이는 "얼마나 남았어?"를 자주 묻는다). 마지막 쪽에선 다음이 잠긴다. */}
      <div className={`absolute bottom-4 left-1/2 z-10 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 flex-nowrap items-center gap-0 rounded-full bg-black/45 px-1 py-1 backdrop-blur sm:bottom-6 sm:gap-2 sm:px-2 sm:py-1.5 ${chromeCls}`}>
        <button
          type="button"
          aria-label="이전 장"
          onClick={() => go(index - 1)}
          disabled={index === 0}
          className="flex h-9 items-center gap-1 rounded-full px-2 text-sm font-extrabold text-white transition hover:bg-white/20 disabled:opacity-30 outline-none focus:outline-none sm:h-10 sm:px-3"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
            <path d="M14.5 5.5 8 12l6.5 6.5" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="hidden sm:inline">이전</span>
        </button>

        {/* 쪽 표시도 줄바꿈되지 않게 한 줄로 고정한다. */}
        <span className="min-w-[3rem] whitespace-nowrap text-center text-[13px] font-extrabold text-white/90 sm:min-w-[3.5rem] sm:text-sm">
          {index + 1} / {book.pages.length}
        </span>

        <button
          type="button"
          aria-label="다음 장"
          onClick={() => go(index + 1)}
          disabled={index === lastIndex}
          className="flex h-9 items-center gap-1 rounded-full bg-white/20 px-2 text-sm font-extrabold text-white transition hover:bg-white/30 disabled:opacity-30 outline-none focus:outline-none sm:h-10 sm:px-3"
        >
          {/* 폰에서는 글자를 감춘다 — '이전'과 같은 규칙.
              좁은 화면에서 글자까지 들어가면 바가 밀려 줄이 깨졌다(사장님 지적).
              화살표만으로도 뜻이 통하고, 읽어 주는 이름은 aria-label에 남아 있다. */}
          <span className="hidden sm:inline">다음 장</span>
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
            <path d="M9.5 5.5 16 12l-6.5 6.5" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* 넘김은 우측 상단 전용 버튼(◀ ▶) — 화면 절반 탭 방식은 캐릭터 클릭
          대사와 겹쳐 오작동해서 걷어냈다. 스와이프와 키보드 ←→는 그대로 산다. */}
      <div
        className={`absolute right-3 z-10 flex gap-1.5 sm:right-4 sm:gap-2 ${chromeCls}`}
        style={{ top: "calc(1rem + env(safe-area-inset-top))" }}
      >
        <button
          type="button"
          aria-label="이전 쪽"
          onClick={() => go(index - 1)}
          disabled={index === 0}
          className="hidden h-9 w-9 items-center justify-center rounded-full bg-white/85 shadow-md backdrop-blur transition hover:bg-white disabled:opacity-35 outline-none focus:outline-none sm:flex sm:h-11 sm:w-11"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
            <path d="M14.5 5.5 8 12l6.5 6.5" fill="none" stroke="#404040" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="다음 쪽"
          onClick={() => go(index + 1)}
          disabled={index === lastIndex}
          className="hidden h-9 w-9 items-center justify-center rounded-full bg-white/85 shadow-md backdrop-blur transition hover:bg-white disabled:opacity-35 outline-none focus:outline-none sm:flex sm:h-11 sm:w-11"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
            <path d="M9.5 5.5 16 12l-6.5 6.5" fill="none" stroke="#404040" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {/* 배경음 토글 — 잔잔한 음악을 켜고 끈다. 켜짐 상태는 저장된다. */}
        <button
          type="button"
          aria-label={bgmOn ? "배경음 끄기" : "배경음 켜기"}
          onClick={() => {
            const next = !bgmOn;
            setBgmOn(next);
            saveBgmOn(next);
          }}
          className={`flex h-9 w-9 items-center justify-center rounded-full shadow-md backdrop-blur transition outline-none focus:outline-none sm:h-11 sm:w-11 ${
            bgmOn ? "bg-amber-400 text-white" : "bg-white/85 text-neutral-400 hover:bg-white"
          }`}
        >
          <span className="text-lg leading-none" aria-hidden>
            {bgmOn ? "♪" : "♪"}
          </span>
        </button>
        {/* 나레이션 성우 바꾸기 — 읽다가 마음에 안 들면 여기서 바로 교체. */}
        <button
          type="button"
          aria-label="읽어주는 성우 바꾸기"
          onClick={() => setVoiceMenu((v) => !v)}
          className={`flex h-9 items-center justify-center gap-1 rounded-full px-2.5 shadow-md backdrop-blur transition outline-none focus:outline-none sm:h-11 sm:px-3 ${
            voiceMenu ? "bg-amber-400 text-white" : "bg-white/85 text-neutral-600 hover:bg-white"
          }`}
        >
          <span className="text-base leading-none" aria-hidden>
            {voiceChoices.find((v) => v.id === voiceId)?.emoji ??
              TYPECAST_VOICES.find((v) => v.id === voiceId)?.emoji ??
              "🎙️"}
          </span>
          <span className="hidden text-xs font-extrabold sm:inline">성우</span>
        </button>
      </div>

      {/* 성우 목록 — 상단 버튼 아래로 펼쳐진다. 길어서 안에서 스크롤된다. */}
      {voiceMenu && (
        <div
          className="absolute right-4 z-20 max-h-[70dvh] w-56 overflow-y-auto rounded-2xl bg-white/95 p-2 shadow-2xl backdrop-blur"
          style={{ top: "calc(3.75rem + env(safe-area-inset-top))" }}
        >
          <p className="px-2 py-1 text-[11px] font-bold text-neutral-400">
            {isCreated ? "읽어주는 성우를 골라요" : "이 동화 추천 성우 (무료로 바꿔 들어요)"}
          </p>
          {voiceChoices.map((v) => {
            const active = voiceId === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => pickVoice(v.id)}
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold transition ${
                  active ? "bg-amber-400 text-white" : "text-neutral-700 hover:bg-neutral-100"
                }`}
              >
                <span className="text-base leading-none" aria-hidden>{v.emoji}</span>
                <span className="flex-1">{v.label}</span>
                {active && <span aria-hidden>✓</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* 움직이는 캐릭터(배우) 레이어 — 캐릭터 없는 배경 위에 투명 스티커를
          겹치고, 낭독 중에는 뒤뚱뒤뚱 움직인다. 클릭은 통과시켜 핫스팟이 받는다. */}
      {(book.pages[index].actors?.length ?? 0) > 0 && (
        <div className="pointer-events-none absolute inset-0 z-[4] flex items-center justify-center">
          {/* 그림 실측 비율(--ar)로 무대와 같은 크기를 유지한다 — 좌표가 그림과 맞아떨어진다. */}
          <div
            className="relative [aspect-ratio:var(--ar)] w-[min(100%,calc(var(--ar)*100dvh))]"
            style={{ "--ar": String(ratioOf(index)) } as React.CSSProperties}
          >
            {book.pages[index].actors!.map((a, ai) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={ai}
                src={a.src}
                alt=""
                className={`absolute object-contain ${
                  reading ? "animate-[waddle_1.6s_ease-in-out_infinite]" : ""
                }`}
                style={{
                  top: `${a.box[0] / 10}%`,
                  left: `${a.box[1] / 10}%`,
                  height: `${(a.box[2] - a.box[0]) / 10}%`,
                  width: `${(a.box[3] - a.box[1]) / 10}%`,
                  transformOrigin: "50% 100%",
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* 본문 고치기 (마스터 · 내가 만든 동화만).
          글자가 소실돼 ◆? 로 나오는 쪽은 사람이 다시 써 넣는 수밖에 없다.
          그 한 글자 때문에 동화를 다시 만들면 토큰과 그림이 통째로 날아간다. */}
      {/*
        * 고치는 도구는 평소엔 작은 아이콘 하나로 접어 둔다.
        *
        * 글자가 박힌 알약 두 개가 늘 떠 있으니 그림 왼쪽 위를 계속 덮었다. 이건
        * 읽을 때 쓰는 것이 아니라 '어쩌다 한 번' 쓰는 것이라, 평소에 자리를 차지할
        * 이유가 없다. 아이콘을 누르면 그때 펼쳐진다.
        */}
      {editable && !editing && (
        <div className="absolute left-3 top-16 z-20 flex flex-col items-start gap-1.5">
          <button
            type="button"
            onClick={() => setToolsOpen((v) => !v)}
            aria-label={toolsOpen ? "고치기 도구 접기" : "고치기 도구 펼치기"}
            className={`flex h-9 w-9 items-center justify-center rounded-full shadow backdrop-blur transition ${
              toolsOpen ? "bg-neutral-800" : "bg-white/85 hover:bg-white"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icons/func-remake.webp"
              alt=""
              aria-hidden
              className={`h-6 w-6 object-contain ${toolsOpen ? "brightness-0 invert" : ""}`}
            />
          </button>

          {toolsOpen && (
            <>
              {/* 글 고치기 — 본문을 바꾸면 낭독 캐시와 어긋나서 마스터만 쓴다(editable 에서 이미 거른다). */}
              <button
                type="button"
                onClick={() => {
                  setDraft(book.pages[index].text);
                  setEditing(true);
                }}
                className="rounded-full bg-white/85 px-3 py-1.5 text-xs font-extrabold text-neutral-700 shadow backdrop-blur"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/func-edit.webp" alt="" aria-hidden className="mr-1 inline-block h-5 w-5 object-contain align-[-0.3em]" />
                글 고치기
              </button>
              {/* 이 쪽 그림 다시 그리기 — 삽화가 빠졌거나 마음에 안 드는 쪽을 그 쪽만 고친다.
                  그림이 없는 쪽은 문구를 바꿔, 비어 있다는 걸 먼저 알아채게 한다.
                  다 쓴 뒤에도 버튼은 남긴다 — 사라지면 "있었는데 없어졌다"가 더 헷갈린다. */}
              <button
                type="button"
                onClick={redrawPage}
                disabled={redrawing || redrawsLeft <= 0}
                className="rounded-full bg-white/85 px-3 py-1.5 text-xs font-extrabold text-neutral-700 shadow backdrop-blur disabled:opacity-50"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/func-remake.webp" alt="" aria-hidden className="mr-1 inline-block h-5 w-5 object-contain align-[-0.3em]" />
                {/* 도구가 마스터 전용이 된 뒤로 남은 장수 표시는 죽은 분기다 —
                    마스터는 무제한(redrawsLeft = Infinity)이라 늘 그릴 수 있다. */}
                {redrawing
                  ? "그리는 중…"
                  : book.pages[index].image
                    ? "이 쪽 그림 다시 그리기"
                    : "이 쪽 그림 그리기"}
              </button>
            </>
          )}
        </div>
      )}
      {editing && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="flex w-full max-w-2xl flex-col gap-3 rounded-3xl bg-white p-5 shadow-2xl">
            <div>
              <p className="text-sm font-extrabold text-neutral-800">
                {index + 1}쪽 글 고치기
              </p>
              {/* 글이 바뀌면 그 쪽 낭독은 캐시가 안 맞아 다시 합성된다 = 크레딧이
                  또 나간다. 고치기 전에 알고 있어야 해서 분명히 적는다.
                  구성이 마음에 안 들면 만들기의 줄거리 단계에서 고치는 게 공짜다. */}
              <p className="mt-0.5 break-keep text-xs font-medium text-neutral-500">
                그림은 그대로예요. 다만 <b className="text-amber-700">글이 바뀌면 그 쪽 낭독을
                다시 만들어야 해서 크레딧이 한 번 더 나갑니다</b> — 오타 정정처럼 꼭 필요한
                때만 쓰세요.
              </p>
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={6}
              autoFocus
              className="w-full resize-y rounded-2xl border-2 border-neutral-200 p-3 text-sm font-bold leading-relaxed outline-none focus:border-neutral-400"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={saving}
                className="rounded-full bg-neutral-100 px-4 py-2 text-sm font-extrabold text-neutral-600 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={saveText}
                disabled={saving || !draft.trim()}
                className="rounded-full bg-neutral-800 px-5 py-2 text-sm font-extrabold text-white disabled:opacity-50"
              >
                {saving ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 처음 한 번만 뜨는 안내 — 눌러 볼 수 있다는 걸 모르고 지나가지 않게.
          잠깐 떴다 사라지고, 눌러도 닫힌다. 넘김 버튼(z-10) 위에 잠깐 얹는다. */}
      {tapHint && (
        <button
          type="button"
          onClick={() => setTapHint(false)}
          className="absolute left-1/2 z-20 max-w-[calc(100vw-1.5rem)] -translate-x-1/2 animate-[float_2s_ease-in-out_infinite] whitespace-nowrap rounded-full bg-white/95 px-4 py-2 text-xs font-extrabold text-neutral-700 shadow-lg backdrop-blur sm:px-5 sm:py-2.5 sm:text-sm"
          style={{ top: "calc(4.25rem + env(safe-area-inset-top))" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/hint-tap.webp" alt="" aria-hidden className="mr-1.5 inline-block h-7 w-7 object-contain align-[-0.45em]" />
          그림 속 친구를 눌러 보세요 — 말을 해요!
        </button>
      )}

      {/* 캐릭터 클릭 대사 — 그림 속 캐릭터 자리를 누르면 그 캐릭터가 말한다.
          그림과 같은 규칙의 틀을 겹쳐 좌표를 맞춘다.
          넘김 영역보다 위(z-[5]), 읽어주기 버튼(z-10)보다는 아래.
          펼침면에서는 그림이 화면 가운데가 아니라 '책의 왼쪽 쪽'에 있으므로,
          무대 크기와 정렬을 그림 쪽과 똑같이 맞춘다 — 안 맞추면 엉뚱한 자리를 누르게 된다. */}
      {book.pages[index].image && (book.pages[index].hotspots?.length ?? 0) > 0 && (
        <div
          className={`pointer-events-none absolute inset-0 z-[5] flex items-center justify-center ${
            spread
              ? "landscape:mx-auto landscape:my-auto landscape:w-[min(100vw,calc(var(--ar)*2*100dvh))] landscape:h-[min(100dvh,calc(100vw/(var(--ar)*2)))] landscape:justify-start"
              : ""
          }`}
          style={{ "--ar": String(ratioOf(index)) } as React.CSSProperties}
        >
          <div
            className={`relative [aspect-ratio:var(--ar)] w-[min(100%,calc(var(--ar)*100dvh))] ${
              spread ? "landscape:h-full landscape:w-1/2" : ""
            }`}
            style={{ "--ar": String(ratioOf(index)) } as React.CSSProperties}
          >
            {book.pages[index].hotspots!.map((h, hi) => {
              return (
                <button
                  key={`${h.label}-${hi}`}
                  type="button"
                  aria-label={`${HOTSPOT_KO[h.label] ?? h.label} 대사 듣기`}
                  onClick={() => playHotspot(h, index)}
                  // 시각 표시는 말풍선 하나로 충분하다 — 링·포커스 테두리는 그림을 해친다.
                  className="pointer-events-auto absolute outline-none focus:outline-none focus-visible:outline-none"
                  style={{
                    top: `${h.box[0] / 10}%`,
                    left: `${h.box[1] / 10}%`,
                    height: `${(h.box[2] - h.box[0]) / 10}%`,
                    width: `${(h.box[3] - h.box[1]) / 10}%`,
                  }}
                />
              );
            })}

            {/* 말풍선 — 말하는 캐릭터 머리 위에 대사를 보여준다 (음성과 같은 내용).
                박스가 위쪽에 붙어 있으면 아래에 띄운다. 좌우·상하 모두 그림 틀
                안에 갇히게 여유 있게 클램프한다 — 가장자리 캐릭터도 잘리지 않는다. */}
            {speaking &&
              speaking.page === index &&
              (() => {
                // 가장자리 캐릭터는 가운데 정렬(-50%)이 틀 밖으로 밀린다 —
                // 왼쪽 끝은 왼쪽 붙임, 오른쪽 끝은 오른쪽 붙임으로 앵커를 바꾼다.
                const cx = (speaking.box[1] + speaking.box[3]) / 20;
                const x =
                  cx < 28
                    ? { left: `${Math.max(2, speaking.box[1] / 10)}%`, tx: "0%" }
                    : cx > 72
                      ? { left: `${Math.min(98, speaking.box[3] / 10)}%`, tx: "-100%" }
                      : { left: `${cx}%`, tx: "-50%" };
                const y =
                  speaking.box[0] > 180
                    ? {
                        /*
                         * 캐릭터 위에 띄울 때는 28% 아래로는 못 내려온다.
                         *
                         * -110%로 끌어올리는 구조라, 여기가 낮으면 말풍선이 그림
                         * 위쪽 밖으로 삐져나간다(실제로 1쪽 토끼에서 그랬다).
                         * 두 줄짜리 말풍선 높이를 견딜 만큼 여유를 둔다.
                         */
                        top: `${Math.min(94, Math.max(28, speaking.box[0] / 10))}%`,
                        ty: "-110%",
                      }
                    : { top: `${Math.min(74, speaking.box[2] / 10 + 2)}%`, ty: "0%" };
                const below = y.ty === "0%"; // 말풍선이 캐릭터 아래에 뜬 경우
                return (
                  // 바깥 = 위치(translate 앵커), 안쪽 = 통통 팝(scale). transform이
                  // 하나뿐이라 둘을 겹치면 서로 덮어써서 위치가 틀어진다 → 겹을 나눈다.
                  <div
                    /*
                     * 너비를 화면(vw)이 아니라 **그림 틀**에 맞춘다.
                     * 예전엔 26rem 고정이라, 펼침면에서 그림이 화면 절반으로
                     * 줄어도 말풍선만 그대로 커서 그림을 다 덮었다.
                     */
                    className="absolute z-[6] w-max max-w-[min(72%,22rem)]"
                    style={{ left: x.left, top: y.top, transform: `translate(${x.tx}, ${y.ty})` }}
                  >
                    <div className="font-story relative animate-[bubble-pop_0.35s_cubic-bezier(0.34,1.56,0.64,1)] whitespace-normal break-keep rounded-[1.2rem] bg-white px-4 py-2.5 text-center text-[clamp(0.95rem,1.7vw,1.5rem)] font-bold leading-snug text-neutral-800 shadow-[0_8px_24px_rgba(0,0,0,0.22)]">
                      {speaking.line}
                      {/* 꼬리 — 캐릭터를 가리킨다. 말풍선이 위에 있으면 아래로, 아래면 위로.
                          말풍선과 같은 순백이라 테두리 없이도 이어져 보인다. */}
                      <span
                        aria-hidden
                        className="absolute left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 bg-white"
                        style={below ? { top: "-5px" } : { bottom: "-5px" }}
                      />
                    </div>
                  </div>
                );
              })()}

            {/* 클릭 반짝이 — 누른 캐릭터 자리에서 통통 튀어오른다.
                위치 중심 정렬(translate -50%)은 keyframe이 처리하므로 className엔 안 넣는다. */}
            {burst && (
              <div
                key={burst.key}
                aria-hidden
                className="pointer-events-none absolute z-[6] animate-[sparkle-burst_0.7s_ease-out_forwards]"
                style={{ left: `${burst.cx}%`, top: `${burst.cy}%` }}
              >
                <span className="text-4xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">✨</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div
        className={`absolute left-3 z-10 flex items-center gap-1.5 sm:left-4 sm:gap-2 ${chromeCls}`}
        style={{ top: "calc(1rem + env(safe-area-inset-top))" }}
      >
        <Link
          href="/"
          aria-label="서재로 돌아가기"
          className="flex h-9 w-9 items-center justify-center gap-1 rounded-full bg-black/40 p-0 text-sm text-white/90 backdrop-blur transition hover:bg-black/60 min-[360px]:w-auto min-[360px]:px-3 sm:px-4"
        >
          <span aria-hidden>←</span>
          <span className="hidden min-[360px]:inline">서재</span>
        </Link>
        {/* 가로로 보기 — 클릭(제스처) 안에서 전체화면 + 가로 고정을 요청한다.
            미지원 기기는 조용히 무시되고 회전 안내 힌트가 대신한다.
            좁은 폰에선 아이콘만(글자 숨김) 보여 좌우 버튼 겹침을 막는다. */}
        <button
          type="button"
          onClick={() => (storyMode ? exitStoryMode() : enterStoryMode())}
          aria-label={storyMode ? "원래대로" : "가로로 보기"}
          className="rounded-full bg-black/40 px-3 py-2 text-sm text-white/90 backdrop-blur transition hover:bg-black/60 outline-none focus:outline-none sm:px-4"
        >
          <span className="sm:hidden">{storyMode ? "↩" : "⛶"}</span>
          <span className="hidden sm:inline">{storyMode ? "원래대로" : "⛶ 가로로 보기"}</span>
        </button>
        {/* 보는 방식은 중앙 장면을 가리지 않도록 탐색 버튼 옆에 붙인다.
            모바일은 아이콘만, 여유 있는 화면은 짧은 이름도 함께 보여 준다. */}
        <div
          className="flex items-center rounded-full bg-black/40 p-0.5 shadow-md backdrop-blur"
          role="group"
          aria-label="책 보는 방식 (가로 화면에 적용)"
        >
          <button
            type="button"
            aria-label="꽉 찬 그림으로 보기"
            aria-pressed={layout === "full"}
            title="꽉 찬 그림"
            onClick={() => applyBookLayout("full")}
            className={`flex h-8 w-8 items-center justify-center rounded-full p-0 text-[11px] font-extrabold transition outline-none focus:outline-none min-[480px]:w-auto min-[480px]:gap-1 min-[480px]:px-2.5 sm:text-xs ${
              layout === "full"
                ? "bg-white text-neutral-700 shadow-sm"
                : "text-white/80 hover:bg-white/15 hover:text-white"
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
              <rect x="3.5" y="5" width="17" height="14" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
              <circle cx="9" cy="10" r="1.5" fill="currentColor" />
              <path d="m5.5 17 4.2-4 3.1 2.6 2.4-2.1 3.3 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="hidden min-[480px]:inline">그림</span>
          </button>
          <button
            type="button"
            aria-label="펼침면으로 보기"
            aria-pressed={layout === "spread"}
            title="펼침면"
            onClick={() => applyBookLayout("spread")}
            className={`flex h-8 w-8 items-center justify-center rounded-full p-0 text-[11px] font-extrabold transition outline-none focus:outline-none min-[480px]:w-auto min-[480px]:gap-1 min-[480px]:px-2.5 sm:text-xs ${
              layout === "spread"
                ? "bg-white text-neutral-700 shadow-sm"
                : "text-white/80 hover:bg-white/15 hover:text-white"
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
              <path d="M3.5 5.5c3.5-.7 6.2.1 8.5 2.2v11c-2.3-2.1-5-2.9-8.5-2.2v-11Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="M20.5 5.5c-3.5-.7-6.2.1-8.5 2.2v11c2.3-2.1 5-2.9 8.5-2.2v-11Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            </svg>
            <span className="hidden min-[480px]:inline">펼침</span>
          </button>
        </div>
      </div>

      {/* 글자 크기 — 배속 버튼 위. "보다가 작네" 싶을 때 책 안에서 바로 키운다.
          기본값(화면 크기 따라 자동)에 배율을 곱하는 방식이라 어느 기기에서도 자연스럽다. */}
      <div className={`absolute bottom-4 left-3 z-10 sm:bottom-[4.75rem] sm:left-5 ${chromeCls}`}>
        {sizeMenu && (
          <div className="mb-2 flex flex-col overflow-hidden rounded-2xl bg-black/70 shadow-lg backdrop-blur">
            <p className="px-5 pt-2.5 text-[11px] font-extrabold text-white/50">
              글자 크기
            </p>
            {TEXT_SCALES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => applyTextScale(s.value)}
                className={`px-5 py-2.5 text-left font-bold outline-none transition ${
                  textScale === s.value ? "bg-amber-400 text-white" : "text-white/90 hover:bg-white/15"
                }`}
                style={{ fontSize: `${0.8 + (s.value - 0.85) * 0.5}rem` }}
              >
                {s.label} {textScale === s.value ? "✓" : ""}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          aria-label="글자 크기"
          onClick={() => {
            setSpeedMenu(false); // 두 메뉴가 겹쳐 뜨지 않게
            setSizeMenu((v) => !v);
          }}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45 p-0 text-sm font-extrabold text-white backdrop-blur transition hover:bg-black/60 outline-none focus:outline-none sm:h-auto sm:w-auto sm:gap-1.5 sm:px-4 sm:py-2.5"
        >
          <span aria-hidden className="leading-none">
            <span className="text-[0.7em]">가</span>
            <span className="text-[1.05em]">가</span>
          </span>
          <span className="hidden sm:inline">글자 크기</span>
        </button>
      </div>

      {/* 재생 속도 (유튜브식) — 왼쪽 아래. 눌러서 배속을 고른다. 재생 중이면 즉시 반영. */}
      <div className={`absolute bottom-4 left-[3.75rem] z-10 sm:bottom-5 sm:left-5 ${chromeCls}`}>
        {speedMenu && (
          <div className="mb-2 flex flex-col overflow-hidden rounded-2xl bg-black/70 shadow-lg backdrop-blur">
            {[0.75, 1, 1.25, 1.5, 2].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => applyRate(s)}
                className={`px-5 py-2.5 text-left text-sm font-bold outline-none transition ${
                  rate === s ? "bg-amber-400 text-white" : "text-white/90 hover:bg-white/15"
                }`}
              >
                {s}배속 {rate === s ? "✓" : ""}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          aria-label="재생 속도"
          onClick={() => {
            setSizeMenu(false); // 두 메뉴가 겹쳐 뜨지 않게
            setSpeedMenu((v) => !v);
          }}
          className="flex h-11 min-w-14 items-center justify-center rounded-full bg-black/45 px-2 text-[13px] font-extrabold text-white backdrop-blur transition hover:bg-black/60 outline-none focus:outline-none sm:h-auto sm:gap-1.5 sm:px-4 sm:py-2.5 sm:text-sm"
        >
          <svg viewBox="0 0 24 24" className="hidden h-4 w-4 sm:block" aria-hidden>
            <path d="M12 4a8 8 0 1 0 8 8" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
            <path d="M12 12l4-3" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          <span>{rate}<span className="sm:hidden">×</span><span className="hidden sm:inline">배속</span></span>
        </button>
      </div>

      {/* 손잡이 — 단추가 감춰졌을 때만 뜬다. 누르면 다시 나오고, 그 뒤로는
          읽기가 끝날 때까지 그대로 있는다(읽는 내내 깜빡이면 더 거슬린다). */}
      {chromeOff && (
        <button
          type="button"
          aria-label="조작 단추 보이기"
          onClick={() => setChromeShown(true)}
          className="absolute left-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/30 text-white/70 backdrop-blur transition hover:bg-black/50 hover:text-white outline-none focus:outline-none sm:left-4"
          style={{ top: "calc(1rem + env(safe-area-inset-top))" }}
        >
          <span aria-hidden className="text-lg leading-none">⋯</span>
        </button>
      )}

      {/* 읽어주기 — 재생 버튼임이 한눈에 보이게 ①색이 도는 원 ②흰 재생 세모(▶)
          ③평소엔 "읽어주기" 라벨을 위에 띄운다. 읽는 중엔 정지(⏸) 막대로 바뀐다. */}
      <div className="absolute bottom-3 right-3 z-10 flex flex-col items-center gap-0 sm:bottom-5 sm:right-5 sm:gap-2">
        {/* 성우 목소리를 만드는 동안 — 눌렀는데 조용하면 고장으로 오해한다(피드백 4번).
            몇 초 걸리는지까지 보여줘서 "기다리면 되는구나"를 알게 한다. */}
        {showPreparing && (
          <span className="flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1 text-xs font-extrabold text-white backdrop-blur">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 animate-spin" aria-hidden>
              <circle cx="12" cy="12" r="9" fill="none" stroke="#ffffff55" strokeWidth="3" />
              <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
            </svg>
            성우 음성을 불러오고 있어요{prepSecs > 0 ? ` (${prepSecs}초)` : ""}
          </span>
        )}
        {!reading && !ended && !preparing && (
          <span className="hidden animate-pulse rounded-full bg-black/55 px-3 py-1 text-xs font-extrabold text-white backdrop-blur sm:block">
            ▶ 눌러서 읽어주기
          </span>
        )}
        <button
          type="button"
          aria-label={reading ? "그만 읽기" : "읽어주기"}
          onClick={reading ? stopReading : startReading}
          style={reading || preparing ? undefined : { background: ui.colors.accent }}
          className={`flex h-14 w-14 items-center justify-center rounded-full text-white shadow-[0_6px_16px_rgba(0,0,0,0.4)] transition-transform hover:scale-105 sm:h-16 sm:w-16 ${
            preparing ? "bg-amber-400" : reading ? "animate-pulse bg-amber-400" : ""
          }`}
        >
          {preparing ? (
            // 준비 중 — 도는 고리. 누르면 정지되므로 버튼 자체는 그대로 살려둔다.
            <svg viewBox="0 0 24 24" className="h-8 w-8 animate-spin drop-shadow-[0_2px_2px_rgba(0,0,0,0.25)]" aria-hidden>
              <circle cx="12" cy="12" r="8.5" fill="none" stroke="#ffffff66" strokeWidth="3" />
              <path d="M20.5 12a8.5 8.5 0 0 0-8.5-8.5" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
            </svg>
          ) : reading ? (
            // 정지(⏸) — 둥근 막대 두 개. 이모지는 윈도우에서 칙칙해 직접 그린다.
            <svg viewBox="0 0 24 24" className="h-8 w-8 drop-shadow-[0_2px_2px_rgba(0,0,0,0.25)]" aria-hidden>
              <rect x="4.5" y="4" width="5.5" height="16" rx="2.75" fill="#fff" />
              <rect x="14" y="4" width="5.5" height="16" rx="2.75" fill="#fff" />
            </svg>
          ) : (
            // 재생(▶) — 오른쪽을 향한 흰 세모. 시각적 중심을 위해 살짝 오른쪽으로.
            <svg viewBox="0 0 24 24" className="h-9 w-9 drop-shadow-[0_2px_2px_rgba(0,0,0,0.25)]" aria-hidden>
              <path d="M8.5 5.5 19 12 8.5 18.5 Z" fill="#fff" />
            </svg>
          )}
        </button>
      </div>

      {/* 이야기 끝 — 그 자리에서 처음부터 다시 듣기 (서재로 나갔다 올 필요 없음). */}
      {ended && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/45 p-6 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-5 rounded-[28px] bg-white/95 px-8 py-9 text-center shadow-2xl">
            <p className="text-2xl font-extrabold text-neutral-800">이야기가 끝났어요! 🎉</p>

            {/* 다음 동화 — 끝나면 "다음 것도 보자"가 자연스럽다. 서재로 나갔다
                다시 고르게 하지 않는다. 마지막 책이면 이 버튼은 안 뜬다. */}
            {nextBook && (
              <Link
                href={`/book/${nextBook.id}`}
                style={{ background: ui.colors.accent }}
                className="flex max-w-[18rem] flex-col items-center gap-0.5 rounded-3xl px-7 py-3.5 text-white shadow-md transition-transform hover:-translate-y-0.5 active:translate-y-0"
              >
                <span className="text-base font-extrabold">▶ 다음 동화 보기</span>
                <span className="line-clamp-1 break-keep text-[13px] font-bold text-white/85">
                  {nextBook.title}
                </span>
              </Link>
            )}

            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={replayFromStart}
                style={nextBook ? undefined : { background: ui.colors.accent }}
                className={`rounded-full px-7 py-3.5 text-base font-extrabold shadow-md transition-transform hover:-translate-y-0.5 active:translate-y-0 ${
                  nextBook ? "bg-neutral-100 text-neutral-600" : "text-white"
                }`}
              >
                🔄 처음부터 다시 듣기
              </button>
              <Link
                href="/"
                className="rounded-full bg-neutral-100 px-7 py-3.5 text-base font-extrabold text-neutral-500 transition hover:bg-neutral-200"
              >
                ← 서재로
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
