/**
 * Google Cloud Text-to-Speech — '내가 만든 동화'의 실시간 낭독 엔진.
 *
 * 무료 티어(2026 기준): Chirp3-HD·Neural2·WaveNet 각 월 100만 자, Standard 월 400만 자.
 * 창작 동화 한 편이 800자 안팎이라 월 1,000편 넘게 공짜다. 서버 전용(키 노출 금지).
 *
 * 목소리 전략:
 *  · 여성·남성 어른 = Chirp3-HD (생성형이라 Neural2보다 훨씬 사람에 가깝다).
 *  · 어린이 = Chirp3엔 진짜 아이 목소리가 없어서, Neural2를 '높은 피치'로 올려 아이답게 낸다
 *    (Chirp3는 pitch를 못 바꾼다). 자연스러움은 살짝 덜해도 '아이 톤'이 나온다.
 *  · 재생 속도(배속)는 재생기(audio.playbackRate)에서 클라이언트가 조절한다.
 *
 * REST: POST /v1/text:synthesize?key=API_KEY
 *   { input:{text}, voice:{languageCode,name}, audioConfig:{audioEncoding:"MP3"[,pitch,speakingRate]} }
 *   → { audioContent: "<base64 mp3>" }
 * 문서: https://cloud.google.com/text-to-speech/docs
 */

const ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";

export class GoogleTtsError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// name에 "Chirp3"가 있으면 pitch·speakingRate를 못 쓴다(무시·오류) → 그 필드는 안 보낸다.
// Neural2/WaveNet은 pitch(반음 -20~20)·rate(0.25~4)를 지원 → 어린이 톤 등에 쓴다.
type VoiceCfg = { name: string; pitch?: number; rate?: number };

/** 앱 성우 id → 구글 음성. voices.ts의 TYPECAST_VOICES id와 1:1. */
const GOOGLE_VOICES: Record<string, VoiceCfg> = {
  // 어린이 — Neural2 여성 + 높은 피치로 '아이 톤'
  "tc-booqoo": { name: "ko-KR-Neural2-B", pitch: 5.5, rate: 1.06 },
  "tc-sua": { name: "ko-KR-Neural2-A", pitch: 6.5, rate: 1.12 },
  "tc-siwoo": { name: "ko-KR-Neural2-C", pitch: 6.0, rate: 1.08 },
  "tc-hajun": { name: "ko-KR-Neural2-C", pitch: 7.0, rate: 1.12 },
  // 여성 어른 — Chirp3-HD (자연스러움)
  "tc-miso": { name: "ko-KR-Chirp3-HD-Kore" },
  "tc-chungah": { name: "ko-KR-Chirp3-HD-Achernar" },
  "tc-dabin": { name: "ko-KR-Chirp3-HD-Callirrhoe" },
  "tc-daeun": { name: "ko-KR-Chirp3-HD-Autonoe" },
  "tc-ina": { name: "ko-KR-Chirp3-HD-Despina" },
  "tc-jiyoon": { name: "ko-KR-Chirp3-HD-Erinome" },
  "tc-jungsoon": { name: "ko-KR-Chirp3-HD-Gacrux" },
  "tc-jiyoung": { name: "ko-KR-Chirp3-HD-Zephyr" },
  // 남성 어른 — Chirp3-HD
  "tc-gunseok": { name: "ko-KR-Chirp3-HD-Enceladus" },
  "tc-changsu": { name: "ko-KR-Chirp3-HD-Fenrir" },
  "tc-yejoon": { name: "ko-KR-Chirp3-HD-Orus" },
  "tc-kwonil": { name: "ko-KR-Chirp3-HD-Charon" },
};

// 캐릭터 프리셋(basic/chick/bear/fairy)이 선택돼 들어와도 대략 매핑한다.
const PRESET_FALLBACK: Record<string, VoiceCfg> = {
  basic: { name: "ko-KR-Chirp3-HD-Kore" },
  chick: { name: "ko-KR-Neural2-B", pitch: 7, rate: 1.15 },
  bear: { name: "ko-KR-Chirp3-HD-Charon" },
  fairy: { name: "ko-KR-Neural2-A", pitch: 4, rate: 1.05 },
};

const DEFAULT_VOICE: VoiceCfg = { name: "ko-KR-Chirp3-HD-Kore" };

export function googleVoiceFor(appVoiceId: string): VoiceCfg {
  return GOOGLE_VOICES[appVoiceId] ?? PRESET_FALLBACK[appVoiceId] ?? DEFAULT_VOICE;
}

function apiKey(): string {
  const key = process.env.GOOGLE_TTS_API_KEY;
  if (!key) {
    throw new GoogleTtsError(
      "GOOGLE_TTS_API_KEY가 비어 있습니다. Google Cloud에서 Text-to-Speech API 키를 만들어 .env.local에 넣고 서버를 다시 켜주세요.",
      503,
    );
  }
  return key;
}

/** 문장 하나를 mp3로 만든다. 글자 수만큼 무료 크레딧(월 100만 자)에서 차감된다. */
export async function synthesizeGoogle(input: {
  text: string;
  voiceId: string;
}): Promise<{ audio: ArrayBuffer; contentType: string }> {
  const cfg = googleVoiceFor(input.voiceId);
  const isChirp = cfg.name.includes("Chirp3");
  // Chirp3-HD는 pitch·speakingRate 미지원 → 인코딩만. Neural2 등은 pitch/rate로 톤을 만든다.
  const audioConfig = isChirp
    ? { audioEncoding: "MP3" }
    : {
        audioEncoding: "MP3",
        pitch: Math.min(20, Math.max(-20, cfg.pitch ?? 0)),
        speakingRate: Math.min(4, Math.max(0.25, cfg.rate ?? 1)),
      };

  const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey())}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: { text: input.text },
      voice: { languageCode: "ko-KR", name: cfg.name },
      audioConfig,
    }),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    if (res.status === 429) {
      throw new GoogleTtsError(
        "이번 달 무료 음성을 다 썼어요. 다음 달에 다시 무료로 열리거나, 결제를 올리면 계속 쓸 수 있어요.",
        429,
      );
    }
    throw new GoogleTtsError(
      `구글 음성 생성 실패 (${res.status}): ${body}`,
      res.status === 401 || res.status === 403 ? res.status : 502,
    );
  }
  const data = (await res.json()) as { audioContent?: string };
  if (!data.audioContent) {
    throw new GoogleTtsError("구글 응답에 오디오가 없습니다.", 502);
  }
  const buf = Buffer.from(data.audioContent, "base64");
  const audio = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  return { audio, contentType: "audio/mpeg" };
}
