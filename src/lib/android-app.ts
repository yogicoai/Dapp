/**
 * 안드로이드 앱(구글 플레이, TWA)과 사이트를 잇는 값 — 2026-10-20 안드로이드 출시 준비.
 *
 * TWA 는 사이트를 주소창 없이 앱처럼 띄운다. 그러려면 사이트의 /.well-known/assetlinks.json 이
 * "이 앱(패키지 이름 + 서명 인증서 지문)이 이 사이트의 주인"이라고 말해 줘야 한다. 안 맞으면 앱 위에 주소창이 뜬다.
 * 값은 Vercel 환경변수로 넣는다(앱 서명 키는 플레이 콘솔 '앱 무결성'에서 나온다 — 코드에 박지 않는다):
 *   ANDROID_PACKAGE_NAME              예: kr.yogico.voicestory
 *   ANDROID_SHA256_CERT_FINGERPRINTS  예: AB:CD:…(32쌍) — 여러 개면 쉼표로(플레이 앱 서명 키 + 올리기 키)
 * 값이 없거나 모양이 틀리면 빈 목록 — 사이트는 그대로 뜬다.
 *
 * 순수 파일 — node --test 가 그대로 읽는다.
 */

const PACKAGE_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const FINGERPRINT_RE = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

export type AssetLink = {
  relation: string[];
  target: { namespace: "android_app"; package_name: string; sha256_cert_fingerprints: string[] };
};

/** 환경변수 두 값 → assetlinks.json 본문. 틀린 지문은 버리고, 맞는 것이 하나도 없으면 빈 목록 */
export function assetLinksFor(packageName: string | undefined | null, fingerprintsRaw: string | undefined | null): AssetLink[] {
  const pkg = (packageName ?? "").trim();
  if (!PACKAGE_RE.test(pkg)) return [];
  const prints = (fingerprintsRaw ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter((s) => FINGERPRINT_RE.test(s));
  const unique = [...new Set(prints)];
  if (unique.length === 0) return [];
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: pkg, sha256_cert_fingerprints: unique },
    },
  ];
}

/**
 * 기본 연결 값 — Vercel 환경변수가 비어 있을 때만 쓴다(지문은 비밀이 아니다 — assetlinks.json 에 그대로 공개되는 값).
 *  · 정식 올리기 키(2026-11-13, 이 PC 의 maeum-android/keys/upload.keystore — scripts/android/build-twa.mjs 가 서명) —
 *    폰에 바로 깔아 보는 APK 가 이 키로 서명된다.
 *  · 시험 키(2026-10-20 시험판 1~8판) — 키 파일은 사라졌지만 이미 깔린 시험판이 주소창 없이 열리게 남긴다.
 * 플레이에 올리면 구글이 '앱 서명 키'로 다시 서명한다 — 플레이 콘솔 '앱 무결성'의 그 지문을 RELEASE_APP_FINGERPRINTS 에 더하거나
 * 환경변수(앱 서명 키 + 올리기 키)로 넣으면 플레이에서 받은 앱도 주소창 없이 열린다.
 */
export const TEST_APP_PACKAGE = "kr.yogico.voicestory";
export const UPLOAD_KEY_FINGERPRINT = "EA:C6:A1:6A:D8:8E:D9:A9:D2:24:F9:C7:B4:37:BC:73:12:4E:F2:F5:A7:13:0F:76:B8:27:89:92:0A:E1:37:18";
export const TEST_APP_FINGERPRINT = "DE:96:47:BC:7F:34:90:B8:FD:83:FC:7D:27:6C:50:7B:B2:A6:CC:FD:53:E6:E8:DD:35:02:16:4B:33:F0:29:18";
/** 환경변수가 없을 때 내보내는 지문들 — 플레이 앱 서명 키 지문을 받으면 맨 앞에 더한다 */
export const RELEASE_APP_FINGERPRINTS: readonly string[] = [UPLOAD_KEY_FINGERPRINT, TEST_APP_FINGERPRINT];

/** 사이트가 내보내는 assetlinks — 환경변수 값이 맞으면 그것, 없거나 틀리면 기본 연결 값 */
export function siteAssetLinks(packageName: string | undefined | null, fingerprintsRaw: string | undefined | null): AssetLink[] {
  const fromEnv = assetLinksFor(packageName, fingerprintsRaw);
  return fromEnv.length > 0 ? fromEnv : assetLinksFor(TEST_APP_PACKAGE, RELEASE_APP_FINGERPRINTS.join(","));
}
