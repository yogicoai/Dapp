import { NextResponse } from "next/server";
import { readSiteInfo } from "@/lib/site-info-server";

/**
 * GET /api/site-info — 사이트 맨 아래 사업자 정보 줄과 약관 링크(공개, 로그인 없음).
 *
 * 요금제·결제 시연 화면의 맨 아래 줄이 부른다(그 화면들은 DB 를 직접 만지지 못한다 — pay-demo 규칙).
 * 누구나 보는 값만 담는다: 상호·대표·사업자등록번호·신고번호·주소·전화·이메일·운영 시간·호스팅,
 * 그리고 문서마다 '시행 중인가'. 누가 언제 고쳤는지는 담지 않는다.
 *
 * 캐시: 1분 동안은 CDN·브라우저가 같은 답을 쓴다(관리실에서 바꾸면 1~5분 안에 사이트에 보인다).
 * 기본값으로 답할 때(DB 가 아직 없거나 못 읽음)는 짧게 둔다 — DB 가 돌아오면 곧 진짜 값이 보이게.
 */
export async function GET() {
  const info = await readSiteInfo();
  const cacheControl =
    info.source === "db"
      ? "public, max-age=60, s-maxage=60, stale-while-revalidate=300"
      : "public, max-age=0, s-maxage=15, stale-while-revalidate=60";
  return NextResponse.json(info, { headers: { "Cache-Control": cacheControl } });
}
