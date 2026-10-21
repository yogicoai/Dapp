"use client";

/**
 * 앱을 새로 켤 때 잠깐 — '동화 나라로 이동 중'(2026-10-21 사장님: 켜질 때 아이콘이 커졌다 깜빡이는 게 오류 같다,
 * 차라리 들어가는 과정을 잠깐 넣자).
 * 크롬이 뜨고 첫 화면을 받는 동안 비는 시간을 일부러 만든 소개 화면으로 채운다. 기다림을 늘리지 않는다 —
 * 첫 화면 그림까지 다 받으면(load) 걷히고, 너무 빨리 스치지 않게 최소 MIN_MS, 늦어도 MAX_MS 에 걷힌다. 누르면 바로 걷힌다.
 * 뜰지 말지는 body 맨 앞 스크립트가 첫 그림 전에 정한다(html[data-app-intro] — lib/app-shell APP_SHELL_BOOT_SCRIPT).
 * 그래서 이 화면은 서버 HTML 에 늘 있고 CSS 로만 켜고 끈다 — 웹·화면 이동·다시 불러오기에는 안 뜬다.
 * 로고는 CSS 바탕 그림이라 소개 화면이 뜰 때만 받는다(globals.css .app-intro-logo).
 */
import { useEffect, useState } from "react";

/** 페이지를 열기 시작한 때부터(performance.now) — 첫 그림까지 걸린 시간도 들어 있어 실제로 보이는 건 이보다 짧다 */
const MIN_MS = 1500;
const MAX_MS = 4000;
const FADE_MS = 450;

export function AppIntro() {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (!root.hasAttribute("data-app-intro")) return;
    const timers: number[] = [];
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setLeaving(true);
      timers.push(window.setTimeout(() => root.removeAttribute("data-app-intro"), FADE_MS));
    };
    const afterMin = () => timers.push(window.setTimeout(finish, Math.max(0, MIN_MS - performance.now())));
    if (document.readyState === "complete") afterMin();
    else window.addEventListener("load", afterMin, { once: true });
    timers.push(window.setTimeout(finish, Math.max(0, MAX_MS - performance.now())));
    root.addEventListener("click", finish, { once: true });
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      window.removeEventListener("load", afterMin);
      root.removeEventListener("click", finish);
    };
  }, []);

  return (
    <div
      className={`app-intro fixed inset-0 z-[1000] flex-col items-center justify-center gap-6 bg-[#0a0a0a] transition-opacity duration-[450ms] motion-reduce:transition-none ${
        leaving ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      role="status"
      aria-label="동화 나라로 이동 중"
    >
      <div className="app-intro-logo h-28 w-28 rounded-[26%] bg-cover bg-center shadow-[0_0_48px_rgba(140,170,255,0.35)] motion-safe:animate-[float_2.4s_ease-in-out_infinite]" />
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
    </div>
  );
}
