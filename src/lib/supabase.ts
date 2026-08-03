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
