/**
 * 설정 저장소 (localStorage). DB가 붙기 전까지 아이 정보·언어를 기기에 저장한다.
 * 설정 화면(⚙️)에서 쓰고, 만들기 위저드가 미리 채우는 데 쓴다.
 * Supabase가 붙으면 이 파일의 저장처만 DB로 바뀐다.
 */

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
 * 내가 만든 책 — 만들기에서 완성한 동화를 기기에 저장한다. "우리 가족 책장"이
 * 이 목록을 읽고, /book/[id]가 JSON에 없는 id를 여기서 찾는다.
 * DB(Supabase)가 붙기 전까지 localStorage. 삽화는 data URL이라 용량이 커질 수 있어
 * 최신 것부터 앞에 쌓고, 저장 실패(용량 초과 등)는 조용히 넘긴다.
 */
const MY_BOOKS_KEY = "voice-storybook:mybooks";

export function loadMyBooks(): Book[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(MY_BOOKS_KEY);
    const arr = raw ? (JSON.parse(raw) as Book[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function loadMyBook(id: string): Book | null {
  return loadMyBooks().find((b) => b.id === id) ?? null;
}

export function saveMyBook(book: Book): void {
  if (typeof window === "undefined") return;
  try {
    const books = loadMyBooks().filter((b) => b.id !== book.id);
    books.unshift(book); // 최신이 책장 맨 앞
    window.localStorage.setItem(MY_BOOKS_KEY, JSON.stringify(books));
  } catch {
    // 용량 초과 등 — 조용히 넘긴다(글은 작아 대개 문제 없다).
  }
}

/**
 * 숨김/복원 — 책장의 ×는 '숨김'이다(영구 삭제 아님). 실수로 눌러도 설정의
 * "숨긴 동화"에서 되살릴 수 있다. hidden 책은 책장에서만 내려가고 주소로는 열린다.
 * 완전 삭제(deleteMyBook)는 설정에서 따로 확인받아 한다.
 */
export function setMyBookHidden(id: string, hidden: boolean): void {
  if (typeof window === "undefined") return;
  try {
    const books = loadMyBooks().map((b) => (b.id === id ? { ...b, hidden } : b));
    window.localStorage.setItem(MY_BOOKS_KEY, JSON.stringify(books));
  } catch {
    // 조용히 넘긴다.
  }
}

export function deleteMyBook(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const books = loadMyBooks().filter((b) => b.id !== id);
    window.localStorage.setItem(MY_BOOKS_KEY, JSON.stringify(books));
  } catch {
    // 조용히 넘긴다.
  }
}
