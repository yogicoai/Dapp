import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { introBookTitle, introTravelLine, markHomeReady, onHomeReady, starShadows } from "./app-intro.ts";

describe("앱을 켤 때 '동화 나라로 이동 중' — 밤하늘 별·홈 준비 신호(2026-10-21)", () => {
  it("별자리는 씨앗이 같으면 늘 같다 — 서버 HTML 과 화면이 어긋나지 않는다", () => {
    assert.equal(starShadows(40, 7), starShadows(40, 7));
    assert.notEqual(starShadows(40, 7), starShadows(40, 8));
  });
  it("별은 화면 안(0~100vw·vh)에 고른 밝기로 count 개", () => {
    const stars = starShadows(90, 7).split(", ");
    assert.equal(stars.length, 90);
    for (const s of stars) {
      const m = s.match(/^([\d.]+)vw ([\d.]+)vh 0 0 rgba\(255,255,255,([\d.]+)\)$/);
      assert.ok(m, s);
      assert.ok(+m[1] >= 0 && +m[1] <= 100 && +m[2] >= 0 && +m[2] <= 100, s);
      assert.ok(+m[3] >= 0.45 && +m[3] <= 1, s);
    }
  });
  it("홈 준비 신호 — 기다리던 쪽은 한 번만 듣고, 끊은 쪽은 안 듣고, 늦게 온 쪽은 바로 듣는다", () => {
    let early = 0;
    let cancelled = 0;
    onHomeReady(() => (early += 1));
    const stop = onHomeReady(() => (cancelled += 1));
    stop();
    markHomeReady();
    markHomeReady();
    assert.equal(early, 1);
    assert.equal(cancelled, 0);
    let late = 0;
    onHomeReady(() => (late += 1));
    assert.equal(late, 1);
  });
  it("홈은 준비 화면을 지나 진짜 화면을 그릴 때 알린다", () => {
    const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
    assert.ok(home.includes("if (homeReady) markHomeReady();"));
    assert.ok(home.includes("if (!homeReady) {"));
  });
});

describe("소개 화면 동화책 — 로그인한 가족이면 아이 이름(2026-10-21 사장님 \"아이 이름·얼굴, 로그인 된 상태라면\")", () => {
  it("받침이 있으면 '이'를 붙인다 — 하온이의 · 지우의", () => {
    assert.equal(introBookTitle("하온"), "하온이의 동화 나라");
    assert.equal(introBookTitle(" 지우 "), "지우의 동화 나라");
    assert.equal(introTravelLine("하온"), "하온이의 동화 나라로 가는 중");
    assert.equal(introTravelLine("지우"), "지우의 동화 나라로 가는 중");
  });
  it("이름을 모르면(손님·처음 기기) 이름 없이", () => {
    for (const n of [undefined, null, "", "  "]) {
      assert.equal(introBookTitle(n), "동화 나라");
      assert.equal(introTravelLine(n), "동화 나라로 이동 중");
    }
  });
});
