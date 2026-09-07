import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { mergeRemoteChild, parentLooksToPrompt } from "./prefs.ts";

const BASE = { name: "하온", age: 5, gender: "girl" as const };

describe("mergeRemoteChild — 서버 값과 이 기기 값 합치기", () => {
  it("서버에 아이 특징이 없으면 이 기기 것을 지킨다", () => {
    const local = { ...BASE, looks: { hair: "단발" } };
    const out = mergeRemoteChild({ ...BASE }, local);
    assert.deepEqual(out.looks, { hair: "단발" });
  });

  it("서버에 엄마·아빠 특징이 없으면 이 기기 것을 지킨다 — 이게 사라지던 문제였다", () => {
    const local = { ...BASE, parents: { mom: { hair: "긴 머리" }, dad: { glasses: true } } };
    const out = mergeRemoteChild({ ...BASE }, local);
    assert.deepEqual(out.parents, { mom: { hair: "긴 머리" }, dad: { glasses: true } });
  });

  it("서버에 값이 있으면 서버가 이긴다 — 다른 기기에서 고친 게 반영되게", () => {
    const local = { ...BASE, looks: { hair: "단발" }, parents: { mom: { hair: "긴 머리" } } };
    const remote = { ...BASE, looks: { hair: "짧은 머리" }, parents: { dad: { color: "파랑" } } };
    const out = mergeRemoteChild(remote, local);
    assert.deepEqual(out.looks, { hair: "짧은 머리" });
    assert.deepEqual(out.parents, { dad: { color: "파랑" } });
  });

  it("이름·나이·성별은 서버 값을 그대로 쓴다", () => {
    const out = mergeRemoteChild({ name: "서준", age: 7, gender: "boy" }, { ...BASE });
    assert.equal(out.name, "서준");
    assert.equal(out.age, 7);
    assert.equal(out.gender, "boy");
  });

  it("이 기기에 아무것도 없어도 터지지 않는다", () => {
    const out = mergeRemoteChild({ ...BASE, looks: { hair: "곱슬" } }, null);
    assert.deepEqual(out.looks, { hair: "곱슬" });
    assert.equal(out.parents, undefined);
  });
});

describe("parentLooksToPrompt — 엄마·아빠 한 줄", () => {
  it("고른 것만 잇는다", () => {
    const out = parentLooksToPrompt({ hair: "긴 머리", glasses: true, color: "파랑" });
    assert.ok(out.includes("긴 머리"), out);
    assert.ok(out.includes("안경"), out);
    assert.ok(out.includes("파랑"), out);
  });

  it("아예 안 적었으면 빈 줄", () => {
    assert.equal(parentLooksToPrompt(undefined), "");
  });

  it("안경 얘기는 늘 넣는다 — 안 넣으면 모델이 없는 안경을 씌운다", () => {
    assert.equal(parentLooksToPrompt({}), "안경을 쓰지 않는다");
    assert.ok(parentLooksToPrompt({ hair: "짧은 머리" }).includes("안경을 쓰지 않는다"));
  });
});

describe("saveChild — 안 넘긴 항목은 그대로 둔다", () => {
  /** 브라우저 저장소 흉내 — node 에서 돌리려고 아주 작게 만든다. */
  function stubWindow() {
    const store = new Map<string, string>();
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    };
    return store;
  }

  it("이름·나이만 바꿔도 아이 특징과 엄마·아빠 특징이 살아남는다", async () => {
    const store = stubWindow();
    const { saveChild, loadChild } = await import("./prefs.ts");
    saveChild({ name: "하온", age: 5, gender: "girl", looks: { hair: "단발" }, parents: { mom: { hair: "긴 머리" } } });
    // 만들기에서 줄거리 지을 때처럼 이름·나이·성별만 넘긴다 — 예전엔 여기서 다 지워졌다.
    saveChild({ name: "하온", age: 6, gender: "girl" });
    const out = loadChild();
    assert.equal(out?.age, 6);
    // (저장을 거치면 안 고른 칸이 undefined 로 채워지므로 고른 값만 본다.)
    assert.equal(out?.looks?.hair, "단발");
    assert.equal(out?.parents?.mom?.hair, "긴 머리");
    assert.ok(store.size > 0);
  });

  it("빈 값을 대놓고 넘기면 지워진다 — 설정에서 '특징 비우기'가 그대로 동작하게", async () => {
    stubWindow();
    const { saveChild, loadChild } = await import("./prefs.ts");
    saveChild({ name: "하온", age: 5, gender: "girl", looks: { hair: "단발" } });
    saveChild({ name: "하온", age: 5, gender: "girl", looks: {} });
    assert.equal(loadChild()?.looks, undefined);
  });
});
