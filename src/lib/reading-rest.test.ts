import test from "node:test";
import assert from "node:assert/strict";
import { restAfter } from "./reading-rest.ts";

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
