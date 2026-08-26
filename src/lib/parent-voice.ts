/**
 * 부모 목소리 — 녹음 오디오를 복제(ElevenLabs)하고, 계정별로 voice_id를 저장/삭제한다.
 * "회원마다 자기 엄마·아빠 목소리를 계속 저장해두고, 동화 읽을 때 그 목소리로 읽어준다"는
 * 핵심 기능의 관리 계층. (복제 자체는 /api/voice/clone, 낭독은 voices.ts의 fetchElevenAudio)
 *
 * 저장은 2단: ① 이 기기(localStorage) — 키만 넣으면 바로 테스트되게. ② Supabase(voice_clones)
 * — 여러 기기·재설치에도 남는 '정식' 저장(테이블 SQL을 돌리면 자동 사용, 없으면 로컬만).
 */
import {
  CLONE_MAX_SECONDS,
  CLONE_SAMPLE_RATE,
  cloneWavBytes,
  resample,
  noiseGate,
  trimSilence,
} from "@/lib/voice-dsp";
import { currentUid, getSupabase } from "@/lib/supabase";
import { capPieceLengths } from "@/lib/voice-trim";

export type ParentVoice = {
  role: string; // 'mom' | 'dad'
  label: string; // '엄마' | '아빠'
  emoji: string;
  voiceId: string; // 복제된 ElevenLabs voice_id
};

export const PARENT_VOICE_TEST_TEXT = "오늘은 우리 함께 반짝이는 이야기를 읽어 볼까? 천천히, 다정하게 시작해 보자.";

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
const LS_PENDING_KEY = "voice-storybook:pending-parent-voices";
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
function loadPendingLocal(uid: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(`${LS_PENDING_KEY}:${uid}`) || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}
function savePendingLocal(uid: string, map: Record<string, string>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`${LS_PENDING_KEY}:${uid}`, JSON.stringify(map));
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

const CLONE_WAV_MAX_BYTES = cloneWavBytes(CLONE_MAX_SECONDS);

/** 표본율 변환(선형 보간). 목소리 재료로는 이 정도면 충분하다. */


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
/**
 * 녹음들을 클로닝용 WAV 한 덩어리로.
 *
 * @param roomNoise 녹음 전에 잰 방 소음(RMS). 넘기면 말 사이 잡음을 눌러 준다.
 *                  안 넘기면 그 단계만 건너뛴다 — 예전 호출부도 그대로 돈다.
 */
export async function prepareVoiceWav(blobs: Blob[], roomNoise = 0): Promise<Blob> {
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  try {
    const pieces: Float32Array[] = [];
    for (const b of blobs) {
      // 조각마다 따로 감싼다 — 예전엔 한 덩어리 루프라 2번 문장이 안 열리면
      // 잘 읽은 1번 문장까지 함께 날아갔다. 하나가 안 되면 그것만 건너뛴다.
      try {
        const audio = await ctx.decodeAudioData(await b.arrayBuffer());
        // 다듬기는 원본 표본율에서 하고, 마지막에 16kHz로 낮춰 보낸다(용량 절약).
        /*
         * 낮은 웅웅거림을 걷어내고 → 말 사이 잡음을 누르고 → 앞뒤 무음을 자른다.
         *
         * 게이트를 하이패스 뒤에 두는 이유: 에어컨 같은 저주파가 남아 있으면 그것이
         * 세기에 잡혀 '말하는 중'으로 오판된다. 먼저 걷어내야 문턱이 제대로 먹는다.
         * 자르기(trimSilence) 앞에 두는 이유: 눌러 놓아야 어디가 무음인지 더 잘 보인다.
         */
        const cleaned = trimSilence(
          noiseGate(highPass(toMono(audio), audio.sampleRate), audio.sampleRate, roomNoise),
          audio.sampleRate,
        );
        pieces.push(resample(cleaned, audio.sampleRate, CLONE_SAMPLE_RATE));
      } catch (e) {
        console.warn("[prepareVoiceWav] 녹음 하나를 열지 못했어요 — 건너뜁니다", e);
      }
    }
    if (pieces.length === 0) throw new Error("녹음을 하나도 열지 못했어요.");

    // 안전 상한 — 조각마다 예산을 나눠 앞부분을 남긴다.
    // 예전엔 다 이어 붙인 뒤 뒤를 잘라서, 길게 읽으면 두 번째 문장이 통째로 사라졌다.
    const capped = capPieceLengths(
      pieces.map((p) => p.length),
      CLONE_SAMPLE_RATE * CLONE_MAX_SECONDS,
    ).map((len, i) => (len === pieces[i].length ? pieces[i] : pieces[i].subarray(0, len)));

    // 사이에 0.4초 숨 쉴 틈 — 두 번 읽은 게 한 문장처럼 붙어 들리지 않게.
    const gap = Math.floor(CLONE_SAMPLE_RATE * 0.4);
    const total = capped.reduce((n, p) => n + p.length, 0) + gap * Math.max(0, capped.length - 1);
    const merged = new Float32Array(total);
    let at = 0;
    capped.forEach((p, i) => {
      merged.set(p, at);
      at += p.length + (i < capped.length - 1 ? gap : 0);
    });
    return encodeWav(normalize(merged), CLONE_SAMPLE_RATE);
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
 * 엄마와 아빠를 **각각** 하나씩 보관할 수 있고, 만들 때마다 토큰이 나간다.
 * 기존 목소리를 삭제하면 같은 역할의 목소리를 다시 만들 수 있다.
 */
export async function cloneParentVoice(role: string, name: string, audio: Blob): Promise<string> {
  const uid = await currentUserId();
  if (!uid) throw new Error("로그인한 계정에서만 목소리를 만들 수 있어요.");
  /*
   * 같은 역할의 목소리가 이미 있어도 막지 않는다 — 토큰만 있으면 다시 만들 수 있다.
   * 예전엔 "지운 뒤 다시 만들어 주세요"로 막아서, 부모가 먼저 지우고 나서 복제에
   * 실패하면 멀쩡한 목소리만 잃었다.
   *
   * 순서가 곧 안전장치다:
   *   ① 새 목소리를 **먼저** 복제한다. 실패하면 여기서 끝 — 옛 목소리는 그대로 남고,
   *      설정 화면이 선차감한 토큰을 돌려준다.
   *   ② 성공한 뒤에야 옛 목소리를 지운다. 이 단계는 절대 예외를 던지지 않는다 —
   *      던지면 성공한 복제에 환불이 나가 공짜 목소리가 된다.
   */
  const previousId =
    (await loadParentVoices()).find((p) => p.role === role)?.voiceId ??
    (await loadPendingParentVoices()).find((p) => p.role === role)?.voiceId ??
    null;

  /*
   * 이미 클로닝용으로 구운 WAV면 그대로 보낸다.
   * 녹음 저장 때 이미 하이패스·침묵 정리·정규화를 마쳤는데, 여기서 한 번 더 돌리면
   * 정규화로 커진 신호에 같은 고정 임계값이 다시 걸려 말소리를 깎는다(닮은 정도가 떨어진다).
   */
  const wav =
    audio.type === "audio/wav" && audio.size <= CLONE_WAV_MAX_BYTES
      ? audio
      : await audioToWav(audio); // Typecast는 wav/mp3만 받으므로 변환
  const form = new FormData();
  form.append("name", name);
  form.append("audio", wav, "voice.wav");
  const r = await fetch("/api/voice/clone", { method: "POST", body: form });
  if (!r.ok) {
    const d = (await r.json().catch(() => null)) as { error?: string } | null;
    throw new Error(d?.error ?? `복제 실패 (HTTP ${r.status})`);
  }
  const { voiceId } = (await r.json()) as { voiceId: string };

  // ① 기기에 항상 저장(계정별 키) — SQL 없이도 바로 테스트되게.
  const local = loadPendingLocal(uid);
  local[role] = voiceId;
  savePendingLocal(uid, local);
  // 다시 만든 경우 옛 목소리는 '완성' 목록에서 내린다 — 확인 전인데 완성으로 보이면 안 된다.
  const ready = loadLocal(uid);
  if (ready[role]) {
    delete ready[role];
    saveLocal(uid, ready);
  }

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
          status: "review",
        },
        // 역할별로 한 줄이라 (owner, role)이 충돌 기준이다 — 엄마 줄이 아빠 줄을 덮지 않게.
        { onConflict: "owner,role" },
      );
    }
  } catch {
    /* voice_clones 테이블 없음 등 — 기기 저장으로도 충분히 동작한다 */
  }

  /*
   * 새 목소리가 자리를 잡은 뒤에야 옛것을 지운다.
   * 여기서 예외가 나면 안 된다 — 부르는 쪽(설정)이 실패로 보고 토큰을 환불하는데,
   * 복제는 이미 성공했으므로 공짜 목소리가 되어 버린다. 실패는 적어 두고 나중에 지운다.
   */
  if (previousId && previousId !== voiceId) {
    if (!(await deleteCloneRemote(previousId))) rememberOrphan(uid, previousId);
  }
  void retryOrphanClones(uid);
  return voiceId;
}

/** 복제는 끝났지만 사용자가 실제 합성 샘플을 승인하지 않은 목소리. */
export async function loadPendingParentVoices(): Promise<ParentVoice[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  const byRole = loadPendingLocal(uid);
  try {
    const sb = getSupabase();
    if (sb) {
      const { data, error } = await sb
        .from("voice_clones")
        .select("role, provider_voice_id, status")
        .eq("owner", uid);
      if (!error && data) {
        if (data.length > 0) {
          for (const role of Object.keys(byRole)) delete byRole[role];
        }
        for (const row of data as { role: string; provider_voice_id: string | null; status: string }[]) {
          if (row.status === "review" && row.provider_voice_id) byRole[row.role] = row.provider_voice_id;
        }
        savePendingLocal(uid, byRole);
      }
    }
  } catch {}
  return Object.entries(byRole).map(([role, voiceId]) => ({ role, voiceId, ...metaForRole(role) }));
}

export async function approveParentVoice(role: string, voiceId: string): Promise<void> {
  const uid = await currentUserId();
  if (!uid) throw new Error("로그인한 계정에서만 승인할 수 있어요.");
  const pending = loadPendingLocal(uid);
  if (pending[role] !== voiceId) throw new Error("승인할 목소리를 찾지 못했어요.");
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.from("voice_clones").update({ status: "ready" }).eq("owner", uid).eq("role", role);
    if (error) throw error;
  }
  const ready = loadLocal(uid);
  ready[role] = voiceId;
  saveLocal(uid, ready);
  delete pending[role];
  savePendingLocal(uid, pending);
}

/**
 * 마스터 열람용 — 회원별로 어떤 부모 목소리를 등록했는지.
 *
 * 등록 여부만 확인하는 용도라 목소리 id는 가져오지 않는다(남의 목소리를 쓸 일은 없다).
 * 결과: { 회원id: ["mom", "dad"] }.
 *
 * voice_clones에 마스터 열람 정책이 있어야 보인다(supabase-voice-clones.sql).
 * 정책이 없으면 RLS가 0줄을 돌려주므로 조용히 빈 값이 된다 — 오류로 막지 않는다.
 */
export async function loadAllParentVoiceRoles(): Promise<Record<string, string[]>> {
  const sb = getSupabase();
  if (!sb) return {};
  try {
    const { data, error } = await sb.from("voice_clones").select("owner, role, status");
    if (error || !data) return {};
    const byOwner: Record<string, string[]> = {};
    for (const r of data as { owner: string; role: string; status: string }[]) {
      if (r.status !== "ready") continue; // 지운 목소리는 등록 안 된 것으로 본다
      (byOwner[r.owner] ??= []).push(r.role);
    }
    return byOwner;
  } catch {
    return {};
  }
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

/* ── 버려진 복제 정리 ──
 * Typecast 클론은 슬롯을 차지한다(라이트 50개). 지우기가 한 번 실패했을 때 그냥
 * 넘기면 그 슬롯은 영영 뜬 채로 남는다 — 다시 만들기를 자유롭게 열어 두는 이상
 * 이게 쌓이면 언젠가 복제가 통째로 막힌다. 그래서 실패한 id를 적어 두고 다음
 * 기회에 다시 지운다.
 */
const LS_ORPHANS = "voice-storybook:orphan-clones";
const MAX_ORPHANS = 20;

function loadOrphans(uid: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(`${LS_ORPHANS}:${uid}`);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function saveOrphans(uid: string, list: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${LS_ORPHANS}:${uid}`, JSON.stringify(list.slice(-MAX_ORPHANS)));
  } catch {
    /* 무시 */
  }
}

/** Typecast에서 클론 하나를 지운다. 지워졌으면 true. 예외를 던지지 않는다. */
async function deleteCloneRemote(voiceId: string): Promise<boolean> {
  try {
    const r = await fetch("/api/voice/clone", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voiceId }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** 지우지 못하고 밀린 클론들을 다시 지워 본다. 실패한 것만 남긴다. */
async function retryOrphanClones(uid: string): Promise<void> {
  const list = loadOrphans(uid);
  if (list.length === 0) return;
  const stillFailing: string[] = [];
  for (const id of list) {
    if (!(await deleteCloneRemote(id))) stillFailing.push(id);
  }
  saveOrphans(uid, stillFailing);
}

/** 지우기에 실패한 클론을 나중에 다시 지우도록 적어 둔다. */
function rememberOrphan(uid: string, voiceId: string): void {
  const list = loadOrphans(uid);
  if (!list.includes(voiceId)) saveOrphans(uid, [...list, voiceId]);
}

/**
 * 부모가 본인 목소리를 삭제한다 — 기기·Supabase에서 지우고 Typecast 서버에서도 완전 제거.
 * 개인정보를 어디에도 남기지 않으며, 삭제 뒤 같은 역할의 목소리를 다시 만들 수 있다.
 */
export async function deleteParentVoice(role: string): Promise<void> {
  const uid = await currentUserId();
  if (!uid) return; // 회원 전용 — 로그인 없이 지울 것도 없다
  const local = loadLocal(uid);
  const pending = loadPendingLocal(uid);
  let voiceId = local[role] ?? pending[role];

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

  // Typecast 서버에서 완전 삭제. 실패하면 적어 두고 다음 기회에 다시 지운다 —
  // 그냥 넘기면 그 슬롯(라이트 50개)이 영영 뜬 채로 남는다.
  if (voiceId && !(await deleteCloneRemote(voiceId))) rememberOrphan(uid, voiceId);
  void retryOrphanClones(uid);

  // 기기 저장에서 제거. 이전 버전의 횟수 제한 값도 함께 지워 더는 영향을 주지 않게 한다.
  delete local[role];
  saveLocal(uid, local);
  delete pending[role];
  savePendingLocal(uid, pending);
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(`${LS_ATTEMPTS}:${uid}:${role}`);
  }

  // Supabase에서도 행을 제거해 같은 역할을 새 목소리로 다시 등록할 수 있게 한다.
  // 반드시 이 역할만 — role 조건이 없으면 엄마를 지울 때 아빠까지 지워진다.
  if (sb) {
    try {
      await sb
        .from("voice_clones")
        .delete()
        .eq("owner", uid)
        .eq("role", role);
    } catch {
      /* 무시 */
    }
  }
}
