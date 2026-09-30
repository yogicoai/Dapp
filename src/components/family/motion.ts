"use client";

/**
 * 작은 움직임(폴짝·연필 끄적·시트 올라오기)을 CSS 파일 없이 Web Animations 로 준다.
 * globals.css 는 다른 화면도 쓰는 공용이라 여기서 keyframes 를 더하지 않는다.
 * 움직임 줄이기(prefers-reduced-motion)를 켠 기기에서는 아무것도 하지 않는다.
 */

import { useEffect, useSyncExternalStore, type RefObject } from "react";

export function reducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const REDUCE = "(prefers-reduced-motion: reduce)";
function onReduceChange(cb: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(REDUCE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
/** 움직임 줄이기 설정을 따라가는 값 — 서버 그리기·첫 그리기에서는 true(움직이지 않는 쪽)라 화면이 어긋나지 않는다. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(onReduceChange, reducedMotion, () => true);
}

/** 한 번 폴짝 — 단체 사진에서 사람을 눌렀을 때 */
export function hop(el: Element | null): void {
  if (!el || reducedMotion() || typeof (el as HTMLElement).animate !== "function") return;
  (el as HTMLElement).animate(
    [
      { transform: "translateY(0) scale(1, 1)" },
      { transform: "translateY(2%) scale(1.04, .96)", offset: 0.15 },
      { transform: "translateY(-14%) scale(.98, 1.03)", offset: 0.5 },
      { transform: "translateY(0) scale(1.02, .98)", offset: 0.85 },
      { transform: "translateY(0) scale(1, 1)" },
    ],
    { duration: 520, easing: "ease-out" },
  );
}

/** 떠 있는 동안 계속 도는 움직임 */
export function useLoop(ref: RefObject<HTMLElement | null>, keyframes: Keyframe[], duration: number, on = true): void {
  // keyframes 는 부르는 쪽이 모듈 상수로 넘긴다(렌더마다 새 배열이면 애니메이션이 다시 시작된다).
  useEffect(() => {
    const el = ref.current;
    if (!on || !el || reducedMotion() || typeof el.animate !== "function") return;
    const a = el.animate(keyframes, { duration, iterations: Infinity, easing: "ease-in-out" });
    return () => a.cancel();
  }, [ref, keyframes, duration, on]);
}

/** 연필이 끄적끄적 */
export const SCRIBBLE: Keyframe[] = [
  { transform: "rotate(18deg) translate(0, 0)" },
  { transform: "rotate(26deg) translate(-6px, 4px)" },
  { transform: "rotate(18deg) translate(0, 0)" },
];

/** 마스코트 둥실 */
export const FLOAT: Keyframe[] = [
  { transform: "translateY(0)" },
  { transform: "translateY(-8px)" },
  { transform: "translateY(0)" },
];

/** 물감이 번지듯 밝았다 흐렸다 */
export const WASH: Keyframe[] = [{ opacity: 0.25 }, { opacity: 0.7 }, { opacity: 0.25 }];

/** 처음 나타날 때 한 번 — 시트가 아래에서 올라온다 */
export function useEnter(ref: RefObject<HTMLElement | null>, from: Keyframe, duration = 220): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion() || typeof el.animate !== "function") return;
    el.animate([from, { transform: "none", opacity: 1 }], { duration, easing: "cubic-bezier(.2,.8,.3,1)" });
    // 처음 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
