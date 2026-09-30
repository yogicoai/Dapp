import { mapSubscriptionRow, parseBillingQuery, toBillingList } from "@/lib/admin-billing";
import { dbFailOrNotReady, fail, json, masterOnly } from "../../_guard";

/**
 * GET /api/admin/billing/subscriptions?status&q&owner&limit — 구독 목록(master_subscriptions_list).
 * status 에 cancel_scheduled(해지 예약)도 받는다. 자동결제 키 이름은 오지 않는다(등록됐는지만).
 * 인자 네 개를 늘 전부 보낸다(PostgREST 가 이름으로 함수를 고른다).
 */
export const GET = masterOnly(async (caller, request) => {
  const parsed = parseBillingQuery(new URL(request.url).searchParams, new Date(), "subscriptions");
  if (!parsed.ok) return fail(parsed.error, 400);
  const q = parsed.value;
  const { data, error } = await caller.db.rpc("master_subscriptions_list", {
    p_status: q.status,
    p_q: q.q,
    p_owner: q.owner,
    p_limit: q.limit,
  });
  if (error) return dbFailOrNotReady(error, { rows: [], total: 0, truncated: false });
  return json(toBillingList(data, mapSubscriptionRow));
});
