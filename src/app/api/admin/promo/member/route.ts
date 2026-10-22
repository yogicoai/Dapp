import { parseAdminId } from "@/lib/admin-console";
import { memberPromosOf } from "@/lib/promo-codes";
import { dbFailOrNotReady, fail, json, masterOnly } from "../../_guard";

/**
 * 관리실 회원 상세 '받은 혜택' — 이 회원이 넣은 혜택 코드(요기보 회원 혜택·구매 시리얼, 2026-10-22).
 * GET ?id=<회원 uuid> → { schemaReady, rows } — 진짜 문지기는 DB 함수(master_member_promos, 19번 SQL).
 */
export const GET = masterOnly(async (caller, request) => {
  const id = parseAdminId(new URL(request.url).searchParams.get("id"));
  if (!id.ok) return fail(id.error, 400);
  const { data, error } = await caller.db.rpc("master_member_promos", { p_owner: id.value });
  if (error) return dbFailOrNotReady(error, { rows: [] });
  return json({ schemaReady: true, rows: memberPromosOf(data) });
});
