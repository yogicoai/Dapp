/**
 * 지금 안드로이드 앱(구글 플레이, TWA) 안에서 열렸나 — 2026-10-20 안드로이드 출시 준비.
 *
 * 왜: 구글 플레이 정책상 앱 안에서는 디지털 상품을 구글 결제로만 팔 수 있고, 웹 결제(KG·시연 결제)로 데려가거나
 *     안내하면 안 된다. 그래서 앱 안이면 요금제·결제하기 화면이 웹 결제 단추를 감추고 '앱 결제'로 바꾼다.
 *
 * 알아보는 법(셋 중 하나):
 *  · 앱의 시작 주소에 ?app=android 를 붙인다(TWA 설정 startUrl = "/?app=android" — 웹 manifest 의 start_url 은 "/" 그대로).
 *  · 첫 화면의 referrer 가 android-app:// 로 시작한다(TWA 가 띄울 때 크롬이 붙인다).
 *  · 이번 실행에서 이미 알아낸 값(sessionStorage) — 화면을 옮겨도 이어진다.
 * localStorage 에 두지 않는다: TWA 와 같은 기기의 크롬 브라우저가 저장소를 같이 써서, 앱에서 한 번 열면
 * 브라우저로 사이트를 열어도 '앱 안'으로 잘못 알게 된다. sessionStorage 는 그 앱 실행(탭)에만 남는다.
 *
 * 순수 파일 — node --test 가 그대로 읽는다(화면 훅은 app-shell-client).
 */

export type AppShell = "android" | "web";

export const APP_SHELL_QUERY = "app";
export const APP_SHELL_ANDROID = "android";
/** sessionStorage 열쇠 */
export const APP_SHELL_KEY = "voice-storybook:app-shell";
/** TWA(Bubblewrap) 설정에 넣을 시작 주소 */
export const ANDROID_START_URL = `/?${APP_SHELL_QUERY}=${APP_SHELL_ANDROID}`;

export function detectAppShell(o: { search?: string | null; referrer?: string | null; stored?: string | null }): AppShell {
  if (o.stored === APP_SHELL_ANDROID) return "android";
  if (typeof o.referrer === "string" && o.referrer.startsWith("android-app://")) return "android";
  if (typeof o.search === "string" && o.search) {
    try {
      if (new URLSearchParams(o.search).get(APP_SHELL_QUERY) === APP_SHELL_ANDROID) return "android";
    } catch {
      /* 이상한 주소 — 웹으로 본다 */
    }
  }
  return "web";
}
