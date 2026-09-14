import {
  failureLines,
  failureStages,
  isUuid,
  previewPages,
  type IncidentRow,
  type JobDetail,
  type Payment,
} from "@/lib/admin";
import { fetchIncidents, ledgerFor, profilesFor, type LedgerRow } from "../_data";
import { dbFail, fail, json, masterOnly } from "../_guard";

/**
 * GET /api/admin/job?id=<기록 id>   — 사고 한 건(또는 사고 아닌 기록) 상세
 * GET /api/admin/job?entry=<장부 id> — 기록 없이 남은 결제 상세
 *
 * 무엇을 모으나: 원고(쪽 본문·그림 상태), 실패 이유, 결제 두 건(환불 여부·사유·처리 마스터),
 * 책이 실제로 있나, 주인 아이디·잔액.
 *
 * 환불 사유·처리 마스터·마스터 메모는 표로 못 읽는 칸이라(고객에게 안 보이게 막아 둔 칸)
 * 사고 목록 함수를 그 고객 한 명으로 좁혀 불러 찾는다. 사고가 아닌 기록이면 그 줄이 없어서
 * 장부 표의 칸(금액·환불 시각)만 보인다.
 */
const JOB_COLUMNS =
  "id,owner,book_id,status,page_count,drawn,draw_failed,upload_failed,failures,error," +
  "story_entry,illustration_entry,saved_at,restored_at,resolved_at,created_at,updated_at," +
  "title:manuscript->>title,pages:manuscript->pages";

type JobRead = {
  id: string;
  owner: string;
  book_id: string | null;
  status: string;
  page_count: number | null;
  drawn: number;
  draw_failed: number;
  upload_failed: number;
  failures: unknown;
  error: string | null;
  story_entry: string | null;
  illustration_entry: string | null;
  saved_at: string | null;
  restored_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  title: string | null;
  pages: unknown;
};

function payment(
  entry: string | null,
  ledger: Map<string, LedgerRow>,
  inc: { amount: number | null; refundedAt: string | null; by: string | null; note: string | null } | null,
  names: Map<string, { username: string }>,
): Payment | null {
  if (!entry) return null;
  const l = ledger.get(entry);
  return {
    entry,
    amount: inc?.amount ?? l?.amount ?? null,
    refundedAt: inc?.refundedAt ?? l?.refunded_at ?? null,
    refundedBy: inc?.by ? (names.get(inc.by)?.username ?? "마스터") : null,
    note: inc?.note ?? null,
    // 사고 줄이 있을 때만 처리자·사유를 안다. 없으면 '앱이 되돌림'인지 마스터 환불인지 가릴 수 없다.
    byKnown: !!inc,
  };
}

/**
 * 미리보기에 <img> 로 띄워도 되는 그림 저장소. 원고·책의 그림 칸은 회원이 쓸 수 있어서
 * 여기 없는 주소를 마스터 브라우저가 부르면 마스터 IP·열람 시각이 남의 서버로 샌다.
 * 앱은 그림을 cafe24(CAFE24_PUBLIC_BASE_URL)에 올린다. Supabase 공개 저장소도 우리 것이라 같이 둔다.
 */
function trustedImageBases(): string[] {
  const supa = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  return [process.env.CAFE24_PUBLIC_BASE_URL ?? "", supa ? `${supa}/storage/v1/object/public` : ""].filter(Boolean);
}

export const GET = masterOnly(async (caller, request) => {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const entry = url.searchParams.get("entry");
  if (id !== null && !isUuid(id)) return fail("기록 id 모양이 아니에요.", 400);
  if (entry !== null && !isUuid(entry)) return fail("결제 id 모양이 아니에요.", 400);
  if (!id && !entry) return fail("기록 id 나 결제 id 를 주세요.", 400);

  let job: JobRead | null = null;
  let member: string;
  if (id) {
    const { data, error } = await caller.db.from("book_jobs").select(JOB_COLUMNS).eq("id", id).maybeSingle();
    if (error) return dbFail(error);
    if (!data) return fail("만들기 기록이 없어요.", 404);
    job = data as unknown as JobRead;
  } else {
    // 기록 없던 결제를 '처리 끝'으로 내리면 DB 가 그 결제를 가리키는 기록을 새로 만든다.
    // 열어 둔 상세를 다시 읽을 때 그 기록으로 넘어가야 처리 끝·메모가 보인다.
    const { data: linked, error: linkErr } = await caller.db
      .from("book_jobs")
      .select(JOB_COLUMNS)
      .or(`story_entry.eq.${entry},illustration_entry.eq.${entry}`)
      .order("created_at", { ascending: false })
      .limit(1);
    if (linkErr) return dbFail(linkErr);
    job = ((linked as unknown as JobRead[] | null) ?? [])[0] ?? null;
  }
  if (job) {
    member = job.owner;
  } else {
    const { data, error } = await caller.db
      .from("token_ledger")
      .select("id,owner,amount,reason,refunded_at,created_at")
      .eq("id", entry as string)
      .maybeSingle();
    if (error) return dbFail(error);
    if (!data) return fail("결제 기록이 없어요.", 404);
    member = (data as LedgerRow).owner;
  }

  // 그 고객의 사고 줄 — 환불 사유·처리 마스터·메모는 여기서만 읽힌다.
  const { rows, error: incErr } = await fetchIncidents(caller, { owner: member, includeResolved: true, limit: 2000 });
  if (incErr) return dbFail(incErr);
  const inc: IncidentRow | null = job
    ? (rows.find((r) => r.job_id === job.id) ?? null)
    : (rows.find((r) => !r.job_id && (r.story_entry === entry || r.illustration_entry === entry)) ?? null);

  const storyEntry = job ? job.story_entry : (inc?.story_entry ?? null);
  const illEntry = job ? job.illustration_entry : (inc?.illustration_entry ?? null);
  // 기록 없는 결제인데 사고 줄이 없으면(환불됐거나 옛 결제) 장부 줄 종류로 자리를 정한다.
  const [ledger, book] = await Promise.all([
    ledgerFor(caller.db, [storyEntry, illEntry, entry]),
    job?.book_id
      ? caller.db.from("books").select("id,owner,hidden,title,pages:data->pages").eq("id", job.book_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (book.error) console.warn("[admin] 책 읽기 오류", book.error.code, book.error.message);
  const bookRow = book.data as { id: string; owner: string; hidden: boolean; title: string | null; pages: unknown } | null;
  // 같은 id 의 책이 남의 것이면 이 고객 책이 아니다 — 있다고 보여 주면 되살리기를 잘못 막는다.
  const ownBook = bookRow && bookRow.owner === member ? bookRow : null;

  let sEntry = storyEntry;
  let iEntry = illEntry;
  if (!job && !inc && entry) {
    const l = ledger.get(entry);
    if (l?.reason === "illustration") iEntry = entry;
    else sEntry = entry;
  }

  const names = await profilesFor(caller.db, [
    member,
    inc?.story_refunded_by,
    inc?.illustration_refunded_by,
    inc?.restored_by,
    inc?.resolved_by,
  ]);

  const bases = trustedImageBases();
  const manuscriptPages = previewPages(job?.pages, bases);
  const pages = ownBook ? previewPages(ownBook.pages, bases) : manuscriptPages;

  const detail: JobDetail = {
    jobId: job?.id ?? null,
    entryId: job ? null : entry,
    member,
    username: names.get(member)?.username ?? inc?.username ?? null,
    tokens: names.get(member)?.tokens ?? null,
    bookId: job?.book_id ?? null,
    bookExists: !!ownBook,
    bookHidden: !!ownBook?.hidden,
    status: job?.status ?? null,
    title: (job?.title ?? "").trim() || ownBook?.title || null,
    kinds: inc?.kinds ?? [],
    error: job ? job.error : (inc?.error ?? null),
    failures: failureLines(job?.failures),
    failureStages: failureStages(job?.failures),
    pageCount: job?.page_count ?? null,
    drawn: job?.drawn ?? 0,
    drawFailed: job?.draw_failed ?? 0,
    uploadFailed: job?.upload_failed ?? 0,
    otherBooks: inc?.books_saved_after_payment ?? 0,
    pages,
    pagesFrom: ownBook ? "book" : "manuscript",
    manuscriptPages,
    manuscriptTitle: (job?.title ?? "").trim() || null,
    story: payment(
      sEntry,
      ledger,
      inc && inc.story_entry === sEntry
        ? { amount: inc.story_amount, refundedAt: inc.story_refunded_at, by: inc.story_refunded_by, note: inc.story_refund_note }
        : null,
      names,
    ),
    illustration: payment(
      iEntry,
      ledger,
      inc && inc.illustration_entry === iEntry
        ? {
            amount: inc.illustration_amount,
            refundedAt: inc.illustration_refunded_at,
            by: inc.illustration_refunded_by,
            note: inc.illustration_refund_note,
          }
        : null,
      names,
    ),
    createdAt: job?.created_at ?? inc?.created_at ?? ledger.get(entry ?? "")?.created_at ?? null,
    updatedAt: job?.updated_at ?? inc?.updated_at ?? null,
    restoredAt: job?.restored_at ?? null,
    restoredBy: inc?.restored_by ? (names.get(inc.restored_by)?.username ?? "마스터") : null,
    resolvedAt: job?.resolved_at ?? inc?.resolved_at ?? null,
    resolvedBy: inc?.resolved_by ? (names.get(inc.resolved_by)?.username ?? "마스터") : null,
    masterNote: inc?.master_note ?? null,
  };
  return json(detail);
});
