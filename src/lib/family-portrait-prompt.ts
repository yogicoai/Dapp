/**
 * 우리 가족 캐릭터 — 한 사람 전신 수채화 한 장의 프롬프트·참고 그림 순서·'대신 그리기' 판단(api/family/portrait 가 부른다).
 *
 * 경로 파일(route.ts)은 HTTP 함수 말고는 내보낼 수 없어서, 시험(node --test)하려고 여기로 옮겼다. 순수 함수만 둔다.
 *
 * 그리는 갈래(source) 셋:
 *  - chips : 칩(생김새 한 줄)으로 그린다. 예전 그대로에 머리 비율 쪽만 바뀌었다(2026-09-29): 비율 견본 줄(아래)이 붙고,
 *            같은 가족 그림 줄이 '얼굴 양식·비율 말씨'를 맞추던 데서 머리 크기·몸 비율은 PROPORTIONS 줄(과 비율 견본)에서만
 *            가져오게 바뀌었고(같은 가족 그림은 대개 아이 그림 1:4 라 어른 머리가 따라 커졌다), 어른 PROPORTIONS 줄이
 *            'never a tiny head' 대신 'NOT a big head' 로 바뀌었다.
 *  - photo : 사진을 **첫째** 참고 그림으로 붙이고(얼굴 클로즈업이 있으면 둘째), 특징 카드(lib/family-photo-card — 있으면)를
 *            닮음의 기준으로 적는다.
 *  - card  : 그림 모델이 사진을 거절해 사진 없이 특징 카드(+칩)로 다시 그린다(대신 그리기, 같은 쿠키).
 *
 * 사진 갈래를 바꾼 까닭(2026-09-29 사장님 시험 — 아빠 사진이 IMAGE_SAFETY 로 두 번 막혀 거절, 앞서 '덜 닮았다'):
 *  ① 실제 사람 사진에 '아이의 아빠'·'아이의 진짜 가족'·'innocent, fully clothed' 같은 아이 쪽 말과 아이 그림(같은 가족 참고)이
 *    한 요청에 섞였다 — 구글 안전 검사에 걸리기 쉬운 조합이다. 이제 사진 갈래는 아이 쪽 말 없이 '사진을 바탕으로 한 친근한
 *    그림책 캐릭터 초상'으로만 적고, 같은 가족 그림은 붙이지 않는다(그림체 견본만). 아이 사진이면 아이 규칙(나이·머리 색)은 그대로.
 *  ② 사진이 셋째(가장 약한) 참고였고, '같은 얼굴 양식으로'·'베낀 사본 금지'·'그림책 얼굴로 단순화'가 사진에서 멀어지게 당겼다.
 *    이제 사진이 첫째, 특징 카드는 '그대로 맞출 것', 얼굴 비율은 사진 그대로(단순하게 하는 건 붓질뿐).
 *
 * 닮음 먼저(2026-09-29 사장님 "그림만 보고도 누구다 이런 느낌 날 수 있게", 값은 그대로):
 *  ① 얼굴 클로즈업 — 특징 카드와 같은 답으로 받은 얼굴 상자로 사진에서 얼굴을 넉넉히 잘라 키운 그림(lib/family-closeup)을
 *    사진 바로 뒤(SECOND)에 붙인다. '같은 사진에서 자른 같은 사람 얼굴 — 얼굴은 이것을 보고 정확히, 머리 길이·전체 머리 모양은
 *    사진에서(클로즈업은 머리를 자른다), 얼굴도 수채화로(사진 같은 피부 결·빛 금지)'. 사진과 똑같이 다룬다.
 *  ② 특징 카드가 '알아보게 하는 오래가는 특징 3~5개'(distinctive)부터 적는다(lib/family-photo-card). 좌우는 보는 쪽 기준.
 *  ③ LIKENESS FIRST 줄 — 사진·카드 갈래 프롬프트 둘째 줄(첫 줄 = 그림 종류·그림체 바로 뒤)에 '그림만 보고 이 사람을 알아봐야
 *    한다, 두드러진 특징을 실제 그대로 또렷이(과장·캐리커처 금지), 얼굴 생김새·머리 모양은 사진(얼굴은 클로즈업도)·카드 그대로,
 *    수채화는 붓질만 바꾼다, 머리 크기는 PROPORTIONS 줄에서만'을 맨 먼저 적는다.
 *    아이는 '나이·머리 색은 여전히 WHO 줄·머리 색 규칙'을 덧붙인다. 아이 쪽 말·가족 말은 넣지 않는다(①의 안전 검사 까닭).
 *    칩 갈래에는 넣지 않는다 — 알아볼 사람의 사진·카드가 없고, APPEARANCE 줄이 이미 '적힌 특징을 또렷이'를 맡는다.
 *
 * 비율 견본(2026-09-29 사장님 "아빠만 머리가 너무 크게 나와", lib/family-head · lib/family-guide): 어느 갈래든 표 비율로 선
 * 회색 마네킹 그림을 **마지막** 참고 그림으로 붙인다(사진 갈래도 사진이 첫째 그대로). 프롬프트는 '머리:키 비율만 맞출 것
 * (머리카락 맨 위 ~ 턱 : 머리카락 맨 위 ~ 신발 바닥 — 그린 뒤 재는 방식과 같다), 마네킹 몸 모양·회색·줄·빈 얼굴은 따라 하지
 * 말 것(자세는 POSE 줄)'으로 적는다. 비율표는 lib/family-head headChartRatio 한 곳에 있다.
 *
 * 얼굴 픽셀: 3:4 1K(약 896×1200) 전신이라 얼굴이 작다. 머리 비율은 가족끼리 키가 맞아야 해서 키우지 않는다.
 * (얼굴 클로즈업은 그림 모델이 **보는** 얼굴을 키운다 — 그리는 얼굴 크기는 그대로다.)
 * gemini-3.1-flash-image 는 imageConfig.imageSize '2K' 를 받지만 값이 다르다(1K 장당 약 $0.067 ≈ 95원 → 2K 약 $0.101 ≈ 143원,
 * 2026-09-15 가격표 기준) — 같은 값이 아니라서 켜지 않았다. 켜려면 사장님 결정이 먼저다(lib/gemini generateImage 에 칸이 없다).
 */

import { ART_STYLES } from "./art-styles.ts";
import { heroIdentity } from "./child-looks.ts";
import { siblingGender, type FamilyRole } from "./family.ts";
import { ADULT_HEAD_RATIO, TEEN_HEAD_RATIO, headChartRatio, kidHeadRatio, ratioText } from "./family-head.ts";
import type { PhotoFallback } from "./family-photo.ts";
import { keepTraits } from "./family-photo-card.ts";
import { GeminiError } from "./gemini.ts";

/** 그리기 요청(검사를 마친 값) — api/family/portrait parseInput 이 만든다. */
export type PortraitInput = {
  memberId: string;
  role: FamilyRole;
  callName: string;
  gender?: "girl" | "boy";
  age?: number;
  /** 부모가 고른 생김새 한 줄(한국어) — 프롬프트에 그대로 인용한다 */
  looks: string;
  styleRef?: string;
  /** 화면이 보여 준 값 — 실제 값이 더 크면 깎지 않고 409(price)로 돌려준다 */
  expectedCost?: number;
};

/**
 * 붙인 참고 그림 — sample 그림체 견본 · sibling 같은 가족의 다른 사람 그림 · photo 이 사람 사진 ·
 * closeUp 그 사진에서 자른 얼굴 클로즈업(lib/family-closeup, 사진이 있을 때만) ·
 * guide 비율 견본(표 비율로 선 회색 마네킹, lib/family-guide)
 */
export type Attached = { sample: boolean; sibling: boolean; photo: boolean; closeUp: boolean; guide: boolean };
type RefKind = keyof Attached;

/** 어디서 생김새를 읽나 — 칩 / 사진(+카드) / 카드(사진 없이, 대신 그리기) */
type Source = "chips" | "photo" | "card";

/**
 * 붙이는 순서 = 프롬프트의 FIRST·SECOND·THIRD·FOURTH.
 *  사진 있음: 사진 → 얼굴 클로즈업(있으면) → 그림체 견본 → 비율 견본. 같은 가족 그림(아이 그림일 때가 많다)은 붙이지 않는다.
 *  사진 없음(칩·대신 그리기): 그림체 견본 → 같은 가족 그림 → 비율 견본(앞 둘은 예전 그대로).
 * 클로즈업은 사진 바로 뒤 — 같은 사람 얼굴이라 사진과 붙어 있어야 한 사람으로 읽힌다. 비율 견본은 늘 맨 끝 — 앞 그림들의
 * 순서(사진이 첫째)를 흔들지 않는다. 많아야 넷이다(사진 갈래). Gemini 는 참고 그림을 훨씬 더 받는다.
 */
function refOrder(a: Attached): RefKind[] {
  const order: RefKind[] = a.photo ? ["photo", "closeUp", "sample", "guide"] : ["sample", "sibling", "guide"];
  return order.filter((k) => a[k]);
}

/**
 * 받아 둔 참고 그림에서 이번에 붙일 것과 그 순서를 고른다. images 순서가 곧 buildPrompt(attached)의 FIRST·SECOND 다.
 * 사진이 있으면 같은 가족 그림은 받아 두었어도 붙이지 않는다(attached.sibling=false).
 * closeUp(얼굴 클로즈업)은 사진이 있을 때만 붙는다 — 사진 없이(대신 그리기) 사진에서 자른 얼굴만 보내지 않는다.
 * guide(비율 견본)·closeUp 은 없어도 된다 — 못 만들었으면 없이 예전처럼.
 */
export function portraitReferences<T>(refs: {
  photo: T | null;
  closeUp?: T | null;
  sample: T | null;
  sibling: T | null;
  guide?: T | null;
}): {
  images: T[];
  attached: Attached;
} {
  const attached: Attached = {
    photo: refs.photo !== null,
    closeUp: refs.photo !== null && (refs.closeUp ?? null) !== null,
    sample: refs.sample !== null,
    sibling: refs.sibling !== null && refs.photo === null,
    guide: (refs.guide ?? null) !== null,
  };
  const images = refOrder(attached)
    .map((k) => refs[k])
    .filter((x): x is T => x !== null && x !== undefined);
  return { images, attached };
}

/* ─────────────────────────────── 역할·나이 ─────────────────────────────── */

type Identity = {
  who: string;
  ageRule: string;
  sexRule: string;
  hairRule: string;
  proportion: string;
};

const KID_HAIR =
  "Korean child: hair is black or dark brown ONLY — never blonde, golden, yellow, red, ginger, silver or light-coloured hair, even if a hint suggests it (read such a hint as a dark shade).";
/** 사진으로 그릴 때 — 사진의 빛이 까만 머리를 갈색·금빛으로 보이게 하는 일이 잦다. 아이 규칙은 그대로 지킨다. */
const KID_HAIR_PHOTO = `${KID_HAIR} This includes the photo and any LIKENESS SPEC: light and sun often make dark hair look brown or golden there — keep it dark.`;
/** 특징 카드로 그릴 때 — 카드는 사진에서 읽은 것이라 같은 착시가 섞일 수 있다. */
const KID_HAIR_CARD = `${KID_HAIR} This includes the LIKENESS SPEC: it was read from a photo, where light often makes dark hair look brown or golden — keep it dark.`;
/**
 * 머리 색 한국어 풀이 — 생김새 줄(lib/family familyLooksToPrompt)은 머리 색을 꾸밈말로 적는다(까만 단발머리 ·
 * 희끗희끗한 짧은 머리 · 하얀 쪽진 머리). 의태어 '희끗희끗'을 색으로 읽을지 모델에 맡기지 않게 어른 모두에게 붙인다.
 */
const HAIR_COLOUR_WORDS =
  "Hair colour words in the appearance line: 까만/까만색 = black, 짙은 갈색 = dark brown, 밝은 갈색 = light brown, 붉은 갈색 = auburn, 희끗희끗(한) = black with grey streaks, 회색 = grey, 하얀/흰머리 = white/silver.";
const ADULT_HAIR = `Korean adult: natural black or dark brown hair unless the appearance above gives another colour. ${HAIR_COLOUR_WORDS}`;
/** 사진으로 그릴 때 어른 머리 색 — 사진이 정한다(염색·흰머리 그대로). 사진으로 알기 어려우면 까만·짙은 갈색. */
const ADULT_HAIR_PHOTO = `Hair colour as it looks in the photo — dyed, grey or white hair stays that colour; if the photo does not show it clearly, natural black or dark brown. ${HAIR_COLOUR_WORDS}`;
/** 특징 카드로 그릴 때 어른 머리 색 — 카드가 정한다. 카드에 없으면 까만·짙은 갈색. */
const ADULT_HAIR_CARD = `Hair colour as the LIKENESS SPEC gives it — dyed, grey or white hair stays that colour; if it gives none, natural black or dark brown. ${HAIR_COLOUR_WORDS}`;
/*
 * 가족 얼굴 비율표(사장님 2026-09-29: "각각 얼굴 비율이 있어야") — 머리 : 키.
 *   아이 6살까지 1:5 · 7~9살 1:5.5 · 10~12살 1:6 · 청소년 1:6.5 · 어른(엄마·아빠·조부모) 1:7
 * 사람마다 따로 그려 단체 사진(FamilyGroupPhoto)에서 실제 키 비율로 세우기 때문에, 비율이 사람마다 다르면
 * 얼굴 크기가 들쭉날쭉해진다. 오전엔 어른이 크게 그려진다고(아빠 약 1:4.7) 아이 1:4 · 어른 1:5.5 로 올렸는데,
 * 비율 견본을 붙이자 모델이 그 값을 넘겨 아이가 대두(약 1:3.5)가 됐다 — 사장님이 앞 그림(아이 약 1:4.2)을 골랐다.
 * 모델은 표보다 20% 안팎 크게 그리므로 예전 값을 표로 두고, 많이 큰 머리만 견본·재기로 막는다(lib/family-head).
 * 표 값은 lib/family-head(headChartRatio) 한 곳에 둔다 — 비율 견본 그림·그린 뒤 재기·단체 사진이 같은 표를 쓴다.
 */
const FAMILY_SCALE =
  "Every portrait of this family follows the same picture-book head-to-height chart and they will stand side by side scaled by real height, so keep this head ratio exactly — faces must look consistent in size next to each other.";
function kidBody(age?: number | null): string {
  return `picture-book child proportions — the head is about ${ratioText(kidHeadRatio(age))} of the full body height. NOT chibi, NOT super-deformed. ${FAMILY_SCALE}`;
}
const TEEN_BODY = `picture-book teenage proportions — the head is about ${ratioText(TEEN_HEAD_RATIO)} of the full body height. NOT a big head, NOT chibi, NOT super-deformed. ${FAMILY_SCALE}`;
// 어른은 'NOT a big head'(청소년 줄과 같다) — 사장님 2026-09-29 "아빠만 머리가 너무 크게 나와". 예전 'never a tiny head
// either' 는 머리를 키우는 쪽으로 당겼다. 너무 작은 머리는 그린 뒤 재기(lib/family-head-check)가 잡는다.
const ADULT_BODY = `picture-book adult proportions — the head is about ${ratioText(ADULT_HEAD_RATIO)} of the full body height. NOT a big head, NOT chibi, NOT super-deformed. ${FAMILY_SCALE}`;

/** 'an 8-year-old' · 'an 11-year-old' · 'an 18-year-old' — 나머지는 'a' */
function aged(age: number): string {
  return `${/^(8|11|18)/.test(String(age)) ? "an" : "a"} ${age}-year-old`;
}

/** 머리 모양을 어디서 따르나 — 'follow the ___ exactly' 자리 */
function sourceOf(source: Source): string {
  return source === "photo" ? "photo" : source === "card" ? "LIKENESS SPEC" : "appearance line";
}

/** 아이·형제·친구의 성별 — 부모가 고른 값, 형제는 호칭(형·누나 …)으로도. 없으면 undefined. */
function genderOf(input: PortraitInput): "girl" | "boy" | undefined {
  return input.gender ?? (input.role === "sibling" ? siblingGender(input.callName) : undefined);
}

/** 아이·청소년 그림인가 — identityOf 의 KID_BODY·TEEN_BODY 갈래와 같다(형제·친구는 19살까지). */
function isKid(input: PortraitInput): boolean {
  if (input.role === "child") return true;
  if (input.role === "sibling" || input.role === "friend") return !input.age || input.age <= 19;
  return false;
}

function sexRuleOf(g: "girl" | "boy" | undefined, source: Source): string {
  if (!g) return "";
  return `This child is a ${g}. Draw them clearly as a ${g}; hair length and style still follow the ${sourceOf(source)} exactly.`;
}

/**
 * 사진·카드 갈래의 어른 나이 — '30대 후반'으로 못박지 않고 사진(카드)에서 보이는 나이를 따른다. 그 나이는 우리가 어림한
 * 값이지 부모가 알려 준 값이 아니라서. 아이 쪽 말('never a child')도 넣지 않는다 — 사진과 섞이면 안전 검사에 걸리기 쉽다.
 */
function adultAgeRule(noun: "woman" | "man", source: "photo" | "card"): string {
  const pron = noun === "woman" ? "she" : "he";
  // 카드에 나이 줄이 없을 수 있다(사진으로 알기 어려워 'not visible') — 그때는 칩 갈래와 같은 30대 후반.
  return source === "photo"
    ? `An adult ${noun} at about the age ${pron} looks in the photo, with an adult face and body — not younger-looking and not older-looking than in the photo.`
    : `An adult ${noun} at about the apparent age given in the LIKENESS SPEC (if it gives none, in ${noun === "woman" ? "her" : "his"} late thirties), with an adult face and body — not younger-looking and not older-looking.`;
}

/**
 * 역할·나이 규칙. 칩(chips)은 예전 그대로다.
 * 사진·카드 갈래는 어른을 '아이의 엄마·아빠'가 아니라 '사진(카드) 속 그 사람'으로만 적고, 나이·머리 색도 사진(카드)을 따른다.
 * 사진 갈래의 어른은 'Korean' 도 적지 않는다 — 사진이 생김새를 정한다(다문화 가족의 부모 사진을 한국인 얼굴 쪽으로 당기지
 * 않게). 카드 갈래(사진 없이)는 기댈 그림이 없어 칩 갈래처럼 'Korean' 을 둔다.
 * 아이 쪽 나이는 부모가 알려 준 값이라 어느 갈래든 그대로 지키고, 아이 머리 색 규칙(까만·짙은 갈색만)도 그대로 둔다.
 */
function identityOf(input: PortraitInput, source: Source): Identity {
  const seen = source !== "chips";
  const adultHair = source === "photo" ? ADULT_HAIR_PHOTO : source === "card" ? ADULT_HAIR_CARD : ADULT_HAIR;
  const kidHair = source === "photo" ? KID_HAIR_PHOTO : source === "card" ? KID_HAIR_CARD : KID_HAIR;
  const whose = source === "photo" ? "the person in the reference photo" : "the person described in the LIKENESS SPEC";
  /** 사진·카드 갈래 어른의 'Korean ' — 사진 갈래는 비운다 */
  const korean = source === "photo" ? "" : "Korean ";
  switch (input.role) {
    case "mom":
      return source !== "chips"
        ? {
            who: `a ${korean}woman, ${whose}`,
            ageRule: adultAgeRule("woman", source),
            sexRule: "",
            hairRule: adultHair,
            proportion: ADULT_BODY,
          }
        : {
            who: "a Korean woman in her late thirties (the child's mother)",
            ageRule: "A real adult woman of that age — adult face and adult body, never a child or a teenager, never elderly.",
            sexRule: "",
            hairRule: adultHair,
            proportion: ADULT_BODY,
          };
    case "dad":
      return source !== "chips"
        ? {
            who: `a ${korean}man, ${whose}`,
            ageRule: adultAgeRule("man", source),
            sexRule: "",
            hairRule: adultHair,
            proportion: ADULT_BODY,
          }
        : {
            who: "a Korean man in his late thirties (the child's father)",
            ageRule: "A real adult man of that age — adult face and adult body, never a child or a teenager, never elderly.",
            sexRule: "",
            hairRule: adultHair,
            proportion: ADULT_BODY,
          };
    case "grandma":
    case "grandpa": {
      const woman = input.role === "grandma";
      const who = seen
        ? `an older ${korean}${woman ? "woman" : "man"}, ${whose}`
        : woman
          ? "a Korean grandmother in her late sixties to seventies"
          : "a Korean grandfather in his late sixties to seventies";
      return {
        who,
        ageRule:
          source === "photo"
            ? "An older adult at about the age they look in the photo — a kind, gentle older face with soft natural age lines. Never a young adult."
            : source === "card"
              ? "An older adult at about the apparent age given in the LIKENESS SPEC (if it gives none, late sixties to seventies) — a kind, gentle older face with soft natural age lines. Never a young adult."
              : "An older adult of that age — a kind, gentle older face with soft natural age lines. Never a young adult.",
        sexRule: "",
        hairRule: seen
          ? adultHair
          : `Hair colour exactly as written above. ${HAIR_COLOUR_WORDS} If no colour is written, dark hair with a little grey.`,
        proportion: ADULT_BODY,
      };
    }
    case "child":
      // 설정의 아이 — 동화 캐릭터 시트와 같은 말(heroIdentity)로 나이를 못박는다.
      return {
        who: heroIdentity(input.age ?? null, input.gender),
        ageRule: "Draw a child of exactly that age — a small child's face and body, never older.",
        sexRule: sexRuleOf(input.gender, source),
        hairRule: kidHair,
        proportion: kidBody(input.age),
      };
    case "sibling":
    case "friend": {
      const g = genderOf(input);
      const age = input.age;
      if (!age || age <= 8) {
        return {
          who: heroIdentity(age ?? null, g),
          ageRule: "Draw a child of exactly that age — a small child's face and body, never older.",
          sexRule: sexRuleOf(g, source),
          hairRule: kidHair,
          proportion: kidBody(age),
        };
      }
      const noun = g ?? "child";
      if (age <= 12) {
        return {
          who: `${aged(age)} Korean ${noun}`,
          ageRule: "Draw a child of exactly that age — never a teenager, never an adult.",
          sexRule: sexRuleOf(g, source),
          hairRule: kidHair,
          proportion: kidBody(age),
        };
      }
      if (age <= 19) {
        return {
          who: `${aged(age)} Korean teenage ${noun}`,
          ageRule: "Draw a teenager of exactly that age — not a small child, not an adult.",
          sexRule: sexRuleOf(g, source),
          hairRule: kidHair,
          proportion: TEEN_BODY,
        };
      }
      const adult = g === "girl" ? "woman" : g === "boy" ? "man" : "adult";
      return {
        who: seen ? `${aged(age)} ${korean}${adult}, ${whose}` : `${aged(age)} Korean ${adult}`,
        ageRule: "A real adult of that age — adult face and adult body.",
        sexRule: "",
        hairRule: adultHair,
        proportion: ADULT_BODY,
      };
    }
  }
}

/* ─────────────────────────────── 사진·특징 카드 규칙 ─────────────────────────────── */

/** 사진 갈래 첫 줄 — 사진이 무엇이고 무엇을 그리는지. 안전 검사에 걸리지 않게 담담하게 적는다. */
function photoIntro(nth: string): string {
  return `${nth} image = a reference PHOTO of the person to paint, given only for likeness. Paint this same person as a friendly picture-book character — recognisable at a glance — as a hand-painted watercolor illustration in the painting style described here, not photorealistic.`;
}

/**
 * 얼굴 클로즈업 줄(lib/family-closeup) — 사진에서 자른 같은 사람 얼굴이라고 못박는다. 두 사람으로 그리거나, 클로즈업의
 * 꽉 찬 얼굴 구도를 따라 얼굴만 크게 그리는 일을 막는다(전신 한 사람은 WHO·FRAMING 줄).
 * 머리 길이·전체 머리 모양은 사진에서 — 클로즈업은 턱 아래를 조금만 남겨(CLOSEUP_MARGIN) 어깨 길이·긴 머리·부푼 파마가
 * 잘린다. 클로즈업에서 머리를 읽으면 단발처럼 짧아진다.
 * 얼굴은 수채화로 — 선명하게 키운 실제 얼굴이라, 막지 않으면 얼굴만 사진처럼(피부 결·빛·그늘) 그리는 일이 있다.
 */
function closeUpLine(nth: string, photoNth: string): string {
  return `${nth} image = a close-up of the same person's face, cropped and enlarged from the ${photoNth} image — use it for the exact face: face shape, eyes, eyebrows, nose, mouth, cheeks, jaw, hairline and fringe. Hair length and the overall hairstyle come from the ${photoNth} image (the crop cuts the hair off). Paint that face in the same watercolor style as the rest of the figure — take only its features, never its photographic skin texture, lighting or shadows. It is the same single person, not a second person, and its tight crop is not the composition — still paint one full-body figure.`;
}

/**
 * LIKENESS FIRST 줄(머리글 '닮음 먼저' ③) — 사진·카드 갈래에서 첫 줄 바로 뒤에 둔다. 그림만 보고 이 사람을 알아봐야 한다는 것을
 * 가장 먼저, 짧게. 두드러진 특징 줄(distinctive)이 있으면 그것을 가리키고, 얼굴 생김새·머리 모양의 출처는 갈래마다(사진·클로즈업 /
 * 카드). 아이는 나이·머리 색 규칙이 여전히 이긴다고 덧붙인다(ageFromWho — 부모가 나이를 알려 줬을 때만 나이까지).
 * 아이 쪽 말·가족 말은 넣지 않는다 — 실제 사람 사진과 섞이면 안전 검사에 걸리기 쉽다(머리글 ①).
 * '또렷이'가 과장으로 번지지 않게 '실제 그대로, 과장·캐리커처 금지'를 같은 줄에 두고(홑꺼풀 → 가느다란 눈 캐리커처 같은
 * 고정관념 그림을 막는다), 얼굴을 보이려고 머리를 키우지 않게 머리 크기는 PROPORTIONS 줄에서만이라고 적는다(사장님 2026-09-29
 * "아빠만 머리가 너무 크게"). 클로즈업이 있어도 머리 모양은 사진에서(클로즈업은 머리를 자른다 — closeUpLine).
 */
function likenessFirst(
  source: "photo" | "card",
  o: { distinctive: boolean; closeUp: boolean; kid: boolean; ageFromWho: boolean },
): string {
  const whom = source === "photo" ? "the person in the reference photo" : "the person described in the LIKENESS SPEC below";
  const traits = o.distinctive
    ? "Keep their distinctive traits (the 'distinctive' line of the LIKENESS SPEC below) clearly visible"
    : source === "photo"
      ? "Keep whatever makes their face distinctive clearly visible"
      : "Keep every trait in the LIKENESS SPEC below clearly visible";
  const from =
    source === "photo"
      ? o.closeUp
        ? "as in the photo, with the face details from its face close-up"
        : "as in the photo"
      : "exactly as the LIKENESS SPEC describes";
  const kidNote = !o.kid
    ? ""
    : o.ageFromWho
      ? " Age and hair colour still follow the WHO line and the hair-colour rule below."
      : " Hair colour still follows the hair-colour rule below.";
  return `LIKENESS FIRST — top priority: anyone who knows ${whom} must recognise this exact person at a glance from the painting alone. ${traits}, true to life — never exaggerated or caricatured; keep the face shape, eye shape, size and spacing, eyebrows, nose, mouth, cheeks, jaw, hairline and hairstyle ${from}. The watercolor picture-book style changes only the rendering (brushwork, soft washes), never who they are. Head size comes only from the PROPORTIONS line — never enlarge the head to show the face.${kidNote}`;
}

/**
 * 옷 — 사진·카드 갈래는 'fully clothed' 를 쓰지 않는 대신(실제 사람 사진과 섞이면 오히려 걸린다) 평범한 옷을 늘 입힌다고
 * 긍정문으로만 적는다. 물놀이·잠옷 사진이어도 그 옷을 따르지 않는다. 드러낸 옷차림 낱말은 프롬프트에 넣지 않는다(아이 나이 줄
 * 옆에 놓이면 그 자체가 안전 검사에 걸릴 수 있다).
 */
const CLOTHES_PHOTO =
  "CLOTHES: always ordinary everyday clothes — a top with trousers, a skirt or a dress, and shoes. Follow the appearance line for clothes when it gives them; otherwise take only the colours of their everyday clothes from the photo, and if the photo does not show ordinary everyday clothes, paint simple everyday clothes in soft colours.";
const CLOTHES_CARD =
  "CLOTHES: always ordinary everyday clothes — a top with trousers, a skirt or a dress, and shoes — in the colours the appearance line or the LIKENESS SPEC gives, or in soft colours if neither gives any.";

/**
 * 사진으로 그릴 때의 규칙 — 닮게 할 것(얼굴·머리·안경·수염·피부·나이·옷 색 + 얼굴 비율)과 가져오지 말 것(배경·빛·다른 사람·
 * 물건·마스크·선글라스·모자)을 가른다. 얼굴 비율은 일반 그림책 얼굴로 바꾸지 않고 사진 그대로 — 단순하게 하는 건 붓질뿐.
 * ageFromWho — 아이 나이를 부모가 알려 줬다: 나이는 사진에서 따르지 않는다(세 살 때 사진으로 일곱 살을 그리는 일이 흔하다).
 * closeUp — 얼굴 클로즈업이 붙었다: 닮음의 출처에 넣고, 가져오지 말 것(구도·빛 …)도 클로즈업까지 넓힌다.
 */
function photoRules(withCard: boolean, ageFromWho: boolean, closeUp: boolean): string[] {
  const sources = ["the photo", ...(closeUp ? ["its face close-up"] : []), ...(withCard ? ["the LIKENESS SPEC"] : [])];
  const from = sources.length > 1 ? `${sources.slice(0, -1).join(", ")} and ${sources[sources.length - 1]}` : sources[0];
  return [
    `LIKENESS from ${from} — keep what makes them recognisable: hairstyle, hair length, hair colour, fringe and parting, face shape, eye shape, eyebrows, nose, mouth, glasses, beard or moustache, skin tone, body build, ${ageFromWho ? "" : "apparent age, "}and the colours of their usual clothes.`,
    ageFromWho
      ? "Age comes only from the WHO line below, never from the photo — the photo may have been taken at a different age."
      : "",
    // 사진 그대로는 '얼굴' 비율만 — 머리:키는 표(PROPORTIONS 줄)를 따른다. 실제 다섯 살 사진은 1:5 쯤인데 표는 1:4 다.
    `Keep the face proportions faithful to the photo${closeUp ? " and its face close-up" : ""} — face length and width, jaw and chin, cheek fullness, eye size, shape and spacing, eyebrow shape, nose and mouth size — rather than a generic picture-book face. Simplify only the rendering (clean contour, soft washes), never the face proportions, and never exaggerate or caricature a feature. The head-to-height ratio of the whole figure follows the PROPORTIONS line, not the photo.`,
    `From the photo${closeUp ? " and the close-up" : ""} NEVER copy: the background or place, the lighting, shadows or colour cast, the camera angle, crop or pose, any other person or animal, objects, text or logos, or anything held in the hands. Leave out temporary things too — face masks, sunglasses, hats or caps, headphones, bags — unless the appearance line asks for them.`,
    "If the photo shows only the face or upper body, complete the rest simply: everyday clothes in the colours that are visible, plain simple shoes. If more than one person is in the photo, draw only the main person in the middle.",
    CLOTHES_PHOTO,
  ].filter(Boolean);
}

/** 카드의 두드러진 특징 줄 머리(lib/family-photo-card readFeatureCard 꼴) */
const DISTINCTIVE = "- distinctive: ";

/** 카드에 두드러진 특징 줄이 있나 */
function hasDistinctive(card: string | null): boolean {
  return card !== null && card.split("\n").some((line) => line.startsWith(DISTINCTIVE));
}

/** 카드에 좌우 말이 있나 — 'image-left' 도 걸린다(- 는 낱말 경계) */
const SIDE_WORD = /\b(left|right)\b/i;

/**
 * 특징 카드 묶음 — 사진 갈래면 '사진에서 읽은', 카드 갈래(사진 없이)면 '사진을 보고 적어 둔' 특징.
 * 어긋나면 WHO 줄(부모가 알려 준 역할·나이)과 머리 색 규칙(아이는 까만·짙은 갈색만)이 이긴다.
 * 좌우 — 카드는 사진을 보는 쪽 기준(image-left/right, lib/family-photo-card)으로 적는다. 그리는 쪽은 'left eye' 를 그 사람의
 * 왼쪽으로 읽기 쉬워 점·가르마가 반대로 간다. 카드에 좌우 말이 있을 때만 '보는 쪽 기준'이라고 한 줄 붙인다(그림도 정면이라 같다).
 */
function cardBlock(card: string, source: "photo" | "card"): string {
  const distinctive = hasDistinctive(card) ? " The 'distinctive' line matters most." : "";
  return [
    source === "photo"
      ? `LIKENESS SPEC — this person's recognisable traits, read from the reference photo. Match every trait exactly; together with the photo it is the main likeness guide.${distinctive}`
      : `LIKENESS SPEC — this person's recognisable traits, noted from a photo of them. Match every trait exactly; it is the main likeness guide.${distinctive}`,
    card,
    SIDE_WORD.test(card)
      ? "Left and right in the spec (image-left / image-right) mean the left and right side of the picture as the viewer sees it, not the person's own left and right."
      : "",
    "Where the spec disagrees with the WHO line or the hair-colour rule below, the WHO line and the hair-colour rule win.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** 아이 쪽 말 — 어른 프롬프트의 특징 카드에서 이런 말이 든 줄은 뺀다(실제 사람 사진 + 아이 쪽 말은 안전 검사에 걸리기 쉽다). */
const CHILD_WORDS =
  /\b(child(ren)?|kids?|bab(y|ies)|toddlers?|infants?|sons?|daughters?|grandchild(ren)?|grandsons?|granddaughters?)\b/i;

/**
 * 특징 카드(lib/family-photo-card readFeatureCard 결과)를 이 사람에게 맞게 거른다. 남는 줄이 없으면 null.
 *  어른 : 아이 쪽 말(CHILD_WORDS)이 든 줄을 뺀다 — 머리글 ①을 카드가 되살리지 않게. 두드러진 특징 줄만은 그 말이 든 특징만
 *    뺀다('baby face; thick straight eyebrows' → 'thick straight eyebrows') — 닮음에 가장 중요한 줄을 통째로 잃지 않게.
 *  아이·청소년 : 부모가 알려 준 나이·성별이 WHO 줄에 있으면 카드의 age·gender 줄을 뺀다 — 사진은 다른 나이 때일 수 있고,
 *    아이 나이·성별·체형 줄이 한데 놓이는 것도 피한다. 부모가 안 알려 줬으면 카드 것을 둔다(기댈 게 그것뿐이다).
 */
export function cardFor(input: PortraitInput, card: string | null): string | null {
  if (!card) return null;
  const kid = isKid(input);
  const ageGiven = typeof input.age === "number";
  const genderGiven = genderOf(input) !== undefined;
  const lines = card.split("\n").flatMap((line) => {
    if (!kid) {
      if (!CHILD_WORDS.test(line)) return [line];
      if (!line.startsWith(DISTINCTIVE)) return [];
      const kept = keepTraits(line.slice(DISTINCTIVE.length), CHILD_WORDS);
      return kept ? [`${DISTINCTIVE}${kept}`] : [];
    }
    if (ageGiven && line.startsWith("- age:")) return [];
    if (genderGiven && line.startsWith("- gender:")) return [];
    return [line];
  });
  return lines.length ? lines.join("\n") : null;
}

/* ─────────────────────────────── 프롬프트 ─────────────────────────────── */

/**
 * 비율 견본 그림 줄 — 머리:키 비율만 가져가고 나머지(마네킹 몸 모양·회색·줄·빈 얼굴)는 절대 그리지 않게.
 * ratio 는 이 사람의 표 비율(headChartRatio) — PROPORTIONS 줄(identityOf)과 같은 값이다.
 * 마네킹은 머리카락이 없는 달걀 머리라, 그리는 사람의 머리는 **머리카락 맨 위 ~ 턱**으로 적는다 — 그린 뒤 재기
 * (lib/family-head-check)가 재는 방식과 같다. 달걀을 두개골에 맞추고 머리카락을 얹으면 파마·숱 많은 머리가 15~20% 커져
 * '머리가 크다'로 잘못 잡혀 값(약 95원)을 들여 다시 그리게 된다.
 * 자세는 따라 해도 되는 자세(정면·팔을 조금 벌림)라 '자세를 베끼지 말라'고 하지 않는다 — POSE 줄과 어긋나지 않게.
 */
function guideLine(nth: string, ratio: number): string {
  return `${nth} image = PROPORTION GUIDE only — a plain grey mannequin whose head is exactly ${ratioText(ratio)} of its full height; the faint horizontal lines mark each head-height. Give the person you paint exactly this ratio: their head, from the top of the hair to the chin, is ${ratioText(ratio)} of their height from the top of the hair to the soles of the shoes. NEVER copy anything else from it — not its stiff mannequin shape (the pose comes from the POSE line), grey colour, lines, blank face, body shape or plain look; it is only a measuring guide and nothing of it appears in the picture.`;
}

/**
 * 영어로 적는다 — 규칙은 영어가 더 확실히 읽힌다. 부모가 고른 생김새(한국어)만 그대로 인용한다.
 * 이름·호칭은 넣지 않는다(그림에 글자로 써 버리는 일이 있다).
 *
 * attached 는 portraitReferences 가 고른 것 그대로 넘긴다(붙인 순서 = FIRST·SECOND·THIRD·FOURTH).
 * card — 특징 카드(lib/family-photo-card readFeatureCard 결과). 사진과 똑같이 다룬다: 프롬프트로만 넘기고 남기지 않는다.
 *  이 사람에게 맞게 거른 뒤(cardFor — 어른은 아이 쪽 말 줄, 아이는 부모가 알려 준 나이·성별 줄을 뺀다) 적는다.
 *  - 사진이 붙으면(photo) 사진·카드가 얼굴·머리·안경·체형을 정하고, 생김새 줄은 덧붙이는 안내가 된다 — 어긋나면 얼굴 쪽은 사진,
 *    평소 옷은 생김새 줄. '안 적은 건 그리지 말라'도 '사진에도 없고 적지도 않은 것'으로 바뀐다(사진 속 안경·수염은 그린다).
 *    얼굴 클로즈업이 붙으면(closeUp) 사진 바로 뒤 줄에 '같은 사진에서 자른 같은 사람 얼굴'로 적는다.
 *  - 사진 없이 카드만(대신 그리기) — 카드가 사진 자리를 맡는다. 같은 가족 그림은 그림체만 맞춘다(얼굴 양식은 카드).
 *  - 사진·카드 갈래는 첫 줄 바로 뒤에 LIKENESS FIRST 줄(likenessFirst)을 둔다. 칩 갈래에는 없다.
 *  - 둘 다 없으면 칩 — 예전 글에서 머리 비율 쪽만 바뀌었다(머리글 chips: 비율 견본 줄, 같은 가족 그림 줄의 비율 말,
 *    어른 PROPORTIONS 줄).
 */
export function buildPrompt(input: PortraitInput, attached: Attached, card: string | null = null): string {
  const style = ART_STYLES.find((s) => s.id === "watercolor") ?? ART_STYLES[0];
  const order = refOrder(attached);
  const nth = (k: RefKind) => ["FIRST", "SECOND", "THIRD", "FOURTH"][order.indexOf(k)] ?? "attached";
  const has = (k: RefKind) => order.includes(k);
  const spec = cardFor(input, card);
  const source: Source = has("photo") ? "photo" : spec ? "card" : "chips";
  const id = identityOf(input, source);
  const kid = isKid(input);
  // 아이 나이를 부모가 알려 줬으면 나이는 WHO 줄만 — 사진에서 따르지 않는다
  const ageFromWho = kid && typeof input.age === "number";
  // 머리 크기·몸 비율을 어디서 따르나 — 같은 가족 그림(대개 아이 그림, 1:4)에서 따르면 어른 머리가 커진다
  const proportionSource = `the PROPORTIONS line${has("guide") ? " and the proportion guide" : ""}`;

  const appearance =
    source === "photo"
      ? [
          input.looks
            ? `APPEARANCE LINE — chosen by the family and written in Korean, extra guidance on top of the photo: "${input.looks}". Where it disagrees with the photo${spec ? " or the LIKENESS SPEC" : ""} about the face, hair, glasses or body, follow the PHOTO; for everyday clothes, follow this line.`
            : "",
          "Glasses follow the PHOTO: draw ordinary glasses only if the person wears them in the photo (never sunglasses), whatever the appearance line says about 안경.",
          "DO NOT invent anything that is neither in the photo nor written above: no glasses, beard, moustache, stubble, hat, cap, hair clip, hair band, earrings, necklace, bag, mole, freckles or tattoo unless it is clearly there. One invented accessory and the portrait no longer looks like them.",
        ]
      : source === "card"
        ? [
            input.looks
              ? `APPEARANCE LINE — chosen by the family and written in Korean: "${input.looks}". Where it disagrees with the LIKENESS SPEC about the face, hair, glasses or body, follow the SPEC; for everyday clothes, follow this line.`
              : "",
            "Glasses follow the LIKENESS SPEC: a described frame means ordinary glasses (never sunglasses); none means no glasses. Only if the spec has no glasses line, draw glasses when the appearance line says 안경을 썼다.",
            "DO NOT invent anything that is neither in the LIKENESS SPEC nor written above: no glasses, sunglasses, beard, moustache, stubble, hat, cap, hair clip, hair band, earrings, necklace, bag, mole, freckles or tattoo unless it is written. One invented accessory and the portrait no longer looks like them.",
          ]
        : [
            input.looks
              ? `APPEARANCE — chosen by the family and written in Korean. Follow it literally, item by item, and keep every written trait clearly visible: "${input.looks}"`
              : "No appearance details were given — draw a simple, ordinary everyday look: tidy natural hair, simple everyday clothes in one soft colour, no accessories, no glasses.",
            input.looks
              ? "If it says 안경을 쓰지 않는다 they do NOT wear glasses; draw glasses only when it says 안경을 썼다."
              : "",
            "DO NOT invent anything that is not written above: no glasses, sunglasses, beard, moustache, stubble, hat, cap, hair clip, hair band, earrings, necklace, bag, mole, freckles or tattoo unless that exact item is written. This is the child's real family — one invented accessory and the child no longer recognises them.",
          ];

  return [
    source === "chips"
      ? `One full-body character portrait of a single person for a Korean children's picture book, ${style.prompt}.`
      : `One full-body character portrait of a single person for a Korean picture book, ${style.prompt}.`,
    source !== "chips"
      ? likenessFirst(source, { distinctive: hasDistinctive(spec), closeUp: has("closeUp"), kid, ageFromWho })
      : "",
    has("photo") ? photoIntro(nth("photo")) : "",
    has("closeUp") ? closeUpLine(nth("closeUp"), nth("photo")) : "",
    has("sample")
      ? `${nth("sample")} image = painting-style sample only (never copy its people, animals, subject, pose or composition). Copy only HOW it is painted: medium, brush and line quality, edge softness, colour palette, shading and paper finish.`
      : "",
    has("sibling")
      ? source === "card"
        ? `${nth("sibling")} image = another member of the same family already painted — match the SAME artist hand, line weight and rendering, but NEVER copy that person's face, face shape, hair, clothes or body proportions. The person you draw now is someone else and must look like the LIKENESS SPEC; head size and body proportions come only from ${proportionSource}.`
        : `${nth("sibling")} image = another member of the same family already painted — match the SAME artist hand, line weight, face style and rendering, but NEVER copy that person's face, hair, clothes or body proportions. The person you draw now is someone else; head size and body proportions come only from ${proportionSource}.`
      : "",
    has("guide") ? guideLine(nth("guide"), headChartRatio(input.role, input.age)) : "",
    spec && source !== "chips" ? cardBlock(spec, source) : "",
    ...(source === "photo" ? photoRules(Boolean(spec), ageFromWho, has("closeUp")) : []),
    source === "card"
      ? "Keep the face shape and proportions the LIKENESS SPEC describes — face shape, eye shape and size, eyebrows, nose, mouth, cheeks and jaw — rather than a generic picture-book face; never exaggerate or caricature a feature."
      : "",
    source === "card" ? CLOTHES_CARD : "",
    `WHO: exactly one person — ${id.who}. ${id.ageRule}`,
    id.sexRule,
    ...appearance,
    id.hairRule,
    "Hair texture is a hard identity trait: straight hair stays completely straight with no curls or perm volume; wavy, curly and permed hair stay clearly different from one another.",
    `PROPORTIONS: ${id.proportion}${has("guide") ? ` The ${nth("guide")} image (proportion guide) shows exactly this head-to-height ratio.` : ""}`,
    // 손이 몸에 닿으면 팔과 몸 사이 흰 틈이 갇혀 바탕 지우기가 못 닿는다 — 작은 틈을 두게 한다.
    "POSE: front view facing the viewer, relaxed natural standing pose, arms hanging loosely at the sides with a small gap between each arm and the body (hands not touching the body), feet slightly apart, soft gentle smile, eyes open looking at the viewer.",
    "FRAMING: 3:4 portrait. The WHOLE body — from the top of the hair to the soles of the shoes — is inside the picture and centred, with clear empty margin above the head, below the shoes and on both sides (roughly 6–10% of the picture on every side). Nothing touches or is cut off by an edge.",
    "BACKGROUND: one flat pure white colour (#FFFFFF) everywhere around the figure. The cream paper tone belongs to the figure's painting only — the empty background is pure white: no paper texture, no wash, no vignette, no floor or ground line, no cast or drop shadow, no props, no scenery, no frame or border.",
    "The figure is cut out of the white background automatically afterwards, so: keep one continuous thin contour line around the whole silhouette (hair, hands and shoes included); clothes are never pure white or off-white — if a white garment is written, paint it as a clearly shaded very light grey so it still reads as white; white or grey hair is painted light grey with soft blue-grey shading and outlined, never paper-white.",
    "NO text anywhere: no name, no title, no letters, no numbers, no labels, no speech bubble, no signature, no watermark.",
    // 칩은 예전 그대로. 사진·카드 갈래는 'innocent·fully clothed' 같은 말을 쓰지 않는다 — 실제 사람 사진과 섞이면 오히려 걸린다.
    source === "chips" ? "Wholesome, innocent, fully clothed, child-friendly." : "A warm, friendly look in ordinary everyday clothes.",
  ]
    .filter(Boolean)
    .join("\n");
}

/* ─────────────────────────────── 대신 그리기(사진 거절 뒤) ─────────────────────────────── */

/**
 * 대신 그리기(사진 없이)를 시작하려면 그리기 몫으로 최소 이만큼 남아 있어야 한다. 한 장에 보통 20~30초 —
 * 이보다 짧으면 끝나기 전에 끊겨(구글 값은 나가고) '시간 초과'가 되니, 차라리 바로 되돌리고 알린다.
 */
export const PHOTO_FALLBACK_MIN_MS = 20_000;

/**
 * 그림 모델이 사진 갈래를 거절했나 — 그림 없는 답(안전 검사 멈춤 IMAGE_SAFETY·PROHIBITED_CONTENT … · 글만 옴),
 * 요청 차단(422 blockReason), 사진을 못 읽음(400). 몰림(429)·서버 문제(5xx)·시간 초과는 사진 탓이 아니라 아니다.
 */
export function photoRefused(e: unknown): boolean {
  return e instanceof GeminiError && (Boolean(e.noImage) || e.status === 422 || e.status === 400);
}

/**
 * 사진이 거절된 뒤 같은 요청(같은 쿠키)에서 사진 없이 한 번 더 그릴지, 무엇으로 그릴지.
 *  features : 특징 카드가 있다 → 카드(+칩)로. 사진에서 읽은 생김새라 '사진으로 그린 그림'으로 친다.
 *  looks    : 카드는 없고 칩은 골랐다 → 칩으로(칩으로 그릴 때와 같다).
 *  null     : 카드도 칩도 없거나(누구를 그릴지 모른다 — 아무나 그려 값을 받지 않는다) 시간이 모자라다 → 되돌리고 알린다.
 */
export function photoFallbackPlan(o: { card: string | null; looks: string; msLeft: number }): PhotoFallback | null {
  if (!(o.msLeft >= PHOTO_FALLBACK_MIN_MS)) return null;
  if (o.card) return "features";
  if (o.looks.trim()) return "looks";
  return null;
}
