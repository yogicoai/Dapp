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
