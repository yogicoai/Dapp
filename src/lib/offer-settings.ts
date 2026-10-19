/**
 * 공개 동화 단계 · 크레딧 설정 — 관리실에서 바꾸고(/admin/library · /admin/pricing), 요금제 화면·책장이 읽는다(2026-10-01).
 *
 * DB 는 app_offer_settings 한 줄(supabase-offer-settings.sql). 표가 아직 없거나 칸이 비어 있으면 이 파일의 기본값이다 —
 * SQL 을 돌리기 전에도, DB 가 잠깐 멈춰도 사이트는 지금처럼 뜬다.
 *
 * 단계는 겹쳐서 열린다: 무료 ⊂ 스타트팩 ⊂ 가족 패스. 책마다 "어느 단계부터 열리나" 하나만 고른다.
 * 숨긴 책(hidden — 다듬는 중)은 서가에 안 보이므로 권수에 넣지 않는다(단계는 미리 골라 둘 수 있다).
 *
 * 순수 파일 — node --test 가 그대로 읽는다. 책 목록은 부르는 쪽이 넘긴다(lib/library-catalog).
 */
import {
  CREDIT_USES,
  CREDIT_USE_LABEL,
  VOICE_TERM_LABEL,
  DEFAULT_CREDIT_COSTS,
  DEFAULT_CREDIT_PACKS,
  DEFAULT_PLAN_TERMS,
  FREE,
  STARTER,
  creditsText,
  won,
  type CreditPack,
  type CreditUse,
  type OfferView,
  type PassPlanTerms,
  type PlanTerms,
  type StarterTerms,
} from "./plans.ts";

/* ─────────────────────────── 단계 ─────────────────────────── */

export type LibraryTier = "free" | "starter" | "pass";
export const LIBRARY_TIERS: readonly LibraryTier[] = ["free", "starter", "pass"];
const TIER_RANK: Readonly<Record<LibraryTier, number>> = { free: 0, starter: 1, pass: 2 };

/** 꼬리표·이력에 쓰는 짧은 이름 */
export const TIER_LABEL: Readonly<Record<LibraryTier, string>> = { free: "무료", starter: "스타트팩", pass: "가족 패스" };
/** 고르기 칸(select)에 보이는 이름 — 폰에서도 칸 안에 들어가게 짧게('무료'는 비회원도 본다는 뜻) */
export const TIER_OPTION_LABEL: Readonly<Record<LibraryTier, string>> = {
  free: "무료(누구나)",
  starter: "스타트팩부터",
  pass: "가족 패스만",
};

export function isLibraryTier(v: unknown): v is LibraryTier {
  return typeof v === "string" && (LIBRARY_TIERS as readonly string[]).includes(v);
}

export type LibraryKind = "classic" | "folk";
export const LIBRARY_KIND_LABEL: Readonly<Record<LibraryKind, string>> = { classic: "세계명작", folk: "전래동화" };

/** 제공 서가의 책 한 권 — 단계를 고르고 셀 때 필요한 것만 */
export type CatalogBook = { id: string; kind: LibraryKind; title: string; cover: string | null; hidden: boolean };

export function isLibraryBookId(id: string): boolean {
  return id.startsWith("classic-") || id.startsWith("folk-");
}

/* ─────────────────────────── 설정 값 ─────────────────────────── */

export type OfferSettings = {
  /** 책 id → 열리는 단계. 책 목록의 모든 책이 들어 있다(DB 에 없는 책은 기본값으로 채운다). */
  libraryTiers: Record<string, LibraryTier>;
  /** 비회원 책장에 자물쇠를 붙이나 — 관리실 스위치. 꺼져 있으면 누구나 다 듣는다(지금처럼). */
  gateOn: boolean;
  /** 값이 싼 묶음부터 */
  creditPacks: CreditPack[];
  creditCosts: Record<CreditUse, number>;
  /** 가족 패스(월간·연간)·스타트팩 값과 구성 */
  plans: PlanTerms;
};

export const CREDIT_PACKS_MAX = 5;
export const PACK_PRICE_MIN = 500;
export const PACK_PRICE_MAX = 1_000_000;
export const PACK_CREDITS_MAX = 1_000_000;
export const CREDIT_COST_MAX = 100_000;
const TIERS_MAX = 300;

/** 공개 경로·요금제 화면이 읽는 칸 — 고친 사람(updated_by)은 읽지 않는다 */
export const OFFER_PUBLIC_SELECT = "id,library_tiers,library_gate_on,credit_packs,credit_costs,plan_settings,updated_at";

/**
 * 고르기 전 기본 단계 — 종류마다 서가 순서(숨긴 책 빼고)로 앞에서 FREE 권은 무료, STARTER 권까지는 스타트팩, 나머지는 가족 패스.
 * 숨긴 책은 가족 패스(나중에 꺼내도 무료로 새지 않게).
 */
export function defaultLibraryTiers(catalog: readonly CatalogBook[]): Record<string, LibraryTier> {
  const out: Record<string, LibraryTier> = {};
  const seen: Record<LibraryKind, number> = { classic: 0, folk: 0 };
  for (const b of catalog) {
    if (b.hidden) {
      out[b.id] = "pass";
      continue;
    }
    const i = seen[b.kind]++;
    const freeN = b.kind === "classic" ? FREE.classics : FREE.folk;
    const starterN = b.kind === "classic" ? STARTER.classics : STARTER.folk;
    out[b.id] = i < freeN ? "free" : i < starterN ? "starter" : "pass";
  }
  return out;
}

export function defaultOfferSettings(catalog: readonly CatalogBook[]): OfferSettings {
  return {
    libraryTiers: defaultLibraryTiers(catalog),
    gateOn: false,
    creditPacks: DEFAULT_CREDIT_PACKS.map((p) => ({ ...p })),
    creditCosts: { ...DEFAULT_CREDIT_COSTS },
    plans: clonePlanTerms(DEFAULT_PLAN_TERMS),
  };
}

function intIn(v: unknown, min: number, max: number): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null;
}

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** 묶음 목록 — 모양이 맞는 것만, 값이 싼 순서로. 같은 값은 앞 것만. 하나도 없으면 null(기본값을 쓴다). */
export function normalizeCreditPacks(raw: unknown): CreditPack[] | null {
  if (!Array.isArray(raw)) return null;
  const out: CreditPack[] = [];
  for (const r of raw) {
    const o = asObject(r);
    const priceWon = intIn(o?.priceWon, PACK_PRICE_MIN, PACK_PRICE_MAX);
    const credits = intIn(o?.credits, 1, PACK_CREDITS_MAX);
    if (priceWon === null || credits === null || out.some((p) => p.priceWon === priceWon)) continue;
    out.push({ priceWon, credits });
    if (out.length === CREDIT_PACKS_MAX) break;
  }
  out.sort((a, b) => a.priceWon - b.priceWon);
  return out.length ? out : null;
}

/** 쓰는 곳별 크레딧 — 없거나 틀린 칸은 기본값 */
export function normalizeCreditCosts(raw: unknown): Record<CreditUse, number> {
  const src = asObject(raw) ?? {};
  const out = { ...DEFAULT_CREDIT_COSTS } as Record<CreditUse, number>;
  for (const k of CREDIT_USES) {
    const v = intIn(src[k], 0, CREDIT_COST_MAX);
    if (v !== null) out[k] = v;
  }
  return out;
}

/* ─────────────────────────── 요금제 값(가족 패스 · 스타트팩) ─────────────────────────── */

export type PassPeriod = "monthly" | "yearly";
export const PASS_PERIODS: readonly PassPeriod[] = ["monthly", "yearly"];
export const PASS_PERIOD_LABEL: Readonly<Record<PassPeriod, string>> = { monthly: "가족 패스(월간)", yearly: "가족 패스(연간)" };

/** 요금제 값 한 칸 — 이름 · 단위 · 받는 범위(DB 함수 master_set_offer_settings 와 같은 범위) */
export type TermField<K extends string> = { key: K; label: string; unit: string; min: number; max: number };

export const PASS_TERM_FIELDS: readonly TermField<keyof PassPlanTerms>[] = [
  { key: "priceWon", label: "값(부가세 포함)", unit: "원", min: 1_000, max: 10_000_000 },
  { key: "booksPerMonth", label: "매달 새 동화", unit: "권", min: 1, max: 100 },
  { key: "familyCharacters", label: "가족 캐릭터", unit: "명", min: 1, max: 20 },
  { key: "voices", label: VOICE_TERM_LABEL, unit: "명", min: 0, max: 10 },
  { key: "voiceRemakesPerMonth", label: "목소리 다시 만들기(한 달에)", unit: "번", min: 0, max: 10 },
  { key: "drawTokensPerMonth", label: "가족 그리기 토큰(매달)", unit: "개", min: 0, max: 100 },
  { key: "drawTokensFirstMonth", label: "가족 그리기 토큰(첫 달)", unit: "개", min: 0, max: 200 },
];

export const STARTER_TERM_FIELDS: readonly TermField<keyof StarterTerms>[] = [
  { key: "priceWon", label: "값(부가세 포함)", unit: "원", min: 0, max: 1_000_000 },
  { key: "books", label: "동화 만들기", unit: "권", min: 0, max: 20 },
  { key: "familyCharacters", label: "가족 캐릭터", unit: "명", min: 0, max: 20 },
  { key: "voices", label: VOICE_TERM_LABEL, unit: "명", min: 0, max: 10 },
];

/** "19,900원" · "4권" · "1명" */
export function termValueText(unit: string, n: number): string {
  return unit === "원" ? won(n) : `${n}${unit}`;
}

export function clonePlanTerms(t: PlanTerms): PlanTerms {
  return { monthly: { ...t.monthly }, yearly: { ...t.yearly }, starter: { ...t.starter } };
}

function pickTerms<K extends string>(
  raw: unknown,
  fields: readonly TermField<K>[],
  base: Readonly<Record<K, number>>,
): Record<K, number> {
  const src = asObject(raw);
  const out = { ...base } as Record<K, number>;
  for (const f of fields) {
    const v = intIn(src?.[f.key], f.min, f.max);
    if (v !== null) out[f.key] = v;
  }
  return out;
}

/** DB 값 → 요금제 값. 빠지거나 범위 밖인 칸은 기본값 */
export function normalizePlanTerms(raw: unknown): PlanTerms {
  const src = asObject(raw) ?? {};
  return {
    monthly: pickTerms(src.monthly, PASS_TERM_FIELDS, DEFAULT_PLAN_TERMS.monthly) as PassPlanTerms,
    yearly: pickTerms(src.yearly, PASS_TERM_FIELDS, DEFAULT_PLAN_TERMS.yearly) as PassPlanTerms,
    starter: pickTerms(src.starter, STARTER_TERM_FIELDS, DEFAULT_PLAN_TERMS.starter) as StarterTerms,
  };
}

type TermsPart<K extends string> = { ok: true; value: Record<K, number> } | { ok: false; error: string };

function parseTermsPart<K extends string>(name: string, raw: unknown, fields: readonly TermField<K>[]): TermsPart<K> {
  const o = asObject(raw);
  if (!o) return { ok: false, error: `${name} 값이 빠졌어요.` };
  for (const k of Object.keys(o)) {
    if (!fields.some((f) => f.key === k)) return { ok: false, error: `모르는 항목이에요: ${k}` };
  }
  const out = {} as Record<K, number>;
  for (const f of fields) {
    const v = intIn(o[f.key], f.min, f.max);
    if (v === null) {
      return {
        ok: false,
        error: `${name} ${f.label}은(는) ${termValueText(f.unit, f.min)}~${termValueText(f.unit, f.max)} 사이 정수로 적어 주세요.`,
      };
    }
    out[f.key] = v;
  }
  return { ok: true, value: out };
}

/** 관리실이 보낸 요금제 값 — 세 묶음(월간·연간·스타트팩)의 모든 칸이 있어야 한다 */
export function parsePlanTerms(value: unknown): { ok: true; terms: PlanTerms } | { ok: false; error: string } {
  const o = asObject(value);
  if (!o) return { ok: false, error: "요금제 값 모양이 아니에요." };
  for (const k of Object.keys(o)) {
    if (k !== "monthly" && k !== "yearly" && k !== "starter") return { ok: false, error: `모르는 항목이에요: ${k}` };
  }
  const m = parseTermsPart(PASS_PERIOD_LABEL.monthly, o.monthly, PASS_TERM_FIELDS);
  if (!m.ok) return m;
  const y = parseTermsPart(PASS_PERIOD_LABEL.yearly, o.yearly, PASS_TERM_FIELDS);
  if (!y.ok) return y;
  const st = parseTermsPart("스타트팩", o.starter, STARTER_TERM_FIELDS);
  if (!st.ok) return st;
  return {
    ok: true,
    terms: { monthly: m.value as PassPlanTerms, yearly: y.value as PassPlanTerms, starter: st.value as StarterTerms },
  };
}

/** 책마다 단계 — 책 목록의 모든 책을 채운다. DB 값이 없거나 틀리면 그 책은 기본값, 목록에 없는 책은 버린다. */
export function normalizeLibraryTiers(raw: unknown, catalog: readonly CatalogBook[]): Record<string, LibraryTier> {
  const out = defaultLibraryTiers(catalog);
  const src = asObject(raw) ?? {};
  for (const id of Object.keys(out)) {
    const v = src[id];
    if (isLibraryTier(v)) out[id] = v;
  }
  return out;
}

/** DB 한 줄(못 읽었으면 null) → 화면이 쓰는 값. 모르는 칸·틀린 값은 기본값으로. */
export function offerSettingsFromRow(row: unknown, catalog: readonly CatalogBook[]): OfferSettings {
  const r = asObject(row) ?? {};
  return {
    libraryTiers: normalizeLibraryTiers(r.library_tiers, catalog),
    gateOn: r.library_gate_on === true,
    creditPacks: normalizeCreditPacks(r.credit_packs) ?? DEFAULT_CREDIT_PACKS.map((p) => ({ ...p })),
    creditCosts: normalizeCreditCosts(r.credit_costs),
    plans: normalizePlanTerms(r.plan_settings),
  };
}

/* ─────────────────────────── 요금제 화면 값 ─────────────────────────── */

/** 이 단계로 열리는 책인가(단계는 겹쳐서 열린다) */
export function tierOpens(have: LibraryTier, need: LibraryTier): boolean {
  return TIER_RANK[need] <= TIER_RANK[have];
}

/** 요금제 화면이 그리는 값 — 숨긴 책은 세지 않는다 */
export function offerViewOf(s: OfferSettings, catalog: readonly CatalogBook[]): OfferView {
  const shown = catalog.filter((b) => !b.hidden);
  const tierOf = (b: CatalogBook): LibraryTier => s.libraryTiers[b.id] ?? "pass";
  const count = (kind: LibraryKind, have: LibraryTier) =>
    shown.filter((b) => b.kind === kind && tierOpens(have, tierOf(b))).length;
  return {
    free: {
      classics: count("classic", "free"),
      folk: count("folk", "free"),
      titles: shown.filter((b) => tierOf(b) === "free").map((b) => b.title),
    },
    starter: { classics: count("classic", "starter"), folk: count("folk", "starter") },
    libraryBooks: shown.length,
    creditPacks: s.creditPacks.map((p) => ({ ...p })),
    creditCosts: { ...s.creditCosts },
    plans: clonePlanTerms(s.plans),
  };
}

/* ─────────────────────────── 책장 자물쇠 ─────────────────────────── */

/** 책장이 공개 경로(/api/offer-settings)에서 받는 값 */
export type LibraryAccess = { gateOn: boolean; tiers: Readonly<Record<string, LibraryTier>> };

/** 아무것도 잠그지 않는 값 — 설정을 못 읽었을 때는 지금처럼 다 열어 둔다 */
export const OPEN_LIBRARY: LibraryAccess = { gateOn: false, tiers: {} };

export function libraryAccessOf(s: OfferSettings): LibraryAccess {
  return { gateOn: s.gateOn, tiers: { ...s.libraryTiers } };
}

/** 공개 경로의 답 → 값. 모양이 틀린 칸은 버린다(그 책은 아래 libraryLock 이 가족 패스로 본다). */
export function asLibraryAccess(json: unknown): LibraryAccess {
  const r = asObject(json) ?? {};
  const tiers: Record<string, LibraryTier> = {};
  for (const [id, t] of Object.entries(asObject(r.tiers) ?? {})) {
    if (isLibraryBookId(id) && isLibraryTier(t)) tiers[id] = t;
  }
  return { gateOn: r.gateOn === true, tiers };
}

/* 보는 사람의 단계는 lib/member-plan 의 viewerTierOf — 비회원은 무료, 회원은 관리자가 지정한 요금제(없으면 모두 열림). */

/** 이 책을 열려면 필요한 단계 — 열려 있으면 null. 관리실 스위치가 꺼져 있으면 늘 null. 내가 만든 책은 잠그지 않는다. */
export function libraryLock(access: LibraryAccess, bookId: string, viewer: LibraryTier): LibraryTier | null {
  if (!access.gateOn || !isLibraryBookId(bookId)) return null;
  const need = access.tiers[bookId] ?? "pass";
  return tierOpens(viewer, need) ? null : need;
}

/* ─────────────────────────── 관리실: 바꾸기 · 이력 ─────────────────────────── */

export type OfferField = "library_tiers" | "library_gate_on" | "credit_packs" | "credit_costs" | "plan_settings";
export const OFFER_FIELDS: readonly OfferField[] = [
  "library_tiers",
  "library_gate_on",
  "credit_packs",
  "credit_costs",
  "plan_settings",
];
export const OFFER_FIELD_LABEL: Readonly<Record<OfferField, string>> = {
  library_tiers: "공개 동화 단계",
  library_gate_on: "책장에 적용",
  credit_packs: "크레딧 묶음",
  credit_costs: "크레딧 쓰는 값",
  plan_settings: "요금제 값",
};

/** 관리실이 보내는 바꾸기 — 바꿀 칸만 */
export type OfferPatch = Partial<{
  libraryTiers: Record<string, LibraryTier>;
  gateOn: boolean;
  creditPacks: CreditPack[];
  creditCosts: Record<CreditUse, number>;
  plans: PlanTerms;
}>;

type Parsed = { ok: true; value: { patch: Partial<Record<OfferField, unknown>>; note: string } } | { ok: false; error: string };

/**
 * 관리실이 보낸 { patch, note } 를 검사해 DB 칸 이름으로 바꾼다. 하나라도 틀리면 아무것도 안 바꾼다.
 * 진짜 문지기는 DB 함수(master_set_offer_settings)다 — 여기서는 화면에 바로 알려 주려고 같은 규칙을 먼저 본다.
 */
export function parseOfferPatch(body: unknown, catalogIds: ReadonlySet<string>): Parsed {
  const b = asObject(body);
  if (!b) return { ok: false, error: "요청 본문이 JSON 객체가 아니에요." };
  const note = typeof b.note === "string" ? b.note.trim() : "";
  if (note.length < 2) return { ok: false, error: "왜 바꾸는지 두 글자 이상 적어 주세요." };
  if (note.length > 500) return { ok: false, error: "사유가 너무 길어요(500자까지)." };
  const raw = asObject(b.patch);
  if (!raw) return { ok: false, error: "바꿀 항목이 없어요." };

  const patch: Partial<Record<OfferField, unknown>> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === "libraryTiers") {
      const o = asObject(value);
      const entries = o ? Object.entries(o) : [];
      if (!o || entries.length === 0 || entries.length > TIERS_MAX) return { ok: false, error: "공개 동화 단계 모양이 아니에요." };
      const tiers: Record<string, LibraryTier> = {};
      for (const [id, t] of entries) {
        if (!catalogIds.has(id)) return { ok: false, error: `모르는 동화예요: ${id}` };
        if (!isLibraryTier(t)) return { ok: false, error: "단계는 무료·스타트팩·가족 패스 가운데서 골라 주세요." };
        tiers[id] = t;
      }
      patch.library_tiers = tiers;
    } else if (key === "gateOn") {
      if (typeof value !== "boolean") return { ok: false, error: "켜기·끄기 값이 아니에요." };
      patch.library_gate_on = value;
    } else if (key === "creditPacks") {
      if (!Array.isArray(value) || value.length < 1 || value.length > CREDIT_PACKS_MAX) {
        return { ok: false, error: `크레딧 묶음은 1~${CREDIT_PACKS_MAX}개로 정해 주세요.` };
      }
      const packs: CreditPack[] = [];
      for (const p of value) {
        const o = asObject(p);
        const priceWon = intIn(o?.priceWon, PACK_PRICE_MIN, PACK_PRICE_MAX);
        const credits = intIn(o?.credits, 1, PACK_CREDITS_MAX);
        if (priceWon === null) {
          return { ok: false, error: `묶음 값은 ${won(PACK_PRICE_MIN)}~${won(PACK_PRICE_MAX)} 사이 정수로 적어 주세요.` };
        }
        if (credits === null) {
          return { ok: false, error: `묶음 크레딧은 1~${creditsText(PACK_CREDITS_MAX)} 사이 정수로 적어 주세요.` };
        }
        if (packs.some((x) => x.priceWon === priceWon)) return { ok: false, error: `${won(priceWon)} 묶음이 두 개예요.` };
        packs.push({ priceWon, credits });
      }
      packs.sort((x, y) => x.priceWon - y.priceWon);
      patch.credit_packs = packs;
    } else if (key === "creditCosts") {
      const o = asObject(value);
      if (!o) return { ok: false, error: "크레딧 쓰는 값 모양이 아니에요." };
      const costs = {} as Record<CreditUse, number>;
      for (const k of Object.keys(o)) {
        if (!(CREDIT_USES as readonly string[]).includes(k)) return { ok: false, error: `모르는 항목이에요: ${k}` };
      }
      for (const k of CREDIT_USES) {
        const v = intIn(o[k], 0, CREDIT_COST_MAX);
        if (v === null) {
          return { ok: false, error: `${CREDIT_USE_LABEL[k]} 값은 0~${creditsText(CREDIT_COST_MAX)} 사이 정수로 적어 주세요.` };
        }
        costs[k] = v;
      }
      patch.credit_costs = costs;
    } else if (key === "plans") {
      const r = parsePlanTerms(value);
      if (!r.ok) return r;
      patch.plan_settings = r.terms;
    } else {
      return { ok: false, error: `모르는 항목이에요: ${key}` };
    }
  }
  if (Object.keys(patch).length === 0) return { ok: false, error: "바꿀 항목이 없어요." };
  return { ok: true, value: { patch, note } };
}

const LOG_LINES_MAX = 8;

/** 이력 한 줄을 사람이 읽는 글로 — 무엇이 무엇에서 무엇으로 */
export function describeOfferChange(field: string, oldRaw: unknown, newRaw: unknown, catalog: readonly CatalogBook[]): string[] {
  if (field === "library_tiers") {
    const before = normalizeLibraryTiers(oldRaw, catalog);
    const after = normalizeLibraryTiers(newRaw, catalog);
    const lines = catalog
      .filter((b) => before[b.id] !== after[b.id])
      .map((b) => `${b.title}: ${TIER_LABEL[before[b.id]]} → ${TIER_LABEL[after[b.id]]}`);
    if (lines.length === 0) return ["바뀐 동화 없음"];
    return lines.length > LOG_LINES_MAX ? [...lines.slice(0, LOG_LINES_MAX), `그 밖에 ${lines.length - LOG_LINES_MAX}권`] : lines;
  }
  if (field === "library_gate_on") {
    return [`${oldRaw === true ? "켜짐" : "꺼짐"} → ${newRaw === true ? "켜짐" : "꺼짐"}`];
  }
  if (field === "credit_packs") {
    const fmt = (raw: unknown) =>
      (normalizeCreditPacks(raw) ?? DEFAULT_CREDIT_PACKS).map((p) => `${won(p.priceWon)} ${creditsText(p.credits)}`).join(" · ");
    return [fmt(oldRaw), `→ ${fmt(newRaw)}`];
  }
  if (field === "plan_settings") {
    const a = normalizePlanTerms(oldRaw);
    const c = normalizePlanTerms(newRaw);
    const lines: string[] = [];
    for (const period of PASS_PERIODS) {
      for (const f of PASS_TERM_FIELDS) {
        if (a[period][f.key] !== c[period][f.key]) {
          lines.push(
            `${PASS_PERIOD_LABEL[period]} ${f.label}: ${termValueText(f.unit, a[period][f.key])} → ${termValueText(f.unit, c[period][f.key])}`,
          );
        }
      }
    }
    for (const f of STARTER_TERM_FIELDS) {
      if (a.starter[f.key] !== c.starter[f.key]) {
        lines.push(`스타트팩 ${f.label}: ${termValueText(f.unit, a.starter[f.key])} → ${termValueText(f.unit, c.starter[f.key])}`);
      }
    }
    return lines.length ? lines : ["바뀐 값 없음"];
  }
  if (field === "credit_costs") {
    const a = normalizeCreditCosts(oldRaw);
    const c = normalizeCreditCosts(newRaw);
    const lines = CREDIT_USES.filter((k) => a[k] !== c[k]).map(
      (k) => `${CREDIT_USE_LABEL[k]}: ${creditsText(a[k])} → ${creditsText(c[k])}`,
    );
    return lines.length ? lines : ["바뀐 값 없음"];
  }
  return [];
}

export type OfferLogRow = {
  id: number;
  field: string;
  label: string;
  lines: string[];
  note: string | null;
  by: string | null;
  at: string;
};

/** DB 이력 함수(master_offer_settings_log)의 한 줄 → 화면 줄. 모양이 틀리면 null. */
export function offerLogFromRow(row: unknown, catalog: readonly CatalogBook[]): OfferLogRow | null {
  const r = asObject(row);
  if (!r || typeof r.field !== "string" || typeof r.at !== "string") return null;
  const field = r.field;
  return {
    id: Number(r.id) || 0,
    field,
    label: (OFFER_FIELD_LABEL as Record<string, string>)[field] ?? field,
    lines: describeOfferChange(field, r.old_value, r.new_value, catalog),
    note: typeof r.note === "string" ? r.note : null,
    by: typeof r.changed_by_username === "string" ? r.changed_by_username : null,
    at: r.at,
  };
}

/** GET /api/admin/offer 의 답 */
export type OfferAdminResponse = {
  /** 표가 아직 없으면 false(사장님이 SQL 을 돌리기 전) — 값은 기본값이고 저장은 막힌다 */
  schemaReady: boolean;
  settings: OfferSettings;
  defaults: OfferSettings;
  catalog: CatalogBook[];
  log: OfferLogRow[];
  /** 이 사람이 바꿀 수 있나(회사 계정만) */
  canEdit: boolean;
  updatedAt: string | null;
};
