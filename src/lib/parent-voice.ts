/**
 * 부모 목소리 — 녹음 오디오를 복제(ElevenLabs)하고, 계정별로 voice_id를 저장/삭제한다.
 * "회원마다 자기 엄마·아빠 목소리를 계속 저장해두고, 동화 읽을 때 그 목소리로 읽어준다"는
 * 핵심 기능의 관리 계층. (복제 자체는 /api/voice/clone, 낭독은 voices.ts의 fetchElevenAudio)
 *
 * 저장은 2단: ① 이 기기(localStorage) — 키만 넣으면 바로 테스트되게. ② Supabase(voice_clones)
 * — 여러 기기·재설치에도 남는 '정식' 저장(테이블 SQL을 돌리면 자동 사용, 없으면 로컬만).
 */
import { getSupabase } from "@/lib/supabase";

export type ParentVoice = {
  role: string; // 'mom' | 'dad'
  label: string; // '엄마' | '아빠'
  emoji: string;
  voiceId: string; // 복제된 ElevenLabs voice_id
};

const ROLE_META: Record<string, { label: string; emoji: string }> = {
  mom: { label: "엄마", emoji: "👩" },
  dad: { label: "아빠", emoji: "👨" },
};

export function roleFromLabel(label: string): "mom" | "dad" {
  return label === "아빠" ? "dad" : "mom";
}
export function metaForRole(role: string): { label: string; emoji: string } {
  return ROLE_META[role] ?? { label: role, emoji: "🎙️" };
}

/* ── 이 기기 저장(localStorage) — role → voice_id ── */
const LS_KEY = "voice-storybook:parent-voices";
function loadLocal(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(LS_KEY) || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}
function saveLocal(map: Record<string, string>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS_KEY, JSON.stringify(map));
}

async function currentUserId(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data } = await sb.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

/** 녹음 오디오 → ElevenLabs 복제 → (기기 + 가능하면 Supabase) 저장 → voice_id 반환. */
export async function cloneParentVoice(role: string, name: string, audio: Blob): Promise<string> {
  const form = new FormData();
  form.append("name", name);
  form.append("audio", audio, "voice.webm");
  const r = await fetch("/api/voice/clone", { method: "POST", body: form });
  if (!r.ok) {
    const d = (await r.json().catch(() => null)) as { error?: string } | null;
    throw new Error(d?.error ?? `복제 실패 (HTTP ${r.status})`);
  }
  const { voiceId } = (await r.json()) as { voiceId: string };

  // ① 기기에 항상 저장 — SQL 없이도 바로 테스트되게.
  const local = loadLocal();
  local[role] = voiceId;
  saveLocal(local);

  // ② Supabase에도 저장 시도(테이블 있으면). 없거나 오프라인이면 무시 — 기기 저장으로 동작.
  try {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (sb && uid) {
      await sb.from("voice_clones").upsert(
        { owner: uid, role, provider: "elevenlabs", provider_voice_id: voiceId, status: "ready" },
        { onConflict: "owner,role" },
      );
    }
  } catch {
    /* voice_clones 테이블 없음 등 — 기기 저장으로도 충분히 동작한다 */
  }
  return voiceId;
}

/** 이 회원(이 기기)의 '준비된' 부모 목소리 목록. Supabase가 있으면 그 값이 우선. */
export async function loadParentVoices(): Promise<ParentVoice[]> {
  const byRole: Record<string, string> = { ...loadLocal() };
  try {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (sb && uid) {
      const { data } = await sb
        .from("voice_clones")
        .select("role, provider_voice_id, status")
        .eq("owner", uid)
        .eq("status", "ready");
      for (const row of (data ?? []) as { role: string; provider_voice_id: string }[]) {
        if (row.provider_voice_id) byRole[row.role] = row.provider_voice_id;
      }
    }
  } catch {
    /* 무시 — 기기 저장만으로 동작 */
  }
  return Object.entries(byRole)
    .filter(([, voiceId]) => Boolean(voiceId))
    .map(([role, voiceId]) => ({ role, voiceId, ...metaForRole(role) }));
}

/**
 * 부모가 본인 목소리를 삭제한다 — 기기·Supabase에서 지우고 ElevenLabs 서버에서도 완전 제거.
 * (개인정보를 어디에도 남기지 않는다.)
 */
export async function deleteParentVoice(role: string): Promise<void> {
  const local = loadLocal();
  let voiceId = local[role];

  // Supabase에 있으면 그 voice_id도 확인해 함께 지운다.
  const sb = getSupabase();
  const uid = await currentUserId();
  if (sb && uid) {
    try {
      const { data } = await sb
        .from("voice_clones")
        .select("provider_voice_id")
        .eq("owner", uid)
        .eq("role", role)
        .maybeSingle();
      voiceId = (data as { provider_voice_id?: string } | null)?.provider_voice_id ?? voiceId;
    } catch {
      /* 무시 */
    }
  }

  // ElevenLabs 서버에서 완전 삭제.
  if (voiceId) {
    await fetch("/api/voice/clone", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voiceId }),
    }).catch(() => {});
  }

  // 기기 저장에서 제거.
  delete local[role];
  saveLocal(local);

  // Supabase에서 제거.
  if (sb && uid) {
    try {
      await sb.from("voice_clones").delete().eq("owner", uid).eq("role", role);
    } catch {
      /* 무시 */
    }
  }
}
