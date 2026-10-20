import { siteAssetLinks } from "@/lib/android-app";

/**
 * /.well-known/assetlinks.json — 안드로이드 앱(TWA)이 이 사이트를 주소창 없이 띄우게 하는 확인 파일(lib/android-app).
 * 값은 Vercel 환경변수(ANDROID_PACKAGE_NAME · ANDROID_SHA256_CERT_FINGERPRINTS). 없으면 시험판 값(lib/android-app TEST_APP_*, 10-20).
 * 환경변수를 바꾸면 다시 배포해야 적용된다(정적으로 굽는다).
 */
export const dynamic = "force-static";

export function GET() {
  const body = siteAssetLinks(process.env.ANDROID_PACKAGE_NAME, process.env.ANDROID_SHA256_CERT_FINGERPRINTS);
  return Response.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
}
