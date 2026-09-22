"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  COLUMN_GAP,
  GLYPH_GAP,
  SPACE_EM,
  planBookcases,
  spineTitle,
  type ShelfArt,
} from "@/lib/bookshelves";
import { BookCover, coverArt, type ShelfItem } from "./BookCover";
import { useTheme } from "./ThemeProvider";

/** 책등 글꼴 — 둥근 주아체가 그림책 책등답다. 칸에 맞추는 셈은 글꼴과 무관하다. */
const SPINE_FONT =
  "var(--font-jua, 'Pretendard Variable'), 'Pretendard Variable', Pretendard, sans-serif";

/** 표지 그리드의 책 한 권 너비(px) — 빼낸 앞표지를 이 크기로 그려 확대해야 글자·틀 비율이 똑같다. */
const COVER_BASE_W = 176;

/**
 * 책이 많은 서가 — 나라 표지를 옆에서 본 책등으로 책장에 꽂는다.
 * 책을 누르면 책장에서 빠져나오며 앞표지로 돌아 가운데에 뜨고, 앞표지를 한 번 더 누르면 펼친다.
 */
export function Bookcase({
  books,
  art,
}: {
  books: ShelfItem[];
  art: ShelfArt;
}) {
  const cases = useMemo(
    () => planBookcases(books.length, art),
    [books.length, art],
  );
  const [picked, setPicked] = useState<{
    book: ShelfItem;
    from: HTMLElement;
  } | null>(null);

  return (
    <>
      <div className="flex flex-col items-center gap-10">
        {cases.map((spines, ci) => (
          <div key={ci} className="@container mx-auto w-full max-w-[40rem]">
            <div
              className="relative w-full"
              style={{ height: `${100 * art.aspect}cqw` }}
            >
              {/* 바닥 그림자 — 배경 위에 서 있는 느낌 */}
              <div
                aria-hidden
                className="pointer-events-none absolute -bottom-[1.2cqw] left-1/2 h-[4cqw] w-[80%] -translate-x-1/2 rounded-[50%] bg-black/25 blur-[1.6cqw]"
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={art.shelf}
                alt=""
                draggable={false}
                className="pointer-events-none absolute inset-0 h-full w-full select-none drop-shadow-[0_0.6cqw_1.2cqw_rgba(0,0,0,0.18)]"
              />
              {spines.map((s) => {
                const book = books[s.index];
                const out = picked?.book.id === book.id;
                return (
                  <button
                    key={book.id}
                    type="button"
                    aria-label={`${book.title} 꺼내 보기`}
                    aria-haspopup="dialog"
                    onClick={(e) => setPicked({ book, from: e.currentTarget })}
                    className="group absolute block outline-none [-webkit-tap-highlight-color:transparent]"
                    style={{
                      left: `${s.left}cqw`,
                      top: `${s.top}cqw`,
                      width: `${s.width}cqw`,
                      height: `${s.height}cqw`,
                      // 빼낸 책 자리는 비워 둔다 — 책장에서 한 권 뽑혀 나온 모습.
                      visibility: out ? "hidden" : undefined,
                    }}
                  >
                    {/* 판자에 닿는 그늘 */}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute -bottom-[0.2cqw] -left-[6%] -right-[14%] h-[0.7cqw] rounded-[50%] bg-black/30 blur-[0.3cqw]"
                    />
                    <span className="absolute inset-0 block rounded-[0.3cqw] group-focus-visible:outline-solid group-focus-visible:outline-[length:max(2px,0.35cqw)] group-focus-visible:outline-offset-[0.25cqw] group-focus-visible:outline-pink-500 motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-[5%] group-focus-visible:-translate-y-[5%]">
                      <SpineFace book={book} art={art} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {picked && (
        <PulledBook
          key={picked.book.id}
          book={picked.book}
          from={picked.from}
          art={art}
          onClosed={() => {
            picked.from.focus({ preventScroll: true });
            setPicked(null);
          }}
        />
      )}
    </>
  );
}

/** 책등 한 면 — 책 그림(동그란 창 아래)·책등 그림·세로 제목. 제 크기에 맞춰 커지고 작아진다. */
function SpineFace({ book, art }: { book: ShelfItem; art: ShelfArt }) {
  const { window: win, plate, ink, src } = art.spine;
  const title = useMemo(
    () => spineTitle(book.title, art.spine),
    [book.title, art.spine],
  );
  const pic = coverArt(book);
  return (
    <span aria-hidden className="@container absolute inset-0 block">
      {pic && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={pic}
          alt=""
          draggable={false}
          className="absolute rounded-full object-cover"
          style={{
            top: `${win.top}%`,
            left: `${win.left}%`,
            width: `${win.right - win.left}%`,
            height: `${win.bottom - win.top}%`,
          }}
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        draggable={false}
        className="absolute inset-0 h-full w-full select-none"
      />
      <span
        className="absolute flex items-center justify-center"
        style={{
          top: `${plate.top}%`,
          bottom: `${100 - plate.bottom}%`,
          left: `${plate.left}%`,
          right: `${100 - plate.right}%`,
          fontFamily: SPINE_FONT,
          fontSize: `${title.font * 100}cqw`,
          color: ink,
        }}
      >
        <span
          className="flex flex-row-reverse items-start"
          style={{ gap: `${COLUMN_GAP}em` }}
        >
          {title.columns.map((col, i) => (
            <span
              key={i}
              className="flex w-[1em] flex-col items-center"
              style={{ gap: `${GLYPH_GAP}em` }}
            >
              {col.map((g, j) =>
                g === " " ? (
                  <span
                    key={j}
                    className="block"
                    style={{ height: `${SPACE_EM}em` }}
                  />
                ) : (
                  <span key={j} className="block h-[1em] leading-none">
                    {g}
                  </span>
                ),
              )}
            </span>
          ))}
        </span>
      </span>
    </span>
  );
}

/** 빼낸 책의 크기(px) — 화면에 맞춰 정한다. */
function pulledSize(art: ShelfArt) {
  const w = Math.min(
    window.innerWidth * 0.72,
    288,
    window.innerHeight * 0.58 * 0.75,
  );
  const h = (w * 4) / 3;
  return { w, h, d: h / art.spine.aspect };
}

/** 책장 속 책등 자리 → 화면 가운데 앞표지. 되돌아갈 때는 이 순서를 거꾸로 쓴다. */
function flight(from: HTMLElement, size: { w: number; h: number }): Keyframe[] {
  const r = from.getBoundingClientRect();
  const dx = r.left + r.width / 2 - window.innerWidth / 2;
  const dy = r.top + r.height / 2 - window.innerHeight / 2;
  const s = r.height / size.h;
  return [
    { transform: `translate(${dx}px, ${dy}px) scale(${s}) rotateY(90deg)` },
    // 먼저 책장에서 앞으로 쏙 빼낸 뒤
    {
      transform: `translate(${dx}px, ${dy - r.height * 0.12}px) scale(${s * 1.12}) rotateY(90deg)`,
      offset: 0.22,
    },
    // 가운데로 오면서 돌아 앞표지를 보인다
    { transform: "translate(0px, 0px) scale(1) rotateY(0deg)" },
  ];
}

function PulledBook({
  book,
  from,
  art,
  onClosed,
}: {
  book: ShelfItem;
  from: HTMLElement;
  art: ShelfArt;
  onClosed: () => void;
}) {
  const { theme } = useTheme();
  const boxRef = useRef<HTMLDivElement>(null);
  const openRef = useRef<HTMLAnchorElement>(null);
  const [size] = useState(() => pulledSize(art));
  const [closing, setClosing] = useState(false);
  const reduce = useRef(false);

  useEffect(() => {
    reduce.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    root.style.overflow = "hidden"; // 뒤 책장이 스크롤되면 돌아갈 자리가 어긋난다
    const box = boxRef.current;
    const anim =
      box && !reduce.current
        ? box.animate(flight(from, size), {
            duration: 720,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            fill: "both",
          })
        : null;
    const focus = () => openRef.current?.focus({ preventScroll: true });
    if (anim) anim.finished.then(focus, () => {});
    else focus();
    return () => {
      anim?.cancel();
      root.style.overflow = prevOverflow;
    };
  }, [from, size]);

  const close = () => {
    if (closing) return;
    setClosing(true);
    const box = boxRef.current;
    if (!box || reduce.current) return onClosed();
    const back = box.animate(
      flight(from, size)
        .reverse()
        .map((k, i, all) => ({
          ...k,
          offset: i === 1 ? 0.78 : i / (all.length - 1),
        })),
      {
        duration: 560,
        easing: "cubic-bezier(0.55, 0, 0.45, 1)",
        fill: "both",
      },
    );
    back.finished.then(onClosed, onClosed);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const { w, h, d } = size;
  const face = "absolute left-1/2 top-1/2 [backface-visibility:hidden]";
  const scale = w / COVER_BASE_W;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={book.title}
      className="fixed inset-0 z-50 [perspective:1400px]"
    >
      <button
        type="button"
        aria-label="책장에 다시 꽂기"
        onClick={close}
        className={`absolute inset-0 bg-black/45 backdrop-blur-[2px] motion-safe:transition-opacity motion-safe:duration-500 motion-safe:starting:opacity-0 ${closing ? "opacity-0" : ""}`}
      />

      {/* 빼낸 책 — 앞표지·책등·책장(종이)·윗면을 가진 상자 */}
      <div
        ref={boxRef}
        className="pointer-events-none absolute left-1/2 top-1/2 [transform-style:preserve-3d]"
        style={{ width: w, height: h, marginLeft: -w / 2, marginTop: -h / 2 }}
      >
        <div
          className={face}
          style={{
            width: d,
            height: h,
            marginLeft: -d / 2,
            marginTop: -h / 2,
            transform: `rotateY(-90deg) translateZ(${w / 2}px)`,
          }}
        >
          <span className="absolute inset-0 block overflow-hidden rounded-[3px]">
            <SpineFace book={book} art={art} />
          </span>
        </div>
        <div
          className={`${face} bg-[repeating-linear-gradient(90deg,#f3ecdc_0px,#f3ecdc_2px,#ddd0b4_3px,#ddd0b4_4px)]`}
          style={{
            width: d,
            height: h - 6,
            marginLeft: -d / 2,
            marginTop: -(h - 6) / 2,
            transform: `rotateY(90deg) translateZ(${w / 2 - 3}px)`,
          }}
        />
        <div
          className={`${face} bg-[repeating-linear-gradient(0deg,#f3ecdc_0px,#f3ecdc_2px,#ddd0b4_3px,#ddd0b4_4px)]`}
          style={{
            width: w - 6,
            height: d,
            marginLeft: -(w - 6) / 2,
            marginTop: -d / 2,
            transform: `rotateX(90deg) translateZ(${h / 2 - 3}px)`,
          }}
        />
        <Link
          ref={openRef}
          href={`/book/${book.id}`}
          aria-label={`${book.title} 펼치기`}
          className={`${face} pointer-events-auto block overflow-hidden rounded-l-[3px] rounded-r-xl shadow-[0_18px_40px_rgba(0,0,0,0.35)] outline-none focus-visible:ring-4 focus-visible:ring-white/80`}
          style={{
            width: w,
            height: h,
            marginLeft: -w / 2,
            marginTop: -h / 2,
            transform: `translateZ(${d / 2}px)`,
          }}
        >
          <span
            className="absolute left-0 top-0 block origin-top-left"
            style={{
              width: COVER_BASE_W,
              height: (COVER_BASE_W * 4) / 3,
              transform: `scale(${scale})`,
            }}
          >
            <BookCover book={book} />
          </span>
        </Link>
      </div>

      {/* 앞표지 아래 버튼 — 다 돈 뒤에 나타나고, 책장에 꽂기 시작하면 바로 사라진다 */}
      {!closing && (
        <div
          className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2 motion-safe:transition-opacity motion-safe:duration-300 motion-safe:starting:opacity-0 motion-safe:[transition-delay:450ms]"
          style={{ top: `calc(50% + ${h / 2}px + 1.25rem)` }}
        >
          <Link
            href={`/book/${book.id}`}
            className="whitespace-nowrap rounded-full px-6 py-3 text-lg font-extrabold text-white shadow-lg outline-none focus-visible:ring-4 focus-visible:ring-white/80"
            style={{
              background: theme.colors.accent,
              boxShadow: `0 5px 0 ${theme.colors.accentDark}`,
            }}
          >
            펼치기 ▶
          </Link>
          <button
            type="button"
            onClick={close}
            className="whitespace-nowrap rounded-full bg-white/90 px-4 py-3 text-sm font-extrabold text-neutral-600 shadow-lg outline-none focus-visible:ring-4 focus-visible:ring-white/80"
          >
            책장에 꽂기
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}
