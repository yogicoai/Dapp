"use client";

/**
 * 2단계 — 생김새 고르기 (시안 LooksChanged.dc.html 위쪽 모양).
 *
 * 이번에 그릴 사람마다 탭 하나. 위에 '늘 그대로 / 이야기마다' 안내 두 칸, 아래 칩 두 묶음.
 *  - 아이: 설정과 같은 칩(lookRowsFor('child') = CHILD_LOOK_ROWS_ALL) → ChildPrefs.looks (설정에도 그대로 보인다)
 *  - 엄마·아빠: 어른 칩(adultLookRows) → ChildPrefs.parents (설정 엄마·아빠 칸과 같은 값)
 *  - 할머니·할아버지: 어른 칩 → member.looks
 *  - 형제·단짝 친구: 아이 칩 + 옷 종류(lookRowsFor) → member.looks
 * 줄마다 칩은 한 줄 — 넘치면 옆으로 민다(카드 끝까지 이어져 잘린 칩이 '더 있어요'를 알린다).
 * 고른 값은 줄 이름 옆에도 적는다(밀려서 안 보여도 알 수 있게). 목록에 없는 예전 값(형제 옷 색 '갈색',
 * 종류 없는 안경 '안경 씀' …)도 켜진 칩으로 앞에 보여 풀 수 있게 한다.
 * 안경: 어른은 종류 줄(glassesChoice/glassesPatch), 아이 쪽은 '안경을 써요' 켜기 하나.
 * 메모 한 줄은 '평소 옷' 끝의 입력 칸(칩 줄이 아니다). 길이는 lookNoteMax — 설정 입력 칸·저장과 같다.
 * 색 칩 동그라미는 lookSwatch(설정 엄마·아빠 칸과 같은 색). 아이 여러 개 고르기는 설정처럼 CHILD_MULTI_MAX 개까지.
 * 칩 앞 스티커는 lookIcon(칩, 성별, 누구) — 준비된 파일만 쓰고, 어른 칩에는 아이 스티커를 안 붙인다.
 * 저장은 부르는 쪽(page)이 한다. 여기는 보여 주고 고른 값을 올려 보내기만 한다.
 */

import { useEffect, useId, useRef } from "react";
import { isKidRole, lookRowsFor, type FamilyLooks, type FamilyMember } from "@/lib/family";
import {
  CHILD_MULTI_MAX,
  GLASSES_ICON,
  glassesChoice,
  glassesPatch,
  lookIcon,
  lookNoteMax,
  lookSwatch,
  type LookWho,
} from "@/lib/look-options";
import type { ChildLooks, ChildPrefs, ParentLooks } from "@/lib/prefs";
import { displayName, genderOf, looksLine, topicOf, type Colors } from "./family-ui";
import { FaceAvatar } from "./Figures";
import { HangerIcon, LockIcon } from "./icons";
import { BigButton, BottomBar, Chip, LooksPreview, StepDots, TopBar } from "./ui";

/** 칩 한 줄 — 하나만 고르기 / 여러 개 고르기(max 개까지) */
type Row =
  | { key: string; label: string; opts: readonly string[]; multi?: false; value: string | undefined; set: (v: string | undefined) => void }
  | {
      key: string;
      label: string;
      opts: readonly string[];
      multi: true;
      max?: number;
      value: string[];
      set: (v: string[] | undefined) => void;
    };

/** 아이 쪽(아이·형제·친구) 안경 켜기 칩 글자 */
const KID_GLASSES = "안경을 써요";

const NOTE_PLACEHOLDER: Record<FamilyMember["role"], string> = {
  child: "예) 늘 공룡 티셔츠를 입어요",
  mom: "예) 늘 머리핀을 꽂아요",
  dad: "예) 늘 야구 모자를 써요",
  grandma: "예) 늘 꽃무늬 조끼를 입어요",
  grandpa: "예) 늘 지팡이를 짚어요",
  sibling: "예) 늘 공룡 가방을 메요",
  friend: "예) 늘 축구공을 들고 다녀요",
};

const words = (x: unknown): string[] =>
  Array.isArray(x) ? x.filter((y): y is string => typeof y === "string" && y.trim() !== "") : [];

export function LooksView({
  colors,
  child,
  members,
  idx,
  mode,
  onPick,
  onChildLook,
  onParentLook,
  onMemberLook,
  onBack,
  onNext,
}: {
  colors: Colors;
  child: ChildPrefs;
  /** 이번에 고를 사람들(순서대로) */
  members: FamilyMember[];
  idx: number;
  mode: "fix" | "edit";
  onPick: (i: number) => void;
  onChildLook: (patch: Partial<ChildLooks>) => void;
  onParentLook: (role: "mom" | "dad", patch: Partial<ParentLooks>) => void;
  onMemberLook: (id: string, patch: Partial<FamilyLooks>) => void;
  onBack: () => void;
  /** 다음 사람으로 — 마지막이면 쿠키 확인(fix) 또는 고치기 끝(edit) */
  onNext: () => void;
}) {
  const noteId = useId();
  const m = members[Math.min(idx, members.length - 1)];
  if (!m) return null;
  const last = idx >= members.length - 1;
  const next = members[idx + 1];
  const who: LookWho = m.role;
  const kidSide = isKidRole(m.role);
  const gender = genderOf(m, child.gender);

  // 이 사람의 생김새 원본과 저장 길 — 아이·엄마·아빠는 설정 값(ChildPrefs), 그 밖은 member.looks.
  let looks: FamilyLooks;
  let patch: (p: Partial<FamilyLooks>) => void;
  if (m.role === "child") {
    looks = child.looks ?? {};
    // 아이 줄 칸(ChildLooks)만 넘긴다 — 설정 화면과 같은 데이터.
    patch = (p) => onChildLook(p as Partial<ChildLooks>);
  } else if (m.role === "mom" || m.role === "dad") {
    const role = m.role;
    looks = child.parents?.[role] ?? {};
    patch = (p) => onParentLook(role, p);
  } else {
    looks = m.looks ?? {};
    const id = m.id;
    patch = (p) => onMemberLook(id, p);
  }

  const defs = lookRowsFor(m.role);

  const lock: Row[] = [];
  const outfit: Row[] = [];
  for (const d of defs) {
    const key = d.key;
    let row: Row;
    if (key === "glassesType") {
      // 안경 — 종류가 있으면 종류, 예전 glasses:true 만 있으면 '안경 씀'. 고를 때는 glasses 도 같이 맞춘다.
      row = { key, label: d.label, opts: d.options, value: glassesChoice(looks), set: (v) => patch(glassesPatch(v)) };
    } else if (d.multi) {
      row = {
        key,
        label: d.label,
        opts: d.options,
        multi: true,
        // 아이는 설정처럼 CHILD_MULTI_MAX 개까지 — 저장(prefs)이 그만큼만 남겨서, 넘게 고르면 다시 열 때 사라진다.
        ...(m.role === "child" ? { max: CHILD_MULTI_MAX } : {}),
        value: words(looks[key]),
        set: (v) => patch({ [key]: v } as Partial<FamilyLooks>),
      };
    } else {
      const v = looks[key];
      row = {
        key,
        label: d.label,
        opts: d.options,
        value: typeof v === "string" && v.trim() ? v : undefined,
        set: (nv) => patch({ [key]: nv } as Partial<FamilyLooks>),
      };
    }
    (d.lock ? lock : outfit).push(row);
  }
  if (kidSide) {
    // 아이 쪽 안경은 켜기 하나 — '이런 점도' 앞에 둔다.
    const glassesRow: Row = {
      key: "glasses",
      label: "안경",
      opts: [KID_GLASSES],
      value: looks.glasses ? KID_GLASSES : undefined,
      set: (v) => patch({ glasses: v ? true : undefined }),
    };
    const at = lock.findIndex((r) => r.key === "marks");
    lock.splice(at >= 0 ? at : lock.length, 0, glassesRow);
  }

  const iconOf = (o: string) => (o === KID_GLASSES ? GLASSES_ICON : lookIcon(o, gender, who));
  const max = lookNoteMax(who);
  const note = typeof looks.note === "string" ? looks.note : "";
  const preview = looksLine(m, child);

  return (
    <>
      <div className="flex flex-col rounded-[28px] bg-white/90 px-5 pb-6 pt-4 shadow-xl backdrop-blur">
        <TopBar
          onBack={onBack}
          title={mode === "edit" ? `${displayName(m)} 생김새 고치기` : "생김새 고르기"}
          right={mode === "fix" ? <StepDots at={2} colors={colors} /> : undefined}
        />

        {members.length > 1 && (
          <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="그릴 사람">
            {members.map((x, i) => {
              const on = i === idx;
              return (
                <button
                  key={x.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => onPick(i)}
                  className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-full py-1 pl-1 pr-3.5 text-sm font-extrabold transition ${
                    on ? "text-white shadow" : "bg-neutral-100 text-neutral-600"
                  }`}
                  style={on ? { background: colors.accent } : undefined}
                >
                  <FaceAvatar member={x} size={34} childGender={child.gender} />
                  {displayName(x)}
                </button>
              );
            })}
          </div>
        )}

        <h1 className="mt-3.5 break-keep text-[22px] font-extrabold text-neutral-800">{topicOf(m)} 어떻게 생겼나요?</h1>
        <p className="mt-1 break-keep text-[13px] font-medium text-neutral-500">
          사진은 받지 않아요. 특징만 골라 주시면 그려 드려요.
          {(m.role === "child" || m.role === "mom" || m.role === "dad") && " 설정의 특징과 같은 값이에요."}
        </p>

        <div className="mt-3.5 grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1 rounded-2xl p-3" style={{ background: colors.accentSoft }}>
            <span className="flex items-center gap-1.5 text-sm font-extrabold" style={{ color: colors.accentDark }}>
              <LockIcon />늘 그대로
            </span>
            <span className="break-keep text-xs font-semibold leading-snug text-neutral-600">
              얼굴·머리·체형은 동화마다 같은 모습을 기준으로 그려요
            </span>
          </div>
          <div className="flex flex-col gap-1 rounded-2xl bg-emerald-50 p-3">
            <span className="flex items-center gap-1.5 text-sm font-extrabold text-emerald-700">
              <HangerIcon />
              이야기마다
            </span>
            <span className="break-keep text-xs font-semibold leading-snug text-neutral-600">
              옷은 이야기에 맞게 갈아입어요. 여기선 평소 옷을 골라 주세요
            </span>
          </div>
        </div>

        <p className="mt-5 flex items-center gap-1.5 text-sm font-extrabold text-neutral-500">
          <LockIcon size={15} />늘 그대로
        </p>
        {m.portrait && (
          <p className="mt-1 break-keep text-xs font-semibold" style={{ color: colors.accentDark }}>
            얼굴을 고정했어요 — 여기를 바꾸면 다시 그릴지 여쭤볼게요
          </p>
        )}
        {lock.map((r) => (
          <ChipRow key={`${m.id}-${r.key}`} row={r} colors={colors} iconOf={iconOf} />
        ))}

        <p className="mt-6 flex items-center gap-1.5 text-sm font-extrabold text-neutral-500">
          <HangerIcon size={16} />
          평소 옷 <span className="text-xs font-bold text-neutral-500">(동화마다 바뀔 수 있어요)</span>
        </p>
        {outfit.map((r) => (
          <ChipRow key={`${m.id}-${r.key}`} row={r} colors={colors} iconOf={iconOf} />
        ))}
        <div className="mt-3">
          <label htmlFor={noteId} className="mb-1 block text-xs font-extrabold text-neutral-500">
            메모 한 줄 <span className="font-bold">(선택)</span>
          </label>
          <input
            id={noteId}
            value={note}
            onChange={(e) => {
              const v = e.target.value.slice(0, max);
              patch({ note: v.trim() ? v : undefined });
            }}
            maxLength={max}
            placeholder={NOTE_PLACEHOLDER[m.role]}
            className="min-h-11 w-full rounded-2xl border-2 border-neutral-200 px-4 py-2.5 text-base font-bold outline-none placeholder:font-medium placeholder:text-neutral-500 focus:border-neutral-400"
          />
        </div>

        {/* 그림에 보내는 문장 그대로라 길다 — 두 줄만 보이고 '전체 보기'로 편다(LooksPreview). */}
        <div className="mt-5">
          <LooksPreview key={m.id} text={preview ? `이렇게 그려요 — ${preview}` : "아무것도 안 고르시면 알아서 그려요."} />
        </div>

        {mode === "fix" && (
          <button
            type="button"
            onClick={onNext}
            className="mt-2 min-h-11 self-center px-3 text-sm font-extrabold"
            style={{ color: colors.accentDark }}
          >
            잘 모르겠어요, 알아서 그려 주세요
          </button>
        )}
      </div>

      <BottomBar>
        <BigButton colors={colors} onClick={onNext}>
          {mode === "edit" ? "다 골랐어요" : last || !next ? "다 골랐어요 →" : `다음 — ${displayName(next)} →`}
        </BigButton>
      </BottomBar>
    </>
  );
}

/**
 * 칩 한 줄 — 넘치면 옆으로 민다. 카드 안쪽 여백(px-5)만큼 양옆으로 늘여 칩이 카드 끝에서 잘려 보이게 한다.
 * 처음 그릴 때 고른 칩이 밀려 안 보이면 보이는 곳까지 옮겨 둔다.
 */
function ChipRow({ row, colors, iconOf }: { row: Row; colors: Colors; iconOf: (o: string) => string | undefined }) {
  const scroller = useRef<HTMLDivElement>(null);
  const picked = row.multi ? row.value : row.value ? [row.value] : [];
  // 목록에 없는 예전 값도 켜진 칩으로 앞에 — 보이고, 눌러서 풀 수 있게.
  const opts = [...picked.filter((v) => !row.opts.includes(v)), ...row.opts];

  useEffect(() => {
    const el = scroller.current;
    const on = el?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!el || !on) return;
    if (on.offsetLeft + on.offsetWidth > el.scrollLeft + el.clientWidth) el.scrollLeft = Math.max(0, on.offsetLeft - 24);
  }, []);

  const toggle = (o: string) => {
    if (row.multi) {
      // 상한을 넘기면 가장 먼저 고른 것을 밀어낸다(설정 아이 특징 칸과 같은 규칙).
      const next = row.value.includes(o) ? row.value.filter((x) => x !== o) : [...row.value, o].slice(-(row.max ?? Infinity));
      row.set(next.length > 0 ? next : undefined);
    } else {
      // 같은 걸 다시 누르면 풀린다 — 잘못 고르고 못 되돌리면 답답하다.
      row.set(row.value === o ? undefined : o);
    }
  };

  return (
    <div className="mt-3">
      <p className="mb-1 flex min-w-0 items-baseline gap-1.5 text-xs font-extrabold text-neutral-500">
        <span className="shrink-0">{row.label}</span>
        {row.multi && <span className="shrink-0 font-bold text-neutral-400">여러 개</span>}
        {picked.length > 0 && (
          <span className="min-w-0 truncate" style={{ color: colors.accentDark }}>
            · {picked.join(", ")}
          </span>
        )}
      </p>
      <div
        ref={scroller}
        role="group"
        aria-label={row.label}
        className="relative -mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {opts.map((o) => (
          <Chip
            key={o}
            on={picked.includes(o)}
            colors={colors}
            icon={iconOf(o)}
            swatch={lookSwatch(row.key, o)}
            onClick={() => toggle(o)}
          >
            {o}
          </Chip>
        ))}
        {/* 끝 여백 — 넘칠 때 마지막 칩이 카드 끝에 붙지 않게 */}
        <span aria-hidden className="w-px shrink-0" />
      </div>
    </div>
  );
}
