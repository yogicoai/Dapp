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

/*
 * ── 작아진 주인공(쪽마다) ──
 *
 * 2026-10-13 사장님 "장소의 변화가 전혀 없어 … 하온이와 작은 개미들로 해서 연출을 체크해 줘" — 하온이가 꿈에서 개미만큼 작아지는 책에서
 * 작아진 쪽(3~5쪽)이 1쪽과 똑같은 마당 그림(나무·울타리) 위에 보통 크기 하온이로 그려졌다. 까닭은 둘이었다:
 *  · 위의 크기 잠금은 '사람끼리' 견줄 때만 걸린다 — 작아진 주인공 혼자(또는 개미와) 있는 쪽은 잠글 상대가 없었다.
 *  · 장소 기준 그림을 "이 쪽의 유일한 정답"으로 따르게 한 줄이, 같은 마당을 사람 눈높이 그대로 다시 그리게 했다.
 * 그래서 주인공이 작아진 쪽을 따로 알아내(책 흐름으로 — 작아진 쪽부터 깨어나거나 돌아온 쪽 앞까지), 그 쪽에서는
 * 장소 기준 그림을 붙이지 않고 '개미 눈높이' 연출 줄(tinyHeroLines)을 넣는다(쪽 그림 라우트).
 *
 * 찾기는 여기서도 보수적으로 — 작아지지 않은 아이를 개미만 하게 그리는 것이 놓치는 것보다 나쁘다.
 * '하온이는 목소리가 작아졌어요'(소리)·'작아진 옷'은 잡지 않는다: 크기를 견주는 말(개미만큼)이 있거나, 이름 바로 뒤에 작아졌다고 할 때만.
 */

/** 크기를 견주는 작은 것 — '개미만큼 작아진' */
const SIZE_NOUN = "(?:개미|벌레|무당벌레|엄지|손가락|손톱|콩알|쌀알|모래알|도토리)";

function lastIndexOf(patterns: readonly string[], text: string): number {
  let last = -1;
  for (const p of patterns) {
    for (const m of text.matchAll(new RegExp(p, "g"))) last = Math.max(last, m.index ?? -1);
  }
  return last;
}

/** 이 글에서 주인공이 작아졌다고 하는 마지막 자리(없으면 -1) */
function shrinkIndex(name: string, text: string): number {
  if (name.length < 2) return -1;
  const n = nameForm(name);
  return lastIndexOf(
    [
      // '개미만큼 작아진' · '개미만 하게 작아졌어요' · '개미처럼 작아져' · '콩알만큼 줄어들었어요'
      `${SIZE_NOUN}(?:만(?:큼이나|큼|\\s?한|\\s?하게)?|처럼|\\s?같이)[^.!?\\n]{0,14}(?:작아(?:진|졌|져|지)|줄어(?:든|들))`,
      // '개미만 해졌어요'
      `${SIZE_NOUN}만\\s?해(?:졌|진|져|지)`,
      // '개미만 한 하온이' · '작아진 하온이' · '줄어든 하온이'
      `(?:${TINY_WORDS.map(esc).join("|")}|작아진|조그매진|줄어든)\\s?${n}`,
      // '하온이가 (점점) 작아졌어요' · '하온이는 조그매졌어요'
      `${n}(?:가|는|도)\\s?(?:점점\\s?|스르르\\s?|쑥쑥\\s?|갑자기\\s?|순식간에\\s?|아주\\s?)?(?:작아|조그매)(?:졌|져|지)`,
      // '하온이의 몸이 … 줄어들었어요' · '하온이 몸이 점점 작아졌어요' · '하온이는 몸이 작아져 있었어요'
      `${n}(?:의|는|가|도)?\\s?(?:몸|키)(?:이|가|은|는)?\\s?[^.!?\\n]{0,10}(?:작아|줄어)`,
    ],
    text,
  );
}

/** 이 글에서 원래 크기로 돌아왔다고(깨어났다고) 하는 마지막 자리(없으면 -1) */
function unshrinkIndex(text: string): number {
  return lastIndexOf(
    [
      "꿈이었",
      "(?:잠|낮잠|꿈)에서\\s?(?:깨|깼)",
      "(?:원래|본래)\\s?(?:크기|모습|키)",
      "원래대로",
      "다시\\s?커(?:졌|져|지)",
      // '몸이 쑥쑥 커졌어요'
      "(?:몸|키)(?:이|가)?\\s?(?:다시\\s?|쑥쑥\\s?|점점\\s?)?커(?:졌|져|지)",
      "눈이\\s?떠졌",
    ],
    text,
  );
}

/**
 * 이 쪽 글만으로 — 주인공이 작아진 채인가. 작아졌다는 말이 있고, 그 뒤에 돌아왔다는 말이 없을 때.
 * 책 전체를 모르는 곳(옛 요청)에서 쓰는 물러섬이다. 책 전체를 알면 shrunkPages 를 쓴다.
 */
export function heroShrunkOnPage(heroName: string | null | undefined, texts: readonly string[]): boolean {
  const name = heroName?.trim();
  if (!name) return false;
  const t = texts.join("\n").normalize("NFC");
  const on = shrinkIndex(name, t);
  return on >= 0 && on > unshrinkIndex(t);
}

/**
 * 책 전체에서 — 쪽마다 주인공이 작아진 채인가. pages 는 쪽 순서대로 그 쪽의 글(본문 + 장면 글).
 * 작아졌다고 한 쪽부터 켜지고, 돌아왔다고(꿈이었어요·원래 크기) 한 쪽에서 꺼진다. 한 쪽에 둘 다 있으면 뒤에 나온 말을 따른다.
 * 단서가 없는 쪽은 앞 쪽 상태를 잇는다 — 작아진 뒤 '물이 폭포처럼 쏟아졌어요'만 있는 쪽도 작은 채다.
 */
export function shrunkPages(heroName: string | null | undefined, pages: readonly string[]): boolean[] {
  const name = heroName?.trim();
  if (!name) return pages.map(() => false);
  let tiny = false;
  return pages.map((page) => {
    const t = page.normalize("NFC");
    const on = shrinkIndex(name, t);
    const off = unshrinkIndex(t);
    if (on >= 0 && on > off) tiny = true;
    else if (off >= 0) tiny = false;
    return tiny;
  });
}

/**
 * 작아진 주인공 쪽의 연출 줄 — 장소 잠금 자리에 넣는다(장소 기준 그림은 이 쪽에 붙이지 않는다).
 * place 는 이 쪽의 장소(이름·고정된 모습) — 같은 곳이지만 바닥에서 올려다본 모습으로 바꿔 말한다.
 * indoor 면 하늘 대신 방바닥·가구 밑이 세상이다.
 */
export function tinyHeroLines(
  hero: string,
  place: { name: string; description: string } | null,
  indoor: boolean | null,
): string[] {
  return [
    `TINY HERO — on this page ${hero} has shrunk to the size of an ant. This is what the page is about; draw the whole picture from that size.`,
    `CAMERA: down on the ground at ant height, a macro close-up. ${
      indoor
        ? `The floor is a wide plain; furniture legs rise like towers, a crumb is a boulder, a sock or a toy is a hill.`
        : `Blades of grass tower over ${hero} like trees, a pebble is a boulder taller than ${hero}, a fallen leaf is as big as a raft, a drop of water is as big as ${hero}'s head.`
    }`,
    place
      ? `PLACE: the story is still in "${place.name}" (${place.description}), but seen from the ground inside it. Keep its colours and its kind of ground and plants. Its big things (trees, fences, buildings, furniture) are so huge that only a small part of one may show far behind — a root like a wall, the bottom of a post. NEVER show the whole place at ordinary scale on this page, and do not repeat the wide view of the other pages.`
      : "",
    `SMALL CREATURES: ants and other tiny creatures are ${hero}'s own size — an ant is about as long as ${hero} is tall. Draw them clearly, as friendly picture-book creatures, the same size on every tiny page.`,
    `ORDINARY-WORLD THINGS (a shoe, a hand, a watering can, a ball, a person) are colossal next to ${hero}: only a part fits in the frame — the sole of a shoe filling the sky, a spout pouring a waterfall. ${hero} could stand on a fingertip.`,
    `NEVER draw ${hero} at ordinary child size beside a normal-looking tree, fence, bench, door or building on this page. Keep ${hero}'s face clearly drawn (two eyes, a nose, a mouth, the hair from the reference) even though the world around is huge.`,
  ].filter(Boolean);
}

/** 검수 줄 — 작아진 쪽인데 보통 크기로 그린 그림을 떨어뜨린다 */
export function tinyHeroCheckLines(hero: string): string[] {
  return [
    `SIZE RULE — on this page ${hero} is the size of an ant, shown from ground level. FAIL if ${hero} looks like an ordinary-size child in an ordinary-scale place (a whole tree, fence, bench or building visible at normal proportions beside ${hero}), or if ${hero} is taller than the grass or the ants around. Do not fail because the place's landmark is missing or only partly visible, or because ordinary-world things are cropped by the picture edge — that is intended.`,
  ];
}
