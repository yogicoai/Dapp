/**
 * 약관·개인정보처리방침·환불 안내 — 관리실에서 게시하고 /terms · /privacy · /refund 가 보여 주는 문서.
 *
 * 사장님 말(2026-09-30): "이용약관 (준비 중) · 개인정보처리방침 (준비 중) — 이부분도 어드민 페이지에서
 * 등록하게 해서 관리되게 하자". 그래서 문서를 코드가 아니라 DB(app_legal_docs)에 한 판씩 쌓는다.
 *
 * 왜 HTML 이 아니라 '마크다운 비슷한 글'인가: 관리실에서 적은 글이 고객 화면에 그대로 뜬다.
 * HTML 을 받으면 스크립트·가짜 링크가 섞여 들어올 수 있다. 그래서 글을 '덩어리(제목·문단·목록)'로만
 * 나누고, 화면은 그 덩어리를 글자로만 그린다 — 링크도, 굵은 글씨도, HTML 도 없다.
 *
 * 한 판은 게시하면 고치지 않는다(DB 가 막는다). 바꾸려면 새 판을 시행일과 함께 게시한다 —
 * 약관은 "언제부터 무엇이 적용됐나"를 나중에 보여 줄 수 있어야 하기 때문이다.
 *
 * 상대 경로·type 가져오기만 쓴다 — 테스트 러너(node --test)가 @/ 별칭을 못 읽는다.
 */
import type { Parsed } from "./admin.ts";

/* ── 문서 종류 ─────────────────────────────────────────────────────────── */

export type LegalKind = "terms" | "privacy" | "refund";
export const LEGAL_KINDS: readonly LegalKind[] = ["terms", "privacy", "refund"];

export const LEGAL_DOCS: Record<LegalKind, { title: string; path: "/terms" | "/privacy" | "/refund" }> = {
  terms: { title: "이용약관", path: "/terms" },
  privacy: { title: "개인정보처리방침", path: "/privacy" },
  refund: { title: "환불·청약철회 안내", path: "/refund" },
};

export function isLegalKind(v: unknown): v is LegalKind {
  return typeof v === "string" && (LEGAL_KINDS as readonly string[]).includes(v);
}

/** DB(app_legal_docs · master_publish_legal_doc)의 한도와 같다. 바꾸면 SQL 도 함께 고친다. */
export const LEGAL_TITLE_MAX = 100;
export const LEGAL_BODY_MAX = 60_000;
export const LEGAL_NOTE_MAX = 500;
/** 덩어리 수 상한 — 이상한 글(빈 줄만 수만 줄)이 화면을 멈추지 않게. */
export const LEGAL_MAX_BLOCKS = 3000;
/** 시행일은 오늘부터 이 날수 안에서만 고른다(DB 도 같은 선에서 막는다). */
export const LEGAL_MAX_DAYS_AHEAD = 366;
/** 이용약관·개인정보처리방침은 보통 시행 7일 전에 알린다 — 그보다 가까우면 부드럽게 알려 준다. */
export const LEGAL_NOTICE_DAYS = 7;

/* ── 글 → 덩어리 ───────────────────────────────────────────────────────── */

export type LegalBlock =
  | { t: "h2" | "h3" | "p"; text: string }
  | { t: "ul"; items: string[] }
  | { t: "ol"; items: string[]; start?: number }
  | { t: "hr" };

const H2 = /^#{1,2}\s+(\S.*)$/;
const H3 = /^#{3,6}\s+(\S.*)$/;
const HR = /^-{3,}$/;
const UL = /^[-*·]\s+(\S.*)$/;
const OL = /^(\d{1,3})[.)]\s+(\S.*)$/;

/**
 * 관리실에서 적은 글을 덩어리로 나눈다. 쓰는 법(관리실 도움말과 같다):
 *   "# " · "## " 큰 제목(페이지 맨 위 제목은 문서 이름이라 본문 제목은 한 단계 아래로 그린다) · "### " 작은 제목
 *   "- " · "* " · "· " 목록 · "1. " · "1) " 번호 목록(번호는 화면이 다시 매긴다, 첫 번호가 1이 아니면 거기서 시작)
 *   "---" 가로줄 · 빈 줄 = 문단 나눔 · 이어진 줄은 한 문단 안에서 줄바꿈으로 남는다
 * 그 밖의 모든 글자는 **글자 그대로**다 — <script> 도 [링크](주소) 도 화면에 글자로 보일 뿐이다.
 * 목록 아래 들여 쓴 줄은 그 항목에 이어 붙인다(긴 항목을 줄바꿈해 적을 때).
 */
export function parseLegalMarkdown(src: string): LegalBlock[] {
  const text = String(src ?? "")
    .replace(/\r\n?/g, "\n")
    .slice(0, LEGAL_BODY_MAX);
  const out: LegalBlock[] = [];
  let para: string[] = [];
  let list: { t: "ul"; items: string[] } | { t: "ol"; items: string[]; start?: number } | null = null;

  const push = (b: LegalBlock) => {
    if (out.length < LEGAL_MAX_BLOCKS) out.push(b);
  };
  const flushPara = () => {
    if (para.length) push({ t: "p", text: para.join("\n") });
    para = [];
  };
  const flushList = () => {
    if (list && list.items.length) push(list);
    list = null;
  };

  for (const raw of text.split("\n")) {
    if (out.length >= LEGAL_MAX_BLOCKS) break;
    const line = raw.trim();
    if (!line) {
      flushPara();
      flushList();
      continue;
    }
    // 목록 항목 아래 들여 쓴 줄 → 그 항목에 이어 붙인다
    if (list && /^\s/.test(raw) && !UL.test(line) && !OL.test(line)) {
      list.items[list.items.length - 1] += `\n${line}`;
      continue;
    }
    let m: RegExpExecArray | null;
    if ((m = H3.exec(line))) {
      flushPara();
      flushList();
      push({ t: "h3", text: m[1].trim() });
    } else if ((m = H2.exec(line))) {
      flushPara();
      flushList();
      push({ t: "h2", text: m[1].trim() });
    } else if (HR.test(line)) {
      flushPara();
      flushList();
      push({ t: "hr" });
    } else if ((m = UL.exec(line))) {
      flushPara();
      if (!list || list.t !== "ul") {
        flushList();
        list = { t: "ul", items: [] };
      }
      list.items.push(m[1].trim());
    } else if ((m = OL.exec(line))) {
      flushPara();
      if (!list || list.t !== "ol") {
        flushList();
        const n = Number(m[1]);
        list = n !== 1 ? { t: "ol", items: [], start: n } : { t: "ol", items: [] };
      }
      list.items.push(m[2].trim());
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return out;
}

/** 낱말 뒤 '을/를' — 받침이 있으면 을. "이용약관을" · "환불·청약철회 안내를". */
export function withObjectParticle(word: string): string {
  const w = String(word ?? "");
  const code = w.charCodeAt(w.length - 1);
  if (!(code >= 0xac00 && code <= 0xd7a3)) return `${w}을(를)`;
  return `${w}${(code - 0xac00) % 28 === 0 ? "를" : "을"}`;
}

/* ── 날짜(한국) ────────────────────────────────────────────────────────── */

const KST_MS = 9 * 60 * 60 * 1000; // 한국은 서머타임이 없어 늘 +9시간
const DAY_MS = 86_400_000;
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad2 = (n: number) => String(n).padStart(2, "0");

/** 한국 날짜 오늘 'YYYY-MM-DD'. 시행일 비교는 모두 이 글자로 한다(글자 순서 = 날짜 순서). */
export function kstToday(now: Date | number): string {
  const d = new Date((typeof now === "number" ? now : now.getTime()) + KST_MS);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** 'YYYY-MM-DD' 이고 달력에 있는 날인가(2월 30일 같은 날은 아니다). */
export function isValidYmd(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = YMD.exec(v);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/** 날짜 글자에 n 일을 더한다. */
export function addDaysYmd(ymd: string, n: number): string {
  const m = YMD.exec(ymd);
  if (!m) return ymd;
  const t = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + n * DAY_MS);
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}

/** 두 날짜 사이 날수(b − a). 못 읽으면 NaN. */
export function daysBetweenYmd(a: string, b: string): number {
  const ma = YMD.exec(a);
  const mb = YMD.exec(b);
  if (!ma || !mb) return NaN;
  const ta = Date.UTC(Number(ma[1]), Number(ma[2]) - 1, Number(ma[3]));
  const tb = Date.UTC(Number(mb[1]), Number(mb[2]) - 1, Number(mb[3]));
  return Math.round((tb - ta) / DAY_MS);
}

/** "2026년 10월 1일". 못 읽으면 받은 글자 그대로. */
export function formatDateKoLong(ymd: string): string {
  const m = YMD.exec(String(ymd ?? ""));
  if (!m) return String(ymd ?? "");
  return `${Number(m[1])}년 ${Number(m[2])}월 ${Number(m[3])}일`;
}

/* ── 판 ────────────────────────────────────────────────────────────────── */

export type LegalVersion = {
  id: number;
  kind: LegalKind;
  version: number;
  title: string;
  body: string;
  effectiveDate: string;
  publishedAt: string;
};

/** 판 이력 한 줄(본문 없이) — 관리실 '판 이력' 표. 사유·게시한 사람은 마스터만 읽는다. */
export type LegalVersionMeta = {
  id: number;
  version: number;
  title: string;
  effectiveDate: string;
  publishedAt: string;
  publishedByUsername: string | null;
  note: string | null;
  bodyLength: number;
};

/** GET /api/admin/legal?kind= 의 답. */
export type LegalAdminResponse = {
  schemaReady: boolean;
  kind: LegalKind;
  today: string;
  current: LegalVersion | null;
  upcoming: LegalVersion | null;
  versions: LegalVersionMeta[];
  canEdit: boolean;
};

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const int = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : Number(v) || 0);
/** DB 의 date 는 'YYYY-MM-DD', timestamptz 도 앞 10글자가 날짜다. */
const ymdOf = (v: unknown): string => str(v).slice(0, 10);

/** DB 줄(snake_case) → 판. 종류를 모르면 null(화면이 그리지 않는다). */
export function legalVersionFromRow(row: unknown): LegalVersion | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (!isLegalKind(r.kind)) return null;
  const effectiveDate = ymdOf(r.effective_date);
  if (!isValidYmd(effectiveDate)) return null;
  return {
    id: int(r.id),
    kind: r.kind,
    version: int(r.version),
    title: str(r.title),
    body: str(r.body),
    effectiveDate,
    publishedAt: str(r.published_at),
  };
}

/** master_legal_doc_log 의 줄 → 판 이력 한 줄. */
export function legalMetaFromRow(row: unknown): LegalVersionMeta | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const effectiveDate = ymdOf(r.effective_date);
  if (!isValidYmd(effectiveDate)) return null;
  return {
    id: int(r.id),
    version: int(r.version),
    title: str(r.title),
    effectiveDate,
    publishedAt: str(r.published_at),
    publishedByUsername: strOrNull(r.published_by_username),
    note: strOrNull(r.note),
    bodyLength: int(r.body_length),
  };
}

/**
 * 지금 보여 줄 판과 다음에 바뀔 판.
 *  · current  = 시행일이 오늘 이하인 판 중 (시행일, 판 번호)가 가장 큰 것
 *  · upcoming = 시행일이 오늘보다 뒤인 판 중 가장 가까운 날, 그날 판이 여럿이면 번호가 큰 것
 * 같은 날 두 번 게시했으면 나중 판(번호 큰 것)이 이긴다 — 오타를 고쳐 다시 게시한 경우다.
 */
export function pickLegalDocs<R extends { effectiveDate: string; version: number }>(
  rows: readonly R[],
  today: string,
): { current: R | null; upcoming: R | null } {
  let current: R | null = null;
  let upcoming: R | null = null;
  for (const r of rows) {
    if (!isValidYmd(r.effectiveDate)) continue;
    if (r.effectiveDate <= today) {
      if (
        !current ||
        r.effectiveDate > current.effectiveDate ||
        (r.effectiveDate === current.effectiveDate && r.version > current.version)
      ) {
        current = r;
      }
    } else if (
      !upcoming ||
      r.effectiveDate < upcoming.effectiveDate ||
      (r.effectiveDate === upcoming.effectiveDate && r.version > upcoming.version)
    ) {
      upcoming = r;
    }
  }
  return { current, upcoming };
}

/* ── 게시 검사 ─────────────────────────────────────────────────────────── */

/** 줄바꿈·탭 같은 제어 글자가 있나(한 줄로 보여야 하는 칸에 쓴다). 정규식 대신 글자 번호로 본다. */
export function hasControlChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 32 || c === 127) return true;
  }
  return false;
}

export type PublishInput = { kind: LegalKind; title: string; body: string; effectiveDate: string; note: string | null };

/**
 * 게시 요청 검사 — DB(master_publish_legal_doc)도 같은 규칙으로 다시 막는다. 여기는 화면에 바로 안내하려고 둔다.
 * 본문 줄바꿈은 \n 으로 맞추고 끝의 빈 줄만 떼어 낸다(글 안의 빈 줄은 문단 나눔이라 그대로 둔다).
 */
export function parsePublishInput(body: unknown, today: string): Parsed<PublishInput> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "요청 모양이 아니에요." };
  const b = body as Record<string, unknown>;
  if (!isLegalKind(b.kind)) return { ok: false, error: "모르는 문서 종류예요." };
  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (title.length < 1 || title.length > LEGAL_TITLE_MAX) {
    return { ok: false, error: `제목을 1~${LEGAL_TITLE_MAX}자로 적어 주세요.` };
  }
  if (hasControlChar(title)) return { ok: false, error: "제목에는 줄바꿈을 넣을 수 없어요." };
  const text = typeof b.body === "string" ? b.body.replace(/\r\n?/g, "\n").replace(/\s+$/, "") : "";
  if (!text.trim()) return { ok: false, error: "본문을 적어 주세요." };
  if (text.length > LEGAL_BODY_MAX) return { ok: false, error: "본문은 60,000자까지 적을 수 있어요." };
  const eff = b.effectiveDate;
  if (!isValidYmd(eff)) return { ok: false, error: "시행일을 골라 주세요." };
  if (eff < today || eff > addDaysYmd(today, LEGAL_MAX_DAYS_AHEAD)) {
    return { ok: false, error: "시행일은 오늘부터 1년 안으로 정해 주세요." };
  }
  let note: string | null = null;
  if (b.note !== undefined && b.note !== null) {
    if (typeof b.note !== "string") return { ok: false, error: "바꾼 까닭이 글자가 아니에요." };
    const n = b.note.trim();
    if (n.length > LEGAL_NOTE_MAX) return { ok: false, error: `바꾼 까닭은 ${LEGAL_NOTE_MAX}자까지 적을 수 있어요.` };
    note = n || null;
  }
  return { ok: true, value: { kind: b.kind, title, body: text, effectiveDate: eff, note } };
}

/**
 * 부드러운 경고 — 막지는 않는다(사장님 결정 D2 기본값). 이미 시행 중인 이용약관·개인정보처리방침을
 * 7일 안에 바꾸려 할 때만 말한다. 처음 게시하는 문서는 바뀌는 게 없어 말하지 않는다.
 */
export function noticeWarning(kind: LegalKind, effectiveDate: string, today: string, hasCurrent = true): string | null {
  if (kind === "refund" || !hasCurrent) return null;
  const days = daysBetweenYmd(today, effectiveDate);
  if (!Number.isFinite(days) || days >= LEGAL_NOTICE_DAYS) return null;
  return "약관을 바꿀 때는 보통 시행 7일 전(불리하게 바꾸면 30일 전)에 알려야 해요.";
}

/** 새 판의 시행일 기본값 — 처음 게시면 오늘, 시행 중인 약관·방침을 바꾸면 7일 뒤, 환불 안내는 오늘. */
export function defaultEffectiveDate(kind: LegalKind, hasCurrent: boolean, today: string): string {
  if (hasCurrent && kind !== "refund") return addDaysYmd(today, LEGAL_NOTICE_DAYS);
  return today;
}

/* ── 초안 뼈대 ─────────────────────────────────────────────────────────── */

const FILL = "〔채워 주세요〕";

const SKELETON_HEADINGS: Record<LegalKind, string[]> = {
  terms: [
    "제1조 (목적)",
    "제2조 (정의)",
    "제3조 (약관의 게시와 변경)",
    "제4조 (서비스의 내용)",
    "제5조 (회원가입과 계정)",
    "제6조 (요금과 결제)",
    "제7조 (청약철회와 환불)",
    "제8조 (회원의 의무)",
    "제9조 (서비스의 변경과 중단)",
    "제10조 (책임의 제한)",
    "제11조 (분쟁 해결)",
  ],
  privacy: [
    "1. 처리하는 개인정보 항목",
    "2. 개인정보를 처리하는 목적",
    "3. 보관 기간과 파기",
    "4. 제3자 제공",
    "5. 처리 위탁",
    "6. 만 14세 미만 아동의 개인정보",
    "7. 이용자의 권리와 행사 방법",
    "8. 안전성 확보 조치",
    "9. 개인정보 보호책임자",
    "10. 방침의 변경",
  ],
  refund: ["청약철회 기간", "환불 기준", "환불 방법", "구독 해지", "문의"],
};

/**
 * 빈 문서에 넣는 뼈대 — 제목과 〔채워 주세요〕 자리만 있다. 법률 문장은 일부러 넣지 않는다
 * (지어낸 조항이 검토 없이 게시되면 그게 더 위험하다). 내용은 사장님(또는 법률 검토)이 채운다.
 */
export function legalSkeleton(kind: LegalKind, companyName: string): string {
  const name = String(companyName ?? "").trim() || "회사";
  const lines = [`〔${name} ${LEGAL_DOCS[kind].title} — ${FILL.slice(1, -1)}〕`, ""];
  for (const h of SKELETON_HEADINGS[kind]) lines.push(`## ${h}`, FILL, "");
  if (kind === "terms") lines.push("---", "부칙", `이 약관의 시행일: ${FILL}`);
  if (kind === "privacy") lines.push("---", `이 방침의 시행일: ${FILL}`);
  return lines.join("\n").replace(/\n+$/, "");
}

/* ── 관리실 초안(브라우저에만) ─────────────────────────────────────────── */

/** 게시 전 초안을 이 브라우저에만 적어 두는 열쇠 — 창이 닫혀도 쓰던 글이 남게. */
export function legalDraftKey(kind: LegalKind): string {
  return `admin-legal-draft:v1:${kind}`;
}

export type LegalDraft = { title: string; body: string; effectiveDate: string; savedAt: string };

/** 적어 둔 초안을 읽는다 — 모양이 이상하면 null(다른 판의 옛 초안·손으로 고친 값). */
export function parseLegalDraft(raw: unknown): LegalDraft | null {
  let v: unknown = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const d = v as Record<string, unknown>;
  if (typeof d.title !== "string" || typeof d.body !== "string" || typeof d.savedAt !== "string") return null;
  if (typeof d.effectiveDate !== "string" || (d.effectiveDate !== "" && !isValidYmd(d.effectiveDate))) return null;
  if (d.title.length > LEGAL_TITLE_MAX * 2 || d.body.length > LEGAL_BODY_MAX * 2) return null;
  if (!d.title.trim() && !d.body.trim()) return null;
  return { title: d.title, body: d.body, effectiveDate: d.effectiveDate, savedAt: d.savedAt };
}
