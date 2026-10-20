"use client";

/**
 * 우리 가족 캐릭터 — 가족을 사람마다 수채화 전신 1장으로 그려 '고정'하는 화면.
 *
 * 단계는 주소가 아니라 state 로 바꾼다(useSearchParams 는 배포 빌드에서 Suspense 오류가 난다).
 *   album    가족 모아 보기 — 누구 한 명이라도 그림(고정·확인 전)이 있거나 '특징만 저장'했으면 첫 화면
 *   members  누가 우리 가족인가요? — 그 밖(가족이 아이뿐 등)이면 첫 화면 (1/3)
 *   looks    생김새 고르기 (2/3) · 고치기(모아 보기에서). 회원의 아이·엄마·아빠 특징은 여기서만 고른다
 *            (설정의 특징 칸은 회원에게서 걷었다 — 사장님 2026-09-28).
 *   drawing  그리는 중 (3/3) — 서버 호출은 동시에 2명까지
 *   review   한 사람씩 확인 — 마음에 들어요 / 다시 그리기(두 장 비교)
 *   done     완성 — 단체 사진과 약속
 *
 * 데이터 규칙(lib/family.ts 머리글):
 *  - 아이·엄마·아빠 생김새는 ChildPrefs.looks / parents 가 원본 — family 에 복사하지 않는다.
 *  - 그림은 cafe24 주소만 저장한다(base64 금지).
 *  - 바꾸면 이 기기에는 늘 바로 쓴다(saveChild). 그림이 걸린 변경(그리기 결과·고정·빼기)은 saveFamilyNow 로
 *    바로 올리고 결과를 본다. 그 밖(사람 넣기·생김새)은 saveChild(800ms 뒤 서버). 서버에는 늘 서버 값과
 *    사람별로 합쳐 올라간다(prefs pushChild · family mergeFamily) — 다른 기기에서 그린 그림을 안 지운다.
 *  - 합칠 때 사람은 합집합이다. 빼기는 뺀 기록(familyRemoved)으로만 전한다 — 오래 열어 둔 이 화면의 옛 목록이
 *    다른 기기에서 넣고 고정한 사람을 지우지 않게. 화면으로 돌아오면(탭 전환) 계정 값을 다시 받는다.
 *  - 서버 값이 뒤늦게 와도 이 화면에서 고친 생김새 칸(looksEdits)만 지키고 나머지는 서버 값을 따른다.
 *  - 쿠키 셈과 차감은 서버가 한다. 화면의 값은 안내일 뿐이고(nextDrawCost), 요청에 실어 보내
 *    서버 값이 더 크면 깎지 않고 409(price)로 돌아온다 — 그때 확인 창을 다시 띄운다.
 *  - 관리실이 더해 준 '캐릭터 무료 생성'(사장님 2026-10-19, lib/member-credits — 캐릭터 생성 크레딧)은 쿠키가 드는 그리기에 먼저 쓴다. 확인 창이
 *    누구를 무료로 그릴지 정해(priceMembers) freePlanRef 에 적고, 그 사람 요청은 보낸 값 0 으로 간다 — 서버는 보낸 값이
 *    값보다 작을 때만 무료 횟수를 쓰므로 여러 명을 한꺼번에 그려도 화면에 보인 그대로 받는다. 남은 횟수는 응답(freeLeft)과
 *    그리기가 끝난 뒤 다시 읽기로 맞춘다.
 *  - '사진으로 할게요'(사장님 2026-09-29): 생김새 고르기에서 칩 대신 그 사람 사진 한 장을 고를 수 있다. 약속은
 *    "사진은 저장하지 않고, 그림을 그리는 데 한 번 쓰고 바로 지워요" — 사진은 이 화면의 메모리(photos state)에만
 *    두고 ChildPrefs·FamilyMember·saveChild·saveFamilyNow·localStorage 에 **절대 넣지 않는다.** 그리기 요청에 실어
 *    보내고(서버도 저장하지 않는다 — lib/family-photo.ts), 그 사람 그림을 고정하거나·사람을 빼거나·사진이 거절되거나·
 *    부모가 빼거나·화면을 떠나면(pagehide 포함) 사라진다. 같은 방문 안의 다시 그리기는 메모리의 사진을 다시 쓴다
 *    (그 사진이 거절돼 서버가 대신 그렸으면 다시 그리기는 skipPhotoDraw 로 사진 그리기를 건너뛴다 — photoSkipRef, 메모리만).
 *    사진을 고르면 칩 없이 곧바로 다음 사람, 마지막이면 쿠키 확인 창 — 값은 그 창의 버튼을 눌러야 나간다.
 *    사진으로 그린 그림에는 fromPhoto 표시만 남는다('모습이 바뀌었어요'를 띄우지 않는다). 값은 칩과 같다.
 *    사진과 칩은 겹치지 않는다(사장님 2026-10-14 "중복 설정으로 인한 오류"): 사진으로 그릴 때는 칩을 함께 보내지 않고
 *    (portraitRequest), 사진 그림을 고정하면 그 사람이 예전에 고른 칩을 비운다(clearPhotoFixedLooks — 읽을 때도
 *    lib/family dropPhotoFixedLooks 가 비운다). 그 뒤 칩을 고르면 '사진 대신 특징으로 다시 그릴지'를 묻는다(finishEdit).
 *  - 쿠키 확인 창의 '그림 없이 특징만 저장할게요'(saveLooksOnly)는 쿠키 0개 — 그리기 서버를 부르지 않는다.
 *    생김새는 고를 때마다 이미 저장됐고, 그 사람들에게 looksOnly 표시만 달아(생김새와 같은 saveChild) 모아 보기로 간다.
 *  - 그리기 응답을 잃으면(끊김·75초 초과·함수 잘림) 다시 그리기 전에 서버에 결과를 묻는다(recover).
 *    서버는 건넨 그림 주소를 남겨 두므로, 이미 그려졌으면 값을 또 내지 않고 그 그림을 받는다.
 *  - 그림을 받을 때 그때의 '늘 그대로'를 currentLockKey 로 적어 둔다(FamilyPortrait.lockKey). 모아 보기는
 *    지금 값(설정에서 바꾼 것 포함)과 견줘 '모습이 바뀌었어요'를 보인다 — 평소 옷·메모만 바꾸면 안 뜬다.
 *  - 순서는 ROLE_ORDER(아이 → 엄마 → 아빠 → 형제자매 → 할머니 → 할아버지 → 단짝 친구).
 *    단짝 친구는 한 명(canAddRole)이고 가족 명패·숫자에 안 든다. 명패는 ourChildrenNames 로(하온·하린이네 가족).
 *  - 모아 보기·완성 화면의 단체 사진은 홈과 같이 homeMembers('홈 가족 사진에 보이기'를 켠 고정된 사람).
 *  - 옷 갈아입기(사장님 2026-09-30 — lib/family-outfit, 모든 회원): 꾸미기 시트의 '옷 갈아입기' 줄 → 옷 고르기
 *    (OutfitPicker). 사람마다 받은 옷은 member.outfits 에(saveMemberOutfit — 사람 넣기·생김새와 같은 'soon' 저장), 가족이 입은
 *    테마·짝 배경은 사진관 값에(saveStudio). 돈이 들지 않는다(서버가 미리 그린 몸에 원래 머리를 얹기만 한다).
 */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { AddMemberSheet, type NewMember } from "@/components/family/AddMemberSheet";
import { AlbumView } from "@/components/family/AlbumView";
import { ConfirmSheet } from "@/components/family/ConfirmSheet";
import { DoneView } from "@/components/family/DoneView";
import { DrawingView } from "@/components/family/DrawingView";
import {
  displayName,
  hasPickedLooks,
  jobError,
  objectOf,
  portraitRequest,
  seasonLabel,
  type Job,
} from "@/components/family/family-ui";
import { HistorySheet, type RestoredPicture } from "@/components/family/HistorySheet";
import { LooksChangedSheet } from "@/components/family/LooksChangedSheet";
import { LooksView } from "@/components/family/LooksView";
import { MembersView } from "@/components/family/MembersView";
import { MemberSheet } from "@/components/family/MemberSheet";
import { OutfitPicker } from "@/components/family/OutfitPicker";
import { ReviewView } from "@/components/family/ReviewView";
import { StudioSheet } from "@/components/family/StudioSheet";
import { BigButton } from "@/components/family/ui";
import { fetchProfile, loadSession } from "@/lib/auth";
import { canCreateWith } from "@/lib/create-access";
import { loadMyPlanKey } from "@/lib/member-plan-client";
import { PlanLockSheet } from "@/components/family/PlanLockSheet";
import {
  byRoleOrder,
  CALL_NAMES,
  canAddRole,
  currentLockKey,
  currentLooksOf,
  drawPrice,
  dropPhotoFixedLooks,
  FAMILY_MAX_MEMBERS,
  familyTitle,
  FIXED_ID_ROLES,
  homeMembers,
  isPhotoFixed,
  pictureDecidesLooks,
  lockChanges,
  lockedLooksChanged,
  lockKeyChanged,
  lockKeyLooks,
  newMemberId,
  nextDrawCost,
  ourChildrenNames,
  priceMembers,
  ROLE_LABEL,
  type FamilyLooks,
  type FamilyMember,
  type FamilyPortrait,
  type FamilyRemoval,
  type FamilyRole,
} from "@/lib/family";
import { loadDevMode } from "@/lib/dev-mode-client";
import { loadFreeDraws } from "@/lib/member-credits-client";
import { cleanBodyStretch, cleanHeadRatio } from "@/lib/family-head";
import { historyFloor } from "@/lib/family-history";
import { withOutfit, type MemberOutfit, type OutfitThemeId } from "@/lib/family-outfit";
import { PHOTO_FALLBACK_NOTE, PHOTO_TOO_BIG_MESSAGE, readPhotoFallback } from "@/lib/family-photo";
import { newerStudio, type FamilyStudio } from "@/lib/family-studio";
import {
  loadChild,
  loadChildRemote,
  saveChild,
  saveFamilyNow,
  type ChildLooks,
  type ChildPrefs,
  type ParentLooks,
} from "@/lib/prefs";
import { authedFetch } from "@/lib/supabase";
import { useScreenWakeLock } from "@/lib/use-wake-lock";

type Step = "loading" | "noChild" | "album" | "members" | "looks" | "drawing" | "review" | "done";
type From = "members" | "album";

type LooksSession = {
  ids: string[];
  idx: number;
  mode: "fix" | "edit";
  from: From;
  /** 고치기 전 생김새 — '늘 그대로'가 바뀌었는지 견준다(그린 때 lockKey 가 없는 옛 그림일 때) */
  before?: FamilyLooks;
  /**
   * 그리던 중 사진이 거절돼 다시 고르러 왔다(그리기·확인 화면의 '다시 고르기') — 사진 쪽을 먼저 열고,
   * 쿠키 확인은 지금 차례에 더하고(inline), 뒤로 가면 그리는 화면으로.
   */
  resume?: boolean;
};

type Overlay =
  | { kind: "confirm"; ids: string[]; variant: "fix" | "redraw"; from: From; inline?: boolean }
  | { kind: "member"; id: string }
  | { kind: "add"; role?: FamilyRole; mode: From; key: number }
  /** fromAlbum: 모아 보기의 '모습이 바뀌었어요' 카드에서 열었다 — 다른 메뉴로 갈 길을 둔다 */
  | { kind: "changed"; id: string; diff: string[]; fromAlbum?: boolean }
  /** 예전 그림으로 돌아가기 — 그 사람을 그린 예전 그림 목록(HistorySheet) */
  | { kind: "history"; id: string }
  /** 가족 사진 꾸미기(가족 사진관 — 배경·스티커) */
  | { kind: "studio" }
  /** 옷 갈아입기(꾸미기 시트에서) */
  | { kind: "outfit" }
  | null;

/** 동시에 그리는 사람 수 — 서버·이미지 모델에 한꺼번에 몰리지 않게 */
const PARALLEL = 2;
/**
 * 그리기 요청을 이만큼 기다리면 끊는다 — 서버는 60초에 끝난다. 망이 조용히 끊겨 요청이 매달리면
 * 카드가 '그리는 중'에 갇힌다. 끊은 뒤에는 서버에 결과를 묻는다(recover).
 */
const REQUEST_TIMEOUT_MS = 75_000;
/** fe 시험 — 펜선 또렷한 수채화 스위치를 이 기기에 기억하는 열쇠 */
const PENLINE_KEY = "family-penline-test";

/** 응답을 잃은 뒤 서버에 결과를 묻는 시간 — 서버가 90초 넘은 미완성 그리기를 되돌리므로 그 뒤까지 */
const RECOVER_MS = 100_000;
const RECOVER_EVERY_MS = 5_000;

/** 서버(GET /api/family/portrait)가 알려 준 한 사람의 형편 */
type Status = {
  draws: number;
  pending: boolean;
  refunded: boolean;
  pic: { url: string; ref: string; at: string; transparent: boolean; headRatio?: number; bodyStretch?: number } | null;
  tokens: number | null;
};

const https = (u: unknown): u is string => typeof u === "string" && /^https:\/\//.test(u) && u.length <= 500;

function readStatus(data: unknown): Status | null {
  const d = data as Record<string, unknown> | null;
  if (!d || typeof d !== "object" || typeof d.draws !== "number") return null;
  const p = d.pic as Record<string, unknown> | null | undefined;
  // 서버가 잰 머리 비율·굽기 때 늘인 몸 배율(lib/family-head) — 믿을 범위의 숫자만
  const headRatio = cleanHeadRatio(p?.headRatio);
  const bodyStretch = cleanBodyStretch(p?.bodyStretch);
  return {
    draws: d.draws,
    pending: d.pending === true,
    refunded: d.refunded === true,
    pic:
      p && https(p.url) && https(p.ref)
        ? {
            url: p.url,
            ref: p.ref,
            at: typeof p.at === "string" ? p.at : "",
            transparent: p.transparent !== false,
            ...(headRatio !== undefined ? { headRatio } : {}),
            ...(bodyStretch !== undefined ? { bodyStretch } : {}),
          }
        : null,
    tokens: typeof d.tokens === "number" ? d.tokens : null,
  };
}

/** 이 사람의 형편을 서버에 한 번 묻는다. 못 물었으면 null. */
async function fetchStatus(id: string): Promise<Status | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await authedFetch(`/api/family/portrait?memberId=${encodeURIComponent(id)}`, {
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    return readStatus(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 아이 항목이 없으면 넣고, 이름이 바뀌었으면 호칭을 맞춘다 */
function withChild(fam: FamilyMember[], name: string): FamilyMember[] {
  const nm = name.trim().slice(0, 12);
  if (!nm) return fam;
  if (fam.some((m) => m.id === "child")) {
    return fam.map((m) => (m.id === "child" ? { ...m, role: "child" as const, callName: nm } : m));
  }
  return [{ id: "child", role: "child", callName: nm }, ...fam];
}

/** 모아 보기가 첫 화면인가 — 그림(고정·확인 전)이 있거나 '특징만 저장'한 사람이 있으면 */
function hasAlbum(fam: FamilyMember[]): boolean {
  return fam.some((m) => m.portrait || m.draft || m.looksOnly);
}

function firstStep(fam: FamilyMember[], c: ChildPrefs | null): Step {
  if (!c || !c.name.trim()) return "noChild";
  return hasAlbum(fam) ? "album" : "members";
}

/** 빈 값을 빼고 순서를 맞춘 글자 — '뭐라도 바뀌었나' 견주기용 */
function looksKey(o: object | undefined): string {
  return JSON.stringify(
    Object.entries(o ?? {})
      .filter(([, v]) => v !== undefined && v !== "" && v !== false && !(Array.isArray(v) && v.length === 0))
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

export default function FamilyPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const colors = theme.colors;

  const [step, setStep] = useState<Step>("loading");
  const [child, setChild] = useState<ChildPrefs | null>(null);
  const [family, setFamily] = useState<FamilyMember[]>([]);
  const [tokens, setTokens] = useState(0);
  /** 관리실이 더해 준 무료 생성 남은 횟수(관리자는 0 — 원래 값이 안 나간다) */
  const [freeDraws, setFreeDraws] = useState(0);
  const [master, setMaster] = useState(false);
  /**
   * 결제 요금제가 없어 그리기가 막힌 회원 — 확인 창(값) 대신 잠금 안내를 띄운다(components/family/PlanLockSheet, 2026-10-20).
   * 서버(/api/family/portrait)가 같은 문(lib/create-access)으로 막는다. 보기·옷 바꾸기·예전 그림은 그대로 쓴다.
   */
  const [planLocked, setPlanLocked] = useState(false);
  /** 개발자 모드(fe) — 펜선 끄기(예전 수채화 비교) 스위치를 보인다. 서버도 끄기는 fe 만 받는다(lib/dev-mode). */
  const [dev, setDev] = useState(false);
  /** fe 비교용 — 펜선 또렷한 수채화로 그리기(모두의 기본. fe 만 끌 수 있고, 끈 값은 이 기기에 기억한다) */
  const [penline, setPenline] = useState(true);
  const [looks, setLooks] = useState<LooksSession | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [round, setRound] = useState<{ ids: string[]; from: From }>({ ids: [], from: "members" });
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const [reviewIdx, setReviewIdx] = useState(0);
  const [stamp, setStamp] = useState("");
  const [toast, setToast] = useState<{ text: string; n: number } | null>(null);
  const [localOnly, setLocalOnly] = useState(false);

  // 비동기(그리기 결과·저장)가 늘 최신 값을 보도록 ref 에도 둔다. 화면은 state 를 본다.
  const familyRef = useRef<FamilyMember[]>([]);
  const childRef = useRef<ChildPrefs | null>(null);
  const masterRef = useRef(false);
  /** 확인 창에서 무료 생성으로 정한 사람 — 그 사람 요청은 보낸 값 0 으로 간다. 받으면·값이 바뀌면(price) 지운다. */
  const freePlanRef = useRef<Set<string>>(new Set());
  /** 그리기 요청이 늘 지금 스위치를 보게 — fe 일 때만 요청에 싣는다(다른 회원은 서버 기본 = 펜선) */
  const penlineRef = useRef(true);
  const devRef = useRef(false);
  /** 부모가 한 번이라도 만졌나(단계 이동 포함) — 뒤늦게 온 서버 값이 첫 화면을 바꾸거나 방금 한 것을 덮지 않게 */
  const touched = useRef(false);
  /**
   * 이 화면에서 **고친** 생김새 칸만(아이·엄마·아빠) — 서버 값이 뒤늦게 오면 그 위에 이것만 얹는다.
   * 안 고친 칸은 서버 값(다른 기기에서 고른 특징)을 따른다. 마운트 때 읽은 옛 값으로 덮지 않게(absorbRemote).
   */
  const looksEdits = useRef<{ child?: Partial<ChildLooks>; mom?: Partial<ParentLooks>; dad?: Partial<ParentLooks> }>({});
  const queue = useRef<string[]>([]);
  const active = useRef(0);
  /** 지금 서버에 그리기를 부른 사람 — 같은 사람을 겹쳐 부르면 앞 것이 409 로 버려지고 값은 안 돌아온다 */
  const inflight = useRef(new Set<string>());
  const saving = useRef({ running: false, again: false });
  const addSeq = useRef(0);
  /** 응답을 잃은 사람 — 다시 그리기 전에 먼저 서버에 결과를 묻는다(이미 그려졌으면 또 값을 내지 않게) */
  const resumeFirst = useRef(new Set<string>());
  /**
   * 이번 방문에 고른 사진 — 사람 id → 줄인 JPEG data URL. **메모리에만 둔다**: ChildPrefs·FamilyMember·saveChild·
   * saveFamilyNow·localStorage 어디에도 넣지 않는다(약속 — 사진은 저장하지 않고, 그리는 데 한 번 쓰고 바로 지운다).
   * 화면은 state 를, 비동기 그리기(drawOne)는 ref 를 본다.
   */
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const photosRef = useRef<Record<string, string>>({});
  /**
   * 이번 방문에 사진이 거절돼 서버가 대신 그린 사람 id — 다시 그리기는 사진 그리기를 건너뛰게(skipPhotoDraw) 알린다
   * (또 거절될 사진 그리기에 구글 값·시간을 쓰지 않는다). 메모리에만 두고, 그 사람 사진이 바뀌거나 빠지면 지운다.
   */
  const photoSkipRef = useRef<Set<string>>(new Set());

  /** 사진을 넣거나(data URL) 뺀다(null) — 메모리에서만 */
  function setPhoto(id: string, photo: string | null) {
    const cur = photosRef.current;
    if (photo ? cur[id] === photo : !(id in cur)) return;
    photoSkipRef.current.delete(id);
    const next = { ...cur };
    if (photo) next[id] = photo;
    else delete next[id];
    photosRef.current = next;
    setPhotos(next);
  }

  // 화면을 떠나면(다른 주소로·탭 닫기·앞뒤 캐시에 얼려 둘 때도) 사진을 바로 버린다.
  // 앱 안에서 다른 화면으로 가면 이 화면이 통째로 내려가 state 와 함께 사라진다.
  useEffect(() => {
    const drop = () => {
      photosRef.current = {};
      photoSkipRef.current.clear();
      setPhotos({});
    };
    window.addEventListener("pagehide", drop);
    return () => window.removeEventListener("pagehide", drop);
  }, []);

  /* ───────────────────────── 불러오기 ───────────────────────── */

  const adopt = useCallback((c: ChildPrefs | null): FamilyMember[] => {
    childRef.current = c;
    setChild(c);
    const fam = withChild(c?.family ?? [], c?.name ?? "");
    familyRef.current = fam;
    setFamily(fam);
    return fam;
  }, []);

  /**
   * 부모가 이미 만지기 시작한 뒤 서버 값(loadChildRemote — 서버 값과 이 기기 값을 합친 것)을 들인다.
   *  - 가족 목록은 받은 것을 쓴다 — 이 화면은 저장할 때마다 이 기기 값을 바로 써 두므로 방금 한 것도 들어 있고,
   *    다른 기기에서 넣거나 쿠키를 내고 그린 사람도 들어 있다.
   *  - 아이·엄마·아빠 생김새는 받은 값을 쓰고, 이 화면에서 고친 칸(looksEdits)만 그 위에 얹는다. 고친 게 없으면
   *    생김새는 저장하지 않는다 — 마운트 때 읽은 옛 값으로 다른 기기에서 고른 특징을 지우지 않게(2026-09-28 검토).
   */
  const absorbRemote = useCallback((remote: ChildPrefs) => {
    const edits = looksEdits.current;
    const looks: ChildLooks | undefined = edits.child ? { ...(remote.looks ?? {}), ...edits.child } : remote.looks;
    let parents = remote.parents;
    if (edits.mom || edits.dad) {
      const p: NonNullable<ChildPrefs["parents"]> = { ...(remote.parents ?? {}) };
      for (const role of ["mom", "dad"] as const) {
        const e = edits[role];
        if (e) p[role] = { ...(remote.parents?.[role] ?? {}), ...e };
      }
      parents = p;
    }
    const fam = withChild(remote.family ?? familyRef.current, remote.name);
    // 가족 사진관 — 나중에 꾸민 쪽(at). 받은 값은 이미 서버·이 기기 중 새것이고(loadChildRemote), 받는 사이 이 화면에서
    // 꾸민 게 더 새것이면 그것. 다른 기기에서 나중에 꾸민 값은 받은 값이 이긴다(이 화면의 옛 값으로 되돌리지 않는다).
    const familyStudio = newerStudio(remote.familyStudio, childRef.current?.familyStudio);
    const next: ChildPrefs = { ...remote, looks, parents, family: fam, familyStudio };
    childRef.current = next;
    setChild(next);
    if (JSON.stringify(fam) !== JSON.stringify(familyRef.current)) {
      familyRef.current = fam;
      setFamily(fam);
    }
    // 저장은 달라진 것만 — 받은 값은 loadChildRemote 가 이미 이 기기에 써 두었다.
    const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    const patch: Partial<ChildPrefs> = {};
    if (edits.child && !same(looks, remote.looks)) patch.looks = looks;
    if ((edits.mom || edits.dad) && !same(parents, remote.parents)) patch.parents = parents;
    if (!same(fam, remote.family)) patch.family = fam;
    if (!same(familyStudio, remote.familyStudio)) patch.familyStudio = familyStudio;
    if (Object.keys(patch).length > 0) saveChild({ name: remote.name, ...patch });
  }, []);

  // 저장된 아이·가족은 이 기기(localStorage)에 있어 마운트 뒤에 읽는다 — 서버 HTML 과
  // 첫 렌더를 같게 하려고. 세션 확인(네트워크)을 기다리지 않고 바로 채운다.
  /* eslint-disable react-hooks/set-state-in-effect -- localStorage 는 마운트 뒤에만 읽을 수 있다 */
  useEffect(() => {
    adopt(loadChild());
  }, [adopt]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    let alive = true;
    (async () => {
      const s = await loadSession();
      if (!alive) return;
      // 로그인한 회원만 — 그림은 쿠키가 들고, 게스트는 계정이 없다.
      if (!s.uid || s.guest) {
        router.replace("/login");
        return;
      }
      setTokens(s.profile?.tokens ?? 0);
      setMaster(s.isMaster);
      masterRef.current = s.isMaster;
      if (!s.isMaster) {
        void loadFreeDraws().then((n) => {
          if (alive) setFreeDraws(n);
        });
        void loadMyPlanKey(s.uid).then((key) => {
          if (alive) setPlanLocked(!canCreateWith(false, key ? { plan: key, ends_at: null } : null, Date.now()));
        });
      }
      // fe 비교 스위치 — 개발자 모드일 때만 보이고 처음엔 켜져 있다(펜선이 모두의 기본). 끈 값은 이 기기에 기억한다
      void loadDevMode().then((d) => {
        if (!alive || !d) return;
        devRef.current = true;
        setDev(true);
        let on = false;
        try {
          on = localStorage.getItem(PENLINE_KEY) !== "0";
        } catch {
          on = true;
        }
        penlineRef.current = on;
        setPenline(on);
      });
      if (!touched.current) setStep(firstStep(familyRef.current, childRef.current));
      // 다른 기기에서 고정한 가족도 보이게 계정 값을 받아 온다.
      const remote = await loadChildRemote().catch(() => null);
      if (!alive || !remote) return;
      if (!touched.current) {
        const fam = adopt(remote);
        setStep(firstStep(fam, remote));
        return;
      }
      // 부모가 이미 만지기 시작했다(단계 이동만 해도) — 가족은 합친 값을, 생김새는 고친 칸만 지켜 들인다.
      absorbRemote(remote);
    })();
    return () => {
      alive = false;
    };
  }, [router, adopt, absorbRemote]);

  /*
   * 오래 열어 둔 화면으로 돌아오면(탭 전환·앱 복귀) 계정 값을 다시 받는다 — 그사이 다른 기기에서 넣거나
   * 쿠키를 내고 고정한 사람이 이 화면에도 보이게. 너무 잦지 않게 15초에 한 번까지.
   */
  useEffect(() => {
    let alive = true;
    let last = Date.now();
    const refresh = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 15_000) return;
      last = Date.now();
      if (!masterRef.current) {
        void loadFreeDraws().then((n) => {
          if (alive) setFreeDraws(n);
        });
      }
      loadChildRemote()
        .then((remote) => {
          if (alive && remote && childRef.current) absorbRemote(remote);
        })
        .catch(() => {});
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [absorbRemote]);

  /* ───────────────────────── 저장 ───────────────────────── */

  /** 바로 저장(서버 확인). 연달아 불려도 한 번에 하나씩, 마지막 값까지 올린다. */
  async function saveNow() {
    const s = saving.current;
    if (s.running) {
      s.again = true;
      return;
    }
    s.running = true;
    try {
      do {
        s.again = false;
        /*
         * saveChild 는 부른 때의 값을 들고 800ms 뒤에 서버·계정 백업에 쓴다. 방금 사람 넣기·생김새로
         * 걸어 둔 그 예약이 이 저장 뒤에 돌면 옛 가족 목록(새 그림 없음)으로 덮어 버린다 — 이 기기의
         * 계정 키까지. 그래서 예약을 지금 목록으로 갈아 끼운 뒤 바로 저장한다(뒤늦게 돌아도 같은 값).
         */
        const c = childRef.current;
        if (c) saveChild({ name: c.name, family: familyRef.current });
        const ok = await saveFamilyNow(familyRef.current);
        setLocalOnly(!ok);
        if (ok && !s.again) {
          // 서버 값과 사람별로 합친 결과(다른 기기에서 그린 그림 등)를 화면에도 들인다.
          // 기다리는 사이 부모가 또 바꿨으면(again) 들이지 않는다 — 다음 바퀴가 그 값으로 다시 올린다.
          const merged = loadChild()?.family;
          if (merged) {
            const fam = withChild(merged, c?.name ?? "");
            if (JSON.stringify(fam) !== JSON.stringify(familyRef.current)) {
              familyRef.current = fam;
              setFamily(fam);
            }
          }
        }
      } while (s.again);
    } finally {
      s.running = false;
    }
  }

  /** removed — 방금 뺀 사람 기록. 빼기는 이 기록으로만 다른 기기·서버에 전해진다(lib/family mergeFamily). */
  function commit(next: FamilyMember[], how: "now" | "soon", removed?: FamilyRemoval[]) {
    touched.current = true;
    familyRef.current = next;
    setFamily(next);
    // 이 기기에는 **늘 바로** 쓴다 — 'now' 저장이 앞 저장을 기다리는 사이(again) 앱을 닫아도
    // 쿠키를 내고 받은 그림이 이 기기에는 남게. 서버에는 saveChild 가 800ms 뒤에 합쳐 올린다.
    const c = childRef.current;
    if (c) saveChild({ name: c.name, family: next, ...(removed ? { familyRemoved: removed } : {}) });
    if (how === "now") void saveNow();
  }

  function patchMember(id: string, fn: (m: FamilyMember) => FamilyMember, how: "now" | "soon") {
    commit(
      familyRef.current.map((m) => (m.id === id ? fn(m) : m)),
      how,
    );
  }

  const findMember = (id: string) => familyRef.current.find((m) => m.id === id);

  /* ───────────────────────── 화면 이동·알림 ───────────────────────── */

  function go(s: Step) {
    touched.current = true;
    setStep(s);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }

  function showToast(text: string) {
    setToast((t) => ({ text, n: (t?.n ?? 0) + 1 }));
  }
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  /* ───────────────────────── 생김새 ───────────────────────── */

  function setChildLooks(p: Partial<ChildLooks>) {
    const c = childRef.current;
    if (!c) return;
    const nextLooks: ChildLooks = { ...(c.looks ?? {}), ...p };
    const next = { ...c, looks: nextLooks };
    childRef.current = next;
    setChild(next);
    touched.current = true;
    // 고친 칸을 기억해 둔다 — 서버 값이 뒤늦게 와도 이 칸만 지킨다(absorbRemote).
    looksEdits.current = { ...looksEdits.current, child: { ...looksEdits.current.child, ...p } };
    // 다른 칸(눈매·늘 지니는 것 …)은 그대로 두고 고른 칸만 바꿔 넘긴다 — 설정 화면과 같은 데이터.
    saveChild({ name: c.name, looks: nextLooks });
  }

  function setParentLooks(role: "mom" | "dad", p: Partial<ParentLooks>) {
    const c = childRef.current;
    if (!c) return;
    // 다른 쪽 부모 값은 보존한다.
    const parents = { ...(c.parents ?? {}), [role]: { ...(c.parents?.[role] ?? {}), ...p } };
    const next = { ...c, parents };
    childRef.current = next;
    setChild(next);
    touched.current = true;
    looksEdits.current = { ...looksEdits.current, [role]: { ...looksEdits.current[role], ...p } };
    saveChild({ name: c.name, parents });
  }

  /** 가족 사진관(배경·스티커) — 꾸미기 시트가 바꿀 때마다. 이 기기에 바로, 서버는 800ms 뒤(saveChild). */
  function saveStudio(s: FamilyStudio) {
    const c = childRef.current;
    if (!c) return;
    touched.current = true;
    const next = { ...c, familyStudio: s };
    childRef.current = next;
    setChild(next);
    saveChild({ name: c.name, familyStudio: s });
  }

  function setMemberLooks(id: string, p: Partial<FamilyLooks>) {
    patchMember(id, (m) => ({ ...m, looks: { ...(m.looks ?? {}), ...p } }), "soon");
  }

  /**
   * 옷 갈아입기 — 한 사람의 테마 옷 한 벌을 받았다. 지금 얼굴 그림에서 만든 옷만 넣고(withOutfit — 옛 얼굴 옷은 같이 치운다),
   * 사람 넣기·생김새처럼 'soon'(이 기기에 바로, 서버는 800ms 뒤 서버 값과 합쳐서 — 옷 시트를 닫으면 바로 올린다).
   */
  function saveMemberOutfit(id: string, theme: OutfitThemeId, outfit: MemberOutfit) {
    patchMember(id, (m) => withOutfit(m, theme, outfit), "soon");
  }

  function startLooks(ids: string[], mode: "fix" | "edit", from: From, resume = false) {
    const first = findMember(ids[0]);
    setLooks({
      ids,
      idx: 0,
      mode,
      from,
      before: mode === "edit" && first ? currentLooksOf(first, childRef.current) : undefined,
      ...(resume ? { resume: true } : {}),
    });
    setOverlay(null);
    go("looks");
  }

  /** 그림이 있는 사람이면 '다시 그리기' 값, 없으면 '고정' 값으로 묻는다 */
  const confirmVariant = (id: string): "fix" | "redraw" => {
    const m = findMember(id);
    return m && (m.portrait || m.draft) ? "redraw" : "fix";
  };

  function looksNext() {
    if (!looks) return;
    if (looks.idx < looks.ids.length - 1) {
      setLooks({ ...looks, idx: looks.idx + 1 });
      if (typeof window !== "undefined") window.scrollTo({ top: 0 });
      return;
    }
    if (looks.mode === "fix") {
      if (looks.resume) {
        // 거절된 사진 대신 다시 골라 왔다 — 지금 그리는 차례에 더한다(inline). 쿠키 확인은 그대로 거친다.
        setOverlay({ kind: "confirm", ids: looks.ids, variant: confirmVariant(looks.ids[0]), from: looks.from, inline: true });
        return;
      }
      setOverlay({ kind: "confirm", ids: looks.ids, variant: "fix", from: looks.from });
      return;
    }
    finishEdit();
  }

  /**
   * 사진을 골랐다 — 칩 없이 곧바로 다음 사람, 마지막(또는 혼자)이면 쿠키 확인 창을 연다(사장님 2026-09-29).
   * 값은 그 창의 '쿠키 N개로 그리기'를 눌러야 나간다 — 확인 창은 건너뛰지 않는다.
   * 고치기(모아 보기에서 연 생김새 고치기)에서 고르면 이 사람을 사진으로 (다시) 그릴지 바로 묻는다.
   */
  function photoReady(id: string) {
    if (!looks || !looks.ids.includes(id)) return;
    if (looks.mode === "fix") {
      looksNext();
      return;
    }
    setOverlay({ kind: "confirm", ids: [id], variant: confirmVariant(id), from: looks.from });
  }

  /** 생김새 고치기 끝 — '늘 그대로'가 바뀐 고정된 사람만 다시 그릴지 묻는다(평소 옷·메모만이면 안 묻는다) */
  function finishEdit() {
    const m = looks ? findMember(looks.ids[0]) : undefined;
    go("album");
    if (!m || !looks) return;
    const c = childRef.current;
    const before: FamilyLooks = looks.before ?? {};
    const after = currentLooksOf(m, c);
    // 그린 그림에 그때 생김새(lockKey)가 적혀 있으면 그것과 견준다 — '나중에'로 미룬 뒤 또 고쳐도,
    // 설정에서 먼저 바꿨어도 정확하게. 예전 글자(짧은 머리→숏컷)·칸 순서 차이는 바뀐 것으로 안 친다.
    const drawn = m.draft ?? m.portrait;
    const drawnKey = drawn?.lockKey;
    const drawnLooks = drawnKey !== undefined ? lockKeyLooks(drawnKey) : before;
    const anyChanged = looksKey(before) !== looksKey(after);
    /*
     * 사진으로 그렸거나 예전 그림으로 되돌린 그림은 그림이 모습을 정했고, 그 사람의 칩은 쓰지 않는다
     * (lib/family dropPhotoFixedLooks, 2026-10-14). 그래서 여기서 특징을 골랐다면 '그 그림 대신 이 특징으로 다시 그리겠다'는
     * 뜻일 때만 쓸모가 있다 — 무엇을 골랐든 다시 그릴지 묻는다. 안 그리면 지금 모습 그대로이고 고른 특징은 쓰이지 않는다
     * (아래 '나중에' 알림).
     */
    const fromPicture = drawn?.fromPhoto === true || drawn?.restored === true;
    const lockChanged = fromPicture
      ? anyChanged
      : drawnKey !== undefined
        ? lockKeyChanged(drawnKey, m, c)
        : lockedLooksChanged(before, after, m.role);
    if (m.portrait || m.draft) {
      if (lockChanged) {
        const diff = lockChanges(m.role, fromPicture ? before : drawnLooks, after);
        setOverlay({
          kind: "changed",
          id: m.id,
          diff: diff.length > 0 ? diff : [fromPicture ? "지금 그림 대신 고른 특징으로" : "생김새가 바뀌었어요"],
        });
      } else if (anyChanged) {
        showToast("다시 그리지 않아도 돼요 — 옷은 이야기마다 바뀌어요");
      }
    } else if (anyChanged) {
      showToast("생김새를 저장했어요");
    }
  }

  /** '모습이 바뀌었어요' 카드(모아 보기) — 그릴 때 생김새와 지금 생김새를 견줘 다시 그릴지 묻는다 */
  function openChanged(id: string) {
    const m = findMember(id);
    if (!m) return;
    const diff = lockChanges(m.role, lockKeyLooks(m.portrait?.lockKey), currentLooksOf(m, childRef.current));
    setOverlay({ kind: "changed", id, diff: diff.length > 0 ? diff : ["생김새가 바뀌었어요"], fromAlbum: true });
  }

  /**
   * '그림 없이 특징만 저장할게요'(쿠키 확인 창의 둘째 선택) — 쿠키 0개. 그리기 서버(api/family/portrait)는
   * 부르지 않는다(queueDraw·startRound·recover 를 거치지 않는다).
   * 생김새는 고를 때마다 이미 저장됐다(아이·엄마·아빠 saveChild, 그 밖 member.looks patchMember). 여기서는 그림도
   * 확인 전 그림도 없는 사람에게 '특징만 저장됨'(looksOnly)을 달고 모아 보기로 간다 — 그림이 걸린 변경이 아니라서
   * 생김새와 같이 'soon'(saveChild — 이 기기에 바로, 서버에는 800ms 뒤 서버 값과 합쳐서). 얼굴 고정은 나중에
   * 모아 보기의 '얼굴 고정하기'(쿠키)로 한다. 동화에서는 그림이 없는 사람이라 이 특징으로 새로 그린다.
   */
  function saveLooksOnly(ids: string[]) {
    const pick = new Set(ids);
    const fam = familyRef.current;
    const mark = (m: FamilyMember) => pick.has(m.id) && !m.portrait && !m.draft && !m.looksOnly;
    if (fam.some(mark)) commit(fam.map((m) => (mark(m) ? { ...m, looksOnly: true } : m)), "soon");
    // 그리지 않으니 고른 사진은 쓸 데가 없다 — 바로 버린다(특징만 남는다).
    for (const id of ids) setPhoto(id, null);
    setOverlay(null);
    go("album");
    showToast("특징만 저장했어요 · 쿠키는 쓰지 않았어요");
  }

  /* ───────────────────────── 가족 넣기·빼기 ───────────────────────── */

  /** 식구 수 상한(저장 안전판) — 넘기면 말없이 잘리지 않게 여기서 막고 알린다 */
  function roomLeft(): boolean {
    if (familyRef.current.length < FAMILY_MAX_MEMBERS) return true;
    showToast(`가족은 ${FAMILY_MAX_MEMBERS}명까지 넣을 수 있어요`);
    return false;
  }

  function addPreset(role: "mom" | "dad" | "grandma" | "grandpa") {
    const fam = familyRef.current;
    // 넣은 때 — 엄마·아빠는 id 가 늘 같아서, 예전에 뺀 기록이 다시 넣은 사람을 지우지 않게 적어 둔다.
    const addedAt = new Date().toISOString();
    if (role === "mom" || role === "dad") {
      if (fam.some((m) => m.id === role)) return;
      if (!roomLeft()) return;
      commit([...fam, { id: role, role, callName: ROLE_LABEL[role], addedAt }], "soon");
      return;
    }
    if (!roomLeft()) return;
    const names = CALL_NAMES[role] ?? [ROLE_LABEL[role]];
    const callName = names.find((c) => !fam.some((m) => m.role === role && m.callName === c)) ?? names[0];
    commit([...fam, { id: newMemberId(), role, callName, addedAt }], "soon");
  }

  function addMember(nm: NewMember, mode: From) {
    if (!roomLeft()) return;
    const fam = familyRef.current;
    // 엄마·아빠·단짝 친구는 한 명뿐 — 시트가 막지만 다른 기기 값이 먼저 들어왔을 수 있어 한 번 더 본다.
    if (!canAddRole(fam, nm.role)) {
      showToast(nm.role === "friend" ? "단짝 친구는 한 명만 넣을 수 있어요" : `${ROLE_LABEL[nm.role]}는 이미 있어요`);
      return;
    }
    // 엄마·아빠는 고정 id(서버 결제 기록 열쇠) — 새로 만들지 않는다.
    const id = FIXED_ID_ROLES.includes(nm.role) ? nm.role : newMemberId();
    const m: FamilyMember = { ...nm, id, addedAt: new Date().toISOString() };
    commit([...fam, m], "soon");
    setOverlay(null);
    showToast(
      nm.role === "friend"
        ? // 이름은 선택이다 — 없으면 '단짝 친구를 단짝 친구로'가 되지 않게 나눈다.
          m.name
          ? `${objectOf(m)} 단짝 친구로 넣었어요`
          : "단짝 친구를 넣었어요"
        : mode === "album"
          ? `${objectOf(m)} 우리 가족에 넣었어요`
          : `${objectOf(m)} 넣었어요`,
    );
  }

  function removeMember(id: string) {
    const m = findMember(id);
    if (!m || m.role === "child") return;
    // 뺀 기록을 남긴다 — 다른 기기·서버 목록과 합칠 때 이 사람만 빠진다(목록 전체가 이기고 지지 않게).
    // 그림이 걸렸을 수 있어 바로 저장한다(다른 기기에서 되살아나지 않게).
    commit(
      familyRef.current.filter((x) => x.id !== id),
      m.portrait || m.draft ? "now" : "soon",
      [{ id, at: new Date().toISOString() }],
    );
    setPhoto(id, null);
    setOverlay(null);
    if (step === "album") showToast(m.role === "friend" ? `${objectOf(m)} 뺐어요` : `${objectOf(m)} 우리 가족에서 뺐어요`);
  }

  /** '홈 가족 사진에 보이기' — 끔(false)도 저장한다. 처음 값이 역할마다 달라서(가족 켬·단짝 친구 끔). */
  function setShowOnHome(id: string, on: boolean) {
    patchMember(id, (m) => ({ ...m, showOnHome: on }), "soon");
  }

  /**
   * '우리 아이예요'(형제자매만) — 켜면 명패에 이름이 같이 선다. 명패엔 진짜 이름만 서서(lib/family ourChildrenNames)
   * 이름 없는 형제는 켜지 않는다(사람 메뉴가 먼저 이름을 받는다 — 여기는 안전판).
   */
  function setOurChild(id: string, on: boolean) {
    patchMember(
      id,
      (m) => (m.role === "sibling" && (!on || (m.name ?? "").trim()) ? { ...m, isOurChild: on ? true : undefined } : m),
      "soon",
    );
  }

  /**
   * 이름 저장(형제자매·단짝 친구, 사람 메뉴) — 빈 글자면 이름 없음. ourChild 면 '우리 아이예요'도 같이 켠다(한 번에).
   * '우리 아이'인 형제의 이름은 지우지 않는다(사람 메뉴가 막는다 — 여기는 안전판).
   */
  function renameMember(id: string, name: string, ourChild?: boolean) {
    const nm = name.trim().slice(0, 20);
    const m = findMember(id);
    if (!m || (m.role !== "sibling" && m.role !== "friend")) return;
    if (!nm && m.isOurChild) return;
    patchMember(
      id,
      (x) => ({
        ...x,
        name: nm || undefined,
        ...(ourChild && nm && x.role === "sibling" ? { isOurChild: true } : {}),
      }),
      "soon",
    );
    showToast(nm ? (ourChild ? "이름을 저장하고 '우리 아이'로 켰어요" : "이름을 저장했어요") : "이름을 지웠어요");
  }

  /* ───────────────────────── 그리기 ───────────────────────── */

  function setJob(id: string, job: Job) {
    setJobs((prev) => ({ ...prev, [id]: job }));
  }

  /**
   * 응답 잔액을 화면 쿠키 수에 반영한다 — 두 명을 동시에 그리면 응답이 값을 받은 순서와 다르게 도착해
   * 먼저 깎인 쪽의 (더 큰) 잔액이 나중에 올 수 있다. 그래서 작은 값만 받고, 그리기가 다 끝나면
   * 서버에서 잔액을 다시 읽어 맞춘다(아래 busy 효과). 작게 보이는 동안에도 값을 더 받지는 않는다.
   */
  function noteTokens(t: unknown) {
    if (typeof t === "number") setTokens((prev) => Math.min(prev, t));
  }

  /** fe 비교 스위치 — 바로 다음 그리기부터 쓰고, 이 기기에 기억한다 */
  function setPenlineTest(on: boolean) {
    penlineRef.current = on;
    setPenline(on);
    try {
      localStorage.setItem(PENLINE_KEY, on ? "1" : "0");
    } catch {
      /* 저장이 막힌 브라우저 — 이번 방문에만 쓴다 */
    }
  }

  /** 응답의 남은 무료 생성 — 잔액과 같은 까닭으로 작은 값만 받고, 그리기가 다 끝나면 다시 읽는다. */
  function noteFree(f: unknown) {
    if (typeof f === "number" && Number.isInteger(f) && f >= 0) setFreeDraws((prev) => Math.min(prev, f));
  }

  /**
   * 받은 그림을 확인 전 그림(draft)으로 넣는다. serverDraws 는 서버 셈(관리자는 undefined — 셈을 안 한다).
   * fromPhoto — 사진을 보내 그린 그림. 표시만 남기고 사진 자체는 여기 없다(저장 금지).
   * p.headRatio — 서버가 잰 머리 비율(단체 사진이 얼굴 크기를 고르는 데 쓴다). 못 쟀으면 없다.
   * p.bodyStretch — 서버가 굽기 때 몸을 늘인 배율(단체 사진이 두 번 늘이지 않게 본다). 안 늘였으면 없다.
   */
  function adoptPic(
    id: string,
    p: { url: string; ref: string; at?: string; transparent?: boolean; headRatio?: number; bodyStretch?: number },
    serverDraws: number | undefined,
    lockKey: string,
    fromPhoto: boolean,
  ) {
    const pic: FamilyPortrait = {
      url: p.url,
      ref: p.ref,
      at: p.at || new Date().toISOString(),
      // 배경 지우기에 실패한 흰 바탕 그림 — 화면에서 곱하기로 얹는다.
      ...(p.transparent === false ? { opaque: true } : {}),
      // 그릴 때의 '늘 그대로' — 모아 보기가 나중에 '모습이 바뀌었어요'를 알아본다.
      lockKey,
      ...(fromPhoto ? { fromPhoto: true } : {}),
      ...(p.headRatio !== undefined ? { headRatio: p.headRatio } : {}),
      ...(p.bodyStretch !== undefined ? { bodyStretch: p.bodyStretch } : {}),
    };
    patchMember(
      id,
      (cur) => ({
        ...cur,
        // 앞 그림(확인 전 그림, 없으면 고정된 그림)을 남겨 두 장 비교에 쓴다.
        prevDraft: cur.draft ?? cur.portrait,
        draft: pic,
        picAt: new Date().toISOString(),
        draws: serverDraws ?? cur.draws,
      }),
      "now",
    );
  }

  /**
   * 응답을 잃은 그리기의 결과를 서버에 묻는다(앱 전환·망 끊김·시간 초과·배포 환경의 504).
   * 서버는 응답을 잃어도 끝까지 그려 '받았음'과 그림 주소를 남긴다 — 그걸 되찾아 draft 로 넣는다.
   * 아직 그리는 중이면 5초마다 다시 묻는다(90초가 지나도 안 끝난 그리기는 서버가 되돌린다).
   *  got     : 새 그림을 받아 넣었다
   *  none    : 건넨 새 그림이 없고 진행 중인 그리기도 없다(값은 되돌려졌거나 안 나갔다) — 셈을 서버에 맞췄다
   *  unknown : 서버에 끝내 닿지 못했다
   * 사진은 필요 없다(GET 으로 묻기만) — fromPhoto 는 되찾은 그림에 '사진으로 그림' 표시를 달지 정할 뿐이다.
   */
  async function recover(
    id: string,
    lockKey: string,
    fromPhoto: boolean,
  ): Promise<{ result: "got" | "none" | "unknown"; refunded?: boolean }> {
    const until = Date.now() + RECOVER_MS;
    for (;;) {
      const s = await fetchStatus(id);
      if (s) {
        noteTokens(s.tokens);
        const cur = findMember(id);
        const known = new Set([cur?.portrait?.url, cur?.draft?.url, cur?.prevDraft?.url]);
        if (s.pic && !known.has(s.pic.url)) {
          adoptPic(id, s.pic, masterRef.current ? undefined : s.draws, lockKey, fromPhoto);
          return { result: "got" };
        }
        if (!s.pending) {
          // 서버 셈으로 맞춘다 — 값 안내가 어긋나 동의 없이 깎이지 않게.
          if (!masterRef.current && cur && cur.draws !== s.draws) {
            patchMember(id, (m) => ({ ...m, draws: s.draws }), "soon");
          }
          return { result: "none", refunded: s.refunded };
        }
      }
      if (Date.now() > until) return { result: "unknown" };
      await sleep(RECOVER_EVERY_MS);
    }
  }

  const LOST_MESSAGE = "연결이 끊겨 그림을 못 받았어요. 연결되면 '다시 해 볼게요'를 눌러 주세요 — 그려진 그림이 있으면 먼저 찾아 드려요.";

  async function drawOne(id: string) {
    const m = findMember(id);
    const c = childRef.current;
    if (!m || !c) {
      setJob(id, { status: "error", kind: "other", message: "가족 정보를 못 찾았어요." });
      return;
    }
    setJob(id, { status: "drawing" });
    // 그릴 때의 '늘 그대로' — 반드시 currentLockKey 로(얼굴형·키 같은 새 칸까지). 그래야 그리자마자
    // '모습이 바뀌었어요'가 뜨지 않는다.
    const lockKey = currentLockKey(m, c);
    // 이번 방문 메모리에 사진이 있으면 그 사진으로 그린다(같은 방문의 다시 그리기도 다시 쓴다).
    // 되찾는 길(recover)은 사진이 필요 없고, 되찾은 그림에 '사진으로 그림' 표시만 단다.
    const photo = photosRef.current[id] ?? null;
    const fromPhoto = photo !== null;

    // 앞에서 응답을 잃은 사람 — 먼저 결과를 묻는다. 이미 그려졌으면 또 값을 내지 않는다.
    if (resumeFirst.current.has(id)) {
      const r = await recover(id, lockKey, fromPhoto);
      if (r.result === "got") {
        resumeFirst.current.delete(id);
        freePlanRef.current.delete(id);
        setJob(id, { status: "done" });
        return;
      }
      if (r.result === "unknown") {
        setJob(id, { status: "error", kind: "lost", message: LOST_MESSAGE });
        return;
      }
      resumeFirst.current.delete(id);
    }

    // 셈이 서버에 맞춰졌을 수 있어 다시 읽는다. 화면이 보여 준 값을 같이 보낸다 — 서버 값이 더 크면 깎지 않는다.
    const cur = findMember(id) ?? m;
    const body = {
      ...portraitRequest(cur, c, familyRef.current, photo),
      // 확인 창에서 무료 생성으로 정한 사람은 0 — 서버가 그 그리기에 무료 횟수를 쓴다.
      ...(masterRef.current ? {} : { expectedCost: freePlanRef.current.has(id) ? 0 : nextDrawCost(cur.draws) }),
      // 펜선은 서버 기본 — fe 만 비교용으로 켬·끔을 싣는다(끄기는 서버가 fe 인지 다시 본다)
      ...(devRef.current ? { penline: penlineRef.current } : {}),
      // 이 사진은 이번 방문에 이미 거절됐다 — 서버가 사진 그리기를 건너뛰고 사진 속 특징으로 바로 그린다(값은 같다).
      ...(photo && photoSkipRef.current.has(id) ? { skipPhotoDraw: true } : {}),
    };

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    let res: Response | null = null;
    let data: unknown = null;
    try {
      res = await authedFetch("/api/family/portrait", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      try {
        data = await res.json();
      } catch {
        data = null;
      }
    } catch {
      res = null;
    } finally {
      clearTimeout(timer);
    }

    const d = (data ?? {}) as {
      url?: unknown;
      ref?: unknown;
      at?: unknown;
      transparent?: unknown;
      headRatio?: unknown;
      bodyStretch?: unknown;
      draw?: unknown;
      draws?: unknown;
      tokens?: unknown;
      freeLeft?: unknown;
      code?: unknown;
      photoFallback?: unknown;
      penline?: unknown;
    };
    const code = typeof d.code === "string" ? d.code : undefined;
    noteTokens(d.tokens);
    noteFree(d.freeLeft);
    const plannedFree = freePlanRef.current.has(id);

    // 본문이 커서 배포 환경이 받지 않았다(우리 code 없는 413) — 서버에 닿지 않았으니 값도 안 나갔다. 되묻지 않는다.
    if (res?.status === 413 && !code) {
      setPhoto(id, null);
      setJob(id, { status: "error", kind: "photo", message: PHOTO_TOO_BIG_MESSAGE });
      return;
    }

    /*
     * 응답을 잃었다 — 끊김·75초 초과·본문을 못 읽음·배포 환경 오류 페이지(우리 code 없음, 함수가 잘린 504 등).
     * 또는 이 사람을 벌써 그리는 중이다(busy — 응답을 잃은 앞 요청일 수 있다). 서버는 끝까지 그렸을 수 있으니
     * 다시 그리기 전에 먼저 묻는다 — 그냥 다시 누르게 하면 이미 낸 값을 또 낸다.
     */
    const lost = !res || (!res.ok && !code) || (res.ok && !(https(d.url) && https(d.ref)));
    if (lost || code === "busy") {
      const r = await recover(id, lockKey, fromPhoto);
      if (r.result === "got") {
        freePlanRef.current.delete(id);
        setJob(id, { status: "done" });
      } else if (r.result === "none") {
        const what = plannedFree ? "무료 생성 횟수는" : "쿠키는";
        setJob(id, {
          status: "error",
          kind: "other",
          message: r.refunded
            ? `그림을 받지 못했어요. ${what} 돌려드렸어요 — 다시 해 주세요.`
            : `그림을 받지 못했어요. ${what} 그대로예요 — 다시 해 주세요.`,
        });
      } else {
        resumeFirst.current.add(id);
        setJob(id, { status: "error", kind: "lost", message: LOST_MESSAGE });
      }
      return;
    }

    if (!res || !res.ok) {
      if (code === "price") freePlanRef.current.delete(id);
      if (code === "price" && typeof d.draws === "number" && !masterRef.current) {
        // 화면 셈이 서버와 어긋났다(다른 기기에서 그림 등) — 서버 셈으로 맞춘다. 값은 안 나갔다.
        const draws = d.draws;
        patchMember(id, (x) => ({ ...x, draws }), "soon");
      }
      const job = jobError(res?.status ?? 0, data);
      // 사진이 거절됐다 — 같은 사진으로 또 하지 않게 메모리에서 바로 뺀다('다시 고르기'로 다른 사진·특징을 고른다).
      if (job.kind === "photo") setPhoto(id, null);
      setJob(id, job);
      return;
    }

    freePlanRef.current.delete(id);
    const url = d.url as string;
    const ref = d.ref as string;
    // 관리자는 쿠키 셈을 하지 않으니 그린 횟수도 그대로 둔다(서버가 draw 0 을 준다).
    const serverDraws =
      masterRef.current || d.tokens === null
        ? undefined
        : typeof d.draw === "number" && d.draw > 0
          ? d.draw
          : (cur.draws ?? 0) + 1;
    // 사진이 거절돼 서버가 같은 쿠키로 대신 그렸다 — 'features'(사진 속 특징으로)면 그래도 사진으로 그린 그림,
    // 'looks'(고르신 특징으로)면 칩으로 그린 그림과 같다(칩을 바꾸면 '모습이 바뀌었어요'가 떠야 한다).
    // 사진은 이번 방문 메모리에 그대로 둔다(특징 카드에 다시 쓴다). 다만 거절된 사진이라 다시 그리기는 사진 그리기를
    // 건너뛰게 적어 둔다(photoSkipRef) — 그 사이 부모가 사진을 바꿨으면 새 사진은 사진으로 먼저 해 본다.
    const fallback = fromPhoto ? readPhotoFallback(d.photoFallback) : null;
    if (fallback && photo && photosRef.current[id] === photo) photoSkipRef.current.add(id);
    adoptPic(
      id,
      {
        url,
        ref,
        at: typeof d.at === "string" ? d.at : undefined,
        transparent: d.transparent !== false,
        headRatio: cleanHeadRatio(d.headRatio),
        bodyStretch: cleanBodyStretch(d.bodyStretch),
      },
      serverDraws,
      lockKey,
      fromPhoto && fallback !== "looks",
    );
    // fe 비교용 — 펜선으로 그렸으면 확인 화면에 한 줄(서버가 fe 에게만 싣는다)
    const note = [fallback ? PHOTO_FALLBACK_NOTE[fallback] : "", devRef.current && d.penline === true ? "펜선 또렷한 수채화로 그렸어요 (fe 확인용)" : ""]
      .filter(Boolean)
      .join(" · ");
    setJob(id, note ? { status: "done", note } : { status: "done" });
  }

  function pump() {
    while (active.current < PARALLEL && queue.current.length > 0) {
      const id = queue.current.shift();
      if (!id) break;
      active.current += 1;
      inflight.current.add(id);
      void drawOne(id)
        .catch(() => setJob(id, { status: "error", kind: "other", message: "그리다 멈췄어요. 다시 해 주세요." }))
        .finally(() => {
          inflight.current.delete(id);
          active.current -= 1;
          pump();
        });
    }
  }

  /** 줄에 섰거나 그리는 중인 사람 */
  const pendingDraw = (id: string) => queue.current.includes(id) || inflight.current.has(id);

  function queueDraw(id: string) {
    if (pendingDraw(id)) return;
    setJob(id, { status: "wait" });
    queue.current.push(id);
    pump();
  }

  function startRound(ids: string[], from: From) {
    setRound({ ids, from });
    // 이미 그리는 중인 사람은 새로 부르지 않고 그 결과를 기다린다.
    setJobs(Object.fromEntries(ids.map((id) => [id, { status: inflight.current.has(id) ? "drawing" : "wait" } as Job])));
    setReviewIdx(0);
    setOverlay(null);
    go("drawing");
    for (const id of ids) if (!pendingDraw(id)) queue.current.push(id);
    pump();
  }

  /** 다시 해 볼게요 — 값이 모자라면 먼저 알린다. 값이 바뀌었으면(price) 확인 창으로 다시 묻는다. */
  function retry(id: string) {
    const m = findMember(id);
    if (!m) return;
    // 사진이 거절됐다 — 같은 사진으로는 또 거절된다. 그 사람 생김새 고르기로 가서 다른 사진이나 특징을 고른다
    // (사진 쪽이 먼저 열리고, 쿠키 확인 뒤 지금 차례에 더해 그린다 — looksNext resume).
    if (jobs[id]?.kind === "photo") {
      startLooks([id], "fix", round.from, true);
      return;
    }
    if (jobs[id]?.kind === "price" && !master) {
      setOverlay({ kind: "confirm", ids: [id], variant: m.portrait || m.draft ? "redraw" : "fix", from: round.from, inline: true });
      return;
    }
    // 응답을 잃은 사람(lost)은 값 검사 없이 — 먼저 결과를 묻고, 이미 그려졌으면 값을 안 낸다(drawOne).
    if (jobs[id]?.kind === "lost") {
      queueDraw(id);
      return;
    }
    if (!master && tokens < drawPrice(m.draws, freeDraws).cost) {
      showToast("쿠키가 조금 모자라요 — 충전은 결제가 열리면 할 수 있어요");
      return;
    }
    // 실패한 그리기는 값을 돌려드렸으니 다시 하면 또 값이 든다 — 바로 그리지 않고 확인 창을 거친다(사장님 2026-09-29).
    setOverlay({ kind: "confirm", ids: [id], variant: m.portrait || m.draft ? "redraw" : "fix", from: round.from, inline: true });
  }

  const busy = Object.values(jobs).some((j) => j.status === "wait" || j.status === "drawing");

  // 그리기가 다 끝나면 서버에서 잔액을 다시 읽는다 — 동시에 그린 응답이 뒤섞여 도착하거나(작은 값만 받았다)
  // 실패해 되돌린 값이 있으면 화면 쿠키 수가 실제와 어긋난다.
  const wasBusy = useRef(false);
  useEffect(() => {
    if (busy) {
      wasBusy.current = true;
      return;
    }
    if (!wasBusy.current) return;
    wasBusy.current = false;
    let alive = true;
    fetchProfile()
      .then((p) => {
        if (alive && p) setTokens(p.tokens);
      })
      .catch(() => {});
    // 무료 생성도 — 실패해 되돌린 횟수·그사이 관리실이 더한 횟수
    if (!masterRef.current) {
      void loadFreeDraws().then((n) => {
        if (alive) setFreeDraws(n);
      });
    }
    return () => {
      alive = false;
    };
  }, [busy]);

  // 그리는 동안 화면이 꺼지거나 창을 닫으면 그림을 못 받는다 — 붙잡고, 닫기 전에 묻는다.
  useScreenWakeLock(busy);
  useEffect(() => {
    if (!busy) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [busy]);

  /* ───────────────────────── 확인 ───────────────────────── */

  function openReview(focusId?: string) {
    const ids = round.ids.length > 0 && step === "drawing" ? round.ids : byRoleOrder(familyRef.current.filter((m) => m.draft)).map((m) => m.id);
    if (step !== "drawing") {
      // 모아 보기에서 연 확인 — 그리는 중인 사람이 없으니 모두 '끝남'으로 둔다.
      setRound({ ids, from: "album" });
      setJobs(Object.fromEntries(ids.map((id) => [id, { status: "done" } as Job])));
    }
    const fam = familyRef.current;
    const at = focusId ? ids.indexOf(focusId) : ids.findIndex((id) => fam.find((m) => m.id === id)?.draft);
    setReviewIdx(Math.max(0, at));
    setOverlay(null);
    go("review");
  }

  function finishRound() {
    const fam = familyRef.current;
    const fixedNow = fam.filter((m) => round.ids.includes(m.id) && m.portrait && !m.draft);
    if (round.from === "members" && fixedNow.length > 0) {
      setStamp(seasonLabel(new Date()));
      go("done");
      return;
    }
    go("album");
    if (fixedNow.length > 0) showToast("얼굴을 고정했어요");
  }

  /** 다음 확인할 사람으로 — 없으면 그리는 중인 사람, 그것도 없으면 끝 */
  function advance(fromIdx: number) {
    const ids = round.ids;
    const fam = familyRef.current;
    const pending = (k: number) => {
      const m = fam.find((f) => f.id === ids[k]);
      return Boolean(m?.draft) && jobs[ids[k]]?.status !== "drawing" && jobs[ids[k]]?.status !== "wait";
    };
    for (let s = 1; s <= ids.length; s++) {
      const k = (fromIdx + s) % ids.length;
      if (pending(k)) {
        setReviewIdx(k);
        return;
      }
    }
    const running = ids.findIndex((id) => jobs[id]?.status === "wait" || jobs[id]?.status === "drawing");
    if (running >= 0) {
      setReviewIdx(running);
      return;
    }
    finishRound();
  }

  /**
   * 사진으로 그린 그림을 고정했다 — 그 사람이 예전에 고른 특징(칩)을 비운다(lib/family dropPhotoFixedLooks,
   * 사장님 2026-10-14 "사진으로 나온 게 있다면 이전 선택창은 초기화"). 사진과 칩이 함께 남으면 그림·동화에 둘 다 들어가 어긋난다.
   * 아이·엄마·아빠 칩은 여기서 화면과 저장을 바로 비우고, 그 밖의 사람 칩을 비운 가족 목록을 돌려준다(부르는 쪽이 저장한다).
   * 고정된 사진 그림이 없거나 비울 칩이 없으면 받은 목록 그대로.
   */
  function clearPhotoFixedLooks(fam: FamilyMember[]): FamilyMember[] {
    const c = childRef.current;
    if (!c) return fam;
    const next = dropPhotoFixedLooks({ looks: c.looks, parents: c.parents, family: fam });
    if (next.looks !== c.looks || next.parents !== c.parents) {
      const cleaned: ChildPrefs = { ...c, looks: next.looks, parents: next.parents };
      childRef.current = cleaned;
      setChild(cleaned);
      // 이 화면에서 고친 칸 기억도 지운다 — 서버 값이 뒤늦게 와도 비운 칩을 되살리지 않게(absorbRemote).
      const edits = { ...looksEdits.current };
      if (next.looks !== c.looks) delete edits.child;
      if (next.parents?.mom !== c.parents?.mom) delete edits.mom;
      if (next.parents?.dad !== c.parents?.dad) delete edits.dad;
      looksEdits.current = edits;
      saveChild({ name: c.name, looks: next.looks, parents: next.parents });
    }
    return next.family ?? fam;
  }

  function accept(id: string, which: "draft" | "prev") {
    const m = findMember(id);
    const chosen = which === "prev" ? m?.prevDraft : m?.draft;
    if (!m || !chosen) return;
    // picAt — 고른 때를 적는다. 다른 기기의 옛 확인 전 그림이 합치기에서 이 선택을 이기지 않게.
    const at = new Date().toISOString();
    const fixed = familyRef.current.map((cur) =>
      cur.id === id ? { ...cur, portrait: chosen, draft: undefined, prevDraft: undefined, picAt: at } : cur,
    );
    // 사진으로 그린 그림을 골랐으면 예전에 고른 특징은 비운다.
    commit(clearPhotoFixedLooks(fixed), "now");
    // 얼굴을 고정했다 — 사진은 할 일을 다 했다. 메모리에서도 바로 버린다.
    setPhoto(id, null);
    advance(round.ids.indexOf(id));
  }

  /**
   * 예전 그림으로 돌아가기(사장님 2026-10-14) — 고른 예전 그림을 고정 그림으로 되돌린다. 새로 그리지 않으니 쿠키가 들지 않는다.
   * 지금 들고 있는 그림(고정·확인 전·견주던 앞 그림)과 같은 그림이면 그 기록(머리 비율·사진 표시 …)을 그대로 쓴다.
   * 폴더에서 되찾은 그림은 그릴 때의 특징을 모른다 — restored 표시를 달아 그림이 모습을 정하게 하고, 지금 칩은 비운다
   * (clearPhotoFixedLooks — 칩이 그 그림과 다르면 동화에서 어긋난다). 확인 전 그림은 치운다(목록에서 다시 고를 수 있다).
   */
  function restorePicture(id: string, pic: RestoredPicture) {
    const m = findMember(id);
    if (!m) return;
    const known = [m.portrait, m.draft, m.prevDraft].find((p) => p?.url === pic.url);
    const portrait: FamilyPortrait = known ?? {
      url: pic.url,
      ref: pic.ref,
      at: pic.at,
      ...(pic.transparent ? {} : { opaque: true }),
      restored: true,
    };
    const at = new Date().toISOString();
    const next = familyRef.current.map((cur) =>
      cur.id === id ? { ...cur, portrait, draft: undefined, prevDraft: undefined, looksOnly: undefined, picAt: at } : cur,
    );
    commit(clearPhotoFixedLooks(next), "now");
    // 이번 방문에 골라 둔 사진은 할 일이 없다 — 메모리에서 버린다.
    setPhoto(id, null);
    setOverlay(null);
    showToast("예전 그림으로 돌아갔어요 — 다음 동화부터 이 모습으로 그려요");
  }

  function acceptAll() {
    const ids = new Set(round.ids);
    const at = new Date().toISOString();
    const fixing = (m: FamilyMember) =>
      ids.has(m.id) && Boolean(m.draft) && jobs[m.id]?.status !== "drawing" && jobs[m.id]?.status !== "wait";
    const fixed = familyRef.current.filter(fixing).map((m) => m.id);
    commit(
      // 사진으로 그린 그림을 고정한 사람은 예전에 고른 특징을 비운다(clearPhotoFixedLooks).
      clearPhotoFixedLooks(
        familyRef.current.map((m) =>
          fixing(m) ? { ...m, portrait: m.draft, draft: undefined, prevDraft: undefined, picAt: at } : m,
        ),
      ),
      "now",
    );
    // 고정한 사람들의 사진은 메모리에서도 버린다.
    for (const id of fixed) setPhoto(id, null);
    advance(reviewIdx);
  }

  /**
   * 다시 그리기 — 늘 확인 창을 거친다. 예전엔 포함된 한 번(0개)이나 관리자면 바로 그렸는데, 누르자마자 그림 값이
   * 나가 버렸다(사장님 2026-09-29: "크레딧 발생은 알림창이 떠야"). 0개면 창에 '0개 (포함된 다시 그리기)'로 보인다.
   */
  function redraw(id: string, inline: boolean) {
    if (!findMember(id)) return;
    setOverlay({ kind: "confirm", ids: [id], variant: "redraw", from: inline ? round.from : "album", inline });
  }

  /* ───────────────────────── 화면 ───────────────────────── */

  const hasBottomBar = step === "album" || step === "members" || step === "looks";
  const confirmMembers =
    overlay?.kind === "confirm"
      ? overlay.ids.map((id) => family.find((m) => m.id === id)).filter((m): m is FamilyMember => Boolean(m))
      : [];
  const sheetMember =
    overlay?.kind === "member" || overlay?.kind === "changed" || overlay?.kind === "history"
      ? family.find((m) => m.id === overlay.id)
      : undefined;
  // 시트 한 사람의 값 — 무료 생성이 있으면 쿠키 대신(관리자는 셈 없음)
  const sheetPrice = sheetMember ? drawPrice(sheetMember.draws, master ? 0 : freeDraws) : null;
  const roundMembers = round.ids.map((id) => family.find((m) => m.id === id)).filter((m): m is FamilyMember => Boolean(m));
  const looksMembers = looks ? looks.ids.map((id) => family.find((m) => m.id === id)).filter((m): m is FamilyMember => Boolean(m)) : [];
  // 명패 — 아이와 '우리 아이예요'를 켠 형제(하온·하린이네 가족). 단짝 친구는 안 든다.
  const title = familyTitle(ourChildrenNames(child?.name, family));
  let view: ReactNode = null;
  if (step === "loading") {
    view = (
      <div className="flex min-h-[60dvh] items-center justify-center">
        <p className="rounded-full bg-white/85 px-5 py-2.5 text-sm font-extrabold text-neutral-600 shadow">가족을 불러오는 중…</p>
      </div>
    );
  } else if (step === "noChild" || !child) {
    view = (
      <div className="mt-[12dvh] flex flex-col items-center rounded-[28px] bg-white/90 px-6 pb-6 pt-7 text-center shadow-xl backdrop-blur">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/occasion-sibling.webp" alt="" className="h-20 w-20 object-contain" />
        <h1 className="mt-3 text-[22px] font-extrabold text-neutral-800">먼저 아이 이름을 알려 주세요</h1>
        <p className="mt-2 break-keep text-sm font-medium leading-normal text-neutral-500">
          주인공 이름이 있어야 가족을 그릴 수 있어요.
          <br />
          설정에서 이름·나이를 적고 다시 와 주세요.
        </p>
        <div className="mt-5 w-full">
          <BigButton colors={colors} onClick={() => router.push("/settings")}>
            설정으로 가기
          </BigButton>
        </div>
        <button type="button" onClick={() => router.push("/")} className="mt-3 min-h-11 px-3 text-sm font-extrabold text-neutral-500">
          홈으로
        </button>
      </div>
    );
  } else if (step === "members") {
    view = (
      <MembersView
        colors={colors}
        child={child}
        family={family}
        master={master}
        freeDraws={freeDraws}
        onBack={() => (hasAlbum(family) ? go("album") : router.push("/"))}
        onToggle={addPreset}
        onRemove={removeMember}
        onFixedTap={(m) => showToast(`${displayName(m)} 얼굴은 고정돼 있어요. 모아 보기에서 고칠 수 있어요`)}
        onOpenAdd={(role) => setOverlay({ kind: "add", role, mode: "members", key: ++addSeq.current })}
        onNext={() =>
          startLooks(
            byRoleOrder(familyRef.current.filter((m) => !m.portrait)).map((m) => m.id),
            "fix",
            "members",
          )
        }
      />
    );
  } else if (step === "looks" && looks && looksMembers.length > 0) {
    view = (
      <LooksView
        colors={colors}
        child={child}
        members={looksMembers}
        idx={Math.min(looks.idx, looksMembers.length - 1)}
        mode={looks.mode}
        photos={photos}
        photoFirst={looks.resume}
        notice={looks.resume ? "앞 사진으로는 그리지 못했어요. 다른 사진을 고르거나 특징을 골라 주세요." : undefined}
        onPick={(i) => setLooks({ ...looks, idx: i })}
        onChildLook={setChildLooks}
        onParentLook={setParentLooks}
        onMemberLook={setMemberLooks}
        onPhoto={setPhoto}
        onPhotoReady={photoReady}
        onBack={() => (looks.mode === "edit" ? finishEdit() : go(looks.resume ? "drawing" : looks.from))}
        onNext={looksNext}
      />
    );
  } else if (step === "drawing") {
    view = (
      <DrawingView
        colors={colors}
        mascot={theme.mascot}
        mascotName={theme.mascotName}
        title={title}
        members={roundMembers}
        jobs={jobs}
        master={master}
        freeDraws={freeDraws}
        onRetry={retry}
        onReview={() => openReview()}
        onLeave={() => go("album")}
        onCharge={() => router.push("/plans")}
        onLogin={() => router.push("/login")}
      />
    );
  } else if (step === "review" && roundMembers.length > 0) {
    view = (
      <ReviewView
        colors={colors}
        child={child}
        ids={roundMembers.map((m) => m.id)}
        family={family}
        jobs={jobs}
        idx={reviewIdx}
        master={master}
        freeDraws={freeDraws}
        onPick={setReviewIdx}
        onAccept={accept}
        onAcceptAll={acceptAll}
        onRedraw={(id) => redraw(id, true)}
        onRetry={retry}
        onBack={() => go(busy ? "drawing" : "album")}
        onCharge={() => router.push("/plans")}
      />
    );
  } else if (step === "done") {
    view = (
      <DoneView
        colors={colors}
        mascot={theme.mascot}
        mascotName={theme.mascotName}
        background={theme.background}
        title={title}
        childAge={child.age}
        parents={child.parents}
        members={homeMembers(family)}
        kid={family.find((m) => m.role === "child")}
        stamp={stamp}
        onCreate={() => router.push("/create")}
        onHome={() => router.push("/")}
        studio={child.familyStudio}
      />
    );
  } else {
    // album — 그 밖에 갈 곳을 잃은 단계(사람이 빠진 확인 등)도 모아 보기로
    view = (
      <AlbumView
        colors={colors}
        background={theme.background}
        child={child}
        family={family}
        tokens={tokens}
        master={master}
        freeDraws={freeDraws}
        onHome={() => router.push("/")}
        onCard={(id) => setOverlay({ kind: "member", id })}
        onChanged={openChanged}
        onAdd={() => setOverlay({ kind: "add", mode: "album", key: ++addSeq.current })}
        onAddFriend={() => setOverlay({ kind: "add", role: "friend", mode: "album", key: ++addSeq.current })}
        onCreate={() => router.push("/create")}
        studio={child.familyStudio}
        onStudio={() => setOverlay({ kind: "studio" })}
      />
    );
  }

  return (
    <div className="relative min-h-dvh w-full">
      {step !== "drawing" && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={theme.background} alt="" className="fixed inset-0 -z-10 h-full w-full object-cover" />
          <div className="fixed inset-0 -z-10 bg-white/30" />
        </>
      )}

      <main className={`mx-auto w-full max-w-xl px-3 pt-3 sm:px-6 sm:pt-8 ${hasBottomBar ? "pb-36" : "pb-10"}`}>
        {/* 저장 경고 — 나라 색이 아니라 경고 색(호박색)으로 둔다. 어느 나라에서든 '주의'로 읽혀야 한다. */}
        {localOnly && (
          <div className="mb-2 flex items-center justify-center gap-2 rounded-full bg-amber-50/95 px-4 py-1.5 text-xs font-extrabold text-amber-800 shadow" role="status">
            이 기기에만 저장됐어요
            <button type="button" onClick={() => void saveNow()} className="min-h-11 rounded-full bg-white px-3.5 text-xs font-extrabold text-amber-800 shadow-sm">
              다시 저장
            </button>
          </div>
        )}
        {/* 그리는 화면에서 나와도 뒤에서 계속 그린다 — 돌아갈 길 */}
        {busy && step !== "drawing" && step !== "review" && (
          <button
            type="button"
            onClick={() => go("drawing")}
            className="mb-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-white/95 px-4 text-sm font-extrabold shadow"
            style={{ color: colors.accentDark }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/func-edit.webp" alt="" aria-hidden className="h-6 w-6" />
            가족을 그리는 중이에요 · 보러 가기
          </button>
        )}
        {view}
      </main>

      {overlay?.kind === "confirm" && planLocked && (
        <PlanLockSheet colors={colors} onClose={() => setOverlay(null)} onPlans={() => router.push("/plans")} />
      )}
      {overlay?.kind === "confirm" && !planLocked && (
        <ConfirmSheet
          colors={colors}
          members={confirmMembers}
          tokens={tokens}
          master={master}
          freeDraws={freeDraws}
          penlineTest={dev ? { on: penline, onChange: setPenlineTest } : undefined}
          variant={overlay.variant}
          childGender={child?.gender}
          photoIds={Object.keys(photos)}
          onClose={() => setOverlay(null)}
          onConfirm={() => {
            const ids = confirmMembers.map((m) => m.id);
            // 무료 생성 — 이 창에 보인 줄 그대로 보낸다(무료 줄은 보낸 값 0)
            for (const r of priceMembers(confirmMembers, master ? 0 : freeDraws)) {
              if (r.free) freePlanRef.current.add(r.m.id);
              else freePlanRef.current.delete(r.m.id);
            }
            if (overlay.inline) {
              setOverlay(null);
              ids.forEach(queueDraw);
              // 거절된 사진 대신 다시 골라 온 길(생김새 고르기)이면 그리는 화면으로 돌아간다.
              if (step === "looks") go("drawing");
            } else {
              startRound(ids, overlay.from);
            }
          }}
          onCharge={() => router.push("/plans")}
          // 생김새 고르기에서 온 처음 고정만 — 그리는 중 값이 바뀌어 다시 묻는 창(inline)에는 없다.
          onLooksOnly={
            overlay.variant === "fix" && !overlay.inline
              ? () => saveLooksOnly(confirmMembers.map((m) => m.id))
              : undefined
          }
        />
      )}

      {overlay?.kind === "member" && sheetMember && (
        <MemberSheet
          key={sheetMember.id}
          colors={colors}
          member={sheetMember}
          childName={child?.name ?? ""}
          family={family}
          master={master}
          freeDraws={freeDraws}
          looksPicked={hasPickedLooks(sheetMember, child)}
          onClose={() => setOverlay(null)}
          onReview={() => openReview(sheetMember.id)}
          onRedraw={() => redraw(sheetMember.id, false)}
          onFix={() => startLooks([sheetMember.id], "fix", "album")}
          onEditLooks={() => startLooks([sheetMember.id], "edit", "album")}
          onHistory={() => setOverlay({ kind: "history", id: sheetMember.id })}
          onShowOnHome={(on) => setShowOnHome(sheetMember.id, on)}
          onOurChild={(on) => setOurChild(sheetMember.id, on)}
          onRename={(name, ourChild) => renameMember(sheetMember.id, name, ourChild)}
          onRemove={() => removeMember(sheetMember.id)}
        />
      )}

      {overlay?.kind === "history" && sheetMember && (
        <HistorySheet
          key={sheetMember.id}
          colors={colors}
          member={sheetMember}
          // 뺐다가 다시 넣은 사람에게 예전 사람의 그림은 보이지 않는다(뺄 때 "그린 그림도 같이 지워져요"라고 알렸다)
          since={historyFloor(sheetMember, child?.familyRemoved)}
          onClose={() => setOverlay({ kind: "member", id: sheetMember.id })}
          onRestore={(pic) => restorePicture(sheetMember.id, pic)}
        />
      )}

      {overlay?.kind === "add" && (
        <AddMemberSheet
          key={overlay.key}
          colors={colors}
          family={family}
          initialRole={overlay.role}
          childName={child?.name}
          childAge={child?.age ?? null}
          mode={overlay.mode}
          onClose={() => setOverlay(null)}
          onAdd={(nm) => addMember(nm, overlay.mode)}
        />
      )}

      {overlay?.kind === "changed" && sheetMember && (
        <LooksChangedSheet
          colors={colors}
          member={sheetMember}
          diff={overlay.diff}
          cost={sheetPrice?.cost ?? nextDrawCost(sheetMember.draws)}
          free={sheetPrice?.free ?? false}
          master={master}
          tokens={tokens}
          onRedraw={() => setOverlay({ kind: "confirm", ids: [sheetMember.id], variant: "redraw", from: "album" })}
          onLater={() => {
            setOverlay(null);
            // 사진으로 그렸거나 예전 그림으로 되돌린 사람은 다시 그리지 않으면 고른 특징이 쓰이지 않는다 —
            // 말없이 사라진 것처럼 보이지 않게 알린다.
            if (pictureDecidesLooks(sheetMember)) {
              showToast(
                isPhotoFixed(sheetMember)
                  ? "사진으로 그린 모습 그대로 둘게요 — 고른 특징은 쓰지 않아요"
                  : "지금 그림 그대로 둘게요 — 고른 특징은 쓰지 않아요",
              );
            }
          }}
          onMore={overlay.fromAlbum ? () => setOverlay({ kind: "member", id: sheetMember.id }) : undefined}
          onCharge={() => router.push("/plans")}
        />
      )}

      {overlay?.kind === "studio" && child && (
        <StudioSheet
          colors={colors}
          members={homeMembers(family)}
          childAge={child.age}
          parents={child.parents}
          background={theme.background}
          studio={child.familyStudio}
          onChange={saveStudio}
          onClose={() => setOverlay(null)}
          onOutfit={() => setOverlay({ kind: "outfit" })}
        />
      )}

      {overlay?.kind === "outfit" && child && (
        <OutfitPicker
          colors={colors}
          members={homeMembers(family)}
          childAge={child.age}
          childGender={child.gender}
          parents={child.parents}
          background={theme.background}
          studio={child.familyStudio}
          onStudio={saveStudio}
          onOutfit={saveMemberOutfit}
          onClose={() => setOverlay({ kind: "studio" })}
        />
      )}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-32 z-[60] flex justify-center px-4" role="status" aria-live="polite">
          <span key={toast.n} className="max-w-md break-keep rounded-full bg-neutral-900/85 px-4 py-2.5 text-center text-sm font-bold text-white shadow-lg">
            {toast.text}
          </span>
        </div>
      )}
    </div>
  );
}
