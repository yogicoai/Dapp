"use client";

/**
 * /checkout/fail 결제 실패 — 누구나 볼 수 있다(돈이 걸린 약속을 하지 않는 화면이라 로그인 확인이 없다).
 * 문구는 코드만 보고 우리가 쓴 문장에서 고른다. 주소에 실려 온 설명 글(message)은 읽지도 쓰지도 않는다 —
 * 업체 오류 글이 새어 나가거나, 주소를 조작해 가짜 안내를 띄우는 것을 막는다.
 *
 * TODO(PG-HOOK-4) 진짜 PG: 화면은 같다. 주문 줄을 failed 로 바꾸는 일은 서버가 한다.
 *  "돈은 나가지 않았어요"는 시연에서만 참이다 — 진짜 연결 때는 '승인은 됐는데 우리 쪽 반영이 실패한 경우'를
 *  따로 가려 다른 안내(고객센터·자동 취소)를 보여야 한다.
 */

import { useTheme } from "@/components/ThemeProvider";
import { PAY_DEMO, checkoutHref, failCopy, type FailCode } from "@/lib/pay-demo";
import type { PlanId } from "@/lib/plans";
import { BigLink, NoticeCard, PayShell, SoftLink, SoonCard } from "./pay-ui";

/** pack — 크레딧 묶음 값(크레딧일 때만). 없으면 '다시 해 볼게요'가 요금제 화면으로 간다. */
export function FailView({ code, plan, pack = null }: { code: FailCode; plan: PlanId; pack?: number | null }) {
  const { theme } = useTheme();
  const colors = theme.colors;

  if (PAY_DEMO === "off") {
    return (
      <PayShell>
        <SoonCard colors={colors} />
      </PayShell>
    );
  }

  return (
    <PayShell demo>
      <NoticeCard
        tone="warn"
        title="결제가 되지 않았어요"
        body={
          <>
            <span className="block font-extrabold text-neutral-700">돈은 나가지 않았어요.</span>
            <span className="mt-1 block">{failCopy(code)}</span>
          </>
        }
      >
        {/* replace — 실패 화면을 기록에 남기지 않아, 결제하기의 ← 가 실패 화면이 아니라 온 곳으로 간다 */}
        <BigLink href={checkoutHref(plan, pack)} colors={colors} replace>
          다시 해 볼게요
        </BigLink>
        <SoftLink href="/plans" replace>
          요금제 다시 보기
        </SoftLink>
      </NoticeCard>
    </PayShell>
  );
}
