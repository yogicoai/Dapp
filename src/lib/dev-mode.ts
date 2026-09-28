/**
 * 개발자 모드 — 사장님 계정(fe)에서만 켜지는 요소들. **고객에게 알리지 않는다**(새 소식·안내·보고서에 넣지 않음).
 *
 * 사장님(2026-09-28): "클라이언트 쪽에 알리지 않고 너랑 나의 개발자 모드 안에서 보이는 방식".
 * 지금 여기 걸린 것: 부모 목소리(만들기·나레이션 고르기·읽기), 한 사람 전용 쪽 영상(lib/private-media).
 *
 * 이 파일은 순수 함수만 둔다 — 서버 경로(callerOf 의 username)와 화면(dev-mode-client) 둘 다 쓴다.
 */

/** 개발자 모드 아이디(profiles.username) */
export const DEV_MODE_USERNAMES: readonly string[] = ["fe"];

export function isDevUser(username: string | null | undefined): boolean {
  return !!username && DEV_MODE_USERNAMES.includes(username);
}

/** 개발자 모드가 아닌 사람이 막힌 요소를 부를 때 서버가 돌려줄 문구 */
export const DEV_ONLY_MESSAGE = "아직 준비 중인 기능이에요.";
