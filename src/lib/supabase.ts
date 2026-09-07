import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase 클라이언트 — 회원·토큰·책을 서버에 저장하기 위한 연결.
 *
 * .env.local에 아래 두 값이 있으면 활성화된다(없으면 null → 앱은 localStorage 베타로 동작):
 *   NEXT_PUBLIC_SUPABASE_URL       프로젝트 URL (Supabase → Project Settings → API)
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY  anon public key (같은 화면)
 *
 * 테이블·정책은 supabase-setup.sql 을 Supabase SQL Editor에 붙여 넣어 만든다.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anon);
}

let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!cached) cached = createClient(url as string, anon as string);
  return cached;
}

/**
 * 지금 로그인한 회원 id — 기기에 저장된 세션에서 바로 읽는다(네트워크 없음).
 *
 * auth.getUser()는 부를 때마다 서버로 토큰 검증을 보낸다. 데이터 함수마다 그걸
 * 부르다 보니 홈 화면 한 번 여는 데 왕복이 예닐곱 번 쌓여 "동화 불러오기가 느리다"는
 * 피드백(5번)으로 이어졌다. 질의를 만드는 데 필요한 건 id뿐이고, 진짜 권한 검사는
 * 어차피 서버가 모든 요청에서 RLS로 한다 — 그래서 로컬 세션으로 충분하다.
 * (토큰이 만료됐으면 supabase-js가 알아서 갱신한다.)
 *
 * auth.ts가 아니라 여기 두는 이유: prefs.ts와 auth.ts가 서로를 참조해서
 * 한쪽에 두면 순환 참조가 된다.
 */
export async function currentUid(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data } = await sb.auth.getSession();
    const uid = data.session?.user?.id ?? null;
    rememberUid(uid);
    return uid;
  } catch {
    return null;
  }
}

/* ── 계정별 설정 저장 ──
 * 아이 정보·나라·성우·글자 위치 같은 설정은 계정마다 따로 남아야 한다(사장님 지시).
 * 그런데 이 값들은 화면이 뜰 때 '동기적으로' 읽히고, 회원 id는 비동기로만 알 수 있다.
 * 그래서 마지막으로 확인한 id를 기기에 적어 두고, 동기 읽기는 그 값을 쓴다.
 * (로그인 상태는 기기에 남으므로 새로고침 시점엔 항상 값이 있다.)
 */
const UID_KEY = "voice-storybook:uid";

export function rememberUid(uid: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (uid) window.localStorage.setItem(UID_KEY, uid);
    else window.localStorage.removeItem(UID_KEY);
  } catch {
    /* 무시 */
  }
}

/** 마지막으로 확인한 회원 id (동기). 비회원·로그아웃 상태면 null. */
export function currentUidSync(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(UID_KEY);
  } catch {
    return null;
  }
}

/**
 * 설정 저장 키를 계정별로 나눈다. 로그인 상태면 `키:회원id`, 비회원이면 기기 공용 키.
 * 같은 기기에서 다른 아이디로 들어가도 앞 계정의 설정이 보이지 않는다.
 */
export function acctKey(base: string): string {
  const uid = currentUidSync();
  return uid ? `${base}:${uid}` : base;
}
