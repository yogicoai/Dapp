/**
 * 쪽 그림(api/illustrate-page)에 붙이는 참고 그림의 순서와, 그 순서를 말하는 프롬프트 줄 — 라우트에서 떼어 낸 순수 함수.
 * node --test 로 시험한다(page-refs.test.ts). 상대 경로 + 확장자: node --test 가 "@/" 별칭을 모른다.
 *
 * 왜 있나(2026-09-29 사장님 "얼굴이 달라 특히"): 고정한 가족 얼굴이 두 번 다시 그려졌다 —
 * 가족 그림 → AI 인물 시트 → AI 쪽 그림. 복사본을 또 복사하듯 한 번 거칠 때마다 얼굴이 조금씩 흘렀다.
 * 이제 시트는 가족 그림 원본 픽셀로 짜고(lib/sheet-compose), 쪽마다 그 쪽에 나오는 고정 가족의 **원본 그림**도 함께 붙인다.
 * 붙이는 순서와 프롬프트의 '몇 번째'가 어긋나면 얼굴이 뒤바뀐다 — 그래서 둘을 이 파일 한 곳에서 만든다.
 *
 * **고정 얼굴이 없으면(옛 책·가족 없는 책) 순서도 글도 예전과 한 글자도 다르지 않다** — 시험이 못 박는다.
 */
import { maxPortraitRefs, pickSheetPortraits, type SheetCharacter, type SheetPortrait } from "./sheet-prompt.ts";

/** 붙이는 그림 '몇 번째' — 시트 1 + 얼굴 최대 6 + 장소 1 + 승인 쪽 1 = 9, 넉넉히 열까지. */
export const REF_ORDINALS = [
  "FIRST",
  "SECOND",
  "THIRD",
  "FOURTH",
  "FIFTH",
  "SIXTH",
  "SEVENTH",
  "EIGHTH",
  "NINTH",
  "TENTH",
] as const;

/** i 번째(0부터) 그림의 영어 서수. 모르면 'attached'(예전 nth 와 같다). */
export function ordinalWord(i: number): string {
  return REF_ORDINALS[i] ?? "attached";
}

/** 순서 목록(arrangePageReferences 의 order)에서 key 의 서수 */
export function refOrdinal(order: readonly string[], key: string): string {
  return ordinalWord(order.indexOf(key));
}

/** 고정 얼굴 key — 순서 목록에서 사람마다 하나 */
export function portraitKey(name: string): string {
  return `portrait:${name}`;
}

/**
 * 붙이는 순서: 인물 시트 → 고정 얼굴(등장인물 순) → 장소 시트 → 승인 쪽.
 * 얼굴을 앞에 둔다 — 그림 모델은 앞쪽 그림을 더 세게 따른다. 고정 얼굴이 없으면 예전 순서(시트 → 장소 → 승인 쪽) 그대로.
 * order 는 프롬프트용 key 목록, images 는 generateImage 에 넘길 그림 — 둘은 늘 같은 순서다.
 */
export function arrangePageReferences<T>(input: {
  sheet: T | null;
  portraits: readonly { name: string; image: T }[];
  location: T | null;
  style: T | null;
}): { order: string[]; images: T[] } {
  const order: string[] = [];
  const images: T[] = [];
  const add = (key: string, image: T | null) => {
    if (!image) return;
    order.push(key);
    images.push(image);
  };
  add("sheet", input.sheet);
  for (const p of input.portraits) add(portraitKey(p.name), p.image);
  add("location", input.location);
  add("style", input.style);
  return { order, images };
}

/**
 * 한 쪽에 붙일 고정 얼굴 최대 수.
 * gemini-2.x 그림 모델은 참고 그림 3장 이하에서 가장 잘 따른다 — 시트·장소·승인 쪽이 이미 있으니 얼굴은 1장만.
 * 3.x 그림 모델·OpenAI 는 참고 그림 10장 넘게 받는다 — 만들기 화면이 붙이는 최대(CAST_PORTRAITS_MAX 6)까지.
 * 예전 4장 상한에선 온 가족 6명이 모인 쪽의 뒤 둘이 얼굴 없이 그려졌다(2026-10-01). 구글 안내로는 3.1 Flash Image 가
 * 사람 참고 그림을 4장 안팎까지 가장 잘 따른다 — 그래서 이야기 쪽에서 한 그림에 서는 사람을 서너 명으로 줄이게 하고
 * (lib/anthropic STORY_SYSTEM), 다섯 장 넘게 붙는 쪽은 온 가족이 모이는 한두 쪽에서만 나온다.
 */
export function maxPagePortraits(env: Parameters<typeof maxPortraitRefs>[0]): number {
  return maxPortraitRefs(env) >= 4 ? 6 : 1;
}

/** 요청에서 읽을 최대 줄 수 — pickSheetPortraits 의 상한(12)과 같게, 여기선 쪽에 없는 사람을 걸러 낸 뒤 자른다. */
const PAGE_PORTRAIT_INPUT_MAX = 12;

/**
 * 이 쪽에 붙일 고정 얼굴 — 요청의 portraits 칸 [{ name, ref, memberId }] 에서.
 *  · 주소 규칙은 시트와 같다(pickSheetPortraits → lib/family-ref acceptFamilyRef): 이 회원 폴더의 참고용 JPEG 만,
 *    등장인물에 있는 이름만, 사람 id 가 파일 이름과 같을 때만. 마스터가 남의 책을 다시 그리면 폴더가 달라 붙지 않는다.
 *  · 이 쪽에 **보이는** 고정 인물(fixedOnPage)만 — 없는 사람의 얼굴을 붙이면 없던 사람이 그려진다.
 *  · 수채화 책만 — 가족 그림은 늘 수채화다(api/family/portrait). 지브리·벡터 책에 붙이면 그 쪽만 수채화로 끌려간다.
 *  · 등장인물 순(주인공 먼저)으로 max 장까지.
 */
export function pickPagePortraits(
  raw: unknown,
  cast: readonly SheetCharacter[],
  fixedOnPage: readonly string[],
  prefix: string | null,
  opts: { max: number; watercolor: boolean },
): { portraits: SheetPortrait[]; rejected: number; offPage: number } {
  if (!opts.watercolor || fixedOnPage.length === 0 || !Array.isArray(raw) || raw.length === 0) {
    return { portraits: [], rejected: 0, offPage: 0 };
  }
  const picked = pickSheetPortraits(raw, cast, prefix, PAGE_PORTRAIT_INPUT_MAX);
  const onPage = new Set(fixedOnPage);
  const here = picked.portraits.filter((p) => onPage.has(p.name));
  return {
    portraits: here.slice(0, Math.max(0, opts.max)),
    rejected: picked.rejected,
    offPage: picked.portraits.length - here.length,
  };
}

/**
 * 인물 시트에 선 순서(왼쪽 → 오른쪽) — 요청의 sheetOrder 칸. 등장인물 이름만, 한 번씩, 6명까지. 쓸 게 없으면 null.
 * 원본 픽셀로 짠 시트는 고정 가족이 먼저 서고 AI 가 그린 사람이 뒤에 설 수 있어 이야기 순서와 다를 수 있다.
 */
export function readSheetOrder(raw: unknown, cast: readonly { name: string }[]): string[] | null {
  if (!Array.isArray(raw)) return null;
  const names = new Set(cast.map((c) => c.name));
  const out: string[] = [];
  for (const v of raw.slice(0, 12)) {
    const name = typeof v === "string" ? v.trim() : "";
    if (name && names.has(name) && !out.includes(name)) out.push(name);
  }
  return out.length ? out.slice(0, 6) : null;
}

/**
 * 이 책의 옷을 옷 카드로 입은 고정 가족 — 요청의 sheetOutfits 칸(api/character-sheet 가 옷 카드를 시트에 세운 사람).
 * 등장인물에 있고, 고정 가족이고, 이 책의 옷 글(outfit)이 있는 이름만, 한 번씩, 6명까지. 옛 책·오늘 만든 책은 칸이 없어 빈다.
 */
export function readSheetOutfits(
  raw: unknown,
  cast: readonly { name: string; fixed?: boolean; outfit?: string }[],
): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw.slice(0, 12)) {
    const name = typeof v === "string" ? v.trim() : "";
    const c = name ? cast.find((x) => x.name === name) : undefined;
    if (c && c.fixed && c.outfit?.trim() && !out.includes(name)) out.push(name);
  }
  return out.slice(0, 6);
}

/**
 * 시트 순서 한 줄 — 누가 어느 칸인지. 이름과 그림을 묶는 유일한 끈이 설명 글뿐이던 구멍을 막는다.
 * notToScale — AI 가 따로 그려 옆에 붙인 사람들(섞인 시트의 덩어리). 그 그림은 내용 높이 전체로 붙어서
 * 다섯 살 친구가 엄마만큼 크게 선다(검토 2026-09-29) — 키는 시트가 아니라 나이대로 그리라고 못박는다.
 * 비어 있으면(모두 고정) 글은 예전 그대로다.
 * dressed — 옷 카드로 이 책의 옷을 입은 고정 가족(readSheetOutfits). 그 칸 위는 사람 없는 옷뿐이라, 그 옷을 입히고
 * 장면에 따로 놓인 물건으로 그리지 말라고 한다. 비어 있으면 글은 예전 그대로다.
 * 얼굴은 얼굴 칸에서만 — 옷 카드에 AI 가 사람·얼굴을 몰래 그려 넣어도(검사로 다 못 거른다) 그 얼굴을 따라가지 않게(검토 2026-09-29).
 * scaleLocked — 이 쪽에 크기 잠금(lib/scale-lock)이 걸렸다. '나이에 맞는 자연스러운 키'는 거인을 큰 형으로 줄여 버리므로
 * (2026-10-12 거인국 책 5쪽) 그 말 대신 '크기는 SCALE LOCK 이 정한다'로 바꾼다. 안 주면 글은 예전 그대로다.
 */
export function sheetOrderLine(
  order: readonly string[],
  notToScale: readonly string[] = [],
  dressed: readonly string[] = [],
  scaleLocked = false,
): string {
  const scale = notToScale.length
    ? ` ${notToScale.join(", ")} ${notToScale.length > 1 ? "were" : "was"} painted separately at a different scale — heights on this sheet are NOT to scale between people. ${
        scaleLocked ? "How big each person is on this page is decided by the SCALE LOCK above, never by this sheet." : "Draw every person at the natural height for their age."
      }`
    : "";
  const worn = dressed.filter((n) => order.includes(n));
  const everyone = order.every((n) => worn.includes(n));
  const columns = worn.length
    ? `Each column is one person. For ${worn.join(", ")} the top of the column shows ONLY the clothes they wear in this book (laid out, with no person in them) and the close-up below is their face; dress them in exactly those clothes, and never draw those laid-out clothes as loose objects in the scene. Their faces come ONLY from those close-ups, never from anything in the clothes area.${everyone ? "" : " For everyone else the full figure is on top and the same person's close-up below."}`
    : "Each column is one person — the full figure on top and the same person's close-up below.";
  return `The reference sheet shows these people from left to right: ${order
    .map((name, i) => `${i + 1}. ${name}`)
    .join(", ")}. ${columns}${scale}`;
}

/**
 * 이 쪽에 보이는 고정 가족 줄(CAST LOCK 안) — 얼굴·머리·옷을 어디서 따오는지.
 *  · 원본 그림이 붙은 사람과 안 붙은 사람을 가른다 — 2.x 모델은 한 쪽에 1장뿐이라, 붙지도 않은 엄마에게
 *    "붙은 원본을 따르라"고 하면 하온의 그림을 엄마에게도 묶는다(검토 2026-09-29).
 *  · composed(원본 픽셀로 짠 시트): 시트의 옷 = 가족 그림의 옷이고, 클로드가 적은 설명 글의 옷과 다를 수 있다.
 *    그 옷 낱말을 버리라고 분명히 한다 — 안 그러면 어떤 쪽은 노란 원피스, 어떤 쪽은 남색 카디건이 된다.
 * 원본도 없고 짠 시트도 아니면(옛 책) 예전 한 줄 그대로 — 시험이 못 박는다.
 *  · outfits(이름 → 이 책의 옷 글): 옷 카드로 이 책의 옷을 입은 사람(2026-09-29 저녁~). 가족 그림·얼굴 칸 아래 끝의 옷이 아니라
 *    시트 칸 위의 옷(사람 없는 옷)을 입으라고, 그 옷 글을 함께 준다. 비어 있으면 글은 예전 그대로다.
 */
export function fixedFamilyFaceLines(
  fixedOnPage: readonly string[],
  portraitNames: ReadonlySet<string>,
  composed: boolean,
  outfits: ReadonlyMap<string, string> = new Map(),
): string[] {
  if (fixedOnPage.length === 0) return [];
  const outfit = composed
    ? "Their outfit is exactly the one shown on the reference sheet — ignore any clothing named in their description above; change it only where this page's scene text itself dresses them differently (pajamas, coat, swimsuit)."
    : "Their outfit stays exactly as on the sheet, like everyone else's — change it only where this page's scene text itself dresses them differently.";
  /** 한 묶음(원본 붙음·시트만)의 옷 문장 — 옷 카드로 입은 사람과 아닌 사람을 가른다. */
  const outfitFor = (names: readonly string[]) => {
    const worn = names.filter((n) => outfits.get(n)?.trim());
    if (worn.length === 0) return outfit;
    const rest = names.filter((n) => !worn.includes(n));
    const list = worn.map((n) => `${n} — ${outfits.get(n)!.trim()}`).join("; ");
    const dressedLine = `THIS BOOK'S OUTFIT — ${worn.join(", ")} do NOT wear the clothes shown in their portrait or at the bottom edge of their close-up. Each wears the clothes-only outfit drawn at the top of their own column on the reference sheet: ${list}. Copy those garments, colours and shoes exactly; change them only where this page's scene text itself dresses them differently (pajamas, coat, swimsuit).`;
    return rest.length ? `${dressedLine} For ${rest.join(", ")}: ${outfit}` : dressedLine;
  };
  const withPortrait = fixedOnPage.filter((n) => portraitNames.has(n));
  const sheetOnly = fixedOnPage.filter((n) => !portraitNames.has(n));
  const lines: string[] = [];
  if (withPortrait.length) {
    lines.push(
      `FIXED FAMILY FACES: ${withPortrait.join(", ")} — face, hairstyle, hair length, hair colour and texture, glasses and body come ONLY from their attached original portrait (FIXED FACE PORTRAITS above) and the reference sheet; if their description above words it differently, follow the portrait. ${outfitFor(withPortrait)}`,
    );
  }
  if (sheetOnly.length) {
    /*
     * 옷 카드로 입은 사람은 시트에 전신이 없다 — 칸 위는 옷뿐이고 얼굴 칸은 어깨에서 잘린다. 원본도 안 붙은 쪽(2.x 1장 상한·
     * 마스터 다시 그리기)에서 "머리 길이·몸은 시트에서만"이라 하면 가슴까지 오는 엄마 머리가 어깨에서 끊긴 그대로 그려질 수 있다
     * (검토 2026-09-29). 얼굴 칸 아래 끝에 닿은 머리는 더 내려간다고, 몸은 나이·역할대로라고 일러 준다.
     */
    const cropped = sheetOnly.filter((n) => outfits.get(n)?.trim());
    const cropNote = cropped.length
      ? ` On the sheet ${cropped.join(", ")} ${cropped.length > 1 ? "have" : "has"} no full figure and the close-up is cropped at the shoulders: hair that reaches the bottom edge of the close-up keeps going below it (long hair) — never shorten it; body build follows their age and role.`
      : "";
    lines.push(
      `FIXED FAMILY FACES${withPortrait.length ? " (no portrait attached for them on this page)" : ""}: ${sheetOnly.join(", ")} — face, hairstyle, hair length, hair colour and texture, glasses and body come ONLY from the reference sheet; if their description above words it differently, follow the sheet.${cropNote} ${outfitFor(sheetOnly)}`,
    );
  }
  return lines;
}

/**
 * 검수(validateIllustration)에 넘기는 고정 가족의 설명 꼬리표 — 설명 글이 아니라 무엇과 견줄지.
 *  · 원본이 붙은 사람: 얼굴·머리는 원본, 옷은 시트.
 *  · 원본 픽셀로 짠 시트인데 원본이 안 붙은 사람(2.x 1장 상한·받기 실패): 얼굴·머리·옷 모두 시트 — 시트의 옷이
 *    가족 그림의 옷이라 설명 글의 옷으로 견주면 맞게 그린 쪽을 떨어뜨린다(검토 2026-09-29).
 *  · 그 밖(옛 책): 예전 꼬리표 그대로.
 *  · dressed(옷 카드로 이 책의 옷을 입음): 옷은 칸 위의 사람 없는 옷과 — 가족 그림·얼굴 칸 아래 끝의 옷과 견주면
 *    맞게 입힌 쪽을 떨어뜨린다. 원본이 안 붙었으면 얼굴·머리는 시트의 얼굴 칸과.
 */
export function fixedCheckDescription(
  description: string,
  withPortrait: boolean,
  composed: boolean,
  dressed = false,
): string {
  const note = dressed
    ? withPortrait
      ? "judge face and hair against their attached original portrait, and the outfit against the clothes-only outfit at the top of their column on the reference sheet — never against the portrait's clothes"
      : "judge face and hair against their close-up on the reference sheet (cropped at the shoulders — hair that reaches its bottom edge is long: FAIL if drawn clearly shorter), and the outfit against the clothes-only outfit at the top of their column — never against the clothes at the bottom edge of the close-up"
    : withPortrait
      ? "judge face and hair against their attached original portrait and outfit against the reference sheet, not this text"
      : composed
        ? "judge face, hair and outfit against the reference sheet, not this text"
        : "judge face and hair against the reference sheet, not this text";
  return `${description} (fixed family face — ${note})`.trim();
}

/**
 * 고정 얼굴 원본을 붙였을 때의 묶음 줄 — 몇 번째 그림이 누구의 얼굴인지, 무엇을 따르고 무엇을 버리는지.
 * 옷은 원본 그림이 아니라 시트(와 이 쪽 장면 글)에서 — 예전 책의 시트는 옷이 원본과 다를 수 있다. 얼굴·머리는 원본이 이긴다.
 * cards — 원본을 얼굴 카드(lib/sheet-compose composePortraitCard: 왼쪽 전신 + 오른쪽 키운 얼굴)로 붙인 사람. 한 장에 같은 사람이
 * 두 번 보이니 '한 사람'이라고 못 박는다(두 사람으로 읽으면 쌍둥이가 그려진다). 비어 있으면 글은 예전 그대로다.
 */
export function portraitBindingLines(
  order: readonly string[],
  names: readonly string[],
  cards: ReadonlySet<string> = new Set(),
): string[] {
  if (names.length === 0) return [];
  const anyCard = names.some((n) => cards.has(n));
  return [
    "FIXED FACE PORTRAITS — the ORIGINAL approved portraits of the fixed family members on this page are attached:",
    ...names.map(
      (name) =>
        `- The ${refOrdinal(order, portraitKey(name))} attached image is "${name}" — ${name}'s exact face and hair.${
          cards.has(name)
            ? ` It shows ONE person, ${name}, twice: the whole figure on the left and the same face enlarged on the right — read the face from the enlarged close-up.`
            : ""
        } Copy exactly: face shape, eyes, eyebrows, nose, mouth, skin tone, hairstyle, hair length, fringe or parting, hair colour and texture, glasses (only if the portrait shows glasses), beard, build and apparent age. The reference sheet shows the same person.`,
    ),
    `Each portrait is one of the people in CAST LOCK below — never an additional person and never a second copy of anyone. Ignore each portrait's white background, standing pose and framing${
      anyCard ? " (and the side-by-side layout of a two-panel portrait)" : ""
    }: draw the person inside this scene, in this scene's action and camera angle.`,
    // 승인 쪽도 얼굴을 옮겨 올 수 있다(그림체 기준 줄이 'facial construction'을 따르라 한다) — 검수를 지난 쪽에도
    // 작은 흐름이 남아 있으면 쪽에서 쪽으로 번진다. 얼굴·머리는 원본이 늘 이긴다(검토 2026-09-29).
    "Clothing comes from the reference sheet (and this page's scene text), not from the portrait. Face and hair come from the portrait: if the reference sheet, an approved page or any description disagrees with a portrait about face or hair, the PORTRAIT wins — take only the rendering style from an approved page, never a face.",
  ];
}

/**
 * 붙이는 그림마다 바로 앞에 끼우는 이름표(lib/gemini generateImage referenceLabels) — order 와 같은 길이·같은 순서.
 * 2026-10-01 사장님 "아바타와 너무 달라": 이름과 그림을 묶는 끈이 프롬프트 끝쪽의 '몇 번째' 한 줄뿐이라, 사람이 여럿이면
 * 얼굴이 남의 이름에 붙었다. 그림 바로 앞에 "이 그림은 누구"를 한 번 더 둔다. 고정 얼굴을 붙인 쪽에서만 쓴다(부르는 쪽이 정한다).
 * cards — 얼굴 카드로 붙인 사람(portraitBindingLines 와 같다).
 */
export function pageReferenceLabels(order: readonly string[], cards: ReadonlySet<string> = new Set()): string[] {
  return order.map((key, i) => {
    const head = `[${ordinalWord(i)} attached image]`;
    if (key === "sheet") return `${head} The CHARACTER REFERENCE SHEET — every person in this book, one column each.`;
    if (key === "location") return `${head} The LOCATION REFERENCE SHEET — this page's place, with no people.`;
    if (key === "style") return `${head} A previously APPROVED page of this book — use it for the rendering style only, never for a face.`;
    if (key.startsWith("portrait:")) {
      const name = key.slice("portrait:".length);
      return cards.has(name)
        ? `${head} ${name} — ONLY ${name}: the original approved portrait of ${name}, whole figure on the left and the same face enlarged on the right (one person). Copy ${name}'s face and hair from it.`
        : `${head} ${name} — ONLY ${name}: the original approved portrait of ${name}. Copy ${name}'s face and hair from it.`;
    }
    return head;
  });
}

/**
 * 고정 가족이 나오는 쪽의 구도 — 얼굴을 크게.
 *  · 넷 이상(2026-10-01 ⑤): 전신이 작게 그려져 얼굴이 손톱만 해지고, 원본과 견줄 수도 없었다(검수가 "너무 작으면 판단하지 말라"로 넘긴다).
 *    허리 위로 가까이 모인 장면으로.
 *  · 셋 이하(2026-10-01 같은 날 사장님 "머리 스타일은 가져오는데 이목구비가 약하다"): 시험 책의 얼굴이 그림 세로의 50~80px 이라
 *    그림 모델이 점 눈·짧은 입선밖에 못 그렸다. 머리처럼 큰 모양은 따라오고 작은 이목구비는 평균 얼굴로 뭉개진다.
 *    허리 위 구도를 기본으로, 전신은 다리를 꼭 보여야 하는 동작일 때만.
 * 고정 가족이 없으면 빈 목록 — 글은 예전 그대로다.
 */
export function familyFramingLines(people: number, fixedOnPage: number): string[] {
  if (fixedOnPage <= 0 || people <= 0) return [];
  if (people >= 4) {
    return [
      `GROUP FRAMING — ${people} people are on this page. Frame them as a close, warm group: a medium shot from about the hips up, everyone gathered close together across the width of the picture, faces in the upper half of the picture, every face large and clearly readable (front or three-quarter view). Never a wide shot with small full-body figures in a big landscape.`,
      "Keep the lower part of the picture simple (a table top, laps, the floor or a blanket) so text can sit there.",
    ];
  }
  return [
    `FAMILY CLOSE FRAMING — the family member${people > 1 ? "s" : ""} on this page must be recognisable by their face. Use a medium shot from about the waist up as the default, with the camera close so each face is large and clearly readable (front or three-quarter view); faces sit in the upper half of the picture.`,
    "Show a whole body only when the action truly needs the legs (running, jumping, crouching, climbing), and even then keep the camera close rather than drawing small figures in a wide landscape. Keep enough of the place visible behind them to recognise it.",
  ];
}

/**
 * 검수 줄 — 가족 쪽을 일부러 가깝게 찍었을 때(familyFramingLines 가 줄을 냈을 때만). 다리가 잘리거나 장소의 넓은 모습이 덜 보인다고
 * 떨어뜨리면 다시 그리기 예산(권당 2장)을 헛되이 쓴다. 보이는 만큼으로 장소를 판단하게 한다. 구도 줄이 없으면 빈 목록.
 */
export function familyFramingCheckLines(framing: readonly string[]): string[] {
  if (framing.length === 0) return [];
  return [
    "This page is deliberately framed close (from about the waist up) so that faces are large. Judge the place from what is visible behind the people — a partly visible landmark, ground, wall or colours is fine as long as nothing contradicts the expected place. Do not fail because legs or feet are cropped or because a wide view of the place is missing.",
  ];
}

/**
 * 이목구비 줄(2026-10-01 사장님 "이목구비가 약하다") — 고정 가족 원본을 붙인 쪽에서만. 얼굴 카드(키운 얼굴)의 눈·눈썹·코·입을
 * 그 모양 그대로, 카드보다 단순하게 그리지 말라고 한다. "점 눈으로 바꾸지 말라"만 말하면 원래 단순한 아바타 얼굴에 없던 쌍꺼풀을
 * 더할 수 있어서, 기준을 "카드와 같은 모양·같은 정도의 그림"으로 둔다. 원본을 안 붙인 쪽은 빈 목록 — 글은 예전 그대로다.
 */
export function facialFeatureLines(names: readonly string[], cards: ReadonlySet<string> = new Set()): string[] {
  if (names.length === 0) return [];
  const from = names.some((n) => cards.has(n)) ? "the enlarged face close-up in their attached portrait" : "their attached portrait";
  return [
    `FACIAL FEATURES — for ${names.join(", ")}, copy the features from ${from}: eye shape and size (single or double eyelid, round or narrow, how far apart), eyebrow shape and thickness, nose shape, mouth and lip shape, face shape and cheeks, and marks such as freckles or a mole. Draw them at the same level of detail as the portrait, never simpler — do not turn anyone's eyes into generic dots or their face into a standard cute face. These features are what make each person recognisable; keep them even in this painting style and at this camera distance.`,
    /*
     * 머리 — 2쪽 시험(2026-10-01 사장님 "아들래미 머리스타일이 다르다"): 숱 많고 삐죽한 갈색 머리에 한쪽으로 쏠린 앞머리가
     * 단정한 둥근 짧은 머리·일자 앞머리·짙은 색으로 '정리'됐다. 모양·길이만 말해서 숱·결·쏠림·색 농도가 빠졌다.
     */
    `HAIR — for ${names.join(", ")}, the hair is as much a part of who they are as the face: copy from the same portrait its outline and volume, whether it is tousled and spiky or neat and smooth, the direction the fringe falls and how much forehead and ear it covers, and the exact shade (a brown-haired child stays brown, not black). Never tidy, smooth, flatten or restyle anyone's hair into a standard neat cut.`,
  ];
}

/**
 * 요청 portraits 칸에서 한 사람의 키·머리 비율(만들기 화면이 가족에서 읽어 보낸 값) — 없으면 빈 칸.
 * 인물 시트(api/character-sheet)는 원본으로 시트를 짤 때, 쪽 그림(api/illustrate-page)은 얼굴 카드를 오릴 때 쓴다.
 * 값은 lib/sheet-compose sheetFigureMeta 가 다시 거른다.
 */
export function readPortraitFigure(raw: unknown, name: string): { heightCm?: unknown; headRatio?: unknown } {
  if (!Array.isArray(raw)) return {};
  const hit = raw
    .slice(0, 12)
    .find((o) => o && typeof o === "object" && typeof (o as { name?: unknown }).name === "string" && (o as { name: string }).name.trim() === name);
  return hit && typeof hit === "object" ? (hit as { heightCm?: unknown; headRatio?: unknown }) : {};
}
