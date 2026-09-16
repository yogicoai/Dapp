/**
 * 베타 피드백 게시판 — 문제점·의견을 남기면 처음 한 번 보상 토큰을 드린다.
 *
 * 글 저장과 토큰 지급은 서버 함수(submit_feedback)가 한 번에 처리한다. 앱에서 따로
 * 하면 글만 써지고 토큰이 안 들어가거나, 토큰만 여러 번 받는 일이 생긴다.
 * 테이블·함수는 supabase-setup.sql 로 만든다.
 *
 * 보상이 몇 토큰인지는 여기에 적지 않는다 — 가격표(app_pricing.feedback_bonus_tokens)를
 * 관리실에서 사장님이 바꾸기 때문이다. 화면은 usePricing() 으로 읽고, 못 읽을 때 쓰는 값은
 * src/lib/pricing.ts 의 DEFAULT_PRICING 한 곳에만 둔다. 예전엔 여기에 100 이 박혀 있어서
 * 보상을 50 으로 내려도 게시판은 "100토큰을 드려요" 라고 약속했다 — 돈 약속이 거짓이 됐다.
 */
import { currentUid, getSupabase } from "@/lib/supabase";

/** 글 갈래 — 아무 말이나 적기보다 갈래가 있으면 훨씬 쉽게 쓴다. */
export const FEEDBACK_CATEGORIES = [
  { t: "오류 신고", e: "🐞" },
  { t: "이런 게 있으면 좋겠어요", e: "💡" },
  { t: "사용 후기", e: "💬" },
  { t: "기타", e: "✏️" },
] as const;

export type FeedbackPost = {
  id: string;
  owner: string;
  category: string;
  content: string;
  createdAt: string;
  /** 글쓴이 아이디. 프로필을 함께 못 읽으면 null. */
  username: string | null;
  /** 관리자가 단 답변 — 있으면 글 아래에 보여 준다(2026-09-16). */
  reply?: string | null;
  repliedAt?: string | null;
};

/** 게시판 글 목록 (최신 먼저). 로그인 회원이면 모두 볼 수 있다. */
export async function loadFeedback(limit = 50): Promise<FeedbackPost[]> {
  const sb = getSupabase();
  if (!sb) return [];
  /*
   * 답변 칸(reply·replied_at)을 함께 읽는다. 아직 SQL 을 안 붙인 DB 면 그 칸이 없어 42703 이 나므로,
   * 그때는 옛 칸만으로 한 번 더 읽는다 — 배포가 SQL 보다 먼저 나가도 게시판이 비지 않게.
   */
  const COLUMNS_NEW = "id,owner,category,content,created_at,reply,replied_at";
  const COLUMNS_OLD = "id,owner,category,content,created_at";
  const read = async (columns: string) =>
    sb.from("feedback").select(columns).order("created_at", { ascending: false }).limit(limit);
  let { data, error } = (await read(COLUMNS_NEW)) as { data: unknown; error: unknown };
  if (error) ({ data, error } = (await read(COLUMNS_OLD)) as { data: unknown; error: unknown });
  if (error || !data) return [];

  const rows = data as {
    id: string;
    owner: string;
    category: string;
    content: string;
    created_at: string;
    reply?: string | null;
    replied_at?: string | null;
  }[];

  // 글쓴이 아이디를 한 번에 붙인다(글마다 조회하면 느리다). 못 읽으면 이름 없이 보여준다.
  const owners = [...new Set(rows.map((r) => r.owner))];
  const nameById = new Map<string, string>();
  if (owners.length > 0) {
    const { data: profs } = await sb.from("profiles").select("id,username").in("id", owners);
    for (const p of (profs ?? []) as { id: string; username: string }[]) {
      nameById.set(p.id, p.username);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    owner: r.owner,
    category: r.category,
    content: r.content,
    createdAt: r.created_at,
    username: nameById.get(r.owner) ?? null,
    reply: r.reply ?? null,
    repliedAt: r.replied_at ?? null,
  }));
}

/** 이 계정이 이미 보상을 받았는지 — 화면에 "첫 쪽지 보상!" 안내를 띄울지 정할 때 쓴다. */
export async function feedbackRewardTaken(): Promise<boolean> {
  const sb = getSupabase();
  const uid = await currentUid();
  if (!sb || !uid) return true;
  const { data, error } = await sb
    .from("profiles")
    .select("feedback_reward_at")
    .eq("id", uid)
    .maybeSingle();
  if (error) return true; // 컬럼이 아직 없으면(SQL 미실행) 보상 안내를 띄우지 않는다
  return Boolean((data as { feedback_reward_at?: string | null } | null)?.feedback_reward_at);
}

/**
 * 글 등록. 성공하면 받은 보상 토큰(처음이면 가격표의 보상, 아니면 0)과 남은 토큰을 돌려준다.
 * 서버 함수가 없으면(SQL 미실행) 무엇을 해야 하는지 알 수 있는 말로 바꿔 던진다.
 */
export async function submitFeedback(
  category: string,
  content: string,
): Promise<{ bonus: number; tokens: number }> {
  const sb = getSupabase();
  if (!sb) throw new Error("서버가 설정되지 않았어요.");
  const { data, error } = await sb.rpc("submit_feedback", {
    p_category: category,
    p_content: content,
  });
  if (error) {
    const m = error.message ?? "";
    if (/function .*submit_feedback|schema cache|does not exist/i.test(m)) {
      throw new Error("게시판이 아직 열리지 않았어요. 관리자에게 알려주세요.");
    }
    // 서버가 던진 안내문(10자 이상 등)은 그대로 보여준다.
    throw new Error(m.replace(/^.*?:\s*/, "") || "글을 올리지 못했어요.");
  }
  const d = (data ?? {}) as { bonus?: number; tokens?: number };
  return { bonus: Number(d.bonus ?? 0), tokens: Number(d.tokens ?? 0) };
}

/**
 * DB 가 보낸 까닭을 그대로 보여 줄지 정한다.
 *
 * 왜: supabase-setup.sql 의 feedback_guard 트리거는 "관리자 답변이 달린 글은 지울 수 없어요."
 * 처럼 **부모가 읽을 한국어로** 까닭을 42501 에 실어 보낸다(그러라고 만든 트리거다).
 * 그걸 "잠시 뒤 다시 시도해주세요" 로 덮으면 고객은 일시적 장애로 알고 계속 다시 누른다
 * — 영원히 실패하는 일인데도. 그래서 그 문구를 살린다.
 *
 * 다만 42501 이면서 한국어가 섞였을 때만 통과시킨다. "permission denied for table feedback"
 * 같은 날 DB 오류가 그대로 새면 부모는 더 모르게 되기 때문이다.
 */
function dbReason(error: { code?: string; message?: string | null }, fallback: string): string {
  const m = (error.message ?? "").replace(/^.*?:\s*/, "").trim();
  return error.code === "42501" && /[가-힣]/.test(m) ? m : fallback;
}

/**
 * 글 지우기 — 본인 글만. 권한은 서버(RLS)가 판단한다.
 *
 * 주의: 권한이 없으면 오류가 나는 게 아니라 '0줄 삭제'로 조용히 끝난다. 그걸 성공으로
 * 보면 화면에서만 글이 사라져 지운 것처럼 보인다(실제로는 남아 있다 — 실제 발생).
 * 그래서 지워진 줄을 돌려받아, 정말 지워졌을 때만 성공으로 친다.
 */
export async function deleteFeedback(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { data, error } = await sb.from("feedback").delete().eq("id", id).select("id");
  if (error) throw new Error(dbReason(error, "지우지 못했어요. 잠시 뒤 다시 시도해주세요."));
  if (!data || data.length === 0) throw new Error("이 글을 지울 권한이 없어요.");
}

/**
 * 글 고치기 — 본인 글만. 보상은 이미 준 것이라 다시 주지 않는다.
 * 삭제와 같은 이유로, 실제로 고쳐진 줄을 돌려받아 확인한다.
 */
export async function updateFeedback(
  id: string,
  category: string,
  content: string,
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const text = content.trim();
  if (text.length < 10) throw new Error("내용을 10자 이상 적어주세요.");
  const { data, error } = await sb
    .from("feedback")
    .update({ category, content: text.slice(0, 2000) })
    .eq("id", id)
    .select("id");
  if (error) throw new Error(dbReason(error, "고치지 못했어요. 잠시 뒤 다시 시도해주세요."));
  if (!data || data.length === 0) throw new Error("이 글을 고칠 권한이 없어요.");
}
