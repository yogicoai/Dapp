import type { Metadata } from "next";
import { LegalPage, legalMetadata } from "@/components/legal/LegalPage";

/**
 * /refund 환불·청약철회 안내 — 관리실 '사업자 정보·약관'에서 게시한 판을 보여 준다(로그인 없이 누구나).
 * 5분마다 새로 그리고, 관리실에서 게시하면 그 자리에서 다시 그리게 한다(게시 경로의 revalidatePath).
 */
export const revalidate = 300;

export function generateMetadata(): Promise<Metadata> {
  return legalMetadata("refund");
}

export default function Page() {
  return <LegalPage kind="refund" />;
}
