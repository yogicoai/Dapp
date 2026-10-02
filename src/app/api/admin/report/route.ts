import { buildAdminReport, type AppTokenInfo } from "@/lib/admin-report";
import { LIBRARY_CATALOG } from "@/lib/library-catalog";
import { OFFER_PUBLIC_SELECT, offerSettingsFromRow, offerViewOf } from "@/lib/offer-settings";
import { asPricing, bookCost, PRICING_COLUMNS } from "@/lib/pricing";
import { json, masterOnly } from "../_guard";

/**
 * GET /api/admin/report — 관리실 '가격정책 확인 데이터' 화면의 내용(관리자만).
 *
 * 원가·마진 숫자는 이 서버 경로에서만 만든다 — 화면 코드(누구나 받을 수 있는 자바스크립트)에는 숫자를 두지 않는다.
 * 요금제·크레딧·공개 동화 값과 앱 안 토큰 값은 DB 에서 읽어 계산한다(못 읽으면 기본값으로 계산하고 그렇다고 적는다).
 * 보고가 끝나면 화면(/admin/report)·이 경로·lib/admin-report 를 함께 지운다.
 */
const SAMPLE_PAGES = 6;

export const GET = masterOnly(async (caller) => {
  const [offer, pricing] = await Promise.all([
    caller.db.from("app_offer_settings").select(OFFER_PUBLIC_SELECT).eq("id", 1).maybeSingle(),
    caller.db.from("app_pricing").select(PRICING_COLUMNS).eq("id", 1).maybeSingle(),
  ]);
  const fromDb = !offer.error && !!offer.data;
  const view = offerViewOf(offerSettingsFromRow(fromDb ? offer.data : null, LIBRARY_CATALOG), LIBRARY_CATALOG);

  let app: AppTokenInfo = null;
  if (!pricing.error && pricing.data) {
    const p = asPricing(pricing.data);
    app = { signupBonus: p.signup_bonus_tokens, tokensPerBook: bookCost(SAMPLE_PAGES, p), tokenWon: p.token_price_krw };
  }
  return json(buildAdminReport(view, app, fromDb ? "db" : "fallback"));
});
