/**
 * 관리자 '회원' 화면 판단 시험 — 목록 거르기·정렬, 목소리 배지, 장부 이름표·상태, 실제 결제 탭 상태.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  canRefundLedger,
  filterMembers,
  groupReadyVoices,
  isDefaultMemberFilter,
  ledgerReasonLabel,
  ledgerStatusText,
  memberFilterParams,
  memberPaymentsView,
  membersListHref,
  parseMemberFilter,
  paymentStatusBrief,
  PAYMENT_STATUS_BRIEF,
  productLabel,
  readyVoiceRoles,
  signedTokens,
  toLedgerLines,
  voiceBadges,
  voiceSummary,
  DEFAULT_MEMBER_FILTER,
  type MemberListRow,
} from "./admin-members.ts";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const NOW = new Date("2026-09-30T05:00:00Z"); // 한국 14:00

const row = (p: Partial<MemberListRow> & { username: string }): MemberListRow => ({
  id: p.username,
  tokens: 0,
  createdAt: null,
  books: 0,
  openFeedback: 0,
  voices: [],
  plan: null,
  planEndsAt: null,
  ...p,
});

const ROWS: MemberListRow[] = [
  row({ username: "Kim_mom", createdAt: "2026-09-30T01:00:00Z", books: 2, tokens: 10 }),
  row({ username: "lee", createdAt: "2026-09-20T01:00:00Z", books: 5, tokens: 3, openFeedback: 1 }),
  row({ username: "park", createdAt: "2026-08-01T01:00:00Z", books: 5, tokens: 30 }),
  row({ username: "choi", createdAt: null, books: 0, tokens: 0 }),
];
const names = (rs: MemberListRow[]) => rs.map((r) => r.username);

describe("회원 목록 거르기", () => {
  it("기본 — 최근 가입 순, 가입일 모르는 줄은 끝", () => {
    assert.deepEqual(names(filterMembers(ROWS, DEFAULT_MEMBER_FILTER, NOW)), ["Kim_mom", "lee", "park", "choi"]);
  });
  it("q — 아이디 일부, 대소문자 무시, 앞뒤 공백 무시", () => {
    assert.deepEqual(names(filterMembers(ROWS, { ...DEFAULT_MEMBER_FILTER, q: " kim " }, NOW)), ["Kim_mom"]);
    assert.deepEqual(names(filterMembers(ROWS, { ...DEFAULT_MEMBER_FILTER, q: "없는사람" }, NOW)), []);
  });
  it("period — 한국 날짜로 오늘 포함 7일·30일, 가입일 모르면 뺀다", () => {
    assert.deepEqual(names(filterMembers(ROWS, { ...DEFAULT_MEMBER_FILTER, period: "7d" }, NOW)), ["Kim_mom"]);
    assert.deepEqual(names(filterMembers(ROWS, { ...DEFAULT_MEMBER_FILTER, period: "30d" }, NOW)), ["Kim_mom", "lee"]);
    // 7일의 시작은 한국 9/24 0시 = 9/23 15:00 UTC
    const edge = [row({ username: "edge", createdAt: "2026-09-23T15:00:00Z" }), row({ username: "before", createdAt: "2026-09-23T14:59:59Z" })];
    assert.deepEqual(names(filterMembers(edge, { ...DEFAULT_MEMBER_FILTER, period: "7d" }, NOW)), ["edge"]);
  });
  it("sort — 책 많은 순·토큰 많은 순, 같으면 최근 가입 먼저", () => {
    assert.deepEqual(names(filterMembers(ROWS, { ...DEFAULT_MEMBER_FILTER, sort: "books" }, NOW)), ["lee", "park", "Kim_mom", "choi"]);
    assert.deepEqual(names(filterMembers(ROWS, { ...DEFAULT_MEMBER_FILTER, sort: "tokens" }, NOW)), ["park", "Kim_mom", "lee", "choi"]);
  });
  it("fbOnly — 남은 의견 있는 회원만", () => {
    assert.deepEqual(names(filterMembers(ROWS, { ...DEFAULT_MEMBER_FILTER, fbOnly: true }, NOW)), ["lee"]);
  });
  it("원본을 바꾸지 않는다", () => {
    const copy = [...ROWS];
    filterMembers(ROWS, { ...DEFAULT_MEMBER_FILTER, sort: "tokens" }, NOW);
    assert.deepEqual(ROWS, copy);
  });
  it("주소 ↔ 거르기 — 모르는 값은 기본, 기본값은 주소에서 뺀다", () => {
    assert.deepEqual(parseMemberFilter(new URLSearchParams("q=%20kim%20&period=7d&sort=books&fb=1")), {
      q: "kim",
      period: "7d",
      sort: "books",
      fbOnly: true,
    });
    assert.deepEqual(parseMemberFilter(new URLSearchParams("period=1y&sort=evil&fb=yes")), DEFAULT_MEMBER_FILTER);
    assert.equal(parseMemberFilter(new URLSearchParams(`q=${"a".repeat(80)}`)).q.length, 40);
    assert.deepEqual(memberFilterParams({ q: "", period: "all", sort: "new", fbOnly: false }), {
      q: null,
      period: null,
      sort: null,
      fb: null,
    });
    assert.deepEqual(memberFilterParams({ sort: "tokens" }), { sort: "tokens" });
    assert.ok(isDefaultMemberFilter(DEFAULT_MEMBER_FILTER));
    assert.ok(!isDefaultMemberFilter({ ...DEFAULT_MEMBER_FILTER, fbOnly: true }));
  });
});

describe("부모 목소리", () => {
  it("준비된 것만, 엄마·아빠 순서, 겹치지 않게", () => {
    assert.deepEqual(
      readyVoiceRoles([
        { role: "dad", status: "ready" },
        { role: "mom", status: "deleted" },
        { role: "dad", status: "ready" },
        { role: "grandma", status: "ready" },
      ]),
      ["dad"],
    );
  });
  it("회원별로 묶는다 — 준비된 목소리가 없는 회원은 빠진다", () => {
    const m = groupReadyVoices([
      { owner: "a", role: "mom", status: "ready" },
      { owner: "a", role: "dad", status: "ready" },
      { owner: "b", role: "mom", status: "pending" },
      { owner: null, role: "mom", status: "ready" },
    ]);
    assert.deepEqual(m.get("a"), ["mom", "dad"]);
    assert.equal(m.has("b"), false);
    assert.equal(m.size, 1);
  });
  it("배지 — 엄마·아빠 둘 다 보이고 등록 안 된 쪽은 꺼짐", () => {
    assert.deepEqual(voiceBadges(["dad"]), [
      { role: "mom", label: "엄마", on: false },
      { role: "dad", label: "아빠", on: true },
    ]);
    assert.equal(voiceSummary(["mom", "dad"]), "엄마 · 아빠");
    assert.equal(voiceSummary([]), "없음");
  });
});

describe("토큰 장부", () => {
  it("이유 이름 — 아는 것은 사람 말, 모르는 것은 그대로", () => {
    assert.equal(ledgerReasonLabel("story"), "대본");
    assert.equal(ledgerReasonLabel("illustration"), "그림");
    assert.equal(ledgerReasonLabel("parent-voice"), "부모 목소리");
    assert.equal(ledgerReasonLabel("family-portrait"), "가족 캐릭터");
    assert.equal(ledgerReasonLabel("new-thing"), "new-thing");
    assert.equal(ledgerReasonLabel(""), "기타");
    assert.equal(ledgerReasonLabel("toString"), "toString"); // 객체 기본 이름에 속지 않는다
  });

  const rows = [
    { id: "e1", amount: 3, reason: "story", refunded_at: null, created_at: "2026-09-30T01:00:00Z" },
    { id: "e2", amount: 5, reason: "illustration", refunded_at: "2026-09-30T02:00:00Z", created_at: "2026-09-30T01:00:00Z" },
    { id: "e3", amount: 5, reason: "illustration", refunded_at: "2026-09-30T02:00:00Z", created_at: "2026-09-30T01:00:00Z" },
    { id: "e4", amount: 5, reason: "illustration", refunded_at: "2026-09-30T02:00:00Z", created_at: "2026-09-30T01:00:00Z" },
  ];
  const info = new Map([
    ["e2", { refunded_by: "m1", refunded_by_username: "yogico", refund_note: "저장 실패" }],
    ["e3", { refunded_by: null, refunded_by_username: null, refund_note: null }],
    ["e4", { refunded_by: "m2", refunded_by_username: null, refund_note: "다른 사람" }],
  ]);

  it("처리자·사유를 붙이고, 모르면 단정하지 않는다", () => {
    const lines = toLedgerLines(rows, info);
    assert.equal(ledgerStatusText(lines[0]), "환불 안 됨");
    assert.equal(ledgerStatusText(lines[1]), "환불함 · yogico · 저장 실패");
    assert.equal(ledgerStatusText(lines[2]), "환불함 · 앱이 되돌림");
    // id 는 있는데 아이디를 못 읽음 — 처리자는 단정하지 않고, 적힌 사유는 그대로 보여 준다
    assert.equal(ledgerStatusText(lines[3]), "환불함 · 처리자 확인 불가 · 다른 사람");
    const blind = toLedgerLines(rows, null); // DB 함수가 없는 옛 DB
    assert.equal(ledgerStatusText(blind[1]), "환불함 · 처리자 확인 불가");
    assert.equal(blind[0].refundKnown, true); // 되돌리지 않은 줄은 알 것이 없다
  });
  it("방금 이 창에서 한 환불로 모르는 처리자를 채운다", () => {
    const blind = toLedgerLines(rows, null);
    const recent = new Map([["e2", { by: "fe", note: "방금 환불" }]]);
    assert.equal(ledgerStatusText(blind[1], recent), "환불함 · fe · 방금 환불");
    // 이미 아는 줄은 덮지 않는다
    assert.equal(ledgerStatusText(toLedgerLines(rows, info)[1], recent), "환불함 · yogico · 저장 실패");
  });
  it("환불 단추 — 안 되돌린 줄, 금액이 있을 때만", () => {
    const lines = toLedgerLines([...rows, { id: "e5", amount: 0, reason: "story", refunded_at: null, created_at: "x" }], info);
    assert.deepEqual(lines.map(canRefundLedger), [true, false, false, false, false]);
    assert.equal(toLedgerLines([{ id: "z", amount: null, reason: null, refunded_at: null, created_at: "x" }], null)[0].amount, 0);
  });
  it("충전 토큰 부호", () => {
    assert.equal(signedTokens(30), "+30");
    assert.equal(signedTokens(-5), "-5");
    assert.equal(signedTokens(0), "0");
    assert.equal(signedTokens(NaN), "–");
  });
});

describe("실제 결제 탭", () => {
  it("결제 경로 없음·표 없음·0줄은 '연동 전', 줄이 있으면 목록, 그 밖은 오류", () => {
    assert.equal(memberPaymentsView(null, null), "loading");
    assert.equal(memberPaymentsView(404, null), "none");
    assert.equal(memberPaymentsView(200, { schemaReady: false, rows: [], total: 0, truncated: false }), "none");
    assert.equal(memberPaymentsView(200, { schemaReady: true, rows: [], total: 0, truncated: false }), "none");
    const one = {
      id: "p",
      orderId: "o",
      product: "monthly",
      orderName: null,
      amount: 12900,
      status: "paid",
      refundedAmount: 0,
      requestedAt: "x",
      createdAt: "x",
    };
    assert.equal(memberPaymentsView(200, { schemaReady: true, rows: [one], total: 1, truncated: false }), "rows");
    assert.equal(memberPaymentsView(500, null), "error");
    assert.equal(memberPaymentsView(0, null), "error");
  });
  it("요금제 이름", () => {
    assert.equal(productLabel("monthly"), "가족 패스 (월간)");
    assert.equal(productLabel("yearly"), "가족 패스 (연간)");
    assert.equal(productLabel("extra3"), "추가 3권");
    assert.equal(productLabel("weird"), "weird");
  });
  it("결제 상태 — SQL 의 상태 목록을 전부 덮고, 모르는 상태는 회색 글자 그대로", () => {
    const sql = readFileSync(join(SRC, "..", "supabase-admin-console.sql"), "utf8");
    const m = /create table if not exists public\.payments[\s\S]*?check \(status in \(([^)]*)\)\)/.exec(sql);
    assert.ok(m, "payments 표의 상태 목록을 못 찾았다");
    const statuses = [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
    assert.deepEqual([...statuses].sort(), Object.keys(PAYMENT_STATUS_BRIEF).sort());
    assert.deepEqual(paymentStatusBrief("mystery"), { label: "mystery", tone: "gray" });
  });
  it("결제·구독 화면의 상태 이름·색과 같다(그 파일이 생긴 뒤)", async (t) => {
    const billing = join(SRC, "lib", "admin-billing.ts");
    if (!existsSync(billing)) {
      t.skip("결제·구독 작업이 아직 admin-billing.ts 를 안 만들었다");
      return;
    }
    const mod = (await import(pathToFileURL(billing).href)) as { paymentStatusMeta?: (s: string) => { label: string; tone: string } };
    assert.equal(typeof mod.paymentStatusMeta, "function");
    for (const s of Object.keys(PAYMENT_STATUS_BRIEF)) {
      const a = mod.paymentStatusMeta!(s);
      assert.deepEqual({ label: a.label, tone: a.tone }, paymentStatusBrief(s), s);
    }
  });
});

describe("원문 검사", () => {
  it("회원 목록 경로는 관리자 계정을 빼고 목소리를 준다", () => {
    const src = readFileSync(join(SRC, "app", "api", "admin", "customers", "route.ts"), "utf8");
    assert.ok(src.includes("is_master"));
    assert.ok(src.includes("groupReadyVoices("));
    assert.ok(src.includes("masterOnly("));
  });
  it("회원 상세 경로는 마스터 확인을 거친다", () => {
    for (const f of ["member", "customer"]) {
      const src = readFileSync(join(SRC, "app", "api", "admin", f, "route.ts"), "utf8");
      assert.ok(src.includes("masterOnly("), f);
      assert.ok(!src.includes("SERVICE_ROLE"), f);
    }
  });
});

describe("[회원 목록]으로 돌아갈 주소", () => {
  it("적어 둔 거르기 그대로(기본값은 뺀다)", () => {
    assert.equal(membersListHref("?q=kim&fb=1"), "/admin/members?q=kim&fb=1");
    assert.equal(membersListHref("q=kim&period=7d&sort=books"), "/admin/members?q=kim&period=7d&sort=books");
    assert.equal(membersListHref("?period=all&sort=new"), "/admin/members");
  });
  it("모르는 칸·이상한 값·없는 값은 버린다", () => {
    assert.equal(membersListHref("?q=kim&job=abc&mine=1&period=99d"), "/admin/members?q=kim");
    assert.equal(membersListHref(null), "/admin/members");
    assert.equal(membersListHref(undefined), "/admin/members");
    assert.equal(membersListHref(`?q=${"a".repeat(400)}`), "/admin/members");
  });
});
