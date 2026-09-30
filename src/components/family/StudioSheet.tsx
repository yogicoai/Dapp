"use client";

/**
 * 가족 사진 꾸미기 — 가족 사진관 시트(사장님 2026-09-30, 가벼운 판 — lib/family-studio-catalog 머리말).
 *
 * 홈 액자의 '꾸미기'와 모아 보기의 '사진 꾸미기'가 연다. 미리보기(시트를 내려도 붙어 있다)와 세 칸:
 *  - 배경: 맨 앞 '동화 나라 (기본)'(지금 나라 배경) + 무리별(우리 집·우리 동네·나들이·계절·특별한 날·상상 나라)
 *    가족사진 전용 배경 작은 그림. 누르면 바로 미리보기에 깔린다. 예전(숨긴) 배경을 고른 채 열면 그 칸이 '동화 나라'
 *    옆에 선다(목록엔 없어도 체크가 보이고, 다른 배경을 눌러 봐도 닫기 전엔 돌아갈 수 있게).
 *  - 스티커: 무리별(축하·사랑·날씨·계절·동물·소품, 맨 뒤 예전 '동화 아이콘'). 누르면 비어 있는 가장자리 자리(얼굴을
 *    피해)에 붙고 골라진다.
 *  - 글자: 정해 둔 문구 12개(주아 글꼴로 앱이 그린다 — 한글이 늘 바르다). 누르면 가운데 위·아래(머리 위·다리 쪽)에
 *    붙는다. 마음대로 적는 칸은 없다.
 *  그림·글자 합쳐 STUDIO_MAX(8)개까지 — 스티커·글자 칸 위에 'n/8'과 '모두 떼기'(바로 되돌릴 수 있다).
 *  고른 스티커는 미리보기 아래 줄에서 **크기 밀대**(좌우로 — 예전 보통의 0.35~2.2배, 글자는 읽히게 0.6배부터,
 *  사장님 "좀더 디테일하게")와
 *  떼기. 미리보기에서 끌어 옮기고, 두 손가락으로 벌리고 오므려 크기를 바꾼다(StudioStickers StickerEditor).
 * 화면 모양(lib/family-studio studioSheetFit — 창 크기가 바뀌면 다시 잰다):
 *  - 세로(폰·태블릿): 제목 아래 미리보기·크기 줄·탭을 위에 붙이고 그 아래 고르기. 미리보기 높이는 홈 액자와 같은
 *    200·240 이되, 낮은 화면(아이폰 SE 사파리 등)에서는 고르기가 두 줄은 보이게 줄인다(140 까지).
 *  - 가로로 눕힌 폰(높이 560 미만 — 앱은 가로 고정이다, manifest): 붙여 두면 고르기가 아예 안 보여서 두 칸으로 —
 *    왼쪽에 미리보기·크기 줄(붙어 있음), 오른쪽에 탭·고르기·'다 됐어요'. 미리보기는 홈 액자와 같은 비율(2.25:1)로 줄인다.
 * 취소는 없다 — 바꿀 때마다 저장한다(부르는 쪽 onChange → saveChild: 이 기기에 바로, 서버는 800ms 뒤).
 * 바꿀 때마다 꾸민 때(at)를 찍는다 — 다른 기기 값과 합칠 때 나중에 꾸민 쪽이 이긴다(lib/family-studio newerStudio).
 * 시트가 닫히거나 앱을 내리면(pagehide·화면 숨김) 기다리던 서버 저장을 바로 올린다(flushChildSave).
 * 시트 안 모습은 부르는 쪽 값(studio)을 따른다 — 열어 둔 사이 다른 기기에서 온 더 새 값이 오면 그것 위에 고친다.
 * 끌기·두 손가락은 손을 뗄 때 한 번 저장, 밀대는 움직일 때마다(한 칸 0.05 — 같은 값이면 저장 안 함).
 * '다 됐어요'·ESC·뒤 배경 누르기는 모두 그냥 닫기. 돌리기·겹침 순서는 없다(사장님과 가볍게 하기로 함).
 * 옷 갈아입기(사장님 2026-09-30 — lib/family-outfit): 부르는 쪽이 onOutfit 을 주면(가족 화면·홈 — 모든 회원) 탭 위에
 * '옷 갈아입기 · 지금 옷' 줄이 붙고, 누르면 옷 고르기(OutfitPicker)로 간다. 세로 화면에서는 그 줄 높이만큼 미리보기를 줄여
 * 고르기 몫을 지킨다(studioSheetFit stackExtra).
 */

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import type { FamilyMember } from "@/lib/family";
import {
  EMPTY_STUDIO,
  SCALE_MAX,
  SCALE_STEP,
  STUDIO_MAX,
  TEXT_CELL_MIN,
  newerStudio,
  scaleMinOf,
  sidePreviewWidth,
  stampStudio,
  studioBackground,
  studioSheetFit,
  studioGroupsInUse,
  studioReducer,
  studioSticker,
  type FamilyStudio,
  type StudioAction,
  type StudioSticker,
} from "@/lib/family-studio";
import {
  STICKER_GROUPS,
  STUDIO_STICKERS,
  STUDIO_TEXT_STICKERS,
  TEXT_STICKER_FONT,
  studioThumb,
  type AnyStickerDef,
} from "@/lib/family-studio-catalog";
import { OUTFIT_ORIGINAL_PREVIEW, outfitTheme } from "@/lib/family-outfit";
import { flushChildSave, type ChildPrefs } from "@/lib/prefs";
import type { Colors } from "./family-ui";
import { FamilyGroupPhoto } from "./FamilyGroupPhoto";
import { CheckIcon } from "./icons";
import { Sheet } from "./Sheet";
import { StickerEditor, TextStickerFace } from "./StudioStickers";
import { BigButton } from "./ui";

/** '옷 갈아입기' 줄 높이(위 여백 8 + 줄 44) — 세로 화면에서 붙어 있는 칸에 더해진다 */
const OUTFIT_ROW_H = 52;

/* 화면 모양(세로 · 가로로 눕힌 폰 두 칸) — 셈은 lib/family-studio studioSheetFit. useSyncExternalStore 가 견줄 수 있게
 * 글자로("stack:200" · "side:150" — 모양:미리보기 높이). 창 크기가 바뀌면(돌리기·주소창) 다시 잰다. */
function fitNow(): string {
  const f = studioSheetFit(window.innerWidth, window.innerHeight);
  return `${f.side ? "side" : "stack"}:${f.height}`;
}
/** '옷 갈아입기' 줄이 붙을 때 */
function fitNowWithOutfit(): string {
  const f = studioSheetFit(window.innerWidth, window.innerHeight, OUTFIT_ROW_H);
  return `${f.side ? "side" : "stack"}:${f.height}`;
}
function subscribeFit(cb: () => void): () => void {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
}

/** 스티커 칸의 무리(빈 무리 빼고) — 목록이 고정이라 한 번만 나눈다 */
const STICKER_SECTIONS = STICKER_GROUPS.map((g) => ({ ...g, items: STUDIO_STICKERS.filter((s) => s.group === g.id) })).filter(
  (g) => g.items.length > 0,
);

type Tab = "bg" | "sticker" | "text";

export function StudioSheet({
  colors,
  members,
  childAge,
  parents,
  background,
  studio,
  onChange,
  onClose,
  onOutfit,
}: {
  colors: Colors;
  /** 단체 사진에 설 사람(homeMembers) */
  members: FamilyMember[];
  childAge: number | null;
  parents?: ChildPrefs["parents"];
  /** 나라 배경(theme.background) — '동화 나라 (기본)' */
  background: string;
  /** 저장된 사진관(없으면 기본) — 부르는 쪽이 onChange 값을 바로 들고 있다 */
  studio?: FamilyStudio | null;
  /** 바뀔 때마다(꾸민 때 at 이 찍힌 값) — 부르는 쪽이 saveChild 로 저장한다 */
  onChange: (s: FamilyStudio) => void;
  onClose: () => void;
  /** 옷 갈아입기로 가기 — 주면 탭 위에 '옷 갈아입기 · 지금 옷' 줄이 붙는다 */
  onOutfit?: () => void;
}) {
  const { accent, accentDark } = colors;
  const fit = useSyncExternalStore(subscribeFit, onOutfit ? fitNowWithOutfit : fitNow, () => "stack:200");
  const side = fit.startsWith("side:");
  const height = Number(fit.slice(fit.indexOf(":") + 1)) || 200;
  const top = useRef<HTMLDivElement>(null);

  // 이 시트에서 마지막으로 바꾼 값 — 부르는 쪽 값(studio)과 견줘 더 새것을 보인다. 부르는 쪽은 onChange 값을 바로
  // 들고 있어 보통 둘은 같고, 열어 둔 사이 다른 기기에서 더 새 값이 오면(홈의 늦은 계정 값·가족 화면의 15초 새로 읽기)
  // 그 값이 보이고 다음 고치기는 그 위에 한다 — 옛 초안으로 다른 기기의 꾸미기를 덮지 않게.
  const [mine, setMine] = useState<FamilyStudio | null>(null);
  const draft = newerStudio(studio, mine) ?? EMPTY_STUDIO;
  const [tab, setTab] = useState<Tab>("bg");
  const [picked, setPicked] = useState<number | null>(null);
  /** '모두 떼기' 바로 앞 스티커 — 되돌리기(새 스티커를 붙이면 사라진다) */
  const [undo, setUndo] = useState<StudioSticker[] | null>(null);
  const selected = picked !== null && picked < draft.stickers.length ? picked : null;
  const sel = selected !== null ? draft.stickers[selected] : null;
  const selDef = sel ? studioSticker(sel.icon) : undefined;
  const full = draft.stickers.length >= STUDIO_MAX;
  const canUndo = undo !== null && draft.stickers.length === 0;
  // 예전(숨긴) 배경을 고른 채 열었다 — 고르기 목록엔 없으니 맨 앞 줄에 그 칸을 둔다(체크가 보이고, 다른 배경을 눌러
  // 봐도 이 시트를 닫기 전엔 다시 고를 수 있게). 한 번 본 것은 기억한다(렌더 중 상태 맞추기 — 값이 다를 때만).
  const hiddenNow = draft.bg && studioBackground(draft.bg)?.hidden ? draft.bg : null;
  const [oldBg, setOldBg] = useState<string | null>(null);
  if (hiddenNow && hiddenNow !== oldBg) setOldBg(hiddenNow);
  const oldBgDef = studioBackground(oldBg);

  // 닫힐 때(다 됐어요·ESC·뒤 배경 — 모두 이 시트가 내려간다)와 앱을 내릴 때 기다리던 서버 저장을 바로 올린다.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") flushChildSave();
    };
    window.addEventListener("pagehide", flushChildSave);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("pagehide", flushChildSave);
      document.removeEventListener("visibilitychange", onHidden);
      flushChildSave();
    };
  }, []);

  /** 바꾸기 — 바뀐 게 없으면(같은 값) 저장하지 않는다. 바뀌면 꾸민 때를 찍어 저장. */
  const apply = (a: StudioAction): FamilyStudio => {
    const next = studioReducer(draft, a);
    if (next === draft) return draft;
    const stamped = stampStudio(next);
    setMine(stamped);
    onChange(stamped);
    return stamped;
  };

  /** 붙이고 바로 고른다 — 크기 밀대·떼기 줄이 곧장 뜬다 */
  const addSticker = (icon: string) => {
    const next = apply({ type: "add", icon });
    if (next !== draft) {
      setPicked(next.stickers.length - 1);
      setUndo(null);
    }
  };
  const removeSelected = () => {
    if (selected === null) return;
    apply({ type: "remove", index: selected });
    setPicked(null);
  };
  const clearAll = () => {
    setUndo(draft.stickers);
    apply({ type: "clearStickers" });
    setPicked(null);
  };
  const undoClear = () => {
    if (undo) apply({ type: "stickers", stickers: undo });
    setUndo(null);
  };

  /** 탭 바꾸기 — 시트를 맨 위로(긴 배경 목록 끝에서 스티커로 가면 스티커 첫 줄이 붙은 미리보기 밑에 숨지 않게) */
  const pickTab = (id: Tab) => {
    if (id === tab) return;
    setTab(id);
    // 이 시트의 맨 바깥 칸은 Sheet 패널(스크롤 되는 칸)의 바로 안쪽이다
    top.current?.parentElement?.scrollTo({ top: 0 });
  };

  const groups = studioGroupsInUse();
  const tabBtn = (id: Tab, label: string) => {
    const on = tab === id;
    return (
      <button
        type="button"
        role="tab"
        aria-selected={on}
        onClick={() => pickTab(id)}
        className="flex h-11 min-w-0 flex-1 items-center justify-center rounded-full text-[15px] font-extrabold transition"
        style={on ? { background: accent, color: "#fff" } : { background: "#f5f5f4", color: "#525252" }}
      >
        {label}
      </button>
    );
  };

  /** 배경 칸 하나 — 고른 칸은 나라 색 테두리 + 체크 */
  const tile = (key: string, label: string, src: string, on: boolean, onPick: () => void, bottom = false, moving = false) => (
    <button
      key={key}
      type="button"
      aria-pressed={on}
      onClick={onPick}
      className="flex min-w-0 flex-col items-center gap-1 rounded-2xl p-1 text-center transition hover:bg-neutral-50"
    >
      <span
        className="relative block aspect-video w-full overflow-hidden rounded-xl bg-neutral-100"
        style={{ boxShadow: on ? `0 0 0 3px ${accent}` : "inset 0 0 0 1px rgba(0,0,0,.06)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          className={`absolute inset-0 h-full w-full object-cover ${bottom ? "object-bottom" : ""}`}
        />
        {moving && (
          <span className="absolute bottom-1 left-1 rounded-full bg-black/45 px-1.5 py-px text-[10px] font-bold leading-4 text-white">
            움직여요
          </span>
        )}
        {on && (
          <span
            aria-hidden
            className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full shadow"
            style={{ background: accent }}
          >
            <CheckIcon size={12} />
          </span>
        )}
      </span>
      <span
        className="break-keep text-[12px] font-bold leading-tight"
        style={{ color: on ? accentDark : "#525252" }}
      >
        {label}
      </span>
    </button>
  );

  const title = <h2 className="w-full px-1 pt-2 text-[19px] font-extrabold text-neutral-800">가족 사진 꾸미기</h2>;

  const photo = (
    <div
      className="relative rounded-3xl bg-white p-[5px]"
      style={{ boxShadow: `0 0 0 2px ${accent}, 0 10px 20px -8px rgba(60,40,25,.3)` }}
    >
      <FamilyGroupPhoto
        members={members}
        childAge={childAge}
        parents={parents}
        height={height}
        background={background}
        className="rounded-[20px]"
        studio={draft}
        stickerLayer={
          <StickerEditor
            stickers={draft.stickers}
            height={height}
            selected={selected}
            accent={accent}
            onSelect={setPicked}
            dispatch={(a) => void apply(a)}
          />
        }
      />
    </div>
  );

  /* 고른 스티커의 크기 밀대·떼기, 안 골랐으면 도움말 — 높이를 늘 같게(미리보기가 튀지 않게).
   * 밀대 왼쪽 끝은 갈래마다 — 글자는 더 작으면 안 읽혀서 TEXT_SCALE_MIN(lib/family-studio scaleMinOf). */
  const minScale = scaleMinOf(selDef?.kind ?? "image");
  const fill = sel ? ((Math.min(SCALE_MAX, Math.max(minScale, sel.scale)) - minScale) / (SCALE_MAX - minScale)) * 100 : 0;
  const sizeRow = (
    <div className="mt-2 flex min-h-11 items-center justify-center gap-2">
      {sel && selDef && selected !== null ? (
        <>
          <label className="flex min-w-0 flex-1 items-center gap-1.5 pl-1">
            <span className="sr-only">{`${selDef.label} 스티커 크기`}</span>
            <SizeGlyph def={selDef} px={16} />
            <input
              type="range"
              min={minScale}
              max={SCALE_MAX}
              step={SCALE_STEP}
              value={sel.scale}
              aria-valuetext={`보통 크기의 ${Math.round(sel.scale * 100)}%`}
              onChange={(e) => apply({ type: "scale", index: selected, scale: Number(e.target.value) })}
              className="studio-range min-w-0 flex-1"
              style={{ "--range-accent": accent, "--range-fill": `${fill.toFixed(1)}%` } as CSSProperties}
            />
            <SizeGlyph def={selDef} px={28} />
          </label>
          <button
            type="button"
            onClick={removeSelected}
            className="flex h-10 shrink-0 items-center justify-center gap-1 rounded-full bg-rose-50 px-3.5 text-sm font-extrabold text-rose-600 transition hover:bg-rose-100"
          >
            <span aria-hidden>✕</span> 떼기
          </button>
        </>
      ) : (
        <p className="break-keep px-2 text-center text-xs font-semibold text-neutral-500">
          {draft.stickers.length > 0
            ? "스티커를 끌어서 옮겨요 · 누르면 크기를 바꾸거나 뗄 수 있어요 · 두 손가락으로 벌려도 커져요"
            : "배경을 고르고 스티커·글자를 붙여 꾸며요"}
        </p>
      )}
    </div>
  );

  const tabs = (
    <div role="tablist" aria-label="꾸미기 종류" className="flex w-full gap-2">
      {tabBtn("bg", "배경")}
      {tabBtn("sticker", "스티커")}
      {tabBtn("text", "글자")}
    </div>
  );

  /* 옷 갈아입기 줄 — 지금 입은 테마(없으면 원래 옷)와 그 미리보기, 누르면 옷 고르기로 */
  const wornTheme = outfitTheme(draft.outfit);
  const outfitRow = onOutfit ? (
    <button
      type="button"
      onClick={onOutfit}
      className="mt-2 flex h-11 w-full items-center gap-2.5 rounded-2xl bg-stone-50 pl-1.5 pr-3 text-left shadow-[inset_0_0_0_1px_#f0ede8] transition hover:bg-stone-100"
    >
      <span className="relative h-8 w-14 shrink-0 overflow-hidden rounded-lg bg-neutral-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={wornTheme?.preview ?? OUTFIT_ORIGINAL_PREVIEW}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
      </span>
      <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold text-neutral-800">
        옷 갈아입기{" "}
        <span className="font-bold" style={{ color: accentDark }}>
          · {wornTheme?.label ?? "원래 옷"}
        </span>
      </span>
      <span aria-hidden className="shrink-0 text-xl font-extrabold leading-none text-neutral-400">
        ›
      </span>
    </button>
  ) : null;

  /* 스티커·글자 칸 위 — 몇 개 붙였나(그림·글자 합쳐) · 모두 떼기. 모두 뗀 바로 뒤엔 되돌리기(아이가 잘못 눌러도). */
  const countRow = canUndo ? (
    <div
      role="status"
      className="mx-auto flex min-h-11 w-fit items-center gap-2 rounded-full bg-neutral-100 py-1 pl-4 pr-1 text-sm font-bold text-neutral-600"
    >
      스티커를 모두 뗐어요
      <button
        type="button"
        onClick={undoClear}
        className="flex h-9 items-center rounded-full bg-white px-3.5 text-sm font-extrabold shadow-sm transition hover:bg-neutral-50"
        style={{ color: accentDark }}
      >
        되돌리기
      </button>
    </div>
  ) : (
    <div className="flex min-h-11 items-center justify-between gap-2 px-1">
      <p className="break-keep text-xs font-extrabold text-neutral-500" aria-live="polite">
        {full
          ? `${STUDIO_MAX}개를 다 붙였어요 · 떼고 다시 붙여요`
          : `그림·글자 합쳐 ${STUDIO_MAX}개까지 · ${draft.stickers.length}/${STUDIO_MAX}`}
      </p>
      {draft.stickers.length > 0 && (
        <button
          type="button"
          onClick={clearAll}
          className="flex h-11 shrink-0 items-center justify-center rounded-full px-2 text-xs font-extrabold text-neutral-500 underline-offset-4 transition hover:text-neutral-700 hover:underline"
        >
          모두 떼기
        </button>
      )}
    </div>
  );

  // 두 칸일 때는 오른쪽 칸이 좁아(300px 안팎) 배경을 세 줄로만
  const bgCols = side ? "grid-cols-3" : "grid-cols-3 sm:grid-cols-4";
  const picker =
    tab === "bg" ? (
      <div className="w-full pt-2">
        <div className={`grid gap-1.5 ${bgCols}`}>
          {tile("default", "동화 나라 (기본)", background, draft.bg === null, () => apply({ type: "bg", slug: null }), true)}
          {oldBgDef &&
            tile(`old-${oldBgDef.slug}`, `${oldBgDef.label} · 예전 배경`, studioThumb(oldBgDef.slug), draft.bg === oldBgDef.slug, () =>
              apply({ type: "bg", slug: oldBgDef.slug }),
            )}
        </div>
        {groups.map((g) => (
          <section key={g.id} className="mt-3">
            <h3 className="px-1 text-[13px] font-extrabold text-neutral-500">{g.label}</h3>
            <div className={`mt-1 grid gap-1.5 ${bgCols}`}>
              {g.items.map((b) =>
                tile(b.slug, b.label, studioThumb(b.slug), draft.bg === b.slug, () => apply({ type: "bg", slug: b.slug }), false, !!b.video),
              )}
            </div>
          </section>
        ))}
      </div>
    ) : tab === "sticker" ? (
      <div className="w-full pt-1">
        {countRow}
        {STICKER_SECTIONS.map((g) => (
          <section key={g.id} className="mt-2">
            <h3 className="px-1 text-[13px] font-extrabold text-neutral-500">{g.label}</h3>
            <div className="mt-1 grid grid-cols-6 gap-1">
              {g.items.map((s) => (
                <button
                  key={s.icon}
                  type="button"
                  disabled={full}
                  aria-label={`${s.label} 스티커 붙이기`}
                  onClick={() => addSticker(s.icon)}
                  className="flex aspect-square min-h-11 items-center justify-center rounded-2xl bg-neutral-50 p-1 transition hover:bg-neutral-100 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.src} alt="" loading="lazy" draggable={false} className="h-full max-h-12 w-full object-contain" />
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    ) : (
      <div className="w-full pt-1">
        {countRow}
        {/* 칸 폭은 TEXT_CELL_MIN(116px) 이상 — 가장 긴 문구('메리 크리스마스' 108px)가 한 줄에 들게. 가로로 눕힌 폰의
            오른쪽 칸(245~304px)에서도 두 칸씩, 넓으면 더. */}
        <div
          className="mt-1 grid gap-1.5"
          style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${TEXT_CELL_MIN}px, 1fr))` }}
        >
          {STUDIO_TEXT_STICKERS.map((t) => (
            <button
              key={t.icon}
              type="button"
              disabled={full}
              aria-label={`'${t.text}' 글자 스티커 붙이기`}
              onClick={() => addSticker(t.icon)}
              className="flex min-h-[54px] items-center justify-center rounded-2xl bg-neutral-50 px-0.5 py-1.5 transition hover:bg-neutral-100 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
            >
              <TextStickerFace def={t} fontPx={17} />
            </button>
          ))}
        </div>
      </div>
    );

  const done = (
    <div className="mt-4 w-full">
      <BigButton colors={colors} onClick={onClose}>
        다 됐어요
      </BigButton>
    </div>
  );

  return (
    <Sheet onClose={onClose} label="가족 사진 꾸미기" wide={side}>
      <div ref={top} className="w-full">
        {side ? (
          /* 가로로 눕힌 폰 — 왼쪽 미리보기(붙어 있음) · 오른쪽 고르기 */
          <div className="flex w-full items-start gap-4">
            <div
              className="sticky top-0 z-10 shrink-0 bg-white pb-2 pt-2"
              style={{ width: sidePreviewWidth(height) }}
            >
              {photo}
              {sizeRow}
            </div>
            <div className="min-w-0 flex-1">
              {title}
              {outfitRow}
              <div className="sticky top-0 z-10 bg-white pb-1 pt-2">{tabs}</div>
              {picker}
              {done}
            </div>
          </div>
        ) : (
          <>
            {/* 제목은 내리면 올라가고, 미리보기·크기 줄·(옷 갈아입기 줄)·탭은 위에 붙어 있다(고르면서 바로 본다) */}
            {title}
            <div className="sticky top-0 z-10 w-full bg-white pb-2 pt-2">
              {photo}
              {sizeRow}
              {outfitRow}
              <div className="mt-1">{tabs}</div>
            </div>
            {picker}
            {done}
          </>
        )}
      </div>
    </Sheet>
  );
}

/** 크기 밀대 양끝의 작은·큰 모습 — 고른 스티커 그림(글자 스티커면 '가') */
function SizeGlyph({ def, px }: { def: AnyStickerDef; px: number }) {
  if (def.kind === "text") {
    return (
      <span
        aria-hidden
        className="flex shrink-0 items-center justify-center font-normal leading-none"
        style={{ width: 28, fontFamily: TEXT_STICKER_FONT, fontSize: px * 0.8, color: def.fill }}
      >
        가
      </span>
    );
  }
  return (
    <span aria-hidden className="flex w-7 shrink-0 items-center justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={def.src} alt="" draggable={false} className="block object-contain" style={{ width: px, height: px }} />
    </span>
  );
}
