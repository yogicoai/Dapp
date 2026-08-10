import test from "node:test";
import assert from "node:assert/strict";

import {
  bookTokenCost,
  COST_ILLUSTRATED_PER_PAGE,
  COST_TEXT_PER_PAGE,
  illustrationTokenCost,
  scriptTokenCost,
} from "./tokens.ts";

/*
 * 값을 대본과 그림 두 번에 나눠 받는다. 여기서 지켜야 할 것은 하나뿐 —
 * 나눠 받은 합이 예전 한 번에 받던 값과 같아야 한다. 나누기만 한 것이지 올린 게 아니다.
 * 이 약속이 깨지면 부모는 같은 책에 돈을 더 낸다.
 */
test("나눠 받은 값의 합 = 예전 그림동화 한 권 값", () => {
  for (let pages = 3; pages <= 8; pages++) {
    assert.equal(
      scriptTokenCost(pages) + illustrationTokenCost(pages),
      bookTokenCost(pages, true),
      `${pages}장에서 합이 어긋난다`,
    );
  }
});

test("대본만 받고 끝내면 글 동화 한 권 값이다", () => {
  for (let pages = 3; pages <= 8; pages++) {
    assert.equal(scriptTokenCost(pages), bookTokenCost(pages, false));
  }
});

test("장수만큼 늘어난다", () => {
  assert.equal(scriptTokenCost(6), 6 * COST_TEXT_PER_PAGE);
  assert.equal(illustrationTokenCost(6), 6 * (COST_ILLUSTRATED_PER_PAGE - COST_TEXT_PER_PAGE));
});

test("0장이나 음수가 들어와도 공짜가 되지 않는다", () => {
  // 장수는 화면에서 3~8로 막혀 있지만, 값 계산이 0을 돌려주면 공짜 책이 나온다.
  assert.ok(scriptTokenCost(0) >= 1);
  assert.ok(illustrationTokenCost(0) >= 1);
  assert.ok(scriptTokenCost(-5) >= 1);
});
