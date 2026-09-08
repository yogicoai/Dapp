/**
 * 가상 토큰(크레딧) 경제 설정 — 베타.
 *
 * 토큰은 "가상 화폐"다. 실제 원가(동화 1권 ≈ ₩480~865)를 덮고 마진이 남게 값을 매긴다.
 * 여기 숫자만 바꾸면 앱 전체 가격 정책이 바뀐다. 결제 회의에서 확정되면 이 값만 조정.
 */

/** 1토큰의 가상 가격(원). 충전·표시용. */
export const TOKEN_PRICE_KRW = 100;

/**
 * 신규 가입 시 무료로 주는 토큰.
 *
 * 지금은 한 권이 5장 고정이라 그림동화 한 권이 10토큰이다(대본 5 + 그림 5).
 * 그래서 200이면 20권치다. (장수는 create 화면의 FIXED_PAGE_COUNT 가 정한다.
 * 2026-09-08 에 6장 → 5장으로 내렸다. 그전에는 한 권 12토큰이라 16권치였다.)
 *
 * 주의 — 권수 상한(MAX_BOOKS_PER_USER)은 30이라 여전히 토큰이 먼저 떨어진다.
 * 새로 가입한 사람은 20권에서 멈춘다. 30권을 다 만들게 하려면 300이 필요하다(10 × 30).
 * 기존 회원은 이미 받은 잔액이 달라 각자 다르다.
 * 올릴지는 결제 정책과 함께 정할 일이라 여기서 임의로 바꾸지 않는다.
 *
 * 이 값을 바꾸면 supabase-setup.sql의 가입 트리거 숫자도 함께 바꿔야 한다.
 */
export const SIGNUP_BONUS_TOKENS = 200;

/**
 * 장면(쪽)당 토큰 단가 — 비용은 "몇 장짜리냐"에 따라 달라진다.
 * 그림동화는 쪽마다 삽화를 그려 원가가 크니 쪽당 단가가 더 높다.
 */
export const COST_TEXT_PER_PAGE = 1; // 글 동화: 1토큰/장
export const COST_ILLUSTRATED_PER_PAGE = 2; // 그림동화: 2토큰/장

/** 동화 1권 토큰 비용 = 장면 수 × 쪽당 단가. (지금은 5장 고정 — 그림 10토큰, 글 5토큰) */
export function bookTokenCost(pages: number, illustrated: boolean): number {
  const per = illustrated ? COST_ILLUSTRATED_PER_PAGE : COST_TEXT_PER_PAGE;
  return Math.max(1, Math.round(pages)) * per;
}

/*
 * 값을 두 번에 나눠 받는다 — 대본을 만들 때 한 번, 그림을 붙일 때 한 번.
 *
 * 예전엔 대본과 그림을 한 번에 만들고 끝에서 한꺼번에 받았다. 그러면 부모가 대본을
 * 보기도 전에 그림 값까지 나가서, 이야기가 마음에 안 들어도 되돌릴 수가 없었다.
 * 이제 대본을 먼저 보고 고친 뒤 "이걸로 그림 만들자" 할 때 그림 값을 낸다.
 * 두 값을 더하면 예전과 같다(쪽당 2토큰) — 나누기만 한 것이지 올린 게 아니다.
 */

/** 대본까지 만드는 값. 글 동화 한 권과 같다. */
export function scriptTokenCost(pages: number): number {
  return Math.max(1, Math.round(pages)) * COST_TEXT_PER_PAGE;
}

/** 대본 값을 이미 낸 책에 그림을 붙일 때 더 드는 값. */
export function illustrationTokenCost(pages: number): number {
  return Math.max(1, Math.round(pages)) * (COST_ILLUSTRATED_PER_PAGE - COST_TEXT_PER_PAGE);
}

/**
 * 베타 한정 — 아이디당 만들 수 있는 동화 최대 권수. (마스터는 제외)
 *
 * 5 → 10 → 15 → 30으로 올려 왔다(30권은 2026-08-25).
 *
 * 권수와 토큰 두 개가 모두 넉넉해야 실제로 그만큼 만들 수 있다 — 예전에 토큰만
 * 올렸다가 권수에 막힌 적이 있고, 지금은 반대다. 가입 토큰이 200 이고 한 권이
 * 10토큰(5장 고정)이라 **새 회원은 20권에서 토큰이 먼저 떨어진다**. 30권을 다
 * 만들게 하려면 300이 필요하다(10 × 30). 장수를 5로 내리면서 12권 → 20권으로
 * 늘어 격차는 줄었다. 결제 정책과 함께 정한다 — SIGNUP_BONUS_TOKENS 주석 참고.
 */
export const MAX_BOOKS_PER_USER = 30;

/**
 * 부모 목소리 만들기(복제) 1회 비용 — 실측 원가 기준(2026-07-31, Typecast Lite $15/20만자):
 *   클로닝 슬롯 ₩420(= ₩21,000÷50) + 예상 낭독 크레딧 ₩1,000쯤(책 ~10편 × 첫 1회 합성,
 *   창작 ~₩53/편·전래 ~₩137/편, 이후엔 기기 캐시라 0원) ≈ 총 ₩1,400~1,500.
 * → 15토큰(₩1,500)으로 원가를 덮는다. 수정(2번째 만들기)도 같은 값. 듣기 자체는 무과금.
 */
export const COST_PARENT_VOICE = 15;
