import { isUuid } from "@/lib/admin";
import { isMineFlag } from "@/lib/admin-console";
import {
  FEEDBACK_LIST_LIMIT,
  keepCustomerPosts,
  type AdminFeedbackResponse,
  type AdminFeedbackRow,
} from "@/lib/admin-support";
import { masterOwnerIds } from "../_data";
import { dbFail, fail, json, masterOnly, readBody } from "../_guard";

/**
 * 의견 게시판 — 고객이 남긴 글을 관리실에서 보고, 답하고, 처리 끝으로 표시한다.
 *
 * GET  ?open=1 &mine=1 → open: 아직 처리 안 한 글만 · mine: 관리자 계정 글도 함께('내 계정 것도 보기')
 * POST { id, reply?, note?, handled? } → 답변·내부 메모·처리 표시
 *
 * 답변은 **고객 게시판에 그대로 보인다**. 내부 메모(note)는 고객에게 안 보인다(칸 권한으로 가린다).
 * 다른 마스터가 쓴 글은 목록에 오지 않는다 — DB 의 master_can_see 가 거른다.
 * 관리자 계정으로 남긴 글(점검용 오류 신고 등)도 목록·남은 수에서 뺀다(사장님 2026-09-30).
 * 글 자체는 지우지 않는다 — 게시판에는 그대로 있고, mine=1 이면 여기서도 보인다.
 */

// 모양(type)은 순수 함수 파일에 두고 여기서 다시 내보낸다 — 예전에 이 경로에서 가져가던 곳이 그대로 되게.
export type { AdminFeedbackResponse, AdminFeedbackRow };

export const GET = masterOnly(async (caller, request) => {
  const sp = new URL(request.url).searchParams;
  const onlyOpen = sp.get("open") === "1";
  const mine = isMineFlag(sp);
  const [{ data, error }, masters] = await Promise.all([
    caller.db.rpc("master_feedback_list", { p_only_open: onlyOpen, p_limit: FEEDBACK_LIST_LIMIT }),
    // 스위치가 켜져 있으면 뺄 것이 없으니 관리자 계정을 찾지 않는다.
    mine ? Promise.resolve(new Set<string>()) : masterOwnerIds(caller),
  ]);
  if (error) return dbFail(error);
  const raw = ((data as AdminFeedbackRow[] | null) ?? []).slice(0, FEEDBACK_LIST_LIMIT);
  const { posts, openCount } = keepCustomerPosts(raw, masters, mine);
  const body: AdminFeedbackResponse = {
    posts,
    openCount,
    me: caller.username,
    // 상한에 닿았으면 더 오래된 글이 있을 수 있다 — 화면이 '최근 200건만 보여요'라고 말한다.
    truncated: raw.length >= FEEDBACK_LIST_LIMIT,
  };
  return json(body);
});

export const POST = masterOnly(async (caller, request) => {
  const body = await readBody(request);
  if (!body) return fail("요청 본문이 JSON 객체가 아니에요.", 400);
  if (!isUuid(body.id)) return fail("의견 id 모양이 아니에요.", 400);

  const reply = typeof body.reply === "string" ? body.reply.trim() : "";
  const note = typeof body.note === "string" ? body.note.trim() : "";
  const handled = typeof body.handled === "boolean" ? body.handled : null;
  if (reply.length > 2000) return fail("답변이 너무 길어요(2000자까지).", 400);
  if (note.length > 1000) return fail("메모가 너무 길어요(1000자까지).", 400);
  if (!reply && !note && handled === null) return fail("바꿀 내용이 없어요.", 400);

  const { error } = await caller.db.rpc("master_feedback_reply", {
    p_id: body.id,
    p_reply: reply || null,
    p_note: note || null,
    p_handled: handled,
  });
  if (error) return dbFail(error);
  return json({ ok: true });
});
