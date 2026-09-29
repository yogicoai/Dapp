import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import type { HeadBoxes } from "./family-head.ts";
import {
  FEET_SHARE,
  NECK_GAP,
  STRETCH_GOAL_SHARE,
  KID_STRETCH_GOAL_SHARE,
  STRETCH_MARGIN,
  STRETCH_MAX,
  planStretch,
  ratioAfterStretch,
  stretchFigure,
  stretchGoal,
} from "./family-stretch.ts";

/** 엄마 다시 그림(4.56)과 같은 비율 — 머리 180칸, 키 820칸(0~1000) */
const MOM: HeadBoxes = { head: [100, 400, 280, 600], figure: [100, 250, 920, 750] };
/** 엄마 처음 그림(3.94) — 머리 208칸, 키 820칸 */
const MOM_FIRST: HeadBoxes = { head: [100, 380, 308, 620], figure: [100, 250, 920, 750] };
/** 머리 높이 h(0~1000 칸), 키 820칸인 상자 — 비율 = 820 ÷ h */
const withHead = (h: number): HeadBoxes => ({ head: [100, 400, 100 + h, 600], figure: [100, 250, 920, 750] });

describe("stretchGoal — 어른·청소년 표 × 0.8, 아이 표 × 0.88", () => {
  it("어른(표 7) 5.6 = 아빠, 청소년(6.5) 5.2, 아이 6살까지(표 5) 4.4 · 7~9살 4.84 · 10~12살 5.28", () => {
    assert.equal(STRETCH_GOAL_SHARE, 0.8);
    assert.equal(KID_STRETCH_GOAL_SHARE, 0.88);
    assert.ok(Math.abs(stretchGoal(7) - 5.6) < 1e-9);
    assert.ok(Math.abs(stretchGoal(6.5) - 5.2) < 1e-9);
    assert.ok(Math.abs(stretchGoal(5) - 4.4) < 1e-9);
    assert.ok(Math.abs(stretchGoal(5.5) - 4.84) < 1e-9);
    assert.ok(Math.abs(stretchGoal(6) - 5.28) < 1e-9);
  });
});

describe("planStretch — 턱선·발목선·배율 셈(그림 높이 1200px)", () => {
  it("엄마 4.56 → 턱 아래 목부터 발목까지 약 1.34배, 늘인 뒤 5.6", () => {
    const p = planStretch({ boxes: MOM, height: 1200, chart: 7 });
    assert.ok(p);
    // 머리 위 120px · 턱 336px · 발 1104px → 머리 216px · 키 984px
    // 시작 = 턱 + 머리 × NECK_GAP(0.15) = 368.4 → 368, 끝 = 발 − 키 × FEET_SHARE(0.08) = 1025.28 → 1025
    assert.equal(NECK_GAP, 0.15);
    assert.equal(FEET_SHARE, 0.08);
    assert.deepEqual([p.top, p.bottom], [368, 1025]);
    // 5.6 × 216 − 984 = 225.6px 늘려야 → 띠 657 → 883(1.344배, 상한 1.35 안)
    assert.deepEqual([p.bandOut, p.height, p.before, p.after], [883, 1426, 4.56, 5.6]);
    assert.ok(Math.abs(p.factor - 883 / 657) < 1e-9);
  });

  it("엄마 3.94(처음 그림) → 상한 1.35배에서 멈춘다(약 4.81)", () => {
    assert.equal(STRETCH_MAX, 1.35);
    const p = planStretch({ boxes: MOM_FIRST, height: 1200, chart: 7 });
    assert.ok(p);
    // 머리 249.6px · 시작 = 369.6 + 37.44 → 407, 띠 618 → floor(618 × 1.35) = 834
    assert.deepEqual([p.top, p.bottom, p.bandOut, p.height, p.before, p.after], [407, 1025, 834, 1416, 3.94, 4.81]);
    assert.ok(p.factor <= STRETCH_MAX, `배율 ${p.factor}`);
  });

  it("늘인 뒤 비율 = (키 + 늘어난 만큼) ÷ 머리 — 머리는 그대로", () => {
    for (const h of [160, 170, 190, 210, 240]) {
      for (const H of [900, 1200, 1536]) {
        const p = planStretch({ boxes: withHead(h), height: H, chart: 7 });
        assert.ok(p, `머리 ${h}`);
        const head = (h / 1000) * H;
        const tall = (820 / 1000) * H;
        assert.equal(p.height - H, p.bandOut - (p.bottom - p.top), "늘어난 만큼만 높아진다");
        assert.ok(Math.abs(p.after - (tall + p.height - H) / head) < 0.006, `머리 ${h} · 높이 ${H}`);
        assert.ok(p.after <= 5.61, "맞출 비율(5.6)을 넘지 않는다");
        assert.ok(p.factor > 1 && p.factor <= STRETCH_MAX);
        // 띠는 턱 아래에서 시작해 신발 위에서 끝난다
        assert.ok(p.top > ((100 + h) / 1000) * H && p.bottom < (920 / 1000) * H && p.top < p.bottom);
      }
    }
  });

  it("맞출 비율보다 5% 넘게 작을 때만 — 아빠 5.6·5.33 은 그대로, 5.3 은 늘인다", () => {
    assert.equal(STRETCH_MARGIN, 0.05);
    // 문턱 5.6 × 0.95 = 5.32
    assert.equal(planStretch({ boxes: withHead(146), height: 1200, chart: 7 }), null, "5.62 (아빠쯤)");
    assert.equal(planStretch({ boxes: withHead(153.8), height: 1200, chart: 7 }), null, "5.33");
    const p = planStretch({ boxes: withHead(154.7), height: 1200, chart: 7 });
    assert.ok(p, "5.3");
    assert.equal(p.before, 5.3);
    assert.ok(p.factor < 1.15, "조금만");
    // 머리가 작은 쪽(비율이 큼)은 건드리지 않는다
    assert.equal(planStretch({ boxes: withHead(100), height: 1200, chart: 7 }), null, "8.2");
  });

  it("아이(표 5) — 사장님이 고른 4.2 는 그대로(문턱 4.18 위), 3.83·대두 3.5 는 4.4 까지", () => {
    assert.equal(planStretch({ boxes: withHead(195), height: 1200, chart: 5 }), null, "4.21");
    const q = planStretch({ boxes: withHead(214), height: 1200, chart: 5 });
    assert.ok(q);
    assert.deepEqual([q.before, q.after], [3.83, 4.4]);
    const p = planStretch({ boxes: withHead(234), height: 1200, chart: 5 });
    assert.ok(p);
    // 대두 3.5 는 상한(1.35)에 걸려 4.23 까지 — 사장님이 고른 앞 그림(약 4.2) 쯤
    assert.deepEqual([p.before, p.after], [3.5, 4.23]);
    assert.ok(p.factor <= 1.35 + 1e-9);
  });

  it("턱을 머리 높이의 10% 높게 잡아도(글 모델 상자 오차) 띠는 실제 턱 아래에서 시작한다 — 얼굴이 늘지 않는다", () => {
    // 실제 턱 336px(MOM). 턱을 10% 높게(머리 216px × 0.1 = 21.6px 위, 0~1000 으로 18칸) 잡은 상자
    const early: HeadBoxes = { head: [100, 400, 262, 600], figure: [100, 250, 920, 750] };
    const p = planStretch({ boxes: early, height: 1200, chart: 7 });
    assert.ok(p);
    assert.ok(p.top > 336, `띠 시작 ${p.top} — 실제 턱(336) 아래`);
  });

  it("못 믿을 상자·그림 높이면 null — 늘이지 않는다", () => {
    // 머리가 전신보다 아래로 나감
    assert.equal(planStretch({ boxes: { head: [100, 400, 950, 600], figure: [100, 250, 920, 750] }, height: 1200, chart: 7 }), null);
    // 머리 상자에 긴 머리까지 들어감(세로로 길쭉)
    assert.equal(planStretch({ boxes: { head: [80, 450, 520, 550], figure: [80, 250, 920, 750] }, height: 1200, chart: 7 }), null);
    // 그림 높이·표가 이상함
    assert.equal(planStretch({ boxes: MOM, height: 0, chart: 7 }), null);
    assert.equal(planStretch({ boxes: MOM, height: 1200.5, chart: 7 }), null);
    assert.equal(planStretch({ boxes: MOM, height: 1200, chart: 0 }), null);
    // 그림이 너무 작아 띠가 몇 픽셀뿐
    assert.equal(planStretch({ boxes: MOM, height: 60, chart: 7 }), null);
  });
});

describe("ratioAfterStretch — 건넬 때의 비율(머리 재기가 두 장을 견줄 때)", () => {
  it("늘일 그림이면 늘인 뒤 비율 — 엄마 4.56 → 5.6, 3.94 → 상한에서 약 4.8", () => {
    assert.equal(ratioAfterStretch(4.56, MOM, 7), 5.6);
    const first = ratioAfterStretch(3.94, MOM_FIRST, 7);
    assert.equal(first, planStretch({ boxes: MOM_FIRST, height: 1000, chart: 7 })?.after);
    assert.ok(first > 4.7 && first < 4.9, `${first}`);
  });

  it("늘이지 않을 그림·상자 없음이면 잰 비율 그대로", () => {
    assert.equal(ratioAfterStretch(5.62, withHead(146), 7), 5.62, "아빠쯤 — 늘이지 않는다");
    assert.equal(ratioAfterStretch(8.2, withHead(100), 7), 8.2, "머리가 작은 쪽");
    assert.equal(ratioAfterStretch(4.56, null, 7), 4.56, "상자 없음(못 잼)");
  });
});

/* ─────────────────────────────── 그림에 대 보기 ─────────────────────────────── */

type Px = [number, number, number, number];
const BLUE: Px = [40, 90, 200, 255];
const RED: Px = [200, 40, 40, 255];
const GREEN: Px = [30, 150, 60, 255];

/**
 * 300×400 가짜 그림 — 바탕(흰색 또는 투명), 위에서 아래까지 파란 세로 줄(x 100~139), 머리 자리 빨간 가로 띠(y 60~79),
 * 신발 자리 초록 가로 띠(y 350~369). 상자는 MOM(4.56)과 같다: 머리 위 40 · 턱 112 · 발 368.
 */
async function paint(channels: 3 | 4): Promise<Buffer> {
  const W = 300;
  const H = 400;
  const buf = Buffer.alloc(W * H * channels);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let c: Px = channels === 4 ? [0, 0, 0, 0] : [255, 255, 255, 255];
      if (x >= 100 && x < 140) c = BLUE;
      if (y >= 60 && y < 80 && x >= 150 && x < 250) c = RED;
      if (y >= 350 && y < 370 && x >= 150 && x < 250) c = GREEN;
      const o = (y * W + x) * channels;
      for (let k = 0; k < channels; k++) buf[o + k] = c[k];
    }
  }
  return sharp(buf, { raw: { width: W, height: H, channels } }).png().toBuffer();
}

async function raw(png: Buffer) {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x + 1) * info.channels)];
  const rowOf = (y: number) => data.subarray(y * info.width * info.channels, (y + 1) * info.width * info.channels);
  return { info, at, rowOf };
}

describe("stretchFigure — 머리는 그대로, 목 ~ 발목 띠만 세로로", () => {
  it("흰 바탕 그림: 가로는 그대로, 세로는 계획대로 — 위(머리)·아래(신발) 줄은 원래 픽셀 그대로", async () => {
    const input = await paint(3);
    const r = await stretchFigure(input, { boxes: MOM, chart: 7 });
    assert.ok(r);
    const { plan } = r;
    assert.deepEqual([plan.top, plan.bottom, plan.bandOut, plan.height, plan.after], [123, 342, 294, 475, 5.6]);

    const a = await raw(input);
    const b = await raw(r.image);
    assert.equal((await sharp(r.image).metadata()).format, "png");
    assert.deepEqual([b.info.width, b.info.height, b.info.channels], [300, 475, 3], "가로·채널 그대로, 세로만 늘었다");
    // 띠 위 — 머리(빨간 띠 포함)는 한 픽셀도 안 바뀐다
    for (let y = 0; y < plan.top; y++) assert.ok(a.rowOf(y).equals(b.rowOf(y)), `위 ${y}줄`);
    // 띠 아래 — 신발(초록 띠 포함)은 늘어난 만큼 내려갔을 뿐 그대로
    const shift = plan.height - 400;
    for (let y = plan.bottom; y < 400; y++) assert.ok(a.rowOf(y).equals(b.rowOf(y + shift)), `아래 ${y}줄`);
    assert.deepEqual(b.at(200, 70), [200, 40, 40]);
    assert.deepEqual(b.at(200, 360 + shift), [30, 150, 60]);
  });

  it("끊김 없음 — 세로 줄은 턱선·발목선을 지나며 같은 색, 바탕은 흰색 그대로", async () => {
    const r = await stretchFigure(await paint(3), { boxes: MOM, chart: 7 });
    assert.ok(r);
    const b = await raw(r.image);
    for (let y = 0; y < r.plan.height; y++) {
      const [R, G, B] = b.at(120, y);
      assert.ok(Math.abs(R - 40) <= 1 && Math.abs(G - 90) <= 1 && Math.abs(B - 200) <= 1, `줄 ${y}: ${R},${G},${B}`);
      assert.deepEqual(b.at(20, y), [255, 255, 255], `바탕 ${y}`);
    }
  });

  it("투명 바탕(RGBA)이면 알파를 지킨다 — 투명은 투명, 불투명은 불투명", async () => {
    const r = await stretchFigure(await paint(4), { boxes: MOM, chart: 7 });
    assert.ok(r);
    const meta = await sharp(r.image).metadata();
    assert.deepEqual([meta.width, meta.height, meta.channels, meta.hasAlpha], [300, 475, 4, true]);
    const b = await raw(r.image);
    for (const y of [0, 100, r.plan.top, 200, 300, r.plan.top + r.plan.bandOut - 1, 474]) {
      assert.equal(b.at(20, y)[3], 0, `바탕 알파 ${y}`);
      assert.equal(b.at(270, y)[3], 0, `바탕 알파 ${y}`);
      assert.equal(b.at(120, y)[3], 255, `세로 줄 알파 ${y}`);
    }
  });

  it("늘일 까닭이 없으면 null — 부른 쪽은 원래 그림을 쓴다", async () => {
    const input = await paint(3);
    assert.equal(await stretchFigure(input, { boxes: withHead(146), chart: 7 }), null, "아빠 5.62");
    assert.equal(await stretchFigure(input, { boxes: MOM, chart: 5 }), null, "아이 표 5(맞출 4.4)면 4.56 은 그대로");
  });

  it("그림을 못 읽으면 던진다(부른 쪽이 잡아 원래 그림으로)", async () => {
    await assert.rejects(stretchFigure(Buffer.from("not an image"), { boxes: MOM, chart: 7 }));
  });
});
