import { revalidatePath } from "next/cache";
import { isSchemaMissing } from "@/lib/admin-console";
import type { Caller } from "@/lib/api-auth";
import { mergeSeo, parseSeoPatch, SEO_SELECT, seoFormValues, siteOrigin, type SeoRow } from "@/lib/seo";
import { dbFail, dbFailOrNotReady, fail, json, masterOnly, readBody } from "../_guard";

/**
 * 관리실 '검색 노출(SEO)'(2026-10-19 — lib/seo · supabase-seo.sql).
 *
 * GET  → { schemaReady, values(입력 칸 — 빈 칸은 기본값 쓰는 중), effective(사이트에 실제로 나가는 값), origin, updatedAt }
 * POST { patch } → 모양을 다듬어(parseSeoPatch — 소유 확인은 <meta> 한 줄을 통째로 붙여도 코드만) master_set_seo 로 저장하고,
 *   사이트 전체 <head> 를 그 자리에서 다시 그리게 한다(revalidatePath — 안 해도 5분 뒤엔 바뀐다).
 * 관리자 모두 바꿀 수 있다(DB 함수가 is_master_user 로 다시 막는다). 서비스 키는 쓰지 않는다.
 */
async function readValues(db: Caller["db"]) {
  const { data, error } = await db.from("app_seo_settings").select(SEO_SELECT).eq("id", 1).maybeSingle();
  if (error) return { error } as const;
  const row = (data ?? null) as SeoRow | null;
  const effective = mergeSeo(row);
  return {
    body: {
      schemaReady: true,
      values: seoFormValues(row),
      effective,
      origin: siteOrigin(effective, process.env.NEXT_PUBLIC_SITE_URL ?? null),
      updatedAt: row?.updated_at ?? null,
    },
  } as const;
}

export const GET = masterOnly(async (caller) => {
  const r = await readValues(caller.db);
  if ("error" in r) {
    const effective = mergeSeo(null);
    return dbFailOrNotReady(r.error, {
      values: seoFormValues(null),
      effective,
      origin: siteOrigin(effective, process.env.NEXT_PUBLIC_SITE_URL ?? null),
      updatedAt: null,
    });
  }
  return json(r.body);
});

export const POST = masterOnly(async (caller, request) => {
  const body = await readBody(request);
  if (!body) return fail("요청 본문이 JSON 객체가 아니에요.", 400);
  const parsed = parseSeoPatch(body.patch);
  if (!parsed.ok) return fail(parsed.error, 400);

  const { error } = await caller.db.rpc("master_set_seo", { p_patch: parsed.patch });
  if (error) {
    if (isSchemaMissing(error)) {
      return fail("데이터베이스 준비 전이에요 — supabase-seo.sql 을 돌려 주세요.", 503, { code: error.code });
    }
    return dbFail(error);
  }
  // 모든 화면의 <head>(제목·설명·공유 그림·noindex)와 robots·sitemap 을 다시 그리게
  revalidatePath("/", "layout");
  const r = await readValues(caller.db);
  if ("error" in r) return dbFail(r.error);
  return json({ ok: true, ...r.body });
});
