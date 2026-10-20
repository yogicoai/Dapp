/**
 * 약관 동의 — 로그인 직후 한 번 뜨는 동의 화면(사장님 2026-10-19 "로그인 직후 한 번 동의 화면").
 *
 * 약관·개인정보처리방침에 "가입은 만 14세 이상 보호자만, 아이 정보는 보호자가 입력하고 그때 동의를 받는다"고 적었다.
 * 그래서 로그인한 회원이 지금 판(CONSENT_VERSION)에 동의한 기록이 없으면 동의 화면을 한 번 띄운다.
 *  · 필수 세 가지: 만 14세 이상 보호자 · 이용약관 · 개인정보 수집·이용(아이 정보·국외 이전 포함). 모두 체크해야 시작한다.
 *  · 동의하지 않으면 로그아웃한다(회원 서비스를 쓸 수 없다). 비회원 둘러보기는 그대로다.
 *  · 약관·방침이 사이트에 올라와 시행 중일 때만 띄운다 — 읽을 수 없는 약관에 동의를 받지 않는다(docsLive).
 *  · 관리자 계정·비회원·로그인/약관/관리실 화면에서는 띄우지 않는다(consentExempt).
 *  · 기록은 DB(supabase-consents.sql — member_consents · agree_terms)가 서버 시각으로 남긴다. 표가 없으면(SQL 전) 띄우지 않는다.
 *
 * 판은 이용약관 시행일이다. 약관을 크게 바꿔 다시 동의를 받아야 하면 이 값을 새 시행일로 바꾼다(모두에게 한 번 더 뜬다).
 * 상대 경로·type 가져오기만 쓴다 — 테스트 러너(node --test)가 @/ 별칭을 못 읽는다.
 */

export const CONSENT_VERSION = "2026-10-19";

export type ConsentKey = "age14" | "terms" | "privacy";

export type ConsentItem = { key: ConsentKey; label: string; note?: string; href?: string };

export const CONSENT_ITEMS: readonly ConsentItem[] = [
  { key: "age14", label: "만 14세 이상 보호자예요" },
  { key: "terms", label: "이용약관에 동의해요", href: "/terms" },
  {
    key: "privacy",
    label: "개인정보 수집·이용에 동의해요",
    note: "아이 정보(이름·나이·생김새·사진)를 보호자로서 넣는 것과 국외 이전을 포함해요",
    href: "/privacy",
  },
];

export type ConsentChecks = Record<ConsentKey, boolean>;

export const NO_CHECKS: ConsentChecks = { age14: false, terms: false, privacy: false };

/** 필수 항목을 모두 체크했나 */
export function allAgreed(c: Partial<ConsentChecks>): boolean {
  return CONSENT_ITEMS.every((i) => c[i.key] === true);
}

/** '모두 동의해요' — 모두 켜거나 모두 끈다 */
export function setAll(on: boolean): ConsentChecks {
  return { age14: on, terms: on, privacy: on };
}

/** 동의 화면을 띄울까 — 내 줄(member_consents)의 판이 지금 판이 아니면 띄운다. 줄이 없으면(null) 띄운다. */
export function needsConsent(row: unknown, version: string = CONSENT_VERSION): boolean {
  if (!row || typeof row !== "object") return true;
  return (row as Record<string, unknown>).version !== version;
}

/** 동의 화면을 띄우지 않는 주소 — 로그인(가입 중), 약관 세 화면(동의 전에 읽어야 한다), 계정 삭제 안내(지우려는 사람을 막지 않는다), 관리실 */
export function consentExempt(pathname: string | null | undefined): boolean {
  const p = pathname ?? "";
  return (
    p === "/login" ||
    p.startsWith("/login/") ||
    p === "/terms" ||
    p === "/privacy" ||
    p === "/refund" ||
    p === "/account-deletion" ||
    p === "/admin" ||
    p.startsWith("/admin/")
  );
}

/** 약관·개인정보처리방침이 지금 시행 중인가(사이트 정보의 docs) — 둘 다 있어야 동의를 받는다 */
export function docsLive(docs: { terms?: { ready?: boolean }; privacy?: { ready?: boolean } } | null | undefined): boolean {
  return docs?.terms?.ready === true && docs?.privacy?.ready === true;
}
