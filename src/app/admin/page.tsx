"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  countKinds,
  formatDateKo,
  formatWhenKo,
  kindInfo,
  minutesSince,
  parseGrantAmount,
  parseRefundNote,
  parseUsername,
  refundLabel,
  restoreCheck,
  rowSeverity,
  sortIncidents,
  STAGES,
  stageStates,
  statusLabel,
  withRecentRefund,
  type CustomerResponse,
  type IncidentListRow,
  type IncidentsResponse,
  type JobDetail,
  type Payment,
  type Severity,
  type StageState,
} from "@/lib/admin";
import { loadSession } from "@/lib/auth";
import { authedFetch } from "@/lib/supabase";
import { useEscClose } from "@/lib/use-esc-close";
import { FeedbackSection } from "@/components/admin/FeedbackSection";
import { PricingSection } from "@/components/admin/PricingSection";

/**
 * 보이스 동화 관리실 — 마스터(yogico·fe)가 "토큰은 나갔는데 책이 없어요" 컴플레인을 처리하는 곳.
 *
 * 이 화면은 보안이 아니다. 로그인 세션이 브라우저에 있어서 서버 페이지는 누가 왔는지 모르고,
 * 그래서 이 페이지는 데이터 없이 뜬 뒤 마스터가 아니면 첫 화면으로 돌려보낼 뿐이다.
 * 실제로 막는 것은 /api/admin/* 서버 경로(마스터 확인)와 DB 함수·RLS 다.
 *
 * 판단(종류 이름·색, 단계, 시각, 되살리기 막힘)은 src/lib/admin.ts 순수 함수에 있다.
 *
 * 2026-09-16 — 사장님 지시로 **토스풍 미니멀 + 왼쪽 메뉴**로 바꿨다(관리실만. 동화 화면은 그대로다).
 * 메뉴 다섯: 현황 · 사고 · 고객 · 의견 · 가격. 화면은 한 라우트(/admin)에 둔다 —
 * 사고 목록·상세·환불·되살리기가 한 덩어리로 얽혀 있어서(열린 판·토스트·응답 순서 번호),
 * 라우트로 쪼개면 그 상태를 모두 옮겨야 하고 그 과정에서 컴플레인 처리가 깨질 위험이 크다.
 * 새 화면(의견·가격)만 components/admin 으로 따로 뺐다.
 */

/* ── 색 ── 토스풍: 회색 바탕 · 흰 카드 · 파랑 하나. 빨강은 위험한 것에만. */
const SEV_CHIP: Record<Severity, string> = {
  crit: "bg-[#ffeff0] text-[#f04452]",
  warn: "bg-[#fff4e0] text-[#c77700]",
  info: "bg-[#e8f3ff] text-[#1b64da]",
  ok: "bg-[#e6f7ef] text-[#00976b]",
  plain: "bg-[#f2f4f6] text-[#6b7684]",
};
const SEV_BAR: Record<Severity, string> = {
  crit: "bg-[#f04452]",
  warn: "bg-[#ff9500]",
  info: "bg-[#3182f6]",
  ok: "bg-[#00b26f]",
  plain: "bg-[#e5e8eb]",
};
const STAGE_STYLE: Record<StageState, { text: string; bar: string }> = {
  done: { text: "text-[#6b7684]", bar: "bg-[#00b26f]" },
  fail: { text: "text-[#f04452]", bar: "bg-[#f04452]" },
  stuck: {
    text: "text-[#c77700]",
    bar: "bg-[repeating-linear-gradient(90deg,#ff9500_0_6px,transparent_6px_10px)]",
  },
  "": { text: "text-[#b0b8c1]", bar: "bg-[#e5e8eb]" },
};

/** 왼쪽 메뉴 — 사장님이 매일 쓰는 순서대로. */
const MENU = [
  { key: "home", label: "현황", icon: "◎" },
  { key: "inc", label: "사고", icon: "⚠" },
  { key: "cust", label: "고객", icon: "◍" },
  { key: "voice", label: "의견", icon: "✉" },
  { key: "price", label: "가격", icon: "₩" },
] as const;
type Section = (typeof MENU)[number]["key"];

type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; conflict?: "exists" | "in_progress" | null };

type Open = { jobId: string | null; entry: string | null };

type DialogState =
  | { kind: "refund"; detail: JobDetail }
  | { kind: "restore"; detail: JobDetail }
  | { kind: "restore-confirm"; detail: JobDetail; conflict: "exists" | "in_progress"; message: string; replace: boolean; force: boolean }
  | { kind: "resolve"; detail: JobDetail }
  | { kind: "grant"; customer: CustomerResponse["profile"] }
  | null;

function KindChip({ kind }: { kind: string }) {
  const k = kindInfo(kind);
  return (
    <span className={`whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-bold ${SEV_CHIP[k.sev]}`}>{k.label}</span>
  );
}

function Money({ label, amount, refunded }: { label: string; amount: number | null; refunded: boolean }) {
  if (amount === null) return null;
  return (
    <span>
      {label}{" "}
      <b className={`tabular-nums ${refunded ? "text-[#00976b]" : "text-[#f04452]"}`}>{amount}토큰</b>
      {refunded && " · 환불함"}
    </span>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [gate, setGate] = useState<"checking" | "ok">("checking");
  const [me, setMe] = useState("");
  const [tab, setTab] = useState<Section>("home");
  // 사이드바 배지 — 의견 화면이 읽어 알려 준다.
  const [openFeedback, setOpenFeedback] = useState<number | null>(null);

  const [inc, setInc] = useState<IncidentsResponse | null>(null);
  const [incError, setIncError] = useState<string | null>(null);
  const [incLoading, setIncLoading] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [filterKind, setFilterKind] = useState<string | null>(null);

  const [open, setOpen] = useState<Open | null>(null);
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [customer, setCustomer] = useState<CustomerResponse | null>(null);
  const [custError, setCustError] = useState<string | null>(null);
  const [custLoading, setCustLoading] = useState(false);

  const [dialog, setDialog] = useState<DialogState>(null);
  const [toast, setToast] = useState<string | null>(null);
  // '18분 전' 을 셀 기준 시각 — 렌더 중에 Date.now() 를 부르면 다시 그릴 때마다 글자가 바뀐다. 읽을 때만 옮긴다.
  const [clock, setClock] = useState(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRow = useRef<HTMLElement | null>(null);
  // 방금 이 화면에서 한 환불의 사유·처리자(장부 id → 값). 사고 목록 함수가 환불 뒤 그 줄을 안 주면
  // DB 에서 다시 읽을 길이 없어서, 창을 연 동안만 들고 있는다 — 다시 읽자마자 '앱이 되돌림'처럼 보이지 않게.
  const [recentRefunds, setRecentRefunds] = useState<ReadonlyMap<string, { by: string; note: string }>>(new Map());

  // 응답 순서 꼬임 막기 — 늦게 온 옛 응답이 새로 연 판·새 검색 결과를 덮어쓰지 않게 요청마다 번호를 붙인다.
  const incSeq = useRef(0);
  const detailSeq = useRef(0);
  const custSeq = useRef(0);
  // 지금 열린 판. refreshAll 은 누른 순간의 open 을 들고 있어서, 그 사이 다른 줄을 열었으면 옛 판을 읽으면 안 된다.
  const openRef = useRef<Open | null>(null);

  const say = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  /** 서버 경로 부르기. 401·403 이면 세션이 풀렸거나 마스터가 아니다 — 첫 화면으로 보낸다. */
  const api = useCallback(
    async <T,>(path: string, body?: unknown): Promise<ApiResult<T>> => {
      try {
        const res = await authedFetch(path, {
          method: body === undefined ? "GET" : "POST",
          headers: body === undefined ? undefined : { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (res.status === 401 || res.status === 403) {
          // DB 함수가 권한으로 거절한 경우(42501)도 403 이다 — 세션을 다시 확인하고 마스터가 아닐 때만 내보낸다.
          const s = await loadSession();
          if (!s.isMaster) router.replace("/");
        }
        if (!res.ok) {
          return {
            ok: false,
            status: res.status,
            error: typeof json.error === "string" ? json.error : `서버 오류(${res.status})`,
            conflict: (json.conflict as "exists" | "in_progress" | null | undefined) ?? null,
          };
        }
        return { ok: true, data: json as T };
      } catch (e) {
        return { ok: false, status: 0, error: `인터넷 연결을 확인해 주세요. (${(e as Error)?.message ?? e})` };
      }
    },
    [router],
  );

  const loadIncidents = useCallback(
    async (resolved: boolean) => {
      const seq = ++incSeq.current;
      setIncLoading(true);
      const r = await api<IncidentsResponse>(`/api/admin/incidents${resolved ? "?resolved=1" : ""}`);
      if (seq !== incSeq.current) return; // 그 사이 '처리 끝난 것도 보기'를 바꿔 새로 불렀다
      setIncLoading(false);
      setClock(Date.now());
      if (r.ok) {
        setInc(r.data);
        setIncError(null);
      } else setIncError(r.error);
    },
    [api],
  );

  // 화면 쪽 문 — 편의일 뿐, 보안은 서버 경로가 한다. 마스터로 확인된 뒤에만 목록을 부른다.
  useEffect(() => {
    let alive = true;
    loadSession().then((s) => {
      if (!alive) return;
      if (!s.isMaster) {
        router.replace("/");
        return;
      }
      setMe(s.profile?.username ?? "");
      setGate("ok");
      void loadIncidents(false);
    });
    return () => {
      alive = false;
    };
  }, [router, loadIncidents]);

  const loadDetail = useCallback(
    async (o: Open) => {
      const same = (x: Open | null) => !!x && x.jobId === o.jobId && x.entry === o.entry;
      if (!same(openRef.current)) return; // 이미 닫았거나 다른 줄을 열었다
      const seq = ++detailSeq.current;
      const q = o.jobId ? `id=${o.jobId}` : `entry=${o.entry}`;
      const r = await api<JobDetail>(`/api/admin/job?${q}`);
      if (seq !== detailSeq.current || !same(openRef.current)) return;
      setClock(Date.now());
      if (r.ok) {
        setDetail(r.data);
        setDetailError(null);
      } else setDetailError(r.error);
    },
    [api],
  );

  const openPanel = (o: Open, from?: HTMLElement | null) => {
    lastRow.current = from ?? null;
    openRef.current = o;
    setOpen(o);
    setDetail(null);
    setDetailError(null);
    void loadDetail(o);
  };
  const closePanel = useCallback(() => {
    openRef.current = null;
    detailSeq.current++;
    setOpen(null);
    setDetail(null);
    lastRow.current?.focus();
  }, []);
  useEscClose(closePanel, !!open && !dialog);

  const loadCustomer = useCallback(
    async (name: string) => {
      const p = parseUsername(name);
      const seq = ++custSeq.current;
      if (!p.ok) {
        setCustError(p.error);
        setCustomer(null);
        return;
      }
      setCustLoading(true);
      const r = await api<CustomerResponse>(`/api/admin/customer?username=${encodeURIComponent(p.value)}`);
      if (seq !== custSeq.current) return; // 그 사이 다른 아이디를 찾았다
      setCustLoading(false);
      setClock(Date.now());
      if (r.ok) {
        setCustomer(r.data);
        setCustError(null);
      } else {
        setCustomer(null);
        setCustError(r.error);
      }
    },
    [api],
  );

  /** 무엇을 처리한 뒤엔 목록·상세·고객 카드를 다시 읽는다 — 화면이 짐작으로 고치면 DB 와 어긋난다. */
  const refreshAll = useCallback(async () => {
    await Promise.all([
      loadIncidents(showResolved),
      open ? loadDetail(open) : Promise.resolve(),
      customer ? loadCustomer(customer.profile.username) : Promise.resolve(),
    ]);
  }, [loadIncidents, loadDetail, loadCustomer, open, customer, showResolved]);

  /* ── 목록 거르기 ── */
  const rows = useMemo(() => inc?.incidents ?? [], [inc]);
  const chips = useMemo(() => countKinds(rows), [rows]);
  const visible = useMemo(
    () => sortIncidents(filterKind ? rows.filter((r) => r.kinds.includes(filterKind)) : rows),
    [rows, filterKind],
  );
  const now = clock;

  if (gate !== "ok") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#f2f4f6] px-4 text-sm font-bold text-[#8b95a1]">
        마스터인지 확인하는 중…
      </main>
    );
  }

  const badge = (key: Section): number | null =>
    key === "inc" ? (inc?.openCount ?? null) : key === "voice" ? openFeedback : null;

  return (
    <div className="min-h-dvh bg-[#f2f4f6] text-[#191f28]">
      <div className="mx-auto flex w-full max-w-[1240px] gap-6 px-0 sm:px-6">
        {/* 왼쪽 메뉴 — 폰에서는 아래 가로줄로 내려간다 */}
        <nav
          aria-label="관리 메뉴"
          className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-[#e5e8eb] bg-white px-2 py-1.5 sm:static sm:z-auto sm:w-[200px] sm:shrink-0 sm:flex-col sm:justify-start sm:gap-1 sm:border-0 sm:bg-transparent sm:px-0 sm:py-8"
        >
          <div className="hidden px-3 pb-5 sm:block">
            <Link href="/settings" className="text-[12px] font-bold text-[#b0b8c1] hover:text-[#6b7684]">
              ← 설정으로
            </Link>
            <h1 className="mt-2 text-[19px] font-bold tracking-tight text-[#191f28]">관리실</h1>
            <p className="mt-0.5 text-[12px] font-medium text-[#8b95a1]">{me || inc?.me || "…"} 님</p>
          </div>
          {MENU.map((m) => {
            const on = tab === m.key;
            const n = badge(m.key);
            return (
              <button
                key={m.key}
                type="button"
                aria-current={on ? "page" : undefined}
                onClick={() => setTab(m.key)}
                className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[11px] font-bold transition sm:w-full sm:flex-none sm:flex-row sm:gap-2.5 sm:px-3 sm:py-2.5 sm:text-[15px] ${
                  on ? "bg-[#e8f3ff] text-[#1b64da] sm:bg-white sm:text-[#191f28]" : "text-[#8b95a1] sm:hover:bg-white/70"
                }`}
              >
                <span aria-hidden className={`text-[15px] ${on ? "text-[#3182f6]" : "text-[#b0b8c1]"}`}>
                  {m.icon}
                </span>
                <span>{m.label}</span>
                {n ? (
                  <span className="rounded-full bg-[#f04452] px-1.5 text-[10px] font-bold leading-[16px] text-white sm:ml-auto sm:text-[11px] sm:leading-[18px]">
                    {n}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        {/* 내용 */}
        <div className="flex min-w-0 flex-1 flex-col gap-4 px-4 pb-24 pt-6 sm:px-0 sm:pb-16 sm:pt-8">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[22px] font-bold tracking-tight text-[#191f28]">
              {MENU.find((m) => m.key === tab)?.label}
            </h2>
            <span className="rounded-full bg-white px-3 py-1 text-[12px] font-bold text-[#6b7684]">
              서버에서 마스터만 열려요
            </span>
          </header>

          {/* 현황 — 오늘 무슨 일이 있었나 */}
          {(tab === "home" || tab === "inc") && (
            <section aria-label="오늘 현황" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "오늘 만든 동화", value: inc?.today.booksToday, unit: "권", tone: "" },
                { label: "돈 냈는데 책 없음", value: inc?.today.paidNotSaved, unit: "건", tone: "text-[#f04452]" },
                { label: "멈춘 만들기", value: inc?.today.stuck, unit: "건", tone: "text-[#ff9500]" },
                { label: "오늘 환불", value: inc?.today.refundedTokens, unit: "토큰", tone: "" },
              ].map((s) => (
                <div key={s.label} className="flex flex-col gap-1 rounded-2xl bg-white px-4 py-3.5">
                  <span className="text-[12px] font-medium text-[#8b95a1]">{s.label}</span>
                  <span className={`text-[22px] font-bold tabular-nums tracking-tight ${s.tone}`}>
                    {s.value ?? "–"}
                    <small className="ml-1 text-[12px] font-bold text-[#b0b8c1]">{s.unit}</small>
                  </span>
                </div>
              ))}
            </section>
          )}

          {tab === "home" && (
            <div className="flex flex-col gap-3">
              <div className="rounded-2xl bg-white p-5">
                <p className="text-[15px] font-bold text-[#191f28]">
                  {inc?.openCount ? `처리할 사고가 ${inc.openCount}건 있어요` : "처리할 사고가 없어요 👏"}
                </p>
                <p className="mt-1 text-[13px] font-medium leading-relaxed text-[#8b95a1]">
                  돈은 나갔는데 책이 없거나, 만들다 멈춘 기록이 여기 모여요. 왼쪽 ‘사고’에서 처리해요.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setTab("inc")}
                    className="rounded-xl bg-[#3182f6] px-4 py-2.5 text-sm font-bold text-white"
                  >
                    사고 보기
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("voice")}
                    className="rounded-xl bg-[#f2f4f6] px-4 py-2.5 text-sm font-bold text-[#4e5968]"
                  >
                    의견 보기{openFeedback ? ` (${openFeedback})` : ""}
                  </button>
                </div>
              </div>
              <div className="rounded-2xl bg-white p-5">
                <p className="text-[15px] font-bold text-[#191f28]">이 화면에 fe 계정 기록은 안 보여요</p>
                <p className="mt-1 text-[13px] font-medium leading-relaxed text-[#8b95a1]">
                  fe 는 사장님 개인 개발 계정이라, 회사 계정(yogico)의 관리실에서는 숨겨져 있어요.
                  fe 로 로그인하면 fe 기록이 보여요. 위 숫자에도 fe 것은 빠져 있어요.
                </p>
              </div>
            </div>
          )}

          {tab === "price" && <PricingSection api={api} say={say} clock={now} />}

          {tab === "voice" && (
            <FeedbackSection
              api={api}
              say={say}
              clock={now}
              onCount={setOpenFeedback}
              onOpenCustomer={(username) => {
                setTab("cust");
                setQuery(username);
                void loadCustomer(username);
              }}
            />
          )}

          {tab === "inc" ? (
          <section role="tabpanel" aria-label="사고 목록">
            <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 pt-3.5">
              <div className="flex flex-wrap gap-1.5" aria-label="사고 종류로 거르기">
                {[{ kind: "", count: rows.length }, ...chips].map((c) => {
                  const pressed = (filterKind ?? "") === c.kind;
                  return (
                    <button
                      key={c.kind || "all"}
                      type="button"
                      aria-pressed={pressed}
                      onClick={() => setFilterKind(c.kind || null)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-bold transition ${
                        pressed ? "bg-[#191f28] text-white" : "bg-white text-[#6b7684] hover:bg-[#e8f3ff]"
                      }`}
                    >
                      {c.kind ? kindInfo(c.kind).label : "전체"}
                      <span className="tabular-nums opacity-70">{c.count}</span>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void loadIncidents(showResolved)}
                  disabled={incLoading}
                  className="text-[13px] font-bold text-[#8b95a1] hover:text-[#4e5968] disabled:opacity-50"
                >
                  {incLoading ? "읽는 중…" : "새로 읽기"}
                </button>
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-medium text-[#6b7684]">
                  <input
                    type="checkbox"
                    checked={showResolved}
                    onChange={(e) => {
                      setShowResolved(e.target.checked);
                      setFilterKind(null);
                      void loadIncidents(e.target.checked);
                    }}
                  />
                  처리 끝난 것도 보기
                </label>
              </div>
            </div>

            {incError && <p className="mb-2 rounded-xl bg-[#ffeff0] px-4 py-3 text-[13px] font-bold text-[#f04452]">{incError}</p>}

            <ol className="overflow-hidden rounded-2xl bg-white">
              {!inc && !incError ? (
                <li className="px-4 py-12 text-center text-[15px] font-bold text-[#b0b8c1]">사고 목록을 읽는 중…</li>
              ) : visible.length === 0 ? (
                <li className="px-4 py-12 text-center text-[15px] font-bold text-[#8b95a1]">처리할 사고가 없어요 👏</li>
              ) : (
                visible.map((r) => (
                  <IncidentRowView
                    key={r.job_id ?? `entry-${r.story_entry ?? r.illustration_entry}`}
                    r={r}
                    now={now}
                    current={!!open && (r.job_id ? open.jobId === r.job_id : open.entry === (r.story_entry ?? r.illustration_entry))}
                    onOpen={(el) =>
                      openPanel({ jobId: r.job_id, entry: r.job_id ? null : (r.story_entry ?? r.illustration_entry) }, el)
                    }
                  />
                ))
              )}
            </ol>
            <p className="mt-3.5 text-[12px] font-medium leading-relaxed text-[#b0b8c1]">
              급한 순서로 정렬됩니다. 만드는 중(30분 안에 움직인 것)은 사고로 치지 않습니다.
              {inc && inc.total > inc.incidents.length && ` · 전체 ${inc.total}건 중 ${inc.incidents.length}건만 보여요.`}
            </p>
          </section>
          ) : null}

          {tab === "cust" && (
            <section aria-label="고객 찾기" className="flex flex-col gap-3">
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void loadCustomer(query);
                }}
              >
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="고객 아이디"
                  aria-label="고객 아이디"
                  maxLength={40}
                  className="min-w-0 flex-1 rounded-xl border border-[#e5e8eb] bg-white px-3.5 py-2.5 text-sm font-medium text-[#191f28] outline-none placeholder:text-[#c4cad1] focus:border-[#3182f6]"
                />
                <button
                  type="submit"
                  disabled={custLoading}
                  className="rounded-xl bg-[#3182f6] px-5 py-2.5 text-sm font-bold text-white disabled:bg-[#b0c8f0]"
                >
                  {custLoading ? "찾는 중…" : "찾기"}
                </button>
              </form>
              {custError && (
                <div className="rounded-2xl bg-white p-5 text-sm font-medium text-[#6b7684]">{custError}</div>
              )}
              {!customer && !custError && (
                <div className="rounded-2xl bg-white p-5 text-[13px] font-medium leading-relaxed text-[#8b95a1]">
                  고객 아이디로 찾으면 잔액·책 수·만들기 기록이 한 번에 보여요. 토큰 충전도 여기서 해요.
                </div>
              )}
              {customer && (
                <CustomerView
                  c={customer}
                  now={now}
                  onGrant={() => setDialog({ kind: "grant", customer: customer.profile })}
                  onOpen={(o, el) => openPanel(o, el)}
                />
              )}
            </section>
          )}
        </div>
      </div>

      {/* 상세 판 — 폰에서는 전체 화면 */}
      {open && (
        <>
          <div className="fixed inset-0 z-30 bg-[#191f28]/40" onClick={closePanel} aria-hidden />
          <aside
            aria-label="사고 상세"
            className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-[#f2f4f6] bg-white shadow-2xl sm:w-[520px]"
          >
            <DetailPanel
              detail={detail}
              error={detailError}
              now={now}
              recentRefunds={recentRefunds}
              onClose={closePanel}
              onRefund={(d) => setDialog({ kind: "refund", detail: d })}
              onRestore={(d) => setDialog({ kind: "restore", detail: d })}
              onResolve={(d) => setDialog({ kind: "resolve", detail: d })}
            />
          </aside>
        </>
      )}

      {dialog && (
        <Dialogs
          // 확인창 종류가 바뀌면 입력·오류를 새로 시작한다(되살리기 → 덮어쓰기 확인은 다른 질문이다).
          key={dialog.kind}
          dialog={dialog}
          setDialog={setDialog}
          api={api}
          say={say}
          refreshAll={refreshAll}
          onRefunded={(entry, note) =>
            setRecentRefunds((m) => new Map(m).set(entry, { by: me || inc?.me || "마스터", note }))
          }
        />
      )}

      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-none fixed bottom-6 left-1/2 z-[60] max-w-[calc(100%-32px)] -translate-x-1/2 rounded-xl bg-[#191f28] px-4 py-2.5 text-sm font-bold text-white transition-opacity ${
          toast ? "opacity-100" : "opacity-0"
        }`}
      >
        {toast}
      </div>
    </div>
  );
}

/* ── 사고 한 줄 ── */
function IncidentRowView({
  r,
  now,
  current,
  onOpen,
}: {
  r: IncidentListRow;
  now: number;
  current: boolean;
  onOpen: (el: HTMLElement) => void;
}) {
  const sev = rowSeverity(r.kinds, !!r.resolved_at);
  return (
    <li className="border-t border-[#f2f4f6] first:border-t-0">
      <button
        type="button"
        aria-current={current}
        onClick={(e) => onOpen(e.currentTarget)}
        className={`relative grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1.5 py-3 pl-5 pr-4 text-left md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_auto] ${
          current ? "bg-[#e8f3ff]" : "hover:bg-[#f9fafb]"
        }`}
      >
        <span className={`absolute inset-y-0 left-0 w-1 ${SEV_BAR[sev]}`} aria-hidden />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-bold">
            {r.title ?? <span className="font-bold text-[#b0b8c1]">(만들기 기록 없음)</span>}
          </span>
          <span className="flex flex-wrap gap-2 text-xs text-[#8b95a1]">
            <b className="text-[#4e5968]">{r.username ?? "(아이디 없음)"}</b>
            {r.status && <span>{statusLabel(r.status)}</span>}
            {r.page_count ? (
              <span>
                그림 {r.drawn ?? 0}/{r.page_count}
              </span>
            ) : null}
            {r.resolved_at && <span className="font-bold text-[#00976b]">처리 끝</span>}
          </span>
        </span>
        <span className="order-3 col-span-2 flex flex-wrap gap-1 md:order-none md:col-span-1">
          {r.kinds.map((k) => (
            <KindChip key={k} kind={k} />
          ))}
        </span>
        <span className="order-4 col-span-2 flex flex-row gap-2.5 text-xs text-[#6b7684] md:order-none md:col-span-1 md:flex-col md:gap-0.5">
          {r.story_entry && <Money label="대본" amount={r.story_amount} refunded={!!r.story_refunded_at} />}
          {r.illustration_entry && (
            <Money label="그림" amount={r.illustration_amount} refunded={!!r.illustration_refunded_at} />
          )}
        </span>
        <span className="whitespace-nowrap text-right text-xs tabular-nums text-[#b0b8c1]">
          {formatWhenKo(r.updated_at, now)}
        </span>
      </button>
    </li>
  );
}

/* ── 상세 판 ── */
function DetailPanel({
  detail: d,
  error,
  now,
  recentRefunds,
  onClose,
  onRefund,
  onRestore,
  onResolve,
}: {
  detail: JobDetail | null;
  error: string | null;
  now: number;
  recentRefunds: ReadonlyMap<string, { by: string; note: string }>;
  onClose: () => void;
  onRefund: (d: JobDetail) => void;
  onRestore: (d: JobDetail) => void;
  onResolve: (d: JobDetail) => void;
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const closeBtn = (
    <button
      ref={closeRef}
      type="button"
      onClick={onClose}
      className="shrink-0 rounded-lg border border-[#f2f4f6] px-2.5 py-1 text-sm font-bold text-[#6b7684]"
    >
      닫기
    </button>
  );

  if (!d) {
    return (
      <div className="flex flex-col gap-3 p-5">
        <div className="flex justify-end">{closeBtn}</div>
        <p className={`text-sm ${error ? "font-bold text-[#f04452]" : "text-[#b0b8c1]"}`}>{error ?? "상세를 읽는 중…"}</p>
      </div>
    );
  }

  const stuckMin = minutesSince(d.updatedAt, now);
  const check = restoreCheck({
    jobId: d.jobId,
    status: d.status,
    updatedAt: d.updatedAt,
    resolvedAt: d.resolvedAt,
    bookId: d.bookId,
    bookExists: d.bookExists,
    title: d.manuscriptTitle,
    pages: d.manuscriptPages,
    now,
  });
  const refundable = [d.story, d.illustration].some((p) => p && !p.refundedAt);
  const story = withRecentRefund(d.story, recentRefunds);
  const illustration = withRecentRefund(d.illustration, recentRefunds);
  const stages = stageStates({
    status: d.status,
    kinds: d.kinds,
    bookExists: d.bookExists,
    illustrationPaid: !!d.illustration,
    drawn: d.drawn,
    failureStages: d.failureStages,
  });

  return (
    <>
      <div className="flex flex-col gap-2 border-b border-[#f2f4f6] px-5 pb-3.5 pt-4">
        <div className="flex items-start justify-between gap-2.5">
          <h2 className="text-lg font-bold tracking-tight">{d.title ?? (d.jobId ? "(제목 없음)" : "기록 없는 결제")}</h2>
          {closeBtn}
        </div>
        <div className="flex flex-wrap gap-1">
          {d.kinds.map((k) => (
            <KindChip key={k} kind={k} />
          ))}
          {d.resolvedAt && <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${SEV_CHIP.ok}`}>처리 끝</span>}
        </div>
        <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-[#8b95a1]">
          <span>
            고객 <b className="text-[#4e5968]">{d.username ?? "?"}</b>
          </span>
          <span>
            잔액 <b className="tabular-nums text-[#4e5968]">{d.tokens ?? "?"}토큰</b>
          </span>
          {d.bookId && (
            <span>
              책 <b className="font-mono text-[#4e5968]">{d.bookId}</b>
              {d.bookHidden && " (숨김)"}
            </span>
          )}
          <span>{formatWhenKo(d.updatedAt ?? d.createdAt, now)}</span>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 pb-5 pt-4">
        {d.status ? (
          <Block title="어디까지 갔나">
            <ol className="grid grid-cols-5 gap-1">
              {STAGES.map((s, i) => (
                <li key={s.key} className={`flex flex-col gap-1.5 text-xs font-bold ${STAGE_STYLE[stages[i]].text}`}>
                  <span className={`h-1.5 rounded ${STAGE_STYLE[stages[i]].bar}`} />
                  {s.label}
                </li>
              ))}
            </ol>
            <p className="mt-2.5 text-[13px] text-[#6b7684]">
              {statusLabel(d.status)}
              {d.pageCount ? (
                <>
                  {" · "}
                  {d.pageCount}쪽 중 <b>{d.drawn}장</b> 그림 · 못 그림 {d.drawFailed} · 못 올림 {d.uploadFailed}
                </>
              ) : null}
              {d.restoredAt && ` · ${formatWhenKo(d.restoredAt, now)} ${d.restoredBy ?? ""} 되살림`}
            </p>
            {d.error && <div className="mt-2 rounded-lg bg-[#ffeff0] px-2.5 py-2 text-xs text-[#f04452]">{d.error}</div>}
            {d.kinds.includes("stuck") && (
              <div className="mt-2 rounded-lg bg-[#fff4e0] px-2.5 py-2 text-xs text-[#c77700]">
                {stuckMin}분째 움직임이 없어요. 부모가 창을 닫았거나 서버가 멈춘 경우예요.
              </div>
            )}
          </Block>
        ) : (
          d.error && (
            <Block title="무슨 일인가">
              <div className="rounded-lg bg-[#ffeff0] px-2.5 py-2 text-xs text-[#f04452]">{d.error}</div>
              <p className="mt-2.5 text-[13px] text-[#6b7684]">
                결제는 됐는데 어느 만들기 기록에도 안 이어졌어요. 보통 저장과 기록 쓰기가 같은 이유(인터넷 끊김)로 함께 실패한
                경우예요.
              </p>
            </Block>
          )
        )}

        {d.kinds.includes("paid_other_book") && (
          <div className="rounded-lg bg-[#e8f3ff] px-2.5 py-2 text-xs text-[#1b64da]">
            결제 직후 이 고객이 <b>다른 책 {d.otherBooks}권</b>을 저장했어요. 환불 전에 고객 책장에서 그 책이 이 동화인지
            확인하세요.
          </div>
        )}
        {d.kinds.includes("deleted_after_save") && (
          <div className="rounded-lg bg-[#f2f4f6] px-2.5 py-2 text-xs text-[#6b7684]">
            책이 저장됐다가 지워졌어요. 환불 대상이 아니에요.
          </div>
        )}

        <Block title="결제">
          {d.story || d.illustration ? (
            <div className="flex flex-col overflow-hidden rounded-xl border border-[#f2f4f6]">
              {story && <PayRow what="대본 값" sub="줄거리로 대본을 쓸 때" p={story} />}
              {illustration && <PayRow what="그림 값" sub="그림을 붙일 때" p={illustration} />}
            </div>
          ) : (
            <p className="text-[13px] text-[#b0b8c1]">이 기록에 붙은 결제가 없어요(마스터가 만들었거나 대본 전에 멈춤).</p>
          )}
          {[story, illustration].map((p, i) =>
            p?.note ? (
              <p key={i} className="mt-2 text-[13px] text-[#6b7684]">
                {i === 0 ? "대본" : "그림"} 환불 사유: {p.note}
              </p>
            ) : null,
          )}
          {d.masterNote && <p className="mt-2 text-[13px] text-[#6b7684]">처리 메모: {d.masterNote}</p>}
          {d.resolvedAt && (
            <p className="mt-1 text-xs text-[#b0b8c1]">
              {formatWhenKo(d.resolvedAt, now)} {d.resolvedBy ?? ""} 처리 끝
            </p>
          )}
        </Block>

        {d.jobId && (
          <Block title={d.pagesFrom === "book" ? "책장에 있는 책" : "원고 · 되살리기 재료"}>
            {d.pages.length ? (
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
                {d.pages.map((p, i) => (
                  <div key={i} className="flex flex-col gap-1 text-[11px] text-[#8b95a1]">
                    {p.art === "ok" && p.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.image}
                        alt={`${i + 1}쪽 그림`}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="aspect-[4/3] w-full rounded-md bg-[#f2f4f6] object-cover"
                      />
                    ) : p.art === "external" ? (
                      <div
                        className="flex aspect-[4/3] items-center justify-center rounded-md border border-[#e5e8eb] bg-[#f9fafb] text-[10px] font-bold text-[#8b95a1]"
                        title="우리 그림 저장소가 아닌 주소라 열지 않았어요"
                      >
                        바깥 주소
                      </div>
                    ) : p.art === "embedded" ? (
                      <div className="flex aspect-[4/3] items-center justify-center rounded-md border border-yellow-500 bg-[repeating-linear-gradient(45deg,var(--color-yellow-50)_0_6px,var(--color-neutral-50)_6px_12px)] text-[10px] font-bold text-[#c77700]">
                        못 올림
                      </div>
                    ) : (
                      <div className="flex aspect-[4/3] items-center justify-center rounded-md border-[1.5px] border-dashed border-red-400 text-[10px] font-bold text-[#f04452]">
                        빈 쪽
                      </div>
                    )}
                    <span className="line-clamp-2 text-[#6b7684]">
                      {i + 1}. {p.text || "…"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-[#b0b8c1]">원고가 없어요 — 대본 전에 멈췄거나 90일이 지나 비워졌어요.</p>
            )}
            <p className="mt-2.5 text-[13px] text-[#8b95a1]">원고는 기록이 마지막으로 움직인 날부터 90일 보관돼요.</p>
          </Block>
        )}

        {d.failures.length > 0 && (
          <Block title="실패 이유">
            <ul className="flex flex-col gap-1.5 text-xs">
              {d.failures.map((f, i) => (
                <li key={i} className="grid grid-cols-[auto_auto_1fr] items-start gap-2 text-[#6b7684]">
                  <span className="font-bold text-[#191f28]">{f.where}</span>
                  <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${SEV_CHIP.plain}`}>{f.stage}</span>
                  <span className="break-all">{f.reason}</span>
                </li>
              ))}
            </ul>
          </Block>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-[#f2f4f6] bg-white px-5 py-3.5">
        {d.jobId && (
          <button
            type="button"
            disabled={!!check.blocked}
            onClick={() => onRestore(d)}
            className="rounded-xl bg-[#3182f6] px-3.5 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"
          >
            책 되살리기
          </button>
        )}
        <button
          type="button"
          disabled={!refundable}
          onClick={() => onRefund(d)}
          className="rounded-xl bg-red-600 px-3.5 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"
        >
          환불
        </button>
        {d.bookExists && d.bookId && (
          <a
            href={`/book/${encodeURIComponent(d.bookId)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-[#e5e8eb] px-3.5 py-2 text-sm font-bold text-[#191f28]"
          >
            책 열어 빈 쪽 다시 그리기
          </a>
        )}
        {!d.resolvedAt && (
          <button
            type="button"
            onClick={() => onResolve(d)}
            className="rounded-xl border border-[#e5e8eb] px-3.5 py-2 text-sm font-bold text-[#191f28]"
          >
            처리 끝
          </button>
        )}
        {d.jobId && (check.blocked || check.warn) && (
          <span className={`basis-full text-xs ${check.blocked ? "text-[#c77700]" : "text-[#8b95a1]"}`}>
            {check.blocked ?? check.warn}
          </span>
        )}
      </div>
    </>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2.5 text-xs font-bold tracking-wide text-[#b0b8c1]">{title}</h3>
      {children}
    </div>
  );
}

function PayRow({ what, sub, p }: { what: string; sub: string; p: Payment }) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-t border-[#f2f4f6] px-3 py-2.5 first:border-t-0">
      <span className="text-sm font-bold">
        {what}
        <small className="block text-xs font-medium text-[#b0b8c1]">{sub}</small>
      </span>
      <span className="font-bold tabular-nums">{p.amount ?? "?"}토큰</span>
      {p.refundedAt ? (
        <span
          className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${SEV_CHIP.ok}`}
          title={p.note ?? (p.byKnown ? "" : "환불 뒤 사고 목록에서 빠져 처리자·사유를 읽을 수 없어요")}
        >
          {refundLabel(p)}
        </span>
      ) : (
        <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${SEV_CHIP.crit}`}>환불 안 됨</span>
      )}
    </div>
  );
}

/* ── 고객 찾기 ── */
function CustomerView({
  c,
  now,
  onGrant,
  onOpen,
}: {
  c: CustomerResponse;
  now: number;
  onGrant: () => void;
  onOpen: (o: Open, el: HTMLElement) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3.5 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div className="flex flex-col gap-3 self-start rounded-2xl bg-white p-4">
        <h2 className="text-lg font-bold">
          {c.profile.username}
          {c.profile.isMaster && <span className="ml-1.5 text-xs font-bold text-[#1b64da]">마스터</span>}
        </h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1.5 text-[13px]">
          <dt className="text-[#8b95a1]">토큰 잔액</dt>
          <dd className="font-bold tabular-nums">{c.profile.tokens}토큰</dd>
          <dt className="text-[#8b95a1]">가입일</dt>
          <dd className="font-bold tabular-nums">{formatDateKo(c.profile.createdAt)}</dd>
          <dt className="text-[#8b95a1]">만든 동화</dt>
          <dd className="font-bold tabular-nums">{c.booksCount}권</dd>
          <dt className="text-[#8b95a1]">열린 사고</dt>
          <dd className="font-bold tabular-nums">{c.openIncidents}건</dd>
        </dl>
        <button
          type="button"
          onClick={onGrant}
          className="self-start rounded-xl border border-[#e5e8eb] px-3.5 py-2 text-sm font-bold text-[#191f28]"
        >
          토큰 충전
        </button>
      </div>
      <div className="flex min-w-0 flex-col gap-3 rounded-2xl bg-white p-4">
        <h2 className="text-[15px] font-bold">만들기 기록</h2>
        {c.jobs.length === 0 ? (
          <p className="text-sm text-[#b0b8c1]">만들기 기록이 없어요.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  {["동화", "단계", "그림", "결제", "사고", "언제"].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap border-b border-[#f2f4f6] px-2.5 pb-2 text-left text-[11px] font-bold tracking-wide text-[#b0b8c1]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {c.jobs.map((j) => (
                  <tr
                    key={j.jobId ?? `entry-${j.entryId}`}
                    tabIndex={0}
                    onClick={(e) => onOpen({ jobId: j.jobId, entry: j.jobId ? null : j.entryId }, e.currentTarget)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onOpen({ jobId: j.jobId, entry: j.jobId ? null : j.entryId }, e.currentTarget);
                      }
                    }}
                    className="cursor-pointer border-b border-[#f2f4f6] last:border-b-0 hover:bg-[#f9fafb]"
                  >
                    <td className="max-w-[220px] truncate px-2.5 py-2.5 font-bold">
                      {j.title ?? <span className="text-[#b0b8c1]">(기록 없음)</span>}
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-2.5">{statusLabel(j.status)}</td>
                    <td className="whitespace-nowrap px-2.5 py-2.5 tabular-nums">
                      {j.pageCount ? `${j.drawn}/${j.pageCount}` : "—"}
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-2.5 tabular-nums">
                      {j.payments.length
                        ? j.payments.map((p, i) => (
                            <span key={i}>
                              {i > 0 && " + "}
                              <span className={p.refunded ? "font-bold text-[#00976b]" : ""}>{p.amount ?? "?"}</span>
                            </span>
                          ))
                        : "—"}
                      {j.payments.length ? "토큰" : ""}
                    </td>
                    <td className="px-2.5 py-2.5">
                      <span className="flex flex-wrap gap-1">
                        {j.kinds.length ? (
                          j.kinds.map((k) => <KindChip key={k} kind={k} />)
                        ) : (
                          <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${SEV_CHIP.ok}`}>없음</span>
                        )}
                        {j.resolvedAt && j.kinds.length > 0 && (
                          <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${SEV_CHIP.ok}`}>처리 끝</span>
                        )}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-2.5 text-[#b0b8c1]">{formatWhenKo(j.createdAt, now)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {c.truncated && <p className="text-xs text-[#b0b8c1]">최근 100건만 보여요.</p>}
      </div>
    </div>
  );
}

/* ── 확인창 ── */
function Modal({
  title,
  onClose,
  busy,
  children,
}: {
  title: string;
  onClose: () => void;
  busy: boolean;
  children: React.ReactNode;
}) {
  useEscClose(onClose, !busy);
  return (
    // 폰에서 사유 칸에 키보드가 뜨면 보이는 높이가 줄어든다 — 바깥·안쪽 모두 스크롤되게 해 [환불하기]가 잘리지 않게.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#191f28]/45 px-4 py-4"
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[calc(100dvh-32px)] w-full max-w-[440px] flex-col gap-3 overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
      >
        <h2 className="text-lg font-bold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function Actions({
  onCancel,
  okLabel,
  okClass,
  disabled,
  busy,
  onOk,
}: {
  onCancel: () => void;
  okLabel: string;
  okClass: string;
  disabled?: boolean;
  busy: boolean;
  onOk: () => void;
}) {
  return (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="rounded-xl border border-[#e5e8eb] px-3.5 py-2 text-sm font-bold text-[#4e5968]"
      >
        취소
      </button>
      <button
        type="button"
        onClick={onOk}
        disabled={disabled || busy}
        className={`rounded-xl px-3.5 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45 ${okClass}`}
      >
        {busy ? "처리 중…" : okLabel}
      </button>
    </div>
  );
}

function Dialogs({
  dialog,
  setDialog,
  api,
  say,
  refreshAll,
  onRefunded,
}: {
  dialog: NonNullable<DialogState>;
  setDialog: (d: DialogState) => void;
  api: <T>(path: string, body?: unknown) => Promise<ApiResult<T>>;
  say: (msg: string) => void;
  refreshAll: () => Promise<void>;
  onRefunded: (entry: string, note: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("30");
  const firstPick =
    dialog.kind === "refund"
      ? dialog.detail.story && !dialog.detail.story.refundedAt
        ? "story"
        : dialog.detail.illustration && !dialog.detail.illustration.refundedAt
          ? "illustration"
          : null
      : null;
  const [which, setWhich] = useState<"story" | "illustration" | null>(firstPick);

  const close = () => setDialog(null);
  const errLine = error && <p className="rounded-lg bg-[#ffeff0] px-2.5 py-2 text-xs font-bold text-[#f04452]">{error}</p>;

  async function runRestore(d: JobDetail, replace: boolean, force: boolean) {
    setBusy(true);
    setError(null);
    const r = await api<{ result: { book_id: string; replaced: boolean } }>("/api/admin/restore", {
      job: d.jobId,
      replace,
      force,
    });
    setBusy(false);
    if (r.ok) {
      say(`${r.data.result?.replaced ? "덮어써서 " : ""}되살렸어요 → ${d.username ?? "고객"} 책장에 들어갔어요`);
      setDialog(null);
      await refreshAll();
      return;
    }
    // '이미 책이 있음' · '진행 중' 은 DB 문구를 그대로 보여 주고 한 번 더 묻는다.
    if (r.conflict === "exists" && !replace) {
      setDialog({ kind: "restore-confirm", detail: d, conflict: "exists", message: r.error, replace, force });
      return;
    }
    if (r.conflict === "in_progress" && !force) {
      setDialog({ kind: "restore-confirm", detail: d, conflict: "in_progress", message: r.error, replace, force });
      return;
    }
    setError(r.error);
  }

  if (dialog.kind === "refund") {
    const d = dialog.detail;
    const opts = [
      { key: "story" as const, label: "대본 값", p: d.story },
      { key: "illustration" as const, label: "그림 값", p: d.illustration },
    ].filter((o) => o.p);
    const picked = opts.find((o) => o.key === which)?.p ?? null;
    const noteOk = parseRefundNote(note);
    return (
      <Modal title="환불" onClose={close} busy={busy}>
        <p className="text-sm text-[#6b7684]">
          <b>{d.username}</b> 님의 결제 한 건을 되돌려요. 같은 건은 한 번만 환불돼요.
        </p>
        <div className="flex flex-col gap-1.5">
          {opts.map((o) => {
            const done = !!o.p?.refundedAt;
            return (
              <label
                key={o.key}
                className={`flex items-center gap-2 rounded-xl border border-[#f2f4f6] px-3 py-2.5 text-[13px] font-bold ${
                  done ? "cursor-not-allowed text-[#b0b8c1]" : "cursor-pointer"
                }`}
              >
                <input
                  type="radio"
                  name="which"
                  disabled={done}
                  checked={which === o.key}
                  onChange={() => setWhich(o.key)}
                />
                {o.label} <span className="tabular-nums">{o.p?.amount ?? "?"}토큰</span>
                {done && " — 이미 환불함"}
              </label>
            );
          })}
        </div>
        <label className="flex flex-col gap-1.5 text-xs font-bold text-[#8b95a1]">
          사유 (필수 · 고객에겐 안 보여요)
          <textarea
            rows={2}
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            placeholder="예: 저장 실패 컴플레인 — 되살림 후 환불"
            className="resize-y rounded-xl border border-[#e5e8eb] px-3 py-2 text-sm font-normal text-[#191f28]"
            autoFocus
          />
        </label>
        <div className="rounded-lg bg-[#f9fafb] px-2.5 py-2 text-xs text-[#6b7684]">
          {d.username} 잔액 <span className="tabular-nums">{d.tokens ?? "?"}</span> →{" "}
          <span className="tabular-nums">{d.tokens !== null && picked?.amount != null ? d.tokens + picked.amount : "?"}</span>토큰
        </div>
        {errLine}
        <Actions
          onCancel={close}
          okLabel="환불하기"
          okClass="bg-red-600"
          busy={busy}
          disabled={!picked || !noteOk.ok}
          onOk={async () => {
            if (!picked || !noteOk.ok) return;
            setBusy(true);
            setError(null);
            const r = await api<{ result: { amount: number; tokens: number } }>("/api/admin/refund", {
              entry: picked.entry,
              note: noteOk.value,
            });
            setBusy(false);
            if (!r.ok) return setError(r.error);
            onRefunded(picked.entry, noteOk.value);
            say(`환불했어요 · ${d.username} 잔액 +${r.data.result?.amount ?? picked.amount}토큰`);
            setDialog(null);
            await refreshAll();
          }}
        />
      </Modal>
    );
  }

  if (dialog.kind === "restore") {
    const d = dialog.detail;
    const art = d.manuscriptPages.filter((p) => p.art === "ok" || p.art === "external").length;
    const blank = d.manuscriptPages.length - art;
    return (
      <Modal title="책 되살리기" onClose={close} busy={busy}>
        <p className="text-sm text-[#6b7684]">
          원고로 책을 다시 만들어 <b>{d.username}</b> 님 책장에 넣어요. 주인은 이 기록에 적힌 고객으로 정해져요.
        </p>
        <div className="rounded-lg bg-[#f9fafb] px-2.5 py-2 text-xs text-[#6b7684]">
          책 id <span className="font-mono">{d.bookId ?? "새로 정해짐"}</span> · {d.manuscriptPages.length}쪽 · 그림 {art}장
          {blank > 0 && ` · 빈 쪽 ${blank}장은 되살린 뒤 다시 그리면 돼요`}
        </div>
        {errLine}
        <Actions onCancel={close} okLabel="되살리기" okClass="bg-[#3182f6]" busy={busy} onOk={() => void runRestore(d, false, false)} />
      </Modal>
    );
  }

  if (dialog.kind === "restore-confirm") {
    const d = dialog.detail;
    const exists = dialog.conflict === "exists";
    return (
      <Modal title={exists ? "이미 책이 있어요" : "아직 진행 중인 기록이에요"} onClose={close} busy={busy}>
        <p className="rounded-lg bg-[#fff4e0] px-2.5 py-2 text-xs font-bold text-[#c77700]">{dialog.message}</p>
        <p className="text-sm text-[#6b7684]">
          {exists
            ? "덮어쓰면 고객이 저장 뒤에 다시 그린 그림이 원고의 그림으로 바뀌어요. 책장에서 먼저 확인했나요?"
            : "앱이 아직 저장 중이면, 곧 앱의 저장이 도착해 되살린 책을 덮을 수 있어요. 고객이 창을 닫은 게 확실할 때만 진행하세요."}
        </p>
        {errLine}
        <Actions
          onCancel={close}
          okLabel={exists ? "덮어쓰기" : "강제로 되살리기"}
          okClass="bg-red-600"
          busy={busy}
          onOk={() => void runRestore(d, exists ? true : dialog.replace, exists ? dialog.force : true)}
        />
      </Modal>
    );
  }

  if (dialog.kind === "resolve") {
    const d = dialog.detail;
    return (
      <Modal title="처리 끝" onClose={close} busy={busy}>
        <p className="text-sm text-[#6b7684]">사고 목록에서 내려요. 환불이나 되살리기 없이 끝낼 때 써요.</p>
        <label className="flex flex-col gap-1.5 text-xs font-bold text-[#8b95a1]">
          메모 (선택 · 고객에겐 안 보여요)
          <textarea
            rows={2}
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            placeholder="예: 고객과 통화 — 새로 만들기로 함"
            className="resize-y rounded-xl border border-[#e5e8eb] px-3 py-2 text-sm font-normal text-[#191f28]"
            autoFocus
          />
        </label>
        {errLine}
        <Actions
          onCancel={close}
          okLabel="처리 끝"
          okClass="bg-[#3182f6]"
          busy={busy}
          onOk={async () => {
            setBusy(true);
            setError(null);
            const body = d.jobId
              ? { job: d.jobId, note }
              : { entry: d.story?.entry ?? d.illustration?.entry ?? d.entryId, note };
            const r = await api<{ ok: true }>("/api/admin/resolve", body);
            setBusy(false);
            if (!r.ok) return setError(r.error);
            say("처리 끝으로 내렸어요");
            setDialog(null);
            await refreshAll();
          }}
        />
      </Modal>
    );
  }

  // 토큰 충전
  const c = dialog.customer;
  const amt = parseGrantAmount(amount);
  return (
    <Modal title="토큰 충전" onClose={close} busy={busy}>
      <p className="text-sm text-[#6b7684]">
        <b>{c.username}</b> 님께 토큰을 넣어 드려요.
      </p>
      <label className="flex flex-col gap-1.5 text-xs font-bold text-[#8b95a1]">
        토큰 수 (1~1000)
        <input
          type="number"
          min={1}
          max={1000}
          step={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="rounded-xl border border-[#e5e8eb] px-3 py-2 text-sm font-normal text-[#191f28]"
          autoFocus
        />
      </label>
      <label className="flex flex-col gap-1.5 text-xs font-bold text-[#8b95a1]">
        왜 넣어 주나요? (기록에 남아요)
        <input
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 200))}
          placeholder="예: 저장 실패 보상"
          className="rounded-xl border border-[#e5e8eb] px-3 py-2 text-sm font-normal text-[#191f28] placeholder:text-[#c4cad1]"
        />
      </label>
      <div className="rounded-lg bg-[#f9fafb] px-2.5 py-2 text-xs text-[#6b7684]">
        {c.username} 잔액 <span className="tabular-nums">{c.tokens}</span> →{" "}
        <span className="tabular-nums">{amt.ok ? c.tokens + amt.value : "?"}</span>토큰
        <span className="mt-0.5 block text-[#b0b8c1]">충전과 사유는 기록(token_grants)에 함께 남아요.</span>
      </div>
      {!amt.ok && amount !== "" && <p className="text-xs font-bold text-[#f04452]">{amt.error}</p>}
      {errLine}
      <Actions
        onCancel={close}
        okLabel="충전"
        okClass="bg-[#3182f6]"
        busy={busy}
        disabled={!amt.ok}
        onOk={async () => {
          if (!amt.ok) return;
          setBusy(true);
          setError(null);
          const r = await api<{ tokens: number }>("/api/admin/grant", {
            user: c.id,
            amount: amt.value,
            reason: note.trim(),
          });
          setBusy(false);
          if (!r.ok) return setError(r.error);
          say(`${c.username} 잔액 +${amt.value}토큰 (지금 ${r.data.tokens}토큰)`);
          setDialog(null);
          await refreshAll();
        }}
      />
    </Modal>
  );
}
