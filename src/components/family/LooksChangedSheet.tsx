"use client";

/**
 * 생김새를 바꿨을 때 (시안 LooksChanged.dc.html 아래 시트).
 * '늘 그대로'(머리 모양·앞머리·머리결·머리 색·얼굴형·눈매·눈썹·피부·체형·키·안경·수염·이런 점도)가
 * 바뀐 고정된 사람에게만 뜬다 — 평소 옷(옷 종류·아래옷·옷 색·늘 하는 것)·메모만 바뀌면 안 뜬다.
 * 가족 화면에서 고친 직후에 뜨고, 설정에서 바꿨거나 '나중에'를 눌렀으면 모아 보기의 '모습이 바뀌었어요'
 * 카드를 눌러 연다(그릴 때 적어 둔 lockKey 와 지금 값을 견준다 — lib/family portraitLooksChanged).
 * diff 는 '머리 모양: 단발 → 숏컷' 처럼 바뀐 칸(lib/family lockChanges).
 * '지금 다시 그리기'를 눌러도 바로 그리지 않는다 — 쿠키 확인 창(ConfirmSheet)을 한 번 더 거친다(사장님 2026-09-29:
 * 값이 나가는 그리기는 늘 알림창이 떠야 한다).
 */

import type { FamilyMember } from "@/lib/family";
import { stemOf, type Colors } from "./family-ui";
import { PortraitImg } from "./Figures";
import { ArrowRightIcon } from "./icons";
import { Sheet } from "./Sheet";
import { BigButton, CookiePill, costText } from "./ui";

export function LooksChangedSheet({
  colors,
  member: m,
  diff,
  cost,
  master,
  tokens,
  onRedraw,
  onLater,
  onMore,
  onCharge,
}: {
  colors: Colors;
  member: FamilyMember;
  diff: string[];
  cost: number;
  master: boolean;
  tokens: number;
  onRedraw: () => void;
  onLater: () => void;
  /** 모아 보기 카드에서 열었을 때 — 빼기·생김새 고치기 같은 다른 메뉴로 가는 길 */
  onMore?: () => void;
  onCharge: () => void;
}) {
  const short = !master && tokens < cost;
  const pic = m.portrait ?? m.draft;

  return (
    <Sheet onClose={onLater} label="모습이 바뀌었어요">
      <div className="mt-4 flex items-center gap-4">
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex h-32 w-24 items-end justify-center overflow-hidden rounded-2xl" style={{ background: colors.accentSoft }}>
            {pic && <PortraitImg p={pic} alt={`지금 ${stemOf(m)} 그림`} className="mb-1.5 h-[104px] w-auto max-w-none opacity-60" />}
          </div>
          <span className="text-xs font-extrabold text-neutral-500">지금</span>
        </div>
        <span className="mb-6" style={{ color: colors.accentDark }}>
          <ArrowRightIcon />
        </span>
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex h-32 w-24 items-center justify-center rounded-2xl border-2 border-dashed border-[#d6cbb5] bg-[#fffdf7]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/func-edit.webp" alt="" aria-hidden className="h-12 w-12" />
          </div>
          <span className="text-xs font-extrabold" style={{ color: colors.accentDark }}>
            새 모습
          </span>
        </div>
      </div>

      <h2 className="mt-3.5 break-keep text-center text-xl font-extrabold text-neutral-800">{stemOf(m)} 모습이 바뀌었어요</h2>
      <div className="mt-2.5 flex flex-wrap justify-center gap-1.5">
        {diff.map((d) => (
          <span
            key={d}
            className="rounded-full px-3.5 py-1.5 text-[13px] font-extrabold"
            style={{ background: colors.accentSoft, color: colors.accentDark, boxShadow: `inset 0 0 0 1px ${colors.accent}55` }}
          >
            {d}
          </span>
        ))}
      </div>
      <p className="mt-2.5 break-keep text-center text-sm font-medium leading-normal text-neutral-600">
        이미 만든 동화는 그대로예요.
        <br />
        다시 그리면 다음 동화부터 새 모습으로 그려요.
      </p>

      {short && (
        <div className="mt-3 flex flex-col items-center">
          <p className="text-sm font-extrabold text-rose-600">쿠키가 조금 모자라요</p>
          <button type="button" onClick={onCharge} className="min-h-11 px-3 text-sm font-extrabold underline underline-offset-2" style={{ color: colors.accentDark }}>
            요금제 미리 보기
          </button>
        </div>
      )}

      <div className="mt-[18px] w-full">
        <BigButton colors={colors} onClick={onRedraw} disabled={short}>
          지금 다시 그리기
          <CookiePill colors={colors} text={costText(cost, master)} />
        </BigButton>
      </div>
      <button
        type="button"
        onClick={onLater}
        className="mt-4 flex min-h-[52px] w-full items-center justify-center rounded-full bg-white text-base font-extrabold text-neutral-700 shadow-[0_0_0_1px_#ececec,0_6px_0_rgba(0,0,0,.12)] transition active:translate-y-[3px]"
      >
        나중에 — 그때까지는 지금 그림으로
      </button>
      {onMore && (
        <button type="button" onClick={onMore} className="mt-2 min-h-11 px-3.5 text-sm font-extrabold text-neutral-600">
          다른 메뉴 보기
        </button>
      )}
    </Sheet>
  );
}
