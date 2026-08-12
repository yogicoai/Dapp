import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  CLONE_MAX_SECONDS,
  CLONE_SAMPLE_RATE,
  cloneWavBytes,
  lowPass,
  resample,
  toneLevel,
  trimSilence,
  UPLOAD_LIMIT_BYTES,
} from "./voice-dsp.ts";

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
