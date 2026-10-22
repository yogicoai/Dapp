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
  promoBenefitLines,
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
