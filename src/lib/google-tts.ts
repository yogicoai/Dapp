/**
 * Google Cloud Text-to-Speech — '내가 만든 동화'의 실시간 낭독 엔진.
 *
 * 무료 티어(2026 기준): Chirp3-HD·Neural2·WaveNet 각 월 100만 자, Standard 월 400만 자.
 * 창작 동화 한 편이 800자 안팎이라 월 1,000편 넘게 공짜다. (Chirp3-HD는 넘으면 100만 자당 $30)
 * 서버 전용 — 키가 있어서 클라이언트에 노출하면 안 된다.
 *
 * 음성은 Chirp3-HD를 쓴다 — 생성형이라 Neural2(기계톤)보다 훨씬 사람에 가깝고,
 * 한국어가 30종(여14·남16)이라 캐릭터마다 다른 진짜 목소리를 줄 수 있다.
 * 대신 Chirp3-HD는 SSML·높낮이(pitch)·속도(speakingRate)를 지원하지 않는다 —
 * 재생 속도(배속)는 재생기(audio.playbackRate)에서 클라이언트가 조절한다.
 *
 * REST: POST /v1/text:synthesize?key=API_KEY
 *   { input:{text}, voice:{languageCode,name}, audioConfig:{audioEncoding:"MP3"} }
 *   → { audioContent: "<base64 mp3>" }
 * 문서: https://cloud.google.com/text-to-speech/docs/chirp3-hd
 */

const ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";

export class GoogleTtsError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * 앱 성우 id → 구글 Chirp3-HD 음성 이름. voices.ts의 TYPECAST_VOICES id와 1:1.
 * 참고: 이름(Aoede·Puck 등)만으론 각 음성의 나이·질감을 알 수 없어 성별만 맞춰
 * 배정했다 — 들어보고 더 어울리는 이름으로 바꾸면 된다(이 표만 고치면 전체 반영).
 */
const GOOGLE_VOICES: Record<string, string> = {
  // 아이(여)
  "tc-booqoo": "ko-KR-Chirp3-HD-Leda", // 부끄
  "tc-sua": "ko-KR-Chirp3-HD-Aoede", // 수아
  // 여성 — 언니·선생님·엄마·할머니
  "tc-chungah": "ko-KR-Chirp3-HD-Achernar", // 청아
  "tc-miso": "ko-KR-Chirp3-HD-Kore", // 미소 (엄마)
  "tc-dabin": "ko-KR-Chirp3-HD-Callirrhoe", // 다빈
  "tc-daeun": "ko-KR-Chirp3-HD-Autonoe", // 다은
  "tc-ina": "ko-KR-Chirp3-HD-Despina", // 이나
  "tc-jiyoon": "ko-KR-Chirp3-HD-Erinome", // 지윤
  "tc-jungsoon": "ko-KR-Chirp3-HD-Gacrux", // 정순 (할머니)
  "tc-jiyoung": "ko-KR-Chirp3-HD-Zephyr", // 지영 (선생님)
  // 남성 — 아빠·형아·남아·할아버지
  "tc-gunseok": "ko-KR-Chirp3-HD-Enceladus", // 건석 (아빠)
  "tc-changsu": "ko-KR-Chirp3-HD-Fenrir", // 창수 (형아)
  "tc-siwoo": "ko-KR-Chirp3-HD-Puck", // 시우 (남아)
  "tc-hajun": "ko-KR-Chirp3-HD-Achird", // 하준 (남아)
  "tc-yejoon": "ko-KR-Chirp3-HD-Orus", // 예준 (형)
  "tc-kwonil": "ko-KR-Chirp3-HD-Charon", // 이야기 할아버지
};

// 캐릭터 프리셋(basic/chick/bear/fairy)이 선택돼 들어와도 대략 매핑한다.
const PRESET_FALLBACK: Record<string, string> = {
  basic: "ko-KR-Chirp3-HD-Kore",
  chick: "ko-KR-Chirp3-HD-Aoede",
  bear: "ko-KR-Chirp3-HD-Charon",
  fairy: "ko-KR-Chirp3-HD-Leda",
};

const DEFAULT_VOICE = "ko-KR-Chirp3-HD-Kore";

export function googleVoiceFor(appVoiceId: string): string {
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
  const voiceName = googleVoiceFor(input.voiceId);
  const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey())}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: { text: input.text },
      voice: { languageCode: "ko-KR", name: voiceName },
      // Chirp3-HD는 pitch·speakingRate를 지원하지 않는다 — MP3 인코딩만 지정.
      audioConfig: { audioEncoding: "MP3" },
    }),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    // 429(한도 초과)·403(권한/청구 미설정)은 부모가 읽어도 뭘 해야 할지 아는 말로.
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
