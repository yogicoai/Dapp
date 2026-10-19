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
 *    (2026-09-30: 주근깨·점 칸과 앞머리 칸이 더해졌고, 카드에 있는 특징이 흔히 어긋나는 쪽을 막는 줄이 붙는다 — 아래 '어긋나기
 *    쉬운 쪽 막기'.)
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
 * 사진의 구도가 머리 크기를 정하지 않게(2026-09-29 오후 사장님 "엄마 비율이 이상해졌어" — 얼굴이 꽉 찬 셀카 같은 사진으로 그린
 * 엄마가 표 1:7 인데 1:4.15, 다시 그려도 1:4.41): 사진 규칙 줄에 '얼굴·윗몸만 보이는 사진(얼굴이 꽉 찬 셀카)이어도 전신을
 * PROPORTIONS 비율로 — 얼굴이 꽉 찬 사진이 큰 머리라는 뜻이 아니다, 사진의 구도·거리는 머리 크기를 정하지 않는다'를, 클로즈업
 * 줄에 '꽉 찬 구도는 머리 크기도 아니다'를, 사진 갈래 PROPORTIONS 줄 끝에 '사진이 어떻게 잘렸든 이 비율은 그대로'를 적는다.
 * 몸 부위 말(몸통·다리)은 사진 갈래에 넣지 않는다(실제 사람 사진 옆의 몸 말은 안전 검사에 걸리기 쉽다 — '전신'으로만).
 *
 * 머리 비율 다시 그리기(headRedrawRecipe, 같은 날 오후 사장님 승인): 그린 뒤 잰 머리가 표에서 많이 벗어나 다시 그릴 때는 사진을
 * 다시 보내지 않는다 — 사진이 머리를 크게 당기는 버릇을 되풀이했다. 참고 그림은 **처음 그림(첫째) + 비율 견본(둘째)**뿐이고,
 * 프롬프트는 '첫째 그림의 이 캐릭터를 그대로(얼굴·머리 모양·머리 색·안경·피부·몸집·옷·색·수채화 붓질), 비율만 고쳐: 머리(머리카락
 * 맨 위 ~ 턱)는 키의 1/X(X 등신), 머리 높이는 처음 그림의 약 N%, 목·몸통·다리를 고르게 늘려(줄여)'. 얼마나 줄일지 숫자가
 * 없으면 모델이 처음 그림을 거의 그대로 베낀다. 칩·사진·대신 그리기 모두 같다. 그림체 견본은 붙이지 않는다 —
 * 처음 그림이 이미 그 그림체이고, 견본(앉은 여우)은 머리가 아주 커서 머리를 다시 키우는 쪽으로 당길 수 있다.
 * 이 프롬프트에는 사진이 없어(우리가 그린 그림뿐) 사장님이 정한 대로 몸 부위 말을 쓴다. 아이 쪽 말·사진 말은 없다.
 * 카드 말은 되돌렸다(2026-09-30 사장님 "100% 비슷하단 느낌이 덜한데"): 처음 그림만 보고 다시 그리면 처음 그림이 어긋난 것
 * (두꺼운 앞머리·둥근 얼굴·큰 눈 …)을 그대로 베끼고, 두 번째로 뽑으면서 그림책 얼굴 쪽으로 한 번 더 어긋났다. 이제 사진으로
 * 그렸으면(사진·대신 그리기 — 카드가 있을 때) 카드의 얼굴·머리 칸만 글로 다시 적는다(redrawLikeness — 어른: 나이·두드러진
 * 특징·얼굴형·눈·눈썹·코·입·볼과 턱·피부 점·머리·앞머리 / 아이: 얼굴형·볼과 턱·피부 점·앞머리). 옷·몸집·안경·수염·성별은 여전히
 * 다시 적지 않는다('처음 그림 그대로·never add any'와 부딪히지 않게 — 두드러진 특징 줄에 섞인 안경·수염 말도 뺀다). 이 줄이
 * 붙으면 FIRST 줄도 '얼굴·머리는 닮음 줄이 바로잡는 곳만 바꾼다'로 바뀐다(예전 FIRST 줄의 '얼굴 그대로, 바꾸는 건 비율뿐'이
 * 닮음 줄을 이겼다). 사진·클로즈업은 여전히 다시 보내지 않는다. 칩 갈래는 그대로.
 *
 * 얼굴 픽셀: 3:4 1K(약 896×1200) 전신이라 얼굴이 작다. 머리 비율은 가족끼리 키가 맞아야 해서 키우지 않는다.
 * (얼굴 클로즈업은 그림 모델이 **보는** 얼굴을 키운다 — 그리는 얼굴 크기는 그대로다.)
 * gemini-3.1-flash-image 는 imageConfig.imageSize '2K' 를 받지만 값이 다르다(1K 장당 약 $0.067 ≈ 95원 → 2K 약 $0.101 ≈ 143원,
 * 2026-09-15 가격표 기준) — 같은 값이 아니라서 켜지 않았다. 켜려면 사장님 결정이 먼저다(lib/gemini generateImage 에 칸이 없다).
 */

import { ART_STYLES } from "./art-styles.ts";
import { heroIdentity } from "./child-looks.ts";
import { siblingGender, type FamilyRole } from "./family.ts";
import { ADULT_HEAD_RATIO, TEEN_HEAD_RATIO, headChartRatio, kidHeadRatio, ratioText, type HeadFix } from "./family-head.ts";
import type { PhotoFallback } from "./family-photo.ts";
import { BODY_PART, keepTraits, stripNegatedMarks } from "./family-photo-card.ts";
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
  /**
   * 펜선 또렷한 수채화로 그린다(아래 PENLINE). 서버(api/family/portrait)는 모든 회원에게 켜고, fe 만 비교용으로 끌 수 있다.
   * 없거나 false 면 예전 수채화 글 그대로다(이 파일만 놓고 보면 기본은 수채화 — 켜는 쪽은 라우트).
   */
  penline?: boolean;
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

/* ─────────────────────────────── 펜선 또렷한 수채화(fe 시험) ─────────────────────────────── */

/**
 * 사장님(2026-10-19): "아이 얼굴이 더 비슷하게 캐릭터로 연출된다면 그걸로 선택하는 것도 나쁘지 않겠다" → '펜선 또렷한 수채화'를
 * fe 계정에서 먼저 시험했고("이게 더 근접"), 같은 날 "전체에 반영"으로 모든 회원의 기본이 됐다(라우트가 켠다, fe 만 끌 수 있다). 번지는 수채(soft bleeding edges)가 눈매·코·입을 흐려 닮음이
 * 약해지는 것을 줄이려고, 책 기준 그림체(빨간 모자 — 갈색 펜선 + 투명 수채)와 같은 결로 이목구비를
 * 가는 펜선으로 또렷이 긋는다. 바뀌는 것:
 *  · 그림체 글(PENLINE_STYLE_PROMPT)과 얼굴 펜선 줄(PENLINE_FACE_LINE — 실제 눈 모양·크기, 점 눈·큰 만화 눈 금지)
 *  · 사진·클로즈업·LIKENESS FIRST 줄의 'watercolor' 말을 'ink-and-watercolor' 로
 *  · 그림체 견본: 점 눈 여우(style_01) 대신 빨간 모자 1쪽(PENLINE_SAMPLE) — 견본의 얼굴·인물은 따르지 말라고 붙인다
 *  · 같은 가족 그림(옛 수채화)은 붙이지 않는다(라우트) — 옛 결로 당기지 않게
 * 머리 비율 다시 그리기도 같은 그림체 글을 쓴다. 기본(수채화) 갈래의 글은 그대로다.
 */
export const PENLINE_SAMPLE = "/art-styles/penline-sample.webp";
const PENLINE_STYLE_PROMPT =
  "classic storybook ink-and-watercolor illustration: confident fine dark sepia-brown ink pen outlines around the whole figure, the clothes and every facial feature, with transparent watercolor washes laid inside the lines on cream paper; crisp edges with little bleeding, especially on the face; warm muted palette (peach, ochre, sage), light left unpainted for highlights, matte paper finish";
const PENLINE_FACE_LINE =
  "INK LINE FACE: draw the face with clear, fine ink lines exactly where the real face has them — the upper eyelid and lash line, the iris and pupil, the eyebrows, the side of the nose and the nostrils, the line between the lips, the jaw line and the ears — keeping their real shape, size and spacing. Real eye shape and size: never dot eyes, never oversized cartoon eyes. Light, flat watercolor washes on the skin; no heavy shading that hides the features.";
const PENLINE_SAMPLE_NO_FACE = " Never copy its people, faces or face style — take only its ink line, washes, palette and paper.";

/** 첫 줄의 그림체 글 — 기본은 ART_STYLES 수채화 그대로 */
function stylePromptFor(penline: boolean | undefined): string {
  if (penline) return PENLINE_STYLE_PROMPT;
  return (ART_STYLES.find((s) => s.id === "watercolor") ?? ART_STYLES[0]).prompt;
}

/* ─────────────────────────────── 사진·특징 카드 규칙 ─────────────────────────────── */

/** 사진 갈래 첫 줄 — 사진이 무엇이고 무엇을 그리는지. 안전 검사에 걸리지 않게 담담하게 적는다. */
function photoIntro(nth: string, penline = false): string {
  const medium = penline ? "a hand-drawn ink-and-watercolor illustration" : "a hand-painted watercolor illustration";
  return `${nth} image = a reference PHOTO of the person to paint, given only for likeness. Paint this same person as a friendly picture-book character — recognisable at a glance — as ${medium} in the painting style described here, not photorealistic.`;
}

/**
 * 얼굴 클로즈업 줄(lib/family-closeup) — 사진에서 자른 같은 사람 얼굴이라고 못박는다. 두 사람으로 그리거나, 클로즈업의
 * 꽉 찬 얼굴 구도를 따라 얼굴만 크게 그리는 일을 막는다(전신 한 사람은 WHO·FRAMING 줄) — 꽉 찬 구도가 머리 크기도 아니라고
 * 못박는다(머리 크기는 PROPORTIONS 줄).
 * 머리 길이·전체 머리 모양은 사진에서 — 클로즈업은 턱 아래를 조금만 남겨(CLOSEUP_MARGIN) 어깨 길이·긴 머리·부푼 파마가
 * 잘린다. 클로즈업에서 머리를 읽으면 단발처럼 짧아진다.
 * 얼굴은 수채화로 — 선명하게 키운 실제 얼굴이라, 막지 않으면 얼굴만 사진처럼(피부 결·빛·그늘) 그리는 일이 있다.
 */
function closeUpLine(nth: string, photoNth: string, penline = false): string {
  const paint = penline ? "Draw that face in the same ink-and-watercolor style" : "Paint that face in the same watercolor style";
  return `${nth} image = a close-up of the same person's face, cropped and enlarged from the ${photoNth} image — use it for the exact face: face shape, eyes, eyebrows, nose, mouth, cheeks, jaw, hairline and fringe. Hair length and the overall hairstyle come from the ${photoNth} image (the crop cuts the hair off). ${paint} as the rest of the figure — take only its features, never its photographic skin texture, lighting or shadows. It is the same single person, not a second person, and its tight crop is neither the composition nor the head size — still paint one full-body figure at the PROPORTIONS head-to-height ratio.`;
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
  o: { distinctive: boolean; closeUp: boolean; kid: boolean; ageFromWho: boolean; penline?: boolean },
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
  return `LIKENESS FIRST — top priority: anyone who knows ${whom} must recognise this exact person at a glance from the painting alone. ${traits}, true to life — never exaggerated or caricatured; keep the face shape, eye shape, size and spacing, eyebrows, nose, mouth, cheeks, jaw, hairline and hairstyle ${from}. ${o.penline ? "The ink-and-watercolor picture-book style changes only the rendering (ink line, washes)" : "The watercolor picture-book style changes only the rendering (brushwork, soft washes)"}, never who they are. Head size comes only from the PROPORTIONS line — never enlarge the head to show the face.${kidNote}`;
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
 * 캐릭터 그림에는 모자·머리 장식·액세서리를 그리지 않는다 — 사진에 있어도, 생김새 줄에 있어도(사장님 2026-10-14 "캐릭터 생성할 때
 * 모자를 쓰고 있다고 해서 모자를 생성해 주면 안 돼", "악세사리가 차 있으면 안 되는 거임", "의상은 똑같이 해도 상관없지만 모자 정도는
 * 빠져야"). 이 그림이 모든 동화의 기준이라 모자를 쓴 사진이면 모든 쪽에 모자가 따라다닌다. 옷은 그대로, 안경은 얼굴이라 그대로.
 * 화면도 생김새 줄에서 늘 하는 것·늘 지니는 것을 빼고 보낸다(components/family/family-ui looksLine).
 * 그 그림에 실제로 있는 근거만 부른다 — 카드가 없는 그림에 'LIKENESS SPEC' 말을 넣지 않는다. 'scarf' 는 쓰지 않는다
 * (아이 그림의 흉터 말 거르기 /\bscar/ 에 걸린다 — neckerchief·muffler 로).
 */
function noAccessories(source: Source, spec: boolean): string {
  const from =
    source === "photo"
      ? spec
        ? "the photo, the LIKENESS SPEC or the appearance line"
        : "the photo or the appearance line"
      : source === "card"
        ? "the LIKENESS SPEC or the appearance line"
        : "the appearance line";
  return `NO HEADWEAR OR ACCESSORIES — this portrait is their base look in every book: never draw a hat, cap, beanie, hood, helmet, hair clip, hair pin, hair band, headband, ribbon or bow, earrings, necklace, bracelet, ring, watch, neckerchief or muffler, sunglasses, face mask, headphones or bag, even if ${from} shows or mentions one. If a hat or hood hides the hair, paint simple natural hair in the hair colour and length that can be seen. Ordinary everyday glasses are part of the face, not an accessory — they follow the glasses rule.`;
}

/**
 * 사진으로 그릴 때의 규칙 — 닮게 할 것(얼굴·머리·안경·수염·피부·나이·옷 색 + 얼굴 비율)과 가져오지 말 것(배경·빛·다른 사람·
 * 물건·마스크·선글라스·모자)을 가른다. 얼굴 비율은 일반 그림책 얼굴로 바꾸지 않고 사진 그대로 — 단순하게 하는 건 붓질뿐.
 * ageFromWho — 아이 나이를 부모가 알려 줬다: 나이는 사진에서 따르지 않는다(세 살 때 사진으로 일곱 살을 그리는 일이 흔하다).
 * closeUp — 얼굴 클로즈업이 붙었다: 닮음의 출처에 넣고, 가져오지 말 것(구도·빛 …)도 클로즈업까지 넓힌다.
 * 얼굴·윗몸만 보이는 사진 줄 — 사진의 구도·거리가 머리 크기를 정하지 않는다고 못박는다(머리글 '사진의 구도가 머리 크기를
 * 정하지 않게'). 몸 부위 말 없이 '전신(whole figure)'으로만.
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
    `From the photo${closeUp ? " and the close-up" : ""} NEVER copy: the background or place, the lighting, shadows or colour cast, the camera angle, crop or pose, any other person or animal, objects, text or logos, or anything held in the hands. Leave out temporary things too — face masks, sunglasses, headphones, bags — and every hat or accessory (NO HEADWEAR OR ACCESSORIES).`,
    "Even if the photo shows only the face or upper body — a selfie or tight shot where the face fills most of the picture — paint the whole figure at the PROPORTIONS head-to-height ratio: a face-filling photo does NOT mean a big head, and the photo's crop or camera distance never sets the head size. Complete the rest simply: everyday clothes in the colours that are visible, plain simple shoes. If more than one person is in the photo, draw only the main person in the middle.",
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
/** 카드의 좌우는 보는 쪽 기준이라는 줄 — 처음 그리기(cardBlock)와 머리 비율 다시 그리기(redrawLikeness)가 같은 글을 쓴다. */
const SIDE_LINE =
  "Left and right in the spec (image-left / image-right) mean the left and right side of the picture as the viewer sees it, not the person's own left and right.";

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
    SIDE_WORD.test(card) ? SIDE_LINE : "",
    "Where the spec disagrees with the WHO line or the hair-colour rule below, the WHO line and the hair-colour rule win.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** 아이 쪽 말 — 어른 프롬프트의 특징 카드에서 이런 말이 든 줄은 뺀다(실제 사람 사진 + 아이 쪽 말은 안전 검사에 걸리기 쉽다). */
const CHILD_WORDS =
  /\b(child(ren)?|kids?|bab(y|ies)|toddlers?|infants?|sons?|daughters?|grandchild(ren)?|grandsons?|granddaughters?)\b/i;

/** 카드의 피부 점 줄 머리(주근깨·점·오래된 흉터 — lib/family-photo-card skin marks, 2026-09-30) */
const MARKS = "- skin marks: ";
/** 특징 하나씩 거르는 줄(두드러진 특징·피부 점) — 여러 특징을 세미콜론으로 이어 적은 줄이라 줄째 버리지 않는다 */
const TRAIT_HEADS = [DISTINCTIVE, MARKS];
/**
 * 아이 그림에서 빼는 흉터 말 — 카드는 이제 오래된 흉터를 오래가는 특징으로 적는다(2026-09-30). 아이 나이 줄 옆의 상처 말은
 * 안전 검사에 좋지 않다(lib/family-photo-card PASSING_TRAIT 와 같은 까닭). 어른은 둔다.
 */
const KID_SCAR = /\bscar(s|red)?\b/i;
/**
 * 아이 그림의 두드러진 특징 줄·피부 점 줄에서 특징 하나씩 빼는 말(2026-09-30 검토) — 흉터·화상·꿰맨 자국·수술 같은 상처 말과,
 * 얼굴이 아닌 몸 부위의 점('mole on the upper arm' · 'birthmark on the thigh', BODY_PART). 카드는 이제 얼굴 점만 묻고 몸 쪽 점은
 * 카드 읽기에서도 빼지만, 두드러진 특징 줄에는 남을 수 있다. 몸 부위 말은 점 말이 같이 있을 때만 — 'narrow shoulders' 같은
 * 체형 특징은 두고, 아이 나이 줄 옆에 몸 부위 + 점·상처 말이 놓이는 것만 막는다(KID_SCAR 와 같은 까닭). 두 줄에만 쓴다 — 다른
 * 줄의 'burnt orange' 같은 색 말을 걸지 않게.
 */
const KID_MARK_DROP = new RegExp(
  String.raw`\b(scar(s|red)?|burn\w*|stitch\w*|surger(y|ies)|operations?)\b|^(?=.*\b(freckl\w*|moles?|marks?|spots?|birth ?marks?)\b)(?=.*${BODY_PART.source})`,
  "i",
);

/** 특징 하나씩 거르는 줄이면 drop 에 걸린 특징만 뺀다. 남는 게 없거나 그런 줄이 아니면 줄째 뺀다. */
function traitLine(line: string, drop: RegExp): string[] {
  const head = TRAIT_HEADS.find((h) => line.startsWith(h));
  if (!head) return [];
  const kept = keepTraits(line.slice(head.length), drop);
  return kept ? [`${head}${kept}`] : [];
}

/**
 * 특징 카드(lib/family-photo-card readFeatureCard 결과)를 이 사람에게 맞게 거른다. 남는 줄이 없으면 null.
 *  어른 : 아이 쪽 말(CHILD_WORDS)이 든 줄을 뺀다 — 머리글 ①을 카드가 되살리지 않게. 두드러진 특징 줄·피부 점 줄만은 그 말이 든
 *    특징만 뺀다('baby face; thick straight eyebrows' → 'thick straight eyebrows') — 닮음에 가장 중요한 줄을 통째로 잃지 않게.
 *  아이·청소년 : 부모가 알려 준 나이·성별이 WHO 줄에 있으면 카드의 age·gender 줄을 뺀다 — 사진은 다른 나이 때일 수 있고,
 *    아이 나이·성별·체형 줄이 한데 놓이는 것도 피한다. 부모가 안 알려 줬으면 카드 것을 둔다(기댈 게 그것뿐이다).
 *    두드러진 특징 줄·피부 점 줄의 흉터·상처 말과 몸 쪽 점(KID_MARK_DROP)은 특징 하나씩 뺀다 — 얼굴의 주근깨·점은 그대로 둔다.
 *    다른 줄에 흉터 말(KID_SCAR)이 있으면 줄째 뺀다.
 */
export function cardFor(input: PortraitInput, card: string | null): string | null {
  if (!card) return null;
  const kid = isKid(input);
  const ageGiven = typeof input.age === "number";
  const genderGiven = genderOf(input) !== undefined;
  const lines = card.split("\n").flatMap((line) => {
    if (!kid) {
      if (!CHILD_WORDS.test(line)) return [line];
      return traitLine(line, CHILD_WORDS);
    }
    if (ageGiven && line.startsWith("- age:")) return [];
    if (genderGiven && line.startsWith("- gender:")) return [];
    if (TRAIT_HEADS.some((h) => line.startsWith(h))) return KID_MARK_DROP.test(line) ? traitLine(line, KID_MARK_DROP) : [line];
    if (KID_SCAR.test(line)) return [];
    return [line];
  });
  return lines.length ? lines.join("\n") : null;
}

/* ─────────────────────────────── 어긋나기 쉬운 쪽 막기(2026-09-30) ─────────────────────────────── */

/*
 * 엄마 사진(2026-09-30 사장님 "캐릭터 생성이 내가 올린이미지랑 100% 비슷하단 느낌이 덜한데"): 사진은 속이 비치는 가는 앞머리를
 * 가운데로 가르고 긴 달걀형 얼굴·좁은 턱·가로로 길고 가는 홑꺼풀 눈·곧은 콧대·작게 다문 입·뺨과 콧등의 주근깨·입가의 점이었는데,
 * 그림은 두껍게 일자로 자른 앞머리·동그란 얼굴·크고 둥근 눈·점 같은 코·활짝 웃는 입·볼 터치·주근깨 없음·더 어려 보임이었다.
 * 카드 쪽(lib/family-photo-card 머리글 '엄마 사진')과 함께 여기서 셋을 고친다(검사 모델을 더 부르지 않는다 — 값 그대로):
 *  ① MUST KEEP 줄(driftGuards) — 카드에 그 특징이 **있을 때만** 그 특징이 흔히 어긋나는 쪽을 한 마디씩 막는다. 특징 말은 카드
 *     에서만 오고, 없는 사람에게는 그 말을 적지 않는다(예시 낱말이 옮겨 그려지는 버릇 — 없는 주근깨·앞머리를 얹지 않게).
 *     눈·코·입은 어른만 — 아이는 오늘의 부드러운 그림책 얼굴 그대로 두고, 앞머리·얼굴형·턱·주근깨·점만 지킨다.
 *     (2026-10-02 사장님 "보자마자 '어 우리 아이다'가 약하다" — 눈은 아이도 지키고, 아이 전용 KID FACE 줄을 더했다.
 *      코·입 과장 막이는 여전히 어른만 — 아이 코·입은 그림책 수준으로 작게 그려도 닮음을 해치지 않는다.)
 *  ② ADULT FACE 줄(adultFace) — 어른 얼굴을 그림책의 귀여운 얼굴(둥근 얼굴·큰 둥근 눈·점 코·볼 터치)로 바꾸지 않게. 이 당김은
 *     글이 아니라 붙인 그림체 견본(style_01, 점 눈·벌린 입·분홍 볼의 여우)에서 온다 — 견본 줄에도 '얼굴 양식은 가져오지 말 것'을
 *     어른에게만 덧붙인다. 아이·칩 갈래는 그대로.
 *  ③ 'DO NOT invent … mole, freckles' 줄이 카드의 주근깨·점과 부딪혀 모델이 빼는 쪽을 골랐다 — 카드에 주근깨·점이 있으면
 *     '카드가 적은 것 말고는 더하지 말 것'으로 바꾼다. 없으면 예전 글 그대로.
 */

/** 카드 한 칸의 값('- 칸: 값' 줄에서) — 없으면 빈 글자 */
function specValue(spec: string, key: string): string {
  const head = `- ${key}: `;
  const line = spec.split("\n").find((l) => l.startsWith(head));
  return line ? line.slice(head.length) : "";
}

/** '없다'는 값·특징 — 'none' · 'no fringe' · 'without …' */
const NONE = /^(none|no|without)\b/i;

/** 여러 값을 이은 글을 하나씩 — 세미콜론, 없으면 쉼표로 나눈다(lib/family-photo-card keepTraits 와 같은 나눔) */
function splitTraits(value: string): string[] {
  const sep = value.includes(";") ? ";" : ",";
  return value
    .split(sep)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** 두드러진 특징 줄에서 re 에 걸리는 특징들 — '없다'는 특징(no fringe …)은 뺀다 */
function distinctiveTraits(spec: string, re: RegExp): string[] {
  return splitTraits(specValue(spec, "distinctive")).filter((t) => re.test(t) && !NONE.test(t));
}

/** 주근깨·점 말 */
const MARK_WORD = /\bfreckl|\bmoles?\b|\bbeauty (marks?|spots?)\b/i;

/**
 * 카드의 피부 점 — 피부 점 줄 + 두드러진 특징 줄의 주근깨·점 특징에서 '없다'는 점 말(no moles · freckles: none …)을 걷어 낸 글.
 * 걷어 내지 않으면 'some freckles; no moles' 의 moles 가 점 막기 줄을 켜 없는 점을 그리게 하고, 'no freckles; small mole' 은 줄째
 * 버려져 있는 점이 막기 줄을 잃었다(2026-09-30 검토). 카드 읽기(lib/family-photo-card dropNegatedMarks)가 먼저 빼지만,
 * 한 특징 안의 'freckles but no moles' 같은 것은 여기서 걷는다.
 */
function marksOf(spec: string | null): string {
  if (!spec) return "";
  return stripNegatedMarks([specValue(spec, "skin marks"), ...distinctiveTraits(spec, MARK_WORD)].join("; "));
}

/** 카드에 주근깨·점이 적혀 있나 — 'DO NOT invent … freckles' 줄을 바꿀지 */
function hasMarks(spec: string | null): boolean {
  return MARK_WORD.test(marksOf(spec));
}

/** 'not heavy' · 'no blunt fringe' 처럼 부정한 말 — 무거운 앞머리 말로 잘못 읽지 않게 지운다 */
const NEGATED = /\b(not|no|never|without)\s+(a\s+|an\s+|too\s+)?[\w-]+/gi;
/**
 * 속이 비치는 앞머리 말 — 이것만 '이마가 사이로 보이는 가는 몇 가닥'으로 푼다. 가벼운 앞머리(FRINGE_LIGHT)와 가른다: 카드의 고를 말도
 * see-through wispy 와 light 가 따로라, light 를 비치는 앞머리로 풀면 보통 앞머리 아이가 비치는 앞머리로 그려진다(2026-09-30 검토).
 */
const FRINGE_SEE_THROUGH = /\b(see-?through|wispy|wisps?|sheer|sparse)\b/i;
/** 가벼운 앞머리 말 — 'light brown' 같은 색 말은 빼고. '두껍게 일자로 자르지 말 것'만 걸고 꼴은 카드대로 둔다 */
const FRINGE_LIGHT = /\b(thin|airy|feathery)\b|\blight\b(?![- ]?(brown|colou?red|blond|blonde|grey|gray|golden))/i;
const FRINGE_HEAVY = /\b(heavy|thick|full|blunt|solid|dense)\b/i;
const FRINGE_CURTAIN = /\bcurtain\b/i;
const FRINGE_SIDE = /\bside-?swept\b|\bswept (to )?(the )?(image-)?(left|right|side|one side)\b|\bside fringe\b/i;
/** 가운데 가르마 — 'centre parting' · 'parted in the centre' · 'parting: centre' · 'middle part' */
const CENTRE_PART =
  /\b(cent(re|er|ral)|middle)[- ]part|\bcentrally[- ]parted\b|\bpart(ing|ed)?\b[^;,]{0,14}\b(cent(re|er|ral|rally)|middle)\b/i;
/** 긴 얼굴 말 · 둥글거나 짧은 얼굴 말(이것이 있으면 '둥글게 하지 말라'를 걸지 않는다) */
const FACE_LONG = /\b(long|oblong|oval|narrow|slim|slender|heart|heart-shaped|diamond|square|rectangular|angular)\b/i;
const FACE_ROUND = /\b(round|rounded|short|wide|broad|full|chubby|plump)\b/i;
/** 턱 말이 든 특징 · 좁은 턱 말 · 넓은 턱 말 */
const CHIN_TRAIT = /\b(chin|jaw\w*)\b|\bv-?shaped\b|\btaper(ed|ing)\b/i;
const CHIN_NARROW = /\b(narrow|pointed|pointy|tapered|tapering|v-?shaped|slim|sharp|small)\b/i;
const CHIN_BROAD = /\b(broad|wide|square|strong|heavy)\b/i;
/** 눈 — 홑꺼풀·가늘고 긴·작은·아몬드 눈이면 '크고 둥근 그림책 눈 금지'. 크거나 둥근 눈이면 걸지 않는다. */
const EYES_NARROW = /\b(single|monolid\w*|inner double|in-?fold\w*|hooded|narrow|long|small|almond)\b/i;
const EYES_BIG = /\b(round|large|big)\b/i;
/** 코 — 또렷한 콧대 · 낮은 코 */
const NOSE_BRIDGE = /\b(defined|straight|high|prominent|clear)\b/i;
const NOSE_LOW = /\b(low|flat)\b/i;
/**
 * 입 — 작은 입 · 다문 입(closed-lip — 카드 입 칸의 고를 말) · 큰 입(웃을 때 이가 보임). 너비가 medium 이어도 다문 입이면
 * '활짝 웃는 입 금지'를 건다 — 엄마 그림이 작게 다문 입 대신 활짝 웃는 입이었다(2026-09-30 검토).
 * 입 말은 부정을 먼저 걷는다('not showing teeth' 의 teeth 를 큰 입으로 읽지 않게 — MOUTH_NEGATED).
 */
const MOUTH_SMALL = /\b(small|narrow)\b/i;
const MOUTH_CLOSED = /\bclosed[- ]?(lips?|lipped|mouth(ed)?)\b|\blips? (closed|together)\b/i;
const MOUTH_WIDE = /\b(wide|teeth|toothy|open)\b/i;
const MOUTH_NEGATED = /\b(not|no|never|without)\s+((showing|visible|any|very|too)\s+)*[\w-]+/gi;

/**
 * MUST KEEP 줄(머리글 '어긋나기 쉬운 쪽 막기' ①) — 카드에 그 특징이 있을 때만 그 한 마디를 넣는다. 걸 것이 없으면 빈 글자.
 * adult — 어른이면 눈·코·입도(아이는 부드러운 그림책 얼굴 그대로). 어느 말이 카드의 어느 줄에서 걸리는지는 위 낱말 목록.
 * 특징 말은 '카드가 적은 대로(as the spec gives)'로 가리키고 새 생김새 낱말을 지어 넣지 않는다 — 앞머리·주근깨의 꼴만 짧게 푼다.
 * penline — 펜선 시험(fe)이면 점을 '아주 작은 옅은 갈색 수채 점'으로 적는다. 'dark-brown dot' 에 얼굴 펜선 줄이 겹치자 점이
 * 까만 잉크 점으로 진하게 찍혔다(사장님 2026-10-19 "얼굴에 점점점이 생긴 이유"). 점은 지키되(닮음) 눈에 덜 띄게. 기본 글은 그대로.
 */
function driftGuards(spec: string, adult: boolean, penline = false): string {
  const fringe = specValue(spec, "fringe");
  const fringeText = [fringe, ...distinctiveTraits(spec, /\b(fringe|bangs)\b/i)].join("; ").replace(NEGATED, " ");
  const face = [specValue(spec, "face shape"), ...distinctiveTraits(spec, /\bface\b/i)].join("; ");
  const chin = [...splitTraits(specValue(spec, "cheeks and jaw")), ...distinctiveTraits(spec, /\b(chin|jaw\w*)\b/i)]
    .filter((t) => CHIN_TRAIT.test(t))
    .join("; ");
  const eyes = specValue(spec, "eyes");
  const nose = specValue(spec, "nose");
  const mouth = specValue(spec, "mouth").replace(MOUTH_NEGATED, " ");
  const marks = marksOf(spec);
  const noFringe = NONE.test(fringe) || splitTraits(specValue(spec, "distinctive")).some((t) => /^(no|without) (fringe|bangs)\b/i.test(t));
  const heavy = FRINGE_HEAVY.test(fringeText);
  const openMouth = MOUTH_WIDE.test(mouth);

  const parts = [
    noFringe ? "no fringe — the forehead stays open, never add bangs" : "",
    // 비치는 앞머리 → 커튼 앞머리 → 가벼운 앞머리 차례로 하나만(더 구체적인 말 먼저). 가벼운 앞머리는 꼴을 풀지 않는다.
    noFringe || heavy
      ? ""
      : FRINGE_SEE_THROUGH.test(fringeText)
        ? "the fringe is a few thin, see-through wisps with the forehead showing between them — NOT a heavy, solid or blunt-cut fringe"
        : FRINGE_CURTAIN.test(fringeText)
          ? "the fringe is parted curtain-style, falling to both sides with the forehead showing in the middle — NOT a heavy, solid or blunt-cut fringe"
          : FRINGE_LIGHT.test(fringeText)
            ? "the fringe stays as light as the spec gives it — NOT a heavy, solid or blunt-cut fringe"
            : "",
    !noFringe && !heavy && FRINGE_SIDE.test(fringeText) ? "the fringe sweeps to the side the spec gives — NOT a straight-across blunt fringe" : "",
    CENTRE_PART.test(fringeText) || distinctiveTraits(spec, /\bpart/i).some((t) => CENTRE_PART.test(t))
      ? "the parting stays in the centre"
      : "",
    FACE_LONG.test(face) && !FACE_ROUND.test(face)
      ? "the face keeps the shape and length the spec gives it — never rounded off into a short, round face"
      : "",
    CHIN_NARROW.test(chin) && !CHIN_BROAD.test(chin) ? "the chin stays as narrow as the spec gives it — never widened into a broad jaw" : "",
    // 눈 — 아이도 지킨다(2026-10-02): 홑꺼풀·가는 눈이 큰 둥근 눈으로 바뀌는 것이 '내 아이' 느낌을 가장 크게 깬다.
    EYES_NARROW.test(eyes) && !EYES_BIG.test(eyes)
      ? "the eyes keep the eyelids, shape and size the spec gives them — NOT big round picture-book eyes, and never exaggerated into slits"
      : "",
    adult && NOSE_BRIDGE.test(nose) && !NOSE_LOW.test(nose)
      ? "the nose keeps the clearly visible bridge the spec gives it — never shrunk to a dot or button nose"
      : "",
    !adult || openMouth
      ? ""
      : MOUTH_SMALL.test(mouth)
        ? "the mouth keeps its small size — a soft closed-lip smile, never a wide open grin"
        : MOUTH_CLOSED.test(mouth)
          ? "the mouth keeps the size the spec gives it, with a soft closed-lip smile — never a wide open grin"
          : "",
    /freckl/i.test(marks)
      ? "the freckles are painted as the spec gives them, as many and in the places written — small, soft light-brown dots, subtle but clearly there; never left out, never dark blotches"
      : "",
    /\bmoles?\b|\bbeauty (marks?|spots?)\b/i.test(marks)
      ? penline
        ? "each mole or beauty mark is one tiny, soft light-brown watercolor dot in the place the spec gives — never a solid black ink dot, never bigger or darker than in the photo"
        : "each mole or beauty mark is one small dark-brown dot in the place the spec gives"
      : "",
  ].filter(Boolean);
  return parts.length ? `MUST KEEP — the ways portraits of this person usually drift; this one must not: ${parts.join("; ")}.` : "";
}

/**
 * ADULT FACE 줄(머리글 '어긋나기 쉬운 쪽 막기' ②) — 사진·카드 갈래의 어른만. 그림책 그림체는 붓질에만 — 실제 눈 모양·크기,
 * 얼굴 길이·턱, 콧대, 입 크기, 보이는 나이를 귀여운 그림책 얼굴로 바꾸지 않게. 볼 터치는 사진(카드)에 있을 때만.
 * 'child' 같은 아이 쪽 말은 넣지 않는다(머리글 ① — 실제 사람 사진 옆). 얼굴이 정말 둥근 어른도 있어 '둥근 얼굴 금지'가 아니라
 * '짧고 둥글게 줄여 어려 보이게 하지 말 것'으로 적는다.
 */
function adultFace(source: "photo" | "card"): string {
  const rosy = source === "photo" ? "the photo shows rosy cheeks" : "the LIKENESS SPEC gives rosy cheeks";
  return `ADULT FACE: paint a grown-up's real face, not the generic cute picture-book face — keep the real eye shape and eye size (never enlarged into big round eyes), face length and chin (never shortened or rounded off into a younger-looking face), nose bridge (never shrunk to a tiny dot nose), mouth size and apparent age (never younger-looking). No pink blush circles on the cheeks unless ${rosy}. The picture-book look comes only from the rendering — soft washes and the thin pencil contour.`;
}

/**
 * KID FACE 줄(2026-10-02 사장님 "이미지가 보자마자 '어 우리 아이다' 느낌이 나야") — 사진·카드 갈래의 아이만.
 * 09-30엔 아이 얼굴을 그림책 얼굴 그대로 뒀는데, 아이야말로 큰 둥근 눈·표준 귀여운 얼굴로의 평균화가 가장 세다 —
 * 닮음이 귀여움보다 먼저다(사장님 09-30 "보자마자 내 얼굴"). 어른 줄과 달리 코·입은 '이 그림체의 보통 수준으로 작게'를
 * 허락하되 자리·모양을 바꾸지 말라고만 하고, 나이는 '더 나이 들어 보이게'를 막는다(아이 쪽은 어려 보이는 게 문제가 아니다).
 */
function kidFace(source: "photo" | "card", closeUp: boolean): string {
  const from = source === "photo" ? (closeUp ? "the photo and its face close-up" : "the photo") : "the LIKENESS SPEC";
  const rosy = source === "photo" ? "the photo shows rosy cheeks" : "the LIKENESS SPEC gives rosy cheeks";
  return `THIS CHILD'S OWN FACE: paint this child's own face, not the standard cute picture-book child. Copy from ${from}: the eye shape and eyelids (single or double), the eye size and spacing — never swapped for generic big round eyes; the real face shape and cheeks — never rounded off into the standard cute face; the nose and mouth where they are and shaped as shown (drawing them small and simple in this painting style is fine — moving or reshaping them is not); and every freckle, mole and dimple it shows. No pink blush circles unless ${rosy}. Apparent age stays the same — never older-looking. The picture-book charm comes from the soft watercolour rendering, never from changing whose face it is.`;
}

/**
 * KID FACE 의 다시 그리기 판 — 다시 그리기 글에는 아이 쪽 말을 쓰지 않는다(redrawLikeness 머리글, CHILD_WORDS).
 * 사진이 없어 눈·코·입·나이는 처음 그림(FIRST image)을 기준으로 적는다.
 */
const KID_FACE_REDRAW =
  "THIS PERSON'S OWN FACE: paint this person's own face, not the standard cute picture-book face — keep the eye shape, eyelids (single or double), eye size and spacing exactly as in the FIRST image, never swapped for generic big round eyes; keep the face shape and cheeks the spec gives — never rounded off into the standard cute face; keep the nose and mouth where they are and shaped as in the FIRST image (small and simple in this painting style is fine — moving or reshaping them is not); keep every freckle, mole and dimple the spec gives. No pink blush circles unless the spec gives rosy cheeks. The apparent age stays as in the FIRST image — never older-looking. The picture-book charm comes from the soft watercolour rendering, never from changing whose face it is.";

/**
 * 그림체 견본 줄 끝 — 사진·카드 갈래의 어른만(머리글 '어긋나기 쉬운 쪽 막기' ②). 견본(style_01 여우)의 얼굴 양식을 가져오지 않게.
 * 'face style' 이라는 말은 쓰지 않는다 — 예전 '같은 얼굴 양식으로(face style)'가 사진에서 멀어지게 당겨 뺀 말이라, 시험이 그 말이
 * 사진·카드 갈래에 없는지 본다.
 */
const SAMPLE_NO_FACE = " Never copy how it draws faces either — not its dot eyes, open-mouthed grin or pink cheek blush.";

/* ─────────────────────────────── 프롬프트 ─────────────────────────────── */

/*
 * 자세·틀·바탕·오려 내기·글자 금지 — 처음 그리기(buildPrompt)와 머리 비율 다시 그리기(headRedrawPrompt)가 같은 글을 쓴다.
 * 손이 몸에 닿으면 팔과 몸 사이 흰 틈이 갇혀 바탕 지우기가 못 닿는다 — 작은 틈을 두게 한다(POSE_LINE).
 */
const POSE_LINE =
  "POSE: front view facing the viewer, relaxed natural standing pose, arms hanging loosely at the sides with a small gap between each arm and the body (hands not touching the body), feet slightly apart, soft gentle smile, eyes open looking at the viewer.";
const FRAMING_LINE =
  "FRAMING: 3:4 portrait. The WHOLE body — from the top of the hair to the soles of the shoes — is inside the picture and centred, with clear empty margin above the head, below the shoes and on both sides (roughly 6–10% of the picture on every side). Nothing touches or is cut off by an edge.";
const BACKGROUND_LINE =
  "BACKGROUND: one flat pure white colour (#FFFFFF) everywhere around the figure. The cream paper tone belongs to the figure's painting only — the empty background is pure white: no paper texture, no wash, no vignette, no floor or ground line, no cast or drop shadow, no props, no scenery, no frame or border.";
const CUTOUT_LINE =
  "The figure is cut out of the white background automatically afterwards, so: keep one continuous thin contour line around the whole silhouette (hair, hands and shoes included); clothes are never pure white or off-white — if a white garment is written, paint it as a clearly shaded very light grey so it still reads as white; white or grey hair is painted light grey with soft blue-grey shading and outlined, never paper-white.";
const NO_TEXT_LINE =
  "NO text anywhere: no name, no title, no letters, no numbers, no labels, no speech bubble, no signature, no watermark.";

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
 *  - 사진·카드 갈래는 카드 묶음 바로 뒤에 MUST KEEP 줄(driftGuards — 카드에 있는 특징만)과, 어른이면 ADULT FACE 줄(adultFace)을
 *    두고 그림체 견본 줄 끝에 '견본의 얼굴 양식은 가져오지 말 것'을 붙인다(머리글 '어긋나기 쉬운 쪽 막기', 2026-09-30).
 *    카드에 주근깨·점이 있으면 DO NOT 줄은 '카드가 적은 것 말고는 더하지 말 것'으로 바뀐다. 칩 갈래는 모두 예전 그대로.
 *  - 둘 다 없으면 칩 — 예전 글에서 머리 비율 쪽만 바뀌었다(머리글 chips: 비율 견본 줄, 같은 가족 그림 줄의 비율 말,
 *    어른 PROPORTIONS 줄).
 */
export function buildPrompt(input: PortraitInput, attached: Attached, card: string | null = null): string {
  const stylePrompt = stylePromptFor(input.penline);
  const penline = input.penline === true;
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
  // 사진·카드 갈래의 어른 — 그림책의 귀여운 얼굴로 당기지 않게(머리글 '어긋나기 쉬운 쪽 막기' ②). 아이·칩 갈래는 그대로.
  const realAdultFace = !kid && source !== "chips";
  // 카드에 주근깨·점이 있으면 'DO NOT invent … mole, freckles' 가 카드와 부딪히지 않게 바꾼다(같은 머리글 ③). 없으면 예전 글.
  const marks = hasMarks(spec);

  const appearance =
    source === "photo"
      ? [
          input.looks
            ? `APPEARANCE LINE — chosen by the family and written in Korean, extra guidance on top of the photo: "${input.looks}". Where it disagrees with the photo${spec ? " or the LIKENESS SPEC" : ""} about the face, hair, glasses or body, follow the PHOTO; for everyday clothes, follow this line.`
            : "",
          "Glasses follow the PHOTO: draw ordinary glasses only if the person wears them in the photo (never sunglasses), whatever the appearance line says about 안경.",
          marks
            ? "DO NOT invent anything that is neither in the photo nor written above: no glasses, beard, moustache, stubble or tattoo unless it is clearly there, and no freckles or moles beyond those the LIKENESS SPEC gives. One invented detail and the portrait no longer looks like them."
            : "DO NOT invent anything that is neither in the photo nor written above: no glasses, beard, moustache, stubble, mole, freckles or tattoo unless it is clearly there. One invented detail and the portrait no longer looks like them.",
          noAccessories(source, Boolean(spec)),
        ]
      : source === "card"
        ? [
            input.looks
              ? `APPEARANCE LINE — chosen by the family and written in Korean: "${input.looks}". Where it disagrees with the LIKENESS SPEC about the face, hair, glasses or body, follow the SPEC; for everyday clothes, follow this line.`
              : "",
            "Glasses follow the LIKENESS SPEC: a described frame means ordinary glasses (never sunglasses); none means no glasses. Only if the spec has no glasses line, draw glasses when the appearance line says 안경을 썼다.",
            marks
              ? "DO NOT invent anything that is neither in the LIKENESS SPEC nor written above: no glasses, beard, moustache, stubble or tattoo unless it is written, and no freckles or moles beyond those the LIKENESS SPEC gives. One invented detail and the portrait no longer looks like them."
              : "DO NOT invent anything that is neither in the LIKENESS SPEC nor written above: no glasses, beard, moustache, stubble, mole, freckles or tattoo unless it is written. One invented detail and the portrait no longer looks like them.",
            noAccessories(source, Boolean(spec)),
          ]
        : [
            input.looks
              ? `APPEARANCE — chosen by the family and written in Korean. Follow it literally, item by item, and keep every written trait clearly visible: "${input.looks}"`
              : "No appearance details were given — draw a simple, ordinary everyday look: tidy natural hair, simple everyday clothes in one soft colour, no accessories, no glasses.",
            input.looks
              ? "If it says 안경을 쓰지 않는다 they do NOT wear glasses; draw glasses only when it says 안경을 썼다."
              : "",
            "DO NOT invent anything that is not written above: no glasses, beard, moustache, stubble, mole, freckles or tattoo unless that exact item is written. This is the child's real family — one invented detail and the child no longer recognises them.",
            noAccessories(source, Boolean(spec)),
          ];

  return [
    source === "chips"
      ? `One full-body character portrait of a single person for a Korean children's picture book, ${stylePrompt}.`
      : `One full-body character portrait of a single person for a Korean picture book, ${stylePrompt}.`,
    source !== "chips"
      ? likenessFirst(source, { distinctive: hasDistinctive(spec), closeUp: has("closeUp"), kid, ageFromWho, penline })
      : "",
    has("photo") ? photoIntro(nth("photo"), penline) : "",
    has("closeUp") ? closeUpLine(nth("closeUp"), nth("photo"), penline) : "",
    has("sample")
      ? `${nth("sample")} image = painting-style sample only (never copy its people, animals, subject, pose or composition). Copy only HOW it is painted: medium, brush and line quality, edge softness, colour palette, shading and paper finish.${penline ? PENLINE_SAMPLE_NO_FACE : realAdultFace ? SAMPLE_NO_FACE : ""}`
      : "",
    has("sibling")
      ? source === "card"
        ? `${nth("sibling")} image = another member of the same family already painted — match the SAME artist hand, line weight and rendering, but NEVER copy that person's face, face shape, hair, clothes or body proportions. The person you draw now is someone else and must look like the LIKENESS SPEC; head size and body proportions come only from ${proportionSource}.`
        : `${nth("sibling")} image = another member of the same family already painted — match the SAME artist hand, line weight, face style and rendering, but NEVER copy that person's face, hair, clothes or body proportions. The person you draw now is someone else; head size and body proportions come only from ${proportionSource}.`
      : "",
    has("guide") ? guideLine(nth("guide"), headChartRatio(input.role, input.age)) : "",
    spec && source !== "chips" ? cardBlock(spec, source) : "",
    // 카드 바로 뒤 — 카드에 있는 특징만 '흔히 어긋나는 쪽'을 막는다(아이는 눈·코·입 빼고). 사진 규칙보다 앞.
    spec && source !== "chips" ? driftGuards(spec, !kid, penline) : "",
    realAdultFace ? adultFace(source) : kid && source !== "chips" ? kidFace(source, has("closeUp")) : "",
    // 펜선 시험 — 이목구비를 실제 모양대로 가는 펜선으로(점 눈·큰 만화 눈 금지)
    penline ? PENLINE_FACE_LINE : "",
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
    // 사진 갈래는 '사진이 어떻게 잘렸든 이 비율 그대로'를 덧붙인다(머리글 '사진의 구도가 머리 크기를 정하지 않게').
    `PROPORTIONS: ${id.proportion}${has("guide") ? ` The ${nth("guide")} image (proportion guide) shows exactly this head-to-height ratio.` : ""}${source === "photo" ? " However the photo is cropped, this ratio stays the same." : ""}`,
    POSE_LINE,
    FRAMING_LINE,
    BACKGROUND_LINE,
    CUTOUT_LINE,
    NO_TEXT_LINE,
    // 칩은 예전 그대로. 사진·카드 갈래는 'innocent·fully clothed' 같은 말을 쓰지 않는다 — 실제 사람 사진과 섞이면 오히려 걸린다.
    source === "chips" ? "Wholesome, innocent, fully clothed, child-friendly." : "A warm, friendly look in ordinary everyday clothes.",
  ]
    .filter(Boolean)
    .join("\n");
}

/* ─────────────────────────────── 머리 비율 다시 그리기 ─────────────────────────────── */

/**
 * 사진(과 클로즈업)이 든 참고 그림 배열로 **한 번만** 그리고, 잘 그렸든 실패했든 곧바로 배열을 비운다.
 * 머리 비율 다시 그리기는 처음 그림으로 하므로(headRedrawRecipe) 사진이 다시 쓰일 일이 없다 — 사진은 그리기 한 번에만 쓰고
 * 놓는다(lib/family-photo 약속 "그림을 그리는 데 한 번 쓰고 바로 지워요"). draw 에는 같은 배열을 넘긴다(보낼 때 쓴다).
 */
export async function drawThenRelease<T, R>(images: T[], draw: (images: T[]) => Promise<R>): Promise<R> {
  try {
    return await draw(images);
  } finally {
    images.length = 0;
  }
}

/**
 * 머리 비율 다시 그리기에 다시 적는 카드 칸 — 얼굴·머리뿐. 성별·옷·몸집·안경·수염은 넣지 않는다: 다시 그리기 FIRST 줄의
 * '처음 그림 그대로(안경·수염은 처음 그림에 있을 때만 — never add any)·같은 옷'과 부딪히지 않게.
 */
const REDRAW_KEYS_ADULT = ["age", "distinctive", "face shape", "eyes", "eyebrows", "nose", "mouth", "cheeks and jaw", "skin marks", "hair", "fringe"];
/**
 * 아이는 얼굴형·턱·피부 점·앞머리만 — 눈·코·입은 부드러운 그림책 얼굴 그대로 두고(처음 그리기와 같다), 머리 줄(카드는 빛 때문에
 * 까만 머리를 갈색으로 읽기도 한다 — 아이 머리 색 규칙은 다시 그리기에 없다)·두드러진 특징 줄(나이·머리 색 말이 섞인다)은 넣지 않는다.
 */
const REDRAW_KEYS_KID = ["face shape", "cheeks and jaw", "skin marks", "fringe"];
/**
 * 다시 그리기 닮음 줄에서 특징 하나씩 빼는 안경·수염 말(2026-09-30 검토) — 칸(glasses·facial hair)은 빼도 두드러진 특징 줄에
 * 'thick black rectangular glasses; short boxed beard' 가 남으면, FIRST 줄의 '안경·수염은 처음 그림에 있을 때만(never add any)'과
 * '어긋났으면 카드대로'가 부딪혀 결과를 알 수 없다. 안경·수염은 처음 그림을 따른다(처음 그리기가 사진·카드로 이미 정했다).
 * 'frames the face'(머리가 얼굴을 감싸는) 같은 머리 말은 걸지 않는다.
 */
const REDRAW_EYEWEAR_BEARD =
  /\b(glasses|spectacles|eyewear|rims?|rimmed|rimless|beards?|bearded|moustaches?|mustaches?|goatees?|stubble|sideburns|facial hair)\b|\bframes?\b(?!\s+(the|her|his|their)\b)/i;
/** 다시 그리기 닮음 줄에서 특징 하나씩 빼는 말 — 아이 쪽 말 + 안경·수염 말 */
const REDRAW_DROP = new RegExp(`${CHILD_WORDS.source}|${REDRAW_EYEWEAR_BEARD.source}`, "i");

/**
 * 머리 비율 다시 그리기에 붙이는 닮음 줄(2026-09-30 — 머리글 '머리 비율 다시 그리기'의 되돌림). 처음 그림이 사진(또는 사진에서 읽은
 * 카드)으로 그린 것일 때만 부른 쪽이 넘긴다. 카드를 이 사람에게 맞게 거르고(cardFor) 얼굴·머리 칸만 남겨, '처음 그림이 이것을
 * 맞추려고 그린 것 — 어긋났으면 얼굴·머리는 카드대로, 나머지는 처음 그림 그대로'로 적는다. 뒤에 MUST KEEP 줄(driftGuards —
 * 남긴 칸에서만)과 어른이면 ADULT FACE 줄(카드 말씨)을 붙인다. 남는 칸이 없으면 null(예전 그대로 다시 그린다).
 * 사진·클로즈업 말은 없다(다시 그리기에는 사진이 없다). 아이 쪽 말은 줄마다 특징 하나씩 뺀다 — 다시 그리기 글은 역할과 상관없이
 * 아이 쪽 말이 없다(아이 카드의 'baby face' 같은 말도). 두드러진 특징 줄 등에 섞인 안경·수염 말도 특징 하나씩 뺀다(REDRAW_DROP).
 * 이 줄이 붙으면 FIRST 줄도 '얼굴·머리는 이 줄이 바로잡는 곳만 바꾼다'로 바뀐다(headRedrawPrompt FIRST_LINE_LIKENESS).
 * 카드에서 온 글이라 사진과 똑같이 다룬다 — 이 요청 메모리에서 다시 그리기 프롬프트로만 넘기고 찍지 않는다.
 */
export function redrawLikeness(input: PortraitInput, card: string | null): string | null {
  const spec = cardFor(input, card);
  if (!spec) return null;
  const kid = isKid(input);
  const keys = kid ? REDRAW_KEYS_KID : REDRAW_KEYS_ADULT;
  const lines = spec.split("\n").flatMap((line) => {
    if (!keys.some((k) => line.startsWith(`- ${k}: `))) return [];
    if (!REDRAW_DROP.test(line)) return [line];
    const at = line.indexOf(": ") + 2;
    const kept = keepTraits(line.slice(at), REDRAW_DROP);
    return kept ? [`${line.slice(0, at)}${kept}`] : [];
  });
  if (!lines.length) return null;
  const notes = lines.join("\n");
  return [
    "LIKENESS SPEC — this person's real, recognisable face and hair, which the FIRST image was painted to match. Keep every trait below; where the FIRST image has drifted from one of them, follow the spec for the face and hair — everything else stays exactly as in the FIRST image.",
    notes,
    SIDE_WORD.test(notes) ? SIDE_LINE : "",
    driftGuards(notes, !kid, input.penline === true),
    kid ? KID_FACE_REDRAW : adultFace("card"),
  ]
    .filter(Boolean)
    .join("\n");
}

/** 다시 그리기 FIRST 줄 — 닮음 줄이 없을 때(칩 갈래·카드 없음). 예전 글 그대로(한 글자도 바꾸지 않는다 — 시험이 본다). */
const FIRST_LINE =
  "FIRST image = our own earlier painting of this person — repaint THIS SAME character from the FIRST image. Keep exactly as in the FIRST image: the face (face shape, eyes, eyebrows, nose, mouth), the hairstyle, hair length, fringe and hair colour, glasses, beard or moustache only if the FIRST image has them (never add any), the skin tone, the age the face shows, the body build, the clothes, shoes and all their colours, and the watercolor rendering (brushwork, line, soft washes). Copy everything from it EXCEPT its head-to-height ratio — only the head size and the length of the neck, torso and legs change.";
/**
 * 닮음 줄(redrawLikeness)이 붙을 때의 FIRST 줄(2026-09-30 검토) — 예전 줄은 '얼굴·앞머리를 처음 그림 그대로, 바꾸는 건 머리 크기와
 * 목·몸통·다리뿐'이라, 바로 뒤 닮음 줄의 '어긋났으면 카드대로'를 더 센 말로 막았다(두꺼운 앞머리·둥근 얼굴이 새 비율로 그대로 남는다).
 * 그래서 안경·수염·피부·몸집·옷·붓질은 '그대로', 얼굴·머리 모양·앞머리·머리 색·보이는 나이는 '처음 그림대로, 닮음 줄이 바로잡는
 * 곳만 닮음 줄대로'로 가르고, 바뀌는 것에 '닮음 줄이 바로잡는 얼굴·머리'를 더한다.
 */
const FIRST_LINE_LIKENESS =
  "FIRST image = our own earlier painting of this person — repaint THIS SAME character from the FIRST image. Keep exactly as in the FIRST image: glasses, beard or moustache only if the FIRST image has them (never add any), the skin tone, the body build, the clothes, shoes and all their colours, and the watercolor rendering (brushwork, line, soft washes). Keep the face (face shape, eyes, eyebrows, nose, mouth), the hairstyle, hair length, fringe, hair colour and the age the face shows as in the FIRST image too, except where the LIKENESS SPEC below corrects them — there the spec wins. Copy everything else from it EXCEPT its head-to-height ratio — only the head size, the length of the neck, torso and legs, and the face and hair traits the LIKENESS SPEC corrects change.";

/**
 * 머리 비율 다시 그리기의 프롬프트(머리글 '머리 비율 다시 그리기'). 첫째 그림 = 처음 그림, 둘째 = 비율 견본(guide 면).
 * 첫째 그림의 캐릭터를 그대로 두고(얼굴·머리 모양·머리 색·안경·피부·얼굴이 보여 주는 나이·몸집·옷·색·붓질) 머리:키 비율만
 * fix.target 으로 고친다. 참고 그림을 흉내 내다 비율까지 베끼는 일을 막으려 '머리:키 비율만은 베끼지 말라'와, 틀이 그대로라
 * 머리가 그림 안에서 작아(커)진다는 것을 **얼마나**(처음 그림 머리 높이의 약 N%)와 '몇 등신'(비율 견본 가로줄 한 칸 = 머리
 * 하나)으로 적는다 — '더 작게'만 적으면 처음 그림을 거의 그대로 베낀다. 목만 길게 빼거나 다리만 늘리지 않게 '고르게'를
 * 적고, 어른·청소년은 첫 그리기와 같은 이름(picture-book adult · teenage proportions)을 붙인다. 두 사람(전·후 비교)으로
 * 그리는 일도 막는다.
 * 사진·칩 글은 넣지 않는다(처음 그림에 이미 들어 있다 — 다시 적으면 모델이 다시 읽어 딴사람이 될 수 있다).
 * 특징 카드는 사진으로 그렸을 때만 얼굴·머리 줄을 다시 적는다(o.likeness = redrawLikeness, 2026-09-30 — 머리글 '머리 비율
 * 다시 그리기'의 되돌림). FIRST 줄 바로 뒤에 두고, 그때는 FIRST 줄도 '얼굴·머리는 닮음 줄이 바로잡는 곳만 바꾼다'로 바뀐다
 * (FIRST_LINE_LIKENESS). 없으면(칩 갈래·카드 없음) 글자 하나 다르지 않게 예전 그대로다.
 * 아이 쪽 말·가족 말도 없다(역할과 상관없이 같은 글 — 나이는 '첫째 그림의 보이는 나이 그대로').
 */
export function headRedrawPrompt(fix: HeadFix, o: { guide: boolean; likeness?: string | null; penline?: boolean }): string {
  const stylePrompt = stylePromptFor(o.penline);
  const big = fix.verdict === "big";
  const want = ratioText(fix.target);
  // 몇 등신인가(7 · 5.5 · 6.5) — 그림 그리는 사람의 말. 비율 견본의 가로줄(머리 높이마다)과 같은 셈이다.
  const heads = Math.round(fix.target * 10) / 10;
  // 틀·여백이 같으니 전신 높이가 같다 — 머리 높이는 처음 그림의 (잰 비율 ÷ 표 비율)배. 엄마 4.15 → 7 이면 59%.
  // 숫자 없이 '더 작게'만 적으면 모델이 처음 그림을 거의 그대로 베껴 조금만 줄인다(4.15 → 4.41 같은 되풀이).
  const scale = Math.round((fix.measured / fix.target) * 100);
  // 어른·청소년은 첫 그리기의 PROPORTIONS 줄과 같은 이름을 붙인다(숫자만 있으면 짧은 몸의 '어려 보임'을 따라가기 쉽다).
  // 아이 표에는 붙이지 않는다 — 아이 쪽 말을 넣지 않는다(사진에서 온 그림일 수 있다).
  const kind =
    fix.target >= ADULT_HEAD_RATIO
      ? " (picture-book adult proportions)"
      : fix.target >= TEEN_HEAD_RATIO
        ? " (picture-book teenage proportions)"
        : "";
  // 고르게 늘린다 — 짧은 목의 큰 머리 그림에서 목만 길게 빼거나 다리만 늘리는 쉬운 길을 막는다.
  const evenly = `evenly, so the figure stays naturally proportioned${big ? " with a natural-length neck (never a long, stretched neck)" : ""} — never only the legs or only the torso changed`;
  return [
    `One full-body character portrait of a single person for a Korean picture book, ${stylePrompt}.`,
    // 몸집(body build)도 그대로 — 늘리다 보면 날씬한 패션 그림 몸으로 바뀌어 딴사람 같아진다. 나이는 '얼굴이 보여 주는 나이' —
    // 짧은 몸이 주는 어려 보이는 인상은 따르지 않는다. 바꾸는 것은 머리:키 비율(머리 크기·목·몸통·다리 길이)뿐이다.
    // 닮음 줄이 붙으면 얼굴·머리는 그 줄이 바로잡는 곳만 바꾼다(FIRST_LINE_LIKENESS) — 없으면 예전 글 그대로.
    o.likeness ? FIRST_LINE_LIKENESS : FIRST_LINE,
    // 사진으로 그렸으면 카드의 얼굴·머리 줄(redrawLikeness) — 처음 그림이 어긋난 곳은 카드 쪽으로 되돌린다.
    o.likeness ?? "",
    o.guide ? guideLine("SECOND", fix.target) : "",
    `PROPORTION FIX — the FIRST image drew the head too ${big ? "big" : "small"} (about ${ratioText(fix.measured)} of the full height). The head, from the top of the hair to the chin, must be ${want} of the full height, from the top of the hair to the soles of the shoes — the figure is ${heads} heads tall${o.guide ? ", one head-height per band between the SECOND image's lines" : ""}${kind}: paint a clearly ${big ? "smaller" : "bigger"} head in relation to the whole figure, and make the neck, torso and legs ${big ? "longer" : "shorter"} to match — ${evenly}.${big ? " NOT a big head, NOT chibi, NOT super-deformed." : ""}`,
    `The whole figure, from the top of the hair to the soles of the shoes, still spans the same height of the same 3:4 frame with the same margins, so the head comes out ${big ? "smaller" : "bigger"} in the picture than in the FIRST image — about ${scale}% of its height there: the same face, just ${big ? "smaller" : "bigger"}.`,
    "Exactly one person — a single full-body figure; never two figures side by side and never a before-and-after comparison.",
    POSE_LINE,
    FRAMING_LINE,
    BACKGROUND_LINE,
    CUTOUT_LINE,
    NO_TEXT_LINE,
    "A warm, friendly look in the same everyday clothes.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * 머리 비율 다시 그리기의 요청 — 참고 그림은 처음 그림(첫째) + 비율 견본(둘째, 있으면)뿐이다.
 * 사진·얼굴 클로즈업·그림체 견본·같은 가족 그림은 받지도 않는다(칩·사진·대신 그리기 모두 같은 요청):
 *  - 사진·클로즈업: 얼굴이 꽉 찬 사진이 머리를 크게 당겼고, 같은 사진으로 다시 그리면 같은 버릇을 되풀이한다(엄마 4.15 → 4.41).
 *    처음 그림이 이미 사진을 닮게 그린 것이라 닮음은 그 그림에서 가져온다. 사진은 처음 그리기 직후에 놓는다(drawThenRelease).
 *  - 그림체 견본: 처음 그림이 이미 그 그림체다. 견본(앉은 여우)은 머리가 아주 커서 머리를 키우는 쪽으로 당길 수 있다.
 *  - 같은 가족 그림(칩 갈래): 대개 아이 그림이라 어른 머리를 키우는 쪽으로 당겼다.
 *  - 칩 갈래도 처음 그림에서 — 같은 칩 글로 새로 뽑으면 같은 버릇(같은 가족 그림·글)을 되풀이하고, 얼굴·옷이 다른 사람이
 *    나와 '표에 더 가까운 쪽'이 딴사람 그림일 수 있다. 칩 글은 처음 그림에 이미 들어 있다.
 * likeness — 사진으로 그렸을 때 카드의 얼굴·머리 줄(redrawLikeness). 글로만 붙고 참고 그림은 그대로다(사진은 다시 보내지 않는다).
 * first 는 우리가 방금 그린 그림(이 요청 메모리에만 — 건네는 쪽만 올린다).
 */
export function headRedrawRecipe<T>(o: { first: T; guide: T | null; fix: HeadFix; likeness?: string | null; penline?: boolean }): {
  prompt: string;
  references: T[];
} {
  const refs: T[] = o.guide !== null ? [o.first, o.guide] : [o.first];
  return {
    prompt: headRedrawPrompt(o.fix, { guide: o.guide !== null, likeness: o.likeness, penline: o.penline }),
    references: refs,
  };
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
