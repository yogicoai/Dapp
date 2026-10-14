import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { acceptPastPicture, HISTORY_MAX, historyFloor, pastPictures, picturesSince } from "./family-history.ts";

const PREFIX = "https://cdn.example.com/app/family/99f8932a-c8dc-4e5a-84f3-2311fc189a93/";
const H1 = "a".repeat(32);
const H2 = "b".repeat(32);
const H3 = "c".repeat(32);
// 2026-09-29, 2026-09-30, 2026-10-02 (ms)
const T1 = 1790640000000;
const T2 = 1790726400000;
const T3 = 1790899200000;

describe("예전 그림 목록 — 폴더의 파일 이름에서 그 사람 그림을 고른다", () => {
  const names = [
    `child-${T1}-${H1}.png`,
    `child-${T1}-${H1}-ref.jpg`,
    `child-${T3}-${H3}.png`,
    `child-${T3}-${H3}-ref.jpg`,
    `child-${T2}-${H2}-ref.jpg`,
    `child-${T2}-${H2}.png`,
    // 다른 사람·옷 갈아입기·엉뚱한 파일
    `mom-${T2}-${H1}.png`,
    `mom-${T2}-${H1}-ref.jpg`,
    `child-outfit-beach-${T2}-${H1}.webp`,
    "notes.txt",
  ];

  it("새것부터, 두 주소와 그린 때를 돌려준다", () => {
    const pics = pastPictures(names, "child", PREFIX);
    assert.equal(pics.length, 3);
    assert.deepEqual(pics.map((p) => p.url), [`${PREFIX}child-${T3}-${H3}.png`, `${PREFIX}child-${T2}-${H2}.png`, `${PREFIX}child-${T1}-${H1}.png`]);
    assert.equal(pics[0].ref, `${PREFIX}child-${T3}-${H3}-ref.jpg`);
    assert.equal(pics[0].at, new Date(T3).toISOString());
  });

  it("다른 사람 그림은 섞이지 않는다 — 엄마는 엄마 것만", () => {
    assert.deepEqual(pastPictures(names, "mom", PREFIX).map((p) => p.url), [`${PREFIX}mom-${T2}-${H1}.png`]);
    assert.deepEqual(pastPictures(names, "dad", PREFIX), []);
  });

  it("두 장(화면용·참고용)이 다 있는 그림만 — 한 장만 올라간 것은 뺀다", () => {
    const half = [`dad-${T1}-${H1}.png`, `dad-${T2}-${H2}-ref.jpg`, `dad-${T3}-${H3}.png`, `dad-${T3}-${H3}-ref.jpg`];
    assert.deepEqual(pastPictures(half, "dad", PREFIX).map((p) => p.at), [new Date(T3).toISOString()]);
  });

  it("이름이 이 사람으로 시작해도 다른 id 면 아니다(m-1 ≠ m-12) · 옷 갈아입기 그림은 아니다", () => {
    const list = [`m-12-${T1}-${H1}.png`, `m-12-${T1}-${H1}-ref.jpg`, `m-1-${T2}-${H2}.png`, `m-1-${T2}-${H2}-ref.jpg`];
    assert.deepEqual(pastPictures(list, "m-1", PREFIX).map((p) => p.url), [`${PREFIX}m-1-${T2}-${H2}.png`]);
    assert.deepEqual(pastPictures(names, "child-outfit-beach", PREFIX), []);
  });

  it("최대 장수까지만 — 새것부터 남긴다", () => {
    const many: string[] = [];
    for (let i = 0; i < HISTORY_MAX + 5; i++) {
      const hash = i.toString(16).padStart(32, "0");
      many.push(`child-${T1 + i * 1000}-${hash}.png`, `child-${T1 + i * 1000}-${hash}-ref.jpg`);
    }
    const pics = pastPictures(many, "child", PREFIX);
    assert.equal(pics.length, HISTORY_MAX);
    assert.equal(pics[0].at, new Date(T1 + (HISTORY_MAX + 4) * 1000).toISOString());
  });
});

describe("고른 그림 다시 검사 — 자기 폴더의 그 사람 그림만", () => {
  const url = `${PREFIX}child-${T2}-${H2}.png`;

  it("맞는 주소면 화면용·참고용 주소와 그린 때", () => {
    assert.deepEqual(acceptPastPicture(url, PREFIX, "child"), { url, ref: `${PREFIX}child-${T2}-${H2}-ref.jpg`, at: new Date(T2).toISOString() });
  });

  it("남의 폴더·바깥 주소·다른 사람·참고용 주소·쿼리 붙은 주소는 받지 않는다", () => {
    const other = "https://cdn.example.com/app/family/a6cdc5cd-11ad-4ebe-9846-3d700888246b/";
    for (const bad of [
      `${other}child-${T2}-${H2}.png`,
      `https://evil.example.com/child-${T2}-${H2}.png`,
      `${PREFIX}mom-${T2}-${H2}.png`,
      `${PREFIX}child-${T2}-${H2}-ref.jpg`,
      `${url}?v=2`,
      `${PREFIX}../x/child-${T2}-${H2}.png`,
      `${PREFIX}child-${T2}-${H2}.png.exe`,
      "",
      null,
      42,
    ]) {
      assert.equal(acceptPastPicture(bad, PREFIX, "child"), null, String(bad));
    }
    assert.equal(acceptPastPicture(url, null, "child"), null);
  });
});

describe("뺐다가 다시 넣은 사람 — 그 앞의 그림은 감춘다", () => {
  const pics = [
    { url: "c", ref: "c", at: new Date(T3).toISOString() },
    { url: "b", ref: "b", at: new Date(T2).toISOString() },
    { url: "a", ref: "a", at: new Date(T1).toISOString() },
  ];

  it("since 뒤에 그린 그림만 · since 가 없거나 이상하면 모두", () => {
    assert.deepEqual(picturesSince(pics, new Date(T2).toISOString()).map((p) => p.url), ["c", "b"]);
    assert.equal(picturesSince(pics, undefined).length, 3);
    assert.equal(picturesSince(pics, "언젠가").length, 3);
  });

  it("넣은 때와 뺀 기록 가운데 가장 나중 — 다른 사람의 뺀 기록은 보지 않는다", () => {
    const added = new Date(T1).toISOString();
    const removedLater = new Date(T2).toISOString();
    assert.equal(historyFloor({ id: "mom", addedAt: added }, [{ id: "mom", at: removedLater }, { id: "dad", at: new Date(T3).toISOString() }]), removedLater);
    assert.equal(historyFloor({ id: "mom", addedAt: added }, []), added);
    // 처음부터 있던 사람(옛 값 — 넣은 때 없음)은 모두 보인다
    assert.equal(historyFloor({ id: "child" }, undefined), undefined);
  });
});
