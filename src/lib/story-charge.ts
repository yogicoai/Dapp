import { createHash } from "node:crypto";

/**
 * 대본 값을 셀 열쇠 — 서버(api/story)만 쓴다(node:crypto).
 *
 * 줄거리 지문 — '같은 줄거리인가'를 서버가 가리는 열쇠(charge_story 의 p_outline_key).
 * parseOutlineInput 이 이미 다듬어(장면 번호를 1,2,3… 으로 다시 매기고 공백을 턴다)
 * 정규화된 모양을 주므로, 그대로 해시하면 같은 줄거리는 늘 같은 지문이 나온다.
 * 줄거리를 새로 지으면 지문이 달라져 값을 다시 받는다.
 */
export function outlineKeyOf(outline: unknown): string {
  return createHash("sha256").update(JSON.stringify(outline)).digest("hex").slice(0, 40);
}

/**
 * charge_story 에 넘길 지문 — 어느 줄거리로 값을 셀까.
 *
 * paidOutline = 이번 만들기에서 **대본 값을 낸 줄거리**(브라우저가 다시 만들 때만 보낸다).
 * 2026-09-29 줄거리 확인 화면을 없애면서, 첫 '대본 만들기'에서 값을 낸 뒤 대본 화면에서
 * '다른 이야기로 새로 짓기'를 할 수 있게 됐다. 새 줄거리의 지문으로 세면 값을 또 받는다.
 * 그래서 값을 낸 줄거리의 지문으로 센다 — DB 는 그 줄을 찾아 '무료 다시 쓰기' 한 번으로 센다
 * (가격표 max_free_rewrites 까지, 넘으면 거절). SQL 은 한 글자도 안 바뀐다.
 *
 * 남이 보낸 값이라 믿지 않아도 된다: 값을 낸 적 없는 줄거리를 보내면 DB 가 그 줄을 못 찾아
 * 평소처럼 값을 받는다. 무료로 받는 대본 수는 값 낸 줄거리 하나에 가격표 횟수까지로 예전과 같다.
 */
export function storyChargeKey(outline: unknown, paidOutline: unknown | null): string {
  return outlineKeyOf(paidOutline ?? outline);
}

/**
 * 다시 만들기(paidOutline 이 옴)에서 받지 않을 줄거리 — 문제가 없으면 null, 있으면 부모에게 보일 말.
 *
 * 값을 낸 줄거리보다 장면이 많은 줄거리는 받지 않는다. 예전 무료 다시 쓰기는 같은 줄거리라 쪽수가 늘
 * 같았다. paidOutline 을 받으면서 둘이 달라질 수 있게 됐다 — 3장면 값만 내고 8장면 대본을 공짜로 받는
 * 길을 막는다(앱은 늘 같은 장면 수로 짓는다 — 줄거리 짓기가 장면 수를 맞춘다).
 */
export function redoPlotProblem(outlineScenes: number, paidScenes: number): string | null {
  return outlineScenes > paidScenes ? "장면 수가 처음 대본과 달라 다시 만들 수 없어요." : null;
}
