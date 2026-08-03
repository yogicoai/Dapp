/**
 * ElevenLabs — 부모 목소리 복제(Instant Voice Cloning) + 그 목소리로 낭독(TTS).
 *
 * 테스트용: Starter 플랜($6/월, 목소리 10개 저장 · 월 30,000 크레딧). 서버 전용(키 노출 금지).
 *
 * 복제: POST /v1/voices/add                 (multipart: name, files[]) → { voice_id }
 * 낭독: POST /v1/text-to-speech/{voice_id}   (json: text, model_id)    → mp3
 * 문서: https://elevenlabs.io/docs/api-reference
 */

const BASE = "https://api.elevenlabs.io";

export class ElevenError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function apiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    throw new ElevenError(
      "ELEVENLABS_API_KEY가 비어 있습니다. elevenlabs.io에서 API 키를 만들어 .env.local에 넣고 서버를 다시 켜주세요.",
      503,
    );
  }
  return key;
}

/**
 * 녹음 오디오 → 복제된 목소리 id. name은 "엄마"·"아빠" 등(사람이 알아볼 이름).
 * 한 번 만들면 이 voice_id를 계정에 저장해두고, 낭독할 때마다 재사용한다(재복제 불필요).
 */
export async function cloneVoice(input: {
  name: string;
  audio: Blob;
  filename?: string;
}): Promise<string> {
  const form = new FormData();
  form.append("name", input.name);
  form.append("files", input.audio, input.filename ?? "voice.webm");
  // 낭독용이라 배경 잡음은 제거해 더 깨끗한 목소리로 복제한다.
  form.append("remove_background_noise", "true");

  const res = await fetch(`${BASE}/v1/voices/add`, {
    method: "POST",
    headers: { "xi-api-key": apiKey() },
    body: form,
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 400);
    throw new ElevenError(
      `목소리 복제 실패 (${res.status}): ${body}`,
      res.status === 401 ? 401 : res.status === 429 ? 429 : 502,
    );
  }
  const data = (await res.json()) as { voice_id?: string };
  if (!data.voice_id) throw new ElevenError("복제 응답에 voice_id가 없습니다.", 502);
  return data.voice_id;
}

/**
 * 복제된 목소리를 ElevenLabs에서 완전히 삭제한다.
 * 부모가 "내 목소리 삭제"를 누르면 우리 DB뿐 아니라 업체 서버에서도 지워 개인정보를 남기지 않는다.
 */
export async function deleteVoice(voiceId: string): Promise<void> {
  const res = await fetch(`${BASE}/v1/voices/${encodeURIComponent(voiceId)}`, {
    method: "DELETE",
    headers: { "xi-api-key": apiKey() },
  });
  // 이미 없으면(404) 지워진 것으로 본다.
  if (!res.ok && res.status !== 404) {
    const body = (await res.text()).slice(0, 300);
    throw new ElevenError(`목소리 삭제 실패 (${res.status}): ${body}`, res.status === 401 ? 401 : 502);
  }
}

/** 문장 → 복제된 목소리로 mp3. 글자 수만큼 크레딧이 나간다(같은 문장은 클라이언트가 캐시). */
export async function synthesizeEleven(input: {
  text: string;
  voiceId: string;
}): Promise<{ audio: ArrayBuffer; contentType: string }> {
  const res = await fetch(`${BASE}/v1/text-to-speech/${encodeURIComponent(input.voiceId)}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey(),
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: input.text,
      // 한국어 지원·고품질. (비용을 아끼려면 eleven_flash_v2_5로 바꾸면 크레딧 절반)
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 400);
    if (res.status === 429) {
      throw new ElevenError("이번 달 크레딧을 다 썼어요. 다음 달에 다시 열리거나 플랜을 올리면 계속 쓸 수 있어요.", 429);
    }
    throw new ElevenError(`음성 생성 실패 (${res.status}): ${body}`, res.status === 401 ? 401 : 502);
  }
  return { audio: await res.arrayBuffer(), contentType: res.headers.get("content-type") ?? "audio/mpeg" };
}
