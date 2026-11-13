"use client";

import { useEffect } from "react";

/**
 * PC·트랙패드 확대 막기(사장님 2026-11-13 "확대랑 마우스 왼쪽 되는 것 때문에 가끔 오류") — 웹·앱 모두.
 * 손가락 확대는 globals.css 의 html touch-action 이 막고, 여기서는 그 밖의 길을 막는다.
 *  · Ctrl(맥은 ⌘) + 휠 — 크롬은 트랙패드 두 손가락 오므리기도 ctrlKey 가 붙은 휠로 보낸다
 *  · Ctrl/⌘ + '+' '-' '=' '0' — 키보드 확대·축소·되돌리기
 *  · gesturestart — 아이폰 사파리의 두 손가락 확대(user-scalable=no 를 무시한다)
 * 화면 크기에 맞춰 짜인 동화 무대·가족 사진이 확대되면 위치가 어긋나 눌러지는 곳이 틀어졌다.
 */
export function ZoomLock() {
  useEffect(() => {
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ["+", "-", "=", "0", "_"].includes(e.key)) e.preventDefault();
    };
    const gesture = (e: Event) => e.preventDefault();
    window.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("keydown", key);
    document.addEventListener("gesturestart", gesture);
    return () => {
      window.removeEventListener("wheel", wheel);
      window.removeEventListener("keydown", key);
      document.removeEventListener("gesturestart", gesture);
    };
  }, []);
  return null;
}
