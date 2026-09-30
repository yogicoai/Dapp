"use client";

/**
 * 결제 한 건 서랍(560px, 폰에서는 전체 화면) — 주문번호 · 금액 · 환불 가능액 · 결제 키 · 시각 · 회원 · 구독 ·
 * 영수증 · 실패 사유 · 환불 목록 · 결제사 원문, 그리고 [환불 요청 기록].
 *
 * 실제 줄은 GET /api/admin/billing/payment 로 읽는다(결제 키·원문은 목록에 없고 여기서만 온다).
 * 시연 줄은 시연 모듈의 상세를 그대로 쓴다 — 서버를 부르지 않고, 단추는 꺼 둔다.
 * 결제사 원문은 <pre> 안의 글자로만 넣는다(HTML 로 넣지 않는다). 영수증은 https 주소일 때만 링크.
 */
import { useState } from "react";
import {
  canRequestRefund,
  isSafeReceiptUrl,
  jumpPatch,
  maskKey,
  paymentStatusMeta,
  planLabel,
  rawPreview,
  refundStatusMeta,
  refundableAmount,
  type PaymentDetailResponse,
  type PgPaymentDetail,
} from "@/lib/admin-billing";
import { formatWon } from "@/lib/admin-console";
import {
  Button,
  CopyButton,
  Drawer,
  ErrorState,
  Icon,
  KeyValue,
  Skeleton,
  StatusBadge,
  TimeText,
  Won,
  useAdminQuery,
} from "@/components/admin/kit";
import { RefundRequestDialog } from "./billing-actions";
import { DemoTag, DrawerSection, MemberCell, SchemaNotReady, type BillingNav } from "./billing-ui";

export function PaymentDrawer({
  id,
  nav,
  onClose,
  onChanged,
}: {
  id: string;
  nav: BillingNav;
  onClose: () => void;
  /** 환불 요청을 적은 뒤 — 부른 쪽이 목록을 다시 읽는다. */
  onChanged: () => void;
}) {
  const demoDetail = nav.demo ? (nav.demo.payments.find((p) => p.id === id) ?? null) : null;
  const q = useAdminQuery<PaymentDetailResponse>(nav.demo ? null : `/api/admin/billing/payment?id=${encodeURIComponent(id)}`);
  const [asking, setAsking] = useState(false);

  const detail: PgPaymentDetail | null = nav.demo ? demoDetail : (q.data?.payment ?? null);
  const notReady = !nav.demo && q.data?.schemaReady === false;
  const allowRefund = detail ? canRequestRefund(detail, detail.refunds) : false;

  let footer = null;
  if (detail?.demo) {
    footer = (
      <Button tone="secondary" disabled title="시연 데이터라 누를 수 없어요">
        환불 요청 기록
      </Button>
    );
  } else if (allowRefund) {
    footer = (
      <Button tone="primary" onClick={() => setAsking(true)}>
        환불 요청 기록
      </Button>
    );
  }

  return (
    <>
      <Drawer
        open
        width={560}
        title="결제 상세"
        subtitle={detail ? <span className="font-mono">{detail.orderId}</span> : undefined}
        onClose={onClose}
        busy={asking}
        footer={footer}
      >
        {nav.demo && !detail ? (
          <p className="text-sm text-[#6b7684]">이 시연 결제를 찾지 못했어요.</p>
        ) : notReady ? (
          <SchemaNotReady />
        ) : !detail && q.error ? (
          <ErrorState message={q.error} onRetry={q.status === 404 ? undefined : q.reload} />
        ) : !detail ? (
          <Skeleton lines={8} />
        ) : (
          <PaymentBody detail={detail} nav={nav} />
        )}
      </Drawer>
      {asking && detail && !detail.demo ? (
        <RefundRequestDialog
          payment={detail}
          onClose={() => setAsking(false)}
          onDone={() => {
            setAsking(false);
            q.reload();
            onChanged();
          }}
        />
      ) : null}
    </>
  );
}

function PaymentBody({ detail, nav }: { detail: PgPaymentDetail; nav: BillingNav }) {
  const meta = paymentStatusMeta(detail.status);
  const left = refundableAmount(detail, detail.refunds);
  const pending = detail.refunds.filter((r) => r.status === "requested").reduce((s, r) => s + r.amount, 0);
  const receipt = isSafeReceiptUrl(detail.receiptUrl) ? detail.receiptUrl : null;
  const raw = rawPreview(detail.raw);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[26px] font-bold tabular-nums tracking-tight text-[#191f28]">{formatWon(detail.amount)}</span>
        <StatusBadge meta={meta} />
        {detail.demo ? <DemoTag /> : null}
      </div>
      <p className="mt-1 text-[13px] font-medium text-[#6b7684]">
        {planLabel(detail.product)}
        {detail.orderName && detail.orderName !== planLabel(detail.product) ? ` · ${detail.orderName}` : ""}
        {detail.currency !== "KRW" ? ` · ${detail.currency}` : ""}
      </p>

      <div className="mt-5">
        <KeyValue
          columns={2}
          items={[
            [
              "주문번호",
              <span key="o" className="inline-flex flex-wrap items-center gap-1">
                <span className="break-all font-mono text-[13px]">{detail.orderId}</span>
                <CopyButton value={detail.orderId} label="주문번호 복사" />
              </span>,
            ],
            ["회원", <MemberCell key="m" owner={detail.owner} username={detail.ownerUsername} demo={detail.demo} />],
            ["환불된 금액", <Won key="r" value={detail.refundedAmount} muted={detail.refundedAmount === 0} />],
            [
              "남은 환불 가능액",
              <span key="l">
                <Won value={left} muted={left === 0} />
                {pending > 0 ? <span className="block text-[12px] text-[#8b95a1]">처리 기다리는 요청 {formatWon(pending)} 뺀 값</span> : null}
              </span>,
            ],
            ["결제수단", detail.method ?? "–"],
            ["결제사", detail.pg ? <span key="pg" className="font-mono text-[13px]">{detail.pg}</span> : "–"],
            [
              "결제 키",
              detail.pgPaymentKey ? (
                <span key="k" className="inline-flex flex-wrap items-center gap-1">
                  <span className="font-mono text-[13px]">{maskKey(detail.pgPaymentKey)}</span>
                  <CopyButton value={detail.pgPaymentKey} label="결제 키 복사" />
                </span>
              ) : (
                "–"
              ),
            ],
            [
              "구독",
              detail.subscriptionId ? (
                <button
                  key="s"
                  type="button"
                  onClick={() => nav.goto(jumpPatch("subscriptions", detail.subscriptionId!, detail.ownerUsername))}
                  className="inline-flex min-h-8 items-center gap-1 font-bold text-[#1b64da] hover:underline"
                >
                  {detail.subscription ? planLabel(detail.subscription.plan) : "구독 보기"}
                  <Icon name="chevron" size={16} />
                </button>
              ) : (
                "–"
              ),
            ],
            ["주문한 시각", <TimeText key="rq" iso={detail.requestedAt} mode="datetime" />],
            ["승인 시각", <TimeText key="ap" iso={detail.approvedAt} mode="datetime" />],
            ["취소 시각", <TimeText key="cn" iso={detail.cancelledAt} mode="datetime" />],
            [
              "영수증",
              receipt ? (
                <a key="rc" href={receipt} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold text-[#1b64da] hover:underline">
                  영수증 열기
                  <Icon name="external" size={16} />
                </a>
              ) : (
                "–"
              ),
            ],
          ]}
        />
      </div>

      {detail.failureCode || detail.failureMessage ? (
        <DrawerSection title="실패 사유">
          <p className="rounded-xl bg-[#ffeff0] px-3 py-2.5 text-[13px] font-medium leading-relaxed text-[#b4232f]">
            {detail.failureCode ? <span className="mr-1.5 font-mono">{detail.failureCode}</span> : null}
            {detail.failureMessage ?? ""}
          </p>
        </DrawerSection>
      ) : null}

      <DrawerSection title="환불 목록" aside={<span className="text-[12px] font-medium text-[#8b95a1]">{detail.refunds.length}건</span>}>
        {detail.refunds.length === 0 ? (
          <p className="text-[13px] font-medium text-[#8b95a1]">이 결제에는 환불 요청이 없어요.</p>
        ) : (
          <ul className="overflow-hidden rounded-xl border border-[#e5e8eb]">
            {detail.refunds.map((r) => (
              <li key={r.id} className="border-t border-[#e5e8eb] first:border-t-0">
                <button
                  type="button"
                  onClick={() => nav.goto(jumpPatch("refunds", r.id, detail.orderId))}
                  className="flex min-h-11 w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-[#f9fafb]"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-2">
                      <span className="font-bold tabular-nums">{formatWon(r.amount)}</span>
                      <StatusBadge meta={refundStatusMeta(r.status)} />
                    </span>
                    <span className="truncate text-[12px] font-medium text-[#8b95a1]">{r.reason}</span>
                  </span>
                  <span className="shrink-0 text-[12px] text-[#8b95a1]">
                    <TimeText iso={r.requestedAt} mode="date" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DrawerSection>

      <DrawerSection title="결제사 원문">
        {raw ? (
          <details className="rounded-xl border border-[#e5e8eb] bg-[#f9fafb]">
            <summary className="min-h-11 cursor-pointer px-3 py-2.5 text-[13px] font-bold text-[#4e5968]">펼쳐 보기</summary>
            <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap break-all border-t border-[#e5e8eb] px-3 py-2.5 font-mono text-[12px] leading-relaxed text-[#4e5968]">
              {raw}
            </pre>
          </details>
        ) : (
          <p className="text-[13px] font-medium text-[#8b95a1]">받은 원문이 없어요.</p>
        )}
      </DrawerSection>
    </>
  );
}
