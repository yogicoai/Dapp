"use client";

/**
 * 회원 화면 '토큰 장부' 탭 — 이 회원이 토큰을 쓴 줄(대본·그림·부모 목소리·가족 캐릭터)과 되돌린 기록.
 *
 * 줄마다 [환불]로 토큰 한 건을 되돌린다(POST /api/admin/refund → DB master_refund_entry).
 *  · 사유 2~500자가 있어야 단추가 켜진다(DB 도 같은 규칙). 잔액 전 → 후를 먼저 보여 준다.
 *  · 같은 건은 DB 가 한 번만 받는다 — 다른 관리자가 먼저 눌렀으면 그 거절 문구를 창 안에 보여 준다.
 *  · 짐작으로 줄을 고치지 않는다: 끝나면 장부·잔액·배지를 서버에서 다시 읽는다.
 *  · 방금 한 환불의 사유·처리자는 겉틀(rememberRefund)에 남겨, 의견·오류 화면 서랍에서도 보이게 한다.
 * 여기서 되돌리는 것은 '토큰'이다 — 실제 결제(원) 환불은 결제·구독 화면에서 따로 기록한다.
 */
import { useState } from "react";
import {
  canRefundLedger,
  ledgerReasonLabel,
  ledgerStatusText,
  type LedgerLine,
} from "@/lib/admin-members";
import { groupDigits } from "@/lib/admin-console";
import { Button, ConfirmDialog, DataTable, EmptyState, TimeText, type Column } from "@/components/admin/kit";
import { useAdmin } from "@/components/admin/shell/AdminContext";

export function MemberLedger({
  ledger,
  truncated,
  member,
  onChanged,
}: {
  ledger: LedgerLine[];
  truncated: boolean;
  /** 잔액 전 → 후를 보여 주려고. 잔액을 아직 못 읽었으면 null. */
  member: { username: string; tokens: number | null };
  onChanged: () => void;
}) {
  const { api, say, me, recentRefunds, rememberRefund, refreshBadges } = useAdmin();
  const [target, setTarget] = useState<LedgerLine | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const columns: Column<LedgerLine>[] = [
    { key: "at", header: "일시", cell: (l) => <TimeText iso={l.createdAt} mode="datetime" /> },
    { key: "what", header: "내용", mobile: "title", cell: (l) => <span className="font-bold">{ledgerReasonLabel(l.reason)}</span> },
    { key: "amount", header: "토큰", align: "right", cell: (l) => <span className="tabular-nums">{groupDigits(l.amount)}토큰</span> },
    {
      key: "state",
      header: "상태",
      cell: (l) => (
        <span className={`break-keep ${l.refundedAt ? "font-bold text-[#00976b]" : "text-[#6b7684]"}`}>
          {ledgerStatusText(l, recentRefunds)}
        </span>
      ),
    },
    {
      key: "act",
      header: "처리",
      align: "right",
      mobile: "badge",
      cell: (l) =>
        canRefundLedger(l) ? (
          <Button
            tone="danger"
            size="sm"
            onClick={() => {
              setError(null);
              setTarget(l);
            }}
          >
            환불
          </Button>
        ) : null,
    },
  ];

  async function refund(note: string | null) {
    if (!target || !note) return;
    setBusy(true);
    setError(null);
    const r = await api<{ ok: true; result: { amount?: number; tokens?: number } | null }>("/api/admin/refund", {
      entry: target.id,
      note,
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    rememberRefund(target.id, { by: me.username || "관리자", note });
    say(`환불했어요 · ${member.username} 잔액 +${r.data.result?.amount ?? target.amount}토큰`);
    setTarget(null);
    onChanged();
    refreshBadges();
  }

  return (
    <>
      <DataTable
        caption="토큰 장부"
        columns={columns}
        rows={ledger}
        rowKey={(l) => l.id}
        empty={<EmptyState icon="book" title="토큰을 쓴 기록이 없어요" body="대본·그림·목소리·가족 캐릭터에 토큰을 쓰면 여기 쌓여요." />}
        footer={
          truncated
            ? "최근 200건만 보여요."
            : "토큰 기록이에요. 실제 돈(원)이 오간 기록은 '실제 결제' 탭에 있어요."
        }
      />
      {target ? (
        <ConfirmDialog
          key={target.id}
          title="토큰 환불"
          tone="danger"
          confirmLabel="환불하기"
          body={
            <>
              <b>{member.username}</b> 님의 {ledgerReasonLabel(target.reason)} {groupDigits(target.amount)}토큰을 되돌려요. 같은 건은 한 번만
              환불돼요.
            </>
          }
          extra={
            <div className="rounded-lg bg-[#f9fafb] px-2.5 py-2 text-xs text-[#6b7684]">
              {member.username} 잔액 <span className="tabular-nums">{member.tokens ?? "?"}</span> →{" "}
              <span className="tabular-nums">{member.tokens !== null ? member.tokens + target.amount : "?"}</span>토큰
            </div>
          }
          reason={{ label: "사유 (필수 · 고객에겐 안 보여요)", min: 2, max: 500, placeholder: "예: 저장 실패 컴플레인 — 되살림 후 환불" }}
          busy={busy}
          error={error}
          onConfirm={(note) => void refund(note)}
          onCancel={() => setTarget(null)}
        />
      ) : null}
    </>
  );
}
