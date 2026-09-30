"use client";

/**
 * 사고 처리 확인창 — 환불 · 책 되살리기(+덮어쓰기/강제 확인) · 처리 끝.
 * 옛 관리실(app/admin/page.tsx 의 Dialogs)을 그대로 옮겼다(2026-09-30). 바뀐 것은 셋뿐이다:
 *  · api·say 는 겉틀(useAdmin)에서 받는다.
 *  · 처리 뒤 '전부 다시 읽기(refreshAll)' 대신 onDone — 부른 쪽이 목록·서랍·배지를 다시 읽는다.
 *  · 토큰 충전 창은 회원 화면에서만 열려서 GrantDialog.tsx 로 따로 뺐다.
 *
 * 지켜야 하는 것(옛 관리실과 같다): 환불은 아직 환불 안 된 첫 건을 미리 고르고, 사유 2~500자,
 * 잔액 전 → 후를 보여 준다. 되살리기 첫 부름은 늘 replace=false·force=false — DB 가 '이미 있음/진행 중'이라고
 * 할 때만 한 번 더 묻는다. 처리 중에는 Esc·바깥 누르기로 닫히지 않는다.
 */
import { useState } from "react";
import { parseRefundNote, type JobDetail } from "@/lib/admin";
import { Modal, ModalActions as Actions } from "../kit/overlay";
import { useAdmin } from "../shell/AdminContext";

export type CaseDialogState =
  | { kind: "refund"; detail: JobDetail }
  | { kind: "restore"; detail: JobDetail }
  | { kind: "restore-confirm"; detail: JobDetail; conflict: "exists" | "in_progress"; message: string; replace: boolean; force: boolean }
  | { kind: "resolve"; detail: JobDetail }
  | null;

export function CaseDialogs({
  dialog,
  setDialog,
  onDone,
  onRefunded,
}: {
  dialog: NonNullable<CaseDialogState>;
  setDialog: (d: CaseDialogState) => void;
  /** 처리가 끝난 뒤 — 부른 쪽이 목록·서랍을 다시 읽는다(화면이 짐작으로 고치지 않는다). */
  onDone: () => Promise<void> | void;
  onRefunded: (entry: string, note: string) => void;
}) {
  const { api, say } = useAdmin();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const firstPick =
    dialog.kind === "refund"
      ? dialog.detail.story && !dialog.detail.story.refundedAt
        ? "story"
        : dialog.detail.illustration && !dialog.detail.illustration.refundedAt
          ? "illustration"
          : null
      : null;
  const [which, setWhich] = useState<"story" | "illustration" | null>(firstPick);

  const close = () => setDialog(null);
  const errLine = error && <p className="rounded-lg bg-[#ffeff0] px-2.5 py-2 text-xs font-bold text-[#f04452]">{error}</p>;

  async function runRestore(d: JobDetail, replace: boolean, force: boolean) {
    setBusy(true);
    setError(null);
    const r = await api<{ result: { book_id: string; replaced: boolean } }>("/api/admin/restore", {
      job: d.jobId,
      replace,
      force,
    });
    setBusy(false);
    if (r.ok) {
      say(`${r.data.result?.replaced ? "덮어써서 " : ""}되살렸어요 → ${d.username ?? "고객"} 책장에 들어갔어요`);
      setDialog(null);
      await onDone();
      return;
    }
    // '이미 책이 있음' · '진행 중' 은 DB 문구를 그대로 보여 주고 한 번 더 묻는다.
    if (r.conflict === "exists" && !replace) {
      setDialog({ kind: "restore-confirm", detail: d, conflict: "exists", message: r.error, replace, force });
      return;
    }
    if (r.conflict === "in_progress" && !force) {
      setDialog({ kind: "restore-confirm", detail: d, conflict: "in_progress", message: r.error, replace, force });
      return;
    }
    setError(r.error);
  }

  if (dialog.kind === "refund") {
    const d = dialog.detail;
    const opts = [
      { key: "story" as const, label: "대본 값", p: d.story },
      { key: "illustration" as const, label: "그림 값", p: d.illustration },
    ].filter((o) => o.p);
    const picked = opts.find((o) => o.key === which)?.p ?? null;
    const noteOk = parseRefundNote(note);
    return (
      <Modal title="토큰 환불" onClose={close} busy={busy}>
        <p className="text-sm text-[#6b7684]">
          <b>{d.username}</b> 님의 토큰 결제 한 건을 되돌려요. 같은 건은 한 번만 환불돼요.
        </p>
        <div className="flex flex-col gap-1.5">
          {opts.map((o) => {
            const done = !!o.p?.refundedAt;
            return (
              <label
                key={o.key}
                className={`flex min-h-11 items-center gap-2 rounded-xl border border-[#f2f4f6] px-3 py-2.5 text-[13px] font-bold ${
                  done ? "cursor-not-allowed text-[#b0b8c1]" : "cursor-pointer"
                }`}
              >
                <input
                  type="radio"
                  name="which"
                  disabled={done}
                  checked={which === o.key}
                  onChange={() => setWhich(o.key)}
                />
                {o.label} <span className="tabular-nums">{o.p?.amount ?? "?"}토큰</span>
                {done && " — 이미 환불함"}
              </label>
            );
          })}
        </div>
        <label className="flex flex-col gap-1.5 text-xs font-bold text-[#8b95a1]">
          사유 (필수 · 고객에겐 안 보여요)
          <textarea
            rows={2}
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            placeholder="예: 저장 실패 컴플레인 — 되살림 후 환불"
            className="resize-y rounded-xl border border-[#e5e8eb] px-3 py-2 text-sm font-normal text-[#191f28]"
            autoFocus
          />
        </label>
        <div className="rounded-lg bg-[#f9fafb] px-2.5 py-2 text-xs text-[#6b7684]">
          {d.username} 잔액 <span className="tabular-nums">{d.tokens ?? "?"}</span> →{" "}
          <span className="tabular-nums">{d.tokens !== null && picked?.amount != null ? d.tokens + picked.amount : "?"}</span>토큰
        </div>
        {errLine}
        <Actions
          onCancel={close}
          okLabel="환불하기"
          okClass="bg-red-600"
          busy={busy}
          disabled={!picked || !noteOk.ok}
          onOk={async () => {
            if (!picked || !noteOk.ok) return;
            setBusy(true);
            setError(null);
            const r = await api<{ result: { amount: number; tokens: number } }>("/api/admin/refund", {
              entry: picked.entry,
              note: noteOk.value,
            });
            setBusy(false);
            if (!r.ok) return setError(r.error);
            onRefunded(picked.entry, noteOk.value);
            say(`환불했어요 · ${d.username} 잔액 +${r.data.result?.amount ?? picked.amount}토큰`);
            setDialog(null);
            await onDone();
          }}
        />
      </Modal>
    );
  }

  if (dialog.kind === "restore") {
    const d = dialog.detail;
    const art = d.manuscriptPages.filter((p) => p.art === "ok" || p.art === "external").length;
    const blank = d.manuscriptPages.length - art;
    return (
      <Modal title="책 되살리기" onClose={close} busy={busy}>
        <p className="text-sm text-[#6b7684]">
          원고로 책을 다시 만들어 <b>{d.username}</b> 님 책장에 넣어요. 주인은 이 기록에 적힌 고객으로 정해져요.
        </p>
        <div className="rounded-lg bg-[#f9fafb] px-2.5 py-2 text-xs text-[#6b7684]">
          책 id <span className="font-mono">{d.bookId ?? "새로 정해짐"}</span> · {d.manuscriptPages.length}쪽 · 그림 {art}장
          {blank > 0 && ` · 빈 쪽 ${blank}장은 되살린 뒤 다시 그리면 돼요`}
        </div>
        {errLine}
        <Actions onCancel={close} okLabel="되살리기" okClass="bg-[#3182f6]" busy={busy} onOk={() => void runRestore(d, false, false)} />
      </Modal>
    );
  }

  if (dialog.kind === "restore-confirm") {
    const d = dialog.detail;
    const exists = dialog.conflict === "exists";
    return (
      <Modal title={exists ? "이미 책이 있어요" : "아직 진행 중인 기록이에요"} onClose={close} busy={busy}>
        <p className="rounded-lg bg-[#fff4e0] px-2.5 py-2 text-xs font-bold text-[#c77700]">{dialog.message}</p>
        <p className="text-sm text-[#6b7684]">
          {exists
            ? "덮어쓰면 고객이 저장 뒤에 다시 그린 그림이 원고의 그림으로 바뀌어요. 책장에서 먼저 확인했나요?"
            : "앱이 아직 저장 중이면, 곧 앱의 저장이 도착해 되살린 책을 덮을 수 있어요. 고객이 창을 닫은 게 확실할 때만 진행하세요."}
        </p>
        {errLine}
        <Actions
          onCancel={close}
          okLabel={exists ? "덮어쓰기" : "강제로 되살리기"}
          okClass="bg-red-600"
          busy={busy}
          onOk={() => void runRestore(d, exists ? true : dialog.replace, exists ? dialog.force : true)}
        />
      </Modal>
    );
  }

  // 처리 끝
  const d = dialog.detail;
  return (
    <Modal title="처리 끝" onClose={close} busy={busy}>
      <p className="text-sm text-[#6b7684]">사고 목록에서 내려요. 환불이나 되살리기 없이 끝낼 때 써요.</p>
      <label className="flex flex-col gap-1.5 text-xs font-bold text-[#8b95a1]">
        메모 (선택 · 고객에겐 안 보여요)
        <textarea
          rows={2}
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
          placeholder="예: 고객과 통화 — 새로 만들기로 함"
          className="resize-y rounded-xl border border-[#e5e8eb] px-3 py-2 text-sm font-normal text-[#191f28]"
          autoFocus
        />
      </label>
      {errLine}
      <Actions
        onCancel={close}
        okLabel="처리 끝"
        okClass="bg-[#3182f6]"
        busy={busy}
        onOk={async () => {
          setBusy(true);
          setError(null);
          const body = d.jobId
            ? { job: d.jobId, note }
            : { entry: d.story?.entry ?? d.illustration?.entry ?? d.entryId, note };
          const r = await api<{ ok: true }>("/api/admin/resolve", body);
          setBusy(false);
          if (!r.ok) return setError(r.error);
          say("처리 끝으로 내렸어요");
          setDialog(null);
          await onDone();
        }}
      />
    </Modal>
  );
}
