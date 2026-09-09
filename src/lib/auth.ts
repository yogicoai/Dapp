/**
 * 회원가입/로그인 — Supabase Auth 기반.
 *
 * "아이디"만 받되 Supabase는 이메일 로그인이라, 아이디를 `아이디@voice-storybook.local`
 * 가짜 이메일로 합성해 쓴다(그래서 Supabase Authentication에서 "Confirm email"을 꺼야 함).
 * 토큰·마스터 여부는 profiles 테이블에 있고, 가입 시 DB 트리거가 자동으로 프로필을 만든다.
 *
 * 게스트(비회원 둘러보기)는 서버 계정이 아니라 이 기기의 플래그다.
 */
import {
  backupChildBeforeLogout,
  clearChild,
  loadChildRemote,
  migrateDevicePrefs,
} from "@/lib/prefs";
import { currentUid, getSupabase, rememberUid } from "@/lib/supabase";

// 아이디를 이메일로 합성할 때 쓰는 도메인. Supabase가 .local 같은 비표준 TLD는
// "유효하지 않은 이메일"로 거부하므로, 형식상 유효한 .com을 쓴다(메일은 안 보냄).
const EMAIL_DOMAIN = "voice-storybook.com";
const GUEST_KEY = "voice-storybook:guest";

/**
 * 마스터(관리자) 아이디 — 트리거가 이 아이디들에 is_master=true를 준다.
 * supabase-setup.sql 의 handle_new_user 와 같은 목록이어야 한다.
 */
export const MASTER_IDS = ["yogico", "fe"] as const;
/** 대표 마스터 아이디 — 예전 코드가 쓰던 이름을 남겨 둔다. */
export const MASTER_ID = MASTER_IDS[0];

export type Profile = {
  id: string;
  username: string;
  tokens: number;
  is_master: boolean;
};

export type SessionState = {
  uid: string | null;
  profile: Profile | null;
  guest: boolean;
  isMaster: boolean;
};

function normId(id: string): string {
  return id.trim().toLowerCase();
}
function emailFor(id: string): string {
  return `${normId(id)}@${EMAIL_DOMAIN}`;
}

/** Supabase 오류 메시지를 사용자 말로. */
function friendly(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("already registered") || m.includes("already been registered")) return "이미 있는 아이디예요.";
  if (m.includes("invalid login")) return "아이디 또는 비밀번호가 틀렸어요.";
  if (m.includes("email") && m.includes("confirm")) return "이메일 확인 설정을 꺼주세요(관리자).";
  return msg;
}

export type AuthResult = { ok: true; profile: Profile } | { ok: false; error: string };

/** 현재 로그인 회원의 프로필을 서버에서 읽는다. 로그인 안 했으면 null. */
export async function fetchProfile(uid?: string | null): Promise<Profile | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const id = uid ?? (await currentUid());
  if (!id) return null;
  const { data } = await sb.from("profiles").select("id,username,tokens,is_master").eq("id", id).maybeSingle();
  return (data as Profile) ?? null;
}

/** 로그인/게스트 상태를 한 번에 읽는다 — 페이지 게이트에서 useEffect로 호출. */
export async function loadSession(): Promise<SessionState> {
  const guest = isGuest();
  const sb = getSupabase();
  if (!sb) return { uid: null, profile: null, guest, isMaster: false };
  const uid = await currentUid();
  if (!uid) return { uid: null, profile: null, guest, isMaster: false };
  // 계정별 설정으로 넘어가기 전 기기에 있던 설정을 이 계정에 한 번 물려준다(첫 로그인 1회).
  migrateDevicePrefs(uid);
  // uid를 넘겨 프로필 조회가 회원 확인을 또 하지 않게 한다(왕복 한 번 절약).
  const profile = await fetchProfile(uid);
  return { uid, profile, guest: false, isMaster: !!profile?.is_master };
}

export async function signUp(idRaw: string, password: string): Promise<AuthResult> {
  const id = normId(idRaw);
  if (id.length < 2 || id.length > 20 || /\s/.test(id)) {
    return { ok: false, error: "아이디는 공백 없이 2~20자로 적어주세요." };
  }
  if (password.length < 4) return { ok: false, error: "비밀번호는 4자 이상으로 적어주세요." };
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "서버(Supabase)가 설정되지 않았어요." };

  const { error } = await sb.auth.signUp({
    email: emailFor(id),
    password,
    options: { data: { username: id } },
  });
  if (error) return { ok: false, error: friendly(error.message) };
  clearGuest();
  clearChild(); // 새 계정은 이전 계정의 아이 정보가 남지 않게 비우고 시작
  // 트리거가 프로필을 만든다. 방금 만들어졌으니 살짝 기다렸다 읽어도 되지만, 대개 즉시 조회됨.
  const profile = await fetchProfile();
  if (!profile) return { ok: false, error: "가입은 됐는데 프로필을 못 읽었어요. 이메일 확인 설정을 꺼주세요." };
  return { ok: true, profile };
}

export async function logIn(idRaw: string, password: string): Promise<AuthResult> {
  const id = normId(idRaw);
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "서버(Supabase)가 설정되지 않았어요." };
  const { error } = await sb.auth.signInWithPassword({ email: emailFor(id), password });
  if (error) return { ok: false, error: friendly(error.message) };
  clearGuest();
  const profile = await fetchProfile();
  if (!profile) return { ok: false, error: "로그인은 됐는데 프로필을 못 읽었어요." };
  // 이 계정에 저장된 아이 정보를 서버에서 되살려 로컬 캐시에 채운다 — 로그아웃 때
  // 지워졌던 아이 이름·나이·성별이 재로그인하면 복구된다.
  await loadChildRemote().catch(() => {});
  return { ok: true, profile };
}

/* ── 구글 로그인 ──────────────────────────────────────────────────────────
 *
 * 왜 넣나: 지금은 아이디·비밀번호를 직접 쳐야 하고, 가짜 이메일을 쓰기 때문에
 * 비밀번호를 잃으면 되찾을 방법이 아예 없다. 구글로 들어오면 진짜 이메일이 생긴다.
 *
 * 안드로이드는 TWA(웹앱을 크롬으로 감싼 것)라 앱 안에서도 평범한 웹 로그인이 그대로
 * 된다. 구글이 막는 것은 앱에 박힌 웹뷰인데 TWA 는 크롬이라 해당되지 않는다.
 *
 * 켜는 법(사장님):
 *   ① 구글 클라우드 콘솔에서 OAuth 클라이언트(웹) 만들기
 *   ② Supabase → Authentication → Providers → Google 켜고 ID·시크릿 넣기
 *   ③ Supabase → Authentication → URL Configuration 에 앱 주소 넣기
 *   ④ .env.local 에 NEXT_PUBLIC_GOOGLE_LOGIN=1
 * ④ 를 넣기 전에는 로그인 화면에 단추가 안 나온다 — 설정 전에 눌러 실패하는 일이 없게.
 */
export function isGoogleLoginEnabled(): boolean {
  return process.env.NEXT_PUBLIC_GOOGLE_LOGIN === "1";
}

/**
 * 구글로 로그인 — 크롬으로 넘어갔다가 돌아온다.
 *
 * 돌아온 뒤 처리(게스트 해제·아이 정보 복구)는 여기서 못 한다. 화면이 통째로
 * 다시 뜨기 때문이다. 그래서 finishOAuthLogin 을 로그인 화면이 돌아왔을 때 부른다.
 */
export async function signInWithGoogle(): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "서버(Supabase)가 설정되지 않았어요." };
  const redirectTo =
    typeof window !== "undefined" ? `${window.location.origin}/login` : undefined;
  const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
  if (error) return { ok: false, error: friendly(error.message) };
  return { ok: true }; // 성공하면 이 줄 뒤로 화면이 크롬으로 넘어간다
}

/**
 * 구글에서 돌아온 뒤 마무리 — 아이디 로그인의 logIn 과 같은 뒷정리를 한다.
 * 로그인된 게 아니면 아무것도 하지 않는다(그냥 로그인 화면을 연 경우).
 */
export async function finishOAuthLogin(): Promise<AuthResult | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const uid = await currentUid();
  if (!uid) return null;
  clearGuest();
  const profile = await fetchProfile(uid);
  if (!profile) return { ok: false, error: "로그인은 됐는데 프로필을 못 읽었어요." };
  await loadChildRemote().catch(() => {});
  return { ok: true, profile };
}

export async function logOut(): Promise<void> {
  // 지우기 전에 현재 아이 정보를 계정 백업에 확실히 넣어둔다(재로그인 복구용).
  await backupChildBeforeLogout().catch(() => {});
  clearGuest();
  clearChild(); // '현재' 캐시만 지운다 — 계정별 백업은 남아 재로그인하면 복구된다.
  rememberUid(null); // 로그아웃 후 읽는 설정이 앞 계정 것으로 가지 않게
  await getSupabase()?.auth.signOut();
}

/** 비밀번호 변경 — 로그인한 본인. 4자 이상. */
export async function changePassword(newPw: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "서버가 설정되지 않았어요." };
  if (newPw.length < 4) return { ok: false, error: "비밀번호는 4자 이상으로 적어주세요." };
  const { error } = await sb.auth.updateUser({ password: newPw });
  if (error) return { ok: false, error: friendly(error.message) };
  return { ok: true };
}

/* ── 토큰 ─────────────────────────────────────────────────────────────────
 *
 * 토큰은 DB 가 지킨다. 예전엔 브라우저가 profiles 를 직접 update 해서 깎았는데,
 * RLS 정책이 "내 줄인가"만 보고 어느 칸인지는 안 봤다. 그래서 로그인한 사람이
 * 콘솔에서 한 줄이면 끝이었다 — update({ tokens: 999999 }).
 * is_master 도 같은 방법으로 켤 수 있었다.
 *
 * 이제 supabase-setup.sql 의 함수로만 바뀐다(spend_tokens · refund_tokens ·
 * grant_tokens). 그 SQL 을 아직 안 돌렸으면 함수가 없으므로, 옛 방식으로 물러선다 —
 * SQL 을 돌리기 전에 배포해도 앱이 멈추지 않게.
 */

/** 함수가 아직 DB 에 없다(= SQL 을 안 돌렸다). 그러면 옛 방식으로 물러선다. */
function rpcMissing(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const m = (error.message ?? "").toLowerCase();
  return error.code === "42883" || m.includes("could not find the function") || m.includes("does not exist");
}

/** 토큰을 쓴 기록. 실패해서 되돌릴 때 이 값을 넘긴다. 마스터는 null(면제). */
export type SpendEntry = string | null;

/**
 * 토큰 차감 — 잔액이 충분하면 깎고 장부 id 를, 모자라면 null 을 준다.
 *
 * 마스터는 토큰을 쓰지 않는다. 콘텐츠를 만들고 점검하는 계정이라 잔액이 떨어져
 * 확인이 막히면 안 된다. 토큰을 쓰는 자리가 전부 이 함수를 지나므로 한 곳에서 면제한다.
 */
export async function spendTokensEntry(
  n: number,
  reason = "",
): Promise<{ ok: true; entry: SpendEntry } | { ok: false; error: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "서버(Supabase)가 설정되지 않았어요." };

  const { data, error } = await sb.rpc("spend_tokens", { p_amount: n, p_reason: reason });
  if (!error) return { ok: true, entry: (data as string | null) ?? null };

  if (!rpcMissing(error)) {
    // 잔액 부족·권한 없음 등 진짜 거절.
    return { ok: false, error: friendly(error.message) };
  }

  // ── 물러서기: supabase-setup.sql 을 아직 안 돌린 DB
  const profile = await fetchProfile();
  if (!profile) return { ok: false, error: "회원 정보를 찾을 수 없어요." };
  if (profile.is_master) return { ok: true, entry: null };
  if (profile.tokens < n) return { ok: false, error: "토큰이 부족해요." };
  const { error: upErr } = await sb
    .from("profiles")
    .update({ tokens: profile.tokens - n })
    .eq("id", profile.id);
  return upErr ? { ok: false, error: friendly(upErr.message) } : { ok: true, entry: null };
}

/** 예전 이름 — 성공 여부만 필요한 자리에서 그대로 쓴다. */
export async function spendTokens(n: number, reason = ""): Promise<boolean> {
  return (await spendTokensEntry(n, reason)).ok;
}

/**
 * 쓴 토큰을 되돌린다 — 실패했을 때만.
 *
 * 장부 id 로만 되돌린다. 그래야 "환불"을 반복해 토큰을 찍어내는 길이 없다.
 * entry 가 null 이면(마스터거나 옛 DB) 되돌릴 것도 없다.
 */
export async function refundTokens(entry: SpendEntry, fallbackAmount = 0): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  if (entry) {
    const { error } = await sb.rpc("refund_tokens", { p_entry: entry });
    if (!error || !rpcMissing(error)) return;
  }
  if (!fallbackAmount) return;
  // 물러서기: 옛 DB 에서는 장부가 없으므로 예전처럼 되돌린다.
  const profile = await fetchProfile();
  if (!profile) return;
  await sb.from("profiles").update({ tokens: profile.tokens + fallbackAmount }).eq("id", profile.id);
}

/**
 * 토큰 충전 — 마스터만.
 *
 * 예전엔 누구나 자기 토큰을 늘릴 수 있었다(베타 충전 단추). 결제가 붙기 전까지는
 * 마스터가 넣어 주는 방식으로 둔다. 대상은 회원 uuid.
 */
export async function grantTokens(userId: string, n: number): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const { error } = await sb.rpc("grant_tokens", { p_user: userId, p_amount: n });
  if (!error) return true;
  if (!rpcMissing(error)) return false;
  // 물러서기: 옛 DB
  const { data } = await sb.from("profiles").select("tokens").eq("id", userId).maybeSingle();
  const cur = (data as { tokens?: number } | null)?.tokens;
  if (typeof cur !== "number") return false;
  const { error: upErr } = await sb.from("profiles").update({ tokens: cur + n }).eq("id", userId);
  return !upErr;
}

/**
 * 전체 회원 목록 (마스터만 RLS로 허용). 마스터 계정들은 뺀다.
 *
 * 거르기는 받아 놓고 여기서 한다 — 질의로 빼면 아이디 목록을 문자열로 엮어야 하고,
 * 문법이 조금만 틀려도 오류 대신 빈 목록이 와서 "회원이 없다"로 보인다.
 */
export async function loadAllUsers(): Promise<Profile[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb.from("profiles").select("id,username,tokens,is_master");
  const masters: readonly string[] = MASTER_IDS;
  return ((data as Profile[]) ?? []).filter((p) => !masters.includes(p.username));
}

/* ── 게스트(비회원) — 서버 계정이 아니라 이 기기 플래그 ── */
export function enterGuest(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GUEST_KEY, "1");
}
export function clearGuest(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(GUEST_KEY);
}
export function isGuest(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(GUEST_KEY) === "1";
}
