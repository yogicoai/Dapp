"use client";

/**
 * 관리자 페이지 문 앞 화면 — 확인 중 · 로그인 필요 · 들어올 수 없음 · 연결 안 됨.
 *
 * 이 화면들은 메뉴도 데이터도 없다. 겉틀(AdminShell)이 /api/admin/me 로 서버에 확인하기 전에는
 * 메뉴·화면을 아예 그리지 않으므로, 마스터가 아닌 사람은 관리 화면의 모양조차 보지 못한다.
 * '들어올 수 없어요'는 누가 들어올 수 있는지 말하지 않는다(계정 구성을 드러내지 않는다).
 *
 * 관리자 로그인은 이 문 앞에서 한다(사장님 2026-11-13 "관리자단은 /admin 으로 가서 거기서 로그인") — 손님 로그인 화면(/login)은
 * 구글만 남기고 아이디 칸을 뺐다("고객이 저게 뭐야 할 것 같아서"). 아이디·비밀번호로 로그인하면 같은 확인(onRetry)을 다시 돈다.
 * 다른 계정(구글 손님 계정 등)으로 들어와 막히면 '관리자 계정으로 다시 로그인'이 로그아웃하고 이 칸을 다시 연다.
 */
import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { logIn, logOut } from "@/lib/auth";
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

const FIELD =
  "min-h-11 w-full rounded-xl border border-[#e5e8eb] bg-white px-3.5 text-[15px] font-semibold text-[#191f28] outline-none focus:border-[#3182f6]";

/**
 * 관리자 아이디 로그인 — 이 주소(열려던 기록 포함) 그대로 로그인하고, 끝나면 같은 확인을 다시 돈다(onDone = onRetry).
 * 그래서 로그인 뒤 다른 화면으로 보냈다가 돌아올 일이 없다.
 */
function AdminLoginForm({ onDone }: { onDone: () => void }) {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const res = await logIn(id, pw);
    setBusy(false);
    if (res.ok) onDone();
    else setError(res.error);
  }
  return (
    <form onSubmit={submit} className="mt-1 flex w-full flex-col gap-2 text-left">
      <label htmlFor="admin-login-id" className="text-xs font-bold text-[#6b7684]">
        아이디
      </label>
      <input id="admin-login-id" value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" className={FIELD} />
      <label htmlFor="admin-login-pw" className="mt-1 text-xs font-bold text-[#6b7684]">
        비밀번호
      </label>
      <input
        id="admin-login-pw"
        type="password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        autoComplete="current-password"
        className={FIELD}
      />
      {error && (
        <p role="alert" className="break-keep text-[13px] font-bold text-[#f04452]">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy || !id.trim() || !pw} className={`${PRIMARY} mt-2 disabled:opacity-50`}>
        {busy ? "로그인하는 중…" : "로그인"}
      </button>
    </form>
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
          title="관리자 로그인"
          body="관리자 아이디로 로그인해 주세요."
          actions={
            <div className="flex w-full flex-col gap-2">
              <AdminLoginForm onDone={onRetry} />
              <Link href="/" className={SECONDARY}>
                사이트로
              </Link>
            </div>
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
            <>
              <button
                type="button"
                onClick={() => {
                  void logOut().finally(onRetry);
                }}
                className={PRIMARY}
              >
                관리자 계정으로 다시 로그인
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
