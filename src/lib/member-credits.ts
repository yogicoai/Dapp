/**
 * 보상 크레딧 — 관리실이 고객에게 더해 주는 무료 횟수 두 가지(사장님 2026-10-19 "사고가 발생했을 때 크레딧으로 제공 …
 * 동화와 / 캐릭터 생성으로 나눠서 관리").
 *
 *  · 동화 크레딧(book) — 무료 동화 N권. 새 동화의 대본을 받을 때 1권을 쓰고, 그 동화 한 권 값(대본 + 그림)을 쿠키로 채운다.
 *    대본이 실패하면 1권이 돌아온다. DB: supabase-book-credits.sql (book_credits · book_credit_grants · charge_story p_use_credit).
 *  · 캐릭터 생성 크레딧(character) — 무료 캐릭터 그리기 N번. 쿠키가 드는 가족 그리기(처음 2개 · 다시 1개)에 쿠키 대신
 *    한 번씩 먼저 쓴다(원래 0개인 '포함된 다시 그리기'에는 안 쓴다). 실패하면 돌아온다.
 *    DB: supabase-family-draw-credits.sql (family_draw_credits · family_draw_grants). 화면 셈은 lib/family drawPrices.
 *
 * 주는 길은 관리실 회원 상세의 '보상 크레딧' 카드와 사고 상세의 '크레딧으로 보상'(같은 창). 진짜 문지기는 DB 함수다.
 * 상대 경로·type 가져오기만 쓴다 — 테스트 러너(node --test)가 @/ 별칭을 못 읽는다.
 */
import { isUuid, type Parsed } from "./admin.ts";

export type CreditKind = "book" | "character";
export const CREDIT_KINDS: readonly CreditKind[] = ["book", "character"];

export const CREDIT_KIND_LABEL: Readonly<Record<CreditKind, string>> = { book: "동화 크레딧", character: "캐릭터 생성 크레딧" };
/** 세는 말 — 동화는 권, 캐릭터는 번 */
export const CREDIT_KIND_UNIT: Readonly<Record<CreditKind, string>> = { book: "권", character: "번" };
/** 관리실 설명 한 줄 — 고객이 언제 쓰나 */
export const CREDIT_KIND_HELP: Readonly<Record<CreditKind, string>> = {
  book: "새 동화를 만들 때 1권을 쓰고, 그 동화 한 권 값(대본 + 그림)을 쿠키로 채워 줘요. 대본이 실패하면 돌아와요.",
  character: "캐릭터를 새로 만들거나(쿠키 2개) 다시 만들 때(쿠키 1개) 쿠키 대신 한 번씩 먼저 써요. 그리다 실패하면 돌아와요.",
};

/** DB 함수 이름 — 더해 주기 · 남은 수와 기록 읽기 */
export const CREDIT_RPC: Readonly<Record<CreditKind, { grant: string; read: string }>> = {
  book: { grant: "master_grant_book_credits", read: "master_book_credits" },
  character: { grant: "master_grant_family_draws", read: "master_family_draws" },
};

/** 한 번에 더해 줄 수 있는 수(DB 와 같다) */
export const CREDIT_GRANT_MAX = 10;
export const CREDIT_NOTE_MIN = 2;
export const CREDIT_NOTE_MAX = 500;

export function isCreditKind(v: unknown): v is CreditKind {
  return typeof v === "string" && (CREDIT_KINDS as readonly string[]).includes(v);
}

/** "동화 크레딧 2권" · "캐릭터 생성 크레딧 1번" */
export function creditText(kind: CreditKind, n: number): string {
  return `${CREDIT_KIND_LABEL[kind]} ${n}${CREDIT_KIND_UNIT[kind]}`;
}

export type CreditGrant = { amount: number; note: string; by: string | null; at: string };

/** 한 가지 크레딧의 남은 수와 더해 준 기록. schemaReady=false 면 그 SQL 을 아직 안 돌렸다. */
export type CreditBalance = { schemaReady: boolean; freeLeft: number; log: CreditGrant[] };

/** GET /api/admin/credits?id= */
export type MemberCreditsResponse = Record<CreditKind, CreditBalance>;

export type CreditGrantInput = { id: string; kind: CreditKind; amount: number; note: string };

/** POST 본문 { id, kind, amount, note } — 화면이 먼저 거른다. DB 가 같은 선에서 다시 막는다. */
export function parseCreditGrantBody(body: unknown): Parsed<CreditGrantInput> {
  const b = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  if (!b) return { ok: false, error: "요청 본문이 JSON 객체가 아니에요." };
  const id = typeof b.id === "string" ? b.id.trim().toLowerCase() : "";
  if (!isUuid(id)) return { ok: false, error: "회원 id 모양이 아니에요." };
  if (!isCreditKind(b.kind)) return { ok: false, error: "동화 크레딧인지 캐릭터 생성 크레딧인지 골라 주세요." };
  const kind = b.kind;
  const amount = typeof b.amount === "number" ? b.amount : Number.NaN;
  if (!Number.isInteger(amount) || amount < 1 || amount > CREDIT_GRANT_MAX) {
    return { ok: false, error: `한 번에 1~${CREDIT_GRANT_MAX}${CREDIT_KIND_UNIT[kind]}까지 더해 줄 수 있어요.` };
  }
  const note = typeof b.note === "string" ? b.note.trim() : "";
  if (note.length < CREDIT_NOTE_MIN) return { ok: false, error: "왜 더해 주는지 두 글자 이상 적어 주세요." };
  if (note.length > CREDIT_NOTE_MAX) return { ok: false, error: `사유는 ${CREDIT_NOTE_MAX}자까지 적을 수 있어요.` };
  return { ok: true, value: { id, kind, amount, note } };
}

function grantFromRow(raw: unknown): CreditGrant | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const amount = Number(r.amount);
  if (!Number.isInteger(amount) || amount < 1) return null;
  if (typeof r.at !== "string" || !r.at) return null;
  return {
    amount,
    note: typeof r.note === "string" ? r.note : "",
    by: typeof r.by === "string" && r.by ? r.by : null,
    at: r.at,
  };
}

/** master_book_credits · master_family_draws 의 답 → 남은 수 · 기록(모양이 틀린 줄은 버린다) */
export function creditsFromRow(raw: unknown): { freeLeft: number; log: CreditGrant[] } {
  const d = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const left = Number(d.free_left);
  return {
    freeLeft: Number.isInteger(left) && left > 0 ? left : 0,
    log: (Array.isArray(d.log) ? d.log : []).map(grantFromRow).filter((g): g is CreditGrant => g !== null),
  };
}

/** 고객 화면이 읽는 자기 줄(book_credits · family_draw_credits) → 남은 수. 없거나 모양이 틀리면 0. */
export function freeLeftFromRow(raw: unknown): number {
  if (!raw || typeof raw !== "object") return 0;
  const n = Number((raw as Record<string, unknown>).free_left);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** 두 가지 기록을 한 줄로(최근 것부터) — 관리실 카드의 '더해 준 기록' */
export function mergedCreditLog(r: MemberCreditsResponse): (CreditGrant & { kind: CreditKind })[] {
  return CREDIT_KINDS.flatMap((kind) => r[kind].log.map((g) => ({ ...g, kind })))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
