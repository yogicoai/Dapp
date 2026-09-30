"use client";

/**
 * 회원 화면 '책' 탭 — 이 회원이 만든 동화와 [열기]. 설정 화면 관리실에서 회원을 펼치면 보이던 책 목록을 옮겼다.
 * 열기는 새 탭 — 관리자 페이지(서랍·거르기)를 잃지 않게. 숨긴 책(고객이 책장에서 내린 것)은 배지로 알린다.
 */
import Link from "next/link";
import { formatDateKo } from "@/lib/admin";
import type { MemberBook } from "@/lib/admin-members";
import { Badge, DataTable, EmptyState, Icon, type Column } from "@/components/admin/kit";

export function MemberBooks({ books, truncated }: { books: MemberBook[]; truncated: boolean }) {
  const columns: Column<MemberBook>[] = [
    {
      key: "title",
      header: "제목",
      mobile: "title",
      cell: (b) => <span className="font-bold">{b.title ?? <span className="font-medium text-[#b0b8c1]">제목 없음</span>}</span>,
    },
    { key: "at", header: "만든 날", cell: (b) => <span className="tabular-nums text-[#4e5968]">{formatDateKo(b.createdAt)}</span> },
    { key: "hidden", header: "책장", mobile: "badge", cell: (b) => (b.hidden ? <Badge tone="gray">숨김</Badge> : <span className="text-[#8b95a1]">보임</span>) },
    {
      key: "open",
      header: "열기",
      align: "right",
      cell: (b) => (
        <Link
          href={`/book/${encodeURIComponent(b.id)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2.5 text-[13px] font-bold text-[#1b64da] hover:bg-[#e8f3ff] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#3182f6]"
        >
          열기
          <Icon name="external" size={16} />
          <span className="sr-only">(새 탭)</span>
        </Link>
      ),
    },
  ];
  return (
    <DataTable
      caption="만든 동화"
      columns={columns}
      rows={books}
      rowKey={(b) => b.id}
      empty={<EmptyState icon="book" title="만든 동화가 없어요" body="이 회원이 동화를 저장하면 여기 보여요." />}
      footer={truncated ? "최근 200권만 보여요." : undefined}
    />
  );
}
