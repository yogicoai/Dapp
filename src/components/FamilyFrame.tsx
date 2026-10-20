"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { displayName, familyExampleSrc } from "@/components/family/family-ui";
import { FaceAvatar } from "@/components/family/Figures";
import { FamilyGroupPhoto } from "@/components/family/FamilyGroupPhoto";
import { NextIcon } from "@/components/family/icons";
import { OutfitPicker } from "@/components/family/OutfitPicker";
import { StudioSheet } from "@/components/family/StudioSheet";
import { useTheme } from "@/components/ThemeProvider";
import {
  familyMembersOnly,
  familyTitle,
  fixedMembers,
  groupOrder,
  homeGreeting,
  homeMembers,
  ourChildrenNames,
  type FamilyMember,
} from "@/lib/family";
import type { MemberOutfit, OutfitThemeId } from "@/lib/family-outfit";
import type { FamilyStudio } from "@/lib/family-studio";
import { loadFamilyOffer } from "@/lib/library-access";
import { DEFAULT_FAMILY_OFFER, type FamilyOfferNote } from "@/lib/offer-settings";
import { creditsText } from "@/lib/plans";
import type { ChildPrefs, Gender } from "@/lib/prefs";

/**
 * 홈 맨 위 '○○이네 가족' 액자 — 시안 Main(가족 없음)·HomeFamily(가족 있음).
 *
 * 사장님이 이 자리(제목 아래, 예전 마스코트 큰 원·부제 알약 자리)를 특히 좋아했다.
 * 세 가지 모습:
 *  - 홈에 설 사람도, 고정한 가족도 없으면 '입구' 폴라로이드: 예시 가족 그림 + '우리 가족 그리기'
 *    (단짝 친구만 고정했어도 — 단짝 친구는 가족이 아니고 처음 값이 '홈 사진 끔'이다).
 *  - '홈 가족 사진에 보이기'를 켠 고정된 사람이 있으면 단체 사진(그 사람들만 — homeMembers)
 *    + 명패('○○이네 가족 ›' → /family).
 *  - 고정한 가족은 있는데 모두 홈 보이기를 껐으면 큰 사진 대신 명패 한 줄 알약만(작은 얼굴 없이).
 *    끈 사람도 고정 얼굴은 그대로라 동화엔 나온다(사장님 2026-09-28).
 * 명패는 아이 이름에 '우리 아이예요'를 켠 형제의 진짜 이름까지 — '하온·하린이네 가족'(이름 없는 형제·단짝 친구는
 * 안 들어간다 — lib/family ourChildrenNames).
 * 앞의 둘은 '접기·펼치기'가 된다(사장님 2026-09-28 — '나중에' 대신). 접으면 한 줄 알약.
 * 명패 한 줄은 이미 한 줄이라 접지 않는다.
 * 접은 값은 **아이디(계정)마다 저장**한다 — ChildPrefs.homeFamilyFolded(profiles.child). 그래서
 * 앱을 다시 열어도, 다른 기기에서 같은 아이디로 들어와도 그대로다. 저장은 홈(page.tsx)이 맡고
 * 이 컴포넌트는 값을 받아 그리기만 한다. 처음(저장값 없음)은 펼친 채로 — 예시 가족이 보이게.
 * 탭(세계명작·전래동화)을 옮겨도 저절로 접지 않는다(사장님: 위에 펴져 있어도 된다).
 * 게스트는 그릴 수 없으니 아예 그리지 않는다.
 * 단체 사진의 사람을 누르면 폴짝 뛰고 그 사람 위에 인사 말풍선이 2초쯤 뜬다(시안 HomeFamily) — 어른·형·누나는
 * '하온아, 안녕!', 동생(남동생·여동생·아이보다 어린 사람)은 '안녕!', 아이 자신은 '안녕! 반가워'(lib/family homeGreeting).
 * 목소리 인사는 아직 없다 — 말풍선만 먼저.
 * 단체 사진 명패 옆 '꾸미기'는 가족 사진관 시트(StudioSheet — 배경 고르기·스티커, 사장님 2026-09-30)를 연다.
 * 접힘처럼 계정마다 저장(ChildPrefs.familyStudio) — 저장은 홈이, 이 컴포넌트는 값을 받아 그리고 시트만 연다.
 */

type Greet = { text: string; x: number; bottom: number; n: number };

type Props = {
  childName: string;
  childAge: number | null;
  /** 설정의 엄마·아빠 생김새 — 단체 사진 키 비율에 키 칩(parents.mom/dad.height)을 쓴다. */
  parents?: ChildPrefs["parents"];
  /** 아이 성별 — 예시 가족 그림을 고른다(여자아이면 딸 가족, 그 밖엔 아들 가족). */
  childGender?: Gender;
  family: FamilyMember[] | undefined;
  guest: boolean;
  /** 계정에 저장된 접힘 값(없으면 펼침) */
  folded?: boolean;
  /** 접기·펼치기를 눌렀을 때 — 홈이 계정에 저장한다 */
  onFoldedChange?: (folded: boolean) => void;
  /** 가족 사진관 — 고른 배경·붙인 스티커(계정에 저장된 값) */
  studio?: FamilyStudio;
  /** 꾸미기 시트에서 바꿀 때마다 — 홈이 계정에 저장한다. 없으면 '꾸미기' 버튼을 안 보인다. */
  onStudioChange?: (studio: FamilyStudio) => void;
  /**
   * 옷 갈아입기(사장님 2026-09-30 — 힉스필드로 미리 만든 테마 몸 + 가족 원래 머리) — 한 사람 옷 한 벌을 받았을 때 홈이 저장한다.
   * outfitEnabled 가 아니거나 없으면 꾸미기 시트에 '옷 갈아입기' 줄을 안 보인다(2026-09-30 부터 모든 회원).
   */
  outfitEnabled?: boolean;
  onMemberOutfit?: (memberId: string, theme: OutfitThemeId, outfit: MemberOutfit) => void;
};

/* ── 태블릿 판별(단체 사진 무대 높이) ── Tailwind sm 과 같은 40rem. */
const WIDE_QUERY = "(min-width: 40rem)";

function subscribeWide(cb: () => void): () => void {
  const mq = window.matchMedia(WIDE_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/*
 * 예시 가족 — 할아버지·할머니·엄마·아이·동생·아빠가 꽉 찬 단체 그림 한 장(투명 webp).
 * 아이 성별에 따라 두 벌: 아들 가족(아들+여동생) / 딸 가족(딸+남동생). 실제로 그려지는 얼굴이
 * 아니라 '이런 모습이 돼요' 하는 단순 예시다(2026-09-28 사장님). 예전 세 장 조합은 아빠 머리가
 * 너무 커서 바꿨다. 파일 주소는 family-ui familyExampleSrc(모아 보기·설정과 같은 그림).
 */

/** 명패 글꼴 — 손글씨(Gaegu). 레이아웃에서 --font-gaegu 로 싣는다. */
const HAND_FONT = "var(--font-gaegu), 'Pretendard Variable', Pretendard, sans-serif";

export function FamilyFrame({
  childName,
  childAge,
  parents,
  childGender,
  family,
  guest,
  folded,
  onFoldedChange,
  studio,
  onStudioChange,
  outfitEnabled = false,
  onMemberOutfit,
}: Props) {
  const { theme } = useTheme();
  const { accent, accentDark, accentSoft } = theme.colors;
  // 가족 그리기 안내 한 줄 값(가족 패스에 든 캐릭터 수 · 더 그릴 때 크레딧) — 못 읽으면 기본값 그대로.
  const [familyOffer, setFamilyOffer] = useState<FamilyOfferNote>(DEFAULT_FAMILY_OFFER);
  useEffect(() => {
    if (guest) return;
    let alive = true;
    void loadFamilyOffer().then((o) => {
      if (alive) setFamilyOffer(o);
    });
    return () => {
      alive = false;
    };
  }, [guest]);
  // 누른 즉시 바뀌게 화면 상태를 따로 둔다(저장은 800ms 뒤에 올라간다). null 이면 저장값을 따른다.
  const [foldedNow, setFoldedNow] = useState<boolean | null>(null);
  const wide = useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => false,
  );
  // 인사 말풍선 — 누른 사람 머리 위. 2초 조금 넘게 떠 있다 사라진다.
  const stageRef = useRef<HTMLDivElement>(null);
  const [greet, setGreet] = useState<Greet | null>(null);
  useEffect(() => {
    if (!greet) return;
    const t = setTimeout(() => setGreet(null), 2200);
    return () => clearTimeout(t);
  }, [greet]);
  // 가족 사진 꾸미기 시트
  const [studioOpen, setStudioOpen] = useState(false);
  // 옷 갈아입기 시트(꾸미기 시트의 '옷 갈아입기' 줄에서 연다 — 닫으면 꾸미기로 돌아간다)
  const [outfitOpen, setOutfitOpen] = useState(false);

  if (guest) return null;

  const sayHello = (m: FamilyMember, el: HTMLElement) => {
    const box = stageRef.current;
    if (!box) return;
    const b = box.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    // 가로는 그 사람 가운데(액자 안에 들게 양끝을 조금 남기고), 세로는 머리 바로 위(너무 높으면 액자 안으로).
    const x = Math.min(Math.max(r.left + r.width / 2 - b.left, 72), Math.max(72, b.width - 72));
    const bottom = Math.min(Math.max(8, b.bottom - r.top + 6), Math.max(8, b.height - 40));
    // 인사 글자 — 아이 자신은 '안녕! 반가워', 동생은 '안녕!', 어른·형·누나는 '하온아, 안녕!'(lib/family homeGreeting)
    setGreet((g) => ({ text: homeGreeting(m, childName, childAge), x, bottom, n: (g?.n ?? 0) + 1 }));
  };

  // 명패 — 아이 + '우리 아이예요'를 켠 형제의 진짜 이름(하온·하린이네 가족). 이름 없는 형제·단짝 친구는 빠진다.
  const title = familyTitle(ourChildrenNames(childName, family));
  // 얼굴을 고정한 **가족**(단짝 친구 뺌) — 단짝 친구는 처음 값이 '홈 사진 끔'이라, 친구만 고정한 사람을
  // '모두 껐다'로 보면 아무것도 안 껐는데 입구 액자가 사라진다.
  const fixedKin = familyMembersOnly(fixedMembers(family));
  // 단체 사진에 설 사람 — 고정된 사람 중 '홈 가족 사진에 보이기'를 켠 사람(처음 값: 가족 켬, 단짝 친구 끔).
  const onHome = homeMembers(family);
  // 그렸지만 아직 '마음에 들어요'를 안 누른 사람 — 쿠키를 냈으니 잊지 않게 알려 준다.
  const pending = (family ?? []).some((m) => m.draft && !m.portrait);

  // 확인 안 한 그림이 있으면 접지 않는다 — 쿠키를 낸 그림을 잊어버리면 안 된다.
  const open = pending || !(foldedNow ?? folded ?? false);

  const openNow = () => {
    setFoldedNow(false);
    onFoldedChange?.(false);
  };
  const foldNow = () => {
    setFoldedNow(true);
    onFoldedChange?.(true);
  };

  // 액자 테두리는 나라 강조색, 명패 테두리는 그 색을 흰색에 옅게 푼 것(시안의 amber-200 자리).
  const frameShadow = `0 0 0 2px ${accent}, 0 18px 30px -8px rgba(60,40,25,.35)`;
  const plateStyle = {
    fontFamily: HAND_FONT,
    color: accentDark,
    boxShadow: `0 0 0 2px color-mix(in srgb, ${accent} 32%, white), 0 4px 10px rgba(60,40,25,.18)`,
  };

  /*
   * 쿠키를 내고 아직 확인 안 한 그림으로 가는 홈의 유일한 입구 — 나라 색으로(다른 나라에서 혼자 호박색이
   * 되지 않게), 점은 모아 보기와 같은 '새 소식' 주황. 누름 영역은 before 로 44px 까지 넓힌다.
   */
  const pendingPill = pending ? (
    <Link
      href="/family"
      className="relative flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2.5 text-xs font-extrabold transition hover:brightness-105 before:absolute before:inset-x-0 before:-inset-y-1"
      style={{ background: accentSoft, color: accentDark, boxShadow: `0 0 0 1px ${accent}55, 0 1px 2px rgba(0,0,0,.08)` }}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-orange-500" />
      확인 안 한 가족이 있어요
    </Link>
  ) : null;

  /*
   * 모두 홈 보이기를 껐다(고정한 가족이 있는데 홈에 설 사람이 없다) — 큰 사진 대신 명패 한 줄 알약
   * ('○○이네 가족 ›' → /family, 작은 얼굴 없이). 단짝 친구만 고정했으면 여기가 아니라 입구 액자다.
   * 이미 한 줄이라 접기·펼치기는 두지 않는다(접힘 값은 그대로 남겨 두어 다시 켜면 예전처럼).
   * 모양은 액자 아래 명패와 같다. 확인 안 한 그림이 있으면 그 알약을 옆에 둔다. 누름 영역은 before 로 44px 까지.
   */
  if (fixedKin.length > 0 && onHome.length === 0) {
    return (
      <section
        aria-label={title}
        className="relative mx-auto mb-5 mt-2 flex w-full max-w-sm flex-wrap items-center justify-center gap-x-2 gap-y-1.5 px-3 sm:max-w-xl"
      >
        <Link
          href="/family"
          className="relative flex min-w-0 max-w-full items-center gap-0.5 rounded-full bg-white pb-[5px] pl-[22px] pr-3.5 pt-[3px] text-[21px] font-bold transition hover:-translate-y-0.5 before:absolute before:inset-x-0 before:-inset-y-1"
          style={plateStyle}
        >
          <span className="truncate">{title}</span>
          <span className="flex shrink-0">
            <NextIcon />
          </span>
        </Link>
        {pendingPill}
      </section>
    );
  }

  /*
   * 접기 — 명패 옆 **흐름 안**에 둔다(예전엔 오른쪽 끝 절대 위치라 긴 이름의 명패와 겹쳤다).
   * 줄이 모자라면 flex-wrap 으로 아랫줄로 내려간다. 보이는 높이는 34px, 누름 영역은 before 로 44px.
   */
  const foldButton = (
    <button
      type="button"
      aria-expanded
      onClick={foldNow}
      className="relative flex h-[34px] shrink-0 items-center gap-0.5 rounded-full bg-white/85 px-3 text-xs font-extrabold text-neutral-600 shadow-sm transition hover:bg-white before:absolute before:inset-x-0 before:-inset-y-[5px]"
    >
      접기
      <Chevron dir="up" />
    </button>
  );

  /*
   * 꾸미기 — 접기와 같은 모양, 명패와 접기 사이. 가족 사진관 시트(배경·스티커)를 연다.
   * 폰(sm 미만)에서는 동그란 그림 단추(34px)만 — 글자까지 넣으면 360~390px 폰에서 명패·꾸미기·접기가 한 줄에 안 들어가
   * 접기만 아랫줄로 떨어진다. 누름 영역은 before 로 44px 까지(가로도 넓힌다).
   */
  const studioButton = onStudioChange ? (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label="가족 사진 꾸미기"
      onClick={() => setStudioOpen(true)}
      className="relative flex h-[34px] w-[34px] shrink-0 items-center justify-center gap-1 rounded-full bg-white/85 text-xs font-extrabold text-neutral-600 shadow-sm transition hover:bg-white before:absolute before:-inset-[5px] sm:w-auto sm:pl-2 sm:pr-3 sm:before:inset-x-0"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/func-edit.webp" alt="" aria-hidden className="h-[18px] w-[18px] object-contain" />
      <span aria-hidden className="hidden sm:inline">
        꾸미기
      </span>
    </button>
  ) : null;

  /* ── 펼친 액자 ── */
  const frame: ReactNode =
    onHome.length > 0 ? (
      /* 가족이 있어요: 단체 사진(홈 보이기를 켠 사람만) + 명패 */
      <>
        <div className="relative rounded-[28px] bg-white p-1.5" style={{ boxShadow: frameShadow }}>
          <div ref={stageRef} className="relative overflow-hidden rounded-[22px]" style={{ background: accentSoft }}>
            <FamilyGroupPhoto
              members={onHome}
              childAge={childAge}
              parents={parents}
              height={wide ? 240 : 200}
              background={theme.background}
              className="w-full"
              onMemberClick={sayHello}
              memberLabel={(m) => `${displayName(m)} — 누르면 인사해요`}
              studio={studio}
            />
            {greet && (
              <div
                key={greet.n}
                role="status"
                className="pointer-events-none absolute z-[3] flex -translate-x-1/2 items-center gap-[5px] whitespace-nowrap rounded-[14px] bg-white py-[5px] pl-1.5 pr-[11px] shadow-[0_3px_8px_rgba(60,40,25,.18)]"
                style={{ left: greet.x, bottom: greet.bottom }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/func-speaker.webp" alt="" aria-hidden className="h-5 w-5" />
                <span className="text-[13px] font-extrabold" style={{ color: accentDark }}>
                  {greet.text}
                </span>
                <span aria-hidden className="absolute -bottom-[5px] left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-white" />
              </div>
            )}
          </div>
          <Mascot src={theme.mascot} size="h-[60px] w-[60px]" />
        </div>
        <div className="relative z-[2] -mt-[17px] flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5">
          <Link
            href="/family"
            className="relative flex min-w-0 max-w-full items-center gap-0.5 rounded-full bg-white pb-[5px] pl-[22px] pr-3.5 pt-[3px] text-[21px] font-bold transition hover:-translate-y-0.5 before:absolute before:inset-x-0 before:-inset-y-1"
            style={plateStyle}
          >
            <span className="truncate">{title}</span>
            <span className="flex shrink-0">
              <NextIcon />
            </span>
          </Link>
          {/* 명패 · 꾸미기 · 접기 — 확인 안 한 가족이 있으면 그 알약만. 꾸미기·접기는 한 덩어리(긴 명패면 둘이 함께 아랫줄로). */}
          {pendingPill ?? (
            <div className="flex shrink-0 items-center gap-2">
              {studioButton}
              {foldButton}
            </div>
          )}
        </div>
      </>
    ) : (
      /* 입구: 예시 가족 폴라로이드.
       * 폰은 세로(사진 위·글 아래), 태블릿은 가로로 눕혀 높이를 줄인다 — 탭·책장이 첫 화면에서
       * 너무 밀리지 않게. 태블릿은 글을 왼쪽·사진을 오른쪽에 둔다: 오른쪽 위 모서리의 마스코트가
       * 폰처럼 사진 위에 앉아야 제목 글자를 가리지 않는다. */
      <>
        <div className="relative rounded-[28px] bg-white p-1.5" style={{ boxShadow: frameShadow }}>
          <div className="sm:flex sm:flex-row-reverse sm:items-stretch">
            <div
              className="relative h-[170px] overflow-hidden rounded-[22px] sm:h-auto sm:min-h-[200px] sm:flex-1"
              style={{ background: accentSoft }}
            >
              {/* 나라 배경을 흐리게 — 바닥이 보이게 아래쪽을 쓴다 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={theme.background}
                alt=""
                className="absolute inset-0 h-full w-full object-cover object-bottom blur-[1.5px] saturate-[.9]"
              />
              <div className="absolute inset-0 opacity-45" style={{ background: accentSoft }} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={familyExampleSrc(childGender)}
                alt="예시 가족 — 할아버지·할머니·엄마·아이·동생·아빠"
                className="absolute inset-x-0 bottom-1.5 mx-auto h-[92%] w-auto max-w-[96%] object-contain object-bottom sm:bottom-3 sm:h-[88%]"
              />
              <div className="absolute inset-0 bg-white/[0.12]" />
              <span className="absolute left-2.5 top-2.5 rounded-full bg-white/95 px-2.5 py-[3px] text-[11px] font-extrabold text-neutral-600">
                예시 그림
              </span>
            </div>

            <div className="flex flex-col items-center px-3 pb-7 pt-3.5 text-center sm:w-[250px] sm:shrink-0 sm:justify-center sm:px-4 sm:pt-4">
              <p className="text-[19px] font-extrabold text-neutral-800">우리 가족을 그려 볼까요?</p>
              <p className="mt-[5px] break-keep text-[13.5px] font-medium leading-[1.45] text-neutral-600">
                그려 둔 가족은 동화마다
                <br />
                같은 얼굴로 나와요
              </p>
              <Link
                href="/family"
                className="mt-3.5 flex h-[52px] items-center justify-center rounded-full px-[26px] text-[19px] font-extrabold text-white transition-transform active:translate-y-0.5"
                style={{ background: accent, boxShadow: `0 6px 0 ${accentDark}` }}
              >
                우리 가족 그리기
              </Link>
              {/*
                * 값은 요금제 화면과 같은 단위(크레딧)로 — 2026-10-20 사장님 "크레딧으로 맞춰야 해"(예전 '한 사람 쿠키 2개').
                * 가족 패스에 든 캐릭터 수 · 넘어서 더 그릴 때 한 명 크레딧은 관리실 요금제·가격 값(공개 경로)에서 읽는다.
                * 사진으로도 그릴 수 있지만 저장하지 않는다(사장님 2026-09-29 — lib/family-photo.ts).
                */}
              <p className="mt-4 break-keep text-center text-xs font-bold leading-relaxed text-neutral-600">
                가족 패스에 캐릭터 {familyOffer.characters}명 포함 · 더 그리면 1명 {creditsText(familyOffer.characterCredits)}
                <br />
                사진은 저장하지 않아요
              </p>
            </div>
          </div>
          <Mascot src={theme.mascot} size="h-16 w-16" />
        </div>

        <div className="relative z-[2] -mt-[17px] flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5">
          <span className="min-w-0 max-w-full truncate rounded-full bg-white px-[22px] pb-[5px] pt-[3px] text-[21px] font-bold" style={plateStyle}>
            {title}
          </span>
          {pendingPill ?? foldButton}
        </div>
      </>
    );

  /*
   * ── 접은 알약 ── 단체 사진이 있으면 그 사람들의 작은 얼굴 + 명패, 없으면 작은 예시 그림 + '우리 가족 그리기'.
   * (여기까지 오면 onHome 이 비었을 때는 고정한 가족도 없다 — 모두 끈 경우는 위에서 명패 한 줄로 끝났다.)
   */
  const pill = (
    <button
      type="button"
      aria-expanded={false}
      onClick={openNow}
      className="mx-auto flex min-h-11 items-center gap-2 rounded-full bg-white/85 py-1 pl-2 pr-3 text-sm font-extrabold text-neutral-700 shadow backdrop-blur transition hover:bg-white"
    >
      {onHome.length > 0 ? (
        <>
          <span className="flex">
            {groupOrder(onHome)
              .slice(0, 5)
              .map((m, i) => (
                <FaceAvatar
                  key={m.id}
                  member={m}
                  size={30}
                  childGender={childGender}
                  className={i > 0 ? "-ml-2" : ""}
                  ring="0 0 0 2px #fff"
                />
              ))}
          </span>
          <span style={{ fontFamily: HAND_FONT, color: accentDark }} className="text-[17px] font-bold">
            {title}
          </span>
        </>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={familyExampleSrc(childGender)} alt="" className="h-9 w-auto object-contain" />
          우리 가족 그리기
        </>
      )}
      <span className="flex items-center gap-0.5 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
        펼치기
        <Chevron dir="down" />
      </span>
    </button>
  );

  /*
   * 접고 펼 때 0.3초 동안 부드럽게 — 액자가 탭 위에 있어서, 탭을 누르는 순간 액자가 확 사라지면
   * 탭과 책장이 손가락 아래에서 튀어 오른다. grid-rows 0fr↔1fr(설정 접는 칸과 같은 방식)로 높이를 옮긴다.
   * 접는 칸은 overflow-hidden 이라, 액자 모서리 위로 튀어나온 마스코트(-top 18px + 둥실 10px + 테두리)가
   * 잘리지 않게 위 여백 pt-8(32px), 오른쪽(-right-2 + 그림자) 여백 px-3 을 둔다.
   */
  return (
    <section aria-label={title} className="relative mx-auto mb-5 w-full max-w-sm sm:max-w-xl">
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
        aria-hidden={!open}
        inert={!open}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="px-3 pb-2 pt-8">{frame}</div>
        </div>
      </div>
      {!open && pill}
      {/* 꾸미기 시트 — 접는 칸(접히면 inert) 밖에. 화면 전체에 뜨는 시트(fixed)라 자리는 상관없다. */}
      {studioOpen && onStudioChange && onHome.length > 0 && (
        <StudioSheet
          colors={theme.colors}
          members={onHome}
          childAge={childAge}
          parents={parents}
          background={theme.background}
          studio={studio}
          onChange={onStudioChange}
          onClose={() => setStudioOpen(false)}
          onOutfit={
            outfitEnabled && onMemberOutfit
              ? () => {
                  setStudioOpen(false);
                  setOutfitOpen(true);
                }
              : undefined
          }
        />
      )}
      {outfitOpen && outfitEnabled && onStudioChange && onMemberOutfit && onHome.length > 0 && (
        <OutfitPicker
          colors={theme.colors}
          members={onHome}
          childAge={childAge}
          childGender={childGender}
          parents={parents}
          background={theme.background}
          studio={studio}
          onStudio={onStudioChange}
          onOutfit={onMemberOutfit}
          onClose={() => {
            setOutfitOpen(false);
            setStudioOpen(true);
          }}
        />
      )}
    </section>
  );
}

/** 접기(위)·펼치기(아래) 꺾쇠 */
function Chevron({ dir }: { dir: "up" | "down" }) {
  return (
    <svg aria-hidden width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <path d={dir === "up" ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
    </svg>
  );
}

/** 액자 오른쪽 위 모서리에 둥둥 뜬 나라 마스코트 */
function Mascot({ src, size }: { src: string; size: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute -right-2 -top-[18px] ${size} animate-[float_3.2s_ease-in-out_infinite] overflow-hidden rounded-full border-4 border-white bg-white shadow-[0_6px_14px_rgba(60,40,25,.25)] motion-reduce:animate-none`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="h-full w-full object-cover" />
    </div>
  );
}
