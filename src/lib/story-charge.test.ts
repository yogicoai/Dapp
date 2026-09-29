import test from "node:test";
import assert from "node:assert/strict";
import { outlineKeyOf, redoPlotProblem, storyChargeKey } from "./story-charge.ts";

const plotA = {
  title: "하온이의 나뭇잎 보물찾기",
  summary: "",
  scenes: [
    { sceneNo: 1, text: "하온이가 공원에 가요." },
    { sceneNo: 2, text: "빨간 나뭇잎을 찾아요." },
  ],
};
const plotB = {
  title: "하온이와 달님",
  summary: "",
  scenes: [
    { sceneNo: 1, text: "밤하늘에 달님이 떴어요." },
    { sceneNo: 2, text: "하온이가 인사해요." },
  ],
};

test("outlineKeyOf — 같은 줄거리는 늘 같은 지문, 다른 줄거리는 다른 지문", () => {
  assert.equal(outlineKeyOf(plotA), outlineKeyOf(structuredClone(plotA)));
  assert.notEqual(outlineKeyOf(plotA), outlineKeyOf(plotB));
  // charge_story 는 8~200자를 받는다.
  assert.equal(outlineKeyOf(plotA).length, 40);
});

test("storyChargeKey — 처음 대본은 그 줄거리로 센다(값을 받는다)", () => {
  assert.equal(storyChargeKey(plotA, null), outlineKeyOf(plotA));
});

test("storyChargeKey — 같은 줄거리로 다시 쓰기는 예전과 같은 지문", () => {
  assert.equal(storyChargeKey(plotA, plotA), outlineKeyOf(plotA));
});

test("storyChargeKey — 새로 지은 줄거리도 값을 낸 줄거리의 지문으로 센다(값을 또 받지 않게)", () => {
  assert.equal(storyChargeKey(plotB, plotA), outlineKeyOf(plotA));
  assert.notEqual(storyChargeKey(plotB, plotA), storyChargeKey(plotB, null));
});

test("redoPlotProblem — 값 낸 줄거리보다 장면이 많은 다시 만들기는 받지 않는다", () => {
  assert.equal(redoPlotProblem(6, 6), null);
  assert.equal(redoPlotProblem(5, 6), null);
  assert.match(redoPlotProblem(8, 3) ?? "", /장면 수/);
});
