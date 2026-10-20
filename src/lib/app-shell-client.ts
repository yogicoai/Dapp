"use client";

/**
 * 화면에서 '지금 안드로이드 앱 안인가'를 읽는 훅(lib/app-shell 참고).
 * 서버 HTML 과 첫 그림은 늘 "web" — 브라우저에 붙은 뒤 앱 안이면 "android" 로 바뀐다(이번 실행 동안 기억한다).
 */
import { useSyncExternalStore } from "react";
import { APP_SHELL_ANDROID, APP_SHELL_KEY, detectAppShell, type AppShell } from "@/lib/app-shell";

function readShell(): AppShell {
  let stored: string | null = null;
  try {
    stored = window.sessionStorage.getItem(APP_SHELL_KEY);
  } catch {
    /* 저장소가 막힌 브라우저 — 주소·referrer 로만 본다 */
  }
  const shell = detectAppShell({ search: window.location.search, referrer: document.referrer, stored });
  if (shell === "android" && stored !== APP_SHELL_ANDROID) {
    try {
      window.sessionStorage.setItem(APP_SHELL_KEY, APP_SHELL_ANDROID);
    } catch {
      /* 위와 같음 */
    }
  }
  return shell;
}

// 실행 중에는 바뀌지 않는 값이라 구독할 것이 없다
const noSubscribe = () => () => {};

export function useAppShell(): AppShell {
  return useSyncExternalStore(noSubscribe, readShell, () => "web");
}
