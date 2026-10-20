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
