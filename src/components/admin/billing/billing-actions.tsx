"use client";

/**
 * 결제·구독 화면에서 **쓰는 일은 이 파일 둘뿐이다** — 환불 요청 적기 · 환불 요청 거두기.
 *
 * 왜 한 파일에 모으나: 시연 데이터(demo-…)는 화면에만 있다. 눌러서 서버로 가는 길이 여기 둘뿐이면
 * "시연 줄로는 아무것도 쓰지 않는다"를 한눈에 확인하고 시험(admin-billing-demo.test.ts)으로 지킬 수 있다.
 *  · 창을 여는 쪽은 canRequestRefund / canWithdrawRefund 가 참일 때만 연다(시연 줄은 늘 거짓).
 *  · 여기서도 보내기 직전에 isDemoId 로 한 번 더 막는다. 서버(parseAdminId)도 demo- 를 거절한다 — 세 겹.
 *  · 결제사(PG)를 붙이기 전이라 실제 취소는 하지 않는다. '요청'만 적고, 취소는 나중에 서버가 한다.
 *  · 미리 바꿔 보여 주지 않는다 — 성공하면 부른 쪽이 목록·서랍을 다시 읽는다.
 */
import { useId, useState } from "react";
import {
  isDemoId,
  parseWonInput,
  planLabel,
  refundableAmount,
  type PgPaymentDetail,
  type PgRefund,
} from "@/lib/admin-billing";
import { formatWon } from "@/lib/admin-console";
import { ConfirmDialog, Field, Modal, ModalActions, TextArea, TextInput } from "@/components/admin/kit";
import { useAdmin } from "@/components/admin/shell/AdminContext";

const REASON_MIN = 2;
const REASON_MAX = 500;

/** [환불 요청 기록] 창 — 금액(기본: 남은 환불 가능액) + 사유(2~500자). */
export function RefundRequestDialog({
  payment,
  onClose,
  onDone,
}: {
  payment: PgPaymentDetail;
  onClose: () => void;
  onDone: () => void;
}) {
  const { api, say, refreshBadges } = useAdmin();
  const max = refundableAmount(payment, payment.refunds);
  const [amountText, setAmountText] = useState(String(max));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amountId = useId();
  const reasonId = useId();

  const amount = parseWonInput(amountText, max);
  const reasonLen = reason.trim().length;
  const reasonOk = reasonLen >= REASON_MIN && reasonLen <= REASON_MAX;

  const submit = async () => {
    // 시연 줄은 여기까지 올 수 없지만(창을 열지 않는다) 보내기 직전에 한 번 더 막는다.
    if (payment.demo || isDemoId(payment.id) || !amount.ok || !reasonOk || busy) return;
    setBusy(true);
    setError(null);
    const r = await api<{ ok: true; refundId: string | null }>("/api/admin/billing/refund-request", {
      paymentId: payment.id,
      amount: amount.value,
      reason: reason.trim(),
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    say("환불 요청을 기록했어요. 실제 취소는 결제 연동 뒤 서버가 해요.");
    refreshBadges();
    onDone();
  };

  return (
    <Modal title="환불 요청 기록" onClose={onClose} busy={busy}>
      <p className="break-keep text-sm leading-relaxed text-[#4e5968]">
        주문 <span className="font-mono text-[13px]">{payment.orderId}</span> · {planLabel(payment.product)} · {formatWon(payment.amount)}
      </p>
      <Field
        label="환불할 금액(원)"
        htmlFor={amountId}
        required
        error={amountText.trim() && !amount.ok ? amount.error : null}
        help={`1원 ~ ${formatWon(max)} (결제 금액에서 이미 환불했거나 요청한 금액을 뺀 값)`}
      >
        <TextInput
          id={amountId}
          inputMode="numeric"
          autoComplete="off"
          value={amountText}
          invalid={!!amountText.trim() && !amount.ok}
          onChange={(e) => setAmountText(e.target.value)}
        />
      </Field>
      {/* 사유 칸은 회원도 자기 줄을 읽는다(supabase-admin-console.sql 의 payment_refunds 열람 권한) — 직원용 메모로 쓰지 않게 알린다. */}
      <Field label="환불 사유" htmlFor={reasonId} required counter={{ value: reasonLen, max: REASON_MAX }} help="고객도 이 사유를 볼 수 있어요(본인 결제 기록). 내부 메모는 적지 마세요.">
        <TextArea
          id={reasonId}
          rows={2}
          maxLength={REASON_MAX}
          value={reason}
          placeholder="예: 결제 뒤 7일 안에 한 권도 만들지 않으셨어요."
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <p className="rounded-xl bg-[#fff4e0] px-3 py-2.5 text-[13px] font-medium leading-relaxed text-[#8a5a00]">
        결제사 취소는 아직 연결되지 않아 <b>요청만 기록돼요</b>. 실제 취소는 결제 연동 뒤 서버가 처리해요.
      </p>
      {error ? <p className="rounded-lg bg-[#ffeff0] px-2.5 py-2 text-xs font-bold text-[#f04452]">{error}</p> : null}
      <ModalActions
        onCancel={onClose}
        okLabel="요청 기록하기"
        okClass="bg-[#3182f6]"
        busy={busy}
        disabled={!amount.ok || !reasonOk}
        onOk={() => void submit()}
      />
    </Modal>
  );
}

/** [요청 취소] 창 — 아직 '요청됨'인 환불 요청을 거둔다. 메모는 선택. */
export function WithdrawRefundDialog({
  refund,
  onClose,
  onDone,
}: {
  refund: PgRefund;
  onClose: () => void;
  onDone: () => void;
}) {
  const { api, say, refreshBadges } = useAdmin();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (note: string | null) => {
    if (refund.demo || isDemoId(refund.id) || busy) return;
    setBusy(true);
    setError(null);
    const r = await api<{ ok: true }>("/api/admin/billing/refund-withdraw", { refundId: refund.id, note });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    say("환불 요청을 취소했어요.");
    refreshBadges();
    onDone();
  };

  return (
    <ConfirmDialog
      title="환불 요청을 취소할까요?"
      body={
        <>
          주문 <span className="font-mono text-[13px]">{refund.orderId ?? "–"}</span>의 {formatWon(refund.amount)} 환불 요청을 거둬요. 결제는
          그대로이고, 누가 언제 거뒀는지 기록에 남아요.
        </>
      }
      confirmLabel="요청 취소하기"
      cancelLabel="닫기"
      tone="danger"
      reason={{ label: "메모 (선택)", min: 0, max: 500, placeholder: "예: 고객이 계속 쓰기로 하셨어요." }}
      busy={busy}
      error={error}
      onCancel={onClose}
      onConfirm={(note) => void submit(note)}
    />
  );
}
