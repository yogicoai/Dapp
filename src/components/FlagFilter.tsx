"use client";

import type { Book } from "@/lib/types";
import { useTheme } from "./ThemeProvider";

/** 국기 필터. 진짜 국기 이미지를 원형으로 잘라 작은 칩으로 쓴다(public/flags). */
export const FLAGS: { lang: string; src: string; label: string }[] = [
  { lang: "ko", src: "/flags/kr.png", label: "한국어" },
  { lang: "en", src: "/flags/us.png", label: "English" },
  { lang: "ja", src: "/flags/jp.png", label: "日本語" },
];

/**
 * 언어 고르기. 테마 칩과 같은 줄에 두는 보조 컨트롤이라 작게 만든다.
 * 책이 있는 언어만 보여준다.
 */
export function FlagFilter({
  books,
  lang,
  onChange,
}: {
  books: Book[];
  lang: string;
  onChange: (lang: string) => void;
}) {
  const { theme } = useTheme();
  const available = FLAGS.filter((f) => books.some((b) => b.lang === f.lang));

  return (
    <div className="flex items-center gap-2">
      {available.map((f) => {
        const active = f.lang === lang;
        const count = books.filter((b) => b.lang === f.lang).length;
        return (
          <button
            key={f.lang}
            type="button"
            onClick={() => onChange(f.lang)}
            aria-pressed={active}
            aria-label={`${f.label} 동화 ${count}권 보기`}
            className="group relative outline-none"
          >
            <span
              className={`block overflow-hidden rounded-full border-2 transition-all duration-200 ease-out ${
                active
                  ? "h-9 w-9 border-white shadow-[0_3px_10px_rgba(0,0,0,0.25)]"
                  : "h-7 w-7 border-white/60 opacity-70 group-hover:scale-105 group-hover:opacity-100"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.src} alt="" className="h-full w-full object-cover" />
            </span>

            <span
              style={{ background: active ? theme.colors.accent : "#a3a3a3" }}
              className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full border border-white px-0.5 text-[9px] font-extrabold leading-4 text-white"
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
