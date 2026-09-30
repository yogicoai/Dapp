"use client";

/**
 * 완성 — 단체 사진과 약속 (시안 Done.dc.html).
 * 액자(홈 사진에 보이는 고정된 사람 — homeMembers) + 명패 '하온·하린이네 가족 · 2026년 가을',
 * 약속 세 줄, 같은 아이·다른 옷 줄.
 *
 * 2차로 미룬 것: 시안의 '사진 저장'·'가족에게 보내기' 두 버튼. 단체 사진을 한 장(이미지)으로 만들려면
 * 가족 그림(cafe24)을 캔버스에 그려야 하는데, cafe24 가 CORS 머리글(Access-Control-Allow-Origin)을
 * 주지 않아 캔버스가 막힌다(2026-09-28 확인). 서버에서 단체 사진을 합성하는 경로가 생기면 그때
 * Web Share API(파일 공유) → 안 되면 내려받기로 넣는다. 사장님께 보고할 것.
 */

import { useRef, type ReactNode } from "react";
import type { FamilyMember } from "@/lib/family";
import type { FamilyStudio } from "@/lib/family-studio";
import type { ChildPrefs } from "@/lib/prefs";
import type { Colors } from "./family-ui";
import { FamilyGroupPhoto } from "./FamilyGroupPhoto";
import { PortraitImg } from "./Figures";
import { HangerIcon, HanbokIcon, MoonIcon, ShirtIcon } from "./icons";
import { FLOAT, useLoop } from "./motion";
import { BigButton } from "./ui";

const CONFETTI = [
  { left: "9%", top: 14, w: 8, h: 8, c: "#f59e0b", r: 20, round: false },
  { left: "24%", top: 6, w: 6, h: 10, c: "#fb7185", r: -30, round: false },
  { left: "44%", top: 10, w: 7, h: 7, c: "#34d399", r: 0, round: true },
  { left: "63%", top: 4, w: 6, h: 11, c: "#60a5fa", r: 35, round: false },
  { left: "82%", top: 16, w: 8, h: 8, c: "#f59e0b", r: -15, round: false },
];

export function DoneView({
  colors,
  mascot,
  mascotName,
  background,
  title,
  childAge,
  parents,
  members,
  kid,
  stamp,
  onCreate,
  onHome,
  studio,
}: {
  colors: Colors;
  mascot: string;
  mascotName: string;
  background: string;
  /** 명패 — '하온이네 가족' · '하온·하린이네 가족' */
  title: string;
  childAge: number | null;
  /** 엄마·아빠 생김새(설정) — 키 칩을 단체 사진에 */
  parents?: ChildPrefs["parents"];
  /** 단체 사진에 설 사람(homeMembers) */
  members: FamilyMember[];
  /** 주인공 — '같은 아이, 다른 옷' 줄(홈 사진에서 꺼도 보인다) */
  kid?: FamilyMember;
  /** '2026년 가을' */
  stamp: string;
  onCreate: () => void;
  onHome: () => void;
  /** 가족 사진관 — 고른 배경·붙인 스티커(보기만, 꾸미기는 모아 보기·홈에서) */
  studio?: FamilyStudio;
}) {
  const float = useRef<HTMLDivElement>(null);
  useLoop(float, FLOAT, 3200);

  return (
    <div className="relative flex flex-col items-center pt-3">
      {CONFETTI.map((c, i) => (
        <span
          key={i}
          aria-hidden
          className="absolute"
          style={{
            left: c.left,
            top: c.top - 12,
            width: c.w,
            height: c.h,
            background: c.c,
            borderRadius: c.round ? "50%" : 2,
            transform: `rotate(${c.r}deg)`,
          }}
        />
      ))}

      <div
        className="relative w-full rounded-[28px] bg-white p-1.5"
        style={{ boxShadow: `0 0 0 2px ${colors.accent}, 0 18px 30px -8px rgba(60,40,25,.35)` }}
      >
        <FamilyGroupPhoto
          members={members}
          childAge={childAge}
          parents={parents}
          height={224}
          background={background}
          studio={studio}
          className="rounded-[22px]"
          empty={
            <span className="break-keep rounded-2xl bg-white/90 px-4 py-2 text-center text-xs font-extrabold text-neutral-600 shadow">
              모아 보기에서 &apos;홈 가족 사진에 보이기&apos;를 켜면 여기 모여요
            </span>
          }
        />
        <div
          ref={float}
          className="absolute -right-2 -top-4 h-14 w-14 overflow-hidden rounded-full border-4 border-white bg-white shadow-[0_6px_14px_rgba(60,40,25,.25)]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mascot} alt={`마스코트 ${mascotName}`} className="h-full w-full object-cover" />
        </div>
      </div>

      <span
        className="relative z-[2] -mt-4 rounded-full bg-white px-5 pb-1 pt-0.5 text-[19px] font-bold"
        style={{
          fontFamily: "var(--font-gaegu), 'Pretendard Variable', cursive",
          color: colors.accentDark,
          boxShadow: `0 0 0 2px ${colors.accent}55, 0 4px 10px rgba(60,40,25,.18)`,
        }}
      >
        {title} · {stamp}
      </span>

      <div className="mt-3.5 flex w-full flex-col items-center rounded-[28px] bg-white/95 px-4 pb-2 pt-[18px] shadow-xl">
        <h1 className="break-keep text-center text-2xl font-extrabold text-neutral-800">{title}이 완성됐어요!</h1>

        <div className="mt-3.5 flex w-full flex-col gap-2.5 rounded-[20px] p-3.5" style={{ background: colors.accentSoft }}>
          <Vow icon={
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/icons/create.webp" alt="" className="h-[26px] w-[26px]" />
          }>
            다음 동화부터 이 모습을 기준으로 그려요
          </Vow>
          <Vow icon={<span className="text-emerald-700"><HangerIcon size={18} /></span>}>
            얼굴·머리·체형은 그대로, 옷은 이야기에 맞게 — 궁에 가면 한복, 잠자리엔 잠옷
          </Vow>
          <Vow icon={
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/icons/func-edit.webp" alt="" className="h-6 w-6" />
          }>
            생김새를 바꾸시면 다시 그릴지 여쭤볼게요. 이미 만든 동화는 그대로예요
          </Vow>
        </div>

        {kid?.portrait && (
          <div className="mt-2.5 flex w-full items-center gap-3 rounded-3xl bg-white px-2.5 py-2 shadow-[inset_0_0_0_1px_#f1e6cf]">
            <div className="flex h-[74px] w-14 shrink-0 items-end justify-center overflow-hidden rounded-xl" style={{ background: colors.accentSoft }}>
              <PortraitImg p={kid.portrait} alt={kid.callName} className="h-[66px] w-auto max-w-none" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex gap-2.5">
                <Outfit label="평소 옷" on colors={colors} icon={<ShirtIcon />} />
                <Outfit label="한복" colors={colors} icon={<HanbokIcon />} />
                <Outfit label="잠옷" colors={colors} icon={<MoonIcon />} />
              </div>
              <span className="text-xs font-semibold text-neutral-500">같은 {kid.callName}, 이야기마다 다른 옷</span>
            </div>
          </div>
        )}

        <div className="mt-4 w-full">
          <BigButton colors={colors} onClick={onCreate}>
            우리 가족 동화 만들기
          </BigButton>
        </div>
        <button type="button" onClick={onHome} className="mt-2 min-h-11 px-3 text-[13px] font-extrabold text-neutral-500">
          홈으로
        </button>
      </div>
    </div>
  );
}

function Vow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,.08)]">{icon}</span>
      <span className="break-keep text-sm font-bold leading-snug text-neutral-700">{children}</span>
    </div>
  );
}

function Outfit({ label, on, colors, icon }: { label: string; on?: boolean; colors: Colors; icon: ReactNode }) {
  return (
    <span className="flex flex-col items-center gap-0.5">
      <span
        className="flex h-9 w-9 items-center justify-center rounded-full bg-white"
        style={on ? { border: `2px solid ${colors.accent}`, color: colors.accentDark } : { border: "1.5px solid #e5e5e5", color: "#525252" }}
      >
        {icon}
      </span>
      <span className="text-[11px] font-extrabold text-neutral-600">{label}</span>
    </span>
  );
}
