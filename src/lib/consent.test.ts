import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { allAgreed, CONSENT_VERSION, consentExempt, docsLive, NO_CHECKS, needsConsent, setAll } from "./consent.ts";
import { LEGAL_DRAFT_EFFECTIVE } from "./legal-drafts.ts";

describe("약관 동의 화면 — 누구에게·언제", () => {
  it("필수 세 가지를 모두 체크해야 시작한다 · '모두 동의'는 셋을 한꺼번에", () => {
    assert.equal(allAgreed(NO_CHECKS), false);
    assert.equal(allAgreed({ age14: true, terms: true }), false);
    assert.equal(allAgreed(setAll(true)), true);
    assert.equal(allAgreed(setAll(false)), false);
  });
  it("지금 판에 동의한 줄이 없거나 판이 다르면 띄운다", () => {
    assert.equal(needsConsent(null), true);
    assert.equal(needsConsent({ version: "2026-01-01" }), true);
    assert.equal(needsConsent({ version: CONSENT_VERSION }), false);
  });
  it("판은 이용약관 시행일과 같다", () => {
    assert.equal(CONSENT_VERSION, LEGAL_DRAFT_EFFECTIVE);
  });
  it("로그인·약관 세 화면·관리실에서는 띄우지 않는다", () => {
    for (const p of ["/login", "/terms", "/privacy", "/refund", "/admin", "/admin/members/x"]) assert.equal(consentExempt(p), true, p);
    for (const p of ["/", "/create", "/family", "/book/my-1", "/settings", "/administrator"]) assert.equal(consentExempt(p), false, p);
  });
  it("약관과 개인정보처리방침이 둘 다 시행 중이어야 동의를 받는다", () => {
    assert.equal(docsLive({ terms: { ready: true }, privacy: { ready: true } }), true);
    assert.equal(docsLive({ terms: { ready: true }, privacy: { ready: false } }), false);
    assert.equal(docsLive(null), false);
  });
});
