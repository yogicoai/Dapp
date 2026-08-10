import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { reviewProse, splitSentences } from "./prose-quality.ts";

const page = (text: string) => ({ text });

describe("splitSentences", () => {
  it("따옴표 안의 마침표에 걸려 대사를 쪼개지 않는다", () => {
    const out = splitSentences('하온이가 말했어요. "안녕. 나는 하온이야." 참새가 고개를 돌렸어요.');
    assert.equal(out.length, 3);
    assert.equal(out[1], '"안녕. 나는 하온이야."');
  });
});

describe("reviewProse", () => {
  it("같은 말로 세 번 시작하면 잡는다", () => {
    const report = reviewProse({
      pages: [page("하온이는 걸었어요. 하온이는 보았어요. 하온이는 웃었어요.")],
    });
    assert.ok(report.findings.some((f) => f.kind === "same-opening"));
  });

  it("두 번 되풀이는 리듬이라 넘어간다", () => {
    const report = reviewProse({
      pages: [page("하온이는 걸었어요. 하온이는 보았어요. 참새가 날아올랐어요.")],
    });
    assert.ok(!report.findings.some((f) => f.kind === "same-opening"));
  });

  it("소리말 되풀이는 흠이 아니다 — '쿵! 쿵! 쿵!'은 일부러 만든 리듬이다", () => {
    // 딸린 「혹부리 영감」에서 실제로 잘못 걸렸던 자리다.
    const report = reviewProse({
      pages: [page("쿵! 도깨비가 왔어요. 쿵! 땅이 흔들렸어요. 쿵! 문이 열렸어요.")],
    });
    assert.ok(!report.findings.some((f) => f.kind === "same-opening"));
  });

  it("마음을 설명만 하면 잡는다", () => {
    const report = reviewProse({
      pages: [
        page(
          "하온이는 무섭다고 생각했어요. 도망가고 싶다는 생각이 들었어요. " +
            "다리가 떨렸기 때문이에요. 참새가 날아갔어요.",
        ),
      ],
    });
    assert.ok(report.findings.some((f) => f.kind === "telling"));
  });

  it("짧은 문장이 하나도 없으면 잡는다", () => {
    // 리듬 검사는 문장이 여섯 개 이상일 때만 돈다 — 짧은 책을 함부로 흠잡지 않으려고.
    const long = "하온이는 노란 손수건을 곱게 접어서 주머니 안에 조심스럽게 넣었어요.";
    const three = [long, long, long].join(" ");
    const report = reviewProse({ pages: [page(three), page(three), page(three)] });
    assert.ok(report.findings.some((f) => f.kind === "flat-rhythm"));
  });

  it("짧은 문장이 섞여 있으면 넘어간다", () => {
    const report = reviewProse({
      pages: [
        page("하온이는 노란 손수건을 곱게 접어 주머니에 넣었어요. 참새가 날았어요."),
        page("바람이 불었어요. 하온이는 하늘을 오래오래 올려다보았어요."),
        page('"잘 가." 하온이가 손을 흔들었어요. 해가 졌어요.'),
      ],
    });
    assert.ok(!report.findings.some((f) => f.kind === "flat-rhythm"));
  });

  it("닳은 말을 한 권에 세 번 이상 쓰면 잡는다", () => {
    const report = reviewProse({
      pages: [page("반짝반짝 빛났어요."), page("반짝반짝 웃었어요."), page("반짝반짝 흔들렸어요.")],
    });
    assert.ok(report.findings.some((f) => f.kind === "overused-word"));
  });

  it("대사가 한 줄도 없으면 잡는다", () => {
    const report = reviewProse({
      pages: [page("하온이가 걸었어요."), page("참새가 날았어요."), page("해가 졌어요.")],
    });
    assert.ok(report.findings.some((f) => f.kind === "no-dialogue"));
  });

  it("일본어 따옴표도 대사로 읽는다", () => {
    // 딸린 일본어 그림책이 '대사 없음'으로 잘못 걸렸던 자리다.
    const report = reviewProse({
      pages: [page("トリが とんだ。"), page("「たのしいね。」"), page("そらが あおい。")],
    });
    assert.ok(!report.findings.some((f) => f.kind === "no-dialogue"));
  });

  it("상투적인 마무리를 잡는다", () => {
    const report = reviewProse({
      pages: [page('"잘 자." 엄마가 말했어요.'), page("그날 밤 하온이는 행복한 꿈을 꾸었어요.")],
    });
    assert.ok(report.findings.some((f) => f.kind === "cliche-ending"));
  });

  it("아무것도 안 걸리면 만점", () => {
    const report = reviewProse({
      pages: [
        page('놀이터에 참새가 앉아 있었어요. "너 다쳤구나." 하온이가 말했어요.'),
        page("하온이는 손수건을 꺼냈어요. 참새가 떨었어요. 바람이 찼어요."),
        page('할머니가 상자를 만들어 주셨어요. "조용히 두면 낫는단다."'),
      ],
    });
    assert.equal(report.score, 100);
    assert.equal(report.findings.length, 0);
  });

  it("한 가지 버릇으로 점수가 바닥나지 않는다", () => {
    // 같은 종류가 열 번 걸려도 두 번까지만 깎는다 — 안 그러면 나머지가 안 보인다.
    const pages = Array.from({ length: 10 }, () =>
      page("하온이는 걸었어요. 하온이는 보았어요. 하온이는 웃었어요."),
    );
    const report = reviewProse({ pages });
    assert.ok(report.score >= 70, `점수가 너무 깎였다: ${report.score}`);
  });
});
