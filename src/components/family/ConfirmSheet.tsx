"use client";

/**
 * 쿠키 확인 — 누구를 몇 개로 그리는지, 합계, 그린 뒤 남는 쿠키 (시안 Confirm.dc.html).
 * 잔액이 모자라면 그리기 버튼을 막고 요금제(/plans)로 가는 글자 버튼을 보인다(결제가 열리기 전이라 '충전'을 약속하지 않는다).
 * 관리자는 합계 옆에 '관리자 0개'.
 * 처음 고정(fix)이고 부르는 쪽이 onLooksOnly 를 주면 둘째 선택 '그림 없이 특징만 저장할게요'(쿠키 0개)를
 * 보인다(사장님 2026-09-28). 쿠키가 모자라도 누를 수 있다 — 그리기 서버는 부르지 않는다.
 * 사진으로 그릴 사람(photoIds)은 이름 옆에 '사진으로'를 단다. 값은 칩으로 그릴 때와 같다(사장님 2026-09-29).
 */

import { byRoleOrder, nextDrawCost, type FamilyMember } from "@/lib/family";
import type { Gender } from "@/lib/prefs";
import { displayName, type Colors } from "./family-ui";
import { FaceAvatar } from "./Figures";
import { CheckIcon, CookieIcon } from "./icons";
import { Sheet } from "./Sheet";
import { BigButton } from "./ui";

export function ConfirmSheet({
  colors,
  members,
  tokens,
  master,
  variant,
  childGender,
  photoIds,
  onClose,
  onConfirm,
  onCharge,
  onLooksOnly,
}: {
  colors: Colors;
  members: FamilyMember[];
  tokens: number;
  master: boolean;
  /** fix: 처음 고정 / redraw: 고정된 사람 다시 그리기 */
  variant: "fix" | "redraw";
  childGender?: Gender;
  /** 이번 방문에 사진을 고른 사람 id — '사진으로' 표시만(사진 자체는 넘기지 않는다) */
  photoIds?: readonly string[];
  onClose: () => void;
  onConfirm: () => void;
  onCharge: () => void;
  /** 그림 없이 특징만 저장(쿠키 0개) — 생김새 고르기에서 온 처음 고정(fix)일 때만 준다 */
  onLooksOnly?: () => void;
}) {
  // 순서: 아이 → 엄마 → 아빠 → 형제자매 → 할머니 → 할아버지 → 단짝 친구(ROLE_ORDER)
  const rows = byRoleOrder(members).map((m) => ({ m, cost: nextDrawCost(m.draws) }));
  const total = rows.reduce((s, r) => s + r.cost, 0);
  const n = members.length;
  const short = !master && tokens < total;
  const after = tokens - total;

  const title = master
    ? variant === "redraw"
      ? `${n}명을 다시 그릴까요?`
      : `${n}명을 고정할까요?`
    : variant === "redraw"
      ? total > 0
        ? `쿠키 ${total}개로 다시 그릴까요?`
        : "다시 그릴까요?"
      : total > 0
        ? `쿠키 ${total}개로 ${n}명을 고정할까요?`
        : `${n}명을 그릴까요?`;

  const checks =
    variant === "redraw"
      ? ["지금 그림과 새 그림을 나란히 보고 고를 수 있어요", "평소 옷만 바꾸는 건 언제나 0개", "그리다 실패하면 쿠키는 바로 돌려드려요"]
      : ["사람마다 다시 그리기 1번 포함 — 그 뒤엔 1개씩", "평소 옷만 바꾸는 건 언제나 0개", "그리다 실패한 사람의 쿠키는 바로 돌려드려요"];

  return (
    <Sheet onClose={onClose} label="쿠키 확인">
      <h2 className="mt-[18px] break-keep text-center text-[21px] font-extrabold text-neutral-800">{title}</h2>
      <p className="mt-1 text-center text-[13px] font-medium text-neutral-500">
        {variant === "redraw" ? "마음에 드는 쪽을 골라 고정해요." : "고정한 가족은 동화마다 같은 얼굴로 나와요."}
      </p>

      <div className="mt-3.5 flex w-full flex-col rounded-[20px] bg-stone-50 px-3.5 py-1 shadow-[inset_0_0_0_1px_#f0ede8]">
        {rows.map(({ m, cost }) => (
          <div key={m.id} className="flex min-h-[46px] items-center gap-2.5 border-b border-stone-200/70">
            <FaceAvatar member={m} size={34} childGender={childGender} />
            <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold text-neutral-800">{displayName(m)}</span>
            {photoIds?.includes(m.id) && (
              <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-extrabold text-emerald-700">사진으로</span>
            )}
            <span className="text-sm font-extrabold" style={{ color: colors.accentDark }}>
              {cost === 0 ? "0개 (포함된 다시 그리기)" : `${cost}개`}
            </span>
          </div>
        ))}
        <div className="flex min-h-[46px] items-center gap-2">
          <span className="flex-1 text-[15px] font-extrabold text-neutral-800">합계</span>
          <CookieIcon size={20} />
          {master ? (
            <>
              <span className="text-sm font-extrabold text-neutral-500 line-through">{total}개</span>
              <span className="text-[17px] font-extrabold" style={{ color: colors.accentDark }}>
                관리자 0개
              </span>
            </>
          ) : (
            <span className="text-[17px] font-extrabold" style={{ color: colors.accentDark }}>
              {total}개
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 flex w-full flex-col gap-1.5">
        {checks.map((c) => (
          <span key={c} className="flex items-center gap-2 break-keep text-[13px] font-semibold text-neutral-700">
            <span className="shrink-0">
              <CheckIcon size={16} color="#047857" />
            </span>
            {c}
          </span>
        ))}
      </div>

      <div
        className="mt-3.5 flex min-h-11 w-full items-center justify-between rounded-2xl px-3.5"
        style={{ background: colors.accentSoft }}
      >
        <span className="text-[13px] font-bold text-neutral-600">내 쿠키</span>
        {master ? (
          <span className="text-sm font-extrabold text-neutral-700">관리자는 쿠키가 들지 않아요</span>
        ) : (
          <span className="text-sm font-extrabold text-neutral-700">
            {tokens}개 → 그린 뒤{" "}
            <span style={{ color: short ? "#e11d48" : colors.accentDark }}>{short ? "모자라요" : `${after}개`}</span>
          </span>
        )}
      </div>

      {short && (
        <div className="mt-3 flex w-full flex-col items-center gap-0.5 text-center">
          <p className="text-sm font-extrabold text-rose-600">쿠키가 조금 모자라요 ({total - tokens}개 더 필요해요)</p>
          <button type="button" onClick={onCharge} className="min-h-11 px-3 text-sm font-extrabold underline underline-offset-2" style={{ color: colors.accentDark }}>
            요금제 미리 보기
          </button>
        </div>
      )}

      <div className="mt-4 w-full">
        <BigButton colors={colors} onClick={onConfirm} disabled={short || n === 0}>
          {master || total === 0 ? "그리기 시작" : `쿠키 ${total}개로 그리기`}
        </BigButton>
      </div>
      {/* 둘째 선택 — 그리지 않고 고른 특징만 남긴다. 값이 안 들어 쿠키가 모자라도 누를 수 있다. */}
      {variant === "fix" && onLooksOnly && (
        <div className="mt-4 flex w-full flex-col items-center">
          <button
            type="button"
            onClick={onLooksOnly}
            disabled={n === 0}
            className="flex min-h-[52px] w-full items-center justify-center rounded-full bg-white px-4 text-base font-extrabold text-neutral-700 shadow-[0_0_0_1px_#ececec,0_6px_0_rgba(0,0,0,.12)] transition active:translate-y-[3px] disabled:cursor-not-allowed disabled:opacity-50"
          >
            그림 없이 특징만 저장할게요
          </button>
          <p className="mt-2.5 break-keep text-center text-xs font-semibold leading-snug text-neutral-500">
            쿠키 0개 · 동화마다 이 특징으로 새로 그려요. 얼굴 고정은 나중에 해도 돼요.
          </p>
        </div>
      )}
      <button type="button" onClick={onClose} className="mt-3 min-h-11 px-3.5 text-sm font-extrabold text-neutral-600">
        다시 볼게요
      </button>
    </Sheet>
  );
}
