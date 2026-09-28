"use client";

/**
 * 모아 보기에서 사람 카드를 눌렀을 때 — 다시 그리기 · 생김새 고치기 · 켜기 두 개 · 빼기.
 * 고정 안 된 사람은 '얼굴 고정하기'가 맨 위. 아이(주인공)는 뺄 수 없다.
 *
 * 켜기(사장님 2026-09-28):
 *  - '홈 가족 사진에 보이기' — 모든 사람. 처음 값은 가족 켬·단짝 친구 끔(showsOnHome). 꺼도 고정한 얼굴은
 *    동화에 그대로 나온다. 모두 끄면 홈은 큰 사진 대신 명패 한 줄.
 *  - '우리 아이예요' — 형제자매만. 켜면 명패에 이름이 같이 선다(하온·하린이네 가족).
 */

import { useState, type ReactNode } from "react";
import { BEST_FRIEND_LABEL, nextDrawCost, showsOnHome, type FamilyMember } from "@/lib/family";
import { displayName, objectOf, ourChildHint, type Colors } from "./family-ui";
import { PortraitImg } from "./Figures";
import { NextIcon, Silhouette } from "./icons";
import { Sheet } from "./Sheet";
import { BigButton, CookiePill, costText, SwitchRow } from "./ui";

export function MemberSheet({
  colors,
  member: m,
  childName,
  family,
  master,
  onClose,
  onReview,
  onRedraw,
  onFix,
  onEditLooks,
  onShowOnHome,
  onOurChild,
  onRemove,
}: {
  colors: Colors;
  member: FamilyMember;
  /** 아이 이름 — '우리 아이예요' 설명의 명패 예 */
  childName: string;
  /** 지금 가족 — 명패 예에 이미 '우리 아이'인 형제까지 넣는다 */
  family: FamilyMember[];
  master: boolean;
  onClose: () => void;
  onReview: () => void;
  onRedraw: () => void;
  onFix: () => void;
  onEditLooks: () => void;
  /** '홈 가족 사진에 보이기' 켜기·끄기 */
  onShowOnHome: (on: boolean) => void;
  /** '우리 아이예요' 켜기·끄기(형제자매만) */
  onOurChild: (on: boolean) => void;
  onRemove: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const pic = m.draft ?? m.portrait;
  const cost = nextDrawCost(m.draws);
  const name = displayName(m);
  const fixedOrDrawn = Boolean(m.portrait || m.draft);
  const friend = m.role === "friend";
  const onHome = showsOnHome(m);

  if (asking) {
    return (
      <Sheet onClose={() => setAsking(false)} label={`${name} 빼기`}>
        <h2 className="mt-5 break-keep text-center text-[20px] font-extrabold text-neutral-800">
          {friend ? `${objectOf(m)} 뺄까요?` : `${objectOf(m)} 우리 가족에서 뺄까요?`}
        </h2>
        <p className="mt-2 break-keep text-center text-sm font-medium leading-normal text-neutral-600">
          {fixedOrDrawn
            ? "그린 그림도 같이 지워져요. 다시 넣으면 처음부터 새로 그려야 해요."
            : "빼도 이미 만든 동화는 그대로예요."}
        </p>
        <button
          type="button"
          onClick={onRemove}
          className="mt-5 flex min-h-[54px] w-full items-center justify-center rounded-full bg-rose-500 text-[18px] font-extrabold text-white shadow-[0_6px_0_#be123c] transition active:translate-y-[3px]"
        >
          뺄게요
        </button>
        <button type="button" onClick={() => setAsking(false)} className="mt-3 min-h-11 px-3.5 text-sm font-extrabold text-neutral-600">
          그대로 둘게요
        </button>
      </Sheet>
    );
  }

  return (
    <Sheet onClose={onClose} label={`${name} 메뉴`}>
      <div className="mt-4 flex w-full items-center gap-3.5">
        <div className="flex h-24 w-[72px] shrink-0 items-end justify-center overflow-hidden rounded-2xl" style={{ background: colors.accentSoft }}>
          {pic ? (
            <PortraitImg p={pic} alt="" className="h-[88px] w-auto max-w-none" />
          ) : (
            <Silhouette width={40} height={78} className="mb-1.5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xl font-extrabold text-neutral-800">{name}</p>
          {friend && <p className="text-xs font-extrabold text-neutral-500">{BEST_FRIEND_LABEL}</p>}
          <p className="mt-0.5 break-keep text-[13px] font-semibold text-neutral-500">
            {m.draft
              ? "새 그림을 아직 확인하지 않았어요"
              : m.portrait
                ? "얼굴이 고정됐어요 — 동화마다 이 모습으로 나와요"
                : "동화마다 새로 그려요"}
          </p>
        </div>
      </div>

      <div className="mt-4 flex w-full flex-col gap-2">
        {m.draft && (
          <BigButton colors={colors} onClick={onReview}>
            확인하러 가기
          </BigButton>
        )}
        {!fixedOrDrawn && (
          <BigButton colors={colors} onClick={onFix}>
            얼굴 고정하기
            <CookiePill colors={colors} text={master ? "관리자 0개" : `쿠키 ${cost}개`} />
          </BigButton>
        )}
        <div className="mt-1 flex flex-col gap-2">
          {fixedOrDrawn && (
            <Action
              icon="/icons/func-remake.webp"
              label="다시 그리기"
              right={costText(cost, master)}
              onClick={onRedraw}
              colors={colors}
            />
          )}
          <Action icon="/icons/func-edit.webp" label="생김새 고치기" onClick={onEditLooks} colors={colors} />
          <SwitchRow
            on={onHome}
            onChange={onShowOnHome}
            label="홈 가족 사진에 보이기"
            hint={
              !m.portrait
                ? "얼굴을 고정하면 홈 단체 사진에 서요"
                : onHome
                  ? "홈 첫 화면 단체 사진에 서요"
                  : "꺼도 고정한 얼굴은 동화에 그대로 나와요"
            }
            colors={colors}
          />
          {m.role === "sibling" && (
            <SwitchRow
              on={Boolean(m.isOurChild)}
              onChange={onOurChild}
              label="우리 아이예요"
              hint={ourChildHint(childName, family, m)}
              colors={colors}
            />
          )}
          {m.role !== "child" && (
            <button
              type="button"
              onClick={() => setAsking(true)}
              className="flex min-h-[52px] w-full items-center justify-center rounded-2xl text-[15px] font-extrabold text-rose-600 transition hover:bg-rose-50"
            >
              {friend ? `${BEST_FRIEND_LABEL} 빼기` : "우리 가족에서 빼기"}
            </button>
          )}
        </div>
      </div>
      <button type="button" onClick={onClose} className="mt-1 min-h-11 px-3.5 text-sm font-extrabold text-neutral-500">
        닫기
      </button>
    </Sheet>
  );
}

function Action({
  icon,
  label,
  right,
  onClick,
  colors,
}: {
  icon: string;
  label: string;
  right?: ReactNode;
  onClick: () => void;
  colors: Colors;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[56px] w-full items-center gap-3 rounded-2xl bg-neutral-50 px-3.5 text-left shadow-[inset_0_0_0_1px_#f0ede8] transition hover:bg-neutral-100"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={icon} alt="" aria-hidden className="h-8 w-8 object-contain" />
      <span className="flex-1 text-[15px] font-extrabold text-neutral-800">{label}</span>
      {right && (
        <span className="text-xs font-extrabold" style={{ color: colors.accentDark }}>
          {right}
        </span>
      )}
      <span className="text-neutral-400">
        <NextIcon size={16} />
      </span>
    </button>
  );
}
