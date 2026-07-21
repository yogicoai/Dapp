"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadTextPos } from "@/lib/prefs";
import { enterStoryMode, exitStoryMode } from "@/lib/story-mode";
import type { Book } from "@/lib/types";
import {
  buildPresetUtterance,
  fetchTypecastAudio,
  findPreset,
  findTypecast,
  loadSelectedVoiceId,
  loadVoiceRate,
  warmUpVoices,
} from "@/lib/voices";
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
};

export function BookViewer({ book }: { book: Book }) {
  const router = useRouter();
  // 그림 없는 쪽의 배경으로 쓴다 — 글 동화도 테마(동화나라) 안에서 읽힌다.
  const { theme: ui } = useTheme();
  // 글자 위치(위/아래) — 설정에서 고른다. 뷰어는 열 때마다 새로 읽으면 충분하다.
  const [textPos] = useState(loadTextPos);
  const [index, setIndex] = useState(0);
  const lastIndex = book.pages.length - 1;

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

  // 캐릭터 대사 — 본문 낭독과 별도 채널이라 낭독 중에도 짧게 겹쳐 나온다.
  // speaking: 지금 말하는 캐릭터 — 말풍선과 반짝임 표시용. 소리가 끝나면 사라진다.
  const sayRef = useRef<HTMLAudioElement | null>(null);
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
    setSpeaking({ page, label: h.label, line: h.line, box: h.box });
    el.onended = () => setSpeaking(null);
    el.onerror = () => setSpeaking(null);
    el.play().catch(() => setSpeaking(null));
  };

  /** 소리만 멈춘다 — 읽기 모드는 유지. 넘겨서 이어 읽을 때 쓴다. */
  const haltPlayback = () => {
    runIdRef.current++;
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
      }
    };

    // 설정에서 고른 읽기 속도 — TTS와 mp3 재생 모두에 적용한다.
    const rateBoost = loadVoiceRate();

    // mp3든 성우 음성이든 오디오 재생은 전부 이 길 — 진행률 비례로 색을 채운다.
    const playViaAudio = (audioSrc: string) => {
      const el = audioRef.current ?? new Audio();
      audioRef.current = el;
      el.src = audioSrc;
      el.playbackRate = rateBoost;
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

    // 설정에서 고른 목소리가 "모든 책"을 읽는다 — 전래동화 같은 제공 책도.
    // 책에 딸려 온 내장 나레이션(mp3)은 ①고른 성우가 그 책의 기본 나레이터와
    // 같을 때(즉시 재생·크레딧 0) ②성우 음성을 못 받을 때(오프라인 등)
    // ③목소리를 따로 고르지 않은 기본 상태일 때만 쓴다.
    const bundled = page.audio ?? page.legacyAudio ?? null;
    const selectedId = loadSelectedVoiceId();
    const tc = findTypecast(selectedId);

    if (tc) {
      if (bundled && book.narrator === tc.id) {
        playViaAudio(bundled);
        return;
      }
      fetchTypecastAudio(tc, page.text)
        .then((blob) => {
          // 받는 사이 정지했거나 다른 쪽으로 넘어갔으면 재생하지 않는다.
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

    if (bundled && selectedId === "basic") {
      // 기본 상태(목소리 미지정) — 책에 딸린 나레이션이 브라우저 기계음보다 낫다.
      playViaAudio(bundled);
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
      const preset = findPreset(loadSelectedVoiceId()) ?? findPreset("basic")!;
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
        elapsed += 0.25;
        // 프리셋·음성에 따라 과장된 실제 말하기 속도(u.rate) 기준으로 추정한다.
        setHighlight(
          Math.min(total, Math.round(elapsed * FALLBACK_CHARS_PER_SEC * u.rate)),
        );
      }, 250);
    }
  }

  const startReading = () => {
    readingRef.current = true;
    setReading(true);
    readPage(index);
  };

  // 사용자가 직접 넘기면: 읽는 중이 아니면 그냥 이동, 읽는 중이면 멈추지 않고
  // 넘어간 쪽을 바로 이어서 읽는다 — 아이가 넘겨도 이야기가 계속 따라온다.
  const go = useCallback(
    (next: number) => {
      const clamped = Math.min(lastIndex, Math.max(0, next));
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
  useEffect(() => () => exitStoryMode(), []);

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
        {book.pages.map((page, i) => (
          <section
            key={i}
            // bg 불투명 필수 — 블러 배경이 반투명(70%)이라 바탕이 비치면
            // 아래 깔린 다음 쪽의 글자가 유령처럼 새어 보인다.
            className="absolute inset-0 h-full w-full bg-neutral-950"
            style={{
              transformOrigin: "left bottom",
              transform:
                i < index ? "translateX(-118%) rotate(-7deg)" : "translateX(0) rotate(0deg)",
              transition: "transform 650ms cubic-bezier(0.33, 0.02, 0.2, 1)",
              // 안 넘긴 쪽은 현재 쪽이 맨 위, 넘긴 쪽은 넘어가는 동안 그 위에 뜬다
              zIndex: i < index ? book.pages.length + i : book.pages.length - i,
              boxShadow: "0 0 44px rgba(0,0,0,0.45)",
            }}
          >
            {page.image ? (
              <>
                {/*
                  비율이 화면과 다른 그림(기존 샘플은 3:4 세로)도 잘리지 않게:
                  뒤에 블러로 꽉 채우고, 앞에 원본을 그대로 담는다.
                  4:3 가로 그림이면 앞 레이어가 화면을 거의 꽉 채워 블러는 안 보인다.
                */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={page.image}
                  alt=""
                  aria-hidden
                  className="absolute inset-0 h-full w-full scale-110 object-cover opacity-70 blur-2xl"
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={page.image}
                  alt=""
                  className="relative h-full w-full object-contain"
                />
              </>
            ) : (
              // 그림 없는 쪽(글 동화)은 테마 배경을 깐다 — 게시판이 아니라
              // "동화나라 안에서 읽는" 느낌을 그대로 가져간다.
              // 원색이 너무 세면 글이 묻혀서 흰 베일을 살짝 얹는다.
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ui.background} alt="" className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-white/20" />
              </>
            )}

            {/* 삽화 위에 글이 얹히므로 글 뒤를 어둡게 깔아 가독성을 확보한다.
                위치는 설정에서 고른다(아래·위·가운데·왼쪽·오른쪽) — 늘 하단이면
                발밑 장면이 계속 가려진다. 아래·위는 가장자리 그라데이션, 나머지는
                반투명 판. 글 덩어리는 화면의 60%를 넘지 않게 모은다 — 문장이
                화면 끝까지 퍼지면 눈이 줄을 잃는다. 폰에서는 최소 폭을 지킨다. */}
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
              }`}
            >
              {/* break-keep: 한국어를 단어 단위로만 줄바꿈 ("물고서 / 요." 방지),
                  text-pretty: 마지막 줄에 글자 몇 개만 남는 외톨이 줄을 피한다. */}
              <p
                className={`whitespace-pre-line break-keep text-pretty text-center text-[clamp(0.95rem,2.1vw,1.6rem)] font-medium leading-relaxed drop-shadow-md ${
                  textPos === "bottom" || textPos === "top"
                    ? "mx-auto w-full max-w-[max(20rem,60vw)]"
                    : // 떠 있는 판 — 그라데이션이 없으니 판 자체가 가독성을 만든다.
                      "w-full rounded-3xl bg-black/55 p-5 backdrop-blur-[2px] sm:p-6"
                } ${textPos === "center" ? "max-w-[max(20rem,55vw)]" : ""}`}
              >
                {i === index && reading
                  ? // 읽는 중 — 읽힌 글자는 노란색, 아직인 글자는 흰색 (노래방 방식)
                    page.text.split("").map((ch, k) => (
                      <span
                        key={k}
                        className={
                          k < highlight ? "text-amber-300" : "text-white"
                        }
                      >
                        {ch}
                      </span>
                    ))
                  : <span className="text-white">{page.text}</span>}
              </p>
            </div>
          </section>
        ))}
      </div>

      {/* 넘김은 우측 상단 전용 버튼(◀ ▶) — 화면 절반 탭 방식은 캐릭터 클릭
          대사와 겹쳐 오작동해서 걷어냈다. 스와이프와 키보드 ←→는 그대로 산다. */}
      <div className="absolute right-4 top-4 z-10 flex gap-2">
        <button
          type="button"
          aria-label="이전 쪽"
          onClick={() => go(index - 1)}
          disabled={index === 0}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/85 shadow-md backdrop-blur transition hover:bg-white disabled:opacity-35 outline-none focus:outline-none"
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
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/85 shadow-md backdrop-blur transition hover:bg-white disabled:opacity-35 outline-none focus:outline-none"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
            <path d="M9.5 5.5 16 12l-6.5 6.5" fill="none" stroke="#404040" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* 캐릭터 클릭 대사 — 그림 속 캐릭터 자리를 누르면 그 캐릭터가 말한다.
          그림(4:3, contain)과 같은 규칙의 4:3 틀을 겹쳐 좌표를 맞춘다.
          넘김 영역보다 위(z-[5]), 읽어주기 버튼(z-10)보다는 아래. */}
      {book.pages[index].image && (book.pages[index].hotspots?.length ?? 0) > 0 && (
        <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center">
          <div className="relative aspect-[4/3] h-full max-w-full">
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
                박스가 화면 위쪽에 붙어 있으면 아래에 띄운다. */}
            {speaking && speaking.page === index && (
              <div
                className="absolute z-[6] max-w-[46%] -translate-x-1/2 rounded-2xl bg-white/95 px-3.5 py-2 text-center text-[clamp(0.8rem,1.6vw,1.05rem)] font-bold leading-snug text-neutral-800 shadow-lg"
                style={{
                  left: `${Math.min(78, Math.max(22, (speaking.box[1] + speaking.box[3]) / 20))}%`,
                  ...(speaking.box[0] > 150
                    ? { top: `${speaking.box[0] / 10}%`, transform: "translate(-50%, -110%)" }
                    : { top: `${speaking.box[2] / 10 + 2}%`, transform: "translate(-50%, 0)" }),
                }}
              >
                {speaking.line}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="absolute left-4 top-4 z-10 flex gap-2">
        <Link
          href="/"
          className="rounded-full bg-black/40 px-4 py-2 text-sm text-white/90 backdrop-blur transition hover:bg-black/60"
        >
          ← 서재
        </Link>
        {/* 가로로 보기 — 클릭(제스처) 안에서 전체화면 + 가로 고정을 요청한다.
            미지원 기기는 조용히 무시되고 회전 안내 힌트가 대신한다. */}
        <button
          type="button"
          onClick={() => (storyMode ? exitStoryMode() : enterStoryMode())}
          className="rounded-full bg-black/40 px-4 py-2 text-sm text-white/90 backdrop-blur transition hover:bg-black/60 outline-none focus:outline-none"
        >
          {storyMode ? "원래대로" : "⛶ 가로로 보기"}
        </button>
      </div>

      {/* 읽어주기 — 넘김 영역보다 위에 떠 있는 버튼 */}
      <button
        type="button"
        aria-label={reading ? "그만 읽기" : "읽어주기"}
        onClick={reading ? stopReading : startReading}
        className={`absolute bottom-5 right-5 z-10 flex h-16 w-16 items-center justify-center overflow-hidden rounded-full shadow-[0_6px_16px_rgba(0,0,0,0.4)] transition-transform hover:scale-105 ${
          reading ? "animate-pulse bg-amber-400" : "bg-white"
        }`}
      >
        {reading ? (
          // 이모지(⏸️)는 윈도우에서 칙칙한 파란 사각형으로 나온다 — 직접 그린
          // 둥근 막대 두 개가 어느 기기에서든 밝고 또렷하다.
          <svg viewBox="0 0 24 24" className="h-9 w-9 drop-shadow-[0_2px_2px_rgba(0,0,0,0.25)]" aria-hidden>
            <rect x="4.5" y="4" width="5.5" height="16" rx="2.75" fill="#fff" />
            <rect x="14" y="4" width="5.5" height="16" rx="2.75" fill="#fff" />
          </svg>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/icons/func-speaker.webp" alt="" className="h-12 w-12 object-contain" />
        )}
      </button>
    </div>
  );
}
