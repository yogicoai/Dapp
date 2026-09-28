"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * 동화 재료를 '한 장에 질문 하나'로 묻는 화면 — 오늘의 이야기·상상 이야기·감정 동화가 함께 쓴다.
 *
 * 2026-09-28 사장님: 질문(장소·누구랑·무슨 일·기분 칩…)이 한 화면에 쭉 나와 복잡하다, 최대한 심플하게.
 * 그래서 화면 배치만 바꿨다 — 질문·보기·재료(서버로 보내는 값)는 만들기 화면(create/page.tsx)이
 * 그대로 들고 있고, 여기서는 그 질문들을 한 장씩 넘겨 보여 주기만 한다.
 *
 * 한 장 = 진행 점 + (앞에서 고른 답 칩 줄) + 질문 한 줄 + 보기 칩 또는 글 칸 + 이전/다음.
 * - 하나만 고르는 칩: 누르면 0.25초 뒤 다음 장. 이미 고른 칩을 다시 누르면 해제하고 그 장에 머문다.
 *   holdOn 이 참인 보기(이름·친구 입력이 뜨는 동행)는 넘기지 않고 '다음' 버튼을 기다린다.
 * - 답이 없으면 '건너뛰기', 있으면 '다음 →'. (재료는 하나만 있어도 만들 수 있어서 모든 질문이 선택이다.)
 * - 마지막 장은 '이렇게 만들어요' 요약 + '다음 →'.
 */

export type FlowOption = { t: string; e?: string; icon?: string };

export type FlowQuestion = {
  id: string;
  /** 큰 글씨 질문 한 줄. */
  title: string;
  /** 지금 고른·적은 답(빈 문자열 = 아직 안 함). 위 답 칩 줄과 '다음/건너뛰기'를 가른다. */
  answer: string;
  /** 참이면 이 장은 건너뛴다(예: 갈래를 안 고르면 세부 이야기 장이 없다). */
  hidden?: boolean;
  options?: FlowOption[];
  /** 지금 골라진 보기(t). */
  value?: string;
  /** 보기를 눌렀을 때 — 같은 보기를 다시 누르면 해제하는 것은 부르는 쪽이 한다. */
  onPick?: (t: string) => void;
  /** 이 보기를 고르면 자동으로 넘기지 않는다(이름·성별·친구 입력이 뜨는 경우). */
  holdOn?: (t: string) => boolean;
  /** chips = 짧은 보기(폰 2열·넓으면 3열), wide = 문장 보기(늘 2열), cards = 그림 카드 3열. */
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

function OptionIcon({ o, big }: { o: FlowOption; big?: boolean }) {
  if (o.icon) {
    return big ? (
      <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={o.icon} alt="" className="h-14 w-14 object-contain" />
      </span>
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={o.icon} alt="" aria-hidden className="h-7 w-7 shrink-0 object-contain" />
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
  canFinish: boolean;
  accent: string;
  accentDark: string;
  accentSoft: string;
}) {
  const [pos, setPos] = useState<FlowPos>(() => resolvePos(questions, initial ?? firstOpen(questions)));
  const cur = resolvePos(questions, pos);

  // 자동 넘김 타이머가 0.25초 뒤에 읽을 '지금 값' — 그 사이 갈래를 고르면 세부 장이 새로 생긴다.
  const latestRef = useRef(questions);
  const curRef = useRef(cur);
  useEffect(() => {
    latestRef.current = questions;
    curRef.current = cur;
  });

  const timerRef = useRef<number | null>(null);
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
    const q = questions[i];
    const deselect = q.value === t;
    q.onPick?.(t);
    clearTimer();
    if (deselect || q.holdOn?.(t)) return;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (curRef.current !== i) return;
      go(nextAfter(latestRef.current, i));
    }, AUTO_NEXT_MS);
  }

  const visible = questions.map((q, i) => ({ q, i })).filter(({ q }) => !q.hidden);
  const dot = cur === "summary" ? visible.length : visible.findIndex((v) => v.i === cur);
  const answered = visible.filter(({ q, i }) => q.answer && i !== cur);
  const q = cur === "summary" ? null : questions[cur];

  const primaryStyle = { background: accent, color: "#fff", boxShadow: `0 6px 0 ${accentDark}` };
  const primaryClass =
    "min-h-11 max-w-full break-keep rounded-full px-6 py-3 text-base font-extrabold transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 sm:px-8 sm:text-lg";

  return (
    <div className="flex flex-col gap-4">
      {/* 진행 점 — 얼마나 남았는지. 요약 장까지 센다. */}
      <div className="flex items-center justify-center gap-1.5">
        {Array.from({ length: visible.length + 1 }, (_, k) => (
          <span
            key={k}
            aria-hidden
            className={`h-2 rounded-full transition-all motion-reduce:transition-none ${k === dot ? "w-5" : "w-2"} ${k > dot ? "bg-neutral-300" : ""}`}
            style={k <= dot ? { background: accent, opacity: k === dot ? 1 : 0.45 } : undefined}
          />
        ))}
        <span className="sr-only">
          {visible.length + 1}장 중 {dot + 1}장
        </span>
      </div>

      {/* 앞에서 고른 답 — 누르면 그 질문으로 돌아가 고친다. */}
      {answered.length > 0 && (
        <div className="flex flex-wrap justify-center gap-x-1.5">
          {answered.map(({ q: a, i }) => (
            <button
              key={a.id}
              type="button"
              onClick={() => go(i)}
              aria-label={`${a.title} ${a.answer} — 고치기`}
              className="flex min-h-11 items-center"
            >
              <span
                className="max-w-[11rem] truncate rounded-full px-3 py-1 text-xs font-bold text-neutral-700"
                style={{ background: accentSoft }}
              >
                {a.answer}
              </span>
            </button>
          ))}
        </div>
      )}

      <div key={String(cur)} className="flex flex-col gap-4 motion-safe:animate-[subtitle-in_0.25s_ease-out]">
        <h1
          ref={titleRef}
          tabIndex={-1}
          className="break-keep text-center text-2xl font-extrabold text-neutral-800 outline-none"
        >
          {q ? q.title : "이렇게 만들어요"}
        </h1>

        {q && q.options && q.options.length > 0 && (
          <div
            className={`grid ${
              q.layout === "cards"
                ? "grid-cols-3 gap-2.5"
                : q.layout === "wide"
                  ? "grid-cols-2 gap-2"
                  : "grid-cols-2 gap-2 sm:grid-cols-3"
            }`}
          >
            {q.options.map((o) => {
              const on = q.value === o.t;
              const i = cur as number;
              return q.layout === "cards" ? (
                <button
                  key={o.t}
                  type="button"
                  onClick={() => pick(i, o.t)}
                  aria-pressed={on}
                  style={on ? { background: accent } : undefined}
                  className={`flex flex-col items-center gap-1.5 rounded-2xl py-3 font-bold transition ${
                    on ? "text-white shadow" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                  }`}
                >
                  <OptionIcon o={o} big />
                  <span className="break-keep text-center text-[13px] leading-tight">{o.t}</span>
                </button>
              ) : (
                <button
                  key={o.t}
                  type="button"
                  onClick={() => pick(i, o.t)}
                  aria-pressed={on}
                  style={on ? { background: accent } : undefined}
                  className={`flex min-h-[52px] items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-[15px] font-bold leading-snug transition ${
                    on ? "text-white shadow" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                  }`}
                >
                  <OptionIcon o={o} />
                  <span className="min-w-0 break-keep">{o.t}</span>
                </button>
              );
            })}
          </div>
        )}

        {q?.children}

        {!q &&
          (summary ? (
            <p className="break-keep rounded-2xl bg-neutral-50 px-4 py-3 text-center text-base font-bold leading-relaxed text-neutral-500">
              {summary}
            </p>
          ) : (
            <p className="break-keep text-center text-sm font-bold text-neutral-400">
              아직 고른 게 없어요. 질문 하나만 골라도 만들 수 있어요.
            </p>
          ))}
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
            <button type="button" onClick={() => go(nextAfter(questions, cur as number))} style={primaryStyle} className={primaryClass}>
              다음 →
            </button>
          ) : (
            <button
              type="button"
              onClick={() => go(nextAfter(questions, cur as number))}
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
