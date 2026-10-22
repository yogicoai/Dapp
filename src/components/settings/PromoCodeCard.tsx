"use client";

/**
 * 설정 › 혜택 코드 — 요기보 회원 혜택(공용 코드)·요기보 구매 고객 시리얼을 넣는 칸(사장님 2026-10-22 미팅).
 *
 * 웹과 안드로이드 앱이 같은 칸을 쓴다(앱은 이 사이트를 감싼 틀 — 무료 혜택이라 구글 결제 정책과 부딪히지 않는다).
 * 구매를 권하는 말(“요기보에서 사면 드려요”)은 넣지 않는다 — 앱 안에서는 받은 코드를 넣는 곳일 뿐이다.
 * 진짜 문지기는 DB 함수(redeem_promo_code) — 틀린 입력은 한 시간에 10번까지, 시리얼은 한 장 한 번.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { loadMyPromos, redeemPromoCode } from "@/lib/promo-client";
import { promoBenefitLines, REDEEM_REASON_MESSAGE, type MyPromo, type RedeemReply } from "@/lib/promo-codes";

type Result = { tone: "ok" | "error"; title: string; lines: string[]; reply: Extract<RedeemReply, { ok: true }> | null };

export function PromoCodeCard() {
  const { theme } = useTheme();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [mine, setMine] = useState<MyPromo[]>([]);

  useEffect(() => {
    let alive = true;
    void loadMyPromos().then((rows) => {
      if (alive) setMine(rows);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !code.trim()) return;
    setBusy(true);
    setResult(null);
    const r = await redeemPromoCode(code);
    if (r.ok) {
      const lines = promoBenefitLines(r);
      setResult({ tone: "ok", title: r.already ? "이미 받은 혜택이에요" : "혜택을 받았어요", lines, reply: r });
      setCode("");
      setMine(await loadMyPromos());
    } else {
      const message = r.reason === "login" || r.reason === "error" ? r.message : REDEEM_REASON_MESSAGE[r.reason];
      setResult({ tone: "error", title: message, lines: [], reply: null });
    }
    setBusy(false);
  }

  const got = result?.reply;
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-neutral-100 px-4 py-3">
      <p className="break-keep text-xs font-bold leading-relaxed text-neutral-500">
        요기보(yogibo.kr)에 회원가입하고 마케팅 수신에 동의하신 분, 요기보에서 구매하신 분께 드리는 혜택이에요. 받으신 코드를 넣어 주세요.
      </p>
      <form onSubmit={submit} className="flex gap-2">
        <label htmlFor="promo-code" className="sr-only">
          혜택 코드
        </label>
        <input
          id="promo-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="예: ABCD-EFGH-JKLM"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={40}
          className="min-w-0 flex-1 rounded-xl bg-white px-3 py-2.5 text-base font-extrabold uppercase tracking-wider text-neutral-800 shadow-sm outline-none placeholder:font-bold placeholder:normal-case placeholder:tracking-normal placeholder:text-neutral-300 focus-visible:ring-2"
        />
        <button
          type="submit"
          disabled={busy || !code.trim()}
          className="shrink-0 whitespace-nowrap rounded-xl px-4 text-sm font-extrabold text-white shadow-sm disabled:opacity-40"
          style={{ background: theme.colors.accentDark }}
        >
          {busy ? "확인 중…" : "넣기"}
        </button>
      </form>

      {result && (
        <div
          role="status"
          className={`rounded-xl px-3 py-2.5 text-sm ${result.tone === "ok" ? "bg-white text-neutral-800" : "bg-red-50 text-red-700"}`}
        >
          <p className="break-keep font-extrabold">{result.title}</p>
          {result.lines.length > 0 && (
            <ul className="mt-1 flex flex-col gap-0.5">
              {result.lines.map((l) => (
                <li key={l} className="break-keep text-[13px] font-bold text-neutral-600">
                  ✓ {l}
                </li>
              ))}
            </ul>
          )}
          {got && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {got.libraryUntil && <GoLink href="/">동화 들으러 가기</GoLink>}
              {got.drawCredits > 0 && <GoLink href="/family">가족 캐릭터 그리기</GoLink>}
              {got.bookCredits > 0 && <GoLink href="/create">동화 만들러 가기</GoLink>}
            </div>
          )}
        </div>
      )}

      {mine.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-extrabold text-neutral-400">받은 혜택</p>
          {mine.slice(0, 5).map((p) => (
            <p key={`${p.label}-${p.at}`} className="break-keep text-xs font-bold text-neutral-600">
              {p.label}
              <span className="font-medium text-neutral-400"> · {promoBenefitLines(p).join(" · ") || "받음"}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function GoLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-extrabold text-neutral-700">
      {children} ›
    </Link>
  );
}
