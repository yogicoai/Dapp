import { kstDayStart, openIncidentCount, summarizeToday, type IncidentListRow, type IncidentsResponse } from "@/lib/admin";
import { fetchIncidents, INCIDENT_LIST_COLUMNS, titleOf, titlesFor } from "../_data";
import { dbFail, json, masterOnly } from "../_guard";

/**
 * GET /api/admin/incidents?resolved=1 — 사고 목록 + 오늘 현황.
 *
 * 둘을 한 번에 주는 까닭: 오늘 현황의 '돈 냈는데 책 없음 · 멈춘 만들기'는 사고 목록 함수로만 셀 수 있다.
 * 따로 부르면 같은 무거운 함수(books·장부·흔적 대조)를 두 번 돌린다.
 * 종류 칩 거르기는 화면에서 한다 — 칩마다 개수를 보여 줘야 해서 어차피 전체가 필요하다.
 */
export const GET = masterOnly(async (caller, request) => {
  const url = new URL(request.url);
  const includeResolved = url.searchParams.get("resolved") === "1";
  const now = new Date();

  const { rows, error } = await fetchIncidents(caller, { includeResolved, limit: 500, columns: INCIDENT_LIST_COLUMNS });
  if (error) return dbFail(error);

  const since = kstDayStart(now).toISOString();
  const [titles, booksToday, refunds] = await Promise.all([
    titlesFor(caller.db, rows),
    caller.db.from("books").select("id", { count: "exact", head: true }).gte("created_at", since),
    caller.db.from("token_ledger").select("amount,refunded_at").gte("refunded_at", since).limit(5000),
  ]);
  if (booksToday.error) console.warn("[admin] 오늘 책 수 오류", booksToday.error.code, booksToday.error.message);
  if (refunds.error) console.warn("[admin] 오늘 환불 오류", refunds.error.code, refunds.error.message);

  // 목록에는 원고성 칸(실패 목록)·내부 메모를 싣지 않는다 — 상세를 열 때만 준다.
  const incidents: IncidentListRow[] = rows.map((r) => {
    const { failures: _f, master_note: _n, story_refund_note: _s, illustration_refund_note: _i, ...rest } = r;
    void _f;
    void _n;
    void _s;
    void _i;
    return { ...rest, title: titleOf(titles, r) };
  });

  const body: IncidentsResponse = {
    me: caller.username,
    now: now.toISOString(),
    incidents,
    total: rows[0]?.total_count ?? 0,
    openCount: openIncidentCount(rows),
    today: summarizeToday({
      booksToday: booksToday.count ?? 0,
      incidents: rows,
      refunds: (refunds.data as { amount: number; refunded_at: string | null }[] | null) ?? [],
      now,
    }),
  };
  return json(body);
});
