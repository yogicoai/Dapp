import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { canCreateWith, CREATE_LOCKED_CODE, CREATE_LOCKED_MESSAGE, CREATE_PLANS, planAllowsCreate } from "./create-access.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const NOW = Date.parse("2026-10-19T03:00:00Z");

describe("결제 전 생성 막기 — lib/create-access (사장님 2026-10-19 \"yogico·fe 빼고는 생성 자체가 되면 안 돼\")", () => {
  it("관리자(yogico·fe)는 요금제가 없어도 만든다", () => {
    assert.equal(canCreateWith(true, null, NOW), true);
  });

  it("결제 요금제(스타트팩·월간·연간)가 살아 있으면 만든다", () => {
    for (const plan of ["starter", "monthly", "yearly"]) {
      assert.equal(planAllowsCreate({ plan, ends_at: null }, NOW), true, plan);
      assert.equal(planAllowsCreate({ plan, ends_at: "2026-12-31T14:59:59Z" }, NOW), true, `${plan} 끝나는 날 전`);
    }
    assert.deepEqual([...CREATE_PLANS], ["starter", "monthly", "yearly"]);
  });

  it("가입만 한 회원 · 무료 요금제 · 끝난 요금제 · 이상한 값은 못 만든다", () => {
    assert.equal(canCreateWith(false, null, NOW), false);
    assert.equal(planAllowsCreate({ plan: "free", ends_at: null }, NOW), false);
    assert.equal(planAllowsCreate({ plan: "monthly", ends_at: "2026-10-01T00:00:00Z" }, NOW), false);
    assert.equal(planAllowsCreate({ plan: "vip", ends_at: null }, NOW), false);
    assert.equal(planAllowsCreate(undefined, NOW), false);
  });

  it("AI 를 부르는 서버 경로가 모두 문지기를 지난다(화면만 숨기면 주소로 부를 수 있다)", () => {
    for (const r of ["story", "outline", "character-sheet", "location-sheet", "illustrate-page", "upload-art"]) {
      const src = read(`../app/api/${r}/route.ts`);
      assert.ok(src.includes("if (!(await canCreate(caller))) return createLockedResponse();"), `${r} 에 문지기가 없다`);
      // 로그인 확인 바로 뒤에 — 본문을 읽거나 AI 를 부르기 전에
      assert.ok(src.indexOf("canCreate(caller)") < src.indexOf("request.json()") || !src.includes("request.json()"), `${r}: 문지기가 본문 읽기보다 뒤에 있다`);
    }
    const portrait = read("../app/api/family/portrait/route.ts");
    const post = portrait.slice(portrait.search(/export (async )?function POST/), portrait.search(/export (async )?function GET/));
    assert.ok(post.includes("if (!(await canCreate(caller))) return fail(403, CREATE_LOCKED_MESSAGE, CREATE_LOCKED_CODE);"), "가족 그림 POST 에 문지기가 없다");
  });

  it("서버 문지기는 서비스 키 없이 부른 사람의 토큰으로 자기 요금제만 읽고, 못 읽으면 막는다", () => {
    const src = read("./create-access-server.ts");
    assert.ok(src.includes('caller.db.from("member_plans")'));
    assert.ok(src.includes("if (error) return false;"));
    assert.ok(!/SERVICE_ROLE|service_role/.test(src));
  });

  it("만들기 화면도 처음부터 안내를 띄운다(요금제 보기·홈으로)", () => {
    const src = read("../app/create/page.tsx");
    assert.ok(src.includes("setPlanLocked(!canCreateWith(false"));
    assert.ok(src.includes("{CREATE_LOCKED_MESSAGE}"));
    assert.equal(CREATE_LOCKED_CODE, "plan-required");
    assert.ok(CREATE_LOCKED_MESSAGE.includes("가족 패스") && !/가족 목소리|엄마·아빠 목소리/.test(CREATE_LOCKED_MESSAGE));
  });
});
