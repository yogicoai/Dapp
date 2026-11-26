import { NextResponse } from "next/server";
import { callerOf } from "@/lib/api-auth";
import { billingDepsFromEnv } from "@/lib/google-play-env";
import { VERIFY_MESSAGE, verifyPurchase } from "@/lib/google-play-server";

/**
 * POST /api/billing/google/verify { productId, purchaseToken } — 앱(TWA)에서 구글 플레이로 결제한 직후 부른다.
 *
 * 서버가 구글에 직접 물어 진짜 결제인지 보고, 그 회원에게 요금제·이번 달 몫·스타트팩을 준 뒤 구글에 확정한다
 * (lib/google-play-server). 토큰은 처음 확인한 회원의 것으로 묶인다 — 남의 토큰으로는 받을 수 없다.
 * 답: { ok:true, productId, plan, endsAt, granted } · 실패 { ok:false, code, error }(화면이 error 를 그대로 보인다).
 */
export async function POST(request: Request) {
  const caller = await callerOf(request);
  if (!caller) return NextResponse.json({ ok: false, code: "login", error: "로그인이 필요해요." }, { status: 401 });

  let body: Record<string, unknown> = {};
  try {
    const raw: unknown = await request.json();
    if (raw && typeof raw === "object" && !Array.isArray(raw)) body = raw as Record<string, unknown>;
  } catch {
    /* 아래에서 모양으로 거절한다 */
  }

  const deps = billingDepsFromEnv();
  if (!deps) {
    return NextResponse.json({ ok: false, code: "not-ready", error: VERIFY_MESSAGE["not-ready"] }, { status: 503 });
  }
  const r = await verifyPurchase(caller.db, body.productId, body.purchaseToken, deps);
  if (!r.ok) return NextResponse.json({ ok: false, code: r.code, error: r.error }, { status: r.status });
  return NextResponse.json(r);
}
