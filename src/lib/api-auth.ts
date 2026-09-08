/**
 * 서버에서 "지금 부른 사람이 누구인가"를 확인한다.
 *
 * 왜 필요한가: API 경로들이 전부 인증 없이 열려 있었다. 그중 제일 위험한 것이
 * 부모 목소리였다 — /api/tts/voices 가 복제된 개인 목소리(uc_...) 목록을 그대로
 * 내주고, /api/tts 는 voiceId 를 받는 대로 합성했다. 즉 누구나 남의 아빠 목소리로
 * 아무 문장이나 만들 수 있었다. 돈 문제가 아니라 가족 목소리 도용이다.
 *
 * 어떻게 확인하나: 브라우저가 Authorization 헤더에 자기 로그인 토큰을 실어 보내면,
 * 그 토큰으로 Supabase 에 물어 진짜 회원인지 확인한다. 서비스 키(모든 걸 통과하는
 * 열쇠)는 쓰지 않는다 — 그 열쇠는 RLS 를 무시하므로 실수하면 남의 자료가 열린다.
 * 대신 **부른 사람의 토큰 그대로** 질의하므로, RLS 가 자기 것만 보이게 막아 준다.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** 부른 사람. 로그인 안 했으면 null 이다. */
export type Caller = {
  uid: string;
  /** 회원 아이디. 올린 그림을 사람이 폴더로 찾아볼 수 있어야 해서 함께 담는다. */
  username: string;
  isMaster: boolean;
  /** 이 사람의 권한 그대로 질의하는 클라이언트 — RLS 가 그대로 걸린다. */
  db: SupabaseClient;
};

/** Authorization: Bearer <토큰> 에서 토큰만 꺼낸다. */
function bearerOf(request: Request): string {
  const raw = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return m ? m[1].trim() : "";
}

/**
 * 부른 사람을 확인한다. 로그인 안 했거나 토큰이 상했으면 null.
 *
 * 서버 요청마다 새 클라이언트를 만든다 — 하나를 캐시해 두면 앞 요청의 토큰이
 * 다음 사람에게 붙어 남의 권한으로 질의하게 된다.
 */
export async function callerOf(request: Request): Promise<Caller | null> {
  if (!url || !anon) return null;
  const token = bearerOf(request);
  if (!token) return null;

  const db = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await db.auth.getUser(token);
  const uid = data?.user?.id;
  if (error || !uid) return null;

  const { data: profile } = await db
    .from("profiles")
    .select("username,is_master")
    .eq("id", uid)
    .maybeSingle();

  return {
    uid,
    username: String((profile as { username?: string } | null)?.username ?? ""),
    isMaster: Boolean(profile?.is_master),
    db,
  };
}

/** 복제된 개인 목소리인가 — Typecast 는 uc_ 로 시작하는 아이디를 준다. */
export function isClonedVoice(voiceId: string): boolean {
  return /^uc_/i.test(voiceId.trim());
}

/**
 * 이 복제 목소리가 부른 사람 것인가.
 *
 * 부른 사람의 토큰으로 묻기 때문에 RLS 가 자기 줄만 보여 준다 — 남의 것을 물으면
 * 그냥 '없음'이 나온다. 마스터는 정책상 전부 볼 수 있어 관리도 된다.
 */
export async function ownsVoice(caller: Caller, voiceId: string): Promise<boolean> {
  const { data } = await caller.db
    .from("voice_clones")
    .select("owner")
    .eq("provider_voice_id", voiceId)
    .maybeSingle();
  if (!data) return false;
  return caller.isMaster || data.owner === caller.uid;
}
