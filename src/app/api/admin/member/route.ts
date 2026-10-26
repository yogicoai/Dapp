import { isSchemaMissing, parseAdminId } from "@/lib/admin-console";
import {
  readyVoiceRoles,
  toLedgerLines,
  type GrantLine,
  type LedgerRefundInfo,
  type MemberBook,
  type MemberExtras,
  type MemberExtrasPart,
} from "@/lib/admin-members";
import { DEV_BOOK_LIKE } from "@/lib/dev-books";
import { profilesFor } from "../_data";
import { dbFail, fail, json, masterOnly } from "../_guard";

/**
 * GET /api/admin/member?id=<uuid> — 회원 한 명의 책 · 부모 목소리 · 토큰 장부 · 충전 기록.
 *
 * 설정 화면 '관리실'에서 옮겨 온 것(2026-09-30): 회원을 펼치면 보이던 책 목록·목소리 등록 여부가
 * 관리자 페이지 회원 화면의 탭이 됐다. 잔액·만들기 기록은 /api/admin/customer?id= 가 준다(따로 읽는다).
 *
 * 한 사람을 콕 집어 여는 길이라 관리자 계정 거르기를 하지 않는다 — 점검하려고 내 계정을 여는 길이다.
 * 한 부분(책·목소리·장부·충전)을 못 읽어도 나머지는 준다 — 그 탭만 '읽지 못했어요'를 보인다.
 *
 * 장부의 되돌린 사유·처리자는 표로 못 읽는다(칸 권한). master_ledger_entries 로 되돌린 줄만 물어 붙인다.
 * 그 함수가 없는 옛 DB 면 '처리자 확인 불가'로 둔다 — 처리자가 비었다고 '앱이 되돌림'으로 단정하지 않는다.
 */
const BOOK_LIMIT = 200;
const LEDGER_LIMIT = 200;
const GRANT_LIMIT = 100;

export const GET = masterOnly(async (caller, request) => {
  const id = parseAdminId(new URL(request.url).searchParams.get("id"));
  if (!id.ok) return fail(id.error, 400);
  const db = caller.db;

  // 보이는 회원인가 — 없거나(탈퇴) 다른 관리자 계정이면(DB 가 가린다) 여기서 끝.
  const who = await db.from("profiles").select("id").eq("id", id.value).limit(1);
  if (who.error) return dbFail(who.error);
  if (!((who.data as { id: string }[] | null) ?? []).length) return fail("회원을 찾지 못했어요.", 404);

  const [books, voices, ledger, grants] = await Promise.all([
    db
      .from("books")
      .select("id,title,hidden,created_at")
      .eq("owner", id.value)
      .not("id", "like", DEV_BOOK_LIKE)
      .order("created_at", { ascending: false })
      .limit(BOOK_LIMIT + 1),
    db.from("voice_clones").select("role,status").eq("owner", id.value),
    // 장부는 칸 여섯 개만 읽을 수 있다(select('*') 는 칸 권한 오류).
    db
      .from("token_ledger")
      .select("id,owner,amount,reason,refunded_at,created_at")
      .eq("owner", id.value)
      .order("created_at", { ascending: false })
      .limit(LEDGER_LIMIT + 1),
    db
      .from("token_grants")
      .select("id,amount,reason,granted_by,tokens_after,created_at")
      .eq("owner", id.value)
      .order("created_at", { ascending: false })
      .limit(GRANT_LIMIT + 1),
  ]);

  const failed: MemberExtrasPart[] = [];
  const warn = (part: MemberExtrasPart, e: { code?: string | null; message?: string | null }) => {
    console.warn(`[admin/member] ${part} 읽기 오류`, e.code, e.message);
    failed.push(part);
  };

  /* 책 */
  type B = { id: string; title: string | null; hidden: boolean | null; created_at: string | null };
  const bookRows = books.error ? [] : ((books.data as B[] | null) ?? []);
  if (books.error) warn("books", books.error);
  const bookList: MemberBook[] = bookRows.slice(0, BOOK_LIMIT).map((b) => ({
    id: b.id,
    title: b.title?.trim() ? b.title.trim() : null,
    hidden: !!b.hidden,
    createdAt: b.created_at,
  }));

  /* 목소리 */
  const voiceRows = voices.error ? [] : ((voices.data as { role: string; status: string }[] | null) ?? []);
  if (voices.error) warn("voices", voices.error);

  /* 토큰 장부 + 되돌린 줄의 사유·처리자 */
  type L = { id: string; owner: string; amount: number | null; reason: string | null; refunded_at: string | null; created_at: string };
  const ledgerRows = ledger.error ? [] : ((ledger.data as L[] | null) ?? []).slice(0, LEDGER_LIMIT);
  if (ledger.error) warn("ledger", ledger.error);
  let info: Map<string, LedgerRefundInfo> | null = new Map();
  const refundedIds = ledgerRows.filter((l) => l.refunded_at).map((l) => l.id);
  if (refundedIds.length) {
    // 함수는 한 번에 200건까지 받는다 — 장부를 200줄까지만 읽으므로 한 번이면 된다.
    const r = await db.rpc("master_ledger_entries", { p_entries: refundedIds });
    if (r.error) {
      if (!isSchemaMissing(r.error)) console.warn("[admin/member] 환불 사유 읽기 오류", r.error.code, r.error.message);
      info = null;
    } else {
      type E = { id: string } & LedgerRefundInfo;
      for (const e of (r.data as E[] | null) ?? []) {
        info.set(e.id, { refunded_by: e.refunded_by, refunded_by_username: e.refunded_by_username, refund_note: e.refund_note });
      }
    }
  }

  /* 충전 기록 + 넣어 준 관리자 아이디 */
  type G = { id: string; amount: number; reason: string | null; granted_by: string | null; tokens_after: number | null; created_at: string };
  const grantRows = grants.error ? [] : ((grants.data as G[] | null) ?? []).slice(0, GRANT_LIMIT);
  if (grants.error) warn("grants", grants.error);
  const granters = await profilesFor(
    db,
    grantRows.map((g) => g.granted_by),
  );
  const grantList: GrantLine[] = grantRows.map((g) => ({
    id: g.id,
    amount: g.amount,
    reason: g.reason?.trim() ? g.reason.trim() : null,
    grantedBy: g.granted_by ? (granters.get(g.granted_by)?.username ?? null) : null,
    tokensAfter: g.tokens_after,
    createdAt: g.created_at,
  }));

  const body: MemberExtras = {
    books: bookList,
    voices: voiceRows.map((v) => ({ role: String(v.role ?? ""), status: String(v.status ?? "") })),
    readyVoices: readyVoiceRoles(voiceRows),
    ledger: toLedgerLines(ledgerRows, info),
    grants: grantList,
    truncated: {
      books: bookRows.length > BOOK_LIMIT,
      ledger: !ledger.error && ((ledger.data as unknown[] | null) ?? []).length > LEDGER_LIMIT,
      grants: !grants.error && ((grants.data as unknown[] | null) ?? []).length > GRANT_LIMIT,
    },
    failed,
  };
  return json(body);
});
