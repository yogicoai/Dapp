/**
 * 생김새 칩 목록의 원본 — 아이(설정 화면)와 어른(엄마·아빠·할머니·할아버지) 모두.
 *
 * 설정 화면과 가족 그리기 화면이 **같은 목록**을 이 파일에서 가져다 쓴다. 한쪽에서 고른 값이
 * 다른 쪽에도 그대로 켜져 보여야 해서다(같은 ChildPrefs.looks / parents 를 쓴다).
 *
 *  - 아이 줄: CHILD_LOOK_ROWS_ALL — 설정 화면과 가족 화면(아이 탭)이 같은 10줄을 쓴다.
 *  - 어른 줄: adultLookRows(role) — 사장님 결정(2026-09-28) 목록을 글자 그대로. '늘 그대로'(lock)와
 *    '평소 옷' 두 묶음이고, 메모 한 줄(note)은 칩이 아니라 입력 칸이라 줄에 넣지 않는다.
 *  - 옛 값 옮기기: LEGACY_LOOK_VALUES / migrateLookValue — 예전 칩 글자를 새 글자로.
 *  - 칩 앞 스티커: lookIcon — 준비된 파일(READY_ICONS)만 쓰고, 없으면 지금 아이콘으로 물러선다.
 *  - 색 칩 동그라미(lookSwatch)·메모 길이(lookNoteMax)·아이 여러 개 고르기 상한(CHILD_MULTI_MAX) —
 *    두 화면과 저장값 정규화(prefs·family)가 같은 값을 쓰게 여기 한 벌만 둔다.
 *
 * 순수 데이터·함수만 둔다(브라우저·Supabase 없음) — node --test 로 시험할 수 있게.
 */

import type { Gender, ParentLooks } from "./prefs.ts";

/* ─────────────────────────── 아이 줄(설정과 같은 글자) ─────────────────────────── */

/** 하나만 고르는 아이 항목 */
export type ChildLookSingleKey = "hair" | "hairTexture" | "bangs" | "hairColor" | "eyes" | "skin" | "build" | "color";
/** 여러 개 고르는 아이 항목 */
export type ChildLookMultiKey = "items" | "marks";

/** 아이 칩 한 줄 — 설정 화면 LookRow 와 같은 모양에 lock('늘 그대로')만 더했다. */
export type ChildLookRowAll =
  | { key: ChildLookSingleKey; label: string; opts: readonly string[]; lock: boolean; multi?: false }
  | { key: ChildLookMultiKey; label: string; opts: readonly string[]; lock: boolean; multi: true };

/**
 * 아이 특징 칩 전부 — 설정 화면(아이 특징)과 가족 화면(아이 탭)이 이 목록 그대로 쓴다.
 * lock=true 는 '늘 그대로'(얼굴·머리·체형), false 는 이야기마다 바뀔 수 있는 것(옷 색·늘 지니는 것).
 */
export const CHILD_LOOK_ROWS_ALL: readonly ChildLookRowAll[] = [
  {
    key: "hair",
    label: "머리 모양",
    opts: [
      "아주 짧아요",
      "짧은 머리",
      "바가지 머리",
      "귀 덮는 머리",
      "단발",
      "긴 머리",
      "양갈래",
      "하나로 묶기",
      "똥머리",
    ],
    lock: true,
  },
  {
    key: "hairTexture",
    label: "머리결",
    opts: ["곧은 생머리", "살짝 웨이브", "곱슬머리", "파마머리"],
    lock: true,
  },
  { key: "bangs", label: "앞머리", opts: ["있어요", "없어요", "옆으로 넘겨요"], lock: true },
  { key: "hairColor", label: "머리 색", opts: ["까만색", "짙은 갈색", "밝은 갈색"], lock: true },
  {
    key: "eyes",
    label: "눈매",
    opts: ["크고 동그래요", "웃으면 반달이 돼요", "또렷해요", "쌍꺼풀이 있어요"],
    lock: true,
  },
  {
    key: "skin",
    label: "피부",
    opts: ["밝은 편", "보통이에요", "조금 진한 편", "햇볕에 그을렸어요"],
    lock: true,
  },
  {
    key: "build",
    label: "몸집",
    opts: ["통통해요", "보통이에요", "마른 편이에요"],
    lock: true,
  },
  {
    key: "color",
    label: "좋아하는 옷 색",
    opts: ["빨강", "노랑", "파랑", "초록", "분홍", "보라", "하양"],
    lock: false,
  },
  {
    key: "items",
    label: "늘 지니는 것",
    opts: ["곰인형", "모자", "머리핀", "가방", "장난감 자동차", "담요"],
    lock: false,
    multi: true,
  },
  {
    key: "marks",
    label: "이런 점도 있어요",
    opts: ["주근깨", "보조개", "앞니 빠짐", "볼이 통통해요"],
    lock: true,
    multi: true,
  },
];

/* ─────────────────────────── 어른 줄(사장님 목록 그대로) ─────────────────────────── */

export type AdultRole = "mom" | "dad" | "grandma" | "grandpa";

/** 하나만 고르는 어른 항목 — 안경은 종류(glassesType)로 고른다. */
export type AdultLookSingleKey =
  | "hair"
  | "bangs"
  | "hairTexture"
  | "hairColor"
  | "face"
  | "eyes"
  | "brows"
  | "skin"
  | "build"
  | "height"
  | "glassesType"
  | "beard"
  | "outfit"
  | "bottom"
  | "color";
/** 여러 개 고르는 어른 항목 */
export type AdultLookMultiKey = "marks" | "accessories";

/** 어른 칩 한 줄. lock=true 는 '늘 그대로', false 는 '평소 옷'. */
export type AdultLookRow =
  | { key: AdultLookSingleKey; label: string; options: readonly string[]; lock: boolean; multi?: false }
  | { key: AdultLookMultiKey; label: string; options: readonly string[]; lock: boolean; multi: true };

/** 머리 모양 — 역할마다 다르다. */
export const ADULT_HAIR: Readonly<Record<AdultRole, readonly string[]>> = {
  mom: [
    "숏컷",
    "짧은 단발",
    "단발",
    "중단발",
    "긴 머리",
    "아주 긴 머리",
    "하나로 묶기",
    "반묶음",
    "올림머리",
    "땋은 머리",
    "굵은 웨이브 파마",
    "곱슬 파마",
  ],
  dad: ["반삭", "짧은 머리", "투블럭", "옆 가르마", "앞머리 내린 머리", "올백", "조금 긴 머리", "곱슬머리", "파마머리"],
  grandma: ["쪽진 머리", "짧은 파마머리", "올림머리", "단발", "짧은 머리"],
  grandpa: ["짧은 머리", "아주 짧은 머리", "살짝 벗어진 머리", "곱슬머리"],
};

export const ADULT_BANGS = ["일자로 있어요", "옆으로 넘겨요", "시스루", "없어요(가르마)"] as const;
export const ADULT_HAIR_TEXTURE = ["곧은 생머리", "살짝 웨이브", "굵은 웨이브", "곱슬", "파마"] as const;
/** 머리 색 — 엄마·아빠 */
export const PARENT_HAIR_COLOR = ["까만색", "짙은 갈색", "밝은 갈색", "붉은 갈색", "희끗희끗"] as const;
/** 머리 색 — 할머니·할아버지 */
export const ELDER_HAIR_COLOR = ["까만색", "희끗희끗", "회색", "흰머리"] as const;
export const ADULT_FACE = ["갸름해요", "동그래요", "계란형", "각진 편"] as const;
export const ADULT_EYES = ["크고 동그래요", "웃으면 반달", "또렷해요", "쌍꺼풀", "가늘고 긴 눈", "순한 눈매"] as const;
export const ADULT_BROWS = ["진한 눈썹", "옅은 눈썹", "일자 눈썹"] as const;
export const ADULT_SKIN = ["밝은 편", "보통", "조금 진한 편", "햇볕에 그을림"] as const;
export const ADULT_BUILD = ["마른 편", "보통", "통통한 편", "듬직한 편", "근육질"] as const;
/** 키 — 단체 사진 키 비율에 쓴다(lib/family.ts ADULT_HEIGHT_CM). 안 고르면 '보통'. */
export const ADULT_HEIGHT = ["작은 편", "보통", "큰 편", "아주 큰 편"] as const;
/** 안경 안 씀 */
export const GLASSES_NONE = "안 써요";
/** 예전 값(glasses:true, 종류 없음)을 보여 줄 때의 글자 — 칩 목록에는 없다. */
export const GLASSES_LEGACY = "안경 씀";
export const ADULT_GLASSES = [GLASSES_NONE, "동그란 안경", "네모 안경", "뿔테", "반무테"] as const;
/** 수염 — 아빠·할아버지만 */
export const ADULT_BEARD = ["없어요", "콧수염", "턱수염", "면도 자국", "구레나룻"] as const;
export const ADULT_MARKS = ["보조개", "주근깨", "점", "웃을 때 눈주름", "덧니"] as const;
export const ADULT_OUTFIT = ["티셔츠", "셔츠", "블라우스", "니트", "카디건", "맨투맨", "후드티", "원피스", "운동복", "정장"] as const;
export const ADULT_BOTTOM = ["청바지", "슬랙스", "치마", "반바지"] as const;
/** 옷 색 — 예전 10개(빨강~베이지)는 그대로 들어 있다. */
export const ADULT_COLORS = [
  "빨강",
  "노랑",
  "파랑",
  "초록",
  "분홍",
  "보라",
  "하양",
  "검정",
  "회색",
  "베이지",
  "네이비",
  "카키",
  "버건디",
] as const;
export const ADULT_ACCESSORIES = ["시계", "귀걸이", "목걸이", "반지", "모자", "머리띠", "스카프", "앞치마"] as const;

/** 수염 칸이 있는 역할 */
export function hasBeard(role: string): boolean {
  return role === "dad" || role === "grandpa";
}

/**
 * 어른 칩 줄 — '늘 그대로'(lock) 먼저, 그다음 '평소 옷'. 메모 한 줄(note)은 줄이 아니라 입력 칸이다.
 * 안경은 glassesType 줄로 고른다 — 고를 때 glassesPatch() 로 glasses 도 같이 맞춘다.
 */
export function adultLookRows(role: AdultRole): AdultLookRow[] {
  const elder = role === "grandma" || role === "grandpa";
  const rows: AdultLookRow[] = [
    { key: "hair", label: "머리 모양", options: ADULT_HAIR[role], lock: true },
    { key: "bangs", label: "앞머리", options: ADULT_BANGS, lock: true },
    { key: "hairTexture", label: "머리결", options: ADULT_HAIR_TEXTURE, lock: true },
    { key: "hairColor", label: "머리 색", options: elder ? ELDER_HAIR_COLOR : PARENT_HAIR_COLOR, lock: true },
    { key: "face", label: "얼굴형", options: ADULT_FACE, lock: true },
    { key: "eyes", label: "눈매", options: ADULT_EYES, lock: true },
    { key: "brows", label: "눈썹", options: ADULT_BROWS, lock: true },
    { key: "skin", label: "피부", options: ADULT_SKIN, lock: true },
    { key: "build", label: "체형", options: ADULT_BUILD, lock: true },
    { key: "height", label: "키", options: ADULT_HEIGHT, lock: true },
    { key: "glassesType", label: "안경", options: ADULT_GLASSES, lock: true },
  ];
  if (hasBeard(role)) rows.push({ key: "beard", label: "수염", options: ADULT_BEARD, lock: true });
  rows.push(
    { key: "marks", label: "이런 점도", options: ADULT_MARKS, lock: true, multi: true },
    { key: "outfit", label: "옷 종류", options: ADULT_OUTFIT, lock: false },
    { key: "bottom", label: "아래옷", options: ADULT_BOTTOM, lock: false },
    { key: "color", label: "옷 색", options: ADULT_COLORS, lock: false },
    { key: "accessories", label: "늘 하는 것", options: ADULT_ACCESSORIES, lock: false, multi: true },
  );
  return rows;
}

/* ─────────────────────────── 옛 값 옮기기 ─────────────────────────── */

/** 칩을 쓰는 사람 — FamilyRole 과 같은 글자(여기서 family.ts 를 부르지 않으려고 따로 적는다). */
export type LookWho = "child" | "mom" | "dad" | "grandma" | "grandpa" | "sibling" | "friend";

/**
 * 예전 칩 글자 → 새 글자(역할·칸마다). 불러올 때(normalize)와 '모습이 바뀌었어요' 견줄 때 쓴다.
 *  - 엄마 머리: 짧은 머리→숏컷, 묶은 머리→하나로 묶기, 파마머리→굵은 웨이브 파마
 *  - 아빠 머리: 아주 짧은 머리→반삭 (할아버지의 '아주 짧은 머리'는 그대로 있는 칩이다)
 *  - 할머니·할아버지 평소 옷: 스웨터→니트 (예전 목록의 스웨터가 새 목록에선 니트)
 *  - 형제·친구 체형: 예전 어른식 글자 → 아이 칩 글자(마른 편→마른 편이에요 …)
 */
export const LEGACY_LOOK_VALUES: Readonly<Partial<Record<LookWho, Readonly<Record<string, Readonly<Record<string, string>>>>>>> = {
  mom: { hair: { "짧은 머리": "숏컷", "묶은 머리": "하나로 묶기", 파마머리: "굵은 웨이브 파마" } },
  dad: { hair: { "아주 짧은 머리": "반삭" } },
  grandma: { outfit: { 스웨터: "니트" } },
  grandpa: { outfit: { 스웨터: "니트" } },
  sibling: { build: { "마른 편": "마른 편이에요", 보통: "보통이에요", "통통한 편": "통통해요" } },
  friend: { build: { "마른 편": "마른 편이에요", 보통: "보통이에요", "통통한 편": "통통해요" } },
};

/** 예전 글자면 새 글자로, 아니면 그대로. */
export function migrateLookValue(who: LookWho, key: string, value: string): string {
  return LEGACY_LOOK_VALUES[who]?.[key]?.[value] ?? value;
}

/* ─────────────────────────── 안경 ─────────────────────────── */

/** 안경 종류 칩 가운데 '쓴다'인 것인가(안 써요·빈 값은 아니다) */
export function wearsGlassesType(type: string | undefined): boolean {
  return typeof type === "string" && type.trim() !== "" && type !== GLASSES_NONE;
}

/**
 * 지금 켜 둘 안경 칩 글자 — 종류가 있으면 그 종류, 예전 값(glasses:true 만)이면 '안경 씀',
 * 아무것도 없으면 undefined.
 */
export function glassesChoice(l: Pick<ParentLooks, "glasses" | "glassesType"> | undefined): string | undefined {
  if (l?.glassesType) return l.glassesType;
  return l?.glasses ? GLASSES_LEGACY : undefined;
}

/** 안경 칩을 골랐을 때 넘길 값 — glasses(예전 호환)와 glassesType 을 함께 맞춘다. undefined 는 풀기. */
export function glassesPatch(choice: string | undefined): Pick<ParentLooks, "glasses" | "glassesType"> {
  if (!choice) return { glasses: undefined, glassesType: undefined };
  if (choice === GLASSES_LEGACY) return { glasses: true, glassesType: undefined };
  return { glasses: wearsGlassesType(choice) ? true : undefined, glassesType: choice };
}

/* ─────────────────────────── 칩 앞 스티커 ─────────────────────────── */

export const GLASSES_ICON = "/icons/feature-glasses.webp";

/** /icons/looks/<이름>.webp */
export function lookIconPath(name: string): string {
  return `/icons/looks/${name}.webp`;
}

/**
 * 파일이 실제로 올라온 스티커 이름(확장자 없이).
 * 파일을 public/icons/looks/ 에 넣고 여기 이름만 더하면 그 칩부터 새 스티커가 붙는다.
 * 2026-09-28: 남자아이 머리결 4장(GPT gpt-image-1, 투명 배경)을 넣었다.
 *  - 아이 성별판: hair-straight-boy · hair-wavy-boy · hair-curly-boy · hair-perm-boy
 *               mark-freckles-girl · mark-dimples-girl · mark-tooth-girl · mark-cheeks-girl
 *  - 어른: mom-hair-short/bob/shoulder/long/tied/updo/perm, dad-hair-buzz/short/sidepart/longish/curly,
 *          grandma-hair-bun/shortperm, grandpa-hair-thin, glasses-round/square/horn, beard-mustache/chin,
 *          outfit-tshirt/shirt/knit/cardigan/dress/hoodie, acc-watch/earrings/necklace
 */
export const READY_ICONS: ReadonlySet<string> = new Set<string>([
  "hair-straight-boy",
  "hair-wavy-boy",
  "hair-curly-boy",
  "hair-perm-boy",
]);

/** 아이 칩 스티커 이름(기본판) */
const KID_ICON_NAMES: Readonly<Record<string, string>> = {
  "곧은 생머리": "hair-straight",
  "살짝 웨이브": "hair-wavy",
  곱슬머리: "hair-curly",
  파마머리: "hair-perm",
  곰인형: "item-teddy",
  모자: "item-hat",
  머리핀: "item-hairpin",
  가방: "item-bag",
  "장난감 자동차": "item-car",
  담요: "item-blanket",
  주근깨: "mark-freckles",
  보조개: "mark-dimples",
  "앞니 빠짐": "mark-tooth",
  "볼이 통통해요": "mark-cheeks",
};

/** 아이 칩 앞 기본 스티커(성별판을 고르지 않은 그림) — 화면은 lookIcon 을 쓴다. */
export const LOOK_ICONS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(KID_ICON_NAMES).map(([o, name]) => [o, lookIconPath(name)]),
);

/** 남자아이면 짧은 머리판(-boy)을 쓰는 칩 */
const BOY_VARIANT = new Set(["곧은 생머리", "살짝 웨이브", "곱슬머리", "파마머리"]);
/** 여자아이면 여자아이 얼굴판(-girl)을 쓰는 칩 */
const GIRL_VARIANT = new Set(["주근깨", "보조개", "앞니 빠짐", "볼이 통통해요"]);

/** 어른 머리 모양 스티커(역할마다) */
const ADULT_HAIR_ICON_NAMES: Readonly<Record<AdultRole, Readonly<Record<string, string>>>> = {
  mom: {
    숏컷: "mom-hair-short",
    단발: "mom-hair-bob",
    중단발: "mom-hair-shoulder",
    "긴 머리": "mom-hair-long",
    "하나로 묶기": "mom-hair-tied",
    올림머리: "mom-hair-updo",
    "굵은 웨이브 파마": "mom-hair-perm",
  },
  dad: {
    반삭: "dad-hair-buzz",
    "짧은 머리": "dad-hair-short",
    "옆 가르마": "dad-hair-sidepart",
    "조금 긴 머리": "dad-hair-longish",
    곱슬머리: "dad-hair-curly",
  },
  grandma: { "쪽진 머리": "grandma-hair-bun", "짧은 파마머리": "grandma-hair-shortperm" },
  grandpa: { "살짝 벗어진 머리": "grandpa-hair-thin" },
};

/** 어른 공통 스티커(안경·수염·옷·늘 하는 것) */
const ADULT_ICON_NAMES: Readonly<Record<string, string>> = {
  "동그란 안경": "glasses-round",
  "네모 안경": "glasses-square",
  뿔테: "glasses-horn",
  콧수염: "beard-mustache",
  턱수염: "beard-chin",
  티셔츠: "outfit-tshirt",
  셔츠: "outfit-shirt",
  니트: "outfit-knit",
  카디건: "outfit-cardigan",
  원피스: "outfit-dress",
  후드티: "outfit-hoodie",
  시계: "acc-watch",
  귀걸이: "acc-earrings",
  목걸이: "acc-necklace",
};

function isAdult(who: LookWho): who is AdultRole {
  return who === "mom" || who === "dad" || who === "grandma" || who === "grandpa";
}

/**
 * 칩 앞 스티커 주소. 없으면 undefined(글자만).
 *
 *  - 아이·형제·친구(who 기본값 'child'): 설정과 같은 아이 스티커. 머리결 4종은 남자아이면 '-boy' 판,
 *    얼굴 표시 4종은 여자아이면 '-girl' 판 — **READY_ICONS 에 있을 때만**, 없으면 지금 스티커.
 *  - 어른(mom·dad·grandma·grandpa): 어른 스티커가 READY_ICONS 에 있을 때만. 안경 종류는 준비 전엔
 *    지금의 안경 스티커로 물러선다. 아이 스티커(곱슬머리·모자·보조개 …)는 어른 칩에 붙이지 않는다.
 *    ※ 어른 칩에는 who 를 꼭 넘긴다 — 아빠 '곱슬머리'와 아이 '곱슬머리'는 다른 칩이다.
 */
export function lookIcon(option: string, gender?: Gender, who: LookWho = "child"): string | undefined {
  if (isAdult(who)) {
    const name = ADULT_HAIR_ICON_NAMES[who][option] ?? ADULT_ICON_NAMES[option];
    if (name && READY_ICONS.has(name)) return lookIconPath(name);
    const glassesChip = (ADULT_GLASSES as readonly string[]).includes(option) && wearsGlassesType(option);
    if (option === GLASSES_LEGACY || glassesChip) return GLASSES_ICON;
    return undefined;
  }
  if (option === GLASSES_LEGACY) return GLASSES_ICON;
  const base = KID_ICON_NAMES[option];
  if (!base) return undefined;
  if (gender === "boy" && BOY_VARIANT.has(option) && READY_ICONS.has(`${base}-boy`)) return lookIconPath(`${base}-boy`);
  if (gender === "girl" && GIRL_VARIANT.has(option) && READY_ICONS.has(`${base}-girl`)) return lookIconPath(`${base}-girl`);
  return lookIconPath(base);
}

/* ─────────────────────────── 색 칩 동그라미 ─────────────────────────── */

/** 옷 색·머리 색 칩 앞 동그라미(CSS background) — 글자만으로는 '카키·버건디'가 어떤 색인지 헷갈린다. */
const COLOR_SWATCH: Readonly<Record<string, string>> = {
  빨강: "#e5484d",
  노랑: "#f5c518",
  파랑: "#3b82f6",
  초록: "#34a853",
  분홍: "#f9a8d4",
  보라: "#a78bfa",
  하양: "#ffffff",
  검정: "#262626",
  회색: "#a3a3a3",
  베이지: "#e8d5b5",
  네이비: "#1e3a8a",
  카키: "#7c7a4a",
  버건디: "#7f1d3a",
  // 예전 형제 옷 색(지금 칩 목록엔 없다 — 켜진 채 남은 값을 보여 줄 때)
  갈색: "#8b5a2b",
  까만색: "#1f1b18",
  "짙은 갈색": "#4a2e1f",
  "밝은 갈색": "#a8703f",
  "붉은 갈색": "#8e3b25",
  희끗희끗: "linear-gradient(135deg,#3a3a3a 50%,#d6d3d1 50%)",
  흰머리: "#f5f5f4",
};

/** 피부 칩 앞 동그라미 — 어른(보통·햇볕에 그을림)과 아이(보통이에요·햇볕에 그을렸어요) 글자 모두 */
const SKIN_SWATCH: Readonly<Record<string, string>> = {
  "밝은 편": "#f8dcc4",
  보통: "#eac09a",
  보통이에요: "#eac09a",
  "조금 진한 편": "#c98e62",
  "햇볕에 그을림": "#a86b43",
  "햇볕에 그을렸어요": "#a86b43",
};

/** 칩 앞 색 동그라미 — 옷 색(color)·머리 색(hairColor)·피부(skin) 줄만. 설정·가족 화면이 같이 쓴다. */
export function lookSwatch(key: string, option: string): string | undefined {
  if (key === "color" || key === "hairColor") return COLOR_SWATCH[option];
  if (key === "skin") return SKIN_SWATCH[option];
  return undefined;
}

/* ─────────────────────────── 길이·개수 ─────────────────────────── */

/**
 * 메모 한 줄 최대 길이 — 아이 100자(설정 '더 알려주고 싶은 점'), 엄마·아빠 40자, 그 밖 60자.
 * 저장값 정규화(prefs normalizeLooks·normalizeParents, family normalizeLooksFor)와 설정·가족 화면의
 * 입력 칸이 이 값을 같이 쓴다 — 한쪽만 길면 다시 불러올 때 말없이 잘린다.
 */
export function lookNoteMax(who: LookWho): number {
  if (who === "child") return 100;
  if (who === "mom" || who === "dad") return 40;
  return 60;
}

/** 아이 여러 개 고르기(늘 지니는 것·이런 점도) 최대 개수 — 저장(prefs normalizeLooks)이 이만큼만 남긴다. */
export const CHILD_MULTI_MAX = 5;
