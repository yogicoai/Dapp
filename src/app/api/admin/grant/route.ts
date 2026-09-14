import { isUuid, parseGrantAmount } from "@/lib/admin";
import { dbFail, fail, json, masterOnly, readBody } from "../_guard";

/**
 * POST /api/admin/grant { user, amount } — 토큰 충전(grant_tokens).
 *
 * 한 번에 1~1000 개만 받는다. DB 는 더 크게(±10만) 받지만 관리실에서 0 을 하나 더 눌러
 * 큰 토큰이 나가는 실수를 막으려고 좁혔다. grant_tokens 에는 사유 칸이 없어 사유는 남지 않는다.
 */
export const POST = masterOnly(async (caller, request) => {
  const body = await readBody(request);
  if (!body) return fail("요청 본문이 JSON 객체가 아니에요.", 400);
  if (!isUuid(body.user)) return fail("회원 id 모양이 아니에요.", 400);
  const amount = parseGrantAmount(body.amount);
  if (!amount.ok) return fail(amount.error, 400);

  const { data, error } = await caller.db.rpc("grant_tokens", { p_user: body.user, p_amount: amount.value });
  if (error) return dbFail(error);
  return json({ ok: true, tokens: data });
});
