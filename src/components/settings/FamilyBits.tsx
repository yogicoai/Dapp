"use client";

/**
 * 설정 ↔ 가족 캐릭터 잇기(사장님 결정 2026-09-28 6번).
 *
 *  - FamilyCharacterRow: 설정(아이 정보 아래) '우리 가족 캐릭터 ›' 줄 — 고정된 얼굴을 겹쳐 보여 준다.
 *    회원의 아이·엄마·아빠 특징을 고르는 **유일한 입구**이기도 하다(사장님 2026-09-28 — 설정의 '아이 특징'·
 *    '엄마·아빠 특징' 접는 칸을 걷고 이 줄로 모았다. 특징은 가족 화면 생김새 고르기에서 고른다).
 *
 * 생김새 원본은 ChildPrefs.looks·parents 이고 견주기 규칙은 lib/family.ts 가 원본이다
 * (showsLooksChanged — 옷·메모만 바꾸면 바뀐 것으로 치지 않고, 확인 전 새 그림이 있으면 묻지 않는다.
 *  가족 모아 보기와 같은 규칙).
 * (예전 FaceLockBadge·LooksChangedNote 는 설정 특징 칸 안에서만 썼다 — 칸을 걷으며 같이 뺐다.)
 */

import Link from "next/link";
import { FaceAvatar } from "@/components/family/Figures";
import { familyExampleSrc, type Colors } from "@/components/family/family-ui";
import { NextIcon } from "@/components/family/icons";
import {
  BEST_FRIEND_LABEL,
  byRoleOrder,
  familyMembersOnly,
  fixedMembers,
  isActive,
  showsLooksChanged,
  type FamilyMember,
} from "@/lib/family";
import type { ChildPrefs, Gender } from "@/lib/prefs";

/** 겹쳐 보일 얼굴 수 */
const FACES_MAX = 5;

/**
 * 설정 '우리 가족 캐릭터 ›' — 제목 아래에 '아이·엄마·아빠 특징도 여기서 골라요'(특징 칸이 여기로 옮겨 왔다는
 * 안내), 그 아래 고정된 얼굴(최대 5개)을 겹쳐 보이고, 없으면 예시 가족 그림과 '가족 얼굴을 고정해 보세요'.
 * 모습이 바뀐 사람·확인 안 한 그림이 있으면 그 말을 먼저 한다.
 * 좁은 폰(360px)에서도 제목이 눌리지 않게 제목 줄과 얼굴 줄을 둘로 나눴다.
 */
export function FamilyCharacterRow({
  family,
  child,
  childGender,
  colors,
}: {
  family: FamilyMember[];
  child: Pick<ChildPrefs, "looks" | "parents">;
  childGender: Gender;
  colors: Colors;
}) {
  // 얼굴 동그라미는 단짝 친구까지(순서상 맨 끝), 숫자는 가족만 센다 — 단짝 친구는 가족이 아니다
  // (모아 보기 '우리 가족 · N명(얼굴 고정 M명)'과 같은 숫자).
  const fixed = byRoleOrder(fixedMembers(family));
  const kinFixed = familyMembersOnly(fixed).length;
  const friendFixed = fixed.some((m) => m.role === "friend");
  const pending = family.some((m) => m.draft && !m.portrait && isActive(m));
  const changed = fixed.some((m) => showsLooksChanged(m, child));
  const alert = changed ? "모습이 바뀐 사람이 있어요" : pending ? "확인 안 한 그림이 있어요" : "";
  const fixedText =
    kinFixed > 0
      ? `가족 ${kinFixed}명${friendFixed ? `과 ${BEST_FRIEND_LABEL}` : ""}`
      : friendFixed
        ? BEST_FRIEND_LABEL
        : "";
  const sub = alert || (fixedText ? `${fixedText} 얼굴 고정 · 동화마다 같은 얼굴로 나와요` : "가족 얼굴을 고정해 보세요");

  return (
    <Link
      href="/family"
      className="flex items-center gap-3 rounded-3xl bg-white px-4 py-3 shadow-sm transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex flex-col gap-0.5">
          <span className="text-[15px] font-extrabold text-neutral-800">우리 가족 캐릭터</span>
          {/* 예전 설정의 '아이 특징'·'엄마·아빠 특징' 칸이 가족 화면으로 옮겨 갔다 — 어디서 고치는지 여기서 말한다. */}
          <span className="break-keep text-xs font-bold text-neutral-500">아이·엄마·아빠 특징도 여기서 골라요</span>
        </span>
        <span className="flex min-w-0 items-center gap-2.5">
          {fixed.length > 0 ? (
            <span className="flex shrink-0 pl-0.5">
              {fixed.slice(0, FACES_MAX).map((m, i) => (
                <FaceAvatar
                  key={m.id}
                  member={m}
                  size={30}
                  childGender={childGender}
                  className={i > 0 ? "-ml-2.5" : ""}
                  ring="0 0 0 2px #fff"
                />
              ))}
            </span>
          ) : (
            <span
              aria-hidden
              className="flex h-9 w-14 shrink-0 items-end justify-center overflow-hidden rounded-xl"
              style={{ background: colors.accentSoft }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={familyExampleSrc(childGender)} alt="" className="h-8 w-auto object-contain" />
            </span>
          )}
          <span
            className={`flex min-w-0 items-center gap-1.5 break-keep text-xs font-bold ${alert ? "" : "text-neutral-400"}`}
            style={alert ? { color: colors.accentDark } : undefined}
          >
            {alert && <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />}
            {sub}
          </span>
        </span>
      </span>
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-500"
      >
        <NextIcon size={16} />
      </span>
    </Link>
  );
}
