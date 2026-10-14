"use client";

/**
 * 2단계 — 생김새 고르기 (시안 LooksChanged.dc.html 위쪽 모양).
 *
 * 이번에 그릴 사람마다 탭 하나. 맨 위에 그리는 방법 두 갈래 — '특징 고르기'(칩) / '사진으로 할게요'(사장님 2026-09-29).
 *  - 특징 고르기: '늘 그대로 / 이야기마다' 안내 두 칸, 아래 칩 두 묶음(지금까지와 같다).
 *  - 사진으로 할게요: 큰 사진 고르기 칸(폰에서는 사진첩·카메라), 미리보기, '다른 사진'·'사진 빼기', 사진 팁, 약속
 *    "사진은 저장하지 않고, 그림을 그리는 데 한 번 쓰고 바로 지워요". 사진이면 칩은 숨긴다 — 사진이 얼굴을 정한다
 *    (예전에 고른 칩은 사진과 함께 보내지 않고, 사진 그림을 고정하면 비운다 — 사장님 2026-10-14 "중복 설정으로 인한 오류",
 *    lib/family dropPhotoFixedLooks). 사진을 고르면 곧바로 다음 사람, 마지막이면 쿠키 확인 창
 *    (onPhotoReady — page 가 정한다. 값은 그 창의 버튼을 눌러야 나간다).
 *    사진은 여기서 줄여(components/family/photo.ts) page 의 메모리(React state)로만 올려 보낸다 — 저장하지 않는다.
 * 회원의 아이·엄마·아빠 특징은 여기서만 고른다 — 설정의 '아이 특징'·'엄마·아빠 특징' 칸은 회원에게서 걷었다
 * (사장님 2026-09-28, 설정은 '우리 가족 캐릭터 ›' 한 줄로 이리 데려온다). 그래서 설정에 있던 것은 모두 여기 있다:
 * 아이 10줄 전부(여러 개 고르기 포함)·안경, 엄마·아빠 어른 줄 전부, 그리고 '모두 지우기'.
 * '메모 한 줄' 입력 칸은 사진 올리기로 바꿔 뺐다(사장님 2026-09-29) — 이미 적힌 메모는 지우지 않고 그대로
 * 그림·이야기 줄(looksLine)과 미리보기에 들어간다('모두 지우기'는 메모까지 비운다).
 *  - 아이: 아이 칩 전부(lookRowsFor('child') = CHILD_LOOK_ROWS_ALL) → ChildPrefs.looks
 *  - 엄마·아빠: 어른 칩(adultLookRows) → ChildPrefs.parents
 *  - 할머니·할아버지: 어른 칩 → member.looks
 *  - 형제·단짝 친구: 아이 칩 + 옷 종류(lookRowsFor) → member.looks
 * 줄마다 칩은 한 줄 — 넘치면 옆으로 민다(카드 끝까지 이어져 잘린 칩이 '더 있어요'를 알린다).
 * 고른 값은 줄 이름 옆에도 적는다(밀려서 안 보여도 알 수 있게). 목록에 없는 예전 값(형제 옷 색 '갈색',
 * 종류 없는 안경 '안경 씀' …)도 켜진 칩으로 앞에 보여 풀 수 있게 한다.
 * 안경: 어른은 종류 줄(glassesChoice/glassesPatch), 아이 쪽은 '안경을 써요' 켜기 하나.
 * 색 칩 동그라미는 lookSwatch. 아이 여러 개 고르기는 CHILD_MULTI_MAX 개까지(저장이 그만큼만 남긴다).
 * '모두 지우기'(미리보기 오른쪽)는 이 사람 칸만 비운다 — 고른 칸을 모두 빈 값으로 넘긴다(묻고 나서).
 * 칩 앞 스티커는 lookIcon(칩, 성별, 누구) — 준비된 파일만 쓰고, 어른 칩에는 아이 스티커를 안 붙인다.
 * 저장은 부르는 쪽(page)이 한다. 여기는 보여 주고 고른 값을 올려 보내기만 한다.
 */

import { useEffect, useId, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { isKidRole, isPhotoFixed, lookRowsFor, type FamilyLooks, type FamilyMember } from "@/lib/family";
import { PHOTO_PROMISE } from "@/lib/family-photo";
import {
  CHILD_MULTI_MAX,
  GLASSES_ICON,
  glassesChoice,
  glassesPatch,
  lookIcon,
  lookSwatch,
  type LookWho,
} from "@/lib/look-options";
import type { ChildLooks, ChildPrefs, ParentLooks } from "@/lib/prefs";
import { displayName, genderOf, looksLine, looksPicked, stemOf, topicOf, type Colors } from "./family-ui";
import { FaceAvatar } from "./Figures";
import { CameraIcon, ChipsIcon, HangerIcon, LockIcon } from "./icons";
import { preparePhoto } from "./photo";
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

/** 사진 팁 — 사진 고르기 칸 바로 아래 작은 목록(사장님 2026-09-29) */
const PHOTO_TIPS: readonly [string, string][] = [
  ["🙂", "얼굴이 잘 보이는 정면 사진"],
  ["☀️", "밝은 곳에서 찍은 사진"],
  ["👤", "한 사람만 나온 사진"],
  ["🧢", "모자·선글라스·마스크 없이"],
  ["👕", "몸까지 나오면 옷도 비슷하게 그려요"],
  ["📷", "흔들리지 않은 선명한 사진"],
];

const words = (x: unknown): string[] =>
  Array.isArray(x) ? x.filter((y): y is string => typeof y === "string" && y.trim() !== "") : [];

export function LooksView({
  colors,
  child,
  members,
  idx,
  mode,
  photos,
  photoFirst,
  notice,
  onPick,
  onChildLook,
  onParentLook,
  onMemberLook,
  onPhoto,
  onPhotoReady,
  onBack,
  onNext,
}: {
  colors: Colors;
  child: ChildPrefs;
  /** 이번에 고를 사람들(순서대로) */
  members: FamilyMember[];
  idx: number;
  mode: "fix" | "edit";
  /** 사람 id → 이번 방문에 고른 사진(줄인 JPEG data URL). page 의 메모리에만 있다 — 저장하지 않는다. */
  photos: Readonly<Record<string, string>>;
  /** 처음부터 '사진으로 할게요' 쪽을 연다(앞 사진이 거절돼 다시 고르러 왔을 때) */
  photoFirst?: boolean;
  /** 맨 위에 한 줄 알림(앞 사진이 거절됐을 때 등) */
  notice?: string;
  onPick: (i: number) => void;
  onChildLook: (patch: Partial<ChildLooks>) => void;
  onParentLook: (role: "mom" | "dad", patch: Partial<ParentLooks>) => void;
  onMemberLook: (id: string, patch: Partial<FamilyLooks>) => void;
  /** 사진을 넣거나(data URL) 뺀다(null) — page 가 메모리에만 둔다 */
  onPhoto: (id: string, photo: string | null) => void;
  /** 사진이 준비됐다(그 사람을 아직 보고 있을 때만) — 칩 없이 다음으로(page 가 다음 사람·쿠키 확인 창을 정한다) */
  onPhotoReady: (id: string) => void;
  onBack: () => void;
  /** 다음 사람으로 — 마지막이면 쿠키 확인(fix) 또는 고치기 끝(edit) */
  onNext: () => void;
}) {
  const fileId = useId();
  const tipsId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  /** 사람마다 고른 방법 — true 사진, false 특징. 안 골랐으면 사진이 있거나 photoFirst 면 사진 쪽. */
  const [photoMode, setPhotoMode] = useState<Record<string, boolean>>({});
  /** 사진을 줄이는 중인 사람 */
  const [preparing, setPreparing] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<Record<string, string>>({});
  const m = members[Math.min(idx, members.length - 1)];
  /** 지금 보고 있는 사람 — 사진을 줄이는 사이 다른 탭으로 옮겼으면 저절로 넘어가지 않는다 */
  const shownId = useRef<string | undefined>(undefined);
  useEffect(() => {
    shownId.current = m?.id;
  }, [m?.id]);
  if (!m) return null;
  const last = idx >= members.length - 1;
  const next = members[idx + 1];
  const who: LookWho = m.role;
  const kidSide = isKidRole(m.role);
  const gender = genderOf(m, child.gender);

  // 이 사람의 생김새 원본과 저장 길 — 아이·엄마·아빠는 ChildPrefs(looks·parents), 그 밖은 member.looks.
  let looks: FamilyLooks;
  let patch: (p: Partial<FamilyLooks>) => void;
  if (m.role === "child") {
    looks = child.looks ?? {};
    // 아이 줄 칸(ChildLooks)만 넘긴다 — 만들기 화면도 같은 값(ChildPrefs.looks)을 쓴다.
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
        // 아이는 CHILD_MULTI_MAX 개까지 — 저장(prefs)이 그만큼만 남겨서, 넘게 고르면 다시 열 때 사라진다.
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
  const preview = looksLine(m, child);
  const picked = looksPicked(looks);
  // 모두 지우기 — 이 사람 칸만. 고른 칸을 모두 빈 값으로 넘긴다(다른 사람·다른 쪽 부모 값은 그대로).
  // 얼굴을 고정한 사람이면 고치기가 끝날 때 다시 그릴지 묻는다(page finishEdit — 다른 칩을 바꿀 때와 같다).
  const clearAll = () => {
    if (!window.confirm(`${stemOf(m)} 특징을 모두 지울까요?`)) return;
    patch(Object.fromEntries(Object.keys(looks).map((k) => [k, undefined])) as Partial<FamilyLooks>);
  };

  // ── 사진으로 할게요 ──
  const photo = photos[m.id];
  const usePhoto = Boolean(photo) || (photoMode[m.id] ?? Boolean(photoFirst));
  const busy = preparing === m.id;
  const error = photoError[m.id] ?? "";
  const setError = (id: string, msg: string) => setPhotoError((e) => ({ ...e, [id]: msg }));
  const chooseChips = () => {
    setPhotoMode((s) => ({ ...s, [m.id]: false }));
    setError(m.id, "");
    // 특징으로 그리기로 했다 — 고른 사진은 바로 뺀다(두 갈래가 섞여 그려지지 않게).
    if (photo) onPhoto(m.id, null);
  };
  const choosePhoto = () => setPhotoMode((s) => ({ ...s, [m.id]: true }));
  const openPicker = () => fileRef.current?.click();
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 같은 사진을 다시 골라도 바뀜이 오게 비운다.
    e.target.value = "";
    if (!file) return;
    const id = m.id;
    setPreparing(id);
    setError(id, "");
    const r = await preparePhoto(file);
    setPreparing((p) => (p === id ? null : p));
    if (!r.ok) {
      setError(id, r.message);
      return;
    }
    onPhoto(id, r.dataUrl);
    // 사진이면 칩은 없어도 된다 — 곧바로 다음으로. 그 사이 다른 사람으로 옮겼으면 넘어가지 않는다.
    if (shownId.current === id) onPhotoReady(id);
  };

  // 특징 고르기 — 지금까지의 칩 화면(메모 칸은 사진 올리기로 바꿔 뺐다).
  const chipsPart = (
    <>
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
          {/* 사진으로 고정한 사람은 칩을 쓰지 않는다(lib/family dropPhotoFixedLooks) — 여기서 고르면 특징으로 다시 그린다는 뜻 */}
          {isPhotoFixed(m)
            ? "사진으로 그린 얼굴이라 예전에 고른 특징은 비웠어요 — 여기서 고르면 사진 대신 이 특징으로 다시 그릴지 여쭤볼게요"
            : "얼굴을 고정했어요 — 여기를 바꾸면 다시 그릴지 여쭤볼게요"}
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

      {/* 그림에 보내는 문장 그대로라 길다 — 두 줄만 보이고 '전체 보기'로 편다(LooksPreview). */}
      <div className="mt-5">
        <LooksPreview
          key={m.id}
          text={preview ? `이렇게 그려요 — ${preview}` : "아무것도 안 고르시면 알아서 그려요."}
          action={
            picked ? (
              <button
                type="button"
                onClick={clearAll}
                className="min-h-11 shrink-0 rounded-full bg-white px-3.5 text-xs font-extrabold text-neutral-500 shadow-sm"
              >
                모두 지우기
              </button>
            ) : undefined
          }
        />
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
    </>
  );

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
          사진을 올려도 되고 특징만 골라도 돼요 · 사진은 저장하지 않아요
        </p>
        {notice && (
          <p className="mt-2 break-keep rounded-2xl bg-rose-50 px-3.5 py-2.5 text-[13px] font-bold text-rose-700" role="status">
            {notice}
          </p>
        )}

        {/* 그리는 방법 — 특징(칩) / 사진. 사람마다 따로 고른다. */}
        <div className="mt-3.5 grid grid-cols-2 gap-2" role="radiogroup" aria-label="그리는 방법">
          <WayButton on={!usePhoto} colors={colors} icon={<ChipsIcon size={22} />} title="특징 고르기" sub="칩으로 골라요" onClick={chooseChips} />
          <WayButton on={usePhoto} colors={colors} icon={<CameraIcon size={22} />} title="사진으로 할게요" sub="사진 한 장이면 돼요" onClick={choosePhoto} />
        </div>

        {usePhoto ? (
          <div className="mt-4 flex flex-col">
            {/* 파일 칸은 눈에 안 보이게 두고, 큰 칸(label)과 버튼이 연다. 폰에서는 사진첩·카메라 중에 고른다. */}
            <input
              ref={fileRef}
              id={fileId}
              type="file"
              accept="image/*"
              className="peer sr-only"
              // 사진이 있을 때는 큰 칸(label)이 없어진다 — 그때도 이름이 있게
              aria-label={`${stemOf(m)} 사진 고르기`}
              aria-describedby={tipsId}
              onChange={(e) => void onFile(e)}
            />
            {photo ? (
              <div className="flex flex-col items-center rounded-3xl bg-stone-50 p-3 shadow-[inset_0_0_0_1px_#f0ede8]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo} alt={`${stemOf(m)} 사진`} className="max-h-64 w-auto max-w-full rounded-2xl object-contain shadow" />
                <p className="mt-2 text-sm font-extrabold" style={{ color: colors.accentDark }}>
                  이 사진을 보고 그려요
                </p>
                <div className="mt-2.5 grid w-full grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={openPicker}
                    disabled={busy}
                    className="flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-white px-3 text-sm font-extrabold text-neutral-700 shadow-[0_0_0_1px_#e5e5e5] disabled:opacity-50"
                  >
                    <CameraIcon size={18} />
                    {busy ? "준비하는 중…" : "다른 사진"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onPhoto(m.id, null)}
                    className="flex min-h-11 items-center justify-center rounded-full bg-white px-3 text-sm font-extrabold text-neutral-500 shadow-[0_0_0_1px_#e5e5e5]"
                  >
                    사진 빼기
                  </button>
                </div>
              </div>
            ) : (
              <label
                htmlFor={fileId}
                aria-busy={busy}
                className={`flex min-h-[156px] w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-3xl border-2 border-dashed px-4 py-5 text-center transition peer-focus-visible:ring-4 ${
                  busy ? "pointer-events-none opacity-70" : ""
                }`}
                style={{ borderColor: colors.accent, background: colors.accentSoft, color: colors.accentDark }}
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow">
                  <CameraIcon size={30} />
                </span>
                <span className="text-[17px] font-extrabold">{busy ? "사진을 준비하고 있어요…" : `${stemOf(m)} 사진 고르기`}</span>
                <span className="text-xs font-bold text-neutral-600">사진첩에서 고르거나 바로 찍어요</span>
              </label>
            )}
            {error && (
              <p className="mt-2 break-keep text-center text-[13px] font-bold text-rose-600" role="alert">
                {error}
              </p>
            )}

            {/* 사진 팁 — 짧은 체크 목록 */}
            <ul id={tipsId} className="mt-3.5 grid grid-cols-1 gap-1.5 rounded-2xl bg-white px-3.5 py-3 shadow-[inset_0_0_0_1px_#f0ede8] min-[400px]:grid-cols-2">
              {PHOTO_TIPS.map(([mark, text]) => (
                <li key={text} className="flex items-center gap-2 break-keep text-[13px] font-semibold leading-snug text-neutral-700">
                  <span aria-hidden className="w-5 shrink-0 text-center text-base leading-none">
                    {mark}
                  </span>
                  {text}
                </li>
              ))}
            </ul>

            {/* 약속 — 코드도 이대로 한다(사진은 이 화면 메모리에만, 서버도 그리기에 한 번 쓰고 버린다) */}
            <p className="mt-3 flex items-start gap-2 break-keep rounded-2xl bg-emerald-50 px-3.5 py-2.5 text-[13px] font-bold leading-snug text-emerald-800">
              <span className="mt-px shrink-0">
                <LockIcon size={16} />
              </span>
              <span>
                {PHOTO_PROMISE}
                <span className="mt-0.5 block text-xs font-semibold text-emerald-700">
                  이 화면을 닫거나 얼굴을 고정하면 휴대폰에서도 사라져요
                </span>
              </span>
            </p>
          </div>
        ) : (
          chipsPart
        )}
      </div>

      <BottomBar>
        {usePhoto && !photo ? (
          // 사진 쪽인데 아직 사진이 없다 — 아래 큰 버튼도 사진 고르기(특징으로 가려면 위에서 '특징 고르기').
          <BigButton colors={colors} onClick={openPicker} disabled={busy}>
            <CameraIcon size={22} />
            {busy ? "사진을 준비하고 있어요…" : "사진 고르기"}
          </BigButton>
        ) : (
          <BigButton colors={colors} onClick={onNext}>
            {mode === "edit" ? "다 골랐어요" : last || !next ? "다 골랐어요 →" : `다음 — ${displayName(next)} →`}
          </BigButton>
        )}
      </BottomBar>
    </>
  );
}

/** 그리는 방법 한 칸 — '특징 고르기' / '사진으로 할게요'. 고른 쪽은 나라 색 테두리·바탕. */
function WayButton({
  on,
  colors,
  icon,
  title,
  sub,
  onClick,
}: {
  on: boolean;
  colors: Colors;
  icon: ReactNode;
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`flex min-h-[60px] items-center gap-2 rounded-2xl px-3 py-2 text-left transition ${on ? "shadow" : "bg-neutral-50 text-neutral-600"}`}
      style={on ? { background: colors.accentSoft, boxShadow: `inset 0 0 0 2px ${colors.accent}`, color: colors.accentDark } : undefined}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex min-w-0 flex-col">
        <span className="break-keep text-[15px] font-extrabold leading-tight">{title}</span>
        <span className="break-keep text-xs font-semibold text-neutral-500">{sub}</span>
      </span>
    </button>
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
      // 상한을 넘기면 가장 먼저 고른 것을 밀어낸다(예전 설정 아이 특징 칸과 같은 규칙).
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
