"use client";

import { useEffect } from "react";

/**
 * 팝업이 떠 있는 동안 ESC를 누르면 닫는다.
 * enabled를 false로 주면 잠시 끌 수 있다 (저장 중처럼 닫으면 안 되는 순간).
 */
export function useEscClose(onClose: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      // 길게 누른 자동 반복과 한글 IME 조합 취소는 무시한다.
      if (e.key !== "Escape" || e.repeat || e.isComposing) return;
      // 입력창에서 누른 ESC(IME 취소, 자동완성 닫기)는 팝업까지 닫지 않는다.
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable))
        return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, enabled]);
}
