"use client";

import type React from "react";
import Link from "next/link";
import { useTheme } from "./ThemeProvider";

/**
 * 책장에 필요한 최소 정보.
 *
 * 전체 Book(본문·삽화 포함)을 받지 않는다 — 만든 동화는 삽화가 들어 있어 한 권이
 * 수 MB라, 책장이 그걸 통째로 받으면 느리다. 제공 책(전래·명작 JSON)은 Book 그대로
 * 넘겨도 이 모양에 맞는다(pages로 표지·쪽수를 구한다).
 */
export type ShelfItem = {
  id: string;
  title: string;
  coverImage?: string | null;
  pageCount?: number | null;
  pages?: { image?: string | null }[];
};

/** 살짝 삐뚤빼뚤 — 장난감처럼 놓인 느낌. 잡으면(hover) 똑바로 선다. */
const TILTS = ["-rotate-2", "rotate-1", "rotate-2", "-rotate-1", "rotate-1", "-rotate-2"];

/** 표지 그림이 없는 책의 원 안 대체 그림. */
const FALLBACK_EMOJI = ["🌈", "🍀", "⭐", "🎈"];

/**
 * 유아 전집 스타일 표지 — 장식 틀은 힉스필드로 그린 진짜 아트를 쓰고, 그 위에
 * 제목(리본 안)·그림(원 창)·쪽수만 얹는다. 틀과 좌표는 테마가 들고 있어서
 * 공룡나라로 넘어가면 표지도 정글 틀로 바뀐다.
 */
export function Bookshelf({ books, cols = 5 }: { books: ShelfItem[]; cols?: number }) {
  const { theme } = useTheme();
  const cover = theme.cover;

  return (
    /*
     * 한 줄에 몇 권을 놓을지 — 책 크기는 그대로 두고 책장 폭만 좁혀서 정한다.
     * 칸에 맞춰 책을 늘리는 방식은 3권일 때 책이 우스꽝스럽게 커진다.
     * 폭 = 권수 × (책 너비 11rem + 사이 간격 1.75rem).
     * 좁은 화면(sm 미만)에는 안 건다 — 거기선 화면 폭이 알아서 2권으로 맞춘다.
     */
    <div
      style={{ "--cols": String(cols) } as React.CSSProperties}
      className="mx-auto flex flex-wrap items-end justify-center gap-6 sm:w-[calc(var(--cols)*12.75rem)] sm:max-w-full sm:gap-7"
    >
      {books.map((book, i) => {
        const art = book.coverImage ?? book.pages?.find((p) => p.image)?.image ?? null;
        const pageCount = book.pageCount ?? book.pages?.length ?? null;
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
              {/* 페이지 뭉치 — 표지 뒤에서 오른쪽·아래로 살짝 삐져나와 종이 두께를
                  만든다. 크림색에 아주 얇은 결을 넣어 낱장이 쌓인 느낌. */}
              <div
                aria-hidden
                className="absolute inset-0 translate-x-[5px] translate-y-[3px] rounded-l-[2px] rounded-r-lg bg-[repeating-linear-gradient(0deg,#efe7d6_0px,#efe7d6_1px,#dccfb6_2px,#dccfb6_3px)] shadow-[0_10px_18px_rgba(0,0,0,0.25)]"
              />

              {/* 표지 — 책등 쪽(왼쪽)은 각지게, 배지 쪽(오른쪽)은 둥글게. */}
              <div className="relative aspect-[3/4] overflow-hidden rounded-l-[2px] rounded-r-xl shadow-[0_8px_16px_rgba(0,0,0,0.22)]">
                {/* 장식 표지 틀 (테마별 힉스필드 아트). 원본이 반짝이·별이 많아
                    화려하니 채도를 낮춰 한 김 가라앉힌다 (표지끼리 안 튀게). */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cover.frame}
                  alt=""
                  className="absolute inset-0 h-full w-full saturate-[.8]"
                />

                {/* 책등 — 왼쪽에 짙은 그림자 띠 + 접힘선 하이라이트로 책이 접히는
                    느낌을 준다. 카드→책으로 바뀌는 핵심. */}
                <div className="pointer-events-none absolute inset-y-0 left-0 w-[11%] bg-gradient-to-r from-black/45 via-black/15 to-transparent" />
                <div className="pointer-events-none absolute inset-y-0 left-[8%] w-px bg-white/45" />
                {/* 위·아래 모서리에 살짝 음영을 줘 딱딱한 표지 두께를 암시. */}
                <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-b from-black/20 to-transparent" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2 bg-gradient-to-t from-black/25 to-transparent" />

                {/* 제목 — 리본 안 */}
                <h2
                  className="absolute left-1/2 w-[56%] -translate-x-1/2 overflow-hidden text-center text-[11px] font-extrabold leading-tight [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] sm:text-[13px]"
                  style={{ top: `calc(${cover.titleTop} - 2%)`, color: cover.ink }}
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

                {/* 쪽수 — 아래 여백. 가벼운 목록엔 쪽수가 없을 수 있어 그때는 숨긴다. */}
                {pageCount !== null && (
                  <p
                    className="absolute bottom-[4.5%] left-1/2 -translate-x-1/2 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-extrabold"
                    style={{ color: cover.ink }}
                  >
                    {pageCount}쪽
                  </p>
                )}
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
