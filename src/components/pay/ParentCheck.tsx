"use client";

/**
 * 어른 확인 — 결제하기와 (가짜) 결제 처리 사이에 반드시 끼운다. 아이가 모르고 결제하지 않도록.
 * 두 자리 × 한 자리 곱셈(12~19 × 3~9). 4~7세는 풀기 어렵고 화면 읽기 사용자도 풀 수 있다.
 * 길게 누르기는 쓰지 않는다 — 아이도 쉽게 알아내고, 손이 불편한 분께는 오히려 어렵다.
 * 몇 번을 틀려도 막지 않고 새 문제만 낸다(문제는 부르는 쪽이 이벤트 안에서 만든다).
 */

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Sheet } from "@/components/family/Sheet";
import { BigButton } from "@/components/family/ui";
import { checkParentAnswer, type ParentQ } from "@/lib/pay-demo";
import { FOCUS, type PayColors } from "./pay-ui";

export function ParentCheck({
  colors,
  question,
  onPass,
  onWrong,
  onClose,
}: {
  colors: PayColors;
  question: ParentQ;
  onPass: () => void;
  /** 틀렸을 때 — 부르는 쪽이 새 문제를 낸다 */
  onWrong: () => void;
  onClose: () => void;
}) {
  const [answer, setAnswer] = useState("");
  const [wrong, setWrong] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // 시트가 먼저 제 판에 초점을 옮긴 뒤(자식 효과가 먼저 돈다) 입력칸으로 가져온다.
  useEffect(() => {
    input.current?.focus();
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!answer.trim()) return;
    if (checkParentAnswer(question, answer)) {
      onPass();
      return;
    }
    setWrong(true);
    setAnswer("");
    onWrong();
    input.current?.focus();
  }

  return (
    <Sheet onClose={onClose} label="어른 확인">
      <form onSubmit={submit} noValidate className="flex w-full flex-col items-center">
        <h2 className="mt-[18px] text-center text-[21px] font-extrabold text-neutral-800">어른 확인이 필요해요</h2>
        <p className="mt-1 break-keep text-center text-[13px] font-medium text-neutral-500">
          아이가 모르고 결제하지 않도록, 간단한 곱셈을 풀어 주세요.
        </p>

        <div className="mt-5 flex items-center justify-center gap-3">
          <span aria-hidden className="text-[26px] font-extrabold tabular-nums text-neutral-800">
            {question.a} × {question.b} =
          </span>
          <label htmlFor="parent-answer" className="sr-only">
            {question.a} 곱하기 {question.b}의 답
          </label>
          <input
            ref={input}
            id="parent-answer"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={3}
            autoComplete="off"
            value={answer}
            onChange={(e) => setAnswer(e.target.value.replace(/[^\d\s]/g, ""))}
            aria-invalid={wrong || undefined}
            aria-describedby={wrong ? "parent-wrong" : undefined}
            className={`h-14 w-24 rounded-2xl bg-stone-50 text-center text-[26px] font-extrabold tabular-nums text-neutral-800 shadow-[inset_0_0_0_2px_#e7e2da] ${FOCUS}`}
          />
        </div>

        <p id="parent-wrong" role="alert" className="mt-2 min-h-5 break-keep text-center text-sm font-extrabold text-rose-600">
          {wrong ? "답이 달라요. 새 문제를 풀어 주세요." : ""}
        </p>

        <div className="mt-3 w-full">
          <BigButton type="submit" colors={colors} disabled={!answer.trim()}>
            확인
          </BigButton>
        </div>
      </form>
      <button type="button" onClick={onClose} className={`mt-3 min-h-11 rounded-full px-3.5 text-sm font-extrabold text-neutral-600 ${FOCUS}`}>
        다시 볼게요
      </button>
    </Sheet>
  );
}
