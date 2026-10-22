"use client";

/**
 * 관리실 › 혜택 코드 — 요기보 회원 혜택(공용 코드)·요기보 구매 고객 시리얼(사장님 2026-10-22 미팅).
 *
 *  · 공용 코드(예: YOGIBO) — 요기보 가입 + 마케팅 수신동의 고객에게 문자로 보낸다. 몇 명이 넣어도 되고 한 계정은 한 번.
 *    공용이라 퍼질 수 있어 기한을 둔다(전체 듣기는 미리 만든 낭독이라 손님이 늘어도 드는 돈이 거의 없다).
 *  · 시리얼 묶음 — 요기보 구매 고객에게 한 장씩(구매확정 뒤 보내기 권장). 12자리 난수, 한 장 한 번. 엑셀로 내려받아 요기보 팀에 넘긴다.
 *  · 코드 찾기 — "시리얼이 안 돼요" 문의: 어떤 코드인지, 누가 언제 썼는지.
 * 손님은 설정 › 혜택 코드나 링크(/code/코드)로 넣는다. 진짜 문지기는 DB 함수(supabase-promo-codes.sql).
 */
import { useId, useState } from "react";
import {
  Badge,
  Banner,
  Button,
  Card,
  CardTitle,
  CopyButton,
  EmptyState,
  ErrorState,
  Modal,
  ModalActions,
  PageHeader,
  PageSkeleton,
  Switch,
  TimeText,
  useAdminQuery,
} from "@/components/admin/kit";
import { useAdmin } from "@/components/admin/shell/AdminContext";
import {
  formatPromoCode,
  koDate,
  kstDayOf,
  promoBenefitShort,
  promoLinkOf,
  serialCsv,
  serialCsvName,
  SERIAL_BATCH_MAX,
  type PromoLookup,
  type PromoOverview,
  type SerialBatch,
  type SerialRow,
  type SharedPromo,
} from "@/lib/promo-codes";

type Overlay =
  | { kind: "create"; mode: "shared" | "serial" }
  | { kind: "editShared"; row: SharedPromo }
  | { kind: "editBatch"; batch: SerialBatch };

const INPUT =
  "h-11 w-full rounded-xl border border-[#d1d6db] bg-white px-3 text-sm font-bold text-[#191f28] outline-none placeholder:font-medium placeholder:text-[#b0b8c1] focus:border-[#3182f6]";
const LABEL = "text-xs font-bold text-[#6b7684]";

function origin(): string {
  return typeof window === "undefined" ? "" : window.location.origin;
}

function todayKst(plusDays = 0): string {
  return new Date(Date.now() + 9 * 3600_000 + plusDays * 86400_000).toISOString().slice(0, 10);
}

export function CodesPage() {
  const q = useAdminQuery<PromoOverview>("/api/admin/promo");
  const [overlay, setOverlay] = useState<Overlay | null>(null);

  if (!q.data && q.loading) return <PageSkeleton />;
  if (!q.data && q.error) return <ErrorState message={q.error} onRetry={q.reload} />;
  const data = q.data ?? { schemaReady: true, shared: [], batches: [] };
  const done = () => {
    setOverlay(null);
    q.reload();
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="혜택 코드"
        description="요기보 회원 혜택(공용 코드)과 요기보 구매 고객 시리얼을 만들고 관리해요. 손님은 설정 › 혜택 코드나 링크로 넣어요."
      />
      {!data.schemaReady && (
        <Banner tone="warn" title="데이터베이스 준비 전이에요">
          바탕화면 수파베이스 폴더의 18번 SQL(혜택 코드)을 새 쿼리로 추가해 Run 해 주세요. 그 뒤 이 화면에서 만들 수 있어요.
        </Banner>
      )}

      <Card>
        <CardTitle
          hint={
            <Button tone="primary" size="sm" disabled={!data.schemaReady} onClick={() => setOverlay({ kind: "create", mode: "shared" })}>
              공용 코드 만들기
            </Button>
          }
        >
          공용 코드
        </CardTitle>
        <p className="mb-3 break-keep text-[13px] font-medium text-[#6b7684]">
          모두 같은 코드 — 요기보에 가입하고 마케팅 수신에 동의한 고객에게 문자로 보내요. 한 계정은 한 번만 받아요. 코드가 퍼질 수 있어 기한을 두세요.
        </p>
        {data.shared.length === 0 ? (
          <EmptyState title="공용 코드가 없어요" body="18번 SQL 을 돌리면 YOGIBO(전체 듣기, 12월 31일까지)가 생겨요." icon="tag" />
        ) : (
          <ul className="flex flex-col divide-y divide-[#f2f4f6]">
            {data.shared.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <div className="flex min-w-0 flex-1 basis-64 flex-col gap-0.5">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[15px] font-bold tracking-wider text-[#191f28]">{s.code}</span>
                    {s.active ? <Badge tone="green">켜짐</Badge> : <Badge tone="gray">꺼짐</Badge>}
                  </p>
                  <p className="break-keep text-[13px] font-medium text-[#4e5968]">{s.label}</p>
                  <p className="break-keep text-[12px] font-medium text-[#8b95a1]">
                    {promoBenefitShort(s)} · 넣은 계정 {s.used.toLocaleString("ko-KR")} · {s.endsAt ? `${koDate(s.endsAt)}까지 넣기` : "넣는 기한 없음"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <CopyButton value={promoLinkOf(origin(), s.code)} label="링크 복사" />
                  <Button size="sm" onClick={() => setOverlay({ kind: "editShared", row: s })}>
                    고치기
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle
          hint={
            <Button tone="primary" size="sm" disabled={!data.schemaReady} onClick={() => setOverlay({ kind: "create", mode: "serial" })}>
              시리얼 만들기
            </Button>
          }
        >
          시리얼 묶음
        </CardTitle>
        <p className="mb-3 break-keep text-[13px] font-medium text-[#6b7684]">
          한 장에 한 번만 쓰는 12자리 난수 — 요기보 구매 고객에게 한 장씩 보내요. 주문 직후가 아니라 구매확정 뒤에 보내면 주문·취소를 반복해 모으는 걸 막을 수 있어요.
        </p>
        {data.batches.length === 0 ? (
          <EmptyState title="시리얼 묶음이 없어요" body="‘시리얼 만들기’로 요기보 구매 고객용 시리얼을 찍어요." icon="tag" />
        ) : (
          <ul className="flex flex-col divide-y divide-[#f2f4f6]">
            {data.batches.map((b) => (
              <BatchRow key={b.label} batch={b} onEdit={() => setOverlay({ kind: "editBatch", batch: b })} />
            ))}
          </ul>
        )}
      </Card>

      <LookupCard disabled={!data.schemaReady} />

      <p className="break-keep text-[12px] font-medium leading-relaxed text-[#8b95a1]">
        손님 링크: {origin()}/code/코드 · 틀린 코드는 한 계정에 한 시간 10번까지 · 동화 크레딧 1권으로 만들 수 있는 양은 서버가 묶어요(줄거리 8번, 그림 쪽수×2+10장, 이틀 안에 마무리).
        웹과 안드로이드 앱이 같은 화면을 써요.
      </p>

      {overlay?.kind === "create" && <CreateDialog mode={overlay.mode} onClose={() => setOverlay(null)} onDone={done} />}
      {overlay?.kind === "editShared" && <EditSharedDialog row={overlay.row} onClose={() => setOverlay(null)} onDone={done} />}
      {overlay?.kind === "editBatch" && <EditBatchDialog batch={overlay.batch} onClose={() => setOverlay(null)} onDone={done} />}
    </div>
  );
}

function BatchRow({ batch: b, onEdit }: { batch: SerialBatch; onEdit: () => void }) {
  const { api, say } = useAdmin();
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    const r = await api<{ codes: SerialRow[] }>(`/api/admin/promo/codes?label=${encodeURIComponent(b.label)}`);
    setBusy(false);
    if (!r.ok) {
      say(r.error);
      return;
    }
    const blob = new Blob([serialCsv(r.data.codes, origin())], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = serialCsvName(b.label, todayKst());
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    say(`시리얼 ${r.data.codes.length.toLocaleString("ko-KR")}장을 내려받았어요`);
  };
  const state = b.active === 0 ? <Badge tone="gray">꺼짐</Badge> : b.active < b.total ? <Badge tone="amber">일부 꺼짐</Badge> : <Badge tone="green">켜짐</Badge>;
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <div className="flex min-w-0 flex-1 basis-64 flex-col gap-0.5">
        <p className="flex flex-wrap items-center gap-2">
          <span className="break-keep text-[15px] font-bold text-[#191f28]">{b.label}</span>
          {state}
        </p>
        <p className="text-[13px] font-medium tabular-nums text-[#4e5968]">
          {b.used.toLocaleString("ko-KR")} / {b.total.toLocaleString("ko-KR")}장 사용 · {promoBenefitShort(b)}
        </p>
        <p className="break-keep text-[12px] font-medium text-[#8b95a1]">
          {b.endsAt ? `${koDate(b.endsAt)}까지 넣기` : "넣는 기한 없음"} · 만든 날 <TimeText iso={b.createdAt} mode="date" />
          {b.by ? ` · ${b.by}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button size="sm" disabled={busy} onClick={() => void download()}>
          {busy ? "만드는 중…" : "엑셀 내려받기"}
        </Button>
        <Button size="sm" onClick={onEdit}>
          고치기
        </Button>
      </div>
    </li>
  );
}

type LibraryMode = "none" | "until" | "days";

function CreateDialog({ mode, onClose, onDone }: { mode: "shared" | "serial"; onClose: () => void; onDone: () => void }) {
  const { api, say } = useAdmin();
  const id = useId();
  const shared = mode === "shared";
  const [code, setCode] = useState("");
  const [label, setLabel] = useState(shared ? "요기보 회원 혜택" : `요기보 구매 ${todayKst().slice(5).replace("-", "")}`);
  const [count, setCount] = useState(100);
  const [book, setBook] = useState(shared ? 0 : 1);
  const [draw, setDraw] = useState(shared ? 0 : 1);
  const [lib, setLib] = useState<LibraryMode>(shared ? "until" : "none");
  const [libUntil, setLibUntil] = useState("2026-12-31");
  const [libDays, setLibDays] = useState(30);
  const [endsAt, setEndsAt] = useState(shared ? "2026-12-31" : todayKst(365));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    const r = await api<{ ok: true; result: { count?: number; code?: string } }>("/api/admin/promo", {
      action: "create",
      mode,
      ...(shared ? { code } : { count }),
      label: label.trim(),
      bookCredits: book,
      drawCredits: draw,
      libraryUntil: lib === "until" ? libUntil : null,
      libraryDays: lib === "days" ? libDays : null,
      endsAt: endsAt || null,
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    say(shared ? `공용 코드 ${r.data.result.code ?? ""}를 만들었어요` : `시리얼 ${(r.data.result.count ?? count).toLocaleString("ko-KR")}장을 만들었어요 — 엑셀로 내려받을 수 있어요`);
    onDone();
  };

  const nothing = book === 0 && draw === 0 && lib === "none";
  return (
    <Modal title={shared ? "공용 코드 만들기" : "시리얼 만들기"} onClose={onClose} busy={busy}>
      {shared ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-code`} className={LABEL}>
            코드 (영문·숫자 4~24자)
          </label>
          <input id={`${id}-code`} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="예: YOGIBO2027" maxLength={30} className={`${INPUT} font-mono tracking-wider`} />
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-count`} className={LABEL}>
            몇 장 만들까요? (1~{SERIAL_BATCH_MAX.toLocaleString("ko-KR")})
          </label>
          <input
            id={`${id}-count`}
            type="number"
            min={1}
            max={SERIAL_BATCH_MAX}
            value={count}
            onChange={(e) => setCount(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
            className={`${INPUT} tabular-nums`}
          />
        </div>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-label`} className={LABEL}>
          이름 (손님 화면 ‘받은 혜택’에도 보여요{shared ? "" : " · 묶음을 가르는 이름"})
        </label>
        <input id={`${id}-label`} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} className={INPUT} />
      </div>

      <fieldset className="flex flex-col gap-2 rounded-xl bg-[#f9fafb] px-3.5 py-3">
        <legend className="mb-1 text-xs font-bold text-[#6b7684]">주는 혜택</legend>
        <div className="grid grid-cols-2 gap-2">
          <CountSelect id={`${id}-book`} label="동화 만들기" unit="권" value={book} onChange={setBook} />
          <CountSelect id={`${id}-draw`} label="캐릭터 그리기" unit="번" value={draw} onChange={setDraw} />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className={LABEL}>세계명작·전래동화 전체 듣기</span>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm font-bold text-[#333d4b]">
            {(["none", "until", "days"] as const).map((m) => (
              <label key={m} className="flex items-center gap-1.5">
                <input type="radio" name={`${id}-lib`} checked={lib === m} onChange={() => setLib(m)} className="h-4 w-4 accent-[#3182f6]" />
                {m === "none" ? "없음" : m === "until" ? "정한 날까지" : "넣은 날부터"}
              </label>
            ))}
          </div>
          {lib === "until" && (
            <input type="date" value={libUntil} onChange={(e) => setLibUntil(e.target.value)} aria-label="전체 듣기 끝나는 날" className={INPUT} />
          )}
          {lib === "days" && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={3650}
                value={libDays}
                onChange={(e) => setLibDays(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                aria-label="전체 듣기 일수"
                className={`${INPUT} w-28 tabular-nums`}
              />
              <span className="text-sm font-bold text-[#4e5968]">일 동안</span>
            </div>
          )}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-ends`} className={LABEL}>
          코드를 넣을 수 있는 마지막 날 (비우면 기한 없음)
        </label>
        <input id={`${id}-ends`} type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={INPUT} />
      </div>

      <p className="rounded-xl bg-[#f2f4f6] px-4 py-3 text-[12px] font-medium leading-relaxed text-[#6b7684]">
        {shared
          ? "모두 같은 코드라 받은 사람이 다른 곳에 올리면 누구나 넣을 수 있어요. 돈이 드는 혜택(동화 만들기)은 공용 코드보다 시리얼로 주세요."
          : `${count.toLocaleString("ko-KR")}장이 모두 쓰이면 동화 ${(count * book).toLocaleString("ko-KR")}권·캐릭터 그리기 ${(count * draw).toLocaleString("ko-KR")}번이에요. 한 장으로 만들 수 있는 양은 서버가 묶어요.`}
      </p>
      {error ? <p className="rounded-lg bg-[#ffeff0] px-2.5 py-2 text-xs font-bold text-[#f04452]">{error}</p> : null}
      <ModalActions
        onCancel={onClose}
        cancelLabel="그만두기"
        okLabel={shared ? "만들기" : `${count.toLocaleString("ko-KR")}장 만들기`}
        okClass="bg-[#3182f6]"
        busy={busy}
        disabled={nothing || label.trim().length < 2 || (shared ? code.replace(/[^A-Za-z0-9]/g, "").length < 4 : count < 1 || count > SERIAL_BATCH_MAX)}
        onOk={() => void save()}
      />
    </Modal>
  );
}

function CountSelect({ id, label, unit, value, onChange }: { id: string; label: string; unit: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(Number(e.target.value))} className={`${INPUT} tabular-nums`}>
        {Array.from({ length: 11 }, (_, n) => (
          <option key={n} value={n}>
            {n === 0 ? "없음" : `${n}${unit}`}
          </option>
        ))}
      </select>
    </div>
  );
}

function EditSharedDialog({ row, onClose, onDone }: { row: SharedPromo; onClose: () => void; onDone: () => void }) {
  const { api, say } = useAdmin();
  const id = useId();
  const [active, setActive] = useState(row.active);
  const [endsAt, setEndsAt] = useState(kstDayOf(row.endsAt));
  const [libUntil, setLibUntil] = useState(kstDayOf(row.libraryUntil));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    const r = await api("/api/admin/promo", {
      action: "update",
      mode: "shared",
      id: row.id,
      active,
      endsAt: endsAt || null,
      libraryUntil: row.libraryUntil ? libUntil || null : null,
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    say(`${row.code}를 고쳤어요`);
    onDone();
  };
  return (
    <Modal title={`${row.code} 고치기`} onClose={onClose} busy={busy}>
      <Switch checked={active} onChange={setActive} label="켜짐" description="끄면 새로 넣을 수 없어요. 이미 받은 혜택은 그대로예요." />
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-ends`} className={LABEL}>
          코드를 넣을 수 있는 마지막 날 (비우면 기한 없음)
        </label>
        <input id={`${id}-ends`} type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={INPUT} />
      </div>
      {row.libraryUntil && (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-lib`} className={LABEL}>
            전체 듣기 끝나는 날 — 바꾸면 이미 넣은 손님도 같이 바뀌어요
          </label>
          <input id={`${id}-lib`} type="date" value={libUntil} onChange={(e) => setLibUntil(e.target.value)} className={INPUT} />
        </div>
      )}
      {error ? <p className="rounded-lg bg-[#ffeff0] px-2.5 py-2 text-xs font-bold text-[#f04452]">{error}</p> : null}
      <ModalActions
        onCancel={onClose}
        cancelLabel="그만두기"
        okLabel="저장"
        okClass="bg-[#3182f6]"
        busy={busy}
        disabled={Boolean(row.libraryUntil) && !libUntil}
        onOk={() => void save()}
      />
    </Modal>
  );
}

function EditBatchDialog({ batch, onClose, onDone }: { batch: SerialBatch; onClose: () => void; onDone: () => void }) {
  const { api, say } = useAdmin();
  const id = useId();
  const [active, setActive] = useState(batch.active > 0);
  const [endsAt, setEndsAt] = useState(kstDayOf(batch.endsAt));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    const r = await api("/api/admin/promo", { action: "update", mode: "serial", label: batch.label, active, endsAt: endsAt || null });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    say(`‘${batch.label}’ 묶음을 고쳤어요`);
    onDone();
  };
  return (
    <Modal title={`‘${batch.label}’ 고치기`} onClose={onClose} busy={busy}>
      <Switch checked={active} onChange={setActive} label="켜짐" description="끄면 아직 안 쓴 시리얼은 넣을 수 없어요. 이미 쓴 시리얼의 혜택은 그대로예요." />
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-ends`} className={LABEL}>
          시리얼을 넣을 수 있는 마지막 날 (비우면 기한 없음)
        </label>
        <input id={`${id}-ends`} type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={INPUT} />
      </div>
      {error ? <p className="rounded-lg bg-[#ffeff0] px-2.5 py-2 text-xs font-bold text-[#f04452]">{error}</p> : null}
      <ModalActions onCancel={onClose} cancelLabel="그만두기" okLabel="저장" okClass="bg-[#3182f6]" busy={busy} onOk={() => void save()} />
    </Modal>
  );
}

function LookupCard({ disabled }: { disabled: boolean }) {
  const { api } = useAdmin();
  const id = useId();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PromoLookup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const find = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    const r = await api<{ lookup: PromoLookup | null }>(`/api/admin/promo/codes?lookup=${encodeURIComponent(code)}`);
    setBusy(false);
    if (!r.ok) setError(r.error);
    else setResult(r.data.lookup ?? { found: false });
  };
  return (
    <Card>
      <CardTitle>코드 찾기</CardTitle>
      <p className="mb-3 break-keep text-[13px] font-medium text-[#6b7684]">“시리얼이 안 돼요” 문의 때 — 어떤 코드인지, 누가 언제 썼는지 봐요.</p>
      <form onSubmit={find} className="flex gap-2">
        <label htmlFor={`${id}-q`} className="sr-only">
          찾을 코드
        </label>
        <input id={`${id}-q`} value={code} onChange={(e) => setCode(e.target.value)} placeholder="예: ABCD-EFGH-JKLM" className={`${INPUT} font-mono tracking-wider`} />
        <Button type="submit" disabled={disabled || busy || code.replace(/[^A-Za-z0-9]/g, "").length < 4}>
          {busy ? "찾는 중…" : "찾기"}
        </Button>
      </form>
      {error ? <p className="mt-2 rounded-lg bg-[#ffeff0] px-2.5 py-2 text-xs font-bold text-[#f04452]">{error}</p> : null}
      {result && !result.found && <p className="mt-3 text-sm font-bold text-[#4e5968]">그런 코드는 없어요 — 손님이 글자를 잘못 옮겨 적었을 수 있어요(0·O, 1·I 는 시리얼에 안 써요).</p>}
      {result?.found && (
        <div className="mt-3 flex flex-col gap-1 rounded-xl bg-[#f9fafb] px-4 py-3 text-sm">
          <p className="flex flex-wrap items-center gap-2 font-bold text-[#191f28]">
            <span className="font-mono tracking-wider">{formatPromoCode(result.code, result.kind)}</span>
            <Badge tone={result.kind === "serial" ? "blue" : "gray"}>{result.kind === "serial" ? "시리얼" : "공용 코드"}</Badge>
            {result.active ? <Badge tone="green">켜짐</Badge> : <Badge tone="gray">꺼짐</Badge>}
          </p>
          <p className="font-medium text-[#4e5968]">
            {result.label} · {result.maxUses ? `${result.used}/${result.maxUses}번 사용` : `${result.used.toLocaleString("ko-KR")}명 사용`} ·{" "}
            {result.endsAt ? `${koDate(result.endsAt)}까지 넣기` : "넣는 기한 없음"}
          </p>
          {result.uses.length > 0 && (
            <ul className="mt-1 flex flex-col gap-0.5 text-[13px] font-medium text-[#6b7684]">
              {result.uses.map((u) => (
                <li key={`${u.who}-${u.at}`}>
                  {u.who ?? "(탈퇴한 회원)"} · <TimeText iso={u.at} mode="datetime" />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
