import { isNotFoundDbError, parseRefundRequest } from "@/lib/admin-billing";
import { isSchemaMissing } from "@/lib/admin-console";
import { bodyTooLarge, dbFail, fail, json, masterOnly, readBody } from "../../_guard";

/**
 * POST /api/admin/billing/refund-request { paymentId, amount, reason } — 결제 환불 '요청'을 적는다.
 *
 * 결제사(PG)를 아직 붙이지 않아 실제 취소는 하지 않는다. DB 함수 master_request_payment_refund 가
 * 결제 줄을 잠그고 (결제 금액 − 환불된 금액 − 처리 기다리는 요청) 안에서만 'requested' 줄을 하나 넣는다.
 * 결제 줄(payments)은 건드리지 않는다 — 나중에 서버가 결제사 취소를 부른 뒤 결과를 한 번에 적는다.
 *
 * 시연 줄(id 가 demo-)은 parseAdminId 가 "시연 데이터는 처리할 수 없어요."로 먼저 거절한다 — DB 에 가지 않는다.
 * 표·함수가 없을 때는 200 으로 속이지 않는다(쓰기가 된 줄 알면 안 된다) — 503 으로 알린다.
 */
export const POST = masterOnly(async (caller, request) => {
  if (bodyTooLarge(request, 8_000)) return fail("요청이 너무 커요.", 413);
  const parsed = parseRefundRequest(await readBody(request));
  if (!parsed.ok) return fail(parsed.error, 400);
  const { paymentId, amount, reason } = parsed.value;

  const { data, error } = await caller.db.rpc("master_request_payment_refund", {
    p_payment: paymentId,
    p_amount: amount,
    p_reason: reason,
  });
  if (error) {
    if (isSchemaMissing(error)) return fail("데이터베이스 준비 전이에요 — 결제 표를 만든 뒤 쓸 수 있어요.", 503, { code: error.code });
    if (isNotFoundDbError(error)) return fail(error.message, 404);
    return dbFail(error);
  }
  return json({ ok: true, refundId: typeof data === "string" ? data : null });
});
