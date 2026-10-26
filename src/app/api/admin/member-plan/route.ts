import { isSchemaMissing, parseAdminId } from "@/lib/admin-console";
import { readyVoiceRoles } from "@/lib/admin-members";
import {
  countFamily,
  kstMonthStart,
  memberPlanChangeFromRow,
  memberPlanFromRow,
  parseMemberPlanBody,
  type MemberPlanChange,
  type MemberPlanResponse,
  type MemberUsage,
} from "@/lib/member-plan";
import { normalizePlanTerms } from "@/lib/offer-settings";
import { DEV_BOOK_LIKE } from "@/lib/dev-books";
import { bodyTooLarge, dbFail, fail, json, masterOnly, readBody } from "../_guard";

/**
 * 관리실 회원 화면의 '요금제' — 회원 한 명의 요금제를 읽고 정한다(2026-10-02 사장님 "회원들도 그쪽에서 관리할 수 있게").
 *
 * GET  ?id=<uuid> → MemberPlanResponse — 지금 요금제(사유·지정한 사람 포함) · 바꾼 이력 · 쓰고 있는 양 · 요금제 값(한도 계산)
 * POST { id, plan, endsOn, note } → 지정하거나(plan) 푼다(plan: null). 관리자 모두 — 토큰 충전과 같은 규칙.
 *      진짜 문지기는 DB 함수(master_set_member_plan) — 다른 관리자 계정·없는 회원·틀린 값을 다시 막는다.
 *
 * 표가 아직 없으면(SQL 전) GET 은 schemaReady:false 로 답한다 — 화면이 '준비 전'을 알리고 바꾸기를 잠근다.
 * 쓰고 있는 양(이번 달 동화 · 가족 캐릭터 · 목소리)은 하나라도 못 읽으면 통째로 null — 틀린 숫자를 보이지 않는다.
 */
export const GET = masterOnly(async (caller, request) => {
  const id = parseAdminId(new URL(request.url).searchParams.get("id"));
  if (!id.ok) return fail(id.error, 400);
  const db = caller.db;

  // 보이는 회원인가 — 없거나(탈퇴) 다른 관리자 계정이면(DB 가 가린다) 여기서 끝. 가족 목록(child)도 같이 읽는다.
  const who = await db.from("profiles").select("id,child").eq("id", id.value).limit(1);
  if (who.error) return dbFail(who.error);
  const profile = ((who.data as { id: string; child: unknown }[] | null) ?? [])[0];
  if (!profile) return fail("회원을 찾지 못했어요.", 404);

  const now = Date.now();
  const [plan, offer, monthBooks, allBooks, voices] = await Promise.all([
    db.rpc("master_member_plan", { p_owner: id.value }),
    db.from("app_offer_settings").select("plan_settings").eq("id", 1).maybeSingle(),
    db
      .from("books")
      .select("id", { count: "exact", head: true })
      .eq("owner", id.value)
      .not("id", "like", DEV_BOOK_LIKE)
      .gte("created_at", kstMonthStart(now)),
    db.from("books").select("id", { count: "exact", head: true }).eq("owner", id.value).not("id", "like", DEV_BOOK_LIKE),
    db.from("voice_clones").select("role,status").eq("owner", id.value),
  ]);

  // 요금제 값 — 표·칸이 없으면(SQL 전) 기본값으로 한도를 센다.
  if (offer.error && !isSchemaMissing(offer.error)) {
    console.warn("[admin/member-plan] 요금제 값 오류", offer.error.code, offer.error.message);
  }
  const terms = normalizePlanTerms(offer.error ? null : (offer.data as { plan_settings?: unknown } | null)?.plan_settings);

  const family = countFamily(profile.child);
  const usage: MemberUsage | null =
    monthBooks.error || allBooks.error || voices.error
      ? null
      : {
          booksThisMonth: monthBooks.count ?? 0,
          booksTotal: allBooks.count ?? 0,
          familyCharacters: family.characters,
          familyMembers: family.members,
          voices: readyVoiceRoles((voices.data as { role: string | null; status: string | null }[] | null) ?? []).length,
        };

  if (plan.error) {
    if (!isSchemaMissing(plan.error)) return dbFail(plan.error);
    const notReady: MemberPlanResponse = { schemaReady: false, plan: null, log: [], usage, terms };
    return json(notReady);
  }

  const data = (plan.data ?? {}) as { plan?: unknown; log?: unknown };
  const body: MemberPlanResponse = {
    schemaReady: true,
    plan: memberPlanFromRow(data.plan),
    log: (Array.isArray(data.log) ? data.log : [])
      .map(memberPlanChangeFromRow)
      .filter((c): c is MemberPlanChange => c !== null),
    usage,
    terms,
  };
  return json(body);
});

export const POST = masterOnly(async (caller, request) => {
  if (bodyTooLarge(request, 10_000)) return fail("요청이 너무 커요.", 413);
  const body = await readBody(request);
  if (!body) return fail("요청 본문이 JSON 객체가 아니에요.", 400);
  const parsed = parseMemberPlanBody(body, Date.now());
  if (!parsed.ok) return fail(parsed.error, 400);

  const { id, plan, endsAt, note } = parsed.value;
  const { data, error } = await caller.db.rpc("master_set_member_plan", {
    p_owner: id,
    p_plan: plan,
    p_ends_at: endsAt,
    p_note: note,
  });
  if (error) {
    if (isSchemaMissing(error)) {
      return fail("데이터베이스 준비 전이에요 — supabase-offer-settings.sql 을 먼저 돌려 주세요.", 503, { code: error.code });
    }
    return dbFail(error);
  }
  const result = (data ?? {}) as { changed?: unknown; plan?: unknown };
  return json({ ok: true, changed: Number(result.changed) || 0, plan: memberPlanFromRow(result.plan) });
});
