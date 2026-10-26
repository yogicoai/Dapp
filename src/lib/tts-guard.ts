/**
 * 성우 음성(/api/tts) 문지기 — 2026-10-20 보안 점검.
 *
 * 로그인 없이도 부를 수 있다(비회원 둘러보기 — 미리 구운 파일이 없는 쪽은 실시간 합성). 그래서 한 사람이 몰아 부르면
 * 한 달 성우 크레딧 안전선(lib/typecast 19만 8천 자)에 닿아 모든 손님의 낭독이 멈춘다. 막는 것은 둘:
 *  ① 앱 성우 목록(TYPECAST_VOICES)에 있는 목소리만 — 부르는 쪽(/api/tts)이 확인한다.
 *  ② 시간당 글자 수 상한 — 로그인 안 함은 IP마다, 로그인은 회원마다.
 * 상한은 서버 한 대(인스턴스)의 메모리 값이라 여러 대에 나뉘면 그만큼 느슨하다 — 한 사람이 몰아 쓰는 것을 막는 정도다.
 * 넘으면 429 — 화면은 미리 구운 파일이나 브라우저 목소리로 물러난다(BookViewer).
 *
 * 순수 파일 — node --test 가 그대로 읽는다.
 */

export const TTS_WINDOW_MS = 60 * 60 * 1000;
/** 비회원(IP) 한 시간 — 구운 파일이 없는 책 두어 권을 처음부터 끝까지 듣는 정도 */
export const ANON_TTS_CHARS_PER_HOUR = 8_000;
/** 회원 한 시간 — 만든 동화를 처음 듣는 것(한 권 약 1,200자)이 서른 권쯤. 들은 문장은 기기에 담겨 다시 부르지 않는다. */
export const MEMBER_TTS_CHARS_PER_HOUR = 40_000;
/** 이보다 많이 기억하면 지난 창(1시간 넘은 것)을 먼저 비운다 */
const MAX_KEYS = 5_000;

export type CharBucket = { start: number; used: number };
export type CharBook = Map<string, CharBucket>;

/** 이번 요청의 글자 수를 쓸 수 있으면 셈에 더하고 true, 넘으면 셈은 그대로 두고 false */
export function takeChars(
  book: CharBook,
  key: string,
  chars: number,
  limit: number,
  now: number,
  windowMs: number = TTS_WINDOW_MS,
): boolean {
  if (book.size > MAX_KEYS) {
    for (const [k, b] of book) if (now - b.start >= windowMs) book.delete(k);
  }
  const cur = book.get(key);
  if (!cur || now - cur.start >= windowMs) {
    if (chars > limit) return false;
    book.set(key, { start: now, used: chars });
    return true;
  }
  if (cur.used + chars > limit) return false;
  cur.used += chars;
  return true;
}

/** 부른 곳의 IP — 버셀은 x-forwarded-for 맨 앞이 실제 주소다. 모르면 한 칸("unknown")에 모은다. */
export function clientIpOf(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}
