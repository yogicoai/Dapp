"use client";

/**
 * 가족 화면의 공통 조각 — 큰 버튼·칩·뒤로 버튼·단계 점·바닥 바.
 * 색은 나라(테마) 색을 style 로 받는다(Tailwind 로는 나라 색을 못 만든다).
 */

import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { Colors } from "./family-ui";
import { BackIcon, CookieIcon } from "./icons";

/** 큰 주 버튼 — 나라 색 + 아래 그림자(입체감) */
export function BigButton({
  colors,
  children,
  className = "",
  disabled,
  compact,
  tight,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  colors: Colors;
  compact?: boolean;
  /** 2열 칸처럼 좁은 자리 — 안쪽 여백을 줄이고 한 줄로(390px 폰에서 '마음에 들어요'가 꺾이지 않게) */
  tight?: boolean;
}) {
  const size = compact
    ? "min-h-12 px-3 text-base"
    : tight
      ? "min-h-[54px] whitespace-nowrap px-2 text-[17px]"
      : "min-h-[54px] px-5 text-[19px]";
  return (
    <button
      type="button"
      disabled={disabled}
      {...rest}
      className={`flex w-full items-center justify-center gap-2 rounded-full font-extrabold text-white transition active:translate-y-[3px] disabled:cursor-not-allowed disabled:active:translate-y-0 ${size} ${className}`}
      style={{
        background: disabled ? "#d4d4d4" : colors.accent,
        boxShadow: disabled ? "0 6px 0 #a3a3a3" : `0 6px 0 ${colors.accentDark}`,
      }}
    >
      {children}
    </button>
  );
}

/** 흰 보조 버튼 — '다시 그리기' 같은 둘째 선택 */
export function SoftButton({
  children,
  className = "",
  tight,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tight?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      className={`flex min-h-[52px] w-full items-center justify-center gap-1.5 rounded-full border border-neutral-200 bg-white font-extrabold text-neutral-700 shadow-[0_6px_0_rgba(0,0,0,.12)] transition active:translate-y-[3px] disabled:cursor-not-allowed disabled:opacity-50 ${
        tight ? "whitespace-nowrap px-2 text-base" : "px-4 text-[17px]"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * 고르기 칩 — 안 고름 회색, 고름 나라 색 바탕 흰 글씨. 한 줄 가로 스크롤 줄에도 들어가게
 * 글자가 꺾이지 않고(nowrap) 줄어들지 않는다(shrink-0).
 * swatch 는 색 칩(옷 색·머리 색) 앞의 작은 동그라미 — CSS background 값.
 */
export function Chip({
  on,
  colors,
  onClick,
  children,
  icon,
  swatch,
}: {
  on: boolean;
  colors: Colors;
  onClick: () => void;
  children: ReactNode;
  icon?: string;
  swatch?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      style={on ? { background: colors.accent } : undefined}
      className={`inline-flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-bold transition ${
        on ? "text-white shadow" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
      }`}
    >
      {icon && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={icon} alt="" aria-hidden className="h-5 w-5 object-contain" />
      )}
      {!icon && swatch && (
        <span
          aria-hidden
          className="h-4 w-4 shrink-0 rounded-full"
          style={{ background: swatch, boxShadow: on ? "0 0 0 1.5px #fff" : "inset 0 0 0 1px rgba(0,0,0,.18)" }}
        />
      )}
      {children}
    </button>
  );
}

/**
 * 켜기·끄기 줄 — 줄 전체가 스위치(role=switch)라 누르는 곳이 넓다(높이 56px). 글자가 곧 이름이고,
 * hint 는 한 줄 설명(화면 읽기도 같이 읽는다).
 */
export function SwitchRow({
  on,
  onChange,
  label,
  hint,
  colors,
  icon,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  label: string;
  hint?: string;
  colors: Colors;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex min-h-[56px] w-full items-center gap-3 rounded-2xl bg-neutral-50 px-3.5 py-2 text-left shadow-[inset_0_0_0_1px_#f0ede8] transition hover:bg-neutral-100"
    >
      {icon && <span className="flex h-8 w-8 shrink-0 items-center justify-center">{icon}</span>}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-extrabold text-neutral-800">{label}</span>
        {hint && <span className="break-keep text-xs font-semibold leading-snug text-neutral-500">{hint}</span>}
      </span>
      <span
        aria-hidden
        className="relative h-7 w-12 shrink-0 rounded-full transition-colors"
        style={{ background: on ? colors.accentDark : "#d4d4d4" }}
      >
        <span
          className="absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-[left] motion-reduce:transition-none"
          style={{ left: on ? 22 : 2 }}
        />
      </span>
    </button>
  );
}

export function BackButton({ onClick, label = "뒤로" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-700 transition hover:bg-neutral-200"
    >
      <BackIcon />
    </button>
  );
}

/** '● ○ ○ 1 / 3' */
export function StepDots({ at, of = 3, colors }: { at: number; of?: number; colors: Colors }) {
  return (
    <span className="flex items-center gap-1.5 text-xs font-extrabold text-neutral-500" aria-label={`${of}단계 중 ${at}단계`}>
      <span className="flex gap-1" aria-hidden>
        {Array.from({ length: of }, (_, i) => (
          <span key={i} className="h-[7px] w-[7px] rounded-full" style={{ background: i < at ? colors.accentDark : "#d4d4d4" }} />
        ))}
      </span>
      {at} / {of}
    </span>
  );
}

/** 위 줄 — 뒤로 · 제목 · 오른쪽(단계 점 등) */
export function TopBar({ onBack, title, right }: { onBack?: () => void; title: string; right?: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-2">
      {onBack ? <BackButton onClick={onBack} /> : <span className="w-11" />}
      <span className="min-w-0 truncate text-[15px] font-extrabold text-neutral-700">{title}</span>
      <span className="flex min-w-11 justify-end">{right}</span>
    </div>
  );
}

/** 화면 아래에 붙는 흰 바 — 카드 폭에 맞춘다 */
export function BottomBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center">
      <div
        className="flex w-full max-w-xl items-center gap-3 rounded-t-3xl bg-white px-4 pt-4 shadow-[0_-6px_20px_rgba(60,40,25,.10)]"
        style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
      >
        {children}
      </div>
    </div>
  );
}

/** '쿠키 2개' 알약 — 버튼 옆·안에 값 표시 */
export function CookiePill({ text, colors, className = "" }: { text: string; colors: Colors; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-white/95 py-[3px] pl-[5px] pr-2.5 text-xs font-extrabold ${className}`}
      style={{ color: colors.accentDark }}
    >
      <CookieIcon size={15} />
      {text}
    </span>
  );
}

/** 값 글자 — 0이면 '다시 그리기 1번 포함', 관리자면 '관리자 0개' */
export function costText(cost: number, master: boolean): string {
  if (master) return "관리자 0개";
  if (cost === 0) return "다시 그리기 1번 포함";
  return `쿠키 ${cost}개`;
}
