import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

import { LIVE_READ_TEMPO, liveReadCacheId, liveReadFallbackId } from "./read-tempo.ts";

describe("LIVE_READ_TEMPO — 실시간 낭독 빠르기", () => {
  it("조금만 늦춘다 — 서버가 받는 0.5~2 안이고, 1보다 작되 0.85보다 크다", () => {
    // 너무 늦추면 늘어진 소리가 난다. 만든 동화가 구운 책보다 5~25% 빨랐던 만큼만 당긴다.
    assert.ok(LIVE_READ_TEMPO < 1);
    assert.ok(LIVE_READ_TEMPO >= 0.85);
    assert.ok(LIVE_READ_TEMPO >= 0.5 && LIVE_READ_TEMPO <= 2);
  });

  it("구운 책의 빠르기표는 그대로다 — 굽는 스크립트의 정규식으로 voices.ts 를 읽어 본다", () => {
    /*
     * bake-cast-narration.mts 는 voices.ts 성우 줄에서 'bakeTempo:' 를 정규식으로 읽어 구운 책
     * 빠르기를 정한다(read-tempo.ts 는 읽지 않는다). 실시간 빠르기를 맞춘다며 성우 줄에 bakeTempo 를
     * 더하거나 고치면 다음에 구울 때 전래·명작 낭독이 바뀐다 — 그 표를 여기서 못 박는다.
     * 정규식은 스크립트에서 그대로 꺼내 쓴다(두 벌이 되면 어긋난다).
     */
    const bake = fs.readFileSync(new URL("../../scripts/bake-cast-narration.mts", import.meta.url), "utf8");
    const literal = bake.match(/matchAll\(\/(.*?bakeTempo.*?)\/g\)/)?.[1];
    assert.ok(literal, "굽는 스크립트에서 bakeTempo 정규식을 못 찾았다 — 스크립트가 바뀌었으면 이 시험도 고친다");
    const voices = fs.readFileSync(new URL("./voices.ts", import.meta.url), "utf8");
    const table = Object.fromEntries([...voices.matchAll(new RegExp(literal, "g"))].map((m) => [m[1], Number(m[2])]));
    assert.deepEqual(table, {
      "tc-ina": 0.85,
      "tc-changsu": 0.83,
      "tc-jinseo": 0.8,
      "tc-seojoon": 0.83,
      "tc-hyemin": 0.85,
      "tc-heejoon": 0.88,
      "tc-gahee": 0.88,
    });
  });
});

describe("liveReadCacheId — 기기 캐시 열쇠", () => {
  const base = { voiceId: "tc_abc", textHash: "k3j9" };

  it("빠르기가 1이면 09-29까지의 열쇠와 똑같다 — 1로 되돌리면 담긴 소리를 그대로 쓴다", () => {
    assert.equal(liveReadCacheId({ ...base, tempo: 1 }), "tts-read-v3:tc_abc:normal:-:k3j9");
    assert.equal(
      liveReadCacheId({ ...base, emotion: "happy", intensity: 0.5, tempo: 1 }),
      "tts-read-v3:tc_abc:happy:0.50:k3j9",
    );
  });

  it("빠르기가 1이 아니면 열쇠에 빠르기가 들어가 옛 소리와 섞이지 않는다", () => {
    const slow = liveReadCacheId({ ...base, tempo: LIVE_READ_TEMPO });
    assert.notEqual(slow, liveReadCacheId({ ...base, tempo: 1 }));
    assert.match(slow, new RegExp(`:t${LIVE_READ_TEMPO.toFixed(2)}:k3j9$`));
    assert.notEqual(slow, liveReadCacheId({ ...base, tempo: 0.8 }));
  });

  it("느린 열쇠에 소리가 없으면 옛 열쇠(빠르기 1)를 찾아본다 — 이미 들은 책을 다시 사지 않는다", () => {
    const slow = { ...base, emotion: "happy", intensity: 0.5, tempo: LIVE_READ_TEMPO };
    assert.equal(liveReadFallbackId(slow), liveReadCacheId({ ...slow, tempo: 1 }));
    assert.equal(liveReadFallbackId(slow), "tts-read-v3:tc_abc:happy:0.50:k3j9");
    // 빠르기 1은 이미 옛 열쇠라 따로 찾아볼 곳이 없다.
    assert.equal(liveReadFallbackId({ ...base, tempo: 1 }), null);
  });

  it("감정·세기가 다르면 열쇠도 다르다", () => {
    const a = liveReadCacheId({ ...base, emotion: "happy", intensity: 0.5, tempo: 0.9 });
    const b = liveReadCacheId({ ...base, emotion: "sad", intensity: 0.5, tempo: 0.9 });
    const c = liveReadCacheId({ ...base, emotion: "happy", intensity: 0.6, tempo: 0.9 });
    assert.equal(new Set([a, b, c]).size, 3);
  });
});
