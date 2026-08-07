import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseOutline, parseStory, StoryParseError } from "./story-format.ts";

// Opus 4.8이 실제로 뱉은 출력. 손으로 지어낸 게 아니라 첫 호출의 원문이다.
// 줄거리는 이제 기승전결 4막이 아니라 장면(@@SCENE@@) 단위로 나온다.
const REAL_OUTLINE = `@@TITLE@@ 지민이와 작은 공룡알
@@SUMMARY@@ 공룡을 무서워하던 지민이가 길 잃은 아기 공룡을 스스로 도와주는 이야기.
@@SCENE@@ 1
@@TEXT@@ 여섯 살 지민이는 공룡 그림책은 좋아하지만 큰 공룡은 무서워한다. 어느 날 놀이터 모래밭에서 반짝이는 작은 알 하나를 발견한다.
@@SCENE@@ 2
@@TEXT@@ 알에서 조그만 아기 공룡이 태어나 지민이 뒤만 졸졸 따라다닌다.
@@SCENE@@ 3
@@TEXT@@ 아기 공룡이 엄마를 찾아 울자, 지민이는 커다란 엄마 공룡이 다가오는 것을 보고 다리가 떨린다.
@@SCENE@@ 4
@@TEXT@@ 지민이는 용기를 내 아기 공룡을 품에 안고 엄마 공룡 앞까지 걸어가 건네준다.
`;

describe("parseOutline", () => {
  it("실제 모델 출력에서 제목·요약·장면들을 뽑는다", () => {
    const outline = parseOutline(REAL_OUTLINE);

    assert.equal(outline.title, "지민이와 작은 공룡알");
    assert.match(outline.summary, /공룡을 무서워하던/);
    assert.deepEqual(
      outline.scenes.map((s) => s.sceneNo),
      [1, 2, 3, 4],
    );
    assert.match(outline.scenes[0].text, /놀이터 모래밭/);
  });

  it("장면 번호가 뒤바뀌어 나와도 1부터 차례로 다시 세운다", () => {
    const outline = parseOutline(`@@TITLE@@ 무제
@@SCENE@@ 4
@@TEXT@@ 넷째
@@SCENE@@ 1
@@TEXT@@ 첫째
@@SCENE@@ 3
@@TEXT@@ 셋째
@@SCENE@@ 2
@@TEXT@@ 둘째
`);

    assert.deepEqual(
      outline.scenes.map((s) => [s.sceneNo, s.text]),
      [
        [1, "첫째"],
        [2, "둘째"],
        [3, "셋째"],
        [4, "넷째"],
      ],
    );
  });

  it("장면 줄거리가 비어 있으면 실패한다", () => {
    assert.throws(
      () => parseOutline("@@TITLE@@ 무제\n@@SCENE@@ 1\n@@TEXT@@ 첫째\n@@SCENE@@ 2"),
      /2장면 줄거리가 비어 있습니다/,
    );
  });

  it("장면이 하나도 없으면 실패한다", () => {
    assert.throws(
      () => parseOutline("@@TITLE@@ 무제\n@@SUMMARY@@ 요약만 있음"),
      /장면을 하나도 찾지 못했습니다/,
    );
  });
});

// 실제 샘플책(arin-treasure) 톤을 그대로 옮긴 것. 대사 따옴표가 많은 게 핵심이다.
const SAMPLE = `네, 아린이를 위한 동화를 만들어 드릴게요!

@@TITLE@@ 아린이의 반짝 보물 찾기
@@SUMMARY@@ 아린이가 친구 효담·정우와 함께 보물을 찾아 떠나는 이야기
@@CHARACTER@@ 아린 | 일곱 살 여자아이, 노란 우비에 단발머리
@@CHARACTER@@ 효담 | 아린이의 친구, 파란 모자
@@PAGE@@ 1
@@TEXT@@
어느 맑은 날, 아린이는 마당에서 꼬깃꼬깃 접힌 오래된 지도를 주웠어요.
"어? 이거 보물 지도잖아!"
아린이는 얼른 친구 효담이와 정우를 불렀어요.
@@IMG@@ 마당에서 낡은 지도를 펼쳐 든 아린이, 맑은 하늘
@@PAGE@@ 2
@@TEXT@@
세 친구는 지도를 따라 반짝이는 숲으로 들어갔어요.
"보물은 저쪽이야!"
@@IMG@@ 숲길을 앞장서 걷는 세 아이의 뒷모습
`;

describe("parseStory", () => {
  it("페이지별 구조화 성우 연기 지시를 읽는다", () => {
    const story = parseStory(`@@TITLE@@ 별빛 산책
@@PAGE@@ 1
@@TEXT@@ 민이가 별빛 아래를 걸었어요. 아주 반짝였어요.
@@VOICE@@ narration=normal | dialogue=happy | intensity=0.9 | pace=slow
@@IMG@@ 별빛 아래 걷는 민이`);
    assert.deepEqual(story.pages[0].voiceDirection, {
      narration: "normal",
      dialogue: "happy",
      intensity: 0.65,
      pace: "slow",
    });
  });

  it("마커 평문에서 제목·요약·인물·페이지를 뽑는다", () => {
    const story = parseStory(SAMPLE);

    assert.equal(story.title, "아린이의 반짝 보물 찾기");
    assert.match(story.summary, /효담/);
    assert.equal(story.pages.length, 2);
    assert.equal(story.pages[0].imagePrompt, "마당에서 낡은 지도를 펼쳐 든 아린이, 맑은 하늘");
  });

  it("본문의 큰따옴표가 그대로 살아남는다 (JSON을 버린 이유)", () => {
    const story = parseStory(SAMPLE);

    assert.ok(story.pages[0].text.includes('"어? 이거 보물 지도잖아!"'));
    assert.ok(story.pages[1].text.includes('"보물은 저쪽이야!"'));
  });

  it("여러 줄 본문의 줄바꿈을 유지한다", () => {
    const story = parseStory(SAMPLE);

    assert.equal(story.pages[0].text.split("\n").length, 3);
  });

  it("인물을 이름과 생김새로 나눈다", () => {
    const story = parseStory(SAMPLE);

    assert.deepEqual(story.characters[0], {
      name: "아린",
      description: "일곱 살 여자아이, 노란 우비에 단발머리",
    });
    assert.equal(story.characters.length, 2);
  });

  it("첫 마커 앞의 잡담을 버린다", () => {
    const story = parseStory(SAMPLE);

    assert.ok(!story.title.includes("만들어 드릴게요"));
  });

  it("페이지 번호가 튀어도 1부터 다시 매긴다", () => {
    const story = parseStory(`@@TITLE@@ 무제
@@PAGE@@ 3
@@TEXT@@ 셋째 쪽이라고 우기는 쪽
@@PAGE@@ 1
@@TEXT@@ 사실은 첫 쪽
`);

    assert.deepEqual(
      story.pages.map((p) => [p.pageNo, p.text]),
      [
        [1, "사실은 첫 쪽"],
        [2, "셋째 쪽이라고 우기는 쪽"],
      ],
    );
  });

  it("모르는 마커는 무시하고 계속 간다", () => {
    const story = parseStory(`@@TITLE@@ 무제
@@MOOD@@ 따뜻하고 포근한
@@PAGE@@ 1
@@TEXT@@ 본문
`);

    assert.equal(story.pages.length, 1);
  });

  it("한 줄로 붙여 쓴 @@TEXT@@도 받는다", () => {
    const story = parseStory(`@@TITLE@@ 무제
@@PAGE@@ 1
@@TEXT@@ 한 줄짜리 본문
`);

    assert.equal(story.pages[0].text, "한 줄짜리 본문");
  });

  it("제목이 없으면 실패한다", () => {
    assert.throws(() => parseStory("@@PAGE@@ 1\n@@TEXT@@ 본문"), StoryParseError);
  });

  it("본문이 빈 페이지가 있으면 실패한다", () => {
    assert.throws(
      () => parseStory("@@TITLE@@ 무제\n@@PAGE@@ 1\n@@IMG@@ 그림만 있고 글이 없음"),
      StoryParseError,
    );
  });

  it("마커가 아예 없으면 실패한다", () => {
    assert.throws(() => parseStory("그냥 평범한 문장입니다."), StoryParseError);
  });
});
