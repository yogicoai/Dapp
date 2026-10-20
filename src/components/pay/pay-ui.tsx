"use client";

/**
 * 결제 시연 화면들이 같이 쓰는 조각 — 겉틀·시연 표시·카드·줄·링크 모양 큰 단추·안내 카드.
 * 모양은 앱에 있는 것(설정 카드, 가족 화면 BigButton·SoftButton, ConfirmSheet 합계 칸)을 그대로 따른다.
 * 색은 나라(테마) 색 — 나라를 바꾸면 결제 화면 색도 따라 바뀐다. 시연 표시만 늘 호박색(주의).
 *
 * 화면 이동은 링크(Link), 동작은 버튼으로 만든다. 앱 전체에 초점 스타일이 없어 여기서 FOCUS 를 붙인다.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { CheckIcon } from "@/components/family/icons";

export type PayColors = { accent: string; accentDark: string; accentSoft: string };

/** 키보드 초점 — 링크·카드형 라디오·체크 줄·'보기' 단추에 모두 붙인다. */
export const FOCUS =
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-neutral-800";

/** 진짜 input 을 sr-only 로 감싼 label(카드형 라디오)의 초점 */
export const FOCUS_WITHIN =
  "has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-neutral-800";

/* ─────────────────────────── 겉틀 ─────────────────────────── */

/**
 * 배경 그림 + 흰 덮개 + 가운데 본문(max-w-xl). demo 면 맨 위에 시연 표시가 붙는다(닫을 수 없음).
 * 아이폰 홈 화면 앱은 상태 표시줄이 반투명이라 위 안전 영역만큼 내려서 시작한다.
 */
export function PayShell({
  children,
  demo = false,
  bottomBar = false,
}: {
  children: ReactNode;
  demo?: boolean;
  /** 아래에 붙는 흰 바가 있으면 본문 아래 여백을 크게 */
  bottomBar?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <div className="relative min-h-dvh w-full" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={theme.background} alt="" className="fixed inset-0 -z-10 h-full w-full object-cover" />
      <div className="fixed inset-0 -z-10 bg-white/30" />
      {demo && <DemoBadge />}
      <main
        className={`mx-auto flex w-full max-w-xl flex-col gap-3 px-3 pt-3 sm:px-6 sm:pt-6 ${bottomBar ? "pb-40" : "pb-10"}`}
      >
        {children}
      </main>
    </div>
  );
}

/** '● 시연 화면 · 실제로 결제되지 않아요' — 스크롤해도 위에 붙어 있고, 노치 밑에 숨지 않는다. */
export function DemoBadge() {
  return (
    <div
      role="note"
      className="sticky z-40 mx-auto mt-2 flex w-fit items-center gap-1.5 rounded-full bg-amber-50/95 px-4 py-1.5 text-xs font-extrabold text-amber-800 shadow ring-1 ring-amber-200"
      style={{ top: "max(8px, env(safe-area-inset-top))" }}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      시연 화면 · 실제로 결제되지 않아요
    </div>
  );
}

/** [시연] 알약 — 결제 내역 줄·지금 쓰는 요금제 머리 */
export function DemoPill() {
  return (
    <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-extrabold text-amber-800 ring-1 ring-amber-200">
      시연
    </span>
  );
}

/** 회색 작은 알약 — '패스 전용' 같은 꼬리표 */
export function GrayPill({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-extrabold text-neutral-600">
      {children}
    </span>
  );
}

/** '초안' 알약 — 법률 확인 전 문구 */
export function DraftPill({ children = "초안" }: { children?: ReactNode }) {
  return (
    <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-extrabold text-amber-800">
      {children}
    </span>
  );
}

/* ─────────────────────────── 카드 · 줄 ─────────────────────────── */

export function Card({
  children,
  className = "",
  id,
  labelledBy,
  style,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  labelledBy?: string;
  style?: CSSProperties;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={`relative rounded-[28px] bg-white/90 p-5 shadow-xl backdrop-blur ${className}`}
      style={style}
    >
      {children}
    </section>
  );
}

/** 카드 머리 — 제목 + 오른쪽(알약 등) */
export function CardTitle({ id, children, right }: { id?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 id={id} className="break-keep text-[15px] font-extrabold text-neutral-800">
        {children}
      </h2>
      {right}
    </div>
  );
}

/** 안쪽 칸(ConfirmSheet 합계 칸 모양) — Row 들을 담는 dl */
export function InfoBox({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <dl className={`flex flex-col rounded-[20px] bg-stone-50 px-4 py-1 shadow-[inset_0_0_0_1px_#f0ede8] ${className}`}>
      {children}
    </dl>
  );
}

export function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-[42px] items-center justify-between gap-3 border-b border-stone-200/70 py-2 last:border-b-0">
      <dt className="shrink-0 text-[13px] font-bold text-neutral-500">{label}</dt>
      <dd className="min-w-0 break-keep text-right text-sm font-extrabold text-neutral-800">{children}</dd>
    </div>
  );
}

/** ✓ 포함 줄 — 체크는 에메랄드(ConfirmSheet 와 같음) */
export function CheckList({ items }: { items: readonly string[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((t) => (
        <li key={t} className="flex items-start gap-2 break-keep text-[14px] font-semibold leading-snug text-neutral-700">
          <span className="mt-0.5 shrink-0">
            <CheckIcon size={16} color="#047857" />
          </span>
          {t}
        </li>
      ))}
    </ul>
  );
}

/* ─────────────────────────── 링크 모양 큰 단추 ─────────────────────────── */

/** BigButton 과 같은 모양의 링크 — 나라 색 + 아래 그림자 */
export function BigLink({
  href,
  colors,
  children,
  className = "",
  replace,
}: {
  href: string;
  colors: PayColors;
  children: ReactNode;
  className?: string;
  replace?: boolean;
}) {
  return (
    <Link
      href={href}
      replace={replace}
      className={`flex min-h-[54px] w-full items-center justify-center gap-2 rounded-full px-5 text-center text-[19px] font-extrabold text-white transition active:translate-y-[3px] ${FOCUS} ${className}`}
      style={{ background: colors.accent, boxShadow: `0 6px 0 ${colors.accentDark}` }}
    >
      {children}
    </Link>
  );
}

/** SoftButton 과 같은 모양의 링크 — 흰 보조 */
export function SoftLink({
  href,
  children,
  className = "",
  replace,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  /** 결제 화면끼리 오갈 때 — 기록을 쌓지 않아 뒤로 가기가 결제 화면 사이를 맴돌지 않게 */
  replace?: boolean;
}) {
  return (
    <Link
      href={href}
      replace={replace}
      className={`flex min-h-[52px] w-full items-center justify-center gap-1.5 rounded-full border border-neutral-200 bg-white px-4 text-center text-[17px] font-extrabold text-neutral-700 shadow-[0_6px_0_rgba(0,0,0,.12)] transition active:translate-y-[3px] ${FOCUS} ${className}`}
    >
      {children}
    </Link>
  );
}

/** 잠긴 큰 단추 — aria-disabled 라 키보드·화면 읽기가 닿아 옆 설명을 읽을 수 있다. 눌러도 아무것도 안 한다. */
export function LockedButton({ children, describedBy }: { children: ReactNode; describedBy?: string }) {
  return (
    <button
      type="button"
      aria-disabled="true"
      aria-describedby={describedBy}
      onClick={(e) => e.preventDefault()}
      className={`flex min-h-[54px] w-full cursor-not-allowed items-center justify-center gap-2 rounded-full bg-neutral-200 px-5 text-[17px] font-extrabold text-neutral-500 ${FOCUS}`}
    >
      {children}
    </button>
  );
}

/**
 * ← 뒤로 — 앞 화면이 있으면 뒤로, 없으면(주소로 바로 연 탭) fallback 으로 **바꿔 들어간다**(replace).
 * push 로 앞 화면을 새로 쌓으면 /plans ↔ /checkout 사이를 뒤로 가기가 맴돈다 — 홈 화면 앱엔 브라우저 뒤로 단추도 없다.
 */
export function useGoBack(fallback: string): () => void {
  const router = useRouter();
  return () => {
    if (window.history.length > 1) router.back();
    else router.replace(fallback);
  };
}

/** 설정의 '← 돌아가기' 알약 — 앞 화면이 있으면 뒤로, 없으면 href 로 */
export function BackPill({ href, label = "돌아가기" }: { href: string; label?: string }) {
  const goBack = useGoBack(href);
  return (
    <button
      type="button"
      onClick={goBack}
      className={`min-h-11 w-fit rounded-full bg-white/70 px-4 text-sm font-bold text-neutral-700 backdrop-blur ${FOCUS}`}
    >
      ← {label}
    </button>
  );
}

/* ─────────────────────────── 상태 · 안내 ─────────────────────────── */

/** 완료(✓ 에메랄드) · 실패(! 호박) 원 */
export function StatusCircle({ tone }: { tone: "ok" | "warn" }) {
  return (
    <span
      aria-hidden
      className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full text-3xl font-black text-white shadow ${
        tone === "ok" ? "bg-emerald-500" : "bg-amber-400"
      }`}
    >
      {tone === "ok" ? <CheckIcon size={32} /> : "!"}
    </span>
  );
}

/** 남은 책을 책 모양 점으로 — 장식(aria-hidden), 뜻은 옆 숫자가 말한다. 12권이 넘으면 '+' */
export function BookDots({ n, color }: { n: number; color: string }) {
  const shown = Math.max(0, Math.min(n, 12));
  return (
    <span aria-hidden className="flex flex-wrap items-center gap-1">
      {Array.from({ length: shown }, (_, i) => (
        <span
          key={i}
          className="inline-block h-5 w-3.5 rounded-[3px] shadow-[inset_2px_0_0_rgba(255,255,255,.55)]"
          style={{ background: color }}
        />
      ))}
      {n > 12 && <span className="text-xs font-extrabold text-neutral-500">+</span>}
    </span>
  );
}

/** 가운데 정렬 안내 카드 — 제목 + 설명 + 단추들 */
export function NoticeCard({
  title,
  body,
  children,
  tone,
}: {
  title: string;
  body?: ReactNode;
  children?: ReactNode;
  tone?: "ok" | "warn";
}) {
  return (
    <Card className="flex flex-col items-center text-center">
      {tone && <StatusCircle tone={tone} />}
      <h1 className={`${tone ? "mt-3" : ""} break-keep text-[21px] font-extrabold text-neutral-800`}>{title}</h1>
      {body && <div className="mt-1.5 break-keep text-[13px] font-medium leading-relaxed text-neutral-500">{body}</div>}
      {children && <div className="mt-5 flex w-full flex-col gap-3">{children}</div>}
    </Card>
  );
}

/** 불러오는 동안 — 카드 모양 뼈대(시연 표시 없음) */
export function SkeletonCard() {
  return (
    <Card>
      <div aria-busy="true" aria-live="polite" className="flex flex-col gap-3 motion-safe:animate-pulse">
        <span className="sr-only">불러오고 있어요…</span>
        <span aria-hidden className="h-6 w-2/5 rounded-full bg-neutral-200" />
        <span aria-hidden className="h-4 w-4/5 rounded-full bg-neutral-100" />
        <span aria-hidden className="h-24 w-full rounded-[20px] bg-neutral-100" />
        <span aria-hidden className="h-12 w-full rounded-full bg-neutral-200" />
      </div>
    </Card>
  );
}

/** 스위치가 off 일 때 — 결제 경로가 모두 이 안내로 바뀐다 */
export function SoonCard({ colors, title = "결제는 곧 열려요" }: { colors: PayColors; title?: string }) {
  return (
    <NoticeCard
      title={title}
      body="가족 패스가 열리면 여기서 바로 시작할 수 있어요. 그동안 무료 동화를 들어 보세요."
    >
      <BigLink href="/plans" colors={colors} replace>
        요금제 다시 보기
      </BigLink>
      <SoftLink href="/">홈으로</SoftLink>
    </NoticeCard>
  );
}

/**
 * 로그인 안 한 분 — 로그인 뒤 원래 화면으로 돌아오는 기능이 없어 글로 길을 알려 준다.
 * then: 로그인한 뒤 찾아올 길 — 결제하기·완료는 '설정 › 요금제', 내 결제·구독은 '설정 › 내 결제·구독'.
 */
export function LoginCard({ colors, then = "설정 › 요금제" }: { colors: PayColors; then?: string }) {
  return (
    <NoticeCard
      title="먼저 로그인해 주세요"
      body={`가족 패스는 로그인한 계정에 이어져요. 로그인한 뒤 ${then}에서 이어서 할 수 있어요.`}
    >
      <BigLink href="/login" colors={colors}>
        로그인하기
      </BigLink>
      <SoftLink href="/plans" replace>
        요금제 다시 보기
      </SoftLink>
    </NoticeCard>
  );
}
