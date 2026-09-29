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

/** 붙이는 그림 '몇 번째' — 시트 1 + 얼굴 최대 4 + 장소 1 + 승인 쪽 1 = 7, 넉넉히 열까지. */
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
 * 3.x 그림 모델·OpenAI 는 참고 그림 10장 넘게 받는다 — 만들기 화면이 붙이는 최대(CAST_PORTRAITS_MAX 4)까지.
 */
export function maxPagePortraits(env: Parameters<typeof maxPortraitRefs>[0]): number {
  return maxPortraitRefs(env) >= 4 ? 4 : 1;
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
 * 시트 순서 한 줄 — 누가 어느 칸인지. 이름과 그림을 묶는 유일한 끈이 설명 글뿐이던 구멍을 막는다.
 * notToScale — AI 가 따로 그려 옆에 붙인 사람들(섞인 시트의 덩어리). 그 그림은 내용 높이 전체로 붙어서
 * 다섯 살 친구가 엄마만큼 크게 선다(검토 2026-09-29) — 키는 시트가 아니라 나이대로 그리라고 못박는다.
 * 비어 있으면(모두 고정) 글은 예전 그대로다.
 */
export function sheetOrderLine(order: readonly string[], notToScale: readonly string[] = []): string {
  const scale = notToScale.length
    ? ` ${notToScale.join(", ")} ${notToScale.length > 1 ? "were" : "was"} painted separately at a different scale — heights on this sheet are NOT to scale between people. Draw every person at the natural height for their age.`
    : "";
  return `The reference sheet shows these people from left to right: ${order
    .map((name, i) => `${i + 1}. ${name}`)
    .join(", ")}. Each column is one person — the full figure on top and the same person's close-up below.${scale}`;
}

/**
 * 이 쪽에 보이는 고정 가족 줄(CAST LOCK 안) — 얼굴·머리·옷을 어디서 따오는지.
 *  · 원본 그림이 붙은 사람과 안 붙은 사람을 가른다 — 2.x 모델은 한 쪽에 1장뿐이라, 붙지도 않은 엄마에게
 *    "붙은 원본을 따르라"고 하면 하온의 그림을 엄마에게도 묶는다(검토 2026-09-29).
 *  · composed(원본 픽셀로 짠 시트): 시트의 옷 = 가족 그림의 옷이고, 클로드가 적은 설명 글의 옷과 다를 수 있다.
 *    그 옷 낱말을 버리라고 분명히 한다 — 안 그러면 어떤 쪽은 노란 원피스, 어떤 쪽은 남색 카디건이 된다.
 * 원본도 없고 짠 시트도 아니면(옛 책) 예전 한 줄 그대로 — 시험이 못 박는다.
 */
export function fixedFamilyFaceLines(
  fixedOnPage: readonly string[],
  portraitNames: ReadonlySet<string>,
  composed: boolean,
): string[] {
  if (fixedOnPage.length === 0) return [];
  const outfit = composed
    ? "Their outfit is exactly the one shown on the reference sheet — ignore any clothing named in their description above; change it only where this page's scene text itself dresses them differently (pajamas, coat, swimsuit)."
    : "Their outfit stays exactly as on the sheet, like everyone else's — change it only where this page's scene text itself dresses them differently.";
  const withPortrait = fixedOnPage.filter((n) => portraitNames.has(n));
  const sheetOnly = fixedOnPage.filter((n) => !portraitNames.has(n));
  const lines: string[] = [];
  if (withPortrait.length) {
    lines.push(
      `FIXED FAMILY FACES: ${withPortrait.join(", ")} — face, hairstyle, hair length, hair colour and texture, glasses and body come ONLY from their attached original portrait (FIXED FACE PORTRAITS above) and the reference sheet; if their description above words it differently, follow the portrait. ${outfit}`,
    );
  }
  if (sheetOnly.length) {
    lines.push(
      `FIXED FAMILY FACES${withPortrait.length ? " (no portrait attached for them on this page)" : ""}: ${sheetOnly.join(", ")} — face, hairstyle, hair length, hair colour and texture, glasses and body come ONLY from the reference sheet; if their description above words it differently, follow the sheet. ${outfit}`,
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
 */
export function fixedCheckDescription(description: string, withPortrait: boolean, composed: boolean): string {
  const note = withPortrait
    ? "judge face and hair against their attached original portrait and outfit against the reference sheet, not this text"
    : composed
      ? "judge face, hair and outfit against the reference sheet, not this text"
      : "judge face and hair against the reference sheet, not this text";
  return `${description} (fixed family face — ${note})`.trim();
}

/**
 * 고정 얼굴 원본을 붙였을 때의 묶음 줄 — 몇 번째 그림이 누구의 얼굴인지, 무엇을 따르고 무엇을 버리는지.
 * 옷은 원본 그림이 아니라 시트(와 이 쪽 장면 글)에서 — 예전 책의 시트는 옷이 원본과 다를 수 있다. 얼굴·머리는 원본이 이긴다.
 */
export function portraitBindingLines(order: readonly string[], names: readonly string[]): string[] {
  if (names.length === 0) return [];
  return [
    "FIXED FACE PORTRAITS — the ORIGINAL approved portraits of the fixed family members on this page are attached:",
    ...names.map(
      (name) =>
        `- The ${refOrdinal(order, portraitKey(name))} attached image is "${name}" — ${name}'s exact face and hair. Copy exactly: face shape, eyes, eyebrows, nose, mouth, skin tone, hairstyle, hair length, fringe or parting, hair colour and texture, glasses (only if the portrait shows glasses), beard, build and apparent age. The reference sheet shows the same person.`,
    ),
    "Each portrait is one of the people in CAST LOCK below — never an additional person and never a second copy of anyone. Ignore each portrait's white background, standing pose and framing: draw the person inside this scene, in this scene's action and camera angle.",
    // 승인 쪽도 얼굴을 옮겨 올 수 있다(그림체 기준 줄이 'facial construction'을 따르라 한다) — 검수를 지난 쪽에도
    // 작은 흐름이 남아 있으면 쪽에서 쪽으로 번진다. 얼굴·머리는 원본이 늘 이긴다(검토 2026-09-29).
    "Clothing comes from the reference sheet (and this page's scene text), not from the portrait. Face and hair come from the portrait: if the reference sheet, an approved page or any description disagrees with a portrait about face or hair, the PORTRAIT wins — take only the rendering style from an approved page, never a face.",
  ];
}
