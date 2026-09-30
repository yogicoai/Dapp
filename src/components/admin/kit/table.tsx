"use client";

/**
 * 표 — 넓은 화면(768px 이상)은 <table>, 폰은 카드 목록으로 같은 줄을 보여 준다.
 *
 * 왜 둘인가: 관리 표는 칸이 7~8개라 폰 폭(360px)에 넣으면 페이지가 옆으로 밀린다(사장님이 폰으로도 본다).
 * 폰에서는 칸마다 역할(mobile)을 정해 '제목 · 배지 / 설명 줄'로 접는다. 숨길 칸은 'hide'.
 * 줄을 누르면(또는 Enter·Space) onRowClick — 누른 줄을 넘겨 주므로 서랍을 닫을 때 그 줄로 초점을 돌린다.
 */
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

export type Column<R> = {
  key: string;
  header: string;
  cell: (r: R) => ReactNode;
  align?: "left" | "right";
  width?: string;
  mono?: boolean;
  /** 폰 카드에서의 자리. 정하지 않으면 설명 줄(meta)에 들어간다. */
  mobile?: "title" | "meta" | "badge" | "hide";
};

const ROW_TONE = {
  demo: "shadow-[inset_4px_0_0_0_#ffc266]",
  muted: "opacity-60",
} as const;

export function DataTable<R>({
  columns,
  rows,
  rowKey,
  onRowClick,
  selectedKey,
  loading,
  empty,
  caption,
  footer,
  rowTone,
}: {
  columns: Column<R>[];
  rows: R[];
  rowKey: (r: R) => string;
  onRowClick?: (r: R, el: HTMLElement) => void;
  selectedKey?: string | null;
  loading?: boolean;
  empty: ReactNode;
  caption: string;
  footer?: ReactNode;
  rowTone?: (r: R) => "demo" | "muted" | null;
}) {
  if (!loading && rows.length === 0) return <>{empty}</>;

  const activate = (r: R) => (e: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => {
    if (!onRowClick) return;
    if ("key" in e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
    }
    onRowClick(r, e.currentTarget);
  };

  const titleCols = columns.filter((c) => c.mobile === "title");
  const badgeCols = columns.filter((c) => c.mobile === "badge");
  const metaCols = columns.filter((c) => (c.mobile ?? "meta") === "meta");
  const skeletonRows = loading && rows.length === 0 ? 5 : 0;

  return (
    <div className="overflow-hidden rounded-2xl bg-white">
      {/* 넓은 화면: 표 */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="bg-[#f9fafb]">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  style={c.width ? { width: c.width } : undefined}
                  className={`h-10 whitespace-nowrap px-4 text-[12.5px] font-semibold text-[#6b7684] ${
                    c.align === "right" ? "text-right" : "text-left"
                  }`}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const key = rowKey(r);
              const selected = selectedKey != null && selectedKey === key;
              const tone = rowTone?.(r);
              return (
                <tr
                  key={key}
                  tabIndex={onRowClick ? 0 : undefined}
                  aria-selected={onRowClick ? selected : undefined}
                  onClick={onRowClick ? activate(r) : undefined}
                  onKeyDown={onRowClick ? activate(r) : undefined}
                  className={`h-[52px] border-t border-[#e5e8eb] ${onRowClick ? "cursor-pointer" : ""} ${
                    selected ? "bg-[#e8f3ff]" : onRowClick ? "hover:bg-[#f9fafb]" : ""
                  } ${tone ? ROW_TONE[tone] : ""}`}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`px-4 py-2.5 align-middle text-[#191f28] ${c.align === "right" ? "text-right tabular-nums" : ""} ${
                        c.mono ? "font-mono text-[13px]" : ""
                      }`}
                    >
                      {c.cell(r)}
                    </td>
                  ))}
                </tr>
              );
            })}
            {Array.from({ length: skeletonRows }, (_, i) => (
              <tr key={`sk-${i}`} aria-hidden className="h-[52px] border-t border-[#e5e8eb]">
                {columns.map((c) => (
                  <td key={c.key} className="px-4">
                    <span className="block h-3.5 w-3/4 rounded bg-[#e5e8eb] motion-safe:animate-pulse" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 폰: 카드 목록 */}
      <ul className="md:hidden" aria-label={caption}>
        {rows.map((r) => {
          const key = rowKey(r);
          const selected = selectedKey != null && selectedKey === key;
          const tone = rowTone?.(r);
          const inner = (
            <>
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0 flex-1 break-words text-[15px] font-bold text-[#191f28]">
                  {titleCols.length ? titleCols.map((c) => <span key={c.key}>{c.cell(r)}</span>) : columns[0]?.cell(r)}
                </span>
                {badgeCols.length ? (
                  <span className="flex shrink-0 flex-wrap justify-end gap-1">
                    {badgeCols.map((c) => (
                      <span key={c.key}>{c.cell(r)}</span>
                    ))}
                  </span>
                ) : null}
              </span>
              {metaCols.length ? (
                <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[13px] font-medium text-[#6b7684]">
                  {metaCols.map((c) => (
                    <span key={c.key} className={`min-w-0 ${c.mono ? "break-all font-mono text-[12px]" : ""}`}>
                      <span className="sr-only">{c.header}: </span>
                      {c.cell(r)}
                    </span>
                  ))}
                </span>
              ) : null}
            </>
          );
          const cls = `block w-full border-t border-[#e5e8eb] px-4 py-3.5 text-left first:border-t-0 ${
            selected ? "bg-[#e8f3ff]" : ""
          } ${tone ? ROW_TONE[tone] : ""}`;
          return (
            <li key={key}>
              {onRowClick ? (
                <button type="button" onClick={(e) => onRowClick(r, e.currentTarget)} className={`${cls} min-h-11 active:bg-[#f9fafb]`}>
                  {inner}
                </button>
              ) : (
                <div className={cls}>{inner}</div>
              )}
            </li>
          );
        })}
        {Array.from({ length: skeletonRows }, (_, i) => (
          <li key={`sk-${i}`} aria-hidden className="border-t border-[#e5e8eb] px-4 py-4 first:border-t-0">
            <span className="block h-4 w-2/3 rounded bg-[#e5e8eb] motion-safe:animate-pulse" />
            <span className="mt-2 block h-3 w-1/2 rounded bg-[#e5e8eb] motion-safe:animate-pulse" />
          </li>
        ))}
      </ul>

      {footer ? <div className="border-t border-[#e5e8eb] px-4 py-3 text-[12.5px] font-medium text-[#8b95a1]">{footer}</div> : null}
    </div>
  );
}
