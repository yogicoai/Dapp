"use client";

import { type FamilyMember } from "@/lib/family";

/**
 * '우리 강아지 불러오기' — 가족 화면에 넣어 둔 반려견(role "pet", 사장님 2026-11-06)을 '동물 친구랑'의 이름 칸에 채운다.
 * 이름만 채운다. 견종·털 색 같은 특징은 만들기 화면이 이야기에 따로 건넨다(lib/family-cast storyFamilyLooks —
 * '콩이(우리 강아지)'의 생김새 줄). 그래서 이름이 같아야 이야기가 그 특징을 이 강아지에 붙인다.
 */
export function PetChip({ pet, onPick, className = "" }: { pet: FamilyMember; onPick: () => void; className?: string }) {
  const name = (pet.name ?? "").trim();
  return (
    <button
      type="button"
      onClick={onPick}
      className={`flex min-h-11 max-w-full items-center gap-2 rounded-full bg-neutral-100 py-1.5 pl-2 pr-4 text-sm font-extrabold text-neutral-600 hover:bg-neutral-200 ${className}`}
    >
      <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/chips/puppy.webp" alt="" className="h-6 w-6 object-contain" />
      </span>
      <span className="min-w-0 truncate">우리 강아지 불러오기{name ? ` · ${name}` : ""}</span>
    </button>
  );
}
