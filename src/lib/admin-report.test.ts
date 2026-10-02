import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  BOOK_COST_LINES,
  breakEven,
  buildAdminReport,
  fixedAll,
  fixedMin,
  netPlay,
  netWeb,
  passMonthCost,
} from "./admin-report.ts";
import { DEFAULT_OFFER_VIEW, DEFAULT_PLAN_TERMS } from "./plans.ts";

describe("가격정책 확인 데이터 계산 — 넉넉한 가정, 각 회사 공식 가격표 기준", () => {
  it("동화 1권(보통) 합계 1,420원 · 고정비 최소 49,000원 / 권장 85,667원(Supabase Pro 포함 · 토스 연관리비 뺌)", () => {
    assert.equal(
      BOOK_COST_LINES.reduce((s, l) => s + l[2], 0),
      1_420,
    );
    assert.equal(fixedMin(), 49_000);
    assert.equal(fixedAll(), 85_667);
  });

  it("손에 남는 돈 — 구글 플레이는 부가세 먼저 빼고 15%, 웹은 부가세 빼고 결제 금액의 3.74%", () => {
    assert.equal(netPlay(19_900), 15_377);
    assert.equal(netWeb(19_900), 17_347);
    assert.equal(netPlay(0), 0);
  });

  it("가족 패스 한 달 변동원가 — 권수 × 1,380 + 목소리 × 200 + 토큰 × 100", () => {
    assert.equal(passMonthCost(DEFAULT_PLAN_TERMS.monthly), 4 * 1_380 + 1 * 200 + 5 * 100);
    assert.equal(passMonthCost(DEFAULT_PLAN_TERMS.yearly), 4 * 1_380 + 2 * 200 + 5 * 100);
  });

  it("손익분기 — 남는 돈이 없으면 null", () => {
    assert.equal(breakEven(85_667, 9_157), 10);
    assert.equal(breakEven(85_667, 0), null);
    assert.equal(breakEven(85_667, -10), null);
  });
});

describe("보고 화면 내용", () => {
  const app = { signupBonus: 200, tokensPerBook: 12, tokenWon: 100 };

  it("여덟 갈래 · 맨 위에 지울 화면이라는 띠", () => {
    const r = buildAdminReport(DEFAULT_OFFER_VIEW, app, "db");
    assert.deepEqual(
      r.sections.map((s) => s.id),
      ["now", "how", "screens", "book", "fixed", "fees", "profit", "check"],
    );
    assert.ok(r.banner.join(" ").includes("지워요"));
    assert.equal(r.source, "db");
    const all = JSON.stringify(r);
    assert.ok(all.includes("월 19,900원"));
    assert.ok(all.includes("지금 가입하면 200토큰(동화 약 16권치)"));
  });

  it("요금제 값을 바꾸면 남는 돈도 바뀐다", () => {
    const profitRow = (r: ReturnType<typeof buildAdminReport>) =>
      r.sections.find((s) => s.id === "profit")?.tables?.[0].rows[0] ?? [];
    const base = profitRow(buildAdminReport(DEFAULT_OFFER_VIEW, app, "db"));
    assert.equal(base[3], "11,127원 (64%)"); // 웹(1차 출시) 칸이 먼저
    assert.equal(base[4], "9,157원 (60%)");
    assert.equal(base[5], "8명 / 10명");
    const cheaper = {
      ...DEFAULT_OFFER_VIEW,
      plans: { ...DEFAULT_PLAN_TERMS, monthly: { ...DEFAULT_PLAN_TERMS.monthly, priceWon: 12_900 } },
    };
    assert.notDeepEqual(profitRow(buildAdminReport(cheaper, app, "db")), base);
  });

  it("앱 안 토큰 값을 못 읽거나 요금제 값이 기본값이면 그렇다고 적는다", () => {
    const r = buildAdminReport(DEFAULT_OFFER_VIEW, null, "fallback");
    assert.ok(r.basis.includes("기본값으로 계산"));
    assert.ok(!JSON.stringify(r).includes("지금 가입하면"));
  });
});

describe("고객 화면 그림", () => {
  it("그림 파일이 public/admin-report 에 있고, 설명이 붙어 있다", () => {
    const r = buildAdminReport(DEFAULT_OFFER_VIEW, { signupBonus: 200, tokensPerBook: 12, tokenWon: 100 }, "db");
    const figs = r.sections.find((s) => s.id === "screens")?.figures ?? [];
    assert.equal(figs.length, 4);
    for (const f of figs) {
      assert.match(f.src, /^\/admin-report\/[a-z-]+\.jpg$/);
      assert.ok(existsSync(new URL(`../../public${f.src}`, import.meta.url)), f.src);
      assert.ok(f.legend.length >= 2, f.title);
    }
    assert.ok(figs[0].legend[1].includes("17% 할인"));
  });
});

describe("원가 숫자가 고객이 받을 수 있는 코드로 새지 않는다", () => {
  const SRC = new URL("../", import.meta.url);
  const files = (readdirSync(SRC, { recursive: true }) as unknown[])
    .map((f) => String(f).replace(/\\/g, "/"))
    .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts"));
  const users = files.filter((f) => /from\s*["'](@\/lib\/admin-report|\.\/admin-report(\.ts)?)["']/.test(readFileSync(new URL(f, SRC), "utf8")));

  it("값으로 가져오는 곳은 관리자 서버 경로 하나, 화면은 모양(type)만", () => {
    assert.deepEqual(users.sort(), ["app/api/admin/report/route.ts", "components/admin/report/ReportPage.tsx"]);
    const page = readFileSync(new URL("components/admin/report/ReportPage.tsx", SRC), "utf8");
    assert.match(page, /import type \{[^}]*\} from "@\/lib\/admin-report";/);
    assert.equal(page.match(/from "@\/lib\/admin-report"/g)?.length, 1);
  });

  it("관리자 서버 경로는 관리자 확인(masterOnly)을 지난다", () => {
    const route = readFileSync(new URL("app/api/admin/report/route.ts", SRC), "utf8");
    assert.match(route, /export const GET = masterOnly\(/);
  });

  it("권고안(대외비)의 숫자는 보고 화면에도 쓰지 않는다", () => {
    const src = readFileSync(new URL("lib/admin-report.ts", SRC), "utf8");
    assert.doesNotMatch(src, /\b770\b|4,?950|4,?948/);
  });
});
