/**
 * 동화 만들기 같은 AI 생성을 누가 쓸 수 있나 — 사장님 2026-10-19 "yogico·fe 아이디 빼고는 생성 자체가 되면 안 돼
 * (쿠키 구매나 결제가 없다면)".
 *
 * 결제(PG)가 열리기 전에는:
 *   · 관리자 계정(profiles.is_master — yogico 회사 마스터 · fe 개발 시험 계정)
 *   · 관리실 회원 상세에서 결제 요금제(스타트팩 · 월간 · 연간)를 지정해 준 회원(끝나는 날이 안 지난 것)
 * 만 만든다. '무료' 요금제나 지정 없음, 가입만 한 회원은 못 만든다 — 세계명작·전래동화 듣기만.
 * 결제를 붙이면 결제 확인 뒤 서버가 member_plans(또는 구독·크레딧)를 채우고, 이 판단을 그대로 쓴다.
 *
 * 순수 함수만 둔다(화면·서버·시험 공용). 서버 문지기는 lib/create-access-server(canCreate).
 */
import { activePlanKey, isMemberPlanKey, type MemberPlanKey } from "./member-plan.ts";

/** 만들 수 있는 요금제 */
export const CREATE_PLANS: readonly MemberPlanKey[] = ["starter", "monthly", "yearly"];

export const CREATE_LOCKED_CODE = "plan-required";
export const CREATE_LOCKED_MESSAGE = "동화 만들기는 가족 패스나 스타트팩을 시작하면 쓸 수 있어요.";

/** member_plans 한 줄(없으면 null)로 — 결제 요금제이고 끝나는 날이 안 지났나 */
export function planAllowsCreate(row: { plan: unknown; ends_at: string | null } | null | undefined, now: number): boolean {
  if (!row || !isMemberPlanKey(row.plan)) return false;
  const k = activePlanKey({ plan: row.plan, endsAt: row.ends_at ?? null }, now);
  return k !== null && CREATE_PLANS.includes(k);
}

/** 관리자이거나 결제 요금제가 살아 있으면 만든다 */
export function canCreateWith(isMaster: boolean, row: { plan: unknown; ends_at: string | null } | null | undefined, now: number): boolean {
  return isMaster || planAllowsCreate(row, now);
}
