"use client";

import { THEME_LIST } from "@/lib/themes";
import { ThemeIcon } from "./ThemeIcon";
import { useTheme } from "./ThemeProvider";

/** 나라(테마) 고르기. 상징 아이콘 + 이름 칩을 눌러 앱 전체 컨셉을 바꾼다. */
export function ThemePicker() {
  const { theme, setThemeId } = useTheme();

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {THEME_LIST.map((t) => {
        const active = t.id === theme.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setThemeId(t.id)}
            aria-pressed={active}
            className="flex items-center gap-1.5 rounded-full py-1.5 pl-2 pr-4 text-sm font-extrabold transition-transform hover:scale-105"
            style={
              active
                ? { background: t.colors.accent, color: "#fff" }
                : { background: "rgba(255,255,255,0.5)", color: "#444" }
            }
          >
            {/* 스티커는 흰 배경이라 흰 원 안에 넣으면 자연스럽다 */}
            <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-white text-base shadow-sm">
              <ThemeIcon value={t.icons.book} className="h-6 w-6 object-contain" />
            </span>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
