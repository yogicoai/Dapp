/**
 * 화면에서 '지금 로그인한 사람이 개발자 모드(fe)인가'를 묻는다 — lib/dev-mode 참고.
 * 회원 아이디(profiles.username)를 한 번 읽어 로그인 id 별로 기억한다(계정을 바꾸면 다시 읽는다).
 * 화면 쪽 가림은 편의일 뿐이고, 진짜로 막는 것은 서버(callerOf 의 username 확인)다.
 */
import { isDevUser } from "./dev-mode";
import { currentUid, getSupabase } from "./supabase";

let cache: { uid: string; dev: boolean } | null = null;

export async function loadDevMode(): Promise<boolean> {
  const uid = await currentUid();
  if (!uid) return false;
  if (cache?.uid === uid) return cache.dev;
  const sb = getSupabase();
  if (!sb) return false;
  try {
    const { data, error } = await sb.from("profiles").select("username").eq("id", uid).maybeSingle();
    if (error) return false;
    const dev = isDevUser((data as { username?: string } | null)?.username);
    cache = { uid, dev };
    return dev;
  } catch {
    return false;
  }
}
