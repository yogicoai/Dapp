import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  creditsFromRow,
  creditText,
  freeLeftFromRow,
  mergedCreditLog,
  parseCreditGrantBody,
  type MemberCreditsResponse,
} from "./member-credits.ts";

const ID = "0b8f5a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";

describe("보상 크레딧 — 관리실이 더해 주기(본문 검사)", () => {
  it("회원 id · 종류(동화/캐릭터) · 1~10 · 사유 두 글자 이상", () => {
    assert.deepEqual(parseCreditGrantBody({ id: ID.toUpperCase(), kind: "book", amount: 2, note: "  사고 보상 " }), {
      ok: true,
      value: { id: ID, kind: "book", amount: 2, note: "사고 보상" },
    });
    assert.equal(parseCreditGrantBody({ id: ID, kind: "character", amount: 1, note: "문의" }).ok, true);
    assert.equal(parseCreditGrantBody({ id: ID, kind: "voice", amount: 1, note: "사유" }).ok, false);
    assert.equal(parseCreditGrantBody({ id: ID, amount: 1, note: "사유" }).ok, false);
    assert.equal(parseCreditGrantBody({ id: "demo-1", kind: "book", amount: 1, note: "사유" }).ok, false);
    assert.equal(parseCreditGrantBody({ id: ID, kind: "book", amount: 0, note: "사유" }).ok, false);
    assert.equal(parseCreditGrantBody({ id: ID, kind: "book", amount: 11, note: "사유" }).ok, false);
    assert.equal(parseCreditGrantBody({ id: ID, kind: "book", amount: 1.5, note: "사유" }).ok, false);
    assert.equal(parseCreditGrantBody({ id: ID, kind: "book", amount: "2", note: "사유" }).ok, false);
    assert.equal(parseCreditGrantBody({ id: ID, kind: "book", amount: 1, note: " 응 " }).ok, false);
    assert.equal(parseCreditGrantBody({ id: ID, kind: "book", amount: 1, note: "가".repeat(501) }).ok, false);
    assert.equal(parseCreditGrantBody(null).ok, false);
  });
  it("세는 말 — 동화는 권, 캐릭터는 번", () => {
    const bad = parseCreditGrantBody({ id: ID, kind: "book", amount: 20, note: "사유" });
    assert.ok(!bad.ok && /1~10권/.test(bad.error));
    const bad2 = parseCreditGrantBody({ id: ID, kind: "character", amount: 20, note: "사유" });
    assert.ok(!bad2.ok && /1~10번/.test(bad2.error));
    assert.equal(creditText("book", 2), "동화 크레딧 2권");
    assert.equal(creditText("character", 1), "캐릭터 생성 크레딧 1번");
  });
});

describe("보상 크레딧 — DB 답 읽기", () => {
  it("남은 수와 기록, 모양이 틀린 줄은 버린다", () => {
    const r = creditsFromRow({
      free_left: 3,
      log: [
        { amount: 2, note: "문의", by: "fe", at: "2026-10-19T03:00:00Z" },
        { amount: 0, note: "틀린 줄", by: "fe", at: "2026-10-19T03:00:00Z" },
        { amount: 1, note: "시각 없음", by: "fe" },
        { amount: 1, note: null, by: null, at: "2026-10-18T03:00:00Z" },
      ],
    });
    assert.equal(r.freeLeft, 3);
    assert.deepEqual(r.log, [
      { amount: 2, note: "문의", by: "fe", at: "2026-10-19T03:00:00Z" },
      { amount: 1, note: "", by: null, at: "2026-10-18T03:00:00Z" },
    ]);
  });
  it("빈 답 · 이상한 숫자는 0", () => {
    assert.deepEqual(creditsFromRow(null), { freeLeft: 0, log: [] });
    assert.equal(creditsFromRow({ free_left: -1 }).freeLeft, 0);
    assert.equal(freeLeftFromRow({ free_left: 2 }), 2);
    assert.equal(freeLeftFromRow({ free_left: "2" }), 2);
    assert.equal(freeLeftFromRow({ free_left: 0.5 }), 0);
    assert.equal(freeLeftFromRow(null), 0);
  });
  it("두 가지 기록을 최근 것부터 한 줄로", () => {
    const r: MemberCreditsResponse = {
      book: { schemaReady: true, freeLeft: 1, log: [{ amount: 1, note: "책 사고", by: "yogico", at: "2026-10-19T05:00:00Z" }] },
      character: {
        schemaReady: true,
        freeLeft: 2,
        log: [
          { amount: 2, note: "닮지 않음", by: "fe", at: "2026-10-19T06:00:00Z" },
          { amount: 1, note: "예전", by: "fe", at: "2026-10-18T06:00:00Z" },
        ],
      },
    };
    assert.deepEqual(
      mergedCreditLog(r).map((g) => [g.kind, g.note]),
      [
        ["character", "닮지 않음"],
        ["book", "책 사고"],
        ["character", "예전"],
      ],
    );
  });
});
