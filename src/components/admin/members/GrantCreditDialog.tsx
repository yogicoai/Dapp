"use client";

/**
 * 보상 크레딧 더해 주기 창 — 회원 상세 '보상 크레딧' 카드와 사고 상세 '크레딧으로 보상'이 같이 쓴다(사장님 2026-10-19
 * "사고가 발생했을 때 크레딧으로 제공 … 동화와 / 캐릭터 생성으로 나눠서 관리").
 *  · 종류(동화 크레딧 · 캐릭터 생성 크레딧) · 수(1~10) · 사유(필수, 사고에서 열면 기록 id 를 미리 적어 둔다).
 *  · 저장은 POST /api/admin/credits — 진짜 문지기는 DB 함수(관리자 계정·틀린 값은 DB 가 다시 막는다).
 */
import { useId, useState } from "react";
import {
  CREDIT_GRANT_MAX,
  CREDIT_KIND_HELP,
  CREDIT_KIND_LABEL,
  CREDIT_KIND_UNIT,
  CREDIT_KINDS,
  CREDIT_NOTE_MAX,
  creditText,
  type CreditKind,
} from "@/lib/member-credits";
import { Modal, ModalActions } from "@/components/admin/kit";
import { useAdmin } from "@/components/admin/shell/AdminContext";

export function GrantCreditDialog({
  memberId,
  username,
  initialKind,
  current,
  defaultNote = "",
  onClose,
  onDone,
}: {
  memberId: string;
  username: string;
  initialKind: CreditKind;
  /** 지금 남은 수(알면) — '지금 N → 더하면 M' */
  current?: Partial<Record<CreditKind, number>>;
  /** 사유 칸에 미리 적어 둘 글 — 사고에서 열면 기록 id */
  defaultNote?: string;
  onClose: () => void;
  onDone: (kind: CreditKind) => void;
}) {
  const { api, say } = useAdmin();
  const idBase = useId();
  const [kind, setKind] = useState<CreditKind>(initialKind);
  const [amount, setAmount] = useState(1);
  const [note, setNote] = useState(defaultNote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ok = note.trim().length >= 2;
  const unit = CREDIT_KIND_UNIT[kind];
  const now = current?.[kind];

  const save = async () => {
    setBusy(true);
    setError(null);
    const r = await api<{ ok: true; kind: CreditKind; freeLeft: number | null }>("/api/admin/credits", {
      id: memberId,
      kind,
      amount,
      note: note.trim(),
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    say(`${username}에게 ${creditText(kind, amount)}을 더했어요${r.data.freeLeft !== null ? ` (남은 ${r.data.freeLeft}${unit})` : ""}`);
    onDone(kind);
  };

  return (
    <Modal title={`${username} 보상 크레딧 더해 주기`} onClose={onClose} busy={busy}>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-bold text-[#6b7684]">무엇을 줄까요?</legend>
        {CREDIT_KINDS.map((k) => {
          const on = kind === k;
          return (
            <label
              key={k}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 ${
                on ? "border-[#3182f6] bg-[#f4f9ff]" : "border-[#e5e8eb] bg-white"
              }`}
            >
              <input
                type="radio"
                name={`${idBase}-kind`}
                value={k}
                checked={on}
                onChange={() => setKind(k)}
                className="mt-1 h-4 w-4 accent-[#3182f6]"
              />
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-bold text-[#191f28]">{CREDIT_KIND_LABEL[k]}</span>
                <span className="break-keep text-[12px] font-medium text-[#6b7684]">{CREDIT_KIND_HELP[k]}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${idBase}-amount`} className="text-xs font-bold text-[#6b7684]">
          몇 {unit} 더할까요?
        </label>
        <select
          id={`${idBase}-amount`}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          className="h-11 rounded-xl border border-[#d1d6db] bg-white px-3 text-sm font-bold tabular-nums text-[#191f28] outline-none focus:border-[#3182f6]"
        >
          {Array.from({ length: CREDIT_GRANT_MAX }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
              {unit}
            </option>
          ))}
        </select>
        {typeof now === "number" ? (
          <span className="text-[12px] font-medium text-[#8b95a1]">
            지금 {now}
            {unit} → 더하면 {now + amount}
            {unit}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${idBase}-note`} className="text-xs font-bold text-[#6b7684]">
          왜 더해 주나요? (필수)
        </label>
        <textarea
          id={`${idBase}-note`}
          rows={2}
          maxLength={CREDIT_NOTE_MAX}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={kind === "book" ? "예: 그림이 비어 저장된 동화 — 다시 만들기 1권" : "예: 아이 얼굴이 닮지 않았다는 문의 — 다시 만들기 1번"}
          className="resize-y rounded-xl border border-[#d1d6db] px-3 py-2 text-sm font-normal text-[#191f28] outline-none placeholder:text-[#b0b8c1] focus:border-[#3182f6]"
        />
      </div>

      <p className="rounded-xl bg-[#f2f4f6] px-4 py-3 text-[12px] font-medium leading-relaxed text-[#6b7684]">
        {kind === "book"
          ? "고객 만들기 화면에 '무료 동화 N권'으로 보이고, 다음 동화에 먼저 쓰여요. 더한 기록은 회원 상세 '보상 크레딧'에 남아요."
          : "고객 가족 화면에 '캐릭터 무료 생성 N번'으로 보이고, 쿠키가 드는 그리기에 먼저 쓰여요. 더한 기록은 회원 상세 '보상 크레딧'에 남아요."}
      </p>

      {error ? <p className="rounded-lg bg-[#ffeff0] px-2.5 py-2 text-xs font-bold text-[#f04452]">{error}</p> : null}
      <ModalActions
        onCancel={onClose}
        cancelLabel="그만두기"
        okLabel={`${amount}${unit} 더하기`}
        okClass="bg-[#3182f6]"
        busy={busy}
        disabled={!ok}
        onOk={() => void save()}
      />
    </Modal>
  );
}
