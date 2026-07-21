/**
 * 설정 저장소 (localStorage). DB가 붙기 전까지 아이 정보·언어를 기기에 저장한다.
 * 설정 화면(⚙️)에서 쓰고, 만들기 위저드가 미리 채우는 데 쓴다.
 * Supabase가 붙으면 이 파일의 저장처만 DB로 바뀐다.
 */

export type Gender = "girl" | "boy" | "unspecified";

export type ChildPrefs = {
  name: string;
  age: number | null;
  gender: Gender;
};

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
