import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { assetLinksFor } from "./android-app.ts";

const FP = Array.from({ length: 32 }, (_, i) => (i * 7).toString(16).padStart(2, "0").toUpperCase()).join(":");

describe("안드로이드 앱 연결(assetlinks.json, 2026-10-20)", () => {
  it("패키지 이름 + 지문 → 한 줄", () => {
    assert.deepEqual(assetLinksFor("kr.yogico.voicestory", FP.toLowerCase()), [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: { namespace: "android_app", package_name: "kr.yogico.voicestory", sha256_cert_fingerprints: [FP] },
      },
    ]);
  });
  it("지문 여러 개(쉼표·빈칸) — 같은 것은 한 번, 틀린 것은 버린다", () => {
    const other = FP.replace(/^00/, "FF");
    const r = assetLinksFor("kr.yogico.voicestory", `${FP}, ${other} ,${FP}, nope`);
    assert.deepEqual(r[0].target.sha256_cert_fingerprints, [FP, other]);
  });
  it("값이 없거나 틀리면 빈 목록 — 사이트는 그대로 뜬다", () => {
    assert.deepEqual(assetLinksFor(undefined, FP), []);
    assert.deepEqual(assetLinksFor("voicestory", FP), []);
    assert.deepEqual(assetLinksFor("Kr.Yogico.App", FP), []);
    assert.deepEqual(assetLinksFor("kr.yogico.voicestory", ""), []);
    assert.deepEqual(assetLinksFor("kr.yogico.voicestory", "AB:CD"), []);
  });
  it("경로 파일이 있고 환경변수로 읽는다", () => {
    const src = readFileSync(new URL("../app/.well-known/assetlinks.json/route.ts", import.meta.url), "utf8");
    assert.ok(src.includes("process.env.ANDROID_PACKAGE_NAME"));
    assert.ok(src.includes("process.env.ANDROID_SHA256_CERT_FINGERPRINTS"));
  });
  it("앱 아이콘 — 매니페스트가 가리키는 파일이 모두 있다(마스커블 포함)", () => {
    const m = readFileSync(new URL("../app/manifest.ts", import.meta.url), "utf8");
    const srcs = [...m.matchAll(/src: "([^"]+)"/g)].map((x) => x[1]);
    assert.ok(srcs.length >= 3);
    assert.ok(m.includes('purpose: "maskable"'));
    for (const s of srcs) assert.ok(existsSync(new URL(`../../public${s}`, import.meta.url)), s);
  });
});
