import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HEAD_CHECK_MIN_MS,
  HEAD_CHECK_PROMPT,
  HEAD_CHECK_TIMEOUT_MS,
  evenOutHead,
  headCorrectionLine,
  measureHeadRatio,
  readHeadBoxes,
  type HeadMeasure,
} from "./family-head-check.ts";
import { guideImage } from "./family-guide.ts";
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

describe("headCorrectionLine — 다시 그릴 때 붙이는 한 줄", () => {
  it("표 비율과 지난번에 잰 비율(숫자만)을 적고, 나머지는 그대로라고 못박는다", () => {
    const big = headCorrectionLine(5.5, "big", 4.21);
    assert.match(big, /must be only 1\/5\.5 of the full height/);
    assert.match(big, /previous try drew the head too big \(about 1\/4\.2\)/);
    assert.match(big, /Everything else stays exactly as described above\.$/);
    const small = headCorrectionLine(4, "small", 5.3);
    assert.match(small, /must be 1\/4 of the full height/);
    assert.match(small, /too small \(about 1\/5\.3\)/);
  });

  it("몸 부위 말(몸통·다리·body)을 쓰지 않는다 — 사진(실제 아이 사진)과 같이 가는 다시 그리기라 안전 검사에 걸리기 쉽다", () => {
    for (const line of [headCorrectionLine(4, "big", 3.1), headCorrectionLine(5.5, "small", 7)]) {
      assert.ok(!/torso|\blegs?\b|\bbody\b|chest|waist|\bhips?\b/i.test(line), line);
      assert.match(line, /in relation to the whole figure\./);
    }
  });

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
}) {
  let t = o.start ?? 20_000;
  const calls = { measure: [] as { image: Img; timeoutMs: number }[], redraw: [] as { line: string; timeoutMs: number }[] };
  return {
    calls,
    now: () => t,
    measure: async (image: Img, timeoutMs: number): Promise<HeadMeasure> => {
      calls.measure.push({ image, timeoutMs });
      const ms = o.measureMs ?? 3_000;
      t += ms;
      const ratio = o.ratios[image] ?? null;
      return { ratio, ms, outcome: ratio === null ? "unreadable" : "ok" };
    },
    redraw: async (line: string, timeoutMs: number): Promise<Img> => {
      calls.redraw.push({ line, timeoutMs });
      t += o.redrawMs ?? 15_000;
      if (o.redrawFails) throw new Error("다시 그리기 실패");
      return "redraw";
    },
  };
}

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
    assert.match(r.calls.redraw[0].line, /too big \(about 1\/4\.2\)/);
    // 재기 3초 뒤(15초) → 다시 그리기 제한은 45초까지 남은 30초
    assert.equal(r.calls.redraw[0].timeoutMs, 30_000);
    assert.equal(out.log.checkMs, 6_000);
    assert.equal(out.log.redrawMs, 15_000);
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
    assert.match(r.calls.redraw[0].line, /too small/);
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

  it("다시 그린 그림을 못 재면(시간·실패) 다시 그린 그림을 남긴다 — 처음 그림은 벗어난 걸 이미 안다", async () => {
    // 다시 그리기가 오래 걸려 47초에 끝남 → 재기 몫(4초)이 안 남는다
    const late = rig({ ratios: { first: 4.2, redraw: 5.5 }, start: 5_000, redrawMs: 39_000 });
    const out = await evenOutHead({ image: "first" as Img, target: 5.5, ...late, ...BUDGET });
    assert.deepEqual([out.image, out.ratio, out.log.kept, out.log.outcome], ["redraw", null, "redraw", "redraw-unmeasured"]);
    const unreadable = rig({ ratios: { first: 4.2, redraw: null }, start: 5_000 });
    const out2 = await evenOutHead({ image: "first" as Img, target: 5.5, ...unreadable, ...BUDGET });
    assert.deepEqual([out2.image, out2.ratio], ["redraw", null]);
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
          assert.deepEqual([r.ratio, r.outcome], [null, outcome]);
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
