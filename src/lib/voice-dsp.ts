/**
 * 목소리 신호 손질 — 표본율 낮추기와 그 앞의 저역 통과.
 *
 * 왜 따로 두나: parent-voice.ts는 브라우저 것들(@/ 별칭·IndexedDB)을 들고 있어
 * node --test로 못 부른다. 소리를 다루는 계산은 귀로 확인하기 어려우므로
 * 반드시 시험으로 굳혀야 한다 — 그래서 순수 계산만 여기로 뺀다.
 */

/**
 * 저역 통과(2차 버터워스 바이쿼드) 네 번.
 *
 * 표본율을 낮추기 **전에** 반드시 걸러야 한다. 안 걸면 높은 소리가 사라지는 게
 * 아니라 **낮은 자리로 접혀 들어온다**(에일리어싱). 실제로 재 보니 13kHz 소리가
 * 3kHz 자리에 가짜로 나타났다 — 목소리 한가운데다. 치찰음(ㅅ·ㅊ·ㅍ)에 이 대역
 * 에너지가 많아서, 녹음은 내 목소리인데 클론은 쇳소리가 섞여 다른 사람처럼 들린다.
 *
 * 네 번 거는 이유: 실측으로 정했다. 자름 지점을 7.2kHz로 두고 단수를 늘려 가며
 * 9·11·13kHz가 접혀 들어오는 양과, 목소리 대역(1·4·6kHz)이 남는 양을 같이 쟀다.
 *   2단 → 9kHz 접힘 0.053 (원래 0.218) · 6kHz 0.165
 *   4단 → 9kHz 접힘 0.013                · 6kHz 0.115
 * 4단이 접힘을 17배 줄이면서 치찰음이 사는 6kHz를 가장 많이 남긴다.
 * 자름 지점을 더 내리면(0.42·0.40) 접힘은 조금 더 줄지만 6kHz가 함께 깎여
 * 목소리가 답답해진다 — 그건 접힘을 고치려다 다른 데를 망가뜨리는 것이다.
 */
export function lowPass(x: Float32Array, sampleRate: number, cutoff: number): Float32Array {
  const w0 = (2 * Math.PI * Math.min(cutoff, sampleRate / 2 - 1)) / sampleRate;
  const cosw = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * Math.SQRT1_2); // Q = 1/√2 (버터워스)
  const a0 = 1 + alpha;
  const b0 = (1 - cosw) / 2 / a0;
  const b1 = (1 - cosw) / a0;
  const b2 = b0;
  const a1 = (-2 * cosw) / a0;
  const a2 = (1 - alpha) / a0;

  const once = (input: Float32Array): Float32Array => {
    const out = new Float32Array(input.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < input.length; i++) {
      const v = input[i];
      const y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = v; y2 = y1; y1 = y;
      out[i] = y;
    }
    return out;
  };
  return once(once(once(once(x))));
}

/**
 * 표본율 바꾸기. 낮출 때는 먼저 걸러 낸다.
 *
 * 자르는 지점은 새 표본율의 45%(16kHz면 7.2kHz)다. 나이퀴스트(8kHz)에 딱 붙이면
 * 필터가 다 못 깎아 접힘이 남고, 너무 내리면 목소리가 답답해진다.
 */
export function resample(x: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return x;
  const source = to < from ? lowPass(x, from, to * 0.45) : x;
  const ratio = from / to;
  const len = Math.floor(source.length / ratio);
  const y = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(source.length - 1, i0 + 1);
    const t = pos - i0;
    y[i] = source[i0] * (1 - t) + source[i1] * t;
  }
  return y;
}

/** 특정 주파수 성분의 세기 — 시험에서 '가짜 소리가 생겼나'를 재는 데 쓴다. */
export function toneLevel(x: Float32Array, freq: number, sampleRate: number): number {
  const w = (2 * Math.PI * freq) / sampleRate;
  const c = 2 * Math.cos(w);
  let s1 = 0, s2 = 0;
  for (const v of x) {
    const s = v + c * s1 - s2;
    s2 = s1;
    s1 = s;
  }
  return Math.sqrt(Math.abs(s1 * s1 + s2 * s2 - c * s1 * s2)) / x.length;
}
