"use client";

import { useEffect, useState } from "react";

/**
 * 그리는 동안 화면이 저절로 꺼지지 않게 붙잡는다(Screen Wake Lock).
 *
 * 왜: 그림은 이 기기(브라우저)가 쪽마다 서버에 부탁해 받아 온다. 태블릿을 세워 두고 기다리면
 * 몇 분 뒤 화면이 저절로 꺼지고, 꺼진 화면에서는 브라우저가 멈춰 그리기가 멈춘다.
 * 켜 두는 동안만 붙잡고, 다른 앱으로 갔다 돌아오면(붙잡기가 풀린다) 다시 붙잡는다.
 *
 * 전원 단추로 직접 끄는 것까지는 막을 수 없다 — 그건 서버가 대신 그리는 방식이어야 한다.
 * 지원하지 않는 브라우저(옛 사파리 등)에서는 조용히 아무것도 하지 않는다.
 *
 * @returns 지금 화면을 붙잡고 있나 — 안내 문구를 고를 때 쓴다.
 */
export function useScreenWakeLock(active: boolean): boolean {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || sentinel || document.visibilityState !== "visible") return;
      try {
        const s = await navigator.wakeLock.request("screen");
        if (cancelled) {
          void s.release();
          return;
        }
        sentinel = s;
        setHeld(true);
        s.addEventListener("release", () => {
          sentinel = null;
          setHeld(false);
        });
      } catch {
        // 절전 모드·권한 정책 등으로 거절될 수 있다 — 그리기는 그대로 한다.
        setHeld(false);
      }
    };

    const onVisibility = () => void acquire();
    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release();
      sentinel = null;
    };
  }, [active]);

  return active && held;
}
