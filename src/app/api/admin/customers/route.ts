import { dbFail, json, masterOnly } from "../_guard";

/**
 * GET /api/admin/customers — 가입한 회원 목록 (최근 가입 먼저).
 *
 * 왜: 베타 테스터를 관리하려면 "누가 가입했나"를 아이디를 몰라도 한눈에 봐야 한다.
 * 예전엔 아이디를 정확히 알아야 찾을 수 있었다(고객 찾기).
 *
 * 마스터 계정은 목록에서 뺀다 — 이 목록은 '고객'이고, 마스터는 우리 계정이다.
 * (다른 마스터의 줄은 DB 의 master_can_see 정책이 이미 가린다. 여기서는 내 계정까지 뺀다.)
 * 책 수는 books 를 한 번만 읽어 화면에서 센다 — 회원마다 세면 요청이 수십 번 나간다.
 */
export type CustomerRow = {
  id: string;
  username: string;
  tokens: number;
  createdAt: string | null;
  books: number;
  /** 아직 처리 안 한 의견 수 — 있으면 목록에서 눈에 띄게 한다. */
  openFeedback: number;
};

export type CustomersResponse = { customers: CustomerRow[]; total: number; me: string };

const LIMIT = 300;

export const GET = masterOnly(async (caller) => {
  const profiles = await caller.db
    .from("profiles")
    .select("id,username,tokens,is_master,created_at")
    .order("created_at", { ascending: false })
    .limit(LIMIT + 1);
  if (profiles.error) return dbFail(profiles.error);

  type P = { id: string; username: string; tokens: number; is_master: boolean; created_at: string | null };
  const rows = ((profiles.data as P[] | null) ?? []).filter((p) => !p.is_master);

  // 책 수 · 남은 의견 수는 한 번씩만 읽어 회원별로 센다.
  const [books, feedback] = await Promise.all([
    caller.db.from("books").select("owner").limit(5000),
    caller.db.from("feedback").select("owner,handled_at").limit(2000),
  ]);
  if (books.error) console.warn("[admin/customers] 책 수 오류", books.error.code, books.error.message);
  if (feedback.error) console.warn("[admin/customers] 의견 수 오류", feedback.error.code, feedback.error.message);

  const bookCount = new Map<string, number>();
  for (const b of ((books.data as { owner: string }[] | null) ?? [])) {
    bookCount.set(b.owner, (bookCount.get(b.owner) ?? 0) + 1);
  }
  const openCount = new Map<string, number>();
  for (const f of ((feedback.data as { owner: string; handled_at: string | null }[] | null) ?? [])) {
    if (f.handled_at) continue;
    openCount.set(f.owner, (openCount.get(f.owner) ?? 0) + 1);
  }

  const customers: CustomerRow[] = rows.slice(0, LIMIT).map((p) => ({
    id: p.id,
    username: p.username,
    tokens: p.tokens,
    createdAt: p.created_at,
    books: bookCount.get(p.id) ?? 0,
    openFeedback: openCount.get(p.id) ?? 0,
  }));

  const body: CustomersResponse = { customers, total: rows.length, me: caller.username };
  return json(body);
});
