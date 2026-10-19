/**
 * 고객 화면이 '내 보상 크레딧'을 읽는다 — 본인 줄만 보인다(RLS). lib/member-credits 참고.
 *  · loadFreeDraws — 캐릭터 생성 크레딧(family_draw_credits, 가족 화면)
 *  · loadBookCredits — 동화 크레딧(book_credits, 만들기 화면)
 * 표가 없거나(SQL 전) 못 읽으면 0 — 화면이 쿠키로 보여 줄 뿐이고, 크레딧은 그대로 남는다(쓰는 건 서버가 정한다).
 */
import { freeLeftFromRow } from "./member-credits";
import { currentUid, getSupabase } from "./supabase";

async function readOwn(table: "family_draw_credits" | "book_credits"): Promise<number> {
  const uid = await currentUid();
  const sb = getSupabase();
  if (!uid || !sb) return 0;
  try {
    const { data, error } = await sb.from(table).select("free_left").eq("owner", uid).maybeSingle();
    if (error) return 0;
    return freeLeftFromRow(data);
  } catch {
    return 0;
  }
}

export function loadFreeDraws(): Promise<number> {
  return readOwn("family_draw_credits");
}

export function loadBookCredits(): Promise<number> {
  return readOwn("book_credits");
}
