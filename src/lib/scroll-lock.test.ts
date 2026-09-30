import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { lockScroll } from "./scroll-lock.ts";

/** 브라우저 흉내 — 몸통·html 모양과 스크롤 자리만 */
function fakeBrowser(y = 120, path = "/family") {
  const body = { style: { position: "", top: "", left: "", right: "", width: "", overflow: "auto" } };
  const html = { style: { overflow: "", overscrollBehavior: "", scrollBehavior: "smooth" } };
  const scrolled: number[] = [];
  const win = { scrollY: y, location: { pathname: path }, scrollTo: (_x: number, to: number) => scrolled.push(to) };
  const g = globalThis as unknown as Record<string, unknown>;
  g.document = { body, documentElement: html };
  g.window = win;
  return { body: body.style, html: html.style, scrolled, win };
}

function cleanup() {
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.document;
  delete g.window;
}

describe("팝업 뒤 화면 잠금(lockScroll)", () => {
  it("잠그면 몸통을 그 자리에 고정하고, 풀면 원래 모양과 스크롤 자리로 되돌린다", () => {
    const b = fakeBrowser(120);
    const release = lockScroll();
    assert.equal(b.body.position, "fixed");
    assert.equal(b.body.top, "-120px");
    assert.equal(b.body.overflow, "hidden");
    assert.equal(b.html.overflow, "hidden");
    release();
    assert.deepEqual(
      { ...b.body },
      { position: "", top: "", left: "", right: "", width: "", overflow: "auto" },
    );
    assert.equal(b.html.overflow, "");
    assert.equal(b.html.scrollBehavior, "smooth");
    assert.deepEqual(b.scrolled, [120]);
    cleanup();
  });

  it("겹친 팝업 — 마지막 것이 닫힐 때만 풀고, 같은 풀기를 두 번 불러도 한 번만 센다", () => {
    const b = fakeBrowser(40);
    const a = lockScroll();
    const c = lockScroll();
    a();
    a();
    assert.equal(b.body.position, "fixed", "하나가 아직 떠 있으면 잠긴 채");
    assert.deepEqual(b.scrolled, []);
    c();
    assert.equal(b.body.position, "");
    assert.equal(b.body.overflow, "auto");
    assert.deepEqual(b.scrolled, [40]);
    cleanup();
  });

  it("팝업이 열린 채 다른 페이지로 넘어갔으면 모양만 되돌리고 스크롤 자리는 건드리지 않는다", () => {
    const b = fakeBrowser(300, "/family");
    const release = lockScroll();
    b.win.location.pathname = "/plans";
    release();
    assert.equal(b.body.position, "");
    assert.deepEqual(b.scrolled, []);
    cleanup();
  });

  it("브라우저가 아니면(서버 그리기) 아무것도 안 하고 풀기도 탈이 없다", () => {
    cleanup();
    const release = lockScroll();
    assert.doesNotThrow(() => release());
  });
});
