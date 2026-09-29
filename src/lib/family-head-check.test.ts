import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HEAD_CHECK_MIN_MS,
  HEAD_CHECK_PROMPT,
  HEAD_CHECK_TIMEOUT_MS,
  evenOutHead,
  measureHeadRatio,
  readHeadBoxes,
  type HeadMeasure,
} from "./family-head-check.ts";
import type { HeadBoxes, HeadFix } from "./family-head.ts";
import { guideImage } from "./family-guide.ts";
import { ratioAfterStretch } from "./family-stretch.ts";
import { drawThenRelease, headRedrawRecipe, portraitReferences } from "./family-portrait-prompt.ts";
import { resetImageFallbackForTests, type GeneratedImage } from "./gemini.ts";

describe("readHeadBoxes — 글 모델의 답 → 머리·전신 상자", () => {
  it("부탁한 꼴 {head, figure}", () => {
    assert.deepEqual(readHeadBoxes('{"head": [80, 400, 290, 600], "figure": [80, 250, 920, 750]}'), {
      head: [80, 400, 290, 600],
      figure: [80, 250, 920, 750],
    });
  });

  it("```json 울타리·앞뒤 말도 걷는다", () => {
    const text = 'Here you go:\n```json\n{"head":[70,430,226,570],"figure":[70,300,930,700]}\n```';
    assert.deepEqual(readHeadBoxes(text)?.head, [70, 430, 226, 570]);
  });

  it("Gemini 가 흔히 쓰는 꼴 [{box_2d, label}] 도 받는다", () => {
    const text = JSON.stringify([
      { box_2d: [70, 300, 930, 700], label: "full figure" },
      { box_2d: [70, 430, 226, 570], label: "head" },
    ]);
    assert.deepEqual(readHeadBoxes(text), { head: [70, 430, 226, 570], figure: [70, 300, 930, 700] });
  });

  it("못 읽으면 null — 사람 없음·상자 하나뿐·꼴이 틀림·JSON 아님", () => {
    assert.equal(readHeadBoxes('{"head": null, "figure": null}'), null);
    assert.equal(readHeadBoxes('{"head": [80, 400, 290, 600]}'), null);
    assert.equal(readHeadBoxes('{"head": [80, 400, 290], "figure": [80, 250, 920, 750]}'), null);
    assert.equal(readHeadBoxes('{"head": [290, 400, 80, 600], "figure": [80, 250, 920, 750]}'), null, "위가 아래보다 크다");
    assert.equal(readHeadBoxes("I can't tell."), null);
    assert.equal(readHeadBoxes(""), null);
  });
});

describe("HEAD_CHECK_PROMPT — 글 모델에 주는 재기 부탁", () => {
  it("재기 부탁 — 긴 머리·땋은 머리는 머리 상자에 넣지 않는다(턱에서 끝난다)", () => {
    assert.match(HEAD_CHECK_PROMPT, /Long hair, braids or pigtails hanging below the chin are NOT part of the head box/);
    assert.match(HEAD_CHECK_PROMPT, /\[ymin, xmin, ymax, xmax\]/);
  });
});

/* ─────────────────────────────── evenOutHead ─────────────────────────────── */

type Img = "first" | "redraw";

/** 가짜 시계·재기·다시 그리기 — 걸린 시간은 시계를 밀어서 흉내 낸다 */
function rig(o: {
  ratios: Partial<Record<Img, number | null>>;
  measureMs?: number;
  redrawMs?: number;
  redrawFails?: boolean;
  start?: number;
  /** 상자를 잰 비율에 맞춰 만든다(boxesOf) — 몸 늘이기 셈(ratioAfterStretch)이 그 비율을 그대로 보게 */
  ratioBoxes?: boolean;
}) {
  let t = o.start ?? 20_000;
  const calls = {
    measure: [] as { image: Img; timeoutMs: number }[],
    redraw: [] as { first: Img; fix: HeadFix; timeoutMs: number }[],
  };
  return {
    calls,
    now: () => t,
    measure: async (image: Img, timeoutMs: number): Promise<HeadMeasure> => {
      calls.measure.push({ image, timeoutMs });
      const ms = o.measureMs ?? 3_000;
      t += ms;
      const ratio = o.ratios[image] ?? null;
      if (ratio === null) return { ratio, ms, outcome: "unreadable" };
      return { ratio, ms, outcome: "ok", boxes: o.ratioBoxes ? boxesOf(ratio) : BOXES[image] };
    },
    redraw: async (first: Img, fix: HeadFix, timeoutMs: number): Promise<Img> => {
      calls.redraw.push({ first, fix, timeoutMs });
      t += o.redrawMs ?? 15_000;
      if (o.redrawFails) throw new Error("다시 그리기 실패");
      return "redraw";
    },
  };
}

/** 그림마다 다른 가짜 상자 — 남긴 그림의 상자가 돌아오는지 본다 */
const BOXES: Record<Img, HeadBoxes> = {
  first: { head: [100, 400, 280, 600], figure: [100, 250, 920, 750] },
  redraw: { head: [100, 420, 250, 580], figure: [100, 260, 930, 740] },
};

/** 잰 비율에 맞는 상자 — 키 820칸, 머리 820 ÷ 비율 칸(0~1000) */
const boxesOf = (ratio: number): HeadBoxes => ({ head: [100, 400, 100 + 820 / ratio, 600], figure: [100, 250, 920, 750] });

/** api/family/portrait 와 같은 effective — 머리가 큰 그림은 늘인 뒤 비율(어른 표 7 → 5.6 까지, 띠 배율 1.35 까지) */
const stretched7 = (ratio: number, boxes: HeadBoxes | null) => ratioAfterStretch(ratio, boxes, 7);

/** 요청 시작 = 0, 재기는 46초까지, 다시 그리기는 45초까지(api/family/portrait 와 같다) */
const BUDGET = { checkUntil: 46_000, redrawUntil: 45_000, redrawMinMs: 20_000 };

describe("evenOutHead — 재고, 벗어났으면 시간이 될 때만 한 번 더 그려 표에 더 가까운 쪽", () => {
  it("표에 맞으면 다시 그리지 않고 잰 비율을 남긴다", async () => {
    const r = rig({ ratios: { first: 5.3 } });
    const out = await evenOutHead({ image: "first" as Img, target: 5.5, ...r, ...BUDGET });
    assert.deepEqual([out.image, out.ratio, out.log.outcome, out.log.retried], ["first", 5.3, "ok", false]);
    assert.equal(r.calls.redraw.length, 0);
    assert.equal(r.calls.measure[0].timeoutMs, HEAD_CHECK_TIMEOUT_MS, "재기 제한은 8초(남은 시간이 더 길면)");
  });

  it("머리가 크고(4.2) 시간이 넉넉하면 한 번 더 그리고, 표에 더 가까운 다시 그린 그림을 남긴다", async () => {
    const r = rig({ ratios: { first: 4.2, redraw: 5.2 }, start: 12_000 });
    const out = await evenOutHead({ image: "first" as Img, target: 5.5, ...r, ...BUDGET });
    assert.deepEqual([out.image, out.ratio, out.log.kept, out.log.outcome], ["redraw", 5.2, "redraw", "closer-redraw"]);
    assert.deepEqual([out.log.first, out.log.second, out.log.verdict, out.log.retried], [4.2, 5.2, "big", true]);
    assert.equal(r.calls.redraw.length, 1, "다시 그리기는 한 번뿐");
    // 다시 그리기는 처음 그림에서 — 처음 그림과 바로잡을 것(표·잰 비율·갈래)을 넘긴다
    assert.equal(r.calls.redraw[0].first, "first");
    assert.deepEqual(r.calls.redraw[0].fix, { target: 5.5, verdict: "big", measured: 4.2 });
    // 재기 3초 뒤(15초) → 다시 그리기 제한은 45초까지 남은 30초
    assert.equal(r.calls.redraw[0].timeoutMs, 30_000);
    assert.equal(out.log.checkMs, 6_000);
    assert.equal(out.log.redrawMs, 15_000);
  });

  it("사장님 시험 숫자(표 7) — 엄마 4.15 → 다시 4.41 은 다시 그린 쪽, 아빠 5.5 → 다시 4.66 은 처음 그림을 남긴다", async () => {
    const mom = rig({ ratios: { first: 4.15, redraw: 4.41 }, start: 10_000 });
    const m = await evenOutHead({ image: "first" as Img, target: 7, ...mom, ...BUDGET });
    assert.deepEqual([m.image, m.ratio, m.log.outcome], ["redraw", 4.41, "closer-redraw"]);
    const dad = rig({ ratios: { first: 5.5, redraw: 4.66 }, start: 10_000 });
    const d = await evenOutHead({ image: "first" as Img, target: 7, ...dad, ...BUDGET });
    assert.deepEqual([d.image, d.ratio, d.log.outcome, d.log.second], ["first", 5.5, "closer-first", 4.66]);
    // 처음 그림에서 비율만 고쳐 표에 가까워지면(6.4) 그쪽을 건넨다
    const fixed = rig({ ratios: { first: 4.15, redraw: 6.4 }, start: 10_000 });
    const f = await evenOutHead({ image: "first" as Img, target: 7, ...fixed, ...BUDGET });
    assert.deepEqual([f.image, f.ratio, f.log.kept], ["redraw", 6.4, "redraw"]);
  });

  it("다시 그린 게 반대로 더 멀리 갔으면 처음 그림을 남긴다", async () => {
    const r = rig({ ratios: { first: 4.2, redraw: 8.3 }, start: 12_000 });
    const out = await evenOutHead({ image: "first" as Img, target: 5.5, ...r, ...BUDGET });
    assert.deepEqual([out.image, out.ratio, out.log.outcome, out.log.second], ["first", 4.2, "closer-first", 8.3]);
  });

  it("머리가 너무 작아도(small) 다시 그린다", async () => {
    const r = rig({ ratios: { first: 5.2, redraw: 4.1 }, start: 5_000 });
    const out = await evenOutHead({ image: "first" as Img, target: 4, ...r, ...BUDGET });
    assert.equal(out.log.verdict, "small");
    assert.deepEqual(r.calls.redraw[0].fix, { target: 4, verdict: "small", measured: 5.2 });
    assert.deepEqual([out.image, out.ratio], ["redraw", 4.1]);
  });

  it("다시 그릴 시간이 모자라면 처음 그림 — 잰 비율은 남긴다(단체 사진이 쓴다)", async () => {
    // 재기가 끝나면 28초 → 45초까지 17초 < 20초
    const r = rig({ ratios: { first: 4.2 }, start: 25_000 });
    const out = await evenOutHead({ image: "first" as Img, target: 5.5, ...r, ...BUDGET });
    assert.deepEqual([out.image, out.ratio, out.log.outcome, out.log.retried], ["first", 4.2, "no-time-redraw", false]);
    assert.equal(r.calls.redraw.length, 0);
  });

  it("처음 그리기가 오래 걸렸으면 그만큼 남아야 다시 그린다(redrawMinMs 는 부른 쪽이 정한다)", async () => {
    const r = rig({ ratios: { first: 4.2 }, start: 12_000 });
    const out = await evenOutHead({ image: "first" as Img, target: 5.5, ...r, ...BUDGET, redrawMinMs: 31_000 });
    assert.equal(out.log.outcome, "no-time-redraw");
  });

  it("재기 몫도 안 남았으면 재지 않는다(오늘처럼 건넨다)", async () => {
    const r = rig({ ratios: { first: 4.2 }, start: BUDGET.checkUntil - HEAD_CHECK_MIN_MS + 1 });
    const out = await evenOutHead({ image: "first" as Img, target: 5.5, ...r, ...BUDGET });
    assert.deepEqual([out.image, out.ratio, out.log.outcome], ["first", null, "no-time"]);
    assert.equal(r.calls.measure.length, 0);
  });

  it("재기 제한은 남은 시간을 넘지 않는다", async () => {
    const r = rig({ ratios: { first: 5.5 }, start: 41_000 });
    await evenOutHead({ image: "first" as Img, target: 5.5, ...r, ...BUDGET });
    assert.equal(r.calls.measure[0].timeoutMs, 5_000);
  });

  it("재기는 46초까지 — 그리기가 42초 넘어 끝나면(4초도 안 남으면) 재지 않아 올리기 몫(55초까지)을 줄이지 않는다", async () => {
    assert.equal(HEAD_CHECK_MIN_MS, 4_000);
    const r = rig({ ratios: { first: 4.2 }, start: 42_500 });
    const out = await evenOutHead({ image: "first" as Img, target: 5.5, ...r, ...BUDGET });
    assert.deepEqual([out.image, out.log.outcome, r.calls.measure.length], ["first", "no-time", 0]);
  });

  it("못 쟀으면 처음 그림 그대로(잰 비율 없이) — 실패는 조용히", async () => {
    const r = rig({ ratios: { first: null } });
    const out = await evenOutHead({ image: "first" as Img, target: 5.5, ...r, ...BUDGET });
    assert.deepEqual([out.image, out.ratio, out.log.outcome], ["first", null, "unreadable"]);
    // 재기가 던져도(그럴 일은 없지만) 처음 그림
    const thrown = await evenOutHead({
      image: "first" as Img,
      target: 5.5,
      ...r,
      ...BUDGET,
      measure: async () => {
        throw new Error("x");
      },
    });
    assert.deepEqual([thrown.image, thrown.ratio, thrown.log.outcome], ["first", null, "error"]);
  });

  it("다시 그리기가 실패하면 처음 그림 — 잰 비율은 남긴다", async () => {
    const r = rig({ ratios: { first: 4.2 }, start: 5_000, redrawFails: true });
    const out = await evenOutHead({ image: "first" as Img, target: 5.5, ...r, ...BUDGET });
    assert.deepEqual([out.image, out.ratio, out.log.outcome, out.log.retried], ["first", 4.2, "redraw-failed", true]);
  });

  it("다시 그린 그림을 시간·통신 탓으로 못 재면 다시 그린 그림을 남긴다 — 처음 그림은 벗어난 걸 이미 안다", async () => {
    // 다시 그리기가 오래 걸려 47초에 끝남 → 재기 몫(4초)이 안 남는다
    const late = rig({ ratios: { first: 4.2, redraw: 5.5 }, start: 5_000, redrawMs: 39_000 });
    const out = await evenOutHead({ image: "first" as Img, target: 5.5, ...late, ...BUDGET });
    assert.deepEqual([out.image, out.ratio, out.log.kept, out.log.outcome], ["redraw", null, "redraw", "redraw-unmeasured"]);
    // 재기가 시간 초과·통신 실패·던짐이면 — 그림 탓이 아니다
    for (const outcome of ["timeout", "http 503", "network", "gemini-blocked"]) {
      const r = rig({ ratios: { first: 4.2, redraw: null }, start: 5_000 });
      const out2 = await evenOutHead({
        image: "first" as Img,
        target: 5.5,
        ...r,
        ...BUDGET,
        measure: async (image, ms) => (image === "first" ? r.measure(image, ms) : { ratio: null, ms: 1_000, outcome }),
      });
      assert.deepEqual([out2.image, out2.ratio, out2.log.kept, out2.log.outcome], ["redraw", null, "redraw", "redraw-unmeasured"], outcome);
    }
  });

  it("글 모델이 다시 그린 그림을 보고도 한 사람 전신을 못 찾으면(두 사람·전후 비교) 처음 그림을 남긴다", async () => {
    for (const outcome of ["unreadable", "bad-boxes"]) {
      const r = rig({ ratios: { first: 4.15, redraw: null }, start: 10_000 });
      const out = await evenOutHead({
        image: "first" as Img,
        target: 7,
        ...r,
        ...BUDGET,
        measure: async (image, ms) => (image === "first" ? r.measure(image, ms) : { ratio: null, ms: 2_000, outcome }),
      });
      assert.deepEqual(
        [out.image, out.ratio, out.log.kept, out.log.outcome, out.log.retried, out.log.second],
        ["first", 4.15, "first", "redraw-unreadable", true, null],
        outcome,
      );
      assert.equal(r.calls.redraw.length, 1, "다시 그리기는 한 번뿐 — 또 그리지 않는다");
    }
  });

  it("남긴 그림을 잰 상자를 함께 돌려준다(몸 늘이기가 쓴다) — 못 쟀으면 null", async () => {
    const ok = await evenOutHead({ image: "first" as Img, target: 7, ...rig({ ratios: { first: 5.6 } }), ...BUDGET });
    assert.deepEqual([ok.image, ok.boxes], ["first", BOXES.first]);
    const redraw = await evenOutHead({ image: "first" as Img, target: 7, ...rig({ ratios: { first: 3.94, redraw: 4.56 }, start: 10_000 }), ...BUDGET });
    assert.deepEqual([redraw.image, redraw.ratio, redraw.boxes], ["redraw", 4.56, BOXES.redraw], "다시 그린 쪽을 남기면 그 그림의 상자");
    const closerFirst = await evenOutHead({ image: "first" as Img, target: 7, ...rig({ ratios: { first: 5.5, redraw: 4.66 }, start: 10_000 }), ...BUDGET });
    assert.deepEqual([closerFirst.image, closerFirst.boxes], ["first", BOXES.first], "처음 그림을 남기면 처음 그림의 상자");
    const noTime = await evenOutHead({ image: "first" as Img, target: 7, ...rig({ ratios: { first: 4.56 }, start: 25_000 }), ...BUDGET });
    assert.deepEqual([noTime.log.outcome, noTime.boxes], ["no-time-redraw", BOXES.first]);
    const failed = await evenOutHead({ image: "first" as Img, target: 7, ...rig({ ratios: { first: 4.56 }, start: 5_000, redrawFails: true }), ...BUDGET });
    assert.deepEqual([failed.log.outcome, failed.boxes], ["redraw-failed", BOXES.first]);
    const unmeasured = await evenOutHead({ image: "first" as Img, target: 7, ...rig({ ratios: { first: null } }), ...BUDGET });
    assert.deepEqual([unmeasured.ratio, unmeasured.boxes], [null, null]);
    const late = await evenOutHead({ image: "first" as Img, target: 7, ...rig({ ratios: { first: 4.2, redraw: 5.5 }, start: 5_000, redrawMs: 39_000 }), ...BUDGET });
    assert.deepEqual([late.image, late.ratio, late.boxes], ["redraw", null, null], "다시 그린 그림을 못 쟀으면 상자도 없다(늘이지 않는다)");
    // 재기가 비율만 주고 상자를 안 주면(가짜 재기) 상자 없음
    const bare = await evenOutHead({
      image: "first" as Img,
      target: 7,
      ...rig({ ratios: {} }),
      ...BUDGET,
      measure: async () => ({ ratio: 5.6, ms: 1_000, outcome: "ok" }),
    });
    assert.deepEqual([bare.ratio, bare.boxes], [5.6, null]);
  });
});

describe("evenOutHead effective — 머리가 큰 그림은 몸 늘이기 뒤 비율로 견준다(api/family/portrait ④)", () => {
  it("처음 4.6(늘여 5.6)과 너무 작게 다시 그린 9.5 — 늘인 뒤로 견줘 처음 그림을 남긴다(잰 비율로는 9.5)", async () => {
    const raw = await evenOutHead({ image: "first" as Img, target: 7, ...rig({ ratios: { first: 4.6, redraw: 9.5 }, start: 10_000, ratioBoxes: true }), ...BUDGET });
    assert.deepEqual([raw.image, raw.log.outcome], ["redraw", "closer-redraw"], "effective 가 없으면 예전 그대로");
    const out = await evenOutHead({
      image: "first" as Img,
      target: 7,
      ...rig({ ratios: { first: 4.6, redraw: 9.5 }, start: 10_000, ratioBoxes: true }),
      ...BUDGET,
      effective: stretched7,
    });
    assert.deepEqual([out.image, out.ratio, out.log.outcome, out.log.second], ["first", 4.6, "closer-first", 9.5]);
    assert.deepEqual(out.boxes, boxesOf(4.6), "처음 그림의 상자 — 부른 쪽이 늘인다");
  });

  it("둘 다 늘여서 5.6 에 닿으면(같음) 잰 비율로 — 덜 늘여도 되는 다시 그린 5.3", async () => {
    assert.equal(stretched7(4.6, boxesOf(4.6)), 5.6);
    assert.equal(stretched7(5.3, boxesOf(5.3)), 5.6);
    const out = await evenOutHead({
      image: "first" as Img,
      target: 7,
      ...rig({ ratios: { first: 4.6, redraw: 5.3 }, start: 10_000, ratioBoxes: true }),
      ...BUDGET,
      effective: stretched7,
    });
    assert.deepEqual([out.image, out.ratio, out.log.outcome], ["redraw", 5.3, "closer-redraw"]);
  });

  it("둘 다 머리가 크면 예전 순서 그대로 — 셀카 엄마 3.94(늘여 약 4.8) · 다시 4.56(늘여 5.6)은 다시 그린 쪽", async () => {
    const out = await evenOutHead({
      image: "first" as Img,
      target: 7,
      ...rig({ ratios: { first: 3.94, redraw: 4.56 }, start: 10_000, ratioBoxes: true }),
      ...BUDGET,
      effective: stretched7,
    });
    assert.deepEqual([out.image, out.ratio, out.log.outcome], ["redraw", 4.56, "closer-redraw"]);
    assert.deepEqual(out.boxes, boxesOf(4.56));
  });

  it("다시 그린 그림을 시간·통신 탓으로 못 쟀는데 처음 그림이 늘여서 나아지면 처음 그림(redraw-unmeasured-first)", async () => {
    // 다시 그리기가 늦게 끝나 재기 몫이 없다(47초)
    const late = await evenOutHead({
      image: "first" as Img,
      target: 7,
      ...rig({ ratios: { first: 4.15, redraw: 5.5 }, start: 5_000, redrawMs: 39_000, ratioBoxes: true }),
      ...BUDGET,
      effective: stretched7,
    });
    assert.deepEqual(
      [late.image, late.ratio, late.log.kept, late.log.outcome, late.log.retried, late.log.second],
      ["first", 4.15, "first", "redraw-unmeasured-first", true, null],
    );
    assert.deepEqual(late.boxes, boxesOf(4.15), "처음 그림의 상자 — 부른 쪽이 늘인다(4.15 → 약 5.1)");
    for (const outcome of ["timeout", "http 503", "network"]) {
      const r = rig({ ratios: { first: 3.94 }, start: 5_000, ratioBoxes: true });
      const out = await evenOutHead({
        image: "first" as Img,
        target: 7,
        ...r,
        ...BUDGET,
        effective: stretched7,
        measure: async (image, ms) => (image === "first" ? r.measure(image, ms) : { ratio: null, ms: 1_000, outcome }),
      });
      assert.deepEqual([out.image, out.log.outcome], ["first", "redraw-unmeasured-first"], outcome);
    }
  });

  it("늘여도 나아지지 않는 처음 그림이면 못 잰 다시 그린 그림 그대로 — 머리가 작은 쪽(9.5)·늘이지 않는 5.4", async () => {
    for (const first of [9.5, 5.4]) {
      const out = await evenOutHead({
        image: "first" as Img,
        target: 7,
        ...rig({ ratios: { first, redraw: 7 }, start: 5_000, redrawMs: 39_000, ratioBoxes: true }),
        ...BUDGET,
        effective: stretched7,
      });
      assert.deepEqual([out.image, out.ratio, out.boxes, out.log.outcome], ["redraw", null, null, "redraw-unmeasured"], `처음 ${first}`);
    }
  });
});

/* ─────────────────────────────── 사진은 처음 그리기에만 ─────────────────────────────── */

describe("사진 갈래 머리 다시 그리기 — 사진·클로즈업은 처음 그리기에만, 다시 그리기는 처음 그림 + 비율 견본", () => {
  it("처음 그리기가 끝나면 사진·클로즈업 배열이 비고, 다시 그릴 때는 이미 비어 있으며 다시 그리기 요청에 사진이 없다", async () => {
    const refs = portraitReferences({ photo: "PHOTO", closeUp: "CLOSEUP", sample: "SAMPLE", sibling: "SIBLING", guide: "GUIDE" });
    const sent: string[][] = [];
    const first = await drawThenRelease(refs.images, async (images) => {
      sent.push([...images]);
      return "FIRST";
    });
    assert.deepEqual(sent[0], ["PHOTO", "CLOSEUP", "SAMPLE", "GUIDE"], "처음 그리기는 예전 그대로 사진이 첫째");
    assert.equal(refs.images.length, 0, "그리기 직후 사진·클로즈업을 놓았다");

    let t = 10_000;
    let redrawSawPhotos = -1;
    const out = await evenOutHead({
      image: first,
      target: 7,
      now: () => t,
      measure: async (image) => {
        t += 3_000;
        return { ratio: image === "FIRST" ? 4.15 : 6.4, ms: 3_000, outcome: "ok" };
      },
      redraw: async (img, fix) => {
        redrawSawPhotos = refs.images.length;
        const again = headRedrawRecipe({ first: img, guide: "GUIDE", fix });
        sent.push(again.references);
        t += 15_000;
        return "REDRAW";
      },
      ...BUDGET,
    });
    assert.equal(redrawSawPhotos, 0, "다시 그릴 때 사진 배열은 이미 비어 있다");
    assert.deepEqual(sent[1], ["FIRST", "GUIDE"], "다시 그리기 = 처음 그림(첫째) + 비율 견본(둘째)");
    for (const x of ["PHOTO", "CLOSEUP", "SAMPLE", "SIBLING"]) assert.ok(!sent[1].includes(x), x);
    assert.deepEqual([out.image, out.ratio, out.log.outcome], ["REDRAW", 6.4, "closer-redraw"]);
  });

  it("처음 그리기가 실패해도(사진 거절·시간 초과) 사진·클로즈업 배열을 비운다", async () => {
    const refs = portraitReferences({ photo: "PHOTO", closeUp: "CLOSEUP", sample: "SAMPLE", sibling: null, guide: "GUIDE" });
    await assert.rejects(
      drawThenRelease(refs.images, async () => {
        throw new Error("IMAGE_SAFETY");
      }),
      /IMAGE_SAFETY/,
    );
    assert.equal(refs.images.length, 0);
  });
});

/* ─────────────────────────────── measureHeadRatio ─────────────────────────────── */

describe("measureHeadRatio — 그린 그림을 글 모델에 한 번(fetch 는 바꿔 끼운다, 돈 드는 호출 없음)", () => {
  type Call = { url: string; init: RequestInit };

  async function withStubs<T>(
    reply: (call: Call) => Promise<Response>,
    run: (calls: Call[], logs: string[]) => Promise<T>,
    env: { key?: string } = { key: "g-test" },
  ): Promise<T> {
    const saved = {
      fetch: globalThis.fetch,
      key: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_VISION_MODEL,
      info: console.info,
      warn: console.warn,
      error: console.error,
      log: console.log,
    };
    const calls: Call[] = [];
    const logs: string[] = [];
    const capture = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };
    try {
      resetImageFallbackForTests();
      if (env.key === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = env.key;
      delete process.env.GEMINI_VISION_MODEL;
      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const call = { url: String(url), init: init ?? {} };
        calls.push(call);
        return reply(call);
      }) as typeof fetch;
      console.info = capture;
      console.warn = capture;
      console.error = capture;
      console.log = capture;
      return await run(calls, logs);
    } finally {
      globalThis.fetch = saved.fetch;
      if (saved.key === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = saved.key;
      if (saved.model === undefined) delete process.env.GEMINI_VISION_MODEL;
      else process.env.GEMINI_VISION_MODEL = saved.model;
      console.info = saved.info;
      console.warn = saved.warn;
      console.error = saved.error;
      console.log = saved.log;
    }
  }

  const answer = (text: string) =>
    new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "hmm", thought: true }, { text }] } }] }), {
      status: 200,
    });

  async function picture(): Promise<GeneratedImage> {
    const g = await guideImage(5.5);
    assert.ok(g);
    return g;
  }

  it("그림(작게 줄인 JPEG)을 먼저, 부탁 글을 뒤에 — JSON 으로만 답하게, 생각 글은 빼고 상자를 읽어 비율을 낸다", async () => {
    const img = await picture();
    await withStubs(
      async () => answer('{"head":[70,430,226,570],"figure":[70,300,930,700]}'),
      async (calls, logs) => {
        const r = await measureHeadRatio(img, { timeoutMs: 5_000 });
        assert.deepEqual([r.ratio, r.outcome], [5.51, "ok"]);
        // 비율을 낸 상자도 함께 — 몸 늘이기(lib/family-stretch)가 턱선·발목선을 잡는다
        assert.deepEqual(r.boxes, { head: [70, 430, 226, 570], figure: [70, 300, 930, 700] });
        assert.equal(calls.length, 1);
        assert.match(calls[0].url, /\/models\/gemini-flash-latest:generateContent$/);
        const body = JSON.parse(String(calls[0].init.body)) as {
          contents: { parts: { inlineData?: { mimeType: string; data: string }; text?: string }[] }[];
          generationConfig: { temperature: number; responseMimeType: string };
        };
        assert.equal(body.contents[0].parts[0].inlineData?.mimeType, "image/jpeg");
        assert.equal(body.contents[0].parts[1].text, HEAD_CHECK_PROMPT);
        assert.equal(body.generationConfig.temperature, 0);
        assert.equal(body.generationConfig.responseMimeType, "application/json");
        assert.deepEqual(logs, [], "로그는 부른 쪽이 숫자로만 찍는다");
      },
    );
  });

  it("실패는 조용히 — 키 없음·HTTP 오류·차단·못 읽음·믿을 수 없는 상자·끊김", async () => {
    const img = await picture();
    await withStubs(
      async () => answer("{}"),
      async (calls) => {
        const r = await measureHeadRatio(img, { timeoutMs: 5_000 });
        assert.deepEqual([r.ratio, r.outcome, calls.length], [null, "no-key", 0]);
      },
      {},
    );
    const cases: [() => Response, string][] = [
      [() => new Response('{"error":{"message":"bad"}}', { status: 400 }), "http 400"],
      [() => new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }), { status: 200 }), "blocked SAFETY"],
      [() => new Response(JSON.stringify({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [] } }] }), { status: 200 }), "finish MAX_TOKENS"],
      [() => answer('{"head": null, "figure": null}'), "unreadable"],
      [() => answer('{"head":[80,400,520,600],"figure":[80,250,920,750]}'), "bad-boxes"],
      [() => new Response("not json", { status: 200 }), "unreadable"],
    ];
    for (const [res, outcome] of cases) {
      await withStubs(
        async () => res(),
        async () => {
          const r = await measureHeadRatio(img, { timeoutMs: 5_000 });
          assert.deepEqual([r.ratio, r.outcome, r.boxes], [null, outcome, undefined], "못 쟀으면 상자도 없다");
        },
      );
    }
    await withStubs(
      async () => {
        throw new TypeError("fetch failed");
      },
      async () => {
        const r = await measureHeadRatio(img, { timeoutMs: 5_000 });
        assert.deepEqual([r.ratio, r.outcome], [null, "network"]);
      },
    );
  });

  it("제한 시간이 지나면 요청을 끊고 ratio null(timeout)", async () => {
    const img = await picture();
    await withStubs(
      ({ init }) =>
        new Promise<Response>((_, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
      async () => {
        const t0 = Date.now();
        const r = await measureHeadRatio(img, { timeoutMs: 80 });
        assert.deepEqual([r.ratio, r.outcome], [null, "timeout"]);
        assert.ok(Date.now() - t0 < 2_000);
      },
    );
  });
});
