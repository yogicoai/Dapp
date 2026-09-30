import { revalidatePath } from "next/cache";
import { COMPANY_ADMIN, isSchemaMissing } from "@/lib/admin-console";
import {
  isLegalKind,
  kstToday,
  LEGAL_DOCS,
  LEGAL_KINDS,
  legalMetaFromRow,
  legalVersionFromRow,
  parsePublishInput,
  pickLegalDocs,
  type LegalAdminResponse,
  type LegalVersion,
  type LegalVersionMeta,
} from "@/lib/legal-doc";
import { bodyTooLarge, dbFail, dbFailOrNotReady, fail, json, masterOnly, readBody } from "../_guard";

/**
 * 관리실 '약관' — 이용약관 · 개인정보처리방침 · 환불 안내를 판(version)으로 게시한다.
 *
 * GET  ?kind=terms            → { schemaReady, kind, today, current, upcoming, versions(본문 없이), canEdit }
 * GET  ?kind=terms&version=3  → 그 판 하나(본문 포함) — '이 판 보기 · 이 판으로 다시 쓰기'
 * POST { kind, title, body, effectiveDate, note } → 새 판을 게시한다. **회사 계정만** —
 *      DB 의 master_publish_legal_doc(is_pricing_admin)가 다시 막는다. 게시한 판은 고칠 수 없다(DB 가 막는다).
 *
 * 본문이 길어서(6만 자까지) 목록에는 본문을 싣지 않는다. 지금 판·다음 판만 본문을 함께 준다.
 */

const PUBLIC_COLUMNS = "id,kind,version,title,body,effective_date,published_at";

export const GET = masterOnly(async (caller, request) => {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  if (!isLegalKind(kind)) return fail("모르는 문서 종류예요.", 400);
  const canEdit = caller.username === COMPANY_ADMIN;
  const today = kstToday(Date.now());

  // 판 하나(본문 포함)
  const versionRaw = url.searchParams.get("version");
  if (versionRaw !== null) {
    const version = /^\d{1,6}$/.test(versionRaw) ? Number(versionRaw) : NaN;
    if (!Number.isInteger(version) || version < 1) return fail("판 번호가 아니에요.", 400);
    const one = await caller.db
      .from("app_legal_docs")
      .select(PUBLIC_COLUMNS)
      .eq("kind", kind)
      .eq("version", version)
      .maybeSingle();
    if (one.error) return dbFail(one.error);
    const v = legalVersionFromRow(one.data);
    if (!v) return fail("그 판을 찾지 못했어요.", 404);
    return json({ version: v });
  }

  const notReady: Omit<LegalAdminResponse, "schemaReady"> = {
    kind,
    today,
    current: null,
    upcoming: null,
    versions: [],
    canEdit,
  };
  const log = await caller.db.rpc("master_legal_doc_log", { p_kind: kind, p_limit: 50 });
  if (log.error) return dbFailOrNotReady(log.error, notReady);
  const versions = ((log.data as unknown[] | null) ?? [])
    .map(legalMetaFromRow)
    .filter((m): m is LegalVersionMeta => m !== null);

  // 지금 판·다음 판만 본문을 읽는다
  const pick = pickLegalDocs(versions, today);
  const ids = [pick.current?.id, pick.upcoming?.id].filter((v): v is number => typeof v === "number");
  const byId = new Map<number, LegalVersion>();
  if (ids.length) {
    const full = await caller.db.from("app_legal_docs").select(PUBLIC_COLUMNS).in("id", ids);
    if (full.error) return dbFail(full.error);
    for (const row of (full.data as unknown[] | null) ?? []) {
      const v = legalVersionFromRow(row);
      if (v && v.kind === kind) byId.set(v.id, v);
    }
  }

  const body: LegalAdminResponse = {
    schemaReady: true,
    kind,
    today,
    current: pick.current ? (byId.get(pick.current.id) ?? null) : null,
    upcoming: pick.upcoming ? (byId.get(pick.upcoming.id) ?? null) : null,
    versions,
    canEdit,
  };
  return json(body);
});

export const POST = masterOnly(async (caller, request) => {
  if (caller.username !== COMPANY_ADMIN) return fail("이 계정은 약관을 게시할 수 없어요.", 403);
  // 본문 6만 자(한글 한 글자 3바이트) + 제목·사유 — 넉넉히 30만 바이트에서 끊는다. 읽기 전에 거절한다.
  if (bodyTooLarge(request, 300_000)) return fail("본문이 너무 길어요(60,000자까지).", 413);
  const body = await readBody(request);
  if (!body) return fail("요청 본문이 JSON 객체가 아니에요.", 400);

  const parsed = parsePublishInput(body, kstToday(Date.now()));
  if (!parsed.ok) return fail(parsed.error, 400);
  const p = parsed.value;

  const { data, error } = await caller.db.rpc("master_publish_legal_doc", {
    p_kind: p.kind,
    p_title: p.title,
    p_body: p.body,
    p_effective: p.effectiveDate,
    p_note: p.note,
  });
  if (error) {
    if (isSchemaMissing(error)) {
      return fail("데이터베이스 준비 전이에요 — 관리실 SQL 을 먼저 돌려 주세요.", 503, { code: error.code });
    }
    return dbFail(error);
  }

  // 게시한 문서 화면 + 다른 두 문서 화면(맨 아래 줄의 '준비 중' 링크가 바뀐다)을 다음 방문 때 새로 그린다.
  for (const k of LEGAL_KINDS) revalidatePath(LEGAL_DOCS[k].path);

  const result = (data ?? {}) as { version?: unknown; effective_date?: unknown };
  return json({
    ok: true,
    version: Number(result.version) || null,
    effectiveDate: typeof result.effective_date === "string" ? result.effective_date.slice(0, 10) : p.effectiveDate,
  });
});
