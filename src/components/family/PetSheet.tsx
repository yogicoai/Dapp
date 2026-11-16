"use client";

/**
 * 반려견 시트(사장님 2026-11-06 "반려견 추가하는 기능도 … 칸은 만들어줘라") — 넣기·고치기·빼기·다시 넣기를 한 시트에서.
 *
 * 1차는 **이름과 특징**(견종·털 색·몸집·털·귀·메모)만 저장한다. 그림 고정은 다음 단계라 쿠키가 들지 않고, 그리기
 * 흐름(확인 창·api/family/portrait)에도 들어가지 않는다(lib/family canDrawRole).
 * 동화에는 만들기 화면 '동물 친구랑' → '우리 강아지 불러오기'(components/create/PetChip)로 부르고, 고른 특징이 이야기에
 * 그대로 간다(lib/family-cast storyFamilyLooks · lib/family petLooksToPrompt).
 * 이름은 꼭 받는다 — 이야기에서 부를 이름이자 불러오기 칩의 글자다.
 * 빼기는 다른 사람처럼 지우지 않고 회색 카드로 남긴다(2026-10-26 "회색처럼만"). 두 마리 규칙은 넣기·다시 넣기에서 본다.
 */

import { useId, useState, type ReactNode } from "react";
import { PET_LABEL, PET_LIMIT, PET_LOOK_ROWS, type FamilyLooks, type FamilyMember } from "@/lib/family";
import { lookNoteMax } from "@/lib/look-options";
import { objectOf, ROLE_STICKER, type Colors } from "./family-ui";
import { Sheet } from "./Sheet";
import { BigButton, Chip } from "./ui";

/** 시트가 넘기는 값 — 이름과 특징(고른 칸만, 하나도 없으면 undefined) */
export type PetDraft = { name: string; looks?: FamilyLooks };

const NAME_MAX = 20;
const NOTE_MAX = lookNoteMax("pet");

type Picks = Partial<Record<(typeof PET_LOOK_ROWS)[number]["key"], string>>;

function picksOf(l: FamilyLooks | undefined): Picks {
  const out: Picks = {};
  for (const r of PET_LOOK_ROWS) {
    const v = l?.[r.key];
    if (typeof v === "string" && v.trim()) out[r.key] = v.trim();
  }
  return out;
}

/** 고른 칸·메모만 남긴 특징 — 하나도 없으면 undefined */
function looksOf(picks: Picks, note: string): FamilyLooks | undefined {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(picks)) if (v) out[k] = v;
  const n = note.trim().slice(0, NOTE_MAX);
  if (n) out.note = n;
  return Object.keys(out).length ? (out as FamilyLooks) : undefined;
}

export function PetSheet({
  colors,
  pet,
  canAdd,
  onClose,
  onAdd,
  onSave,
  onRemove,
  onRestore,
}: {
  colors: Colors;
  /** 고칠 반려견 — 없으면 새로 넣기 */
  pet?: FamilyMember;
  /** 한 마리 더 넣을 수 있나(두 마리 규칙 — lib/family canAddRole). 넣기·다시 넣기에서 본다. */
  canAdd: boolean;
  onClose: () => void;
  onAdd: (d: PetDraft) => void;
  onSave: (d: PetDraft) => void;
  /** 빼기 — 지우지 않고 회색(inactive)으로 */
  onRemove: () => void;
  /** 뺀 반려견 다시 넣기 */
  onRestore: () => void;
}) {
  const [name, setName] = useState(pet?.name ?? "");
  const [picks, setPicks] = useState<Picks>(() => picksOf(pet?.looks));
  const [note, setNote] = useState(pet?.looks?.note ?? "");
  const [asking, setAsking] = useState(false);
  const nameId = useId();
  const noteId = useId();

  const typed = name.trim().slice(0, NAME_MAX);
  const draft: PetDraft = { name: typed, looks: looksOf(picks, note) };
  const changed =
    !pet || typed !== (pet.name ?? "").trim() || JSON.stringify(draft.looks ?? null) !== JSON.stringify(looksOf(picksOf(pet.looks), pet.looks?.note ?? "") ?? null);
  const title = pet ? pet.name || PET_LABEL : `${PET_LABEL} 넣기`;

  const toggle = (key: keyof Picks, option: string) => setPicks((p) => ({ ...p, [key]: p[key] === option ? undefined : option }));

  // 뺀 반려견 — 회색으로 남아 있다. 다시 넣기만(이름·특징 그대로).
  if (pet?.inactive) {
    return (
      <Sheet onClose={onClose} label={`${title} 메뉴`}>
        <Head title={title} sub="빠져 있어요 — 동화에 안 나와요." dim />
        <div className="mt-4 flex w-full flex-col gap-2">
          <BigButton colors={colors} onClick={onRestore} disabled={!canAdd}>
            {PET_LABEL}으로 다시 넣기
          </BigButton>
          {!canAdd && (
            <p className="break-keep text-center text-xs font-bold text-neutral-500">
              {PET_LABEL}은 {PET_LIMIT}마리까지예요 · 다른 {PET_LABEL}을 먼저 빼 주세요
            </p>
          )}
        </div>
        <button type="button" onClick={onClose} className="mt-1 min-h-11 px-3.5 text-sm font-extrabold text-neutral-500">
          닫기
        </button>
      </Sheet>
    );
  }

  if (pet && asking) {
    return (
      <Sheet onClose={() => setAsking(false)} label={`${title} 빼기`}>
        <h2 className="mt-5 break-keep text-center text-[20px] font-extrabold text-neutral-800">{objectOf(pet)} 뺄까요?</h2>
        <p className="mt-2 break-keep text-center text-sm font-medium leading-normal text-neutral-600">
          동화에 안 나와요. 회색으로 남아 있어서 누르면 언제든 다시 넣을 수 있어요.
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

  const ready = Boolean(typed) && (pet ? changed : canAdd);

  return (
    <Sheet onClose={onClose} label={pet ? `${title} 고치기` : `${PET_LABEL} 넣기`}>
      <Head title={title} sub="고른 특징대로 동화에 나와요 · 그림 고정은 곧 열려요" />

      <Field label="이름" htmlFor={nameId}>
        <input
          id={nameId}
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
          maxLength={NAME_MAX}
          placeholder="예) 콩이"
          className="min-h-[52px] w-full rounded-2xl border-2 border-neutral-200 px-4 py-2.5 text-lg font-extrabold outline-none placeholder:font-medium placeholder:text-neutral-500 focus:border-neutral-400"
        />
      </Field>

      {PET_LOOK_ROWS.map((row) => (
        <Field key={row.key} label={`${row.label} (선택)`}>
          <div className="flex flex-wrap gap-2">
            {row.options.map((o) => (
              <Chip key={o} on={picks[row.key as keyof Picks] === o} colors={colors} onClick={() => toggle(row.key as keyof Picks, o)}>
                {o}
              </Chip>
            ))}
          </div>
        </Field>
      ))}

      <Field label="더 알려 주고 싶은 점 (선택)" htmlFor={noteId}>
        <input
          id={noteId}
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
          maxLength={NOTE_MAX}
          placeholder="예) 산책을 제일 좋아해요"
          className="min-h-11 w-full rounded-2xl border-2 border-neutral-200 px-4 py-2.5 text-base font-bold outline-none placeholder:font-medium placeholder:text-neutral-500 focus:border-neutral-400"
        />
      </Field>

      <p className="mt-4 w-full break-keep rounded-2xl bg-neutral-50 px-4 py-3 text-center text-[13px] font-semibold text-neutral-600">
        동화 만들기에서 &apos;동물 친구랑&apos;을 고르면 이 {PET_LABEL}을 불러올 수 있어요
      </p>

      <div className="mt-4 w-full">
        <BigButton colors={colors} onClick={() => (pet ? onSave(draft) : onAdd(draft))} disabled={!ready}>
          {pet ? "저장" : `${PET_LABEL}으로 넣기`}
        </BigButton>
        {!pet && !canAdd && (
          <p className="mt-1.5 break-keep text-center text-xs font-bold text-neutral-500">
            {PET_LABEL}은 {PET_LIMIT}마리까지 넣을 수 있어요
          </p>
        )}
      </div>
      {pet && (
        <button
          type="button"
          onClick={() => setAsking(true)}
          className="mt-2 flex min-h-[52px] w-full items-center justify-center rounded-2xl text-[15px] font-extrabold text-rose-600 transition hover:bg-rose-50"
        >
          {PET_LABEL} 빼기
        </button>
      )}
      <button type="button" onClick={onClose} className="mt-1 min-h-11 px-3.5 text-sm font-extrabold text-neutral-600">
        {pet ? "닫기" : "그만둘게요"}
      </button>
    </Sheet>
  );
}

function Head({ title, sub, dim }: { title: string; sub: string; dim?: boolean }) {
  return (
    <div className="mt-4 flex w-full items-center gap-3.5">
      <span className={`flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-neutral-100 ${dim ? "grayscale" : ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ROLE_STICKER.pet} alt="" aria-hidden className={`h-14 w-14 object-contain ${dim ? "opacity-60" : ""}`} />
      </span>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-xl font-extrabold ${dim ? "text-neutral-500" : "text-neutral-800"}`}>{title}</p>
        <p className="mt-0.5 break-keep text-[13px] font-semibold text-neutral-500">{sub}</p>
      </div>
    </div>
  );
}

/** 칸 이름 — 입력칸이면(htmlFor) <label> 로 이어 화면 읽기가 이름을 읽게 */
function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  const cls = "mb-1.5 block text-xs font-extrabold text-neutral-500";
  return (
    <div className="mt-4 w-full">
      {htmlFor ? (
        <label htmlFor={htmlFor} className={cls}>
          {label}
        </label>
      ) : (
        <p className={cls}>{label}</p>
      )}
      {children}
    </div>
  );
}
