/**
 * 책장 자물쇠 값 읽기 — 브라우저 화면(홈 책장 · 동화 보기의 '다음 동화')이 쓴다.
 *
 * 공개 경로(/api/offer-settings) GET 하나만 한다 — 로그인·DB 에 닿지 않는다.
 * 한 번 읽은 값은 창을 연 동안 나눠 쓴다. 못 읽으면 '다 열림'(지금처럼)으로 두고, 다음에 다시 읽게 비운다 —
 * 설정을 못 읽었다고 아이 책장을 잠그지 않는다.
 * 상대 경로만 쓴다(src/lib 의 다른 파일과 같이).
 */
import { asLibraryAccess, OPEN_LIBRARY, type LibraryAccess } from "./offer-settings.ts";

let pending: Promise<LibraryAccess> | null = null;

export function loadLibraryAccess(): Promise<LibraryAccess> {
  if (!pending) {
    pending = fetch("/api/offer-settings")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`offer-settings ${res.status}`))))
      .then(asLibraryAccess)
      .catch(() => {
        pending = null;
        return OPEN_LIBRARY;
      });
  }
  return pending;
}
