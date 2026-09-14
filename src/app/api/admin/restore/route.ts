import { isUuid, restoreConflict } from "@/lib/admin";
import { dbFail, fail, json, masterOnly, readBody } from "../_guard";

/**
 * POST /api/admin/restore { job, replace?, force? } — 기록의 원고로 고객 책 되살리기(master_restore_book).
 *
 * 덮어쓰기(replace)·강제 진행(force)은 처음엔 늘 false 로 보낸다. DB 가 '이미 책이 있습니다' ·
 * '아직 진행 중인 기록입니다'로 거절하면 conflict 칸으로 알려 주고, 화면이 마스터에게 한 번 더 물은 뒤
 * 그 칸만 켜서 다시 부른다. 고객이 저장 뒤 다시 그린 그림을 모르고 덮는 일을 막으려고.
 */
export const POST = masterOnly(async (caller, request) => {
  const body = await readBody(request);
  if (!body) return fail("요청 본문이 JSON 객체가 아니에요.", 400);
  if (!isUuid(body.job)) return fail("기록 id 모양이 아니에요.", 400);

  const { data, error } = await caller.db.rpc("master_restore_book", {
    p_job: body.job,
    p_replace: body.replace === true,
    p_force: body.force === true,
  });
  if (error) return dbFail(error, { conflict: restoreConflict(error.message) });
  return json({ ok: true, result: data });
});
