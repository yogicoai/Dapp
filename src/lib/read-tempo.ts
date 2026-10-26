/**
 * 실시간 성우 낭독의 말 빠르기 — Typecast audio_tempo 로 합성할 때 거는 값.
 *
 * 왜 필요한가(2026-09-30 사장님: "글 읽는 게 너무 빠르다"): 미리 구운 전래·명작은 굽는
 * 스크립트가 빠른 성우를 bakeTempo 로 늦추고, 민정(기준 성우)은 초당 5.8음절(쉼 빼고)쯤으로
 * 읽는다. 그런데 만든 동화는 브라우저에서 실시간으로 합성하면서 빠르기를 한 번도 보내지 않아
 * 성우 본래 속도로 읽었다 — 나레이션 성우 여덟 명의 미리듣기를 재 보니 일곱 명이 초당
 * 6.1~7.3음절로, 구운 책보다 5~25% 빨랐다(대략값, 미리듣기 파일이 sample 문장을 읽었다고 보고 쟀다).
 * 글을 짧게 끊어 달라고 한 것(09-29)으로는 느려지지 않고 뚝뚝 끊기기만 했다.
 *
 * 왜 재생 배속(DEFAULT_VOICE_RATE)이 아니라 합성 빠르기인가: 배속은 구운 책 재생에도 똑같이
 * 걸려 구운 책까지 느려진다. 합성 빠르기는 실시간 합성에만 걸리고, 구운 파일은 그대로다.
 *
 * 성우 줄의 bakeTempo 로 적지 않는다 — 굽는 스크립트(bake-cast-narration.mts)가 voices.ts 성우 줄의
 * 'bakeTempo:' 를 정규식으로 읽어 구운 책의 빠르기를 정한다. 실시간 빠르기를 거기 적으면 다음에
 * 구울 때 전래·명작 낭독이 바뀐다. 그래서 따로 이름을 짓고 이 파일에 둔다
 * (read-tempo.test.ts 가 굽는 스크립트의 정규식 그대로 voices.ts 의 bakeTempo 표를 지킨다).
 *
 * 순수 모듈이다(@/ 별칭·브라우저 의존 없음) — node --test 로 굳히려고 voices.ts 밖에 둔다.
 */

/**
 * 실시간 낭독 빠르기. 1이 성우 본래 속도, 0.9면 10% 느리게 — 길이가 대략 8~11% 는다.
 * 부모 목소리(복제)에는 걸지 않는다 — '부모와 똑같은 목소리'가 값어치라 말 빠르기도 그대로 둔다.
 */
export const LIVE_READ_TEMPO = 0.9;

type LiveReadKey = {
  voiceId: string;
  emotion?: string;
  intensity?: number;
  tempo: number;
  textHash: string;
};

/**
 * 실시간 낭독 소리의 기기 캐시 열쇠 — 새로 합성한 소리를 담는 자리.
 *
 * 빠르기가 1이면 예전(09-29까지) 열쇠와 한 글자도 다르지 않다.
 * 빠르기가 1이 아니면 열쇠에 빠르기를 넣는다 — 느리게 합성한 소리와 본래 속도로 담긴 옛 소리를
 * 한 자리에 섞지 않으려는 것이다(나중에 빠르기를 다시 바꿔도 어느 소리가 어느 빠르기인지 안다).
 */
export function liveReadCacheId(input: LiveReadKey): string {
  const head = `tts-read-v3:${input.voiceId}:${input.emotion ?? "normal"}:${input.intensity?.toFixed(2) ?? "-"}`;
  return input.tempo === 1 ? `${head}:${input.textHash}` : `${head}:t${input.tempo.toFixed(2)}:${input.textHash}`;
}

/**
 * 새 열쇠에 소리가 없을 때 대신 찾아볼 옛 열쇠(빠르기 1로 담긴 소리). 빠르기가 1이면 null.
 *
 * 왜(09-30 검토): 열쇠만 바꾸면 기기마다 이미 담아 둔 만든 동화를 다음에 들을 때 **전부 다시
 * 합성**한다 — 권당 약 1,100~1,800자(약 115~190원어치)이고, 모든 사용자가 한 계정의 월 19만 8천 자
 * 안전 잠금(typecast.ts)을 함께 쓰기 때문에, 출시 뒤 다시 듣기가 몰리면 잠금이 걸려 그달 남은
 * 동안 모든 실시간 낭독이 브라우저 기계음으로 떨어진다. 사장님 규칙(돈 나가는 일은 금액을 알리고
 * 답을 받은 뒤)에도 어긋난다.
 * 그래서 이미 담긴 문장은 옛 소리를 그대로 틀고(0원), 처음 합성하는 문장만 느린 빠르기로 합성한다.
 * 대신 반쯤 들은 옛 책은 들었던 쪽은 예전 빠르기, 처음 듣는 쪽은 새 빠르기로 섞여 들릴 수 있다.
 */
export function liveReadFallbackId(input: LiveReadKey): string | null {
  return input.tempo === 1 ? null : liveReadCacheId({ ...input, tempo: 1 });
}
