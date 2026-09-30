"use client";

/**
 * 결제 화면 상태 — 고객 결제 화면(/plans → /checkout)이 시연인지, '곧 열려요' 안내만인지.
 *
 * 값은 배포 설정의 환경 변수(NEXT_PUBLIC_PAY_DEMO)다. 빌드할 때 글자가 박히므로 반드시
 * `payDemoState(process.env.NEXT_PUBLIC_PAY_DEMO)` 를 글자 그대로 쓴다(변수에 담아 넘기면 늘 '켜짐'으로 보인다).
 * 규칙(off 일 때만 꺼짐)은 결제 시연 모듈과 같다 — 관리실은 그 모듈을 가져오지 않는다(pay-demo 규칙).
 */
import { payDemoState } from "@/lib/admin-console";
import { Badge, Card, CardTitle } from "@/components/admin/kit";

export function PayDemoCard() {
  const state = payDemoState(process.env.NEXT_PUBLIC_PAY_DEMO);
  const on = state === "on";
  return (
    <Card>
      <CardTitle hint={<Badge tone={on ? "amber" : "gray"}>{on ? "시연 켜짐" : "꺼짐"}</Badge>}>결제 화면 상태</CardTitle>
      <div className="flex flex-col gap-1.5 text-sm font-medium leading-relaxed text-[#4e5968]">
        <p className="break-keep">
          {on
            ? "고객이 결제 화면을 끝까지 눌러 볼 수 있지만 돈은 나가지 않아요."
            : "고객에게 '결제는 곧 열려요' 안내만 보여요."}
        </p>
        <p className="break-keep text-[13px] text-[#8b95a1]">바꾸려면 배포 설정의 환경 변수를 바꾸고 다시 배포해야 해요.</p>
      </div>
    </Card>
  );
}
