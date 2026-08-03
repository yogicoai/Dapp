"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { enterGuest, logIn, signUp } from "@/lib/auth";
import { SIGNUP_BONUS_TOKENS } from "@/lib/tokens";

/**
 * 회원가입 / 로그인 — 베타. 아이디·비밀번호만.
 * 성공하면 서재(/)로 보낸다. 가입 시 보너스 토큰을 준다(auth.signUp).
 */
export default function LoginPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const { accent, accentDark } = theme.colors;

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
                🎁 가입하면 무료 토큰 {SIGNUP_BONUS_TOKENS}개를 드려요
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

          {/* 비회원 둘러보기 — 전래동화·세계명작만 열람. 만들기·내 책장은 로그인 필요. */}
          <div className="mt-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-neutral-200" />
            <span className="text-xs font-bold text-neutral-400">또는</span>
            <span className="h-px flex-1 bg-neutral-200" />
          </div>
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
