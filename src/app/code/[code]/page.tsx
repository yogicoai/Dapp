import type { Metadata } from "next";
import { RedeemLanding } from "./RedeemLanding";

/*
 * 혜택 코드 링크 — 요기보가 문자·메일로 보내는 주소(/code/YOGIBO · /code/ABCDEFGHJKLM, 사장님 2026-10-22 미팅).
 * 누르면 로그인한 뒤 바로 들어간다(RedeemLanding). 웹과 안드로이드 앱이 같은 화면을 쓴다.
 * 검색에는 나오지 않는다(lib/seo PRIVATE_PATHS · 아래 noindex) — 시리얼이 검색 결과에 실리지 않게.
 */
export const metadata: Metadata = {
  title: "혜택 받기",
  robots: { index: false, follow: false },
};

export default async function CodePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  let raw = code;
  try {
    raw = decodeURIComponent(code);
  } catch {
    /* 깨진 주소 — 그대로 넘기면 화면이 '코드를 다시 확인해 주세요'라고 한다 */
  }
  return <RedeemLanding raw={raw} />;
}
