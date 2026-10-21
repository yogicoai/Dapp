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

/** sessionStorage 열쇠 — 이번 실행에서 '동화 나라로 이동 중' 화면을 이미 보였나(다시 불러오기에는 안 띄운다) */
export const APP_INTRO_KEY = "voice-storybook:app-intro";

/**
 * 첫 그림 전에 도는 작은 스크립트(app/layout 의 body 맨 앞, 2026-10-21 사장님 "켜질 때 아이콘이 커졌다 깜빡 — 오류 같다").
 *  · 앱 안이면 <html data-app-shell="android"> — 첫 그림부터 바탕을 검게 칠한다(globals.css). React 가 붙은 뒤에 칠하면
 *    그 사이 흰 바탕이 한 번 비쳤다.
 *  · 앱을 새로 켠 처음(시작 주소 ?app=android 또는 referrer android-app://, 이번 실행에서 아직 안 보였을 때)이면
 *    <html data-app-intro> — '동화 나라로 이동 중' 화면(components/AppIntro)이 첫 그림부터 뜬다.
 * 모듈을 불러오기 전에 돌아야 해서 글자 그대로 심는다. 판단은 detectAppShell 과 같다(app-shell.test 가 둘을 맞춰 본다).
 */
export const APP_SHELL_BOOT_SCRIPT = `(function(){try{
var d=document.documentElement,a=${JSON.stringify(APP_SHELL_ANDROID)},s=null,q=false,r=false,shown=null;
try{s=sessionStorage.getItem(${JSON.stringify(APP_SHELL_KEY)})}catch(e){}
try{q=new URLSearchParams(location.search).get(${JSON.stringify(APP_SHELL_QUERY)})===a}catch(e){}
r=typeof document.referrer==="string"&&document.referrer.indexOf("android-app://")===0;
if(s!==a&&!q&&!r)return;
d.setAttribute("data-app-shell",a);
try{sessionStorage.setItem(${JSON.stringify(APP_SHELL_KEY)},a)}catch(e){}
try{shown=sessionStorage.getItem(${JSON.stringify(APP_INTRO_KEY)})}catch(e){}
if((q||r)&&!shown){d.setAttribute("data-app-intro","");try{sessionStorage.setItem(${JSON.stringify(APP_INTRO_KEY)},"1")}catch(e){}}
}catch(e){}})();`;

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
