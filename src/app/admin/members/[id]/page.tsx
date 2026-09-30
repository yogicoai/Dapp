import type { Metadata } from "next";
import { Suspense } from "react";
import { MemberDetailPage } from "@/components/admin/members/MemberDetailPage";
import { PageSkeleton } from "@/components/admin/kit";

export const metadata: Metadata = { title: "회원" };

// params 는 Promise 다(Next 16). id 가 uuid 모양인지는 화면이 본다 — 서버 확인은 /api/admin/* 가 한다.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<PageSkeleton />}>
      <MemberDetailPage id={id} />
    </Suspense>
  );
}
