import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  CLONE_MAX_SECONDS,
  CLONE_SAMPLE_RATE,
  buildNoiseProfile,
  cloneWavBytes,
  denoise,
  highPass,
  lowPass,
  normalizeLoudness,
  resample,
  softLimit,
  toneLevel,
  trimSilence,
  UPLOAD_LIMIT_BYTES,
} from "./voice-dsp.ts";

/** 구간의 RMS. */
function rmsOf(x: Float32Array, from = 0, to = x.length): number {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, to - from));
}

/** 같은 씨앗이면 같은 잡음 — 시험이 흔들리지 않게. 균등분포 [-a, a]라 RMS는 a/√3. */
function whiteNoise(n: number, amplitude: number, seed = 1): Float32Array {
  let s = seed >>> 0;
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    x[i] = ((s / 4294967296) * 2 - 1) * amplitude;
  }
  return x;
}

const FROM = 44100;
const TO = 16000;

/** 특정 주파수의 순수한 소리를 만든다. */
function tone(freq: number, rate: number, seconds = 1): Float32Array {
  const n = Math.floor(rate * seconds);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = 0.5 * Math.sin((2 * Math.PI * freq * i) / rate);
  return x;
}

describe("resample — 표본율을 낮출 때 높은 소리가 접혀 들어오지 않는다", () => {
  /*
   * 이게 이 파일이 있는 이유다.
   *
   * 걸러내지 않고 44.1kHz를 16kHz로 줄이면, 13kHz 소리가 사라지는 게 아니라
   * |13000 - 16000| = 3000Hz 자리에 가짜로 나타난다. 목소리 한가운데다.
   * 치찰음(ㅅ·ㅊ·ㅍ)이 이 대역에 세서, 녹음은 내 목소리인데 클론에는
   * 쇳소리가 섞여 다른 사람처럼 들렸다.
   */
  for (const [input, folded] of [
    [9000, 7000],
    [11000, 5000],
    [13000, 3000],
  ] as const) {
    it(`${input}Hz가 ${folded}Hz 자리에 나타나지 않는다`, () => {
      const out = resample(tone(input, FROM), FROM, TO);
      const ghost = toneLevel(out, folded, TO);
      assert.ok(ghost < 0.02, `${folded}Hz에 가짜 소리가 남았다: ${ghost.toFixed(4)}`);
    });
  }

  it("사람 목소리 대역(1kHz)은 그대로 지나간다", () => {
    // 접힘을 막겠다고 목소리까지 깎으면 그건 더 나쁜 고침이다.
    const out = resample(tone(1000, FROM), FROM, TO);
    assert.ok(toneLevel(out, 1000, TO) > 0.15, "1kHz가 너무 깎였다");
  });

  it("치찰음이 사는 4kHz도 살아남는다", () => {
    const out = resample(tone(4000, FROM), FROM, TO);
    assert.ok(toneLevel(out, 4000, TO) > 0.1, "4kHz가 너무 깎였다");
  });

  it("표본율이 같으면 손대지 않는다", () => {
    const x = tone(1000, TO);
    assert.equal(resample(x, TO, TO), x);
  });

  it("길이가 표본율 비율대로 줄어든다", () => {
    assert.equal(resample(tone(1000, FROM), FROM, TO).length, Math.floor((FROM * 1) / (FROM / TO)));
  });
});

describe("lowPass", () => {
  it("자르는 지점 위는 확실히 줄인다", () => {
    const x = tone(12000, FROM);
    const before = toneLevel(x, 12000, FROM);
    const after = toneLevel(lowPass(x, FROM, 7200), 12000, FROM);
    assert.ok(after < before / 10, `12kHz가 덜 깎였다: ${before.toFixed(3)} → ${after.toFixed(3)}`);
  });

  it("자르는 지점 아래는 거의 그대로 둔다", () => {
    const x = tone(1000, FROM);
    const before = toneLevel(x, 1000, FROM);
    const after = toneLevel(lowPass(x, FROM, 7200), 1000, FROM);
    assert.ok(after > before * 0.8, `1kHz가 깎였다: ${before.toFixed(3)} → ${after.toFixed(3)}`);
  });
});

describe("클로닝 업로드 예산", () => {
  it("가장 길게 읽어도 요청 한도 안에 들어온다", () => {
    // 이걸 넘기면 413이 나서 목소리를 아예 못 만든다. 표본율이나 길이를 올릴 때
    // 반드시 여기가 먼저 깨지도록 둔다.
    const worst = cloneWavBytes(CLONE_MAX_SECONDS);
    assert.ok(worst < UPLOAD_LIMIT_BYTES, `${(worst / 1048576).toFixed(2)}MB — 한도를 넘는다`);
  });

  it("한도의 90%도 넘지 않는다 — 헤더·전송 오버헤드 여유", () => {
    assert.ok(cloneWavBytes(CLONE_MAX_SECONDS) < UPLOAD_LIMIT_BYTES * 0.9);
  });

  it("실제 녹음 길이(두 문장 × 35초)는 상한 안에 있다", () => {
    assert.ok(35 * 2 < CLONE_MAX_SECONDS, "실제 녹음이 상한에 잘리면 안 된다");
  });

  it("공기감이 담기는 표본율이다 — 8kHz 위가 살아남는다", () => {
    assert.ok(CLONE_SAMPLE_RATE / 2 > 8000, "나이퀴스트가 8kHz 이하면 공기감을 못 담는다");
  });
});

describe("trimSilence — 조용히 녹음해도 말소리를 깎지 않는다", () => {
  /** 말소리처럼 들쭉날쭉한 신호 + 앞뒤 침묵. */
  function speech(amplitude: number, rate = 24000): Float32Array {
    const n = rate * 3;
    const x = new Float32Array(n);
    for (let i = rate; i < rate * 2; i++) {
      // 200Hz 기본음에 배음을 얹어 말소리 비슷하게
      const t = i / rate;
      x[i] = amplitude * (Math.sin(2 * Math.PI * 200 * t) + 0.4 * Math.sin(2 * Math.PI * 700 * t));
    }
    return x;
  }

  it("크게 녹음한 말소리를 지킨다", () => {
    const out = trimSilence(speech(0.5), 24000);
    assert.ok(out.length > 24000 * 0.9, `너무 많이 잘렸다: ${out.length}`);
  });

  it("작게 녹음한 말소리도 지킨다 — 예전에는 통째로 잘렸다", () => {
    // 진폭 0.02는 옛 고정 기준(0.012)에 걸려 말소리가 침묵으로 오인되던 크기다.
    const out = trimSilence(speech(0.02), 24000);
    assert.ok(out.length > 24000 * 0.9, `작게 녹음한 말이 잘렸다: ${out.length}`);
  });

  it("앞뒤 침묵은 잘라낸다", () => {
    const out = trimSilence(speech(0.5), 24000);
    assert.ok(out.length < 24000 * 3, "침묵이 그대로 남았다");
  });

  it("전부 조용하면 손대지 않는다", () => {
    const silent = new Float32Array(24000);
    assert.equal(trimSilence(silent, 24000).length, silent.length);
  });
});

describe("trimSilence — 문장 사이 쉼은 살린다", () => {
  const RATE = 24000;
  /** 말 1초 + 쉼 gapSec + 말 1초. 앞뒤 침묵은 없다. */
  function twoPhrases(gapSec: number): Float32Array {
    const gap = Math.floor(RATE * gapSec);
    const x = new Float32Array(RATE * 2 + gap);
    const say = (from: number) => {
      for (let i = from; i < from + RATE; i++) {
        const t = i / RATE;
        x[i] = 0.5 * (Math.sin(2 * Math.PI * 200 * t) + 0.4 * Math.sin(2 * Math.PI * 700 * t));
      }
    };
    say(0);
    say(RATE + gap);
    return x;
  }

  it("0.6초 쉼은 그대로 둔다 — 예전엔 0.3초 넘는 쉼을 전부 잘라 급하게 읽는 클론이 됐다", () => {
    const out = trimSilence(twoPhrases(0.6), RATE);
    assert.ok(out.length >= RATE * 2.55, `쉼이 잘렸다: ${(out.length / RATE).toFixed(2)}초`);
  });

  it("1.5초 쉼은 0.5초로 줄인다", () => {
    const out = trimSilence(twoPhrases(1.5), RATE);
    const sec = out.length / RATE;
    assert.ok(sec > 2.4 && sec < 2.65, `기대 2.5초 근처, 실제 ${sec.toFixed(2)}초`);
  });
});

describe("highPass — 전원 험은 깎고 목소리는 둔다", () => {
  it("60Hz 험을 -12dB 아래로 내린다", () => {
    const x = tone(60, FROM, 2);
    const ratio = toneLevel(highPass(x, FROM), 60, FROM) / toneLevel(x, 60, FROM);
    assert.ok(ratio < 0.25, `60Hz가 덜 깎였다: ${ratio.toFixed(3)}`);
  });

  it("남자 목소리 기본음(120Hz)은 대부분 남긴다", () => {
    const x = tone(120, FROM, 2);
    const ratio = toneLevel(highPass(x, FROM), 120, FROM) / toneLevel(x, 120, FROM);
    assert.ok(ratio > 0.7, `120Hz가 너무 깎였다: ${ratio.toFixed(3)}`);
  });

  it("1kHz는 그대로 지나간다", () => {
    const x = tone(1000, FROM, 2);
    const ratio = toneLevel(highPass(x, FROM), 1000, FROM) / toneLevel(x, 1000, FROM);
    assert.ok(ratio > 0.97, `1kHz가 깎였다: ${ratio.toFixed(3)}`);
  });
});

describe("normalizeLoudness — 말소리 평균 크기를 맞춘다", () => {
  const RATE = 24000;
  /** 앞뒤 1초 침묵 + 가운데 1초 말소리. 파열음처럼 튀는 점 하나를 넣을 수 있다. */
  function speech(amplitude: number, pop = 0): Float32Array {
    const x = new Float32Array(RATE * 3);
    for (let i = RATE; i < RATE * 2; i++) {
      const t = i / RATE;
      x[i] = amplitude * (Math.sin(2 * Math.PI * 200 * t) + 0.4 * Math.sin(2 * Math.PI * 700 * t));
    }
    if (pop > 0) x[Math.floor(RATE * 1.5)] = pop;
    return x;
  }

  it("작은 녹음을 목표 크기(-20dBFS)로 키운다", () => {
    const out = normalizeLoudness(speech(0.01), RATE);
    const rms = rmsOf(out, RATE, RATE * 2);
    assert.ok(rms > 0.08 && rms < 0.12, `말소리 RMS ${rms.toFixed(3)} — 0.1 근처여야 한다`);
  });

  it("튀는 점 하나 때문에 전체가 작게 남지 않는다 — 예전 최대값 기준의 문제", () => {
    const out = normalizeLoudness(speech(0.01, 0.9), RATE);
    const rms = rmsOf(out, RATE, RATE * 2);
    assert.ok(rms > 0.08, `파열음 한 점에 눌려 작게 남았다: ${rms.toFixed(3)}`);
    let peak = 0;
    for (const v of out) peak = Math.max(peak, Math.abs(v));
    assert.ok(peak <= 0.95, `리미터를 넘었다: ${peak.toFixed(3)}`);
  });

  it("너무 큰 녹음은 줄인다", () => {
    const x = speech(0.9);
    const out = normalizeLoudness(x, RATE);
    assert.ok(rmsOf(out, RATE, RATE * 2) < rmsOf(x, RATE, RATE * 2), "큰 녹음이 줄지 않았다");
  });

  it("말이 없으면 손대지 않는다", () => {
    const silent = new Float32Array(RATE);
    assert.equal(normalizeLoudness(silent, RATE), silent);
  });

  it("softLimit — 0.8까지 그대로, 그 위는 0.95를 넘지 않는다", () => {
    const out = softLimit(Float32Array.from([0.5, -0.5, 0.8, 2, -3]));
    assert.equal(out[0], 0.5);
    assert.equal(out[1], -0.5);
    assert.ok(Math.abs(out[2] - 0.8) < 1e-6);
    assert.ok(out[3] > 0.8 && out[3] <= 0.95);
    assert.ok(out[4] < -0.8 && out[4] >= -0.95);
  });
});

describe("denoise — 방 소음 지문만큼 뺀다", () => {
  const RATE = 48000;
  /** 녹음 전 2초 소음을 흉내 낸 조각들(2048씩). */
  function noiseChunks(amplitude: number, seed: number): Float32Array[] {
    return Array.from({ length: 40 }, (_, i) => whiteNoise(2048, amplitude, seed + i));
  }
  const NOISE_AMP = 0.035; // RMS 약 0.02 — 소음 검사는 통과하지만 조용하진 않은 방
  const profile = buildNoiseProfile(noiseChunks(NOISE_AMP, 7), RATE);
  /** 앞 1초는 1kHz 목소리 + 잡음, 뒤 1초는 잡음만. */
  const clean = tone(1000, RATE, 1);
  const noisy = new Float32Array(RATE * 2);
  const bg = whiteNoise(RATE * 2, NOISE_AMP, 999);
  for (let i = 0; i < RATE * 2; i++) noisy[i] = bg[i] + (i < RATE ? clean[i] * 0.4 : 0);

  it("지문이 만들어진다", () => {
    assert.ok(profile, "지문이 없다");
    assert.ok(Math.abs(profile!.rms - 0.02) < 0.004, `지문 RMS ${profile!.rms.toFixed(4)}`);
  });

  it("말 없는 구간의 잡음을 절반 아래로 줄인다", () => {
    const out = denoise(noisy, RATE, profile);
    const before = rmsOf(noisy, RATE + 2048, RATE * 2);
    const after = rmsOf(out, RATE + 2048, RATE * 2);
    assert.ok(after < before * 0.5, `잡음이 덜 줄었다: ${before.toFixed(4)} → ${after.toFixed(4)}`);
  });

  it("목소리(1kHz)는 살아남는다", () => {
    const out = denoise(noisy, RATE, profile);
    const before = toneLevel(noisy.subarray(0, RATE), 1000, RATE);
    const after = toneLevel(out.subarray(0, RATE), 1000, RATE);
    assert.ok(after > before * 0.85, `목소리가 깎였다: ${before.toFixed(4)} → ${after.toFixed(4)}`);
  });

  it("조용한 방(지문이 아주 작음)에서는 손대지 않는다", () => {
    const quiet = buildNoiseProfile(noiseChunks(0.001, 3), RATE);
    assert.equal(denoise(noisy, RATE, quiet), noisy);
    assert.equal(denoise(noisy, RATE, null), noisy);
  });

  it("표본율이 다른 지문도 주파수 축을 맞춰 쓴다", () => {
    const p44 = buildNoiseProfile(noiseChunks(NOISE_AMP, 5), 44100);
    const out = denoise(noisy, RATE, p44);
    const before = rmsOf(noisy, RATE + 2048, RATE * 2);
    const after = rmsOf(out, RATE + 2048, RATE * 2);
    assert.ok(after < before * 0.6, `다른 표본율 지문이 안 먹었다: ${before.toFixed(4)} → ${after.toFixed(4)}`);
  });

  it("이어 붙인 결과 길이가 같고, 잡음 없는 소리는 거의 그대로다", () => {
    const out = denoise(noisy, RATE, profile);
    assert.equal(out.length, noisy.length);
    // 잡음보다 훨씬 큰 소리(0.4)는 창 겹침 오차 없이 지나가야 한다.
    const loud = tone(1000, RATE, 1);
    const strong = new Float32Array(RATE);
    for (let i = 0; i < RATE; i++) strong[i] = loud[i] + bg[i];
    const passed = denoise(strong, RATE, profile);
    const ratio = toneLevel(passed, 1000, RATE) / toneLevel(loud, 1000, RATE);
    assert.ok(ratio > 0.95 && ratio < 1.05, `겹침 합이 1이 아니다: ${ratio.toFixed(3)}`);
  });
});
