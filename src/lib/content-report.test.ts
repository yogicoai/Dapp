import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  REPORT_DAILY_MAX,
  REPORT_DETAIL_MAX,
  REPORT_PAGE_MAX,
  REPORT_REASON_LABEL,
  adminReportFromRow,
  checkReportInput,
  parseReportHandleBody,
  reportFailureOf,
  reportReasons,
  reportTargetLabel,
} from "./content-report.ts";

describe("AI 결과물 신고 — 보내기 전 검사(구글 플레이 AI 콘텐츠 정책, 2026-10-20)", () => {
  it("동화 쪽 · 가족 그림을 받고, 자세히는 다듬어 빈 글이면 null", () => {
    const a = checkReportInput({ kind: "book", targetId: "my-mf3k2-ab12", page: 3, reason: "image", detail: "  손가락이 이상해요 " });
    assert.deepEqual(a, { ok: true, value: { kind: "book", targetId: "my-mf3k2-ab12", page: 3, reason: "image", detail: "손가락이 이상해요" } });
    const b = checkReportInput({ kind: "portrait", targetId: "mom", reason: "unsafe", detail: "   " });
    assert.deepEqual(b, { ok: true, value: { kind: "portrait", targetId: "mom", page: null, reason: "unsafe", detail: null } });
  });
  it("틀린 값은 막는다", () => {
    const err = (i: Parameters<typeof checkReportInput>[0]) => {
      const r = checkReportInput(i);
      assert.equal(r.ok, false);
      return r.ok ? "" : r.error;
    };
    assert.match(err({ kind: "video", targetId: "my-a", reason: "image" }), /무엇을/);
    assert.match(err({ kind: "book", targetId: "my a; drop", reason: "image" }), /대상/);
    assert.match(err({ kind: "book", targetId: "my-a", page: REPORT_PAGE_MAX + 1, reason: "image" }), /쪽/);
    assert.match(err({ kind: "book", targetId: "my-a", page: 1.5, reason: "image" }), /쪽/);
    assert.match(err({ kind: "book", targetId: "my-a", reason: "spam" }), /까닭/);
    assert.match(err({ kind: "book", targetId: "my-a", reason: null }), /까닭/);
    // 가족 그림에는 '글' 까닭이 없다
    assert.match(err({ kind: "portrait", targetId: "dad", reason: "text" }), /까닭/);
    assert.match(err({ kind: "book", targetId: "my-a", reason: "other", detail: "가".repeat(REPORT_DETAIL_MAX + 1) }), /1000자/);
  });
  it("까닭 목록 — 동화 다섯 · 가족 그림 넷, 이름이 모두 있다", () => {
    assert.deepEqual([...reportReasons("book")], ["image", "text", "unsafe", "privacy", "other"]);
    assert.deepEqual([...reportReasons("portrait")], ["image", "unsafe", "privacy", "other"]);
    for (const k of reportReasons("book")) assert.ok(REPORT_REASON_LABEL[k].length > 0);
  });
  it("DB 오류 → 고객에게 보일 갈래(SQL 전이면 '받을 수 없어요')", () => {
    assert.equal(reportFailureOf({ code: "42501" }), "login");
    assert.equal(reportFailureOf({ code: "54000" }), "limit");
    assert.equal(reportFailureOf({ code: "PGRST202" }), "unavailable");
    assert.equal(reportFailureOf({ code: "42883" }), "unavailable");
    assert.equal(reportFailureOf({ code: "22023" }), "invalid");
    assert.equal(reportFailureOf(null), "network");
  });
});

describe("관리실 — 신고 줄 · 처리", () => {
  it("대상 이름", () => {
    assert.equal(reportTargetLabel("book", "my-mf3k2-ab12", 3), "만든 동화 · 4쪽");
    assert.equal(reportTargetLabel("book", "classic-cinderella", 0), "세계명작 · 1쪽");
    assert.equal(reportTargetLabel("book", "folk-heungbu", null), "전래동화");
    assert.equal(reportTargetLabel("portrait", "mom", null), "가족 캐릭터(엄마)");
    assert.equal(reportTargetLabel("portrait", "m-x7k2", null), "가족 캐릭터");
  });
  it("DB 한 줄 → 화면 줄, 모양이 틀리면 null", () => {
    const row = adminReportFromRow({
      id: "12", owner: "8c3b1f7e-1a2b-4c3d-9e8f-1234567890ab", username: "kim", target_kind: "book", target_id: "my-a",
      page: 2, reason: "image", detail: "", status: "open", master_note: null, handled_by_username: null, handled_at: null,
      created_at: "2026-10-20T01:00:00Z",
    });
    assert.equal(row?.id, 12);
    assert.equal(row?.detail, null);
    assert.equal(row?.page, 2);
    assert.equal(adminReportFromRow({ target_kind: "book", reason: "nope", status: "open", target_id: "x", created_at: "x" }), null);
    assert.equal(adminReportFromRow({ target_kind: "book", reason: "image", status: "gone", target_id: "x", created_at: "x" }), null);
    assert.equal(adminReportFromRow(null), null);
  });
  it("처리 본문 검사", () => {
    assert.deepEqual(parseReportHandleBody({ id: 3, status: "resolved", note: " 다시 그림 " }), {
      ok: true,
      value: { id: 3, status: "resolved", note: "다시 그림" },
    });
    assert.deepEqual(parseReportHandleBody({ id: 3, note: "메모만" }), { ok: true, value: { id: 3, status: null, note: "메모만" } });
    assert.equal(parseReportHandleBody({ id: 0, status: "resolved" }).ok, false);
    assert.equal(parseReportHandleBody({ id: 3, status: "deleted" }).ok, false);
    assert.equal(parseReportHandleBody({ id: 3 }).ok, false);
    assert.equal(parseReportHandleBody({ id: 3, note: "가".repeat(1001) }).ok, false);
    assert.equal(parseReportHandleBody("x").ok, false);
  });
});

describe("DB 함수와 같은 규칙(supabase-content-reports.sql)", () => {
  const sql = readFileSync(new URL("../../supabase-content-reports.sql", import.meta.url), "utf8");
  it("까닭 · 대상 · 쪽 · 길이 · 하루 한도", () => {
    assert.ok(sql.includes(`check (reason in (${reportReasons("book").map((k) => `'${k}'`).join(",")}))`));
    assert.ok(sql.includes("target_id ~ '^[A-Za-z0-9_:.-]{1,120}$'"));
    assert.ok(sql.includes(`page between 0 and ${REPORT_PAGE_MAX}`));
    assert.ok(sql.includes(`length(detail) <= ${REPORT_DETAIL_MAX}`));
    assert.ok(sql.includes(`if v_recent >= ${REPORT_DAILY_MAX} then`));
  });
  it("표는 잠그고 함수로만 — 회원은 넣기만, 관리자는 읽고 처리만", () => {
    assert.ok(sql.includes("revoke all on public.content_reports from anon, authenticated;"));
    assert.ok(sql.includes("grant execute on function public.report_content(text, text, integer, text, text) to authenticated;"));
    assert.ok(sql.includes("revoke all on function public.report_content(text, text, integer, text, text) from public, anon;"));
    assert.ok(sql.includes("where public.master_can_see(r.owner)"));
    assert.equal((sql.match(/if not public\.is_master_user\(\) then/g) ?? []).length, 2);
  });
});
