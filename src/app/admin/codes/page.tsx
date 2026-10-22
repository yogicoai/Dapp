import type { Metadata } from "next";
import { Suspense } from "react";
import { CodesPage } from "@/components/admin/codes/CodesPage";
import { PageSkeleton } from "@/components/admin/kit";

export const metadata: Metadata = { title: "혜택 코드" };

// 겉틀(AdminShell)이 마스터 확인을 끝낸 뒤에만 이 화면을 그린다 — 여기서 따로 확인하거나 읽지 않는다.
// Suspense 는 다른 관리실 화면과 같은 껍데기 모양(주소 칸을 읽는 화면이 배포 빌드에서 멈추지 않게).
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CodesPage />
    </Suspense>
  );
}
