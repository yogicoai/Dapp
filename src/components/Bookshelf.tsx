"use client";

import Link from "next/link";
import type { Book } from "@/lib/types";
import { useTheme } from "./ThemeProvider";

/** 살짝 삐뚤빼뚤 — 장난감처럼 놓인 느낌. 잡으면(hover) 똑바로 선다. */
const TILTS = ["-rotate-2", "rotate-1", "rotate-2", "-rotate-1", "rotate-1", "-rotate-2"];

/** 표지 그림이 없는 책의 원 안 대체 그림. */
const FALLBACK_EMOJI = ["🌈", "🍀", "⭐", "🎈"];

/**
 * 유아 전집 스타일 표지 — 장식 틀은 힉스필드로 그린 진짜 아트를 쓰고, 그 위에
 * 제목(리본 안)·그림(원 창)·쪽수만 얹는다. 틀과 좌표는 테마가 들고 있어서
 * 공룡나라로 넘어가면 표지도 정글 틀로 바뀐다.
 */
export function Bookshelf({ books }: { books: Book[] }) {
  const { theme } = useTheme();
  const cover = theme.cover;

  return (
    <div className="flex flex-wrap items-end justify-center gap-6 sm:gap-7">
      {books.map((book, i) => {
        const art = book.coverImage ?? book.pages.find((p) => p.image)?.image ?? null;
        const tilt = TILTS[i % TILTS.length];
        const emoji = FALLBACK_EMOJI[i % FALLBACK_EMOJI.length];

        return (
          <Link
            key={book.id}
            href={`/book/${book.id}`}
            aria-label={`${book.title} 펼치기`}
            className="group outline-none"
          >
            <div
              className={`relative w-36 sm:w-44 ${tilt} transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform group-hover:-translate-y-3 group-hover:rotate-0 group-focus-visible:-translate-y-3 group-focus-visible:rotate-0`}
            >
              <div className="relative aspect-[3/4] overflow-hidden rounded-xl shadow-[0_10px_22px_rgba(0,0,0,0.28)]">
                {/* 장식 표지 틀 (테마별 힉스필드 아트) */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cover.frame} alt="" className="absolute inset-0 h-full w-full" />

                {/* 제목 — 리본 안 */}
                <h2
                  className="absolute left-1/2 w-[56%] -translate-x-1/2 overflow-hidden text-center text-[11px] font-extrabold leading-tight [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] sm:text-[13px]"
                  style={{ top: cover.titleTop, color: cover.ink }}
                >
                  {book.title}
                </h2>

                {/* 그림 — 원 창 안 */}
                <div
                  className="absolute left-1/2 aspect-square -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full"
                  style={{ top: cover.circleTop, width: cover.circleWidth }}
                >
                  {art ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={art} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-white">
                      <span className="text-5xl drop-shadow">{emoji}</span>
                    </div>
                  )}
                </div>

                {/* 쪽수 — 아래 여백 */}
                <p
                  className="absolute bottom-[4.5%] left-1/2 -translate-x-1/2 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-extrabold"
                  style={{ color: cover.ink }}
                >
                  {book.pages.length}쪽
                </p>
              </div>

              {/* 바닥 그림자 — 잔디밭에 서 있는 느낌 */}
              <div className="absolute -bottom-2.5 left-1/2 h-3 w-4/5 -translate-x-1/2 rounded-full bg-black/25 blur-md" />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
