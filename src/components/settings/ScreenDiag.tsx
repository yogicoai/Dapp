"use client";

/**
 * 화면 진단(관리자에게만, 설정 화면) — 앱(안드로이드)에서 카메라 자리까지 그려지는지 사장님 폰의 실제 값을 읽는다(2026-10-21).
 * 전체화면이 켜졌는지 · 안전 영역(카메라·막대 자리) 값 · viewport-fit · 화면/창 크기를 1초마다 보여 준다.
 * 전체화면이 '예'인데 안전 영역이 모두 0 이면 크롬이 그 자리를 웹에 내주지 않는 것이다.
 */
import { useEffect, useState } from "react";
import { useAppShell } from "@/lib/app-shell-client";

type Diag = {
  fullscreen: boolean;
  displayMode: string;
  insets: string;
  viewportFit: string;
  inner: string;
  screen: string;
  orientation: string;
};

function readInsets(): string {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top,0px);padding-right:env(safe-area-inset-right,0px);padding-bottom:env(safe-area-inset-bottom,0px);padding-left:env(safe-area-inset-left,0px)";
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const v = `위 ${cs.paddingTop} · 오른쪽 ${cs.paddingRight} · 아래 ${cs.paddingBottom} · 왼쪽 ${cs.paddingLeft}`;
  probe.remove();
  return v;
}

function read(): Diag {
  const modes = ["fullscreen", "standalone", "minimal-ui", "browser"];
  const displayMode = modes.find((m) => window.matchMedia(`(display-mode: ${m})`).matches) ?? "?";
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')?.content ?? "";
  return {
    fullscreen: Boolean(document.fullscreenElement),
    displayMode,
    insets: readInsets(),
    viewportFit: /viewport-fit=cover/.test(meta) ? "cover" : "없음",
    inner: `${window.innerWidth}×${window.innerHeight}`,
    screen: `${screen.width}×${screen.height} (배율 ${window.devicePixelRatio})`,
    orientation: screen.orientation?.type ?? "?",
  };
}

export function ScreenDiag() {
  const shell = useAppShell();
  const [d, setD] = useState<Diag | null>(null);
  useEffect(() => {
    const tick = () => setD(read());
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, []);
  if (!d) return null;
  const rows: [string, string][] = [
    ["앱 안", shell === "android" ? "예" : "아니오(웹)"],
    ["전체화면", d.fullscreen ? "예" : "아니오 — 화면을 한 번 눌러 보세요"],
    ["화면 방식", d.displayMode],
    ["가장자리까지 그리기", d.viewportFit],
    ["안전 영역", d.insets],
    ["창 크기", d.inner],
    ["화면 크기", d.screen],
    ["방향", d.orientation],
  ];
  return (
    <div className="rounded-2xl bg-neutral-50 px-4 py-3 text-xs shadow-[inset_0_0_0_1px_#f0ede8]">
      <p className="mb-1.5 font-extrabold text-neutral-700">화면 진단 (관리자만 보여요)</p>
      <dl className="flex flex-col gap-0.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="shrink-0 font-bold text-neutral-500">{k}</dt>
            <dd className="break-all text-right font-extrabold text-neutral-800">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
