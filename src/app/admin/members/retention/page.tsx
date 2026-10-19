import type { Metadata } from "next";
import { Suspense } from "react";
import { RetentionPage } from "@/components/admin/members/RetentionPage";
import { PageSkeleton } from "@/components/admin/kit";

export const metadata: Metadata = { title: "탈퇴·삭제 보관함" };

// 겉틀(AdminShell)이 마스터 확인을 끝낸 뒤에만 이 화면을 그린다 — 여기서 따로 확인하거나 읽지 않는다.
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RetentionPage />
    </Suspense>
  );
}
