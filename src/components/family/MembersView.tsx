"use client";

/**
 * 1단계 — 누가 우리 가족인가요? (시안 Members.dc.html)
 *
 * 고른 사람 = 이번에 그려서 얼굴을 고정할 사람. 아이(주인공)는 끌 수 없다.
 * 순서(사장님 2026-09-28): 엄마 → 아빠 → 형제자매 → 할머니 → 할아버지 → (따로) 단짝 친구.
 * 엄마·아빠는 켜고 끄는 타일, 형제자매는 '+' 타일로 여러 명, 할머니·할아버지는 첫 분을 타일로 켜고
 * 두 번째 분(외가·친가)은 '+ 더 넣기'로 호칭을 골라 넣는다.
 * 단짝 친구는 가족 타일과 떨어진 자리에 한 명만 — 가족이 아니라 가족 사진·명패에는 안 나온다.
 */

import type { ReactNode } from "react";
import {
  BEST_FRIEND_LABEL,
  canAddRole,
  nextDrawCost,
  ROLE_LABEL,
  ROLE_ORDER,
  type FamilyMember,
  type FamilyRole,
} from "@/lib/family";
import type { ChildPrefs } from "@/lib/prefs";
import { ageText, displayName, ROLE_STICKER, stickerFor, type Colors } from "./family-ui";
import { FaceAvatar } from "./Figures";
import { CheckIcon, CookieIcon, PawIcon, PlusIcon } from "./icons";
import { BigButton, BottomBar, StepDots, TopBar } from "./ui";

type Tile =
  | { kind: "member"; member: FamilyMember; sub?: string }
  | { kind: "placeholder"; role: "mom" | "dad" | "grandma" | "grandpa"; label: string }
  | { kind: "adder"; role: "sibling" | "friend"; label: string };

/** 형제·친구 타일 아래 글자 — '우리 아이 · 7살' */
function kidSub(m: FamilyMember): string | undefined {
  const parts = [m.role === "sibling" && m.isOurChild ? "우리 아이" : "", ageText(m.age)].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

export function MembersView({
  colors,
  child,
  family,
  master,
  onBack,
  onToggle,
  onRemove,
  onFixedTap,
  onOpenAdd,
  onNext,
}: {
  colors: Colors;
  child: ChildPrefs;
  family: FamilyMember[];
  master: boolean;
  onBack: () => void;
  /** 엄마·아빠·(첫)할머니·할아버지 켜기 */
  onToggle: (role: "mom" | "dad" | "grandma" | "grandpa") => void;
  /** 켜진 사람 끄기(우리 가족에서 빼기 — 그림이 없을 때만) */
  onRemove: (id: string) => void;
  /** 이미 고정된 사람을 눌렀을 때 */
  onFixedTap: (m: FamilyMember) => void;
  onOpenAdd: (role?: FamilyRole) => void;
  onNext: () => void;
}) {
  const kid = family.find((m) => m.role === "child");
  const others = family.filter((m) => m.role !== "child");
  const of = (role: FamilyRole) => others.filter((m) => m.role === role);
  const hasParentLooks = (r: "mom" | "dad") => Boolean(child.parents?.[r]);

  // 가족 타일 — ROLE_ORDER 그대로(엄마 → 아빠 → 형제자매(+) → 할머니 → 할아버지). 아이·단짝 친구는 따로.
  const tiles: Tile[] = [];
  for (const r of ROLE_ORDER) {
    if (r === "child" || r === "friend") continue;
    if (r === "sibling") {
      for (const m of of(r)) tiles.push({ kind: "member", member: m, sub: kidSub(m) });
      tiles.push({ kind: "adder", role: r, label: ROLE_LABEL[r] });
      continue;
    }
    const list = of(r);
    if (list.length === 0) tiles.push({ kind: "placeholder", role: r, label: ROLE_LABEL[r] });
    for (const m of list) {
      // 전에 골라 둔 특징이 있다(엄마·아빠 특징은 ChildPrefs.parents — 예전 설정 칸에서 고른 값도 여기 있다).
      const sub = (r === "mom" || r === "dad") && hasParentLooks(r) ? "특징 골라 뒀어요" : undefined;
      tiles.push({ kind: "member", member: m, sub });
    }
  }

  // 단짝 친구 — 따로 한 칸. 옛 목록에 친구가 여럿이면 모두 보이되(그림이 있을 수 있다) 더 넣지는 못한다.
  const friends = of("friend");
  const friendTiles: Tile[] = friends.map((m) => ({ kind: "member", member: m, sub: kidSub(m) }));
  if (canAddRole(family, "friend")) friendTiles.push({ kind: "adder", role: "friend", label: BEST_FRIEND_LABEL });

  // 이번에 그릴 사람 = 아직 고정 안 된 사람 전부(아이·단짝 친구 포함)
  const targets = family.filter((m) => !m.portrait);
  const total = targets.reduce((s, m) => s + nextDrawCost(m.draws), 0);

  const renderTile = (t: Tile) => {
    if (t.kind === "member") {
      const m = t.member;
      const fixed = Boolean(m.portrait);
      return (
        <TileShell
          key={m.id}
          on
          colors={colors}
          label={displayName(m)}
          sub={fixed ? "고정됨" : t.sub}
          art={<TileArt member={m} childGender={child.gender} />}
          ariaLabel={`${displayName(m)} — ${fixed ? "얼굴 고정됨" : "누르면 빼요"}`}
          onClick={() => (fixed ? onFixedTap(m) : onRemove(m.id))}
        />
      );
    }
    if (t.kind === "placeholder") {
      return (
        <TileShell
          key={`p-${t.role}`}
          on={false}
          colors={colors}
          label={t.label}
          art={<RoleArt role={t.role} />}
          ariaLabel={`${t.label} 넣기`}
          onClick={() => onToggle(t.role)}
        />
      );
    }
    return (
      <TileShell
        key={`a-${t.role}`}
        on={false}
        adder
        colors={colors}
        label={t.label}
        art={<RoleArt role={t.role} />}
        ariaLabel={`${t.label} 더하기`}
        onClick={() => onOpenAdd(t.role)}
      />
    );
  };

  return (
    <>
      <div className="flex flex-col rounded-[28px] bg-white/90 px-5 pb-6 pt-4 shadow-xl backdrop-blur">
        <TopBar onBack={onBack} title="우리 가족 그리기" right={<StepDots at={1} colors={colors} />} />

        <h1 className="mt-3.5 text-2xl font-extrabold text-neutral-800">누가 우리 가족인가요?</h1>
        <p className="mt-1.5 break-keep text-sm font-medium leading-normal text-neutral-500">
          고른 가족은 그려서 얼굴을 고정해요.
          <br />
          안 고른 가족은 동화마다 새로 그려요.
        </p>

        {/* 주인공 줄 — 끌 수 없다 */}
        {kid && (
          <div
            className="mt-4 flex items-center gap-3 rounded-3xl px-3.5 py-3"
            style={{ background: colors.accentSoft, boxShadow: `inset 0 0 0 1px ${colors.accent}40` }}
          >
            <FaceAvatar member={kid} size={56} childGender={child.gender} />
            <span className="min-w-0 flex-1 truncate text-[17px] font-extrabold text-neutral-800">
              {kid.callName}
              {ageText(child.age) && <span className="text-sm font-bold text-neutral-500"> · {ageText(child.age)}</span>}
            </span>
            {kid.portrait && <span className="text-xs font-extrabold text-neutral-500">고정됨</span>}
            <span className="rounded-full px-3 py-1.5 text-xs font-extrabold text-white" style={{ background: colors.accentDark }}>
              주인공
            </span>
          </div>
        )}

        <div className="mt-3 grid grid-cols-3 gap-2.5">{tiles.map(renderTile)}</div>

        <button
          type="button"
          onClick={() => onOpenAdd()}
          className="mt-1 min-h-11 self-start px-0.5 text-left text-[13px] font-extrabold"
          style={{ color: colors.accentDark }}
        >
          + 더 넣기 — 외가·친가 할머니·할아버지, 형제 여러 명도 돼요
        </button>

        {/* 단짝 친구 — 가족 타일과 떨어진 자리 */}
        <div className="mt-2 rounded-3xl bg-neutral-50 px-3 pb-3 pt-2.5 shadow-[inset_0_0_0_1px_#f0ede8]">
          <p className="break-keep px-0.5 text-[13px] font-extrabold text-neutral-600">
            {BEST_FRIEND_LABEL} 한 명 <span className="font-bold text-neutral-500">· 가족 사진엔 안 나와요</span>
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2.5">{friendTiles.map(renderTile)}</div>
        </div>

        <div className="mt-3 flex h-[50px] items-center gap-2.5 rounded-3xl border-2 border-dashed border-neutral-200 px-4 text-neutral-500">
          <PawIcon />
          <span className="flex-1 text-sm font-extrabold">반려동물</span>
          <span className="rounded-full bg-neutral-100 px-2.5 py-[3px] text-[11px] font-extrabold">곧 만나요</span>
        </div>

        <p className="mt-3 break-keep text-xs font-medium leading-normal text-neutral-500">
          쿠키는 고정하는 사람만큼만 들어요. 한 사람 쿠키 2개, 마음에 안 들면 한 번은 그냥 다시 그려요.
        </p>
        {master && (
          <p className="mt-2 rounded-2xl bg-neutral-100 px-3.5 py-2 text-center text-xs font-extrabold text-neutral-600">
            관리자는 쿠키가 들지 않아요
          </p>
        )}
      </div>

      <BottomBar>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-1.5 text-[15px] font-extrabold text-neutral-800">
            <CookieIcon size={18} />
            {targets.length}명 · {master ? "관리자 0개" : `쿠키 ${total}개`}
          </span>
          <span className="text-xs font-bold text-neutral-500">고정할 사람 · 다시 그리기 1번씩 포함</span>
        </div>
        <div className="shrink-0">
          <BigButton colors={colors} onClick={onNext} disabled={targets.length === 0} className="whitespace-nowrap px-[18px]">
            생김새 고르기 →
          </BigButton>
        </div>
      </BottomBar>
    </>
  );
}

function TileShell({
  on,
  adder,
  colors,
  label,
  sub,
  art,
  ariaLabel,
  onClick,
}: {
  on: boolean;
  adder?: boolean;
  colors: Colors;
  label: string;
  sub?: string;
  art: ReactNode;
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={adder ? undefined : on}
      aria-label={ariaLabel}
      onClick={onClick}
      className={`relative flex h-[124px] flex-col items-center justify-center gap-[5px] rounded-3xl border-2 px-1 py-2 transition ${
        on ? "bg-white shadow-[0_2px_6px_rgba(60,40,25,.08)]" : "border-transparent bg-neutral-100 hover:bg-neutral-200/70"
      }`}
      style={on ? { borderColor: colors.accent } : undefined}
    >
      <span
        className="flex h-[60px] w-[60px] items-center justify-center overflow-hidden rounded-full"
        style={{ background: on ? colors.accentSoft : "#fff" }}
      >
        {art}
      </span>
      <span className={`max-w-full truncate px-1 text-sm font-extrabold ${on ? "text-neutral-800" : "text-neutral-600"}`}>{label}</span>
      {sub && <span className="-mt-[3px] max-w-full truncate px-1 text-[10px] font-bold text-neutral-500">{sub}</span>}
      <span
        aria-hidden
        className={`absolute right-2 top-2 flex h-[22px] w-[22px] items-center justify-center rounded-full ${
          on ? "" : "border-[1.5px] border-neutral-300 bg-white text-neutral-500"
        }`}
        style={on ? { background: colors.accentDark } : undefined}
      >
        {on ? <CheckIcon size={14} /> : <PlusIcon size={12} />}
      </span>
    </button>
  );
}

function TileArt({ member, childGender }: { member: FamilyMember; childGender: ChildPrefs["gender"] }) {
  if (member.portrait) return <FaceAvatar member={member} size={60} childGender={childGender} ring="none" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={stickerFor(member, childGender)} alt="" className="h-[52px] w-[52px] object-contain" />
  );
}

/** 아직 없는 사람 타일의 스티커 — 할머니 정순·할아버지·엄마·아빠·형제자매·단짝 친구 */
function RoleArt({ role }: { role: "mom" | "dad" | "grandma" | "grandpa" | "sibling" | "friend" }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={ROLE_STICKER[role]} alt="" className="h-[52px] w-[52px] object-contain" />
  );
}
