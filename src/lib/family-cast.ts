/**
 * 동화 등장인물 ↔ 우리 가족 캐릭터 짝짓기 — 얼굴을 고정한 사람(FamilyMember.portrait)의 그림을 인물 시트에 물린다.
 *
 * 사장님 제보(2026-09-29): '하온이의 나뭇잎 보물찾기'에서 가족 화면에 고정해 둔 하온 얼굴과 다른 하온이 그려졌다.
 * 가족 규칙(lib/family.ts 맨 위)은 "고정한 사람은 동화마다 그 모습 그대로"인데, 만들기 화면이 인물 시트
 * (api/character-sheet — 모든 쪽의 유일한 얼굴 기준)에 고정 얼굴을 한 번도 안 보냈다.
 *
 * 등장인물 이름은 클로드가 정한다(주인공 = 아이 이름, 같이 나오는 사람 = 적어 준 이름이나 '엄마'·'할머니'·'형' 같은 호칭).
 * 여기서 그 이름을 가족 한 사람과 짝짓는다. **헷갈리면 붙이지 않는다** — 남의 얼굴이 붙는 것이 새 얼굴보다 훨씬 나쁘다.
 *   ① 주인공(첫 사람)은 사람 이름으로만 — 아이(호칭 = 아이 이름) 또는 이름이 같은 형제. '하온이'도 '하온'으로 본다.
 *   ② 나머지는 실제 이름 먼저 — 형제·단짝 친구의 이름, 아이의 호칭(형제가 주인공인 책).
 *   ③ 엄마·어머니 / 아빠·아버지 — 그대로, 또는 '하온이 엄마'·'우리 엄마'처럼 주인공이 앞에 붙은 꼴만. '서연이 엄마'는 남이다.
 *   ④ 할머니·할아버지 — 호칭이 같은 사람 먼저(외할머니 …). 그냥 '할머니'는 할머니가 한 분뿐일 때만.
 *   ⑤ 형제 — 호칭이 같은 사람 먼저. 없으면 형=오빠, 누나=언니, 동생=남동생·여동생 가운데 한 명뿐일 때만
 *      (만들기 화면은 주인공 성별로 형·오빠를 고르고, 가족 화면 호칭은 따로 골라서 서로 어긋날 수 있다).
 *   ⑥ 단짝 친구는 이름으로만 — 그냥 '친구'는 이름 없는 모든 친구를 부르는 말이라 붙이지 않는다.
 *   ⑦ 호칭(③~⑤)은 **주인공이 우리 집 아이일 때만** 우리 가족을 가리킨다(2026-09-29 검토).
 *      주인공이 가족이 아니면(사촌·단짝 친구 서연 …) '엄마'는 그 아이의 엄마다 — 이름으로만 짝짓는다.
 *      주인공이 형제면 엄마·아빠·할머니·할아버지는 같은 분이지만, 형제 호칭은 아이 쪽에서 적어 둔 말이라
 *      (하준이의 '동생'은 하온일 수도 하린일 수도 있다) 형제 호칭은 쓰지 않는다.
 *   · 헷갈림은 고정 안 한 사람까지 세어 판단한다(할머니 두 분 가운데 한 분만 고정해도 '할머니'는 헷갈린다).
 *   · 한 사람은 한 인물에만. 앞 인물이 먼저 가져간다. 시트가 6명까지만 그리므로 앞 6명만 본다.
 *   · 이야기에 없는 가족은 붙이지 않는다 — 시트의 'EXACTLY N명' 규칙이 깨진다.
 *
 * 브라우저에서 돈다(이 기기 가족이 서버보다 새 그림을 들고 있을 수 있다). 서버는 주소만 다시 검사한다(lib/family-ref).
 * 순수 함수만 둔다 — node --test 로 시험한다(family-cast.test.ts).
 */
import { familyLooksToPrompt, pictureDecidesLooks, type FamilyMember, type FamilyRole } from "./family.ts";

/** 인물 시트에 물릴 고정 얼굴 한 사람 */
export type CastPortrait = {
  /** 등장인물 이름 — s.characters 에 적힌 그대로(서버가 이 이름으로 등장인물과 맞춘다) */
  name: string;
  /** 참고용 흰 바탕 JPEG 주소(FamilyPortrait.ref) */
  ref: string;
  memberId: string;
  role: FamilyRole;
};

/** 시트가 그리는 최대 인원(api/character-sheet 가 6명에서 자른다) */
const SHEET_CAST_MAX = 6;
/**
 * 기본 상한 — 시트가 그리는 6명 모두. 예전엔 4명이라, 6명이 나오는 가족 동화에서 뒤의 둘(대개 할머니·할아버지)은
 * 고정 얼굴 없이 클로드의 글로만 그려졌다(2026-10-01 사장님 "내가 생성한 아바타와 동화 속 아바타가 너무 달라").
 * 수채화 책은 시트를 원본 픽셀로 짜서(lib/sheet-compose) 수 제한이 없다. AI 가 다시 그리는 시트(지브리·벡터 책)는
 * 서버가 모델에 따라 줄인다(lib/sheet-prompt maxPortraitRefs).
 */
export const CAST_PORTRAITS_MAX = 6;

const MOM_WORDS = new Set(["엄마", "어머니"]);
const DAD_WORDS = new Set(["아빠", "아버지"]);
const GRANDMA_WORDS = new Set(["할머니", "외할머니", "친할머니"]);
const GRANDPA_WORDS = new Set(["할아버지", "외할아버지", "친할아버지"]);
const SIBLING_WORDS = new Set(["형", "오빠", "누나", "언니", "남동생", "여동생", "동생"]);
/** 호칭이 딱 맞는 형제가 없을 때만 쓰는 같은 자리 묶음 */
const SIBLING_GROUPS: Record<string, readonly string[]> = {
  형: ["형", "오빠"],
  오빠: ["형", "오빠"],
  누나: ["누나", "언니"],
  언니: ["누나", "언니"],
  동생: ["남동생", "여동생"],
};

/** 괄호 안 말을 떼고, 띄어쓰기를 없앤 이름. "엄마 (지은)" → "엄마", "하온이 엄마" → "하온이엄마". */
function bare(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[(（][^)）]*[)）]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

/** 괄호 안 말 — "지은(엄마)"의 "엄마". 호칭을 괄호에 적는 일이 있어 함께 본다. */
function inParens(s: string): string[] {
  return [...s.normalize("NFC").matchAll(/[(（]([^)）]*)[)）]/g)].map((m) => m[1].replace(/\s+/g, "")).filter(Boolean);
}

/** 한글 음절에 받침이 있나 */
function hasFinal(ch: string): boolean {
  const code = ch.charCodeAt(0) - 0xac00;
  return code >= 0 && code < 11172 && code % 28 !== 0;
}

/**
 * 부르는 꼴의 '이'를 뗀다 — 받침 있는 이름만("하온이" → "하온"). "지우" 는 그대로.
 * 양쪽에 똑같이 적용해서 견준다(이름이 원래 '…이'로 끝나도 양쪽이 같이 줄어 같게 나온다).
 */
function stem(name: string): string {
  const n = bare(name);
  if (n.length >= 2 && n.endsWith("이") && hasFinal(n[n.length - 2])) return n.slice(0, -1);
  return n;
}

function sameName(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const x = stem(a);
  return Boolean(x) && x === stem(b);
}

/**
 * 호칭만 남긴다 — 그대로 호칭이거나, 주인공('하온'·'하온이'·'하온의'·'하온이의')이나 '우리'가 앞에 붙은 꼴.
 * 다른 말이 앞에 붙으면('서연이 엄마' = 친구 엄마) 호칭이 아니다.
 */
function roleWord(key: string, heroName: string, words: ReadonlySet<string>): string | null {
  const hero = heroName ? stem(heroName) : "";
  const prefixes = ["우리", ...(hero ? [hero, `${hero}이`, `${hero}의`, `${hero}이의`] : [])];
  // '동생이'처럼 부르는 꼴의 '이'가 붙어도 같은 호칭
  for (const k of new Set([key, stem(key)])) {
    if (words.has(k)) return k;
    for (const p of prefixes) {
      if (k.startsWith(p) && words.has(k.slice(p.length))) return k.slice(p.length);
    }
  }
  return null;
}

/** 한 명뿐이면 그 사람, 아니면(없거나 여럿) null */
function only(list: readonly FamilyMember[]): FamilyMember | null {
  return list.length === 1 ? list[0] : null;
}

/** 아이(가족 화면의 '우리 아이' 칸) — 호칭이 곧 아이 이름이다. */
function isChild(m: FamilyMember): boolean {
  return m.id === "child" || m.role === "child";
}

/** 주인공 — 사람 이름으로만. 아이(호칭)와 이름이 같은 형제. 둘 다 맞으면 헷갈림. */
function heroMember(name: string, family: readonly FamilyMember[]): FamilyMember | null {
  const found = family.filter(
    (m) =>
      (isChild(m) && sameName(m.callName, name)) ||
      (m.role === "sibling" && sameName(m.name, name)),
  );
  return only(found);
}

/**
 * 주인공 아닌 인물의 한 이름 꼴(key)에 맞는 가족 — 없거나 헷갈리면 빈 목록/여럿.
 * heroM = 주인공과 짝지은 가족(없으면 null — 주인공이 우리 가족이 아닌 책).
 */
function candidatesFor(
  key: string,
  heroName: string,
  heroM: FamilyMember | null,
  family: readonly FamilyMember[],
): FamilyMember[] {
  // ② 실제 이름 — 형제·단짝 친구의 이름, 아이의 호칭(형제가 주인공인 책)
  const byName = family.filter(
    (m) =>
      ((m.role === "sibling" || m.role === "friend") && sameName(m.name, key)) ||
      (isChild(m) && sameName(m.callName, key)),
  );
  if (byName.length) return byName;

  // ⑦ 주인공이 우리 가족이 아니면 호칭은 남의 집 사람이다 — 이름으로만 짝짓는다.
  if (!heroM) return [];

  // ③ 엄마·아빠
  if (roleWord(key, heroName, MOM_WORDS)) return family.filter((m) => m.role === "mom");
  if (roleWord(key, heroName, DAD_WORDS)) return family.filter((m) => m.role === "dad");

  // ④ 할머니·할아버지 — 호칭이 같은 분 먼저, 그냥 '할머니'는 한 분뿐일 때만
  for (const [words, role, plain] of [
    [GRANDMA_WORDS, "grandma", "할머니"],
    [GRANDPA_WORDS, "grandpa", "할아버지"],
  ] as const) {
    const word = roleWord(key, heroName, words);
    if (!word) continue;
    const same = family.filter((m) => m.role === role && bare(m.callName) === word);
    if (same.length) return same;
    return word === plain ? family.filter((m) => m.role === role) : [];
  }

  // ⑤ 형제 — 호칭이 같은 사람 먼저, 없으면 같은 자리 묶음에서 한 명뿐일 때만.
  //    형제 호칭은 아이 쪽에서 적은 말이라 주인공이 아이일 때만 쓴다(⑦).
  const sib = roleWord(key, heroName, SIBLING_WORDS);
  if (sib) {
    if (!isChild(heroM)) return [];
    const siblings = family.filter((m) => m.role === "sibling");
    const same = siblings.filter((m) => bare(m.callName) === sib);
    if (same.length) return same;
    const group = SIBLING_GROUPS[sib];
    return group ? siblings.filter((m) => group.includes(bare(m.callName))) : [];
  }

  // ⑥ 그냥 '친구'·'선생님' 같은 말은 누구와도 짝짓지 않는다
  return [];
}

/** 주인공 아닌 인물 — 이름 꼴(괄호 밖·괄호 안)마다 찾아 모은 사람이 딱 한 명일 때만 */
function companionMember(
  name: string,
  heroName: string,
  heroM: FamilyMember | null,
  family: readonly FamilyMember[],
): FamilyMember | null {
  const keys = [...new Set([bare(name), ...inParens(name)].filter(Boolean))];
  const found = new Map<string, FamilyMember>();
  for (const key of keys) for (const m of candidatesFor(key, heroName, heroM, family)) found.set(m.id, m);
  return only([...found.values()]);
}

/**
 * 등장인물마다 고정 얼굴을 찾는다 — 주인공 먼저, 등장인물 순서, 최대 max 명.
 * 고정 그림(portrait)만 쓴다. 확인 전 그림(draft·prevDraft)이나 '특징만 저장'한 사람은 붙이지 않는다.
 */
export function castPortraits(
  characters: readonly { name: string }[] | undefined,
  family: readonly FamilyMember[] | undefined,
  opts: { max?: number } = {},
): CastPortrait[] {
  const max = opts.max ?? CAST_PORTRAITS_MAX;
  const members = family ?? [];
  const cast = (characters ?? []).slice(0, SHEET_CAST_MAX);
  if (!members.length || !cast.length || max <= 0) return [];
  const heroName = cast[0].name?.trim() ?? "";
  // 주인공이 우리 집 누구인지 한 번만 — 호칭(엄마·동생 …)이 누구를 가리키는지가 여기 달렸다(⑦).
  const heroM = heroName ? heroMember(heroName, members) : null;
  const claimed = new Set<string>();
  const out: CastPortrait[] = [];
  cast.forEach((c, i) => {
    const name = c.name?.trim() ?? "";
    if (!name || out.length >= max) return;
    const m = i === 0 ? heroM : companionMember(name, heroName, heroM, members);
    // 한 사람은 한 인물에만 — 이미 앞 인물이 가져갔으면 이 인물은 글로만 그린다(다른 사람으로 물러서지 않는다).
    if (!m || claimed.has(m.id)) return;
    claimed.add(m.id);
    const ref = m.portrait?.ref;
    if (!ref) return;
    out.push({ name: c.name, ref, memberId: m.id, role: m.role });
  });
  return out;
}

/** 이야기(클로드)에 건네는 가족 한 사람의 생김새 — 아이·엄마·아빠는 따로 간다(lib/anthropic ChildProfile looks·parentLooks). */
export type StoryFamilyLook = {
  /** 이야기에서 부를 이름 — 형제 '시우(형)', 단짝 친구 '서연(단짝 친구)', 할머니·할아버지는 호칭('외할머니') */
  who: string;
  /** 부모가 고른 생김새 한 줄(옷은 빼고) — 없으면 fixed 만 */
  line?: string;
  /** 가족 화면에 그림이 고정된 사람 */
  fixed?: boolean;
};

/** 이야기에 건네는 최대 인원 — 할머니·할아버지 넷 + 형제·친구 넉넉히 */
const STORY_FAMILY_MAX = 8;

/**
 * 할머니·할아버지·형제·단짝 친구의 생김새를 이야기에 건넨다(2026-10-01 사장님 "아바타와 너무 달라" ④).
 * 예전엔 아이·엄마·아빠 생김새만 이야기에 갔다. 그래서 클로드가 할머니를 '하얀 쪽진 머리'처럼 지어냈고, 그 글이 쪽 그림 프롬프트에
 * 고정 그림과 함께 들어가 얼굴을 끌어당겼다. 고정 그림이 없는 사람은 그 지어낸 모습 그대로 그려졌다.
 *  · 칩(생김새)을 고른 사람: 그 칩 그대로 — 옷은 뺀다(옷은 책마다 이야기가 정한다, 2026-09-29).
 *  · 사진으로 그린 고정 그림(fromPhoto): 모습을 정한 건 칩이 아니라 사진이다(칩이 비었거나 다를 수 있다) — 생김새를 적지 말라고만(fixed).
 *  · 칩도 그림도 없는 사람, 이름 없는 형제·친구: 건네지 않는다 — 이름 없는 '친구'는 이야기의 아무 친구다(castPortraits ⑥과 같다).
 */
export function storyFamilyLooks(family: readonly FamilyMember[] | undefined): StoryFamilyLook[] {
  const out: StoryFamilyLook[] = [];
  for (const m of family ?? []) {
    if (m.role !== "grandma" && m.role !== "grandpa" && m.role !== "sibling" && m.role !== "friend") continue;
    const call = m.callName?.trim() ?? "";
    const name = m.name?.trim() ?? "";
    const who =
      m.role === "grandma" || m.role === "grandpa"
        ? call
        : !name
          ? ""
          : m.role === "friend"
            ? `${name}(단짝 친구)`
            : call && call !== name
              ? `${name}(${call})`
              : name;
    if (!who) continue;
    const fixed = Boolean(m.portrait?.ref);
    // 사진으로 그렸거나 예전 그림으로 되돌린 사람 — 그림이 모습을 정한다(칩은 쓰지 않는다)
    const line = pictureDecidesLooks(m) ? "" : familyLooksToPrompt(m.looks, m.role, { clothes: false });
    if (line) out.push({ who, line, ...(fixed ? { fixed: true } : {}) });
    else if (fixed) out.push({ who, fixed: true });
    if (out.length >= STORY_FAMILY_MAX) break;
  }
  return out;
}

/**
 * 이야기 프롬프트(lib/anthropic describeChild)에 넣는 줄 — storyFamilyLooks 를 받은 그대로 문장으로.
 * 고른 생김새가 있으면 엄마·아빠와 같은 말로("이야기에 나오면 생김새는 이대로"). 그림이 고정됐는데 고른 생김새가 없으면(사진으로 그림)
 * 지어내지 말고 '가족 그림 그대로'라고만 적게 한다 — 쪽 그림은 얼굴을 고정 그림에서 가져오는데, 지어낸 머리·얼굴 글이 함께 들어가면
 * 그림을 엉뚱하게 끌어당긴다.
 */
export function storyFamilyLookLines(looks: readonly StoryFamilyLook[] | undefined): string[] {
  if (!looks?.length) return [];
  const fixedOnly = looks.filter((l) => !l.line && l.fixed).map((l) => l.who);
  return [
    ...looks
      .filter((l) => l.line)
      .map((l) => `${subjectOf(l.who)} 이야기에 나오면 생김새는 이대로 쓴다(부모가 직접 고름, 여기 없는 것은 지어내지 않는다): ${l.line}`),
    ...(fixedOnly.length
      ? [
          `가족 그림이 정해져 있는 사람: ${fixedOnly.join(", ")}. 이 사람이 이야기에 나오면 @@CHARACTER@@ 생김새 칸에 머리·얼굴을 지어내지 말고 '가족 그림 그대로'라고만 쓴다.`,
        ]
      : []),
  ];
}

/** '할머니가'·'시우(형)가'·'하준(형)이' — 괄호 앞 글자의 받침으로 이/가를 고른다. */
function subjectOf(who: string): string {
  const base = who.replace(/[(（][^)）]*[)）]\s*$/, "").trim() || who;
  return `${who}${hasFinal(base[base.length - 1] ?? "") ? "이" : "가"}`;
}
