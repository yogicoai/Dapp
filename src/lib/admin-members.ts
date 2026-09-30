/**
 * 관리자 페이지 '회원'(/admin/members) 판단 로직 — 목록 거르기·정렬, 목소리 배지, 토큰 장부 이름표.
 *
 * 왜 따로 두나: 설정 화면 '관리실'에 있던 회원 목록(목소리 배지·책 목록·토큰)을 여기로 옮기면서
 * 같은 규칙(준비된 목소리만 '등록'으로 본다 · 관리자 계정은 목록에 없다)을 서버 경로와 화면이 함께 쓴다.
 * 틀리면 사장님이 엉뚱한 회원을 찾거나, 되돌린 토큰을 또 되돌리려 한다 — 그래서 admin-members.test.ts 로 시험한다.
 *
 * '토큰'과 '실제 결제(원)'를 섞지 않는다: 이 화면의 장부·충전·환불은 전부 토큰이다.
 * 실제 결제는 결제·구독 화면(api/admin/billing)이 주는 줄을 '실제 결제' 탭에 그대로 보여 줄 뿐이다.
 * 상대 경로·type 가져오기만 쓴다 — 테스트 러너(node --test)가 @/ 별칭을 못 읽는다.
 */
import { refundLabel } from "./admin.ts";
import { kstDaysAgoStart, withParams } from "./admin-console.ts";
import { isPlanId, PLANS } from "./plans.ts";

/* ── 부모 목소리 ───────────────────────────────────────────────────────── */

export type VoiceRole = "mom" | "dad";
export const VOICE_ROLES: readonly VoiceRole[] = ["mom", "dad"];
export const VOICE_LABEL: Record<VoiceRole, string> = { mom: "엄마", dad: "아빠" };

/**
 * 준비된(ready) 목소리 역할만 — 엄마·아빠 순서, 겹치지 않게.
 * 지운 목소리(status 가 ready 가 아님)는 '등록 안 됨'으로 본다(설정 화면 관리실과 같은 규칙).
 */
export function readyVoiceRoles(rows: readonly { role: string | null; status: string | null }[]): VoiceRole[] {
  const have = new Set<string>();
  for (const r of rows) if (r.status === "ready" && r.role) have.add(r.role);
  return VOICE_ROLES.filter((v) => have.has(v));
}

/** 회원 id → 준비된 목소리. 목록 경로가 voice_clones 를 한 번만 읽어 회원마다 나눈다. */
export function groupReadyVoices(
  rows: readonly { owner: string | null; role: string | null; status: string | null }[],
): Map<string, VoiceRole[]> {
  const byOwner = new Map<string, { role: string | null; status: string | null }[]>();
  for (const r of rows) {
    if (!r.owner) continue;
    const list = byOwner.get(r.owner) ?? [];
    list.push(r);
    byOwner.set(r.owner, list);
  }
  const out = new Map<string, VoiceRole[]>();
  for (const [owner, list] of byOwner) {
    const ready = readyVoiceRoles(list);
    if (ready.length) out.set(owner, ready);
  }
  return out;
}

/** 목록 '목소리' 칸 — 엄마·아빠 둘 다 늘 보이고, 등록 안 된 쪽은 흐리게(on=false). */
export function voiceBadges(voices: readonly string[]): { role: VoiceRole; label: string; on: boolean }[] {
  return VOICE_ROLES.map((role) => ({ role, label: VOICE_LABEL[role], on: voices.includes(role) }));
}

/** '엄마 · 아빠' / '엄마' / '없음' — 숫자 카드·화면 읽기 프로그램용 한 줄. */
export function voiceSummary(voices: readonly string[]): string {
  const on = voiceBadges(voices).filter((b) => b.on);
  return on.length ? on.map((b) => b.label).join(" · ") : "없음";
}

/* ── 회원 목록 ─────────────────────────────────────────────────────────── */

/** GET /api/admin/customers 한 줄. 관리자 계정은 목록에 오지 않는다(서버가 뺀다). */
export type MemberListRow = {
  id: string;
  username: string;
  tokens: number;
  createdAt: string | null;
  books: number;
  /** 아직 처리 안 한 의견 수 — 있으면 목록에서 눈에 띄게 한다. */
  openFeedback: number;
  /** 준비된 부모 목소리(엄마·아빠 순서). */
  voices: VoiceRole[];
};

export type MembersListResponse = {
  customers: MemberListRow[];
  /** 전체 회원 수(관리자 계정 빼고). 못 세면 목록 길이. */
  total: number;
  /** 최근 가입 순으로 상한까지만 왔다. */
  truncated: boolean;
  /** 책 수·의견 수·목소리 중 못 읽은 것 — 그 칸은 0 으로 보일 수 있다고 알린다. */
  partial: ("books" | "feedback" | "voices")[];
  me: string;
};

export type MemberPeriod = "all" | "7d" | "30d";
export type MemberSort = "new" | "books" | "tokens";
export type MemberFilter = { q: string; period: MemberPeriod; sort: MemberSort; fbOnly: boolean };

export const MEMBER_PERIODS: readonly { value: MemberPeriod; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "7d", label: "7일" },
  { value: "30d", label: "30일" },
];
export const MEMBER_SORTS: readonly { value: MemberSort; label: string }[] = [
  { value: "new", label: "최근 가입" },
  { value: "books", label: "책 많은 순" },
  { value: "tokens", label: "토큰 많은 순" },
];
export const DEFAULT_MEMBER_FILTER: MemberFilter = { q: "", period: "all", sort: "new", fbOnly: false };

/** 주소(?q=&period=&sort=&fb=1) → 거르기. 모르는 값은 기본값(주소를 손으로 고쳐도 화면이 깨지지 않게). */
export function parseMemberFilter(sp: URLSearchParams): MemberFilter {
  const period = sp.get("period");
  const sort = sp.get("sort");
  return {
    q: (sp.get("q") ?? "").trim().slice(0, 40),
    period: MEMBER_PERIODS.some((p) => p.value === period) ? (period as MemberPeriod) : "all",
    sort: MEMBER_SORTS.some((s) => s.value === sort) ? (sort as MemberSort) : "new",
    fbOnly: sp.get("fb") === "1",
  };
}

/** 거르기 → 주소 칸(기본값은 빼서 링크가 짧게). withParams 에 그대로 넘긴다. */
export function memberFilterParams(f: Partial<MemberFilter>): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  if ("q" in f) out.q = f.q?.trim() ? f.q.trim() : null;
  if ("period" in f) out.period = f.period && f.period !== "all" ? f.period : null;
  if ("sort" in f) out.sort = f.sort && f.sort !== "new" ? f.sort : null;
  if ("fbOnly" in f) out.fb = f.fbOnly ? "1" : null;
  return out;
}

/**
 * 회원 화면의 [회원 목록] 단추가 돌아갈 주소 — 목록에서 거른 그대로(검색·기간·정렬·남은 의견만).
 * 적어 둔 값은 브라우저에 있던 것이라 믿지 않고 한 번 걸러서(parse → 다시 쓰기) 거르기 칸만 남긴다.
 */
export function membersListHref(savedSearch: string | null | undefined): string {
  if (typeof savedSearch !== "string" || savedSearch.length > 300) return "/admin/members";
  const f = parseMemberFilter(new URLSearchParams(savedSearch.startsWith("?") ? savedSearch.slice(1) : savedSearch));
  return `/admin/members${withParams("", memberFilterParams(f))}`;
}

export function isDefaultMemberFilter(f: MemberFilter): boolean {
  return !f.q && f.period === "all" && f.sort === "new" && !f.fbOnly;
}

const time = (iso: string | null | undefined) => {
  const t = Date.parse(String(iso ?? ""));
  return Number.isFinite(t) ? t : -Infinity;
};

/**
 * 목록 거르기·정렬(화면에서, 최대 300줄).
 *  · q: 아이디에 들어 있으면(대소문자 무시)
 *  · period: 한국 날짜로 오늘 포함 7일·30일 안에 가입(가입일 모르는 줄은 뺀다)
 *  · sort: 최근 가입 / 책 많은 순 / 토큰 많은 순 — 같으면 최근 가입이 먼저
 *  · fbOnly: 남은 의견이 있는 회원만
 */
export function filterMembers<R extends Pick<MemberListRow, "username" | "createdAt" | "books" | "tokens" | "openFeedback">>(
  rows: readonly R[],
  f: MemberFilter,
  now: Date | number,
): R[] {
  const q = f.q.trim().toLowerCase();
  const since = f.period === "all" ? null : kstDaysAgoStart(f.period === "7d" ? 6 : 29, now).getTime();
  const kept = rows.filter((r) => {
    if (q && !r.username.toLowerCase().includes(q)) return false;
    if (since !== null && !(time(r.createdAt) >= since)) return false;
    if (f.fbOnly && !(r.openFeedback > 0)) return false;
    return true;
  });
  const byNew = (a: R, b: R) => time(b.createdAt) - time(a.createdAt) || a.username.localeCompare(b.username);
  const cmp =
    f.sort === "books"
      ? (a: R, b: R) => b.books - a.books || byNew(a, b)
      : f.sort === "tokens"
        ? (a: R, b: R) => b.tokens - a.tokens || byNew(a, b)
        : byNew;
  return [...kept].sort(cmp);
}

/* ── 회원 한 명: 책 · 목소리 · 토큰 장부 · 충전 기록 ───────────────────── */

export type MemberBook = { id: string; title: string | null; hidden: boolean; createdAt: string | null };

export type LedgerLine = {
  id: string;
  amount: number;
  reason: string;
  createdAt: string;
  refundedAt: string | null;
  refundNote: string | null;
  /** 되돌린 관리자 아이디. refundKnown 인데 비었으면 앱이 실패 직후 스스로 되돌린 것이다. */
  refundedBy: string | null;
  /** 처리자·사유를 알 수 있었나(장부 표로는 못 읽고 DB 함수로만 읽힌다 — 못 읽으면 단정하지 않는다). */
  refundKnown: boolean;
};

export type GrantLine = {
  id: string;
  amount: number;
  reason: string | null;
  grantedBy: string | null;
  tokensAfter: number | null;
  createdAt: string;
};

export type MemberExtrasPart = "books" | "voices" | "ledger" | "grants";

/** GET /api/admin/member?id= — 회원 상세의 탭들(책·목소리·장부·충전). 한 부분을 못 읽으면 failed 에 적는다. */
export type MemberExtras = {
  books: MemberBook[];
  voices: { role: string; status: string }[];
  readyVoices: VoiceRole[];
  ledger: LedgerLine[];
  grants: GrantLine[];
  truncated: { books: boolean; ledger: boolean; grants: boolean };
  failed: MemberExtrasPart[];
};

/** 장부 이유 → 사람 말. 모르는 이유는 그대로 보여 준다(새 기능이 생겨도 빈칸이 되지 않게). */
export const LEDGER_REASON_LABEL: Record<string, string> = {
  story: "대본",
  illustration: "그림",
  "parent-voice": "부모 목소리",
  "family-portrait": "가족 캐릭터",
};

export function ledgerReasonLabel(reason: string | null | undefined): string {
  const r = String(reason ?? "").trim();
  if (!r) return "기타";
  return Object.prototype.hasOwnProperty.call(LEDGER_REASON_LABEL, r) ? LEDGER_REASON_LABEL[r] : r;
}

/** master_ledger_entries 가 주는 되돌림 정보 한 줄. */
export type LedgerRefundInfo = { refunded_by: string | null; refunded_by_username: string | null; refund_note: string | null };

/**
 * 장부 표 줄 + 되돌림 정보 → 화면 줄.
 * info 가 null 이면 DB 함수를 못 불렀다(옛 DB) — 되돌린 줄의 처리자는 '확인 불가'로 둔다.
 * 되돌린 관리자 id 는 있는데 아이디를 못 읽으면(그 프로필이 안 보임) 역시 '확인 불가' —
 * 처리자가 비었다고 '앱이 되돌림'으로 단정하지 않는다.
 */
export function toLedgerLines(
  rows: readonly { id: string; amount: number | null; reason: string | null; refunded_at: string | null; created_at: string }[],
  info: ReadonlyMap<string, LedgerRefundInfo> | null,
): LedgerLine[] {
  return rows.map((r) => {
    const i = info?.get(r.id) ?? null;
    const refunded = !!r.refunded_at;
    const byUnreadable = !!i && !!i.refunded_by && !i.refunded_by_username;
    return {
      id: r.id,
      amount: typeof r.amount === "number" && Number.isFinite(r.amount) ? r.amount : 0,
      reason: String(r.reason ?? ""),
      createdAt: r.created_at,
      refundedAt: r.refunded_at,
      refundNote: refunded ? (i?.refund_note ?? null) : null,
      refundedBy: refunded ? (i?.refunded_by_username ?? null) : null,
      refundKnown: !refunded || (!!i && !byUnreadable),
    };
  });
}

/**
 * 장부 줄 '상태' 한 마디 — "환불 안 됨" / "환불함 · yogico · 사유" / "환불함 · 앱이 되돌림".
 * 처리자를 DB 에서 못 읽었으면 방금 이 창에서 한 환불(recent)로 채운다(옛 관리실 withRecentRefund 와 같다).
 */
export function ledgerStatusText(
  l: Pick<LedgerLine, "id" | "refundedAt" | "refundedBy" | "refundNote" | "refundKnown">,
  recent?: ReadonlyMap<string, { by: string; note: string }>,
): string {
  let by = l.refundedBy;
  let note = l.refundNote;
  let known = l.refundKnown;
  const r = l.refundedAt && !known ? recent?.get(l.id) : undefined;
  if (r) {
    by = r.by;
    note = r.note;
    known = true;
  }
  const head = refundLabel({ refundedAt: l.refundedAt, refundedBy: by, byKnown: known });
  return l.refundedAt && note ? `${head} · ${note}` : head;
}

/** 이 장부 줄을 토큰 환불할 수 있나 — 아직 안 되돌렸고 금액이 있을 때만. DB 도 같은 건은 한 번만 받는다. */
export function canRefundLedger(l: Pick<LedgerLine, "refundedAt" | "amount">): boolean {
  return !l.refundedAt && l.amount > 0;
}

/** 충전 토큰 '+30' / '-5' (빼기도 기록에 있을 수 있다 — 옛 DB 함수는 음수도 받았다). */
export function signedTokens(n: number): string {
  if (!Number.isFinite(n)) return "–";
  return n > 0 ? `+${n}` : String(n);
}

/* ── 실제 결제(원) 탭 ───────────────────────────────────────────────────── */

/**
 * 결제·구독 화면의 결제 목록(GET /api/admin/billing/payments?owner=)이 주는 줄 중 회원 화면이 쓰는 칸.
 * 전체 모양은 lib/admin-billing.ts(PgPayment)가 정본이다 — 거기 칸이 늘어도 여기는 이만큼만 읽는다.
 */
export type MemberPaymentRow = {
  id: string;
  orderId: string;
  product: string;
  orderName: string | null;
  amount: number;
  status: string;
  refundedAmount: number;
  requestedAt: string;
  createdAt: string;
};
export type MemberPaymentsResponse = { schemaReady: boolean; rows: MemberPaymentRow[]; total: number; truncated: boolean };

export type SimpleTone = "gray" | "blue" | "green" | "amber" | "red";

/**
 * 결제 상태 이름·색 — 설계 §5 표 그대로(결제·구독 화면의 paymentStatusMeta 와 같아야 한다;
 * admin-members.test 가 그 파일이 있으면 둘을 맞춰 본다). 모르는 상태는 글자 그대로 회색.
 */
export const PAYMENT_STATUS_BRIEF: Record<string, { label: string; tone: SimpleTone }> = {
  pending: { label: "결제 대기", tone: "blue" },
  paid: { label: "결제 완료", tone: "green" },
  failed: { label: "결제 실패", tone: "red" },
  cancelled: { label: "결제 전 취소", tone: "gray" },
  refunded: { label: "전액 환불", tone: "amber" },
  partial_refunded: { label: "부분 환불", tone: "amber" },
};

export function paymentStatusBrief(s: string): { label: string; tone: SimpleTone } {
  return Object.prototype.hasOwnProperty.call(PAYMENT_STATUS_BRIEF, s) ? PAYMENT_STATUS_BRIEF[s] : { label: s, tone: "gray" };
}

/** 요금제 코드 → 이름(요금제 목록 plans.ts). 모르는 코드는 그대로. */
export function productLabel(code: string): string {
  return isPlanId(code) ? PLANS[code].name : code;
}

/**
 * 실제 결제 탭이 무엇을 보여 줄까.
 *  · 결제 경로가 아직 없음(404) · 표가 아직 없음(schemaReady:false) · 0줄 → 'none'(결제 연동 전이에요)
 *  · 줄이 있음 → 'rows' · 그 밖의 실패 → 'error'
 */
export function memberPaymentsView(
  status: number | null,
  data: MemberPaymentsResponse | null,
): "loading" | "none" | "rows" | "error" {
  if (data && Array.isArray(data.rows)) {
    if (data.schemaReady === false || data.rows.length === 0) return "none";
    return "rows";
  }
  if (status === null) return "loading";
  if (status === 404) return "none";
  return "error";
}
