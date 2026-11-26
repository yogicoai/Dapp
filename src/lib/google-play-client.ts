/**
 * 안드로이드 앱(TWA) 안에서 구글 플레이로 사기 — 화면 쪽(2026-11-26 구글 결제 1단계).
 *
 * 앱(1.1.0 부터, Bubblewrap playBilling)이 크롬에 구글 결제 다리를 열어 준다:
 *  · Digital Goods API(getDigitalGoodsService) — 상품이 있나·내 구매 목록(listPurchases)
 *  · Payment Request(supportedMethods = https://play.google.com/billing, data.sku = 상품 ID) — 구글 결제 창
 * 결제가 끝나면 받은 구매 토큰을 곧바로 서버(api/billing/google/verify)에 보낸다 — 서버가 구글에 확인하고 이용권을 준다.
 * 화면은 토큰을 어디에도 저장하지 않는다. 옛 앱(1.0.0)·웹 브라우저에는 다리가 없어 '곧 열려요'로 남는다.
 *
 * 서버 파일(lib/google-play — 서명·열쇠)은 가져오지 않는다 — 상품 표는 lib/google-play-products 에서.
 */
import { SELLING_NOW } from "./google-play-products";
import { activePlanKey, isMemberPlanKey, type MemberPlanKey } from "./member-plan";
import { authedFetch, currentUid } from "./supabase";

export const PLAY_BILLING_METHOD = "https://play.google.com/billing";

type ItemDetails = { itemId: string };
type PurchaseDetails = { itemId: string; purchaseToken: string };
type DigitalGoodsService = {
  getDetails(itemIds: string[]): Promise<ItemDetails[]>;
  listPurchases(): Promise<PurchaseDetails[]>;
};

/** 구글 결제 다리 — 앱 밖이거나 옛 앱이면 null */
async function playService(): Promise<DigitalGoodsService | null> {
  if (typeof window === "undefined" || typeof window.PaymentRequest === "undefined") return null;
  const w = window as unknown as { getDigitalGoodsService?: (method: string) => Promise<DigitalGoodsService> };
  if (typeof w.getDigitalGoodsService !== "function") return null;
  try {
    return await w.getDigitalGoodsService(PLAY_BILLING_METHOD);
  } catch {
    return null;
  }
}

export type PlayActive = { productId: string; expiresAt: string; autoRenew: boolean; canceled: boolean };

export type PlayStatus =
  /** 결제 다리가 없거나(웹·옛 앱) 상품을 못 찾았거나 서버가 결제 준비 전 */
  | { kind: "unavailable" }
  /** 살 수 있지만 로그인부터 */
  | { kind: "login" }
  | {
      kind: "ready";
      /** 플레이에서 찾은 상품 ID */
      items: readonly string[];
      plan: MemberPlanKey | null;
      endsAt: string | null;
      active: PlayActive | null;
      starterOwned: boolean;
      packageName: string;
    };

const UNAVAILABLE: PlayStatus = { kind: "unavailable" };
const JSON_HEADERS = { "content-type": "application/json" };

type SyncBody = {
  ready?: boolean;
  plan?: unknown;
  endsAt?: unknown;
  active?: PlayActive | null;
  starterOwned?: boolean;
  packageName?: unknown;
};

async function readStatus(): Promise<PlayStatus> {
  const svc = await playService();
  if (!svc) return UNAVAILABLE;
  let items: string[] = [];
  try {
    items = (await svc.getDetails([...SELLING_NOW])).map((d) => d.itemId).filter((id) => SELLING_NOW.includes(id));
  } catch {
    return UNAVAILABLE;
  }
  if (items.length === 0) return UNAVAILABLE;
  if (!(await currentUid())) return { kind: "login" };

  // 플레이가 아는 내 구매를 함께 보낸다 — 다른 기기에서 샀거나 확인이 끊긴 결제를 이 계정에 이어 붙인다
  let purchases: PurchaseDetails[] = [];
  try {
    purchases = await svc.listPurchases();
  } catch {
    /* 목록을 못 읽어도 서버에 적힌 것으로 맞춘다 */
  }
  const r = await authedFetch("/api/billing/google/sync", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ purchases: purchases.map((p) => ({ productId: p.itemId, purchaseToken: p.purchaseToken })) }),
  });
  const j = (await r.json().catch(() => null)) as SyncBody | null;
  if (!r.ok || !j?.ready) return UNAVAILABLE;
  const plan = isMemberPlanKey(j.plan) ? activePlanKey({ plan: j.plan, endsAt: typeof j.endsAt === "string" ? j.endsAt : null }, Date.now()) : null;
  return {
    kind: "ready",
    items,
    plan,
    endsAt: typeof j.endsAt === "string" ? j.endsAt : null,
    active: j.active ?? null,
    starterOwned: j.starterOwned === true,
    packageName: typeof j.packageName === "string" ? j.packageName : "",
  };
}

let loading: { at: number; status: Promise<PlayStatus> } | null = null;
/** 같은 화면의 단추들이 나눠 쓰는 시간 — 화면을 옮겼다 돌아오면(1분 뒤) 새로 읽는다 */
const STATUS_TTL_MS = 60_000;

/** 요금제 화면의 단추들이 같이 쓴다 — 1분 안에는 한 번만 읽는다(force 면 새로) */
export function loadPlayStatus(force = false): Promise<PlayStatus> {
  const now = Date.now();
  if (!loading || force || now - loading.at > STATUS_TTL_MS) {
    loading = { at: now, status: readStatus().catch(() => UNAVAILABLE) };
  }
  return loading.status;
}

export type BuyResult =
  | { ok: true; plan: string | null; endsAt: string | null }
  | { ok: false; cancelled: boolean; message: string };

/**
 * 구글 결제 창을 띄우고, 끝나면 서버에 확인을 맡긴다. **누른 그 자리에서 바로 부른다** — 결제 창은 사용자가 누른 직후에만 뜬다
 * (그래서 여기서는 창을 띄우기 전에 아무것도 기다리지 않는다).
 */
export async function buyOnPlay(productId: string): Promise<BuyResult> {
  if (typeof window === "undefined" || typeof window.PaymentRequest === "undefined") {
    return { ok: false, cancelled: false, message: "이 앱에서는 결제 창을 열 수 없어요. 앱을 최신 버전으로 업데이트해 주세요." };
  }
  let response: PaymentResponse;
  try {
    const request = new PaymentRequest([{ supportedMethods: PLAY_BILLING_METHOD, data: { sku: productId } }], {
      total: { label: "합계", amount: { currency: "KRW", value: "0" } },
    });
    response = await request.show();
  } catch (e) {
    if ((e as { name?: string } | null)?.name === "AbortError") return { ok: false, cancelled: true, message: "" };
    return {
      ok: false,
      cancelled: false,
      message: "결제 창을 열지 못했어요. 이미 산 상품이면 이 화면을 닫았다가 다시 열어 주세요.",
    };
  }

  const token = (response.details as { purchaseToken?: unknown } | null)?.purchaseToken;
  if (typeof token !== "string" || !token) {
    await response.complete("fail").catch(() => {});
    return { ok: false, cancelled: false, message: "결제 정보를 받지 못했어요. 잠시 뒤 이 화면을 다시 열어 주세요." };
  }

  let body: { ok?: boolean; plan?: string | null; endsAt?: string | null; error?: string } | null = null;
  let ok = false;
  try {
    const r = await authedFetch("/api/billing/google/verify", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ productId, purchaseToken: token }),
    });
    body = await r.json().catch(() => null);
    ok = r.ok && body?.ok === true;
  } catch {
    /* 네트워크 — 아래 안내. 결제는 구글에 남아 있어 다음에 이 화면을 열 때 이어 붙는다 */
  }
  await response.complete(ok ? "success" : "fail").catch(() => {});
  void loadPlayStatus(true);
  if (ok) return { ok: true, plan: body?.plan ?? null, endsAt: body?.endsAt ?? null };
  return {
    ok: false,
    cancelled: false,
    message: body?.error ?? "결제는 됐지만 확인이 늦어지고 있어요. 잠시 뒤 이 화면을 다시 열어 주세요.",
  };
}

const SYNC_KEY = "voice-storybook:play-sync";
/** 앱을 켜 둔 채 다음 결제일을 넘겨도 맞추도록 — 화면을 옮길 때, 마지막으로 맞춘 지 이만큼 지났으면 다시 */
export const SYNC_EVERY_MS = 10 * 60_000;
let lastSync: { uid: string; at: number } | null = null;

/** sessionStorage 의 "회원id|시각" — 새로 고쳐도 10분 안에는 다시 부르지 않게 */
function storedSync(): { uid: string; at: number } | null {
  try {
    const [uid, at] = (window.sessionStorage.getItem(SYNC_KEY) ?? "").split("|");
    return uid && Number.isFinite(Number(at)) ? { uid, at: Number(at) } : null;
  } catch {
    return null;
  }
}

/**
 * 이 회원의 구글 결제를 서버가 다시 맞춘다(다음 달 결제·해지·환불, 연간 패스의 새 달 몫) — 앱을 연 뒤 첫 화면,
 * 그 뒤로는 화면을 옮길 때 10분에 한 번. 로그인 전이면 아무것도 안 한다(로그인한 뒤 화면을 옮기면 그때 한다).
 */
export async function syncPlaySoon(now = Date.now()): Promise<void> {
  const uid = await currentUid();
  if (!uid) return;
  const prev = lastSync?.uid === uid ? lastSync : storedSync();
  if (prev && prev.uid === uid && now - prev.at < SYNC_EVERY_MS) return;
  lastSync = { uid, at: now };
  try {
    window.sessionStorage.setItem(SYNC_KEY, `${uid}|${now}`);
  } catch {
    /* 저장소가 막힌 브라우저 — 이 창 안에서만 기억한다(위 lastSync) */
  }
  await authedFetch("/api/billing/google/sync", { method: "POST", headers: JSON_HEADERS, body: "{}" }).catch(() => {});
}
