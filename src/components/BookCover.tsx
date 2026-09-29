"use client";

import { COVER_TITLE_LEADING, coverTitleFontSize, coverTitleLines } from "@/lib/fit-text";
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
  const titleWidth = cover.titleWidth ?? "58%";
  const titleHeight = cover.titleHeight ?? "9%";
  const titleLines = coverTitleLines(book.title);

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

        줄은 coverTitleLines 가 띄어쓰기 자리에서 골라 준 대로 나눈다("하온이의 / 포도밭
        나들이"). 브라우저에 맡기면 한글은 "포도밭 나들 / 이"처럼 낱말 가운데서 끊었다.
        break-keep 은 글꼴이 늦게 와 줄이 넘칠 때도 낱말째 넘기게 하는 안전망이다.

        감싸개는 표지 크기의 컨테이너 — 글자 크기의 cqw·cqh 한도가 여길 기준으로 잰다.
        폰 표지(144px)나 좁은 명패에선 이 한도가 글자를 명패에 맞춰 마저 줄인다.

        명패 칸(h2)은 글자를 자르지 않는다. 브라우저가 글자 자리를 반올림해 계산보다 1~2px
        위로 올려 그리는데, 칸이 자르면 첫 줄 'ㅎ' 꼭지가 뭉텅 잘렸다(리뷰, 09-29 — 폰 표지·얕은
        명패). 잰 칸 위아래로 명패 그림의 크림색 여백이 1px 남짓 더 있어 살짝 올라간 글자는 그
        안에 머문다. 옆으로 넘치는 건 span 이 자른다(overflow 가 있는 flex 항목이라 칸 폭보다
        넓어지지 않는다). span 의 pt·-mt 는 줄 칸 위로 여유를 둬 span 자신의 자르기도 첫 줄
        꼭대기를 못 건드리게 하는 몫이다 — 음수 여백이 같은 만큼 빼 줘서 글자 자리는 그대로다.
        아래쪽엔 안 둔다 — 두면 둘째 줄 밑에 가려 둔 셋째 줄이 비친다. 아주 긴 제목은 글자가
        바닥 크기(COVER_TITLE_MIN_PX)에서 멈추고 넘친 낱말이 셋째 줄로 밀려, 둘째 줄 끝이 "…"가 된다.
      */}
      <div className="absolute inset-0 [container-type:size]">
        <h2
          className="absolute left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center text-center font-extrabold"
          style={{
            top: cover.titleTop,
            width: titleWidth,
            height: titleHeight,
            color: cover.ink,
            lineHeight: COVER_TITLE_LEADING,
            fontSize: coverTitleFontSize(book.title, { width: titleWidth, height: titleHeight }),
          }}
        >
          <span className="-mt-[.25em] pt-[.25em] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden break-keep">
            {titleLines[0]}
            {titleLines.length > 1 && (
              <>
                <br />
                {titleLines[1]}
              </>
            )}
          </span>
        </h2>
      </div>

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
