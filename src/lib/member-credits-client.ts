/**
 * 고객 화면이 '내 보상 크레딧'을 읽는다 — 본인 줄만 보인다(RLS). lib/member-credits 참고.
 *  · loadFreeDraws — 캐릭터 생성 크레딧(family_draw_credits, 가족 화면)
 *  · loadBookCredits — 동화 크레딧(book_credits, 만들기 화면)
 * 둘 다 가족 패스의 '이번 달 몫'(pass_left — 그 달이 지나면 0)을 합친 수다(2026-11-26 구글 결제). 서버도 같은 수로 센다.
 * 표가 없거나(SQL 전) 못 읽으면 0 — 화면이 쿠키로 보여 줄 뿐이고, 크레딧은 그대로 남는다(쓰는 건 서버가 정한다).
 * 이번 달 몫 칸(20번 SQL)이 아직 없는 DB 면 예전처럼 free_left 만 읽는다.
 * 구글로 산 회원이면 읽기 전에 결제 동기화(다음 달 갱신·연간 패스의 새 달 몫)를 잠깐 기다린다(lib/billing-sync-gate).
 */
import { settlePlaySync } from "./billing-sync-gate";
import { creditsLeftFromRow, freeLeftFromRow } from "./member-credits";
import { currentUid, getSupabase } from "./supabase";

async function readOwn(table: "family_draw_credits" | "book_credits"): Promise<number> {
  const uid = await currentUid();
  const sb = getSupabase();
  if (!uid || !sb) return 0;
  await settlePlaySync(uid);
  try {
    const withPass = await sb.from(table).select("free_left,pass_left,pass_until").eq("owner", uid).maybeSingle();
    if (!withPass.error) return creditsLeftFromRow(withPass.data, Date.now());
    const old = await sb.from(table).select("free_left").eq("owner", uid).maybeSingle();
    if (old.error) return 0;
    return freeLeftFromRow(old.data);
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
