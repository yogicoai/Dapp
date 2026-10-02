"use client";

/**
 * 회원 지우기(탈퇴 처리) 확인 창 — 회원 화면 머리의 [회원 지우기](2026-10-02 사장님 지시).
 *
 * 되돌릴 수 없어서 두 번 막는다: ① 지울 회원 아이디를 그대로 따라 적어야 ② 사유(두 글자 이상)를 적어야 [지우기]가 켜진다.
 * 서버(DB 함수 master_delete_member)가 같은 것을 다시 보고, 누가·언제·왜를 남긴 뒤 지운다.
 * 무엇이 지워지고 무엇이 남는지를 누르기 전에 읽게 한다 — 결제 기록·cafe24 그림 파일은 남는다.
 */
import { useId, useState } from "react";
import { Modal, ModalActions } from "@/components/admin/kit";
import { useAdmin } from "@/components/admin/shell/AdminContext";

export function DeleteMemberDialog({
  memberId,
  username,
  books,
  onClose,
  onDeleted,
}: {
  memberId: string;
  username: string;
  /** 지금 동화 수 — 모르면 null */
  books: number | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { api, say } = useAdmin();
  const id = useId();
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ok = typed.trim() === username && note.trim().length >= 2;

  const remove = async () => {
    setBusy(true);
    setError(null);
    const r = await api<{ ok: true; username: string; books: number }>("/api/admin/member-delete", {
      id: memberId,
      username: typed.trim(),
      note: note.trim(),
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    say(`${r.data.username} 회원을 지웠어요`);
    onDeleted();
  };

  return (
    <Modal title={`${username} 회원 지우기`} onClose={onClose} busy={busy}>
      <div className="flex flex-col gap-2 rounded-xl bg-[#ffeff0] px-4 py-3 text-[13px] font-medium leading-relaxed text-[#b4232f]">
        <p className="font-bold">바로 지워지고 되돌릴 수 없어요.</p>
        <ul className="flex list-disc flex-col gap-0.5 pl-4">
          <li>계정 · 동화{books !== null ? ` ${books}권` : ""} · 가족 캐릭터 · 가족 목소리 · 토큰 장부 · 요금제가 함께 지워져요.</li>
          <li>결제·환불 기록은 법에 따라 5년 동안 남아요(회원 칸만 비워져요).</li>
          <li>cafe24 에 올린 그림 파일은 지워지지 않아요.</li>
        </ul>
        <p>시험 계정이나 본인이 지워 달라고 한 경우에 써요.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-name`} className="text-xs font-bold text-[#6b7684]">
          지울 회원의 아이디를 그대로 적어 주세요: <span className="font-mono text-[#191f28]">{username}</span>
        </label>
        <input
          id={`${id}-name`}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="h-11 rounded-xl border border-[#d1d6db] px-3 font-mono text-sm text-[#191f28] outline-none focus:border-[#f04452]"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-note`} className="text-xs font-bold text-[#6b7684]">
          왜 지우나요? (필수)
        </label>
        <textarea
          id={`${id}-note`}
          rows={2}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="예: 사장님이 만든 시험 계정"
          className="resize-y rounded-xl border border-[#d1d6db] px-3 py-2 text-sm font-normal text-[#191f28] outline-none placeholder:text-[#b0b8c1] focus:border-[#f04452]"
        />
      </div>

      {error ? <p className="rounded-lg bg-[#ffeff0] px-2.5 py-2 text-xs font-bold text-[#f04452]">{error}</p> : null}
      <ModalActions
        onCancel={onClose}
        cancelLabel="그만두기"
        okLabel="지우기"
        okClass="bg-[#f04452]"
        busy={busy}
        disabled={!ok}
        onOk={() => void remove()}
      />
    </Modal>
  );
}
