import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

/*
 * 동화 이어서 듣기 — 설정 저장과 '열리자마자 읽어 줘' 쪽지.
 * 브라우저 저장소를 흉내 낸다(이 파일은 따로 도는 프로세스라 다른 테스트에 번지지 않는다).
 */
function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}
const g = globalThis as unknown as { window: { localStorage: Storage; sessionStorage: Storage } };
g.window = { localStorage: fakeStorage(), sessionStorage: fakeStorage() };

const { loadAutoNext, saveAutoNext, markAutoplayNext, hasAutoplayNext, takeAutoplayNext } = await import(
  "./prefs.ts"
);
const { rememberUid } = await import("./supabase.ts");

describe("동화 이어서 듣기 설정", () => {
  beforeEach(() => {
    g.window.localStorage.clear();
    g.window.sessionStorage.clear();
  });

  it("기본은 꺼져 있다 — 켜 두면 서가 끝까지 이어지므로 부모가 골라서 켠다", () => {
    assert.equal(loadAutoNext(), false);
  });

  it("켜고 끈 값이 남는다", () => {
    saveAutoNext(true);
    assert.equal(loadAutoNext(), true);
    saveAutoNext(false);
    assert.equal(loadAutoNext(), false);
  });

  /*
   * 한 기기를 여러 아이디가 나눠 쓴다 — 엄마 아이디로 켜 둔 이어서 틀기가
   * 아이 아이디로 들어갔을 때 따라가면 안 된다. 계정별로 갈라지는지 못 박아 둔다.
   * (계정에 남기는 것은 supabase profiles.auto_next 가 맡고, 여기서는 기기 안 갈라짐만 본다.)
   */
  it("아이디마다 따로 남는다 — 앞 계정 설정이 뒤 계정에 보이지 않는다", () => {
    rememberUid("mom-uid");
    saveAutoNext(true);
    assert.equal(loadAutoNext(), true);

    rememberUid("kid-uid");
    assert.equal(loadAutoNext(), false, "다른 아이디에서는 꺼진 채로 시작해야 한다");
    saveAutoNext(true);

    rememberUid("mom-uid");
    assert.equal(loadAutoNext(), true, "앞 계정 값은 그대로 남아 있어야 한다");
    rememberUid(null);
  });

  it("로그아웃해도 그 계정 값은 지워지지 않는다 — 다시 들어오면 켜 둔 대로", () => {
    rememberUid("mom-uid");
    saveAutoNext(true);
    rememberUid(null); // 로그아웃
    assert.equal(loadAutoNext(), false, "비회원은 기기 공용 키를 본다");
    rememberUid("mom-uid"); // 재로그인
    assert.equal(loadAutoNext(), true);
    rememberUid(null);
  });
});

describe("열리자마자 읽어 줘 쪽지", () => {
  beforeEach(() => g.window.sessionStorage.clear());

  it("넘겨준 그 책에서만 읽힌다", () => {
    markAutoplayNext("classic-gulliver2");
    assert.equal(hasAutoplayNext("classic-mermaid"), false);
    assert.equal(hasAutoplayNext("classic-gulliver2"), true);
  });

  it("들여다보기만 해서는 지워지지 않는다 — 개발 모드에서 효과가 두 번 돌아도 살아남게", () => {
    markAutoplayNext("folk-gotgam");
    assert.equal(hasAutoplayNext("folk-gotgam"), true);
    assert.equal(hasAutoplayNext("folk-gotgam"), true);
  });

  it("가져가면 지워진다 — 새로고침·뒤로 가기로 다시 열 때 저절로 소리 나지 않게", () => {
    markAutoplayNext("folk-gotgam");
    assert.equal(takeAutoplayNext("folk-gotgam"), true);
    assert.equal(takeAutoplayNext("folk-gotgam"), false);
    assert.equal(hasAutoplayNext("folk-gotgam"), false);
  });

  it("다른 책을 가리키는 쪽지는 가져가지 않는다", () => {
    markAutoplayNext("folk-ureong");
    assert.equal(takeAutoplayNext("folk-gotgam"), false);
    assert.equal(hasAutoplayNext("folk-ureong"), true);
  });
});
