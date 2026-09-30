"use client";

/**
 * 관리실 '결제·구독'(2026-09-30) — 실제 돈(원)이 오간 기록: 결제 내역 · 구독 · 환불.
 *
 * 결제사(PG)를 붙이기 전이라 표가 비어 있다. 그래서
 *  · '결제 연동 전 — 실제 결제 데이터가 아직 없어요' 띠를 늘 맨 위에 둔다(메뉴의 '연동 전' 꼬리표가 있는 동안).
 *  · 띠 오른쪽 '시연 데이터 보기'(주소 ?demo=1)를 켜면 화면에만 있는 예시 줄을 그린다 — 사장님이 고객사에
 *    화면을 보여 줄 수 있게. 시연 줄은 DB 에 없고, 서버로 보내지 않으며, 단추는 꺼져 있다(billing-actions.tsx).
 *  · 할 수 있는 일은 '환불 요청 기록'·'요청 취소'뿐 — 실제 취소는 결제 연동 뒤 서버가 한다.
 *
 * 토큰으로 낸 대본·그림 값(토큰 장부)은 여기 없다 — 회원 화면에 있다. 두 '결제'를 섞지 않으려고 문구에 늘 밝힌다.
 * 탭·거르기·서랍은 모두 주소에 둔다(tab · status · period · q · demo · id). 탭은 숨길 뿐 살려 둔다.
 * 겉틀이 마스터 확인을 끝낸 뒤에만 그려지므로 여기서 따로 확인하지 않는다.
 */
import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BILLING_KINDS, type BillingKind } from "@/lib/admin-billing";
import { demoBilling } from "@/lib/admin-billing-demo";
import { kstDayKey, navItem, payDemoState, withParams } from "@/lib/admin-console";
import { Banner, PageHeader, SectionTabs, Switch, useTabParam, useUrlDrawer } from "@/components/admin/kit";
import { useAdmin } from "@/components/admin/shell/AdminContext";
import { PaymentsTab } from "./PaymentsTab";
import { RefundsTab } from "./RefundsTab";
import { SubscriptionsTab } from "./SubscriptionsTab";
import type { BillingNav } from "./billing-ui";

const TABS: { key: BillingKind; label: string }[] = [
  { key: "payments", label: "결제 내역" },
  { key: "subscriptions", label: "구독" },
  { key: "refunds", label: "환불" },
];

export function BillingPage() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const { clock } = useAdmin();
  const [tab] = useTabParam("tab", BILLING_KINDS, "payments");
  const drawer = useUrlDrawer("id");
  const demoOn = sp.get("demo") === "1";

  // 결제사를 붙이면 메뉴의 '연동 전' 꼬리표를 떼고, 그때 이 띠와 시연 스위치도 함께 내려간다.
  const pgPending = !!navItem("billing").tag;
  // 고객 결제 화면이 시연인가 — 빌드가 값을 박도록 이 글자 그대로 쓴다(pay-demo 규칙과 같은 판단).
  const payDemo = payDemoState(process.env.NEXT_PUBLIC_PAY_DEMO);

  // 시연 줄은 한국 날짜가 같으면 늘 같다 — 새로 고침해도 같은 화면(시계가 1분마다 움직여도 다시 만들지 않는다).
  const demoDay = kstDayKey(new Date(clock || 0).toISOString());
  const demo = useMemo(() => (demoOn && pgPending && demoDay ? demoBilling(new Date(`${demoDay}T12:00:00+09:00`)) : null), [demoOn, pgPending, demoDay]);

  const goto = useCallback(
    (patch: Record<string, string | null>) => router.replace(`${pathname}${withParams(sp.toString(), patch)}`, { scroll: false }),
    [router, pathname, sp],
  );

  const nav: BillingNav = {
    demo,
    drawerId: drawer.value,
    openDrawer: drawer.open,
    closeDrawer: drawer.close,
    goto,
    clock,
  };

  // 탭을 바꾸면 거르기·서랍은 푼다 — 상태 이름이 탭마다 달라서, 주소 하나가 늘 화면 하나를 뜻하게.
  const switchTab = (k: string) => goto({ tab: k === "payments" ? null : k, status: null, q: null, period: null, id: null });

  return (
    <>
      <PageHeader
        title="결제·구독"
        description="실제 돈(원)이 오간 기록이에요. 토큰 쓰고 되돌린 기록은 회원 화면의 '토큰 장부'에 있어요."
      />

      {pgPending ? (
        <Banner
          tone="warn"
          title="결제 연동 전 — 실제 결제 데이터가 아직 없어요"
          action={<Switch checked={demoOn} onChange={(v) => goto({ demo: v ? "1" : null, id: null })} label="시연 데이터 보기" />}
        >
          결제사(PG)를 연결하면 주문·결제·구독·환불이 자동으로 여기 쌓여요. 지금 고객 결제 화면은{" "}
          {payDemo === "on" ? "시연이라 돈이 나가지 않고 여기로 오지 않아요." : "'결제는 곧 열려요' 안내만 보여요."}
        </Banner>
      ) : null}

      {demo ? (
        <Banner tone="demo" title="시연 데이터예요">
          화면을 보여 드리려고 만든 예시예요. 저장되지 않고, 새로 고침해도 똑같이 보여요. 버튼은 눌러도 아무 일도 일어나지 않아요.
        </Banner>
      ) : null}

      <div className="flex flex-col gap-4">
        <SectionTabs label="결제·구독 나누기" tabs={TABS} value={tab} onChange={switchTab} />
        {TABS.map((t) => (
          <div key={t.key} role="tabpanel" aria-label={t.label} hidden={tab !== t.key}>
            {t.key === "payments" ? (
              <PaymentsTab active={tab === "payments"} nav={nav} />
            ) : t.key === "subscriptions" ? (
              <SubscriptionsTab active={tab === "subscriptions"} nav={nav} />
            ) : (
              <RefundsTab active={tab === "refunds"} nav={nav} />
            )}
          </div>
        ))}
      </div>
    </>
  );
}
