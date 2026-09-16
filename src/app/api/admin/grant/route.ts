import { isUuid, parseGrantAmount } from "@/lib/admin";
import { dbFail, fail, json, masterOnly, readBody } from "../_guard";

/**
 * POST /api/admin/grant { user, amount, reason? } — 토큰 충전(grant_tokens).
 *
 * 한 번에 1~1000 개만 받는다. DB 는 더 크게(±10만) 받지만 관리실에서 0 을 하나 더 눌러
 * 큰 토큰이 나가는 실수를 막으려고 좁혔다.
 * 사유는 token_grants 에 남는다 — "왜 넣어 줬더라"를 나중에 읽을 수 있게(2026-09-16 더함).
 * 사유를 받는 세 인자 모양이 없는 옛 DB 면 두 인자 모양으로 물러선다.
 */
export const POST = masterOnly(async (caller, request) => {
  const body = await readBody(request);
  if (!body) return fail("요청 본문이 JSON 객체가 아니에요.", 400);
  if (!isUuid(body.user)) return fail("회원 id 모양이 아니에요.", 400);
  const amount = parseGrantAmount(body.amount);
  if (!amount.ok) return fail(amount.error, 400);
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 200) : "";

  const withReason = await caller.db.rpc("grant_tokens", {
    p_user: body.user,
    p_amount: amount.value,
    p_reason: reason,
  });
  if (!withReason.error) return json({ ok: true, tokens: withReason.data });

  // 옛 DB — 사유 칸이 없는 두 인자 모양만 있다(42883 / PGRST202).
  const missing =
    withReason.error.code === "42883" ||
    withReason.error.code === "PGRST202" ||
    /could not find the function|does not exist/i.test(withReason.error.message ?? "");
  if (!missing) return dbFail(withReason.error);

  const { data, error } = await caller.db.rpc("grant_tokens", { p_user: body.user, p_amount: amount.value });
  if (error) return dbFail(error);
  return json({ ok: true, tokens: data });
});
