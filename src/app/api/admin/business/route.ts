import { revalidatePath } from "next/cache";
import { COMPANY_ADMIN, isSchemaMissing } from "@/lib/admin-console";
import { kstToday, LEGAL_DOCS, LEGAL_KINDS } from "@/lib/legal-doc";
import {
  BUSINESS_PUBLIC_SELECT,
  businessChangeFromRow,
  businessValues,
  docsReadiness,
  FALLBACK_SITE_INFO,
  mergeBusinessInfo,
  parseBusinessPatch,
  type BusinessAdminResponse,
  type BusinessChange,
} from "@/lib/site-info";
import { bodyTooLarge, dbFail, dbFailOrNotReady, fail, json, masterOnly, readBody } from "../_guard";

/**
 * 관리실 '사업자 정보' — 사이트 맨 아래 줄(상호·대표·사업자등록번호·신고번호·주소·전화·이메일·운영 시간·호스팅).
 *
 * GET  → { schemaReady, values, info, updatedAt, docs, log, canEdit }  (마스터 모두 읽는다)
 * POST { patch, note } → 바꾼다. **회사 계정만** — DB 의 master_set_business_info(is_pricing_admin)가 다시 막는다.
 *
 * 여기서 먼저 검사하는 까닭: 화면에 "사업자등록번호가 맞지 않아요"를 바로 띄우려고. 진짜 문지기는 DB 다.
 * 저장하면 약관 화면(/terms 등)을 다시 그리게 한다 — 그 화면 맨 아래 줄이 이 값을 보여 준다.
 * 요금제·결제 화면의 맨 아래 줄은 공개 경로(/api/site-info)를 1분 캐시로 읽어서 1~5분 안에 바뀐다.
 */

export const GET = masterOnly(async (caller) => {
  const canEdit = caller.username === COMPANY_ADMIN;
  const [row, docs, log] = await Promise.all([
    caller.db.from("app_business_info").select(BUSINESS_PUBLIC_SELECT).eq("id", 1).maybeSingle(),
    caller.db.from("app_legal_docs").select("kind,version,effective_date").order("effective_date", { ascending: false }).limit(300),
    caller.db.rpc("master_business_info_log", { p_limit: 50 }),
  ]);

  if (row.error) {
    const notReady: Omit<BusinessAdminResponse, "schemaReady"> = {
      values: businessValues(null),
      info: FALLBACK_SITE_INFO.business,
      updatedAt: null,
      docs: FALLBACK_SITE_INFO.docs,
      log: [],
      canEdit,
    };
    return dbFailOrNotReady(row.error, notReady);
  }
  // 이력·문서 목록은 없어도 화면을 막지 않는다 — 값이 먼저다.
  if (log.error) console.warn("[admin/business] 이력 오류", log.error.code, log.error.message);
  if (docs.error) console.warn("[admin/business] 문서 목록 오류", docs.error.code, docs.error.message);

  const updatedAt = (row.data as { updated_at?: unknown } | null)?.updated_at;
  const body: BusinessAdminResponse = {
    schemaReady: true,
    values: businessValues(row.data),
    info: mergeBusinessInfo(row.data),
    updatedAt: typeof updatedAt === "string" ? updatedAt : null,
    docs: docs.error ? FALLBACK_SITE_INFO.docs : docsReadiness((docs.data as unknown[] | null) ?? [], kstToday(Date.now())),
    log: ((log.data as unknown[] | null) ?? [])
      .map(businessChangeFromRow)
      .filter((c): c is BusinessChange => c !== null)
      .slice(0, 50),
    canEdit,
  };
  return json(body);
});

export const POST = masterOnly(async (caller, request) => {
  if (caller.username !== COMPANY_ADMIN) return fail("이 계정은 사업자 정보를 바꿀 수 없어요.", 403);
  if (bodyTooLarge(request, 20_000)) return fail("요청이 너무 커요.", 413);
  const body = await readBody(request);
  if (!body) return fail("요청 본문이 JSON 객체가 아니에요.", 400);

  const parsed = parseBusinessPatch(body);
  if (!parsed.ok) return fail(parsed.error, 400);

  const { data, error } = await caller.db.rpc("master_set_business_info", {
    p_patch: parsed.value.patch,
    p_note: parsed.value.note,
  });
  if (error) {
    if (isSchemaMissing(error)) {
      return fail("데이터베이스 준비 전이에요 — 관리실 SQL 을 먼저 돌려 주세요.", 503, { code: error.code });
    }
    return dbFail(error);
  }

  // 약관 화면 맨 아래 줄이 사업자 정보를 보여 준다 — 셋 다 다음 방문 때 새로 그린다.
  for (const k of LEGAL_KINDS) revalidatePath(LEGAL_DOCS[k].path);

  const result = (data ?? {}) as { changed?: unknown; info?: unknown };
  return json({
    ok: true,
    changed: Number(result.changed) || 0,
    info: mergeBusinessInfo(result.info),
    values: businessValues(result.info),
  });
});
