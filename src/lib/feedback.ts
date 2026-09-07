/**
 * 베타 피드백 게시판 — 문제점·의견을 남기면 처음 한 번 100토큰을 드린다.
 *
 * 글 저장과 토큰 지급은 서버 함수(submit_feedback)가 한 번에 처리한다. 앱에서 따로
 * 하면 글만 써지고 토큰이 안 들어가거나, 토큰만 여러 번 받는 일이 생긴다.
 * 테이블·함수는 supabase-setup.sql 로 만든다.
 */
import { currentUid, getSupabase } from "@/lib/supabase";

export const FEEDBACK_BONUS = 100;

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
};

/** 게시판 글 목록 (최신 먼저). 로그인 회원이면 모두 볼 수 있다. */
export async function loadFeedback(limit = 50): Promise<FeedbackPost[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("feedback")
    .select("id,owner,category,content,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];

  const rows = data as {
    id: string;
    owner: string;
    category: string;
    content: string;
    created_at: string;
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
  }));
}

/** 이 계정이 이미 보상을 받았는지 — 화면에 "이번 글은 100토큰!"을 띄울지 정할 때 쓴다. */
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
 * 글 등록. 성공하면 받은 보상 토큰(처음이면 100, 아니면 0)과 남은 토큰을 돌려준다.
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
 * 글 지우기 — 본인 글이거나 관리자만. 권한은 서버(RLS)가 판단한다.
 *
 * 주의: 권한이 없으면 오류가 나는 게 아니라 '0줄 삭제'로 조용히 끝난다. 그걸 성공으로
 * 보면 화면에서만 글이 사라져 지운 것처럼 보인다(실제로는 남아 있다 — 실제 발생).
 * 그래서 지워진 줄을 돌려받아, 정말 지워졌을 때만 성공으로 친다.
 */
export async function deleteFeedback(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { data, error } = await sb.from("feedback").delete().eq("id", id).select("id");
  if (error) throw new Error("지우지 못했어요. 잠시 뒤 다시 시도해주세요.");
  if (!data || data.length === 0) throw new Error("이 글을 지울 권한이 없어요.");
}

/**
 * 글 고치기 — 본인 글이거나 관리자만. 보상은 이미 준 것이라 다시 주지 않는다.
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
  if (error) throw new Error("고치지 못했어요. 잠시 뒤 다시 시도해주세요.");
  if (!data || data.length === 0) throw new Error("이 글을 고칠 권한이 없어요.");
}
