import { NextResponse } from "next/server";
import { callerOf } from "@/lib/api-auth";
import { billingDepsFromEnv } from "@/lib/google-play-env";
import { parseOffered, syncPurchases } from "@/lib/google-play-server";
import { activePlanKey, isMemberPlanKey } from "@/lib/member-plan";

/**
 * POST /api/billing/google/sync { purchases?: [{ productId, purchaseToken }] } — 이 회원의 구글 결제를 다시 맞춘다.
 *
 * 부르는 곳: 앱을 연 뒤 한 번(components/BillingSync, 웹도) · 요금제 화면(앱 안 — 플레이의 '내 구매'를 함께 보낸다).
 * 구글이 다음 달 결제를 했거나(갱신) 해지·환불됐으면 요금제·이번 달 몫을 맞추고, 확정이 빠진 구매는 확정한다.
 * 연간 패스는 달이 바뀌면 그 달 몫을 채운다. 구매 토큰은 답에 넣지 않는다.
 * 답: { ready, plan, endsAt, active, starterOwned, packageName } — ready=false 면 결제 준비 전(키·SQL 없음).
 */
export async function POST(request: Request) {
  const caller = await callerOf(request);
  if (!caller) return NextResponse.json({ ready: false, error: "로그인이 필요해요." }, { status: 401 });

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    /* 본문 없이 불러도 된다 */
  }

  const deps = billingDepsFromEnv();
  if (!deps) return NextResponse.json({ ready: false });
  const r = await syncPurchases(caller.db, deps, parseOffered(body));
  if ("ok" in r) {
    // 준비 전(SQL·열쇠)이면 결제 단추를 숨기게 ready:false, 그 밖의 오류는 지금 상태만 모르는 것
    return NextResponse.json({ ready: r.code !== "not-ready", error: r.error }, { status: r.code === "not-ready" ? 200 : r.status });
  }

  const { data } = await caller.db.from("member_plans").select("plan,ends_at").eq("owner", caller.uid).maybeSingle();
  const row = (data ?? null) as { plan: unknown; ends_at: string | null } | null;
  const plan =
    row && isMemberPlanKey(row.plan) ? activePlanKey({ plan: row.plan, endsAt: row.ends_at }, Date.now()) : null;
  return NextResponse.json({
    ready: true,
    plan,
    endsAt: plan ? (row?.ends_at ?? null) : null,
    active: r.active,
    starterOwned: r.starterOwned,
    packageName: deps.gp.packageName,
  });
}
