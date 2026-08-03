"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadBgmOn,
  loadBookProgress,
  loadSfxOn,
  loadTextPos,
  saveBgmOn,
  saveBookProgress,
} from "@/lib/prefs";
import { enterStoryMode, exitStoryMode } from "@/lib/story-mode";
import type { Book } from "@/lib/types";
import {
  applyPlaybackRate,
  buildPresetUtterance,
  fetchGoogleAudio,
  fetchTypecastPageAudio,
  fetchTypecastVoiceAudio,
  findPreset,
  findTypecast,
  CLIENT_TTS_ENABLED,
  GOOGLE_TTS_ENABLED,
  loadSelectedVoiceId,
  loadVoiceRate,
  saveSelectedVoiceId,
  saveVoiceRate,
  TYPECAST_VOICES,
  warmUpVoices,
  type PageAudioSegment,
} from "@/lib/voices";
import { loadParentVoices, type ParentVoice } from "@/lib/parent-voice";
import { OrientationHint } from "./OrientationHint";
import { useTheme } from "./ThemeProvider";

const SWIPE_THRESHOLD_PX = 50;

/** Web Speech 폴백용 읽기 속도(초당 글자). 경계 이벤트가 안 오는 기기에서 쓴다. */
const FALLBACK_CHARS_PER_SEC = 5.5;

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
  const [index, setIndex] = useState(0);
  const lastIndex = book.pages.length - 1;

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage 이어보기 위치 반영
    if (saved > 0 && saved <= lastIndex) setIndex(saved);
    const t = setTimeout(() => setAnimate(true), 80);
    return () => clearTimeout(t);
  }, [book.id, lastIndex]);

  // 쪽을 넘길 때마다 진행 위치를 저장한다(만들기 미리보기 id="new"는 저장 안 함).
  useEffect(() => {
    saveBookProgress(book.id, index);
  }, [book.id, index]);

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
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const [bgmOn, setBgmOn] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage는 클라 전용, 마운트 후 반영
  useEffect(() => setBgmOn(loadBgmOn()), []);

  // 재생 속도 — 뷰어 안에서 바로 바꾼다(유튜브식). 설정값을 초기값으로.
  // rateRef는 readPage가 매번 최신 속도를 읽게 하고, 재생 중이면 즉시 반영한다.
  const [rate, setRate] = useState(1);
  const rateRef = useRef(1);
  const [speedMenu, setSpeedMenu] = useState(false);
  useEffect(() => {
    const r = loadVoiceRate();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 저장된 속도를 마운트 후 반영
    setRate(r);
    rateRef.current = r;
  }, []);
  // 이야기 끝남 — 마지막 쪽 낭독이 끝나면 "다시 듣기"를 띄운다.
  const [ended, setEnded] = useState(false);

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
  const parentChoices = parentVoices.map((p) => ({
    id: `parent:${p.role}`,
    label: `${p.label} 목소리`,
    emoji: p.emoji,
  }));
  // 창작 동화는 성우 전체(16명)를 열지 않는다(2026-07-31 사장님 지시) — 바꿔 들을 때마다
  // 실시간 합성 크레딧이 나가서다. 만들 때 고른 성우 1명 + 부끄(기본) + 부모 목소리까지만.
  const bookNarr = book.narrator ? TYPECAST_VOICES.find((v) => v.id === book.narrator) : null;
  const booqoo = TYPECAST_VOICES.find((v) => v.id === "tc-booqoo");
  const voiceChoices: readonly { id: string; label: string; emoji: string }[] = isCreated
    ? [
        ...parentChoices,
        ...(bookNarr ? [bookNarr] : []),
        ...(booqoo && booqoo.id !== bookNarr?.id ? [booqoo] : []),
      ]
    : book.narrators
      ? (book.narrators
          .map((id) => TYPECAST_VOICES.find((v) => v.id === id))
          .filter(Boolean) as typeof TYPECAST_VOICES)
      : TYPECAST_VOICES;
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
    const v =
      isMine && parentVoices.length > 0
        ? `parent:${parentVoices[0].role}`
        : book.narrators?.[0] ?? book.narrator ?? safeStored;
    setVoiceId(v);
    voiceIdRef.current = v;
  }, [book.narrators, book.narrator, book.id, parentVoices]);

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
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    const el = audioRef.current;
    if (el) {
      el.onended = null;
      el.ontimeupdate = null;
      el.pause();
    }
  };

  const stopReading = useCallback(() => {
    readingRef.current = false;
    setReading(false);
    haltPlayback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      el.play().catch(() => {
        // 자동재생 차단 등 — 읽기 중단으로 처리. 단, 넘김으로 갈아타며 생긴
        // 중단 오류(pause에 의한 취소)는 새 재생을 건드리면 안 된다.
        if (run === runIdRef.current) stopReading();
      });
    };

    const bundled = page.audio ?? page.legacyAudio ?? null;
    const selectedId = voiceIdRef.current;
    const tc = findTypecast(selectedId);

    // 이 책의 추천 성우(narrators) 중 하나를 골랐으면, 그 성우로 미리 구운 파일을
    // 재생한다 — 파일 재생이라 크레딧 0·즉시. (narr-pN.mp3 → narr-{성우}-pN.mp3)
    if (book.narrators?.includes(selectedId) && page.audio) {
      playViaAudio(page.audio.replace("narr-", `narr-${selectedId}-`));
      return;
    }

    // 성우 음성 — 지문/대사 조각을 이어서 재생한다. 대사에는 감정 연기가 실려
    // 있고, 색칠은 조각의 글자 범위를 따라가서 통짜 비례보다 정확하다.
    const playSegments = (segments: PageAudioSegment[]) => {
      const el = audioRef.current ?? new Audio();
      audioRef.current = el;
      const urls = segments.map((s) => URL.createObjectURL(s.blob));
      let si = 0;
      const playNext = () => {
        if (run !== runIdRef.current || !readingRef.current || si >= segments.length) {
          urls.forEach((u) => URL.revokeObjectURL(u));
          if (run === runIdRef.current && readingRef.current) finishThen();
          return;
        }
        const seg = segments[si];
        el.src = urls[si];
        si += 1;
        applyPlaybackRate(el, rateBoost);
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
        el.onended = playNext;
        el.play().catch(() => {
          if (run === runIdRef.current) stopReading();
        });
      };
      playNext();
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
        fetchTypecastVoiceAudio(pv.voiceId, page.text)
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
    }

    if (tc) {
      // 기본 경로(현재 활성) — Typecast 감정 연기 합성. CLIENT_TTS_ENABLED=true라
      // 창작 동화·제공 동화(비번들 성우) 모두 여기로 온다. 실패하면 아래 catch가 폴백.
      fetchTypecastPageAudio(tc, page.text)
        .then((segments) => {
          // 받는 사이 정지했거나 다른 쪽으로 넘어갔으면 재생하지 않는다.
          if (run !== runIdRef.current || !readingRef.current) return;
          playSegments(segments);
        })
        .catch(() => {
          // 합성 실패·실시간 합성 꺼짐(client-tts-disabled) — 딸린 파일이 있으면
          // 그걸(무료) 쓰고, 없으면 브라우저 기계음으로 대체한다. 크레딧은 안 나간다.
          if (run !== runIdRef.current || !readingRef.current) return;
          if (bundled) playViaAudio(bundled);
          else speakWithBrowser();
        });
      return;
    }

    speakWithBrowser();

    function speakWithBrowser() {
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
      // 책장 넘김 효과음 — 실제로 쪽이 바뀔 때만. 설정에서 끌 수 있다.
      if (clamped !== index && loadSfxOn()) {
        const el = sfxRef.current ?? new Audio("/sfx/page-turn.mp3");
        sfxRef.current = el;
        el.currentTime = 0;
        el.volume = 0.5;
        el.play().catch(() => {});
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
          const renderRuns = () =>
            i === index && reading ? (
              page.text.split("").map((ch, k) => (
                <span key={k} className={k < highlight ? "text-amber-300" : "text-white"}>
                  {ch}
                </span>
              ))
            ) : (
              <span className="text-white">{page.text}</span>
            );

          // 그림 위에 얹는 오버레이 — '가로로 보기'처럼 그림이 화면을 꽉 채울 때 쓴다.
          // (세로에선 그림을 가리지 않게, 그림 아래 전용 자리에 따로 글을 놓는다.)
          const overlayText = (extra: string) => (
            <div
              className={`absolute ${
                {
                  bottom:
                    "inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-[6%] pb-[6%] pt-[14%]",
                  top: "inset-x-0 top-0 bg-gradient-to-b from-black/85 via-black/55 to-transparent px-[6%] pt-[6%] pb-[14%]",
                  center: "inset-0 flex items-center justify-center p-[6%]",
                  left: "inset-y-0 left-0 flex w-[46%] items-center pl-[5%] pr-[2%]",
                  right: "inset-y-0 right-0 flex w-[46%] items-center pr-[5%] pl-[2%]",
                }[textPos]
              } ${extra}`}
            >
              <p
                className={`font-story whitespace-pre-line break-keep text-pretty text-center text-[clamp(1.7rem,3.6vw,2.15rem)] font-semibold leading-[1.3] drop-shadow-md ${
                  textPos === "bottom" || textPos === "top"
                    ? "mx-auto w-full max-w-[max(20rem,60vw)]"
                    : "w-full rounded-3xl bg-black/55 p-5 backdrop-blur-[2px] sm:p-6"
                } ${textPos === "center" ? "max-w-[max(20rem,55vw)]" : ""}`}
              >
                {renderRuns()}
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
                  className="absolute inset-0 h-full w-full scale-110 object-cover opacity-70 blur-2xl"
                />
                {/* 무대 — 가로: 그림이 화면을 채운다. 세로: [그림+글자]를 한 덩어리로 화면
                    가운데 정렬하고, 아래 버튼 자리(6rem)는 비운다(겹침 방지).
                    틀 비율은 그림 실측(--ar) — 4:3 고정이면 와이드 그림이 '짤려' 보인다. */}
                <div className="absolute inset-0 flex items-center justify-center portrait:flex-col portrait:bottom-24">
                  <div
                    className="relative shrink-0 overflow-hidden [aspect-ratio:var(--ar)] portrait:w-full landscape:w-[min(100%,calc(var(--ar)*100dvh))]"
                    style={{ "--ar": String(imgRatios[i] ?? 4 / 3) } as React.CSSProperties}
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
                    {/* 가로 보기 전용: 그림 위 하단 밴드 — 이제 틀이 그림에 딱 맞아 밴드도 그림 하단에 붙는다. */}
                    <div className="absolute inset-x-0 bottom-0 hidden bg-gradient-to-t from-black/85 via-black/55 to-transparent px-[6%] pb-[7%] pt-[12%] landscape:block">
                      <p className="font-story mx-auto max-w-[46rem] whitespace-pre-line break-keep text-pretty text-center text-[clamp(1.35rem,2.9vw,2.05rem)] font-semibold leading-[1.35] text-white drop-shadow-md">
                        {renderRuns()}
                      </p>
                    </div>
                  </div>
                  {/* 세로 보기 전용: 그림 바로 아래 글자 칸(flex 형제라 그림에 딱 붙는다).
                      아래 버튼(재생·배속)을 안 가리게 pb를 넉넉히 둔다. */}
                  <div className="flex max-h-[42dvh] w-full shrink-0 items-center justify-center overflow-y-auto bg-gradient-to-b from-transparent via-black/40 to-black/70 px-[7%] pb-3 pt-3 landscape:hidden">
                    <p className="font-story max-h-full overflow-y-auto whitespace-pre-line break-keep text-pretty text-center text-[clamp(1.15rem,4.4vw,1.85rem)] font-semibold leading-[1.5] text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]">
                      {renderRuns()}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              // 그림 없는 쪽(글 동화)은 테마 배경 위에 글을 얹는다.
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ui.background} alt="" className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-white/20" />
                {overlayText("")}
              </>
            )}
          </section>
          );
        })}
      </div>

      {/* 넘김은 우측 상단 전용 버튼(◀ ▶) — 화면 절반 탭 방식은 캐릭터 클릭
          대사와 겹쳐 오작동해서 걷어냈다. 스와이프와 키보드 ←→는 그대로 산다. */}
      <div className="absolute right-3 top-4 z-10 flex gap-1.5 sm:right-4 sm:gap-2">
        <button
          type="button"
          aria-label="이전 쪽"
          onClick={() => go(index - 1)}
          disabled={index === 0}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/85 shadow-md backdrop-blur transition hover:bg-white disabled:opacity-35 outline-none focus:outline-none sm:h-11 sm:w-11"
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
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/85 shadow-md backdrop-blur transition hover:bg-white disabled:opacity-35 outline-none focus:outline-none sm:h-11 sm:w-11"
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
        <div className="absolute right-4 top-[3.75rem] z-20 max-h-[70dvh] w-56 overflow-y-auto rounded-2xl bg-white/95 p-2 shadow-2xl backdrop-blur">
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
        <div className="pointer-events-none absolute inset-0 z-[4] flex items-center justify-center portrait:bottom-24">
          {/* 그림 실측 비율(--ar)로 무대와 같은 크기를 유지한다 — 좌표가 그림과 맞아떨어진다. */}
          <div
            className="relative [aspect-ratio:var(--ar)] w-[min(100%,calc(var(--ar)*100dvh))]"
            style={{ "--ar": String(imgRatios[index] ?? 4 / 3) } as React.CSSProperties}
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

      {/* 캐릭터 클릭 대사 — 그림 속 캐릭터 자리를 누르면 그 캐릭터가 말한다.
          그림(4:3, contain)과 같은 규칙의 4:3 틀을 겹쳐 좌표를 맞춘다.
          넘김 영역보다 위(z-[5]), 읽어주기 버튼(z-10)보다는 아래. */}
      {book.pages[index].image && (book.pages[index].hotspots?.length ?? 0) > 0 && (
        <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center portrait:bottom-24">
          <div
            className="relative [aspect-ratio:var(--ar)] w-[min(100%,calc(var(--ar)*100dvh))]"
            style={{ "--ar": String(imgRatios[index] ?? 4 / 3) } as React.CSSProperties}
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
                        top: `${Math.min(94, Math.max(18, speaking.box[0] / 10))}%`,
                        ty: "-110%",
                      }
                    : { top: `${Math.min(78, speaking.box[2] / 10 + 2)}%`, ty: "0%" };
                const below = y.ty === "0%"; // 말풍선이 캐릭터 아래에 뜬 경우
                return (
                  // 바깥 = 위치(translate 앵커), 안쪽 = 통통 팝(scale). transform이
                  // 하나뿐이라 둘을 겹치면 서로 덮어써서 위치가 틀어진다 → 겹을 나눈다.
                  <div
                    className="absolute z-[6] w-max max-w-[min(78vw,26rem)]"
                    style={{ left: x.left, top: y.top, transform: `translate(${x.tx}, ${y.ty})` }}
                  >
                    <div className="font-story relative animate-[bubble-pop_0.35s_cubic-bezier(0.34,1.56,0.64,1)] whitespace-normal break-keep rounded-[1.4rem] bg-white px-6 py-3.5 text-center text-[clamp(1.35rem,3vw,2.1rem)] font-bold leading-snug text-neutral-800 shadow-[0_8px_24px_rgba(0,0,0,0.22)]">
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

      <div className="absolute left-3 top-4 z-10 flex gap-1.5 sm:left-4 sm:gap-2">
        <Link
          href="/"
          className="rounded-full bg-black/40 px-3 py-2 text-sm text-white/90 backdrop-blur transition hover:bg-black/60 sm:px-4"
        >
          ← 서재
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
      </div>

      {/* 재생 속도 (유튜브식) — 왼쪽 아래. 눌러서 배속을 고른다. 재생 중이면 즉시 반영. */}
      <div className="absolute bottom-5 left-5 z-10">
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
          onClick={() => setSpeedMenu((v) => !v)}
          className="flex items-center gap-1.5 rounded-full bg-black/45 px-4 py-2.5 text-sm font-extrabold text-white backdrop-blur transition hover:bg-black/60 outline-none focus:outline-none"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
            <path d="M12 4a8 8 0 1 0 8 8" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
            <path d="M12 12l4-3" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          {rate}배속
        </button>
      </div>

      {/* 읽어주기 — 재생 버튼임이 한눈에 보이게 ①색이 도는 원 ②흰 재생 세모(▶)
          ③평소엔 "읽어주기" 라벨을 위에 띄운다. 읽는 중엔 정지(⏸) 막대로 바뀐다. */}
      <div className="absolute bottom-5 right-5 z-10 flex flex-col items-center gap-2">
        {!reading && !ended && (
          <span className="animate-pulse rounded-full bg-black/55 px-3 py-1 text-xs font-extrabold text-white backdrop-blur">
            ▶ 눌러서 읽어주기
          </span>
        )}
        <button
          type="button"
          aria-label={reading ? "그만 읽기" : "읽어주기"}
          onClick={reading ? stopReading : startReading}
          style={reading ? undefined : { background: ui.colors.accent }}
          className={`flex h-16 w-16 items-center justify-center rounded-full text-white shadow-[0_6px_16px_rgba(0,0,0,0.4)] transition-transform hover:scale-105 ${
            reading ? "animate-pulse bg-amber-400" : ""
          }`}
        >
          {reading ? (
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
            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={replayFromStart}
                style={{ background: ui.colors.accent }}
                className="rounded-full px-7 py-3.5 text-base font-extrabold text-white shadow-md transition-transform hover:-translate-y-0.5 active:translate-y-0"
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
