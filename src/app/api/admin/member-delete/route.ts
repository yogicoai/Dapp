import { isSchemaMissing, parseAdminId } from "@/lib/admin-console";
import { dbFail, fail, json, masterOnly, readBody } from "../_guard";

/**
 * POST /api/admin/member-delete { id, username, note } — 관리실 [회원 지우기](탈퇴 처리, 2026-10-02 사장님 지시).
 *
 * 계정을 바로 지운다(되돌릴 수 없다). 프로필·동화·토큰 장부·목소리·가족 그림 기록이 함께 지워지고(on delete cascade),
 * 결제·환불 기록은 주인 칸만 비고 남는다(전자상거래법 5년). cafe24 그림 파일은 남는다.
 * 지우는 일은 DB 함수(master_delete_member)가 한다 — 관리자인가 · 내 계정·다른 관리자 계정이 아닌가 · 아이디를 그대로
 * 따라 적었나 · 사유가 있나를 다시 보고, 누가·언제·왜를 member_deletions 에 남긴 뒤 지운다. 서비스 키는 쓰지 않는다.
 * 고객이 스스로 탈퇴하고 90일 보관 뒤 지우는 길(2026-09-14 결정)은 출시 때 따로 만든다.
 */
export const POST = masterOnly(async (caller, request) => {
  const body = await readBody(request);
  if (!body) return fail("요청 본문이 JSON 객체가 아니에요.", 400);
  const id = parseAdminId(body.id);
  if (!id.ok) return fail(id.error, 400);
  if (id.value === caller.uid) return fail("내 계정은 여기서 지울 수 없어요.", 403);
  const username = typeof body.username === "string" ? body.username.trim() : "";
  if (!username) return fail("지울 회원의 아이디를 그대로 적어 주세요.", 400);
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (note.length < 2) return fail("왜 지우는지 두 글자 이상 적어 주세요.", 400);
  if (note.length > 500) return fail("사유가 너무 길어요(500자까지).", 400);

  const { data, error } = await caller.db.rpc("master_delete_member", {
    p_owner: id.value,
    p_username: username,
    p_note: note,
  });
  if (error) {
    if (isSchemaMissing(error)) {
      return fail("데이터베이스 준비 전이에요 — supabase-offer-settings.sql 을 다시 한 번 돌려 주세요.", 503, { code: error.code });
    }
    return dbFail(error);
  }
  const r = (data ?? {}) as { username?: unknown; books?: unknown };
  return json({ ok: true, username: typeof r.username === "string" ? r.username : username, books: Number(r.books) || 0 });
});
