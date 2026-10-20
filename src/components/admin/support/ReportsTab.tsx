"use client";

/**
 * 의견·오류 › 신고 탭 — 고객이 앱 안에서 신고한 AI 결과물(동화 쪽 · 가족 캐릭터 그림)을 보고 처리한다(2026-10-20).
 * 구글 플레이 'AI 생성 콘텐츠' 정책: 신고를 받는 것만이 아니라 확인하고 조치해야 한다 — 그래서 처리 상태를 남긴다.
 *
 * 처리: '처리 끝'(고치거나 지움) · '문제 없음' · '다시 열기'. 메모는 우리끼리만 본다(고객에게 안 보인다).
 * 처리 뒤엔 목록을 다시 읽는다(짐작으로 안 고침). '전체' 보기는 주소 ?rall=1.
 * 표가 아직 없으면(14번 SQL 전) 준비 전이라고만 알린다.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  REPORT_REASON_LABEL,
  REPORT_STATUS_LABEL,
  reportTargetLabel,
  type AdminReportRow,
  type AdminReportsResponse,
  type ReportStatus,
} from "@/lib/content-report";
import { memberHref } from "@/lib/admin-support";
import {
  AdminLink,
  Badge,
  Banner,
  Button,
  ChipGroup,
  EmptyState,
  ErrorState,
  Skeleton,
  TextInput,
  TimeText,
  useTabParam,
  type BadgeTone,
} from "@/components/admin/kit";
import { useAdmin } from "@/components/admin/shell/AdminContext";

const STATUS_TONE: Readonly<Record<ReportStatus, BadgeTone>> = { open: "red", resolved: "green", dismissed: "gray" };

export function ReportsTab({ mine }: { mine: boolean }) {
  const { api, say } = useAdmin();
  const [allParam, setAllParam] = useTabParam("rall", ["1"], "0");
  const onlyOpen = allParam !== "1";
  const [data, setData] = useState<AdminReportsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  /** 늦게 온 옛 응답을 버리는 번호 — '처리 전'·'전체'를 연달아 누를 때 */
  const seqRef = useRef(0);

  const load = useCallback(async () => {
    const seq = ++seqRef.current;
    const r = await api<AdminReportsResponse>(`/api/admin/reports?open=${onlyOpen ? "1" : "0"}${mine ? "&mine=1" : ""}`);
    if (seq !== seqRef.current) return;
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setError(null);
    setData(r.data);
  }, [api, onlyOpen, mine]);

  useEffect(() => {
    // 다음 차례에 읽는다 — 이펙트 안에서 곧바로 상태를 바꾸지 않게(의견 탭과 같은 방식)
    void Promise.resolve().then(load);
  }, [load]);

  async function act(row: AdminReportRow, status: ReportStatus | null) {
    const note = (notes[row.id] ?? "").trim();
    if (status === null && !note) return;
    setBusyId(row.id);
    const r = await api<{ ok: true }>("/api/admin/reports", { id: row.id, status, note: note || undefined });
    setBusyId(null);
    if (!r.ok) {
      say(r.error, "error");
      return;
    }
    say(status === null ? "메모를 남겼어요" : `${REPORT_STATUS_LABEL[status]}(으)로 바꿨어요`);
    setNotes((prev) => {
      const next = { ...prev };
      delete next[row.id];
      return next;
    });
    void load();
  }

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!data) return <Skeleton lines={4} />;
  if (!data.schemaReady) {
    return (
      <Banner tone="info" title="신고 받을 준비 전이에요">
        바탕화면 수파베이스-붙여넣기-1019 의 14번(AI결과물신고)을 Run 하면 고객이 보낸 신고가 여기에 모여요.
      </Banner>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ChipGroup
        label="신고 보기"
        value={onlyOpen ? "0" : "1"}
        onChange={setAllParam}
        options={[
          { value: "0", label: "처리 전", count: onlyOpen ? data.openCount : null },
          { value: "1", label: "전체" },
        ]}
      />
      {data.truncated ? (
        <p className="text-[13px] font-medium text-[#8b95a1]">최근 200건만 보여요.</p>
      ) : null}
      {data.rows.length === 0 ? (
        <EmptyState
          title={onlyOpen ? "처리할 신고가 없어요" : "받은 신고가 없어요"}
          body="고객이 책 읽기 화면이나 가족 캐릭터 메뉴에서 신고하면 여기에 보여요."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {data.rows.map((row) => {
            const href = memberHref(row.owner);
            const busy = busyId === row.id;
            return (
              <li key={row.id} className="flex flex-col gap-3 rounded-2xl bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={STATUS_TONE[row.status]}>{REPORT_STATUS_LABEL[row.status]}</Badge>
                  <span className="text-[15px] font-bold text-[#191f28]">{reportTargetLabel(row.kind, row.targetId, row.page)}</span>
                  <span className="text-[13px] font-medium text-[#8b95a1]">
                    <TimeText iso={row.createdAt} />
                  </span>
                </div>
                <div className="flex flex-col gap-1 text-[14px]">
                  <p className="font-bold text-[#333d4b]">{REPORT_REASON_LABEL[row.reason]}</p>
                  {row.detail ? <p className="whitespace-pre-wrap break-keep text-[#4e5968]">{row.detail}</p> : null}
                  <p className="text-[13px] text-[#8b95a1]">
                    대상 id <span className="font-mono">{row.targetId}</span> · 신고한 회원{" "}
                    {href ? (
                      <AdminLink href={href} className="font-bold text-[#3182f6] underline underline-offset-2">
                        {row.username ?? "회원"}
                      </AdminLink>
                    ) : (
                      <span className="font-bold">{row.username ?? "탈퇴한 회원"}</span>
                    )}
                  </p>
                  {row.note ? (
                    <p className="text-[13px] text-[#6b7684]">
                      메모: {row.note}
                      {row.handledBy ? ` — ${row.handledBy}` : ""}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <TextInput
                    id={`report-note-${row.id}`}
                    aria-label="내부 메모(고객에게 안 보여요)"
                    placeholder="내부 메모(선택) — 예: 3쪽 그림 다시 그려 바꿈"
                    maxLength={1000}
                    value={notes[row.id] ?? ""}
                    disabled={busy}
                    onChange={(e) => setNotes((prev) => ({ ...prev, [row.id]: e.target.value }))}
                  />
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    {row.status === "open" ? (
                      <>
                        <Button tone="primary" size="sm" disabled={busy} onClick={() => void act(row, "resolved")}>
                          처리 끝
                        </Button>
                        <Button size="sm" disabled={busy} onClick={() => void act(row, "dismissed")}>
                          문제 없음
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" disabled={busy} onClick={() => void act(row, "open")}>
                        다시 열기
                      </Button>
                    )}
                    <Button tone="ghost" size="sm" disabled={busy || !(notes[row.id] ?? "").trim()} onClick={() => void act(row, null)}>
                      메모만 남기기
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
