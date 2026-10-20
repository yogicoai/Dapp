import { isMineFlag } from "@/lib/admin-console";
import {
  REPORT_LIST_LIMIT,
  adminReportFromRow,
  parseReportHandleBody,
  type AdminReportRow,
  type AdminReportsResponse,
} from "@/lib/content-report";
import { masterOwnerIds } from "../_data";
import { dbFail, dbFailOrNotReady, fail, json, masterOnly, readBody } from "../_guard";

/**
 * AI 결과물 신고(2026-10-20, 구글 플레이 AI 콘텐츠 정책) — 고객이 앱 안에서 신고한 동화 쪽·가족 그림을 보고 처리한다.
 *
 * GET  ?open=1(기본) · ?open=0 전체 · &mine=1 → 관리자 계정이 넣은 신고(점검용)도 함께
 * POST { id, status?: 'resolved'|'dismissed'|'open', note? } → 처리 끝 · 문제 없음 · 다시 열기 · 내부 메모
 *
 * DB 는 supabase-content-reports.sql(14번). 표가 없으면(SQL 전) schemaReady:false 로 "준비 전"을 알린다.
 * 다른 관리자 계정이 넣은 신고는 DB 의 master_can_see 가 거른다.
 */
export const GET = masterOnly(async (caller, request) => {
  const sp = new URL(request.url).searchParams;
  const onlyOpen = sp.get("open") !== "0";
  const mine = isMineFlag(sp);
  const [{ data, error }, masters] = await Promise.all([
    caller.db.rpc("master_content_reports", { p_only_open: onlyOpen, p_limit: REPORT_LIST_LIMIT }),
    mine ? Promise.resolve(new Set<string>()) : masterOwnerIds(caller),
  ]);
  const notReady: AdminReportsResponse = { schemaReady: false, rows: [], openCount: 0, truncated: false };
  if (error) return dbFailOrNotReady(error, notReady);
  const raw = (data as unknown[] | null) ?? [];
  const rows = raw
    .map(adminReportFromRow)
    .filter((r): r is AdminReportRow => r !== null)
    .filter((r) => mine || !r.owner || !masters.has(r.owner));
  const body: AdminReportsResponse = {
    schemaReady: true,
    rows,
    openCount: rows.filter((r) => r.status === "open").length,
    truncated: raw.length >= REPORT_LIST_LIMIT,
  };
  return json(body);
});

export const POST = masterOnly(async (caller, request) => {
  const parsed = parseReportHandleBody(await readBody(request));
  if (!parsed.ok) return fail(parsed.error, 400);
  const { id, status, note } = parsed.value;
  const { data, error } = await caller.db.rpc("master_handle_content_report", {
    p_id: id,
    p_status: status,
    p_note: note,
  });
  if (error) return dbFail(error);
  return json({ ok: true, result: data });
});
