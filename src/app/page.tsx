import Link from "next/link";
import books from "@/data/sample-books.json";
import type { Book } from "@/lib/types";

const LANG_LABEL: Record<string, string> = {
  ko: "한국어",
  en: "English",
  ja: "日本語",
};

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-16">
      <header className="mb-12">
        <h1 className="text-3xl font-bold tracking-tight">우리 아이 보이스 동화</h1>
        <p className="mt-2 text-sm text-neutral-500">
          인수인계 샘플 {(books as Book[]).length}권 · 삽화는 아직 플레이스홀더입니다
        </p>
      </header>

      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {(books as Book[]).map((book) => (
          <li key={book.id}>
            <Link
              href={`/book/${book.id}`}
              className="group flex h-full flex-col rounded-2xl border border-black/10 p-5 transition hover:border-black/25 hover:shadow-lg dark:border-white/15 dark:hover:border-white/30"
            >
              <div className="mb-3 flex items-center gap-2">
                <span className="rounded-full bg-black/5 px-2.5 py-0.5 text-xs text-neutral-500 dark:bg-white/10">
                  {LANG_LABEL[book.lang] ?? book.lang}
                </span>
                <span className="text-xs text-neutral-400">{book.pages.length}쪽</span>
              </div>
              <h2 className="text-lg font-semibold leading-snug group-hover:underline">
                {book.title}
              </h2>
              <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-neutral-500">
                {book.summary}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
