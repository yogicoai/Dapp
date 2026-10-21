import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { ANDROID_START_URL, APP_INTRO_KEY, APP_SHELL_BOOT_SCRIPT, APP_SHELL_KEY, detectAppShell } from "./app-shell.ts";

describe("안드로이드 앱(TWA) 안인가 — 구글 플레이 정책상 앱 안에서는 웹 결제로 데려가지 않는다(2026-10-20)", () => {
  it("시작 주소 ?app=android · referrer android-app:// · 이번 실행에 기억한 값", () => {
    assert.equal(detectAppShell({ search: "?app=android" }), "android");
    assert.equal(detectAppShell({ search: "?utm=x&app=android" }), "android");
    assert.equal(detectAppShell({ referrer: "android-app://kr.yogico.voicestory/" }), "android");
    assert.equal(detectAppShell({ stored: "android" }), "android");
  });
  it("그 밖에는 웹", () => {
    assert.equal(detectAppShell({}), "web");
    assert.equal(detectAppShell({ search: "?app=ios" }), "web");
    assert.equal(detectAppShell({ search: "", referrer: "https://www.google.com/", stored: null }), "web");
    assert.equal(detectAppShell({ stored: "web" }), "web");
  });
  it("앱 시작 주소", () => {
    assert.equal(ANDROID_START_URL, "/?app=android");
    assert.equal(detectAppShell({ search: ANDROID_START_URL.slice(1) }), "android");
  });
  it("기억은 sessionStorage 에만 — localStorage 는 같은 기기의 크롬 브라우저와 같이 써서 웹까지 '앱 안'이 된다", () => {
    const src = readFileSync(new URL("./app-shell-client.ts", import.meta.url), "utf8");
    assert.ok(src.includes("sessionStorage"));
    assert.ok(!src.includes("localStorage"));
  });
  it("요금제·결제하기 화면이 앱 안에서는 웹 결제 단추를 감춘다", () => {
    const plans = readFileSync(new URL("../components/pay/PlansView.tsx", import.meta.url), "utf8");
    assert.ok(plans.includes('const demoPay = PAY_DEMO !== "off" && !inApp;'));
    assert.ok(!plans.includes('PAY_DEMO === "off" ?'), "결제 단추는 demoPay 로만 고른다");
    const checkout = readFileSync(new URL("../components/pay/CheckoutDemo.tsx", import.meta.url), "utf8");
    assert.ok(checkout.includes("if (inApp) {"));
    const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
    assert.ok(layout.includes("<AppShellMark />"));
  });
});

/** body 맨 앞 스크립트를 가짜 document·location·sessionStorage 로 돌려 본다 */
function boot(o: { search?: string; referrer?: string; store?: Record<string, string>; storageBroken?: boolean }) {
  const attrs: Record<string, string> = {};
  const store: Record<string, string> = { ...(o.store ?? {}) };
  const document = {
    documentElement: { setAttribute: (k: string, v: string) => void (attrs[k] = v) },
    referrer: o.referrer ?? "",
  };
  const sessionStorage = {
    getItem: (k: string) => {
      if (o.storageBroken) throw new Error("막힘");
      return k in store ? store[k] : null;
    },
    setItem: (k: string, v: string) => {
      if (o.storageBroken) throw new Error("막힘");
      store[k] = v;
    },
  };
  new Function("document", "location", "sessionStorage", APP_SHELL_BOOT_SCRIPT)(document, { search: o.search ?? "" }, sessionStorage);
  return { attrs, store };
}

describe("첫 그림 전 스크립트 — 앱 안이면 첫 그림부터 검게, 새로 켠 처음이면 '동화 나라로 이동 중'(2026-10-21)", () => {
  it("앱을 새로 켜면(시작 주소) 앱 안 + 소개 화면, 둘 다 이번 실행에 기억", () => {
    const { attrs, store } = boot({ search: "?app=android" });
    assert.equal(attrs["data-app-shell"], "android");
    assert.ok("data-app-intro" in attrs);
    assert.equal(store[APP_SHELL_KEY], "android");
    assert.equal(store[APP_INTRO_KEY], "1");
  });
  it("referrer android-app:// 로 열려도 새로 켠 것", () => {
    const { attrs } = boot({ referrer: "android-app://kr.yogico.voicestory/" });
    assert.equal(attrs["data-app-shell"], "android");
    assert.ok("data-app-intro" in attrs);
  });
  it("같은 실행에서 다시 불러오거나 화면을 옮기면 소개 화면은 다시 안 뜬다", () => {
    const reload = boot({ search: "?app=android", store: { [APP_SHELL_KEY]: "android", [APP_INTRO_KEY]: "1" } });
    assert.equal(reload.attrs["data-app-shell"], "android");
    assert.ok(!("data-app-intro" in reload.attrs));
    const moved = boot({ search: "", store: { [APP_SHELL_KEY]: "android" } });
    assert.equal(moved.attrs["data-app-shell"], "android");
    assert.ok(!("data-app-intro" in moved.attrs), "시작 주소가 아니면 새로 켠 게 아니다");
  });
  it("웹은 아무것도 달지 않는다", () => {
    assert.deepEqual(boot({}).attrs, {});
    assert.deepEqual(boot({ search: "?app=ios", referrer: "https://www.google.com/" }).attrs, {});
  });
  it("저장소가 막힌 브라우저도 시작 주소만으로 앱 안 + 소개 화면", () => {
    const { attrs } = boot({ search: "?app=android", storageBroken: true });
    assert.equal(attrs["data-app-shell"], "android");
    assert.ok("data-app-intro" in attrs);
  });
  it("앱 안 판단은 detectAppShell 과 같다", () => {
    const cases = [
      { search: "?app=android" },
      { search: "?utm=x&app=android" },
      { referrer: "android-app://kr.yogico.voicestory/" },
      { store: { [APP_SHELL_KEY]: "android" } },
      {},
      { search: "?app=ios" },
      { store: { [APP_SHELL_KEY]: "web" } },
    ];
    for (const c of cases) {
      const expected = detectAppShell({ search: c.search, referrer: c.referrer, stored: c.store?.[APP_SHELL_KEY] ?? null });
      assert.equal(boot(c).attrs["data-app-shell"] === "android" ? "android" : "web", expected, JSON.stringify(c));
    }
  });
  it("layout 이 body 맨 앞에 심고, 소개 화면을 단다", () => {
    const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
    assert.ok(layout.includes("__html: APP_SHELL_BOOT_SCRIPT"));
    assert.ok(layout.indexOf("APP_SHELL_BOOT_SCRIPT }}") < layout.indexOf("<ThemeProvider>"), "그림보다 먼저 돌아야 한다");
    assert.ok(layout.includes("<AppIntro />"));
  });
});
