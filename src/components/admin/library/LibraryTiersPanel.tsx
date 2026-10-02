"use client";

/**
 * 공개 동화 — 회원 종류마다 어떤 세계명작·전래동화를 보여 줄지 책마다 고르는 칸·저장·이력('공개 동화' 메뉴, 운영).
 * 사장님 지시(2026-10-01): "어드민단에서 단계별 공개할 동화 select로 정할수 있는 창", 10-02 "운영 쪽에".
 *
 * 단계는 겹쳐서 열린다: 무료(비회원도) ⊂ 스타트팩 ⊂ 가족 패스. 요금제 화면의 "세계명작 N권 · 전래동화 N권"은 여기서 고른 대로 센다.
 * '책장에 적용'을 켜면 비회원 책장에는 무료 동화만 보이고(사장님 10-02 "비회원일 때는 5권씩만 보여주기"), 요금제를 지정한
 * 회원은 그 요금제의 동화까지만 보인다(끄면 지금처럼 다 보임). 요금제를 지정하지 않은 회원은 결제를 붙이기 전(베타)까지 모두 보인다.
 * 회원 요금제는 '회원' 화면에서 정한다.
 * 바꾸기는 회사 계정만 된다(서버와 DB 가 막는다). 다른 계정은 같은 화면을 보기만 한다.
 */
import { useMemo, useState } from "react";
import {
  LIBRARY_KIND_LABEL,
  LIBRARY_TIERS,
  TIER_LABEL,
  TIER_OPTION_LABEL,
  offerViewOf,
  tierOpens,
  type CatalogBook,
  type LibraryKind,
  type LibraryTier,
  type OfferAdminResponse,
  type OfferPatch,
} from "@/lib/offer-settings";
import { FREE, STARTER, libraryCountText } from "@/lib/plans";
import {
  Badge,
  Button,
  Card,
  CardTitle,
  ErrorState,
  Icon,
  Skeleton,
  Switch,
  type AdminQuery,
} from "@/components/admin/kit";
import { useUnsavedGuard } from "@/components/admin/shell/AdminContext";
import { OfferLogCard, OfferNotReady, OfferSaveBar, ReadOnlyNote, type ChangeLine } from "../offer/offer-ui";

const KINDS: readonly LibraryKind[] = ["classic", "folk"];

/** 고르기 칸 글자색 — 단계마다 다르게(글자도 함께 바뀌므로 색만으로 알리지 않는다) */
const TIER_INK: Record<LibraryTier, string> = {
  free: "text-[#00976b]",
  starter: "text-[#c77700]",
  pass: "text-[#1b64da]",
};

export function LibraryTiersPanel({ query }: { query: AdminQuery<OfferAdminResponse> }) {
  const q = query;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="max-w-2xl break-keep text-[13px] font-medium leading-relaxed text-[#6b7684]">
          책마다 어느 회원부터 보여 줄지 골라요 — 무료(비회원도) · 스타트팩부터 · 가족 패스만. 바꾸면 요금제 화면에는 바로,
          책장에는 1~5분 안에 반영돼요.
        </p>
        <a
          href="/plans"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-white px-3.5 text-sm font-bold text-[#4e5968] hover:bg-[#e8f3ff] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#3182f6]"
        >
          요금제 화면 보기
          <Icon name="external" size={16} />
        </a>
      </div>

      {q.data ? (
        <>
          {q.error ? (
            <p role="alert" className="rounded-xl bg-[#ffeff0] px-4 py-3 text-[13px] font-bold text-[#f04452]">
              다시 읽지 못했어요 — 마지막으로 읽은 값을 보여 드려요. ({q.error})
            </p>
          ) : null}
          {!q.data.schemaReady ? <OfferNotReady /> : null}
          {/* 저장 뒤 다시 읽어 값이 바뀌면 고치던 칸·사유를 새 값으로 처음부터 — 열쇠로 새로 그린다 */}
          <LibraryEditor
            key={JSON.stringify([q.data.schemaReady, q.data.settings.gateOn, q.data.settings.libraryTiers])}
            data={q.data}
            reload={q.reload}
          />
        </>
      ) : q.error ? (
        <ErrorState message={`${q.error} — 지금 값을 읽지 못해서, 고르는 칸은 보여 드리지 않았어요.`} onRetry={q.reload} />
      ) : (
        <Card>
          <Skeleton lines={6} />
        </Card>
      )}
    </div>
  );
}

function LibraryEditor({ data, reload }: { data: OfferAdminResponse; reload: () => void }) {
  const current = data.settings;
  const editable = data.canEdit && data.schemaReady;
  const [tiers, setTiers] = useState<Record<string, LibraryTier>>(() => ({ ...current.libraryTiers }));
  const [gateOn, setGateOn] = useState(current.gateOn);
  // 위 카드 셋을 누르면 그 회원 종류에게 보이는 책만 아래에 보인다(사장님 2026-10-02). 다시 누르면 전체.
  const [focus, setFocus] = useState<LibraryTier | null>(null);
  const toggleFocus = (t: LibraryTier) => setFocus((f) => (f === t ? null : t));
  /** 지금 보는 회원 종류에게 보이는 책인가 — 고치는 중에 단계를 바꾼 줄은 그 자리에서 사라지지 않게 남긴다 */
  const showRow = (b: CatalogBook) =>
    focus === null || (!b.hidden && tierOpens(focus, tiers[b.id])) || tiers[b.id] !== current.libraryTiers[b.id];

  const view = useMemo(
    () => offerViewOf({ ...current, libraryTiers: tiers, gateOn }, data.catalog),
    [current, tiers, gateOn, data.catalog],
  );

  const changedBooks = data.catalog.filter((b) => tiers[b.id] !== current.libraryTiers[b.id]);
  const gateChanged = gateOn !== current.gateOn;
  const lines: ChangeLine[] = [
    ...(gateChanged
      ? [{ key: "gate", label: "책장에 적용", from: current.gateOn ? "켜짐" : "꺼짐", to: gateOn ? "켜짐" : "꺼짐" }]
      : []),
    ...changedBooks.map((b) => ({
      key: b.id,
      label: b.title,
      from: TIER_LABEL[current.libraryTiers[b.id]],
      to: TIER_LABEL[tiers[b.id]],
    })),
  ];
  const patch: OfferPatch = {
    ...(changedBooks.length > 0 ? { libraryTiers: tiers } : {}),
    ...(gateChanged ? { gateOn } : {}),
  };

  // 고르다 만 것이 있으면 메뉴를 누를 때 한 번 묻는다(겉틀이 처리).
  useUnsavedGuard(editable && lines.length > 0, "공개 동화");

  const sameAsDefaults = data.catalog.every((b) => tiers[b.id] === data.defaults.libraryTiers[b.id]);
  const freeTotal = view.free.classics + view.free.folk;
  const starterTotal = view.starter.classics + view.starter.folk;

  return (
    <>
      {!data.canEdit ? <ReadOnlyNote /> : null}

      {/* 지금 고른 대로 회원 종류마다 몇 권인가 — 요금제 화면에 이 숫자가 그대로 보인다. 누르면 그 책만 아래에. */}
      <div className="flex flex-col gap-2">
        <div role="group" aria-label="회원 종류로 아래 책 거르기" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <TierFilterCard
            label="비회원 · 무료 회원"
            value={freeTotal}
            sub={libraryCountText(view.free.classics, view.free.folk) || "무료로 보여 줄 동화가 없어요"}
            active={focus === "free"}
            onClick={() => toggleFocus("free")}
          />
          <TierFilterCard
            label="스타트팩 (무료 포함)"
            value={starterTotal}
            sub={libraryCountText(view.starter.classics, view.starter.folk) || "–"}
            active={focus === "starter"}
            onClick={() => toggleFocus("starter")}
          />
          <TierFilterCard
            label="가족 패스"
            value={view.libraryBooks}
            sub="서가의 동화 전부"
            active={focus === "pass"}
            onClick={() => toggleFocus("pass")}
          />
        </div>
        {focus ? (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#e8f3ff] px-4 py-2.5 text-[13px] font-bold text-[#1b64da]"
          >
            <span className="break-keep">
              {FOCUS_LABEL[focus]}에게 보이는 동화{" "}
              {focus === "free" ? freeTotal : focus === "starter" ? starterTotal : view.libraryBooks}권만 보고 있어요
            </span>
            <Button tone="ghost" size="sm" onClick={() => setFocus(null)}>
              전체 보기
            </Button>
          </div>
        ) : (
          <p className="text-[12px] font-medium text-[#8b95a1]">카드를 누르면 그 회원에게 보이는 동화만 아래에 보여요.</p>
        )}
      </div>

      <Card>
        <CardTitle hint={gateOn ? <Badge tone="green">켜짐</Badge> : <Badge tone="gray">꺼짐</Badge>}>
          책장에 적용
        </CardTitle>
        <Switch
          checked={gateOn}
          onChange={setGateOn}
          disabled={!editable}
          label="회원 종류마다 고른 동화만 보여 주기"
          description="켜면 비회원 책장에는 무료 동화만 보이고, 요금제를 지정한 회원은 그 요금제의 동화까지만 보여요. 요금제를 지정하지 않은 회원은 결제를 붙이기 전까지 모두 보여요."
        />
      </Card>

      {KINDS.map((kind) => (
        <BookTierList
          key={kind}
          kind={kind}
          books={data.catalog.filter((b) => b.kind === kind)}
          show={showRow}
          filtered={focus !== null}
          tiers={tiers}
          current={current.libraryTiers}
          editable={editable}
          onChange={(id, t) => setTiers((prev) => ({ ...prev, [id]: t }))}
        />
      ))}

      {editable && !sameAsDefaults ? (
        <div className="flex justify-end">
          <Button tone="ghost" size="sm" onClick={() => setTiers({ ...data.defaults.libraryTiers })}>
            기본값으로 고르기 (서가 앞에서 {FREE.classics}권씩 무료 · {STARTER.classics}권까지 스타트팩)
          </Button>
        </div>
      ) : null}

      {editable ? (
        <OfferSaveBar
          lines={lines}
          patch={patch}
          savedMessage="공개 동화를 바꿨어요"
          afterNote="요금제 화면에는 바로, 책장에는 1~5분 안에 반영돼요."
          onSaved={reload}
          onReset={() => {
            setTiers({ ...current.libraryTiers });
            setGateOn(current.gateOn);
          }}
        />
      ) : null}

      <OfferLogCard rows={data.log.filter((r) => r.field === "library_tiers" || r.field === "library_gate_on")} />
    </>
  );
}

/** 위 카드 — 누르면 아래 책 목록을 그 회원 종류에게 보이는 책만으로 거른다(aria-pressed 로 켜짐을 알린다) */
const FOCUS_LABEL: Record<LibraryTier, string> = { free: "비회원 · 무료 회원", starter: "스타트팩 회원", pass: "가족 패스 회원" };

function TierFilterCard({
  label,
  value,
  sub,
  active,
  onClick,
}: {
  label: string;
  value: number;
  sub: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex min-w-0 flex-col gap-1 rounded-2xl px-5 py-4 text-left transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#3182f6] ${
        active ? "bg-[#e8f3ff] ring-2 ring-inset ring-[#3182f6]" : "bg-white hover:bg-[#f9fafb]"
      }`}
    >
      <span className="flex items-center justify-between gap-2 text-[13px] font-medium text-[#6b7684]">
        <span className="break-keep">{label}</span>
        <span className={`shrink-0 text-[12px] font-bold ${active ? "text-[#1b64da]" : "text-[#b0b8c1]"}`}>
          {active ? "보는 중" : "책 보기"}
        </span>
      </span>
      <span className="text-[26px] font-bold tabular-nums leading-tight tracking-tight text-[#191f28]">
        {value}
        <span className="ml-1 text-[13px] font-bold text-[#8b95a1]">권</span>
      </span>
      <span className="text-[12px] font-medium text-[#8b95a1]">{sub}</span>
    </button>
  );
}

function BookTierList({
  kind,
  books,
  show,
  filtered,
  tiers,
  current,
  editable,
  onChange,
}: {
  kind: LibraryKind;
  books: CatalogBook[];
  /** 이 줄을 보일까(위 카드로 거를 때) */
  show: (b: CatalogBook) => boolean;
  filtered: boolean;
  tiers: Record<string, LibraryTier>;
  current: Record<string, LibraryTier>;
  editable: boolean;
  onChange: (id: string, t: LibraryTier) => void;
}) {
  // 서가 순서 번호 — 숨긴 책은 서가에 없으므로 번호를 주지 않는다
  const order = new Map(books.filter((b) => !b.hidden).map((b, i) => [b.id, i + 1]));
  const shown = order.size;
  const hidden = books.length - shown;
  const rows = books.filter(show);
  return (
    <Card>
      <CardTitle
        hint={
          filtered
            ? `${rows.length}권 보는 중 · 서가 ${shown}권`
            : hidden > 0
              ? `서가 ${shown}권 · 숨긴 책 ${hidden}권`
              : `서가 ${shown}권`
        }
      >
        {LIBRARY_KIND_LABEL[kind]}
      </CardTitle>
      {rows.length === 0 ? (
        <p className="py-2 text-[13px] font-medium text-[#8b95a1]">이 회원에게 보이는 {LIBRARY_KIND_LABEL[kind]}가 없어요.</p>
      ) : null}
      <ul className="flex flex-col">
        {rows.map((b) => {
          const changed = tiers[b.id] !== current[b.id];
          const n = order.get(b.id);
          const selectId = `tier-${b.id}`;
          return (
            <li
              key={b.id}
              className={`flex items-center gap-3 border-b border-[#f2f4f6] py-2.5 last:border-0 ${b.hidden ? "opacity-70" : ""}`}
            >
              <span className="w-5 shrink-0 text-right text-[12px] font-bold tabular-nums text-[#b0b8c1]">{n ?? "–"}</span>
              {b.cover ? (
                // eslint-disable-next-line @next/next/no-img-element -- 관리실 작은 표지(cafe24 원본) — 이미지 최적화 경로를 거치지 않는다
                <img
                  src={b.cover}
                  alt=""
                  loading="lazy"
                  className="h-12 w-9 shrink-0 rounded-md bg-[#f2f4f6] object-cover"
                />
              ) : (
                <span aria-hidden className="h-12 w-9 shrink-0 rounded-md bg-[#f2f4f6]" />
              )}
              {/* 제목은 줄을 바꿔서라도 다 보인다 — '걸리버 여행기 1~4'처럼 앞이 같은 책을 잘라 버리면 가릴 수 없다 */}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <label htmlFor={selectId} className="break-keep text-[14px] font-bold leading-snug text-[#191f28] sm:text-[15px]">
                  {b.title}
                </label>
                {b.hidden || changed ? (
                  <div className="flex flex-wrap gap-1">
                    {b.hidden ? (
                      <Badge tone="gray" title="서가에 안 보이는 책(다듬는 중) — 단계는 미리 골라 둘 수 있어요">
                        숨김
                      </Badge>
                    ) : null}
                    {changed ? (
                      <Badge tone="blue" title={`${TIER_LABEL[current[b.id]]} → ${TIER_LABEL[tiers[b.id]]}`}>
                        바뀜
                      </Badge>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <select
                id={selectId}
                value={tiers[b.id]}
                disabled={!editable}
                onChange={(e) => onChange(b.id, e.target.value as LibraryTier)}
                className={`h-11 w-[8rem] shrink-0 rounded-xl border bg-white px-2.5 text-[13px] font-bold outline-none focus:border-[#3182f6] disabled:cursor-not-allowed disabled:bg-[#f9fafb] sm:w-[9.5rem] sm:px-3 sm:text-[14px] ${
                  changed ? "border-[#3182f6] bg-[#f4f9ff]" : "border-[#d1d6db]"
                } ${TIER_INK[tiers[b.id]]}`}
              >
                {LIBRARY_TIERS.map((t) => (
                  <option key={t} value={t}>
                    {TIER_OPTION_LABEL[t]}
                  </option>
                ))}
              </select>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
