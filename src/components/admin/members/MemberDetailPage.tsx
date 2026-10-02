"use client";

/**
 * 회원 한 명(/admin/members/<id>) — 잔액·동화·열린 사고·부모 목소리, 요금제(지정·한도·쓴 양), 그리고 탭 다섯:
 * 만들기 기록 · 토큰 장부 · 충전 기록 · 책 · 실제 결제.
 *
 * 옛 관리실 '고객 찾기'(잔액·만들기 기록·토큰 충전)와 설정 화면 관리실(책 목록·목소리 배지)을 한 화면에 모았다(2026-09-30).
 *  · 읽기 둘: /api/admin/customer?id= (잔액·만들기 기록) · /api/admin/member?id= (책·목소리·장부·충전).
 *    한쪽이 실패해도 다른 쪽은 보인다.
 *  · 탭은 주소(?tab=)에, 사고 서랍은 주소(?job= / ?entry=)에 둔다 — 링크로 건네고 새로 고쳐도 같은 화면.
 *    탭은 감추기만 하고 내리지 않는다(쓰던 확인창·스크롤이 살아 있게). 실제 결제 탭만 처음 열 때 읽는다.
 *  · 토큰 충전·토큰 환불·책 되살리기는 전부 확인창을 거치고, 끝나면 서버에서 다시 읽는다(짐작으로 고치지 않는다).
 *  · 한 사람을 콕 집어 여는 화면이라 관리자 계정 거르기를 하지 않는다(내 계정도 점검용으로 열 수 있다).
 * id 가 uuid 모양이 아니면 서버에 묻지 않고 '못 찾았어요'를 보여 준다.
 */
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { formatDateKo, isUuid, type CustomerResponse } from "@/lib/admin";
import { groupDigits } from "@/lib/admin-console";
import { voiceSummary, type MemberExtras, type MemberExtrasPart } from "@/lib/admin-members";
import {
  Banner,
  Button,
  CopyButton,
  EmptyState,
  ErrorState,
  PageHeader,
  SectionTabs,
  Skeleton,
  StatCard,
  useAdminQuery,
  useTabParam,
} from "@/components/admin/kit";
import { CaseDrawer } from "@/components/admin/cases/CaseDrawer";
import { GrantDialog } from "@/components/admin/cases/GrantDialog";
import { useCaseParam, type CaseOpen } from "@/components/admin/cases/useCaseParam";
import { DeleteMemberDialog } from "./DeleteMemberDialog";
import { MemberBooks } from "./MemberBooks";
import { MemberGrants } from "./MemberGrants";
import { MemberJobs } from "./MemberJobs";
import { MemberLedger } from "./MemberLedger";
import { MemberPayments } from "./MemberPayments";
import { MemberPlanCard } from "./MemberPlanCard";
import { MembersBackLink } from "./member-ui";

const TABS = ["jobs", "ledger", "grants", "books", "payments"] as const;

export function MemberDetailPage({ id }: { id: string }) {
  if (!isUuid(id)) {
    return (
      <>
        <PageHeader title="회원" actions={<MembersBackLink memberId={id} />} />
        <EmptyState icon="users" title="회원을 찾지 못했어요" body="주소의 회원 id 모양이 올바르지 않아요." />
      </>
    );
  }
  // 다른 회원으로 옮겨 가면 통째로 새로 — 앞 회원의 탭 내용·확인창이 남지 않게.
  return <MemberDetail key={id.toLowerCase()} id={id.toLowerCase()} />;
}

function MemberDetail({ id }: { id: string }) {
  const cust = useAdminQuery<CustomerResponse>(`/api/admin/customer?id=${id}`);
  const extra = useAdminQuery<MemberExtras>(`/api/admin/member?id=${id}`);
  const [tab, setTab] = useTabParam("tab", TABS, "jobs");
  const { open, openCase, closeCase } = useCaseParam();
  const [grantOpen, setGrantOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const router = useRouter();
  // 서랍을 연 줄 — 닫으면 거기로 초점을 돌린다(키보드로 다음 줄을 이어 보게).
  const lastRow = useRef<HTMLElement | null>(null);

  // 실제 결제 탭은 처음 열 때부터 읽는다(탭을 옮겨도 읽은 것은 그대로 둔다).
  const [paySeen, setPaySeen] = useState(tab === "payments");
  if (tab === "payments" && !paySeen) setPaySeen(true);

  const { reload: reloadCust } = cust;
  const { reload: reloadExtra } = extra;
  const reloadAll = useCallback(() => {
    reloadCust();
    reloadExtra();
  }, [reloadCust, reloadExtra]);

  const onOpenCase = useCallback(
    (o: CaseOpen, el: HTMLElement) => {
      lastRow.current = el;
      openCase(o);
    },
    [openCase],
  );
  const onCloseCase = useCallback(() => {
    closeCase();
    requestAnimationFrame(() => lastRow.current?.focus());
  }, [closeCase]);

  const c = cust.data;
  const x = extra.data;
  const notFound = cust.status === 404 || extra.status === 404;

  if (notFound && !c) {
    return (
      <>
        <PageHeader title="회원" actions={<MembersBackLink memberId={id} />} />
        <EmptyState icon="users" title="회원을 찾지 못했어요" body="탈퇴했거나 주소가 틀렸을 수 있어요." />
      </>
    );
  }

  const failed = (part: MemberExtrasPart) => !!x?.failed.includes(part);
  const extraBody = (part: MemberExtrasPart, label: string, body: (data: MemberExtras) => ReactNode) => {
    if (!x && extra.error) return <ErrorState message={extra.error} onRetry={extra.reload} />;
    if (!x) return <TabSkeleton />;
    if (failed(part)) return <ErrorState message={`${label}을(를) 읽지 못했어요.`} onRetry={extra.reload} />;
    return body(x);
  };

  return (
    <>
      <PageHeader
        title={c?.profile.username ?? "회원"}
        description={c ? `가입 ${formatDateKo(c.profile.createdAt)}` : undefined}
        meta={
          <span className="inline-flex flex-wrap items-center gap-1">
            <span className="break-all font-mono text-[12px]">{id}</span>
            <CopyButton value={id} label="id 복사" />
          </span>
        }
        actions={
          <>
            <MembersBackLink memberId={id} />
            <Button tone="primary" onClick={() => setGrantOpen(true)} disabled={!c}>
              토큰 충전
            </Button>
            {/* 관리자 계정은 지우지 못한다(서버·DB 가 막는다) — 버튼부터 감춘다 */}
            {c && !c.profile.isMaster ? (
              <Button tone="danger" onClick={() => setDeleteOpen(true)}>
                회원 지우기
              </Button>
            ) : null}
          </>
        }
      />

      {!c && cust.error ? (
        <ErrorState message={cust.error} onRetry={cust.reload} />
      ) : (
        <section aria-label="회원 요약" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="토큰 잔액" value={c ? c.profile.tokens : null} unit="토큰" />
          <StatCard label="만든 동화" value={c ? c.booksCount : null} unit="권" />
          <StatCard
            label="열린 사고"
            value={c ? c.openIncidents : null}
            unit="건"
            tone={c && c.openIncidents > 0 ? "red" : "default"}
            sub={c && c.openIncidents > 0 ? "만들기 기록에서 줄을 눌러 처리해요" : undefined}
          />
          <StatCard
            label="부모 목소리"
            value={x && !failed("voices") ? voiceSummary(x.readyVoices) : null}
            sub={x && !failed("voices") ? "준비된 목소리만 세요" : undefined}
          />
        </section>
      )}

      {/* 요금제 — 관리자가 지정한다(결제 전 베타). 따로 읽어서 이 카드가 실패해도 나머지는 보인다. */}
      <MemberPlanCard memberId={id} username={c?.profile.username ?? "이 회원"} />

      <SectionTabs
        label="회원 기록"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "jobs", label: "만들기 기록", badge: c && c.openIncidents > 0 ? c.openIncidents : null, badgeTone: "red" },
          { key: "ledger", label: "토큰 장부" },
          { key: "grants", label: "충전 기록" },
          { key: "books", label: "책", badge: x && !failed("books") ? groupDigits(x.books.length) : null },
          { key: "payments", label: "실제 결제" },
        ]}
      />

      <div role="tabpanel" aria-label="만들기 기록" hidden={tab !== "jobs"}>
        {!c && cust.error ? null : (
          <MemberJobs jobs={c?.jobs ?? []} truncated={!!c?.truncated} loading={!c} selected={open} onOpen={onOpenCase} />
        )}
      </div>
      <div role="tabpanel" aria-label="토큰 장부" hidden={tab !== "ledger"}>
        {extraBody("ledger", "토큰 장부", (d) => (
          <MemberLedger
            ledger={d.ledger}
            truncated={d.truncated.ledger}
            member={{ username: c?.profile.username ?? "이 회원", tokens: c ? c.profile.tokens : null }}
            onChanged={reloadAll}
          />
        ))}
      </div>
      <div role="tabpanel" aria-label="충전 기록" hidden={tab !== "grants"}>
        {extraBody("grants", "충전 기록", (d) => <MemberGrants grants={d.grants} truncated={d.truncated.grants} />)}
      </div>
      <div role="tabpanel" aria-label="책" hidden={tab !== "books"}>
        {extraBody("books", "책 목록", (d) => <MemberBooks books={d.books} truncated={d.truncated.books} />)}
      </div>
      <div role="tabpanel" aria-label="실제 결제" hidden={tab !== "payments"}>
        <MemberPayments memberId={id} active={paySeen} />
      </div>

      {x && x.failed.length === 0 && extra.error ? (
        <Banner tone="warn" title="방금 다시 읽지 못했어요">
          마지막으로 읽은 내용을 보여 드리고 있어요. {extra.error}
        </Banner>
      ) : null}

      <CaseDrawer open={open} onClose={onCloseCase} onChanged={reloadAll} showCustomerLink={false} />
      {deleteOpen && c ? (
        <DeleteMemberDialog
          memberId={c.profile.id}
          username={c.profile.username}
          books={c.booksCount}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => router.push("/admin/members")}
        />
      ) : null}
      {grantOpen && c ? (
        <GrantDialog
          customer={{ id: c.profile.id, username: c.profile.username, tokens: c.profile.tokens }}
          onClose={() => setGrantOpen(false)}
          onDone={reloadAll}
        />
      ) : null}
    </>
  );
}

function TabSkeleton() {
  return (
    <div className="rounded-2xl bg-white p-5">
      <Skeleton lines={4} />
    </div>
  );
}
