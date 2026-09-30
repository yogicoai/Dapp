"use client";

/**
 * 입력 부품 — 칸 묶음(Field) · 글자 칸 · 긴 글 칸 · 켜고 끄기 · 아래 저장 줄.
 * 글자는 15px(폰에서 확대되지 않는 최소 크기 16px 에 가깝게, 관리실은 확대를 허용한다), 모서리 12px.
 */
import { useLayoutEffect, useRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";

export function Field({
  label,
  help,
  error,
  required,
  children,
  htmlFor,
  counter,
}: {
  label: string;
  help?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  htmlFor: string;
  counter?: { value: number; max: number };
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-[13px] font-bold text-[#4e5968]">
          {label}
          {required ? <span className="ml-1 text-[#f04452]" aria-hidden>*</span> : null}
          {required ? <span className="sr-only"> (꼭 적어야 해요)</span> : null}
        </label>
        {counter ? (
          <span className={`text-[11px] font-medium tabular-nums ${counter.value > counter.max ? "text-[#f04452]" : "text-[#8b95a1]"}`}>
            {counter.value.toLocaleString("en-US")}/{counter.max.toLocaleString("en-US")}
          </span>
        ) : null}
      </div>
      {children}
      {error ? (
        <p role="alert" className="text-[12px] font-bold text-[#f04452]">
          {error}
        </p>
      ) : help ? (
        <p className="break-keep text-[12px] font-medium leading-relaxed text-[#8b95a1]">{help}</p>
      ) : null}
    </div>
  );
}

const INPUT =
  "w-full rounded-xl border bg-white px-3.5 text-[15px] font-medium text-[#191f28] outline-none placeholder:text-[#b0b8c1] focus:border-[#3182f6] disabled:cursor-not-allowed disabled:bg-[#f9fafb] disabled:text-[#8b95a1]";

export function TextInput({ invalid, className = "", ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      {...rest}
      aria-invalid={invalid || undefined}
      className={`${INPUT} h-11 ${invalid ? "border-[#f04452]" : "border-[#d1d6db]"} ${className}`}
    />
  );
}

/** 긴 글 칸 — 글이 늘면 칸도 늘어난다(안쪽 스크롤 대신). 값을 코드로 바꿔도(불러오기) 높이를 다시 잰다. */
export function TextArea({
  invalid,
  className = "",
  value,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      {...rest}
      ref={ref}
      value={value}
      aria-invalid={invalid || undefined}
      className={`${INPUT} resize-y py-2.5 leading-relaxed ${invalid ? "border-[#f04452]" : "border-[#d1d6db]"} ${className}`}
    />
  );
}

/** 켜고 끄기 — role="switch". 글자(label)를 함께 눌러도 바뀐다. */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="group inline-flex min-h-11 items-center gap-2.5 rounded-xl px-1 text-left disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span
        aria-hidden
        className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-[#3182f6]" : "bg-[#d1d6db]"
        }`}
      >
        <span
          className={`absolute h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`}
        />
      </span>
      <span className="flex flex-col">
        <span className="text-sm font-bold text-[#4e5968]">{label}</span>
        {description ? <span className="text-[12px] font-medium text-[#8b95a1]">{description}</span> : null}
      </span>
    </button>
  );
}

/**
 * 아래에 붙는 저장 줄 — 바꾼 것이 있을 때만 나온다. 폰 홈 막대(safe area) 위로 띄운다.
 * 옛 가격 화면(PricingSection)의 저장 줄을 여러 화면이 쓰게 일반화했다.
 */
export function SaveBar({
  visible,
  summary,
  onSave,
  onReset,
  busy,
  disabled,
  saveLabel = "저장하기",
}: {
  visible: boolean;
  summary: ReactNode;
  onSave: () => void;
  onReset: () => void;
  busy: boolean;
  disabled?: boolean;
  saveLabel?: string;
}) {
  if (!visible) return null;
  return (
    <div className="sticky bottom-0 z-20 -mx-4 mt-2 border-t border-[#e5e8eb] bg-white/95 px-4 py-3 pb-[calc(12px+env(safe-area-inset-bottom))] backdrop-blur lg:mx-0 lg:rounded-2xl lg:border-0 lg:shadow-[0_10px_30px_rgba(0,27,55,.10)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 text-[13px] font-medium text-[#4e5968]">{summary}</div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onReset}
            disabled={busy}
            className="min-h-11 rounded-xl bg-[#f2f4f6] px-4 text-sm font-bold text-[#4e5968] hover:bg-[#e5e8eb] disabled:opacity-50"
          >
            되돌리기
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={busy || disabled}
            className="min-h-11 rounded-xl bg-[#3182f6] px-5 text-sm font-bold text-white hover:bg-[#1b64da] disabled:cursor-not-allowed disabled:bg-[#b0c8f0]"
          >
            {busy ? "저장하는 중…" : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
