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

/** 그림동화(삽화 포함) 1권 생성 비용(토큰). */
export const COST_ILLUSTRATED_BOOK = 10;

/** 글 동화(삽화 없음) 1권 생성 비용(토큰). */
export const COST_TEXT_BOOK = 3;

/** 베타 한정 — 아이디당 만들 수 있는 동화 최대 권수. (마스터는 제외) */
export const MAX_BOOKS_PER_USER = 5;
