import { BillingDemo } from "@/components/pay/BillingDemo";
import { getOfferView } from "@/lib/offer-settings-server";

/** /billing 내 결제·구독(시연) — 로그인 확인과 시연 기록 읽기는 BillingDemo 가 브라우저에서 한다. */
// 요금제 값(관리실)을 1분마다 다시 읽는다 — 관리실에서 바꾸면 그 자리에서도 다시 그린다(관리실 저장 경로).
export const revalidate = 60;

export default async function BillingPage() {
  const offer = await getOfferView();
  return <BillingDemo terms={offer.plans} />;
}
