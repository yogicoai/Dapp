import sharp from "sharp";
import { cleanHeadRatio } from "./family-head.ts";

/**
 * 인물 시트를 **가족 그림 원본 픽셀로** 짠다 — AI 가 고정 얼굴을 다시 그리지 않게(2026-09-29 사장님 "얼굴이 달라 특히").
 *
 * 예전엔 고정한 가족 그림을 참고로 붙여 AI 가 시트를 새로 그렸고(한 번 흐름), 쪽마다 그 시트를 보고 또 그렸다(두 번 흐름).
 * 이제 시트의 고정 가족 칸은 원본 그림 그대로다 — 첫 번째 흐름이 아예 없다.
 *  · 모두 고정이면: AI 를 부르지 않는다. 흰 바탕에 한 사람 한 칸, 위 줄 전신(실제 키 비율로 발끝 맞춤), 아래 줄 같은 그림에서
 *    오려 키운 얼굴(머리·어깨). 글자는 한 자도 넣지 않는다 — 누가 어느 칸인지는 쪽 그림 프롬프트가 말한다(sheetOrder).
 *  · 고정 안 한 사람이 섞이면: AI 가 그 사람들만 따로 한 장 그리고(api/character-sheet), 그 그림을 한 덩어리(block)로
 *    고정 가족 칸 옆에 붙인다. AI 그림에서 사람을 하나씩 오려 내지 않는다 — 자리를 알려면 상자 재기(값·실패)가 또 든다.
 *
 * 이 책의 옷(2026-09-29 저녁, 사장님 "옷은 그 주제안에서 랜덤으로 교체되게"): 원본 픽셀 시트는 가족 그림의 옷을 책마다 그대로
 * 입혔다. 이제 고정 가족이 이 책의 옷을 입으면 AI 가 **옷만**(사람 없이) 한 장 그리고(옷 카드, api/character-sheet),
 * 위 줄 전신 자리에 그 사람의 옷을 세운다. 아래 줄 얼굴은 그대로 원본 픽셀 — 얼굴은 여전히 한 번도 AI 를 거치지 않는다.
 *
 * 앞쪽은 순수 함수(칸 나누기·그림 속 사람 찾기) — node --test 로 시험한다(sheet-compose.test.ts). 끝의 sharp 함수들만 sharp 를 쓴다.
 * 상대 경로 + 확장자: node --test 가 "@/" 별칭을 모른다.
 */

export type Rect = { left: number; top: number; width: number; height: number };

/** 그림 속 사람 — scanFigure 가 잰 것(원본 픽셀 좌표) */
export type FigureScan = {
  /** 잉크(흰색 아닌 픽셀)가 있는 네모 = 전신 */
  box: Rect;
  /** 머리 가운데 가로 위치 */
  headCenterX: number;
  /** 머리 높이(머리카락 맨 위 ~ 턱) — 전신 높이 ÷ 머리 비율 */
  headHeight: number;
  imageWidth: number;
  imageHeight: number;
};

/** 이보다 어두우면 잉크(가족 참고 그림은 흰 바탕 JPEG — JPEG 번짐은 245 안팎이라 넉넉히 둔다) */
export const INK_MAX = 236;

/**
 * 흰 바탕 그림에서 사람(잉크)의 네모와 머리 가운데를 찾는다.
 * gray: 한 픽셀 channels 바이트(첫 바이트 = 밝기). 줄마다 잉크가 몇 개 이상인 줄만 센다 — 바탕에 튄 점 하나에 네모가 늘지 않게.
 * 머리 가운데 = 머리 띠(위에서 머리 높이의 15~85%)의 줄마다 잉크 왼끝·오른끝 가운데의 중앙값 — 한쪽으로 묶은 머리에 덜 끌린다.
 * 사람이 없으면 null.
 */
export function scanFigure(
  gray: Uint8Array,
  width: number,
  height: number,
  headRatio: number,
  channels = 1,
): FigureScan | null {
  if (width <= 0 || height <= 0 || gray.length < width * height * channels) return null;
  const ink = (x: number, y: number) => gray[(y * width + x) * channels] < INK_MAX;
  const minRowInk = Math.max(2, Math.round(width * 0.004));
  const minColInk = Math.max(2, Math.round(height * 0.004));

  let top = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    let n = 0;
    for (let x = 0; x < width && n < minRowInk; x++) if (ink(x, y)) n++;
    if (n >= minRowInk) {
      if (top < 0) top = y;
      bottom = y;
    }
  }
  if (top < 0) return null;

  let left = -1;
  let right = -1;
  for (let x = 0; x < width; x++) {
    let n = 0;
    for (let y = top; y <= bottom && n < minColInk; y++) if (ink(x, y)) n++;
    if (n >= minColInk) {
      if (left < 0) left = x;
      right = x;
    }
  }
  if (left < 0) return null;

  const boxHeight = bottom - top + 1;
  const ratio = Number.isFinite(headRatio) && headRatio > 1 ? headRatio : 5;
  const headHeight = Math.max(1, Math.min(boxHeight, Math.round(boxHeight / ratio)));
  const bandTop = top + Math.floor(headHeight * 0.15);
  const bandBottom = Math.max(bandTop, top + Math.ceil(headHeight * 0.85) - 1);
  const mids: number[] = [];
  for (let y = bandTop; y <= Math.min(bandBottom, bottom); y++) {
    let l = -1;
    let r = -1;
    for (let x = left; x <= right; x++) {
      if (!ink(x, y)) continue;
      if (l < 0) l = x;
      r = x;
    }
    if (l >= 0) mids.push((l + r) / 2);
  }
  mids.sort((a, b) => a - b);
  const headCenterX = mids.length ? mids[Math.floor(mids.length / 2)] : (left + right) / 2;
  return {
    box: { left, top, width: right - left + 1, height: boxHeight },
    headCenterX: Math.round(headCenterX),
    headHeight,
    imageWidth: width,
    imageHeight: height,
  };
}

/* ─────────────────────────────── 칸 나누기 ─────────────────────────────── */

/**
 * 칸 모양 — 길이는 '내용 높이'(여백 뺀 세로)에 대한 비율, margin 만 픽셀.
 * column: 고정 가족 한 칸의 너비. 어른 전신(가로:세로 ≈ 1:3)이 위 줄에 들어가고, 아래 줄 얼굴 칸이 넉넉하게.
 * maxSide: 긴 변 — 쪽 그림 참고로 올리는 다른 그림(shrinkForReference 1024)과 같게. 사람이 많으면 내용 높이가 minContent 아래로
 *   떨어지지 않게 가로만 maxWidth 까지 늘린다(얼굴이 너무 작아지지 않게).
 */
export const SHEET_LAYOUT = {
  margin: 32,
  column: 0.4,
  topShare: 0.6,
  rowGap: 0.04,
  /** 가장 큰 사람이 위 줄 높이의 이만큼 */
  figureFill: 0.96,
  /** 전신이 칸 너비의 이만큼을 넘으면 모두 같은 배율로 줄인다 */
  columnFill: 0.9,
  /** 아래 줄 얼굴이 칸의 이만큼까지 */
  closeupFill: 0.94,
  /** 얼굴 오리기 높이 = 머리 높이 × 이 값(머리 + 목 + 어깨) */
  closeupHeads: 1.6,
  /** 머리 위 여백 = 머리 높이 × 이 값 */
  headroom: 0.1,
  maxSide: 1024,
  minContent: 520,
  maxWidth: 1600,
} as const;

/** 키(cm) 범위 — 요청 값은 이 안으로 */
export const SHEET_HEIGHT_MIN_CM = 60;
export const SHEET_HEIGHT_MAX_CM = 200;

/**
 * 한 칸 — 고정 가족 한 사람(figure) 또는 AI 가 그린 나머지 사람들 덩어리(block, aspect = 가로 ÷ 세로).
 * figure.outfit — 옷 카드에서 잰 그 사람의 옷(카드 좌표). 있으면 위 줄에 원본 전신 대신 이 옷을 세운다(아래 줄 얼굴은 원본 그대로).
 */
export type SheetSlot =
  | { kind: "figure"; name: string; scan: FigureScan; heightCm: number; outfit?: FigureScan }
  | { kind: "block"; names: readonly string[]; aspect: number };

/** top — 위 줄이 원본 전신(portrait)인지 옷 카드의 옷(outfit)인지. 옷이면 figure.crop 은 옷 카드 좌표다. */
export type PlannedSlot =
  | {
      kind: "figure";
      name: string;
      top: "portrait" | "outfit";
      figure: { crop: Rect; place: Rect };
      closeup: { crop: Rect; place: Rect };
    }
  | { kind: "block"; names: readonly string[]; place: Rect };

export type SheetPlan = { width: number; height: number; slots: PlannedSlot[]; order: string[] };

const clampInt = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)));

/** 캔버스 안으로 — 반올림으로 1px 넘치는 것까지 막는다(sharp composite 는 넘치면 던진다). */
function inside(r: Rect, width: number, height: number): Rect {
  const left = clampInt(r.left, 0, width - 1);
  const top = clampInt(r.top, 0, height - 1);
  return {
    left,
    top,
    width: clampInt(r.width, 1, width - left),
    height: clampInt(r.height, 1, height - top),
  };
}

/**
 * 칸 나누기 — 왼쪽부터 slots 순서대로.
 *  · 고정 가족 칸: 위 줄 전신은 **실제 키 비율**로 발끝을 맞춘다(아이는 작게). 누가 칸보다 넓으면 모두 같은 배율로 줄인다.
 *    아래 줄은 같은 원본에서 머리·어깨를 오려 키운 것 — 그림이 아니라 원본 픽셀이다.
 *  · 덩어리 칸: AI 그림을 내용 높이에 맞춰 통째로(가로 = aspect × 내용 높이).
 *  · 옷 칸(figure.outfit): 위 줄은 옷 카드의 옷 — 키 비율로(아이 옷이 작게) 발끝 줄에 세우되, 칸보다 넓으면 **그 옷만** 줄인다
 *    (옷을 옆으로 늘어놓아 넓게 그린 카드 하나에 모든 사람이 작아지지 않게). 아래 줄 얼굴은 원본 그대로.
 */
export function planComposedSheet(slots: readonly SheetSlot[]): SheetPlan {
  const L = SHEET_LAYOUT;
  if (slots.length === 0) throw new Error("시트에 넣을 사람이 없습니다.");
  const units = slots.reduce((sum, s) => sum + (s.kind === "figure" ? L.column : Math.max(0.2, s.aspect)), 0);
  const room = L.maxSide - 2 * L.margin;
  let content = Math.min(room, room / units);
  if (content < L.minContent) content = Math.min(L.minContent, (L.maxWidth - 2 * L.margin) / units);
  const width = Math.round(units * content + 2 * L.margin);
  const height = Math.round(content + 2 * L.margin);

  const colW = L.column * content;
  const topH = L.topShare * content;
  const gap = L.rowGap * content;
  const bottomH = content - topH - gap;

  const figures = slots.filter((s): s is Extract<SheetSlot, { kind: "figure" }> => s.kind === "figure");
  const cmOf = (s: { heightCm: number }) => clampInt(s.heightCm, SHEET_HEIGHT_MIN_CM, SHEET_HEIGHT_MAX_CM);
  const tallest = Math.max(1, ...figures.map(cmOf));
  const targetH = (s: Extract<SheetSlot, { kind: "figure" }>) => topH * L.figureFill * (cmOf(s) / tallest);
  // 칸보다 넓은 전신이 있으면 모두 같은 배율로 줄인다 — 키 비율은 그대로. 옷 칸은 아래에서 저마다 맞춘다.
  const shrink = Math.min(
    1,
    ...figures.filter((s) => !s.outfit).map((s) => {
      const w = (s.scan.box.width * targetH(s)) / s.scan.box.height;
      return w > 0 ? (colW * L.columnFill) / w : 1;
    }),
  );

  const planned: PlannedSlot[] = [];
  let x = L.margin;
  for (const s of slots) {
    if (s.kind === "block") {
      const bw = Math.max(0.2, s.aspect) * content;
      planned.push({
        kind: "block",
        names: s.names,
        place: inside({ left: x, top: L.margin, width: bw, height: content }, width, height),
      });
      x += bw;
      continue;
    }
    const { box, headHeight, headCenterX, imageWidth, imageHeight } = s.scan;
    // 위 줄 — 전신(또는 이 책의 옷), 발끝 맞춤
    const top = s.outfit ?? s.scan;
    let h = targetH(s) * shrink;
    let w = (top.box.width * h) / top.box.height;
    if (s.outfit && w > colW * L.columnFill) {
      h *= (colW * L.columnFill) / w;
      w = colW * L.columnFill;
    }
    const figure = {
      crop: inside(top.box, top.imageWidth, top.imageHeight),
      place: inside({ left: x + (colW - w) / 2, top: L.margin + topH - h, width: w, height: h }, width, height),
    };
    // 아래 줄 — 머리·어깨 오리기
    const cellW = colW * L.closeupFill;
    const cellH = bottomH * L.closeupFill;
    const cropTop = Math.max(0, Math.round(box.top - headHeight * L.headroom));
    const cropH = Math.max(1, Math.min(imageHeight - cropTop, Math.round(headHeight * L.closeupHeads + (box.top - cropTop))));
    const cropW = Math.max(1, Math.min(imageWidth, Math.round((cropH * cellW) / cellH)));
    const cropLeft = clampInt(headCenterX - cropW / 2, 0, imageWidth - cropW);
    const scale = Math.min(cellW / cropW, cellH / cropH);
    const pw = cropW * scale;
    const ph = cropH * scale;
    const closeup = {
      crop: inside({ left: cropLeft, top: cropTop, width: cropW, height: cropH }, imageWidth, imageHeight),
      place: inside(
        { left: x + (colW - pw) / 2, top: L.margin + topH + gap + (bottomH - ph) / 2, width: pw, height: ph },
        width,
        height,
      ),
    };
    planned.push({ kind: "figure", name: s.name, top: s.outfit ? "outfit" : "portrait", figure, closeup });
    x += colW;
  }
  const order = planned.flatMap((p) => (p.kind === "figure" ? [p.name] : [...p.names]));
  return { width, height, slots: planned, order };
}

/**
 * 칸 순서 — 고정 가족(figure)과 AI 가 그린 나머지(block 하나)를 어떻게 세울지.
 * 나머지 사람들이 이야기 순서에서 붙어 있으면(하온·서연·엄마 → 서연 하나, 또는 끝에 친구 둘) 그 자리에 덩어리를 넣어
 * **이야기 순서 그대로** 선다. 떨어져 있으면(고정·안 고정이 번갈아) 고정 가족을 먼저 세우고 덩어리를 끝에 — 그때는
 * 쪽 그림 프롬프트의 sheetOrder 줄이 누가 어디 있는지 알려 준다.
 */
export function sheetSlotOrder(
  names: readonly string[],
  fixed: ReadonlySet<string>,
): { layout: ({ kind: "figure"; name: string } | { kind: "block"; names: string[] })[]; order: string[] } {
  const others = names.filter((n) => !fixed.has(n));
  const figures = names.filter((n) => fixed.has(n)).map((name) => ({ kind: "figure" as const, name }));
  if (others.length === 0) return { layout: figures, order: [...names] };
  const idx = others.map((n) => names.indexOf(n));
  const together = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  const block = { kind: "block" as const, names: others };
  const at = together ? names.slice(0, idx[0]).filter((n) => fixed.has(n)).length : figures.length;
  const layout = [...figures.slice(0, at), block, ...figures.slice(at)];
  return { layout, order: layout.flatMap((s) => (s.kind === "figure" ? [s.name] : s.names)) };
}

/** 나머지 사람들만 그리는 AI 시트의 비율 — 한 명이면 세로(전신 + 얼굴이 한 칸), 둘이면 정사각, 셋부터 가로. */
export function subSheetAspect(count: number): "3:4" | "1:1" | "4:3" {
  return count <= 1 ? "3:4" : count === 2 ? "1:1" : "4:3";
}

/**
 * 한 사람의 키·머리 비율 — 요청 값(만들기 화면이 가족에서 읽어 보냄)이 이상하면 사람 id 로 짐작한다.
 * 키: 60~200cm 로 자른다. 없으면 아이 110 · 엄마 163 · 아빠 175 · 그 밖 150(lib/family 표의 '보통').
 * 머리 비율: 그린 뒤 잰 값(FamilyPortrait.headRatio, lib/family-head cleanHeadRatio). 없으면 아이 4.4 · 어른 5.6 —
 *   그림 모델이 표(아이 1:5 · 어른 1:7)보다 머리를 20% 안팎 크게 그리는 버릇을 친 값이다. 얼굴 오리기에만 쓴다.
 */
export function sheetFigureMeta(
  memberId: string,
  raw: { heightCm?: unknown; headRatio?: unknown },
): { heightCm: number; headRatio: number; kid: boolean } {
  const fallbackCm = memberId === "child" ? 110 : memberId === "mom" ? 163 : memberId === "dad" ? 175 : 150;
  const heightCm =
    typeof raw.heightCm === "number" && Number.isFinite(raw.heightCm)
      ? clampInt(raw.heightCm, SHEET_HEIGHT_MIN_CM, SHEET_HEIGHT_MAX_CM)
      : fallbackCm;
  const kid = memberId === "child" || (memberId !== "mom" && memberId !== "dad" && heightCm < 140);
  return { heightCm, headRatio: cleanHeadRatio(raw.headRatio) ?? (kid ? 4.4 : 5.6), kid };
}

/* ─────────────────────────────── 옷 카드 ─────────────────────────────── */

/*
 * 옷 카드 — 고정 가족이 이 책에서 입는 옷을 사람 없이 한 장에 그린 것(api/character-sheet, 프롬프트는 lib/sheet-prompt
 * outfitCardPrompt). 왼쪽부터 사람 순서대로 한 벌씩, 칸 사이는 흰 여백이다. 여기서 한 벌씩 잘라 시트 위 줄에 세운다.
 */

/**
 * 옷 카드를 n 칸으로 나눈다(왼쪽부터). 칸 경계(k/n)마다 좌우 칸 너비의 절반 안에서 **잉크 없는 세로 줄이 가장 길게 이어진 곳**의
 * 가운데를 자른다 — AI 는 칸을 정확히 같은 너비로 그리지 않는다. 빈 줄이 없으면(옷이 붙어 있음) k/n 자리에서 자른다.
 * gray: 한 픽셀 channels 바이트(첫 바이트 = 밝기). 돌려주는 것 = 칸마다 { left, width }(카드 픽셀).
 */
export function splitCardColumns(
  gray: Uint8Array,
  width: number,
  height: number,
  n: number,
  channels = 1,
): { left: number; width: number }[] {
  const count = Math.max(1, Math.round(n));
  if (count === 1 || width < count * 2) return [{ left: 0, width: Math.max(0, width) }];
  const minColInk = Math.max(2, Math.round(height * 0.004));
  const inky: boolean[] = [];
  for (let x = 0; x < width; x++) {
    let k = 0;
    for (let y = 0; y < height && k < minColInk; y++) if (gray[(y * width + x) * channels] < INK_MAX) k++;
    inky.push(k >= minColInk);
  }
  const half = Math.floor(width / (2 * count));
  const cuts = [0];
  for (let k = 1; k < count; k++) {
    const at = Math.round((k * width) / count);
    const lo = Math.max(cuts[cuts.length - 1] + 1, at - half);
    const hi = Math.min(width - 1, at + half);
    // 가장 긴 빈 줄 — 길이가 같으면 k/n 자리에 가까운 쪽
    let best: { start: number; len: number } | null = null;
    for (let x = lo; x <= hi; ) {
      if (inky[x]) {
        x++;
        continue;
      }
      const start = x;
      while (x <= hi && !inky[x]) x++;
      const len = x - start;
      const mid = start + len / 2;
      if (
        !best ||
        len > best.len ||
        (len === best.len && Math.abs(mid - at) < Math.abs(best.start + best.len / 2 - at))
      ) {
        best = { start, len };
      }
    }
    const cut = best ? Math.round(best.start + best.len / 2) : at;
    cuts.push(Math.min(width - 1, Math.max(cuts[cuts.length - 1] + 1, cut)));
  }
  cuts.push(width);
  return cuts.slice(0, -1).map((left, i) => ({ left, width: cuts[i + 1] - left }));
}

/* ─────────────────────────────── 옷 색 ─────────────────────────────── */

/*
 * 가족 그림 속 옷 색 — 섞인 시트에서 AI 가 나머지 사람(친구)을 그릴 때 "이 사람들과 옷 색을 다르게"라고 알려 주려고.
 * 그 AI 는 가족 그림을 보지 않고 클로드의 설명 글만 본다. 그런데 짠 시트의 가족 옷은 설명 글의 옷이 아니라 **그림의 옷**이다
 * (설명엔 '노란 티셔츠', 그림은 하늘색). 글만 믿으면 친구를 하늘색 옷에 비슷한 단발로 그려 주인공의 쌍둥이가 된다 —
 * 이 앱에서 가장 잦은 그림 오류(검토 2026-09-29). 그래서 픽셀에서 직접 잰다.
 * 가슴 한가운데(머리 아래 ~ 허리 위, 머리 가운데에서 좌우 머리 높이의 0.35)만 본다 — 팔·얼굴·목이 덜 섞이게.
 */

/** 가족 그림에서 윗옷을 볼 네모(원본 픽셀 좌표). 너무 작으면 null. */
export function torsoRegion(scan: FigureScan): Rect | null {
  const { box, headHeight, headCenterX } = scan;
  const top = Math.round(box.top + headHeight * 1.4);
  const bottom = Math.min(box.top + box.height, Math.round(box.top + Math.min(headHeight * 2.4, box.height * 0.55)));
  const half = headHeight * 0.35;
  const left = Math.max(box.left, Math.round(headCenterX - half));
  const right = Math.min(box.left + box.width, Math.round(headCenterX + half));
  if (bottom - top < 4 || right - left < 4) return null;
  return { left, top, width: right - left, height: bottom - top };
}

function hsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  if (max !== min) {
    const d = max - min;
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? (max - min) / max : 0, v: max / 255 };
}

/** 한 픽셀의 색 갈래 — 종이(거의 흰색)는 null */
function colourFamily(r: number, g: number, b: number): string | null {
  const { h, s, v } = hsv(r, g, b);
  if (s < 0.06 && v > 0.93) return null;
  if (s < 0.06) return v < 0.3 ? "black" : v < 0.85 ? "grey" : "white";
  if (v < 0.22) return "black";
  if (h < 10 || h >= 340) return "red";
  if (h < 38) return v < 0.6 ? "brown" : "orange";
  if (h < 65) return "yellow";
  if (h < 160) return "green";
  if (h < 180) return "teal";
  if (h < 250) return "blue";
  if (h < 285) return "purple";
  return "pink";
}

/** 갈래 + 그 갈래의 평균 색 → 이름(수채화는 옅은 색이 많아 pale·light 를 가른다) */
function colourName(family: string, r: number, g: number, b: number): string {
  if (family === "black" || family === "grey" || family === "white" || family === "brown") return family;
  const { h, s, v } = hsv(r, g, b);
  const pale = s < 0.22 && v > 0.7;
  const light = !pale && s < 0.45 && v > 0.75;
  const dark = v < 0.45;
  if (family === "orange") return pale || light ? (h < 30 ? "peach" : "beige") : "orange";
  if (family === "yellow") return dark ? "olive" : pale ? "cream" : light ? "light yellow" : "yellow";
  if (family === "red") return dark ? "dark red" : pale || light ? "pink" : "red";
  if (family === "blue" && dark) return "navy";
  return `${dark ? "dark " : pale ? "pale " : light ? "light " : ""}${family}`;
}

/** 옷 색으로 칠 만큼 한 갈래가 차지해야 하는 몫·최소 픽셀 수 — 못 미치면(줄무늬·무늬 옷) 말하지 않는다. */
const OUTFIT_SHARE_MIN = 0.4;
const OUTFIT_PIXELS_MIN = 30;

/**
 * 윗옷 네모의 픽셀(RGB/RGBA, channels 바이트씩)에서 가장 많은 색 — "pale blue (#c7dadc)" 꼴. 알 수 없으면 null.
 * 이름과 함께 16진 색을 준다 — 그림 모델은 둘 다 읽는다.
 */
export function outfitColour(rgb: Uint8Array, channels: number): string | null {
  if (channels < 3) return null;
  const acc = new Map<string, { n: number; r: number; g: number; b: number }>();
  let total = 0;
  for (let i = 0; i + 2 < rgb.length; i += channels) {
    const fam = colourFamily(rgb[i], rgb[i + 1], rgb[i + 2]);
    if (!fam) continue;
    total++;
    const a = acc.get(fam) ?? { n: 0, r: 0, g: 0, b: 0 };
    a.n++;
    a.r += rgb[i];
    a.g += rgb[i + 1];
    a.b += rgb[i + 2];
    acc.set(fam, a);
  }
  let best: [string, { n: number; r: number; g: number; b: number }] | null = null;
  for (const entry of acc) if (!best || entry[1].n > best[1].n) best = entry;
  if (!best || best[1].n < OUTFIT_PIXELS_MIN || best[1].n / total < OUTFIT_SHARE_MIN) return null;
  const [fam, a] = best;
  const [r, g, b] = [a.r / a.n, a.g / a.n, a.b / a.n].map((x) => Math.round(x));
  const hex = [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${colourName(fam, r, g, b)} (#${hex})`;
}

/* ─────────────────────────────── sharp ─────────────────────────────── */

type ImageData = { mimeType: string; data: string };

/**
 * 짜기 전에 원본을 읽어 사람을 찾아 둔 것.
 * outfit — 그림 속 윗옷 색(outfitColour). 못 재면 null — 시트 짜기는 그대로 한다(나머지 그림 프롬프트에 색 줄만 빠진다).
 */
export type PreparedFigure = { name: string; buffer: Buffer; scan: FigureScan; heightCm: number; outfit: string | null };

/**
 * 가족 참고 그림 한 장을 읽어 사람을 찾는다. 못 읽거나 사람이 없으면 던진다 —
 * 부르는 쪽(api/character-sheet)은 AI 를 부르기 **전에** 이걸 끝내, 여기서 실패하면 예전 AI 시트로 물러선다.
 */
export async function prepareSheetFigure(input: {
  name: string;
  image: ImageData;
  heightCm: number;
  headRatio: number;
}): Promise<PreparedFigure> {
  const buffer = Buffer.from(input.image.data, "base64");
  const { data, info } = await sharp(buffer)
    .flatten({ background: "#ffffff" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const scan = scanFigure(data, info.width, info.height, input.headRatio, info.channels);
  if (!scan) throw new Error("가족 그림에서 사람을 찾지 못했어요.");
  let outfit: string | null = null;
  const torso = torsoRegion(scan);
  if (torso) {
    try {
      const px = await sharp(buffer)
        .flatten({ background: "#ffffff" })
        .extract(torso)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      outfit = outfitColour(px.data, px.info.channels);
    } catch {
      // 옷 색은 덤이다 — 못 재도 시트는 짠다.
    }
  }
  return { name: input.name, buffer, scan, heightCm: input.heightCm, outfit };
}

/** 옷 카드를 읽어 사람마다 옷을 찾아 둔 것 — scans 는 이름 → 그 사람 옷의 네모(카드 좌표). */
export type PreparedOutfitCard = { buffer: Buffer; scans: Map<string, FigureScan> };

/** 옷 카드에서 한 벌이 카드 높이의 이만큼은 돼야 한다 — 신발 한 켤레만 있는 칸(잘못 나눔)을 걸러 낸다. */
const OUTFIT_MIN_HEIGHT_SHARE = 0.2;

/** 이보다 어두우면 '흰 바탕이 아님' — 순백(#FFFFFF)으로 그리라 했으니 바탕은 250 넘게 나온다. 견본 종이는 242 안팎. */
const CARD_WHITE_MIN = 248;

/**
 * 카드 가장자리(네 변, 짧은 변의 2% 띠) 가운데 **반 넘게 흰색이 아닌** 변이 몇 개인가.
 * 그림체 견본(수채화)의 크림색 종이를 따라 그리면 바탕이 236~247 로 깔리고, 종이 결·물감 번짐이 군데군데 잉크(INK_MAX 아래)로
 * 읽힌다(public/art-styles/style_01.webp 로 재 봄 — 네 변 모두 95% 넘게 248 아래, 검토 2026-09-29). 그러면 두 벌 이상은 칸 사이
 * 흰 줄을 못 찾아 던지고, 한 벌이면 종이 전체가 옷 네모가 되어 시트 위에 크림색 판이 선다. 옷이 한두 변에 닿는 것은 괜찮다 —
 * 세 변 이상이면 종이다.
 */
function tintedSides(gray: Uint8Array, width: number, height: number, channels: number): number {
  const band = Math.max(2, Math.round(Math.min(width, height) * 0.02));
  const share = (x0: number, y0: number, x1: number, y1: number) => {
    let tinted = 0;
    let all = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        all++;
        if (gray[(y * width + x) * channels] < CARD_WHITE_MIN) tinted++;
      }
    }
    return all ? tinted / all : 0;
  };
  return [
    share(0, 0, width, band),
    share(0, height - band, width, height),
    share(0, 0, band, height),
    share(width - band, 0, width, height),
  ].filter((v) => v > 0.5).length;
}

/**
 * 옷 카드(AI, 사람 없이 옷만)를 읽어 names 순서(왼쪽부터)로 한 벌씩 찾는다.
 * 이럴 때 던진다 — 부르는 쪽(api/character-sheet)은 옷 카드 없이 예전처럼(가족 그림의 옷으로) 시트를 짠다:
 *  · 칸 경계에 위아래로 이어진 흰 줄이 없다 — 옷이 붙었거나 사람 수보다 적게 그렸다. 억지로 자르면 한 사람이 옷 반 벌을 입는다.
 *  · 어느 칸에 옷이 없거나 너무 작다(카드 높이의 20% 아래).
 *  · 한 칸이 바탕까지 통째로 잉크다(흰 바탕이 아님) · 가장자리 세 변 이상이 흰색이 아니다(종이 — tintedSides).
 *  · kids(names 와 같은 순서, 아이면 true)를 주면 — 어느 아이 옷이 어느 어른 옷보다 **뚜렷이 크다**. 순서가 뒤바뀐 카드다
 *    (아빠 옷을 첫 칸에 그림). 칸은 자리로 이름에 붙으니 그대로 쓰면 하온이 아빠 옷을 입는다. 같은 크기로 그린 것은 받는다 —
 *    시트는 어차피 키 비율로 다시 세우고, 크기가 같다고 버리면 맞게 그린 카드 값(약 95원)을 버린다.
 * 사람·얼굴·마네킹이 그려졌는지는 여기서 못 본다(돈 드는 그림 읽기가 필요 — 사장님 확인 전엔 안 붙인다).
 */
export async function prepareOutfitCard(input: {
  image: ImageData;
  names: readonly string[];
  kids?: readonly boolean[];
}): Promise<PreparedOutfitCard> {
  if (input.names.length === 0) throw new Error("옷 카드에 세울 사람이 없습니다.");
  const buffer = Buffer.from(input.image.data, "base64");
  const { data, info } = await sharp(buffer)
    .flatten({ background: "#ffffff" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (tintedSides(data, width, height, channels) >= 3) throw new Error("옷 카드 바탕이 흰색이 아니에요(종이 결).");
  const columns = splitCardColumns(data, width, height, input.names.length, channels);
  const minColInk = Math.max(2, Math.round(height * 0.004));
  for (const col of columns.slice(1)) {
    let k = 0;
    for (let y = 0; y < height && k < minColInk; y++) if (data[(y * width + col.left) * channels] < INK_MAX) k++;
    if (k >= minColInk) throw new Error("옷 카드의 옷 사이에 빈 곳이 없어요(옷이 붙었거나 수가 모자라요).");
  }
  const scans = new Map<string, FigureScan>();
  columns.forEach((col, i) => {
    // 칸만 떼어 scanFigure 로 잰다(머리 비율은 옷에 쓰지 않는다 — 아무 값).
    const sub = new Uint8Array(col.width * height * channels);
    for (let y = 0; y < height; y++) {
      const from = (y * width + col.left) * channels;
      sub.set(data.subarray(from, from + col.width * channels), y * col.width * channels);
    }
    const found = scanFigure(sub, col.width, height, 5, channels);
    if (!found || found.box.height < height * OUTFIT_MIN_HEIGHT_SHARE) throw new Error(`옷 카드 ${i + 1}째 칸에 옷이 없어요.`);
    if (found.box.width >= col.width * 0.98 && found.box.height >= height * 0.98) {
      throw new Error(`옷 카드 ${i + 1}째 칸이 흰 바탕이 아니에요.`);
    }
    scans.set(input.names[i], {
      ...found,
      box: { ...found.box, left: found.box.left + col.left },
      headCenterX: found.headCenterX + col.left,
      imageWidth: width,
      imageHeight: height,
    });
  });
  // 순서가 뒤바뀐 카드 — 아이 옷이 어느 어른 옷보다 뚜렷이(10% 넘게) 크다.
  if (input.kids?.length === input.names.length) {
    const heightOf = (i: number) => scans.get(input.names[i])?.box.height ?? 0;
    const kidRows = input.names.map((_, i) => i).filter((i) => input.kids![i]);
    const adultRows = input.names.map((_, i) => i).filter((i) => !input.kids![i]);
    if (kidRows.some((k) => adultRows.some((a) => heightOf(k) > heightOf(a) * 1.1))) {
      throw new Error("옷 카드의 아이 옷이 어른 옷보다 커요(순서가 뒤바뀐 듯해요).");
    }
  }
  return { buffer, scans };
}

/**
 * 시트 한 장을 짠다 — 흰 바탕, 글자 없음, JPEG(쪽 그림 참고로 매번 다시 올라가니 작게).
 * names: 시트에 설 모든 사람(이야기 순서). figures 에 없는 사람은 block(AI 가 그린 나머지)에 있어야 한다.
 * outfits: 옷 카드(prepareOutfitCard) — 있으면 거기 있는 사람의 위 줄은 이 책의 옷, 아래 줄 얼굴은 원본 그대로.
 * 돌려주는 order = 왼쪽부터 선 순서(쪽 그림 프롬프트가 말한다).
 */
export async function composeCharacterSheet(input: {
  names: readonly string[];
  figures: readonly PreparedFigure[];
  block?: { image: ImageData } | null;
  outfits?: PreparedOutfitCard | null;
}): Promise<{ image: ImageData; order: string[]; width: number; height: number }> {
  const byName = new Map(input.figures.map((f) => [f.name, f]));
  const { layout } = sheetSlotOrder(input.names, new Set(byName.keys()));
  const blockBuf = input.block ? Buffer.from(input.block.image.data, "base64") : null;
  let blockAspect = 1;
  if (layout.some((s) => s.kind === "block")) {
    if (!blockBuf) throw new Error("고정 안 한 사람의 그림이 없습니다.");
    const meta = await sharp(blockBuf).metadata();
    if (!meta.width || !meta.height) throw new Error("고정 안 한 사람의 그림을 읽지 못했습니다.");
    blockAspect = meta.width / meta.height;
  }
  const slots: SheetSlot[] = layout.map((s) => {
    if (s.kind === "block") return { kind: "block", names: s.names, aspect: blockAspect };
    const f = byName.get(s.name)!;
    const outfit = input.outfits?.scans.get(f.name);
    return { kind: "figure", name: f.name, scan: f.scan, heightCm: f.heightCm, ...(outfit ? { outfit } : {}) };
  });
  const plan = planComposedSheet(slots);

  const layers: sharp.OverlayOptions[] = [];
  for (const p of plan.slots) {
    if (p.kind === "block") {
      const input = await sharp(blockBuf!)
        .flatten({ background: "#ffffff" })
        .resize(p.place.width, p.place.height, { fit: "contain", background: "#ffffff" })
        .png()
        .toBuffer();
      layers.push({ input, left: p.place.left, top: p.place.top });
      continue;
    }
    const f = byName.get(p.name)!;
    for (const part of [p.figure, p.closeup]) {
      // 위 줄이 옷이면 옷 카드에서, 아래 줄 얼굴은 늘 원본에서
      const source = part === p.figure && p.top === "outfit" && input.outfits ? input.outfits.buffer : f.buffer;
      const layer = await sharp(source)
        .flatten({ background: "#ffffff" })
        .extract(part.crop)
        .resize(part.place.width, part.place.height, { fit: "fill" })
        .png()
        .toBuffer();
      layers.push({ input: layer, left: part.place.left, top: part.place.top });
    }
  }
  const out = await sharp({
    create: { width: plan.width, height: plan.height, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite(layers)
    .jpeg({ quality: 86 })
    .toBuffer();
  return { image: { mimeType: "image/jpeg", data: out.toString("base64") }, order: plan.order, width: plan.width, height: plan.height };
}
