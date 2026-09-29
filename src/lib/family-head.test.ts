import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GROUP_GAP_SHARE,
  GROUP_HEAD_CAP,
  GROUP_SAME_CM_CAP,
  cleanHeadRatio,
  closerHead,
  groupHeights,
  headChartRatio,
  headRatioFromBoxes,
  headVerdict,
  ratioText,
  readBox,
} from "./family-head.ts";

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

describe("groupHeights — 단체 사진 크기 고르기(잰 머리 비율로 반만, ±10%, 키 순서는 그대로)", () => {
  const kid = (cm: number, headRatio?: number) => ({ cm, headRatio, target: 4 });
  const adult = (cm: number, headRatio?: number) => ({ cm, headRatio, target: 5.5 });

  it("잰 비율이 없으면 실제 키 그대로(오늘과 같다)", () => {
    assert.deepEqual(groupHeights([adult(163), kid(116), adult(175)]), [163, 116, 175]);
  });

  it("표대로 그려졌으면 그대로", () => {
    assert.deepEqual(groupHeights([adult(163, 5.5), kid(116, 4), adult(175, 5.5)]), [163, 116, 175]);
  });

  it("k = 1 + 0.5 × (잰 비율 ÷ 표 − 1) — 둘레 키와 멀면 섞은 값 그대로", () => {
    // 할아버지 혼자(둘레가 멀다): 5.0 ÷ 5.5 → 1 + 0.5 × (−0.0909) = 0.9545
    const [gp, child] = groupHeights([adult(166, 5), kid(110)]);
    assert.ok(Math.abs(gp - 166 * (1 + 0.5 * (5 / 5.5 - 1))) < 1e-9, String(gp));
    assert.equal(child, 110);
  });

  it("±10% 로 묶는다", () => {
    // 아이 혼자 1:2.5 로 그려짐(표 4) → 섞은 값 0.8125 → 0.9 까지만
    assert.deepEqual(groupHeights([kid(116, 2.5)]), [116 * (1 - GROUP_HEAD_CAP)]);
    // 1:9 로 그려진 어른(머리가 아주 작다) → 섞은 값 1.318 → 1.1 까지만
    assert.deepEqual(groupHeights([adult(175, 9)]), [175 * (1 + GROUP_HEAD_CAP)]);
  });

  it("사장님 사례 — 아빠만 1:4.2(표 1:5.5): 엄마(163)보다 작아 보이지 않게 차이의 35%까지만 준다", () => {
    const [mom, child, dad] = groupHeights([adult(163, 5.5), kid(116, 4), adult(175, 4.2)]);
    assert.equal(mom, 163);
    assert.equal(child, 116);
    const floor = 175 - GROUP_GAP_SHARE * (175 - 163);
    assert.ok(Math.abs(dad - floor) < 1e-9, `아빠 ${dad} = ${floor}`);
    assert.ok(dad < 175 && dad > mom);
  });

  it("아무리 흔들어도 키 순서는 그대로 — 서로 다가가도 차이의 30%는 남는다", () => {
    // 작은 사람은 머리를 아주 작게(커지려 함), 큰 사람은 머리를 아주 크게(작아지려 함) 그렸다고 해 본다
    const people = [
      kid(96, 9),
      kid(116, 9),
      kid(133, 9),
      adult(154, 2.2),
      adult(163, 2.2),
      adult(166, 2.2),
      adult(175, 2.2),
    ];
    const out = groupHeights(people);
    for (let i = 1; i < out.length; i++) {
      const gap = people[i].cm - people[i - 1].cm;
      assert.ok(out[i] - out[i - 1] >= gap * 0.3 - 1e-9, `${people[i - 1].cm} → ${people[i].cm}: ${out[i - 1]} / ${out[i]}`);
    }
    // 아이(116)는 부모(163·175)만큼 커 보이지 않는다
    assert.ok(out[1] < out[4] && out[1] < out[6]);
    // 누구도 ±10% 를 넘지 않는다
    out.forEach((h, i) => assert.ok(Math.abs(h / people[i].cm - 1) <= GROUP_HEAD_CAP + 1e-9));
  });

  it("키가 같은 사람끼리는 ±3%까지만(같은 나이 아이 둘) — 반대로 움직여도 약 6% 안", () => {
    const [a, b, mom] = groupHeights([kid(116, 3.2), kid(116, 4.8), adult(163)]);
    assert.ok(a < 116 && b > 116);
    assert.ok(Math.abs(a - 116 * (1 - GROUP_SAME_CM_CAP)) < 1e-9, String(a));
    assert.ok(Math.abs(b - 116 * (1 + GROUP_SAME_CM_CAP)) < 1e-9, String(b));
    assert.ok(b / a <= 1.07);
    assert.ok(b < mom);
  });

  it("엄마·아빠가 같은 175cm — 머리를 반대로 그렸어도 20% 달라 보이지 않는다", () => {
    // 엄마 '아주 큰 편' 175 · 아빠 '보통' 175. 엄마는 머리를 작게(6.4), 아빠는 크게(4.2) — 묶지 않으면 189 · 158
    const [mom, child, dad] = groupHeights([adult(175, 6.4), kid(116, 4), adult(175, 4.2)]);
    assert.ok(Math.abs(mom - 175 * 1.03) < 1e-9 && Math.abs(dad - 175 * 0.97) < 1e-9, `${mom} / ${dad}`);
    assert.ok(mom / dad <= 1.07);
    assert.equal(child, 116);
    // 아빠만 잰 경우도 3%까지만
    const [, , onlyDad] = groupHeights([adult(175), kid(116), adult(175, 4.2)]);
    assert.ok(Math.abs(onlyDad - 175 * 0.97) < 1e-9, String(onlyDad));
  });

  it("이상한 값(키 0·표 0)은 건드리지 않는다", () => {
    assert.deepEqual(groupHeights([{ cm: 0, headRatio: 4, target: 5.5 }, { cm: 160, headRatio: 4, target: 0 }]), [0, 160]);
  });
});
