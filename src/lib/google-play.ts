/**
 * 구글 플레이 결제 확인(2026-11-26 연동 시작) — 서버가 구글 Play Developer API 를 부르는 얇은 층.
 *
 * 왜: 앱(손님 폰)에서 온 구매 토큰은 꾸밀 수 있다. 이용권·크레딧을 주기 전에 서버가 구글에 직접 물어
 * '진짜 결제인지'를 확인하고, 3일 안에 확정(acknowledge)해야 구글이 자동 환불하지 않는다.
 *
 * 열쇠: Vercel·.env.local 의 GOOGLE_PLAY_SA_BASE64(서비스 계정 JSON 을 base64 로) · GOOGLE_PLAY_PACKAGE.
 * 서비스 계정 play-billing@maeum-play-billing 은 플레이 콘솔에서 마음보따리 앱에만 '재무 데이터 보기 · 주문 및 구독 관리' 권한.
 * 키 내용은 로그·응답에 절대 남기지 않는다.
 *
 * 상품(플레이 콘솔, 11-26 등록 — ID 는 영구):
 *   구독  family_pass(월간, 기본 요금제 monthly) · family_pass_yearly(연간, yearly)
 *         ※ 앱의 결제 다리(androidbrowserhelper billing 1.2.0)는 구독의 첫 기본 요금제만 띄울 수 있어
 *           월·연을 한 구독 안 기본 요금제로 두지 않고 구독을 둘로 나눴다(family_pass 안의 yearly 는 비활성).
 *   단품  starter_pack · credit_pack_1 · credit_pack_2 · credit_pack_3 (구매 옵션 buy)
 *
 * 순수한 부분(상품 표·응답 해석·JWT 모양·이번 달 몫 기간)은 시험(google-play.test.ts)이 바로 읽는다. 네트워크는 fetch 를 받아 쓴다.
 * 확인한 결과를 DB 에 적고 이용권을 주는 순서는 lib/google-play-server, DB 쪽은 supabase-google-play.sql.
 */
import { createHash, createHmac, createSign } from "node:crypto";

/* ─────────────────────────── 상품 표(화면과 같이 쓰는 순수 파일) ─────────────────────────── */

export {
  GOOGLE_PLAY_PRODUCTS,
  SELLING_NOW,
  googlePlayProduct,
  isPurchaseToken,
  isSellingNow,
  playSubscriptionsUrl,
  subscriptionProductOfPlan,
  type GooglePlayProduct,
  type GooglePlayProductKind,
} from "./google-play-products.ts";

/* ─────────────────────────── 서비스 계정 ─────────────────────────── */

export type ServiceAccount = { clientEmail: string; privateKey: string; tokenUri: string };

/** GOOGLE_PLAY_SA_BASE64 → 서비스 계정. 비었거나 모양이 틀리면 null(이유는 내용 없이). */
export function parseServiceAccount(b64: string | undefined | null): ServiceAccount | null {
  if (!b64 || !b64.trim()) return null;
  try {
    const json = JSON.parse(Buffer.from(b64.trim(), "base64").toString("utf8")) as Record<string, unknown>;
    const clientEmail = typeof json.client_email === "string" ? json.client_email : "";
    const privateKey = typeof json.private_key === "string" ? json.private_key : "";
    const tokenUri = typeof json.token_uri === "string" && json.token_uri.startsWith("https://")
      ? json.token_uri
      : "https://oauth2.googleapis.com/token";
    if (json.type !== "service_account" || !clientEmail.includes("@") || !privateKey.includes("PRIVATE KEY")) return null;
    return { clientEmail, privateKey, tokenUri };
  } catch {
    return null;
  }
}

/*
 * 서버 열쇠 — DB 의 구글 결제 함수(google_play_*)를 부를 때 낸다. 서비스 계정 비밀 키에서 뽑아 따로 환경변수를 두지 않는다.
 * DB 는 이 열쇠의 sha256 지문만 안다(billing_server_keys). 앱(브라우저)은 열쇠를 모르니 함수를 직접 불러 이용권을 받을 수 없다.
 * 서비스 계정 키를 바꾸면 지문도 바꿔야 한다 — node scripts/google-play-key-hash.mjs 가 새 지문 SQL 을 만든다.
 */
// v1 은 11-26 시험 중 출력에 섞여 버렸다 — 배포 전이라 v2 로 바꿨다(이름표를 바꾸면 열쇠가 바뀐다)
export const BILLING_KEY_LABEL = "maeum-billing-server-key/v2";

export function billingServerKeyOf(sa: ServiceAccount): string {
  return createHmac("sha256", sa.privateKey).update(BILLING_KEY_LABEL).digest("hex");
}

/** 환경변수(GOOGLE_PLAY_SA_BASE64)로 만든 서버 열쇠. 키가 없으면 null. */
export function billingServerKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const sa = parseServiceAccount(env.GOOGLE_PLAY_SA_BASE64);
  return sa ? billingServerKeyOf(sa) : null;
}

/** DB 에 두는 지문 = sha256(열쇠) 16진수 — supabase-google-play.sql 의 billing_server_ok 와 같은 셈 */
export function billingKeyHash(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

const SCOPE = "https://www.googleapis.com/auth/androidpublisher";

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/** 구글 OAuth 에 내는 서명된 JWT(RS256). nowSec 은 시험이 고정한다. */
export function serviceAccountJwt(sa: ServiceAccount, nowSec: number): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({ iss: sa.clientEmail, scope: SCOPE, aud: sa.tokenUri, iat: nowSec, exp: nowSec + 3600 }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${b64url(signer.sign(sa.privateKey))}`;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

let cached: { token: string; until: number; email: string } | null = null;

/** 접근 토큰 — 서버 한 대 안에서 만료 5분 전까지 다시 쓴다. */
export async function googleAccessToken(sa: ServiceAccount, fetchImpl: FetchLike = fetch, now = Date.now()): Promise<string> {
  if (cached && cached.email === sa.clientEmail && cached.until > now + 300_000) return cached.token;
  const assertion = serviceAccountJwt(sa, Math.floor(now / 1000));
  const r = await fetchImpl(sa.tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!r.ok || !j.access_token) throw new GooglePlayError(`구글 인증 실패(${r.status} ${j.error ?? ""})`.trim(), r.status);
  cached = { token: j.access_token, until: now + (j.expires_in ?? 3600) * 1000, email: sa.clientEmail };
  return j.access_token;
}

export class GooglePlayError extends Error {
  // 매개변수 속성(readonly status)은 node --test 의 타입 벗기기가 못 읽어 칸을 따로 둔다
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "GooglePlayError";
    this.status = status;
  }
}

/* ─────────────────────────── API ─────────────────────────── */

const API = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";

export type GooglePlayClient = {
  packageName: string;
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
};

/** 환경변수로 만든 클라이언트 — 키가 없으면 null(부르는 쪽이 '결제 준비 전'으로 답한다). */
export function googlePlayClientFromEnv(env: NodeJS.ProcessEnv = process.env, fetchImpl: FetchLike = fetch): GooglePlayClient | null {
  const sa = parseServiceAccount(env.GOOGLE_PLAY_SA_BASE64);
  const packageName = (env.GOOGLE_PLAY_PACKAGE ?? "").trim();
  if (!sa || !/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(packageName)) return null;
  const call = async <T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> => {
    const token = await googleAccessToken(sa, fetchImpl);
    const r = await fetchImpl(`${API}/${encodeURIComponent(packageName)}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : method === "POST" ? "" : undefined,
    });
    const text = await r.text();
    if (!r.ok) {
      let msg = "";
      try {
        msg = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? "";
      } catch {
        /* 본문이 JSON 이 아니면 비워 둔다 */
      }
      throw new GooglePlayError(`구글 플레이 API ${r.status}${msg ? `: ${msg.slice(0, 200)}` : ""}`, r.status);
    }
    return (text ? JSON.parse(text) : {}) as T;
  };
  return { packageName, get: (p) => call("GET", p), post: (p, b) => call("POST", p, b) };
}

const enc = encodeURIComponent;

/** 구독 구매 상태(v2) */
export function getSubscriptionPurchase(c: GooglePlayClient, token: string) {
  return c.get<SubscriptionPurchaseV2>(`/purchases/subscriptionsv2/tokens/${enc(token)}`);
}
/** 구독 확정 — 3일 안에 안 하면 구글이 환불한다 */
export function acknowledgeSubscription(c: GooglePlayClient, productId: string, token: string) {
  return c.post<Record<string, never>>(`/purchases/subscriptions/${enc(productId)}/tokens/${enc(token)}:acknowledge`, {});
}
/** 단품 구매 상태 */
export function getProductPurchase(c: GooglePlayClient, productId: string, token: string) {
  return c.get<ProductPurchase>(`/purchases/products/${enc(productId)}/tokens/${enc(token)}`);
}
/** 단품 확정 */
export function acknowledgeProduct(c: GooglePlayClient, productId: string, token: string) {
  return c.post<Record<string, never>>(`/purchases/products/${enc(productId)}/tokens/${enc(token)}:acknowledge`, {});
}
/** 단품 소비 — 크레딧처럼 다시 살 수 있는 것은 지급 뒤 소비한다(소비하면 확정도 된다) */
export function consumeProduct(c: GooglePlayClient, productId: string, token: string) {
  return c.post<Record<string, never>>(`/purchases/products/${enc(productId)}/tokens/${enc(token)}:consume`);
}
/** 연결 점검용 — 등록된 구독 상품 목록(읽기만) */
export function listSubscriptionProducts(c: GooglePlayClient) {
  return c.get<{ subscriptions?: { productId: string; basePlans?: { basePlanId: string; state?: string }[] }[] }>(
    `/subscriptions`,
  );
}

/* ─────────────────────────── 응답 해석(순수) ─────────────────────────── */

export type SubscriptionPurchaseV2 = {
  subscriptionState?: string;
  acknowledgementState?: string;
  latestOrderId?: string;
  linkedPurchaseToken?: string;
  startTime?: string;
  testPurchase?: Record<string, unknown>;
  lineItems?: {
    productId?: string;
    expiryTime?: string;
    autoRenewingPlan?: {
      autoRenewEnabled?: boolean;
      /** 다음 결제 값 — units 는 문자열(원), nanos 는 10억분의 1 */
      recurringPrice?: { currencyCode?: string; units?: string; nanos?: number };
    };
    offerDetails?: { basePlanId?: string; offerId?: string };
  }[];
};

export type ProductPurchase = {
  purchaseState?: number; // 0 결제됨 · 1 취소 · 2 대기
  consumptionState?: number; // 0 아직 · 1 소비됨
  acknowledgementState?: number; // 0 아직 · 1 확정
  orderId?: string;
  purchaseTimeMillis?: string;
  purchaseType?: number; // 0 시험(라이선스 테스터)
  quantity?: number;
};

export type SubscriptionStatus = {
  productId: string | null;
  basePlanId: string | null;
  /** 지금 이용권을 줘도 되나 — 결제됨·유예 기간·해지 예약(기간 남음) */
  entitled: boolean;
  /**
   * 이번 기간 값이 정말 들어왔나 — 결제됨·해지 예약(기간 남음)만. 유예 기간(IN_GRACE)은 다음 결제가 아직 실패 중이라
   * 이용권은 이어 주되 새 달 몫·결제 기록은 결제가 확인될 때까지 미룬다(그때 latestOrderId 가 그 결제 주문이다).
   */
  paid: boolean;
  state: string;
  expiresAt: string | null;
  autoRenew: boolean;
  acknowledged: boolean;
  orderId: string | null;
  linkedPurchaseToken: string | null;
  test: boolean;
  /** 결제 값(원) — 구글이 알려 준 정기 결제 값. 원화가 아니거나 없으면 null */
  priceWon: number | null;
};

const ENTITLED_STATES = new Set(["SUBSCRIPTION_STATE_ACTIVE", "SUBSCRIPTION_STATE_IN_GRACE_PERIOD", "SUBSCRIPTION_STATE_CANCELED"]);
const PAID_STATES = new Set(["SUBSCRIPTION_STATE_ACTIVE", "SUBSCRIPTION_STATE_CANCELED"]);

function wonOf(p: { currencyCode?: string; units?: string; nanos?: number } | undefined): number | null {
  if (!p || p.currencyCode !== "KRW") return null;
  const n = Number(p.units ?? "0") + (p.nanos ?? 0) / 1e9;
  return Number.isFinite(n) && n >= 0 && n <= 10_000_000 ? Math.round(n) : null;
}

/** 구독 응답 → 우리가 쓰는 모양. CANCELED 는 '해지 예약'이라 만료 전까지 이용권을 준다. */
export function readSubscription(r: SubscriptionPurchaseV2, now = Date.now()): SubscriptionStatus {
  const item = (r.lineItems ?? [])[0] ?? {};
  const expiresAt = item.expiryTime ?? null;
  const notExpired = expiresAt ? Date.parse(expiresAt) > now : false;
  const state = r.subscriptionState ?? "SUBSCRIPTION_STATE_UNSPECIFIED";
  const entitled = ENTITLED_STATES.has(state) && notExpired;
  return {
    productId: item.productId ?? null,
    basePlanId: item.offerDetails?.basePlanId ?? null,
    entitled,
    paid: entitled && PAID_STATES.has(state),
    state,
    expiresAt,
    autoRenew: item.autoRenewingPlan?.autoRenewEnabled === true,
    acknowledged: r.acknowledgementState === "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
    orderId: r.latestOrderId ?? null,
    linkedPurchaseToken: r.linkedPurchaseToken ?? null,
    test: r.testPurchase !== undefined,
    priceWon: wonOf(item.autoRenewingPlan?.recurringPrice),
  };
}

/* ─────────────────────────── 이번 달 몫(넘어가지 않는다) ─────────────────────────── */

/** UTC 로 n 달 옮기기 — 그 날이 없는 달이면 그 달 마지막 날(1월 31일 + 1달 = 2월 28/29일) */
function addMonthsUtc(t: number, n: number): number {
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Date.UTC(y, m, Math.min(d.getUTCDate(), last), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds());
}

export type PassSlice = {
  /** DB 가 한 번만 주는 열쇠 — 주문번호#칸 */
  ref: string;
  /** 이 칸이 시작·끝나는 때(ISO) — 끝나면 남은 몫은 사라진다 */
  start: string;
  end: string;
  /** 결제한 기간 안에서 몇 번째 달인가(월간은 늘 0, 연간은 0~11) */
  index: number;
};

/**
 * 지금 쓰는 '이번 달 몫'의 기간 — 결제한 기간(만료에서 1달·12달 앞부터 만료까지)을 달마다 나눈 칸 가운데 지금 칸.
 * 월간은 한 칸(결제한 한 달 그대로), 연간은 12칸. 몫은 칸마다 새로 채우고(남은 것은 넘어가지 않는다) 칸이 끝나면 사라진다.
 * 같은 주문·같은 칸이면 같은 ref — 동기화를 몇 번 해도 DB 가 한 번만 준다. 자동 갱신마다 주문번호가 바뀐다(GPA.…..0, ..1).
 * 만료가 지났으면 null.
 */
export function passSlice(o: {
  plan: "monthly" | "yearly";
  expiresAt: string;
  orderId: string | null;
  token: string;
  now: number;
}): PassSlice | null {
  const end = Date.parse(o.expiresAt);
  if (!Number.isFinite(end) || end <= o.now) return null;
  const months = o.plan === "yearly" ? 12 : 1;
  const paidStart = addMonthsUtc(end, -months);
  let k = 0;
  while (k < months - 1 && addMonthsUtc(paidStart, k + 1) <= o.now) k++;
  const start = addMonthsUtc(paidStart, k);
  const sliceEnd = Math.min(addMonthsUtc(paidStart, k + 1), end);
  // 주문번호가 없으면(드묾) 토큰 지문 + 만료로 대신한다 — 토큰 자체는 기록 열쇠에 넣지 않는다
  const order = o.orderId ?? `tok-${createHash("sha256").update(o.token).digest("hex").slice(0, 16)}-${end}`;
  return { ref: `${order}#${k}`, start: new Date(start).toISOString(), end: new Date(sliceEnd).toISOString(), index: k };
}

export type ProductStatus = {
  paid: boolean;
  pending: boolean;
  consumed: boolean;
  acknowledged: boolean;
  orderId: string | null;
  test: boolean;
};

export function readProduct(r: ProductPurchase): ProductStatus {
  return {
    paid: r.purchaseState === 0,
    pending: r.purchaseState === 2,
    consumed: r.consumptionState === 1,
    acknowledged: r.acknowledgementState === 1,
    orderId: r.orderId ?? null,
    test: r.purchaseType === 0,
  };
}
