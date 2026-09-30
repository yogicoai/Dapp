import { readAllPages } from "@/lib/admin-dashboard";
import { groupReadyVoices, type MembersListResponse, type MemberListRow } from "@/lib/admin-members";
import { dbFail, json, masterOnly } from "../_guard";

/**
 * GET /api/admin/customers — 가입한 회원 목록 (최근 가입 먼저). 관리자 페이지 '회원' 화면이 쓴다.
 *
 * 왜: 베타 테스터를 관리하려면 "누가 가입했나"를 아이디를 몰라도 한눈에 봐야 한다.
 * 예전엔 아이디를 정확히 알아야 찾을 수 있었다(고객 찾기).
 *
 * 마스터 계정은 목록에서 뺀다 — 이 목록은 '고객'이고, 마스터는 우리 계정이다.
 * (다른 마스터의 줄은 DB 의 master_can_see 정책이 이미 가린다. 여기서는 내 계정까지 뺀다.)
 * 책 수·남은 의견 수·부모 목소리는 표를 한 번씩만 읽어 회원마다 센다 — 회원마다 세면 요청이 수십 번 나간다.
 * 부모 목소리는 준비된(ready) 것만 '등록'으로 본다(설정 화면 관리실에서 옮겨 온 규칙, 2026-09-30).
 *
 * 책·의견은 여러 쪽으로 나눠 읽는다 — Supabase 는 한 번에 1000줄까지만 돌려줘서, 한 번에 읽으면
 * 책이 1000권을 넘는 날부터 회원별 책 수가 조용히 모자라게 보인다.
 */
const LIMIT = 300;

export const GET = masterOnly(async (caller) => {
  const db = caller.db;
  const profiles = await db
    .from("profiles")
    .select("id,username,tokens,is_master,created_at")
    .eq("is_master", false)
    .order("created_at", { ascending: false })
    .limit(LIMIT + 1);
  if (profiles.error) return dbFail(profiles.error);

  type P = { id: string; username: string; tokens: number; is_master: boolean; created_at: string | null };
  // is_master 칸으로 이미 걸렀지만 한 번 더 — 내 계정이 목록에 섞이면 사장님이 자기에게 환불할 수 있다.
  const rows = ((profiles.data as P[] | null) ?? []).filter((p) => !p.is_master && p.id !== caller.uid);
  const truncated = rows.length > LIMIT;
  const shown = rows.slice(0, LIMIT);

  const [total, books, feedback, voices] = await Promise.all([
    db.from("profiles").select("id", { count: "exact", head: true }).eq("is_master", false),
    readAllPages<{ owner: string }>(
      (from, to) => db.from("books").select("owner").order("created_at", { ascending: true }).order("id").range(from, to),
      20_000,
    ),
    readAllPages<{ owner: string; handled_at: string | null }>(
      (from, to) =>
        db.from("feedback").select("owner,handled_at").is("handled_at", null).order("created_at").order("id").range(from, to),
      5_000,
    ),
    db.from("voice_clones").select("owner,role,status").limit(5000),
  ]);
  if (total.error) console.warn("[admin/customers] 회원 수 오류", total.error.code, total.error.message);
  if (books.error) console.warn("[admin/customers] 책 수 오류", books.error.code, books.error.message);
  if (feedback.error) console.warn("[admin/customers] 의견 수 오류", feedback.error.code, feedback.error.message);
  if (voices.error) console.warn("[admin/customers] 목소리 오류", voices.error.code, voices.error.message);

  const bookCount = new Map<string, number>();
  for (const b of books.rows) bookCount.set(b.owner, (bookCount.get(b.owner) ?? 0) + 1);
  const openCount = new Map<string, number>();
  for (const f of feedback.rows) {
    if (f.handled_at) continue;
    openCount.set(f.owner, (openCount.get(f.owner) ?? 0) + 1);
  }
  const voicesBy = groupReadyVoices(
    (voices.data as { owner: string | null; role: string | null; status: string | null }[] | null) ?? [],
  );

  const customers: MemberListRow[] = shown.map((p) => ({
    id: p.id,
    username: p.username,
    tokens: p.tokens,
    createdAt: p.created_at,
    books: bookCount.get(p.id) ?? 0,
    openFeedback: openCount.get(p.id) ?? 0,
    voices: voicesBy.get(p.id) ?? [],
  }));

  const partial: MembersListResponse["partial"] = [];
  if (books.error || books.truncated) partial.push("books");
  if (feedback.error || feedback.truncated) partial.push("feedback");
  if (voices.error) partial.push("voices");

  const body: MembersListResponse = {
    customers,
    total: typeof total.count === "number" ? total.count : rows.length,
    truncated,
    partial,
    me: caller.username,
  };
  return json(body);
});
