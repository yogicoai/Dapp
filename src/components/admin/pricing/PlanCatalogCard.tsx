"use client";

/**
 * 요금제 (고객에게 보이는 값) — 읽기 전용.
 *
 * 값은 lib/plans(고객 요금제 화면 /plans 와 같은 곳)에서만 온다 — 여기서 숫자를 손으로 적지 않는다.
 * 지금은 앱 코드에 적힌 값이라 관리실에서 바꿀 수 없다. 결제사(PG)를 붙일 때 이 표를 DB 로 옮기고
 * 여기서 바꾸게 한다(그때도 실제 결제 금액은 서버 가격표가 정한다 — 브라우저가 보낸 금액은 믿지 않는다).
 */
import {
  EXTRA,
  PASS,
  PLANS,
  REFUND_DAYS,
  TRIAL,
  monthlyEquivalent,
  priceLabel,
  won,
  yearlyDiscountPct,
} from "@/lib/plans";
import { Badge, DataTable, Icon, type Column } from "@/components/admin/kit";

type Row = { key: string; name: string; price: string; detail: string; tag?: string };

const PASS_DETAIL = `매달 ${PASS.booksPerMonth}권 · 목소리 ${PASS.voices}개 · 아이 ${PASS.childProfiles}명 · 가족 캐릭터 ${PASS.familyCharacters}명`;

const ROWS: Row[] = [
  { key: "monthly", name: PLANS.monthly.name, price: priceLabel(PLANS.monthly), detail: PASS_DETAIL },
  {
    key: "yearly",
    name: PLANS.yearly.name,
    price: priceLabel(PLANS.yearly),
    detail: `월 환산 ${won(monthlyEquivalent(PLANS.yearly))} · 구성은 월간과 같아요`,
    tag: `${yearlyDiscountPct()}% 할인`,
  },
  {
    key: "extra3",
    name: PLANS.extra3.name,
    price: won(EXTRA.priceWon),
    detail: `책 ${EXTRA.books}권 더하기 · 한 번 결제`,
    tag: "가족 패스 전용",
  },
  {
    key: "trial",
    name: "무료 체험",
    price: won(TRIAL.priceWon),
    detail: `첫 동화 ${TRIAL.books}권 · 부모 목소리 ${TRIAL.voices}개 · ${TRIAL.keepDays}일 보관`,
  },
];

const COLUMNS: Column<Row>[] = [
  { key: "name", header: "요금제", cell: (r) => <span className="font-bold">{r.name}</span>, mobile: "title", width: "180px" },
  { key: "price", header: "값(부가세 포함)", cell: (r) => <span className="font-bold tabular-nums">{r.price}</span>, width: "150px" },
  { key: "detail", header: "구성", cell: (r) => <span className="break-keep text-[#4e5968]">{r.detail}</span> },
  { key: "tag", header: "표시", cell: (r) => (r.tag ? <Badge tone="blue">{r.tag}</Badge> : null), mobile: "badge", width: "130px" },
];

export function PlanCatalogCard() {
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
      <DataTable caption="요금제 목록(읽기 전용)" columns={COLUMNS} rows={ROWS} rowKey={(r) => r.key} empty={null} />
      <div className="flex flex-col gap-1.5 rounded-2xl bg-[#f9fafb] px-4 py-3.5 text-[13px] font-medium leading-relaxed text-[#6b7684]">
        <p className="break-keep">
          지금은 앱 코드에 적힌 값이에요. 결제사를 연결할 때 이 값을 데이터베이스로 옮겨 여기서 바꿀 수 있게 해요. 실제 결제
          금액은 늘 서버 가격표가 정해요.
        </p>
        <p className="break-keep">
          환불 기준: 결제 후 {REFUND_DAYS}일 안에 한 권도 만들지 않았으면 전액
        </p>
      </div>
    </section>
  );
}
