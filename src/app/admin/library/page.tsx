import type { Metadata } from "next";
import { Suspense } from "react";
import { LibraryPage } from "@/components/admin/library/LibraryPage";
import { PageSkeleton } from "@/components/admin/kit";

export const metadata: Metadata = { title: "공개 동화" };

// 겉틀(AdminShell)이 마스터 확인을 끝낸 뒤에만 이 화면을 그린다 — 여기서 따로 확인하거나 읽지 않는다.
// Suspense 는 화면이 주소 칸(useSearchParams)을 읽기 때문에 필요하다(없으면 배포 빌드가 멈춘다).
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <LibraryPage />
    </Suspense>
  );
}
