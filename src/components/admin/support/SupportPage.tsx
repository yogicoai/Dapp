"use client";

/**
 * 의견·오류(/admin/support) — 만들기 사고와 고객 의견을 한곳에서 처리한다(2026-09-30 정식판).
 * 옛 관리실(한 화면)의 '사고'·'의견' 메뉴를 탭 둘로 옮겼다.
 *
 * 주소가 화면 상태다: ?tab=incidents|feedback|reports · ?mine=1 · (사고) ?kind= ?resolved=1 ?job= ?entry= · (의견) ?all=1.
 * 대시보드의 '돈 냈는데 책 없음'은 ?tab=incidents&kind=paid_not_saved 로 곧장 들어온다.
 *
 * 탭은 **처음 열 때 만들고, 그 뒤로는 감추기만** 한다 — 의견에 답을 쓰다가 사고 탭을 보고 와도
 * 쓰던 답변이 남게(옛 관리실의 seen 과 같다). 처음 열기 전에는 만들지 않아 안 보는 탭이 서버를 부르지 않는다.
 *
 * '내 계정 것도 보기'(사장님 2026-09-30): 관리자 계정에서 생긴 사고·의견은 평소엔 서버가 빼고 준다.
 * 점검할 때만 켜서 함께 본다. 메뉴·탭 숫자는 켜도 늘 뺀 숫자다(서버 /api/admin/badges).
 */
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { SUPPORT_TABS, type SupportTab } from "@/lib/admin-support";
import { Banner, PageHeader, SectionTabs, Switch, useMineParam, useTabParam } from "@/components/admin/kit";
import { useAdmin } from "@/components/admin/shell/AdminContext";
import { FeedbackTab } from "./FeedbackTab";
import { IncidentsTab } from "./IncidentsTab";
import { ReportsTab } from "./ReportsTab";

export function SupportPage() {
  const { badges } = useAdmin();
  const [tabRaw, setTab] = useTabParam("tab", SUPPORT_TABS, "incidents");
  const tab = tabRaw as SupportTab;
  const [mine, setMine] = useMineParam();
  const sp = useSearchParams();
  // 사고 서랍 주소(?job= / ?entry=)로 들어왔으면 사고 탭도 만들어 둔다 — 서랍이 사고 탭 안에 있다.
  const caseInUrl = !!(sp.get("job") || sp.get("entry"));

  // 한 번이라도 연 탭. 주소(뒤로 가기 포함)로 탭이 바뀌어도 따라가도록, 그리는 중에 모자라면 더한다
  // (React 가 허락하는 '앞 렌더 정보 기억하기' 방식 — 조건이 있어 한 번만 다시 그린다).
  const [seen, setSeen] = useState<ReadonlySet<SupportTab>>(() => new Set<SupportTab>([tab]));
  if (!seen.has(tab)) setSeen(new Set(seen).add(tab));
  const mounted = (k: SupportTab) => seen.has(k) || (k === "incidents" && caseInUrl);

  return (
    <>
      <PageHeader
        title="의견·오류"
        description="만들기 사고와 고객 의견을 처리하는 곳이에요."
        actions={<Switch checked={mine} onChange={setMine} label="내 계정 것도 보기" />}
      />

      {mine ? (
        <Banner tone="info" title="내 계정에서 생긴 기록도 함께 보여요">
          메뉴 숫자에는 넣지 않아요.
        </Banner>
      ) : null}

      <div className="flex flex-col gap-5">
        <SectionTabs
          label="의견·오류 나누기"
          value={tab}
          onChange={setTab}
          tabs={[
            {
              key: "incidents",
              label: "사고",
              badge: badges.incidents,
              // '돈 냈는데 책 없음'이 하나라도 있으면 빨강 — 가장 급한 컴플레인이다.
              badgeTone: (badges.paidNotSaved ?? 0) > 0 ? "red" : "gray",
            },
            { key: "feedback", label: "의견", badge: badges.feedback, badgeTone: "gray" },
            // AI 결과물 신고(2026-10-20) — 숫자는 탭 안 '처리 전' 칩이 말한다
            { key: "reports", label: "신고" },
          ]}
        />

        <div role="tabpanel" aria-label="사고" hidden={tab !== "incidents"}>
          {mounted("incidents") ? <IncidentsTab mine={mine} active={tab === "incidents"} /> : null}
        </div>
        <div role="tabpanel" aria-label="의견" hidden={tab !== "feedback"}>
          {mounted("feedback") ? <FeedbackTab mine={mine} /> : null}
        </div>
        <div role="tabpanel" aria-label="신고" hidden={tab !== "reports"}>
          {mounted("reports") ? <ReportsTab mine={mine} /> : null}
        </div>
      </div>
    </>
  );
}
