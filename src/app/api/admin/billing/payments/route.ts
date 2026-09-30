import { mapPaymentRow, parseBillingQuery, toBillingList } from "@/lib/admin-billing";
import { dbFailOrNotReady, fail, json, masterOnly } from "../../_guard";

/**
 * GET /api/admin/billing/payments?status&q&period&owner&subscription&limit — 실제 결제(원) 목록.
 *
 * DB 함수 master_payments_list 가 마스터 확인·다른 마스터 줄 가리기(master_can_see)를 한다.
 * 인자 일곱 개를 **늘 전부** 보낸다(없는 값은 null) — PostgREST 는 보낸 인자 이름으로 함수를 고르므로,
 * 일부만 보내면 언젠가 같은 이름의 다른 모양을 부를 수 있다.
 * 표·함수가 아직 없으면(SQL 을 아직 안 돌렸으면) 200 + schemaReady:false — 화면이 '데이터베이스 준비 전'이라고 말한다.
 */
export const GET = masterOnly(async (caller, request) => {
  const parsed = parseBillingQuery(new URL(request.url).searchParams, new Date(), "payments");
  if (!parsed.ok) return fail(parsed.error, 400);
  const q = parsed.value;
  const { data, error } = await caller.db.rpc("master_payments_list", {
    p_status: q.status,
    p_q: q.q,
    p_from: q.from,
    p_to: q.to,
    p_owner: q.owner,
    p_subscription: q.subscription,
    p_limit: q.limit,
  });
  if (error) return dbFailOrNotReady(error, { rows: [], total: 0, truncated: false });
  return json(toBillingList(data, mapPaymentRow));
});
