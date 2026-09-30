"use client";

import { useEffect } from "react";

/**
 * 팝업이 떠 있는 동안 뒤 화면이 움직이지 않게 잠근다(사장님 2026-09-30 "팝업이 열리면 배경이 안 움직이게").
 *
 * - 몸통을 그 자리에 고정한다(position:fixed + top:-스크롤 자리). overflow:hidden 만으로는 아이폰·아이패드
 *   사파리에서 손가락으로 쓸면 뒤 화면이 계속 밀린다.
 * - 여러 팝업이 겹쳐도 잠금은 하나 — 세어 두었다가 마지막 팝업이 닫힐 때 원래 값과 스크롤 자리를 되돌린다.
 *   원래 값은 첫 잠금 때 한 번만 적는다(겹마다 적으면 '잠긴 값'을 원래 값으로 적어 두었다가 페이지가 멈춘 채 남는다).
 * - 팝업이 열린 채 다른 페이지로 넘어갔으면 스크롤 자리는 되돌리지 않는다(새 페이지가 엉뚱한 자리로 튀지 않게).
 * - 팝업 안쪽 스크롤은 그대로 된다 — 팝업 쪽에 overscroll-contain 을 두면 끝에서 뒤로 번지지 않는다.
 */

const BODY_KEYS = ["position", "top", "left", "right", "width", "overflow"] as const;
const HTML_KEYS = ["overflow", "overscrollBehavior", "scrollBehavior"] as const;

type Styles = Record<string, string>;
type Saved = { y: number; path: string; body: Styles; html: Styles };

let count = 0;
let saved: Saved | null = null;

function pick(style: CSSStyleDeclaration, keys: readonly string[]): Styles {
  const out: Styles = {};
  for (const k of keys) out[k] = String((style as unknown as Styles)[k] ?? "");
  return out;
}

function put(style: CSSStyleDeclaration, values: Styles): void {
  for (const [k, v] of Object.entries(values)) (style as unknown as Styles)[k] = v;
}

/** 잠그고, 풀 함수를 돌려준다. 풀 함수는 여러 번 불러도 한 번만 푼다. 브라우저가 아니면 아무것도 안 한다. */
export function lockScroll(): () => void {
  if (typeof document === "undefined" || typeof window === "undefined") return () => {};
  const body = document.body.style;
  const html = document.documentElement.style;
  if (count === 0) {
    const y = window.scrollY || 0;
    saved = { y, path: window.location?.pathname ?? "", body: pick(body, BODY_KEYS), html: pick(html, HTML_KEYS) };
    put(body, { position: "fixed", top: `-${y}px`, left: "0", right: "0", width: "100%", overflow: "hidden" });
    put(html, { overflow: "hidden", overscrollBehavior: "none" });
  }
  count += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    count = Math.max(0, count - 1);
    if (count > 0 || !saved) return;
    const s = saved;
    saved = null;
    put(body, s.body);
    put(html, s.html);
    if ((window.location?.pathname ?? "") !== s.path) return;
    // 되돌린 자리로 곧장 — 부드러운 스크롤이면 위에서 굴러 내려오는 게 보인다.
    html.scrollBehavior = "auto";
    window.scrollTo(0, s.y);
    html.scrollBehavior = s.html.scrollBehavior;
  };
}

/** 팝업 컴포넌트 안에서 — active 인 동안(기본: 떠 있는 동안) 뒤 화면을 잠근다. */
export function useScrollLock(active = true): void {
  useEffect(() => (active ? lockScroll() : undefined), [active]);
}
