/**
 * 결제 시연 — 스위치·결제 수단·동의·주소 값 정리·시연 주문번호·어른 확인·시연 기록.
 *
 * 이 파일은 **아무 데도 쓰지 않는다**(서버·DB·잔액 모두). 시연 기록은 이 탭의 sessionStorage 에만 남고,
 * 그 기록을 읽는 화면은 /checkout/done 과 /billing 두 곳뿐이다(pay-demo.guard.test 가 지킨다).
 * 그래서 시연의 "남은 책"·"내 크레딧"·스타트팩은 앱의 만들기 권한·잔액과 아무 관계가 없다.
 * 시연으로 사는 것: 가족 패스(월간·연간) · 추가 3권 · 스타트팩 · 크레딧 묶음(스타트팩·크레딧은 2026-10-02 더함).
 *
 * 나중에 진짜 PG 를 붙이면: CheckoutLive 와 결제 서버 경로(api/payments/…)를 **옆에 새로** 만들고,
 * 이 파일과 components/pay 의 *Demo* 파일은 통째로 지운다. 진짜 결제는 이 파일의 값을 쓰지 않는다.
 * PG 를 붙일 자리는 TODO(PG-HOOK-1~6) 로 표시해 두었다(CheckoutDemo·DoneDemo·FailView·BillingDemo·checkout/done page).
 * TODO(PG-HOOK-3) 화면 자리는 없다 — 결제사 알림을 받는 서버 경로(api/payments/webhook)가 취소·자동결제 성공·실패 상태를 맞춘다.
 * import 는 ./plans.ts 하나뿐인 순수 파일이다 — node --test 가 그대로 읽는다.
 */
import {
  DEFAULT_PLAN_TERMS,
  EXTRA,
  PLANS,
  REFUND_DAYS,
  creditsText,
  isPlanId,
  nextBillingDate,
  plansOf,
  won,
  type CreditPack,
  type Plan,
  type PlanId,
  type PlanTerms,
} from "./plans.ts";

/* ─────────────────────────── 스위치 ─────────────────────────── */

export type PayDemoMode = "on" | "off";

/** "off"(앞뒤 공백·대소문자 무시)일 때만 off. 값이 없으면 on — 아직 진짜 결제가 없어서. */
export function payDemoMode(raw: string | undefined): PayDemoMode {
  return typeof raw === "string" && raw.trim().toLowerCase() === "off" ? "off" : "on";
}

/**
 * 빌드 때 코드에 박히는 값이다 — 글자 그대로 한 번만 읽는다(변수에 담아 읽으면 박히지 않는다).
 * 그래서 값을 바꾸면 다시 배포해야 적용된다.
 * 나중에 진짜 PG: 값에 "live" 를 더하고, 얇은 page.tsx 가 CheckoutLive 를 고른다.
 */
export const PAY_DEMO: PayDemoMode = payDemoMode(process.env.NEXT_PUBLIC_PAY_DEMO);

/* ─────────────────────────── 결제 수단 ─────────────────────────── */

/** 휴대폰 결제는 넣지 않는다(아이가 누르기 쉬운 수단). 로고 없이 글자만 — 진짜 연결 때는 결제사 창이 그린다. */
export const PAY_METHODS = [
  { id: "card", label: "카드" },
  { id: "kakaopay", label: "카카오페이" },
  { id: "naverpay", label: "네이버페이" },
  { id: "tosspay", label: "토스페이" },
] as const;

export type PayMethodId = (typeof PAY_METHODS)[number]["id"];

export function methodLabel(id: PayMethodId): string {
  return PAY_METHODS.find((m) => m.id === id)?.label ?? "카드";
}

/* ─────────────────────────── 동의 (초안, 결정 D4) ─────────────────────────── */

export type ConsentDef = {
  id: "order" | "withdrawal";
  label: (p: Plan) => string;
  sheetTitle: string;
  sheetBody: (p: Plan) => string[];
};

const CANCEL_LINE = "'내 결제·구독'에서 언제든 해지할 수 있고, 해지해도 결제한 기간이 끝날 때까지는 그대로 쓸 수 있어요.";

export const CONSENTS: readonly [ConsentDef, ConsentDef] = [
  {
    id: "order",
    label: (p) =>
      p.kind === "subscription"
        ? "주문 내용과 자동 결제 조건을 확인했고, 결제에 동의해요"
        : "주문 내용을 확인했고, 결제에 동의해요",
    sheetTitle: "주문 내용과 결제 조건",
    sheetBody: (p) => {
      const price = won(p.priceWon);
      if (p.period === "month") {
        return [
          `${p.name}는 ${price}(부가세 포함)이에요.`,
          `결제한 날부터 한 달 동안 새 동화책 ${p.books}권을 만들 수 있고, 매달 같은 날 ${price}이 자동으로 결제돼요.`,
          CANCEL_LINE,
        ];
      }
      if (p.period === "year") {
        return [
          `${p.name}는 ${price}(부가세 포함)이에요.`,
          `결제한 날부터 1년 동안 매달 새 동화책 ${p.books}권을 만들 수 있고, 1년 뒤 같은 날 ${price}이 자동으로 결제돼요.`,
          CANCEL_LINE,
        ];
      }
      if (p.kind === "starter") {
        return [
          `${p.name}은 ${price}(부가세 포함)이에요.`,
          `한 번만 결제되고, 자동으로 다시 결제되지 않아요. 우리 아이 동화 ${p.books}권을 만들 수 있고, 만든 책은 계속 남아요.`,
          "스타트팩은 처음 한 번만 살 수 있어요.",
        ];
      }
      if (p.kind === "credit") {
        return [
          `${p.name}은 ${price}(부가세 포함)이에요.`,
          "한 번만 결제되고, 자동으로 다시 결제되지 않아요. 가족 패스·스타트팩에 든 몫을 다 쓴 뒤 동화·가족 캐릭터·가족 목소리를 더할 때 써요.",
          "크레딧을 쓸 수 있는 기간은 약관이 나오면 여기에 적어요.",
        ];
      }
      return [
        `${p.name}은 ${price}(부가세 포함)이에요.`,
        `한 번만 결제되고, 자동으로 다시 결제되지 않아요. 지금 쓰는 가족 패스에 동화책 ${p.books}권이 더해져요.`,
      ];
    },
  },
  {
    id: "withdrawal",
    // 크레딧은 '만드는 것'이 아니라 '쓰는 것'이라 문장이 다르다(기준 날짜는 같다)
    label: (p) =>
      p.kind === "credit"
        ? "크레딧을 쓰기 시작하면 디지털 콘텐츠라 청약철회(환불)가 제한될 수 있다는 것을 확인했어요"
        : "동화를 만들기 시작하면 디지털 콘텐츠라 청약철회(환불)가 제한될 수 있다는 것을 확인했어요",
    sheetTitle: "청약철회(환불) 제한 안내",
    sheetBody: (p) =>
      p.kind === "credit"
        ? [
            "크레딧은 결제하면 바로 쓸 수 있는 디지털 콘텐츠예요.",
            `결제하고 ${REFUND_DAYS}일 안에 크레딧을 하나도 쓰지 않았다면 전액 돌려드려요.`,
            "크레딧을 쓰기 시작하면 쓴 만큼은 돌려드리기 어려워요.",
          ]
        : [
            "동화책은 주문을 받아 새로 만드는 디지털 콘텐츠예요.",
            `결제하고 ${REFUND_DAYS}일 안에 새 동화를 한 권도 만들지 않았다면 전액 돌려드려요.`,
            "동화를 만들기 시작하면 만든 만큼은 돌려드리기 어려워요.",
          ],
  },
];

/** 동의는 미리 체크하지 않는다. */
export function initialConsents(): [boolean, boolean] {
  return [false, false];
}

/* ─────────────────────────── 주소 값 정리 — 정해진 값만 받는다 ─────────────────────────── */

/** 글자 하나이고 목록에 있을 때만(배열·대문자·다른 값은 null). */
export function parsePlan(v: unknown): PlanId | null {
  return typeof v === "string" && isPlanId(v) ? v : null;
}

export function parseMethod(v: unknown): PayMethodId | null {
  return typeof v === "string" && PAY_METHODS.some((m) => m.id === v) ? (v as PayMethodId) : null;
}

/** 크레딧 묶음 값(pack=원) — 숫자만 3~7자리(관리실 묶음 값 범위 500원~1,000,000원). 목록에 있는지는 보지 않는다. */
export function parsePackPrice(v: unknown): number | null {
  return typeof v === "string" && /^\d{3,7}$/.test(v) ? Number(v) : null;
}

/** 고른 크레딧 묶음 — 값이 관리실 묶음 목록(packs)에 있을 때만. 금액·크레딧 수는 주소가 아니라 목록에서 온다. */
export function parseCreditPack(packs: readonly CreditPack[], v: unknown): CreditPack | null {
  const price = parsePackPrice(v);
  return price === null ? null : (packs.find((p) => p.priceWon === price) ?? null);
}

/** 결제하기 주소 — 크레딧은 고른 묶음 값이 있어야 한다(없으면 요금제 화면으로). */
export function checkoutHref(plan: PlanId, packPrice?: number | null): string {
  if (plan !== "credit") return `/checkout?plan=${plan}`;
  return packPrice ? `/checkout?plan=credit&pack=${packPrice}` : "/plans";
}

/** 코드 이름은 흔한 결제사 이름을 빌렸다 — 진짜 연결 때 계약한 PG 문서에 맞춘다. */
export type FailCode = "PAY_PROCESS_CANCELED" | "REJECT_CARD_COMPANY" | "UNKNOWN";

export function parseFailCode(v: unknown): FailCode {
  return v === "PAY_PROCESS_CANCELED" || v === "REJECT_CARD_COMPANY" ? v : "UNKNOWN";
}

/** 실패 문구는 코드만 보고 우리 문장에서 고른다 — 주소에 실려 온 설명 글은 읽지 않는다. */
export function failCopy(c: FailCode): string {
  if (c === "PAY_PROCESS_CANCELED") return "결제창을 닫아서 결제를 멈췄어요.";
  if (c === "REJECT_CARD_COMPANY") return "카드사에서 결제를 받지 않았어요. 한도나 잔액을 확인하거나, 다른 결제 수단으로 해 보세요.";
  return "잠시 연결이 고르지 않았어요. 조금 뒤에 다시 해 주세요.";
}

/* ─────────────────────────── 시연 주문번호 ─────────────────────────── */

/** 헷갈리는 0·O·1·I 를 뺀 32글자 */
const ORDER_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEMO_ORDER_RE = /^DEMO-\d{8}-[A-HJ-NP-Z2-9]{6}$/;

function pick(rand: () => number, n: number): number {
  const i = Math.floor(rand() * n);
  return Math.min(Math.max(i, 0), n - 1);
}

/** "DEMO-20260930-7K2Q9X" — 진짜 주문번호는 나중에 서버가 만들고 이 모양과 겹치지 않는다. */
export function demoOrderId(now: Date, rand: () => number): string {
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  let tail = "";
  for (let i = 0; i < 6; i++) tail += ORDER_CHARS[pick(rand, ORDER_CHARS.length)];
  return `DEMO-${ymd}-${tail}`;
}

export function isDemoOrderId(v: unknown): v is string {
  return typeof v === "string" && DEMO_ORDER_RE.test(v);
}

/* ─────────────────────────── 어른 확인 ─────────────────────────── */

export type ParentQ = { a: number; b: number };

/** 두 자리 × 한 자리 곱셈(12~19 × 3~9, 답 36~171) — 4~7세는 풀기 어렵고 화면 읽기 사용자도 풀 수 있다. */
export function parentQuestion(rand: () => number): ParentQ {
  return { a: 12 + pick(rand, 8), b: 3 + pick(rand, 7) };
}

/** 앞뒤 공백은 봐주고, 숫자만 받는다. */
export function checkParentAnswer(q: ParentQ, input: string): boolean {
  const s = input.trim();
  if (!/^\d{1,3}$/.test(s)) return false;
  return Number(s) === q.a * q.b;
}

/* ─────────────────────────── 시연 기록 — 이 탭의 sessionStorage 에만 ─────────────────────────── */
/* 서버로 보내지 않는다. /checkout/done · /billing 만 읽는다. */

/** credits — 크레딧 주문만(받는 크레딧 수). 다른 주문에는 없다. */
export type DemoPending = { orderId: string; plan: PlanId; method: PayMethodId; amountWon: number; at: string; credits?: number };
export type DemoPass = { plan: "monthly" | "yearly"; startedAt: string; nextBillingAt: string; booksLeft: number };
/** 스타트팩(시연) — 산 날과 남은 동화 */
export type DemoStarter = { boughtAt: string; booksLeft: number };
export type DemoReceipt = { orderId: string; plan: PlanId; amountWon: number; method: PayMethodId; at: string; credits?: number };
/**
 * starter · credits 는 2026-10-02 더했다(스타트팩·크레딧 시연 결제). 그 전에 적힌 기록에는 없어서
 * 읽을 때 null · 0 으로 채운다 — 그래서 v 는 1 그대로다.
 */
export type DemoState = {
  v: 1;
  pending: DemoPending | null;
  pass: DemoPass | null;
  starter: DemoStarter | null;
  /** 크레딧 잔액(시연) */
  credits: number;
  receipts: DemoReceipt[];
};

export const EMPTY_DEMO: DemoState = Object.freeze({
  v: 1,
  pending: null,
  pass: null,
  starter: null,
  credits: 0,
  receipts: [],
}) as DemoState;

const RECEIPTS_MAX = 10;
/** 크레딧 칸(주문 하나 · 잔액)의 끝 — 모양 확인용 */
const CREDITS_MAX = 99_999_999;

type KV = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function demoKey(uid: string): string {
  return `voice-storybook:pay-demo:v1:${uid}`;
}

/** 기본 저장소 — 브라우저면 이 탭의 sessionStorage(사생활 모드에서 읽기부터 던질 수 있어 감싼다). */
function defaultKV(): KV | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function emptyDemo(): DemoState {
  return { v: 1, pending: null, pass: null, starter: null, credits: 0, receipts: [] };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isIsoDate(v: unknown): v is string {
  return typeof v === "string" && !Number.isNaN(Date.parse(v));
}
function isAmount(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}
function isIntIn(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}

function toPending(v: unknown): DemoPending | null {
  if (!isObj(v)) return null;
  const plan = parsePlan(v.plan);
  const method = parseMethod(v.method);
  if (!isDemoOrderId(v.orderId) || !plan || !method || !isAmount(v.amountWon) || !isIsoDate(v.at)) return null;
  const base = { orderId: v.orderId, plan, method, amountWon: v.amountWon, at: v.at };
  if (plan !== "credit") return base;
  // 크레딧 주문은 받는 크레딧 수가 꼭 있어야 한다
  return isIntIn(v.credits, 1, CREDITS_MAX) ? { ...base, credits: v.credits } : null;
}

function toPass(v: unknown): DemoPass | null {
  if (!isObj(v)) return null;
  const plan = v.plan === "monthly" || v.plan === "yearly" ? v.plan : null;
  const books = v.booksLeft;
  if (!plan || !isIsoDate(v.startedAt) || !isIsoDate(v.nextBillingAt)) return null;
  if (!isIntIn(books, 0, 999)) return null;
  return { plan, startedAt: v.startedAt, nextBillingAt: v.nextBillingAt, booksLeft: books };
}

function toStarter(v: unknown): DemoStarter | null {
  if (!isObj(v) || !isIsoDate(v.boughtAt) || !isIntIn(v.booksLeft, 0, 999)) return null;
  return { boughtAt: v.boughtAt, booksLeft: v.booksLeft };
}

function toReceipt(v: unknown): DemoReceipt | null {
  const p = toPending(v); // 같은 칸(주문번호·요금제·금액·수단·시각 · 크레딧 주문은 크레딧 수까지)
  if (!p) return null;
  const r: DemoReceipt = { orderId: p.orderId, plan: p.plan, amountWon: p.amountWon, method: p.method, at: p.at };
  return p.credits ? { ...r, credits: p.credits } : r;
}

/** 모양이 틀리거나 저장소가 던지면 빈 기록. */
export function readDemoState(uid: string, kv?: KV | null): DemoState {
  const store = kv === undefined ? defaultKV() : kv;
  if (!uid || !store) return emptyDemo();
  try {
    const raw = store.getItem(demoKey(uid));
    if (!raw) return emptyDemo();
    const j: unknown = JSON.parse(raw);
    if (!isObj(j) || j.v !== 1 || !Array.isArray(j.receipts)) return emptyDemo();
    const receipts = j.receipts.map(toReceipt).filter((r): r is DemoReceipt => r !== null).slice(0, RECEIPTS_MAX);
    return {
      v: 1,
      pending: toPending(j.pending),
      pass: toPass(j.pass),
      starter: toStarter(j.starter),
      credits: isIntIn(j.credits, 0, CREDITS_MAX) ? j.credits : 0,
      receipts,
    };
  } catch {
    return emptyDemo();
  }
}

export function writeDemoState(uid: string, s: DemoState, kv?: KV | null): void {
  const store = kv === undefined ? defaultKV() : kv;
  if (!uid || !store) return;
  try {
    store.setItem(demoKey(uid), JSON.stringify(s));
  } catch {
    /* 저장이 막힌 브라우저 — 시연만 이어지지 않을 뿐이다 */
  }
}

export function clearDemoState(uid: string, kv?: KV | null): void {
  const store = kv === undefined ? defaultKV() : kv;
  if (!uid || !store) return;
  try {
    store.removeItem(demoKey(uid));
  } catch {
    /* 위와 같음 */
  }
}

/** 추가 3권은 가족 패스(시연)가 있어야 살 수 있다. */
export function canBuyExtra(s: DemoState): boolean {
  return s.pass !== null;
}

/** 스타트팩은 처음 한 번만 — 이 탭의 시연 기록에 산 적이 없을 때만. */
export function canBuyStarter(s: DemoState): boolean {
  return s.starter === null;
}

/** 결제 내역 줄 이름 — 크레딧은 그 주문의 크레딧 수("50크레딧"), 나머지는 요금제 이름(관리실 값 terms) */
export function receiptName(r: DemoReceipt, terms: PlanTerms = DEFAULT_PLAN_TERMS): string {
  if (r.plan === "credit") return r.credits ? creditsText(r.credits) : PLANS.credit.shortName;
  return plansOf(terms)[r.plan].name;
}

/**
 * 완료 화면을 그려도 되는가.
 *  fresh : 이 탭에서 대기 중인 주문과 번호·요금제(·수단)가 같다 → 한 번 반영한다.
 *  again : 이미 반영한 번호(새로고침) → 다시 쓰지 않고 그리기만.
 *  no    : 주소를 붙여 넣었거나, 다른 탭이거나, 주문이 맞지 않는다.
 * method 를 주면(null 아님) 그것까지 맞아야 한다.
 */
export function doneEligibility(
  s: DemoState,
  orderId: string | null,
  plan: PlanId | null,
  method?: PayMethodId | null,
): "fresh" | "again" | "no" {
  if (!orderId || !plan || !isDemoOrderId(orderId)) return "no";
  const sameMethod = (m: PayMethodId) => method == null || method === m;
  if (s.receipts.some((r) => r.orderId === orderId && r.plan === plan && sameMethod(r.method))) return "again";
  const p = s.pending;
  if (p && p.orderId === orderId && p.plan === plan && sameMethod(p.method)) {
    // 추가 3권은 가족 패스가 있어야 반영된다 — 없으면 완료로 그리지 않는다.
    if (PLANS[plan].subscriberOnly && !s.pass) return "no";
    // 스타트팩은 처음 한 번만 — 이미 샀으면 완료로 그리지 않는다.
    if (plan === "starter" && s.starter) return "no";
    return "fresh";
  }
  return "no";
}

/**
 * 대기 주문을 기록에 반영한다(순수 — 저장은 부르는 쪽이).
 *  구독: pass = { plan, startedAt, nextBillingAt, booksLeft: 그 주기의 매달 권수(관리실 요금제 값 terms) }
 *  추가 3권: pass 가 있으면 booksLeft + 3, 없으면 그대로
 *  스타트팩: starter = { boughtAt, booksLeft: 스타트팩 권수(terms) } — 이미 샀으면 그대로
 *  크레딧: 잔액 + 주문에 적힌 크레딧 수(결제하기 화면이 관리실 묶음 목록에서 고른 값)
 *  영수증을 앞에 하나 더한다(같은 번호는 한 번만, 최대 10개). pending 은 비운다.
 */
export function applyDemoOrder(s: DemoState, now: Date, terms: PlanTerms = DEFAULT_PLAN_TERMS): DemoState {
  const p = s.pending;
  if (!p) return s;
  // 이미 반영한 번호 — 대기만 비운다(두 번 반영하지 않는다).
  if (s.receipts.some((r) => r.orderId === p.orderId)) return { ...s, pending: null };
  const plan = plansOf(terms)[p.plan];
  let { pass, starter, credits } = s;
  if (plan.kind === "subscription") {
    const next = nextBillingDate(now, plan) ?? now;
    pass = {
      plan: p.plan === "yearly" ? "yearly" : "monthly",
      startedAt: now.toISOString(),
      nextBillingAt: next.toISOString(),
      booksLeft: (p.plan === "yearly" ? terms.yearly : terms.monthly).booksPerMonth,
    };
  } else if (plan.kind === "addon") {
    if (!s.pass) return s;
    pass = { ...s.pass, booksLeft: s.pass.booksLeft + EXTRA.books };
  } else if (plan.kind === "starter") {
    if (s.starter) return s;
    starter = { boughtAt: now.toISOString(), booksLeft: terms.starter.books };
  } else {
    if (!p.credits) return s;
    credits = Math.min(s.credits + p.credits, CREDITS_MAX);
  }
  const receipt: DemoReceipt = { orderId: p.orderId, plan: p.plan, amountWon: p.amountWon, method: p.method, at: now.toISOString() };
  if (plan.kind === "credit" && p.credits) receipt.credits = p.credits;
  return { v: 1, pending: null, pass, starter, credits, receipts: [receipt, ...s.receipts].slice(0, RECEIPTS_MAX) };
}
