import { NextResponse } from "next/server";
import { billingKeyHash, billingServerKey, googlePlayClientFromEnv } from "@/lib/google-play";

/**
 * GET /api/billing/google/status — 서버가 구글 결제를 할 준비가 됐나(로그인 없이, 점검용).
 *
 *  configured  서비스 계정·패키지 환경변수를 읽었나(Vercel Production)
 *  keyHash8    서버 열쇠 지문(sha256)의 앞 8자리 — DB(billing_server_keys)·저장소 SQL 에 이미 있는 값의 앞부분이라
 *              밝혀도 되는 값이다. 열쇠·키 내용은 내보내지 않는다. 저장소 SQL 의 지문과 앞자리가 같으면 열쇠가 맞다.
 */
export function GET() {
  const gp = googlePlayClientFromEnv();
  const key = billingServerKey();
  return NextResponse.json(
    {
      configured: !!gp && !!key,
      packageName: gp?.packageName ?? null,
      keyHash8: key ? billingKeyHash(key).slice(0, 8) : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
