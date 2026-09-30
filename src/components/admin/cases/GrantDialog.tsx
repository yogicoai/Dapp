"use client";

/**
 * 토큰 충전 확인창 — 옛 관리실(app/admin/page.tsx 의 Dialogs 마지막 갈래)을 그대로 옮겼다(2026-09-30).
 * 회원 화면에서만 연다. 1~1000개, 사유 200자까지, 잔액 전 → 후를 먼저 보여 준다.
 * 충전과 사유는 DB(grant_tokens → token_grants)에 함께 남는다 — 이 창은 부탁만 하고, 막는 것은 DB 다.
 * 여기서 넣는 것은 '토큰'이다(실제 결제·환불(원)과 다르다).
 */
import { useState } from "react";
import { parseGrantAmount } from "@/lib/admin";
import { Modal, ModalActions as Actions } from "../kit/overlay";
import { useAdmin } from "../shell/AdminContext";

export function GrantDialog({
  customer: c,
  onClose,
  onDone,
}: {
  customer: { id: string; username: string; tokens: number };
  onClose: () => void;
  /** 충전이 끝난 뒤 — 부른 쪽이 회원 정보를 다시 읽는다. */
  onDone: () => Promise<void> | void;
}) {
  const { api, say } = useAdmin();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("30");
  const amt = parseGrantAmount(amount);
  const errLine = error && <p className="rounded-lg bg-[#ffeff0] px-2.5 py-2 text-xs font-bold text-[#f04452]">{error}</p>;

  return (
    <Modal title="토큰 충전" onClose={onClose} busy={busy}>
      <p className="text-sm text-[#6b7684]">
        <b>{c.username}</b> 님께 토큰을 넣어 드려요.
      </p>
      <label className="flex flex-col gap-1.5 text-xs font-bold text-[#8b95a1]">
        토큰 수 (1~1000)
        <input
          type="number"
          min={1}
          max={1000}
          step={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="min-h-11 rounded-xl border border-[#e5e8eb] px-3 py-2 text-sm font-normal text-[#191f28]"
          autoFocus
        />
      </label>
      <label className="flex flex-col gap-1.5 text-xs font-bold text-[#8b95a1]">
        왜 넣어 주나요? (기록에 남아요)
        <input
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 200))}
          placeholder="예: 저장 실패 보상"
          className="min-h-11 rounded-xl border border-[#e5e8eb] px-3 py-2 text-sm font-normal text-[#191f28] placeholder:text-[#c4cad1]"
        />
      </label>
      <div className="rounded-lg bg-[#f9fafb] px-2.5 py-2 text-xs text-[#6b7684]">
        {c.username} 잔액 <span className="tabular-nums">{c.tokens}</span> →{" "}
        <span className="tabular-nums">{amt.ok ? c.tokens + amt.value : "?"}</span>토큰
        <span className="mt-0.5 block text-[#b0b8c1]">충전과 사유는 기록(token_grants)에 함께 남아요.</span>
      </div>
      {!amt.ok && amount !== "" && <p className="text-xs font-bold text-[#f04452]">{amt.error}</p>}
      {errLine}
      <Actions
        onCancel={onClose}
        okLabel="충전"
        okClass="bg-[#3182f6]"
        busy={busy}
        disabled={!amt.ok}
        onOk={async () => {
          if (!amt.ok) return;
          setBusy(true);
          setError(null);
          const r = await api<{ tokens: number }>("/api/admin/grant", {
            user: c.id,
            amount: amt.value,
            reason: note.trim(),
          });
          setBusy(false);
          if (!r.ok) return setError(r.error);
          say(`${c.username} 잔액 +${amt.value}토큰 (지금 ${r.data.tokens}토큰)`);
          onClose();
          await onDone();
        }}
      />
    </Modal>
  );
}
