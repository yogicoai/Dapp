/**
 * 혜택 코드 — 요기보 회원 혜택(공용 코드 YOGIBO) · 요기보 구매 고객 시리얼(한 장 한 번) (사장님 2026-10-22 미팅).
 *
 *  · 요기보(yogibo.kr)에 회원가입하고 마케팅 수신에 동의한 고객 → 공용 코드로 세계명작·전래동화 전체 듣기(기한까지)
 *  · 요기보에서 구매한 고객 → 난수 시리얼로 우리 아이 동화 1권 만들기(+ 가족 캐릭터 그리기)
 *  · 일반 고객은 지금 정책 그대로
 *
 * 진짜 문지기는 DB 함수다(supabase-promo-codes.sql — redeem_promo_code · credit_gate · master_*). 여기에는 손님 화면·관리실·
 * 서버가 같이 쓰는 순수 셈만 둔다: 코드 다듬기·모양, 넣은 결과 읽기, 혜택 글, 전체 듣기 기한, 시리얼 내려받기(CSV), 관리실 입력 검사.
 * 웹과 안드로이드 앱이 같은 화면을 쓴다(앱은 이 사이트를 감싼 틀). 아이폰 앱을 낼 때는 앱 안 코드 칸을 숨긴다(애플 3.1.1 — 웹에서 넣기).
 * 상대 경로·type 가져오기만 쓴다 — 테스트 러너(node --test)가 @/ 별칭을 못 읽는다.
 */
import type { Parsed } from "./admin.ts";

export type PromoKind = "shared" | "serial";

/** DB 와 같은 다듬기 — 영문·숫자만 남기고 대문자로(띄어쓰기·하이픈·소문자도 받는다) */
export function normalizePromoCode(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase() : "";
}

export const PROMO_CODE_RE = /^[A-Z0-9]{4,24}$/;

export function isPromoCodeShape(code: string): boolean {
  return PROMO_CODE_RE.test(code);
}

/** 시리얼은 4자리씩 끊어 보여 준다(ABCD-EFGH-JKLM) — 공용 코드는 그대로 */
export function formatPromoCode(code: string, kind: PromoKind): string {
  return kind === "serial" && code.length === 12 ? `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}` : code;
}

/** 링크로 넣기 — 요기보가 문자·메일로 보내는 주소. 누르면 로그인 뒤 바로 들어간다(app/code/[code]). */
export function promoLinkOf(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, "")}/code/${code}`;
}

/* ── 손님 — 코드 넣은 결과 ─────────────────────────────────────────────── */

export type RedeemReason = "not_found" | "ended" | "used" | "too_many";

export type RedeemReply =
  | {
      ok: true;
      /** 이 계정이 예전에 넣은 코드 — 다시 더하지 않았다 */
      already: boolean;
      kind: PromoKind;
      label: string;
      bookCredits: number;
      drawCredits: number;
      libraryUntil: string | null;
    }
  | { ok: false; reason: RedeemReason };

export const REDEEM_REASON_MESSAGE: Readonly<Record<RedeemReason, string>> = {
  not_found: "코드를 다시 확인해 주세요.",
  ended: "사용 기간이 끝난 코드예요.",
  used: "이미 사용된 시리얼이에요.",
  too_many: "코드를 여러 번 틀렸어요. 한 시간 뒤에 다시 해 주세요.",
};

function count(v: unknown): number {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

function isoOrNull(v: unknown): string | null {
  return typeof v === "string" && v && Number.isFinite(Date.parse(v)) ? v : null;
}

/** redeem_promo_code 의 답(json) — 모양이 틀리면 null */
export function redeemReplyOf(raw: unknown): RedeemReply | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.ok === false) {
    const reason = r.reason;
    return reason === "not_found" || reason === "ended" || reason === "used" || reason === "too_many" ? { ok: false, reason } : null;
  }
  if (r.ok !== true || (r.kind !== "shared" && r.kind !== "serial")) return null;
  return {
    ok: true,
    already: r.already === true,
    kind: r.kind,
    label: typeof r.label === "string" ? r.label : "",
    bookCredits: count(r.book_credits),
    drawCredits: count(r.draw_credits),
    libraryUntil: isoOrNull(r.library_until),
  };
}

/** "2026년 12월 31일" — 한국 시간으로 */
export function koDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const k = new Date(d.getTime() + 9 * 3600_000);
  return `${k.getUTCFullYear()}년 ${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일`;
}

/** 받은 혜택을 한 줄씩 — 화면(설정·링크)과 관리실이 같은 말을 쓴다 */
export function promoBenefitLines(b: { bookCredits: number; drawCredits: number; libraryUntil: string | null }): string[] {
  const lines: string[] = [];
  if (b.libraryUntil) lines.push(`세계명작·전래동화 전체 듣기 (${koDate(b.libraryUntil)}까지)`);
  if (b.bookCredits > 0) lines.push(`우리 아이 동화 ${b.bookCredits}권 만들기`);
  if (b.drawCredits > 0) lines.push(`가족 캐릭터 그리기 ${b.drawCredits}번`);
  return lines;
}

/** 내 혜택 줄(promo_redemptions 본인 열람) 가운데 지금 열려 있는 전체 듣기의 가장 늦은 끝 — 없으면 null */
export function libraryPassUntil(rows: readonly unknown[], now: number): string | null {
  let best: string | null = null;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const until = isoOrNull((row as Record<string, unknown>).library_until);
    if (!until || Date.parse(until) <= now) continue;
    if (!best || Date.parse(until) > Date.parse(best)) best = until;
  }
  return best;
}

/** 내 혜택 줄 하나(설정 화면 목록) */
export type MyPromo = { label: string; at: string; bookCredits: number; drawCredits: number; libraryUntil: string | null };

export function myPromosOf(rows: unknown): MyPromo[] {
  if (!Array.isArray(rows)) return [];
  const out: MyPromo[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const at = isoOrNull(r.at);
    if (!at) continue;
    out.push({
      label: typeof r.label === "string" ? r.label : "",
      at,
      bookCredits: count(r.book_credits),
      drawCredits: count(r.draw_credits),
      libraryUntil: isoOrNull(r.library_until),
    });
  }
  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/* ── 링크로 왔는데 로그인 전 — 로그인 뒤 이어서 넣기 ───────────────────────── */

/** 구글 로그인은 늘 /login 으로 돌아와 주소의 값이 사라진다 — 코드를 이 기기에 잠깐(1시간) 둔다 */
export const PENDING_CODE_KEY = "voice-storybook:pending-code";
export const PENDING_CODE_MS = 60 * 60 * 1000;

export function pendingCodeRecord(code: string, now: number): string {
  return JSON.stringify({ code, at: now });
}

/** 저장해 둔 값 → 코드(모양이 틀렸거나 1시간이 지났으면 null) */
export function pendingCodeOf(raw: string | null, now: number): string | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { code?: unknown; at?: unknown };
    const code = normalizePromoCode(v.code);
    const at = Number(v.at);
    if (!isPromoCodeShape(code) || !Number.isFinite(at) || now - at > PENDING_CODE_MS || at > now + 60_000) return null;
    return code;
  } catch {
    return null;
  }
}

/* ── 관리실 ─────────────────────────────────────────────────────────────── */

export const PROMO_LABEL_MIN = 2;
export const PROMO_LABEL_MAX = 60;
export const PROMO_BENEFIT_MAX = 10;
export const SERIAL_BATCH_MAX = 2000;

/** 관리실이 고르는 날짜(YYYY-MM-DD) → 그날 한국 시간 23:59:59 */
export function endOfDayKst(day: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const iso = `${day}T23:59:59+09:00`;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  // 2월 30일처럼 없는 날은 다음 달로 넘어가 버린다 — 되돌려 맞춰 본다
  return new Date(t + 9 * 3600_000).toISOString().slice(0, 10) === day ? iso : null;
}

/** ISO → 관리실 날짜 칸 값(YYYY-MM-DD, 한국 시간) */
export function kstDayOf(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t + 9 * 3600_000).toISOString().slice(0, 10) : "";
}

export type PromoBenefitInput = {
  label: string;
  bookCredits: number;
  drawCredits: number;
  /** 전체 듣기 — 끝나는 날(고정) 또는 넣은 날부터 N일, 둘 중 하나 또는 없음 */
  libraryUntil: string | null;
  libraryDays: number | null;
  /** 코드를 넣을 수 있는 마지막 때 — null 이면 기한 없음 */
  endsAt: string | null;
};

export type PromoCreateInput =
  | ({ mode: "shared"; code: string } & PromoBenefitInput)
  | ({ mode: "serial"; count: number } & PromoBenefitInput);

function obj(body: unknown): Record<string, unknown> | null {
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

function intIn(v: unknown, min: number, max: number): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null;
}

function dayOrNull(v: unknown): { ok: true; iso: string | null } | { ok: false } {
  if (v === null || v === undefined || v === "") return { ok: true, iso: null };
  const iso = typeof v === "string" ? endOfDayKst(v) : null;
  return iso ? { ok: true, iso } : { ok: false };
}

/** 관리실 '만들기' 본문 — 공용 코드 또는 시리얼 묶음. DB 함수가 한 번 더 막는다. */
export function parsePromoCreateBody(body: unknown): Parsed<PromoCreateInput> {
  const b = obj(body);
  if (!b) return { ok: false, error: "요청 본문이 JSON 객체가 아니에요." };
  const label = typeof b.label === "string" ? b.label.trim() : "";
  if (label.length < PROMO_LABEL_MIN || label.length > PROMO_LABEL_MAX) {
    return { ok: false, error: `이름은 ${PROMO_LABEL_MIN}~${PROMO_LABEL_MAX}자로 적어 주세요.` };
  }
  const bookCredits = intIn(b.bookCredits ?? 0, 0, PROMO_BENEFIT_MAX);
  const drawCredits = intIn(b.drawCredits ?? 0, 0, PROMO_BENEFIT_MAX);
  if (bookCredits === null || drawCredits === null) return { ok: false, error: `동화·캐릭터는 0~${PROMO_BENEFIT_MAX}까지 줄 수 있어요.` };
  const until = dayOrNull(b.libraryUntil);
  if (!until.ok) return { ok: false, error: "전체 듣기 끝나는 날이 날짜가 아니에요." };
  const noDays = b.libraryDays === null || b.libraryDays === undefined || b.libraryDays === "";
  const libraryDays = noDays ? null : intIn(b.libraryDays, 1, 3650);
  if (!noDays && libraryDays === null) return { ok: false, error: "전체 듣기 일수는 1~3650일이에요." };
  if (until.iso && libraryDays) return { ok: false, error: "전체 듣기는 끝나는 날과 일수 중 하나만 정해 주세요." };
  if (!bookCredits && !drawCredits && !until.iso && !libraryDays) return { ok: false, error: "줄 혜택을 하나 이상 골라 주세요." };
  const ends = dayOrNull(b.endsAt);
  if (!ends.ok) return { ok: false, error: "코드를 넣을 수 있는 마지막 날이 날짜가 아니에요." };
  const benefit: PromoBenefitInput = { label, bookCredits, drawCredits, libraryUntil: until.iso, libraryDays, endsAt: ends.iso };

  if (b.mode === "shared") {
    const code = normalizePromoCode(b.code);
    if (!isPromoCodeShape(code)) return { ok: false, error: "코드는 영문·숫자 4~24자예요." };
    return { ok: true, value: { mode: "shared", code, ...benefit } };
  }
  if (b.mode === "serial") {
    const n = intIn(b.count, 1, SERIAL_BATCH_MAX);
    if (n === null) return { ok: false, error: `한 번에 1~${SERIAL_BATCH_MAX.toLocaleString("ko-KR")}장까지 만들 수 있어요.` };
    return { ok: true, value: { mode: "serial", count: n, ...benefit } };
  }
  return { ok: false, error: "공용 코드인지 시리얼 묶음인지 골라 주세요." };
}

export type PromoUpdateInput =
  | { mode: "shared"; id: number; active: boolean; endsAt: string | null; libraryUntil: string | null }
  | { mode: "serial"; label: string; active: boolean; endsAt: string | null };

/** 관리실 '고치기' 본문 — 켜고 끄기 · 넣을 수 있는 마지막 날 · (공용) 전체 듣기 끝나는 날 */
export function parsePromoUpdateBody(body: unknown): Parsed<PromoUpdateInput> {
  const b = obj(body);
  if (!b) return { ok: false, error: "요청 본문이 JSON 객체가 아니에요." };
  if (typeof b.active !== "boolean") return { ok: false, error: "켜짐·꺼짐을 골라 주세요." };
  const ends = dayOrNull(b.endsAt);
  if (!ends.ok) return { ok: false, error: "코드를 넣을 수 있는 마지막 날이 날짜가 아니에요." };
  if (b.mode === "shared") {
    const id = typeof b.id === "number" && Number.isSafeInteger(b.id) && b.id > 0 ? b.id : null;
    if (!id) return { ok: false, error: "코드 번호가 올바르지 않아요." };
    const until = dayOrNull(b.libraryUntil);
    if (!until.ok) return { ok: false, error: "전체 듣기 끝나는 날이 날짜가 아니에요." };
    return { ok: true, value: { mode: "shared", id, active: b.active, endsAt: ends.iso, libraryUntil: until.iso } };
  }
  if (b.mode === "serial") {
    const label = typeof b.label === "string" ? b.label.trim() : "";
    if (label.length < PROMO_LABEL_MIN || label.length > PROMO_LABEL_MAX) return { ok: false, error: "묶음 이름이 올바르지 않아요." };
    return { ok: true, value: { mode: "serial", label, active: b.active, endsAt: ends.iso } };
  }
  return { ok: false, error: "공용 코드인지 시리얼 묶음인지 골라 주세요." };
}

export type SharedPromo = {
  id: number;
  code: string;
  label: string;
  bookCredits: number;
  drawCredits: number;
  libraryUntil: string | null;
  libraryDays: number | null;
  endsAt: string | null;
  used: number;
  active: boolean;
  createdAt: string;
  by: string | null;
};

export type SerialBatch = {
  label: string;
  total: number;
  used: number;
  /** 켜진 장수 — 전부 켜짐/전부 꺼짐/섞임을 가른다 */
  active: number;
  bookCredits: number;
  drawCredits: number;
  libraryUntil: string | null;
  libraryDays: number | null;
  endsAt: string | null;
  createdAt: string;
  by: string | null;
};

export type PromoOverview = { schemaReady: boolean; shared: SharedPromo[]; batches: SerialBatch[] };

function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

function daysOrNull(v: unknown): number | null {
  const n = Number(v);
  return v !== null && v !== undefined && Number.isInteger(n) && n > 0 ? n : null;
}

/** master_promo_overview 의 답 — 모양이 틀린 줄은 버린다 */
export function promoOverviewOf(raw: unknown): Omit<PromoOverview, "schemaReady"> {
  const r = obj(raw) ?? {};
  const shared: SharedPromo[] = [];
  for (const x of Array.isArray(r.shared) ? r.shared : []) {
    const s = obj(x);
    const id = Number(s?.id);
    if (!s || !Number.isSafeInteger(id) || typeof s.code !== "string" || typeof s.created_at !== "string") continue;
    shared.push({
      id,
      code: s.code,
      label: str(s.label) ?? "",
      bookCredits: count(s.book_credits),
      drawCredits: count(s.draw_credits),
      libraryUntil: isoOrNull(s.library_until),
      libraryDays: daysOrNull(s.library_days),
      endsAt: isoOrNull(s.ends_at),
      used: count(s.used),
      active: s.active === true,
      createdAt: s.created_at,
      by: str(s.by),
    });
  }
  const batches: SerialBatch[] = [];
  for (const x of Array.isArray(r.batches) ? r.batches : []) {
    const s = obj(x);
    if (!s || typeof s.label !== "string" || typeof s.created_at !== "string") continue;
    batches.push({
      label: s.label,
      total: count(s.total),
      used: count(s.used),
      active: count(s.active),
      bookCredits: count(s.book_credits),
      drawCredits: count(s.draw_credits),
      libraryUntil: isoOrNull(s.library_until),
      libraryDays: daysOrNull(s.library_days),
      endsAt: isoOrNull(s.ends_at),
      createdAt: s.created_at,
      by: str(s.by),
    });
  }
  return { shared, batches };
}

export type SerialRow = { code: string; used: boolean; active: boolean; usedAt: string | null };

export function serialRowsOf(raw: unknown): SerialRow[] {
  const out: SerialRow[] = [];
  for (const x of Array.isArray(raw) ? raw : []) {
    const s = obj(x);
    if (!s || typeof s.code !== "string" || !isPromoCodeShape(s.code)) continue;
    out.push({ code: s.code, used: s.used === true, active: s.active === true, usedAt: isoOrNull(s.used_at) });
  }
  return out;
}

/** CSV 칸 — 쉼표·따옴표·줄바꿈이 있으면 따옴표로 싼다. 엑셀이 수식으로 읽는 첫 글자(= + - @)는 앞에 '를 붙인다. */
function csvCell(v: string): string {
  const safe = /^[=+\-@]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * 시리얼 묶음 내려받기 — 요기보 팀에 넘길 엑셀(CSV). 한글이 깨지지 않게 맨 앞에 BOM 을 붙인다.
 * 칸: 시리얼(4자리씩) · 바로 넣기 링크 · 사용 여부 · 사용한 날
 */
export function serialCsv(rows: readonly SerialRow[], origin: string): string {
  const head = ["시리얼", "링크", "사용", "사용한 날"];
  const lines = rows.map((r) =>
    [formatPromoCode(r.code, "serial"), promoLinkOf(origin, r.code), r.used ? "사용함" : r.active ? "" : "꺼짐", r.usedAt ? kstDayOf(r.usedAt) : ""]
      .map(csvCell)
      .join(","),
  );
  return `﻿${[head.join(","), ...lines].join("\r\n")}\r\n`;
}

/** 내려받을 파일 이름 — 묶음 이름에서 파일에 못 쓰는 글자를 뺀다 */
export function serialCsvName(label: string, day: string): string {
  const safe = label.replace(/[\\/:*?"<>|\s]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "시리얼";
  return `${safe}_${day}.csv`;
}

export type PromoLookup =
  | { found: false }
  | {
      found: true;
      code: string;
      kind: PromoKind;
      label: string;
      active: boolean;
      endsAt: string | null;
      used: number;
      maxUses: number | null;
      uses: { who: string | null; at: string }[];
    };

/** master_promo_lookup 의 답 */
export function promoLookupOf(raw: unknown): PromoLookup | null {
  const r = obj(raw);
  if (!r) return null;
  if (r.found !== true) return { found: false };
  if (typeof r.code !== "string" || (r.kind !== "shared" && r.kind !== "serial")) return null;
  const uses: { who: string | null; at: string }[] = [];
  for (const x of Array.isArray(r.uses) ? r.uses : []) {
    const u = obj(x);
    const at = isoOrNull(u?.at);
    if (u && at) uses.push({ who: str(u.who), at });
  }
  const max = Number(r.max_uses);
  return {
    found: true,
    code: r.code,
    kind: r.kind,
    label: str(r.label) ?? "",
    active: r.active === true,
    endsAt: isoOrNull(r.ends_at),
    used: count(r.used),
    maxUses: r.max_uses === null || r.max_uses === undefined || !Number.isInteger(max) ? null : max,
    uses,
  };
}

/** 혜택 요약(관리실 표 한 칸) — "동화 1 · 캐릭터 1 · 전체 듣기 30일" */
export function promoBenefitShort(b: {
  bookCredits: number;
  drawCredits: number;
  libraryUntil: string | null;
  libraryDays: number | null;
}): string {
  const parts: string[] = [];
  if (b.bookCredits) parts.push(`동화 ${b.bookCredits}권`);
  if (b.drawCredits) parts.push(`캐릭터 ${b.drawCredits}번`);
  if (b.libraryUntil) parts.push(`전체 듣기 ~${koDate(b.libraryUntil)}`);
  else if (b.libraryDays) parts.push(`전체 듣기 ${b.libraryDays}일`);
  return parts.join(" · ") || "—";
}

/* ── 혜택·이벤트 관리(관리실, 19번 SQL) — 이벤트 하나 = 공용 코드 하나 또는 시리얼 묶음 하나 ─────────────── */

/** 혜택을 받은 고객 한 줄(이벤트 고객 목록 · 회원 상세 '받은 혜택') */
export type PromoUser = {
  /** 회원 id — 탈퇴로 계정이 지워졌으면 null */
  id: string | null;
  who: string | null;
  at: string;
  code: string;
  kind: PromoKind;
  label: string;
  bookCredits: number;
  drawCredits: number;
  libraryUntil: string | null;
};

export type PromoUsersPage = { total: number; last7: number; rows: PromoUser[] };

function promoUserOf(raw: unknown): PromoUser | null {
  const r = obj(raw);
  const at = isoOrNull(r?.at);
  if (!r || !at || typeof r.code !== "string" || (r.kind !== "shared" && r.kind !== "serial")) return null;
  return {
    id: typeof r.id === "string" && r.id ? r.id : null,
    who: str(r.who),
    at,
    code: r.code,
    kind: r.kind,
    label: str(r.label) ?? "",
    bookCredits: count(r.book_credits),
    drawCredits: count(r.draw_credits),
    libraryUntil: isoOrNull(r.library_until),
  };
}

/** master_promo_users 의 답 */
export function promoUsersOf(raw: unknown): PromoUsersPage {
  const r = obj(raw) ?? {};
  const rows = (Array.isArray(r.rows) ? r.rows : []).map(promoUserOf).filter((x): x is PromoUser => x !== null);
  return { total: count(r.total), last7: count(r.last7), rows };
}

/** master_member_promos 의 답 */
export function memberPromosOf(raw: unknown): PromoUser[] {
  return (Array.isArray(raw) ? raw : []).map(promoUserOf).filter((x): x is PromoUser => x !== null);
}

export type PromoStats = { customers: number; redemptions: number; last7: number; today: number };

/** master_promo_stats 의 답 — 모양이 틀리면 null(19번 SQL 전) */
export function promoStatsOf(raw: unknown): PromoStats | null {
  const r = obj(raw);
  if (!r) return null;
  return { customers: count(r.customers), redemptions: count(r.redemptions), last7: count(r.last7), today: count(r.today) };
}

/** 관리실 목록 한 줄 — 공용 코드 하나 또는 시리얼 묶음 하나. key: "c:<코드 번호>" · "b:<묶음 이름>" */
export type PromoEvent =
  | { key: string; kind: "shared"; label: string; createdAt: string; shared: SharedPromo }
  | { key: string; kind: "serial"; label: string; createdAt: string; batch: SerialBatch };

/** 만든 때 최근 순으로 합친다 */
export function promoEventsOf(o: { shared: readonly SharedPromo[]; batches: readonly SerialBatch[] }): PromoEvent[] {
  const list: PromoEvent[] = [
    ...o.shared.map((s): PromoEvent => ({ key: `c:${s.id}`, kind: "shared", label: s.label, createdAt: s.createdAt, shared: s })),
    ...o.batches.map((b): PromoEvent => ({ key: `b:${b.label}`, kind: "serial", label: b.label, createdAt: b.createdAt, batch: b })),
  ];
  return list.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** 이벤트가 지금 켜져 있나 — 꺼졌거나 넣는 기한이 지났으면 아니다(시리얼은 한 장이라도 켜져 있으면) */
export function promoEventLive(e: PromoEvent, now: number): boolean {
  const endsAt = e.kind === "shared" ? e.shared.endsAt : e.batch.endsAt;
  const on = e.kind === "shared" ? e.shared.active : e.batch.active > 0;
  return on && (!endsAt || Date.parse(endsAt) > now);
}

export type PromoUsersFilter = { codeId: number | null; label: string | null };

/** 고객 목록 주소의 이벤트 칸 — "all" · "c:<번호>" · "b:<이름>" → 거르는 값(모양이 틀리면 null) */
export function promoEventFilter(key: string | null | undefined): PromoUsersFilter | null {
  if (key === "all") return { codeId: null, label: null };
  if (typeof key !== "string") return null;
  if (key.startsWith("c:")) {
    const id = Number(key.slice(2));
    return Number.isSafeInteger(id) && id > 0 ? { codeId: id, label: null } : null;
  }
  if (key.startsWith("b:")) {
    const label = key.slice(2).trim();
    return label.length >= PROMO_LABEL_MIN && label.length <= PROMO_LABEL_MAX ? { codeId: null, label } : null;
  }
  return null;
}

export const PROMO_USERS_PAGE = 50;
export const PROMO_USERS_MAX = 500;

/** 관리실 서버 — 고객 목록 주소 값 검사(?codeId · label · q · offset · limit) */
export function parsePromoUsersQuery(sp: URLSearchParams): Parsed<PromoUsersFilter & { q: string | null; limit: number; offset: number }> {
  const rawId = sp.get("codeId");
  const codeId = rawId === null || rawId === "" ? null : Number(rawId);
  if (codeId !== null && !(Number.isSafeInteger(codeId) && codeId > 0)) return { ok: false, error: "코드 번호가 올바르지 않아요." };
  const label = (sp.get("label") ?? "").trim() || null;
  if (label !== null && (label.length < PROMO_LABEL_MIN || label.length > PROMO_LABEL_MAX)) return { ok: false, error: "묶음 이름이 올바르지 않아요." };
  const q = (sp.get("q") ?? "").trim().slice(0, 60) || null;
  const limit = Number(sp.get("limit") ?? PROMO_USERS_PAGE);
  const offset = Number(sp.get("offset") ?? 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > PROMO_USERS_MAX) return { ok: false, error: `한 번에 1~${PROMO_USERS_MAX}줄까지 볼 수 있어요.` };
  if (!Number.isInteger(offset) || offset < 0 || offset > 1_000_000) return { ok: false, error: "몇 번째부터 볼지가 올바르지 않아요." };
  return { ok: true, value: { codeId, label, q, limit, offset } };
}

/** 관리실 '코드 한 장 켜고 끄기' 본문 */
export function parsePromoToggleBody(body: unknown): Parsed<{ code: string; active: boolean }> {
  const b = obj(body);
  if (!b) return { ok: false, error: "요청 본문이 JSON 객체가 아니에요." };
  const code = normalizePromoCode(b.code);
  if (!isPromoCodeShape(code)) return { ok: false, error: "코드는 영문·숫자 4~24자예요." };
  if (typeof b.active !== "boolean") return { ok: false, error: "켜짐·꺼짐을 골라 주세요." };
  return { ok: true, value: { code, active: b.active } };
}

/** 고객 목록 내려받기(CSV) — 아이디 · 코드 · 이벤트 · 받은 날 · 받은 혜택. 한글이 깨지지 않게 BOM. */
export function promoUsersCsv(rows: readonly PromoUser[]): string {
  const head = ["아이디", "코드", "혜택·이벤트", "받은 날", "받은 혜택"];
  const lines = rows.map((r) =>
    [r.who ?? "(탈퇴한 회원)", formatPromoCode(r.code, r.kind), r.label, kstDayOf(r.at), promoBenefitLines(r).join(" / ")].map(csvCell).join(","),
  );
  return `﻿${[head.join(","), ...lines].join("\r\n")}\r\n`;
}
