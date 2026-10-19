"use client";

/**
 * 사고 상세 서랍 — 옛 관리실(app/admin/page.tsx 의 DetailPanel·PayRow·Block)을 그대로 옮겼다(2026-09-30).
 * 의견·오류 화면(사고 목록)과 회원 화면(만들기 기록)이 같은 서랍을 쓴다.
 *
 * 바뀐 것은 셋뿐이다:
 *  · api·시계·방금 한 환불(recentRefunds)은 겉틀(useAdmin)에서 받는다 — 회원 화면에서 환불하고
 *    의견·오류 화면으로 가도 사유·처리자가 보인다.
 *  · 열린 판은 주소(?job= / ?entry=, useCaseParam)가 정한다.
 *  · 처리 뒤 '전부 다시 읽기' 대신 onChanged(부른 쪽 목록) + 서랍 스스로 다시 읽기 + 메뉴 배지 다시 세기.
 *
 * 지키는 것(옛 관리실과 같다): 늦게 온 옛 응답을 버리는 번호(detailSeq)와 '지금 열린 판'(openRef) 확인,
 * 되살리기 막힘(restoreCheck), 열면 [닫기]에 초점, Esc 로 닫기(확인창이 떠 있으면 안 닫힘),
 * 믿는 그림 주소만 미리보기(no-referrer), 원고 90일 보관 안내, 실패 이유, 다른 책·지운 책 안내.
 * 크레딧으로 보상(2026-10-19 사장님 "사고가 발생했을 때 크레딧으로 제공 — 동화와 캐릭터 생성으로 나눠서"): 회원 상세의
 * '보상 크레딧'과 같은 창(GrantCreditDialog) — 사유 칸에 이 기록 id 를 미리 적어 둔다.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  formatWhenKo,
  minutesSince,
  refundLabel,
  restoreCheck,
  stageStates,
  STAGES,
  statusLabel,
  withRecentRefund,
  type JobDetail,
  type Payment,
} from "@/lib/admin";
import { useEscClose } from "@/lib/use-esc-close";
import { useScrollLock } from "@/lib/scroll-lock";
import { AdminLink } from "../kit/display";
import { GrantCreditDialog } from "../members/GrantCreditDialog";
import { useAdmin } from "../shell/AdminContext";
import { CaseDialogs, type CaseDialogState } from "./CaseDialogs";
import { KindChip, SEV_CHIP, STAGE_STYLE } from "./case-ui";
import type { CaseOpen } from "./useCaseParam";

export function CaseDrawer({
  open,
  onClose,
  onChanged,
  showCustomerLink = false,
}: {
  open: CaseOpen | null;
  /** 닫기 — 부른 쪽이 주소를 되돌리고, 서랍을 연 줄로 초점을 돌린다. */
  onClose: () => void;
  /** 처리가 끝났다 — 부른 쪽이 자기 목록을 다시 읽는다. 서랍은 스스로 다시 읽고, 겉틀은 배지를 다시 센다. */
  onChanged: () => void;
  /** 의견·오류 화면에서만 켠다 — 회원 화면은 이미 그 회원이다. */
  showCustomerLink?: boolean;
}) {
  if (!open) return null;
  // 판이 바뀌면 통째로 새로 만든다 — 앞 판의 상세·확인창이 새 판에 남지 않게.
  const key = open.jobId ? `job:${open.jobId}` : `entry:${open.entry}`;
  return <CasePanel key={key} o={open} onClose={onClose} onChanged={onChanged} showCustomerLink={showCustomerLink} />;
}

function CasePanel({
  o,
  onClose,
  onChanged,
  showCustomerLink,
}: {
  o: CaseOpen;
  onClose: () => void;
  onChanged: () => void;
  showCustomerLink: boolean;
}) {
  const { api, clock, touchClock, recentRefunds, rememberRefund, refreshBadges, me } = useAdmin();
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<CaseDialogState>(null);
  /** 크레딧으로 보상 — 이 기록의 회원에게 */
  const [credit, setCredit] = useState<JobDetail | null>(null);
  // 응답 순서 꼬임 막기 — 늦게 온 옛 응답이 새로 연 판을 덮어쓰지 않게 요청마다 번호를 붙인다.
  const detailSeq = useRef(0);
  // 지금 열린 판. 처리 뒤 다시 읽기는 누른 순간의 판을 들고 있어서, 그 사이 닫았으면 읽으면 안 된다.
  const openRef = useRef<CaseOpen | null>(null);

  const loadDetail = useCallback(
    async (target: CaseOpen) => {
      const same = (x: CaseOpen | null) => !!x && x.jobId === target.jobId && x.entry === target.entry;
      if (!same(openRef.current)) return; // 이미 닫았거나 다른 줄을 열었다
      const seq = ++detailSeq.current;
      const q = target.jobId ? `id=${target.jobId}` : `entry=${target.entry}`;
      const r = await api<JobDetail>(`/api/admin/job?${q}`);
      if (seq !== detailSeq.current || !same(openRef.current)) return;
      touchClock();
      if (r.ok) {
        setDetail(r.data);
        setDetailError(null);
      } else setDetailError(r.error);
    },
    [api, touchClock],
  );

  // 닫히면(판이 사라지면) 지금 열린 판을 비우고 번호를 올린다 — 날아오던 응답이 닫힌 판에 들어가지 않게.
  const forget = useCallback(() => {
    openRef.current = null;
    detailSeq.current++;
  }, []);
  useEffect(() => {
    openRef.current = o;
    // 다음 차례에 읽는다 — 이펙트 안에서 곧바로 상태를 바꾸지 않게(react-hooks 규칙, 설정 화면과 같은 방식).
    void Promise.resolve().then(() => loadDetail(o));
    return forget;
  }, [o, loadDetail, forget]);

  useEscClose(onClose, !dialog && !credit);
  useScrollLock();

  /** 무엇을 처리한 뒤엔 목록·상세·배지를 다시 읽는다 — 화면이 짐작으로 고치면 DB 와 어긋난다. */
  const refreshAll = useCallback(async () => {
    onChanged();
    refreshBadges();
    await loadDetail(o);
  }, [onChanged, refreshBadges, loadDetail, o]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-[rgba(0,23,51,.32)]" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="사고 상세"
        className="fixed inset-0 z-40 flex w-full flex-col bg-white shadow-[0_10px_30px_rgba(0,27,55,.10)] lg:left-auto lg:w-[520px]"
      >
        <DetailPanel
          detail={detail}
          error={detailError}
          now={clock}
          recentRefunds={recentRefunds}
          showCustomerLink={showCustomerLink}
          onClose={onClose}
          onRefund={(d) => setDialog({ kind: "refund", detail: d })}
          onRestore={(d) => setDialog({ kind: "restore", detail: d })}
          onResolve={(d) => setDialog({ kind: "resolve", detail: d })}
          onCredit={(d) => setCredit(d)}
        />
      </aside>
      {dialog && (
        <CaseDialogs
          // 확인창 종류가 바뀌면 입력·오류를 새로 시작한다(되살리기 → 덮어쓰기 확인은 다른 질문이다).
          key={dialog.kind}
          dialog={dialog}
          setDialog={setDialog}
          onDone={refreshAll}
          onRefunded={(entry, note) => rememberRefund(entry, { by: me.username || "마스터", note })}
        />
      )}
      {credit && (
        <GrantCreditDialog
          memberId={credit.member}
          username={credit.username ?? "이 회원"}
          initialKind="book"
          defaultNote={`사고 보상 — ${credit.title ?? "동화"}${credit.jobId ? ` (기록 ${credit.jobId.slice(0, 8)})` : ""}`}
          onClose={() => setCredit(null)}
          onDone={() => setCredit(null)}
        />
      )}
    </>
  );
}

/* ── 상세 판 ── */
function DetailPanel({
  detail: d,
  error,
  now,
  recentRefunds,
  showCustomerLink,
  onClose,
  onRefund,
  onRestore,
  onResolve,
  onCredit,
}: {
  detail: JobDetail | null;
  error: string | null;
  now: number;
  recentRefunds: ReadonlyMap<string, { by: string; note: string }>;
  showCustomerLink: boolean;
  onClose: () => void;
  onRefund: (d: JobDetail) => void;
  onRestore: (d: JobDetail) => void;
  onResolve: (d: JobDetail) => void;
  /** 크레딧으로 보상(동화 · 캐릭터 생성) */
  onCredit: (d: JobDetail) => void;
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const closeBtn = (
    <button
      ref={closeRef}
      type="button"
      onClick={onClose}
      className="min-h-10 shrink-0 rounded-lg border border-[#f2f4f6] px-2.5 py-1 text-sm font-bold text-[#6b7684]"
    >
      닫기
    </button>
  );

  if (!d) {
    return (
      <div className="flex flex-col gap-3 p-5 pt-[calc(20px+env(safe-area-inset-top))]">
        <div className="flex justify-end">{closeBtn}</div>
        <p className={`text-sm ${error ? "font-bold text-[#f04452]" : "text-[#b0b8c1]"}`}>{error ?? "상세를 읽는 중…"}</p>
      </div>
    );
  }

  const stuckMin = minutesSince(d.updatedAt, now);
  const check = restoreCheck({
    jobId: d.jobId,
    status: d.status,
    updatedAt: d.updatedAt,
    resolvedAt: d.resolvedAt,
    bookId: d.bookId,
    bookExists: d.bookExists,
    title: d.manuscriptTitle,
    pages: d.manuscriptPages,
    now,
  });
  const refundable = [d.story, d.illustration].some((p) => p && !p.refundedAt);
  const story = withRecentRefund(d.story, recentRefunds);
  const illustration = withRecentRefund(d.illustration, recentRefunds);
  const stages = stageStates({
    status: d.status,
    kinds: d.kinds,
    bookExists: d.bookExists,
    illustrationPaid: !!d.illustration,
    drawn: d.drawn,
    failureStages: d.failureStages,
  });

  return (
    <>
      <div className="flex flex-col gap-2 border-b border-[#f2f4f6] px-5 pb-3.5 pt-[calc(16px+env(safe-area-inset-top))]">
        <div className="flex items-start justify-between gap-2.5">
          <h2 className="text-lg font-bold tracking-tight">{d.title ?? (d.jobId ? "(제목 없음)" : "기록 없는 결제")}</h2>
          {closeBtn}
        </div>
        <div className="flex flex-wrap gap-1">
          {d.kinds.map((k) => (
            <KindChip key={k} kind={k} />
          ))}
          {d.resolvedAt && <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${SEV_CHIP.ok}`}>처리 끝</span>}
        </div>
        <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-[#8b95a1]">
          <span>
            고객 <b className="text-[#4e5968]">{d.username ?? "?"}</b>
            {showCustomerLink && d.member ? (
              <AdminLink
                href={`/admin/members/${encodeURIComponent(d.member)}`}
                className="ml-1.5 font-bold text-[#3182f6] underline-offset-2 hover:underline"
              >
                고객 보기 ›
              </AdminLink>
            ) : null}
          </span>
          <span>
            잔액 <b className="tabular-nums text-[#4e5968]">{d.tokens ?? "?"}토큰</b>
          </span>
          {d.bookId && (
            <span>
              책 <b className="font-mono text-[#4e5968]">{d.bookId}</b>
              {d.bookHidden && " (숨김)"}
            </span>
          )}
          <span>{formatWhenKo(d.updatedAt ?? d.createdAt, now)}</span>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-5 pb-5 pt-4">
        {d.status ? (
          <Block title="어디까지 갔나">
            <ol className="grid grid-cols-5 gap-1">
              {STAGES.map((s, i) => (
                <li key={s.key} className={`flex flex-col gap-1.5 text-xs font-bold ${STAGE_STYLE[stages[i]].text}`}>
                  <span className={`h-1.5 rounded ${STAGE_STYLE[stages[i]].bar}`} />
                  {s.label}
                </li>
              ))}
            </ol>
            <p className="mt-2.5 text-[13px] text-[#6b7684]">
              {statusLabel(d.status)}
              {d.pageCount ? (
                <>
                  {" · "}
                  {d.pageCount}쪽 중 <b>{d.drawn}장</b> 그림 · 못 그림 {d.drawFailed} · 못 올림 {d.uploadFailed}
                </>
              ) : null}
              {d.restoredAt && ` · ${formatWhenKo(d.restoredAt, now)} ${d.restoredBy ?? ""} 되살림`}
            </p>
            {d.error && <div className="mt-2 rounded-lg bg-[#ffeff0] px-2.5 py-2 text-xs text-[#f04452]">{d.error}</div>}
            {d.kinds.includes("stuck") && (
              <div className="mt-2 rounded-lg bg-[#fff4e0] px-2.5 py-2 text-xs text-[#c77700]">
                {stuckMin}분째 움직임이 없어요. 부모가 창을 닫았거나 서버가 멈춘 경우예요.
              </div>
            )}
          </Block>
        ) : (
          d.error && (
            <Block title="무슨 일인가">
              <div className="rounded-lg bg-[#ffeff0] px-2.5 py-2 text-xs text-[#f04452]">{d.error}</div>
              <p className="mt-2.5 text-[13px] text-[#6b7684]">
                결제는 됐는데 어느 만들기 기록에도 안 이어졌어요. 보통 저장과 기록 쓰기가 같은 이유(인터넷 끊김)로 함께 실패한
                경우예요.
              </p>
            </Block>
          )
        )}

        {d.kinds.includes("paid_other_book") && (
          <div className="rounded-lg bg-[#e8f3ff] px-2.5 py-2 text-xs text-[#1b64da]">
            결제 직후 이 고객이 <b>다른 책 {d.otherBooks}권</b>을 저장했어요. 환불 전에 고객 책장에서 그 책이 이 동화인지
            확인하세요.
          </div>
        )}
        {d.kinds.includes("deleted_after_save") && (
          <div className="rounded-lg bg-[#f2f4f6] px-2.5 py-2 text-xs text-[#6b7684]">
            책이 저장됐다가 지워졌어요. 환불 대상이 아니에요.
          </div>
        )}

        <Block title="토큰 결제">
          {d.story || d.illustration ? (
            <div className="flex flex-col overflow-hidden rounded-xl border border-[#f2f4f6]">
              {story && <PayRow what="대본 값" sub="줄거리로 대본을 쓸 때" p={story} />}
              {illustration && <PayRow what="그림 값" sub="그림을 붙일 때" p={illustration} />}
            </div>
          ) : (
            <p className="text-[13px] text-[#b0b8c1]">이 기록에 붙은 결제가 없어요(마스터가 만들었거나 대본 전에 멈춤).</p>
          )}
          {[story, illustration].map((p, i) =>
            p?.note ? (
              <p key={i} className="mt-2 text-[13px] text-[#6b7684]">
                {i === 0 ? "대본" : "그림"} 환불 사유: {p.note}
              </p>
            ) : null,
          )}
          {d.masterNote && <p className="mt-2 text-[13px] text-[#6b7684]">처리 메모: {d.masterNote}</p>}
          {d.resolvedAt && (
            <p className="mt-1 text-xs text-[#b0b8c1]">
              {formatWhenKo(d.resolvedAt, now)} {d.resolvedBy ?? ""} 처리 끝
            </p>
          )}
        </Block>

        {d.jobId && (
          <Block title={d.pagesFrom === "book" ? "책장에 있는 책" : "원고 · 되살리기 재료"}>
            {d.pages.length ? (
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
                {d.pages.map((p, i) => (
                  <div key={i} className="flex flex-col gap-1 text-[11px] text-[#8b95a1]">
                    {p.art === "ok" && p.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.image}
                        alt={`${i + 1}쪽 그림`}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="aspect-[4/3] w-full rounded-md bg-[#f2f4f6] object-cover"
                      />
                    ) : p.art === "external" ? (
                      <div
                        className="flex aspect-[4/3] items-center justify-center rounded-md border border-[#e5e8eb] bg-[#f9fafb] text-[10px] font-bold text-[#8b95a1]"
                        title="우리 그림 저장소가 아닌 주소라 열지 않았어요"
                      >
                        바깥 주소
                      </div>
                    ) : p.art === "embedded" ? (
                      <div className="flex aspect-[4/3] items-center justify-center rounded-md border border-yellow-500 bg-[repeating-linear-gradient(45deg,var(--color-yellow-50)_0_6px,var(--color-neutral-50)_6px_12px)] text-[10px] font-bold text-[#c77700]">
                        못 올림
                      </div>
                    ) : (
                      <div className="flex aspect-[4/3] items-center justify-center rounded-md border-[1.5px] border-dashed border-red-400 text-[10px] font-bold text-[#f04452]">
                        빈 쪽
                      </div>
                    )}
                    <span className="line-clamp-2 text-[#6b7684]">
                      {i + 1}. {p.text || "…"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-[#b0b8c1]">원고가 없어요 — 대본 전에 멈췄거나 90일이 지나 비워졌어요.</p>
            )}
            <p className="mt-2.5 text-[13px] text-[#8b95a1]">원고는 기록이 마지막으로 움직인 날부터 90일 보관돼요.</p>
          </Block>
        )}

        {d.failures.length > 0 && (
          <Block title="실패 이유">
            <ul className="flex flex-col gap-1.5 text-xs">
              {d.failures.map((f, i) => (
                <li key={i} className="grid grid-cols-[auto_auto_1fr] items-start gap-2 text-[#6b7684]">
                  <span className="font-bold text-[#191f28]">{f.where}</span>
                  <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${SEV_CHIP.plain}`}>{f.stage}</span>
                  <span className="break-all">{f.reason}</span>
                </li>
              ))}
            </ul>
          </Block>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-[#f2f4f6] bg-white px-5 py-3.5 pb-[calc(14px+env(safe-area-inset-bottom))]">
        {d.jobId && (
          <button
            type="button"
            disabled={!!check.blocked}
            onClick={() => onRestore(d)}
            className="min-h-11 rounded-xl bg-[#3182f6] px-3.5 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"
          >
            책 되살리기
          </button>
        )}
        <button
          type="button"
          disabled={!refundable}
          onClick={() => onRefund(d)}
          className="min-h-11 rounded-xl bg-red-600 px-3.5 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"
        >
          토큰 환불
        </button>
        {d.member && (
          <button
            type="button"
            onClick={() => onCredit(d)}
            className="min-h-11 rounded-xl border border-[#3182f6] px-3.5 py-2 text-sm font-bold text-[#3182f6]"
          >
            크레딧으로 보상
          </button>
        )}
        {d.bookExists && d.bookId && (
          <a
            href={`/book/${encodeURIComponent(d.bookId)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center rounded-xl border border-[#e5e8eb] px-3.5 py-2 text-sm font-bold text-[#191f28]"
          >
            책 열어 빈 쪽 다시 그리기
          </a>
        )}
        {!d.resolvedAt && (
          <button
            type="button"
            onClick={() => onResolve(d)}
            className="min-h-11 rounded-xl border border-[#e5e8eb] px-3.5 py-2 text-sm font-bold text-[#191f28]"
          >
            처리 끝
          </button>
        )}
        {d.jobId && (check.blocked || check.warn) && (
          <span className={`basis-full text-xs ${check.blocked ? "text-[#c77700]" : "text-[#8b95a1]"}`}>
            {check.blocked ?? check.warn}
          </span>
        )}
      </div>
    </>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2.5 text-xs font-bold tracking-wide text-[#b0b8c1]">{title}</h3>
      {children}
    </div>
  );
}

function PayRow({ what, sub, p }: { what: string; sub: string; p: Payment }) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-t border-[#f2f4f6] px-3 py-2.5 first:border-t-0">
      <span className="text-sm font-bold">
        {what}
        <small className="block text-xs font-medium text-[#b0b8c1]">{sub}</small>
      </span>
      <span className="font-bold tabular-nums">{p.amount ?? "?"}토큰</span>
      {p.refundedAt ? (
        <span
          className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${SEV_CHIP.ok}`}
          title={p.note ?? (p.byKnown ? "" : "환불 뒤 사고 목록에서 빠져 처리자·사유를 읽을 수 없어요")}
        >
          {refundLabel(p)}
        </span>
      ) : (
        <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${SEV_CHIP.crit}`}>환불 안 됨</span>
      )}
    </div>
  );
}
