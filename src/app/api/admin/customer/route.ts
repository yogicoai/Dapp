import { escapeLike, openIncidentCount, parseUsername, type CustomerJob, type CustomerResponse } from "@/lib/admin";
import { parseAdminId } from "@/lib/admin-console";
import type { Caller } from "@/lib/api-auth";
import { fetchIncidents, INCIDENT_LIST_COLUMNS, ledgerFor, titleOf, titlesFor } from "../_data";
import { dbFail, fail, json, masterOnly } from "../_guard";

/**
 * GET /api/admin/customer?username=<아이디> — 고객 찾기.
 * GET /api/admin/customer?id=<uuid>        — 회원 화면(/admin/members/<id>)이 같은 모양을 id 로 읽는다.
 *
 * 프로필(잔액·가입일) · 책 수 · 열린 사고 · 만들기 기록 표를 한 번에 준다.
 * 기록 표는 사고가 아닌 기록도 보여야 해서(고객이 "지난주 만든 것"을 말할 때) book_jobs 를
 * 직접 읽고, 사고 목록 함수의 종류(kinds)를 기록 id 로 붙인다. 기록 없는 결제는 함수에만 있어 뒤에 더한다.
 */
const JOB_COLUMNS =
  "id,book_id,status,page_count,drawn,story_entry,illustration_entry,resolved_at,created_at,updated_at";
const JOB_LIMIT = 100;

export const GET = masterOnly(async (caller, request) => {
  const sp = new URL(request.url).searchParams;
  type P = { id: string; username: string; tokens: number; is_master: boolean; created_at: string | null };
  const PROFILE_COLUMNS = "id,username,tokens,is_master,created_at";

  // ?id=<uuid> — 회원 화면(/admin/members/<id>)은 아이디가 아니라 id 로 연다(아이디는 바뀔 수 있고, 주소에 넣기 좋다).
  // 한 사람을 콕 집어 여는 길이라 관리자 계정 거르기를 하지 않는다(내 계정도 id 로 열어 점검할 수 있게).
  if (sp.has("id")) {
    const id = parseAdminId(sp.get("id"));
    if (!id.ok) return fail(id.error, 400);
    const byId = await caller.db.from("profiles").select(PROFILE_COLUMNS).eq("id", id.value).limit(1);
    if (byId.error) return dbFail(byId.error);
    const found = ((byId.data as P[] | null) ?? [])[0];
    if (!found) return fail("회원을 찾지 못했어요.", 404);
    return customerBody(caller, found);
  }

  const parsed = parseUsername(sp.get("username"));
  if (!parsed.ok) return fail(parsed.error, 400);

  // 먼저 정확히 같은 아이디, 없으면 대소문자만 무시해 다시 찾는다(구글 가입은 이메일 앞부분 그대로라 대문자가 섞일 수 있다).
  // ilike 는 PostgREST 가 * 를 % 로 바꿔 버려 글자로 못 막으므로, * 가 든 아이디는 정확히 같은 것만 찾는다.
  const exact = await caller.db.from("profiles").select(PROFILE_COLUMNS).eq("username", parsed.value).limit(1);
  if (exact.error) return dbFail(exact.error);
  let p = ((exact.data as P[] | null) ?? [])[0];
  if (!p && !parsed.value.includes("*")) {
    const loose = await caller.db
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .ilike("username", escapeLike(parsed.value))
      .limit(2);
    if (loose.error) return dbFail(loose.error);
    const list = (loose.data as P[] | null) ?? [];
    // 대소문자만 다른 아이디가 둘이면 누구인지 모른다 — 짐작해서 남의 기록을 열지 않는다.
    if (list.length > 1) return fail(`'${parsed.value}' 와 대소문자만 다른 아이디가 여럿이에요. 정확히 적어 주세요.`, 409);
    p = list[0];
  }
  if (!p) return fail(`'${parsed.value}' 아이디를 찾지 못했어요.`, 404);
  return customerBody(caller, p);
});

/** 찾은 회원 한 명의 잔액·책 수·열린 사고·만들기 기록 표 — 아이디로 찾든 id 로 찾든 같은 모양으로 준다. */
async function customerBody(
  caller: Caller,
  p: { id: string; username: string; tokens: number; is_master: boolean; created_at: string | null },
): Promise<Response> {
  const [books, jobsRes, inc] = await Promise.all([
    caller.db.from("books").select("id", { count: "exact", head: true }).eq("owner", p.id),
    caller.db
      .from("book_jobs")
      .select(JOB_COLUMNS)
      .eq("owner", p.id)
      .order("created_at", { ascending: false })
      .limit(JOB_LIMIT + 1),
    fetchIncidents(caller, { owner: p.id, includeResolved: true, limit: 2000, columns: INCIDENT_LIST_COLUMNS }),
  ]);
  if (books.error) return dbFail(books.error);
  if (jobsRes.error) return dbFail(jobsRes.error);
  if (inc.error) return dbFail(inc.error);

  type J = {
    id: string;
    book_id: string | null;
    status: string;
    page_count: number | null;
    drawn: number;
    story_entry: string | null;
    illustration_entry: string | null;
    resolved_at: string | null;
    created_at: string;
    updated_at: string;
  };
  const all = (jobsRes.data as J[] | null) ?? [];
  const truncated = all.length > JOB_LIMIT;
  const jobs = all.slice(0, JOB_LIMIT);

  const kindsByJob = new Map(inc.rows.filter((r) => r.job_id).map((r) => [r.job_id as string, r.kinds]));
  const orphans = inc.rows.filter((r) => !r.job_id);

  const [titles, ledger] = await Promise.all([
    titlesFor(
      caller.db,
      jobs.map((j) => ({ job_id: j.id, book_id: j.book_id, member: p.id })),
    ),
    ledgerFor(caller.db, jobs.flatMap((j) => [j.story_entry, j.illustration_entry])),
  ]);

  const pay = (e: string | null) => {
    if (!e) return null;
    const l = ledger.get(e);
    return { amount: l?.amount ?? null, refunded: !!l?.refunded_at };
  };

  const rows: CustomerJob[] = [
    ...orphans.map((o) => ({
      jobId: null,
      entryId: o.story_entry ?? o.illustration_entry,
      title: null,
      status: null,
      pageCount: null,
      drawn: 0,
      payments: [
        o.story_entry ? { amount: o.story_amount, refunded: !!o.story_refunded_at } : null,
        o.illustration_entry ? { amount: o.illustration_amount, refunded: !!o.illustration_refunded_at } : null,
      ].filter((x): x is { amount: number | null; refunded: boolean } => !!x),
      kinds: o.kinds,
      resolvedAt: o.resolved_at,
      createdAt: o.created_at,
    })),
    ...jobs.map((j) => ({
      jobId: j.id,
      entryId: null,
      title: titleOf(titles, { job_id: j.id, book_id: j.book_id }),
      status: j.status,
      pageCount: j.page_count,
      drawn: j.drawn ?? 0,
      payments: [pay(j.story_entry), pay(j.illustration_entry)].filter(
        (x): x is { amount: number | null; refunded: boolean } => !!x,
      ),
      kinds: kindsByJob.get(j.id) ?? [],
      resolvedAt: j.resolved_at,
      createdAt: j.created_at,
    })),
  ].sort((a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? ""));

  const body: CustomerResponse = {
    profile: { id: p.id, username: p.username, tokens: p.tokens, createdAt: p.created_at, isMaster: p.is_master },
    booksCount: books.count ?? 0,
    openIncidents: openIncidentCount(inc.rows),
    jobs: rows,
    truncated,
  };
  return json(body);
}
