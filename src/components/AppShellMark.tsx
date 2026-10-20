"use client";

/**
 * 안드로이드 앱(TWA)으로 열린 첫 화면에서 '앱 안'을 이번 실행 동안 기억해 둔다(lib/app-shell).
 * 첫 화면이 요금제가 아니어도, 나중에 새로 고침해서 주소의 ?app=android 가 사라져도 요금제·결제 화면이 앱 안인 줄 알게.
 *
 * 앱 안에서는 페이지 바탕(html·body)을 어둡게 둔다(2026-10-20) — 앱은 화면 끝까지 쓰는 몰입 화면이라,
 * 화면 가장자리까지 그리지 않는 페이지에서는 카메라 구멍 쪽·아래 막대 자리에 바탕이 비친다. 흰 띠 대신
 * 안드로이드가 보통 칠하는 검은색이 보이게. 그 밖에 그리는 것은 없다.
 */
import { useEffect } from "react";
import { useAppShell } from "@/lib/app-shell-client";

const APP_BACKDROP = "#0a0a0a";

export function AppShellMark() {
  const shell = useAppShell();
  useEffect(() => {
    if (shell !== "android") return;
    document.documentElement.style.backgroundColor = APP_BACKDROP;
    document.body.style.backgroundColor = APP_BACKDROP;
  }, [shell]);
  return null;
}
