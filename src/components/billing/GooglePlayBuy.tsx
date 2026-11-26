"use client";

/**
 * 요금제 화면(앱 안)의 구글 플레이 결제 단추 — 가족 패스(월간·연간)·스타트팩 카드가 쓴다(2026-11-26 구글 결제 1단계).
 *
 * 결제 시연 파일(components/pay)이 아니다 — 서버·결제로 가는 길은 이 파일과 lib/google-play-client 에만 있다
 * (pay-demo.guard 가 요금제 화면에 이 한 가지만 들이고, google-play-client.guard 가 이 길의 모양을 지킨다).
 *
 * 무엇을 보이나:
 *  · 결제 다리가 없거나(웹·옛 앱 1.0.0) 서버가 결제 준비 전 → 지금처럼 '결제는 곧 열려요'
 *  · 로그인 전 → 로그인하러 가기
 *  · 구글로 산 가족 패스가 살아 있으면 → '이용 중' + 플레이 스토어 정기 결제 관리(해지는 거기서)
 *  · 스타트팩을 이미 샀으면 → '이미 샀어요'(한 번만 사는 상품)
 *  · 그 밖 → 결제 단추. 누르면 구글 결제 창 → 서버 확인 → '시작됐어요'
 */

import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { BigLink, Card, CardTitle, FOCUS, LockedButton, SkeletonCard } from "@/components/pay/pay-ui";
// 어른 확인(곱셈) — 웹 결제하기와 같은 창. 아이가 모르고 결제하지 않게 구글 결제 창 앞에 끼운다(가족 정책, 2026-11-26)
import { ParentCheck } from "@/components/pay/ParentCheck";
import { buyOnPlay, loadPlayStatus, type PlayStatus } from "@/lib/google-play-client";
import { playSubscriptionsUrl } from "@/lib/google-play-products";
import { kstDateText } from "@/lib/member-plan";

export type PlayProductId = "family_pass" | "family_pass_yearly" | "starter_pack";

const PASS_NAME: Readonly<Record<string, string>> = {
  family_pass: "가족 패스 (월간)",
  family_pass_yearly: "가족 패스 (연간)",
};

/** 어른 확인 문제 — 웹 결제하기의 어른 확인과 같은 규칙(두 자리 12~19 × 한 자리 3~9). 시연 모듈은 결제 쪽에서 가져오지 않아 여기 둔다. */
type ParentQuestion = { a: number; b: number };
function newParentQuestion(): ParentQuestion {
  return { a: 12 + Math.floor(Math.random() * 8), b: 3 + Math.floor(Math.random() * 7) };
}

/**
 * '내 결제·구독'(앱 안) — 구글 플레이로 산 것과 정기 결제 관리(해지는 플레이 스토어에서). 시연 기록 대신 이 카드를 보인다.
 * 결제 다리가 없거나(옛 앱) 결제 준비 전이면 '요금제 보기'만.
 */
export function GooglePlayManageCard() {
  const { theme } = useTheme();
  const colors = theme.colors;
  const [status, setStatus] = useState<PlayStatus | null>(null);

  useEffect(() => {
    let alive = true;
    void loadPlayStatus().then((s) => {
      if (alive) setStatus(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (status === null) return <SkeletonCard />;
  const ready = status.kind === "ready" ? status : null;
  const a = ready?.active ?? null;

  return (
    <Card labelledBy="play-now">
      <CardTitle id="play-now">지금 쓰는 요금제</CardTitle>
      {a ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-[17px] font-extrabold text-neutral-800">{PASS_NAME[a.productId] ?? "가족 패스"}</p>
          <p className="break-keep text-[13px] font-medium leading-relaxed text-neutral-600">
            {a.autoRenew && !a.canceled
              ? `다음 결제 ${kstDateText(a.expiresAt)} · 구글 플레이 정기 결제`
              : `${kstDateText(a.expiresAt)}까지 쓸 수 있어요 · 해지 예약됨`}
          </p>
          {ready?.packageName && (
            <a
              href={playSubscriptionsUrl(a.productId, ready.packageName)}
              className={`mt-2 inline-flex min-h-11 items-center self-start rounded-full text-[14px] font-extrabold underline underline-offset-2 ${FOCUS}`}
              style={{ color: colors.accentDark }}
            >
              구독 관리·해지(플레이 스토어) ›
            </a>
          )}
          <p className="break-keep text-xs font-semibold leading-relaxed text-neutral-500">
            앱에서 산 구독은 플레이 스토어 › 결제 및 정기 결제 › 정기 결제에서 해지·결제 수단 변경을 할 수 있어요. 해지해도 결제한
            기간이 끝날 때까지는 그대로 쓸 수 있어요.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="break-keep text-[13px] font-medium leading-relaxed text-neutral-600">
            {ready?.starterOwned
              ? "스타트팩을 구글 플레이로 샀어요. 만든 동화는 계속 남아요."
              : ready
                ? "구글 플레이로 산 가족 패스가 아직 없어요."
                : "결제는 곧 앱에서 바로 할 수 있어요."}
          </p>
          <BigLink href="/plans" colors={colors}>
            요금제 보기
          </BigLink>
        </div>
      )}
    </Card>
  );
}

type Phase =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "done"; endsAt: string | null }
  | { kind: "error"; message: string };

export function GooglePlayBuy({
  product,
  label,
  soonNote,
  noteId,
}: {
  product: PlayProductId;
  /** 결제 단추 글 — "가족 패스 시작하기" */
  label: string;
  /** 결제를 아직 못 할 때 단추 아래 글(지금 화면의 문장 그대로) */
  soonNote: string;
  /** 단추 아래 글의 id(aria-describedby) */
  noteId: string;
}) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const [status, setStatus] = useState<PlayStatus | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  // 어른 확인 문제 — 결제 단추를 누르면 낸다. 맞히면 그 자리(같은 누름)에서 구글 결제 창을 연다
  const [question, setQuestion] = useState<ParentQuestion | null>(null);

  useEffect(() => {
    let alive = true;
    void loadPlayStatus().then((s) => {
      if (alive) setStatus(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  const isPass = product !== "starter_pack";
  const note = (text: string) => (
    <p id={noteId} className="mt-3 break-keep text-center text-xs font-semibold leading-relaxed text-neutral-500">
      {text}
    </p>
  );

  // 읽는 중 — 단추 자리만 잡아 둔다(화면이 덜컥이지 않게)
  if (status === null) {
    return (
      <>
        <LockedButton describedBy={noteId}>확인하는 중…</LockedButton>
        {note("구글 플레이 결제를 확인하고 있어요.")}
      </>
    );
  }

  if (status.kind === "unavailable" || (status.kind === "ready" && !status.items.includes(product))) {
    // 확인 코드 — 결제를 못 여는 까닭(결제 다리·상품·서버). 사장님이 캡처로 알려 주면 어디를 고칠지 바로 안다(2026-11-26)
    const code = status.kind === "unavailable" ? status.reason : `no-item ${product}`;
    return (
      <>
        <LockedButton describedBy={noteId}>{isPass ? "결제는 곧 열려요" : "곧 열려요"}</LockedButton>
        {note(soonNote)}
        <p className="mt-1 break-all text-center text-[10px] font-medium leading-snug text-neutral-400">확인 코드: {code}</p>
      </>
    );
  }

  if (status.kind === "login") {
    return (
      <>
        <BigLink href="/login" colors={colors}>
          로그인하고 시작하기
        </BigLink>
        {note("결제 전에 로그인이 필요해요. 로그인한 뒤 이 화면으로 다시 와 주세요.")}
      </>
    );
  }

  // 방금 결제가 끝났다 — 새 화면으로 크게 옮겨(새로 불러) 요금제·남은 권수가 바로 보이게
  if (phase.kind === "done") {
    return (
      <div role="status" className="flex flex-col items-center gap-3 text-center">
        <p className="break-keep text-[15px] font-extrabold text-neutral-800">
          {isPass ? "결제가 끝났어요! 가족 패스가 시작됐어요." : "결제가 끝났어요! 스타트팩이 들어왔어요."}
        </p>
        {isPass && phase.endsAt && (
          <p className="text-xs font-semibold text-neutral-500">{kstDateText(phase.endsAt)}까지 쓸 수 있어요(해지하지 않으면 자동으로 이어져요)</p>
        )}
        <a
          href="/create"
          className={`flex min-h-[54px] w-full items-center justify-center rounded-full px-5 text-[19px] font-extrabold text-white ${FOCUS}`}
          style={{ background: colors.accent, boxShadow: `0 6px 0 ${colors.accentDark}` }}
        >
          동화 만들러 가기
        </a>
      </div>
    );
  }

  // 구글로 산 가족 패스가 살아 있다 — 두 번 사지 않게 결제 단추 대신 '이용 중'과 정기 결제 관리
  if (isPass && status.active) {
    const a = status.active;
    const until = kstDateText(a.expiresAt);
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="break-keep text-[15px] font-extrabold text-neutral-800">{PASS_NAME[a.productId] ?? "가족 패스"} 이용 중</p>
        <p className="break-keep text-xs font-semibold leading-relaxed text-neutral-500">
          {a.autoRenew && !a.canceled ? `다음 결제 ${until}` : `${until}까지 쓸 수 있어요(해지 예약)`}
        </p>
        {status.packageName && (
          <a
            href={playSubscriptionsUrl(a.productId, status.packageName)}
            className={`mt-1 inline-flex min-h-11 items-center rounded-full px-4 text-[14px] font-extrabold underline underline-offset-2 ${FOCUS}`}
            style={{ color: colors.accentDark }}
          >
            구독 관리·해지(플레이 스토어) ›
          </a>
        )}
      </div>
    );
  }

  if (!isPass && status.starterOwned) {
    return (
      <>
        <LockedButton describedBy={noteId}>이미 산 스타트팩이에요</LockedButton>
        {note("스타트팩은 처음 한 번만 살 수 있어요. 만든 동화는 계속 남아요.")}
      </>
    );
  }

  const busy = phase.kind === "busy";
  // 어른 확인을 맞힌 그 누름 안에서 부른다 — 구글 결제 창은 사용자가 누른 직후에만 열린다(그 앞에서 기다리지 않는다)
  const buy = async () => {
    if (busy) return;
    setPhase({ kind: "busy" });
    const r = await buyOnPlay(product);
    if (r.ok) setPhase({ kind: "done", endsAt: r.endsAt });
    else setPhase(r.cancelled ? { kind: "idle" } : { kind: "error", message: r.message });
  };
  const askParent = () => {
    if (busy) return;
    setQuestion(newParentQuestion());
  };

  return (
    <>
      {question && (
        <ParentCheck
          colors={colors}
          question={question}
          onPass={() => {
            setQuestion(null);
            void buy();
          }}
          onWrong={() => setQuestion(newParentQuestion())}
          onClose={() => setQuestion(null)}
        />
      )}
      <button
        type="button"
        onClick={askParent}
        aria-disabled={busy}
        aria-describedby={noteId}
        className={`flex min-h-[54px] w-full items-center justify-center gap-2 rounded-full px-5 text-center text-[19px] font-extrabold text-white transition active:translate-y-[3px] ${busy ? "cursor-wait opacity-80" : ""} ${FOCUS}`}
        style={{ background: colors.accent, boxShadow: `0 6px 0 ${colors.accentDark}` }}
      >
        {busy ? "결제 확인 중…" : label}
      </button>
      {phase.kind === "error" && (
        <p role="alert" className="mt-3 break-keep text-center text-[13px] font-bold leading-relaxed text-rose-700">
          {phase.message}
        </p>
      )}
      {note(
        isPass
          ? `구글 플레이로 결제돼요 · ${product === "family_pass_yearly" ? "매년" : "매달"} 자동 결제 · 해지는 플레이 스토어 › 정기 결제에서 언제든 할 수 있어요`
          : "구글 플레이로 한 번만 결제돼요 · 처음 한 번만 살 수 있어요",
      )}
    </>
  );
}
