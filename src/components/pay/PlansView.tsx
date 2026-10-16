"use client";

/**
 * /plans 요금제 — 로그인 없이 누구나 본다(법이 요구하는 '로그인 없이 보이는 가격 화면'도 이 화면).
 * 로그인 상태를 읽지 않는다 — 첫 HTML 에 가격이 그대로 들어 있어야 해서. 로그인 확인은 /checkout 이 한다.
 * 가격·구성은 lib/plans 한 곳에서만 온다(숫자를 손으로 적지 않는다). 동화는 "권"으로 센다.
 * 무료·스타트팩 권수와 크레딧 값은 관리실 설정이라 서버 화면(app/plans/page)이 읽어 offer 로 넘긴다 — 이 파일은 받기만 한다.
 * 시연 스위치가 off 여도 가격은 그대로 보이고, 시작 단추만 '결제는 곧 열려요'로 잠긴다.
 * 스타트팩·크레딧도 가족 패스처럼 시연 결제로 이어진다(2026-10-02 사장님 "스타트팩도 결제하는 쪽에 · 크레딧 구매 틀만이라도").
 *  크레딧은 묶음 한 줄을 누르면 그 묶음으로 결제하기(/checkout?plan=credit&pack=값)로 간다.
 */

import Link from "next/link";
import { useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { PAY_DEMO, checkoutHref } from "@/lib/pay-demo";
import {
  CREDIT_USE_LABEL,
  CUSTOMER_CREDIT_USES,
  DEFAULT_OFFER_VIEW,
  PASS_TAG,
  PLANS_PREVIEW_NOTE,
  READ_ALOUD_VOICE,
  REFUND_SUMMARY,
  creditsText,
  freeFeatures,
  monthlyEquivalent,
  passFeaturesFor,
  planFaq,
  plansOf,
  priceLabel,
  starterFeatures,
  won,
  yearlyDiscountPct,
  type OfferView,
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
  LockedButton,
  PayShell,
  SoftLink,
} from "./pay-ui";
import { SiteFooter } from "./SiteFooter";

type Period = "monthly" | "yearly";

export function PlansView({ offer = DEFAULT_OFFER_VIEW }: { offer?: OfferView }) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const [period, setPeriod] = useState<Period>("monthly");
  // 값·구성은 관리실 요금제 값(offer.plans) — 연간 할인율도 그 값으로 계산한다(싸지 않으면 할인 꼬리표를 감춘다)
  const plans = plansOf(offer.plans);
  const plan = plans[period];
  const pct = yearlyDiscountPct(plans);
  const free = freeFeatures(offer);

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
          {READ_ALOUD_VOICE}로 들려주세요.
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
              {id === "yearly" && pct > 0 && (
                <span
                  className="absolute -top-2.5 right-2 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-extrabold text-white shadow-sm"
                  style={{ background: colors.accentDark }}
                >
                  {pct}% 할인
                </span>
              )}
              <span className="whitespace-nowrap text-[15px] font-extrabold">{id === "monthly" ? "매달 결제" : "1년 한 번에"}</span>
              <span className={`whitespace-nowrap text-[13px] font-bold ${on ? "text-white/90" : "text-neutral-600"}`}>
                {priceLabel(plans[id])}
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
                월 {won(monthlyEquivalent(plan))}꼴{pct > 0 ? ` · ${pct}% 할인` : ""}
              </p>
            )}
          </div>
          <p className="mt-0.5 text-xs font-semibold text-neutral-500">부가세 포함 · 언제든 해지할 수 있어요</p>
        </div>
        <div className="px-5 pb-5 pt-4">
          {/* 연간은 가족 캐릭터·가족 목소리가 더 많다 — 고른 주기의 구성을 보여 준다(바뀐 값은 위 가격 줄이 알린다) */}
          <CheckList items={passFeaturesFor(period, offer)} />
          <div className="mt-5">
            {PAY_DEMO === "off" ? (
              <LockedButton describedBy="pass-soon">결제는 곧 열려요</LockedButton>
            ) : (
              <BigLink href={checkoutHref(period)} colors={colors}>
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

      {/* 스타트팩 — 처음 한 번만(이미 샀는지는 결제하기 화면이 본다) */}
      <Card labelledBy="starter-title">
        <CardTitle
          id="starter-title"
          right={<span className="text-[17px] font-extrabold text-neutral-800">{won(offer.plans.starter.priceWon)}</span>}
        >
          스타트팩
        </CardTitle>
        <p className="-mt-1 mb-3 break-keep text-[13px] font-medium leading-relaxed text-neutral-500">
          처음이라면 우리 아이 동화 한 권부터 만들어 보세요.
        </p>
        <CheckList items={starterFeatures(offer)} />
        <div className="mt-5">
          {PAY_DEMO === "off" ? (
            <LockedButton describedBy="starter-soon">곧 열려요</LockedButton>
          ) : (
            <BigLink href={checkoutHref("starter")} colors={colors}>
              스타트팩으로 시작하기
            </BigLink>
          )}
        </div>
        {PAY_DEMO === "off" ? (
          <p id="starter-soon" className="mt-3 break-keep text-center text-xs font-semibold leading-relaxed text-neutral-500">
            스타트팩은 결제가 열리면 살 수 있어요.
          </p>
        ) : (
          <DemoPayNote />
        )}
      </Card>

      {/* 무료로 듣기 — 비회원도. 무료로 연 동화가 없으면 감춘다 */}
      {free.length > 0 && (
        <Card labelledBy="free-title">
          <CardTitle id="free-title" right={<span className="text-[17px] font-extrabold text-neutral-800">{won(0)}</span>}>
            무료로 듣기
          </CardTitle>
          <CheckList items={free} />
          {offer.free.titles.length > 0 && (
            <p className="mt-2.5 break-keep text-xs font-semibold leading-relaxed text-neutral-500">
              {offer.free.titles.join(" · ")}
            </p>
          )}
          <div className="mt-5">
            <SoftLink href="/">동화 들으러 가기</SoftLink>
          </div>
        </Card>
      )}

      {/* 크레딧 — 플랜에 든 몫을 다 쓴 뒤 더할 때. 값은 관리실 설정. 시연 중에는 묶음 한 줄이 결제하기로 가는 링크 */}
      <Card id="credits" labelledBy="credit-title" className="scroll-mt-16">
        <CardTitle id="credit-title">더 필요할 때는 크레딧</CardTitle>
        <ul className="flex flex-col gap-2">
          {offer.creditPacks.map((p) => {
            const inner = (
              <>
                <span className="text-[15px] font-extrabold text-neutral-800">{creditsText(p.credits)}</span>
                <span className="flex items-center gap-1.5 text-[15px] font-extrabold tabular-nums" style={{ color: colors.accentDark }}>
                  {won(p.priceWon)}
                  {PAY_DEMO !== "off" && (
                    <span aria-hidden className="text-[17px] leading-none">
                      ›
                    </span>
                  )}
                </span>
              </>
            );
            const row = "flex min-h-[52px] items-center justify-between gap-2 rounded-[20px] bg-stone-50 px-4 py-3 shadow-[inset_0_0_0_1px_#f0ede8]";
            return (
              <li key={p.priceWon}>
                {PAY_DEMO === "off" ? (
                  <div className={row}>{inner}</div>
                ) : (
                  <Link
                    href={checkoutHref("credit", p.priceWon)}
                    className={`${row} transition hover:bg-stone-100 active:translate-y-[2px] ${FOCUS}`}
                  >
                    {inner}
                    <span className="sr-only">결제하러 가기</span>
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-[13px] font-extrabold text-neutral-700">이렇게 써요</p>
        <ul className="mt-1.5 flex flex-col gap-1">
          {CUSTOMER_CREDIT_USES.map((k) => (
            <li key={k} className="flex items-center justify-between gap-2 text-[13px] font-medium text-neutral-600">
              <span className="break-keep">{CREDIT_USE_LABEL[k]}</span>
              <span className="shrink-0 font-bold tabular-nums text-neutral-800">{creditsText(offer.creditCosts[k])}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2.5 break-keep text-[13px] font-medium leading-relaxed text-neutral-500">
          가족 패스·스타트팩에 든 몫을 다 쓴 뒤에 더할 때 써요.{" "}
          {PAY_DEMO === "off" ? "크레딧은 결제가 열리면 살 수 있어요." : "묶음을 누르면 결제하기로 가요."}
        </p>
        {PAY_DEMO !== "off" && <DemoPayNote />}
      </Card>

      {/* 자주 묻는 질문 — details/summary 라 키보드·화면 읽기가 기본으로 된다 */}
      <Card labelledBy="faq-title">
        <CardTitle id="faq-title">자주 묻는 질문</CardTitle>
        <div className="flex flex-col">
          {planFaq(offer).map(({ q, a }) => (
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

/** 시연 스위치가 켜져 있는 동안 스타트팩·크레딧 단추 아래 — 누르기 전에 시연 결제라는 것을 알린다(가족 패스 카드와 같은 문장). */
function DemoPayNote() {
  return (
    <p className="mt-3 break-keep text-center text-xs font-semibold leading-relaxed text-neutral-500">
      <span className="font-extrabold text-amber-800">지금은 시연 결제로 이어져요 · 실제로 결제되지 않아요</span>
      <br />
      결제 전에 로그인이 필요해요
    </p>
  );
}
