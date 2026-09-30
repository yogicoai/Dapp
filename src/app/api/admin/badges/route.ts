import { openIncidentCount } from "@/lib/admin";
import { dropMasterRows, type AdminBadges } from "@/lib/admin-console";
import { fetchIncidents, masterOwnerIds } from "../_data";
import { json, masterOnly } from "../_guard";

/**
 * GET /api/admin/badges — 왼쪽 메뉴 '의견·오류' 옆 숫자.
 *
 * 어느 화면에 있든 "돈 냈는데 책 없음"이 생기면 메뉴에서 바로 보이게, 겉틀이 들어올 때와
 * 처리 뒤에 한 번씩 부른다. 사고 목록은 칸 세 개(member·kinds·resolved_at)만 받아 가볍게 센다.
 * 한쪽(사고 / 의견)을 못 읽으면 그 숫자만 null — 화면은 그 배지를 감춘다(0 으로 속이지 않는다).
 *
 * 관리자 계정에서 생긴 사고·의견은 **언제나** 빼고 센다(사장님 2026-09-30).
 * 화면의 '내 계정 것도 보기' 스위치는 그 화면 목록에만 쓰고, 메뉴 숫자에는 절대 넣지 않는다 —
 * 그래서 이 경로는 주소의 스위치 값을 아예 읽지 않는다. 'member' 칸이 있어야 누구 줄인지 가릴 수 있다.
 */
export const GET = masterOnly(async (caller) => {
  const [inc, fb, masters] = await Promise.all([
    fetchIncidents(caller, { limit: 500, columns: "member,kinds,resolved_at" }),
    caller.db.rpc("master_feedback_list", { p_only_open: true, p_limit: 200 }),
    masterOwnerIds(caller),
  ]);
  if (inc.error) console.warn("[admin/badges] 사고 수 오류", inc.error.code, inc.error.message);
  if (fb.error) console.warn("[admin/badges] 의견 수 오류", fb.error.code, fb.error.message);

  const incRows = dropMasterRows(inc.rows, (r) => r.member, masters, false).rows;
  const open = incRows.filter((r) => !r.resolved_at);
  const posts = dropMasterRows(
    (fb.data as { owner: string | null; handled_at: string | null }[] | null) ?? [],
    (p) => p.owner,
    masters,
    false,
  ).rows;
  const body: AdminBadges = {
    incidents: inc.error ? null : openIncidentCount(incRows),
    paidNotSaved: inc.error ? null : open.filter((r) => r.kinds.includes("paid_not_saved")).length,
    feedback: fb.error ? null : posts.filter((p) => !p.handled_at).length,
  };
  return json(body);
});
