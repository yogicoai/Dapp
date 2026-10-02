"use client";

/**
 * '공개 동화'(/admin/library)와 '크레딧 설정'(/admin/pricing)이 함께 쓰는 부품 —
 * 저장 막대(바뀌는 것 + 사유 + 확인 창) · 바꾼 이력 · '데이터베이스 준비 전' 알림.
 *
 * 두 화면은 같은 한 줄(app_offer_settings)을 바꾸지만 저마다 자기 칸만 보낸다 — 한쪽 저장이 다른 쪽 값을 덮지 않는다.
 * 규칙은 토큰 가격 화면과 같다: 바꾸는 사람은 회사 계정 하나, 왜 바꾸는지 적어야 저장된다.
 */
import { useState, type ReactNode } from "react";
import type { OfferLogRow, OfferPatch } from "@/lib/offer-settings";
import { Banner, Button, Card, CardTitle, Chip, ConfirmDialog, TimeText } from "@/components/admin/kit";
import { useAdmin } from "@/components/admin/shell/AdminContext";

export type ChangeLine = { key: string; label: string; from: string; to: string };

/** 막대·확인 창에 다 늘어놓지 않는다 — 책 40권을 한꺼번에 바꿔도 창이 화면을 덮지 않게 */
const LINES_SHOWN = 10;

export function OfferNotReady() {
  return (
    <Banner tone="warn" title="데이터베이스 준비 전이에요 — 지금은 기본값이 보여요">
      supabase-offer-settings.sql 을 Supabase SQL 편집기에서 한 번 돌리면 여기서 바꿀 수 있어요.
    </Banner>
  );
}

export function ReadOnlyNote() {
  return (
    <p className="rounded-xl bg-[#f2f4f6] px-4 py-3 text-[13px] font-bold text-[#6b7684]">
      이 계정에서는 값을 바꿀 수 없어요. 지금 값은 그대로 보실 수 있어요.
    </p>
  );
}

function ChangeList({ lines }: { lines: ChangeLine[] }) {
  const shown = lines.slice(0, LINES_SHOWN);
  return (
    <ul className="flex flex-col gap-1">
      {shown.map((c) => (
        <li key={c.key} className="flex items-center justify-between gap-3 text-[13px] font-medium text-[#6b7684]">
          <span className="min-w-0 truncate">{c.label}</span>
          <span className="shrink-0 font-bold tabular-nums text-[#191f28]">
            {c.from} <span className="text-[#b0b8c1]">→</span> <span className="text-[#3182f6]">{c.to}</span>
          </span>
        </li>
      ))}
      {lines.length > LINES_SHOWN ? (
        <li className="text-[13px] font-medium text-[#8b95a1]">그 밖에 {lines.length - LINES_SHOWN}개</li>
      ) : null}
    </ul>
  );
}

/**
 * 저장 막대 — 바꾼 것이 있을 때만 화면 아래에 붙는다. 사유는 여기서 적는다(필수).
 * 저장하면 onSaved(다시 읽기) — 새 값이 오면 편집기가 열쇠로 새로 그려져 고치던 칸·사유가 비워진다.
 */
export function OfferSaveBar({
  lines,
  patch,
  invalid,
  savedMessage,
  afterNote,
  onSaved,
  onReset,
}: {
  lines: ChangeLine[];
  patch: OfferPatch;
  /** 저장을 막는 까닭(값이 틀림) — 있으면 붉게 보이고 단추가 잠긴다 */
  invalid?: string | null;
  savedMessage: string;
  afterNote: ReactNode;
  onSaved: () => void;
  onReset: () => void;
}) {
  const { api, say } = useAdmin();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (lines.length === 0) return null;

  const save = async () => {
    setBusy(true);
    setError(null);
    const r = await api<{ ok: true; changed: number }>("/api/admin/offer", { patch, note: note.trim() });
    setBusy(false);
    if (!r.ok) {
      // 창은 닫지 않는다 — 무엇이 막혔는지 창 안에서 읽고 다시 할 수 있게.
      setError(r.error);
      return;
    }
    setConfirming(false);
    say(r.data.changed > 0 ? savedMessage : "바뀐 값이 없었어요");
    onSaved();
  };

  return (
    <>
      <div className="sticky bottom-[calc(12px+env(safe-area-inset-bottom))] z-20 rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(0,27,55,.10)] ring-1 ring-[#e5e8eb]">
        <p className="mb-2 text-[13px] font-bold text-[#4e5968]">바뀌는 것 {lines.length}개</p>
        <div className="mb-3 max-h-48 overflow-y-auto">
          <ChangeList lines={lines} />
        </div>
        {invalid ? (
          <p role="alert" className="mb-3 rounded-xl bg-[#ffeff0] px-4 py-3 text-[13px] font-bold text-[#f04452]">
            {invalid}
          </p>
        ) : null}
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-bold text-[#4e5968]">왜 바꾸나요? (필수)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 200))}
            placeholder="예: 10월 요금제 확정안대로"
            className="h-11 rounded-xl border border-[#d1d6db] bg-white px-3.5 text-[15px] font-medium text-[#191f28] outline-none placeholder:text-[#b0b8c1] focus:border-[#3182f6]"
          />
        </label>
        <div className="mt-2 text-[12px] font-medium leading-relaxed text-[#8b95a1]">{afterNote}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            tone="primary"
            disabled={busy || !!invalid || note.trim().length < 2}
            onClick={() => {
              setError(null);
              setConfirming(true);
            }}
          >
            이대로 바꾸기
          </Button>
          <Button
            tone="ghost"
            disabled={busy}
            onClick={() => {
              setNote("");
              onReset();
            }}
          >
            되돌리기
          </Button>
        </div>
      </div>

      {confirming ? (
        <ConfirmDialog
          title="이대로 바꿀까요?"
          confirmLabel="바꾸기"
          cancelLabel="그만두기"
          busy={busy}
          error={error}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void save()}
          body={<ChangeList lines={lines} />}
          extra={
            <p className="rounded-xl bg-[#f2f4f6] px-4 py-3 text-[13px] font-medium leading-relaxed text-[#6b7684]">
              사유 &ldquo;{note.trim()}&rdquo; 과 함께 이력에 남아요.
            </p>
          }
        />
      ) : null}
    </>
  );
}

export function OfferLogCard({ rows }: { rows: OfferLogRow[] }) {
  return (
    <Card>
      <CardTitle hint={rows.length ? `${rows.length}건` : "아직 없어요"}>바꾼 이력</CardTitle>
      {rows.length > 0 ? (
        <ul className="flex flex-col">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-1.5 border-b border-[#f2f4f6] py-3 last:border-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-sm font-bold text-[#191f28]">{r.label}</span>
                {r.note ? <span className="break-keep text-[13px] font-medium text-[#8b95a1]">{r.note}</span> : null}
                <span className="ml-auto flex items-center gap-2">
                  <Chip tone="gray">{r.by ?? "관리자"}</Chip>
                  <span className="text-[12px] font-medium text-[#8b95a1]">
                    <TimeText iso={r.at} />
                  </span>
                </span>
              </div>
              <ul className="flex flex-col gap-0.5">
                {r.lines.map((line, i) => (
                  <li key={i} className="break-keep text-[13px] font-medium tabular-nums text-[#4e5968]">
                    {line}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] font-medium text-[#8b95a1]">아직 바꾼 적이 없어요.</p>
      )}
    </Card>
  );
}
