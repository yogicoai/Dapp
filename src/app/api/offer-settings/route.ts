import { NextResponse } from "next/server";
import { familyOfferOf, libraryAccessOf } from "@/lib/offer-settings";
import { readOfferSettings } from "@/lib/offer-settings-server";

/**
 * GET /api/offer-settings — 책장이 자물쇠를 붙일지 정하는 공개 값(로그인 없음).
 * { gateOn, tiers: { 책 id: "free" | "starter" | "pass" }, family: { characters, characterCredits } } — 누가 언제 고쳤는지는 담지 않는다.
 * family 는 홈 가족 액자 안내 한 줄(가족 패스에 든 캐릭터 수 · 더 그릴 때 크레딧) — 요금제 화면(/plans)에도 보이는 공개 값이다.
 *
 * 캐시: 1분 동안은 CDN·브라우저가 같은 답을 쓴다(관리실에서 바꾸면 1~5분 안에 책장에 보인다).
 * 기본값으로 답할 때(DB 가 아직 없거나 못 읽음)는 짧게 둔다 — DB 가 돌아오면 곧 진짜 값이 보이게.
 */
export async function GET() {
  const { settings, source } = await readOfferSettings();
  const cacheControl =
    source === "db"
      ? "public, max-age=60, s-maxage=60, stale-while-revalidate=300"
      : "public, max-age=0, s-maxage=15, stale-while-revalidate=60";
  return NextResponse.json({ ...libraryAccessOf(settings), family: familyOfferOf(settings), source }, { headers: { "Cache-Control": cacheControl } });
}
