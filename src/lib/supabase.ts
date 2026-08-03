import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase 클라이언트 — 회원·토큰·책을 서버에 저장하기 위한 연결.
 *
 * .env.local에 아래 두 값이 있으면 활성화된다(없으면 null → 앱은 localStorage 베타로 동작):
 *   NEXT_PUBLIC_SUPABASE_URL       프로젝트 URL (Supabase → Project Settings → API)
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY  anon public key (같은 화면)
 *
 * 테이블·정책은 supabase-schema.sql 을 Supabase SQL Editor에 붙여 넣어 만든다.
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
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}
