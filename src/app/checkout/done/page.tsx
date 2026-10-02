import { DoneDemo, PgNotConnected } from "@/components/pay/DoneDemo";
import { getOfferView } from "@/lib/offer-settings-server";
import { isDemoOrderId, parseMethod, parsePlan } from "@/lib/pay-demo";

/**
 * /checkout/done — 시연 결제 완료.
 * 주소 값은 세 개(orderId·plan·method)만 정해진 모양일 때 넘기고 나머지는 버린다.
 * 완료 화면을 그릴지는 DoneDemo 가 이 탭의 시연 기록과 견줘 정한다(주소만으로는 완료가 되지 않는다).
 *
 * TODO(PG-HOOK-2) 진짜 PG: 결제사가 돌려보낸 값으로 결제 확인 서버 경로를 한 번 부르고 그 결과를 그린다.
 * 그 전까지 결제사 결제 키(paymentKey)가 실려 오면 멈춘다 — 진짜 결제를 가짜 '완료'로 덮지 않게.
 */
export default async function CheckoutDonePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  if (sp.paymentKey !== undefined) return <PgNotConnected />;
  const orderId = isDemoOrderId(sp.orderId) ? sp.orderId : null;
  const offer = await getOfferView();
  return <DoneDemo orderId={orderId} plan={parsePlan(sp.plan)} method={parseMethod(sp.method)} terms={offer.plans} />;
}
