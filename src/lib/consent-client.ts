/**
 * 동의 화면이 쓰는 DB 읽기·쓰기 — lib/consent 참고.
 *  · loadMyConsent — 내 줄(member_consents, 본인만 읽는다)로 지금 판에 동의했나. 표가 없거나(SQL 전) 못 읽으면 "unavailable"
 *    — 그때는 동의 화면을 띄우지 않는다(기록을 남길 수 없는데 화면만 막지 않게).
 *  · agreeTerms — agree_terms(판, 항목). 시각은 서버가 찍는다.
 */
import { CONSENT_VERSION, needsConsent, type ConsentChecks } from "./consent";
import { getSupabase } from "./supabase";

export type ConsentState = "agreed" | "needed" | "unavailable";

export async function loadMyConsent(uid: string): Promise<ConsentState> {
  const sb = getSupabase();
  if (!sb) return "unavailable";
  try {
    const { data, error } = await sb.from("member_consents").select("version").eq("owner", uid).maybeSingle();
    if (error) return "unavailable";
    return needsConsent(data, CONSENT_VERSION) ? "needed" : "agreed";
  } catch {
    return "unavailable";
  }
}

export async function agreeTerms(checks: ConsentChecks): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "잠시 뒤 다시 해 주세요." };
  try {
    const { error } = await sb.rpc("agree_terms", { p_version: CONSENT_VERSION, p_items: checks });
    if (error) return { ok: false, error: error.message || "동의를 저장하지 못했어요. 잠시 뒤 다시 해 주세요." };
    return { ok: true };
  } catch {
    return { ok: false, error: "동의를 저장하지 못했어요. 잠시 뒤 다시 해 주세요." };
  }
}
