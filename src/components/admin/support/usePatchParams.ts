"use client";

/**
 * 주소 쿼리 여러 칸을 **한 번에** 바꾼다(기록을 남기지 않는 replace, 스크롤 그대로).
 *
 * 왜 따로 있나: '처리 끝난 것도 보기'를 누르면 resolved 를 켜면서 kind(종류 거르기)도 함께 풀어야 한다.
 * 칸마다 따로 replace 하면 두 번째 호출이 첫 번째 바뀜을 모르는 옛 주소로 덮어써서 하나가 사라진다.
 * 부르는 화면은 page.tsx 의 <Suspense> 안에 있다(useSearchParams 빌드 규칙).
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { withParams } from "@/lib/admin-console";

export function usePatchParams(): (patch: Record<string, string | null>) => void {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return useCallback(
    (patch: Record<string, string | null>) => {
      router.replace(`${pathname}${withParams(sp.toString(), patch)}`, { scroll: false });
    },
    [router, pathname, sp],
  );
}
