"use client";

/**
 * 관리자 페이지 문 앞 화면 — 확인 중 · 로그인 필요 · 들어올 수 없음 · 연결 안 됨.
 *
 * 이 화면들은 메뉴도 데이터도 없다. 겉틀(AdminShell)이 /api/admin/me 로 서버에 확인하기 전에는
 * 메뉴·화면을 아예 그리지 않으므로, 마스터가 아닌 사람은 관리 화면의 모양조차 보지 못한다.
 * '들어올 수 없어요'는 누가 들어올 수 있는지 말하지 않는다(계정 구성을 드러내지 않는다).
 */
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { safeAdminNext } from "@/lib/admin-console";
import { Icon, type IconName } from "../kit/Icon";

export type GateState = "checking" | "login" | "forbidden" | "error";

function Frame({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-1 items-center justify-center bg-[#f2f4f6] px-4 py-10 text-[#191f28]">
      {children}
    </main>
  );
}

function Card({
  icon,
  title,
  body,
  actions,
}: {
  icon: IconName;
  title: string;
  body: string;
  actions: ReactNode;
}) {
  return (
    <section className="flex w-full max-w-[400px] flex-col items-center gap-3 rounded-2xl bg-white px-6 py-8 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f2f4f6] text-[#6b7684]">
        <Icon name={icon} size={24} />
      </span>
      <h1 className="break-keep text-[19px] font-bold tracking-tight">{title}</h1>
      <p className="break-keep text-sm font-medium leading-relaxed text-[#6b7684]">{body}</p>
      <div className="mt-2 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">{actions}</div>
    </section>
  );
}

const PRIMARY =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-[#3182f6] px-5 text-sm font-bold text-white hover:bg-[#1b64da]";
const SECONDARY =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-[#f2f4f6] px-5 text-sm font-bold text-[#4e5968] hover:bg-[#e5e8eb]";

/**
 * [로그인하기] — 지금 열려던 관리실 주소를 ?next= 로 넘겨, 로그인 뒤 그 기록(예: /admin/billing?id=…)으로 바로 돌아오게.
 * 이 단추는 서버 확인이 401 을 준 뒤(브라우저에서)만 그려지므로 첫 그리기에서 주소를 읽어도 된다.
 */
function LoginLink() {
  const [href] = useState(() => {
    const next = typeof window === "undefined" ? null : safeAdminNext(window.location.pathname + window.location.search);
    return next ? `/login?next=${encodeURIComponent(next)}` : "/login";
  });
  return (
    <Link href={href} className={PRIMARY}>
      로그인하기
    </Link>
  );
}

export function NotAllowed({ state, onRetry }: { state: GateState; onRetry: () => void }) {
  if (state === "checking") {
    return (
      <Frame>
        <p role="status" className="flex items-center gap-2.5 text-sm font-bold text-[#8b95a1]">
          <span
            aria-hidden
            className="h-4 w-4 rounded-full border-2 border-[#d1d6db] border-t-[#3182f6] motion-safe:animate-spin"
          />
          확인하고 있어요
        </p>
      </Frame>
    );
  }
  if (state === "login") {
    return (
      <Frame>
        <Card
          icon="lock"
          title="로그인이 필요해요"
          body="관리자 계정으로 로그인한 뒤 다시 열어 주세요."
          actions={
            <>
              <LoginLink />
              <Link href="/" className={SECONDARY}>
                사이트로
              </Link>
            </>
          }
        />
      </Frame>
    );
  }
  if (state === "forbidden") {
    return (
      <Frame>
        <Card
          icon="lock"
          title="관리자만 들어올 수 있는 곳이에요"
          body="이 계정으로는 열 수 없어요."
          actions={
            <Link href="/" className={PRIMARY}>
              사이트로
            </Link>
          }
        />
      </Frame>
    );
  }
  return (
    <Frame>
      <Card
        icon="alert"
        title="잠시 연결이 안 돼요"
        body="인터넷 연결을 확인한 뒤 다시 시도해 주세요."
        actions={
          <>
            <button type="button" onClick={onRetry} className={PRIMARY}>
              다시 시도
            </button>
            <Link href="/" className={SECONDARY}>
              사이트로
            </Link>
          </>
        }
      />
    </Frame>
  );
}
