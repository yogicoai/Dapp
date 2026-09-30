"use client";

/**
 * 결제 내역 탭 — 상태 칩 · 기간 · 주문번호/아이디 찾기 · '이 목록 기준' 합계 · 표 · 결제 서랍.
 *
 * 거르기는 주소(status · period · q)에 둔다 — 새로 고침·링크로 같은 화면이 다시 열리게.
 * 실제 목록은 GET /api/admin/billing/payments, 시연이면 시연 줄을 같은 규칙(filterBillingRows)으로 화면에서 거른다.
 * 이 탭이 꺼져 있으면 서버를 부르지 않는다(탭은 숨길 뿐 살려 둔다 — 다시 켜면 앞 목록을 보여 주며 새로 읽는다).
 */
import { useRef } from "react";
import { useSearchParams } from "next/navigation";
import { isUuid } from "@/lib/admin";
import {
  PAYMENT_CSV,
  PAYMENT_STATUS_CHIPS,
  billingListPath,
  csvFilename,
  filterBillingRows,
  hasBillingFilter,
  isDemoId,
  paymentStatusMeta,
  planLabel,
  readBillingFilter,
  statusCounts,
  summarizePayments,
  toCsv,
  type BillingList,
  type PgPayment,
} from "@/lib/admin-billing";
import { formatWon, kstRange } from "@/lib/admin-console";
import {
  Banner,
  Button,
  ChipGroup,
  DataTable,
  ErrorState,
  FilterBar,
  PeriodSelect,
  StatusBadge,
  TimeText,
  Won,
  useAdminQuery,
  type Column,
} from "@/components/admin/kit";
import { PaymentDrawer } from "./PaymentDrawer";
import {
  BillingEmpty,
  BillingSearch,
  CsvButton,
  DemoTag,
  MemberCell,
  SchemaNotReady,
  focusLater,
  resultText,
  type BillingNav,
} from "./billing-ui";

const COLUMNS: Column<PgPayment>[] = [
  { key: "at", header: "주문일시", cell: (r) => <TimeText iso={r.createdAt} mode="datetime" />, width: "150px", mobile: "meta" },
  { key: "order", header: "주문번호", cell: (r) => r.orderId, mono: true, mobile: "meta" },
  { key: "member", header: "회원", cell: (r) => <MemberCell owner={r.owner} username={r.ownerUsername} demo={r.demo} link={false} />, mobile: "title" },
  { key: "product", header: "상품", cell: (r) => planLabel(r.product), mobile: "meta" },
  { key: "amount", header: "금액", cell: (r) => <Won value={r.amount} />, align: "right", mobile: "meta" },
  { key: "method", header: "결제수단", cell: (r) => r.method ?? "–", mobile: "hide" },
  {
    key: "status",
    header: "상태",
    cell: (r) => (
      <span className="inline-flex flex-wrap gap-1">
        <StatusBadge meta={paymentStatusMeta(r.status)} />
        {r.demo ? <DemoTag /> : null}
      </span>
    ),
    mobile: "badge",
  },
  { key: "refunded", header: "환불액", cell: (r) => <Won value={r.refundedAmount} muted={r.refundedAmount === 0} />, align: "right", mobile: "hide" },
];

export function PaymentsTab({ active, nav }: { active: boolean; nav: BillingNav }) {
  const sp = useSearchParams();
  const f = readBillingFilter(sp, "payments");
  const q = useAdminQuery<BillingList<PgPayment>>(active && !nav.demo ? billingListPath("payments", f) : null, { keepOnChange: true });
  const rowRef = useRef<HTMLElement | null>(null);

  // 시연: 상태 말고 다른 거르기를 먼저 걸어 칩 옆 숫자를 센다(실제 목록은 상태별 수를 모른다).
  const range = kstRange(f.period, nav.clock);
  const demoBase = nav.demo ? filterBillingRows(nav.demo.payments, { q: f.q, from: range.from, to: range.to }) : null;
  const rows: PgPayment[] = demoBase ? filterBillingRows(demoBase, { status: f.status }) : (q.data?.rows ?? []);
  const counts = demoBase ? statusCounts(demoBase, PAYMENT_STATUS_CHIPS) : null;
  const truncated = !nav.demo && !!q.data?.truncated;
  const total = nav.demo ? rows.length : (q.data?.total ?? rows.length);
  const filtered = hasBillingFilter(f);
  const reset = () => nav.goto({ status: null, q: null, period: null, id: null });

  const drawerId = active && nav.drawerId && (nav.demo ? isDemoId(nav.drawerId) : isUuid(nav.drawerId)) ? nav.drawerId : null;
  const closeDrawer = () => {
    nav.closeDrawer();
    focusLater(rowRef.current);
  };

  const notReady = !nav.demo && q.data?.schemaReady === false;
  const summary = summarizePayments(rows);

  return (
    <div className="flex flex-col gap-4">
      <ChipGroup
        label="결제 상태"
        value={f.status}
        onChange={(v) => nav.goto({ status: v === "all" ? null : v, id: null })}
        options={PAYMENT_STATUS_CHIPS.map((c) => ({ ...c, count: counts ? counts[c.value] : null }))}
      />
      <FilterBar onReset={filtered ? reset : undefined} resultText={q.loading && !nav.demo && !q.data ? undefined : resultText(rows.length, total, truncated)}>
        <PeriodSelect value={f.period} onChange={(v) => nav.goto({ period: v === "all" ? null : v, id: null })} />
        <BillingSearch
          key={f.q}
          initial={f.q}
          placeholder="주문번호 또는 아이디"
          label="결제 찾기 — 주문번호 또는 아이디"
          onSubmit={(v) => nav.goto({ q: v || null, id: null })}
        />
        <CsvButton
          filename={csvFilename("payments", !!nav.demo, nav.clock)}
          build={() => toCsv(rows, PAYMENT_CSV)}
          disabled={rows.length === 0}
        />
      </FilterBar>

      {rows.length > 0 && !notReady ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-white px-4 py-3 text-[13px] font-medium text-[#4e5968]">
          <span className="rounded-md bg-[#f2f4f6] px-1.5 py-0.5 text-[12px] font-bold text-[#6b7684]">이 목록 기준</span>
          <span>
            결제 완료 <b className="tabular-nums text-[#191f28]">{summary.paidCount}</b>건 · <b className="tabular-nums text-[#191f28]">{formatWon(summary.paidWon)}</b>
          </span>
          <span>
            환불 <b className="tabular-nums text-[#c77700]">{formatWon(summary.refundedWon)}</b>
          </span>
          <span>
            순매출 <b className="tabular-nums text-[#191f28]">{formatWon(summary.netWon)}</b>
          </span>
          {truncated ? <span className="text-[#8b95a1]">(보이는 {rows.length}건만 더했어요)</span> : null}
        </p>
      ) : null}

      {notReady ? (
        <SchemaNotReady />
      ) : q.error && !q.data && !nav.demo ? (
        <ErrorState message={q.error} onRetry={q.reload} />
      ) : (
        <>
          {q.error && !nav.demo ? (
            <Banner
              tone="danger"
              title="다시 읽지 못했어요 — 마지막으로 읽은 목록이에요."
              action={
                <Button size="sm" onClick={q.reload}>
                  다시 시도
                </Button>
              }
            >
              {q.error}
            </Banner>
          ) : null}
          <DataTable
            caption="실제 결제 목록"
            columns={COLUMNS}
            rows={rows}
            rowKey={(r) => r.id}
            loading={!nav.demo && q.loading}
            selectedKey={drawerId}
            rowTone={(r) => (r.demo ? "demo" : null)}
            onRowClick={(r, el) => {
              rowRef.current = el;
              nav.openDrawer(r.id);
            }}
            empty={<BillingEmpty filtered={filtered} noun="결제" onReset={reset} demo={!!nav.demo} />}
            footer={truncated ? `최근 ${rows.length}건만 보여요 — 기간·상태로 좁혀 보세요.` : undefined}
          />
        </>
      )}

      {drawerId ? <PaymentDrawer key={drawerId} id={drawerId} nav={nav} onClose={closeDrawer} onChanged={q.reload} /> : null}
    </div>
  );
}
