"use client";

/**
 * /guide 사용 가이드 — 처음 온 부모가 첫 동화를 만들고 듣기까지 따라 하는 안내(사장님 2026-10-20).
 *
 * "우리 페이지 안의 실제 UI/UX 를 보여 주며" — 그래서 글로만 설명하지 않고, 실제 화면 조각을 같은 모양으로 그린다:
 * 나라 배경 위 흰 카드, 같은 단추(나라 색 + 아래 그림자), 같은 아이콘(public/icons), 만드는 순서 줄(MakeSteps — 실제 컴포넌트),
 * 성우 그림(VoiceGlyph — 실제 컴포넌트). 눌러야 할 곳은 손가락 표시로 짚는다.
 * 화면 그림은 보여 주기만 한다(aria-hidden) — 뜻은 옆 글이 말한다. 짚은 단추만 눌러서 다음 단계로 넘길 수 있다.
 *
 * 화면 글자는 lib/guide SCREEN 에서 온다 — guide.test 가 실제 화면 파일에 그대로 있는지 확인한다.
 * 예시 아이(지우)·친구(서준)와 대본은 지어낸 것이다.
 */

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { MakeSteps } from "@/components/create/MakeSteps";
import { VoiceGlyph } from "@/components/VoiceGlyph";
import { CameraIcon, ChipsIcon } from "@/components/family/icons";
import { familyExampleSrc } from "@/components/family/family-ui";
import { BackPill, BigLink, Card, CardTitle, FOCUS, PayShell, SoftLink } from "@/components/pay/pay-ui";
import { SiteFooter } from "@/components/pay/SiteFooter";
import { useAppShell } from "@/lib/app-shell-client";
import { balancedCols, lonelyLast } from "@/lib/balanced-grid";
import { chipIcon } from "@/lib/chip-icons";
import { CREATE_LOCKED_MESSAGE } from "@/lib/create-access";
import {
  GUIDE_EXAMPLE as EX,
  GUIDE_FAQ,
  GUIDE_PAGE_COUNT,
  GUIDE_SECTIONS,
  SCREEN,
  VIEWER_CONTROLS,
  guideWaits,
} from "@/lib/guide";
import { AGES } from "@/lib/prefs";
import { useSiteInfo, type SiteInfo } from "@/lib/site-info-client";
import { NARRATOR_PRESETS } from "@/lib/voices";

/** 질문 장 칸 수 → 칸 클래스(Tailwind 는 글자 그대로 있어야 만든다) — 실제 만들기 화면(QuestionFlow)과 같다 */
const GUIDE_GRID_COLS: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3" };

type Colors = { accent: string; accentDark: string; accentSoft: string };

/** 동화 보기 화면 그림에 깔 실제 제공 동화 한 쪽(서버가 고른다 — app/guide/page) */
export type GuideSample = { title: string; image: string; text: string };

/** 따라 하기 화면 그림에 보여 줄 성우 — 나레이션 목록 앞쪽 몇 명(실제 화면은 더 많다) */
const SAMPLE_VOICES = NARRATOR_PRESETS.slice(0, 5);

export function GuideView({ siteInfo, sample }: { siteInfo?: SiteInfo | null; sample: GuideSample | null }) {
  const { theme } = useTheme();
  const colors: Colors = theme.colors;
  const info = useSiteInfo(siteInfo);
  const inApp = useAppShell() === "android";
  const waits = guideWaits();

  return (
    <PayShell>
      <BackPill href="/" />

      {/* 머리 + 목차 */}
      <Card className="flex flex-col items-center text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={theme.mascot} alt="" className="h-12 w-12 rounded-full border-2 border-white object-cover shadow" />
        <h1 className="mt-2 text-[21px] font-extrabold text-neutral-800">사용 가이드</h1>
        <p className="mt-1 break-keep text-[13px] font-medium leading-relaxed text-neutral-500">
          우리 아이가 주인공인 동화를 만들고, 성우 목소리로 들어요.
          <br />
          실제 화면과 같은 모양으로 하나씩 따라 해 볼게요.
        </p>
        <nav aria-label="가이드 목차" className="mt-4 flex flex-wrap justify-center gap-1.5">
          {GUIDE_SECTIONS.map((s, i) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={`flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-extrabold ${FOCUS}`}
              style={{ background: colors.accentSoft, color: colors.accentDark }}
            >
              <span
                aria-hidden
                className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] text-white"
                style={{ background: colors.accent }}
              >
                {i + 1}
              </span>
              {s.label}
            </a>
          ))}
        </nav>
      </Card>

      <StartSection colors={colors} createIcon={theme.art.create} background={theme.background} />
      <MakeSection colors={colors} background={theme.background} loadingArt={theme.art.loading} waits={waits} />
      <ReadSection colors={colors} sample={sample} />
      <FamilySection colors={colors} background={theme.background} />

      {/* 궁금할 때 */}
      <Card id="help" labelledBy="guide-help" className="scroll-mt-4">
        <CardTitle id="guide-help">
          <SectionNo n={5} colors={colors} /> 궁금할 때
        </CardTitle>
        <div className="flex flex-col gap-2">
          {GUIDE_FAQ.map((f) => (
            <details key={f.q} className="group rounded-[20px] bg-stone-50 shadow-[inset_0_0_0_1px_#f0ede8]">
              <summary
                className={`flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-4 py-2 text-[14px] font-extrabold text-neutral-700 [&::-webkit-details-marker]:hidden ${FOCUS}`}
              >
                <span className="break-keep">{f.q}</span>
                <span aria-hidden className="shrink-0 text-neutral-400 transition group-open:rotate-90">
                  ›
                </span>
              </summary>
              <p className="break-keep px-4 pb-3.5 text-[13px] font-medium leading-relaxed text-neutral-600">{f.a}</p>
            </details>
          ))}
        </div>

        <ul className="mt-4 flex flex-col gap-2 break-keep text-[13px] font-medium leading-relaxed text-neutral-600">
          <li>
            <b className="text-neutral-800">불편한 점이 있으면</b> — 로그인한 뒤 홈 왼쪽 위 &lsquo;📝 의견 남기기&rsquo;로 바로
            알려 주세요.
          </li>
          {info.business.email && (
            <li>
              <b className="text-neutral-800">고객센터</b> —{" "}
              <a href={`mailto:${info.business.email}`} className={`font-extrabold text-neutral-700 underline underline-offset-2 ${FOCUS}`}>
                {info.business.email}
              </a>
              {info.business.hours ? ` (${info.business.hours})` : ""}
            </li>
          )}
          {!inApp && (
            <li>
              <b className="text-neutral-800">홈 화면에 추가</b> — 휴대폰 홈 화면에 추가해 두면 앱처럼 바로 열려요.
            </li>
          )}
        </ul>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {[
            { href: "/plans", label: "요금제" },
            { href: "/refund", label: "환불 안내" },
            { href: "/privacy", label: "개인정보 처리방침" },
            { href: "/account-deletion", label: "계정 삭제" },
          ].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`flex min-h-12 items-center justify-between gap-1 rounded-2xl bg-neutral-50 px-4 text-[13px] font-extrabold text-neutral-700 shadow-[inset_0_0_0_1px_#f0ede8] ${FOCUS}`}
            >
              <span className="break-keep">{l.label}</span>
              <span aria-hidden>›</span>
            </Link>
          ))}
        </div>
      </Card>

      <div className="mt-1 flex flex-col gap-3">
        <BigLink href="/create" colors={colors}>
          첫 동화 만들러 가기
        </BigLink>
        <SoftLink href="/">홈으로</SoftLink>
      </div>

      <SiteFooter info={siteInfo} />
    </PayShell>
  );
}

/* ─────────────────────────── 1. 시작하기 ─────────────────────────── */

function StartSection({ colors, createIcon, background }: { colors: Colors; createIcon: string; background: string }) {
  return (
    <Card id="start" labelledBy="guide-start" className="scroll-mt-4">
      <CardTitle id="guide-start">
        <SectionNo n={1} colors={colors} /> 시작하기
      </CardTitle>
      <ol className="flex flex-col gap-4">
        <StepRow
          n={1}
          colors={colors}
          title="구글 계정으로 시작해요"
          body="처음 들어오면 로그인 화면이 나와요. '구글로 시작하기'를 누르면 바로 가입돼요. 가입하지 않고 '비회원으로 둘러보기'를 누르면 세계명작·전래동화 몇 권을 들을 수 있어요."
        >
          <Stage background={background} label="로그인 화면">
            <div className="flex w-full max-w-[19rem] flex-col gap-2.5 rounded-[22px] bg-white/95 p-4 shadow-xl">
              <Tap shape="rounded-full" block>
                <span className="flex w-full items-center justify-center gap-2.5 rounded-full border-2 border-neutral-200 bg-white px-4 py-3 text-[15px] font-extrabold text-neutral-700 shadow-sm">
                  <svg viewBox="0 0 48 48" className="h-5 w-5">
                    <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.3z" />
                    <path fill="#34A853" d="M24 46c6 0 11-2 14.5-5.2l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8 41.3 15.4 46 24 46z" />
                    <path fill="#FBBC05" d="M11.8 28.4c-.4-1.3-.7-2.7-.7-4.4s.3-3 .7-4.4v-5.7H4.5C2.9 17.1 2 20.4 2 24s.9 6.9 2.5 10.1l7.3-5.7z" />
                    <path fill="#EA4335" d="M24 10.4c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 3.9 30 2 24 2 15.4 2 8 6.7 4.5 13.9l7.3 5.7c1.7-5.2 6.5-9.2 12.2-9.2z" />
                  </svg>
                  {SCREEN.login.google}
                </span>
              </Tap>
              <span aria-hidden className="mt-1 w-full break-keep rounded-full bg-neutral-100 px-4 py-2.5 text-center text-[13px] font-extrabold text-neutral-600">
                {SCREEN.login.guest}
              </span>
            </div>
          </Stage>
        </StepRow>
        <StepRow n={2} colors={colors} title="책장을 둘러봐요" body="'우리 가족 책장'에는 만든 동화가, '세계명작'·'전래동화'에는 성우가 읽어 주는 동화가 있어요.">
          <Stage background={background} label="홈 책장 탭">
            <div className="flex max-w-full items-center gap-1 rounded-full bg-white/60 p-1 shadow-md backdrop-blur">
              {(
                [
                  { label: SCREEN.home.shelves[0], icon: "/icons/tab-mine.webp" },
                  { label: SCREEN.home.shelves[1], icon: "/icons/tab-classic.webp" },
                  { label: SCREEN.home.shelves[2], icon: "/icons/tab-folk.webp" },
                ] as const
              ).map((t, i) => (
                <span
                  key={t.label}
                  style={i === 0 ? { color: colors.accentDark } : undefined}
                  className={`flex items-center gap-1 whitespace-nowrap rounded-full py-1.5 pl-2 pr-2.5 text-xs font-extrabold ${
                    i === 0 ? "bg-white shadow-sm" : "text-neutral-500"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={t.icon} alt="" className="h-5 w-5 object-contain" />
                  {t.label}
                </span>
              ))}
            </div>
          </Stage>
        </StepRow>
        <StepRow n={3} colors={colors} title="'동화 만들기'를 눌러요" body="홈에서 가장 큰 단추예요. 폰에서는 제목 아래, 태블릿·컴퓨터에서는 화면 아래 가운데에 있어요.">
          <Stage background={background} label="동화 만들기 단추">
            <Tap shape="rounded-full">
              <span
                className="flex items-center justify-center gap-2 rounded-full px-6 py-3 text-white"
                style={{ background: colors.accent, boxShadow: `0 6px 0 ${colors.accentDark}, 0 10px 18px rgba(0,0,0,0.22)` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={createIcon} alt="" className="h-8 w-8 object-contain" />
                <span className="text-lg font-extrabold tracking-tight">{SCREEN.home.make}</span>
              </span>
            </Tap>
          </Stage>
        </StepRow>
      </ol>
      <p className="mt-4 break-keep rounded-[20px] bg-stone-50 px-4 py-3 text-[13px] font-medium leading-relaxed text-neutral-600 shadow-[inset_0_0_0_1px_#f0ede8]">
        {CREATE_LOCKED_MESSAGE}{" "}
        <Link href="/plans" className={`font-extrabold text-neutral-700 underline underline-offset-2 ${FOCUS}`}>
          요금제 보기 ›
        </Link>
      </p>
    </Card>
  );
}

/* ─────────────────────────── 2. 동화 만들기 따라 하기 ─────────────────────────── */

type MakeStep = { short: string; title: string; body: ReactNode; screen: ReactNode };

function MakeSection({
  colors,
  background,
  loadingArt,
  waits,
}: {
  colors: Colors;
  background: string;
  loadingArt: string;
  waits: { script: string; draw: string };
}) {
  const [at, setAt] = useState(0);
  const topRef = useRef<HTMLDivElement>(null);

  const steps: MakeStep[] = [
    {
      short: "아이 정보",
      title: "아이 이름·나이·성별을 골라요",
      body: "나이에 맞춰 글 길이가 달라져요. 한 번 적어 두면 다음부터는 이야기 고르기부터 시작해요.",
      screen: <ChildScreen colors={colors} onNext={() => go(1)} />,
    },
    {
      short: "이야기 고르기",
      title: "어떤 이야기로 만들지 골라요",
      body: "오늘 겪은 일, 상상 이야기, 마음을 다독이는 감정 동화, 직접 쓴 이야기 중에서 골라요. 예시는 '오늘의 이야기'로 해요.",
      screen: <ThemeScreen onNext={() => go(2)} />,
    },
    {
      short: "질문에 답하기",
      title: "질문에 하나씩 답해요",
      body: (
        <>
          질문이 한 장에 하나씩 나와요. 보기를 누르면 다음 질문으로 넘어가고, 모르는 질문은 건너뛰어도 돼요.
          <span className="mt-2 block text-[12px] font-extrabold text-neutral-500">예시에서는 이렇게 답했어요</span>
          <dl className="mt-1 flex flex-col rounded-[16px] bg-stone-50 px-3 py-1 shadow-[inset_0_0_0_1px_#f0ede8]">
            {EX.answers.map((a) => (
              <div key={a.q} className="flex items-start justify-between gap-3 border-b border-stone-200/70 py-1.5 last:border-b-0">
                <dt className="shrink-0 text-[12px] font-bold text-neutral-500">{a.q}</dt>
                <dd className="min-w-0 break-keep text-right text-[12px] font-extrabold text-neutral-800">{a.a}</dd>
              </div>
            ))}
          </dl>
        </>
      ),
      screen: <QuestionScreen colors={colors} onNext={() => go(3)} />,
    },
    {
      short: "성우 고르기",
      title: "읽어 줄 성우를 고르고 '대본 만들기'",
      body: `성우 이름을 누르면 목소리를 들어 볼 수 있어요. '대본 만들기'를 누르면 값을 한 번 더 확인하고 대본을 써요. 보통 ${waits.script}쯤 걸려요.`,
      screen: <VoiceScreen colors={colors} onNext={() => go(4)} />,
    },
    {
      short: "대본 고치기",
      title: "대본을 읽고, 마음에 들게 고쳐요",
      body: "문장을 누르면 그 자리에서 고칠 수 있어요. 마음에 들면 '이 글로 그림 그리기'를 눌러요. 그림 값은 이때 나가요.",
      screen: <StoryScreen colors={colors} onNext={() => go(5)} />,
    },
    {
      short: "그림 그리기",
      title: "그림이 그려지는 동안 기다려요",
      body: `그림은 보통 ${waits.draw}쯤 걸려요. 기다리는 동안 다른 동화를 읽어도 돼요. 창을 닫아도 다시 들어오면 그린 장부터 이어서 그려요.`,
      screen: <DrawScreen colors={colors} loadingArt={loadingArt} />,
    },
    {
      short: "완성",
      title: "동화 완성!",
      body: "다 그리면 책이 바로 열리고 '우리 가족 책장'에 꽂혀요. 책 보는 법은 아래에서 알려 드릴게요.",
      screen: <DoneScreen colors={colors} />,
    },
  ];
  const step = steps[at];
  const last = at === steps.length - 1;

  function go(i: number) {
    setAt(Math.max(0, Math.min(steps.length - 1, i)));
    // 단계를 바꾸면 화면 그림 높이가 달라진다 — 단계 머리가 화면 위로 밀려났으면 다시 보이게.
    requestAnimationFrame(() => {
      const el = topRef.current;
      if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start" });
    });
  }

  return (
    <Card id="make" labelledBy="guide-make" className="scroll-mt-4">
      <CardTitle
        id="guide-make"
        right={
          <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-extrabold text-neutral-600">예시</span>
        }
      >
        <SectionNo n={2} colors={colors} /> 동화 만들기 따라 하기
      </CardTitle>
      <p className="-mt-1 break-keep text-[13px] font-medium leading-relaxed text-neutral-500">
        6살 {EX.child}가 놀이터에서 넘어진 날을 동화로 만들어 볼게요. 손가락이 가리키는 곳을 누르면 다음 단계로 넘어가요.
      </p>

      {/* 단계 고르기 — 지금 단계는 나라 색 */}
      <div ref={topRef} className="scroll-mt-4">
        <ol aria-label="따라 하기 단계" className="mt-3 flex flex-wrap gap-1.5">
          {steps.map((s, i) => (
            <li key={s.short}>
              <button
                type="button"
                onClick={() => go(i)}
                aria-current={i === at ? "step" : undefined}
                className={`flex min-h-9 items-center gap-1 rounded-full py-1 pl-1.5 pr-3 text-[12px] font-extrabold transition ${FOCUS} ${
                  i === at ? "text-white shadow" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                }`}
                style={i === at ? { background: colors.accent } : undefined}
              >
                <span
                  aria-hidden
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${i === at ? "bg-white/25" : "bg-white"}`}
                >
                  {i < at ? "✓" : i + 1}
                </span>
                {s.short}
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <div>
          <p className="text-[12px] font-extrabold" style={{ color: colors.accentDark }}>
            {at + 1}단계 / {steps.length}
          </p>
          <h3 className="break-keep text-[17px] font-extrabold text-neutral-800" aria-live="polite">
            {step.title}
          </h3>
          <div className="mt-1 break-keep text-[13px] font-medium leading-relaxed text-neutral-600">{step.body}</div>
        </div>

        <Stage background={background} label={`${step.short} 화면`} tall>
          <div className="w-full rounded-[22px] bg-white/85 p-4 shadow-xl backdrop-blur sm:p-5">{step.screen}</div>
        </Stage>

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => go(at - 1)}
            disabled={at === 0}
            className={`min-h-11 rounded-full bg-white px-5 text-sm font-extrabold text-neutral-600 shadow ring-1 ring-black/5 disabled:opacity-40 ${FOCUS}`}
          >
            ← 이전
          </button>
          {last ? (
            <a
              href="#read"
              className={`flex min-h-11 items-center rounded-full px-5 text-sm font-extrabold text-white ${FOCUS}`}
              style={{ background: colors.accent, boxShadow: `0 4px 0 ${colors.accentDark}` }}
            >
              책 보는 법 보기 ↓
            </a>
          ) : (
            <button
              type="button"
              onClick={() => go(at + 1)}
              className={`min-h-11 rounded-full px-5 text-sm font-extrabold text-white ${FOCUS}`}
              style={{ background: colors.accent, boxShadow: `0 4px 0 ${colors.accentDark}` }}
            >
              다음 →
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}

/** 만들기 화면 단추 모양(create/page BigButton) — 그림이라 누르는 것은 Tap 이 맡는다 */
function FakeBig({ colors, white, children }: { colors: Colors; white?: boolean; children: ReactNode }) {
  return (
    <span
      className="inline-flex max-w-full break-keep rounded-full px-6 py-3 text-base font-extrabold"
      style={
        white
          ? { background: "#fff", color: "#404040", boxShadow: "0 6px 0 rgba(0,0,0,0.12)" }
          : { background: colors.accent, color: "#fff", boxShadow: `0 6px 0 ${colors.accentDark}` }
      }
    >
      {children}
    </span>
  );
}

function ScreenTitle({ children }: { children: ReactNode }) {
  return <p className="break-keep text-center text-xl font-extrabold text-neutral-800 sm:text-2xl">{children}</p>;
}

function ChildScreen({ colors, onNext }: { colors: Colors; onNext: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div aria-hidden className="flex flex-col gap-4">
        <ScreenTitle>{SCREEN.child.title}</ScreenTitle>
        <div>
          <p className="mb-1.5 text-sm font-bold text-neutral-500">이름</p>
          <p className="w-full rounded-2xl border-2 border-neutral-200 bg-white px-4 py-2.5 text-lg font-bold text-neutral-900">{EX.child}</p>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-bold text-neutral-500">나이</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {AGES.map((a) => (
              <span
                key={a}
                style={a === EX.age ? { background: colors.accent } : undefined}
                className={`flex h-10 w-10 items-center justify-center rounded-full text-base font-extrabold ${
                  a === EX.age ? "scale-110 text-white shadow" : "bg-neutral-100 text-neutral-600"
                }`}
              >
                {a}
              </span>
            ))}
            <span className="flex h-10 items-center rounded-full bg-neutral-100 px-3 text-xs font-extrabold text-neutral-600">
              {SCREEN.child.over8}
            </span>
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-bold text-neutral-500">성별</p>
          <div className="flex gap-2">
            {(
              [
                { label: "여자", icon: "/icons/gender-girl.webp", on: true },
                { label: "남자", icon: "/icons/gender-boy.webp", on: false },
              ] as const
            ).map((g) => (
              <span
                key={g.label}
                style={g.on ? { background: colors.accent } : undefined}
                className={`flex flex-1 flex-col items-center gap-1 rounded-2xl py-2.5 font-bold ${
                  g.on ? "text-white shadow" : "bg-neutral-100 text-neutral-600"
                }`}
              >
                <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={g.icon} alt="" className="h-9 w-9 object-contain" />
                </span>
                <span className="text-sm">{g.label}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-center">
        <Tap shape="rounded-full" onClick={onNext} label={`${SCREEN.child.next} 누르기`}>
          <FakeBig colors={colors}>{SCREEN.child.next}</FakeBig>
        </Tap>
      </div>
    </div>
  );
}

function ThemeScreen({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <ScreenTitle>
        <span aria-hidden>{EX.child}의 동화, 어떤 이야기를 만들까요?</span>
      </ScreenTitle>
      <div className="grid grid-cols-2 gap-2.5">
        {SCREEN.theme.modes.map((m, i) => {
          const card = (
            <span className="flex h-full w-full flex-col items-center gap-1.5 rounded-3xl bg-neutral-100 p-3 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.icon} alt="" className="h-12 w-12 object-contain" />
              <b className="break-keep text-[15px] text-neutral-800">{m.label}</b>
              <span className="break-keep text-[11px] font-bold leading-snug text-neutral-500">{m.desc}</span>
            </span>
          );
          return i === 0 ? (
            <Tap key={m.label} shape="rounded-3xl" onClick={onNext} label={`${m.label} 고르기`} block>
              {card}
            </Tap>
          ) : (
            <span key={m.label} aria-hidden>
              {card}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function QuestionScreen({ colors, onNext }: { colors: Colors; onNext: () => void }) {
  const dots = EX.answers.length + 1; // 질문 장 + 마지막 요약 장
  return (
    <div className="flex flex-col gap-4">
      <div aria-hidden className="flex items-center justify-center gap-1.5">
        {Array.from({ length: dots }, (_, k) => (
          <span
            key={k}
            className={`h-2 rounded-full ${k === 0 ? "w-5" : "w-2 bg-neutral-300"}`}
            style={k === 0 ? { background: colors.accent } : undefined}
          />
        ))}
      </div>
      <ScreenTitle>
        <span aria-hidden>{EX.answers[0].q}</span>
      </ScreenTitle>
      {/* 한 줄 칸 수는 실제 만들기 화면과 같은 규칙 — 마지막 줄에 하나만 홀로 남지 않게(lib/balanced-grid, 10-21) */}
      <div className={`grid ${GUIDE_GRID_COLS[balancedCols(EX.places.length, 3)]} gap-2`}>
        {EX.places.map((o, oi) => {
          const on = o.t === EX.answers[0].a;
          const icon = chipIcon(o.t);
          const chip = (
            <span
              style={on ? { background: colors.accent } : undefined}
              className={`flex min-h-[52px] w-full flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1.5 text-sm font-bold leading-tight ${
                on ? "text-white shadow" : "bg-neutral-100 text-neutral-700"
              }`}
            >
              {icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={icon} alt="" className="h-8 w-8 shrink-0 object-contain" />
              ) : (
                <span className="text-xl leading-none">{o.e}</span>
              )}
              <span className="break-keep text-center">{o.t}</span>
            </span>
          );
          return on ? (
            <Tap key={o.t} shape="rounded-2xl" onClick={onNext} label={`${o.t} 고르기`} block>
              {chip}
            </Tap>
          ) : (
            <span
              key={o.t}
              aria-hidden
              className={`flex ${oi === EX.places.length - 1 && lonelyLast(EX.places.length, balancedCols(EX.places.length, 3)) ? "col-start-2" : ""}`}
            >
              {chip}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function VoiceScreen({ colors, onNext }: { colors: Colors; onNext: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div aria-hidden className="flex flex-col gap-4">
        <ScreenTitle>{SCREEN.style.title}</ScreenTitle>
        <p className="-mt-3 text-center text-xs font-bold text-neutral-400">그림은 모두 따뜻한 수채화로 그려요</p>
        <div>
          <p className="mb-1.5 text-xs font-bold text-neutral-400">한 권의 길이</p>
          <p className="rounded-2xl bg-neutral-100 px-4 py-2.5 text-sm font-extrabold text-neutral-700">
            {GUIDE_PAGE_COUNT}
            {SCREEN.style.pages}
          </p>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-bold text-neutral-400">
            읽어줄 성우 <span className="font-medium">(눌러서 들어보고 골라요)</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {SAMPLE_VOICES.map((v, i) => (
              <span
                key={v.id}
                style={i === 0 ? { background: colors.accent } : undefined}
                className={`flex items-center gap-1.5 rounded-full py-1.5 pl-2.5 pr-3.5 text-sm font-bold ${
                  i === 0 ? "text-white" : "bg-neutral-100 text-neutral-600"
                }`}
              >
                <VoiceGlyph voice={v} className="-my-0.5 h-6 w-6" />
                {v.label}
              </span>
            ))}
            <span className="flex items-center rounded-full px-2 text-sm font-bold text-neutral-400">…</span>
          </div>
        </div>
        <MakeSteps current={0} accent={colors.accent} className="-mx-2" />
      </div>
      <div className="flex justify-center">
        <Tap shape="rounded-full" onClick={onNext} label={`${SCREEN.style.make} 누르기`}>
          <FakeBig colors={colors}>{SCREEN.style.make}</FakeBig>
        </Tap>
      </div>
    </div>
  );
}

function StoryScreen({ colors, onNext }: { colors: Colors; onNext: () => void }) {
  const shown = EX.pages.slice(0, 3);
  return (
    <div className="flex flex-col gap-4">
      <div aria-hidden className="flex flex-col gap-4">
        <MakeSteps current={0} accent={colors.accent} className="-mx-2" />
        <ScreenTitle>{SCREEN.story.title}</ScreenTitle>
        <div className="rounded-2xl p-4" style={{ background: colors.accentSoft }}>
          <p className="flex items-center justify-center gap-1.5 text-center">
            <span className="break-keep text-lg font-extrabold text-neutral-800">{EX.title}</span>
            <span className="shrink-0 text-[11px] font-bold text-neutral-400 underline">{SCREEN.story.edit}</span>
          </p>
          <ol className="mt-3 flex flex-col gap-2.5">
            {shown.map((t, i) => (
              <li key={i} className="flex gap-2.5">
                <span
                  style={{ background: colors.accent }}
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-white"
                >
                  {i + 1}
                </span>
                <span className="flex-1 break-keep rounded-xl px-2 py-1 text-left text-sm font-medium leading-relaxed text-neutral-700">
                  {t}
                  <span className="ml-1.5 whitespace-nowrap text-[11px] font-bold text-neutral-400 underline">{SCREEN.story.edit}</span>
                </span>
              </li>
            ))}
            <li className="pl-8 text-xs font-bold text-neutral-400">… {GUIDE_PAGE_COUNT}쪽까지 이어져요</li>
          </ol>
        </div>
      </div>
      <div className="flex justify-center">
        <Tap shape="rounded-full" onClick={onNext} label={`${SCREEN.story.draw} 누르기`}>
          <FakeBig colors={colors}>{SCREEN.story.draw}</FakeBig>
        </Tap>
      </div>
      <div aria-hidden className="flex w-full flex-col gap-2 rounded-2xl bg-white/70 p-3 ring-1 ring-black/5">
        <p className="break-keep text-center text-xs font-extrabold text-neutral-600">대본이 마음에 안 드세요?</p>
        {[
          { t: `✍️ ${SCREEN.story.same}`, s: "줄거리는 그대로 두고 글만 새로 써요" },
          { t: `🔄 ${SCREEN.story.fresh}`, s: "같은 재료로 줄거리부터 새로 지어요" },
        ].map((b) => (
          <span key={b.t} className="flex min-h-11 w-full flex-col items-center justify-center rounded-2xl bg-white px-4 py-2 text-center shadow-sm ring-1 ring-black/10">
            <span className="break-keep text-sm font-extrabold text-neutral-700">{b.t}</span>
            <span className="break-keep text-[11px] font-medium text-neutral-500">{b.s}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function DrawScreen({ colors, loadingArt }: { colors: Colors; loadingArt: string }) {
  const drawn = Math.ceil(GUIDE_PAGE_COUNT / 2);
  return (
    <div aria-hidden className="flex flex-col items-center gap-4 py-1">
      <MakeSteps current={1} accent={colors.accent} className="-mx-2" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={loadingArt} alt="" className="h-auto w-full max-w-[14rem] rounded-3xl border-4 border-white shadow-lg" />
      <ScreenTitle>{SCREEN.draw.title}</ScreenTitle>
      <p className="text-center text-sm font-bold text-neutral-500">
        {drawn} / {GUIDE_PAGE_COUNT} 쪽
      </p>
      <div className="h-3 w-full overflow-hidden rounded-full bg-neutral-100">
        <div className="h-full rounded-full" style={{ width: `${(drawn / GUIDE_PAGE_COUNT) * 100}%`, background: colors.accent }} />
      </div>
      <div className="w-full rounded-3xl bg-white/80 px-4 py-3 shadow-inner">
        <p className="mb-1 text-center text-[11px] font-extrabold tracking-wide text-neutral-400">📖 그림을 기다리는 동안 먼저 읽어보세요</p>
        <p className="break-keep text-center text-sm font-bold leading-relaxed text-neutral-700">{EX.pages[0]}</p>
      </div>
    </div>
  );
}

function DoneScreen({ colors }: { colors: Colors }) {
  return (
    <div aria-hidden className="flex flex-col items-center gap-3">
      <div className="relative w-full overflow-hidden rounded-2xl bg-neutral-800 shadow-lg" style={{ aspectRatio: "4 / 3" }}>
        <div className="absolute inset-0 bg-gradient-to-b from-sky-100 to-amber-50" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={familyExampleSrc("girl")} alt="" className="absolute inset-x-0 bottom-0 mx-auto h-[94%] w-auto max-w-full object-contain object-bottom" />
        <span className="absolute left-2.5 top-2.5 rounded-full bg-white/95 px-2.5 py-[3px] text-[11px] font-extrabold text-neutral-600">
          예시 그림
        </span>
        <div className="absolute inset-x-0 bottom-2.5 flex justify-center px-2">
          <div className="rounded-3xl bg-neutral-900/80 px-3 py-1.5 backdrop-blur">
            <MakeSteps current={2} accent={colors.accent} tone="dark" />
          </div>
        </div>
      </div>
      <p className="w-full break-keep rounded-xl bg-white px-3 py-2 text-center text-[13px] font-bold leading-relaxed text-neutral-700 shadow-sm">
        {EX.pages[EX.pages.length - 1]}
      </p>
      <p className="break-keep text-center text-sm font-extrabold text-neutral-700">
        📚 &lsquo;{EX.title}&rsquo; 동화가 {SCREEN.home.shelves[0]}에 꽂혔어요
      </p>
    </div>
  );
}

/* ─────────────────────────── 3. 동화 보기·듣기 ─────────────────────────── */

function ReadSection({ colors, sample }: { colors: Colors; sample: GuideSample | null }) {
  return (
    <Card id="read" labelledBy="guide-read" className="scroll-mt-4">
      <CardTitle id="guide-read">
        <SectionNo n={3} colors={colors} /> 동화 보기·듣기
      </CardTitle>
      <p className="-mt-1 break-keep text-[13px] font-medium leading-relaxed text-neutral-500">
        책장에서 표지를 누르면 동화가 열려요. 화면의 단추는 이렇게 생겼어요{sample ? ` (그림은 전래동화 '${sample.title}')` : ""}.
      </p>

      {/* 실제 뷰어 단추 모양을 작게 — 번호는 아래 설명 번호 */}
      <div
        role="img"
        aria-label="동화 보기 화면 — 단추 자리는 아래 번호 설명과 같아요"
        className="relative mt-3 w-full overflow-hidden rounded-[20px] bg-neutral-800 shadow-lg"
        style={{ aspectRatio: "4 / 3" }}
      >
        {sample ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={sample.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : null}

        <div aria-hidden>
          {/* 왼쪽 위 */}
          <div className="absolute left-2 top-2 flex items-center gap-1.5">
            <span className="relative flex h-7 items-center gap-0.5 rounded-full bg-black/40 px-2 text-[11px] text-white/90 backdrop-blur">
              ← {SCREEN.viewer.shelf}
              <Badge n={1} colors={colors} />
            </span>
            <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-[12px] text-white/90 backdrop-blur">
              ⛶
              <Badge n={2} colors={colors} />
            </span>
            <span className="relative flex items-center rounded-full bg-black/40 p-0.5 backdrop-blur">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-neutral-700">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5">
                  <rect x="3.5" y="5" width="17" height="14" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
                  <circle cx="9" cy="10" r="1.5" fill="currentColor" />
                  <path d="m5.5 17 4.2-4 3.1 2.6 2.4-2.1 3.3 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="flex h-6 w-6 items-center justify-center rounded-full text-white/80">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5">
                  <path d="M3.5 5.5c3.5-.7 6.2.1 8.5 2.2v11c-2.3-2.1-5-2.9-8.5-2.2v-11Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                  <path d="M20.5 5.5c-3.5-.7-6.2.1-8.5 2.2v11c2.3-2.1 5-2.9 8.5-2.2v-11Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                </svg>
              </span>
              <Badge n={3} colors={colors} />
            </span>
            <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white/90 backdrop-blur">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5">
                <path d="M6 21V4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M6 4.5h11.5l-2.2 4 2.2 4H6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              </svg>
              <Badge n={4} colors={colors} />
            </span>
          </div>

          {/* 오른쪽 위 */}
          <div className="absolute right-2 top-2 flex items-center gap-1.5">
            <span
              className="relative flex h-7 w-7 items-center justify-center rounded-full text-white shadow-md"
              style={{ background: colors.accent }}
            >
              <span className="text-sm leading-none">♪</span>
              <Badge n={5} colors={colors} />
            </span>
            <span className="relative flex h-7 items-center gap-1 rounded-full bg-white/85 px-2 text-neutral-600 shadow-md backdrop-blur">
              <VoiceGlyph voice={SAMPLE_VOICES[0]} className="h-5 w-5" />
              <span className="text-[10px] font-extrabold">{SCREEN.viewer.voice}</span>
              <Badge n={6} colors={colors} />
            </span>
          </div>

          {/* 쪽 글 */}
          {sample ? (
            // 여백은 바깥 상자에, 두 줄 자르기는 안쪽 글에 — 한 칸에 같이 두면 셋째 줄 윗부분이 아래 여백 자리에 비쳐
            // 쪽 넘기기 단추에 깔린 것처럼 보였다(폰 390, 2026-10-22). 폰에서는 아래 단추 줄과 띄우려고 조금 올린다.
            <div className="absolute inset-x-[12%] bottom-[26%] rounded-xl bg-white/80 px-3 py-1.5 sm:bottom-[22%]">
              <p className="line-clamp-2 break-keep text-center text-[11px] font-bold leading-relaxed text-neutral-800 sm:text-[13px]">{sample.text}</p>
            </div>
          ) : null}

          {/* 왼쪽 아래 */}
          <span className="absolute bottom-2 left-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-sm font-extrabold text-white backdrop-blur">
            <span className="leading-none">
              <span className="text-[0.7em]">가</span>
              <span className="text-[1.05em]">가</span>
            </span>
            <Badge n={7} colors={colors} />
          </span>

          {/* 아래 가운데 */}
          <span className="absolute bottom-2 left-1/2 flex h-8 -translate-x-1/2 items-center gap-0.5 rounded-full bg-black/45 px-1 text-white backdrop-blur">
            <span className="px-1 text-sm font-extrabold">‹</span>
            <span className="min-w-[2.5rem] text-center text-[11px] font-extrabold text-white/90">1 / {GUIDE_PAGE_COUNT}</span>
            <span className="rounded-full bg-white/20 px-1.5 text-sm font-extrabold">›</span>
            <Badge n={8} colors={colors} />
          </span>

          {/* 오른쪽 아래 */}
          <div className="absolute bottom-2 right-2 flex flex-col items-center gap-1">
            <span className="hidden rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-extrabold text-white backdrop-blur sm:block">
              ▶ {SCREEN.viewer.read}
            </span>
            <span
              className="relative flex h-11 w-11 items-center justify-center rounded-full text-white shadow-[0_6px_16px_rgba(0,0,0,0.4)]"
              style={{ background: colors.accent }}
            >
              <svg viewBox="0 0 24 24" className="ml-0.5 h-6 w-6">
                <path d="M7 4.5v15l12.5-7.5Z" fill="#fff" />
              </svg>
              <Badge n={9} colors={colors} />
            </span>
          </div>
        </div>
      </div>

      <ol className="mt-4 flex flex-col gap-2.5">
        {VIEWER_CONTROLS.map((c) => (
          <li key={c.n} className="flex items-start gap-2.5">
            <span
              aria-hidden
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold text-white"
              style={{ background: colors.accentDark }}
            >
              {c.n}
            </span>
            <p className="min-w-0 break-keep text-[13px] font-medium leading-relaxed text-neutral-600">
              <span className="sr-only">{c.n}. </span>
              <b className="text-neutral-800">{c.name}</b> <span className="text-[12px] text-neutral-400">· {c.where}</span>
              <br />
              {c.what}
            </p>
          </li>
        ))}
      </ol>

      <p className="mt-4 flex items-center gap-2 break-keep rounded-[20px] bg-stone-50 px-4 py-3 text-[13px] font-medium leading-relaxed text-neutral-600 shadow-[inset_0_0_0_1px_#f0ede8]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/hint-tap.webp" alt="" className="h-8 w-8 shrink-0 object-contain" />
        <span>
          세계명작·전래동화 중에는 <b className="text-neutral-800">그림 속 친구를 누르면 말을 하는</b> 동화도 있어요. 읽어 주는
          동안에는 단추가 숨어 그림이 잘 보여요 — 단추가 필요하면 왼쪽 위 &lsquo;⋯&rsquo;를 누르세요.
        </span>
      </p>
    </Card>
  );
}

/* ─────────────────────────── 4. 우리 가족 ─────────────────────────── */

function FamilySection({ colors, background }: { colors: Colors; background: string }) {
  return (
    <Card id="family" labelledBy="guide-family" className="scroll-mt-4">
      <CardTitle id="guide-family">
        <SectionNo n={4} colors={colors} /> 우리 가족 캐릭터
      </CardTitle>
      <p className="-mt-1 break-keep text-[13px] font-medium leading-relaxed text-neutral-500">
        가족을 한 번 그려 두면, 그다음부터 만드는 동화에 같은 얼굴로 나와요. 홈의 가족 액자에서 시작해요.
      </p>

      <Stage background={background} label="홈 가족 액자" tall>
        <div className="flex w-full flex-col items-center overflow-hidden rounded-[22px] bg-white/90 shadow-xl sm:flex-row">
          <div aria-hidden className="relative h-36 w-full bg-gradient-to-b from-sky-100 to-amber-50 sm:h-44 sm:flex-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={familyExampleSrc("girl")}
              alt=""
              className="absolute inset-x-0 bottom-1.5 mx-auto h-[92%] w-auto max-w-[96%] object-contain object-bottom"
            />
            <span className="absolute left-2.5 top-2.5 rounded-full bg-white/95 px-2.5 py-[3px] text-[11px] font-extrabold text-neutral-600">
              예시 그림
            </span>
          </div>
          <div className="flex flex-col items-center px-3 pb-5 pt-3 text-center sm:w-[210px] sm:shrink-0">
            <p aria-hidden className="text-[17px] font-extrabold text-neutral-800">
              {SCREEN.family.title}
            </p>
            <p aria-hidden className="mt-1 break-keep text-[12.5px] font-medium leading-[1.45] text-neutral-600">
              그려 둔 가족은 동화마다
              <br />
              같은 얼굴로 나와요
            </p>
            <span className="mt-3">
              <Tap shape="rounded-full">
                <span
                  className="flex h-[46px] items-center justify-center rounded-full px-5 text-[17px] font-extrabold text-white"
                  style={{ background: colors.accent, boxShadow: `0 6px 0 ${colors.accentDark}` }}
                >
                  {SCREEN.family.go}
                </span>
              </Tap>
            </span>
          </div>
        </div>
      </Stage>

      <ol className="mt-4 flex flex-col gap-4">
        <StepRow
          n={1}
          colors={colors}
          title="누구를 그릴지 골라요"
          body="고른 가족은 그려서 얼굴을 고정해요. 안 고른 가족은 동화마다 새로 그려요."
        />
        <StepRow
          n={2}
          colors={colors}
          title="특징을 고르거나 사진 한 장으로 그려요"
          body={`머리 모양·안경 같은 특징을 칩으로 고르거나, 사진 한 장을 올려요. ${SCREEN.family.photo} — 그림을 그리는 데 한 번 쓰고 바로 지워요.`}
        >
          <div aria-hidden className="grid grid-cols-2 gap-2">
            <span
              className="flex min-h-[56px] items-center gap-2 rounded-2xl px-3 py-2 text-left shadow"
              style={{ background: colors.accentSoft, boxShadow: `inset 0 0 0 2px ${colors.accent}`, color: colors.accentDark }}
            >
              <ChipsIcon size={22} />
              <span className="flex min-w-0 flex-col">
                <span className="break-keep text-[14px] font-extrabold leading-tight">{SCREEN.looks.chips}</span>
                <span className="break-keep text-[11px] font-semibold text-neutral-500">칩으로 골라요</span>
              </span>
            </span>
            <span className="flex min-h-[56px] items-center gap-2 rounded-2xl bg-neutral-50 px-3 py-2 text-left text-neutral-600">
              <CameraIcon size={22} />
              <span className="flex min-w-0 flex-col">
                <span className="break-keep text-[14px] font-extrabold leading-tight">{SCREEN.looks.photo}</span>
                <span className="break-keep text-[11px] font-semibold text-neutral-500">사진 한 장이면 돼요</span>
              </span>
            </span>
          </div>
        </StepRow>
        <StepRow
          n={3}
          colors={colors}
          title="다 그려지면 확인해요"
          body="마음에 들면 그 얼굴로 정해 두고, 이후 만드는 동화 그림에 같은 얼굴로 나와요. 그릴 때 값이 들면 단추에 함께 적혀 있어요."
        />
      </ol>
    </Card>
  );
}

/* ─────────────────────────── 작은 조각 ─────────────────────────── */

/** 칸 번호(목차 번호와 같다) */
function SectionNo({ n, colors }: { n: number; colors: Colors }) {
  return (
    <span
      aria-hidden
      className="mr-1 inline-flex h-6 w-6 items-center justify-center rounded-full align-[0.1em] text-[12px] text-white"
      style={{ background: colors.accent }}
    >
      {n}
    </span>
  );
}

/** 번호 + 제목 + 설명 + (화면 조각) 한 줄 */
function StepRow({
  n,
  colors,
  title,
  body,
  children,
}: {
  n: number;
  colors: Colors;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold"
        style={{ background: colors.accentSoft, color: colors.accentDark, boxShadow: `inset 0 0 0 1.5px ${colors.accent}` }}
      >
        {n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div>
          <h3 className="break-keep text-[15px] font-extrabold text-neutral-800">{title}</h3>
          <p className="mt-0.5 break-keep text-[13px] font-medium leading-relaxed text-neutral-600">{body}</p>
        </div>
        {children}
      </div>
    </li>
  );
}

/** 나라 배경 위에 화면 조각을 올려 실제 화면처럼 보이게 하는 틀 */
function Stage({ background, label, tall, children }: { background: string; label: string; tall?: boolean; children: ReactNode }) {
  return (
    <figure className={`relative isolate overflow-hidden rounded-[24px] ring-1 ring-black/5 ${tall ? "p-3 sm:p-4" : "px-3 pb-4 pt-9"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={background} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover" />
      <div className="absolute inset-0 -z-10 bg-white/30" />
      <figcaption className="sr-only">{label} 예시</figcaption>
      <span
        aria-hidden
        className="absolute right-2 top-2 z-[1] rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-extrabold text-neutral-500 shadow-sm"
      >
        화면 예시
      </span>
      <div className={`relative flex justify-center ${tall ? "pt-5" : ""}`}>{children}</div>
    </figure>
  );
}

/**
 * 눌러야 할 곳 짚기 — 나라 색 테두리가 숨 쉬듯 깜빡이고 손가락 스티커(public/icons/hint-tap)가 붙는다.
 * onClick 이 있으면 진짜 단추(따라 하기 다음 단계), 없으면 그림만.
 */
function Tap({
  children,
  shape,
  onClick,
  label,
  block,
}: {
  children: ReactNode;
  shape: string;
  onClick?: () => void;
  label?: string;
  block?: boolean;
}) {
  const { theme } = useTheme();
  const inner = (
    <>
      {/* block — 안쪽 그림도 칸을 꽉 채운다(*:w-full). 그림이 글자 폭으로 줄면 테두리만 칸 전체를 둘러 어긋났다(10-22 사장님 화면). */}
      <span aria-hidden className={block ? "flex w-full *:w-full" : "contents"}>
        {children}
      </span>
      <span
        aria-hidden
        className={`pointer-events-none absolute -inset-1.5 ${shape} motion-safe:animate-pulse`}
        style={{ boxShadow: `0 0 0 3px ${theme.colors.accentDark}` }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icons/hint-tap.webp"
        alt=""
        aria-hidden
        className="pointer-events-none absolute -bottom-4 -right-3 z-[2] h-9 w-9 object-contain drop-shadow motion-safe:animate-[float_2s_ease-in-out_infinite]"
      />
    </>
  );
  const cls = `relative ${block ? "flex w-full" : "inline-flex"} ${shape}`;
  if (!onClick) return <span className={cls}>{inner}</span>;
  return (
    <button type="button" onClick={onClick} aria-label={`${label ?? "여기"} — 다음 단계 보기`} className={`${cls} ${FOCUS}`}>
      {inner}
    </button>
  );
}

/** 동화 화면 그림의 번호 동그라미 */
function Badge({ n, colors }: { n: number; colors: Colors }) {
  return (
    <span
      className="absolute -right-1.5 -top-1.5 z-[1] flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-extrabold leading-none text-white ring-2 ring-white"
      style={{ background: colors.accentDark }}
    >
      {n}
    </span>
  );
}
