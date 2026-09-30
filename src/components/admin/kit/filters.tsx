"use client";

/**
 * 거르기 줄 — 검색칸 · 칩 고르기 · 기간 단추. 폰에서는 줄바꿈해서 페이지가 옆으로 밀리지 않게 한다.
 * 칩은 '하나만 고르기'라 radiogroup 이다(누르면 바로 바뀐다 — 따로 [적용] 단추가 없다).
 */
import { useId, type KeyboardEvent, type ReactNode } from "react";
import type { PeriodPreset } from "@/lib/admin-console";
import { Icon } from "./Icon";

export function FilterBar({
  children,
  onReset,
  resultText,
}: {
  children: ReactNode;
  onReset?: () => void;
  resultText?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
      {children}
      {(onReset || resultText) && (
        <div className="ml-auto flex items-center gap-2 text-[13px] font-medium text-[#8b95a1]">
          {resultText ? <span aria-live="polite">{resultText}</span> : null}
          {onReset ? (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex min-h-10 items-center rounded-lg px-2 font-bold text-[#6b7684] hover:bg-white"
            >
              거르기 풀기
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** 검색칸 — 40px, 오른쪽 × 로 지운다. onSubmit 이 있으면 Enter 로 부른다(없으면 칠 때마다 onChange 만). */
export function SearchInput({
  value,
  onChange,
  onSubmit,
  placeholder,
  label,
  maxLength = 64,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: (v: string) => void;
  placeholder: string;
  label: string;
  maxLength?: number;
}) {
  const id = useId();
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.(value);
      }}
      className="relative flex min-w-0 flex-1 basis-[220px] items-center sm:max-w-[320px]"
    >
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <span className="pointer-events-none absolute left-3 text-[#8b95a1]">
        <Icon name="search" size={16} />
      </span>
      <input
        id={id}
        type="search"
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-xl border border-[#d1d6db] bg-white pl-9 pr-9 text-sm font-medium text-[#191f28] outline-none placeholder:text-[#b0b8c1] focus:border-[#3182f6] [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          aria-label="검색어 지우기"
          onClick={() => {
            onChange("");
            onSubmit?.("");
          }}
          className="absolute right-1 inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#8b95a1] hover:bg-[#f2f4f6]"
        >
          <Icon name="close" size={16} />
        </button>
      ) : null}
    </form>
  );
}

/** 하나만 고르는 칩 묶음. 고른 칩은 진한 바탕(옛 Chip 의 눌림 모양과 같다). ←→ 로도 옮긴다. */
export function ChipGroup({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: string; label: string; count?: number | null }[];
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = options[(i + (e.key === "ArrowRight" ? 1 : options.length - 1)) % options.length];
    onChange(next.value);
    const el = e.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-chip="${CSS.escape(next.value)}"]`);
    el?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            data-chip={o.value}
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold transition-colors ${
              on ? "bg-[#191f28] text-white" : "bg-white text-[#4e5968] hover:bg-[#e8f3ff]"
            }`}
          >
            {o.label}
            {typeof o.count === "number" ? <span className="tabular-nums opacity-70">{o.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

const PERIOD_LABEL: Record<PeriodPreset, string> = { today: "오늘", "7d": "7일", "30d": "30일", all: "전체" };

/** 기간 — 정해 둔 넷만(날짜 고르기는 이번 범위 밖). 한국 날짜 0시 기준으로 끊는다(kstRange). */
export function PeriodSelect({ value, onChange }: { value: PeriodPreset; onChange: (v: PeriodPreset) => void }) {
  return (
    <ChipGroup
      label="기간"
      value={value}
      onChange={(v) => onChange(v as PeriodPreset)}
      options={(Object.keys(PERIOD_LABEL) as PeriodPreset[]).map((p) => ({ value: p, label: PERIOD_LABEL[p] }))}
    />
  );
}
