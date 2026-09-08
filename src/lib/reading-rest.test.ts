import test from "node:test";
import assert from "node:assert/strict";
import { restAfter } from "./reading-rest.ts";

const nar = (text: string) => ({ text, who: "narration" });
const who = (text: string, w: string) => ({ text, who: w });

test("restAfter — 끝맺음 부호마다 쉬는 길이가 다르다", async (t) => {
  await t.test("아무 부호도 없으면 기본 숨만", () => {
    assert.equal(restAfter(nar("호랑이가 나타났어요"), nar("다음")), 260);
  });

  await t.test("마침표가 느낌표보다 짧고, 느낌표가 말줄임표보다 짧다", () => {
    const dot = restAfter(nar("말았어요."), nar("다음"));
    const bang = restAfter(nar("잡아먹어야겠다!"), nar("다음"));
    const trail = restAfter(nar("줄 떡이 없어요…"), nar("다음"));
    assert.ok(dot < bang, `${dot} < ${bang}`);
    assert.ok(bang < trail, `${bang} < ${trail}`);
  });

  await t.test("물음표도 느낌표와 같은 대우", () => {
    assert.equal(
      restAfter(nar("어디 있니?"), nar("다음")),
      restAfter(nar("어디 있다!"), nar("다음")),
    );
  });

  await t.test("점 세 개로 쓴 말줄임표도 …과 같게 본다", () => {
    assert.equal(restAfter(nar("글쎄..."), nar("다음")), restAfter(nar("글쎄…"), nar("다음")));
  });
});

test("restAfter — 따옴표와 줄바꿈에 가려진 부호를 찾아낸다", () => {
  // 조각 글은 따옴표째 들어온다. 그대로 보면 마지막 글자가 따옴표라 규칙에 안 걸린다.
  const bare = restAfter(nar("없어요…"), nar("다음"));
  const quoted = restAfter(nar('"이제 더 이상 줄 떡이 없어요…"\n'), nar("다음"));
  assert.equal(quoted, bare);
});

test("restAfter — 말하는 사람이 바뀌면 더 쉰다", () => {
  const same = restAfter(who("잡아먹어야겠다!", "tiger"), who("다음", "tiger"));
  const changed = restAfter(who("잡아먹어야겠다!", "tiger"), who("다음", "narration"));
  assert.equal(changed - same, 220);
});

test("restAfter — 쪽의 마지막 조각은 쪽 넘김만큼 쉰다", async (t) => {
  await t.test("다음 조각이 없으면 900ms 이상", () => {
    assert.ok(restAfter(nar("말았어요."), null) >= 900);
  });

  await t.test("끝맺음이 약해도 쪽 넘김 쉼이 이긴다", () => {
    assert.equal(restAfter(nar("부호 없음"), null), restAfter(nar("말았어요."), null));
  });
});

test("restAfter — 재생 속도에 따라 같이 줄고 는다", async (t) => {
  await t.test("빠르게 들으면 쉼도 짧아진다", () => {
    const normal = restAfter(nar("말았어요."), nar("다음"), 1);
    const fast = restAfter(nar("말았어요."), nar("다음"), 1.5);
    assert.ok(fast < normal, `${fast} < ${normal}`);
    assert.equal(fast, Math.round(normal / 1.5));
  });

  await t.test("느리게 들으면 쉼도 길어진다", () => {
    const normal = restAfter(nar("말았어요."), nar("다음"), 1);
    assert.ok(restAfter(nar("말았어요."), nar("다음"), 0.8) > normal);
  });

  await t.test("아무리 빨라도 최소 120ms 는 쉰다", () => {
    assert.equal(restAfter(nar("부호 없음"), nar("다음"), 100), 120);
  });

  await t.test("아무리 느려도 1400ms 를 넘지 않는다", () => {
    assert.equal(restAfter(nar("말았어요."), null, 0.01), 1400);
  });

  await t.test("속도를 0이나 음수로 줘도 죽지 않는다", () => {
    assert.equal(
      restAfter(nar("말았어요."), nar("다음"), 0),
      restAfter(nar("말았어요."), nar("다음"), 1),
    );
  });
});
