"use client";

/**
 * 구독 탭 — 상태 칩(해지 예약 포함) · 아이디 찾기 · 표 · 구독 서랍.
 * 서랍은 목록 줄을 그대로 쓴다(구독 상세 함수는 따로 없다). 결제 서랍에서 건너올 때는 아이디(q)를 같이 넣어
 * 최근 목록 밖의 오래된 구독도 찾아지게 한다.
 */
import { useRef } from "react";
import { useSearchParams } from "next/navigation";
import { isUuid } from "@/lib/admin";
import {
  SUBSCRIPTION_CSV,
  SUBSCRIPTION_STATUS_CHIPS,
  billingListPath,
  csvFilename,
  filterBillingRows,
  formatPeriodRange,
  hasBillingFilter,
  isDemoId,
  planLabel,
  readBillingFilter,
  statusCounts,
  subscriptionStatusMeta,
  toCsv,
  type BillingList,
  type PgSubscription,
} from "@/lib/admin-billing";
import { Banner, Button, ChipGroup, DataTable, ErrorState, FilterBar, StatusBadge, TimeText, useAdminQuery, type Column } from "@/components/admin/kit";
import { SubscriptionDrawer } from "./SubscriptionDrawer";
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

const COLUMNS: Column<PgSubscription>[] = [
  { key: "member", header: "회원", cell: (r) => <MemberCell owner={r.owner} username={r.ownerUsername} demo={r.demo} link={false} />, mobile: "title" },
  { key: "plan", header: "요금제", cell: (r) => planLabel(r.plan), mobile: "meta" },
  {
    key: "status",
    header: "상태",
    cell: (r) => {
      const m = subscriptionStatusMeta(r.status, r.cancelAtPeriodEnd);
      return (
        <span className="inline-flex flex-wrap gap-1">
          <StatusBadge meta={m} />
          {m.extra ? <StatusBadge meta={m.extra} /> : null}
          {r.demo ? <DemoTag /> : null}
        </span>
      );
    },
    mobile: "badge",
  },
  { key: "period", header: "이번 기간", cell: (r) => <span className="tabular-nums">{formatPeriodRange(r.currentPeriodStart, r.currentPeriodEnd)}</span>, mobile: "meta" },
  { key: "next", header: "다음 결제일", cell: (r) => <TimeText iso={r.nextBillingAt} mode="date" />, mobile: "meta" },
  { key: "key", header: "자동결제", cell: (r) => (r.hasBillingKey ? "등록됨" : "–"), mobile: "hide" },
  { key: "created", header: "시작일", cell: (r) => <TimeText iso={r.createdAt} mode="date" />, mobile: "hide" },
];

export function SubscriptionsTab({ active, nav }: { active: boolean; nav: BillingNav }) {
  const sp = useSearchParams();
  const f = readBillingFilter(sp, "subscriptions");
  const q = useAdminQuery<BillingList<PgSubscription>>(active && !nav.demo ? billingListPath("subscriptions", f) : null, { keepOnChange: true });
  const rowRef = useRef<HTMLElement | null>(null);

  const demoBase = nav.demo ? filterBillingRows(nav.demo.subscriptions, { q: f.q }) : null;
  const rows: PgSubscription[] = demoBase ? filterBillingRows(demoBase, { status: f.status }) : (q.data?.rows ?? []);
  const counts = demoBase ? statusCounts(demoBase, SUBSCRIPTION_STATUS_CHIPS) : null;
  const truncated = !nav.demo && !!q.data?.truncated;
  const total = nav.demo ? rows.length : (q.data?.total ?? rows.length);
  const filtered = hasBillingFilter(f);
  const reset = () => nav.goto({ status: null, q: null, period: null });
  const notReady = !nav.demo && q.data?.schemaReady === false;

  const drawerId = active && nav.drawerId && (nav.demo ? isDemoId(nav.drawerId) : isUuid(nav.drawerId)) ? nav.drawerId : null;
  // 시연은 거르기와 상관없이 전체에서 찾는다(건너온 서랍이 늘 열리게). 실제는 지금 읽은 목록에서.
  const pool = nav.demo ? nav.demo.subscriptions : (q.data?.rows ?? null);
  const sub = drawerId && pool ? (pool.find((s) => s.id === drawerId) ?? null) : null;
  const listSettled = nav.demo || (!!q.data && !q.loading);
  // 서랍에 줄이 없을 때 보일 것 — 준비 전 · 읽기 실패 · 목록에 없음. 아직 읽는 중이면 null(자리 표시).
  const drawerFallback = notReady ? (
    <SchemaNotReady />
  ) : !nav.demo && q.error && !q.data ? (
    <ErrorState message={q.error} onRetry={q.reload} />
  ) : listSettled && !sub ? (
    <NotInList what={KIND_NOUN.subscriptions} onReset={reset} />
  ) : null;
  const closeDrawer = () => {
    nav.closeDrawer();
    focusLater(rowRef.current);
  };

  return (
    <div className="flex flex-col gap-4">
      <ChipGroup
        label="구독 상태"
        value={f.status}
        onChange={(v) => nav.goto({ status: v === "all" ? null : v, id: null })}
        options={SUBSCRIPTION_STATUS_CHIPS.map((c) => ({ ...c, count: counts ? counts[c.value] : null }))}
      />
      <FilterBar onReset={filtered ? reset : undefined} resultText={q.loading && !nav.demo && !q.data ? undefined : resultText(rows.length, total, truncated)}>
        <BillingSearch key={f.q} initial={f.q} placeholder="아이디" label="구독 찾기 — 아이디" onSubmit={(v) => nav.goto({ q: v || null, id: null })} />
        <CsvButton
          filename={csvFilename("subscriptions", !!nav.demo, nav.clock)}
          build={() => toCsv(rows, SUBSCRIPTION_CSV)}
          disabled={rows.length === 0}
        />
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
            caption="구독 목록"
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
            empty={<BillingEmpty filtered={filtered} noun="구독" onReset={reset} demo={!!nav.demo} />}
            footer={truncated ? `최근 ${rows.length}건만 보여요 — 상태나 아이디로 좁혀 보세요.` : undefined}
          />
        </>
      )}

      {drawerId ? (
        <SubscriptionDrawer
          key={drawerId}
          sub={sub}
          nav={nav}
          onClose={closeDrawer}
          notFound={drawerFallback}
        />
      ) : null}
    </div>
  );
}
