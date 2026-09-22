"use client";

import Link from "next/link";
import { BookCover, FALLBACK_EMOJI, type ShelfItem } from "./BookCover";

/** 살짝 삐뚤빼뚤 — 장난감처럼 놓인 느낌. 잡으면(hover) 똑바로 선다. */
const TILTS = ["-rotate-2", "rotate-1", "rotate-2", "-rotate-1", "rotate-1", "-rotate-2"];

/**
 * 유아 전집 스타일 표지 — 장식 틀은 힉스필드로 그린 진짜 아트를 쓰고, 그 위에
 * 제목(리본 안)·그림(원 창)·쪽수만 얹는다. 틀과 좌표는 테마가 들고 있어서
 * 공룡나라로 넘어가면 표지도 정글 틀로 바뀐다.
 */
export function Bookshelf({ books, cols = 5 }: { books: ShelfItem[]; cols?: number }) {
  return (
    /*
     * 한 줄에 몇 권을 놓을지 — 책 크기는 그대로 두고 책장 폭만 좁혀서 정한다.
     * 칸에 맞춰 책을 늘리는 방식은 3권일 때 책이 우스꽝스럽게 커진다.
     * 폭 = 권수 × (책 너비 11rem + 사이 간격 1.75rem).
     *
     * 폭은 클래스가 아니라 style로 직접 준다. 값이 상황마다 달라지는 건 클래스로
     * 만들면(=임의값 + CSS 변수) 어느 규칙이 이기는지가 불투명해진다 — 여기선
     * 실제로 적용이 안 됐다. style은 언제나 이긴다.
     *
     * 좁은 화면은 따로 안 건드려도 된다. maxWidth 100%가 화면 밖으로 못 나가게
     * 잡아 주므로, 폰에서는 예전처럼 화면 폭이 알아서 2권으로 맞춘다.
     */
    <div
      style={{ width: `${cols * 12.75}rem`, maxWidth: "100%" }}
      className="mx-auto flex flex-wrap items-end justify-center gap-6 sm:gap-7"
    >
      {books.map((book, i) => {
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
                <BookCover book={book} fallbackEmoji={emoji} />
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
