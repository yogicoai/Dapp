/**
 * 공개 동화 단계 · 크레딧 설정을 **서버에서** 읽는다 — 요금제 화면(/plans)과 공개 경로(/api/offer-settings)가 쓴다.
 *
 * 공개 값만 읽으므로 비회원 열쇠(anon)로 부른다 — 표의 읽기 권한이 공개 칸만 열어 둔다(RLS). 서비스 키는 쓰지 않는다.
 * 읽기만 한다 — 요금제 화면(결제 시연 파일)이 가져오는 파일이라, 바꾸는 호출을 한 줄도 두지 않는다(pay-demo.guard G-T7).
 * 표가 아직 없거나(사장님이 SQL 을 돌리기 전) DB 가 느리면 기본값으로 그린다 — 사이트는 지금처럼 뜬다.
 */
import { createClient } from "@supabase/supabase-js";
import { cache } from "react";
import { LIBRARY_CATALOG } from "./library-catalog.ts";
import {
  defaultOfferSettings,
  OFFER_PUBLIC_SELECT,
  offerSettingsFromRow,
  offerViewOf,
  type OfferSettings,
} from "./offer-settings.ts";
import type { OfferView } from "./plans.ts";

/** DB 가 이만큼 안에 답하지 않으면 기본값 — 요금제 화면이 DB 때문에 멈추지 않게 */
const READ_TIMEOUT_MS = 3000;

export type OfferRead = { settings: OfferSettings; source: "db" | "fallback" };

export async function readOfferSettings(): Promise<OfferRead> {
  const fallback: OfferRead = { settings: defaultOfferSettings(LIBRARY_CATALOG), source: "fallback" };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return fallback;
  try {
    const db = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db
      .from("app_offer_settings")
      .select(OFFER_PUBLIC_SELECT)
      .eq("id", 1)
      .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS))
      .maybeSingle();
    if (error || !data) return fallback;
    return { settings: offerSettingsFromRow(data, LIBRARY_CATALOG), source: "db" };
  } catch {
    return fallback;
  }
}

/** 한 요청 안에서 여러 번 불러도(제목·본문) DB 는 한 번만 — React cache */
export const getOfferSettings = cache(readOfferSettings);

/** 요금제 화면이 그리는 값 */
export async function getOfferView(): Promise<OfferView> {
  const { settings } = await getOfferSettings();
  return offerViewOf(settings, LIBRARY_CATALOG);
}
