import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { LEGAL_BODY_MAX, LEGAL_KINDS, parseLegalMarkdown, parsePublishInput } from "./legal-doc.ts";
import { LEGAL_DRAFT_EFFECTIVE, LEGAL_DRAFTS } from "./legal-drafts.ts";

describe("약관 세 문서의 준비된 초안 — 관리실 '준비된 초안 넣기'", () => {
  it("세 문서 모두 있고, 게시 검사를 그대로 통과한다", () => {
    for (const kind of LEGAL_KINDS) {
      const d = LEGAL_DRAFTS[kind];
      assert.ok(d.title.trim() && d.body.trim(), kind);
      assert.ok(d.body.length < LEGAL_BODY_MAX, kind);
      const r = parsePublishInput({ kind, title: d.title, body: d.body, effectiveDate: LEGAL_DRAFT_EFFECTIVE }, "2026-10-19");
      assert.ok(r.ok, `${kind}: ${r.ok ? "" : r.error}`);
      assert.ok(parseLegalMarkdown(d.body).length > 10, kind);
    }
  });
  it("뼈대 자리표시(〔채워 주세요〕)가 남아 있지 않다", () => {
    for (const kind of LEGAL_KINDS) assert.ok(!LEGAL_DRAFTS[kind].body.includes("채워 주세요"), kind);
  });
  it("이용약관·개인정보처리방침 본문의 시행일이 편집 칸 시행일과 같다", () => {
    assert.match(LEGAL_DRAFTS.terms.body, /이 약관은 2026년 10월 19일부터 시행합니다\./);
    assert.match(LEGAL_DRAFTS.privacy.body, /이 방침은 2026년 10월 19일부터 시행합니다\./);
    assert.equal(LEGAL_DRAFT_EFFECTIVE, "2026-10-19");
  });
  it("정한 규칙이 들어 있다 — 보호자만 가입 · 연간은 패스가 열린 날부터 · 쿠키 1년 · 30일 전 알림", () => {
    assert.match(LEGAL_DRAFTS.terms.body, /만 14세 미만은 회원으로 가입할 수 없습니다/);
    assert.match(LEGAL_DRAFTS.terms.body, /가족 패스가 열린 날부터 이용 기간으로 셉니다/);
    assert.match(LEGAL_DRAFTS.terms.body, /산 날부터 1년입니다/);
    assert.match(LEGAL_DRAFTS.terms.body, /유효기간이 끝나기 30일 전부터/);
    assert.match(LEGAL_DRAFTS.privacy.body, /Supabase Inc\. \(서버: 일본 도쿄\)/);
    assert.match(LEGAL_DRAFTS.refund.body, /139,300원 환불/);
  });
});
