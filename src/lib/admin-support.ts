/**
 * 관리자 페이지 '의견·오류'(/admin/support) 순수 함수 — 사고 목록 거르기·열쇠, 의견 처리 문구,
 * 그리고 서버 경로(incidents·feedback GET)가 관리자 계정 기록을 빼는 셈.
 *
 * 왜 따로 두나: 옛 관리실(한 화면)에서는 이 판단들이 화면 코드 사이에 섞여 있어 시험할 수 없었다.
 * 화면·서버가 같은 셈을 쓰게 여기 모으고 admin-support.test.ts 로 시험한다.
 *
 * 상대 경로·type 가져오기만 쓴다 — 테스트 러너(node --test)가 @/ 별칭을 못 읽는다.
 */
import { countKinds, isUuid, kindInfo, sortIncidents } from "./admin.ts";
import { dropMasterRows, withParams } from "./admin-console.ts";

/* ── 탭 ─────────────────────────────────────────────────────────────────── */

export type SupportTab = "incidents" | "feedback";
export const SUPPORT_TABS: readonly SupportTab[] = ["incidents", "feedback"];

/* ── 서버 주소 ───────────────────────────────────────────────────────────── */

/**
 * 사고 목록 주소. mine=1 은 '내 계정 것도 보기'가 켜졌을 때만 붙인다 —
 * 꺼져 있으면 서버가 관리자 계정 기록을 빼고 준다(사장님 2026-09-30).
 */
export function incidentsPath(o: { resolved: boolean; mine: boolean }): string {
  return `/api/admin/incidents${withParams("", { resolved: o.resolved ? "1" : null, mine: o.mine ? "1" : null })}`;
}

/** 의견 목록 주소. open=1 이면 아직 처리 안 한 글만. */
export function feedbackPath(o: { open: boolean; mine: boolean }): string {
  return `/api/admin/feedback${withParams("", { open: o.open ? "1" : null, mine: o.mine ? "1" : null })}`;
}

/* ── 사고 종류 거르기(?kind=) ────────────────────────────────────────────── */

/**
 * 주소의 kind 값 — 영문 소문자·밑줄 40자까지만 받는다. 모르는 종류(DB 가 새로 더한 것)도 받되,
 * 손으로 고친 이상한 값은 '전체'("")로 본다. 대시보드의 '돈 냈는데 책 없음' 링크가 이 칸으로 들어온다.
 */
export function parseKindParam(raw: string | null | undefined): string {
  return typeof raw === "string" && /^[a-z][a-z_]{0,39}$/.test(raw) ? raw : "";
}

export type KindOption = { value: string; label: string; count: number };

/**
 * 종류 칩 — '전체' + 목록에 있는 종류(급한 순). 고른 종류가 목록에 없으면(0건) 그 칩도 0 으로 남긴다:
 * 대시보드 링크로 들어왔는데 방금 다 처리돼 0건이면, 칩이 사라져 "왜 전부 보이지?"가 되지 않게.
 */
export function kindOptions(rows: readonly { kinds: readonly string[] }[], selected: string): KindOption[] {
  const counted = countKinds(rows);
  const out: KindOption[] = [{ value: "", label: "전체", count: rows.length }];
  for (const c of counted) out.push({ value: c.kind, label: kindInfo(c.kind).label, count: c.count });
  if (selected && !counted.some((c) => c.kind === selected)) {
    out.push({ value: selected, label: kindInfo(selected).label, count: 0 });
  }
  return out;
}

/** 보이는 줄 — 종류로 거른 뒤 급한 순 → 최근 순(옛 관리실과 같은 순서). */
export function visibleIncidents<T extends { kinds: readonly string[]; updated_at: string | null }>(
  rows: readonly T[],
  kind: string,
): T[] {
  return sortIncidents(kind ? rows.filter((r) => r.kinds.includes(kind)) : [...rows]);
}

/* ── 사고 한 줄 ↔ 서랍(?job= / ?entry=) ─────────────────────────────────── */

type IncidentIds = {
  job_id: string | null;
  story_entry: string | null;
  illustration_entry: string | null;
  book_id?: string | null;
  member?: string | null;
  created_at?: string | null;
};

export type CaseRef = { jobId: string | null; entry: string | null };

/** 이 줄로 여는 서랍 — 만들기 기록이 있으면 job, 없이 결제만 남았으면 그 장부 줄. 둘 다 없으면 열 것이 없다. */
export function incidentCase(r: IncidentIds): CaseRef | null {
  if (r.job_id) return { jobId: r.job_id, entry: null };
  const entry = r.story_entry ?? r.illustration_entry;
  return entry ? { jobId: null, entry } : null;
}

/**
 * 줄 열쇠 — 표의 key 이자 '지금 열린 줄' 표시에 쓴다. caseKey 와 같은 규칙이라 서랍이 열린 줄에 불이 들어온다.
 * 기록·결제가 둘 다 없는 줄(원래 없어야 한다)은 책·회원·시각으로 만든다 — 열쇠가 겹쳐 줄이 사라지지 않게.
 */
export function incidentKey(r: IncidentIds): string {
  const c = incidentCase(r);
  if (c) return caseKey(c) as string;
  return `row:${r.book_id ?? ""}:${r.member ?? ""}:${r.created_at ?? ""}`;
}

export function caseKey(open: CaseRef | null | undefined): string | null {
  if (!open) return null;
  if (open.jobId) return `job:${open.jobId.toLowerCase()}`;
  return open.entry ? `entry:${open.entry.toLowerCase()}` : null;
}

/* ── 메뉴 배지를 어떻게 맞추나 ───────────────────────────────────────────── */

/**
 * 목록을 읽은 뒤 메뉴 숫자를 그 목록 숫자로 바로 맞출지('set'), 서버에 다시 세게 할지('refresh').
 *  · '내 계정 것도 보기'가 켜져 있으면 목록 숫자에 관리자 계정 기록이 섞여 있다 — 메뉴에 넣지 않는다.
 *  · '처리 끝난 것도 보기'면 500줄 상한을 처리 끝난 줄이 차지해 열린 수가 모자랄 수 있다.
 * 그 둘이면 서버(/api/admin/badges, 늘 관리자 기록을 뺀다)에 맡긴다.
 */
export function badgePlan(o: { mine: boolean; resolved?: boolean }): "set" | "refresh" {
  return o.mine || o.resolved ? "refresh" : "set";
}

/* ── 서버: 관리자 계정 기록 빼기 ──────────────────────────────────────────── */

/**
 * 사고 목록에서 관리자 계정 줄을 뺀다(사장님 2026-09-30, 점검용 스위치 mine 이면 그대로).
 * total 은 DB 가 센 '잘리기 전 전체'에서 뺀 만큼 덜어 낸다 — 다만 지금 남은 줄 수보다 작아지지는 않게.
 * (500줄 밖에 있던 관리자 줄은 여기서 알 수 없어 그만큼 크게 셀 수 있다 — 잘림 안내가 조금 넉넉해질 뿐이다.)
 */
export function keepCustomerIncidents<R extends { member: string | null; total_count?: number | null }>(
  rows: readonly R[],
  masterIds: ReadonlySet<string>,
  includeMine: boolean,
): { rows: R[]; dropped: number; total: number } {
  const { rows: kept, dropped } = dropMasterRows(rows, (r) => r.member, masterIds, includeMine);
  const dbTotal = Number(rows[0]?.total_count ?? 0);
  const total = Math.max(kept.length, (Number.isFinite(dbTotal) ? dbTotal : 0) - dropped);
  return { rows: kept, dropped, total };
}

/** 의견 목록에서 관리자 계정 글을 빼고, 남은(처리 안 한) 수를 남은 글로 센다. 글은 게시판에 그대로 남는다. */
export function keepCustomerPosts<P extends { owner: string | null; handled_at: string | null }>(
  posts: readonly P[],
  masterIds: ReadonlySet<string>,
  includeMine: boolean,
): { posts: P[]; openCount: number; dropped: number } {
  const { rows, dropped } = dropMasterRows(posts, (p) => p.owner, masterIds, includeMine);
  return { posts: rows, openCount: rows.filter((p) => !p.handled_at).length, dropped };
}

/**
 * PostgREST `not.in` 값 "(a,b)". uuid 만 넣는다 — 이 글자는 주소 거르기 문법에 그대로 들어가므로
 * 모양이 다른 값이 섞이면 거르기가 깨지거나 다른 뜻이 된다. 넣을 것이 없으면 null(거르지 않는다).
 */
export function notInFilter(ids: Iterable<string>): string | null {
  const ok = [...new Set([...ids].filter((x) => isUuid(x)).map((x) => x.toLowerCase()))];
  return ok.length ? `(${ok.join(",")})` : null;
}

/* ── 의견(게시판) ────────────────────────────────────────────────────────── */

/** 서버가 한 번에 주는 의견 수 — 이만큼 오면 '최근 200건만 보여요'. */
export const FEEDBACK_LIST_LIMIT = 200;
/** 답변 길이 — 서버(feedback POST)와 같다. */
export const FEEDBACK_REPLY_MAX = 2000;
/** 메모 길이 — 화면은 500자까지 받는다(서버는 1000자까지 허락한다, 옛 화면과 같다). */
export const FEEDBACK_NOTE_MAX = 500;

/** master_feedback_list 한 줄(supabase-setup.sql 의 반환 칸 그대로). */
export type AdminFeedbackRow = {
  id: string;
  owner: string;
  username: string | null;
  category: string;
  content: string;
  created_at: string;
  reply: string | null;
  replied_at: string | null;
  replied_by_username: string | null;
  handled_at: string | null;
  master_note: string | null;
  /** 글쓴이의 지금 잔액·책 수 — 답하기 전에 상황을 같이 보려고 함께 준다. */
  tokens: number | null;
  books: number | null;
  /** 이 사람이 남긴 글 중 아직 처리 안 한 수. */
  open_count: number | null;
};

export type AdminFeedbackResponse = {
  posts: AdminFeedbackRow[];
  openCount: number;
  me: string;
  /** 서버 상한(200건)에 닿았다 — 더 오래된 글은 안 보인다. */
  truncated?: boolean;
};

export type FeedbackTone = "red" | "blue" | "green" | "gray";

const CATEGORY_TONE: Record<string, FeedbackTone> = {
  "오류 신고": "red",
  "이런 게 있으면 좋겠어요": "blue",
  "사용 후기": "green",
};

/** 의견 종류 색 — 모르는 종류는 회색(글자는 늘 함께 보인다). */
export function feedbackCategoryTone(category: string | null | undefined): FeedbackTone {
  return (category && CATEGORY_TONE[category]) || "gray";
}

/**
 * 의견 처리 네 가지(옛 관리실과 같다).
 *  reply-close 답하고 처리 끝 · reply-only 답만 남기기(메모만일 수도) · close 답 없이 처리 끝 · reopen 다시 열기
 */
export type FeedbackActionKind = "reply-close" | "reply-only" | "close" | "reopen";
export type FeedbackPatch = { reply?: string; note?: string; handled?: boolean };

/** 누른 단추 + 쓴 글 → 서버에 보낼 값. 보낼 것이 없으면 null(단추가 꺼져 있어야 한다). */
export function feedbackPatch(kind: FeedbackActionKind, reply: string, note: string): FeedbackPatch | null {
  const r = reply.trim().slice(0, FEEDBACK_REPLY_MAX);
  const n = note.trim().slice(0, FEEDBACK_NOTE_MAX);
  if (kind === "close") return { handled: true };
  if (kind === "reopen") return { handled: false };
  if (!r && !n) return null;
  const patch: FeedbackPatch = {};
  if (r) patch.reply = r;
  if (n) patch.note = n;
  if (kind === "reply-close") patch.handled = true;
  return patch;
}

/** 처리 뒤 알림 — 옛 화면 문구 그대로. */
export function feedbackDoneMessage(patch: FeedbackPatch): string {
  if (patch.reply) return "답변을 남겼어요";
  if (patch.handled === false) return "다시 열었어요";
  if (patch.handled === true) return "처리했어요";
  return "메모를 남겼어요";
}

/** 되묻기 창 문구. 답변은 고객 게시판에 그대로 보이므로 그 사실을 먼저 말한다. */
export function feedbackConfirmCopy(patch: FeedbackPatch): { title: string; confirmLabel: string; body: string } {
  if (patch.reply) {
    return {
      title: patch.handled ? "답하고 처리 끝으로 할까요?" : "답변을 남길까요?",
      confirmLabel: patch.handled ? "답하고 처리 끝" : "답 남기기",
      body: "답변은 고객의 게시판 글 아래에 그대로 보여요." + (patch.note ? " 메모는 우리만 봐요." : ""),
    };
  }
  if (patch.handled === false) {
    return { title: "이 의견을 다시 열까요?", confirmLabel: "다시 열기", body: "'남은 의견'에 다시 들어가요." };
  }
  if (patch.handled === true) {
    return {
      title: patch.note ? "메모 남기고 처리 끝으로 할까요?" : "답 없이 처리 끝으로 할까요?",
      confirmLabel: "처리 끝",
      body: "'남은 의견'에서 빠져요. 고객에게는 아무것도 보이지 않아요.",
    };
  }
  return { title: "메모를 남길까요?", confirmLabel: "메모 남기기", body: "메모는 우리만 봐요. 고객에게는 보이지 않아요." };
}

/** 쓰던 답변이 있나 — 있으면 화면을 떠나기 전에 묻는다. */
export function feedbackDraftDirty(reply: string, note: string): boolean {
  return reply.trim().length > 0 || note.trim().length > 0;
}

/** 글쓴이 회원 화면 주소 — uuid 일 때만(주소로 넘기는 값은 모양을 확인한다). */
export function memberHref(owner: string | null | undefined): string | null {
  return isUuid(owner) ? `/admin/members/${owner.toLowerCase()}` : null;
}
