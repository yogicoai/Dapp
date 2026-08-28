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

  /*
   * 0.8초 넘는 침묵만 0.5초로 줄인다. 그보다 짧은 쉼은 손대지 않는다.
   *
   * 예전 코드는 조건 두 개가 모두 `continue`라 **0.3초 넘는 모든 쉼**을 0.3초로 잘랐다.
   * 문장 끝의 자연스러운 숨(0.5~0.8초)이 잘려 나가, 클론이 숨 쉴 틈 없이 급하게 읽는
   * 쪽으로 배웠다. 침묵 구간의 전체 길이를 먼저 재고 나서 자를지 정한다.
   */
  const maxGap = Math.ceil(0.8 / 0.02); // 이보다 긴 침묵만
  const keepGap = Math.ceil(0.5 / 0.02); // 이만큼 남기고 자른다
  // 각 조용한 창이 속한 침묵 구간의 길이(창 수)
  const runLen = new Int32Array(loud.length);
  for (let b = first; b <= last; ) {
    if (loud[b]) {
      b++;
      continue;
    }
    let e = b;
    while (e <= last && !loud[e]) e++;
    for (let k = b; k < e; k++) runLen[k] = e - b;
    b = e;
  }
  const out: number[] = [];
  let gap = 0;
  for (let b = first; b <= last; b++) {
    if (!loud[b]) {
      gap++;
      if (runLen[b] > maxGap && gap > keepGap) continue;
    } else {
      gap = 0;
    }
    const s = b * win;
    const e = Math.min(x.length, s + win);
    for (let j = s; j < e; j++) out.push(x[j]);
  }
  return Float32Array.from(out);
}

/**
 * 하이패스(2차 버터워스 바이쿼드) 두 번, 기본 90Hz.
 *
 * 예전엔 1차 80Hz 하나였다 — 6dB/옥타브라 60Hz 전원 험이 겨우 -4dB, 120·180Hz 배음은
 * 거의 그대로 지나갔다. 4차(24dB/옥타브)면 60Hz가 -15dB 아래로 내려가고, 목소리
 * 기본음(남자 100Hz~)은 90Hz 위라 손대지 않는다.
 */
export function highPass(x: Float32Array, sampleRate: number, cutoff = 90): Float32Array {
  const w0 = (2 * Math.PI * cutoff) / sampleRate;
  const cosw = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * Math.SQRT1_2);
  const a0 = 1 + alpha;
  const b0 = (1 + cosw) / 2 / a0;
  const b1 = -(1 + cosw) / a0;
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
  return once(once(x));
}

/**
 * 부드러운 리미터 — 0.8까지는 그대로, 그 위는 서서히 눌러 0.95를 넘지 않게.
 * 딱 자르면(클리핑) 그 자체가 잡음이 된다.
 */
export function softLimit(x: Float32Array, knee = 0.8, ceiling = 0.95): Float32Array {
  const room = ceiling - knee;
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    const a = Math.abs(v);
    y[i] = a <= knee ? v : Math.sign(v) * (knee + room * Math.tanh((a - knee) / room));
  }
  return y;
}

/**
 * 말소리 기준으로 크기를 맞춘다.
 *
 * 예전엔 '가장 큰 한 점'을 0.9로 끌어올렸다. 'ㅍ·ㅂ' 파열음이 마이크를 한 번 치면
 * 그 점이 최대값이 되어 전체가 작게 남고, 두 문장을 다른 거리에서 읽으면 크기가 서로
 * 달랐다. 이제 **말하는 창들의 평균 크기(RMS)** 를 목표값에 맞춘다 — 조용한 구간은
 * 평균에서 빼야 작은 녹음을 과하게 키우지 않는다. 큰 녹음은 줄이고, 튀는 점은 리미터가
 * 부드럽게 받는다.
 *
 * @param targetRms 말소리 평균 크기 목표. 0.1 = -20dBFS. 실제 낭독 파일이 그쯤이었다.
 */
export function normalizeLoudness(x: Float32Array, sampleRate: number, targetRms = 0.1): Float32Array {
  const win = Math.max(1, Math.floor(sampleRate * 0.02));
  const rms: number[] = [];
  for (let i = 0; i < x.length; i += win) {
    let s = 0;
    const end = Math.min(x.length, i + win);
    for (let j = i; j < end; j++) s += x[j] * x[j];
    rms.push(Math.sqrt(s / (end - i)));
  }
  const peak = rms.reduce((a, b) => (b > a ? b : a), 0);
  const threshold = Math.max(0.002, peak * 0.08);
  // 말하는 창들의 **중앙값** — 평균은 파열음 한 점이 든 창 하나에도 끌려간다.
  const speaking = rms.filter((v) => v > threshold).sort((a, b) => a - b);
  if (speaking.length === 0) return x;
  const speechRms = speaking[speaking.length >> 1];
  if (speechRms < 1e-4) return x;
  // 12배 넘게 키우면 바닥 잡음만 커진다 · 4배 넘게 줄일 일은 없다(그건 깨진 녹음이다).
  const gain = Math.min(12, Math.max(0.25, targetRms / speechRms));
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) y[i] = x[i] * gain;
  return softLimit(y);
}

/* ── 잡음 빼기(스펙트럼 감산) ──────────────────────────────────
 * 게이트는 말과 말 **사이**만 누른다. 선풍기·에어컨·냉장고의 "쉬이—" 하는 넓은 잡음은
 * 말소리와 함께 그대로 들어가고, 클로닝 모델은 그것까지 '이 사람 목소리의 결'로 배운다.
 * 녹음 전에 2초 재 둔 방 소음을 '잡음 지문'으로 삼아, 소리를 주파수별로 나눠 그
 * 지문만큼 빼 준다. 조용한 방(지문이 아주 작음)에서는 아무 일도 하지 않는다.
 */

/** 방 소음의 주파수별 세기 — 녹음 전에 잰 2초에서 만든다. */
export type NoiseProfile = {
  sampleRate: number;
  /** 한 조각의 길이(표본 수, 2의 거듭제곱). */
  frame: number;
  /** 조각당 주파수별 평균 파워(|N|²). 길이 frame/2+1. */
  power: Float64Array;
  /** 방 소음의 전체 RMS — 아주 조용하면 빼기를 건너뛰는 기준. */
  rms: number;
};

/** 표본율에 맞는 조각 길이 — 48kHz면 1024(약 21ms). */
function frameSizeFor(sampleRate: number): number {
  return sampleRate >= 32000 ? 1024 : 512;
}

function hann(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  return w;
}

/** 제자리 복소 FFT(반지름 2). 길이는 2의 거듭제곱이어야 한다. */
function fft(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 1 : -1) * 2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < half; j++) {
        const a = i + j, b = a + half;
        const vr = re[b] * cr - im[b] * ci;
        const vi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - vr; im[b] = im[a] - vi;
        re[a] += vr; im[a] += vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }
}

/**
 * 방 소음 조각들 → 잡음 지문.
 *
 * 조각은 말하지 않을 때 잰 것이어야 한다(녹음 전 2초). 조각 하나가 한 프레임보다
 * 짧으면 건너뛰고, 쓸 만한 프레임이 하나도 없으면 null.
 */
export function buildNoiseProfile(chunks: Float32Array[], sampleRate: number): NoiseProfile | null {
  const frame = frameSizeFor(sampleRate);
  const hop = frame >> 1;
  const w = hann(frame);
  const bins = (frame >> 1) + 1;
  const power = new Float64Array(bins);
  const re = new Float64Array(frame);
  const im = new Float64Array(frame);
  let frames = 0;
  let sq = 0;
  let count = 0;
  for (const c of chunks) {
    for (let i = 0; i < c.length; i++) sq += c[i] * c[i];
    count += c.length;
    for (let s = 0; s + frame <= c.length; s += hop) {
      for (let i = 0; i < frame; i++) { re[i] = c[s + i] * w[i]; im[i] = 0; }
      fft(re, im, false);
      for (let k = 0; k < bins; k++) power[k] += re[k] * re[k] + im[k] * im[k];
      frames++;
    }
  }
  if (frames === 0) return null;
  for (let k = 0; k < bins; k++) power[k] /= frames;
  return { sampleRate, frame, power, rms: count > 0 ? Math.sqrt(sq / count) : 0 };
}

/** 아주 조용한 방 — 이 아래면 잡음 빼기를 하지 않는다(안 건드리는 게 늘 안전하다). */
export const DENOISE_MIN_ROOM_RMS = 0.0025;

/**
 * 잡음 지문만큼 빼기.
 *
 * 소리를 21ms 조각(절반씩 겹침, 한 창)으로 나눠 주파수별로 보고, 그 자리의 잡음
 * 파워(지문 × alpha)를 뺀 만큼만 남긴다. 다 빼지 않고 `floor`(기본 0.15 = 약 -16dB)
 * 까지만 누른다 — 끝까지 빼면 '뮤지컬 노이즈'라는 반짝이는 잡음이 새로 생긴다.
 * 조각 사이의 흔들림은 닫힐 때만 천천히 하게 해서(열릴 땐 즉시) 말 첫소리를 물지 않는다.
 *
 * 지문의 표본율이 다르면 주파수 축을 맞춰 옮겨 쓴다.
 */
export function denoise(
  x: Float32Array,
  sampleRate: number,
  profile: NoiseProfile | null,
  opts: { alpha?: number; floor?: number } = {},
): Float32Array {
  if (!profile || !(profile.rms >= DENOISE_MIN_ROOM_RMS)) return x;
  const alpha = opts.alpha ?? 1.5;
  const floor = opts.floor ?? 0.15;
  const frame = frameSizeFor(sampleRate);
  const hop = frame >> 1;
  const bins = hop + 1;
  const w = hann(frame);

  // 지문을 이 표본율·조각 길이의 주파수 축으로 옮긴다.
  const noise = new Float64Array(bins);
  const pBins = (profile.frame >> 1) + 1;
  for (let k = 0; k < bins; k++) {
    const hz = (k * sampleRate) / frame;
    const pos = (hz * profile.frame) / profile.sampleRate;
    const i0 = Math.min(pBins - 1, Math.floor(pos));
    const i1 = Math.min(pBins - 1, i0 + 1);
    const t = pos - i0;
    // 파워는 조각 길이에 비례하므로 길이 비율만큼 맞춘다.
    noise[k] = ((profile.power[i0] * (1 - t) + profile.power[i1] * t) * frame) / profile.frame;
  }

  const y = new Float32Array(x.length);
  const re = new Float64Array(frame);
  const im = new Float64Array(frame);
  const prevGain = new Float64Array(bins).fill(1);
  const floor2 = floor * floor;
  for (let s = -hop; s < x.length; s += hop) {
    for (let i = 0; i < frame; i++) {
      const idx = s + i;
      re[i] = idx >= 0 && idx < x.length ? x[idx] * w[i] : 0;
      im[i] = 0;
    }
    fft(re, im, false);
    for (let k = 0; k < bins; k++) {
      const p = re[k] * re[k] + im[k] * im[k];
      let g = p > 0 ? Math.sqrt(Math.max(floor2, 1 - (alpha * noise[k]) / p)) : floor;
      // 열릴 땐 바로, 닫힐 땐 서서히 — 조각마다 깜빡이는 걸 막는다.
      g = Math.max(g, prevGain[k] * 0.6);
      prevGain[k] = g;
      re[k] *= g; im[k] *= g;
      if (k > 0 && k < hop) { re[frame - k] *= g; im[frame - k] *= g; }
    }
    fft(re, im, true);
    // 분석 창(한)이 절반 겹침에서 합이 1이라 그대로 겹쳐 더하면 된다.
    for (let i = 0; i < frame; i++) {
      const idx = s + i;
      if (idx >= 0 && idx < x.length) y[idx] += re[i];
    }
  }
  return y;
}

/**
 * 노이즈 게이트 — 말하지 않는 사이의 잡음만 눌러 준다.
 *
 * 왜 브라우저 소음 제거를 안 쓰나. getUserMedia 의 noiseSuppression 은 사람 목소리
 * 자체도 깎는다. 목소리 복제는 "얼마나 똑같은가"가 전부라, 음색이 뭉개지면
 * 엄마 목소리인데 엄마 같지 않은 클론이 나온다. 그래서 그건 꺼 두고, 대신
 * **말할 때는 손대지 않고 말 사이만** 누른다.
 *
 * 기준은 녹음 전에 2초간 잰 방 소음이다. 그 방에서 실제로 깔린 소리보다 조금 위를
 * 문턱으로 삼아야, 조용한 방에서는 거의 아무 일도 안 하고 시끄러운 방에서만 일한다.
 *
 * 딱 자르지 않고 서서히 여닫는다(attack/release). 문턱을 넘자마자 소리를 켜면
 * 말 첫소리가 잘려 "ㅏ녕하세요"처럼 들리고, 끝나자마자 끄면 말꼬리가 뚝 끊긴다.
 *
 * @param roomNoise 녹음 전에 잰 방 소음(RMS). 0이면 아무것도 하지 않는다.
 */
export function noiseGate(
  x: Float32Array,
  sampleRate: number,
  roomNoise: number,
): Float32Array {
  // 방 소음을 못 쟀거나 아주 조용하면 건드리지 않는다 — 안 건드리는 게 늘 안전하다.
  if (!(roomNoise > 0.0015)) return x;

  /** 방 소음의 이 배수를 넘으면 '말하는 중'으로 본다. 2.5배면 숨소리는 통과한다. */
  const threshold = roomNoise * 2.5;
  /** 문턱 아래에서 남길 크기. 0으로 만들면 무음이 뚝 끊겨 되레 티가 난다. */
  const floor = 0.18;

  const win = Math.max(1, Math.floor(sampleRate * 0.01)); // 10ms 마다 세기를 잰다
  const attack = Math.max(1, Math.floor(sampleRate * 0.005) / win); // 5ms 만에 열고
  const release = Math.max(1, Math.floor(sampleRate * 0.12) / win); // 120ms 에 걸쳐 닫는다

  const y = new Float32Array(x.length);
  let gain = 1;
  for (let s = 0; s < x.length; s += win) {
    const e = Math.min(x.length, s + win);
    let sum = 0;
    for (let i = s; i < e; i++) sum += x[i] * x[i];
    const rms = Math.sqrt(sum / (e - s));

    const target = rms > threshold ? 1 : floor;
    // 여는 건 빠르게, 닫는 건 천천히 — 말꼬리를 물지 않게.
    const step = target > gain ? 1 / attack : 1 / release;
    for (let i = s; i < e; i++) {
      gain += (target - gain) * Math.min(1, step);
      y[i] = x[i] * gain;
    }
  }
  return y;
}
