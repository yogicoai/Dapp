"use client";

/**
 * 구글 플레이로 산 가족 패스를 서버가 다시 맞추게 한다(lib/google-play-client syncPlaySoon) — 앱을 연 뒤 첫 화면,
 * 그 뒤로는 화면을 옮길 때 10분에 한 번. 다음 달 자동 결제·해지·환불과 연간 패스의 새 달 몫이 여기서 들어온다
 * (구글이 우리에게 따로 알려 주지 않는 동안의 길). 화면에 아무것도 그리지 않는다.
 */
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { syncPlaySoon } from "@/lib/google-play-client";

export function BillingSync() {
  const pathname = usePathname();
  useEffect(() => {
    void syncPlaySoon();
  }, [pathname]);
  return null;
}
