"use client";

/**
 * 관리실 공통 부품 — 토스풍 미니멀 (2026-09-16, 사장님 지시 "완전 토스풍 미니멀").
 *
 * 규칙 몇 개만 지키면 화면이 한 결로 보인다.
 *  · 바탕은 회색(#f2f4f6), 내용은 흰 카드. 테두리 대신 여백과 바탕색으로 나눈다.
 *  · 글자색은 세 단계뿐 — 본문 #191f28 · 설명 #6b7684 · 흐린 글 #8b95a1
 *  · 강조는 파랑 #3182f6 하나. 빨강(#f04452)은 위험한 일에만.
 *  · 숫자는 tabular-nums 로 자리를 맞춘다. 굵기는 600·700 만 쓴다.
 *  · 모서리는 카드 16px, 단추·입력 12px.
 *
 * 고객 화면(동화)에는 쓰지 않는다 — 관리실 전용이다.
 */
import type { ReactNode } from "react";

export const T = {
  bg: "#f2f4f6",
  card: "#ffffff",
  line: "#e5e8eb",
  text: "#191f28",
  sub: "#6b7684",
  faint: "#8b95a1",
  blue: "#3182f6",
  blueSoft: "#e8f3ff",
  red: "#f04452",
  redSoft: "#ffeff0",
  green: "#00b26f",
  greenSoft: "#e6f7ef",
  amber: "#ff9500",
  amberSoft: "#fff4e0",
} as const;

export function Card({
  children,
  className = "",
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
}) {
  return <Tag className={`rounded-2xl bg-white p-5 ${className}`}>{children}</Tag>;
}

export function CardTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <h2 className="text-[17px] font-bold tracking-tight text-[#191f28]">{children}</h2>
      {hint ? <span className="text-[13px] font-medium text-[#8b95a1]">{hint}</span> : null}
    </div>
  );
}

type ButtonTone = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_TONE: Record<ButtonTone, string> = {
  primary: "bg-[#3182f6] text-white hover:bg-[#1b64da] disabled:bg-[#b0c8f0]",
  secondary: "bg-[#f2f4f6] text-[#4e5968] hover:bg-[#e5e8eb] disabled:text-[#b0b8c1]",
  ghost: "bg-transparent text-[#6b7684] hover:bg-[#f2f4f6] disabled:text-[#b0b8c1]",
  danger: "bg-[#ffeff0] text-[#f04452] hover:bg-[#ffe0e2] disabled:text-[#f6a5ab]",
};

export function Button({
  children,
  onClick,
  tone = "secondary",
  size = "md",
  disabled,
  type = "button",
  full,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: ButtonTone;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  type?: "button" | "submit";
  full?: boolean;
  title?: string;
}) {
  const pad = size === "sm" ? "px-3 py-1.5 text-[13px]" : size === "lg" ? "px-5 py-3 text-[15px]" : "px-4 py-2.5 text-sm";
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl font-bold transition disabled:cursor-not-allowed ${pad} ${BUTTON_TONE[tone]} ${full ? "w-full" : ""}`}
    >
      {children}
    </button>
  );
}

/** 값 하나 — 라벨 · 큰 숫자 · 단위. 숫자는 자리를 맞춘다. */
export function Stat({
  label,
  value,
  unit,
  tone,
  hint,
}: {
  label: string;
  value: number | string | null | undefined;
  unit?: string;
  tone?: "default" | "red" | "amber" | "blue";
  hint?: string;
}) {
  const color =
    tone === "red" ? "text-[#f04452]" : tone === "amber" ? "text-[#ff9500]" : tone === "blue" ? "text-[#3182f6]" : "text-[#191f28]";
  return (
    <div className="flex flex-col gap-1 rounded-2xl bg-white px-5 py-4">
      <span className="text-[13px] font-medium text-[#8b95a1]">{label}</span>
      <span className={`text-2xl font-bold tabular-nums tracking-tight ${color}`}>
        {value ?? "–"}
        {unit ? <span className="ml-1 text-[13px] font-bold text-[#b0b8c1]">{unit}</span> : null}
      </span>
      {hint ? <span className="text-[12px] font-medium text-[#b0b8c1]">{hint}</span> : null}
    </div>
  );
}

/** 숫자 입력 — 라벨·단위·설명이 한 덩어리. 바뀌면 파란 테두리로 표시한다. */
export function NumberField({
  label,
  unit,
  help,
  value,
  original,
  onChange,
  disabled,
}: {
  label: string;
  unit: string;
  help?: string;
  value: number | "";
  original: number;
  onChange: (v: number | "") => void;
  disabled?: boolean;
}) {
  const changed = value !== "" && value !== original;
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-bold text-[#4e5968]">{label}</span>
      <span
        className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 ${
          changed ? "border-[#3182f6] bg-[#f4f9ff]" : "border-[#e5e8eb] bg-white"
        } ${disabled ? "opacity-60" : ""}`}
      >
        <input
          type="number"
          inputMode="numeric"
          disabled={disabled}
          value={value}
          onChange={(e) => {
            const next = e.target.value;
            onChange(next === "" ? "" : Math.max(0, Math.floor(Number(next) || 0)));
          }}
          className="w-full bg-transparent text-[15px] font-bold tabular-nums text-[#191f28] outline-none disabled:cursor-not-allowed"
        />
        <span className="shrink-0 text-[13px] font-medium text-[#8b95a1]">{unit}</span>
      </span>
      {help ? <span className="text-[12px] font-medium leading-relaxed text-[#8b95a1]">{help}</span> : null}
      {changed ? (
        <span className="text-[12px] font-bold text-[#3182f6]">
          {original} → {value}
        </span>
      ) : null}
    </label>
  );
}

export function Chip({
  children,
  tone = "gray",
  onClick,
  pressed,
}: {
  children: ReactNode;
  tone?: "gray" | "blue" | "red" | "green" | "amber";
  onClick?: () => void;
  pressed?: boolean;
}) {
  const tones = {
    gray: "bg-[#f2f4f6] text-[#4e5968]",
    blue: "bg-[#e8f3ff] text-[#1b64da]",
    red: "bg-[#ffeff0] text-[#f04452]",
    green: "bg-[#e6f7ef] text-[#00976b]",
    amber: "bg-[#fff4e0] text-[#c77700]",
  } as const;
  const base = `inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold ${tones[tone]}`;
  if (!onClick) return <span className={base}>{children}</span>;
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`${pressed ? "bg-[#191f28] text-white" : tones[tone]} inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-bold transition`}
    >
      {children}
    </button>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl bg-white px-6 py-12 text-center">
      <p className="text-[15px] font-bold text-[#4e5968]">{children}</p>
    </div>
  );
}

/** 오른쪽 아래에 잠깐 뜨는 알림. */
export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-[#191f28] px-4 py-3 text-sm font-bold text-white shadow-lg"
    >
      {message}
    </div>
  );
}

/** '3분 전' 같은 짧은 시각. */
export function when(iso: string | null | undefined, now: number): string {
  if (!iso) return "–";
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "–";
  const sec = Math.max(0, Math.round(((now || Date.now()) - at) / 1000));
  if (sec < 60) return "방금";
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`;
  const d = new Date(at);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}
