import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { stallTracker } from "./audio-stall.ts";

describe("낭독이 소리 없이 멈춰 섰나(2026-10-21 견우와 직녀 — 앞뒤로 넘겨야 다시 나왔다)", () => {
  it("재생 위치가 움직이면 멈춘 게 아니다", () => {
    const check = stallTracker(4500);
    for (let t = 0; t <= 20000; t += 1000) assert.equal(check({ holding: false, position: t / 1000, now: t }), null);
  });
  it("제자리로 4.5초를 넘기면 1번째, 또 넘기면 2번째", () => {
    const check = stallTracker(4500);
    const seen: (number | null)[] = [];
    for (let t = 0; t <= 10000; t += 1000) seen.push(check({ holding: false, position: 3.2, now: t }));
    assert.deepEqual(seen, [null, null, null, null, null, 1, null, null, null, null, 2]);
  });
  it("일시정지·캐릭터 대사·화면 안 보임(holding) 동안은 세지 않고, 풀리면 처음부터 센다", () => {
    const check = stallTracker(4500);
    for (let t = 0; t <= 30000; t += 1000) assert.equal(check({ holding: true, position: 3.2, now: t }), null);
    const after: (number | null)[] = [];
    for (let t = 31000; t <= 36000; t += 1000) after.push(check({ holding: false, position: 3.2, now: t }));
    assert.deepEqual(after, [null, null, null, null, null, 1]);
  });
  it("조금이라도 움직이면 다시 센다", () => {
    const check = stallTracker(4500);
    check({ holding: false, position: 1, now: 0 });
    check({ holding: false, position: 1, now: 4000 });
    assert.equal(check({ holding: false, position: 1.1, now: 5000 }), null);
    assert.equal(check({ holding: false, position: 1.1, now: 9000 }), null);
    assert.equal(check({ holding: false, position: 1.1, now: 9500 }), 1);
  });
  it("동화 화면의 재생 길 셋(한 파일·조각 파일·실시간 성우)이 모두 감시를 건다", () => {
    const viewer = readFileSync(new URL("../components/BookViewer.tsx", import.meta.url), "utf8");
    assert.equal(viewer.match(/watchStall\(run, el,/g)?.length, 3);
    assert.ok(viewer.includes("const check = stallTracker(STALL_MS);"));
  });
});
