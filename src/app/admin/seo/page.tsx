import type { Metadata } from "next";
import { Suspense } from "react";
import { SeoPage } from "@/components/admin/seo/SeoPage";
import { PageSkeleton } from "@/components/admin/kit";

export const metadata: Metadata = { title: "검색 노출(SEO)" };

// 겉틀(AdminShell)이 마스터 확인을 끝낸 뒤에만 이 화면을 그린다 — 여기서 따로 확인하거나 읽지 않는다.
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SeoPage />
    </Suspense>
  );
}
