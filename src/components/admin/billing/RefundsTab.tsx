"use client";

/**
 * 환불 탭 — 결제(원) 환불 요청·결과. 상태 칩 · 주문번호/아이디 찾기 · 표 · 환불 서랍([요청 취소]).
 * 토큰 환불(장부 되돌리기)은 여기 없다 — 회원 화면의 토큰 장부에 있다.
 * 서랍은 목록 줄을 그대로 쓴다. 결제 서랍에서 건너올 때는 주문번호(q)를 넣어 그 결제의 환불만 보이게 한다.
 */
import { useRef } from "react";
import { useSearchParams } from "next/navigation";
import { isUuid } from "@/lib/admin";
import {
  REFUND_CSV,
  REFUND_STATUS_CHIPS,
  billingListPath,
  csvFilename,
  filterBillingRows,
  hasBillingFilter,
  isDemoId,
  readBillingFilter,
  refundStatusMeta,
  statusCounts,
  toCsv,
  type BillingList,
  type PgRefund,
} from "@/lib/admin-billing";
import { Banner, Button, ChipGroup, DataTable, ErrorState, FilterBar, StatusBadge, TimeText, Won, useAdminQuery, type Column } from "@/components/admin/kit";
import { RefundDrawer } from "./RefundDrawer";
import {
  BillingEmpty,
  BillingSearch,
  CsvButton,
  DemoTag,
  KIND_NOUN,
  MemberCell,
  NotInList,
  SchemaNotReady,
  focusLater,
  resultText,
  type BillingNav,
} from "./billing-ui";

const COLUMNS: Column<PgRefund>[] = [
  { key: "at", header: "요청일", cell: (r) => <TimeText iso={r.requestedAt} mode="datetime" />, width: "150px", mobile: "meta" },
  { key: "order", header: "주문번호", cell: (r) => r.orderId ?? "–", mono: true, mobile: "meta" },
  { key: "member", header: "회원", cell: (r) => <MemberCell owner={r.owner} username={r.ownerUsername} demo={r.demo} link={false} />, mobile: "title" },
  { key: "amount", header: "금액", cell: (r) => <Won value={r.amount} />, align: "right", mobile: "meta" },
  {
    key: "reason",
    header: "사유",
    cell: (r) => (
      <span className="block max-w-[260px] truncate" title={r.reason}>
        {r.reason}
      </span>
    ),
    mobile: "hide",
  },
  {
    key: "status",
    header: "상태",
    cell: (r) => (
      <span className="inline-flex flex-wrap gap-1">
        <StatusBadge meta={refundStatusMeta(r.status)} />
        {r.demo ? <DemoTag /> : null}
      </span>
    ),
    mobile: "badge",
  },
  { key: "by", header: "요청자", cell: (r) => r.requestedByUsername ?? "–", mobile: "hide" },
  { key: "done", header: "처리자", cell: (r) => r.processedByUsername ?? (r.processedAt ? "서버" : "–"), mobile: "hide" },
];

export function RefundsTab({ active, nav }: { active: boolean; nav: BillingNav }) {
  const sp = useSearchParams();
  const f = readBillingFilter(sp, "refunds");
  const q = useAdminQuery<BillingList<PgRefund>>(active && !nav.demo ? billingListPath("refunds", f) : null, { keepOnChange: true });
  const rowRef = useRef<HTMLElement | null>(null);

  const demoBase = nav.demo ? filterBillingRows(nav.demo.refunds, { q: f.q }) : null;
  const rows: PgRefund[] = demoBase ? filterBillingRows(demoBase, { status: f.status }) : (q.data?.rows ?? []);
  const counts = demoBase ? statusCounts(demoBase, REFUND_STATUS_CHIPS) : null;
  const truncated = !nav.demo && !!q.data?.truncated;
  const total = nav.demo ? rows.length : (q.data?.total ?? rows.length);
  const filtered = hasBillingFilter(f);
  const reset = () => nav.goto({ status: null, q: null, period: null });
  const notReady = !nav.demo && q.data?.schemaReady === false;

  const drawerId = active && nav.drawerId && (nav.demo ? isDemoId(nav.drawerId) : isUuid(nav.drawerId)) ? nav.drawerId : null;
  const pool = nav.demo ? nav.demo.refunds : (q.data?.rows ?? null);
  const refund = drawerId && pool ? (pool.find((r) => r.id === drawerId) ?? null) : null;
  const listSettled = nav.demo || (!!q.data && !q.loading);
  // 서랍에 줄이 없을 때 보일 것 — 준비 전 · 읽기 실패 · 목록에 없음. 아직 읽는 중이면 null(자리 표시).
  const drawerFallback = notReady ? (
    <SchemaNotReady />
  ) : !nav.demo && q.error && !q.data ? (
    <ErrorState message={q.error} onRetry={q.reload} />
  ) : listSettled && !refund ? (
    <NotInList what={KIND_NOUN.refunds} onReset={reset} />
  ) : null;
  const closeDrawer = () => {
    nav.closeDrawer();
    focusLater(rowRef.current);
  };

  return (
    <div className="flex flex-col gap-4">
      <ChipGroup
        label="환불 상태"
        value={f.status}
        onChange={(v) => nav.goto({ status: v === "all" ? null : v, id: null })}
        options={REFUND_STATUS_CHIPS.map((c) => ({ ...c, count: counts ? counts[c.value] : null }))}
      />
      <FilterBar onReset={filtered ? reset : undefined} resultText={q.loading && !nav.demo && !q.data ? undefined : resultText(rows.length, total, truncated)}>
        <BillingSearch
          key={f.q}
          initial={f.q}
          placeholder="주문번호 또는 아이디"
          label="환불 찾기 — 주문번호 또는 아이디"
          onSubmit={(v) => nav.goto({ q: v || null, id: null })}
        />
        <CsvButton filename={csvFilename("refunds", !!nav.demo, nav.clock)} build={() => toCsv(rows, REFUND_CSV)} disabled={rows.length === 0} />
      </FilterBar>

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
            caption="결제 환불 목록"
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
            empty={<BillingEmpty filtered={filtered} noun="환불 요청" onReset={reset} demo={!!nav.demo} />}
            footer={truncated ? `최근 ${rows.length}건만 보여요 — 상태나 주문번호로 좁혀 보세요.` : undefined}
          />
        </>
      )}

      {drawerId ? (
        <RefundDrawer
          key={drawerId}
          refund={refund}
          nav={nav}
          onClose={closeDrawer}
          onChanged={q.reload}
          notFound={drawerFallback}
        />
      ) : null}
    </div>
  );
}
