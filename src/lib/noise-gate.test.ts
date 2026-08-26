import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { noiseGate } from "./voice-dsp.ts";

const SR = 16000;

/** 앞뒤는 잡음만, 가운데는 말소리인 신호를 만든다. */
function signal(noise: number, voice: number) {
  const x = new Float32Array(SR); // 1초
  for (let i = 0; i < x.length; i++) {
    // 잡음은 낮게 깔린 톤, 말소리는 가운데 0.3~0.7초 구간
    const speaking = i > SR * 0.3 && i < SR * 0.7;
    const amp = speaking ? voice : noise;
    x[i] = amp * Math.sin((2 * Math.PI * 200 * i) / SR);
  }
  return x;
}

/** 구간의 세기(RMS). */
function rms(x: Float32Array, from: number, to: number) {
  let sum = 0;
  for (let i = from; i < to; i++) sum += x[i] * x[i];
  return Math.sqrt(sum / (to - from));
}

describe("noiseGate — 말 사이 잡음만 누르기", () => {
  it("말 사이 잡음을 눌러 준다", () => {
    const x = signal(0.02, 0.4);
    const y = noiseGate(x, SR, 0.02);
    const before = rms(x, 0, Math.floor(SR * 0.25));
    const after = rms(y, 0, Math.floor(SR * 0.25));
    assert.ok(after < before * 0.5, `잡음이 ${before} → ${after} 로 줄어야 한다`);
  });

  it("말소리는 그대로 둔다 — 음색이 상하면 클론이 안 닮는다", () => {
    const x = signal(0.02, 0.4);
    const y = noiseGate(x, SR, 0.02);
    const a = Math.floor(SR * 0.45);
    const b = Math.floor(SR * 0.65);
    const before = rms(x, a, b);
    const after = rms(y, a, b);
    assert.ok(after > before * 0.95, `말소리가 ${before} → ${after} 로 깎이면 안 된다`);
  });

  it("방 소음을 못 쟀으면 아무것도 하지 않는다", () => {
    const x = signal(0.02, 0.4);
    assert.equal(noiseGate(x, SR, 0), x);
  });

  it("아주 조용한 방이면 건드리지 않는다", () => {
    const x = signal(0.0005, 0.4);
    assert.equal(noiseGate(x, SR, 0.0005), x);
  });

  it("길이를 바꾸지 않는다 — 뒤에 붙는 자르기·이어붙이기가 어긋난다", () => {
    const x = signal(0.02, 0.4);
    assert.equal(noiseGate(x, SR, 0.02).length, x.length);
  });

  it("말이 시작될 때 첫소리를 자르지 않는다", () => {
    // 문턱을 넘자마자 확 열지 않고 5ms 안에 열려야 'ㅏ녕하세요'가 안 된다.
    const x = signal(0.02, 0.4);
    const y = noiseGate(x, SR, 0.02);
    const start = Math.floor(SR * 0.3);
    const justAfter = rms(y, start, start + Math.floor(SR * 0.02));
    const middle = rms(y, Math.floor(SR * 0.5), Math.floor(SR * 0.6));
    assert.ok(justAfter > middle * 0.6, `말 첫머리(${justAfter})가 너무 작다`);
  });

  it("소리가 1을 넘지 않는다", () => {
    const y = noiseGate(signal(0.02, 0.9), SR, 0.02);
    assert.ok(Math.max(...y) <= 1 && Math.min(...y) >= -1);
  });
});
