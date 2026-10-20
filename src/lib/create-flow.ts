/**
 * 동화 만들기 순서 — 화면 위 '① 대본 만들기 › ② 그림 그리기 › ③ 동화 완성' 줄, 대본 화면의 '다시 만들기' 셈,
 * 옛 임시저장을 어느 화면으로 되살릴지.
 *
 * 왜 따로 두나: 2026-09-29 사장님 — "이야기 짓기 > 대본 완성 > 이미지 생성 > 이야기 완성 … '이야기 짓기'가
 * 대본 완성인가 생각할 것 같아. 너무 과정 과정이 길어지는 것 같아서." 그래서 줄거리 확인 화면을 없애고
 * 첫 단추가 곧바로 대본까지 쓰게 했다(create/page.tsx makeScript). 값이 걸린 셈이라 화면과 떼어 시험한다.
 *
 * 이 파일은 순수 함수만 둔다(브라우저 것을 쓰지 않는다).
 */

/** 부모에게 보여 주는 만들기 순서 — 대본을 읽고 고친 뒤 그림을 그린다(그림 값은 그때 따로). */
export const MAKE_STEPS = ["대본 만들기", "그림 그리기", "동화 완성"] as const;

/** 순서 줄의 자리 — 0 대본 만들기 · 1 그림 그리기 · 2 동화 완성. */
export type MakeStepIndex = 0 | 1 | 2;

/**
 * 한 권의 장면(쪽) 수 — 쪽 수 = 그림 장수 = 값이라 고르게 두지 않는다(2026-09-28 사장님 "6장면으로 만들어요").
 * 운영은 늘 이 값이다. 로컬 시험만 만들기 화면이 NEXT_PUBLIC_TEST_PAGE_COUNT 로 줄인다. 사용 가이드(/guide)도 이 값을 쓴다.
 */
export const BOOK_PAGE_COUNT = 6;

/**
 * 대본 화면의 '다시 만들기' 남은 횟수. null = 끝없음(관리자는 토큰도 횟수도 세지 않는다).
 *
 * 값은 서버가 센다(supabase-setup.sql charge_story). 대본 값을 낸 줄거리 하나마다 무료 다시 쓰기
 * 횟수(가격표 max_free_rewrites, 기본 2)가 있다. '다른 이야기로 새로 짓기'도 대본을 한 번 더 쓰는 것이라
 * 서버에 '값을 낸 줄거리'를 함께 보내 같은 횟수에서 센다(api/story 의 paidOutline) — 그래서 두 단추가
 * 무료 횟수를 **함께** 쓴다. 새로 짓기는 줄거리도 새로 지으므로 그 횟수(maxReplots)가 한 번 더 걸린다.
 *
 * @param used     이 대본으로 이미 쓴 무료 다시 만들기(서버가 돌려준 rewrites)
 * @param maxFree  가격표의 무료 다시 쓰기 횟수
 * @param replots  이 대본으로 새로 지은 횟수
 * @param maxReplots 새로 짓기 상한
 */
export function redoLeft(o: {
  master: boolean;
  used: number;
  maxFree: number;
  replots: number;
  maxReplots: number;
}): { rewrite: number | null; replot: number | null } {
  if (o.master) return { rewrite: null, replot: null };
  const free = Math.max(0, Math.floor(o.maxFree) - Math.max(0, Math.floor(o.used)));
  const plots = Math.max(0, Math.floor(o.maxReplots) - Math.max(0, Math.floor(o.replots)));
  return { rewrite: free, replot: Math.min(free, plots) };
}

/**
 * 다시 만들 때 서버에 '값을 낸 줄거리'로 보낼 것. 값을 아직 안 냈으면 null(= 서버가 값을 받는다).
 *
 * paidOutline 이 없는 것은 2026-09-29 전에 만든 임시저장이다 — 그때는 값을 낸 뒤 줄거리를 바꿀 길이
 * 없었으므로 지금 줄거리(outline)가 곧 값을 낸 줄거리다. (되살릴 때 restorePaidOutline 이 이미 채우고,
 * 다시 만들기가 끝나면 화면이 보낸 것을 적는다 — 여기 대체는 한 겹 더 두는 것이다.)
 */
export function paidPlot<T>(scriptCharged: boolean, paidOutline: T | null | undefined, outline: T | null): T | null {
  if (!scriptCharged) return null;
  return paidOutline ?? outline ?? null;
}

/**
 * 서버가 '무료 다시 쓰기를 다 썼다'고 거절했나(charge_story 의 22023 → api/story 가 402 로 돌려준다).
 * 그 말("같은 줄거리로 다시 쓰기 횟수를 다 썼어요")은 새로 짓기에는 맞지 않아서 화면이 제 말로 바꾼다.
 */
export function isRedoExhausted(status: number, message: unknown): boolean {
  return status === 402 && typeof message === "string" && /다시 쓰기 횟수/.test(message);
}

/** 임시저장에서 읽는 것 — 단계·대본·대본 값을 냈는지. */
type DraftLike = { step: string; story: unknown; scriptCharged?: boolean };

/**
 * 임시저장을 어느 화면으로 되살릴지.
 *
 * 2026-09-29 전 임시저장에는 '줄거리 확인' 단계(outline)가 있다. 그 화면은 없앴다.
 *  · 대본이 있고 대본 값을 냈으면 대본 화면 — 값을 또 받지 않는다.
 *  · 아니면 성우 화면. 거기 '대본 만들기 · 토큰 N개' 단추가 값을 밝히고, 눌러야 값이 나간다.
 *    되살리자마자 대본을 이어 쓰면 부모가 누르지도 않은 대본 값이 나가므로 그러지 않는다.
 *    그 줄거리는 버리지 않고 '대본을 못 받은 줄거리'로 들고 간다(restorePendingPlot) — 단추를 누르면
 *    그 줄거리로 대본을 쓴다(옛 화면에서 '네, 만들게요' 뒤 끊겼다면 서버가 값 낸 줄을 찾아 또 받지 않는다).
 * 대본 화면인데 대본이 없는(깨진) 임시저장도 성우 화면으로 — 빈 카드가 뜨지 않게.
 */
export function resumeStep(draft: DraftLike): "child" | "theme" | "style" | "story" {
  if (draft.step === "story") return draft.story ? "story" : "style";
  if (draft.step === "outline") return draft.story && draft.scriptCharged ? "story" : "style";
  if (draft.step === "child" || draft.step === "theme" || draft.step === "style") return draft.step;
  return "theme";
}

/**
 * 되살릴 때 '대본 값을 낸 줄거리'(paidOutline).
 *
 * 2026-09-29 전 임시저장엔 이 칸이 없다. 그때는 값을 낸 뒤 줄거리를 바꿀 길이 없었으므로 저장된 줄거리가
 * 곧 값을 낸 줄거리다 — 여기서 **채워 둔다**. 비워 두면 첫 '새로 짓기' 뒤 지금 줄거리가 새 것으로 바뀌어,
 * 다음 다시 만들기가 새 줄거리 지문으로 세어져 대본 값이 또 나갔다(단추는 '토큰 없이'라고 말하는데).
 * 값을 안 냈으면 null — 다시 만들기가 없다.
 */
export function restorePaidOutline<T>(draft: {
  scriptCharged?: boolean;
  outline: T | null;
  paidOutline?: T | null;
}): T | null {
  if (!draft.scriptCharged) return null;
  return draft.paidOutline ?? draft.outline ?? null;
}

/** 줄거리는 나왔는데 대본을 아직 못 받은 것 — 그 줄거리와, 그때 줄거리를 지은 재료(basis). */
export type PendingPlot<T> = {
  plot: T;
  /**
   * 줄거리 요청 본문(JSON) — 재료가 그대로인지 가리는 열쇠. 재료를 바꿨으면 이 줄거리를 쓰지 않는다.
   * null = 모름(옛 '줄거리 확인' 임시저장에서 온 것) — 재료 화면으로 돌아가면 버린다.
   */
  basis: string | null;
};

/**
 * 되살릴 때 '대본을 못 받은 줄거리' — 성우 화면으로 되살릴 때만.
 *  · 새 임시저장: 저장해 둔 것(대본을 기다리다 새로고침·창 닫힘·폰이 탭을 닫음).
 *  · 옛 '줄거리 확인' 임시저장: 그 줄거리(부모가 보고 고쳤을 수도 있다). 재료 열쇠는 모른다(basis null).
 */
export function restorePendingPlot<T>(
  draft: DraftLike & { outline: T | null; pendingPlot?: PendingPlot<T> | null },
): PendingPlot<T> | null {
  if (resumeStep(draft) !== "style") return null;
  if (draft.pendingPlot?.plot) return draft.pendingPlot;
  return draft.step === "outline" && draft.outline ? { plot: draft.outline, basis: null } : null;
}

/**
 * '대본 만들기'에서 이 줄거리를 다시 쓸까 — 재료가 그대로일 때만(열쇠를 모르면 쓴다).
 *
 * 왜: 서버는 대본을 쓰기 **전에** 값을 받는다(charge_story). 줄거리가 나오고 대본을 기다리는 2분 사이에
 * 끊기면(ESC·새로고침·폰이 탭을 닫음·네트워크) 값은 나갔는데 대본은 못 받는다. 그때 줄거리를 새로 지으면
 * 지문이 달라 값을 **또** 받는다. 같은 줄거리로 다시 쓰면 서버가 값 낸 줄을 찾아 무료로 쓰고,
 * 값이 안 나갔거나(끊긴 게 서버에 닿기 전) 되돌려졌으면(대본 실패 환불) 평소처럼 한 번 받는다.
 * (예전 줄거리 확인 화면은 줄거리를 화면·임시저장에 들고 있어서 저절로 그랬다.)
 */
export function reusablePlot<T>(pending: PendingPlot<T> | null, basis: string): T | null {
  if (!pending) return null;
  return pending.basis === null || pending.basis === basis ? pending.plot : null;
}

/**
 * 성우 화면 '대본 만들기'를 막을 까닭 — 없으면 null.
 *  · limit  권수 상한(베타).
 *  · tokens 잔액이 대본 값보다 적다. 단, 대본을 못 받은 줄거리로 이어 쓸 때(resuming)는 막지 않는다 —
 *           그 줄거리로 이미 값이 나갔을 수 있어서(잔액이 그만큼 줄어 있다) 서버는 무료로 쓴다.
 *           정말 값이 필요한데 모자라면 서버가 값을 받지 않고 거절한다(402).
 */
export function makeScriptBlock(o: {
  shortOnTokens: boolean;
  bookLimitReached: boolean;
  resuming: boolean;
}): "limit" | "tokens" | null {
  if (o.bookLimitReached) return "limit";
  if (o.shortOnTokens && !o.resuming) return "tokens";
  return null;
}
