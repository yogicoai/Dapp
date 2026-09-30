"use client";

/**
 * 관리자 페이지 겉틀 — 문지기 + 틀(왼쪽 메뉴 · 위 알약 줄 · 머리 · 알림 · 떠나기 되묻기).
 *
 * 문지기: 들어오자마자 GET /api/admin/me 를 한 번 부른다. 서버가 200 을 줄 때만 메뉴와 화면을 그린다.
 *  · 401 → 로그인 안내 · 403 → '관리자만 들어올 수 있는 곳이에요' · 연결 실패 → 다시 시도.
 *  · 그 전에는 화면(children)을 아예 만들지 않으므로 어떤 화면도 데이터를 부르지 않는다.
 *  · 막는 것은 이 화면이 아니라 서버(/api/admin/* 의 마스터 확인)와 DB 다. 여기는 안내일 뿐이다.
 *  · 스스로 다른 주소로 보내지 않는다(옛 관리실의 첫 화면 튕기기는 없앴다 — 왜 막혔는지 알려 준다).
 *
 * 틀: 앱 테마(동화 색)를 따르지 않고 늘 밝은 관리 색이다 — 겉틀이 자기 바탕·글자색을 직접 칠한다.
 * useSearchParams 를 쓰지 않는다(쓰면 틀 전체를 Suspense 로 감싸야 한다). 주소 칸은 화면들이 읽는다.
 */
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { activeNavKey, leaveDialogText, navItem, type AdminBadges, type AdminMe, type UnsavedEntry } from "@/lib/admin-console";
import { authedFetch } from "@/lib/supabase";
import { ConfirmDialog } from "../kit/overlay";
import { Icon } from "../kit/Icon";
import { AdminContext, UnsavedContext, type AdminCtx, type BadgeKey, type UnsavedRegistry } from "./AdminContext";
import { makeApi } from "./api";
import { BrandMark, SideNav, TopPills } from "./Nav";
import { NotAllowed, type GateState } from "./NotAllowed";

const NO_BADGES: AdminBadges = { incidents: null, paidNotSaved: null, feedback: null };
/** 배지를 다시 세는 간격의 최소값 — 처리할 때마다 무거운 사고 함수를 부르지 않게. */
const BADGE_MIN_MS = 20_000;

type Toast = { msg: string; tone: "info" | "error" } | null;

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [gate, setGate] = useState<GateState | "ok">("checking");
  const [me, setMe] = useState<AdminMe | null>(null);

  /** 서버에 '누구로 들어왔나'를 묻는다. HTTP 상태만 돌려준다(0 = 연결 실패). */
  const checkMe = useCallback(async (): Promise<number> => {
    try {
      const res = await authedFetch("/api/admin/me", { cache: "no-store" });
      if (!res.ok) return res.status;
      const j = (await res.json()) as AdminMe;
      setMe({ username: String(j.username ?? ""), canEditCompany: j.canEditCompany === true });
      return 200;
    } catch {
      return 0;
    }
  }, []);

  /** 화면이 부른 서버 경로가 401·403 을 주면 세션을 다시 확인한다. me 가 되면 그 일만 막힌 것 — 문은 그대로 둔다. */
  const onAuthError = useCallback(async () => {
    const st = await checkMe();
    if (st === 401) setGate("login");
    else if (st === 403) setGate("forbidden");
  }, [checkMe]);
  const api = useMemo(() => makeApi(onAuthError), [onAuthError]);

  /* ── 알림 ── */
  const [toast, setToast] = useState<Toast>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = useCallback((msg: string, tone: "info" | "error" = "info") => {
    setToast({ msg, tone });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  /* ── 시계 — '18분 전'을 셀 기준. 그리는 중에 Date.now() 를 부르지 않으려고 상태로 든다. ── */
  const [clock, setClock] = useState(0);
  const touchClock = useCallback(() => setClock(Date.now()), []);

  /* ── 메뉴 배지 ── */
  const [badges, setBadges] = useState<AdminBadges>(NO_BADGES);
  const lastBadge = useRef(0);
  const badgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchBadges = useCallback(async () => {
    lastBadge.current = Date.now();
    const r = await api<AdminBadges>("/api/admin/badges");
    if (r.ok) setBadges(r.data);
  }, [api]);
  const refreshBadges = useCallback(() => {
    const wait = BADGE_MIN_MS - (Date.now() - lastBadge.current);
    if (wait <= 0) {
      void fetchBadges();
      return;
    }
    // 20초 안에 또 불리면 한 번만 미뤄서 부른다 — 처리 직후의 숫자를 놓치지 않게.
    if (badgeTimer.current) return;
    badgeTimer.current = setTimeout(() => {
      badgeTimer.current = null;
      void fetchBadges();
    }, wait);
  }, [fetchBadges]);
  const setBadge = useCallback((k: BadgeKey, n: number) => setBadges((b) => (b[k] === n ? b : { ...b, [k]: n })), []);

  /* ── 방금 한 환불(창을 연 동안만) ── */
  const [recentRefunds, setRecentRefunds] = useState<ReadonlyMap<string, { by: string; note: string }>>(new Map());
  const rememberRefund = useCallback(
    (entry: string, v: { by: string; note: string }) => setRecentRefunds((m) => new Map(m).set(entry, v)),
    [],
  );

  /* ── 들어오기: 서버에 한 번 확인 ── */
  const enter = useCallback(async () => {
    const st = await checkMe();
    if (st === 200) {
      setClock(Date.now());
      setGate("ok");
      void fetchBadges();
    } else setGate(st === 401 ? "login" : st === 403 ? "forbidden" : "error");
  }, [checkMe, fetchBadges]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (alive) await enter();
    })();
    return () => {
      alive = false;
    };
  }, [enter]);

  // 1분마다 시계를 옮긴다 — 가만히 둬도 '방금'이 '3분 전'으로 바뀌게.
  useEffect(() => {
    if (gate !== "ok") return;
    const t = setInterval(() => setClock(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [gate]);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (badgeTimer.current) clearTimeout(badgeTimer.current);
    },
    [],
  );

  /* ── 저장 안 한 내용 ── */
  const unsaved = useRef(new Map<string, { dirty: boolean; label: string; note?: string }>());
  const [dirtyEntries, setDirtyEntries] = useState<UnsavedEntry[]>([]);
  const registry = useMemo<UnsavedRegistry>(() => {
    const sync = () => {
      const next = [...unsaved.current.values()].filter((e) => e.dirty).map((e) => ({ label: e.label, note: e.note ?? null }));
      setDirtyEntries((prev) =>
        prev.length === next.length && prev.every((p, i) => p.label === next[i].label && p.note === next[i].note) ? prev : next,
      );
    };
    return {
      set(id, entry) {
        unsaved.current.set(id, entry);
        sync();
      },
      remove(id) {
        unsaved.current.delete(id);
        sync();
      },
    };
  }, []);
  const dirty = dirtyEntries.length > 0;

  // 창을 닫거나 새로 고치면 브라우저가 한 번 더 묻는다.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  /**
   * 메뉴·'사이트로'·화면 안 AdminLink — 저장 안 한 내용이 있으면 멈추고 묻는다. 새 탭 열기(⌘·Ctrl·가운데 단추)는 막지 않는다.
   * 화면들도 useAdmin().guardNavigate 로 같은 문을 쓴다.
   */
  const onNavigate = useCallback(
    (e: MouseEvent<HTMLAnchorElement>, href: string) => {
      if (!dirty) return;
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      setLeaveTo(href);
    },
    [dirty],
  );

  const ctx = useMemo<AdminCtx>(
    () => ({
      me: me ?? { username: "", canEditCompany: false },
      api,
      say,
      clock,
      touchClock,
      badges,
      setBadge,
      refreshBadges,
      recentRefunds,
      rememberRefund,
      guardNavigate: onNavigate,
    }),
    [me, api, say, clock, touchClock, badges, setBadge, refreshBadges, recentRefunds, rememberRefund, onNavigate],
  );

  if (gate !== "ok" || !me) {
    return (
      <NotAllowed
        state={gate === "ok" ? "checking" : gate}
        onRetry={() => {
          setGate("checking");
          void enter();
        }}
      />
    );
  }

  const active = activeNavKey(pathname);
  const pageLabel = active ? navItem(active).label : "관리";
  const initial = (me.username || "?").slice(0, 1).toUpperCase();

  return (
    <AdminContext.Provider value={ctx}>
      <UnsavedContext.Provider value={registry}>
        {/* 포커스 고리는 관리실 전체에 같은 모양(파랑 3px) — 키보드로 다닐 때 어디 있는지 보이게. */}
        <div className="flex min-h-dvh w-full flex-1 bg-[#f2f4f6] text-[14px] font-medium text-[#191f28] [&_:focus-visible]:outline-[3px] [&_:focus-visible]:outline-offset-2 [&_:focus-visible]:outline-[#3182f6] [&_:focus-visible]:outline-solid">
          <a
            href="#admin-main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-xl focus:bg-white focus:px-4 focus:py-2 focus:font-bold"
          >
            본문으로 건너뛰기
          </a>
          <SideNav pathname={pathname} badges={badges} onNavigate={onNavigate} />
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-30 flex h-[52px] items-center justify-between gap-3 border-b border-[#e5e8eb] bg-white px-4 lg:h-14 lg:px-8">
              <Link href="/admin" onClick={(e) => onNavigate(e, "/admin")} className="flex items-center gap-2 lg:hidden">
                <BrandMark />
                <span className="text-[15px] font-bold tracking-tight">관리</span>
              </Link>
              <p className="hidden truncate text-[15px] font-bold text-[#191f28] lg:block">{pageLabel}</p>
              <div className="flex items-center gap-2">
                <Link
                  href="/"
                  onClick={(e) => onNavigate(e, "/")}
                  aria-label="사이트로"
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-bold text-[#6b7684] hover:bg-[#f2f4f6]"
                >
                  <span className="hidden sm:inline">사이트로</span>
                  <Icon name="external" size={16} />
                </Link>
                <span className="inline-flex items-center gap-2 rounded-full bg-[#f2f4f6] py-1 pl-1 pr-3" title="지금 들어온 계정">
                  <span
                    aria-hidden
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white text-[13px] font-bold text-[#4e5968]"
                  >
                    {initial}
                  </span>
                  <span className="max-w-[120px] truncate text-[13px] font-bold text-[#4e5968]">{me.username}</span>
                </span>
              </div>
            </header>
            <TopPills pathname={pathname} badges={badges} onNavigate={onNavigate} />
            <main
              id="admin-main"
              tabIndex={-1}
              className="mx-auto flex w-full min-w-0 max-w-[1200px] flex-1 flex-col gap-6 px-4 pb-24 pt-5 lg:px-8 lg:pb-16 lg:pt-8"
            >
              {children}
            </main>
          </div>

          <div
            role="status"
            aria-live="polite"
            className={`pointer-events-none fixed bottom-[calc(20px+env(safe-area-inset-bottom))] left-1/2 z-[60] max-w-[calc(100%-32px)] -translate-x-1/2 rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-lg transition-opacity ${
              toast?.tone === "error" ? "bg-[#f04452]" : "bg-[#191f28]"
            } ${toast ? "opacity-100" : "opacity-0"}`}
          >
            {toast?.msg}
          </div>

          {leaveTo !== null && (
            <ConfirmDialog
              title={leaveDialogText(dirtyEntries).title}
              body={leaveDialogText(dirtyEntries).body}
              confirmLabel="떠나기"
              cancelLabel="머무르기"
              tone="danger"
              busy={false}
              onCancel={() => setLeaveTo(null)}
              onConfirm={() => {
                const href = leaveTo;
                setLeaveTo(null);
                router.push(href);
              }}
            />
          )}
        </div>
      </UnsavedContext.Provider>
    </AdminContext.Provider>
  );
}
