"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Book } from "@/lib/types";
import { OrientationHint } from "./OrientationHint";

/**
 * 삽화가 아직 없을 때 까는 파스텔 배경.
 * Gemini 키가 붙으면 4:3 가로 삽화가 이 자리를 그대로 차지한다.
 */
const PLACEHOLDER_TINTS = [
  "from-sky-200 to-amber-100",
  "from-emerald-200 to-lime-100",
  "from-violet-200 to-pink-100",
  "from-amber-200 to-rose-100",
  "from-teal-200 to-sky-100",
  "from-rose-200 to-violet-100",
  "from-lime-200 to-emerald-100",
  "from-orange-200 to-amber-100",
];

const SWIPE_THRESHOLD_PX = 50;

export function BookViewer({ book }: { book: Book }) {
  const [index, setIndex] = useState(0);
  const lastIndex = book.pages.length - 1;

  const go = useCallback(
    (next: number) => setIndex(Math.min(lastIndex, Math.max(0, next))),
    [lastIndex],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(index + 1);
      else if (e.key === "ArrowLeft") go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, go]);

  const swipeOriginX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    swipeOriginX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (swipeOriginX.current === null) return;
    const dx = e.changedTouches[0].clientX - swipeOriginX.current;
    if (Math.abs(dx) > SWIPE_THRESHOLD_PX) go(index + (dx < 0 ? 1 : -1));
    swipeOriginX.current = null;
  };

  return (
    <div
      className="fixed inset-0 select-none overflow-hidden bg-neutral-950"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <OrientationHint />

      <div
        className="flex h-full transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {book.pages.map((page, i) => (
          <section key={i} className="relative h-full w-full shrink-0">
            {page.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={page.image} alt="" className="h-full w-full object-cover" />
            ) : (
              <div
                className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${
                  PLACEHOLDER_TINTS[i % PLACEHOLDER_TINTS.length]
                }`}
              >
                <span className="text-[10vw] font-bold text-black/10">{i + 1}</span>
              </div>
            )}

            {/* 삽화 위에 글이 얹히므로 하단을 어둡게 깔아 가독성을 확보한다. */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-[6%] pb-[6%] pt-[14%]">
              <p className="max-w-4xl whitespace-pre-line text-[clamp(0.95rem,2.1vw,1.6rem)] font-medium leading-relaxed text-white drop-shadow-md">
                {page.text}
              </p>
            </div>
          </section>
        ))}
      </div>

      {/* 좌우 절반을 넘김 영역으로 쓴다. 아이가 아무 데나 눌러도 넘어가야 한다. */}
      <button
        type="button"
        aria-label="이전 쪽"
        onClick={() => go(index - 1)}
        disabled={index === 0}
        className="absolute inset-y-0 left-0 w-1/2 cursor-w-resize disabled:cursor-default"
      />
      <button
        type="button"
        aria-label="다음 쪽"
        onClick={() => go(index + 1)}
        disabled={index === lastIndex}
        className="absolute inset-y-0 right-0 w-1/2 cursor-e-resize disabled:cursor-default"
      />

      <Link
        href="/"
        className="absolute left-4 top-4 rounded-full bg-black/40 px-4 py-2 text-sm text-white/90 backdrop-blur transition hover:bg-black/60"
      >
        ← 서재
      </Link>

      <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center gap-1.5">
        {book.pages.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === index ? "w-6 bg-white" : "w-1.5 bg-white/40"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
