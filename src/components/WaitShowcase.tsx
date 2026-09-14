"use client";

import { useEffect, useRef } from "react";
import type { ShowcaseBook } from "@/lib/waiting";

/**
 * 기다리는 동안 볼 제공 동화 표지 줄 — 옆으로 넘겨 보고, 누르면 그 책을 연다.
 *
 * 왜: 대본 2분·그림 3~5분을 빈 화면으로 기다리면 길다. 잠자리에서 아이와 같이 있으니
 * 그 사이 전래동화·세계명작 한 권을 들으면 기다림이 이야기 시간이 된다.
 *
 * ⚠ 누르면 다른 페이지로 가지 않는다(onOpen 으로 알릴 뿐). 만들기 화면을 떠나면
 *   대본·그림 요청이 끊기므로, 만들기 화면이 제 위에 책을 띄운다.
 */
export function WaitShowcase({
  books,
  onOpen,
  tone,
}: {
  books: ShowcaseBook[];
  onOpen: (id: string) => void;
  /** dark — 어두운 기다림 막 위(흰 글씨) / light — 흰 카드 안(회색 글씨) */
  tone: "dark" | "light";
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  /*
   * 저절로 한 칸씩 넘긴다 — 가만히 있어도 "넘겨 볼 수 있다"가 보이게.
   * 부모가 한 번이라도 만지면 멈춘다(보고 있는 표지가 달아나지 않게).
   * 움직임 줄이기를 켠 기기에서는 넘기지 않는다.
   */
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || books.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let stopped = false;
    const stop = () => {
      stopped = true;
    };
    el.addEventListener("pointerdown", stop);
    el.addEventListener("touchstart", stop, { passive: true });
    el.addEventListener("wheel", stop, { passive: true });
    el.addEventListener("focusin", stop);
    const id = window.setInterval(() => {
      if (stopped || document.hidden) return;
      const card = el.firstElementChild as HTMLElement | null;
      const step = card ? card.offsetWidth + 12 : 108; // gap-3 = 12px
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
      el.scrollTo({ left: atEnd ? 0 : el.scrollLeft + step, behavior: "smooth" });
    }, 3500);
    return () => {
      window.clearInterval(id);
      el.removeEventListener("pointerdown", stop);
      el.removeEventListener("touchstart", stop);
      el.removeEventListener("wheel", stop);
      el.removeEventListener("focusin", stop);
    };
  }, [books.length]);

  if (books.length === 0) return null;
  const dark = tone === "dark";

  return (
    <div className="w-full min-w-0">
      <p
        className={`mb-2 break-keep text-center text-[13px] font-extrabold ${
          dark ? "text-white drop-shadow" : "text-neutral-500"
        }`}
      >
        📚 기다리는 동안 세계명작·전래동화를 감상해 주세요
      </p>
      {/* 가로 넘김은 이 줄 안에서만 — 몸통에 가로 스크롤이 생기지 않게 overflow 를 여기 가둔다. */}
      <div
        ref={scrollerRef}
        className="flex w-full snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {books.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => onOpen(b.id)}
            className="flex w-24 shrink-0 snap-start flex-col items-center gap-1 rounded-2xl outline-none focus-visible:ring-4 focus-visible:ring-white/70"
            aria-label={`${b.title} 보기`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={b.coverImage}
              alt=""
              loading="lazy"
              // 표지는 원본 쪽 그림이라 한 장이 수백 KB 다. 줄이 짧아 지연 로딩이 거의 안 먹으므로,
              // 대본·그림 요청보다 뒤로 미뤄 느린 회선에서 대역폭을 뺏지 않게 한다.
              decoding="async"
              fetchPriority="low"
              className={`h-24 w-24 rounded-2xl object-cover shadow-md ${dark ? "border-2 border-white/80" : "border border-white"}`}
            />
            <span
              className={`line-clamp-1 w-full break-keep text-center text-[12px] font-bold ${
                dark ? "text-white drop-shadow" : "text-neutral-600"
              }`}
            >
              {b.title}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
