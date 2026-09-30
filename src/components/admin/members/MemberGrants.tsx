"use client";

/**
 * 회원 화면 '충전 기록' 탭 — 관리자가 토큰을 넣어 준 기록(token_grants)과 그때 적은 사유.
 * "왜 넣어 줬더라"를 나중에 읽으려고 남긴 기록이다. 넣어 준 사람 아이디를 못 읽으면 '–'로 둔다.
 */
import { signedTokens, type GrantLine } from "@/lib/admin-members";
import { groupDigits } from "@/lib/admin-console";
import { DataTable, EmptyState, TimeText, type Column } from "@/components/admin/kit";

export function MemberGrants({ grants, truncated }: { grants: GrantLine[]; truncated: boolean }) {
  const columns: Column<GrantLine>[] = [
    { key: "at", header: "일시", cell: (g) => <TimeText iso={g.createdAt} mode="datetime" /> },
    {
      key: "amount",
      header: "토큰",
      align: "right",
      mobile: "title",
      cell: (g) => (
        <span className={`font-bold tabular-nums ${g.amount > 0 ? "text-[#00976b]" : "text-[#f04452]"}`}>{signedTokens(g.amount)}토큰</span>
      ),
    },
    { key: "reason", header: "사유", cell: (g) => (g.reason ? <span className="break-keep">{g.reason}</span> : <span className="text-[#b0b8c1]">사유 없음</span>) },
    { key: "by", header: "처리자", cell: (g) => g.grantedBy ?? <span className="text-[#b0b8c1]">–</span> },
    {
      key: "after",
      header: "충전 뒤 잔액",
      align: "right",
      cell: (g) => (g.tokensAfter === null ? "–" : <span className="tabular-nums">잔액 {groupDigits(g.tokensAfter)}토큰</span>),
    },
  ];
  return (
    <DataTable
      caption="토큰 충전 기록"
      columns={columns}
      rows={grants}
      rowKey={(g) => g.id}
      empty={<EmptyState icon="inbox" title="충전 기록이 없어요" body="위의 [토큰 충전]으로 넣어 주면 사유와 함께 여기 남아요." />}
      footer={truncated ? "최근 100건만 보여요." : undefined}
    />
  );
}
