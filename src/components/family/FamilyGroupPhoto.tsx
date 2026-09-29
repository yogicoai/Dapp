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
 *  - 얼굴 크기 고르기(사장님 2026-09-29 "아빠만 머리가 너무 크게 나와"): 그림마다 잰 머리 비율(portrait.headRatio)이
 *    있으면 얼굴 비율표(headChartRatio)에서 벗어난 만큼 반만 크기를 맞춘다 — 사람마다 ±10% 안, 키 순서는 뒤집지 않고,
 *    키가 같은 사람끼리는 ±3% 안(lib/family-head groupHeights 에 셈과 까닭). 잰 비율이 없는 그림(예전 그림)은 실제 키 비율 그대로.
 *    그림(투명 PNG)은 흰 바탕 지우기가 여백을 잘라 둬서(lib/cutout) 그림 높이 = 사람 높이다 — 여백 차이는 따로 맞출 필요가 없다.
 *  - 식구가 많아 폭을 넘치면 줄 전체를 줄여 맞춘다(사람끼리 비율은 그대로).
 *    transform 으로 줄이지 않고 크기 자체를 줄인다 — transform 은 새 쌓임 맥락을 만들어
 *    흰 바탕 그림(opaque)의 곱하기(multiply)가 배경과 섞이지 못하고 흰 네모로 남는다.
 *  - 사람을 누르면 폴짝 뛴다(움직임 줄이기 설정이면 안 뛴다).
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { groupOrder, heightFor, type FamilyMember } from "@/lib/family";
import { groupHeights, headChartRatio } from "@/lib/family-head";
import type { ChildPrefs } from "@/lib/prefs";
import { displayName } from "./family-ui";
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
  // 세울 키 — 실제 키(cm)에 얼굴 크기 고르기를 살짝 더한 값. 표 비율의 나이는 그릴 때 보낸 나이와 같다
  // (아이는 설정의 아이 나이, 형제·친구는 member.age — family-ui portraitRequest).
  const cms = groupHeights(
    people.map((m) => ({
      cm: heightFor(m, { age: childAge, parents }),
      headRatio: m.portrait?.headRatio,
      target: headChartRatio(m.role, m.role === "child" ? childAge : m.age),
    })),
  );
  const tallest = Math.max(1, ...cms);
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
              const h = Math.round((cms[i] / tallest) * stage * fit);
              const shadowW = Math.max(22, Math.round(h * 0.32));
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-label={memberLabel?.(m) ?? displayName(m)}
                  onClick={(e) => {
                    hop(e.currentTarget.querySelector("img"));
                    onMemberClick?.(m, e.currentTarget);
                  }}
                  className="flex flex-col items-center rounded-2xl p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                  style={{ minWidth: Math.round(44 * fit) }}
                >
                  <PortraitImg
                    p={p}
                    className="relative z-[1] block w-auto max-w-none"
                    style={{ height: h, transformOrigin: "50% 100%" }}
                  />
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

export default FamilyGroupPhoto;
