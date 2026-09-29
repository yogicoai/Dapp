import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adultHeightCm } from "./family.ts";
import {
  ADULT_HEAD_RATIO,
  BODY_STRETCH_MAX,
  FACE_FIT,
  FACE_SIZE,
  FACE_UNIT_CM,
  GROUP_GAP_SHARE,
  GROUP_SAME_CM_CAP,
  OPAQUE_PAD,
  cleanBodyStretch,
  cleanHeadRatio,
  closerHead,
  faceLayout,
  faceSize,
  fitFace,
  headChartRatio,
  headRatioFromBoxes,
  headVerdict,
  heightGive,
  ratioText,
  readBox,
  type FacePlan,
  type FaceSlot,
} from "./family-head.ts";
import { FEET_SHARE, NECK_GAP, STRETCH_MAX, stretchGoal } from "./family-stretch.ts";

describe("headChartRatio — 사장님 얼굴 비율표(키 ÷ 머리)", () => {
  it("아이 6살까지 5 · 7~9살 5.5 · 10~12살 6 · 청소년 6.5 · 어른 7 (09-29 오후 되돌림 — 1:4 는 대두)", () => {
    assert.equal(headChartRatio("child", 3), 5);
    assert.equal(headChartRatio("child", 6), 5);
    assert.equal(headChartRatio("child", 7), 5.5);
    assert.equal(headChartRatio("child", 9), 5.5);
    assert.equal(headChartRatio("child", 10), 6);
    assert.equal(headChartRatio("sibling", 12), 6);
    assert.equal(headChartRatio("sibling", 13), 6.5);
    assert.equal(headChartRatio("friend", 19), 6.5);
    assert.equal(headChartRatio("friend", 30), 7);
    for (const role of ["mom", "dad", "grandma", "grandpa"] as const) assert.equal(headChartRatio(role), 7);
  });

  it("나이를 모르면 아이는 6살까지와 같다", () => {
    assert.equal(headChartRatio("child", null), 5);
    assert.equal(headChartRatio("sibling"), 5);
    assert.equal(headChartRatio("friend", 0), 5);
  });

  it("ratioText — 프롬프트·로그 글", () => {
    assert.equal(ratioText(4), "1/4");
    assert.equal(ratioText(4.5), "1/4.5");
    assert.equal(ratioText(5.5), "1/5.5");
    assert.equal(ratioText(4.213), "1/4.2");
  });
});

describe("headRatioFromBoxes — 머리·전신 상자([위,왼,아래,오른] 0~1000) → 전신 높이 ÷ 머리 높이", () => {
  it("세로 높이만 나눈다(0.01 단위)", () => {
    // 전신 80~920(840), 머리 80~290(210) → 4
    assert.equal(headRatioFromBoxes([80, 400, 290, 600], [80, 250, 920, 750]), 4);
    // 전신 70~930(860), 머리 70~226(156) → 5.51
    assert.equal(headRatioFromBoxes([70, 430, 226, 570], [70, 300, 930, 700]), 5.51);
  });

  it("머리가 전신 위로 조금(25 칸까지) 삐져나오는 건 받는다 — 두 상자를 따로 재서 몇 칸 어긋난다", () => {
    // 키도 머리 위(60)부터 잰다: (920 − 60) ÷ 210 = 4.1
    assert.equal(headRatioFromBoxes([60, 400, 270, 600], [80, 250, 920, 750]), 4.1);
    assert.equal(headRatioFromBoxes([40, 400, 250, 600], [80, 250, 920, 750]), null);
  });

  it("키는 머리 상자 위(머리카락 맨 위)부터 — 전신 상자에 올림머리·모자가 들어가도 키가 늘지 않는다", () => {
    // 올림머리까지 든 전신 50~920, 머리(올림머리 뺌) 100~260 → (920 − 100) ÷ 160 = 5.13 (전신 위를 쓰면 5.44 로 머리가 덜 커 보인다)
    assert.equal(headRatioFromBoxes([100, 420, 260, 580], [50, 280, 920, 720]), 5.13);
  });

  it("긴 머리가 든 머리 상자(화면 세로 ÷ 가로 1.6 넘음)는 못 잰 것 — 머리가 크다고 잘못 보고 값을 들여 다시 그리지 않게", () => {
    // 턱 아래로 늘어진 긴 머리까지: 100~330(230칸) × 가로 150칸 → 화면 2.04 — 그대로면 3.57(머리가 크다)로 잘못 잡는다
    assert.equal(headRatioFromBoxes([100, 425, 330, 575], [100, 250, 920, 750]), null);
    // 머리만(턱까지): 100~250(150칸) × 가로 150칸 → 화면 1.33 → 5.47
    assert.equal(headRatioFromBoxes([100, 425, 250, 575], [100, 250, 920, 750]), 5.47);
  });

  it("가로·세로를 바꿔 적은 답([xmin, ymin, …])은 못 잰 것 — 선 사람 전신은 화면에서 세로가 가로의 1.4배를 넘는다", () => {
    // 바른 답 [80,380,230,560] / [80,250,920,750](5.6)을 가로·세로 바꿔 적음 — 그대로 읽으면 가로 폭으로 나눠 약 2.1(머리가 크다)
    assert.equal(headRatioFromBoxes([80, 380, 230, 560], [80, 250, 920, 750]), 5.6);
    assert.equal(headRatioFromBoxes([380, 80, 560, 230], [250, 80, 750, 920]), null);
  });

  it("못 믿을 상자는 null — 머리가 전신 밖·머리가 너무 작음·전신이 너무 작음·비율이 범위(2~10) 밖", () => {
    assert.equal(headRatioFromBoxes([80, 400, 950, 600], [80, 250, 920, 750]), null, "머리가 전신 아래로 넘친다");
    assert.equal(headRatioFromBoxes([80, 400, 90, 600], [80, 250, 920, 750]), null, "머리 높이 10칸");
    assert.equal(headRatioFromBoxes([80, 400, 150, 600], [80, 250, 300, 750]), null, "전신이 그림의 22%");
    assert.equal(headRatioFromBoxes([80, 250, 520, 750], [80, 250, 920, 750]), null, "비율 2 아래(1.91)");
    assert.equal(headRatioFromBoxes([80, 400, 160, 600], [80, 250, 920, 750]), null, "비율 10 넘음");
  });

  it("readBox — 네 값이 0~1000 이고 위<아래·왼<오른인 것만", () => {
    assert.deepEqual(readBox([1, 2, 3, 4]), [1, 2, 3, 4]);
    for (const bad of [null, [1, 2, 3], [1, 2, 3, "4"], [5, 2, 3, 4], [1, 5, 3, 4], [-1, 2, 3, 4], [1, 2, 3, 1001], [1, 2, 3, Number.NaN]]) {
      assert.equal(readBox(bad), null, JSON.stringify(bad));
    }
  });

  it("cleanHeadRatio — 저장·응답 값은 범위 안 숫자만, 0.01 단위", () => {
    assert.equal(cleanHeadRatio(4.567), 4.57);
    assert.equal(cleanHeadRatio(2), 2);
    assert.equal(cleanHeadRatio(10), 10);
    for (const bad of [1.99, 10.01, "5", null, undefined, Number.NaN, Number.POSITIVE_INFINITY, {}]) {
      assert.equal(cleanHeadRatio(bad), undefined, String(bad));
    }
  });
});

describe("headVerdict·closerHead — 다시 그릴지, 무엇을 남길지", () => {
  it("표보다 20% 넘게 작은 비율 = 머리가 크다(big), 20% 넘게 큰 비율 = 머리가 작다(small), 그 사이는 ok", () => {
    // 어른 7: big 은 5.6 아래, small 은 8.4 위
    assert.equal(headVerdict(4.7, 7), "big", "사장님이 본 아빠(약 1:4.7)");
    assert.equal(headVerdict(5.59, 7), "big");
    assert.equal(headVerdict(5.61, 7), "ok");
    assert.equal(headVerdict(7, 7), "ok");
    assert.equal(headVerdict(8.39, 7), "ok");
    assert.equal(headVerdict(8.41, 7), "small");
    // 아이 5: big 은 4 아래, small 은 6 위 — 사장님이 고른 앞 그림(약 1:4.2)은 ok, 대두(약 1:3.5)는 big
    assert.equal(headVerdict(3.5, 5), "big", "사장님이 대두라고 한 새 그림");
    assert.equal(headVerdict(4.2, 5), "ok", "사장님이 고른 앞 그림");
    assert.equal(headVerdict(6.1, 5), "small");
  });

  it("표에 더 가까운 쪽 — 배율로 잰다, 같으면 처음 것", () => {
    assert.equal(closerHead(4.2, 5.1, 5.5), "second");
    assert.equal(closerHead(4.9, 7.5, 5.5), "first", "다시 그린 게 반대로 너무 멀리 갔다");
    // 1.25배 크게(4.4)와 1.25배 작게(6.875)는 같은 만큼 벗어났다 — 처음 것을 둔다
    assert.equal(closerHead(4.4, 6.875, 5.5), "first");
    assert.equal(closerHead(5.5, 5.5, 5.5), "first");
  });
});

describe("faceSize — 얼굴 크기표(아빠 = 1, 사장님 2026-09-29 '가족들이 얼굴 크기에 대한 비율이 있어야')", () => {
  it("어른 남자 1 · 어른 여자 0.94 · 아이 6살까지 0.8 · 7~9살 0.85 · 10~12살 0.9 · 청소년 0.95", () => {
    assert.equal(faceSize("dad"), 1);
    assert.equal(faceSize("grandpa"), 1);
    assert.equal(faceSize("mom"), 0.94);
    assert.equal(faceSize("grandma"), 0.94);
    assert.equal(faceSize("child", 3), 0.8);
    assert.equal(faceSize("child", 6), 0.8);
    assert.equal(faceSize("child", 7), 0.85);
    assert.equal(faceSize("child", 9), 0.85);
    assert.equal(faceSize("child", 10), 0.9);
    assert.equal(faceSize("sibling", 12), 0.9);
    assert.equal(faceSize("child", 13), 0.95, "키 표는 14살까지 — 13살 아이는 청소년 얼굴");
    assert.equal(faceSize("friend", 19), 0.95);
  });

  it("나이를 모르면 6살까지와 같다 · 20살부터 형제·친구는 성별로 어른(모르면 둘의 가운데)", () => {
    assert.equal(faceSize("child", null), 0.8);
    assert.equal(faceSize("sibling"), 0.8);
    assert.equal(faceSize("friend", 0), 0.8);
    assert.equal(faceSize("sibling", 25, "boy"), FACE_SIZE.man);
    assert.equal(faceSize("friend", 30, "girl"), FACE_SIZE.woman);
    assert.ok(Math.abs(faceSize("sibling", 22) - 0.97) < 1e-9);
  });

  it("아이 얼굴이 어른보다 작고, 나이가 들수록 커진다(어른 여자보다 청소년이 크지는 않게 0.95 ≤ 1)", () => {
    const kids = [3, 8, 11, 15].map((a) => faceSize("child", a));
    for (let i = 1; i < kids.length; i++) assert.ok(kids[i] > kids[i - 1]);
    assert.ok(kids[kids.length - 1] < FACE_SIZE.man);
  });

  it("FACE_UNIT_CM = 보통 키 아빠(175cm) ÷ 몸 늘이기 목표 비율(표 7 × 0.8 = 5.6) — 사장님이 맞다고 한 아빠는 그림 그대로", () => {
    assert.equal(FACE_UNIT_CM, adultHeightCm("dad") / stretchGoal(ADULT_HEAD_RATIO));
    assert.ok(Math.abs(FACE_UNIT_CM - 31.25) < 1e-9, String(FACE_UNIT_CM));
    // 발 칸은 몸 늘이기와 같은 자리. 턱 아래 여유는 몸 늘이기보다 넉넉하다 — 여기서는 턱을 그림 높이 ÷ 잰 비율로
    // 어림하고, 잘린 그림에는 잰 머리 위로 솟은 올림머리·모자가 들어 있다(FACE_FIT 머리말).
    assert.ok(FACE_FIT.neckGap >= NECK_GAP);
    assert.equal(FACE_FIT.feetShare, FEET_SHARE);
    // 두 번 늘인 합의 한도는 몸 늘이기 상한보다 크고, family-stretch 가 적어 둔 '더 올려도 1.45 까지만'을 넘지 않는다
    assert.ok(FACE_FIT.totalMax > STRETCH_MAX && FACE_FIT.totalMax <= 1.45);
    assert.ok(BODY_STRETCH_MAX >= STRETCH_MAX, "굽기 상한을 올려도 저장값이 버려지지 않게 여유");
  });
});

describe("cleanBodyStretch — 굽기 때 늘인 배율(FamilyPortrait.bodyStretch)", () => {
  it("1 초과 ~ BODY_STRETCH_MAX 숫자만 0.01 단위로, 아니면 없음(1 로 친다)", () => {
    assert.equal(cleanBodyStretch(1.3487), 1.35);
    assert.equal(cleanBodyStretch(1.2), 1.2);
    assert.equal(cleanBodyStretch(1), undefined, "안 늘였다");
    assert.equal(cleanBodyStretch(1.004), undefined, "반올림하면 1 — 안 늘인 것");
    assert.equal(cleanBodyStretch(0.9), undefined);
    assert.equal(cleanBodyStretch(BODY_STRETCH_MAX + 0.1), undefined);
    assert.equal(cleanBodyStretch("1.3"), undefined);
    assert.equal(cleanBodyStretch(Number.NaN), undefined);
    assert.equal(cleanBodyStretch(undefined), undefined);
  });
});

describe("fitFace·faceLayout — 키는 실제 키, 얼굴은 표, 몸 칸이 둘을 잇는다", () => {
  const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;
  /** 세 칸 높이를 더하면 키, 머리는 고른 배율 × 머리 몫 — 셈이 스스로 맞는지 */
  const consistent = (plan: FacePlan, r: number, pad = 0) => {
    const s = plan.split!;
    const sum = s.scale * (s.cut + s.stretch * (s.foot - s.cut) + (1 - s.foot));
    assert.ok(near(sum, plan.height, 1e-6), `칸 합 ${sum} = 그림 높이 ${plan.height}`);
    assert.ok(near(plan.figure!, plan.height - 2 * pad * s.scale, 1e-6), "사람 키 = 그림 높이 − 위·아래 여백(고른 배율)");
    assert.ok(near(s.head, (s.scale * (1 - 2 * pad)) / r, 1e-6), "머리 = 배율 × 머리 몫");
    assert.ok(s.cut < s.foot && s.foot <= 1 && s.cut > 0);
  };

  it("잰 비율이 없으면 나누지 않고 실제 키 그대로(예전 그림 — 오늘과 같다)", () => {
    const out = faceLayout([
      { cm: 163, face: 0.94 },
      { cm: 110, face: 0.8 },
      { cm: 175, face: 1 },
    ]);
    assert.deepEqual(out, [{ height: 163 }, { height: 110 }, { height: 175 }]);
  });

  it("이상한 값(키 0·얼굴 0·비율 0·머리가 그림의 절반 넘는 비율)은 나누지 않는다", () => {
    assert.deepEqual(fitFace({ cm: 0, headRatio: 5, face: 1 }), { height: 0 });
    assert.deepEqual(fitFace({ cm: 160, headRatio: 5, face: 0 }), { height: 160 });
    assert.deepEqual(fitFace({ cm: 160, headRatio: 0, face: 1 }), { height: 160 });
    assert.deepEqual(fitFace({ cm: 160, headRatio: 1.5, face: 1 }), { height: 160 });
  });

  it("사장님이 맞다고 한 아빠(175cm·5.6) — 몸 칸 배율 1, 머리 = FACE_UNIT_CM: 예전처럼 그림 그대로 선다", () => {
    const dad = fitFace({ cm: 175, headRatio: 5.6, face: 1 });
    assert.equal(dad.height, 175);
    assert.ok(near(dad.split!.stretch, 1), String(dad.split!.stretch));
    assert.ok(near(dad.split!.head, FACE_UNIT_CM));
    assert.ok(near(dad.split!.scale, 175), "그림 전체 높이 = 키(고르게)");
    consistent(dad, 5.6);
  });

  it("아빠·아이 사이(사장님이 맞다고 한 것)가 그대로 — 예전 화면 0.79, 이제 0.80", () => {
    // 예전 groupHeights: 엄마 4.56(163)·아이 4.2(110, 5살)·아빠 5.6(175) → 146.7 · 101.2 · 170.8cm
    // 얼굴 = 키 ÷ 비율 → 아이 24.10 · 아빠 30.50 → 0.790
    const before = 101.2 / 4.2 / (170.8 / 5.6);
    const [, child, dad] = faceLayout([
      { cm: 163, headRatio: 4.56, face: faceSize("mom") },
      { cm: 110, headRatio: 4.2, face: faceSize("child", 5) },
      { cm: 175, headRatio: 5.6, face: faceSize("dad") },
    ]);
    const after = child.split!.head / dad.split!.head;
    assert.ok(near(after, 0.8), String(after));
    assert.ok(Math.abs(after - before) < 0.015, `예전 ${before.toFixed(3)} → ${after.toFixed(3)}`);
    // 아이는 제 키(110cm) 그대로, 몸 칸은 조금만 늘어난다
    assert.equal(child.height, 110);
    assert.ok(child.split!.stretch > 1 && child.split!.stretch < 1.1, String(child.split!.stretch));
    consistent(child, 4.2);
  });

  it("사장님 엄마(4.56) — 얼굴이 아빠의 0.94 로(예전 1.06), 키는 거의 제 키(예전 147cm → 이제 약 159cm)", () => {
    const [mom, , dad] = faceLayout([
      { cm: 163, headRatio: 4.56, face: faceSize("mom") },
      { cm: 110, headRatio: 4.2, face: faceSize("child", 5) },
      { cm: 175, headRatio: 5.6, face: faceSize("dad") },
    ]);
    assert.ok(near(mom.split!.head / dad.split!.head, 0.94), String(mom.split!.head / dad.split!.head));
    // 몸 칸이 끝(1.3)에 닿아 키가 조금 양보한다 — give(5%) 안
    assert.equal(mom.split!.stretch, FACE_FIT.bodyMax);
    assert.ok(mom.height < 163 && mom.height >= 163 * (1 - FACE_FIT.give), String(mom.height));
    assert.ok(mom.height > 158.5, String(mom.height));
    consistent(mom, 4.56);
  });

  it("몸 칸 배율은 범위 안 — 머리가 아주 크면 키가 give 끝까지 양보하고, 그래도 모자라면 그때만 얼굴이 표보다 크다", () => {
    // 아빠를 1:3.5 로 그렸다(혼자 — 이웃 없음, 키 양보는 give 5%)
    const big = fitFace({ cm: 175, headRatio: 3.5, face: 1 }, { down: FACE_FIT.give, up: FACE_FIT.give });
    assert.equal(big.split!.stretch, FACE_FIT.bodyMax);
    assert.ok(near(big.height, 175 * (1 - FACE_FIT.give)));
    assert.ok(big.split!.head > FACE_UNIT_CM, "얼굴이 표보다 크다(찌그러뜨리는 대신)");
    consistent(big, 3.5);
    // 머리를 아주 작게(1:8) 그렸다 — 몸을 0.85 까지만 줄이고 키가 5% 커진 뒤 얼굴이 표보다 작다
    const small = fitFace({ cm: 175, headRatio: 8, face: 1 }, { down: FACE_FIT.give, up: FACE_FIT.give });
    assert.equal(small.split!.stretch, FACE_FIT.bodyMin);
    assert.ok(near(small.height, 175 * (1 + FACE_FIT.give)));
    assert.ok(small.split!.head < FACE_UNIT_CM);
    consistent(small, 8);
    // 양보 한도가 없으면(기본값) 키는 한 치도 안 바뀐다
    assert.equal(fitFace({ cm: 175, headRatio: 3.5, face: 1 }).height, 175);
  });

  it("범위 끝에 닿아도 give 안이면 얼굴은 표 그대로 — 키만 조금 양보", () => {
    // 엄마 4.5: 1.3 에서 키가 약 4% 줄면 된다(give 5% 안)
    const mom = fitFace({ cm: 163, headRatio: 4.5, face: 0.94 }, { down: 0.05, up: 0.05 });
    assert.equal(mom.split!.stretch, FACE_FIT.bodyMax);
    assert.ok(mom.height < 163 && mom.height > 163 * 0.95);
    assert.ok(near(mom.split!.head, 0.94 * FACE_UNIT_CM));
  });

  it("얼굴은 늘 고른 배율 — 머리 칸·발 칸은 scale, 몸 칸만 stretch(가로는 셋 다 scale)", () => {
    for (const r of [3, 4, 4.56, 5.6, 7, 9]) {
      for (const [cm, face] of [[175, 1], [163, 0.94], [110, 0.8], [133, 0.85]] as const) {
        const p = fitFace({ cm, headRatio: r, face }, { down: 0.05, up: 0.05 });
        if (!p.split) continue;
        consistent(p, r);
        assert.ok(p.split.stretch >= FACE_FIT.bodyMin - 1e-12 && p.split.stretch <= FACE_FIT.bodyMax + 1e-12);
        assert.ok(p.height >= cm * 0.95 - 1e-9 && p.height <= cm * 1.05 + 1e-9);
      }
    }
  });

  it("흰 바탕 그림(opaque)은 위·아래 여백을 빼고 머리·키를 잰다 — 머리·사람 키·몸 칸 배율이 투명 그림과 같다", () => {
    const clear = fitFace({ cm: 175, headRatio: 5.6, face: 1 });
    const opaque = fitFace({ cm: 175, headRatio: 5.6, face: 1, pad: OPAQUE_PAD });
    assert.ok(near(opaque.split!.head, clear.split!.head), "보이는 머리는 같다");
    assert.ok(near(opaque.split!.cut, OPAQUE_PAD + ((1 - 2 * OPAQUE_PAD) / 5.6) * (1 + FACE_FIT.neckGap)));
    assert.ok(near(opaque.split!.foot, 1 - OPAQUE_PAD - (1 - 2 * OPAQUE_PAD) * FACE_FIT.feetShare));
    // 여백 몫만큼 몸이 눌리지 않는다(예전 셈은 그림 전체를 175 에 맞춰 몸 칸이 약 0.9 로 눌렸다)
    assert.ok(near(opaque.split!.stretch, 1, 1e-9), String(opaque.split!.stretch));
    assert.ok(near(opaque.figure!, 175, 1e-9), "사람이 실제 키로 선다");
    assert.ok(opaque.height > 175, "그림은 여백만큼 더 크다 — 부르는 쪽은 figure 로 무대를 맞춘다");
    consistent(opaque, 5.6, OPAQUE_PAD);
    // 몸 칸이 끝에 닿아 키가 양보해도 사람 키(여백 뺀)가 양보 한도 안이다
    const mom = fitFace({ cm: 163, headRatio: 4.3, face: 0.94, pad: OPAQUE_PAD }, { down: 0.05, up: 0.05 });
    assert.equal(mom.split!.stretch, FACE_FIT.bodyMax);
    assert.ok(mom.figure! >= 163 * 0.95 - 1e-9 && mom.figure! < 163, String(mom.figure));
    consistent(mom, 4.3, OPAQUE_PAD);
  });

  it("올림머리·똥머리·모자가 잰 머리 위로 머리 높이의 0.4 만큼 솟아도 턱은 머리 칸 안 — 얼굴이 늘어나지 않는다", () => {
    // 잰 비율 r 은 머리카락 맨 위부터(솟은 것은 뺀다), 잘린 그림은 솟은 것까지 — 그림 높이 = (r + e) 머리, 턱 = (1 + e) 머리
    for (const r of [3.5, 4.2, 4.56, 5.6, 7]) {
      for (const e of [0, 0.2, 0.4]) {
        const p = fitFace({ cm: 163, headRatio: r, face: 0.94 }, { down: 0.05, up: 0.05 });
        const chin = (1 + e) / (r + e);
        assert.ok(p.split!.cut >= chin, `r ${r} · 솟음 ${e}: 머리 칸 끝 ${p.split!.cut.toFixed(3)} ≥ 턱 ${chin.toFixed(3)}`);
      }
    }
  });

  it("굽기 때 늘인 그림(bodyStretch)은 덜 늘인다 — 두 배율의 곱이 totalMax(1.45)를 넘지 않는다", () => {
    const give = { down: 0.05, up: 0.05 };
    // 셀카 엄마를 3.94 로 그려 굽기 상한(1.35)까지 늘여 4.8 이 됐다 — 예전 셈이면 여기서 또 약 1.23(합 1.66, 튜닉)
    const baked = fitFace({ cm: 163, headRatio: 4.8, face: 0.94, baked: 1.35 }, give);
    assert.ok(1.35 * baked.split!.stretch <= FACE_FIT.totalMax + 1e-9, String(baked.split!.stretch));
    assert.ok(baked.split!.stretch >= 1, "늘인 그림을 다시 줄이지는 않는다");
    // 그 대신 키가 give 끝까지 양보하고, 얼굴은 표보다 조금(약 5%) 크다 — 찌그러지거나 길쭉한 것보다 낫다
    assert.ok(near(baked.height, 163 * 0.95, 1e-9), String(baked.height));
    const over = baked.split!.head / (0.94 * FACE_UNIT_CM);
    assert.ok(over > 1 && over < 1.06, String(over));
    consistent(baked, 4.8);
    // 늘인 표시가 없는 같은 비율(예전 그림)은 bodyMax 까지 — 얼굴은 표 그대로
    const plain = fitFace({ cm: 163, headRatio: 4.8, face: 0.94 }, give);
    assert.ok(plain.split!.stretch > 1.2, String(plain.split!.stretch));
    assert.ok(near(plain.split!.head, 0.94 * FACE_UNIT_CM));
    // 굽기에서 목표(5.6)에 닿은 그림은 여기서 거의 안 늘인다 — 한도에 걸리지 않는다
    const done = fitFace({ cm: 163, headRatio: 5.6, face: 0.94, baked: 1.2 }, give);
    assert.equal(done.height, 163);
    assert.ok(near(done.split!.head, 0.94 * FACE_UNIT_CM));
    // 이상한 굽기 값은 없는 것으로 — 1.5 넘는 값·글자·1 아래
    for (const junk of [2, Number.NaN, 0.5] as const) {
      const p = fitFace({ cm: 163, headRatio: 4.8, face: 0.94, baked: junk }, give);
      assert.deepEqual(p, plain, String(junk));
    }
    // 굽기 배율이 totalMax 에 가까워도 몸 칸 한도는 1 아래로 내려가지 않는다(머리가 작게 그려진 그림은 bodyMin 까지 줄일 수 있다)
    const tall = fitFace({ cm: 163, headRatio: 4.3, face: 0.94, baked: BODY_STRETCH_MAX }, give);
    assert.equal(tall.split!.stretch, 1);
  });

  it("아무리 흔들어도 키 순서는 그대로 — 이웃 키 차이의 30%는 남는다(아이가 부모만큼 커 보이지 않게)", () => {
    // 작은 사람은 머리를 아주 작게(커지려 함), 큰 사람은 머리를 아주 크게(작아지려 함) 그렸다고 해 본다
    const slots: FaceSlot[] = [
      { cm: 96, headRatio: 9, face: 0.8 },
      { cm: 116, headRatio: 9, face: 0.8 },
      { cm: 133, headRatio: 9, face: 0.85 },
      { cm: 154, headRatio: 2.2, face: 0.94 },
      { cm: 163, headRatio: 2.2, face: 0.94 },
      { cm: 166, headRatio: 2.2, face: 1 },
      { cm: 175, headRatio: 2.2, face: 1 },
    ];
    const out = faceLayout(slots).map((p) => p.height);
    for (let i = 1; i < out.length; i++) {
      const gap = slots[i].cm - slots[i - 1].cm;
      assert.ok(out[i] - out[i - 1] >= gap * 0.3 - 1e-9, `${slots[i - 1].cm} → ${slots[i].cm}: ${out[i - 1]} / ${out[i]}`);
    }
    assert.ok(out[1] < out[4] && out[1] < out[6]);
    out.forEach((h, i) => assert.ok(Math.abs(h / slots[i].cm - 1) <= FACE_FIT.give + 1e-9));
  });

  it("heightGive — give 와 이웃 차이의 35% 가운데 작은 쪽, 같은 키끼리는 ±3%", () => {
    // 엄마 163 — 아래 아이 110(차이 53 → 11.4%)·위 아빠 175(차이 12 → 2.6%)
    const g = heightGive([163, 110, 175], 0);
    assert.equal(g.down, FACE_FIT.give);
    assert.ok(near(g.up, (GROUP_GAP_SHARE * 12) / 163));
    // 엄마·아빠가 같은 175 → ±3%
    assert.deepEqual(heightGive([175, 110, 175], 0), { down: GROUP_SAME_CM_CAP, up: GROUP_SAME_CM_CAP });
    // 혼자면 give
    assert.deepEqual(heightGive([175], 0), { down: FACE_FIT.give, up: FACE_FIT.give });
  });

  it("키가 같은 두 사람(엄마·아빠 175)이 머리를 반대로 그렸어도 6% 넘게 달라 보이지 않는다", () => {
    const [mom, , dad] = faceLayout([
      { cm: 175, headRatio: 9, face: 0.94 },
      { cm: 110, face: 0.8 },
      { cm: 175, headRatio: 2.5, face: 1 },
    ]);
    assert.ok(mom.height / dad.height <= 1.07, `${mom.height} / ${dad.height}`);
  });
});
