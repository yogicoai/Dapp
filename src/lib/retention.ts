/**
 * 회원 탈퇴 · 동화 삭제 — 90일 보관 뒤 완전히 지우기(사장님 2026-09-14 결정, 2026-10-19 만듦).
 *
 * DB 쪽은 supabase-withdrawal.sql 이 한다 — 동화를 지우면(어느 길로든) 보관함(data_retention)에 한 줄, 회원이 탈퇴하면
 * (withdraw_me) 프로필·만들기 기록·가족 그림 기록을 한 줄로 담고 계정을 지운다. 90일이 지나면 관리실 '탈퇴·삭제 보관함'의
 * [90일 지난 것 정리]가 cafe24 폴더를 지우고(api/admin/retention) 담아 둔 내용을 비운다.
 *
 * 이 파일은 순수 함수와 화면 문구만 둔다 — 브라우저·서버 모두 쓴다.
 */

/** 보관 기간(일) — supabase-withdrawal.sql 의 retention_interval() 과 같아야 한다 */
export const RETENTION_DAYS = 90;

/** 탈퇴 확인 칸에 그대로 적어야 하는 글자(withdraw_me 와 같다) */
export const WITHDRAW_CONFIRM_WORD = "탈퇴";

/** 탈퇴 사유는 이만큼까지 받는다(DB 도 500자에서 자른다) */
export const WITHDRAW_REASON_MAX = 500;

/** 탈퇴 사유 고르기 — 고르면 그 글이 사유 칸에 들어간다(직접 적어도 된다) */
export const WITHDRAW_REASONS: readonly string[] = [
  "아이가 더 이상 보지 않아요",
  "가격이 부담돼요",
  "원하는 기능이 없어요",
  "사용하기 어려워요",
  "다른 계정으로 쓸게요",
];

/** 탈퇴 안내 — 탈퇴 창·개인정보처리방침이 같은 말을 쓰게 한 곳에 둔다 */
export const WITHDRAW_NOTICE: readonly string[] = [
  "탈퇴하면 바로 로그인할 수 없고, 남은 토큰·크레딧과 요금제는 사라져요.",
  `만든 동화·그림·가족 캐릭터는 문의(다시 그리기·환불) 처리를 위해 ${RETENTION_DAYS}일 동안 보관한 뒤 완전히 지워요.`,
  "결제·환불 기록은 전자상거래법에 따라 정해진 기간 동안 따로 보관해요.",
  `같은 계정으로 다시 가입할 수 있지만 예전 동화는 돌아오지 않고, ${RETENTION_DAYS}일 안에 다시 가입하면 가입 선물 토큰은 드리지 않아요.`,
];

/** 동화 지우기 확인 문구 */
export function deleteBookConfirmText(title: string): string {
  return `"${title}"을(를) 삭제할까요?\n\n책장에서 바로 사라지고, 동화 내용과 그림은 ${RETENTION_DAYS}일 동안 보관한 뒤 완전히 지워져요. 직접 되돌릴 수는 없어요.`;
}

/** 사유 칸 다듬기 — 앞뒤 공백을 떼고 길이를 자른다. 비면 null */
export function cleanWithdrawReason(raw: unknown): string | null {
  const s = typeof raw === "string" ? raw.trim().slice(0, WITHDRAW_REASON_MAX) : "";
  return s || null;
}

/** 확인 칸에 '탈퇴'를 그대로 적었나(앞뒤 공백은 괜찮다) */
export function withdrawConfirmed(raw: unknown): boolean {
  return typeof raw === "string" && raw.trim() === WITHDRAW_CONFIRM_WORD;
}

/**
 * 정리할 때 cafe24 에서 지워도 되는 폴더인가 — 이 모양만 지운다(빈 값·기준 폴더·명작 그림 폴더를 지우는 사고 막이).
 *   books/<회원 폴더>/<책 폴더>   (api/upload-art 가 올리는 곳 — 두 칸 모두 소문자·숫자·_·- 만)
 *   family/<회원 id(uuid)>        (가족 그림 — api/family/portrait·outfit)
 */
export function isRetentionDir(dir: unknown): dir is string {
  if (typeof dir !== "string") return false;
  return /^books\/[a-z0-9_-]{1,40}\/[a-z0-9_-]{1,40}$/.test(dir) || /^family\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(dir);
}

/** 보관함 한 줄(관리실 목록) — master_retention_list 의 모양 */
export type RetentionRow = {
  id: number;
  kind: "book" | "member";
  member_id: string | null;
  member_username: string | null;
  book_id: string | null;
  title: string | null;
  reason: string | null;
  folders: number;
  created_at: string;
  purge_after: string;
  purged_at: string | null;
  purged_by_username: string | null;
};

/** 보관함 줄 상태 — 보관 중 / 정리할 때(90일 지남) / 정리함 */
export type RetentionState = "kept" | "due" | "purged";

export function retentionState(row: Pick<RetentionRow, "purge_after" | "purged_at">, now: Date): RetentionState {
  if (row.purged_at) return "purged";
  return new Date(row.purge_after).getTime() <= now.getTime() ? "due" : "kept";
}

/** 정리까지 남은 날(올림, 0 이하면 0) */
export function daysUntilPurge(purgeAfter: string, now: Date): number {
  const ms = new Date(purgeAfter).getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}
