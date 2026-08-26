import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fitScale, MIN_FIT } from "./fit-text.ts";

describe("fitScale — 본문이 칸에 들어가게 줄이기", () => {
  it("이미 들어가면 줄이지 않는다", () => {
    assert.equal(fitScale(() => true), 1);
  });

  it("들어가는 가장 큰 배율을 고른다", () => {
    // 0.7 이하면 들어가는 칸. 0.7 바로 아래를 골라야 한다.
    const scale = fitScale((s) => s <= 0.7);
    assert.ok(scale <= 0.7, `${scale} 는 0.7 보다 크면 안 된다`);
    assert.ok(scale > 0.69, `${scale} 는 0.7 에 바짝 붙어야 한다`);
  });

  it("아무리 줄여도 안 들어가면 바닥값을 준다", () => {
    // 글자가 읽을 수 없을 만큼 작아지느니 조금 잘리는 편이 낫다.
    assert.equal(fitScale(() => false), MIN_FIT);
  });

  it("바닥값 아래로는 내려가지 않는다", () => {
    const seen: number[] = [];
    fitScale((s) => {
      seen.push(s);
      return false;
    });
    assert.ok(Math.min(...seen) >= MIN_FIT, `${Math.min(...seen)} 이 바닥값보다 작다`);
  });

  it("재는 횟수만큼만 부른다 — 느려지면 넘길 때 덜컥거린다", () => {
    let calls = 0;
    fitScale(() => {
      calls += 1;
      return false;
    }, MIN_FIT, 9);
    assert.equal(calls, 10); // 1배율 확인 1번 + 이분 탐색 9번
  });

  it("긴 쪽일수록 더 많이 줄인다", () => {
    // 흥부와 놀부 7쪽(167자)처럼 긴 쪽은 짧은 쪽보다 더 작아져야 한다.
    const short = fitScale((s) => s <= 0.95);
    const long = fitScale((s) => s <= 0.55);
    assert.ok(long < short, `긴 쪽(${long})이 짧은 쪽(${short})보다 작아야 한다`);
  });
});
