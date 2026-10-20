"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import {
  enterGuest,
  finishOAuthLogin,
  isGoogleLoginEnabled,
  logIn,
  signInWithGoogle,
} from "@/lib/auth";
import { safeAdminNext } from "@/lib/admin-console";
import { RETENTION_DAYS } from "@/lib/retention";
import { usePricing } from "@/lib/use-pricing";

/**
 * 로그인 / 가입 — 가입은 구글로만 받는다(2026-10-16 사장님 "웹 오픈은 구글 회원가입으로만").
 * 구글로 처음 들어오면 그대로 가입된다(가입 트리거가 회원 줄과 가입 토큰을 만든다).
 * 아이디·비밀번호는 이미 있는 계정(관리자·베타 회원)의 로그인만 — 새 아이디 가입 탭은 없앴다(auth.signUp 은 남겨 둠).
 * 성공하면 서재(/)로 보낸다.
 * 관리자 페이지 문 앞에서 온 로그인(?next=/admin…)이면 로그인 뒤 그 주소로 돌려보낸다 — 열려던 기록을 다시 찾지 않게.
 * 관리실 주소만 받는다(safeAdminNext) — 아무 주소나 받으면 남의 링크로 엉뚱한 곳에 보내는 길이 된다.
 */
function afterLoginPath(): string {
  if (typeof window === "undefined") return "/";
  return safeAdminNext(new URLSearchParams(window.location.search).get("next")) ?? "/";
}

export default function LoginPage() {
  const router = useRouter();
  // 가입 지급 토큰은 관리실 가격표에서 읽는다(못 읽으면 지금까지 쓰던 값).
  const pricing = usePricing();
  const { theme } = useTheme();
  const { accent, accentDark } = theme.colors;

  // 아이디 로그인 칸 — 구글이 켜져 있으면 접어 두고(기존 회원만 연다), 꺼져 있으면 처음부터 연다.
  const [idOpen, setIdOpen] = useState(!isGoogleLoginEnabled());
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // 회원 탈퇴 뒤 넘어왔을 때(?bye=1, 설정 › 회원 탈퇴) — 주소는 첫 화면을 그린 뒤에야 읽을 수 있어 효과에서 한 번 본다.
  const [bye, setBye] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBye(new URLSearchParams(window.location.search).get("bye") === "1");
  }, []);

  /*
   * 구글에서 돌아왔을 때 — 크롬이 이 화면으로 되돌려 보낸다.
   * 로그인이 됐으면 아이디 로그인과 같은 뒷정리를 하고 서재로 보낸다.
   * 그냥 로그인 화면을 연 경우에는 아무 일도 일어나지 않는다.
   */
  useEffect(() => {
    if (!isGoogleLoginEnabled()) return;
    let alive = true;
    finishOAuthLogin()
      .then((res) => {
        if (!alive || !res) return;
        if (res.ok) router.replace(afterLoginPath());
        else setError(res.error);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [router]);

  async function google() {
    if (busy) return;
    setError("");
    setBusy(true);
    const res = await signInWithGoogle();
    // 성공하면 화면이 구글로 넘어가므로 여기로 돌아오지 않는다.
    if (!res.ok) {
      setError(res.error ?? "구글 로그인을 시작하지 못했어요.");
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    const res = await logIn(id, pw);
    if (res.ok) {
      router.push(afterLoginPath());
    } else {
      setError(res.error);
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-dvh w-full overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={theme.background} alt="" className="fixed inset-0 -z-10 h-full w-full object-cover" />
      <div className="fixed inset-0 -z-10 bg-white/35" />

      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10">
        <div className="flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={theme.mascot}
            alt=""
            className="h-20 w-20 rounded-full border-4 border-white object-cover shadow"
          />
          <h1
            className="text-2xl font-extrabold text-white"
            style={{ textShadow: "0 2px 8px rgba(0,0,0,0.45)" }}
          >
            우리 가족 보이스 동화
          </h1>
        </div>

        <div className="mt-6 rounded-[28px] bg-white/92 p-7 shadow-xl backdrop-blur">
          {bye && (
            <p role="status" className="mb-4 break-keep rounded-xl bg-neutral-50 px-3 py-2.5 text-center text-xs font-bold leading-relaxed text-neutral-600">
              탈퇴가 끝났어요. 그동안 함께해 주셔서 고마워요.
              <br />
              만든 동화와 그림은 {RETENTION_DAYS}일 뒤 완전히 지워져요.
            </p>
          )}
          {/*
            구글로 시작하기 — 가입은 이 단추 하나로만 받는다. 설정을 켠 뒤에만 보인다(NEXT_PUBLIC_GOOGLE_LOGIN=1).
            안 켠 채로 단추만 있으면 눌렀을 때 오류만 나므로 아예 감추고, 가입은 준비 중이라고만 알린다.
          */}
          {isGoogleLoginEnabled() ? (
            <p className="mb-3 text-center text-sm font-extrabold text-neutral-600">구글 계정으로 가입하고 로그인해요</p>
          ) : (
            <p className="mb-3 rounded-xl bg-neutral-50 px-3 py-2 text-center text-xs font-bold text-neutral-500">
              새 가입은 구글 계정으로 받아요 · 지금은 준비 중이에요
            </p>
          )}
          {isGoogleLoginEnabled() && (
            <button
              type="button"
              onClick={google}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2.5 rounded-full border-2 border-neutral-200 bg-white px-4 py-3.5 text-base font-extrabold text-neutral-700 shadow-sm transition hover:bg-neutral-50 disabled:opacity-60"
            >
              <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
                <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.3z" />
                <path fill="#34A853" d="M24 46c6 0 11-2 14.5-5.2l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8 41.3 15.4 46 24 46z" />
                <path fill="#FBBC05" d="M11.8 28.4c-.4-1.3-.7-2.7-.7-4.4s.3-3 .7-4.4v-5.7H4.5C2.9 17.1 2 20.4 2 24s.9 6.9 2.5 10.1l7.3-5.7z" />
                <path fill="#EA4335" d="M24 10.4c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 3.9 30 2 24 2 15.4 2 8 6.7 4.5 13.9l7.3 5.7c1.7-5.2 6.5-9.2 12.2-9.2z" />
              </svg>
              구글로 시작하기
            </button>
          )}
          {isGoogleLoginEnabled() && pricing.signup_bonus_tokens > 0 && (
            <p className="mt-2 text-center text-xs font-bold text-neutral-500">
              🎁 처음 가입하면 무료 토큰 {pricing.signup_bonus_tokens}개를 드려요
            </p>
          )}

          {/* 이미 있는 아이디 계정(관리자·베타 회원)의 로그인 — 새 아이디 가입은 받지 않는다 */}
          {idOpen ? (
            <form onSubmit={submit} className="mt-5 flex flex-col gap-3 border-t border-neutral-200 pt-4">
              <p className="text-center text-xs font-bold text-neutral-400">기존 아이디로 로그인</p>
              <div>
                <label htmlFor="login-id" className="mb-1.5 block text-sm font-bold text-neutral-500">
                  아이디
                </label>
                <input
                  id="login-id"
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  autoComplete="username"
                  className="w-full rounded-2xl border-2 border-neutral-200 px-4 py-3 text-base font-bold outline-none focus:border-neutral-400"
                />
              </div>
              <div>
                <label htmlFor="login-pw" className="mb-1.5 block text-sm font-bold text-neutral-500">
                  비밀번호
                </label>
                <input
                  id="login-pw"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  type="password"
                  autoComplete="current-password"
                  className="w-full rounded-2xl border-2 border-neutral-200 px-4 py-3 text-base font-bold outline-none focus:border-neutral-400"
                />
              </div>
              <button
                type="submit"
                style={{ background: accent, boxShadow: `0 5px 0 ${accentDark}` }}
                className="mt-1 rounded-full py-3.5 text-lg font-extrabold text-white transition-transform active:translate-y-0.5"
              >
                로그인
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => {
                setIdOpen(true);
                setError("");
              }}
              className="mt-3 flex min-h-11 w-full items-center justify-center text-xs font-bold text-neutral-500 underline underline-offset-2"
            >
              기존 아이디로 로그인
            </button>
          )}

          {error && <p className="mt-3 text-center text-sm font-bold text-red-600">{error}</p>}

          {/* 비회원 둘러보기 — 전래동화·세계명작만 열람. 만들기·내 책장은 로그인 필요. */}
          <button
            type="button"
            onClick={() => {
              enterGuest();
              router.push("/");
            }}
            className="mt-3 w-full break-keep rounded-full bg-neutral-100 px-4 py-3 text-sm font-extrabold text-neutral-600 transition hover:bg-neutral-200"
          >
            비회원으로 둘러보기 (전래동화·세계명작)
          </button>
        </div>

        {/* 가입 전에도 값을 볼 수 있게 — /plans 는 로그인 없이 열린다 */}
        {/* 처음 온 분은 대개 이 화면을 먼저 본다(비회원은 홈에서 로그인으로 온다) — 사용 가이드를 요금제와 나란히(2026-10-20) */}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Link
            href="/guide"
            className="inline-flex min-h-11 items-center rounded-full bg-white/85 px-4 text-sm font-extrabold text-neutral-700 shadow backdrop-blur transition hover:bg-white"
          >
            📖 사용 가이드 ›
          </Link>
          <Link
            href="/plans"
            className="inline-flex min-h-11 items-center rounded-full bg-white/85 px-4 text-sm font-extrabold text-neutral-700 shadow backdrop-blur transition hover:bg-white"
          >
            요금제 보기 ›
          </Link>
        </div>

        <p className="mt-3 text-center text-xs font-medium text-white/90" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.4)" }}>
          가입은 구글 계정으로만 받아요
        </p>
      </main>
    </div>
  );
}
