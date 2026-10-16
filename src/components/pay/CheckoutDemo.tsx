"use client";

/**
 * /checkout 결제하기 (시연) — 주문 내용 → 결제 수단 → 자동 결제 안내 → 동의 2개 → 어른 확인 → 가짜 처리 → /checkout/done.
 *
 * 이 화면은 **아무 데도 쓰지 않는다**. 읽는 것은 loadSession(내 프로필) 하나, 적는 것은 이 탭의 시연 기록(대기 주문)뿐이다.
 * 앱의 잔액·만들기 권한은 그대로다. 마스터(fe·yogico)도 같은 갈래를 지나간다 — 사장님이 fe 로 시연할 수 있게.
 *
 * 화면 갈래: loading → soon(스위치 off) / login(비회원) / extra-no(패스 없이 추가 3권) / already(이미 패스)
 *           / starter-again(스타트팩을 이미 삼) / ready
 * 사는 것: 가족 패스(월간·연간) · 추가 3권 · 스타트팩 · 크레딧 묶음(creditPack — 서버 page 가 관리실 묶음 목록에서 고른다).
 * 날짜는 모두 브라우저에서 계산한다(서버 HTML 과 어긋나지 않게) — ready 로 갈 때 now 를 state 에 넣는다.
 * Math.random · new Date() 는 이벤트 안에서만 부른다(렌더 중에 부르면 순수성 규칙에 걸린다).
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useScrollLock } from "@/lib/scroll-lock";
import { useTheme } from "@/components/ThemeProvider";
import { CheckIcon } from "@/components/family/icons";
import { Sheet } from "@/components/family/Sheet";
import { BigButton, BottomBar, TopBar } from "@/components/family/ui";
import { loadSession } from "@/lib/auth";
import {
  CONSENTS,
  PAY_DEMO,
  PAY_METHODS,
  canBuyExtra,
  canBuyStarter,
  demoOrderId,
  initialConsents,
  parentQuestion,
  readDemoState,
  writeDemoState,
  type ParentQ,
  type PayMethodId,
} from "@/lib/pay-demo";
import {
  CREDIT_EXTRAS_TEXT,
  DEFAULT_PLAN_TERMS,
  PARENT_VOICE_OPEN,
  billingDayText,
  formatDateKo,
  nextBillingDate,
  plansOf,
  won,
  type CreditPack,
  type PlanId,
  type PlanTerms,
} from "@/lib/plans";
import { ParentCheck } from "./ParentCheck";
import {
  BigLink,
  Card,
  CardTitle,
  DemoBadge,
  DraftPill,
  FOCUS,
  FOCUS_WITHIN,
  InfoBox,
  LoginCard,
  NoticeCard,
  PayShell,
  Row,
  SkeletonCard,
  SoftLink,
  SoonCard,
  useGoBack,
} from "./pay-ui";
import { SiteFooter } from "./SiteFooter";

type View =
  | { kind: "loading" }
  | { kind: "soon" }
  | { kind: "login" }
  | { kind: "extra-no" }
  | { kind: "already" }
  | { kind: "starter-again" }
  | { kind: "ready"; uid: string; now: Date };

/** 가짜 처리 가림막 단계 */
type Busy = null | "open" | "confirm";

/**
 * terms — 관리실 요금제 값(서버 page 가 읽어 넘긴다). 값·권수·목소리 수가 요금제 화면과 같게.
 * creditPack — plan 이 credit 일 때 고른 묶음(서버 page 가 관리실 묶음 목록에서 찾아 넘긴다 — 주소의 값을 그대로 믿지 않는다).
 */
export function CheckoutDemo({
  plan: planId,
  terms = DEFAULT_PLAN_TERMS,
  creditPack,
}: {
  plan: PlanId;
  terms?: PlanTerms;
  creditPack?: CreditPack;
}) {
  const router = useRouter();
  const { theme } = useTheme();
  const colors = theme.colors;
  const plan = plansOf(terms, creditPack)[planId];
  // 아래 확인 효과는 값(글자·참거짓)에만 기대게 한다 — 요금제 묶음은 그릴 때마다 새로 만들어져서
  const planSubscriberOnly = plan.subscriberOnly;
  const planIsSub = plan.kind === "subscription";
  const planIsStarter = plan.kind === "starter";
  const passTerms = planId === "yearly" ? terms.yearly : terms.monthly;
  // 가족 목소리를 열기 전에는 그 자리에 가족 캐릭터 수를 적는다(lib/plans PARENT_VOICE_OPEN)
  const passExtra = PARENT_VOICE_OPEN ? `가족 목소리 ${passTerms.voices}명` : `가족 캐릭터 ${passTerms.familyCharacters}명까지`;

  const [view, setView] = useState<View>(PAY_DEMO === "off" ? { kind: "soon" } : { kind: "loading" });
  const [method, setMethod] = useState<PayMethodId>("card");
  const [consents, setConsents] = useState<[boolean, boolean]>(initialConsents);
  const [sheet, setSheet] = useState<0 | 1 | null>(null);
  const [question, setQuestion] = useState<ParentQ | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  // 처리 가림막이 떠 있는 동안 뒤 화면을 잠근다(사장님 2026-09-30)
  useScrollLock(busy !== null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const viewButtons = useRef<(HTMLButtonElement | null)[]>([]);
  // ← 는 뒤로(요금제·내 결제·구독 등 온 곳으로). push 로 /plans 를 쌓으면 /plans 의 ← 가 여기로 되돌아와 맴돈다.
  const goBack = useGoBack("/plans");

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
        const state = readDemoState(s.uid);
        if (planSubscriberOnly && !canBuyExtra(state)) {
          setView({ kind: "extra-no" });
          return;
        }
        if (planIsSub && state.pass) {
          setView({ kind: "already" });
          return;
        }
        if (planIsStarter && !canBuyStarter(state)) {
          setView({ kind: "starter-again" });
          return;
        }
        setView({ kind: "ready", uid: s.uid, now: new Date() });
      })
      .catch(() => {
        if (alive) setView({ kind: "login" });
      });
    return () => {
      alive = false;
    };
  }, [planSubscriberOnly, planIsSub, planIsStarter]);

  // 화면을 떠나면 가짜 처리 시계를 멈춘다.
  useEffect(() => {
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, []);

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
  if (view.kind === "extra-no") {
    return (
      <PayShell demo>
        <NoticeCard
          title={`${plan.name}은 가족 패스 전용이에요`}
          body="가족 패스를 쓰는 분이 이번 달 책을 다 만들었을 때 더 살 수 있어요."
        >
          <BigLink href="/plans" colors={colors} replace>
            가족 패스 보기
          </BigLink>
          <SoftLink href="/billing" replace>
            내 결제·구독 보기
          </SoftLink>
        </NoticeCard>
      </PayShell>
    );
  }
  if (view.kind === "already") {
    return (
      <PayShell demo>
        <NoticeCard
          title="이미 가족 패스를 쓰고 있어요"
          body="요금제 바꾸기는 결제가 열리면 '내 결제·구독'에서 할 수 있어요."
        >
          <BigLink href="/billing" colors={colors} replace>
            내 결제·구독 보기
          </BigLink>
          <SoftLink href="/plans" replace>
            요금제 다시 보기
          </SoftLink>
        </NoticeCard>
      </PayShell>
    );
  }
  if (view.kind === "starter-again") {
    return (
      <PayShell demo>
        <NoticeCard
          title="스타트팩은 이미 샀어요"
          body="스타트팩은 처음 한 번만 살 수 있어요. 동화를 더 만들려면 가족 패스나 크레딧을 봐 주세요."
        >
          <BigLink href="/plans" colors={colors} replace>
            요금제 보기
          </BigLink>
          <SoftLink href="/billing" replace>
            내 결제·구독 보기
          </SoftLink>
        </NoticeCard>
      </PayShell>
    );
  }

  const { uid, now } = view;
  const next = nextBillingDate(now, plan);
  const isSub = plan.kind === "subscription";
  const canPay = consents[0] && consents[1] && !!method && !busy;
  const payLabel = `${won(plan.priceWon)} 결제하기 · 시연`;
  const orderLine = isSub
    ? `매달 새 동화책 ${plan.books}권 · ${passExtra} · 다시 듣기 무제한`
    : plan.kind === "starter"
      ? `우리 아이 동화 ${plan.books}권 · 가족 캐릭터 ${terms.starter.familyCharacters}명${PARENT_VOICE_OPEN ? ` · 가족 목소리 ${terms.starter.voices}명` : ""}`
      : plan.kind === "credit"
        ? `${CREDIT_EXTRAS_TEXT}를 더할 때 써요`
        : `지금 쓰는 가족 패스에 동화책 ${plan.books}권을 더해요`;
  // 실패 화면의 '다시 해 볼게요'가 같은 묶음으로 돌아오게 크레딧은 묶음 값도 싣는다
  const failHref = `/checkout/fail?plan=${plan.id}${plan.kind === "credit" ? `&pack=${plan.priceWon}` : ""}&code=REJECT_CARD_COMPANY`;

  function toggleConsent(i: 0 | 1, on: boolean) {
    setConsents((c) => (i === 0 ? [on, c[1]] : [c[0], on]));
    // 어른 확인 창이 열린 채 동의를 풀면 창을 닫는다 — 동의가 빠진 채 결제로 넘어가지 않게.
    if (!on) setQuestion(null);
  }

  function closeSheet() {
    const i = sheet;
    setSheet(null);
    // 닫으면 '보기' 단추로 초점을 돌려준다.
    if (i !== null) requestAnimationFrame(() => viewButtons.current[i]?.focus());
  }

  function onPayTap() {
    if (busy || !canPay) return;
    setQuestion(parentQuestion(Math.random));
  }

  function onParentPass() {
    // 동의를 여기서 한 번 더 본다 — 결제로 넘어가는 문은 이 함수 하나다. 진짜 연결 때는 동의 상태를
    // 주문과 함께 보내고 서버가 다시 확인한다(브라우저 확인만 믿지 않는다).
    if (busy || !consents[0] || !consents[1]) {
      setQuestion(null);
      return;
    }
    setQuestion(null);
    setBusy("open");
    const at = new Date();
    const orderId = demoOrderId(at, Math.random);
    /*
     * TODO(PG-HOOK-1) 진짜 PG 를 붙일 자리 — 이 함수가 CheckoutLive 에서는 이렇게 바뀐다.
     *  ① 주문 만들기 서버 경로(api/payments/orders)에 **요금제 id 만**(크레딧은 묶음 값까지) 보낸다. 서버가 서버 쪽 가격표·
     *     묶음표로 금액·크레딧 수를 정하고, 주문 줄(ready)을 만들어 주문번호·금액·주문명을 돌려준다(브라우저가 보낸 금액은 믿지 않는다).
     *     스타트팩은 서버가 '처음 한 번'인지 다시 본다.
     *  ② 구독(월·연)은 결제사의 자동결제(빌링키) 등록 창을, 추가 3권·스타트팩·크레딧은 한 번 결제 창을 연다.
     *     성공하면 결제사가 /checkout/done 으로, 실패하면 /checkout/fail 로 돌려보낸다.
     * 시연에서는 이 탭의 시연 기록에 대기 주문만 적고, 가림막을 보인 뒤 done 으로 간다.
     */
    writeDemoState(uid, {
      ...readDemoState(uid),
      pending: {
        orderId,
        plan: plan.id,
        method,
        amountWon: plan.priceWon,
        at: at.toISOString(),
        ...(plan.kind === "credit" && plan.credits ? { credits: plan.credits } : {}),
      },
    });
    timers.current.push(setTimeout(() => setBusy("confirm"), 900));
    timers.current.push(
      setTimeout(() => {
        // replace — 뒤로 가기를 눌러도 가림막으로 돌아오지 않게.
        router.replace(`/checkout/done?orderId=${orderId}&plan=${plan.id}&method=${method}`);
      }, 1500),
    );
  }

  const openConsent = sheet === null ? null : CONSENTS[sheet];
  // 시트(동의 보기·어른 확인)나 가림막이 떠 있으면 뒤 화면을 inert 로 — 키보드로 뒤의 동의·결제 단추에 닿지 않게.
  const covered = sheet !== null || question !== null || busy !== null;

  return (
    <PayShell demo bottomBar>
      <div inert={covered} className="contents">
        <div className="rounded-full bg-white/90 px-1.5 py-1.5 shadow-xl backdrop-blur">
          <TopBar onBack={goBack} title="결제하기" />
        </div>

        {/* 주문 내용 */}
        <Card labelledBy="order-title">
          <CardTitle id="order-title">주문 내용</CardTitle>
          <p className="text-[17px] font-extrabold text-neutral-800">{plan.name}</p>
          <p className="mt-0.5 break-keep text-[13px] font-medium text-neutral-500">{orderLine}</p>
          <InfoBox className="mt-3">
            <Row label="결제 주기">{plan.period === "month" ? "매달 자동 결제" : plan.period === "year" ? "매년 자동 결제" : "한 번만 결제"}</Row>
            <Row label="이번 결제">오늘 {formatDateKo(now)}</Row>
            {next && <Row label="다음 결제일">{formatDateKo(next)}</Row>}
            <Row label="결제 금액">
              <span className="block text-[28px] leading-tight" style={{ color: colors.accentDark }}>
                {won(plan.priceWon)}
              </span>
              <span className="block text-[11px] font-semibold text-neutral-500">부가세 포함</span>
            </Row>
          </InfoBox>
        </Card>

        {/* 결제 수단 — TODO(PG-HOOK-1b) 진짜 연결 때는 결제사의 결제 수단 창·약관 창이 이 칸을 대신한다.
            자동결제에서 쓸 수 있는 수단은 계약에 따라 다르다. 로고 없이 글자만(상표 문제를 피하고, 진짜 창이 로고를 그린다). */}
        <Card>
          <fieldset>
            <legend className="mb-3 text-[15px] font-extrabold text-neutral-800">결제 수단</legend>
            <div className="grid grid-cols-2 gap-2">
              {PAY_METHODS.map((m) => {
                const on = method === m.id;
                return (
                  <label
                    key={m.id}
                    className={`relative flex min-h-[56px] cursor-pointer items-center justify-center gap-1.5 rounded-2xl px-2 text-[15px] font-extrabold transition ${
                      on ? "text-neutral-800" : "bg-neutral-50 text-neutral-600 shadow-[inset_0_0_0_1px_#f0ede8]"
                    } ${FOCUS_WITHIN}`}
                    style={on ? { background: colors.accentSoft, boxShadow: `inset 0 0 0 2px ${colors.accent}` } : undefined}
                  >
                    <input
                      type="radio"
                      name="pay-method"
                      value={m.id}
                      checked={on}
                      onChange={() => setMethod(m.id)}
                      className="sr-only"
                    />
                    {on && (
                      <span
                        aria-hidden
                        className="flex h-5 w-5 items-center justify-center rounded-full"
                        style={{ background: colors.accent }}
                      >
                        <CheckIcon size={12} />
                      </span>
                    )}
                    {m.label}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <p className="mt-3 break-keep text-[11px] font-medium leading-relaxed text-neutral-500">
            실제 결제 때는 여기서 결제사 결제창이 열려요.
            <br />
            카드 번호는 저희가 받지도 저장하지도 않아요.
          </p>
        </Card>

        {/* 자동 결제 안내 — 구독만 */}
        {isSub && (
          <section
            aria-label="자동 결제 안내"
            className="rounded-[28px] p-5 shadow-xl"
            style={{ background: colors.accentSoft }}
          >
            <p className="break-keep text-[14px] font-extrabold text-neutral-800">
              {billingDayText(now, plan)}에 {won(plan.priceWon)}이 자동으로 결제돼요.
            </p>
            <p className="mt-1 break-keep text-[13px] font-medium leading-relaxed text-neutral-600">
              &apos;내 결제·구독&apos;에서 언제든 해지할 수 있고, 해지하면 다음 결제부터 멈춰요.
            </p>
          </section>
        )}

        {/* 동의 — 미리 체크하지 않는다. 2개뿐이라 '모두 동의'도 두지 않는다. */}
        <Card>
          <fieldset>
            <legend className="mb-2 text-[15px] font-extrabold text-neutral-800">동의</legend>
            <div className="flex flex-col gap-1">
              {CONSENTS.map((c, idx) => {
                const i = idx as 0 | 1;
                return (
                  <div key={c.id} className="flex items-start gap-1">
                    <label
                      className={`flex min-h-12 flex-1 cursor-pointer items-start gap-3 rounded-xl py-2 pr-1 ${FOCUS_WITHIN}`}
                    >
                      <input
                        type="checkbox"
                        checked={consents[i]}
                        onChange={(e) => toggleConsent(i, e.target.checked)}
                        className="mt-0.5 h-6 w-6 shrink-0 cursor-pointer"
                        style={{ accentColor: colors.accentDark }}
                      />
                      <span className="break-keep text-[14px] font-semibold leading-snug text-neutral-700">
                        <span className="font-extrabold" style={{ color: colors.accentDark }}>
                          [필수]
                        </span>{" "}
                        {c.label(plan)}
                      </span>
                    </label>
                    <button
                      ref={(el) => {
                        viewButtons.current[i] = el;
                      }}
                      type="button"
                      aria-haspopup="dialog"
                      onClick={() => setSheet(i)}
                      className={`min-h-11 shrink-0 rounded-full px-2.5 text-xs font-extrabold text-neutral-500 underline underline-offset-2 ${FOCUS}`}
                    >
                      보기
                    </button>
                  </div>
                );
              })}
            </div>
          </fieldset>
        </Card>

        <Link
          href={failHref}
          replace
          className={`mx-auto inline-flex min-h-11 items-center rounded-full px-3 text-xs font-bold text-neutral-600 underline underline-offset-2 ${FOCUS}`}
        >
          시연: 결제 실패 화면 보기 ›
        </Link>

        <SiteFooter compact />

        <BottomBar>
          <div className="flex w-full flex-col items-center gap-2">
            <BigButton colors={colors} onClick={onPayTap} disabled={!canPay} aria-describedby={canPay ? undefined : "pay-hint"}>
              {payLabel}
            </BigButton>
            <p id="pay-hint" aria-live="polite" className="min-h-4 break-keep text-center text-xs font-bold text-neutral-500">
              {!consents[0] || !consents[1] ? "동의 2개에 체크하면 결제할 수 있어요" : ""}
            </p>
          </div>
        </BottomBar>
      </div>

      {openConsent && (
        <Sheet onClose={closeSheet} label={openConsent.sheetTitle}>
          <div className="mt-[18px] flex w-full flex-col items-center">
            <DraftPill>초안 · 확정 전</DraftPill>
            <h2 className="mt-2 break-keep text-center text-[21px] font-extrabold text-neutral-800">{openConsent.sheetTitle}</h2>
            <div className="mt-3 flex w-full flex-col gap-2 rounded-[20px] bg-stone-50 px-4 py-3.5 shadow-[inset_0_0_0_1px_#f0ede8]">
              {openConsent.sheetBody(plan).map((t) => (
                <p key={t} className="break-keep text-[14px] font-medium leading-relaxed text-neutral-700">
                  {t}
                </p>
              ))}
            </div>
            <div className="mt-4 w-full">
              <BigButton colors={colors} onClick={closeSheet}>
                확인했어요
              </BigButton>
            </div>
            <p className="mt-2.5 break-keep text-center text-xs font-semibold text-neutral-500">
              동의는 위 체크 칸에서 직접 해 주세요.
            </p>
          </div>
        </Sheet>
      )}

      {question && (
        <ParentCheck
          colors={colors}
          question={question}
          onPass={onParentPass}
          onWrong={() => setQuestion(parentQuestion(Math.random))}
          onClose={() => setQuestion(null)}
        />
      )}

      {/* 가짜 처리 가림막 — 실제 결제 때는 여기서 결제사 창이 열린다 */}
      {busy && (
        <div className="fixed inset-0 z-[90] flex flex-col items-center bg-white/95" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <DemoBadge />
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
            <span
              aria-hidden
              className="h-12 w-12 rounded-full border-4 border-neutral-200 motion-safe:animate-spin"
              style={{ borderTopColor: colors.accent }}
            />
            <p role="status" aria-live="polite" className="text-[17px] font-extrabold text-neutral-800">
              {busy === "open" ? "결제창을 여는 중이에요…" : "결제를 확인하는 중이에요…"}
            </p>
            <p className="break-keep text-xs font-medium text-neutral-500">실제 결제 때는 여기서 결제사 창이 열려요.</p>
            <p className="text-xs font-extrabold text-amber-800">{payLabel}</p>
          </div>
        </div>
      )}
    </PayShell>
  );
}
