"use client";

/**
 * 회원 화면 작은 부품 — 부모 목소리 배지 · 요금제 배지.
 * 엄마·아빠 둘 다 늘 보이고, 등록 안 된 쪽은 흐리게 둔다(설정 화면 관리실과 같은 모양).
 * 색만으로 뜻을 전하지 않게 화면 읽기 프로그램에는 '엄마 등록 · 아빠 없음'을 읽어 준다.
 */
import { useState } from "react";
import { membersListHref, voiceBadges } from "@/lib/admin-members";
import { activePlanKey, kstDateText, MEMBER_PLAN_LABEL, type MemberPlanKey } from "@/lib/member-plan";
import { AdminLink, Badge, Icon, type BadgeTone } from "@/components/admin/kit";

const PLAN_TONE: Record<MemberPlanKey, BadgeTone> = { free: "green", starter: "amber", monthly: "blue", yearly: "blue" };

/**
 * 요금제 배지 — 지정 없음은 '–', 끝나는 때가 지났으면 회색 '끝남'. now 는 관리실 시계(clock)를 넘긴다
 * (그리는 동안 시각이 바뀌어 서버·화면 모양이 어긋나지 않게).
 */
export function PlanBadge({ plan, endsAt, now }: { plan: MemberPlanKey | null; endsAt: string | null; now: number }) {
  if (!plan) {
    return (
      <span className="text-[#b0b8c1]" aria-label="요금제 지정 없음">
        –
      </span>
    );
  }
  const end = kstDateText(endsAt);
  if (!activePlanKey({ plan, endsAt }, now)) {
    return (
      <Badge tone="gray" title={`${end}에 끝났어요`}>
        {MEMBER_PLAN_LABEL[plan]} · 끝남
      </Badge>
    );
  }
  return (
    <Badge tone={PLAN_TONE[plan]} title={end ? `${end}까지` : "끝나는 날 없음"}>
      {MEMBER_PLAN_LABEL[plan]}
    </Badge>
  );
}

/*
 * 회원 목록 → 회원 → [회원 목록]으로 돌아올 때 거른 목록 그대로 — 목록에서 줄을 누를 때 그 회원 id 와
 * 거르기를 이 창(sessionStorage)에 적어 둔다. 다른 곳(대시보드·사고 서랍)에서 들어온 회원이면 id 가 달라
 * 거르기 없는 목록으로 간다(엉뚱한 옛 거르기를 되살리지 않게). 저장이 막힌 브라우저면 그냥 전체 목록.
 */
const LIST_KEY = "admin.members.list";

export function rememberMembersList(memberId: string, search: string): void {
  try {
    sessionStorage.setItem(LIST_KEY, JSON.stringify({ id: memberId.toLowerCase(), search }));
  } catch {
    /* 저장 못 해도 목록으로는 돌아간다 */
  }
}

function savedListSearch(memberId: string): string | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(LIST_KEY) ?? "null") as { id?: unknown; search?: unknown } | null;
    return v && v.id === memberId.toLowerCase() && typeof v.search === "string" ? v.search : null;
  } catch {
    return null;
  }
}

/** [회원 목록] 단추 — 이 회원을 목록에서 열었으면 그때의 검색·거르기로 돌아간다. */
export function MembersBackLink({ memberId }: { memberId: string }) {
  // 겉틀이 마스터 확인 뒤에만(브라우저에서만) 그리므로 첫 그리기에서 읽어도 서버 그림과 어긋나지 않는다.
  const [href] = useState(() => membersListHref(savedListSearch(memberId)));
  return (
    <AdminLink
      href={href}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-[#f2f4f6] px-4 text-sm font-bold text-[#4e5968] hover:bg-[#e5e8eb] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#3182f6]"
    >
      <Icon name="back" size={16} />
      회원 목록
    </AdminLink>
  );
}

export function VoiceBadges({ voices }: { voices: readonly string[] }) {
  const list = voiceBadges(voices);
  const text = list.map((b) => `${b.label} ${b.on ? "등록" : "없음"}`).join(" · ");
  return (
    <span className="inline-flex items-center gap-1" title={`부모 목소리 — ${text}`}>
      <span className="sr-only">부모 목소리 {text}</span>
      {list.map((b) =>
        b.on ? (
          <span key={b.role} aria-hidden>
            <Badge tone="blue">{b.label}</Badge>
          </span>
        ) : (
          <span
            key={b.role}
            aria-hidden
            className="inline-flex whitespace-nowrap rounded-full bg-[#f9fafb] px-2 py-0.5 text-[12px] font-bold leading-[18px] text-[#b0b8c1] line-through decoration-[#d1d6db]"
          >
            {b.label}
          </span>
        ),
      )}
    </span>
  );
}
