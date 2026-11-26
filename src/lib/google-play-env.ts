/**
 * 구글 결제 경로가 쓰는 준비물 — 환경변수(서비스 계정·패키지)로 만든 구글 클라이언트, 서버 열쇠, 관리실 요금제 값.
 * 키가 없으면 null — 경로가 '결제 준비 전'으로 답하고, 화면은 결제 단추 대신 '곧 열려요'를 보인다.
 */
import { billingServerKey, googlePlayClientFromEnv } from "./google-play";
import type { BillingDeps, BillingTerms } from "./google-play-server";
import { getOfferView } from "./offer-settings-server";

export function billingDepsFromEnv(): BillingDeps | null {
  const gp = googlePlayClientFromEnv();
  const key = billingServerKey();
  if (!gp || !key) return null;
  let terms: Promise<BillingTerms> | null = null;
  return {
    gp,
    key,
    now: () => Date.now(),
    // 지급할 때만 읽는다 — 관리실 '요금제·가격' 값(매달 권수·그리기 토큰·스타트팩 구성)
    terms: () =>
      (terms ??= getOfferView().then((v) => ({ monthly: v.plans.monthly, yearly: v.plans.yearly, starter: v.plans.starter }))),
  };
}
