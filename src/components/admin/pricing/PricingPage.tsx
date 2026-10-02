"use client";

/**
 * 요금제·가격 (/admin/pricing) — 가격 정책을 한곳에 모았다(2026-10-02 사장님 "관리자 화면에서 스타트팩이나 이런 정책들
 * 정리해서 가격정책을 설정할 수 있게", "어드민단에서 다 설정들을 정리"). 탭 셋:
 *  1. 요금제 — 고객에게 보이는 요금제 한눈에 + 가족 패스(월간·연간)·스타트팩 값과 구성 고치기
 *  2. 크레딧 — 가격별 묶음 · 쓰는 곳별 크레딧
 *  3. 앱 안 토큰·결제 화면 — 동화를 만들 때 쓰는 앱 안 토큰 값(옛 가격 화면) · 결제 화면이 시연인지
 * 회원 종류마다 보여 줄 동화는 '공개 동화' 메뉴(운영)에서, 회원 한 명 한 명의 요금제는 '회원' 화면에서 정한다.
 *
 * 1·2 는 같은 설정(GET /api/admin/offer)을 한 번만 읽어 나눠 쓴다 — 탭마다 자기 칸만 저장해서 서로 덮지 않는다.
 * 탭은 주소(?tab=)에 둔다(새로 고쳐도 같은 탭). 탭은 감추기만 하고 내리지 않는다 — 고치던 값이 탭을 옮겨도 남게.
 * '실제 결제(원)'·'크레딧'과 앱 안의 '토큰'을 섞어 읽지 않게 탭과 제목마다 무엇의 값인지 적는다.
 */
import { PageHeader, SectionTabs, useAdminQuery, useTabParam } from "@/components/admin/kit";
import type { OfferAdminResponse } from "@/lib/offer-settings";
import { CreditSettingsCard } from "./CreditSettingsCard";
import { PayDemoCard } from "./PayDemoCard";
import { PlanPolicyPanel } from "./PlanPolicyPanel";
import { TokenPricingCard } from "./TokenPricingCard";

const TABS = ["plans", "credits", "app"] as const;

export function PricingPage() {
  const [tab, setTab] = useTabParam("tab", TABS, "plans");
  const offer = useAdminQuery<OfferAdminResponse>("/api/admin/offer");
  return (
    <>
      <PageHeader
        title="요금제·가격"
        description="고객이 내는 요금제(원)와 크레딧, 그리고 동화를 만들 때 쓰는 앱 안 토큰 값을 한곳에서 정해요. 보여 줄 동화는 '공개 동화' 메뉴에서 골라요."
      />
      <SectionTabs
        label="요금제·가격 나누기"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "plans", label: "요금제" },
          { key: "credits", label: "크레딧" },
          { key: "app", label: "앱 안 토큰·결제 화면" },
        ]}
      />
      <div role="tabpanel" aria-label="요금제" hidden={tab !== "plans"} className="flex flex-col gap-6">
        <PlanPolicyPanel query={offer} onGoTab={setTab} />
      </div>
      <div role="tabpanel" aria-label="크레딧" hidden={tab !== "credits"} className="flex flex-col gap-6">
        <CreditSettingsCard query={offer} />
      </div>
      <div role="tabpanel" aria-label="앱 안 토큰·결제 화면" hidden={tab !== "app"} className="flex flex-col gap-6">
        <PayDemoCard />
        <TokenPricingCard />
      </div>
    </>
  );
}
