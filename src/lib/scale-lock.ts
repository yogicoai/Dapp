/**
 * 크기 잠금 — 보통 사람 크기가 아닌 인물(거인·소인)의 크기를 책 전체에서 못박는다.
 *
 * 2026-10-12 사장님 "한 장면이 잘못 나왔다, 크기가" — 거인국 책(하온이·거인 아이 포포)의 5쪽에서 거인이 그냥 큰 형으로 그려졌다.
 * 크기를 책 차원에서 잠근 곳이 없었다: 2~4쪽은 장면 글("손바닥에", "쿠키 산", "숟가락")이 크기를 알려 줘 맞았고,
 * 5쪽("단추를 건넨다")은 단서가 없어 무너졌다. 반대로 미는 줄도 둘 있었다 —
 *  · 시트 줄의 "모든 사람을 나이에 맞는 자연스러운 키로"(lib/page-refs sheetOrderLine — 따로 그려 붙인 사람용)
 *  · 가족 얼굴 구도의 "허리 위로 가까이, 얼굴 크게"(lib/page-refs familyFramingLines)
 * 이제 인물 설명·책 본문에서 거인·소인을 찾아(아래 detect…), 그 인물과 보통 크기 인물이 함께 보이는 **모든 쪽**에
 * SCALE LOCK 줄을 넣고(scaleLockLines), 위 두 줄은 그 쪽에서 물린다(쪽 그림 라우트).
 *
 * 찾기는 보수적으로 — 거인이 아닌 사람을 거인으로 그리는 것이 놓치는 것보다 나쁘다:
 *  · 설명 글(@@CHARACTER@@ 생김새 칸)에 크기 말이 있다 — 주인공은 빼고(주인공 설명의 '거인 나라에 간'을 거인으로 읽지 않게).
 *  · 본문에서 크기 말이 이름을 **바로 꾸민다**: '거인 아이 포포', '거인 포포', '엄지만 한 요정 루루'.
 *    '거인들이 하온이를 보았어요'는 꾸밈이 아니라 잡지 않는다.
 *  · 본문에서 '이름은 거인이에요'처럼 풀이말로 끝난다.
 * 순수 함수만 둔다(node --test). 브라우저(만들기 화면·책 보기)와 서버(쪽 그림)가 함께 쓴다.
 */

export type ScaleKind = "giant" | "tiny";

/** 크기 말 — 거인 쪽 */
const GIANT_WORD = "거인";
/** 크기 말 — 아주 작은 쪽. '난쟁이'는 넣지 않는다(일곱 난쟁이는 손바닥만 한 사람이 아니다). */
const TINY_WORDS = ["소인", "엄지만 한", "엄지만한", "손가락만 한", "손가락만한", "손톱만 한", "손톱만한", "콩알만 한", "콩알만한", "개미만 한", "개미만한"];
/** 크기 말과 이름 사이에 올 수 있는 낱말(사람을 가리키는 말 하나) */
const ROLE = "(?:아이|아기|소년|소녀|친구|아저씨|아줌마|할아버지|할머니|형|누나|오빠|언니|왕|임금님|왕자|공주|요정|사람|나무꾼|농부)";
/** 풀이말 — '○○는 거인이에요' */
const COPULA = "(?:이에요|이예요|예요|이었어요|였어요|이야|이었다|이다|입니다|이랍니다|이래요|이지요|이죠)";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** 본문 속 이름 꼴 — '하온' 은 '하온이'로도 불린다(받침 있는 이름). */
const nameForm = (name: string) => `${esc(name)}(?:이)?`;

function describedAs(description: string): ScaleKind | null {
  const d = description.normalize("NFC");
  if (d.includes(GIANT_WORD)) return "giant";
  if (TINY_WORDS.some((w) => d.includes(w))) return "tiny";
  return null;
}

function toldAs(name: string, text: string): ScaleKind | null {
  // 한 글자 이름은 본문으로 잡지 않는다 — 다른 낱말의 한 토막과 헷갈린다(설명 글·보낸 표시로만).
  if (name.length < 2) return null;
  const n = nameForm(name);
  const t = text.normalize("NFC");
  // 꾸밈: '거인 아이 포포' · '거인 포포'
  if (new RegExp(`${GIANT_WORD}\\s?(?:${ROLE}\\s?)?${n}`).test(t)) return "giant";
  // 풀이: '포포는 (아주 큰) 거인이에요'
  if (new RegExp(`${n}[은는]\\s?(?:[가-힣]{1,4}\\s){0,2}${GIANT_WORD}${COPULA}`).test(t)) return "giant";
  for (const w of TINY_WORDS) {
    if (new RegExp(`${esc(w)}\\s?(?:${ROLE}\\s?)?${n}`).test(t)) return "tiny";
  }
  if (new RegExp(`${n}[은는]\\s?(?:[가-힣]{1,4}\\s){0,2}소인${COPULA}`).test(t)) return "tiny";
  return null;
}

/**
 * 책 전체에서 크기가 다른 인물 — 이름 → 거인/소인.
 * characters 는 등장인물 순(첫 사람 = 주인공), texts 는 모든 쪽의 본문·장면 글.
 * 주인공은 설명 글로는 잡지 않는다(본문의 꾸밈·풀이말로만).
 */
export function detectBookScale(
  characters: readonly { name: string; description?: string }[],
  texts: readonly string[],
): Map<string, ScaleKind> {
  const out = new Map<string, ScaleKind>();
  const all = texts.join("\n");
  characters.forEach((c, i) => {
    const name = c.name?.trim();
    if (!name) return;
    const kind = (i === 0 ? null : describedAs(c.description ?? "")) ?? toldAs(name, all);
    if (kind) out.set(name, kind);
  });
  return out;
}

/** 요청에 실어 보낼 등장인물 줄에 크기 표시를 더한다(만들기 화면·책 보기의 한 쪽 다시 그리기). 없는 사람은 그대로. */
export function withBookScale<T extends { name: string; description?: string }>(
  cast: readonly T[],
  texts: readonly string[],
): (T & { scale?: ScaleKind })[] {
  const scale = detectBookScale(cast, texts);
  return cast.map((c) => (scale.has(c.name) ? { ...c, scale: scale.get(c.name) } : c));
}

/** 남이 보낸 값 — 'giant'·'tiny' 만 */
export function readScaleKind(value: unknown): ScaleKind | null {
  return value === "giant" || value === "tiny" ? value : null;
}

export type PageScale = {
  /** 이 쪽에 보이는 거인 */
  giants: string[];
  /** 이 쪽에 보이는 아주 작은 사람 */
  tinies: string[];
  /** 이 쪽에 보이는 보통 크기 사람 */
  normals: string[];
};

/**
 * 이 쪽에 보이는 사람들의 크기 — 보낸 표시(scale)가 먼저, 없으면 설명 글·이 쪽 글에서 찾는다.
 * heroName 은 설명 글로 잡지 않을 사람(주인공). 잠글 것이 없으면(모두 보통이거나, 견줄 상대가 없으면) null.
 */
export function pageScale(
  onPage: readonly { name: string; description?: string; scale?: ScaleKind | null }[],
  heroName: string | null,
  texts: readonly string[],
): PageScale | null {
  const all = texts.join("\n");
  const giants: string[] = [];
  const tinies: string[] = [];
  const normals: string[] = [];
  for (const c of onPage) {
    const kind =
      c.scale ?? (c.name === heroName ? null : describedAs(c.description ?? "")) ?? toldAs(c.name, all);
    (kind === "giant" ? giants : kind === "tiny" ? tinies : normals).push(c.name);
  }
  // 견줄 상대가 있어야 잠근다 — 거인끼리만 있는 쪽은 서로 같은 크기다.
  const groups = [giants, tinies, normals].filter((g) => g.length > 0).length;
  return groups >= 2 ? { giants, tinies, normals } : null;
}

const list = (names: readonly string[]) => names.join(" and ");
const be = (names: readonly string[]) => (names.length > 1 ? "are" : "is");

/**
 * SCALE LOCK 줄 — 장면 문장보다 앞에 둔다. 크기 차이는 '손바닥'으로 못박는다(책 전체에서 같은 눈금 —
 * 2~4쪽이 손바닥·숟가락으로 그린 크기와 같다). 한 그림에 둘을 담는 법(작은 쪽은 온몸, 큰 쪽은 일부만)과
 * 시트의 키는 크기가 아니라는 것, 그리고 '인물을 크게·가까이' 줄을 이 쪽에서는 이긴다는 것까지 적는다.
 */
export function scaleLockLines(scale: PageScale | null): string[] {
  if (!scale) return [];
  const lines: string[] = [];
  const small = [...scale.normals, ...scale.tinies];
  if (scale.giants.length && small.length) {
    const g = list(scale.giants);
    const n = list(small);
    lines.push(
      `SCALE LOCK — sizes on this page are decided here and nowhere else. ${g} ${be(scale.giants)} ${scale.giants.length > 1 ? "GIANTS" : "a GIANT"}; ${n} ${be(small)} ordinary human size. The size gap is enormous and the same on every page of this book: ${n} is small enough to stand on ${g}'s open palm — about as tall as ${g}'s hand, and when both stand on the same ground ${n} does not reach past ${g}'s ankle.`,
      `NEVER draw ${g} as merely a bigger or older child beside ${n}, and never at similar heights — not when they stand side by side, hug, wave or pass an object to each other.`,
      `To fit both in one picture: draw ${n} whole and small, and ${g} huge — only part of ${g} may fit in the frame (a hand reaching down, a big face leaning in, knees and shoes), or pull the camera far back. When ${g} gives ${n} something, ${g} holds it between two fingertips or on a flat palm, and ${n} needs both arms for it.`,
      `Everything that belongs to ${g}'s world — furniture, cups, spoons, food, doors, buttons — is giant-sized too: table legs like tree trunks, a cup taller than ${n}.`,
    );
  }
  if (scale.tinies.length && scale.normals.length) {
    const t = list(scale.tinies);
    const n = list(scale.normals);
    lines.push(
      `${lines.length ? "ALSO — " : "SCALE LOCK — sizes on this page are decided here and nowhere else. "}${t} ${be(scale.tinies)} TINY: no taller than ${n}'s hand, small enough to sit on ${n}'s palm or shoulder — the same on every page of this book. Never draw ${t} as merely a smaller child beside ${n}.`,
      `To fit both in one picture: bring the camera close to ${t} and show only part of ${n} (a hand, a face leaning in), or show ${n} whole with ${t} small but clearly visible on a hand, a table edge or a leaf.`,
    );
  }
  if (!lines.length) return [];
  lines.push(
    "The character reference sheet shows each person separately and does NOT show their size relative to one another — ignore the sizes on the sheet. This SCALE LOCK also overrides any instruction elsewhere to draw the characters large, close to the viewer or at a natural height for their age.",
    "Keep every small figure's face clearly drawn (two eyes, a nose, a mouth, the hair from the reference) — small in the frame, never a faceless dot.",
  );
  return lines;
}

/** 검수 줄 — 크기가 무너진 그림을 떨어뜨린다(얼굴 지적이 아니라 크기 지적). 잠금이 없으면 빈 목록. */
export function scaleCheckLines(scale: PageScale | null): string[] {
  if (!scale) return [];
  const lines: string[] = [];
  const small = [...scale.normals, ...scale.tinies];
  if (scale.giants.length && small.length) {
    const g = list(scale.giants);
    const n = list(small);
    lines.push(
      `SIZE RULE — ${g} ${be(scale.giants)} ${scale.giants.length > 1 ? "giants" : "a giant"} and ${n} ${be(small)} ordinary human size. FAIL if they look like two people of similar size, or if ${n} is drawn taller than about ${g}'s knee when both are fully visible. If only part of ${g} is visible (a hand, a face, legs), judge by that part: ${g}'s hand must be about as big as ${n}'s whole body. Do not fail because ${n} is small in the frame or because ${g} is cropped by the picture edge — that is intended.`,
    );
  }
  if (scale.tinies.length && scale.normals.length) {
    const t = list(scale.tinies);
    const n = list(scale.normals);
    lines.push(
      `SIZE RULE — ${t} ${be(scale.tinies)} tiny, no taller than ${n}'s hand. FAIL if ${t} is drawn as merely a smaller child beside ${n}. Do not fail because ${n} is cropped by the picture edge — that is intended.`,
    );
  }
  return lines;
}
