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

/* ── 만들기 횟수 — 계정당 목소리 1명, 만들기는 총 2회(처음 1 + 수정 1)만. ──
 * 삭제해도 횟수는 남는다(기회를 다시 주지 않음). 기기 저장 + Supabase(attempts) 중 큰 값. */
export const MAX_CLONE_ATTEMPTS = 2;
const LS_ATTEMPTS = "voice-storybook:parent-voice-attempts";
function localAttempts(): number {
  if (typeof window === "undefined") return 0;
  const n = Number(window.localStorage.getItem(LS_ATTEMPTS));
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function saveAttempts(n: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS_ATTEMPTS, String(n));
}

async function attemptsUsed(): Promise<number> {
  let used = localAttempts();
  try {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (sb && uid) {
      const { data } = await sb
        .from("voice_clones")
        .select("attempts")
        .eq("owner", uid)
        .maybeSingle();
      const a = Number((data as { attempts?: number } | null)?.attempts ?? 0);
      if (a > used) used = a;
    }
  } catch {
    /* 테이블 없음 등 — 기기 값만 사용 */
  }
  return used;
}

/** 남은 만들기 기회 (처음 포함 총 2회). 0이면 더는 만들 수 없다. */
export async function remainingCloneChances(): Promise<number> {
  return Math.max(0, MAX_CLONE_ATTEMPTS - (await attemptsUsed()));
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

/**
 * 녹음 오디오(webm 등)를 16-bit 모노 WAV로 변환한다 — Typecast 클로닝은 wav/mp3만 받는다.
 * 브라우저 MediaRecorder는 보통 webm/opus라 그대로는 거부돼서, 재생기(Web Audio)로 디코드 후 WAV로 굽는다.
 */
async function audioToWav(blob: Blob): Promise<Blob> {
  const arrayBuf = await blob.arrayBuffer();
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  try {
    const audio = await ctx.decodeAudioData(arrayBuf);
    return encodeWav(audio);
  } finally {
    void ctx.close();
  }
}

function encodeWav(buffer: AudioBuffer): Blob {
  const len = buffer.length;
  const sampleRate = buffer.sampleRate;
  const numCh = buffer.numberOfChannels;
  // 모노로 다운믹스 (클로닝엔 충분하고 파일이 작다).
  const mono = new Float32Array(len);
  for (let ch = 0; ch < numCh; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < len; i++) mono[i] += data[i] / numCh;
  }
  const dataSize = len * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  let off = 44;
  for (let i = 0; i < len; i++) {
    const s = Math.max(-1, Math.min(1, mono[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return new Blob([buf], { type: "audio/wav" });
}

/**
 * 녹음 오디오 → Typecast 퀵 클론 → (기기 + 가능하면 Supabase) 저장 → voice_id 반환.
 * 규칙: 계정당 목소리 1명, 만들기는 총 2회(처음 1 + 수정 1)만.
 */
export async function cloneParentVoice(role: string, name: string, audio: Blob): Promise<string> {
  // 만들기 기회 총 2회(처음 1 + 수정 1)를 '먼저' 검사한다 — 기회를 다 쓴 사람에게
  // "지우고 다시 만들라"는 잘못된 안내(지우면 영영 못 만듦)가 나가지 않게.
  const used = await attemptsUsed();
  if (used >= MAX_CLONE_ATTEMPTS) {
    throw new Error("목소리 만들기 기회(처음 1번 + 수정 1번)를 모두 사용했어요.");
  }
  // 계정당 1명 — 이미 만든 목소리가 있으면 먼저 지우고 다시 만들게 한다.
  const existing = await loadParentVoices();
  if (existing.length > 0) {
    throw new Error(
      `부모 목소리는 계정당 한 명만 만들 수 있어요. 기존 목소리를 지운 뒤 다시 만들어 주세요. (남은 만들기 기회 ${MAX_CLONE_ATTEMPTS - used}번)`,
    );
  }

  const wav = await audioToWav(audio); // Typecast는 wav/mp3만 받으므로 변환
  const form = new FormData();
  form.append("name", name);
  form.append("audio", wav, "voice.wav");
  const r = await fetch("/api/voice/clone", { method: "POST", body: form });
  if (!r.ok) {
    const d = (await r.json().catch(() => null)) as { error?: string } | null;
    throw new Error(d?.error ?? `복제 실패 (HTTP ${r.status})`);
  }
  const { voiceId } = (await r.json()) as { voiceId: string };

  // ① 기기에 항상 저장 — SQL 없이도 바로 테스트되게. 만들기 횟수도 함께 올린다.
  const local = loadLocal();
  local[role] = voiceId;
  saveLocal(local);
  saveAttempts(used + 1);

  // ② Supabase에도 저장 시도(테이블 있으면). 없거나 오프라인이면 무시 — 기기 저장으로 동작.
  try {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (sb && uid) {
      await sb.from("voice_clones").upsert(
        {
          owner: uid,
          role,
          provider: "typecast",
          provider_voice_id: voiceId,
          status: "ready",
          attempts: used + 1,
        },
        { onConflict: "owner" },
      );
    }
  } catch {
    /* voice_clones 테이블 없음 등 — 기기 저장으로도 충분히 동작한다 */
  }
  return voiceId;
}

/** 이 회원(이 기기)의 '준비된' 부모 목소리 목록. Supabase가 있으면 그 값이 정본. */
export async function loadParentVoices(): Promise<ParentVoice[]> {
  const local = loadLocal();
  const byRole: Record<string, string> = { ...local };
  try {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (sb && uid) {
      // status 필터 없이 읽는다 — '행이 없음'(동기화 안 됨)과 '삭제됨'을 구분해야 해서.
      const { data, error } = await sb
        .from("voice_clones")
        .select("role, provider_voice_id, status")
        .eq("owner", uid);
      if (!error && data) {
        if (data.length > 0) {
          // 계정(Supabase)이 정본 — 다른 기기에서 지웠으면 이 기기에서도 내린다.
          for (const k of Object.keys(byRole)) delete byRole[k];
          for (const row of data as { role: string; provider_voice_id: string | null; status: string }[]) {
            if (row.status === "ready" && row.provider_voice_id) byRole[row.role] = row.provider_voice_id;
          }
          saveLocal({ ...byRole });
        } else {
          // 테이블은 있는데 이 계정 행이 없다 — SQL 실행 '전'에 이 기기에서 만든 클론이다.
          // 자가복구: 기기 저장분을 계정에 올린다 → 다른 기기(PC 등)에서도 보이게 된다.
          const role = Object.keys(local).find((r) => local[r]);
          if (role) {
            await sb.from("voice_clones").upsert(
              {
                owner: uid,
                role,
                provider: "typecast",
                provider_voice_id: local[role],
                status: "ready",
                attempts: Math.max(1, localAttempts()),
              },
              { onConflict: "owner" },
            );
          }
        }
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
 * 부모가 본인 목소리를 삭제한다 — 기기·Supabase에서 지우고 Typecast 서버에서도 완전 제거.
 * (개인정보를 어디에도 남기지 않는다.) 단, 만들기 횟수(attempts)는 남겨 수정 기회는 안 돌려준다.
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

  // Typecast 서버에서 완전 삭제.
  if (voiceId) {
    await fetch("/api/voice/clone", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voiceId }),
    }).catch(() => {});
  }

  // 기기 저장에서 제거 (만들기 횟수는 남긴다 — 수정 기회는 안 돌아온다).
  delete local[role];
  saveLocal(local);

  // Supabase — 행을 지우지 않고 '삭제됨'으로 바꿔 attempts(만들기 횟수)를 보존한다.
  if (sb && uid) {
    try {
      await sb
        .from("voice_clones")
        .update({ provider_voice_id: null, status: "deleted" })
        .eq("owner", uid);
    } catch {
      /* 무시 */
    }
  }
}
