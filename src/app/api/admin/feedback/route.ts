import { isUuid } from "@/lib/admin";
import { dbFail, fail, json, masterOnly, readBody } from "../_guard";

/**
 * 의견 게시판 — 고객이 남긴 글을 관리실에서 보고, 답하고, 처리 끝으로 표시한다.
 *
 * GET  ?open=1        → 아직 처리 안 한 글만
 * POST { id, reply?, note?, handled? } → 답변·내부 메모·처리 표시
 *
 * 답변은 **고객 게시판에 그대로 보인다**. 내부 메모(note)는 고객에게 안 보인다(칸 권한으로 가린다).
 * 다른 마스터가 쓴 글은 목록에 오지 않는다 — DB 의 master_can_see 가 거른다.
 */

export type AdminFeedbackRow = {
  id: string;
  owner: string;
  username: string | null;
  category: string;
  content: string;
  created_at: string;
  reply: string | null;
  replied_at: string | null;
  replied_by_username: string | null;
  handled_at: string | null;
  master_note: string | null;
  /** 글쓴이의 지금 잔액·책 수 — 답하기 전에 상황을 같이 보려고 함께 준다. */
  tokens: number | null;
  books: number | null;
  /** 이 사람이 남긴 글 중 아직 처리 안 한 수. */
  open_count: number | null;
};

export type AdminFeedbackResponse = {
  posts: AdminFeedbackRow[];
  openCount: number;
  me: string;
};

export const GET = masterOnly(async (caller, request) => {
  const onlyOpen = new URL(request.url).searchParams.get("open") === "1";
  const { data, error } = await caller.db.rpc("master_feedback_list", {
    p_only_open: onlyOpen,
    p_limit: 200,
  });
  if (error) return dbFail(error);
  const posts = ((data as AdminFeedbackRow[] | null) ?? []).slice(0, 200);
  const body: AdminFeedbackResponse = {
    posts,
    openCount: posts.filter((p) => !p.handled_at).length,
    me: caller.username,
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
