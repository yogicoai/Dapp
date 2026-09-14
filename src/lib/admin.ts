/**
 * 관리실(/admin) 판단 로직 — 화면과 서버 경로가 함께 쓰는 순수 함수.
 *
 * 왜 따로 두나: 사고 종류의 이름·급함 색, "어디까지 갔나" 단계, 한국 시각 표시, 오늘 현황,
 * 입력 검사는 틀리면 마스터가 엉뚱한 고객에게 환불하거나 급한 사고를 놓친다.
 * 화면 안에 섞어 두면 시험할 수 없어서, 여기 모아 admin.test.ts 로 시험한다.
 *
 * 상대 경로·type 가져오기만 쓴다 — 테스트 러너(node --test)가 @/ 별칭을 못 읽는다.
 * 사고 종류·단계의 뜻은 supabase-setup.sql 섹션 15·20 이 원본이다. 거기가 바뀌면 여기도 고친다.
 */

/* ── 사고 종류 ─────────────────────────────────────────────────────────── */

export type Severity = "crit" | "warn" | "info" | "ok" | "plain";

export type IncidentKind =
  | "paid_not_saved"
  | "unlinked_payment"
  | "failed"
  | "book_missing"
  | "stuck"
  | "paid_other_book"
  | "embedded_art"
  | "blank_pages"
  | "deleted_after_save";

/** rank 는 DB 의 urgency 칸과 같은 순서다(1 이 가장 급하다). */
export const KINDS: Record<IncidentKind, { label: string; sev: Severity; rank: number }> = {
  paid_not_saved: { label: "돈 냈는데 책 없음", sev: "crit", rank: 1 },
  unlinked_payment: { label: "기록 없는 결제", sev: "crit", rank: 2 },
  failed: { label: "실패", sev: "warn", rank: 3 },
  book_missing: { label: "저장됨인데 책 없음", sev: "warn", rank: 4 },
  stuck: { label: "멈춤", sev: "warn", rank: 5 },
  paid_other_book: { label: "결제 뒤 다른 책 저장", sev: "info", rank: 6 },
  embedded_art: { label: "그림 못 올림", sev: "info", rank: 7 },
  blank_pages: { label: "그림 빈 쪽", sev: "info", rank: 8 },
  deleted_after_save: { label: "저장 뒤 고객이 삭제", sev: "plain", rank: 9 },
};

export const KIND_ORDER = Object.keys(KINDS) as IncidentKind[];

export function isIncidentKind(v: unknown): v is IncidentKind {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(KINDS, v);
}

/** 모르는 종류(DB 가 새로 더한 것)도 버리지 않고 '기타'로 보여 준다 — 사고를 조용히 숨기지 않으려고. */
export function kindInfo(k: string): { label: string; sev: Severity; rank: number } {
  return isIncidentKind(k) ? KINDS[k] : { label: k || "기타", sev: "plain", rank: 99 };
}

/** 한 줄에 여러 종류가 붙으면 가장 급한 것 하나로 줄 색을 정한다. */
export function topKind(kinds: readonly string[]): string | null {
  if (!kinds.length) return null;
  return [...kinds].sort((a, b) => kindInfo(a).rank - kindInfo(b).rank)[0];
}

/** 줄 왼쪽 띠 색. 처리 끝난 줄은 초록 — 급한 색이 남아 있으면 또 처리하려 든다. */
export function rowSeverity(kinds: readonly string[], resolved: boolean): Severity {
  if (resolved) return "ok";
  const t = topKind(kinds);
  return t ? kindInfo(t).sev : "plain";
}

/** 급한 순(종류) → 최근 순. DB 도 같은 순서로 주지만, 화면에서 거르고 합친 뒤에도 순서를 지킨다. */
export function sortIncidents<T extends { kinds: readonly string[]; updated_at: string | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ra = kindInfo(topKind(a.kinds) ?? "").rank;
    const rb = kindInfo(topKind(b.kinds) ?? "").rank;
    if (ra !== rb) return ra - rb;
    return Date.parse(b.updated_at ?? "") - Date.parse(a.updated_at ?? "") || 0;
  });
}

/** 종류 칩에 붙는 개수. 알려진 순서대로, 0건인 종류는 뺀다. */
export function countKinds(rows: readonly { kinds: readonly string[] }[]): { kind: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) for (const k of new Set(r.kinds)) counts.set(k, (counts.get(k) ?? 0) + 1);
  const known = KIND_ORDER.filter((k) => counts.has(k));
  const unknown = [...counts.keys()].filter((k) => !isIncidentKind(k));
  return [...known, ...unknown].map((kind) => ({ kind, count: counts.get(kind) ?? 0 }));
}

/* ── 기록 상태 · 단계 ─────────────────────────────────────────────────── */

export const STATUS_LABEL: Record<string, string> = {
  writing: "대본 쓰는 중",
  script: "대본 끝",
  drawing: "그리는 중",
  uploading: "올리는 중",
  saving: "저장 중",
  saved: "저장됨",
  failed: "실패",
  cancelled: "취소",
  restored: "되살림",
};

export function statusLabel(s: string | null | undefined): string {
  if (!s) return "—";
  return STATUS_LABEL[s] ?? s;
}

export const STAGES = [
  { key: "script", label: "대본" },
  { key: "drawing", label: "그림" },
  { key: "uploading", label: "올리기" },
  { key: "saving", label: "저장" },
  { key: "saved", label: "책장" },
] as const;

export type StageState = "done" | "fail" | "stuck" | "";

export type StageInput = {
  status: string | null;
  kinds: readonly string[];
  bookExists: boolean;
  /** 그림 값 장부 id 가 붙었나 — 붙었으면 그림은 끝나고 올리기·저장으로 넘어간 것이다. */
  illustrationPaid: boolean;
  drawn: number;
  /** 실패 이유 목록의 stage 들(draw·upload·sheet·save). */
  failureStages: readonly string[];
};

/**
 * 어디까지 갔고 어디서 멈췄나 — 다섯 칸(대본→그림→올리기→저장→책장)의 상태.
 *
 * 앱이 적은 상태만 믿지 않는다: '저장됨'이어도 책이 없으면(book_missing) 책장 칸을 실패로 칠한다.
 * 실패 기록은 어디서 실패했는지 적혀 있지 않아서 흔적으로 짐작한다 —
 * 저장 실패 이유가 있거나 그림 값을 냈으면 저장에서, 그린 장이 있으면 그림에서, 아니면 대본에서.
 */
export function stageStates(j: StageInput): StageState[] {
  if (!j.status) return STAGES.map(() => "");
  const fs = new Set(j.failureStages);
  let reached: number; // 끝난 칸 수
  switch (j.status) {
    case "writing":
      reached = 0;
      break;
    case "script": // 대본 칸만 끝났고 그림은 아직 시작 전
    case "drawing":
      reached = 1;
      break;
    case "uploading":
      reached = 2;
      break;
    case "saving":
      reached = 3;
      break;
    case "saved":
    case "restored":
      reached = j.bookExists ? 5 : 4;
      break;
    default: // failed · cancelled · 모르는 상태
      if (fs.has("save") || j.illustrationPaid) reached = 3;
      else if (j.drawn > 0 || fs.has("draw") || fs.has("sheet") || fs.has("upload")) reached = 1;
      else reached = 0;
  }
  let bad: number | null = null;
  let badKind: StageState = "fail";
  if (j.status === "failed") bad = Math.min(reached, 4);
  if (j.kinds.includes("book_missing")) bad = 4;
  if (j.kinds.includes("stuck")) {
    bad = Math.min(reached, 4);
    badKind = "stuck";
  }
  return STAGES.map((_, i) => (i === bad ? badKind : i < reached ? "done" : ""));
}

/* ── 원고 쪽 미리보기 ─────────────────────────────────────────────────── */

export type PageArt = "ok" | "blank" | "embedded" | "external";
export type PagePreview = { text: string; art: PageArt; image: string | null };

/** 주소가 믿는 그림 저장소(앞부분 목록) 아래에 있나. 'https://a.com' 이 'https://a.com.evil' 에 맞지 않게 '/' 까지 본다. */
export function isTrustedImageUrl(url: string, trustedBases: readonly (string | null | undefined)[]): boolean {
  for (const b of trustedBases) {
    const base = (b ?? "").trim().replace(/\/+$/, "");
    if (!/^https?:\/\/[^/]+/i.test(base)) continue;
    if (url.toLowerCase().startsWith(`${base.toLowerCase()}/`)) return true;
  }
  return false;
}

/**
 * 원고·책의 쪽 목록을 화면에 보낼 모양으로 줄인다 — 본문 앞부분과 그림 상태만.
 *
 * 왜 서버에서 줄이나: 책에 base64 그림이 박혀 있으면(그림 못 올림) 쪽 하나가 수 MB 다.
 * 그대로 내려보내면 관리실이 느려지고, 그림 주소가 아닌 값을 <img> 에 넣게 된다.
 *
 * 그림 주소는 우리 저장소(trustedBases — cafe24 공개 주소 등) 아래 것만 넘긴다.
 * 원고·책 칸은 회원이 직접 쓸 수 있어서, 아무 주소나 넘기면 마스터가 상세를 여는 순간
 * 마스터 브라우저가 남의 서버를 불러 IP·열람 시각이 새어 나간다(추적 픽셀). 그런 쪽은 '바깥 주소'로만 표시한다.
 */
export function previewPages(
  pages: unknown,
  trustedBases: readonly (string | null | undefined)[] = [],
  maxText = 120,
): PagePreview[] {
  if (!Array.isArray(pages)) return [];
  return pages.slice(0, 40).map((p) => {
    const o = (p && typeof p === "object" ? p : {}) as { text?: unknown; image?: unknown };
    const text = typeof o.text === "string" ? o.text.trim().slice(0, maxText) : "";
    const img = typeof o.image === "string" ? o.image.trim() : "";
    if (/^data:/i.test(img)) return { text, art: "embedded" as const, image: null };
    if (/^https?:\/\//i.test(img)) {
      if (img.length <= 1000 && isTrustedImageUrl(img, trustedBases)) return { text, art: "ok" as const, image: img };
      return { text, art: "external" as const, image: null };
    }
    return { text, art: "blank" as const, image: null };
  });
}

/* ── 실패 이유 ───────────────────────────────────────────────────────── */

const FAIL_STAGE_LABEL: Record<string, string> = {
  draw: "그리기",
  upload: "올리기",
  sheet: "인물·장소 그림",
  save: "저장",
};

export type FailureLine = { where: string; stage: string; reason: string };

/**
 * failures 칸(jsonb 목록)을 사람이 읽는 줄로.
 * 앱이 적은 모양 {page, stage, reason} 과 DB 지킴이가 적은 모양 {stage, reason, pages[], count} 둘 다 받는다.
 */
export function failureLines(failures: unknown): FailureLine[] {
  if (!Array.isArray(failures)) return [];
  return failures.slice(-60).map((f) => {
    const o = (f && typeof f === "object" ? f : {}) as {
      page?: unknown;
      pages?: unknown;
      stage?: unknown;
      reason?: unknown;
    };
    const stage = typeof o.stage === "string" ? o.stage : "";
    let where = "책";
    if (typeof o.page === "number" && Number.isFinite(o.page)) where = `${o.page}쪽`;
    else if (Array.isArray(o.pages) && o.pages.length)
      where = `${o.pages.filter((n) => typeof n === "number").slice(0, 8).join("·")}쪽`;
    else if (stage === "sheet") where = "시트";
    return {
      where,
      stage: FAIL_STAGE_LABEL[stage] ?? (stage || "—"),
      reason: typeof o.reason === "string" ? o.reason.slice(0, 300) : "",
    };
  });
}

export function failureStages(failures: unknown): string[] {
  if (!Array.isArray(failures)) return [];
  return failures
    .map((f) => (f && typeof f === "object" ? (f as { stage?: unknown }).stage : null))
    .filter((s): s is string => typeof s === "string");
}

/* ── 한국 시각 ───────────────────────────────────────────────────────── */

const KST_MS = 9 * 60 * 60 * 1000; // 한국은 서머타임이 없어 늘 +9시간이다

function kstParts(ms: number) {
  const d = new Date(ms + KST_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), hh: d.getUTCHours(), mm: d.getUTCMinutes() };
}

/** 한국 날짜로 오늘 0시가 몇 시(UTC)인가 — "오늘 만든 동화" 같은 집계의 시작점. */
export function kstDayStart(now: Date | number): Date {
  const ms = typeof now === "number" ? now : now.getTime();
  const shifted = ms + KST_MS;
  const dayStart = shifted - (((shifted % 86400000) + 86400000) % 86400000);
  return new Date(dayStart - KST_MS);
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * '방금 · 18분 전 · 3시간 전 · 어제 21:14 · 9월 11일 · 2025년 12월 3일'.
 *
 * 서버(Vercel)는 UTC 로 돈다 — toLocaleString 에 맡기면 서버와 브라우저가 다르게 찍는다.
 * 그래서 +9시간을 직접 더해 한국 날짜로 센다.
 */
export function formatWhenKo(iso: string | null | undefined, now: Date | number = Date.now()): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const n = typeof now === "number" ? now : now.getTime();
  const diffMin = Math.floor((n - t) / 60000);
  const today = kstDayStart(n).getTime();
  // 마스터 PC 시계가 서버보다 늦으면 방금 찍힌 시각이 '미래'가 된다 — 날짜로 떨어져 오래된 사고처럼 보이지 않게 '방금'으로 둔다.
  if (diffMin < 1 || t > n) return "방금";
  if (t >= today && t <= n) {
    if (diffMin < 60) return `${diffMin}분 전`;
    return `${Math.floor(diffMin / 60)}시간 전`;
  }
  const p = kstParts(t);
  if (t >= today - 86400000 && t < today) return `어제 ${pad2(p.hh)}:${pad2(p.mm)}`;
  if (p.y === kstParts(n).y) return `${p.m}월 ${p.d}일`;
  return `${p.y}년 ${p.m}월 ${p.d}일`;
}

/** 가입일 같은 날짜만 — '2026-08-21' (한국 날짜). */
export function formatDateKo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const p = kstParts(t);
  return `${p.y}-${pad2(p.m)}-${pad2(p.d)}`;
}

/** 마지막 움직임에서 몇 분 지났나(음수는 0). */
export function minutesSince(iso: string | null | undefined, now: Date | number = Date.now()): number {
  const t = Date.parse(iso ?? "");
  if (!Number.isFinite(t)) return 0;
  const n = typeof now === "number" ? now : now.getTime();
  return Math.max(0, Math.floor((n - t) / 60000));
}

/* ── 오늘 현황 ───────────────────────────────────────────────────────── */

export type TodaySummary = {
  booksToday: number;
  paidNotSaved: number;
  stuck: number;
  refundedTokens: number;
};

/**
 * 오늘 현황 한 줄.
 *  · 돈 냈는데 책 없음 · 멈춘 만들기 — 처리 끝 안 된 사고만 센다(오늘 생긴 것만이 아니라 지금 열린 것 전부).
 *    어제 생긴 '돈 냈는데 책 없음'이 오늘 0건으로 보이면 안 되기 때문이다.
 *  · 오늘 환불 — 한국 날짜로 오늘 되돌린 장부 줄의 토큰 합. 앱이 실패 직후 스스로 되돌린 것도 들어간다
 *    (장부의 처리 마스터 칸은 표로 못 읽는다).
 */
export function summarizeToday(input: {
  booksToday: number;
  incidents: readonly { kinds: readonly string[]; resolved_at: string | null }[];
  refunds: readonly { amount: number | null; refunded_at: string | null }[];
  now: Date | number;
}): TodaySummary {
  const start = kstDayStart(input.now).getTime();
  const open = input.incidents.filter((r) => !r.resolved_at);
  return {
    booksToday: Math.max(0, input.booksToday | 0),
    paidNotSaved: open.filter((r) => r.kinds.includes("paid_not_saved")).length,
    stuck: open.filter((r) => r.kinds.includes("stuck")).length,
    refundedTokens: input.refunds
      .filter((r) => Date.parse(r.refunded_at ?? "") >= start)
      .reduce((sum, r) => sum + (Number.isFinite(r.amount) ? Math.max(0, r.amount as number) : 0), 0),
  };
}

/** 탭 배지 — 열린 사고 수. '저장 뒤 고객이 삭제'만 있는 줄은 할 일이 아니라 세지 않는다. */
export function openIncidentCount(rows: readonly { kinds: readonly string[]; resolved_at: string | null }[]): number {
  return rows.filter((r) => !r.resolved_at && r.kinds.some((k) => k !== "deleted_after_save")).length;
}

/* ── 되살리기 ────────────────────────────────────────────────────────── */

const LIVE_STATUSES = new Set(["writing", "drawing", "uploading", "saving"]);

export type RestoreCheck = {
  /** 눌러도 DB 가 반드시 거절하는 경우 — 버튼을 끈다. */
  blocked: string | null;
  /** 되살릴 수는 있지만 한 번 더 확인할 경우 — 버튼은 두고 이유 한 줄을 보여 준다. */
  warn: string | null;
};

/**
 * 되살리기 버튼 옆 이유 한 줄. DB(master_restore_book)의 거절 조건을 미리 알려 준다.
 * 최종 판단은 DB 가 한다 — 여기서 통과해도 거절될 수 있고, 그 오류문을 그대로 보여 준다.
 */
export function restoreCheck(j: {
  jobId: string | null;
  status: string | null;
  updatedAt: string | null;
  /** 처리 끝 시각. 처리 끝 표시도 DB 지킴이가 updated_at 을 새로 찍어서, 멈춘 시각을 가릴 수 있다. */
  resolvedAt?: string | null;
  bookId: string | null;
  bookExists: boolean;
  title: string | null;
  pages: readonly { text: string }[];
  now: Date | number;
}): RestoreCheck {
  if (!j.jobId) return { blocked: "만들기 기록이 없는 결제라 되살릴 원고가 없어요. 환불하거나 처리 끝으로 내려요.", warn: null };
  if (!j.pages.length || !(j.title ?? "").trim())
    return { blocked: "원고가 없어요 — 대본 전에 멈췄거나 90일이 지나 비워졌어요.", warn: null };
  if (j.pages.some((p) => !p.text.trim())) return { blocked: "원고에 본문이 빈 쪽이 있어 되살릴 수 없어요.", warn: null };
  if (j.bookId && !/^my-[A-Za-z0-9_-]{1,77}$/.test(j.bookId))
    return { blocked: `책 id(${j.bookId})가 my- 로 시작하지 않아 되살릴 수 없어요.`, warn: null };
  if (j.status && LIVE_STATUSES.has(j.status)) {
    const m = minutesSince(j.updatedAt, j.now);
    if (m < 30) {
      // book_jobs_guard 는 모든 update 에 updated_at 을 새로 찍는다 — 처리 끝(master_resolve_job)도 마찬가지다.
      // 두 시각이 거의 같으면 '방금 움직임'은 만들기가 아니라 처리 끝 표시다. 마스터가 헷갈리지 않게 까닭을 붙인다.
      const u = Date.parse(j.updatedAt ?? "");
      const r = Date.parse(j.resolvedAt ?? "");
      if (Number.isFinite(u) && Number.isFinite(r) && Math.abs(u - r) < 2 * 60000)
        return {
          blocked: null,
          warn: `마지막 움직임이 ${m}분 전인데, 처리 끝 표시 때문에 시각이 새로 찍힌 거예요. 실제로는 더 오래 멈췄을 수 있어요 — DB 가 한 번 더 물으면 강제로 진행하세요.`,
        };
      return { blocked: null, warn: `멈춘 지 30분이 안 됐어요(지금 ${m}분). 아직 만드는 중일 수 있어 한 번 더 물어요.` };
    }
  }
  if (j.bookExists) return { blocked: null, warn: "책이 이미 책장에 있어요. 빈 쪽만 다시 그리려면 책을 여세요 — 되살리면 덮어써요." };
  return { blocked: null, warn: null };
}

/** DB 거절 문구로 어떤 확인을 한 번 더 물을지 가린다. 문구는 supabase-setup.sql 19번 그대로다. */
export function restoreConflict(message: string | null | undefined): "exists" | "in_progress" | null {
  const m = String(message ?? "");
  if (m.includes("이미 책이 있습니다")) return "exists";
  if (m.includes("아직 진행 중인 기록")) return "in_progress";
  return null;
}

/* ── 입력 검사 ───────────────────────────────────────────────────────── */

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/** 환불 사유 — 2~500자. DB 도 2자 미만을 거절하고 500자로 자른다. 잘리기 전에 여기서 알려 준다. */
export function parseRefundNote(v: unknown): Parsed<string> {
  const s = typeof v === "string" ? v.trim() : "";
  if (s.length < 2) return { ok: false, error: "환불 사유를 2자 이상 적어 주세요." };
  if (s.length > 500) return { ok: false, error: "환불 사유는 500자까지 적을 수 있어요." };
  return { ok: true, value: s };
}

/** 처리 끝 메모 — 선택. 비면 null. */
export function parseOptionalNote(v: unknown, max = 500): Parsed<string | null> {
  if (v === undefined || v === null) return { ok: true, value: null };
  if (typeof v !== "string") return { ok: false, error: "메모가 글자가 아니에요." };
  const s = v.trim();
  if (s.length > max) return { ok: false, error: `메모는 ${max}자까지 적을 수 있어요.` };
  return { ok: true, value: s || null };
}

/**
 * 충전 토큰 수 — 1~1000 정수.
 * DB(grant_tokens)는 ±100000 까지 받지만, 관리실에서 0 하나 더 눌러 10만 토큰이 나가는 실수를 막으려고 좁힌다.
 * 빼기(음수)는 받지 않는다 — 잔액을 깎는 일은 관리실에서 하지 않는다.
 */
export function parseGrantAmount(v: unknown): Parsed<number> {
  // 글자로 오면 숫자 글자만 받는다 — Number("1e3") 처럼 뜻밖의 값이 통과하지 않게.
  const n = typeof v === "string" ? (/^\s*\d{1,7}\s*$/.test(v) ? Number(v) : NaN) : v;
  if (typeof n !== "number" || !Number.isInteger(n)) return { ok: false, error: "토큰 수는 정수로 적어 주세요." };
  if (n < 1 || n > 1000) return { ok: false, error: "토큰은 한 번에 1~1000개까지 넣을 수 있어요." };
  return { ok: true, value: n };
}

/** 고객 아이디 — 앞뒤 공백을 떼고 1~40자. 가입은 20자까지지만 구글 가입은 이메일 앞부분+숫자라 넉넉히 둔다. */
export function parseUsername(v: unknown): Parsed<string> {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return { ok: false, error: "고객 아이디를 적어 주세요." };
  if (s.length > 40) return { ok: false, error: "아이디가 너무 길어요(40자까지)." };
  if (/[\s,()]/.test(s)) return { ok: false, error: "아이디에 공백이나 괄호는 들어갈 수 없어요." };
  return { ok: true, value: s };
}

/** ilike 로 '대소문자만 무시한 정확히 같은 아이디'를 찾으려면 % _ \ 를 글자로 바꿔야 한다. */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * DB 오류 코드 → HTTP 상태. 오류문(한국어)은 그대로 화면에 보낸다.
 * 42501 권한 · 22023 값이 틀림 · 23505 이미 있음 · 55000 진행 중 · 그 밖 500.
 */
export function httpStatusForDb(code: string | null | undefined): number {
  switch (String(code ?? "")) {
    case "42501":
      return 403;
    case "22023":
    case "22P02":
      return 400;
    case "23505":
    case "55000":
      return 409;
    default:
      return 500;
  }
}

/* ── 서버 경로 ↔ 화면이 주고받는 모양 ─────────────────────────────────── */

/** master_book_incidents 한 줄(supabase-setup.sql 20번의 반환 칸 그대로). */
export type IncidentRow = {
  job_id: string | null;
  member: string;
  username: string | null;
  book_id: string | null;
  status: string | null;
  kinds: string[];
  urgency: number;
  page_count: number | null;
  drawn: number | null;
  draw_failed: number | null;
  upload_failed: number | null;
  blank_pages: number;
  embedded_pages: number;
  book_exists: boolean;
  saved_at: string | null;
  book_seen_at: string | null;
  book_deleted_at: string | null;
  book_deleted_by: string | null;
  books_saved_after_payment: number;
  story_entry: string | null;
  story_amount: number | null;
  story_refunded_at: string | null;
  story_refunded_by: string | null;
  story_refund_note: string | null;
  illustration_entry: string | null;
  illustration_amount: number | null;
  illustration_paid_at: string | null;
  illustration_refunded_at: string | null;
  illustration_refunded_by: string | null;
  illustration_refund_note: string | null;
  error: string | null;
  failures: unknown;
  created_at: string | null;
  updated_at: string | null;
  restored_at: string | null;
  restored_by: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  master_note: string | null;
  total_count: number;
};

/** 사고 목록 한 줄 — 함수가 안 주는 제목을 서버가 붙인다. 원고·실패 목록은 상세에서만 준다. */
export type IncidentListRow = Omit<IncidentRow, "failures" | "master_note" | "story_refund_note" | "illustration_refund_note"> & {
  title: string | null;
};

export type IncidentsResponse = {
  me: string;
  now: string;
  incidents: IncidentListRow[];
  /** 전체 줄 수(잘리기 전). incidents 보다 크면 목록이 잘린 것이다. */
  total: number;
  openCount: number;
  today: TodaySummary;
};

export type Payment = {
  entry: string;
  amount: number | null;
  refundedAt: string | null;
  /** 처리한 마스터 아이디. byKnown 이 true 인데 비었으면 앱이 실패 직후 스스로 되돌린 것이다. */
  refundedBy: string | null;
  note: string | null;
  /**
   * 처리자·사유를 알 수 있었나. 이 두 칸은 표로 못 읽고 사고 목록 함수로만 읽히는데,
   * 그 함수는 환불 뒤 사고가 아니게 된 줄(환불된 기록 없는 결제 등)을 안 돌려준다.
   * 모를 때 '앱이 되돌림'이라고 단정하면 마스터 환불이 앱 환불로 보인다.
   */
  byKnown: boolean;
};

/** 결제 줄의 환불 표시 한 마디. */
export function refundLabel(p: Pick<Payment, "refundedAt" | "refundedBy" | "byKnown">): string {
  if (!p.refundedAt) return "환불 안 됨";
  if (p.refundedBy) return `환불함 · ${p.refundedBy}`;
  return p.byKnown ? "환불함 · 앱이 되돌림" : "환불함 · 처리자 확인 불가";
}

/**
 * 방금 이 화면에서 한 환불을 다시 읽은 결제에 덧댄다.
 * 사고 목록 함수가 그 줄을 더 안 주면 사유·처리자를 DB 에서 다시 읽을 길이 없어서,
 * 이 창을 연 동안만 마스터가 적은 값을 들고 있는다(새로 고침하면 사라진다 — 그때는 '확인 불가'로 보인다).
 */
export function withRecentRefund(
  p: Payment | null,
  recent: ReadonlyMap<string, { by: string; note: string }>,
): Payment | null {
  if (!p || p.byKnown || !p.refundedAt) return p;
  const r = recent.get(p.entry);
  return r ? { ...p, refundedBy: r.by, note: r.note, byKnown: true } : p;
}

export type JobDetail = {
  jobId: string | null;
  /** 기록 없는 결제일 때 그 장부 id. */
  entryId: string | null;
  member: string;
  username: string | null;
  tokens: number | null;
  bookId: string | null;
  bookExists: boolean;
  bookHidden: boolean;
  status: string | null;
  title: string | null;
  kinds: string[];
  error: string | null;
  failures: FailureLine[];
  failureStages: string[];
  pageCount: number | null;
  drawn: number;
  drawFailed: number;
  uploadFailed: number;
  otherBooks: number;
  /** 화면에 보이는 쪽 — 책이 있으면 책, 없으면 원고. */
  pages: PagePreview[];
  pagesFrom: "book" | "manuscript";
  /** 되살리기 재료(원고)의 쪽. 되살리기 가능 여부를 이걸로 본다. */
  manuscriptPages: PagePreview[];
  manuscriptTitle: string | null;
  story: Payment | null;
  illustration: Payment | null;
  createdAt: string | null;
  updatedAt: string | null;
  restoredAt: string | null;
  restoredBy: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  masterNote: string | null;
};

export type CustomerJob = {
  jobId: string | null;
  entryId: string | null;
  title: string | null;
  status: string | null;
  pageCount: number | null;
  drawn: number;
  payments: { amount: number | null; refunded: boolean }[];
  kinds: string[];
  resolvedAt: string | null;
  createdAt: string | null;
};

export type CustomerResponse = {
  profile: { id: string; username: string; tokens: number; createdAt: string | null; isMaster: boolean };
  booksCount: number;
  openIncidents: number;
  jobs: CustomerJob[];
  truncated: boolean;
};
