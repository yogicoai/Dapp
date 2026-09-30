"use client";

/**
 * 회원 화면 '만들기 기록' 탭 — 옛 관리실 고객 찾기(CustomerView)의 표를 옮겼다(2026-09-30).
 * 사고가 아닌 기록도 보인다(고객이 "지난주 만든 것"을 말할 때). 줄을 누르면 사고 서랍(?job= / ?entry=)이 열리고,
 * 거기서 토큰 환불·책 되살리기·처리 끝을 한다. 결제 칸은 전부 '토큰'이다(실제 결제(원)와 다르다).
 */
import { statusLabel, type CustomerJob } from "@/lib/admin";
import { DataTable, EmptyState, TimeText, type Column } from "@/components/admin/kit";
import { KindChip, SEV_CHIP } from "@/components/admin/cases/case-ui";
import type { CaseOpen } from "@/components/admin/cases/useCaseParam";

export const jobKey = (j: Pick<CustomerJob, "jobId" | "entryId">) => j.jobId ?? `entry-${j.entryId}`;

export function MemberJobs({
  jobs,
  truncated,
  loading,
  selected,
  onOpen,
}: {
  jobs: CustomerJob[];
  truncated: boolean;
  loading: boolean;
  selected: CaseOpen | null;
  onOpen: (o: CaseOpen, el: HTMLElement) => void;
}) {
  const columns: Column<CustomerJob>[] = [
    {
      key: "title",
      header: "동화",
      mobile: "title",
      cell: (j) => (
        <span className="block max-w-[260px] truncate font-bold">{j.title ?? <span className="font-medium text-[#b0b8c1]">(기록 없음)</span>}</span>
      ),
    },
    { key: "status", header: "단계", cell: (j) => statusLabel(j.status) },
    {
      key: "drawn",
      header: "그림",
      align: "right",
      cell: (j) => (j.pageCount ? <span className="tabular-nums">그림 {j.drawn}/{j.pageCount}</span> : "–"),
    },
    {
      key: "paid",
      header: "토큰 결제",
      align: "right",
      cell: (j) =>
        j.payments.length ? (
          <span className="tabular-nums">
            {j.payments.map((p, i) => (
              <span key={i}>
                {i > 0 && " + "}
                <span className={p.refunded ? "font-bold text-[#00976b]" : ""} title={p.refunded ? "환불함" : undefined}>
                  {p.amount ?? "?"}
                  {p.refunded ? <span className="sr-only">(환불함)</span> : null}
                </span>
              </span>
            ))}
            토큰
          </span>
        ) : (
          "–"
        ),
    },
    {
      key: "kinds",
      header: "사고",
      mobile: "badge",
      cell: (j) => (
        <span className="flex flex-wrap gap-1">
          {j.kinds.length ? (
            j.kinds.map((k) => <KindChip key={k} kind={k} />)
          ) : (
            <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${SEV_CHIP.ok}`}>없음</span>
          )}
          {j.resolvedAt && j.kinds.length > 0 ? (
            <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${SEV_CHIP.ok}`}>처리 끝</span>
          ) : null}
        </span>
      ),
    },
    { key: "when", header: "언제", cell: (j) => <span className="text-[#8b95a1]"><TimeText iso={j.createdAt} /></span> },
  ];

  const selectedKey = selected ? (selected.jobId ?? `entry-${selected.entry}`) : null;
  return (
    <DataTable
      caption="만들기 기록"
      columns={columns}
      rows={jobs}
      rowKey={jobKey}
      loading={loading}
      selectedKey={selectedKey}
      onRowClick={(j, el) => onOpen({ jobId: j.jobId, entry: j.jobId ? null : j.entryId }, el)}
      empty={<EmptyState icon="book" title="만들기 기록이 없어요" body="이 회원이 동화를 만들기 시작하면 여기 쌓여요." />}
      footer={truncated ? "최근 100건만 보여요." : "줄을 누르면 자세히 보고 토큰 환불·책 되살리기를 할 수 있어요."}
    />
  );
}
