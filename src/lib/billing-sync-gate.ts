/**
 * 구글로 산 가족 패스를 읽기 전에 '먼저 맞추기' — 요금제(책장 단계)·남은 동화(이번 달 몫)를 읽는 화면이 쓴다(2026-11-26).
 *
 * 왜: 다음 달 결제(자동 갱신)를 구글이 해도 우리 서버는 앱이 동기화를 불러야 안다. 화면이 동기화보다 먼저 읽으면
 *     지난 기간 기록(끝난 요금제·끝난 이번 달 몫)으로 그려져 책장·만들기가 잠겨 보였다(시험 구독 5분 갱신에서 발견).
 *     그래서 '구글로 산 회원'(이 기기에서 한 번이라도 확인된 회원)이면 읽기 전에 동기화를 부르고 끝나기를 잠깐 기다린다.
 *
 * 동기화 자체는 lib/google-play-client 가 맡고 여기에 등록한다 — 서로 가져오며 꼬이지 않게 기다리는 문만 따로 둔 작은 파일.
 * 저장하는 것은 회원 id 마다 '구글로 산 회원인가' 표시("1")뿐이다 — 구매 토큰 같은 값은 두지 않는다.
 */

const BUYER_PREFIX = "voice-storybook:play-buyer:";
/** 기다리는 가장 긴 시간 — 넘으면 동기화를 기다리지 않고 지금 기록으로 그린다(동기화는 뒤에서 마저 끝난다) */
export const SETTLE_MAX_MS = 2500;

let runSync: (() => Promise<void>) | null = null;

/** lib/google-play-client 가 불러 둔다(동기화 함수) */
export function registerPlaySync(fn: () => Promise<void>): void {
  runSync = fn;
}

/** 이 기기에서 구글 결제가 확인된 회원 — 결제 직후·동기화가 구독/스타트팩을 찾았을 때 */
export function markPlayBuyer(uid: string): void {
  try {
    window.localStorage.setItem(BUYER_PREFIX + uid, "1");
  } catch {
    /* 저장소가 막힌 브라우저 — 기다리지 않고 읽는다(동기화는 화면을 옮길 때 따로 돈다) */
  }
}

export function isPlayBuyer(uid: string): boolean {
  try {
    return window.localStorage.getItem(BUYER_PREFIX + uid) === "1";
  } catch {
    return false;
  }
}

/** 구글로 산 회원이면 동기화(10분에 한 번 · 알던 만료가 지났으면 바로)를 부르고 끝나기를 기다린다 — 길어야 maxMs */
export async function settlePlaySync(uid: string, maxMs = SETTLE_MAX_MS): Promise<void> {
  if (typeof window === "undefined" || !runSync || !isPlayBuyer(uid)) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    runSync().catch(() => {}),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, maxMs);
    }),
  ]);
  if (timer !== undefined) clearTimeout(timer);
}
