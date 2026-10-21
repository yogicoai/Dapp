"use client";

/**
 * 안드로이드 앱(TWA)으로 열린 첫 화면에서 '앱 안'을 이번 실행 동안 기억해 둔다(lib/app-shell).
 * 첫 화면이 요금제가 아니어도, 나중에 새로 고침해서 주소의 ?app=android 가 사라져도 요금제·결제 화면이 앱 안인 줄 알게.
 *
 * 앱 안에서만 하는 일(2026-10-20~21 — 시험판은 화면 끝까지 쓰는 몰입 화면, 6판부터 크롬이 카메라 구멍 자리까지 그린다):
 *  · 모든 화면을 가장자리(카메라 구멍 자리)까지 그린다(viewport-fit=cover). 서버가 내보내는 viewport 는 기기를 모르므로
 *    앱 안일 때 여기서 덧붙인다 — 화면을 옮기면 Next 가 다시 써서 그때마다 붙인다. 아이폰 등 다른 기기에는 붙이지 않는다.
 *  · <html data-app-shell="android"> — 검은 바탕·카메라 구멍 비키기는 globals.css 가 이걸 보고 한다. 보통은 첫 그림 전
 *    스크립트(lib/app-shell APP_SHELL_BOOT_SCRIPT)가 이미 달아 두었고, 여기서는 빠졌을 때만 채운다.
 */
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAppShell } from "@/lib/app-shell-client";

function coverViewport(): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (meta && !meta.content.includes("viewport-fit")) meta.content = `${meta.content}, viewport-fit=cover`;
}

export function AppShellMark() {
  const shell = useAppShell();
  const pathname = usePathname();
  useEffect(() => {
    if (shell !== "android") return;
    document.documentElement.dataset.appShell = "android";
    coverViewport();
  }, [shell, pathname]);
  return null;
}
