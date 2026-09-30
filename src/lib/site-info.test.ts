/**
 * 사이트 정보 시험 — DB 줄 → 맨 아래 줄 값(기본값 채우기), 공개 경로 답 검사, 관리실 입력 검사,
 * 사업자등록번호 검증 숫자. 그리고 SQL 표의 모양 검사와 입력 검사가 같은 선을 쓰는지.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { BUSINESS_INFO } from "./business-info.ts";
import {
  asSiteInfo,
  BUSINESS_COLUMNS,
  BUSINESS_FIELDS,
  BUSINESS_PUBLIC_SELECT,
  businessChangeFromRow,
  businessFieldLabel,
  businessValues,
  docsReadiness,
  FALLBACK_SITE_INFO,
  formatBizNo,
  isValidBizNo,
  mergeBusinessInfo,
  parseBusinessPatch,
  validateBusinessField,
} from "./site-info.ts";

describe("DB 줄 → 맨 아래 줄 값", () => {
  it("줄이 없거나 이상하면 기본값 그대로", () => {
    for (const row of [null, undefined, "x", 3, [], {}]) {
      assert.deepEqual(mergeBusinessInfo(row), FALLBACK_SITE_INFO.business);
    }
    assert.equal(FALLBACK_SITE_INFO.business.name, BUSINESS_INFO.name);
    assert.equal(FALLBACK_SITE_INFO.business.hosting, BUSINESS_INFO.hosting);
    assert.equal(FALLBACK_SITE_INFO.source, "fallback");
    assert.ok(Object.values(FALLBACK_SITE_INFO.docs).every((d) => !d.ready));
  });
  it("값이 있는 칸만 DB 값, 빈 칸·공백·글자 아닌 값·줄바꿈 섞인 값은 기본값", () => {
    const v = mergeBusinessInfo({
      company_name: "  주식회사 요기코퍼레이션 ",
      ceo_name: "홍길동",
      biz_no: "",
      mail_order_no: "   ",
      address: 42,
      phone: "02-000-0000",
      email: "a@b.co\nevil",
      hours: "평일 10:00~18:00",
      hosting: null,
    });
    assert.deepEqual(v, {
      name: "주식회사 요기코퍼레이션",
      ceo: "홍길동",
      bizNo: BUSINESS_INFO.bizNo,
      mailOrderNo: BUSINESS_INFO.mailOrderNo,
      address: BUSINESS_INFO.address,
      phone: "02-000-0000",
      email: BUSINESS_INFO.email,
      hours: "평일 10:00~18:00",
      hosting: "Vercel Inc.",
    });
  });
  it("너무 긴 값은 칸 길이로 자른다", () => {
    assert.equal(mergeBusinessInfo({ address: "가".repeat(500) }).address?.length, 200);
  });
  it("관리실 입력 칸 값은 기본값을 섞지 않는다", () => {
    const vals = businessValues({ company_name: "요기코퍼레이션", ceo_name: null, hosting: "Vercel Inc.", extra: "x" });
    assert.deepEqual(Object.keys(vals).sort(), [...BUSINESS_COLUMNS].sort());
    assert.equal(vals.company_name, "요기코퍼레이션");
    assert.equal(vals.ceo_name, null);
    assert.equal(vals.biz_no, null);
    assert.deepEqual(businessValues(null).company_name, null);
  });
  it("공개로 읽는 칸 목록에 고친 사람 칸이 없다", () => {
    assert.ok(!BUSINESS_PUBLIC_SELECT.includes("updated_by"));
    for (const c of BUSINESS_COLUMNS) assert.ok(BUSINESS_PUBLIC_SELECT.split(",").includes(c), c);
  });
});

describe("문서 준비 상태", () => {
  it("시행 중인 판이 있는 문서만 ready", () => {
    const docs = docsReadiness(
      [
        { kind: "terms", version: 1, effective_date: "2026-09-01" },
        { kind: "terms", version: 2, effective_date: "2026-10-07" },
        { kind: "privacy", version: 1, effective_date: "2026-10-07" },
        { kind: "refund", version: 1, effective_date: "2026-09-30T00:00:00+00:00" },
        { kind: "nope", version: 1, effective_date: "2026-01-01" },
        null,
      ],
      "2026-09-30",
    );
    assert.deepEqual(docs, {
      terms: { ready: true, effectiveDate: "2026-09-01" },
      privacy: { ready: false, effectiveDate: null },
      refund: { ready: true, effectiveDate: "2026-09-30" },
    });
  });
});

describe("공개 경로 답 검사(asSiteInfo)", () => {
  const good = {
    business: {
      name: "요기코퍼레이션",
      ceo: "홍길동",
      bizNo: "124-81-00998",
      mailOrderNo: null,
      address: null,
      phone: "02-000-0000",
      email: null,
      hours: null,
      hosting: "Vercel Inc.",
    },
    docs: { terms: { ready: true, effectiveDate: "2026-10-01" }, privacy: { ready: false, effectiveDate: null }, refund: {} },
    source: "db",
  };
  it("맞는 답은 그대로", () => {
    const s = asSiteInfo(good);
    assert.equal(s.business.ceo, "홍길동");
    assert.equal(s.business.bizNo, "124-81-00998");
    assert.equal(s.source, "db");
    assert.deepEqual(s.docs.terms, { ready: true, effectiveDate: "2026-10-01" });
    assert.deepEqual(s.docs.refund, { ready: false, effectiveDate: null });
  });
  it("이상한 답 → 기본값", () => {
    for (const j of [null, "x", [], {}, { business: "x" }, { business: [] }]) assert.deepEqual(asSiteInfo(j), FALLBACK_SITE_INFO);
  });
  it("칸 하나가 이상하면 그 칸만 기본값 · 꼭 있어야 할 칸(상호·호스팅)은 비울 수 없다", () => {
    const s = asSiteInfo({ ...good, business: { ...good.business, name: null, hosting: "", ceo: { x: 1 }, phone: "a\nb" }, source: "hack" });
    assert.equal(s.business.name, BUSINESS_INFO.name);
    assert.equal(s.business.hosting, BUSINESS_INFO.hosting);
    assert.equal(s.business.ceo, BUSINESS_INFO.ceo);
    assert.equal(s.business.phone, BUSINESS_INFO.phone);
    assert.equal(s.source, "fallback");
  });
  it("ready 는 true 일 때만", () => {
    const s = asSiteInfo({ ...good, docs: { terms: { ready: "yes" }, privacy: { ready: 1 }, refund: { ready: true, effectiveDate: "엉터리" } } });
    assert.equal(s.docs.terms.ready, false);
    assert.equal(s.docs.privacy.ready, false);
    assert.deepEqual(s.docs.refund, { ready: true, effectiveDate: null });
  });
});

describe("사업자등록번호", () => {
  it("검증 숫자 — 알려진 번호는 맞고, 한 자리만 바꾸면 틀린다", () => {
    for (const n of ["1248100998", "2208162517", "1208147521"]) {
      assert.ok(isValidBizNo(n), n);
      const last = (Number(n[9]) + 1) % 10;
      assert.ok(!isValidBizNo(n.slice(0, 9) + last), `${n} 끝자리 바꿈`);
    }
    assert.ok(!isValidBizNo("1234567890"));
    assert.ok(!isValidBizNo("124-81-00998"));
    assert.ok(!isValidBizNo("12481009"));
  });
  it("모양 맞추기", () => {
    assert.equal(formatBizNo("1248100998"), "124-81-00998");
    assert.equal(formatBizNo(" 124 81 00998 "), "124-81-00998");
    assert.equal(formatBizNo("12481"), null);
  });
});

describe("관리실 입력 검사", () => {
  it("칸 하나", () => {
    assert.deepEqual(validateBusinessField("biz_no", "1248100998"), { ok: true, value: "124-81-00998" });
    assert.deepEqual(validateBusinessField("biz_no", "124-81-00998"), { ok: true, value: "124-81-00998" });
    assert.ok(!validateBusinessField("biz_no", "123-45-67890").ok);
    assert.ok(!validateBusinessField("biz_no", "124-81-0099").ok);
    assert.ok(!validateBusinessField("biz_no", "124.81.00998").ok);
    assert.deepEqual(validateBusinessField("ceo_name", "  "), { ok: true, value: null });
    assert.deepEqual(validateBusinessField("ceo_name", null), { ok: true, value: null });
    assert.ok(!validateBusinessField("ceo_name", 3).ok);
    assert.ok(!validateBusinessField("company_name", " ").ok);
    assert.ok(!validateBusinessField("hosting", null).ok);
    assert.ok(validateBusinessField("phone", "02-000-0000").ok);
    assert.ok(validateBusinessField("phone", "+82 (2) 000-0000").ok);
    assert.ok(!validateBusinessField("phone", "공일공").ok);
    assert.ok(!validateBusinessField("phone", "0".repeat(21)).ok);
    assert.ok(validateBusinessField("email", "help@yogico.kr").ok);
    assert.ok(!validateBusinessField("email", "help@yogico").ok);
    assert.ok(!validateBusinessField("email", "a b@c.kr").ok);
    assert.ok(!validateBusinessField("address", "가".repeat(201)).ok);
    assert.ok(validateBusinessField("address", "가".repeat(200)).ok);
    assert.ok(!validateBusinessField("hours", "평일\n주말").ok);
    assert.ok(!validateBusinessField("mail_order_no", "가".repeat(61)).ok);
  });
  it("저장 요청 — 모르는 칸 · 빈 요청 · 사유", () => {
    const r = parseBusinessPatch({ patch: { ceo_name: " 홍길동 ", biz_no: "1248100998", address: "" }, note: " 등록 " });
    assert.ok(r.ok);
    if (r.ok) {
      assert.deepEqual(r.value, { patch: { ceo_name: "홍길동", biz_no: "124-81-00998", address: null }, note: "등록" });
    }
    assert.ok(!parseBusinessPatch({ patch: { updated_by: "x" } }).ok);
    assert.ok(!parseBusinessPatch({ patch: { id: 2 } }).ok);
    assert.ok(!parseBusinessPatch({ patch: {} }).ok);
    assert.ok(!parseBusinessPatch({ patch: [] }).ok);
    assert.ok(!parseBusinessPatch({}).ok);
    assert.ok(!parseBusinessPatch(null).ok);
    assert.ok(!parseBusinessPatch({ patch: { company_name: "" } }).ok);
    assert.ok(!parseBusinessPatch({ patch: { ceo_name: "a" }, note: "가".repeat(501) }).ok);
    assert.ok(!parseBusinessPatch({ patch: { ceo_name: "a" }, note: 5 }).ok);
    const noNote = parseBusinessPatch({ patch: { ceo_name: "a" }, note: "  " });
    assert.ok(noNote.ok && noNote.value.note === null);
  });
  it("칸 목록 — 사이트 줄 순서, 꼭 있어야 할 칸은 상호·호스팅", () => {
    assert.deepEqual(
      BUSINESS_FIELDS.map((f) => f.column),
      ["company_name", "ceo_name", "biz_no", "mail_order_no", "address", "phone", "email", "hours", "hosting"],
    );
    assert.deepEqual(
      BUSINESS_FIELDS.filter((f) => f.required).map((f) => f.column),
      ["company_name", "hosting"],
    );
    assert.equal(businessFieldLabel("biz_no"), "사업자등록번호");
    assert.equal(businessFieldLabel("zzz"), "zzz");
  });
  it("이력 줄", () => {
    assert.deepEqual(
      businessChangeFromRow({ id: 1, field: "ceo_name", old_value: null, new_value: "홍길동", note: null, changed_by_username: "yogico", at: "2026-09-30T05:00:00Z" }),
      { id: 1, field: "ceo_name", oldValue: null, newValue: "홍길동", note: null, changedByUsername: "yogico", at: "2026-09-30T05:00:00Z" },
    );
    assert.equal(businessChangeFromRow("x"), null);
  });
});

describe("SQL 과 같은 선을 쓴다", () => {
  const sql = readFileSync(new URL("../../supabase-admin-console.sql", import.meta.url), "utf8");
  const table = sql.slice(sql.indexOf("create table if not exists public.app_business_info"), sql.indexOf("insert into public.app_business_info"));
  it("표의 칸 이름 = 입력 칸 이름", () => {
    for (const c of BUSINESS_COLUMNS) assert.match(table, new RegExp(`\\n\\s+${c}\\s+text`), c);
  });
  it("칸 길이 상한이 표의 check 와 같다", () => {
    for (const f of BUSINESS_FIELDS) {
      if (f.column === "biz_no" || f.column === "phone") continue; // 모양(정규식)으로 막는 칸
      const m = new RegExp(`${f.column}\\s+text[^\\n]*?(?:between 1 and|<=)\\s*(\\d+)`).exec(table);
      assert.ok(m, `${f.column} 길이 check 가 없다`);
      assert.equal(Number(m[1]), f.max, f.column);
    }
  });
  it("기본값(상호·호스팅)이 표 기본값과 같다", () => {
    assert.ok(table.includes(`default '${BUSINESS_INFO.name}'`));
    assert.ok(table.includes(`default '${BUSINESS_INFO.hosting}'`));
  });
  it("공개 권한 칸 = 공개로 읽는 칸", () => {
    const grant = /grant select \(([^)]+)\)\s*on public\.app_business_info to anon, authenticated/.exec(sql);
    assert.ok(grant);
    const cols = grant[1].split(",").map((s) => s.trim()).sort();
    assert.deepEqual(cols, BUSINESS_PUBLIC_SELECT.split(",").sort());
  });
});
