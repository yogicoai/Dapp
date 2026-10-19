"use client";

/**
 * 회원 요금제 카드 — 회원 화면 요약 아래(2026-10-02 사장님 "회원들도 그쪽에서 관리할 수 있게").
 *  · 지금 요금제(지정 없음이면 '결제를 붙이기 전이라 모두 열림') · 끝나는 날 · 사유 · 지정한 사람
 *  · 그 요금제의 몫(관리실 요금제 값) 옆에 지금 쓴 양 — 이번 달 동화 · 가족 캐릭터 · 가족 목소리. 넘으면 붉게 알린다.
 *  · [요금제 바꾸기] → 창에서 요금제 · 끝나는 날 · 사유(필수). 관리자 모두 — 토큰 충전과 같은 규칙(DB 가 다시 막는다).
 *  · 바꾼 이력(최근 30줄)은 접어 둔다.
 * 고객 앱은 아직 이 한도로 만들기를 막지 않는다 — 지금은 책장 단계(공개 동화)만 요금제를 따른다.
 */
import { useId, useState } from "react";
import {
  activePlanKey,
  kstDateText,
  kstDateValue,
  MEMBER_PLAN_KEYS,
  MEMBER_PLAN_LABEL,
  NO_PLAN_LABEL,
  overLimits,
  planLimits,
  planSummary,
  planWithEndText,
  type MemberPlan,
  type MemberPlanKey,
  type MemberPlanResponse,
  type MemberUsage,
} from "@/lib/member-plan";
import { PARENT_VOICE_OPEN, VOICE_TERM_LABEL, type PlanTerms } from "@/lib/plans";
import {
  Banner,
  Button,
  Card,
  CardTitle,
  Chip,
  ErrorState,
  Modal,
  ModalActions,
  Skeleton,
  TimeText,
  useAdminQuery,
} from "@/components/admin/kit";
import { useAdmin } from "@/components/admin/shell/AdminContext";
import { PlanBadge } from "./member-ui";

export function MemberPlanCard({ memberId, username }: { memberId: string; username: string }) {
  const q = useAdminQuery<MemberPlanResponse>(`/api/admin/member-plan?id=${memberId}`);
  const { clock } = useAdmin();
  const [editing, setEditing] = useState(false);
  const d = q.data;

  if (!d) {
    return q.error ? (
      <ErrorState message={`요금제를 읽지 못했어요. ${q.error}`} onRetry={q.reload} />
    ) : (
      <Card>
        <Skeleton lines={3} />
      </Card>
    );
  }

  const active = activePlanKey(d.plan, clock);
  const expired = !!d.plan && !active;
  const over = d.usage ? overLimits(d.usage, active, d.terms) : [];

  return (
    <Card>
      <CardTitle hint={d.plan?.updatedAt ? <TimeText iso={d.plan.updatedAt} /> : undefined}>요금제</CardTitle>

      {!d.schemaReady ? (
        <div className="mb-4">
          <Banner tone="warn" title="데이터베이스 준비 전이에요 — 아직 요금제를 지정할 수 없어요">
            supabase-offer-settings.sql 을 Supabase SQL 편집기에서 한 번 돌리면 여기서 지정할 수 있어요.
          </Banner>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {d.plan ? (
              <PlanBadge plan={d.plan.plan} endsAt={d.plan.endsAt} now={clock} />
            ) : (
              <span className="text-[15px] font-bold text-[#4e5968]">{NO_PLAN_LABEL}</span>
            )}
            <span className="text-[13px] font-medium text-[#6b7684]">
              {d.plan
                ? d.plan.endsAt
                  ? expired
                    ? `${kstDateText(d.plan.endsAt)}에 끝났어요 — 지금은 지정 없음과 같아요`
                    : `${kstDateText(d.plan.endsAt)}까지`
                  : "끝나는 날 없음 (풀 때까지)"
                : "결제를 붙이기 전이라 모두 열려 있어요"}
            </span>
          </div>
          {d.plan?.note ? (
            <p className="break-keep text-[13px] font-medium text-[#8b95a1]">
              사유: {d.plan.note}
              {d.plan.setBy ? ` · ${d.plan.setBy}` : ""}
            </p>
          ) : null}
        </div>
        <Button tone="primary" onClick={() => setEditing(true)} disabled={!d.schemaReady}>
          요금제 바꾸기
        </Button>
      </div>

      <UsageGrid usage={d.usage} plan={active} terms={d.terms} />

      {over.length > 0 ? (
        <div className="mt-3">
          <Banner tone="warn" title="요금제 한도보다 많이 쓰고 있어요">
            {over.join(" · ")} — 고객 앱은 아직 이 한도로 막지 않아요.
          </Banner>
        </div>
      ) : null}

      {d.log.length > 0 ? (
        <details className="group mt-4 rounded-xl bg-[#f9fafb]">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-4 text-[13px] font-bold text-[#4e5968] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#3182f6] [&::-webkit-details-marker]:hidden">
            <span>바꾼 이력 {d.log.length}건</span>
            <span aria-hidden className="text-[#b0b8c1] transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>
          <ul className="flex flex-col px-4 pb-3">
            {d.log.map((c) => (
              <li key={c.id} className="flex flex-col gap-0.5 border-b border-[#eef0f3] py-2.5 last:border-0">
                <span className="text-[13px] font-bold text-[#191f28]">
                  {planWithEndText(c.from, c.fromEndsAt)} <span className="text-[#b0b8c1]">→</span>{" "}
                  <span className="text-[#3182f6]">{planWithEndText(c.to, c.toEndsAt)}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2 text-[12px] font-medium text-[#8b95a1]">
                  {c.note ? <span className="break-keep">{c.note}</span> : null}
                  <Chip tone="gray">{c.by ?? "관리자"}</Chip>
                  <TimeText iso={c.at} />
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {editing ? (
        <PlanDialog
          memberId={memberId}
          username={username}
          current={d.plan}
          terms={d.terms}
          today={kstDateValue(new Date(clock).toISOString())}
          onClose={() => setEditing(false)}
          onDone={() => {
            setEditing(false);
            q.reload();
          }}
        />
      ) : null}
    </Card>
  );
}

/** 요금제의 몫 옆에 지금 쓴 양 — 지정이 없으면 쓴 양만 */
function UsageGrid({ usage, plan, terms }: { usage: MemberUsage | null; plan: MemberPlanKey | null; terms: PlanTerms }) {
  if (!usage) {
    return <p className="mt-4 text-[13px] font-medium text-[#8b95a1]">지금 쓴 양을 읽지 못했어요.</p>;
  }
  const l = plan ? planLimits(plan, terms) : null;
  const cells: { label: string; value: string; sub: string; over?: boolean }[] = [
    {
      label: "이번 달 동화",
      value: `${usage.booksThisMonth}권`,
      sub: l
        ? l.booksPer === "month"
          ? `매달 ${l.books}권까지`
          : l.booksPer === "once"
            ? `한 번 ${l.books}권 · 지금까지 ${usage.booksTotal}권`
            : "만들기 없음(듣기만)"
        : `지금까지 ${usage.booksTotal}권`,
      over: !!l && l.booksPer === "month" && usage.booksThisMonth > l.books,
    },
    {
      label: "가족 캐릭터",
      value: `${usage.familyCharacters}명`,
      sub: l ? `${l.familyCharacters}명까지 · 가족 ${usage.familyMembers}명` : `가족 ${usage.familyMembers}명`,
      over: !!l && plan !== "free" && usage.familyCharacters > l.familyCharacters,
    },
    // 부모 목소리를 닫아 둔 동안은 'AI 성우 목소리'(요금제 몫)만 보인다 — 쓴 양과 견주지 않는다(lib/plans voiceTermText)
    PARENT_VOICE_OPEN
      ? {
          label: "가족 목소리",
          value: `${usage.voices}명`,
          sub: l ? `${l.voices}명까지${l.voiceRemakesPerMonth ? ` · 한 달 ${l.voiceRemakesPerMonth}번 다시` : ""}` : "준비된 목소리만",
          over: !!l && plan !== "free" && usage.voices > l.voices,
        }
      : {
          label: VOICE_TERM_LABEL,
          value: l && l.voices > 0 ? `${l.voices}명 추가` : "–",
          sub: l ? "요금제에 든 몫" : "요금제 지정 없음",
        },
    {
      label: "가족 그리기 토큰",
      value: l && l.drawTokensPerMonth > 0 ? `매달 ${l.drawTokensPerMonth}개` : "–",
      sub: l && l.drawTokensPerMonth > 0 ? `첫 달 ${l.drawTokensFirstMonth}개` : "가족 패스에만",
    },
  ];
  return (
    <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {cells.map((c) => (
        <div key={c.label} className={`flex flex-col gap-0.5 rounded-xl px-3.5 py-3 ${c.over ? "bg-[#ffeff0]" : "bg-[#f9fafb]"}`}>
          <dt className="text-[12px] font-bold text-[#6b7684]">{c.label}</dt>
          <dd className={`text-[17px] font-bold tabular-nums ${c.over ? "text-[#f04452]" : "text-[#191f28]"}`}>{c.value}</dd>
          <dd className="break-keep text-[12px] font-medium text-[#8b95a1]">{c.sub}</dd>
        </div>
      ))}
    </dl>
  );
}

type Choice = MemberPlanKey | "none";

function PlanDialog({
  memberId,
  username,
  current,
  terms,
  today,
  onClose,
  onDone,
}: {
  memberId: string;
  username: string;
  current: MemberPlan | null;
  terms: PlanTerms;
  today: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { api, say } = useAdmin();
  const groupId = useId();
  const [choice, setChoice] = useState<Choice>(current?.plan ?? "none");
  const [hasEnd, setHasEnd] = useState(!!current?.endsAt);
  const [endsOn, setEndsOn] = useState(kstDateValue(current?.endsAt ?? null));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options: { key: Choice; label: string; desc: string }[] = [
    { key: "none", label: NO_PLAN_LABEL, desc: "결제를 붙이기 전이라 모두 열려 있어요(지금 회원들과 같아요)" },
    ...MEMBER_PLAN_KEYS.map((k) => ({ key: k as Choice, label: MEMBER_PLAN_LABEL[k], desc: planSummary(k, terms) })),
  ];
  const endNeeded = choice !== "none" && hasEnd;
  const endOk = !endNeeded || (endsOn.length === 10 && endsOn >= today);
  const ok = note.trim().length >= 2 && endOk;

  const save = async () => {
    setBusy(true);
    setError(null);
    const r = await api<{ ok: true; changed: number }>("/api/admin/member-plan", {
      id: memberId,
      plan: choice === "none" ? null : choice,
      endsOn: endNeeded ? endsOn : null,
      note: note.trim(),
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    say(r.data.changed > 0 ? `${username} 요금제를 바꿨어요` : "바뀐 것이 없었어요");
    onDone();
  };

  return (
    <Modal title={`${username} 요금제 바꾸기`} onClose={onClose} busy={busy}>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-bold text-[#6b7684]">요금제</legend>
        {options.map((o) => {
          const on = choice === o.key;
          return (
            <label
              key={o.key}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 ${
                on ? "border-[#3182f6] bg-[#f4f9ff]" : "border-[#e5e8eb] bg-white"
              }`}
            >
              <input
                type="radio"
                name={`${groupId}-plan`}
                value={o.key}
                checked={on}
                onChange={() => setChoice(o.key)}
                className="mt-1 h-4 w-4 accent-[#3182f6]"
              />
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-bold text-[#191f28]">{o.label}</span>
                <span className="break-keep text-[12px] font-medium text-[#6b7684]">{o.desc}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {choice !== "none" ? (
        <div className="flex flex-col gap-2">
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-bold text-[#4e5968]">
            <input
              type="checkbox"
              checked={hasEnd}
              onChange={(e) => setHasEnd(e.target.checked)}
              className="h-4 w-4 accent-[#3182f6]"
            />
            끝나는 날 정하기
          </label>
          {hasEnd ? (
            <div className="flex flex-col gap-1">
              <label htmlFor={`${groupId}-ends`} className="text-xs font-bold text-[#6b7684]">
                이 날 끝까지 써요(한국 시각)
              </label>
              <input
                id={`${groupId}-ends`}
                type="date"
                min={today}
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
                className="h-11 rounded-xl border border-[#d1d6db] px-3 text-sm font-bold tabular-nums text-[#191f28] outline-none focus:border-[#3182f6]"
              />
              {!endOk ? <span className="text-[12px] font-bold text-[#f04452]">오늘이나 그 뒤 날짜를 골라 주세요.</span> : null}
            </div>
          ) : (
            <p className="text-[12px] font-medium text-[#8b95a1]">끝나는 날이 없으면 관리자가 풀 때까지 이어져요.</p>
          )}
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${groupId}-note`} className="text-xs font-bold text-[#6b7684]">
          왜 바꾸나요? (필수)
        </label>
        <textarea
          id={`${groupId}-note`}
          rows={2}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="예: 베타 테스터라 한 달 가족 패스 지급"
          className="resize-y rounded-xl border border-[#d1d6db] px-3 py-2 text-sm font-normal text-[#191f28] outline-none placeholder:text-[#b0b8c1] focus:border-[#3182f6]"
        />
      </div>

      <p className="rounded-xl bg-[#f2f4f6] px-4 py-3 text-[12px] font-medium leading-relaxed text-[#6b7684]">
        지금은 책장(공개 동화)이 이 요금제를 따라요. 동화 만들기·가족 캐릭터·목소리 한도는 결제를 붙일 때 함께 걸어요.
      </p>

      {error ? <p className="rounded-lg bg-[#ffeff0] px-2.5 py-2 text-xs font-bold text-[#f04452]">{error}</p> : null}
      <ModalActions
        onCancel={onClose}
        cancelLabel="그만두기"
        okLabel="바꾸기"
        okClass="bg-[#3182f6]"
        busy={busy}
        disabled={!ok}
        onOk={() => void save()}
      />
    </Modal>
  );
}
