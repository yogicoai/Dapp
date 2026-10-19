"use client";

/**
 * 회원 탈퇴 시트(설정 › 계정, 2026-10-19 — lib/retention · supabase-withdrawal.sql).
 *
 * 무엇이 사라지고 무엇이 90일 남는지 먼저 보여 주고, 사유(고르거나 적기 — 안 적어도 된다)와 확인 글자('탈퇴')를 받는다.
 * 확인 글자를 그대로 적어야 단추가 켜진다 — 잘못 누르는 일을 막는다(DB 함수도 한 번 더 본다).
 * 끝나면 onDone — 설정 화면이 로그인 화면으로 보낸다(계정이 없어졌다).
 */
import { useId, useState } from "react";
import { Sheet } from "@/components/family/Sheet";
import { withdrawAccount } from "@/lib/auth";
import {
  cleanWithdrawReason,
  WITHDRAW_CONFIRM_WORD,
  WITHDRAW_NOTICE,
  WITHDRAW_REASON_MAX,
  WITHDRAW_REASONS,
  withdrawConfirmed,
} from "@/lib/retention";

export function WithdrawSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const reasonId = useId();
  const confirmId = useId();
  const ready = withdrawConfirmed(confirm) && !busy;

  async function submit() {
    if (!ready) return;
    setBusy(true);
    setError("");
    const res = await withdrawAccount(confirm, cleanWithdrawReason(reason));
    if (res.ok) {
      onDone();
      return;
    }
    setError(res.error);
    setBusy(false);
  }

  return (
    <Sheet onClose={onClose} label="회원 탈퇴" dismissible={!busy}>
      <div className="flex w-full flex-col gap-4 pt-2">
        <h2 className="text-[19px] font-extrabold text-neutral-800">회원 탈퇴</h2>

        <ul className="flex flex-col gap-2 rounded-2xl bg-neutral-50 px-4 py-3">
          {WITHDRAW_NOTICE.map((line) => (
            <li key={line} className="flex gap-2 break-keep text-[13px] font-medium leading-relaxed text-neutral-600">
              <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-400" />
              <span>{line}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2">
          <label htmlFor={reasonId} className="text-sm font-extrabold text-neutral-700">
            떠나시는 까닭을 알려 주시면 더 나아질게요 <span className="font-medium text-neutral-400">(안 적어도 돼요)</span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {WITHDRAW_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                aria-pressed={reason === r}
                className={`min-h-9 rounded-full px-3 text-xs font-bold transition ${
                  reason === r ? "bg-neutral-800 text-white" : "bg-neutral-100 text-neutral-600"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <textarea
            id={reasonId}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={WITHDRAW_REASON_MAX}
            rows={2}
            placeholder="직접 적어도 돼요"
            className="w-full resize-none rounded-2xl border-2 border-neutral-200 px-4 py-2.5 text-sm font-medium outline-none focus:border-neutral-400"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={confirmId} className="text-sm font-extrabold text-neutral-700">
            확인을 위해 &apos;{WITHDRAW_CONFIRM_WORD}&apos;라고 적어 주세요
          </label>
          <input
            id={confirmId}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
            autoComplete="off"
            placeholder={WITHDRAW_CONFIRM_WORD}
            className="w-full rounded-2xl border-2 border-neutral-200 px-4 py-3 text-base font-bold outline-none focus:border-neutral-400"
          />
        </div>

        {error && (
          <p role="alert" className="break-keep text-center text-sm font-bold text-red-600">
            {error}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-12 rounded-full bg-neutral-100 text-sm font-extrabold text-neutral-700 disabled:opacity-60"
          >
            계속 쓸게요
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!ready}
            className="min-h-12 rounded-full bg-red-600 text-sm font-extrabold text-white transition disabled:bg-red-200"
          >
            {busy ? "탈퇴하는 중…" : "탈퇴하기"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
