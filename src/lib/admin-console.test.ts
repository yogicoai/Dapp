/**
 * 관리자 페이지 정식판(2026-09-30) 공용 함수 시험 + 원문 검사.
 *
 *  · 메뉴 주소마다 화면 파일이 실제로 있나(주소만 바꾸고 page.tsx 를 안 옮기면 404).
 *  · 회사 계정 이름이 세 곳(여기 · 가격 경로 · DB 함수)에서 같은가.
 *  · 시연 켜짐/꺼짐 규칙이 결제 시연 모듈과 같은가(관리실은 그 모듈을 가져올 수 없어 규칙을 한 번 더 적었다).
 *  · 한국 시각 경계 · 돈 표시 · id 검사 · 주소 고치기 · 관리자 계정 기록 빼기.
 *  · 관리실 파일에 원가·마진 같은 내부 숫자 말, 서비스 키, 날것의 HTML 넣기가 없나.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  ADMIN_NAV,
  ADMIN_NAV_GROUPS,
  COMPANY_ADMIN,
  activeNavKey,
  clampLimit,
  dropMasterRows,
  formatKstDateTime,
  formatWon,
  groupDigits,
  isMineFlag,
  isPeriodPreset,
  isSchemaMissing,
  kstDayKey,
  kstDayStartIso,
  kstDaysAgoStart,
  kstRange,
  leaveDialogText,
  navItem,
  parseAdminId,
  payDemoState,
  safeAdminNext,
  withParams,
} from "./admin-console.ts";
import { payDemoMode } from "./pay-demo.ts";

const SRC = new URL("../", import.meta.url); // src/
const ROOT = new URL("../../", import.meta.url); // 저장소
const at = (rel: string) => new URL(rel, SRC);
const read = (rel: string) => readFileSync(at(rel), "utf8");

function listFiles(dirRel: string): string[] {
  const dir = at(`${dirRel}/`);
  if (!existsSync(dir)) return [];
  return (readdirSync(dir, { recursive: true }) as unknown[])
    .map((f) => String(f).replace(/\\/g, "/"))
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .map((f) => `${dirRel}/${f}`);
}

describe("메뉴", () => {
  it("메뉴 주소마다 src/app 아래 page.tsx 가 있다", () => {
    for (const n of ADMIN_NAV) {
      assert.ok(existsSync(at(`app${n.href}/page.tsx`)), `${n.href} 화면 파일이 없다`);
    }
  });
  it("여섯 메뉴 · 세 묶음 · 결제에만 '연동 전' 꼬리표", () => {
    assert.equal(ADMIN_NAV.length, 6);
    assert.deepEqual([...new Set(ADMIN_NAV.map((n) => n.group))], [...ADMIN_NAV_GROUPS]);
    assert.deepEqual(
      ADMIN_NAV.filter((n) => n.tag).map((n) => [n.key, n.tag]),
      [["billing", "연동 전"]],
    );
  });
  it("activeNavKey — /admin 은 정확히 같을 때만, 나머지는 가장 길게 맞는 것", () => {
    assert.equal(activeNavKey("/admin"), "dashboard");
    assert.equal(activeNavKey("/admin/"), "dashboard");
    assert.equal(activeNavKey("/admin/members"), "members");
    assert.equal(activeNavKey("/admin/members/0b8f1c2e-1111-4222-8333-444455556666"), "members");
    assert.equal(activeNavKey("/admin/billing?demo=1"), "billing");
    assert.equal(activeNavKey("/admin/support#x"), "support");
    assert.equal(activeNavKey("/admin/membersx"), null);
    assert.equal(activeNavKey("/admin/unknown"), null);
    assert.equal(activeNavKey("/settings"), null);
    assert.equal(activeNavKey(null), null);
  });
  it("navItem — 모르는 열쇠는 대시보드", () => {
    assert.equal(navItem("pricing").href, "/admin/pricing");
  });
});

describe("회사 계정 · 시연 상태", () => {
  it("COMPANY_ADMIN 이 가격 경로 PRICING_ADMIN · DB is_pricing_admin() 과 같다", () => {
    const route = read("app/api/admin/pricing/route.ts");
    const m = /const PRICING_ADMIN = "([^"]+)"/.exec(route);
    assert.ok(m, "가격 경로에 PRICING_ADMIN 이 없다");
    assert.equal(m[1], COMPANY_ADMIN);

    const sql = readFileSync(new URL("supabase-setup.sql", ROOT), "utf8");
    const start = sql.indexOf("create or replace function public.is_pricing_admin()");
    assert.ok(start >= 0, "setup SQL 에 is_pricing_admin 이 없다");
    const body = sql.slice(start, sql.indexOf("$$;", start));
    const u = /username = '([^']+)'/.exec(body);
    assert.ok(u, "is_pricing_admin 안에 username 비교가 없다");
    assert.equal(u[1], COMPANY_ADMIN);
  });
  it("payDemoState 는 결제 시연 모듈 규칙과 같다", () => {
    for (const v of [undefined, "on", "off", " OFF ", "Off", "false", "", "0"]) {
      assert.equal(payDemoState(v), payDemoMode(v), `값 ${JSON.stringify(v)}`);
    }
  });
});

describe("한국 시각", () => {
  // 2026-09-30 14:59:59Z = 한국 23:59:59 · 15:00:00Z = 한국 10월 1일 0시
  const before = Date.parse("2026-09-30T14:59:59Z");
  const after = Date.parse("2026-09-30T15:00:00Z");
  it("kstDayKey — 한국 자정에서 날짜가 바뀐다", () => {
    assert.equal(kstDayKey(new Date(before).toISOString()), "2026-09-30");
    assert.equal(kstDayKey(new Date(after).toISOString()), "2026-10-01");
    assert.equal(kstDayKey("엉터리"), "");
    assert.equal(kstDayKey(null), "");
  });
  it("kstDayStartIso — 한국 0시(UTC 전날 15시)", () => {
    assert.equal(kstDayStartIso(before), "2026-09-29T15:00:00.000Z");
    assert.equal(kstDayStartIso(after), "2026-09-30T15:00:00.000Z");
  });
  it("kstRange — 오늘 · 7일(오늘 포함) · 30일 · 전체, to 는 늘 null", () => {
    assert.deepEqual(kstRange("today", after), { from: "2026-09-30T15:00:00.000Z", to: null });
    assert.deepEqual(kstRange("7d", after), { from: "2026-09-24T15:00:00.000Z", to: null });
    assert.deepEqual(kstRange("30d", after), { from: "2026-09-01T15:00:00.000Z", to: null });
    assert.deepEqual(kstRange("all", after), { from: null, to: null });
    assert.deepEqual(kstRange("today", before), { from: "2026-09-29T15:00:00.000Z", to: null });
  });
  it("kstDaysAgoStart · isPeriodPreset", () => {
    assert.equal(kstDaysAgoStart(6, after).toISOString(), "2026-09-24T15:00:00.000Z");
    assert.equal(kstDaysAgoStart(-3, after).toISOString(), "2026-09-30T15:00:00.000Z");
    assert.ok(isPeriodPreset("7d"));
    assert.ok(!isPeriodPreset("8d"));
    assert.ok(!isPeriodPreset(7));
  });
  it("formatKstDateTime — 한국 시각, 못 읽으면 –", () => {
    assert.equal(formatKstDateTime("2026-09-30T05:05:00Z"), "2026. 9. 30. 14:05");
    assert.equal(formatKstDateTime(new Date(after).toISOString()), "2026. 10. 1. 00:00");
    assert.equal(formatKstDateTime(undefined), "–");
  });
});

describe("돈 표시", () => {
  it("groupDigits", () => {
    assert.equal(groupDigits(0), "0");
    assert.equal(groupDigits(12900), "12,900");
    assert.equal(groupDigits(10_000_000), "10,000,000");
    assert.equal(groupDigits(-4900), "-4,900");
    assert.equal(groupDigits(999.9), "999");
  });
  it("formatWon — 값이 없으면 –(0원으로 속이지 않는다)", () => {
    assert.equal(formatWon(119000), "119,000원");
    assert.equal(formatWon(0), "0원");
    assert.equal(formatWon(-4900), "-4,900원");
    assert.equal(formatWon(null), "–");
    assert.equal(formatWon(undefined), "–");
    assert.equal(formatWon(Number.NaN), "–");
  });
});

describe("DB 준비 · id · 주소", () => {
  it("isSchemaMissing — 표·함수 없음 코드만", () => {
    for (const code of ["42P01", "42883", "PGRST202", "PGRST205"]) assert.ok(isSchemaMissing({ code }), code);
    for (const code of ["42501", "22023", "", null]) assert.ok(!isSchemaMissing({ code }), String(code));
    assert.ok(!isSchemaMissing(null));
  });
  it("parseAdminId — 시연 id 는 따로 알린다, 대문자 uuid 는 소문자로", () => {
    assert.deepEqual(parseAdminId("demo-p01"), { ok: false, error: "시연 데이터는 처리할 수 없어요." });
    assert.deepEqual(parseAdminId(" DEMO-x"), { ok: false, error: "시연 데이터는 처리할 수 없어요." });
    assert.deepEqual(parseAdminId("abc"), { ok: false, error: "id 모양이 아니에요." });
    assert.deepEqual(parseAdminId(42), { ok: false, error: "id 모양이 아니에요." });
    assert.deepEqual(parseAdminId("0B8F1C2E-1111-4222-8333-444455556666"), {
      ok: true,
      value: "0b8f1c2e-1111-4222-8333-444455556666",
    });
  });
  it("withParams — 다른 칸은 두고, null·빈 글자는 뺀다", () => {
    assert.equal(withParams("?tab=refunds&q=abc", { id: "demo-p01" }), "?tab=refunds&q=abc&id=demo-p01");
    assert.equal(withParams("tab=refunds&id=x", { id: null }), "?tab=refunds");
    assert.equal(withParams("?id=x", { id: "" }), "");
    assert.equal(withParams("", { q: "a b" }), "?q=a+b");
    assert.equal(withParams("?a=1", { b: undefined }), "?a=1");
  });
  it("clampLimit", () => {
    assert.equal(clampLimit("0"), 1);
    assert.equal(clampLimit("999999"), 500);
    assert.equal(clampLimit("abc"), 200);
    assert.equal(clampLimit(7.9), 7);
    assert.equal(clampLimit(undefined, 50), 50);
    assert.equal(clampLimit("1e3"), 200);
    assert.equal(clampLimit(" 30 "), 30);
  });
});

describe("관리자 계정 기록 빼기 (사장님 2026-09-30)", () => {
  const ME = "aaaaaaaa-0000-4000-8000-000000000001";
  const OTHER_MASTER = "aaaaaaaa-0000-4000-8000-000000000002";
  const MEMBER = "bbbbbbbb-0000-4000-8000-000000000003";
  const masters = new Set([ME, OTHER_MASTER]);
  const rows = [
    { id: 1, owner: ME },
    { id: 2, owner: OTHER_MASTER.toUpperCase() },
    { id: 3, owner: MEMBER },
    { id: 4, owner: null },
  ];
  it("isMineFlag — mine=1 일 때만", () => {
    assert.ok(isMineFlag(new URLSearchParams("mine=1")));
    assert.ok(!isMineFlag(new URLSearchParams("mine=true")));
    assert.ok(!isMineFlag(new URLSearchParams("")));
  });
  it("내 줄 · 다른 관리자 줄은 빠지고, 회원 줄 · 주인 없는 줄(탈퇴)은 남는다", () => {
    const r = dropMasterRows(rows, (x) => x.owner, masters, false);
    assert.deepEqual(r.rows.map((x) => x.id), [3, 4]);
    assert.equal(r.dropped, 2);
  });
  it("'내 계정 것도 보기'면 그대로", () => {
    const r = dropMasterRows(rows, (x) => x.owner, masters, true);
    assert.deepEqual(r.rows, rows);
    assert.notEqual(r.rows, rows); // 복사본 — 부르는 쪽이 고쳐도 원본은 그대로
    assert.equal(r.dropped, 0);
  });
});

describe("떠나기 되묻기 문장", () => {
  it("쓰던 글만 — '떠나면 사라져요', 같은 이름은 한 번만", () => {
    const t = leaveDialogText([{ label: "의견 답변" }, { label: "의견 답변" }, { label: "가격", note: null }]);
    assert.equal(t.title, "저장 안 한 내용이 있어요. 이 화면을 떠날까요?");
    assert.equal(t.body, "의견 답변 · 가격에 저장하지 않은 내용이 있어요. 떠나면 사라져요.");
  });
  it("도는 일만 — 그 일이 준 문장, '사라져요'라고 하지 않는다", () => {
    const t = leaveDialogText([{ label: "그림 옮기기", note: "떠나면 옮기기가 멈춰요 — 옮긴 데까지는 그대로 남아요." }]);
    assert.equal(t.title, "하던 일이 있어요. 이 화면을 떠날까요?");
    assert.ok(t.body.startsWith("그림 옮기기 — 떠나면 옮기기가 멈춰요"));
    assert.ok(!t.body.includes("사라져요"));
  });
  it("둘 다 — 쓰던 글 먼저, 이어서 도는 일", () => {
    const t = leaveDialogText([{ label: "그림 옮기기", note: "멈춰요." }, { label: "의견 답변" }]);
    assert.equal(t.title, "저장 안 한 내용이 있어요. 이 화면을 떠날까요?");
    assert.equal(t.body, "의견 답변에 저장하지 않은 내용이 있어요. 떠나면 사라져요. 그림 옮기기 — 멈춰요.");
  });
});

describe("로그인 뒤 돌아갈 관리실 주소(?next=)", () => {
  it("관리실 안 경로만 그대로 받는다", () => {
    assert.equal(safeAdminNext("/admin"), "/admin");
    assert.equal(safeAdminNext("/admin/billing?id=0b6f2c1e-1111-4222-8333-444455556666"), "/admin/billing?id=0b6f2c1e-1111-4222-8333-444455556666");
    assert.equal(safeAdminNext("/admin?mine=1"), "/admin?mine=1");
    assert.equal(safeAdminNext("/admin/support?tab=feedback#x"), "/admin/support?tab=feedback#x");
  });
  it("다른 곳 · 다른 사이트로 읽힐 수 있는 모양은 거절(null)", () => {
    for (const bad of [
      null,
      undefined,
      "",
      "/",
      "/settings",
      "/administrator",
      "/adminx/members",
      "admin",
      "https://evil.example/admin",
      "//evil.example/admin",
      "/admin//evil.example",
      "/admin/\\evil.example",
      "/admin\\x",
      "/admin/\nx",
      "/admin/\u0000",
      "/admin/\u007f",
      `/admin/${"a".repeat(600)}`,
    ]) {
      assert.equal(safeAdminNext(bad), null, String(bad));
    }
  });
});

describe("원문 검사", () => {
  it("메뉴 배지는 관리자 계정 기록을 늘 빼고, 스위치 값을 읽지 않는다", () => {
    const src = read("app/api/admin/badges/route.ts");
    assert.ok(src.includes("dropMasterRows("));
    assert.ok(src.includes("masterOwnerIds("));
    assert.ok(!src.includes("mine"), "배지 경로가 mine 을 읽는다");
  });

  // 사고·의견·대시보드 경로는 각 화면 작업이 거르기를 넣는다. 파일이 없으면 건너뛰고,
  // 있는데 아직 안 넣었으면 할 일(todo)로 표시한다 — 마지막 점검(H)에서 전부 통과해야 한다.
  for (const f of ["app/api/admin/incidents/route.ts", "app/api/admin/feedback/route.ts", "app/api/admin/dashboard/route.ts"]) {
    const exists = existsSync(at(f));
    const has = exists && read(f).includes("masterOwnerIds(");
    it(
      `${f} 는 관리자 계정 기록을 뺀다(masterOwnerIds)`,
      { skip: !exists ? "아직 없는 경로" : false, todo: exists && !has ? "그 화면 작업이 넣는다" : false },
      () => assert.ok(has),
    );
  }

  it("관리실 파일에 내부 숫자 말·서비스 키·날것 HTML·개발자 모드·결제 시연 모듈이 없다", () => {
    const BAN = [
      "@/lib/pay-demo",
      "./pay-demo",
      "SERVICE_ROLE",
      "service_role",
      "원가",
      "마진",
      "수수료",
      "dangerouslySetInnerHTML",
      "개발자 모드",
      "isDevUser",
    ];
    const files = [...listFiles("components/admin"), ...listFiles("app/admin")];
    assert.ok(files.length > 10, "관리실 파일을 못 찾았다");
    const hits: string[] = [];
    for (const f of files) {
      const src = read(f);
      for (const w of BAN) if (src.includes(w)) hits.push(`${f}: ${w}`);
    }
    assert.deepEqual(hits, []);
  });

  it("관리실 화면은 서버 페이지가 데이터를 읽지 않는다(page.tsx 는 얇은 껍데기)", () => {
    for (const f of listFiles("app/admin").filter((x) => x.endsWith("page.tsx"))) {
      const src = read(f);
      assert.ok(src.includes("<Suspense"), `${f}: Suspense 없음`);
      for (const w of ["getSupabase", "authedFetch", "createClient", "fetch("]) assert.ok(!src.includes(w), `${f}: ${w}`);
    }
  });

  it("설정 화면 관리실은 '관리자 페이지 열기' 링크 하나뿐 — 전 회원·전 책 읽기와 그림 옮기기는 관리실로 옮겼다", () => {
    const src = read("app/settings/page.tsx");
    assert.ok(src.includes('href="/admin"'), "관리자 페이지 링크가 없다");
    for (const w of ["loadAllUsers", "loadAllBooksBrief", "loadAllParentVoiceRoles", "migrateBookArt", "countBooksWithEmbeddedArt"]) {
      assert.ok(!src.includes(w), `설정 화면에 옛 관리 기능이 남았다: ${w}`);
    }
  });

  it("화면 안 관리실 링크도 떠나기 되묻기를 거친다(AdminLink)", () => {
    for (const f of ["components/admin/cases/CaseDrawer.tsx", "components/admin/dashboard/DashboardPage.tsx", "components/admin/members/member-ui.tsx"]) {
      const src = read(f);
      assert.ok(src.includes("<AdminLink"), `${f}: AdminLink 없음`);
      assert.ok(!src.includes('from "next/link"'), `${f}: 되묻기를 건너뛰는 next/link 를 쓴다`);
    }
  });

  it("겉틀은 마스터 확인(/api/admin/me) 뒤에만 화면을 그린다", () => {
    const shell = read("components/admin/shell/AdminShell.tsx");
    assert.ok(shell.includes('"/api/admin/me"'));
    assert.ok(!/useSearchParams\s*\(/.test(shell), "겉틀이 useSearchParams 를 쓰면 틀 전체가 Suspense 에 갇힌다");
    const layout = read("app/admin/layout.tsx");
    assert.ok(/index:\s*false/.test(layout), "색인 막기가 없다");
  });
});
