/**
 * 고르는 칸을 고르게 놓기 — 마지막 줄에 하나만 홀로 남지 않게 한 줄 칸 수를 고른다(2026-10-21 사장님: '3개 + 1개'일 때
 * '2개 + 2개'로 잡아 보기 편하게). 동화 만들기 질문 칸(components/create/QuestionFlow)이 쓴다.
 *  · 한 줄에 다 들어가면(n ≤ max) 그 줄을 꽉 채운다 — 2개면 2칸.
 *  · 아니면 max 칸과 한 칸 적은 칸 중 마지막 줄이 홀로 남지 않는 쪽, 둘 다 괜찮으면 넓은 쪽(줄이 적다).
 *  · 어떻게 해도 홀로 남으면(예: 7개) max 칸으로 두고 화면이 그 하나를 가운데에 놓는다(lonelyLast).
 *
 * 순수 파일 — node --test 가 그대로 읽는다.
 */
export function balancedCols(n: number, max: number): number {
  if (n <= 1) return 1;
  if (n <= max) return n;
  const lonely = (c: number) => n % c === 1;
  for (const c of [max, max - 1]) {
    if (c >= 2 && !lonely(c)) return c;
  }
  return max;
}

/** 마지막 줄에 하나만 남는가 — 그 하나를 가운데 칸에 놓을 때 */
export function lonelyLast(n: number, cols: number): boolean {
  return cols > 1 && n > cols && n % cols === 1;
}
