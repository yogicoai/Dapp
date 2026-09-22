/**
 * 책장(책등) — 한 서가에 책이 많으면 표지 대신 나라별 책장에 책등으로 꽂는다.
 * 책등은 그 나라 표지를 옆에서 본 모습이고, 누르면 책이 빠져나오며 앞표지로 돈다.
 *
 * 크기는 모두 cqw(책장 너비의 1%)로 셈한다 — 폰이든 PC든 같은 배치가 커지고 작아질 뿐이고,
 * 서버·클라이언트가 같은 값을 낸다.
 */
import type { ThemeId } from "./themes";

/** 한 서가에 이보다 많으면 표지 대신 책장으로 보여 준다. */
export const BOOKCASE_AFTER = 10;

/** 그림 위 사각형(%) — top·bottom 은 높이 대비, left·right 는 너비 대비. */
export type Box = { top: number; bottom: number; left: number; right: number };

export type ShelfArt = {
  /** 배경 없는 책장 가구 그림 */
  shelf: string;
  /** 책장 그림의 세로/가로 */
  aspect: number;
  /** 칸 — bottom 은 책이 서는 판자 윗면 */
  rows: Box[];
  spine: {
    src: string;
    /** 책등 그림의 세로/가로 */
    aspect: number;
    /** 책 그림이 들어갈 동그란 창 — 그림에서 투명하게 뚫려 있어 아래에 깐다 */
    window: Box;
    /** 제목을 세로로 쓰는 칸 */
    plate: Box;
    ink: string;
  };
};

/**
 * 나라별 책장·책등 그림 — 사장님이 그 나라 표지 틀을 참고로 생성한 그림(2026-09-22).
 * 아직 공주나라만 있다. 여기 없는 나라는 책이 많아도 표지 보기 그대로다.
 */
export const SHELF_ART: Partial<Record<ThemeId, ShelfArt>> = {
  princess: {
    // 낮고 넓은 2칸 책장(사장님 선택, 2026-09-22) — 칸이 넓어 한 칸에 10권쯤 들어간다.
    shelf: "/themes/princess/bookshelf.webp?v=2",
    aspect: 911 / 1468,
    rows: [
      { top: 22.1, bottom: 48.7, left: 8.3, right: 91.8 },
      { top: 54.8, bottom: 80.7, left: 8.3, right: 91.8 },
    ],
    spine: {
      src: "/themes/princess/spine.webp",
      aspect: 1769 / 491,
      window: { top: 14.2, bottom: 26.2, left: 29.5, right: 70.5 },
      plate: { top: 29.7, bottom: 74.3, left: 19.1, right: 80.9 },
      ink: "#be185d",
    },
  },
};

/* ── 제목 세로쓰기 ──
 * writing-mode 로 쓰면 글꼴마다 세로 글자 간격이 달라(프리텐다드 1.2em, 맑은 고딕 1em) 칸에 맞춘
 * 글자 크기가 기기마다 어긋난다. 그래서 글자를 1em 칸에 하나씩 쌓는다. */
export const GLYPH_GAP = 0.06; // 글자 사이 (em)
export const SPACE_EM = 0.34; // 띄어쓰기 자리 (em)
export const COLUMN_GAP = 0.14; // 두 줄 제목의 줄 사이 (em)

let segmenter: Intl.Segmenter | null = null;

function glyphs(text: string): string[] {
  const t = text.normalize("NFC");
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    segmenter ??= new Intl.Segmenter("ko", { granularity: "grapheme" });
    return [...segmenter.segment(t)].map((s) => s.segment);
  }
  return Array.from(t);
}

function columnEm(col: string[]): number {
  return col.reduce((em, g, i) => em + (g === " " ? SPACE_EM : 1) + (i ? GLYPH_GAP : 0), 0);
}

/** 한 줄로 쓰기, 그리고 (되면) 두 줄로 쓰기. 두 줄은 띄어쓰기에서 가장 고르게 나눈다. */
function titleLayouts(title: string): string[][][] {
  const clean = title.trim().replace(/\s+/g, " ");
  const one = [glyphs(clean)];
  const words = clean.split(" ");
  if (words.length > 1) {
    let best = one;
    let bestEm = Infinity;
    for (let i = 1; i < words.length; i++) {
      const cols = [glyphs(words.slice(0, i).join(" ")), glyphs(words.slice(i).join(" "))];
      const em = Math.max(...cols.map(columnEm));
      if (em < bestEm) {
        bestEm = em;
        best = cols;
      }
    }
    return [one, best];
  }
  if (one[0].length > 6) {
    const half = Math.ceil(one[0].length / 2);
    return [one, [one[0].slice(0, half), one[0].slice(half)]];
  }
  return [one];
}

/** 제목 칸 안쪽 여백 — 칸 테두리(물결 금테)에 글자가 닿지 않게. */
const PLATE_FILL_W = 0.78;
const PLATE_FILL_H = 0.86;

/**
 * 책등 제목의 줄 나눔과 글자 크기. 글자 크기는 책등 너비 대비 비율이라, 책장 안의 작은 책등이든
 * 빼낸 큰 책이든 같은 모양으로 커지고 작아진다.
 */
export function spineTitle(title: string, spine: ShelfArt["spine"]): { columns: string[][]; font: number } {
  const w = ((spine.plate.right - spine.plate.left) / 100) * PLATE_FILL_W;
  const h = ((spine.plate.bottom - spine.plate.top) / 100) * spine.aspect * PLATE_FILL_H;
  const fit = (cols: string[][]) =>
    Math.min(w / (cols.length + (cols.length - 1) * COLUMN_GAP), h / Math.max(1, ...cols.map(columnEm)));
  const [one, two] = titleLayouts(title);
  // 두 줄은 글자가 눈에 띄게 커질 때만 — 한 줄이 책등답다.
  if (two && fit(two) > fit(one) * 1.12) return { columns: two, font: fit(two) };
  return { columns: one, font: fit(one) };
}

/** 책장 위 한 권의 자리(cqw). hit = 누르는 자리를 양옆으로 넓힐 몫(옆 책과의 틈). */
export type PlacedSpine = { index: number; left: number; top: number; width: number; height: number; hit: number };

const INSET = 0.8; // 칸 벽에서 띄우는 거리 (cqw)
const GAP = 0.4; // 책 사이 최소 (cqw)
const MAX_GAP = 1.4; // 칸이 넉넉하면 이만큼까지 벌린다 — 폰에서 옆 책을 잘못 누르지 않게
const FILL = 0.98; // 책 높이 — 가장 낮은 칸(잰 뒤판 높이) 대비. 뒤판 위 그늘 자리가 남아 머리가 닿지 않는다

/** n 개를 k 묶음으로 순서대로, 앞 묶음부터 하나씩 더 많게 나눈다. */
function splitEven<T>(items: T[], k: number): T[][] {
  const out: T[][] = [];
  const base = Math.floor(items.length / k);
  let extra = items.length % k;
  let at = 0;
  for (let i = 0; i < k; i++) {
    const n = base + (extra-- > 0 ? 1 : 0);
    out.push(items.slice(at, at + n));
    at += n;
  }
  return out;
}

/**
 * 책들을 책장(들)에 꽂는다. 전집처럼 모두 같은 키로 서고, 칸마다 고르게 나눈다.
 * 칸마다 왼쪽·오른쪽을 번갈아 붙여 단조롭지 않게 하고, 한 책장에 다 안 들어가면
 * 책장을 하나 더 세운다(아래로 쌓인다).
 */
export function planBookcases(count: number, art: ShelfArt): PlacedSpine[][] {
  if (!count || !art.rows.length) return [];
  const rowH = Math.min(...art.rows.map((r) => (r.bottom - r.top) * art.aspect));
  const height = rowH * FILL;
  const width = height / art.spine.aspect;
  const perRow = Math.min(
    ...art.rows.map((r) => Math.floor((r.right - r.left - 2 * INSET + GAP) / (width + GAP))),
  );
  const perCase = Math.max(1, perRow) * art.rows.length;
  const indices = Array.from({ length: count }, (_, i) => i);
  const cases = splitEven(indices, Math.ceil(count / perCase));

  return cases.map((group) =>
    splitEven(group, art.rows.length).flatMap((rowBooks, r) => {
      const row = art.rows[r];
      const n = rowBooks.length;
      const free = row.right - row.left - 2 * INSET - n * width;
      const gap = n > 1 ? Math.max(GAP, Math.min(MAX_GAP, free / (n - 1))) : 0;
      const span = n * width + Math.max(0, n - 1) * gap;
      const start = r % 2 === 0 ? row.left + INSET : row.right - INSET - span;
      return rowBooks.map((index, k) => ({
        index,
        left: start + k * (width + gap),
        top: row.bottom * art.aspect - height,
        width,
        height,
        hit: gap,
      }));
    }),
  );
}
