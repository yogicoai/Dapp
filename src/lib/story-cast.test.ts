import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  NARRATION,
  planPageVoices,
  unassignedDialogue,
  unmatchedLines,
} from "./story-cast.ts";

const cast = [{ name: "토끼" }, { name: "거북이" }];
const roleOf = { 토끼: "rabbit", 거북이: "tortoise", 부엉이: "owl" };

describe("planPageVoices", () => {
  it("지문과 대사를 갈라 배역을 붙인다", () => {
    const plan = planPageVoices({
      text: '옛날 옛날, 발 빠른 토끼가 살았어요. "이 숲에서 나보다 빠른 동물은 아무도 없지!" 토끼는 자랑을 늘어놓았지요.',
      cast,
      roleOf,
    });
    assert.equal(plan.length, 3);
    assert.equal(plan[0].who, NARRATION);
    assert.equal(plan[1].who, "rabbit");
    assert.equal(plan[2].who, NARRATION);
  });

  it("이어 붙이면 원문과 한 글자도 다르지 않다 — 색칠이 글자 수로 돌기 때문", () => {
    const text = '거북이는 걸었어요. "괜찮아. 나는 내 걸음으로 가면 돼." 앞만 보았답니다.';
    const plan = planPageVoices({ text, cast, roleOf });
    assert.equal(plan.map((s) => s.text).join(""), text);
  });

  it("대사집이 자동 판정을 이긴다 — 실제로 틀렸던 8쪽", () => {
    // 바로 앞 지문의 주어가 '거북이'라 자동으로는 거북이 대사가 된다.
    // 그런데 하품하며 낮잠 자겠다는 건 토끼다.
    const text =
      '한참을 달린 토끼가 뒤를 돌아보았어요. 거북이는 점처럼 조그맣게 보였지요. "하암~ 저 느림보가 오려면 아직 멀었네. 낮잠이나 한숨 자야겠다."';
    const auto = planPageVoices({ text, cast, roleOf });
    assert.equal(auto[1].who, "tortoise", "자동 판정은 거북이로 틀린다");

    const fixed = planPageVoices({
      text,
      cast,
      roleOf,
      lines: [{ text: "하암~ 저 느림보가 오려면 아직 멀었네. 낮잠이나 한숨 자야겠다.", who: "rabbit" }],
    });
    assert.equal(fixed[1].who, "rabbit");
  });

  it("따옴표·공백이 달라도 대사집이 붙는다", () => {
    const plan = planPageVoices({
      text: '부엉이가 외쳤어요. "거북이 승리!"',
      cast,
      roleOf,
      lines: [{ text: "거북이  승리!", who: "owl" }],
    });
    assert.equal(plan[1].who, "owl");
  });

  it("아무도 못 찾은 대사는 나레이션으로 남고, 골라낼 수 있다", () => {
    const plan = planPageVoices({ text: '"거북아, 잘난 척해서 미안해."', cast, roleOf });
    const left = unassignedDialogue(plan);
    assert.equal(left.length, 1);
    assert.equal(left[0].text.includes("미안해"), true);
  });

  it("배역 이름 대응표가 없으면 등장인물 이름을 그대로 쓴다", () => {
    const plan = planPageVoices({
      text: '토끼가 말했어요. "우리 저 언덕까지 달려가 볼까?"',
      cast,
    });
    assert.equal(plan[1].who, "토끼");
  });

  it("대사집에 없는 아주 짧은 말은 지문에 남긴다 — 통짜로 읽을 땐 그게 자연스럽다", () => {
    const plan = planPageVoices({ text: '토끼가 소리쳤어요. "안 돼!"', cast, roleOf });
    assert.equal(plan.length, 1);
    assert.equal(plan[0].who, NARRATION);
  });

  it("대사집에 적으면 아주 짧은 말도 배역 목소리로 떼어낸다 — 13쪽 \"안 돼!\"", () => {
    const plan = planPageVoices({
      text: '"안 돼!" 토끼는 있는 힘껏 달렸지만 이미 늦었어요.',
      cast,
      roleOf,
      lines: [{ text: "안 돼!", who: "rabbit" }],
    });
    assert.equal(plan[0].who, "rabbit");
    assert.equal(plan[1].who, NARRATION);
    assert.equal(plan.map((s) => s.text).join(""), '"안 돼!" 토끼는 있는 힘껏 달렸지만 이미 늦었어요.');
  });

  it("연달아 붙은 대사도 대사집에 각각 적혀 있으면 갈라낸다 — 해님 달님 12쪽", () => {
    const text = '그때 동생이 그만 말해 버렸지요.\n"바보 호랑이! 도끼로 찍으면서 올라와야지!"\n"앗, 안 돼!"';
    const plan = planPageVoices({
      text,
      cast: [{ name: "동생" }, { name: "오빠" }],
      roleOf: { 동생: "sister", 오빠: "brother" },
      lines: [
        { text: "바보 호랑이! 도끼로 찍으면서 올라와야지!", who: "sister" },
        { text: "앗, 안 돼!", who: "brother" },
      ],
    });
    assert.deepEqual(plan.map((s) => s.who), [NARRATION, "sister", "brother"]);
    assert.equal(plan.map((s) => s.text).join(""), text);
  });

  it("같은 말을 다른 배역이 잇달아 하면 대사집 순서대로 준다 — 브레멘 15쪽 \"좋아!\" \"좋아!\"", () => {
    const text = '"얘들아, 우리 여기서 사는 건 어떨 것 같아?"\n"좋아!" "좋아!" 다들 끄덕였어요.';
    const plan = planPageVoices({
      text,
      cast: [{ name: "당나귀" }, { name: "개" }, { name: "고양이" }],
      roleOf: { 당나귀: "donkey", 개: "dog", 고양이: "cat" },
      lines: [
        { text: "얘들아, 우리 여기서 사는 건 어떨 것 같아?", who: "donkey" },
        { text: "좋아!", who: "dog" },
        { text: "좋아!", who: "cat" },
      ],
    });
    assert.deepEqual(plan.map((s) => s.who), ["donkey", "dog", "cat", NARRATION]);
    assert.equal(plan.map((s) => s.text).join(""), text);
  });

  it("덩어리 안에서 대사집에 없는 대사는 자동 판정 배역에 남는다", () => {
    const plan = planPageVoices({
      text: '토끼가 소리쳤어요.\n"거북아, 빨리 와!"\n"금방 갈게!"',
      cast,
      roleOf,
      lines: [{ text: "금방 갈게!", who: "turtle" }],
    });
    assert.deepEqual(plan.map((s) => s.who), [NARRATION, "rabbit", "turtle"]);
  });
});

describe("unmatchedLines", () => {
  it("본문에 없는 대사집 줄을 찾아낸다 — 본문을 고치면 조용히 어긋난다", () => {
    const text = '토끼가 웃었어요. "느림보야!"';
    assert.deepEqual(unmatchedLines(text, [{ text: "느림보야!", who: "rabbit" }]), []);
    const stale = unmatchedLines(text, [{ text: "예전에 쓰던 대사", who: "rabbit" }]);
    assert.equal(stale.length, 1);
  });
});
