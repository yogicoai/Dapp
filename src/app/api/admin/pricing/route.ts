import { asPricing, PRICING_COLUMNS, type Pricing } from "@/lib/pricing";
import { dbFail, fail, json, masterOnly, readBody } from "../_guard";

/**
 * 가격 설정 — 관리실에서 토큰 값·지급량을 읽고 바꾼다.
 *
 * GET  → { pricing, log, canEdit }  (마스터 둘 다 읽는다)
 * POST { patch, note } → 바꾼다. **yogico 만** — DB 의 master_set_pricing 이 다시 확인한다.
 *
 * 여기서 값 검사를 하는 까닭: DB 도 검사하지만(말 안 되는 값·사유 없음), 화면에 바로 안내를
 * 띄우려면 같은 규칙을 앞에서도 본다. 진짜 문지기는 DB 다 — 이 경로를 건너뛰어도 막힌다.
 */

/** 바꿀 수 있는 칸. 여기에 없는 이름은 받지 않는다. */
const FIELDS = [
  "token_price_krw",
  "signup_bonus_tokens",
  "cost_text_per_page",
  "cost_illustrated_per_page",
  "cost_parent_voice",
  "max_books_per_user",
  "feedback_bonus_tokens",
  "max_free_rewrites",
  "single_book_krw",
  "sub_weekly_krw",
  "sub_weekly_tokens",
  "sub_monthly_krw",
  "sub_monthly_tokens",
  "sub_yearly_krw",
  "sub_yearly_tokens",
] as const;

export type PricingLogRow = {
  id: number;
  field: string;
  old_value: number | null;
  new_value: number;
  note: string | null;
  changed_by_username: string | null;
  at: string;
};

export type PricingResponse = {
  pricing: Pricing;
  log: PricingLogRow[];
  /** 이 사람이 값을 바꿀 수 있나 (회사 계정 yogico 만). */
  canEdit: boolean;
  me: string;
};

/** 가격을 바꿀 수 있는 계정 — DB 의 is_pricing_admin() 과 같은 규칙. */
const PRICING_ADMIN = "yogico";

export const GET = masterOnly(async (caller) => {
  const [row, log] = await Promise.all([
    caller.db.from("app_pricing").select(PRICING_COLUMNS).eq("id", 1).maybeSingle(),
    caller.db.rpc("master_pricing_log", { p_limit: 50 }),
  ]);
  if (row.error) return dbFail(row.error);
  // 이력은 없어도 화면을 막지 않는다(옛 DB·권한). 값이 먼저다.
  if (log.error) console.warn("[admin/pricing] 이력 오류", log.error.code, log.error.message);

  const body: PricingResponse = {
    pricing: asPricing(row.data),
    log: ((log.data as PricingLogRow[] | null) ?? []).slice(0, 50),
    canEdit: caller.username === PRICING_ADMIN,
    me: caller.username,
  };
  return json(body);
});

export const POST = masterOnly(async (caller, request) => {
  if (caller.username !== PRICING_ADMIN) {
    return fail(`가격은 ${PRICING_ADMIN} 계정에서만 바꿀 수 있어요.`, 403);
  }
  const body = await readBody(request);
  if (!body) return fail("요청 본문이 JSON 객체가 아니에요.", 400);

  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (note.length < 2) return fail("왜 바꾸는지 두 글자 이상 적어 주세요.", 400);
  if (note.length > 500) return fail("사유가 너무 길어요(500자까지).", 400);

  const raw = (body.patch ?? {}) as Record<string, unknown>;
  const patch: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!(FIELDS as readonly string[]).includes(key)) return fail(`모르는 항목이에요: ${key}`, 400);
    if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
      return fail("값은 정수로 적어 주세요.", 400);
    }
    // 구독료·단권 값은 '원'이라 더 큰 수를 받는다(연 구독 99,000원 같은 값).
    const isWon = key.endsWith("_krw");
    const max = isWon ? 10_000_000 : 100_000;
    if (value < 0 || value > max) return fail(`값이 올바르지 않아요(0~${max.toLocaleString("ko-KR")}).`, 400);
    patch[key] = value;
  }
  if (Object.keys(patch).length === 0) return fail("바꿀 항목이 없어요.", 400);

  const { data, error } = await caller.db.rpc("master_set_pricing", { p_patch: patch, p_note: note });
  if (error) return dbFail(error);

  const result = (data ?? {}) as { changed?: number; pricing?: unknown };
  return json({ ok: true, changed: result.changed ?? 0, pricing: asPricing(result.pricing) });
});
