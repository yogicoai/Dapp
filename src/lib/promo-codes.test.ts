import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  endOfDayKst,
  formatPromoCode,
  isPromoCodeShape,
  kstDayOf,
  koDate,
  libraryPassUntil,
  myPromosOf,
  normalizePromoCode,
  parsePromoCreateBody,
  parsePromoUpdateBody,
  pendingCodeOf,
  pendingCodeRecord,
  memberPromosOf,
  parsePromoToggleBody,
  parsePromoUsersQuery,
  promoBenefitLines,
  promoEventFilter,
  promoEventLive,
  promoEventsOf,
  promoStatsOf,
  promoUsersCsv,
  promoUsersOf,
  promoBenefitShort,
  promoLinkOf,
  promoLookupOf,
  promoOverviewOf,
  redeemReplyOf,
  REDEEM_REASON_MESSAGE,
  serialCsv,
  serialCsvName,
  serialRowsOf,
} from "./promo-codes.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const NOW = Date.parse("2026-10-22T03:00:00Z");

describe("혜택 코드 — lib/promo-codes (사장님 2026-10-22 미팅: 요기보 회원 혜택·구매 고객 시리얼)", () => {
  it("코드 다듬기는 DB 와 같다 — 띄어쓰기·하이픈·소문자를 받고 영문·숫자 4~24자만", () => {
    assert.equal(normalizePromoCode(" yo-gibo "), "YOGIBO");
    assert.equal(normalizePromoCode("abcd-efgh-jklm"), "ABCDEFGHJKLM");
    assert.equal(normalizePromoCode(42), "");
    assert.equal(isPromoCodeShape("YOGIBO"), true);
    assert.equal(isPromoCodeShape("ABC"), false);
    assert.equal(isPromoCodeShape("A".repeat(25)), false);
    const sql = read("../../supabase-promo-codes.sql");
    assert.ok(sql.includes("upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))"), "DB 다듬기와 다르다");
    assert.ok(sql.includes("'^[A-Z0-9]{4,24}$'"));
  });

  it("시리얼은 4자리씩 보여 주고, 링크는 /code/<코드>", () => {
    assert.equal(formatPromoCode("ABCDEFGHJKLM", "serial"), "ABCD-EFGH-JKLM");
    assert.equal(formatPromoCode("YOGIBO", "shared"), "YOGIBO");
    assert.equal(promoLinkOf("https://example.com/", "YOGIBO"), "https://example.com/code/YOGIBO");
  });

  it("넣은 결과 읽기 — 성공·이미 받음·실패 이유, 모양이 틀리면 null", () => {
    const ok = redeemReplyOf({ ok: true, already: false, kind: "shared", label: "요기보", book_credits: 0, draw_credits: 0, library_until: "2026-12-31T14:59:59+00:00" });
    assert.deepEqual(ok, { ok: true, already: false, kind: "shared", label: "요기보", bookCredits: 0, drawCredits: 0, libraryUntil: "2026-12-31T14:59:59+00:00" });
    assert.deepEqual(redeemReplyOf({ ok: false, reason: "used" }), { ok: false, reason: "used" });
    assert.equal(redeemReplyOf({ ok: false, reason: "hack" }), null);
    assert.equal(redeemReplyOf({ ok: true, kind: "vip" }), null);
    assert.equal(redeemReplyOf(null), null);
    for (const reason of ["not_found", "ended", "used", "too_many"] as const) assert.ok(REDEEM_REASON_MESSAGE[reason]);
  });

  it("혜택 글 — 전체 듣기 날짜는 한국 시간으로", () => {
    assert.equal(koDate("2026-12-31T14:59:59Z"), "2026년 12월 31일");
    assert.deepEqual(promoBenefitLines({ bookCredits: 1, drawCredits: 1, libraryUntil: "2026-12-31T14:59:59Z" }), [
      "세계명작·전래동화 전체 듣기 (2026년 12월 31일까지)",
      "우리 아이 동화 1권 만들기",
      "가족 캐릭터 그리기 1번",
    ]);
    assert.equal(promoBenefitShort({ bookCredits: 1, drawCredits: 0, libraryUntil: null, libraryDays: 30 }), "동화 1권 · 전체 듣기 30일");
  });

  it("전체 듣기 — 지금 열린 것 중 가장 늦은 끝, 지난 것·이상한 값은 빼고", () => {
    const rows = [{ library_until: "2026-10-01T00:00:00Z" }, { library_until: "2026-12-31T14:59:59Z" }, { library_until: null }, { library_until: "x" }, null];
    assert.equal(libraryPassUntil(rows, NOW), "2026-12-31T14:59:59Z");
    assert.equal(libraryPassUntil([{ library_until: "2026-10-01T00:00:00Z" }], NOW), null);
    assert.equal(myPromosOf([{ label: "a", at: "2026-10-01T00:00:00Z" }, { label: "b", at: "2026-10-20T00:00:00Z", book_credits: 1 }, { at: "x" }]).map((p) => p.label).join(), "b,a");
  });

  it("로그인 뒤 이어서 넣기 — 1시간 안의 코드만", () => {
    const rec = pendingCodeRecord("YOGIBO", NOW);
    assert.equal(pendingCodeOf(rec, NOW + 30 * 60_000), "YOGIBO");
    assert.equal(pendingCodeOf(rec, NOW + 61 * 60_000), null);
    assert.equal(pendingCodeOf("{bad", NOW), null);
    assert.equal(pendingCodeOf(JSON.stringify({ code: "ab", at: NOW }), NOW), null);
    assert.equal(pendingCodeOf(null, NOW), null);
  });

  it("관리실 날짜 — 고른 날 한국 시간 23:59:59, 없는 날은 거절", () => {
    assert.equal(endOfDayKst("2026-12-31"), "2026-12-31T23:59:59+09:00");
    assert.equal(endOfDayKst("2026-02-30"), null);
    assert.equal(endOfDayKst("12/31"), null);
    assert.equal(kstDayOf("2026-12-31T14:59:59Z"), "2026-12-31");
    assert.equal(kstDayOf(null), "");
  });

  it("만들기 본문 검사 — 공용 코드·시리얼 묶음, 혜택 없음·둘 다·장수", () => {
    const shared = parsePromoCreateBody({ mode: "shared", code: "yogibo-2", label: "요기보 회원", libraryUntil: "2026-12-31", endsAt: "2026-12-31" });
    assert.ok(shared.ok && shared.value.mode === "shared" && shared.value.code === "YOGIBO2" && shared.value.libraryUntil === "2026-12-31T23:59:59+09:00");
    const serial = parsePromoCreateBody({ mode: "serial", count: 500, label: "요기보 구매 1차", bookCredits: 1, drawCredits: 1, endsAt: "2027-10-31" });
    assert.ok(serial.ok && serial.value.mode === "serial" && serial.value.count === 500 && serial.value.libraryUntil === null);
    const bad = (b: unknown) => {
      const r = parsePromoCreateBody(b);
      assert.equal(r.ok, false, JSON.stringify(b));
    };
    bad({ mode: "serial", count: 0, label: "묶음", bookCredits: 1 });
    bad({ mode: "serial", count: 2001, label: "묶음", bookCredits: 1 });
    bad({ mode: "serial", count: 10, label: "묶음" });
    bad({ mode: "shared", code: "좋아", label: "이름", bookCredits: 1 });
    bad({ mode: "shared", code: "GOOD", label: "a", bookCredits: 1 });
    bad({ mode: "shared", code: "GOOD", label: "이름", libraryUntil: "2026-12-31", libraryDays: 30 });
    bad({ mode: "shared", code: "GOOD", label: "이름", libraryDays: 0 });
    bad({ mode: "shared", code: "GOOD", label: "이름", bookCredits: 11 });
    bad({ mode: "vip", label: "이름", bookCredits: 1 });
    bad(null);
  });

  it("고치기 본문 검사", () => {
    const s = parsePromoUpdateBody({ mode: "shared", id: 3, active: false, endsAt: "", libraryUntil: "2027-03-31" });
    assert.ok(s.ok && s.value.mode === "shared" && s.value.endsAt === null && s.value.libraryUntil === "2027-03-31T23:59:59+09:00");
    const b = parsePromoUpdateBody({ mode: "serial", label: "요기보 구매 1차", active: true, endsAt: null });
    assert.ok(b.ok && b.value.mode === "serial");
    assert.equal(parsePromoUpdateBody({ mode: "shared", id: 3 }).ok, false);
    assert.equal(parsePromoUpdateBody({ mode: "shared", id: -1, active: true }).ok, false);
  });

  it("관리실 읽기 — 한눈에·시리얼 줄·코드 찾기, 틀린 줄은 버린다", () => {
    const o = promoOverviewOf({
      shared: [{ id: 1, code: "YOGIBO", label: "요기보", library_until: "2026-12-31T14:59:59Z", used: 3, active: true, created_at: "2026-10-22T00:00:00Z" }, { id: "x" }],
      batches: [{ label: "요기보 구매 1차", total: 500, used: 12, active: 500, book_credits: 1, draw_credits: 1, created_at: "2026-10-22T00:00:00Z" }, {}],
    });
    assert.equal(o.shared.length, 1);
    assert.equal(o.batches.length, 1);
    assert.equal(o.batches[0].used, 12);
    const rows = serialRowsOf([{ code: "ABCDEFGHJKLM", used: true, active: true, used_at: "2026-10-23T01:00:00Z" }, { code: "bad!" }]);
    assert.equal(rows.length, 1);
    assert.deepEqual(promoLookupOf({ found: false }), { found: false });
    const l = promoLookupOf({ found: true, code: "ABCDEFGHJKLM", kind: "serial", label: "1차", active: true, used: 1, max_uses: 1, uses: [{ who: "lee", at: "2026-10-23T01:00:00Z" }] });
    assert.ok(l && l.found && l.uses[0].who === "lee" && l.maxUses === 1);
  });

  it("시리얼 내려받기(CSV) — BOM·머리줄·4자리 끊기·링크·사용 여부, 수식 글자 막기", () => {
    const csv = serialCsv(
      [
        { code: "ABCDEFGHJKLM", used: false, active: true, usedAt: null },
        { code: "NPQRSTUVWXYZ", used: true, active: true, usedAt: "2026-10-23T01:00:00Z" },
      ],
      "https://example.com",
    );
    assert.ok(csv.startsWith("﻿시리얼,링크,사용,사용한 날\r\n"));
    assert.ok(csv.includes("ABCD-EFGH-JKLM,https://example.com/code/ABCDEFGHJKLM,,\r\n"));
    assert.ok(csv.includes("NPQR-STUV-WXYZ,https://example.com/code/NPQRSTUVWXYZ,사용함,2026-10-23"));
    assert.equal(serialCsvName("요기보 구매/1차", "2026-10-22"), "요기보_구매_1차_2026-10-22.csv");
  });

  it("문지기 — AI 경로마다 종류를 넘기고, 요금제가 없으면 DB 의 credit_gate 가 크레딧 한도를 깎는다", () => {
    const kinds: Record<string, string> = {
      outline: "outline",
      story: "story",
      "character-sheet": "image",
      "location-sheet": "image",
      "illustrate-page": "image",
      "upload-art": "upload",
    };
    for (const [route, kind] of Object.entries(kinds)) {
      const src = read(`../app/api/${route}/route.ts`);
      assert.ok(src.includes(`if (!(await canCreate(caller, "${kind}"))) return createLockedResponse();`), `${route} 의 문지기 종류가 다르다`);
    }
    const portrait = read("../app/api/family/portrait/route.ts");
    assert.ok(portrait.includes(`if (!(await canCreate(caller, "portrait"))) return fail(403, CREATE_LOCKED_MESSAGE, CREATE_LOCKED_CODE);`));
    const gate = read("./create-access-server.ts");
    assert.ok(gate.includes('caller.db.rpc("credit_gate", { p_kind: kind })'));
    assert.ok(!/SERVICE_ROLE|service_role/.test(gate));
  });

  it("손님 화면 — 설정에 코드 칸, 링크 화면, 로그인 뒤 이어서 넣기, 책장은 전체 듣기를 가족 패스로", () => {
    assert.ok(read("../app/settings/page.tsx").includes("<PromoCodeCard"));
    assert.ok(read("../app/code/[code]/page.tsx").length > 0);
    assert.ok(read("../app/login/page.tsx").includes("pendingPromoPath()"));
    for (const f of ["../app/page.tsx", "../app/book/[id]/LibraryGate.tsx", "../components/BookViewer.tsx"]) {
      assert.ok(read(f).includes("loadMyLibraryPass("), `${f} 가 전체 듣기 혜택을 안 본다`);
    }
  });
});

describe("혜택·이벤트 관리 — 이벤트 목록·고객 목록(사장님 2026-10-22 \"해당 혜택 사용한 고객 리스트까지\")", () => {
  const shared = { id: 1, code: "YOGIBO", label: "요기보 회원 혜택", bookCredits: 0, drawCredits: 0, libraryUntil: "2026-12-31T14:59:59Z", libraryDays: null, endsAt: "2026-12-31T14:59:59Z", used: 3, active: true, createdAt: "2026-10-22T01:00:00Z", by: "SQL" };
  const batch = { label: "요기보 구매 1차", total: 100, used: 4, active: 100, bookCredits: 1, drawCredits: 1, libraryUntil: null, libraryDays: null, endsAt: null, createdAt: "2026-10-22T05:00:00Z", by: "fe" };

  it("이벤트 = 공용 코드 하나 또는 시리얼 묶음 하나, 만든 때 최근 순 · 열쇠 c:번호 / b:이름", () => {
    const ev = promoEventsOf({ shared: [shared], batches: [batch] });
    assert.deepEqual(ev.map((e) => e.key), ["b:요기보 구매 1차", "c:1"]);
    assert.deepEqual(promoEventFilter("c:1"), { codeId: 1, label: null });
    assert.deepEqual(promoEventFilter("b:요기보 구매 1차"), { codeId: null, label: "요기보 구매 1차" });
    assert.deepEqual(promoEventFilter("all"), { codeId: null, label: null });
    assert.equal(promoEventFilter("c:x"), null);
    assert.equal(promoEventFilter("b:a"), null);
    assert.equal(promoEventFilter(null), null);
  });

  it("진행 중 — 켜져 있고 넣는 기한 전(시리얼은 한 장이라도 켜져 있으면)", () => {
    const [b, c] = promoEventsOf({ shared: [shared], batches: [batch] });
    assert.equal(promoEventLive(c, NOW), true);
    assert.equal(promoEventLive(c, Date.parse("2027-01-01T00:00:00Z")), false);
    assert.equal(promoEventLive({ ...c, shared: { ...shared, active: false } } as typeof c, NOW), false);
    assert.equal(promoEventLive(b, NOW), true);
    assert.equal(promoEventLive({ ...b, batch: { ...batch, active: 0 } } as typeof b, NOW), false);
  });

  it("고객 목록 읽기 — 탈퇴 회원(id 없음)도 줄로, 틀린 줄은 버림 · 숫자 · 회원별", () => {
    const page = promoUsersOf({
      total: 2,
      last7: 1,
      rows: [
        { id: "11111111-1111-1111-1111-111111111111", who: "lee", at: "2026-10-22T05:00:00Z", code: "ABCDEFGHJKLM", kind: "serial", label: "요기보 구매 1차", book_credits: 1, draw_credits: 1 },
        { id: null, who: null, at: "2026-10-21T05:00:00Z", code: "YOGIBO", kind: "shared", label: "요기보 회원 혜택", library_until: "2026-12-31T14:59:59Z" },
        { who: "bad" },
      ],
    });
    assert.equal(page.total, 2);
    assert.equal(page.rows.length, 2);
    assert.equal(page.rows[1].id, null);
    assert.deepEqual(promoStatsOf({ customers: 3, redemptions: 4, last7: 4, today: 1 }), { customers: 3, redemptions: 4, last7: 4, today: 1 });
    assert.equal(promoStatsOf(null), null);
    assert.equal(memberPromosOf([{ at: "2026-10-22T05:00:00Z", code: "YOGIBO", kind: "shared", label: "x" }, {}]).length, 1);
  });

  it("고객 목록 주소 값 검사 — 번호·이름·찾기·나눠 보기 범위", () => {
    const ok = parsePromoUsersQuery(new URLSearchParams("label=요기보 구매 1차&q=lee&offset=50&limit=50"));
    assert.ok(ok.ok && ok.value.label === "요기보 구매 1차" && ok.value.q === "lee" && ok.value.offset === 50 && ok.value.codeId === null);
    const all = parsePromoUsersQuery(new URLSearchParams(""));
    assert.ok(all.ok && all.value.limit === 50 && all.value.offset === 0);
    for (const bad of ["codeId=0", "codeId=x", "label=a", "limit=0", "limit=501", "offset=-1", "offset=1.5"]) {
      assert.equal(parsePromoUsersQuery(new URLSearchParams(bad)).ok, false, bad);
    }
    assert.deepEqual(parsePromoToggleBody({ code: "abcd-efgh-jklm", active: false }), { ok: true, value: { code: "ABCDEFGHJKLM", active: false } });
    assert.equal(parsePromoToggleBody({ code: "ab", active: true }).ok, false);
    assert.equal(parsePromoToggleBody({ code: "YOGIBO" }).ok, false);
  });

  it("고객 목록 엑셀(CSV) — 아이디·코드(시리얼은 4자리씩)·이벤트·받은 날·받은 혜택, 탈퇴 회원 표시", () => {
    const csv = promoUsersCsv(
      promoUsersOf({
        rows: [
          { id: "x", who: "lee", at: "2026-10-22T05:00:00Z", code: "ABCDEFGHJKLM", kind: "serial", label: "요기보 구매 1차", book_credits: 1, draw_credits: 1 },
          { id: null, who: null, at: "2026-10-21T05:00:00Z", code: "YOGIBO", kind: "shared", label: "요기보 회원 혜택", library_until: "2026-12-31T14:59:59Z" },
        ],
      }).rows,
    );
    assert.equal(csv.charCodeAt(0), 0xfeff);
    assert.ok(csv.startsWith(String.fromCharCode(0xfeff) + "아이디,코드,혜택·이벤트,받은 날,받은 혜택" + String.fromCharCode(13, 10)));
    assert.ok(csv.includes("lee,ABCD-EFGH-JKLM,요기보 구매 1차,2026-10-22,우리 아이 동화 1권 만들기 / 가족 캐릭터 그리기 1번"));
    assert.ok(csv.includes("(탈퇴한 회원),YOGIBO,요기보 회원 혜택,2026-10-21,세계명작·전래동화 전체 듣기 (2026년 12월 31일까지)"));
  });

  it("관리실 메뉴 '혜택·이벤트'(/admin/benefits) · 회원 화면 '받은 혜택' · 고객 목록 경로는 관리자만", () => {
    assert.ok(read("../components/admin/members/MemberDetailPage.tsx").includes("<MemberPromosCard memberId={id} />"));
    const users = read("../app/api/admin/promo/users/route.ts");
    assert.ok(users.includes("masterOnly(") && users.includes('rpc("master_promo_users"'));
    const sql = read("../../supabase-promo-admin.sql");
    for (const fn of ["master_promo_users", "master_set_promo_code_active", "master_member_promos", "master_promo_stats"]) {
      assert.ok(sql.includes(`function public.${fn}(`), fn);
      assert.ok(sql.includes(`revoke all on function public.${fn}(`) && sql.includes(`function public.${fn}(`), `${fn} 손님 막기`);
    }
  });
});
