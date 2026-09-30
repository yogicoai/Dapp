/**
 * 관리자 대시보드 숫자 시험 — 한국 날짜 끊기 · 관리자 계정 기록 빼기 · 못 읽은 숫자 · 되돌린 토큰 · 나눠 읽기.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  dashboardWindow,
  needsAttention,
  readAllPages,
  shortDayLabel,
  summarizeDashboard,
  weekDayKeys,
  type DashboardInput,
} from "./admin-dashboard.ts";

// 2026-09-30 14:00 KST = 05:00 UTC
const NOW = new Date("2026-09-30T05:00:00Z");
const ME = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER_MASTER = "aaaaaaaa-0000-4000-8000-000000000002";
const MEMBER = "bbbbbbbb-0000-4000-8000-000000000003";
const MEMBER2 = "bbbbbbbb-0000-4000-8000-000000000004";
const masters = new Set([ME, OTHER_MASTER]);

/** 고객 줄만 있는 기본 재료. 시험마다 관리자 줄을 더해 숫자가 바뀌는지 본다. */
function base(): DashboardInput {
  return {
    profiles: {
      rows: [
        { id: MEMBER, username: "kim", is_master: false, created_at: "2026-09-30T01:00:00Z" }, // 오늘 10시
        { id: MEMBER2, username: "lee", is_master: false, created_at: "2026-09-26T03:00:00Z" },
      ],
    },
    memberTotal: 42,
    recent: {
      rows: [
        { id: MEMBER2, username: "lee", is_master: false, created_at: "2026-09-26T03:00:00Z" },
        { id: MEMBER, username: "kim", is_master: false, created_at: "2026-09-30T01:00:00Z" },
      ],
    },
    books: { rows: [{ owner: MEMBER, created_at: "2026-09-30T02:00:00Z" }, { owner: MEMBER2, created_at: "2026-09-27T02:00:00Z" }] },
    ledger: {
      rows: [
        { owner: MEMBER, amount: 3, refunded_at: null, created_at: "2026-09-30T02:00:00Z" },
        { owner: MEMBER2, amount: 5, refunded_at: null, created_at: "2026-09-27T02:00:00Z" },
        // 오늘 쓰고 오늘 되돌린 것 — 쓴 토큰에서 빠지고 되돌린 토큰에 들어간다
        { owner: MEMBER, amount: 7, refunded_at: "2026-09-30T04:00:00Z", created_at: "2026-09-30T03:00:00Z" },
      ],
    },
    refunded: {
      rows: [
        { owner: MEMBER, amount: 7, refunded_at: "2026-09-30T04:00:00Z", created_at: "2026-09-30T03:00:00Z" },
        // 8일 전에 쓰고 사흘 전에 되돌린 것 — 되돌린 날(7일 안)로 센다
        { owner: MEMBER2, amount: 2, refunded_at: "2026-09-27T04:00:00Z", created_at: "2026-09-22T03:00:00Z" },
      ],
    },
    incidents: {
      rows: [
        { member: MEMBER, kinds: ["paid_not_saved"], resolved_at: null },
        { member: MEMBER2, kinds: ["stuck"], resolved_at: null },
        { member: MEMBER2, kinds: ["failed"], resolved_at: "2026-09-29T00:00:00Z" },
      ],
    },
    feedback: { rows: [{ owner: MEMBER, handled_at: null }] },
  };
}

/** 관리자 계정(나 · 다른 관리자)의 책·장부·사고·의견·가입을 더한다. */
function withMasterRows(i: DashboardInput): DashboardInput {
  return {
    ...i,
    profiles: {
      rows: [
        ...(i.profiles.rows ?? []),
        { id: ME, username: "fe", is_master: true, created_at: "2026-09-30T02:00:00Z" },
        // is_master 칸이 비어도 id 로 관리자인 걸 안다
        { id: OTHER_MASTER, username: "yogico", is_master: null, created_at: "2026-09-29T02:00:00Z" },
      ],
    },
    recent: {
      rows: [
        ...(i.recent.rows ?? []),
        { id: ME, username: "fe", is_master: true, created_at: "2026-09-30T04:30:00Z" },
      ],
    },
    books: {
      rows: [
        ...(i.books.rows ?? []),
        { owner: ME, created_at: "2026-09-30T02:30:00Z" },
        { owner: OTHER_MASTER.toUpperCase(), created_at: "2026-09-28T02:30:00Z" },
      ],
    },
    ledger: {
      rows: [
        ...(i.ledger.rows ?? []),
        { owner: ME, amount: 100, refunded_at: null, created_at: "2026-09-30T02:30:00Z" },
        { owner: OTHER_MASTER, amount: 50, refunded_at: null, created_at: "2026-09-28T02:30:00Z" },
      ],
    },
    refunded: {
      rows: [...(i.refunded.rows ?? []), { owner: ME, amount: 9, refunded_at: "2026-09-30T03:30:00Z", created_at: "2026-09-30T03:00:00Z" }],
    },
    incidents: {
      rows: [
        ...(i.incidents.rows ?? []),
        { member: ME, kinds: ["failed"], resolved_at: null },
        { member: ME, kinds: ["paid_not_saved", "stuck"], resolved_at: null },
        { member: OTHER_MASTER, kinds: ["stuck"], resolved_at: null },
      ],
    },
    feedback: { rows: [...(i.feedback.rows ?? []), { owner: ME, handled_at: null }, { owner: OTHER_MASTER, handled_at: null }] },
  };
}

const run = (i: DashboardInput, includeMine = false) => summarizeDashboard(i, { now: NOW, masterIds: masters, includeMine });

describe("기간 — 한국 날짜", () => {
  it("오늘 0시 · 6일 전 0시", () => {
    const w = dashboardWindow(NOW);
    assert.equal(w.todayStart, "2026-09-29T15:00:00.000Z");
    assert.equal(w.weekStart, "2026-09-23T15:00:00.000Z");
  });
  it("7칸, 오래된 날부터, 오늘로 끝난다", () => {
    const keys = weekDayKeys(NOW);
    assert.equal(keys.length, 7);
    assert.equal(keys[0], "2026-09-24");
    assert.equal(keys[6], "2026-09-30");
  });
  it("UTC 15:30 에 생긴 줄은 한국 날짜로 다음 날 칸에 든다", () => {
    const i = base();
    i.books = { rows: [{ owner: MEMBER, created_at: "2026-09-28T15:30:00Z" }] }; // 한국 9/29 00:30
    const d = run(i);
    assert.equal(d.days.find((x) => x.day === "2026-09-29")?.books, 1);
    assert.equal(d.days.find((x) => x.day === "2026-09-28")?.books, 0);
  });
  it("7일보다 앞선 줄은 세지 않는다", () => {
    const i = base();
    i.books = { rows: [{ owner: MEMBER, created_at: "2026-09-23T14:59:00Z" }] }; // 한국 9/23 23:59
    const d = run(i);
    assert.equal(d.books.week, 0);
    assert.equal(d.days.reduce((s, x) => s + (x.books ?? 0), 0), 0);
  });
  it("짧은 날짜 이름", () => {
    assert.equal(shortDayLabel("2026-09-04"), "9/4");
    assert.equal(shortDayLabel("이상"), "이상");
  });
});

describe("숫자 세기", () => {
  it("고객 줄만 있을 때", () => {
    const d = run(base());
    assert.deepEqual(d.members, { today: 1, week: 2, total: 42 });
    assert.deepEqual(d.books, { today: 1, week: 2 });
    assert.deepEqual(d.tokensSpent, { today: 3, week: 8 }); // 되돌린 7 은 빠진다
    assert.deepEqual(d.tokensRefunded, { today: 7, week: 9 }); // 되돌린 날로 센다
    assert.deepEqual(d.incidents, { open: 2, paidNotSaved: 1, stuck: 1 });
    assert.deepEqual(d.feedback, { open: 1 });
    assert.deepEqual(d.partial, []);
    assert.equal(d.truncated, false);
    assert.equal(d.days.length, 7);
    assert.equal(d.days[6].tokensSpent, 3);
    assert.deepEqual(d.recentMembers.map((m) => m.username), ["kim", "lee"]);
  });

  it("관리자 계정 기록은 (스위치 꺼짐) 어느 숫자도 바꾸지 않는다", () => {
    const plain = run(base());
    const mixed = run(withMasterRows(base()));
    assert.deepEqual(mixed, plain);
  });

  it("'내 계정 것도 보기'면 책·장부·사고·의견은 세고, 회원 수·최근 가입은 여전히 뺀다", () => {
    const d = run(withMasterRows(base()), true);
    assert.deepEqual(d.books, { today: 2, week: 4 });
    assert.deepEqual(d.tokensSpent, { today: 103, week: 158 });
    assert.deepEqual(d.tokensRefunded, { today: 16, week: 18 });
    assert.deepEqual(d.incidents, { open: 5, paidNotSaved: 2, stuck: 3 });
    assert.deepEqual(d.feedback, { open: 3 });
    assert.deepEqual(d.members, { today: 1, week: 2, total: 42 });
    assert.ok(!d.recentMembers.some((m) => m.id === ME || m.id === OTHER_MASTER));
    assert.equal(d.includeMine, true);
  });

  it("주인이 빈 줄(탈퇴 회원)은 고객 것이라 센다", () => {
    const i = base();
    i.books = { rows: [{ owner: null, created_at: "2026-09-30T02:00:00Z" }] };
    assert.equal(run(i).books.today, 1);
  });

  it("'저장 뒤 고객이 삭제'만 있는 사고는 열린 사고로 세지 않는다", () => {
    const i = base();
    i.incidents = { rows: [{ member: MEMBER, kinds: ["deleted_after_save"], resolved_at: null }] };
    assert.deepEqual(run(i).incidents, { open: 0, paidNotSaved: 0, stuck: 0 });
  });

  it("음수·이상한 금액은 0 으로", () => {
    const i = base();
    i.ledger = { rows: [{ owner: MEMBER, amount: -5, refunded_at: null, created_at: "2026-09-30T02:00:00Z" }, { owner: MEMBER, amount: null, refunded_at: null, created_at: "2026-09-30T02:00:00Z" }] };
    assert.equal(run(i).tokensSpent.today, 0);
  });
});

describe("못 읽은 부분", () => {
  it("못 읽은 칸은 0 이 아니라 null, partial 에 적힌다", () => {
    const i = base();
    i.books = { rows: null };
    i.incidents = { rows: null };
    i.refunded = { rows: null };
    const d = run(i);
    assert.deepEqual(d.books, { today: null, week: null });
    assert.deepEqual(d.tokensSpent, { today: null, week: null }); // 장부 둘 중 하나라도 못 읽으면 토큰 칸 전부
    assert.equal(d.incidents, null);
    assert.ok(d.days.every((x) => x.books === null && x.tokensSpent === null && typeof x.members === "number"));
    assert.deepEqual([...d.partial].sort(), ["books", "incidents", "ledger"]);
  });
  it("전체 회원 수를 못 읽으면 null", () => {
    const i = base();
    i.memberTotal = null;
    assert.equal(run(i).members.total, null);
  });
  it("최근 가입을 못 읽으면 members 가 partial", () => {
    const i = base();
    i.recent = { rows: null };
    const d = run(i);
    assert.deepEqual(d.partial, ["members"]);
    assert.deepEqual(d.recentMembers, []);
  });
  it("상한에 닿은 읽기가 있으면 truncated", () => {
    const i = base();
    i.ledger = { ...i.ledger, truncated: true };
    assert.equal(run(i).truncated, true);
  });
  it("처리할 일 — 모름 · 없음 · 있음", () => {
    assert.equal(needsAttention({ incidents: null, feedback: { open: 0 } }), "unknown");
    assert.equal(needsAttention({ incidents: null, feedback: { open: 2 } }), "some");
    assert.equal(needsAttention({ incidents: { open: 0, paidNotSaved: 0, stuck: 0 }, feedback: { open: 0 } }), "none");
    assert.equal(needsAttention({ incidents: { open: 1, paidNotSaved: 0, stuck: 1 }, feedback: { open: 0 } }), "some");
  });
});

describe("나눠 읽기", () => {
  const table = Array.from({ length: 2500 }, (_, i) => ({ n: i }));
  const fake = (serverMax: number) => {
    const calls: [number, number][] = [];
    const page = async (from: number, to: number) => {
      calls.push([from, to]);
      return { data: table.slice(from, Math.min(to + 1, from + serverMax)), error: null };
    };
    return { page, calls };
  };
  it("서버 상한(1000)보다 많아도 끝까지 읽는다", async () => {
    const { page } = fake(1000);
    const r = await readAllPages<{ n: number }>(page, 10_000);
    assert.equal(r.rows.length, 2500);
    assert.equal(r.truncated, false);
    assert.equal(r.rows[2499].n, 2499);
  });
  it("서버 상한이 쪽 크기보다 작아도 줄을 빠뜨리지 않는다", async () => {
    const { page } = fake(300);
    const r = await readAllPages<{ n: number }>(page, 10_000);
    assert.equal(r.rows.length, 2500);
    assert.deepEqual(r.rows.map((x) => x.n), table.map((x) => x.n));
  });
  it("cap 에 닿으면 truncated", async () => {
    const { page } = fake(1000);
    const r = await readAllPages<{ n: number }>(page, 1200);
    assert.equal(r.rows.length, 1200);
    assert.equal(r.truncated, true);
  });
  it("오류가 나면 그 오류를 돌려준다", async () => {
    const r = await readAllPages(async () => ({ data: null, error: { code: "42501", message: "no" } }), 100);
    assert.equal(r.error?.code, "42501");
  });
});
