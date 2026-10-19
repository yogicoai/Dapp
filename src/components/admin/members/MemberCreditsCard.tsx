"use client";

/**
 * 보상 크레딧 카드 — 회원 화면 요금제 아래(사장님 2026-10-19 "사고가 발생했을 때 크레딧으로 제공 … 동화와 / 캐릭터 생성으로
 * 나눠서 관리"). 두 가지를 나란히: 동화 크레딧(무료 동화 N권) · 캐릭터 생성 크레딧(무료 캐릭터 그리기 N번).
 *  · 가지마다 [더해 주기] → GrantCreditDialog(1~10 · 사유 필수). 사고 상세의 '크레딧으로 보상'도 같은 창이다.
 *  · 더해 준 기록은 두 가지를 한 줄로(최근 것부터) 접어 둔다.
 *  · 관리자 계정에는 이 카드를 띄우지 않는다(부르는 쪽 — 관리자는 원래 값이 안 나간다).
 *  · 한 가지의 SQL 만 돌렸으면 그 가지만 열고, 나머지는 '준비 전'으로 잠근다.
 */
import { useState } from "react";
import {
  CREDIT_KIND_HELP,
  CREDIT_KIND_LABEL,
  CREDIT_KIND_UNIT,
  CREDIT_KINDS,
  mergedCreditLog,
  type CreditKind,
  type MemberCreditsResponse,
} from "@/lib/member-credits";
import { Banner, Button, Card, CardTitle, Chip, ErrorState, Skeleton, TimeText, useAdminQuery } from "@/components/admin/kit";
import { GrantCreditDialog } from "./GrantCreditDialog";

/** 준비 전 알림이 가리킬 바탕화면 SQL 번호 */
const SQL_FILE: Readonly<Record<CreditKind, string>> = {
  book: "11번 SQL(동화 크레딧)",
  character: "10번 SQL(캐릭터 무료 생성 횟수)",
};

export function MemberCreditsCard({ memberId, username }: { memberId: string; username: string }) {
  const q = useAdminQuery<MemberCreditsResponse>(`/api/admin/credits?id=${memberId}`);
  const [granting, setGranting] = useState<CreditKind | null>(null);
  const d = q.data;

  if (!d) {
    return q.error ? (
      <ErrorState message={`보상 크레딧을 읽지 못했어요. ${q.error}`} onRetry={q.reload} />
    ) : (
      <Card>
        <Skeleton lines={3} />
      </Card>
    );
  }

  const notReady = CREDIT_KINDS.filter((k) => !d[k].schemaReady);
  const log = mergedCreditLog(d);

  return (
    <Card>
      <CardTitle hint="사고·문의 보상">보상 크레딧</CardTitle>

      {notReady.length > 0 ? (
        <div className="mb-4">
          <Banner tone="warn" title="데이터베이스 준비 전인 크레딧이 있어요">
            {notReady.map((k) => SQL_FILE[k]).join(" · ")}을 Supabase SQL 편집기에서 한 번 돌리면 여기서 더해 줄 수 있어요.
          </Banner>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {CREDIT_KINDS.map((k) => (
          <div key={k} className="flex flex-col gap-2 rounded-xl bg-[#f9fafb] px-4 py-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-bold text-[#6b7684]">{CREDIT_KIND_LABEL[k]}</span>
              <Button tone="primary" onClick={() => setGranting(k)} disabled={!d[k].schemaReady}>
                더해 주기
              </Button>
            </div>
            <span className="text-[20px] font-bold tabular-nums text-[#191f28]">
              {d[k].freeLeft}
              {CREDIT_KIND_UNIT[k]} <span className="text-[13px] font-medium text-[#8b95a1]">남음</span>
            </span>
            <span className="break-keep text-[12px] font-medium leading-relaxed text-[#8b95a1]">{CREDIT_KIND_HELP[k]}</span>
          </div>
        ))}
      </div>

      {log.length > 0 ? (
        <details className="group mt-4 rounded-xl bg-[#f9fafb]">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-4 text-[13px] font-bold text-[#4e5968] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#3182f6] [&::-webkit-details-marker]:hidden">
            <span>더해 준 기록 {log.length}건</span>
            <span aria-hidden className="text-[#b0b8c1] transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>
          <ul className="flex flex-col px-4 pb-3">
            {log.map((g, i) => (
              <li key={`${g.kind}-${g.at}-${i}`} className="flex flex-col gap-0.5 border-b border-[#eef0f3] py-2.5 last:border-0">
                <span className="text-[13px] font-bold text-[#191f28]">
                  <span className="tabular-nums text-[#3182f6]">
                    {CREDIT_KIND_LABEL[g.kind]} +{g.amount}
                    {CREDIT_KIND_UNIT[g.kind]}
                  </span>
                  {g.note ? <span className="ml-2 break-keep font-medium text-[#4e5968]">{g.note}</span> : null}
                </span>
                <span className="flex flex-wrap items-center gap-2 text-[12px] font-medium text-[#8b95a1]">
                  <Chip tone="gray">{g.by ?? "관리자"}</Chip>
                  <TimeText iso={g.at} />
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {granting ? (
        <GrantCreditDialog
          memberId={memberId}
          username={username}
          initialKind={granting}
          current={{ book: d.book.freeLeft, character: d.character.freeLeft }}
          onClose={() => setGranting(null)}
          onDone={() => {
            setGranting(null);
            q.reload();
          }}
        />
      ) : null}
    </Card>
  );
}
