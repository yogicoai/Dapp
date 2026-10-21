"use client";

/**
 * 앱을 새로 켤 때 잠깐 — '동화 나라로 이동 중'(2026-10-21 사장님: 켜질 때 아이콘이 커졌다 깜빡이는 게 오류 같다,
 * 차라리 들어가는 과정을 잠깐 넣자 → 검은 화면보다 디자인적으로 뭐 더).
 *  ① 밤하늘을 날아간다 — 반짝이는 별(살짝 다가온다)·별똥별, 가운데 우주 아이(앱 아이콘)와 '동화 나라로 이동 중…'
 *  ② 홈이 진짜 화면을 그리면(lib/app-intro markHomeReady) 도착한다 — 고른 나라의 배경이 흐릿하게 다가오며 선명해지고
 *     '○○나라 도착!'. 홈과 같은 그림·같은 흰 베일이라 걷히면 그대로 홈이다(홈의 준비 화면이 한 번 더 끼지 않는다).
 *     로그인 안 한 손님은 홈이 로그인 화면으로 보내므로, 첫 화면이 홈이 아닌 곳으로 바뀌면 그 화면이 뜬 것으로 본다.
 *  ③ 걷힌다. 누르면 언제든 바로 걷힌다.
 * 기다림을 늘리지 않는다 — 홈이 준비되는 시간을 채우는 화면이고, 너무 빨리 스치지 않게 TRAVEL_MIN_MS, 홈이 늦어도
 * TRAVEL_MAX_MS 에는 도착한다(홈 준비 화면의 5초와 같다).
 * 뜰지 말지는 body 맨 앞 스크립트가 첫 그림 전에 정한다(html[data-app-intro] — lib/app-shell APP_SHELL_BOOT_SCRIPT).
 * 그래서 밤하늘·로고·글자는 서버 HTML 에 늘 있고 CSS 로만 켜고 끈다 — 웹·화면 이동·다시 불러오기에는 안 뜬다.
 * 로고는 CSS 바탕 그림, 나라 배경은 소개 화면이 켜졌을 때만 그려 — 웹 손님은 아무것도 더 받지 않는다.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { markHomeReady, onHomeReady, starShadows } from "@/lib/app-intro";

const STARS_SMALL = starShadows(90, 7);
const STARS_MID = starShadows(36, 21);
const STARS_BIG = starShadows(12, 42);

/** 페이지를 열기 시작한 때부터(performance.now) — 첫 그림까지 걸린 시간도 들어 있어 실제로 보이는 건 이보다 짧다 */
const TRAVEL_MIN_MS = 1300;
const TRAVEL_MAX_MS = 5000;
const ARRIVE_MS = 800;
const FADE_MS = 450;

type Phase = "travel" | "arrive" | "leave";

const noSubscribe = () => () => {};
const introOn = () => document.documentElement.hasAttribute("data-app-intro");

export function AppIntro() {
  const { theme } = useTheme();
  const pathname = usePathname();
  // 서버 HTML·첫 붙임은 늘 꺼진 값 — 나라 배경 그림은 붙은 뒤 소개 화면이 켜졌을 때만 그린다
  const active = useSyncExternalStore(noSubscribe, introOn, () => false);
  const [phase, setPhase] = useState<Phase>("travel");
  const bgReady = useRef(false);
  const recheck = useRef<() => void>(() => {});

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
    let stage: Phase = "travel";
    let homeReady = false;
    let loaded = document.readyState === "complete";
    const leave = () => {
      if (stage === "leave") return;
      stage = "leave";
      setPhase("leave");
      timers.push(window.setTimeout(() => root.removeAttribute("data-app-intro"), FADE_MS));
    };
    const arrive = () => {
      if (stage !== "travel") return;
      stage = "arrive";
      setPhase("arrive");
      timers.push(window.setTimeout(leave, ARRIVE_MS));
    };
    const check = () => {
      if (stage !== "travel" || !homeReady || !loaded || !bgReady.current) return;
      timers.push(window.setTimeout(arrive, Math.max(0, TRAVEL_MIN_MS - performance.now())));
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
    check();
    timers.push(window.setTimeout(arrive, Math.max(0, TRAVEL_MAX_MS - performance.now())));
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
  return (
    <div
      className={`app-intro fixed inset-0 z-[1000] overflow-hidden transition-opacity duration-[450ms] motion-reduce:transition-none ${
        phase === "leave" ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
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

      {/* ② 도착 — 고른 나라의 배경이 흐릿하게 다가오며 선명해진다(홈과 같은 그림·같은 흰 베일) */}
      {active && (
        <div
          className={`absolute inset-0 transition-[opacity,transform,filter] duration-700 ease-out motion-reduce:transform-none motion-reduce:filter-none ${
            traveling ? "scale-110 opacity-0 blur-md" : "scale-100 opacity-100 blur-0"
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={theme.background} alt="" className="h-full w-full object-cover" />
          {/* 흰 베일도 첫 화면과 같은 세기 — 홈 25%, 로그인·준비 화면 35% */}
          <div className={`absolute inset-0 ${pathname === "/" ? "bg-white/25" : "bg-white/35"}`} />
        </div>
      )}

      {/* 걷힐 때 로고·글자는 먼저 빠르게 빠진다 — 배경만 홈으로 이어져, 홈·로그인 화면의 제목과 겹쳐 보이지 않게 */}
      <div
        className={`relative flex h-full w-full flex-col items-center justify-center gap-6 transition-opacity duration-200 ${
          phase === "leave" ? "opacity-0" : ""
        }`}
      >
        <div className="app-intro-logo h-28 w-28 rounded-[26%] bg-cover bg-center shadow-[0_0_56px_rgba(150,160,255,0.5)] motion-safe:animate-[float_2.4s_ease-in-out_infinite]" />
        {traveling ? (
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
        ) : (
          <p className="text-xl font-extrabold tracking-wide text-white [text-shadow:0_2px_10px_rgba(0,0,0,0.45)] motion-safe:animate-[intro-pop_420ms_ease-out]">
            {theme.label} 도착!
          </p>
        )}
      </div>
    </div>
  );
}
