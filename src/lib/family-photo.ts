/**
 * 우리 가족 캐릭터 — '사진으로 할게요'(사장님 2026-09-29).
 *
 * 부모가 칩 대신 그 사람 사진 한 장을 올리면 그 사진을 참고로 수채화 캐릭터를 그린다.
 * 약속(화면에 그대로 적는다): "사진은 저장하지 않고, 그림을 그리는 데 한 번 쓰고 바로 지워요".
 *  - 브라우저: 사진은 가족 화면(app/family/page.tsx)의 React state(메모리)에만 둔다. ChildPrefs·FamilyMember·
 *    saveChild·saveFamilyNow·localStorage 에 넣지 않는다. 화면을 닫거나, 그 사람 그림을 고정하거나, 부모가 빼면 사라진다.
 *  - 서버(api/family/portrait): 요청 한 번(값을 받은 뒤) 안에서만 쓰고 버린다 —
 *      ① 특징 카드: 값싼 글 모델(Gemini flash, lib/family-photo-card)에 사진을 한 번 보여 알아볼 생김새를 짧은 글로,
 *         같은 답에 얼굴 상자도 받는다. 상자로 사진에서 얼굴 클로즈업을 잘라 만든다(lib/family-closeup, 서버 메모리에서).
 *      ② 그리기: 사진을 첫째, 얼굴 클로즈업을 둘째 참고 그림으로, 특징 카드를 '그대로 맞출 것'으로 그림 모델(Gemini)에 넘긴다.
 *      ③ 대신 그리기: 그림 모델이 사진을 거절하면 같은 요청·같은 쿠키로 사진 없이 특징 카드(+칩)로 한 번 더 그린다.
 *         그 사진의 다시 그리기(같은 방문)는 ②를 건너뛰고 ①·③만 한다(skipPhotoDraw — 화면 메모리의 표시).
 *      ④ 머리 비율 다시 그리기: 사진은 다시 보내지 않고 처음 그림으로 한다. ②·③에 쓴 특징 카드의 얼굴·머리 줄만 같은 요청
 *         안에서 글로 다시 적는다(2026-09-30, lib/family-portrait-prompt redrawLikeness) — 다시 그리기가 끝나면 놓는다.
 *    특징 카드·얼굴 상자·얼굴 클로즈업은 사진에서 읽거나 잘라 낸 것이라 사진과 똑같이 다룬다. 사진·카드·상자·클로즈업·요청
 *    본문 모두 DB(결제 RPC 인자 포함)·Supabase 스토리지·cafe24·로그·오류 응답·성공 응답 어디에도 남기지 않는다(로그는 결과
 *    갈래와 걸린 시간만).
 *  - 남기는 것은 '사진으로 그린 그림'이라는 표시(FamilyPortrait.fromPhoto)뿐이다. 응답의 photoFallback(아래)은 화면이
 *    그 자리에서 한 줄 알리는 데만 쓰고 저장하지 않는다.
 *
 * 이 파일은 순수 함수만 둔다(브라우저·서버 둘 다 부른다) — node --test 로 시험할 수 있게.
 * 사진을 줄이는 캔버스 코드는 브라우저 전용이라 components/family/photo.ts 에 있다.
 */

/** 받는 사진 형식 — 브라우저는 늘 JPEG 로 다시 구워 보낸다. */
export const PORTRAIT_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type PortraitPhotoType = (typeof PORTRAIT_PHOTO_TYPES)[number];

/** 서버가 받는 사진 크기(풀었을 때) — 1024px JPEG 는 보통 0.2~0.5MB 라 넉넉하다. */
export const PORTRAIT_PHOTO_MAX_BYTES = 2_500_000;
/** 이보다 작으면 사진이 아니다(깨진 파일·빈 값) */
export const PORTRAIT_PHOTO_MIN_BYTES = 512;
/**
 * 요청 본문 전체 상한 — 배포 환경(Vercel) 함수의 요청 본문 한도 4.5MB 보다 아래.
 * 사진 2.5MB 는 base64 로 약 3.4MB 라 이 안에 든다. 넘으면 읽기 전에 막는다.
 */
export const PORTRAIT_BODY_MAX_BYTES = 4_000_000;

/** 브라우저에서 줄이는 크기 — 긴 변 1024px, JPEG 품질 0.85 */
export const PHOTO_LONG_SIDE = 1024;
export const PHOTO_QUALITY = 0.85;
/** 줄인 뒤에도 이보다 크면 품질을 낮춰 한 번 더 굽는다(보내는 양을 서버 한도보다 한참 아래로). */
export const PHOTO_SEND_MAX_BYTES = 1_500_000;
/** 고르는 원본 파일 상한 — 이보다 크면 폰이 풀다가 멈출 수 있다(보통 폰 사진은 2~12MB). */
export const PHOTO_PICK_MAX_BYTES = 40 * 1024 * 1024;
/** 짧은 변이 이보다 작으면 얼굴을 알아보기 어렵다 */
export const PHOTO_MIN_SIDE = 160;

/** 사진 약속 — 화면(생김새 고르기 사진 칸)에 늘 이 말 그대로. 코드도 이 약속대로 한다(위 머리글). */
export const PHOTO_PROMISE = "사진은 저장하지 않고, 그림을 그리는 데 한 번 쓰고 바로 지워요";

/** 사진이 거절됐을 때(형식·크기·그림 모델 거절) 화면에 보이는 말 */
export const PHOTO_REFUSED_MESSAGE = "이 사진으로는 그리지 못했어요. 다른 사진을 쓰거나 특징을 골라 주세요.";
export const PHOTO_BAD_FORMAT_MESSAGE = "사진 형식이 올바르지 않아요. 다른 사진을 골라 주세요.";
export const PHOTO_TOO_BIG_MESSAGE = "사진이 너무 커요. 다른 사진을 골라 주세요.";

export type PortraitPhoto = { mimeType: PortraitPhotoType; data: string };

/**
 * 그림 모델이 사진을 거절해 같은 쿠키로 사진 없이 대신 그렸다(응답의 photoFallback).
 *  features : 사진에서 읽은 특징(특징 카드)으로 — 그래도 '사진으로 그린 그림'(fromPhoto)이다.
 *  looks    : 특징 카드를 못 받아 고르신 특징(칩)으로 — 칩으로 그린 그림과 같다(fromPhoto 아님).
 */
export type PhotoFallback = "features" | "looks";

/** 대신 그렸을 때 확인 화면에 보이는 한 줄 */
export const PHOTO_FALLBACK_NOTE: Record<PhotoFallback, string> = {
  features: "사진은 그대로 쓰지 못해 사진 속 특징으로 그렸어요",
  looks: "사진은 쓰지 못해 고르신 특징으로 그렸어요",
};

/** 응답의 photoFallback 읽기 — 모르는 값이면 null(대신 그리지 않았다) */
export function readPhotoFallback(v: unknown): PhotoFallback | null {
  return v === "features" || v === "looks" ? v : null;
}

/* ─────────────────────────── 서버: 받은 사진 검사 ─────────────────────────── */

/** base64 글자만(끝 '=' 0~2개). 길이가 4의 배수여야 한다. */
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const DATA_URL = /^data:(image\/[a-z0-9.+-]+);base64,/i;

/** base64 길이 → 풀었을 때 바이트 */
export function base64Bytes(b64: string): number {
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

/** 앞 몇 바이트(파일 머리)로 형식이 맞는지 — 글자만 image/jpeg 라고 적은 다른 파일을 막는다. */
function magicMatches(type: PortraitPhotoType, b64: string): boolean {
  let head: string;
  try {
    head = atob(b64.slice(0, 16));
  } catch {
    return false;
  }
  const at = (i: number) => head.charCodeAt(i);
  if (type === "image/jpeg") return at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff;
  if (type === "image/png") return head.startsWith("\x89PNG\r\n\x1a\n");
  return head.startsWith("RIFF") && head.slice(8, 12) === "WEBP";
}

/**
 * 요청의 photo 칸을 검사한다(값을 받기 전에 — 이상하면 400). 모양은 둘 중 하나:
 *   'data:image/jpeg;base64,…'  또는  { mimeType: 'image/jpeg', data: '…base64…' }
 * 없으면(undefined·null·빈 글자) { photo: null }. 형식은 JPEG·PNG·WEBP 만, 풀어서 2.5MB 까지.
 * 오류 글자에는 사진 내용을 절대 넣지 않는다(로그·응답으로 새지 않게).
 */
export function readPortraitPhoto(raw: unknown): { photo: PortraitPhoto | null } | { error: string } {
  if (raw === undefined || raw === null || raw === "") return { photo: null };

  let type: string;
  let data: string;
  if (typeof raw === "string") {
    const m = DATA_URL.exec(raw.slice(0, 64));
    if (!m) return { error: PHOTO_BAD_FORMAT_MESSAGE };
    type = m[1].toLowerCase();
    data = raw.slice(m[0].length);
  } else if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (typeof o.mimeType !== "string" || typeof o.data !== "string") return { error: PHOTO_BAD_FORMAT_MESSAGE };
    type = o.mimeType.toLowerCase();
    data = o.data;
  } else {
    return { error: PHOTO_BAD_FORMAT_MESSAGE };
  }

  if (!(PORTRAIT_PHOTO_TYPES as readonly string[]).includes(type)) return { error: PHOTO_BAD_FORMAT_MESSAGE };
  // 길이부터 본다 — 아주 긴 글자를 정규식에 넣기 전에.
  if (base64Bytes(data) > PORTRAIT_PHOTO_MAX_BYTES) return { error: PHOTO_TOO_BIG_MESSAGE };
  if (data.length % 4 !== 0 || !BASE64.test(data)) return { error: PHOTO_BAD_FORMAT_MESSAGE };
  if (base64Bytes(data) < PORTRAIT_PHOTO_MIN_BYTES) return { error: PHOTO_BAD_FORMAT_MESSAGE };
  const mimeType = type as PortraitPhotoType;
  if (!magicMatches(mimeType, data)) return { error: PHOTO_BAD_FORMAT_MESSAGE };
  return { photo: { mimeType, data } };
}

/* ─────────────────────────── 브라우저: 고른 파일 검사·크기 ─────────────────────────── */

/**
 * 고른 파일을 풀기 전에 본다 — 사진이 아니거나 터무니없이 크면 부모가 읽을 말을, 괜찮으면 null.
 * 형식이 비어 있는 파일(일부 안드로이드 갤러리)은 일단 받고, 풀리지 않으면 그때 알린다.
 */
export function checkPickedFile(f: { type: string; size: number }): string | null {
  if (f.type && !f.type.startsWith("image/")) return "사진 파일만 올릴 수 있어요.";
  if (f.size <= 0) return "빈 파일이에요. 다른 사진을 골라 주세요.";
  if (f.size > PHOTO_PICK_MAX_BYTES) return PHOTO_TOO_BIG_MESSAGE;
  return null;
}

/** 긴 변을 max 로 맞춘 크기(키우지는 않는다). 너무 작으면 null. */
export function fitPhotoSize(
  width: number,
  height: number,
  max = PHOTO_LONG_SIDE,
): { width: number; height: number } | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || Math.min(width, height) < PHOTO_MIN_SIDE) return null;
  const k = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}
