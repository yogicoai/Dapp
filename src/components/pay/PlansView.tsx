"use client";

/**
 * /plans 요금제 — 로그인 없이 누구나 본다(법이 요구하는 '로그인 없이 보이는 가격 화면'도 이 화면).
 * 로그인 상태를 읽지 않는다 — 첫 HTML 에 가격이 그대로 들어 있어야 해서. 로그인 확인은 /checkout 이 한다.
 * 가격·구성은 lib/plans 한 곳에서만 온다(숫자를 손으로 적지 않는다). 고객에게는 "권"으로만 보인다.
 * 시연 스위치가 off 여도 가격은 그대로 보이고, 시작 단추만 '결제는 곧 열려요'로 잠긴다.
 */

import { useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { PAY_DEMO } from "@/lib/pay-demo";
import {
  EXTRA,
  FAQ,
  PASS_FEATURES,
  PASS_TAG,
  PLANS,
  PLANS_PREVIEW_NOTE,
  REFUND_SUMMARY,
  TRIAL,
  TRIAL_FEATURES,
  monthlyEquivalent,
  priceLabel,
  won,
  yearlyDiscountPct,
} from "@/lib/plans";
import {
  BackPill,
  BigLink,
  Card,
  CardTitle,
  CheckList,
  DraftPill,
  FOCUS,
  FOCUS_WITHIN,
  GrayPill,
  LockedButton,
  PayShell,
  SoftLink,
} from "./pay-ui";
import { SiteFooter } from "./SiteFooter";

type Period = "monthly" | "yearly";

export function PlansView() {
  const { theme } = useTheme();
  const colors = theme.colors;
  const [period, setPeriod] = useState<Period>("monthly");
  const plan = PLANS[period];
  const pct = yearlyDiscountPct();

  return (
    <PayShell>
      <BackPill href="/" />

      {/* 머리 */}
      <Card className="flex flex-col items-center text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={theme.mascot} alt="" className="h-12 w-12 rounded-full border-2 border-white object-cover shadow" />
        <h1 className="mt-2 text-[21px] font-extrabold text-neutral-800">우리 가족 요금제</h1>
        <p className="mt-1 break-keep text-[13px] font-medium leading-relaxed text-neutral-500">
          우리 아이가 주인공인 그림동화를
          <br />
          엄마·아빠 목소리로 들려주세요.
        </p>
        {PLANS_PREVIEW_NOTE && (
          <p className="mt-3 break-keep rounded-2xl bg-neutral-100 px-4 py-2 text-xs font-bold leading-snug text-neutral-600">
            {PLANS_PREVIEW_NOTE}
          </p>
        )}
      </Card>

      {/* 기간 고르기 — 진짜 radio 를 label 로 감쌌다. 월·연 가격을 둘 다 첫 화면에 보인다
          (할인만 보이고 연 총액이 눌러야 보이면, 할인을 광고하면서 값을 숨기는 모양이 된다). */}
      <fieldset className="grid grid-cols-2 gap-2 pt-1">
        <legend className="sr-only">결제 주기</legend>
        {(["monthly", "yearly"] as const).map((id) => {
          const on = period === id;
          return (
            <label
              key={id}
              className={`relative flex min-h-16 cursor-pointer flex-col items-center justify-center rounded-[22px] px-2 py-2 text-center shadow transition ${
                on ? "text-white" : "bg-white/85 text-neutral-700 backdrop-blur"
              } ${FOCUS_WITHIN}`}
              style={on ? { background: colors.accent } : undefined}
            >
              <input
                type="radio"
                name="period"
                value={id}
                checked={on}
                onChange={() => setPeriod(id)}
                className="sr-only"
              />
              {id === "yearly" && (
                <span
                  className="absolute -top-2.5 right-2 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-extrabold text-white shadow-sm"
                  style={{ background: colors.accentDark }}
                >
                  {pct}% 할인
                </span>
              )}
              <span className="whitespace-nowrap text-[15px] font-extrabold">{id === "monthly" ? "매달 결제" : "1년 한 번에"}</span>
              <span className={`whitespace-nowrap text-[13px] font-bold ${on ? "text-white/90" : "text-neutral-600"}`}>
                {priceLabel(PLANS[id])}
              </span>
            </label>
          );
        })}
      </fieldset>

      {/* 가족 패스 */}
      <section
        aria-labelledby="pass-title"
        className="relative rounded-[28px] bg-white/95 shadow-xl backdrop-blur"
        style={{ border: `2px solid ${colors.accent}` }}
      >
        <span
          className="absolute -top-2.5 right-4 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold text-white"
          style={{ background: colors.accentDark }}
        >
          {PASS_TAG}
        </span>
        <div className="rounded-t-[26px] px-5 pb-3.5 pt-4" style={{ background: colors.accentSoft }}>
          <h2 id="pass-title" className="text-[17px] font-extrabold text-neutral-800">
            가족 패스
          </h2>
          {/* 연간은 총액을 크게, 월 환산은 작게 — 월 값만 크게 보이면 총액을 숨기는 모양이 된다. */}
          <div aria-live="polite">
            <p className="mt-0.5 text-[28px] font-extrabold leading-tight" style={{ color: colors.accentDark }}>
              {priceLabel(plan)}
            </p>
            {period === "yearly" && (
              <p className="text-[13px] font-bold text-neutral-600">
                월 {won(monthlyEquivalent(plan))}꼴 · {pct}% 할인
              </p>
            )}
          </div>
          <p className="mt-0.5 text-xs font-semibold text-neutral-500">부가세 포함 · 언제든 해지할 수 있어요</p>
        </div>
        <div className="px-5 pb-5 pt-4">
          <CheckList items={PASS_FEATURES} />
          <div className="mt-5">
            {PAY_DEMO === "off" ? (
              <LockedButton describedBy="pass-soon">결제는 곧 열려요</LockedButton>
            ) : (
              <BigLink href={`/checkout?plan=${period}`} colors={colors}>
                가족 패스 시작하기
              </BigLink>
            )}
          </div>
          <p id="pass-soon" className="mt-3 break-keep text-center text-xs font-semibold leading-relaxed text-neutral-500">
            {PAY_DEMO === "off" ? (
              "지금은 베타라 결제 없이 쓰고 있어요."
            ) : (
              <>
                {/* 시연 스위치가 켜져 있는 동안은 누구나 이 단추로 시연 결제를 지난다 — 누르기 전에 알린다. */}
                <span className="font-extrabold text-amber-800">지금은 시연 결제로 이어져요 · 실제로 결제되지 않아요</span>
                <br />
                결제 전에 로그인이 필요해요
              </>
            )}
          </p>
        </div>
      </section>

      {/* 무료 체험 */}
      <Card labelledBy="trial-title">
        <CardTitle
          id="trial-title"
          right={<span className="text-[17px] font-extrabold text-neutral-800">{won(TRIAL.priceWon)}</span>}
        >
          무료 체험
        </CardTitle>
        <CheckList items={TRIAL_FEATURES} />
        {PLANS_PREVIEW_NOTE && (
          <p className="mt-2.5 break-keep text-xs font-semibold text-neutral-500">무료 체험 조건은 정식 출시 때부터 적용돼요.</p>
        )}
        <div className="mt-5">
          <SoftLink href="/create">무료로 먼저 만들어 보기</SoftLink>
        </div>
      </Card>

      {/* 추가 3권 */}
      <Card labelledBy="extra-title">
        <CardTitle id="extra-title">책이 더 필요할 때</CardTitle>
        <div className="flex items-center justify-between gap-2 rounded-[20px] bg-stone-50 px-4 py-3 shadow-[inset_0_0_0_1px_#f0ede8]">
          <span className="text-[15px] font-extrabold text-neutral-800">
            {PLANS.extra3.name} · <span style={{ color: colors.accentDark }}>{won(EXTRA.priceWon)}</span>
          </span>
          <GrayPill>패스 전용</GrayPill>
        </div>
        <p className="mt-2.5 break-keep text-[13px] font-medium leading-relaxed text-neutral-500">
          가족 패스를 쓰는 분이 이번 달 책을 다 만들었을 때 더 살 수 있어요.
        </p>
      </Card>

      {/* 자주 묻는 질문 — details/summary 라 키보드·화면 읽기가 기본으로 된다 */}
      <Card labelledBy="faq-title">
        <CardTitle id="faq-title">자주 묻는 질문</CardTitle>
        <div className="flex flex-col">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="group border-b border-stone-200/70 last:border-b-0">
              <summary
                className={`flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-xl py-2 text-[14px] font-extrabold text-neutral-800 [&::-webkit-details-marker]:hidden ${FOCUS}`}
              >
                <span
                  aria-hidden
                  className="inline-block text-neutral-400 transition-transform group-open:rotate-90 motion-reduce:transition-none"
                >
                  ▸
                </span>
                <span className="break-keep">{q}</span>
              </summary>
              <p className="break-keep pb-3 pl-5 text-[13px] font-medium leading-relaxed text-neutral-600">{a}</p>
            </details>
          ))}
        </div>
      </Card>

      {/* 환불 안내(요약) — 법률 확인 전이라 '초안' */}
      <Card id="refund" labelledBy="refund-title" className="scroll-mt-16">
        <CardTitle id="refund-title" right={<DraftPill />}>
          환불 안내 (요약)
        </CardTitle>
        <ul className="flex flex-col gap-1.5">
          {REFUND_SUMMARY.map((t) => (
            <li key={t} className="flex gap-2 break-keep text-[13px] font-medium leading-relaxed text-neutral-700">
              <span aria-hidden className="shrink-0 text-neutral-400">
                ·
              </span>
              {t}
            </li>
          ))}
        </ul>
        <p className="mt-3 break-keep text-xs font-medium text-neutral-500">환불 정책 전문은 약관이 생기면 여기에 연결돼요.</p>
      </Card>

      <SiteFooter />
    </PayShell>
  );
}
