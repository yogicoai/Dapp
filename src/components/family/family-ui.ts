/**
 * 가족 화면끼리 같이 쓰는 작은 도우미 — 이름 부르기·순서·색·요청 만들기.
 * 화면(컴포넌트)은 이걸 import 만 하고, 데이터 규칙은 lib/family.ts 가 원본이다.
 * ('늘 그대로' 견주기·lockKey 는 lib/family.ts 의 currentLockKey·portraitLooksChanged·lockChanges 를 바로 쓴다.)
 */

import type { CSSProperties } from "react";
import {
  BEST_FRIEND_LABEL,
  currentLooksOf,
  familyLooksToPrompt,
  familyTitle,
  hasBatchim,
  isKidRole,
  ourChildrenNames,
  PORTRAIT_LOOKS_MAX,
  siblingGender,
  type FamilyLooks,
  type FamilyMember,
  type FamilyPortrait,
  type FamilyRole,
} from "@/lib/family";
import { PHOTO_REFUSED_MESSAGE } from "@/lib/family-photo";
import { GLASSES_LEGACY, GLASSES_NONE, glassesChoice, hasBeard } from "@/lib/look-options";
import { parentLooksToPrompt, type ChildPrefs, type Gender } from "@/lib/prefs";

export type Colors = { accent: string; accentDark: string; accentSoft: string };

/** 그리기 한 건의 상태 */
export type JobStatus = "wait" | "drawing" | "done" | "error";
export type Job = {
  status: JobStatus;
  message?: string;
  /**
   * 오류 갈래 — 화면이 충전 안내·다시 로그인 등 다른 버튼을 고른다.
   *  price : 화면이 보여 준 값보다 실제 값이 컸다(값은 안 나감) — 다시 하기 전에 확인 창을 띄운다.
   *  lost  : 응답을 잃었고 서버에도 닿지 못했다 — 다시 하기 전에 먼저 서버에 결과를 묻는다.
   *  photo : 올린 사진으로는 못 그렸다(형식·크기, 또는 그림 모델이 거절 — 값은 되돌렸다). 같은 사진으로 다시 하지
   *          않고 생김새 고르기로 가서 다른 사진이나 특징을 고르게 한다(사진은 이미 메모리에서 뺐다).
   */
  kind?: "insufficient" | "setup" | "login" | "busy" | "price" | "lost" | "photo" | "other";
  /**
   * 다 그렸을 때 확인 화면에 보일 한 줄 — 사진이 거절돼 같은 쿠키로 대신 그렸을 때(응답 photoFallback,
   * lib/family-photo PHOTO_FALLBACK_NOTE). 이 방문의 메모리에만 있다(저장하지 않는다).
   */
  note?: string;
};

/* ─────────────────────────── 글자 ─────────────────────────── */

// 받침은 lib/family hasBatchim 하나로 본다(명패·홈 인사와 같은 규칙).

/** 화면에 부를 이름 — 누나 수아 / 친구 서준 / 외할머니 / 하온. 이름 없는 단짝 친구는 '단짝 친구'. */
export function displayName(m: FamilyMember): string {
  if (m.role === "friend") return m.name ? `친구 ${m.name}` : BEST_FRIEND_LABEL;
  if (m.role === "sibling") return m.name ? `${m.callName} ${m.name}` : m.callName;
  return m.callName;
}

/** 사람 이름이면 '하온이'처럼 부르고, 호칭(엄마·형)이면 그대로 둔다. */
function personal(m: FamilyMember): { word: string; named: boolean } {
  if (m.role === "child") return { word: m.callName, named: true };
  if ((m.role === "sibling" || m.role === "friend") && m.name) return { word: m.name, named: true };
  return { word: displayName(m), named: false };
}

/** '하온이' · '지우' · '엄마' — 뒤에 '모습'처럼 명사가 붙는 자리 */
export function stemOf(m: FamilyMember): string {
  const { word, named } = personal(m);
  return named && hasBatchim(word) ? `${word}이` : word;
}

/** '하온이는' · '엄마는' · '형은' */
export function topicOf(m: FamilyMember): string {
  const { word, named } = personal(m);
  if (named) return `${stemOf(m)}는`;
  return `${word}${hasBatchim(word) ? "은" : "는"}`;
}

/** 낱말 뒤에 을/를 — '엄마·아빠를' */
export function withObject(word: string): string {
  return `${word}${hasBatchim(word) ? "을" : "를"}`;
}

/** '하온이를' · '엄마를' · '형을' */
export function objectOf(m: FamilyMember): string {
  const { word, named } = personal(m);
  if (named) return `${stemOf(m)}를`;
  return `${word}${hasBatchim(word) ? "을" : "를"}`;
}

/**
 * '우리 아이예요' 스위치 설명 — 켜면 명패가 어떻게 되는지 예로 보여 준다(이미 켠 형제까지 함께).
 * 예: 켜면 명패가 '하온·하린이네 가족'이 돼요
 *  - family: 지금 가족(이 형제가 들어 있어도 되고 아직 없어도 된다 — 더하기 시트)
 *  - sib: 이 형제 — 명패에는 **진짜 이름**만 선다(호칭 '남동생'으로 채우면 '우주·남동생네 가족'이 된다 — 사장님
 *    2026-09-30). 이름이 없으면 이름을 적으라고 알린다.
 *  - mode: 'add' = 더하기 시트(스위치는 바로 켜지고, 이름을 적어야 '넣기'가 된다 — 켠 뒤 알림은 시트가 따로 띄운다),
 *    'saved' = 사람 메뉴(이미 넣은 사람 — 이름을 저장해야 켜진다. 켠 채로 이름이 없는 예전 값이면 '명패엔 안 나와요').
 */
export function ourChildHint(
  childName: string | null | undefined,
  family: readonly FamilyMember[],
  sib: { id?: string; name?: string; callName: string; isOurChild?: boolean },
  mode: "add" | "saved" = "saved",
): string {
  const n = (sib.name ?? "").trim();
  if (!n) {
    if (mode === "add") return "이름을 적으면 명패에 같이 나와요";
    return sib.isOurChild ? "이름이 없어 명패엔 안 나와요 · 위에 이름을 적어 주세요" : "이름을 적으면 켤 수 있어요 · 명패에 이름이 같이 나와요";
  }
  const others = family.filter((m) => m.id !== sib.id);
  const names = [...ourChildrenNames(childName, others), n];
  return names.length >= 2 ? `켜면 명패가 '${familyTitle(names)}'이 돼요` : "켜면 명패에 이름이 같이 나와요";
}

export function ageText(age: number | null | undefined): string {
  if (typeof age !== "number" || age <= 0) return "";
  return age >= 9 ? "8살 넘었어요" : `${age}살`;
}

/** '2026년 가을' — 완성 액자 명패 */
export function seasonLabel(d: Date): string {
  const m = d.getMonth() + 1;
  const season = m >= 3 && m <= 5 ? "봄" : m >= 6 && m <= 8 ? "여름" : m >= 9 && m <= 11 ? "가을" : "겨울";
  return `${d.getFullYear()}년 ${season}`;
}

/** 사람 성별 — 아이는 설정 값, 형제는 호칭으로 어림, 친구는 고른 값, 어른은 없음 */
export function genderOf(m: FamilyMember, childGender?: Gender): Gender | undefined {
  if (m.role === "child") return childGender;
  if (m.role === "sibling") return m.gender ?? siblingGender(m.callName);
  if (m.role === "friend") return m.gender;
  return undefined;
}

/* ─────────────────────────── 색 ─────────────────────────── */

/** '#d97706' + 0.3 → 'rgba(217,119,6,0.3)'. 나라 색은 모두 6자리 hex 다. */
export function alpha(hex: string, a: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** 크림 종이 + 점 무늬(시안의 그림 종이) */
export function paperStyle(colors: Colors): CSSProperties {
  return {
    backgroundColor: colors.accentSoft,
    backgroundImage: "radial-gradient(rgba(161,92,62,.07) 1px, rgba(0,0,0,0) 1.3px)",
    backgroundSize: "7px 7px",
  };
}

/** 흰 바탕 그림(배경 지우기 실패)은 곱하기로 얹어 흰 네모가 안 보이게 한다. */
export function portraitBlend(p: FamilyPortrait | undefined): CSSProperties {
  return p?.opaque ? { mixBlendMode: "multiply" } : {};
}

/* ─────────────────────────── 스티커 ─────────────────────────── */

/**
 * 예시 가족 그림(단체 한 장, 투명 webp) — 여자아이면 딸 가족, 그 밖엔 아들 가족.
 * 홈 입구 액자·모아 보기 빈 액자·설정 '우리 가족 캐릭터' 줄이 같은 파일을 쓴다.
 */
export function familyExampleSrc(childGender: Gender | undefined): string {
  return `/family-example/group-${childGender === "girl" ? "girl" : "boy"}.webp`;
}

/**
 * 역할 스티커 — 얼굴 그림이 없을 때(타일·얼굴 동그라미·더하기 시트) 쓴다. 사장님 2026-09-28:
 * 할머니 정순, 할아버지 '이야기 할아버지', 남자 형제(형·오빠·남동생) 부끄, 여자 형제(누나·언니·여동생) 수아.
 */
export const ROLE_STICKER = {
  mom: "/icons/voices/parent-mom.webp",
  dad: "/icons/voices/parent-dad.webp",
  grandma: "/icons/voices/tc-jungsoon.webp",
  grandpa: "/icons/voices/tc-kwonil.webp",
  siblingBoy: "/icons/voices/tc-booqoo.webp",
  siblingGirl: "/icons/voices/tc-sua.webp",
  sibling: "/icons/occasion-sibling.webp",
  friend: "/icons/who-friends.webp",
} as const;

/** 이 사람의 스티커(얼굴 그림이 없을 때) */
export function stickerFor(m: FamilyMember, childGender?: Gender): string {
  switch (m.role) {
    case "child":
      return childGender === "boy" ? "/icons/gender-boy.webp" : childGender === "girl" ? "/icons/gender-girl.webp" : "/icons/gender-any.webp";
    case "mom":
    case "dad":
    case "grandma":
    case "grandpa":
      return ROLE_STICKER[m.role];
    case "sibling": {
      const g = m.gender ?? siblingGender(m.callName);
      return g === "boy" ? ROLE_STICKER.siblingBoy : g === "girl" ? ROLE_STICKER.siblingGirl : ROLE_STICKER.sibling;
    }
    case "friend":
      return m.gender === "boy" ? "/icons/gender-boy.webp" : m.gender === "girl" ? "/icons/gender-girl.webp" : ROLE_STICKER.friend;
  }
}

/** 호칭(형제 호칭 칩)으로 고른 스티커 — 더하기 시트에서 아직 사람이 없을 때 */
export function siblingSticker(callName: string): string {
  const g = siblingGender(callName);
  return g === "boy" ? ROLE_STICKER.siblingBoy : g === "girl" ? ROLE_STICKER.siblingGirl : ROLE_STICKER.sibling;
}

/* ─────────────────────────── 생김새 요약 ─────────────────────────── */

const s = (v: unknown): string => (typeof v === "string" && v.trim() ? v.trim() : "");
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(s).filter(Boolean) : []);

/** 안경 칩 글자 → 짧은 요약('동그란 안경' · '뿔테 안경' · '안경'). 안 쓰면 빈 글자. */
function glassesWord(l: FamilyLooks): string {
  const g = glassesChoice(l);
  if (!g || g === GLASSES_NONE) return "";
  if (g === GLASSES_LEGACY) return "안경";
  return g.endsWith("안경") ? g : `${g} 안경`;
}

/** 앞머리 칩 → 요약 글자('없어요(가르마)'는 괄호까지 보이지 않게 '가르마') */
function bangsWord(v: string): string {
  if (!v) return "";
  if (v === "없어요(가르마)") return "가르마";
  if (v === "없어요") return "앞머리 없음";
  if (v === "있어요") return "앞머리 있음";
  return `앞머리 ${v}`;
}

/**
 * 눈매 칩 → 요약 글자. 칩만으로 눈 얘기인 게 보이면('순한 눈매'·'가늘고 긴 눈'·'쌍꺼풀'·'웃으면 반달')
 * 앞말을 붙이지 않는다.
 */
function eyesWord(v: string): string {
  if (!v) return "";
  return /눈|쌍꺼풀|반달/.test(v) ? v : `눈매 ${v}`;
}

/** 수염 칩 → 요약 글자. '콧수염'·'구레나룻'·'면도 자국'은 그대로, '없어요'만 '수염 없음'. */
function beardWord(v: string): string {
  if (!v) return "";
  return v === "없어요" ? "수염 없음" : v;
}

/**
 * '늘 그대로'·'평소 옷' 두 줄 — 확인 화면에 보인다. 칩 글자를 가운뎃점으로 잇되, 줄 이름과 칩 글자가 겹치면
 * ('눈매 순한 눈매' · '수염 콧수염') 앞말을 뺀다.
 * 생김새 원본은 역할마다 다르다(아이 설정 looks · 엄마·아빠 parents · 그 밖 member.looks).
 */
export function looksSummary(m: FamilyMember, child: ChildPrefs | null): { lock: string; outfit: string } {
  const l = currentLooksOf(m, child);
  const kid = isKidRole(m.role);
  const lock = [
    [s(l.hairColor), s(l.hair)].filter(Boolean).join(" "),
    s(l.hairTexture),
    bangsWord(s(l.bangs)),
    s(l.face) && `얼굴 ${s(l.face)}`,
    eyesWord(s(l.eyes)),
    s(l.brows),
    s(l.skin) && `피부 ${s(l.skin)}`,
    s(l.build) && `${kid ? "몸집" : "체형"} ${s(l.build)}`,
    s(l.height) && `키 ${s(l.height)}`,
    glassesWord(l),
    hasBeard(m.role) ? beardWord(s(l.beard)) : "",
    ...list(l.marks),
  ].filter(Boolean);
  const color = s(l.color);
  const outfit = s(l.outfit);
  const outfitWords = [
    outfit ? [color, outfit].filter(Boolean).join(" ") : color ? `${color} 옷` : "",
    s(l.bottom),
    ...list(l.accessories),
    ...list(l.items),
  ].filter(Boolean);
  return { lock: lock.join(" · "), outfit: outfitWords.join(" · ") };
}

/** 생김새를 하나라도 골랐나(메모 포함) — 빈 글자·빈 목록·꺼진 값은 안 고른 것 */
export function looksPicked(l: FamilyLooks | undefined): boolean {
  return Object.values(l ?? {}).some((v) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== "" && v !== false));
}

/**
 * 이 사람 생김새를 하나라도 골랐나 — '특징만 저장됨' 카드가 '이 특징으로 그려요'와 '알아서 그려요'를 고른다.
 * 원본은 역할마다 다르다(아이 looks · 엄마·아빠 parents · 그 밖 member.looks — currentLooksOf).
 */
export function hasPickedLooks(m: FamilyMember, child: ChildPrefs | null): boolean {
  return looksPicked(currentLooksOf(m, child));
}

/**
 * 미리보기 '이렇게 그려요 — …' 와 서버에 보내는 생김새 한 줄(한국어).
 * 역할을 넘겨 수염은 아빠·할아버지만, 예전 글자는 새 글자로 적힌다(lib/family familyLooksToPrompt).
 * 늘 하는 것·늘 지니는 것(모자·머리핀·귀걸이·인형 …)은 넣지 않는다 — 캐릭터 그림에는 액세서리를 그리지 않는다
 * (사장님 2026-10-14 "모자 정도는 빠져야", "악세사리가 차 있으면 안 되는 거임"). 옷은 그대로.
 */
export function looksLine(m: FamilyMember, child: ChildPrefs | null): string {
  // 아이도 형제와 같은 문장 규칙으로(을/를·칩 글자 풀기·이런 점도 문장) — 한 가족 그림 안에서 말투가 갈리지 않게.
  // (이야기로 가는 줄 describeChild 는 만들기 화면의 looksToPrompt 를 그대로 쓴다.)
  if (m.role === "child") return familyLooksToPrompt(child?.looks, "child", { wear: false });
  if (m.role === "mom" || m.role === "dad") return parentLooksToPrompt(child?.parents?.[m.role], m.role, { wear: false });
  return familyLooksToPrompt(m.looks, m.role, { wear: false });
}

/* ─────────────────────────── 서버 요청 ─────────────────────────── */

export type PortraitRequest = {
  memberId: string;
  role: FamilyRole;
  callName: string;
  gender?: "girl" | "boy";
  age?: number;
  looks: string;
  styleRef?: string;
  /**
   * 이 사람 사진(선택) — 'data:image/jpeg;base64,…'(긴 변 1024px로 줄인 것, components/family/photo.ts).
   * 가족 화면 메모리에만 있던 것을 이 요청에 한 번 실어 보낸다. 서버는 그리기에만 쓰고 저장하지 않는다.
   * 응답을 잃었을 때 되묻는 길(GET)은 사진이 필요 없다.
   */
  photo?: string;
};

/** 그림 맞추기용 참고 그림 — 이미 고정된 다른 사람 하나(아이 우선). 자기 자신은 빼고. */
function pickStyleRef(family: FamilyMember[], selfId: string): string | undefined {
  const others = family.filter((f) => f.id !== selfId && f.portrait);
  const kid = others.find((f) => f.role === "child");
  return (kid ?? others[0])?.portrait?.ref;
}

/**
 * photo — 이 사람 사진(data URL, 메모리에만 있던 것). 없으면 칩(생김새 줄)으로만 그린다.
 * 사진이 있으면 칩은 보내지 않는다(사장님 2026-10-14 "중복 설정으로 인한 오류") — 예전엔 먼저 골라 둔 칩이 '옷 안내'로
 * 사진과 함께 갔고, 칩의 모자·안경·옷이 사진과 달라 사진으로 그린 그림에 섞여 들어갔다. 사진으로 그릴 때는 사진만 본다.
 */
export function portraitRequest(
  m: FamilyMember,
  child: ChildPrefs,
  family: FamilyMember[],
  photo?: string | null,
): PortraitRequest {
  const gender =
    m.role === "child"
      ? child.gender === "girl" || child.gender === "boy"
        ? child.gender
        : undefined
      : m.role === "sibling"
        ? (m.gender ?? siblingGender(m.callName))
        : m.role === "friend"
          ? m.gender
          : undefined;
  const age = m.role === "child" ? (child.age ?? undefined) : m.age;
  const styleRef = pickStyleRef(family, m.id);
  return {
    memberId: m.id,
    role: m.role,
    // 서버가 호칭을 12자까지 받는다(설정의 아이 이름은 20자까지라 잘라 보낸다).
    callName: (m.role === "child" ? child.name.trim() : m.callName).slice(0, 12),
    ...(gender ? { gender } : {}),
    ...(typeof age === "number" ? { age } : {}),
    // 서버가 받는 길이(PORTRAIT_LOOKS_MAX, 600자)까지 — 어른 칸을 다 채워도 약 320자라 잘리지 않는다.
    looks: photo ? "" : looksLine(m, child).slice(0, PORTRAIT_LOOKS_MAX),
    ...(styleRef ? { styleRef } : {}),
    ...(photo ? { photo } : {}),
  };
}

/**
 * 오류 응답 → 부모에게 보일 말. 서버(api/family/portrait)의 error 는 부모가 읽을 한국어로
 * 적혀 있고 '쿠키는 돌려드렸어요'도 실제로 돌려준 때만 붙으므로 그걸 먼저 쓴다.
 * 없거나 이상하면(HTML 오류 페이지 등) 상태 코드로 고른 말을 쓴다.
 */
export function jobError(status: number, data: unknown): Job {
  const d = data as { code?: unknown; error?: unknown } | null;
  const said = typeof d?.error === "string" && d.error.trim() && d.error.length <= 160 ? d.error.trim() : "";
  const msg = (fallback: string) => said || fallback;
  // 서버가 붙인 code 를 먼저 본다(login·input·setup·insufficient·timeout·busy·price·cancelled·draw …).
  // code 가 없을 때(배포 환경의 504 HTML 등)만 상태 코드로 짐작한다.
  const code =
    typeof d?.code === "string"
      ? d.code
      : ({ 400: "input", 401: "login", 402: "insufficient", 409: "busy", 503: "setup", 504: "timeout" } as Record<number, string>)[status];
  switch (code) {
    case "insufficient":
      return { status: "error", kind: "insufficient", message: msg("쿠키가 모자라 못 그렸어요.") };
    case "login":
      return { status: "error", kind: "login", message: "로그인이 풀렸어요. 다시 로그인해 주세요." };
    case "setup":
      return { status: "error", kind: "setup", message: msg("그림 그리기가 아직 준비 중이에요. 쿠키는 나가지 않았어요.") };
    case "timeout":
      return { status: "error", kind: "other", message: msg("시간이 너무 오래 걸렸어요. 잠시 뒤 다시 해 주세요.") };
    case "busy":
      return { status: "error", kind: "busy", message: msg("이 사람을 벌써 그리고 있어요. 잠시 뒤에 다시 해 주세요.") };
    case "price":
      return { status: "error", kind: "price", message: msg("값이 바뀌었어요. 다시 확인해 주세요.") };
    case "cancelled":
      return { status: "error", kind: "other", message: msg("결제가 취소돼 그림을 드리지 못했어요. 다시 해 주세요.") };
    case "input":
      return { status: "error", kind: "other", message: msg("요청이 잘못됐어요. 생김새를 다시 골라 주세요.") };
    case "photo":
      // 사진 형식·크기(값은 안 나감), 또는 그림 모델이 사진을 거절(값은 되돌림 — 서버 글에 '돌려드렸어요'가 붙는다).
      return { status: "error", kind: "photo", message: msg(PHOTO_REFUSED_MESSAGE) };
    default:
      return { status: "error", kind: "other", message: msg("그리다 멈췄어요. 잠시 뒤 다시 해 주세요.") };
  }
}
