"use client";

/**
 * 공개 동화 (/admin/library, 메뉴 '운영') — 회원 종류(비회원·무료 / 스타트팩 / 가족 패스)마다 어떤 세계명작·전래동화를
 * 보여 줄지 책마다 고르는 곳. 사장님 지시(2026-10-01 "단계별 공개할 동화 select로 정할 수 있는 창",
 * 10-02 "회원별로 세계명작/전래동화 어떤 책을 보여주게 한다라는 설정값 — 운영 쪽에").
 * 고르는 칸·저장·이력은 LibraryTiersPanel 이 한다. 값은 요금제·가격 화면과 같은 설정 한 줄(app_offer_settings)이다.
 */
import { PageHeader, useAdminQuery } from "@/components/admin/kit";
import type { OfferAdminResponse } from "@/lib/offer-settings";
import { LibraryTiersPanel } from "./LibraryTiersPanel";

export function LibraryPage() {
  const offer = useAdminQuery<OfferAdminResponse>("/api/admin/offer");
  return (
    <>
      <PageHeader
        title="공개 동화"
        description="회원 종류(비회원·무료 / 스타트팩 / 가족 패스)마다 어떤 세계명작·전래동화를 보여 줄지 책마다 골라요."
      />
      <LibraryTiersPanel query={offer} />
    </>
  );
}
