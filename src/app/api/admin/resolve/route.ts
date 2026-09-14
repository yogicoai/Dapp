import { isUuid, parseOptionalNote } from "@/lib/admin";
import { dbFail, fail, json, masterOnly, readBody } from "../_guard";

/**
 * POST /api/admin/resolve { job, note? } 또는 { entry, note? } — 처리 끝으로 목록에서 내리기.
 *
 * 기록이 있으면 master_resolve_job, 기록 없이 남은 결제면 master_resolve_payment.
 * 둘을 한 경로로 둔 까닭: 화면에서는 같은 [처리 끝] 버튼이다. 둘 다 주면 거절한다 —
 * 어느 쪽을 내렸는지 모호하면 엉뚱한 건이 목록에서 사라진다.
 */
export const POST = masterOnly(async (caller, request) => {
  const body = await readBody(request);
  if (!body) return fail("요청 본문이 JSON 객체가 아니에요.", 400);
  const note = parseOptionalNote(body.note);
  if (!note.ok) return fail(note.error, 400);

  const hasJob = body.job !== undefined && body.job !== null;
  const hasEntry = body.entry !== undefined && body.entry !== null;
  if (hasJob === hasEntry) return fail("기록 id 와 결제 id 중 하나만 주세요.", 400);

  if (hasJob) {
    if (!isUuid(body.job)) return fail("기록 id 모양이 아니에요.", 400);
    const { error } = await caller.db.rpc("master_resolve_job", { p_job: body.job, p_note: note.value });
    if (error) return dbFail(error);
    return json({ ok: true });
  }
  if (!isUuid(body.entry)) return fail("결제 id 모양이 아니에요.", 400);
  const { data, error } = await caller.db.rpc("master_resolve_payment", { p_entry: body.entry, p_note: note.value });
  if (error) return dbFail(error);
  return json({ ok: true, job: data });
});
