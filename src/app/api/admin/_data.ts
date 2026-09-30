import type { Caller } from "@/lib/api-auth";
import type { IncidentRow } from "@/lib/admin";

/**
 * 관리실 경로들이 같이 쓰는 DB 읽기. 전부 **마스터의 토큰(caller.db)** 으로 읽는다 —
 * RLS 마스터 열람 정책이 허락한 만큼만 보인다.
 *
 * ⚠️ book_jobs·token_ledger 는 select('*') 가 칸 권한 오류다. 늘 칸을 적는다.
 *    제목은 manuscript->>title 로 경로만 뽑는다 — 원고 전체(최대 150KB)를 줄마다 받지 않으려고.
 */

type Db = Caller["db"];
type DbErr = { code?: string | null; message?: string | null } | null;

/** in(...) 목록을 잘라 부른다 — uuid 500개를 주소 한 줄에 넣으면 요청 줄 길이 한도에 걸린다. */
function chunks<T>(list: T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];

/**
 * 사고 목록(여러 줄)에 쓰는 칸 — failures(줄당 최대 50KB)·master_note·환불 사유는 뺀다.
 * 목록 경로는 어차피 응답에서 버리는 칸이라, DB 쪽에서 안 받아야 500줄을 읽을 때 수 MB 를 안 끌어온다.
 * 이 목록을 쓰면 빠진 칸은 undefined 다 — 상세 경로(job)는 칸을 고르지 않고 전부 받는다.
 */
export const INCIDENT_LIST_COLUMNS = [
  "job_id", "member", "username", "book_id", "status", "kinds", "urgency", "page_count", "drawn", "draw_failed",
  "upload_failed", "blank_pages", "embedded_pages", "book_exists", "saved_at", "book_seen_at", "book_deleted_at",
  "book_deleted_by", "books_saved_after_payment", "story_entry", "story_amount", "story_refunded_at",
  "story_refunded_by", "illustration_entry", "illustration_amount", "illustration_paid_at",
  "illustration_refunded_at", "illustration_refunded_by", "error", "created_at", "updated_at", "restored_at",
  "restored_by", "resolved_at", "resolved_by", "total_count",
].join(",");

export async function fetchIncidents(
  caller: Caller,
  opts: {
    owner?: string | null;
    username?: string | null;
    includeResolved?: boolean;
    limit?: number;
    /** PostgREST 칸 고르기. 비우면 전부. */
    columns?: string;
  },
): Promise<{ rows: IncidentRow[]; error: DbErr }> {
  // 인자를 여섯 개 다 준다 — 이름이 같은 옛 모양 함수가 남아 있어도 헷갈리지 않게.
  const call = caller.db.rpc("master_book_incidents", {
    p_stale_minutes: 30,
    p_owner: opts.owner ?? null,
    p_include_resolved: opts.includeResolved ?? false,
    p_username: opts.username ?? null,
    p_kinds: null,
    p_limit: opts.limit ?? 500,
  });
  const { data, error } = await (opts.columns ? call.select(opts.columns) : call);
  if (error) return { rows: [], error };
  const rows = ((data as IncidentRow[] | null) ?? []).map((r) => ({ ...r, kinds: Array.isArray(r.kinds) ? r.kinds : [] }));
  return { rows, error: null };
}

/** 기록 id → 원고 제목. 원고가 비었으면(90일 정리) 책 제목으로 채운다. */
export async function titlesFor(
  db: Db,
  rows: { job_id: string | null; book_id: string | null; member: string }[],
): Promise<Map<string, string>> {
  const titles = new Map<string, string>(); // key: job_id 또는 "book:"+book_id
  const jobIds = uniq(rows.map((r) => r.job_id));
  for (const part of chunks(jobIds)) {
    const { data, error } = await db.from("book_jobs").select("id,title:manuscript->>title").in("id", part);
    if (error) console.warn("[admin] 제목 읽기 오류", error.code, error.message);
    for (const r of (data as { id: string; title: string | null }[] | null) ?? []) {
      if (r.title && r.title.trim()) titles.set(r.id, r.title.trim());
    }
  }
  const bookIds = uniq(rows.filter((r) => !(r.job_id && titles.has(r.job_id))).map((r) => r.book_id));
  for (const part of chunks(bookIds)) {
    const { data, error } = await db.from("books").select("id,title").in("id", part);
    if (error) console.warn("[admin] 책 제목 읽기 오류", error.code, error.message);
    for (const r of (data as { id: string; title: string | null }[] | null) ?? []) {
      if (r.title && r.title.trim()) titles.set(`book:${r.id}`, r.title.trim());
    }
  }
  return titles;
}

export function titleOf(titles: Map<string, string>, r: { job_id: string | null; book_id: string | null }): string | null {
  return (r.job_id && titles.get(r.job_id)) || (r.book_id && titles.get(`book:${r.book_id}`)) || null;
}

/** 회원 id → {아이디, 잔액}. 처리한 마스터 이름·고객 잔액을 한 번에 찾는다. */
export async function profilesFor(db: Db, ids: (string | null | undefined)[]) {
  const out = new Map<string, { username: string; tokens: number }>();
  for (const part of chunks(uniq(ids))) {
    const { data, error } = await db.from("profiles").select("id,username,tokens").in("id", part);
    if (error) console.warn("[admin] 회원 읽기 오류", error.code, error.message);
    for (const p of (data as { id: string; username: string; tokens: number }[] | null) ?? []) {
      out.set(p.id, { username: p.username, tokens: p.tokens });
    }
  }
  return out;
}

/**
 * 이 요청에서 '관리자 계정 것'으로 칠 회원 id — 나 자신 + 보이는 마스터 프로필. 못 읽으면 나 자신만.
 *
 * 사장님 규칙(2026-09-30): 관리자 계정에서 생긴 사고·오류·의견은 관리실 목록·숫자에 넣지 않는다.
 * DB(master_can_see)가 다른 마스터 줄은 이미 가리므로 사실상 '나'뿐이지만, uid 만 보지 않고
 * is_master 로 한 번 더 찾는다 — 그 DB 규칙이 나중에 바뀌어도 이 거르기는 그대로 맞게.
 * 요청마다 새로 읽는다(부른 사람이 다르므로 요청을 넘어 캐시하지 않는다).
 * id 는 소문자로 맞춘다 — dropMasterRows 가 소문자로 비교한다.
 */
export async function masterOwnerIds(caller: Caller): Promise<Set<string>> {
  const ids = new Set<string>([caller.uid.toLowerCase()]);
  const { data, error } = await caller.db.from("profiles").select("id").eq("is_master", true).limit(50);
  if (error) {
    console.warn("[admin] 관리자 계정 읽기 오류", error.code, error.message);
    return ids;
  }
  for (const p of (data as { id: string }[] | null) ?? []) if (p.id) ids.add(p.id.toLowerCase());
  return ids;
}

/** 장부 줄 — 표로 읽을 수 있는 칸만(환불 사유·처리 마스터는 사고 목록 함수에만 있다). */
export type LedgerRow = { id: string; owner: string; amount: number; reason: string; refunded_at: string | null; created_at: string };

export async function ledgerFor(db: Db, ids: (string | null | undefined)[]): Promise<Map<string, LedgerRow>> {
  const out = new Map<string, LedgerRow>();
  for (const part of chunks(uniq(ids))) {
    const { data, error } = await db
      .from("token_ledger")
      .select("id,owner,amount,reason,refunded_at,created_at")
      .in("id", part);
    if (error) console.warn("[admin] 장부 읽기 오류", error.code, error.message);
    for (const r of (data as LedgerRow[] | null) ?? []) out.set(r.id, r);
  }
  return out;
}
