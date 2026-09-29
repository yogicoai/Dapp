"use client";

/**
 * 가족 단체 사진 — 고정된 가족을 나라 배경 앞에 키 순서대로 세운다.
 *
 * 홈 액자·가족 모아 보기·완성 화면이 같이 쓴다(홈 갈래는 import 만 한다).
 * 액자 테두리(흰 테·나라 색 선)는 부르는 쪽이 두르고, 이 컴포넌트는 안쪽 무대만 그린다.
 *
 *  - 배경: 나라 배경을 아래쪽 기준(object-bottom)으로 깔고 1.5px 흐리게 + 크림 베일.
 *  - 사람: groupOrder 순서(가운데 아이, 양옆 부모, 바깥 조부모), 키는 heightFor 비율로
 *    (가장 큰 사람이 무대 높이의 78%). 발밑에 타원 그림자.
 *    어른 키 칩도 반영한다 — 엄마·아빠는 설정의 parents.*.height(parents 로 넘겨받음),
 *    할머니·할아버지는 member.looks.height. 안 고르면 '보통'.
 *  - 얼굴 크기표(사장님 2026-09-29 "가족들이 얼굴 크기에 대한 비율이 있어야 할 것 같아", "아빠·아이 얼굴 크기가 …
 *    정확하게 맞아"): 그림마다 잰 머리 비율(portrait.headRatio)이 있으면 그림 한 장을 머리·몸·발 세 칸으로 나눠 세운다
 *    (SplitFigure). 키는 실제 키 그대로, 머리는 얼굴 크기표(아빠 1 · 엄마 0.94 · 6살까지 0.8 …)대로 — 머리·발 칸은 가로·세로
 *    같은 배율(얼굴은 찌그러지지 않는다), 몸 칸만 세로 배율로 둘을 잇는다(lib/family-head faceLayout 에 셈과 까닭).
 *    이미 그린 그림도 다시 그리지 않고 고쳐진다. 잰 비율이 없는 그림(예전 그림)은 예전처럼 한 장을 실제 키로.
 *    그림(투명 PNG)은 흰 바탕 지우기가 여백을 잘라 둬서(lib/cutout) 그림 높이 = 사람 높이다. 흰 바탕 그림(opaque)은 위·아래에
 *    여백이 조금 남아(OPAQUE_PAD) 칸을 나눌 때는 여백을 뺀 사람이 실제 키로 선다(그림은 여백만큼 더 크다).
 *    굽기 때 이미 몸을 늘인 그림(portrait.bodyStretch)은 여기서 덜 늘인다(둘을 곱해 1.45 까지 — FACE_FIT.totalMax).
 *  - 식구가 많아 폭을 넘치면 줄 전체를 줄여 맞춘다(사람끼리 비율은 그대로).
 *    transform 으로 줄이지 않고 크기 자체를 줄인다 — transform 은 새 쌓임 맥락을 만들어
 *    흰 바탕 그림(opaque)의 곱하기(multiply)가 배경과 섞이지 못하고 흰 네모로 남는다. 세 칸도 transform 없이
 *    overflow 로 자른 상자 셋이고, 곱하기는 세 칸을 감싼 한 겹에 준다(폴짝 뛸 때 그 한 겹이 움직여도 곱하기가 그대로).
 *  - 사람을 누르면 폴짝 뛴다(움직임 줄이기 설정이면 안 뛴다).
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { groupOrder, heightFor, type FamilyMember, type FamilyPortrait } from "@/lib/family";
import { faceLayout, faceSize, OPAQUE_PAD, type FaceSplit } from "@/lib/family-head";
import type { ChildPrefs } from "@/lib/prefs";
import { displayName, portraitBlend } from "./family-ui";
import { PortraitImg } from "./Figures";
import { hop } from "./motion";

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
}: FamilyGroupPhotoProps) {
  const people = groupOrder(members.filter((m) => m.portrait));
  // 세울 키와 칸 나누기 — 키는 실제 키(cm), 얼굴은 얼굴 크기표. 얼굴 나이는 키와 같은 나이다(heightFor: 아이는 설정의
  // 아이 나이, 형제·친구는 member.age, 없으면 아이 나이) — 둘이 다르면 몸 칸이 억지로 늘거나 준다.
  const plans = faceLayout(
    people.map((m) => ({
      cm: heightFor(m, { age: childAge, parents }),
      headRatio: m.portrait?.headRatio,
      face: faceSize(m.role, m.role === "child" ? childAge : (m.age ?? childAge), m.gender),
      pad: m.portrait?.opaque ? OPAQUE_PAD : 0,
      // 굽기 때 이미 늘인 몸(api/family/portrait ④) — 여기서 또 늘여 합이 1.45 를 넘지 않게
      baked: m.portrait?.bodyStretch,
    })),
  );
  // 무대 높이는 사람 키로 맞춘다(흰 바탕 그림의 여백은 빼고 — 나누지 않는 그림은 예전처럼 그림 높이)
  const tallest = Math.max(1, ...plans.map((p) => p.figure ?? p.height));
  const stage = height * 0.78;

  const box = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);
  const fitRef = useRef(1);
  const hasPeople = people.length > 0;

  // 줄이 무대 폭을 넘치면 줄여 맞춘다. 그림이 늦게 뜨며 폭이 바뀌어도 따라간다.
  // 모든 크기(키·간격·최소 폭)가 fit 에 정비례하므로 '지금 폭 ÷ fit' 이 줄이기 전 폭이다.
  useEffect(() => {
    const b = box.current;
    const r = row.current;
    if (!b || !r || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const natural = r.offsetWidth / fitRef.current;
      const have = b.clientWidth - 16;
      const next = natural > have && natural > 0 ? Math.max(0.4, have / natural) : 1;
      if (Math.abs(next - fitRef.current) > 0.005) {
        fitRef.current = next;
        setFit(next);
      }
    };
    const ro = new ResizeObserver(measure);
    ro.observe(b);
    ro.observe(r);
    return () => ro.disconnect();
  }, [hasPeople]);

  // cm 단위 → px — 가장 큰 사람이 무대 높이, 줄이 넘치면 fit 만큼 함께 줄인다
  const px = (stage * fit) / tallest;

  return (
    <div ref={box} className={`relative overflow-hidden ${className}`} style={{ height, background: "#f7efdc" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={background}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full scale-105 object-cover object-bottom"
        style={{ filter: "blur(1.5px) saturate(.9)" }}
      />
      <div aria-hidden className="absolute inset-0" style={{ background: "rgba(255,251,235,.35)" }} />

      {people.length === 0 ? (
        empty ? <div className="absolute inset-0 flex items-center justify-center p-4">{empty}</div> : null
      ) : (
        <div className="absolute inset-x-0 flex justify-center" style={{ bottom: Math.round(height * 0.06) }}>
          <div ref={row} className="flex w-max shrink-0 items-end" style={{ gap: Math.max(2, Math.round(height * 0.025 * fit)) }}>
            {people.map((m, i) => {
              const p = m.portrait;
              if (!p) return null;
              const { split } = plans[i];
              const h = split ? plans[i].height * px : Math.round(plans[i].height * px);
              const shadowW = Math.max(22, Math.round(h * 0.32));
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-label={memberLabel?.(m) ?? displayName(m)}
                  onClick={(e) => {
                    // 첫째 자식 = 그림 한 장(img) 또는 세 칸을 감싼 한 겹 — 통째로 뛴다
                    hop(e.currentTarget.firstElementChild);
                    onMemberClick?.(m, e.currentTarget);
                  }}
                  className="flex flex-col items-center rounded-2xl p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                  style={{ minWidth: Math.round(44 * fit) }}
                >
                  {split ? (
                    <SplitFigure p={p} split={split} px={px} />
                  ) : (
                    <PortraitImg
                      p={p}
                      className="relative z-[1] block w-auto max-w-none"
                      style={{ height: h, transformOrigin: "50% 100%" }}
                    />
                  )}
                  <span
                    aria-hidden
                    className="block rounded-[50%]"
                    style={{
                      width: shadowW,
                      height: Math.max(6, Math.round(h * 0.06)),
                      marginTop: -Math.max(4, Math.round(h * 0.035)),
                      background: "rgba(60,40,25,.18)",
                    }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}
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
 */
function SplitFigure({ p, split, px }: { p: FamilyPortrait; split: FaceSplit; px: number }) {
  const full = split.scale * px; // 그림 전체를 고르게 세운 높이(머리·발 칸)
  const bodyFull = full * split.stretch; // 몸 칸용 — 세로만 늘인 그림 전체 높이
  const headH = full * split.cut;
  const bodyH = bodyFull * (split.foot - split.cut);
  const feetH = full * (1 - split.foot);
  return (
    <span className="relative z-[1] flex flex-col" style={{ ...portraitBlend(p), transformOrigin: "50% 100%" }}>
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
