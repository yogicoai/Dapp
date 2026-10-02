"use client";

/**
 * 요금제 정책 — 가족 패스(월간·연간)와 스타트팩의 값과 구성을 정하는 곳(2026-10-02 사장님 "관리자 화면에서 스타트팩이나
 * 이런 정책들 정리해서 가격정책을 설정할 수 있게").
 *
 * 위에는 지금 고객에게 보이는 요금제 한눈에(PlanCatalogCard), 아래에서 값을 고친다.
 * 무료·스타트팩으로 보여 줄 동화는 '공개 동화' 메뉴, 크레딧은 '크레딧' 탭에서 — 이 화면은 그쪽으로 가는 단추만 둔다.
 * 바꾸면 요금제 화면(/plans)과 시연 결제·내 결제 화면이 이 값을 쓴다. 바꾸는 사람은 회사 계정 하나, 사유 필수.
 * 회원 한 명 한 명의 요금제는 '회원' 화면에서 정한다 — 여기 값은 그 요금제의 몫(한도)이 된다.
 */
import { useState } from "react";
import {
  offerViewOf,
  PASS_PERIODS,
  PASS_PERIOD_LABEL,
  PASS_TERM_FIELDS,
  STARTER_TERM_FIELDS,
  termValueText,
  type OfferAdminResponse,
  type OfferPatch,
  type PassPeriod,
  type TermField,
} from "@/lib/offer-settings";
import {
  libraryCountText,
  monthlyEquivalent,
  plansOf,
  won,
  yearlyDiscountPct,
  type PassPlanTerms,
  type PlanTerms,
  type StarterTerms,
} from "@/lib/plans";
import { AdminLink, Button, Card, CardTitle, ErrorState, Skeleton, type AdminQuery } from "@/components/admin/kit";

/** '공개 동화' 메뉴로 — 고치던 값이 있으면 겉틀이 떠날지 묻는다(AdminLink) */
function LibraryLink() {
  return (
    <AdminLink
      href="/admin/library"
      className="inline-flex min-h-9 items-center rounded-lg px-2.5 text-[13px] font-bold text-[#6b7684] hover:bg-[#f2f4f6] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#3182f6]"
    >
      공개 동화에서 고르기
    </AdminLink>
  );
}
import { useUnsavedGuard } from "@/components/admin/shell/AdminContext";
import { OfferLogCard, OfferNotReady, OfferSaveBar, ReadOnlyNote, type ChangeLine } from "../offer/offer-ui";
import { PlanCatalogCard } from "./PlanCatalogCard";

type Draft<T> = { [K in keyof T]: number | "" };
type DraftTerms = { monthly: Draft<PassPlanTerms>; yearly: Draft<PassPlanTerms>; starter: Draft<StarterTerms> };

function draftOf(t: PlanTerms): DraftTerms {
  return { monthly: { ...t.monthly }, yearly: { ...t.yearly }, starter: { ...t.starter } };
}

/** 고치는 중인 값이 맞는가 — 맞으면 요금제 값, 아니면 까닭 */
function checkDraft(d: DraftTerms): { ok: true; terms: PlanTerms } | { ok: false; error: string } {
  const part = <K extends string>(name: string, src: Record<K, number | "">, fields: readonly TermField<K>[]) => {
    const out = {} as Record<K, number>;
    for (const f of fields) {
      const v: number | "" = src[f.key];
      if (typeof v !== "number" || v < f.min || v > f.max) {
        return {
          ok: false as const,
          error: `${name} ${f.label}은(는) ${termValueText(f.unit, f.min)}~${termValueText(f.unit, f.max)} 사이로 적어 주세요.`,
        };
      }
      out[f.key] = v;
    }
    return { ok: true as const, value: out };
  };
  const m = part(PASS_PERIOD_LABEL.monthly, d.monthly, PASS_TERM_FIELDS);
  if (!m.ok) return m;
  const y = part(PASS_PERIOD_LABEL.yearly, d.yearly, PASS_TERM_FIELDS);
  if (!y.ok) return y;
  const s = part("스타트팩", d.starter, STARTER_TERM_FIELDS);
  if (!s.ok) return s;
  return { ok: true, terms: { monthly: m.value as PassPlanTerms, yearly: y.value as PassPlanTerms, starter: s.value as StarterTerms } };
}

export function PlanPolicyPanel({
  query,
  onGoTab,
}: {
  query: AdminQuery<OfferAdminResponse>;
  onGoTab: (tab: "credits") => void;
}) {
  const { data, error, reload } = query;
  return (
    <div className="flex flex-col gap-4">
      <PlanCatalogCard offer={data} />
      {data ? (
        <>
          {!data.schemaReady ? <OfferNotReady /> : null}
          <PlanTermsEditor key={JSON.stringify([data.schemaReady, data.settings.plans])} data={data} reload={reload} onGoTab={onGoTab} />
        </>
      ) : error ? (
        <ErrorState message={`${error} — 지금 값을 읽지 못해서, 고치는 칸은 보여 드리지 않았어요.`} onRetry={reload} />
      ) : (
        <Card>
          <Skeleton lines={5} />
        </Card>
      )}
    </div>
  );
}

function PlanTermsEditor({
  data,
  reload,
  onGoTab,
}: {
  data: OfferAdminResponse;
  reload: () => void;
  onGoTab: (tab: "credits") => void;
}) {
  const current = data.settings.plans;
  const editable = data.canEdit && data.schemaReady;
  const [draft, setDraft] = useState<DraftTerms>(() => draftOf(current));
  const view = offerViewOf(data.settings, data.catalog);

  const checked = checkDraft(draft);
  const lines: ChangeLine[] = [];
  for (const period of PASS_PERIODS) {
    for (const f of PASS_TERM_FIELDS) {
      const to = draft[period][f.key];
      if (to !== current[period][f.key]) {
        lines.push({
          key: `${period}.${f.key}`,
          label: `${PASS_PERIOD_LABEL[period]} ${f.label}`,
          from: termValueText(f.unit, current[period][f.key]),
          to: to === "" ? "비어 있음" : termValueText(f.unit, to),
        });
      }
    }
  }
  for (const f of STARTER_TERM_FIELDS) {
    const to = draft.starter[f.key];
    if (to !== current.starter[f.key]) {
      lines.push({
        key: `starter.${f.key}`,
        label: `스타트팩 ${f.label}`,
        from: termValueText(f.unit, current.starter[f.key]),
        to: to === "" ? "비어 있음" : termValueText(f.unit, to),
      });
    }
  }
  const patch: OfferPatch = checked.ok && lines.length > 0 ? { plans: checked.terms } : {};
  useUnsavedGuard(editable && lines.length > 0, "요금제");

  // 연간이 월간 12달보다 싼가 — 고치는 값으로 바로 계산해 보여 준다(싸지 않으면 요금제 화면은 할인 꼬리표를 감춘다)
  const preview = checked.ok ? plansOf(checked.terms) : null;
  const discount = preview ? yearlyDiscountPct(preview) : null;

  const setField = (period: PassPeriod | "starter", key: string, v: number | "") =>
    setDraft((prev) => ({ ...prev, [period]: { ...prev[period], [key]: v } }));

  return (
    <>
      {!data.canEdit ? <ReadOnlyNote /> : null}

      <Card>
        <CardTitle hint="월간 · 연간을 나란히">가족 패스</CardTitle>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] border-separate border-spacing-y-1.5 text-left">
            <caption className="sr-only">가족 패스 값과 구성(월간·연간)</caption>
            <thead>
              <tr className="text-[12px] font-bold text-[#8b95a1]">
                <th scope="col" className="w-[38%] pb-1 font-bold">
                  항목
                </th>
                {PASS_PERIODS.map((p) => (
                  <th key={p} scope="col" className="pb-1 font-bold">
                    {p === "monthly" ? "월간" : "연간"}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PASS_TERM_FIELDS.map((f) => (
                <tr key={f.key}>
                  <th scope="row" className="pr-3 align-middle text-[13px] font-bold text-[#4e5968]">
                    {f.label}
                  </th>
                  {PASS_PERIODS.map((p) => (
                    <td key={p} className="pr-2 align-middle">
                      <TermInput
                        id={`term-${p}-${f.key}`}
                        label={`${PASS_PERIOD_LABEL[p]} ${f.label}`}
                        unit={f.unit}
                        value={draft[p][f.key]}
                        original={current[p][f.key]}
                        disabled={!editable}
                        onChange={(v) => setField(p, f.key, v)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {preview ? (
          <p
            className={`mt-3 rounded-xl px-4 py-3 text-[13px] font-medium leading-relaxed ${
              discount !== null && discount > 0 ? "bg-[#f9fafb] text-[#4e5968]" : "bg-[#fff4e0] text-[#8a5a00]"
            }`}
          >
            연간은 월 {won(monthlyEquivalent(preview.yearly))}꼴 —{" "}
            {discount !== null && discount > 0
              ? `월간 12달보다 ${discount}% 싸요. 요금제 화면에 '${discount}% 할인'으로 보여요.`
              : "월간 12달보다 싸지 않아요. 요금제 화면에 할인 꼬리표가 붙지 않아요."}
          </p>
        ) : null}
      </Card>

      <Card>
        <CardTitle hint="처음 한 번만 사는 꾸러미">스타트팩</CardTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {STARTER_TERM_FIELDS.map((f) => (
            <div key={f.key} className="flex flex-col gap-1.5">
              <label htmlFor={`term-starter-${f.key}`} className="text-[12px] font-bold text-[#6b7684]">
                {f.label}
              </label>
              <TermInput
                id={`term-starter-${f.key}`}
                unit={f.unit}
                value={draft.starter[f.key]}
                original={current.starter[f.key]}
                disabled={!editable}
                onChange={(v) => setField("starter", f.key, v)}
              />
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f9fafb] px-4 py-3">
          <p className="break-keep text-[13px] font-medium text-[#6b7684]">
            함께 듣는 명작·전래: <b className="font-bold text-[#191f28]">{libraryCountText(view.starter.classics, view.starter.folk) || "없음"}</b>
          </p>
          <LibraryLink />
        </div>
      </Card>

      <Card>
        <CardTitle hint="가입하지 않아도">무료</CardTitle>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="break-keep text-[13px] font-medium text-[#6b7684]">
            듣는 명작·전래: <b className="font-bold text-[#191f28]">{libraryCountText(view.free.classics, view.free.folk) || "없음"}</b> ·
            동화 만들기는 스타트팩부터
          </p>
          <div className="flex items-center gap-1">
            <LibraryLink />
            <Button tone="ghost" size="sm" onClick={() => onGoTab("credits")}>
              크레딧 보기
            </Button>
          </div>
        </div>
      </Card>

      {editable ? (
        <OfferSaveBar
          lines={lines}
          patch={patch}
          invalid={checked.ok ? null : checked.error}
          savedMessage="요금제 값을 바꿨어요"
          afterNote="요금제 화면에는 바로, 시연 결제·내 결제 화면에는 1분 안에 반영돼요. 이미 지정한 회원 요금제의 한도도 이 값을 따라요."
          onSaved={reload}
          onReset={() => setDraft(draftOf(current))}
        />
      ) : null}

      <OfferLogCard rows={data.log.filter((r) => r.field === "plan_settings")} />
    </>
  );
}

/** 작은 숫자 칸 — 바뀐 칸은 파랗게. label 을 주면 화면 읽기용 이름(표 칸처럼 눈에 보이는 이름이 따로 없을 때) */
function TermInput({
  id,
  label,
  unit,
  value,
  original,
  disabled,
  onChange,
}: {
  id: string;
  label?: string;
  unit: string;
  value: number | "";
  original: number;
  disabled: boolean;
  onChange: (v: number | "") => void;
}) {
  const changed = value !== original;
  return (
    <span
      className={`flex h-11 items-center gap-1.5 rounded-xl border px-3 ${
        changed ? "border-[#3182f6] bg-[#f4f9ff]" : "border-[#e5e8eb] bg-white"
      } ${disabled ? "opacity-60" : ""}`}
    >
      <input
        id={id}
        aria-label={label}
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
  );
}
