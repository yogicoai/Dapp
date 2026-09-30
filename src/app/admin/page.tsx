import { Suspense } from "react";
import { DashboardPage } from "@/components/admin/dashboard/DashboardPage";
import { PageSkeleton } from "@/components/admin/kit";

// 제목을 따로 두지 않는다 — 같은 층의 layout 제목 틀은 이 화면에 안 붙어서, layout 기본값('대시보드 · 관리자')을 쓴다.
// Suspense 는 화면이 주소 칸(useSearchParams)을 읽기 때문에 필요하다(없으면 배포 빌드가 멈춘다).
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DashboardPage />
    </Suspense>
  );
}
