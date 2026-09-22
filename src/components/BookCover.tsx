"use client";

import { coverTitleScale } from "@/lib/fit-text";
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

/** 표지 그림이 없는 책의 원 안 대체 그림 — 책 순서대로 돌려 쓴다. */
export const FALLBACK_EMOJI = ["🌈", "🍀", "⭐", "🎈"];

export const coverArt = (book: ShelfItem) => book.coverImage ?? book.pages?.find((p) => p.image)?.image ?? null;
export const pageCountOf = (book: ShelfItem) => book.pageCount ?? book.pages?.length ?? null;

/**
 * 유아 전집 스타일 앞표지 — 장식 틀은 나라별 아트를 쓰고, 그 위에 제목(리본 안)·
 * 그림(원 창)·쪽수만 얹는다. 부모 크기를 꽉 채우니 3:4 칸 안에 넣어 쓴다.
 */
export function BookCover({ book, fallbackEmoji = "🌈" }: { book: ShelfItem; fallbackEmoji?: string }) {
  const { theme } = useTheme();
  const cover = theme.cover;
  const art = coverArt(book);
  const pageCount = pageCountOf(book);

  return (
    <>
      {/* 장식 표지 틀. 원본이 반짝이·별이 많아 화려하니 채도를 낮춰 한 김 가라앉힌다 (표지끼리 안 튀게). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={cover.frame} alt="" className="absolute inset-0 h-full w-full saturate-[.8]" />

      {/* 책등 — 왼쪽에 짙은 그림자 띠 + 접힘선 하이라이트로 책이 접히는 느낌. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[11%] bg-gradient-to-r from-black/45 via-black/15 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 left-[8%] w-px bg-white/45" />
      {/* 위·아래 모서리에 살짝 음영을 줘 딱딱한 표지 두께를 암시. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-b from-black/20 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2 bg-gradient-to-t from-black/25 to-transparent" />

      {/*
        제목 — 리본 안. 리본의 흰 자리는 표지 높이의 6~7%밖에 안 돼서, 리본만 한 칸을
        정해 두고 가운데 맞춤으로 놓는다. 긴 제목은 넘치는 대신 글자가 작아진다.
      */}
      <h2
        className="absolute left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-hidden text-center font-extrabold leading-[1.15]"
        style={{
          top: cover.titleTop,
          width: cover.titleWidth ?? "58%",
          height: cover.titleHeight ?? "9%",
          color: cover.ink,
          fontSize: `${13 * coverTitleScale(book.title)}px`,
        }}
      >
        <span className="[display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
          {book.title}
        </span>
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
            <span className="text-5xl drop-shadow">{fallbackEmoji}</span>
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
    </>
  );
}
