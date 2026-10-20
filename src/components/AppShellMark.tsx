"use client";

/**
 * 안드로이드 앱(TWA)으로 열린 첫 화면에서 '앱 안'을 이번 실행 동안 기억해 둔다(lib/app-shell).
 * 첫 화면이 요금제가 아니어도, 나중에 새로 고침해서 주소의 ?app=android 가 사라져도 요금제·결제 화면이 앱 안인 줄 알게.
 * 그리는 것은 없다.
 */
import { useAppShell } from "@/lib/app-shell-client";

export function AppShellMark() {
  useAppShell();
  return null;
}
