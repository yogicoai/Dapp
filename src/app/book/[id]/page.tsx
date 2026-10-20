import type { Viewport } from "next";
import { BookViewer } from "@/components/BookViewer";
import classicBooks from "@/data/classic-books.json";
import folkBooks from "@/data/folk-books.json";
import books from "@/data/sample-books.json";
import type { Book } from "@/lib/types";
import { asBooks } from "@/lib/types";
import { LibraryGate } from "./LibraryGate";
import { SavedBook } from "./SavedBook";

/*
 * 동화 보기 화면만 화면 가장자리까지 그린다(viewport-fit=cover) — 가로 전체화면에서 카메라 구멍 쪽·아래 제스처 막대 자리에
 * 흰 띠가 남았다(사장님 폰, 2026-10-20). 가장자리 단추는 BookViewer 가 안전 영역만큼 안쪽으로 민다.
 * 다른 화면은 그대로 둔다 — 아이폰 가로에서 홈의 왼쪽 위 알약 등이 노치 밑으로 들어가지 않게.
 */
export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

// 샘플(추후 회원 책) + 제공 서가(전래동화·세계명작).
const ALL = [...asBooks(books), ...asBooks(folkBooks), ...asBooks(classicBooks)];

export function generateStaticParams() {
  return ALL.map((book) => ({ id: book.id }));
}

// JSON에 없는 id(내가 만든 책)도 열 수 있어야 하므로, 미리 만든 경로 밖도 허용한다.
export const dynamicParams = true;

export default async function BookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const book = ALL.find((b) => b.id === id);
  // JSON에 없으면 내가 만든 책(localStorage)일 수 있다 — 클라이언트에서 찾는다.
  if (!book) return <SavedBook id={id} />;

  // 세계명작·전래동화는 보는 사람의 단계로 한 번 더 본다 — 주소로 바로 와도 잠긴 책은 안내만(LibraryGate, 2026-10-20).
  if (book.id.startsWith("folk-") || book.id.startsWith("classic-")) return <LibraryGate book={book} />;
  return <BookViewer book={book} />;
}
