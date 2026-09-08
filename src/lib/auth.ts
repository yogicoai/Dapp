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

/** 토큰 차감 — 잔액이 충분하면 깎고 true, 부족/실패면 false. (베타: 조회 후 갱신) */
export async function spendTokens(n: number): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const profile = await fetchProfile();
  if (!profile) return false;
  /*
   * 마스터는 토큰을 쓰지 않는다.
   *
   * 콘텐츠를 만들고 점검하는 계정이라 잔액이 떨어져 확인이 막히면 안 된다.
   * 권수 상한은 이미 면제였는데 토큰은 아니어서, 결국 마스터도 잔액이 바닥나면
   * 더 만들 수 없었다 — 반쪽짜리 면제였다.
   *
   * 쓰는 쪽마다 조건을 다는 대신 여기 한 곳에서 막는다. 동화 만들기·부모 목소리
   * 등 토큰을 쓰는 자리가 전부 이 함수를 지나므로, 새 기능이 생겨도 자동으로 면제된다.
   */
  if (profile.is_master) return true;
  if (profile.tokens < n) return false;
  const { error } = await sb.from("profiles").update({ tokens: profile.tokens - n }).eq("id", profile.id);
  return !error;
}

/** 토큰 충전(베타). */
export async function addTokens(n: number): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const profile = await fetchProfile();
  if (!profile) return;
  await sb.from("profiles").update({ tokens: profile.tokens + n }).eq("id", profile.id);
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
