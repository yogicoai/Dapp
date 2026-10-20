/**
 * 회원 요금제 — 관리실 '회원'에서 회원마다 정한다(2026-10-02 사장님 "회원들도 그쪽에서 관리할 수 있게").
 *
 * 결제를 붙이기 전(베타)이라 요금제는 관리자가 지정한다 — DB member_plans(회원 한 명에 한 줄, supabase-offer-settings.sql).
 * 지정이 없는 회원은 무료 회원과 같다(2026-10-20 사장님 — 웹 오픈 뒤 구글로 막 가입한 회원에게 책이 전부 열렸다). 관리자는 전부 본다.
 * 결제를 붙이면 결제한 구독·스타트팩도 같은 자리에 적는다.
 * 한도(매달 권수 · 가족 캐릭터 · 가족 목소리 · 가족 그리기 토큰)는 관리실 요금제 값(PlanTerms)에서 온다 — 회원마다 따로 두지 않는다.
 *
 * 순수 파일 — node --test 가 그대로 읽는다.
 */
import type { LibraryTier } from "./offer-settings.ts";
import { PARENT_VOICE_OPEN, voiceTermText, won, type PlanTerms } from "./plans.ts";

export type MemberPlanKey = "free" | "starter" | "monthly" | "yearly";
export const MEMBER_PLAN_KEYS: readonly MemberPlanKey[] = ["free", "starter", "monthly", "yearly"];
export const MEMBER_PLAN_LABEL: Readonly<Record<MemberPlanKey, string>> = {
  free: "무료",
  starter: "스타트팩",
  monthly: "가족 패스 (월간)",
  yearly: "가족 패스 (연간)",
};
/** 지정이 없을 때 — 무료 회원과 같다(무료 동화만) */
export const NO_PLAN_LABEL = "지정 없음";

export function isMemberPlanKey(v: unknown): v is MemberPlanKey {
  return typeof v === "string" && (MEMBER_PLAN_KEYS as readonly string[]).includes(v);
}

/** 회원의 요금제 한 줄(관리실이 읽는 모양) */
export type MemberPlan = {
  plan: MemberPlanKey;
  /** 끝나는 때(ISO) — null 이면 관리자가 풀 때까지 */
  endsAt: string | null;
  note: string | null;
  setBy: string | null;
  updatedAt: string | null;
};

/** 지금 쓰는 요금제 — 끝나는 때가 지났으면 null(지정 없음과 같다) */
export function activePlanKey(p: { plan: MemberPlanKey; endsAt: string | null } | null, now: number): MemberPlanKey | null {
  if (!p) return null;
  if (p.endsAt) {
    const t = Date.parse(p.endsAt);
    if (Number.isFinite(t) && t <= now) return null;
  }
  return p.plan;
}

/** 요금제 → 책장 단계. 지정 없음(null)·끝난 요금제는 무료(2026-10-20 — 예전엔 베타라 모두 열림이었다). */
export function tierOfPlan(k: MemberPlanKey | null): LibraryTier {
  return k === "monthly" || k === "yearly" ? "pass" : k === "starter" ? "starter" : "free";
}

/** 보는 사람의 단계 — 관리자는 전부, 회원은 지정한 요금제(없으면 무료), 비회원은 무료 */
export function viewerTierOf(member: boolean, plan: MemberPlanKey | null, master = false): LibraryTier {
  if (master) return "pass";
  return member ? tierOfPlan(plan) : "free";
}

/** 요금제가 주는 몫 — 관리실 요금제 값에서. 무료는 만들기 몫이 없다(듣기만). */
export type PlanLimits = {
  books: number;
  /** month: 매달 · once: 한 번(스타트팩) · null: 없음(무료) */
  booksPer: "month" | "once" | null;
  familyCharacters: number;
  voices: number;
  voiceRemakesPerMonth: number;
  drawTokensPerMonth: number;
  drawTokensFirstMonth: number;
};

export function planLimits(k: MemberPlanKey, terms: PlanTerms): PlanLimits {
  if (k === "monthly" || k === "yearly") {
    const t = terms[k];
    return {
      books: t.booksPerMonth,
      booksPer: "month",
      familyCharacters: t.familyCharacters,
      voices: t.voices,
      voiceRemakesPerMonth: t.voiceRemakesPerMonth,
      drawTokensPerMonth: t.drawTokensPerMonth,
      drawTokensFirstMonth: t.drawTokensFirstMonth,
    };
  }
  if (k === "starter") {
    const t = terms.starter;
    return {
      books: t.books,
      booksPer: "once",
      familyCharacters: t.familyCharacters,
      voices: t.voices,
      voiceRemakesPerMonth: 0,
      drawTokensPerMonth: 0,
      drawTokensFirstMonth: 0,
    };
  }
  return {
    books: 0,
    booksPer: null,
    familyCharacters: 0,
    voices: 0,
    voiceRemakesPerMonth: 0,
    drawTokensPerMonth: 0,
    drawTokensFirstMonth: 0,
  };
}

/** 요금제 한 줄 설명 — 관리실 '요금제 바꾸기' 창의 고르는 칸 아래(값은 관리실 요금제 값) */
export function planSummary(k: MemberPlanKey, terms: PlanTerms): string {
  if (k === "free") return "무료로 연 세계명작·전래동화만 들어요";
  if (k === "starter") {
    const t = terms.starter;
    return `동화 ${t.books}권 · 가족 캐릭터 ${t.familyCharacters}명 · ${voiceTermText(t.voices)} · ${won(t.priceWon)}`;
  }
  const t = terms[k];
  return `매달 동화 ${t.booksPerMonth}권 · 가족 캐릭터 ${t.familyCharacters}명 · ${voiceTermText(t.voices)} · ${
    k === "monthly" ? "월" : "연"
  } ${won(t.priceWon)}`;
}

/** 회원이 지금 쓰고 있는 양 — 관리실이 한도 옆에 보여 준다 */
export type MemberUsage = {
  /** 이번 달(한국 시각 1일부터) 만든 동화 */
  booksThisMonth: number;
  booksTotal: number;
  /** 그림을 고정한 가족 캐릭터 */
  familyCharacters: number;
  /** 가족 목록에 있는 사람(그림이 없어도) */
  familyMembers: number;
  /** 준비된 가족 목소리 */
  voices: number;
};

/** 한도를 넘은 것 — "가족 캐릭터 6명 · 한도 4명"처럼. 한도가 없는 무료·지정 없음은 넘김을 따지지 않는다. */
export function overLimits(usage: MemberUsage, k: MemberPlanKey | null, terms: PlanTerms): string[] {
  if (k === null || k === "free") return [];
  const l = planLimits(k, terms);
  const out: string[] = [];
  if (l.booksPer === "month" && usage.booksThisMonth > l.books) {
    out.push(`이번 달 동화 ${usage.booksThisMonth}권 · 한도 ${l.books}권`);
  }
  if (usage.familyCharacters > l.familyCharacters) {
    out.push(`가족 캐릭터 ${usage.familyCharacters}명 · 한도 ${l.familyCharacters}명`);
  }
  // 부모 목소리를 닫아 둔 동안은 목소리 칸이 'AI 성우 목소리'(요금제 몫)라 쓴 양과 견주지 않는다
  if (PARENT_VOICE_OPEN && usage.voices > l.voices) out.push(`가족 목소리 ${usage.voices}명 · 한도 ${l.voices}명`);
  return out;
}

const KST_MS = 9 * 3_600_000;

/** 이번 달 1일 0시(한국 시각)를 ISO 로 — '이번 달 만든 동화'를 셀 기준 */
export function kstMonthStart(now: number): string {
  const kst = new Date(now + KST_MS);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), 1) - KST_MS).toISOString();
}

/** 가족 목록(profiles.child.family)에서 — 그림을 고정한 캐릭터 수와 사람 수 */
export function countFamily(child: unknown): { characters: number; members: number } {
  const family = child && typeof child === "object" ? (child as { family?: unknown }).family : null;
  if (!Array.isArray(family)) return { characters: 0, members: 0 };
  const people = family.filter((m): m is Record<string, unknown> => !!m && typeof m === "object");
  const characters = people.filter((m) => {
    const p = m.portrait as { url?: unknown } | null | undefined;
    return !!p && typeof p === "object" && typeof p.url === "string" && p.url.length > 0;
  }).length;
  return { characters, members: people.length };
}

/* ─────────────────────────── 관리실: 바꾸기 ─────────────────────────── */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** 끝나는 날은 오늘 뒤 5년 안 */
const ENDS_MAX_MS = 5 * 366 * 86_400_000;

/** "2026-12-31" → 그 날 23:59:59.999(한국 시각)의 ISO. 날짜가 아니면 null. */
export function endOfKstDay(date: string): string | null {
  const m = DATE_RE.exec(date);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = Date.UTC(y, mo - 1, d + 1) - KST_MS - 1;
  const back = new Date(t + KST_MS);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return new Date(t).toISOString();
}

/** ISO → "2026. 12. 31."(한국 날짜) */
export function kstDateText(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const k = new Date(t + KST_MS);
  return `${k.getUTCFullYear()}. ${k.getUTCMonth() + 1}. ${k.getUTCDate()}.`;
}

/** ISO → "2026-12-31"(한국 날짜, 날짜 칸 값) */
export function kstDateValue(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const k = new Date(t + KST_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())}`;
}

export type MemberPlanInput = { id: string; plan: MemberPlanKey | null; endsAt: string | null; note: string };

/**
 * 관리실이 보낸 { id, plan, endsOn, note } 검사. plan 이 null(또는 "none")이면 지정을 푼다.
 * endsOn 은 "YYYY-MM-DD"(한국 날짜) — 그 날 끝까지 쓴다. 진짜 문지기는 DB 함수(master_set_member_plan)다.
 */
export function parseMemberPlanBody(
  body: unknown,
  now: number,
): { ok: true; value: MemberPlanInput } | { ok: false; error: string } {
  const b = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  if (!b) return { ok: false, error: "요청 본문이 JSON 객체가 아니에요." };
  const id = typeof b.id === "string" ? b.id.trim().toLowerCase() : "";
  if (!UUID_RE.test(id)) return { ok: false, error: "회원 id 모양이 아니에요." };
  const rawPlan = b.plan === "none" ? null : b.plan;
  if (rawPlan !== null && !isMemberPlanKey(rawPlan)) return { ok: false, error: "모르는 요금제예요." };
  let endsAt: string | null = null;
  if (b.endsOn !== null && b.endsOn !== undefined && b.endsOn !== "") {
    if (rawPlan === null) return { ok: false, error: "지정을 풀 때는 끝나는 날을 비워 주세요." };
    endsAt = typeof b.endsOn === "string" ? endOfKstDay(b.endsOn) : null;
    if (!endsAt) return { ok: false, error: "끝나는 날을 2026-12-31 모양으로 적어 주세요." };
    const t = Date.parse(endsAt);
    if (t <= now || t > now + ENDS_MAX_MS) return { ok: false, error: "끝나는 날은 오늘 뒤 5년 안으로 정해 주세요." };
  }
  const note = typeof b.note === "string" ? b.note.trim() : "";
  if (note.length < 2) return { ok: false, error: "왜 바꾸는지 두 글자 이상 적어 주세요." };
  if (note.length > 500) return { ok: false, error: "사유가 너무 길어요(500자까지)." };
  return { ok: true, value: { id, plan: rawPlan, endsAt, note } };
}

/* ─────────────────────────── 관리실: 읽기 ─────────────────────────── */

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** DB 한 줄 → 요금제. 모양이 틀리면 null(지정 없음으로 본다). */
export function memberPlanFromRow(row: unknown): MemberPlan | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (!isMemberPlanKey(r.plan)) return null;
  return {
    plan: r.plan,
    endsAt: str(r.ends_at),
    note: str(r.note),
    setBy: str(r.set_by_username),
    updatedAt: str(r.updated_at),
  };
}

export type MemberPlanChange = {
  id: number;
  from: MemberPlanKey | null;
  to: MemberPlanKey | null;
  fromEndsAt: string | null;
  toEndsAt: string | null;
  note: string | null;
  by: string | null;
  at: string;
};

export function memberPlanChangeFromRow(row: unknown): MemberPlanChange | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.at !== "string") return null;
  return {
    id: Number(r.id) || 0,
    from: isMemberPlanKey(r.old_plan) ? r.old_plan : null,
    to: isMemberPlanKey(r.new_plan) ? r.new_plan : null,
    fromEndsAt: str(r.old_ends_at),
    toEndsAt: str(r.new_ends_at),
    note: str(r.note),
    by: str(r.changed_by_username),
    at: r.at,
  };
}

/** "가족 패스 (월간) · 2026. 12. 31.까지" · "지정 없음" */
export function planWithEndText(k: MemberPlanKey | null, endsAt: string | null): string {
  if (!k) return NO_PLAN_LABEL;
  const end = kstDateText(endsAt);
  return end ? `${MEMBER_PLAN_LABEL[k]} · ${end}까지` : MEMBER_PLAN_LABEL[k];
}

/** GET /api/admin/member-plan 의 답 */
export type MemberPlanResponse = {
  /** 표가 아직 없으면 false(사장님이 SQL 을 돌리기 전) — 보기만 되고 바꾸기는 막힌다 */
  schemaReady: boolean;
  plan: MemberPlan | null;
  log: MemberPlanChange[];
  /** 쓰고 있는 양 — 못 읽은 칸은 null */
  usage: MemberUsage | null;
  /** 관리실 요금제 값(한도 계산) */
  terms: PlanTerms;
};
