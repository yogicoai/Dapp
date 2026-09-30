"use client";

/**
 * 결제 환불 한 건 서랍 — 주문번호(→ 결제 서랍) · 회원 · 금액 · 상태 · 사유 전문 · 요청/처리 시각·사람 · 메모 · 실패 사유.
 * 아직 '요청됨'인 실제 줄에만 [요청 취소]가 있다(시연 줄은 꺼 둔다). 목록 줄을 그대로 받는다(따로 읽지 않는다).
 */
import { useState, type ReactNode } from "react";
import { canWithdrawRefund, jumpPatch, refundStatusMeta, type PgRefund } from "@/lib/admin-billing";
import { formatWon } from "@/lib/admin-console";
import { Button, CopyButton, Drawer, Icon, KeyValue, Skeleton, StatusBadge, TimeText } from "@/components/admin/kit";
import { WithdrawRefundDialog } from "./billing-actions";
import { DemoTag, DrawerSection, MemberCell, type BillingNav } from "./billing-ui";

export function RefundDrawer({
  refund,
  nav,
  onClose,
  onChanged,
  notFound,
}: {
  refund: PgRefund | null;
  nav: BillingNav;
  onClose: () => void;
  onChanged: () => void;
  notFound: ReactNode | null;
}) {
  const [asking, setAsking] = useState(false);
  let footer: ReactNode = null;
  if (refund?.demo && refund.status === "requested") {
    footer = (
      <Button tone="secondary" disabled title="시연 데이터라 누를 수 없어요">
        요청 취소
      </Button>
    );
  } else if (refund && canWithdrawRefund(refund)) {
    footer = (
      <Button tone="danger" onClick={() => setAsking(true)}>
        요청 취소
      </Button>
    );
  }

  return (
    <>
      <Drawer
        open
        title="결제 환불 상세"
        subtitle={refund?.orderId ? <span className="font-mono">{refund.orderId}</span> : undefined}
        onClose={onClose}
        busy={asking}
        footer={footer}
      >
        {refund ? <RefundBody refund={refund} nav={nav} /> : (notFound ?? <Skeleton lines={6} />)}
      </Drawer>
      {asking && refund && !refund.demo ? (
        <WithdrawRefundDialog
          refund={refund}
          onClose={() => setAsking(false)}
          onDone={() => {
            setAsking(false);
            onChanged();
          }}
        />
      ) : null}
    </>
  );
}

function RefundBody({ refund, nav }: { refund: PgRefund; nav: BillingNav }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[26px] font-bold tabular-nums tracking-tight text-[#191f28]">{formatWon(refund.amount)}</span>
        <StatusBadge meta={refundStatusMeta(refund.status)} />
        {refund.demo ? <DemoTag /> : null}
      </div>
      <p className="mt-1 text-[13px] font-medium text-[#6b7684]">실제 결제(원)를 돌려주는 요청이에요. 토큰 환불과는 달라요.</p>

      <div className="mt-5">
        <KeyValue
          columns={2}
          items={[
            [
              "주문번호",
              refund.orderId ? (
                <span key="o" className="inline-flex flex-wrap items-center gap-1">
                  <span className="break-all font-mono text-[13px]">{refund.orderId}</span>
                  <CopyButton value={refund.orderId} label="주문번호 복사" />
                </span>
              ) : (
                "–"
              ),
            ],
            [
              "결제",
              <button
                key="p"
                type="button"
                onClick={() => nav.goto(jumpPatch("payments", refund.paymentId))}
                className="inline-flex min-h-8 items-center gap-1 font-bold text-[#1b64da] hover:underline"
              >
                결제 보기
                <Icon name="chevron" size={16} />
              </button>,
            ],
            ["회원", <MemberCell key="m" owner={refund.owner} username={refund.ownerUsername} demo={refund.demo} />],
            ["요청한 사람", refund.requestedByUsername ?? "–"],
            ["요청 시각", <TimeText key="rq" iso={refund.requestedAt} mode="datetime" />],
            ["처리한 사람", refund.processedByUsername ?? (refund.processedAt ? "서버(결제사)" : "–")],
            ["처리 시각", <TimeText key="pr" iso={refund.processedAt} mode="datetime" />],
          ]}
        />
      </div>

      <DrawerSection title="사유">
        <p className="whitespace-pre-wrap break-words rounded-xl bg-[#f9fafb] px-3 py-2.5 text-sm leading-relaxed text-[#191f28]">{refund.reason}</p>
      </DrawerSection>
      {refund.processedNote ? (
        <DrawerSection title="처리 메모">
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[#4e5968]">{refund.processedNote}</p>
        </DrawerSection>
      ) : null}
      {refund.failureMessage ? (
        <DrawerSection title="실패 사유">
          <p className="rounded-xl bg-[#ffeff0] px-3 py-2.5 text-[13px] font-medium leading-relaxed text-[#b4232f]">{refund.failureMessage}</p>
        </DrawerSection>
      ) : null}
      {refund.status === "requested" ? (
        <p className="mt-6 rounded-xl bg-[#fff4e0] px-3 py-2.5 text-[13px] font-medium leading-relaxed text-[#8a5a00]">
          결제사 취소는 아직 연결되지 않아 요청만 기록돼 있어요. 결제 연동 뒤 서버가 취소하고 결과를 적어요.
        </p>
      ) : null}
    </>
  );
}
