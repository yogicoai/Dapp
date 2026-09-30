"use client";

/**
 * 가족 단체 사진 — 고정된 가족을 나라 배경 앞에 사진관 가족사진처럼 세운다.
 *
 * 홈 액자·가족 모아 보기·완성 화면이 같이 쓴다(홈 갈래는 import 만 한다).
 * 액자 테두리(흰 테·나라 색 선)는 부르는 쪽이 두르고, 이 컴포넌트는 안쪽 무대만 그린다.
 *
 *  - 배경: 나라 배경을 아래쪽 기준(object-bottom)으로 깔고 1.5px 흐리게 + 크림 베일.
 *  - 자리(사장님 2026-09-30 D안 "부모는 어깨를 붙이고 아이는 앞 가운데에 서요. 사진관 가족사진 느낌이에요"):
 *    예전엔 groupOrder 순서로 한 줄에 띄워 세워 증명사진을 나란히 붙인 것 같았다. 이제 어른은 뒷줄에 어깨를 붙여 서고
 *    (엄마 왼쪽·아빠 오른쪽, 조부모 양끝), 아이는 앞줄 가운데에 조금 아래·조금 크게 선다. 누가 앞인지·얼굴을 안 가리는지·
 *    폭을 넘치면 얼마나 줄일지는 lib/family-group-layout groupLayout(순수 함수, 시험 있음)이 모두 정하고 여기서는 그대로 그린다.
 *    발밑 그림자는 사람마다가 아니라 무리 아래 하나(부드러운 타원 — 따뜻한 갈색이라 어느 나라 배경에도 어울린다).
 *  - 키: heightFor 비율로(가장 큰 사람이 무대 높이의 78%). 어른 키 칩도 반영한다 — 엄마·아빠는 설정의
 *    parents.*.height(parents 로 넘겨받음), 할머니·할아버지는 member.looks.height. 안 고르면 '보통'.
 *  - 얼굴 크기표(사장님 2026-09-29 "가족들이 얼굴 크기에 대한 비율이 있어야 할 것 같아", "아빠·아이 얼굴 크기가 …
 *    정확하게 맞아"): 그림마다 잰 머리 비율(portrait.headRatio)이 있으면 그림 한 장을 머리·몸·발 세 칸으로 나눠 세운다
 *    (SplitFigure). 키는 실제 키 그대로, 머리는 얼굴 크기표(아빠 1 · 엄마 0.94 · 6살까지 0.8 …)대로 — 머리·발 칸은 가로·세로
 *    같은 배율(얼굴은 찌그러지지 않는다), 몸 칸만 세로 배율로 둘을 잇는다(lib/family-head faceLayout 에 셈과 까닭).
 *    이미 그린 그림도 다시 그리지 않고 고쳐진다. 잰 비율이 없는 그림(예전 그림)은 예전처럼 한 장을 실제 키로.
 *    그림(투명 PNG)은 흰 바탕 지우기가 여백을 잘라 둬서(lib/cutout) 그림 높이 = 사람 높이다. 흰 바탕 그림(opaque)은 위·아래에
 *    여백이 조금 남아(OPAQUE_PAD) 칸을 나눌 때는 여백을 뺀 사람이 실제 키로 선다(그림은 여백만큼 더 크다).
 *    굽기 때 이미 몸을 늘인 그림(portrait.bodyStretch)은 여기서 덜 늘인다(둘을 곱해 1.45 까지 — FACE_FIT.totalMax).
 *  - 어깨를 붙이려면 그림 폭이 있어야 한다 — 그림 가로 ÷ 세로를 미리 읽어 두고(useAspects), 다 읽기 전에는 무리를 숨긴다
 *    (잘못 짐작한 폭으로 섰다가 자리가 튀지 않게).
 *  - 식구가 많아 폭을 넘치면 모두 함께 줄인다(사람끼리 비율은 그대로 — groupLayout 의 fit).
 *    transform 으로 줄이지도, 자리를 옮기지도 않는다 — transform 은 새 쌓임 맥락을 만들어 흰 바탕 그림(opaque)의
 *    곱하기(multiply)가 배경과 섞이지 못하고 흰 네모로 남는다. 그래서 자리는 폭 0 상자(가운데 맞춤 flex)의 left·bottom 으로,
 *    크기는 크기 자체로 준다. 세 칸도 transform 없이 overflow 로 자른 상자 셋이고, 곱하기는 세 칸을 감싼 한 겹에 준다
 *    (폴짝 뛸 때 그 한 겹이 움직여도 곱하기가 그대로).
 *  - 겹치는 순서는 groupLayout 의 z 를 그림(곱하기를 받는 한 겹 — 세 칸을 감싼 span 또는 그림 한 장)의 z-index 로 준다.
 *    그리는(DOM) 순서는 화면 왼쪽부터 — 키보드 Tab·화면 읽기가 사진을 보는 순서와 같게(뒤에 선 사람부터 그리면 엄마·아이·
 *    아빠 사진을 아빠→엄마→아이로 읽었다). 무대 맨 바깥 상자는 isolate(새 쌓임 맥락) — 그림 z 가 이 안에만 머물러 홈 명패
 *    (z-2)·인사 말풍선(z-3, components/FamilyFrame)·마스코트보다 위로 올라오지 않는다. 곱하기는 이 상자 안의 배경·그림자·
 *    뒤 사람과 섞인다. z-index 는 곱하기를 받는 그 한 겹에만 준다 — 바깥 자리 상자에 주면 그 상자가 쌓임 맥락이 되어
 *    곱하기가 빈 상자하고만 섞이고 흰 네모가 남는다(transform 과 같은 까닭).
 *  - 흰 바탕 그림(opaque)은 곱하기라 다른 사람 위에 겹치면 뒤 사람이 비친다 — groupLayout 이 흰 바탕 그림을 늘 아래에
 *    깔리게 세운다(opaque 를 넘긴다).
 *  - 사람을 누르면 폴짝 뛴다(움직임 줄이기 설정이면 안 뛴다).
 *  - 가족 사진관(사장님 2026-09-30, lib/family-studio): 고른 배경이 있으면 나라 배경 대신 그것을 가운데·70% 로
 *    깔고(흐림·베일은 같다), 붙인 스티커는 사람 앞(StudioStickers — 이 isolate 상자 안 z 100)에. 안 골랐으면 예전 그대로.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { groupOrder, heightFor, type FamilyMember, type FamilyPortrait } from "@/lib/family";
import { groupLayout, guessHead, type GroupSlot } from "@/lib/family-group-layout";
import { faceLayout, faceSize, OPAQUE_PAD, type FaceSplit } from "@/lib/family-head";
import { studioBackground, type FamilyStudio } from "@/lib/family-studio";
import { STUDIO_BG_POSITION } from "@/lib/family-studio-catalog";
import type { ChildPrefs } from "@/lib/prefs";
import { displayName, portraitBlend } from "./family-ui";
import { PortraitImg } from "./Figures";
import { hop, useReducedMotion } from "./motion";
import { StickerLayer } from "./StudioStickers";

/** 그림 가로 ÷ 세로를 못 읽었을 때(그림이 깨짐) — 선 사람 전신 그림의 흔한 값 */
const FALLBACK_ASPECT = 0.3;

/**
 * 그림마다 가로 ÷ 세로 — 어깨를 붙여 세우려면 그린 폭이 있어야 한다. 브라우저 캐시를 같이 쓰므로 화면의 그림과 한 번만
 * 받는다. 못 읽으면(깨진 주소) FALLBACK_ASPECT 로 채워 무리가 숨은 채 남지 않게.
 */
function useAspects(urls: readonly string[]): Record<string, number> {
  const [aspects, setAspects] = useState<Record<string, number>>({});
  const key = urls.join("\n");
  useEffect(() => {
    let live = true;
    for (const url of key.split("\n")) {
      if (!url) continue;
      const img = new Image();
      const done = (a: number) => {
        if (live) setAspects((s) => (s[url] === a ? s : { ...s, [url]: a }));
      };
      img.onload = () => done(img.naturalWidth > 0 && img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : FALLBACK_ASPECT);
      img.onerror = () => done(FALLBACK_ASPECT);
      img.src = url;
    }
    return () => {
      live = false;
    };
  }, [key]);
  return aspects;
}

export type FamilyGroupPhotoProps = {
  /** 고정된 사람(portrait 있는 사람). portrait 없는 사람은 알아서 빠진다. */
  members: FamilyMember[];
  /** 아이 나이 — 아이·형제 키를 어림하는 데 쓴다 */
  childAge: number | null;
  /** 설정의 엄마·아빠 생김새 — 키 칩(parents.mom/dad.height)을 키 비율에 쓴다. 없으면 '보통' 키. */
  parents?: ChildPrefs["parents"];
  /** 무대 높이(px) */
  height: number;
  /** 나라 배경(theme.background) */
  background: string;
  className?: string;
  /** 사람을 눌렀을 때(폴짝 뒤에) — 홈에서 인사 말풍선 등. el 은 누른 사람 버튼(말풍선 자리 잡기용). */
  onMemberClick?: (m: FamilyMember, el: HTMLElement) => void;
  /** 사람 버튼의 화면 읽기 이름 — 없으면 호칭('엄마'). 누르면 무엇이 되는지 덧붙일 때 쓴다. */
  memberLabel?: (m: FamilyMember) => string;
  /** 고정된 사람이 없을 때 무대 가운데에 보일 것 */
  empty?: ReactNode;
  /** 가족 사진관 — 고른 배경·붙인 스티커(ChildPrefs.familyStudio). 없거나 모르는 배경이면 나라 배경(예전 그대로). */
  studio?: FamilyStudio | null;
  /** 붙인 스티커 대신 그릴 층 — 꾸미기 시트의 끌어 옮기기(StickerEditor). 사람이 있을 때만 그린다. */
  stickerLayer?: ReactNode;
};

export function FamilyGroupPhoto({
  members,
  childAge,
  parents,
  height,
  background,
  className = "",
  onMemberClick,
  memberLabel,
  empty,
  studio,
  stickerLayer,
}: FamilyGroupPhotoProps) {
  // 고른 배경(숨긴 배경도 — 이미 고른 사람에게는 계속). 없으면 나라 배경을 예전처럼 맨 아래 기준으로.
  const picked = studioBackground(studio?.bg);
  // 움직이는 배경 — 움직임 줄이기 설정(과 서버 그리기)에서는 그림만
  const still = useReducedMotion();
  const bgVideo = picked?.video && !still ? picked.video : null;
  const stickers = studio?.stickers ?? [];
  const people = groupOrder(members.filter((m) => m.portrait));
  // 키·얼굴과 같은 나이(heightFor: 아이는 설정의 아이 나이, 형제·친구는 member.age, 없으면 아이 나이) — 둘이 다르면
  // 몸 칸이 억지로 늘거나 준다. 앞줄 아이인지(12살까지)도 이 나이로 가른다.
  const ageOf = (m: FamilyMember) => (m.role === "child" ? childAge : (m.age ?? childAge));
  // 세울 키와 칸 나누기 — 키는 실제 키(cm), 얼굴은 얼굴 크기표.
  const plans = faceLayout(
    people.map((m) => ({
      cm: heightFor(m, { age: childAge, parents }),
      headRatio: m.portrait?.headRatio,
      face: faceSize(m.role, ageOf(m), m.gender),
      pad: m.portrait?.opaque ? OPAQUE_PAD : 0,
      // 굽기 때 이미 늘인 몸(api/family/portrait ④) — 여기서 또 늘여 합이 1.45 를 넘지 않게
      baked: m.portrait?.bodyStretch,
    })),
  );

  const box = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState<number | null>(null);
  const aspects = useAspects(people.map((m) => m.portrait?.url ?? ""));
  const ready = people.every((m) => m.portrait && aspects[m.portrait.url] !== undefined);

  // 무대 폭을 잰다 — 무리가 넘치면 groupLayout 이 모두 함께 줄인다(화면 폭이 바뀌어도 따라간다).
  useEffect(() => {
    const b = box.current;
    if (!b || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setBoxW((w) => (w !== null && Math.abs(w - b.clientWidth) < 0.5 ? w : b.clientWidth)));
    ro.observe(b);
    return () => ro.disconnect();
  }, []);

  // 사람마다 그림 크기(cm 단위) → 자리(px). 폭은 가로·세로 같은 배율로 세운 높이(칸을 나누면 split.scale) × 그림 비율.
  const slots: GroupSlot[] = people.map((m, i) => {
    const plan = plans[i];
    const aspect = (m.portrait && aspects[m.portrait.url]) || FALLBACK_ASPECT;
    return {
      id: m.id,
      role: m.role,
      age: ageOf(m),
      height: plan.height,
      figure: plan.figure ?? plan.height,
      head: plan.split ? plan.split.head : guessHead(plan.height, m.role, ageOf(m), m.portrait?.headRatio),
      width: aspect * (plan.split ? plan.split.scale : plan.height),
      opaque: !!m.portrait?.opaque,
    };
  });
  const layout = groupLayout(slots, { width: boxW, height });
  // 화면 왼쪽부터 그린다(Tab·화면 읽기 순서 = 사진 보는 순서). 겹치는 순서는 그림의 z-index(place.z)가 정한다.
  const drawOrder = people.map((_, i) => i).sort((a, b) => layout.places[a].x - layout.places[b].x);
  const shadow = layout.shadow;

  return (
    <div ref={box} className={`relative isolate overflow-hidden ${className}`} style={{ height, background: "#f7efdc" }}>
      {bgVideo ? (
        <video
          key={bgVideo}
          src={bgVideo}
          poster={picked?.src}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden
          className="absolute inset-0 h-full w-full scale-105 object-cover"
          style={{ filter: "blur(1.5px) saturate(.9)", objectPosition: STUDIO_BG_POSITION }}
        />
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={picked?.src ?? background}
          alt=""
          aria-hidden
          className={`absolute inset-0 h-full w-full scale-105 object-cover ${picked ? "" : "object-bottom"}`}
          style={{ filter: "blur(1.5px) saturate(.9)", objectPosition: picked ? STUDIO_BG_POSITION : undefined }}
        />
      )}
      <div aria-hidden className="absolute inset-0" style={{ background: "rgba(255,251,235,.35)" }} />

      {people.length === 0 ? (
        empty ? <div className="absolute inset-0 flex items-center justify-center p-4">{empty}</div> : null
      ) : (
        <div className="absolute inset-0" style={{ visibility: ready ? undefined : "hidden" }}>
          {/* 무리 발밑 그림자 하나 — 뒷줄 발에서 앞줄 발까지 덮는 부드러운 타원 */}
          {shadow && (
            <span
              aria-hidden
              className="absolute block rounded-[50%]"
              style={{
                left: `calc(50% + ${shadow.x - shadow.width / 2}px)`,
                bottom: shadow.bottom,
                width: shadow.width,
                height: shadow.height,
                background: "radial-gradient(closest-side, rgba(60,40,25,.24), rgba(60,40,25,.12) 55%, rgba(60,40,25,0))",
              }}
            />
          )}
          {drawOrder.map((i) => {
            const m = people[i];
            const p = m.portrait;
            if (!p) return null;
            const place = layout.places[i];
            const { split } = plans[i];
            return (
              // 폭 0 상자의 가운데 맞춤 — 그림이 양쪽으로 똑같이 넘쳐 가운데가 left 에 온다(transform 없이, 위 머리말)
              <div
                key={m.id}
                className="absolute flex w-0 justify-center"
                style={{ left: `calc(50% + ${place.x}px)`, bottom: place.bottom }}
              >
                <button
                  type="button"
                  aria-label={memberLabel?.(m) ?? displayName(m)}
                  onClick={(e) => {
                    // 첫째 자식 = 그림 한 장(img) 또는 세 칸을 감싼 한 겹 — 통째로 뛴다
                    hop(e.currentTarget.firstElementChild);
                    onMemberClick?.(m, e.currentTarget);
                  }}
                  className="flex shrink-0 flex-col items-center rounded-2xl p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                  style={{ minWidth: Math.round(44 * layout.fit) }}
                >
                  {split ? (
                    <SplitFigure p={p} split={split} px={place.px} z={place.z} />
                  ) : (
                    <PortraitImg
                      p={p}
                      className="relative block w-auto max-w-none"
                      style={{ height: Math.round(plans[i].height * place.px), transformOrigin: "50% 100%", zIndex: place.z }}
                    />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* 가족 사진관 스티커 — 사람 앞(z 100). 빈 사진(사람 없음)에는 붙이지 않는다. 꾸미기 시트는 끌어 옮기는 층을 넘긴다. */}
      {people.length > 0 &&
        (stickerLayer ?? (stickers.length > 0 ? <StickerLayer stickers={stickers} height={height} /> : null))}
    </div>
  );
}

/**
 * 그림 한 장을 세 칸(머리·몸·발)으로 나눠 세운다 — lib/family-head faceLayout 의 셈 그대로, px 는 cm 단위 → px.
 *  - 칸마다 같은 그림을 한 장씩 넣고 overflow 로 자른다. transform 은 쓰지 않는다(곱하기가 깨진다 — 위 머리말).
 *  - 머리 칸 그림은 높이만 주고 폭은 그림 비율대로 — 이 폭이 세 칸의 폭이다(flex-col 이 몸·발 칸을 같은 폭으로 늘인다).
 *    그래서 세 칸의 가로 배율이 늘 같고, 그림이 늦게 떠도 폭이 함께 따라온다.
 *  - 몸·발 칸 그림은 칸 폭(100%)과 높이를 따로 준다 — 몸 칸만 세로로 split.stretch 배 늘어난다.
 *  - 칸 경계는 소수 px 라 반올림으로 1px 틈이 벌어질 수 있다 — 아래 칸을 1px 위로 겹쳐 올리고, 그림도 1px 내려
 *    칸 경계 줄이 제자리에 오게 한다(아래 칸이 위에 그려져 겹친 줄은 아래 칸 그림이 보인다).
 *  - 곱하기(흰 바탕 그림)는 세 칸을 감싼 한 겹에 준다 — 칸끼리는 보통으로 겹치고, 한 겹째 배경과 곱해진다.
 *    겹치는 순서(z)도 이 한 겹에 준다(위 머리말 — 바깥 상자에 주면 곱하기가 깨진다).
 */
function SplitFigure({ p, split, px, z }: { p: FamilyPortrait; split: FaceSplit; px: number; z: number }) {
  const full = split.scale * px; // 그림 전체를 고르게 세운 높이(머리·발 칸)
  const bodyFull = full * split.stretch; // 몸 칸용 — 세로만 늘인 그림 전체 높이
  const headH = full * split.cut;
  const bodyH = bodyFull * (split.foot - split.cut);
  const feetH = full * (1 - split.foot);
  return (
    <span className="relative flex flex-col" style={{ ...portraitBlend(p), transformOrigin: "50% 100%", zIndex: z }}>
      <span className="block overflow-hidden" style={{ height: headH }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.url} alt="" draggable={false} className="block w-auto max-w-none" style={{ height: full }} />
      </span>
      <span className="relative block overflow-hidden" style={{ height: bodyH + 1, marginTop: -1 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={p.url}
          alt=""
          draggable={false}
          className="absolute left-0 block w-full max-w-none"
          style={{ top: 1 - bodyFull * split.cut, height: bodyFull }}
        />
      </span>
      {feetH > 0 && (
        <span className="relative block overflow-hidden" style={{ height: feetH + 1, marginTop: -1 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={p.url}
            alt=""
            draggable={false}
            className="absolute left-0 block w-full max-w-none"
            style={{ top: 1 - full * split.foot, height: full }}
          />
        </span>
      )}
    </span>
  );
}

export default FamilyGroupPhoto;
