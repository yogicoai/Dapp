import { isNotFoundDbError, mapPaymentDetail, type PaymentDetailResponse } from "@/lib/admin-billing";
import { parseAdminId } from "@/lib/admin-console";
import { dbFailOrNotReady, fail, json, masterOnly } from "../../_guard";

/**
 * GET /api/admin/billing/payment?id=<uuid> — 결제 한 건(결제 키·결제사 원문·실패 사유·영수증·환불·구독).
 *
 * master_payment_detail 은 없거나 볼 수 없는 결제를 42501 '결제를 찾을 수 없어요.'로 알린다.
 * 그대로 403 을 주면 관리자 페이지가 '로그인이 풀렸나' 하고 다시 확인하러 가므로, 이 경우만 404 로 바꾼다.
 * 구독의 자동결제 키 이름은 DB 함수가 이미 빼고 준다(has_billing_key 만).
 */
export const GET = masterOnly(async (caller, request) => {
  const id = parseAdminId(new URL(request.url).searchParams.get("id"));
  if (!id.ok) return fail(id.error, 400);
  const { data, error } = await caller.db.rpc("master_payment_detail", { p_id: id.value });
  if (error) {
    if (isNotFoundDbError(error)) return fail(error.message, 404);
    return dbFailOrNotReady(error, { payment: null });
  }
  const payment = mapPaymentDetail(data);
  if (!payment) return fail("결제를 찾을 수 없어요.", 404);
  const body: PaymentDetailResponse = { schemaReady: true, payment };
  return json(body);
});
