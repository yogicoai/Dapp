"use client";

/**
 * 관리실 › 혜택·이벤트 관리 — 요기보 회원 혜택(공용 코드)·요기보 구매 고객 시리얼(사장님 2026-10-22 "혜택 또는 이벤트 관리 이런 식으로
 * 잡고 거기서 설정하고 해당 혜택 사용한 고객 리스트까지 나오게 … 그래야 관리가 될 듯").
 *
 * 이벤트 하나 = 공용 코드 하나(모두 같은 코드, 예: YOGIBO) 또는 시리얼 묶음 하나(한 사람에 한 장, 12자리 난수).
 *  · 위: 숫자(진행 중 · 혜택 받은 고객 · 최근 7일 · 시리얼 사용)
 *  · 목록: 이벤트마다 [고객 목록](옆 창 — 검색·50명씩·엑셀, 아이디를 누르면 회원 화면) · [고치기] · 시리얼은 [시리얼 엑셀]
 *  · 코드 찾기: "시리얼이 안 돼요" 문의 — 누가 언제 썼는지, 그 한 장만 끄고 켜기(새어 나간 시리얼 · 취소된 주문)
 * 손님은 설정 › 혜택 코드나 링크(/code/코드)로 넣는다. 진짜 문지기는 DB 함수(18번·19번 SQL).
 */
import { useId, useState } from "react";
import {
  AdminLink,
  Badge,
  Banner,
  Button,
  Card,
  CardTitle,
  CopyButton,
  Drawer,
  EmptyState,
  ErrorState,
  Modal,
  ModalActions,
  PageHeader,
  PageSkeleton,
  Skeleton,
  StatCard,
  Switch,
  TimeText,
  useAdminQuery,
  useUrlDrawer,
} from "@/components/admin/kit";
import { useAdmin } from "@/components/admin/shell/AdminContext";
import {
  formatPromoCode,
  koDate,
  kstDayOf,
  promoBenefitLines,
  promoBenefitShort,
  promoEventFilter,
  promoEventLive,
  promoEventsOf,
  promoLinkOf,
  promoUsersCsv,
  serialCsv,
  serialCsvName,
  PROMO_USERS_MAX,
  PROMO_USERS_PAGE,
  SERIAL_BATCH_MAX,
  type PromoEvent,
  type PromoLookup,
  type PromoOverview,
  type PromoStats,
  type PromoUsersPage,
  type SerialBatch,
  type SerialRow,
  type SharedPromo,
} from "@/lib/promo-codes";

type Overview = PromoOverview & { stats: PromoStats | null };
type UsersResp = PromoUsersPage & { schemaReady: boolean };

type Overlay =
  | { kind: "create" }
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

/** 브라우저에서 파일 내려받기(관리실은 보통 창이라 막히지 않는다) */
function saveFile(text: string, name: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function BenefitsPage() {
  const q = useAdminQuery<Overview>("/api/admin/promo");
  // '진행 중·끝남'을 가르는 지금 — 관리실 시계(읽을 때마다 맞춘다). 그리는 중에 Date.now() 를 부르지 않는다(React 규칙)
  const { clock: now } = useAdmin();
  const drawer = useUrlDrawer("event");
  const [overlay, setOverlay] = useState<Overlay | null>(null);

  if (!q.data && q.loading) return <PageSkeleton />;
  if (!q.data && q.error) return <ErrorState message={q.error} onRetry={q.reload} />;
  const data: Overview = q.data ?? { schemaReady: true, shared: [], batches: [], stats: null };
  const events = promoEventsOf(data);
  const serialTotal = data.batches.reduce((n, b) => n + b.total, 0);
  const serialUsed = data.batches.reduce((n, b) => n + b.used, 0);
  const done = () => {
    setOverlay(null);
    q.reload();
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="혜택·이벤트 관리"
        description="요기보 회원 혜택(모두 같은 코드)과 요기보 구매 고객 시리얼을 만들고, 혜택을 받은 고객을 봐요. 손님은 설정 › 혜택 코드나 링크로 넣어요."
        actions={
          <>
            <Button disabled={!data.schemaReady || !data.stats} onClick={() => drawer.open("all")}>
              전체 고객 목록
            </Button>
            <Button tone="primary" disabled={!data.schemaReady} onClick={() => setOverlay({ kind: "create" })}>
              새 혜택·이벤트
            </Button>
          </>
        }
      />
      {!data.schemaReady && (
        <Banner tone="warn" title="데이터베이스 준비 전이에요">
          바탕화면 수파베이스 폴더의 18번 SQL(혜택 코드)을 새 쿼리로 추가해 Run 해 주세요.
        </Banner>
      )}
      {data.schemaReady && !data.stats && (
        <Banner tone="warn" title="고객 목록 준비 전이에요">
          바탕화면 수파베이스 폴더의 19번 SQL(혜택·이벤트 관리)을 새 쿼리로 추가해 Run 하면 숫자와 고객 목록이 보여요.
        </Banner>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="진행 중" value={events.filter((e) => promoEventLive(e, now)).length} unit="개" sub={`전체 ${events.length}개`} />
        <StatCard label="혜택 받은 고객" value={data.stats ? data.stats.customers : null} unit="명" sub={data.stats ? `넣은 횟수 ${data.stats.redemptions.toLocaleString("ko-KR")}번` : "19번 SQL 뒤"} />
        <StatCard label="최근 7일" value={data.stats ? data.stats.last7 : null} unit="번" sub={data.stats ? `오늘 ${data.stats.today}번` : undefined} tone="blue" />
        <StatCard label="시리얼 사용" value={serialTotal ? serialUsed : 0} unit={`/ ${serialTotal.toLocaleString("ko-KR")}장`} sub={serialTotal ? `${Math.round((serialUsed / serialTotal) * 100)}% 사용` : "시리얼 없음"} />
      </div>

      <Card>
        <CardTitle hint={`${events.length}개`}>혜택·이벤트</CardTitle>
        {events.length === 0 ? (
          <EmptyState title="혜택·이벤트가 없어요" body="‘새 혜택·이벤트’로 요기보 회원 혜택 코드나 구매 고객 시리얼을 만들어요." icon="tag" />
        ) : (
          <ul className="flex flex-col divide-y divide-[#f2f4f6]">
            {events.map((e) => (
              <EventRow
                key={e.key}
                event={e}
                now={now}
                canList={Boolean(data.stats)}
                onCustomers={() => drawer.open(e.key)}
                onEdit={() => setOverlay(e.kind === "shared" ? { kind: "editShared", row: e.shared } : { kind: "editBatch", batch: e.batch })}
              />
            ))}
          </ul>
        )}
      </Card>

      <LookupCard disabled={!data.schemaReady} canToggle={Boolean(data.stats)} />

      <p className="break-keep text-[12px] font-medium leading-relaxed text-[#8b95a1]">
        손님 링크: {origin()}/code/코드 · 같은 코드는 한 계정에 한 번 · 틀린 코드는 한 계정에 한 시간 10번까지 · 동화 크레딧 1권으로 만들 수 있는 양은
        서버가 묶어요(줄거리 8번, 그림 쪽수×2+10장, 이틀 안에 마무리). 웹과 안드로이드 앱이 같은 화면을 써요.
      </p>

      {drawer.value !== null && (
        <CustomersDrawer key={drawer.value} eventKey={drawer.value} events={events} onClose={drawer.close} />
      )}
      {overlay?.kind === "create" && <CreateDialog onClose={() => setOverlay(null)} onDone={done} />}
      {overlay?.kind === "editShared" && <EditSharedDialog row={overlay.row} onClose={() => setOverlay(null)} onDone={done} />}
      {overlay?.kind === "editBatch" && <EditBatchDialog batch={overlay.batch} onClose={() => setOverlay(null)} onDone={done} />}
    </div>
  );
}

/* ── 목록 한 줄 ─────────────────────────────────────────────────────────── */

function EventRow({
  event: e,
  now,
  canList,
  onCustomers,
  onEdit,
}: {
  event: PromoEvent;
  now: number;
  canList: boolean;
  onCustomers: () => void;
  onEdit: () => void;
}) {
  const { api, say } = useAdmin();
  const [busy, setBusy] = useState(false);
  const shared = e.kind === "shared" ? e.shared : null;
  const batch = e.kind === "serial" ? e.batch : null;
  const endsAt = shared?.endsAt ?? batch?.endsAt ?? null;
  const ended = Boolean(endsAt && Date.parse(endsAt) <= now);
  const people = shared ? shared.used : (batch?.used ?? 0);
  const status = ended ? (
    <Badge tone="gray">끝남</Badge>
  ) : shared ? (
    shared.active ? <Badge tone="green">진행 중</Badge> : <Badge tone="gray">꺼짐</Badge>
  ) : batch && batch.active === 0 ? (
    <Badge tone="gray">꺼짐</Badge>
  ) : batch && batch.active < batch.total ? (
    <Badge tone="amber">일부 꺼짐</Badge>
  ) : (
    <Badge tone="green">진행 중</Badge>
  );

  const downloadSerials = async () => {
    if (!batch) return;
    setBusy(true);
    const r = await api<{ codes: SerialRow[] }>(`/api/admin/promo/codes?label=${encodeURIComponent(batch.label)}`);
    setBusy(false);
    if (!r.ok) {
      say(r.error);
      return;
    }
    saveFile(serialCsv(r.data.codes, origin()), serialCsvName(batch.label, todayKst()));
    say(`시리얼 ${r.data.codes.length.toLocaleString("ko-KR")}장을 내려받았어요`);
  };

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5">
      <div className="flex min-w-0 flex-1 basis-64 flex-col gap-0.5">
        <p className="flex flex-wrap items-center gap-2">
          <span className="break-keep text-[15px] font-bold text-[#191f28]">{e.label}</span>
          <Badge tone={shared ? "gray" : "blue"}>{shared ? "모두 같은 코드" : "시리얼"}</Badge>
          {status}
        </p>
        <p className="break-keep text-[13px] font-medium text-[#4e5968]">
          {shared ? <span className="font-mono font-bold tracking-wider text-[#191f28]">{shared.code}</span> : null}
          {shared ? " · " : ""}
          {promoBenefitShort(shared ?? (batch as SerialBatch))}
        </p>
        <p className="break-keep text-[12px] font-medium tabular-nums text-[#8b95a1]">
          {endsAt ? `${koDate(endsAt)}까지 넣기` : "넣는 기한 없음"} ·{" "}
          {shared ? `받은 고객 ${people.toLocaleString("ko-KR")}명` : `${people.toLocaleString("ko-KR")} / ${(batch?.total ?? 0).toLocaleString("ko-KR")}장 사용`} · 만든 날{" "}
          <TimeText iso={e.createdAt} mode="date" />
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button size="sm" tone="primary" disabled={!canList} onClick={onCustomers}>
          고객 목록 {people.toLocaleString("ko-KR")}명
        </Button>
        {shared ? <CopyButton value={promoLinkOf(origin(), shared.code)} label="링크 복사" /> : null}
        {batch ? (
          <Button size="sm" disabled={busy} onClick={() => void downloadSerials()}>
            {busy ? "만드는 중…" : "시리얼 엑셀"}
          </Button>
        ) : null}
        <Button size="sm" onClick={onEdit}>
          고치기
        </Button>
      </div>
    </li>
  );
}

/* ── 고객 목록(옆 창) ───────────────────────────────────────────────────── */

function CustomersDrawer({ eventKey, events, onClose }: { eventKey: string; events: PromoEvent[]; onClose: () => void }) {
  const { api, say } = useAdmin();
  const id = useId();
  const filter = promoEventFilter(eventKey);
  const event = events.find((e) => e.key === eventKey) ?? null;
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [saving, setSaving] = useState(false);

  const params = (o: number, limit: number) => {
    const sp = new URLSearchParams();
    if (filter?.codeId) sp.set("codeId", String(filter.codeId));
    if (filter?.label) sp.set("label", filter.label);
    if (query) sp.set("q", query);
    sp.set("offset", String(o));
    sp.set("limit", String(limit));
    return sp.toString();
  };
  const res = useAdminQuery<UsersResp>(filter ? `/api/admin/promo/users?${params(offset, PROMO_USERS_PAGE)}` : null, { keepOnChange: true });
  const page = res.data;
  const title = eventKey === "all" ? "전체 고객 목록" : event ? `${event.label} — 고객 목록` : "고객 목록";

  const downloadAll = async () => {
    if (!filter) return;
    setSaving(true);
    const rows: PromoUsersPage["rows"] = [];
    for (let o = 0; o < 10 * PROMO_USERS_MAX; o += PROMO_USERS_MAX) {
      const r = await api<UsersResp>(`/api/admin/promo/users?${params(o, PROMO_USERS_MAX)}`);
      if (!r.ok) {
        setSaving(false);
        say(r.error);
        return;
      }
      rows.push(...r.data.rows);
      if (r.data.rows.length < PROMO_USERS_MAX) break;
    }
    setSaving(false);
    saveFile(promoUsersCsv(rows), serialCsvName(`${event?.label ?? "전체"}_고객`, todayKst()));
    say(`고객 ${rows.length.toLocaleString("ko-KR")}명을 내려받았어요`);
  };

  const total = page?.total ?? 0;
  return (
    <Drawer
      open
      title={title}
      subtitle={
        event
          ? `${event.kind === "shared" ? `모두 같은 코드 ${event.shared.code}` : "시리얼 묶음"} · ${promoBenefitShort(event.kind === "shared" ? event.shared : event.batch)}`
          : "모든 혜택·이벤트에서 받은 고객"
      }
      onClose={onClose}
      width={560}
      busy={saving}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <span className="text-[13px] font-medium tabular-nums text-[#6b7684]">
            {page ? `${total.toLocaleString("ko-KR")}명 · 최근 7일 ${page.last7.toLocaleString("ko-KR")}명` : ""}
          </span>
          <Button disabled={saving || !total} onClick={() => void downloadAll()}>
            {saving ? "모으는 중…" : "고객 목록 엑셀"}
          </Button>
        </div>
      }
    >
      <form
        className="mb-3 flex gap-2"
        onSubmit={(ev) => {
          ev.preventDefault();
          setOffset(0);
          setQuery(text.trim());
        }}
      >
        <label htmlFor={`${id}-q`} className="sr-only">
          아이디나 코드로 찾기
        </label>
        <input id={`${id}-q`} value={text} onChange={(ev) => setText(ev.target.value)} placeholder="아이디 일부나 시리얼로 찾기" className={INPUT} />
        <Button type="submit">찾기</Button>
      </form>

      {!filter ? (
        <ErrorState message="이벤트를 찾지 못했어요." />
      ) : !page && res.loading ? (
        <Skeleton lines={6} />
      ) : !page && res.error ? (
        <ErrorState message={res.error} onRetry={res.reload} />
      ) : page && page.rows.length === 0 ? (
        <EmptyState title={query ? "찾는 고객이 없어요" : "아직 혜택을 받은 고객이 없어요"} body={query ? "아이디 일부나 시리얼 전체를 넣어 보세요." : "손님이 코드를 넣으면 여기에 쌓여요."} icon="users" />
      ) : page ? (
        <>
          <ul className="flex flex-col divide-y divide-[#f2f4f6]">
            {page.rows.map((u, i) => (
              <li key={`${u.code}-${u.at}-${i}`} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-2.5">
                <div className="flex min-w-0 flex-col gap-0.5">
                  {u.id ? (
                    <AdminLink href={`/admin/members/${u.id}`} className="truncate text-sm font-bold text-[#3182f6] hover:underline">
                      {u.who ?? "(아이디 없음)"}
                    </AdminLink>
                  ) : (
                    <span className="text-sm font-bold text-[#8b95a1]">(탈퇴한 회원)</span>
                  )}
                  <span className="break-keep text-[12px] font-medium text-[#6b7684]">
                    {eventKey === "all" ? `${u.label} · ` : ""}
                    <span className="font-mono tracking-wider">{formatPromoCode(u.code, u.kind)}</span>
                  </span>
                  <span className="break-keep text-[12px] font-medium text-[#8b95a1]">{promoBenefitLines(u).join(" · ")}</span>
                </div>
                <span className="shrink-0 text-[12px] font-medium text-[#6b7684]">
                  <TimeText iso={u.at} mode="datetime" />
                </span>
              </li>
            ))}
          </ul>
          {total > PROMO_USERS_PAGE && (
            <div className="mt-3 flex items-center justify-between gap-2">
              <Button size="sm" disabled={offset === 0 || res.loading} onClick={() => setOffset(Math.max(0, offset - PROMO_USERS_PAGE))}>
                ← 앞
              </Button>
              <span className="text-[12px] font-medium tabular-nums text-[#6b7684]">
                {(offset + 1).toLocaleString("ko-KR")}–{Math.min(offset + PROMO_USERS_PAGE, total).toLocaleString("ko-KR")} / {total.toLocaleString("ko-KR")}명
              </span>
              <Button size="sm" disabled={offset + PROMO_USERS_PAGE >= total || res.loading} onClick={() => setOffset(offset + PROMO_USERS_PAGE)}>
                뒤 →
              </Button>
            </div>
          )}
        </>
      ) : null}
    </Drawer>
  );
}

/* ── 만들기 ─────────────────────────────────────────────────────────────── */

type LibraryMode = "none" | "until" | "days";

function CreateDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const id = useId();
  const [mode, setMode] = useState<"shared" | "serial">("serial");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="새 혜택·이벤트" onClose={onClose} busy={busy}>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-bold text-[#6b7684]">어떻게 나눠 줄까요?</legend>
        {(
          [
            ["serial", "한 사람에 한 장 — 시리얼", "요기보 구매 고객처럼 한 장씩 보내요. 12자리 난수, 한 장 한 번. 엑셀로 내려받아 넘겨요."],
            ["shared", "모두 같은 코드", "요기보 가입 + 마케팅 수신동의 고객처럼 문자로 같은 코드를 보내요. 한 계정은 한 번."],
          ] as const
        ).map(([m, title, help]) => (
          <label
            key={m}
            className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 ${mode === m ? "border-[#3182f6] bg-[#f4f9ff]" : "border-[#e5e8eb] bg-white"}`}
          >
            <input type="radio" name={`${id}-mode`} checked={mode === m} onChange={() => setMode(m)} disabled={busy} className="mt-1 h-4 w-4 accent-[#3182f6]" />
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-bold text-[#191f28]">{title}</span>
              <span className="break-keep text-[12px] font-medium text-[#6b7684]">{help}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <CreateFields key={mode} mode={mode} busy={busy} setBusy={setBusy} onClose={onClose} onDone={onDone} />
    </Modal>
  );
}

function CreateFields({
  mode,
  busy,
  setBusy,
  onClose,
  onDone,
}: {
  mode: "shared" | "serial";
  busy: boolean;
  setBusy: (b: boolean) => void;
  onClose: () => void;
  onDone: () => void;
}) {
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
    say(shared ? `코드 ${r.data.result.code ?? ""}를 만들었어요` : `시리얼 ${(r.data.result.count ?? count).toLocaleString("ko-KR")}장을 만들었어요 — ‘시리얼 엑셀’로 내려받을 수 있어요`);
    onDone();
  };

  const nothing = book === 0 && draw === 0 && lib === "none";
  return (
    <>
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
          이벤트 이름 (손님 화면 ‘받은 혜택’에도 보여요{shared ? "" : " · 시리얼 묶음을 가르는 이름"})
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
          {lib === "until" && <input type="date" value={libUntil} onChange={(e) => setLibUntil(e.target.value)} aria-label="전체 듣기 끝나는 날" className={INPUT} />}
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
          ? "모두 같은 코드라 받은 사람이 다른 곳에 올리면 누구나 넣을 수 있어요. 돈이 드는 혜택(동화 만들기)은 시리얼로 주세요."
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
    </>
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

/* ── 고치기 ─────────────────────────────────────────────────────────────── */

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
    say(`‘${row.label}’를 고쳤어요`);
    onDone();
  };
  return (
    <Modal title={`‘${row.label}’ 고치기 (${row.code})`} onClose={onClose} busy={busy}>
      <Switch checked={active} onChange={setActive} label="진행 중" description="끄면 새로 넣을 수 없어요. 이미 받은 혜택은 그대로예요." />
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-ends`} className={LABEL}>
          코드를 넣을 수 있는 마지막 날 (비우면 기한 없음)
        </label>
        <input id={`${id}-ends`} type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={INPUT} />
      </div>
      {row.libraryUntil && (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-lib`} className={LABEL}>
            전체 듣기 끝나는 날 — 바꾸면 이미 받은 고객도 같이 바뀌어요
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
    say(`‘${batch.label}’를 고쳤어요`);
    onDone();
  };
  return (
    <Modal title={`‘${batch.label}’ 고치기`} onClose={onClose} busy={busy}>
      <Switch
        checked={active}
        onChange={setActive}
        label="진행 중"
        description="끄면 아직 안 쓴 시리얼은 넣을 수 없어요(한 장씩 따로 끈 것도 같이 바뀌어요). 이미 쓴 시리얼의 혜택은 그대로예요."
      />
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

/* ── 코드 찾기 ─────────────────────────────────────────────────────────── */

function LookupCard({ disabled, canToggle }: { disabled: boolean; canToggle: boolean }) {
  const { api, say } = useAdmin();
  const id = useId();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PromoLookup | null>(null);
  const [error, setError] = useState<string | null>(null);

  const look = async (value: string) => {
    setBusy(true);
    setError(null);
    const r = await api<{ lookup: PromoLookup | null }>(`/api/admin/promo/codes?lookup=${encodeURIComponent(value)}`);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      setResult(null);
    } else setResult(r.data.lookup ?? { found: false });
  };
  const toggle = async (target: string, active: boolean) => {
    setBusy(true);
    const r = await api("/api/admin/promo", { action: "toggleCode", code: target, active });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    say(active ? "그 코드를 다시 켰어요" : "그 코드를 껐어요 — 이미 받은 혜택은 그대로예요");
    await look(target);
  };

  return (
    <Card>
      <CardTitle>코드 찾기</CardTitle>
      <p className="mb-3 break-keep text-[13px] font-medium text-[#6b7684]">
        “시리얼이 안 돼요” 문의 때 — 어떤 코드인지, 누가 언제 썼는지 봐요. 새어 나간 시리얼이나 취소된 주문의 시리얼은 그 한 장만 끌 수 있어요.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) void look(code);
        }}
        className="flex gap-2"
      >
        <label htmlFor={`${id}-q`} className="sr-only">
          찾을 코드
        </label>
        <input id={`${id}-q`} value={code} onChange={(e) => setCode(e.target.value)} placeholder="예: ABCD-EFGH-JKLM" className={`${INPUT} font-mono tracking-wider`} />
        <Button type="submit" disabled={disabled || busy || code.replace(/[^A-Za-z0-9]/g, "").length < 4}>
          {busy ? "찾는 중…" : "찾기"}
        </Button>
      </form>
      {error ? <p className="mt-2 rounded-lg bg-[#ffeff0] px-2.5 py-2 text-xs font-bold text-[#f04452]">{error}</p> : null}
      {result && !result.found && (
        <p className="mt-3 text-sm font-bold text-[#4e5968]">그런 코드는 없어요 — 손님이 글자를 잘못 옮겨 적었을 수 있어요(0·O, 1·I 는 시리얼에 안 써요).</p>
      )}
      {result?.found && (
        <div className="mt-3 flex flex-col gap-1 rounded-xl bg-[#f9fafb] px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex flex-wrap items-center gap-2 font-bold text-[#191f28]">
              <span className="font-mono tracking-wider">{formatPromoCode(result.code, result.kind)}</span>
              <Badge tone={result.kind === "serial" ? "blue" : "gray"}>{result.kind === "serial" ? "시리얼" : "모두 같은 코드"}</Badge>
              {result.active ? <Badge tone="green">켜짐</Badge> : <Badge tone="gray">꺼짐</Badge>}
            </p>
            {canToggle && (
              <Button size="sm" tone={result.active ? "danger" : "secondary"} disabled={busy} onClick={() => void toggle(result.code, !result.active)}>
                {result.active ? "이 코드만 끄기" : "다시 켜기"}
              </Button>
            )}
          </div>
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
