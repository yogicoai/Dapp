"use client";

/**
 * 설정 — 엄마·아빠 특징 칸 안쪽(사장님 목록 2026-09-28).
 *
 * 칩 글자·순서는 lib/look-options adultLookRows 가 원본이다(가족 화면과 같은 목록·같은 저장값).
 *  - 엄마·아빠를 탭으로 나눈다 — 한 사람 줄이 열일곱 개라 둘을 쌓으면 화면이 너무 길다.
 *  - '늘 그대로'(얼굴·머리·체형)와 '평소 옷' 두 묶음. 칩이 많은 줄은 한 줄 가로 스크롤.
 *  - 여러 개 고르는 줄(이런 점도·늘 하는 것)은 값이 string[].
 *  - 안경은 glassesChoice/glassesPatch 로만 읽고 쓴다(예전 glasses:true 는 '안경 씀' 칩으로 살린다).
 * 저장은 부르는 쪽(설정 page)이 한다. 여기는 보여 주고 고른 값을 올려 보내기만 한다.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { VoiceGlyph } from "@/components/VoiceGlyph";
import { ROLE_STICKER, type Colors } from "@/components/family/family-ui";
import { FaceAvatar } from "@/components/family/Figures";
import { HangerIcon, LockIcon } from "@/components/family/icons";
import type { FamilyMember } from "@/lib/family";
import {
  adultLookRows,
  glassesChoice,
  glassesPatch,
  GLASSES_LEGACY,
  GLASSES_NONE,
  lookIcon,
  lookNoteMax,
  lookSwatch,
  type AdultLookRow,
} from "@/lib/look-options";
import { parentLooksToPrompt, type ParentLooks } from "@/lib/prefs";
import { LooksChangedNote } from "./FamilyBits";

export type ParentRole = "mom" | "dad";
export type Parents = { mom?: ParentLooks; dad?: ParentLooks };

export const PARENT_ROLES: readonly { role: ParentRole; label: string }[] = [
  { role: "mom", label: "엄마" },
  { role: "dad", label: "아빠" },
];

/** 메모 한 줄 최대 길이 — 저장값 정규화(prefs normalizeParents)·가족 화면과 같은 값(lookNoteMax, 40자) */
export const PARENT_NOTE_MAX = lookNoteMax("mom");

/** 하나만 고르는 칸(메모 뺌) — 몇 개 골랐나 셀 때 쓴다 */
const SINGLE_KEYS = [
  "hair",
  "bangs",
  "hairTexture",
  "hairColor",
  "face",
  "eyes",
  "brows",
  "skin",
  "build",
  "height",
  "beard",
  "outfit",
  "bottom",
  "color",
] as const;

/** 고른 개수 — 안경은 종류(또는 예전 '안경 씀') 하나로 센다. */
export function countAdultPicks(p: ParentLooks | undefined): number {
  if (!p) return 0;
  let n = 0;
  for (const k of SINGLE_KEYS) if (typeof p[k] === "string" && p[k]) n++;
  if (glassesChoice(p)) n++;
  n += p.marks?.length ?? 0;
  n += p.accessories?.length ?? 0;
  if (p.note) n++;
  return n;
}

/**
 * 접힌 머리글에 보일 칩 — 사람마다 하나. 머리·안경·옷을 먼저 보이고 나머지는 '외 N개'.
 * (그림용 문장 parentLooksToPrompt 는 부모가 읽기엔 길어서 따로 만든다.)
 */
export function adultFoldChips(parents: Parents): { chips: { text: string; icon: string }[]; count: number } {
  const chips: { text: string; icon: string }[] = [];
  let count = 0;
  for (const { role } of PARENT_ROLES) {
    const p = parents[role];
    const n = countAdultPicks(p);
    if (!p || n === 0) continue;
    count += n;
    const shown: string[] = [];
    let covered = 0;
    if (p.hair) {
      shown.push(p.hair);
      covered++;
    }
    const g = glassesChoice(p);
    if (g && g !== GLASSES_NONE) {
      shown.push(g === GLASSES_LEGACY ? "안경" : g);
      covered++;
    }
    if (p.outfit || p.color) {
      shown.push(p.outfit ? [p.color, p.outfit].filter(Boolean).join(" ") : `${p.color} 옷`);
      covered += (p.outfit ? 1 : 0) + (p.color ? 1 : 0);
    }
    const rest = n - covered;
    const text =
      shown.length === 0 ? `특징 ${n}개` : `${shown.join(" · ")}${rest > 0 ? ` 외 ${rest}개` : ""}`;
    chips.push({ text, icon: ROLE_STICKER[role] });
  }
  return { chips, count };
}

/**
 * 칩 한 줄 — 넘치면 가로로 민다(줄이 길어지지 않게). 처음 보일 때와 값을 불러온 뒤(reveal)에는
 * 켜진 칩이 화면 밖에 있으면 그 칩이 보이게 조금 밀어 둔다 — 골라 둔 걸 못 보고 또 고르지 않게.
 */
export function ScrollChipRow({
  label,
  multi,
  reveal,
  children,
}: {
  label: string;
  multi?: boolean;
  /** 저장값을 불러올 때마다 바뀌는 숫자 */
  reveal: number;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    const on = el?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!el || !on) return;
    const right = on.offsetLeft + on.offsetWidth;
    if (on.offsetLeft < el.scrollLeft || right > el.scrollLeft + el.clientWidth) {
      el.scrollLeft = Math.max(0, on.offsetLeft - 24);
    }
  }, [reveal]);
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-bold text-neutral-400">
        {label}
        {multi && <span className="font-medium text-neutral-300"> (여러 개)</span>}
      </p>
      <div
        ref={box}
        role="group"
        aria-label={label}
        className="relative -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:thin]"
      >
        {children}
      </div>
    </div>
  );
}

function ChipButton({
  on,
  colors,
  onClick,
  icon,
  swatch,
  children,
}: {
  on: boolean;
  colors: Colors;
  onClick: () => void;
  icon?: string;
  swatch?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      style={on ? { background: colors.accent } : undefined}
      className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 py-2 text-[13px] font-bold transition ${
        on ? "text-white shadow" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
      }`}
    >
      {icon && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={icon} alt="" aria-hidden className="h-5 w-5 object-contain" />
      )}
      {swatch && (
        <span
          aria-hidden
          className="h-3.5 w-3.5 shrink-0 rounded-full"
          style={{ background: swatch, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.18)" }}
        />
      )}
      {children}
    </button>
  );
}

/** 한 줄의 칩들 — 하나 고르기·여러 개 고르기·안경(종류) 셋을 한곳에서 */
function AdultRowChips({
  row,
  role,
  looks,
  colors,
  onPatch,
}: {
  row: AdultLookRow;
  role: ParentRole;
  looks: ParentLooks;
  colors: Colors;
  onPatch: (patch: Partial<ParentLooks>) => void;
}) {
  if (row.multi) {
    const cur = looks[row.key] ?? [];
    return (
      <>
        {row.options.map((o) => {
          const on = cur.includes(o);
          return (
            <ChipButton
              key={o}
              on={on}
              colors={colors}
              icon={lookIcon(o, undefined, role)}
              onClick={() => {
                const next = on ? cur.filter((x) => x !== o) : [...cur, o].slice(0, row.options.length);
                onPatch({ [row.key]: next.length ? next : undefined } as Partial<ParentLooks>);
              }}
            >
              {o}
            </ChipButton>
          );
        })}
      </>
    );
  }
  if (row.key === "glassesType") {
    const cur = glassesChoice(looks);
    // 예전 값(종류 없이 '안경 씀')은 목록에 없는 칩으로 앞에 세워 켜 둔다 — 다시 누르면 풀린다.
    const options = cur === GLASSES_LEGACY ? [GLASSES_LEGACY, ...row.options] : row.options;
    return (
      <>
        {options.map((o) => {
          const on = cur === o;
          return (
            <ChipButton
              key={o}
              on={on}
              colors={colors}
              icon={lookIcon(o, undefined, role)}
              // 안경은 반드시 glassesPatch 로 — glasses(예전 호환)와 종류를 함께 맞춘다.
              onClick={() => onPatch(glassesPatch(on ? undefined : o))}
            >
              {o}
            </ChipButton>
          );
        })}
      </>
    );
  }
  const cur = looks[row.key];
  return (
    <>
      {row.options.map((o) => {
        const on = cur === o;
        return (
          <ChipButton
            key={o}
            on={on}
            colors={colors}
            icon={lookIcon(o, undefined, role)}
            // 옷 색·머리 색·피부 앞 색 동그라미 — 가족 화면과 같은 색(look-options lookSwatch)
            swatch={lookSwatch(row.key, o)}
            // 같은 걸 다시 누르면 풀린다 — 잘못 고르고 못 되돌리면 답답하다.
            onClick={() => onPatch({ [row.key]: on ? undefined : o } as Partial<ParentLooks>)}
          >
            {o}
          </ChipButton>
        );
      })}
    </>
  );
}

/** 탭·머리글에 쓰는 얼굴 — 얼굴을 고정했으면 그 얼굴, 아니면 엄마·아빠 스티커 */
export function ParentFace({
  role,
  locked,
  size,
  className = "",
}: {
  role: ParentRole;
  locked?: FamilyMember;
  size: number;
  className?: string;
}) {
  if (locked) return <FaceAvatar member={locked} size={size} className={className} ring="0 0 0 2px #fff" />;
  // 스티커는 크기를 글자 폭(className 의 h-·w-)으로 받는다 — FaceAvatar 는 size 가 이긴다.
  return <VoiceGlyph voice={{ role }} className={className} />;
}

export function AdultLooksEditor({
  colors,
  parents,
  locked,
  changed,
  changes,
  reveal,
  linked,
  onPatch,
  onClear,
}: {
  colors: Colors;
  parents: Parents;
  /** 가족 캐릭터를 쓸 수 있는 사람(회원)인가 — '같은 값이에요' 안내를 이때만 보인다(게스트는 가족 화면이 없다). */
  linked?: boolean;
  /** 가족 화면에서 얼굴을 고정한 사람(그림 있음) */
  locked: Partial<Record<ParentRole, FamilyMember>>;
  /** 얼굴을 고정한 뒤 '늘 그대로'가 바뀌었나 */
  changed: Partial<Record<ParentRole, boolean>>;
  /** 바뀐 칸 — '머리 모양: 단발 → 숏컷' */
  changes: Partial<Record<ParentRole, string[]>>;
  reveal: number;
  onPatch: (role: ParentRole, patch: Partial<ParentLooks>) => void;
  onClear: (role: ParentRole) => void;
}) {
  const [role, setRole] = useState<ParentRole>("mom");
  const label = role === "mom" ? "엄마" : "아빠";
  const p = parents[role] ?? {};
  const rows = adultLookRows(role);
  const lockRows = rows.filter((r) => r.lock);
  const outfitRows = rows.filter((r) => !r.lock);
  const picked = countAdultPicks(p);

  const renderRow = (r: AdultLookRow) => (
    // 탭을 바꾸면 줄을 새로 그린다 — 켜진 칩이 보이게 다시 밀어 두려고(ScrollChipRow).
    <ScrollChipRow key={`${role}-${r.key}`} label={r.label} multi={r.multi} reveal={reveal}>
      <AdultRowChips row={r} role={role} looks={p} colors={colors} onPatch={(patch) => onPatch(role, patch)} />
    </ScrollChipRow>
  );

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-white/70 p-4">
      <p className="break-keep text-[11px] font-medium leading-relaxed text-neutral-400">
        안 고르시면 앱이 알아서 정해요. 안경처럼 있고 없음이 분명한 건 여기서 알려 주셔야 그림이 실제 모습과
        맞아요.{linked && " 우리 가족 캐릭터 화면과 같은 값이에요."}
      </p>

      {/* 얼굴을 고정한 뒤 '늘 그대로'가 바뀐 사람 — 탭을 옮겨도 보이게 위에 모아 둔다. */}
      {PARENT_ROLES.filter((x) => changed[x.role]).map((x) => (
        <LooksChangedNote key={x.role} who={x.label} colors={colors} changes={changes[x.role]} />
      ))}

      <div className="flex gap-2" role="tablist" aria-label="누구 특징">
        {PARENT_ROLES.map((x) => {
          const on = x.role === role;
          return (
            <button
              key={x.role}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setRole(x.role)}
              className={`relative flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full py-1 pl-1.5 pr-3.5 text-sm font-extrabold transition ${
                on ? "text-white shadow" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              }`}
              style={on ? { background: colors.accent } : undefined}
            >
              <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-white">
                {locked[x.role] ? (
                  <ParentFace role={x.role} locked={locked[x.role]} size={32} />
                ) : (
                  <VoiceGlyph voice={{ role: x.role }} className="h-7 w-7" />
                )}
              </span>
              {x.label}
              {countAdultPicks(parents[x.role]) > 0 && (
                <span className={`text-[11px] font-bold ${on ? "text-white/80" : "text-neutral-400"}`}>
                  {countAdultPicks(parents[x.role])}
                </span>
              )}
              {changed[x.role] && (
                <>
                  <span aria-hidden className="absolute right-2 top-1.5 h-2 w-2 rounded-full bg-orange-500" />
                  <span className="sr-only">, 모습이 바뀌었어요</span>
                </>
              )}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" aria-label={`${label} 특징`} className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <p className="flex items-center gap-1.5 text-sm font-extrabold text-neutral-600">
            <LockIcon size={15} />늘 그대로
          </p>
          <p className="break-keep text-[11px] font-medium text-neutral-400">
            {locked[role]
              ? `${label} 얼굴을 고정했어요. 여기를 바꾸면 가족 화면에서 다시 그릴지 물어봐요.`
              : "얼굴·머리·체형은 동화마다 같은 모습으로 그려요."}
          </p>
        </div>
        {lockRows.map(renderRow)}

        <div className="mt-2 flex flex-col gap-0.5">
          <p className="flex items-center gap-1.5 text-sm font-extrabold text-neutral-600">
            <HangerIcon size={16} />
            평소 옷
          </p>
          <p className="break-keep text-[11px] font-medium text-neutral-400">
            옷은 이야기에 맞게 갈아입어요. 평소 모습만 골라 주세요.
          </p>
        </div>
        {outfitRows.map(renderRow)}

        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-bold text-neutral-400">
            메모 한 줄 <span className="font-medium text-neutral-300">(선택)</span>
          </p>
          <input
            value={p.note ?? ""}
            onChange={(e) => onPatch(role, { note: e.target.value.slice(0, PARENT_NOTE_MAX) || undefined })}
            maxLength={PARENT_NOTE_MAX}
            placeholder={role === "mom" ? "예: 머리를 늘 한쪽으로 넘겨요" : "예: 웃으면 눈이 안 보여요"}
            className="w-full rounded-xl border-2 border-neutral-100 bg-neutral-50 px-3 py-2 text-[13px] font-medium text-neutral-700 outline-none placeholder:text-neutral-300 focus:border-neutral-200"
          />
        </div>

        {/* 지금 고른 것을 한 줄로 — 이 문장이 그대로 이야기·그림에 전해진다. */}
        {picked > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-2.5">
            <p className="min-w-0 flex-1 break-keep text-[12px] font-bold leading-relaxed text-emerald-700">
              이렇게 그려요 — {parentLooksToPrompt(p, role)}
            </p>
            <button
              type="button"
              onClick={() => onClear(role)}
              className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[11px] font-extrabold text-neutral-500 shadow-sm"
            >
              {label} 모두 지우기
            </button>
          </div>
        ) : (
          <p className="rounded-2xl bg-neutral-50 px-4 py-2.5 text-[12px] font-bold text-neutral-400">
            아무것도 안 고르시면 {label} 모습은 앱이 알아서 그려요.
          </p>
        )}
      </div>
    </div>
  );
}
