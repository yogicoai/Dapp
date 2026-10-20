/**
 * AI 결과물 신고 보내기(브라우저) — 로그인한 회원이 DB 함수 report_content 를 부른다(lib/content-report 참고).
 * 서버 경로를 거치지 않는다: 회원 열쇠로 부르면 DB 가 누가 보냈는지 알고, 표는 함수로만 열려 있다.
 */
import { getSupabase } from "@/lib/supabase";
import { reportFailureOf, type ReportFailure, type ReportInput } from "@/lib/content-report";

export async function submitContentReport(
  input: ReportInput,
): Promise<{ ok: true; duplicate: boolean } | { ok: false; reason: ReportFailure }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, reason: "unavailable" };
  try {
    const { data, error } = await sb.rpc("report_content", {
      p_kind: input.kind,
      p_target: input.targetId,
      p_page: input.page,
      p_reason: input.reason,
      p_detail: input.detail,
    });
    if (error) return { ok: false, reason: reportFailureOf(error) };
    const r = data as { ok?: unknown; duplicate?: unknown } | null;
    if (!r || r.ok !== true) return { ok: false, reason: "network" };
    return { ok: true, duplicate: r.duplicate === true };
  } catch {
    return { ok: false, reason: "network" };
  }
}
