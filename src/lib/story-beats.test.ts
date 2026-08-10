import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BEAT_TEMPLATES,
  beatPlanLines,
  distributeBeats,
  pickBeatTemplate,
  type Beat,
} from "./story-beats.ts";

const beats = (n: number): Beat[] =>
  Array.from({ length: n }, (_, i) => ({ label: `b${i + 1}`, guide: `g${i + 1}` }));

describe("distributeBeats", () => {
  it("쪽수만큼 칸을 만들고 빈 쪽을 남기지 않는다", () => {
    for (let pages = 3; pages <= 8; pages++) {
      for (const template of BEAT_TEMPLATES) {
        const spread = distributeBeats(template.beats, pages);
        assert.equal(spread.length, pages, `${template.id} ${pages}쪽`);
        for (const [i, page] of spread.entries()) {
          assert.ok(page.length > 0, `${template.id} ${pages}쪽 중 ${i + 1}쪽이 비었다`);
        }
      }
    }
  });

  it("뼈대가 쪽보다 많으면 한 쪽에 여러 뼈대를 합친다", () => {
    const spread = distributeBeats(beats(6), 3);
    assert.equal(spread.length, 3);
    assert.equal(spread.flat().length, 6, "합쳐도 뼈대는 하나도 사라지지 않는다");
  });

  it("뼈대가 쪽보다 적으면 한 뼈대를 여러 쪽에 늘린다", () => {
    const spread = distributeBeats(beats(3), 6);
    assert.equal(spread.length, 6);
    const labels = new Set(spread.flat().map((b) => b.label));
    assert.deepEqual([...labels].sort(), ["b1", "b2", "b3"]);
  });

  it("모든 뼈대가 순서를 지킨 채 남는다", () => {
    const spread = distributeBeats(beats(5), 5);
    assert.deepEqual(
      spread.flat().map((b) => b.label),
      ["b1", "b2", "b3", "b4", "b5"],
    );
  });

  it("쪽수가 모자라도 꼭 필요한 뼈대는 살아남는다", () => {
    const list: Beat[] = [
      { label: "곁가지1", guide: "g" },
      { label: "곁가지2", guide: "g" },
      { label: "곁가지3", guide: "g" },
      { label: "해결", guide: "g", essential: true },
    ];
    const spread = distributeBeats(list, 3);
    assert.ok(
      spread.flat().some((b) => b.label === "해결"),
      "꼭 필요한 뼈대가 사라졌다",
    );
  });

  it("무게가 큰 뼈대가 쪽을 더 받는다", () => {
    const list: Beat[] = [
      { label: "가벼움", guide: "g", weight: 1 },
      { label: "절정", guide: "g", weight: 5 },
    ];
    const spread = distributeBeats(list, 6);
    const climax = spread.flat().filter((b) => b.label === "절정").length;
    const light = spread.flat().filter((b) => b.label === "가벼움").length;
    assert.ok(climax > light, `절정 ${climax}쪽 vs 가벼움 ${light}쪽`);
  });

  it("쪽수가 0이거나 뼈대가 없으면 빈 배열", () => {
    assert.deepEqual(distributeBeats(beats(3), 0), []);
    assert.deepEqual(distributeBeats([], 5), []);
  });
});

describe("pickBeatTemplate", () => {
  it("갈래에 맞는 뼈대를 고른다", () => {
    for (const kind of ["today", "imagine", "emotion"] as const) {
      const picked = pickBeatTemplate(kind, 8, 6, () => 0);
      assert.ok(picked, `${kind} 뼈대를 못 골랐다`);
      assert.ok(picked.kinds.includes(kind));
    }
  });

  it("「직접 이야기 구성」은 부모 구조를 지키려 뼈대를 안 씌운다", () => {
    assert.equal(pickBeatTemplate("direct", 8, 6), null);
  });

  it("쪽수가 적으면 그 쪽수로 가능한 뼈대만 고른다", () => {
    for (const kind of ["today", "imagine", "emotion"] as const) {
      for (let i = 0; i < 20; i++) {
        const picked = pickBeatTemplate(kind, 3, 6, () => i / 20);
        assert.ok(picked);
        assert.ok(picked.minPages <= 3, `${picked.id}는 3쪽에 안 맞는다`);
      }
    }
  });

  it("무작위 값이 끝값이어도 범위를 벗어나지 않는다", () => {
    assert.ok(pickBeatTemplate("emotion", 8, 6, () => 0.999999));
    assert.ok(pickBeatTemplate("emotion", 8, 6, () => 0));
  });

  it("여러 번 고르면 구조가 갈린다(한 집에서 여러 편을 만들어도 안 겹치게)", () => {
    const ids = new Set(
      Array.from({ length: 12 }, (_, i) => pickBeatTemplate("emotion", 8, 6, () => i / 12)?.id),
    );
    assert.ok(ids.size > 1, "감정동화 뼈대가 한 종류로 굳었다");
  });

  it("어떤 나이·갈래·쪽수에도 뼈대를 하나는 고른다", () => {
    for (const kind of ["today", "imagine", "emotion"] as const) {
      for (let age = 1; age <= 9; age++) {
        for (let pages = 3; pages <= 8; pages++) {
          const picked = pickBeatTemplate(kind, pages, age, () => 0);
          assert.ok(picked, `${kind}/${age}세/${pages}쪽 뼈대를 못 골랐다`);
        }
      }
    }
  });

  it("나이에 맞는 뼈대가 있으면 그 안에서만 고른다", () => {
    for (const kind of ["today", "imagine", "emotion"] as const) {
      for (let age = 1; age <= 9; age++) {
        const suits = BEAT_TEMPLATES.filter(
          (t) => t.kinds.includes(kind) && t.minPages <= 8 && age >= t.ages[0] && age <= t.ages[1],
        );
        if (suits.length === 0) continue; // 이 나이는 완화 단계로 내려간다 — 위 테스트가 지킨다
        for (let i = 0; i < 20; i++) {
          const picked = pickBeatTemplate(kind, 8, age, () => i / 20)!;
          assert.ok(
            age >= picked.ages[0] && age <= picked.ages[1],
            `${age}세에 ${picked.id}(${picked.ages.join("~")}세)를 골랐다`,
          );
        }
      }
    }
  });

  it("두 살과 여덟 살은 서로 다른 구조를 받는다", () => {
    const young = new Set(
      Array.from({ length: 12 }, (_, i) => pickBeatTemplate("imagine", 6, 2, () => i / 12)?.id),
    );
    const old = new Set(
      Array.from({ length: 12 }, (_, i) => pickBeatTemplate("imagine", 6, 8, () => i / 12)?.id),
    );
    for (const id of young) {
      assert.ok(!old.has(id), `${id}가 두 살과 여덟 살 양쪽에 다 쓰인다`);
    }
  });

  it("아주 어린 나이(1~2세)에는 반복·리듬 구조를 준다", () => {
    for (const kind of ["today", "imagine", "emotion"] as const) {
      const picked = pickBeatTemplate(kind, 4, 1, () => 0)!;
      assert.ok(picked.ages[0] <= 2, `1세에 ${picked.id}(${picked.ages.join("~")}세)를 골랐다`);
    }
  });
});

describe("beatPlanLines", () => {
  it("장면 번호를 쪽수만큼 낸다", () => {
    const template = BEAT_TEMPLATES.find((t) => t.id === "feel-and-settle")!;
    const lines = beatPlanLines(template, 5);
    for (let i = 1; i <= 5; i++) {
      assert.ok(
        lines.some((l) => l.trimStart().startsWith(`${i}장면:`)),
        `${i}장면 줄이 없다`,
      );
    }
  });

  it("뼈대 이름을 본문에 쓰지 말라고 못 박는다", () => {
    const lines = beatPlanLines(BEAT_TEMPLATES[0], 5).join("\n");
    assert.match(lines, /본문에 절대 쓰지 않는다/);
    assert.match(lines, /재료에서 가져온다/);
  });

  it("한 뼈대가 여러 쪽에 걸치면 이어서임을 표시한다", () => {
    const template = {
      ...BEAT_TEMPLATES[0],
      beats: [{ label: "하나", guide: "g" }] as Beat[],
    };
    const lines = beatPlanLines(template, 3).join("\n");
    assert.match(lines, /이어서/);
  });
});

describe("BEAT_TEMPLATES", () => {
  it("id가 겹치지 않는다", () => {
    const ids = BEAT_TEMPLATES.map((t) => t.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("갈래마다 3쪽짜리에도 쓸 수 있는 뼈대가 있다", () => {
    for (const kind of ["today", "imagine", "emotion"] as const) {
      assert.ok(
        BEAT_TEMPLATES.some((t) => t.kinds.includes(kind) && t.minPages <= 3),
        `${kind}에 3쪽용 뼈대가 없다`,
      );
    }
  });

  it("나이 범위가 올바르다(최소 ≤ 최대, 1~9세 안)", () => {
    for (const t of BEAT_TEMPLATES) {
      const [lo, hi] = t.ages;
      assert.ok(lo <= hi, `${t.id}의 나이 범위가 뒤집혔다: ${lo}~${hi}`);
      assert.ok(lo >= 1 && hi <= 9, `${t.id}의 나이 범위가 1~9세를 벗어났다: ${lo}~${hi}`);
    }
  });

  it("1~9세 모든 나이에 쓸 수 있는 뼈대가 갈래마다 있다", () => {
    for (const kind of ["today", "imagine", "emotion"] as const) {
      for (let age = 1; age <= 9; age++) {
        assert.ok(
          BEAT_TEMPLATES.some(
            (t) => t.kinds.includes(kind) && age >= t.ages[0] && age <= t.ages[1],
          ),
          `${kind} ${age}세에 맞는 뼈대가 하나도 없다`,
        );
      }
    }
  });

  it("모든 뼈대에 꼭 필요한 장면이 지정돼 있다", () => {
    for (const t of BEAT_TEMPLATES) {
      assert.ok(t.beats.some((b) => b.essential), `${t.id}에 essential이 없다`);
      assert.ok(t.beats.length >= 3, `${t.id}의 뼈대가 너무 적다`);
    }
  });
});
