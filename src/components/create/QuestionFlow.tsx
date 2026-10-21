"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { balancedCols, lonelyLast } from "@/lib/balanced-grid";
import { chipIcon } from "@/lib/chip-icons";

/**
 * 동화 재료를 '한 장에 질문 하나'로 묻는 화면 — 오늘의 이야기·상상 이야기·감정 동화가 함께 쓴다.
 *
 * 2026-09-28 사장님: 질문(장소·누구랑·무슨 일·기분 칩…)이 한 화면에 쭉 나와 복잡하다, 최대한 심플하게.
 * 그래서 화면 배치만 바꿨다 — 질문·보기·재료(서버로 보내는 값)는 만들기 화면(create/page.tsx)이
 * 그대로 들고 있고, 여기서는 그 질문들을 한 장씩 넘겨 보여 주기만 한다.
 *
 * 한 장 = 진행 점 + (앞에서 고른 답 칩 한 줄) + 질문 한 줄 + 보기 칩 또는 글 칸 + 이전/다음.
 * - 하나만 고르는 칩: 누르면 0.25초 뒤 다음 장. 이미 고른 칩을 다시 누르면 해제하고 그 장에 머문다.
 *   넘어가기 전 0.25초 안에 같은 칩을 또 누르면(톡톡 두 번) 해제하지 않고 무시한다.
 *   holdOn 이 참이면 넘기지 않고 '다음' 버튼을 기다린다(직접 적은 글이 있는 장, 글 칸을 여는 '직접 입력' 칩).
 * - 답이 없으면 '건너뛰기', 있으면 '다음 →'. (재료는 하나만 있어도 만들 수 있어서 모든 질문이 선택이다.)
 * - 마지막 장은 '이렇게 만들어요' 요약 + '다음 →'.
 */

/** 한 줄 칸 수 → 그리드 클래스(글자 그대로 둬야 Tailwind 가 찾는다) */
const GRID_COLS: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3" };

export type FlowOption = { t: string; e?: string; icon?: string };

export type FlowQuestion = {
  id: string;
  /** 큰 글씨 질문 한 줄. */
  title: string;
  /** 지금 고른·적은 답(빈 문자열 = 아직 안 함). 위 답 칩 줄과 '다음/건너뛰기'를 가른다. */
  answer: string;
  /** 참이면 이 장은 건너뛴다(예: 갈래를 안 고르면 세부 이야기 장이 없다). 진행 점은 그대로 센다. */
  hidden?: boolean;
  options?: FlowOption[];
  /** 지금 골라진 보기(t). */
  value?: string;
  /** 보기를 눌렀을 때 — 같은 보기를 다시 누르면 해제하는 것은 부르는 쪽이 한다. */
  onPick?: (t: string) => void;
  /** 참이면 이 보기를 골라도 자동으로 넘기지 않는다. 누르기 **전** 값으로 판단한다. */
  holdOn?: (t: string) => boolean;
  /** chips = 짧은 보기(3열, 그림 위·글 아래), wide = 문장 보기(1열 한 줄씩), cards = 그림 카드 3열. */
  layout?: "chips" | "wide" | "cards";
  /** 보기 아래 붙는 입력(글 칸·말로 입력·이름 칸 등). */
  children?: ReactNode;
};

export type FlowPos = number | "summary";

const AUTO_NEXT_MS = 250;

function nextAfter(qs: FlowQuestion[], i: number): FlowPos {
  for (let j = i + 1; j < qs.length; j++) if (!qs[j].hidden) return j;
  return "summary";
}

function prevBefore(qs: FlowQuestion[], from: FlowPos): FlowPos | null {
  const start = from === "summary" ? qs.length : from;
  for (let j = start - 1; j >= 0; j--) if (!qs[j].hidden) return j;
  return null;
}

/** 처음 보여 줄 장 — 아직 답이 없는 첫 질문, 다 채워져 있으면 요약. */
function firstOpen(qs: FlowQuestion[]): FlowPos {
  for (let j = 0; j < qs.length; j++) if (!qs[j].hidden && !qs[j].answer) return j;
  return "summary";
}

/** 가리키는 장이 없거나 숨었으면 그다음 보이는 장으로. */
function resolvePos(qs: FlowQuestion[], p: FlowPos): FlowPos {
  if (p === "summary") return p;
  if (p < 0 || p >= qs.length) return "summary";
  return qs[p].hidden ? nextAfter(qs, p) : p;
}

function OptionIcon({ o, size }: { o: FlowOption; size: "card" | "chip" | "line" }) {
  // 칩 표에 그림이 없으면 글자로 스티커를 찾는다(lib/chip-icons) — 없으면 아래 이모지로.
  const icon = o.icon ?? chipIcon(o.t);
  if (icon) {
    if (size === "card") {
      return (
        <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={icon} alt="" className="h-14 w-14 object-contain" />
        </span>
      );
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={icon} alt="" aria-hidden className="h-8 w-8 shrink-0 object-contain" />
    );
  }
  if (!o.e) return null;
  return (
    <span aria-hidden className="shrink-0 text-xl leading-none">
      {o.e}
    </span>
  );
}

export function QuestionFlow({
  questions,
  initial,
  onMove,
  onExit,
  onFinish,
  summary,
  emptyHint,
  canFinish,
  accent,
  accentDark,
  accentSoft,
}: {
  questions: FlowQuestion[];
  /** 처음 열 장. null 이면 아직 답이 없는 첫 질문(다 채워졌으면 요약). */
  initial: FlowPos | null;
  /** 장을 옮길 때마다 알린다 — 다음 단계에 갔다 돌아와도 그 자리에서 다시 열리게. */
  onMove: (p: FlowPos) => void;
  /** 첫 장에서 '← 이전' — 갈래 고르기로. */
  onExit: () => void;
  /** 요약 장의 '다음 →'. */
  onFinish: () => void;
  /** '이렇게 만들어요' 한 줄. 재료가 하나도 없으면 null. */
  summary: ReactNode;
  /** 재료가 없을 때 요약 장에 띄울 한 줄 — 무엇이 있어야 만들 수 있는지(갈래마다 다르다). */
  emptyHint: string;
  canFinish: boolean;
  accent: string;
  accentDark: string;
  accentSoft: string;
}) {
  const [pos, setPos] = useState<FlowPos>(() => resolvePos(questions, initial ?? firstOpen(questions)));
  const cur = resolvePos(questions, pos);
  const titleId = useId();

  // 자동 넘김 타이머가 0.25초 뒤에 읽을 '지금 값' — 그 사이 갈래·동행을 고르면 뒤 장이 생기거나 숨는다.
  const latestRef = useRef(questions);
  const curRef = useRef(cur);
  useEffect(() => {
    latestRef.current = questions;
    curRef.current = cur;
  });

  const timerRef = useRef<number | null>(null);
  // 넘어가기를 기다리는 동안 마지막으로 누른 보기 — 톡톡 두 번 누름을 '해제'로 읽지 않게.
  const pendingRef = useRef<{ i: number; t: string } | null>(null);
  useEffect(() => {
    const timer = timerRef;
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  // 장이 바뀌면 질문 줄로 초점을 옮긴다 — 화면 읽기 프로그램이 새 질문을 읽고, 폰에선 질문이 보이게 올라온다.
  const titleRef = useRef<HTMLHeadingElement>(null);
  const shownRef = useRef<FlowPos>(cur);
  useEffect(() => {
    if (shownRef.current === cur) return;
    shownRef.current = cur;
    titleRef.current?.focus();
  }, [cur]);

  function clearTimer() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingRef.current = null;
  }

  function go(p: FlowPos) {
    clearTimer();
    setPos(p);
    onMove(p);
  }

  function back() {
    const p = prevBefore(questions, cur);
    if (p === null) {
      clearTimer();
      onExit();
    } else {
      go(p);
    }
  }

  function pick(i: number, t: string) {
    // 넘어가기를 기다리는 사이 같은 보기를 또 눌렀다 — 해제가 아니라 두 번 누름이다.
    const pending = pendingRef.current;
    if (timerRef.current !== null && pending?.i === i && pending.t === t) return;
    const q = questions[i];
    const deselect = q.value === t;
    const hold = q.holdOn?.(t) ?? false;
    q.onPick?.(t);
    clearTimer();
    if (deselect || hold) return;
    pendingRef.current = { i, t };
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      pendingRef.current = null;
      if (curRef.current !== i) return;
      go(nextAfter(latestRef.current, i));
    }, AUTO_NEXT_MS);
  }

  // 진행 점은 숨은 장까지 늘 같은 수로 센다 — 도중에 점이 늘면 '더 남았다'로 보인다. 숨은 장은 지나간 점처럼 칠해진다.
  const total = questions.length + 1;
  const dot = cur === "summary" ? questions.length : cur;
  const answered = questions
    .map((q, i) => ({ q, i }))
    .filter(({ q, i }) => !q.hidden && q.answer && i !== cur);
  const q = cur === "summary" ? null : questions[cur];
  const qi = cur === "summary" ? -1 : cur;

  const primaryStyle = { background: accent, color: "#fff", boxShadow: `0 6px 0 ${accentDark}` };
  const primaryClass =
    "min-h-11 max-w-full break-keep rounded-full px-6 py-3 text-base font-extrabold transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 sm:px-8 sm:text-lg";

  return (
    <div className="flex flex-col gap-4">
      {/* 진행 점 — 얼마나 남았는지. 요약 장까지 센다. (화면 읽기용 'N장 중 M장'은 질문 줄 앞에 붙는다) */}
      <div aria-hidden className="flex items-center justify-center gap-1.5">
        {Array.from({ length: total }, (_, k) => (
          <span
            key={k}
            className={`h-2 rounded-full transition-all motion-reduce:transition-none ${k === dot ? "w-5" : "w-2"} ${k > dot ? "bg-neutral-300" : ""}`}
            style={k <= dot ? { background: accent, opacity: k === dot ? 1 : 0.45 } : undefined}
          />
        ))}
      </div>

      {/* 앞에서 고른 답 — 한 줄로 두고 넘치면 옆으로 민다. 누르면 그 질문으로 돌아가 고친다. */}
      {answered.length > 0 && (
        <div className="-my-1 overflow-x-auto [scrollbar-width:none]">
          <div className="mx-auto flex w-max gap-1.5">
            {answered.map(({ q: a, i }) => (
              <button
                key={a.id}
                type="button"
                onClick={() => go(i)}
                aria-label={`${a.title} ${a.answer} — 고치기`}
                className="flex min-h-11 min-w-11 items-center justify-center"
              >
                <span
                  className="max-w-[10rem] truncate rounded-full px-3 py-1 text-sm font-bold text-neutral-700"
                  style={{ background: accentSoft }}
                >
                  {a.answer}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div key={String(cur)} className="flex flex-col gap-4 motion-safe:animate-[subtitle-in_0.25s_ease-out]">
        <h1
          ref={titleRef}
          tabIndex={-1}
          className="break-keep text-center text-2xl font-extrabold text-neutral-800 outline-none"
        >
          <span className="sr-only">
            {total}장 중 {dot + 1}장.{" "}
          </span>
          <span id={titleId}>{q ? q.title : "이렇게 만들어요"}</span>
        </h1>

        {q && q.options && q.options.length > 0 && (
          <div
            role="group"
            aria-labelledby={titleId}
            // 한 줄 칸 수는 개수에 맞춰 고르게 — '3개 + 1개'는 '2개 + 2개'로(lib/balanced-grid, 사장님 10-21)
            className={`grid ${GRID_COLS[q.layout === "wide" ? 1 : balancedCols(q.options.length, 3)]} ${
              q.layout === "wide" ? "gap-1.5" : q.layout === "cards" ? "gap-2.5" : "gap-2"
            }`}
          >
            {q.options.map((o, oi, all) => {
              const on = q.value === o.t;
              const tone = on ? "text-white shadow" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200";
              const shape =
                q.layout === "cards"
                  ? "flex-col gap-1.5 py-3"
                  : q.layout === "wide"
                    ? "min-h-11 gap-2.5 px-4 py-2 text-left text-[15px] leading-snug"
                    : "min-h-[52px] flex-col justify-center gap-0.5 px-1 py-1.5 text-sm leading-tight";
              return (
                <button
                  key={o.t}
                  type="button"
                  onClick={() => pick(qi, o.t)}
                  aria-pressed={on}
                  style={on ? { background: accent } : undefined}
                  className={`flex items-center rounded-2xl font-bold transition ${shape} ${tone} ${
                    // 어떻게 나눠도 하나가 홀로 남으면(7개 등) 그 하나는 가운데 칸에
                    q.layout !== "wide" && oi === all.length - 1 && lonelyLast(all.length, balancedCols(all.length, 3)) ? "col-start-2" : ""
                  }`}
                >
                  <OptionIcon o={o} size={q.layout === "cards" ? "card" : q.layout === "wide" ? "line" : "chip"} />
                  <span
                    className={`min-w-0 break-keep ${q.layout === "wide" ? "" : "text-center"} ${
                      q.layout === "cards" ? "text-[13px] leading-tight" : ""
                    }`}
                  >
                    {o.t}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {q?.children}

        {!q && (
          <p
            className={`break-keep text-center ${
              summary
                ? "rounded-2xl bg-neutral-50 px-4 py-3 text-base font-bold leading-relaxed text-neutral-500"
                : "text-sm font-bold text-neutral-400"
            }`}
          >
            {summary || emptyHint}
          </p>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={back}
          className="min-h-11 rounded-full bg-white px-5 text-sm font-extrabold text-neutral-600 shadow"
        >
          ← 이전
        </button>
        {q ? (
          q.answer ? (
            <button type="button" onClick={() => go(nextAfter(questions, qi))} style={primaryStyle} className={primaryClass}>
              다음 →
            </button>
          ) : (
            <button
              type="button"
              onClick={() => go(nextAfter(questions, qi))}
              className="min-h-11 rounded-full px-4 text-sm font-bold text-neutral-500 hover:text-neutral-700"
            >
              건너뛰기
            </button>
          )
        ) : (
          <button
            type="button"
            disabled={!canFinish}
            onClick={() => {
              clearTimer();
              onMove("summary");
              onFinish();
            }}
            style={primaryStyle}
            className={primaryClass}
          >
            다음 →
          </button>
        )}
      </div>
    </div>
  );
}
