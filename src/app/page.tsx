"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BgVideo } from "@/components/BgVideo";
import { Bookshelf } from "@/components/Bookshelf";
import { useTheme } from "@/components/ThemeProvider";
import { currentUserId, getTokens, logOut } from "@/lib/auth";
import classicBooksJson from "@/data/classic-books.json";
import folkBooksJson from "@/data/folk-books.json";
import books from "@/data/sample-books.json";
import { loadLang, loadMyBooks } from "@/lib/prefs";
import type { Book } from "@/lib/types";

export default function Home() {
  const { theme } = useTheme();
  const router = useRouter();
  // 로그인 게이트(베타) — 로그인 안 했으면 로그인 화면으로. authed=null은 확인 전(깜빡임 방지).
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tokens, setTokens] = useState(0);
  useEffect(() => {
    if (!currentUserId()) {
      router.replace("/login");
      return;
    }
    setAuthed(true);
    setTokens(getTokens());
  }, [router]);
  // 그림책나라 배경(이사님 hero)은 인물이 크게 담겨 넓은 화면에서 꽉 차 부담스럽다.
  // 살짝 흐리고 흰 베일을 더 얹어 은은하게 가라앉힌다 — 이 테마에만 적용한다.
  const softBg = theme.id === "picturebook";

  // 언어는 설정(⚙️)에서 고른다. 메인은 아이가 보는 화면이라 컨트롤을 두지 않는다.
  const all = books as Book[];
  // 저장된 언어는 서버 렌더 이후에 읽어 첫 HTML과 클라이언트 첫 렌더를 맞춘다.
  const [lang, setLang] = useState("ko");
  // 내가 만든 책도 서버 렌더 이후(마운트 후) localStorage에서 읽는다.
  const [myBooks, setMyBooks] = useState<Book[]>([]);
  useEffect(() => {
    setLang(loadLang());
    setMyBooks(loadMyBooks());
  }, []);
  // 내가 만든 책(최신 먼저, 숨긴 건 제외) + 샘플. "우리 가족 책장"에 함께 뜬다.
  // 책 관리(숨김·삭제)는 책장이 아니라 설정(⚙️) › "내 동화"에서 한다.
  const mine = [...myBooks, ...all].filter((b) => b.lang === lang && !b.hidden);

  // 은은하게 움직이는 배경 영상(/themes/<id>/bg-video.mp4)이 있는 테마.
  // 파일을 넣고 여기 id만 추가하면 그 테마 홈이 살아 움직인다.
  const THEMES_WITH_BG_VIDEO = new Set([
    "space",
    "dino",
    "car",
    "princess",
    "ocean",
    "storybook",
  ]);
  // 책장 탭 — 내가 만든 책 | 제공 서가(전래동화·세계명작, 빈 책장 해결사).
  // 제공 서가는 언어 필터를 안 탄다 — 서가 자체가 콘텐츠다.
  const [shelf, setShelf] = useState<"mine" | "folk" | "classic">("mine");
  // hidden 책은 서가에서만 내린다 (주소로는 열림) — 다듬는 중인 책 보관용.
  const folk = (folkBooksJson as Book[]).filter((b) => !b.hidden);
  const classics = (classicBooksJson as Book[]).filter((b) => !b.hidden);
  const shown = shelf === "mine" ? mine : shelf === "folk" ? folk : classics;

  // 로그인 확인 전에는 빈 화면 — 로그인 화면으로 리다이렉트되는 동안 깜빡임 방지.
  if (authed === null) return null;

  return (
    <div className="relative min-h-dvh w-full overflow-hidden">
      {softBg ? (
        // 그림책나라 — 배경(이사님 hero)을 화면 가득 채우면 인물이 크고 눈이
        // 피로하다. 흐림도 뿌옇게 보여 오히려 이상하다. 그래서 영상을 중앙
        // 1200px 폭 '액자' 안에만 두고, 바깥은 크림빛 여백으로 감싼다. 넓은
        // 화면일수록 양옆 크림이 넉넉해져 아늑한 그림책 펼침면처럼 보인다.
        <div className="fixed inset-0 -z-10 bg-[#efe6d4]">
          <div className="relative mx-auto h-full w-full max-w-[1200px] overflow-hidden shadow-[0_0_80px_rgba(120,90,50,0.12)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={theme.background}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
            <BgVideo
              src={`/themes/${theme.id}/bg-video.mp4`}
              poster={theme.background}
              className="pointer-events-none absolute inset-0 h-full w-full object-cover motion-reduce:hidden"
            />
          </div>
        </div>
      ) : (
        <>
          {/* 테마 배경 — 화면을 항상 꽉 채운다. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={theme.background}
            alt=""
            className="fixed inset-0 -z-10 h-full w-full object-cover"
          />
          {/* 은은하게 움직이는 배경 영상이 있는 테마만 재생한다. 정지 이미지(poster)를
              깔아 로딩 지연이 없고, "모션 줄이기" 기기에선 영상이 숨겨진다. key가 없으면
              테마 전환 때 소스가 다시 로드되지 않아 poster만 뜬다. */}
          {THEMES_WITH_BG_VIDEO.has(theme.id) && (
            <BgVideo
              src={`/themes/${theme.id}/bg-video.mp4`}
              poster={theme.background}
              className="pointer-events-none fixed inset-0 -z-10 h-full w-full object-cover motion-reduce:hidden"
            />
          )}
        </>
      )}
      {/* 원색 배경이 너무 세면 책 표지가 묻힌다 — 흰 베일로 채도를 한 김 뺀다.
          그림책나라는 중앙 영상만이라 아주 옅게(제목 대비는 글자 그림자로 낸다). */}
      <div className={`fixed inset-0 -z-10 ${softBg ? "bg-white/10" : "bg-white/25"}`} />

      {/* 아래 여백: 폰은 버튼이 흐름 안에 있어 얕게, sm부터는 떠 있는 버튼 자리만큼. */}
      <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col justify-center px-6 pb-10 pt-6 sm:pb-32">
        {/* 토큰 잔액 배지 — 누르면 설정(충전)으로. 부모용 정보라 좌상단에 얹는다. */}
        <Link
          href="/settings"
          aria-label="내 토큰"
          className="fixed left-4 top-4 z-10 flex items-center gap-1 rounded-full bg-white/85 px-3.5 py-2 text-sm font-extrabold text-neutral-700 shadow backdrop-blur transition hover:bg-white"
        >
          🪙 {tokens}
        </Link>

        {/* 설정(⚙️) — 아이 정보·나라·언어·계정은 전부 이 뒤에 있다. 부모용. */}
        <Link
          href="/settings"
          aria-label="설정"
          className="fixed right-4 top-4 z-10 flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-white/80 shadow backdrop-blur transition hover:bg-white"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/func-gear.webp" alt="" className="h-9 w-9 object-contain" />
        </Link>

        <header className="mb-6 flex flex-col items-center text-center">
          {/* 테마 마스코트 — 동그란 뱃지, 둥둥 떠서 아이를 반긴다 */}
          <div className="animate-[float_3s_ease-in-out_infinite] drop-shadow-[0_10px_20px_rgba(0,0,0,0.2)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={theme.mascot}
              alt={theme.mascotName}
              className="h-28 w-28 rounded-full border-4 border-white object-cover sm:h-32 sm:w-32"
            />
          </div>
          {/* 흰 제목이 밝은 배경(그림책나라 크림 등)에 묻히지 않게, 어두운
              외곽선(text-stroke)+다층 그림자로 어느 테마에서든 윤곽이 뜨게 한다. */}
          <h1
            className="mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-4xl"
            style={{
              textShadow:
                "0 2px 8px rgba(0,0,0,0.5), 0 0 6px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.45)",
              WebkitTextStroke: "0.6px rgba(60,40,25,0.4)",
            }}
          >
            우리 가족 보이스 동화
          </h1>
          {/* 밝은 하늘 배경 위라 흰 글자는 묻힌다 — 불투명 흰 알약 + 짙은 글자로 */}
          <p className="mt-1.5 rounded-full bg-white/95 px-4 py-1.5 text-sm font-extrabold text-neutral-700 shadow-md">
            내가 주인공인 동화, 엄마·아빠 목소리로 들어요
          </p>

        </header>

        {/*
          책 만들기 — 이 앱의 핵심 행동. 화면 크기에 따라 연출을 바꾼다.

          · 폰(세로, sm 미만): 떠 있는 버튼이 책장을 가리므로 제목 아래
            흐름 안의 큰 버튼으로 둔다.
          · 태블릿·PC(sm 이상): 화면 아래 고정 — 태블릿을 두 손으로 잡았을 때
            엄지가 닿는 자리. 화면이 낮으면(가로 폰 등) 한 단계 줄인다.
          · 아이콘은 테마와 무관하게 항상 같은 모양(책+연필): 아이는 버튼을 모양으로
            기억하므로 테마마다 바뀌면 매번 다시 배워야 한다. 색만 테마를 따른다.
        */}
        <Link
          href="/create"
          aria-label="우리 가족 동화 만들기"
          className="mx-auto mb-7 flex w-full max-w-sm items-center justify-center gap-2 rounded-full px-6 py-3.5 text-white transition-transform active:translate-y-0.5 sm:hidden"
          style={{
            background: theme.colors.accent,
            boxShadow: `0 6px 0 ${theme.colors.accentDark}, 0 10px 18px rgba(0,0,0,0.22)`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/create.webp" alt="" className="h-9 w-9 object-contain" />
          <span className="text-xl font-extrabold tracking-tight">동화 만들기</span>
        </Link>

        {/* 책장 탭 — 아이 책장이 비어 있어도 전래동화가 있어 첫 화면이 허전하지 않다.
            아이콘은 힉스필드 스티커(책더미·청사초롱·동화성) — 이모지 졸업. */}
        <div className="mb-6 flex justify-center gap-2">
          {(
            [
              { key: "mine", label: "우리 가족 책장", icon: "/icons/tab-mine.webp" },
              { key: "folk", label: "전래동화", icon: "/icons/tab-folk.webp" },
              { key: "classic", label: "세계명작", icon: "/icons/tab-classic.webp" },
            ] as const
          ).map((t) => {
            const active = shelf === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setShelf(t.key)}
                aria-pressed={active}
                style={active ? { color: theme.colors.accentDark } : undefined}
                // 폰에서는 작게(줄바꿈 금지), sm부터 원래 크기 — 탭 세 개가 한 줄에 서게.
                className={`flex items-center gap-1 whitespace-nowrap rounded-full py-1.5 pl-1.5 pr-3.5 text-sm font-extrabold shadow-md backdrop-blur transition sm:py-2 sm:pr-5 sm:text-base ${
                  active
                    ? "scale-105 bg-white"
                    : // 흰 글자는 공주나라 같은 파스텔 배경에서 통째로 묻힌다 —
                      // 반투명 흰 알약 + 짙은 글자는 어느 테마에서든 보인다.
                      "bg-white/70 text-neutral-500 hover:bg-white/90"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.icon} alt="" className="h-7 w-7 object-contain sm:h-8 sm:w-8" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* 빈 책장 — 서가마다 다음 행동을 알려준다 (만들기 유도 / 준비 중 안내). */}
        {shown.length === 0 ? (
          <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-[28px] bg-white/85 px-8 py-10 text-center shadow-xl backdrop-blur">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={theme.mascot}
              alt=""
              className="h-20 w-20 rounded-full border-4 border-white object-cover shadow"
            />
            {shelf === "mine" ? (
              <>
                <p className="text-lg font-extrabold text-neutral-700">아직 만든 동화가 없어요</p>
                <p className="text-sm font-bold leading-relaxed text-neutral-400">
                  우리 아이가 주인공인 첫 동화를 만들어 보세요!
                  <br />
                  기다리는 동안 🏮 전래동화도 들어볼 수 있어요.
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-extrabold text-neutral-700">열심히 준비하고 있어요!</p>
                <p className="text-sm font-bold leading-relaxed text-neutral-400">
                  {shelf === "classic"
                    ? "신데렐라, 미운오리새끼 같은 세계명작 동화들이 곧 도착해요."
                    : "재미있는 이야기들이 곧 도착해요."}
                </p>
              </>
            )}
          </div>
        ) : (
          <Bookshelf books={shown} />
        )}


        <Link
          href="/create"
          aria-label="우리 가족 동화 만들기"
          className="fixed bottom-5 left-1/2 z-10 hidden -translate-x-1/2 items-center gap-3 rounded-full px-7 py-3.5 text-white transition-transform hover:-translate-y-0.5 hover:-translate-x-1/2 active:translate-y-0 active:-translate-x-1/2 animate-[float_2.4s_ease-in-out_infinite] sm:flex lg:px-8 lg:py-4 [@media(max-height:600px)]:px-4 [@media(max-height:600px)]:py-2"
          style={{
            background: theme.colors.accent,
            boxShadow: `0 8px 0 ${theme.colors.accentDark}, 0 14px 24px rgba(0,0,0,0.25)`,
          }}
        >
          {/* 아이콘도 힉스필드 아트(웃는 마법책+연필, 배경 따냄) — 이모지 졸업 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/create.webp"
            alt=""
            className="h-10 w-10 object-contain lg:h-12 lg:w-12 [@media(max-height:600px)]:h-7 [@media(max-height:600px)]:w-7"
          />
          <span className="text-xl font-extrabold tracking-tight lg:text-2xl [@media(max-height:600px)]:text-base">
            동화 만들기
          </span>
        </Link>
      </main>
    </div>
  );
}
