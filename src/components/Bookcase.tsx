"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import {
  COLUMN_GAP,
  GLYPH_GAP,
  SPACE_EM,
  planBookcases,
  spineTitle,
  type ShelfArt,
} from "@/lib/bookshelves";
import { BookCover, FALLBACK_EMOJI, coverArt, type ShelfItem } from "./BookCover";
import { useTheme } from "./ThemeProvider";

/** 책등 글꼴 — 둥근 주아체가 그림책 책등답다. 칸에 맞추는 셈은 글꼴과 무관하다. */
const SPINE_FONT = "var(--font-jua, 'Pretendard Variable'), 'Pretendard Variable', Pretendard, sans-serif";

/** 표지 그리드의 책 한 권 너비(px) — 빼낸 앞표지를 이 크기로 그려 확대해야 글자·틀 비율이 똑같다. */
const COVER_BASE_W = 176;

/**
 * 책이 많은 서가 — 나라 표지를 옆에서 본 책등으로 책장에 꽂는다.
 * 책을 누르면 책장에서 빠져나오며 앞표지로 돌아 가운데에 뜨고, 앞표지를 한 번 더 누르면 펼친다.
 */
export function Bookcase({ books, art }: { books: ShelfItem[]; art: ShelfArt }) {
  const cases = useMemo(() => planBookcases(books.length, art), [books.length, art]);
  const [picked, setPicked] = useState<{ id: string; from: HTMLElement } | null>(null);
  // 책은 id 로 기억한다 — 목록이 새로 와도 같은 책을 찾고, 없어졌으면 그냥 내려놓는다.
  const pickedIndex = picked ? books.findIndex((b) => b.id === picked.id) : -1;
  const pickedBook = pickedIndex >= 0 ? books[pickedIndex] : null;
  // 책장 높이가 32rem 안팎이 되게 — 낮고 넓은 책장은 더 넓게 펼쳐야 책등 제목이 읽힌다.
  const maxWidth = `${Math.min(56, Math.max(40, 32 / art.aspect))}rem`;

  return (
    <>
      <div className="flex flex-col items-center gap-10">
        {cases.map((spines, ci) => (
          <div key={ci} className="@container mx-auto w-full" style={{ maxWidth }}>
            <div className="relative w-full" style={{ height: `${100 * art.aspect}cqw` }}>
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
                const out = pickedBook?.id === book.id;
                const hitPad = s.hit / 2;
                return (
                  <button
                    key={book.id}
                    type="button"
                    data-book-id={book.id}
                    aria-label={`${book.title} 꺼내 보기`}
                    aria-haspopup="dialog"
                    onClick={(e) => setPicked({ id: book.id, from: e.currentTarget })}
                    className="group absolute block outline-none [-webkit-tap-highlight-color:transparent]"
                    style={{
                      left: `${s.left - hitPad}cqw`,
                      top: `${s.top}cqw`,
                      width: `${s.width + s.hit}cqw`,
                      height: `${s.height}cqw`,
                      // 빼낸 책 자리는 비워 둔다 — 책장에서 한 권 뽑혀 나온 모습.
                      visibility: out ? "hidden" : undefined,
                    }}
                  >
                    {/* 누르는 자리는 옆 책과의 틈 절반씩 넓고, 책등 그림은 가운데 제 크기로 선다. */}
                    <span className="absolute inset-y-0 block" style={{ left: `${hitPad}cqw`, right: `${hitPad}cqw` }}>
                      {/* 판자에 닿는 그늘 */}
                      <span
                        aria-hidden
                        className="pointer-events-none absolute -bottom-[0.2cqw] -left-[6%] -right-[14%] h-[0.7cqw] rounded-[50%] bg-black/30 blur-[0.3cqw]"
                      />
                      <span
                        data-face=""
                        className="absolute inset-0 block rounded-[0.3cqw] group-focus-visible:outline-solid group-focus-visible:outline-[length:max(2px,0.35cqw)] group-focus-visible:outline-offset-[0.25cqw] motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-[5%] group-focus-visible:-translate-y-[5%]"
                        style={{ outlineColor: art.spine.ink }}
                      >
                        <SpineFace book={book} art={art} emoji={FALLBACK_EMOJI[s.index % FALLBACK_EMOJI.length]} />
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {picked && pickedBook && (
        <PulledBook
          key={pickedBook.id}
          book={pickedBook}
          emoji={FALLBACK_EMOJI[pickedIndex % FALLBACK_EMOJI.length]}
          from={picked.from}
          art={art}
          onClosed={() => {
            const el = picked.from;
            // 책등이 다시 보여야 초점을 돌려줄 수 있다 — 먼저 대화상자를 닫아 그리고 나서.
            flushSync(() => setPicked(null));
            if (el.isConnected) el.focus({ preventScroll: true });
          }}
        />
      )}
    </>
  );
}

/** 책등 한 면 — 책 그림(동그란 창 아래)·책등 그림·세로 제목. 제 크기에 맞춰 커지고 작아진다. */
function SpineFace({ book, art, emoji }: { book: ShelfItem; art: ShelfArt; emoji: string }) {
  const { window: win, plate, ink, src } = art.spine;
  const title = useMemo(() => spineTitle(book.title, art.spine), [book.title, art.spine]);
  const pic = coverArt(book);
  const winBox = {
    top: `${win.top}%`,
    left: `${win.left}%`,
    width: `${win.right - win.left}%`,
    height: `${win.bottom - win.top}%`,
  };
  return (
    <span aria-hidden className="@container absolute inset-0 block">
      {/* 동그란 창은 그림에서 투명하게 뚫려 있다 — 그림이 없는 책도 구멍으로 보이지 않게 채운다. */}
      {pic ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pic} alt="" draggable={false} className="absolute rounded-full object-cover" style={winBox} />
      ) : (
        <span
          className="absolute flex items-center justify-center rounded-full bg-white leading-none"
          style={{ ...winBox, fontSize: `${(win.right - win.left) * 0.55}cqw` }}
        >
          {emoji}
        </span>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" draggable={false} className="absolute inset-0 h-full w-full select-none" />
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
        <span className="flex flex-row-reverse items-start" style={{ gap: `${COLUMN_GAP}em` }}>
          {title.columns.map((col, i) => (
            <span key={i} className="flex w-[1em] flex-col items-center" style={{ gap: `${GLYPH_GAP}em` }}>
              {col.map((g, j) =>
                g === " " ? (
                  <span key={j} className="block" style={{ height: `${SPACE_EM}em` }} />
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

/** 빼낸 책의 크기(px) — 화면에 맞추되, 아래 버튼 줄 자리는 남긴다(가로로 눕힌 폰에서도 버튼이 보이게). */
function pulledSize(art: ShelfArt) {
  const w = Math.max(60, Math.min(window.innerWidth * 0.72, 288, (window.innerHeight - 176) * 0.75));
  const h = (w * 4) / 3;
  return { w, h, d: h / art.spine.aspect };
}

/**
 * 책장 속 책등 자리 · 살짝 빼낸 자리 · 화면 가운데 앞표지. 세 자세 모두 같은 변환 목록이라
 * 각 항목이 따로 이어진다. scale3d 로 깊이까지 줄이고 translateZ 로 책등 면을 z=0 에 두어야
 * 원근 때문에 제자리보다 크게·옆으로 튀어 보이지 않는다.
 */
function flight(from: HTMLElement, size: { w: number; h: number }) {
  const face = from.querySelector<HTMLElement>("[data-face]") ?? from;
  const r = face.getBoundingClientRect();
  const dx = r.left + r.width / 2 - window.innerWidth / 2;
  const dy = r.top + r.height / 2 - window.innerHeight / 2;
  const s = r.height / size.h;
  const z = (-s * size.w) / 2;
  const pose = (x: number, y: number, zz: number, k: number, deg: number) =>
    `translate(${x}px, ${y}px) translateZ(${zz}px) scale3d(${k}, ${k}, ${k}) rotateY(${deg}deg)`;
  return {
    slot: pose(dx, dy, z, s, 90),
    // 같은 z 에서 조금 키우면 책등이 앞으로 쏙 나온다
    pulled: pose(dx, dy - r.height * 0.14, z, s * 1.1, 90),
    center: pose(0, 0, 0, 1, 0),
  };
}

type Phase = "opening" | "open" | "closing";

function PulledBook({
  book,
  emoji,
  from,
  art,
  onClosed,
}: {
  book: ShelfItem;
  emoji: string;
  from: HTMLElement;
  art: ShelfArt;
  onClosed: () => void;
}) {
  const { theme } = useTheme();
  const dialogRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const openRef = useRef<HTMLAnchorElement>(null);
  const [size, setSize] = useState(() => pulledSize(art));
  const [phase, setPhase] = useState<Phase>("opening");
  // 애니메이션 콜백은 지난 렌더의 값을 보므로, 지금 단계는 ref 로도 들고 있는다.
  const phaseRef = useRef<Phase>("opening");
  const moveTo = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  // 여는 동안: 뒤 페이지 스크롤·클릭·Tab 을 막는다. 스크롤바 자리는 남겨 둬야 고정된 배경·버튼까지 옆으로 밀리지 않는다.
  useEffect(() => {
    const root = document.documentElement;
    const prev = { overflow: root.style.overflow, gutter: root.style.scrollbarGutter };
    const bar = window.innerWidth - root.clientWidth;
    if (bar > 0) root.style.scrollbarGutter = "stable";
    root.style.overflow = "hidden";
    const others = Array.from(document.body.children).filter(
      (el) => el !== dialogRef.current && !el.hasAttribute("inert"),
    );
    others.forEach((el) => el.setAttribute("inert", ""));
    // 날아가는 도중에 크기가 바뀌면 착지 자리가 어긋난다 — 다 나와 있을 때만 맞춘다.
    const onResize = () => {
      if (phaseRef.current === "open") setSize(pulledSize(art));
    };
    window.addEventListener("resize", onResize);
    return () => {
      root.style.overflow = prev.overflow;
      root.style.scrollbarGutter = prev.gutter;
      others.forEach((el) => el.removeAttribute("inert"));
      window.removeEventListener("resize", onResize);
    };
  }, [art]);

  useEffect(() => {
    const box = boxRef.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const done = () => {
      if (phaseRef.current !== "opening") return;
      phaseRef.current = "open";
      setPhase("open");
      setSize(pulledSize(art));
      openRef.current?.focus({ preventScroll: true });
    };
    if (!box || reduce) {
      done();
      return;
    }
    const f = flight(from, size);
    const anim = box.animate(
      [
        { transform: f.slot, easing: "cubic-bezier(0.3, 0, 0.3, 1)" },
        { transform: f.pulled, offset: 0.26, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
        { transform: f.center },
      ],
      { duration: 820, fill: "both" },
    );
    anim.finished.then(done, () => {});
    return () => anim.cancel();
    // 여는 비행은 처음 한 번만 — 창 크기가 바뀌어도 다시 날지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from]);

  // 다 빠져나온 뒤에만 닫는다 — 아이가 두 번 톡톡 누르면 두 번째 누름이 바로 책을 도로 꽂아 버린다.
  const close = () => {
    if (phaseRef.current !== "open") return;
    moveTo("closing");
    const box = boxRef.current;
    if (!box || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return onClosed();
    const f = flight(from, size);
    box
      .animate(
        [
          { transform: f.center, easing: "cubic-bezier(0.5, 0, 0.3, 1)" },
          { transform: f.pulled, offset: 0.74, easing: "cubic-bezier(0.3, 0, 0.3, 1)" },
          { transform: f.slot },
        ],
        { duration: 640, fill: "both" },
      )
      .finished.then(onClosed, onClosed);
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
  const pages = "bg-[repeating-linear-gradient(var(--dir),#f3ecdc_0px,#f3ecdc_2px,#ddd0b4_3px,#ddd0b4_4px)]";

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={book.title}
      className="fixed inset-0 z-50 [perspective:1400px]"
    >
      <button
        type="button"
        aria-label="책장에 다시 꽂기"
        onClick={close}
        className={`absolute inset-0 bg-black/45 backdrop-blur-[2px] motion-safe:transition-opacity motion-safe:duration-500 motion-safe:starting:opacity-0 ${phase === "closing" ? "opacity-0" : ""}`}
      />

      {/* 빼낸 책 — 앞표지·책등·책장(종이)·윗면을 가진 상자 */}
      <div
        ref={boxRef}
        className="pointer-events-none absolute left-1/2 top-1/2 [transform-style:preserve-3d]"
        style={{ width: w, height: h, marginLeft: -w / 2, marginTop: -h / 2 }}
      >
        <div
          className={face}
          style={{ width: d, height: h, marginLeft: -d / 2, marginTop: -h / 2, transform: `rotateY(-90deg) translateZ(${w / 2}px)` }}
        >
          <span className="absolute inset-0 block overflow-hidden rounded-[3px]">
            <SpineFace book={book} art={art} emoji={emoji} />
          </span>
        </div>
        <div
          className={`${face} ${pages} [--dir:90deg]`}
          style={{ width: d, height: h - 6, marginLeft: -d / 2, marginTop: -(h - 6) / 2, transform: `rotateY(90deg) translateZ(${w / 2 - 3}px)` }}
        />
        <div
          className={`${face} ${pages} [--dir:0deg]`}
          style={{ width: w - 6, height: d, marginLeft: -(w - 6) / 2, marginTop: -d / 2, transform: `rotateX(90deg) translateZ(${h / 2 - 3}px)` }}
        />
        <Link
          ref={openRef}
          href={`/book/${book.id}`}
          aria-label={`${book.title} 펼치기`}
          tabIndex={phase === "open" ? 0 : -1}
          onClick={(e) => {
            if (phaseRef.current !== "open") e.preventDefault();
          }}
          className={`${face} block overflow-hidden rounded-l-[3px] rounded-r-xl shadow-[0_18px_40px_rgba(0,0,0,0.35)] outline-none focus-visible:ring-4 focus-visible:ring-white/80 ${phase === "open" ? "pointer-events-auto" : ""}`}
          style={{ width: w, height: h, marginLeft: -w / 2, marginTop: -h / 2, transform: `translateZ(${d / 2}px)` }}
        >
          <span
            className="absolute left-0 top-0 block origin-top-left"
            style={{ width: COVER_BASE_W, height: (COVER_BASE_W * 4) / 3, transform: `scale(${w / COVER_BASE_W})` }}
          >
            <BookCover book={book} fallbackEmoji={emoji} />
          </span>
        </Link>
      </div>

      {/* 앞표지 아래 버튼 — 다 돈 뒤에 나타나고, 책장에 꽂기 시작하면 바로 사라진다 */}
      {phase === "open" && (
        <div
          className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2 motion-safe:transition-opacity motion-safe:duration-300 motion-safe:starting:opacity-0"
          style={{ top: `calc(50% + ${h / 2}px + 1.25rem)` }}
        >
          <Link
            href={`/book/${book.id}`}
            className="whitespace-nowrap rounded-full px-6 py-3 text-lg font-extrabold text-white shadow-lg outline-none focus-visible:ring-4 focus-visible:ring-white/80"
            style={{ background: theme.colors.accent, boxShadow: `0 5px 0 ${theme.colors.accentDark}` }}
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
