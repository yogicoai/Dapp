"use client";

import Link from "next/link";
import { useState } from "react";
import folkBooksJson from "@/data/folk-books.json";
import type { Book } from "@/lib/types";
import { asBooks } from "@/lib/types";

/**
 * 삽화 검수실 (개발용 — 주소로만 접근).
 *
 * 전래동화는 계속 쓸 자산이라 한 장씩 보고 확정한다. 여기서 전체를 훑고
 * "3번, 7번 별로"라고 지목하면 그 쪽만 다시 생성한다 (쪽당 약 ₩55).
 */
export default function ArtReviewPage() {
  const books = asBooks(folkBooksJson).filter((b) =>
    b.pages.some((p) => p.image),
  );
  const [bookId, setBookId] = useState(books[0]?.id ?? "");
  const book = books.find((b) => b.id === bookId);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-4 px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-neutral-800">
          삽화 검수실 <span className="text-sm font-bold text-neutral-400">(개발용)</span>
        </h1>
        <Link href="/" className="text-sm font-bold text-neutral-400 hover:text-neutral-600">
          ← 서재
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {books.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => setBookId(b.id)}
            className={`rounded-full px-4 py-2 text-sm font-bold transition ${
              b.id === bookId
                ? "bg-amber-400 text-white shadow"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            {b.title}
          </button>
        ))}
        {books.length === 0 && (
          <p className="text-sm font-bold text-neutral-400">아직 삽화가 있는 책이 없어요.</p>
        )}
      </div>

      {book && (
        <div className="grid grid-cols-2 gap-4 pb-10 sm:grid-cols-3">
          {book.pages.map((p, i) => (
            <figure key={i} className="flex flex-col gap-1.5">
              {p.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.image}
                  alt={`${i + 1}쪽`}
                  className="aspect-[4/3] w-full rounded-2xl object-cover shadow"
                />
              ) : (
                <div className="flex aspect-[4/3] w-full items-center justify-center rounded-2xl bg-neutral-100 text-sm font-bold text-neutral-400">
                  아직 없음
                </div>
              )}
              <figcaption className="text-[11px] font-medium leading-snug text-neutral-500">
                <span className="mr-1 rounded-full bg-neutral-800 px-2 py-0.5 text-[10px] font-extrabold text-white">
                  {i + 1}
                </span>
                {p.text.split("\n")[0]}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </main>
  );
}
