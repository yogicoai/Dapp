/**
 * 사이트 정보 — 사이트 맨 아래 사업자 정보 줄과 약관 링크가 쓰는 값(공개).
 *
 * 사장님 말(2026-09-30): 대표·사업자등록번호·통신판매업 신고번호·약관 "(등록 예정)/(준비 중)" 자리를
 * 관리실에서 등록하게 해서 관리되게 하자. 그래서 값은 DB(app_business_info · app_legal_docs)가 원본이고,
 * lib/business-info 의 상수는 DB 가 아직 없거나 못 읽을 때 쓰는 기본값이다(사이트는 SQL 전에도 똑같이 뜬다).
 *
 * 이 파일은 순수 함수만 둔다 — DB 줄을 화면 값으로 바꾸기, 관리실 입력 검사, 공개 경로 답 검사.
 * 상대 경로·type 가져오기만 쓴다 — 테스트 러너(node --test)가 @/ 별칭을 못 읽는다.
 */
import type { Parsed } from "./admin.ts";
import { BUSINESS_INFO } from "./business-info.ts";
import { hasControlChar, isValidYmd, LEGAL_KINDS, pickLegalDocs, type LegalKind } from "./legal-doc.ts";

/* ── 모양 ──────────────────────────────────────────────────────────────── */

export type BusinessColumn =
  | "company_name"
  | "ceo_name"
  | "biz_no"
  | "mail_order_no"
  | "address"
  | "phone"
  | "email"
  | "hours"
  | "hosting";

export type BusinessInfoView = {
  name: string;
  ceo: string | null;
  bizNo: string | null;
  mailOrderNo: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  hours: string | null;
  hosting: string;
};

export type DocReadiness = { ready: boolean; effectiveDate: string | null };

export type SiteInfo = {
  business: BusinessInfoView;
  /** 문서마다 '지금 시행 중인 판이 있나' — 있으면 맨 아래 줄이 링크가 된다. */
  docs: Record<LegalKind, DocReadiness>;
  /** db = DB 에서 읽음 · fallback = 기본값(표가 없거나 못 읽음) */
  source: "db" | "fallback";
};

export type BusinessField = {
  column: BusinessColumn;
  key: keyof BusinessInfoView;
  label: string;
  required: boolean;
  max: number;
  placeholder: string;
  help?: string;
  inputMode?: "text" | "tel" | "email" | "numeric";
};

/** 관리실 입력 칸 — 순서는 사이트 맨 아래 줄 순서. 최대 길이는 DB 표의 check 와 같다. */
export const BUSINESS_FIELDS: readonly BusinessField[] = [
  {
    column: "company_name",
    key: "name",
    label: "상호",
    required: true,
    max: 60,
    placeholder: "요기코퍼레이션",
    help: "사업자등록증에 적힌 이름 그대로(주식회사 표기 포함)",
  },
  { column: "ceo_name", key: "ceo", label: "대표자", required: false, max: 40, placeholder: "홍길동" },
  {
    column: "biz_no",
    key: "bizNo",
    label: "사업자등록번호",
    required: false,
    max: 12,
    placeholder: "000-00-00000",
    help: "숫자 10자리 — 칸을 벗어나면 모양을 맞춰 드려요",
    inputMode: "numeric",
  },
  {
    column: "mail_order_no",
    key: "mailOrderNo",
    label: "통신판매업 신고번호",
    required: false,
    max: 60,
    placeholder: "제2026-서울강남-0000호",
  },
  { column: "address", key: "address", label: "사업장 주소", required: false, max: 200, placeholder: "서울특별시 …" },
  {
    column: "phone",
    key: "phone",
    label: "고객센터 전화",
    required: false,
    max: 20,
    placeholder: "02-000-0000",
    inputMode: "tel",
  },
  { column: "email", key: "email", label: "이메일", required: false, max: 120, placeholder: "help@example.com", inputMode: "email" },
  {
    column: "hours",
    key: "hours",
    label: "운영 시간",
    required: false,
    max: 100,
    placeholder: "평일 10:00~18:00 (점심 12:00~13:00)",
    help: "사이트에는 전화번호 옆 괄호 안에 보여요",
  },
  {
    column: "hosting",
    key: "hosting",
    label: "호스팅 제공자",
    required: true,
    max: 60,
    placeholder: "Vercel Inc.",
  },
];

export const BUSINESS_COLUMNS: readonly BusinessColumn[] = BUSINESS_FIELDS.map((f) => f.column);

/** 공개로 읽어도 되는 칸 — 고친 사람(updated_by)은 빼고 읽는다(권한도 없다). */
export const BUSINESS_PUBLIC_SELECT =
  "id,company_name,ceo_name,biz_no,mail_order_no,address,phone,email,hours,hosting,updated_at";

function fieldOf(column: BusinessColumn): BusinessField {
  return BUSINESS_FIELDS.find((f) => f.column === column) as BusinessField;
}

/* ── 기본값 ────────────────────────────────────────────────────────────── */

const FALLBACK_BUSINESS: BusinessInfoView = {
  name: BUSINESS_INFO.name,
  ceo: BUSINESS_INFO.ceo,
  bizNo: BUSINESS_INFO.bizNo,
  mailOrderNo: BUSINESS_INFO.mailOrderNo,
  address: BUSINESS_INFO.address,
  phone: BUSINESS_INFO.phone,
  email: BUSINESS_INFO.email,
  hours: BUSINESS_INFO.hours,
  hosting: BUSINESS_INFO.hosting,
};

const NOT_READY: DocReadiness = { ready: false, effectiveDate: null };

/** DB 를 못 읽었을 때 — 지금까지 사이트에 보이던 그대로(약관은 모두 '준비 중'). */
export const FALLBACK_SITE_INFO: SiteInfo = {
  business: FALLBACK_BUSINESS,
  docs: { terms: NOT_READY, privacy: NOT_READY, refund: NOT_READY },
  source: "fallback",
};

/* ── DB 줄 → 화면 값 ───────────────────────────────────────────────────── */

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** 글자면 앞뒤 공백을 떼고 길이를 자른다. 비었거나 글자가 아니면 null. 제어 글자가 섞였으면 버린다. */
function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || hasControlChar(s)) return null;
  return s.slice(0, max);
}

/**
 * DB 의 사업자 정보 한 줄(snake_case) → 화면 값. 빈 칸·이상한 값은 기본값(lib/business-info)으로 채운다.
 * 관리실 미리보기도 입력 중인 값(칸 이름이 같은 모양)을 이 함수에 넣어 사이트와 똑같이 그린다.
 */
export function mergeBusinessInfo(row: unknown): BusinessInfoView {
  const r = isObj(row) ? row : {};
  const out = { ...FALLBACK_BUSINESS };
  for (const f of BUSINESS_FIELDS) {
    const v = cleanText(r[f.column], f.max);
    if (v !== null) (out as Record<string, string | null>)[f.key] = v;
  }
  return out;
}

/** 관리실 입력 칸에 넣을 DB 값 그대로(기본값을 섞지 않는다 — 저장된 것과 안 된 것을 구별하려고). */
export function businessValues(row: unknown): Record<BusinessColumn, string | null> {
  const r = isObj(row) ? row : {};
  const out = {} as Record<BusinessColumn, string | null>;
  for (const f of BUSINESS_FIELDS) out[f.column] = typeof r[f.column] === "string" && r[f.column] ? String(r[f.column]) : null;
  return out;
}

/** 문서마다 지금 시행 중인 판이 있나 — app_legal_docs 의 (kind, version, effective_date) 줄로 센다. */
export function docsReadiness(rows: readonly unknown[], today: string): Record<LegalKind, DocReadiness> {
  const byKind: Record<LegalKind, { effectiveDate: string; version: number }[]> = { terms: [], privacy: [], refund: [] };
  for (const row of rows) {
    if (!isObj(row)) continue;
    const kind = row.kind;
    if (kind !== "terms" && kind !== "privacy" && kind !== "refund") continue;
    const effectiveDate = typeof row.effective_date === "string" ? row.effective_date.slice(0, 10) : "";
    if (!isValidYmd(effectiveDate)) continue;
    byKind[kind].push({ effectiveDate, version: Number(row.version) || 0 });
  }
  const out = {} as Record<LegalKind, DocReadiness>;
  for (const k of LEGAL_KINDS) {
    const { current } = pickLegalDocs(byKind[k], today);
    out[k] = current ? { ready: true, effectiveDate: current.effectiveDate } : NOT_READY;
  }
  return out;
}

/**
 * 공개 경로(/api/site-info)의 답을 브라우저에서 다시 검사한다 — 모양이 이상하면 기본값.
 * 칸 하나가 이상하면 그 칸만 기본값으로 둔다(사이트 맨 아래 줄은 늘 같은 줄 수로 그려진다).
 */
export function asSiteInfo(json: unknown): SiteInfo {
  if (!isObj(json) || !isObj(json.business)) return FALLBACK_SITE_INFO;
  const b = json.business;
  const business = { ...FALLBACK_BUSINESS };
  for (const f of BUSINESS_FIELDS) {
    const v = b[f.key];
    if (v === null && !f.required) (business as Record<string, string | null>)[f.key] = null;
    else {
      const s = cleanText(v, f.max);
      if (s !== null) (business as Record<string, string | null>)[f.key] = s;
    }
  }
  const docsIn = isObj(json.docs) ? json.docs : {};
  const docs = {} as Record<LegalKind, DocReadiness>;
  for (const k of LEGAL_KINDS) {
    const d = docsIn[k];
    const eff = isObj(d) && isValidYmd(d.effectiveDate) ? (d.effectiveDate as string) : null;
    docs[k] = isObj(d) && d.ready === true ? { ready: true, effectiveDate: eff } : NOT_READY;
  }
  return { business, docs, source: json.source === "db" ? "db" : "fallback" };
}

/* ── 사업자등록번호 ────────────────────────────────────────────────────── */

/**
 * 사업자등록번호 검증 숫자가 맞나(숫자 10자리).
 * 앞 9자리에 1,3,7,1,3,7,1,3,5 를 곱해 더하고, 9번째 자리×5 의 십의 자리를 한 번 더 더한다.
 * (10 − 합의 일의 자리) 의 일의 자리가 마지막 숫자와 같아야 한다.
 */
export function isValidBizNo(digits: string): boolean {
  if (!/^\d{10}$/.test(digits)) return false;
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  const d = digits.split("").map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += d[i] * w[i];
  sum += Math.floor((d[8] * 5) / 10);
  return (10 - (sum % 10)) % 10 === d[9];
}

/** 숫자 10자리면 "000-00-00000" 모양으로, 아니면 null. 검증 숫자는 보지 않는다(isValidBizNo 가 본다). */
export function formatBizNo(v: string): string | null {
  const digits = String(v ?? "").replace(/\D/g, "");
  if (digits.length !== 10) return null;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

/* ── 관리실 입력 검사 ──────────────────────────────────────────────────── */

const PHONE = /^[0-9+() -]{7,20}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * 칸 하나 검사 — 관리실이 칸을 벗어날 때(바로 안내)와 저장 요청 검사(parseBusinessPatch)가 같이 쓴다.
 * 빈 글자는 '비움'(null). 사업자등록번호는 숫자만 골라 모양을 맞춰 돌려준다.
 * DB(master_set_business_info)도 모양을 다시 본다 — 여기는 먼저 친절하게 알려 주려는 것.
 */
export function validateBusinessField(column: BusinessColumn, raw: unknown): Parsed<string | null> {
  const f = fieldOf(column);
  if (raw !== null && raw !== undefined && typeof raw !== "string") return { ok: false, error: `${f.label} 값은 글자여야 해요.` };
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) {
    if (f.required) return { ok: false, error: `${f.label} 칸은 비워 둘 수 없어요.` };
    return { ok: true, value: null };
  }
  if (hasControlChar(s)) return { ok: false, error: `${f.label}에는 줄바꿈을 넣을 수 없어요.` };
  if (column === "biz_no") {
    if (!/^[\d\s-]+$/.test(s)) return { ok: false, error: "사업자등록번호는 숫자와 - 만 적어 주세요." };
    const digits = s.replace(/\D/g, "");
    if (digits.length !== 10) return { ok: false, error: "사업자등록번호는 숫자 10자리예요." };
    if (!isValidBizNo(digits)) return { ok: false, error: "사업자등록번호가 맞지 않아요 — 숫자를 다시 확인해 주세요." };
    return { ok: true, value: formatBizNo(digits) };
  }
  if (s.length > f.max) return { ok: false, error: `${f.label}이(가) 너무 길어요(${f.max}자까지).` };
  if (column === "phone" && !PHONE.test(s)) return { ok: false, error: "고객센터 전화는 숫자와 - 로 적어 주세요(7~20자)." };
  if (column === "email" && !EMAIL.test(s)) return { ok: false, error: "이메일 모양이 아니에요." };
  return { ok: true, value: s };
}

export type BusinessPatch = Partial<Record<BusinessColumn, string | null>>;

/**
 * 저장 요청 { patch, note } 검사. 모르는 칸은 받지 않는다(다른 칸을 몰래 바꾸지 못하게).
 * 바꿀 칸이 하나도 없으면 거절. 바꾼 까닭(note)은 고르기 — 500자까지.
 */
export function parseBusinessPatch(body: unknown): Parsed<{ patch: BusinessPatch; note: string | null }> {
  if (!isObj(body)) return { ok: false, error: "요청 모양이 아니에요." };
  const raw = body.patch;
  if (!isObj(raw)) return { ok: false, error: "바꿀 항목이 없어요." };
  const keys = Object.keys(raw);
  if (keys.length === 0) return { ok: false, error: "바꿀 항목이 없어요." };
  const patch: BusinessPatch = {};
  for (const k of keys) {
    if (!(BUSINESS_COLUMNS as readonly string[]).includes(k)) return { ok: false, error: `모르는 항목이에요: ${k}` };
    const r = validateBusinessField(k as BusinessColumn, raw[k]);
    if (!r.ok) return r;
    patch[k as BusinessColumn] = r.value;
  }
  let note: string | null = null;
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== "string") return { ok: false, error: "바꾼 까닭이 글자가 아니에요." };
    const n = body.note.trim();
    if (n.length > 500) return { ok: false, error: "바꾼 까닭은 500자까지 적을 수 있어요." };
    note = n || null;
  }
  return { ok: true, value: { patch, note } };
}

/* ── 관리실 답 모양 ────────────────────────────────────────────────────── */

export type BusinessChange = {
  id: number;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  note: string | null;
  changedByUsername: string | null;
  at: string;
};

/** GET /api/admin/business 의 답. */
export type BusinessAdminResponse = {
  schemaReady: boolean;
  /** DB 에 적힌 값 그대로(입력 칸용) */
  values: Record<BusinessColumn, string | null>;
  /** 사이트에 보이는 값(기본값을 채운 것) */
  info: BusinessInfoView;
  updatedAt: string | null;
  docs: Record<LegalKind, DocReadiness>;
  log: BusinessChange[];
  canEdit: boolean;
};

/** master_business_info_log 의 줄 → 이력 한 줄. */
export function businessChangeFromRow(row: unknown): BusinessChange | null {
  if (!isObj(row)) return null;
  const s = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    id: Number(row.id) || 0,
    field: s(row.field) ?? "",
    oldValue: s(row.old_value),
    newValue: s(row.new_value),
    note: s(row.note),
    changedByUsername: s(row.changed_by_username),
    at: s(row.at) ?? "",
  };
}

/** 이력의 칸 이름(DB) → 사람 말. 모르는 칸은 그대로. */
export function businessFieldLabel(column: string): string {
  return BUSINESS_FIELDS.find((f) => f.column === column)?.label ?? column;
}
