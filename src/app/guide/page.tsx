import type { Metadata } from "next";
import folkBooksJson from "@/data/folk-books.json";
import { GuideView, type GuideSample } from "@/components/guide/GuideView";
import { getSiteInfo } from "@/lib/site-info-server";

/**
 * /guide 사용 가이드 — 로그인 없이 누구나 본다. 홈 위 '사용 가이드' 알약·설정·만들기 화면에서 들어온다(2026-10-20).
 * 동화 보기 화면 그림에 깔 한 쪽은 실제 제공 동화(전래동화 해님 달님 1쪽)에서 여기(서버)서 골라 넘긴다 —
 * 책 목록(json)을 브라우저로 보내지 않으려고. 맨 아래 사업자 정보도 서버에서 읽어 첫 HTML 에 넣는다.
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: "사용 가이드", // 뒤의 사이트 이름은 app/layout 제목 틀(lib/seo)이 붙인다
  description: "처음 오셨나요? 아이 정보 고르기부터 대본 고치기, 그림 그리기, 성우 목소리로 듣기까지 실제 화면으로 따라 해 보세요.",
};

const SAMPLE_BOOK_ID = "folk-haedal";

function pickSample(): GuideSample | null {
  const books = (Array.isArray(folkBooksJson) ? folkBooksJson : []) as {
    id?: string;
    title?: string;
    pages?: { text?: string; image?: string }[];
  }[];
  const book = books.find((b) => b.id === SAMPLE_BOOK_ID);
  const page = book?.pages?.[0];
  if (!book?.title || !page?.image || !page.text) return null;
  return { title: book.title, image: page.image, text: page.text.replace(/\s*\n\s*/g, " ") };
}

export default async function GuidePage() {
  const siteInfo = await getSiteInfo();
  return <GuideView siteInfo={siteInfo} sample={pickSample()} />;
}
