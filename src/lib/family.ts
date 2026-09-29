/**
 * 우리 가족 캐릭터 — 한 번 그려 두면 동화마다 같은 얼굴로 나오는 가족.
 *
 * 규칙(사장님 결정 2026-09-28):
 *  - 그려서 **고정한 사람**(portrait 가 있는 사람)은 동화마다 그 모습 그대로 나온다.
 *  - 고정 안 한 사람은 지금처럼 동화마다 새로 그린다. 그래서 식구 수에 제한이 없다.
 *  - 값은 사람마다 받는다: 한 사람 고정 2쿠키(다시 그리기 1번 포함), 그 뒤 다시 그리기 1쿠키.
 *    '쿠키'는 앱 화폐(토큰)의 새 이름이고 1쿠키 = 100원이다. 실제 차감은 서버(DB 함수)가 한다.
 *  - 옷은 이야기마다 바뀐다. 여기 적는 옷은 '평소 옷'이다.
 *  - 순서: 아이 → 엄마 → 아빠 → 형제자매 → 할머니 → 할아버지 → (따로) 단짝 친구(ROLE_ORDER).
 *  - 단짝 친구는 **한 명**이고 가족이 아니다 — 가족 명패·'우리 가족 · N명'·홈 단체 사진에 안 들어간다
 *    (홈 보이기를 따로 켜면 단체 사진에만 선다). 값·고정 방식은 가족과 같다.
 *  - 홈 단체 사진에는 '홈 가족 사진에 보이기'를 켠 고정된 사람만 선다(처음 값: 가족 켬, 단짝 친구 끔).
 *  - 형제자매 가운데 '우리 아이'를 켜면 명패가 '하온·하린이네 가족'이 된다.
 *
 * 이 파일은 순수 함수만 둔다(브라우저·Supabase 없음) — node --test 로 시험할 수 있게.
 * (2026-09-28 검토 반영으로 더한 것: FamilyPortrait.lockKey · FamilyMember.picAt · FAMILY_MAX_MEMBERS 60
 *  · mergeFamily. 2차: showOnHome · isOurChild · 어른 생김새 칸 확장 · 키 옵션 · lockKey 견주기.
 *  3차: 뺀 기록 FamilyRemoval · FamilyMember.addedAt — 합칠 때 사람은 합집합, 빼기는 뺀 기록으로만.
 *  4차: FamilyMember.looksOnly — '그림 없이 특징만 저장'(쿠키 0개). 이름·홈 보이기처럼 목록 쪽 칸으로 합친다.
 *  5차(2026-09-29): FamilyPortrait.fromPhoto — '사진으로 할게요'로 그린 그림 표시. 사진 자체는 여기 없다
 *  (저장하지 않는다 — lib/family-photo.ts). 그림 칸이라 합칠 때 그림과 함께 따라간다.
 *  6차(2026-09-29): FamilyPortrait.headRatio — 그린 뒤 잰 머리 비율(lib/family-head). 단체 사진이 얼굴 크기를 고른다.
 *  7차(2026-09-29): FamilyPortrait.bodyStretch — 굽기 때 몸을 늘인 배율. 단체 사진이 몸을 두 번 늘이지 않게 본다.)
 * 아이·엄마·아빠의 생김새는 여기 복사하지 않는다. ChildPrefs.looks / parents.mom·dad 가
 * 원본이고(가족 화면 생김새 고르기에서 고르고 만들기 화면도 같이 쓴다 — 회원 설정의 특징 칸은 2026-09-28 에
 * 걷었다), family 에는 역할과 그림만 둔다. 할머니·형제·친구처럼
 * 새로 생기는 사람만 member.looks 를 쓴다.
 */

// 타입만 가져온다(런타임에는 지워진다) — prefs.ts 가 이 파일을 부르므로 값까지 부르면 서로 물린다.
import type { ChildPrefs, ParentLooks } from "./prefs.ts";
import { cleanBodyStretch, cleanHeadRatio } from "./family-head.ts";
import {
  adultLookRows,
  CHILD_LOOK_ROWS_ALL,
  GLASSES_LEGACY,
  GLASSES_NONE,
  hasBeard,
  lookNoteMax,
  migrateLookValue,
  wearsGlassesType,
  type AdultRole,
  type LookWho,
} from "./look-options.ts";

export type FamilyRole = "child" | "mom" | "dad" | "grandma" | "grandpa" | "sibling" | "friend";

/**
 * 새로 생기는 사람(할머니·할아버지·형제·친구)의 생김새. 모두 선택.
 * 엄마·아빠(ParentLooks)와 같은 칸이다 — 할머니·할아버지는 어른 칩(adultLookRows),
 * 형제·친구는 아이 칩(CHILD_LOOK_ROWS_ALL)을 쓰므로 아이 쪽 칸(items)도 받는다.
 */
export type FamilyLooks = ParentLooks & {
  /** 늘 지니는 것(형제·친구 — 아이 칩) */
  items?: string[];
};

/** 그린 그림 한 벌 — 투명 PNG(화면용)와 흰 바탕 JPEG(AI 참고용). 둘 다 cafe24 https 주소. */
export type FamilyPortrait = {
  url: string;
  ref: string;
  /** 그린 시각(ISO) */
  at: string;
  /**
   * 배경 지우기에 실패해 url 도 흰 바탕인 그림. 화면은 mix-blend-mode:multiply 로 얹는다.
   * 투명하면 칸 자체가 없다(true 만 저장).
   */
  opaque?: boolean;
  /**
   * 그릴 때의 '늘 그대로' 생김새(머리·체형·안경 …)를 순서 맞춘 글자로(currentLockKey) — 모아 보기가 지금
   * 생김새와 견줘 '모습이 바뀌었어요'를 계속 보여 준다('나중에'를 눌러도 표시가 남게). 없으면 견주지 않는다.
   */
  lockKey?: string;
  /**
   * 부모가 올린 사진을 보고 그린 그림(사장님 2026-09-29 '사진으로 할게요'). 사진 자체는 어디에도 저장하지 않고
   * 이 표시만 남긴다(lib/family-photo.ts). 칩이 아니라 사진이 모습을 정했으니, 나중에 칩을 바꿔도
   * '모습이 바뀌었어요'를 띄우지 않는다(portraitLooksChanged). true 만 저장한다.
   * 그림 모델이 사진을 거절해 사진 속 특징(특징 카드)으로 대신 그린 그림도 fromPhoto 다(photoFallback 'features').
   * 카드를 못 받아 고른 특징(칩)으로 대신 그렸으면('looks') 칩으로 그린 그림과 같아 달지 않는다.
   */
  fromPhoto?: boolean;
  /**
   * 그린 뒤 잰 머리 비율 — 키 ÷ 머리(머리카락 맨 위~턱 : 머리 위~신발 바닥), 0.01 단위(사장님 2026-09-29 "아빠만 머리가
   * 너무 크게 나와", lib/family-head). 서버(api/family/portrait)가 그린 그림을 값싼 글 모델로 재서 그림과 함께 건넨다.
   * 단체 사진(FamilyGroupPhoto)이 이 값으로 턱선을 찾아 그림을 머리·몸·발 칸으로 나눠, 키는 실제 키·얼굴은 얼굴 크기표
   * (lib/family-head FACE_SIZE)대로 세운다 — 그림은 전신에 맞춰 잘려 있어(lib/cutout, 흰 바탕 그림은 여백 OPAQUE_PAD)
   * 턱선 = 그림 높이 ÷ 이 값이다.
   * 못 쟀거나 예전 그림이면 없다(그때는 나누지 않고 실제 키 비율 그대로). 숫자 하나라 개인정보가 아니다.
   */
  headRatio?: number;
  /**
   * 굽기 때 목 ~ 발목 띠를 세로로 늘인 배율(1 초과 ~ 1.5, 0.01 단위 — lib/family-stretch, api/family/portrait 머리글 ④).
   * 단체 사진이 몸 칸을 또 늘일 때 둘을 곱해 1.45 를 넘지 않게 본다(lib/family-head FACE_FIT.totalMax) — 두 번 늘여 윗옷이
   * 튜닉처럼 길어지지 않게. 늘이지 않았거나 예전 그림이면 없다(1 로 친다). 숫자 하나라 개인정보가 아니다.
   */
  bodyStretch?: number;
};

export type FamilyMember = {
  /** "child" | "mom" | "dad" | "m-<임의>" — 이름이 바뀌어도 그대로. 서버의 결제 기록 열쇠이기도 하다. */
  id: string;
  role: FamilyRole;
  /** 호칭 — 하온·엄마·할머니·외할머니·누나·친구 … (이야기 인물 이름과 맞출 열쇠) */
  callName: string;
  /** 형제·친구의 실제 이름(선택) */
  name?: string;
  gender?: "girl" | "boy";
  /** 형제·친구 나이 */
  age?: number;
  /** child·mom·dad 는 쓰지 않는다(설정 데이터가 원본). */
  looks?: FamilyLooks;
  /** 고정된 그림 — '마음에 들어요'를 누른 그림. 있으면 동화마다 이 모습. */
  portrait?: FamilyPortrait;
  /** 그렸지만 아직 확인 전인 그림 */
  draft?: FamilyPortrait;
  /** 다시 그리기 전의 그림 — 두 장 비교에 쓴다 */
  prevDraft?: FamilyPortrait;
  /** 서버가 알려 준 지금까지 그린 횟수(화면 표시용. 진짜 셈은 서버 family_portraits 표) */
  draws?: number;
  /**
   * 그림 칸(portrait·draft·prevDraft)을 마지막으로 바꾼 때(이 기기 시계, ISO). 기기끼리 합칠 때
   * 더 새 그림 쪽을 남기는 데 쓴다(mergeFamily) — 쿠키를 내고 받은 그림이 옛 목록에 덮여 사라지지 않게.
   */
  picAt?: string;
  /**
   * '홈 가족 사진에 보이기' — 없으면 역할로 정한다(가족 켬, 단짝 친구 끔: showsOnHome).
   * 꺼도 고정 얼굴은 그대로다(동화엔 나온다). false 도 저장한다 — 가족을 끈 값이 사라지면 안 된다.
   */
  showOnHome?: boolean;
  /** 형제자매만 — '우리 아이예요'. 켜면 명패에 이름이 함께 선다(하온·하린이네 가족). */
  isOurChild?: boolean;
  /**
   * '그림 없이 특징만 저장할게요'를 누른 사람(사장님 2026-09-28) — 쿠키 0개, 그리기 서버는 부르지 않는다.
   * 그림이 없으니 동화마다 이 특징으로 새로 그린다. 모아 보기가 '특징만 저장됨'으로 보이고, 가족 화면을
   * 다시 열면 모아 보기부터 보인다. 나중에 쿠키를 내고 고정할 수 있다(그림이 생기면 그림이 먼저 보인다).
   * true 만 저장한다.
   */
  looksOnly?: boolean;
  /**
   * 넣은 때(이 기기 시계, ISO). 뺀 기록(FamilyRemoval)과 견준다 — 엄마·아빠는 id 가 늘 같아서, 뺐다가
   * 다시 넣은 엄마가 예전 뺀 기록에 걸려 사라지지 않게. 없으면(옛 값) 그림 시각만 본다.
   */
  addedAt?: string;
};

/**
 * 뺀 사람 기록 — '누가 빠졌나'를 목록 전체의 familyAt 하나로 정하면, 오래 열어 둔 화면이 아무거나 저장해도
 * 그 화면이 못 본 사람(다른 기기에서 넣고 쿠키를 내 고정한 사람)이 '뺀 사람'으로 지워진다(2026-09-28 검토).
 * 그래서 빼기는 이 기록으로만 전한다: 합칠 때 두 목록을 합집합으로 모으고, 이 기록이 그 사람의 넣은 때·그림
 * 시각보다 나중인 사람만 뺀다(mergeFamily).
 */
export type FamilyRemoval = { id: string; at: string };

/* ─────────────────────────────── 값 ─────────────────────────────── */

/** 한 사람 처음 그리기(고정) — 다시 그리기 1번 포함 */
export const FAMILY_FIRST_COST = 2;
/** 포함된 다시 그리기 횟수 */
export const FAMILY_FREE_REDRAWS = 1;
/** 그 뒤 다시 그리기 한 번 */
export const FAMILY_REDRAW_COST = 1;

/** 다음 그리기 값 — draws 는 지금까지 그린 횟수(서버 기준). */
export function nextDrawCost(draws: number | undefined): number {
  const n = draws ?? 0;
  if (n <= 0) return FAMILY_FIRST_COST;
  if (n <= FAMILY_FREE_REDRAWS) return 0;
  return FAMILY_REDRAW_COST;
}

/**
 * 가족 그림 요청의 생김새 한 줄 최대 길이 — 서버(api/family/portrait)가 이보다 길면 받지 않는다.
 * 화면은 보내기 전에 이 길이로 자른다. 어른 칸이 늘어(2026-09-28) 300 → 600.
 */
export const PORTRAIT_LOOKS_MAX = 600;

/** 남은 무료 다시 그리기 */
export function freeRedrawsLeft(draws: number | undefined): number {
  const n = draws ?? 0;
  if (n <= 0) return FAMILY_FREE_REDRAWS;
  return Math.max(0, FAMILY_FREE_REDRAWS - (n - 1));
}

/* ─────────────────────────────── 역할 ─────────────────────────────── */

export const ROLE_LABEL: Record<FamilyRole, string> = {
  child: "아이",
  mom: "엄마",
  dad: "아빠",
  grandma: "할머니",
  grandpa: "할아버지",
  sibling: "형제자매",
  friend: "친구",
};

/** 단짝 친구를 화면에 부를 때(타일·칸 제목). 호칭(callName)은 그대로 '친구'다 — 이야기 인물 열쇠라서. */
export const BEST_FRIEND_LABEL = "단짝 친구";

/**
 * 역할 순서 — 고르기 타일·추가 시트·목록·확인 화면 모두 이 순서(사장님 2026-09-28).
 * 단짝 친구는 맨 끝, 가족과 떨어진 자리.
 */
export const ROLE_ORDER: readonly FamilyRole[] = ["child", "mom", "dad", "sibling", "grandma", "grandpa", "friend"];

/** ROLE_ORDER 로 줄 세우기 — 같은 역할끼리는 원래 순서를 지킨다(더한 순서). */
export function byRoleOrder<T extends Pick<FamilyMember, "role">>(members: readonly T[]): T[] {
  const rank = (r: FamilyRole) => ROLE_ORDER.indexOf(r);
  return members
    .map((m, i) => ({ m, i }))
    .sort((a, b) => rank(a.m.role) - rank(b.m.role) || a.i - b.i)
    .map((x) => x.m);
}

/** 고정 id 를 쓰는 역할(한 명뿐) */
export const FIXED_ID_ROLES: FamilyRole[] = ["child", "mom", "dad"];

/** 호칭 고르기(할머니 두 분·형제 호칭) */
export const CALL_NAMES: Partial<Record<FamilyRole, string[]>> = {
  grandma: ["할머니", "외할머니", "친할머니"],
  grandpa: ["할아버지", "외할아버지", "친할아버지"],
  sibling: ["형", "오빠", "누나", "언니", "남동생", "여동생"],
  friend: ["친구"],
};

/** 형제 호칭 → 성별 */
export function siblingGender(callName: string): "girl" | "boy" | undefined {
  if (["형", "오빠", "남동생"].includes(callName)) return "boy";
  if (["누나", "언니", "여동생"].includes(callName)) return "girl";
  return undefined;
}

/**
 * 아이 쪽 사람(아이·형제·단짝 친구) — 아이 칩(설정과 같은 글자)을 쓰고, 그림도 아이 키로 세운다.
 * 어른(엄마·아빠·할머니·할아버지)은 어른 칩(adultLookRows).
 */
export function isKidRole(role: FamilyRole): boolean {
  return role === "child" || role === "sibling" || role === "friend";
}

/* ─────────────────────────── 단짝 친구·홈 사진·가족만 ─────────────────────────── */

/** 단짝 친구는 한 명뿐 */
export const FRIEND_LIMIT = 1;

/** 단짝 친구(없으면 undefined). 옛 목록에 친구가 여럿이면 첫 사람. */
export function bestFriend(family: readonly FamilyMember[] | undefined): FamilyMember | undefined {
  return (family ?? []).find((m) => m.role === "friend");
}

/**
 * 이 역할을 더 넣을 수 있나 — 아이·엄마·아빠는 한 명, 단짝 친구도 한 명, 그 밖은 식구 수 상한까지.
 * (옛 목록에 친구가 여럿이어도 지우지 않는다 — 쿠키 내고 그린 그림이 있을 수 있다. 더하기만 막는다.)
 */
export function canAddRole(family: readonly FamilyMember[] | undefined, role: FamilyRole): boolean {
  const fam = family ?? [];
  if (fam.length >= FAMILY_MAX_MEMBERS) return false;
  if (FIXED_ID_ROLES.includes(role)) return !fam.some((m) => m.role === role);
  if (role === "friend") return fam.filter((m) => m.role === "friend").length < FRIEND_LIMIT;
  return true;
}

/** '홈 가족 사진에 보이기' 켜짐? — 값이 없으면 가족은 켬, 단짝 친구는 끔. */
export function showsOnHome(m: Pick<FamilyMember, "role" | "showOnHome">): boolean {
  return m.showOnHome ?? m.role !== "friend";
}

/** 홈 단체 사진에 설 사람 — 고정된 사람 가운데 홈 보이기를 켠 사람. 비면 홈은 명패 한 줄. */
export function homeMembers(family: readonly FamilyMember[] | undefined): FamilyMember[] {
  return (family ?? []).filter((m) => m.portrait && showsOnHome(m));
}

/** 가족만(단짝 친구 뺌) — 가족 명패·'우리 가족 · N명' 숫자에 쓴다. */
export function familyMembersOnly(family: readonly FamilyMember[] | undefined): FamilyMember[] {
  return (family ?? []).filter((m) => m.role !== "friend");
}

/* ─────────────────────────────── 명패 ─────────────────────────────── */

/** 끝 글자 받침 — 한글이 아니면 undefined */
function batchimOf(word: string): boolean | undefined {
  const w = word.trim();
  if (!w) return undefined;
  const c = w.charCodeAt(w.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return undefined;
  return (c - 0xac00) % 28 !== 0;
}

/**
 * 끝 글자에 받침이 있나(한글이 아니면 false) — '하온이' · '엄마를' · '하온아' 처럼 조사를 고를 때.
 * 명패(familyTitle)·가족 화면 부르기(family-ui)·홈 인사(FamilyFrame)가 같이 쓴다.
 */
export function hasBatchim(word: string): boolean {
  return batchimOf(word) === true;
}

/**
 * 명패에 설 우리 아이들 이름 — [아이 이름, …'우리 아이예요'를 켠 형제의 이름(없으면 호칭)].
 * 빈 이름은 뺀다.
 */
export function ourChildrenNames(
  childName: string | null | undefined,
  family: readonly FamilyMember[] | undefined,
): string[] {
  const out: string[] = [];
  const c = (childName ?? "").trim();
  if (c) out.push(c);
  for (const m of family ?? []) {
    if (m.role !== "sibling" || !m.isOurChild) continue;
    const n = (m.name ?? "").trim() || m.callName.trim();
    if (n) out.push(n);
  }
  return out;
}

/**
 * '○○이네 가족' — 이름 끝 글자에 받침이 있으면 '이네'(하온이네), 없으면 '네'(지우네).
 * 이름이 여럿이면 가운뎃점으로 잇고 **마지막 이름**의 받침을 본다(하온·하린이네 가족, 하온·지우네 가족).
 * 이름이 없으면 '우리 가족'.
 */
export function familyTitle(names: string | readonly string[] | undefined | null): string {
  const list = (typeof names === "string" ? [names] : (names ?? [])).map((n) => n.trim()).filter(Boolean);
  if (list.length === 0) return "우리 가족";
  const last = list[list.length - 1];
  return `${list.join("·")}${batchimOf(last) ? "이네" : "네"} 가족`;
}

/* ─────────────────────────────── 키 ─────────────────────────────── */

/** 아이 나이로 대략의 키(cm) — 단체 사진에서 키 비율을 맞추는 데만 쓴다. */
export function childHeightCm(age: number | null | undefined): number {
  const a = typeof age === "number" && age > 0 ? Math.min(age, 14) : 5;
  const table = [0, 76, 88, 96, 103, 110, 116, 122, 128, 133, 139, 145, 151, 157, 162];
  return table[Math.round(a)] ?? 110;
}

/** 어른 키 칩(작은 편·보통·큰 편·아주 큰 편) → cm. 안 고르면 '보통'. */
export const ADULT_HEIGHT_CM: Readonly<Record<AdultRole, Readonly<Record<string, number>>>> = {
  mom: { "작은 편": 155, 보통: 163, "큰 편": 169, "아주 큰 편": 175 },
  dad: { "작은 편": 167, 보통: 175, "큰 편": 181, "아주 큰 편": 187 },
  grandma: { "작은 편": 148, 보통: 154, "큰 편": 160, "아주 큰 편": 165 },
  grandpa: { "작은 편": 160, 보통: 166, "큰 편": 172, "아주 큰 편": 178 },
};

/** 어른 키(cm) — 모르는 칩·빈 값은 '보통' */
export function adultHeightCm(role: AdultRole, height?: string | null): number {
  const t = ADULT_HEIGHT_CM[role];
  return (height ? t[height] : undefined) ?? t["보통"];
}

/**
 * 역할별 키(cm). 아이 나이는 설정 값을 넘긴다.
 * height 는 어른 키 칩 — 엄마·아빠는 설정(parents)에 있으니 넘겨 주고, 할머니·할아버지는 안 넘기면
 * member.looks.height 를 쓴다. 둘 다 없으면 '보통'(예전 값 그대로 163·175·154·166).
 */
export function heightCm(
  member: Pick<FamilyMember, "role" | "age"> & { looks?: Pick<FamilyLooks, "height"> },
  childAge?: number | null,
  height?: string | null,
): number {
  switch (member.role) {
    case "child":
      return childHeightCm(childAge);
    case "mom":
    case "dad":
    case "grandma":
    case "grandpa":
      return adultHeightCm(member.role, height ?? member.looks?.height);
    case "sibling":
    case "friend":
      return childHeightCm(member.age ?? childAge ?? 5);
  }
}

/** heightCm 을 원본에서 알아서 — 엄마·아빠 키는 설정(parents), 나머지는 member.looks. */
export function heightFor(
  member: Pick<FamilyMember, "role" | "age" | "looks">,
  child: Pick<ChildPrefs, "age" | "parents"> | null | undefined,
): number {
  const h = member.role === "mom" || member.role === "dad" ? child?.parents?.[member.role]?.height : member.looks?.height;
  return heightCm(member, child?.age, h);
}

/** 단체 사진 순서 — 가운데 아이, 양옆 부모, 바깥에 조부모, 형제·친구는 아이 옆. */
export function groupOrder(members: FamilyMember[]): FamilyMember[] {
  const rank: Record<FamilyRole, number> = { grandpa: 0, mom: 1, sibling: 2, child: 3, friend: 4, dad: 5, grandma: 6 };
  return [...members].sort((a, b) => rank[a.role] - rank[b.role]);
}

/* ─────────────────────── 생김새 칩(새로 생기는 사람) ─────────────────────── */

/** 칩 한 줄 — lock=true 는 '늘 그대로', false 는 '평소 옷'. multi 면 여러 개(값은 string[]). */
export type LookRow = { key: keyof FamilyLooks; label: string; options: readonly string[]; lock: boolean; multi?: boolean };

/** 형제·친구 평소 옷(아이 칩에는 옷 종류가 없어서 여기 둔다) */
const KID_OUTFIT = ["티셔츠", "후드티", "원피스", "멜빵바지", "셔츠"];

/**
 * 사람마다 칩 줄 — 가족 화면 생김새 고르기가 이것 하나로 줄을 받는다(칩 글자 원본은 look-options).
 *  - 엄마·아빠·할머니·할아버지: 어른 칩(adultLookRows) — 안경은 glassesType 줄, 메모는 줄이 아니다.
 *  - 아이: 설정 아이 특징과 같은 10줄(CHILD_LOOK_ROWS_ALL) 그대로 — ChildLooks 에는 옷 종류 칸이 없다.
 *  - 형제·친구: 아이 칩 + 옷 종류. 안경은 줄이 아니라 켜기(glasses) 하나다(화면이 붙인다).
 */
export function lookRowsFor(role: FamilyRole): LookRow[] {
  if (role === "mom" || role === "dad" || role === "grandma" || role === "grandpa") {
    return adultLookRows(role).map((r) => ({
      key: r.key,
      label: r.label,
      options: r.options,
      lock: r.lock,
      ...(r.multi ? { multi: true } : {}),
    }));
  }
  const kid = (lock: boolean): LookRow[] =>
    CHILD_LOOK_ROWS_ALL.filter((r) => r.lock === lock).map((r) => ({
      key: r.key,
      label: r.label,
      options: r.opts,
      lock: r.lock,
      ...(r.multi ? { multi: true } : {}),
    }));
  if (role === "child") return [...kid(true), ...kid(false)];
  return [...kid(true), { key: "outfit", label: "옷 종류", options: KID_OUTFIT, lock: false }, ...kid(false)];
}

/* ─────────────────────── 생김새 → 한 줄(한국어) ─────────────────────── */

/** 낱말 뒤 을/를 — 한글이 아니면 '을(를)' */
function eulReul(word: string): string {
  const b = batchimOf(word);
  return `${word}${b === undefined ? "을(를)" : b ? "을" : "를"}`;
}

/** 낱말 뒤 이/가 — 한글이 아니면 '이(가)' */
function iGa(word: string): string {
  const b = batchimOf(word);
  return `${word}${b === undefined ? "이(가)" : b ? "이" : "가"}`;
}

/** 머리 색 → 머리 앞 꾸밈말(까만 단발머리 · 하얀 쪽진 머리). 모르는 글자는 그대로 붙인다. */
const HAIR_COLOR_ADJ: Readonly<Record<string, string>> = {
  까만색: "까만",
  "짙은 갈색": "짙은 갈색",
  "밝은 갈색": "밝은 갈색",
  "붉은 갈색": "붉은 갈색",
  희끗희끗: "희끗희끗한",
  회색: "회색",
  흰머리: "하얀",
};
/** 머리 모양 없이 색만 골랐을 때 — '머리는 흰머리' 같은 겹말을 피한다 */
const HAIR_COLOR_ONLY: Readonly<Record<string, string>> = {
  까만색: "머리 색은 까맣다",
  "짙은 갈색": "머리 색은 짙은 갈색이다",
  "밝은 갈색": "머리 색은 밝은 갈색이다",
  "붉은 갈색": "머리 색은 붉은 갈색이다",
  희끗희끗: "머리가 희끗희끗하다",
  회색: "머리 색은 회색이다",
  흰머리: "머리가 하얗다",
};
/**
 * 머리 모양 칩 가운데 명사가 아닌 것 — 문장으로 푼다(무엇이 짧은지·묶였는지 분명하게).
 * pre 는 머리 색 꾸밈말과 띄어쓰기('까만 ', 없으면 빈 글자).
 */
const HAIR_SENTENCE: Readonly<Record<string, (pre: string) => string>> = {
  "아주 짧아요": (pre) => `${pre}머리가 아주 짧다`,
  "하나로 묶기": (pre) => `${pre}머리를 하나로 묶었다`,
};
/** 머리 모양 칩 가운데 '머리'가 빠진 이름 — '머리'를 붙여 무엇의 모양인지 분명히 한다 */
const HAIR_NOUN: Readonly<Record<string, string>> = {
  숏컷: "숏컷 머리",
  "짧은 단발": "짧은 단발머리",
  단발: "단발머리",
  중단발: "중단발 머리",
  반묶음: "반묶음 머리",
  "굵은 웨이브 파마": "굵은 웨이브 파마머리",
  "곱슬 파마": "곱슬 파마머리",
  반삭: "반삭 머리",
  투블럭: "투블럭 머리",
  "옆 가르마": "옆 가르마 머리",
  올백: "올백 머리",
  양갈래: "양갈래 머리",
};
/**
 * 머리 모양이 앞머리까지 정하는 칩 — 이걸 고르면 앞머리 문장은 적지 않는다(머리 모양이 이긴다).
 * 서로 맞지 않게 고르면('앞머리 내린 머리' + '없어요(가르마)') 한 줄에 정반대 말이 들어가 모델이 멋대로 고른다.
 */
const HAIR_SETS_BANGS: ReadonlySet<string> = new Set(["앞머리 내린 머리", "올백"]);
/** 머리 모양 이름에 파마·웨이브·곱슬이 들어 있으면 머리결 문장은 적지 않는다(머리 모양이 이긴다) */
const HAIR_SETS_TEXTURE = /파마|웨이브|곱슬/;

/** 머리 모양 + 머리 색 한 마디 — '까만 단발머리' · '하얀 머리가 아주 짧다' · '머리가 하얗다' */
function hairPhrase(hair: string, color: string): string {
  if (!hair) return color ? (HAIR_COLOR_ONLY[color] ?? `머리 색은 ${color}`) : "";
  const pre = color ? `${HAIR_COLOR_ADJ[color] ?? color} ` : "";
  const sentence = HAIR_SENTENCE[hair];
  return sentence ? sentence(pre) : `${pre}${HAIR_NOUN[hair] ?? hair}`;
}

const TEXTURE_PHRASE: Readonly<Record<string, string>> = {
  "곧은 생머리": "머리결은 곧은 생머리로 웨이브·곱슬·파마가 없다",
  "살짝 웨이브": "머리 끝에만 부드러운 웨이브가 살짝 있다",
  "굵은 웨이브": "머리에 굵고 큰 웨이브가 있다",
  곱슬: "머리결은 자연스러운 곱슬이다",
  곱슬머리: "머리결은 자연스러운 곱슬이다",
  파마: "파마를 해서 머리에 둥근 컬이 있다",
  파마머리: "파마를 해서 머리에 둥근 컬이 있다",
};
const BANGS_PHRASE: Readonly<Record<string, string>> = {
  "일자로 있어요": "일자 앞머리가 있다",
  있어요: "앞머리가 있다",
  "옆으로 넘겨요": "앞머리를 옆으로 넘겼다",
  시스루: "시스루 앞머리가 있다",
  "없어요(가르마)": "앞머리 없이 가르마를 탔다",
  없어요: "앞머리가 없다",
};
const FACE_PHRASE: Readonly<Record<string, string>> = {
  갸름해요: "얼굴이 갸름하다",
  동그래요: "얼굴이 동그랗다",
  계란형: "계란형 얼굴이다",
  "각진 편": "얼굴이 각진 편이다",
};
const EYES_PHRASE: Readonly<Record<string, string>> = {
  "크고 동그래요": "눈이 크고 동그랗다",
  "웃으면 반달": "웃으면 눈이 반달이 된다",
  "웃으면 반달이 돼요": "웃으면 눈이 반달이 된다",
  또렷해요: "눈매가 또렷하다",
  쌍꺼풀: "쌍꺼풀이 있다",
  "쌍꺼풀이 있어요": "쌍꺼풀이 있다",
  "가늘고 긴 눈": "눈이 가늘고 길다",
  "순한 눈매": "눈매가 순하다",
};
const BROWS_PHRASE: Readonly<Record<string, string>> = {
  "진한 눈썹": "눈썹이 진하다",
  "옅은 눈썹": "눈썹이 옅다",
  "일자 눈썹": "일자 눈썹이다",
};
const SKIN_PHRASE: Readonly<Record<string, string>> = {
  "밝은 편": "피부는 밝은 편이다",
  보통: "피부색은 보통이다",
  보통이에요: "피부색은 보통이다",
  "조금 진한 편": "피부는 조금 진한 편이다",
  "햇볕에 그을림": "피부가 햇볕에 그을렸다",
  "햇볕에 그을렸어요": "피부가 햇볕에 그을렸다",
};
const BUILD_PHRASE: Readonly<Record<string, string>> = {
  "마른 편": "마른 편이다",
  "마른 편이에요": "마른 편이다",
  보통: "보통 체형이다",
  보통이에요: "보통 체형이다",
  "통통한 편": "통통한 편이다",
  통통해요: "통통한 편이다",
  "듬직한 편": "듬직한 체격이다",
  근육질: "근육질 체격이다",
};
const HEIGHT_PHRASE: Readonly<Record<string, string>> = {
  "작은 편": "키가 작은 편이다",
  보통: "키는 보통이다",
  "큰 편": "키가 큰 편이다",
  "아주 큰 편": "키가 아주 크다",
};
const BEARD_PHRASE: Readonly<Record<string, string>> = {
  없어요: "수염이 없다",
  콧수염: "콧수염이 있다",
  턱수염: "턱수염이 있다",
  "면도 자국": "턱에 푸르스름한 면도 자국이 있다",
  구레나룻: "구레나룻이 있다",
};
/** '이런 점도' — 'OO이 있다'로 묶을 이름 */
const MARK_NOUN: Readonly<Record<string, string>> = {
  점: "얼굴의 점",
  "웃을 때 눈주름": "웃을 때 생기는 눈주름",
};
/** '이런 점도' — 따로 한 마디로 적는 것(아이 칩) */
const MARK_SENTENCE: Readonly<Record<string, string>> = {
  "앞니 빠짐": "앞니가 하나 빠졌다",
  "볼이 통통해요": "볼이 통통하다",
};

function words(x: unknown): string[] {
  return Array.isArray(x) ? x.filter((y): y is string => typeof y === "string" && y.trim() !== "").map((y) => y.trim()) : [];
}

function phrase(table: Readonly<Record<string, string>>, v: unknown, fallback: (v: string) => string): string {
  if (typeof v !== "string" || !v.trim()) return "";
  return table[v.trim()] ?? fallback(v.trim());
}

/** 안경 한 마디 — 늘 넣는다(안 넣으면 모델이 없는 안경을 씌운다). 쓰면 꼭 '…안경을 썼다'로 끝난다. */
function glassesPhrase(l: Pick<FamilyLooks, "glasses" | "glassesType">): string {
  const t = typeof l.glassesType === "string" ? l.glassesType.trim() : "";
  if (t && wearsGlassesType(t)) return `${t.endsWith("안경") ? t : `${t} 안경`}을 썼다`;
  if (t === GLASSES_NONE) return "안경을 쓰지 않는다";
  return l.glasses === true ? "안경을 썼다" : "안경을 쓰지 않는다";
}

/**
 * 생김새를 한 줄로(한국어) — 그림 프롬프트·이야기(@@CHARACTER@@)에 그대로 들어간다.
 * 엄마·아빠(parentLooksToPrompt)와 할머니·형제·친구가 같은 함수를 쓴다. 안 고른 칸은 빠지고,
 * 안경은 늘 적는다. who 를 주면 수염은 아빠·할아버지만 적는다('없어요'면 '수염이 없다').
 * 칸 순서: 머리 → 머리결 → 앞머리 → 얼굴 → 눈 → 눈썹 → 피부 → 체형 → 키 → 안경 → 수염 → 이런 점도
 *          → 평소 옷 → 늘 하는 것 → 늘 지니는 것 → 메모.
 * 머리 색은 꾸밈말로 머리 앞에 붙이고(까만 단발머리), 명사가 아닌 머리 칩은 문장으로 푼다(머리가 아주 짧다).
 * 머리 모양이 머리결·앞머리까지 정하는 칩(곱슬 파마·앞머리 내린 머리 …)이면 그 칸은 적지 않는다.
 */
export function familyLooksToPrompt(l: FamilyLooks | undefined, who?: LookWho): string {
  if (!l) return "";
  const parts: string[] = [];
  const push = (s: string) => {
    if (s) parts.push(s);
  };
  const hair = typeof l.hair === "string" ? l.hair.trim() : "";
  const hairColor = typeof l.hairColor === "string" ? l.hairColor.trim() : "";
  push(hairPhrase(hair, hairColor));
  // 머리 모양이 머리결·앞머리까지 정하면(곱슬 파마·올백 …) 그 칸은 건너뛴다 — 머리 모양이 이긴다.
  if (!HAIR_SETS_TEXTURE.test(hair)) push(phrase(TEXTURE_PHRASE, l.hairTexture, (v) => `머리결은 ${v}`));
  if (!HAIR_SETS_BANGS.has(hair)) push(phrase(BANGS_PHRASE, l.bangs, (v) => `앞머리는 ${v}`));
  push(phrase(FACE_PHRASE, l.face, (v) => `얼굴형은 ${v}`));
  push(phrase(EYES_PHRASE, l.eyes, (v) => `눈매는 ${v}`));
  push(phrase(BROWS_PHRASE, l.brows, (v) => `눈썹은 ${v}`));
  push(phrase(SKIN_PHRASE, l.skin, (v) => `피부는 ${v}`));
  push(phrase(BUILD_PHRASE, l.build, (v) => `체형은 ${v}`));
  push(phrase(HEIGHT_PHRASE, l.height, (v) => `키는 ${v}`));
  push(glassesPhrase(l));
  if (!who || hasBeard(who)) push(phrase(BEARD_PHRASE, l.beard, (v) => `수염은 ${v}`));

  const marks = words(l.marks);
  const nouns = marks.filter((m) => !(m in MARK_SENTENCE)).map((m) => MARK_NOUN[m] ?? m);
  if (nouns.length) push(`${iGa(nouns.join("·"))} 있다`);
  for (const m of marks) if (m in MARK_SENTENCE) push(MARK_SENTENCE[m]);

  const color = typeof l.color === "string" ? l.color.trim() : "";
  const outfit = typeof l.outfit === "string" ? l.outfit.trim() : "";
  const bottom = typeof l.bottom === "string" ? l.bottom.trim() : "";
  const top = outfit ? [color, outfit].filter(Boolean).join(" ") : color ? `${color} 옷` : "";
  const clothes = [top, bottom].filter(Boolean).join("에 ");
  // 늘 하는 것은 '평소 옷' 묶음이다(동화마다 바뀔 수 있다) — 옷과 같은 말투로('평소에 … 즐겨 한다').
  // '늘 착용한다'로 적으면 이야기 인물 줄(@@CHARACTER@@ · 인물 시트 'Follow it literally')이 앞치마·모자를
  // 모든 쪽에 붙인다.
  const acc = words(l.accessories).join("·");
  if (clothes && acc) push(`평소에 ${eulReul(clothes)} 즐겨 입고 ${eulReul(acc)} 즐겨 한다`);
  else if (clothes) push(`평소에 ${eulReul(clothes)} 즐겨 입는다`);
  else if (acc) push(`평소에 ${eulReul(acc)} 즐겨 한다`);
  const items = words(l.items);
  if (items.length) push(`늘 ${eulReul(items.join("·"))} 지니고 다닌다`);
  if (typeof l.note === "string" && l.note.trim()) push(l.note.trim());
  return parts.join(", ");
}

/* ─────────────────────── '늘 그대로' 견주기(lockKey) ─────────────────────── */

/**
 * '늘 그대로' 칸 — 이게 바뀌면 '모습이 바뀌었어요'(다시 그릴지 묻기). 옷·늘 하는 것·메모는 빠진다.
 * (사장님 목록: 머리 모양·앞머리·머리결·머리 색·얼굴형·눈매·눈썹·피부·체형·키·안경·수염·이런 점도)
 * 이 순서가 lockKey 글자 순서다. 아이는 이 가운데 가진 칸만(얼굴형·눈썹·키·수염은 없다) 쓴다.
 */
export const LOCK_FIELDS = [
  "hair",
  "hairTexture",
  "bangs",
  "hairColor",
  "face",
  "eyes",
  "brows",
  "skin",
  "build",
  "height",
  "glasses",
  "beard",
  "marks",
] as const;
export type LockField = (typeof LOCK_FIELDS)[number];

/** lockKey 한 칸의 값 — 글자, 또는 안경 종류 모를 때(예전 값) true. 이런 점도는 '·'로 이어 정렬. */
type LockValue = string | true;

/** 한 칸의 견줄 값 — 예전 글자는 새 글자로 옮기고, 안경은 '쓴다(종류)'만 남긴다(안 써요 = 안 고름). */
function lockValue(looks: Record<string, unknown>, field: LockField, who: LookWho | undefined): LockValue | undefined {
  if (field === "glasses") {
    const t = looks.glassesType;
    if (typeof t === "string" && t.trim()) return wearsGlassesType(t.trim()) ? t.trim() : undefined;
    return looks.glasses === true ? true : undefined;
  }
  if (field === "marks") {
    const v = looks.marks;
    const list = typeof v === "string" ? v.split("·").map((x) => x.trim()).filter(Boolean) : words(v);
    return list.length ? [...new Set(list)].sort().join("·") : undefined;
  }
  if (field === "beard" && who && !hasBeard(who)) return undefined;
  const v = looks[field];
  if (typeof v !== "string" || !v.trim()) return undefined;
  return who ? migrateLookValue(who, field, v.trim()) : v.trim();
}

function lockPairs(looks: Record<string, unknown> | undefined, who: LookWho | undefined): [LockField, LockValue][] {
  const out: [LockField, LockValue][] = [];
  for (const f of LOCK_FIELDS) {
    const v = lockValue(looks ?? {}, f, who);
    if (v !== undefined) out.push([f, v]);
  }
  return out;
}

/** 지금 생김새 원본 — 아이는 설정 looks, 엄마·아빠는 설정 parents, 나머지는 member.looks */
export function currentLooksOf(
  member: Pick<FamilyMember, "role" | "looks">,
  child: Pick<ChildPrefs, "looks" | "parents"> | null | undefined,
): FamilyLooks {
  if (member.role === "child") return { ...(child?.looks ?? {}) };
  if (member.role === "mom" || member.role === "dad") return { ...(child?.parents?.[member.role] ?? {}) };
  return { ...(member.looks ?? {}) };
}

/**
 * 지금 '늘 그대로' 생김새를 순서 맞춘 글자로 — 그림을 받을 때 FamilyPortrait.lockKey 에 적어 둔다.
 * 아이·엄마·아빠는 ChildPrefs(설정) 값, 그 밖은 member.looks 로 계산한다.
 * 모양: JSON [[칸, 값], …] (값은 글자 또는 true). 예전 화면이 적은 lockKey 도 같은 모양이다.
 */
export function currentLockKey(
  member: Pick<FamilyMember, "role" | "looks">,
  child: Pick<ChildPrefs, "looks" | "parents"> | null | undefined,
): string {
  return JSON.stringify(lockPairs(currentLooksOf(member, child) as Record<string, unknown>, member.role));
}

/** lockKey → 생김새 모양(바뀐 칸 보여 주기·견주기용). 못 읽으면 undefined. */
function parseLockKey(lockKey: string | undefined): FamilyLooks | undefined {
  if (typeof lockKey !== "string") return undefined;
  let arr: unknown;
  try {
    arr = JSON.parse(lockKey);
  } catch {
    return undefined;
  }
  if (!Array.isArray(arr)) return undefined;
  const o: Record<string, unknown> = {};
  for (const p of arr) {
    if (!Array.isArray(p) || p.length !== 2 || typeof p[0] !== "string") continue;
    const [k, v] = p as [string, unknown];
    if (k === "glasses") {
      if (v === true) o.glasses = true;
      else if (typeof v === "string") o.glassesType = v;
    } else if (k === "marks" && typeof v === "string") {
      o.marks = v.split("·").map((x) => x.trim()).filter(Boolean);
    } else if (typeof v === "string") {
      o[k] = v;
    }
  }
  return o as FamilyLooks;
}

/** lockKey 에 적힌 그때 생김새(바뀐 칸 보여 주기용). 못 읽으면 빈 것. */
export function lockKeyLooks(lockKey: string | undefined): FamilyLooks {
  return parseLockKey(lockKey) ?? {};
}

/**
 * 적어 둔 lockKey 와 지금 생김새가 다른가 — '모습이 바뀌었어요'. lockKey 가 없거나 못 읽으면 false
 * (그릴 때 생김새를 모르는 옛 그림). 예전 글자(짧은 머리→숏컷 …)·예전 칸(메모)·칸 순서 차이는
 * 바뀐 것으로 치지 않는다 — 둘 다 같은 모양으로 다시 적어 견준다.
 */
export function lockKeyChanged(
  lockKey: string | undefined,
  member: Pick<FamilyMember, "role" | "looks">,
  child: Pick<ChildPrefs, "looks" | "parents"> | null | undefined,
): boolean {
  const then = parseLockKey(lockKey);
  if (!then) return false;
  return JSON.stringify(lockPairs(then as Record<string, unknown>, member.role)) !== currentLockKey(member, child);
}

/**
 * 고정한 그림을 그린 뒤로 '늘 그대로'가 바뀌었나(portrait.lockKey 기준).
 * 사진으로 그린 그림(fromPhoto)은 늘 false — 모습을 정한 건 칩이 아니라 사진이라, 칩을 비워 두었거나 나중에
 * 골라도 그림이 낡은 게 아니다(다시 그리면 사진이 없어 오히려 덜 닮는다).
 */
export function portraitLooksChanged(
  member: Pick<FamilyMember, "role" | "looks" | "portrait">,
  child: Pick<ChildPrefs, "looks" | "parents"> | null | undefined,
): boolean {
  if (member.portrait?.fromPhoto) return false;
  return lockKeyChanged(member.portrait?.lockKey, member, child);
}

/**
 * '모습이 바뀌었어요'를 보일까 — 고정된 사람 가운데 확인 전 새 그림(draft)이 없고, 고정한 뒤 '늘 그대로'가
 * 바뀐 사람. 확인 전 그림이 있으면 그걸 먼저 볼 차례라(모아 보기 '새 그림이 있어요') 다시 그릴지 묻지 않는다.
 * 모아 보기 카드·설정의 '얼굴 고정됨' 표시·'우리 가족 캐릭터' 줄이 같은 규칙을 쓴다.
 */
export function showsLooksChanged(
  member: Pick<FamilyMember, "role" | "looks" | "portrait" | "draft">,
  child: Pick<ChildPrefs, "looks" | "parents"> | null | undefined,
): boolean {
  return Boolean(member.portrait) && !member.draft && portraitLooksChanged(member, child);
}

const LOCK_LABEL: Readonly<Record<LockField, string>> = {
  hair: "머리 모양",
  hairTexture: "머리결",
  bangs: "앞머리",
  hairColor: "머리 색",
  face: "얼굴형",
  eyes: "눈매",
  brows: "눈썹",
  skin: "피부",
  build: "체형",
  height: "키",
  glasses: "안경",
  beard: "수염",
  marks: "이런 점도",
};

/**
 * 바뀐 '늘 그대로' 칸을 '머리 모양: 짧은 머리 → 숏컷' 처럼. before·after 는 생김새 모양
 * (lockKeyLooks(portrait.lockKey) · currentLooksOf(member, child)). 옷만 바뀌었으면 빈 배열.
 */
export function lockChanges(
  who: LookWho,
  before: Record<string, unknown> | FamilyLooks | undefined,
  after: Record<string, unknown> | FamilyLooks | undefined,
): string[] {
  const out: string[] = [];
  const show = (f: LockField, v: LockValue | undefined) =>
    v === true ? GLASSES_LEGACY : v ?? (f === "glasses" ? "안 씀" : "안 고름");
  for (const f of LOCK_FIELDS) {
    const a = lockValue((before ?? {}) as Record<string, unknown>, f, who);
    const b = lockValue((after ?? {}) as Record<string, unknown>, f, who);
    if (a === b) continue;
    const label = f === "build" && isKidRole(who) ? "몸집" : LOCK_LABEL[f];
    out.push(`${label}: ${show(f, a)} → ${show(f, b)}`);
  }
  return out;
}

/**
 * '늘 그대로'가 바뀌었나 — 바뀌면 다시 그릴지 묻는다. 옷(옷 종류·아래옷·옷 색·늘 하는 것)·메모만
 * 바뀌면 묻지 않는다. who 를 주면 예전 글자를 새 글자로 옮겨 견주고 수염은 아빠·할아버지만 본다.
 */
export function lockedLooksChanged(a: FamilyLooks | undefined, b: FamilyLooks | undefined, who?: LookWho): boolean {
  return (
    JSON.stringify(lockPairs(a as Record<string, unknown> | undefined, who)) !==
    JSON.stringify(lockPairs(b as Record<string, unknown> | undefined, who))
  );
}

/* ─────────────────────────────── 정규화 ─────────────────────────────── */

const ROLES: FamilyRole[] = ["child", "mom", "dad", "grandma", "grandpa", "sibling", "friend"];
/**
 * 식구 수 상한 — '제한 없음'이 약속이라 넉넉히 둔다(저장 크기만 지키는 안전판). 화면(가족 더하기)도
 * 같은 값에서 막고 알린다 — 넘긴 사람이 다음 불러오기 때 그림째 말없이 잘려 나가지 않게.
 */
export const FAMILY_MAX_MEMBERS = 60;
const MAX_MEMBERS = FAMILY_MAX_MEMBERS;

function str(x: unknown, max: number): string | undefined {
  return typeof x === "string" && x.trim() ? x.trim().slice(0, max) : undefined;
}

function normalizePortrait(raw: unknown): FamilyPortrait | undefined {
  const p = raw as Partial<FamilyPortrait> | null | undefined;
  if (!p || typeof p !== "object") return undefined;
  const ok = (u: unknown) => typeof u === "string" && /^https:\/\//.test(u) && u.length <= 500;
  if (!ok(p.url) || !ok(p.ref)) return undefined;
  const lockKey = typeof p.lockKey === "string" && p.lockKey.length <= 1000 ? p.lockKey : undefined;
  // 믿을 범위(2~10) 안의 숫자만, 0.01 단위로 — 이상한 값은 버린다(단체 사진이 실제 키 비율로 돌아간다).
  const headRatio = cleanHeadRatio(p.headRatio);
  // 굽기 때 늘인 배율 — 1 초과 ~ 1.5 숫자만(이상하면 버린다 — 단체 사진이 늘이지 않은 그림으로 본다).
  const bodyStretch = cleanBodyStretch(p.bodyStretch);
  return {
    url: p.url as string,
    ref: p.ref as string,
    at: str(p.at, 40) ?? "",
    ...(p.opaque === true ? { opaque: true } : {}),
    ...(lockKey !== undefined ? { lockKey } : {}),
    ...(p.fromPhoto === true ? { fromPhoto: true } : {}),
    ...(headRatio !== undefined ? { headRatio } : {}),
    ...(bodyStretch !== undefined ? { bodyStretch } : {}),
  };
}

/** 하나만 고르는 생김새 칸(글자) */
const LOOK_SINGLE_KEYS = [
  "hair",
  "bangs",
  "hairTexture",
  "hairColor",
  "face",
  "eyes",
  "brows",
  "skin",
  "build",
  "height",
  "glassesType",
  "beard",
  "outfit",
  "bottom",
  "color",
] as const;

/**
 * 저장된 생김새를 안전하게 고른다(엄마·아빠·할머니·형제·친구 공통). 빈 칸은 아예 두지 않고,
 * 하나도 없으면 undefined.
 *  - 예전 글자는 새 글자로(엄마 '짧은 머리'→'숏컷' …, migrateLookValue).
 *  - 안경: 종류(glassesType)가 있으면 그것으로 glasses 를 맞춘다(안 써요 → 없음). 종류 없이
 *    glasses:true 만 있는 예전 값은 그대로 둔다('안경 씀').
 *  - 수염은 아빠·할아버지만, 늘 지니는 것(items)은 아이 쪽(형제·친구)만 남긴다.
 *  - 메모는 역할마다 입력 칸과 같은 길이(lookNoteMax — 엄마·아빠 40자, 그 밖 60자).
 */
export function normalizeLooksFor(raw: unknown, who: LookWho, noteMax = lookNoteMax(who)): FamilyLooks | undefined {
  const v = raw as Record<string, unknown> | null | undefined;
  if (!v || typeof v !== "object") return undefined;
  const out: Record<string, unknown> = {};
  for (const k of LOOK_SINGLE_KEYS) {
    if (k === "beard" && !hasBeard(who)) continue;
    const s = str(v[k], 30);
    if (s) out[k] = migrateLookValue(who, k, s);
  }
  const glassesType = out.glassesType as string | undefined;
  if (glassesType ? wearsGlassesType(glassesType) : v.glasses === true) out.glasses = true;
  const list = (x: unknown, max: number) => {
    const arr = [...new Set(words(x).map((y) => y.slice(0, 30)))].slice(0, max);
    return arr.length ? arr : undefined;
  };
  const marks = list(v.marks, 5);
  if (marks) out.marks = marks;
  const accessories = list(v.accessories, 8);
  if (accessories) out.accessories = accessories;
  if (isKidRole(who)) {
    const items = list(v.items, 6);
    if (items) out.items = items;
  }
  const note = str(v.note, noteMax);
  if (note) out.note = note;
  return Object.keys(out).length ? (out as FamilyLooks) : undefined;
}

/**
 * 저장된 가족 목록을 안전하게 고른다. **빈 배열은 빈 배열로 둔다** — '모두 지움'이
 * 다른 기기 값으로 되살아나지 않게(mergeRemoteChild 참고). 배열이 아니면 undefined(필드 없음).
 */
export function normalizeFamily(raw: unknown): FamilyMember[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  const out: FamilyMember[] = [];
  for (const item of raw) {
    const m = item as Partial<FamilyMember> | null;
    if (!m || typeof m !== "object") continue;
    const id = typeof m.id === "string" && /^[a-z0-9-]{1,40}$/.test(m.id) ? m.id : undefined;
    const role = ROLES.includes(m.role as FamilyRole) ? (m.role as FamilyRole) : undefined;
    if (!id || !role || seen.has(id)) continue;
    seen.add(id);
    const age = typeof m.age === "number" && m.age > 0 && m.age < 100 ? Math.round(m.age) : undefined;
    const draws = typeof m.draws === "number" && m.draws >= 0 && m.draws < 1000 ? Math.round(m.draws) : undefined;
    out.push({
      id,
      role,
      callName: str(m.callName, 12) ?? ROLE_LABEL[role],
      name: str(m.name, 20),
      gender: m.gender === "girl" || m.gender === "boy" ? m.gender : undefined,
      age,
      looks: normalizeLooksFor(m.looks, role),
      portrait: normalizePortrait(m.portrait),
      draft: normalizePortrait(m.draft),
      prevDraft: normalizePortrait(m.prevDraft),
      draws,
      picAt: str(m.picAt, 40),
      addedAt: str(m.addedAt, 40),
      // 켬·끔 둘 다 뜻이 있다(처음 값이 역할마다 달라서) — true/false 모두 지킨다.
      ...(typeof m.showOnHome === "boolean" ? { showOnHome: m.showOnHome } : {}),
      ...(role === "sibling" && m.isOurChild === true ? { isOurChild: true } : {}),
      ...(m.looksOnly === true ? { looksOnly: true } : {}),
    });
    if (out.length >= MAX_MEMBERS) break;
  }
  return out;
}

/* ─────────────────────────────── 기기끼리 합치기 ─────────────────────────────── */

/** 가족 목록 한 벌과 그 목록을 마지막으로 바꾼 때(ISO), 그리고 뺀 사람 기록 */
export type FamilySide = { family?: FamilyMember[]; familyAt?: string; familyRemoved?: FamilyRemoval[] };

/** 뺀 기록을 이만큼만 남긴다(새것부터) — 식구 수 상한(60)보다 넉넉히. 저장 크기 안전판. */
export const FAMILY_REMOVED_MAX = 100;

/** 저장된 뺀 기록을 안전하게 고른다 — 같은 사람은 더 나중 시각 하나. 없으면 undefined. */
export function normalizeRemovals(raw: unknown): FamilyRemoval[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const list: FamilyRemoval[] = [];
  for (const x of raw) {
    const r = x as Partial<FamilyRemoval> | null;
    if (!r || typeof r !== "object") continue;
    if (typeof r.id !== "string" || !/^[a-z0-9-]{1,40}$/.test(r.id)) continue;
    if (typeof r.at !== "string" || !r.at.trim()) continue;
    list.push({ id: r.id, at: r.at.trim().slice(0, 40) });
  }
  return mergeRemovals(list, undefined);
}

/** 뺀 기록 두 벌을 합친다 — 같은 사람은 더 나중 시각. 새것부터 FAMILY_REMOVED_MAX 개. 비면 undefined. */
export function mergeRemovals(
  a: readonly FamilyRemoval[] | undefined,
  b: readonly FamilyRemoval[] | undefined,
): FamilyRemoval[] | undefined {
  const at = new Map<string, string>();
  for (const r of [...(a ?? []), ...(b ?? [])]) {
    const cur = at.get(r.id);
    if (cur === undefined || r.at > cur) at.set(r.id, r.at);
  }
  if (at.size === 0) return undefined;
  return [...at]
    .map(([id, t]) => ({ id, at: t }))
    .sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0))
    .slice(0, FAMILY_REMOVED_MAX);
}

/** 이 사람의 그림 칸이 마지막으로 바뀐 때 — picAt, 없으면 그림에 적힌 시각 */
function picTime(m: FamilyMember): string {
  if (m.picAt) return m.picAt;
  const ats = [m.portrait?.at, m.draft?.at].filter((x): x is string => Boolean(x));
  return ats.reduce((best, x) => (x > best ? x : best), "");
}

/** 이 사람이 마지막으로 '살아 있다'고 적힌 때 — 넣은 때와 그림 시각 가운데 늦은 쪽 */
function aliveTime(m: FamilyMember): string {
  const p = picTime(m);
  const a = m.addedAt ?? "";
  return a > p ? a : p;
}

/**
 * 뺀 기록에 걸린 사람을 뺀다 — 기록이 그 사람의 넣은 때·그림 시각보다 나중일 때만.
 * 뺀 뒤에 다른 기기에서 다시 넣었거나 쿠키를 내고 그렸으면 남는다. 아이(주인공)는 빼지 않는다.
 */
export function withoutRemoved(
  family: FamilyMember[] | undefined,
  removed: readonly FamilyRemoval[] | undefined,
): FamilyMember[] | undefined {
  if (!family || !removed || removed.length === 0) return family;
  const gone = new Map(removed.map((r) => [r.id, r.at]));
  return family.filter((m) => {
    const at = gone.get(m.id);
    return m.role === "child" || at === undefined || !(at > aliveTime(m));
  });
}

/** 같은 사람 두 벌 — 목록 쪽(win)의 이름·생김새는 두고, 그림 칸은 더 새것을 남긴다. */
function mergeMember(win: FamilyMember, other: FamilyMember): FamilyMember {
  const src = picTime(other) > picTime(win) ? other : win;
  const draws = Math.max(win.draws ?? -1, other.draws ?? -1);
  const addedAt = (other.addedAt ?? "") > (win.addedAt ?? "") ? other.addedAt : win.addedAt;
  return {
    ...win,
    portrait: src.portrait,
    draft: src.draft,
    prevDraft: src.prevDraft,
    picAt: src.picAt ?? win.picAt,
    // 서버 셈은 늘거나(그림) 되돌림으로 준다 — 크게 잡으면 값 안내가 실제보다 크거나 같아 동의 없이 깎이지 않는다.
    draws: draws >= 0 ? draws : undefined,
    // 뺀 기록과 견줄 때 쓴다 — 다시 넣은 쪽(더 늦은 때)을 남긴다.
    ...(addedAt ? { addedAt } : {}),
  };
}

/**
 * 가족 목록 두 벌(서버·이 기기, 또는 두 기기)을 합친다 — 쿠키를 내고 받은 그림을 옛 목록이 덮어 지우지 않게.
 *
 *  - **사람은 두 목록을 합집합으로 모은다.** 한쪽에만 있는 사람은 그쪽에서 넣었거나 다른 쪽이 아직 못 본
 *    사람이다 — 오래 열어 둔 화면이 옛 목록으로 저장해도 다른 기기에서 넣고 고정한 사람이 사라지지 않는다.
 *  - 빼기는 뺀 기록(familyRemoved)으로만 전한다 — 두 쪽 기록을 합치고, 기록이 그 사람의 넣은 때·그림 시각보다
 *    나중인 사람만 뺀다(withoutRemoved). 뺀 뒤에 다른 기기에서 다시 넣거나 그렸으면 남는다.
 *  - 이름·생김새·홈 보이기 같은 칸과 순서는 **나중에 바꾼 쪽**(familyAt 이 큰 쪽)을 따른다. 같으면 a 쪽(보통 서버).
 *  - 양쪽에 다 있는 사람은 그림 칸(portrait·draft·prevDraft)을 **더 새 그림** 쪽에서 가져온다.
 *  - 한쪽에 가족 칸이 아예 없으면(옛 계정) 다른 쪽을 쓴다.
 */
export function mergeFamily(a: FamilySide, b: FamilySide): FamilySide {
  const removed = mergeRemovals(a.familyRemoved, b.familyRemoved);
  if (!a.family) return { family: withoutRemoved(b.family, removed), familyAt: b.familyAt ?? a.familyAt, familyRemoved: removed };
  if (!b.family) return { family: withoutRemoved(a.family, removed), familyAt: a.familyAt ?? b.familyAt, familyRemoved: removed };
  const aAt = a.familyAt ?? "";
  const bAt = b.familyAt ?? "";
  const [win, lose, winAt] = aAt >= bAt ? [a.family, b.family, aAt] : [b.family, a.family, bAt];
  const byId = new Map(lose.map((m) => [m.id, m]));
  const out = win.map((m) => {
    const o = byId.get(m.id);
    return o ? mergeMember(m, o) : m;
  });
  const have = new Set(out.map((m) => m.id));
  for (const o of lose) {
    if (have.has(o.id)) continue;
    have.add(o.id);
    out.push(o);
  }
  const kept = withoutRemoved(out, removed) ?? [];
  return { family: kept.slice(0, MAX_MEMBERS), familyAt: winAt || undefined, familyRemoved: removed };
}

/** 새 사람 id — 서버 결제 기록 열쇠라 한 번 정하면 바꾸지 않는다. */
export function newMemberId(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `m-${rand}`;
}

/** 고정된 사람만 */
export function fixedMembers(family: FamilyMember[] | undefined): FamilyMember[] {
  return (family ?? []).filter((m) => m.portrait);
}
