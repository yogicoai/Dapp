"use client";

/**
 * 가격정책 확인 데이터 (/admin/report, 메뉴 '회사') — 사장님 2026-10-02 "이거 들어가서 봐 정도로 해서 보고할 거라".
 * 가격을 정하는 방법 · 동화 1권에 드는 돈 · 호스팅 고정비 · 결제 때 떼는 돈 · 요금제별로 남는 돈을 한 화면에.
 *
 * ⚠️ 이 화면 코드에는 숫자가 없다 — 내용은 서버(/api/admin/report, 관리자만)가 만들어 보낸다. 누구나 받을 수 있는
 *    자바스크립트 묶음에 내부 비용 숫자가 실리지 않게(관리실 원문 검사가 이 낱말들을 막는다). 보고가 끝나면 메뉴·화면·서버 경로를 함께 지운다.
 */
import type { AdminReport, ReportFigure, ReportTable } from "@/lib/admin-report";
import { Banner, Card, CardTitle, ErrorState, PageHeader, PageSkeleton, useAdminQuery } from "@/components/admin/kit";

export function ReportPage() {
  const q = useAdminQuery<AdminReport>("/api/admin/report");
  const r = q.data;
  return (
    <>
      <PageHeader title="가격정책 확인 데이터" description="가격을 정하는 방법과 실제로 나가는 돈(동화 1권 · 호스팅 · 결제)을 확인하는 곳이에요." />
      {r ? (
        <>
          <Banner tone="danger" title="지울 화면이에요">
            {r.banner.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </Banner>
          <p className="break-keep text-[12px] font-medium leading-relaxed text-[#8b95a1]">{r.basis}</p>
          {r.sections.map((s) => (
            <Card key={s.id}>
              <CardTitle>{s.title}</CardTitle>
              {s.lead ? <p className="mb-4 break-keep text-[13px] font-medium leading-relaxed text-[#4e5968]">{s.lead}</p> : null}
              <div className="flex flex-col gap-5">
                {(s.tables ?? []).map((t) => (
                  <ReportTableView key={t.caption} table={t} />
                ))}
                {(s.figures ?? []).map((f) => (
                  <FigureView key={f.src} figure={f} />
                ))}
              </div>
              {s.points?.length ? (
                <ul className="mt-4 flex list-disc flex-col gap-1.5 pl-5">
                  {s.points.map((p) => (
                    <li key={p} className="break-keep text-[13px] font-medium leading-relaxed text-[#4e5968]">
                      {p}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
          ))}
        </>
      ) : q.error ? (
        <ErrorState message={q.error} onRetry={q.reload} />
      ) : (
        <PageSkeleton />
      )}
    </>
  );
}

/** 고객 화면 사진 한 장 + 번호 설명(사진 위 빨간 번호와 같은 순서). 사진을 누르면 새 창에서 크게 본다. */
function FigureView({ figure }: { figure: ReportFigure }) {
  return (
    <figure className="flex flex-col gap-4 rounded-2xl bg-[#f9fafb] p-4 sm:flex-row sm:items-start">
      <a
        href={figure.src}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${figure.title} — 크게 보기`}
        className="block w-full max-w-[320px] shrink-0 self-center rounded-xl focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#3182f6] sm:w-[300px] sm:self-start"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- 관리실 안 고객 화면 사진(public/admin-report) — 이미지 최적화 경로를 거치지 않는다 */}
        <img src={figure.src} alt={figure.title} loading="lazy" className="w-full rounded-xl ring-1 ring-[#e5e8eb]" />
      </a>
      <figcaption className="flex min-w-0 flex-1 flex-col gap-2.5">
        <span className="break-keep text-[14px] font-bold text-[#191f28]">{figure.title}</span>
        <ol className="flex flex-col gap-2">
          {figure.legend.map((line, i) => (
            <li key={i} className="flex gap-2.5 break-keep text-[13px] font-medium leading-relaxed text-[#4e5968]">
              <span
                aria-hidden
                className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#e8345a] text-[11px] font-bold text-white"
              >
                {i + 1}
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ol>
        <span className="text-[12px] font-medium text-[#8b95a1]">그림을 누르면 크게 볼 수 있어요.</span>
      </figcaption>
    </figure>
  );
}

function ReportTableView({ table }: { table: ReportTable }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-xl ring-1 ring-[#eef0f3]">
        <table className="w-full min-w-[34rem] border-collapse text-left text-[13px]">
          <caption className="sr-only">{table.caption}</caption>
          <thead>
            <tr className="bg-[#f9fafb]">
              {table.head.map((h) => (
                <th key={h} scope="col" className="whitespace-nowrap px-3.5 py-2.5 text-[12px] font-bold text-[#6b7684]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={i} className="border-t border-[#f2f4f6] align-top">
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className={`break-keep px-3.5 py-2.5 font-medium leading-relaxed ${
                      j === 0 ? "font-bold text-[#191f28]" : "text-[#4e5968]"
                    } ${j > 0 && /^[−\d월연약]/.test(cell) ? "tabular-nums" : ""}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {table.foot ? (
            <tfoot>
              <tr className="border-t-2 border-[#e5e8eb] bg-[#f9fafb]">
                {table.foot.map((cell, j) => (
                  <td key={j} className="px-3.5 py-2.5 font-bold tabular-nums text-[#191f28]">
                    {cell}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      {table.note ? <p className="break-keep text-[12px] font-medium leading-relaxed text-[#8b95a1]">{table.note}</p> : null}
    </div>
  );
}
