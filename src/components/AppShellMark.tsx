"use client";

/**
 * 안드로이드 앱(TWA)으로 열린 첫 화면에서 '앱 안'을 이번 실행 동안 기억해 둔다(lib/app-shell).
 * 첫 화면이 요금제가 아니어도, 나중에 새로 고침해서 주소의 ?app=android 가 사라져도 요금제·결제 화면이 앱 안인 줄 알게.
 *
 * 앱 안에서만 하는 일(2026-10-20~21 — 시험판은 화면 끝까지 쓰는 몰입 화면):
 *  · 모든 화면을 가장자리(카메라 구멍·아래 막대 자리)까지 그린다(viewport-fit=cover). 서버가 내보내는 viewport 는 기기를 모르므로
 *    앱 안일 때 여기서 덧붙인다 — 화면을 옮기면 Next 가 다시 써서 그때마다 붙인다. 아이폰 등 다른 기기에는 붙이지 않는다.
 *  · 처음 누를 때 전체화면을 켠다 — 크롬은 전체화면일 때만 cover 페이지를 카메라 구멍 아래까지 그린다(사장님 10-21 "아이폰처럼
 *    카메라 주변까지 꽉"). 전체화면은 누른 그 순간에만 켤 수 있어 누를 때마다 확인하고(이미 켜져 있으면 아무것도 안 한다),
 *    뒤로 가기 등으로 풀려도 다음에 누르면 다시 켜진다. 동화의 '원래대로'는 앱 안에서 전체화면을 풀지 않는다(lib/story-mode).
 *  · 페이지 바탕(캔버스)을 어둡게 — **body 에만** 칠한다. html 에 칠하면 body 바탕이 캔버스로 올라가지 않고 body 칸에 칠해져
 *    화면들의 -z-10 배경 그림을 덮는다(홈이 새까매졌다 — 10-20 겪음).
 */
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAppShell } from "@/lib/app-shell-client";
import { keepAppFullscreen, requestAppFullscreen } from "@/lib/story-mode";

const APP_BACKDROP = "#0a0a0a";

function coverViewport(): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (meta && !meta.content.includes("viewport-fit")) meta.content = `${meta.content}, viewport-fit=cover`;
}

export function AppShellMark() {
  const shell = useAppShell();
  const pathname = usePathname();
  useEffect(() => {
    if (shell !== "android") return;
    document.body.style.backgroundColor = APP_BACKDROP;
    coverViewport();
  }, [shell, pathname]);

  useEffect(() => {
    if (shell !== "android") return;
    keepAppFullscreen(true);
    // 누른 순간(사용자 동작)이어야 전체화면이 켜진다 — 먼저 받으려고 capture 로 단다.
    const onTap = () => requestAppFullscreen();
    window.addEventListener("touchend", onTap, true);
    window.addEventListener("click", onTap, true);
    return () => {
      window.removeEventListener("touchend", onTap, true);
      window.removeEventListener("click", onTap, true);
    };
  }, [shell]);
  return null;
}
