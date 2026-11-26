/**
 * 구글 플레이 상품 표 — 서버(lib/google-play)와 화면(lib/google-play-client)이 같이 읽는다.
 * node:crypto 같은 서버 것은 가져오지 않는 순수 파일이다(화면 묶음에 들어가도 된다). 시험은 google-play.test.ts.
 *
 * 상품(플레이 콘솔, 11-26 등록 — ID 는 영구):
 *   구독  family_pass(월간, 기본 요금제 monthly) · family_pass_yearly(연간, yearly)
 *         ※ 앱의 결제 다리(androidbrowserhelper billing 1.2.0)는 구독의 첫 기본 요금제만 띄울 수 있어
 *           월·연을 한 구독 안 기본 요금제로 두지 않고 구독을 둘로 나눴다(family_pass 안의 yearly 는 비활성).
 *   단품  starter_pack · credit_pack_1 · credit_pack_2 · credit_pack_3 (구매 옵션 buy)
 */

export type GooglePlayProductKind = "subscription" | "starter" | "credit";

export type GooglePlayProduct = {
  productId: string;
  kind: GooglePlayProductKind;
  /** 구독이면 우리 요금제 코드(member_plans.plan) */
  plan?: "monthly" | "yearly";
  /** 크레딧 묶음이면 관리실 크레딧 묶음의 몇 번째(0부터) — 개수·값은 관리실 값을 따른다 */
  creditPackIndex?: number;
};

export const GOOGLE_PLAY_PRODUCTS: readonly GooglePlayProduct[] = [
  { productId: "family_pass", kind: "subscription", plan: "monthly" },
  { productId: "family_pass_yearly", kind: "subscription", plan: "yearly" },
  { productId: "starter_pack", kind: "starter" },
  { productId: "credit_pack_1", kind: "credit", creditPackIndex: 0 },
  { productId: "credit_pack_2", kind: "credit", creditPackIndex: 1 },
  { productId: "credit_pack_3", kind: "credit", creditPackIndex: 2 },
];

export function googlePlayProduct(productId: unknown): GooglePlayProduct | null {
  if (typeof productId !== "string") return null;
  return GOOGLE_PLAY_PRODUCTS.find((p) => p.productId === productId) ?? null;
}

/** 우리 요금제 코드 → 구독 상품 ID */
export function subscriptionProductOfPlan(plan: "monthly" | "yearly"): string {
  return plan === "yearly" ? "family_pass_yearly" : "family_pass";
}

/**
 * 지금 파는 상품 — 1단계(2026-11-26 사장님 "구독·스타트팩 먼저"). 크레딧 묶음은 2단계(잔액·1년 만료·알림과 함께).
 * 서버는 이 목록 밖 상품의 구매 토큰을 받지 않는다(확정하지 않으면 구글이 3일 뒤 돌려준다).
 */
export const SELLING_NOW: readonly string[] = ["family_pass", "family_pass_yearly", "starter_pack"];

export function isSellingNow(productId: unknown): productId is string {
  return typeof productId === "string" && SELLING_NOW.includes(productId);
}

/** 구글 구매 토큰 모양 — 영문·숫자·.-_: 로 된 긴 글자. 이상한 값은 구글에 묻기 전에 막는다. */
export function isPurchaseToken(v: unknown): v is string {
  return typeof v === "string" && v.length >= 20 && v.length <= 1000 && /^[A-Za-z0-9._\-:]+$/.test(v);
}

/** 플레이 스토어 정기 결제 관리 화면 — 해지·결제 수단 바꾸기는 여기서(우리 앱이 대신할 수 없다) */
export function playSubscriptionsUrl(productId: string, packageName: string): string {
  return `https://play.google.com/store/account/subscriptions?sku=${encodeURIComponent(productId)}&package=${encodeURIComponent(packageName)}`;
}
