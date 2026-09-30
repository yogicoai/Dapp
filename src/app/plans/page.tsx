import type { Metadata } from "next";
import { PlansView } from "@/components/pay/PlansView";
import { PLANS, PLANS_PREVIEW_NOTE, TRIAL, priceLabel } from "@/lib/plans";

/**
 * /plans 요금제 — 로그인 없이 누구나 본다(링크만 있으면 누구나 열 수 있다).
 * 첫 HTML 에 가격이 그대로 들어 있다(PlansView 는 로그인 상태를 읽지 않는다).
 * 출시 전(PLANS_PREVIEW_NOTE 가 있는 동안)에는 검색엔진 색인을 막는다 — 지금 앱이 따르지 않는 조건
 * (무료 체험 1권·7일 보관)이 검색 결과로 먼저 퍼지지 않게. 정식 출시 때 PLANS_PREVIEW_NOTE 를 null 로 하면 색인이 열린다.
 */
export const metadata: Metadata = {
  title: "요금제 · 우리 가족 보이스 동화",
  description: `가족 패스 ${priceLabel(PLANS.monthly)} · ${priceLabel(PLANS.yearly)}. 첫 동화 ${TRIAL.books}권은 무료로 만들어 보세요.`,
  ...(PLANS_PREVIEW_NOTE ? { robots: { index: false, follow: true } } : {}),
};

export default function PlansPage() {
  return <PlansView />;
}
