import type { Metadata } from "next";
import { PlansView } from "@/components/pay/PlansView";
import { getOfferView } from "@/lib/offer-settings-server";
import { PLANS_PREVIEW_NOTE, plansOf, priceLabel } from "@/lib/plans";

/**
 * /plans 요금제 — 로그인 없이 누구나 본다(링크만 있으면 누구나 열 수 있다).
 * 첫 HTML 에 가격이 그대로 들어 있다(PlansView 는 로그인 상태를 읽지 않는다).
 * 무료·스타트팩으로 여는 동화 권수와 크레딧 값은 관리실 설정이라 여기(서버)서 읽어 넘긴다 — 읽기 전용 공개 값이고,
 * 못 읽으면 기본값으로 그린다. 1분마다 새로 그리고, 관리실에서 바꾸면 그 자리에서 다시 그리게 한다(관리실 저장 경로).
 * 출시 전(PLANS_PREVIEW_NOTE 가 있는 동안)에는 검색엔진 색인을 막는다 — 아직 팔지 않는 조건이 검색 결과로 먼저 퍼지지 않게.
 * 정식 출시 때 PLANS_PREVIEW_NOTE 를 null 로 하면 색인이 열린다.
 */
export const revalidate = 60;

// 검색 결과에 보이는 값도 관리실 요금제 값으로(본문과 같은 값 — 한 요청 안에서는 DB 를 한 번만 읽는다)
export async function generateMetadata(): Promise<Metadata> {
  const plans = plansOf((await getOfferView()).plans);
  return {
    title: "요금제 · 우리 가족 보이스 동화",
    description: `가족 패스 ${priceLabel(plans.monthly)} · ${priceLabel(plans.yearly)}. 세계명작·전래동화 몇 권은 가입하지 않아도 들을 수 있어요.`,
    ...(PLANS_PREVIEW_NOTE ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function PlansPage() {
  return <PlansView offer={await getOfferView()} />;
}
