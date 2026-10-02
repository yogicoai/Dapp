"use client";

/**
 * /checkout/done 시연 결제 완료 — 이 탭에서 방금 시연 결제를 한 회원에게만 그린다.
 *
 * 자격 확인(doneEligibility)을 통과한 뒤에만 완료 화면을 그린다 — 주소를 붙여 넣었거나 다른 탭이면 '결제를 마친 뒤에만'.
 *  fresh : 대기 주문과 번호·요금제가 같다 → 시연 기록에 **한 번** 반영한다.
 *  again : 이미 반영한 번호(새로고침) → 다시 쓰지 않고 그리기만.
 * 보이는 값(요금제·금액·수단·남은 책)은 주소가 아니라 이 탭의 시연 기록에서 읽는다.
 * "남은 책"은 앱의 잔액·만들기 권한과 아무 관계가 없다 — 화면이 그 사실을 꼭 보이게 말한다.
 *
 * TODO(PG-HOOK-2) 진짜 PG: 결제사가 붙여 준 값으로 결제 확인 서버 경로(api/payments/confirm)를 한 번 부른다.
 *  서버가 주문 확인(본인·금액·상태) → 결제사 승인(비밀 키는 서버에서만) → 책 지급 SQL 함수(서버 전용 권한,
 *  같은 주문은 두 번 반영하지 않음) → 영수증 순서로 처리하고, 이 화면은 그 결과만 그린다.
 */

import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { loadSession } from "@/lib/auth";
import { infoText } from "@/lib/business-info";
import {
  PAY_DEMO,
  applyDemoOrder,
  doneEligibility,
  methodLabel,
  readDemoState,
  writeDemoState,
  type DemoPass,
  type DemoReceipt,
  type PayMethodId,
} from "@/lib/pay-demo";
import { DEFAULT_PLAN_TERMS, booksText, formatDateKo, plansOf, won, type PlanId, type PlanTerms } from "@/lib/plans";
import { useSiteInfo } from "@/lib/site-info-client";
import {
  BigLink,
  BookDots,
  Card,
  InfoBox,
  LoginCard,
  NoticeCard,
  PayShell,
  Row,
  SkeletonCard,
  SoftLink,
  SoonCard,
  StatusCircle,
} from "./pay-ui";

type View =
  | { kind: "loading" }
  | { kind: "soon" }
  | { kind: "login" }
  | { kind: "no" }
  | { kind: "ok"; receipt: DemoReceipt; pass: DemoPass | null };

export function DoneDemo({
  orderId,
  plan,
  method,
  terms = DEFAULT_PLAN_TERMS,
}: {
  /** 관리실 요금제 값 — 새 가족 패스의 이번 달 책 수를 여기서 센다(서버 page 가 읽어 넘긴다) */
  terms?: PlanTerms;
  /** isDemoOrderId 를 통과한 값만(서버 page 가 거른다) */
  orderId: string | null;
  plan: PlanId | null;
  method: PayMethodId | null;
}) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const [view, setView] = useState<View>(PAY_DEMO === "off" ? { kind: "soon" } : { kind: "loading" });

  useEffect(() => {
    if (PAY_DEMO === "off") return;
    let alive = true;
    loadSession()
      .then((s) => {
        if (!alive) return;
        if (!s.uid) {
          setView({ kind: "login" });
          return;
        }
        let state = readDemoState(s.uid);
        const e = doneEligibility(state, orderId, plan, method);
        if (e === "no") {
          setView({ kind: "no" });
          return;
        }
        if (e === "fresh") {
          state = applyDemoOrder(state, new Date(), terms);
          writeDemoState(s.uid, state);
        }
        const receipt = state.receipts.find((r) => r.orderId === orderId);
        if (!receipt) {
          setView({ kind: "no" });
          return;
        }
        setView({ kind: "ok", receipt, pass: state.pass });
      })
      .catch(() => {
        if (alive) setView({ kind: "login" });
      });
    return () => {
      alive = false;
    };
  }, [orderId, plan, method, terms]);

  if (view.kind === "loading") {
    return (
      <PayShell>
        <SkeletonCard />
      </PayShell>
    );
  }
  if (view.kind === "soon") {
    return (
      <PayShell>
        <SoonCard colors={colors} />
      </PayShell>
    );
  }
  if (view.kind === "login") {
    return (
      <PayShell>
        <LoginCard colors={colors} />
      </PayShell>
    );
  }
  if (view.kind === "no") {
    return (
      <PayShell demo>
        <NoticeCard title="이 화면은 결제를 마친 뒤에만 볼 수 있어요" body="결제는 요금제 화면에서 시작해 주세요.">
          <BigLink href="/plans" colors={colors}>
            요금제 보기
          </BigLink>
        </NoticeCard>
      </PayShell>
    );
  }

  const { receipt, pass } = view;
  const p = plansOf(terms)[receipt.plan];
  const isSub = p.kind === "subscription";
  const booksLeft = pass?.booksLeft ?? 0;
  const next = isSub && pass ? new Date(pass.nextBillingAt) : null;

  return (
    <PayShell demo>
      <Card className="flex flex-col items-center text-center">
        <StatusCircle tone="ok" />
        <h1 className="mt-3 break-keep text-[21px] font-extrabold text-neutral-800">
          {isSub ? "가족 패스를 시작했어요" : `${p.name}을 더했어요`}
        </h1>
        {/* 제목을 뒤집는 부정문("~더해지지 않았어요") 대신, 시연이 어디까지인지를 말한다. */}
        <p className="mt-1.5 break-keep text-[13px] font-bold leading-relaxed text-amber-800">
          시연 화면이라 실제 결제와
          <br />
          내 계정에는 반영되지 않아요.
        </p>
      </Card>

      <Card>
        <div className="flex flex-col gap-1.5 border-b border-stone-200/70 pb-4">
          <span className="text-[13px] font-bold text-neutral-500">이번 달 남은 책</span>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[36px] font-extrabold leading-none" style={{ color: colors.accentDark }}>
              {booksText(booksLeft)}
            </span>
            <BookDots n={booksLeft} color={colors.accent} />
          </div>
        </div>
        <InfoBox className="mt-4">
          <Row label="요금제">{p.name}</Row>
          <Row label="결제 금액">{won(receipt.amountWon)}</Row>
          <Row label="결제 수단">{methodLabel(receipt.method)}</Row>
          {next && <Row label="다음 결제일">{formatDateKo(next)}</Row>}
          <Row label="주문번호">
            <span className="font-mono text-xs">{receipt.orderId}</span>
          </Row>
        </InfoBox>
      </Card>

      <div className="flex flex-col gap-3 pt-1">
        <BigLink href="/create" colors={colors}>
          동화 만들러 가기
        </BigLink>
        <SoftLink href="/billing">내 결제·구독 보기</SoftLink>
        <p className="break-keep text-center text-[11px] font-medium text-neutral-600">
          영수증은 실제 결제가 열리면 여기서 받을 수 있어요.
        </p>
      </div>
    </PayShell>
  );
}

/**
 * 주소에 결제사 결제 키가 실려 왔을 때 — 누군가 진짜 결제 창을 반쯤 붙인 경우다.
 * 진짜 결제를 가짜 '완료' 화면으로 덮지 않도록 멈추고 고객센터로 안내한다.
 */
export function PgNotConnected() {
  const { theme } = useTheme();
  // 고객센터 번호는 관리실에서 바꾼다 — 공개 정보를 읽는 훅으로 받고, 못 읽으면 기본값(등록 예정).
  const b = useSiteInfo().business;
  return (
    <PayShell demo>
      <NoticeCard
        tone="warn"
        title="이 화면은 아직 실제 결제와 이어지지 않았어요"
        body={
          <>
            혹시 돈이 나갔다면 고객센터로 알려 주세요. 바로 확인해 드릴게요.
            <br />
            고객센터 {infoText(b.phone)} · 이메일 {infoText(b.email)}
          </>
        }
      >
        <BigLink href="/" colors={theme.colors}>
          홈으로
        </BigLink>
      </NoticeCard>
    </PayShell>
  );
}
