"use client";

/**
 * 혜택 코드 링크 화면 — 로그인했으면 바로 넣고 결과를, 안 했으면 코드를 이 기기에 잠깐 두고 로그인으로 보낸다.
 * 구글 로그인은 늘 /login 으로 돌아오므로 로그인 화면이 남겨 둔 코드를 보고 여기로 다시 보낸다(lib/promo-client pendingPromoPath).
 * 진짜 문지기는 DB 함수(redeem_promo_code). 같은 계정이 같은 코드를 다시 열면 '이미 받은 혜택'으로 보여 줄 뿐 더하지 않는다.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { loadSession } from "@/lib/auth";
import { clearPendingCode, redeemPromoCode, savePendingCode } from "@/lib/promo-client";
import { isPromoCodeShape, normalizePromoCode, promoBenefitLines, REDEEM_REASON_MESSAGE, type RedeemReply } from "@/lib/promo-codes";

type View =
  | { state: "checking" }
  | { state: "login" }
  | { state: "done"; reply: Extract<RedeemReply, { ok: true }> }
  | { state: "error"; message: string };

export function RedeemLanding({ raw }: { raw: string }) {
  const router = useRouter();
  const { theme } = useTheme();
  const code = normalizePromoCode(raw);
  const [view, setView] = useState<View>({ state: "checking" });

  useEffect(() => {
    let alive = true;
    (async (): Promise<View> => {
      if (!isPromoCodeShape(code)) return { state: "error", message: REDEEM_REASON_MESSAGE.not_found };
      const s = await loadSession().catch(() => null);
      if (!s?.uid || s.guest) {
        savePendingCode(code);
        return { state: "login" };
      }
      clearPendingCode();
      const r = await redeemPromoCode(code);
      if (r.ok) return { state: "done", reply: r };
      return { state: "error", message: r.reason === "login" || r.reason === "error" ? r.message : REDEEM_REASON_MESSAGE[r.reason] };
    })()
      .catch((): View => ({ state: "error", message: "혜택을 받지 못했어요. 잠시 뒤 다시 해 주세요." }))
      .then((v) => {
        if (alive) setView(v);
      });
    return () => {
      alive = false;
    };
  }, [code]);

  const accent = theme.colors.accentDark;
  return (
    <div className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden px-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={theme.background} alt="" className="fixed inset-0 -z-10 h-full w-full object-cover" />
      <div className="fixed inset-0 -z-10 bg-white/35" />
      <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-[28px] bg-white/90 px-7 py-8 text-center shadow-xl backdrop-blur">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={theme.mascot}
          alt=""
          className={`h-20 w-20 rounded-full border-4 border-white object-cover shadow ${view.state === "checking" ? "animate-[float_1.5s_ease-in-out_infinite]" : ""}`}
        />
        <p className="text-xs font-extrabold tracking-wide text-neutral-400">요기보 혜택</p>

        {view.state === "checking" && <p className="text-base font-extrabold text-neutral-700">혜택을 확인하고 있어요…</p>}

        {view.state === "login" && (
          <>
            <h1 className="break-keep text-lg font-extrabold text-neutral-800">로그인하면 바로 받을 수 있어요</h1>
            <p className="break-keep text-sm font-bold text-neutral-500">
              요기보(yogibo.kr)에 회원가입하고 마케팅 수신에 동의하신 분, 요기보에서 구매하신 분께 드리는 혜택이에요.
            </p>
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="mt-1 w-full rounded-2xl px-4 py-3 text-base font-extrabold text-white shadow-sm"
              style={{ background: accent }}
            >
              로그인하고 혜택 받기
            </button>
          </>
        )}

        {view.state === "done" && (
          <>
            <h1 className="break-keep text-lg font-extrabold text-neutral-800">
              {view.reply.already ? "이미 받은 혜택이에요" : "혜택을 받았어요"}
            </h1>
            <ul className="flex flex-col gap-1">
              {promoBenefitLines(view.reply).map((l) => (
                <li key={l} className="break-keep text-sm font-bold text-neutral-600">
                  ✓ {l}
                </li>
              ))}
            </ul>
            <div className="mt-1 flex w-full flex-col gap-2">
              {view.reply.bookCredits > 0 && <Go href="/create" accent={accent} primary>우리 아이 동화 만들기</Go>}
              {view.reply.drawCredits > 0 && <Go href="/family" accent={accent} primary={view.reply.bookCredits === 0}>가족 캐릭터 그리기</Go>}
              <Go href="/" accent={accent} primary={view.reply.bookCredits === 0 && view.reply.drawCredits === 0}>
                동화 들으러 가기
              </Go>
            </div>
          </>
        )}

        {view.state === "error" && (
          <>
            <h1 className="break-keep text-lg font-extrabold text-neutral-800">{view.message}</h1>
            <p className="break-keep text-sm font-bold text-neutral-500">설정 › 혜택 코드에서 다시 넣을 수 있어요.</p>
            <div className="mt-1 flex w-full flex-col gap-2">
              <Go href="/settings" accent={accent} primary>
                코드 직접 넣기
              </Go>
              <Go href="/" accent={accent}>
                홈으로
              </Go>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Go({ href, accent, primary = false, children }: { href: string; accent: string; primary?: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`w-full rounded-2xl px-4 py-3 text-base font-extrabold shadow-sm ${primary ? "text-white" : "bg-neutral-100 text-neutral-700"}`}
      style={primary ? { background: accent } : undefined}
    >
      {children}
    </Link>
  );
}
