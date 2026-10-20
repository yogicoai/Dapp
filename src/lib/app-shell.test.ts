import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { ANDROID_START_URL, detectAppShell } from "./app-shell.ts";

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
