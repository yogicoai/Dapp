/**
 * 요금제 — 클라이언트 가격정책 권고안(2026-09-23) 4장의 "보여 주기" 값.
 *
 * ⚠️ PG 를 붙일 때: 실제 결제 금액은 **서버가 서버 쪽 가격표로 정한다**(주문 만들기 서버 경로).
 *    이 파일의 값은 화면 표시용이고, 브라우저가 보낸 금액을 믿으면 안 된다.
 * ⚠️ 권고안은 대외비 — 권고안의 비용 계산 숫자·낱말은 이 파일(주석 포함)에 넣지 않는다(plans.test 가 막음).
 * 관리실 app_pricing 의 sub_* · single_book_krw 는 옛 가격표다 — 여기서 읽지 않는다.
 *
 * import 없는 순수 파일이다 — node --test 가 그대로 읽는다.
 * 고객에게는 "권"(책 수)으로만 보여 준다. 앱 안의 내부 계산 단위 이름은 이 파일에 쓰지 않는다.
 */

export type PlanId = "monthly" | "yearly" | "extra3";
export type PlanPeriod = "month" | "year" | "once";

export type Plan = {
  id: PlanId;
  kind: "subscription" | "addon";
  /** "가족 패스 (월간)" · "가족 패스 (연간)" · "추가 3권" */
  name: string;
  /** "가족 패스" · "추가 3권" */
  shortName: string;
  /** 부가세 포함 */
  priceWon: number;
  period: PlanPeriod;
  /** monthly/yearly: 매달 새 책 수 · extra3: 더해지는 책 수 */
  books: number;
  /** extra3 만 true — 가족 패스를 쓰는 분만 살 수 있다 */
  subscriberOnly: boolean;
};

/** 가족 패스에 드리는 '우리 가족 캐릭터' 수 — 자리 표시 값, 사장님 확정 전(결정 D1). */
export const FAMILY_CHARACTERS_IN_PASS = 4;

/** 가족 패스 카드 꼬리표 — "가장 많이 골라요"는 실제 판매 기록이 생긴 뒤에(결정 D2). */
export const PASS_TAG = "추천";

/** 환불(청약철회) 기준 날짜 — 결제하고 이 날짜 안에 한 권도 만들지 않았으면 전액 환불(초안, 결정 D4). */
export const REFUND_DAYS = 7;

export type PassSpec = {
  booksPerMonth: number;
  voices: number;
  childProfiles: number;
  familyCharacters: number;
};

export const PASS = {
  booksPerMonth: 6,
  voices: 2,
  childProfiles: 2,
  familyCharacters: FAMILY_CHARACTERS_IN_PASS,
} as const satisfies PassSpec;

export const TRIAL = { priceWon: 0, books: 1, voices: 1, keepDays: 7 } as const;

export const EXTRA = { books: 3, priceWon: 4_900 } as const;

const MONTHLY_WON = 12_900;
const YEARLY_WON = 119_000;

export const PLANS: Record<PlanId, Plan> = {
  monthly: {
    id: "monthly",
    kind: "subscription",
    name: "가족 패스 (월간)",
    shortName: "가족 패스",
    priceWon: MONTHLY_WON,
    period: "month",
    books: PASS.booksPerMonth,
    subscriberOnly: false,
  },
  yearly: {
    id: "yearly",
    kind: "subscription",
    name: "가족 패스 (연간)",
    shortName: "가족 패스",
    priceWon: YEARLY_WON,
    period: "year",
    books: PASS.booksPerMonth,
    subscriberOnly: false,
  },
  extra3: {
    id: "extra3",
    kind: "addon",
    name: `추가 ${EXTRA.books}권`,
    shortName: `추가 ${EXTRA.books}권`,
    priceWon: EXTRA.priceWon,
    period: "once",
    books: EXTRA.books,
    subscriberOnly: true,
  },
};

export const PLAN_IDS: readonly PlanId[] = ["monthly", "yearly", "extra3"];

/** 가족 패스 구성 줄 — 값은 PASS 에서만 온다(숫자를 손으로 적지 않는다). */
export function passFeatures(p: PassSpec = PASS): string[] {
  return [
    `매달 새 동화책 ${p.booksPerMonth}권`,
    `가족 목소리 ${p.voices}개 (엄마·아빠·할머니·할아버지 중)`,
    "다시 듣기 무제한",
    `아이 프로필 ${p.childProfiles}개`,
    `우리 가족 캐릭터 ${p.familyCharacters}명까지`,
  ];
}

export const PASS_FEATURES: readonly string[] = passFeatures(PASS);

export const TRIAL_FEATURES: readonly string[] = [
  `첫 동화 ${TRIAL.books}권`,
  `부모 목소리 ${TRIAL.voices}개 체험`,
  `만든 책과 목소리는 ${TRIAL.keepDays}일 동안 보관한 뒤 지워져요`,
];

/** 진짜 결제가 열리기 전까지 /plans 머리에 보이는 한 줄. 열리면 null. */
export const PLANS_PREVIEW_NOTE: string | null = "곧 열리는 요금제예요. 지금은 베타라 결제 없이 쓰고 있어요.";

/* ─────────────────────────── 글자 도우미 ─────────────────────────── */

/** 12900 → "12,900원" — 정규식으로 쉼표를 찍는다(브라우저·서버의 숫자 표기 차이가 없다). */
export function won(n: number): string {
  const v = Math.round(n);
  const sign = v < 0 ? "-" : "";
  return `${sign}${String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}원`;
}

/** 월로 나눈 값 — yearly 119,000 → 9,917 · monthly 는 그대로. */
export function monthlyEquivalent(p: Plan): number {
  return p.period === "year" ? Math.round(p.priceWon / 12) : p.priceWon;
}

/** 연간이 월간 12달보다 얼마나 싼가(%) — 손으로 적지 않고 계산한다. */
export function yearlyDiscountPct(): number {
  return Math.round((1 - PLANS.yearly.priceWon / (PLANS.monthly.priceWon * 12)) * 100);
}

/** "월 12,900원" · "연 119,000원" · "4,900원" */
export function priceLabel(p: Plan): string {
  if (p.period === "month") return `월 ${won(p.priceWon)}`;
  if (p.period === "year") return `연 ${won(p.priceWon)}`;
  return won(p.priceWon);
}

export function booksText(n: number): string {
  return `${n}권`;
}

/** n 달 뒤 같은 날 — 그 날이 없는 달이면 그 달 마지막 날(1월 31일 → 2월 28/29일). */
function addMonthsClamped(from: Date, n: number): Date {
  const y = from.getFullYear();
  const m = from.getMonth() + n;
  const lastDay = new Date(y, m + 1, 0).getDate();
  return new Date(
    y,
    m,
    Math.min(from.getDate(), lastDay),
    from.getHours(),
    from.getMinutes(),
    from.getSeconds(),
    from.getMilliseconds(),
  );
}

/** 다음 결제일 — 월간은 한 달 뒤, 연간은 한 해 뒤. 한 번 결제(추가 3권)는 null. */
export function nextBillingDate(from: Date, p: Plan): Date | null {
  if (p.period === "month") return addMonthsClamped(from, 1);
  if (p.period === "year") return addMonthsClamped(from, 12);
  return null;
}

/** 자동 결제 날 안내 — "매달 15일" · "매달 30일(그 날이 없는 달은 마지막 날)" · "매년 9월 30일" */
export function billingDayText(d: Date, p: Plan): string {
  const day = d.getDate();
  const month = d.getMonth() + 1;
  if (p.period === "month") return day >= 29 ? `매달 ${day}일(그 날이 없는 달은 마지막 날)` : `매달 ${day}일`;
  if (p.period === "year") {
    return month === 2 && day === 29 ? "매년 2월 29일(그 날이 없는 해는 2월 28일)" : `매년 ${month}월 ${day}일`;
  }
  return "한 번만 결제";
}

/** "2026. 10. 30." — 손으로 만든다(toLocaleDateString 은 기기마다 모양이 다르다). */
export function formatDateKo(d: Date): string {
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

/** "9. 30." — 결제 내역 줄처럼 좁은 자리 */
export function formatShortDateKo(d: Date): string {
  return `${d.getMonth() + 1}. ${d.getDate()}.`;
}

export function isPlanId(v: unknown): v is PlanId {
  return typeof v === "string" && (PLAN_IDS as readonly string[]).includes(v);
}

/* ─────────────────────────── 자주 묻는 질문 · 환불 (초안, 결정 D4) ─────────────────────────── */

export const FAQ: readonly { q: string; a: string }[] = [
  {
    q: "언제든 해지할 수 있나요?",
    a: "네. '내 결제·구독'에서 언제든 해지할 수 있어요. 해지해도 이미 결제한 기간이 끝날 때까지는 그대로 쓸 수 있고, 다음 결제부터 멈춰요.",
  },
  {
    q: "환불은 어떻게 되나요?",
    a: `결제하고 ${REFUND_DAYS}일 안에 새 동화를 한 권도 만들지 않았다면 전액 돌려드려요. 동화를 만들기 시작하면 디지털 콘텐츠라서 환불이 제한될 수 있어요. 아래 환불 안내를 봐 주세요.`,
  },
  {
    q: "무료 체험으로 만든 책은 언제 지워지나요?",
    a: `체험으로 만든 책과 부모 목소리는 ${TRIAL.keepDays}일 동안 보관한 뒤 지워져요. 그 전에 가족 패스를 시작하면 그대로 남아요.`,
  },
  {
    q: "이번 달 책을 다 만들면요?",
    a: `가족 패스를 쓰는 분은 추가 ${EXTRA.books}권을 ${won(EXTRA.priceWon)}에 더 살 수 있어요.`,
  },
];

export const REFUND_SUMMARY: readonly string[] = [
  `결제 후 ${REFUND_DAYS}일 안에, 새 동화를 한 권도 만들지 않았다면 전액 환불해 드려요.`,
  "동화를 만들기 시작하면 디지털 콘텐츠라 청약철회가 제한될 수 있어요.",
  "해지하면 다음 결제부터 멈추고, 결제한 기간이 끝날 때까지는 계속 쓸 수 있어요.",
];
