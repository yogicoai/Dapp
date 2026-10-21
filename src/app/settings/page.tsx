"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { FLAGS } from "@/components/FlagFilter";
import { ThemePicker } from "@/components/ThemePicker";
import { useTheme } from "@/components/ThemeProvider";
import { VoiceGlyph } from "@/components/VoiceGlyph";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import {
  adultFoldChips,
  AdultLooksEditor,
  PARENT_ROLES,
  type ParentRole,
  type Parents,
} from "@/components/settings/AdultLooksEditor";
import { FamilyCharacterRow } from "@/components/settings/FamilyBits";
import { WithdrawSheet } from "@/components/settings/WithdrawSheet";
import { ScreenDiag } from "@/components/settings/ScreenDiag";
import type { FamilyMember } from "@/lib/family";
import { deleteBookConfirmText } from "@/lib/retention";
import {
  loadSession,
  logOut,
  refundTokens,
  spendTokensEntry,
  type SpendEntry,
} from "@/lib/auth";
import {
  AGES,
  AGE_OVER,
  loadStoryFont,
  saveStoryFont,
  STORY_FONTS,
  findStoryWeight,
  storyWeightForFont,
  loadStoryWeight,
  saveStoryWeight,
  STORY_WEIGHTS,
  deleteMyBook,
  loadChild,
  loadChildRemote,
  loadLang,
  loadMyBookBriefs,
  loadAutoNext,
  loadAutoNextRemote,
  loadBookLayout,
  loadShelfCols,
  saveShelfCols,
  SHELF_COLS,
  type ShelfCols,
  type ChildLooks,
  type ParentLooks,
  saveAutoNext,
  saveBookLayout,
  saveChild,
  saveLang,
  type BookLayout,
  setMyBookHidden,
  type BookBrief,
  type Gender,
} from "@/lib/prefs";
import { usePricing } from "@/lib/use-pricing";
import { loadDevMode } from "@/lib/dev-mode-client";
import { useEscClose } from "@/lib/use-esc-close";
import {
  PRESET_VOICES,
  NARRATOR_PRESETS,
  TYPECAST_VOICES,
  DEFAULT_VOICE_RATE,
  VOICE_RATES,
  applyPlaybackRate,
  buildPresetUtterance,
  deleteVoiceAudio,
  findTypecast,
  fetchTypecastVoiceAudio,
  loadCustomVoices,
  loadSelectedVoiceId,
  loadVoiceAudio,
  loadVoiceRate,
  saveCustomVoices,
  saveSelectedVoiceId,
  saveVoiceRate,
  type CustomVoice,
  type PresetVoice,
  type TypecastPreset,
} from "@/lib/voices";
import {
  approveParentVoice,
  cloneParentVoice,
  deleteParentVoice,
  loadPendingParentVoices,
  loadParentVoices,
  metaForRole,
  PARENT_VOICE_TEST_TEXT,
  roleFromLabel,
  type ParentVoice,
} from "@/lib/parent-voice";

/*
 * 아이·엄마·아빠 특징(생김새) — 회원은 '우리 가족 캐릭터'(/family) 생김새 고르기에서만 고른다(사장님 2026-09-28).
 * 예전엔 여기 '아이 특징'·'엄마·아빠 특징' 접는 칸이 따로 있었는데, 같은 값(ChildPrefs.looks·parents)을
 * 두 곳에서 고치니 헷갈려서 설정은 '우리 가족 캐릭터 ›' 한 줄로 가족 화면에 데려간다. 설정에 있던 것
 * (아이 10줄·안경·메모·엄마·아빠 어른 줄·메모·모두 지우기)은 가족 화면에 모두 있다(components/family/LooksView).
 * 비회원(게스트)은 가족 화면을 못 연다(로그인으로 보낸다) — 그래서 게스트에게는 예전 '엄마·아빠 특징' 칸을
 * 그대로 둔다(아이 특징 칸은 예전에도 회원에게만 보였다). 아래 FoldHeader 는 그 칸 머리글이다.
 */

type FoldChip = { text: string; icon?: string };

/**
 * 접었다 펴는 특징 칸의 머리글(게스트의 엄마·아빠 특징). 고른 것은 칩으로 보여 준다 — 한 줄에 다 안
 * 들어가면 넘치는 칩은 통째로 숨기고(반쪽 칩 없음) 옆에 전체 개수를 적는다.
 */
function FoldHeader({
  open,
  onToggle,
  colors,
  title,
  empty,
  chips,
  count,
  art,
}: {
  open: boolean;
  onToggle: () => void;
  colors: { accent: string; accentDark: string; accentSoft: string };
  title: string;
  empty: string;
  chips: FoldChip[];
  /** 'N개 골랐어요'의 N — 없으면 칩 수 */
  count?: number;
  art: ReactNode;
}) {
  const n = count ?? chips.length;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex items-center gap-3 rounded-3xl border-2 bg-white px-3 py-3 text-left shadow-sm transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300"
      style={{ borderColor: open ? colors.accent : "transparent" }}
    >
      <span
        aria-hidden
        className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
        style={{ background: colors.accentSoft }}
      >
        {art}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="text-[15px] font-extrabold text-neutral-800">{title}</span>
          {n > 0 ? (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-extrabold text-white"
              style={{ background: colors.accent }}
            >
              {n}개 골랐어요
            </span>
          ) : (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-400">
              선택
            </span>
          )}
        </span>
        {chips.length === 0 ? (
          <span className="mt-1 block truncate text-xs font-medium text-neutral-400">{empty}</span>
        ) : (
          <span className="mt-1.5 flex h-6 flex-wrap gap-1 overflow-hidden">
            {chips.map((c, i) => (
              <span
                key={`${i}-${c.text}`}
                className="flex h-6 shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full px-2 text-[11px] font-bold"
                style={{ background: colors.accentSoft, color: colors.accentDark }}
              >
                {c.icon && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.icon} alt="" className="h-4 w-4 object-contain" />
                )}
                {c.text}
              </span>
            ))}
          </span>
        )}
      </span>
      <span
        aria-hidden
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 8l5 5 5-5" />
        </svg>
      </span>
    </button>
  );
}

const GENDERS: { value: Gender; label: string; icon: string }[] = [
  { value: "girl", label: "여자", icon: "/icons/gender-girl.webp" },
  { value: "boy", label: "남자", icon: "/icons/gender-boy.webp" },
];

/**
 * 옵션(⚙️) — 부모가 만지는 화면.
 *
 * 아이 정보·나라(테마)·언어를 여기 모은다. 메인은 아이가 보는 화면이라
 * 컨트롤을 걷어내고, 바뀌는 값은 저장해서 만들기 위저드가 미리 채운다.
 * 모든 변경은 즉시 저장된다 (저장 버튼 없음 — 부모 조작을 최소로).
 */
export default function SettingsPage() {
  const router = useRouter();
  // 부모 목소리 값·1토큰 가격은 관리실 가격표에서 읽는다.
  const pricing = usePricing();
  const { theme } = useTheme();
  const { accent } = theme.colors;

  // 설정값은 서버 렌더 중 localStorage에서 읽지 않는다. 마운트 후 불러와야
  // 저장된 값이 있는 브라우저에서도 서버 HTML과 첫 클라이언트 렌더가 같다.
  const [name, setName] = useState("");
  const [age, setAge] = useState<number | null>(null);
  const [gender, setGender] = useState<Gender>("girl");
  /**
   * 아이 생김새(읽기만) — 회원은 가족 화면에서 고른다. 여기서는 '우리 가족 캐릭터' 줄이 '모습이 바뀐 사람'을
   * 알아보는 데만 쓴다(FamilyCharacterRow → showsLooksChanged). 설정은 이 값을 저장하지 않는다.
   */
  const [looks, setLooks] = useState<ChildLooks>({});
  /**
   * 부모가 아이 정보(이름·나이·성별)를 한 번이라도 만졌는지.
   * 서버에서 아이 정보를 되살리는 데 1~2초가 걸리는데, 그 사이 부모가 고치면
   * 뒤늦게 도착한 옛 값이 방금 고친 걸 덮어 "저장이 안 된다"로 보였다.
   */
  const childTouched = useRef(false);
  /** 이어서 틀기를 부모가 이미 눌렀나 — 같은 이유로, 뒤늦게 온 계정 값이 덮지 않게. */
  const autoNextTouched = useRef(false);
  /**
   * 엄마·아빠 생김새 — 회원에게는 읽기만(looks 와 같은 쓰임). 게스트는 예전 '엄마·아빠 특징' 칸에서 고친다
   * (안 알려 주면 모델이 안경·수염을 지어낸다 — 칩 목록은 look-options adultLookRows).
   */
  const [parents, setParents] = useState<Parents>({});
  const [parentsOpen, setParentsOpen] = useState(false);
  /**
   * 게스트 엄마·아빠 칸 저장에 쓰는 '가장 최근' 값. 화면 값(state)은 다음 렌더에야 바뀌어서, 칩을 빠르게 두 번
   * 누르거나 엄마 칸을 고친 직후 아빠 칸을 고치면 옛 값으로 저장해 방금 고른 것을 지울 수 있다.
   * 그래서 저장은 늘 이 ref 에서 읽고, 바꿀 때는 applyParents 로 둘 다 바꾼다.
   */
  const parentsRef = useRef<Parents>({});
  const applyParents = (next: Parents) => {
    parentsRef.current = next;
    setParents(next);
  };
  /**
   * 우리 가족 캐릭터(읽기만) — 얼굴 고정 여부·'모습이 바뀌었어요'를 보여 주는 데만 쓴다.
   * 설정은 가족 목록을 저장하지 않는다(persistChild 가 family 를 넘기지 않아 saveChild 가 그대로 둔다).
   */
  const [family, setFamily] = useState<FamilyMember[]>([]);
  /** 저장값을 불러올 때마다 +1 — 가로로 미는 칩 줄(게스트 엄마·아빠 칸)이 켜진 칩을 보이게 다시 밀어 둔다. */
  const [looksReveal, setLooksReveal] = useState(0);
  const [lang, setLang] = useState("ko");

  // 목소리 — 프리셋 선택 + 엄마·아빠 녹음 관리
  const [voiceId, setVoiceId] = useState("basic");
  const [voiceRate, setVoiceRate] = useState(DEFAULT_VOICE_RATE);
  // 책 보는 방식 — 가로에서 '꽉 찬 그림' / '펼침면(그림|글 반반)'.
  const [bookLayout, setBookLayout] = useState<BookLayout>("full");
  // 동화가 끝나면 — 묻기(기본) / 다음 동화 이어서 틀기.
  const [autoNext, setAutoNext] = useState(false);
  // 책장 한 줄 권수(넓은 화면 전용).
  const [shelfCols, setShelfCols] = useState<ShelfCols>(5);
  // 동화 본문 글꼴 — 고른 id만 들고 있는다(배율·줄 간격은 prefs의 목록이 안다).
  const [storyFont, setStoryFont] = useState("gothic");
  const [storyWeight, setStoryWeight] = useState("medium");
  const [fontPickerOpen, setFontPickerOpen] = useState(false);
  const selectedStoryFont = STORY_FONTS.find((f) => f.id === storyFont) ?? STORY_FONTS[0];
  const [customVoices, setCustomVoices] = useState<CustomVoice[]>([]);
  const [recording, setRecording] = useState<{ label: string; emoji: string } | null>(null);
  // 부모 목소리(복제됨) — 계정별로 Supabase에서 불러온다. cloningRole = 지금 복제 중인 역할.
  const [parentVoices, setParentVoices] = useState<ParentVoice[]>([]);
  const [pendingParentVoices, setPendingParentVoices] = useState<ParentVoice[]>([]);
  const [cloningRole, setCloningRole] = useState<string | null>(null);
  const [cloneErr, setCloneErr] = useState("");
  // 만들기 연타 방지 잠금 — state가 아닌 ref라 클릭 즉시 걸린다.
  const cloneBusyRef = useRef(false);
  // 내 동화 — 만든 책 전체. 여기서 책장 노출(숨기기/보이기)과 영구 삭제를 관리한다.
  // 목록에 쓰는 건 제목·숨김뿐이라 가벼운 형태로 받는다(본문·삽화 제외).
  const [myBooks, setMyBooks] = useState<BookBrief[]>([]);
  // 계정 — 로그인한 아이디·토큰. 게스트면 스킨(테마)만 보인다. 마스터면 관리자 페이지 링크도.
  const [guest, setGuest] = useState(false);
  const [acctId, setAcctId] = useState<string | null>(null);
  // 계정 uid — 녹음(customVoices) 계정별 저장 키에 쓴다.
  const [uid, setUid] = useState<string | null>(null);
  const [acctTokens, setAcctTokens] = useState(0);
  const [master, setMaster] = useState(false);

  // 개발자 모드(fe) — 부모 목소리 녹음·만들기 칸은 지금 fe 에게만 보인다(2026-09-28).
  const [devMode, setDevMode] = useState(false);
  useEffect(() => {
    let alive = true;
    loadDevMode().then((d) => {
      if (alive) setDevMode(d);
    });
    return () => {
      alive = false;
    };
  }, []);

  // 부모 목소리(복제됨) 목록을 계정에서 불러온다(로그인 안 됐으면 빈 목록).
  useEffect(() => {
    loadParentVoices().then(setParentVoices).catch(() => {});
    loadPendingParentVoices().then(setPendingParentVoices).catch(() => {});
  }, []);

  // 아이 정보·언어·목소리 등 '로컬 저장값'은 세션(네트워크)과 무관하게 즉시 반영한다.
  // 예전엔 이 로딩이 await loadSession() 뒤에 묶여 있어, 세션이 느리거나 실패하면
  // 아이 이름·나이가 잠깐 비고 그 사이 만지면 기본값으로 덮여 "가끔 초기화"됐다.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const stored = loadChild();
    if (stored) {
      setName(stored.name);
      setAge(stored.age);
      setGender(stored.gender);
      setLooks(stored.looks ?? {});
      // (applyParents 와 같은 일 — effect 의존성에 함수를 걸지 않으려고 풀어 적었다)
      parentsRef.current = stored.parents ?? {};
      setParents(parentsRef.current);
      setFamily(stored.family ?? []);
      setLooksReveal((n) => n + 1);
    }
    setLang(loadLang());
    setVoiceId(loadSelectedVoiceId());
    setVoiceRate(loadVoiceRate());
    setBookLayout(loadBookLayout());
    setAutoNext(loadAutoNext());
    setShelfCols(loadShelfCols());
    const savedFont = loadStoryFont();
    const savedWeight = loadStoryWeight();
    setStoryFont(savedFont.id);
    if (savedFont.weights.includes(savedWeight.value)) {
      setStoryWeight(savedWeight.id);
    } else {
      setStoryWeight("normal");
      saveStoryWeight("normal");
    }
    // (녹음 목록은 계정별 저장이라 세션 effect에서 uid를 안 뒤에 불러온다.)
  }, []);

  // 세션(로그인/게스트)·계정·책 등 네트워크가 필요한 것만 여기서 불러온다.
  useEffect(() => {
    let alive = true;
    (async () => {
      const s = await loadSession();
      if (!alive) return;
      // 로그인·게스트 둘 다 아니면 로그인 화면으로.
      if (!s.uid && !s.guest) {
        router.replace("/login");
        return;
      }
      // (아이 정보·언어·목소리 등 로컬값은 위의 동기 effect에서 세션과 무관하게 즉시 반영했다.)
      if (s.guest) {
        setGuest(true);
        return; // 게스트는 스킨만 — 아래 계정/책/회원 정보는 안 불러온다.
      }
      setAcctId(s.profile?.username ?? null);
      setAcctTokens(s.profile?.tokens ?? 0);
      // 녹음 목록은 계정(uid)별 저장 — 같은 기기의 다른 아이디 녹음이 안 보이게.
      setUid(s.uid ?? null);
      setCustomVoices(loadCustomVoices(s.uid ?? null));
      if (s.isMaster) setMaster(true);

      /*
       * 여기부터는 서로 기다릴 이유가 없는 조회들이다. 예전엔 한 줄씩 await로
       * 늘어놔서, 아이 정보 → 내 동화 → 회원 목록이 줄을 서느라 마스터 화면이
       * 특히 느렸다(회원 목록이 맨 뒤라 제일 늦게 떴다).
       * 이제 한꺼번에 띄우고 각자 끝나는 대로 화면에 올린다 — 하나가 느려도
       * 나머지는 그걸 기다리지 않는다.
       */

      // 계정에 저장된 아이 정보를 서버에서 되살린다 (로컬 캐시가 비어 있어도 복구).
      // 단, 이게 돌아오는 동안 부모가 이름·나이·성별을 이미 만졌다면 그 칸은 덮지 않는다 — 안 그러면
      // 방금 고친 것이 서버의 옛 값으로 되돌아가 "저장이 안 된다"가 된다.
      void loadChildRemote()
        .then((c) => {
          if (!alive || !c) return;
          // 가족(얼굴 고정)·생김새는 회원 설정이 고치지 않는 값이라 늘 들인다 — 다른 기기·가족 화면에서
          // 고정한 얼굴·고른 특징도 '우리 가족 캐릭터' 줄(모습이 바뀐 사람)에 맞게 보이게.
          setFamily(c.family ?? []);
          setLooks(c.looks ?? {});
          parentsRef.current = c.parents ?? {};
          setParents(parentsRef.current);
          setLooksReveal((n) => n + 1);
          if (childTouched.current) return;
          setName(c.name);
          setAge(c.age);
          setGender(c.gender);
        })
        .catch(() => {});

      // 이어서 틀기도 계정 값으로 맞춘다 — 기기를 바꿔 들어와도 켜 둔 대로 보이게.
      // 돌아오는 사이에 부모가 이미 눌렀다면 덮지 않는다(아이 정보와 같은 규칙).
      void loadAutoNextRemote()
        .then((on) => {
          if (!alive || on === null || autoNextTouched.current) return;
          setAutoNext(on);
        })
        .catch(() => {});

      void loadMyBookBriefs()
        .then((b) => alive && setMyBooks(b))
        .catch(() => {});
    })();
    return () => {
      alive = false;
    };
  }, [router]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /*
   * 충전 — 예전엔 여기 잠긴 '충전' 단추가 마스터 지급 함수를 불렀다. 그 길은 없앴다(그대로 열면 마스터가
   * 자기에게 진짜 지급 기록을 만든다). 이제 '요금제' 단추는 /plans 로 가는 링크일 뿐이다.
   * 결제를 붙일 때는 결제 확인 뒤 서버가 넣어 주는 방식이어야 한다(pay-demo.guard.test 가 되돌림을 막는다).
   */
  // 로그아웃 → 로그인 화면.
  async function doLogout() {
    await logOut();
    router.replace("/login");
  }

  // 회원 탈퇴 시트(components/settings/WithdrawSheet) — 끝나면 계정이 없어지므로 로그인 화면으로(탈퇴했다는 한 줄과 함께).
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  // 책장 노출 토글(숨기기/보이기) — 숨기면 책장에서 내려가고, 보이면 다시 뜬다.
  async function toggleHide(id: string, hidden: boolean) {
    await setMyBookHidden(id, hidden);
    setMyBooks((prev) => prev.map((b) => (b.id === id ? { ...b, hidden } : b)));
    flashSaved();
  }

  // 삭제 — 책장에서 바로 내려가고, DB 가 90일 보관함에 담았다가 지운다(lib/retention · supabase-withdrawal.sql).
  async function purgeBook(id: string, title: string) {
    if (!window.confirm(deleteBookConfirmText(title))) return;
    await deleteMyBook(id);
    setMyBooks((prev) => prev.filter((b) => b.id !== id));
    flashSaved();
  }

  // ESC로 설정을 닫는다(홈으로). 녹음 팝업이 열려 있으면 팝업이 먼저 닫히고,
  // 한 번 더 누르면 설정이 닫힌다.
  useEscClose(() => router.push("/"), !recording);

  // 저장 버튼이 없는 대신, 바뀔 때마다 "저장됐어요"를 잠깐 보여줘 안심시킨다.
  const [savedTick, setSavedTick] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashSaved = () => {
    setSavedTick(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedTick(false), 1500);
  };
  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current);
  }, []);

  // 나라(테마) 변경은 ThemePicker 안에서 저장된다 — 바뀐 것만 감지해 표시한다.
  const firstTheme = useRef(true);
  useEffect(() => {
    if (firstTheme.current) {
      firstTheme.current = false;
      return;
    }
    flashSaved();
  }, [theme.id]);

  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  /** 미리듣기를 멈춘다 (TTS·오디오 둘 다). */
  const stopPreview = () => {
    window.speechSynthesis?.cancel();
    previewAudioRef.current?.pause();
  };

  /** 칩을 누르면 선택 + 그 목소리로 인사말이 바로 들린다. */
  const pickVoice = (id: string, preset?: PresetVoice) => {
    setVoiceId(id);
    saveSelectedVoiceId(id);
    flashSaved();
    stopPreview();
    if (preset && "speechSynthesis" in window) {
      // 책 읽어주기와 같은 로직(음성 배정·높낮이·속도 과장) — 미리 들은 대로 읽힌다.
      window.speechSynthesis.speak(buildPresetUtterance(preset.sample, preset, voiceRate));
    }
  };

  // 성우 칩 — 누르면 선택 + 인사말을 그 성우 목소리로 받아 들려준다.
  // 같은 인사말은 기기에 캐시되므로 크레딧은 처음 한 번만 나간다.
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const pickTypecast = (tc: TypecastPreset) => {
    setVoiceId(tc.id);
    saveSelectedVoiceId(tc.id);
    flashSaved();
    stopPreview();
    setTtsError(null);
    // 미리듣기는 '미리 구운 샘플 파일'만 재생한다 → 크레딧 0. 실시간 합성은 안 한다.
    // 아직 샘플이 없는 성우는 소리 없이 선택만 된다(크레딧 안 씀).
    const el = previewAudioRef.current ?? new Audio();
    previewAudioRef.current = el;
    el.src = `/casting/preview-${tc.id}.mp3`;
    applyPlaybackRate(el, voiceRate); // 속도가 음높이를 바꾸지 않게
    setPreviewingId(tc.id);
    el.onended = () => setPreviewingId(null);
    el.onerror = () => setPreviewingId(null); // 샘플 파일 없음 — 조용히 넘긴다
    el.play().catch(() => setPreviewingId(null));
  };

  /** 읽기 속도 — 고르면 지금 목소리로 그 속도를 바로 들려준다. */
  const pickRate = (rate: number) => {
    setVoiceRate(rate);
    saveVoiceRate(rate);
    flashSaved();
    stopPreview();
    // 성우를 골라둔 상태면 그 성우 목소리로 들려준다 — 인사말은 캐시라 무료다.
    const tc = findTypecast(voiceId);
    if (tc) {
      // 속도 미리듣기도 구운 샘플 파일로만 — 크레딧 0.
      const el = previewAudioRef.current ?? new Audio();
      previewAudioRef.current = el;
      el.src = `/casting/preview-${tc.id}.mp3`;
      applyPlaybackRate(el, rate);
      setPreviewingId(tc.id);
      el.onended = () => setPreviewingId(null);
      el.onerror = () => setPreviewingId(null);
      el.play().catch(() => setPreviewingId(null));
      return;
    }
    const preset = PRESET_VOICES.find((v) => v.id === voiceId) ?? PRESET_VOICES[0];
    if ("speechSynthesis" in window) {
      window.speechSynthesis.speak(buildPresetUtterance(preset.sample, preset, rate));
    }
  };

  /** 엄마·아빠 칩 — 녹음해둔 실제 목소리가 재생된다. */
  const previewCustom = async (v: CustomVoice) => {
    stopPreview();
    const blob = await loadVoiceAudio(v.id).catch(() => null);
    if (!blob) return;
    const el = previewAudioRef.current ?? new Audio();
    previewAudioRef.current = el;
    el.src = URL.createObjectURL(blob);
    applyPlaybackRate(el, voiceRate);
    el.play().catch(() => {});
  };

  const auditionParentVoice = async (voice: ParentVoice) => {
    stopPreview();
    setCloneErr("");
    try {
      const blob = await fetchTypecastVoiceAudio(voice.voiceId, PARENT_VOICE_TEST_TEXT);
      const el = previewAudioRef.current ?? new Audio();
      previewAudioRef.current = el;
      el.src = URL.createObjectURL(blob);
      applyPlaybackRate(el, 1);
      await el.play();
    } catch (error) {
      setCloneErr(error instanceof Error ? error.message : "확인용 음성을 재생하지 못했어요.");
    }
  };

  const acceptParentVoice = async (voice: ParentVoice) => {
    setCloneErr("");
    try {
      await approveParentVoice(voice.role, voice.voiceId);
      setPendingParentVoices((items) => items.filter((item) => item.role !== voice.role));
      setParentVoices(await loadParentVoices());
      flashSaved();
    } catch (error) {
      setCloneErr(error instanceof Error ? error.message : "목소리를 승인하지 못했어요.");
    }
  };

  /**
   * 마음에 안 들어 다시 녹음하러 간다.
   *
   * 복제를 여기서 미리 지우지 않는다 — 지워 놓고 다음 복제가 실패하면 아무것도 없이
   * 남는다. 옛 복제는 새 목소리가 만들어진 뒤에 cloneParentVoice가 알아서 지운다.
   */
  const retryParentVoice = (voice: ParentVoice) => {
    setCloneErr("");
    setRecording({ label: voice.label, emoji: voice.emoji });
  };

  /** 이 녹음(엄마/아빠)이 이미 복제(목소리 만들기)됐는지. */
  const isCloned = (v: CustomVoice) => parentVoices.some((p) => p.role === roleFromLabel(v.label));
  const isPending = (v: CustomVoice) => pendingParentVoices.some((p) => p.role === roleFromLabel(v.label));

  /**
   * 녹음 → 복제(목소리 만들기). 성공하면 계정에 저장되고 동화에서 그 목소리로 읽을 수 있다.
   * 만들기 1회 = 가격표의 cost_parent_voice 토큰(실측 원가 기반, 마스터 면제).
   * 과금은 '선차감 → 복제 실패 시 환불' — 차감이 서버 잔액 기준이라(다른 탭에서 잔액이
   * 바뀌어도) 무과금 복제가 생기지 않고, 복제가 실패하면 토큰이 돌아온다.
   */
  /**
   * 이미 만든 목소리를 이 녹음으로 다시 만든다.
   * 확인은 반드시 토큰이 빠지기 전에 받는다(makeParentVoice가 바로 선차감한다).
   */
  const remakeParentVoice = async (v: CustomVoice) => {
    if (
      !master &&
      !window.confirm(
        `${v.label} 목소리를 다시 만들까요?\n\n토큰 ${pricing.cost_parent_voice}개가 나가고, 지금 목소리는 새 목소리로 바뀌어요.`,
      )
    ) {
      return;
    }
    await makeParentVoice(v);
  };

  const makeParentVoice = async (v: CustomVoice) => {
    // 연타 방지 — state(cloningRole)는 재렌더 전까지 버튼을 못 잠그므로 ref로 즉시 잠근다.
    if (cloneBusyRef.current) return;
    cloneBusyRef.current = true;
    setCloneErr("");
    setCloningRole(roleFromLabel(v.label));
    let entry: SpendEntry = null;
    let charged = false;
    try {
      const blob = await loadVoiceAudio(v.id);
      if (!blob) throw new Error("녹음을 찾지 못했어요. 다시 녹음해 주세요.");
      // 선차감 — 서버 잔액 기준. 부족하면 여기서 끝(복제 호출 자체를 안 한다).
      if (!master) {
        const res = await spendTokensEntry(pricing.cost_parent_voice, "parent-voice");
        if (!res.ok) {
          throw new Error(
            `${res.error} 목소리 만들기에는 ${pricing.cost_parent_voice}토큰이 필요해요.`,
          );
        }
        entry = res.entry;
        charged = true;
        setAcctTokens((t) => Math.max(0, t - pricing.cost_parent_voice));
      }
      const role = roleFromLabel(v.label);
      const voiceId = await cloneParentVoice(role, v.label, blob);
      const pending = { role, voiceId, ...metaForRole(role) };
      setPendingParentVoices(await loadPendingParentVoices());
      // 다시 만든 경우 옛 목소리가 '완성'에서 내려가므로 이 목록도 새로 읽는다.
      setParentVoices(await loadParentVoices());
      await auditionParentVoice(pending);
      flashSaved();
    } catch (e) {
      // 복제 실패 — 선차감했던 토큰을 돌려준다.
      if (charged) {
        // 쓴 그 건만 되돌린다 — 장부 id 로만 환불되므로 반복해서 찍어낼 수 없다.
        await refundTokens(entry, pricing.cost_parent_voice).catch(() => {});
        setAcctTokens((t) => t + pricing.cost_parent_voice);
      }
      setCloneErr(e instanceof Error ? e.message : "목소리 만들기에 실패했어요.");
    } finally {
      cloneBusyRef.current = false;
      setCloningRole(null);
    }
  };

  const removeCustom = async (v: CustomVoice) => {
    // 복제까지 된 목소리면 서버에서도 함께 삭제된다는 걸 확인받는다.
    if (isCloned(v)) {
      const warn = `${v.label} 목소리를 지울까요?\n\n서버에서도 완전히 삭제되지만, 토큰을 사용해 다시 만들 수 있어요.`;
      if (!window.confirm(warn)) return;
    }
    await deleteVoiceAudio(v.id).catch(() => {});
    // 복제된 목소리도 함께 삭제한다 — 우리 DB + Typecast 서버 양쪽에서(개인정보 미보존).
    await deleteParentVoice(roleFromLabel(v.label)).catch(() => {});
    setParentVoices((prev) => prev.filter((p) => p.role !== roleFromLabel(v.label)));
    const next = customVoices.filter((x) => x.id !== v.id);
    setCustomVoices(next);
    saveCustomVoices(next, uid);
    flashSaved();
    if (voiceId === v.id) pickVoice("basic");
  };

  /** 이 기기에 녹음이 없는(다른 기기에서 만든) 완성 목소리 삭제 — 계정·Typecast 서버에서 제거. */
  const removeParentOnly = async (p: ParentVoice) => {
    const warn = `${p.label} 목소리를 지울까요?\n\n서버에서도 완전히 삭제되지만, 토큰을 사용해 다시 만들 수 있어요.`;
    if (!window.confirm(warn)) return;
    await deleteParentVoice(p.role).catch(() => {});
    setParentVoices((prev) => prev.filter((x) => x.role !== p.role));
    flashSaved();
  };

  /**
   * 아이 정보 저장 — 이름·나이·성별은 **늘 다 넘긴다**(넘기지 않은 칸은 지금 값).
   * 생김새(아이 looks·엄마·아빠 parents)는 회원이면 넘기지 않는다 — 가족 화면에서 고르는 값이라, 여기서 들고 있던
   * 옛 값을 넘기면 가족 화면(다른 탭 포함)에서 방금 고른 특징을 되돌린다. saveChild 는 넘기지 않은 칸을 저장된
   * 값 그대로 둔다. 게스트의 엄마·아빠 칸만 parents 를 명시해서 넘긴다(setParent·clearParent — ref 의 가장 최근 값).
   * 가족 목록(family)·홈 액자 접힘(homeFamilyFolded)도 넘기지 않는다 — 설정에서 무엇을 바꿔도 가족 그림·접힘이
   * 지워지지 않는다.
   */
  const persistChild = (next: { name?: string; age?: number | null; gender?: Gender; parents?: Parents }) => {
    // 부모가 손을 댄 순간부터는 뒤늦게 도착하는 서버 값이 이걸 덮지 못하게 한다.
    childTouched.current = true;
    saveChild({
      name: next.name ?? name,
      age: next.age !== undefined ? next.age : age,
      gender: next.gender ?? gender,
      ...(next.parents !== undefined ? { parents: next.parents } : {}),
    });
    flashSaved();
  };

  /**
   * (게스트) 엄마·아빠 특징 한 항목 바꾸기 — 같은 걸 다시 누르면 해제된다. 다른 쪽 부모와 이 사람의 다른 칸은
   * 그대로 둔다. 빈 칸(undefined·빈 목록)은 지워서 저장값을 깔끔하게 둔다(불러올 때도 빈 칸은 버린다).
   */
  const setParent = (role: ParentRole, patch: Partial<ParentLooks>) => {
    const cur = parentsRef.current;
    const person: ParentLooks = { ...(cur[role] ?? {}), ...patch };
    for (const k of Object.keys(person) as (keyof ParentLooks)[]) {
      const v = person[k];
      if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) delete person[k];
    }
    const merged: Parents = { ...cur };
    if (Object.keys(person).length > 0) merged[role] = person;
    else delete merged[role];
    applyParents(merged);
    persistChild({ parents: merged });
  };

  /** (게스트) 엄마(또는 아빠) 특징 모두 지우기 — 그 사람 칸만. 다른 쪽 부모는 그대로. */
  const clearParent = (role: ParentRole) => {
    const label = role === "mom" ? "엄마" : "아빠";
    if (!window.confirm(`${label} 특징을 모두 지울까요?`)) return;
    const merged: Parents = { ...parentsRef.current };
    delete merged[role];
    applyParents(merged);
    persistChild({ parents: merged });
  };

  /*
   * 가족 캐릭터와 잇기(사장님 2026-09-28 6번) — '우리 가족 캐릭터' 줄이 고정한 얼굴과 '모습이 바뀐 사람'을
   * 보인다. '모습이 바뀌었어요'는 고정할 때 적어 둔 '늘 그대로'(portrait.lockKey)와 지금 생김새를 견준다
   * (lib/family showsLooksChanged — 옷·메모만 바꾸면 안 뜨고, 확인 전 새 그림이 있으면 모아 보기처럼 묻지 않는다).
   */
  const lookSource = { looks, parents };
  // 게스트 엄마·아빠 칸 머리글 칩
  const parentFold = adultFoldChips(parents);

  return (
    <div className="relative min-h-dvh w-full overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={theme.background}
        alt=""
        className="fixed inset-0 -z-10 h-full w-full object-cover"
      />
      <div className="fixed inset-0 -z-10 bg-white/30" />

      <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-6 pb-10 pt-20">
        <Link
          href="/"
          className="absolute left-4 top-4 rounded-full bg-white/70 px-4 py-2 text-sm font-bold text-neutral-700 backdrop-blur"
          // 앱 안 — 세로 폰에서 카메라 구멍 자리(안전 영역)만큼 아래로(가로는 body 좌우 여백이 이미 비킨다, 2026-10-21 점검)
          style={{ marginTop: "env(safe-area-inset-top, 0px)" }}
        >
          ← 돌아가기
        </Link>

        {/* 설정 항목이 많아 화면보다 길어질 수 있다 — 카드에 최대 높이를 주고
            안에서 스크롤되게 해 위아래가 짤리지 않게 한다. */}
        <div className="flex max-h-[calc(100dvh-7rem)] flex-col gap-5 overflow-y-auto rounded-[28px] bg-white/90 p-7 shadow-xl backdrop-blur">
          <h1 className="text-center text-2xl font-extrabold text-neutral-800">⚙️ 설정</h1>
          {/* 저장 버튼이 없는 이유를 화면이 직접 말해준다 + 바뀔 때마다 확인 표시 */}
          <p className="-mt-4 text-center text-xs font-bold" aria-live="polite">
            {savedTick ? (
              <span className="text-emerald-600">✓ 저장됐어요</span>
            ) : (
              <span className="text-neutral-400">바꾸는 대로 자동 저장돼요</span>
            )}
          </p>

          {guest && (
            <p className="rounded-2xl bg-neutral-100 px-4 py-3 text-center text-xs font-bold text-neutral-500">
              비회원은 <b>스킨(나라)</b>만 바꿀 수 있어요. 로그인하면 아이 정보·목소리·내 동화까지 설정할 수 있어요.
              <br />
              {/* 로그인 전에도 가격을 볼 수 있게 — /plans 는 누구나 연다 */}
              <Link href="/plans" className="mt-1 inline-flex min-h-11 items-center px-2 font-extrabold text-neutral-700 underline underline-offset-2">
                요금제 보기 ›
              </Link>
            </p>
          )}

          {/* 사용 가이드 — 비회원·회원 모두. 만들기·듣기를 실제 화면 모양으로 따라 해 본다(2026-10-20). */}
          <Link
            href="/guide"
            className="-mt-1 flex min-h-12 items-center justify-between gap-1 rounded-2xl bg-neutral-50 px-4 text-sm font-extrabold text-neutral-700 shadow-[inset_0_0_0_1px_#f0ede8]"
          >
            <span>📖 처음이세요? 사용 가이드</span>
            <span aria-hidden>›</span>
          </Link>

          {/* 계정·아이정보 등 회원 전용 설정 — 게스트에겐 숨긴다(스킨만 허용). */}
          {!guest && (<>
          {/* ── 계정 (베타) ── 로그인한 아이디·토큰·로그아웃. 실제 로그인 상태를 반영한다.
              추후 카카오·네이버 로그인이 붙으면 이 섹션에 연동 계정 표시가 더해진다. */}
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-extrabold text-neutral-400">계정</h2>
            {/* flex-wrap+basis — 좁은 폰(360px)에서 버튼들이 둘째 줄로 내려가고 아이디는 항상 보인다. */}
            <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-neutral-100 px-4 py-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-lg shadow-sm">
                {master ? "👑" : "🙂"}
              </span>
              {/* min-w-36 — min-w-0면 좁은 폰에서 버튼들에 밀려 폭 0까지 눌리며 글자가
                  세로로 쌓인다(376px 실측). 최소 폭을 지키면 버튼이 둘째 줄로 내려간다. */}
              <div className="min-w-36 flex-1 basis-36">
                <p className="truncate text-base font-extrabold text-neutral-800">
                  {acctId ?? "…"} {master && <span className="text-amber-600">· 마스터</span>}
                </p>
                <p className="break-keep text-xs font-bold text-neutral-500">
                  {master ? (
                    <span className="text-amber-600">👑 관리자 · 토큰 무제한</span>
                  ) : (
                    <>
                      <span aria-hidden className="mr-0.5 inline-block rounded-full align-[-0.1em]" style={{ width: 13, height: 13, background: "radial-gradient(circle at 35% 30%, #ffe08a, #e0a020)" }} />
                      토큰 {acctTokens}개 <span className="text-neutral-400">(1개 ≈ ₩{pricing.token_price_krw})</span>
                    </>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={doLogout}
                className="shrink-0 whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-xs font-extrabold text-neutral-600 shadow-sm"
              >
                로그아웃
              </button>
            </div>
            {/* 요금제(/plans)·내 결제·구독(/billing) — 마스터에게도 보인다(사장님이 fe 로 시연). 누르기 쉽게 48px 줄. */}
            <div className="grid grid-cols-2 gap-2">
              <Link
                href="/plans"
                className="flex min-h-12 items-center justify-between gap-1 rounded-2xl px-4 text-sm font-extrabold text-white shadow-sm"
                style={{ background: theme.colors.accentDark }}
              >
                <span>요금제</span>
                <span aria-hidden>›</span>
              </Link>
              <Link
                href="/billing"
                className="flex min-h-12 items-center justify-between gap-1 rounded-2xl bg-neutral-50 px-4 text-sm font-extrabold text-neutral-700 shadow-[inset_0_0_0_1px_#f0ede8]"
              >
                <span className="whitespace-nowrap">내 결제·구독</span>
                <span aria-hidden>›</span>
              </Link>
            </div>
            <p className="-mt-1 text-[11px] font-medium text-neutral-500">
              결제는 곧 열려요. &apos;요금제&apos;에서 가족 패스를 미리 볼 수 있어요.
            </p>
          </section>

          {/* ── 아이 정보 ── */}
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-extrabold text-neutral-400">아이 정보</h2>

            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                persistChild({ name: e.target.value });
              }}
              maxLength={20}
              placeholder="아이 이름"
              className="w-full rounded-2xl border-2 border-neutral-200 px-4 py-3 text-lg font-bold outline-none focus:border-neutral-400"
            />

            <div className="flex flex-wrap gap-2">
              {AGES.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => {
                    setAge(a);
                    persistChild({ age: a });
                  }}
                  style={age === a ? { background: accent } : undefined}
                  className={`h-11 w-11 rounded-full text-base font-extrabold transition ${
                    age === a
                      ? "scale-110 text-white shadow"
                      : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                  }`}
                >
                  {a}
                </button>
              ))}
              {/* 8세 위로는 한 살 단위로 나눌 만큼 글 수준이 달라지지 않아 하나로 묶는다. */}
              <button
                type="button"
                onClick={() => {
                  setAge(AGE_OVER);
                  persistChild({ age: AGE_OVER });
                }}
                style={age === AGE_OVER ? { background: accent } : undefined}
                className={`h-11 rounded-full px-3.5 text-sm font-extrabold transition ${
                  age === AGE_OVER
                    ? "scale-105 text-white shadow"
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                }`}
              >
                8세 이상
              </button>
            </div>

            <div className="flex gap-2">
              {GENDERS.map((g) => (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => {
                    setGender(g.value);
                    persistChild({ gender: g.value });
                  }}
                  style={gender === g.value ? { background: accent } : undefined}
                  className={`flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2.5 font-bold transition ${
                    gender === g.value
                      ? "text-white shadow"
                      : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                  }`}
                >
                  <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={g.icon} alt="" className="h-8 w-8 object-contain" />
                  </span>
                  <span className="text-xs">{g.label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* ── 우리 가족 캐릭터 › ── 가족 화면으로 가는 길이자 아이·엄마·아빠 특징을 고르는 유일한 입구
              (사장님 2026-09-28 — 예전 '아이 특징'·'엄마·아빠 특징' 접는 칸을 걷고 이 한 줄로 모았다).
              고정한 얼굴을 겹쳐 보여 준다. 회원 전용(이 묶음 안). */}
          <FamilyCharacterRow
            family={family}
            child={lookSource}
            childGender={gender}
            colors={theme.colors}
          />
          </>)}

          {/* ── 엄마·아빠 특징 (비회원만) ──
              안 알려 주면 이야기 모델이 지어낸다 — 실제로 안경을 안 쓰는 아빠가
              6쪽 내내 안경잡이로 그려졌다. 칩 원본은 look-options adultLookRows('늘 그대로'·'평소 옷' 두 묶음).
              회원은 '우리 가족 캐릭터'에서 고르므로 이 칸은 가족 화면을 못 여는 게스트에게만 예전 그대로 둔다. */}
          {guest && (
          <section className="flex flex-col gap-2">
            <FoldHeader
              open={parentsOpen}
              onToggle={() => setParentsOpen((v) => !v)}
              colors={theme.colors}
              title="엄마·아빠 특징"
              empty="동화에 엄마·아빠가 나올 때 그대로 그려져요"
              chips={parentFold.chips}
              count={parentFold.count}
              art={
                <span className="flex items-end">
                  {PARENT_ROLES.map((x, i) => (
                    <VoiceGlyph
                      key={x.role}
                      voice={{ role: x.role }}
                      className={`h-9 w-9 ${i === 0 ? "-mr-2.5" : ""}`}
                    />
                  ))}
                </span>
              }
            />

            <div
              inert={!parentsOpen}
              className={`grid grid-cols-1 transition-[grid-template-rows,opacity] duration-300 ${parentsOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
            >
              <div className="overflow-hidden">
                <AdultLooksEditor
                  colors={theme.colors}
                  parents={parents}
                  reveal={looksReveal}
                  onPatch={setParent}
                  onClear={clearParent}
                />
              </div>
            </div>
          </section>
          )}

          {/* ── 나라(테마) ── 게스트도 바꿀 수 있는 유일한 설정(스킨). */}
          <section className="flex flex-col gap-2.5">
            <h2 className="text-sm font-extrabold text-neutral-400">나라 고르기</h2>
            <ThemePicker />
          </section>

          {/* 아래는 전부 회원 전용 — 게스트에겐 숨긴다. */}
          {!guest && (<>
          {/* ── 목소리 (성우 전용) ── */}
          <section className="flex flex-col gap-2.5">
            <h2 className="text-sm font-extrabold text-neutral-400">읽어주는 목소리</h2>

            {/* 성우 목소리 (Typecast) 16명 전체 — 여기는 '시청 코너'다: 누르면 미리 구운
                샘플 파일만 재생되므로(pickTypecast) 아무리 눌러도 크레딧 0. 동화 낭독에
                쓰이는 성우는 만들 때 고른 1명+부끄뿐이라 비용 문은 뷰어 쪽에서 잠겨 있다. */}
            <p className="text-[11px] font-medium text-neutral-400">
              눌러서 들어보고 마음에 드는 성우를 골라요 (들어보기는 무료) · 동화별 성우는 만들 때 골라요
            </p>
            <div className="flex flex-wrap gap-2">
              {/* 나레이션용 16명만 — 배역용 성우(늑대·도깨비…)는 여기 보이지 않는다(사장님 지시, 2026-08-28). */}
              {NARRATOR_PRESETS.map((v) => {
                const active = voiceId === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => pickTypecast(v)}
                    aria-pressed={active}
                    title={v.desc}
                    style={active ? { background: accent } : undefined}
                    className={`flex items-center gap-1.5 rounded-full py-1.5 pl-1.5 pr-3.5 text-sm font-bold transition ${
                      active ? "text-white shadow" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                    }`}
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-base leading-none">
                      {previewingId === v.id ? "⏳" : <VoiceGlyph voice={v} className="h-full w-full" />}
                    </span>
                    {v.label}
                  </button>
                );
              })}
            </div>
            {ttsError && <p className="text-[11px] font-bold text-rose-500">{ttsError}</p>}
            {cloneErr && <p className="text-[11px] font-bold text-rose-500">{cloneErr}</p>}

            {/* 부모 목소리(확인·녹음·만들기)는 개발자 모드(fe)에서만 — 서버(api/voice/clone·tts)도 막는다. */}
            {devMode && (<>
            {pendingParentVoices.map((voice) => (
              <div key={`review-${voice.role}`} className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="flex items-center gap-1.5 text-sm font-black text-amber-900">
                  <VoiceGlyph voice={voice} className="h-7 w-7" />
                  {voice.label} 목소리를 확인해 주세요
                </p>
                <p className="mt-1 text-xs font-medium leading-relaxed text-amber-800">
                  녹음 원본이 아니라 실제로 합성된 목소리입니다. 들어 본 뒤 승인해야 동화에서 선택할 수 있어요.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => auditionParentVoice(voice)} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-amber-800 shadow-sm">
                    ▶ 다시 듣기
                  </button>
                  <button type="button" onClick={() => acceptParentVoice(voice)} className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm">
                    닮았어요, 사용하기
                  </button>
                  <button type="button" onClick={() => retryParentVoice(voice)} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-rose-600 shadow-sm">
                    다시 녹음할게요
                  </button>
                </div>
              </div>
            ))}

            {/* 녹음한 엄마·아빠 목소리 — "목소리 만들기"로 복제하면 동화에서 그 목소리로 읽힌다 */}
            {customVoices.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {customVoices.map((v) => (
                  <span
                    key={v.id}
                    className="flex flex-wrap items-center gap-1.5 rounded-full bg-amber-100 px-3.5 py-2 text-sm font-bold text-amber-800"
                  >
                    <button
                      type="button"
                      onClick={() => previewCustom(v)}
                      aria-label={`${v.label} 목소리 들어보기`}
                      className="flex items-center gap-1.5"
                    >
                      <span className="flex text-lg leading-none">
                        <VoiceGlyph voice={v} className="-my-1 h-7 w-7" />
                      </span>
                      {v.label} 🔊
                    </button>
                    {isPending(v) ? (
                      <span className="rounded-full bg-amber-200 px-2 text-[10px] font-bold text-amber-800">
                        확인 필요
                      </span>
                    ) : isCloned(v) ? (
                      <>
                        <span className="rounded-full bg-emerald-100 px-2 text-[10px] font-bold text-emerald-700">
                          ✅ 완성
                        </span>
                        {/* 다시 만들기 — 토큰만 있으면 언제든. 예전엔 먼저 지워야 해서,
                            지우고 나서 복제가 실패하면 멀쩡한 목소리만 잃었다.
                            이제 새로 만들어진 뒤에 옛것이 지워진다. */}
                        <button
                          type="button"
                          onClick={() => remakeParentVoice(v)}
                          disabled={cloningRole !== null}
                          className="whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-amber-700 shadow-sm transition hover:bg-amber-50 disabled:opacity-50"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/icons/func-remake.webp" alt="" aria-hidden className="mr-0.5 inline-block h-4 w-4 object-contain align-[-0.2em]" />
                          {cloningRole === roleFromLabel(v.label)
                            ? "만드는 중…"
                            : `다시 만들기${master ? "" : ` (${pricing.cost_parent_voice}토큰)`}`}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => makeParentVoice(v)}
                        disabled={cloningRole !== null}
                        className="whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-amber-700 shadow-sm transition hover:bg-amber-50 disabled:opacity-50"
                      >
                        {cloningRole === roleFromLabel(v.label)
                          ? "만드는 중…"
                          : `🎙️ 목소리 만들기${master ? "" : ` (${pricing.cost_parent_voice}토큰)`}`}
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={`${v.label} 목소리 삭제`}
                      onClick={() => removeCustom(v)}
                      className="text-amber-600"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* 다른 기기에서 만든 완성 목소리 — 이 기기엔 녹음이 없어도 계정에 있으면
                보여주고 지울 수 있게 한다 (PC 등 두 번째 기기에서 안 보이던 구멍, 2026-07-31). */}
            {parentVoices.some((p) => !customVoices.some((v) => roleFromLabel(v.label) === p.role)) && (
              <div className="flex flex-wrap gap-2">
                {parentVoices
                  .filter((p) => !customVoices.some((v) => roleFromLabel(v.label) === p.role))
                  .map((p) => (
                    <span
                      key={p.role}
                      className="flex flex-wrap items-center gap-1.5 rounded-full bg-amber-100 px-3.5 py-2 text-sm font-bold text-amber-800"
                    >
                      <span className="flex text-lg leading-none">
                        <VoiceGlyph voice={p} className="-my-1 h-7 w-7" />
                      </span>
                      {p.label} 목소리
                      <span className="rounded-full bg-emerald-100 px-2 text-[10px] font-bold text-emerald-700">
                        ✅ 완성
                      </span>
                      <button
                        type="button"
                        aria-label={`${p.label} 목소리 삭제`}
                        onClick={() => removeParentOnly(p)}
                        className="text-amber-600"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
              </div>
            )}
            </>)}

            {/* 읽기 속도 — 느리다고 느끼는 집을 위해. 누르면 그 속도로 바로 들린다. */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-neutral-400">읽기 속도</span>
              {VOICE_RATES.map((r) => {
                const active = voiceRate === r.value;
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => pickRate(r.value)}
                    aria-pressed={active}
                    style={active ? { background: accent } : undefined}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                      active
                        ? "text-white shadow"
                        : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                    }`}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>

            {devMode && (<>
            {/* 엄마·아빠 추가 — 역할마다 하나씩 보관하며 삭제 후 다시 만들 수 있다. */}
            {!recording && (
              <div className="flex flex-wrap gap-2">
                {[
                  { role: "mom", label: "엄마", emoji: "👩" },
                  { role: "dad", label: "아빠", emoji: "👨" },
                ].map((o) => {
                  const hasVoice = parentVoices.some((p) => p.role === o.role);
                  const hasRecording = customVoices.some((v) => roleFromLabel(v.label) === o.role);
                  if (hasVoice || hasRecording) return null; // 이미 있으면 위쪽 칩으로 관리한다
                  return (
                    <button
                      key={o.role}
                      type="button"
                      onClick={() => setRecording({ label: o.label, emoji: o.emoji })}
                      className="flex items-center gap-1 rounded-full border-2 border-dashed border-neutral-300 px-4 py-2 text-sm font-bold text-neutral-500 hover:border-neutral-400"
                    >
                      +
                      <VoiceGlyph voice={o} className="-my-1 h-7 w-7" />
                      {o.label} 목소리 추가
                    </button>
                  );
                })}
              </div>
            )}

            {recording && (
              <VoiceRecorder
                label={recording.label}
                emoji={recording.emoji}
                accent={accent}
                owner={uid}
                onDone={(v) => {
                  setCustomVoices([...customVoices, v]);
                  setRecording(null);
                  flashSaved();
                }}
                onCancel={() => setRecording(null)}
              />
            )}

            <p className="break-keep text-[11px] font-medium leading-relaxed text-neutral-400">
              <b>엄마와 아빠를 각각</b> 만들 수 있어요. 녹음한 뒤 <b>🎙️ 목소리 만들기</b>를
              누르면 그 목소리로 복제돼요(한 명당 {pricing.cost_parent_voice}토큰).
              그다음 동화에서 <b>엄마·아빠 목소리</b>로 읽는 건 무료예요.
              수정하려면 기존 목소리를 지우고 다시 만들면 되며, 만들 때마다 {pricing.cost_parent_voice}
              토큰이에요. (✕로 지우면 서버에서도 완전히 삭제돼요.)
            </p>
            </>)}
          </section>

          {/* ── 책 화면 ── */}
          <section className="flex flex-col gap-2.5">
            <h2 className="text-sm font-extrabold text-neutral-400">책 보는 방식</h2>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  {
                    value: "full",
                    label: "꽉 찬 그림",
                    hint: "그림 위에 글자",
                    icon: "/icons/layout-full.webp",
                  },
                  {
                    value: "spread",
                    label: "펼침면",
                    hint: "그림 | 글 반반",
                    icon: "/icons/layout-spread.webp",
                  },
                ] as const
              ).map((o) => {
                const active = bookLayout === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => {
                      setBookLayout(o.value);
                      saveBookLayout(o.value);
                      flashSaved();
                    }}
                    aria-pressed={active}
                    style={active ? { background: accent } : undefined}
                    className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 transition ${
                      active ? "text-white shadow" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={o.icon} alt="" aria-hidden className="h-8 w-8 shrink-0 object-contain" />
                    <span className="flex flex-col items-start leading-tight">
                      <span className="text-sm font-extrabold">{o.label}</span>
                      <span className={`text-[11px] font-bold ${active ? "text-white/80" : "text-neutral-400"}`}>
                        {o.hint}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="break-keep text-[11px] font-medium leading-relaxed text-neutral-400">
              가로로 볼 때만 달라져요. <b>펼침면</b>은 그림이 가려지지 않아 진짜 그림책 같고,
              세로 그림(핸드폰용)으로 만든 동화에서 특히 예뻐요. 세로로 볼 때는 원래대로
              그림 아래에 글자가 놓여요.
            </p>

            {/*
              책 글자 위치(아래/위/가운데/왼쪽/오른쪽) 고르기 — 숨김.
              읽어주기가 글자를 따라가며 짚어 주게 된 뒤로, 글이 어디 놓이든
              지금 어디를 읽는지 알 수 있어 고를 이유가 없어졌다(사장님 지시).
              값과 뷰어 동작은 그대로 둔다 — 이미 고르신 분의 책이 갑자기 바뀌면 안 되고,
              되살릴 때도 이 주석만 걷어내면 된다. prefs.ts의 loadTextPos/saveTextPos,
              BookViewer의 textPos 갈래는 손대지 않았다.
            */}

            {/* 책장 한 줄 권수 — 넓은 화면에서만 의미가 있다.
                폰은 화면이 좁아 어차피 2권으로 맞춰지므로, 헷갈리지 않게 그 말을 적어 둔다. */}
            {/* 본문 글꼴 — 미리보기를 그 글꼴로 보여 준다. 이름만 봐서는 어떤 느낌인지
                알 수 없어서, 실제 글자를 보고 고르게 하는 편이 훨씬 빠르다. */}
            <button
              type="button"
              onClick={() => setFontPickerOpen((open) => !open)}
              aria-expanded={fontPickerOpen}
              aria-controls="story-font-picker"
              className="mt-1 flex w-full items-center gap-3 rounded-2xl bg-neutral-100 px-4 py-3 text-left transition hover:bg-neutral-200"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-extrabold text-neutral-400">동화 글꼴</span>
                <span
                  className="mt-0.5 block truncate text-neutral-800"
                  style={{
                    fontFamily: `${selectedStoryFont.family}, sans-serif`,
                    fontSize: `calc(1rem * ${selectedStoryFont.scale} * 1.35)`,
                    fontWeight: storyWeightForFont(selectedStoryFont, findStoryWeight(storyWeight)),
                  }}
                >
                  우리 가족의 따뜻한 동화
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-xs font-extrabold text-neutral-500">{selectedStoryFont.label}</span>
                <span
                  aria-hidden
                  className={`inline-block text-lg leading-none text-neutral-400 transition-transform duration-300 ${
                    fontPickerOpen ? "rotate-180" : ""
                  }`}
                >
                  ⌄
                </span>
              </span>
            </button>

            <div
              id="story-font-picker"
              aria-hidden={!fontPickerOpen}
              inert={!fontPickerOpen}
              className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
                fontPickerOpen
                  ? "grid-rows-[1fr] opacity-100"
                  : "pointer-events-none grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="flex flex-col gap-2 pt-2">
                  {(
                    [
                      { id: "readable", label: "읽기 편함" },
                      { id: "storybook", label: "동화 느낌" },
                      { id: "decorative", label: "꾸밈 글꼴 · 짧은 동화에 추천" },
                    ] as const
                  ).map((group) => (
                    <div key={group.id} className="flex flex-col gap-1.5">
                      <p className="px-1 text-[11px] font-extrabold text-neutral-400">{group.label}</p>
                      {STORY_FONTS.filter((f) => f.category === group.id).map((f) => {
                        const active = storyFont === f.id;
                        const chosenWeight = findStoryWeight(storyWeight);
                        return (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => {
                              setStoryFont(f.id);
                              saveStoryFont(f.id);
                              if (!f.weights.includes(chosenWeight.value)) {
                                setStoryWeight("normal");
                                saveStoryWeight("normal");
                              }
                              setFontPickerOpen(false);
                              flashSaved();
                            }}
                            aria-pressed={active}
                            style={{
                              ...(active ? { borderColor: accent } : undefined),
                              fontFamily: `${f.family}, sans-serif`,
                              fontWeight: storyWeightForFont(f, chosenWeight),
                            }}
                            className={`flex items-baseline justify-between gap-3 rounded-2xl border-2 px-4 py-3 text-left transition ${
                              active ? "bg-white shadow-sm" : "border-transparent bg-neutral-100"
                            }`}
                          >
                            <span
                              className="min-w-0 flex-1 text-neutral-800"
                              style={{ fontSize: `calc(1.15rem * ${f.scale} * 1.6)` }}
                            >
                              “와, 정말 멋진 별빛이야!” 아이는 숲길을 천천히 걸었어요.
                            </span>
                            <span
                              className="shrink-0 text-xs font-extrabold text-neutral-400"
                              style={{ fontFamily: "inherit" }}
                            >
                              {f.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 글자 굵기 — 미리보기 글씨도 고른 굵기로 바뀌게 해서 바로 비교된다. */}
            <h2 className="mt-1 text-sm font-extrabold text-neutral-400">글자 굵기</h2>
            <div className="flex flex-wrap gap-2">
              {STORY_WEIGHTS.map((w) => {
                const active = storyWeight === w.id;
                const supported = selectedStoryFont.weights.includes(w.value);
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => {
                      if (!supported) return;
                      setStoryWeight(w.id);
                      saveStoryWeight(w.id);
                      flashSaved();
                    }}
                    aria-pressed={active}
                    disabled={!supported}
                    style={{
                      fontWeight: w.value,
                      ...(active ? { background: accent } : undefined),
                    }}
                    className={`rounded-full px-4 py-2 text-sm transition ${
                      active
                        ? "text-white shadow"
                        : supported
                          ? "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                          : "cursor-not-allowed bg-neutral-100 text-neutral-300 line-through"
                    }`}
                  >
                    {w.label}
                  </button>
                );
              })}
            </div>
            <p className="-mt-1 break-keep text-xs font-medium text-neutral-400">
              선택한 글꼴에 실제로 들어 있는 굵기만 고를 수 있어요.
            </p>

            {/* 넓은 화면에서만 다 들어간다 — 휴대폰은 폭에 맞춰 줄어서(세로 2권·가로 4권 안팎) 태블릿용이라고 밝힌다(사장님 10-21) */}
            <h2 className="mt-1 text-sm font-extrabold text-neutral-400">책장 한 줄에 (태블릿·컴퓨터)</h2>
            <div className="flex flex-wrap gap-2">
              {SHELF_COLS.map((n) => {
                const active = shelfCols === n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      setShelfCols(n);
                      saveShelfCols(n);
                      flashSaved();
                    }}
                    aria-pressed={active}
                    style={active ? { background: accent } : undefined}
                    className={`rounded-full px-4 py-2 text-sm font-extrabold transition ${
                      active ? "text-white shadow" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                    }`}
                  >
                    {n}권
                  </button>
                );
              })}
            </div>
            <p className="-mt-1 text-xs font-medium text-neutral-400">
              태블릿·컴퓨터처럼 넓은 화면에서 한 줄에 몇 권씩 놓을지예요. 휴대폰은 화면 폭에 맞춰 알아서 줄어요.
            </p>

            <h2 className="mt-1 text-sm font-extrabold text-neutral-400">동화가 끝나면</h2>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { value: false, label: "다음 동화 물어보기" },
                  { value: true, label: "다음 동화 이어서 틀기" },
                ] as const
              ).map((o) => {
                const active = autoNext === o.value;
                return (
                  <button
                    key={o.label}
                    type="button"
                    onClick={() => {
                      autoNextTouched.current = true;
                      setAutoNext(o.value);
                      saveAutoNext(o.value); // 안에서 계정(Supabase)에도 남긴다
                      flashSaved();
                    }}
                    aria-pressed={active}
                    style={active ? { background: accent } : undefined}
                    className={`rounded-full px-4 py-2 text-sm font-extrabold transition ${
                      active ? "text-white shadow" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
            <p className="-mt-1 break-keep text-xs font-medium leading-relaxed text-neutral-400">
              <b>이어서 틀기</b>를 켜 두면 한 편을 다 읽어 준 뒤 &quot;다음 동화 보기&quot;를 묻지 않고,
              같은 책장의 다음 동화를 바로 읽어 줘요. 잠자리에 틀어 두기 좋아요. 넘어가기 전에 잠깐 뜨는
              알림에서 <b>여기서 멈추기</b>를 누르면 멈춰요.
            </p>
          </section>

          {/* ── 언어 ── 지금은 한국어만 서비스. 영어·일본어는 준비 중이라 못 고른다. */}
          <section className="flex flex-col gap-2.5">
            <h2 className="text-sm font-extrabold text-neutral-400">동화 언어</h2>
            <div className="flex flex-wrap items-center gap-2">
              {FLAGS.map((f) => {
                const active = f.lang === lang;
                const ready = f.lang === "ko"; // 한국어만 서비스 중
                return (
                  <button
                    key={f.lang}
                    type="button"
                    disabled={!ready}
                    onClick={() => {
                      if (!ready) return;
                      setLang(f.lang);
                      saveLang(f.lang);
                      flashSaved();
                    }}
                    aria-pressed={active}
                    title={ready ? undefined : "아직 서비스 준비 전이에요"}
                    className={`relative flex items-center gap-2 rounded-full border-2 py-1.5 pl-1.5 pr-3.5 font-bold transition ${
                      !ready
                        ? "cursor-not-allowed border-transparent bg-neutral-100 opacity-40"
                        : active
                          ? "border-neutral-300 bg-white shadow"
                          : "border-transparent bg-neutral-100 opacity-70 hover:opacity-100"
                    }`}
                  >
                    <span className="block h-7 w-7 overflow-hidden rounded-full border border-black/10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.src} alt="" className="h-full w-full object-cover" />
                    </span>
                    <span className="text-sm text-neutral-700">{f.label}</span>
                    {!ready && (
                      <span className="ml-0.5 rounded-full bg-neutral-300 px-1.5 py-0.5 text-[9px] font-extrabold text-neutral-600">
                        준비중
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] font-medium text-neutral-400">
              지금은 <b>한국어</b>만 서비스해요. 영어·일본어는 아직 준비 전이에요.
            </p>
          </section>

          {/* ── 내 동화 관리 ── 만든 책 전체. 책장 노출(숨기기/보이기)과 영구 삭제를
              여기서만 한다(책장에는 관리 버튼을 두지 않는다). 하나도 없으면 칸을 감춘다. */}
          {myBooks.length > 0 && (
            <section className="flex flex-col gap-2.5">
              <h2 className="text-sm font-extrabold text-neutral-400">
                내 동화 ({myBooks.length})
              </h2>
              <p className="-mt-1 text-xs font-medium text-neutral-400">
                만든 동화 목록이에요. 책장에서 숨기거나, 영구 삭제할 수 있어요.
              </p>
              <ul className="flex flex-col gap-2">
                {myBooks.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center gap-2 rounded-2xl bg-neutral-100 px-3 py-2"
                  >
                    <span className="flex flex-1 items-center gap-1.5 truncate">
                      <span className="truncate text-sm font-bold text-neutral-700">
                        {b.title}
                      </span>
                      {b.hidden && (
                        <span className="shrink-0 rounded-full bg-neutral-300 px-1.5 py-0.5 text-[10px] font-extrabold text-neutral-600">
                          숨김
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleHide(b.id, !b.hidden)}
                      className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-extrabold text-neutral-700 shadow-sm"
                    >
                      {b.hidden ? "보이기" : "숨기기"}
                    </button>
                    <button
                      type="button"
                      onClick={() => purgeBook(b.id, b.title)}
                      className="shrink-0 rounded-full bg-red-500 px-3 py-1.5 text-xs font-extrabold text-white"
                    >
                      영구 삭제
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ── 관리자(마스터) ── 관리 일은 전부 관리자 페이지(/admin)에서 한다(2026-09-30 정식판).
              예전 이 자리의 회원 목록·책장 열람·옛 그림 정리는 관리자 페이지의 회원·대시보드로 옮겼다 —
              여기 남겨 두면 설정을 열 때마다 전 회원·전 책을 읽고, 그림 옮기기를 두 곳에서 겹쳐 돌릴 수 있다.
              이 링크는 마스터에게만 보이지만 막는 것은 링크가 아니라 /api/admin/* 서버의 마스터 확인이다. */}
          {master && (
            <section className="flex flex-col gap-2.5">
              <h2 className="text-sm font-extrabold text-amber-600">👑 관리자</h2>
              <Link
                href="/admin"
                className="flex min-h-12 items-center justify-between rounded-2xl bg-amber-50 px-4 py-3 text-sm font-extrabold text-amber-800 transition hover:bg-amber-100"
              >
                <span>
                  관리자 페이지 열기
                  <span className="ml-1.5 text-xs font-bold text-amber-700/70">회원 · 결제 · 의견 · 사업자 정보</span>
                </span>
                <span aria-hidden>→</span>
              </Link>
              <p className="-mt-1 text-xs font-medium text-neutral-400">
                회원·토큰, 결제·구독, 의견·오류, 요금제, 사업자 정보·약관을 한곳에서 관리해요.
              </p>
              {/* 앱(안드로이드)이 카메라 자리까지 그리는지 사장님 폰의 실제 값 — 10-21 */}
              <ScreenDiag />
            </section>
          )}

          {/* 회원 탈퇴 — 눈에 띄지 않게 맨 아래 한 줄. 관리자 계정은 탈퇴하지 않는다(DB 도 막는다). */}
          {!master && (
            <button
              type="button"
              onClick={() => setWithdrawOpen(true)}
              className="mt-2 inline-flex min-h-11 items-center self-center px-3 text-xs font-bold text-neutral-400 underline underline-offset-2"
            >
              회원 탈퇴
            </button>
          )}
          </>)}

          {/* 모두 자동 저장이라 이 버튼은 "닫기"일 뿐이지만, 마무리 버튼이 있어야 안심한다. */}
          <button
            type="button"
            onClick={() => router.push("/")}
            style={{ background: accent }}
            className="mt-1 rounded-full py-3 text-lg font-extrabold text-white transition-transform hover:-translate-y-0.5 active:translate-y-0"
          >
            확인
          </button>
        </div>
      </main>
      {/*
        * 탈퇴 시트는 설정 카드 밖에 둔다(2026-10-20 점검) — 카드에 backdrop-blur 가 있어 그 안의 fixed 시트가 화면이 아니라
        * 스크롤되는 카드에 붙었다. 아래로 내려 '회원 탈퇴'를 누르면 시트가 카드 위쪽에 숨어 안 보일 수 있었다
        * (구글 플레이가 요구하는 앱 안 계정 삭제 경로).
        */}
      {withdrawOpen && (
        <WithdrawSheet
          onClose={() => setWithdrawOpen(false)}
          onDone={() => router.replace("/login?bye=1")}
        />
      )}
    </div>
  );
}
