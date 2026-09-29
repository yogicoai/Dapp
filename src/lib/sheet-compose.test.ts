import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  composeCharacterSheet,
  outfitColour,
  planComposedSheet,
  prepareOutfitCard,
  prepareSheetFigure,
  scanFigure,
  SHEET_LAYOUT,
  sheetFigureMeta,
  sheetSlotOrder,
  splitCardColumns,
  subSheetAspect,
  torsoRegion,
  type FigureScan,
  type PlannedSlot,
  type SheetSlot,
} from "./sheet-compose.ts";

/*
 * 인물 시트를 가족 그림 원본 픽셀로 짜기 — 칸 나누기 셈, 그림 속 사람 찾기, 실제로 짠 그림.
 */

/** 흰 바탕 w×h 밝기 한 채널 — rects 는 잉크(0)로 칠한다 */
function grayImage(w: number, h: number, rects: [number, number, number, number][]): Uint8Array {
  const buf = new Uint8Array(w * h).fill(255);
  for (const [x0, y0, x1, y1] of rects) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) buf[y * w + x] = 0;
  }
  return buf;
}

describe("scanFigure — 흰 바탕에서 사람과 머리 가운데 찾기", () => {
  it("전신 네모와 머리 높이(전신 ÷ 머리 비율), 머리 가운데", () => {
    // 머리 x30~69 y20~59, 몸 x40~59 y60~199
    const g = grayImage(100, 200, [
      [30, 20, 69, 59],
      [40, 60, 59, 199],
    ]);
    const s = scanFigure(g, 100, 200, 4.5);
    assert.ok(s);
    assert.deepEqual(s.box, { left: 30, top: 20, width: 40, height: 180 });
    assert.equal(s.headHeight, 40);
    assert.equal(s.headCenterX, 50);
    assert.equal(s.imageWidth, 100);
    assert.equal(s.imageHeight, 200);
  });

  it("한쪽으로 묶은 머리가 몇 줄 삐져나와도 머리 가운데는 흔들리지 않는다(중앙값)", () => {
    const g = grayImage(120, 200, [
      [30, 20, 69, 59],
      [70, 40, 99, 46], // 오른쪽 꽁지머리 7줄
      [40, 60, 59, 199],
    ]);
    const s = scanFigure(g, 120, 200, 4.5);
    assert.ok(s);
    assert.equal(s.headCenterX, 50);
  });

  it("바탕에 튄 점 하나는 사람으로 치지 않고, 빈 그림은 null", () => {
    const g = grayImage(100, 200, [
      [2, 2, 2, 2],
      [40, 60, 59, 199],
    ]);
    const s = scanFigure(g, 100, 200, 5);
    assert.ok(s);
    assert.equal(s.box.top, 60);
    assert.equal(s.box.left, 40);
    assert.equal(scanFigure(grayImage(50, 50, []), 50, 50, 5), null);
    assert.equal(scanFigure(new Uint8Array(3), 50, 50, 5), null);
  });

  it("여러 채널(RGB) 버퍼도 첫 채널로 읽는다", () => {
    const g1 = grayImage(40, 80, [[10, 10, 29, 79]]);
    const rgb = new Uint8Array(40 * 80 * 3);
    g1.forEach((v, i) => rgb.set([v, v, v], i * 3));
    assert.deepEqual(scanFigure(rgb, 40, 80, 5, 3)?.box, scanFigure(g1, 40, 80, 5)?.box);
  });
});

const scan = (w: number, h: number): FigureScan => ({
  box: { left: 10, top: 5, width: w, height: h },
  headCenterX: 10 + Math.round(w / 2),
  headHeight: Math.round(h / 5),
  imageWidth: w + 20,
  imageHeight: h + 10,
});
const fig = (name: string, heightCm: number, w = 300, h = 1000): SheetSlot => ({ kind: "figure", name, scan: scan(w, h), heightCm });
type FigurePlan = Extract<PlannedSlot, { kind: "figure" }>;
const figuresOf = (slots: PlannedSlot[]) => slots.filter((s): s is FigurePlan => s.kind === "figure");
const bottomOf = (r: { top: number; height: number }) => r.top + r.height;
const within = (r: { left: number; top: number; width: number; height: number }, w: number, h: number) =>
  r.left >= 0 && r.top >= 0 && r.width >= 1 && r.height >= 1 && r.left + r.width <= w && r.top + r.height <= h;

describe("planComposedSheet — 칸 나누기", () => {
  it("셋이면 가로 1024, 발끝이 한 줄, 키는 cm 비율", () => {
    const plan = planComposedSheet([fig("하온", 110), fig("엄마", 163), fig("아빠", 175)]);
    assert.equal(plan.width, 1024);
    assert.ok(plan.height < plan.width);
    assert.deepEqual(plan.order, ["하온", "엄마", "아빠"]);
    const [kid, mom, dad] = figuresOf(plan.slots);
    // 발끝(아래 끝)이 같은 줄 — 반올림 1px 까지
    const bottoms = [kid, mom, dad].map((f) => bottomOf(f.figure.place));
    assert.ok(Math.max(...bottoms) - Math.min(...bottoms) <= 1, `bottoms ${bottoms}`);
    // 키 비율
    assert.ok(Math.abs(dad.figure.place.height / kid.figure.place.height - 175 / 110) < 0.02);
    assert.ok(Math.abs(mom.figure.place.height / dad.figure.place.height - 163 / 175) < 0.02);
    // 왼쪽에서 오른쪽으로
    assert.ok(kid.figure.place.left < mom.figure.place.left && mom.figure.place.left < dad.figure.place.left);
  });

  it("모든 네모가 캔버스·원본 안에 있고, 얼굴 칸은 전신 아래 같은 칸에", () => {
    const plan = planComposedSheet([fig("하온", 110, 420, 1000), fig("엄마", 163), fig("아빠", 175, 360, 1000)]);
    for (const f of figuresOf(plan.slots)) {
      assert.ok(within(f.figure.place, plan.width, plan.height));
      assert.ok(within(f.closeup.place, plan.width, plan.height));
      assert.ok(f.closeup.place.top >= bottomOf(f.figure.place));
      assert.ok(within(f.closeup.crop, 10000, 10000));
      assert.ok(f.closeup.crop.top >= 0 && f.closeup.crop.left >= 0);
      // 얼굴 칸 가운데 ≈ 전신 칸 가운데(같은 칸)
      const mid = (r: { left: number; width: number }) => r.left + r.width / 2;
      assert.ok(Math.abs(mid(f.closeup.place) - mid(f.figure.place)) <= 2);
    }
  });

  it("얼굴 오리기는 머리 위에서 시작해 머리 × 1.6 쯤, 원본 밖으로 나가지 않는다", () => {
    const s = scan(300, 1000); // 머리 200, 원본 320×1010
    const plan = planComposedSheet([{ kind: "figure", name: "엄마", scan: s, heightCm: 163 }]);
    const [f] = figuresOf(plan.slots);
    assert.equal(f.closeup.crop.top, Math.round(s.box.top - s.headHeight * SHEET_LAYOUT.headroom) < 0 ? 0 : Math.round(s.box.top - s.headHeight * SHEET_LAYOUT.headroom));
    assert.ok(f.closeup.crop.height >= s.headHeight * 1.5 && f.closeup.crop.height <= s.headHeight * 1.8);
    assert.ok(f.closeup.crop.left + f.closeup.crop.width <= s.imageWidth);
    assert.deepEqual(f.figure.crop, s.box);
  });

  it("한 명이면 세로로 긴 캔버스(세로 1024)", () => {
    const plan = planComposedSheet([fig("하온", 110)]);
    assert.equal(plan.height, 1024);
    assert.ok(plan.width < plan.height);
  });

  it("넓은 사람이 있으면 모두 같은 배율로 줄인다 — 키 비율은 그대로, 칸을 넘지 않는다", () => {
    const plan = planComposedSheet([fig("하온", 110, 1300, 1000), fig("아빠", 175, 300, 1000)]);
    const [kid, dad] = figuresOf(plan.slots);
    const content = plan.height - 2 * SHEET_LAYOUT.margin;
    const colW = SHEET_LAYOUT.column * content;
    assert.ok(kid.figure.place.width <= colW * SHEET_LAYOUT.columnFill + 1);
    assert.ok(Math.abs(dad.figure.place.height / kid.figure.place.height - 175 / 110) < 0.02);
    // 줄였으니 아빠도 위 줄을 다 채우지 않는다
    assert.ok(dad.figure.place.height < SHEET_LAYOUT.topShare * content * SHEET_LAYOUT.figureFill - 2);
  });

  it("AI 덩어리 — 내용 높이 전체, 가로 = 비율 × 높이, 순서는 칸 순서", () => {
    const plan = planComposedSheet([
      fig("하온", 110),
      { kind: "block", names: ["서연"], aspect: 0.75 },
      fig("엄마", 163),
    ]);
    assert.deepEqual(plan.order, ["하온", "서연", "엄마"]);
    const block = plan.slots[1];
    assert.equal(block.kind, "block");
    if (block.kind !== "block") return;
    const content = plan.height - 2 * SHEET_LAYOUT.margin;
    assert.equal(block.place.top, SHEET_LAYOUT.margin);
    assert.ok(Math.abs(block.place.height - content) <= 1);
    assert.ok(Math.abs(block.place.width - 0.75 * content) <= 1);
    assert.ok(within(block.place, plan.width, plan.height));
    const [kid, mom] = figuresOf(plan.slots);
    assert.ok(kid.figure.place.left < block.place.left && block.place.left + block.place.width <= mom.figure.place.left + 1);
  });

  it("사람이 많으면 얼굴이 너무 작아지지 않게 가로만 늘린다(내용 높이 520 이상, 가로 1600 이하)", () => {
    const plan = planComposedSheet([
      fig("하온", 110),
      fig("엄마", 163),
      fig("아빠", 175),
      fig("할머니", 154),
      { kind: "block", names: ["서연", "선생님"], aspect: 1 },
    ]);
    assert.ok(plan.height - 2 * SHEET_LAYOUT.margin >= SHEET_LAYOUT.minContent - 1);
    assert.ok(plan.width <= SHEET_LAYOUT.maxWidth);
    assert.ok(plan.width > 1024);
    for (const s of plan.slots) {
      assert.ok(within(s.kind === "block" ? s.place : s.figure.place, plan.width, plan.height));
    }
  });

  it("빈 목록은 던진다", () => {
    assert.throws(() => planComposedSheet([]));
  });
});

describe("sheetSlotOrder — 고정 가족과 AI 덩어리 세우기", () => {
  it("모두 고정이면 이야기 순서 그대로", () => {
    const r = sheetSlotOrder(["하온", "엄마", "아빠"], new Set(["하온", "엄마", "아빠"]));
    assert.deepEqual(r.order, ["하온", "엄마", "아빠"]);
    assert.ok(r.layout.every((s) => s.kind === "figure"));
  });

  it("나머지가 붙어 있으면 그 자리에 덩어리 — 이야기 순서 그대로", () => {
    const mid = sheetSlotOrder(["하온", "서연", "엄마"], new Set(["하온", "엄마"]));
    assert.deepEqual(mid.order, ["하온", "서연", "엄마"]);
    assert.deepEqual(mid.layout.map((s) => s.kind), ["figure", "block", "figure"]);
    const end = sheetSlotOrder(["하온", "엄마", "서연", "선생님"], new Set(["하온", "엄마"]));
    assert.deepEqual(end.order, ["하온", "엄마", "서연", "선생님"]);
    assert.deepEqual(end.layout.map((s) => s.kind), ["figure", "figure", "block"]);
    const first = sheetSlotOrder(["서연", "엄마"], new Set(["엄마"]));
    assert.deepEqual(first.order, ["서연", "엄마"]);
  });

  it("번갈아 있으면 고정 가족 먼저, 덩어리는 끝 — 이때 순서가 이야기와 다르다(쪽 그림이 sheetOrder 로 안다)", () => {
    const r = sheetSlotOrder(["하온", "서연", "엄마", "선생님"], new Set(["하온", "엄마"]));
    assert.deepEqual(r.order, ["하온", "엄마", "서연", "선생님"]);
    assert.deepEqual(r.layout.map((s) => s.kind), ["figure", "figure", "block"]);
  });
});

describe("subSheetAspect · sheetFigureMeta", () => {
  it("나머지 한 명은 세로, 둘은 정사각, 셋부터 가로", () => {
    assert.equal(subSheetAspect(1), "3:4");
    assert.equal(subSheetAspect(2), "1:1");
    assert.equal(subSheetAspect(3), "4:3");
  });

  it("키는 60~200cm 로 자르고, 없으면 사람 id 로 짐작", () => {
    assert.equal(sheetFigureMeta("child", {}).heightCm, 110);
    assert.equal(sheetFigureMeta("mom", {}).heightCm, 163);
    assert.equal(sheetFigureMeta("dad", { heightCm: "x" }).heightCm, 175);
    assert.equal(sheetFigureMeta("m-abc", {}).heightCm, 150);
    assert.equal(sheetFigureMeta("dad", { heightCm: 999 }).heightCm, 200);
    assert.equal(sheetFigureMeta("child", { heightCm: 10 }).heightCm, 60);
    assert.equal(sheetFigureMeta("m-abc", { heightCm: 118.4 }).heightCm, 118);
  });

  it("머리 비율은 잰 값(2~10) — 없거나 이상하면 아이 4.4 · 어른 5.6", () => {
    assert.equal(sheetFigureMeta("child", { headRatio: 4.73 }).headRatio, 4.73);
    assert.equal(sheetFigureMeta("child", {}).headRatio, 4.4);
    assert.equal(sheetFigureMeta("mom", { headRatio: 42 }).headRatio, 5.6);
    assert.equal(sheetFigureMeta("m-abc", { heightCm: 120 }).kid, true);
    assert.equal(sheetFigureMeta("m-abc", { heightCm: 160 }).kid, false);
  });
});

/* ─────────── 실제로 짜 보기(sharp, 네트워크 없음) ─────────── */

/** 흰 바탕 가족 참고 그림 흉내 — 머리(원)는 hair 색, 몸(네모)은 body 색. JPEG. */
async function portrait(w: number, h: number, hair: string, body: string) {
  const r = Math.round(w * 0.3);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#ffffff"/><circle cx="${w / 2}" cy="${r + 4}" r="${r}" fill="${hair}"/><rect x="${w * 0.25}" y="${2 * r + 8}" width="${w * 0.5}" height="${h - 2 * r - 12}" fill="${body}"/></svg>`;
  const jpg = await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
  return { mimeType: "image/jpeg", data: jpg.toString("base64") };
}

async function pixel(img: { data: string }, x: number, y: number) {
  const { data, info } = await sharp(Buffer.from(img.data, "base64")).raw().toBuffer({ resolveWithObject: true });
  const at = (Math.round(y) * info.width + Math.round(x)) * info.channels;
  return [data[at], data[at + 1], data[at + 2]];
}
const near = (a: number[], b: number[], tol = 40) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

describe("composeCharacterSheet — 원본 픽셀로 짠 시트", () => {
  it("모두 고정 — 크기는 계획대로, 모서리는 흰색, 칸마다 원본 색이 그대로", async () => {
    const figures = await Promise.all([
      prepareSheetFigure({ name: "하온", image: await portrait(300, 700, "#202020", "#1e5aff"), heightCm: 110, headRatio: 4.4 }),
      prepareSheetFigure({ name: "엄마", image: await portrait(300, 1000, "#202020", "#ff3c3c"), heightCm: 163, headRatio: 5.6 }),
      prepareSheetFigure({ name: "아빠", image: await portrait(320, 1000, "#202020", "#23a046"), heightCm: 175, headRatio: 5.6 }),
    ]);
    const out = await composeCharacterSheet({ names: ["하온", "엄마", "아빠"], figures });
    assert.deepEqual(out.order, ["하온", "엄마", "아빠"]);
    assert.equal(out.image.mimeType, "image/jpeg");
    const meta = await sharp(Buffer.from(out.image.data, "base64")).metadata();
    assert.equal(meta.width, out.width);
    assert.equal(meta.height, out.height);
    assert.ok(near(await pixel(out.image, 2, 2), [255, 255, 255], 6));
    assert.ok(near(await pixel(out.image, out.width - 3, out.height - 3), [255, 255, 255], 6));
    // 계획을 다시 세워 칸마다 몸 가운데 색을 본다
    const plan = planComposedSheet(figures.map((f) => ({ kind: "figure", name: f.name, scan: f.scan, heightCm: f.heightCm })));
    const colours: Record<string, number[]> = { 하온: [30, 90, 255], 엄마: [255, 60, 60], 아빠: [35, 160, 70] };
    for (const f of figuresOf(plan.slots)) {
      const p = f.figure.place;
      assert.ok(near(await pixel(out.image, p.left + p.width / 2, p.top + p.height * 0.75), colours[f.name]), f.name);
      // 얼굴 칸 가운데는 머리(어두운 색)
      const c = f.closeup.place;
      assert.ok(near(await pixel(out.image, c.left + c.width / 2, c.top + c.height * 0.4), [32, 32, 32], 50), `${f.name} closeup`);
    }
  });

  it("섞임 — AI 덩어리가 제자리에, 순서를 돌려준다", async () => {
    const figures = [
      await prepareSheetFigure({ name: "하온", image: await portrait(300, 700, "#202020", "#1e5aff"), heightCm: 110, headRatio: 4.4 }),
      await prepareSheetFigure({ name: "엄마", image: await portrait(300, 1000, "#202020", "#ff3c3c"), heightCm: 163, headRatio: 5.6 }),
    ];
    const aiPng = await sharp({ create: { width: 600, height: 800, channels: 3, background: { r: 250, g: 200, b: 0 } } }).png().toBuffer();
    const out = await composeCharacterSheet({
      names: ["하온", "서연", "엄마"],
      figures,
      block: { image: { mimeType: "image/png", data: aiPng.toString("base64") } },
    });
    assert.deepEqual(out.order, ["하온", "서연", "엄마"]);
    const plan = planComposedSheet([
      { kind: "figure", name: "하온", scan: figures[0].scan, heightCm: 110 },
      { kind: "block", names: ["서연"], aspect: 600 / 800 },
      { kind: "figure", name: "엄마", scan: figures[1].scan, heightCm: 163 },
    ]);
    const block = plan.slots[1];
    assert.equal(block.kind, "block");
    if (block.kind !== "block") return;
    assert.ok(near(await pixel(out.image, block.place.left + block.place.width / 2, block.place.top + block.place.height / 2), [250, 200, 0]));
  });

  it("덩어리가 있어야 하는데 없으면 던진다 — 라우트가 예전 AI 시트로 물러선다", async () => {
    const figures = [await prepareSheetFigure({ name: "하온", image: await portrait(200, 500, "#202020", "#1e5aff"), heightCm: 110, headRatio: 4.4 })];
    await assert.rejects(composeCharacterSheet({ names: ["하온", "서연"], figures }));
  });

  it("사람이 없는 그림(빈 흰 바탕)은 준비에서 던진다", async () => {
    const blank = await sharp({ create: { width: 100, height: 200, channels: 3, background: "#ffffff" } }).jpeg().toBuffer();
    await assert.rejects(
      prepareSheetFigure({ name: "엄마", image: { mimeType: "image/jpeg", data: blank.toString("base64") }, heightCm: 163, headRatio: 5.6 }),
    );
  });
});

/* ─────────── 옷 색 — 섞인 시트의 나머지 그림에 "가족과 다른 옷 색"을 알려 주려고 ─────────── */

/** [r,g,b] 를 n 번씩 이어 붙인 픽셀 버퍼(channels 3 또는 4) */
function pixels(runs: [number[], number][], channels = 3): Uint8Array {
  const out: number[] = [];
  for (const [rgb, n] of runs) for (let i = 0; i < n; i++) out.push(...rgb, ...(channels === 4 ? [255] : []));
  return new Uint8Array(out);
}

describe("torsoRegion · outfitColour — 가족 그림 속 윗옷 색", () => {
  it("윗옷 네모는 머리 아래 ~ 허리 위, 머리 가운데 좌우 — 전신 안에", () => {
    const s: FigureScan = {
      box: { left: 10, top: 20, width: 200, height: 1000 },
      headCenterX: 110,
      headHeight: 200,
      imageWidth: 300,
      imageHeight: 1100,
    };
    assert.deepEqual(torsoRegion(s), { left: 40, top: 300, width: 140, height: 200 });
    // 머리 비율이 커서(머리 2.4 개가 전신의 반을 넘으면) 전신의 55% 에서 멈춘다
    assert.equal(torsoRegion({ ...s, headHeight: 300 })?.top, 440);
    assert.equal(bottomOf(torsoRegion({ ...s, headHeight: 300 })!), 20 + 550);
    // 너무 작으면 null
    assert.equal(torsoRegion({ ...s, box: { ...s.box, height: 10 }, headHeight: 2 }), null);
  });

  it("수채화의 옅은 옷도 이름을 붙이고 16진 색을 함께 준다", () => {
    assert.equal(outfitColour(pixels([[[199, 218, 220], 100]]), 3), "pale blue (#c7dadc)");
    assert.equal(outfitColour(pixels([[[242, 192, 159], 100]]), 3), "peach (#f2c09f)");
    assert.equal(outfitColour(pixels([[[175, 179, 155], 100]]), 3), "pale green (#afb39b)");
    assert.equal(outfitColour(pixels([[[30, 50, 100], 100]]), 3), "navy (#1e3264)");
    assert.equal(outfitColour(pixels([[[250, 200, 0], 100]], 4), 4), "yellow (#fac800)");
  });

  it("종이(거의 흰색)는 세지 않고, 한 색이 40% 를 못 넘거나 픽셀이 적으면 말하지 않는다", () => {
    // 종이가 많아도 옷 색이 이긴다
    assert.equal(outfitColour(pixels([[[255, 255, 255], 500], [[30, 90, 255], 60]]), 3), "blue (#1e5aff)");
    assert.equal(outfitColour(pixels([[[255, 255, 255], 100]]), 3), null);
    // 세 색이 고르게(무늬 옷) — 모른다
    assert.equal(outfitColour(pixels([[[220, 40, 40], 40], [[30, 90, 255], 40], [[35, 160, 70], 40]]), 3), null);
    assert.equal(outfitColour(pixels([[[30, 90, 255], 10]]), 3), null);
    assert.equal(outfitColour(new Uint8Array(12), 1), null);
  });

  it("짜기 준비에서 가족 그림의 윗옷 색을 잰다(흉내 그림)", async () => {
    const [haon, mom, dad] = await Promise.all([
      prepareSheetFigure({ name: "하온", image: await portrait(300, 700, "#202020", "#1e5aff"), heightCm: 110, headRatio: 4.4 }),
      prepareSheetFigure({ name: "엄마", image: await portrait(300, 1000, "#202020", "#ff3c3c"), heightCm: 163, headRatio: 5.6 }),
      prepareSheetFigure({ name: "아빠", image: await portrait(320, 1000, "#202020", "#23a046"), heightCm: 175, headRatio: 5.6 }),
    ]);
    assert.match(haon.outfit ?? "", /^blue \(#/);
    assert.match(mom.outfit ?? "", /^red \(#/);
    assert.match(dad.outfit ?? "", /^green \(#/);
  });

  it("실제 수채화 가족 그림(public/family-example)에서도 — 하늘색 티·살구색 스웨터·세이지 셔츠", async () => {
    const read = async (file: string) => {
      const buf = await sharp(fileURLToPath(new URL(`../../public/family-example/${file}`, import.meta.url)))
        .flatten({ background: "#ffffff" })
        .jpeg()
        .toBuffer();
      return { mimeType: "image/jpeg", data: buf.toString("base64") };
    };
    const child = await prepareSheetFigure({ name: "하온", image: await read("child.webp"), heightCm: 110, headRatio: 4.4 });
    const mom = await prepareSheetFigure({ name: "엄마", image: await read("mom.webp"), heightCm: 163, headRatio: 5.6 });
    const dad = await prepareSheetFigure({ name: "아빠", image: await read("dad.webp"), heightCm: 175, headRatio: 5.6 });
    assert.match(child.outfit ?? "", /blue/);
    assert.match(mom.outfit ?? "", /^peach/);
    assert.match(dad.outfit ?? "", /green/);
  });
});

/* ─────────── 이 책의 옷 — 옷 카드(사람 없이 옷만)를 칸마다 잘라 위 줄에 세우기 ─────────── */

describe("splitCardColumns — 옷 카드를 사람 수만큼 칸 나누기", () => {
  it("칸 사이 흰 여백의 가운데를 자른다 — 같은 너비가 아니어도", () => {
    // 가로 300: 옷 x20~70, x130~160, x230~280 — 빈 곳 71~129, 161~229
    const g = grayImage(300, 100, [
      [20, 10, 70, 90],
      [130, 10, 160, 90],
      [230, 10, 280, 90],
    ]);
    const cols = splitCardColumns(g, 300, 100, 3);
    // 빈 곳 가운데 100.5 → 101, 195.5 → 196
    assert.deepEqual(cols, [
      { left: 0, width: 101 },
      { left: 101, width: 95 },
      { left: 196, width: 104 },
    ]);
  });

  it("빈 세로 줄이 없으면(옷이 붙어 있음) k/n 자리에서, 한 칸이면 통째로", () => {
    const g = grayImage(90, 50, [[0, 5, 89, 45]]);
    assert.deepEqual(splitCardColumns(g, 90, 50, 3), [
      { left: 0, width: 30 },
      { left: 30, width: 30 },
      { left: 60, width: 30 },
    ]);
    assert.deepEqual(splitCardColumns(g, 90, 50, 1), [{ left: 0, width: 90 }]);
  });

  it("여러 채널 버퍼도 첫 채널로", () => {
    const g1 = grayImage(200, 60, [
      [10, 5, 60, 55],
      [140, 5, 190, 55],
    ]);
    const rgb = new Uint8Array(200 * 60 * 3);
    g1.forEach((v, i) => rgb.set([v, v, v], i * 3));
    assert.deepEqual(splitCardColumns(rgb, 200, 60, 2, 3), splitCardColumns(g1, 200, 60, 2));
  });
});

describe("planComposedSheet — 이 책의 옷(옷 카드)", () => {
  /** 옷 카드 속 한 벌 — 카드 1200×900 */
  const outfitScan = (left: number, w: number, h: number): FigureScan => ({
    box: { left, top: 100, width: w, height: h },
    headCenterX: left + Math.round(w / 2),
    headHeight: Math.round(h / 5),
    imageWidth: 1200,
    imageHeight: 900,
  });
  const dressedFig = (name: string, heightCm: number, outfit: FigureScan): SheetSlot => ({
    kind: "figure",
    name,
    scan: scan(300, 1000),
    heightCm,
    outfit,
  });

  it("위 줄은 옷 카드의 옷(키 비율로), 아래 줄 얼굴은 원본 그대로", () => {
    const plain = planComposedSheet([fig("하온", 110), fig("아빠", 175)]);
    const plan = planComposedSheet([dressedFig("하온", 110, outfitScan(50, 200, 500)), dressedFig("아빠", 175, outfitScan(650, 200, 500))]);
    assert.equal(plan.width, plain.width);
    assert.equal(plan.height, plain.height);
    const [kid, dad] = figuresOf(plan.slots);
    assert.equal(kid.top, "outfit");
    assert.deepEqual(kid.figure.crop, { left: 50, top: 100, width: 200, height: 500 });
    assert.deepEqual(dad.figure.crop, { left: 650, top: 100, width: 200, height: 500 });
    // 아이 옷이 작게 — 키 비율
    assert.ok(Math.abs(dad.figure.place.height / kid.figure.place.height - 175 / 110) < 0.02);
    // 발끝 한 줄
    assert.ok(Math.abs(bottomOf(kid.figure.place) - bottomOf(dad.figure.place)) <= 1);
    // 얼굴은 옷이 없을 때와 똑같이 원본에서
    const [kid0, dad0] = figuresOf(plain.slots);
    assert.deepEqual(kid.closeup, kid0.closeup);
    assert.deepEqual(dad.closeup, dad0.closeup);
    for (const f of [kid, dad]) {
      assert.ok(within(f.figure.place, plan.width, plan.height));
      assert.ok(within(f.figure.crop, 1200, 900));
    }
  });

  it("옆으로 넓은 옷은 그 옷만 칸에 맞춰 줄인다 — 다른 사람은 그대로", () => {
    const plain = planComposedSheet([fig("하온", 110), fig("아빠", 175)]);
    const plan = planComposedSheet([dressedFig("하온", 110, outfitScan(0, 900, 300)), fig("아빠", 175)]);
    const [kid, dad] = figuresOf(plan.slots);
    const content = plan.height - 2 * SHEET_LAYOUT.margin;
    assert.ok(kid.figure.place.width <= SHEET_LAYOUT.column * content * SHEET_LAYOUT.columnFill + 1);
    assert.equal(dad.top, "portrait");
    assert.deepEqual(dad.figure, figuresOf(plain.slots)[1].figure);
  });

  it("옷이 없으면 예전 칸 그대로(top 만 portrait) — 섞인 시트 덩어리도 그대로", () => {
    const slots: SheetSlot[] = [fig("하온", 110), { kind: "block", names: ["서연"], aspect: 0.75 }, fig("엄마", 163)];
    const plan = planComposedSheet(slots);
    assert.ok(figuresOf(plan.slots).every((f) => f.top === "portrait"));
    const dressed = planComposedSheet([
      dressedFig("하온", 110, outfitScan(50, 200, 500)),
      slots[1],
      dressedFig("엄마", 163, outfitScan(650, 220, 520)),
    ]);
    assert.deepEqual(dressed.order, ["하온", "서연", "엄마"]);
    assert.deepEqual(dressed.slots[1], plan.slots[1]);
  });
});

/** 흰 바탕 옷 카드 흉내 — 칸마다 색 네모 한 벌(윗옷·바지) */
async function outfitCard(w: number, h: number, outfits: { x: number; top: string; bottom: string }[]) {
  const parts = outfits
    .map(
      (o) =>
        `<rect x="${o.x}" y="${h * 0.15}" width="${w * 0.14}" height="${h * 0.3}" fill="${o.top}"/>` +
        `<rect x="${o.x + w * 0.02}" y="${h * 0.47}" width="${w * 0.1}" height="${h * 0.35}" fill="${o.bottom}"/>`,
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#ffffff"/>${parts}</svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return { mimeType: "image/png", data: png.toString("base64") };
}

describe("prepareOutfitCard · composeCharacterSheet — 옷 카드로 짠 시트", () => {
  it("칸마다 한 벌을 찾아 이름에 붙이고, 시트 위 줄엔 그 옷·아래 줄엔 원본 얼굴", async () => {
    const card = await outfitCard(1200, 900, [
      { x: 100, top: "#ffa07a", bottom: "#4a6fa5" },
      { x: 520, top: "#3cb371", bottom: "#c8b89a" },
      { x: 930, top: "#9370db", bottom: "#555555" },
    ]);
    const prepared = await prepareOutfitCard({ image: card, names: ["하온", "엄마", "아빠"] });
    assert.deepEqual([...prepared.scans.keys()], ["하온", "엄마", "아빠"]);
    const lefts = [...prepared.scans.values()].map((sc) => sc.box.left);
    assert.ok(Math.abs(lefts[0] - 100) <= 2 && Math.abs(lefts[1] - 520) <= 2 && Math.abs(lefts[2] - 930) <= 2, `${lefts}`);
    assert.ok([...prepared.scans.values()].every((sc) => sc.imageWidth === 1200 && sc.imageHeight === 900));

    const figures = await Promise.all([
      prepareSheetFigure({ name: "하온", image: await portrait(300, 700, "#202020", "#1e5aff"), heightCm: 110, headRatio: 4.4 }),
      prepareSheetFigure({ name: "엄마", image: await portrait(300, 1000, "#202020", "#ff3c3c"), heightCm: 163, headRatio: 5.6 }),
      prepareSheetFigure({ name: "아빠", image: await portrait(320, 1000, "#202020", "#23a046"), heightCm: 175, headRatio: 5.6 }),
    ]);
    const out = await composeCharacterSheet({ names: ["하온", "엄마", "아빠"], figures, outfits: prepared });
    assert.deepEqual(out.order, ["하온", "엄마", "아빠"]);
    const plan = planComposedSheet(
      figures.map((f) => ({ kind: "figure", name: f.name, scan: f.scan, heightCm: f.heightCm, outfit: prepared.scans.get(f.name) })),
    );
    const tops: Record<string, number[]> = { 하온: [255, 160, 122], 엄마: [60, 179, 113], 아빠: [147, 112, 219] };
    for (const f of figuresOf(plan.slots)) {
      assert.equal(f.top, "outfit");
      const p = f.figure.place;
      // 위 줄 위쪽 = 옷 카드의 윗옷 색(가족 그림의 파랑·빨강·초록이 아니다)
      assert.ok(near(await pixel(out.image, p.left + p.width / 2, p.top + p.height * 0.2), tops[f.name]), f.name);
      // 아래 줄 얼굴은 원본(어두운 머리)
      const c = f.closeup.place;
      assert.ok(near(await pixel(out.image, c.left + c.width / 2, c.top + c.height * 0.4), [32, 32, 32], 50), `${f.name} closeup`);
    }
  });

  it("옷이 없는 칸이 있거나 바탕이 흰색이 아니면 던진다 — 라우트가 가족 그림 옷으로 물러선다", async () => {
    const one = await outfitCard(1200, 900, [{ x: 100, top: "#ffa07a", bottom: "#4a6fa5" }]);
    await assert.rejects(prepareOutfitCard({ image: one, names: ["하온", "엄마"] }));
    // 두 사람인데 한 벌을 가운데에 그렸다 — 옷 반 벌씩 입히지 않는다(한 칸이 비어 던진다)
    const middle = await outfitCard(1200, 900, [{ x: 516, top: "#ffa07a", bottom: "#4a6fa5" }]);
    await assert.rejects(prepareOutfitCard({ image: middle, names: ["하온", "엄마"] }));
    // 두 벌이 붙어 칸 경계에 흰 줄이 없다
    const touching = await outfitCard(1200, 900, [
      { x: 440, top: "#ffa07a", bottom: "#4a6fa5" },
      { x: 600, top: "#3cb371", bottom: "#c8b89a" },
    ]);
    await assert.rejects(prepareOutfitCard({ image: touching, names: ["하온", "엄마"] }));
    // 카드 전체가 한 덩어리(빈 세로 줄이 아예 없음)면 경계 검사에서 던진다
    const wideSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#ffffff"/><rect x="0" y="50" width="600" height="300" fill="#3cb371"/></svg>`;
    const wide = await sharp(Buffer.from(wideSvg)).png().toBuffer();
    await assert.rejects(
      prepareOutfitCard({ image: { mimeType: "image/png", data: wide.toString("base64") }, names: ["하온", "엄마"] }),
      /빈 곳이 없어요/,
    );
    // 신발만 있는 칸(너무 작다)
    const shoesSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#ffffff"/><rect x="100" y="100" width="150" height="400" fill="#3cb371"/><rect x="560" y="520" width="60" height="40" fill="#555555"/></svg>`;
    const shoes = await sharp(Buffer.from(shoesSvg)).png().toBuffer();
    await assert.rejects(prepareOutfitCard({ image: { mimeType: "image/png", data: shoes.toString("base64") }, names: ["하온", "엄마"] }));
    const grey = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#b0b0b0" } }).png().toBuffer();
    await assert.rejects(prepareOutfitCard({ image: { mimeType: "image/png", data: grey.toString("base64") }, names: ["하온"] }));
    await assert.rejects(prepareOutfitCard({ image: one, names: [] }));
  });

  /*
   * 견본(수채화)의 크림색 종이 결을 따라 그린 카드 — 바탕 242 안팎에 10%쯤 더 어두운 점(style_01.webp 가장자리를 재 본 값).
   * 두 벌이면 칸 사이 흰 줄이 없고, 한 벌이면 종이 전체가 옷 네모가 된다 — 둘 다 받지 않는다(검토 2026-09-29).
   */
  async function paperCard(w: number, h: number, xs: number[]) {
    const raw = Buffer.alloc(w * h * 3);
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let i = 0; i < w * h; i++) {
      const v = rand() < 0.1 ? 226 : 238 + Math.floor(rand() * 10);
      raw[i * 3] = v;
      raw[i * 3 + 1] = v - 2;
      raw[i * 3 + 2] = v - 8;
    }
    for (const x0 of xs) {
      for (let y = Math.round(h * 0.15); y < Math.round(h * 0.82); y++) {
        for (let x = x0; x < x0 + Math.round(w * 0.14); x++) raw.set([60, 140, 120], (y * w + x) * 3);
      }
    }
    const png = await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
    return { mimeType: "image/png", data: png.toString("base64") };
  }

  it("종이 결 바탕 카드는 한 벌이든 여러 벌이든 받지 않는다 — 흰 바탕은 그대로 받는다", async () => {
    await assert.rejects(prepareOutfitCard({ image: await paperCard(600, 450, [100, 400]), names: ["하온", "엄마"] }), /흰색이 아니에요/);
    await assert.rejects(prepareOutfitCard({ image: await paperCard(450, 600, [190]), names: ["하온"] }), /흰색이 아니에요/);
    const white = await outfitCard(1200, 900, [{ x: 100, top: "#ffa07a", bottom: "#4a6fa5" }, { x: 700, top: "#3cb371", bottom: "#c8b89a" }]);
    await prepareOutfitCard({ image: white, names: ["하온", "엄마"] });
    // 옷이 한 변(아래)에 닿아도 종이가 아니다
    const touchSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#ffffff"/><rect x="200" y="200" width="200" height="600" fill="#3cb371"/></svg>`;
    const touch = await sharp(Buffer.from(touchSvg)).png().toBuffer();
    await prepareOutfitCard({ image: { mimeType: "image/png", data: touch.toString("base64") }, names: ["하온"] });
  });

  it("아이 옷이 어른 옷보다 뚜렷이 크면(순서가 뒤바뀜) 받지 않는다 — 같은 크기는 받는다", async () => {
    const sized = async (heights: number[]) => {
      const rects = heights
        .map((hh, i) => `<rect x="${60 + i * 400}" y="${850 - hh}" width="200" height="${hh}" fill="#4a6fa5"/>`)
        .join("");
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><rect width="1200" height="900" fill="#ffffff"/>${rects}</svg>`;
      const png = await sharp(Buffer.from(svg)).png().toBuffer();
      return { mimeType: "image/png", data: png.toString("base64") };
    };
    const names = ["하온", "엄마", "아빠"];
    const kids = [true, false, false];
    // 맞게: 아이 작게
    await prepareOutfitCard({ image: await sized([450, 700, 760]), names, kids });
    // 모두 같은 크기로 그림 — 받는다(시트가 키대로 다시 세운다)
    await prepareOutfitCard({ image: await sized([700, 700, 700]), names, kids });
    // 아빠 옷을 첫 칸에 — 받지 않는다
    await assert.rejects(prepareOutfitCard({ image: await sized([760, 450, 700]), names, kids }), /순서가 뒤바뀐/);
    // kids 를 안 주면 예전처럼 크기를 보지 않는다
    await prepareOutfitCard({ image: await sized([760, 450, 700]), names });
  });
});
