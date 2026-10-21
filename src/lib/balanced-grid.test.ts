import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { balancedCols, lonelyLast } from "./balanced-grid.ts";

describe("고르는 칸을 고르게 — 마지막 줄에 하나만 홀로 남지 않게(2026-10-21 '3개 + 1개'면 '2개 + 2개')", () => {
  it("한 줄 최대 3칸일 때", () => {
    const rows = (n: number) => {
      const c = balancedCols(n, 3);
      const out: number[] = [];
      for (let left = n; left > 0; left -= c) out.push(Math.min(c, left));
      return out.join("+");
    };
    assert.equal(rows(1), "1");
    assert.equal(rows(2), "2");
    assert.equal(rows(3), "3");
    assert.equal(rows(4), "2+2");
    assert.equal(rows(5), "3+2");
    assert.equal(rows(6), "3+3");
    assert.equal(rows(8), "3+3+2");
    assert.equal(rows(10), "2+2+2+2+2");
  });
  it("어떻게 나눠도 하나가 남으면(7개) 3칸으로 두고 그 하나를 가운데에", () => {
    assert.equal(balancedCols(7, 3), 3);
    assert.equal(lonelyLast(7, 3), true);
    assert.equal(lonelyLast(4, 2), false);
    assert.equal(lonelyLast(5, 3), false);
    assert.equal(lonelyLast(3, 3), false);
  });
  it("동화 만들기 질문 칸이 쓴다", () => {
    const src = readFileSync(new URL("../components/create/QuestionFlow.tsx", import.meta.url), "utf8");
    assert.ok(src.includes("balancedCols("));
  });
});
