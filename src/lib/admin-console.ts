/**
 * 관리자 페이지 정식판(2026-09-30) — 여러 화면·서버 경로가 같이 쓰는 순수 함수와 정해 둔 값.
 *
 * 왜 따로 두나: 관리실이 한 화면(/admin)에서 여러 주소(/admin/members · /admin/billing …)로 나뉘었다.
 * 메뉴 목록·한국 시각 계산·돈 표시·"DB 가 아직 준비 전인가" 판단이 화면마다 조금씩 다르면
 * 같은 숫자가 화면마다 다르게 보인다. 그래서 한 곳에 두고 admin-console.test.ts 로 시험한다.
 *
 * 상대 경로·type 가져오기만 쓴다 — 테스트 러너(node --test)가 @/ 별칭을 못 읽는다.
 * 결제 시연 모듈은 여기서 가져오지 않는다(pay-demo 규칙: 시연 모듈은 시연 파일 밖으로 새지 않는다).
 * 그래서 시연 켜짐/꺼짐 판단(payDemoState)을 여기 같은 규칙으로 한 번 더 적고, 둘이 같은지는 시험이 본다.
 */
import { isUuid, kstDayStart, type Parsed } from "./admin.ts";

/* ── 누가 회사 일을 바꾸나 ─────────────────────────────────────────────── */

/**
 * 가격·사업자 정보·약관을 바꿀 수 있는 계정 — 회사 계정 하나.
 * DB 의 is_pricing_admin() · 가격 경로의 PRICING_ADMIN 과 같은 값이어야 한다(시험이 셋을 맞춰 본다).
 * 사람을 바꿀 일이 생기면 세 곳을 함께 고친다.
 */
export const COMPANY_ADMIN = "yogico";

/** GET /api/admin/me 가 돌려주는 모양 — 관리자 페이지 겉틀이 첫 화면을 열기 전에 확인한다. */
export type AdminMe = { username: string; canEditCompany: boolean };

/**
 * 바꾼 이력을 보는 계정 — 사업자 정보의 '바꾼 이력' 같은 점검용 표는 이 계정에서만 보인다(사장님 2026-10-19:
 * "바꾼 이력 구지 아래 안 보여도 될 듯, fe 계정 안에서만 보이는 건 ok, yogico 계정 안에서는 안 보여도").
 * 화면에서 가리는 편의일 뿐 — 기록은 그대로 쌓이고 읽기 권한도 그대로다.
 */
export const CHANGE_LOG_VIEWER = "fe";

export function seesChangeLog(me: Pick<AdminMe, "username">): boolean {
  return me.username === CHANGE_LOG_VIEWER;
}

/** GET /api/admin/badges — 메뉴 옆 숫자. 한쪽을 못 읽으면 그 칸만 null(배지를 감춘다, 0 으로 속이지 않는다). */
export type AdminBadges = { incidents: number | null; paidNotSaved: number | null; feedback: number | null };

/* ── 메뉴 ──────────────────────────────────────────────────────────────── */

/** 관리자 페이지 아이콘 이름 — 부품(kit/Icon)이 이 이름으로 그림을 고른다. */
export type IconName =
  | "dashboard"
  | "users"
  | "inbox"
  | "card"
  | "tag"
  | "building"
  | "external"
  | "search"
  | "close"
  | "chevron"
  | "copy"
  | "download"
  | "alert"
  | "check"
  | "info"
  | "lock"
  | "book"
  | "refresh"
  | "back";

export type AdminNavKey =
  | "dashboard"
  | "members"
  | "library"
  | "support"
  | "billing"
  | "pricing"
  | "codes"
  | "business"
  | "seo"
  | "report";
export type AdminNavGroup = "운영" | "매출" | "회사";

export type AdminNavItem = {
  key: AdminNavKey;
  href: string;
  label: string;
  group: AdminNavGroup;
  icon: IconName;
  /** 메뉴 옆 회색 꼬리표 — 결제사를 붙이기 전까지 '연동 전'. */
  tag?: string;
};

export const ADMIN_NAV_GROUPS: readonly AdminNavGroup[] = ["운영", "매출", "회사"];

/**
 * 왼쪽 메뉴 — 사장님이 매일 쓰는 순서(운영 → 매출 → 회사).
 * 주소를 바꾸면 src/app 아래 page.tsx 도 옮겨야 한다(시험이 파일이 있는지 본다).
 */
export const ADMIN_NAV: readonly AdminNavItem[] = [
  { key: "dashboard", href: "/admin", label: "대시보드", group: "운영", icon: "dashboard" },
  { key: "members", href: "/admin/members", label: "회원", group: "운영", icon: "users" },
  // 공개 동화 — 회원 종류마다 어떤 세계명작·전래동화를 보여 줄지(2026-10-02 사장님 "운영 쪽에")
  { key: "library", href: "/admin/library", label: "공개 동화", group: "운영", icon: "book" },
  { key: "support", href: "/admin/support", label: "의견·오류", group: "운영", icon: "inbox" },
  { key: "billing", href: "/admin/billing", label: "결제·구독", group: "매출", icon: "card", tag: "연동 전" },
  { key: "pricing", href: "/admin/pricing", label: "요금제·가격", group: "매출", icon: "tag" },
  // 혜택 코드 — 요기보 회원 혜택(공용 코드)·요기보 구매 고객 시리얼(2026-10-22 사장님 미팅)
  { key: "codes", href: "/admin/codes", label: "혜택 코드", group: "매출", icon: "tag" },
  { key: "business", href: "/admin/business", label: "사업자 정보·약관", group: "회사", icon: "building" },
  // 검색 노출(SEO) — 네이버·구글 검색 결과와 카카오톡 공유에 보이는 제목·설명·그림(2026-10-19 사장님, lib/seo)
  { key: "seo", href: "/admin/seo", label: "검색 노출(SEO)", group: "회사", icon: "search" },
  // 가격정책 확인 데이터 — 원가·마진이 들어 있어 출시 전에 지운다(사장님 2026-10-02 "이건 삭제될꺼다 라는거 까지",
  // 이름은 "보고용이라고 써주지 말고 가격정책 확인 데이터 식으로")
  { key: "report", href: "/admin/report", label: "가격정책 확인 데이터", group: "회사", icon: "info", tag: "지울 예정" },
];

/**
 * 지금 주소가 어느 메뉴인가. "/admin" 은 정확히 같을 때만 대시보드다 —
 * 모든 주소가 "/admin" 으로 시작하니 앞머리로 재면 없는 주소도 대시보드에 불이 들어온다.
 * 나머지는 가장 길게 맞는 메뉴(예: /admin/members/<id> → 회원).
 */
export function activeNavKey(pathname: string | null | undefined): AdminNavKey | null {
  if (typeof pathname !== "string") return null;
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (path === "/admin") return "dashboard";
  let best: AdminNavItem | null = null;
  for (const item of ADMIN_NAV) {
    if (item.href === "/admin") continue;
    if (path === item.href || path.startsWith(`${item.href}/`)) {
      if (!best || item.href.length > best.href.length) best = item;
    }
  }
  return best?.key ?? null;
}

export function navItem(key: AdminNavKey): AdminNavItem {
  return ADMIN_NAV.find((n) => n.key === key) ?? ADMIN_NAV[0];
}

/* ── 결제 화면 시연 상태 ─────────────────────────────────────────────────── */

export type PayDemoState = "on" | "off";

/**
 * 고객 결제 화면이 시연인가. 규칙은 결제 시연 모듈과 똑같다 — "off"(앞뒤 공백·대소문자 무시)일 때만 꺼짐.
 * 부르는 쪽은 반드시 `payDemoState(process.env.NEXT_PUBLIC_PAY_DEMO)` 글자 그대로 쓴다
 * (변수에 담아 넘기면 빌드가 값을 박지 못해 늘 '켜짐'으로 보인다).
 */
export function payDemoState(raw: string | undefined): PayDemoState {
  return typeof raw === "string" && raw.trim().toLowerCase() === "off" ? "off" : "on";
}

/* ── 한국 시각 ─────────────────────────────────────────────────────────── */

const KST_MS = 9 * 60 * 60 * 1000; // 한국은 서머타임이 없어 늘 +9시간
const DAY_MS = 86_400_000;
const pad2 = (n: number) => String(n).padStart(2, "0");
const toMs = (now: Date | number) => (typeof now === "number" ? now : now.getTime());

/** 한국 날짜로 오늘 0시(UTC ISO). 대시보드·결제 목록의 '오늘'이 같은 선에서 끊기게. */
export function kstDayStartIso(now: Date | number): string {
  return kstDayStart(now).toISOString();
}

export type PeriodPreset = "today" | "7d" | "30d" | "all";
export const PERIOD_PRESETS: readonly PeriodPreset[] = ["today", "7d", "30d", "all"];

export function isPeriodPreset(v: unknown): v is PeriodPreset {
  return typeof v === "string" && (PERIOD_PRESETS as readonly string[]).includes(v);
}

/**
 * 기간 단추 → [from, to) 범위(UTC ISO). '7일'은 오늘을 넣어 7일(오늘 0시에서 6일 전 0시부터)이다.
 * to 는 늘 null(지금까지) — 미래 기록은 없고, 날짜 고르기는 이번 범위 밖이다.
 */
export function kstRange(preset: PeriodPreset, now: Date | number): { from: string | null; to: string | null } {
  if (preset === "all") return { from: null, to: null };
  const start = kstDayStart(now).getTime();
  const back = preset === "today" ? 0 : preset === "7d" ? 6 : 29;
  return { from: new Date(start - back * DAY_MS).toISOString(), to: null };
}

/** ISO 시각 → 한국 날짜 'YYYY-MM-DD'. 읽을 수 없으면 빈 글자. */
export function kstDayKey(iso: string | null | undefined): string {
  const t = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(t)) return "";
  const d = new Date(t + KST_MS);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** '2026. 9. 30. 14:05' (한국 시각). 서버(UTC)와 브라우저가 같게 찍히도록 toLocaleString 을 쓰지 않는다. */
export function formatKstDateTime(iso: string | null | undefined): string {
  const t = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(t)) return "–";
  const d = new Date(t + KST_MS);
  return `${d.getUTCFullYear()}. ${d.getUTCMonth() + 1}. ${d.getUTCDate()}. ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

/** 지금부터 며칠 전 한국 0시인가 — 시험·필터가 '7일 전'을 같은 식으로 센다. */
export function kstDaysAgoStart(days: number, now: Date | number): Date {
  return new Date(kstDayStart(toMs(now)).getTime() - Math.max(0, Math.floor(days)) * DAY_MS);
}

/* ── 돈 ─────────────────────────────────────────────────────────────────── */

/** 1234567 → "1,234,567". toLocaleString 은 서버·브라우저 ICU 에 따라 달라질 수 있어 직접 찍는다. */
export function groupDigits(n: number): string {
  const sign = n < 0 ? "-" : "";
  return sign + String(Math.abs(Math.trunc(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 원 표시 — "12,900원". 값이 없으면 "–"(0원으로 속이지 않는다). */
export function formatWon(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "–";
  return `${groupDigits(Math.round(n))}원`;
}

/* ── DB 가 아직 준비 전인가 ─────────────────────────────────────────────── */

/**
 * 표·함수가 아직 없어서 난 오류인가(사장님이 SQL 을 아직 안 돌렸을 때).
 * 이때 서버 경로는 500 대신 200 + { schemaReady:false } 를 준다 — 화면이 '데이터베이스 준비 전이에요'라고
 * 말하게. 42P01 표 없음 · 42703 칸 없음(예전 판 SQL) · 42883 함수 없음 · PGRST202 함수 못 찾음 ·
 * PGRST204 칸 못 찾음 · PGRST205 표 못 찾음(PostgREST 캐시).
 */
export function isSchemaMissing(err: { code?: string | null } | null | undefined): boolean {
  const code = String(err?.code ?? "");
  return ["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"].includes(code);
}

/* ── id 검사 ───────────────────────────────────────────────────────────── */

/**
 * 처리 요청에 온 id — uuid 만 받는다. 시연 줄(id 가 demo- 로 시작)은 따로 알려 준다:
 * 시연 데이터는 화면에만 있고 DB 에 없으므로, 눌러도 아무 일도 일어나면 안 된다.
 */
export function parseAdminId(v: unknown): Parsed<string> {
  if (typeof v === "string" && /^demo-/i.test(v.trim())) return { ok: false, error: "시연 데이터는 처리할 수 없어요." };
  if (!isUuid(v)) return { ok: false, error: "id 모양이 아니에요." };
  return { ok: true, value: v.toLowerCase() };
}

/* ── 주소(쿼리) 고치기 ─────────────────────────────────────────────────── */

/**
 * 지금 쿼리에 몇 칸만 바꾼 새 쿼리("?a=1&b=2" 또는 ""). null·빈 글자는 그 칸을 뺀다.
 * 서랍·탭을 주소로 여닫을 때 다른 칸(검색어·거르기)을 잃지 않으려고 쓴다.
 */
export function withParams(search: string, patch: Record<string, string | null | undefined>): string {
  const sp = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === "") sp.delete(k);
    else sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** 목록 길이 제한 — 1~max 정수, 이상하면 기본값. */
export function clampLimit(v: unknown, fallback = 200, max = 500): number {
  const n = typeof v === "string" && /^\s*\d{1,6}\s*$/.test(v) ? Number(v) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(n)));
}

/* ── 관리자 계정에서 생긴 기록은 세지 않는다 (사장님 2026-09-30) ─────────── */

/*
 * 사장님 말: "이거 fe 마스터니깐 여기서 발생된 사고 에대해선 안남아도 되".
 * 관리자 계정으로 점검하다 난 실패·멈춤·의견은 고객 일이 아니라서 사고 목록·숫자에 섞이면 안 된다.
 *
 * 왜 '안 적기'가 아니라 '읽을 때 빼기'인가: 사고는 따로 적는 표가 없다. DB 함수(master_book_incidents)가
 * 만들기 기록(book_jobs)·장부·책에서 매번 계산한다. 그런데 관리자 계정의 만들기 기록도 그림 값 잇기·
 * 그림 주인 찾기·되살리기에 실제로 쓰인다 — 적지 않으면 사장님 책 만들기가 깨진다.
 * 그래서 쓰기는 그대로 두고, 관리실이 읽어서 보여 줄 때만 뺀다(서버 경로가 뺀다, 화면은 mine=1 만 넘긴다).
 */

/** 주소에 mine=1 이 있나 — '내 계정 것도 보기' 스위치. 켜져 있을 때만 관리자 계정 기록을 함께 센다. */
export function isMineFlag(sp: URLSearchParams): boolean {
  return sp.get("mine") === "1";
}

/**
 * 관리자 계정이 주인인 줄을 뺀다. includeMine 이면 그대로 돌려준다(점검용).
 * 주인이 비어 있는 줄(탈퇴한 회원)은 고객 것이므로 남긴다.
 * dropped 는 뺀 줄 수 — 서버가 '전체 n건'을 셀 때 그만큼 덜어 낸다.
 */
export function dropMasterRows<R>(
  rows: readonly R[],
  ownerOf: (r: R) => string | null | undefined,
  masterIds: ReadonlySet<string>,
  includeMine: boolean,
): { rows: R[]; dropped: number } {
  if (includeMine || masterIds.size === 0) return { rows: [...rows], dropped: 0 };
  const kept: R[] = [];
  for (const r of rows) {
    const owner = ownerOf(r);
    if (owner && masterIds.has(owner.toLowerCase())) continue;
    kept.push(r);
  }
  return { rows: kept, dropped: rows.length - kept.length };
}

/* ── 떠나기 되묻기 · 로그인 뒤 돌아오기 ───────────────────────────────────── */

/** 화면이 겉틀에 알린 '떠나면 곤란한 일' 하나. note 가 있으면 저장 안 한 글이 아니라 도는 일(예: 그림 옮기기)이다. */
export type UnsavedEntry = { label: string; note?: string | null };

/**
 * 떠나기 되묻기 창의 제목·본문. 쓰던 글은 '떠나면 사라져요', 도는 일은 그 일이 적어 준 문장으로 알린다
 * (그림 옮기기는 멈춰도 옮긴 데까지 남는데 '사라져요'라고 하면 틀린 말이 된다).
 */
export function leaveDialogText(entries: readonly UnsavedEntry[]): { title: string; body: string } {
  const drafts = [...new Set(entries.filter((e) => !e.note).map((e) => e.label))];
  const tasks = entries.filter((e): e is { label: string; note: string } => !!e.note);
  const parts: string[] = [];
  if (drafts.length) parts.push(`${drafts.join(" · ")}에 저장하지 않은 내용이 있어요. 떠나면 사라져요.`);
  const seen = new Set<string>();
  for (const t of tasks) {
    const line = `${t.label} — ${t.note}`;
    if (!seen.has(line)) parts.push(line);
    seen.add(line);
  }
  return {
    title: drafts.length ? "저장 안 한 내용이 있어요. 이 화면을 떠날까요?" : "하던 일이 있어요. 이 화면을 떠날까요?",
    body: parts.join(" "),
  };
}

/**
 * 로그인 뒤 돌아갈 관리실 주소(?next=). 관리실 안(/admin…)의 같은 사이트 경로만 받는다 — 다른 곳이면 null.
 * 왜 관리실만: 로그인 화면이 아무 주소로나 보내 주면 남이 만든 링크로 엉뚱한 곳(피싱)에 보내는 길이 된다.
 */
export function safeAdminNext(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.length > 512) return null;
  if (!/^\/admin(?:[/?#]|$)/.test(raw)) return null;
  // '//' · 역슬래시 · 제어 문자는 브라우저가 다른 사이트 주소로 읽을 수 있어 통째로 거절한다.
  if (raw.includes("//") || raw.includes("\\")) return null;
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return null;
  }
  return raw;
}
