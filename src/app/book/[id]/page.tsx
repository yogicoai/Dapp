import { notFound } from "next/navigation";
import { BookViewer } from "@/components/BookViewer";
import books from "@/data/sample-books.json";
import type { Book } from "@/lib/types";

export function generateStaticParams() {
  return (books as Book[]).map((book) => ({ id: book.id }));
}

export default async function BookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const book = (books as Book[]).find((b) => b.id === id);
  if (!book) notFound();

  return <BookViewer book={book} />;
}
