"use client";

/**
 * 회원 화면 '실제 결제' 탭 — 이 회원이 실제 돈(원)을 낸 기록. 토큰 장부와 다르다.
 *
 * 결제·구독 화면의 목록 경로(GET /api/admin/billing/payments?owner=)를 그대로 부른다 — 결제 표를 읽는 길은
 * 그 화면 하나로 둔다. 결제사를 붙이기 전이라 지금은 늘 비어 있다: 경로가 아직 없거나(404),
 * 표가 아직 없거나(schemaReady:false), 0줄이면 모두 '결제 연동 전이에요'로 조용히 보여 준다(빨간 오류로 겁주지 않는다).
 * 줄을 누르면 결제·구독 화면의 그 결제 서랍(?id=)으로 간다.
 * 탭을 처음 열 때만 읽는다 — 회원 화면을 열 때마다 결제 목록 함수를 부르지 않게.
 */
import { useRouter } from "next/navigation";
import { memberPaymentsView, paymentStatusBrief, productLabel, type MemberPaymentRow, type MemberPaymentsResponse } from "@/lib/admin-members";
import {
  Badge,
  DataTable,
  EmptyState,
  ErrorState,
  Skeleton,
  TimeText,
  useAdminQuery,
  Won,
  type Column,
} from "@/components/admin/kit";

export function MemberPayments({ memberId, active }: { memberId: string; active: boolean }) {
  const router = useRouter();
  const q = useAdminQuery<MemberPaymentsResponse>(active ? `/api/admin/billing/payments?owner=${memberId}` : null);
  const view = memberPaymentsView(q.status, q.data);

  if (!active) return null;
  if (view === "loading" || (q.loading && !q.data)) {
    return (
      <div className="rounded-2xl bg-white p-5">
        <Skeleton lines={3} />
      </div>
    );
  }
  if (view === "error") return <ErrorState message={q.error ?? "실제 결제 기록을 읽지 못했어요."} onRetry={q.reload} />;
  if (view === "none") {
    return (
      <EmptyState
        icon="card"
        title="실제 결제 기록이 없어요"
        body={
          q.data?.schemaReady === false || q.status === 404
            ? "결제 연동 전이에요. 결제사를 연결하면 이 회원의 주문·결제·환불이 여기 보여요."
            : "이 회원은 아직 돈(원)을 낸 적이 없어요. 토큰을 쓴 기록은 '토큰 장부' 탭에 있어요."
        }
      />
    );
  }

  const columns: Column<MemberPaymentRow>[] = [
    { key: "at", header: "주문일시", cell: (p) => <TimeText iso={p.requestedAt || p.createdAt} mode="datetime" /> },
    { key: "order", header: "주문번호", mono: true, cell: (p) => p.orderId },
    { key: "product", header: "상품", mobile: "title", cell: (p) => p.orderName ?? productLabel(p.product) },
    { key: "amount", header: "금액", align: "right", cell: (p) => <Won value={p.amount} /> },
    {
      key: "status",
      header: "상태",
      mobile: "badge",
      cell: (p) => {
        const m = paymentStatusBrief(p.status);
        return <Badge tone={m.tone}>{m.label}</Badge>;
      },
    },
    { key: "refunded", header: "환불액", align: "right", cell: (p) => <Won value={p.refundedAmount} muted={!p.refundedAmount} /> },
  ];
  return (
    <DataTable
      caption="실제 결제 기록"
      columns={columns}
      rows={q.data?.rows ?? []}
      rowKey={(p) => p.id}
      onRowClick={(p) => router.push(`/admin/billing?id=${encodeURIComponent(p.id)}`)}
      empty={null}
      footer={q.data?.truncated ? `최근 ${q.data.rows.length}건만 보여요.` : "줄을 누르면 결제·구독 화면에서 자세히 봐요."}
    />
  );
}
