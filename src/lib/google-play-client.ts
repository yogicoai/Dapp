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
import { PLAN_REFRESH_EVENT, markPlayBuyer, registerPlaySync } from "./billing-sync-gate";
import { SELLING_NOW } from "./google-play-products";
import { activePlanKey, isMemberPlanKey, type MemberPlanKey } from "./member-plan";
import { forgetMyPlanKey } from "./member-plan-client";
import { authedFetch, currentUid } from "./supabase";

export const PLAY_BILLING_METHOD = "https://play.google.com/billing";

type ItemDetails = { itemId: string };
type PurchaseDetails = { itemId: string; purchaseToken: string };
type DigitalGoodsService = {
  getDetails(itemIds: string[]): Promise<ItemDetails[]>;
  listPurchases(): Promise<PurchaseDetails[]>;
};

/** 오류에서 짧은 까닭만(이름·글 앞부분) — 확인 코드로 보인다. 구매 토큰 같은 값은 여기 오지 않는다 */
function why(e: unknown): string {
  const x = e as { name?: unknown; message?: unknown } | null;
  const name = typeof x?.name === "string" ? x.name : "Error";
  const msg = typeof x?.message === "string" ? x.message.replace(/\s+/g, " ").slice(0, 80) : "";
  return msg ? `${name}: ${msg}` : name;
}

/** 구글 결제 다리 — 앱 밖이거나 옛 앱이면 왜 없는지(확인 코드) */
async function playService(): Promise<DigitalGoodsService | string> {
  if (typeof window === "undefined" || typeof window.PaymentRequest === "undefined") return "no-payment-request";
  const w = window as unknown as { getDigitalGoodsService?: (method: string) => Promise<DigitalGoodsService> };
  if (typeof w.getDigitalGoodsService !== "function") return "no-digital-goods";
  try {
    return await w.getDigitalGoodsService(PLAY_BILLING_METHOD);
  } catch (e) {
    return `no-service (${why(e)})`;
  }
}

export type PlayActive = { productId: string; expiresAt: string; autoRenew: boolean; canceled: boolean };

export type PlayStatus =
  /**
   * 결제 다리가 없거나(웹·옛 앱) 상품을 못 찾았거나 서버가 결제 준비 전.
   * reason 은 확인 코드 — 앱 화면 '곧 열려요' 아래에 작게 보인다(무엇이 막았는지 사장님이 캡처로 알려 주게, 2026-11-26).
   */
  | { kind: "unavailable"; reason: string }
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

const unavailable = (reason: string): PlayStatus => ({ kind: "unavailable", reason });
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
  if (typeof svc === "string") return unavailable(svc);
  let items: string[] = [];
  try {
    items = (await svc.getDetails([...SELLING_NOW])).map((d) => d.itemId).filter((id) => SELLING_NOW.includes(id));
  } catch (e) {
    return unavailable(`details (${why(e)})`);
  }
  if (items.length === 0) return unavailable("no-items");
  if (!(await currentUid())) return { kind: "login" };

  // 플레이가 아는 내 구매를 함께 보낸다 — 다른 기기에서 샀거나 확인이 끊긴 결제를 이 계정에 이어 붙인다
  let purchases: PurchaseDetails[] = [];
  try {
    purchases = await svc.listPurchases();
  } catch {
    /* 목록을 못 읽어도 서버에 적힌 것으로 맞춘다 */
  }
  let r: Response;
  try {
    r = await authedFetch("/api/billing/google/sync", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ purchases: purchases.map((p) => ({ productId: p.itemId, purchaseToken: p.purchaseToken })) }),
    });
  } catch (e) {
    return unavailable(`network (${why(e)})`);
  }
  const j = (await r.json().catch(() => null)) as SyncBody | null;
  if (!r.ok) return unavailable(`server-${r.status}`);
  if (!j?.ready) return unavailable("server-not-ready");
  const uid = await currentUid();
  if (uid) afterSync(uid, Date.now(), j);
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
    loading = { at: now, status: readStatus().catch((e: unknown) => unavailable(`error (${why(e)})`)) };
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
  if (ok) {
    // 이 기기의 '구글로 산 회원' 표시 · 요금제 캐시 비우기 — 책장·만들기가 새로 읽을 때 방금 산 요금제로 그린다
    const uid = await currentUid();
    if (uid) markPlayBuyer(uid);
    forgetMyPlanKey();
  }
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

/** 마지막 동기화 — 회원 · 시각 · 그때 알려진 구독 만료(그 시각이 지나면 10분을 기다리지 않고 바로 다시 — 갱신을 받아 오게) */
type LastSync = { uid: string; at: number; until: number | null };
let lastSync: LastSync | null = null;
let inflight: Promise<void> | null = null;

/** sessionStorage 의 "회원id|시각|만료" — 새로 고쳐도 10분 안에는 다시 부르지 않게 */
function storedSync(): LastSync | null {
  try {
    const [uid, at, until] = (window.sessionStorage.getItem(SYNC_KEY) ?? "").split("|");
    const a = Number(at);
    const u = until ? Number(until) : NaN;
    return uid && Number.isFinite(a) ? { uid, at: a, until: Number.isFinite(u) ? u : null } : null;
  } catch {
    return null;
  }
}

function rememberSync(s: LastSync): void {
  lastSync = s;
  try {
    window.sessionStorage.setItem(SYNC_KEY, `${s.uid}|${s.at}|${s.until ?? ""}`);
  } catch {
    /* 저장소가 막힌 브라우저 — 이 창 안에서만 기억한다(위 lastSync) */
  }
}

/** 동기화 답을 받은 뒤 — 다음 만료 기억 · 이 기기의 '구글로 산 회원' 표시 · 요금제 캐시 비우기(다음에 읽을 때 새로) */
function afterSync(uid: string, now: number, j: SyncBody | null): void {
  const until = j?.active?.expiresAt ? Date.parse(j.active.expiresAt) : NaN;
  rememberSync({ uid, at: now, until: Number.isFinite(until) ? until : null });
  if (j?.active || j?.starterOwned) markPlayBuyer(uid);
  forgetMyPlanKey();
  // 이미 그려진 책장이 요금제를 새로 읽게 알린다(홈 — app/page.tsx)
  try {
    window.dispatchEvent(new Event(PLAN_REFRESH_EVENT));
  } catch {
    /* 알림을 못 보내도 다음에 화면에 들어올 때 새로 읽는다 */
  }
}

/**
 * 이 회원의 구글 결제를 서버가 다시 맞춘다(다음 달 결제·해지·환불, 연간 패스의 새 달 몫) — 앱을 연 뒤 첫 화면,
 * 그 뒤로는 화면을 옮길 때 10분에 한 번, 알던 만료가 지났으면 바로. 로그인 전이면 아무것도 안 한다.
 * 이미 도는 중이면 그 동기화를 같이 기다린다(책장·만들기 화면이 lib/billing-sync-gate 로 끝나기를 기다린다).
 */
export function syncPlaySoon(now = Date.now()): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    const uid = await currentUid();
    if (!uid) return;
    const prev = lastSync?.uid === uid ? lastSync : storedSync();
    const known = prev && prev.uid === uid ? prev : null;
    if (known && now - known.at < SYNC_EVERY_MS && (known.until === null || now < known.until)) return;
    // 먼저 적어 둔다 — 실패해도 화면을 옮길 때마다 다시 부르지 않게
    rememberSync({ uid, at: now, until: known?.until ?? null });
    let j: SyncBody | null = null;
    try {
      const r = await authedFetch("/api/billing/google/sync", { method: "POST", headers: JSON_HEADERS, body: "{}" });
      j = (await r.json().catch(() => null)) as SyncBody | null;
      if (!r.ok || !j?.ready) return;
    } catch {
      return;
    }
    afterSync(uid, now, j);
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

// 책장·만들기 화면이 읽기 전에 기다릴 수 있게 등록한다(lib/billing-sync-gate)
registerPlaySync(() => syncPlaySoon());
