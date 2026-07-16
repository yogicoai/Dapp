"use client";

import { useEffect, useSyncExternalStore } from "react";

const SEEN_KEY = "voice-storybook:rotate-hint-seen";

// 구독할 외부 변화가 없다. 마운트 시점에 한 번 읽기만 하면 된다.
const noopSubscribe = () => () => {};

/**
 * 세로로 들고 있으면 가로를 권하는 힌트를 세션당 한 번 띄우고 스스로 사라진다.
 *
 * 막지 않는 게 핵심이다. 웹에서 화면을 잠그는 건 iOS Safari가 지원하지 않아
 * 애초에 불가능하고, 안내로 가로막으면 그냥 이탈한다. 그래서 pointer-events-none으로
 * 띄우기만 하고 비켜준다. 진짜 가로 잠금은 TWA로 스토어에 올릴 때 manifest의
 * orientation이 처리한다.
 *
 * 세로 감지와 페이드아웃은 전부 CSS가 한다. JS는 "이번 세션에 이미 봤나"만 읽는다.
 */
export function OrientationHint() {
  // 세션 기록은 브라우저에만 있다. 서버에서는 "이미 봤다"로 쳐서 아무것도 그리지 않고,
  // 마운트되면 진짜 값으로 정정된다.
  const seen = useSyncExternalStore(
    noopSubscribe,
    () => sessionStorage.getItem(SEEN_KEY) !== null,
    () => true,
  );

  useEffect(() => {
    sessionStorage.setItem(SEEN_KEY, "1");
  }, []);

  if (seen) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-50 hidden animate-[rotate-hint_3.2s_ease_forwards] flex-col items-center justify-center gap-5 bg-neutral-950/85 px-10 text-center backdrop-blur-sm portrait:flex">
      <svg
        viewBox="0 0 24 24"
        aria-hidden
        className="h-14 w-14 animate-pulse text-white/80"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="4" y="2" width="16" height="20" rx="2.5" />
        <path d="M10 18.5h4" />
        <path d="M20.5 15.5a9 9 0 0 1-3 3.6" />
        <path d="M17.5 15.4h3.2v3.2" />
      </svg>
      <p className="text-lg font-medium text-white">가로로 돌리면 더 예뻐요</p>
    </div>
  );
}
