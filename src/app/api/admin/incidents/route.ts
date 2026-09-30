import { kstDayStart, openIncidentCount, summarizeToday, type IncidentListRow, type IncidentsResponse } from "@/lib/admin";
import { dropMasterRows, isMineFlag } from "@/lib/admin-console";
import { keepCustomerIncidents, notInFilter } from "@/lib/admin-support";
import { fetchIncidents, INCIDENT_LIST_COLUMNS, masterOwnerIds, titleOf, titlesFor } from "../_data";
import { dbFail, json, masterOnly } from "../_guard";

/**
 * GET /api/admin/incidents?resolved=1&mine=1 — 사고 목록 + 오늘 현황.
 *
 * 둘을 한 번에 주는 까닭: 오늘 현황의 '돈 냈는데 책 없음 · 멈춘 만들기'는 사고 목록 함수로만 셀 수 있다.
 * 따로 부르면 같은 무거운 함수(books·장부·흔적 대조)를 두 번 돌린다.
 * 종류 칩 거르기는 화면에서 한다 — 칩마다 개수를 보여 줘야 해서 어차피 전체가 필요하다.
 *
 * 관리자 계정에서 생긴 사고는 뺀다(사장님 2026-09-30 "fe 마스터니깐 … 안남아도 되").
 * 사고는 따로 적는 표가 없고 만들기 기록에서 매번 계산하므로, 적기는 그대로 두고 여기서 읽을 때 뺀다 —
 * 목록 · 열린 수 · 전체 수 · 오늘 현황(책 수 · 되돌린 토큰) 모두. mine=1('내 계정 것도 보기')이면 그대로 준다.
 * 메뉴 배지는 이 경로가 아니라 /api/admin/badges 가 센다(그쪽은 스위치와 상관없이 늘 뺀다).
 */
export const GET = masterOnly(async (caller, request) => {
  const url = new URL(request.url);
  const includeResolved = url.searchParams.get("resolved") === "1";
  const mine = isMineFlag(url.searchParams);
  const now = new Date();

  const [{ rows: all, error }, masters] = await Promise.all([
    fetchIncidents(caller, { includeResolved, limit: 500, columns: INCIDENT_LIST_COLUMNS }),
    // 스위치가 켜져 있으면 뺄 것이 없으니 관리자 계정을 찾지 않는다.
    mine ? Promise.resolve(new Set<string>()) : masterOwnerIds(caller),
  ]);
  if (error) return dbFail(error);
  const { rows, total } = keepCustomerIncidents(all, masters, mine);

  const since = kstDayStart(now).toISOString();
  let booksQuery = caller.db.from("books").select("id", { count: "exact", head: true }).gte("created_at", since);
  // 오늘 만든 책 수도 관리자 계정 책은 빼고 센다 — 점검하느라 만든 책이 '오늘 만든 동화'를 부풀리지 않게.
  const notMine = mine ? null : notInFilter(masters);
  if (notMine) booksQuery = booksQuery.not("owner", "in", notMine);
  const [titles, booksToday, refunds] = await Promise.all([
    titlesFor(caller.db, rows),
    booksQuery,
    // 주인(owner) 칸을 같이 읽어야 관리자 계정 환불을 뺄 수 있다(칸 권한: id·owner·amount·reason·refunded_at·created_at).
    caller.db.from("token_ledger").select("owner,amount,refunded_at").gte("refunded_at", since).limit(5000),
  ]);
  if (booksToday.error) console.warn("[admin] 오늘 책 수 오류", booksToday.error.code, booksToday.error.message);
  if (refunds.error) console.warn("[admin] 오늘 환불 오류", refunds.error.code, refunds.error.message);
  const refundRows = dropMasterRows(
    (refunds.data as { owner: string | null; amount: number; refunded_at: string | null }[] | null) ?? [],
    (r) => r.owner,
    masters,
    mine,
  ).rows;

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
    total,
    openCount: openIncidentCount(rows),
    today: summarizeToday({
      booksToday: booksToday.count ?? 0,
      incidents: rows,
      refunds: refundRows,
      now,
    }),
  };
  return json(body);
});
