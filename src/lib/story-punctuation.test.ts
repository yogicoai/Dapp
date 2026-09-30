import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

import {
  breathForSpeech,
  breathLimits,
  letters,
  punctuationRetryLine,
  reviewPunctuation,
  sentenceRule,
  speechSentences,
  tidyPages,
  tidyPunctuation,
  withoutRewording,
} from "./story-punctuation.ts";
import { minPageLetters } from "./story-quality.ts";

/*
 * 실제로 만들어진 동화(2026-09, 5세 '하온') 문장들 — 사장님이 "끊임없이 읽는다"고 한 원고.
 * tmp-stories 는 저장소에 없어서 여기 옮겨 둔다.
 */
const GENERATED = [
  "어린이집 놀이방 카펫 위에 하온이랑 친구들이 동그랗게 모여 앉았어요. 하온이가 피노키오 책을 펼치자 고래 뱃속 그림에 동글동글한 물방울이 가득했어요. \"이거 봐, 비눗방울 같아!\" 하온이가 손가락으로 하나둘 세어 보았어요. 옆에 있던 친구들도 눈을 동그랗게 뜨고 함께 들여다보았어요.",
  "어린이집으로 돌아온 하온이는 뮤직테라피 시간에 '의좋은 형제' 이야기를 들었어요. 지게에 볏단을 실어 나르는 흉내도 내 보고, 친구들과 나란히 앉아 핑거심벌즈를 톡톡 부딪혔어요. 하온이는 노래에 맞춰 짤랑짤랑 소리를 냈어요. 친구1과 친구2도 리듬에 맞춰 신나게 따라 쳤어요.",
  "하온이는 어린이집 구석에 앉아 블록을 조몰락조몰락 만지고 있어요. 저쪽 책상에는 친구가 책을 보고 있어요. 하온이는 같이 보고 싶은데 무슨 말을 해야 할지 몰라 손끝만 꼼지락거려요. 마음속에서는 콩닥콩닥, 다가가고 싶은 마음이 자꾸 커져요.",
  "그때 책 한 권이 스르륵 굴러와 하온이 발밑에 멈춰요. 피노키오가 고래 뱃속에 있는 그림이었는데, 동그란 물방울들이 도르르 반짝여요. 하온이가 눈을 크게 뜨고 소리쳐요. \"우와, 비눗방울 같아!\" 하온이는 손가락으로 물방울을 하나둘 세어 봐요.",
];

/*
 * 09-29 규칙을 넣은 뒤 나온 원고(2026-09-30, '하온이 푸드트럭' 한 쪽) — 사장님: "꺼냈어요 어요
 * 어요 요 요 이런 식으로 끊임이 너무 많이 발생". 짧은 '~어요.' 지문이 쉼표·이음 없이 잇따르고,
 * 말한 사람 문장이 대사마다 따로 섰다.
 */
const FOOD_TRUCK =
  '하온이랑 도준이가 음식 모형을 꺼냈어요.\n자동차 안에 가득가득 채워 넣었어요.\n그때 선생님이 다가왔어요.\n"이건 뭐예요?"\n선생님이 궁금한 표정으로 물었어요.\n하온이가 활짝 웃으며 대답했어요.\n"음식을 파는 차예요!"';
/** 같은 쪽을 이음말·쉼표로 잇고 끝말을 바꾼 판 — 끊김 검사가 넘겨야 한다(5세 기준). */
const FOOD_TRUCK_JOINED =
  '하온이랑 도준이는 음식 모형을 꺼내, 장난감 자동차 안에 가득가득 채워 넣었어요.\n그때 선생님이 다가와 궁금한 얼굴로 물었지요.\n"이건 뭐예요?"\n하온이가 활짝 웃으며 대답했어요.\n"음식을 파는 차예요!"';
/*
 * 같은 판을 요즘 말투 그대로(끝을 전부 '~었어요.'로) 이은 것 — 09-30 검토에서 나온 쪽.
 * 대사마다 말한 사람 문장이 붙어 '~어요.' 지문이 대사를 사이에 두고 이어진다. 이음·쉼표로 잘 이었으니
 * 넘어가야 한다 — 걸리면 모델은 요즘 이야기에 '-지요'를 뿌려 옛날이야기 말투로 고친다.
 */
const FOOD_TRUCK_JOINED_PLAIN =
  '하온이와 도준이는 음식 모형을 꺼내, 종이 상자 자동차 안에 가득가득 채워 넣었어요.\n그때 선생님이 다가와 고개를 갸웃하며 물었어요.\n"이건 뭐예요?"\n하온이가 두 팔을 활짝 벌리며 대답했어요.\n"음식을 파는 차예요!"\n도준이도 옆에서 고개를 끄덕이며, 빙그레 웃었어요.';

const RHYTHM = new Set(["choppy", "same-ending"]);

/** 딸린 전래동화·세계명작 — 눈금을 맞춘 기준 원고. */
function curatedPages(): string[] {
  const read = (name: string) =>
    JSON.parse(fs.readFileSync(new URL(`../data/${name}`, import.meta.url), "utf8")) as {
      pages: { text: string }[];
    }[];
  return [...read("folk-books.json"), ...read("classic-books.json")].flatMap((book) =>
    book.pages.map((page) => page.text),
  );
}

describe("breathLimits · sentenceRule", () => {
  it("나이가 많을수록 한 문장·한 숨이 길어진다", () => {
    let prev = breathLimits(1);
    for (const age of [3, 4, 5, 6, 7, 8, 9]) {
      const cur = breathLimits(age);
      assert.ok(cur.max >= prev.max && cur.breath >= prev.breath, `${age}세`);
      assert.ok(cur.target < cur.max);
      prev = cur;
    }
  });

  it("프롬프트 한 줄에 그 나이의 숫자가 그대로 들어간다(검사와 같은 눈금)", () => {
    const l = breathLimits(5);
    const rule = sentenceRule(5);
    assert.match(rule, new RegExp(`${l.target}자 안팎`));
    assert.match(rule, new RegExp(`${l.max}자를 넘기지`));
    assert.match(rule, new RegExp(`${l.breath}자를 넘게`));
    assert.match(rule, new RegExp(`${l.links}번까지`));
    // '짧은'이 몇 자인지, 대사가 끼어도 이어 센다는 것까지 — 검사(choppy)와 같은 눈으로 보게.
    assert.match(rule, new RegExp(`${l.short}자 이하로 끝나는 짧은 지문`));
    assert.match(rule, /사이에 대사가 끼어도 지문끼리 이어 센다/);
    assert.match(rule, /같은 끝소리/);
  });

  it("4·5세 한 숨 상한이 한 문장 알맞은 길이와 크게 벌어지지 않는다(09-30 검토)", () => {
    // 숨 상한이 알맞은 길이보다 한참 짧으면 이음말 없는 보통 문장마다 쉼표를 요구해 다시 쪼개게 된다.
    for (const age of [4, 5]) assert.ok(breathLimits(age).breath >= breathLimits(age).target - 2, `${age}세`);
    // 쉼표 둘 자리로 '긴 앞말 뒤'도 준다 — 이음말 뒤만 있으면 모든 문장이 '-고,'로 엮인다.
    assert.match(sentenceRule(5), /긴 앞말 뒤/);
  });

  it("두 살 이하는 이어 붙이지 말라고 한다", () => {
    assert.match(sentenceRule(2), /이어 붙이지 않고/);
  });

  it("숨 상한이 문장 상한만 한 나이(2세 이하)는 쉼표를 억지로 넣지 말라고 한다", () => {
    assert.doesNotMatch(sentenceRule(2), /자를 넘게 이어/);
    assert.match(sentenceRule(2), /억지로 넣지 않고/);
  });

  it("2세는 분량이 모자라면 짧은 문장을 하나 더 — 되풀이가 곧 리듬이다", () => {
    assert.match(sentenceRule(2), /문장을 늘이지 말고/);
  });

  it("3세부터는 이음말로 잇고, 모자란 분량을 문장 쪼개기로 채우지 말라고 한다(09-30)", () => {
    for (const age of [3, 4, 5, 6, 7, 9]) {
      const rule = sentenceRule(age);
      assert.match(rule, /이음말/, `${age}세`);
      assert.match(rule, /잘게 쪼개/, `${age}세`);
      // 09-29 판의 이 말이 '~어요.' 문장만 줄줄이 나오게 했다.
      assert.doesNotMatch(rule, /짧은 문장을 하나 더/, `${age}세`);
    }
    // 잇따라도 되는 짧은 문장 수는 끊김 검사 눈금(shortRun)보다 하나 적다.
    assert.match(sentenceRule(3), /세 개까지만/);
    for (const age of [4, 5, 6, 7, 9]) assert.match(sentenceRule(age), /두 개까지만/, `${age}세`);
  });

  it("프롬프트 한 줄에 베낄 수 있는 예문을 넣지 않는다", () => {
    // 프롬프트에 넣은 예문은 동화에 그대로 옮겨진다 — 규칙과 모양만 말한다.
    for (const age of [2, 3, 4, 5, 6, 7, 9]) assert.doesNotMatch(sentenceRule(age), /["“”]/, `${age}세`);
  });

  it("쉼표가 든 문장은 전래·명작만큼(p95 32자·p99 39자) 길어도 된다 — 숨 상한은 그대로 좁다", () => {
    for (const age of [5, 6, 7]) {
      const l = breathLimits(age);
      assert.ok(l.max >= 35, `${age}세 한 문장 ${l.max}자`);
      assert.ok(l.breath <= 22, `${age}세 한 숨 ${l.breath}자`);
    }
    assert.equal(breathLimits(2).shortRun, 0, "2세 이하는 끊김을 보지 않는다");
  });

  it("쪽당 가장 적은 문장 수 × 한 문장 길이가 '본문이 지나치게 짧다' 문턱에 닿는다", () => {
    // anthropic.ts lengthGuide 의 문장 수 아래쪽. 문턱 아래를 겨누면 막는 검사에 걸려 돈 드는 다시 쓰기가 난다.
    const fewest: Record<number, number> = { 2: 2, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 9: 7 };
    for (const [age, n] of Object.entries(fewest)) {
      assert.ok(n * breathLimits(Number(age)).target >= minPageLetters(Number(age)), `${age}세`);
    }
  });
});

describe("tidyPunctuation — 빠진 끝 부호", () => {
  it("쪽 끝 문장에 마침표를 찍는다", () => {
    assert.equal(tidyPunctuation("하온이는 공원에 갔어요"), "하온이는 공원에 갔어요.");
    assert.equal(tidyPunctuation("호랑이가 나타났다"), "호랑이가 나타났다.");
  });

  it("물음으로 끝나면 물음표를 찍는다", () => {
    assert.equal(tidyPunctuation("어디로 가야 할까요"), "어디로 가야 할까요?");
  });

  it("줄마다 끝 부호를 찍는다", () => {
    assert.equal(
      tidyPunctuation("하온이는 공원에 갔어요\n비눗방울을 불었어요"),
      "하온이는 공원에 갔어요.\n비눗방울을 불었어요.",
    );
  });

  it("대사가 끝났는데 부호가 없으면 따옴표 안쪽에 넣는다", () => {
    assert.equal(tidyPunctuation('하온이가 웃었어요.\n"같이 가자"'), '하온이가 웃었어요.\n"같이 가자."');
    assert.equal(tidyPunctuation('"어디 가니"'), '"어디 가니?"');
  });

  it("다음 줄이 '하고·라고'로 이어지면 넣지 않는다", () => {
    assert.equal(tidyPunctuation('"형님"\n하고 불렀어요.'), '"형님"\n하고 불렀어요.');
    assert.equal(tidyPunctuation("좋아요\n하고 웃었어요."), "좋아요\n하고 웃었어요.");
  });

  it("한 줄 안에서 분명히 끝난 문장에 마침표를 넣는다", () => {
    assert.equal(
      tidyPunctuation("오늘 공원에 갔어요 비눗방울을 불었어요 하온이는 신났어요"),
      "오늘 공원에 갔어요. 비눗방울을 불었어요. 하온이는 신났어요.",
    );
  });

  it("말을 잇는 자리·따옴표 안에는 넣지 않는다", () => {
    assert.equal(tidyPunctuation("엄마 사랑해요 하고 속삭였어요."), "엄마 사랑해요 하고 속삭였어요.");
    assert.equal(tidyPunctuation('"안녕하세요 할머니!" 하온이가 인사했어요.'), '"안녕하세요 할머니!" 하온이가 인사했어요.');
    // 이름 '하온'이 '하'로 시작해도 잇는 말이 아니다 — 새 문장이다.
    assert.equal(tidyPunctuation("잘했어요 하온이가 웃었어요."), "잘했어요. 하온이가 웃었어요.");
  });

  it("소리말·이름씨로 끝나는 줄은 건드리지 않는다", () => {
    for (const text of ["하온이는 짤랑짤랑", "저 멀리 푸른 바다", "하온이 보물은 노란 요요", '제목은 "피노키오"']) {
      assert.equal(tidyPunctuation(text), text);
    }
  });

  it("이미 부호가 있으면 그대로 둔다", () => {
    for (const text of GENERATED) assert.equal(tidyPunctuation(text), text);
    const lined = '옛날 옛적,\n"안 돼!"\n그러자…\n쾅—\n"정말이야?"\n끝.';
    assert.equal(tidyPunctuation(lined), lined);
  });
});

describe("tidyPunctuation — 검토에서 나온 자리(2026-09-29)", () => {
  it("대사 바로 뒤에 말한 사람이 오면 대사 안에 부호를 넣는다", () => {
    assert.equal(tidyPunctuation('"하온아, 이리 와" 엄마가 불렀어요'), '"하온아, 이리 와." 엄마가 불렀어요.');
    assert.equal(tidyPunctuation('"어디 가니" 할머니가 물었어요.'), '"어디 가니?" 할머니가 물었어요.');
    assert.equal(tidyPunctuation('문이 열렸어요. "같이 놀자" 친구가 웃었어요.'), '문이 열렸어요. "같이 놀자." 친구가 웃었어요.');
  });

  it("따옴표가 이름·제목이거나 뒷말이 대사를 이으면 그대로 둔다", () => {
    for (const text of [
      '"아기 상어" 노래를 불렀어요.',
      '"백설공주와 일곱 난쟁이" 책을 읽었어요.',
      '"같이 가자" 하고 웃었어요.',
      '"잘 먹겠습니다" 하고는 숟가락을 들었어요.',
      '오늘 읽은 책은 "피노키오와 고래"',
      '노래는 "반짝반짝 작은 별"',
      '간판에는 "하온이네 빵집"',
      '친구 이름은 "민지"',
      '친구 이름은 "린다"',
    ]) {
      assert.equal(tidyPunctuation(text), text);
    }
  });

  it("따옴표 없이 옮긴 말 뒤 '말하는 움직임' 앞에는 점을 넣지 않는다", () => {
    for (const text of ["엄마가 괜찮아요 웃으며 말했어요.", "하온이는 안녕하세요 인사했어요.", "뭐 할까요 고민했어요."]) {
      assert.equal(tidyPunctuation(text), text);
    }
    // 목적어가 끼면 새 문장이다.
    assert.equal(tidyPunctuation("공원에 갔어요 친구를 불렀어요"), "공원에 갔어요. 친구를 불렀어요.");
  });

  it("대사로 끝나지 않은 줄 뒤의 '대답 대신·말하는'은 새 문장이다", () => {
    assert.equal(
      tidyPunctuation("하온이는 고개를 끄덕였어요\n대답 대신 방긋 웃었어요"),
      "하온이는 고개를 끄덕였어요.\n대답 대신 방긋 웃었어요.",
    );
    assert.equal(
      tidyPunctuation("하온이는 창밖을 보았어요\n말하는 앵무새가 날아왔어요"),
      "하온이는 창밖을 보았어요.\n말하는 앵무새가 날아왔어요.",
    );
  });

  it("'판다·사이다'처럼 '다'로 끝나는 이름씨 뒤에는 점을 찍지 않는다", () => {
    for (const text of ["하온이는 커다란 판다\n인형을 꼭 안았어요.", "시원한 사이다\n한 모금 마셨어요."]) {
      assert.equal(tidyPunctuation(text), text);
    }
  });

  it("tidyPages 는 빈 줄을 없앤다 — 뷰어가 문장마다 빈 줄을 그리지 않게", () => {
    const [page] = tidyPages([{ text: "문이 열렸어요.\n\n하온이가 웃었어요" }]);
    assert.equal(page.text, "문이 열렸어요.\n하온이가 웃었어요.");
  });
});

describe("tidyPunctuation — 띄어쓰기와 부호 모양", () => {
  it("부호 앞 빈칸은 떼고, 부호 뒤에 붙은 글자는 띄운다", () => {
    assert.equal(tidyPunctuation("갔어요 .하온이는 웃었어요 !"), "갔어요. 하온이는 웃었어요!");
    assert.equal(tidyPunctuation("그때,책이 굴러왔어요."), "그때, 책이 굴러왔어요.");
  });

  it("닫는 따옴표 앞은 띄우지 않는다", () => {
    assert.equal(tidyPunctuation('"같이 가자." 하온이가 말했어요.'), '"같이 가자." 하온이가 말했어요.');
  });

  it("점 세 개·전각 부호를 한 가지로 맞춘다(한글 뒤에서만)", () => {
    assert.equal(tidyPunctuation('"으응... 배가 아파."'), '"으응… 배가 아파."');
    assert.equal(tidyPunctuation("정말요？ 좋아요！"), "정말요? 좋아요!");
    // 일본어 책의 。는 그 말의 바른 부호다.
    assert.equal(tidyPunctuation("トリは わらいました。"), "トリは わらいました。");
  });

  it("겹친 빈칸은 하나로, 빈 줄은 하나까지", () => {
    assert.equal(tidyPunctuation("하온이는  웃었어요.\n\n\n\n끝났어요."), "하온이는 웃었어요.\n\n끝났어요.");
  });
});

describe("tidyPunctuation — 글자는 한 자도 안 바꾼다", () => {
  const corpus = [...curatedPages(), ...GENERATED];

  it("딸린 책 전부에서 글자(한글·영문·숫자)가 그대로다", () => {
    for (const text of corpus) {
      assert.equal(letters(tidyPunctuation(text)), letters(text.normalize("NFC")), text.slice(0, 40));
    }
  });

  it("두 번 손봐도 결과가 같다", () => {
    for (const text of corpus) {
      const once = tidyPunctuation(text);
      assert.equal(tidyPunctuation(once), once, text.slice(0, 40));
    }
  });

  it("이미 다듬은 딸린 책은 거의 건드리지 않는다", () => {
    const pages = curatedPages();
    const changed = pages.filter((text) => tidyPunctuation(text) !== text).length;
    assert.ok(changed <= pages.length * 0.02, `${changed}/${pages.length}쪽이 바뀜`);
  });

  it("tidyPages 는 글만 손보고 다른 칸은 그대로 둔다", () => {
    const [page] = tidyPages([{ text: "갔어요", imagePrompt: "그림 설명" }]);
    assert.deepEqual(page, { text: "갔어요.", imagePrompt: "그림 설명" });
  });
});

describe("reviewPunctuation", () => {
  it("사장님이 짚은 실제 원고의 쉼 없는 긴 문장을 잡는다", () => {
    const findings = reviewPunctuation([{ text: GENERATED[0] }, { text: GENERATED[1] }, { text: GENERATED[2] }], 5);
    const hit = (start: string) => findings.find((f) => f.excerpt.startsWith(start));
    // 34자 문장 — 09-30부터 5세 한 문장 상한(35자) 안이다. 문제는 길이가 아니라 쉼표 없는 한 숨이라
    // '나눠요'가 아니라 '쉼표를 넣어요'로 짚는다.
    assert.equal(hit("하온이가 피노키오 책을")?.kind, "long-breath");
    assert.equal(hit("어린이집으로 돌아온")?.kind, "long-breath");
    assert.equal(hit("하온이는 같이 보고")?.kind, "long-breath");
    assert.ok(findings.every((f) => f.page >= 1 && f.page <= 3));
  });

  it("마침표 없이 이어진 쪽은 나이와 상관없이 잡는다", () => {
    const runOn =
      "하온이는 공원에 나가서 비눗방울을 불었는데 바람이 불어서 비눗방울이 하늘 높이 날아갔고 하온이는 깔깔 웃으면서 비눗방울을 따라 뛰어가서 손을 쭉 뻗어 톡 잡았어요";
    for (const age of [3, 4, 5, 6, 7, 9]) {
      assert.ok(
        reviewPunctuation([{ text: runOn }], age).some((f) => f.kind === "long-sentence"),
        `${age}세`,
      );
    }
  });

  it("09-29 프롬프트의 좋은 예(O)는 이제 같은 끝말 되풀이로 짚는다 — 이어 쓴 판은 넘어간다", () => {
    // 세 줄이 모두 '~었어요.' — 모델은 이 모양을 베껴 푸드트럭 쪽을 썼다.
    const old = "강아지가 공을 물고 달려갔어요.\n꽃밭을 지나, 울타리 앞에서 딱 멈췄어요.\n그러고는 꼬리를 살랑살랑 흔들었어요.";
    assert.deepEqual(reviewPunctuation([{ text: old }], 5).map((f) => f.kind), ["same-ending"]);
    const joined = "강아지가 공을 물고 꽃밭을 지나, 울타리 앞까지 달려갔어요.\n그러고는 딱 멈춰, 꼬리를 살랑살랑 흔들었지요.";
    assert.deepEqual(reviewPunctuation([{ text: joined }], 5), []);
  });

  it("쉼표 없이 이음을 여럿 붙이면 잡는다", () => {
    // 숨은 짧아도(16자) '-고'를 세 번 이으면 5세에겐 많다(2번까지).
    const text = "밥을 먹고 이를 닦고 옷을 입고 나갔어요.";
    const findings = reviewPunctuation([{ text }], 5);
    assert.equal(findings[0]?.kind, "chained");
    // '-고 싶다·-고 있다'는 이음으로 세지 않는다.
    assert.deepEqual(reviewPunctuation([{ text: "하온이는 놀고 싶고 웃고 있어요." }], 4), []);
  });

  it("2~3세의 보통 문장에는 쉼표를 요구하지 않는다", () => {
    assert.deepEqual(reviewPunctuation([{ text: "하온이는 엄마 손을 잡고 놀이터에 갔어요." }], 3), []);
    assert.deepEqual(reviewPunctuation([{ text: "반짝반짝 작은 별이 하늘에서 웃어요." }], 2), []);
  });

  it("대사·소리말을 받는 '하고'는 이음으로 세지 않는다", () => {
    assert.deepEqual(reviewPunctuation([{ text: "멍멍 하고 짖어요." }], 2), []);
    assert.deepEqual(reviewPunctuation([{ text: '"같이 놀자!" 하고 말했어요.' }], 2), []);
    assert.deepEqual(reviewPunctuation([{ text: '"가자!" 하고 손을 잡고 말했어요.' }], 3), []);
    // 일을 하는 '하고'는 센다.
    assert.equal(reviewPunctuation([{ text: "숙제를 하고 밥을 먹고 잤어요." }], 3)[0]?.kind, "chained");
  });

  it("대사가 끝났는데 따옴표 안에 부호가 없으면 잡는다 — '하고·라고'가 이으면 괜찮다", () => {
    const bad = reviewPunctuation([{ text: '"같이 가자" 하온이가 웃었어요.' }], 6);
    assert.equal(bad[0]?.kind, "quote-no-mark");
    assert.deepEqual(reviewPunctuation([{ text: '"같이 가자" 하고 웃었어요.' }], 6), []);
    assert.deepEqual(reviewPunctuation([{ text: '"같이 가자"라며 웃었어요.' }], 6), []);
  });

  it("눈금 — 딸린 책은 거의 안 걸리고, 만든 원고는 훨씬 많이 걸린다", () => {
    // 전래·명작은 5~7세 기준으로 다듬은 원고다. 그 책들이 우르르 걸리면 눈금자가 틀린 것이다.
    const curated = curatedPages().map((text) => ({ text }));
    const sentences = curated.reduce((n, page) => n + speechSentences(page.text).length, 0);
    const curatedRate = reviewPunctuation(curated, 6).length / sentences;
    assert.ok(curatedRate <= 0.08, `딸린 책 ${(curatedRate * 100).toFixed(1)}%`);

    const generated = GENERATED.map((text) => ({ text }));
    const generatedSentences = generated.reduce((n, page) => n + speechSentences(page.text).length, 0);
    const generatedRate = reviewPunctuation(generated, 6).length / generatedSentences;
    assert.ok(generatedRate >= curatedRate * 3, `만든 원고 ${(generatedRate * 100).toFixed(1)}%`);
  });

  it("다시 쓰기 요청에는 앞의 몇 곳만 넘긴다", () => {
    const findings = reviewPunctuation(GENERATED.map((text) => ({ text })), 5);
    assert.ok(findings.length > 5);
    const line = punctuationRetryLine(findings);
    assert.equal(line.split(" / ").length, 5);
    assert.match(line, new RegExp(`그 밖에 ${findings.length - 5}곳 더`));
    assert.equal(punctuationRetryLine([]), "");
  });

  it("부모 완성 원고는 부호·숨 권고만 넘긴다 — 잇기·끝소리 권고는 뺀다", () => {
    const manuscript =
      "아침에 하온이는 일찍 일어나서 창문을 열었어요.\n밖에는 하얀 눈이 소복소복 쌓여 있었어요.\n" +
      "하온이는 얼른 엄마를 부르러 거실로 달려갔어요.\n엄마도 창밖을 보고 깜짝 놀랐어요.";
    const all = reviewPunctuation([{ text: manuscript }, { text: FOOD_TRUCK }, { text: GENERATED[0] }], 5);
    assert.ok(all.some((f) => f.kind === "same-ending") && all.some((f) => f.kind === "choppy"));
    const kept = withoutRewording(all);
    assert.ok(kept.length > 0 && kept.every((f) => !RHYTHM.has(f.kind)));
    assert.equal(kept.length, all.filter((f) => !RHYTHM.has(f.kind)).length);
    // 남는 게 없으면 다시 쓰기에 붙일 줄도 없다.
    assert.equal(punctuationRetryLine(withoutRewording(reviewPunctuation([{ text: manuscript }], 5))), "");
  });

  it("다시 쓰기 머리말은 '나눠라' 한쪽으로 밀지 않는다 — 긴 곳과 끊기는 곳을 함께 말한다", () => {
    const line = punctuationRetryLine(reviewPunctuation([{ text: FOOD_TRUCK }], 5));
    assert.match(line, /숨이 너무 길거나 뚝뚝 끊기는/);
    assert.match(line, /짧은 문장이 4번 잇따라요/);
  });
});

describe("reviewPunctuation — 뚝뚝 끊기는 자리(09-30)", () => {
  const kinds = (text: string, age: number) => reviewPunctuation([{ text }], age).map((f) => f.kind);

  it("푸드트럭 쪽 — 4세부터는 짧은 문장이 잇따른다고 짚는다(대사는 건너뛰고 센다)", () => {
    for (const age of [4, 5, 6, 7, 9]) {
      const findings = reviewPunctuation([{ text: FOOD_TRUCK }], age);
      const choppy = findings.filter((f) => f.kind === "choppy");
      assert.equal(choppy.length, 1, `${age}세`);
      assert.equal(choppy[0].excerpt, "하온이랑 도준이가 음식 모형을 꺼냈어요.");
      assert.match(choppy[0].message, /4번 잇따라요/);
      // 같은 줄을 same-ending 으로 한 번 더 세지 않는다.
      assert.ok(!findings.some((f) => f.kind === "same-ending"), `${age}세`);
    }
  });

  it("3세 — 푸드트럭 쪽은 3세 문장 길이라 넘어가고, 짧은 지문이 넷 잇따르면 짚는다", () => {
    // 3세는 짧은 말 되풀이가 리듬이다(lengthGuide). 대사에서 끝소리 줄이 끊겨 셋씩만 잇따른다.
    assert.ok(!kinds(FOOD_TRUCK, 3).some((k) => RHYTHM.has(k)));
    const choppy = '하온이가 상자를 열었어요.\n안에 인형이 있었어요.\n"우와!"\n하온이가 인형을 안았어요.\n인형이 참 따뜻했어요.';
    assert.deepEqual(kinds(choppy, 3), ["choppy"]);
    // 셋까지는 3세의 되풀이 리듬이라 넘어간다(sentenceRule(3) "세 개까지만"과 같은 수).
    assert.ok(!kinds("토끼가 콩콩 뛰었어요.\n다람쥐도 콩콩 뛰었어요.\n하온이도 콩콩 뛰었어요.", 3).some((k) => RHYTHM.has(k)));
  });

  it("짧은 지문은 대사를 건너 이어 센다 — 대사 사이사이에 끼어도 뚝뚝 끊겨 들린다", () => {
    const text = '하온이가 상자를 열었어요.\n안에 인형이 있었어요.\n"우와!"\n하온이가 인형을 안았어요.\n인형이 참 따뜻했어요.';
    for (const age of [4, 5, 6, 7, 9]) assert.deepEqual(kinds(text, age), ["choppy"], `${age}세`);
  });

  it("2세 이하는 끊김을 보지 않는다 — 짧은 말 되풀이가 곧 리듬이다", () => {
    for (const text of [FOOD_TRUCK, "콩콩 뛰어요.\n콩콩 또 뛰어요.\n깡충 뛰어요.\n폴짝 뛰어요."]) {
      assert.ok(!kinds(text, 2).some((k) => RHYTHM.has(k)));
    }
  });

  it("이음말·쉼표로 잇고 끝말을 바꾼 판은 넘어간다", () => {
    for (const age of [5, 6, 7, 9]) assert.deepEqual(reviewPunctuation([{ text: FOOD_TRUCK_JOINED }], age), [], `${age}세`);
  });

  it("끝을 바꾸지 않고 '~었어요.'로만 이은 판도 넘어간다 — 대사를 사이에 둔 끝소리는 다시 센다", () => {
    // 09-30 검토: 말한 사람 문장('…물었어요.')이 대사마다 붙는 보통 쪽이 '같은 끝말'로 걸렸다.
    for (const age of [3, 4, 5, 6, 7, 9]) {
      assert.ok(!kinds(FOOD_TRUCK_JOINED_PLAIN, age).some((k) => RHYTHM.has(k)), `${age}세`);
      assert.ok(!kinds(FOOD_TRUCK_JOINED.replace("물었지요", "물었어요"), age).some((k) => RHYTHM.has(k)), `${age}세`);
    }
  });

  it("쉼표·이음이 있거나, 끝맺음이 다르거나, 느낌표·물음표로 끝나면 끊김 줄을 끊는다", () => {
    const breakers = [
      "그런데 문이 조금 열렸는데, 아무도 없었어요.", // 쉼표
      "하온이는 신발을 신고 나갔어요.", // 이음(-고)
      "바람이 참 시원했지요.", // 다른 끝맺음
      "우와, 정말 커요!", // 느낌표
    ];
    for (const middle of breakers) {
      const text = `하온이가 창밖을 봤어요.\n구름이 떠 있었어요.\n${middle}\n해가 반짝 떴어요.\n새가 날아갔어요.`;
      assert.ok(!kinds(text, 5).includes("choppy"), middle);
    }
  });

  it("여러 문장짜리 대사 가운데 문장은 지문으로 세지 않는다", () => {
    // speechSentences 는 따옴표 안 마침표에서도 끊는다 — 가운데 '나는 토끼야.'에는 따옴표가 없다.
    const text = '토끼가 깡충 뛰어왔어요.\n"안녕. 나는 토끼야. 반가워."\n하온이는 토끼 손을 꼭 잡았어요.';
    assert.ok(!kinds(text, 5).some((k) => RHYTHM.has(k)));
  });

  it("대사 뒤 '하고 외쳤어요' 토막은 대사의 꼬리라 지문으로 세지 않는다", () => {
    const text = '하온이가 문을 열었어요.\n"우와!" 하고 외쳤어요.\n"멋지다!" 하고 웃었어요.\n엄마도 따라 웃었어요.';
    assert.ok(!kinds(text, 5).includes("choppy"));
  });

  it("쉼표로 제 안에서 가락이 바뀌는 긴 문장은 같은 끝소리로 세지 않는다", () => {
    // 요즘 이야기의 보통 과거형 지문 — 쉼표 든 긴 문장이 사이사이에 끼면 '~었어요.'가 이어져도 괜찮다.
    const text =
      "하온이는 빨간 장화를 신고, 물웅덩이를 향해 힘차게 달려갔어요.\n" +
      "첨벙 소리와 함께 흙탕물이 사방으로 튀어 올랐어요.\n" +
      "옆에 있던 강아지도 신이 나서, 꼬리를 흔들며 뛰어들었어요.\n" +
      "둘은 한참 동안 빗속에서 웃으며 뛰어놀았어요.";
    assert.deepEqual(reviewPunctuation([{ text }], 7), []);
  });

  it("대사 없이 한 호흡짜리 지문이 같은 끝소리로 잇따르면 한 번만 짚는다 — '-지요'로 바꾸라고 하지 않는다", () => {
    const text =
      "하온이는 빨간 장화를 신고 물웅덩이로 달려갔어요.\n" +
      "첨벙 소리와 함께 흙탕물이 사방으로 튀어 올랐어요.\n" +
      "옆에 있던 강아지도 신이 나서 뛰어들었어요.\n" +
      "둘은 한참 동안 빗속에서 뛰어놀았어요.";
    const findings = reviewPunctuation([{ text }], 7);
    assert.deepEqual(findings.map((f) => f.kind), ["same-ending"]);
    assert.match(findings[0].message, /4번 잇따라요/);
    // 끝을 바꾸라는 말을 앞세우면 모델이 요즘 이야기에 -지요·-답니다를 뿌린다.
    assert.doesNotMatch(findings[0].message, /끝맺는 말을 바꾸/);
    assert.match(findings[0].message, /이음말로 잇거나/);
  });

  it("쪽마다 따로 센다 — 쪽을 넘어 이어 세지 않는다", () => {
    const pages = [{ text: "문이 열렸어요.\n하온이가 들어갔어요." }, { text: "방이 컸어요.\n창문이 밝았어요." }];
    assert.ok(!reviewPunctuation(pages, 5).some((f) => RHYTHM.has(f.kind)));
  });

  it("눈금 — 전래·명작은 끊김으로 거의 안 걸린다(쪽의 3% 이하)", () => {
    const curated = curatedPages().map((text) => ({ text }));
    for (const age of [3, 4, 5, 6, 7, 9]) {
      const pages = new Set(reviewPunctuation(curated, age).filter((f) => RHYTHM.has(f.kind)).map((f) => f.page));
      assert.ok(pages.size <= curated.length * 0.03, `${age}세 ${pages.size}/${curated.length}쪽`);
    }
  });
});

describe("대본 프롬프트 — 읽는 리듬 블록(anthropic.ts)", () => {
  // anthropic.ts 는 SDK·@/ 별칭을 불러 node --test 로 못 읽는다 — 글로 읽어 규칙이 남아 있는지만 본다.
  const source = fs.readFileSync(new URL("./anthropic.ts", import.meta.url), "utf8");
  const start = source.indexOf("## 읽는 리듬과 문장부호");
  const block = source.slice(start, source.indexOf("@@CHARACTER@@에는", start));

  it("블록이 있고, 잇기·끊김·끝말·말한 사람 규칙을 담는다", () => {
    assert.ok(start > 0);
    assert.match(block, /이어지는 일은 한 문장으로 잇는다/);
    assert.match(block, /짧고 밋밋한 지문을 줄줄이 세우지 않는다/);
    assert.match(block, /사이에 대사가 끼어도 지문끼리 이어 센다/);
    assert.match(block, /가락은 끝말보다 문장의 모양으로 바꾼다/);
    assert.match(block, /움직임과 한 문장으로 묶는다/);
    assert.match(block, /모든 문장은 끝 부호로 닫는다/);
    assert.match(block, /긴 앞말 뒤/);
  });

  it("나이마다 다른 숫자는 블록에 두지 않고 쪽당 분량 줄을 따르게 한다 — 2·3세 줄과 부딪히지 않게", () => {
    // 블록은 모든 나이에 간다. '세 번'을 박아 두면 3세 줄("세 개까지만")·2세 줄("이어 붙이지 않고")과 어긋난다.
    assert.doesNotMatch(block, /(?<!두)세 번|둘 이어졌으면/); // "두세 번"은 책 전체 상한(-지요·-답니다)이라 괜찮다
    assert.match(block, /이 블록과 어긋나면 그 줄을 따른다/);
    assert.match(block, /가장 어린\s*나이는 짧은 문장과 같은 말 되풀이가 곧 리듬이다/);
  });

  it("-지요·-답니다는 쪽마다가 아니라 책 전체의 상한이고, 마지막 문장에는 쓰지 않는다", () => {
    // "한 쪽에 한 번쯤"은 할당량으로 읽혀 쪽마다 '…답니다'로 닫는 옛날이야기 말투가 된다.
    assert.doesNotMatch(block, /한 쪽에 한 번쯤/);
    assert.match(block, /-지요·-답니다는 책 전체에서 두세 번까지만/);
    assert.match(block, /마지막 쪽의 마지막 문장에는 쓰지 않는다/);
  });

  it("말한 사람의 몸짓을 낱말로 들지 않는다 — 푸드트럭 쪽의 말(다가와·웃으며)이 그대로 베껴진다", () => {
    assert.doesNotMatch(block, /다가오기|웃기|고개 들기/);
  });

  it("베낄 수 있는 예문을 넣지 않는다 — 09-29 판의 (O) 예문 모양이 그대로 베껴졌다", () => {
    assert.doesNotMatch(block, /\(O\)|\(X\)/);
    // 따옴표로 감싼 해요체 문장("…요." 꼴)이 없어야 한다.
    assert.doesNotMatch(block, /"[^"\n]*[가-힣]요[.!?]?"/);
  });

  it("09-29 판의 '짧게 끊어라' 말이 남아 있지 않다", () => {
    assert.doesNotMatch(block, /한 문장에는 한 가지 일만/);
    assert.doesNotMatch(block, /짧은 문장을 섞는다/);
    assert.doesNotMatch(source, /문장 수를 약 1\.5배로 늘려/);
  });
});

describe("speechSentences", () => {
  it("대사 안의 마침표·말줄임표에서도 끊는다(합성기가 거기서 쉰다)", () => {
    assert.deepEqual(speechSentences('책 속 피노키오가 말했어요. "사실 나는… 걱정했어."'), [
      "책 속 피노키오가 말했어요.",
      '"사실 나는…',
      '걱정했어."',
    ]);
  });
});

describe("breathForSpeech — 합성에 보낼 글에만 쉼표", () => {
  it("긴 숨에서 분명한 이음 뒤에 쉼표를 넣는다", () => {
    assert.equal(
      breathForSpeech("하온이는 같이 보고 싶은데 무슨 말을 해야 할지 몰라 손끝만 꼼지락거려요."),
      "하온이는 같이 보고 싶은데, 무슨 말을 해야 할지 몰라 손끝만 꼼지락거려요.",
    );
    assert.equal(
      breathForSpeech("하온이가 피노키오 책을 펼치자 고래 뱃속 그림에 동글동글한 물방울이 가득했어요."),
      "하온이가 피노키오 책을 펼치자, 고래 뱃속 그림에 동글동글한 물방울이 가득했어요.",
    );
  });

  it("합성용 숨은 20자에서 그대로다 — 글쓰기 눈금(4·5세 숨 22자)을 넓혀도 소리는 숨을 덜 쉬지 않는다", () => {
    // 21·22자 숨 — 글 검사로는 5세에 넘어가지만, 합성할 때는 여전히 이음 뒤에서 숨을 쉰다.
    assert.equal(breathLimits(5).breath, 22);
    assert.equal(breathForSpeech("하온이는 놀이터에 나가면서 비눗방울을 불었어요."), "하온이는 놀이터에 나가면서, 비눗방울을 불었어요.");
    assert.equal(
      breathForSpeech("하온이는 큰 놀이터에 나가면서 비눗방울을 불었어요."),
      "하온이는 큰 놀이터에 나가면서, 비눗방울을 불었어요.",
    );
  });

  it("긴 문장을 여는 말 뒤에 숨을 준다", () => {
    assert.equal(
      breathForSpeech("그때 책 한 권이 스르륵 굴러와 하온이 발밑에 멈춰요."),
      "그때, 책 한 권이 스르륵 굴러와 하온이 발밑에 멈춰요.",
    );
  });

  it("짧은 문장은 그대로 둔다", () => {
    for (const text of ["그때 문이 열렸어요.", "무서웠지만 참았어요.", "하온이는 놀고 싶은데 졸려요."]) {
      assert.equal(breathForSpeech(text), text);
    }
  });

  it("되풀이한 소리말 사이에 박자를 준다 — '옛날 옛날'은 소리말이 아니다", () => {
    assert.equal(breathForSpeech("빗방울이 톡 톡 톡 떨어졌어요."), "빗방울이 톡, 톡, 톡 떨어졌어요.");
    assert.equal(breathForSpeech("콩콩 콩콩 뛰었어요."), "콩콩, 콩콩 뛰었어요.");
    assert.equal(breathForSpeech("옛날 옛날, 토끼가 살았어요."), "옛날 옛날, 토끼가 살았어요.");
  });

  it("헷갈리는 낱말(… 만, 이름씨)에는 넣지 않는다", () => {
    const text = "하온이는 바지만 입고 강아지만 데리고 편지만 들고 아기사자처럼 뛰어나갔어요.";
    assert.doesNotMatch(breathForSpeech(text), /바지만,|강아지만,|편지만,/);
  });

  it("서술어 바로 앞·'어느 날 아침'·'-지만/-자'로 끝나는 이름씨에는 넣지 않는다", () => {
    for (const text of [
      // "흐느끼며 말했어요"는 어떻게 말했는지를 이르는 한 덩어리 — 지문으로 싣는 감정이 끊기면 안 된다.
      "어머니는 빈 광주리를 꼭 끌어안고 흐느끼며 말했어요.",
      "어느 날 아침 하온이는 일찍 일어나서 창문을 열고 밖을 내다보았어요.",
    ]) {
      assert.equal(breathForSpeech(text), text);
    }
    assert.doesNotMatch(breathForSpeech("하온이는 쪽지만 들고 딱지만 챙겨서 친구네 집으로 달려갔어요."), /쪽지만,|딱지만,/);
    assert.doesNotMatch(breathForSpeech("지휘자 아저씨가 막대를 들고 음악대 앞에 서서 인사를 했어요."), /지휘자,/);
    // 뒤에 낱말이 여럿 남으면 여전히 넣는다.
    assert.equal(
      breathForSpeech("하온이는 눈물을 닦으며 엄마 품에 꼭 안겨 한참을 울었어요."),
      "하온이는 눈물을 닦으며, 엄마 품에 꼭 안겨 한참을 울었어요.",
    );
  });

  it("부호 없이 줄만 바꾼 자리에 쉼표를 붙인다(breathe 와 같다)", () => {
    assert.equal(breathForSpeech("농부는 일하러 가는 척하고\n돌아와 숨었어요."), "농부는 일하러 가는 척하고,\n돌아와 숨었어요.");
  });

  it("글자는 한 자도 안 바꾸고 쉼표만 더한다", () => {
    for (const text of [...curatedPages(), ...GENERATED]) {
      const spoken = breathForSpeech(text);
      assert.equal(letters(spoken), letters(text.normalize("NFC")));
      assert.equal(spoken.replace(/,/g, ""), text.normalize("NFC").replace(/,/g, ""));
    }
  });
});
