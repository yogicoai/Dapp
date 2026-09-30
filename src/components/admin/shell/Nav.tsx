"use client";

/**
 * 관리자 페이지 메뉴 — 넓은 화면(1024px 이상)은 왼쪽 메뉴, 그보다 좁으면 위쪽 알약 줄.
 *
 * 메뉴 목록은 lib/admin-console.ts 의 ADMIN_NAV 하나에서 온다(주소를 바꾸면 그 파일과 page.tsx 를 함께).
 * 링크를 누를 때 저장 안 한 내용이 있으면 겉틀이 먼저 묻는다(onNavigate 가 막고 되묻기 창을 연다).
 * 지금 화면은 aria-current="page" 로 알린다 — 색만으로 알리지 않는다(굵기·바탕도 바뀐다).
 */
import Link from "next/link";
import type { MouseEvent } from "react";
import { ADMIN_NAV, ADMIN_NAV_GROUPS, activeNavKey, type AdminBadges, type AdminNavItem } from "@/lib/admin-console";
import { Icon } from "../kit/Icon";

export type NavigateGuard = (e: MouseEvent<HTMLAnchorElement>, href: string) => void;

/** 의견·오류 옆 숫자 — 열린 사고 + 남은 의견. '돈 냈는데 책 없음'이 있으면 빨강. 둘 다 못 읽었으면 감춘다. */
function supportBadge(b: AdminBadges): { n: number; urgent: boolean } | null {
  if (b.incidents === null && b.feedback === null) return null;
  const n = (b.incidents ?? 0) + (b.feedback ?? 0);
  if (n <= 0) return null;
  return { n, urgent: (b.paidNotSaved ?? 0) > 0 };
}

function ItemExtra({ item, badges }: { item: AdminNavItem; badges: AdminBadges }) {
  if (item.key === "support") {
    const s = supportBadge(badges);
    if (!s) return null;
    return (
      <span
        className={`ml-auto rounded-full px-1.5 text-[11px] font-bold leading-[18px] tabular-nums ${
          s.urgent ? "bg-[#f04452] text-white" : "bg-[#e8f3ff] text-[#1b64da]"
        }`}
      >
        {s.n}
        <span className="sr-only">건 {s.urgent ? "(돈 냈는데 책 없음 포함)" : ""}</span>
      </span>
    );
  }
  if (item.tag) {
    return (
      <span className="ml-auto rounded-full bg-[#f2f4f6] px-1.5 text-[11px] font-bold leading-[18px] text-[#8b95a1]">
        {item.tag}
      </span>
    );
  }
  return null;
}

/** 로고 네모 — 관리실에서 앱 색(주황)이 쓰이는 유일한 자리. */
export function BrandMark() {
  return (
    <span
      aria-hidden
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#fff7e6] text-[14px] font-extrabold text-[#f59e0b]"
    >
      동
    </span>
  );
}

export function SideNav({
  pathname,
  badges,
  onNavigate,
}: {
  pathname: string | null;
  badges: AdminBadges;
  onNavigate: NavigateGuard;
}) {
  const active = activeNavKey(pathname);
  return (
    <nav
      aria-label="관리 메뉴"
      className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col overflow-y-auto border-r border-[#e5e8eb] bg-white px-3 py-5 lg:flex"
    >
      <Link
        href="/admin"
        onClick={(e) => onNavigate(e, "/admin")}
        className="mb-2 flex items-center gap-2.5 rounded-xl px-3 py-2"
      >
        <BrandMark />
        <span className="text-[15px] font-bold tracking-tight text-[#191f28]">보이스 동화 관리</span>
      </Link>
      {ADMIN_NAV_GROUPS.map((g) => (
        <div key={g} className="mt-5 flex flex-col gap-0.5">
          <p className="px-3 pb-1 text-[12px] font-semibold text-[#8b95a1]">{g}</p>
          {ADMIN_NAV.filter((n) => n.group === g).map((n) => {
            const on = active === n.key;
            return (
              <Link
                key={n.key}
                href={n.href}
                aria-current={on ? "page" : undefined}
                onClick={(e) => onNavigate(e, n.href)}
                className={`flex h-10 items-center gap-2.5 rounded-xl px-3 text-[15px] transition-colors ${
                  on ? "bg-[#e8f3ff] font-bold text-[#1b64da]" : "font-semibold text-[#4e5968] hover:bg-[#f2f4f6]"
                }`}
              >
                <Icon name={n.icon} size={20} className={on ? "text-[#3182f6]" : "text-[#8b95a1]"} />
                <span className="truncate">{n.label}</span>
                <ItemExtra item={n} badges={badges} />
              </Link>
            );
          })}
        </div>
      ))}
      <div className="mt-auto border-t border-[#e5e8eb] pt-3">
        <Link
          href="/"
          onClick={(e) => onNavigate(e, "/")}
          className="flex h-10 items-center gap-2.5 rounded-xl px-3 text-[15px] font-semibold text-[#6b7684] hover:bg-[#f2f4f6]"
        >
          <Icon name="external" size={20} className="text-[#8b95a1]" />
          사이트로
        </Link>
      </div>
    </nav>
  );
}

/** 좁은 화면 — 머리 아래 붙는 알약 줄. 줄 안에서만 옆으로 밀린다(페이지는 밀리지 않는다). */
export function TopPills({
  pathname,
  badges,
  onNavigate,
}: {
  pathname: string | null;
  badges: AdminBadges;
  onNavigate: NavigateGuard;
}) {
  const active = activeNavKey(pathname);
  return (
    <nav aria-label="관리 메뉴" className="sticky top-[52px] z-20 border-b border-[#e5e8eb] bg-white/95 backdrop-blur lg:hidden">
      <ul className="flex gap-1.5 overflow-x-auto px-4 py-2 [scrollbar-width:none]">
        {ADMIN_NAV.map((n) => {
          const on = active === n.key;
          const s = n.key === "support" ? supportBadge(badges) : null;
          return (
            <li key={n.key} className="shrink-0">
              <Link
                href={n.href}
                aria-current={on ? "page" : undefined}
                onClick={(e) => onNavigate(e, n.href)}
                className={`inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-bold transition-colors ${
                  on ? "bg-[#191f28] text-white" : "bg-[#f2f4f6] text-[#4e5968]"
                }`}
              >
                {n.label}
                {s ? (
                  <span
                    className={`rounded-full px-1.5 text-[11px] leading-[16px] tabular-nums ${
                      s.urgent ? "bg-[#f04452] text-white" : on ? "bg-white/20 text-white" : "bg-[#e8f3ff] text-[#1b64da]"
                    }`}
                  >
                    {s.n}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
