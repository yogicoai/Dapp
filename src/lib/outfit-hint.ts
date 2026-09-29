/**
 * 이 책의 옷 색 제안 — 책마다 옷이 달라지게 코드가 무작위로 뽑아 이야기 요청(lib/anthropic generateStory)에 한 줄로 붙인다.
 *
 * 왜 있나(2026-09-29 사장님 "옷도 계속 가족 옷에 나온것만 입히는것 같아 옷은 그 주제안에서 랜덤으로 교체되게도"):
 * 고정 가족은 가족 그림의 옷만 입었고, 고정 안 한 사람도 클로드가 늘 비슷한 색(파랑·노랑)을 골랐다.
 * 클로드에게 "다르게 골라라"만 말하면 매번 같은 '다른 색'이 나온다 — 그래서 색은 코드가 뽑고, 옷 종류(소풍이면 나들이 옷,
 * 겨울이면 외투)는 클로드가 이야기에 맞춰 고른다. 뽑은 색은 @@CHARACTER@@ 의 '이 책의 옷' 칸으로 들어가
 * 그 책의 모든 쪽이 같은 글을 쓴다(한 책 안에서는 늘 같은 옷).
 *
 * 순수 함수 — node --test 로 시험한다(outfit-hint.test.ts). rand 를 넘기면 같은 결과가 나온다.
 */

/**
 * 윗옷·겉옷 색 — 한 사람에 한 갈래, 사람끼리 갈래가 겹치지 않는다(친구가 주인공과 같은 색이면 쌍둥이로 그려진다).
 * 하양은 넣지 않는다 — 흰 옷은 흰 바탕의 옷 카드(lib/sheet-compose prepareOutfitCard)에서 칸 나누기를 깨고,
 * 수채화에서 종이와 구별되지 않는다.
 */
export const OUTFIT_HUE_FAMILIES: readonly (readonly string[])[] = [
  ["민트", "청록"],
  ["하늘색", "파랑", "남색"],
  ["연두", "초록", "올리브"],
  ["코랄", "빨강"],
  ["살구", "주황"],
  ["머스터드 노랑"],
  ["라벤더", "자주"],
  ["분홍"],
];

/** 아래옷 색 — 윗옷과 어울리는 무난한 색. 겹쳐도 된다. */
export const OUTFIT_NEUTRALS: readonly string[] = ["베이지", "연청", "진청", "회색", "크림", "갈색"];

/** 한 책에 뽑는 최대 수 — 인물 시트 상한(6명)과 같다. */
export const OUTFIT_HINT_MAX = 6;

const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥"];

/** 0 이상 n 미만 정수 — rand 가 1 을 돌려줘도 넘치지 않게. */
function pick(n: number, rand: () => number): number {
  const r = rand();
  return Math.min(n - 1, Math.max(0, Math.floor((Number.isFinite(r) ? r : 0) * n)));
}

/**
 * 사람 수만큼 [윗옷 색, 아래옷 색] — 윗옷 색의 갈래는 모두 다르다. n 은 1~6 으로 자른다(이상한 값이면 6).
 */
export function pickOutfitPalette(n: number = OUTFIT_HINT_MAX, rand: () => number = Math.random): [string, string][] {
  const count = Number.isFinite(n) ? Math.min(OUTFIT_HINT_MAX, Math.max(1, Math.round(n))) : OUTFIT_HINT_MAX;
  const order = OUTFIT_HUE_FAMILIES.map((_, i) => i);
  // 피셔-예이츠 섞기
  for (let i = order.length - 1; i > 0; i--) {
    const j = pick(i + 1, rand);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order.slice(0, count).map((f) => {
    const family = OUTFIT_HUE_FAMILIES[f];
    return [family[pick(family.length, rand)], OUTFIT_NEUTRALS[pick(OUTFIT_NEUTRALS.length, rand)]];
  });
}

/**
 * 이야기 요청에 붙이는 한 줄. 색만 제안한다 — 옷 종류는 이야기의 계절·장소·하는 일에 맞춰 클로드가 고른다.
 * 이야기·부모 글이 옷을 정해 두었으면(노란 우비 등) 그것이 먼저다.
 */
export function outfitHintLine(pairs: readonly (readonly [string, string])[]): string {
  if (pairs.length === 0) return "";
  const list = pairs.map(([main, second], i) => `${CIRCLED[i] ?? `${i + 1}.`} ${main}+${second}`).join(" ");
  return [
    `이 책의 옷 색 제안(책마다 옷이 달라지게 무작위로 뽑았다) — @@CHARACTER@@ 순서대로 한 사람에 하나씩: ${list}.`,
    "앞의 색은 윗옷·겉옷, 뒤의 색은 아래옷에 쓴다. 어른에게는 같은 계열의 차분한 색으로 써도 된다.",
    "옷 종류는 이야기의 계절·장소·하는 일에 맞춰 고른다. 이야기나 부모 글이 옷을 정해 두었으면(노란 우비 등) 그것이 먼저다.",
  ].join(" ");
}
