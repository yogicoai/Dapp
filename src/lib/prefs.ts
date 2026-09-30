/**
 * 설정 저장소 (localStorage). DB가 붙기 전까지 아이 정보·언어를 기기에 저장한다.
 * 설정 화면(⚙️)에서 쓰고, 만들기 위저드가 미리 채우는 데 쓴다.
 * Supabase가 붙으면 이 파일의 저장처만 DB로 바뀐다.
 */

// 상대 경로로 부른다 — 테스트 러너가 @/ 별칭을 못 읽는다(story-cast.ts와 같은 이유).
import { acctKey, currentUid, getSupabase } from "./supabase.ts";
import type { Book } from "./types.ts";
import { interpretBookSave, type SaveBookResult } from "./book-jobs.ts";
import {
  familyLooksToPrompt,
  mergeFamily,
  mergeRemovals,
  normalizeFamily,
  normalizeLooksFor,
  normalizeRemovals,
  withoutRemoved,
  type FamilyMember,
  type FamilyRemoval,
  type FamilySide,
} from "./family.ts";
import { CHILD_MULTI_MAX, GLASSES_NONE, lookNoteMax, wearsGlassesType } from "./look-options.ts";
import { newerStudio, normalizeStudio, type FamilyStudio } from "./family-studio.ts";

export type Gender = "girl" | "boy" | "unspecified";

/**
 * 아이 생김새 — 동화 주인공을 "우리 애 같게" 만드는 재료.
 *
 * 기본은 칩으로 고른 몇 가지 특징이다 — 캐릭터 시트에 넣으면 "어? 우리 애 같네"가 나온다.
 * 전부 선택이라 아무것도 안 골라도 동화는 만들어진다.
 *
 * 사진(사장님 2026-09-29): 가족 캐릭터 화면(/family)에서만 칩 대신 사진 한 장으로 얼굴을 그릴 수 있다.
 * 약속은 "사진은 저장하지 않고, 그림을 그리는 데 한 번 쓰고 바로 지워요" — 그래서 이 파일(ChildPrefs·
 * FamilyMember·localStorage·profiles.child)에는 **사진 칸이 없고 앞으로도 두지 않는다.** 사진은 가족 화면의
 * 메모리(React state)에만 있다가 그리기 요청에 실려 가고, 서버도 그림 모델에 한 번 넘긴 뒤 버린다
 * (lib/family-photo.ts · api/family/portrait). 남는 것은 그린 그림과 '사진으로 그림' 표시(fromPhoto)뿐이다.
 */
export type ChildLooks = {
  hair?: string; // 머리 모양 (짧은 머리 / 단발 / 양갈래 …)
  hairTexture?: string; // 머리결 (생머리 / 웨이브 / 곱슬 / 파마)
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

/**
 * 고를 수 있는 나이 — 1~8세, 그리고 '8세 이상'.
 *
 * 만들기 화면과 설정 화면 두 곳에서 같은 목록을 써야 해서 여기 둔다.
 * 예전엔 각자 [3..8]을 들고 있어 한쪽만 고치면 어긋났다.
 */
export const AGES = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/**
 * '8세 이상'을 담는 값. 나이를 숫자 하나로 저장·전달하는 구조를 그대로 두려고
 * 9로 표시한다 — 글 분량 규칙의 마지막 갈래(8세 이상)로 자연스럽게 간다.
 */
export const AGE_OVER = 9;

/** 화면에 보여줄 나이 글자. 9는 숫자가 아니라 '8세 이상'으로 읽혀야 한다. */
export function ageLabel(age: number | null): string {
  if (age === null) return "";
  return age >= AGE_OVER ? "8세 이상" : `${age}세`;
}

/**
 * 엄마·아빠 생김새(할머니·할아버지도 같은 칸 — lib/family.ts FamilyLooks).
 *
 * 아이 특징은 부모가 고르는데 엄마·아빠는 알려 줄 방법이 없어서, 이야기 모델이
 * 매번 지어냈다. 실제로 안경을 안 쓰는 아빠가 6쪽 내내 안경잡이로 그려졌다.
 * 처음엔 머리·안경·옷 색만 받았는데, 가족 캐릭터(얼굴 고정)가 생기며 사장님 목록(2026-09-28)으로
 * 넓혔다 — 칩 글자는 lib/look-options.ts adultLookRows 가 원본이다. 모두 선택.
 *  - '늘 그대로'(얼굴 고정 뒤 바꾸면 '모습이 바뀌었어요'): hair ~ marks
 *  - '평소 옷'(이야기마다 바뀔 수 있다): outfit ~ note
 */
export type ParentLooks = {
  /** 머리 모양 — 역할마다 목록이 다르다(look-options ADULT_HAIR) */
  hair?: string;
  /** 앞머리 — 일자로 있어요·옆으로 넘겨요·시스루·없어요(가르마) */
  bangs?: string;
  /** 머리결 — 곧은 생머리·살짝 웨이브·굵은 웨이브·곱슬·파마 */
  hairTexture?: string;
  /** 머리 색 */
  hairColor?: string;
  /** 얼굴형 */
  face?: string;
  /** 눈매 */
  eyes?: string;
  /** 눈썹 */
  brows?: string;
  /** 피부 */
  skin?: string;
  /** 체형 */
  build?: string;
  /** 키 — 작은 편·보통·큰 편·아주 큰 편(단체 사진 키 비율, family.ts ADULT_HEIGHT_CM) */
  height?: string;
  /**
   * 안경을 쓰나(예전 호환). 종류(glassesType)를 고르면 그것에 맞춰 켜고 끈다(look-options glassesPatch).
   * 종류 없이 true 만 있는 예전 값은 '안경 씀'으로 살린다.
   */
  glasses?: boolean;
  /** 안경 종류 — 안 써요·동그란 안경·네모 안경·뿔테·반무테 */
  glassesType?: string;
  /** 수염(아빠·할아버지만) — 없어요·콧수염·턱수염·면도 자국·구레나룻 */
  beard?: string;
  /** 이런 점도(여러 개) — 보조개·주근깨·점·웃을 때 눈주름·덧니 */
  marks?: string[];
  /** 평소 옷 종류 */
  outfit?: string;
  /** 아래옷 */
  bottom?: string;
  /** 옷 색 */
  color?: string;
  /** 늘 하는 것(여러 개) — 시계·귀걸이·목걸이 … */
  accessories?: string[];
  /** 메모 한 줄 */
  note?: string;
};

export type ChildPrefs = {
  name: string;
  age: number | null;
  gender: Gender;
  looks?: ChildLooks;
  /** 엄마·아빠 생김새(선택). 동화에 엄마·아빠가 나올 때만 쓰인다. */
  parents?: { mom?: ParentLooks; dad?: ParentLooks };
  /**
   * 우리 가족 캐릭터(선택) — 역할과 그림만 든다(lib/family.ts). 아이·엄마·아빠 생김새는
   * 위 looks·parents 가 원본이다. 그림은 cafe24 주소만 — base64 를 여기 넣으면 로그인마다 통째로 오간다.
   */
  family?: FamilyMember[];
  /**
   * 가족 목록(넣기·빼기·생김새)을 마지막으로 바꾼 때(ISO). 기기·서버 값을 합칠 때 '누가 우리 가족인가'는
   * 더 나중에 바꾼 쪽을 따른다(lib/family.ts mergeFamily). 그림은 사람마다 더 새 그림을 남긴다.
   */
  familyAt?: string;
  /**
   * 가족에서 뺀 사람 기록(id·뺀 때). 합칠 때 사람은 두 목록의 합집합이고, 빼기는 이 기록으로만 전한다
   * (lib/family.ts mergeFamily) — 오래 열어 둔 화면의 옛 목록이 다른 기기에서 넣은 사람을 지우지 않게.
   * 늘 더하기만 한다(saveChild 가 이전 기록과 합친다).
   */
  familyRemoved?: FamilyRemoval[];
  /**
   * 홈 가족 액자를 접어 두었나(계정마다 저장 — 다른 기기에서도 그대로). 사장님 2026-09-28:
   * "아이디별로 열고 접은 값이 저장되게". false 도 그대로 둔다 — 다른 기기에서 펼친 것이 이겨야 한다.
   */
  homeFamilyFolded?: boolean;
  /**
   * 가족 사진관 — 단체 사진 뒤 배경(없으면 나라 배경)과 붙인 스티커(계정마다 — 다른 기기에서도 그대로).
   * 사장님 2026-09-30 "가족사진 뒤에 배경도 고객이 직접 지정할수 있게", "아이콘들도 … 스티커로" (lib/family-studio).
   * 빈 값({ bg: null, stickers: [] })도 그대로 둔다 — 다른 기기에서 되돌린 것이 이겨야 한다. 합칠 때는 나중에 꾸민 값(at)이 이긴다.
   */
  familyStudio?: FamilyStudio;
  /**
   * 이 값을 쓴 화면의 저장 모양 판(CHILD_SCHEMA). 옛 화면(가족 캐릭터 전 판)은 이 칸을 몰라 버린다 —
   * 서버 값에 이 칸이 없으면 옛 화면이 profiles.child 를 통째로 덮어쓴 것이다. 그때는 이 기기에 있던
   * 새 칸(엄마·아빠 얼굴형·키·안경 종류 …)을 되살려 다시 올린다(mergeRemoteChild).
   */
  schema?: number;
};

/**
 * 저장 모양 판 — 2: 가족 캐릭터(family·familyRemoved·homeFamilyFolded)·어른 생김새 칸 확장(2026-09-28).
 * 저장할 때마다 적는다. 옛 화면이 덮어쓰면 이 칸이 사라져 알아볼 수 있다.
 */
export const CHILD_SCHEMA = 2;

/** 저장된 값에서 생김새만 안전하게 골라낸다(모르는 값·형식은 버린다). */
function normalizeLooks(raw: unknown): ChildLooks | undefined {
  const v = raw as Partial<ChildLooks> | null | undefined;
  if (!v || typeof v !== "object") return undefined;
  const str = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim().slice(0, 30) : undefined);
  const list = (x: unknown) =>
    Array.isArray(x) ? x.map(str).filter((s): s is string => Boolean(s)).slice(0, CHILD_MULTI_MAX) : undefined;
  const rawMarks = list(v.marks);
  const legacyCurly = rawMarks?.includes("곱슬머리");
  const looks: ChildLooks = {
    hair: str(v.hair),
    // 예전의 '이런 점도 있어요 → 곱슬머리' 값은 새 단일 선택으로 자동 이전한다.
    hairTexture: str(v.hairTexture) ?? (legacyCurly ? "곱슬머리" : undefined),
    bangs: str(v.bangs),
    hairColor: str(v.hairColor),
    eyes: str(v.eyes),
    skin: str(v.skin),
    build: str(v.build),
    color: str(v.color),
    items: list(v.items),
    glasses: v.glasses === true ? true : undefined,
    marks: rawMarks?.filter((mark) => mark !== "곱슬머리"),
    // 자유 입력은 그림 프롬프트로 그대로 들어가므로 길이를 제한한다(입력 칸과 같은 lookNoteMax — 100자).
    note: typeof v.note === "string" && v.note.trim() ? v.note.trim().slice(0, lookNoteMax("child")) : undefined,
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
  const familyRemoved = normalizeRemovals((c as { familyRemoved?: unknown }).familyRemoved);
  return {
    name: c.name,
    age: typeof c.age === "number" ? c.age : null,
    gender: c.gender === "girl" || c.gender === "boy" ? c.gender : "unspecified",
    looks: normalizeLooks((c as { looks?: unknown }).looks),
    parents: normalizeParents((c as { parents?: unknown }).parents),
    // 가족 — 여기서 빠뜨리면 loadChild·로그아웃 백업을 지날 때마다 가족이 말없이 사라진다.
    // 뺀 기록에 걸린 사람(옛 화면이 옛 목록으로 저장한 것)은 읽을 때 뺀다 — 합치기(mergeFamily)와 같은 규칙.
    family: withoutRemoved(normalizeFamily((c as { family?: unknown }).family), familyRemoved),
    familyAt:
      typeof (c as { familyAt?: unknown }).familyAt === "string"
        ? (c as { familyAt: string }).familyAt.slice(0, 40)
        : undefined,
    familyRemoved,
    homeFamilyFolded:
      typeof (c as { homeFamilyFolded?: unknown }).homeFamilyFolded === "boolean"
        ? (c as { homeFamilyFolded: boolean }).homeFamilyFolded
        : undefined,
    // 모르는 배경·아이콘은 버리고 스티커는 그림·글자 합쳐 8개까지, 예전 크기(size)는 배율로(lib/family-studio normalizeStudio)
    familyStudio: normalizeStudio((c as { familyStudio?: unknown }).familyStudio),
    schema: typeof (c as { schema?: unknown }).schema === "number" ? (c as { schema: number }).schema : undefined,
  };
}

/**
 * 생김새를 그림 프롬프트에 넣을 한 줄로 만든다(한국어). 안 고른 항목은 빠진다.
 * 캐릭터 시트가 이 문장을 받아 주인공을 그리고, 그 시트가 모든 쪽의 기준이 된다.
 */
/**
 * 저장된 값에서 엄마·아빠 생김새만 안전하게 골라낸다(모르는 칸은 버리고, 빈 칸은 두지 않는다).
 * 예전 글자는 새 글자로 옮긴다 — 엄마 머리 '짧은 머리'→'숏컷', '묶은 머리'→'하나로 묶기',
 * '파마머리'→'굵은 웨이브 파마', 아빠 '아주 짧은 머리'→'반삭'. 종류 없는 glasses:true 는 그대로('안경 씀').
 * 수염은 아빠만 남긴다. 메모는 입력 칸과 같이 40자(lookNoteMax). (규칙 원본: lib/family.ts normalizeLooksFor)
 */
export function normalizeParents(raw: unknown): ChildPrefs["parents"] {
  const v = raw as { mom?: unknown; dad?: unknown } | null | undefined;
  if (!v || typeof v !== "object") return undefined;
  const mom: ParentLooks | undefined = normalizeLooksFor(v.mom, "mom");
  const dad: ParentLooks | undefined = normalizeLooksFor(v.dad, "dad");
  return mom || dad ? { ...(mom ? { mom } : {}), ...(dad ? { dad } : {}) } : undefined;
}

/**
 * 엄마·아빠 생김새를 한 줄로(자연스러운 한국어). 안 고른 항목은 빠지고, 아무것도 없으면 빈 문자열.
 * 안경은 늘 적는다(안 쓰면 '안경을 쓰지 않는다'). role 을 주면 수염은 아빠만 적는다('없어요'면 '수염이 없다').
 * 이 줄이 이야기(@@CHARACTER@@)와 캐릭터 시트·가족 그림 양쪽에 그대로 간다
 * (문장 규칙 원본: lib/family.ts familyLooksToPrompt — 할머니·할아버지와 같은 말투).
 */
export function parentLooksToPrompt(
  p: ParentLooks | undefined,
  role?: "mom" | "dad",
  opts: { clothes?: boolean } = {},
): string {
  if (!p) return "";
  return familyLooksToPrompt(p, role, opts);
}

/**
 * 아이 생김새 한 줄(한국어) — 이야기(describeChild)와 쪽 그림 설명에 간다.
 * opts.clothes=false 면 '좋아하는 옷 색'을 뺀다 — 옷은 책마다 이야기가 정한다(@@CHARACTER@@ 이 책의 옷 칸, 2026-09-29~).
 * 안 주면 예전 그대로(옛 대본을 이어 그릴 때).
 */
export function looksToPrompt(looks: ChildLooks | undefined, opts: { clothes?: boolean } = {}): string {
  if (!looks) return "";
  const parts: string[] = [];
  // 머리 — 색·모양·앞머리를 한 덩어리로 묶어야 그림이 헷갈리지 않는다.
  const hair = [looks.hairColor, looks.hair].filter(Boolean).join(" ");
  if (hair) parts.push(hair);
  if (looks.hairTexture) {
    const texture = {
      "곧은 생머리": "머리결은 곧은 생머리이며 웨이브·곱슬·파마가 전혀 없다",
      "살짝 웨이브": "머리결은 끝부분에만 부드러운 웨이브가 살짝 있다",
      곱슬머리: "머리결은 자연스럽고 촘촘한 곱슬머리다",
      파마머리: "머리 전체에 둥근 컬이 반복되는 파마머리다",
    }[looks.hairTexture] ?? `머리결은 ${looks.hairTexture}`;
    parts.push(texture);
  }
  if (looks.bangs) parts.push(`앞머리는 ${looks.bangs}`);
  if (looks.eyes) parts.push(`눈은 ${looks.eyes}`);
  if (looks.skin) parts.push(`피부는 ${looks.skin}`);
  if (looks.build) parts.push(looks.build);
  if (looks.glasses) parts.push("안경을 썼다");
  if (looks.color && opts.clothes !== false) parts.push(`${looks.color} 옷을 즐겨 입는다`);
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
/** 800ms 뒤에 올릴 값 — flushChildSave 가 기다리지 않고 바로 올릴 때 쓴다 */
let childRemotePending: ChildPrefs | null = null;

/**
 * 아이 정보를 저장한다 — **넘기지 않은 항목은 건드리지 않는다.**
 *
 * 예전엔 통째로 덮어썼다. 그래서 만들기에서 줄거리를 지을 때 부르는
 * `saveChild({ name, age, gender })` 한 줄이 애써 고른 아이 특징(looks)과
 * 엄마·아빠 특징(parents)을 로컬에서도 서버에서도 지워 버렸다. 부모 눈에는
 * "설정에서 골랐는데 동화 한 번 만들면 다 사라진다"로 보였다(2026-09-07).
 *
 * 지우고 싶을 때는 빈 값을 **명시해서** 넘기면 된다({ looks: {} } 처럼).
 * 설정 화면은 늘 다섯 항목을 다 넘기므로 지우기도 그대로 동작한다.
 */
export function saveChild(child: Partial<ChildPrefs> & { name: string }): void {
  if (typeof window === "undefined") return;
  const prev = loadChild();
  const merged: ChildPrefs = {
    name: child.name,
    age: child.age !== undefined ? child.age : (prev?.age ?? null),
    gender: child.gender ?? prev?.gender ?? "unspecified",
    looks: "looks" in child ? child.looks : prev?.looks,
    parents: "parents" in child ? child.parents : prev?.parents,
    family: "family" in child ? child.family : prev?.family,
    // 가족을 넘겼으면 '지금 바꿈'으로 적는다 — 서버·다른 기기 값과 합칠 때 이 목록의 칸(이름·순서 …)이 이긴다.
    familyAt: "family" in child ? (child.familyAt ?? new Date().toISOString()) : prev?.familyAt,
    // 뺀 기록은 늘 더하기만 — 넘긴 기록(방금 뺀 사람)을 저장된 기록에 합친다.
    familyRemoved: mergeRemovals(prev?.familyRemoved, child.familyRemoved),
    homeFamilyFolded: "homeFamilyFolded" in child ? child.homeFamilyFolded : prev?.homeFamilyFolded,
    familyStudio: "familyStudio" in child ? child.familyStudio : prev?.familyStudio,
    schema: CHILD_SCHEMA,
  };
  window.localStorage.setItem(acctKey(CHILD_KEY), JSON.stringify(merged));
  // 계정별 로컬 백업 + Supabase 저장 — 로그아웃/재로그인/기기 변경에도 유지된다.
  // 연타를 800ms로 묶어 네트워크를 아낀다.
  if (childRemoteTimer) clearTimeout(childRemoteTimer);
  childRemotePending = merged;
  childRemoteTimer = setTimeout(flushChildSave, 800);
}

/**
 * 800ms 묶음을 기다리지 않고 **지금** 서버에 올린다(기다리는 저장이 없으면 아무것도 안 한다).
 * 가족 사진 꾸미기 시트를 닫을 때·앱을 내릴 때(pagehide·화면 숨김) — 꾸미고 바로 앱을 닫아도 다른 기기에 간다.
 * 그래도 못 올라갔으면(오프라인) 이 기기 값이 더 새것이라 다음 불러오기(loadChildRemote)가 다시 올린다.
 */
export function flushChildSave(): void {
  if (childRemoteTimer) clearTimeout(childRemoteTimer);
  childRemoteTimer = null;
  const c = childRemotePending;
  childRemotePending = null;
  if (c) void saveChildRemote(c).catch(() => {});
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
    // ① 계정 로컬 백업 — 가족은 지금 이 기기 값과 합쳐서 쓴다(예약이 도는 사이 받은 그림을 옛 값으로 덮지 않게).
    absorbLocal(uid, child, "self");
  }
  try {
    // ② Supabase — 가족은 서버 값과 합쳐서 올린다(pushChild). 컬럼이 없으면 조용히 넘어간다.
    const pushed = await pushChild(sb, uid, child);
    if (pushed && typeof window !== "undefined") absorbLocal(uid, pushed, "family");
  } catch {
    /* child 컬럼 전(마이그레이션 안 함) 등 — 로컬 백업만으로 동작 */
  }
}

type Sb = NonNullable<ReturnType<typeof getSupabase>>;

/**
 * 아이 정보를 서버에 올린다 — **가족 목록은 서버 것과 사람별로 합쳐서**(mergeFamily).
 *
 * 가족은 profiles.child 한 덩어리에 같이 실려 있다. 그래서 설정 저장·만들기의 이름 저장·홈 접기·
 * 로그아웃 백업처럼 가족과 상관없는 저장도, 이 기기의 옛 가족 목록으로 서버를 통째로 덮어 다른 기기에서
 * 쿠키를 내고 그린 그림을 지우고 있었다(2026-09-28 검토 지적). 올리기 직전에 서버 값을 읽어 합친다:
 * 누가 가족인가는 나중에 바꾼 쪽, 그림은 사람마다 더 새것. 서버에 실제로 들어간 값(합친 것)을 돌려준다.
 * 서버를 읽지 못하면 올리지 않는다(null) — 모르는 채로 덮는 것보다 낫다.
 */
async function pushChild(sb: Sb, uid: string, child: ChildPrefs): Promise<ChildPrefs | null> {
  const { data, error: readError } = await sb.from("profiles").select("child").eq("id", uid).maybeSingle();
  if (readError) return null;
  const server = normalizeChild((data as { child?: unknown } | null)?.child);
  const fam = mergeFamily(familySide(server), familySide(child));
  // 가족 사진관은 나중에 꾸민 쪽 — 오래 열어 둔 기기의 접기·설정 저장이 다른 기기에서 방금 꾸민 값을 되돌리거나
  // (이 기기에 아직 사진관 값이 없으면) 지우지 않게.
  const merged: ChildPrefs = {
    ...child,
    ...fam,
    familyStudio: newerStudio(server?.familyStudio, child.familyStudio),
    schema: CHILD_SCHEMA,
  };
  const { data: rows, error } = await sb.from("profiles").update({ child: merged }).eq("id", uid).select("id");
  if (error || !Array.isArray(rows) || rows.length === 0) return null;
  return merged;
}

/**
 * 계정 로컬 값에 다른 값을 합쳐 쓴다 — 가족은 늘 사람별로 합친다(그 사이 이 기기에 들어온 그림을 지키게).
 *  "self"   : 이름·생김새 같은 나머지 칸은 넘긴 값(c)으로 — 이 기기에서 방금 저장한 값이다.
 *  "family" : 나머지 칸은 로컬 그대로 두고 가족만 합친다 — 서버에서 받아 온 가족을 흡수할 때.
 */
function absorbLocal(uid: string, c: ChildPrefs, how: "self" | "family"): void {
  const key = acctChildKey(uid);
  const local = normalizeChild(window.localStorage.getItem(key));
  const fam = mergeFamily(familySide(c), familySide(local));
  const base = how === "self" || !local ? c : local;
  window.localStorage.setItem(key, JSON.stringify({ ...base, ...fam }));
}

/** 합치기(mergeFamily)에 넘길 가족 세 칸 — 목록·바꾼 때·뺀 기록 */
function familySide(c: ChildPrefs | null | undefined): FamilySide {
  return { family: c?.family, familyAt: c?.familyAt, familyRemoved: c?.familyRemoved };
}

/**
 * 가족 목록을 **바로** 저장하고 서버에 실제로 들어갔는지 확인한다.
 *
 * saveChild 는 800ms 뒤에 올리고 실패해도 말이 없다. 가족 그림은 쿠키를 내고 받은 것이라
 * '고정'했는데 서버 저장이 조용히 실패하면 다른 기기에서 그림이 사라진다. 그래서 고정·그리기
 * 결과만은 이 함수로 바로 올리고, 결과(true=서버 저장됨)를 화면이 알 수 있게 한다.
 * 로컬(이 기기)에는 늘 먼저 쓴다 — 서버가 실패해도 이 기기에서는 남고, familyAt 이 서버보다 새것이라
 * 다음 불러오기(loadChildRemote) 때 서버 값에 덮이지 않고 합쳐진 뒤 서버에 다시 올라간다.
 * 서버에는 서버 값과 사람별로 합쳐 올린다(pushChild) — 다른 기기에서 그린 그림을 지우지 않게.
 * 합친 결과는 이 기기 값에도 들어간다(화면은 loadChild 로 다시 읽으면 된다).
 */
export async function saveFamilyNow(family: FamilyMember[]): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const prev = loadChild();
  if (!prev) return false;
  const merged: ChildPrefs = { ...prev, family, familyAt: new Date().toISOString(), schema: CHILD_SCHEMA };
  window.localStorage.setItem(acctKey(CHILD_KEY), JSON.stringify(merged));
  const sb = getSupabase();
  if (!sb) return false;
  try {
    const uid = await currentUid();
    if (!uid) return false;
    absorbLocal(uid, merged, "self");
    const pushed = await pushChild(sb, uid, merged);
    if (!pushed) return false;
    absorbLocal(uid, pushed, "family");
    return true;
  } catch {
    return false;
  }
}

/**
 * 서버 값과 이 기기 값을 합친다 — 서버가 우선이되, **나중에 생긴 항목은 서버에 없으면 지키다**.
 *
 * 아이 특징(looks)과 엄마·아빠 특징(parents)은 앱이 나온 뒤에 생긴 기능이다. 그래서 서버에
 * 저장된 아이 정보가 이름·나이·성별만 들어 있는 계정이 많다. 통째로 갈아끼우면 방금 고른
 * 특징이 불러올 때마다 지워져서 "저장이 안 된다"가 된다 — looks 에서 한 번 겪은 사고인데
 * parents 는 그때 같이 고치지 않아 엄마·아빠 특징만 계속 사라지고 있었다(2026-09-07).
 *
 * (다른 기기에서 특징을 **지운** 경우 이 기기 것이 되살아날 수 있지만, 애써 고른 걸
 *  말없이 잃는 쪽보다 낫다.)
 *
 * 옛 화면이 덮어쓴 서버 값(schema 칸이 없음 — 배포가 넘어가는 동안 새로 고치지 않은 탭·PWA)이면, 옛 화면이
 * 모르는 엄마·아빠 새 칸(얼굴형·키·안경 종류·이런 점도 …)은 이 기기 값에서 되살린다(healParents).
 * 가족 목록은 옛 화면이 버려도 mergeFamily 가 이 기기 목록을 지킨다. 되살린 값은 loadChildRemote 가 다시 올린다.
 */
export function mergeRemoteChild(
  remote: ChildPrefs,
  local: ChildPrefs | null,
): ChildPrefs {
  // 가족은 통째로 고르지 않고 사람별로 합친다(mergeFamily) — 서버 저장이 실패해 이 기기에만 있는
  // 그림이 서버의 옛 목록에 덮여 사라지지 않게. 사람은 합집합, 빼기는 뺀 기록(familyRemoved)으로만 전한다.
  const fam = mergeFamily(familySide(remote), familySide(local));
  const oldWriter = remote.schema === undefined && local?.schema !== undefined;
  return {
    ...remote,
    looks: remote.looks ?? local?.looks,
    parents: oldWriter ? healParents(remote.parents, local?.parents) : (remote.parents ?? local?.parents),
    ...fam,
    homeFamilyFolded: remote.homeFamilyFolded ?? local?.homeFamilyFolded,
    // 사진관은 나중에 꾸민 값(at)이 이긴다 — 빈 값(되돌림)도. 같은 때면 서버. 서버에 없거나(옛 화면이 버림) 이 기기
    // 값이 더 새것(서버에 못 올라간 꾸미기)이면 이 기기 값을 지키고, 아래 loadChildRemote 가 서버에 다시 올린다.
    familyStudio: newerStudio(remote.familyStudio, local?.familyStudio),
    schema: remote.schema ?? local?.schema,
  };
}

/** 옛 화면(가족 캐릭터 전 판)도 아는 엄마·아빠 칸 — 이 칸들은 서버(옛 화면이 쓴) 값을 따른다 */
const OLD_PARENT_KEYS = ["hair", "color", "note"] as const;

/**
 * 옛 화면이 덮어쓴 엄마·아빠 값에 이 기기의 새 칸을 되살린다. 옛 화면이 아는 칸(머리 모양·옷 색·메모·안경
 * 쓰나)은 서버 값이 이긴다 — 옛 화면에서 방금 고친 것일 수 있다. 안경은 옛 화면이 '쓰나/안 쓰나'만 알아서,
 * 서버가 '안 씀'이면 종류도 지우고, '씀'인데 이 기기 종류가 '안 써요'·없음이면 종류 없는 '안경 씀'으로 둔다.
 */
function healParents(remote: ChildPrefs["parents"], local: ChildPrefs["parents"]): ChildPrefs["parents"] {
  if (!local) return remote;
  // 서버에 엄마·아빠 칸이 아예 없으면 예전처럼 이 기기 값을 그대로 지킨다(서버가 뒤처진 경우 포함).
  if (!remote) return local;
  const out: NonNullable<ChildPrefs["parents"]> = {};
  for (const role of ["mom", "dad"] as const) {
    const r = remote?.[role];
    const l = local[role];
    if (!l) {
      if (r) out[role] = r;
      continue;
    }
    const merged: ParentLooks = { ...l };
    for (const k of OLD_PARENT_KEYS) merged[k] = r?.[k];
    if (r?.glasses === true) {
      merged.glasses = true;
      if (!wearsGlassesType(l.glassesType)) merged.glassesType = undefined;
    } else {
      merged.glasses = undefined;
      if (l.glassesType !== GLASSES_NONE) merged.glassesType = undefined;
    }
    const n = normalizeLooksFor(merged, role);
    if (n) out[role] = n;
  }
  return out.mom || out.dad ? out : undefined;
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
    // ② Supabase에 값이 있으면 우선 (다른 기기·재설치 복구)
    const { data, error } = await sb
      .from("profiles")
      .select("child")
      .eq("id", uid)
      .maybeSingle();
    // ① 계정별 로컬 백업 (SQL 없이도 같은 기기 재로그인 복구) — 서버 답을 받은 **뒤에** 읽는다.
    // 기다리는 사이 가족 화면이 저장한 것(방금 받은 그림)을 옛 값으로 덮지 않게.
    let child = normalizeChild(window.localStorage.getItem(acctChildKey(uid)));
    let remote: ChildPrefs | null = null;
    if (!error) {
      remote = normalizeChild((data as { child?: unknown } | null)?.child);
      if (remote) child = mergeRemoteChild(remote, child);
    }
    if (child && typeof window !== "undefined") {
      // 계정별 키에만 쓴다 — loadChild()가 읽는 자리가 바로 여기다(acctKey(CHILD_KEY)와 같은 키).
      // 기기 공용 키에는 쓰지 않는다: 나중에 다른 계정·비회원이 이 값을 물려받으면 안 된다.
      window.localStorage.setItem(acctChildKey(uid), JSON.stringify(child));
    }
    // 이 기기에만 있던 가족(서버 저장이 실패했던 그림·고정·뺀 기록 등)이 합쳐졌거나, 옛 화면이 덮어쓴 값에서
    // 새 칸을 되살렸으면(서버에 schema 없음) 서버에도 올린다. 가족 사진관도 — 이 기기 값이 이겼으면(서버에 못 올라간
    // 꾸미기, 옛 화면이 schema 2 를 찍으며 버린 칸) 서버에 다시 올린다.
    const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    if (
      remote &&
      child &&
      (!same(child.family, remote.family) ||
        !same(child.familyRemoved, remote.familyRemoved) ||
        !same(child.familyStudio, remote.familyStudio) ||
        (remote.schema === undefined && child.schema !== undefined))
    ) {
      void pushChild(sb, uid, child).catch(() => {});
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
    // 가족은 서버 값과 합쳐서 올린다 — 오래 열어 둔 화면에서 로그아웃해도 다른 기기에서 그린 그림을 안 지운다.
    const c = normalizeChild(raw);
    if (c) await pushChild(sb, uid, c);
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
 * 동화 이어서 듣기 — 한 편을 끝까지 읽어 주면 "다음 동화 보기"를 묻지 않고
 * 같은 서가의 다음 동화를 바로 틀어 준다(2026-09-20 사장님 요청).
 * 잠자리에 틀어 두면 한 편마다 화면을 눌러 줄 사람이 없다.
 * 기본은 끔 — 켜 두면 서가 끝까지 계속 이어지므로 부모가 골라서 켠다.
 */
const AUTO_NEXT_KEY = "voice-storybook:auto-next";

export function loadAutoNext(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(acctKey(AUTO_NEXT_KEY)) === "on";
}
export function saveAutoNext(on: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(acctKey(AUTO_NEXT_KEY), on ? "on" : "off");
  // 계정에도 남긴다 — 기기를 바꿔도 따라가게. 실패해도 위 한 줄로 이 기기에선 그대로 동작한다.
  void saveAutoNextRemote(on).catch(() => {});
}

/** 계정별 로컬 백업 키 — 로그아웃해도 지우지 않는다(SQL 없이도 재로그인 복구). */
const acctAutoNextKey = (uid: string) => `${AUTO_NEXT_KEY}:${uid}`;

/**
 * 이어서 틀기를 로그인 계정에 남긴다: ① 계정별 로컬 백업(SQL 없이도 동작)
 * ② Supabase profiles.auto_next (컬럼 있으면).
 *
 * 아이 정보(child)와 같은 두 겹 구조다. 컬럼이 없는 DB 에서도 조용히 넘어가므로
 * supabase-auto-next.sql 을 아직 안 돌렸어도 앱이 깨지지 않는다.
 */
export async function saveAutoNextRemote(on: boolean): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const uid = await currentUid();
  if (!uid) return;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(acctAutoNextKey(uid), on ? "on" : "off"); // ① 계정 로컬 백업
  }
  try {
    await sb.from("profiles").update({ auto_next: on }).eq("id", uid); // ② Supabase
  } catch {
    /* auto_next 컬럼 전(마이그레이션 안 함) 등 — 로컬 백업만으로 동작 */
  }
}

/**
 * 로그인 계정의 이어서 틀기 설정을 되살려 이 기기에 반영한다 (재로그인·기기변경 복구).
 * 계정별 로컬 백업을 먼저 보고, Supabase 에 값이 있으면 그걸 우선한다.
 *
 * 서버 값이 우선인 까닭 — 이 설정은 참/거짓 하나뿐이라 합칠 것이 없고,
 * 마지막으로 끈 기기의 뜻이 가장 최근 뜻이다.
 */
export async function loadAutoNextRemote(): Promise<boolean | null> {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const uid = await currentUid();
    if (!uid) return null;
    // ① 계정별 로컬 백업 (SQL 없이도 같은 기기 재로그인 복구)
    const backup = window.localStorage.getItem(acctAutoNextKey(uid));
    let on = backup === null ? null : backup === "on";
    // ② Supabase 에 값이 있으면 우선 (다른 기기·재설치 복구)
    const { data, error } = await sb
      .from("profiles")
      .select("auto_next")
      .eq("id", uid)
      .maybeSingle();
    if (!error) {
      const remote = (data as { auto_next?: unknown } | null)?.auto_next;
      if (typeof remote === "boolean") on = remote;
    }
    if (on === null) return null;
    if (typeof window !== "undefined") {
      // 이 계정 키에만 쓴다 — loadAutoNext() 가 읽는 자리가 바로 여기다.
      window.localStorage.setItem(acctKey(AUTO_NEXT_KEY), on ? "on" : "off");
      window.localStorage.setItem(acctAutoNextKey(uid), on ? "on" : "off");
    }
    return on;
  } catch {
    return null;
  }
}

/**
 * 다음 동화를 열면서 "열리자마자 읽어 줘"를 넘기는 쪽지(한 번 쓰고 지운다).
 * 주소에 붙이지 않는 까닭 — 새로고침·뒤로 가기로 같은 주소를 다시 열 때마다
 * 저절로 소리가 나면 안 된다. 탭 하나에서만 한 번 읽히는 sessionStorage 에 둔다.
 */
const AUTOPLAY_NEXT_KEY = "voice-storybook:autoplay-next";

export function markAutoplayNext(bookId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(AUTOPLAY_NEXT_KEY, bookId);
  } catch {
    // 저장이 막힌 환경 — 이어서 틀지 못할 뿐 넘어가는 건 된다.
  }
}
/** 이 책이 '이어서 틀기'로 열렸나 — 들여다보기만 하고 지우지 않는다. */
export function hasAutoplayNext(bookId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(AUTOPLAY_NEXT_KEY) === bookId;
  } catch {
    return false;
  }
}
/**
 * 쪽지를 가져가며 지운다 — 실제로 읽기 시작하는 순간에만 부른다.
 * 열리자마자 지우면, 개발 모드에서 효과가 두 번 도는 사이 첫 번째가 지워 버려
 * 두 번째(진짜)가 읽지 못한다.
 */
export function takeAutoplayNext(bookId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.sessionStorage.getItem(AUTOPLAY_NEXT_KEY) !== bookId) return false;
    window.sessionStorage.removeItem(AUTOPLAY_NEXT_KEY);
    return true;
  } catch {
    return false;
  }
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
/**
 * 한글을 '완성형(NFC)'으로 맞춘다 — 글자가 깨져 보이던 원인.
 *
 * 같은 '얘'라도 한 글자로 저장된 것(U+C598)과 ㅇ+ㅒ로 쪼개져 저장된 것(U+110B U+1164)이
 * 있는데, 동화책 글꼴(Dongle)에는 쪼개진 자모가 없어서 그 글자만 ◆? 로 나왔다.
 * 겉보기는 같은 글자라 눈으로는 원인을 못 찾는다.
 *
 * 낭독 색칠도 같이 고쳐진다 — 색칠은 '몇 번째 글자까지'로 도는데, 쪼개진 글자는
 * 한 글자가 둘로 세어져 색칠이 밀렸다.
 */
function toNfc<T extends string | null | undefined>(v: T): T {
  return (typeof v === "string" ? (v.normalize("NFC") as T) : v);
}

function rowToBook(r: BookRow): Book {
  const b = r.data as Book;
  return {
    ...b,
    id: r.id,
    hidden: r.hidden,
    // 이미 저장된 책도 열 때 고쳐 보여 준다 — 다시 만들 필요 없이 바로 정상으로 보인다.
    title: toNfc(b.title),
    summary: toNfc(b.summary),
    pages: (b.pages ?? []).map((p) => ({ ...p, text: toNfc(p.text) })),
  };
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

/* ── 책장 한 줄에 몇 권 ──
 * 넓은 화면에서 한 줄에 몇 권을 놓을지. 책 크기는 그대로 두고 책장 폭만 줄여서
 * 줄당 권수를 정한다 — 칸에 맞춰 책을 늘리면 3권일 때 책이 우스꽝스럽게 커진다.
 * 휴대폰은 화면이 좁아 2권으로 고정된다(설정과 무관).
 */
export const SHELF_COLS = [3, 4, 5, 6] as const;
export type ShelfCols = (typeof SHELF_COLS)[number];
const SHELF_COLS_KEY = "voice-storybook:shelf-cols";
/** 기본 5 — 지금 넓은 화면에서 자연스럽게 놓이던 권수와 같다(바꾸기 전과 똑같이 보인다). */
const DEFAULT_SHELF_COLS: ShelfCols = 5;

export function loadShelfCols(): ShelfCols {
  if (typeof window === "undefined") return DEFAULT_SHELF_COLS;
  try {
    const n = Number(window.localStorage.getItem(acctKey(SHELF_COLS_KEY)));
    return (SHELF_COLS as readonly number[]).includes(n) ? (n as ShelfCols) : DEFAULT_SHELF_COLS;
  } catch {
    return DEFAULT_SHELF_COLS;
  }
}

export function saveShelfCols(n: ShelfCols): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(acctKey(SHELF_COLS_KEY), String(n));
  } catch {
    /* 무시 */
  }
}

/* ── 동화 본문 글꼴 ──
 * 전부 무료·오픈소스(OFL) 글꼴이다.
 *
 * scale이 필요한 이유: 같은 글자 크기(px)를 줘도 글꼴마다 실제로 보이는 크기가
 * 꽤 다르다. 특히 동글체는 글자가 작게 잡혀 있어서 지금 본문 크기가 그에 맞춰
 * 크게 잡혀 있는데, 그대로 다른 글꼴로 바꾸면 글자가 확 커진다.
 * 그래서 글꼴마다 배율을 함께 들고 다니며 눈에 보이는 크기를 맞춘다.
 *
 * leading도 같이 둔다 — 글꼴마다 글자 위아래 여백이 달라 같은 줄 간격 숫자가
 * 다르게 보인다(동글체가 특히 넓어 보인다).
 *
 * 배율·줄 간격은 눈으로 맞춘 시작값이다. 화면에서 보고 조정하면 된다.
 */
export type StoryFont = {
  id: string;
  label: string;
  /** 미리보기·본문에 쓰는 font-family 값 */
  family: string;
  /** 동글체를 1로 본 글자 크기 배율 */
  scale: number;
  leading: number;
  category: "readable" | "storybook" | "decorative";
  /** 글꼴 파일에 실제로 들어 있는 굵기만 허용한다. */
  weights: readonly number[];
};

export const STORY_FONTS: StoryFont[] = [
  {
    id: "gothic",
    label: "읽기 쉬운 고딕",
    family: '"Pretendard Variable", Pretendard',
    scale: 0.6,
    leading: 1.65,
    category: "readable",
    weights: [400, 600, 700],
  },
  { id: "dodum", label: "차분한 돋움", family: "var(--font-gowun-dodum)", scale: 0.62, leading: 1.65, category: "readable", weights: [400] },
  { id: "dongle", label: "동글동글", family: "var(--font-dongle)", scale: 1, leading: 1.55, category: "storybook", weights: [300, 400, 700] },
  { id: "jua", label: "또렷한 주아", family: "var(--font-jua)", scale: 0.66, leading: 1.6, category: "storybook", weights: [400] },
  { id: "gaegu", label: "아이 손글씨", family: "var(--font-gaegu)", scale: 0.76, leading: 1.6, category: "decorative", weights: [400, 700] },
  { id: "pen", label: "부드러운 펜글씨", family: "var(--font-nanum-pen)", scale: 0.86, leading: 1.6, category: "decorative", weights: [400] },
];

/**
 * 본문 글자 굵기.
 *
 * 글꼴에 따라 실제로 가진 굵기가 다르다 — 동글체는 300·400·700, 아이 손글씨는
 * 400·700, 주아·펜글씨·돋움은 400 하나뿐이다. 없는 굵기를 고르면 브라우저가
 * 흉내 내서 굵게 그리는데(가짜 굵기), 그게 오히려 뭉개져 보일 때가 있다.
 * 설정 화면은 선택한 글꼴에 실제로 들어 있는 굵기만 활성화하고, 예전 저장값이
 * 지원되지 않으면 보통(400)으로 되돌려 가짜 굵기로 뭉개지지 않게 한다.
 */
export const STORY_WEIGHTS = [
  { id: "normal", label: "보통", value: 400 },
  { id: "medium", label: "조금 굵게", value: 600 },
  { id: "bold", label: "굵게", value: 700 },
] as const;

export type StoryWeight = (typeof STORY_WEIGHTS)[number];

const STORY_WEIGHT_KEY = "voice-storybook:story-weight";

export function findStoryWeight(id: string | null): StoryWeight {
  return STORY_WEIGHTS.find((w) => w.id === id) ?? STORY_WEIGHTS[1];
}

/** 선택한 글꼴이 지원하지 않는 굵기면 실제 파일에 있는 400으로 안전하게 맞춘다. */
export function storyWeightForFont(font: StoryFont, weight: StoryWeight): number {
  return font.weights.includes(weight.value)
    ? weight.value
    : font.weights.includes(400)
      ? 400
      : font.weights[0];
}

export function loadStoryWeight(): StoryWeight {
  if (typeof window === "undefined") return STORY_WEIGHTS[1];
  try {
    return findStoryWeight(window.localStorage.getItem(acctKey(STORY_WEIGHT_KEY)));
  } catch {
    return STORY_WEIGHTS[1];
  }
}

export function saveStoryWeight(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(acctKey(STORY_WEIGHT_KEY), id);
  } catch {
    /* 무시 */
  }
}

const STORY_FONT_KEY = "voice-storybook:story-font";

export function findStoryFont(id: string | null): StoryFont {
  return STORY_FONTS.find((f) => f.id === id) ?? STORY_FONTS[0];
}

export function loadStoryFont(): StoryFont {
  if (typeof window === "undefined") return STORY_FONTS[0];
  try {
    return findStoryFont(window.localStorage.getItem(acctKey(STORY_FONT_KEY)));
  } catch {
    return STORY_FONTS[0];
  }
}

export function saveStoryFont(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(acctKey(STORY_FONT_KEY), id);
  } catch {
    /* 무시 */
  }
}

/* ── 홈 화면에 추가 안내 (아이폰) ──
 * 아이폰 사파리에는 전체화면 기능이 없어서, 홈 화면 앱으로 열어야 주소창 없이
 * 꽉 찬 화면이 된다. 그런데 그 방법을 아는 부모가 드물다. 한 번만 알려 준다.
 */
const HOME_HINT_KEY = "voice-storybook:add-to-home-hint";

export function homeHintSeen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(acctKey(HOME_HINT_KEY)) === "1";
  } catch {
    return true;
  }
}

export function markHomeHintSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(acctKey(HOME_HINT_KEY), "1");
  } catch {
    /* 저장 못 해도 한 번 더 뜨는 것뿐이라 무시한다 */
  }
}

/* ── 새 소식(공지) 읽음 표시 ──
 * '봤다/안 봤다'가 아니라 **어느 공지를 닫았는지**를 적어 둔다. 그래야 다음 공지가
 * 올라왔을 때(id가 바뀌었을 때) 이미 닫은 사람에게도 다시 뜬다.
 * 계정별로 기억한다 — 한 기기를 부모 둘이 나눠 쓰는 집이 있다.
 */
const UPDATE_SEEN_KEY = "voice-storybook:update-seen";

export function updateNoticeSeen(id: string): boolean {
  if (typeof window === "undefined") return true; // 서버에서는 안 띄운다
  try {
    return window.localStorage.getItem(acctKey(UPDATE_SEEN_KEY)) === id;
  } catch {
    return true;
  }
}

export function markUpdateNoticeSeen(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(acctKey(UPDATE_SEEN_KEY), id);
  } catch {
    /* 저장 못 해도 한 번 더 뜨는 것뿐이라 무시한다 */
  }
}

/* ── 캐릭터 눌러 보기 안내 ──
 * 전래동화·세계명작은 그림 속 인물을 누르면 그 인물이 말한다. 그런데 눌러 볼 수
 * 있다는 걸 아무 데도 안 알려 줘서, 있는 줄 모르고 지나가는 부모가 많다.
 * 처음 한 번만 알려 주고, 본 뒤로는 다시 띄우지 않는다(계정별로 기억).
 */
const HOTSPOT_HINT_KEY = "voice-storybook:hotspot-hint";

export function hotspotHintSeen(): boolean {
  if (typeof window === "undefined") return true; // 서버에서는 안 띄운다
  try {
    return window.localStorage.getItem(acctKey(HOTSPOT_HINT_KEY)) === "1";
  } catch {
    return true;
  }
}

export function markHotspotHintSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(acctKey(HOTSPOT_HINT_KEY), "1");
  } catch {
    /* 저장 못 해도 안내가 한 번 더 뜨는 것뿐이라 무시한다 */
  }
}

/**
 * 아직 그림이 DB 안에 들어 있는 책이 몇 권인지 — 그림 내용은 받지 않고 개수만 센다.
 *
 * "옛 책 그림 정리"가 끝났는지 알려면 이게 필요하다. 책을 다 열어 보면 확인은
 * 되지만, 그건 지금 없애려는 그 전송량을 다시 쓰는 일이라 말이 안 된다.
 * 그래서 표지나 첫 쪽 그림이 아직 base64인지만 서버에서 판단하게 한다.
 *
 * 조회가 안 되면(구버전 PostgREST 등) -1을 돌려준다 — '모름'이라는 뜻이라,
 * 부르는 쪽은 정리 버튼을 그냥 보여 주면 된다.
 */
export async function countBooksWithEmbeddedArt(): Promise<number> {
  const sb = getSupabase();
  if (!sb) return 0;
  try {
    const { count, error } = await sb
      .from("books")
      .select("id", { count: "exact", head: true })
      .or("data->>coverImage.like.data:*,data->pages->0->>image.like.data:*");
    if (error) return -1;
    return count ?? 0;
  } catch {
    return -1;
  }
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

/**
 * 새 책을 책장(Supabase books)에 넣는다 — 성공했는지와 이유를 돌려준다.
 *
 * 예전엔 결과를 한 글자도 안 읽고 Promise<void> 로 끝났다. 그래서 저장이 실패해도
 * 만들기 화면은 "완성!"을 띄우고 임시저장·그리기 보관까지 지웠다 — 토큰은 나갔는데
 * 책은 어디에도 없는 사고가 실제로 났다(2026-09-14). 이제:
 *  · upsert 의 error 를 읽고, .select("id") 로 줄이 실제로 남았는지까지 본다
 *    (RLS 에 막히면 오류 없이 0줄이 오기도 한다 — updateBookData 와 같은 교훈)
 *  · 로그인이 풀렸으면 성공인 척 return 하지 않고 실패로 돌려준다
 *  · 네트워크가 잠깐 끊긴 것일 수 있으니 한 번은 조금 기다렸다 다시 해 본다
 * 판단은 book-jobs.ts 의 interpretBookSave(시험 있음)가 한다.
 */
export async function saveMyBook(book: Book): Promise<SaveBookResult> {
  const sb = getSupabase();
  if (!sb) {
    return { ok: false, code: "no-server", retryable: false, reason: "서버가 설정되지 않아 저장하지 못했어요." };
  }
  let last: SaveBookResult = { ok: false, code: "unknown", retryable: true, reason: "저장하지 못했어요." };
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1500));
    const uid = await currentUid();
    if (!uid) return interpretBookSave({ uid, error: null, rows: null });
    try {
      const { data, error } = await sb
        .from("books")
        .upsert({
          id: book.id,
          owner: uid,
          title: book.title,
          data: book,
          hidden: !!book.hidden,
        })
        .select("id");
      last = interpretBookSave({ uid, error, rows: data });
    } catch (e) {
      // supabase-js 는 대개 던지지 않지만, 본문을 JSON 으로 못 만들 때 등은 던진다.
      last = interpretBookSave({ uid, error: { message: (e as Error)?.message ?? String(e) }, rows: null });
    }
    if (last.ok || !last.retryable) return last;
    console.warn("[saveMyBook] 저장 실패", attempt + 1, last.code, last.reason);
  }
  return last;
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
