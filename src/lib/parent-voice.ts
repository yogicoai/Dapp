/**
 * 부모 목소리 — 녹음 오디오를 복제(ElevenLabs)하고, 계정별로 voice_id를 저장/삭제한다.
 * "회원마다 자기 엄마·아빠 목소리를 계속 저장해두고, 동화 읽을 때 그 목소리로 읽어준다"는
 * 핵심 기능의 관리 계층. (복제 자체는 /api/voice/clone, 낭독은 voices.ts의 fetchElevenAudio)
 *
 * 저장은 2단: ① 이 기기(localStorage) — 키만 넣으면 바로 테스트되게. ② Supabase(voice_clones)
 * — 여러 기기·재설치에도 남는 '정식' 저장(테이블 SQL을 돌리면 자동 사용, 없으면 로컬만).
 */
import { currentUid, getSupabase } from "@/lib/supabase";

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

/* ── 이 기기 저장(localStorage) — 계정(uid)별로 분리: `키:uid` → { role → voice_id } ──
 * 같은 기기에서 다른 아이디(마스터 등)로 로그인해도 남의 목소리가 보이면 안 된다
 * (2026-07-31 버그 수정 — 이전엔 계정 구분 없이 기기 공용이라 새 계정에 그대로 노출됐다).
 * 옛(계정 구분 없는) 키는 소유자를 알 수 없어 이관하지 않고 지운다 — 정본은
 * Supabase(voice_clones)라 실제 클론은 계정 로그인만 하면 되살아난다. */
const LS_KEY = "voice-storybook:parent-voices";
const LS_ATTEMPTS = "voice-storybook:parent-voice-attempts";
function dropLegacyDeviceKeys(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LS_KEY);
  window.localStorage.removeItem(LS_ATTEMPTS);
}
function loadLocal(uid: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  dropLegacyDeviceKeys();
  try {
    return JSON.parse(window.localStorage.getItem(`${LS_KEY}:${uid}`) || "{}") as Record<
      string,
      string
    >;
  } catch {
    return {};
  }
}
function saveLocal(uid: string, map: Record<string, string>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`${LS_KEY}:${uid}`, JSON.stringify(map));
}

/* ── 만들기 횟수 — 엄마·아빠를 각각 하나씩, 역할마다 2회(처음 1 + 수정 1). ──
 * 2026-08-05 변경: 예전엔 계정당 '한 명'이라 횟수도 계정 단위로 셌다. 이제 엄마와
 * 아빠가 서로 독립이라 역할별로 센다(엄마를 고쳐도 아빠 기회는 그대로).
 * 삭제해도 횟수는 남는다 — 지웠다 다시 만들며 무한히 시도하는 걸 막는다. */
export const MAX_CLONE_ATTEMPTS = 2;
function localAttempts(uid: string, role: string): number {
  if (typeof window === "undefined") return 0;
  const n = Number(window.localStorage.getItem(`${LS_ATTEMPTS}:${uid}:${role}`));
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function saveAttempts(uid: string, role: string, n: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`${LS_ATTEMPTS}:${uid}:${role}`, String(n));
}

async function attemptsUsed(role: string): Promise<number> {
  const uid = await currentUserId();
  if (!uid) return 0; // 부모 목소리는 회원 전용 — 로그인 전엔 셈할 것도 없다
  let used = localAttempts(uid, role);
  try {
    const sb = getSupabase();
    if (sb) {
      const { data } = await sb
        .from("voice_clones")
        .select("attempts")
        .eq("owner", uid)
        .eq("role", role)
        .maybeSingle();
      const a = Number((data as { attempts?: number } | null)?.attempts ?? 0);
      if (a > used) used = a;
    }
  } catch {
    /* 테이블 없음 등 — 기기 값만 사용 */
  }
  return used;
}

/** 이 역할(엄마/아빠)의 남은 만들기 기회. 0이면 더는 만들 수 없다. */
export async function remainingCloneChances(role: string): Promise<number> {
  return Math.max(0, MAX_CLONE_ATTEMPTS - (await attemptsUsed(role)));
}

/** 로그인 회원 id — 로컬 세션에서 읽는다(서버 왕복 없음). @see supabase.currentUid */
async function currentUserId(): Promise<string | null> {
  return currentUid();
}

/* ── 녹음 다듬기 ──
 * 클론 품질은 '재료가 얼마나 깨끗한가'로 갈린다. 집에서 폰으로 녹음하면 늘
 * ①소리가 작고 ②앞뒤에 빈 시간이 붙고 ③중간에 긴 침묵이 들어가고 ④에어컨·냉장고
 * 웅웅거림이 깔린다. 그대로 보내면 그것까지 '그 사람 목소리'로 배운다.
 * 그래서 보내기 전에 아래를 손본다 — 비용 0, 전부 브라우저 안에서 끝난다.
 */

/** 저주파 웅웅거림(에어컨·냉장고·차 소리) 제거. 1차 하이패스, 약 80Hz. */
function highPass(x: Float32Array, sampleRate: number): Float32Array {
  const rc = 1 / (2 * Math.PI * 80);
  const dt = 1 / sampleRate;
  const a = rc / (rc + dt);
  const y = new Float32Array(x.length);
  for (let i = 1; i < x.length; i++) y[i] = a * (y[i - 1] + x[i] - x[i - 1]);
  return y;
}

/**
 * 앞뒤 침묵을 잘라내고, 중간의 긴 침묵은 짧게 줄인다.
 * 말이 없는 구간까지 학습하면 클론이 늘어지고 어색해진다.
 */
function trimSilence(x: Float32Array, sampleRate: number): Float32Array {
  const win = Math.max(1, Math.floor(sampleRate * 0.02)); // 20ms 단위로 본다
  const loud: boolean[] = [];
  for (let i = 0; i < x.length; i += win) {
    let s = 0;
    const end = Math.min(x.length, i + win);
    for (let j = i; j < end; j++) s += x[j] * x[j];
    loud.push(Math.sqrt(s / (end - i)) > 0.012);
  }
  let first = loud.indexOf(true);
  let last = loud.lastIndexOf(true);
  if (first < 0) return x; // 전부 조용하면 손대지 않는다(품질 검사가 따로 잡는다)
  // 말 앞뒤로 0.15초는 남긴다 — 딱 붙여 자르면 첫 소리가 잘려 들린다.
  const pad = Math.ceil(0.15 / 0.02);
  first = Math.max(0, first - pad);
  last = Math.min(loud.length - 1, last + pad);

  const maxGap = Math.ceil(0.8 / 0.02); // 0.8초 넘는 침묵은
  const keepGap = Math.ceil(0.3 / 0.02); // 0.3초로 줄인다
  const out: number[] = [];
  let gap = 0;
  for (let b = first; b <= last; b++) {
    if (!loud[b]) {
      gap++;
      if (gap > maxGap) continue; // 너무 긴 침묵은 통째로 건너뛴다
      if (gap > keepGap) continue;
    } else {
      gap = 0;
    }
    const s = b * win;
    const e = Math.min(x.length, s + win);
    for (let j = s; j < e; j++) out.push(x[j]);
  }
  return Float32Array.from(out);
}

/** 최대 크기를 0.9까지 끌어올린다. 작게 녹음된 목소리를 살리는 가장 큰 한 방. */
function normalize(x: Float32Array): Float32Array {
  let peak = 0;
  for (const s of x) {
    const a = Math.abs(s);
    if (a > peak) peak = a;
  }
  if (peak < 1e-4) return x;
  // 너무 작은 녹음을 무한정 키우면 잡음만 커진다 — 12배까지만.
  const gain = Math.min(0.9 / peak, 12);
  if (gain <= 1.01) return x;
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) y[i] = Math.max(-1, Math.min(1, x[i] * gain));
  return y;
}

/** AudioBuffer → 모노 Float32 (여러 채널이면 섞는다). */
function toMono(buffer: AudioBuffer): Float32Array {
  const len = buffer.length;
  const mono = new Float32Array(len);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < len; i++) mono[i] += data[i] / buffer.numberOfChannels;
  }
  return mono;
}

/**
 * 녹음 하나 이상을 클로닝용 16-bit 모노 WAV로 굽는다 — Typecast는 wav/mp3만 받는다.
 * 여러 개를 주면 이어 붙인다(같은 문장을 두 번 읽으면 재료가 두 배가 되어 더 닮는다).
 * 각 녹음은 하이패스 → 침묵 정리를 거치고, 마지막에 전체를 한 번 정규화한다.
 */
export async function prepareVoiceWav(blobs: Blob[]): Promise<Blob> {
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  try {
    const pieces: Float32Array[] = [];
    let sampleRate = 44100;
    for (const b of blobs) {
      const audio = await ctx.decodeAudioData(await b.arrayBuffer());
      sampleRate = audio.sampleRate;
      pieces.push(trimSilence(highPass(toMono(audio), sampleRate), sampleRate));
    }
    // 사이에 0.4초 숨 쉴 틈 — 두 번 읽은 게 한 문장처럼 붙어 들리지 않게.
    const gap = Math.floor(sampleRate * 0.4);
    const total = pieces.reduce((n, p) => n + p.length, 0) + gap * Math.max(0, pieces.length - 1);
    const merged = new Float32Array(total);
    let at = 0;
    pieces.forEach((p, i) => {
      merged.set(p, at);
      at += p.length + (i < pieces.length - 1 ? gap : 0);
    });
    return encodeWav(normalize(merged), sampleRate);
  } finally {
    void ctx.close();
  }
}

/** 녹음 하나를 클로닝용 WAV로. (여러 개는 prepareVoiceWav를 쓴다) */
async function audioToWav(blob: Blob): Promise<Blob> {
  return prepareVoiceWav([blob]);
}

function encodeWav(mono: Float32Array, sampleRate: number): Blob {
  const len = mono.length;
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
 *
 * 규칙(2026-08-05): 엄마와 아빠를 **각각** 하나씩 만들 수 있다. 역할마다 2회
 * (처음 1 + 수정 1)이고, 만들 때마다 15토큰이 나간다(엄마·아빠 따로 냄).
 * 엄마를 고쳐도 아빠 기회는 줄지 않는다 — 둘은 서로 독립이다.
 */
export async function cloneParentVoice(role: string, name: string, audio: Blob): Promise<string> {
  const uid = await currentUserId();
  if (!uid) throw new Error("로그인한 계정에서만 목소리를 만들 수 있어요.");
  const label = metaForRole(role).label;
  // 이 역할의 만들기 기회를 '먼저' 검사한다 — 기회를 다 쓴 사람에게 "지우고 다시
  // 만들라"는 잘못된 안내(지우면 영영 못 만듦)가 나가지 않게.
  const used = await attemptsUsed(role);
  if (used >= MAX_CLONE_ATTEMPTS) {
    throw new Error(`${label} 목소리 만들기 기회(처음 1번 + 수정 1번)를 모두 사용했어요.`);
  }
  // 같은 역할의 목소리가 이미 있으면 먼저 지우고 다시 만들게 한다(수정 = 지우고 새로).
  const existing = await loadParentVoices();
  if (existing.some((p) => p.role === role)) {
    throw new Error(
      `${label} 목소리가 이미 있어요. 지운 뒤 다시 만들어 주세요. (남은 ${label} 만들기 기회 ${MAX_CLONE_ATTEMPTS - used}번)`,
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

  // ① 기기에 항상 저장(계정별 키) — SQL 없이도 바로 테스트되게. 만들기 횟수도 함께 올린다.
  const local = loadLocal(uid);
  local[role] = voiceId;
  saveLocal(uid, local);
  saveAttempts(uid, role, used + 1);

  // ② Supabase에도 저장 시도(테이블 있으면). 없거나 오프라인이면 무시 — 기기 저장으로 동작.
  try {
    const sb = getSupabase();
    if (sb) {
      await sb.from("voice_clones").upsert(
        {
          owner: uid,
          role,
          provider: "typecast",
          provider_voice_id: voiceId,
          status: "ready",
          attempts: used + 1,
        },
        // 역할별로 한 줄이라 (owner, role)이 충돌 기준이다 — 엄마 줄이 아빠 줄을 덮지 않게.
        { onConflict: "owner,role" },
      );
    }
  } catch {
    /* voice_clones 테이블 없음 등 — 기기 저장으로도 충분히 동작한다 */
  }
  return voiceId;
}

/** 이 회원의 '준비된' 부모 목소리 목록 — 로그인한 계정 것만. Supabase가 있으면 그 값이 정본. */
export async function loadParentVoices(): Promise<ParentVoice[]> {
  const uid = await currentUserId();
  if (!uid) return []; // 회원 전용 — 게스트/로그아웃 상태에선 아무것도 안 보인다
  const local = loadLocal(uid);
  const byRole: Record<string, string> = { ...local };
  try {
    const sb = getSupabase();
    if (sb) {
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
          saveLocal(uid, { ...byRole });
        } else {
          // 테이블은 있는데 이 계정 행이 없다 — SQL 실행 '전'에 이 기기에서 만든 클론이다.
          // 자가복구: 기기 저장분을 계정에 올린다 → 다른 기기(PC 등)에서도 보이게 된다.
          // 엄마·아빠가 둘 다 있을 수 있으므로 역할마다 올린다.
          for (const role of Object.keys(local)) {
            if (!local[role]) continue;
            await sb.from("voice_clones").upsert(
              {
                owner: uid,
                role,
                provider: "typecast",
                provider_voice_id: local[role],
                status: "ready",
                attempts: Math.max(1, localAttempts(uid, role)),
              },
              { onConflict: "owner,role" },
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
  const uid = await currentUserId();
  if (!uid) return; // 회원 전용 — 로그인 없이 지울 것도 없다
  const local = loadLocal(uid);
  let voiceId = local[role];

  // Supabase에 있으면 그 voice_id도 확인해 함께 지운다.
  const sb = getSupabase();
  if (sb) {
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
  saveLocal(uid, local);

  // Supabase — 행을 지우지 않고 '삭제됨'으로 바꿔 attempts(만들기 횟수)를 보존한다.
  // 반드시 이 역할만 — role 조건이 없으면 엄마를 지울 때 아빠까지 지워진다.
  if (sb) {
    try {
      await sb
        .from("voice_clones")
        .update({ provider_voice_id: null, status: "deleted" })
        .eq("owner", uid)
        .eq("role", role);
    } catch {
      /* 무시 */
    }
  }
}
