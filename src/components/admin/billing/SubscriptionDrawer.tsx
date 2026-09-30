"use client";

/**
 * 구독 한 건 서랍 — 요금제 · 상태(+해지 예약) · 이번 기간 · 다음 결제일 · 자동결제 등록 여부 + '이 구독의 결제'.
 *
 * 구독은 따로 읽는 상세 함수가 없다 — 목록 줄을 그대로 받는다(목록 함수가 필요한 칸을 모두 준다).
 * '이 구독의 결제'는 실제 줄이면 GET …/payments?subscription=<id>(DB 함수의 p_subscription),
 * 시연 줄이면 시연 결제를 화면에서 거른다. 결제 줄을 누르면 결제 탭의 그 결제 서랍으로 건너간다.
 * 자동결제 키 이름은 관리실에도 오지 않는다 — '등록됨'만 보여 준다.
 */
import type { ReactNode } from "react";
import {
  billingListPath,
  filterBillingRows,
  formatPeriodRange,
  jumpPatch,
  paymentStatusMeta,
  planLabel,
  subscriptionStatusMeta,
  type BillingList,
  type PgPayment,
  type PgSubscription,
} from "@/lib/admin-billing";
import { formatWon } from "@/lib/admin-console";
import { Drawer, ErrorState, KeyValue, Skeleton, StatusBadge, TimeText, useAdminQuery } from "@/components/admin/kit";
import { DemoTag, DrawerSection, MemberCell, type BillingNav } from "./billing-ui";

export function SubscriptionDrawer({
  sub,
  nav,
  onClose,
  notFound,
}: {
  sub: PgSubscription | null;
  nav: BillingNav;
  onClose: () => void;
  /** 목록을 다 읽었는데 이 id 가 없을 때 보여 줄 것. 아직 읽는 중이면 null. */
  notFound: ReactNode | null;
}) {
  return (
    <Drawer open title="구독 상세" subtitle={sub ? planLabel(sub.plan) : undefined} onClose={onClose}>
      {sub ? <SubscriptionBody sub={sub} nav={nav} /> : (notFound ?? <Skeleton lines={6} />)}
    </Drawer>
  );
}

function SubscriptionBody({ sub, nav }: { sub: PgSubscription; nav: BillingNav }) {
  const meta = subscriptionStatusMeta(sub.status, sub.cancelAtPeriodEnd);
  const demoPays = nav.demo ? filterBillingRows(nav.demo.payments, { subscription: sub.id }) : null;
  const q = useAdminQuery<BillingList<PgPayment>>(
    nav.demo ? null : billingListPath("payments", { status: "all", q: "", period: "all" }, { subscription: sub.id }),
  );
  const pays: PgPayment[] | null = demoPays ?? q.data?.rows ?? null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[20px] font-bold text-[#191f28]">{planLabel(sub.plan)}</span>
        <StatusBadge meta={meta} />
        {meta.extra ? <StatusBadge meta={meta.extra} /> : null}
        {sub.demo ? <DemoTag /> : null}
      </div>
      <div className="mt-5">
        <KeyValue
          columns={2}
          items={[
            ["회원", <MemberCell key="m" owner={sub.owner} username={sub.ownerUsername} demo={sub.demo} />],
            ["자동결제", sub.hasBillingKey ? "등록됨" : "없음"],
            ["이번 기간", formatPeriodRange(sub.currentPeriodStart, sub.currentPeriodEnd)],
            ["다음 결제일", sub.cancelAtPeriodEnd && !sub.nextBillingAt ? "없음(기간 끝에 해지)" : <TimeText key="n" iso={sub.nextBillingAt} mode="date" />],
            ["기간 시작", <TimeText key="ps" iso={sub.currentPeriodStart} mode="datetime" />],
            ["기간 끝", <TimeText key="pe" iso={sub.currentPeriodEnd} mode="datetime" />],
            ["해지한 시각", <TimeText key="c" iso={sub.cancelledAt} mode="datetime" />],
            ["시작일", <TimeText key="cr" iso={sub.createdAt} mode="datetime" />],
          ]}
        />
      </div>

      <DrawerSection title="이 구독의 결제" aside={pays ? <span className="text-[12px] font-medium text-[#8b95a1]">{pays.length}건</span> : null}>
        {!pays && q.error ? (
          <ErrorState message={q.error} onRetry={q.reload} />
        ) : !pays ? (
          <Skeleton lines={3} />
        ) : q.data && q.data.schemaReady === false ? (
          <p className="text-[13px] font-medium text-[#8b95a1]">데이터베이스 준비 전이에요.</p>
        ) : pays.length === 0 ? (
          <p className="text-[13px] font-medium text-[#8b95a1]">이 구독으로 난 결제가 아직 없어요.</p>
        ) : (
          <ul className="overflow-hidden rounded-xl border border-[#e5e8eb]">
            {pays.map((p) => (
              <li key={p.id} className="border-t border-[#e5e8eb] first:border-t-0">
                <button
                  type="button"
                  onClick={() => nav.goto(jumpPatch("payments", p.id))}
                  className="flex min-h-11 w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-[#f9fafb]"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-2">
                      <span className="font-bold tabular-nums">{formatWon(p.amount)}</span>
                      <StatusBadge meta={paymentStatusMeta(p.status)} />
                    </span>
                    <span className="truncate font-mono text-[12px] text-[#8b95a1]">{p.orderId}</span>
                  </span>
                  <span className="shrink-0 text-[12px] text-[#8b95a1]">
                    <TimeText iso={p.createdAt} mode="date" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DrawerSection>
    </>
  );
}
