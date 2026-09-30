"use client";

/**
 * 3단계 — 가족을 그리는 중 (시안 Drawing.dc.html).
 *
 * 그리기 자체(서버 호출·동시 2명)는 page 가 돌리고, 여기는 사람마다 상태만 보여 준다:
 * 끝남(그림 + 초록 체크) / 그리는 중(연필이 끄적끄적) / 기다림(점선 사람) / 멈춤(다시 해 볼게요).
 * 사진이 거절된 멈춤(kind 'photo')은 같은 사진으로 다시 하지 않고 '다른 사진·특징 고르기'(onRetry → 생김새 고르기).
 * 한 명이라도 끝나면 '먼저 된 사람부터 보기'가 켜진다 — 나머지는 뒤에서 계속 그린다.
 * 그리는 동안에도 '모아 보기로 — 뒤에서 계속 그려요'로 나갈 수 있다(망이 매달려도 갇히지 않게).
 */

import { useEffect, useRef, useState } from "react";
import { isKidRole, nextDrawCost, type FamilyMember } from "@/lib/family";
import { displayName, objectOf, paperStyle, withObject, type Colors, type Job } from "./family-ui";
import { PortraitImg } from "./Figures";
import { CheckIcon, HangerIcon, Silhouette } from "./icons";
import { FLOAT, SCRIBBLE, useLoop, WASH } from "./motion";
import { BigButton, StepDots } from "./ui";

const TIPS = [
  "옷은 이야기에 맞게 갈아입어요 — 궁에선 한복, 밤에는 잠옷",
  "마음에 안 들면 한 번은 쿠키 없이 다시 그려요",
  "고정한 가족은 동화마다 같은 얼굴로 나와요",
];

export function DrawingView({
  colors,
  mascot,
  mascotName,
  title,
  members,
  jobs,
  master,
  onRetry,
  onReview,
  onLeave,
  onCharge,
  onLogin,
}: {
  colors: Colors;
  mascot: string;
  mascotName: string;
  /** '하온이네 가족' */
  title: string;
  members: FamilyMember[];
  jobs: Record<string, Job>;
  master: boolean;
  onRetry: (id: string) => void;
  onReview: () => void;
  onLeave: () => void;
  onCharge: () => void;
  onLogin: () => void;
}) {
  const [tip, setTip] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTip((i) => (i + 1) % TIPS.length), 5000);
    return () => clearInterval(t);
  }, []);

  const mascotRef = useRef<HTMLDivElement>(null);
  useLoop(mascotRef, FLOAT, 3200);

  const st = (id: string) => jobs[id]?.status ?? "wait";
  const done = members.filter((m) => st(m.id) === "done");
  const drawing = members.filter((m) => st(m.id) === "drawing");
  const errors = members.filter((m) => st(m.id) === "error");
  const running = members.some((m) => st(m.id) === "wait" || st(m.id) === "drawing");
  const n = members.length;

  const bubble = running
    ? ["물감 섞는 중이야!", "조금만 기다려 줘"]
    : errors.length > 0
      ? ["앗, 잘 안 된 그림이 있어.", "다시 해 볼까?"]
      : ["다 그렸어!", "보러 가자"];

  const who =
    drawing.length === 1 ? objectOf(drawing[0]) : drawing.length > 1 ? withObject(drawing.map(displayName).join("·")) : "";
  const progress = running
    ? `${who ? `${who} 그리는 중… ` : ""}${n}명 중 ${done.length}명 다 그렸어요`
    : errors.length > 0
      ? `${n}명 중 ${done.length}명 다 그렸어요`
      : `${n}명 모두 다 그렸어요!`;

  return (
    <div className="flex flex-col items-center pb-8">
      <div aria-hidden className="fixed inset-0 -z-10" style={paperStyle(colors)} />

      <div className="relative flex min-h-11 w-full items-center justify-center">
        <span className="text-[15px] font-extrabold text-neutral-700">우리 가족 그리기</span>
        <span className="absolute right-0">
          <StepDots at={3} colors={colors} />
        </span>
      </div>

      <div className="mt-2.5 flex items-center gap-3.5">
        <div
          ref={mascotRef}
          className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-full border-4 border-white bg-white shadow-[0_6px_14px_rgba(60,40,25,.2)]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mascot} alt={`마스코트 ${mascotName}`} className="h-full w-full object-cover" />
        </div>
        <div className="relative rounded-[18px] bg-white px-3.5 py-2.5 text-sm font-extrabold leading-snug text-neutral-700 shadow-[0_2px_8px_rgba(60,40,25,.12)]" aria-live="polite">
          <span aria-hidden className="absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 bg-white" />
          <span className="relative">
            {bubble[0]}
            <br />
            {bubble[1]}
          </span>
        </div>
      </div>

      <h1 className="mt-4 break-keep text-center text-[22px] font-extrabold text-neutral-800">{title}을 그리고 있어요</h1>
      <p className="mt-1 text-sm font-medium text-neutral-500">{n > 2 ? "1~2분쯤 걸려요" : "1분쯤 걸려요"}</p>

      <div className="mt-4 flex w-full max-w-[400px] flex-wrap justify-center gap-3">
        {members.map((m) => (
          <PersonCard key={m.id} member={m} status={st(m.id)} colors={colors} />
        ))}
      </div>

      <p className="mt-3.5 break-keep text-center text-sm font-bold text-neutral-700" aria-live="polite">
        {progress}
      </p>

      {errors.length > 0 && (
        <div className="mt-3 flex w-full flex-col gap-2">
          {errors.map((m) => {
            const j = jobs[m.id];
            const cost = nextDrawCost(m.draws);
            return (
              <div key={m.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-white px-3.5 py-2.5 shadow-[0_0_0_1.5px_#fecdd3]">
                <span className="min-w-0 flex-1 break-keep text-[13px] font-bold text-neutral-700">
                  <b className="font-extrabold">{displayName(m)}</b> — {j?.message ?? "그리다 멈췄어요."}
                </span>
                {/* 작은 흰 글씨라 바탕은 accentDark — 밝은 나라 색(민트 등)에서도 글자 대비 4.5:1 을 넘게 */}
                {j?.kind === "insufficient" ? (
                  <button type="button" onClick={onCharge} className="min-h-11 shrink-0 rounded-full px-3.5 text-[13px] font-extrabold text-white" style={{ background: colors.accentDark }}>
                    요금제 미리 보기
                  </button>
                ) : j?.kind === "photo" ? (
                  <button type="button" onClick={() => onRetry(m.id)} className="min-h-11 shrink-0 rounded-full px-3.5 text-[13px] font-extrabold text-white" style={{ background: colors.accentDark }}>
                    다른 사진·특징 고르기
                  </button>
                ) : j?.kind === "login" ? (
                  <button type="button" onClick={onLogin} className="min-h-11 shrink-0 rounded-full px-3.5 text-[13px] font-extrabold text-white" style={{ background: colors.accentDark }}>
                    다시 로그인
                  </button>
                ) : (
                  <button type="button" onClick={() => onRetry(m.id)} className="min-h-11 shrink-0 rounded-full px-3.5 text-[13px] font-extrabold text-white" style={{ background: colors.accentDark }}>
                    다시 해 볼게요{!master && cost > 0 && j?.kind !== "lost" ? ` · 쿠키 ${cost}개` : ""}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex w-full items-center gap-3 rounded-2xl bg-white px-3.5 py-3 shadow-[0_2px_8px_rgba(60,40,25,.08)]">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: colors.accentSoft, color: colors.accentDark }}>
          <HangerIcon size={24} />
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          {/* 5초마다 도는 장식 문구라 알리지 않는다(aria-live 없음) — 진행 글의 알림이 묻히지 않게 */}
          <span className="break-keep text-[13px] font-bold leading-snug text-neutral-700">{TIPS[tip]}</span>
          <span className="flex gap-1" aria-hidden>
            {TIPS.map((_, i) => (
              <span
                key={i}
                className="h-[5px] rounded-full transition-all"
                style={{ width: i === tip ? 14 : 5, background: i === tip ? colors.accent : "#e5e5e5" }}
              />
            ))}
          </span>
        </div>
      </div>

      <div className="mt-[18px] w-full">
        {done.length === 0 && !running ? (
          <BigButton colors={colors} onClick={onLeave}>
            모아 보기로 돌아가기
          </BigButton>
        ) : (
          <BigButton colors={colors} onClick={onReview} disabled={done.length === 0}>
            {running ? "먼저 된 사람부터 보기" : "확인하러 가기"}
          </BigButton>
        )}
      </div>
      {running && (
        <>
          {/* 그리는 중에도 나갈 길 — 망이 매달려도 화면에 갇히지 않게. 그리기는 뒤에서 계속된다. */}
          <button
            type="button"
            onClick={onLeave}
            className="mt-3 min-h-11 px-3.5 text-sm font-extrabold"
            style={{ color: colors.accentDark }}
          >
            모아 보기로 — 뒤에서 계속 그려요
          </button>
          <p className="mt-1 text-xs font-semibold text-neutral-500">앱을 닫지 말고 기다려 주세요.</p>
        </>
      )}
    </div>
  );
}

function PersonCard({ member, status, colors }: { member: FamilyMember; status: Job["status"]; colors: Colors }) {
  const kid = isKidRole(member.role);
  const h = kid ? 96 : 124;
  // 확인까지 끝난 사람은 draft 가 비고 portrait 로 옮겨 가 있다.
  const pic = member.draft ?? member.portrait;
  const name = displayName(member);

  return (
    <div className="flex w-[104px] flex-col items-center gap-1.5">
      <div
        className="relative flex h-[138px] w-[104px] items-end justify-center overflow-hidden rounded-[20px]"
        style={{
          background: status === "wait" ? "#fffdf7" : status === "error" ? "#fff1f2" : "#fff",
          boxShadow:
            status === "drawing"
              ? `0 0 0 2px ${colors.accent}55, 0 4px 12px rgba(60,40,25,.10)`
              : status === "error"
                ? "0 0 0 1.5px #fecdd3, 0 4px 12px rgba(60,40,25,.08)"
                : "0 4px 12px rgba(60,40,25,.10)",
        }}
      >
        {status === "done" && pic ? (
          <PortraitImg p={pic} alt={name} className="absolute bottom-1.5 left-1/2 w-auto max-w-none -translate-x-1/2" style={{ height: h }} />
        ) : status === "drawing" ? (
          <DrawingArt colors={colors} />
        ) : status === "error" ? (
          <span className="mb-10 flex h-10 w-10 items-center justify-center self-center rounded-full bg-white text-xl font-extrabold text-rose-500 shadow">!</span>
        ) : (
          <Silhouette width={60} height={118} color="#d6cbb5" className="mb-2" />
        )}
      </div>
      <span className="flex max-w-full items-center gap-1 text-[13px] font-extrabold text-neutral-700">
        <span className={`truncate ${status === "wait" ? "text-neutral-500" : ""}`}>{name}</span>
        {status === "done" && (
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-600">
            <CheckIcon size={10} />
            <span className="sr-only">다 그렸어요</span>
          </span>
        )}
        {status === "drawing" && (
          <span className="shrink-0 text-[11px] font-extrabold" style={{ color: colors.accentDark }}>
            그리는 중
          </span>
        )}
        {status === "error" && <span className="shrink-0 text-[11px] font-extrabold text-rose-600">멈췄어요</span>}
      </span>
    </div>
  );
}

/** 그리는 중 — 점선 사람 위로 물감이 번지고 연필이 끄적인다 */
function DrawingArt({ colors }: { colors: Colors }) {
  const pencil = useRef<HTMLImageElement>(null);
  const wash = useRef<HTMLSpanElement>(null);
  useLoop(pencil, SCRIBBLE, 1600);
  useLoop(wash, WASH, 2400);
  return (
    <>
      <Silhouette width={60} height={118} color="#d6cbb5" className="mb-2" />
      <span
        ref={wash}
        aria-hidden
        className="absolute inset-x-2 top-12 h-10 rounded-[50%] opacity-40 blur-md"
        style={{ background: colors.accent }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={pencil} src="/icons/func-edit.webp" alt="" aria-hidden className="absolute right-0.5 top-10 h-9 w-9" style={{ transform: "rotate(18deg)" }} />
    </>
  );
}
