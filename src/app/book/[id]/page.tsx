import { notFound } from "next/navigation";
import { BookViewer } from "@/components/BookViewer";
import classicBooks from "@/data/classic-books.json";
import folkBooks from "@/data/folk-books.json";
import books from "@/data/sample-books.json";
import type { Book } from "@/lib/types";

// 샘플(추후 회원 책) + 제공 서가(전래동화·세계명작).
const ALL = [...(books as Book[]), ...(folkBooks as Book[]), ...(classicBooks as Book[])];

export function generateStaticParams() {
  return ALL.map((book) => ({ id: book.id }));
}

export default async function BookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const book = ALL.find((b) => b.id === id);
  if (!book) notFound();

  return <BookViewer book={book} />;
}
