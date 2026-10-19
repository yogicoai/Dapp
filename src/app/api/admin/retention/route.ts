import { dropMasterRows, isMineFlag, isSchemaMissing } from "@/lib/admin-console";
import { removeCafe24Dirs } from "@/lib/cafe24";
import type { RetentionRow } from "@/lib/retention";
import { masterOwnerIds } from "../_data";
import { dbFail, dbFailOrNotReady, fail, json, masterOnly, readBody } from "../_guard";

/*
 * cafe24 폴더를 FTP 로 지운다 — Node 런타임만 된다. 한 번에 정리하는 줄은 20줄까지(master_retention_due),
 * 45초가 지나면 남은 폴더는 다음 정리 때로 넘긴다(배포 함수 한도 60초).
 */
export const runtime = "nodejs";
export const maxDuration = 60;
const PURGE_BUDGET_MS = 45_000;

/**
 * 관리실 '탈퇴·삭제 보관함'(2026-10-19 — 사장님 결정 "삭제·탈퇴 후 90일 보관 뒤 삭제", supabase-withdrawal.sql).
 *
 * GET  — 보관함 목록(master_retention_list). 표가 없으면(SQL 을 아직 안 돌렸으면) schemaReady:false.
 *   관리자 계정(yogico·fe — fe 는 개발 시험 계정)이 지운 것은 목록에서 뺀다(사장님 2026-09-30·10-19 규칙, ?mine=1 이면 함께).
 *   정리(POST)는 가리지 않고 90일 지난 것을 모두 정리한다 — 숨긴 줄도 파일은 지워야 한다.
 * POST { action: "purge" } — 90일이 지난 줄을 정리한다:
 *   ① master_retention_due 로 정리할 줄과 지울 폴더를 받는다(아직 살아 있는 동화·계정이 쓰는 폴더는 DB 가 이미 뺐다)
 *   ② cafe24 폴더를 지운다(removeCafe24Dirs — 지워도 되는 모양만, 없는 폴더는 지운 것으로)
 *   ③ 폴더를 다 지운 줄만 master_retention_mark_purged 로 내용을 비운다. 하나라도 못 지운 줄은 그대로 두어 다음에 다시.
 * DB 는 관리자 토큰(caller.db)으로만 부른다 — 서비스 키는 쓰지 않는다.
 */
export const GET = masterOnly(async (caller, request) => {
  const includeMine = isMineFlag(new URL(request.url).searchParams);
  const [{ data, error }, masters] = await Promise.all([
    caller.db.rpc("master_retention_list", { p_limit: 300 }),
    masterOwnerIds(caller),
  ]);
  if (error) return dbFailOrNotReady(error, { rows: [], hidden: 0 });
  const { rows, dropped } = dropMasterRows((data ?? []) as RetentionRow[], (r) => r.member_id, masters, includeMine);
  return json({ schemaReady: true, rows, hidden: dropped });
});

type DueRow = { id: number; kind: string; folders: string[] | null };

export const POST = masterOnly(async (caller, request) => {
  const body = await readBody(request);
  if (!body || body.action !== "purge") return fail("무엇을 할지 알 수 없어요.", 400);
  const deadline = Date.now() + PURGE_BUDGET_MS;

  const { data, error } = await caller.db.rpc("master_retention_due", { p_limit: 20 });
  if (error) {
    if (isSchemaMissing(error)) {
      return fail("데이터베이스 준비 전이에요 — supabase-withdrawal.sql 을 돌려 주세요.", 503, { code: error.code });
    }
    return dbFail(error);
  }
  const due = ((data ?? []) as DueRow[]).map((r) => ({ id: Number(r.id), folders: r.folders ?? [] }));
  if (due.length === 0) return json({ ok: true, purged: 0, failed: 0, codes: [] });

  // 한 FTP 세션으로 모든 폴더를 지운 뒤 줄마다 결과를 맞춘다
  const dirs = [...new Set(due.flatMap((r) => r.folders))];
  const results = dirs.length > 0 ? await removeCafe24Dirs(dirs, deadline) : [];
  const gone = new Set(results.filter((r) => r.gone).map((r) => r.dir));
  const doneIds = due.filter((r) => r.folders.every((f) => gone.has(f))).map((r) => r.id);
  const codes = [...new Set(results.filter((r) => !r.gone).map((r) => r.code ?? "other"))];

  let purged = 0;
  if (doneIds.length > 0) {
    const mark = await caller.db.rpc("master_retention_mark_purged", { p_ids: doneIds });
    if (mark.error) return dbFail(mark.error, { filesDeleted: gone.size });
    purged = Number(mark.data) || 0;
  }
  return json({ ok: true, purged, failed: due.length - doneIds.length, codes });
});
