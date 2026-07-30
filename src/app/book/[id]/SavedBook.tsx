"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookViewer } from "@/components/BookViewer";
import { loadMyBook } from "@/lib/prefs";
import type { Book } from "@/lib/types";

/**
 * JSON 서가에 없는 id — 내가 만든 책(localStorage)일 수 있어 여기서 찾는다.
 * 서버는 localStorage를 못 읽으니 이 조회는 마운트 후 클라이언트에서 한다.
 * undefined=아직 찾는 중, null=정말 없음.
 */
export function SavedBook({ id }: { id: string }) {
  const [book, setBook] = useState<Book | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    loadMyBook(id).then((b) => {
      if (alive) setBook(b);
    });
    return () => {
      alive = false;
    };
  }, [id]);

  if (book === undefined) return null; // 조회 중 — 깜빡임 방지로 빈 화면
  if (book) return <BookViewer book={book} />;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-lg font-extrabold text-neutral-700">동화를 찾을 수 없어요</p>
      <p className="text-sm font-medium text-neutral-400">
        이 계정으로 볼 수 없는 책이거나 지워졌을 수 있어요.
      </p>
      <Link
        href="/"
        className="rounded-full bg-neutral-800 px-5 py-2.5 text-sm font-bold text-white"
      >
        ← 서재로
      </Link>
    </div>
  );
}
