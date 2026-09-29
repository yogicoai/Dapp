import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OUTFIT_HUE_FAMILIES, OUTFIT_NEUTRALS, outfitHintLine, pickOutfitPalette } from "./outfit-hint.ts";

/*
 * 이 책의 옷 색 제안 — 책마다 달라지게 뽑되, 한 책 안에서는 사람끼리 윗옷 색 갈래가 겹치지 않는다.
 */

/** 같은 씨앗이면 같은 수열 — 시험용 선형 합동 생성기 */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const familyOf = (colour: string) => OUTFIT_HUE_FAMILIES.findIndex((f) => f.includes(colour));

describe("pickOutfitPalette — 사람마다 [윗옷 색, 아래옷 색]", () => {
  it("같은 난수면 같은 결과, 다른 난수면 대개 다른 결과", () => {
    assert.deepEqual(pickOutfitPalette(4, seeded(7)), pickOutfitPalette(4, seeded(7)));
    const many = new Set(Array.from({ length: 20 }, (_, i) => JSON.stringify(pickOutfitPalette(3, seeded(i + 1)))));
    assert.ok(many.size > 10, `서로 다른 조합 ${many.size}`);
  });

  it("윗옷 색 갈래는 모두 다르고, 아래옷은 무난한 색에서", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const pairs = pickOutfitPalette(6, seeded(seed));
      assert.equal(pairs.length, 6);
      const families = pairs.map(([main]) => familyOf(main));
      assert.ok(families.every((f) => f >= 0));
      assert.equal(new Set(families).size, 6);
      assert.ok(pairs.every(([, second]) => OUTFIT_NEUTRALS.includes(second)));
      // 흰 옷은 옷 카드의 칸 나누기를 깨고 종이와 구별되지 않는다
      assert.ok(pairs.every(([main]) => main !== "하양" && main !== "흰색"));
    }
  });

  it("사람 수는 1~6 으로 자른다", () => {
    assert.equal(pickOutfitPalette(0, seeded(1)).length, 1);
    assert.equal(pickOutfitPalette(-3, seeded(1)).length, 1);
    assert.equal(pickOutfitPalette(9, seeded(1)).length, 6);
    assert.equal(pickOutfitPalette(Number.NaN, seeded(1)).length, 6);
    assert.equal(pickOutfitPalette(2, seeded(1)).length, 2);
  });

  it("난수가 1 이나 이상한 값을 줘도 넘치지 않는다", () => {
    for (const r of [1, 0, 0.999999, Number.NaN]) {
      const pairs = pickOutfitPalette(6, () => r);
      assert.equal(pairs.length, 6);
      assert.ok(pairs.every(([a, b]) => typeof a === "string" && a && typeof b === "string" && b));
    }
  });
});

describe("outfitHintLine — 이야기 요청에 붙이는 한 줄", () => {
  it("순서 번호와 색, 윗옷·아래옷 자리, 이야기 우선", () => {
    const line = outfitHintLine([
      ["코랄", "연청"],
      ["하늘색", "베이지"],
    ]);
    assert.match(line, /^이 책의 옷 색 제안\(책마다 옷이 달라지게 무작위로 뽑았다\) — @@CHARACTER@@ 순서대로 한 사람에 하나씩: ① 코랄\+연청 ② 하늘색\+베이지\./);
    assert.match(line, /앞의 색은 윗옷·겉옷, 뒤의 색은 아래옷에 쓴다\./);
    assert.match(line, /옷 종류는 이야기의 계절·장소·하는 일에 맞춰 고른다\./);
    assert.match(line, /이야기나 부모 글이 옷을 정해 두었으면\(노란 우비 등\) 그것이 먼저다\.$/);
    assert.ok(!line.includes("\n"));
  });

  it("빈 목록이면 빈 글", () => {
    assert.equal(outfitHintLine([]), "");
  });
});
