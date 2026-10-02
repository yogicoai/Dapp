"use client";

/**
 * 크레딧 설정 — 가격별 크레딧 묶음과 쓰는 곳별 크레딧(2026-10-01 사장님: "가격대별 크래딧 설정할수 있는 설정부분도 어드민단에").
 *
 * 크레딧은 고객이 단품으로 사서, 플랜에 든 몫을 넘는 것(동화 1권 더 · 가족 캐릭터 · 가족 목소리 · 가족 그리기)에 쓴다.
 * 여기서 바꾸면 요금제 화면(/plans)의 크레딧 카드와 자주 묻는 질문이 바로 바뀐다.
 * 결제를 붙이기 전이라 고객이 실제로 사지는 못한다 — 결제를 붙일 때도 실제 금액은 서버 가격표(이 값)가 정한다.
 *
 * 숫자만 보면 감이 안 오므로 바꾸는 즉시 "1크레딧 = N원 · 첫 묶음보다 N% 더"와 "동화 1권 = 약 N원"을 같이 보여 준다.
 */
import { useState } from "react";
import {
  CREDIT_PACKS_MAX,
  CREDIT_COST_MAX,
  PACK_CREDITS_MAX,
  PACK_PRICE_MAX,
  PACK_PRICE_MIN,
  type OfferAdminResponse,
  type OfferPatch,
} from "@/lib/offer-settings";
import { CREDIT_USES, CREDIT_USE_LABEL, creditsText, won, type CreditPack, type CreditUse } from "@/lib/plans";
import { Button, Card, CardTitle, ErrorState, NumberField, Skeleton, type AdminQuery } from "@/components/admin/kit";
import { useUnsavedGuard } from "@/components/admin/shell/AdminContext";
import { OfferLogCard, OfferNotReady, OfferSaveBar, ReadOnlyNote, type ChangeLine } from "../offer/offer-ui";

type DraftPack = { priceWon: number | ""; credits: number | "" };

export function CreditSettingsCard({ query }: { query: AdminQuery<OfferAdminResponse> }) {
  const { data, error, reload } = query;
  return (
    <section aria-labelledby="credit-settings-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="credit-settings-title" className="text-[17px] font-bold tracking-tight text-[#191f28]">
          크레딧 설정 <span className="text-[#8b95a1]">(가격별 묶음 · 쓰는 값)</span>
        </h2>
        <p className="break-keep text-[13px] font-medium text-[#6b7684]">
          고객이 단품으로 사는 크레딧이에요. 바꾸면 요금제 화면에 바로 보여요. 결제를 붙이기 전이라 아직 살 수는 없어요.
        </p>
      </div>
      {data ? (
        <>
          {error ? (
            <p role="alert" className="rounded-xl bg-[#ffeff0] px-4 py-3 text-[13px] font-bold text-[#f04452]">
              다시 읽지 못했어요 — 마지막으로 읽은 값을 보여 드려요. ({error})
            </p>
          ) : null}
          {!data.schemaReady ? <OfferNotReady /> : null}
          <CreditEditor
            key={JSON.stringify([data.schemaReady, data.settings.creditPacks, data.settings.creditCosts])}
            data={data}
            reload={reload}
          />
        </>
      ) : error ? (
        <ErrorState message={`${error} — 지금 값을 읽지 못해서, 숫자는 보여 드리지 않았어요.`} onRetry={reload} />
      ) : (
        <Card>
          <Skeleton lines={4} />
        </Card>
      )}
    </section>
  );
}

function packsText(packs: readonly CreditPack[]): string {
  return packs.map((p) => `${won(p.priceWon)} ${creditsText(p.credits)}`).join(" · ");
}

/** 1크레딧 값(원) — 소수 첫째 자리까지 */
function unitWon(p: { priceWon: number; credits: number }): number {
  return p.credits > 0 ? p.priceWon / p.credits : 0;
}

/** 고치는 중인 묶음이 맞는가 — 맞으면 값이 싼 순서로 정리한 목록, 아니면 까닭 */
function checkPacks(packs: readonly DraftPack[]): { ok: true; packs: CreditPack[] } | { ok: false; error: string } {
  if (packs.length < 1) return { ok: false, error: "크레딧 묶음은 하나 이상 있어야 해요." };
  const out: CreditPack[] = [];
  for (const p of packs) {
    if (p.priceWon === "" || p.credits === "") return { ok: false, error: "묶음의 값과 크레딧을 모두 적어 주세요." };
    if (p.priceWon < PACK_PRICE_MIN || p.priceWon > PACK_PRICE_MAX) {
      return { ok: false, error: `묶음 값은 ${won(PACK_PRICE_MIN)}~${won(PACK_PRICE_MAX)} 사이로 적어 주세요.` };
    }
    if (p.credits < 1 || p.credits > PACK_CREDITS_MAX) {
      return { ok: false, error: `묶음 크레딧은 1~${creditsText(PACK_CREDITS_MAX)} 사이로 적어 주세요.` };
    }
    if (out.some((x) => x.priceWon === p.priceWon)) return { ok: false, error: `${won(p.priceWon)} 묶음이 두 개예요.` };
    out.push({ priceWon: p.priceWon, credits: p.credits });
  }
  out.sort((a, b) => a.priceWon - b.priceWon);
  return { ok: true, packs: out };
}

/** 쓰는 곳별 크레딧이 맞는가 — 빈 칸·너무 큰 값 */
function checkCosts(
  costs: Readonly<Record<CreditUse, number | "">>,
): { ok: true; costs: Record<CreditUse, number> } | { ok: false; error: string } {
  const out = {} as Record<CreditUse, number>;
  for (const k of CREDIT_USES) {
    const v = costs[k];
    if (v === "") return { ok: false, error: `${CREDIT_USE_LABEL[k]} 값을 적어 주세요.` };
    if (v > CREDIT_COST_MAX) {
      return { ok: false, error: `${CREDIT_USE_LABEL[k]} 값이 너무 커요(${creditsText(CREDIT_COST_MAX)}까지).` };
    }
    out[k] = v;
  }
  return { ok: true, costs: out };
}

function CreditEditor({ data, reload }: { data: OfferAdminResponse; reload: () => void }) {
  const current = data.settings;
  const editable = data.canEdit && data.schemaReady;
  const [packs, setPacks] = useState<DraftPack[]>(() => current.creditPacks.map((p) => ({ ...p })));
  const [costs, setCosts] = useState<Record<CreditUse, number | "">>(() => ({ ...current.creditCosts }));

  const checked = checkPacks(packs);
  const costsChecked = checkCosts(costs);

  const packsChanged = checked.ok
    ? packsText(checked.packs) !== packsText(current.creditPacks)
    : true;
  const changedCosts = CREDIT_USES.filter((k) => costs[k] !== current.creditCosts[k]);

  const lines: ChangeLine[] = [
    ...(packsChanged
      ? [
          {
            key: "packs",
            label: "크레딧 묶음",
            from: packsText(current.creditPacks),
            to: checked.ok ? packsText(checked.packs) : "고치는 중",
          },
        ]
      : []),
    ...changedCosts.map((k) => ({
      key: k,
      label: CREDIT_USE_LABEL[k],
      from: creditsText(current.creditCosts[k]),
      to: costs[k] === "" ? "비어 있음" : creditsText(costs[k] as number),
    })),
  ];
  const patch: OfferPatch = {
    ...(packsChanged && checked.ok ? { creditPacks: checked.packs } : {}),
    ...(changedCosts.length > 0 && costsChecked.ok ? { creditCosts: costsChecked.costs } : {}),
  };
  const invalid = !checked.ok ? checked.error : !costsChecked.ok ? costsChecked.error : null;

  useUnsavedGuard(editable && lines.length > 0, "크레딧 설정");

  // 값 감 잡기 — 가장 싼 묶음(첫 묶음)의 1크레딧 값을 기준으로
  const base = checked.ok ? checked.packs[0] : current.creditPacks[0];
  const baseUnit = base ? unitWon(base) : 0;

  return (
    <>
      {!data.canEdit ? <ReadOnlyNote /> : null}

      <Card>
        <CardTitle hint={`${packs.length}/${CREDIT_PACKS_MAX}개`}>가격별 묶음</CardTitle>
        <ul className="flex flex-col gap-2">
          {packs.map((p, i) => {
            const ok = p.priceWon !== "" && p.credits !== "" && p.credits > 0;
            const unit = ok ? unitWon({ priceWon: p.priceWon as number, credits: p.credits as number }) : 0;
            const more = ok && baseUnit > 0 && unit > 0 ? Math.round((baseUnit / unit - 1) * 100) : 0;
            return (
              <li key={i} className="flex flex-wrap items-end gap-3 rounded-2xl bg-[#f9fafb] p-3">
                <PackNumber
                  id={`pack-price-${i}`}
                  label="값(부가세 포함)"
                  unit="원"
                  value={p.priceWon}
                  disabled={!editable}
                  onChange={(v) => setPacks((prev) => prev.map((x, j) => (j === i ? { ...x, priceWon: v } : x)))}
                />
                <PackNumber
                  id={`pack-credits-${i}`}
                  label="주는 크레딧"
                  unit="크레딧"
                  value={p.credits}
                  disabled={!editable}
                  onChange={(v) => setPacks((prev) => prev.map((x, j) => (j === i ? { ...x, credits: v } : x)))}
                />
                <div className="flex min-h-11 min-w-[9rem] flex-1 flex-col justify-center text-[13px] font-medium text-[#6b7684]">
                  {ok ? (
                    <>
                      <span className="tabular-nums">1크레딧 = {unit.toFixed(1)}원</span>
                      <span className={more > 0 ? "font-bold text-[#3182f6]" : "text-[#8b95a1]"}>
                        {more > 0 ? `첫 묶음보다 ${more}% 더 줘요` : more < 0 ? `첫 묶음보다 ${-more}% 덜 줘요` : "기준 묶음"}
                      </span>
                    </>
                  ) : (
                    <span className="text-[#b0b8c1]">값과 크레딧을 적어 주세요</span>
                  )}
                </div>
                {editable && packs.length > 1 ? (
                  <Button tone="ghost" size="sm" onClick={() => setPacks((prev) => prev.filter((_, j) => j !== i))}>
                    빼기
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
        {editable && packs.length < CREDIT_PACKS_MAX ? (
          <div className="mt-3">
            <Button tone="secondary" size="sm" onClick={() => setPacks((prev) => [...prev, { priceWon: "", credits: "" }])}>
              묶음 더하기
            </Button>
          </div>
        ) : null}
        <p className="mt-3 break-keep text-[12px] font-medium leading-relaxed text-[#8b95a1]">
          저장하면 값이 싼 묶음부터 정리돼요. 요금제 화면에는 이 순서대로 보여요.
        </p>
      </Card>

      <Card>
        <CardTitle hint="첫 묶음 값으로 환산">쓰는 곳별 크레딧</CardTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {CREDIT_USES.map((k) => {
            const v = costs[k];
            return (
              <NumberField
                key={k}
                label={CREDIT_USE_LABEL[k]}
                unit="크레딧"
                value={v}
                original={current.creditCosts[k]}
                disabled={!editable}
                help={v === "" || baseUnit <= 0 ? undefined : `약 ${won(Math.round(v * baseUnit))}`}
                onChange={(next) => setCosts((prev) => ({ ...prev, [k]: next }))}
              />
            );
          })}
        </div>
      </Card>

      {editable ? (
        <OfferSaveBar
          lines={lines}
          patch={patch}
          invalid={invalid}
          savedMessage="크레딧 설정을 바꿨어요"
          afterNote="요금제 화면의 크레딧 카드와 자주 묻는 질문이 바로 바뀌어요."
          onSaved={reload}
          onReset={() => {
            setPacks(current.creditPacks.map((p) => ({ ...p })));
            setCosts({ ...current.creditCosts });
          }}
        />
      ) : null}

      <OfferLogCard rows={data.log.filter((r) => r.field === "credit_packs" || r.field === "credit_costs")} />
    </>
  );
}

function PackNumber({
  id,
  label,
  unit,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  unit: string;
  value: number | "";
  disabled: boolean;
  onChange: (v: number | "") => void;
}) {
  return (
    <div className="flex w-[9.5rem] flex-col gap-1.5">
      <label htmlFor={id} className="text-[12px] font-bold text-[#6b7684]">
        {label}
      </label>
      <span className={`flex h-11 items-center gap-1.5 rounded-xl border border-[#e5e8eb] bg-white px-3 ${disabled ? "opacity-60" : ""}`}>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          disabled={disabled}
          value={value}
          onChange={(e) => {
            const next = e.target.value;
            onChange(next === "" ? "" : Math.max(0, Math.floor(Number(next) || 0)));
          }}
          className="w-full min-w-0 bg-transparent text-[15px] font-bold tabular-nums text-[#191f28] outline-none disabled:cursor-not-allowed"
        />
        <span className="shrink-0 text-[12px] font-medium text-[#8b95a1]">{unit}</span>
      </span>
    </div>
  );
}
