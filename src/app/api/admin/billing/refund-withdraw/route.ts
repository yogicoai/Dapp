import { isNotFoundDbError, parseRefundWithdraw } from "@/lib/admin-billing";
import { isSchemaMissing } from "@/lib/admin-console";
import { bodyTooLarge, dbFail, fail, json, masterOnly, readBody } from "../../_guard";

/**
 * POST /api/admin/billing/refund-withdraw { refundId, note? } — 아직 '요청됨'인 결제 환불 요청을 거둔다.
 *
 * master_withdraw_payment_refund 가 요청됨 → 요청 취소만 허락하고, 누가·언제·왜(메모) 거뒀는지 남긴다.
 * 이미 처리된 요청이면 55000 '이미 처리된 요청이에요.' → 409 로 그대로 보여 준다.
 * 시연 줄(demo-…)은 parseAdminId 가 먼저 거절한다.
 */
export const POST = masterOnly(async (caller, request) => {
  if (bodyTooLarge(request, 8_000)) return fail("요청이 너무 커요.", 413);
  const parsed = parseRefundWithdraw(await readBody(request));
  if (!parsed.ok) return fail(parsed.error, 400);

  const { error } = await caller.db.rpc("master_withdraw_payment_refund", {
    p_refund: parsed.value.refundId,
    p_note: parsed.value.note,
  });
  if (error) {
    if (isSchemaMissing(error)) return fail("데이터베이스 준비 전이에요 — 결제 표를 만든 뒤 쓸 수 있어요.", 503, { code: error.code });
    if (isNotFoundDbError(error)) return fail(error.message, 404);
    return dbFail(error);
  }
  return json({ ok: true });
});
