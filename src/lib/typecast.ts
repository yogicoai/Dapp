/**
 * Typecast API — 진짜 성우급 TTS. 서버 전용(키가 있어서 클라이언트 금지).
 *
 * 무료 티어: 월 30,000크레딧(1크레딧 = 1자), 카드 등록 불필요, 동시 요청 2개.
 * 책 한 권이 500~800자라 무료로도 월 40권쯤 읽힌다. 유료 전환 때는 같은 API에
 * 결제만 올리면 된다 (Lite $15/월 = 20만 자).
 *
 * 문서: https://docs.typecast.ai — POST /v1/text-to-speech (X-API-KEY 헤더),
 * 음성 목록은 GET /v2/voices. 응답 필드명이 버전에 따라 달라 관대하게 읽는다.
 */

const BASE = "https://api.typecast.ai";

export class TypecastError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function apiKey(): string {
  const key = process.env.TYPECAST_API_KEY;
  if (!key) {
    throw new TypecastError(
      "TYPECAST_API_KEY가 비어 있습니다. typecast.ai 가입 후 대시보드에서 키를 만들어 .env.local에 넣고 서버를 다시 켜주세요.",
      503,
    );
  }
  return key;
}

export type TypecastVoice = {
  id: string;
  name: string;
  model: string;
  emotions: string[];
  gender: string; // "male" | "female"
  age: string; // "child" | "teenager" | "young_adult" | "middle_age" | "elder"
};

/**
 * 음성 목록 (전부 597개쯤, 2026-07 기준). 언어 메타데이터는 없다 — 모든 음성이
 * 다국어라 합성 때 language:"kor"로 지정하면 한국어로 말한다.
 * 실측 응답 구조: { voice_id, voice_name, models:[{version, emotions}], gender, age, ... }
 */
export async function listTypecastVoices(): Promise<TypecastVoice[]> {
  const res = await fetch(`${BASE}/v2/voices`, {
    headers: { "X-API-KEY": apiKey() },
  });
  if (!res.ok) {
    throw new TypecastError(
      `음성 목록을 가져오지 못했습니다 (${res.status}): ${(await res.text()).slice(0, 300)}`,
      res.status === 401 ? 401 : 502,
    );
  }

  const data: unknown = await res.json();
  const arr = Array.isArray(data)
    ? data
    : Array.isArray((data as { result?: unknown[] }).result)
      ? (data as { result: unknown[] }).result
      : [];

  return arr
    .map((raw) => {
      const r = raw as Record<string, unknown>;
      const models = Array.isArray(r.models)
        ? (r.models as { version?: unknown; emotions?: unknown }[])
        : [];
      // 최신 모델(ssfm-v30)이 있으면 그걸, 없으면 첫 번째를 쓴다.
      const m = models.find((x) => x.version === "ssfm-v30") ?? models[0];
      return {
        id: String(r.voice_id ?? ""),
        name: String(r.voice_name ?? ""),
        model: String(m?.version ?? "") || "ssfm-v30",
        emotions: Array.isArray(m?.emotions) ? m.emotions.map(String) : [],
        gender: String(r.gender ?? ""),
        age: String(r.age ?? ""),
      };
    })
    .filter((v) => v.id);
}

/* ── 과금 자동 차단 ──
 * 라이트 플랜은 20만 크레딧을 넘기면 자동으로 추가 결제($9/10만 자)가 붙는다.
 * 그래서 합성 전에 이번 달 사용량을 확인해, 안전선(19만)에 닿으면 합성을 거부한다
 * → 앱은 무료 브라우저 음성으로 자동 폴백되고, 요금은 절대 초과되지 않는다.
 * 사용량 조회는 5분 캐시(+로컬 누적)로 매 요청 API를 두 번 때리지 않게 한다.
 */
const CREDIT_SAFE_LIMIT = 190_000;
const SUB_CACHE_MS = 5 * 60 * 1000;
let subCache: { at: number; used: number } | null = null;
let localUsedSinceRefresh = 0;

async function usedCreditsThisMonth(): Promise<number | null> {
  const now = Date.now();
  if (subCache && now - subCache.at < SUB_CACHE_MS) {
    return subCache.used + localUsedSinceRefresh;
  }
  try {
    const res = await fetch(`${BASE}/v1/users/me/subscription`, {
      headers: { "X-API-KEY": apiKey() },
    });
    if (!res.ok) return null; // 조회 실패 — 가드는 통과(합성은 되게), 다음 요청에 재시도
    const data = (await res.json()) as { credits?: { used_credits?: number } };
    const used = Number(data.credits?.used_credits ?? 0);
    subCache = { at: now, used };
    localUsedSinceRefresh = 0;
    return used;
  } catch {
    return null;
  }
}

/** 문장 하나를 음성(wav 등)으로 만든다. 글자 수만큼 크레딧이 나간다. */
export async function synthesize(input: {
  text: string;
  voiceId: string;
  model?: string;
  /** 감정 프리셋(happy·sad·angry·toneup 등) — 대사 연기용. 음성이 지원할 때만 먹는다. */
  emotion?: string;
  intensity?: number;
}): Promise<{ audio: ArrayBuffer; contentType: string }> {
  // 과금 자동 차단 — 안전선(19만 자)에 닿으면 합성하지 않는다(무료 음성으로 폴백).
  const used = await usedCreditsThisMonth();
  if (used !== null && used + input.text.length > CREDIT_SAFE_LIMIT) {
    throw new TypecastError(
      "이번 달 성우 크레딧을 거의 다 써서 추가 요금이 나가기 전에 잠갔어요. 다음 달에 다시 열려요.",
      429,
    );
  }

  const body: Record<string, unknown> = {
    voice_id: input.voiceId,
    text: input.text,
    model: input.model || "ssfm-v30",
    language: "kor",
  };
  if (input.emotion && input.emotion !== "normal") {
    // ssfm-v30의 감정 연기. intensity는 1이 기본 — 살짝 과장해 동화 낭독 톤으로.
    body.prompt = {
      emotion_preset: input.emotion,
      emotion_intensity: Math.min(1.2, Math.max(0.3, input.intensity ?? 0.8)),
    };
  }

  const res = await fetch(`${BASE}/v1/text-to-speech`, {
    method: "POST",
    headers: { "X-API-KEY": apiKey(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    // 402(크레딧 소진·계정 비활성)는 부모가 읽어도 뭘 해야 할지 아는 말로 바꾼다.
    if (res.status === 402 || body.includes("CREDIT_INSUFFICIENT")) {
      throw new TypecastError(
        "이번 달 무료 성우 음성을 다 썼어요. 크레딧을 충전하면 성우 목소리를 다시 들을 수 있어요.",
        402,
      );
    }
    throw new TypecastError(
      `음성 생성에 실패했습니다 (${res.status}): ${body}`,
      res.status === 401 ? 401 : 502,
    );
  }
  // 성공 — 로컬 누적(다음 캐시 갱신 전까지의 사용량 추정)에 더한다.
  localUsedSinceRefresh += input.text.length;
  return {
    audio: await res.arrayBuffer(),
    contentType: res.headers.get("content-type") ?? "audio/wav",
  };
}

/**
 * 퀵 클로닝 — 녹음 오디오 → 커스텀 음성 id(uc_...). 이 id는 /v1/text-to-speech에
 * 그대로 넣어 그 사람 목소리로 합성한다(감정도 됨). 라이트 플랜은 슬롯 50개.
 * (multipart: name, model, file · file 최대 25MB)
 */
export async function cloneVoiceTypecast(input: {
  name: string;
  audio: Blob;
  filename?: string;
  model?: string;
}): Promise<string> {
  const form = new FormData();
  form.append("name", input.name);
  form.append("model", input.model || "ssfm-v30");
  form.append("file", input.audio, input.filename ?? "voice.webm");

  // Content-Type은 붙이지 않는다 — fetch가 multipart 경계를 자동 설정한다.
  const res = await fetch(`${BASE}/v1/voices/clone`, {
    method: "POST",
    headers: { "X-API-KEY": apiKey() },
    body: form,
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 400);
    if (res.status === 402 || body.includes("CREDIT")) {
      throw new TypecastError("크레딧이 부족하거나 클로닝 슬롯이 가득 찼어요.", 402);
    }
    throw new TypecastError(`목소리 복제 실패 (${res.status}): ${body}`, res.status === 401 ? 401 : 502);
  }
  const data = (await res.json()) as { voice_id?: string };
  if (!data.voice_id) throw new TypecastError("복제 응답에 voice_id가 없습니다.", 502);
  return data.voice_id;
}

/** 커스텀 음성(uc_...) 삭제 — 부모가 본인 목소리를 지울 때 서버에서도 완전 제거. */
export async function deleteVoiceTypecast(voiceId: string): Promise<void> {
  const res = await fetch(`${BASE}/v1/voices/${encodeURIComponent(voiceId)}`, {
    method: "DELETE",
    headers: { "X-API-KEY": apiKey() },
  });
  // 이미 없으면(404) 지워진 것으로 본다.
  if (!res.ok && res.status !== 404) {
    const body = (await res.text()).slice(0, 300);
    throw new TypecastError(`목소리 삭제 실패 (${res.status}): ${body}`, res.status === 401 ? 401 : 502);
  }
}
