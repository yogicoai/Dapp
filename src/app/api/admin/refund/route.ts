import { isUuid, parseRefundNote } from "@/lib/admin";
import { dbFail, fail, json, masterOnly, readBody } from "../_guard";

/**
 * POST /api/admin/refund { entry, note } — 결제 한 건 환불(master_refund_entry).
 *
 * 기한 없이 되돌린다(컴플레인은 며칠 뒤에 온다). 같은 건은 DB 가 한 번만 받는다 —
 * 마스터 둘이 동시에 눌러도 두 번째는 '이미 되돌린 기록입니다'로 거절되고 그 문구를 그대로 보여 준다.
 * '같은 줄거리 다시 쓰기' 셈 초기화(p_reset_rewrites)는 DB 기본 규칙에 맡긴다(null).
 */
export const POST = masterOnly(async (caller, request) => {
  const body = await readBody(request);
  if (!body) return fail("요청 본문이 JSON 객체가 아니에요.", 400);
  if (!isUuid(body.entry)) return fail("결제 id 모양이 아니에요.", 400);
  const note = parseRefundNote(body.note);
  if (!note.ok) return fail(note.error, 400);

  const { data, error } = await caller.db.rpc("master_refund_entry", {
    p_entry: body.entry,
    p_note: note.value,
    p_reset_rewrites: null,
  });
  if (error) return dbFail(error);
  return json({ ok: true, result: data });
});
