"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AddToHomeHint } from "@/components/AddToHomeHint";
import { BgVideo } from "@/components/BgVideo";
import { Bookshelf } from "@/components/Bookshelf";
import { FamilyFrame } from "@/components/FamilyFrame";
import { SiteFooter } from "@/components/pay/SiteFooter";
import { useTheme } from "@/components/ThemeProvider";
import { UpdateNotice } from "@/components/UpdateNotice";
import { DEMO_SHELF_OWNER, loadSession } from "@/lib/auth";
import { newerStudio, type FamilyStudio } from "@/lib/family-studio";
import { withOutfit, type MemberOutfit, type OutfitThemeId } from "@/lib/family-outfit";
import classicBooksJson from "@/data/classic-books.json";
import folkBooksJson from "@/data/folk-books.json";
import books from "@/data/sample-books.json";
import {
  loadChild,
  loadChildRemote,
  loadLang,
  loadMyBooksBrief,
  loadShelfCols,
  loadShelfCache,
  migrateLegacyBooks,
  saveChild,
  saveShelfCache,
  toShelfBook,
  type ChildPrefs,
  type ShelfBook,
} from "@/lib/prefs";
import { loadLibraryAccess } from "@/lib/library-access";
import { viewerTierOf, type MemberPlanKey } from "@/lib/member-plan";
import { loadMyPlanKey } from "@/lib/member-plan-client";
import { libraryLock, OPEN_LIBRARY, type LibraryAccess } from "@/lib/offer-settings";
import { READ_ALOUD_VOICE } from "@/lib/plans";
import { acctKey, currentUid } from "@/lib/supabase";
import type { Book } from "@/lib/types";
import { asBooks } from "@/lib/types";

/**
 * 홈 가족 액자 접힘 — 계정마다 이 기기에도 남긴다. 아이 정보(profiles.child)가 아직 없는 회원(막 가입,
 * 새 기기에서 계정 값이 오기 전)도 접은 값이 남게. 아이 정보가 오면 계정(서버)에도 올린다.
 */
const FOLD_KEY = "voice-storybook:homeFamilyFolded";

function readLocalFold(): boolean | undefined {
  try {
    const v = window.localStorage.getItem(acctKey(FOLD_KEY));
    return v === "1" ? true : v === "0" ? false : undefined;
  } catch {
    return undefined;
  }
}

function writeLocalFold(f: boolean): void {
  try {
    window.localStorage.setItem(acctKey(FOLD_KEY), f ? "1" : "0");
  } catch {
    /* 저장 못 해도 화면은 바뀐다 */
  }
}

export default function Home() {
  const { theme } = useTheme();
  const router = useRouter();
  // 로그인 게이트(베타) — 로그인/게스트 둘 다 아니면 로그인 화면으로. authed=null은 확인 전.
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [guest, setGuest] = useState(false);
  // 로그인한 회원 id — 관리자가 지정한 요금제(책장 자물쇠)를 읽을 때 쓴다. 게스트는 null.
  const [memberUid, setMemberUid] = useState<string | null>(null);
  const [master, setMaster] = useState(false);
  // 데모 책장(sample-books.json)을 띄울 계정인가 — yogico 하나. DEMO_SHELF_OWNER 설명 참고.
  const [demoShelf, setDemoShelf] = useState(false);
  const [tokens, setTokens] = useState(0);
  // 책장에는 제목·표지·쪽수만 있으면 된다 — 본문·삽화까지 받으면 책 한 권이 수 MB다.
  const [myBooks, setMyBooks] = useState<ShelfBook[]>([]);
  // 내 책을 다 불러왔는지 — 이게 true가 되기 전엔 홈을 아예 열지 않는다.
  // 책장이 빈 채로 먼저 뜨고 나중에 채워지면 어수선해서, 준비가 끝난 뒤 한 번에 보여준다.
  const [booksLoaded, setBooksLoaded] = useState(false);
  // 아이 정보(이름·나이·우리 가족) — 가족 액자에 쓴다. 아래 언어(lang)와 같은 이유로
  // 서버 렌더 뒤에 읽는다. 로그인 계정 값은 세션 확인 뒤 loadChildRemote 로 덮는다.
  const [child, setChild] = useState<ChildPrefs | null>(null);
  // 가족 액자 접힘 — 아이 정보가 없을 때도 계정마다 이 기기에 남긴 값(아래 FOLD_KEY)
  const [localFold, setLocalFold] = useState<boolean | undefined>(undefined);
  /** 아이 정보가 오기 전에 접거나 편 값 — 계정 값이 오면 그때 계정에 올린다 */
  const pendingFold = useRef<boolean | null>(null);
  /**
   * 계정 값(loadChildRemote)이 오기 전에 가족 사진을 꾸몄으면 그 값 — 뒤늦게 온 서버의 옛 값이 방금 꾸민 것을
   * 잠깐 되돌리지 않게, 계정 값이 오면 이것을 얹어 다시 저장한다.
   */
  const pendingStudio = useRef<FamilyStudio | null>(null);
  // 받은 옷을 차례로 얹을 때 늘 최신 아이 정보를 보도록(두 사람 옷이 거의 같이 와도 앞 것이 지워지지 않게)
  const childRef = useRef<ChildPrefs | null>(null);
  useEffect(() => {
    childRef.current = child;
  }, [child]);
  /** 옷 갈아입기 — 한 사람 옷 한 벌을 받았다. 가족 화면(saveMemberOutfit)처럼 이 기기에 바로, 서버는 800ms 뒤 합쳐서. */
  function saveMemberOutfit(id: string, theme: OutfitThemeId, outfit: MemberOutfit) {
    const c = childRef.current;
    if (!c) return;
    const family = (c.family ?? []).map((m) => (m.id === id ? withOutfit(m, theme, outfit) : m));
    const next = { ...c, family };
    childRef.current = next;
    setChild(next);
    saveChild({ name: c.name, family });
  }
  /* eslint-disable react-hooks/set-state-in-effect -- 하이드레이션 안전: 저장된 아이 정보·접힘 값을 마운트 후 반영 */
  useEffect(() => {
    setChild(loadChild());
    setLocalFold(readLocalFold());
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    let alive = true;
    (async () => {
      // 마지막으로 본 책장을 먼저 그린다 — 새로고침할 때마다 서버 응답을 기다리며
      // 빈 책장을 보고 있지 않게. 아래에서 새로 받아 곧바로 갱신한다.
      // (기기에 세션이 있어야 uid가 나오므로, 로그인 상태일 때만 그려진다.)
      const cachedUid = await currentUid();
      if (!alive) return;
      if (cachedUid) {
        const cached = loadShelfCache(cachedUid);
        if (cached && cached.length > 0) {
          setAuthed(true);
          setMyBooks(cached);
          setBooksLoaded(true);
        }
      }

      // 회원 확인(프로필)과 책 불러오기를 동시에 시작한다 — 줄 세우면 책장이 그만큼
      // 늦게 뜬다(피드백 5번). 둘 다 로컬 세션의 id만 있으면 되는 질의라 순서가 필요 없다.
      // 옛 기기 책 이관은 남아 있을 때만 네트워크를 쓰므로 같이 걸어도 공짜다.
      const [s] = await Promise.all([loadSession(), migrateLegacyBooks()]);
      if (!alive) return;
      if (!s.uid && !s.guest) {
        router.replace("/login");
        return;
      }
      setAuthed(true);
      setGuest(s.guest);
      setMemberUid(s.uid ?? null);
      setMaster(s.isMaster);
      setDemoShelf(s.isMaster && s.profile?.username === DEMO_SHELF_OWNER);
      setTokens(s.profile?.tokens ?? 0);
      // 가족 액자용 아이 정보 — 다른 기기에서 그린 가족도 보이게 계정 값을 받아 온다.
      // 기다리지 않는다: 책장을 늦추면 안 되고, 그동안은 기기에 있던 값(위 loadChild)으로 그린다.
      if (s.uid) {
        loadChildRemote().then((remote) => {
          if (!alive || !remote) return;
          let c = remote;
          // 계정 값이 오기 전에 꾸몄으면 — 나중에 꾸민 쪽(at)이 이긴다. 받은 값은 이미 이 기기 값과 합친 것이라 보통
          // 같다. 다른 기기에서 더 나중에 꾸민 값이면 그것을 둔다(방금 꾸민 옛 값으로 덮지 않는다).
          const studio = newerStudio(c.familyStudio, pendingStudio.current);
          pendingStudio.current = null;
          if (studio && JSON.stringify(studio) !== JSON.stringify(c.familyStudio ?? null)) {
            saveChild({ name: c.name, familyStudio: studio });
            c = { ...c, familyStudio: studio };
          }
          // 아이 정보가 없을 때 접었거나 폈으면(또는 계정에 아직 접힘 값이 없으면) 이제 계정에도 올린다.
          const f = pendingFold.current ?? (c.homeFamilyFolded === undefined ? readLocalFold() : undefined);
          pendingFold.current = null;
          if (f !== undefined && f !== c.homeFamilyFolded) {
            saveChild({ name: c.name, homeFamilyFolded: f });
            setChild({ ...c, homeFamilyFolded: f });
            return;
          }
          setChild(c);
        });
      }
      try {
        if (s.uid) {
          const fresh = await loadMyBooksBrief();
          if (!alive) return;
          setMyBooks(fresh);
          saveShelfCache(s.uid, fresh); // 다음 새로고침 때 즉시 그리도록 남겨 둔다
        }
      } finally {
        // 책을 못 불러와도(오프라인 등) 화면은 반드시 열어준다 — 준비 화면에 갇히지 않게.
        if (alive) setBooksLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [router]);

  // 언어는 설정(⚙️)에서 고른다. 메인은 아이가 보는 화면이라 컨트롤을 두지 않는다.
  const all = asBooks(books);
  // 저장된 언어는 서버 렌더 이후에 읽어 첫 HTML과 클라이언트 첫 렌더를 맞춘다.
  const [lang, setLang] = useState("ko");
  // eslint-disable-next-line react-hooks/set-state-in-effect -- 하이드레이션 안전: 저장 언어를 마운트 후 반영
  useEffect(() => setLang(loadLang()), []);
  // (myBooks는 위 로그인 세션 확인 useEffect에서 Supabase로 불러온다.)
  // "우리 가족 책장" = 내가 만든 책(최신 먼저, 숨긴 건 제외).
  // 샘플 3권(sample-books.json)은 yogico 가 만든 데모라 yogico 책장에만 보인다 — 일반 회원도,
  // 다른 마스터(fe, 사장님 개인 개발 계정)도 안 보인다. 책 관리는 설정(⚙️) › "내 동화"에서 한다.
  const mine = [...myBooks, ...(demoShelf ? all.map(toShelfBook) : [])].filter(
    (b) => b.lang === lang && !b.hidden,
  );

  // 은은하게 움직이는 배경 영상(/themes/<id>/bg-video.mp4)이 있는 테마.
  // 파일을 넣고 여기 id만 추가하면 그 테마 홈이 살아 움직인다.
  const THEMES_WITH_BG_VIDEO = new Set([
    "space",
    "dino",
    "car",
    "princess",
    "ocean",
    "storybook",
    // 그림책나라. 예전엔 이 테마만 따로 그린 '액자' 안에서 영상을 틀어서 이 목록에
    // 없었는데, 액자를 없애 다른 테마와 같은 길로 오게 되면서 여기 들어와야 한다.
    "picturebook",
  ]);
  // 책장 탭 — 내가 만든 책 | 제공 서가(전래동화·세계명작, 빈 책장 해결사).
  // 제공 서가는 언어 필터를 안 탄다 — 서가 자체가 콘텐츠다.
  const [shelf, setShelf] = useState<"mine" | "folk" | "classic">("mine");
  // 한 줄에 몇 권 (넓은 화면에서만 — 폰은 화면 폭이 알아서 2권으로 맞춘다).
  const [shelfCols, setShelfCols] = useState(5);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage는 클라 전용
  useEffect(() => setShelfCols(loadShelfCols()), []);
  // 게스트는 "우리 가족 책장"이 로그인 안내라, 콘텐츠가 있는 서가를 먼저 보여준다.
  // 탭 순서가 우리 가족 → 세계명작 → 전래동화 가 되면서(사장님 지시) 기본도 세계명작.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 게스트 판별 후 기본 탭 전환
    if (guest) setShelf("classic");
  }, [guest]);
  // 공개 동화 단계(관리실) — 비회원과 요금제가 없는 회원은 무료 책만, 요금제를 지정한 회원은 그 요금제까지, 관리자는 전부.
  // (2026-10-20 — 예전엔 요금제 없는 회원도 결제 전이라 다 열려 있었는데, 웹 오픈 뒤 구글로 막 가입한 회원에게 책이 전부 보였다.)
  // 관리실 스위치가 꺼져 있거나 못 읽으면 지금처럼 다 열림.
  const [myPlan, setMyPlan] = useState<MemberPlanKey | null>(null);
  const [planReady, setPlanReady] = useState(false);
  useEffect(() => {
    if (!memberUid) return;
    let alive = true;
    void loadMyPlanKey(memberUid).then((p) => {
      if (!alive) return;
      setMyPlan(p);
      setPlanReady(true);
    });
    return () => {
      alive = false;
    };
  }, [memberUid]);
  const viewer = viewerTierOf(!guest, myPlan, master);
  // null = 아직 못 읽음 — 읽기 전에 책장을 열면 잠긴 책이 잠깐 보였다 사라진다(아래 준비 화면이 붙잡는다).
  const [libraryAccess, setLibraryAccess] = useState<LibraryAccess | null>(null);
  useEffect(() => {
    if (viewer === "pass") return;
    let alive = true;
    void loadLibraryAccess().then((a) => {
      if (alive) setLibraryAccess(a);
    });
    return () => {
      alive = false;
    };
  }, [viewer]);
  // 누가 보는지(요금제)와 자물쇠 값을 다 알았나 — 관리자·비회원은 요금제를 읽지 않는다. 두 값 모두 못 읽어도 기본값으로 끝난다.
  const shelfGateReady = (guest || master || planReady) && (viewer === "pass" || libraryAccess !== null);
  // 망이 느려 위 값이 한참 안 오면 준비 화면에 갇히지 않게 5초 뒤에는 연다(자물쇠를 못 읽었을 때처럼 다 열림).
  const [gateWaitOver, setGateWaitOver] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGateWaitOver(true), 5000);
    return () => clearTimeout(t);
  }, []);
  // hidden 책은 서가에서만 내린다 (주소로는 열림) — 다듬는 중인 책 보관용.
  // 회원 종류마다 고른 동화만 보인다(관리실 '공개 동화'에서 '책장에 적용'을 켰을 때 — 사장님 2026-10-02 "비회원일 때는
  // 5권씩만 보여주기"). 나머지는 서가에서 감추고, 책장 아래 한 줄로 더 있다는 것만 알린다. 내가 만든 책은 감추지 않는다.
  const canSee = (b: { id: string }) => !libraryLock(libraryAccess ?? OPEN_LIBRARY, b.id, viewer);
  const folkAll = asBooks(folkBooksJson).filter((b) => !b.hidden);
  const classicsAll = asBooks(classicBooksJson).filter((b) => !b.hidden);
  const folk = folkAll.filter(canSee);
  const classics = classicsAll.filter(canSee);
  const shown = shelf === "mine" ? mine : shelf === "folk" ? folk : classics;
  const moreBooks =
    shelf === "folk" ? folkAll.length - folk.length : shelf === "classic" ? classicsAll.length - classics.length : 0;

  // 준비 화면 — 로그인 확인과 책장 데이터(내 책 · 요금제 · 공개 동화 자물쇠)가 다 끝날 때까지 붙잡아 둔다.
  // 중간에 화면을 열면 빈 책장이 잠깐 보였다가 책이 채워지거나, 잠긴 책이 보였다 사라져 어수선하다(사장님 지적).
  // 캐시가 있으면 내 책 조건은 즉시 풀린다.
  if (authed === null || !booksLoaded || (!shelfGateReady && !gateWaitOver)) {
    return (
      <div className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={theme.background} alt="" className="fixed inset-0 -z-10 h-full w-full object-cover" />
        <div className="fixed inset-0 -z-10 bg-white/35" />
        <div className="flex flex-col items-center gap-4 rounded-[28px] bg-white/85 px-10 py-9 shadow-xl backdrop-blur">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={theme.mascot}
            alt=""
            className="h-20 w-20 animate-[float_1.5s_ease-in-out_infinite] rounded-full border-4 border-white object-cover shadow"
          />
          <p className="break-keep text-center text-sm font-extrabold text-neutral-500">
            {authed === null
              ? "로그인 정보를 확인하고 있어요…"
              : "우리 가족 책장을 불러오고 있어요…"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh w-full overflow-hidden">
      {/* 아이폰에서만, 한 번만 — 홈 화면에 추가하면 꽉 찬 화면으로 볼 수 있다는 안내. */}
      <AddToHomeHint />

      {/* 테마 배경 — 어떤 테마든 화면을 꽉 채운다.
          그림책나라는 한동안 중앙 1200px '액자' 안에만 영상을 두고 양옆을 크림빛으로
          감쌌는데, 넓은 화면에서 그 여백을 보고 화면이 덜 로드된 줄 아는 사람이
          많았다(사장님 확인). 아늑함보다 "고장 난 줄 안다"가 크다 — 꽉 채운다. */}
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
      {/* 원색 배경이 너무 세면 책 표지가 묻힌다 — 흰 베일로 채도를 한 김 뺀다.
          그림책나라는 예전에 중앙 액자 안에만 영상이 있어 아주 옅게(10%) 덮었는데,
          이제 화면을 꽉 채우므로 다른 테마와 같은 세기로 덮어야 표지가 안 묻힌다. */}
      <div className="fixed inset-0 -z-10 bg-white/25" />

      {/* 아래 여백: 폰은 버튼이 흐름 안에 있어 얕게, sm부터는 떠 있는 버튼 자리만큼. */}
      {/* max-w-7xl(80rem) — 책장 한 줄에 6권을 고르면 76.5rem이 필요한데, 예전
          6xl(72rem)에서는 폭이 모자라 6권을 골라도 5권으로 접혔다(설정이 안 먹는
          것처럼 보이던 원인 중 하나). 좁은 화면에서는 어차피 화면 폭이 먼저 걸린다. */}
      <main className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col justify-center px-6 pb-10 pt-6 sm:pb-32">
        {/* 좌상단 — 회원은 토큰 잔액(누르면 설정), 게스트는 로그인 버튼. */}
        {guest ? (
          <Link
            href="/login"
            className="fixed left-4 top-4 z-10 flex items-center gap-1 rounded-full bg-white/85 px-3.5 py-2 text-sm font-extrabold text-neutral-700 shadow backdrop-blur transition hover:bg-white"
          >
            로그인 / 회원가입
          </Link>
        ) : (
          <Link
            href="/settings"
            aria-label={master ? "관리자" : "내 토큰"}
            className="fixed left-4 top-4 z-10 flex items-center gap-1 rounded-full bg-white/85 px-3.5 py-2 text-sm font-extrabold text-neutral-700 shadow backdrop-blur transition hover:bg-white"
          >
            {master ? (
              "👑 관리자"
            ) : (
              <>
                <span
                  aria-hidden
                  className="inline-block rounded-full"
                  style={{
                    width: 14,
                    height: 14,
                    background: "radial-gradient(circle at 35% 30%, #ffe08a, #e0a020)",
                    boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,.5)",
                  }}
                />
                {tokens}
              </>
            )}
          </Link>
        )}

        {/* 베타 의견 쪽지 — 회원에게만. 불편한 걸 말할 곳이 없어 그냥 안 쓰게 되는 게
            베타에서 가장 아쉬운 일이라, 토큰(아이디) 옆에 늘 보이게 둔다. */}
        {!guest && (
          <Link
            href="/feedback"
            aria-label="베타 의견 남기기"
            className="fixed left-[7.5rem] top-4 z-10 flex items-center gap-1 rounded-full bg-white/85 px-3.5 py-2 text-sm font-extrabold text-neutral-700 shadow backdrop-blur transition hover:bg-white"
          >
            📝 <span className="hidden sm:inline">의견 남기기</span>
          </Link>
        )}

        {/* 설정(⚙️) — 회원은 전체 설정, 게스트는 스킨(나라)만 바꿀 수 있다. */}
        <Link
          href="/settings"
          aria-label="설정"
          className="fixed right-4 top-4 z-10 flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-white/80 shadow backdrop-blur transition hover:bg-white"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/func-gear.webp" alt="" className="h-9 w-9 object-contain" />
        </Link>

        {/* 사용 가이드 — 처음 온 부모가 만들기·듣기를 실제 화면 모양으로 따라 해 본다(2026-10-20 사장님 "페이지에 보이게").
            설정 단추 바로 왼쪽. 폰에서는 짧게 '가이드'(왼쪽 위 알약들과 겹치지 않게). */}
        <Link
          href="/guide"
          aria-label="사용 가이드"
          className="fixed right-[4.25rem] top-4 z-10 flex h-11 items-center gap-1 rounded-full bg-white/85 px-3.5 text-sm font-extrabold text-neutral-700 shadow backdrop-blur transition hover:bg-white"
        >
          📖 <span className="sm:hidden">가이드</span>
          <span className="hidden sm:inline">사용 가이드</span>
        </Link>

        {/* 회원은 제목만 두고 그 아래에 가족 액자를 건다 — 마스코트 큰 원·부제 알약 자리를
            액자가 이어받는다(마스코트는 액자 모서리로). 제목이 맨 위라 왼쪽 위 토큰·의견 알약,
            오른쪽 위 설정 버튼(고정, 높이 ~44px)과 겹치지 않게 위 여백(pt-10)을 준다.
            게스트는 그릴 수 없어 액자가 없으니 예전 모습 그대로. */}
        {/* 회원은 mb-1 — 가족 액자 안쪽 위 여백(pt-8, 마스코트 둥실 자리)이 제목과의 간격을 대신한다. */}
        <header
          className={`flex flex-col items-center text-center ${guest ? "mb-6" : "mb-1 pt-10"}`}
        >
          {/* 테마 마스코트 — 동그란 뱃지, 둥둥 떠서 아이를 반긴다 */}
          {guest && (
            <div className="animate-[float_3s_ease-in-out_infinite] drop-shadow-[0_10px_20px_rgba(0,0,0,0.2)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={theme.mascot}
                alt={theme.mascotName}
                className="h-28 w-28 rounded-full border-4 border-white object-cover sm:h-32 sm:w-32"
              />
            </div>
          )}
          {/* 흰 제목이 밝은 배경(그림책나라 크림 등)에 묻히지 않게, 어두운
              외곽선(text-stroke)+다층 그림자로 어느 테마에서든 윤곽이 뜨게 한다. */}
          <h1
            className={`${guest ? "mt-2" : ""} text-3xl font-extrabold tracking-tight text-white sm:text-4xl`}
            style={{
              textShadow:
                "0 2px 8px rgba(0,0,0,0.5), 0 0 6px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.45)",
              WebkitTextStroke: "0.6px rgba(60,40,25,0.4)",
            }}
          >
            우리 가족 보이스 동화
          </h1>
          {/* 밝은 하늘 배경 위라 흰 글자는 묻힌다 — 불투명 흰 알약 + 짙은 글자로 */}
          {guest && (
            <p className="mt-1.5 max-w-full break-keep rounded-2xl bg-white/95 px-4 py-1.5 text-center text-sm font-extrabold text-neutral-700 shadow-md sm:rounded-full">
              내가 주인공인 동화, {READ_ALOUD_VOICE}로 들어요
            </p>
          )}
        </header>

        {/* '○○이네 가족' 액자 — 회원에게만(게스트면 컴포넌트가 알아서 그리지 않는다).
            단체 사진엔 '홈 가족 사진에 보이기'를 켠 사람만, 키는 설정의 엄마·아빠 키 칩(parents)까지 본다. */}
        <FamilyFrame
          childName={child?.name ?? ""}
          childAge={child?.age ?? null}
          parents={child?.parents}
          childGender={child?.gender}
          family={child?.family}
          guest={guest}
          folded={child?.homeFamilyFolded ?? localFold}
          onFoldedChange={(f) => {
            // 아이디(계정)마다 이 기기에 바로 남긴다(아이 정보가 아직 없어도).
            writeLocalFold(f);
            setLocalFold(f);
            if (!child) {
              // 아이 정보가 아직 없다(막 가입 · 새 기기에서 계정 값이 오기 전). 여기서 아이 정보를 새로 만들면
              // 서버의 아이 이름을 빈 값으로 덮을 수 있어 만들지 않는다 — 계정 값이 오면 그때 올린다.
              pendingFold.current = f;
              return;
            }
            // 계정(서버)에도 — 다른 기기에서도 같은 아이디면 그대로 접혀/펼쳐 있다.
            saveChild({ name: child.name, homeFamilyFolded: f });
            setChild({ ...child, homeFamilyFolded: f });
          }}
          // 가족 사진관(배경·스티커) — 접힘처럼 계정마다. 꾸미기 버튼은 단체 사진이 있을 때만(=아이 정보가 있다).
          studio={child?.familyStudio}
          onStudioChange={(s) => {
            if (!child) return;
            pendingStudio.current = s;
            saveChild({ name: child.name, familyStudio: s });
            setChild((c) => (c ? { ...c, familyStudio: s } : c));
          }}
          outfitEnabled
          onMemberOutfit={saveMemberOutfit}
        />

        {/* 새 소식 — 회원에게만. 한 번 닫으면 작은 알약으로 접혀 아이 화면을 가리지 않는다. */}
        {!guest && <UpdateNotice />}

        {/*
          책 만들기 — 이 앱의 핵심 행동. 화면 크기에 따라 연출을 바꾼다.

          · 폰(세로, sm 미만): 떠 있는 버튼이 책장을 가리므로 제목 아래
            흐름 안의 큰 버튼으로 둔다.
          · 태블릿·PC(sm 이상): 화면 아래 고정 — 태블릿을 두 손으로 잡았을 때
            엄지가 닿는 자리. 화면이 낮으면(가로 폰 등) 한 단계 줄인다.
          · 아이콘은 나라별 배지(theme.art.create, 사장님 결정 2026-09-22). 대신 버튼
            자리·크기·모양은 나라가 바뀌어도 그대로 둔다 — 아이는 자리로 기억한다.
        */}
        <Link
          href={guest ? "/login" : "/create"}
          aria-label="우리 가족 동화 만들기"
          className="mx-auto mb-7 flex w-full max-w-sm items-center justify-center gap-2 rounded-full px-6 py-3.5 text-white transition-transform active:translate-y-0.5 sm:hidden"
          style={{
            background: theme.colors.accent,
            boxShadow: `0 6px 0 ${theme.colors.accentDark}, 0 10px 18px rgba(0,0,0,0.22)`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={theme.art.create} alt="" className="h-9 w-9 object-contain" />
          <span className="text-xl font-extrabold tracking-tight">
            {guest ? "로그인하고 만들기" : "동화 만들기"}
          </span>
        </Link>

        {/* 책장 탭 — 아이 책장이 비어 있어도 전래동화가 있어 첫 화면이 허전하지 않다.
            아이콘은 힉스필드 스티커(책더미·청사초롱·동화성) — 이모지 졸업. */}
        {/* 세그먼트 컨트롤 — 알약 3개가 따로 떠 있으면 폰에서 높이·간격이 들쭉나고
            선택 확대(scale) 때 옆 탭과 붙어 보였다. 한 통(흰 반투명) 안에 넣어 정돈:
            높이가 통일되고, 선택은 흰 배경+그림자로만 표시해 좁은 폰에서도 한 줄이다. */}
        <div className="mb-6 flex justify-center">
          <div className="flex max-w-full items-center gap-1 rounded-full bg-white/60 p-1 shadow-md backdrop-blur sm:gap-1.5 sm:p-1.5">
            {(
              [
                { key: "mine", label: "우리 가족 책장", icon: "/icons/tab-mine.webp" },
                { key: "classic", label: "세계명작", icon: "/icons/tab-classic.webp" },
                { key: "folk", label: "전래동화", icon: "/icons/tab-folk.webp" },
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
                  className={`flex items-center gap-1 whitespace-nowrap rounded-full py-1.5 pl-2 pr-2.5 text-xs font-extrabold transition sm:py-2 sm:pl-3 sm:pr-5 sm:text-base ${
                    active
                      ? "bg-white shadow-sm"
                      : // 흰 글자는 공주나라 같은 파스텔 배경에서 통째로 묻힌다 —
                        // 통 안 비선택 탭은 옅은 회색 글자, 호버에만 살짝 흰 배경.
                        "text-neutral-500 hover:bg-white/70"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={t.icon} alt="" className="h-5 w-5 object-contain sm:h-8 sm:w-8" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 빈 책장 — 서가마다 다음 행동을 알려준다 (만들기 유도 / 준비 중 안내). */}
        {/* 여기까지 왔으면 책장 데이터는 이미 준비돼 있다(위 준비 화면이 붙잡아 둔다).
            그래서 '불러오는 중' 카드는 두지 않는다 — 빈 책장은 진짜로 책이 없을 때만. */}
        {shown.length === 0 ? (
          <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-[28px] bg-white/85 px-8 py-10 text-center shadow-xl backdrop-blur">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={theme.mascot}
              alt=""
              className="h-20 w-20 rounded-full border-4 border-white object-cover shadow"
            />
            {shelf === "mine" && guest ? (
              <>
                <p className="text-lg font-extrabold text-neutral-700">로그인하면 나만의 동화를 만들어요</p>
                <p className="break-keep text-sm font-bold leading-relaxed text-neutral-400">
                  우리 아이가 주인공인 동화를 만들려면 로그인이 필요해요.
                  <br />
                  지금은{" "}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icons/tab-mine.webp" alt="" className="inline-block h-4 w-4 align-[-0.2em]" />{" "}
                  전래동화·세계명작을 둘러볼 수 있어요.
                </p>
                <Link
                  href="/login"
                  className="mt-1 rounded-full px-6 py-2.5 text-sm font-extrabold text-white"
                  style={{ background: theme.colors.accent }}
                >
                  로그인 / 회원가입
                </Link>
              </>
            ) : shelf === "mine" ? (
              <>
                <p className="text-lg font-extrabold text-neutral-700">아직 만든 동화가 없어요</p>
                <p className="break-keep text-sm font-bold leading-relaxed text-neutral-400">
                  우리 아이가 주인공인 첫 동화를 만들어 보세요!
                  <br />
                  기다리는 동안{" "}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icons/tab-mine.webp" alt="" className="inline-block h-4 w-4 align-[-0.2em]" />{" "}
                  전래동화도 들어볼 수 있어요.
                </p>
                <Link
                  href="/guide#make"
                  className="mt-1 inline-flex min-h-11 items-center px-2 text-sm font-extrabold text-neutral-600 underline underline-offset-2"
                >
                  처음이면 사용 가이드부터 보기 ›
                </Link>
              </>
            ) : (
              <>
                <p className="text-lg font-extrabold text-neutral-700">열심히 준비하고 있어요!</p>
                <p className="break-keep text-sm font-bold leading-relaxed text-neutral-400">
                  {shelf === "classic"
                    ? "신데렐라, 미운오리새끼 같은 세계명작 동화들이 곧 도착해요."
                    : "재미있는 이야기들이 곧 도착해요."}
                </p>
              </>
            )}
          </div>
        ) : (
          <>
            <Bookshelf books={shown} cols={shelfCols} />
            {moreBooks > 0 ? (
              <p className="mx-auto mt-8 w-fit max-w-full break-keep rounded-full bg-white/85 px-4 py-2 text-center text-sm font-extrabold text-neutral-700 shadow backdrop-blur">
                {shelf === "folk" ? "전래동화" : "세계명작"} {moreBooks}권을 더 들을 수 있어요 ·{" "}
                <Link href="/plans" className="underline underline-offset-2">
                  요금제 보기
                </Link>
              </p>
            ) : null}
          </>
        )}


        <Link
          href={guest ? "/login" : "/create"}
          aria-label="우리 가족 동화 만들기"
          className="fixed bottom-5 left-1/2 z-10 hidden -translate-x-1/2 items-center gap-3 rounded-full px-7 py-3.5 text-white transition-transform hover:-translate-y-0.5 hover:-translate-x-1/2 active:translate-y-0 active:-translate-x-1/2 animate-[float_2.4s_ease-in-out_infinite] sm:flex lg:px-8 lg:py-4 [@media(max-height:600px)]:px-4 [@media(max-height:600px)]:py-2"
          style={{
            background: theme.colors.accent,
            boxShadow: `0 8px 0 ${theme.colors.accentDark}, 0 14px 24px rgba(0,0,0,0.25)`,
          }}
        >
          {/* 아이콘은 나라별 배지(theme.art.create) — 자리·크기·모양은 그대로라 버튼 위치로 기억한다 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={theme.art.create}
            alt=""
            className="h-10 w-10 object-contain lg:h-12 lg:w-12 [@media(max-height:600px)]:h-7 [@media(max-height:600px)]:w-7"
          />
          <span className="text-xl font-extrabold tracking-tight lg:text-2xl [@media(max-height:600px)]:text-base">
            {guest ? "로그인하고 만들기" : "동화 만들기"}
          </span>
        </Link>
      </main>
      {/* 사이트 맨 아래 사업자 정보·약관 링크 — 전자상거래법 표시 사항. 결제사(KG) 심사도 첫 화면에서 본다(2026-10-19).
          아래 '동화 만들기' 둥근 단추(화면에 붙어 있음)에 가리지 않게 아래를 넉넉히 비운다. */}
      <div className="relative mx-auto w-full max-w-3xl px-6 pb-28 sm:pb-32">
        <SiteFooter compact />
      </div>
    </div>
  );
}
