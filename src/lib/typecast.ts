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

/** 문장 하나를 음성(wav 등)으로 만든다. 글자 수만큼 크레딧이 나간다. */
export async function synthesize(input: {
  text: string;
  voiceId: string;
  model?: string;
}): Promise<{ audio: ArrayBuffer; contentType: string }> {
  const res = await fetch(`${BASE}/v1/text-to-speech`, {
    method: "POST",
    headers: { "X-API-KEY": apiKey(), "Content-Type": "application/json" },
    body: JSON.stringify({
      voice_id: input.voiceId,
      text: input.text,
      model: input.model || "ssfm-v30",
      language: "kor",
    }),
  });
  if (!res.ok) {
    throw new TypecastError(
      `음성 생성에 실패했습니다 (${res.status}): ${(await res.text()).slice(0, 300)}`,
      res.status === 401 ? 401 : 502,
    );
  }
  return {
    audio: await res.arrayBuffer(),
    contentType: res.headers.get("content-type") ?? "audio/wav",
  };
}
