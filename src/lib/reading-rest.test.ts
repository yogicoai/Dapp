import test from "node:test";
import assert from "node:assert/strict";
import { continuesByWord, continuesSentence, restAfter } from "./reading-rest.ts";
import { splitDialogue } from "./speaker-tone.ts";

/*
 * 조각 글에는 줄바꿈이 붙어 있다 — 앞 조각 끝에 붙기도 하고 다음 조각 앞에 붙기도 한다.
 * 줄바꿈이 곧 '문장이 끝났다'는 표시라, 시험 자료도 실제 조각처럼 줄바꿈을 넣는다.
 */
const nar = (text: string) => ({ text, who: "narration" });
const who = (text: string, w: string) => ({ text, who: w });
/** 다음 조각 — 새 줄에서 시작한다(문장이 끝났다는 뜻). */
const nextLine = (w = "narration") => ({ text: "\n다음 문장이에요.", who: w });

test("restAfter — 문장이 끝났을 때, 끝맺음 부호마다 쉬는 길이가 다르다", async (t) => {
  await t.test("아무 부호도 없으면 기본 숨만", () => {
    assert.equal(restAfter(nar("호랑이가 나타났어요\n"), nextLine()), 260);
  });

  await t.test("마침표가 느낌표보다 짧고, 느낌표가 말줄임표보다 짧다", () => {
    const dot = restAfter(nar("말았어요.\n"), nextLine());
    const bang = restAfter(nar("잡아먹어야겠다!\n"), nextLine());
    const trail = restAfter(nar("줄 떡이 없어요…\n"), nextLine());
    assert.ok(dot < bang, `${dot} < ${bang}`);
    assert.ok(bang < trail, `${bang} < ${trail}`);
  });

  await t.test("물음표도 느낌표와 같은 대우", () => {
    assert.equal(
      restAfter(nar("어디 있니?\n"), nextLine()),
      restAfter(nar("어디 있다!\n"), nextLine()),
    );
  });

  await t.test("점 세 개로 쓴 말줄임표도 …과 같게 본다", () => {
    assert.equal(
      restAfter(nar("글쎄...\n"), nextLine()),
      restAfter(nar("글쎄…\n"), nextLine()),
    );
  });

  await t.test("줄바꿈이 다음 조각 앞에 붙어 있어도 똑같이 본다", () => {
    assert.equal(
      restAfter(nar("말았어요."), { text: "\n다음", who: "narration" }),
      restAfter(nar("말았어요.\n"), nextLine()),
    );
  });
});

test("restAfter — 따옴표에 가려진 부호를 찾아낸다", () => {
  // 조각 글은 따옴표째 들어온다. 그대로 보면 마지막 글자가 따옴표라 규칙에 안 걸린다.
  assert.equal(
    restAfter(nar('"이제 더 이상 줄 떡이 없어요…"\n'), nextLine()),
    restAfter(nar("없어요…\n"), nextLine()),
  );
});

test("restAfter — 한 문장이 이어지는 중이면 거의 쉬지 않는다", async (t) => {
  // 따옴표 때문에 문장 한가운데가 잘리는 자리("안 돼!" 하고 외쳤어요).
  // 여기서 느낌표만큼 쉬면 한 문장이 두 문장처럼 들린다.
  await t.test("줄이 안 바뀌면 부호가 세도 짧게 쉰다", () => {
    const midSentence = restAfter(who('"안 돼!"', "boy"), who(" 하고 외쳤어요.\n", "narration"));
    const endOfLine = restAfter(who('"안 돼!"\n', "boy"), nextLine());
    assert.ok(midSentence < endOfLine, `${midSentence} < ${endOfLine}`);
    assert.equal(midSentence, 150); // 90 + 말하는 사람 바뀜 60
  });

  await t.test("같은 사람이 이어 읽으면 더 짧다", () => {
    assert.equal(restAfter(nar("그 고개를 "), nar("'삼년 고개'라고 불렀지요.\n")), 120);
  });
});

test("restAfter — 말하는 사람이 바뀌면 더 쉰다", () => {
  const same = restAfter(who("잡아먹어야겠다!\n", "tiger"), nextLine("tiger"));
  const changed = restAfter(who("잡아먹어야겠다!\n", "tiger"), nextLine("narration"));
  assert.equal(changed - same, 220);
});

test("restAfter — 쪽의 마지막 조각은 쪽 넘김만큼 쉰다", async (t) => {
  await t.test("다음 조각이 없으면 900ms 이상", () => {
    assert.ok(restAfter(nar("말았어요."), null) >= 900);
  });

  await t.test("끝맺음이 약해도 쪽 넘김 쉼이 이긴다", () => {
    assert.equal(restAfter(nar("부호 없음"), null), restAfter(nar("말았어요."), null));
  });

  await t.test("줄바꿈이 없어도 마지막 조각은 쪽 넘김으로 본다", () => {
    // 쪽의 끝은 문장의 끝이다 — '이어지는 중' 규칙에 걸리면 안 된다.
    assert.ok(restAfter(nar("불렀어요."), null) >= 900);
  });
});

test("restAfter — 재생 속도에 따라 같이 줄고 는다", async (t) => {
  await t.test("빠르게 들으면 쉼도 짧아진다", () => {
    const normal = restAfter(nar("말았어요.\n"), nextLine(), 1);
    const fast = restAfter(nar("말았어요.\n"), nextLine(), 1.5);
    assert.ok(fast < normal, `${fast} < ${normal}`);
    assert.equal(fast, Math.round(normal / 1.5));
  });

  await t.test("느리게 들으면 쉼도 길어진다", () => {
    const normal = restAfter(nar("말았어요.\n"), nextLine(), 1);
    assert.ok(restAfter(nar("말았어요.\n"), nextLine(), 0.8) > normal);
  });

  await t.test("아무리 빨라도 최소 120ms 는 쉰다", () => {
    assert.equal(restAfter(nar("부호 없음\n"), nextLine(), 100), 120);
  });

  await t.test("아무리 느려도 1400ms 를 넘지 않는다", () => {
    assert.equal(restAfter(nar("말았어요."), null, 0.01), 1400);
  });

  await t.test("속도를 0이나 음수로 줘도 죽지 않는다", () => {
    assert.equal(
      restAfter(nar("말았어요.\n"), nextLine(), 0),
      restAfter(nar("말았어요.\n"), nextLine(), 1),
    );
  });
});

/*
 * 만든 동화는 한 쪽이 통째로 한 줄이다(2026-09 원고). 그래서 줄바꿈이 없는 자리에서도
 * 끝맺음 부호가 있으면 문장이 끝난 것으로 봐야 한다 — 예전엔 모든 경계가 0.15초였다.
 */
test("restAfter — 줄이 안 바뀌어도 끝맺음 부호 뒤 새 문장이면 문장 끝만큼 쉰다", async (t) => {
  await t.test("마침표 뒤에 대사가 오면 줄바꿈이 있을 때와 같다", () => {
    const sameLine = restAfter(nar("하온이가 눈을 크게 뜨고 소리쳐요. "), who('"우와, 비눗방울 같아!"', "dialogue"));
    const lineBreak = restAfter(nar("하온이가 눈을 크게 뜨고 소리쳐요.\n"), who('"우와, 비눗방울 같아!"', "dialogue"));
    assert.equal(sameLine, lineBreak);
    assert.equal(sameLine, 560); // 마침표 340 + 말하는 사람 바뀜 220
  });

  await t.test("대사가 끝나고 새 문장이 오면 느낌표만큼 쉰다", () => {
    assert.equal(restAfter(who('"잡았다!"', "dialogue"), nar(" 하온이가 소리치며 깔깔 웃었어요.")), 680);
  });

  await t.test("'하고·라고·라며'로 이어지면 여전히 한 문장이다", () => {
    assert.equal(restAfter(who('"안 돼!"', "boy"), nar(" 하고 외쳤어요.")), 150);
    assert.equal(restAfter(who('"좋아!"', "boy"), nar("라며 웃었어요.")), 150);
    assert.equal(restAfter(who('"우와!"', "boy"), nar(" 소리쳤어요.")), 150);
  });

  await t.test("이름이나 낱말이 '하'·'고'로 시작해도 새 문장이다", () => {
    // '하온이가'·'하니가'(이름), '고양이가' — 잇는 말(하고·고)로 잘못 보면 붙여 읽는다.
    assert.equal(restAfter(who('"와!"', "boy"), nar(" 하온이가 웃었어요.")), 680);
    assert.equal(restAfter(who('"와!"', "boy"), nar(" 하니가 웃었어요.")), 680);
    assert.equal(restAfter(who('"야옹!"', "cat"), nar(" 고양이가 울었어요.")), 680);
  });

  await t.test("부호 없이 끊긴 자리는 예전처럼 거의 쉬지 않는다", () => {
    assert.equal(restAfter(nar("하온이는 "), who('"같이 놀자!"', "dialogue")), 150);
  });
});

test("continuesSentence — 앞 문장을 잇는 말만 골라낸다", () => {
  for (const text of [" 하고 외쳤어요.", "하고 외쳤어요", "라고 말했어요.", "라며 웃었어요.", "고 했어요.", " 하며 뛰어갔어요.", " 말했어요.", " 속삭였어요."]) {
    assert.equal(continuesSentence(text), true, text);
  }
  // '하고는·하고서·하는데·하길래·면서'도 대사를 잇는다(검토 2026-09-29).
  for (const text of [" 하고는 하온이가 숟가락을 들었어요.", " 하고서 뛰어갔어요.", " 하고선 웃었어요.", " 하는데 문이 열렸어요.", " 하길래 돌아봤어요.", "면서 웃었어요.", "라면서 웃었어요.", " 대답했어요.", " 중얼거렸어요."]) {
    assert.equal(continuesSentence(text), true, text);
  }
  for (const text of [" 하온이가 웃었어요.", " 하니가 말했어요.", " 고양이가 울었어요.", " 라온이는 웃었어요.", "\n하온이는 웃었어요.", " 한 마리 새가 날아왔어요.", " 하고은이가 웃었어요.", " 면사포를 썼어요."]) {
    assert.equal(continuesSentence(text), false, text);
  }
  // '대답 대신'·'중얼중얼'은 말하는 움직임이 아니라 새 문장의 첫머리다.
  for (const text of [" 대답 대신 토끼가 웃었어요.", " 중얼중얼 자장가를 불렀어요."]) {
    assert.equal(continuesSentence(text), false, text);
  }
});

test("continuesByWord — 말하는 움직임은 빼고 잇는 말 낱말만 본다", () => {
  assert.equal(continuesByWord(" 하고 불렀어요."), true);
  assert.equal(continuesByWord(" 라고 말했어요."), true);
  assert.equal(continuesByWord(" 말하는 앵무새가 날아왔어요."), false);
  assert.equal(continuesByWord(" 대답했어요."), false);
});

test("restAfter — '하고는'으로 이어지는 대사 뒤는 문장 한가운데라 거의 쉬지 않는다", () => {
  assert.equal(restAfter(who('"잘 먹겠습니다!"', "boy"), nar(" 하고는 하온이가 숟가락을 들었어요.")), 150);
  assert.equal(restAfter(who('"같이 가자!"', "boy"), nar("면서 손을 내밀었어요.")), 150);
  assert.equal(restAfter(who('"고마워!"', "boy"), nar(" 대답 대신 토끼가 웃었어요.")), 680);
});

test("restAfter — 실제로 만든 동화 한 쪽의 조각 경계가 모두 문장 끝으로 쉰다", () => {
  const page =
    "그때 책 한 권이 스르륵 굴러와 하온이 발밑에 멈춰요. 피노키오가 고래 뱃속에 있는 그림이었는데, 동그란 물방울들이 도르르 반짝여요. 하온이가 눈을 크게 뜨고 소리쳐요. \"우와, 비눗방울 같아!\" 하온이는 손가락으로 물방울을 하나둘 세어 봐요.";
  const segs = splitDialogue(page).map((s) => ({ text: s.text, who: s.dialogue ? "dialogue" : "narration" }));
  assert.equal(segs.length, 3);
  const rests = segs.slice(0, -1).map((s, i) => restAfter(s, segs[i + 1]));
  assert.deepEqual(rests, [560, 680]); // 예전엔 [150, 150]
});
