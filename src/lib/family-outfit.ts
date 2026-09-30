/**
 * 가족 사진관 '옷 갈아입기' — 테마 옷(추석 한복·설날 색동·봄 소풍 …)을 가족 모두에게 한꺼번에 입힌다.
 *
 * 사장님 결정(2026-09-30, 제안서 (B) — 바탕화면 옷갈아입히기-시안/얼굴고정-방식/제안.md):
 *  - **고객마다 AI 를 부르지 않는다.** 우리가 테마 8개 × 몸 8종(아빠·엄마·남자아이·여자아이·할아버지·할머니·남녀 아기)의
 *    **머리 없는 몸**을 미리 한 번 그려 둔다(몸 창고 public/family-outfits/bodies/<테마>/<몸>.webp(없으면 .png) + bodies.json).
 *  - 가족 한 사람의 고정된 그림에서 **머리(얼굴·머리카락, 긴 머리는 어깨로 내려온 머리카락까지)를 원본 픽셀 그대로** 떼어,
 *    그 사람 몸 종류의 테마 몸 위에 얹는다. 몸은 원본의 목 줄·발끝에 맞춰 키우고/줄이고, 목 폭과 목·손 살색만 원본에 맞춘다.
 *  - 고객 한 명에 드는 돈 0원(그림 모델·토큰·DB 표 없음). 테마를 고르면 가족이 모두 함께 갈아입고 배경도 그 테마로 바뀐다.
 *  - 한 번 만든 옷은 사람마다 '테마 → {주소, 원본 그림, 몸 판}'으로 기억한다(member.outfits) — 다시 만들지 않는다.
 *
 * 이 파일은 순수 함수만 둔다(sharp·fetch·브라우저 없음) — 화면(components/family/OutfitPicker·FamilyGroupPhoto·StudioSheet),
 * 저장(lib/family·lib/family-studio), 서버(api/family/outfit·lib/family-outfit-image)가 같이 쓰고 node --test 로 시험한다.
 *  - 테마 목록 · 테마 ↔ 사진관 배경 짝
 *  - 몸 종류 고르기(역할·성별·나이) · 몸 창고 목록(bodies.json) 읽기·몸 판
 *  - 저장 모양(member.outfits) 고르기·합치기 · 단체 사진에 세울 그림 · 누구를 새로 입혀야 하나
 *  - 서버 요청 읽기·원본 주소 검사·파일 이름·분당 제한 셈
 *  - 그림 셈(RGBA 픽셀 배열만): 목 줄 찾기 · 머리 떼기(긴 머리 포함) · 몸 맞추기 · 목 폭 맞추기 · 살색 맞추기 · 합치기 · 잘라 내기
 *
 * family.ts 의 값(value)은 부르지 않는다 — family.ts 가 이 파일의 normalizeOutfits·mergeOutfits 를 부르므로 서로 물리지 않게.
 */

import type { FamilyMember, FamilyPortrait, FamilyRole } from "./family.ts";
import { cleanHeadRatio } from "./family-head.ts";

/* ─────────────────────────────── 테마 ─────────────────────────────── */

export type OutfitThemeId = "chuseok" | "seollal" | "picnic" | "beach" | "camping" | "christmas" | "pajama" | "birthday";

export type OutfitTheme = {
  id: OutfitThemeId;
  /** 화면 이름 */
  label: string;
  /** 타일 아래 짧은 설명 */
  hint: string;
  /** 타일 미리보기(예시 가족 세 사람, public/family-outfits) */
  preview: string;
  /** 짝 사진관 배경(lib/family-studio-catalog slug) — 테마를 고르면 배경도 이것으로 바뀐다(그 뒤에 배경만 바꿔도 된다) */
  bg: string;
};

/** 몸 창고 폴더 이름과 같은 id(public/family-outfits/bodies/<id>/) — 바꾸면 창고도 같이 */
export const OUTFIT_THEMES: readonly OutfitTheme[] = [
  { id: "chuseok", label: "추석 한복", hint: "보름달 명절 한복", preview: "/family-outfits/chuseok.webp", bg: "fam-chuseok-moon-yard" },
  { id: "seollal", label: "설날 색동 한복", hint: "새해 색동 소매 한복", preview: "/family-outfits/seollal.webp", bg: "fam-seollal-hanok-hall" },
  { id: "picnic", label: "봄 소풍 나들이룩", hint: "벚꽃 나들이 옷", preview: "/family-outfits/picnic.webp", bg: "fam-cherry-park-day" },
  { id: "beach", label: "여름 바닷가", hint: "시원한 여름 옷", preview: "/family-outfits/beach.webp", bg: "fam-sandy-beach" },
  { id: "camping", label: "캠핑룩", hint: "모닥불 캠핑 옷", preview: "/family-outfits/camping.webp", bg: "fam-campsite" },
  { id: "christmas", label: "크리스마스 니트", hint: "포근한 크리스마스 스웨터", preview: "/family-outfits/xmas.webp", bg: "fam-christmas-living-room" },
  { id: "pajama", label: "잠옷 파티", hint: "보들보들 잠옷", preview: "/family-outfits/pajama.webp", bg: "fam-pajama-party-room" },
  { id: "birthday", label: "생일 파티", hint: "알록달록 파티 옷", preview: "/family-outfits/birthday.webp", bg: "fam-birthday-party" },
];

/** '원래 옷으로' 타일 미리보기 */
export const OUTFIT_ORIGINAL_PREVIEW = "/family-outfits/original.webp";

export const OUTFIT_THEME_IDS: readonly OutfitThemeId[] = OUTFIT_THEMES.map((t) => t.id);

export function isOutfitTheme(x: unknown): x is OutfitThemeId {
  return typeof x === "string" && (OUTFIT_THEME_IDS as readonly string[]).includes(x);
}

/** 예전 이름 — 1단계(연결 전) 목록은 크리스마스를 'xmas' 로 불렀다. 혹시 그 이름으로 저장된 값은 새 이름으로 읽는다. */
const LEGACY_THEME: Readonly<Record<string, OutfitThemeId>> = { xmas: "christmas" };

/** 저장값의 테마 → 지금 테마 id(예전 이름도 옮겨 읽는다). 모르면 undefined. */
export function readOutfitTheme(x: unknown): OutfitThemeId | undefined {
  if (isOutfitTheme(x)) return x;
  return typeof x === "string" && Object.hasOwn(LEGACY_THEME, x) ? LEGACY_THEME[x] : undefined;
}

export function outfitTheme(id: string | null | undefined): OutfitTheme | undefined {
  return OUTFIT_THEMES.find((t) => t.id === id);
}

/** 테마의 짝 사진관 배경 slug(모르는 테마면 undefined) */
export function outfitBackground(id: string | null | undefined): string | undefined {
  return outfitTheme(id)?.bg;
}

/* ─────────────────────────────── 몸 종류 ─────────────────────────────── */

/** 몸 창고의 몸 종류 — 파일 이름(public/family-outfits/bodies/<테마>/<몸>.webp)과 같다 */
export type OutfitBodyRole = "dad" | "mom" | "boy" | "girl" | "grandpa" | "grandma" | "toddler-boy" | "toddler-girl";

export const OUTFIT_BODY_ROLES: readonly OutfitBodyRole[] = [
  "dad",
  "mom",
  "boy",
  "girl",
  "grandpa",
  "grandma",
  "toddler-boy",
  "toddler-girl",
];

export function isOutfitBodyRole(x: unknown): x is OutfitBodyRole {
  return typeof x === "string" && (OUTFIT_BODY_ROLES as readonly string[]).includes(x);
}

/** 이 나이까지는 아기 몸 */
export const TODDLER_MAX_AGE = 3;
/** 이 나이까지는 아이 몸 — 그 위(13살~)는 어른 몸(엄마·아빠)을 그 사람 키에 맞춰 줄여 입는다 */
export const KID_MAX_AGE = 12;
/** 나이를 모를 때 — 단체 사진 키 셈(lib/family childHeightCm)과 같은 5살 */
export const DEFAULT_KID_AGE = 5;

/** 형제 호칭 → 성별(lib/family siblingGender 와 같은 표 — 값을 부르지 않으려고 따로 둔다, 시험이 둘을 견준다) */
const SIBLING_CALL_GENDER: Readonly<Record<string, "girl" | "boy">> = {
  형: "boy",
  오빠: "boy",
  남동생: "boy",
  누나: "girl",
  언니: "girl",
  여동생: "girl",
};

export type OutfitWho = Pick<FamilyMember, "role"> & Partial<Pick<FamilyMember, "callName" | "gender" | "age">>;

/**
 * 이 사람이 입을 몸 종류 — 성별을 알 수 없으면 null(그 사람은 평소 옷 그대로 — 화면이 '성별을 알려 주면' 안내).
 *  - 엄마·아빠·할머니·할아버지는 역할 그대로.
 *  - 아이(주인공)·형제·친구: 성별(아이는 설정의 성별, 형제는 성별 칸·호칭, 친구는 성별 칸) + 나이(아이는 설정 나이,
 *    형제·친구는 그 사람 나이, 없으면 아이 나이, 그것도 없으면 5살 — 단체 사진과 같다)로
 *    3살까지 아기 · 12살까지 남자아이·여자아이 · 13살부터 아빠·엄마 몸(합칠 때 그 사람 키로 줄어든다).
 */
export function outfitBodyRole(
  m: OutfitWho,
  o: { childAge?: number | null; childGender?: string | null } = {},
): OutfitBodyRole | null {
  switch (m.role) {
    case "dad":
    case "mom":
    case "grandpa":
    case "grandma":
      return m.role;
    case "child":
    case "sibling":
    case "friend": {
      const hint = m.role === "sibling" ? SIBLING_CALL_GENDER[(m.callName ?? "").trim()] : undefined;
      const childGender = o.childGender === "girl" || o.childGender === "boy" ? o.childGender : undefined;
      const gender = m.role === "child" ? (childGender ?? m.gender) : (m.gender ?? hint);
      if (gender !== "girl" && gender !== "boy") return null;
      const raw = m.role === "child" ? o.childAge : (m.age ?? o.childAge);
      const age = typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_KID_AGE;
      if (age <= TODDLER_MAX_AGE) return gender === "girl" ? "toddler-girl" : "toddler-boy";
      if (age <= KID_MAX_AGE) return gender;
      return gender === "girl" ? "mom" : "dad";
    }
  }
}

/** 몸 종류 → 표 머리 비율을 셀 역할·나이(잰 머리 비율이 없는 옛 그림의 목 찾기 어림에만 — lib/family-head headChartRatio) */
export function bodyChartWho(body: OutfitBodyRole, age?: number | null): { role: FamilyRole; age?: number } {
  switch (body) {
    case "dad":
    case "mom":
      // 13~19살 형제·친구도 어른 몸을 입는다 — 표 비율은 청소년 것으로
      return typeof age === "number" && age > KID_MAX_AGE && age < 20 ? { role: "sibling", age } : { role: body };
    case "grandpa":
    case "grandma":
      return { role: body };
    case "toddler-boy":
    case "toddler-girl":
      return { role: "child", age: typeof age === "number" && age > 0 ? age : 2 };
    default:
      return { role: "child", age: typeof age === "number" && age > 0 ? age : 7 };
  }
}

/* ─────────────────────────────── 몸 창고 ─────────────────────────────── */

/** 몸 창고(사이트 public) — 다른 작업이 채운다. 여기는 읽기만. */
export const OUTFIT_BODY_DIR = "/family-outfits/bodies";
export const OUTFIT_BODIES_JSON = `${OUTFIT_BODY_DIR}/bodies.json`;

export function bodyKey(theme: OutfitThemeId, body: OutfitBodyRole): string {
  return `${theme}/${body}`;
}

/** 몸 그림 파일 — WebP 가 먼저(PNG 의 1/8 크기, 같은 이름·같은 크기), 없으면 PNG(창고를 채우던 때의 원본) */
export const OUTFIT_BODY_EXTS = ["webp", "png"] as const;
export type BodyImageExt = (typeof OUTFIT_BODY_EXTS)[number];

/** 몸 그림 경로(사이트 뿌리 기준) */
export function bodyImagePath(theme: OutfitThemeId, body: OutfitBodyRole, ext: BodyImageExt = "webp"): string {
  return `${OUTFIT_BODY_DIR}/${theme}/${body}.${ext}`;
}

/**
 * bodies.json 한 칸 — 몸 그림(투명 PNG, 목에서 잘린 머리 없는 몸)의 픽셀 자리.
 *  w·h 그림 크기 · neckY 목 줄(원본 머리를 얹을 줄) · neckLeft·neckRight 그 줄의 목 폭 · feetY 발끝 줄
 *  skin 목·손 살색(없으면 null — 그때는 몸 목에서 뜬다)
 */
export type Rgb = [number, number, number];
export type BodyMeta = { w: number; h: number; neckY: number; neckLeft: number; neckRight: number; feetY: number; skin: Rgb | null };
/** 'chuseok/dad' → 몸 칸 */
export type BodyLibrary = Readonly<Record<string, BodyMeta>>;

export const BODY_MAX_SIDE = 8192;

const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** bodies.json 한 칸 → 믿을 모양(정수로), 이상하면 undefined */
export function normalizeBodyMeta(raw: unknown): BodyMeta | undefined {
  const m = raw as Record<string, unknown> | null | undefined;
  if (!m || typeof m !== "object" || Array.isArray(m)) return undefined;
  const nums = [m.w, m.h, m.neckY, m.neckLeft, m.neckRight, m.feetY];
  if (!nums.every(finite)) return undefined;
  const [w, h, neckY, neckLeft, neckRight, feetY] = (nums as number[]).map((v) => Math.round(v));
  if (w < 16 || h < 16 || w > BODY_MAX_SIDE || h > BODY_MAX_SIDE) return undefined;
  if (neckY < 0 || feetY > h || feetY - neckY < Math.max(16, 0.25 * h)) return undefined;
  if (neckLeft < 0 || neckRight > w || neckRight - neckLeft < 1) return undefined;
  const s = m.skin;
  const skin: Rgb | null =
    Array.isArray(s) && s.length === 3 && s.every((c) => finite(c) && c >= 0 && c <= 255)
      ? [Math.round(s[0] as number), Math.round(s[1] as number), Math.round(s[2] as number)]
      : null;
  return { w, h, neckY, neckLeft, neckRight, feetY, skin };
}

/** bodies.json → 아는 테마·몸 칸만(모양이 이상한 칸은 버린다 — 그 몸은 없는 것으로 본다) */
export function normalizeBodyLibrary(raw: unknown): BodyLibrary {
  const out: Record<string, BodyMeta> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const r = raw as Record<string, unknown>;
  for (const theme of OUTFIT_THEME_IDS) {
    for (const body of OUTFIT_BODY_ROLES) {
      const key = bodyKey(theme, body);
      if (!Object.hasOwn(r, key)) continue;
      const meta = normalizeBodyMeta(r[key]);
      if (meta) out[key] = meta;
    }
  }
  return out;
}

/**
 * 몸 판 — 몸 창고에서 그 몸을 다시 그려 칸 값이 바뀌면 달라진다. 옷에 적어 두고(MemberOutfit.v) 창고 판과 다르면 다시 입힌다.
 * (그림만 바뀌고 칸 값이 똑같으면 알 수 없다 — 그때는 창고 쪽에서 칸 값을 한 번 바꿔 주면 된다.)
 */
export function bodyVersion(m: BodyMeta): string {
  return `${m.w}x${m.h}-${m.neckY}-${m.neckLeft}-${m.neckRight}-${m.feetY}`;
}

/**
 * 받은 그림 크기가 칸 크기와 다르면 — 비율이 같으면(1% 안) 칸 값을 그 크기로 옮기고, 다르면 undefined(쓰지 않는다).
 */
export function scaleBodyMeta(m: BodyMeta, width: number, height: number): BodyMeta | undefined {
  if (width === m.w && height === m.h) return m;
  if (!(width > 0 && height > 0)) return undefined;
  if (Math.abs(width / height - m.w / m.h) > 0.01 * (m.w / m.h)) return undefined;
  const sx = width / m.w;
  const sy = height / m.h;
  return {
    w: width,
    h: height,
    neckY: Math.round(m.neckY * sy),
    neckLeft: Math.round(m.neckLeft * sx),
    neckRight: Math.round(m.neckRight * sx),
    feetY: Math.round(m.feetY * sy),
    skin: m.skin,
  };
}

/* ─────────────────────────────── 저장 모양 ─────────────────────────────── */

/**
 * 한 사람·한 테마 옷 한 벌 — member.outfits[테마].
 *  url  : 합친 투명 그림(cafe24 https)
 *  at   : 받은 때(ISO) — 기기끼리 합칠 때 더 새것
 *  from : 이 옷을 만든 **원본 그림 주소**(portrait.url). 얼굴을 다시 고정하면 원본이 바뀌어 이 옷은 옛 얼굴이다 —
 *         portrait.url 과 다르면 없는 것으로 친다(outfitOf).
 *  v    : 만들 때의 몸 판(bodyVersion) — 몸 창고가 바뀌면 옷 고르기가 다시 입힌다(단체 사진은 그대로 보인다)
 */
export type MemberOutfit = { url: string; at: string; from: string; v?: string };
export type MemberOutfits = Partial<Record<OutfitThemeId, MemberOutfit>>;
/** 옷을 가진 사람(FamilyMember 와 같은 칸) */
export type WithOutfits = { outfits?: MemberOutfits };
type OutfitHolder = Pick<FamilyMember, "portrait"> & WithOutfits;

const httpsUrl = (u: unknown): u is string => typeof u === "string" && /^https:\/\//.test(u) && u.length <= 500;
const VERSION_RE = /^[a-z0-9.-]{1,60}$/i;

/** 저장된 값 한 벌 → 믿을 모양. 이상하면 undefined. */
export function normalizeOutfit(raw: unknown): MemberOutfit | undefined {
  const o = raw as Partial<MemberOutfit> | null | undefined;
  if (!o || typeof o !== "object") return undefined;
  if (!httpsUrl(o.url) || !httpsUrl(o.from)) return undefined;
  const at = typeof o.at === "string" && o.at.trim() ? o.at.trim().slice(0, 40) : "";
  return { url: o.url, at, from: o.from, ...(typeof o.v === "string" && VERSION_RE.test(o.v) ? { v: o.v } : {}) };
}

/**
 * 저장된 member.outfits → 믿을 모양. 모르는 테마·이상한 값은 버린다(예전 이름 'xmas' 는 'christmas' 로 — 새 이름 값이
 * 없을 때만). 하나도 없으면 undefined(칸을 두지 않는다).
 * portraitUrl 을 주면 그 그림에서 만든 옷만 남긴다(얼굴을 다시 고정했으면 옛 옷은 버린다).
 */
export function normalizeOutfits(raw: unknown, portraitUrl?: string): MemberOutfits | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const out: MemberOutfits = {};
  for (const key of Object.keys(r)) {
    const id = readOutfitTheme(key);
    if (!id || (key !== id && Object.hasOwn(r, id))) continue;
    const o = normalizeOutfit(r[key]);
    if (!o) continue;
    if (portraitUrl !== undefined && o.from !== portraitUrl) continue;
    out[id] = o;
  }
  // 테마 순서대로(저장값을 글자로 견줘도 같은 값이면 같은 글자)
  const sorted: MemberOutfits = {};
  for (const id of OUTFIT_THEME_IDS) if (out[id]) sorted[id] = out[id];
  return Object.keys(sorted).length ? sorted : undefined;
}

/**
 * 두 벌 합치기(서버·이 기기) — 테마마다 더 새것(at). 같으면 a. 비면 undefined.
 * portraitUrl 을 주면 합친 사람의 지금 그림에서 만든 옷만 남긴다.
 */
export function mergeOutfits(
  a: MemberOutfits | undefined,
  b: MemberOutfits | undefined,
  portraitUrl?: string,
): MemberOutfits | undefined {
  const out: MemberOutfits = {};
  for (const id of OUTFIT_THEME_IDS) {
    const x = a?.[id];
    const y = b?.[id];
    const pick = !x ? y : !y ? x : y.at > x.at ? y : x;
    if (!pick) continue;
    if (portraitUrl !== undefined && pick.from !== portraitUrl) {
      // 더 새것이 옛 그림 것이면 다른 쪽이라도 지금 그림 것이면 남긴다
      const other = pick === x ? y : x;
      if (other && other.from === portraitUrl) out[id] = other;
      continue;
    }
    out[id] = pick;
  }
  return Object.keys(out).length ? out : undefined;
}

/** 이 사람의 이 테마 옷 — 고정된 그림이 있고 그 그림에서 만든 옷일 때만 */
export function outfitOf(m: OutfitHolder, theme: OutfitThemeId | null | undefined): MemberOutfit | undefined {
  if (!theme || !m.portrait) return undefined;
  const o = m.outfits?.[theme];
  return o && o.from === m.portrait.url ? o : undefined;
}

/**
 * 옷 한 벌을 넣은 사람(새 값 — 받은 값을 고치지 않는다). 지금 그림에서 만든 게 아닌 옛 옷은 같이 치운다.
 * 고정된 그림이 없거나 이 옷이 지금 그림 것이 아니면 그대로 돌려준다.
 */
export function withOutfit<T extends OutfitHolder>(m: T, theme: OutfitThemeId, outfit: MemberOutfit): T {
  if (!m.portrait || outfit.from !== m.portrait.url) return m;
  const kept = normalizeOutfits(m.outfits, m.portrait.url) ?? {};
  return { ...m, outfits: { ...kept, [theme]: outfit } };
}

/**
 * 단체 사진에 세울 그림 — 테마 옷이 있으면 원본 그림에서 주소만 바꾼 것(opaque 는 뺀다: 합친 옷은 늘 투명),
 * 없으면 원본 그대로. 합친 그림은 머리를 원본 그대로 맨 위에 얹고 발끝을 원본에 맞춰 키(그림 높이)가 같아서
 * headRatio·bodyStretch 를 그대로 쓴다(FamilyGroupPhoto 의 얼굴 크기표가 그대로 맞는다).
 */
export function wornPortrait(m: OutfitHolder, theme: OutfitThemeId | null | undefined): FamilyPortrait | undefined {
  const p = m.portrait;
  if (!p) return undefined;
  const o = outfitOf(m, theme);
  if (!o) return p;
  const rest: FamilyPortrait = { ...p, url: o.url };
  delete rest.opaque;
  return rest;
}

/** 단체 사진에 세울 사람 — 테마 옷이 있으면 그림만 바꾼 새 값, 없으면 받은 값 그대로(===) */
export function wornMember<T extends OutfitHolder>(m: T, theme: OutfitThemeId | null | undefined): T {
  const p = wornPortrait(m, theme);
  return p === m.portrait ? m : { ...m, portrait: p };
}

/**
 * 이 테마를 입히려면 한 사람이 어떤 형편인가.
 *  ready     이미 입었다(지금 그림에서 만든 옷, 몸 창고 판도 같다 — 창고 목록을 모르면 판은 안 본다)
 *  dress     새로 입혀야 한다(서버가 몇 초 만에 합친다)
 *  no-body   이 테마에 그 몸이 아직 없다(몸 창고 준비 중) — 평소 옷 그대로
 *  no-gender 성별을 몰라 몸을 못 고른다 — 평소 옷 그대로
 */
export type DressStatus = "ready" | "dress" | "no-body" | "no-gender";
export type DressItem<T> = { member: T; status: DressStatus; body: OutfitBodyRole | null };

type DressMember = OutfitHolder & OutfitWho & Pick<FamilyMember, "id">;

/**
 * 테마 하나의 형편 — 고정된 그림이 있는 사람만(순서 그대로). lib 은 몸 창고 목록(bodies.json, 못 읽었으면 null —
 * 그때는 서버가 없다고 하면 그때 안다). 창고에서 몸이 빠졌어도 전에 만든 옷이 있으면 그 옷을 계속 입는다.
 */
export function dressPlan<T extends DressMember>(
  members: readonly T[],
  theme: OutfitThemeId,
  lib: BodyLibrary | null,
  o: { childAge?: number | null; childGender?: string | null } = {},
): DressItem<T>[] {
  const out: DressItem<T>[] = [];
  for (const m of members) {
    if (!m.portrait) continue;
    const body = outfitBodyRole(m, o);
    const have = outfitOf(m, theme);
    if (!body) {
      out.push({ member: m, status: have ? "ready" : "no-gender", body });
      continue;
    }
    const meta = lib ? lib[bodyKey(theme, body)] : undefined;
    if (lib && !meta) {
      out.push({ member: m, status: have ? "ready" : "no-body", body });
      continue;
    }
    const fresh = have && (!meta || have.v === bodyVersion(meta));
    out.push({ member: m, status: fresh ? "ready" : "dress", body });
  }
  return out;
}

/* ─────────────────────────────── 서버 요청 ─────────────────────────────── */

export const OUTFIT_MEMBER_ID = /^[a-z0-9-]{1,40}$/;

/**
 * POST /api/family/outfit 본문.
 *  portraitUrl 원본 그림(고정된 portrait.url) — 서버가 이 회원 폴더의 이 사람 그림인지 다시 본다(acceptOutfitSource)
 *  body        입을 몸 종류(화면이 outfitBodyRole 로 고른다 — 자기 가족 그림이라 서버가 다시 따지지 않는다)
 *  headRatio·opaque 원본 그림에 적힌 값(목 찾기·흰 바탕 지우기) · age 옛 그림(잰 비율 없음)의 목 찾기 어림
 */
export type OutfitRequest = {
  memberId: string;
  theme: OutfitThemeId;
  portraitUrl: string;
  body: OutfitBodyRole;
  headRatio?: number;
  opaque?: boolean;
  age?: number;
};

/** 본문 → 요청. 잘못이면 부모에게 보일 한국어 한 줄. */
export function parseOutfitRequest(raw: unknown): OutfitRequest | string {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "요청 내용이 없어요.";
  const b = raw as Record<string, unknown>;
  const memberId = typeof b.memberId === "string" ? b.memberId : "";
  if (!OUTFIT_MEMBER_ID.test(memberId)) return "가족 id 가 올바르지 않아요.";
  if (!isOutfitTheme(b.theme)) return "옷 테마가 올바르지 않아요.";
  if (!isOutfitBodyRole(b.body)) return "몸 종류가 올바르지 않아요.";
  if (!httpsUrl(b.portraitUrl)) return "원본 그림이 올바르지 않아요.";
  const headRatio = cleanHeadRatio(b.headRatio);
  const age = finite(b.age) && b.age >= 1 && b.age <= 99 ? Math.round(b.age) : undefined;
  return {
    memberId,
    theme: b.theme,
    portraitUrl: b.portraitUrl,
    body: b.body,
    ...(headRatio !== undefined ? { headRatio } : {}),
    ...(b.opaque === true ? { opaque: true } : {}),
    ...(age !== undefined ? { age } : {}),
  };
}

/**
 * 원본 그림 주소 검사 — **이 회원 폴더(prefix)의, 이 사람을 그린 가족 그림(투명 PNG)** 만 받는다
 * (api/family/portrait 가 올리는 이름: `<memberId>-<시각>-<임의 32자>.png`). 남의 그림을 끌어오거나 서버가 내부 주소를
 * 대신 받아 오게 하는 길, 옷 그림(…-outfit-…)을 다시 원본으로 쓰는 길을 막는다. prefix 가 없으면(설정 빠짐) 받지 않는다.
 */
export function acceptOutfitSource(url: string, prefix: string | null, memberId: string): boolean {
  if (!prefix || !url.startsWith(prefix) || !OUTFIT_MEMBER_ID.test(memberId)) return false;
  const rest = url.slice(prefix.length);
  const m = /^([a-z0-9-]{1,40})-(\d{10,16})-[a-f0-9]{32}\.png$/.exec(rest);
  return !!m && m[1] === memberId;
}

/** 합친 옷 그림 파일 이름(cafe24, 확장자 없이) — 매번 새 이름(cafe24 는 ?v= 를 무시한다), 끝의 임의 32자로 주소를 못 맞히게 */
export function outfitFileStem(folder: string, memberId: string, theme: OutfitThemeId, now: number, rand: string): string {
  return `family/${folder}/${memberId}-outfit-${theme}-${now}-${rand}`;
}

/**
 * 분당 제한 셈(서버 인스턴스 메모리) — times 는 이 사람의 지난 요청 시각. 창(windowMs) 안의 것만 남기고, limit 보다 적으면
 * 지금을 더해 ok. 아니면 가장 옛 요청이 창을 벗어날 때까지 기다릴 초(retryAfter, 1 이상).
 */
export function rateCheck(
  times: readonly number[],
  now: number,
  limit: number,
  windowMs: number,
): { ok: boolean; kept: number[]; retryAfter: number } {
  const kept = times.filter((t) => now - t < windowMs && t <= now);
  if (kept.length < limit) return { ok: true, kept: [...kept, now], retryAfter: 0 };
  const oldest = Math.min(...kept);
  return { ok: false, kept, retryAfter: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)) };
}

/* ─────────────────────────────── 그림 셈 — 공통 ─────────────────────────────── */

/** RGBA 픽셀(한 픽셀 4바이트, 줄 순서). sharp raw 결과(Buffer)도 그대로 들어온다. */
export type RgbaImage = { data: Uint8Array; width: number; height: number };

/** 이만큼 넘는 알파를 '그림이 있는 픽셀'로 본다 */
export const SOLID_ALPHA = 128;

export function newImage(width: number, height: number): RgbaImage {
  return { data: new Uint8Array(width * height * 4), width, height };
}

export function cloneImage(img: RgbaImage): RgbaImage {
  return { data: new Uint8Array(img.data), width: img.width, height: img.height };
}

/** 줄마다 그림이 있는 칸의 왼쪽·오른쪽 끝과 개수, 그리고 그림의 맨 윗줄·아랫줄(없으면 -1) */
export type RowSpans = { left: Int32Array; right: Int32Array; count: Int32Array; top: number; bottom: number };

export function rowSpans(img: RgbaImage, alphaMin = SOLID_ALPHA): RowSpans {
  const { width: W, height: H, data } = img;
  const left = new Int32Array(H).fill(-1);
  const right = new Int32Array(H).fill(-1);
  const count = new Int32Array(H);
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < H; y++) {
    let l = -1;
    let r = -1;
    let n = 0;
    const row = y * W * 4;
    for (let x = 0; x < W; x++) {
      if (data[row + x * 4 + 3] > alphaMin) {
        if (l < 0) l = x;
        r = x;
        n++;
      }
    }
    left[y] = l;
    right[y] = r;
    count[y] = n;
    // 한두 점짜리 줄(얼룩·안티에일리어싱)은 그림의 위·아래 끝으로 치지 않는다
    if (n >= 2) {
      if (top < 0) top = y;
      bottom = y;
    }
  }
  return { left, right, count, top, bottom };
}

export function spanWidth(s: RowSpans, y: number): number {
  return s.left[y] < 0 ? 0 : s.right[y] - s.left[y] + 1;
}

export function colorDist(a: Rgb, b: Rgb): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[s.length >> 1];
}

/** 네모 안 그림 픽셀(알파 alphaMin 넘음)의 채널별 가운데 값. 픽셀이 minCount 보다 적으면 null. skip 이 참인 픽셀은 뺀다. */
export function medianColor(
  img: RgbaImage,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  alphaMin = 200,
  minCount = 4,
  skip?: (p: Rgb) => boolean,
): Rgb | null {
  const r: number[] = [];
  const g: number[] = [];
  const b: number[] = [];
  const xa = Math.max(0, Math.floor(x0));
  const xb = Math.min(img.width - 1, Math.ceil(x1));
  const ya = Math.max(0, Math.floor(y0));
  const yb = Math.min(img.height - 1, Math.ceil(y1));
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      const i = (y * img.width + x) * 4;
      if (img.data[i + 3] <= alphaMin) continue;
      if (skip?.([img.data[i], img.data[i + 1], img.data[i + 2]])) continue;
      r.push(img.data[i]);
      g.push(img.data[i + 1]);
      b.push(img.data[i + 2]);
    }
  }
  if (r.length < minCount) return null;
  return [median(r), median(g), median(b)];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/* ─────────────────────────────── 목 줄 찾기 ─────────────────────────────── */

/**
 * 목 줄(자를 줄)을 찾은 결과. 줄 번호는 원본 그림 픽셀(0 = 맨 위).
 *  cut      머리 층과 몸을 나누는 줄 — 이 줄 위는 머리 층(원본 그대로), 이 줄부터 아래가 새 몸. 목 가운데쯤.
 *  chin·head 어림한 턱 줄·머리 높이(머리카락 맨 위 ~ 턱)
 *  cx·neckLeft·neckRight  cut 줄의 목 가운데·목 살 폭(가운데 줄기 — 어두운 윤곽선·그늘은 머리카락처럼 보여 빠진다)
 *  outerLeft·outerRight   cut 줄의 목 바깥 폭(윤곽선까지) — 짧은 머리는 그 줄 바깥 윤곽, 긴 머리는 살 폭에서 윤곽선 굵기만큼.
 *           몸 창고 몸의 목(bodies.json 목 폭도 윤곽선까지)을 이 폭·이 가운데에 맞춘다.
 *  hair·skin  정수리에서 뜬 머리카락 색 · 얼굴에서 뜬 살색(없으면 null) — 긴 머리 가르기·살색 맞추기에 쓴다
 *  longHair 턱 아래로 굵은 머리카락이 내려와 목 옆·어깨를 덮는다(엄마 그림) — 목을 바깥 윤곽이 아니라 가운데 줄기로 찾았다
 *  method   span = 바깥 윤곽이 가장 좁은 줄(짧은 머리 — 사장님 시안과 같은 방법) · run = 머리카락을 뺀 가운데 줄기가 가장 좁은 줄
 *           (긴 머리) · guess = 둘 다 못 찾아 잰 비율의 턱 + 머리 0.15
 *  altCut   다른 방법으로 찾은 줄(맞춰 보기, 없으면 null) · agree 두 줄이 머리 높이의 1/4 안인가(한쪽이 없으면 null)
 */
export type NeckFind = {
  cut: number;
  top: number;
  bottom: number;
  chin: number;
  head: number;
  cx: number;
  neckLeft: number;
  neckRight: number;
  outerLeft: number;
  outerRight: number;
  hair: Rgb | null;
  skin: Rgb | null;
  longHair: boolean;
  method: "span" | "run" | "guess";
  altCut: number | null;
  agree: boolean | null;
};

/** 머리카락 색과 살색이 이만큼은 달라야 머리카락을 따로 가른다(대머리·흰머리처럼 살색과 비슷하면 가르지 않는다) */
export const HAIR_SKIN_MIN_DIST = 60;

/** 밝기(0~255) */
function lum(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * 이 픽셀이 머리카락 같은가 — 머리카락 색에 살색보다 훨씬 가깝고(0.75배 안) 머리카락 색에서 너무 멀지 않고(110 안),
 * 밝기도 머리카락 쪽이다(머리카락·살색 밝기 차이의 40% 안 — 턱 밑 갈색 그늘이 검은 머리로 잡히지 않게).
 * 머리카락·살색이 비슷하면(HAIR_SKIN_MIN_DIST 안) 늘 false.
 */
export function hairLike(p: Rgb, hair: Rgb | null, skin: Rgb | null): boolean {
  if (!hair || !skin) return false;
  const hs = colorDist(hair, skin);
  if (hs < HAIR_SKIN_MIN_DIST) return false;
  const dh = colorDist(p, hair);
  if (!(dh < 110 && dh < 0.75 * colorDist(p, skin))) return false;
  const lh = lum(hair[0], hair[1], hair[2]);
  const ls = lum(skin[0], skin[1], skin[2]);
  return Math.abs(lum(p[0], p[1], p[2]) - lh) <= 0.4 * Math.abs(ls - lh) + 12;
}

/**
 * 가운데 줄기 폭 — 가운데 열(cx)에서 좌우로, 그림이 있고 머리카락 같지 않은 픽셀이 이어지는 만큼. 긴 머리가 어깨를 덮어도
 * 얼굴·목·옷의 폭만 잰다(바깥 윤곽 폭은 머리카락까지 넓어 목을 못 찾는다 — 엄마 그림). 수채화의 가는 선(턱 그늘·옷깃)은
 * gap 픽셀까지 건너뛴다. 가운데가 그런 선 위면 좌우 gap 안에서 시작한다. 시작할 픽셀이 없으면 null.
 */
export function centreRun(
  img: RgbaImage,
  y: number,
  cx: number,
  hair: Rgb | null,
  skin: Rgb | null,
  gap = 0,
): { left: number; right: number } | null {
  const W = img.width;
  const ok = (x: number) => {
    const i = (y * W + x) * 4;
    if (img.data[i + 3] <= SOLID_ALPHA) return false;
    return !hairLike([img.data[i], img.data[i + 1], img.data[i + 2]], hair, skin);
  };
  const c = clamp(Math.round(cx), 0, W - 1);
  let x0 = -1;
  for (let d = 0; d <= gap && x0 < 0; d++) {
    if (c - d >= 0 && ok(c - d)) x0 = c - d;
    else if (c + d < W && ok(c + d)) x0 = c + d;
  }
  if (x0 < 0) return null;
  let l = x0;
  let r = x0;
  for (;;) {
    let step = 0;
    for (let k = 1; k <= gap + 1 && l - k >= 0; k++) {
      if (ok(l - k)) {
        step = k;
        break;
      }
    }
    if (!step) break;
    l -= step;
  }
  for (;;) {
    let step = 0;
    for (let k = 1; k <= gap + 1 && r + k < W; k++) {
      if (ok(r + k)) {
        step = k;
        break;
      }
    }
    if (!step) break;
    r += step;
  }
  return { left: l, right: r };
}

/** 줄 폭 고르기 창(홀수) — 가로로 지나는 선(입·턱 그늘·옷깃 선)이 몇 줄 좁게 재여도 흔들리지 않게 */
function smoothWindow(figH: number): number {
  const k = Math.max(5, Math.round(0.009 * figH));
  return k % 2 ? k : k + 1;
}
/** 가는 선 건너뛰기 폭(px) — 그림 높이 1000px 에서 5px */
export function lineGap(figH: number): number {
  return Math.max(2, Math.round(0.005 * figH));
}

/** 줄마다 잰 값 → k 줄 가운데 값(잴 수 없는 줄은 빼고, 창의 절반도 못 재면 잴 수 없음) */
function smoothRows(raw: Map<number, number>, y0: number, y1: number, k: number): Map<number, number> {
  const out = new Map<number, number>();
  for (let y = y0; y <= y1; y++) {
    if (!raw.has(y)) continue;
    const vals: number[] = [];
    for (let d = -(k >> 1); d <= k >> 1; d++) {
      const v = raw.get(y + d);
      if (v !== undefined) vals.push(v);
    }
    if (vals.length * 2 >= k) out.set(y, median(vals));
  }
  return out;
}

/** 가장 좁은 줄 둘레에서 폭이 거의 같은(6% 안) 줄이 이어지는 구간의 가운데 — 목의 가운데쯤. 창에 잴 줄이 없으면 null. */
function narrowestIn(widths: Map<number, number>, y0: number, y1: number): number | null {
  let best = -1;
  let bestW = Infinity;
  for (let y = y0; y <= y1; y++) {
    const w = widths.get(y);
    if (w !== undefined && w > 0 && w < bestW) {
      bestW = w;
      best = y;
    }
  }
  if (best < 0) return null;
  const tol = Math.max(1, bestW * 0.06);
  let a = best;
  let b = best;
  while (a - 1 >= y0 && (widths.get(a - 1) ?? Infinity) <= bestW + tol) a--;
  while (b + 1 <= y1 && (widths.get(b + 1) ?? Infinity) <= bestW + tol) b++;
  return Math.round((a + b) / 2);
}

/**
 * 비율 없이 바깥 윤곽으로 목 찾기(시안 compose 의 '가장 넓은 머리 줄 아래 가장 좁은 줄'을 어른에도 맞게) — 위에서부터 머리가
 * 부풀었다가(위 30% 가장 넓은 폭의 절반을 넘는 첫 봉우리) 좁아진(그 봉우리의 0.75 이하) 첫 구간에서 가장 좁은 줄.
 * 구간은 다시 넓어지면(어깨) 끝난다. 못 찾으면 null.
 */
function spanNeckNoRatio(spans: Map<number, number>, top: number, figH: number): number | null {
  let M = 0;
  for (let y = top; y <= top + Math.round(0.3 * figH); y++) M = Math.max(M, spans.get(y) ?? 0);
  if (M <= 0) return null;
  let headMax = 0;
  let a = -1;
  for (let y = top; y <= top + Math.round(0.5 * figH); y++) {
    const w = spans.get(y);
    if (w === undefined) continue;
    if (a < 0) {
      if (w > headMax) headMax = w;
      if (headMax >= 0.5 * M && w <= 0.75 * headMax) a = y;
      continue;
    }
    if (w > 0.75 * headMax) return narrowestIn(spans, a, y - 1);
  }
  return a >= 0 ? narrowestIn(spans, a, top + Math.round(0.5 * figH)) : null;
}

/**
 * 살색·머리카락 색 뜨기. 살색 = 얼굴 쪽(머리 30~100%) 가운데 30% 에서 밝고(밝기 150 이상) 붉은 기가 파란 기 이상인 픽셀의
 * 가운데 값 — 눈·눈썹·앞머리(어둡다)를 뺀다. 머리카락 = 정수리(머리 0~12%) 가운데 50%.
 */
function sampleColours(img: RgbaImage, s: RowSpans, top: number, bottom: number, head: number, cx: number): { hair: Rgb | null; skin: Rgb | null } {
  const y0 = Math.round(top + 0.3 * head);
  const y1 = Math.min(bottom, Math.round(top + 1.0 * head));
  const r: number[] = [];
  const g: number[] = [];
  const b: number[] = [];
  for (let y = y0; y <= y1; y++) {
    const w = spanWidth(s, y);
    if (!w) continue;
    const xa = Math.max(0, Math.round(cx - 0.15 * w));
    const xb = Math.min(img.width - 1, Math.round(cx + 0.15 * w));
    for (let x = xa; x <= xb; x++) {
      const i = (y * img.width + x) * 4;
      if (img.data[i + 3] <= 200) continue;
      const R = img.data[i];
      const G = img.data[i + 1];
      const B = img.data[i + 2];
      if (lum(R, G, B) < 150 || R < B) continue;
      r.push(R);
      g.push(G);
      b.push(B);
    }
  }
  const skin: Rgb | null = r.length >= 8 ? [median(r), median(g), median(b)] : null;
  const crownY1 = top + 0.12 * head;
  const crownW = Math.max(4, spanWidth(s, clamp(Math.round(crownY1), top, bottom)));
  const hair = medianColor(img, cx - 0.25 * crownW, cx + 0.25 * crownW, top, crownY1);
  return { hair, skin };
}

/* ── 굵은 머리카락 따라가기 ── */

/** '굵은 머리카락' — 둘레 (2r+1)² 칸의 이만큼 넘게 머리카락이어야 한다(옷깃·팔의 가는 윤곽선은 따라가지 않는다) */
const THICK_SHARE = 0.6;

/**
 * y0 줄부터 아래로 머리카락 따라가기 — **굵은** 머리카락만(가는 선은 아니다), 위(y0 − 1 줄) 머리와 이어진 것만,
 * 가운데 목 줄기(|x − cx| ≤ guard)는 넘지 않는다. 따라간 뒤 r 만큼 넓혀 가장자리(머리카락 같은 픽셀)를 되찾는다.
 * 돌려주는 mask: 1 = 머리카락. rowCount(y) 는 y 줄의 머리카락 픽셀 수.
 */
export function traceHair(
  img: RgbaImage,
  o: { y0: number; yMax: number; cx: number; guard: number; hair: Rgb | null; skin: Rgb | null; r: number },
): { mask: Uint8Array; n: number; bottom: number; rowCount: Int32Array } {
  const W = img.width;
  const H = img.height;
  const { y0, cx, guard, r } = o;
  const yMax = Math.min(H - 1, o.yMax);
  const mask = new Uint8Array(W * H);
  const rowCount = new Int32Array(H);
  if (y0 < 1 || y0 > yMax || !o.hair || !o.skin) return { mask, n: 0, bottom: y0 - 1, rowCount };
  const outside = (x: number) => Math.abs(x - cx) > guard;
  const ya = Math.max(0, y0 - r - 1);
  const yb = Math.min(H - 1, yMax + r);
  const rows = yb - ya + 1;
  const isHair = new Uint8Array(W * rows);
  for (let y = ya; y <= yb; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (img.data[i + 3] > 60 && hairLike([img.data[i], img.data[i + 1], img.data[i + 2]], o.hair, o.skin)) {
        isHair[(y - ya) * W + x] = 1;
      }
    }
  }
  const sum = new Int32Array((W + 1) * (rows + 1));
  for (let y = 0; y < rows; y++) {
    let acc = 0;
    for (let x = 0; x < W; x++) {
      acc += isHair[y * W + x];
      sum[(y + 1) * (W + 1) + x + 1] = sum[y * (W + 1) + x + 1] + acc;
    }
  }
  const thick = (x: number, y: number) => {
    if (!isHair[(y - ya) * W + x]) return false;
    const xa = Math.max(0, x - r);
    const xb = Math.min(W - 1, x + r);
    const yA = Math.max(0, y - ya - r);
    const yB = Math.min(rows - 1, y - ya + r);
    const n = sum[(yB + 1) * (W + 1) + xb + 1] - sum[yA * (W + 1) + xb + 1] - sum[(yB + 1) * (W + 1) + xa] + sum[yA * (W + 1) + xa];
    return n >= THICK_SHARE * (xb - xa + 1) * (yB - yA + 1);
  };

  const core = new Uint8Array(W * H);
  const stack: number[] = [];
  for (let x = 0; x < W; x++) {
    if (!outside(x) || !thick(x, y0)) continue;
    const above = thick(x, y0 - 1) || (x > 0 && thick(x - 1, y0 - 1)) || (x < W - 1 && thick(x + 1, y0 - 1));
    if (!above) continue;
    core[y0 * W + x] = 1;
    stack.push(x, y0);
  }
  while (stack.length) {
    const y = stack.pop() as number;
    const x = stack.pop() as number;
    for (let dy = -1; dy <= 1; dy++) {
      const ny = y + dy;
      if (ny < y0 || ny > yMax) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        if ((dx === 0 && dy === 0) || nx < 0 || nx >= W) continue;
        const k = ny * W + nx;
        if (core[k] || !outside(nx) || !thick(nx, ny)) continue;
        core[k] = 1;
        stack.push(nx, ny);
      }
    }
  }
  // 넓히기 — 굵은 머리카락 둘레 r 안의 머리카락 같은 픽셀(가장자리)
  let n = 0;
  let bottom = y0 - 1;
  for (let y = y0; y <= yMax; y++) {
    for (let x = 0; x < W; x++) {
      if (!outside(x) || !isHair[(y - ya) * W + x]) continue;
      let near = false;
      for (let dy = -r; dy <= r && !near; dy++) {
        const yy = y + dy;
        if (yy < y0 || yy > yMax) continue;
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < W && core[yy * W + xx]) {
            near = true;
            break;
          }
        }
      }
      if (!near) continue;
      mask[y * W + x] = 1;
      rowCount[y]++;
      n++;
      if (y > bottom) bottom = y;
    }
  }
  return { mask, n, bottom, rowCount };
}

/** 머리카락 따라가기의 굵기 반경(px) — 그림 높이 1000px 에서 6px */
export function hairRadius(figH: number): number {
  return Math.max(1, Math.round(0.006 * figH));
}

/** 이만큼(머리 높이² 비율) 넘게 턱 + 머리 0.25 아래로 굵은 머리카락이 내려오면 '긴 머리' */
export const LONG_HAIR_MIN = 0.02;

/**
 * 목 줄 찾기(사장님 시안 compose·prep-mom2 를 일반화).
 *
 * ① 짧은 머리(목 옆이 비어 있다) — 바깥 윤곽이 가장 좁은 줄(시안 compose 와 같은 방법 — 아빠·아이 그림에서 확인). 윤곽은
 *    수채화 그늘·선에 흔들리지 않고, 브이넥 셔츠 안쪽 살처럼 목 아래 옷 속 살은 어깨 폭이라 잡히지 않는다.
 *    잰 머리 비율(headRatio — 키 ÷ 머리, lib/family-head)이 있으면 턱 = 맨 윗줄 + 키 ÷ 비율로 어림해 턱 − 머리 0.1 ~ 턱 + 머리 0.6
 *    창에서, 없으면 위에서부터 '머리가 부풀었다 좁아진 첫 구간'(spanNeckNoRatio)에서 찾는다.
 * ② 긴 머리(턱 아래로 굵은 머리카락이 어깨까지 — traceHair 로 가린다) — 바깥 윤곽은 머리카락 폭이라 못 쓴다(시안 prep-mom2).
 *    머리카락을 뺀 가운데 줄기(centreRun, 가는 선 건너뜀)가 가장 좁은 줄을 턱 − 머리 0.05 ~ 턱 + 머리 0.35 창에서 찾는다
 *    (창을 짧게 — 브이넥 블라우스 안쪽 살을 목으로 잡지 않게). 비율이 없으면 fallbackRatio(표 × 0.8)로 턱을 어림한다.
 * 줄 폭은 몇 줄씩 골라 잰다(smoothRows — 입·턱 그늘 선 한두 줄에 흔들리지 않게). 가장 좁은 줄이 여러 줄이면 그 가운데.
 * 둘 다 못 찾으면: 비율이 있으면 턱 + 머리 0.15(guess), 없으면 null(옷을 갈아입힐 수 없는 그림).
 */
export function findNeck(img: RgbaImage, o: { headRatio?: number; fallbackRatio?: number } = {}): NeckFind | null {
  const s = rowSpans(img);
  if (s.top < 0) return null;
  const top = s.top;
  const bottom = s.bottom;
  const figH = bottom - top + 1;
  if (figH < 60) return null;

  const ratio = cleanHeadRatio(o.headRatio);
  const guess = cleanHeadRatio(o.fallbackRatio) ?? 5;
  const head = figH / (ratio ?? guess);
  const chin = top + head;

  // 얼굴 가운데 열 — 얼굴 가운데쯤(머리 60%) 줄의 바깥 폭 가운데(정면 그림 — 목·몸 가운데도 같은 열)
  const faceY = clamp(Math.round(top + 0.6 * head), top, bottom);
  const cx = s.left[faceY] >= 0 ? (s.left[faceY] + s.right[faceY]) / 2 : img.width / 2;
  const faceSpan = spanWidth(s, faceY) || img.width;
  const { hair, skin } = sampleColours(img, s, top, bottom, head, cx);

  const gap = lineGap(figH);
  const k = smoothWindow(figH);
  const yEnd = Math.min(bottom, top + Math.round(0.6 * figH));

  // ① 바깥 윤곽
  const rawSpan = new Map<number, number>();
  for (let y = top; y <= yEnd; y++) {
    const w = spanWidth(s, y);
    if (w > 0) rawSpan.set(y, w);
  }
  const spans = smoothRows(rawSpan, top, yEnd, k);
  const spanCut =
    ratio !== undefined
      ? narrowestIn(spans, Math.max(top, Math.round(chin - 0.1 * head)), Math.min(yEnd, Math.round(chin + 0.6 * head)))
      : spanNeckNoRatio(spans, top, figH);

  // ② 가운데 줄기
  const rawRun = new Map<number, number>();
  const ra = Math.max(top, Math.round(chin - 0.05 * head) - k);
  const rb = Math.min(yEnd, Math.round(chin + 0.35 * head) + k);
  for (let y = ra; y <= rb; y++) {
    const run = centreRun(img, y, cx, hair, skin, gap);
    if (run) rawRun.set(y, run.right - run.left + 1);
  }
  const runs = smoothRows(rawRun, ra, rb, k);
  const runCut = narrowestIn(runs, Math.max(top, Math.round(chin - 0.05 * head)), Math.min(yEnd, Math.round(chin + 0.35 * head)));

  // 긴 머리 — 턱 줄부터 굵은 머리카락을 따라가 턱 + 머리 0.25 아래에 충분히 있나(가운데 얼굴 폭의 1/4 안은 목 줄기라 뺀다)
  const trace = traceHair(img, {
    y0: Math.round(chin),
    yMax: Math.round(chin + 1.0 * head),
    cx,
    guard: 0.25 * faceSpan,
    hair,
    skin,
    r: hairRadius(figH),
  });
  let below = 0;
  for (let y = Math.round(chin + 0.25 * head); y < trace.rowCount.length; y++) below += trace.rowCount[y];
  const longHair = below >= Math.max(20, LONG_HAIR_MIN * head * head);

  let cut: number;
  let method: NeckFind["method"];
  let altCut: number | null;
  if (longHair && runCut !== null) {
    cut = runCut;
    method = "run";
    altCut = spanCut;
  } else if (!longHair && spanCut !== null) {
    cut = spanCut;
    method = "span";
    altCut = runCut;
  } else if (ratio !== undefined) {
    cut = Math.round(chin + 0.15 * head);
    method = "guess";
    altCut = spanCut ?? runCut;
  } else {
    return null;
  }
  cut = clamp(cut, top + 4, top + Math.round(0.6 * figH));

  const run = centreRun(img, cut, cx, hair, skin, gap);
  const neckLeft = run ? run.left : Math.max(0, s.left[cut]);
  const neckRight = run ? run.right : Math.max(neckLeft, s.right[cut]);
  // 바깥 폭 — 살 폭에서 멀리 벗어나지 않게(목 옆으로 늘어진 머리카락 한 가닥까지 목으로 치지 않게) 살 폭의 1/4 + 선 굵기까지
  const reach = Math.round(0.25 * (neckRight - neckLeft + 1)) + gap;
  let outerLeft = neckLeft;
  let outerRight = neckRight;
  if (method === "span" && s.left[cut] >= 0) {
    // 짧은 머리 — 그 줄의 바깥 윤곽이 곧 목 윤곽선
    outerLeft = Math.min(neckLeft, Math.max(s.left[cut], neckLeft - reach));
    outerRight = Math.max(neckRight, Math.min(s.right[cut], neckRight + reach));
  } else {
    // 긴 머리·어림 — 목 옆이 머리카락이라 바깥 윤곽을 못 쓴다: 그림이 이어지는 만큼 선 굵기(gap)까지만
    const solid = (x: number) => img.data[(cut * img.width + x) * 4 + 3] > SOLID_ALPHA;
    for (let k = 0; k < gap && outerLeft - 1 >= 0 && solid(outerLeft - 1); k++) outerLeft--;
    for (let k = 0; k < gap && outerRight + 1 < img.width && solid(outerRight + 1); k++) outerRight++;
  }
  return {
    cut,
    top,
    bottom,
    chin: Math.round(chin),
    head,
    cx: (neckLeft + neckRight) / 2,
    neckLeft,
    neckRight,
    outerLeft,
    outerRight,
    hair,
    skin,
    longHair,
    method,
    altCut,
    agree: altCut === null ? null : Math.abs(altCut - cut) <= 0.25 * head,
  };
}

/* ─────────────────────────────── 머리 떼기 ─────────────────────────────── */

/**
 * 떼어 낸 머리 층 — 원본과 같은 크기·같은 자리. 합칠 때 맨 위에 그대로 얹는다.
 *  head     cut 위 전부(원본 픽셀 그대로) + cut 아래로 내려온 굵은 머리카락(가장자리는 옅게). cut 아래의 목·옛 옷은 넣지 않는다
 *           (이음매는 몸 쪽에서 — blendNeckJoin). cut 위 픽셀은 원본과 한 바이트도 다르지 않다(시험이 본다).
 *  longHair 어깨로 내려온 머리카락이 있나 · hairBottom 머리 층에 넣은 머리카락의 맨 아랫줄(없으면 cut-1)
 *  hairPixels cut 아래에서 머리 층에 넣은 머리카락 픽셀 수
 */
export type HeadSplit = {
  head: RgbaImage;
  cut: number;
  longHair: boolean;
  hairBottom: number;
  hairPixels: number;
};

/** 머리카락은 cut 아래 머리 높이의 이만큼까지만 따라간다(가슴께) */
export const HAIR_MAX_DROP = 1.6;
/** 따라간 머리카락이 그 구간 그림의 이만큼을 넘으면 어두운 옷까지 머리카락으로 본 것 — 짧게 다시, 그래도 넘으면 버린다 */
export const HAIR_MAX_SHARE = 0.45;

/** 구간(y0~y1)의 그림 픽셀 수 */
function solidCount(img: RgbaImage, y0: number, y1: number): number {
  let n = 0;
  for (let y = Math.max(0, y0); y <= Math.min(img.height - 1, y1); y++) {
    const row = y * img.width * 4;
    for (let x = 0; x < img.width; x++) if (img.data[row + x * 4 + 3] > SOLID_ALPHA) n++;
  }
  return n;
}

/**
 * 머리 층을 뗀다(사장님 시안 prep-mom2 를 손 없이 — 긴 머리가 어깨를 덮는 엄마 그림).
 * cut 줄부터 굵은 머리카락을 따라가 머리 층에 넣는다(가는 옷깃 선은 따라가지 않는다). 가슴께(머리 1.6)까지 따라갔는데 그 구간
 * 그림의 45% 를 넘으면 어두운 옷까지 먹은 것이라 어깨께(0.6)로 줄이고, 그래도 넘으면 머리카락을 따로 가르지 않는다.
 * 머리카락·살색이 비슷하면(대머리·흰머리) 가르지 않는다.
 */
export function splitHead(img: RgbaImage, neck: NeckFind): HeadSplit {
  const W = img.width;
  const H = img.height;
  const src = img.data;
  const { cut } = neck;
  const figH = neck.bottom - neck.top + 1;
  const neckW = neck.neckRight - neck.neckLeft + 1;

  let hair: { mask: Uint8Array; n: number; bottom: number } = { mask: new Uint8Array(0), n: 0, bottom: cut - 1 };
  for (const drop of [HAIR_MAX_DROP, 0.6]) {
    const yMax = Math.min(H - 1, Math.round(cut + drop * neck.head));
    const t = traceHair(img, {
      y0: cut,
      yMax,
      cx: neck.cx,
      guard: Math.max(2, 0.4 * neckW),
      hair: neck.hair,
      skin: neck.skin,
      r: hairRadius(figH),
    });
    const area = Math.max(1, solidCount(img, cut, yMax));
    if (t.n / area <= HAIR_MAX_SHARE) {
      hair = t;
      break;
    }
  }
  const longHair = neck.longHair && hair.n > 0;

  // 머리카락 가장자리 알파 — 머리카락 색에 가까울수록 1, 살색·옷 쪽으로 섞였으면 옅게
  const hs = neck.hair && neck.skin ? colorDist(neck.hair, neck.skin) : 1;
  const hairAlpha = (i: number) => {
    if (!neck.hair) return 1;
    const d = colorDist([src[i], src[i + 1], src[i + 2]], neck.hair);
    return clamp((0.75 * hs - d) / (0.4 * hs), 0, 1);
  };

  const head = newImage(W, H);
  const hd = head.data;
  const put = (i: number, alpha: number) => {
    if (alpha <= hd[i + 3]) return;
    hd[i] = src[i];
    hd[i + 1] = src[i + 1];
    hd[i + 2] = src[i + 2];
    hd[i + 3] = alpha;
  };

  // cut 위: 원본 줄째
  for (let y = 0; y < Math.min(cut, H); y++) {
    const row = y * W * 4;
    hd.set(src.subarray(row, row + W * 4), row);
  }
  // cut 아래 머리카락 — 머리 층으로
  if (hair.n > 0) {
    for (let y = cut; y <= hair.bottom && y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!hair.mask[y * W + x]) continue;
        const i = (y * W + x) * 4;
        put(i, Math.round(src[i + 3] * hairAlpha(i)));
      }
    }
  }
  return { head, cut, longHair, hairBottom: hair.bottom, hairPixels: hair.n };
}

/* ─────────────────────────────── 몸 맞추기 ─────────────────────────────── */

/** 몸 그림을 원본 자리에 놓는 셈 — 몸 그림을 scale 배(가로·세로 같게)로 바꿔 원본 좌표 (left, top) 에 놓는다 */
export type BodyPlacement = { scale: number; left: number; top: number; width: number; height: number };

/** 몸 목을 cut 보다 이만큼(머리 높이 비율, 최소 2px) 위에서 시작하게 겹친다 — 몸 목 토막 맨 윗줄의 옅은 가장자리(바탕을 지운
 * 자국)가 cut 위로 올라가 지워지고, cut 줄에는 몸 목의 속살이 온다(이음매에 흰 줄이 안 생기게) */
export const NECK_OVERLAP_SHARE = 0.012;

export function neckOverlap(head: number): number {
  return Math.max(2, Math.round(NECK_OVERLAP_SHARE * head));
}

/**
 * 몸 목 토막 맨 윗줄부터 속살(목 가운데 절반 폭의 90% 넘게 알파 250 이상)이 시작되기까지의 줄 수(몸 그림 픽셀) — 바탕을 지운
 * 몸은 목 윗가장자리가 몇 줄 반투명하다. 겹침을 이만큼보다 깊게 해야 cut 줄에 반투명 줄(밝은 선)이 안 남는다. 키의 10% 안에서
 * 못 찾으면 0.
 */
export function bodySolidDepth(img: RgbaImage, m: BodyMeta): number {
  const w = m.neckRight - m.neckLeft;
  const x0 = Math.max(0, Math.round(m.neckLeft + 0.25 * w));
  const x1 = Math.min(img.width - 1, Math.round(m.neckRight - 0.25 * w));
  const yMax = Math.min(img.height - 1, Math.round(m.neckY + 0.1 * (m.feetY - m.neckY)));
  for (let y = Math.max(0, m.neckY); y <= yMax; y++) {
    let n = 0;
    let solid = 0;
    for (let x = x0; x <= x1; x++) {
      n++;
      if (img.data[(y * img.width + x) * 4 + 3] >= 250) solid++;
    }
    if (n > 0 && solid >= 0.9 * n) return y - m.neckY;
  }
  return 0;
}

/**
 * 겹침 줄 수(원본 픽셀) — 기본(neckOverlap)과 몸 목 반투명 가장자리 깊이 × 배율 + 1 가운데 큰 쪽, 머리 높이의 8% 까지.
 * scale 은 겹침 없이 셈한 배율(겹침이 몇 줄이라 거의 같다).
 */
export function bodyOverlap(head: number, depth: number, scale: number): number {
  const need = Math.ceil((Math.max(0, depth) + 1) * Math.max(0, scale));
  return Math.min(Math.max(neckOverlap(head), need), Math.max(2, Math.round(0.08 * head)));
}

/**
 * 몸 목 줄 → 원본 cut − overlap, 몸 발끝 → 원본 발끝이 되게(세로 두 점으로 배율), 몸 목 가운데 → 원본 목 가운데(가로, cx 는
 * 픽셀 번호 — 반 픽셀을 더해 이어진 좌표로). 가로·세로 같은 배율이다(몸이 찌그러지지 않는다 — 목 폭은 fitNeckWidth 가
 * 목 둘레만 맞춘다). cut 위로 겹친 몸은 합칠 때 지운다(composeOutfit). 셈이 이상하면 null.
 */
export function placeBody(
  src: { cut: number; bottom: number; cx: number },
  m: BodyMeta,
  overlap = 0,
): BodyPlacement | null {
  const span = m.feetY - m.neckY;
  const start = src.cut - Math.max(0, overlap);
  const want = src.bottom - start;
  if (!(span > 0) || !(want > 0)) return null;
  const scale = want / span;
  if (!(scale > 0.02 && scale < 50)) return null;
  const neckCx = (m.neckLeft + m.neckRight + 1) / 2;
  return {
    scale,
    left: Math.round(src.cx + 0.5 - neckCx * scale),
    top: Math.round(start - m.neckY * scale),
    width: Math.max(1, Math.round(m.w * scale)),
    height: Math.max(1, Math.round(m.h * scale)),
  };
}

/** 목 폭 맞추기 배율의 끝 — 몸 창고 몸과 원본 목이 이보다 많이 다르면 이만큼만 맞춘다(목이 이상하게 가늘어지거나 굵어지지 않게) */
export const NECK_FIT_MIN = 0.7;
export const NECK_FIT_MAX = 1.45;

/** 원본 목 가운데(바깥 폭 가운데, 이어진 좌표) — 몸 목 가운데를 여기에 맞춘다 */
export function neckCentre(neck: Pick<NeckFind, "outerLeft" | "outerRight">): number {
  return (neck.outerLeft + neck.outerRight) / 2;
}

/** 원본 목 바깥 폭 ÷ 맞춘 몸 목 폭 → 목 폭 맞추기 배율(끝 안으로). 몸 목 폭은 bodies.json 칸 × 배율(둘 다 윤곽선까지). */
export function neckFitRatio(neck: Pick<NeckFind, "outerLeft" | "outerRight">, m: BodyMeta, scale: number): number {
  const want = neck.outerRight - neck.outerLeft + 1;
  const have = (m.neckRight - m.neckLeft + 1) * scale;
  if (!(want > 0) || !(have > 0)) return 1;
  return clamp(want / have, NECK_FIT_MIN, NECK_FIT_MAX);
}

/**
 * 몸 목 둘레가 끝나는 줄(원본 좌표) — 맞춘 몸에서 cut 아래로 줄 폭이 목 폭의 1.8배를 처음 넘는 줄(어깨·옷깃이 벌어진다).
 * 머리 높이의 0.12 ~ 0.5 안으로. 못 찾으면 cut + 머리 0.3.
 */
export function neckBandEnd(body: RgbaImage, place: Pick<BodyPlacement, "left" | "top">, neck: NeckFind): number {
  const s = rowSpans(body);
  const neckW = Math.max(1, neck.outerRight - neck.outerLeft + 1);
  const lo = Math.round(neck.cut + 0.12 * neck.head);
  const hi = Math.round(neck.cut + 0.5 * neck.head);
  for (let y = neck.cut + 1; y <= hi; y++) {
    const by = y - place.top;
    if (by < 0 || by >= body.height) continue;
    if (spanWidth(s, by) > 1.8 * neckW) return clamp(y, lo, hi);
  }
  return Math.round(neck.cut + 0.3 * neck.head);
}

/**
 * 목 폭 맞추기(사장님 제안서 '목 굵기 … 맞추는 보정') — 맞춘 몸(원본 좌표 (left, top) 에 놓일 그림)의 cut 줄에서 가로를
 * k0 배로 늘이거나 줄이고, to 줄(어깨·옷깃)까지 부드럽게(smoothstep) 1 로 돌아간다. 가운데는 원본 목 가운데(cx).
 * 어깨·옷은 그대로이고 목과 옷깃 윗부분만 바뀐다. 알파를 곱한 채로 섞는다(가장자리가 검게 번지지 않게). 고친 줄 수를 돌려준다.
 */
export function fitNeckWidth(
  body: RgbaImage,
  o: { left: number; top: number; cut: number; to: number; cx: number; k0: number },
): number {
  if (!(Math.abs(o.k0 - 1) >= 0.03) || !(o.to > o.cut)) return 0;
  const W = body.width;
  const D = body.data;
  const row = new Uint8Array(W * 4);
  const cxL = o.cx - o.left;
  let changed = 0;
  for (let y = o.cut; y < o.to; y++) {
    const by = y - o.top;
    if (by < 0 || by >= body.height) continue;
    const t = (y - o.cut) / (o.to - o.cut);
    const k = 1 + (o.k0 - 1) * (1 - t * t * (3 - 2 * t));
    if (Math.abs(k - 1) < 0.005) continue;
    const base = by * W * 4;
    for (let x = 0; x < W; x++) {
      const sx = cxL + (x + 0.5 - cxL) / k - 0.5;
      const x0 = Math.floor(sx);
      const f = sx - x0;
      let a = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      for (const [xx, w] of [
        [x0, 1 - f],
        [x0 + 1, f],
      ] as const) {
        if (w <= 0 || xx < 0 || xx >= W) continue;
        const i = base + xx * 4;
        const aw = (D[i + 3] / 255) * w;
        a += aw;
        r += D[i] * aw;
        g += D[i + 1] * aw;
        b += D[i + 2] * aw;
      }
      const o4 = x * 4;
      if (a <= 1e-6) {
        row[o4] = row[o4 + 1] = row[o4 + 2] = row[o4 + 3] = 0;
        continue;
      }
      row[o4] = Math.round(r / a);
      row[o4 + 1] = Math.round(g / a);
      row[o4 + 2] = Math.round(b / a);
      row[o4 + 3] = Math.round(clamp(a, 0, 1) * 255);
    }
    D.set(row, base);
    changed++;
  }
  return changed;
}

/* ─────────────────────────────── 목 이음매 ─────────────────────────────── */

/** 목 이음매 줄 수 — 머리 높이의 이만큼(최소 2줄) */
export const JOIN_SHARE = 0.08;
/** 이음매에서 옮길 수 있는 한 채널 최대 */
export const JOIN_SHIFT_MAX = 40;
/** 몸 목 윗줄 살색에서 이만큼 안의 몸 픽셀만 옮긴다(몸의 윤곽선·옷깃·무늬는 그대로) */
export const JOIN_SKIN_DIST = 60;

export function joinRows(head: number): number {
  return Math.max(2, Math.round(JOIN_SHARE * head));
}

/**
 * 목 이음매(사장님 시안의 '목 이음매를 몇 줄 섞기'를 몸 쪽에서) — 열마다 원본 목 끝(cut 바로 위 세 줄)과 몸 목 첫머리(cut 부터
 * 세 줄)의 살색 평균 차이를 재고, 옆으로 고르게 편 뒤(목 폭의 8% 창 — 턱 밑 그늘처럼 가운데만 짙은 곡선도 따라가되 열마다
 * 네모지게 튀지 않게) 그만큼 몸 목 위쪽 rows 줄의 살색 픽셀을 옮긴다(첫 줄 전부 → 아래로 갈수록 (1 − t)² 로 0).
 * 몸의 결·그늘은 그대로 두고 색만 원본 목에 이어 붙인다 — 원본의 cut 아래(옛 옷·옛 옷깃)는 쓰지 않는다.
 * 목 폭(x0~x1)·rows 줄 밖과 몸 목 살색에서 먼 픽셀(윤곽선·옷깃·무늬)은 건드리지 않는다. 가운데 열의 차이를 돌려준다(안 했으면 null).
 * body 는 원본 좌표 (left, top) 에 놓일 맞춘 몸.
 */
export function matchNeckJoin(
  body: RgbaImage,
  place: Pick<BodyPlacement, "left" | "top">,
  original: RgbaImage,
  neck: Pick<NeckFind, "cut" | "hair" | "skin">,
  o: { x0: number; x1: number; rows: number },
): Rgb | null {
  const { cut } = neck;
  const x0 = Math.max(0, Math.round(o.x0));
  const x1 = Math.min(original.width - 1, Math.round(o.x1));
  const by = cut - place.top;
  const first = medianColor(body, x0 - place.left, x1 - place.left, by, by + 2, 200, 4, (p) => !skinLike(p));
  if (x1 < x0 || !first) return null;
  const n = x1 - x0 + 1;
  // 열마다 차이(원본 끝줄 평균 − 몸 첫줄 평균) — 둘 다 살색 픽셀만
  const dr = new Float64Array(n);
  const dg = new Float64Array(n);
  const db = new Float64Array(n);
  const ok = new Uint8Array(n);
  const S = original.data;
  const B = body.data;
  for (let j = 0; j < n; j++) {
    const x = x0 + j;
    const bx = x - place.left;
    if (bx < 0 || bx >= body.width) continue;
    let oc = 0;
    let bc = 0;
    const os = [0, 0, 0];
    const bs = [0, 0, 0];
    for (let y = cut - 3; y <= cut - 1; y++) {
      if (y < 0 || y >= original.height) continue;
      const i = (y * original.width + x) * 4;
      const p: Rgb = [S[i], S[i + 1], S[i + 2]];
      if (S[i + 3] <= 200 || !skinLike(p) || hairLike(p, neck.hair, neck.skin)) continue;
      os[0] += p[0];
      os[1] += p[1];
      os[2] += p[2];
      oc++;
    }
    for (let yy = by; yy <= by + 2; yy++) {
      if (yy < 0 || yy >= body.height) continue;
      const i = (yy * body.width + bx) * 4;
      const p: Rgb = [B[i], B[i + 1], B[i + 2]];
      if (B[i + 3] <= 200 || !skinLike(p) || colorDist(p, first) >= JOIN_SKIN_DIST) continue;
      bs[0] += p[0];
      bs[1] += p[1];
      bs[2] += p[2];
      bc++;
    }
    if (!oc || !bc) continue;
    dr[j] = os[0] / oc - bs[0] / bc;
    dg[j] = os[1] / oc - bs[1] / bc;
    db[j] = os[2] / oc - bs[2] / bc;
    ok[j] = 1;
  }
  // 옆으로 고르게 — 잴 수 없는 열은 이웃에서 채운다
  const R = Math.max(2, Math.round(0.08 * n));
  const sm: (Rgb | null)[] = new Array(n).fill(null);
  for (let j = 0; j < n; j++) {
    let c = 0;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let q = Math.max(0, j - R); q <= Math.min(n - 1, j + R); q++) {
      if (!ok[q]) continue;
      r += dr[q];
      g += dg[q];
      b += db[q];
      c++;
    }
    if (!c) continue;
    sm[j] = [
      clamp(r / c, -JOIN_SHIFT_MAX, JOIN_SHIFT_MAX),
      clamp(g / c, -JOIN_SHIFT_MAX, JOIN_SHIFT_MAX),
      clamp(b / c, -JOIN_SHIFT_MAX, JOIN_SHIFT_MAX),
    ];
  }
  if (!sm.some(Boolean)) return null;
  for (let k = 0; k < o.rows; k++) {
    const yy = by + k;
    if (yy < 0 || yy >= body.height) continue;
    const t = (k + 0.5) / o.rows;
    const w = (1 - t) * (1 - t);
    for (let j = 0; j < n; j++) {
      const s = sm[j];
      const bx = x0 + j - place.left;
      if (!s || bx < 0 || bx >= body.width) continue;
      const i = (yy * body.width + bx) * 4;
      if (B[i + 3] === 0) continue;
      const p: Rgb = [B[i], B[i + 1], B[i + 2]];
      const d = colorDist(p, first);
      if (d >= JOIN_SKIN_DIST) continue;
      // 살색 가장자리(선으로 넘어가는 곳)는 덜 옮긴다
      const ww = w * (d <= 0.5 * JOIN_SKIN_DIST ? 1 : 2 - (2 * d) / JOIN_SKIN_DIST);
      for (let ch = 0; ch < 3; ch++) B[i + ch] = clamp(Math.round(p[ch] + s[ch] * ww), 0, 255);
    }
  }
  const mid = sm[n >> 1] ?? sm.find(Boolean) ?? null;
  return mid ? [Math.round(mid[0]), Math.round(mid[1]), Math.round(mid[2])] : null;
}

/* ─────────────────────────────── 살색 맞추기 ─────────────────────────────── */

/**
 * 살색 같은가 — 붉은 기가 파란 기 이상이고, 초록보다 너무 낮지 않고, 너무 어둡지 않다(윤곽선·그늘·머리카락을 살로 잡지 않게).
 * 가장 짙은 살색 칩('햇볕에 그을림' #a86b43, 밝기 약 121)에 수채화 그늘이 져도 들게 밝기 80 부터.
 */
export function skinLike(c: Rgb): boolean {
  return c[0] >= 90 && c[0] >= c[2] && c[0] + 10 >= c[1] && lum(c[0], c[1], c[2]) >= 80;
}

/** 원본 목 색 — cut 바로 위 띠(머리 높이 0.08, 최소 2줄)의 목 가운데 60%(머리카락 같은 픽셀은 뺀다). 없으면 null. */
export function neckColor(img: RgbaImage, neck: NeckFind): Rgb | null {
  const band = Math.max(2, Math.round(0.08 * neck.head));
  const half = Math.max(1, 0.3 * (neck.neckRight - neck.neckLeft + 1));
  return medianColor(img, neck.cx - half, neck.cx + half, neck.cut - band, neck.cut - 1, 200, 4, (p) =>
    hairLike(p, neck.hair, neck.skin),
  );
}

/** 목 색이 얼굴 살색에서 이만큼 넘게 멀면 목을 옷깃·그늘이 덮은 것으로 보고 얼굴 살색을 쓴다 */
export const NECK_FACE_MAX_DIST = 70;

/**
 * 몸에 맞출 살색 — 원본 목 색(이음매와 바로 닿는다)이 살색 같고 얼굴 살색과 가까우면 목 색, 아니면 얼굴 살색.
 * 둘 다 살색 같지 않으면 null(맞추지 않는다).
 */
export function skinTarget(img: RgbaImage, neck: NeckFind): Rgb | null {
  const n = neckColor(img, neck);
  const face = neck.skin && skinLike(neck.skin) ? neck.skin : null;
  if (n && skinLike(n) && (!face || colorDist(n, face) <= NECK_FACE_MAX_DIST)) return n;
  return face;
}

/** 몸 창고 몸의 목 살색(칸에 없을 때) — 맞춘 몸의 cut 바로 아래 띠, 목 가운데 60%. 살색 같지 않으면 null. */
export function bodyNeckColor(body: RgbaImage, place: Pick<BodyPlacement, "left" | "top">, neck: NeckFind): Rgb | null {
  const band = Math.max(2, Math.round(0.08 * neck.head));
  const half = Math.max(1, 0.3 * (neck.neckRight - neck.neckLeft + 1));
  const bx = neck.cx - place.left;
  const by = neck.cut - place.top;
  const c = medianColor(body, bx - half, bx + half, by + 1, by + band);
  return c && skinLike(c) ? c : null;
}

/** 살색 맞추기 — 몸 살색에서 이 거리 안의 픽셀만(가까울수록 많이) */
export const SKIN_RADIUS = 48;
/**
 * 한 채널 최대 옮김. 예전(모델이 그린 몸 — 살짝 주황빛) 30 은 몸 창고의 한 가지 살색을 '햇볕에 그을림'(차이 약 85)까지
 * 맞추기엔 모자라 60. 목·얼굴 살색 검사(skinTarget)를 지난 색에만 쓴다.
 */
export const SKIN_SHIFT_MAX = 60;
/** 살색 덩어리가 몸 그림의 이만큼보다 크면(목 띠에 닿지 않는 한) 살색 비슷한 옷(베이지 원피스)으로 보고 건드리지 않는다 */
export const SKIN_PART_SHARE = 0.08;

/**
 * 몸 살색 맞추기(사장님 제안서 '살색을 맞추는 보정') — 몸 창고 몸의 살색(source)에 가까운 픽셀을 원본 살색(target) 쪽으로
 * 옮긴다(가까울수록 많이, 한 채널 cap 까지). **목·손·팔·다리만**: 살색 픽셀 덩어리 가운데 목 띠(neckRows, 몸 그림 줄)에 닿는
 * 것과 작은 것(몸 그림 픽셀의 share 이하)만 — 살색 비슷한 큰 옷은 두고. 옮긴 채널 차이를 돌려준다(안 했으면 null).
 */
export function matchBodySkin(
  body: RgbaImage,
  o: { source: Rgb; target: Rgb; neckRows: readonly [number, number]; radius?: number; cap?: number; share?: number },
): Rgb | null {
  const radius = o.radius ?? SKIN_RADIUS;
  const cap = o.cap ?? SKIN_SHIFT_MAX;
  const share = o.share ?? SKIN_PART_SHARE;
  const shift: Rgb = [
    clamp(o.target[0] - o.source[0], -cap, cap),
    clamp(o.target[1] - o.source[1], -cap, cap),
    clamp(o.target[2] - o.source[2], -cap, cap),
  ];
  if (Math.max(Math.abs(shift[0]), Math.abs(shift[1]), Math.abs(shift[2])) < 4) return null;
  const W = body.width;
  const H = body.height;
  const D = body.data;
  const N = W * H;
  // 살색 픽셀 표시
  const near = new Uint8Array(N);
  let solid = 0;
  for (let p = 0; p < N; p++) {
    const i = p * 4;
    if (D[i + 3] === 0) continue;
    if (D[i + 3] > SOLID_ALPHA) solid++;
    if (colorDist([D[i], D[i + 1], D[i + 2]], o.source) < radius) near[p] = 1;
  }
  // 덩어리(8이웃) — 목 띠에 닿거나 작은 것만 남긴다
  const label = new Int32Array(N).fill(-1);
  const keep: boolean[] = [];
  const stack = new Int32Array(N);
  const [r0, r1] = o.neckRows;
  for (let p0 = 0; p0 < N; p0++) {
    if (!near[p0] || label[p0] >= 0) continue;
    const id = keep.length;
    let top = 0;
    stack[top++] = p0;
    label[p0] = id;
    let size = 0;
    let touches = false;
    while (top > 0) {
      const p = stack[--top];
      size++;
      const y = (p / W) | 0;
      const x = p - y * W;
      if (y >= r0 && y <= r1) touches = true;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if ((dx === 0 && dy === 0) || nx < 0 || nx >= W) continue;
          const q = ny * W + nx;
          if (!near[q] || label[q] >= 0) continue;
          label[q] = id;
          stack[top++] = q;
        }
      }
    }
    keep.push(touches || size <= share * Math.max(1, solid));
  }
  let moved = 0;
  for (let p = 0; p < N; p++) {
    const id = label[p];
    if (id < 0 || !keep[id]) continue;
    const i = p * 4;
    const d = colorDist([D[i], D[i + 1], D[i + 2]], o.source);
    const w = d <= 0.5 * radius ? 1 : 1 - (d - 0.5 * radius) / (0.5 * radius);
    for (let c = 0; c < 3; c++) D[i + c] = clamp(Math.round(D[i + c] + shift[c] * w), 0, 255);
    moved++;
  }
  return moved > 0 ? shift : null;
}

/* ─────────────────────────────── 합치기 ─────────────────────────────── */

/** src 를 dst 의 (ox, oy) 에 알파 합성(보통 알파, 곧은 알파). rowFrom~rowTo(dst 줄) 밖은 그리지 않는다. */
export function drawOver(dst: RgbaImage, src: RgbaImage, ox: number, oy: number, rowFrom = -Infinity, rowTo = Infinity): void {
  const D = dst.data;
  const S = src.data;
  for (let y = 0; y < src.height; y++) {
    const dy = y + oy;
    if (dy < 0 || dy >= dst.height || dy < rowFrom || dy > rowTo) continue;
    for (let x = 0; x < src.width; x++) {
      const dx = x + ox;
      if (dx < 0 || dx >= dst.width) continue;
      const si = (y * src.width + x) * 4;
      const sa = S[si + 3];
      if (sa === 0) continue;
      const di = (dy * dst.width + dx) * 4;
      if (sa === 255) {
        D[di] = S[si];
        D[di + 1] = S[si + 1];
        D[di + 2] = S[si + 2];
        D[di + 3] = 255;
        continue;
      }
      const a = sa / 255;
      const da = D[di + 3] / 255;
      const oa = a + da * (1 - a);
      if (oa <= 0) continue;
      for (let c = 0; c < 3; c++) D[di + c] = Math.round((S[si + c] * a + D[di + c] * da * (1 - a)) / oa);
      D[di + 3] = Math.round(oa * 255);
    }
  }
}

/** 발끝 아래로 이만큼(px)까지만 몸을 그린다 — 몸 그림의 발 그림자 등이 키를 늘리지 않게 */
export const FEET_SLACK = 2;

/**
 * 합치기 — 맞춘 몸(이미 scale 배로 바꾼 투명 그림)을 원본 좌표 (left, top) 에 놓되 **원본 cut 줄부터 발끝(bottom) + FEET_SLACK
 * 줄까지만** 그리고(목 위는 몸 창고 몸이 무엇을 그렸든 지운다), 머리 층을 (0,0) 에 그대로 얹는다. 돌려주는 캔버스는 둘을 다
 * 담는 크기이고, 원본 (0,0) 이 캔버스 (ox, oy) 에 있다. 머리 층의 cut 위 픽셀은 원본과 똑같이 남는다(그 아래 몸 픽셀이 없다).
 */
export function composeOutfit(o: {
  head: RgbaImage;
  body: RgbaImage;
  left: number;
  top: number;
  cut: number;
  bottom?: number;
}): { image: RgbaImage; ox: number; oy: number } {
  const x0 = Math.min(0, o.left);
  const y0 = Math.min(0, o.top);
  const x1 = Math.max(o.head.width, o.left + o.body.width);
  const y1 = Math.max(o.head.height, o.top + o.body.height);
  const image = newImage(x1 - x0, y1 - y0);
  const ox = -x0;
  const oy = -y0;
  const rowTo = o.bottom === undefined ? Infinity : o.bottom + FEET_SLACK + oy;
  drawOver(image, o.body, o.left + ox, o.top + oy, o.cut + oy, rowTo);
  drawOver(image, o.head, ox, oy);
  return { image, ox, oy };
}

/** 그림이 있는(알파 > 0) 곳만 남기고 잘라 낸다 — 비었으면 null */
export function trimToContent(img: RgbaImage): { image: RgbaImage; x: number; y: number } | null {
  const { width: W, height: H, data } = img;
  let l = W;
  let r = -1;
  let t = H;
  let b = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] === 0) continue;
      if (x < l) l = x;
      if (x > r) r = x;
      if (y < t) t = y;
      if (y > b) b = y;
    }
  }
  if (r < 0) return null;
  const w = r - l + 1;
  const h = b - t + 1;
  const out = newImage(w, h);
  for (let y = 0; y < h; y++) {
    const from = ((y + t) * W + l) * 4;
    out.data.set(data.subarray(from, from + w * 4), y * w * 4);
  }
  return { image: out, x: l, y: t };
}

/* ─────────────────────────────── 몸 재기(점검·시험) ─────────────────────────────── */

/**
 * 머리 없는 몸 그림(투명)을 재서 bodies.json 칸 모양으로 — 목 줄 = 그림 맨 윗줄(목 토막 위), 목 폭 = 그보다 조금 아래(키의 1%)
 * 줄 폭, 발끝 = 맨 아랫줄, 살색 = 목 토막 가운데(살색 같을 때만). 몸 창고 칸을 눈으로 맞춰 볼 때·시험에서 쓴다.
 */
export function measureBody(img: RgbaImage): BodyMeta | null {
  const s = rowSpans(img);
  if (s.top < 0) return null;
  const figH = s.bottom - s.top + 1;
  if (figH < 40) return null;
  const probe = Math.min(s.bottom, s.top + Math.max(2, Math.round(0.01 * figH)));
  if (s.left[probe] < 0) return null;
  const neckLeft = s.left[probe];
  const neckRight = s.right[probe];
  const half = 0.3 * (neckRight - neckLeft + 1);
  const cx = (neckLeft + neckRight) / 2;
  const c = medianColor(img, cx - half, cx + half, s.top, s.top + Math.max(2, Math.round(0.03 * figH)));
  return {
    w: img.width,
    h: img.height,
    neckY: s.top,
    neckLeft,
    neckRight,
    feetY: s.bottom,
    skin: c && skinLike(c) ? c : null,
  };
}
