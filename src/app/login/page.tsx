"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import {
  enterGuest,
  finishOAuthLogin,
  isGoogleLoginEnabled,
  logIn,
  signInWithGoogle,
  signUp,
} from "@/lib/auth";
import { usePricing } from "@/lib/use-pricing";

/**
 * 회원가입 / 로그인 — 베타. 아이디·비밀번호만.
 * 성공하면 서재(/)로 보낸다. 가입 시 보너스 토큰을 준다(auth.signUp).
 */
export default function LoginPage() {
  const router = useRouter();
  // 가입 지급 토큰은 관리실 가격표에서 읽는다(못 읽으면 지금까지 쓰던 값).
  const pricing = usePricing();
  const { theme } = useTheme();
  const { accent, accentDark } = theme.colors;

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
        if (res.ok) router.replace("/");
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
    const res = await (mode === "signup" ? signUp(id, pw) : logIn(id, pw));
    if (res.ok) {
      router.push("/");
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
          {/* 로그인 / 회원가입 탭 */}
          <div className="mb-5 flex rounded-full bg-neutral-100 p-1">
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError("");
                }}
                style={mode === m ? { background: accent } : undefined}
                className={`flex-1 rounded-full py-2 text-sm font-extrabold transition ${
                  mode === m ? "text-white shadow" : "text-neutral-500"
                }`}
              >
                {m === "login" ? "로그인" : "회원가입"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="flex flex-col gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-bold text-neutral-500">아이디</label>
              <input
                value={id}
                onChange={(e) => setId(e.target.value)}
                autoComplete="username"
                placeholder="영문·숫자, 2~20자"
                className="w-full rounded-2xl border-2 border-neutral-200 px-4 py-3 text-base font-bold outline-none focus:border-neutral-400"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-bold text-neutral-500">비밀번호</label>
              <input
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                placeholder="4자 이상"
                className="w-full rounded-2xl border-2 border-neutral-200 px-4 py-3 text-base font-bold outline-none focus:border-neutral-400"
              />
            </div>

            {error && <p className="text-center text-sm font-bold text-red-600">{error}</p>}

            {mode === "signup" && (
              <p className="rounded-xl bg-neutral-50 px-3 py-2 text-center text-xs font-bold text-neutral-500">
                🎁 가입하면 무료 토큰 {pricing.signup_bonus_tokens}개를 드려요
              </p>
            )}

            <button
              type="submit"
              style={{ background: accent, boxShadow: `0 5px 0 ${accentDark}` }}
              className="mt-1 rounded-full py-3.5 text-lg font-extrabold text-white transition-transform active:translate-y-0.5"
            >
              {mode === "signup" ? "가입하고 시작하기" : "로그인"}
            </button>
          </form>

          <div className="mt-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-neutral-200" />
            <span className="text-xs font-bold text-neutral-400">또는</span>
            <span className="h-px flex-1 bg-neutral-200" />
          </div>

          {/*
            구글로 시작하기 — 설정을 켠 뒤에만 보인다(NEXT_PUBLIC_GOOGLE_LOGIN=1).
            안 켠 채로 단추만 있으면 눌렀을 때 오류만 나므로 아예 감춘다.
          */}
          {isGoogleLoginEnabled() && (
            <button
              type="button"
              onClick={google}
              disabled={busy}
              className="mt-3 flex w-full items-center justify-center gap-2.5 rounded-full border-2 border-neutral-200 bg-white px-4 py-3 text-sm font-extrabold text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-60"
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

        <p className="mt-4 text-center text-xs font-medium text-white/90" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.4)" }}>
          베타 버전 · 계정은 이 기기에 저장돼요
        </p>
      </main>
    </div>
  );
}
