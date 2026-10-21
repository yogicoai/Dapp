"use client";

/**
 * 앱을 새로 켤 때의 동화책 — '하온이의 동화 나라'(2026-10-21 사장님 "아이 이름·얼굴 + 동화책이 펼쳐지는 장면, 로그인 된 상태라면").
 * 우리 책장의 전집 표지 틀(나라마다 다르다 — theme.cover)에 명패는 아이 이름, 동그라미는 가족 캐릭터 얼굴.
 * 손님·처음 기기(아이 정보가 아직 없다)는 '동화 나라' + 우주 아이 로고.
 * 차례(phase)는 AppIntro 가 정한다 — travel 동안은 숨어서 그림을 받아 두고(다 받으면 onReady), book 에 날아오고,
 * open 에 표지가 왼쪽 모서리를 축으로 열리며 속지(고른 나라의 배경)가 보이고, dive 에 그 속지로 확 다가가 화면을 채운다.
 * 붙은 뒤에만 그린다(AppIntro 가 소개 화면이 켜졌을 때만 꺼낸다) — 그래서 이 기기의 아이 정보를 처음부터 읽어도 된다.
 */
import { useEffect, useState } from "react";
import type { FamilyPortrait } from "@/lib/family";
import { introBookTitle, introTravelLine, type IntroPhase } from "@/lib/app-intro";
import { loadChild } from "@/lib/prefs";
import type { Theme } from "@/lib/themes";

/** 얼굴 그림이 늦으면 이만큼만 기다리고 로고로 연다 — 얼굴은 늦게 와도 받는 대로 바뀐다 */
const FACE_WAIT_MS = 700;

type IntroChild = { name: string; pic: FamilyPortrait | null };

/** 이 기기에 저장된 아이 정보(계정별) — 이름과 고정 그림(없으면 그리는 중인 그림, 가족 화면 얼굴 동그라미와 같은 순서) */
function readChild(): IntroChild {
  const kid = loadChild();
  const member = kid?.family?.find((m) => m.id === "child" || m.role === "child");
  return { name: (kid?.name ?? "").trim(), pic: member?.portrait ?? member?.draft ?? null };
}

/** 한 줄 글자 폭(em) — 한글 1, 띄어쓰기 0.3, 나머지 0.6. 명패 칸에 맞는 글자 크기를 셈한다 */
function emWidth(text: string): number {
  let em = 0;
  for (const ch of text) em += ch === " " ? 0.3 : /[가-힣]/.test(ch) ? 1 : 0.6;
  return Math.max(em, 1);
}

function decoded(src: string): Promise<void> {
  const img = new Image();
  img.src = src;
  return img.decode().catch(() => {});
}

export function IntroBook({ theme, phase, onReady }: { theme: Theme; phase: IntroPhase; onReady: () => void }) {
  const [child] = useState(readChild);
  // 책 크기 — 가로 폰(높이 385)에서도 책 아래 한 줄까지 들어가게 화면 높이의 60%, 큰 화면은 330px 에서 멈춘다(표지 틀은 3:4).
  // 세로 화면은 펼친 두 쪽(책 폭 ×2)이 화면 안에 들게 폭의 45%까지만.
  // 속지로 다가갈 때(dive)는 책 한 쪽이 화면을 넉넉히 덮을 만큼 키운다
  const [size] = useState(() => {
    const w = Math.round(Math.min(Math.min(window.innerHeight * 0.6, 330) * 0.75, window.innerWidth * 0.45));
    const h = Math.round(w / 0.75);
    return { w, h, dive: Math.max(window.innerWidth / w, window.innerHeight / h) * 1.2 };
  });
  const [faceShown, setFaceShown] = useState(false);
  const cover = theme.cover;
  const title = introBookTitle(child.name);
  const circlePx = (size.w * parseFloat(cover.circleWidth)) / 100;

  useEffect(() => {
    let alive = true;
    const face = child.pic ? decoded(child.pic.url).then(() => alive && setFaceShown(true)) : Promise.resolve();
    const faceOrWait = Promise.race([face, new Promise<void>((r) => window.setTimeout(r, FACE_WAIT_MS))]);
    void Promise.all([decoded(cover.frame), decoded(theme.background), faceOrWait]).then(() => alive && onReady());
    return () => {
      alive = false;
    };
  }, [child.pic, cover.frame, theme.background, onReady]);

  const flying = phase === "travel";
  const opened = phase === "open" || phase === "dive" || phase === "leave";
  const diving = phase === "dive" || phase === "leave";
  // 열리면 표지가 왼쪽으로 넘어가 두 쪽이 되므로 반 쪽만큼 오른쪽으로 비켜 펼친 책이 가운데 오게, 다가갈 때는 속지를 가운데로
  const bookTransform = diving
    ? `translateX(0) scale(${size.dive})`
    : opened
      ? `translateX(${size.w / 2}px) scale(1)`
      : flying
        ? "translateY(14px) scale(0.72)"
        : "translateY(0) scale(1)";

  return (
    <div className="pointer-events-none flex flex-col items-center gap-5">
      <div
        className={`relative transition-[transform,opacity] motion-reduce:transition-opacity ${
          diving ? "duration-[600ms] ease-in" : "duration-[700ms] ease-out"
        } ${flying ? "opacity-0" : diving ? "opacity-0 delay-200" : "opacity-100"}`}
        style={{ width: size.w, height: size.h, transform: bookTransform, perspective: 1300 }}
      >
        {/* 속지 — 고른 나라의 배경(홈과 같은 그림). 표지가 열리면 보이고, 다가가면 화면이 된다 */}
        <div className="absolute inset-0 overflow-hidden rounded-l-[3px] rounded-r-[10px] bg-[#fbf6ea] p-[5%] shadow-[0_18px_44px_rgba(0,0,0,0.5)]">
          <div className="relative h-full w-full overflow-hidden rounded-[6px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={theme.background} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-y-0 left-0 w-[12%] bg-gradient-to-r from-black/20 to-transparent" />
          </div>
        </div>

        {/* 표지 — 왼쪽 모서리를 축으로 열린다. 앞면은 전집 표지 틀, 뒷면은 속지 종이 */}
        <div
          // 속지로 다가갈 때는 넘어간 표지(크림 종이)가 크게 번지지 않게 먼저 빠르게 뺀다
          className={`absolute inset-0 [transform-style:preserve-3d] motion-reduce:transition-none ${
            diving ? "opacity-0 transition-[transform,opacity] duration-200" : "transition-transform duration-[750ms]"
          }`}
          style={{
            transformOrigin: "left center",
            transform: opened ? "rotateY(-168deg)" : "rotateY(0deg)",
            transitionTimingFunction: "cubic-bezier(.45,.05,.25,1)",
          }}
        >
          <div className="absolute inset-0 overflow-hidden rounded-l-[3px] rounded-r-[10px] shadow-[0_18px_44px_rgba(0,0,0,0.5)] [backface-visibility:hidden]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cover.frame} alt="" className="absolute inset-0 h-full w-full" />
            {/* 책등 쪽 그늘 — 책장의 표지와 같은 느낌 */}
            <div className="absolute inset-y-0 left-0 w-[7%] bg-gradient-to-r from-black/25 to-transparent" />
            <div
              className="absolute left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center whitespace-nowrap text-center font-extrabold leading-none"
              style={{
                top: cover.titleTop,
                width: cover.titleWidth ?? "58%",
                height: cover.titleHeight ?? "9%",
                color: cover.ink,
                // 명패 칸에 한 줄로 — 칸 높이의 60%, 글이 길면 칸 너비의 90%에 맞춰 줄인다
                fontSize: Math.min(
                  ((size.h * parseFloat(cover.titleHeight ?? "9")) / 100) * 0.6,
                  ((size.w * parseFloat(cover.titleWidth ?? "58")) / 100) * 0.9 / emWidth(title),
                ),
              }}
            >
              {title}
            </div>
            <div
              className="absolute left-1/2 aspect-square -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full bg-white"
              style={{ top: cover.circleTop, width: cover.circleWidth }}
            >
              {/* 얼굴이 오기 전·없으면 우주 아이 로고 */}
              <div className={`app-intro-logo absolute inset-0 bg-cover bg-center transition-opacity duration-300 ${faceShown ? "opacity-0" : ""}`} />
              {child.pic && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={child.pic.url}
                  alt=""
                  className={`absolute left-1/2 top-[4%] max-w-none -translate-x-1/2 transition-opacity duration-300 ${faceShown ? "" : "opacity-0"}`}
                  // 전신 그림을 동그라미 폭의 1.25배로 키워 윗부분만 — 머리~어깨(가족 화면 얼굴 동그라미와 같다)
                  style={{ width: circlePx * 1.25, mixBlendMode: child.pic.opaque ? "multiply" : undefined }}
                />
              )}
            </div>
          </div>
          <div className="absolute inset-0 rounded-l-[10px] rounded-r-[3px] bg-[#fbf6ea] shadow-[inset_-10px_0_18px_rgba(0,0,0,0.08)] [backface-visibility:hidden] [transform:rotateY(180deg)]" />
        </div>
      </div>

      <p
        className={`flex items-baseline gap-0.5 text-lg font-extrabold tracking-wide text-white transition-opacity duration-300 [text-shadow:0_2px_10px_rgba(0,0,0,0.45)] ${
          flying || diving ? "opacity-0" : "opacity-100"
        }`}
      >
        {opened ? (
          <span key="arrive" className="motion-safe:animate-[intro-pop_420ms_ease-out]">
            {theme.label} 도착!
          </span>
        ) : (
          <>
            {introTravelLine(child.name)}
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
          </>
        )}
      </p>
    </div>
  );
}
