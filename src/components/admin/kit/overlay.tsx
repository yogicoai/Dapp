"use client";

/**
 * 겹 화면 — 서랍(Drawer) · 확인창(Modal) · 되묻기(ConfirmDialog).
 *
 *  · 서랍: 넓은 화면은 오른쪽, 1024px 아래는 전체 화면. 열리면 [닫기]에 초점, Esc 로 닫는다(처리 중엔 안 닫힘).
 *  · 확인창: 옛 관리실(page.tsx)의 Modal 을 그대로 옮겼다 — 폰 키보드가 떠도 [확인] 단추가 잘리지 않게
 *    바깥·안쪽이 모두 스크롤된다.
 *  · 되묻기: 돈·기록을 바꾸는 일은 전부 이걸 지난다. 사유가 필요한 일은 사유가 조건에 맞아야 단추가 켜진다.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useEscClose } from "@/lib/use-esc-close";

/**
 * 겹 화면이 떠 있는 동안 뒤 페이지가 같이 스크롤되지 않게. 여러 겹이면 마지막 것이 닫힐 때 푼다.
 * 원래 값은 첫 겹이 뜰 때 한 번만 적어 둔다 — 겹마다 적으면, 서랍이 닫히기 전에 뜬 확인창이 'hidden'을
 * 원래 값으로 적어 두었다가 마지막에 되돌려 페이지가 멈춘 채 남는다(겹이 닫히는 순서는 정해져 있지 않다).
 */
let scrollLocks = 0;
let savedOverflow = "";
function useBodyScrollLock(on: boolean) {
  useEffect(() => {
    if (!on) return;
    if (scrollLocks === 0) savedOverflow = document.body.style.overflow;
    scrollLocks += 1;
    document.body.style.overflow = "hidden";
    return () => {
      scrollLocks = Math.max(0, scrollLocks - 1);
      if (scrollLocks === 0) document.body.style.overflow = savedOverflow;
    };
  }, [on]);
}

/* ── 서랍 ───────────────────────────────────────────────────────────────── */

export function Drawer({
  open,
  title,
  subtitle,
  onClose,
  footer,
  width = 480,
  busy = false,
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  width?: 480 | 560;
  busy?: boolean;
  children: ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  useEscClose(onClose, open && !busy);
  useBodyScrollLock(open);
  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-[rgba(0,23,51,.32)]" onClick={() => !busy && onClose()} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`fixed inset-0 z-40 flex flex-col bg-white shadow-[0_10px_30px_rgba(0,27,55,.10)] motion-safe:animate-[admin-drawer-in_200ms_ease-out] lg:left-auto ${
          width === 560 ? "lg:w-[560px]" : "lg:w-[480px]"
        }`}
      >
        <header className="flex min-h-14 items-center justify-between gap-3 border-b border-[#e5e8eb] px-5 pt-[env(safe-area-inset-top)]">
          <div className="flex min-w-0 flex-col py-2">
            <h2 id={titleId} className="truncate text-[17px] font-bold text-[#191f28]">
              {title}
            </h2>
            {subtitle ? <p className="truncate text-[13px] font-medium text-[#8b95a1]">{subtitle}</p> : null}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex min-h-11 shrink-0 items-center rounded-xl px-3 text-sm font-bold text-[#6b7684] hover:bg-[#f2f4f6] disabled:opacity-50"
          >
            닫기
          </button>
        </header>
        <div className="flex-1 overflow-y-auto overscroll-contain p-5">{children}</div>
        {footer ? (
          <div className="flex flex-wrap gap-2 border-t border-[#e5e8eb] bg-white px-5 py-3.5 pb-[calc(14px+env(safe-area-inset-bottom))]">
            {footer}
          </div>
        ) : null}
      </aside>
      {/* 서랍이 밀려 들어오는 움직임 — 움직임을 줄이라는 설정이면 motion-safe 가 끈다. */}
      <style>{`@keyframes admin-drawer-in{from{transform:translateX(24px);opacity:.6}to{transform:none;opacity:1}}`}</style>
    </>
  );
}

/* ── 확인창 ─────────────────────────────────────────────────────────────── */

/** 옛 관리실 Modal 그대로(2026-09-30 옮김). 처리 중에는 바깥을 눌러도·Esc 로도 안 닫힌다. */
export function Modal({
  title,
  onClose,
  busy,
  children,
}: {
  title: string;
  onClose: () => void;
  busy: boolean;
  children: ReactNode;
}) {
  useEscClose(onClose, !busy);
  useBodyScrollLock(true);
  return (
    // 폰에서 사유 칸에 키보드가 뜨면 보이는 높이가 줄어든다 — 바깥·안쪽 모두 스크롤되게 해 [환불하기]가 잘리지 않게.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#191f28]/45 px-4 py-4"
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[calc(100dvh-32px)] w-full max-w-[440px] flex-col gap-3 overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
      >
        <h2 className="text-lg font-bold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

/** 확인창 아래 단추 줄 — 옛 관리실 Actions 그대로. */
export function ModalActions({
  onCancel,
  okLabel,
  okClass,
  disabled,
  busy,
  onOk,
  cancelLabel = "취소",
}: {
  onCancel: () => void;
  okLabel: string;
  okClass: string;
  disabled?: boolean;
  busy: boolean;
  onOk: () => void;
  cancelLabel?: string;
}) {
  return (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="min-h-11 rounded-xl border border-[#e5e8eb] px-3.5 py-2 text-sm font-bold text-[#4e5968]"
      >
        {cancelLabel}
      </button>
      <button
        type="button"
        onClick={onOk}
        disabled={disabled || busy}
        className={`min-h-11 rounded-xl px-3.5 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45 ${okClass}`}
      >
        {busy ? "처리 중…" : okLabel}
      </button>
    </div>
  );
}

/* ── 되묻기 ─────────────────────────────────────────────────────────────── */

/**
 * 한 번 더 묻는 창. reason 을 주면 사유 칸이 생기고, min~max 글자여야 [확인]이 켜진다
 * (min 0 이면 선택 — 비우면 null 로 넘긴다). 오류는 창 안에 보여 주고 창은 닫지 않는다.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel = "취소",
  tone = "primary",
  reason,
  extra,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  reason?: { label: string; min: number; max: number; placeholder?: string };
  extra?: ReactNode;
  busy: boolean;
  error?: string | null;
  onConfirm: (reason: string | null) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const id = useId();
  const trimmed = text.trim();
  const reasonOk = !reason || (trimmed.length >= reason.min && trimmed.length <= reason.max);
  return (
    <Modal title={title} onClose={onCancel} busy={busy}>
      {body ? <div className="break-keep text-sm leading-relaxed text-[#4e5968]">{body}</div> : null}
      {extra}
      {reason ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id} className="text-xs font-bold text-[#6b7684]">
            {reason.label}
          </label>
          <textarea
            id={id}
            rows={2}
            value={text}
            maxLength={reason.max}
            onChange={(e) => setText(e.target.value)}
            placeholder={reason.placeholder}
            className="resize-y rounded-xl border border-[#d1d6db] px-3 py-2 text-sm font-normal text-[#191f28] outline-none placeholder:text-[#b0b8c1] focus:border-[#3182f6]"
            autoFocus
          />
          <span className="text-right text-[11px] font-medium tabular-nums text-[#8b95a1]">
            {trimmed.length}/{reason.max}
            {reason.min > 0 && trimmed.length < reason.min ? ` · ${reason.min}자 이상` : ""}
          </span>
        </div>
      ) : null}
      {error ? <p className="rounded-lg bg-[#ffeff0] px-2.5 py-2 text-xs font-bold text-[#f04452]">{error}</p> : null}
      <ModalActions
        onCancel={onCancel}
        cancelLabel={cancelLabel}
        okLabel={confirmLabel}
        okClass={tone === "danger" ? "bg-[#f04452]" : "bg-[#3182f6]"}
        busy={busy}
        disabled={!reasonOk}
        onOk={() => onConfirm(reason ? trimmed || null : null)}
      />
    </Modal>
  );
}
