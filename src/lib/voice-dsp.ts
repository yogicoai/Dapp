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

/* ── 클로닝으로 보낼 소리의 예산 ──────────────────────────────── */

/**
 * 서버 함수가 받아 주는 요청 본문 한도. 이걸 넘으면 413이 난다(실제로 겪었다).
 * 아래 표본율·길이는 반드시 이 안에 들어와야 한다 — 시험으로 지킨다.
 */
export const UPLOAD_LIMIT_BYTES = 4.5 * 1024 * 1024;

/**
 * 클로닝용 표본율.
 *
 * 16kHz에서 24kHz로 올렸다. 16kHz는 8kHz 위를 통째로 버리는데, 목소리의 '공기감'
 * (숨소리·치찰음의 결)이 바로 8~12kHz에 있다. 그게 없으면 통화 음질처럼 들리고,
 * 클로닝 모델은 애초에 그 결을 배울 재료를 받지 못한다.
 *
 * 왜 지금까지 16kHz였나: WAV는 압축이 없어 크기가 그대로 늘고, 요청 본문 한도를
 * 넘기면 413이 난다. 그래서 낮춰 뒀다.
 * 왜 이제 올릴 수 있나: 길이 상한이 실제 녹음보다 한참 길었다(120초). 한 문장을
 * 35초 목표로 두 번 읽으니 실제로는 70초쯤이다. 안 쓰는 여유를 대역폭으로 바꿨다.
 *   전: 16kHz × 120초 = 3.66MB
 *   후: 24kHz ×  80초 = 3.66MB   ← 크기는 같고 담기는 소리만 넓어진다
 */
export const CLONE_SAMPLE_RATE = 24000;

/** 안전 상한 — 아무리 길게 읽어도 이보다 길게는 안 보낸다. */
export const CLONE_MAX_SECONDS = 80;

/** 16비트 모노 WAV의 크기(헤더 포함). */
export function cloneWavBytes(seconds: number, sampleRate = CLONE_SAMPLE_RATE): number {
  return Math.round(sampleRate * 2 * seconds) + 64;
}

/**
 * 앞뒤 침묵을 잘라내고, 중간의 긴 침묵은 짧게 줄인다.
 * 말이 없는 구간까지 학습하면 클론이 늘어지고 어색해진다.
 *
 * 기준을 **그 녹음의 크기에 맞춰** 잡는다. 예전에는 0.012로 고정이었는데,
 * 이 값은 정규화(소리 키우기)를 하기 **전** 신호에 걸린다. 작게 녹음한 부모는
 * 말소리 상당수가 0.012 아래라, 부드러운 자음(ㅎ·ㅅ·ㅁ)과 말끝이 침묵으로
 * 오인돼 잘려 나갔다 — 클론이 딱딱해지는 원인이다.
 * 이제 가장 큰 구간의 8%를 기준으로 삼는다. 크게 녹음했든 작게 녹음했든
 * '이 사람 기준의 조용함'을 재게 된다.
 */
export function trimSilence(x: Float32Array, sampleRate: number): Float32Array {
  const win = Math.max(1, Math.floor(sampleRate * 0.02)); // 20ms 단위로 본다
  const rms: number[] = [];
  for (let i = 0; i < x.length; i += win) {
    let s = 0;
    const end = Math.min(x.length, i + win);
    for (let j = i; j < end; j++) s += x[j] * x[j];
    rms.push(Math.sqrt(s / (end - i)));
  }
  const peak = rms.reduce((a, b) => (b > a ? b : a), 0);
  // 바닥값(0.002)은 완전한 무음 녹음에서 온 소리를 다 살려 두지 않기 위한 최소선이다.
  const threshold = Math.max(0.002, peak * 0.08);
  const loud = rms.map((v) => v > threshold);

  let first = loud.indexOf(true);
  let last = loud.lastIndexOf(true);
  if (first < 0) return x; // 전부 조용하면 손대지 않는다(품질 검사가 따로 잡는다)
  // 말 앞뒤로 0.15초는 남긴다 — 딱 붙여 자르면 첫 소리가 잘려 들린다.
  const pad = Math.ceil(0.15 / 0.02);
  first = Math.max(0, first - pad);
  last = Math.min(loud.length - 1, last + pad);

  const maxGap = Math.ceil(0.8 / 0.02); // 0.8초 넘는 침묵은
  const keepGap = Math.ceil(0.3 / 0.02); // 0.3초로 줄인다
  const out: number[] = [];
  let gap = 0;
  for (let b = first; b <= last; b++) {
    if (!loud[b]) {
      gap++;
      if (gap > maxGap) continue;
      if (gap > keepGap) continue;
    } else {
      gap = 0;
    }
    const s = b * win;
    const e = Math.min(x.length, s + win);
    for (let j = s; j < e; j++) out.push(x[j]);
  }
  return Float32Array.from(out);
}
