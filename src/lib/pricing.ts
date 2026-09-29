/**
 * 가격표 — 토큰 값·지급량을 **DB(app_pricing)에서 읽는다**. 관리실에서 사장님이 정한다.
 *
 * 왜: 예전엔 값이 src/lib/tokens.ts 상수와 supabase-setup.sql 두 곳에 흩어져 있어서,
 * 값 하나 바꾸려면 코드를 고치고 배포해야 했다. 이제 DB 한 줄이 기준이고 앱은 그 값을 읽는다.
 *
 * ⚠️ 돈을 실제로 깎는 것은 **DB 함수**다(charge_story · charge_illustration · spend_tokens).
 * 여기 값은 **보여 주기 위한 것**이다 — 화면 숫자와 실제 차감이 어긋나지 않게 같은 표에서 읽을 뿐,
 * 브라우저가 이 값을 고쳐도 깎이는 액수는 달라지지 않는다.
 *
 * 못 읽으면(로그인 전·네트워크·옛 DB) tokens.ts 의 상수로 물러선다 — 화면이 비지 않게.
 */
import { getSupabase } from "@/lib/supabase";
import {
  COST_ILLUSTRATED_PER_PAGE,
  COST_PARENT_VOICE,
  COST_TEXT_PER_PAGE,
  MAX_BOOKS_PER_USER,
  SIGNUP_BONUS_TOKENS,
  TOKEN_PRICE_KRW,
} from "@/lib/tokens";

export type Pricing = {
  token_price_krw: number;
  signup_bonus_tokens: number;
  cost_text_per_page: number;
  cost_illustrated_per_page: number;
  cost_parent_voice: number;
  max_books_per_user: number;
  feedback_bonus_tokens: number;
  max_free_rewrites: number;
  /** 파는 값 — 정해 두는 금액이다. 실제 결제(PG)는 아직 안 붙었다. */
  single_book_krw: number;
  sub_weekly_krw: number;
  sub_weekly_tokens: number;
  sub_monthly_krw: number;
  sub_monthly_tokens: number;
  sub_yearly_krw: number;
  sub_yearly_tokens: number;
  updated_at?: string | null;
};

/** DB 를 못 읽을 때 쓰는 값 — supabase-setup.sql 의 app_pricing 기본값과 같아야 한다. */
export const DEFAULT_PRICING: Pricing = {
  token_price_krw: TOKEN_PRICE_KRW,
  signup_bonus_tokens: SIGNUP_BONUS_TOKENS,
  cost_text_per_page: COST_TEXT_PER_PAGE,
  cost_illustrated_per_page: COST_ILLUSTRATED_PER_PAGE,
  cost_parent_voice: COST_PARENT_VOICE,
  max_books_per_user: MAX_BOOKS_PER_USER,
  feedback_bonus_tokens: 100,
  max_free_rewrites: 2,
  single_book_krw: 1500,
  sub_weekly_krw: 2900,
  sub_weekly_tokens: 30,
  sub_monthly_krw: 9900,
  sub_monthly_tokens: 120,
  sub_yearly_krw: 99000,
  sub_yearly_tokens: 1440,
};

export const PRICING_COLUMNS =
  "token_price_krw,signup_bonus_tokens,cost_text_per_page,cost_illustrated_per_page,cost_parent_voice,max_books_per_user,feedback_bonus_tokens,max_free_rewrites,single_book_krw,sub_weekly_krw,sub_weekly_tokens,sub_monthly_krw,sub_monthly_tokens,sub_yearly_krw,sub_yearly_tokens,updated_at";
/** 옛 DB(구독 칸이 없는)에서 다시 읽을 때 쓰는 칸 목록 — 없는 칸을 적으면 42703 이 난다. */
export const PRICING_COLUMNS_BASE =
  "token_price_krw,signup_bonus_tokens,cost_text_per_page,cost_illustrated_per_page,cost_parent_voice,max_books_per_user,feedback_bonus_tokens,max_free_rewrites,updated_at";

/** 관리실 화면에서 쓰는 칸 설명 — 이름·단위·무슨 뜻인지 한 줄. */
export const PRICING_FIELDS = [
  { key: "cost_text_per_page", label: "대본 값", unit: "토큰 / 쪽", help: "이야기(글)를 만들 때 쪽마다 드는 값이에요." },
  { key: "cost_illustrated_per_page", label: "그림동화 값", unit: "토큰 / 쪽", help: "대본 값을 포함한 값이에요. 그림을 붙일 때 차액만 더 받아요." },
  { key: "cost_parent_voice", label: "부모 목소리", unit: "토큰 / 1회", help: "엄마·아빠 목소리를 만들 때 한 번 드는 값이에요." },
  { key: "signup_bonus_tokens", label: "가입 지급", unit: "토큰", help: "새로 가입한 분께 드리는 토큰이에요." },
  { key: "token_price_krw", label: "1토큰 가격", unit: "원", help: "화면에 얼마짜리인지 보여 줄 때 쓰는 값이에요." },
  { key: "max_books_per_user", label: "권수 상한", unit: "권", help: "한 계정이 만들 수 있는 동화 수예요." },
] as const;

/** 파는 값 — 구독과 단권. 결제가 붙기 전이라 '정해 두는 금액'이다. */
export const PRICING_FIELDS_SALES = [
  { key: "single_book_krw", label: "동화 한 권", unit: "원", help: "구독 없이 한 권만 살 때 받는 값이에요." },
  { key: "sub_weekly_krw", label: "주 구독", unit: "원 / 주", help: "일주일 이용권 값이에요." },
  { key: "sub_weekly_tokens", label: "주 구독 토큰", unit: "토큰", help: "주 구독을 하면 드리는 토큰이에요." },
  { key: "sub_monthly_krw", label: "월 구독", unit: "원 / 달", help: "한 달 이용권 값이에요." },
  { key: "sub_monthly_tokens", label: "월 구독 토큰", unit: "토큰", help: "월 구독을 하면 매달 드리는 토큰이에요." },
  { key: "sub_yearly_krw", label: "연 구독", unit: "원 / 해", help: "1년 이용권 값이에요. 월 구독 12달치보다 싸야 해요." },
  { key: "sub_yearly_tokens", label: "연 구독 토큰", unit: "토큰", help: "연 구독을 하면 드리는 토큰이에요." },
] as const;

/** 고급 — 자주 만지지 않는 값. 화면에서는 접어 둔다. */
export const PRICING_FIELDS_ADVANCED = [
  { key: "feedback_bonus_tokens", label: "의견 첫 글 보상", unit: "토큰", help: "게시판에 처음 글을 남기면 드리는 토큰이에요." },
  { key: "max_free_rewrites", label: "무료 다시쓰기", unit: "회", help: "대본 값을 낸 뒤 공짜로 다시 만들 수 있는 횟수예요. '문장만 다시 쓰기'와 '새로 짓기'를 합쳐 셉니다." },
] as const;

export type PricingField =
  | (typeof PRICING_FIELDS)[number]["key"]
  | (typeof PRICING_FIELDS_SALES)[number]["key"]
  | (typeof PRICING_FIELDS_ADVANCED)[number]["key"];

/** 받은 값에서 숫자 칸만 추려 온전한 가격표로 만든다(모르는 칸·빈 칸은 기본값). */
export function asPricing(raw: unknown): Pricing {
  const row = (raw ?? {}) as Record<string, unknown>;
  const num = (key: keyof Pricing, fallback: number) => {
    const v = row[key];
    return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : fallback;
  };
  return {
    token_price_krw: num("token_price_krw", DEFAULT_PRICING.token_price_krw),
    signup_bonus_tokens: num("signup_bonus_tokens", DEFAULT_PRICING.signup_bonus_tokens),
    cost_text_per_page: num("cost_text_per_page", DEFAULT_PRICING.cost_text_per_page),
    cost_illustrated_per_page: num("cost_illustrated_per_page", DEFAULT_PRICING.cost_illustrated_per_page),
    cost_parent_voice: num("cost_parent_voice", DEFAULT_PRICING.cost_parent_voice),
    max_books_per_user: num("max_books_per_user", DEFAULT_PRICING.max_books_per_user),
    feedback_bonus_tokens: num("feedback_bonus_tokens", DEFAULT_PRICING.feedback_bonus_tokens),
    max_free_rewrites: num("max_free_rewrites", DEFAULT_PRICING.max_free_rewrites),
    single_book_krw: num("single_book_krw", DEFAULT_PRICING.single_book_krw),
    sub_weekly_krw: num("sub_weekly_krw", DEFAULT_PRICING.sub_weekly_krw),
    sub_weekly_tokens: num("sub_weekly_tokens", DEFAULT_PRICING.sub_weekly_tokens),
    sub_monthly_krw: num("sub_monthly_krw", DEFAULT_PRICING.sub_monthly_krw),
    sub_monthly_tokens: num("sub_monthly_tokens", DEFAULT_PRICING.sub_monthly_tokens),
    sub_yearly_krw: num("sub_yearly_krw", DEFAULT_PRICING.sub_yearly_krw),
    sub_yearly_tokens: num("sub_yearly_tokens", DEFAULT_PRICING.sub_yearly_tokens),
    updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

/* ── 값 계산 — DB 의 charge_story · charge_illustration 과 같은 셈 ── */

/** 대본까지 만드는 값. */
export function scriptCost(pages: number, p: Pricing): number {
  return Math.max(1, Math.round(pages)) * Math.max(0, p.cost_text_per_page);
}

/** 대본 값을 낸 책에 그림을 붙일 때 더 드는 값. */
export function illustrationCost(pages: number, p: Pricing): number {
  return Math.max(1, Math.round(pages)) * Math.max(0, p.cost_illustrated_per_page - p.cost_text_per_page);
}

/** 그림동화 한 권 값(대본 + 그림). */
export function bookCost(pages: number, p: Pricing): number {
  return scriptCost(pages, p) + illustrationCost(pages, p);
}

/** 토큰을 원으로. "10토큰 = 1,000원" 처럼 보여 줄 때. */
export function tokensToWon(tokens: number, p: Pricing): number {
  return Math.max(0, Math.round(tokens)) * Math.max(0, p.token_price_krw);
}

export function formatWon(won: number): string {
  return `${Math.round(won).toLocaleString("ko-KR")}원`;
}

/* ── 읽기 ── */

let cached: Pricing | null = null;
let inFlight: Promise<Pricing> | null = null;

/**
 * 지금 가격을 읽는다. 한 번 읽으면 이 창이 살아 있는 동안 다시 읽지 않는다
 * (값은 사장님만, 아주 가끔 바꾼다). 못 읽으면 기본값.
 */
export async function loadPricing(): Promise<Pricing> {
  if (cached) return cached;
  if (inFlight) return inFlight;
  const sb = getSupabase();
  if (!sb) return DEFAULT_PRICING;
  inFlight = (async () => {
    try {
      let { data, error } = await sb.from("app_pricing").select(PRICING_COLUMNS).eq("id", 1).maybeSingle();
      // 구독 칸이 없는 옛 DB 면 한 번 더 — 그 칸만 빼고 읽는다(42703).
      if (error) {
        ({ data, error } = await sb.from("app_pricing").select(PRICING_COLUMNS_BASE).eq("id", 1).maybeSingle());
      }
      // 표가 아직 없는 DB(42P01)여도 만들기를 막지 않는다 — 기본값으로 간다.
      if (error || !data) return DEFAULT_PRICING;
      cached = asPricing(data);
      return cached;
    } catch {
      return DEFAULT_PRICING;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** 관리실에서 값을 바꾼 뒤 — 다음 읽기가 새 값을 가져오게 한다. */
export function clearPricingCache(): void {
  cached = null;
}
