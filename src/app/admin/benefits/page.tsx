import type { Metadata } from "next";
import { Suspense } from "react";
import { BenefitsPage } from "@/components/admin/benefits/BenefitsPage";
import { PageSkeleton } from "@/components/admin/kit";

export const metadata: Metadata = { title: "혜택·이벤트 관리" };

// 겉틀(AdminShell)이 마스터 확인을 끝낸 뒤에만 이 화면을 그린다 — 여기서 따로 확인하거나 읽지 않는다.
// Suspense 는 화면이 주소 칸(useUrlDrawer — 열어 둔 고객 목록)을 읽기 때문에 필요하다(없으면 배포 빌드가 멈춘다).
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BenefitsPage />
    </Suspense>
  );
}
