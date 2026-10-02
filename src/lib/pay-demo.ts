/**
 * 결제 시연 — 스위치·결제 수단·동의·주소 값 정리·시연 주문번호·어른 확인·시연 기록.
 *
 * 이 파일은 **아무 데도 쓰지 않는다**(서버·DB·잔액 모두). 시연 기록은 이 탭의 sessionStorage 에만 남고,
 * 그 기록을 읽는 화면은 /checkout/done 과 /billing 두 곳뿐이다(pay-demo.guard.test 가 지킨다).
 * 그래서 시연의 "남은 책 6권"은 앱의 만들기 권한·잔액과 아무 관계가 없다.
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
  isPlanId,
  nextBillingDate,
  plansOf,
  won,
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
      return [
        `${p.name}은 ${price}(부가세 포함)이에요.`,
        `한 번만 결제되고, 자동으로 다시 결제되지 않아요. 지금 쓰는 가족 패스에 동화책 ${p.books}권이 더해져요.`,
      ];
    },
  },
  {
    id: "withdrawal",
    label: () => "동화를 만들기 시작하면 디지털 콘텐츠라 청약철회(환불)가 제한될 수 있다는 것을 확인했어요",
    sheetTitle: "청약철회(환불) 제한 안내",
    sheetBody: () => [
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

export type DemoPending = { orderId: string; plan: PlanId; method: PayMethodId; amountWon: number; at: string };
export type DemoPass = { plan: "monthly" | "yearly"; startedAt: string; nextBillingAt: string; booksLeft: number };
export type DemoReceipt = { orderId: string; plan: PlanId; amountWon: number; method: PayMethodId; at: string };
export type DemoState = { v: 1; pending: DemoPending | null; pass: DemoPass | null; receipts: DemoReceipt[] };

export const EMPTY_DEMO: DemoState = Object.freeze({ v: 1, pending: null, pass: null, receipts: [] }) as DemoState;

const RECEIPTS_MAX = 10;

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
  return { v: 1, pending: null, pass: null, receipts: [] };
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

function toPending(v: unknown): DemoPending | null {
  if (!isObj(v)) return null;
  const plan = parsePlan(v.plan);
  const method = parseMethod(v.method);
  if (!isDemoOrderId(v.orderId) || !plan || !method || !isAmount(v.amountWon) || !isIsoDate(v.at)) return null;
  return { orderId: v.orderId, plan, method, amountWon: v.amountWon, at: v.at };
}

function toPass(v: unknown): DemoPass | null {
  if (!isObj(v)) return null;
  const plan = v.plan === "monthly" || v.plan === "yearly" ? v.plan : null;
  const books = v.booksLeft;
  if (!plan || !isIsoDate(v.startedAt) || !isIsoDate(v.nextBillingAt)) return null;
  if (typeof books !== "number" || !Number.isInteger(books) || books < 0 || books > 999) return null;
  return { plan, startedAt: v.startedAt, nextBillingAt: v.nextBillingAt, booksLeft: books };
}

function toReceipt(v: unknown): DemoReceipt | null {
  const p = toPending(v); // 같은 칸(주문번호·요금제·금액·수단·시각)
  return p ? { orderId: p.orderId, plan: p.plan, amountWon: p.amountWon, method: p.method, at: p.at } : null;
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
    return { v: 1, pending: toPending(j.pending), pass: toPass(j.pass), receipts };
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
    return "fresh";
  }
  return "no";
}

/**
 * 대기 주문을 기록에 반영한다(순수 — 저장은 부르는 쪽이).
 *  구독: pass = { plan, startedAt, nextBillingAt, booksLeft: 그 주기의 매달 권수(관리실 요금제 값 terms) }
 *  추가 3권: pass 가 있으면 booksLeft + 3, 없으면 그대로
 *  영수증을 앞에 하나 더한다(같은 번호는 한 번만, 최대 10개). pending 은 비운다.
 */
export function applyDemoOrder(s: DemoState, now: Date, terms: PlanTerms = DEFAULT_PLAN_TERMS): DemoState {
  const p = s.pending;
  if (!p) return s;
  // 이미 반영한 번호 — 대기만 비운다(두 번 반영하지 않는다).
  if (s.receipts.some((r) => r.orderId === p.orderId)) return { ...s, pending: null };
  const plan = plansOf(terms)[p.plan];
  let pass: DemoPass | null;
  if (plan.kind === "subscription") {
    const next = nextBillingDate(now, plan) ?? now;
    pass = {
      plan: p.plan === "yearly" ? "yearly" : "monthly",
      startedAt: now.toISOString(),
      nextBillingAt: next.toISOString(),
      booksLeft: (p.plan === "yearly" ? terms.yearly : terms.monthly).booksPerMonth,
    };
  } else {
    if (!s.pass) return s;
    pass = { ...s.pass, booksLeft: s.pass.booksLeft + EXTRA.books };
  }
  const receipt: DemoReceipt = { orderId: p.orderId, plan: p.plan, amountWon: p.amountWon, method: p.method, at: now.toISOString() };
  return { v: 1, pending: null, pass, receipts: [receipt, ...s.receipts].slice(0, RECEIPTS_MAX) };
}
