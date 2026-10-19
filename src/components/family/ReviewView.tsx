"use client";

/**
 * 한 사람씩 확인 (시안 Review.dc.html).
 *
 * 위에 얼굴 줄(확인한 사람은 하트), '○○, 이 모습이 맞나요?', 크림 종이 위 큰 그림.
 * '마음에 들어요' → 그 그림으로 고정. '다시 그리기' → 새 그림을 받아 앞 그림과 두 장 비교
 * ('어느 쪽이 더 닮았나요?'). 아직 그리는 중인 사람은 연필 그림으로 기다린다.
 */

import { useRef } from "react";
import { drawPrice, type FamilyMember } from "@/lib/family";
import type { ChildPrefs } from "@/lib/prefs";
import { displayName, looksSummary, objectOf, paperStyle, type Colors, type Job } from "./family-ui";
import { FaceAvatar, PortraitImg } from "./Figures";
import { HangerIcon, HeartIcon, LockIcon, NextIcon, BackIcon } from "./icons";
import { SCRIBBLE, useLoop } from "./motion";
import { BigButton, SoftButton, TopBar, costText } from "./ui";

export function ReviewView({
  colors,
  child,
  ids,
  family,
  jobs,
  idx,
  master,
  freeDraws = 0,
  onPick,
  onAccept,
  onAcceptAll,
  onRedraw,
  onRetry,
  onBack,
  onCharge,
}: {
  colors: Colors;
  child: ChildPrefs;
  ids: string[];
  family: FamilyMember[];
  jobs: Record<string, Job>;
  idx: number;
  master: boolean;
  /** 관리실이 더해 준 무료 생성 남은 횟수 — 쿠키가 드는 그리기에 먼저 쓴다(lib/family drawPrices) */
  freeDraws?: number;
  onPick: (i: number) => void;
  /** which: 'draft' 새 그림 / 'prev' 앞 그림으로 고정 */
  onAccept: (id: string, which: "draft" | "prev") => void;
  onAcceptAll: () => void;
  onRedraw: (id: string) => void;
  onRetry: (id: string) => void;
  onBack: () => void;
  onCharge: () => void;
}) {
  const people = ids.map((id) => family.find((f) => f.id === id)).filter((m): m is FamilyMember => Boolean(m));
  const i = Math.max(0, Math.min(idx, people.length - 1));
  const m = people[i];
  if (!m) return null;

  const job = jobs[m.id];
  const busy = job?.status === "drawing" || job?.status === "wait";
  const failed = job?.status === "error";
  const compare = !busy && Boolean(m.draft && m.prevDraft);
  const pending = !busy && Boolean(m.draft) && !compare;
  const confirmed = !busy && !m.draft && Boolean(m.portrait);
  const pic = m.draft ?? m.portrait;
  // 사진을 보고 그린 그림 — 칩을 안 골랐어도 '알아서'가 아니라 '사진을 보고'
  const fromPhoto = Boolean(pic?.fromPhoto);
  // 사진이 거절돼 같은 쿠키로 대신 그린 새 그림 — 확인 전(draft)인 동안만 한 줄 알린다(Job.note, 메모리에만).
  const note = !busy && job?.status === "done" && m.draft ? job.note : undefined;
  const pendingCount = people.filter((p) => p.draft && jobs[p.id]?.status !== "drawing" && jobs[p.id]?.status !== "wait").length;
  const sum = looksSummary(m, child);
  const { cost, free } = drawPrice(m.draws, master ? 0 : freeDraws);
  const name = displayName(m);

  const heading = busy
    ? `${objectOf(m)} 그리고 있어요`
    : failed && !pic
      ? `${objectOf(m)} 그리다 멈췄어요`
      : compare
        ? "어느 쪽이 더 닮았나요?"
        : confirmed
          ? `${name} 얼굴을 고정했어요`
          : `${name}, 이 모습이 맞나요?`;

  return (
    <div className="flex flex-col items-center rounded-[28px] bg-white/90 px-5 pb-3 pt-3.5 shadow-xl backdrop-blur">
      <div className="w-full">
        <TopBar onBack={onBack} title="우리 가족 확인" />
      </div>

      {/* 얼굴 줄 */}
      {people.length > 1 && (
        <div className="mt-1.5 flex max-w-full items-center gap-2.5">
          <div className="flex gap-1 overflow-x-auto px-1 py-1.5">
            {people.map((p, k) => {
              const ok = Boolean(p.portrait) && !p.draft;
              const cur = k === i;
              const waiting = !p.draft && !p.portrait;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onPick(k)}
                  aria-label={`${displayName(p)}${ok ? " 확인함" : cur ? " 지금 확인 중" : ""}`}
                  aria-current={cur ? "true" : undefined}
                  className="relative flex h-11 w-11 shrink-0 items-center justify-center"
                  style={{ opacity: waiting && !cur ? 0.45 : 1 }}
                >
                  <FaceAvatar
                    member={p}
                    size={32}
                    prefer="draft"
                    childGender={child.gender}
                    ring={cur ? `0 0 0 2px #fff, 0 0 0 4.5px ${colors.accent}` : "0 0 0 2px #fff, 0 1px 3px rgba(0,0,0,.18)"}
                  />
                  {ok && (
                    <span className="absolute bottom-0.5 right-0">
                      <HeartIcon size={13} color={colors.accent} stroke="#fff" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <span className="shrink-0 text-xs font-extrabold text-neutral-500">
            {i + 1} / {people.length}
          </span>
        </div>
      )}

      <h2 className="mt-3 break-keep text-center text-[21px] font-extrabold text-neutral-800" aria-live="polite">
        {heading}
      </h2>

      {compare && m.prevDraft && m.draft ? (
        <div className="mt-3 grid w-full grid-cols-2 gap-3">
          {(
            [
              { which: "prev" as const, p: m.prevDraft, label: "앞 그림" },
              { which: "draft" as const, p: m.draft, label: "새 그림" },
            ]
          ).map((c) => (
            <div key={c.which} className="flex flex-col items-center gap-2.5">
              <div
                className="relative aspect-[5/6] w-full overflow-hidden rounded-3xl border-[3px]"
                style={{ ...paperStyle(colors), borderColor: c.which === "draft" ? colors.accent : "#e5e5e5" }}
              >
                <Shadow />
                <PortraitImg p={c.p} alt={`${name} ${c.label}`} className="absolute bottom-[16%] left-1/2 h-[74%] w-auto max-w-none -translate-x-1/2" />
                <span
                  className="absolute left-2 top-2 rounded-full bg-white px-2.5 py-1 text-[11px] font-extrabold shadow-sm"
                  style={{ color: colors.accentDark }}
                >
                  {c.label}
                </span>
              </div>
              <BigButton colors={colors} onClick={() => onAccept(m.id, c.which)} compact>
                이걸로 할게요
              </BigButton>
            </div>
          ))}
        </div>
      ) : (
        <div
          className="relative mt-3 aspect-[280/336] w-full max-w-[280px] overflow-hidden rounded-[28px] border-[3px]"
          style={{ ...paperStyle(colors), borderColor: colors.accent }}
        >
          {busy ? (
            <DrawingNow colors={colors} />
          ) : pic ? (
            <>
              <Shadow />
              <PortraitImg p={pic} alt={`${name} 전신 그림`} className="absolute bottom-[16%] left-1/2 h-[75%] w-auto max-w-none -translate-x-1/2" />
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-xl font-extrabold text-rose-500 shadow">!</span>
              <p className="break-keep text-sm font-bold text-neutral-600">{job?.message ?? "그림이 아직 없어요."}</p>
            </div>
          )}
          <span
            className="absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white px-4 py-[5px] text-sm font-extrabold shadow-[0_2px_6px_rgba(60,40,25,.15)]"
            style={{ color: colors.accentDark }}
          >
            {name}
          </span>
          {people.length > 1 && (
            <>
              <button
                type="button"
                aria-label="이전 사람"
                onClick={() => onPick((i - 1 + people.length) % people.length)}
                className="absolute left-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-neutral-500"
              >
                <span className="flex h-11 w-8 items-center justify-center rounded-2xl bg-white/70">
                  <BackIcon size={18} />
                </span>
              </button>
              <button
                type="button"
                aria-label="다음 사람"
                onClick={() => onPick((i + 1) % people.length)}
                className="absolute right-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-neutral-500"
              >
                <span className="flex h-11 w-8 items-center justify-center rounded-2xl bg-white/70">
                  <NextIcon size={18} />
                </span>
              </button>
            </>
          )}
        </div>
      )}

      {note && (
        <p
          className="mt-3 w-full break-keep rounded-2xl px-3.5 py-2.5 text-center text-[13px] font-bold"
          style={{ background: colors.accentSoft, color: colors.accentDark }}
          role="status"
        >
          {compare ? `새 그림 — ${note}` : note}
        </p>
      )}

      {/* 늘 그대로 / 평소 옷 */}
      <div className="mt-3.5 flex w-full flex-col gap-2">
        <div className="flex items-center gap-2.5 text-sm font-semibold text-neutral-700">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: colors.accentSoft, color: colors.accentDark }}>
            <LockIcon />
          </span>
          <span className="break-keep">
            {/* 사진으로 그린 그림은 칩을 같이 보내지 않았다 — 예전에 골라 둔 칩이 남아 있어도 '사진을 보고'(2026-10-14) */}
            <b className="font-extrabold">늘 그대로</b> — {fromPhoto ? "사진을 보고 그렸어요" : sum.lock || "알아서 그렸어요"}
          </span>
        </div>
        <div className="flex items-center gap-2.5 text-sm font-semibold text-neutral-700">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
            <HangerIcon />
          </span>
          <span className="break-keep">
            <b className="font-extrabold">평소 옷</b> — {fromPhoto ? "사진을 보고 골랐어요" : sum.outfit || "알아서 골랐어요"}{" "}
            <span className="text-xs text-neutral-500">(동화마다 바뀔 수 있어요)</span>
          </span>
        </div>
      </div>

      {failed && pic && (
        <p className="mt-3 w-full break-keep rounded-2xl bg-rose-50 px-3.5 py-2.5 text-[13px] font-bold text-rose-700">
          {job?.message}
        </p>
      )}

      {/* 2열 칸은 폰에서 폭이 150px 안팎이다 — 버튼을 tight(여백 줄임·한 줄)로, 380px 밑에서는 아이콘을 숨긴다. */}
      {!compare && (
        <div className="mt-4 grid w-full grid-cols-2 items-start gap-3">
          <div className="flex flex-col items-center gap-2.5">
            {/* 사진이 거절됐으면(photo) 앞 그림이 있어도 '다시 고르기' — 같은 사진으로 다시 그리지 않는다. */}
            {failed && (!pic || job?.kind === "photo") ? (
              job?.kind === "insufficient" ? (
                <SoftButton tight onClick={onCharge}>
                  요금제 보기
                </SoftButton>
              ) : (
                <SoftButton tight onClick={() => onRetry(m.id)}>
                  {job?.kind === "photo" ? "다시 고르기" : "다시 해 볼게요"}
                </SoftButton>
              )
            ) : (
              <SoftButton tight onClick={() => onRedraw(m.id)} disabled={busy || !pic}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/func-remake.webp" alt="" aria-hidden className="h-6 w-6 max-[379px]:hidden" />
                다시 그리기
              </SoftButton>
            )}
            <span className="text-center text-xs font-bold text-neutral-500">{costText(cost, master, free)}</span>
          </div>
          {confirmed ? (
            <BigButton
              colors={colors}
              tight
              onClick={() => onPick((i + 1) % people.length)}
              disabled={people.length < 2}
            >
              다음 사람 →
            </BigButton>
          ) : (
            <BigButton colors={colors} tight onClick={() => onAccept(m.id, "draft")} disabled={!pending}>
              <span className="flex max-[379px]:hidden">
                <HeartIcon size={20} />
              </span>
              마음에 들어요
            </BigButton>
          )}
        </div>
      )}

      <p className="mt-3 break-keep text-center text-xs font-medium leading-normal text-neutral-500">
        여기서 고르신 모습을 기준으로 동화를 그려요.
        <br />
        사진처럼 똑같이가 아니라, 우리 가족 느낌으로 그려요.
      </p>
      {pendingCount >= 2 && (
        <button
          type="button"
          onClick={onAcceptAll}
          className="mt-0.5 min-h-11 px-3 text-sm font-extrabold"
          style={{ color: colors.accentDark }}
        >
          남은 가족 모두 마음에 들어요
        </button>
      )}
    </div>
  );
}

function Shadow() {
  return (
    <span
      aria-hidden
      className="absolute bottom-[15%] left-1/2 h-[4%] w-[33%] -translate-x-1/2 rounded-[50%]"
      style={{ background: "rgba(60,40,25,.18)" }}
    />
  );
}

function DrawingNow({ colors }: { colors: Colors }) {
  const pencil = useRef<HTMLImageElement>(null);
  useLoop(pencil, SCRIBBLE, 1600);
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
      <span className="relative flex h-24 w-24 items-center justify-center rounded-full bg-white shadow" style={{ boxShadow: `0 0 0 3px ${colors.accentSoft}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={pencil} src="/icons/func-edit.webp" alt="" aria-hidden className="h-14 w-14" />
      </span>
      <p className="text-sm font-extrabold" style={{ color: colors.accentDark }}>
        그리는 중… 1분쯤 걸려요
      </p>
    </div>
  );
}
