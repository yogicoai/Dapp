import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { capPieceLengths } from "./voice-trim.ts";

/**
 * 부모가 서로 다른 두 문장을 읽는데, 예전에는 다 이어 붙인 뒤 뒤를 잘랐다.
 * 그러면 길게 읽었을 때 두 번째 문장이 통째로 사라져 발음 재료가 반으로 줄었다.
 * 이 함수는 조각마다 앞부분을 남겨 두 문장이 모두 살아남게 한다.
 */
describe("capPieceLengths", () => {
  it("상한 안이면 그대로 둔다", () => {
    assert.deepEqual(capPieceLengths([100, 200], 1000), [100, 200]);
  });

  it("넘치면 두 문장이 모두 살아남는다 — 하나가 통째로 사라지지 않는다", () => {
    const kept = capPieceLengths([800, 800], 1000);
    assert.deepEqual(kept, [500, 500]);
    assert.ok(kept.every((n) => n > 0), "어느 문장도 0이 되면 안 된다");
  });

  it("짧아서 안 쓰는 몫은 긴 문장에 넘겨 상한을 알뜰히 채운다", () => {
    const kept = capPieceLengths([100, 5000], 1000);
    assert.deepEqual(kept, [100, 900]);
    assert.equal(
      kept.reduce((n, v) => n + v, 0),
      1000,
    );
  });

  it("길이가 뒤죽박죽이어도 상한을 넘지 않는다", () => {
    const lengths = [10, 4000, 300, 900];
    const kept = capPieceLengths(lengths, 1000);
    assert.ok(
      kept.reduce((n, v) => n + v, 0) <= 1000,
      `합계 ${kept.reduce((n, v) => n + v, 0)}`,
    );
    kept.forEach((n, i) => assert.ok(n <= lengths[i], `${i}번은 원래보다 길 수 없다`));
  });

  it("빈 목록은 빈 목록", () => {
    assert.deepEqual(capPieceLengths([], 1000), []);
  });
});
