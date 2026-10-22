import { parsePromoUsersQuery, promoUsersOf } from "@/lib/promo-codes";
import { dbFailOrNotReady, fail, json, masterOnly } from "../../_guard";

/**
 * 관리실 '혜택·이벤트 관리' — 혜택을 받은 고객 목록(사장님 2026-10-22 "해당 혜택 사용한 고객 리스트까지").
 *
 * GET ?codeId=<공용 코드 번호> | ?label=<시리얼 묶음 이름> | (둘 다 없으면 전체) & q=<아이디 일부·코드> & offset & limit(1~500)
 *   → { schemaReady, total, last7, rows: [{ id(회원 id), who(아이디), at, code, kind, label, 받은 혜택 }] }
 * 고객 아이디가 보이는 길이라 관리자만 — 진짜 문지기는 DB 함수(master_promo_users, 19번 SQL).
 */
export const GET = masterOnly(async (caller, request) => {
  const parsed = parsePromoUsersQuery(new URL(request.url).searchParams);
  if (!parsed.ok) return fail(parsed.error, 400);
  const v = parsed.value;
  const { data, error } = await caller.db.rpc("master_promo_users", {
    p_code_id: v.codeId,
    p_label: v.label,
    p_query: v.q,
    p_limit: v.limit,
    p_offset: v.offset,
  });
  if (error) return dbFailOrNotReady(error, { total: 0, last7: 0, rows: [] });
  return json({ schemaReady: true, ...promoUsersOf(data) });
});
