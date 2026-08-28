import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { heroIdentity, looksToDrawingPrompt, wearableItems } from "./child-looks.ts";

describe("looksToDrawingPrompt — 칩을 영어로", () => {
  it("고른 항목만 영어로 바꿔 잇는다", () => {
    const out = looksToDrawingPrompt({
      hair: "단발",
      hairTexture: "곧은 생머리",
      hairColor: "까만색",
      eyes: "크고 동그래요",
      color: "파랑",
      marks: ["보조개"],
      glasses: true,
    });
    assert.ok(out.includes("black hair, a chin-length bob"), out);
    assert.ok(out.includes("completely straight hair"), out);
    assert.ok(out.includes("big round eyes"), out);
    assert.ok(out.includes("blue"), out);
    assert.ok(out.includes("dimples"), out);
    assert.ok(out.includes("wears glasses"), out);
    assert.ok(!/[가-힣]/.test(out), `한국어가 남았다: ${out}`);
  });

  it("몸에 붙는 것만 남기고 인형·담요는 뺀다 — 쪽별 물건 잠금과 싸우지 않게", () => {
    const out = looksToDrawingPrompt({ items: ["곰인형", "모자", "담요", "머리핀"] });
    assert.ok(out.includes("hat"), out);
    assert.ok(out.includes("hair pin"), out);
    assert.ok(!/teddy|bear|blanket|곰인형|담요/.test(out), out);
    assert.deepEqual(wearableItems(["곰인형", "모자", "담요", "머리핀"]), ["모자", "머리핀"]);
  });

  it("대응표에 없는 값과 부모 메모는 그대로 남긴다", () => {
    const out = looksToDrawingPrompt({ hair: "레게머리", note: "늘 공룡 티셔츠를 입어요" });
    assert.ok(out.includes("레게머리"), out);
    assert.ok(out.includes("공룡 티셔츠"), out);
  });

  it("아무것도 안 골랐으면 빈 문자열", () => {
    assert.equal(looksToDrawingPrompt(undefined), "");
    assert.equal(looksToDrawingPrompt({}), "");
  });
});

describe("heroIdentity", () => {
  it("나이와 성별을 영어로", () => {
    assert.equal(heroIdentity(5, "boy"), "a 5-year-old Korean boy");
    assert.equal(heroIdentity(9, "girl"), "an 8-to-10-year-old Korean girl");
    assert.equal(heroIdentity(null, "unspecified"), "a young Korean child");
  });
});
