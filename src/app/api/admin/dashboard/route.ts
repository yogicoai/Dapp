import { isMineFlag } from "@/lib/admin-console";
import {
  dashboardWindow,
  readAllPages,
  summarizeDashboard,
  type DashBook,
  type DashFeedback,
  type DashIncident,
  type DashLedger,
  type DashProfile,
  type DashRead,
} from "@/lib/admin-dashboard";
import { DEV_BOOK_LIKE } from "@/lib/dev-books";
import { fetchIncidents, masterOwnerIds } from "../_data";
import { json, masterOnly } from "../_guard";

/**
 * GET /api/admin/dashboard?mine=1 — 관리자 페이지 첫 화면의 오늘·7일 숫자.
 *
 * 새 회원 · 만든 동화 · 쓴 토큰 · 되돌린 토큰 · 열린 사고 · 남은 의견 · 최근 가입.
 * 실제 결제(원)는 없다 — 결제사를 붙이기 전이라 보여 줄 진짜 숫자가 없다.
 *
 * 관리자 계정(fe·yogico)에서 생긴 책·장부·사고·의견은 숫자에서 뺀다(사장님 2026-09-30
 * "fe 마스터니깐 여기서 발생된 사고 에대해선 안남아도 되"). 화면의 '내 계정 것도 보기'(mine=1)를
 * 켰을 때만 센다. 회원 수·최근 가입은 '고객'을 세는 칸이라 늘 뺀다. 세는 일은 순수 함수
 * summarizeDashboard(lib/admin-dashboard.ts, 시험 있음)가 하고, 여기는 읽기만 한다.
 *
 * 전부 마스터의 토큰(caller.db)으로 읽는다 — RLS 마스터 열람 정책이 허락한 만큼만 보인다.
 * 한 읽기가 실패해도 나머지 숫자는 준다(그 칸은 '–' + "일부 숫자를 못 읽었어요").
 * 표는 여러 쪽으로 나눠 읽는다 — Supabase 는 한 번에 1000줄까지만 돌려줘서, 한 번에 읽으면 조용히 모자란다.
 */
export const GET = masterOnly(async (caller, request) => {
  const includeMine = isMineFlag(new URL(request.url).searchParams);
  const now = new Date();
  const { weekStart } = dashboardWindow(now);
  const db = caller.db;

  const [masters, profiles, total, recent, books, ledger, refunded, inc, fb] = await Promise.all([
    masterOwnerIds(caller),
    readAllPages<DashProfile>(
      (from, to) =>
        db
          .from("profiles")
          .select("id,username,is_master,created_at")
          .gte("created_at", weekStart)
          .order("created_at")
          .order("id")
          .range(from, to),
      5_000,
    ),
    db.from("profiles").select("id", { count: "exact", head: true }).eq("is_master", false),
    db
      .from("profiles")
      .select("id,username,is_master,created_at")
      .eq("is_master", false)
      .order("created_at", { ascending: false })
      .limit(10),
    readAllPages<DashBook>(
      (from, to) =>
        db.from("books").select("owner,created_at").not("id", "like", DEV_BOOK_LIKE).gte("created_at", weekStart).order("created_at").order("id").range(from, to),
      10_000,
    ),
    // 장부는 칸 권한이 있는 여섯 칸 안에서만 고른다.
    readAllPages<DashLedger>(
      (from, to) =>
        db
          .from("token_ledger")
          .select("owner,amount,refunded_at,created_at")
          .gte("created_at", weekStart)
          .order("created_at")
          .order("id")
          .range(from, to),
      20_000,
    ),
    // 되돌린 토큰은 '되돌린 날' 기준 — 지난달에 쓰고 오늘 되돌린 것도 오늘 숫자다.
    readAllPages<DashLedger>(
      (from, to) =>
        db
          .from("token_ledger")
          .select("owner,amount,refunded_at,created_at")
          .gte("refunded_at", weekStart)
          .order("refunded_at")
          .order("id")
          .range(from, to),
      20_000,
    ),
    // member 칸이 있어야 누구 사고인지 가린다. total_count 로 잘렸는지 안다.
    fetchIncidents(caller, { limit: 500, columns: "member,kinds,resolved_at,total_count" }),
    caller.db.rpc("master_feedback_list", { p_only_open: true, p_limit: 200 }),
  ]);

  const warn = (what: string, e: { code?: string | null; message?: string | null } | null) => {
    if (e) console.warn(`[admin/dashboard] ${what} 읽기 오류`, e.code, e.message);
  };
  warn("가입", profiles.error);
  warn("회원 수", total.error);
  warn("최근 가입", recent.error);
  warn("책", books.error);
  warn("장부", ledger.error);
  warn("되돌린 장부", refunded.error);
  warn("사고", inc.error);
  warn("의견", fb.error);

  const read = <T,>(r: { rows: T[]; error: unknown; truncated: boolean }): DashRead<T> =>
    r.error ? { rows: null } : { rows: r.rows, truncated: r.truncated };

  const incRows = inc.error ? null : (inc.rows as DashIncident[]);
  const fbRows = fb.error ? null : ((fb.data as DashFeedback[] | null) ?? []);

  const body = summarizeDashboard(
    {
      profiles: read(profiles),
      memberTotal: total.error ? null : (total.count ?? null),
      recent: recent.error ? { rows: null } : { rows: (recent.data as DashProfile[] | null) ?? [] },
      books: read(books),
      ledger: read(ledger),
      refunded: read(refunded),
      incidents: incRows
        ? { rows: incRows, truncated: (inc.rows[0]?.total_count ?? 0) > inc.rows.length }
        : { rows: null },
      feedback: fbRows ? { rows: fbRows, truncated: fbRows.length >= 200 } : { rows: null },
    },
    { now, masterIds: masters, includeMine },
  );
  return json(body);
});
