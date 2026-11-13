/**
 * 서비스 이름(사장님 2026-11-12 확정) — 화면·검색 노출·앱 설치 이름·약관이 모두 여기 값을 쓴다.
 *  - 국내 이름 '마음보따리', 해외 이름 'Familitale'(도메인 familitale.com 예정).
 *  - 부제 '아이의 마음을 이야기로 푸는 가족 동화' — 스토어·검색 제목에 붙여 '가족 동화'가 검색어 몫을 한다.
 * 예전 이름은 '우리 가족 보이스 동화'(줄여 '보이스 동화')였다. 이 기기 저장 열쇠(voice-storybook:…)·안드로이드 패키지 이름
 * (kr.yogico.voicestory)은 바꾸면 저장된 값·설치된 앱이 끊겨서 그대로 둔다 — 손님에게 보이지 않는다.
 * 순수 값만 둔다(node --test 가 그대로 읽는다).
 */

/** 국내 서비스 이름 */
export const APP_NAME = "마음보따리";

/** 해외 서비스 이름(영문·일문 앱) */
export const APP_NAME_EN = "Familitale";

/** 부제 — 검색·스토어 제목에 이름과 함께 */
export const APP_TAGLINE = "아이의 마음을 이야기로 푸는 가족 동화";

/** 이름 + 부제 — 첫 화면 검색 제목·스토어 이름(구글 플레이 30자 안: 29자) */
export const APP_TITLE = `${APP_NAME} - ${APP_TAGLINE}`;
