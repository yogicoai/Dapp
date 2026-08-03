"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import { acctKey } from "@/lib/supabase";
import {
  DEFAULT_THEME,
  READY_THEME_IDS,
  THEMES,
  type Theme,
  type ThemeId,
} from "@/lib/themes";

const STORE_KEY = "voice-storybook:theme";

type Ctx = { theme: Theme; setThemeId: (id: ThemeId) => void };
const ThemeContext = createContext<Ctx | null>(null);

/*
 * localStorage를 "진짜 외부 스토어"로 다룬다 (useSyncExternalStore).
 *
 * 이렇게 한 이유 둘:
 * · 서버 스냅샷은 항상 기본 테마 → 서버 HTML과 첫 클라이언트 렌더가 일치해서
 *   hydration 오류가 없다 (저장된 테마가 기본과 다른 브라우저에서 나던 문제).
 * · 이펙트에서 setState로 되읽는 패턴은 React 컴파일러 규칙에 걸린다 — 구독
 *   방식은 규칙도 통과하고, 다른 탭에서 바꿔도(storage 이벤트) 따라온다.
 */
const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    // 키가 계정별(`...:회원id`)로 나뉘어 있어 접두사로 본다.
    if (e.key && e.key.startsWith(STORE_KEY)) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function emit(): void {
  listeners.forEach((cb) => cb());
}

/**
 * 저장된 테마를 읽는다. 아직 에셋이 없어 꺼둔 테마(READY 밖)가 저장돼 있으면
 * 기본으로 되돌린다.
 */
function readStored(): ThemeId {
  // 나라(테마)도 계정별로 남는다 — 같은 기기에서 다른 아이디로 들어가면 그 계정의 나라로.
  const v = window.localStorage.getItem(acctKey(STORE_KEY)) as ThemeId | null;
  return v && READY_THEME_IDS.includes(v) ? v : DEFAULT_THEME;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const id = useSyncExternalStore(subscribe, readStored, () => DEFAULT_THEME);

  const setThemeId = (next: ThemeId) => {
    window.localStorage.setItem(acctKey(STORE_KEY), next);
    emit();
  };

  return (
    <ThemeContext.Provider value={{ theme: THEMES[id], setThemeId }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): Ctx {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme는 ThemeProvider 안에서만 쓸 수 있습니다.");
  return ctx;
}
