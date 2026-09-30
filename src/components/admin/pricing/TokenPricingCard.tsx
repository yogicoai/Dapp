"use client";

/**
 * 토큰 값·지급량 — 동화를 만들 때 쓰는 앱 안의 값을 여기서 정한다 (2026-09-16 사장님 지시, 2026-09-30 관리실 정식판으로 옮김).
 * 옛 관리실의 가격 화면(PricingSection)을 옮겼다 — 하는 일은 그대로다.
 *
 * 규칙 두 가지만 지킨다.
 *  · **바꾸는 사람은 회사 계정 하나뿐**이다(다른 관리자는 보기만). 서버와 DB 가 각각 한 번씩 더 막는다.
 *  · **왜 바꾸는지 적어야** 저장된다. 나중에 "언제 왜 올렸더라"를 이력에서 읽는다.
 *
 * 숫자만 보면 무슨 뜻인지 모르므로, 바꾸는 즉시 "6쪽 한 권 = N토큰 = ₩N" 으로 환산해 보여 준다.
 * 지금 만들고 있는 책의 값은 바뀌지 않는다(대본 값은 이미 받았고, 그림 값은 다음 화면부터다).
 *
 * 옛 가격표(구독·단권 값)는 접어 둔다 — 고객 요금제와 결제는 이제 위 '요금제' 표(lib/plans)를 쓴다.
 * DB 가 아직 그 칸을 받으므로 고칠 수는 있게 남겨 두되, 바꿔도 고객 화면이 달라지지 않는다고 분명히 적는다.
 */
import { useMemo, useState } from "react";
import type { PricingLogRow, PricingResponse } from "@/app/api/admin/pricing/route";
import {
  bookCost,
  formatWon,
  illustrationCost,
  PRICING_FIELDS,
  PRICING_FIELDS_ADVANCED,
  PRICING_FIELDS_SALES,
  scriptCost,
  tokensToWon,
  type Pricing,
} from "@/lib/pricing";
import {
  Button,
  Card,
  CardTitle,
  Chip,
  ConfirmDialog,
  ErrorState,
  NumberField,
  Skeleton,
  TimeText,
  useAdminQuery,
} from "@/components/admin/kit";
import { useAdmin, useUnsavedGuard } from "@/components/admin/shell/AdminContext";

// 파는 값도 여기 넣어야 draft·changes·저장·이력이 한꺼번에 따라온다 — 빠뜨리면 화면에서 고쳐도 저장되지 않는다.
const ALL_FIELDS = [...PRICING_FIELDS, ...PRICING_FIELDS_SALES, ...PRICING_FIELDS_ADVANCED] as const;
type FieldKey = (typeof ALL_FIELDS)[number]["key"];

const FIELD_LABEL: Record<string, string> = Object.fromEntries(ALL_FIELDS.map((f) => [f.key, f.label]));

/** 화면에서 고치는 중인 값 — 빈 칸("")도 있을 수 있어 숫자와 따로 다룬다. */
type Draft = Record<FieldKey, number | "">;

function draftOf(p: Pricing): Draft {
  return Object.fromEntries(ALL_FIELDS.map((f) => [f.key, p[f.key]])) as Draft;
}

/** 한 권(지금 6쪽 고정 — create 의 FIXED_PAGE_COUNT)이 얼마인지 — 가격을 바꿀 때 가장 먼저 보고 싶은 값. */
const SAMPLE_PAGES = 6;

/** '6.6권치'처럼 — 딱 떨어지면 소수점은 안 보여 준다. */
function oneDp(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * 읽기 담당 — 값이 오기 전에는 숫자를 아예 그리지 않는다.
 * 기본 상수를 그려 두면 사장님이 "값이 언제 10으로 돌아갔지" 하고 잘못 읽는다 — 관리실에서는 그것만으로 사고다.
 */
export function TokenPricingCard() {
  const q = useAdminQuery<PricingResponse>("/api/admin/pricing");

  return (
    <section aria-labelledby="token-pricing-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="token-pricing-title" className="text-[17px] font-bold tracking-tight text-[#191f28]">
          토큰 값·지급량
        </h2>
        <p className="break-keep text-[13px] font-medium text-[#6b7684]">
          동화·그림·목소리를 만들 때 쓰는 앱 안의 값이에요. 바꾸면 다음 만들기부터 적용돼요.
        </p>
      </div>

      {q.data ? (
        <>
          {q.error ? (
            <p role="alert" className="rounded-xl bg-[#ffeff0] px-4 py-3 text-[13px] font-bold text-[#f04452]">
              다시 읽지 못했어요 — 마지막으로 읽은 값을 보여 드려요. ({q.error})
            </p>
          ) : null}
          {/* 값이 바뀌어 다시 읽으면(저장 뒤) 고치던 칸·사유를 새 값으로 처음부터 — 열쇠로 새로 그린다 */}
          <PricingEditor key={JSON.stringify(q.data.pricing)} state={q.data} reload={q.reload} />
        </>
      ) : q.error ? (
        <ErrorState message={`${q.error} — 지금 값을 읽지 못해서, 숫자는 보여 드리지 않았어요.`} onRetry={q.reload} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-hidden>
            {[0, 1, 2].map((i) => (
              <Card key={i}>
                <Skeleton lines={3} />
              </Card>
            ))}
          </div>
          <Card>
            <p role="status" className="text-[13px] font-medium text-[#8b95a1]">
              가격을 읽는 중…
            </p>
          </Card>
        </>
      )}
    </section>
  );
}

function PricingEditor({ state, reload }: { state: PricingResponse; reload: () => void }) {
  const { api, say, refreshBadges } = useAdmin();
  const [draft, setDraft] = useState<Draft>(() => draftOf(state.pricing));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const current = state.pricing;
  const canEdit = state.canEdit;

  /** 바뀐 칸만 추린다. 빈 칸은 '안 바꿈'으로 본다. */
  const changes = useMemo(() => {
    const out: { key: FieldKey; from: number; to: number }[] = [];
    for (const f of ALL_FIELDS) {
      const v = draft[f.key];
      if (v === "" || typeof v !== "number") continue;
      if (v !== current[f.key]) out.push({ key: f.key, from: current[f.key], to: v });
    }
    return out;
  }, [draft, current]);

  // 고치다 만 값이 있으면 메뉴를 누를 때 한 번 묻는다(겉틀이 처리).
  useUnsavedGuard(canEdit && changes.length > 0, "가격");

  /** 고치는 중인 값으로 만든 가상의 가격표 — 미리보기 계산에 쓴다. */
  const preview: Pricing = useMemo(() => {
    const next = { ...current };
    for (const c of changes) next[c.key] = c.to;
    return next;
  }, [current, changes]);

  /** 연 구독이 월 구독 12달치보다 몇 달치 싼지 — 0 이하면 이득이 없다는 뜻이라 문구를 바꾼다. */
  const yearlyGainMonths =
    preview.sub_monthly_krw > 0 ? (preview.sub_monthly_krw * 12 - preview.sub_yearly_krw) / preview.sub_monthly_krw : 0;

  const save = async () => {
    if (changes.length === 0) return;
    if (note.trim().length < 2) {
      setSaveError("왜 바꾸는지 두 글자 이상 적어 주세요.");
      return;
    }
    setBusy(true);
    setSaveError(null);
    const patch = Object.fromEntries(changes.map((c) => [c.key, c.to]));
    const r = await api<{ ok: true; changed: number; pricing: Pricing }>("/api/admin/pricing", { patch, note: note.trim() });
    setBusy(false);
    if (!r.ok) {
      // 창은 닫지 않는다 — 무엇이 막혔는지 창 안에서 읽고 다시 할 수 있게.
      setSaveError(r.error);
      return;
    }
    setConfirming(false);
    say(`${r.data.changed}개 항목을 바꿨어요`);
    refreshBadges();
    reload(); // 새 값이 오면 이 편집기는 열쇠가 바뀌어 새로 그려진다(고치던 칸·사유가 비워진다)
  };

  const invalid =
    preview.cost_illustrated_per_page < preview.cost_text_per_page
      ? "그림동화 값은 대본 값보다 낮을 수 없어요."
      : preview.cost_text_per_page * 20 > 1000 || preview.cost_illustrated_per_page * 20 > 1000
        ? "20쪽짜리가 1000토큰을 넘으면 결제가 막혀요. 값을 낮춰 주세요."
        : null;

  const field = (f: (typeof ALL_FIELDS)[number]) => (
    <NumberField
      key={f.key}
      label={f.label}
      unit={f.unit}
      help={f.help}
      value={draft[f.key]}
      original={current[f.key]}
      disabled={!canEdit || busy}
      onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))}
    />
  );

  return (
    <>
      {/* 지금 값이 무슨 뜻인지 — 숫자보다 '한 권 얼마'가 먼저다 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="flex flex-col gap-1">
          <span className="text-[13px] font-medium text-[#8b95a1]">그림동화 한 권 ({SAMPLE_PAGES}쪽)</span>
          <span className="text-2xl font-bold tabular-nums tracking-tight text-[#191f28]">
            {bookCost(SAMPLE_PAGES, preview)}
            <span className="ml-1 text-[13px] font-bold text-[#b0b8c1]">토큰</span>
          </span>
          <span className="text-[13px] font-bold text-[#3182f6]">
            {formatWon(tokensToWon(bookCost(SAMPLE_PAGES, preview), preview))}
          </span>
          <span className="text-[12px] font-medium text-[#b0b8c1]">
            대본 {scriptCost(SAMPLE_PAGES, preview)} + 그림 {illustrationCost(SAMPLE_PAGES, preview)}
          </span>
        </Card>
        <Card className="flex flex-col gap-1">
          <span className="text-[13px] font-medium text-[#8b95a1]">가입하면 드리는 토큰</span>
          <span className="text-2xl font-bold tabular-nums tracking-tight text-[#191f28]">
            {preview.signup_bonus_tokens}
            <span className="ml-1 text-[13px] font-bold text-[#b0b8c1]">토큰</span>
          </span>
          <span className="text-[13px] font-bold text-[#3182f6]">
            {Math.floor(preview.signup_bonus_tokens / Math.max(1, bookCost(SAMPLE_PAGES, preview)))}권치
          </span>
          <span className="text-[12px] font-medium text-[#b0b8c1]">
            {formatWon(tokensToWon(preview.signup_bonus_tokens, preview))} 어치
          </span>
        </Card>
        <Card className="flex flex-col gap-1">
          <span className="text-[13px] font-medium text-[#8b95a1]">부모 목소리 한 번</span>
          <span className="text-2xl font-bold tabular-nums tracking-tight text-[#191f28]">
            {preview.cost_parent_voice}
            <span className="ml-1 text-[13px] font-bold text-[#b0b8c1]">토큰</span>
          </span>
          <span className="text-[13px] font-bold text-[#3182f6]">
            {formatWon(tokensToWon(preview.cost_parent_voice, preview))}
          </span>
          <span className="text-[12px] font-medium text-[#b0b8c1]">계정당 권수 상한 {preview.max_books_per_user}권</span>
        </Card>
      </div>

      <Card>
        <CardTitle hint={canEdit ? "바꾸면 다음 만들기부터 적용돼요" : "이 계정은 보기만 돼요"}>값 정하기</CardTitle>

        {!canEdit ? (
          <p className="mb-4 rounded-xl bg-[#f2f4f6] px-4 py-3 text-[13px] font-bold text-[#6b7684]">
            이 계정에서는 값을 바꿀 수 없어요. 지금 값은 그대로 보실 수 있어요.
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{PRICING_FIELDS.map(field)}</div>

        <button
          type="button"
          aria-expanded={showAdvanced}
          onClick={() => setShowAdvanced((v) => !v)}
          className="mt-4 inline-flex min-h-11 items-center rounded-lg text-[13px] font-bold text-[#6b7684] underline-offset-2 hover:underline"
        >
          {showAdvanced ? "고급 설정 접기" : "고급 설정 펼치기 (의견 보상 · 무료 다시쓰기)"}
        </button>
        {showAdvanced ? <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">{PRICING_FIELDS_ADVANCED.map(field)}</div> : null}

        {invalid ? (
          <p className="mt-4 rounded-xl bg-[#ffeff0] px-4 py-3 text-[13px] font-bold text-[#f04452]">{invalid}</p>
        ) : null}
      </Card>

      {/*
        옛 가격표 — 구독(주·월·연)과 단권. 결제를 붙이기 전에 정해 둔 값인데, 고객 요금제는 이제 lib/plans 를 쓴다.
        접어 두고 '지금은 쓰이지 않는다'고 분명히 적는다. 숫자만 늘어놓으면 표가 맞는지 모르므로 권당 값도 함께 보여 준다.
      */}
      <details className="group rounded-2xl bg-white">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-5 text-[15px] font-bold text-[#4e5968] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#3182f6] [&::-webkit-details-marker]:hidden">
          <span>옛 가격표 — 지금은 쓰이지 않아요</span>
          <span aria-hidden className="text-[#b0b8c1] transition-transform group-open:rotate-90">
            ›
          </span>
        </summary>
        <div className="px-5 pb-5">
          <p className="mb-4 rounded-xl bg-[#f2f4f6] px-4 py-3 text-[13px] font-medium leading-relaxed text-[#6b7684]">
            예전에 정해 둔 구독·단권 값이에요. 지금 요금제 화면과 결제는 위 &lsquo;요금제&rsquo; 값을 써요. 여기 값을 바꿔도 고객
            화면은 달라지지 않아요.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{PRICING_FIELDS_SALES.map(field)}</div>

          <div className="mt-4 grid grid-cols-1 gap-2 rounded-2xl bg-[#f9fafb] p-4 sm:grid-cols-3">
            <p className="text-[13px] font-medium text-[#6b7684]">
              한 권 사면 <b className="font-bold text-[#191f28]">{formatWon(preview.single_book_krw)}</b>
            </p>
            <p className="text-[13px] font-medium text-[#6b7684]">
              월 구독이면{" "}
              <b className="font-bold text-[#191f28]">
                {Math.floor(preview.sub_monthly_tokens / Math.max(1, bookCost(SAMPLE_PAGES, preview)))}권치
              </b>{" "}
              · 한 권당{" "}
              <b className="font-bold text-[#3182f6]">
                {formatWon(
                  Math.round(
                    preview.sub_monthly_krw /
                      Math.max(1, Math.floor(preview.sub_monthly_tokens / Math.max(1, bookCost(SAMPLE_PAGES, preview)))),
                  ),
                )}
              </b>
            </p>
            <p className="text-[13px] font-medium text-[#6b7684]">
              연 구독은 월 구독{" "}
              <b className="font-bold text-[#191f28]">
                {preview.sub_monthly_krw > 0 ? (preview.sub_yearly_krw / preview.sub_monthly_krw).toFixed(1) : "–"}
                달치
              </b>{" "}
              {/* '10.0달치'만 보면 이득인지 암산해야 한다 — 12달치와의 차이를 그대로 말해 준다. */}
              <span className={yearlyGainMonths > 0 ? "text-[#3182f6]" : "text-[#8b95a1]"}>
                {preview.sub_monthly_krw <= 0
                  ? "(월 구독 값을 정하면 알려 드려요)"
                  : yearlyGainMonths > 0
                    ? `(${oneDp(yearlyGainMonths)}달치 이득)`
                    : yearlyGainMonths === 0
                      ? "(12달치와 값이 같아요)"
                      : `(12달치보다 ${oneDp(-yearlyGainMonths)}달치 비싸요)`}
              </span>
            </p>
          </div>
        </div>
      </details>

      {/*
        저장 막대 — 두 곳(값 정하기 · 옛 가격표) 어느 쪽을 고쳐도 눈에 들어오게 아래에 붙여 둔다.
        사유는 여기서 적는다(필수) — 확인 창은 바뀌는 값만 한 번 더 보여 준다.
      */}
      {canEdit && changes.length > 0 ? (
        <div className="sticky bottom-[calc(12px+env(safe-area-inset-bottom))] z-20 rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(0,27,55,.10)] ring-1 ring-[#e5e8eb]">
          <p className="mb-2 text-[13px] font-bold text-[#4e5968]">바뀌는 값 {changes.length}개</p>
          <ul className="mb-3 flex flex-col gap-1">
            {changes.map((c) => (
              <li key={c.key} className="flex items-center justify-between gap-3 text-[13px] font-medium text-[#6b7684]">
                <span className="break-keep">{FIELD_LABEL[c.key]}</span>
                <span className="shrink-0 font-bold tabular-nums text-[#191f28]">
                  {c.from} <span className="text-[#b0b8c1]">→</span> <span className="text-[#3182f6]">{c.to}</span>
                </span>
              </li>
            ))}
          </ul>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold text-[#4e5968]">왜 바꾸나요? (필수)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 200))}
              placeholder="예: 그림 값이 올라서"
              className="h-11 rounded-xl border border-[#d1d6db] bg-white px-3.5 text-[15px] font-medium text-[#191f28] outline-none placeholder:text-[#b0b8c1] focus:border-[#3182f6]"
            />
          </label>
          <p className="mt-2 text-[12px] font-medium leading-relaxed text-[#8b95a1]">
            지금 만들고 있는 책의 값은 바뀌지 않아요. 대본 값은 이미 받았고, 그림 값은 다음 화면부터예요.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              tone="primary"
              disabled={busy || !!invalid || note.trim().length < 2}
              onClick={() => {
                setSaveError(null);
                setConfirming(true);
              }}
            >
              이 값으로 바꾸기
            </Button>
            <Button
              tone="ghost"
              disabled={busy}
              onClick={() => {
                setDraft(draftOf(current));
                setNote("");
              }}
            >
              되돌리기
            </Button>
          </div>
        </div>
      ) : null}

      <Card>
        <CardTitle hint={state.log.length ? `${state.log.length}건` : "아직 없어요"}>바꾼 이력</CardTitle>
        {state.log.length > 0 ? (
          <ul className="flex flex-col">
            {state.log.map((row: PricingLogRow) => (
              <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[#f2f4f6] py-3 last:border-0">
                <span className="text-sm font-bold text-[#191f28]">{FIELD_LABEL[row.field] ?? row.field}</span>
                <span className="text-sm font-bold tabular-nums text-[#6b7684]">
                  {row.old_value ?? "–"} <span className="text-[#c4cad1]">→</span>{" "}
                  <span className="text-[#3182f6]">{row.new_value}</span>
                </span>
                {row.note ? <span className="break-keep text-[13px] font-medium text-[#8b95a1]">{row.note}</span> : null}
                <span className="ml-auto flex items-center gap-2">
                  <Chip tone="gray">{row.changed_by_username ?? "관리자"}</Chip>
                  <span className="text-[12px] font-medium text-[#8b95a1]">
                    <TimeText iso={row.at} />
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] font-medium text-[#8b95a1]">아직 값을 바꾼 적이 없어요.</p>
        )}
      </Card>

      {confirming ? (
        <ConfirmDialog
          title="이 값으로 바꿀까요?"
          confirmLabel="바꾸기"
          cancelLabel="그만두기"
          busy={busy}
          error={saveError}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void save()}
          body={
            <ul className="flex flex-col gap-1.5">
              {changes.map((c) => (
                <li key={c.key} className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-[#6b7684]">{FIELD_LABEL[c.key]}</span>
                  <span className="shrink-0 font-bold tabular-nums text-[#191f28]">
                    {c.from} <span className="text-[#c4cad1]">→</span> <span className="text-[#3182f6]">{c.to}</span>
                  </span>
                </li>
              ))}
            </ul>
          }
          extra={
            <p className="rounded-xl bg-[#f2f4f6] px-4 py-3 text-[13px] font-medium leading-relaxed text-[#6b7684]">
              바꾼 뒤 만드는 동화부터 새 값이 적용돼요. 사유 &ldquo;{note.trim()}&rdquo; 과 함께 이력에 남아요.
            </p>
          }
        />
      ) : null}
    </>
  );
}
