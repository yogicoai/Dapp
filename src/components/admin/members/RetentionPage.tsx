"use client";

/**
 * 관리실 '탈퇴·삭제 보관함' — 회원이 지운 동화와 탈퇴한 회원을 90일 보관했다가 정리한다(2026-10-19, lib/retention).
 *
 * 줄마다 상태: 보관 중(정리까지 N일) · 정리할 때(90일 지남) · 정리함. [90일 지난 것 정리]를 누르면 서버(api/admin/retention)가
 * cafe24 폴더를 지우고 담아 둔 내용을 비운다. 한 번에 20줄까지 — 더 남으면 다시 누른다.
 * 되살리기는 없다(문의가 오면 담아 둔 내용을 보고 관리자가 처리한다).
 */
import { useState } from "react";
import { formatDateKo } from "@/lib/admin";
import { daysUntilPurge, RETENTION_DAYS, retentionState, type RetentionRow, type RetentionState } from "@/lib/retention";
import {
  AdminLink,
  Badge,
  Banner,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  PageHeader,
  Switch,
  useAdminQuery,
  useMineParam,
  type BadgeTone,
  type Column,
} from "@/components/admin/kit";
import { useAdmin } from "@/components/admin/shell/AdminContext";

type ListResponse = { schemaReady?: boolean; rows: RetentionRow[]; hidden?: number };
type PurgeResponse = { ok: boolean; purged: number; failed: number; codes: string[] };

const STATE_META: Record<RetentionState, { label: string; tone: BadgeTone }> = {
  kept: { label: "보관 중", tone: "blue" },
  due: { label: "정리할 때", tone: "amber" },
  purged: { label: "정리함", tone: "gray" },
};

export function RetentionPage() {
  const { api, say, clock } = useAdmin();
  // 관리자 계정(yogico·fe) 것은 기본으로 숨긴다 — '내 계정 것도 보기'를 켜면 함께(다른 관리 화면과 같은 규칙)
  const [mine, setMine] = useMineParam();
  const q = useAdminQuery<ListResponse>(`/api/admin/retention${mine ? "?mine=1" : ""}`, { keepOnChange: true });
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const now = new Date(clock); // 겉틀 시계 — 읽기에 성공할 때와 1분마다 옮긴다
  const rows = q.data?.rows ?? [];
  const dueCount = rows.filter((r) => retentionState(r, now) === "due").length;

  async function purge() {
    setBusy(true);
    setErr(null);
    const r = await api<PurgeResponse>("/api/admin/retention", { action: "purge" });
    setBusy(false);
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    setAsking(false);
    const d = r.data;
    say(
      d.failed > 0
        ? `${d.purged}건 정리 · ${d.failed}건은 파일을 못 지워 남겼어요(${d.codes.join(", ")}). 잠시 뒤 다시 눌러 주세요.`
        : d.purged > 0
          ? `${d.purged}건 정리했어요.`
          : "정리할 것이 없어요.",
      d.failed > 0 ? "error" : "info",
    );
    q.reload();
  }

  const columns: Column<RetentionRow>[] = [
    {
      key: "what",
      header: "무엇",
      mobile: "title",
      cell: (r) => (
        <span className="break-keep">
          {r.kind === "member" ? "회원" : "동화"} · {r.title ?? (r.purged_at ? "(정리함)" : "—")}
        </span>
      ),
    },
    {
      key: "who",
      header: "회원",
      cell: (r) =>
        r.member_id && !r.purged_at && r.kind === "book" && r.member_username ? (
          <AdminLink href={`/admin/members/${r.member_id}`} className="underline underline-offset-2">
            {r.member_username}
          </AdminLink>
        ) : (
          (r.member_username ?? "—")
        ),
    },
    { key: "reason", header: "까닭", cell: (r) => <span className="break-keep">{r.reason ?? "—"}</span> },
    { key: "at", header: "지운 날", cell: (r) => formatDateKo(r.created_at) },
    {
      key: "state",
      header: "상태",
      mobile: "badge",
      cell: (r) => {
        const s = retentionState(r, now);
        const meta = STATE_META[s];
        return (
          <span className="inline-flex items-center gap-1.5">
            <Badge tone={meta.tone}>{meta.label}</Badge>
            <span className="text-xs text-[#6b7684]">
              {s === "kept" ? `${daysUntilPurge(r.purge_after, now)}일 남음` : s === "purged" && r.purged_at ? formatDateKo(r.purged_at) : ""}
            </span>
          </span>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="탈퇴·삭제 보관함"
        description={`회원이 지운 동화와 탈퇴한 회원의 동화·가족 그림을 ${RETENTION_DAYS}일 보관해요. 그 사이 문의(다시 그리기·환불)를 처리하고, ${RETENTION_DAYS}일이 지나면 정리해요.`}
        meta={q.data?.schemaReady === false ? undefined : `정리할 때 ${dueCount}건`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Switch checked={mine} onChange={setMine} label="내 계정 것도 보기" />
            <AdminLink href="/admin/members" className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-bold text-[#4e5968] underline underline-offset-2">
              회원 목록
            </AdminLink>
            <Button tone="primary" onClick={() => setAsking(true)} disabled={dueCount === 0 || busy}>
              {RETENTION_DAYS}일 지난 것 정리
            </Button>
          </div>
        }
      />

      {q.data?.schemaReady === false ? (
        <Banner tone="warn" title="데이터베이스 준비 전이에요">
          Supabase SQL 편집기에서 supabase-withdrawal.sql 을 한 번 돌려 주세요. 그 전에는 회원 탈퇴도 되지 않아요.
        </Banner>
      ) : null}

      {!q.data && q.error ? (
        <ErrorState message={q.error} onRetry={q.reload} />
      ) : (
        <DataTable
          caption="탈퇴·삭제 보관함"
          columns={columns}
          rows={rows}
          rowKey={(r) => String(r.id)}
          loading={q.loading && !q.data}
          rowTone={(r) => (r.purged_at ? "muted" : null)}
          empty={<EmptyState icon="inbox" title="보관 중인 것이 없어요" body="회원이 동화를 지우거나 탈퇴하면 여기 보여요." />}
        />
      )}

      {asking ? (
        <ConfirmDialog
          title={`${RETENTION_DAYS}일 지난 것 정리`}
          body={
            <>
              {RETENTION_DAYS}일이 지난 {dueCount}건의 그림 파일(cafe24)을 지우고, 보관해 둔 내용을 비워요. <b>되돌릴 수 없어요.</b>
              <br />
              아직 다른 동화나 계정이 쓰는 폴더는 지우지 않아요. 한 번에 20건까지 정리해요.
            </>
          }
          confirmLabel="정리하기"
          tone="danger"
          busy={busy}
          error={err}
          onConfirm={() => void purge()}
          onCancel={() => {
            setAsking(false);
            setErr(null);
          }}
        />
      ) : null}
    </>
  );
}
