"use client";

import { BEST_FRIEND_LABEL, type FamilyMember } from "@/lib/family";

/**
 * '단짝 친구 불러오기' — 우리 가족 캐릭터에 넣어 둔 단짝 친구(role "friend")를 만들기 화면의 친구 칸에 채운다.
 * 2026-09-28 사장님: 친구 이름·성별을 매번 적지 않게, 가족 화면에 넣어 둔 단짝 친구를 한 번에 불러오기.
 *
 * 이 칩은 **이름·성별만** 채운다. 고정한 얼굴(portrait)은 그림 단계에서 따로 붙는다(2026-09-29~) —
 *   이야기 등장인물에 이 친구 **이름**이 있으면 인물 시트에 그 얼굴을 물린다(lib/family-cast). 이름 없이
 *   '친구'로만 나오면 누구인지 몰라 붙이지 않는다.
 */

/** 친구 칸 한 줄에 들어갈 값 — 성별은 친구 칸이 쓰는 말("여자"/"남자")로 바꾼다. 이름이 없으면 빈 값('친구'로 채우지 않는다). */
export function bestFriendEntry(m: FamilyMember): { name: string; gender: string } {
  return {
    name: (m.name ?? "").trim().slice(0, 20),
    gender: m.gender === "girl" ? "여자" : m.gender === "boy" ? "남자" : "",
  };
}

/**
 * 이 칸(이름·성별)에 이미 단짝 친구가 들어 있나 — 이름이 있으면 이름으로, 없으면 '이름 빈 칸 + 같은 성별'로 본다.
 * 들어 있으면 칩을 숨긴다(또 눌러도 바뀌는 게 없다).
 */
export function isBestFriendIn(entry: { name: string; gender: string }, name: string, gender: string): boolean {
  if (entry.name) return name.trim() === entry.name;
  return !name.trim() && Boolean(entry.gender) && gender === entry.gender;
}

/** 채울 것이 있나 — 이름도 성별도 없는(옛) 단짝 친구는 눌러도 아무것도 안 채워져서 칩을 안 띄운다. */
export function hasBestFriendInfo(entry: { name: string; gender: string }): boolean {
  return Boolean(entry.name || entry.gender);
}

export function BestFriendChip({
  friend,
  onPick,
  className = "",
}: {
  friend: FamilyMember;
  onPick: () => void;
  className?: string;
}) {
  const { name } = bestFriendEntry(friend);
  const face = friend.portrait;
  const size = 28;
  return (
    <button
      type="button"
      onClick={onPick}
      className={`flex min-h-11 max-w-full items-center gap-2 rounded-full bg-neutral-100 py-1.5 pl-2 pr-4 text-sm font-extrabold text-neutral-600 hover:bg-neutral-200 ${className}`}
    >
      {face ? (
        // 얼굴 동그라미 — 전신 그림을 폭의 1.25배로 키워 윗부분(머리~어깨)만 보이게(가족 화면 얼굴 동그라미와 같은 자르기).
        <span
          aria-hidden
          className="relative shrink-0 overflow-hidden rounded-full bg-white shadow-sm"
          style={{ width: size, height: size }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={face.url}
            alt=""
            draggable={false}
            className="absolute left-1/2 top-[4%] max-w-none -translate-x-1/2"
            // 흰 바탕 그림(배경 지우기 실패)은 곱하기로 얹는다 — 가족 화면과 같다.
            style={{ width: size * 1.25, ...(face.opaque ? { mixBlendMode: "multiply" as const } : {}) }}
          />
        </span>
      ) : (
        <span aria-hidden className="shrink-0 text-lg leading-none">
          🤝
        </span>
      )}
      <span className="min-w-0 truncate">
        {BEST_FRIEND_LABEL} 불러오기{name ? ` · ${name}` : ""}
      </span>
    </button>
  );
}
