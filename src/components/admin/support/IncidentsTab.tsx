"use client";

/**
 * 의견·오류 › 사고 탭 — "토큰은 나갔는데 책이 없어요" 같은 만들기 사고를 급한 순으로 보고 처리한다.
 * 옛 관리실(한 화면 /admin)의 사고 목록·오늘 현황을 옮겨 왔다(2026-09-30).
 *
 * 옛 화면과 같게 지키는 것:
 *  · 늦게 온 옛 응답 버리기(useAdminQuery 의 순서 번호 = 옛 incSeq) · 처리 뒤엔 목록을 다시 읽기(짐작으로 안 고침)
 *  · 종류 칩(개수) · '처리 끝난 것도 보기'(켜면 종류 거르기를 푼다) · 급한 순 정렬 · 잘림 안내
 *  · 줄을 누르면 사고 서랍(CaseDrawer) — 환불·되살리기·처리 끝은 서랍 안의 확인창을 지난다
 * 달라진 것: 거르기·열린 서랍이 주소에 있다(?kind= ?resolved=1 ?job= ?entry=) — 새로 고쳐도, 링크를 건네도 같은 화면.
 *
 * 관리자 계정에서 생긴 사고는 서버가 빼고 준다('내 계정 것도 보기'를 켜면 함께 온다).
 * 메뉴 숫자는 스위치가 꺼져 있을 때만 이 목록 숫자로 맞추고, 켜져 있으면 서버에 다시 세게 한다(badgePlan).
 */
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { rowSeverity, statusLabel, type IncidentListRow, type IncidentsResponse } from "@/lib/admin";
import {
  badgePlan,
  caseKey,
  incidentCase,
  incidentKey,
  incidentsPath,
  kindOptions,
  parseKindParam,
  visibleIncidents,
} from "@/lib/admin-support";
import {
  Badge,
  Banner,
  ChipGroup,
  DataTable,
  EmptyState,
  ErrorState,
  FilterBar,
  Icon,
  StatCard,
  Switch,
  TimeText,
  useAdminQuery,
  type Column,
} from "@/components/admin/kit";
import { useAdmin } from "@/components/admin/shell/AdminContext";
import { CaseDrawer } from "@/components/admin/cases/CaseDrawer";
import { KindChip, Money, SEV_BAR } from "@/components/admin/cases/case-ui";
import { useCaseParam } from "@/components/admin/cases/useCaseParam";
import { usePatchParams } from "./usePatchParams";

const COLUMNS: Column<IncidentListRow>[] = [
  {
    key: "title",
    header: "동화",
    width: "30%",
    mobile: "title",
    cell: (r) => (
      <span className="flex min-w-0 items-center gap-2.5">
        {/* 급한 정도 띠 — 색만으로 뜻을 전하지 않는다(옆 '사고 종류' 칸에 글자로 있다). */}
        <span aria-hidden className={`h-5 w-1 shrink-0 rounded-full ${SEV_BAR[rowSeverity(r.kinds, !!r.resolved_at)]}`} />
        <span className="min-w-0 break-words font-bold">
          {r.title ?? <span className="text-[#b0b8c1]">(만들기 기록 없음)</span>}
        </span>
      </span>
    ),
  },
  {
    key: "member",
    header: "고객",
    cell: (r) => <b className="font-bold text-[#4e5968]">{r.username ?? "(아이디 없음)"}</b>,
  },
  {
    key: "kinds",
    header: "사고 종류",
    cell: (r) => (
      <span className="inline-flex flex-wrap gap-1">
        {r.kinds.map((k) => (
          <KindChip key={k} kind={k} />
        ))}
      </span>
    ),
  },
  {
    key: "progress",
    header: "진행",
    cell: (r) => (
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[#6b7684]">
        {r.status ? <span>{statusLabel(r.status)}</span> : null}
        {r.page_count ? (
          <span className="tabular-nums">
            그림 {r.drawn ?? 0}/{r.page_count}
          </span>
        ) : null}
        {r.resolved_at ? <Badge tone="green">처리 끝</Badge> : null}
      </span>
    ),
  },
  {
    key: "tokens",
    header: "토큰 결제",
    cell: (r) => (
      <span className="inline-flex flex-wrap gap-x-2.5 gap-y-0.5 text-[13px] text-[#6b7684] md:flex-col">
        {r.story_entry ? <Money label="대본" amount={r.story_amount} refunded={!!r.story_refunded_at} /> : null}
        {r.illustration_entry ? (
          <Money label="그림" amount={r.illustration_amount} refunded={!!r.illustration_refunded_at} />
        ) : null}
        {!r.story_entry && !r.illustration_entry ? <span className="text-[#b0b8c1]">–</span> : null}
      </span>
    ),
  },
  {
    key: "updated",
    header: "마지막 움직임",
    align: "right",
    cell: (r) => (
      <span className="whitespace-nowrap text-[13px] text-[#8b95a1]">
        <TimeText iso={r.updated_at} />
      </span>
    ),
  },
];

export function IncidentsTab({ mine, active }: { mine: boolean; active: boolean }) {
  const { setBadge, refreshBadges } = useAdmin();
  const sp = useSearchParams();
  const patch = usePatchParams();
  const resolved = sp.get("resolved") === "1";
  const kind = parseKindParam(sp.get("kind"));

  // 거르기(처리 끝 포함 · 스위치)를 바꿔도 새 응답이 올 때까지 앞 목록을 그대로 둔다(깜빡임 없이).
  const q = useAdminQuery<IncidentsResponse>(incidentsPath({ resolved, mine }), { keepOnChange: true });
  const data = q.data;
  const rows = useMemo(() => data?.incidents ?? [], [data]);
  const options = useMemo(() => kindOptions(rows, kind), [rows, kind]);
  const visible = useMemo(() => visibleIncidents(rows, kind), [rows, kind]);

  const { open, openCase, closeCase } = useCaseParam();
  const lastRow = useRef<HTMLElement | null>(null);

  // 읽고 나면 메뉴 숫자를 맞춘다. 읽는 중(앞 목록을 들고 있을 때)에는 그 목록이 지금 거르기 것이 아니라 건드리지 않는다.
  useEffect(() => {
    if (!data || q.loading) return;
    if (badgePlan({ mine, resolved }) === "set") {
      setBadge("incidents", data.openCount);
      setBadge("paidNotSaved", data.today.paidNotSaved);
    } else refreshBadges();
  }, [data, q.loading, mine, resolved, setBadge, refreshBadges]);

  const today = data?.today ?? null;
  const truncated = !!data && data.total > data.incidents.length;
  const filtered = kind !== "" || resolved;

  const empty = kind ? (
    <EmptyState
      icon="check"
      title="이 종류의 사고가 없어요"
      body={resolved ? "처리 끝난 것까지 봤지만 없어요." : "지금 열린 사고 중에는 없어요."}
      action={
        <button type="button" onClick={() => patch({ kind: null })} className={LINK_BTN}>
          전체 보기
        </button>
      }
    />
  ) : (
    <EmptyState
      icon="check"
      title={resolved ? "사고 기록이 없어요" : "처리할 사고가 없어요"}
      body="돈은 나갔는데 책이 없거나, 만들다 멈춘 기록이 여기 모여요. 만드는 중(30분 안에 움직인 것)은 사고로 치지 않아요."
    />
  );

  return (
    <div className="flex flex-col gap-4">
      {/* 오늘 현황 — 옛 관리실 '사고' 화면 위 네 칸. 열린 수는 날짜와 상관없이 지금 열린 것 전부다. */}
      <section aria-label="오늘 현황" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="돈 냈는데 책 없음"
          value={today ? today.paidNotSaved : null}
          unit="건"
          tone={today && today.paidNotSaved > 0 ? "red" : "default"}
          sub="지금 열린 것"
        />
        <StatCard
          label="멈춘 만들기"
          value={today ? today.stuck : null}
          unit="건"
          tone={today && today.stuck > 0 ? "amber" : "default"}
          sub="지금 열린 것"
        />
        <StatCard label="오늘 만든 동화" value={today ? today.booksToday : null} unit="권" sub="한국 시간 오늘" />
        <StatCard label="오늘 되돌린 토큰" value={today ? today.refundedTokens : null} unit="토큰" sub="한국 시간 오늘" />
      </section>

      <FilterBar
        resultText={data ? `${visible.length}건` : q.loading ? "불러오는 중…" : undefined}
        onReset={filtered ? () => patch({ kind: null, resolved: null }) : undefined}
      >
        <ChipGroup
          label="사고 종류로 거르기"
          value={kind}
          onChange={(v) => patch({ kind: v || null })}
          options={options}
        />
        <Switch
          checked={resolved}
          // 켜고 끌 때 종류 거르기를 푼다 — 옛 화면과 같다(처리 끝 포함 목록에는 종류 개수가 달라진다).
          onChange={(v) => patch({ resolved: v ? "1" : null, kind: null })}
          label="처리 끝난 것도 보기"
        />
        <button type="button" onClick={q.reload} disabled={q.loading} className={LINK_BTN} aria-label="사고 목록 새로 읽기">
          <Icon name="refresh" size={16} />
          {q.loading && data ? "읽는 중…" : "새로 읽기"}
        </button>
      </FilterBar>

      {q.error && data ? (
        <Banner
          tone="danger"
          title="최신 목록을 못 읽었어요"
          action={
            <button type="button" onClick={q.reload} className={LINK_BTN}>
              다시 시도
            </button>
          }
        >
          아래는 마지막으로 읽은 목록이에요. {q.error}
        </Banner>
      ) : null}

      {q.error && !data ? (
        <ErrorState message={q.error} onRetry={q.reload} />
      ) : (
        <DataTable
          caption="사고 목록 — 급한 순"
          columns={COLUMNS}
          rows={visible}
          rowKey={incidentKey}
          loading={q.loading && !data}
          selectedKey={caseKey(open)}
          onRowClick={(r, el) => {
            const c = incidentCase(r);
            if (!c) return;
            lastRow.current = el;
            openCase(c);
          }}
          rowTone={(r) => (r.resolved_at ? "muted" : null)}
          empty={empty}
          footer={
            <>
              급한 순서로 보여요. 만드는 중(30분 안에 움직인 것)은 사고로 치지 않아요.
              {truncated && data ? ` 전체 ${data.total}건 중 최근 ${data.incidents.length}건만 보여요.` : ""}
            </>
          }
        />
      )}

      {/* 다른 탭을 보는 동안에는 서랍을 그리지 않는다 — 감춘 탭 안에서 Esc 가 서랍을 닫는 일이 없게. */}
      <CaseDrawer
        open={active ? open : null}
        onClose={() => {
          closeCase();
          // 서랍을 연 줄로 초점을 돌린다(키보드로 목록을 이어 보게).
          lastRow.current?.focus();
        }}
        onChanged={q.reload}
        showCustomerLink
      />
    </div>
  );
}

const LINK_BTN =
  "inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-bold text-[#6b7684] hover:bg-white hover:text-[#4e5968] disabled:opacity-50";
