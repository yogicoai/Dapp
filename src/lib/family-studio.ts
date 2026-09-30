/**
 * 가족 사진관 — 고른 배경·붙인 스티커의 모양, 불러올 때 거르기, 바꾸기(reducer).
 *
 * 사장님 2026-09-30 가벼운 판(목록·까닭은 lib/family-studio-catalog 머리말): 배경 하나 고르기(기본 = 나라 배경) +
 * 스티커 STUDIO_MAX 개까지(붙이기·끌어 옮기기·크기·떼기). 돌리기·겹침 순서·마음대로 적는 글자는 없다.
 * 같은 날 2차: 그림 스티커 + **글자 스티커**(정해 둔 문구, 그림·글자 합쳐 8개까지), 크기는 작게·보통·크게 셋 대신
 * **배율(scale)** — 밀대로 잘게, 두 손가락으로 벌리고 오므려서(pinchScale).
 *
 * 저장은 계정마다 — ChildPrefs.familyStudio(profiles.child, 회원이 고칠 수 있는 유일한 칸). 홈 접힘(homeFamilyFolded)
 * 과 같은 길이다: saveChild 가 이 기기(localStorage)에 바로 쓰고 800ms 뒤 서버에 올린다(시트를 닫거나 앱을 내리면
 * 바로 — flushChildSave). 다른 기기·서버 값과 합칠 때는 **나중에 꾸민 값(at)이 이긴다**(newerStudio — mergeRemoteChild·
 * pushChild). 빈 값({ bg: null, stickers: [] })도 그대로 둔다 — 한 기기에서 되돌린 것이 이겨야 한다.
 *
 * 자리(x·y)는 사진 상자의 0~1 비율(스티커 가운데) — 홈(200·240px)·모아 보기(186px)·완성(224px) 어디서나 같은 자리다.
 * 크기는 사진 **높이**의 비율 × 배율 — 액자 높이가 달라도 같은 모습:
 *  - 그림 스티커 한 변 = 높이 × STICKER_BASE(0.28 — 예전 '보통') × scale
 *  - 글자 스티커 글자 크기 = 높이 × TEXT_BASE × scale
 * 예전 저장값(size: 's'|'m'|'l')은 불러올 때 배율로 옮긴다(LEGACY_SIZE_SCALE — 예전과 같은 크기).
 *
 * 브라우저가 부르는 순수 함수만(sharp·fetch 없음). prefs 를 부르지 않는다(prefs 가 이 파일을 부른다).
 */

import {
  STUDIO_BACKGROUNDS,
  STUDIO_GROUPS,
  STUDIO_STICKERS,
  STUDIO_TEXT_STICKERS,
  type AnyStickerDef,
  type StudioBackground,
  type StudioGroup,
} from "./family-studio-catalog.ts";
import { isOutfitTheme, outfitBackground, readOutfitTheme, type OutfitThemeId } from "./family-outfit.ts";

/**
 * 붙인 스티커 하나 — icon 은 그림 스티커 이름 또는 글자 스티커 id(txt-…), x·y 는 스티커 가운데(사진 상자의 0~1 비율),
 * scale 은 크기 배율(SCALE_MIN~SCALE_MAX — 글자 스티커는 TEXT_SCALE_MIN 부터, 1 = 예전 '보통').
 */
export type StudioSticker = { icon: string; x: number; y: number; scale: number };
/**
 * bg = 배경 slug(lib/family-studio-catalog), null = 동화 나라(기본 — 지금 나라 배경).
 * outfit = 가족이 함께 입은 테마 옷(lib/family-outfit — 사장님 2026-09-30 '옷 갈아입기'). 없으면 평소 옷. 사람마다 그 테마 옷이
 *   있고 지금 얼굴 그림에서 만든 것일 때만 단체 사진이 그 옷을 세운다(FamilyGroupPhoto — 없는 사람은 평소 옷).
 * at = 마지막으로 꾸민 때(ISO) — 기기·서버 값을 합칠 때 **더 새것이 이긴다**(newerStudio, 가족 familyAt 과 같은 방식).
 * 꾸미기 시트가 바꿀 때마다 찍는다(stampStudio). 없으면 가장 옛것으로 본다.
 * 칸 순서는 늘 bg · stickers · outfit · at(저장값을 글자로 견주는 곳이 있어 같은 값이면 같은 글자가 되게).
 */
export type FamilyStudio = { bg: string | null; stickers: StudioSticker[]; outfit?: OutfitThemeId; at?: string };

/**
 * 스티커는 그림·글자 합쳐 8개까지. 처음(그림만)엔 6개였는데, 글자 스티커도 같은 칸을 쓰니 '우리 가족'·'사랑해'를
 * 붙이면 그림은 넷만 남아 모자랐다 — 그래서 8. 여섯 가장자리 자리가 다 차면 7·8번째는 차례 자리에서 조금 아래로
 * 붙는다(nextSpot — 여전히 가장자리라 얼굴을 안 가린다).
 */
export const STUDIO_MAX = 8;

/** 그림 스티커 한 변 = 사진 높이 × 이 값 × 배율(200px 사진에서 배율 1 = 56px, 예전 '보통'). */
export const STICKER_BASE = 0.28;
/** 글자 스티커 글자 크기 = 사진 높이 × 이 값 × 배율(200px 사진에서 배율 1 = 20px — 테두리까지 한 줄 약 29px). */
export const TEXT_BASE = 0.1;

/** 배율 범위 — 예전 '보통'의 0.35배(200px 사진에서 20px)부터 2.2배(123px)까지 */
export const SCALE_MIN = 0.35;
export const SCALE_MAX = 2.2;
/**
 * 글자 스티커 배율의 아래 끝 — 0.6(200px 사진에서 글자 12px, 모아 보기 186px 에서 11px). 그림처럼 0.35 까지 줄이면
 * 7px 이라 한글이 안 읽히고 색 얼룩이 된다(2026-09-30 검토). 위 끝은 그림과 같다.
 */
export const TEXT_SCALE_MIN = 0.6;
/** 밀대 한 칸 */
export const SCALE_STEP = 0.05;
/** 키보드 -·+ 한 번 */
export const SCALE_KEY_STEP = 0.1;

/** 예전 크기 셋(작게·보통·크게 — 한 변이 높이의 0.2·0.28·0.38) → 배율. 옮겨도 같은 크기다(1px 안). */
export const LEGACY_SIZE_SCALE: Readonly<Record<"s" | "m" | "l", number>> = { s: 0.71, m: 1, l: 1.36 };

/**
 * 새 그림 스티커가 붙는 자리 — 얼굴을 피해 가장자리(가로·세로 비율). 가족은 셋·넷이면 x 0.38~0.62, 여섯이면 0.28~0.72
 * (폰, groupLayout 으로 잼), 머리 꼭대기는 y 0.16 쯤이라 보통 크기(폰에서 폭의 0.16)면 여섯 곳 모두 얼굴에 안 닿는다.
 * 여덟 명 넘게 폭을 꽉 채우면 닿을 수 있다 — 그때는 부모가 끌어 옮긴다.
 * 차례: 왼쪽 위 · 오른쪽 위(홈 마스코트를 비켜 조금 아래) · 왼쪽 아래 · 오른쪽 아래 · 왼쪽 가운데 · 오른쪽 가운데.
 */
export const STUDIO_SPOTS: readonly (readonly [number, number])[] = [
  [0.12, 0.24],
  [0.88, 0.34],
  [0.1, 0.76],
  [0.9, 0.76],
  [0.09, 0.5],
  [0.91, 0.55],
];

/**
 * 새 글자 스티커가 붙는 자리 — 글자는 옆으로 넓어 가장자리에 두면 얼굴에 닿거나 사진 밖으로 나간다. 가운데 위(맨 위
 * 머리 꼭대기 y 0.16 보다 위 — 배율 1 글자는 0.01~0.16) · 가운데 아래(다리 쪽 — 홈 명패가 덮는 맨 아래 11px 는 비킨다)
 * · 그보다 조금 위(두 살 아이 얼굴 0.55~0.63 보다 아래).
 */
export const TEXT_SPOTS: readonly (readonly [number, number])[] = [
  [0.5, 0.09],
  [0.5, 0.84],
  [0.5, 0.74],
];

/** 자리가 '차 있다'고 보는 거리(가로·세로 비율) — 이 안에 다른 스티커 가운데가 있으면 다음 자리로 */
const SPOT_NEAR = { x: 0.1, y: 0.16 };
/** 글자 자리는 넓게 본다(글자가 옆으로 길어서) */
const TEXT_NEAR = { x: 0.25, y: 0.08 };
/** 자리가 모두 찼을 때 겹쳐 붙지 않게 조금 아래로 */
const SPOT_SHIFT = 0.05;

/** 스티커 자리의 끝 — 반쯤은 사진 밖으로 걸쳐도 되지만 통째로 나가지는 않게 */
const POS_MIN = 0.03;
const POS_MAX = 0.97;

export const EMPTY_STUDIO: FamilyStudio = { bg: null, stickers: [] };

/** 자리 비율을 사진 안으로 — 숫자가 아니면(NaN) 가운데 0.5 */
export function clampPos(v: number): number {
  if (typeof v !== "number" || Number.isNaN(v)) return 0.5;
  return Math.min(POS_MAX, Math.max(POS_MIN, v));
}

/** 스티커 갈래 — 그림(투명 webp) · 글자(앱이 글꼴로 그림) */
export type StickerKind = "image" | "text";

/** 이 갈래 배율의 아래 끝 — 그림 SCALE_MIN, 글자 TEXT_SCALE_MIN(작으면 안 읽혀서) */
export const scaleMinOf = (kind: StickerKind): number => (kind === "text" ? TEXT_SCALE_MIN : SCALE_MIN);

/** 이 아이콘의 갈래 — 모르는 아이콘은 그림으로 본다 */
const kindOf = (icon: string): StickerKind => (studioSticker(icon)?.kind === "text" ? "text" : "image");

/** 배율을 범위 안으로(아래 끝은 갈래마다 — scaleMinOf), 0.01 단위로 — 숫자가 아니면(NaN·무한) 1(보통) */
export function clampScale(v: number, kind: StickerKind = "image"): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 1;
  const c = Math.min(SCALE_MAX, Math.max(scaleMinOf(kind), v));
  return Math.round(c * 100) / 100;
}

/** 그림 스티커 한 변(px) — 사진 높이 기준 */
export function stickerPx(scale: number, height: number): number {
  return Math.round(STICKER_BASE * clampScale(scale) * height);
}

/** 글자 스티커 글자 크기(px) — 사진 높이 기준, 0.5px 단위, 배율은 글자 아래 끝(TEXT_SCALE_MIN)까지 */
export function textPx(scale: number, height: number): number {
  return Math.round(TEXT_BASE * clampScale(scale, "text") * height * 2) / 2;
}

/** 두 손가락 사이 거리(px) */
export function pointerDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * 두 손가락 크기 바꾸기 — 처음 배율 × (지금 거리 ÷ 처음 거리), 범위 안으로. 처음 거리가 0 이하이거나 숫자가 아니면
 * 처음 배율 그대로(손가락 둘이 한 점에 닿은 순간 — 나누기 0 을 막는다). kind — 글자 스티커면 글자 아래 끝까지.
 */
export function pinchScale(from: number, startDist: number, dist: number, kind: StickerKind = "image"): number {
  if (!Number.isFinite(startDist) || startDist <= 0 || !Number.isFinite(dist) || dist < 0) return clampScale(from, kind);
  return clampScale(from * (dist / startDist), kind);
}

/** slug 의 배경 — 숨긴 배경도 찾는다(이미 고른 사람에게는 계속 보여야 한다). 없으면 undefined. */
export function studioBackground(slug: string | null | undefined): StudioBackground | undefined {
  if (!slug) return undefined;
  return STUDIO_BACKGROUNDS.find((b) => b.slug === slug);
}

/** 스티커 정의(그림 또는 글자) — 모르는 아이콘이면 undefined */
export function studioSticker(icon: string): AnyStickerDef | undefined {
  return STUDIO_STICKERS.find((s) => s.icon === icon) ?? STUDIO_TEXT_STICKERS.find((s) => s.icon === icon);
}

/** 글자 스티커인가 */
export function isTextSticker(icon: string): boolean {
  return studioSticker(icon)?.kind === "text";
}

/** 고르기 화면에 보일 무리와 그 배경(숨긴 배경·빈 무리 빼고), 무리 순서대로 */
export function studioGroupsInUse(): { id: StudioGroup; label: string; items: StudioBackground[] }[] {
  return STUDIO_GROUPS.map((g) => ({ ...g, items: STUDIO_BACKGROUNDS.filter((b) => b.group === g.id && !b.hidden) })).filter(
    (g) => g.items.length > 0,
  );
}

/**
 * 저장된 크기 → 배율. 숫자 scale 이 먼저(갈래 범위 안으로), 없으면 예전 size(작게·보통·크게 — 그림 스티커뿐이던
 * 때라 그대로), 그것도 없으면 1.
 */
function scaleOf(s: { scale?: unknown; size?: unknown }, kind: StickerKind): number {
  if (typeof s.scale === "number" && Number.isFinite(s.scale)) return clampScale(s.scale, kind);
  if (s.size === "s" || s.size === "m" || s.size === "l") return clampScale(LEGACY_SIZE_SCALE[s.size], kind);
  return 1;
}

/**
 * 저장된 값(서버·이 기기)을 믿을 수 있는 모양으로. 객체가 아니면 undefined(저장값 없음 — 기본).
 *  - bg: 아는 배경(숨긴 것 포함)이 아니면 null(기본으로).
 *  - stickers: 아는 아이콘(그림·글자)에 x·y 가 숫자인 것만(사진 안으로 당김), 크기는 배율로(예전 size 옮기기·범위 안으로),
 *    앞의 STUDIO_MAX 개만. 배열이 아니면 [].
 *  - outfit: 아는 테마만(예전 이름 'xmas' 는 'christmas' 로, 모르는 테마는 칸째 버린다 — 평소 옷). 옷 갈아입기 전에 저장한
 *    값에는 없다.
 */
export function normalizeStudio(raw: unknown): FamilyStudio | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const v = raw as { bg?: unknown; stickers?: unknown; outfit?: unknown };
  const bg = typeof v.bg === "string" && studioBackground(v.bg) ? v.bg : null;
  const stickers: StudioSticker[] = [];
  if (Array.isArray(v.stickers)) {
    for (const item of v.stickers) {
      if (stickers.length >= STUDIO_MAX) break;
      if (!item || typeof item !== "object") continue;
      const s = item as { icon?: unknown; x?: unknown; y?: unknown; scale?: unknown; size?: unknown };
      if (typeof s.icon !== "string" || !studioSticker(s.icon)) continue;
      if (typeof s.x !== "number" || typeof s.y !== "number") continue;
      stickers.push({ icon: s.icon, x: clampPos(s.x), y: clampPos(s.y), scale: scaleOf(s, kindOf(s.icon)) });
    }
  }
  const at = (v as { at?: unknown }).at;
  const outfit = readOutfitTheme(v.outfit);
  return {
    bg,
    stickers,
    ...(outfit ? { outfit } : {}),
    ...(typeof at === "string" && Number.isFinite(Date.parse(at)) ? { at } : {}),
  };
}

/** 꾸민 때를 찍는다 — 꾸미기 시트가 바꿀 때마다(서버·다른 기기 값과 합칠 때 더 새것이 이기게) */
export function stampStudio(s: FamilyStudio, now: Date = new Date()): FamilyStudio {
  return { bg: s.bg, stickers: s.stickers, ...(s.outfit ? { outfit: s.outfit } : {}), at: now.toISOString() };
}

const stampOf = (s: FamilyStudio): number => {
  const t = s.at ? Date.parse(s.at) : NaN;
  return Number.isFinite(t) ? t : -Infinity;
};

/**
 * 두 사진관 값 중 **나중에 꾸민 것**(at). 한쪽만 있으면 그쪽, 같은 때(또는 둘 다 at 없음)면 first.
 * 서버·이 기기를 합칠 때 first = 서버 — 이 기기에서 방금 꾸몄는데 서버에 아직 못 올라간 값(800ms 저장 전에 앱을
 * 닫음·오프라인), 옛 화면이 profiles.child 를 덮으며 버린 값은 이 기기 것이 이기고 loadChildRemote 가 다시 올린다.
 * 다른 기기에서 나중에 꾸민 값은 서버 것이 이긴다(오래 열어 둔 화면이 옛 값으로 되돌리지 않게).
 */
export function newerStudio(
  first: FamilyStudio | null | undefined,
  second: FamilyStudio | null | undefined,
): FamilyStudio | undefined {
  if (!first) return second ?? undefined;
  if (!second) return first;
  return stampOf(second) > stampOf(first) ? second : first;
}

/**
 * 새 스티커 자리 — 비어 있는 첫 자리(그림은 가장자리 STUDIO_SPOTS, 글자는 가운데 위·아래 TEXT_SPOTS).
 * 자리가 다 찼으면 차례 자리에서 조금 아래.
 */
export function nextSpot(stickers: readonly StudioSticker[], kind: "image" | "text" = "image"): { x: number; y: number } {
  const spots = kind === "text" ? TEXT_SPOTS : STUDIO_SPOTS;
  const near = kind === "text" ? TEXT_NEAR : SPOT_NEAR;
  for (const [x, y] of spots) {
    const taken = stickers.some((s) => Math.abs(s.x - x) < near.x && Math.abs(s.y - y) < near.y);
    if (!taken) return { x, y };
  }
  const [x, y] = spots[stickers.length % spots.length];
  return { x: clampPos(x), y: clampPos(y + SPOT_SHIFT) };
}

export type StudioAction =
  /** 배경 고르기 — null 이면 기본(나라 배경). 모르는 slug 는 그대로. */
  | { type: "bg"; slug: string | null }
  /** 스티커 붙이기(그림·글자) — 모르는 아이콘이거나 이미 STUDIO_MAX 개면 그대로 */
  | { type: "add"; icon: string }
  /** 옮기기 — 사진 안으로 당긴다. 없는 번호면 그대로. */
  | { type: "move"; index: number; x: number; y: number }
  /** 크기 배율 — 범위 안으로(글자 스티커는 TEXT_SCALE_MIN 부터), 0.01 단위. 없는 번호·같은 배율이면 그대로. */
  | { type: "scale"; index: number; scale: number }
  | { type: "remove"; index: number }
  | { type: "clearStickers" }
  /** 스티커 목록을 통째로 — '모두 떼기' 되돌리기. 불러올 때처럼 거른다(모르는 아이콘 빼기·STUDIO_MAX 개까지·사진 안으로). */
  | { type: "stickers"; stickers: readonly StudioSticker[] }
  /**
   * 가족 옷 테마 — 테마를 고르면 배경도 그 테마 짝 배경으로 바뀐다(그 뒤에 배경만 따로 바꿔도 된다).
   * null('원래 옷으로')은 옷만 벗고 배경은 그대로. 모르는 테마·같은 테마·같은 배경이면 그대로.
   */
  | { type: "outfit"; theme: OutfitThemeId | null };

const validIndex = (s: FamilyStudio, i: number) => Number.isInteger(i) && i >= 0 && i < s.stickers.length;

/**
 * 사진관 바꾸기 — 받은 값을 고치지 않고 새 값을 돌려준다. **바뀐 게 없으면 받은 값 그대로(===)** —
 * 꾸미기 시트는 그때 저장하지 않는다.
 */
export function studioReducer(s: FamilyStudio, a: StudioAction): FamilyStudio {
  switch (a.type) {
    case "bg": {
      if (a.slug !== null && !studioBackground(a.slug)) return s;
      return a.slug === s.bg ? s : { ...s, bg: a.slug };
    }
    case "add": {
      const def = studioSticker(a.icon);
      if (!def || s.stickers.length >= STUDIO_MAX) return s;
      const spot = nextSpot(s.stickers, def.kind);
      return { ...s, stickers: [...s.stickers, { icon: a.icon, x: spot.x, y: spot.y, scale: 1 }] };
    }
    case "move": {
      if (!validIndex(s, a.index)) return s;
      const x = clampPos(a.x);
      const y = clampPos(a.y);
      const cur = s.stickers[a.index];
      if (cur.x === x && cur.y === y) return s;
      return { ...s, stickers: s.stickers.map((t, i) => (i === a.index ? { ...t, x, y } : t)) };
    }
    case "scale": {
      if (!validIndex(s, a.index) || typeof a.scale !== "number" || !Number.isFinite(a.scale)) return s;
      const cur = s.stickers[a.index];
      const scale = clampScale(a.scale, kindOf(cur.icon));
      if (cur.scale === scale) return s;
      return { ...s, stickers: s.stickers.map((t, i) => (i === a.index ? { ...t, scale } : t)) };
    }
    case "remove": {
      if (!validIndex(s, a.index)) return s;
      return { ...s, stickers: s.stickers.filter((_, i) => i !== a.index) };
    }
    case "clearStickers":
      return s.stickers.length === 0 ? s : { ...s, stickers: [] };
    case "stickers": {
      const stickers = normalizeStudio({ stickers: a.stickers })?.stickers ?? [];
      return JSON.stringify(stickers) === JSON.stringify(s.stickers) ? s : { ...s, stickers };
    }
    case "outfit": {
      if (a.theme === null) {
        if (!s.outfit) return s;
        return { bg: s.bg, stickers: s.stickers, ...(s.at ? { at: s.at } : {}) };
      }
      if (!isOutfitTheme(a.theme)) return s;
      const pair = outfitBackground(a.theme);
      const bg = pair && studioBackground(pair) ? pair : s.bg;
      if (s.outfit === a.theme && s.bg === bg) return s;
      return { bg, stickers: s.stickers, outfit: a.theme, ...(s.at ? { at: s.at } : {}) };
    }
    default:
      return s;
  }
}

/** 아무것도 안 바꾼 모습(나라 배경·스티커 없음·평소 옷)인가 — 저장값이 없어도 기본 */
export function isDefaultStudio(s: FamilyStudio | null | undefined): boolean {
  return !s || (s.bg === null && s.stickers.length === 0 && !s.outfit);
}

/* ── 꾸미기 시트 모양(components/family/StudioSheet) — 창 크기만 보는 셈이라 여기서 시험한다 ── */

/** 시트 높이(92dvh)에서 미리보기 말고 늘 드는 것 — 손잡이·위(10)·아래(24) 여백 */
const SHEET_CHROME = 39;
/** 세로: 붙어 있는 칸에서 미리보기 말고 — 위아래 여백(8+8)·액자 테두리(10)·크기 줄(8+44)·탭(4+44) */
export const STACK_PINNED = 126;
/** 세로: 붙어 있는 칸 아래로 늘 보여야 할 고르기 높이(배경 두 줄쯤) */
export const STACK_LIST_MIN = 190;
/** 이보다 낮은 가로 화면은 두 칸으로 */
const SIDE_MAX_H = 560;
/** 두 칸으로 놓을 최소 폭 — 오른쪽 고르기 칸이 200px 은 되게 */
const SIDE_MIN_W = 560;
/** 두 칸일 때 시트 폭(Sheet wide = max-w-3xl 768)에서 좌우 여백(px-5)을 뺀 폭의 끝 */
const SIDE_SHEET_W = 768;
/** 두 칸: 왼쪽 칸에서 미리보기 말고 — 위아래 여백(8+8)·액자 테두리(10)·크기 줄(8+44) */
export const SIDE_PINNED = 78;
/** 두 칸: 미리보기 비율 — 태블릿 홈 액자(폭 540 × 240)와 같게 줄여서, 스티커·사람 자리가 홈과 같아 보이게 */
export const SIDE_ASPECT = 2.25;
/** 두 칸: 왼쪽 칸 폭 — 미리보기(높이 × SIDE_ASPECT) + 액자 테두리·여백(10) */
export const sidePreviewWidth = (height: number): number => Math.round(height * SIDE_ASPECT) + 10;
/**
 * 글자 고르기 칸 하나의 최소 폭(px) — 가장 긴 문구 '메리 크리스마스'가 주아 17px·흰 테두리 여백까지 108px(헤드리스
 * 크롬에서 잼, 2026-09-30) + 단추 안쪽 여백(2+2)에 조금 남긴 값. 가로로 눕힌 폰의 오른쪽 칸(폭 640 폰 245px ~ 304px)
 * 에서도 두 칸씩 선다(150 이던 때는 한 칸씩이라 12개가 세 화면 넘게 늘어섰다 — 2026-09-30 검토).
 */
export const TEXT_CELL_MIN = 116;

/** 시트가 쓸 수 있는 높이(92dvh − 여백) */
export const sheetRoom = (vh: number): number => vh * 0.92 - SHEET_CHROME;

/**
 * 꾸미기 시트 모양 — 창 폭·높이(px)로.
 *  - 세로(stack): 미리보기·크기 줄·탭이 위에 붙는다. 높이는 홈 액자와 같은 200(폰)·240(태블릿, 640px~)이되, 그 아래
 *    고르기가 STACK_LIST_MIN 은 보이게 줄인다(140 까지 — 아이폰 SE 사파리처럼 낮은 세로 화면).
 *  - 가로로 눕힌 폰(side — 높이 560 미만, 앱은 가로 고정): 붙여 두면 고르기가 아예 안 보인다(2026-09-30 검토) —
 *    왼쪽에 미리보기·크기 줄, 오른쪽에 고르기. 미리보기 폭 = 높이 × SIDE_ASPECT, 시트 폭의 55%까지. 110~180.
 *  stackExtra — 세로일 때 붙어 있는 칸에 더 붙는 줄 높이(px, '옷 갈아입기' 줄 — 개발자 모드). 고르기 몫을 지키려고 미리보기를 그만큼 줄인다.
 */
export function studioSheetFit(vw: number, vh: number, stackExtra = 0): { side: boolean; height: number } {
  const base = vw >= 640 ? 240 : 200;
  const room = sheetRoom(vh);
  if (vh < SIDE_MAX_H && vw > vh && vw >= SIDE_MIN_W) {
    const contentW = Math.min(vw, SIDE_SHEET_W) - 40;
    const h = Math.min(180, Math.floor(room - SIDE_PINNED), Math.floor((contentW * 0.55) / SIDE_ASPECT));
    return { side: true, height: Math.max(110, h) };
  }
  return {
    side: false,
    height: Math.max(140, Math.min(base, Math.floor(room - STACK_PINNED - Math.max(0, stackExtra) - STACK_LIST_MIN))),
  };
}
