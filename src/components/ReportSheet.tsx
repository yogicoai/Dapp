"use client";

/**
 * AI 결과물 신고 시트 — 책 읽기 화면(쪽마다)과 가족 캐릭터 메뉴에서 연다(2026-10-20, 구글 플레이 AI 콘텐츠 정책).
 * 까닭을 고르고(필수) 자세히 적어(선택) 보낸다. 신고는 운영자만 본다(게시판과 다르다).
 * 로그인하지 않았으면 로그인 안내와 고객센터 이메일을 보여 준다 — 비회원이 듣는 무료 동화도 알릴 길이 있게.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { Sheet } from "@/components/family/Sheet";
import { BigButton } from "@/components/family/ui";
import { loadSession } from "@/lib/auth";
import {
  REPORT_DETAIL_MAX,
  REPORT_FAILURE_TEXT,
  REPORT_REASON_LABEL,
  checkReportInput,
  reportReasons,
  type ReportFailure,
  type ReportKind,
  type ReportReason,
} from "@/lib/content-report";
import { submitContentReport } from "@/lib/content-report-client";
import { useSiteInfo } from "@/lib/site-info-client";

type Phase = "check" | "guest" | "form" | "sending" | "done";

export function ReportSheet({
  kind,
  targetId,
  page = null,
  targetLabel,
  onClose,
}: {
  kind: ReportKind;
  targetId: string;
  page?: number | null;
  /** 시트 머리에 보일 이름 — "이 동화 4쪽" · "엄마 캐릭터 그림" */
  targetLabel: string;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const site = useSiteInfo();
  const email = site.business.email;
  const [phase, setPhase] = useState<Phase>("check");
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState("");
  const [failure, setFailure] = useState<ReportFailure | null>(null);
  const [duplicate, setDuplicate] = useState(false);

  useEffect(() => {
    let alive = true;
    loadSession()
      .then((s) => {
        if (alive) setPhase(s.uid ? "form" : "guest");
      })
      .catch(() => {
        if (alive) setPhase("guest");
      });
    return () => {
      alive = false;
    };
  }, []);

  async function send() {
    const checked = checkReportInput({ kind, targetId, page, reason, detail });
    if (!checked.ok) {
      setFailure("invalid");
      return;
    }
    setFailure(null);
    setPhase("sending");
    const r = await submitContentReport(checked.value);
    if (r.ok) {
      setDuplicate(r.duplicate);
      setPhase("done");
      return;
    }
    setFailure(r.reason);
    setPhase(r.reason === "login" ? "guest" : "form");
  }

  const emailLine = email ? (
    <p className="mt-2 break-keep text-center text-[13px] font-medium leading-relaxed text-neutral-500">
      고객센터 이메일: <span className="select-all font-bold text-neutral-700">{email}</span>
    </p>
  ) : null;

  return (
    <Sheet onClose={onClose} label="신고하기" dismissible={phase !== "sending"}>
      <div className="mt-[18px] flex w-full flex-col">
        <h2 className="break-keep text-center text-[21px] font-extrabold text-neutral-800">
          {phase === "done" ? "신고를 받았어요" : "신고하기"}
        </h2>

        {phase === "check" ? (
          <p className="my-8 text-center text-sm font-bold text-neutral-400" role="status">
            확인하고 있어요…
          </p>
        ) : null}

        {phase === "guest" ? (
          <div className="mt-3 flex flex-col items-center gap-3">
            <p className="break-keep text-center text-[14px] font-medium leading-relaxed text-neutral-600">
              {targetLabel}에 문제가 있나요? 로그인하면 바로 신고할 수 있어요.
            </p>
            <Link
              href="/login"
              className="inline-flex min-h-12 w-full items-center justify-center rounded-full px-5 text-[15px] font-extrabold text-white"
              style={{ background: colors.accent }}
            >
              로그인하기
            </Link>
            <p className="break-keep text-center text-[13px] font-medium text-neutral-500">로그인 없이 알리려면 이메일로 보내 주세요.</p>
            {emailLine}
          </div>
        ) : null}

        {phase === "form" || phase === "sending" ? (
          <form
            className="mt-2 flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (reason && phase === "form") void send();
            }}
          >
            <p className="break-keep text-center text-[14px] font-medium text-neutral-500">{targetLabel}에서 무엇이 문제인가요?</p>
            <fieldset className="flex flex-col gap-1.5">
              <legend className="sr-only">신고 까닭</legend>
              {reportReasons(kind).map((k) => {
                const on = reason === k;
                return (
                  <label
                    key={k}
                    className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl px-4 py-2.5 text-[15px] font-bold transition ${
                      on ? "text-neutral-800" : "bg-neutral-50 text-neutral-600 shadow-[inset_0_0_0_1px_#f0ede8]"
                    }`}
                    style={on ? { background: colors.accentSoft, boxShadow: `inset 0 0 0 2px ${colors.accent}` } : undefined}
                  >
                    <input
                      type="radio"
                      name="report-reason"
                      value={k}
                      checked={on}
                      disabled={phase === "sending"}
                      onChange={() => setReason(k)}
                      className="h-5 w-5 shrink-0"
                      style={{ accentColor: colors.accentDark }}
                    />
                    <span className="break-keep">{REPORT_REASON_LABEL[k]}</span>
                  </label>
                );
              })}
            </fieldset>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-bold text-neutral-500">자세히 적어 주세요 (선택)</span>
              <textarea
                id="report-detail"
                value={detail}
                maxLength={REPORT_DETAIL_MAX}
                disabled={phase === "sending"}
                onChange={(e) => setDetail(e.target.value)}
                rows={3}
                className="w-full resize-none rounded-2xl bg-neutral-50 px-4 py-3 text-[15px] font-medium text-neutral-800 shadow-[inset_0_0_0_1px_#f0ede8] outline-none focus:shadow-[inset_0_0_0_2px_#a3a3a3]"
                placeholder="예: 3쪽 그림에서 손가락이 이상하게 그려졌어요"
              />
              <span className="self-end text-[11px] font-semibold tabular-nums text-neutral-400">
                {detail.length}/{REPORT_DETAIL_MAX}
              </span>
            </label>
            {failure ? (
              <p role="alert" className="break-keep text-center text-[13px] font-bold text-red-600">
                {REPORT_FAILURE_TEXT[failure]}
              </p>
            ) : null}
            {failure === "limit" || failure === "unavailable" ? emailLine : null}
            <BigButton colors={colors} type="submit" disabled={!reason || phase === "sending"}>
              {phase === "sending" ? "보내는 중…" : "신고 보내기"}
            </BigButton>
            <p className="break-keep text-center text-[12px] font-medium leading-relaxed text-neutral-400">
              신고는 운영자만 봐요. 확인한 뒤 고치거나 지울게요.
            </p>
          </form>
        ) : null}

        {phase === "done" ? (
          <div className="mt-3 flex flex-col items-center gap-4">
            <p className="break-keep text-center text-[14px] font-medium leading-relaxed text-neutral-600">
              {duplicate ? "조금 전에 같은 신고를 받았어요. " : ""}확인한 뒤 고치거나 지울게요. 알려 주셔서 고마워요.
            </p>
            <BigButton colors={colors} type="button" onClick={onClose}>
              닫기
            </BigButton>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
