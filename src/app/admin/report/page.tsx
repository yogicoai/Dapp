import type { Metadata } from "next";
import { Suspense } from "react";
import { ReportPage } from "@/components/admin/report/ReportPage";
import { PageSkeleton } from "@/components/admin/kit";

export const metadata: Metadata = { title: "가격정책 확인 데이터" };

// 가격정책 확인 데이터(지울 예정) — 출시 전에 이 파일·메뉴(admin-console ADMIN_NAV)·/api/admin/report·lib/admin-report 를 함께 지운다.
// 겉틀(AdminShell)이 마스터 확인을 끝낸 뒤에만 그린다. Suspense 는 관리실 공용 훅(주소 칸)을 위해.
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ReportPage />
    </Suspense>
  );
}
