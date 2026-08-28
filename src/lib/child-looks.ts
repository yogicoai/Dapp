/**
 * 아이 생김새 → 그림 모델용 영어 한 줄.
 *
 * 설정의 칩(prefs.ChildLooks)은 한국어라, 이야기(클로드)에는 그대로 주면 되지만
 * 그림(Gemini)에는 영어 규칙 사이에 한국어 한 줄이 끼어 들어갔다. 대체로 읽긴 해도
 * 확실하지 않았다 — 칩은 고정 목록이라 대응표로 바꿔 주면 끝난다.
 *
 * '늘 지니는 것'은 둘로 가른다. 모자·머리핀처럼 **몸에 붙는 것**만 그림 기준(시트)에
 * 넣는다. 곰인형·담요·장난감은 이야기의 물건이라, 시트에 넣으면 모든 쪽에 따라다녀
 * 쪽별 `물건:` 잠금과 싸운다(실제로 인형이 두 개 그려지는 사고의 원인).
 *
 * prefs.ts는 Supabase를 끌고 와서 node --test로 못 부른다. 그래서 순수 계산만 여기 둔다.
 */
import type { ChildLooks } from "./prefs";

const HAIR: Record<string, string> = {
  "아주 짧아요": "very short cropped hair",
  "짧은 머리": "short hair",
  "바가지 머리": "a bowl cut",
  "귀 덮는 머리": "ear-length hair",
  단발: "a chin-length bob",
  "긴 머리": "long hair",
  양갈래: "two pigtails",
  "하나로 묶기": "a single ponytail",
  똥머리: "a hair bun",
};
const HAIR_TEXTURE: Record<string, string> = {
  "곧은 생머리": "completely straight hair with no curls, waves or perm volume",
  "살짝 웨이브": "soft waves only at the ends of the hair",
  곱슬머리: "naturally tight curly hair",
  파마머리: "permed hair with round curls all over",
};
const BANGS: Record<string, string> = {
  있어요: "with a fringe (bangs)",
  없어요: "no fringe, forehead visible",
  "옆으로 넘겨요": "fringe swept to one side",
};
const HAIR_COLOR: Record<string, string> = {
  까만색: "black hair",
  "짙은 갈색": "dark brown hair",
  "밝은 갈색": "brown hair (still a natural dark Korean shade, never blonde)",
};
const EYES: Record<string, string> = {
  "크고 동그래요": "big round eyes",
  "웃으면 반달이 돼요": "eyes that curve into half-moons when smiling",
  또렷해요: "clear, bright eyes",
  "쌍꺼풀이 있어요": "double-lidded eyes",
};
const SKIN: Record<string, string> = {
  "밝은 편": "fair skin",
  보통이에요: "light-medium skin",
  "조금 진한 편": "slightly tan skin",
  "햇볕에 그을렸어요": "sun-kissed tan skin",
};
const BUILD: Record<string, string> = {
  통통해요: "a chubby build",
  보통이에요: "an average build",
  "마른 편이에요": "a slim build",
};
const COLOR: Record<string, string> = {
  빨강: "red",
  노랑: "yellow",
  파랑: "blue",
  초록: "green",
  분홍: "pink",
  보라: "purple",
  하양: "white",
};
/** 몸에 붙어 다니는 것 — 이것만 그림 기준에 넣는다. */
const WEARABLE: Record<string, string> = {
  모자: "always wears a hat",
  머리핀: "always wears a hair pin",
  안경: "wears glasses",
  머리띠: "always wears a hairband",
  리본: "always wears a ribbon in the hair",
  목걸이: "always wears a small necklace",
  팔찌: "always wears a bracelet",
  시계: "always wears a small wristwatch",
};
const MARKS: Record<string, string> = {
  주근깨: "freckles",
  보조개: "dimples",
  "앞니 빠짐": "a missing front tooth",
  "볼이 통통해요": "chubby cheeks",
};

const en = (table: Record<string, string>, value: string | undefined): string | undefined =>
  value ? (table[value] ?? value) : undefined;

/** '늘 지니는 것' 가운데 몸에 붙는 것만 남긴다. 인형·담요·장난감은 이야기의 물건이다. */
export function wearableItems(items: string[] | undefined): string[] {
  return (items ?? []).filter((item) => item in WEARABLE);
}

/**
 * 그림 모델에 줄 영어 한 줄. 고르지 않은 항목은 빠지고, 대응표에 없는 값은 한국어 그대로
 * 남긴다(Gemini가 대체로 읽는다). 아무것도 없으면 빈 문자열.
 */
export function looksToDrawingPrompt(looks: ChildLooks | undefined): string {
  if (!looks) return "";
  const parts: string[] = [];
  const hair = [en(HAIR_COLOR, looks.hairColor), en(HAIR, looks.hair)].filter(Boolean).join(", ");
  if (hair) parts.push(hair);
  if (looks.hairTexture) parts.push(en(HAIR_TEXTURE, looks.hairTexture)!);
  if (looks.bangs) parts.push(en(BANGS, looks.bangs)!);
  if (looks.eyes) parts.push(en(EYES, looks.eyes)!);
  if (looks.skin) parts.push(en(SKIN, looks.skin)!);
  if (looks.build) parts.push(en(BUILD, looks.build)!);
  if (looks.glasses) parts.push("wears glasses");
  if (looks.color) {
    const c = en(COLOR, looks.color)!;
    parts.push(`favourite clothing colour is ${c} — their everyday outfit is mainly ${c}`);
  }
  for (const item of wearableItems(looks.items)) parts.push(WEARABLE[item]);
  for (const mark of looks.marks ?? []) parts.push(en(MARKS, mark)!);
  if (looks.note) parts.push(`parent's own note (Korean, follow it): ${looks.note}`);
  return parts.join("; ");
}

/**
 * 주인공이 몇 살 어느 성별인지 — 시트에 직접 넣는다.
 *
 * 나이·성별은 이야기(클로드)에만 가고 시트(Gemini)에는 클로드가 쓴 생김새 줄만 갔다.
 * 클로드가 그 줄에 나이를 안 적으면 다섯 살 아이가 여덟 살 얼굴로 나올 수 있었다.
 */
export function heroIdentity(age: number | null | undefined, gender: string | undefined): string {
  const who = gender === "girl" ? "girl" : gender === "boy" ? "boy" : "child";
  if (!age || age <= 0) return `a young Korean ${who}`;
  if (age >= 9) return `an 8-to-10-year-old Korean ${who}`;
  return `a ${age}-year-old Korean ${who}`;
}
