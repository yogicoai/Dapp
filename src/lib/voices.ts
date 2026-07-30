/**
 * 목소리 — 프리셋(캐릭터)과 커스텀(엄마·아빠 녹음).
 *
 * 프리셋: 브라우저 TTS(Web Speech)의 pitch·rate만 바꿔 캐릭터 느낌을 낸다.
 *   비용 0원으로 "목소리 고르는 재미"를 먼저 준다.
 * 커스텀: 지정 문장을 녹음해 기기에 보관한다(IndexedDB). 클로닝 벤더(Typecast)가
 *   붙으면 이 녹음이 그대로 클로닝 재료가 된다 — 그때까지 status는 "recorded".
 *   지정 문장만 녹음하는 이유: 유출돼도 무해한 내용이라 부모 불안을 구조로 푼다.
 */

export type PresetVoice = {
  kind: "preset";
  id: string;
  label: string;
  emoji: string;
  /** 스티커 아이콘 (힉스필드 아트). */
  icon: string;
  pitch: number; // 0~2, 1이 기본
  rate: number; // 0.1~10, 1이 기본
  /** 미리듣기 인사말 — 칩을 누르면 이 문장을 그 목소리로 말한다. */
  sample: string;
};

export type CustomVoice = {
  kind: "custom";
  id: string;
  label: string; // "엄마" | "아빠" | 자유
  emoji: string;
  createdAt: string;
  /** 본인 목소리 동의 시각. 이 값 없이는 저장 자체를 막는다. */
  consentAt: string;
  /** recorded → (Typecast 연결 후) cloning → ready */
  status: "recorded";
};

/**
 * 성우 목소리 (Typecast 무료 티어). 브라우저 기계음 대신 진짜 성우가 읽는다.
 * 인터넷 필요, 글자 수만큼 무료 크레딧(월 3만 자)이 나간다 — 같은 문장은
 * 기기에 캐시해서(IndexedDB) 두 번째부터는 0원이다.
 */
export type TypecastPreset = {
  kind: "tc";
  id: string;
  label: string;
  emoji: string;
  /** Typecast API의 voice_id */
  voiceId: string;
  model: string;
  /** 칩 툴팁 — 어떤 목소리인지 */
  desc: string;
  sample: string;
};

export type Voice = PresetVoice | CustomVoice | TypecastPreset;

/** 캐릭터 프리셋. 아이가 이름·이모지로 고른다. */
export const PRESET_VOICES: PresetVoice[] = [
  { kind: "preset", id: "basic", label: "또랑또랑", emoji: "🎈", icon: "/icons/voice-basic.webp", pitch: 1.0, rate: 0.9, sample: "안녕! 오늘은 어떤 동화를 읽어볼까?" },
  { kind: "preset", id: "chick", label: "삐약이", emoji: "🐥", icon: "/icons/voice-chick.webp", pitch: 1.6, rate: 1.0, sample: "삐약삐약! 나랑 같이 동화 보러 가자!" },
  { kind: "preset", id: "bear", label: "곰아저씨", emoji: "🐻", icon: "/icons/voice-bear.webp", pitch: 0.6, rate: 0.82, sample: "허허, 오늘은 아주 재미있는 이야기를 들려주마." },
  { kind: "preset", id: "fairy", label: "요정님", emoji: "🧚", icon: "/icons/voice-fairy.webp", pitch: 1.3, rate: 1.1, sample: "반짝반짝! 마법 같은 이야기가 시작돼요!" },
];

/**
 * 성우 13명 — 사장님이 Typecast 597개 중 직접 고른 12명 + 옛이야기 할아버지(권일).
 * 아이(부끄·수아), 언니·선생님(다빈·다은·이나·지윤·지영·청아), 엄마·할머니(미소·정순),
 * 아빠·형아(건석·창수), 옛날이야기 할아버지(권일). 모두 ssfm-v30(감정 연기) 지원.
 * 주의: "출동!"처럼 아주 짧은 감탄 문장은 Typecast 전처리가 거부한다 (실측).
 */
export const TYPECAST_VOICES: TypecastPreset[] = [
  { kind: "tc", id: "tc-booqoo", label: "부끄", emoji: "😳", voiceId: "tc_699d27d2f197c861791ac91b", model: "ssfm-v30", desc: "여자 어린이 · 수줍은 친구", sample: "안녕… 나랑 같이 동화 볼래?" },
  { kind: "tc", id: "tc-sua", label: "수아", emoji: "🎀", voiceId: "tc_6699eb5749dfac016c29445c", model: "ssfm-v30", desc: "여자 어린이 · 밝고 명랑한 친구", sample: "와아, 정말 신나는 이야기야!" },
  { kind: "tc", id: "tc-chungah", label: "청아", emoji: "🌿", voiceId: "tc_67513c5a498d6471f99d48fc", model: "ssfm-v30", desc: "여자 · 맑고 청아한 목소리", sample: "맑은 목소리로 이야기 들려줄게." },
  { kind: "tc", id: "tc-miso", label: "미소", emoji: "🌸", voiceId: "tc_677f2ac4934cbfb52bee8a9c", model: "ssfm-v30", desc: "여자 · 미소 가득한 엄마", sample: "포근하게 읽어줄게, 우리 아가." },
  { kind: "tc", id: "tc-dabin", label: "다빈", emoji: "💜", voiceId: "tc_67ad583c7848a19031f798f7", model: "ssfm-v30", desc: "여자 청소년 · 상냥한 언니", sample: "언니가 재미있게 읽어줄게!" },
  { kind: "tc", id: "tc-daeun", label: "다은", emoji: "✨", voiceId: "tc_692799c46508f6b9468c54c7", model: "ssfm-v30", desc: "여자 · 또렷한 언니", sample: "오늘의 동화, 시작해 볼까?" },
  { kind: "tc", id: "tc-ina", label: "이나", emoji: "🌼", voiceId: "tc_62686be9deec4c1bb7fd077c", model: "ssfm-v30", desc: "여자 · 다정한 목소리", sample: "이리 와, 이야기 들려줄게." },
  { kind: "tc", id: "tc-jiyoon", label: "지윤", emoji: "☁️", voiceId: "tc_62296627a4ff5d1ee6bf4ecc", model: "ssfm-v30", desc: "여자 · 차분한 목소리", sample: "차분하게 읽어줄게." },
  { kind: "tc", id: "tc-jungsoon", label: "정순", emoji: "👵", voiceId: "tc_5ebea242728f5b00075e6211", model: "ssfm-v30", desc: "여자 · 정겨운 할머니", sample: "옛날 옛적에, 얘야." },
  { kind: "tc", id: "tc-jiyoung", label: "지영", emoji: "🌷", voiceId: "tc_5c789c34dabcfa0008b0a390", model: "ssfm-v30", desc: "여자 · 밝은 선생님", sample: "친구들, 이야기 들을 준비 됐나요?" },
  { kind: "tc", id: "tc-gunseok", label: "건석", emoji: "🧔", voiceId: "tc_6731b2e0855f351b98d30c48", model: "ssfm-v30", desc: "남자 · 듬직한 아빠", sample: "아빠가 재미있게 읽어줄게." },
  { kind: "tc", id: "tc-changsu", label: "창수", emoji: "⚡", voiceId: "tc_6059dad0b83880769a50502f", model: "ssfm-v30", desc: "남자 · 활기찬 형아", sample: "형아랑 신나는 이야기 가자!" },
  { kind: "tc", id: "tc-siwoo", label: "시우", emoji: "🧒", voiceId: "tc_6699eb3849dfac016c29444c", model: "ssfm-v30", desc: "남자 어린이 · 씩씩한 친구", sample: "나랑 같이 모험 떠나자!" },
  { kind: "tc", id: "tc-hajun", label: "하준", emoji: "🐯", voiceId: "tc_60db308484130840f23e6ca0", model: "ssfm-v30", desc: "남자 어린이 · 명랑한 친구", sample: "오늘 이야기 진짜 기대돼!" },
  { kind: "tc", id: "tc-yejoon", label: "예준", emoji: "🎮", voiceId: "tc_63edf3d68aab086d6b782a55", model: "ssfm-v30", desc: "남자 청소년 · 듬직한 형", sample: "형이 재미있게 읽어줄게!" },
  { kind: "tc", id: "tc-kwonil", label: "이야기 할아버지", emoji: "📖", voiceId: "tc_675a73eb789ff3ea6cc80235", model: "ssfm-v30", desc: "남자 · 옛날이야기 전문 할아버지", sample: "허허, 옛날 옛적 이야기를 들려주마." },
];

export function findTypecast(id: string): TypecastPreset | null {
  return TYPECAST_VOICES.find((v) => v.id === id) ?? null;
}

/**
 * 창작 동화(내가 만든 동화) 추천 성우 — 딱 3개(여성·남성·어린이). 만들기·뷰어 공용.
 * id는 위 성우와 같아 구글 음성 매핑·미리듣기·재생이 그대로 동작한다.
 */
export const RECOMMENDED_VOICES = [
  { id: "tc-miso", label: "여성", emoji: "👩", desc: "다정한 여성 목소리" },
  { id: "tc-gunseok", label: "남성", emoji: "👨", desc: "듬직한 남성 목소리" },
] as const;

/** 녹음할 지정 문장. 개인정보가 전혀 없는 동화 문장이라 유출돼도 무해하다. */
export const RECORDING_SCRIPT =
  "옛날 옛적, 깊은 숲속에 작은 집이 한 채 있었어요. " +
  "반짝이는 별들이 지붕 위에서 춤을 추고, 달님이 창문을 살며시 비추었지요. " +
  "오늘 밤에도 재미있는 이야기가 시작된답니다.";

const SELECTED_KEY = "voice-storybook:voice";
const CUSTOM_KEY = "voice-storybook:custom-voices";
const RATE_KEY = "voice-storybook:voice-rate";

/**
 * 읽기 속도 배율 — 프리셋 rate에 곱한다.
 * 편한 속도가 아이마다 달라서(너무 느리다는 집이 있다) 전역 설정으로 둔다.
 */
export const VOICE_RATES = [
  { value: 0.8, label: "느리게" },
  { value: 1.0, label: "보통" },
  { value: 1.2, label: "조금 빠르게" },
  { value: 1.4, label: "빠르게" },
] as const;

export function loadVoiceRate(): number {
  if (typeof window === "undefined") return 1;
  const v = Number(window.localStorage.getItem(RATE_KEY));
  return Number.isFinite(v) && v >= 0.5 && v <= 2 ? v : 1;
}

export function saveVoiceRate(rate: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RATE_KEY, String(rate));
}

// 기본 성우는 "부끄"(tc-booqoo) — 처음 들어와도 진짜 성우 목소리로 시작한다.
const DEFAULT_VOICE_ID = "tc-booqoo";
export function loadSelectedVoiceId(): string {
  if (typeof window === "undefined") return DEFAULT_VOICE_ID;
  return window.localStorage.getItem(SELECTED_KEY) ?? DEFAULT_VOICE_ID;
}

export function saveSelectedVoiceId(id: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SELECTED_KEY, id);
}

export function loadCustomVoices(): CustomVoice[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_KEY);
    return raw ? (JSON.parse(raw) as CustomVoice[]) : [];
  } catch {
    return [];
  }
}

export function saveCustomVoices(voices: CustomVoice[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CUSTOM_KEY, JSON.stringify(voices));
}

export function findPreset(id: string): PresetVoice | null {
  return PRESET_VOICES.find((v) => v.id === id) ?? null;
}

/* ── 시스템 음성 배정 ──
 * 프리셋은 pitch·rate만 바꾸므로 기기에 한국어 음성이 하나뿐이면 "같은 사람"처럼
 * 들린다. 음성이 여러 개면(엣지 6개+, 안드로이드 2~4개) 프리셋마다 다른 음성을
 * 배정해 진짜 다른 목소리로 만든다. 곰아저씨는 남자 음성을 우선 찾는다.
 */

/** 이름으로 남자 음성을 추정한다 (Windows·엣지·안드로이드 음성 이름 기준). */
const MALE_VOICE_HINT = /injoon|hyunsu|gookmin|bongjin|minsu|male|-kod/i;

/**
 * 이 기기의 한국어 음성 목록. 품질 좋은 음성(엣지 "Natural")을 앞에 세운다 —
 * 프리셋 배정이 앞에서부터 도니 좋은 음성부터 쓰게 된다.
 * 주의: 크롬은 페이지 로드 직후 getVoices()가 빈 배열이다 — 미리 한 번 불러
 * 예열하고(warmUpVoices), voiceschanged 이벤트 후 다시 읽어야 채워진다.
 */
export function listKoreanVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  const quality = (v: SpeechSynthesisVoice) =>
    /natural/i.test(v.name) ? 2 : v.localService ? 1 : 0;
  return window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang?.toLowerCase().replace("_", "-").startsWith("ko"))
    .sort((a, b) => quality(b) - quality(a));
}

/** 음성 목록 로드를 트리거한다. 화면 마운트 시 한 번 불러두면 첫 재생부터 적용된다. */
export function warmUpVoices(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.getVoices();
}

/**
 * 프리셋에 얹을 시스템 음성. null이면 브라우저 기본 음성을 그대로 쓴다.
 * 주의: getVoices()는 페이지 로드 직후 빈 배열일 수 있어 말하는 시점마다 부른다.
 */
export function systemVoiceFor(presetId: string): SpeechSynthesisVoice | null {
  const voices = listKoreanVoices();
  if (voices.length === 0) return null;
  if (voices.length === 1) return voices[0];

  const males = voices.filter((v) => MALE_VOICE_HINT.test(v.name));
  const others = voices.filter((v) => !MALE_VOICE_HINT.test(v.name));

  if (presetId === "bear" && males.length > 0) return males[0];

  // 서로 다른 음성을 나눠 갖는 게 최우선 — 높낮이 변주는 그 위에 얹는 양념이다.
  const pool = others.length > 0 ? others : voices;
  const idx = Math.max(0, PRESET_VOICES.findIndex((v) => v.id === presetId));
  return pool[idx % pool.length];
}

/**
 * 프리셋의 실제 pitch. 한국어 음성이 프리셋 수보다 적으면 같은 음성을 나눠
 * 써야 하니 높낮이 차이를 과장한다 (곰 0.6→0.3, 삐약이 1.6→2.0).
 * 참고: 윈도우 크롬은 pitch 값을 아예 무시한다 — 거기서는 아래 effectiveRate의
 * 속도 과장이 유일한 구분 수단이다. 안드로이드·맥에서는 pitch가 먹는다.
 */
export function effectivePitch(preset: PresetVoice): number {
  const scarce = listKoreanVoices().length < PRESET_VOICES.length;
  if (!scarce) return preset.pitch;
  const stretched = (preset.pitch - 1) * 1.8 + 1;
  return Math.min(2, Math.max(0.1, stretched));
}

/**
 * 프리셋의 실제 rate. 한국어 음성이 프리셋 수보다 적으면 — 특히 윈도우 크롬은
 * 음성이 1~2개인 데다 pitch까지 무시해서 — 속도가 사실상 유일하게 확실히
 * 먹는 값이라 차이를 과장한다: 곰아저씨 0.64(느릿느릿) ~ 요정님 1.31(사뿐사뿐).
 */
export function effectiveRate(preset: PresetVoice, multiplier = 1): number {
  const scarce = listKoreanVoices().length < PRESET_VOICES.length;
  const spread = scarce ? 2.4 : 1;
  const r = (0.95 + (preset.rate - 0.95) * spread) * multiplier;
  return Math.min(2, Math.max(0.5, r));
}

/**
 * 프리셋 목소리로 말할 utterance를 만든다 — 설정 미리듣기와 책 읽어주기가
 * 같은 로직을 타야 "미리 들은 목소리 = 책 읽는 목소리"가 보장된다.
 * 핸들러(onboundary 등)는 호출한 쪽에서 붙인다.
 */
export function buildPresetUtterance(
  text: string,
  preset: PresetVoice,
  rateMultiplier = 1,
): SpeechSynthesisUtterance {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ko-KR";
  const sys = systemVoiceFor(preset.id);
  if (sys) u.voice = sys;
  u.pitch = effectivePitch(preset);
  u.rate = effectiveRate(preset, rateMultiplier);
  return u;
}

/* ── 녹음 파일 보관 (IndexedDB — localStorage는 오디오를 담기엔 작다) ── */

const DB_NAME = "voice-storybook";
const STORE = "voice-audio";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveVoiceAudio(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadVoiceAudio(id: string): Promise<Blob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as Blob) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteVoiceAudio(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ── 성우 음성 받기 (+캐시) ── */

/** 짧은 문자열 해시(djb2) — 캐시 키용. 암호학적일 필요 없다. */
function hashText(s: string): string {
  let h = 5381;
  for (const ch of s) h = ((h * 33) ^ ch.codePointAt(0)!) >>> 0;
  return h.toString(36);
}

/**
 * 성우 음성을 받아온다. 같은 (목소리, 문장)은 IndexedDB에 캐시해서
 * 두 번째부터는 크레딧이 나가지 않는다 — 아이들은 같은 책을 계속 반복해 듣는다.
 * 실패(크레딧 소진·오프라인·키 없음)는 그대로 던진다 — 부른 쪽이
 * 브라우저 목소리로 물러날지 정한다.
 */
export async function fetchTypecastAudio(
  tc: TypecastPreset,
  text: string,
  emotion?: string,
): Promise<Blob> {
  const cacheId = `tts:${tc.voiceId}:${emotion ?? "normal"}:${hashText(text)}`;
  const cached = await loadVoiceAudio(cacheId).catch(() => null);
  if (cached) return cached;

  const r = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voiceId: tc.voiceId, model: tc.model, emotion }),
  });
  if (!r.ok) {
    const data = (await r.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `성우 음성 실패 (HTTP ${r.status})`);
  }
  const blob = await r.blob();
  // 캐시 저장 실패는 무시한다 — 재생이 우선이다.
  saveVoiceAudio(cacheId, blob).catch(() => {});
  return blob;
}

/**
 * '내가 만든 동화'용 성우 음성 — Google Cloud TTS(무료 티어 월 100만 자).
 * 같은 (성우, 문장)은 IndexedDB에 캐시해 두 번째부터는 크레딧이 안 나간다.
 * 실패(키 없음·한도 초과·오프라인)는 그대로 던진다 — 부른 쪽이 브라우저 기계음으로 물러난다.
 */
export async function fetchGoogleAudio(voiceId: string, text: string): Promise<Blob> {
  const cacheId = `gtts:${voiceId}:${hashText(text)}`;
  const cached = await loadVoiceAudio(cacheId).catch(() => null);
  if (cached) return cached;

  const r = await fetch("/api/tts/google", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voiceId }),
  });
  if (!r.ok) {
    const data = (await r.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `구글 음성 실패 (HTTP ${r.status})`);
  }
  const blob = await r.blob();
  saveVoiceAudio(cacheId, blob).catch(() => {});
  return blob;
}

/**
 * 부모 목소리(ElevenLabs)로 낭독. 같은 (목소리, 문장)은 IndexedDB에 캐시해 두 번째부턴 0원.
 * 실패(키 없음·크레딧 소진·오프라인)는 그대로 던진다 — 부른 쪽이 기본 목소리로 물러난다.
 */
export async function fetchElevenAudio(voiceId: string, text: string): Promise<Blob> {
  const cacheId = `eleven:${voiceId}:${hashText(text)}`;
  const cached = await loadVoiceAudio(cacheId).catch(() => null);
  if (cached) return cached;

  const r = await fetch("/api/tts/eleven", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voiceId }),
  });
  if (!r.ok) {
    const d = (await r.json().catch(() => null)) as { error?: string } | null;
    throw new Error(d?.error ?? `부모 목소리 실패 (HTTP ${r.status})`);
  }
  const blob = await r.blob();
  saveVoiceAudio(cacheId, blob).catch(() => {});
  return blob;
}

/* ── 대사 연기 — 쪽 텍스트를 지문/대사로 나눠 감정을 입힌다 ── */

export type PageAudioSegment = {
  blob: Blob;
  /** 원문에서 이 조각이 차지하는 글자 범위 — 노래방 색칠 동기화용. */
  from: number;
  to: number;
};

/** 조각이 합성하기에 너무 짧은지 — Typecast는 아주 짧은 감탄문을 거부한다(실측). */
function tooShort(s: string): boolean {
  return s.replace(/[\s"“”…!?,.~—-]/g, "").length < 5;
}

/**
 * 따옴표로 묶인 대사와 지문을 나눈다.
 * 이어 붙이면 원문과 정확히 같아야 한다 (색칠 동기화가 글자 수로 돌기 때문).
 */
export function splitDialogue(text: string): { text: string; dialogue: boolean }[] {
  const parts = text.split(/("[^"]*"|“[^”]*”)/).filter((s) => s.length > 0);
  const segs = parts.map((s) => ({ text: s, dialogue: /^["“]/.test(s) }));

  // 짧은 조각은 앞 조각에 붙인다. 맨 앞이 짧으면 뒤 조각에 붙인다.
  const merged: { text: string; dialogue: boolean }[] = [];
  for (const s of segs) {
    const prev = merged[merged.length - 1];
    if (prev && tooShort(s.text)) {
      prev.text += s.text;
      continue;
    }
    merged.push({ ...s });
  }
  while (merged.length >= 2 && tooShort(merged[0].text)) {
    merged[1].text = merged[0].text + merged[1].text;
    merged.shift();
  }
  return merged;
}

/**
 * 대사의 감정을 내용으로 추정한다. 확신이 없으면 toneup(생기 있는 연기톤).
 * 잘못 짚어도 "감정이 들어간 낭독"이라는 목표는 지켜진다.
 */
export function guessEmotion(line: string): string {
  if (/으악|살려|엉엉|훌쩍|눈물|슬퍼|무서|가엾|흑흑|어떡해/.test(line)) return "sad";
  if (/잡아먹|안 돼|버럭|어흥|크르렁|날려 버리|호통|이놈|썩 /.test(line)) return "angry";
  if (/만세|신나|좋아|와아|우와|기뻐|히히|하하|최고|고마워/.test(line)) return "happy";
  return "toneup";
}

/**
 * 앱 안에서의 '실시간 성우 합성'을 켜고 끄는 스위치.
 *
 * false면 앱에서 책을 읽거나 성우를 바꿔도 Typecast를 호출하지 않는다 → 크레딧 0.
 * (딸린 나레이션 파일이나 브라우저 기계음으로 자동 대체된다.) 테스트 기간엔 꺼 둔다.
 * 미리 굽는 스크립트(서버의 /api/tts 직접 호출)는 이 스위치와 무관하게 동작한다.
 * 실서비스에서 '내가 만든 동화'를 진짜 성우로 읽어주려면 이 값을 true로 바꾼다.
 */
export const CLIENT_TTS_ENABLED = false;

/**
 * '내가 만든 동화'를 Google Cloud TTS로 실시간 낭독할지. 사장님이 Google TTS로
 * 가기로 정해서 켠다(true). 키(GOOGLE_TTS_API_KEY)가 없거나 한도를 넘으면 자동으로
 * 브라우저 기계음으로 물러나므로, 켜 둬도 크레딧이 새지 않는다(키 없으면 호출 실패 → 폴백).
 * 제공 동화(전래·세계명작)는 미리 구운 파일을 쓰므로 이 스위치와 무관하다.
 */
export const GOOGLE_TTS_ENABLED = true;

/**
 * 한 쪽을 지문/대사 조각으로 나눠 합성한다. 대사에는 감정 연기가 실린다.
 * 감정을 지원하지 않는 음성이면 그 조각만 기본톤으로 물러난다 — 재생은 끊기지 않는다.
 * 글자 수 총합은 통짜 합성과 같아 크레딧 비용도 같다.
 */
export async function fetchTypecastPageAudio(
  tc: TypecastPreset,
  text: string,
): Promise<PageAudioSegment[]> {
  // 실시간 합성이 꺼져 있으면 호출 자체를 막는다 → 호출한 쪽이 딸린 파일/기계음으로 대체.
  if (!CLIENT_TTS_ENABLED) throw new Error("client-tts-disabled");
  const segs = splitDialogue(text);

  // 감정을 입혀 합성하되, 그 음성이 감정을 거부하면 기본톤으로 한 번 더(재생은 안 끊김).
  const synthEmo = async (t: string, emotion: string): Promise<Blob> => {
    try {
      return await fetchTypecastAudio(tc, t, emotion);
    } catch {
      return await fetchTypecastAudio(tc, t);
    }
  };

  // 대사가 없어도 지문에 어울리는 감정을 살짝 입혀 밋밋하지 않게 한다.
  // (예전엔 감정 없이 통짜라, 대사 없는 쪽이 갑자기 무미건조하게 들렸다.)
  if (segs.length <= 1 || !segs.some((s) => s.dialogue)) {
    const blob = await synthEmo(text, guessEmotion(text));
    return [{ blob, from: 0, to: text.length }];
  }

  const out: PageAudioSegment[] = [];
  let pos = 0;
  for (const s of segs) {
    const from = pos;
    pos += s.text.length;
    // 대사든 지문이든 내용에 맞는 감정을 입힌다 — 지문은 대개 toneup(생기 있는 낭독),
    // 대사는 놀람·화남·기쁨 등. 이렇게 해야 페이지마다 톤이 끊기지 않는다.
    const blob = await synthEmo(s.text, guessEmotion(s.text));
    out.push({ blob, from, to: pos });
  }
  return out;
}
