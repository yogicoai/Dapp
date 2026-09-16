"use client";

/**
 * 가격 설정 — 토큰 값·지급량을 여기서 정한다 (2026-09-16, 사장님 지시).
 *
 * 규칙 두 가지만 지킨다.
 *  · **바꾸는 사람은 yogico 뿐**이다(fe 는 보기만). 서버와 DB 가 각각 한 번씩 더 막는다.
 *  · **왜 바꾸는지 적어야** 저장된다. 나중에 "언제 왜 올렸더라"를 이력에서 읽는다.
 *
 * 숫자만 보면 무슨 뜻인지 모르므로, 바꾸는 즉시 "5쪽 한 권 = N토큰 = ₩N" 으로 환산해 보여 준다.
 * 지금 만들고 있는 책의 값은 바뀌지 않는다(대본 값은 이미 받았고, 그림 값은 다음 화면부터다).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PricingLogRow, PricingResponse } from "@/app/api/admin/pricing/route";
import {
  bookCost,
  DEFAULT_PRICING,
  formatWon,
  illustrationCost,
  PRICING_FIELDS,
  PRICING_FIELDS_ADVANCED,
  scriptCost,
  tokensToWon,
  type Pricing,
} from "@/lib/pricing";
import { Button, Card, CardTitle, Chip, NumberField, when } from "./ui";

type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };
type Api = <T>(path: string, body?: unknown) => Promise<ApiResult<T>>;

const ALL_FIELDS = [...PRICING_FIELDS, ...PRICING_FIELDS_ADVANCED] as const;
type FieldKey = (typeof ALL_FIELDS)[number]["key"];

const FIELD_LABEL: Record<string, string> = Object.fromEntries(ALL_FIELDS.map((f) => [f.key, f.label]));

/** 화면에서 고치는 중인 값 — 빈 칸("")도 있을 수 있어 숫자와 따로 다룬다. */
type Draft = Record<FieldKey, number | "">;

function draftOf(p: Pricing): Draft {
  return Object.fromEntries(ALL_FIELDS.map((f) => [f.key, p[f.key]])) as Draft;
}

/** 5쪽 한 권이 얼마인지 — 가격을 바꿀 때 가장 먼저 보고 싶은 값. */
const SAMPLE_PAGES = 5;

export function PricingSection({ api, say, clock }: { api: Api; say: (m: string) => void; clock: number }) {
  const [state, setState] = useState<PricingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(draftOf(DEFAULT_PRICING));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const load = useCallback(async () => {
    const r = await api<PricingResponse>("/api/admin/pricing");
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setState(r.data);
    setDraft(draftOf(r.data.pricing));
    setError(null);
  }, [api]);

  useEffect(() => {
    // 마이크로태스크로 미룬다 — 효과 본문에서 곧바로 setState 하면 렌더가 한 번 더 돈다.
    void Promise.resolve().then(load);
  }, [load]);

  const current = state?.pricing ?? DEFAULT_PRICING;
  const canEdit = state?.canEdit ?? false;

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

  /** 고치는 중인 값으로 만든 가상의 가격표 — 미리보기 계산에 쓴다. */
  const preview: Pricing = useMemo(() => {
    const next = { ...current };
    for (const c of changes) next[c.key] = c.to;
    return next;
  }, [current, changes]);

  const save = async () => {
    if (changes.length === 0) return;
    if (note.trim().length < 2) {
      say("왜 바꾸는지 두 글자 이상 적어 주세요");
      return;
    }
    setBusy(true);
    const patch = Object.fromEntries(changes.map((c) => [c.key, c.to]));
    const r = await api<{ ok: true; changed: number; pricing: Pricing }>("/api/admin/pricing", { patch, note: note.trim() });
    setBusy(false);
    setConfirming(false);
    if (!r.ok) {
      say(r.error);
      return;
    }
    say(`${r.data.changed}개 항목을 바꿨어요`);
    setNote("");
    await load();
  };

  const invalid =
    preview.cost_illustrated_per_page < preview.cost_text_per_page
      ? "그림동화 값은 대본 값보다 낮을 수 없어요."
      : preview.cost_text_per_page * 20 > 1000 || preview.cost_illustrated_per_page * 20 > 1000
        ? "20쪽짜리가 1000토큰을 넘으면 결제가 막혀요. 값을 낮춰 주세요."
        : null;

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <Card className="bg-[#ffeff0]">
          <p className="text-sm font-bold text-[#f04452]">{error}</p>
        </Card>
      ) : null}

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
        <CardTitle hint={state ? (canEdit ? "바꾸면 다음 만들기부터 적용돼요" : `${state.me} 계정은 보기만 돼요`) : ""}>
          값 정하기
        </CardTitle>

        {!canEdit ? (
          <p className="mb-4 rounded-xl bg-[#f2f4f6] px-4 py-3 text-[13px] font-bold text-[#6b7684]">
            가격은 회사 계정(yogico)에서만 바꿀 수 있어요. 지금 값은 그대로 보실 수 있어요.
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {PRICING_FIELDS.map((f) => (
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
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="mt-4 text-[13px] font-bold text-[#6b7684] underline-offset-2 hover:underline"
        >
          {showAdvanced ? "고급 설정 접기" : "고급 설정 펼치기 (의견 보상 · 무료 다시쓰기)"}
        </button>
        {showAdvanced ? (
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {PRICING_FIELDS_ADVANCED.map((f) => (
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
            ))}
          </div>
        ) : null}

        {invalid ? (
          <p className="mt-4 rounded-xl bg-[#ffeff0] px-4 py-3 text-[13px] font-bold text-[#f04452]">{invalid}</p>
        ) : null}

        {canEdit && changes.length > 0 ? (
          <div className="mt-5 rounded-2xl bg-[#f2f4f6] p-4">
            <p className="mb-2 text-[13px] font-bold text-[#4e5968]">바뀌는 값 {changes.length}개</p>
            <ul className="mb-3 flex flex-col gap-1">
              {changes.map((c) => (
                <li key={c.key} className="flex items-center justify-between text-[13px] font-medium text-[#6b7684]">
                  <span>{FIELD_LABEL[c.key]}</span>
                  <span className="font-bold tabular-nums text-[#191f28]">
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
                placeholder="예: 그림 원가가 올라서"
                className="rounded-xl border border-[#e5e8eb] bg-white px-3.5 py-2.5 text-sm font-medium text-[#191f28] outline-none placeholder:text-[#c4cad1] focus:border-[#3182f6]"
              />
            </label>
            <p className="mt-2 text-[12px] font-medium leading-relaxed text-[#8b95a1]">
              지금 만들고 있는 책의 값은 바뀌지 않아요. 대본 값은 이미 받았고, 그림 값은 다음 화면부터예요.
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                tone="primary"
                disabled={busy || !!invalid || note.trim().length < 2}
                onClick={() => setConfirming(true)}
              >
                {busy ? "저장하는 중…" : "이 값으로 바꾸기"}
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
      </Card>

      <Card>
        <CardTitle hint={state?.log.length ? `${state.log.length}건` : "아직 없어요"}>바꾼 이력</CardTitle>
        {state && state.log.length > 0 ? (
          <ul className="flex flex-col">
            {state.log.map((row: PricingLogRow) => (
              <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[#f2f4f6] py-3 last:border-0">
                <span className="text-sm font-bold text-[#191f28]">{FIELD_LABEL[row.field] ?? row.field}</span>
                <span className="text-sm font-bold tabular-nums text-[#6b7684]">
                  {row.old_value ?? "–"} <span className="text-[#c4cad1]">→</span>{" "}
                  <span className="text-[#3182f6]">{row.new_value}</span>
                </span>
                {row.note ? <span className="text-[13px] font-medium text-[#8b95a1]">{row.note}</span> : null}
                <span className="ml-auto flex items-center gap-2">
                  <Chip tone="gray">{row.changed_by_username ?? "마스터"}</Chip>
                  <span className="text-[12px] font-medium text-[#b0b8c1]">{when(row.at, clock)}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] font-medium text-[#8b95a1]">아직 값을 바꾼 적이 없어요.</p>
        )}
      </Card>

      {confirming ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl bg-white p-6">
            <h3 className="text-[17px] font-bold text-[#191f28]">이 값으로 바꿀까요?</h3>
            <ul className="my-4 flex flex-col gap-1.5">
              {changes.map((c) => (
                <li key={c.key} className="flex items-center justify-between text-sm">
                  <span className="font-medium text-[#6b7684]">{FIELD_LABEL[c.key]}</span>
                  <span className="font-bold tabular-nums text-[#191f28]">
                    {c.from} <span className="text-[#c4cad1]">→</span> <span className="text-[#3182f6]">{c.to}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="rounded-xl bg-[#f2f4f6] px-4 py-3 text-[13px] font-medium leading-relaxed text-[#6b7684]">
              바꾼 뒤 만드는 동화부터 새 값이 적용돼요. 사유 “{note.trim()}” 과 함께 이력에 남아요.
            </p>
            <div className="mt-4 flex gap-2">
              <Button tone="primary" full disabled={busy} onClick={save}>
                {busy ? "저장하는 중…" : "바꾸기"}
              </Button>
              <Button tone="secondary" full disabled={busy} onClick={() => setConfirming(false)}>
                그만두기
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
