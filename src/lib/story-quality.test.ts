import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isBlockingStoryQualityIssue,
  isIndoorPlace,
  locationKeyOf,
  repairStoryContinuity,
  validateStoryQuality,
} from "./story-quality.ts";
import type { ParsedStory } from "./story-format.ts";

const direction = { narration: "normal", dialogue: "happy", intensity: 0.8, pace: "normal" } as const;

function story(texts: string[]): ParsedStory {
  return {
    title: "민이의 별빛 산책",
    summary: "민이가 친구와 별빛을 만나요.",
    characters: [{ name: "민이", description: "노란 모자를 쓴 아이" }],
    pages: texts.map((text, index) => ({ pageNo: index + 1, text, imagePrompt: "등장인물 1명: 민이. 장소: 별빛 숲길 — 푸른 나무와 둥근 돌길. 민이가 별빛 길을 걷는다.", voiceDirection: direction })),
  };
}

describe("validateStoryQuality", () => {
  it("정상적인 아동용 페이지는 통과한다", () => {
    const result = validateStoryQuality(story([
      "민이는 친구와 별빛 길을 천천히 걸었어요. 작은 별 하나가 두 사람 앞에서 반짝였어요.",
      "두 친구는 길을 잃은 별을 하늘로 돌려보냈어요. 그리고 환하게 웃으며 집으로 돌아왔어요.",
    ]), { childName: "민이", age: 6, expectedPages: 2 });
    assert.deepEqual(result, []);
  });

  it("중복 페이지와 누락된 이름을 함께 잡는다", () => {
    const duplicate = "친구는 숲길에서 작은 별을 발견했어요. 별은 집으로 돌아가고 싶다고 말했어요.";
    const result = validateStoryQuality(story([duplicate, duplicate]), { childName: "수아", age: 6, expectedPages: 2 });
    assert.ok(result.some((item) => item.includes("주인공 이름")));
    assert.ok(result.some((item) => item.includes("중복")));
  });

  it("본문의 친구가 삽화 설명에서 빠지면 실패한다", () => {
    const value = story(["민이는 태이와 블록을 만들며 환하게 웃었어요. 두 친구는 정말 즐거웠어요."]);
    value.characters.push({ name: "태이", description: "초록색 옷을 입은 친구" });
    const result = validateStoryQuality(value, { childName: "민이", age: 6, expectedPages: 1 });
    assert.ok(result.some((item) => item.includes("누락된 본문 인물: '태이'")));
  });

  it("같은 장소의 고정 특징이 페이지마다 바뀌면 실패한다", () => {
    const value = story([
      "민이는 놀이방에서 블록을 높이 쌓았어요. 알록달록한 집이 완성됐어요.",
      "민이는 놀이방에서 완성된 집을 보며 환하게 웃었어요. 정말 뿌듯했어요.",
    ]);
    value.pages[1].imagePrompt = "등장인물 1명: 민이. 장소: 별빛 숲길 — 붉은 벽과 유리 바닥. 민이가 웃는다.";
    const result = validateStoryQuality(value, { childName: "민이", age: 6, expectedPages: 2 });
    assert.ok(result.some((item) => item.includes("고정 특징이 바뀌었습니다")));
  });

  it("이동 설명 없이 다음 페이지 장소가 바뀌면 실패한다", () => {
    const value = story([
      "민이는 놀이방에서 블록을 쌓으며 즐겁게 웃었어요. 멋진 집이 완성됐어요.",
      "민이는 미끄럼틀 옆에서 손뼉을 쳤어요. 오늘도 정말 즐거웠어요.",
    ]);
    value.pages[1].imagePrompt = "등장인물 1명: 민이. 장소: 동네 놀이터 — 노란 미끄럼틀과 둥근 모래밭. 민이가 손뼉을 친다.";
    const result = validateStoryQuality(value, { childName: "민이", age: 6, expectedPages: 2 });
    assert.ok(result.some((item) => item.includes("이동 과정이 없습니다")));
  });

  it("본문에 이동 과정이 있으면 장소 전환을 허용한다", () => {
    const value = story([
      "민이는 놀이방에서 블록을 정리했어요. 엄마와 놀이터로 가기로 했어요.",
      "놀이터에 도착한 민이는 노란 미끄럼틀 옆에서 손뼉을 치며 환하게 웃었어요.",
    ]);
    value.pages[1].imagePrompt = "등장인물 1명: 민이. 장소: 동네 놀이터 — 노란 미끄럼틀과 둥근 모래밭. 민이가 손뼉을 친다.";
    const result = validateStoryQuality(value, { childName: "민이", age: 6, expectedPages: 2 });
    assert.ok(!result.some((item) => item.includes("이동 과정이 없습니다")));
  });

  it("이동 없는 장소 변경은 이전 장소로 자동 보정한다", () => {
    const value = story([
      "민이는 놀이방에서 블록을 쌓았어요. 멋진 집이 완성되어 환하게 웃었어요.",
      "민이는 완성한 블록 집을 보며 손뼉을 쳤어요. 정말 마음에 들었어요.",
    ]);
    value.pages[1].imagePrompt = "등장인물 1명: 민이. 장소: 낯선 공원 — 큰 미끄럼틀. 민이가 손뼉을 친다.";
    const repaired = repairStoryContinuity(value);
    assert.ok(repaired.pages[1].imagePrompt.includes("장소: 놀이방 —"));
    assert.ok(!repaired.pages[1].imagePrompt.includes("낯선 공원"));
  });

  it("본문의 집과 이미지 지시의 숲이 충돌하면 생성 전에 집으로 교정한다", () => {
    const value = story([
      "오늘은 하온이가 손꼽아 기다리던 날이에요. 태이네 집에 놀러 가는 날이거든요.",
      "태이네 집에서 하온이와 태이는 장난감을 함께 보며 신나게 이야기했어요.",
    ]);
    value.pages[0].imagePrompt = "등장인물 2명: 하온이, 태이. 장소: 푸른 숲길 — 키 큰 나무와 꽃덤불. 두 아이가 이야기한다.";
    value.pages[1].imagePrompt = "등장인물 2명: 하온이, 태이. 장소: 푸른 숲길 — 키 큰 나무와 꽃덤불. 두 아이가 웃는다.";

    const repaired = repairStoryContinuity(value);

    assert.match(repaired.pages[0].imagePrompt, /장소: 태이네 집 —/);
    assert.match(repaired.pages[1].imagePrompt, /장소: 태이네 집 —/);
    // 친구 집도 요즘 집이어야 한다 — '놀러 간다' 장면에서 옛날 집이 제일 잘 튀어나온다.
    assert.match(repaired.pages[0].imagePrompt, /아파트|마루|소파/);
    assert.ok(repaired.pages.every((page) => !page.imagePrompt.includes("숲길")));
  });

  it("방법이나 상대방 같은 일반 단어를 집 장소로 오인하지 않는다", () => {
    const value = story([
      "민이는 좋은 방법을 생각하며 상대방의 이야기를 차분히 들었어요. 친구도 고개를 끄덕였어요.",
    ]);
    value.pages[0].imagePrompt = "등장인물 1명: 민이. 장소: 별빛 숲길 — 키 큰 나무와 둥근 돌길. 민이가 생각한다.";

    const repaired = repairStoryContinuity(value);

    assert.ok(repaired.pages[0].imagePrompt.includes("장소: 별빛 숲길"));
  });

  it("같은 물건은 처음 적은 한 줄로 되돌린다 — 아이스크림이 쪽마다 바뀌지 않게", () => {
    const value = story([
      "민이는 분홍 아이스크림을 받아 들고 활짝 웃었어요. 정말 신이 났어요.",
      "민이는 아이스크림을 한 입 먹고 눈을 동그랗게 떴어요. 참 달콤했어요.",
    ]);
    value.pages[0].imagePrompt =
      "등장인물 1명: 민이. 물건: 아이스크림 — 분홍색 동그란 덩어리 하나, 갈색 콘 위에. 민이가 웃는다.";
    // 모델이 말을 바꾼 경우 — 컵에 담긴 초코 두 덩이가 되어 다른 물건이 된다.
    value.pages[1].imagePrompt =
      "등장인물 1명: 민이. 물건: 아이스크림 — 초코색 두 덩이, 유리컵에 스프링클을 얹고. 민이가 먹는다.";

    const repaired = repairStoryContinuity(value);

    assert.match(repaired.pages[1].imagePrompt, /물건: 아이스크림 — 분홍색 동그란 덩어리 하나, 갈색 콘 위에/);
    assert.ok(!repaired.pages[1].imagePrompt.includes("스프링클"));
    // 물건 줄만 갈아 끼우고 그 쪽의 행동은 건드리지 않는다.
    assert.ok(repaired.pages[1].imagePrompt.includes("민이가 먹는다"));
  });

  it("물건이 둘이어도 각자 자기 첫 줄로 되돌린다", () => {
    const value = story([
      "민이는 노란 곰인형과 빨간 우산을 챙겼어요. 오늘은 비가 온대요.",
      "민이는 우산을 펴고 곰인형을 꼭 안았어요. 빗방울 소리가 즐거웠어요.",
    ]);
    value.pages[0].imagePrompt =
      "등장인물 1명: 민이. 물건: 곰인형 — 노란 갈색, 아이 팔만 한 크기. 물건: 우산 — 빨간색 동그란 우산 하나. 민이가 챙긴다.";
    value.pages[1].imagePrompt =
      "등장인물 1명: 민이. 물건: 곰인형 — 흰색 작은 토끼 모양. 물건: 우산 — 파란 줄무늬 우산. 민이가 안는다.";

    const repaired = repairStoryContinuity(value);

    assert.match(repaired.pages[1].imagePrompt, /물건: 곰인형 — 노란 갈색, 아이 팔만 한 크기/);
    assert.match(repaired.pages[1].imagePrompt, /물건: 우산 — 빨간색 동그란 우산 하나/);
  });

  it("처음 나오는 물건은 그대로 둔다 — 새 물건까지 옛 물건으로 바꾸지 않는다", () => {
    const value = story([
      "민이는 노란 곰인형을 안고 잠들었어요. 아주 포근한 밤이었어요.",
      "다음 날 민이는 빨간 풍선을 손에 쥐고 뛰어갔어요. 바람이 시원했어요.",
    ]);
    value.pages[0].imagePrompt = "등장인물 1명: 민이. 물건: 곰인형 — 노란 갈색, 아이 팔만 한 크기. 민이가 안는다.";
    value.pages[1].imagePrompt = "등장인물 1명: 민이. 물건: 풍선 — 빨간색 동그란 풍선 하나. 민이가 뛴다.";

    const repaired = repairStoryContinuity(value);

    assert.match(repaired.pages[1].imagePrompt, /물건: 풍선 — 빨간색 동그란 풍선 하나/);
  });

  it("자리를 옮긴 문장을 알아본다 — 못 알아보면 그림이 계속 앞 장소에 머문다", () => {
    // 실제로 겪었다: 「하얀 고래 책」은 집 식탁 장면에서도 도서관을 그렸고,
    // 「첫눈」은 눈사람을 만드는 쪽까지 거실이었다. 이동 표현을 못 잡아서다.
    const moved = [
      ["현관문을 열자 찬 바람이 들어왔어요.", "밖으로 나온 것"],
      ["집에 들어와 창가에 앉았어요.", "안으로 들어온 것"],
      ["저녁에 식탁에서 책을 펼쳤어요.", "때가 바뀐 것"],
      ["집에 오는 길에 비가 내렸어요.", "오는 길"],
      ["사흘이 지났어요.", "날이 지난 것"],
    ] as const;
    for (const [text, why] of moved) {
      const value = story(["하온이는 도서관에서 책을 빌렸어요. 파란 표지였어요.", text]);
      value.pages[0].imagePrompt = "등장인물 1명: 하온. 장소: 도서관 — 나무 책장과 큰 창문. 하온이가 책을 든다.";
      value.pages[1].imagePrompt = "등장인물 1명: 하온. 장소: 집 — 따뜻한 벽과 나무 바닥. 하온이가 앉는다.";
      const repaired = repairStoryContinuity(value);
      assert.ok(
        !repaired.pages[1].imagePrompt.includes("도서관"),
        `${why}을 못 알아봐서 앞 장소로 되돌렸다: ${text}`,
      );
    }
  });

  it("자리를 안 옮긴 문장은 앞 장소를 그대로 지킨다", () => {
    const value = story([
      "하온이는 놀이방에서 블록을 쌓았어요. 높이높이 쌓았어요.",
      "친구가 옆에 앉았어요. 둘이 함께 쌓았어요.",
    ]);
    value.pages[0].imagePrompt = "등장인물 1명: 하온. 장소: 놀이방 — 크림색 벽과 나무 마루. 하온이가 쌓는다.";
    value.pages[1].imagePrompt = "등장인물 2명: 하온, 친구. 장소: 낯선 공원 — 큰 미끄럼틀. 둘이 쌓는다.";
    const repaired = repairStoryContinuity(value);
    assert.ok(repaired.pages[1].imagePrompt.includes("놀이방"), "이동이 없는데 장소가 바뀌었다");
  });

  it("본문이 장소를 말하면 낱말 목록에 없어도 그 장소를 지킨다", () => {
    /*
     * 되돌리는 판단을 '이동 낱말'에만 걸면, 목록에 없는 표현에서 반드시 샌다.
     * 본문에 "놀이터"라고 적혀 있는데 앞 쪽이 거실이라는 이유로 거실로 되돌리는 건
     * 글을 무시하고 앞 그림을 따르는 것이다. 글이 먼저다.
     */
    const value = story([
      "하온이는 거실에서 창밖을 보았어요. 눈이 소복소복 쌓여 있었어요.",
      "놀이터에서 눈사람을 만들었어요. 아주 커다랬어요.",
    ]);
    value.pages[0].imagePrompt = "등장인물 1명: 하온. 장소: 거실 — 밝은 나무 마루. 하온이가 본다.";
    value.pages[1].imagePrompt = "등장인물 1명: 하온. 장소: 놀이터 — 노란 미끄럼틀과 모래밭. 하온이가 만든다.";
    const repaired = repairStoryContinuity(value);
    assert.ok(repaired.pages[1].imagePrompt.includes("놀이터"), "본문이 말한 장소를 되돌렸다");
  });

  it("본문이 장소를 말하지 않으면 앞 장소를 지킨다", () => {
    // 반대쪽도 지켜야 한다 — 근거가 없는데 모델이 괜히 바꾼 것은 되돌린다.
    const value = story([
      "하온이는 거실에서 블록을 쌓았어요. 높이높이 쌓았어요.",
      "하온이는 두 손을 번쩍 들었어요. 아주 뿌듯했어요.",
    ]);
    value.pages[0].imagePrompt = "등장인물 1명: 하온. 장소: 거실 — 밝은 나무 마루. 하온이가 쌓는다.";
    value.pages[1].imagePrompt = "등장인물 1명: 하온. 장소: 낯선 바닷가 — 파도와 모래. 하온이가 손을 든다.";
    const repaired = repairStoryContinuity(value);
    assert.ok(repaired.pages[1].imagePrompt.includes("거실"), "근거 없는 장소 변경을 안 막았다");
  });

  it("동화에 흔한 장소를 알아본다", () => {
    // 여기 없는 곳은 못 알아보고, 못 알아보면 앞 장소로 되돌려진다.
    const places = ["도서관", "동물원", "수영장", "바닷가", "계곡", "식당", "복도", "베란다", "주방", "마당"];
    for (const place of places) {
      const value = story([
        "하온이는 거실에서 준비를 했어요. 마음이 설??어요.".replace("??", "렜"),
        `${place}에 도착했어요. 하온이는 두리번거렸어요.`,
      ]);
      value.pages[0].imagePrompt = "등장인물 1명: 하온. 장소: 거실 — 밝은 나무 마루. 하온이가 준비한다.";
      value.pages[1].imagePrompt = `등장인물 1명: 하온. 장소: ${place} — 그곳의 모습. 하온이가 본다.`;
      const repaired = repairStoryContinuity(value);
      assert.ok(!repaired.pages[1].imagePrompt.includes("거실"), `${place}을(를) 못 알아봐서 거실로 되돌렸다`);
    }
  });

  it("창밖으로 보이는 곳을 '있는 곳'으로 착각하지 않는다", () => {
    /*
     * "집에 돌아와 창가에 앉았어요. 마당에는 눈사람이 서 있었어요."
     * 아이는 집에 있고 마당은 창밖으로 보이는 곳일 뿐인데, 뒤에 나온다는 이유로
     * 마당이 뽑혀 그림이 밖에서 그려질 뻔했다.
     */
    const value = story([
      "하온이와 엄마는 눈사람을 다 만들었어요. 아주 커다랬어요.",
      "집에 돌아와 하온이는 창가에 앉았어요. 마당에는 빨간 목도리를 두른 눈사람이 서 있었어요.",
    ]);
    value.pages[0].imagePrompt = "등장인물 2명: 하온, 엄마. 장소: 마당 — 하얀 눈 쌓인 바닥. 눈사람을 만든다.";
    value.pages[1].imagePrompt = "등장인물 1명: 하온. 장소: 마당 — 하얀 눈 쌓인 바닥. 하온이가 앉는다.";
    const repaired = repairStoryContinuity(value);
    assert.ok(
      /집|거실|마루|소파/.test(repaired.pages[1].imagePrompt),
      `창밖의 마당을 있는 곳으로 골랐다: ${repaired.pages[1].imagePrompt}`,
    );
  });

  it("장소 권고는 제작을 막지 않고 안전·중복 오류만 막는다", () => {
    assert.equal(isBlockingStoryQualityIssue("2쪽 삽화에 고정 장소 설명이 없습니다."), false);
    assert.equal(isBlockingStoryQualityIssue("2쪽 본문이 다른 페이지와 중복됩니다."), true);
  });
});

it("어린이집 이야기의 신발장을 아파트 현관으로 바꾸지 않는다", () => {
  // 실제 사고: 1쪽 본문에 '어린이집 교실'과 '신발장'이 함께 나왔는데 뒤에 있다는
  // 이유로 신발장이 뽑혀 장소가 "좁은 아파트 현관"이 됐고, 그림이 현관과 교실을
  // 문틀로 갈라 붙인 이상한 장면이 됐다.
  const story = {
    title: "소풍 가는 날",
    summary: "",
    characters: [],
    pages: [
      {
        text: "어린이집 교실이 아침부터 시끌시끌했어요. 신발장 앞도 북적북적했어요.",
        imagePrompt: [
          "등장인물 1명: 하온.",
          "하온이는 교실 가운데 앉아 가방을 무릎에 올려놓는다.",
          "장소: 신발장 — 신발장과 낮은 문턱, 밝은 타일 바닥의 좁은 아파트 현관.",
        ].join("\n"),
      },
    ],
  } as never as ParsedStory;
  const line = repairStoryContinuity(story)
    .pages[0].imagePrompt.split("\n")
    .find((l) => l.startsWith("장소:"))!;
  assert.ok(!line.includes("아파트"), line);
  assert.ok(/교실|어린이집/.test(line), line);
});

describe("장소 갈아끼우기는 목록에 있는 두 곳이 정면으로 다를 때만", () => {
  function two(text1: string, prompt1: string, text2: string, prompt2: string): ParsedStory {
    return {
      title: "t",
      summary: "",
      characters: [],
      pages: [
        { pageNo: 1, text: text1, imagePrompt: prompt1, voiceDirection: direction },
        { pageNo: 2, text: text2, imagePrompt: prompt2, voiceDirection: direction },
      ],
    };
  }

  it("목록에 없는 곳(캠핑장)은 본문에 '숲'이 있어도 클로드 설명을 지킨다", () => {
    // 실제 문제: "장소: 캠핑장 — 텐트와 모닥불"이 "장소: 숲속 — 키 큰 푸른 나무"로 바뀌어
    // 글은 캠핑장인데 그림은 숲이 됐다.
    const value = two(
      "하온이네 가족은 숲속 캠핑장에 도착했어요. 텐트를 쳤어요.",
      "등장인물 1명: 하온. 장소: 캠핑장 — 초록 텐트 하나, 돌로 둘러싼 모닥불 자리, 흙바닥. 하온이가 텐트를 본다.",
      "밤이 되자 모닥불이 타올랐어요. 하온이는 마시멜로를 구웠어요.",
      "등장인물 1명: 하온. 장소: 캠핑장 — 초록 텐트 하나, 돌로 둘러싼 모닥불 자리, 흙바닥. 하온이가 굽는다.",
    );
    const repaired = repairStoryContinuity(value);
    for (const page of repaired.pages) {
      assert.match(page.imagePrompt, /장소: 캠핑장 — 초록 텐트/, page.imagePrompt);
    }
  });

  it("시골 할머니 댁 마당은 아파트 거실로 바뀌지 않는다", () => {
    const value = two(
      "하온이는 시골 할머니 댁 마당에서 감나무를 올려다봤어요.",
      "등장인물 1명: 하온. 장소: 할머니 댁 마당 — 흙마당, 큰 감나무 하나, 낮은 돌담. 하온이가 올려다본다.",
      "할머니가 감을 하나 따 주셨어요. 하온이는 활짝 웃었어요.",
      "등장인물 2명: 하온, 할머니. 장소: 할머니 댁 마당 — 흙마당, 큰 감나무 하나, 낮은 돌담. 할머니가 감을 건넨다.",
    );
    const repaired = repairStoryContinuity(value);
    for (const page of repaired.pages) {
      assert.ok(!/아파트|소파/.test(page.imagePrompt), page.imagePrompt);
      assert.match(page.imagePrompt, /감나무/, page.imagePrompt);
    }
  });

  it("본문이 말하지 않아도, 클로드 이름이 본문에 있으면 앞 장소로 되돌리지 않는다", () => {
    const value = two(
      "하온이는 거실에서 신발을 신었어요.",
      "등장인물 1명: 하온. 장소: 거실 — 밝은 나무 마루. 하온이가 신발을 신는다.",
      "목욕탕은 김이 자욱했어요. 하온이는 탕에 발을 담갔어요.",
      "등장인물 1명: 하온. 장소: 목욕탕 — 파란 타일 바닥, 둥근 온탕 하나, 김 서린 벽. 하온이가 발을 담근다.",
    );
    const repaired = repairStoryContinuity(value);
    assert.match(repaired.pages[1].imagePrompt, /장소: 목욕탕/, repaired.pages[1].imagePrompt);
  });

  it("목록에 있는 두 곳이 정면으로 다르면 여전히 본문 쪽으로 고친다", () => {
    const value = two(
      "하온이는 태이네 집에 놀러 갔어요.",
      "등장인물 1명: 하온. 장소: 푸른 숲길 — 키 큰 나무와 꽃덤불. 하온이가 걷는다.",
      "태이네 집에서 둘은 블록을 쌓았어요.",
      "등장인물 2명: 하온, 태이. 장소: 푸른 숲길 — 키 큰 나무와 꽃덤불. 둘이 쌓는다.",
    );
    const repaired = repairStoryContinuity(value);
    assert.ok(repaired.pages.every((p) => !p.imagePrompt.includes("숲길")));
  });
});

describe("isIndoorPlace — 실내를 알아본다", () => {
  it("마트 코너·거실·교실은 실내", () => {
    assert.equal(isIndoorPlace("마트 장난감 코너", "하얀 진열대에 킥보드가 줄지어"), true);
    assert.equal(isIndoorPlace("거실", "크림색 벽과 밝은 나무 마루"), true);
    assert.equal(isIndoorPlace("어린이집 교실", ""), true);
  });

  it("놀이터·계곡·마트 앞 주차장은 바깥", () => {
    assert.equal(isIndoorPlace("동네 놀이터", "노란 미끄럼틀과 둥근 모래밭"), false);
    assert.equal(isIndoorPlace("계곡", "회색 자갈 바닥"), false);
    assert.equal(isIndoorPlace("마트 앞 주차장", "회색 아스팔트"), false);
  });

  it("글자 조각에 걸리지 않는다 — 계산대의 '산', 하늘색의 '하늘', 먹거리의 '거리'", () => {
    // 실제 사고: '마트 계산대'가 실외로 판정돼 길거리 배경 지시가 들어갔다.
    assert.equal(isIndoorPlace("마트 계산대", "밝은 조명과 진열대"), true);
    assert.equal(isIndoorPlace("거실", "하늘색 소파와 밝은 나무 마루"), true);
    assert.equal(isIndoorPlace("하온이 방", "하늘색 벽과 나무 책상"), true);
    assert.equal(isIndoorPlace("어린이집 급식실", "먹거리가 놓인 배식대"), true);
  });

  it("'야외'가 붙으면 실내 낱말이라도 밖", () => {
    assert.equal(isIndoorPlace("야외 수영장", "파란 물과 흰 타일"), false);
    assert.equal(isIndoorPlace("뒷산 산책로", "흙길과 나무"), false);
  });

  it("모르는 곳은 null — 억지로 정하지 않는다", () => {
    assert.equal(isIndoorPlace("별빛 나라", "반짝이는 것들"), null);
  });
});

describe("locationKeyOf — 같은 곳끼리 묶는다", () => {
  it("꾸밈말이 달라도 같은 놀이터", () => {
    assert.equal(locationKeyOf("놀이터"), locationKeyOf("동네 놀이터"));
    assert.equal(locationKeyOf("놀이터"), locationKeyOf("아파트 놀이터"));
  });

  it("아이 방과 거실은 다른 곳, 태이네 집과 우리 집 거실은 집 계열", () => {
    assert.notEqual(locationKeyOf("하온이 방"), locationKeyOf("거실"));
    assert.equal(locationKeyOf("거실"), locationKeyOf("우리 집 거실"));
    assert.equal(locationKeyOf("놀이방"), locationKeyOf("아이 방"));
  });

  it("어린이집 현관과 아파트 현관은 다른 곳", () => {
    assert.notEqual(locationKeyOf("어린이집 현관"), locationKeyOf("아파트 현관"));
  });

  it("목록에 없는 곳은 이름으로 묶되 꾸밈말은 뗀다", () => {
    assert.equal(locationKeyOf("캠핑장"), locationKeyOf("동네 캠핑장"));
    assert.notEqual(locationKeyOf("캠핑장"), locationKeyOf("목욕탕"));
  });

  it("같은 계열이면 뒤 쪽 장소 줄이 앞 쪽 것으로 통일된다", () => {
    const value = story([
      "하온이는 놀이터에서 그네를 탔어요.",
      "하온이는 놀이터에서 미끄럼틀을 탔어요.",
    ]);
    value.pages[0].imagePrompt = "등장인물 1명: 하온. 장소: 놀이터 — 노란 미끄럼틀 하나, 둥근 모래밭, 초록 울타리. 하온이가 그네를 탄다.";
    value.pages[1].imagePrompt = "등장인물 1명: 하온. 장소: 동네 놀이터 — 파란 미끄럼틀과 잔디. 하온이가 미끄럼틀을 탄다.";
    const repaired = repairStoryContinuity(value);
    assert.match(repaired.pages[1].imagePrompt, /장소: 놀이터 — 노란 미끄럼틀 하나/);
    assert.ok(!repaired.pages[1].imagePrompt.includes("파란 미끄럼틀"));
  });
});

it("장면 문장이 말하는 장소를 장소 줄보다 믿는다", () => {
  const story = {
    title: "도서관",
    summary: "",
    characters: [],
    pages: [
      {
        text: "하온이는 조용히 앉아 있었어요.",
        imagePrompt: [
          "등장인물 1명: 하온.",
          "하온이는 도서관 열람 책상에 앉아 그림책을 넘긴다.",
          "장소: 거실 — 크림색 벽과 밝은 나무 마루의 요즘 아파트 거실.",
        ].join("\n"),
      },
    ],
  } as never as ParsedStory;
  const line = repairStoryContinuity(story)
    .pages[0].imagePrompt.split("\n")
    .find((l) => l.startsWith("장소:"))!;
  assert.ok(/도서관|책장/.test(line), line);
});

describe("비유·미래 표현으로 장소를 바꾸지 않는다 — 자동차 저금통 책", () => {
  function two(text1: string, prompt1: string, text2: string, prompt2: string): ParsedStory {
    return { title: "t", summary: "", characters: [], pages: [
      { pageNo: 1, text: text1, imagePrompt: prompt1, voiceDirection: direction },
      { pageNo: 2, text: text2, imagePrompt: prompt2, voiceDirection: direction },
    ] };
  }
  const CLASS = "장소: 어린이집 교실 — 밝은 나무 책상, 크림색 벽에 큰 창문, 낮의 밝은 햇빛.";

  it("'물감이 흘러가는 길을 따라가'는 길거리가 아니다", () => {
    const v = two("하온이는 교실에서 물감을 부었어요.", "등장인물 1명: 하온. " + CLASS + " 하온이가 붓는다.",
      "핑크색 물감이 흘러내렸어요. 하온이는 물감이 흘러가는 길을 손가락으로 따라가 보았어요.",
      "등장인물 1명: 하온. " + CLASS + " 하온이가 따라간다.");
    const r = repairStoryContinuity(v);
    assert.match(r.pages[1].imagePrompt, /장소: 어린이집 교실/, r.pages[1].imagePrompt);
    assert.ok(!r.pages[1].imagePrompt.includes("아스팔트"));
  });

  it("'집에 가져 갈거예요'는 집에 있는 것이 아니다", () => {
    const v = two("하온이는 교실에서 자동차를 칠했어요.", "등장인물 1명: 하온. " + CLASS + " 하온이가 칠한다.",
      "드디어 자동차가 완성됐어요. \"다 마르면 집에 가져 갈거예요!\" 하온이가 말했어요.",
      "등장인물 1명: 하온. " + CLASS + " 하온이가 든다.");
    const r = repairStoryContinuity(v);
    assert.match(r.pages[1].imagePrompt, /장소: 어린이집 교실/, r.pages[1].imagePrompt);
    assert.ok(!r.pages[1].imagePrompt.includes("거실"));
  });

  it("정말 이동하면(집으로 돌아왔어요) 바꾼다", () => {
    const v = two("하온이는 교실에서 자동차를 칠했어요.", "등장인물 1명: 하온. " + CLASS + " 하온이가 칠한다.",
      "하온이는 집으로 돌아왔어요. 거실에서 자동차를 자랑했어요.",
      "등장인물 1명: 하온. " + CLASS + " 하온이가 자랑한다.");
    const r = repairStoryContinuity(v);
    assert.ok(/거실|집/.test(r.pages[1].imagePrompt), r.pages[1].imagePrompt);
  });
});
