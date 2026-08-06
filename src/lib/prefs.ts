/**
 * 설정 저장소 (localStorage). DB가 붙기 전까지 아이 정보·언어를 기기에 저장한다.
 * 설정 화면(⚙️)에서 쓰고, 만들기 위저드가 미리 채우는 데 쓴다.
 * Supabase가 붙으면 이 파일의 저장처만 DB로 바뀐다.
 */

import { acctKey, currentUid, getSupabase } from "@/lib/supabase";
import type { Book } from "@/lib/types";

export type Gender = "girl" | "boy" | "unspecified";

/**
 * 아이 생김새 — 동화 주인공을 "우리 애 같게" 만드는 재료.
 *
 * 사진을 받지 않는다. 아동 얼굴은 개인정보 부담이 크고, 어설프게 닮으면
 * "우리 애 아닌데?"가 되어 안 하느니만 못하다. 대신 몇 가지 특징만 골라
 * 캐릭터 시트에 넣으면 "어? 우리 애 같네"가 나온다 — 위험 없이 같은 목적을 이룬다.
 * 전부 선택이라 아무것도 안 골라도 동화는 만들어진다.
 */
export type ChildLooks = {
  hair?: string; // 머리 모양 (짧은 머리 / 단발 / 양갈래 …)
  bangs?: string; // 앞머리 (있어요 / 없어요 / 옆으로 넘겨요)
  hairColor?: string; // 머리 색
  eyes?: string; // 눈매 (크고 동그래요 / 웃으면 반달 …)
  skin?: string; // 피부 톤
  build?: string; // 키·몸집 (또래보다 작아요 / 통통해요 …)
  color?: string; // 좋아하는 옷 색
  items?: string[]; // 늘 지니는 것 (곰인형·모자·머리핀 …) 여러 개
  glasses?: boolean; // 안경
  marks?: string[]; // 특징 (주근깨·보조개 …) 여러 개
  /**
   * 칩으로 못 담는 것을 부모가 직접 적는 자리(선택).
   * 칩만 두면 "우리 애한테 딱 맞는 게 없네"가 생기고, 자유 입력만 두면 백지 공포가 온다.
   * 그래서 칩이 뼈대를 잡고 이 한 줄이 나머지를 채운다("늘 공룡 티셔츠를 입어요" 등).
   */
  note?: string;
};

export type ChildPrefs = {
  name: string;
  age: number | null;
  gender: Gender;
  looks?: ChildLooks;
};

/** 저장된 값에서 생김새만 안전하게 골라낸다(모르는 값·형식은 버린다). */
function normalizeLooks(raw: unknown): ChildLooks | undefined {
  const v = raw as Partial<ChildLooks> | null | undefined;
  if (!v || typeof v !== "object") return undefined;
  const str = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim().slice(0, 30) : undefined);
  const list = (x: unknown) =>
    Array.isArray(x) ? x.map(str).filter((s): s is string => Boolean(s)).slice(0, 5) : undefined;
  const looks: ChildLooks = {
    hair: str(v.hair),
    bangs: str(v.bangs),
    hairColor: str(v.hairColor),
    eyes: str(v.eyes),
    skin: str(v.skin),
    build: str(v.build),
    color: str(v.color),
    items: list(v.items),
    glasses: v.glasses === true ? true : undefined,
    marks: list(v.marks),
    // 자유 입력은 그림 프롬프트로 그대로 들어가므로 길이를 제한한다.
    note: typeof v.note === "string" && v.note.trim() ? v.note.trim().slice(0, 100) : undefined,
  };
  // 하나도 안 골랐으면 아예 없는 것으로 둔다 — 빈 껍데기를 들고 다니지 않는다.
  const any = Object.values(looks).some((x) => (Array.isArray(x) ? x.length > 0 : Boolean(x)));
  return any ? looks : undefined;
}

// 아이는 한 명만 저장한다. 형제 동화는 만들기에서 "누구랑 → 형·동생 + 이름"으로
// 다룬다 — 데이터를 여러 벌 들고 있지 않아 관리가 단순하다.
const CHILD_KEY = "voice-storybook:child";
const LANG_KEY = "voice-storybook:lang";

/** 원문(문자열/객체)을 안전한 ChildPrefs로 정규화. 형식이 아니면 null. */
function normalizeChild(raw: unknown): ChildPrefs | null {
  let v: unknown = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const c = v as Partial<ChildPrefs> | null;
  if (!c || typeof c.name !== "string") return null;
  return {
    name: c.name,
    age: typeof c.age === "number" ? c.age : null,
    gender: c.gender === "girl" || c.gender === "boy" ? c.gender : "unspecified",
    looks: normalizeLooks((c as { looks?: unknown }).looks),
  };
}

/**
 * 생김새를 그림 프롬프트에 넣을 한 줄로 만든다(한국어). 안 고른 항목은 빠진다.
 * 캐릭터 시트가 이 문장을 받아 주인공을 그리고, 그 시트가 모든 쪽의 기준이 된다.
 */
export function looksToPrompt(looks: ChildLooks | undefined): string {
  if (!looks) return "";
  const parts: string[] = [];
  // 머리 — 색·모양·앞머리를 한 덩어리로 묶어야 그림이 헷갈리지 않는다.
  const hair = [looks.hairColor, looks.hair].filter(Boolean).join(" ");
  if (hair) parts.push(hair);
  if (looks.bangs) parts.push(`앞머리는 ${looks.bangs}`);
  if (looks.eyes) parts.push(`눈은 ${looks.eyes}`);
  if (looks.skin) parts.push(`피부는 ${looks.skin}`);
  if (looks.build) parts.push(looks.build);
  if (looks.glasses) parts.push("안경을 썼다");
  if (looks.color) parts.push(`${looks.color} 옷을 즐겨 입는다`);
  if (looks.items?.length) parts.push(`늘 ${looks.items.join("·")}을(를) 지니고 다닌다`);
  if (looks.marks?.length) parts.push(looks.marks.join("·"));
  if (looks.note) parts.push(looks.note); // 부모가 직접 적은 것 — 맨 뒤에 그대로 얹는다
  return parts.join(", ");
}

export function loadChild(): ChildPrefs | null {
  if (typeof window === "undefined") return null;
  return normalizeChild(window.localStorage.getItem(acctKey(CHILD_KEY)));
}

/** 계정별 로컬 백업 키 — 로그아웃해도 지우지 않는다(SQL 없이도 재로그인 복구). */
const acctChildKey = (uid: string) => `${CHILD_KEY}:${uid}`;

// 타이핑 연타(설정에서 이름 한 글자마다 저장) 시 계정 저장은 묶어서 한 번만.
let childRemoteTimer: ReturnType<typeof setTimeout> | null = null;

export function saveChild(child: ChildPrefs): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(acctKey(CHILD_KEY), JSON.stringify(child));
  // 계정별 로컬 백업 + Supabase 저장 — 로그아웃/재로그인/기기 변경에도 유지된다.
  // 연타를 800ms로 묶어 네트워크를 아낀다.
  if (childRemoteTimer) clearTimeout(childRemoteTimer);
  childRemoteTimer = setTimeout(() => {
    void saveChildRemote(child).catch(() => {});
  }, 800);
}

/**
 * 아이 정보를 로그인 계정에 남긴다: ① 계정별 로컬 백업(SQL 없이도 동작) ② Supabase(컬럼 있으면).
 * 둘 다 로그아웃해도 지워지지 않아 재로그인하면 복구된다.
 */
export async function saveChildRemote(child: ChildPrefs): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const uid = await currentUid();
  if (!uid) return;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(acctChildKey(uid), JSON.stringify(child)); // ① 계정 로컬 백업
  }
  try {
    await sb.from("profiles").update({ child }).eq("id", uid); // ② Supabase (컬럼 없으면 무시)
  } catch {
    /* child 컬럼 전(마이그레이션 안 함) 등 — 로컬 백업만으로 동작 */
  }
}

/**
 * 로그인 계정의 아이 정보를 되살려 로컬 캐시(CHILD_KEY)에 반영한다 (재로그인 복구용).
 * 계정별 로컬 백업을 먼저 보고, Supabase에 값이 있으면 그걸 우선(기기 변경 대응)한다.
 */
export async function loadChildRemote(): Promise<ChildPrefs | null> {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const uid = await currentUid();
    if (!uid) return null;
    // ① 계정별 로컬 백업 (SQL 없이도 같은 기기 재로그인 복구)
    let child = normalizeChild(window.localStorage.getItem(acctChildKey(uid)));
    // ② Supabase에 값이 있으면 우선 (다른 기기·재설치 복구)
    const { data, error } = await sb
      .from("profiles")
      .select("child")
      .eq("id", uid)
      .maybeSingle();
    if (!error) {
      const remote = normalizeChild((data as { child?: unknown } | null)?.child);
      if (remote) {
        // 서버 값이 우선이되, 서버에 '생김새'가 아예 없으면 로컬 것을 살린다.
        // 아이 특징은 나중에 생긴 기능이라 서버에 저장된 아이 정보가 이름·나이·성별만
        // 들어 있는 계정이 많다. 통째로 갈아끼우면 방금 고른 특징이 불러올 때마다
        // 지워져서 "저장이 안 된다"가 된다.
        // (다른 기기에서 특징을 지운 경우 이 기기 것이 되살아날 수 있지만,
        //  애써 고른 걸 말없이 잃는 쪽보다 낫다.)
        child = { ...remote, looks: remote.looks ?? child?.looks };
      }
    }
    if (child && typeof window !== "undefined") {
      // 계정별 키에만 쓴다 — loadChild()가 읽는 자리가 바로 여기다(acctKey(CHILD_KEY)와 같은 키).
      // 기기 공용 키에는 쓰지 않는다: 나중에 다른 계정·비회원이 이 값을 물려받으면 안 된다.
      window.localStorage.setItem(acctChildKey(uid), JSON.stringify(child));
    }
    return child;
  } catch {
    return null;
  }
}

/**
 * 로그아웃 직전, 현재 아이 정보를 계정 백업에 확실히 넣어둔다 — 디바운스로 아직
 * 안 올라간 마지막 입력이 로그아웃으로 유실되지 않게. (auth.logOut에서 호출)
 */
export async function backupChildBeforeLogout(): Promise<void> {
  if (typeof window === "undefined") return;
  // 로그아웃 전이라 아직 이 계정 키로 읽힌다(acctKey).
  const raw = window.localStorage.getItem(acctKey(CHILD_KEY));
  if (!raw) return;
  const sb = getSupabase();
  if (!sb) return;
  try {
    const uid = await currentUid();
    if (!uid) return;
    window.localStorage.setItem(acctChildKey(uid), raw);
    await sb.from("profiles").update({ child: normalizeChild(raw) }).eq("id", uid);
  } catch {
    /* 컬럼 전(마이그레이션 안 함) 등 — 로컬 백업만으로도 복구된다 */
  }
}

/** 아이 정보 비우기 — 로그아웃/계정전환 시 '현재' 캐시만 지운다. 계정별 백업은 남겨 재로그인 복구. */
/**
 * '현재 화면에 뜬' 아이 정보만 비운다 — 계정 전환 시 앞 계정 아이가 남지 않게.
 * 계정별 저장분(키:회원id)은 건드리지 않는다. 그 계정으로 다시 들어오면 그대로 복구된다.
 */
export function clearChild(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CHILD_KEY); // 비회원(기기 공용) 값만 제거
}

export function loadLang(): string {
  if (typeof window === "undefined") return "ko";
  return window.localStorage.getItem(acctKey(LANG_KEY)) ?? "ko";
}

export function saveLang(lang: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(acctKey(LANG_KEY), lang);
}

/**
 * 책 글자 위치 — 늘 하단이면 삽화의 아랫부분(발밑 장면)이 계속 가려진다.
 * 취향 문제라 설정(⚙️)에서 고르게 한다.
 * 아래·위는 가장자리 그라데이션, 가운데·왼쪽·오른쪽은 반투명 판 위에 얹힌다.
 */
export type TextPos = "bottom" | "top" | "center" | "left" | "right";

const TEXT_POS_KEY = "voice-storybook:text-pos";
const TEXT_POSITIONS: TextPos[] = ["bottom", "top", "center", "left", "right"];

export function loadTextPos(): TextPos {
  if (typeof window === "undefined") return "bottom";
  const v = window.localStorage.getItem(acctKey(TEXT_POS_KEY)) as TextPos | null;
  return v && TEXT_POSITIONS.includes(v) ? v : "bottom";
}

export function saveTextPos(pos: TextPos): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(acctKey(TEXT_POS_KEY), pos);
}

/**
 * 책 보는 방식 — 가로 화면에서만 갈린다.
 *
 * full   : 그림이 화면을 꽉 채우고 글자는 그림 위 하단 띠에 얹힌다(지금까지의 방식).
 *          극장처럼 몰입되지만 글자 자리로 그림 아래쪽이 늘 어두워진다.
 * spread : 진짜 그림책 펼침면 — 왼쪽 그림, 오른쪽 종이 위 글. 그림이 가려지지 않고
 *          글도 또렷하다. 세로(3:4) 그림일 때 반쪽을 꽉 채워 가장 예쁘다.
 *
 * 기존 책은 대부분 가로(4:3) 그림이라 기본은 full로 둔다.
 * 세로 화면(폰)은 이미 그림 위·글 아래로 나뉘어 있어 이 설정과 무관하다.
 */
export type BookLayout = "full" | "spread";

const BOOK_LAYOUT_KEY = "voice-storybook:book-layout";

export function loadBookLayout(): BookLayout {
  if (typeof window === "undefined") return "full";
  return window.localStorage.getItem(acctKey(BOOK_LAYOUT_KEY)) === "spread" ? "spread" : "full";
}

export function saveBookLayout(v: BookLayout): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(acctKey(BOOK_LAYOUT_KEY), v);
}

/**
 * 동화 글자 크기 배율 — 기본을 정해 두었지만 "작네" 싶을 때 책 안에서 바로 키운다.
 * 화면 크기에 따라 자동으로 커지는 기본값(clamp)에 이 배율을 곱한다.
 * 부모마다 눈이 다르고, 아이와 나란히 앉는 거리도 달라서 취향 문제다.
 */
const TEXT_SCALE_KEY = "voice-storybook:text-scale";
export const TEXT_SCALES = [
  { value: 0.85, label: "작게" },
  { value: 1, label: "보통" },
  { value: 1.2, label: "크게" },
  { value: 1.45, label: "아주 크게" },
] as const;

export function loadTextScale(): number {
  if (typeof window === "undefined") return 1;
  const v = Number(window.localStorage.getItem(acctKey(TEXT_SCALE_KEY)));
  return Number.isFinite(v) && v >= 0.6 && v <= 2 ? v : 1;
}

export function saveTextScale(scale: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(acctKey(TEXT_SCALE_KEY), String(scale));
}

/**
 * 소리 설정 — 책장 넘김 효과음과 배경음.
 * 효과음은 짧아 나레이션과 안 겹치니 기본 켬. 배경음은 낭독을 덮을 수 있어
 * 기본 끔 — 뷰어의 ♪ 버튼으로 켠다.
 */
const SFX_KEY = "voice-storybook:sfx";
const BGM_KEY = "voice-storybook:bgm";

export function loadSfxOn(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(acctKey(SFX_KEY)) !== "off";
}
export function saveSfxOn(on: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(acctKey(SFX_KEY), on ? "on" : "off");
}
export function loadBgmOn(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(acctKey(BGM_KEY)) === "on";
}
export function saveBgmOn(on: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(acctKey(BGM_KEY), on ? "on" : "off");
}

/**
 * 이어보기 — 책별로 마지막에 본 쪽을 저장한다. 서재로 나갔다 다시 들어오면
 * 읽던 쪽부터 보인다. 한 곳(맵)에 {책id: 쪽번호}로 모아 담는다.
 * 만들기 미리보기(id="new")는 일회성이라 저장하지 않는다.
 */
const PROGRESS_KEY = "voice-storybook:progress";

export function loadBookProgress(id: string): number {
  if (typeof window === "undefined" || !id || id === "new") return 0;
  try {
    const raw = window.localStorage.getItem(acctKey(PROGRESS_KEY));
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const v = map[id];
    return typeof v === "number" && v >= 0 ? v : 0;
  } catch {
    return 0;
  }
}

export function saveBookProgress(id: string, page: number): void {
  if (typeof window === "undefined" || !id || id === "new") return;
  try {
    const raw = window.localStorage.getItem(acctKey(PROGRESS_KEY));
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    map[id] = page;
    window.localStorage.setItem(acctKey(PROGRESS_KEY), JSON.stringify(map));
  } catch {
    // 저장 실패는 조용히 넘긴다 — 이어보기는 편의 기능이라 막으면 안 된다.
  }
}

/**
 * 내가 만든 책 — Supabase `books` 테이블에 저장한다. "우리 가족 책장"이 이 목록을 읽고,
 * /book/[id]가 JSON에 없는 id를 여기서 찾는다. 마스터는 RLS로 전 회원 책을 열람할 수 있다.
 * 삽화·음성은 무거우니 파일 자체는 cafe24 URL로 두고, 여기 data(jsonb)엔 그 URL만 들어간다.
 */
type BookRow = { id: string; owner: string; title: string | null; data: Book; hidden: boolean };

/** DB 행 → Book 객체 (id·hidden은 컬럼 값으로 덮어써 항상 최신). */
function rowToBook(r: BookRow): Book {
  return { ...(r.data as Book), id: r.id, hidden: r.hidden };
}

/** 현재 로그인한 회원의 책 (최신 먼저). */
export async function loadMyBooks(): Promise<Book[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const uid = await currentUid();
  if (!uid) return [];
  const { data } = await sb
    .from("books")
    .select("id,owner,title,data,hidden")
    .eq("owner", uid)
    .order("created_at", { ascending: false });
  return ((data as BookRow[]) ?? []).map(rowToBook);
}

/**
 * 책장에 뿌릴 가벼운 책 정보 — 제목·표지·쪽수만. 본문(pages)과 삽화는 안 받는다.
 *
 * 만든 동화는 삽화가 데이터 안에 들어 있어 한 권이 수 MB다. 책장이 그걸 통째로
 * 내려받느라 느렸다(피드백 5번). 여기서는 작은 표지(coverImage)만 읽어 수십 KB로 끝낸다.
 * 옛 책은 작은 표지가 없어서, 그 책들만 골라 첫 쪽 그림을 한 번 더 가져온다.
 */
export type ShelfBook = {
  id: string;
  lang: string;
  title: string;
  coverImage: string | null;
  pageCount: number | null;
  hidden: boolean;
};

export async function loadMyBooksBrief(): Promise<ShelfBook[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const uid = await currentUid();
  if (!uid) return [];
  const { data, error } = await sb
    .from("books")
    .select("id,title,hidden,lang:data->>lang,cover:data->>coverImage,n:data->>pageCount")
    .eq("owner", uid)
    .order("created_at", { ascending: false });
  // 가벼운 조회가 막히면(구버전 PostgREST 등) 예전 방식으로 물러난다 — 느려도 보이게.
  if (error) return (await loadMyBooks()).map(toShelfBook);

  const rows = (data ?? []) as {
    id: string;
    title: string | null;
    hidden: boolean;
    lang: string | null;
    cover: string | null;
    n: string | null;
  }[];
  const list: ShelfBook[] = rows.map((r) => ({
    id: r.id,
    lang: r.lang ?? "ko",
    title: r.title ?? "제목 없음",
    coverImage: r.cover,
    pageCount: r.n ? Number(r.n) : null,
    hidden: !!r.hidden,
  }));

  // 작은 표지가 없는 옛 책만 첫 쪽 그림을 따로 채운다(그래도 본문 전체보단 훨씬 가볍다).
  const legacy = list.filter((b) => !b.coverImage).map((b) => b.id);
  if (legacy.length > 0) {
    const { data: old } = await sb
      .from("books")
      .select("id,cover:data->pages->0->>image")
      .in("id", legacy);
    const byId = new Map(
      ((old ?? []) as { id: string; cover: string | null }[]).map((r) => [r.id, r.cover]),
    );
    for (const b of list) if (!b.coverImage) b.coverImage = byId.get(b.id) ?? null;
  }
  return list;
}

/* ── 기기 설정 → 계정 설정 이관 (한 번만) ──
 * 설정을 계정별로 나누기 전에는 모두 기기 공용 키에 저장돼 있었다. 그대로 두면
 * 쓰던 사람이 로그인했을 때 아이 정보·나라·성우가 전부 초기화된 것처럼 보인다.
 * 그래서 이 기기에서 '처음 로그인한 계정' 한 명에게만 기존 값을 물려주고,
 * 물려준 뒤에는 기기 공용 값을 지운다 — 다음 계정이 앞사람 설정을 물려받지 않게.
 */
const MOVED_KEY = "voice-storybook:prefs-moved";
const DEVICE_PREF_KEYS = [
  CHILD_KEY,
  LANG_KEY,
  TEXT_POS_KEY,
  SFX_KEY,
  BGM_KEY,
  PROGRESS_KEY,
  TEXT_SCALE_KEY,
  BOOK_LAYOUT_KEY,
  "voice-storybook:voice",
  "voice-storybook:voice-rate",
  "voice-storybook:theme",
];

export function migrateDevicePrefs(uid: string): void {
  if (typeof window === "undefined" || !uid) return;
  try {
    if (window.localStorage.getItem(`${MOVED_KEY}:${uid}`)) return; // 이 계정은 이미 처리됨
    // 이 기기에서 아직 아무도 물려받지 않았을 때만 물려준다.
    if (!window.localStorage.getItem(MOVED_KEY)) {
      for (const base of DEVICE_PREF_KEYS) {
        const v = window.localStorage.getItem(base);
        if (v !== null && window.localStorage.getItem(`${base}:${uid}`) === null) {
          window.localStorage.setItem(`${base}:${uid}`, v);
        }
      }
      for (const base of DEVICE_PREF_KEYS) window.localStorage.removeItem(base);
      window.localStorage.setItem(MOVED_KEY, uid);
    }
    window.localStorage.setItem(`${MOVED_KEY}:${uid}`, "1");
  } catch {
    /* 저장 공간 문제 등 — 이관은 편의 기능이라 실패해도 앱은 그대로 동작한다 */
  }
}

/* ── 책장 캐시 ──
 * 새로고침할 때마다 서버 응답을 기다리느라 책장이 잠깐 비어 보였다. 책은 자주
 * 바뀌지 않으니, 마지막으로 본 목록을 기기에 남겨 두고 즉시 그린 뒤 뒤에서 새로
 * 받아 갱신한다. 계정(uid)별로 저장해 다른 아이디의 책장이 보이지 않게 한다.
 */
const SHELF_CACHE_KEY = "voice-storybook:shelf";
/** localStorage 한도를 넘지 않게 — 옛 책 표지는 base64라 한 장이 1MB쯤 된다. */
const SHELF_CACHE_MAX = 1_500_000;

export function loadShelfCache(uid: string): ShelfBook[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${SHELF_CACHE_KEY}:${uid}`);
    if (!raw) return null;
    const v = JSON.parse(raw) as ShelfBook[];
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

export function saveShelfCache(uid: string, books: ShelfBook[]): void {
  if (typeof window === "undefined") return;
  try {
    let payload = JSON.stringify(books);
    // 너무 크면 표지를 빼고 제목만 남긴다 — 표지 없는 책장이라도 즉시 뜨는 게 낫다.
    if (payload.length > SHELF_CACHE_MAX) {
      payload = JSON.stringify(books.map((b) => ({ ...b, coverImage: null })));
    }
    window.localStorage.setItem(`${SHELF_CACHE_KEY}:${uid}`, payload);
  } catch {
    /* 용량 초과 등 — 캐시는 편의 기능이라 실패해도 그냥 넘어간다 */
  }
}

/** 이미 받아 둔 Book을 책장용 가벼운 형태로. */
export function toShelfBook(b: Book): ShelfBook {
  return {
    id: b.id,
    lang: b.lang,
    title: b.title,
    coverImage: b.coverImage ?? b.pages.find((p) => p.image)?.image ?? null,
    pageCount: b.pageCount ?? b.pages.length,
    hidden: !!b.hidden,
  };
}

/** 특정 회원의 책 (마스터 열람용 — RLS가 마스터만 허용). */
export async function loadUserBooks(userId: string): Promise<Book[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("books")
    .select("id,owner,title,data,hidden")
    .eq("owner", userId)
    .order("created_at", { ascending: false });
  return ((data as BookRow[]) ?? []).map(rowToBook);
}

/** 목록/개수용 가벼운 책 정보 (본문 data는 뺀다). */
export type BookBrief = { id: string; owner: string; title: string; hidden: boolean; createdAt: string };

/**
 * 내가 만든 동화 '권수'만 — 아무 내용도 내려받지 않는다(서버가 숫자만 센다).
 *
 * 만들기 화면이 권수 상한(10권)을 확인하려고 loadMyBooks()를 불렀는데, 그건 삽화가
 * base64로 들어 있는 data 컬럼까지 통째로 받는다. 숫자 하나 때문에 화면을 열 때마다
 * 수십 MB가 오갔고, 이게 Supabase 전송량(egress)을 태운 가장 큰 원인이었다.
 */
export async function countMyBooks(): Promise<number> {
  const sb = getSupabase();
  if (!sb) return 0;
  const uid = await currentUid();
  if (!uid) return 0;
  const { count, error } = await sb
    .from("books")
    .select("id", { count: "exact", head: true }) // head:true — 행은 안 받고 개수만
    .eq("owner", uid);
  if (error) return 0;
  return count ?? 0;
}

/**
 * 설정 '내 동화' 목록용 — 제목·숨김 여부만. 본문(data)은 받지 않는다.
 *
 * 예전엔 loadMyBooks()를 썼는데 그건 삽화까지 들어 있는 data 컬럼을 통째로
 * 내려받는다(한 권이 수 MB). 목록에 쓰는 건 제목·숨김뿐인데 10권이면 수십 MB를
 * 기다리게 되어, 설정 화면 전체가 그만큼 늦게 떴다.
 */
export async function loadMyBookBriefs(): Promise<BookBrief[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const uid = await currentUid();
  if (!uid) return [];
  const { data } = await sb
    .from("books")
    .select("id,owner,title,hidden,created_at")
    .eq("owner", uid)
    .order("created_at", { ascending: false });
  return ((data as { id: string; owner: string; title: string | null; hidden: boolean; created_at: string }[]) ?? [])
    .map((r) => ({ id: r.id, owner: r.owner, title: r.title ?? "제목 없음", hidden: r.hidden, createdAt: r.created_at }));
}

/**
 * 전 회원의 책을 한 번에 가벼운 형태로 (마스터 열람용 — RLS가 마스터만 허용).
 * 회원별 개수·목록을 회원 관리 화면에서 한눈에 보여주려고 owner로 묶어 쓴다.
 */
export async function loadAllBooksBrief(): Promise<BookBrief[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("books")
    .select("id,owner,title,hidden,created_at")
    .order("created_at", { ascending: false });
  return ((data as { id: string; owner: string; title: string | null; hidden: boolean; created_at: string }[]) ?? [])
    .map((r) => ({ id: r.id, owner: r.owner, title: r.title ?? "제목 없음", hidden: r.hidden, createdAt: r.created_at }));
}

/** book id로 찾기 — 본인 책(또는 마스터면 전체). 주소로 열기·마스터 열람에 쓴다. */
export async function loadMyBook(id: string): Promise<Book | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.from("books").select("id,owner,title,data,hidden").eq("id", id).maybeSingle();
  return data ? rowToBook(data as BookRow) : null;
}

/** 책 한 권을 주인(owner)까지 함께 가져온다 — 삽화 옮기기에서 폴더 이름을 정하는 데 쓴다. */
export async function loadBookWithOwner(id: string): Promise<{ book: Book; owner: string } | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.from("books").select("id,owner,title,data,hidden").eq("id", id).maybeSingle();
  if (!data) return null;
  const row = data as BookRow;
  return { book: rowToBook(row), owner: row.owner };
}

/**
 * 책의 내용(data)만 바꿔 쓴다. 주인(owner)은 건드리지 않는다.
 *
 * saveMyBook을 쓰면 안 되는 자리다 — 그건 owner를 '지금 로그인한 사람'으로 덮어서,
 * 마스터가 남의 책을 고치면 주인이 마스터로 바뀌어 버린다.
 *
 * RLS에 막히면 오류가 아니라 0줄이 돌아오므로(게시판에서 겪은 그 함정), 반드시
 * 바뀐 줄 수를 확인해서 성공 여부를 돌려준다.
 */
export async function updateBookData(id: string, book: Book): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const { data, error } = await sb.from("books").update({ data: book }).eq("id", id).select("id");
  return !error && Array.isArray(data) && data.length > 0;
}

export async function saveMyBook(book: Book): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const uid = await currentUid();
  if (!uid) return;
  await sb.from("books").upsert({
    id: book.id,
    owner: uid,
    title: book.title,
    data: book,
    hidden: !!book.hidden,
  });
}

/**
 * 옛 기기 저장(localStorage) 책을 현재 로그인 계정의 Supabase로 한 번 가져온다.
 * Supabase 전환 전에 만든 책(예: 지안이 동화)이 브라우저에 남아 있으면 되살린다.
 * 가져온 뒤 옛 키를 지워 중복 이관을 막는다. 가져온 권수를 돌려준다.
 */
const LEGACY_BOOKS_KEY = "voice-storybook:mybooks";
export async function migrateLegacyBooks(): Promise<number> {
  if (typeof window === "undefined") return 0;
  // 옮길 게 있는지부터 본다 — 옛 책이 없는 대부분의 사용자가 홈을 열 때마다
  // 서버 왕복을 한 번씩 헛되이 하고 있었다(책장이 늦게 뜨는 원인 중 하나).
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(LEGACY_BOOKS_KEY);
  } catch {
    return 0;
  }
  if (!raw) return 0;
  const sb = getSupabase();
  if (!sb) return 0;
  const uid = await currentUid();
  if (!uid) return 0;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return 0;
  }
  // 옛 포맷: { 회원id: Book[] } 또는 아주 옛 Book[] 배열.
  let books: Book[] = [];
  if (Array.isArray(parsed)) books = parsed as Book[];
  else if (parsed && typeof parsed === "object")
    books = Object.values(parsed as Record<string, Book[]>).flat();
  books = books.filter((b) => b && b.id && Array.isArray(b.pages));
  let n = 0;
  let anyFail = false;
  for (const b of books) {
    const { error } = await sb
      .from("books")
      .upsert({ id: b.id, owner: uid, title: b.title, data: b, hidden: !!b.hidden });
    if (error) anyFail = true;
    else n++;
  }
  // 데이터 유실 방지: 가져올 게 없었거나(=0권) 전부 성공했을 때만 옛 키를 지운다.
  // 하나라도 실패하면 키를 남겨 다음에 다시 시도할 수 있게 한다.
  if (!anyFail) {
    try {
      window.localStorage.removeItem(LEGACY_BOOKS_KEY);
    } catch {
      /* 무시 */
    }
  }
  return n;
}

/** 숨김/복원 — hidden 책은 책장에서 내려가고 주소로는 열린다. */
export async function setMyBookHidden(id: string, hidden: boolean): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from("books").update({ hidden }).eq("id", id);
}

export async function deleteMyBook(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from("books").delete().eq("id", id);
}
