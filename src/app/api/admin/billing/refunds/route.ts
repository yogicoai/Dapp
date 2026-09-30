import { mapRefundRow, parseBillingQuery, toBillingList } from "@/lib/admin-billing";
import { dbFailOrNotReady, fail, json, masterOnly } from "../../_guard";

/**
 * GET /api/admin/billing/refunds?status&q&limit — 결제 환불 목록(master_payment_refunds_list).
 * 토큰 환불(장부 되돌리기)과 다른 것이다 — 카드로 낸 돈(원)을 돌려주는 요청·결과.
 * 인자 세 개를 늘 전부 보낸다(PostgREST 가 이름으로 함수를 고른다).
 */
export const GET = masterOnly(async (caller, request) => {
  const parsed = parseBillingQuery(new URL(request.url).searchParams, new Date(), "refunds");
  if (!parsed.ok) return fail(parsed.error, 400);
  const q = parsed.value;
  const { data, error } = await caller.db.rpc("master_payment_refunds_list", {
    p_status: q.status,
    p_q: q.q,
    p_limit: q.limit,
  });
  if (error) return dbFailOrNotReady(error, { rows: [], total: 0, truncated: false });
  return json(toBillingList(data, mapRefundRow));
});
