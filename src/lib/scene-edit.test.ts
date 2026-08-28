import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { pickLocationDetail, rewriteScene, suggestLocationDetail } from "./scene-edit.ts";

describe("pickLocationDetail — 이 쪽 장소에 해당하는 부분만", () => {
  const detail = "계곡은 회색 자갈 바닥에 넓적한 바위 하나 · 거실은 밝은 나무 마루와 파란 소파 · 아이스크림은 분홍색 한 덩이";

  it("계곡 쪽에는 계곡과 물건만 남는다", () => {
    const out = pickLocationDetail(detail, "계곡");
    assert.ok(out.includes("계곡은"), out);
    assert.ok(out.includes("아이스크림은"), out);
    assert.ok(!out.includes("거실"), out);
  });

  it("거실 쪽에는 거실만 — 이름이 조금 달라도 같은 계열이면 잡는다", () => {
    const out = pickLocationDetail(detail, "우리 집 거실");
    assert.ok(out.includes("거실은"), out);
    assert.ok(!out.includes("계곡"), out);
  });

  it("나뉘지 않은 자유 문장은 그대로 준다", () => {
    const free = "우리 동네 놀이터는 파란 미끄럼틀이 있고 바닥이 고무예요";
    assert.equal(pickLocationDetail(free, "거실"), free);
  });

  it("목록에 없는 이름은 물건일 수 있으니 남긴다", () => {
    const out = pickLocationDetail("캠핑장은 초록 텐트 · 손전등은 노란색", "거실");
    assert.ok(out.includes("손전등"), out);
  });
});

describe("suggestLocationDetail", () => {
  const prompts = [
    "등장인물 2명: 하온, 엄마. 장소: 골목 — 회색 시멘트 담과 물웅덩이. 물건: 장화 — 샛노란색, 무릎까지 오는 길이. 하온이가 밟는다.",
    "등장인물 1명: 하온. 장소: 골목 — 회색 시멘트 담과 물웅덩이. 물건: 장화 — 샛노란색, 무릎까지 오는 길이. 하온이가 웃는다.",
  ];

  it("대본에서 장소와 물건을 뽑아 한 줄로 만든다", () => {
    const out = suggestLocationDetail(prompts);
    assert.ok(out.includes("골목은 회색 시멘트 담과 물웅덩이"));
    assert.ok(out.includes("장화는 샛노란색"));
  });

  it("같은 장소가 여러 쪽에 나와도 한 번만 담는다", () => {
    const out = suggestLocationDetail(prompts);
    assert.equal(out.split("골목").length - 1, 1);
  });

  it("받침에 따라 은/는을 가른다", () => {
    // '골목'은 받침이 있어 '은', '장화'는 없어 '는'. 틀리면 부모가 읽을 때 걸린다.
    const out = suggestLocationDetail(prompts);
    assert.ok(out.includes("골목은"));
    assert.ok(out.includes("장화는"));
  });

  it("칸 길이를 넘기지 않고, 말 중간에서 자르지 않는다", () => {
    const long = `장소: 계곡 — ${"아주 넓고 깊은 회색 자갈 바닥".repeat(6)}. 하온이가 앉는다.`;
    const out = suggestLocationDetail([long], 120);
    assert.ok(out.length <= 120);
  });

  it("장소 줄이 없으면 빈 값 — 아무 말이나 채우지 않는다", () => {
    assert.equal(suggestLocationDetail(["등장인물 1명: 하온. 하온이가 걷는다."]), "");
    assert.equal(suggestLocationDetail([]), "");
  });
});

describe("rewriteScene", () => {
  const scene =
    "등장인물 2명: 하온, 할머니. 장소: 계곡 — 회색 자갈 바닥, 넓적한 바위 하나. " +
    "물건: 아이스크림 — 분홍색 동그란 덩어리 하나, 갈색 콘 위에. " +
    "하온이가 바위에 앉아 사과를 먹는다.";

  it("고친 본문이 그림에 실제로 반영된다 — 사과를 배로 바꾸면 사과가 사라진다", () => {
    const next = rewriteScene(scene, "하온이는 바위에 앉아 배를 아삭 베어 물었어요.");
    assert.ok(next.includes("배를 아삭"), "고친 본문이 들어가야 한다");
    assert.ok(!next.includes("사과"), "옛 행동이 남으면 그림에 사과가 그대로 그려진다");
  });

  it("인물·장소·물건 잠금은 그대로 남는다", () => {
    const next = rewriteScene(scene, "하온이는 바위에 앉아 배를 먹었어요.");
    assert.ok(next.includes("등장인물 2명: 하온, 할머니."), "인물이 풀리면 같은 아이가 둘 그려진다");
    assert.ok(next.includes("장소: 계곡 — 회색 자갈 바닥, 넓적한 바위 하나."));
    assert.ok(next.includes("물건: 아이스크림 — 분홍색 동그란 덩어리 하나, 갈색 콘 위에."));
  });

  it("물건이 둘이면 둘 다 남는다", () => {
    const two =
      "등장인물 1명: 민이. 물건: 곰인형 — 노란 갈색. 물건: 우산 — 빨간색 하나. 민이가 걷는다.";
    const next = rewriteScene(two, "민이는 우산을 펴고 곰인형을 안았어요.");
    assert.ok(next.includes("물건: 곰인형 — 노란 갈색."));
    assert.ok(next.includes("물건: 우산 — 빨간색 하나."));
  });

  it("문장에서 빠진 인물은 그림에서도 빠진다", () => {
    // 할머니를 지운 문장인데 지시에 '등장인물 2명: 하온, 할머니.'가 남으면
    // 없어진 할머니가 그림에는 그대로 그려진다.
    const next = rewriteScene(scene, "하온이는 혼자 바위에 앉아 있었어요.", ["하온", "할머니"]);
    assert.ok(next.includes("등장인물 1명: 하온."));
    assert.ok(!next.includes("할머니"));
  });

  it("인물을 더하면 그 인물도 그려진다", () => {
    const next = rewriteScene(scene, "하온이와 할머니가 나란히 앉았어요.", ["하온", "할머니"]);
    assert.ok(next.includes("등장인물 2명: 하온, 할머니."));
  });

  it("이름 없이 대명사만 쓴 문장은 원래 인물 줄을 지킨다", () => {
    // 여기서 0명으로 만들면 아무도 없는 그림이 나온다.
    const next = rewriteScene(scene, "둘은 마주 보고 활짝 웃었어요.", ["하온", "할머니"]);
    assert.ok(next.includes("등장인물 2명: 하온, 할머니."));
  });

  it("잠금 줄이 없으면 고친 본문만 쓴다 — 옛 책도 막히지 않는다", () => {
    const next = rewriteScene("아이가 공원에서 뛰논다.", "민이는 그네를 힘껏 굴렀어요.");
    assert.equal(next, "민이는 그네를 힘껏 굴렀어요.");
  });

  it("빈 글로는 바꾸지 않는다 — 그림 지시를 통째로 잃으면 그 쪽을 못 그린다", () => {
    assert.equal(rewriteScene(scene, "   "), scene);
  });

  it("장면 길이가 서버 상한(700자) 안에 들어온다", () => {
    // 본문 입력칸은 400자로 막혀 있다. 잠금 줄까지 더해도 넘지 않아야
    // 그 쪽만 400 오류로 그림 없이 남는 일이 없다.
    const longText = "가".repeat(400);
    assert.ok(rewriteScene(scene, longText).length <= 700);
  });
});
