import { isSchemaMissing } from "@/lib/admin-console";
import { parsePromoCreateBody, parsePromoToggleBody, parsePromoUpdateBody, promoOverviewOf, promoStatsOf } from "@/lib/promo-codes";
import { bodyTooLarge, dbFail, dbFailOrNotReady, fail, json, masterOnly, readBody } from "../_guard";

/**
 * 관리실 '혜택·이벤트 관리' — 요기보 회원 혜택(공용 코드)·요기보 구매 고객 시리얼(사장님 2026-10-22 미팅).
 *
 * GET  → { schemaReady, shared: 공용 코드 줄들, batches: 시리얼 묶음(이름별 장수·쓴 장수), stats: 숫자(19번 SQL 전이면 null) }
 * POST { action: "create", mode: "shared" | "serial", ... } → 공용 코드 하나 / 시리얼 N장 만들기
 *      { action: "update", mode: "shared" | "serial", ... } → 켜고 끄기 · 넣을 수 있는 마지막 날 · (공용) 전체 듣기 끝나는 날
 *      { action: "toggleCode", code, active } → 코드 한 장 켜고 끄기(새어 나간 시리얼 · 취소된 주문, 19번 SQL)
 * 진짜 문지기는 DB 함수(master_* — is_master_user 로 다시 막고 값도 다시 본다). 서비스 키는 쓰지 않는다.
 */
const SQL_FILE = "18번 SQL(혜택 코드)";
const SQL_FILE_ADMIN = "19번 SQL(혜택·이벤트 관리)";

function notReady(error: { code?: string | null }, file = SQL_FILE): Response {
  return fail(`데이터베이스 준비 전이에요 — ${file}을 먼저 돌려 주세요.`, 503, { code: error.code ?? null });
}

export const GET = masterOnly(async (caller) => {
  const [overview, stats] = await Promise.all([caller.db.rpc("master_promo_overview"), caller.db.rpc("master_promo_stats")]);
  if (overview.error) return dbFailOrNotReady(overview.error, { shared: [], batches: [], stats: null });
  if (stats.error && !isSchemaMissing(stats.error)) return dbFail(stats.error);
  return json({ schemaReady: true, ...promoOverviewOf(overview.data), stats: stats.error ? null : promoStatsOf(stats.data) });
});

export const POST = masterOnly(async (caller, request) => {
  if (bodyTooLarge(request, 10_000)) return fail("요청이 너무 커요.", 413);
  const body = await readBody(request);
  if (!body) return fail("요청 본문이 JSON 객체가 아니에요.", 400);

  if (body.action === "create") {
    const parsed = parsePromoCreateBody(body);
    if (!parsed.ok) return fail(parsed.error, 400);
    const v = parsed.value;
    const common = {
      p_label: v.label,
      p_book: v.bookCredits,
      p_draw: v.drawCredits,
      p_library_until: v.libraryUntil,
      p_library_days: v.libraryDays,
      p_ends_at: v.endsAt,
    };
    const { data, error } =
      v.mode === "shared"
        ? await caller.db.rpc("master_create_promo_code", { p_code: v.code, ...common })
        : await caller.db.rpc("master_create_promo_serials", { p_count: v.count, ...common });
    if (error) return isSchemaMissing(error) ? notReady(error) : dbFail(error);
    return json({ ok: true, result: data });
  }

  if (body.action === "update") {
    const parsed = parsePromoUpdateBody(body);
    if (!parsed.ok) return fail(parsed.error, 400);
    const v = parsed.value;
    const { error } =
      v.mode === "shared"
        ? await caller.db.rpc("master_update_promo_code", {
            p_id: v.id,
            p_active: v.active,
            p_ends_at: v.endsAt,
            p_library_until: v.libraryUntil,
          })
        : await caller.db.rpc("master_update_promo_batch", { p_label: v.label, p_active: v.active, p_ends_at: v.endsAt });
    if (error) return isSchemaMissing(error) ? notReady(error) : dbFail(error);
    return json({ ok: true });
  }

  if (body.action === "toggleCode") {
    const parsed = parsePromoToggleBody(body);
    if (!parsed.ok) return fail(parsed.error, 400);
    const { error } = await caller.db.rpc("master_set_promo_code_active", { p_code: parsed.value.code, p_active: parsed.value.active });
    if (error) return isSchemaMissing(error) ? notReady(error, SQL_FILE_ADMIN) : dbFail(error);
    return json({ ok: true });
  }

  return fail("무엇을 할지(action) 알 수 없어요.", 400);
});
