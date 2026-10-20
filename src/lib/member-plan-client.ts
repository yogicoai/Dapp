/**
 * 내 요금제 읽기 — 브라우저 화면(홈 책장 · 동화 보기의 '다음 동화')이 쓴다.
 *
 * 표(member_plans)의 '본인 열람' 정책으로 내 줄만 읽힌다 — 요금제와 끝나는 때만(사유·지정한 사람은 못 읽는다).
 * 못 읽거나 표가 아직 없으면(SQL 전) null — 지정 없음과 같다(무료 회원과 같은 책장).
 * 한 창에서 한 번만 읽고 나눠 쓴다(같은 회원일 때). 관리자가 바꾸면 새로 고칠 때 보인다.
 */
import { activePlanKey, isMemberPlanKey, type MemberPlanKey } from "./member-plan";
import { getSupabase } from "./supabase";

let cached: { uid: string; plan: Promise<MemberPlanKey | null> } | null = null;

export function loadMyPlanKey(uid: string): Promise<MemberPlanKey | null> {
  if (cached && cached.uid === uid) return cached.plan;
  const plan = (async (): Promise<MemberPlanKey | null> => {
    const sb = getSupabase();
    if (!sb) return null;
    const { data, error } = await sb.from("member_plans").select("plan,ends_at").eq("owner", uid).maybeSingle();
    if (error || !data) return null;
    const row = data as { plan: unknown; ends_at: string | null };
    return isMemberPlanKey(row.plan) ? activePlanKey({ plan: row.plan, endsAt: row.ends_at }, Date.now()) : null;
  })().catch(() => null);
  cached = { uid, plan };
  return plan;
}
