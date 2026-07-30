/**
 * 설정 저장소 (localStorage). DB가 붙기 전까지 아이 정보·언어를 기기에 저장한다.
 * 설정 화면(⚙️)에서 쓰고, 만들기 위저드가 미리 채우는 데 쓴다.
 * Supabase가 붙으면 이 파일의 저장처만 DB로 바뀐다.
 */

import { getSupabase } from "@/lib/supabase";
import type { Book } from "@/lib/types";

export type Gender = "girl" | "boy" | "unspecified";

export type ChildPrefs = {
  name: string;
  age: number | null;
  gender: Gender;
};

// 아이는 한 명만 저장한다. 형제 동화는 만들기에서 "누구랑 → 형·동생 + 이름"으로
// 다룬다 — 데이터를 여러 벌 들고 있지 않아 관리가 단순하다.
const CHILD_KEY = "voice-storybook:child";
const LANG_KEY = "voice-storybook:lang";

export function loadChild(): ChildPrefs | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CHILD_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as ChildPrefs;
    if (typeof v?.name !== "string") return null;
    return {
      name: v.name,
      age: typeof v.age === "number" ? v.age : null,
      gender: v.gender === "girl" || v.gender === "boy" ? v.gender : "unspecified",
    };
  } catch {
    return null;
  }
}

export function saveChild(child: ChildPrefs): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CHILD_KEY, JSON.stringify(child));
}

/** 아이 정보 비우기 — 새 계정으로 가입/로그아웃 시 이전 계정의 아이 정보가 남지 않게. */
export function clearChild(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CHILD_KEY);
}

export function loadLang(): string {
  if (typeof window === "undefined") return "ko";
  return window.localStorage.getItem(LANG_KEY) ?? "ko";
}

export function saveLang(lang: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LANG_KEY, lang);
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
  const v = window.localStorage.getItem(TEXT_POS_KEY) as TextPos | null;
  return v && TEXT_POSITIONS.includes(v) ? v : "bottom";
}

export function saveTextPos(pos: TextPos): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TEXT_POS_KEY, pos);
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
  return window.localStorage.getItem(SFX_KEY) !== "off";
}
export function saveSfxOn(on: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SFX_KEY, on ? "on" : "off");
}
export function loadBgmOn(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(BGM_KEY) === "on";
}
export function saveBgmOn(on: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(BGM_KEY, on ? "on" : "off");
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
    const raw = window.localStorage.getItem(PROGRESS_KEY);
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
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    map[id] = page;
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(map));
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
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return [];
  const { data } = await sb
    .from("books")
    .select("id,owner,title,data,hidden")
    .eq("owner", user.id)
    .order("created_at", { ascending: false });
  return ((data as BookRow[]) ?? []).map(rowToBook);
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

/** book id로 찾기 — 본인 책(또는 마스터면 전체). 주소로 열기·마스터 열람에 쓴다. */
export async function loadMyBook(id: string): Promise<Book | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.from("books").select("id,owner,title,data,hidden").eq("id", id).maybeSingle();
  return data ? rowToBook(data as BookRow) : null;
}

export async function saveMyBook(book: Book): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;
  await sb.from("books").upsert({
    id: book.id,
    owner: user.id,
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
  const sb = getSupabase();
  if (!sb) return 0;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return 0;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(LEGACY_BOOKS_KEY);
  } catch {
    return 0;
  }
  if (!raw) return 0;
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
      .upsert({ id: b.id, owner: user.id, title: b.title, data: b, hidden: !!b.hidden });
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
