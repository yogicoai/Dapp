"use client";

/**
 * 요금제 한눈에 (고객에게 보이는 값) — 읽기 전용 표(2026-10-01 확정 구성: 무료 · 스타트팩 · 가족 패스 월간·연간 · 크레딧).
 *
 * 값은 모두 관리실 설정(offer — 요금제 · 공개 동화 · 크레딧 탭에서 고친 값)에서 온다. 못 읽었으면 기본값(lib/plans).
 * 결제사(PG)를 붙여도 실제 결제 금액은 서버가 이 값으로 정한다 — 브라우저가 보낸 금액은 믿지 않는다.
 */
import { offerViewOf, type OfferAdminResponse } from "@/lib/offer-settings";
import {
  DEFAULT_OFFER_VIEW,
  EXTRA,
  REFUND_DAYS,
  creditsText,
  plansOf,
  libraryCountText,
  monthlyEquivalent,
  priceLabel,
  won,
  yearlyDiscountPct,
  type PassPlanTerms,
} from "@/lib/plans";
import { Badge, DataTable, Icon, type BadgeTone, type Column } from "@/components/admin/kit";

type Row = { key: string; name: string; price: string; detail: string; tag?: string; tone?: BadgeTone };

const COLUMNS: Column<Row>[] = [
  { key: "name", header: "요금제", cell: (r) => <span className="font-bold">{r.name}</span>, mobile: "title", width: "170px" },
  { key: "price", header: "값(부가세 포함)", cell: (r) => <span className="font-bold tabular-nums">{r.price}</span>, width: "140px" },
  { key: "detail", header: "구성", cell: (r) => <span className="break-keep text-[#4e5968]">{r.detail}</span> },
  {
    key: "tag",
    header: "표시",
    cell: (r) => (r.tag ? <Badge tone={r.tone ?? "blue"}>{r.tag}</Badge> : null),
    mobile: "badge",
    width: "130px",
  },
];

/** 가족 패스 한 주기의 구성 한 줄 */
function passDetail(t: PassPlanTerms, libraryBooks: number): string {
  return `매달 ${t.booksPerMonth}권 · 가족 캐릭터 ${t.familyCharacters}명 · 가족 목소리 ${t.voices}명(한 달 ${t.voiceRemakesPerMonth}번 다시 만들기) · 가족 그리기 토큰 매달 ${t.drawTokensPerMonth}개(첫 달 ${t.drawTokensFirstMonth}개) · 명작·전래 ${libraryBooks}권`;
}

export function PlanCatalogCard({ offer }: { offer?: OfferAdminResponse | null }) {
  const view = offer ? offerViewOf(offer.settings, offer.catalog) : DEFAULT_OFFER_VIEW;
  const starter = view.plans.starter;
  const plans = plansOf(view.plans);
  const pct = yearlyDiscountPct(plans);
  const cheapest = view.creditPacks[0];
  const rows: Row[] = [
    {
      key: "free",
      name: "무료",
      price: won(0),
      detail: `${libraryCountText(view.free.classics, view.free.folk) || "여는 동화 없음"} 듣기 · 가입하지 않아도`,
      tag: "비회원도",
      tone: "green",
    },
    {
      key: "starter",
      name: "스타트팩",
      price: won(starter.priceWon),
      detail: `동화 ${starter.books}권 · 가족 캐릭터 ${starter.familyCharacters}명 · 가족 목소리 ${starter.voices}명 · ${
        libraryCountText(view.starter.classics, view.starter.folk) || "명작·전래 없음"
      } 듣기`,
      tag: "처음 한 번",
      tone: "amber",
    },
    {
      key: "monthly",
      name: plans.monthly.name,
      price: priceLabel(plans.monthly),
      detail: passDetail(view.plans.monthly, view.libraryBooks),
    },
    {
      key: "yearly",
      name: plans.yearly.name,
      price: priceLabel(plans.yearly),
      detail: `월 환산 ${won(monthlyEquivalent(plans.yearly))} · ${passDetail(view.plans.yearly, view.libraryBooks)}`,
      tag: pct > 0 ? `${pct}% 할인` : undefined,
    },
    {
      key: "credits",
      name: "크레딧",
      price: cheapest ? `${won(cheapest.priceWon)}부터` : "–",
      detail: `${view.creditPacks.map((p) => `${won(p.priceWon)} ${creditsText(p.credits)}`).join(" · ")} — 동화 1권 ${creditsText(view.creditCosts.book)}`,
      tag: "단품",
      tone: "gray",
    },
    {
      key: "extra3",
      name: `${plans.extra3.name} (옛 상품)`,
      price: won(EXTRA.priceWon),
      detail: "요금제 화면에는 안 보여요 — 크레딧으로 바뀌었어요. 시연 결제에만 남아 있어요.",
      tag: "숨김",
      tone: "gray",
    },
  ];

  return (
    <section aria-labelledby="plan-catalog-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="plan-catalog-title" className="text-[17px] font-bold tracking-tight text-[#191f28]">
          요금제 <span className="text-[#8b95a1]">(고객에게 보이는 값)</span>
        </h2>
        <a
          href="/plans"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-[13px] font-bold text-[#3182f6] hover:bg-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#3182f6]"
        >
          고객 요금제 화면 보기
          <Icon name="external" size={16} />
        </a>
      </div>
      <DataTable caption="요금제 목록(읽기 전용)" columns={COLUMNS} rows={rows} rowKey={(r) => r.key} empty={null} />
      <div className="flex flex-col gap-1.5 rounded-2xl bg-[#f9fafb] px-4 py-3.5 text-[13px] font-medium leading-relaxed text-[#6b7684]">
        <p className="break-keep">
          가족 패스·스타트팩 값은 아래에서, 무료·스타트팩으로 여는 동화는 &lsquo;공개 동화&rsquo; 탭에서, 크레딧은 &lsquo;크레딧&rsquo;
          탭에서 바꿔요. 결제사를 연결해도 실제 결제 금액은 늘 서버가 이 값으로 정해요.
        </p>
        <p className="break-keep">회원 한 명 한 명의 요금제는 &lsquo;회원&rsquo; 화면에서 정해요.</p>
        <p className="break-keep">환불 기준: 결제 후 {REFUND_DAYS}일 안에 한 권도 만들지 않았으면 전액</p>
      </div>
    </section>
  );
}
