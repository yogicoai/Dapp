import { revalidatePath } from "next/cache";
import { COMPANY_ADMIN, isSchemaMissing } from "@/lib/admin-console";
import { LIBRARY_CATALOG, LIBRARY_IDS } from "@/lib/library-catalog";
import {
  defaultOfferSettings,
  OFFER_PUBLIC_SELECT,
  offerLogFromRow,
  offerSettingsFromRow,
  parseOfferPatch,
  type OfferAdminResponse,
  type OfferLogRow,
} from "@/lib/offer-settings";
import { bodyTooLarge, dbFail, dbFailOrNotReady, fail, json, masterOnly, readBody } from "../_guard";

/**
 * 관리실 '공개 동화'(/admin/library) · '크레딧 설정'(/admin/pricing) — 같은 한 줄(app_offer_settings)을 읽고 바꾼다.
 *
 * GET  → OfferAdminResponse  (마스터 모두 읽는다. 책 목록도 함께 — 화면이 책 본문 JSON 을 받지 않게)
 * POST { patch, note } → 바꾼다. **회사 계정만** — DB 의 master_set_offer_settings(is_pricing_admin)가 다시 막는다.
 *
 * 표가 아직 없으면(SQL 전) GET 은 기본값과 schemaReady:false 로 답한다 — 화면이 '준비 전'을 알린다.
 * 저장하면 요금제 화면(/plans)을 다시 그리게 한다. 책장(공개 경로)은 1분 캐시라 1~5분 안에 바뀐다.
 */

export const GET = masterOnly(async (caller) => {
  const canEdit = caller.username === COMPANY_ADMIN;
  const defaults = defaultOfferSettings(LIBRARY_CATALOG);
  const catalog = [...LIBRARY_CATALOG];
  const [row, log] = await Promise.all([
    caller.db.from("app_offer_settings").select(OFFER_PUBLIC_SELECT).eq("id", 1).maybeSingle(),
    caller.db.rpc("master_offer_settings_log", { p_limit: 50 }),
  ]);

  if (row.error) {
    const notReady: Omit<OfferAdminResponse, "schemaReady"> = {
      settings: defaults,
      defaults,
      catalog,
      log: [],
      canEdit,
      updatedAt: null,
    };
    return dbFailOrNotReady(row.error, notReady);
  }
  // 이력은 없어도 화면을 막지 않는다 — 값이 먼저다.
  if (log.error) console.warn("[admin/offer] 이력 오류", log.error.code, log.error.message);

  const updatedAt = (row.data as { updated_at?: unknown } | null)?.updated_at;
  const body: OfferAdminResponse = {
    schemaReady: true,
    settings: offerSettingsFromRow(row.data, LIBRARY_CATALOG),
    defaults,
    catalog,
    log: ((log.data as unknown[] | null) ?? [])
      .map((r) => offerLogFromRow(r, LIBRARY_CATALOG))
      .filter((r): r is OfferLogRow => r !== null)
      .slice(0, 50),
    canEdit,
    updatedAt: typeof updatedAt === "string" ? updatedAt : null,
  };
  return json(body);
});

export const POST = masterOnly(async (caller, request) => {
  if (caller.username !== COMPANY_ADMIN) return fail("이 계정은 공개 동화·크레딧 설정을 바꿀 수 없어요.", 403);
  if (bodyTooLarge(request, 50_000)) return fail("요청이 너무 커요.", 413);
  const body = await readBody(request);
  if (!body) return fail("요청 본문이 JSON 객체가 아니에요.", 400);

  const parsed = parseOfferPatch(body, LIBRARY_IDS);
  if (!parsed.ok) return fail(parsed.error, 400);

  const { data, error } = await caller.db.rpc("master_set_offer_settings", {
    p_patch: parsed.value.patch,
    p_note: parsed.value.note,
  });
  if (error) {
    if (isSchemaMissing(error)) {
      return fail("데이터베이스 준비 전이에요 — supabase-offer-settings.sql 을 먼저 돌려 주세요.", 503, { code: error.code });
    }
    return dbFail(error);
  }

  // 요금제 화면(값·구성·무료 권수·크레딧)과 내 결제 화면(값)이 이 값을 보여 준다 — 다음 방문 때 새로 그린다.
  revalidatePath("/plans");
  revalidatePath("/billing");

  const result = (data ?? {}) as { changed?: unknown; settings?: unknown };
  return json({
    ok: true,
    changed: Number(result.changed) || 0,
    settings: offerSettingsFromRow(result.settings, LIBRARY_CATALOG),
  });
});
