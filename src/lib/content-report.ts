/**
 * AI 결과물 신고 — 만든 동화(쪽)와 가족 캐릭터 그림을 앱 안에서 바로 신고한다(2026-10-20, 안드로이드 출시 준비).
 *
 * 왜: 구글 플레이 'AI 생성 콘텐츠' 정책 — AI 로 만든 결과물을 앱 안에서 바로 신고·표시할 수 있어야 심사를 통과한다.
 * 게시판(의견)은 회원끼리 서로 보는 곳이라 쓰지 않는다 — 신고에는 아이 동화·가족 그림 이야기가 담긴다.
 * DB 는 supabase-content-reports.sql(report_content · master_content_reports · master_handle_content_report).
 * 여기 규칙은 그 함수와 같다(content-report.test 가 SQL 파일과 맞춰 본다) — 진짜 문지기는 DB 함수다.
 *
 * 상대 경로·type 가져오기만 쓴다 — 테스트 러너(node --test)가 @/ 별칭을 못 읽는다.
 */

export type ReportKind = "book" | "portrait";
export type ReportReason = "image" | "text" | "unsafe" | "privacy" | "other";
export type ReportStatus = "open" | "resolved" | "dismissed";

export const REPORT_REASON_LABEL: Readonly<Record<ReportReason, string>> = {
  image: "그림이 이상하거나 불편해요",
  text: "글이 이상하거나 불편해요",
  unsafe: "아이에게 맞지 않는 내용이에요",
  privacy: "개인정보가 드러나요",
  other: "그 밖의 문제",
};

/** 고르는 까닭 — 가족 그림에는 '글'이 없다 */
export function reportReasons(kind: ReportKind): readonly ReportReason[] {
  return kind === "portrait" ? ["image", "unsafe", "privacy", "other"] : ["image", "text", "unsafe", "privacy", "other"];
}

export const REPORT_DETAIL_MAX = 1000;
export const REPORT_PAGE_MAX = 500;
/** 하루에 한 사람이 넣을 수 있는 신고 수(DB 와 같다) */
export const REPORT_DAILY_MAX = 30;
const TARGET_RE = /^[A-Za-z0-9_:.-]{1,120}$/;

export type ReportInput = {
  kind: ReportKind;
  targetId: string;
  /** 동화의 몇 번째 쪽(0부터). 가족 그림은 null */
  page: number | null;
  reason: ReportReason;
  detail: string | null;
};

export function isReportReason(v: unknown): v is ReportReason {
  return typeof v === "string" && v in REPORT_REASON_LABEL;
}

/** 보내기 전에 화면에서 먼저 본다 — DB 함수와 같은 규칙 */
export function checkReportInput(i: {
  kind: unknown;
  targetId: unknown;
  page?: unknown;
  reason: unknown;
  detail?: unknown;
}): { ok: true; value: ReportInput } | { ok: false; error: string } {
  if (i.kind !== "book" && i.kind !== "portrait") return { ok: false, error: "무엇을 신고하는지 알 수 없어요." };
  if (typeof i.targetId !== "string" || !TARGET_RE.test(i.targetId)) return { ok: false, error: "신고할 대상을 찾지 못했어요." };
  let page: number | null = null;
  if (i.page !== undefined && i.page !== null) {
    if (typeof i.page !== "number" || !Number.isInteger(i.page) || i.page < 0 || i.page > REPORT_PAGE_MAX) {
      return { ok: false, error: "쪽 번호가 맞지 않아요." };
    }
    page = i.page;
  }
  if (!isReportReason(i.reason) || !reportReasons(i.kind).includes(i.reason)) return { ok: false, error: "신고 까닭을 골라 주세요." };
  const detail = typeof i.detail === "string" ? i.detail.trim() : "";
  if (detail.length > REPORT_DETAIL_MAX) return { ok: false, error: `자세한 내용은 ${REPORT_DETAIL_MAX}자까지 적을 수 있어요.` };
  return { ok: true, value: { kind: i.kind, targetId: i.targetId, page, reason: i.reason, detail: detail || null } };
}

export type ReportFailure = "login" | "limit" | "unavailable" | "invalid" | "network";

/**
 * DB 오류 → 고객에게 보일 갈래. 42501 로그인 없음 · 54000 하루 한도 · 함수가 아직 없음(SQL 전) · 22023 값 틀림.
 * 함수가 없을 때(PGRST202·42883)는 '잠시 뒤 / 고객센터' — 배포가 SQL 보다 먼저 나가도 화면이 깨지지 않게.
 */
export function reportFailureOf(err: { code?: unknown; message?: unknown } | null | undefined): ReportFailure {
  const code = typeof err?.code === "string" ? err.code : "";
  if (code === "42501") return "login";
  if (code === "54000") return "limit";
  if (code === "PGRST202" || code === "42883" || code === "PGRST205" || code === "42P01") return "unavailable";
  if (code === "22023") return "invalid";
  return "network";
}

export const REPORT_FAILURE_TEXT: Readonly<Record<ReportFailure, string>> = {
  login: "로그인하면 신고할 수 있어요.",
  limit: "오늘은 신고를 더 받을 수 없어요. 고객센터로 알려 주세요.",
  unavailable: "지금은 신고를 받을 수 없어요. 고객센터로 알려 주세요.",
  invalid: "신고 내용을 다시 확인해 주세요.",
  network: "보내지 못했어요. 잠시 뒤 다시 해 주세요.",
};

/* ─────────────────────────── 관리실 ─────────────────────────── */

export const REPORT_STATUS_LABEL: Readonly<Record<ReportStatus, string>> = {
  open: "처리 전",
  resolved: "처리 끝",
  dismissed: "문제 없음",
};

const FAMILY_ROLE_NAME: Readonly<Record<string, string>> = { child: "아이", mom: "엄마", dad: "아빠" };

/** "만든 동화 · 4쪽" · "세계명작 · 1쪽" · "가족 캐릭터(엄마)" — 관리실 표·고객 시트 제목 */
export function reportTargetLabel(kind: ReportKind, targetId: string, page: number | null): string {
  if (kind === "portrait") {
    const who = FAMILY_ROLE_NAME[targetId];
    return who ? `가족 캐릭터(${who})` : "가족 캐릭터";
  }
  const shelf = targetId.startsWith("my-")
    ? "만든 동화"
    : targetId.startsWith("classic-")
      ? "세계명작"
      : targetId.startsWith("folk-")
        ? "전래동화"
        : "동화";
  return page === null ? shelf : `${shelf} · ${page + 1}쪽`;
}

export type AdminReportRow = {
  id: number;
  owner: string | null;
  username: string | null;
  kind: ReportKind;
  targetId: string;
  page: number | null;
  reason: ReportReason;
  detail: string | null;
  status: ReportStatus;
  note: string | null;
  handledBy: string | null;
  handledAt: string | null;
  createdAt: string;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** master_content_reports 한 줄 → 화면 줄. 모양이 틀리면 null */
export function adminReportFromRow(row: unknown): AdminReportRow | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const kind = r.target_kind;
  const status = r.status;
  if ((kind !== "book" && kind !== "portrait") || !isReportReason(r.reason)) return null;
  if (status !== "open" && status !== "resolved" && status !== "dismissed") return null;
  if (typeof r.target_id !== "string" || typeof r.created_at !== "string") return null;
  const page = typeof r.page === "number" && Number.isInteger(r.page) ? r.page : null;
  return {
    id: Number(r.id) || 0,
    owner: str(r.owner),
    username: str(r.username),
    kind,
    targetId: r.target_id,
    page,
    reason: r.reason,
    detail: str(r.detail),
    status,
    note: str(r.master_note),
    handledBy: str(r.handled_by_username),
    handledAt: str(r.handled_at),
    createdAt: r.created_at,
  };
}

/** 관리실이 보낸 처리 { id, status?, note? } — 진짜 문지기는 DB 함수 */
export function parseReportHandleBody(
  body: unknown,
): { ok: true; value: { id: number; status: ReportStatus | null; note: string | null } } | { ok: false; error: string } {
  const b = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  if (!b) return { ok: false, error: "요청 본문이 JSON 객체가 아니에요." };
  const id = typeof b.id === "number" && Number.isInteger(b.id) && b.id > 0 ? b.id : null;
  if (id === null) return { ok: false, error: "신고 번호가 맞지 않아요." };
  const status = b.status === undefined || b.status === null ? null : b.status;
  if (status !== null && status !== "open" && status !== "resolved" && status !== "dismissed") {
    return { ok: false, error: "처리 상태가 맞지 않아요." };
  }
  const note = typeof b.note === "string" ? b.note.trim() : "";
  if (note.length > 1000) return { ok: false, error: "메모가 너무 길어요(1000자까지)." };
  if (status === null && !note) return { ok: false, error: "바꿀 내용이 없어요." };
  return { ok: true, value: { id, status, note: note || null } };
}

/** GET /api/admin/reports 의 답 */
export type AdminReportsResponse = {
  /** 표가 아직 없으면 false(14번 SQL 전) */
  schemaReady: boolean;
  rows: AdminReportRow[];
  openCount: number;
  truncated: boolean;
};

export const REPORT_LIST_LIMIT = 200;
