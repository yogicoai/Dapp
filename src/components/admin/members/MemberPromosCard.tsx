"use client";

/**
 * 회원 화면 › 받은 혜택 — 이 회원이 넣은 혜택 코드(요기보 회원 혜택·구매 시리얼, 2026-10-22 사장님 "혜택 사용한 고객 리스트까지").
 * 어떤 이벤트에서 무엇을 언제 받았는지 — 문의 응대("시리얼 넣었는데 동화가 안 만들어져요")에 쓴다. 이벤트 설정은 혜택·이벤트 관리 화면에서.
 * 19번 SQL 전이면 '준비 전'만 알린다.
 */
import { AdminLink, Badge, Card, CardTitle, ErrorState, Skeleton, TimeText, useAdminQuery } from "@/components/admin/kit";
import { formatPromoCode, promoBenefitLines, type PromoUser } from "@/lib/promo-codes";

export function MemberPromosCard({ memberId }: { memberId: string }) {
  const q = useAdminQuery<{ schemaReady: boolean; rows: PromoUser[] }>(`/api/admin/promo/member?id=${memberId}`);
  const d = q.data;
  if (!d) {
    return q.error ? (
      <ErrorState message={`받은 혜택을 읽지 못했어요. ${q.error}`} onRetry={q.reload} />
    ) : (
      <Card>
        <Skeleton lines={2} />
      </Card>
    );
  }
  return (
    <Card>
      <CardTitle
        hint={
          <AdminLink href="/admin/benefits" className="font-bold text-[#3182f6] hover:underline">
            혜택·이벤트 관리 ›
          </AdminLink>
        }
      >
        받은 혜택
      </CardTitle>
      {!d.schemaReady ? (
        <p className="text-sm font-medium text-[#6b7684]">준비 전이에요 — 19번 SQL(혜택·이벤트 관리)을 돌리면 보여요.</p>
      ) : d.rows.length === 0 ? (
        <p className="text-sm font-medium text-[#6b7684]">받은 혜택이 없어요.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[#f2f4f6]">
          {d.rows.map((r, i) => (
            <li key={`${r.code}-${r.at}-${i}`} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-2.5">
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-[#191f28]">
                  {r.label}
                  <Badge tone={r.kind === "serial" ? "blue" : "gray"}>{r.kind === "serial" ? "시리얼" : "모두 같은 코드"}</Badge>
                </p>
                <p className="break-keep text-[12px] font-medium text-[#6b7684]">
                  <span className="font-mono tracking-wider">{formatPromoCode(r.code, r.kind)}</span> · {promoBenefitLines(r).join(" · ")}
                </p>
              </div>
              <span className="shrink-0 text-[12px] font-medium text-[#6b7684]">
                <TimeText iso={r.at} mode="datetime" />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
