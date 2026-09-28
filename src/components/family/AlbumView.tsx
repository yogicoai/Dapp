"use client";

/**
 * 우리 가족 모아 보기 (시안 Album.dc.html) — 가족이 한 명이라도 그려진 뒤의 첫 화면.
 *
 * 위 액자는 홈과 같은 단체 사진 — '홈 가족 사진에 보이기'를 켠 고정된 사람만(homeMembers).
 * 명패는 '우리 아이예요'를 켠 형제까지(하온·하린이네 가족). 아래 2열 카드(가족 순서 ROLE_ORDER):
 *  - 고정됨: 그림 + 이름 (홈 사진에서 끈 사람은 '홈 사진엔 안 보여요')
 *  - 모습이 바뀌었어요: 그린 뒤로 '늘 그대로'(머리·얼굴·체형·키·안경 …)가 바뀐 고정된 사람 — 설정에서
 *    바꿔도 여기서 알아본다(showsLooksChanged — 설정과 같은 규칙). 주황 점 + 배지 + '다시 그릴지 골라 주세요'.
 *    누르면 LooksChangedSheet('지금 다시 그리기 · 값' / '나중에') — '나중에'를 눌러도 표시가 남는다.
 *  - 확인 전(draft): '확인해 주세요'
 *  - 고정 안 됨: 점선 사람 + '동화마다 새로 그려요' + '얼굴 고정하기 · 쿠키 2개'
 *  - 마지막: '가족 더하기'(넣기만 하면 0개)
 * 가족 아래 '단짝 친구' 칸이 따로 있다 — 가족이 아니라 'N명' 숫자에 안 든다.
 * 그 밖의 카드를 누르면 MemberSheet(다시 그리기·생김새 고치기·홈 사진 켜기·빼기)가 뜬다.
 *
 * 2차로 미룬 것: 시안 머리줄 오른쪽의 '가족 사진 보내기'(공유) 버튼. 단체 사진을 한 장으로 만들려면
 * 가족 그림(cafe24)을 캔버스에 그려야 하는데 cafe24 가 CORS 머리글을 주지 않아 캔버스가 막힌다
 * (2026-09-28 확인) — 서버에서 합성하는 경로가 생기면 넣는다. 그 자리에는 쿠키 잔액 알약을 둔다.
 */

import {
  BEST_FRIEND_LABEL,
  byRoleOrder,
  canAddRole,
  familyMembersOnly,
  familyTitle,
  fixedMembers,
  homeMembers,
  isKidRole,
  nextDrawCost,
  ourChildrenNames,
  showsLooksChanged,
  showsOnHome,
  type FamilyMember,
} from "@/lib/family";
import type { ChildPrefs, Gender } from "@/lib/prefs";
import { ageText, displayName, familyExampleSrc, ROLE_STICKER, stemOf, type Colors } from "./family-ui";
import { FamilyGroupPhoto } from "./FamilyGroupPhoto";
import { PortraitImg } from "./Figures";
import { BackIcon, CookieIcon, LockIcon, NextIcon, PlusIcon, Silhouette } from "./icons";
import { BigButton, BottomBar } from "./ui";

export function AlbumView({
  colors,
  background,
  child,
  family,
  tokens,
  master,
  onHome,
  onCard,
  onChanged,
  onAdd,
  onAddFriend,
  onCreate,
}: {
  colors: Colors;
  background: string;
  child: ChildPrefs;
  family: FamilyMember[];
  tokens: number;
  master: boolean;
  onHome: () => void;
  onCard: (id: string) => void;
  /** '모습이 바뀌었어요' 카드 — 다시 그릴지 묻는 시트를 연다 */
  onChanged: (id: string) => void;
  onAdd: () => void;
  /** 단짝 친구 넣기 */
  onAddFriend: () => void;
  onCreate: () => void;
}) {
  // 얼굴을 고정한 가족(단짝 친구 뺌) — '홈 사진에 보일 사람이 없어요'는 가족을 고정하고 모두 껐을 때만.
  // 단짝 친구는 처음 값이 '홈 사진 끔'이라, 친구만 고정한 때를 '모두 껐다'로 보면 안 된다(홈 FamilyFrame 과 같은 규칙).
  const fixedKin = familyMembersOnly(fixedMembers(family));
  const onHomeNow = homeMembers(family);
  const kin = byRoleOrder(familyMembersOnly(family));
  const friends = family.filter((m) => m.role === "friend");
  // 단짝 친구 칸 머리 — 홈 보이기를 켰으면 '가족 사진엔 안 나와요'가 사실과 반대가 된다.
  const friendOnHome = friends.some((f) => showsOnHome(f));
  const friendNote = friendOnHome
    ? friends.some((f) => f.portrait && showsOnHome(f))
      ? "홈 사진에도 나와요"
      : "얼굴을 고정하면 홈 사진에도 나와요"
    : "가족 사진엔 안 나와요";
  const title = familyTitle(ourChildrenNames(child.name, family));
  const isChanged = (m: FamilyMember) => showsLooksChanged(m, child);
  const changedList = byRoleOrder(family.filter(isChanged));

  const card = (m: FamilyMember) => {
    const changed = isChanged(m);
    return (
      <MemberCard
        key={m.id}
        member={m}
        colors={colors}
        changed={changed}
        onClick={() => (changed ? onChanged(m.id) : onCard(m.id))}
      />
    );
  };

  return (
    <>
      <div className="flex flex-col rounded-[28px] bg-white/[.93] px-4 pb-5 pt-3.5 shadow-xl backdrop-blur">
        <div className="flex min-h-11 items-center justify-between gap-2">
          <button
            type="button"
            onClick={onHome}
            className="flex h-11 items-center gap-0.5 rounded-full bg-neutral-100 pl-2 pr-3.5 text-sm font-extrabold text-neutral-700 transition hover:bg-neutral-200"
          >
            <BackIcon size={18} />홈
          </button>
          <span className="min-w-0 truncate text-lg font-extrabold text-neutral-800">{title}</span>
          {/* 역할 없는 span 의 aria-label 은 화면 읽기가 무시한다 — 뜻은 보이지 않는 글자로 붙인다. */}
          <span className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-neutral-100 px-3 text-sm font-extrabold text-neutral-700">
            <CookieIcon size={18} />
            {master ? (
              <>
                관리자<span className="sr-only">는 쿠키가 들지 않아요</span>
              </>
            ) : (
              <>
                <span className="sr-only">내 쿠키 </span>
                {tokens}
                <span className="sr-only">개</span>
              </>
            )}
          </span>
        </div>

        {/* 단체 사진 액자 */}
        <div
          className="relative mt-3 rounded-3xl bg-white p-[5px]"
          style={{ boxShadow: `0 0 0 2px ${colors.accent}, 0 10px 20px -8px rgba(60,40,25,.3)` }}
        >
          <FamilyGroupPhoto
            members={onHomeNow}
            childAge={child.age}
            parents={child.parents}
            height={186}
            background={background}
            className="rounded-[20px]"
            empty={fixedKin.length > 0 ? <HiddenFrame /> : <EmptyFrame childGender={child.gender} />}
          />
        </div>
        <p className="mt-2.5 text-center text-xs font-semibold text-neutral-500">
          {onHomeNow.length > 0
            ? "홈 첫 화면에도 이 사진이 보여요"
            : fixedKin.length > 0
              ? "홈에는 명패 한 줄만 보여요"
              : "나라를 바꾸면 가족도 그 나라로 놀러 가요"}
        </p>

        {/* 모습이 바뀐 고정된 사람 — 설정에서 바꿔도 여기서 알린다. 카드가 아래로 밀려 있어도 보이게 한 줄 더. */}
        {changedList.length > 0 && (
          <button
            type="button"
            onClick={() => onChanged(changedList[0].id)}
            className="mt-3 flex min-h-12 w-full items-center gap-2.5 rounded-2xl px-3.5 text-left"
            style={{ background: colors.accentSoft, boxShadow: `inset 0 0 0 1px ${colors.accent}55` }}
          >
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-orange-500" />
            <span className="min-w-0 flex-1 break-keep text-[13px] font-extrabold" style={{ color: colors.accentDark }}>
              {changedList.length === 1
                ? `${stemOf(changedList[0])} 모습이 바뀌었어요 · 다시 그릴지 골라 주세요`
                : `모습이 바뀐 사람이 ${changedList.length}명 있어요 · 다시 그릴지 골라 주세요`}
            </span>
            <span style={{ color: colors.accentDark }}>
              <NextIcon size={16} />
            </span>
          </button>
        )}

        {master && (
          <p className="mt-3 rounded-2xl bg-neutral-100 px-3.5 py-2 text-center text-xs font-extrabold text-neutral-600">
            관리자는 쿠키가 들지 않아요
          </p>
        )}

        <p className="mt-5 text-sm font-extrabold text-neutral-500">
          우리 가족 · {kin.length}명 <span className="font-bold">(얼굴 고정 {kin.filter((m) => m.portrait).length}명)</span>
        </p>

        <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {kin.map(card)}
          <button
            type="button"
            onClick={onAdd}
            className="flex h-44 flex-col items-center justify-center gap-1.5 rounded-3xl border-2 border-dashed border-neutral-300 bg-white/60 transition hover:bg-white"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-neutral-100 text-neutral-600">
              <PlusIcon />
            </span>
            <span className="text-sm font-extrabold text-neutral-700">가족 더하기</span>
            <span className="text-xs font-bold text-neutral-500">넣기만 하면 0개</span>
          </button>
        </div>

        {/* 단짝 친구 — 가족 아래 따로. 가족이 아니라 숫자·명패에 안 든다. */}
        {(friends.length > 0 || canAddRole(family, "friend")) && (
          <>
            <p className="mt-6 text-sm font-extrabold text-neutral-500">
              {BEST_FRIEND_LABEL} <span className="font-bold">· {friendNote}</span>
            </p>
            <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {friends.map(card)}
              {canAddRole(family, "friend") && (
                <button
                  type="button"
                  onClick={onAddFriend}
                  className="flex h-44 flex-col items-center justify-center gap-1.5 rounded-3xl border-2 border-dashed border-neutral-300 bg-white/60 transition hover:bg-white"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ROLE_STICKER.friend} alt="" aria-hidden className="h-12 w-12 object-contain" />
                  <span className="text-sm font-extrabold text-neutral-700">{BEST_FRIEND_LABEL} 넣기</span>
                  <span className="text-xs font-bold text-neutral-500">한 명만 · 넣기만 하면 0개</span>
                </button>
              )}
            </div>
          </>
        )}

        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs font-semibold text-neutral-500">
          <LockIcon size={14} />
          가족 그림은 우리 가족만 볼 수 있어요.
        </p>
      </div>

      <BottomBar>
        <BigButton colors={colors} onClick={onCreate}>
          우리 가족 동화 만들기
        </BigButton>
      </BottomBar>
    </>
  );
}

function MemberCard({
  member: m,
  colors,
  changed,
  onClick,
}: {
  member: FamilyMember;
  colors: Colors;
  /** 그린 뒤로 '늘 그대로'가 바뀌었다 */
  changed: boolean;
  onClick: () => void;
}) {
  const kid = isKidRole(m.role);
  const name = displayName(m);
  const age = m.role === "sibling" || m.role === "friend" ? ageText(m.age) : "";

  // 모습이 바뀌었어요 — 시안 Album 의 할아버지 카드. '나중에'를 눌러도 다시 그릴 때까지 남는다.
  if (changed && m.portrait) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="relative flex h-44 flex-col overflow-hidden rounded-3xl text-left"
        style={{ background: colors.accentSoft, boxShadow: `0 0 0 2px ${colors.accent}66, 0 2px 8px rgba(60,40,25,.10)` }}
      >
        <span className="relative flex h-[120px] w-full items-end justify-center">
          <PortraitImg p={m.portrait} className="w-auto max-w-none" style={{ height: kid ? 84 : 106 }} />
        </span>
        <span
          className="absolute left-2 top-2 rounded-full px-2.5 py-[3px] text-[11px] font-extrabold"
          style={{ background: colors.accentSoft, color: colors.accentDark, boxShadow: `inset 0 0 0 1px ${colors.accent}66` }}
        >
          모습이 바뀌었어요
        </span>
        <span aria-hidden className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-orange-500 shadow-[0_0_0_2px_#fff]" />
        <span className="flex flex-1 flex-col justify-center gap-0.5 bg-white px-3">
          <span className="truncate text-[15px] font-extrabold text-neutral-800">
            {name}
            {age && <span className="text-xs font-bold text-neutral-500"> · {age}</span>}
          </span>
          <span className="truncate text-xs font-semibold" style={{ color: colors.accentDark }}>
            다시 그릴지 골라 주세요
          </span>
        </span>
      </button>
    );
  }

  // 확인 전 그림이 있으면 그걸 먼저 보여 준다(고정된 사람이 다시 그린 경우 포함).
  if (m.draft) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="relative flex h-44 flex-col overflow-hidden rounded-3xl text-left"
        style={{ background: colors.accentSoft, boxShadow: `0 0 0 2px ${colors.accent}66, 0 2px 8px rgba(60,40,25,.10)` }}
      >
        <span className="relative flex h-[120px] w-full items-end justify-center">
          <PortraitImg p={m.draft} className="w-auto max-w-none" style={{ height: kid ? 84 : 108 }} />
        </span>
        <span
          className="absolute left-2 top-2 rounded-full bg-white px-2.5 py-[3px] text-[11px] font-extrabold"
          style={{ color: colors.accentDark, boxShadow: `inset 0 0 0 1px ${colors.accent}66` }}
        >
          {m.portrait ? "새 그림이 있어요" : "확인해 주세요"}
        </span>
        <span aria-hidden className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-orange-500 shadow-[0_0_0_2px_#fff]" />
        <span className="flex flex-1 flex-col justify-center gap-0.5 bg-white px-3">
          <span className="truncate text-[15px] font-extrabold text-neutral-800">{name}</span>
          <span className="truncate text-xs font-semibold" style={{ color: colors.accentDark }}>
            {m.portrait ? "어느 쪽이 좋은지 골라 주세요" : "마음에 드는지 골라 주세요"}
          </span>
        </span>
      </button>
    );
  }

  if (m.portrait) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="relative flex h-44 flex-col overflow-hidden rounded-3xl text-left shadow-[0_2px_8px_rgba(60,40,25,.10)]"
        style={{ background: colors.accentSoft }}
      >
        <span className="relative flex h-[120px] w-full items-end justify-center">
          <PortraitImg p={m.portrait} className="w-auto max-w-none" style={{ height: kid ? 84 : 110 }} />
        </span>
        {m.role === "child" && (
          <span className="absolute left-2.5 top-2.5 rounded-full px-2.5 py-[3px] text-[11px] font-extrabold text-white" style={{ background: colors.accentDark }}>
            주인공
          </span>
        )}
        <span className="flex flex-1 flex-col justify-center gap-0.5 bg-white px-3">
          <span className="truncate text-[15px] font-extrabold text-neutral-800">
            {name}
            {age && <span className="text-xs font-bold text-neutral-500"> · {age}</span>}
          </span>
          <span className="truncate text-xs font-semibold text-neutral-500">
            {showsOnHome(m) ? "동화마다 이 얼굴로 나와요" : "홈 사진엔 안 보여요"}
          </span>
        </span>
      </button>
    );
  }

  const cost = nextDrawCost(m.draws);
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex h-44 flex-col overflow-hidden rounded-3xl bg-neutral-100 text-left shadow-[0_2px_8px_rgba(60,40,25,.06)]"
    >
      <span className="relative flex h-[120px] w-full items-end justify-center">
        <Silhouette width={kid ? 46 : 50} height={kid ? 90 : 98} className="mb-2" />
      </span>
      <span className="absolute left-2 top-2 rounded-full bg-white px-2.5 py-[3px] text-[11px] font-extrabold text-neutral-600">
        동화마다 새로 그려요
      </span>
      <span className="flex flex-1 flex-col justify-center gap-0.5 bg-white px-3">
        <span className="truncate text-[15px] font-extrabold text-neutral-800">
          {name}
          {age && <span className="text-xs font-bold text-neutral-500"> · {age}</span>}
        </span>
        <span className="flex items-center gap-1 text-xs font-extrabold" style={{ color: colors.accentDark }}>
          <CookieIcon size={14} />
          얼굴 고정하기 · {cost}개
        </span>
      </span>
    </button>
  );
}

/** 고정한 사람은 있지만 모두 '홈 가족 사진에 보이기'를 껐을 때 */
function HiddenFrame() {
  return (
    <span className="max-w-full break-keep rounded-2xl bg-white/90 px-4 py-2 text-center text-xs font-extrabold leading-snug text-neutral-600 shadow">
      홈 가족 사진에 보일 사람이 없어요
      <br />
      <span className="font-bold text-neutral-500">사람을 눌러 &apos;홈 가족 사진에 보이기&apos;를 켜 주세요</span>
    </span>
  );
}

/** 아직 아무도 고정 안 했을 때 — 예시 가족을 흐리게(홈 입구·설정과 같은 단체 그림 — familyExampleSrc) */
function EmptyFrame({ childGender }: { childGender?: Gender }) {
  return (
    <div className="relative flex h-full w-full items-end justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={familyExampleSrc(childGender)}
        alt=""
        aria-hidden
        className="h-full w-auto max-w-full object-contain object-bottom opacity-35"
      />
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-white/90 px-3.5 py-1.5 text-xs font-extrabold text-neutral-600 shadow">
        얼굴을 고정하면 여기 모여요
      </span>
    </div>
  );
}
