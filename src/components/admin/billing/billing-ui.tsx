"use client";

/**
 * 결제·구독 화면끼리 같이 쓰는 작은 부품 — 회원 칸 · 시연 배지 · CSV 내려받기 · '목록에 없어요' · 준비 전 띠.
 *
 * 탭 세 개(결제 내역 · 구독 · 환불)와 서랍 세 개가 같은 모양을 쓰게 여기 둔다.
 * 다른 화면(회원 등)은 이 폴더를 가져오지 않는다 — 나눌 것은 kit 이나 lib/admin-billing.ts 로 간다.
 */
import { useState, type ReactNode } from "react";
import { josa, memberText, type BillingKind } from "@/lib/admin-billing";
import type { BillingDemoData } from "@/lib/admin-billing-demo";
import { AdminLink, Badge, Banner, Button, EmptyState, Icon, SearchInput } from "@/components/admin/kit";

/** 탭·서랍이 받는 공통 길잡이 — 주소 한 칸(id)으로 서랍을 열고, 다른 탭으로 건너간다. */
export type BillingNav = {
  /** 시연 데이터(주소 ?demo=1). 꺼져 있으면 null — 실제 목록을 서버에서 읽는다. */
  demo: BillingDemoData | null;
  /** 지금 주소의 서랍 id(없으면 null). 이 탭이 켜져 있을 때만 뜻이 있다. */
  drawerId: string | null;
  openDrawer: (id: string) => void;
  closeDrawer: () => void;
  /** 주소 몇 칸을 바꾼다(기록을 남기지 않는다) — 거르기·다른 탭으로 건너가기. */
  goto: (patch: Record<string, string | null>) => void;
  /** 겉틀 시계(ms) — CSV 파일 이름의 날짜. */
  clock: number;
};

/** 시연 줄 표시 — 글자와 줄무늬를 함께(색만으로 알리지 않는다). */
export function DemoTag() {
  return <Badge tone="demo">시연</Badge>;
}

/**
 * 회원 칸 — 실제 줄은 회원 화면으로 가는 링크, 탈퇴한 회원은 흐린 '탈퇴한 회원 · 아이디 사진',
 * 시연 줄은 링크 없이 글자만(시연 회원은 DB 에 없다).
 * 표 안에서는 link={false} — 폰 카드는 줄 전체가 단추라 그 안에 링크를 넣으면 누르는 곳이 겹친다. 링크는 서랍에서.
 */
export function MemberCell({ owner, username, demo, link = true }: { owner: string | null; username: string | null; demo?: boolean; link?: boolean }) {
  const text = memberText(owner, username);
  if (!owner) return <span className="text-[#8b95a1]">{text}</span>;
  if (demo || !link) return <span>{text}</span>;
  return (
    <AdminLink
      href={`/admin/members/${owner}`}
      onClick={(e) => e.stopPropagation()}
      className="font-bold text-[#1b64da] underline-offset-2 hover:underline"
    >
      {text}
    </AdminLink>
  );
}

/**
 * CSV 내려받기 — 지금 거른 줄 그대로. 엑셀이 한글을 읽도록 맨 앞에 BOM 을 붙인다.
 * 파일은 이 브라우저에서만 만든다(서버에 아무것도 보내지 않는다).
 */
export function CsvButton({ filename, build, disabled }: { filename: string; build: () => string; disabled?: boolean }) {
  const download = () => {
    const blob = new Blob([`﻿${build()}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <Button size="sm" tone="secondary" onClick={download} disabled={disabled} title="지금 보이는 줄을 CSV 로 내려받아요">
      <Icon name="download" size={16} />
      CSV 내려받기
    </Button>
  );
}

/** 표·함수가 아직 없을 때(사장님이 SQL 을 아직 안 돌렸을 때) — 빨간 오류가 아니라 안내. */
export function SchemaNotReady() {
  return (
    <Banner tone="warn" title="데이터베이스 준비 전이에요 — 결제 표를 만든 뒤 열려요.">
      관리실 정식판 SQL(supabase-admin-console.sql)을 돌리면 이 화면이 열려요.
    </Banner>
  );
}

/** 빈 목록 — 거르기 때문인지, 정말 아무것도 없는지 나눠 말한다. */
export function BillingEmpty({
  filtered,
  noun,
  onReset,
  demo,
}: {
  filtered: boolean;
  noun: string;
  onReset: () => void;
  demo: boolean;
}) {
  if (filtered) {
    return (
      <EmptyState
        icon="search"
        title={`조건에 맞는 ${josa(noun, "이가")} 없어요`}
        body="거르기를 풀면 전체가 보여요."
        action={
          <Button size="sm" onClick={onReset}>
            거르기 풀기
          </Button>
        }
      />
    );
  }
  return (
    <EmptyState
      icon="card"
      title={`아직 ${josa(noun, "이가")} 없어요`}
      body={demo ? "시연 데이터에도 이 목록은 비어 있어요." : "결제 연동 뒤 여기 쌓여요."}
    />
  );
}

/** 서랍 주소의 줄이 지금 목록에 없을 때 — 거른 조건 밖이거나 최근 목록보다 오래된 줄. */
export function NotInList({ what, onReset }: { what: string; onReset: () => void }) {
  return (
    <EmptyState
      icon="search"
      title={`이 목록에서 ${josa(what, "을를")} 찾지 못했어요`}
      body="거르기 때문에 안 보이거나, 최근 목록보다 오래된 줄일 수 있어요."
      action={
        <Button size="sm" onClick={onReset}>
          거르기 풀고 다시 찾기
        </Button>
      }
    />
  );
}

/** 서랍 안 작은 제목. */
export function DrawerSection({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="mt-6 flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[15px] font-bold text-[#191f28]">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** 목록 위 '이 목록 기준' 합계 줄 · 결과 수. */
export function resultText(shown: number, total: number, truncated: boolean): string {
  return truncated ? `${shown}건 보임 · 전체 ${total}건` : `${shown}건`;
}

/** 서랍 여는 줄 종류 이름(목록에 없어요 문구에 쓴다). */
export const KIND_NOUN: Record<BillingKind, string> = { payments: "결제", subscriptions: "구독", refunds: "환불 요청" };

/**
 * 검색칸 — 치는 동안은 화면 안에만 두고, Enter(또는 ×)일 때 주소(q)에 올린다(칠 때마다 서버를 부르지 않게).
 * 주소의 q 가 밖에서 바뀌면(다른 탭에서 건너옴) 부르는 쪽이 key 를 바꿔 새 값으로 다시 연다.
 */
export function BillingSearch({
  initial,
  onSubmit,
  placeholder,
  label,
}: {
  initial: string;
  onSubmit: (q: string) => void;
  placeholder: string;
  label: string;
}) {
  const [v, setV] = useState(initial);
  return <SearchInput value={v} onChange={setV} onSubmit={(x) => onSubmit(x.trim())} placeholder={placeholder} label={label} />;
}

/** 서랍을 닫으면 그 서랍을 연 줄로 초점을 돌린다(키보드로 표를 오가는 사람이 자리를 잃지 않게). */
export function focusLater(el: HTMLElement | null) {
  if (!el) return;
  setTimeout(() => {
    if (el.isConnected) el.focus();
  }, 0);
}
