import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  countKinds,
  escapeLike,
  failureLines,
  formatDateKo,
  formatWhenKo,
  httpStatusForDb,
  isTrustedImageUrl,
  isUuid,
  kindInfo,
  kstDayStart,
  openIncidentCount,
  parseGrantAmount,
  parseOptionalNote,
  parseRefundNote,
  parseUsername,
  previewPages,
  refundLabel,
  restoreCheck,
  restoreConflict,
  rowSeverity,
  sortIncidents,
  stageStates,
  summarizeToday,
  topKind,
  withRecentRefund,
  type Payment,
  type StageInput,
} from "./admin.ts";

// 2026-09-14 15:00 한국 = 06:00 UTC
const NOW = Date.parse("2026-09-14T06:00:00Z");

describe("사고 종류 — 이름·급함 색", () => {
  it("여러 종류가 붙으면 가장 급한 것이 줄 색을 정한다", () => {
    assert.equal(topKind(["blank_pages", "paid_not_saved"]), "paid_not_saved");
    assert.equal(rowSeverity(["blank_pages", "paid_not_saved"], false), "crit");
    assert.equal(rowSeverity(["stuck"], false), "warn");
    assert.equal(rowSeverity(["blank_pages"], false), "info");
  });
  it("처리 끝난 줄은 급한 종류가 남아 있어도 초록", () => {
    assert.equal(rowSeverity(["paid_not_saved"], true), "ok");
  });
  it("모르는 종류는 버리지 않고 이름 그대로, 맨 뒤 순서", () => {
    assert.deepEqual(kindInfo("new_kind"), { label: "new_kind", sev: "plain", rank: 99 });
    assert.equal(topKind(["new_kind", "deleted_after_save"]), "deleted_after_save");
  });
  it("급한 순 → 최근 순", () => {
    const rows = [
      { id: "a", kinds: ["blank_pages"], updated_at: "2026-09-14T05:00:00Z" },
      { id: "b", kinds: ["stuck"], updated_at: "2026-09-13T05:00:00Z" },
      { id: "c", kinds: ["stuck"], updated_at: "2026-09-14T05:30:00Z" },
      { id: "d", kinds: ["unlinked_payment"], updated_at: "2026-09-10T05:00:00Z" },
    ];
    assert.deepEqual(sortIncidents(rows).map((r) => r.id), ["d", "c", "b", "a"]);
  });
  it("칩 개수 — 한 줄에 같은 종류가 두 번 있어도 한 번, 알려진 순서대로", () => {
    const out = countKinds([
      { kinds: ["blank_pages", "paid_not_saved"] },
      { kinds: ["blank_pages", "blank_pages"] },
      { kinds: ["zzz"] },
    ]);
    assert.deepEqual(out, [
      { kind: "paid_not_saved", count: 1 },
      { kind: "blank_pages", count: 2 },
      { kind: "zzz", count: 1 },
    ]);
  });
  it("탭 배지는 열린 사고만, '고객이 삭제'만 있는 줄은 빼고 센다", () => {
    assert.equal(
      openIncidentCount([
        { kinds: ["paid_not_saved"], resolved_at: null },
        { kinds: ["deleted_after_save"], resolved_at: null },
        { kinds: ["stuck"], resolved_at: "2026-09-14T01:00:00Z" },
        { kinds: ["deleted_after_save", "blank_pages"], resolved_at: null },
      ]),
      2,
    );
  });
});

describe("어디까지 갔나 — 단계", () => {
  const base: StageInput = {
    status: null,
    kinds: [],
    bookExists: false,
    illustrationPaid: false,
    drawn: 0,
    failureStages: [],
  };
  it("기록 없는 결제는 단계를 칠하지 않는다", () => {
    assert.deepEqual(stageStates(base), ["", "", "", "", ""]);
  });
  it("저장됨 + 책 있음 → 다섯 칸 모두 끝", () => {
    assert.deepEqual(stageStates({ ...base, status: "saved", bookExists: true }), ["done", "done", "done", "done", "done"]);
  });
  it("저장됨인데 책이 없으면 책장 칸이 실패", () => {
    assert.deepEqual(stageStates({ ...base, status: "saved", kinds: ["book_missing"] }), ["done", "done", "done", "done", "fail"]);
  });
  it("그림 값을 내고 실패 → 저장에서 실패", () => {
    assert.deepEqual(
      stageStates({ ...base, status: "failed", illustrationPaid: true, drawn: 5, failureStages: ["upload", "save"] }),
      ["done", "done", "done", "fail", ""],
    );
  });
  it("그리다 실패 → 그림 칸이 실패", () => {
    assert.deepEqual(stageStates({ ...base, status: "failed", drawn: 2, failureStages: ["draw"] }), ["done", "fail", "", "", ""]);
  });
  it("대본에서 실패", () => {
    assert.deepEqual(stageStates({ ...base, status: "failed" }), ["fail", "", "", "", ""]);
  });
  it("그리는 중에 멈춤 → 그림 칸이 멈춤", () => {
    assert.deepEqual(stageStates({ ...base, status: "drawing", kinds: ["stuck"], drawn: 2 }), ["done", "stuck", "", "", ""]);
  });
  it("대본 끝(script) — 대본만 끝남", () => {
    assert.deepEqual(stageStates({ ...base, status: "script" }), ["done", "", "", "", ""]);
  });
});

describe("원고 쪽 미리보기 · 실패 이유", () => {
  it("우리 저장소 그림 주소만 넘기고 base64 는 '못 올림', 빈 값은 '빈 쪽', 남의 주소는 '바깥 주소'", () => {
    const out = previewPages(
      [
        { text: " 하나 ", image: "https://cafe24.example/p1.webp" },
        { text: "둘", image: "data:image/webp;base64,AAAA" },
        { text: "셋", image: null },
        { text: "넷", image: "javascript:alert(1)" },
        null,
        { text: "다섯", image: "https://attacker.example/px.png?u=me" },
      ],
      ["https://cafe24.example/"],
    );
    assert.deepEqual(out, [
      { text: "하나", art: "ok", image: "https://cafe24.example/p1.webp" },
      { text: "둘", art: "embedded", image: null },
      { text: "셋", art: "blank", image: null },
      { text: "넷", art: "blank", image: null },
      { text: "", art: "blank", image: null },
      { text: "다섯", art: "external", image: null },
    ]);
    assert.deepEqual(previewPages(undefined), []);
    // 믿는 저장소를 안 주면 어떤 주소도 <img> 로 넘기지 않는다
    assert.equal(previewPages([{ text: "a", image: "https://cafe24.example/p1.webp" }])[0].art, "external");
  });
  it("저장소 주소 앞부분이 같아도 호스트가 다르면 믿지 않는다", () => {
    const bases = ["https://yogico.cafe24.com", "https://x.supabase.co/storage/v1/object/public"];
    assert.equal(isTrustedImageUrl("https://yogico.cafe24.com/art/1.webp", bases), true);
    assert.equal(isTrustedImageUrl("https://yogico.cafe24.com.evil.example/1.webp", bases), false);
    assert.equal(isTrustedImageUrl("https://yogico.cafe24.com@evil.example/1.webp", bases), false);
    assert.equal(isTrustedImageUrl("https://x.supabase.co/storage/v1/object/public/b/1.png", bases), true);
    assert.equal(isTrustedImageUrl("https://x.supabase.co/rest/v1/profiles", bases), false);
    assert.equal(isTrustedImageUrl("https://a.example/1.png", ["", null, "nope"]), false);
  });
  it("앱 모양과 DB 지킴이 모양을 둘 다 읽는다", () => {
    assert.deepEqual(
      failureLines([
        { page: 3, stage: "upload", reason: "cafe24 응답 없음" },
        { stage: "upload", reason: "올리지 못한 그림(base64)을 DB 가 비움", pages: [2, 4], count: 2 },
        { stage: "save", reason: "timeout" },
        "이상한 값",
      ]),
      [
        { where: "3쪽", stage: "올리기", reason: "cafe24 응답 없음" },
        { where: "2·4쪽", stage: "올리기", reason: "올리지 못한 그림(base64)을 DB 가 비움" },
        { where: "책", stage: "저장", reason: "timeout" },
        { where: "책", stage: "—", reason: "" },
      ],
    );
  });
});

describe("한국 시각 표시", () => {
  it("오늘 0시(한국)는 UTC 전날 15시", () => {
    assert.equal(kstDayStart(NOW).toISOString(), "2026-09-13T15:00:00.000Z");
    // 한국 새벽 0시 30분(UTC 전날 15:30)도 같은 날로 센다
    assert.equal(kstDayStart(Date.parse("2026-09-13T15:30:00Z")).toISOString(), "2026-09-13T15:00:00.000Z");
    // 한국 23:59 (UTC 14:59) 는 전날
    assert.equal(kstDayStart(Date.parse("2026-09-13T14:59:00Z")).toISOString(), "2026-09-12T15:00:00.000Z");
  });
  it("방금 · n분 전 · n시간 전", () => {
    assert.equal(formatWhenKo("2026-09-14T05:59:40Z", NOW), "방금");
    assert.equal(formatWhenKo("2026-09-14T05:42:00Z", NOW), "18분 전");
    assert.equal(formatWhenKo("2026-09-14T03:56:00Z", NOW), "2시간 전");
  });
  it("PC 시계가 서버보다 늦어 미래 시각이 와도 날짜가 아니라 '방금'", () => {
    assert.equal(formatWhenKo("2026-09-14T06:02:00Z", NOW), "방금");
    assert.equal(formatWhenKo("2026-09-14T09:00:00Z", NOW), "방금");
  });
  it("한국 날짜로 어제면 '어제 21:14' — UTC 로는 같은 날이어도", () => {
    // 2026-09-13 21:14 한국 = 12:14 UTC
    assert.equal(formatWhenKo("2026-09-13T12:14:00Z", NOW), "어제 21:14");
    // 한국 오늘 00:10 (UTC 전날 15:10) 은 '어제'가 아니라 시간 전
    assert.equal(formatWhenKo("2026-09-13T15:10:00Z", NOW), "14시간 전");
  });
  it("그 전은 날짜, 해가 다르면 연도까지", () => {
    assert.equal(formatWhenKo("2026-09-11T03:00:00Z", NOW), "9월 11일");
    assert.equal(formatWhenKo("2025-12-31T16:00:00Z", NOW), "1월 1일"); // 한국으로는 새해 첫날
    assert.equal(formatWhenKo("2025-12-03T03:00:00Z", NOW), "2025년 12월 3일");
    assert.equal(formatWhenKo(null, NOW), "—");
    assert.equal(formatWhenKo("아님", NOW), "—");
  });
  it("가입일은 한국 날짜", () => {
    assert.equal(formatDateKo("2026-08-20T16:00:00Z"), "2026-08-21");
  });
});

describe("오늘 현황", () => {
  it("열린 사고만 세고, 환불은 한국 날짜로 오늘 것만 더한다", () => {
    const out = summarizeToday({
      booksToday: 23,
      now: NOW,
      incidents: [
        { kinds: ["paid_not_saved"], resolved_at: null },
        { kinds: ["paid_not_saved", "blank_pages"], resolved_at: null },
        { kinds: ["paid_not_saved"], resolved_at: "2026-09-14T01:00:00Z" },
        { kinds: ["stuck"], resolved_at: null },
      ],
      refunds: [
        { amount: 10, refunded_at: "2026-09-13T15:00:00Z" }, // 한국 오늘 0시 정각
        { amount: 5, refunded_at: "2026-09-14T05:00:00Z" },
        { amount: 7, refunded_at: "2026-09-13T14:59:59Z" }, // 한국 어제
        { amount: null, refunded_at: "2026-09-14T05:00:00Z" },
        { amount: 3, refunded_at: null },
      ],
    });
    assert.deepEqual(out, { booksToday: 23, paidNotSaved: 2, stuck: 1, refundedTokens: 15 });
  });
});

describe("되살리기 — 막힘·확인", () => {
  const ok = {
    jobId: "11111111-1111-1111-1111-111111111111",
    status: "failed",
    updatedAt: "2026-09-14T05:00:00Z",
    bookId: "my-abc",
    bookExists: false,
    title: "서윤이와 달님 버스",
    pages: [{ text: "하나" }, { text: "둘" }],
    now: NOW,
  };
  it("재료가 있으면 통과", () => {
    assert.deepEqual(restoreCheck(ok), { blocked: null, warn: null });
  });
  it("기록 없는 결제 · 원고 없음 · 빈 쪽 · my- 아닌 책 id 는 막는다", () => {
    assert.ok(restoreCheck({ ...ok, jobId: null }).blocked);
    assert.ok(restoreCheck({ ...ok, pages: [] }).blocked);
    assert.ok(restoreCheck({ ...ok, title: " " }).blocked);
    assert.ok(restoreCheck({ ...ok, pages: [{ text: "하나" }, { text: " " }] }).blocked);
    assert.ok(restoreCheck({ ...ok, bookId: "folk-x" }).blocked);
  });
  it("진행 중 30분 안 → 막지 않고 이유 한 줄", () => {
    const r = restoreCheck({ ...ok, status: "drawing", updatedAt: "2026-09-14T05:42:00Z" });
    assert.equal(r.blocked, null);
    assert.match(r.warn ?? "", /30분이 안 됐어요\(지금 18분\)/);
    assert.deepEqual(restoreCheck({ ...ok, status: "drawing", updatedAt: "2026-09-14T05:00:00Z" }), { blocked: null, warn: null });
  });
  it("처리 끝 표시로 시각이 새로 찍힌 경우 까닭을 붙인다", () => {
    const r = restoreCheck({
      ...ok,
      status: "drawing",
      updatedAt: "2026-09-14T05:59:00Z",
      resolvedAt: "2026-09-14T05:59:00Z",
    });
    assert.equal(r.blocked, null);
    assert.match(r.warn ?? "", /처리 끝 표시 때문에/);
    // 처리 끝이 오래전이면 보통 문구
    assert.match(
      restoreCheck({ ...ok, status: "drawing", updatedAt: "2026-09-14T05:59:00Z", resolvedAt: "2026-09-14T04:00:00Z" }).warn ?? "",
      /30분이 안 됐어요/,
    );
  });
  it("책이 이미 있으면 이유 한 줄", () => {
    assert.match(restoreCheck({ ...ok, status: "saved", bookExists: true }).warn ?? "", /이미 책장에/);
  });
  it("DB 거절 문구로 다시 물을 확인을 가린다", () => {
    assert.equal(restoreConflict("이미 책이 있습니다. 덮어쓰려면 p_replace 를 true 로 주세요."), "exists");
    assert.equal(restoreConflict("아직 진행 중인 기록입니다(마지막 움직임 14:42). 30분 넘게…"), "in_progress");
    assert.equal(restoreConflict("같은 id 의 책이 다른 회원에게 있습니다."), null);
    assert.equal(restoreConflict(undefined), null);
  });
});

describe("입력 검사", () => {
  it("uuid 모양", () => {
    assert.equal(isUuid("0e790f6a-1234-4abc-9def-0123456789ab"), true);
    assert.equal(isUuid("0e790f6a-1234-4abc-9def-0123456789a"), false);
    assert.equal(isUuid("'; drop table"), false);
    assert.equal(isUuid(42), false);
  });
  it("환불 사유 2~500자", () => {
    assert.deepEqual(parseRefundNote("  저장 실패 "), { ok: true, value: "저장 실패" });
    assert.equal(parseRefundNote("a").ok, false);
    assert.equal(parseRefundNote(" ").ok, false);
    assert.equal(parseRefundNote(null).ok, false);
    assert.equal(parseRefundNote("가".repeat(500)).ok, true);
    assert.equal(parseRefundNote("가".repeat(501)).ok, false);
  });
  it("처리 끝 메모는 선택", () => {
    assert.deepEqual(parseOptionalNote(undefined), { ok: true, value: null });
    assert.deepEqual(parseOptionalNote("  "), { ok: true, value: null });
    assert.deepEqual(parseOptionalNote(" 통화함 "), { ok: true, value: "통화함" });
    assert.equal(parseOptionalNote(3).ok, false);
    assert.equal(parseOptionalNote("가".repeat(501)).ok, false);
  });
  it("충전 토큰 1~1000 정수", () => {
    assert.deepEqual(parseGrantAmount(30), { ok: true, value: 30 });
    assert.deepEqual(parseGrantAmount("30"), { ok: true, value: 30 });
    assert.equal(parseGrantAmount(1000).ok, true);
    assert.equal(parseGrantAmount(1001).ok, false);
    assert.equal(parseGrantAmount(0).ok, false);
    assert.equal(parseGrantAmount(-5).ok, false);
    assert.equal(parseGrantAmount(2.5).ok, false);
    assert.equal(parseGrantAmount("").ok, false);
    assert.equal(parseGrantAmount("1e3").ok, false); // 숫자 글자만 받는다
  });
  it("아이디 1~40자, 공백·괄호·콤마 없음", () => {
    assert.deepEqual(parseUsername(" seoyun22 "), { ok: true, value: "seoyun22" });
    assert.equal(parseUsername("").ok, false);
    assert.equal(parseUsername("a b").ok, false);
    assert.equal(parseUsername("a,b").ok, false);
    assert.equal(parseUsername("x".repeat(41)).ok, false);
    assert.equal(parseUsername(undefined).ok, false);
  });
  it("ilike 글자 바꾸기", () => {
    assert.equal(escapeLike("a_b%c\\"), "a\\_b\\%c\\\\");
  });
  it("DB 오류 코드 → HTTP 상태", () => {
    assert.equal(httpStatusForDb("42501"), 403);
    assert.equal(httpStatusForDb("22023"), 400);
    assert.equal(httpStatusForDb("23505"), 409);
    assert.equal(httpStatusForDb("55000"), 409);
    assert.equal(httpStatusForDb(undefined), 500);
  });
});

describe("결제 환불 표시", () => {
  const base: Payment = { entry: "e1", amount: 30, refundedAt: "2026-09-14T05:00:00Z", refundedBy: null, note: null, byKnown: true };
  it("처리자를 알 때만 '앱이 되돌림'이라 말한다", () => {
    assert.equal(refundLabel({ ...base, refundedAt: null }), "환불 안 됨");
    assert.equal(refundLabel({ ...base, refundedBy: "yogico" }), "환불함 · yogico");
    assert.equal(refundLabel(base), "환불함 · 앱이 되돌림");
    assert.equal(refundLabel({ ...base, byKnown: false }), "환불함 · 처리자 확인 불가");
  });
  it("방금 한 환불은 사유·처리자를 덧대고, DB 가 아는 값은 덮지 않는다", () => {
    const recent = new Map([["e1", { by: "fe", note: "저장 실패" }]]);
    assert.deepEqual(withRecentRefund({ ...base, byKnown: false }, recent), {
      ...base,
      refundedBy: "fe",
      note: "저장 실패",
      byKnown: true,
    });
    assert.deepEqual(withRecentRefund(base, recent), base);
    assert.deepEqual(withRecentRefund({ ...base, byKnown: false, refundedAt: null }, recent), {
      ...base,
      byKnown: false,
      refundedAt: null,
    });
    assert.equal(withRecentRefund(null, recent), null);
  });
});
