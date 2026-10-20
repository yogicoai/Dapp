import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  activePlanKey,
  countFamily,
  endOfKstDay,
  isMemberPlanKey,
  kstDateText,
  kstDateValue,
  kstMonthStart,
  MEMBER_PLAN_KEYS,
  memberPlanChangeFromRow,
  memberPlanFromRow,
  NO_PLAN_LABEL,
  overLimits,
  parseMemberPlanBody,
  planLimits,
  planSummary,
  planWithEndText,
  tierOfPlan,
  viewerTierOf,
  type MemberUsage,
} from "./member-plan.ts";
import { DEFAULT_PLAN_TERMS, PARENT_VOICE_OPEN } from "./plans.ts";

const NOW = Date.parse("2026-10-02T05:00:00Z"); // 한국 14:00
const ID = "0b8f1c2e-1111-4222-8333-444455556666";

describe("요금제 → 책장 단계", () => {
  it("지정 없음은 무료 회원과 같다(10-20 — 예전엔 모두 열림), 무료·스타트팩·가족 패스", () => {
    assert.equal(tierOfPlan(null), "free");
    assert.equal(tierOfPlan("free"), "free");
    assert.equal(tierOfPlan("starter"), "starter");
    assert.equal(tierOfPlan("monthly"), "pass");
    assert.equal(tierOfPlan("yearly"), "pass");
  });
  it("비회원은 늘 무료, 회원은 지정한 요금제, 요금제 없는 회원은 무료, 관리자는 전부", () => {
    assert.equal(viewerTierOf(false, null), "free");
    assert.equal(viewerTierOf(false, "yearly"), "free");
    assert.equal(viewerTierOf(true, null), "free");
    assert.equal(viewerTierOf(true, "starter"), "starter");
    assert.equal(viewerTierOf(true, "monthly"), "pass");
    assert.equal(viewerTierOf(true, null, true), "pass");
    assert.equal(viewerTierOf(true, "free", true), "pass");
  });
  it("끝나는 때가 지나면 지정 없음과 같다", () => {
    assert.equal(activePlanKey({ plan: "monthly", endsAt: null }, NOW), "monthly");
    assert.equal(activePlanKey({ plan: "monthly", endsAt: "2026-10-03T00:00:00Z" }, NOW), "monthly");
    assert.equal(activePlanKey({ plan: "monthly", endsAt: "2026-10-02T05:00:00Z" }, NOW), null);
    assert.equal(activePlanKey(null, NOW), null);
  });
  it("요금제 이름표", () => {
    assert.deepEqual([...MEMBER_PLAN_KEYS], ["free", "starter", "monthly", "yearly"]);
    assert.equal(isMemberPlanKey("monthly"), true);
    assert.equal(isMemberPlanKey("pass"), false);
  });
});

describe("요금제의 몫 — 관리실 요금제 값에서", () => {
  it("가족 패스는 매달, 스타트팩은 한 번, 무료는 만들기 없음", () => {
    assert.deepEqual(planLimits("monthly", DEFAULT_PLAN_TERMS), {
      books: 4,
      booksPer: "month",
      familyCharacters: 4,
      voices: 1,
      voiceRemakesPerMonth: 1,
      drawTokensPerMonth: 5,
      drawTokensFirstMonth: 10,
    });
    assert.equal(planLimits("yearly", DEFAULT_PLAN_TERMS).familyCharacters, 6);
    assert.equal(planLimits("yearly", DEFAULT_PLAN_TERMS).voices, 2);
    const st = planLimits("starter", DEFAULT_PLAN_TERMS);
    assert.deepEqual([st.books, st.booksPer, st.familyCharacters, st.voices, st.drawTokensPerMonth], [1, "once", 1, 1, 0]);
    assert.deepEqual([planLimits("free", DEFAULT_PLAN_TERMS).books, planLimits("free", DEFAULT_PLAN_TERMS).booksPer], [0, null]);
  });
  it("관리실 값을 바꾸면 몫도 따라간다", () => {
    const terms = { ...DEFAULT_PLAN_TERMS, monthly: { ...DEFAULT_PLAN_TERMS.monthly, booksPerMonth: 6 } };
    assert.equal(planLimits("monthly", terms).books, 6);
  });
  it("넘은 것 — 매달 권수(가족 패스만) · 캐릭터 · 목소리(부모 목소리를 열었을 때만), 무료·지정 없음은 따지지 않는다", () => {
    const usage: MemberUsage = { booksThisMonth: 5, booksTotal: 9, familyCharacters: 5, familyMembers: 6, voices: 2 };
    // 부모 목소리를 닫아 둔 동안 목소리 칸은 'AI 성우 목소리'(요금제 몫) — 쓴 양과 견주지 않는다(2026-10-19)
    const voiceOver = (n: number) => (PARENT_VOICE_OPEN ? [`가족 목소리 2명 · 한도 ${n}명`] : []);
    assert.deepEqual(overLimits(usage, "monthly", DEFAULT_PLAN_TERMS), [
      "이번 달 동화 5권 · 한도 4권",
      "가족 캐릭터 5명 · 한도 4명",
      ...voiceOver(1),
    ]);
    assert.deepEqual(overLimits(usage, "yearly", DEFAULT_PLAN_TERMS), ["이번 달 동화 5권 · 한도 4권"]);
    // 스타트팩은 권수를 '한 번'으로 세므로 이번 달 권수로 넘김을 따지지 않는다
    assert.deepEqual(overLimits(usage, "starter", DEFAULT_PLAN_TERMS), ["가족 캐릭터 5명 · 한도 1명", ...voiceOver(1)]);
    assert.deepEqual(overLimits(usage, "free", DEFAULT_PLAN_TERMS), []);
    assert.deepEqual(overLimits(usage, null, DEFAULT_PLAN_TERMS), []);
  });
  it("고르는 칸 설명", () => {
    // 목소리 칸 — 부모 목소리를 닫아 둔 동안은 'AI 성우 목소리 N명 추가'(사장님 2026-10-19)
    const v = (n: number) => (PARENT_VOICE_OPEN ? `가족 목소리 ${n}명` : `AI 성우 목소리 ${n}명 추가`);
    assert.equal(planSummary("monthly", DEFAULT_PLAN_TERMS), `매달 동화 4권 · 가족 캐릭터 4명 · ${v(1)} · 월 19,900원`);
    assert.equal(planSummary("yearly", DEFAULT_PLAN_TERMS), `매달 동화 4권 · 가족 캐릭터 6명 · ${v(2)} · 연 199,000원`);
    assert.equal(planSummary("starter", DEFAULT_PLAN_TERMS), `동화 1권 · 가족 캐릭터 1명 · ${v(1)} · 4,900원`);
    if (!PARENT_VOICE_OPEN) assert.ok(!["monthly", "yearly", "starter"].some((k) => planSummary(k as "monthly", DEFAULT_PLAN_TERMS).includes("가족 목소리")));
    assert.match(planSummary("free", DEFAULT_PLAN_TERMS), /무료/);
  });
});

describe("쓴 양 세기", () => {
  it("이번 달 1일 0시(한국 시각)", () => {
    assert.equal(kstMonthStart(NOW), "2026-09-30T15:00:00.000Z");
    // 한국은 이미 11월 1일 새벽 — 11월로 센다
    assert.equal(kstMonthStart(Date.parse("2026-10-31T16:00:00Z")), "2026-10-31T15:00:00.000Z");
  });
  it("가족 캐릭터는 그림을 고정한 사람만, 사람 수는 따로", () => {
    const child = {
      family: [
        { id: "child", portrait: { url: "https://x/c.png" } },
        { id: "mom", portrait: { url: "https://x/m.png" } },
        { id: "dad", draft: { url: "https://x/d.png" } },
        { id: "m-1", portrait: { url: "" } },
        null,
      ],
    };
    assert.deepEqual(countFamily(child), { characters: 2, members: 4 });
    assert.deepEqual(countFamily(null), { characters: 0, members: 0 });
    assert.deepEqual(countFamily({ family: "x" }), { characters: 0, members: 0 });
  });
});

describe("날짜", () => {
  it("끝나는 날 — 그 날 끝(한국 시각)까지, 없는 날은 null", () => {
    assert.equal(endOfKstDay("2026-12-31"), "2026-12-31T14:59:59.999Z");
    assert.equal(endOfKstDay("2026-02-30"), null);
    assert.equal(endOfKstDay("2026-1-5"), null);
    assert.equal(kstDateText("2026-12-31T14:59:59.999Z"), "2026. 12. 31.");
    assert.equal(kstDateValue("2026-12-31T14:59:59.999Z"), "2026-12-31");
    assert.equal(kstDateText(null), "");
  });
});

describe("바꾸기 검사(parseMemberPlanBody)", () => {
  const ok = (b: Record<string, unknown>) => {
    const r = parseMemberPlanBody({ id: ID, note: "베타 테스터", ...b }, NOW);
    assert.ok(r.ok, r.ok ? "" : r.error);
    return r.ok ? r.value : null;
  };
  const err = (b: Record<string, unknown>) => {
    const r = parseMemberPlanBody({ id: ID, note: "베타 테스터", ...b }, NOW);
    assert.equal(r.ok, false);
    return r.ok ? "" : r.error;
  };
  it("지정 · 끝나는 날 · 풀기", () => {
    assert.deepEqual(ok({ plan: "monthly" }), { id: ID, plan: "monthly", endsAt: null, note: "베타 테스터" });
    assert.equal(ok({ plan: "yearly", endsOn: "2026-12-31" })?.endsAt, "2026-12-31T14:59:59.999Z");
    assert.equal(ok({ plan: null })?.plan, null);
    assert.equal(ok({ plan: "none" })?.plan, null);
    assert.equal(ok({ plan: "starter", endsOn: "" })?.endsAt, null);
    // 대문자 id 는 소문자로
    assert.equal(parseMemberPlanBody({ id: ID.toUpperCase(), plan: "free", note: "확인" }, NOW).ok, true);
  });
  it("틀린 값", () => {
    assert.match(err({ id: "abc", plan: "monthly" }), /회원 id/);
    assert.match(err({ plan: "weekly" }), /모르는 요금제/);
    assert.match(err({ plan: null, endsOn: "2026-12-31" }), /지정을 풀 때/);
    assert.match(err({ plan: "monthly", endsOn: "2026/12/31" }), /2026-12-31 모양/);
    assert.match(err({ plan: "monthly", endsOn: "2026-10-01" }), /오늘 뒤 5년 안/);
    assert.match(err({ plan: "monthly", endsOn: "2032-01-01" }), /오늘 뒤 5년 안/);
    assert.match(err({ plan: "monthly", note: " 1 " }), /두 글자/);
    assert.equal(parseMemberPlanBody([], NOW).ok, false);
  });
});

describe("DB 줄 읽기 · 글", () => {
  it("요금제 줄 · 이력 줄", () => {
    assert.deepEqual(
      memberPlanFromRow({ plan: "starter", ends_at: null, note: "시험", set_by_username: "yogico", updated_at: "2026-10-02T05:00:00Z" }),
      { plan: "starter", endsAt: null, note: "시험", setBy: "yogico", updatedAt: "2026-10-02T05:00:00Z" },
    );
    assert.equal(memberPlanFromRow({ plan: "gold" }), null);
    assert.equal(memberPlanFromRow(null), null);
    const c = memberPlanChangeFromRow({
      id: 3,
      old_plan: null,
      new_plan: "monthly",
      old_ends_at: null,
      new_ends_at: "2026-12-31T14:59:59.999Z",
      note: "지급",
      changed_by_username: "fe",
      at: "2026-10-02T05:00:00Z",
    });
    assert.deepEqual(c, {
      id: 3,
      from: null,
      to: "monthly",
      fromEndsAt: null,
      toEndsAt: "2026-12-31T14:59:59.999Z",
      note: "지급",
      by: "fe",
      at: "2026-10-02T05:00:00Z",
    });
    assert.equal(memberPlanChangeFromRow({ id: 1 }), null);
  });
  it("요금제 + 끝나는 날 글", () => {
    assert.equal(planWithEndText(null, null), NO_PLAN_LABEL);
    assert.equal(planWithEndText("monthly", null), "가족 패스 (월간)");
    assert.equal(planWithEndText("yearly", "2026-12-31T14:59:59.999Z"), "가족 패스 (연간) · 2026. 12. 31.까지");
  });
});

describe("DB 함수가 같은 규칙을 쓴다(supabase-offer-settings.sql ②)", () => {
  const sql = readFileSync(new URL("../../supabase-offer-settings.sql", import.meta.url), "utf8");
  it("요금제 이름 · 끝나는 때 5년 · 사유", () => {
    assert.ok(sql.includes("check (plan in ('free','starter','monthly','yearly'))"));
    assert.ok(sql.includes("p_plan not in ('free','starter','monthly','yearly')"));
    assert.ok(sql.includes("p_ends_at > now() + interval '5 years'"));
    assert.ok(sql.includes("raise exception '왜 바꾸는지 두 글자 이상 적어 주세요.'"));
  });
  it("회원 지우기 — 관리자만 · 내 계정·관리자 계정은 못 지움 · 아이디 따라 적기 · 사유 · 기록 먼저 남기고 지운다", () => {
    const fn = sql.slice(sql.indexOf("function public.master_delete_member"), sql.indexOf("function public.master_member_deletions"));
    assert.ok(fn.length > 0);
    assert.ok(fn.includes("if not public.is_master_user() then"));
    assert.ok(fn.includes("p_owner = auth.uid()"));
    assert.ok(fn.includes("if v_master then"));
    assert.ok(fn.includes("if v_name is distinct from btrim(coalesce(p_username, '')) then"));
    assert.ok(fn.includes("raise exception '왜 지우는지 두 글자 이상 적어 주세요.'"));
    const logAt = fn.indexOf("insert into public.member_deletions");
    const delAt = fn.indexOf("delete from auth.users where id = p_owner");
    assert.ok(logAt > 0 && delAt > logAt, "기록을 먼저 적고 지운다");
    // 지운 기록 표는 아무도 표로 못 읽는다(관리자 함수로만)
    assert.ok(sql.includes("revoke all on public.member_deletions from anon, authenticated;"));
    assert.ok(!/grant select[^;]*member_deletions/.test(sql));
  });
  it("지정은 관리자만(다른 관리자 계정 빼고), 회원은 자기 줄의 요금제·끝나는 때만 읽는다", () => {
    const fn = sql.slice(sql.indexOf("function public.master_set_member_plan"), sql.indexOf("function public.master_member_plan("));
    assert.ok(fn.includes("if not public.is_master_user() then"));
    assert.ok(fn.includes("if not public.master_can_see(p_owner) then"));
    assert.ok(sql.includes("grant select (owner, plan, ends_at, updated_at) on public.member_plans to authenticated;"));
    assert.ok(sql.includes('create policy "member_plans 본인 열람" on public.member_plans for select using (auth.uid() = owner);'));
    assert.ok(!/grant select[^;]*\bnote\b[^;]*member_plans/.test(sql));
  });
});
