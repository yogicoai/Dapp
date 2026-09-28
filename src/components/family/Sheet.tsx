"use client";

/**
 * 아래에서 올라오는 시트 — 쿠키 확인·사람 메뉴·가족 더하기·모습이 바뀌었을 때.
 * 폰에서는 화면 아래에 붙고, 태블릿에서도 카드 폭(max-w-xl)만큼만 넓어진다.
 * 뒤 배경을 누르거나 ESC 로 닫는다(닫으면 안 되는 순간엔 dismissible=false).
 */

import { useEffect, useRef, type ReactNode } from "react";
import { useEscClose } from "@/lib/use-esc-close";
import { useEnter } from "./motion";

const FROM_BELOW: Keyframe = { transform: "translateY(32px)", opacity: 0 };

export function Sheet({
  onClose,
  label,
  children,
  dismissible = true,
}: {
  onClose: () => void;
  /** 화면 읽기 프로그램이 읽을 시트 이름 */
  label: string;
  children: ReactNode;
  dismissible?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEscClose(onClose, dismissible);
  useEnter(panel, FROM_BELOW);

  // 열리면 시트로 초점을 옮긴다 — 키보드·화면 읽기 사용자가 뒤 화면에 남지 않게.
  useEffect(() => {
    panel.current?.focus();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={label}>
      <button
        type="button"
        aria-label="닫기"
        tabIndex={-1}
        onClick={() => dismissible && onClose()}
        className="absolute inset-0 cursor-default bg-black/45"
      />
      <div
        ref={panel}
        tabIndex={-1}
        className="relative flex max-h-[92dvh] w-full max-w-xl flex-col items-center overflow-y-auto rounded-t-[28px] bg-white px-5 pt-2.5 shadow-[0_-10px_30px_rgba(0,0,0,.2)] outline-none"
        style={{ paddingBottom: "max(24px, env(safe-area-inset-bottom))" }}
      >
        <span aria-hidden className="h-[5px] w-10 shrink-0 rounded-full bg-neutral-200" />
        {children}
      </div>
    </div>
  );
}
