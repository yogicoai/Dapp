"use client";

/**
 * 값이 나가는 단추를 누르면 먼저 뜨는 확인 창 — "토큰 N개가 나가요".
 *
 * 사장님(2026-09-29): "이야기 만들기 누르면 얼마의 크래딧이 발생됩니다 — 누르면서 생성되게". 단추 글씨에 값을 적어 둬도
 * 누르자마자 값이 나가면 놀란다. 대본 만들기와 그림 그리기 두 곳에서 쓴다(동화 만들기 화면).
 * ESC·바깥 누르기·취소는 아무것도 하지 않고 닫는다. 확인을 누른 그 순간이 값이 나가는 때다.
 */

import { useEffect, useRef } from "react";

export function ChargeConfirm({
  title,
  lines,
  confirmLabel,
  accent,
  accentDark,
  onConfirm,
  onCancel,
}: {
  /** 예: "토큰 6개가 나가요" */
  title: string;
  /** 제목 아래 설명 줄 — 잔액, 다음에 나갈 값 등 */
  lines: string[];
  /** 예: "대본 만들기" */
  confirmLabel: string;
  accent: string;
  accentDark: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    // 화면의 ESC(만들기 멈춤)보다 먼저 받는다 — 확인 창만 닫히게.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="charge-confirm-title"
        className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="flex items-center justify-center gap-2">
          <span
            aria-hidden
            className="inline-block rounded-full"
            style={{ width: 22, height: 22, background: "radial-gradient(circle at 35% 30%, #ffe08a, #e0a020)" }}
          />
        </p>
        <h2 id="charge-confirm-title" className="mt-2 break-keep text-center text-xl font-extrabold text-neutral-800">
          {title}
        </h2>
        <div className="mt-2 flex flex-col gap-1">
          {lines.map((l) => (
            <p key={l} className="break-keep text-center text-sm font-medium leading-relaxed text-neutral-600">
              {l}
            </p>
          ))}
        </div>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-12 flex-1 rounded-2xl bg-neutral-100 px-4 text-base font-extrabold text-neutral-600"
          >
            취소
          </button>
          <button
            ref={okRef}
            type="button"
            onClick={onConfirm}
            className="min-h-12 flex-1 rounded-2xl px-4 text-base font-extrabold text-white shadow"
            style={{ background: accent, boxShadow: `0 4px 0 ${accentDark}` }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
