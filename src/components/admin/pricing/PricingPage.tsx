"use client";

/**
 * 요금제·가격 (/admin/pricing) — 위에서 아래로 세 가지.
 *  1. 요금제(고객에게 보이는 값) — lib/plans 에서 읽기만. 결제사를 붙일 때 DB 로 옮긴다.
 *  2. 결제 화면 상태 — 고객 결제 화면이 시연인지(배포 설정 값).
 *  3. 토큰 값·지급량 — 옛 관리실 가격 화면을 옮긴 것(회사 계정만 바꾼다, 사유 필수). 옛 가격표는 그 안에 접어 둔다.
 *
 * '실제 결제(원)'와 '토큰'을 섞어 읽지 않게 제목마다 무엇의 값인지 적는다.
 */
import { PageHeader } from "@/components/admin/kit";
import { PayDemoCard } from "./PayDemoCard";
import { PlanCatalogCard } from "./PlanCatalogCard";
import { TokenPricingCard } from "./TokenPricingCard";

export function PricingPage() {
  return (
    <>
      <PageHeader
        title="요금제·가격"
        description="고객이 실제로 내는 요금제(원)와, 동화를 만들 때 쓰는 토큰 값을 보는 곳이에요."
      />
      <PlanCatalogCard />
      <PayDemoCard />
      <TokenPricingCard />
    </>
  );
}
