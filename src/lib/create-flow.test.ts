import test from "node:test";
import assert from "node:assert/strict";
import {
  isRedoExhausted,
  MAKE_STEPS,
  makeScriptBlock,
  paidPlot,
  redoLeft,
  restorePaidOutline,
  restorePendingPlot,
  resumeStep,
  reusablePlot,
} from "./create-flow.ts";

test("MAKE_STEPS — 부모에게 보이는 순서는 셋", () => {
  assert.deepEqual([...MAKE_STEPS], ["대본 만들기", "그림 그리기", "동화 완성"]);
});

test("redoLeft — 두 단추가 무료 횟수를 함께 쓴다", async (t) => {
  const base = { master: false, used: 0, maxFree: 2, replots: 0, maxReplots: 3 };
  await t.test("처음엔 가격표 횟수만큼", () => {
    assert.deepEqual(redoLeft(base), { rewrite: 2, replot: 2 });
  });
  await t.test("다시 쓰기든 새로 짓기든 한 번 쓰면 둘 다 줄어든다(서버가 한 줄거리에 센다)", () => {
    assert.deepEqual(redoLeft({ ...base, used: 1, replots: 1 }), { rewrite: 1, replot: 1 });
    assert.deepEqual(redoLeft({ ...base, used: 1, replots: 0 }), { rewrite: 1, replot: 1 });
  });
  await t.test("다 쓰면 0 — 음수가 되지 않는다", () => {
    assert.deepEqual(redoLeft({ ...base, used: 2 }), { rewrite: 0, replot: 0 });
    assert.deepEqual(redoLeft({ ...base, used: 5 }), { rewrite: 0, replot: 0 });
  });
  await t.test("관리실에서 무료 횟수를 늘려도 새로 짓기는 상한까지만", () => {
    assert.deepEqual(redoLeft({ ...base, maxFree: 10, used: 3, replots: 3 }), { rewrite: 7, replot: 0 });
  });
  await t.test("무료 다시 쓰기를 0으로 정하면 둘 다 막힌다", () => {
    assert.deepEqual(redoLeft({ ...base, maxFree: 0 }), { rewrite: 0, replot: 0 });
  });
  await t.test("관리자는 세지 않는다", () => {
    assert.deepEqual(redoLeft({ ...base, master: true, used: 99, replots: 99 }), { rewrite: null, replot: null });
  });
});

test("paidPlot — 다시 만들 때 서버에 보낼 '값을 낸 줄거리'", () => {
  const first = { title: "처음" };
  const second = { title: "새로 지은 것" };
  // 값을 안 냈으면 보내지 않는다 — 서버가 값을 받아야 한다.
  assert.equal(paidPlot(false, first, second), null);
  // 새로 지은 뒤에도 값을 낸 것은 처음 줄거리다.
  assert.equal(paidPlot(true, first, second), first);
  // 옛 임시저장(값 낸 줄거리 칸이 없음)은 지금 줄거리가 곧 값을 낸 줄거리다.
  assert.equal(paidPlot(true, undefined, second), second);
  assert.equal(paidPlot(true, null, second), second);
  assert.equal(paidPlot(true, null, null), null);
});

test("isRedoExhausted — 무료 다시 쓰기를 다 써서 거절된 것만", () => {
  assert.equal(isRedoExhausted(402, "같은 줄거리로 다시 쓰기 횟수를 다 썼어요."), true);
  assert.equal(isRedoExhausted(402, "토큰이 부족합니다."), false);
  assert.equal(isRedoExhausted(502, "같은 줄거리로 다시 쓰기 횟수를 다 썼어요."), false);
  assert.equal(isRedoExhausted(402, undefined), false);
});

test("resumeStep — 옛 '줄거리 확인' 임시저장은 값이 나가지 않는 화면으로", async (t) => {
  await t.test("줄거리만 있던 임시저장 → 성우 화면(값은 '대본 만들기'를 눌러야 나간다)", () => {
    assert.equal(resumeStep({ step: "outline", story: null, scriptCharged: false }), "style");
    assert.equal(resumeStep({ step: "outline", story: null }), "style");
  });
  await t.test("대본 값까지 낸 대본이 들어 있으면 대본 화면(값을 또 받지 않는다)", () => {
    assert.equal(resumeStep({ step: "outline", story: { title: "x" }, scriptCharged: true }), "story");
    assert.equal(resumeStep({ step: "outline", story: { title: "x" }, scriptCharged: false }), "style");
  });
  await t.test("대본 화면은 대본이 있을 때만", () => {
    assert.equal(resumeStep({ step: "story", story: { title: "x" }, scriptCharged: true }), "story");
    assert.equal(resumeStep({ step: "story", story: null, scriptCharged: true }), "style");
  });
  await t.test("앞 단계는 그대로", () => {
    assert.equal(resumeStep({ step: "child", story: null }), "child");
    assert.equal(resumeStep({ step: "theme", story: null }), "theme");
    assert.equal(resumeStep({ step: "style", story: null }), "style");
  });
  await t.test("모르는 단계(그림·완성은 저장하지 않는다)는 주제 화면", () => {
    assert.equal(resumeStep({ step: "illustrate", story: null }), "theme");
    assert.equal(resumeStep({ step: "", story: null }), "theme");
  });
});

test("restorePaidOutline — 옛 값 낸 임시저장은 저장된 줄거리가 값 낸 줄거리", async (t) => {
  const plot = { title: "처음" };
  const paid = { title: "값 낸 것" };
  await t.test("새 임시저장은 적어 둔 값 낸 줄거리", () => {
    assert.equal(restorePaidOutline({ scriptCharged: true, outline: plot, paidOutline: paid }), paid);
  });
  await t.test("칸이 없는 옛 임시저장 — 비우면 두 번째 다시 만들기에 값이 또 나갔다", () => {
    assert.equal(restorePaidOutline({ scriptCharged: true, outline: plot }), plot);
    assert.equal(restorePaidOutline({ scriptCharged: true, outline: plot, paidOutline: null }), plot);
    // 옛 칸으로 되살린 뒤 새로 짓기를 해도 서버에 보내는 것은 처음 줄거리다.
    const restored = restorePaidOutline({ scriptCharged: true, outline: plot });
    assert.equal(paidPlot(true, restored, { title: "새로 지은 것" }), plot);
  });
  await t.test("값을 안 냈으면 없다", () => {
    assert.equal(restorePaidOutline({ scriptCharged: false, outline: plot, paidOutline: paid }), null);
    assert.equal(restorePaidOutline({ outline: plot }), null);
  });
});

test("restorePendingPlot — 대본을 못 받은 줄거리는 성우 화면으로 들고 간다", async (t) => {
  const plot = { title: "줄거리" };
  await t.test("새 임시저장(성우 화면에서 대본을 기다리다 끊김)", () => {
    const pendingPlot = { plot, basis: "재료" };
    assert.equal(restorePendingPlot({ step: "style", story: null, outline: null, pendingPlot }), pendingPlot);
  });
  await t.test("옛 '줄거리 확인' 임시저장 — 그 줄거리, 재료 열쇠는 모름", () => {
    assert.deepEqual(restorePendingPlot({ step: "outline", story: null, outline: plot }), { plot, basis: null });
    assert.deepEqual(
      restorePendingPlot({ step: "outline", story: null, outline: plot, scriptCharged: false }),
      { plot, basis: null },
    );
  });
  await t.test("대본 화면으로 되살리면 없다(대본이 이미 있다)", () => {
    assert.equal(
      restorePendingPlot({ step: "story", story: { title: "x" }, scriptCharged: true, outline: plot }),
      null,
    );
    assert.equal(
      restorePendingPlot({ step: "outline", story: { title: "x" }, scriptCharged: true, outline: plot }),
      null,
    );
  });
  await t.test("재료 화면·줄거리 없는 임시저장은 없다", () => {
    assert.equal(restorePendingPlot({ step: "theme", story: null, outline: plot }), null);
    assert.equal(restorePendingPlot({ step: "outline", story: null, outline: null }), null);
    assert.equal(restorePendingPlot({ step: "style", story: null, outline: null }), null);
  });
});

test("reusablePlot — 재료가 그대로일 때만 같은 줄거리로 다시 쓴다", () => {
  const plot = { title: "줄거리" };
  assert.equal(reusablePlot(null, "재료"), null);
  assert.equal(reusablePlot({ plot, basis: "재료" }, "재료"), plot);
  // 재료를 바꿨으면 새로 짓는다(다른 이야기다).
  assert.equal(reusablePlot({ plot, basis: "재료" }, "바꾼 재료"), null);
  // 열쇠를 모르는 옛 임시저장 것은 쓴다(재료 화면으로 가면 화면이 버린다).
  assert.equal(reusablePlot({ plot, basis: null }, "무엇이든"), plot);
});

test("makeScriptBlock — 대본 만들기를 막을 까닭", () => {
  const ok = { shortOnTokens: false, bookLimitReached: false, resuming: false };
  assert.equal(makeScriptBlock(ok), null);
  assert.equal(makeScriptBlock({ ...ok, shortOnTokens: true }), "tokens");
  assert.equal(makeScriptBlock({ ...ok, bookLimitReached: true }), "limit");
  assert.equal(makeScriptBlock({ ...ok, bookLimitReached: true, shortOnTokens: true }), "limit");
  // 끊긴 대본을 이어 쓸 때는 잔액으로 막지 않는다 — 값이 이미 나가 잔액이 줄어 있을 수 있다(서버가 가린다).
  assert.equal(makeScriptBlock({ ...ok, shortOnTokens: true, resuming: true }), null);
  assert.equal(makeScriptBlock({ ...ok, bookLimitReached: true, resuming: true }), "limit");
});
