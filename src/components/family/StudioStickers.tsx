"use client";

/**
 * 가족 사진관 스티커 — 단체 사진 위에 붙인 스티커(보기)와 꾸미기 시트의 끌어 옮기기·크기 바꾸기(고치기).
 *
 * 자리·크기 셈은 lib/family-studio(x·y = 스티커 가운데, 사진 상자의 0~1 비율 · 그림 한 변 = stickerPx · 글자 크기 =
 * textPx, 둘 다 사진 높이 × 배율). 두 층 모두 FamilyGroupPhoto 의 isolate 상자 안, 사람 뒤가 아니라 앞(z 100)에 그린다 —
 * 사람 그림의 z(1..n)보다 위, 홈 명패(z-2)·인사 말풍선(z-3)은 사진 상자 밖이라 여전히 사진 전체보다 위다.
 *
 *  - 그림 스티커: 투명 webp 한 장(lib/family-studio-catalog).
 *  - 글자 스티커(TextStickerFace): 앱이 글꼴로 그린다 — 주아 + 파스텔 글자색 + 두꺼운 흰 테두리(paint-order 로 테두리를
 *    글자 **밑에** 칠해 글자가 가늘어지지 않는다) + 그림 스티커와 같은 옅은 그림자. 한글이 늘 바르다.
 *  - StickerLayer: 보기만. 누름을 통과시킨다(pointer-events-none) — 홈에서 사람을 누르면 폴짝·인사가 그대로 된다.
 *  - StickerEditor: 꾸미기 시트 미리보기에서만. 스티커를 누르면 고르고(크기 밀대·떼기 줄이 뜬다), 끌면 옮긴다
 *    (pointer 이벤트 — 손가락·마우스 같이). 끄는 동안은 이 층 안에서만 자리를 바꾸고 손을 뗄 때 한 번 저장한다.
 *    **두 손가락**(사장님 2026-09-30 "좀더 디테일하게"): 스티커를 고른 채 사진 어디든 두 손가락을 대고 벌리면 커지고
 *    오므리면 작아진다(lib/family-studio pinchScale — 처음 배율 × 거리 비). 이것도 손을 뗄 때 한 번 저장. 고른
 *    스티커가 있는 동안은 이 층이 브라우저 확대·스크롤을 받지 않는다(touch-action none) — 두 손가락이 화면 확대로
 *    새지 않게. 빈 곳을 톡 누르면(떼었을 때 그대로면) 고른 것이 풀린다.
 *    키보드: 화살표로 옮기기, Delete·Backspace 로 떼기, -·+ 로 크기(SCALE_KEY_STEP 씩).
 */

import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { TEXT_STICKER_FONT, type TextStickerDef } from "@/lib/family-studio-catalog";
import {
  SCALE_KEY_STEP,
  clampPos,
  pinchScale,
  pointerDistance,
  stickerPx,
  studioSticker,
  textPx,
  type StickerKind,
  type StudioAction,
  type StudioSticker,
} from "@/lib/family-studio";

/** 스티커 그림자 — 수채 배경 위에 '붙인' 느낌 */
const STICKER_SHADOW = "drop-shadow(0 2px 2px rgba(60,40,25,.22))";
/** 스티커 층 — 사람 그림(z 1..n) 위 */
const LAYER_Z = 100;
/** 이만큼(px) 움직여야 끌기로 본다 — 누르기만 한 손 떨림은 고르기 */
const DRAG_SLOP = 4;
/** 화살표 한 번에 옮기는 거리(비율) */
const NUDGE = 0.03;
/** 누름 영역 최소(px) — 작은 스티커도 손가락으로 잡히게 */
const HIT_MIN = 44;
/** 두 손가락이 이보다 가까우면(px) 크기 바꾸기를 아직 시작하지 않는다 — 거의 한 점에서 벌리면 배율이 튄다 */
const PINCH_MIN_DIST = 12;
/** 글자 테두리 두께(글자 크기 대비) — paint-order 로 밑에 칠해 보이는 두께는 이것의 절반 */
const TEXT_STROKE = 0.34;

const place = (s: { x: number; y: number }): CSSProperties => ({
  left: `${s.x * 100}%`,
  top: `${s.y * 100}%`,
  transform: "translate(-50%, -50%)",
});

/**
 * 글자 스티커 한 장 — 글꼴로 그린 문구. 테두리는 글자 크기에 맞춰 두껍게, 둥근 이음(지원하는 브라우저에서).
 * 테두리 절반이 글자 밖으로 나가서 그만큼 안쪽 여백을 둔다(고른 표시·누름 영역이 테두리까지 감싸게).
 */
export function TextStickerFace({ def, fontPx, style }: { def: TextStickerDef; fontPx: number; style?: CSSProperties }) {
  const stroke = Math.max(2, Math.round(fontPx * TEXT_STROKE * 2) / 2);
  return (
    <span
      className="block w-max select-none whitespace-nowrap"
      style={{
        fontFamily: TEXT_STICKER_FONT,
        fontSize: fontPx,
        lineHeight: 1.15,
        letterSpacing: "0.01em",
        color: def.fill,
        WebkitTextStroke: `${stroke}px #fff`,
        paintOrder: "stroke fill",
        strokeLinejoin: "round",
        padding: `${stroke / 2}px ${stroke / 2 + 1}px`,
        filter: STICKER_SHADOW,
        ...style,
      }}
    >
      {def.text}
    </span>
  );
}

/** 붙인 스티커(보기만) */
export function StickerLayer({ stickers, height }: { stickers: readonly StudioSticker[]; height: number }) {
  if (stickers.length === 0) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0" style={{ zIndex: LAYER_Z }}>
      {stickers.map((s, i) => {
        const def = studioSticker(s.icon);
        if (!def) return null;
        if (def.kind === "text") {
          return (
            <span key={`${i}-${s.icon}`} className="absolute block" style={place(s)}>
              <TextStickerFace def={def} fontPx={textPx(s.scale, height)} />
            </span>
          );
        }
        const px = stickerPx(s.scale, height);
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${i}-${s.icon}`}
            src={def.src}
            alt=""
            draggable={false}
            className="absolute block max-w-none select-none"
            style={{ ...place(s), width: px, height: px, filter: STICKER_SHADOW }}
          />
        );
      })}
    </div>
  );
}

type Drag = { index: number; pointer: number; startX: number; startY: number; fromX: number; fromY: number; moved: boolean };
/** 두 손가락 크기 바꾸기 — 처음 배율(from)·처음 거리(dist), 지금 배율(scale — 손을 뗄 때 저장), 갈래(글자면 아래 끝이 다르다) */
type Pinch = { index: number; from: number; dist: number; scale: number; kind: StickerKind };

/**
 * 꾸미기 시트의 스티커 층 — 끌어 옮기기·두 손가락 크기·고르기. 값을 바꾸는 일은 모두 dispatch(lib/family-studio
 * studioReducer 동작)로. selected 는 부르는 쪽이 들고 있다(시트 아래 크기 밀대·떼기 줄과 함께 쓴다).
 */
export function StickerEditor({
  stickers,
  height,
  selected,
  accent,
  onSelect,
  dispatch,
}: {
  stickers: readonly StudioSticker[];
  /** 사진 높이(px) — 스티커 크기 셈 */
  height: number;
  selected: number | null;
  /** 고른 스티커 테두리 색(나라 강조색) */
  accent: string;
  onSelect: (index: number | null) => void;
  dispatch: (a: StudioAction) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  // 끄는 동안의 자리 — 저장은 손을 뗄 때 한 번
  const [live, setLive] = useState<{ index: number; x: number; y: number } | null>(null);
  /** 이 층에 닿아 있는 손가락(포인터) — 둘이면 두 손가락 크기 바꾸기 */
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<Pinch | null>(null);
  // 두 손가락으로 바꾸는 동안의 배율 — 저장은 손을 뗄 때 한 번
  const [pinchLive, setPinchLive] = useState<{ index: number; scale: number } | null>(null);
  /** 빈 곳을 한 손가락으로 누름 — 떼었을 때 그대로면(끌지도·두 손가락도 아니면) 고른 것을 푼다 */
  const emptyTap = useRef<{ id: number; x: number; y: number } | null>(null);
  /** 방금 두 손가락으로 크기를 바꿨다 — 뒤따라 오는 click 이 다른 스티커를 고르지 않게(다음 누름에서 풀린다) */
  const pinched = useRef(false);

  /** 새 누름의 첫 손가락 — 지난 손짓에서 남은 것(떼기를 못 받은 손가락)을 비운다 */
  const freshGesture = (e: PointerEvent<HTMLElement>) => {
    if (!e.isPrimary) return;
    pts.current.clear();
    pinch.current = null;
    pinched.current = false;
  };

  /** 끈 거리 → 새 자리(비율). 아직 끌기 전(DRAG_SLOP 안)이면 null. */
  const posFrom = (e: PointerEvent<HTMLElement>): { x: number; y: number } | null => {
    const d = drag.current;
    const b = box.current;
    if (!d || !b || d.pointer !== e.pointerId) return null;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_SLOP) return null;
    d.moved = true;
    const r = b.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    return { x: clampPos(d.fromX + dx / r.width), y: clampPos(d.fromY + dy / r.height) };
  };

  /* ── 스티커 하나(버튼): 고르기·끌기. 두 번째 손가락이면 끌기 대신 층(아래)이 크기 바꾸기를 맡는다. ── */
  const onDown = (i: number) => (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    const s = stickers[i];
    if (!s) return;
    freshGesture(e);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (pts.current.size > 0) return; // 이미 한 손가락이 닿아 있다 — 두 손가락 크기 바꾸기(층이 받는다)
    drag.current = { index: i, pointer: e.pointerId, startX: e.clientX, startY: e.clientY, fromX: s.x, fromY: s.y, moved: false };
    onSelect(i);
  };
  const onMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    const p = posFrom(e);
    if (!d || !p) return;
    setLive({ index: d.index, ...p });
  };
  const onUp = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    const p = d.moved ? posFrom(e) : null;
    drag.current = null;
    setLive(null);
    if (p) dispatch({ type: "move", index: d.index, x: p.x, y: p.y });
  };
  /** 끌기가 끊겼다(전화가 옴·스크롤로 넘어감) — 저장하지 않고 제자리 */
  const onCancel = () => {
    drag.current = null;
    setLive(null);
  };

  /* ── 층 전체: 손가락 세기·두 손가락 크기·빈 곳 누름(스티커 버튼의 누름도 여기로 올라온다) ── */
  const startPinch = () => {
    const index = drag.current?.index ?? selected;
    if (index === null || !stickers[index]) return;
    const [a, b] = [...pts.current.values()];
    const dist = pointerDistance(a, b);
    if (dist < PINCH_MIN_DIST) return;
    const from = stickers[index].scale;
    const kind: StickerKind = studioSticker(stickers[index].icon)?.kind === "text" ? "text" : "image";
    pinch.current = { index, from, dist, scale: from, kind };
    // 끌던 것은 제자리에 둔다 — 두 손가락은 크기만
    drag.current = null;
    setLive(null);
    emptyTap.current = null;
    pinched.current = true;
    if (index !== selected) onSelect(index);
  };
  const layerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    freshGesture(e);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (e.target === e.currentTarget) {
      // 빈 곳(사진) — 손가락이 층 밖으로 나가도 떼기를 받게
      e.currentTarget.setPointerCapture?.(e.pointerId);
      emptyTap.current = pts.current.size === 1 ? { id: e.pointerId, x: e.clientX, y: e.clientY } : null;
    }
    if (pts.current.size >= 2) {
      emptyTap.current = null;
      if (!pinch.current) startPinch();
    }
  };
  const layerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const t = emptyTap.current;
    if (t && t.id === e.pointerId && Math.hypot(e.clientX - t.x, e.clientY - t.y) > DRAG_SLOP * 2) emptyTap.current = null;
    if (pts.current.size < 2) return;
    const p = pinch.current;
    if (!p) {
      startPinch();
      return;
    }
    const [a, b] = [...pts.current.values()];
    const scale = pinchScale(p.from, p.dist, pointerDistance(a, b), p.kind);
    if (scale === p.scale) return;
    p.scale = scale;
    setPinchLive({ index: p.index, scale });
  };
  /** 손가락을 뗌(save) 또는 끊김(버림) — 두 손가락이 하나만 남으면 크기 바꾸기를 끝낸다 */
  const layerEnd = (e: PointerEvent<HTMLDivElement>, save: boolean) => {
    if (!pts.current.delete(e.pointerId)) return;
    const p = pinch.current;
    if (p && pts.current.size < 2) {
      pinch.current = null;
      setPinchLive(null);
      if (save && stickers[p.index] && p.scale !== stickers[p.index].scale) {
        dispatch({ type: "scale", index: p.index, scale: p.scale });
      }
    }
    const t = emptyTap.current;
    if (t && t.id === e.pointerId) {
      emptyTap.current = null;
      if (save) onSelect(null);
    }
  };

  const onKey = (i: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const s = stickers[i];
    if (!s) return;
    pinched.current = false;
    const move = (dx: number, dy: number) => dispatch({ type: "move", index: i, x: s.x + dx, y: s.y + dy });
    switch (e.key) {
      case "ArrowLeft":
        move(-NUDGE, 0);
        break;
      case "ArrowRight":
        move(NUDGE, 0);
        break;
      case "ArrowUp":
        move(0, -NUDGE);
        break;
      case "ArrowDown":
        move(0, NUDGE);
        break;
      case "Delete":
      case "Backspace":
        onSelect(null);
        dispatch({ type: "remove", index: i });
        break;
      case "-":
      case "_":
        dispatch({ type: "scale", index: i, scale: s.scale - SCALE_KEY_STEP });
        break;
      case "+":
      case "=":
        dispatch({ type: "scale", index: i, scale: s.scale + SCALE_KEY_STEP });
        break;
      default:
        return;
    }
    e.preventDefault();
    onSelect(i);
  };

  return (
    <div
      ref={box}
      className="absolute inset-0"
      // 고른 스티커가 있으면 두 손가락이 화면 확대·스크롤로 새지 않게(위 머리말)
      style={{ zIndex: LAYER_Z, touchAction: selected !== null ? "none" : undefined }}
      onPointerDown={layerDown}
      onPointerMove={layerMove}
      onPointerUp={(e) => layerEnd(e, true)}
      onPointerCancel={(e) => layerEnd(e, false)}
    >
      {stickers.map((s, i) => {
        const def = studioSticker(s.icon);
        if (!def) return null;
        const at = live?.index === i ? live : s;
        const scale = pinchLive?.index === i ? pinchLive.scale : s.scale;
        const on = selected === i;
        const mark: CSSProperties = on ? { outline: `2px dashed ${accent}`, outlineOffset: 2 } : {};
        const text = def.kind === "text";
        const px = text ? 0 : stickerPx(scale, height);
        const hit = Math.max(HIT_MIN, px);
        return (
          <button
            key={`${i}-${s.icon}`}
            type="button"
            aria-label={`${text ? `'${def.label}' 글자` : def.label} 스티커 — 끌어서 옮기고, 눌러서 고르기`}
            aria-pressed={on}
            className="absolute flex cursor-grab items-center justify-center rounded-2xl p-0 outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-white"
            style={{
              ...place(at),
              ...(text ? { minWidth: HIT_MIN, minHeight: HIT_MIN } : { width: hit, height: hit }),
              touchAction: "none",
              zIndex: on ? 1 : undefined,
            }}
            onPointerDown={onDown(i)}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onCancel}
            onLostPointerCapture={onCancel}
            onClick={() => {
              if (!pinched.current) onSelect(i);
            }}
            onKeyDown={onKey(i)}
          >
            {def.kind === "text" ? (
              <TextStickerFace def={def} fontPx={textPx(scale, height)} style={{ ...mark, borderRadius: 12, pointerEvents: "none" }} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={def.src}
                alt=""
                draggable={false}
                className="pointer-events-none block max-w-none select-none rounded-xl"
                style={{ width: px, height: px, filter: STICKER_SHADOW, ...mark }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
