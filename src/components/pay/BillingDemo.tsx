"use client";

/**
 * /billing 내 결제·구독 (시연) — 지금 요금제, 남은 책, 다음 결제일, 크레딧 안내, 잠긴 해지,
 * 스타트팩(산 뒤에만) · 내 크레딧(시연 잔액) · 결제 내역.
 * 요금제 값(값·책 수)은 관리실 값(terms) — 서버 page 가 읽어 넘긴다.
 * 화면 갈래: loading → login(비회원) → soon(스위치 off — 시연 기록을 읽지 않는다) → ready.
 * 값은 이 탭의 시연 기록에서만 읽는다. 앱의 잔액·만들기 권한과 아무 관계가 없다.
 *
 * TODO(PG-HOOK-5) 진짜 PG: 시연 기록 대신 내 구독·결제 줄을 본인 것만 조회한다(RLS).
 * TODO(PG-HOOK-6) 진짜 PG: 해지 서버 경로(api/billing/cancel). 다음 결제만 멈추고, 결제한 기간이 끝날 때까지는 계속 쓸 수 있다.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { LockIcon } from "@/components/family/icons";
import { TopBar } from "@/components/family/ui";
import { loadSession } from "@/lib/auth";
import { PAY_DEMO, clearDemoState, readDemoState, receiptName, type DemoState } from "@/lib/pay-demo";
import {
  CREDIT_EXTRAS_TEXT,
  DEFAULT_PLAN_TERMS,
  booksText,
  creditsText,
  formatDateKo,
  formatShortDateKo,
  plansOf,
  won,
  type PlanTerms,
} from "@/lib/plans";
import {
  BigLink,
  BookDots,
  Card,
  CardTitle,
  DemoPill,
  FOCUS,
  InfoBox,
  LoginCard,
  PayShell,
  Row,
  SkeletonCard,
  SoftLink,
} from "./pay-ui";
import { SiteFooter } from "./SiteFooter";

type View = { kind: "loading" } | { kind: "login" } | { kind: "soon" } | { kind: "ready"; uid: string; state: DemoState };

export function BillingDemo({ terms = DEFAULT_PLAN_TERMS }: { terms?: PlanTerms }) {
  const router = useRouter();
  const plans = plansOf(terms);
  const { theme } = useTheme();
  const colors = theme.colors;
  const [view, setView] = useState<View>({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    loadSession()
      .then((s) => {
        if (!alive) return;
        if (!s.uid) {
          setView({ kind: "login" });
          return;
        }
        if (PAY_DEMO === "off") {
          setView({ kind: "soon" });
          return;
        }
        setView({ kind: "ready", uid: s.uid, state: readDemoState(s.uid) });
      })
      .catch(() => {
        if (alive) setView({ kind: "login" });
      });
    return () => {
      alive = false;
    };
  }, []);

  const top = (
    <div className="rounded-full bg-white/90 px-1.5 py-1.5 shadow-xl backdrop-blur">
      <TopBar onBack={() => router.push("/settings")} title="내 결제·구독" />
    </div>
  );

  if (view.kind === "loading") {
    return (
      <PayShell>
        <SkeletonCard />
      </PayShell>
    );
  }
  if (view.kind === "login") {
    return (
      <PayShell>
        <LoginCard colors={colors} then="설정 › 내 결제·구독" />
      </PayShell>
    );
  }
  if (view.kind === "soon") {
    return (
      <PayShell>
        {top}
        <Card className="flex flex-col items-center text-center">
          <h1 className="break-keep text-[21px] font-extrabold text-neutral-800">아직 쓰는 요금제가 없어요</h1>
          <p className="mt-1.5 break-keep text-[13px] font-medium text-neutral-500">
            결제는 곧 열려요. 열리면 여기에서 결제·구독을 볼 수 있어요.
          </p>
          <div className="mt-5 w-full">
            <BigLink href="/plans" colors={colors}>
              요금제 보기
            </BigLink>
          </div>
        </Card>
        <SiteFooter compact />
      </PayShell>
    );
  }

  const { uid, state } = view;
  const pass = state.pass;
  const passPlan = pass ? plans[pass.plan] : null;
  const starter = state.starter;
  const hasRecord = !!(pass || starter || state.credits || state.receipts.length || state.pending);

  function clearRecord() {
    clearDemoState(uid);
    setView({ kind: "ready", uid, state: readDemoState(uid) });
  }

  return (
    <PayShell demo>
      {top}
      <h1 className="sr-only">내 결제·구독</h1>

      {pass && passPlan ? (
        <Card labelledBy="now-plan">
          <CardTitle id="now-plan" right={<DemoPill />}>
            지금 쓰는 요금제
          </CardTitle>
          <p className="text-[17px] font-extrabold text-neutral-800">{passPlan.name}</p>
          <InfoBox className="mt-3">
            <Row label="이번 달 남은 책">
              <span className="flex flex-wrap items-center justify-end gap-2">
                <span className="text-[17px]" style={{ color: colors.accentDark }}>
                  {booksText(pass.booksLeft)}
                </span>
                <BookDots n={pass.booksLeft} color={colors.accent} />
              </span>
            </Row>
            <Row label="다음 결제일">
              {formatDateKo(new Date(pass.nextBillingAt))} · {won(passPlan.priceWon)}
            </Row>
          </InfoBox>
          <div className="mt-4 flex flex-col gap-3">
            {/* 추가 3권은 크레딧으로 바뀌었다(2026-10-01) — 요금제 화면의 크레딧 칸으로 바로 */}
            <SoftLink href="/plans#credits">책이 더 필요하면 크레딧 보기</SoftLink>
            <Link
              href="/plans"
              className={`mx-auto inline-flex min-h-11 items-center rounded-full px-3 text-sm font-extrabold underline underline-offset-2 ${FOCUS}`}
              style={{ color: colors.accentDark }}
            >
              요금제 보기 ›
            </Link>
          </div>
          <div className="mt-5 border-t border-stone-200/70 pt-4">
            {/* 잠긴 해지 — disabled 가 아니라 aria-disabled 라 키보드·화면 읽기가 닿아 이유를 읽는다. */}
            <button
              type="button"
              aria-disabled="true"
              aria-describedby="cancel-why"
              onClick={(e) => e.preventDefault()}
              className={`flex min-h-12 w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-full bg-neutral-100 px-4 text-[15px] font-extrabold text-neutral-500 ${FOCUS}`}
            >
              <LockIcon />
              해지하기
            </button>
            <p id="cancel-why" className="mt-2 break-keep text-center text-xs font-medium leading-relaxed text-neutral-500">
              해지는 결제가 열리면 여기서 바로 할 수 있어요.
              <br />
              해지해도 결제한 기간이 끝날 때까지는 그대로 쓸 수 있어요.
            </p>
          </div>
        </Card>
      ) : (
        <Card labelledBy="no-plan">
          <CardTitle id="no-plan">아직 쓰는 요금제가 없어요</CardTitle>
          <p className="break-keep text-[13px] font-medium text-neutral-500">
            {starter
              ? `가족 패스로 매달 새 동화책 ${booksText(terms.monthly.booksPerMonth)}을 만들 수 있어요.`
              : `처음이라면 스타트팩(${won(terms.starter.priceWon)})으로 동화 ${booksText(terms.starter.books)}부터 만들어 볼 수 있어요.`}
          </p>
          <div className="mt-4">
            <BigLink href="/plans" colors={colors}>
              요금제 보기
            </BigLink>
          </div>
        </Card>
      )}

      {/* 스타트팩 — 산 뒤에만(처음 한 번만 산다) */}
      {starter && (
        <Card labelledBy="starter-now">
          <CardTitle id="starter-now" right={<DemoPill />}>
            스타트팩
          </CardTitle>
          <InfoBox>
            <Row label="만들 수 있는 동화">
              <span className="flex flex-wrap items-center justify-end gap-2">
                <span className="text-[17px]" style={{ color: colors.accentDark }}>
                  {booksText(starter.booksLeft)}
                </span>
                <BookDots n={starter.booksLeft} color={colors.accent} />
              </span>
            </Row>
            <Row label="산 날">{formatDateKo(new Date(starter.boughtAt))}</Row>
          </InfoBox>
        </Card>
      )}

      {/* 내 크레딧 — 시연 잔액. 사는 곳은 요금제 화면의 크레딧 칸 */}
      <Card labelledBy="credit-now">
        <CardTitle id="credit-now" right={<DemoPill />}>
          내 크레딧
        </CardTitle>
        <p
          className={`text-[28px] font-extrabold leading-tight tabular-nums ${state.credits ? "" : "text-neutral-400"}`}
          style={state.credits ? { color: colors.accentDark } : undefined}
        >
          {creditsText(state.credits)}
        </p>
        <p className="mt-1 break-keep text-[13px] font-medium text-neutral-500">
          {state.credits
            ? `가족 패스·스타트팩에 든 몫을 다 쓴 뒤 ${CREDIT_EXTRAS_TEXT}를 더할 때 써요.`
            : "아직 크레딧이 없어요. 더 필요할 때 요금제 화면에서 살 수 있어요."}
        </p>
        <div className="mt-4">
          <SoftLink href="/plans#credits">크레딧 보기</SoftLink>
        </div>
      </Card>

      <Card labelledBy="receipts">
        <CardTitle id="receipts">결제 내역</CardTitle>
        {state.receipts.length ? (
          <ul className="flex flex-col rounded-[20px] bg-stone-50 px-4 py-1 shadow-[inset_0_0_0_1px_#f0ede8]">
            {state.receipts.map((r) => (
              <li key={r.orderId} className="flex min-h-[46px] items-center gap-2 border-b border-stone-200/70 py-2 last:border-b-0">
                <span className="w-12 shrink-0 text-[13px] font-bold tabular-nums text-neutral-500">
                  {formatShortDateKo(new Date(r.at))}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-extrabold text-neutral-800">{receiptName(r, terms)}</span>
                <span className="shrink-0 text-sm font-extrabold text-neutral-800">{won(r.amountWon)}</span>
                <DemoPill />
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-[20px] bg-stone-50 px-4 py-4 text-center text-sm font-bold text-neutral-500 shadow-[inset_0_0_0_1px_#f0ede8]">
            아직 결제한 적이 없어요
          </p>
        )}
        <p className="mt-3 break-keep text-[11px] font-medium text-neutral-500">실제 결제 내역은 여기에 모여요.</p>
      </Card>

      {hasRecord && (
        <button
          type="button"
          onClick={clearRecord}
          className={`mx-auto min-h-11 rounded-full px-3 text-xs font-bold text-neutral-600 underline underline-offset-2 ${FOCUS}`}
        >
          시연 기록 지우기
        </button>
      )}

      <SiteFooter compact />
    </PayShell>
  );
}
