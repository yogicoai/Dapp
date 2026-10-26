"use client";

/**
 * 모아 보기에서 사람 카드를 눌렀을 때 — 다시 그리기 · 생김새 고치기 · 예전 그림으로 돌아가기 · 켜기 두 개 · 빼기.
 * 고정 안 된 사람은 '얼굴 고정하기'가 맨 위. 아이(주인공)는 뺄 수 없다.
 * 빼기는 지우지 않는다(2026-10-26 사장님 "회색처럼만") — 뺀 사람(inactive)의 회색 카드를 누르면 '다시 넣기'만 있는 시트가 뜬다.
 * '그림 없이 특징만 저장'한 사람(looksOnly)은 '특징만 저장됨 · 동화마다 이 특징으로 그려요'로 알리고,
 * 같은 '얼굴 고정하기'(쿠키)로 나중에 그릴 수 있다.
 *
 * 켜기(사장님 2026-09-28):
 *  - '홈 가족 사진에 보이기' — 모든 사람. 처음 값은 가족 켬·단짝 친구 끔(showsOnHome). 꺼도 고정한 얼굴은
 *    동화에 그대로 나온다. 모두 끄면 홈은 큰 사진 대신 명패 한 줄.
 *  - '우리 아이예요' — 형제자매만. 켜면 명패에 이름이 같이 선다(하온·하린이네 가족).
 *
 * 이름(형제자매·단짝 친구 — 사장님 2026-09-30 "남동생이 아니라 이름으로 넣게 해줄수도 있게 해줘야해"):
 * 맨 위 그림 옆 이름 아래에 이름 칸 + '저장'. 명패에는 진짜 이름만 서므로(lib/family ourChildrenNames) '우리 아이예요'는
 * 이름이 있어야 켜진다 — 이름 없이 켜면 이름 칸으로 초점을 옮기고, 이름을 적어 저장하면 그때 같이 켠다. 켠 채로 이름을
 * 지우는 저장은 막는다(먼저 끄게). 예전에 이름 없이 켜 둔 형제는 설명 줄이 이름을 적으라고 알린다.
 */

import { useId, useRef, useState, type ReactNode } from "react";
import { BEST_FRIEND_LABEL, drawPrice, showsOnHome, type FamilyMember } from "@/lib/family";
import { displayName, objectOf, ourChildHint, type Colors } from "./family-ui";
import { PortraitImg } from "./Figures";
import { NextIcon, Silhouette } from "./icons";
import { Sheet } from "./Sheet";
import { ReportSheet } from "@/components/ReportSheet";
import { BigButton, CookiePill, costText, SwitchRow } from "./ui";

export function MemberSheet({
  colors,
  member: m,
  childName,
  family,
  master,
  freeDraws = 0,
  looksPicked,
  onClose,
  onReview,
  onRedraw,
  onFix,
  onEditLooks,
  onHistory,
  onShowOnHome,
  onOurChild,
  onRename,
  onRemove,
  onRestore,
}: {
  colors: Colors;
  member: FamilyMember;
  /** 아이 이름 — '우리 아이예요' 설명의 명패 예 */
  childName: string;
  /** 생김새를 하나라도 골랐다 — '특징만 저장됨' 설명 글자를 고른다 */
  looksPicked: boolean;
  /** 지금 가족 — 명패 예에 이미 '우리 아이'인 형제까지 넣는다 */
  family: FamilyMember[];
  master: boolean;
  /** 관리실이 더해 준 무료 생성 남은 횟수 — 쿠키가 드는 그리기에 먼저 쓴다(lib/family drawPrices) */
  freeDraws?: number;
  onClose: () => void;
  onReview: () => void;
  onRedraw: () => void;
  onFix: () => void;
  onEditLooks: () => void;
  /** '예전 그림으로 돌아가기' — 그 사람을 그린 예전 그림 목록을 연다(사장님 2026-10-14) */
  onHistory: () => void;
  /** '홈 가족 사진에 보이기' 켜기·끄기 */
  onShowOnHome: (on: boolean) => void;
  /** '우리 아이예요' 켜기·끄기(형제자매만) */
  onOurChild: (on: boolean) => void;
  /**
   * 이름 저장(형제자매·단짝 친구) — 빈 글자면 이름 없음. ourChild 가 true 면 '우리 아이예요'도 같이 켠다(이름이 없어서
   * 켜기를 미뤄 둔 경우 — 한 번에 저장해야 이름 없는 '우리 아이'가 잠깐도 생기지 않는다).
   */
  onRename: (name: string, ourChild?: boolean) => void;
  /** 빼기 — 지우지 않고 회색(inactive)으로 둔다 */
  onRemove: () => void;
  /** 뺀 사람 다시 넣기(회색 카드) */
  onRestore: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const [reporting, setReporting] = useState(false);
  const pic = m.draft ?? m.portrait;
  // 관리실이 더해 준 무료 생성이 있으면 쿠키 대신 그걸 쓴다
  const { cost, free } = drawPrice(m.draws, master ? 0 : freeDraws);
  const name = displayName(m);
  const fixedOrDrawn = Boolean(m.portrait || m.draft);
  const friend = m.role === "friend";
  const onHome = showsOnHome(m);
  // 이름 칸(형제자매·단짝 친구)
  const named = m.role === "sibling" || friend;
  const saved = (m.name ?? "").trim();
  const [nameDraft, setNameDraft] = useState(m.name ?? "");
  /** '우리 아이예요'를 켜려는데 이름이 없었다 — 이름을 저장하면 같이 켠다 */
  const [wantOurChild, setWantOurChild] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const nameId = useId();
  const typed = nameDraft.trim();
  // 켠 채로 이름을 지우는 저장은 막는다(명패에 이름 없는 '우리 아이'가 남지 않게 — 먼저 끄게). 예전에 이름 없이 켜 둔
  // 형제는 막을 게 없다 — 스위치 설명 줄이 이름을 적으라고 알린다(family-ui ourChildHint).
  const nameBlocked = Boolean(m.isOurChild) && Boolean(saved) && !typed;
  const canSave = named && typed !== saved && !nameBlocked;
  const saveName = () => {
    if (!canSave && !(wantOurChild && typed)) return;
    onRename(typed, wantOurChild && typed ? true : undefined);
    setWantOurChild(false);
  };
  const toggleOurChild = (on: boolean) => {
    if (on && !saved) {
      // 적어 두고 아직 저장 안 한 이름이 있으면 이름과 함께 켠다, 없으면 이름 칸으로
      if (typed) {
        onRename(typed, true);
        setWantOurChild(false);
      } else {
        setWantOurChild(true);
        nameRef.current?.focus();
      }
      return;
    }
    setWantOurChild(false);
    onOurChild(on);
  };

  // AI 가 그린 그림 신고(2026-10-20, 구글 플레이 AI 콘텐츠 정책) — 이 시트 자리에 신고 시트를 띄운다
  if (reporting) {
    return (
      <ReportSheet kind="portrait" targetId={m.id} targetLabel={`${name} 캐릭터 그림`} onClose={() => setReporting(false)} />
    );
  }

  // 뺀 사람 — 회색으로 남아 있다. 다시 넣기만 고른다(그림·생김새 그대로).
  if (m.inactive) {
    return (
      <Sheet onClose={onClose} label={`${name} 메뉴`}>
        <div className="mt-4 flex w-full items-center gap-3.5">
          <div className="flex h-24 w-[72px] shrink-0 items-end justify-center overflow-hidden rounded-2xl bg-neutral-100 grayscale">
            {pic ? (
              <PortraitImg p={pic} alt="" className="h-[88px] w-auto max-w-none opacity-70" />
            ) : (
              <Silhouette width={40} height={78} className="mb-1.5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xl font-extrabold text-neutral-500">{name}</p>
            {friend && <p className="text-xs font-extrabold text-neutral-400">{BEST_FRIEND_LABEL}</p>}
            <p className="mt-0.5 break-keep text-[13px] font-semibold text-neutral-500">
              빠져 있어요 — 동화와 홈 사진에 안 나와요. {fixedOrDrawn ? "그린 그림은 그대로 있어요." : ""}
            </p>
          </div>
        </div>
        <div className="mt-4 flex w-full flex-col gap-2">
          <BigButton colors={colors} onClick={onRestore}>
            {friend ? `${BEST_FRIEND_LABEL}로 다시 넣기` : "우리 가족에 다시 넣기"}
          </BigButton>
        </div>
        <button type="button" onClick={onClose} className="mt-1 min-h-11 px-3.5 text-sm font-extrabold text-neutral-500">
          닫기
        </button>
      </Sheet>
    );
  }

  if (asking) {
    return (
      <Sheet onClose={() => setAsking(false)} label={`${name} 빼기`}>
        <h2 className="mt-5 break-keep text-center text-[20px] font-extrabold text-neutral-800">
          {friend ? `${objectOf(m)} 뺄까요?` : `${objectOf(m)} 우리 가족에서 뺄까요?`}
        </h2>
        <p className="mt-2 break-keep text-center text-sm font-medium leading-normal text-neutral-600">
          동화와 홈 사진에 안 나와요. {fixedOrDrawn ? "그린 그림은 지우지 않아요 — " : ""}회색으로 남아 있어서 누르면 언제든 다시 넣을 수 있어요.
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
                : m.looksOnly
                  ? `특징만 저장됨 · ${looksPicked ? "동화마다 이 특징으로 그려요" : "동화마다 알아서 그려요"}`
                  : "동화마다 새로 그려요"}
          </p>
        </div>
      </div>

      {named && (
        <form
          className="mt-3 w-full"
          onSubmit={(e) => {
            e.preventDefault();
            saveName();
          }}
        >
          <label htmlFor={nameId} className="mb-1.5 block text-xs font-extrabold text-neutral-500">
            {friend ? "친구 이름" : `이름 · 부르는 말(${m.callName})은 그대로예요`}
          </label>
          <div className="flex w-full items-center gap-2">
            <input
              ref={nameRef}
              id={nameId}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value.slice(0, 20))}
              maxLength={20}
              placeholder={friend ? "예) 서준" : "예) 수아"}
              aria-invalid={nameBlocked || (wantOurChild && !typed) || undefined}
              className={`min-h-[52px] min-w-0 flex-1 rounded-2xl border-2 px-4 py-2.5 text-lg font-extrabold outline-none placeholder:font-medium placeholder:text-neutral-500 focus:border-neutral-400 ${
                nameBlocked || (wantOurChild && !typed) ? "border-rose-300" : "border-neutral-200"
              }`}
            />
            <button
              type="submit"
              disabled={!(canSave || (wantOurChild && typed))}
              className="flex h-[52px] shrink-0 items-center justify-center rounded-2xl px-4 text-[15px] font-extrabold text-white transition disabled:opacity-40"
              style={{ background: colors.accentDark }}
            >
              저장
            </button>
          </div>
          {(nameBlocked || wantOurChild) && (
            <p role="alert" className="mt-1.5 break-keep px-1 text-xs font-bold text-rose-600">
              {nameBlocked
                ? "우리 아이는 이름이 있어야 해요 · 지우려면 아래 '우리 아이예요'를 먼저 꺼 주세요"
                : "이름을 적고 저장하면 '우리 아이예요'가 켜져요"}
            </p>
          )}
        </form>
      )}

      <div className="mt-4 flex w-full flex-col gap-2">
        {m.draft && (
          <BigButton colors={colors} onClick={onReview}>
            확인하러 가기
          </BigButton>
        )}
        {!fixedOrDrawn && (
          <BigButton colors={colors} onClick={onFix}>
            얼굴 고정하기
            <CookiePill colors={colors} text={master ? "관리자 0개" : free ? "무료 생성" : `쿠키 ${cost}개`} />
          </BigButton>
        )}
        <div className="mt-1 flex flex-col gap-2">
          {fixedOrDrawn && (
            <Action
              icon="/icons/func-remake.webp"
              label="다시 그리기"
              right={costText(cost, master, free)}
              onClick={onRedraw}
              colors={colors}
            />
          )}
          <Action icon="/icons/func-edit.webp" label="생김새 고치기" onClick={onEditLooks} colors={colors} />
          {/* 한 번이라도 그린 사람 — 예전에 그린 얼굴이 더 마음에 들면 그리로 돌아간다(쿠키 0개, HistorySheet) */}
          {fixedOrDrawn && (
            <Action icon="/icons/func-cleanup.webp" label="예전 그림으로 돌아가기" right="쿠키 0개" onClick={onHistory} colors={colors} />
          )}
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
              onChange={toggleOurChild}
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
          {fixedOrDrawn && (
            <button
              type="button"
              onClick={() => setReporting(true)}
              className="flex min-h-11 w-full items-center justify-center rounded-2xl text-[13px] font-extrabold text-neutral-500 transition hover:bg-neutral-50"
            >
              그림이 이상하거나 불편하면 신고하기
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
