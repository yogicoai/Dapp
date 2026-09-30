import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  CUTOUT_RESERVE_MS,
  DRAW_DEADLINE_MS,
  FALLBACK_DEADLINE_MS,
  FINISH_RESERVE_MS,
  FUNCTION_MAX_MS,
  HEAD_CHECK_DEADLINE_MS,
  HEAD_REDRAW_DEADLINE_MS,
  OPTIONAL_END_MS,
  STRETCH_DEADLINE_MS,
  UPLOAD_DEADLINE_MS,
  UPLOAD_MIN_MS,
  UPLOAD_RESERVE_MS,
  UPLOAD_SAFETY_MS,
  optionalAllowed,
  stageClock,
  uploadLeft,
} from "./family-portrait-budget.ts";
import { HEAD_CHECK_MIN_MS, evenOutHead } from "./family-head-check.ts";

const ROUTE = new URL("../app/api/family/portrait/route.ts", import.meta.url);

describe("가족 그림 시간표 — 올리기 몫을 먼저 떼어 둔다", () => {
  it("없어도 되는 단계가 끝나도 지우기 + 올리기 몫이 남는다", () => {
    assert.ok(OPTIONAL_END_MS + CUTOUT_RESERVE_MS + UPLOAD_RESERVE_MS <= UPLOAD_DEADLINE_MS);
    for (const t of [HEAD_CHECK_DEADLINE_MS, HEAD_REDRAW_DEADLINE_MS, STRETCH_DEADLINE_MS]) {
      assert.ok(t <= OPTIONAL_END_MS, String(t));
    }
  });

  it("그리기가 마감에 끝나도 올리기 몫이 남는다", () => {
    assert.ok(DRAW_DEADLINE_MS + CUTOUT_RESERVE_MS + UPLOAD_RESERVE_MS <= UPLOAD_DEADLINE_MS);
  });

  it("대신 그리기(꼭 하는 단계)가 마감에 끝나도 올리기 최소 몫은 남는다", () => {
    assert.ok(FALLBACK_DEADLINE_MS + CUTOUT_RESERVE_MS + UPLOAD_MIN_MS <= UPLOAD_DEADLINE_MS);
  });

  it("올리기 마감 + 안전 틈 + '받았음' 몫이 함수 제한 안", () => {
    assert.ok(UPLOAD_DEADLINE_MS + FINISH_RESERVE_MS <= FUNCTION_MAX_MS);
    assert.ok(UPLOAD_SAFETY_MS < FINISH_RESERVE_MS);
  });

  it("route.ts 의 maxDuration(초)이 FUNCTION_MAX_MS 와 같다", () => {
    const src = readFileSync(ROUTE, "utf8");
    const m = /export const maxDuration = (\d+);/.exec(src);
    assert.ok(m, "maxDuration 을 못 찾음");
    assert.equal(Number(m[1]) * 1000, FUNCTION_MAX_MS);
  });

  it("route.ts 가 시간 값을 따로 적지 않고 이 파일에서 가져온다", () => {
    const src = readFileSync(ROUTE, "utf8");
    assert.doesNotMatch(src, /^const [A-Z_]+_MS = /m);
    assert.match(src, /from "@\/lib\/family-portrait-budget"/);
  });

  it("올리기 마감에 끊긴 것(closed)은 502 '올리지 못했어요'가 아니라 504 timeout 으로 — route.ts 갈래", () => {
    // 2026-09-30 검토: cafe24 마감(55초)이 바깥 안전 제한(+1초)보다 먼저 끊도록 맞춰 둔 탓에, 시간 초과가 이번 사고와 같은
    // '그림을 올리지 못했어요'(502)로 나갈 뻔했다. 마감 판정(uploadHitDeadline)은 cafe24.test.ts 가 본다 — 여기서는 route 가
    // 그 판정으로 504 갈래에 보내는지, 그 갈래가 502 갈래보다 앞인지만 본다.
    const src = readFileSync(ROUTE, "utf8");
    assert.match(src, /const outOfTime = e instanceof DrawTimeout \|\| \(stage === "upload" && uploadHitDeadline\(e\)\);/);
    const timeout = src.search(/if \(outOfTime\) \{\s*return failAndRefund\(504, "그림이 너무 오래 걸려서 멈췄어요[^"]*", "timeout", uploadExtra\);/);
    const upload = src.search(/if \(stage === "upload"\) \{\s*return failAndRefund\(502,/);
    assert.ok(timeout > 0, "504 timeout 갈래를 못 찾음");
    assert.ok(upload > timeout, "502 upload 갈래가 504 갈래보다 앞에 있음");
  });
});

describe("optionalAllowed · uploadLeft — 경계", () => {
  const t0 = 1_000_000;
  it("OPTIONAL_END_MS 직전까지만 된다", () => {
    assert.equal(optionalAllowed(t0, t0), true);
    assert.equal(optionalAllowed(t0, t0 + OPTIONAL_END_MS - 1), true);
    assert.equal(optionalAllowed(t0, t0 + OPTIONAL_END_MS), false);
    assert.equal(optionalAllowed(t0, t0 + OPTIONAL_END_MS + 5_000), false);
  });

  it("until 을 주면 그 시각으로", () => {
    assert.equal(optionalAllowed(t0, t0 + STRETCH_DEADLINE_MS - 1, STRETCH_DEADLINE_MS), true);
    assert.equal(optionalAllowed(t0, t0 + STRETCH_DEADLINE_MS, STRETCH_DEADLINE_MS), false);
  });

  it("남은 올리기 시간", () => {
    assert.equal(uploadLeft(t0, t0), UPLOAD_DEADLINE_MS);
    assert.equal(uploadLeft(t0, t0 + 47_000), UPLOAD_DEADLINE_MS - 47_000);
    assert.ok(uploadLeft(t0, t0 + 56_000) < 0);
  });
});

describe("머리 재기 — 늦게 끝난 그리기는 재지 않는다(올리기 몫을 지킨다)", () => {
  /** 요청 시작 = 0 인 가짜 시계로 evenOutHead 를 돌린다 — 재기는 늘 머리가 크다고, 다시 그리기는 시간만 쓴다. */
  async function run(drawEndsAt: number, drawMs: number) {
    let clock = drawEndsAt;
    const calls: string[] = [];
    const out = await evenOutHead<string>({
      image: "first",
      target: 7,
      measure: async (_img, ms) => {
        calls.push(`measure ${ms}`);
        clock += Math.min(ms, 3_000);
        return { ratio: 4, ms: 3_000, outcome: "ok", boxes: { head: [100, 400, 300, 600], figure: [100, 250, 920, 750] } };
      },
      redraw: async (_first, _fix, ms) => {
        calls.push(`redraw ${ms}`);
        clock += Math.min(ms, drawMs);
        return "redraw";
      },
      checkUntil: HEAD_CHECK_DEADLINE_MS,
      redrawUntil: HEAD_REDRAW_DEADLINE_MS,
      redrawMinMs: Math.max(20_000, drawMs),
      now: () => clock,
    });
    return { out, calls, endsAt: clock };
  }

  it("그리기가 41초 넘어 끝나면 재지 않는다", async () => {
    const { out, calls } = await run(HEAD_CHECK_DEADLINE_MS - HEAD_CHECK_MIN_MS + 1, 25_000);
    assert.equal(out.log.outcome, "no-time");
    assert.deepEqual(calls, []);
  });

  it("41초에 끝나면 재되, 재기는 45초 안에 끝난다 — 지우기·올리기 몫이 남는다", async () => {
    const { calls, endsAt } = await run(HEAD_CHECK_DEADLINE_MS - HEAD_CHECK_MIN_MS, 25_000);
    assert.equal(calls[0], `measure ${HEAD_CHECK_MIN_MS}`);
    assert.ok(endsAt <= OPTIONAL_END_MS);
    assert.ok(!calls.some((c) => c.startsWith("redraw")));
  });

  it("다시 그리기는 빨리 끝난 그림에만 — 그래도 45초 안에 끝난다", async () => {
    const { calls, endsAt } = await run(15_000, 15_000);
    assert.ok(calls.some((c) => c.startsWith("redraw")));
    assert.ok(endsAt <= OPTIONAL_END_MS, String(endsAt));
  });
});

describe("stageClock — 단계 이름과 ms 숫자만", () => {
  it("단계마다 걸린 ms 와 합", () => {
    let t = 500;
    const clock = stageClock(0, () => t);
    clock.mark("auth");
    t = 900;
    clock.mark("charge");
    t = 27_900;
    clock.mark("draw");
    t = 28_000.4; // 소수 ms 는 반올림
    clock.mark("upload");
    t = 28_400;
    assert.equal(clock.summary(), "auth=500 charge=400 draw=27000 upload=100 total=28400");
    assert.equal(clock.elapsed(), 28_400);
  });

  it("모양은 늘 이름=정수 … total=정수", () => {
    let t = 0;
    const clock = stageClock(0, () => t);
    for (const s of ["auth", "charge", "refs", "draw", "head", "stretch", "cutout", "upload", "finish"] as const) {
      t += Math.random() * 5_000;
      clock.mark(s);
    }
    assert.match(clock.summary(), /^(?:[a-z]+=\d+ )+total=\d+$/);
  });

  it("아무 단계도 없으면 합만", () => {
    const clock = stageClock(100, () => 350);
    assert.equal(clock.summary(), "total=250");
  });
});
