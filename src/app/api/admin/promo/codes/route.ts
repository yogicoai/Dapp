import {
  isPromoCodeShape,
  normalizePromoCode,
  PROMO_LABEL_MAX,
  PROMO_LABEL_MIN,
  promoLookupOf,
  serialRowsOf,
} from "@/lib/promo-codes";
import { dbFailOrNotReady, fail, json, masterOnly } from "../../_guard";

/**
 * 관리실 '혜택 코드' — 시리얼 한 장 한 장.
 *
 * GET ?label=<묶음 이름> → { codes } — 요기보 팀에 넘길 엑셀(CSV)은 화면이 만든다(lib/promo-codes serialCsv)
 * GET ?lookup=<코드>     → { lookup } — 문의 응대("시리얼이 안 돼요"): 어떤 코드인지 · 누가 언제 썼는지
 * 진짜 문지기는 DB 함수(master_promo_batch_codes · master_promo_lookup).
 */
export const GET = masterOnly(async (caller, request) => {
  const sp = new URL(request.url).searchParams;
  const lookup = sp.get("lookup");
  if (lookup !== null) {
    const code = normalizePromoCode(lookup);
    if (!isPromoCodeShape(code)) return fail("코드는 영문·숫자 4~24자예요.", 400);
    const { data, error } = await caller.db.rpc("master_promo_lookup", { p_code: code });
    if (error) return dbFailOrNotReady(error, { lookup: null });
    return json({ schemaReady: true, lookup: promoLookupOf(data) });
  }
  const label = (sp.get("label") ?? "").trim();
  if (label.length < PROMO_LABEL_MIN || label.length > PROMO_LABEL_MAX) return fail("묶음 이름이 올바르지 않아요.", 400);
  const { data, error } = await caller.db.rpc("master_promo_batch_codes", { p_label: label });
  if (error) return dbFailOrNotReady(error, { codes: [] });
  return json({ schemaReady: true, codes: serialRowsOf(data) });
});
