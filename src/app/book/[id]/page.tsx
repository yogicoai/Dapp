import { BookViewer } from "@/components/BookViewer";
import classicBooks from "@/data/classic-books.json";
import folkBooks from "@/data/folk-books.json";
import books from "@/data/sample-books.json";
import type { Book } from "@/lib/types";
import { asBooks } from "@/lib/types";
import { LibraryGate } from "./LibraryGate";
import { SavedBook } from "./SavedBook";

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
