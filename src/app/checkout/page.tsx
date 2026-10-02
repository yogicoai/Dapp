import { redirect } from "next/navigation";
import { CheckoutDemo } from "@/components/pay/CheckoutDemo";
import { getOfferView } from "@/lib/offer-settings-server";
import { parseCreditPack, parsePlan } from "@/lib/pay-demo";

/**
 * /checkout?plan=monthly|yearly|extra3|starter — 결제하기(시연).
 * /checkout?plan=credit&pack=4900 — 크레딧 묶음(pack = 묶음 값, 관리실 묶음 목록에 있는 값만).
 * 요금제는 정해진 목록에 있는 값만 받는다. 없거나 틀리면 요금제 화면으로.
 * 나중에 진짜 PG: 이 얇은 page 가 스위치를 보고 CheckoutDemo 와 CheckoutLive 중 하나를 고른다.
 */
export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const plan = parsePlan(sp.plan);
  if (!plan) redirect("/plans");
  // 값·권수는 관리실 요금제 값(요금제 화면과 같은 곳) — 못 읽으면 기본값
  const offer = await getOfferView();
  // 크레딧 금액·크레딧 수는 주소가 아니라 관리실 묶음 목록에서 온다
  const creditPack = plan === "credit" ? parseCreditPack(offer.creditPacks, sp.pack) : null;
  if (plan === "credit" && !creditPack) redirect("/plans");
  return <CheckoutDemo plan={plan} terms={offer.plans} creditPack={creditPack ?? undefined} />;
}
