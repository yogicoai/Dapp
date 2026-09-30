"use client";

/**
 * 사업자 정보·약관 (/admin/business) — 사이트 맨 아래 사업자 정보 줄과 약관 셋을 등록하는 곳.
 *
 * 사장님 말(2026-09-30): "대표 (등록 예정) · 사업자등록번호 (등록 예정) / 통신판매업 신고번호 … /
 * 이용약관 (준비 중) · 개인정보처리방침 (준비 중) — 이부분도 해당 페이지에 대한 어드민 페이지 그때 만든거
 * 거기다가 등록하게 해서 관리되게하자".
 *
 * 탭 넷(사업자 정보 · 이용약관 · 개인정보처리방침 · 환불 안내)은 모두 한 번에 그려 두고 hidden 으로만 감춘다 —
 * 탭을 옮겨도 쓰던 약관 초안·입력이 사라지지 않게. 탭은 주소(?tab=)에 둔다(새로 고침해도 같은 탭).
 * 바꾸기·게시는 회사 계정만 된다(서버와 DB 가 막는다). 다른 계정은 같은 화면을 보기만 한다.
 */
import { useTabParam, PageHeader, SectionTabs, useAdminQuery, Icon } from "@/components/admin/kit";
import { LEGAL_DOCS, LEGAL_KINDS, type LegalKind } from "@/lib/legal-doc";
import { FALLBACK_SITE_INFO, type BusinessAdminResponse } from "@/lib/site-info";
import { BusinessInfoPanel } from "./BusinessInfoForm";
import { LegalDocEditor } from "./LegalDocEditor";

const TABS = ["info", ...LEGAL_KINDS] as const;

const TAB_LABEL: Record<LegalKind, string> = { terms: "이용약관", privacy: "개인정보처리방침", refund: "환불 안내" };

export function BusinessPage() {
  const [tab, setTab] = useTabParam("tab", TABS, "info");
  const biz = useAdminQuery<BusinessAdminResponse>("/api/admin/business");
  const docs = biz.data?.docs;
  const companyName = biz.data?.info.name ?? FALLBACK_SITE_INFO.business.name;

  return (
    <>
      <PageHeader
        title="사업자 정보·약관"
        description="사이트 맨 아래 사업자 정보와 이용약관·개인정보처리방침·환불 안내를 등록하는 곳이에요. 바꾸면 사이트에 1~5분 안에 반영돼요."
        actions={
          <a
            href="/plans"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-white px-3.5 text-sm font-bold text-[#4e5968] hover:bg-[#e8f3ff] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#3182f6]"
          >
            사이트 맨 아래 줄 보기
            <Icon name="external" size={16} />
          </a>
        }
      />

      <SectionTabs
        label="사업자 정보·약관 나누기"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "info", label: "사업자 정보" },
          ...LEGAL_KINDS.map((k) => ({
            key: k,
            label: TAB_LABEL[k],
            // 문서 목록을 읽은 뒤에만 표시한다 — 모르는 동안 '준비 중'이라고 단정하지 않는다.
            badge: docs && !docs[k].ready ? "준비 중" : null,
            badgeTone: "amber" as const,
          })),
        ]}
      />

      <div role="tabpanel" aria-label="사업자 정보" hidden={tab !== "info"} className="flex flex-col gap-6">
        <BusinessInfoPanel query={biz} />
      </div>
      {LEGAL_KINDS.map((k) => (
        <div key={k} role="tabpanel" aria-label={LEGAL_DOCS[k].title} hidden={tab !== k} className="flex flex-col gap-6">
          <LegalDocEditor kind={k} companyName={companyName} onPublished={biz.reload} />
        </div>
      ))}
    </>
  );
}
