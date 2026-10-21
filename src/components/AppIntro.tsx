"use client";

/**
 * 앱을 새로 켤 때 잠깐 — '동화 나라로 이동 중'(2026-10-21 사장님: 켜질 때 아이콘이 커졌다 깜빡이는 게 오류 같다,
 * 차라리 들어가는 과정을 잠깐 넣자 → 검은 화면보다 디자인적으로 → 아이 이름·얼굴 + 동화책이 펼쳐지는 장면).
 *  ① 밤하늘(travel) — 반짝이는 별(살짝 다가온다)·별똥별, 가운데 우주 아이(앱 아이콘)와 '동화 나라로 이동 중…'.
 *     여기까지는 서버 HTML 에 있어 첫 그림부터 보인다.
 *  ② 동화책이 날아온다(book) — 우리 책장의 전집 표지 틀에 '하온이의 동화 나라'와 가족 캐릭터 얼굴(IntroBook,
 *     로그인한 가족 — 손님은 '동화 나라'와 로고). 책 아래 '하온이의 동화 나라로 가는 중…'.
 *  ③ 홈이 진짜 화면을 그리면(lib/app-intro markHomeReady) 표지가 열리고(open) '○○나라 도착!', 속지(고른 나라의 배경)로
 *     다가가며(dive) 화면을 채운다. 홈과 같은 그림·같은 흰 베일이라 걷히면(leave) 그대로 홈이다.
 *  책 그림이 늦으면 책 없이 나라 배경으로 바로 도착(arrive)한다. 누르면 언제든 바로 걷힌다.
 * 기다림을 늘리지 않는다 — 홈이 준비되는 시간을 채우는 화면이고, 책은 최소 BOOK_MIN_MS 보이며, 홈이 늦어도 MAX_MS 에는 넘어간다.
 * 뜰지 말지는 body 맨 앞 스크립트가 첫 그림 전에 정한다(html[data-app-intro] — lib/app-shell APP_SHELL_BOOT_SCRIPT) —
 * 웹·화면 이동·다시 불러오기에는 안 뜬다. 로고는 CSS 바탕 그림, 책·나라 배경은 소개 화면이 켜졌을 때만 그린다.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { IntroBook } from "@/components/IntroBook";
import { useTheme } from "@/components/ThemeProvider";
import { markHomeReady, onHomeReady, starShadows, type IntroPhase } from "@/lib/app-intro";

const STARS_SMALL = starShadows(90, 7);
const STARS_MID = starShadows(36, 21);
const STARS_BIG = starShadows(12, 42);

/** 시각은 페이지를 열기 시작한 때부터(performance.now) — 첫 그림까지 걸린 시간도 들어 있다 */
const OPEN_AT_MS = 1700; // 표지는 아무리 빨라도 이때부터 연다
const BOOK_MIN_MS = 900; // 책이 날아와 보이는 최소 시간
const BOOK_WAIT_MS = 2600; // 홈은 준비됐는데 책 그림이 이때까지 안 오면 책 없이 도착
const MAX_MS = 5500; // 홈이 늦어도 이때는 넘어간다(홈 준비 화면의 5초 + 여유)
const OPEN_MS = 750;
const DIVE_MS = 650;
const ARRIVE_MS = 800;
const FADE_MS = 400;

const noSubscribe = () => () => {};
const introOn = () => document.documentElement.hasAttribute("data-app-intro");

export function AppIntro() {
  const { theme } = useTheme();
  const pathname = usePathname();
  // 서버 HTML·첫 붙임은 늘 꺼진 값 — 책·나라 배경은 붙은 뒤 소개 화면이 켜졌을 때만 그린다
  const active = useSyncExternalStore(noSubscribe, introOn, () => false);
  const [phase, setPhase] = useState<IntroPhase>("travel");
  const bgReady = useRef(false);
  const bookReady = useRef(false);
  const recheck = useRef<() => void>(() => {});
  const onBookReady = useCallback(() => {
    bookReady.current = true;
    recheck.current();
  }, []);

  // 첫 화면이 홈이 아닌 곳(손님 → 로그인 화면)으로 바뀌었으면 기다릴 홈이 없다
  useEffect(() => {
    if (active && pathname !== "/") markHomeReady();
  }, [active, pathname]);

  // 도착 장면에 쓸 나라 배경을 미리 받아 둔다(홈과 같은 그림 — 한 번 받으면 홈도 그대로 쓴다)
  useEffect(() => {
    if (!active) return;
    let alive = true;
    bgReady.current = false;
    const img = new Image();
    img.src = theme.background;
    void img
      .decode()
      .catch(() => {})
      .finally(() => {
        if (!alive) return;
        bgReady.current = true;
        recheck.current();
      });
    return () => {
      alive = false;
    };
  }, [active, theme.background]);

  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, Math.max(0, ms)));
    let stage: IntroPhase = "travel";
    let bookAt = 0;
    let homeReady = false;
    let loaded = document.readyState === "complete";
    const go = (next: IntroPhase) => {
      stage = next;
      setPhase(next);
    };
    const leave = () => {
      if (stage === "leave") return;
      go("leave");
      later(() => root.removeAttribute("data-app-intro"), FADE_MS);
    };
    // 책 없이 도착 — 책 그림이 늦을 때
    const arrive = () => {
      if (stage !== "travel") return;
      go("arrive");
      later(leave, ARRIVE_MS);
    };
    const open = () => {
      if (stage !== "book") return;
      go("open");
      later(() => {
        if (stage !== "open") return;
        go("dive");
        later(leave, DIVE_MS);
      }, OPEN_MS);
    };
    const check = () => {
      if (stage === "travel" && bookReady.current) {
        go("book");
        bookAt = performance.now();
      }
      if (!homeReady || !loaded || !bgReady.current) return;
      const now = performance.now();
      if (stage === "book") later(open, Math.max(OPEN_AT_MS - now, bookAt + BOOK_MIN_MS - now));
      else if (stage === "travel") later(() => (bookReady.current ? check() : arrive()), BOOK_WAIT_MS - now);
    };
    recheck.current = check;
    const onLoad = () => {
      loaded = true;
      check();
    };
    if (!loaded) window.addEventListener("load", onLoad, { once: true });
    const stopReady = onHomeReady(() => {
      homeReady = true;
      check();
    });
    later(check, 0);
    later(() => (stage === "book" ? open() : arrive()), MAX_MS - performance.now());
    root.addEventListener("click", leave, { once: true });
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      window.removeEventListener("load", onLoad);
      stopReady();
      root.removeEventListener("click", leave);
      recheck.current = () => {};
    };
  }, [active]);

  const traveling = phase === "travel";
  // 나라 배경이 화면을 채우는 때 — 책 없이 도착했거나, 책 속지로 다가가는 중
  const landed = phase === "arrive" || phase === "dive" || phase === "leave";
  // 우주 아이 로고·글자는 밤하늘과 책 없는 도착에서만(책이 오면 책이 대신한다)
  const showLogo = traveling || phase === "arrive";
  return (
    <div
      className={`app-intro fixed inset-0 z-[1000] overflow-hidden transition-opacity motion-reduce:transition-none ${
        phase === "leave" ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      style={{ transitionDuration: `${FADE_MS}ms` }}
      role="status"
      aria-label={traveling ? "동화 나라로 이동 중" : `${theme.label} 도착`}
    >
      {/* ① 밤하늘 — 별 세 겹이 따로 반짝이고, 전체가 천천히 다가온다(앞으로 날아가는 느낌) */}
      <div className="intro-sky absolute inset-0" />
      <div className="absolute inset-0 motion-safe:animate-[intro-forward_6s_ease-out_forwards]">
        <span
          className="absolute left-0 top-0 h-px w-px rounded-full motion-safe:animate-[intro-twinkle_3.2s_ease-in-out_infinite]"
          style={{ boxShadow: STARS_SMALL }}
        />
        <span
          className="absolute left-0 top-0 h-[2px] w-[2px] rounded-full motion-safe:animate-[intro-twinkle_4.1s_ease-in-out_0.6s_infinite]"
          style={{ boxShadow: STARS_MID }}
        />
        <span
          className="absolute left-0 top-0 h-[3px] w-[3px] rounded-full motion-safe:animate-[intro-twinkle_2.6s_ease-in-out_1.1s_infinite]"
          style={{ boxShadow: STARS_BIG }}
        />
      </div>
      <span className="intro-shoot absolute motion-reduce:hidden" />
      <span className="intro-shoot intro-shoot-late absolute motion-reduce:hidden" />

      {/* 고른 나라의 배경이 화면을 채운다(홈과 같은 그림·같은 흰 베일) — 책 없이 도착하면 흐릿하게 다가오며, 책 속지로 다가가면 함께 */}
      {active && (
        <div
          className={`absolute inset-0 transition-[opacity,transform,filter] ease-out motion-reduce:transform-none motion-reduce:filter-none ${
            phase === "dive" ? "duration-[650ms]" : "duration-700"
          } ${landed ? "scale-100 opacity-100 blur-0" : "scale-110 opacity-0 blur-md"}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={theme.background} alt="" className="h-full w-full object-cover" />
          {/* 흰 베일도 첫 화면과 같은 세기 — 홈 25%, 로그인·준비 화면 35% */}
          <div className={`absolute inset-0 ${pathname === "/" ? "bg-white/25" : "bg-white/35"}`} />
        </div>
      )}

      {/* ② 동화책 — 붙은 뒤 소개 화면이 켜졌을 때만. travel 동안은 숨어서 그림을 받는다 */}
      {active && phase !== "arrive" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <IntroBook theme={theme} phase={phase} onReady={onBookReady} />
        </div>
      )}

      {/* 우주 아이·글자 — 책이 오거나 걷힐 때는 먼저 빠르게 빠진다(홈·로그인 화면의 제목과 겹쳐 보이지 않게) */}
      <div
        className={`relative flex h-full w-full flex-col items-center justify-center gap-6 transition-opacity duration-300 ${
          showLogo ? "" : "opacity-0"
        }`}
      >
        <div className="app-intro-logo h-28 w-28 rounded-[26%] bg-cover bg-center shadow-[0_0_56px_rgba(150,160,255,0.5)] motion-safe:animate-[float_2.4s_ease-in-out_infinite]" />
        {phase === "arrive" ? (
          <p className="text-xl font-extrabold tracking-wide text-white [text-shadow:0_2px_10px_rgba(0,0,0,0.45)] motion-safe:animate-[intro-pop_420ms_ease-out]">
            {theme.label} 도착!
          </p>
        ) : (
          <p className="flex items-baseline gap-0.5 text-lg font-extrabold tracking-wide text-white/90">
            동화 나라로 이동 중
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                aria-hidden
                className="motion-safe:animate-[intro-dot_1.2s_ease-in-out_infinite]"
                style={{ animationDelay: `${i * 0.2}s` }}
              >
                .
              </span>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}
