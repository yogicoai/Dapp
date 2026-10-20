"use client";

/**
 * 제공 동화(세계명작·전래동화) 문지기 — 2026-10-20 출시 전 점검.
 *
 * 책장에서는 보는 사람의 단계(비회원·요금제 없는 회원 = 무료, 요금제 회원 = 그 단계, 관리자 = 전부)에 맞는 책만 보이는데,
 * 주소(/book/<id>)로 바로 들어오면 잠긴 책도 그대로 열렸다. 여기서 같은 규칙(lib/member-plan viewerTierOf ·
 * lib/offer-settings libraryLock)으로 한 번 더 본다. 관리실 '책장에 적용'이 꺼져 있으면 지금처럼 다 열린다.
 * 값을 못 읽거나 5초 넘게 걸리면 연다(책장과 같다 — 설정을 못 읽었다고 아이 책을 막지 않는다).
 * 책 본문은 이미 사이트에 실려 있어 완전한 잠금은 아니다 — 결제를 열 때 서버에서 막는다.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookViewer } from "@/components/BookViewer";
import { useTheme } from "@/components/ThemeProvider";
import { loadSession } from "@/lib/auth";
import { loadLibraryAccess } from "@/lib/library-access";
import { viewerTierOf } from "@/lib/member-plan";
import { loadMyPlanKey } from "@/lib/member-plan-client";
import { libraryLock, type LibraryTier } from "@/lib/offer-settings";
import type { Book } from "@/lib/types";

const TIER_LABEL: Record<LibraryTier, string> = { free: "무료", starter: "스타트팩", pass: "가족 패스" };
const WAIT_MS = 5000;

type Gate = { state: "checking" } | { state: "open" } | { state: "locked"; need: LibraryTier };

export function LibraryGate({ book }: { book: Book }) {
  const [gate, setGate] = useState<Gate>({ state: "checking" });

  useEffect(() => {
    let alive = true;
    const giveUp = window.setTimeout(() => {
      if (alive) setGate((g) => (g.state === "checking" ? { state: "open" } : g));
    }, WAIT_MS);
    (async () => {
      const s = await loadSession().catch(() => null);
      const uid = s?.uid ?? null;
      const master = Boolean(s?.isMaster);
      const plan = uid && !master ? await loadMyPlanKey(uid) : null;
      const viewer = viewerTierOf(Boolean(uid), plan, master);
      if (viewer === "pass") return { state: "open" } as Gate;
      const need = libraryLock(await loadLibraryAccess(), book.id, viewer);
      return need ? ({ state: "locked", need } as Gate) : ({ state: "open" } as Gate);
    })()
      .catch(() => ({ state: "open" }) as Gate)
      .then((g) => {
        if (alive) setGate(g);
      });
    return () => {
      alive = false;
      window.clearTimeout(giveUp);
    };
  }, [book.id]);

  if (gate.state === "open") return <BookViewer book={book} />;
  return <GateScreen book={book} need={gate.state === "locked" ? gate.need : null} />;
}

/** 확인하는 동안(need = null)과 잠긴 책 안내 — 홈 준비 화면과 같은 모양 */
function GateScreen({ book, need }: { book: Book; need: LibraryTier | null }) {
  const { theme } = useTheme();
  return (
    <div className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden px-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={theme.background} alt="" className="fixed inset-0 -z-10 h-full w-full object-cover" />
      <div className="fixed inset-0 -z-10 bg-white/35" />
      <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-[28px] bg-white/90 px-8 py-9 text-center shadow-xl backdrop-blur">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={theme.mascot}
          alt=""
          className={`h-20 w-20 rounded-full border-4 border-white object-cover shadow ${need ? "" : "animate-[float_1.5s_ease-in-out_infinite]"}`}
        />
        {need ? (
          <>
            <h1 className="break-keep text-lg font-extrabold text-neutral-800">
              &lsquo;{book.title}&rsquo;은 {TIER_LABEL[need]} 동화예요
            </h1>
            <p className="break-keep text-sm font-bold leading-relaxed text-neutral-500">
              {TIER_LABEL[need]}에서 들을 수 있어요. 무료 동화는 책장에서 바로 들을 수 있어요.
            </p>
            <div className="mt-2 flex w-full flex-col gap-2">
              <Link
                href="/plans"
                className="flex min-h-12 items-center justify-center rounded-full text-base font-extrabold text-white"
                style={{ background: theme.colors.accent, boxShadow: `0 5px 0 ${theme.colors.accentDark}` }}
              >
                요금제 보기
              </Link>
              <Link href="/" className="flex min-h-12 items-center justify-center rounded-full bg-neutral-100 text-base font-extrabold text-neutral-700">
                책장으로
              </Link>
            </div>
          </>
        ) : (
          <p className="break-keep text-sm font-extrabold text-neutral-500">동화를 펼치고 있어요…</p>
        )}
      </div>
    </div>
  );
}
