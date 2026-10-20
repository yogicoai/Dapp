import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ANON_TTS_CHARS_PER_HOUR, MEMBER_TTS_CHARS_PER_HOUR, TTS_WINDOW_MS, clientIpOf, takeChars, type CharBook } from "./tts-guard.ts";

describe("성우 음성 시간당 글자 수 상한(10-20 보안 점검)", () => {
  it("상한까지는 받고, 넘는 요청은 셈에 더하지 않고 거절한다", () => {
    const book: CharBook = new Map();
    assert.equal(takeChars(book, "ip:1", 300, 1000, 0), true);
    assert.equal(takeChars(book, "ip:1", 600, 1000, 10), true);
    assert.equal(takeChars(book, "ip:1", 200, 1000, 20), false);
    assert.equal(book.get("ip:1")?.used, 900);
    assert.equal(takeChars(book, "ip:1", 100, 1000, 30), true);
  });

  it("한 시간이 지나면 새로 센다 · 사람(열쇠)마다 따로 센다", () => {
    const book: CharBook = new Map();
    assert.equal(takeChars(book, "ip:1", 1000, 1000, 0), true);
    assert.equal(takeChars(book, "ip:1", 1, 1000, 5), false);
    assert.equal(takeChars(book, "ip:2", 1000, 1000, 5), true);
    assert.equal(takeChars(book, "ip:1", 500, 1000, TTS_WINDOW_MS), true);
  });

  it("한 번에 상한보다 긴 글은 거절", () => {
    assert.equal(takeChars(new Map(), "ip:1", 1001, 1000, 0), false);
  });

  it("회원 상한이 비회원보다 넉넉하고, 둘 다 한 번에 받는 최대(500자)보다 크다", () => {
    assert.ok(MEMBER_TTS_CHARS_PER_HOUR > ANON_TTS_CHARS_PER_HOUR);
    assert.ok(ANON_TTS_CHARS_PER_HOUR > 500);
  });

  it("IP — x-forwarded-for 맨 앞, 없으면 x-real-ip, 그것도 없으면 unknown", () => {
    assert.equal(clientIpOf(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" })), "1.2.3.4");
    assert.equal(clientIpOf(new Headers({ "x-real-ip": "5.6.7.8" })), "5.6.7.8");
    assert.equal(clientIpOf(new Headers()), "unknown");
  });

  it("/api/tts 가 앱 성우 목록·글자 수 상한을 쓴다", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../app/api/tts/route.ts", import.meta.url), "utf8");
    assert.ok(src.includes("TYPECAST_VOICES"));
    assert.ok(src.includes("takeChars("));
  });
});
