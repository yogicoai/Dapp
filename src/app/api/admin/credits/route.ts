import { isSchemaMissing, parseAdminId } from "@/lib/admin-console";
import {
  CREDIT_KINDS,
  CREDIT_RPC,
  creditsFromRow,
  parseCreditGrantBody,
  type CreditBalance,
  type CreditKind,
  type MemberCreditsResponse,
} from "@/lib/member-credits";
import { bodyTooLarge, dbFail, fail, json, masterOnly, readBody } from "../_guard";

/**
 * 관리실 '보상 크레딧' — 사고·문의를 풀 때 고객에게 무료 횟수를 더해 준다(사장님 2026-10-19). 동화 / 캐릭터 생성 두 가지.
 *
 * GET  ?id=<uuid> → MemberCreditsResponse — 가지마다 남은 수 · 더해 준 기록(최근 30줄)
 * POST { id, kind: "book" | "character", amount, note } → 1~10 더한다(사유 필수). 관리자 모두 — 토큰 충전과 같은 규칙.
 *      진짜 문지기는 DB 함수(master_grant_book_credits · master_grant_family_draws) — 다른 관리자 계정·없는 회원·틀린 값을 다시 막는다.
 *
 * 함수가 아직 없으면(SQL 전) 그 가지만 schemaReady:false — 화면이 '준비 전'을 알리고 그 가지의 더하기를 잠근다.
 */
export const GET = masterOnly(async (caller, request) => {
  const id = parseAdminId(new URL(request.url).searchParams.get("id"));
  if (!id.ok) return fail(id.error, 400);
  const results = await Promise.all(CREDIT_KINDS.map((k) => caller.db.rpc(CREDIT_RPC[k].read, { p_owner: id.value })));
  const body = {} as MemberCreditsResponse;
  for (const [i, kind] of CREDIT_KINDS.entries()) {
    const { data, error } = results[i];
    if (error) {
      if (!isSchemaMissing(error)) return dbFail(error);
      body[kind] = { schemaReady: false, freeLeft: 0, log: [] } satisfies CreditBalance;
      continue;
    }
    body[kind] = { schemaReady: true, ...creditsFromRow(data) };
  }
  return json(body);
});

/** SQL 파일 번호 — '준비 전' 알림이 어느 파일을 돌리라고 말할지 */
const SQL_FILE: Readonly<Record<CreditKind, string>> = {
  book: "11번 SQL(동화 크레딧)",
  character: "10번 SQL(캐릭터 무료 생성 횟수)",
};

export const POST = masterOnly(async (caller, request) => {
  if (bodyTooLarge(request, 10_000)) return fail("요청이 너무 커요.", 413);
  const body = await readBody(request);
  if (!body) return fail("요청 본문이 JSON 객체가 아니에요.", 400);
  const parsed = parseCreditGrantBody(body);
  if (!parsed.ok) return fail(parsed.error, 400);

  const { id, kind, amount, note } = parsed.value;
  const { data, error } = await caller.db.rpc(CREDIT_RPC[kind].grant, { p_owner: id, p_amount: amount, p_note: note });
  if (error) {
    if (isSchemaMissing(error)) {
      return fail(`데이터베이스 준비 전이에요 — ${SQL_FILE[kind]}을 먼저 돌려 주세요.`, 503, { code: error.code });
    }
    return dbFail(error);
  }
  const left = Number((data as { free_left?: unknown } | null)?.free_left);
  return json({ ok: true, kind, freeLeft: Number.isInteger(left) ? left : null });
});
