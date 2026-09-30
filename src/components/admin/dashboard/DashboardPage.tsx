"use client";

/**
 * 대시보드(/admin) — 오늘과 최근 7일 숫자, 처리할 일, 최근 가입, 옛 그림 정리.
 *
 *  · 숫자는 전부 서버(GET /api/admin/dashboard)가 세서 준다 — 화면은 보여 주기만 한다.
 *  · 숫자마다 기간(오늘 · 7일 · 전체)을 이름에 적는다 — "새 회원 3"만 있으면 언제 기준인지 모른다.
 *  · 못 읽은 숫자는 '–'와 "일부 숫자를 못 읽었어요" — 0 으로 보이면 "오늘 아무도 안 왔다"로 오해한다.
 *  · 관리자 계정에서 생긴 기록은 빼고 센다(사장님 2026-09-30). '내 계정 것도 보기'(?mine=1)를 켜면 함께 센다.
 *  · 실제 결제(원) 숫자는 없다 — 결제사를 붙이기 전이라 '연동 전' 안내 카드만 둔다.
 */
import { formatDateKo } from "@/lib/admin";
import { needsAttention, PART_LABEL, type DashboardResponse } from "@/lib/admin-dashboard";
import { groupDigits } from "@/lib/admin-console";
import {
  AdminLink,
  Badge,
  Banner,
  Button,
  Card,
  CardTitle,
  ErrorState,
  Icon,
  PageHeader,
  Skeleton,
  StatCard,
  Switch,
  TimeText,
  useAdminQuery,
  useMineParam,
} from "@/components/admin/kit";
import { OldArtTool } from "./OldArtTool";
import { WeekBars } from "./WeekBars";

/** 숫자 + 단위, 못 읽었으면 '–'. */
const n = (v: number | null | undefined, unit: string) => (typeof v === "number" ? `${groupDigits(v)}${unit}` : "–");

export function DashboardPage() {
  const [mine, setMine] = useMineParam();
  const q = useAdminQuery<DashboardResponse>(`/api/admin/dashboard${mine ? "?mine=1" : ""}`, { keepOnChange: true });
  const d = q.data;
  // 의견·오류 화면으로 갈 때 스위치를 그대로 들고 간다(켜고 보던 숫자와 목록이 같게).
  const support = (tab: string, extra = "") => `/admin/support?tab=${tab}${extra}${mine ? "&mine=1" : ""}`;

  return (
    <>
      <PageHeader
        title="대시보드"
        meta={
          d ? (
            <>
              한국 시간 기준 · <TimeText iso={d.now} mode="datetime" />에 셌어요
            </>
          ) : (
            "한국 시간 기준"
          )
        }
        actions={
          <>
            <Switch checked={mine} onChange={setMine} label="내 계정 것도 보기" />
            <Button tone="secondary" onClick={q.reload} disabled={q.loading}>
              <Icon name="refresh" size={16} />
              {q.loading && d ? "세는 중…" : "새로 고침"}
            </Button>
          </>
        }
      />

      {mine ? (
        <Banner tone="info" title="내 계정에서 생긴 기록도 함께 보여요">
          메뉴 숫자에는 넣지 않아요.
        </Banner>
      ) : null}

      {!d && q.error ? (
        <ErrorState message={q.error} onRetry={q.reload} />
      ) : !d ? (
        <DashboardSkeleton />
      ) : (
        <>
          {d.partial.length ? (
            <Banner
              tone="warn"
              title="일부 숫자를 못 읽었어요"
              action={
                <Button tone="secondary" size="sm" onClick={q.reload} disabled={q.loading}>
                  다시 시도
                </Button>
              }
            >
              {d.partial.map((p) => PART_LABEL[p]).join(" · ")} 숫자는 &apos;–&apos;로 보여요.
            </Banner>
          ) : null}
          {d.truncated ? (
            <Banner tone="info" title="기록이 많아 읽을 수 있는 만큼만 셌어요">
              실제 숫자는 이보다 클 수 있어요.
            </Banner>
          ) : null}

          <Attention d={d} support={support} />

          {/* 핵심 숫자 — 이름에 기간을 적는다 */}
          <section aria-label="오늘 숫자" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="새 회원 · 오늘"
              value={d.members.today}
              unit="명"
              sub={`7일 ${n(d.members.week, "명")} · 전체 ${n(d.members.total, "명")}`}
            />
            <StatCard label="만든 동화 · 오늘" value={d.books.today} unit="권" sub={`7일 ${n(d.books.week, "권")}`} />
            <StatCard
              label="쓴 토큰 · 오늘"
              value={d.tokensSpent.today}
              unit="토큰"
              sub={`7일 ${n(d.tokensSpent.week, "토큰")}`}
              hint="대본·그림·목소리·가족 캐릭터, 되돌린 것 빼고"
            />
            <StatCard
              label="되돌린 토큰 · 오늘"
              value={d.tokensRefunded.today}
              unit="토큰"
              sub={`7일 ${n(d.tokensRefunded.week, "토큰")}`}
              hint="앱이 스스로 되돌린 것도 들어가요"
            />
          </section>

          <Card>
            <CardTitle hint="한국 날짜 기준">최근 7일</CardTitle>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <WeekBars title="새 회원" unit="명" tone="blue" days={d.days} pick={(x) => x.members} />
              <WeekBars title="만든 동화" unit="권" tone="gray" days={d.days} pick={(x) => x.books} />
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <RecentMembers d={d} />
            <section className="flex flex-col gap-3 rounded-2xl bg-[#f9fafb] p-5 ring-1 ring-inset ring-[#e5e8eb]">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[17px] font-bold tracking-tight text-[#191f28]">실제 결제</h2>
                <Badge tone="amber">연동 전</Badge>
              </div>
              <p className="break-keep text-sm font-medium leading-relaxed text-[#6b7684]">
                결제사를 연결하면 오늘 매출·구독 수가 여기 보여요. 지금 숫자는 전부 토큰이에요.
              </p>
              <AdminLink
                href="/admin/billing"
                className="inline-flex min-h-11 items-center gap-1 self-start rounded-xl bg-white px-4 text-sm font-bold text-[#1b64da] ring-1 ring-inset ring-[#e5e8eb] hover:bg-[#e8f3ff] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#3182f6]"
              >
                결제·구독 화면 보기
                <Icon name="chevron" size={16} />
              </AdminLink>
            </section>
          </div>
        </>
      )}

      <OldArtTool />
    </>
  );
}

/** 처리할 일 — 있을 때만 카드, 없으면 조용한 초록 한 줄. 못 읽었으면 '–' 카드로(없다고 단정하지 않는다). */
function Attention({ d, support }: { d: DashboardResponse; support: (tab: string, extra?: string) => string }) {
  const state = needsAttention(d);
  if (state === "none") {
    return (
      <p role="status" className="flex items-center gap-2 rounded-2xl bg-[#e6f7ef] px-4 py-3 text-sm font-bold text-[#00976b]">
        <Icon name="check" size={16} />
        지금 처리할 일이 없어요
      </p>
    );
  }
  const paid = d.incidents?.paidNotSaved ?? null;
  return (
    <section aria-label="처리할 일" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {paid !== null && paid > 0 ? (
        <StatCard
          label="돈 냈는데 책 없음"
          value={paid}
          unit="건"
          tone="red"
          sub="토큰을 냈는데 책이 저장되지 않았어요"
          href={support("incidents", "&kind=paid_not_saved")}
        />
      ) : null}
      <StatCard
        label="열린 사고"
        value={d.incidents?.open ?? null}
        unit="건"
        tone={d.incidents && d.incidents.open > 0 ? "amber" : "default"}
        sub={d.incidents ? `멈춘 만들기 ${groupDigits(d.incidents.stuck)}건` : "못 읽었어요"}
        href={support("incidents")}
      />
      <StatCard
        label="남은 의견"
        value={d.feedback?.open ?? null}
        unit="건"
        tone={d.feedback && d.feedback.open > 0 ? "blue" : "default"}
        sub={d.feedback ? "답하거나 처리 끝으로 표시할 글" : "못 읽었어요"}
        href={support("feedback")}
      />
    </section>
  );
}

function RecentMembers({ d }: { d: DashboardResponse }) {
  return (
    <Card>
      <CardTitle hint={<AdminLink href="/admin/members" className="font-bold text-[#1b64da] hover:underline">회원 전체</AdminLink>}>
        최근 가입
      </CardTitle>
      {d.partial.includes("members") && d.recentMembers.length === 0 ? (
        <p className="text-sm font-medium text-[#8b95a1]">회원을 못 읽었어요.</p>
      ) : d.recentMembers.length === 0 ? (
        <p className="text-sm font-medium text-[#8b95a1]">아직 가입한 회원이 없어요.</p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {d.recentMembers.map((m) => (
            <li key={m.id}>
              <AdminLink
                href={`/admin/members/${m.id}`}
                className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-2 text-sm hover:bg-[#f9fafb] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#3182f6]"
              >
                <span className="min-w-0 truncate font-bold text-[#191f28]">{m.username}</span>
                <span className="shrink-0 text-[13px] font-medium tabular-nums text-[#8b95a1]" title={formatDateKo(m.createdAt)}>
                  <TimeText iso={m.createdAt} />
                </span>
              </AdminLink>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="숫자를 세는 중">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="rounded-2xl bg-white px-5 py-4">
            <Skeleton lines={2} />
          </div>
        ))}
      </div>
      <div className="rounded-2xl bg-white p-5">
        <Skeleton lines={4} />
      </div>
    </div>
  );
}
