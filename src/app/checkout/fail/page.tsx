import { FailView } from "@/components/pay/FailView";
import { parseFailCode, parsePlan } from "@/lib/pay-demo";

/**
 * /checkout/fail?plan=…&code=… — 결제 실패(시연).
 * 문구는 code 로만 고른다. 주소의 설명 글(message)은 **읽지 않는다**.
 */
export default async function CheckoutFailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  return <FailView code={parseFailCode(sp.code)} plan={parsePlan(sp.plan) ?? "monthly"} />;
}
