import { FailView } from "@/components/pay/FailView";
import { parseFailCode, parsePackPrice, parsePlan } from "@/lib/pay-demo";

/**
 * /checkout/fail?plan=…&code=…(&pack=…) — 결제 실패(시연).
 * 문구는 code 로만 고른다. 주소의 설명 글(message)은 **읽지 않는다**.
 * pack(크레딧 묶음 값)은 '다시 해 볼게요' 주소에만 싣는다 — 맞는 묶음인지는 결제하기 page 가 다시 본다.
 */
export default async function CheckoutFailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  return <FailView code={parseFailCode(sp.code)} plan={parsePlan(sp.plan) ?? "monthly"} pack={parsePackPrice(sp.pack)} />;
}
