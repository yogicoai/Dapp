"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FLAGS } from "@/components/FlagFilter";
import { ThemePicker } from "@/components/ThemePicker";
import { useTheme } from "@/components/ThemeProvider";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import {
  addTokens,
  loadAllUsers,
  loadSession,
  logOut,
  spendTokens,
  type Profile,
} from "@/lib/auth";
import {
  countBooksWithEmbeddedArt,
  deleteMyBook,
  loadAllBooksBrief,
  loadChild,
  loadChildRemote,
  loadLang,
  loadMyBookBriefs,
  loadBookLayout,
  loadShelfCols,
  saveShelfCols,
  SHELF_COLS,
  type ShelfCols,
  loadTextPos,
  looksToPrompt,
  type ChildLooks,
  saveBookLayout,
  saveChild,
  saveLang,
  saveTextPos,
  type BookLayout,
  setMyBookHidden,
  type BookBrief,
  type Gender,
} from "@/lib/prefs";
import { migrateBookArt, type MigrateProgress } from "@/lib/migrate-art";
import { COST_PARENT_VOICE, TOKEN_PRICE_KRW } from "@/lib/tokens";
import { useEscClose } from "@/lib/use-esc-close";
import {
  PRESET_VOICES,
  TYPECAST_VOICES,
  DEFAULT_VOICE_RATE,
  VOICE_RATES,
  applyPlaybackRate,
  buildPresetUtterance,
  deleteVoiceAudio,
  findTypecast,
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
  cloneParentVoice,
  deleteParentVoice,
  loadAllParentVoiceRoles,
  loadParentVoices,
  remainingCloneChances,
  roleFromLabel,
  type ParentVoice,
} from "@/lib/parent-voice";

/**
 * 아이 특징 항목 — 동화 주인공을 "우리 애 같게" 만드는 재료.
 *
 * 무엇을 넣을지는 '아이를 알아보게 하는 힘'으로 골랐다. 앞머리 유무·눈매·늘 지니는
 * 물건은 부모가 아이를 떠올릴 때 가장 먼저 말하는 것들이라 반드시 넣었고,
 * 반대로 그림에서 티가 안 나는 항목(키 몇 cm 같은)은 뺐다.
 * multi=true면 여러 개 고를 수 있다.
 */
/** 하나만 고르는 항목 / 여러 개 고르는 항목을 타입으로 갈라 둔다(코드가 헷갈리지 않게). */
type LookSingleKey = "hair" | "bangs" | "hairColor" | "eyes" | "skin" | "build" | "color";
type LookMultiKey = "items" | "marks";
type LookRow =
  | { key: LookSingleKey; label: string; opts: readonly string[]; multi?: false }
  | { key: LookMultiKey; label: string; opts: readonly string[]; multi: true };

const LOOK_ROWS: readonly LookRow[] = [
  {
    // 짧은 것부터 긴 것 순서로 둔다. 남자아이가 많이 하는 중간 길이(바가지·귀 덮는)가
    // 통째로 빠져 있어서 넣었다 — '짧은 머리 아니면 단발'만 있으면 고를 게 없다.
    // 곱슬은 길이가 아니라 결이라 아래 '이런 점도'로 옮겼다(단발+곱슬을 같이 고를 수 있게).
    key: "hair" as const,
    label: "머리 모양",
    opts: [
      "아주 짧아요",
      "짧은 머리",
      "바가지 머리",
      "귀 덮는 머리",
      "단발",
      "긴 머리",
      "양갈래",
      "하나로 묶기",
      "똥머리",
    ],
  },
  { key: "bangs" as const, label: "앞머리", opts: ["있어요", "없어요", "옆으로 넘겨요"] },
  { key: "hairColor" as const, label: "머리 색", opts: ["까만색", "짙은 갈색", "밝은 갈색"] },
  {
    key: "eyes" as const,
    label: "눈매",
    opts: ["크고 동그래요", "웃으면 반달이 돼요", "또렷해요", "쌍꺼풀이 있어요"],
  },
  {
    // 피부는 표현을 특히 조심한다 — 값을 매기는 말("가무잡잡" 등)은 쓰지 않는다.
    // 밝기를 그대로 말하거나, 아이답고 긍정적인 사실("햇볕에 그을렸어요")로만 적는다.
    key: "skin" as const,
    label: "피부",
    opts: ["밝은 편", "보통이에요", "조금 진한 편", "햇볕에 그을렸어요"],
  },
  {
    // 키는 뺐다 — 그림 한 장에 아이 혼자 있으면 큰지 작은지 알 수가 없어서
    // 골라도 결과가 안 달라진다. 몸집만 남긴다.
    key: "build" as const,
    label: "몸집",
    opts: ["통통해요", "보통이에요", "마른 편이에요"],
  },
  {
    key: "color" as const,
    label: "좋아하는 옷 색",
    opts: ["빨강", "노랑", "파랑", "초록", "분홍", "보라", "하양"],
  },
  {
    key: "items" as const,
    label: "늘 지니는 것",
    opts: ["곰인형", "모자", "머리핀", "가방", "장난감 자동차", "담요"],
    multi: true,
  },
  {
    key: "marks" as const,
    label: "이런 점도 있어요",
    opts: ["곱슬머리", "주근깨", "보조개", "앞니 빠짐", "볼이 통통해요"],
    multi: true,
  },
];

const AGES = [3, 4, 5, 6, 7, 8];
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
  const { theme } = useTheme();
  const { accent } = theme.colors;

  // 설정값은 서버 렌더 중 localStorage에서 읽지 않는다. 마운트 후 불러와야
  // 저장된 값이 있는 브라우저에서도 서버 HTML과 첫 클라이언트 렌더가 같다.
  const [name, setName] = useState("");
  const [age, setAge] = useState<number | null>(null);
  const [gender, setGender] = useState<Gender>("girl");
  // 아이 생김새 — 동화 주인공을 "우리 애 같게" 만드는 특징들(사진 대신).
  const [looks, setLooks] = useState<ChildLooks>({});
  /**
   * 부모가 아이 정보를 한 번이라도 만졌는지.
   * 서버에서 아이 정보를 되살리는 데 1~2초가 걸리는데, 그 사이 부모가 특징을 고르면
   * 뒤늦게 도착한 옛 값이 방금 고른 걸 덮어 "저장이 안 된다"로 보였다.
   */
  const childTouched = useRef(false);
  // 항목이 많아 화면이 길어진다 — 평소엔 접어 두고 눌러서 편다.
  const [looksOpen, setLooksOpen] = useState(false);
  const [lang, setLang] = useState("ko");

  // 목소리 — 프리셋 선택 + 엄마·아빠 녹음 관리
  const [voiceId, setVoiceId] = useState("basic");
  const [voiceRate, setVoiceRate] = useState(DEFAULT_VOICE_RATE);
  // 책 화면 — 글자 위치(위/아래)
  const [textPos, setTextPos] = useState<ReturnType<typeof loadTextPos>>("bottom");
  // 책 보는 방식 — 가로에서 '꽉 찬 그림' / '펼침면(그림|글 반반)'.
  const [bookLayout, setBookLayout] = useState<BookLayout>("full");
  // 책장 한 줄 권수(넓은 화면 전용).
  const [shelfCols, setShelfCols] = useState<ShelfCols>(5);
  const [customVoices, setCustomVoices] = useState<CustomVoice[]>([]);
  const [recording, setRecording] = useState<{ label: string; emoji: string } | null>(null);
  // 부모 목소리(복제됨) — 계정별로 Supabase에서 불러온다. cloningRole = 지금 복제 중인 역할.
  const [parentVoices, setParentVoices] = useState<ParentVoice[]>([]);
  const [cloningRole, setCloningRole] = useState<string | null>(null);
  const [cloneErr, setCloneErr] = useState("");
  // 역할별 남은 만들기 기회 — 엄마·아빠가 서로 독립이다(각각 처음 1 + 수정 1).
  // null = 아직 확인 전.
  const [chances, setChances] = useState<{ mom: number; dad: number } | null>(null);
  const chancesFor = (role: string) => (chances ? (role === "dad" ? chances.dad : chances.mom) : null);
  const refreshChances = async () => {
    const [mom, dad] = await Promise.all([
      remainingCloneChances("mom"),
      remainingCloneChances("dad"),
    ]);
    setChances({ mom, dad });
  };
  // 만들기 연타 방지 잠금 — state가 아닌 ref라 클릭 즉시 걸린다.
  const cloneBusyRef = useRef(false);
  // 내 동화 — 만든 책 전체. 여기서 책장 노출(숨기기/보이기)과 영구 삭제를 관리한다.
  // 목록에 쓰는 건 제목·숨김뿐이라 가벼운 형태로 받는다(본문·삽화 제외).
  const [myBooks, setMyBooks] = useState<BookBrief[]>([]);
  // 계정 — 로그인한 아이디·토큰. 게스트면 스킨(테마)만 보인다. 마스터면 회원 목록도.
  const [guest, setGuest] = useState(false);
  const [acctId, setAcctId] = useState<string | null>(null);
  // 계정 uid — 녹음(customVoices) 계정별 저장 키에 쓴다.
  const [uid, setUid] = useState<string | null>(null);
  const [acctTokens, setAcctTokens] = useState(0);
  const [master, setMaster] = useState(false);
  const [members, setMembers] = useState<Profile[]>([]);
  const [openMember, setOpenMember] = useState<string | null>(null);
  // 회원(owner) → 그 회원이 만든 책들. 마스터 진입 시 한 번에 불러와 개수·목록에 쓴다.
  const [memberBooks, setMemberBooks] = useState<Record<string, BookBrief[]>>({});
  // 회원(owner) → 등록한 부모 목소리 역할들(["mom","dad"]). 등록 여부 확인용.
  const [memberVoices, setMemberVoices] = useState<Record<string, string[]>>({});
  // 옛 책 삽화 옮기기 — 진행 중이면 진행 상황, 끝나면 결과 문장.
  const [migrating, setMigrating] = useState<MigrateProgress | null>(null);
  const [migrateDone, setMigrateDone] = useState("");
  /**
   * 아직 그림이 DB 안에 있는 책 수. 0이면 정리가 끝난 것이라 칸을 감춘다.
   * -1은 '아직 모름'(조회 전이거나 실패) — 그땐 칸을 보여 준다.
   */
  const [oldArtCount, setOldArtCount] = useState(-1);
  // 화면을 떠나면 옮기기를 멈춘다 — 안 보는 화면에서 계속 돌 이유가 없다.
  const migrateStop = useRef(false);
  useEffect(() => () => void (migrateStop.current = true), []);

  // 부모 목소리(복제됨) 목록·남은 만들기 기회를 계정에서 불러온다(로그인 안 됐으면 빈 목록).
  useEffect(() => {
    loadParentVoices().then(setParentVoices).catch(() => {});
    void refreshChances().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 때 한 번만 불러온다
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
    }
    setLang(loadLang());
    setVoiceId(loadSelectedVoiceId());
    setVoiceRate(loadVoiceRate());
    setTextPos(loadTextPos());
    setBookLayout(loadBookLayout());
    setShelfCols(loadShelfCols());
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
      // 단, 이게 돌아오는 동안 부모가 이미 만졌다면 덮지 않는다 — 안 그러면 방금
      // 고른 특징이 서버의 옛 값으로 되돌아가 "저장이 안 된다"가 된다.
      void loadChildRemote()
        .then((c) => {
          if (!alive || !c || childTouched.current) return;
          setName(c.name);
          setAge(c.age);
          setGender(c.gender);
          setLooks(c.looks ?? {});
        })
        .catch(() => {});

      void loadMyBookBriefs()
        .then((b) => alive && setMyBooks(b))
        .catch(() => {});

      if (s.isMaster) {
        void loadAllUsers()
          .then((users) => alive && setMembers(users))
          .catch(() => {});
        void loadAllBooksBrief()
          .then((allBooks) => {
            if (!alive) return;
            // owner별로 묶어 회원마다 만든 동화 개수·목록을 바로 보여준다.
            const grouped: Record<string, BookBrief[]> = {};
            for (const b of allBooks) (grouped[b.owner] ??= []).push(b);
            setMemberBooks(grouped);
          })
          .catch(() => {});
        void loadAllParentVoiceRoles()
          .then((v) => alive && setMemberVoices(v))
          .catch(() => {});
        // 정리할 게 남았는지 — 개수만 센다(그림은 안 받는다).
        void countBooksWithEmbeddedArt()
          .then((n) => alive && setOldArtCount(n))
          .catch(() => {});
      }
    })();
    return () => {
      alive = false;
    };
  }, [router]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // 회원 펼치기/접기 — 책은 이미 memberBooks에 다 불러와 있어 즉시 보인다.
  function toggleMember(id: string) {
    setOpenMember((cur) => (cur === id ? null : id));
  }

  // 토큰 충전(베타) — 결제 붙기 전 임시. 30개씩 넣어 테스트.
  async function topUp() {
    await addTokens(30);
    setAcctTokens((t) => t + 30);
    flashSaved();
  }
  // 로그아웃 → 로그인 화면.
  async function doLogout() {
    await logOut();
    router.replace("/login");
  }

  // 책장 노출 토글(숨기기/보이기) — 숨기면 책장에서 내려가고, 보이면 다시 뜬다.
  async function toggleHide(id: string, hidden: boolean) {
    await setMyBookHidden(id, hidden);
    setMyBooks((prev) => prev.map((b) => (b.id === id ? { ...b, hidden } : b)));
    flashSaved();
  }
  /**
   * 옛 책 삽화를 cafe24로 옮긴다 (마스터 전용, 한 번만 돌리면 되는 정리 작업).
   *
   * 전 회원의 책을 대상으로 하되 폴더는 그 책 주인의 아이디로 나눈다 — 마스터가
   * 대신 옮겨 줘도 파일은 원래 주인 자리에 들어가야 나중에 찾을 수 있다.
   */
  async function migrateOldArt() {
    const all = Object.values(memberBooks).flat();
    // 마스터 자신의 책도 대상 — memberBooks에는 다른 회원 것만 묶여 있을 수 있다.
    const mine = myBooks.filter((b) => !all.some((x) => x.id === b.id));
    const targets = [...all, ...mine];
    if (targets.length === 0) {
      setMigrateDone("옮길 동화가 없어요.");
      return;
    }
    if (!window.confirm(`동화 ${targets.length}권의 그림을 옮길까요?\n\n몇 분 걸릴 수 있고, 이 화면을 열어 두셔야 해요.`)) return;

    migrateStop.current = false;
    setMigrateDone("");
    // 회원id → 아이디. 폴더 이름이 될 값이라, 모르면 회원id를 그대로 쓴다.
    const names: Record<string, string> = {};
    for (const m of members) names[m.id] = m.username;
    if (uid && acctId) names[uid] = acctId;

    try {
      const r = await migrateBookArt(
        targets.map((b) => ({ id: b.id, owner: b.owner, title: b.title })),
        (ownerId) => names[ownerId] ?? ownerId,
        setMigrating,
        () => migrateStop.current,
      );
      setMigrateDone(
        `끝났어요 — ${r.moved}권에서 그림 ${r.images}장을 옮겼어요.` +
          (r.skipped ? ` (이미 옮겨진 책 ${r.skipped}권)` : "") +
          (r.failed ? ` ⚠️ ${r.failed}권은 실패했어요 — 다시 눌러 주세요.` : ""),
      );
      // 표지가 URL로 바뀌었으니 목록도 새로 읽고, 남은 권수도 다시 센다
      // (0이 되면 정리 칸이 사라진다).
      void loadMyBookBriefs().then(setMyBooks).catch(() => {});
      void countBooksWithEmbeddedArt().then(setOldArtCount).catch(() => {});
    } catch {
      setMigrateDone("옮기는 중 문제가 생겼어요. 다시 눌러 주세요.");
    } finally {
      setMigrating(null);
    }
  }

  // 영구 삭제 — 복원 불가라 경고를 띄우고 한 번 더 확인받는다.
  async function purgeBook(id: string, title: string) {
    if (!window.confirm(`⚠️ "${title}"을(를) 영구 삭제할까요?\n\n완전히 지워지며 복원할 수 없어요.`)) return;
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

  /** 이 녹음(엄마/아빠)이 이미 복제(목소리 만들기)됐는지. */
  const isCloned = (v: CustomVoice) => parentVoices.some((p) => p.role === roleFromLabel(v.label));

  /**
   * 녹음 → 복제(목소리 만들기). 성공하면 계정에 저장되고 동화에서 그 목소리로 읽을 수 있다.
   * 만들기 1회 = COST_PARENT_VOICE 토큰(실측 원가 기반, 마스터 면제).
   * 과금은 '선차감 → 복제 실패 시 환불' — 차감이 서버 잔액 기준이라(다른 탭에서 잔액이
   * 바뀌어도) 무과금 복제가 생기지 않고, 복제가 실패하면 토큰이 돌아온다.
   */
  const makeParentVoice = async (v: CustomVoice) => {
    // 연타 방지 — state(cloningRole)는 재렌더 전까지 버튼을 못 잠그므로 ref로 즉시 잠근다.
    if (cloneBusyRef.current) return;
    cloneBusyRef.current = true;
    setCloneErr("");
    setCloningRole(roleFromLabel(v.label));
    let charged = false;
    try {
      const blob = await loadVoiceAudio(v.id);
      if (!blob) throw new Error("녹음을 찾지 못했어요. 다시 녹음해 주세요.");
      // 선차감 — 서버 잔액 기준. 부족하면 여기서 끝(복제 호출 자체를 안 한다).
      if (!master) {
        const ok = await spendTokens(COST_PARENT_VOICE);
        if (!ok) {
          throw new Error(
            `토큰이 부족해요. 목소리 만들기에는 ${COST_PARENT_VOICE}토큰이 필요해요.`,
          );
        }
        charged = true;
        setAcctTokens((t) => Math.max(0, t - COST_PARENT_VOICE));
      }
      await cloneParentVoice(roleFromLabel(v.label), v.label, blob);
      setParentVoices(await loadParentVoices());
      await refreshChances();
      flashSaved();
    } catch (e) {
      // 복제 실패 — 선차감했던 토큰을 돌려준다.
      if (charged) {
        await addTokens(COST_PARENT_VOICE).catch(() => {});
        setAcctTokens((t) => t + COST_PARENT_VOICE);
      }
      setCloneErr(e instanceof Error ? e.message : "목소리 만들기에 실패했어요.");
    } finally {
      cloneBusyRef.current = false;
      setCloningRole(null);
    }
  };

  const removeCustom = async (v: CustomVoice) => {
    // 복제까지 된 목소리면 — 지워도 만들기 기회는 안 돌아온다는 걸 확인받는다.
    if (isCloned(v)) {
      const left = chancesFor(roleFromLabel(v.label)) ?? 0;
      const warn =
        left > 0
          ? `${v.label} 목소리를 지울까요?\n\n지우고 새로 만들면 남은 ${v.label} 수정 기회(${left}번)를 사용해요.`
          : `${v.label} 목소리를 지울까요?\n\n⚠️ 남은 ${v.label} 수정 기회가 없어, 지우면 다시 만들 수 없어요.`;
      if (!window.confirm(warn)) return;
    }
    await deleteVoiceAudio(v.id).catch(() => {});
    // 복제된 목소리도 함께 삭제한다 — 우리 DB + Typecast 서버 양쪽에서(개인정보 미보존).
    await deleteParentVoice(roleFromLabel(v.label)).catch(() => {});
    setParentVoices((prev) => prev.filter((p) => p.role !== roleFromLabel(v.label)));
    await refreshChances();
    const next = customVoices.filter((x) => x.id !== v.id);
    setCustomVoices(next);
    saveCustomVoices(next, uid);
    flashSaved();
    if (voiceId === v.id) pickVoice("basic");
  };

  /** 이 기기에 녹음이 없는(다른 기기에서 만든) 완성 목소리 삭제 — 계정·Typecast 서버에서 제거. */
  const removeParentOnly = async (p: ParentVoice) => {
    const left = chancesFor(p.role) ?? 0;
    const warn =
      left > 0
        ? `${p.label} 목소리를 지울까요?\n\n지우고 새로 만들면 남은 ${p.label} 수정 기회(${left}번)를 사용해요.`
        : `${p.label} 목소리를 지울까요?\n\n⚠️ 남은 ${p.label} 수정 기회가 없어, 지우면 다시 만들 수 없어요.`;
    if (!window.confirm(warn)) return;
    await deleteParentVoice(p.role).catch(() => {});
    setParentVoices((prev) => prev.filter((x) => x.role !== p.role));
    await refreshChances();
    flashSaved();
  };

  const persistChild = (next: {
    name?: string;
    age?: number | null;
    gender?: Gender;
    looks?: ChildLooks;
  }) => {
    // 부모가 손을 댄 순간부터는 뒤늦게 도착하는 서버 값이 이걸 덮지 못하게 한다.
    childTouched.current = true;
    const merged = {
      name: next.name ?? name,
      age: next.age !== undefined ? next.age : age,
      gender: next.gender ?? gender,
      looks: next.looks ?? looks,
    };
    saveChild(merged);
    flashSaved();
  };

  /** 아이 특징 한 항목 바꾸기 — 같은 걸 다시 누르면 해제(선택 안 함)된다. */
  const setLook = (patch: Partial<ChildLooks>) => {
    const merged: ChildLooks = { ...looks, ...patch };
    setLooks(merged);
    persistChild({ looks: merged });
  };
  /** 여러 개 고르는 항목(늘 지니는 것·이런 점도)에서 하나를 켜고 끈다. */
  const toggleIn = (key: "items" | "marks", v: string) => {
    const cur = looks[key] ?? [];
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v].slice(0, 5);
    setLook({ [key]: next });
  };

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
            </p>
          )}

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
                      토큰 {acctTokens}개 <span className="text-neutral-400">(1개 ≈ ₩{TOKEN_PRICE_KRW})</span>
                    </>
                  )}
                </p>
              </div>
              {/* 베타: 토큰 충전 잠금. 결제 연동 후 disabled만 빼면 다시 열린다. */}
              {!master && (
                <button
                  type="button"
                  onClick={topUp}
                  disabled
                  className="shrink-0 cursor-not-allowed whitespace-nowrap rounded-full bg-neutral-200 px-3 py-1.5 text-xs font-extrabold text-neutral-400"
                >
                  🔒 충전 준비중
                </button>
              )}
              <button
                type="button"
                onClick={doLogout}
                className="shrink-0 whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-xs font-extrabold text-neutral-600 shadow-sm"
              >
                로그아웃
              </button>
            </div>
            <p className="-mt-1 text-[11px] font-medium text-neutral-400">
              베타 기간에는 토큰 충전이 잠겨 있어요. 결제 연동 후에 열려요.
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

          {/* ── 아이 특징 ── 동화 주인공을 "우리 애 같게" 만드는 재료.
              항목이 많아 화면이 길어지므로 평소엔 접어 두고 눌러서 편다.
              사진을 받지 않는 이유를 부모에게도 그대로 말해 준다(안심시키는 게 목적). */}
          <section className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setLooksOpen((v) => !v)}
              aria-expanded={looksOpen}
              className="flex items-center gap-2 rounded-2xl bg-neutral-100 px-4 py-3 text-left transition hover:bg-neutral-200"
            >
              <span className="text-lg leading-none" aria-hidden>🧒</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-extrabold text-neutral-700">
                  아이 특징 <span className="font-bold text-neutral-400">(선택)</span>
                </span>
                <span className="block truncate text-[11px] font-bold text-neutral-400">
                  {looksToPrompt(looks) || "고르면 주인공이 우리 아이를 닮게 그려져요"}
                </span>
              </span>
              <span
                aria-hidden
                className={`text-neutral-400 transition-transform ${looksOpen ? "rotate-180" : ""}`}
              >
                ▼
              </span>
            </button>

            {/* 펼침 — 높이 애니메이션으로 스르르 내려온다. */}
            <div
              className={`grid transition-[grid-template-rows,opacity] duration-300 ${
                looksOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="overflow-hidden">
                <div className="flex flex-col gap-3 pt-1">
                  <p className="break-keep text-[11px] font-medium leading-relaxed text-neutral-400">
                    사진은 받지 않아요 — 특징만으로 충분하고, 아이 사진을 어디에도 올리지 않아
                    안전해요. 안 골라도 동화는 만들어져요.
                  </p>

                  {LOOK_ROWS.map((row) => (
                    <div key={row.key} className="flex flex-col gap-1.5">
                      <p className="text-xs font-bold text-neutral-400">
                        {row.label}
                        {row.multi && <span className="font-medium text-neutral-300"> (여러 개)</span>}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {row.opts.map((o) => {
                          const active = row.multi
                            ? (looks[row.key] ?? []).includes(o)
                            : looks[row.key] === o;
                          return (
                            <button
                              key={o}
                              type="button"
                              // 같은 걸 다시 누르면 해제된다 — 잘못 고르고 못 되돌리면 답답하다.
                              onClick={() => {
                                if (row.multi) toggleIn(row.key, o);
                                else setLook({ [row.key]: active ? undefined : o } as Partial<ChildLooks>);
                              }}
                              aria-pressed={active}
                              style={active ? { background: accent } : undefined}
                              className={`rounded-full px-3.5 py-2 text-sm font-bold transition ${
                                active
                                  ? "text-white shadow"
                                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                              }`}
                            >
                              {o}
                            </button>
                          );
                        })}
                        {/* 안경은 켜고 끄는 값이라 '이런 점도' 줄 끝에 붙인다. */}
                        {row.key === "marks" && (
                          <button
                            type="button"
                            onClick={() => setLook({ glasses: looks.glasses ? undefined : true })}
                            aria-pressed={!!looks.glasses}
                            style={looks.glasses ? { background: accent } : undefined}
                            className={`rounded-full px-3.5 py-2 text-sm font-bold transition ${
                              looks.glasses
                                ? "text-white shadow"
                                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                            }`}
                          >
                            👓 안경
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* 자유 입력 — 칩으로 못 담는 것을 부모가 직접 적는다.
                      칩이 "이런 걸 적으면 되는구나"를 알려주는 예시 역할을 해서
                      백지 공포 없이 쓸 수 있다. */}
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs font-bold text-neutral-400">
                      더 알려주고 싶은 점 <span className="font-medium text-neutral-300">(선택)</span>
                    </p>
                    <input
                      value={looks.note ?? ""}
                      onChange={(e) => setLook({ note: e.target.value.slice(0, 100) || undefined })}
                      maxLength={100}
                      placeholder="예) 늘 공룡 티셔츠를 입어요 / 머리를 옆으로 묶어요"
                      className="w-full rounded-2xl border-2 border-neutral-200 px-4 py-2.5 text-sm font-bold outline-none placeholder:font-medium placeholder:text-neutral-300 focus:border-neutral-400"
                    />
                    <p className="text-[11px] font-medium text-neutral-300">
                      생김새만 적어주세요. 이름·나이·성격은 위에서 이미 받고 있어요.
                    </p>
                  </div>

                  {/* 지금까지 고른 것을 한 줄로 — 이 문장이 그대로 그림에 전해진다. */}
                  {looksToPrompt(looks) && (
                    <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-2.5">
                      <p className="min-w-0 flex-1 break-keep text-[12px] font-bold leading-relaxed text-emerald-700">
                        이렇게 그려요 — {looksToPrompt(looks)}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setLooks({});
                          persistChild({ looks: {} });
                        }}
                        className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[11px] font-extrabold text-neutral-500 shadow-sm"
                      >
                        모두 지우기
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
          </>)}

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
              {TYPECAST_VOICES.map((v) => {
                const active = voiceId === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => pickTypecast(v)}
                    aria-pressed={active}
                    title={v.desc}
                    style={active ? { background: accent } : undefined}
                    className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold transition ${
                      active ? "text-white shadow" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                    }`}
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-base leading-none">
                      {previewingId === v.id ? "⏳" : v.emoji}
                    </span>
                    {v.label}
                  </button>
                );
              })}
            </div>
            {ttsError && <p className="text-[11px] font-bold text-rose-500">{ttsError}</p>}
            {cloneErr && <p className="text-[11px] font-bold text-rose-500">{cloneErr}</p>}

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
                      <span className="text-lg leading-none">{v.emoji}</span>
                      {v.label} 🔊
                    </button>
                    {isCloned(v) ? (
                      <span className="rounded-full bg-emerald-100 px-2 text-[10px] font-bold text-emerald-700">
                        ✅ 완성
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => makeParentVoice(v)}
                        disabled={cloningRole !== null}
                        className="whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-amber-700 shadow-sm transition hover:bg-amber-50 disabled:opacity-50"
                      >
                        {cloningRole === roleFromLabel(v.label)
                          ? "만드는 중…"
                          : `🎙️ 목소리 만들기${master ? "" : ` (${COST_PARENT_VOICE}토큰)`}`}
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
                      <span className="text-lg leading-none">{p.emoji}</span>
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

            {/* 엄마·아빠 추가 — 이제 둘을 각각 만들 수 있다(2026-08-05).
                역할마다 따로 판단한다: 이미 만들었거나 녹음이 있으면 그 역할 버튼은 숨기고,
                그 역할의 기회를 다 썼으면 그 역할만 안내로 바꾼다. */}
            {!recording && (
              <div className="flex flex-wrap gap-2">
                {[
                  { role: "mom", label: "엄마", emoji: "👩" },
                  { role: "dad", label: "아빠", emoji: "👨" },
                ].map((o) => {
                  const hasVoice = parentVoices.some((p) => p.role === o.role);
                  const hasRecording = customVoices.some((v) => roleFromLabel(v.label) === o.role);
                  if (hasVoice || hasRecording) return null; // 이미 있으면 위쪽 칩으로 관리한다
                  const left = chancesFor(o.role);
                  if (left === 0) {
                    return (
                      <p key={o.role} className="text-[11px] font-bold text-neutral-400">
                        {o.emoji} {o.label} 목소리는 만들기 기회를 모두 사용했어요.
                      </p>
                    );
                  }
                  return (
                    <button
                      key={o.role}
                      type="button"
                      onClick={() => setRecording({ label: o.label, emoji: o.emoji })}
                      className="rounded-full border-2 border-dashed border-neutral-300 px-4 py-2 text-sm font-bold text-neutral-500 hover:border-neutral-400"
                    >
                      + {o.emoji} {o.label} 목소리 추가
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
              누르면 그 목소리로 복제돼요(한 명당 {COST_PARENT_VOICE}토큰).
              그다음 동화에서 <b>엄마·아빠 목소리</b>로 읽는 건 무료예요.
              수정(다시 만들기)은 <b>각각 1번씩</b>이고, 만들 때마다 {COST_PARENT_VOICE}토큰이에요.
              (✕로 지우면 서버에서도 완전히 삭제
              {chances ? ` · 남은 기회 — 엄마 ${chances.mom}번, 아빠 ${chances.dad}번` : ""})
            </p>
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
                    icon: "🖼️",
                  },
                  {
                    value: "spread",
                    label: "펼침면",
                    hint: "그림 | 글 반반",
                    icon: "📖",
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
                    <span className="text-lg leading-none" aria-hidden>
                      {o.icon}
                    </span>
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

            <h2 className="mt-1 text-sm font-extrabold text-neutral-400">책 글자 위치</h2>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { value: "bottom", label: "아래쪽", icon: "⬇️" },
                  { value: "top", label: "위쪽", icon: "⬆️" },
                  { value: "center", label: "가운데", icon: "🎯" },
                  { value: "left", label: "왼쪽 가운데", icon: "⬅️" },
                  { value: "right", label: "오른쪽 가운데", icon: "➡️" },
                ] as const
              ).map((p) => {
                const active = textPos === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => {
                      setTextPos(p.value);
                      saveTextPos(p.value);
                      flashSaved();
                    }}
                    aria-pressed={active}
                    style={active ? { background: accent } : undefined}
                    className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition ${
                      active ? "text-white shadow" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                    }`}
                  >
                    <span aria-hidden>{p.icon}</span>
                    {p.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] font-medium text-neutral-400">
              동화책에서 글이 그림의 어느 쪽에 얹힐지 골라요.
            </p>

            {/* 책장 한 줄 권수 — 넓은 화면에서만 의미가 있다.
                폰은 화면이 좁아 어차피 2권으로 맞춰지므로, 헷갈리지 않게 그 말을 적어 둔다. */}
            <h2 className="mt-1 text-sm font-extrabold text-neutral-400">책장 한 줄에</h2>
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
              컴퓨터 화면에서 한 줄에 몇 권씩 놓을지예요. 휴대폰에서는 화면이 좁아 2권으로 보여요.
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

          {/* ── 관리자(마스터) ── 회원 목록과 각 회원이 만든 책장을 열람한다.
              베타에선 이 기기에 저장된 회원만 보인다. Supabase가 붙으면 전체 회원이 뜬다. */}
          {master && (
            <section className="flex flex-col gap-2.5">
              <h2 className="text-sm font-extrabold text-amber-600">👑 관리자 · 회원 ({members.length})</h2>
              <p className="-mt-1 text-xs font-medium text-neutral-400">
                가입한 회원과 각자 만든 동화·부모 목소리 등록 여부를 볼 수 있어요. 회원을 누르면 그 사람의 책장이 펼쳐져요.
              </p>

              {/* ── 옛 책 삽화 옮기기 ── 한 번만 돌리면 되는 정리 작업.
                  예전 책은 그림이 DB 안에 들어 있어 열 때마다 전송량이 나간다.
                  정리가 끝나면(0권) 칸 자체를 감춘다 — 할 일이 없는데 버튼이 남아
                  있으면 "왜 아직 있지?" 하고 다시 누르게 된다. */}
              {oldArtCount !== 0 && (
                <div className="flex flex-col gap-2 rounded-2xl bg-amber-50 px-4 py-3">
                  <p className="text-xs font-extrabold text-amber-700">
                    🧹 옛 책 그림 정리
                    {oldArtCount > 0 && ` · ${oldArtCount}권 남음`}
                  </p>
                  <p className="text-[11px] font-medium leading-relaxed text-amber-700/80">
                    예전에 만든 동화는 그림이 데이터베이스 안에 들어 있어, 책을 열 때마다 전송량이 나가요.
                    그림을 이미지 호스팅으로 옮기면 전송량이 거의 안 나가고 책도 빨리 열려요.
                    <b> 한 번만 누르면 되고, 중간에 멈춰도 옮긴 데까지는 그대로 남아요.</b>
                  </p>
                  {migrating ? (
                    <p className="text-xs font-bold text-amber-800">
                      {migrating.bookNo} / {migrating.bookCount}권 · {migrating.title}
                      {migrating.imageCount > 0 && ` (그림 ${migrating.imageDone}/${migrating.imageCount}장)`}
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={migrateOldArt}
                      className="self-start rounded-full bg-amber-500 px-4 py-2 text-xs font-extrabold text-white shadow-sm"
                    >
                      그림 옮기기 시작
                    </button>
                  )}
                  {migrateDone && <p className="text-xs font-bold text-amber-800">{migrateDone}</p>}
                </div>
              )}
              {/* 다 끝났는데 방금 돌린 결과는 알려 준다(칸이 사라져도 결과는 남게). */}
              {oldArtCount === 0 && migrateDone && (
                <p className="rounded-2xl bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-700">
                  ✅ {migrateDone}
                </p>
              )}
              {members.length === 0 ? (
                <p className="rounded-2xl bg-neutral-100 px-4 py-3 text-sm font-bold text-neutral-500">
                  아직 가입한 회원이 없어요.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {members.map((m) => {
                    const open = openMember === m.id;
                    const books = memberBooks[m.id] ?? [];
                    // 부모 목소리 등록 여부 — 등록했으면 또렷하게, 아니면 흐리게.
                    const voices = memberVoices[m.id] ?? [];
                    const hasMom = voices.includes("mom");
                    const hasDad = voices.includes("dad");
                    return (
                      <li key={m.id} className="overflow-hidden rounded-2xl bg-neutral-100">
                        <button
                          type="button"
                          onClick={() => toggleMember(m.id)}
                          className="flex w-full items-center gap-2 px-4 py-3 text-left"
                        >
                          <span className="flex-1 truncate text-sm font-extrabold text-neutral-800">
                            {m.username}
                          </span>
                          {/* 만든 동화 개수 — 한눈에 누가 얼마나 만들었는지 보인다. */}
                          <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-bold text-neutral-500">
                            동화 {books.length}
                          </span>
                          {/* 엄마·아빠 목소리 등록 여부 — 색이 들어오면 등록된 것.
                              회색이면 아직 안 만든 것이라, 줄을 훑기만 해도 구분된다. */}
                          <span
                            className="flex shrink-0 items-center gap-1"
                            title={`부모 목소리 — 엄마 ${hasMom ? "등록" : "없음"} · 아빠 ${hasDad ? "등록" : "없음"}`}
                          >
                            <span
                              className={`rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${
                                hasMom ? "bg-rose-500 text-white" : "bg-neutral-200 text-neutral-400"
                              }`}
                            >
                              엄마
                            </span>
                            <span
                              className={`rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${
                                hasDad ? "bg-sky-500 text-white" : "bg-neutral-200 text-neutral-400"
                              }`}
                            >
                              아빠
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-neutral-500">
                            <span aria-hidden className="inline-block rounded-full" style={{ width: 11, height: 11, background: "radial-gradient(circle at 35% 30%, #ffe08a, #e0a020)" }} />
                            {m.tokens}
                          </span>
                          <span className="shrink-0 text-neutral-400">{open ? "▲" : "▼"}</span>
                        </button>
                        {open && (
                          <div className="border-t border-neutral-200 bg-white px-4 py-2">
                            <p className="py-1 text-xs font-bold text-neutral-500">
                              부모 목소리 —{" "}
                              {hasMom || hasDad ? (
                                <span className="text-neutral-700">
                                  {[hasMom && "엄마", hasDad && "아빠"].filter(Boolean).join(" · ")} 등록됨
                                </span>
                              ) : (
                                <span className="font-medium text-neutral-400">아직 안 만들었어요</span>
                              )}
                            </p>
                            {books.length === 0 ? (
                              <p className="py-1 text-xs font-medium text-neutral-400">만든 동화가 없어요.</p>
                            ) : (
                              <ul className="flex flex-col divide-y divide-neutral-100">
                                {books.map((b) => (
                                  <li key={b.id} className="flex items-center gap-2 py-2">
                                    <span className="flex-1 truncate text-sm font-bold text-neutral-700">
                                      {b.title}
                                      {b.hidden && <span className="ml-1 text-[10px] text-neutral-400">(숨김)</span>}
                                    </span>
                                    <Link
                                      href={`/book/${b.id}`}
                                      className="shrink-0 rounded-full px-3 py-1 text-xs font-extrabold text-white"
                                      style={{ background: accent }}
                                    >
                                      열기
                                    </Link>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
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
    </div>
  );
}
