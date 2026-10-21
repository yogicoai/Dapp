/**
 * 낭독이 소리 없이 멈춰 섰나 — 재생 위치가 제자리인 시간을 센다(2026-10-21 사장님: 견우와 직녀를 읽다 순간 음성이 안 나와
 * 앞뒤로 넘기니 나왔다). 파일을 받다가 망이 막히면 오류도 끝(ended)도 오지 않아, 화면은 '읽는 중'인데 조용히 서 있었다.
 * 화면(BookViewer watchStall)이 1초마다 지금 상태를 넣으면, 제자리로 stallMs 를 넘길 때마다 몇 번째인지(1, 2, …)를 돌려준다 —
 * 첫 번째는 그 소리를 다시 걸고, 그래도 안 되면 그 조각을 건너뛴다.
 * 일부러 멈춘 동안(일시정지·캐릭터 대사·화면이 안 보일 때 — holding)은 세지 않고 처음부터 다시 센다.
 *
 * 순수 파일 — node --test 가 그대로 읽는다.
 */
export type StallSample = {
  /** 일부러 멈춘 동안인가 — 세지 않는다 */
  holding: boolean;
  /** 재생 위치(초) */
  position: number;
  /** 지금 시각(ms, performance.now) */
  now: number;
};

export function stallTracker(stallMs: number): (s: StallSample) => number | null {
  let last = Number.NaN;
  let since = -1; // 첫 검사 때부터 센다
  let tries = 0;
  return (s) => {
    if (s.holding) {
      since = -1; // 풀린 뒤 첫 검사부터 다시 센다
      return null;
    }
    if (since < 0 || s.position !== last) {
      last = s.position;
      since = s.now;
      return null;
    }
    if (s.now - since < stallMs) return null;
    since = s.now;
    tries += 1;
    return tries;
  };
}
