/**
 * 가상 토큰(크레딧) 경제 설정 — 베타.
 *
 * 토큰은 "가상 화폐"다. 실제 원가(동화 1권 ≈ ₩480~865)를 덮고 마진이 남게 값을 매긴다.
 * 여기 숫자만 바꾸면 앱 전체 가격 정책이 바뀐다. 결제 회의에서 확정되면 이 값만 조정.
 */

/** 1토큰의 가상 가격(원). 충전·표시용. */
export const TOKEN_PRICE_KRW = 100;

/** 신규 가입 시 무료로 주는 토큰. 그림동화 3권 체험 분량. */
export const SIGNUP_BONUS_TOKENS = 30;

/**
 * 장면(쪽)당 토큰 단가 — 비용은 "몇 장짜리냐"에 따라 달라진다.
 * 그림동화는 쪽마다 삽화를 그려 원가가 크니 쪽당 단가가 더 높다.
 */
export const COST_TEXT_PER_PAGE = 1; // 글 동화: 1토큰/장
export const COST_ILLUSTRATED_PER_PAGE = 2; // 그림동화: 2토큰/장

/** 동화 1권 토큰 비용 = 장면 수 × 쪽당 단가. (예: 그림 6장 = 12토큰, 글 6장 = 6토큰) */
export function bookTokenCost(pages: number, illustrated: boolean): number {
  const per = illustrated ? COST_ILLUSTRATED_PER_PAGE : COST_TEXT_PER_PAGE;
  return Math.max(1, Math.round(pages)) * per;
}

/**
 * 베타 한정 — 아이디당 만들 수 있는 동화 최대 권수. (마스터는 제외)
 *
 * 5권이면 토큰을 넉넉히 드려도 5권에서 막혀 버린다. 클라이언트와 약속한 "최소 10권"을
 * 토큰만 올려서는 지킬 수 없어 함께 올린다(2026-08-05). 토큰과 권수 두 개가 모두
 * 넉넉해야 실제로 10권을 만들 수 있다.
 */
export const MAX_BOOKS_PER_USER = 12;

/**
 * 부모 목소리 만들기(복제) 1회 비용 — 실측 원가 기준(2026-07-31, Typecast Lite $15/20만자):
 *   클로닝 슬롯 ₩420(= ₩21,000÷50) + 예상 낭독 크레딧 ₩1,000쯤(책 ~10편 × 첫 1회 합성,
 *   창작 ~₩53/편·전래 ~₩137/편, 이후엔 기기 캐시라 0원) ≈ 총 ₩1,400~1,500.
 * → 15토큰(₩1,500)으로 원가를 덮는다. 수정(2번째 만들기)도 같은 값. 듣기 자체는 무과금.
 */
export const COST_PARENT_VOICE = 15;
