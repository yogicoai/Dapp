"use client";

/**
 * 사고(컴플레인) 화면 공용 색·작은 부품 — 옛 관리실(app/admin/page.tsx)에서 그대로 옮겼다(2026-09-30).
 * 의견·오류 화면(사고 목록)과 회원 화면(만들기 기록)이 같은 색·같은 이름표를 쓰게 한곳에 둔다.
 * 판단(종류 이름·색 등급)은 lib/admin.ts 순수 함수가 한다 — 여기는 색만 입힌다.
 */
import { kindInfo, type Severity, type StageState } from "@/lib/admin";

/* ── 색 ── 토스풍: 회색 바탕 · 흰 카드 · 파랑 하나. 빨강은 위험한 것에만. */
export const SEV_CHIP: Record<Severity, string> = {
  crit: "bg-[#ffeff0] text-[#f04452]",
  warn: "bg-[#fff4e0] text-[#c77700]",
  info: "bg-[#e8f3ff] text-[#1b64da]",
  ok: "bg-[#e6f7ef] text-[#00976b]",
  plain: "bg-[#f2f4f6] text-[#6b7684]",
};
export const SEV_BAR: Record<Severity, string> = {
  crit: "bg-[#f04452]",
  warn: "bg-[#ff9500]",
  info: "bg-[#3182f6]",
  ok: "bg-[#00b26f]",
  plain: "bg-[#e5e8eb]",
};
export const STAGE_STYLE: Record<StageState, { text: string; bar: string }> = {
  done: { text: "text-[#6b7684]", bar: "bg-[#00b26f]" },
  fail: { text: "text-[#f04452]", bar: "bg-[#f04452]" },
  stuck: {
    text: "text-[#c77700]",
    bar: "bg-[repeating-linear-gradient(90deg,#ff9500_0_6px,transparent_6px_10px)]",
  },
  "": { text: "text-[#b0b8c1]", bar: "bg-[#e5e8eb]" },
};

export function KindChip({ kind }: { kind: string }) {
  const k = kindInfo(kind);
  return (
    <span className={`whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-bold ${SEV_CHIP[k.sev]}`}>{k.label}</span>
  );
}

/** 토큰 결제 한 칸(대본·그림 값). '실제 결제(원)'와 헷갈리지 않게 늘 '토큰'을 붙인다. */
export function Money({ label, amount, refunded }: { label: string; amount: number | null; refunded: boolean }) {
  if (amount === null) return null;
  return (
    <span>
      {label}{" "}
      <b className={`tabular-nums ${refunded ? "text-[#00976b]" : "text-[#f04452]"}`}>{amount}토큰</b>
      {refunded && " · 환불함"}
    </span>
  );
}
