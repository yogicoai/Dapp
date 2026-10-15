/**
 * 목소리 — 프리셋(캐릭터)과 커스텀(엄마·아빠 녹음).
 *
 * 프리셋: 브라우저 TTS(Web Speech)의 pitch·rate만 바꿔 캐릭터 느낌을 낸다.
 *   비용 0원으로 "목소리 고르는 재미"를 먼저 준다.
 * 커스텀: 지정 문장을 녹음해 기기에 보관한다(IndexedDB). 클로닝 벤더(Typecast)가
 *   붙으면 이 녹음이 그대로 클로닝 재료가 된다 — 그때까지 status는 "recorded".
 *   지정 문장만 녹음하는 이유: 유출돼도 무해한 내용이라 부모 불안을 구조로 푼다.
 */

import { acctKey, authedFetch } from "@/lib/supabase";
import {
  segmentTones,
  splitDialogue,
  type CastMember,
  type SpeakerTone,
} from "@/lib/speaker-tone";
// 대사/지문 쪼개기는 독립 모듈로 옮겼다 — 브라우저 것을 안 들고 있어야
// 낭독을 미리 굽는 스크립트에서도 같은 함수를 쓸 수 있다(두 벌이 되면 어긋난다).
export { splitDialogue } from "@/lib/speaker-tone";
import { breathForSpeech } from "@/lib/story-punctuation";
import { LIVE_READ_TEMPO, liveReadCacheId, liveReadFallbackId } from "@/lib/read-tempo";
import type { VoiceDirection, VoicePace } from "@/lib/types";

/** 합성 서버가 한 번에 받는 글자 수 — 셋 중 가장 작은 /api/tts 기준(google 800·eleven 1000). */
const TTS_MAX_CHARS = 500;

/**
 * 합성에 실제로 보낼 글 — 숨 쉴 자리에 쉼표를 더한다(story-punctuation.ts breathForSpeech).
 *
 * 합성기는 부호가 없는 자리에서 쉬지 않아 "끊임없이 읽는다"가 됐다(2026-09-29 사장님).
 * 화면 글은 그대로라 글자 색칠은 어긋나지 않는다.
 * **캐시 열쇠는 원문으로 둔다** — 열쇠를 바꾸면 이미 기기에 담긴 소리를 다시 합성해 크레딧이 나간다.
 * 쉼표 몇 개로 서버 한도를 넘기면 원문을 그대로 보낸다.
 */
function spokenText(text: string): string {
  const spoken = breathForSpeech(text);
  return spoken.length <= TTS_MAX_CHARS ? spoken : text;
}

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
  /**
   * 이 목소리가 실제로 낼 수 있는 감정. 안 적으면 일곱 가지를 다 낸다고 본다.
   *
   * 옛 모델(ssfm-v21)은 normal·happy·sad·angry 넷뿐이라, toneup 같은 걸 그대로
   * 보내면 합성이 거절당한다. 여기 적어 두면 굽는 쪽이 낼 수 있는 감정으로 바꿔 준다.
   */
  emotions?: string[];
  /**
   * 미리 굽는 동화(전래·세계명작)에서 이 성우에 거는 빠르기 보정(Typecast audio_tempo).
   *
   * 성우마다 타고난 말 빠르기가 달라서, 같은 글도 진서는 민정보다 25%쯤 빨리 읽는다
   * (2026-09-19 전 권 점검: 민정 나레이션 초당 4.5~5.0음절, 진서 6.0음절).
   * 아이가 듣기에는 민정 쪽이 기준이라 빠른 성우만 여기서 늦춘다. 같은 문장을
   * 기준 성우와 나란히 합성해 맞춘 값이다. 대사집 tempo·책의 voiceTempo 가 있으면 그게 앞선다.
   */
  bakeTempo?: number;
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
  { kind: "tc", id: "tc-ina", label: "이나", emoji: "🌼", voiceId: "tc_62686be9deec4c1bb7fd077c", model: "ssfm-v30", desc: "여자 · 다정한 목소리", sample: "이리 와, 이야기 들려줄게.", bakeTempo: 0.85 },
  { kind: "tc", id: "tc-jiyoon", label: "지윤", emoji: "☁️", voiceId: "tc_62296627a4ff5d1ee6bf4ecc", model: "ssfm-v30", desc: "여자 · 차분한 목소리", sample: "차분하게 읽어줄게." },
  { kind: "tc", id: "tc-jungsoon", label: "정순", emoji: "👵", voiceId: "tc_5ebea242728f5b00075e6211", model: "ssfm-v30", desc: "여자 · 정겨운 할머니", sample: "옛날 옛적에, 얘야." },
  { kind: "tc", id: "tc-jiyoung", label: "지영", emoji: "🌷", voiceId: "tc_5c789c34dabcfa0008b0a390", model: "ssfm-v30", desc: "여자 · 밝은 선생님", sample: "친구들, 이야기 들을 준비 됐나요?" },
  // 사장님 지정 추가 캐릭터(2026-07-31) — 세계명작 대표 성우용
  { kind: "tc", id: "tc-mongsil", label: "뭉실이", emoji: "🐑", voiceId: "tc_699d27e0e061695d6ed39bc6", model: "ssfm-v30", desc: "여자 청소년 · 몽실몽실 다정한 목소리", sample: "뭉실뭉실 포근한 이야기 들려줄게!" },
  { kind: "tc", id: "tc-hamchu", label: "햄쭈", emoji: "🐹", voiceId: "tc_632293ed2f894f2211e8c597", model: "ssfm-v30", desc: "여자 · 톡톡 튀는 귀여운 목소리", sample: "햄쭈랑 신나는 동화 여행 가자!" },
  { kind: "tc", id: "tc-arin", label: "아린이", emoji: "🧸", voiceId: "tc_67513c3cf30802da48949a14", model: "ssfm-v30", desc: "여자 · 밝고 사랑스러운 목소리", sample: "아린이가 재미있게 읽어줄게!" },
  { kind: "tc", id: "tc-gaeul", label: "가을", emoji: "🍂", voiceId: "tc_60f7a217279ffba711ce2958", model: "ssfm-v30", desc: "여자 · 차분하고 포근한 목소리", sample: "가을처럼 포근하게 들려줄게요." },
  // 사장님 지정(2026-08-27) — 타입캐스트에 용도가 "Audiobook/Storytelling"으로
  // 등록된 목소리다. 지문 읽기 전용으로 데려왔다.
  { kind: "tc", id: "tc-minjung", label: "민정", emoji: "📚", voiceId: "tc_6699eb0f10b8e361d6a9aba1", model: "ssfm-v30", desc: "여자 · 책 읽어 주는 목소리", sample: "옛날 옛적, 어느 마을에 살았답니다." },
  // 사장님이 늑대 후보로 지목(2026-08-27). 둘 다 중년 남자 · ssfm-v30.
  { kind: "tc", id: "tc-homun", label: "심호문", emoji: "🐺", voiceId: "tc_63622aaa4109052e8067e303", model: "ssfm-v30", desc: "남자 · 능청스럽고 낮은 목소리", sample: "흥, 그렇게는 안 되지." },
  { kind: "tc", id: "tc-shotgun", label: "샷건", emoji: "💥", voiceId: "tc_62df8e39067dcda7c2b34347", model: "ssfm-v30", desc: "남자 · 굵고 힘 있는 목소리", sample: "거기 있는 거 다 안다." },
  // 돼지 삼형제 형제 캐스팅(2026-08-27) — 여자아이 셋은 자매처럼 들려서 남자로 교체.
  { kind: "tc", id: "tc-dukgu", label: "덕구", emoji: "🐷", voiceId: "tc_618203826672d21ebf37748e", model: "ssfm-v30", desc: "남자 청소년 · 장난기 있는 형", sample: "집은 후딱 짓고 놀아야지!" },
  { kind: "tc", id: "tc-guri", label: "구리", emoji: "🌰", voiceId: "tc_6359e7ea258d1b6dc3abe6e6", model: "ssfm-v30", desc: "남자 · 넉살 좋은 목소리", sample: "이 정도면 됐지 뭐!" },
  // 미운오리새끼 기러기(2026-08-27 사장님 지정). 용도가 Audiobook/Storytelling.
  { kind: "tc", id: "tc-yubin", label: "유빈", emoji: "🪶", voiceId: "tc_64818789444a9ae3e2e9f89d", model: "ssfm-v30", desc: "여자 · 차분한 이야기 목소리", sample: "넌 참 이상하게 생겼구나. 어디서 왔니?" },
  // 빨간 모자 할머니(2026-08-27 사장님 지정). elder · Audiobook/Storytelling.
  { kind: "tc", id: "tc-juha", label: "주하", emoji: "🧶", voiceId: "tc_5d01a52563338e00072b8c9c", model: "ssfm-v30", desc: "여자 · 포근한 할머니", sample: "아이고, 우리 강아지 왔니?" },
  // 빨간 모자 사냥꾼 교체(2026-08-27 사장님 지정).
  { kind: "tc", id: "tc-babilon", label: "바빌론", emoji: "🪓", voiceId: "tc_677628030c63239147ab40c6", model: "ssfm-v30", desc: "남자 · 우렁찬 목소리", sample: "다시는 이 숲에 얼씬도 마라!" },
  // 벌거벗은 임금님의 임금님 — 사장님이 고른 성우 (2026-08-28)
  { kind: "tc", id: "tc-wangkwon", label: "왕권", emoji: "👑", voiceId: "tc_66a1ea9420b813b5c36197f1", model: "ssfm-v30", desc: "남자 · 위엄 있는 중년", sample: "오늘은 또 어떤 옷을 입어 볼까?" },
  { kind: "tc", id: "tc-jongdae", label: "종대", emoji: "🎩", voiceId: "tc_67e38d8c771b5511659c4534", model: "ssfm-v30", desc: "남자 · 점잖은 노년", sample: "오, 참으로 멋지구나!" },
  { kind: "tc", id: "tc-gunseok", label: "건석", emoji: "🧔", voiceId: "tc_6731b2e0855f351b98d30c48", model: "ssfm-v30", desc: "남자 · 듬직한 아빠", sample: "아빠가 재미있게 읽어줄게." },
  { kind: "tc", id: "tc-changsu", label: "창수", emoji: "⚡", voiceId: "tc_6059dad0b83880769a50502f", model: "ssfm-v30", desc: "남자 · 활기찬 형아", sample: "형아랑 신나는 이야기 가자!", bakeTempo: 0.83 },
  { kind: "tc", id: "tc-siwoo", label: "시우", emoji: "🧒", voiceId: "tc_6699eb3849dfac016c29444c", model: "ssfm-v30", desc: "남자 어린이 · 씩씩한 친구", sample: "나랑 같이 모험 떠나자!" },
  { kind: "tc", id: "tc-hajun", label: "하준", emoji: "🐯", voiceId: "tc_60db308484130840f23e6ca0", model: "ssfm-v30", desc: "남자 어린이 · 명랑한 친구", sample: "오늘 이야기 진짜 기대돼!" },
  { kind: "tc", id: "tc-yejoon", label: "예준", emoji: "🎮", voiceId: "tc_63edf3d68aab086d6b782a55", model: "ssfm-v30", desc: "남자 청소년 · 듬직한 형", sample: "형이 재미있게 읽어줄게!" },
  { kind: "tc", id: "tc-kwonil", label: "이야기 할아버지", emoji: "📖", voiceId: "tc_675a73eb789ff3ea6cc80235", model: "ssfm-v30", desc: "남자 · 옛날이야기 전문 할아버지", sample: "허허, 옛날 옛적 이야기를 들려주마." },
  /*
   * 도깨비·호랑이·늑대처럼 무섭고 굵은 배역용.
   *
   * 지금까지 남자 목소리가 건석(다정한 아빠)·창수(활달한 삼촌)·예준(친절한 형)·
   * 이야기 할아버지뿐이라, 놀부 박에서 나오는 도깨비를 맡길 목소리가 없었다.
   * 학철은 감정이 7종(속삭임·톤다운까지)이라 저음을 깔 수 있다.
   */
  { kind: "tc", id: "tc-hakchul", label: "학철", emoji: "👹", voiceId: "tc_63a3d9d14b235ddd6541a78e", model: "ssfm-v30", desc: "남자 · 굵고 묵직한 목소리", sample: "허허, 나는 도깨비다! 네 욕심을 벌하러 왔다!" },
  /*
   * 놀부처럼 얄밉고 심술궂은 어른 남자 배역용 둘.
   *
   * 놀부는 무서운 인물이 아니라 얄미운 인물이라, 도깨비(학철)만큼 묵직하면 안 되고
   * 흥부(건석)처럼 다정해도 안 된다. 그 사이를 메우려고 데려왔다.
   * 15쪽에서 뉘우치며 우는 대목이 있어 슬픔 연기가 되는 성우여야 한다(둘 다 7종).
   */
  { kind: "tc", id: "tc-sullock", label: "홍설록", emoji: "🎩", voiceId: "tc_63da42a2dbbf266ceb0b0fb2", model: "ssfm-v30", desc: "남자 · 능청스러운 어른", sample: "흥! 나는 이 마을 제일가는 부자란다!" },
  { kind: "tc", id: "tc-kijang", label: "김반장", emoji: "🧢", voiceId: "tc_63da4298fec1d339dd0f4e65", model: "ssfm-v30", desc: "남자 · 걸걸한 동네 아저씨", sample: "흥! 나는 이 마을 제일가는 부자란다!" },
  /*
   * 놀부 아내(형수)처럼 쌀쌀맞은 어른 여자 배역용.
   *
   * 여자 어른 목소리가 미소(포근한 엄마)·정순(정겨운 할머니)·이나(다정한)처럼
   * 전부 따뜻한 쪽뿐이라, 밥 얻으러 온 시동생을 주걱으로 때리는 형수를 맡길
   * 목소리가 없었다.
   */
  { kind: "tc", id: "tc-sookhee", label: "숙희", emoji: "🥢", voiceId: "tc_61c2f70c343884babeed840b", model: "ssfm-v30", desc: "여자 · 쌀쌀맞고 야무진 목소리", sample: "흥, 밥 한 술도 아깝지." },
  /*
   * 흥부 아내처럼 고생하는 살림꾼 어른 여자 배역용.
   *
   * 미소(포근한 엄마)는 너무 다정해서 사흘 굶은 절박함이 안 들리고,
   * 숙희(쌀쌀맞음)는 형수 자리다. 그 사이의 담담하고 단단한 목소리가 없었다.
   */
  { kind: "tc", id: "tc-najin", label: "나진", emoji: "🧺", voiceId: "tc_5ebea185728f5b00075e61e3", model: "ssfm-v30", desc: "여자 · 담담하고 단단한 어른", sample: "여보, 아이들이 배가 고프대요." },
  /*
   * 거북이·심판처럼 느긋하고 묵직한 배역용.
   *
   * 토끼(햄쭈)가 톡톡 튀는 목소리라, 거북이가 비슷한 결이면 둘이 구분되지 않는다.
   * 달리기 시합 이야기에서는 두 목소리의 **속도감이 반대**여야 한다.
   */
  { kind: "tc", id: "tc-monggun", label: "몽군", emoji: "🐢", voiceId: "tc_6731b32e075b04a9446441a0", model: "ssfm-v30", desc: "남자 · 느긋하고 단단한 목소리", sample: "괜찮아. 나는 나의 걸음으로 가면 돼." },
  { kind: "tc", id: "tc-goat", label: "김고트", emoji: "🦉", voiceId: "tc_6747f7c4b4470b54ab8a06bc", model: "ssfm-v30", desc: "남자 · 크고 또렷한 목소리", sample: "자, 준비… 시작!" },
  /*
   * 콩쥐 팥쥐에서 사장님이 직접 고르신 둘.
   * 티안 — 젊은 원님. 여태 남자 어른이 학철·홍설록·김반장뿐이라 다 나이 든 쪽이었다.
   * 가희 — 팥쥐. 숙희(새어머니 쪽)보다 젊고 앙칼져야 자매로 갈린다.
   */
  { kind: "tc", id: "tc-tian", label: "티안", emoji: "🎎", voiceId: "tc_676cda634571635588f87804", model: "ssfm-v30", desc: "남자 · 젊고 반듯한 목소리", sample: "이 꽃신의 주인을 꼭 찾아내야겠다." },
  // 걸리버 여행기 1·2의 걸리버 — 강일(2026-09-18, Typecast API 이름 Kangil).
  { kind: "tc", id: "tc-kangil", label: "강일", emoji: "⛵", voiceId: "tc_68d4b115f0486108a7eefb37", model: "ssfm-v30", desc: "남자 · 걸리버의 모험을 들려주는 목소리", sample: "얘들아, 안녕? 내 이름은 걸리버란다." },
  // 우렁각시 캐스팅(2026-09-19 사장님 지정) — 나레이션 진서(Typecast 이름 Jinseo) · 우렁각시 고바야시 미우(Miu Kobayashi).
  // 미우는 일본어 목록의 성우지만 합성은 늘 language "kor" 로 보내므로 한국어로 읽는다.
  { kind: "tc", id: "tc-jinseo", label: "진서", emoji: "🐚", voiceId: "tc_65bb3a1976b69213594357fc", model: "ssfm-v30", desc: "여자 · 차분하게 들려주는 낭독 목소리", sample: "옛날 옛날, 어느 마을에 부지런한 농부가 있었어요.", bakeTempo: 0.8 },
  { kind: "tc", id: "tc-miu", label: "고바야시 미우", emoji: "🌸", voiceId: "tc_68d49c1e02c83f1fd4cdeaae", model: "ssfm-v30", desc: "여자 · 맑고 고운 목소리", sample: "저는 누구의 것도 아닙니다." },
  // 방귀 며느리 캐스팅(2026-09-19 사장님 지정) — 아들 서준(Seojoon) · 며느리 지우(Jiwoo). 봉 영감 종대 · 도둑 병훈 · 나레이션 진서.
  { kind: "tc", id: "tc-seojoon", label: "서준", emoji: "🌰", voiceId: "tc_63aaec04428dd87af3757d72", model: "ssfm-v30", desc: "남자 · 서글서글한 젊은 목소리", sample: "에이, 그런 거야 참지 말고 시원하게 뀌면 되지!", bakeTempo: 0.83 },
  { kind: "tc", id: "tc-jiwoo", label: "지우", emoji: "🍐", voiceId: "tc_5ebea14e433bd200073e0dce", model: "ssfm-v30", desc: "여자 · 싹싹하고 야무진 목소리", sample: "저한테 맡기세요." },
  // 토끼의 재판 재캐스팅(2026-09-20 사장님 지정) — 나그네 대진(Daejin) · 나무 승재(Seungjae).
  { kind: "tc", id: "tc-daejin", label: "대진", emoji: "🎒", voiceId: "tc_6a0e85a97f7750959b970d5d", model: "ssfm-v30", desc: "남자 · 푸근한 중년 목소리", sample: "호랑이님, 제가 구해 드렸잖아요!" },
  { kind: "tc", id: "tc-seungjae", label: "승재", emoji: "🌳", voiceId: "tc_67919fb54fd00e0217d2cff0", model: "ssfm-v30", desc: "남자 · 또박또박 반듯한 목소리", sample: "사람들은 우리 그늘에서 쉬고도 가지를 꺾어 가지." },
  // 호랑이와 곶감 소도둑(2026-09-20 사장님 지정, Typecast 이름 MC Kong).
  { kind: "tc", id: "tc-mckong", label: "MC콩", emoji: "🫘", voiceId: "tc_623145ec8d2f689cc9bad6d5", model: "ssfm-v30", desc: "남자 · 능글맞은 중년 목소리", sample: "어어? 이게 무슨 소가 이렇게 빨라!" },
  // 도깨비 감투 캐스팅(2026-09-19 사장님 지정) — 선비 태우 · 아내 애란 · 도깨비 진혁 · 마을 사람 민주 · 나레이션 혜민.
  { kind: "tc", id: "tc-taewoo", label: "태우", emoji: "📜", voiceId: "tc_6800a387534948f191cc952b", model: "ssfm-v30", desc: "남자 · 반듯한 젊은 목소리", sample: "이 감투만 쓰면 아무도 나를 못 본단 말이지?" },
  { kind: "tc", id: "tc-aeran", label: "애란", emoji: "🧺", voiceId: "tc_5d01a52c63338e00072b8c9f", model: "ssfm-v30", desc: "여자 · 차분한 어른 목소리", sample: "여보, 그 감투는 어디서 난 거예요?" },
  { kind: "tc", id: "tc-jinhyuk", label: "진혁", emoji: "👹", voiceId: "tc_5c3c52ca5827e00008dd7f36", model: "ssfm-v30", desc: "남자 · 또렷한 젊은 목소리", sample: "내 감투 어디 갔지?" },
  { kind: "tc", id: "tc-minju", label: "민주", emoji: "🏘️", voiceId: "tc_6731b36bd944a485bc4070fd", model: "ssfm-v30", desc: "여자 · 생기 있는 젊은 목소리", sample: "어머, 내 떡이 어디 갔지?" },
  { kind: "tc", id: "tc-hyemin", label: "혜민", emoji: "🎐", voiceId: "tc_667ce80314cb3a612d6959e8", model: "ssfm-v30", desc: "여자 · 산뜻하게 들려주는 목소리", sample: "옛날 어느 마을에 가난한 선비가 살았어요.", bakeTempo: 0.85 },
  /* 한결 — 사장님이 Typecast 목록에서 고른 성우(2026-09-04). 금도끼 나무꾼으로 잠깐 썼다가 희준으로 교체. */
  { kind: "tc", id: "tc-hangyeol", label: "한결", emoji: "🪓", voiceId: "tc_677f2aa4a854ddffa0ebda89", model: "ssfm-v30", desc: "남자 · 젊고 씩씩한 목소리", sample: "오늘도 부지런히 나무를 해야지!" },
  /* 희준 — 금도끼 은도끼의 나무꾼(2026-09-04 사장님 캐스팅, 한결 대신). */
  { kind: "tc", id: "tc-heejoon", label: "희준", emoji: "🌲", voiceId: "tc_6426f7d00e18c1c9fede42d0", model: "ssfm-v30", desc: "남자 · 맑고 젊은 목소리", sample: "어머니, 저는 도끼 한 자루면 넉넉해요.", bakeTempo: 0.88 },
  /*
   * 태지 — 토끼와 거북이의 거북이. 몽군(어른)에서 아이 목소리로 바꾼 자리다.
   * 느긋함을 나이로 내지 않고 또박또박한 아이 말투로 낸다.
   */
  /* 호선 — 금도끼 은도끼 나레이션. 건석(듬직한 아빠)보다 담백해서 옛이야기 지문에 맞는다. */
  { kind: "tc", id: "tc-hosun", label: "호선", emoji: "🪓", voiceId: "tc_65a0e1eb23a607b9906c0154", model: "ssfm-v30", desc: "남자 · 담백하고 반듯한 목소리", sample: "옛날 어느 산골에 부지런한 나무꾼이 살았어요." },
  { kind: "tc", id: "tc-taeji", label: "태지", emoji: "🐢", voiceId: "tc_660645fb8db3e2c06ff7070b", model: "ssfm-v30", desc: "남자 어린이 · 또박또박 단단한 목소리", sample: "괜찮아. 나는 나의 걸음으로 가면 돼." },
  { kind: "tc", id: "tc-gahee", label: "가희", emoji: "💅", voiceId: "tc_624ccc04adcd568510764d3f", model: "ssfm-v30", desc: "여자 · 새침하고 앙칼진 목소리", sample: "언니는 집이나 지켜. 잔치는 우리끼리 갈 거야!", bakeTempo: 0.88 },
  // 양치기 소년 · 소년 역 (2026-08-31 사장님이 voice id를 직접 주심).
  // 2026-09-21: 소리가 깨진다는 제보로 Typecast 목록을 다시 보니 이 목소리에 ssfm-v30 이 나와 있었다.
  // 옛 v21 로 굽고 있던 것이 원인으로 보인다 — 최신 모델로 올리고 감정 제한도 푼다(7개 전부 된다).
  { kind: "tc", id: "tc-toby", label: "토비", emoji: "🐑", voiceId: "tc_6080369d3211aa112ab131db", model: "ssfm-v30", desc: "남자 어린이 · 맑고 또렷한 목소리", sample: "늑대다! 늑대가 나타났어요!" },
  // 흥부와 놀부 · 놀부 역 (2026-09-01 사장님이 캐스팅 보드에서 지정).
  { kind: "tc", id: "tc-byunghun", label: "병훈", emoji: "🌾", voiceId: "tc_694395d43f2c8d9d43e9a897", model: "ssfm-v30", desc: "남자 목소리", sample: "이 집도 논밭도 다 내 거야. 당장 나가!" },
  // 혹부리 영감 캐스팅 (2026-09-01 사장님 지정).
  { kind: "tc", id: "tc-changbae", label: "창배", emoji: "🎵", voiceId: "tc_60ad08c829e878c3c7d73965", model: "ssfm-v30", desc: "남자 목소리", sample: "같이 나누면 기쁨이 두 배가 된다오." },
  { kind: "tc", id: "tc-younggil", label: "영길", emoji: "🎩", voiceId: "tc_5ebea13564afaf00087fc2e7", model: "ssfm-v30", desc: "남자 목소리", sample: "옳거니! 나도 혹을 팔아서 부자가 되어야지!" },
  // 신데렐라 · 신하 역 (2026-10-12 사장님이 검토대 배역 탭에서 고름, Typecast 이름 Han Taesung Caster).
  { kind: "tc", id: "tc-taesung", label: "한태성", emoji: "📯", voiceId: "tc_66f4ecd1e386a91199bb0bf1", model: "ssfm-v30", desc: "남자 · 힘차게 알리는 캐스터 목소리", sample: "왕자님의 무도회에 온 나라 아가씨를 초대합니다!" },
  // 미운오리새끼 · 백조 역 (2026-10-14 사장님이 검토대 배역 탭에서 고름, Typecast 이름 Seolhwa).
  { kind: "tc", id: "tc-seolhwa", label: "설화", emoji: "🦢", voiceId: "tc_6731b307df12333201d12b94", model: "ssfm-v30", desc: "여자 · 젊은 어른 목소리", sample: "어서 와! 우리랑 같이 헤엄칠래?" },
  // 빨간 모자 · 늑대 역 (2026-10-14 사장님이 검토대 배역 탭에서 고름, Typecast 이름 Hades — 표시는 남자 중년·게임용).
  { kind: "tc", id: "tc-hades", label: "하데스", emoji: "🌑", voiceId: "tc_6a867e6bd49b8f6a07db59da", model: "ssfm-v30", desc: "남자 · 중년 목소리", sample: "할머니, 나야. 빨간 모자야. 문 좀 열어 줘요." },
  // 브레멘 음악대 · 고양이 역 (2026-10-14 사장님이 검토대 배역 탭에서 고름, Typecast 이름 Lala — 표시는 여자 젊은 어른).
  { kind: "tc", id: "tc-lala", label: "라라", emoji: "🐈", voiceId: "tc_61f084d860b9b6b40388f868", model: "ssfm-v30", desc: "여자 · 젊은 어른 목소리", sample: "나쁜 도둑들이야. 우리가 쫓아내자!" },
  // 신데렐라 · 새어머니 역 (2026-10-14 사장님 채팅 "새어머님 조여사로 변경", Typecast 이름 Lady Cho — 표시는 여자 중년).
  { kind: "tc", id: "tc-ladycho", label: "조 여사", emoji: "👒", voiceId: "tc_602bd483b1837361b08c1ab6", model: "ssfm-v30", desc: "여자 · 중년 목소리", sample: "흥, 넌 할 일이 산더미잖니!" },
  // 잭과 콩나무 · 거인 아내 역 (2026-10-15 사장님 채팅 "거인아내 국희로 변경할게", Typecast 이름 Kukhee — 표시는 여자 중년).
  { kind: "tc", id: "tc-kukhee", label: "국희", emoji: "🍲", voiceId: "tc_5c789c31dabcfa0008b0a38c", model: "ssfm-v30", desc: "여자 · 중년 목소리", sample: "얘야, 여기는 거인의 성이란다. 우리 남편이 오면 큰일 나!" },
  // 헨젤과 그레텔 · 마녀 역 (2026-10-15 사장님 채팅 "마녀는 마녀 사브리나로 변경해줘", Typecast 이름 Sabrina the Witch — 표시는 여자 중년).
  { kind: "tc", id: "tc-sabrina", label: "마녀 사브리나", emoji: "🧙", voiceId: "tc_634f8ec12e351d8a3d548e61", model: "ssfm-v30", desc: "여자 · 중년 마녀 목소리", sample: "배가 고팠구나. 어서 들어오렴. 따뜻한 수프가 있단다." },
];

/**
 * 동화 만들기의 '읽어줄 성우'에 보여 줄 목록 — 이 순서대로 (사장님 지시, 2026-08-28).
 *
 * TYPECAST_VOICES에는 배역용 성우(늑대·도깨비·새어머니…)까지 40명 가까이 들어 있어
 * 나레이션을 고르는 화면에 다 보이면 부모가 못 고른다. 나레이션에 어울리는 것만 남기고
 * 나머지는 숨긴다 — 배역 캐스팅(제공 책)에는 그대로 쓴다.
 */
export const NARRATOR_VOICE_IDS = [
  "tc-booqoo", "tc-sua", "tc-chungah", "tc-mongsil", "tc-hamchu", "tc-arin",
  "tc-minjung", "tc-gaeul", "tc-siwoo", "tc-kwonil", "tc-tian", "tc-hosun",
  "tc-taeji", "tc-jungsoon", "tc-gunseok", "tc-jiyoung",
] as const;

export const NARRATOR_PRESETS: TypecastPreset[] = NARRATOR_VOICE_IDS.map((id) => {
  const v = TYPECAST_VOICES.find((x) => x.id === id);
  if (!v) throw new Error(`NARRATOR_VOICE_IDS에 없는 성우: ${id}`);
  return v;
});

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

/**
 * 클로닝용 지정 문장 두 개. 같은 문장을 반복하지 않고 서로 다른 발음·받침·문장
 * 길이를 담되, 둘 다 부모가 아이에게 읽어주는 따뜻한 톤을 유지하게 구성했다.
 */
export const RECORDING_SCRIPTS = [
  "옛날 옛적, 깊은 숲속에 작은 집이 한 채 있었어요. " +
    "반짝이는 별들이 지붕 위에서 춤을 추고, 달님이 창문을 살며시 비추었지요. " +
    "아침이 되자 파랑새가 포르르 날아와 노래하고, 시냇물은 졸졸졸 즐겁게 흘러갔어요. " +
    "오늘은 어떤 신나는 일이 생길까? " +
    "아이는 두근두근 설레는 마음으로 문을 활짝 열었답니다. " +
    "자, 이제 우리 함께 재미있는 이야기 속으로 떠나 볼까요?",
  "숲길 끝에서 아이는 작고 빨간 보물 상자를 발견했어요. " +
    "정말 이 안에 별빛 열쇠가 들어 있을까? 조심조심 뚜껑을 열자, 와, 눈부신 무지개가 피어났어요! " +
    "걱정하지 마. 천천히 한 걸음씩 가면 꼭 해낼 수 있단다. " +
    "꽃잎 여섯 장과 파란 책, 동그란 돌멩이 세 개를 가방에 넣고 힘차게 출발했어요. " +
    "바람아, 구름아, 우리와 함께 신나는 모험을 시작해 볼래?",
] as const;

const SELECTED_KEY = "voice-storybook:voice";
const CUSTOM_KEY = "voice-storybook:custom-voices";
const RATE_KEY = "voice-storybook:voice-rate";

/**
 * 읽기 속도 배율 — 프리셋 rate에 곱한다.
 * 편한 속도가 아이마다 달라서(너무 느리다는 집이 있다) 전역 설정으로 둔다.
 */
export const VOICE_RATES = [
  { value: 0.8, label: "느리게" },
  { value: 0.9, label: "조금 느리게" },
  { value: 1.0, label: "보통" },
  { value: 1.2, label: "빠르게" },
] as const;

/**
 * 기본 배속은 원본 음성 속도인 1.0이다. 더 천천히 듣고 싶은 사용자는 0.8/0.9를
 * 직접 고를 수 있으며, 선택한 값은 계정별로 그대로 저장한다.
 * 음높이는 applyPlaybackRate가 보존하므로 속도를 바꿔도 목소리가 왜곡되지 않는다.
 */
export const DEFAULT_VOICE_RATE = 1;

export function loadVoiceRate(): number {
  if (typeof window === "undefined") return DEFAULT_VOICE_RATE;
  const v = Number(window.localStorage.getItem(acctKey(RATE_KEY)));
  return Number.isFinite(v) && v >= 0.5 && v <= 2 ? v : DEFAULT_VOICE_RATE;
}

export function saveVoiceRate(rate: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(acctKey(RATE_KEY), String(rate));
}

/**
 * 재생 속도를 바꾸되 목소리 음높이는 보존한다 — 속도로 인해 성우·부모 목소리가
 * 딴사람처럼 들리는 왜곡을 막는다. 구형 사파리/웹킷은 접두사 속성을 써야 해서 함께 켠다.
 * 오디오 속도를 바꾸는 곳은 전부 이 함수를 거치게 한다.
 */
export function applyPlaybackRate(el: HTMLMediaElement, rate: number, shiftPitch = false): void {
  // 기기가 감당하는 범위를 벗어나면 소리가 깨진다. 읽기 속도 설정과 배역 톤이
  // 곱해지므로 여기서 한 번 조인다(예: 느리게 설정 + 할머니 톤).
  el.playbackRate = Math.min(2, Math.max(0.5, rate));
  /*
   * 기본은 '속도를 바꿔도 음높이는 그대로'다 — 부모 목소리가 왜곡되면 안 되니까.
   *
   * 배역 대사에서만 이걸 끈다. 그래야 느려진 할머니 대사가 낮게도 들린다.
   * Typecast API에는 음높이 조절이 없어서, 이게 배역을 목소리로 만드는 유일한 길이다.
   */
  const preserve = !shiftPitch;
  el.preservesPitch = preserve;
  const legacy = el as unknown as {
    mozPreservesPitch?: boolean;
    webkitPreservesPitch?: boolean;
  };
  legacy.mozPreservesPitch = preserve;
  legacy.webkitPreservesPitch = preserve;
}

// 기본 성우는 "부끄"(tc-booqoo) — 처음 들어와도 진짜 성우 목소리로 시작한다.
const DEFAULT_VOICE_ID = "tc-booqoo";
export function loadSelectedVoiceId(): string {
  if (typeof window === "undefined") return DEFAULT_VOICE_ID;
  return window.localStorage.getItem(acctKey(SELECTED_KEY)) ?? DEFAULT_VOICE_ID;
}

export function saveSelectedVoiceId(id: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(acctKey(SELECTED_KEY), id);
}

/**
 * 엄마·아빠 녹음 목록 — 계정(owner=uid)별로 분리 저장한다(2026-07-31 버그 수정).
 * 이전엔 기기 공용 키라 같은 기기에서 다른 아이디(마스터 등)로 로그인하면 남의
 * 녹음이 그대로 보였다. 옛 공용 키는 소유자를 알 수 없어 이관하지 않고 지운다 —
 * 완성된 클론은 계정(Supabase voice_clones)에 있어 로그인만 하면 되살아난다.
 */
export function loadCustomVoices(owner: string | null): CustomVoice[] {
  if (typeof window === "undefined" || !owner) return [];
  window.localStorage.removeItem(CUSTOM_KEY); // 옛 기기 공용 키 정리
  try {
    const raw = window.localStorage.getItem(`${CUSTOM_KEY}:${owner}`);
    return raw ? (JSON.parse(raw) as CustomVoice[]) : [];
  } catch {
    return [];
  }
}

export function saveCustomVoices(voices: CustomVoice[], owner: string | null): void {
  if (typeof window === "undefined" || !owner) return;
  window.localStorage.setItem(`${CUSTOM_KEY}:${owner}`, JSON.stringify(voices));
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

// 다음 쪽 미리 받기와 실제 재생이 동시에 같은 음성을 요청해도 TTS 호출은 한 번만 한다.
// IndexedDB 저장이 끝날 때까지 Promise를 공유해 저장 직전의 중복 요청도 막는다.
const pendingVoiceAudio = new Map<string, Promise<Blob>>();

/**
 * @param fallbackId 새 열쇠에 소리가 없을 때 대신 틀어도 되는 옛 열쇠(있으면). 거기 담긴 소리는
 *                   새 열쇠로 옮겨 담지 않는다 — 옮기면 '새 빠르기로 합성한 소리'인 척하게 된다.
 */
async function fetchCachedVoiceAudio(
  cacheId: string,
  create: () => Promise<Blob>,
  fallbackId: string | null = null,
): Promise<Blob> {
  const cached = await loadVoiceAudio(cacheId).catch(() => null);
  if (cached) return cached;
  if (fallbackId) {
    const old = await loadVoiceAudio(fallbackId).catch(() => null);
    if (old) return old;
  }

  const pending = pendingVoiceAudio.get(cacheId);
  if (pending) return pending;

  const request = create()
    .then(async (blob) => {
      // 캐시 저장 실패는 재생을 막지 않되, 성공 시에는 저장 완료까지 기다린다.
      await saveVoiceAudio(cacheId, blob).catch(() => {});
      return blob;
    })
    .finally(() => {
      pendingVoiceAudio.delete(cacheId);
    });

  pendingVoiceAudio.set(cacheId, request);
  return request;
}

/**
 * 성우 음성을 받아온다. 같은 (목소리, 문장)은 IndexedDB에 캐시해서
 * 두 번째부터는 크레딧이 나가지 않는다 — 아이들은 같은 책을 계속 반복해 듣는다.
 * 실패(크레딧 소진·오프라인·키 없음)는 그대로 던진다 — 부른 쪽이
 * 브라우저 목소리로 물러날지 정한다.
 *
 * 빠르기는 LIVE_READ_TEMPO(read-tempo.ts)로 조금 늦춰 합성한다 — 만든 동화가 구운 책보다
 * 빨리 읽혔다(2026-09-30 사장님). 서버(/api/tts)는 0.5~2 사이 tempo 를 이미 받는다.
 * 미리 굽기(prewarmBookAudio)·다음 쪽 미리 받기도 모두 이 함수를 거쳐 캐시 열쇠가 맞는다.
 *
 * 이미 기기에 본래 속도로 담긴 문장은 그 소리를 그대로 튼다(liveReadFallbackId) — 다시
 * 합성하지 않는다. 빠르기를 바꿨다고 이미 들은 책을 모두 다시 사면 크레딧이 한꺼번에 나간다.
 */
export async function fetchTypecastAudio(
  tc: TypecastPreset,
  text: string,
  emotion?: string,
  intensity?: number,
  tempo: number = LIVE_READ_TEMPO,
): Promise<Blob> {
  /*
   * 담담하게 읽는 줄에는 세기를 아예 안 보낸다.
   *
   * 미리 굽는 전래동화는 normal 이면 intensity 를 빼고 부른다. 그런데 만든 동화의
   * 실시간 낭독만 normal 인데도 0.5를 늘 함께 보내고 있었다 — 같은 민정인데 부르는
   * 방법이 달라, 지문이 원래 음색보다 높고 어리게 들렸다(사장님 제보).
   * 감정을 거는 대사에만 세기를 준다.
   */
  const plain = !emotion || emotion === "normal";
  const safeIntensity = plain ? undefined : Math.min(0.65, Math.max(0.3, intensity ?? 0.5));
  // 기존의 강한 연기 캐시와 분리한다. 새 낭독은 한 번만 합성된 뒤 다시 캐시된다.
  // 새로 합성한 소리는 빠르기가 든 열쇠에 담고, 옛 열쇠(빠르기 1)에 이미 담긴 소리는 그대로 튼다(read-tempo.ts).
  const key = { voiceId: tc.voiceId, emotion, intensity: safeIntensity, tempo, textHash: hashText(text) };
  const cacheId = liveReadCacheId(key);
  return fetchCachedVoiceAudio(cacheId, async () => {
    const r = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: spokenText(text),
        voiceId: tc.voiceId,
        model: tc.model,
        emotion,
        intensity: safeIntensity,
        // 1이면 보내지 않는다 — 서버도 1은 audio_tempo 를 빼고 부른다(typecast.ts).
        ...(tempo !== 1 ? { tempo } : {}),
      }),
    });
    if (!r.ok) {
      const data = (await r.json().catch(() => null)) as { error?: string } | null;
      throw new Error(data?.error ?? `성우 음성 실패 (HTTP ${r.status})`);
    }
    return r.blob();
  }, liveReadFallbackId(key));
}

/**
 * '내가 만든 동화'용 성우 음성 — Google Cloud TTS(무료 티어 월 100만 자).
 * 같은 (성우, 문장)은 IndexedDB에 캐시해 두 번째부터는 크레딧이 안 나간다.
 * 실패(키 없음·한도 초과·오프라인)는 그대로 던진다 — 부른 쪽이 브라우저 기계음으로 물러난다.
 */
export async function fetchGoogleAudio(voiceId: string, text: string): Promise<Blob> {
  const cacheId = `gtts:${voiceId}:${hashText(text)}`;
  return fetchCachedVoiceAudio(cacheId, async () => {
    const r = await fetch("/api/tts/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: spokenText(text), voiceId }),
    });
    if (!r.ok) {
      const data = (await r.json().catch(() => null)) as { error?: string } | null;
      throw new Error(data?.error ?? `구글 음성 실패 (HTTP ${r.status})`);
    }
    return r.blob();
  });
}

/**
 * 부모 목소리(ElevenLabs)로 낭독. 같은 (목소리, 문장)은 IndexedDB에 캐시해 두 번째부턴 0원.
 * 실패(키 없음·크레딧 소진·오프라인)는 그대로 던진다 — 부른 쪽이 기본 목소리로 물러난다.
 */
export async function fetchElevenAudio(voiceId: string, text: string): Promise<Blob> {
  const cacheId = `eleven:${voiceId}:${hashText(text)}`;
  return fetchCachedVoiceAudio(cacheId, async () => {
    const r = await fetch("/api/tts/eleven", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: spokenText(text), voiceId }),
    });
    if (!r.ok) {
      const d = (await r.json().catch(() => null)) as { error?: string } | null;
      throw new Error(d?.error ?? `부모 목소리 실패 (HTTP ${r.status})`);
    }
    return r.blob();
  });
}

/**
 * 부모/커스텀 목소리(Typecast 퀵 클론 uc_ id)로 낭독. /api/tts(Typecast)로 그 목소리 합성.
 * 같은 (목소리, 문장)은 IndexedDB에 캐시해 두 번째부턴 크레딧이 안 나간다.
 */
export async function fetchTypecastVoiceAudio(voiceId: string, text: string): Promise<Blob> {
  const cacheId = `tcvoice:${voiceId}:${hashText(text)}`;
  return fetchCachedVoiceAudio(cacheId, async () => {
    // 복제된 부모 목소리는 주인만 쓸 수 있다 — 서버가 확인하도록 토큰을 함께 보낸다.
    const r = await authedFetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: spokenText(text), voiceId, model: "ssfm-v30" }),
    });
    if (!r.ok) {
      const d = (await r.json().catch(() => null)) as { error?: string } | null;
      throw new Error(d?.error ?? `부모 목소리 실패 (HTTP ${r.status})`);
    }
    return r.blob();
  });
}

/* ── 대사 연기 — 쪽 텍스트를 지문/대사로 나눠 감정을 입힌다 ── */

export type PageAudioSegment = {
  blob: Blob;
  /** 원문에서 이 조각이 차지하는 글자 범위 — 노래방 색칠 동기화용. */
  from: number;
  to: number;
};

/** 조각이 합성하기에 너무 짧은지 — Typecast는 아주 짧은 감탄문을 거부한다(실측). */
/**
 * 대사의 감정을 내용으로 추정한다. 확신이 없으면 원래 음색을 유지한다.
 */
export function guessEmotion(line: string): string {
  if (/으악|살려|엉엉|훌쩍|눈물|슬퍼|무서|가엾|흑흑|어떡해/.test(line)) return "sad";
  if (/잡아먹|안 돼|버럭|어흥|크르렁|날려 버리|호통|이놈|썩 /.test(line)) return "angry";
  if (/만세|신나|좋아|와아|우와|기뻐|히히|하하|최고|고마워/.test(line)) return "happy";
  return "normal";
}

/** 지문은 원래 음색, 대사만 낮은 강도의 명확한 감정을 사용한다. */
export function storyReadingEmotion(emotion: string | undefined, dialogue: boolean): string {
  if (!dialogue || !emotion || emotion === "toneup") return "normal";
  return emotion;
}

/**
 * 앱 안에서의 '실시간 성우 합성'을 켜고 끄는 스위치.
 *
 * true(현재, 2026-07-31 Typecast API 라이트 결제 후 켬)면 실시간 낭독이 전부
 * Typecast(감정 연기)로 간다 — 글자 수만큼 크레딧이 나가고, 같은 문장은 기기 캐시로 0원.
 * 과금 폭주는 서버(typecast.ts)의 월 19만 자 자동 잠금이 막는다.
 * false로 내리면 Typecast 호출이 전부 멈추고 구글(GOOGLE_TTS_ENABLED)·딸린 파일·
 * 브라우저 기계음 순으로 물러난다 → 크레딧 0.
 */
export const CLIENT_TTS_ENABLED = true;

/**
 * 구글 TTS '폴백' 스위치 — CLIENT_TTS_ENABLED(Typecast)가 꺼져 있을 때만 실제로 쓰인다.
 * 지금은 Typecast가 기본 엔진이라 이 분기는 죽어 있고(감정 없음·무료), Typecast를 끄면
 * 창작 동화 낭독이 이쪽(무료 월 100만 자)으로 내려온다. 키 없으면 브라우저 기계음으로 폴백.
 */
export const GOOGLE_TTS_ENABLED = true;

/* ── 동시 합성 제한 ──
 * Typecast 라이트 플랜은 동시 요청 5개까지다(구독 응답 concurrency_limit=5).
 * 한 쪽을 조각내 병렬로 합성하면서 다음 쪽 미리받기까지 겹치면 그 한도를 넘겨
 * 실패한다. 그래서 앱 전체에서 동시에 4개까지만 나가도록 줄을 세운다.
 */
const MAX_CONCURRENT_TTS = 4;
let ttsRunning = 0;
const ttsWaiting: (() => void)[] = [];
async function withTtsSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (ttsRunning >= MAX_CONCURRENT_TTS) {
    await new Promise<void>((resolve) => ttsWaiting.push(resolve));
  }
  ttsRunning++;
  try {
    return await fn();
  } finally {
    ttsRunning--;
    ttsWaiting.shift()?.();
  }
}

/** 아직 합성이 안 끝난 조각. 부른 쪽이 오는 순서대로 기다렸다 재생한다. */
export type PendingSegment = {
  from: number;
  to: number;
  audio: Promise<Blob>;
  pace?: VoicePace;
  /** 이 조각을 어떤 배역 톤으로 읽을지 — 지문은 언제나 '그대로'다. */
  tone?: SpeakerTone;
  /** 이 조각이 읽는 글. 조각 사이에 얼마나 쉴지 정하는 데 쓴다(reading-rest). */
  text: string;
  /** 지문인가 대사인가 — 바뀌는 자리에서 한 박자 더 쉰다. */
  who: "narration" | "dialogue";
};

/**
 * 한 쪽을 지문/대사 조각으로 나눠 **동시에** 합성을 걸고, 기다리지 않고 바로 돌려준다.
 * 부른 쪽은 첫 조각이 오는 즉시 재생을 시작하고, 나머지는 재생하는 동안 채워진다.
 *
 * 예전엔 조각을 하나씩 차례로 await 해서 '조각 수 × 합성시간'만큼 침묵이 흘렀다
 * (베타 피드백 1·4번: 눌러도 한참 소리가 안 나 오류인 줄 안다). 지금은 첫 조각
 * 하나만 기다리면 소리가 난다.
 *
 * 대사에는 감정 연기가 실리고, 감정을 거부하는 음성이면 그 조각만 기본톤으로 물러난다.
 * 글자 수 총합은 통짜 합성과 같아 크레딧 비용은 그대로다.
 *
 * cast(등장인물)를 주면 대사마다 누가 말하는지 찾아 배역 톤까지 얹는다 — 할머니는
 * 느리고 낮게, 작은 동물은 빠르고 높게. 성우를 나누는 게 아니라 한 성우가 목소리를
 * 바꾸는 방식이라 합성 요청도, 크레딧도 늘지 않는다(재생할 때 조절한다).
 */
export function startTypecastPageAudio(
  tc: TypecastPreset,
  text: string,
  direction?: VoiceDirection,
  cast: CastMember[] = [],
): PendingSegment[] {
  // 실시간 합성이 꺼져 있으면 호출 자체를 막는다 → 호출한 쪽이 딸린 파일/기계음으로 대체.
  if (!CLIENT_TTS_ENABLED) throw new Error("client-tts-disabled");
  const segs = splitDialogue(text);
  const tones = segmentTones(segs, cast);

  const synthEmo = (t: string, emotion: string): Promise<Blob> => {
    const p = withTtsSlot(() => fetchTypecastAudio(tc, t, emotion, direction?.intensity)).catch(() =>
      withTtsSlot(() => fetchTypecastAudio(tc, t)),
    );
    // 재생이 중간에 멈춰 아무도 이 조각을 기다리지 않게 되면 '처리 안 된 거부'
    // 경고가 뜬다 — 파생 프라미스로 받아둔다(원본은 부른 쪽에 그대로 넘어간다).
    p.catch(() => {});
    return p;
  };

  // 대사가 없는 페이지는 성우 본래 음색으로 편안하게 읽는다.
  if (segs.length <= 1 || !segs.some((s) => s.dialogue)) {
    return [{
      from: 0,
      to: text.length,
      audio: synthEmo(text, "normal"),
      pace: direction?.pace,
      text,
      who: "narration",
    }];
  }

  const out: PendingSegment[] = [];
  let pos = 0;
  segs.forEach((s, index) => {
    const from = pos;
    pos += s.text.length;
    // 지문은 성우 본래 음색을 유지하고, 따옴표 속 대사에만 낮은 강도의 감정을 넣는다.
    const requestedEmotion = direction
      ? (s.dialogue ? direction.dialogue : direction.narration)
      : guessEmotion(s.text);
    const emotion = storyReadingEmotion(requestedEmotion, s.dialogue);
    out.push({
      from,
      to: pos,
      audio: synthEmo(s.text, emotion),
      pace: direction?.pace,
      tone: tones[index],
      text: s.text,
      who: s.dialogue ? "dialogue" : "narration",
    });
  });
  return out;
}

/**
 * 다음 쪽을 미리 합성해 캐시에 채워둔다 — 넘어가는 순간 소리가 바로 나게.
 * 결과는 쓰지 않는다(캐시에만 남긴다). 실패는 조용히 무시 — 미리받기일 뿐이다.
 * 한 쪽만 앞서 받는다: 아이가 자동으로 다음 쪽까지 듣기 때문에 낭비가 거의 없고,
 * 같은 문장은 캐시되어 실제 재생 때 크레딧이 또 나가지 않는다.
 */
export function prefetchTypecastPageAudio(tc: TypecastPreset, text: string, direction?: VoiceDirection): void {
  if (!CLIENT_TTS_ENABLED || !text) return;
  try {
    // 배역 톤은 넘기지 않는다 — 톤은 재생할 때 거는 것이라 캐시에 담기는 소리와 무관하다.
    startTypecastPageAudio(tc, text, direction);
  } catch {
    /* 무시 */
  }
}

/** 동화를 다 만든 직후 미리 구워 둘 쪽 수. */
export const PREWARM_PAGES = 2;

/**
 * 막 만든 동화의 앞 몇 쪽을 미리 합성해 캐시에 넣어 둔다.
 *
 * 왜: 지금은 책을 열고 읽기를 눌러야 그 쪽을 합성한다. 첫 쪽에서 몇 초 기다리게
 * 되는데, 아이는 그 몇 초를 못 기다린다. 만들기가 끝나면 어차피 부모가 결과를
 * 보고 있으니, 그 사이에 앞쪽을 구워 두면 열자마자 소리가 난다.
 *
 * 왜 전부가 아니라 앞 2쪽만: 8쪽을 다 구우면 안 읽고 덮는 책에도 크레딧이 나가고
 * Typecast 월 한도(19만 자)에 훨씬 빨리 닿는다. 읽는 중에는 이미 '한 쪽 앞서
 * 받기'가 돌고 있어서, 앞 2쪽만 있으면 그 뒤로는 기다림이 이어지지 않는다.
 *
 * 목소리는 '책을 열었을 때 실제로 쓰일 것'과 같아야 캐시가 맞는다 — 부모 목소리가
 * 있으면 그게 기본이므로 그걸로 굽는다(뷰어의 기본 성우 결정과 같은 규칙).
 * 결과는 쓰지 않는다. 실패는 조용히 넘어간다 — 미리 굽기일 뿐이라 못 구워도
 * 읽을 때 그때 합성된다.
 */
export function prewarmBookAudio(
  pages: { text: string; voiceDirection?: VoiceDirection }[],
  voice: { kind: "parent"; voiceId: string } | { kind: "preset"; preset: TypecastPreset },
): void {
  if (!CLIENT_TTS_ENABLED) return;
  for (const page of pages.slice(0, PREWARM_PAGES)) {
    const text = page.text;
    if (!text) continue;
    try {
      if (voice.kind === "parent") {
        // 부모 목소리는 쪽 전체를 한 번에 합성한다(뷰어와 같은 방식·같은 캐시 키).
        void fetchTypecastVoiceAudio(voice.voiceId, text).catch(() => {});
      } else {
        startTypecastPageAudio(voice.preset, text, page.voiceDirection);
      }
    } catch {
      /* 무시 */
    }
  }
}

/**
 * 목소리 스티커 아이콘(힉스필드, 2026-09-22) — 나레이션 성우 16명과 엄마·아빠만 있다.
 * 없으면 null 이고, 그때는 부르는 쪽이 emoji 를 그대로 쓴다(배역 성우 등).
 * 부모 목소리는 id 가 계정마다 달라 role('mom'|'dad') 이나 label('엄마'|'아빠')로 찾는다.
 */
export function voiceIconSrc(v: { id?: string | null; role?: string | null; label?: string | null }): string | null {
  if (v.id && (NARRATOR_VOICE_IDS as readonly string[]).includes(v.id)) return `/icons/voices/${v.id}.webp`;
  const who = v.role ?? v.label?.replace(/\s*목소리$/, "") ?? "";
  if (who === "mom" || who === "엄마") return "/icons/voices/parent-mom.webp";
  if (who === "dad" || who === "아빠") return "/icons/voices/parent-dad.webp";
  return null;
}
