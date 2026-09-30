/**
 * 관리자 대시보드(/admin) 숫자 세기 — 서버 경로(api/admin/dashboard)가 읽은 줄을 받아 한곳에서 센다.
 *
 * 왜 순수 함수로 따로 두나: 대시보드 숫자는 사장님이 "오늘 장사가 어땠나"를 보는 첫 화면이다.
 *  · 한국 날짜로 끊어야 한다(서버는 UTC — 밤 12시~오전 9시 가입이 전날로 세지면 안 된다).
 *  · 관리자 계정에서 생긴 책·장부·사고·의견은 빼야 한다(사장님 2026-09-30 "fe 마스터니깐 … 안남아도 되").
 *  · 못 읽은 숫자를 0 으로 보이면 "오늘 아무도 안 왔다"로 오해한다 — null 로 두고 partial 에 적는다.
 * 이 셋이 틀리면 화면만 봐서는 알 수 없어서, admin-dashboard.test.ts 로 시험한다.
 *
 * 실제 결제(원) 숫자는 여기 없다 — 결제사를 붙이기 전이라 보여 줄 진짜 값이 없다.
 * 상대 경로·type 가져오기만 쓴다 — 테스트 러너(node --test)가 @/ 별칭을 못 읽는다.
 */
import { dropMasterRows, kstDayKey, kstDaysAgoStart } from "./admin-console.ts";
import { kstDayStart, openIncidentCount } from "./admin.ts";

/* ── 서버 ↔ 화면이 주고받는 모양 ─────────────────────────────────────── */

/** 한국 날짜 하루치. 그 부분을 못 읽었으면 그 칸은 null(0 으로 속이지 않는다). */
export type DayBucket = { day: string; members: number | null; books: number | null; tokensSpent: number | null };

export type DashboardPart = "members" | "books" | "ledger" | "incidents" | "feedback";

export type DashboardResponse = {
  /** 센 시각 · 한국 날짜 오늘 0시 · 그 6일 전 0시(7일 = 오늘 포함 7일). 전부 UTC ISO. */
  now: string;
  todayStart: string;
  weekStart: string;
  /** 새 회원 — 관리자 계정은 스위치와 상관없이 늘 뺀다(회원 = 고객). total 은 전체 고객 수. */
  members: { today: number | null; week: number | null; total: number | null };
  books: { today: number | null; week: number | null };
  /** 쓴 토큰 — 그 기간에 생긴 장부 줄 중 되돌리지 않은 것의 합(대본·그림·목소리·가족 캐릭터). */
  tokensSpent: { today: number | null; week: number | null };
  /** 되돌린 토큰 — 되돌린 시각(refunded_at)이 그 기간인 장부 줄의 합. */
  tokensRefunded: { today: number | null; week: number | null };
  /** 지금 열린 사고(오늘 생긴 것만이 아니라 처리 안 된 것 전부). 못 읽으면 null. */
  incidents: { open: number; paidNotSaved: number; stuck: number } | null;
  feedback: { open: number } | null;
  /** 늘 7칸, 오래된 날부터. */
  days: DayBucket[];
  /** 최근 가입 5명 — 관리자 계정은 스위치와 상관없이 넣지 않는다. */
  recentMembers: { id: string; username: string; createdAt: string | null }[];
  /** 어느 읽기가 상한에 닿았다 — 화면이 "일부만 셌어요"를 알린다. */
  truncated: boolean;
  /** 못 읽은 부분 — 화면이 "일부 숫자를 못 읽었어요"를 알리고 그 숫자는 '–'로 둔다. */
  partial: DashboardPart[];
  /** '내 계정 것도 보기'가 켜진 채로 센 숫자인가(화면이 띠를 보여 준다). */
  includeMine: boolean;
};

/* ── 서버가 넘겨주는 재료 ─────────────────────────────────────────────── */

export type DashProfile = { id: string; username: string; is_master: boolean | null; created_at: string | null };
export type DashBook = { owner: string | null; created_at: string | null };
export type DashLedger = { owner: string | null; amount: number | null; refunded_at: string | null; created_at: string | null };
export type DashIncident = { member: string | null; kinds: readonly string[] | null; resolved_at: string | null };
export type DashFeedback = { owner: string | null; handled_at: string | null };

/** 읽기 하나의 결과 — 못 읽었으면 rows 가 null. */
export type DashRead<T> = { rows: T[] | null; truncated?: boolean };

export type DashboardInput = {
  /** 7일 안에 가입한 프로필. */
  profiles: DashRead<DashProfile>;
  /** 고객(관리자 아님) 전체 수 — 머리만 센 값. 못 읽으면 null. */
  memberTotal: number | null;
  /** 최근 가입(기간 상관없이, 관리자 아님) — 7일 안에 아무도 없어도 보이게 따로 읽는다. */
  recent: DashRead<DashProfile>;
  /** 7일 안에 만든 책. */
  books: DashRead<DashBook>;
  /** 7일 안에 생긴 장부 줄. */
  ledger: DashRead<DashLedger>;
  /** 7일 안에 되돌린 장부 줄(생긴 날은 더 앞일 수 있다). */
  refunded: DashRead<DashLedger>;
  incidents: DashRead<DashIncident>;
  /** 아직 처리 안 한 의견만. */
  feedback: DashRead<DashFeedback>;
};

/* ── 기간 ─────────────────────────────────────────────────────────────── */

/** 오늘 0시 · 7일 전 0시(한국 날짜). 서버 경로가 읽을 범위를 이걸로 정한다 — 세는 쪽과 같은 선이어야 한다. */
export function dashboardWindow(now: Date | number): { now: string; todayStart: string; weekStart: string } {
  const ms = typeof now === "number" ? now : now.getTime();
  return {
    now: new Date(ms).toISOString(),
    todayStart: kstDayStart(ms).toISOString(),
    weekStart: kstDaysAgoStart(6, ms).toISOString(),
  };
}

/** 오늘 포함 7일의 한국 날짜 'YYYY-MM-DD'(오래된 날부터). */
export function weekDayKeys(now: Date | number): string[] {
  const start = kstDaysAgoStart(6, now).getTime();
  return Array.from({ length: 7 }, (_, i) => kstDayKey(new Date(start + i * 86_400_000).toISOString()));
}

/** 'YYYY-MM-DD' → '9/24' (그래프 아래 날짜). */
export function shortDayLabel(day: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(day);
  return m ? `${Number(m[1])}/${Number(m[2])}` : day;
}

/* ── 세기 ─────────────────────────────────────────────────────────────── */

const at = (iso: string | null | undefined) => {
  const t = Date.parse(String(iso ?? ""));
  return Number.isFinite(t) ? t : NaN;
};
/** 장부 금액 — 음수·이상한 값은 0 으로(되돌림은 refunded_at 으로 따로 센다). */
const tokens = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) ? Math.max(0, n) : 0);

/**
 * 대시보드 숫자를 센다.
 *  · includeMine=false(기본): 관리자 계정(masterIds)이 주인인 책·장부·사고·의견은 어느 숫자에도 안 들어간다.
 *  · includeMine=true: 그것들도 센다('내 계정 것도 보기'). 단 새 회원 수·전체 회원 수·최근 가입은
 *    '고객'을 세는 칸이라 관리자 계정을 늘 뺀다.
 *  · 못 읽은 부분은 null + partial. 주인이 비어 있는 줄(탈퇴 회원)은 고객 것이라 남긴다.
 */
export function summarizeDashboard(
  input: DashboardInput,
  opts: { now: Date | number; masterIds: ReadonlySet<string>; includeMine: boolean },
): DashboardResponse {
  const win = dashboardWindow(opts.now);
  const todayMs = Date.parse(win.todayStart);
  const weekMs = Date.parse(win.weekStart);
  const nowMs = Date.parse(win.now);
  const keys = weekDayKeys(opts.now);
  const { masterIds, includeMine } = opts;
  const partial: DashboardPart[] = [];
  let truncated = false;

  const inWeek = (t: number) => t >= weekMs && t <= nowMs + 60_000; // 시계가 조금 어긋나도 방금 줄은 센다
  const inToday = (t: number) => t >= todayMs && t <= nowMs + 60_000;

  // 고객인가 — is_master 칸과 관리자 id 둘 다 본다(한쪽만 믿지 않는다).
  const isCustomer = (p: DashProfile) => !p.is_master && !masterIds.has(String(p.id).toLowerCase());

  /* 새 회원 */
  let membersToday: number | null = null;
  let membersWeek: number | null = null;
  const memberByDay = new Map<string, number>();
  if (input.profiles.rows) {
    truncated ||= !!input.profiles.truncated;
    const joined = input.profiles.rows.filter(isCustomer).filter((p) => inWeek(at(p.created_at)));
    membersWeek = joined.length;
    membersToday = joined.filter((p) => inToday(at(p.created_at))).length;
    for (const p of joined) memberByDay.set(kstDayKey(p.created_at), (memberByDay.get(kstDayKey(p.created_at)) ?? 0) + 1);
  } else partial.push("members");

  /* 만든 동화 */
  let booksToday: number | null = null;
  let booksWeek: number | null = null;
  const bookByDay = new Map<string, number>();
  if (input.books.rows) {
    truncated ||= !!input.books.truncated;
    const kept = dropMasterRows(input.books.rows, (b) => b.owner, masterIds, includeMine).rows.filter((b) =>
      inWeek(at(b.created_at)),
    );
    booksWeek = kept.length;
    booksToday = kept.filter((b) => inToday(at(b.created_at))).length;
    for (const b of kept) bookByDay.set(kstDayKey(b.created_at), (bookByDay.get(kstDayKey(b.created_at)) ?? 0) + 1);
  } else partial.push("books");

  /* 토큰 — 쓴 것(되돌리지 않은 것) · 되돌린 것 */
  let spentToday: number | null = null;
  let spentWeek: number | null = null;
  let refundedToday: number | null = null;
  let refundedWeek: number | null = null;
  const spentByDay = new Map<string, number>();
  if (input.ledger.rows && input.refunded.rows) {
    truncated ||= !!input.ledger.truncated || !!input.refunded.truncated;
    const spent = dropMasterRows(input.ledger.rows, (l) => l.owner, masterIds, includeMine).rows.filter(
      (l) => !l.refunded_at && inWeek(at(l.created_at)),
    );
    spentWeek = spent.reduce((s, l) => s + tokens(l.amount), 0);
    spentToday = spent.filter((l) => inToday(at(l.created_at))).reduce((s, l) => s + tokens(l.amount), 0);
    for (const l of spent) spentByDay.set(kstDayKey(l.created_at), (spentByDay.get(kstDayKey(l.created_at)) ?? 0) + tokens(l.amount));

    const back = dropMasterRows(input.refunded.rows, (l) => l.owner, masterIds, includeMine).rows.filter((l) =>
      inWeek(at(l.refunded_at)),
    );
    refundedWeek = back.reduce((s, l) => s + tokens(l.amount), 0);
    refundedToday = back.filter((l) => inToday(at(l.refunded_at))).reduce((s, l) => s + tokens(l.amount), 0);
  } else partial.push("ledger");

  /* 사고 — 지금 열린 것 전부 */
  let incidents: DashboardResponse["incidents"] = null;
  if (input.incidents.rows) {
    truncated ||= !!input.incidents.truncated;
    const kept = dropMasterRows(input.incidents.rows, (r) => r.member, masterIds, includeMine).rows.map((r) => ({
      kinds: Array.isArray(r.kinds) ? r.kinds : [],
      resolved_at: r.resolved_at,
    }));
    const open = kept.filter((r) => !r.resolved_at);
    incidents = {
      open: openIncidentCount(kept),
      paidNotSaved: open.filter((r) => r.kinds.includes("paid_not_saved")).length,
      stuck: open.filter((r) => r.kinds.includes("stuck")).length,
    };
  } else partial.push("incidents");

  /* 의견 — 아직 처리 안 한 것 */
  let feedback: DashboardResponse["feedback"] = null;
  if (input.feedback.rows) {
    truncated ||= !!input.feedback.truncated;
    const kept = dropMasterRows(input.feedback.rows, (f) => f.owner, masterIds, includeMine).rows;
    feedback = { open: kept.filter((f) => !f.handled_at).length };
  } else partial.push("feedback");

  /* 최근 가입 — 기간과 상관없이 고객만 5명 */
  let recentMembers: DashboardResponse["recentMembers"] = [];
  if (input.recent.rows) {
    recentMembers = input.recent.rows
      .filter(isCustomer)
      .sort((a, b) => (at(b.created_at) || 0) - (at(a.created_at) || 0))
      .slice(0, 5)
      .map((p) => ({ id: p.id, username: p.username, createdAt: p.created_at }));
  } else if (!partial.includes("members")) partial.push("members");

  const days: DayBucket[] = keys.map((day) => ({
    day,
    members: membersWeek === null ? null : (memberByDay.get(day) ?? 0),
    books: booksWeek === null ? null : (bookByDay.get(day) ?? 0),
    tokensSpent: spentWeek === null ? null : (spentByDay.get(day) ?? 0),
  }));

  return {
    ...win,
    members: {
      today: membersToday,
      week: membersWeek,
      total: typeof input.memberTotal === "number" && Number.isFinite(input.memberTotal) ? input.memberTotal : null,
    },
    books: { today: booksToday, week: booksWeek },
    tokensSpent: { today: spentToday, week: spentWeek },
    tokensRefunded: { today: refundedToday, week: refundedWeek },
    incidents,
    feedback,
    days,
    recentMembers,
    truncated,
    partial,
    includeMine,
  };
}

/** partial 칸 → 화면 문구("회원 · 책을 못 읽었어요"). */
export const PART_LABEL: Record<DashboardPart, string> = {
  members: "회원",
  books: "만든 동화",
  ledger: "토큰 장부",
  incidents: "사고",
  feedback: "의견",
};

/** 처리할 일이 있나 — 대시보드 맨 위 줄을 보일지. 못 읽은 칸(null)은 '할 일 없음'으로 치지 않는다. */
export function needsAttention(d: Pick<DashboardResponse, "incidents" | "feedback">): "some" | "none" | "unknown" {
  if (!d.incidents || !d.feedback) {
    const known = (d.incidents?.open ?? 0) + (d.feedback?.open ?? 0);
    return known > 0 ? "some" : "unknown";
  }
  return d.incidents.open + d.incidents.paidNotSaved + d.feedback.open > 0 ? "some" : "none";
}

/* ── 여러 쪽 읽기 ─────────────────────────────────────────────────────── */

/**
 * 표를 여러 번 나눠 읽는다(최대 cap 줄). Supabase 는 한 번에 돌려주는 줄 수에 상한(기본 1000)이 있어서
 * .limit(10000) 을 적어도 1000 줄에서 조용히 잘린다 — 그러면 "이번 주 책 1000권"처럼 틀린 숫자가 나온다.
 * 그래서 range 로 이어 읽고, 빈 쪽이 오면 끝, cap 에 닿으면 truncated.
 * 서버 상한이 쪽 크기보다 작아도 맞게, 받은 만큼만 앞으로 간다.
 * page(from, to) 는 순서가 정해진 질의여야 한다(created_at·id 순) — 아니면 쪽 사이에 줄이 겹치거나 빠진다.
 */
export async function readAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { code?: string | null; message?: string | null } | null }>,
  cap: number,
  pageSize = 1000,
): Promise<{ rows: T[]; error: { code?: string | null; message?: string | null } | null; truncated: boolean }> {
  const rows: T[] = [];
  let from = 0;
  // 쪽 수에도 끝을 둔다 — 서버가 이상하게 늘 같은 줄을 주더라도 끝없이 돌지 않게.
  for (let guard = 0; from < cap && guard < 1000; guard++) {
    const to = Math.min(cap, from + pageSize) - 1;
    const { data, error } = await page(from, to);
    if (error) return { rows, error, truncated: false };
    const got = Array.isArray(data) ? (data as T[]) : [];
    if (got.length === 0) return { rows, error: null, truncated: false };
    rows.push(...got);
    from += got.length;
  }
  return { rows, error: null, truncated: from >= cap };
}
