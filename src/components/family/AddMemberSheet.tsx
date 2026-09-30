"use client";

/**
 * 가족 더하기 시트 — (없으면) 엄마·아빠, 형제자매(호칭·이름·우리 아이·나이), 할머니·할아버지(호칭),
 * 그리고 따로 단짝 친구(이름·나이·성별 — 한 명만).
 *
 * 형제자매 이름(사장님 2026-09-30 "남동생이 아니라 이름으로 넣게 해줄수도 있게 해줘야해 우주 남동생네 가족이 되니깐"):
 * 호칭(남동생·누나 …)은 관계로 남고, 이름 칸을 호칭 바로 아래에 크게 둔다. '우리 아이예요'를 켜면 이름이 꼭 있어야
 * 한다 — 명패에는 진짜 이름만 서서(lib/family ourChildrenNames), 이름 없이 켜면 명패에 아무것도 안 붙는다.
 * 켜는 순간 이름이 비어 있으면 이름 칸으로 초점을 옮기고, 이름을 적을 때까지 '넣기'를 막는다.
 *
 * 순서(사장님 2026-09-28): 엄마 → 아빠 → 형제자매 → 할머니 → 할아버지 → (따로) 단짝 친구.
 * 단짝 친구는 가족이 아니라 가족 타일과 떨어진 자리에 두고, 이미 있으면 막는다(canAddRole).
 * 열 때마다 부르는 쪽이 key 를 바꿔 새로 만든다 — 앞에 적던 값이 남지 않게.
 * 넣기만 하면 쿠키 0개다(모아 보기에서). 1단계(누가 우리 가족?)에서 넣으면 이번에 그릴 사람에 들어간다.
 */

import { useId, useRef, useState, type ReactNode } from "react";
import {
  BEST_FRIEND_LABEL,
  CALL_NAMES,
  canAddRole,
  ROLE_LABEL,
  ROLE_ORDER,
  siblingGender,
  type FamilyMember,
  type FamilyRole,
} from "@/lib/family";
import { ourChildHint, ROLE_STICKER, siblingSticker, type Colors } from "./family-ui";
import { MinusIcon, PlusIcon } from "./icons";
import { Sheet } from "./Sheet";
import { BigButton, Chip, SwitchRow } from "./ui";

type AddRole = Exclude<FamilyRole, "child">;
/** 가족 타일 — ROLE_ORDER 그대로(엄마 → 아빠 → 형제자매 → 할머니 → 할아버지). 단짝 친구는 따로. */
const FAMILY_ROLES = ROLE_ORDER.filter((r): r is Exclude<AddRole, "friend"> => r !== "child" && r !== "friend").map(
  (role) => ({ role, label: ROLE_LABEL[role] }),
);
const OLDER = ["형", "오빠", "누나", "언니"];
const MIN_AGE = 1;
const MAX_AGE = 19;

export type NewMember = Omit<FamilyMember, "id">;

export function AddMemberSheet({
  colors,
  family,
  initialRole,
  childName,
  childAge,
  mode,
  onClose,
  onAdd,
}: {
  colors: Colors;
  family: FamilyMember[];
  initialRole?: FamilyRole;
  /** 아이 이름 — '우리 아이예요' 설명의 명패 예('하온·수아네 가족') */
  childName?: string;
  childAge: number | null;
  mode: "members" | "album";
  onClose: () => void;
  onAdd: (m: NewMember) => void;
}) {
  // 엄마·아빠는 없을 때만, 단짝 친구는 한 명뿐이라 이미 있으면 못 고른다.
  const canPick = (r: AddRole) => canAddRole(family, r);
  const familyRoles = FAMILY_ROLES.filter((r) => (r.role === "mom" || r.role === "dad" ? canPick(r.role) : true));
  const friendOpen = canPick("friend");

  const start: AddRole | null =
    initialRole && initialRole !== "child" && canPick(initialRole) ? (initialRole as AddRole) : null;
  const [role, setRole] = useState<AddRole | null>(start);
  const [callName, setCallName] = useState<string>(defaultCall(start, family));
  const [name, setName] = useState("");
  const baseAge = typeof childAge === "number" && childAge > 0 ? Math.min(childAge, 12) : 5;
  const [age, setAge] = useState<number>(baseAge);
  const [ageTouched, setAgeTouched] = useState(false);
  const [gender, setGender] = useState<"girl" | "boy" | undefined>(undefined);
  const [ourChild, setOurChild] = useState(false);
  const nameId = useId();
  const nameRef = useRef<HTMLInputElement>(null);

  const pickRole = (r: AddRole) => {
    setRole(r);
    setCallName(defaultCall(r, family));
    setName("");
    setGender(undefined);
    setOurChild(false);
    if (!ageTouched) setAge(baseAge);
  };

  const pickCall = (c: string) => {
    setCallName(c);
    // 나이를 아직 안 만졌으면 형·누나는 두 살 위, 동생은 두 살 아래로 어림한다.
    if (role === "sibling" && !ageTouched) {
      setAge(clampAge(OLDER.includes(c) ? baseAge + 2 : baseAge - 2));
    }
  };

  const bump = (d: number) => {
    setAgeTouched(true);
    setAge((a) => clampAge(a + d));
  };

  const isOld = role === "grandma" || role === "grandpa";
  const isParent = role === "mom" || role === "dad";
  const taken = isOld && family.some((m) => m.role === role && m.callName === callName);
  // '우리 아이예요'를 켠 형제는 이름이 꼭 있어야 한다(명패에 진짜 이름만 선다 — 위 머리말)
  const needName = role === "sibling" && ourChild && !name.trim();
  const ready =
    Boolean(role) &&
    (isParent || Boolean(callName)) &&
    !taken &&
    !needName &&
    (role !== "friend" || Boolean(gender)) &&
    (!role || canPick(role));

  const toggleOurChild = (on: boolean) => {
    setOurChild(on);
    if (on && !name.trim()) nameRef.current?.focus();
  };

  const submit = () => {
    if (!role || !ready) return;
    const trimmed = name.trim().slice(0, 20);
    if (role === "mom" || role === "dad") {
      onAdd({ role, callName: ROLE_LABEL[role] });
      return;
    }
    if (isOld) {
      onAdd({ role, callName });
      return;
    }
    if (role === "sibling") {
      onAdd({
        role,
        callName,
        name: trimmed || undefined,
        age,
        gender: siblingGender(callName),
        ...(ourChild ? { isOurChild: true } : {}),
      });
      return;
    }
    onAdd({ role: "friend", callName: "친구", name: trimmed || undefined, age, gender });
  };

  return (
    <Sheet onClose={onClose} label="가족 더하기">
      <h2 className="mt-4 text-center text-[21px] font-extrabold text-neutral-800">누구를 더할까요?</h2>
      <p className="mt-1 text-center text-[13px] font-medium text-neutral-500">
        {mode === "album" ? "넣기만 하면 쿠키 0개예요. 얼굴 고정은 나중에 골라도 돼요." : "넣은 사람은 이번에 그려서 얼굴을 고정해요."}
      </p>

      <div className="mt-4 grid w-full grid-cols-3 gap-2">
        {familyRoles.map((r) => (
          <RoleTile
            key={r.role}
            on={role === r.role}
            colors={colors}
            label={r.label}
            src={ROLE_STICKER[r.role]}
            onClick={() => pickRole(r.role)}
          />
        ))}
      </div>

      {/* 단짝 친구 — 가족과 떨어진 자리, 한 명만 */}
      <div className="mt-3 w-full">
        <p className="mb-1.5 break-keep text-xs font-extrabold text-neutral-500">
          {BEST_FRIEND_LABEL} 한 명 · 가족 사진엔 안 나와요
        </p>
        <button
          type="button"
          aria-pressed={role === "friend"}
          disabled={!friendOpen}
          onClick={() => pickRole("friend")}
          className={`flex min-h-[60px] w-full items-center gap-3 rounded-2xl border-2 px-3 text-left transition disabled:cursor-not-allowed ${
            role === "friend" ? "bg-white" : "border-transparent bg-neutral-100"
          }`}
          style={role === "friend" ? { borderColor: colors.accent } : undefined}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ROLE_STICKER.friend} alt="" className={`h-9 w-9 object-contain ${friendOpen ? "" : "opacity-50"}`} />
          </span>
          <span className={`flex-1 text-[15px] font-extrabold ${friendOpen ? "text-neutral-700" : "text-neutral-500"}`}>
            {BEST_FRIEND_LABEL}
          </span>
          {!friendOpen && <span className="text-xs font-extrabold text-neutral-500">이미 있어요</span>}
        </button>
      </div>

      {role && role !== "friend" && !isParent && (
        <Field label="뭐라고 부르나요?">
          <div className="flex flex-wrap gap-2">
            {(CALL_NAMES[role] ?? []).map((c) => (
              <Chip
                key={c}
                on={callName === c}
                colors={colors}
                icon={role === "sibling" ? siblingSticker(c) : undefined}
                onClick={() => pickCall(c)}
              >
                {c}
              </Chip>
            ))}
          </div>
          {taken && <p className="mt-1.5 text-xs font-bold text-rose-600">이미 있는 호칭이에요. 다른 호칭을 골라 주세요.</p>}
        </Field>
      )}

      {(role === "mom" || role === "dad") && (
        <p className="mt-4 w-full break-keep rounded-2xl bg-neutral-50 px-4 py-3 text-center text-[13px] font-semibold text-neutral-600">
          생김새는 넣은 뒤에 골라요. 전에 골라 둔 {ROLE_LABEL[role]} 특징이 있으면 그대로 이어져요.
        </p>
      )}

      {(role === "sibling" || role === "friend") && (
        <Field
          label={role === "friend" ? "친구 이름 (선택)" : "이름"}
          htmlFor={nameId}
          hint={
            role === "sibling"
              ? `${ourChild ? "가족 화면과 명패에" : "가족 화면에"} 이 이름으로 나와요${callName ? ` · 부르는 말(${callName})은 그대로예요` : ""}`
              : undefined
          }
        >
          <input
            ref={nameRef}
            id={nameId}
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 20))}
            maxLength={20}
            placeholder={role === "friend" ? "예) 서준" : "예) 수아"}
            aria-invalid={needName || undefined}
            className={`w-full rounded-2xl border-2 px-4 outline-none placeholder:font-medium placeholder:text-neutral-500 focus:border-neutral-400 ${
              role === "sibling" ? "min-h-[52px] py-3 text-lg font-extrabold" : "min-h-11 py-2.5 text-base font-bold"
            } ${needName ? "border-rose-300" : "border-neutral-200"}`}
          />
        </Field>
      )}

      {role === "sibling" && (
        <div className="mt-3 w-full">
          <SwitchRow
            on={ourChild}
            onChange={toggleOurChild}
            label="우리 아이예요"
            // 켰는데 이름이 없으면 설명 대신 아래 알림 한 줄만(같은 말을 두 번 하지 않게)
            hint={needName ? undefined : ourChildHint(childName, family, { name, callName, isOurChild: ourChild }, "add")}
            colors={colors}
          />
          {needName && (
            <p role="alert" className="mt-1.5 break-keep px-1 text-xs font-bold text-rose-600">
              우리 아이는 위에 이름을 꼭 적어 주세요 · 명패에 이름이 같이 나와요
            </p>
          )}
        </div>
      )}

      {(role === "sibling" || role === "friend") && (
        <Field label="나이">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="한 살 적게"
              onClick={() => bump(-1)}
              disabled={age <= MIN_AGE}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 disabled:opacity-40"
            >
              <MinusIcon size={18} />
            </button>
            <span className="min-w-16 text-center text-lg font-extrabold text-neutral-800" aria-live="polite">
              {age}살
            </span>
            <button
              type="button"
              aria-label="한 살 많게"
              onClick={() => bump(1)}
              disabled={age >= MAX_AGE}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 disabled:opacity-40"
            >
              <PlusIcon size={18} />
            </button>
          </div>
        </Field>
      )}

      {role === "friend" && (
        // '남자 친구·여자 친구'는 흔히 연인으로 읽힌다 — 아이의 단짝을 묻는 말로 둔다.
        <Field label="남자아이예요, 여자아이예요?">
          <div className="flex gap-2">
            {(
              [
                { v: "girl", label: "여자", icon: "/icons/gender-girl.webp" },
                { v: "boy", label: "남자", icon: "/icons/gender-boy.webp" },
              ] as const
            ).map((g) => (
              <Chip key={g.v} on={gender === g.v} colors={colors} icon={g.icon} onClick={() => setGender(g.v)}>
                {g.label}
              </Chip>
            ))}
          </div>
        </Field>
      )}

      <div className="mt-5 w-full">
        <BigButton colors={colors} onClick={submit} disabled={!ready}>
          {role === "friend" ? "단짝 친구로 넣기" : mode === "album" ? "우리 가족에 넣기" : "넣기"}
        </BigButton>
      </div>
      <button type="button" onClick={onClose} className="mt-3 min-h-11 px-3.5 text-sm font-extrabold text-neutral-600">
        그만둘게요
      </button>
    </Sheet>
  );
}

function RoleTile({
  on,
  colors,
  label,
  src,
  onClick,
}: {
  on: boolean;
  colors: Colors;
  label: string;
  src: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`flex min-h-[88px] flex-col items-center justify-center gap-1 rounded-2xl border-2 px-1 py-2 transition ${
        on ? "bg-white" : "border-transparent bg-neutral-100"
      }`}
      style={on ? { borderColor: colors.accent } : undefined}
    >
      <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="h-10 w-10 object-contain" />
      </span>
      <span className="text-[13px] font-extrabold text-neutral-700">{label}</span>
    </button>
  );
}

/**
 * 칸 이름 — 입력칸이면(htmlFor) <label> 로 이어 화면 읽기가 이름을 읽고, 글자를 눌러도 칸에 초점이 가게.
 * hint 는 칸 아래 작은 설명(입력칸의 aria-describedby 대신 label 뒤에 이어 읽힌다).
 */
function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: string; children: ReactNode }) {
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
      {hint && <p className="mt-1 break-keep px-1 text-[11.5px] font-semibold text-neutral-500">{hint}</p>}
    </div>
  );
}

function clampAge(a: number): number {
  return Math.max(MIN_AGE, Math.min(MAX_AGE, Math.round(a)));
}

/** 호칭 기본값 — 할머니가 이미 있으면 '외할머니'처럼 비어 있는 다음 호칭 */
function defaultCall(role: AddRole | null, family: FamilyMember[]): string {
  if (!role) return "";
  if (role === "friend") return "친구";
  if (role === "mom" || role === "dad") return ROLE_LABEL[role];
  if (role === "sibling") return "";
  const names = CALL_NAMES[role] ?? [];
  return names.find((c) => !family.some((m) => m.role === role && m.callName === c)) ?? names[0] ?? "";
}
