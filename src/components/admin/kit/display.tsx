"use client";

/**
 * 관리자 페이지 보여 주기 부품 — 제목줄·탭·숫자 카드·배지·알림 띠·빈 화면·오류·자리 표시·값 목록.
 *
 * 규칙(토스풍, 2026-09-16 사장님 지시): 회색 바탕 위 흰 카드, 강조는 파랑 하나, 빨강은 위험한 일에만.
 * 색만으로 뜻을 전하지 않는다 — 배지·띠는 늘 글자를 함께 쓴다. 이모지 대신 선 아이콘(Icon).
 * 색은 Tailwind 가 찾을 수 있게 class 에 글자 그대로 적는다(값 표는 tokens.ts).
 */
import Link from "next/link";
import { useContext, useEffect, useRef, useState, type ComponentProps, type KeyboardEvent, type ReactNode } from "react";
import { formatDateKo, formatWhenKo } from "@/lib/admin";
import { formatKstDateTime, formatWon, groupDigits } from "@/lib/admin-console";
import { AdminContext, useAdmin } from "../shell/AdminContext";
import { Icon, type IconName } from "./Icon";
import { BADGE_TONE, type BadgeTone } from "./tokens";

/* ── 제목줄 ─────────────────────────────────────────────────────────────── */

/** 화면마다 하나 — 문서의 h1 은 여기뿐이다. actions 는 폰에서 아래로 줄바꿈된다. */
export function PageHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="break-keep text-[22px] font-bold tracking-tight text-[#191f28]">{title}</h1>
        {description ? <p className="break-keep text-sm font-medium leading-relaxed text-[#6b7684]">{description}</p> : null}
        {meta ? <p className="text-[13px] font-medium text-[#8b95a1]">{meta}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/* ── 탭 ─────────────────────────────────────────────────────────────────── */

/**
 * 밑줄 탭. 폰에서는 옆으로 밀린다(페이지 전체가 옆으로 밀리지 않게 이 줄 안에서만).
 * 화살표 ←→ 로 옮겨 갈 수 있다. 탭 내용은 부르는 쪽이 hidden 으로 감춘다(쓰던 내용이 살아 있게).
 */
export function SectionTabs({
  tabs,
  value,
  onChange,
  label = "화면 나누기",
}: {
  tabs: { key: string; label: string; badge?: number | string | null; badgeTone?: BadgeTone }[];
  value: string;
  onChange: (k: string) => void;
  label?: string;
}) {
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    onChange(next.key);
    const el = e.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-tab="${CSS.escape(next.key)}"]`);
    el?.focus();
  };
  return (
    <div className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
      <div role="tablist" aria-label={label} className="flex min-w-max gap-1 border-b border-[#e5e8eb]">
        {tabs.map((t, i) => {
          const on = t.key === value;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              data-tab={t.key}
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(t.key)}
              onKeyDown={(e) => onKey(e, i)}
              className={`relative -mb-px inline-flex min-h-11 items-center gap-1.5 border-b-2 px-3 text-[15px] font-bold transition-colors ${
                on ? "border-[#191f28] text-[#191f28]" : "border-transparent text-[#8b95a1] hover:text-[#4e5968]"
              }`}
            >
              {t.label}
              {t.badge !== undefined && t.badge !== null && t.badge !== 0 && t.badge !== "" ? (
                <Badge tone={t.badgeTone ?? "gray"}>{t.badge}</Badge>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── 관리실 안 링크 ─────────────────────────────────────────────────────── */

/**
 * 관리실 화면 안에서 다른 관리실 화면으로 가는 링크 — next/link 에 '떠나기 되묻기'를 건 것.
 * 쓰던 답변·초안이나 도는 그림 옮기기가 있으면 겉틀이 먼저 묻는다(메뉴 링크와 같은 문).
 * 겉틀 밖(문지기 화면)에서는 그냥 링크다.
 */
export function AdminLink({ href, onClick, ...rest }: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const guard = useContext(AdminContext)?.guardNavigate;
  return (
    <Link
      href={href}
      {...rest}
      onClick={(e) => {
        onClick?.(e);
        guard?.(e, href);
      }}
    />
  );
}

/* ── 숫자 카드 ───────────────────────────────────────────────────────────── */

const STAT_TONE = {
  default: "text-[#191f28]",
  red: "text-[#f04452]",
  amber: "text-[#c77700]",
  blue: "text-[#3182f6]",
} as const;

/**
 * 숫자 하나. 값이 null 이면 '–'(못 읽은 것을 0 으로 속이지 않는다).
 * href 가 있으면 카드 전체가 링크다(대시보드 → 그 목록).
 */
export function StatCard({
  label,
  value,
  unit,
  sub,
  tone = "default",
  href,
  hint,
}: {
  label: string;
  value: number | string | null;
  unit?: string;
  sub?: ReactNode;
  tone?: keyof typeof STAT_TONE;
  href?: string;
  hint?: string;
}) {
  const body = (
    <>
      <span className="flex items-center justify-between gap-2 text-[13px] font-medium text-[#6b7684]">
        <span className="break-keep">{label}</span>
        {href ? <Icon name="chevron" size={16} className="text-[#b0b8c1]" /> : null}
      </span>
      <span className={`text-[26px] font-bold tabular-nums leading-tight tracking-tight ${STAT_TONE[tone]}`}>
        {value === null ? "–" : typeof value === "number" ? groupDigits(value) : value}
        {unit && value !== null ? <span className="ml-1 text-[13px] font-bold text-[#8b95a1]">{unit}</span> : null}
      </span>
      {sub ? <span className="text-[12px] font-medium text-[#8b95a1]">{sub}</span> : null}
      {hint ? <span className="text-[12px] font-medium text-[#b0b8c1]">{hint}</span> : null}
    </>
  );
  const cls = "flex min-w-0 flex-col gap-1 rounded-2xl bg-white px-5 py-4";
  if (href) {
    return (
      <AdminLink href={href} className={`${cls} transition-colors hover:bg-[#f9fafb] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#3182f6]`}>
        {body}
      </AdminLink>
    );
  }
  return <div className={cls}>{body}</div>;
}

/* ── 배지 ───────────────────────────────────────────────────────────────── */

export function Badge({ tone = "gray", children, title }: { tone?: BadgeTone; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-bold leading-[18px] ${BADGE_TONE[tone]}`}
    >
      {children}
    </span>
  );
}

/** 상태 배지 — 이름·색은 순수 함수(*StatusMeta)가 정한다. 화면마다 색이 달라지지 않게. */
export function StatusBadge({ meta }: { meta: { label: string; tone: BadgeTone } }) {
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

/* ── 알림 띠 ─────────────────────────────────────────────────────────────── */

const BANNER = {
  info: { box: "bg-[#f2f4f6] text-[#4e5968]", icon: "info" as IconName, ink: "text-[#6b7684]" },
  warn: { box: "bg-[#fff4e0] text-[#8a5a00]", icon: "alert" as IconName, ink: "text-[#c77700]" },
  danger: { box: "bg-[#ffeff0] text-[#b4232f]", icon: "alert" as IconName, ink: "text-[#f04452]" },
  demo: {
    box: "bg-[repeating-linear-gradient(135deg,#fff4e0_0_10px,#fffaf1_10px_20px)] text-[#8a5a00] ring-1 ring-inset ring-[#ffd89a]",
    icon: "info" as IconName,
    ink: "text-[#c77700]",
  },
} as const;

export function Banner({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: keyof typeof BANNER;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const b = BANNER[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`flex flex-wrap items-start justify-between gap-x-4 gap-y-2 rounded-2xl px-4 py-3.5 ${b.box}`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <span className={`mt-0.5 ${b.ink}`}>
          <Icon name={b.icon} size={20} />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="break-keep text-[15px] font-bold">{title}</p>
          {children ? <div className="break-keep text-[13px] font-medium leading-relaxed opacity-90">{children}</div> : null}
        </div>
      </div>
      {action ? <div className="flex shrink-0 items-center">{action}</div> : null}
    </div>
  );
}

/* ── 빈 화면 · 오류 · 자리 표시 ──────────────────────────────────────────── */

/** 비었을 때 — 왜 비었는지 한 문장을 꼭 쓴다("아직 결제가 없어요 · 결제 연동 뒤 여기 쌓여요"). */
export function EmptyState({
  title,
  body,
  icon = "inbox",
  action,
}: {
  title: string;
  body?: ReactNode;
  icon?: IconName;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl bg-white px-6 py-12 text-center">
      <span className="mb-1 text-[#b0b8c1]">
        <Icon name={icon} size={24} className="h-12 w-12" />
      </span>
      <p className="break-keep text-[15px] font-bold text-[#4e5968]">{title}</p>
      {body ? <div className="max-w-[440px] break-keep text-[13px] font-medium leading-relaxed text-[#8b95a1]">{body}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** 읽기 실패 — 빈 화면으로 두지 않고 [다시 시도]를 준다. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 rounded-2xl bg-white px-6 py-10 text-center">
      <span className="text-[#f04452]">
        <Icon name="alert" size={24} />
      </span>
      <p className="break-keep text-[15px] font-bold text-[#191f28]">읽지 못했어요</p>
      <p className="max-w-[480px] break-all text-[13px] font-medium leading-relaxed text-[#6b7684]">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-[#f2f4f6] px-4 text-sm font-bold text-[#4e5968] hover:bg-[#e5e8eb]"
        >
          <Icon name="refresh" size={16} />
          다시 시도
        </button>
      ) : null}
    </div>
  );
}

/** 읽는 중 자리 표시 — 움직임을 줄이라는 설정이면 깜빡이지 않는다. */
export function Skeleton({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden className={`flex flex-col gap-2.5 ${className}`}>
      {Array.from({ length: Math.max(1, lines) }, (_, i) => (
        <span
          key={i}
          className="block h-4 rounded-md bg-[#e5e8eb] motion-safe:animate-pulse"
          style={{ width: `${[92, 78, 64, 85, 70][i % 5]}%` }}
        />
      ))}
    </div>
  );
}

/** 화면 하나가 뜨기 전(주소 읽는 동안) — page.tsx 의 Suspense 대체 화면. */
export function PageSkeleton({ lines = 6 }: { lines?: number }) {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="화면을 여는 중">
      <span className="block h-7 w-40 rounded-lg bg-[#e5e8eb] motion-safe:animate-pulse" aria-hidden />
      <div className="rounded-2xl bg-white p-5">
        <Skeleton lines={lines} />
      </div>
    </div>
  );
}

/* ── 값 목록 · 복사 · 돈 · 시각 ──────────────────────────────────────────── */

/** 서랍 안 '이름 — 값' 목록. 긴 값은 줄바꿈되고, id 같은 값은 부르는 쪽이 mono 로 감싼다. */
export function KeyValue({ items, columns = 1 }: { items: [label: string, value: ReactNode][]; columns?: 1 | 2 }) {
  return (
    <dl className={`grid grid-cols-1 gap-x-6 gap-y-3 ${columns === 2 ? "sm:grid-cols-2" : ""}`}>
      {items.map(([label, value]) => (
        <div key={label} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-[12px] font-semibold text-[#8b95a1]">{label}</dt>
          <dd className="break-words text-sm font-medium text-[#191f28]">{value ?? "–"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 복사 단추 — 주문번호·id 를 고객 응대 창에 붙여 넣을 때. 클립보드가 막힌 브라우저면 조용히 알린다. */
export function CopyButton({ value, label = "복사" }: { value: string; label?: string }) {
  const [done, setDone] = useState<"ok" | "fail" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone("ok");
    } catch {
      setDone("fail");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(null), 1600);
  };
  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={`${label}: ${value}`}
      className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-[12px] font-bold text-[#6b7684] hover:bg-[#f2f4f6]"
    >
      <Icon name={done === "ok" ? "check" : "copy"} size={16} />
      <span aria-live="polite">{done === "ok" ? "복사했어요" : done === "fail" ? "복사 안 됨" : label}</span>
    </button>
  );
}

/** 원 — "12,900원". 값이 없으면 "–". */
export function Won({ value, muted }: { value: number | null; muted?: boolean }) {
  return <span className={`tabular-nums ${muted ? "text-[#8b95a1]" : ""}`}>{formatWon(value)}</span>;
}

/**
 * 시각 — relative('18분 전') · datetime('2026. 9. 30. 14:05') · date('2026-09-30').
 * 상대 시각은 겉틀 시계(clock)로 센다 — 그리는 중에 Date.now() 를 부르면 다시 그릴 때마다 글자가 바뀐다.
 * 마우스를 올리면 한국 시각 전체가 보인다.
 */
export function TimeText({ iso, mode = "relative" }: { iso: string | null | undefined; mode?: "relative" | "datetime" | "date" }) {
  const { clock } = useAdmin();
  if (!iso) return <span className="text-[#b0b8c1]">–</span>;
  const text = mode === "datetime" ? formatKstDateTime(iso) : mode === "date" ? formatDateKo(iso) : formatWhenKo(iso, clock);
  return (
    <time dateTime={iso} title={formatKstDateTime(iso)} className="tabular-nums">
      {text}
    </time>
  );
}
