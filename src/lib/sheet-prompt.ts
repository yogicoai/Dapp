/**
 * 인물 시트(api/character-sheet) 프롬프트와 붙이는 그림 순서 — 라우트에서 떼어 낸 순수 함수.
 * node --test 로 시험한다(sheet-prompt.test.ts). 상대 경로 + 확장자: node --test 가 "@/" 별칭을 모른다.
 *
 * 2026-09-29: 가족 캐릭터에서 얼굴을 고정한 사람(FamilyMember.portrait)의 그림을 시트에 참고 그림으로 붙인다.
 * 사장님 제보 — '하온이의 나뭇잎 보물찾기'에서 가족 화면에 고정한 하온 얼굴과 다른 하온이 그려졌다.
 * 시트가 모든 쪽의 유일한 얼굴 기준인데, 시트에 고정 얼굴이 한 번도 안 갔다.
 * **고정 얼굴이 하나도 없으면 프롬프트는 예전과 한 글자도 다르지 않다** — 시험이 못 박는다.
 */
import { acceptFamilyRef, familyRefMemberId } from "./family-ref.ts";

export type SheetCharacter = { name: string; description: string };
export type SheetAdultLooks = { name: string; line: string };

/** 붙이는 그림 '몇 번째' — 견본 1 + 고정 얼굴 최대 4 + 아이 그림 1 을 덮는다. */
const ORDINALS = ["FIRST", "SECOND", "THIRD", "FOURTH", "FIFTH", "SIXTH", "SEVENTH"];

/**
 * 붙이는 그림 순서: 그림체 견본 → 고정 얼굴(등장인물 순) → 아이 그림.
 * 프롬프트의 '몇 번째'(characterSheetPrompt)가 이 순서를 말한다 — 라우트는 반드시 이 함수로 참고 그림을 늘어놓는다.
 */
export function sheetReferences<T>(sample: T | null, portraits: readonly T[], drawing: T | null): T[] {
  return [...(sample ? [sample] : []), ...portraits, ...(drawing ? [drawing] : [])];
}

/**
 * 고정 얼굴을 몇 장까지 붙일까.
 * gemini-2.x 그림 모델(2.5-flash-image …)은 참고 그림 3장 이하에서 가장 잘 따른다 — 견본 1 + 얼굴 2.
 * 3.x 그림 모델·OpenAI(gpt-image /edits, 16장까지)는 견본 1 + 얼굴 4.
 * 안 적으면 3.1 로 본다(gemini.ts 기본값과 같게, 2026-10-02) — 기본값이 2.5 이던 때 Vercel 에 값이 빠져
 * 운영이 조용히 2.5 로 그렸다(쪽당 얼굴 1장 — 닮음이 통째로 떨어졌다).
 */
export function maxPortraitRefs(env: {
  IMAGE_PROVIDER?: string;
  GEMINI_IMAGE_MODEL?: string;
  [key: string]: string | undefined;
}): number {
  if (env.IMAGE_PROVIDER?.trim().toLowerCase() === "openai") return 4;
  const model = (env.GEMINI_IMAGE_MODEL ?? "gemini-3.1-flash-image").trim().toLowerCase();
  return /^gemini-2(?:[.-]|$)/.test(model) ? 2 : 4;
}

/**
 * 서버가 받은 고정 얼굴 한 사람 — 이름은 등장인물 이름, url 은 검사를 통과한 주소.
 * memberId 는 요청 값이 아니라 그 주소의 파일 이름에서 읽은 사람 id(familyRefMemberId).
 */
export type SheetPortrait = { name: string; url: string; index: number; memberId: string };

/** 부모 생김새 줄(adultLooks)의 이름 — 만들기 화면이 '엄마'·'아빠'로 보낸다. id 는 가족의 고정 id(lib/family FIXED_ID_ROLES). */
const ADULT_NOTE_OF: Readonly<Record<string, string>> = { mom: "엄마", dad: "아빠" };

/**
 * 고정 얼굴이 붙은 부모 생김새 줄 이름 — 실제로 붙은 얼굴의 사람 id 로만 고른다.
 * 인물 이름('엄마 (지은)'·'지은(엄마)'·'어머니')은 가족 짝짓기(lib/family-cast)와 꼴이 달라 이름 끝으로는 놓쳤다
 * (2026-09-29 검토) — 놓치면 "안경 없음"을 그대로 따르라는 줄이 고정 그림과 부딪친다.
 */
export function fixedAdultNotes(memberIds: readonly string[]): string[] {
  return [...new Set(memberIds.flatMap((id) => (ADULT_NOTE_OF[id] ? [ADULT_NOTE_OF[id]] : [])))];
}

const MEMBER_ID = /^[a-z0-9-]{1,40}$/;
/** 요청에서 읽을 최대 줄 수 — 그 뒤는 보지 않는다(터무니없는 입력 막이). */
const PORTRAIT_INPUT_MAX = 12;

/**
 * 요청의 portraits 칸을 고른다 — [{ name, ref, memberId? }].
 *  · name 은 등장인물 이름과 글자 그대로 같아야 한다(시트에 없는 사람을 붙이지 않는다 — 'EXACTLY N명').
 *  · ref 는 이 회원 폴더의 참고용 JPEG 만(acceptFamilyRef). memberId 가 오면 파일 이름의 사람 id 와 같아야 한다.
 *  · 같은 이름·같은 주소는 한 번만. 등장인물 순서로 줄 세우고 max 장에서 자른다.
 * rejected = 받지 않은 줄 수, dropped = 상한에 걸려 뺀 수(로그용 — 주소는 로그에 남기지 않는다. uid 가 들어 있다).
 */
export function pickSheetPortraits(
  raw: unknown,
  characters: readonly SheetCharacter[],
  prefix: string | null,
  max: number,
): { portraits: SheetPortrait[]; rejected: number; dropped: number } {
  if (!Array.isArray(raw) || raw.length === 0) return { portraits: [], rejected: 0, dropped: 0 };
  let rejected = Math.max(0, raw.length - PORTRAIT_INPUT_MAX);
  const seenName = new Set<string>();
  const seenUrl = new Set<string>();
  const kept: SheetPortrait[] = [];
  for (const item of raw.slice(0, PORTRAIT_INPUT_MAX)) {
    const o = (item && typeof item === "object" ? item : {}) as { name?: unknown; ref?: unknown; memberId?: unknown };
    const name = typeof o.name === "string" ? o.name.trim() : "";
    const memberId = typeof o.memberId === "string" ? o.memberId : undefined;
    const index = name ? characters.findIndex((c) => c.name === name) : -1;
    const url =
      index >= 0 && (memberId === undefined || MEMBER_ID.test(memberId))
        ? acceptFamilyRef(o.ref, prefix, { memberId })
        : null;
    const fileId = url ? familyRefMemberId(url, prefix) : null;
    if (!url || !fileId || seenName.has(name) || seenUrl.has(url)) {
      rejected++;
      continue;
    }
    seenName.add(name);
    seenUrl.add(url);
    kept.push({ name, url, index, memberId: fileId });
  }
  kept.sort((a, b) => a.index - b.index);
  const cap = Math.max(0, max);
  return { portraits: kept.slice(0, cap), rejected, dropped: Math.max(0, kept.length - cap) };
}

/**
 * 인물 시트 프롬프트.
 * portraits — 고정 얼굴이 **실제로 붙은** 인물 이름, sheetReferences 에 넘긴 순서 그대로(받아 오지 못한 사람은 빼고 넘긴다).
 */
export function characterSheetPrompt(input: {
  /** ART_STYLES 의 prompt */
  stylePrompt: string;
  /** 이름이 있는 인물만, 최대 6명(라우트가 고른 그대로) */
  characters: readonly SheetCharacter[];
  /** heroIdentity(나이, 성별) */
  hero: string;
  /** 아이 생김새 한 줄(영어가 오면 영어) */
  looks: string;
  adultLooks: readonly SheetAdultLooks[];
  styleSample: boolean;
  drawing: boolean;
  portraits?: readonly string[];
  /** 고정 얼굴이 붙은 부모 생김새 줄 이름('엄마'·'아빠') — fixedAdultNotes(붙은 얼굴의 사람 id) */
  fixedAdults?: readonly string[];
  /**
   * 원본 픽셀로 짜는 시트(lib/sheet-compose)의 '나머지 사람들만' 그리기 — 고정 가족은 원본 그림이 따로 서니 그리지 않는다.
   * characters 는 그 나머지 사람들만. 주인공이 고정 가족이면 heroOnSheet=false — '첫 사람이 주인공' 줄과 아이 생김새 줄을 뺀다.
   * alreadyDrawn = 따로 서는 고정 가족(이름·설명) — 그리지 말고, 그들과 머리·옷 색이 확실히 다르게.
   *   outfit = 그 사람 가족 그림에서 잰 윗옷 색(lib/sheet-compose outfitColour) — 설명 글의 옷은 클로드가 정한 것이라
   *   그림의 옷과 다를 수 있다. 있으면 설명 글의 옷보다 이것을 믿으라고 적는다(친구가 가족과 같은 색을 입지 않게).
   *   avoidOutfit = 옷 카드를 함께 그리는 책 — 가족은 설명 글의 옷(이 책의 옷)을 입지만, 옷 카드가 실패하면 가족 그림 옷(잰 색)으로
   *   선다. 어느 쪽이 될지 이 그림을 그릴 때는 모르니 그 색도 피하라고 적는다(검토 2026-09-29).
   * 둘 다 안 주면 프롬프트는 예전과 한 글자도 다르지 않다(시험이 못 박는다).
   */
  heroOnSheet?: boolean;
  alreadyDrawn?: readonly (SheetCharacter & { outfit?: string | null; avoidOutfit?: string | null })[];
}): string {
  const { stylePrompt, characters, hero, styleSample, drawing } = input;
  const heroOnSheet = input.heroOnSheet ?? true;
  // 주인공이 이 그림에 없으면 아이 생김새 줄도 없다 — 다른 아이에게 주인공 머리가 옮겨 가지 않게.
  const looks = heroOnSheet ? input.looks : "";
  const adultLooks = input.adultLooks;
  const alreadyDrawn = input.alreadyDrawn ?? [];
  const portraits = input.portraits ?? [];
  const fixed = new Set(portraits);
  const heroFixed = characters.length > 0 && fixed.has(characters[0].name);
  const fixedAdults = new Set(portraits.length ? (input.fixedAdults ?? []) : []);
  /** 어른 줄('엄마'·'아빠')의 사람이 고정 얼굴인가 — 인물 이름이 아니라 붙은 얼굴의 사람 id 로 정한다(fixedAdultNotes). */
  const adultFixed = (name: string) => fixedAdults.has(name);

  const cast = characters
    .map((c) => `- ${c.name}: ${c.description || "주인공 아이"}`)
    .join("\n");

  // "wholesome, fully clothed"는 인수인계 문서의 함정 메모 — 유아 장면이 안전필터에
  // 과잉 차단되는 걸 이 순화 문구가 풀어준다.
  // 붙이는 그림 순서: 그림체 견본 → 고정 얼굴 → 아이 그림(sheetReferences). 문장이 "몇 번째"를 말하게 한다.
  const attached = [
    styleSample ? "sample" : "",
    ...portraits.map((name) => `portrait:${name}`),
    drawing ? "drawing" : "",
  ].filter(Boolean);
  const nth = (k: string) => ORDINALS[attached.indexOf(k)] ?? "attached";

  const prompt = [
    `Character reference sheet for a children's picture book, ${stylePrompt}.`,
    styleSample
      ? [
          `The ${nth("sample")} attached image is the STYLE SAMPLE for this whole book. Copy its rendering exactly: medium, brush or line quality, edge softness, colour palette and saturation, shading method, paper/texture and finish.`,
          "It is a style reference ONLY — do NOT draw the fox, do NOT copy its subject, pose or composition. Only the way it is painted carries over.",
        ].join("\n")
      : "",
    `Characters:\n${cast}`,
    /*
     * 고정 얼굴 — 가족 화면에서 부모가 '마음에 들어요'로 고정한 그림. 이 사람의 얼굴·머리는 이 그림이 정한다.
     * 옷은 이야기마다 바뀐다(lib/family.ts 규칙) — 등장인물 줄의 옷을 따르고, 옷이 안 적혀 있으면 그림의 옷.
     * 머리글에 '아이의 진짜 가족' 같은 말을 쓰지 않는다 — 실제 사람 닮은 그림 + 아이 쪽 말은 안전 검사에 걸리기 쉽다
     * (lib/family-portrait-prompt 머리말, 2026-09-29 사진 갈래 거절).
     * 가족 그림은 늘 수채화다(api/family/portrait) — 누구인지만 따오고 그림체는 이 책 것으로(지브리·벡터 책이 수채화로 끌려가지 않게).
     */
    portraits.length
      ? [
          "FIXED FACES — some of these characters already have an approved painted character design (a fixed portrait). Those portraits are attached:",
          ...portraits.map((name) => {
            const k = characters.findIndex((c) => c.name === name);
            return `- The ${nth(`portrait:${name}`)} attached image is the fixed portrait of "${name}"${k >= 0 ? ` (character ${k + 1} in the list above)` : ""}.`;
          }),
          "Each portrait is that person's identity. Copy exactly: face shape, eyes, eyebrows, nose, mouth, skin tone, hairstyle, hair length, fringe or parting, hair colour and texture, glasses (only if the portrait shows glasses), beard, build and apparent age — anyone who knows them must instantly recognise the same person.",
          `The portraits decide WHO these people are, never HOW they are painted: ignore each portrait's own medium (watercolour washes, pencil contour, paper texture) and render these people exactly like everyone else on this sheet, in ${styleSample ? `the STYLE SAMPLE's rendering (the ${nth("sample")} attached image)` : "this book's style described above"}. Translate each face into this style without changing who it is — do not beautify, age up, age down, or alter face proportions, hairstyle, hair length or glasses.`,
          "If anything else in this prompt — the character list above, the hero's traits, the adult notes or any rule below — disagrees with a portrait about face, hair, glasses or body, the PORTRAIT wins.",
          "Take only the person from each portrait — not its white background, its pose or its framing. Clothing follows that character's description in the list above; if the description names no clothing, keep the clothes from the portrait.",
        ].join("\n")
      : "",
    // 주인공(첫 번째 인물)은 나이·성별을 못박고, 생김새는 부모가 고른 특징을 그대로 따른다.
    heroOnSheet
      ? `The FIRST character is the child hero: ${hero}. Draw a child of exactly that age — a small child's proportions and face, never older.`
      : "",
    looks
      ? heroFixed
        ? `The hero's traits chosen by the parent: ${looks}. The hero's attached portrait already shows who the hero is — draw the hero exactly like the portrait, and where a trait here disagrees with the portrait, follow the portrait. Hair texture is a hard identity trait: keep it exactly as the portrait shows — straight hair stays completely straight with no curls or perm volume; wave, natural curls and permed curls stay as they are.`
        : `The hero's appearance MUST match these traits exactly: ${looks}. Keep these traits visible and consistent — they are how the child recognizes themselves. Hair texture is a hard identity trait: straight hair must stay completely straight with no curls or perm volume; wave, natural curls, and permed curls must remain visually distinct and must never be substituted for one another.`
      : "",
    // 아이 그림이 있으면 그 그림이 주인공의 원본이다 — 아이가 자기 캐릭터로 알아보게
    // 눈에 띄는 특징(머리 모양·옷 색·좋아하는 물건)을 반드시 살린다.
    drawing
      ? [
          `The ${nth("drawing")} attached image is a CHILD'S OWN DRAWING of the first character. Treat it as a design brief, NOT as art to copy.`,
          "COPY these identifying traits exactly so the child recognizes their character: hair color and hairstyle, clothing type and colors, any accessory or object they drew, and any other standout detail.",
          "DO NOT copy the drawing's crude execution: no stick-figure limbs, no triangle body, no flat shapes, no childlike scrawl, no traced outlines.",
          "Instead draw a fully realized, professional picture-book character with natural body proportions for their age, real arms and legs, expressive face, and properly drawn clothing — as a skilled illustrator would when handed a child's sketch and asked to turn it into a real storybook hero.",
          "The child must think 'that's MY character, but drawn beautifully'.",
        ].join("\n")
      : "",
    /*
     * 시트가 흔들리면 책 전체가 흔들린다. 여기서 두 가지를 못박는다.
     *
     * ① 인원 수 — 목록에 없는 인물이 끼거나 같은 인물이 두 번 그려지면, 매 쪽 삽화가
     *    그 시트를 참조하므로 8쪽 내내 같은 사고가 반복된다.
     * ② 서로 달라 보이기 — 주인공과 친구가 비슷하게 그려지면, 쪽 삽화에서 모델이
     *    둘을 구별하지 못해 주인공을 두 번 그린다(실제 발생: 친구가 주인공의 쌍둥이로 나옴).
     *    그래서 머리와 옷 색이 확실히 다르도록 시트 단계에서 갈라 둔다.
     */
    `Draw EXACTLY ${characters.length} character${characters.length > 1 ? "s" : ""}, one per person listed above, arranged left to right in that order, evenly spaced and clearly separated.`,
    "Each listed character appears exactly ONCE. Never repeat a character, never draw twins, never add anyone who is not on the list.",
    /*
     * 원본 픽셀로 짜는 시트의 나머지 그림 — 고정 가족은 원본 그림이 이 그림 옆에 따로 선다(lib/sheet-compose).
     * 'EXACTLY N명' 줄 **뒤에** 둔다 — 앞에 두면 "listed above"가 이 사람들까지 세는 것으로 읽힌다.
     */
    alreadyDrawn.length
      ? [
          "OTHER PEOPLE IN THIS BOOK — ALREADY PAINTED separately; their finished pictures will be placed beside yours. They are NOT part of this picture: never draw them, not even in the background.",
          ...alreadyDrawn.map(
            (c) =>
              `- ${c.name}${c.description ? `: ${c.description}` : ""}${c.outfit ? ` — in their finished picture they wear mostly ${c.outfit}; this overrides any clothing named here` : c.avoidOutfit ? ` — their finished picture may instead show them mostly in ${c.avoidOutfit}; keep clearly away from that colour too` : ""}`,
          ),
          "Make every character you draw clearly different from them in hairstyle and clothing colour, so no one can be mistaken for them.",
        ].join("\n")
      : "",
    /*
     * 어른에게 안경·수염을 임의로 붙이지 않는다.
     *
     * 이 동화의 어른은 아이의 실제 엄마·아빠다. 안 쓰는 안경을 씌우면 아이가 "우리
     * 아빠"로 못 알아본다(실제로 6쪽 내내 안경잡이 아빠가 그려졌다). 구별은 머리
     * 길이와 옷 색으로 충분하다. 글로 적혀 있을 때만 그린다(고정 얼굴이면 그 그림에 보일 때도).
     */
    // 머리 색 한국어 풀이 — 어른 줄은 머리 색을 꾸밈말로 적는다(희끗희끗한 짧은 머리 …). 가족 그림(api/family/portrait)과 같은 풀이.
    ...(adultLooks.length > 0
      ? [
          "Hair colour words in the adult descriptions below: 까만/까만색 = black, 짙은 갈색 = dark brown, 밝은 갈색 = light brown, 붉은 갈색 = auburn, 희끗희끗(한) = black with grey streaks, 회색 = grey, 하얀/흰머리 = white/silver.",
        ]
      : []),
    ...adultLooks.map((a) =>
      adultFixed(a.name)
        ? `The adult "${a.name}" has a fixed portrait attached (see FIXED FACES) — their face, hair, glasses and build come from that portrait. The parent's note about them (Korean): ${a.line}. Use this note for their clothing; where it disagrees with the portrait about face, hair or glasses, follow the portrait.`
        : `The adult "${a.name}" looks EXACTLY like this, chosen by the child's parent (Korean): ${a.line}. Follow it literally — if it says they do not wear glasses, draw no glasses.`,
    ),
    `DO NOT invent facial accessories or features for the ADULTS. Never add glasses, sunglasses, a beard, a moustache, a hat, earrings, a mole or a tattoo to any adult unless that exact item is written in their description above${portraits.length ? " or clearly visible in their attached portrait" : ""}. These adults are the child's real family — a father wearing glasses he does not own makes the child fail to recognise him. Tell adults apart by HAIR LENGTH/STYLE and CLOTHING COLOUR only.`,
    characters.length > 1
      ? [
          "MAKE THEM UNMISTAKABLY DIFFERENT FROM EACH OTHER. This is the most important rule of this sheet.",
          "Give each character a clearly different hairstyle (length and shape) AND clearly different clothing colours. If two descriptions happen to be similar, push them apart — change one character's hair length and shirt colour so the two can never be confused.",
          /*
           * 고정 얼굴을 '구별하려고' 고치면 안 된다. 부모가 고른 주인공 머리도 마찬가지 — 고정 얼굴끼리 닮았으면
           * 머리가 아니라 옷 색으로 가른다. 머리를 바꿔도 되는 쪽은 그림도 부모 칩도 머리를 정하지 않은 사람뿐이다.
           */
          portraits.length
            ? [
                "Characters with a fixed portrait keep their portrait face and hair exactly — never alter them to create contrast.",
                looks && !heroFixed ? "The hero also keeps the hair the parent chose." : "",
                "If a fixed-portrait character looks similar to someone else, separate them by CLOTHING COLOUR, and change hair only on a character whose hair is set neither by a portrait nor by the parent's chosen traits.",
              ]
                .filter(Boolean)
                .join(" ")
            : "",
          "A reader glancing at this sheet must be able to tell instantly which character is which. Two characters that could be mistaken for the same child is a failure.",
          "These are Korean children. ALL of them have black or dark brown hair. Never draw blonde, golden, yellow, red, ginger, silver or light-coloured hair on any child, even if a description hints at it — read such a hint as a dark shade, not a light one. Tell them apart by HAIRSTYLE and CLOTHING COLOUR only.",
          "Follow each description's stated sex exactly. A character described as a boy is drawn as a boy with short hair; a character described as a girl is drawn as a girl. Never infer sex from the name.",
          "Draw every face LARGE and clearly readable — this sheet is the identity reference for every page of the book, so each character's eyes, nose, mouth, hair shape and face shape must be sharp enough to copy. Do not shrink the characters to fit; crop the composition tighter if needed.",
        ]
          .filter(Boolean)
          .join("\n")
      : "",
    /*
     * 얼굴을 크게 — 시트는 매 쪽이 베끼는 원본인데, 전신만 세우면 얼굴이 가로의
     * 1/4~1/6밖에 안 돼 눈·코·입이 흐릿하다. 그래서 쪽마다 얼굴이 조금씩 달라졌다.
     * 위 줄엔 전신, 아래 줄엔 같은 인물의 얼굴 클로즈업을 크게 둔다.
     */
    [
      "LAYOUT — two rows on one simple plain white background.",
      "TOP ROW: each character full body, front view, standing, in the listed order.",
      "BOTTOM ROW: directly under each figure, a LARGE head-and-shoulders close-up of the SAME character (same face, same hair, same expression neutral-friendly), big enough that eyes, nose, mouth, eyebrows, face shape and fringe are sharp and easy to copy.",
      "The close-up must be the same person as the figure above it — identical design, just closer.",
    ].join("\n"),
    "Consistent character design to be reused across every page of the book.",
    "Wholesome, innocent, fully clothed, child-friendly.",
    "NO text, no letters, no labels in the image.",
  ]
    .filter(Boolean)
    .join("\n");
  return prompt;
}

/**
 * 옷 카드 비율 — 한 벌이면 세로, 둘부터 가로(칸마다 한 벌). 그림 모델은 4:3·3:4·1:1 만 받는다(lib/gemini generateImage).
 */
export function outfitCardAspect(count: number): "3:4" | "4:3" {
  return count <= 1 ? "3:4" : "4:3";
}

/** 옷 카드 한 벌 — size 는 누구 옷인지(영어, 사람 이름은 넣지 않는다), outfit 은 클로드가 쓴 이 책의 옷(한국어). */
export type OutfitCardPerson = { size: string; outfit: string };

/**
 * 옷 카드에서 누구 옷인지(크기) — 아이 옷이 어른 옷만 하게 그려지지 않게.
 * kid 는 lib/sheet-compose sheetFigureMeta 가 정한 것(사람 id·키). age 는 주인공일 때만 안다(형제는 모른다 — '어린아이').
 */
export function outfitCardSize(input: { memberId: string; kid: boolean; age?: number | null }): string {
  if (input.kid) {
    const age = input.age;
    if (typeof age === "number" && Number.isFinite(age) && age >= 9) return "an 8-to-10-year-old child's outfit";
    if (typeof age === "number" && Number.isFinite(age) && age > 0) return `a ${Math.round(age)}-year-old child's outfit`;
    return "a young child's outfit";
  }
  if (input.memberId === "mom") return "a grown-up woman's outfit";
  if (input.memberId === "dad") return "a grown-up man's outfit";
  return "a grown-up's outfit";
}

/**
 * 옷 카드 프롬프트(2026-09-29 저녁, 사장님 "옷은 그 주제안에서 랜덤으로 교체되게") — 고정 가족이 이 책에서 입는 옷을
 * **사람 없이 옷만** 그린다. 원본 픽셀 시트(lib/sheet-compose)의 위 줄에 원본 전신 대신 이 옷이 서고, 아래 줄 얼굴은 원본 그대로다.
 * 사람을 그리게 하면 얼굴이 AI 를 한 번 거친다 — 사장님 첫째 약속("얼굴 그대로, 변형없이")을 깬다. 그래서 얼굴·머리·몸을
 * 한 줄도 그리지 않게 못 박고, 가족 그림도 붙이지 않는다(거절 위험도 가장 낮다).
 * 그림체 견본만 붙인다 — 붙이는 순서의 첫째(FIRST).
 * 흰 옷은 옅은 회색으로 — 흰 바탕에서 칸 나누기(splitCardColumns)가 옷을 못 찾는다.
 */
export function outfitCardPrompt(input: {
  stylePrompt: string;
  styleSample: boolean;
  people: readonly OutfitCardPerson[];
}): string {
  const n = input.people.length;
  return [
    `Clothing reference card for a children's picture book, ${input.stylePrompt}.`,
    input.styleSample
      ? [
          "The FIRST attached image is the STYLE SAMPLE for this whole book. Copy how the clothes are painted: medium, brush or line quality, edge softness, colour palette and saturation, shading method. Do NOT copy its paper, paper texture or background tone.",
          "It is a style reference ONLY — do NOT draw the fox, do NOT copy its subject, pose or composition. Only the way it is painted carries over.",
        ].join("\n")
      : "",
    "Draw ONLY CLOTHES. This card shows the outfits some people wear throughout this book. There are NO people on this card: no heads, faces, hair, hands, arms, legs or bodies, no mannequins, no dress forms, no hangers.",
    n === 1
      ? "Draw EXACTLY 1 outfit, centred on the card:"
      : `Draw EXACTLY ${n} outfits, left to right in this order, each centred in its own equal-width column with clear white space between columns:`,
    ...input.people.map((p, i) => `${i + 1}. ${p.size} (written in Korean): ${p.outfit}`),
    "Lay each outfit out upright and front-facing as it would be worn: the top above the trousers, skirt or shorts (or a dress on its own), outerwear such as a coat, cardigan, raincoat or scarf over the top, and the pair of shoes at the bottom. Draw every garment that is written and nothing else, in exactly the written colours.",
    "Keep every garment plain — solid colours or one bold simple pattern if written; no logos, no small prints — so the same outfit can be redrawn identically on every page. A child's outfit is clearly smaller than a grown-up's.",
    "White garments are painted as clearly shaded very light grey with a thin outline.",
    // 견본의 크림색 종이 결을 따라 그리면 칸 나누기(sheet-compose splitCardColumns)가 빈 줄을 못 찾아 카드를 버린다 — 가족 그림(family-portrait-prompt BACKGROUND_LINE)과 같은 말로 못 박는다.
    "BACKGROUND: one flat pure white colour (#FFFFFF) everywhere around the clothes — no paper texture, no cream or beige tone, no wash, no vignette, no floor or ground line, no shadows, no props, no frame or border.",
    "NO text, no letters, no labels, no numbers.",
  ]
    .filter(Boolean)
    .join("\n");
}
