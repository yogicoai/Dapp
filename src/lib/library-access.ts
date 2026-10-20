/**
 * 책장 자물쇠 값 읽기 — 브라우저 화면(홈 책장 · 동화 보기의 '다음 동화')이 쓴다. 홈 가족 액자 안내 값(loadFamilyOffer)도 같은 답에서 꺼낸다.
 *
 * 공개 경로(/api/offer-settings) GET 하나만 한다 — 로그인·DB 에 닿지 않는다.
 * 한 번 읽은 값은 창을 연 동안 나눠 쓴다. 못 읽으면 '다 열림'(지금처럼)으로 두고, 다음에 다시 읽게 비운다 —
 * 설정을 못 읽었다고 아이 책장을 잠그지 않는다.
 * 상대 경로만 쓴다(src/lib 의 다른 파일과 같이).
 */
import {
  asFamilyOffer,
  asLibraryAccess,
  DEFAULT_FAMILY_OFFER,
  OPEN_LIBRARY,
  type FamilyOfferNote,
  type LibraryAccess,
} from "./offer-settings.ts";

/** 공개 경로의 답 그대로 — 책장 자물쇠와 가족 액자 안내가 한 번 읽은 것을 나눠 쓴다. 못 읽으면 null(다음에 다시 읽게 비운다). */
let pending: Promise<unknown> | null = null;

function loadPublicOffer(): Promise<unknown> {
  if (!pending) {
    pending = fetch("/api/offer-settings")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`offer-settings ${res.status}`))))
      .catch(() => {
        pending = null;
        return null;
      });
  }
  return pending;
}

export function loadLibraryAccess(): Promise<LibraryAccess> {
  return loadPublicOffer().then((json) => (json === null ? OPEN_LIBRARY : asLibraryAccess(json)));
}

/** 홈 가족 액자 안내 한 줄 값(가족 패스에 든 캐릭터 수 · 더 그릴 때 크레딧). 못 읽으면 기본값. */
export function loadFamilyOffer(): Promise<FamilyOfferNote> {
  return loadPublicOffer().then((json) => (json === null ? DEFAULT_FAMILY_OFFER : asFamilyOffer(json)));
}
