/**
 * 제공 동화(전래동화·세계명작)의 쪽 그림을 **구글(Gemini)로** 그린다.
 *
 * 왜 이 스크립트가 있나 — 앱이 부모의 동화를 그릴 때는 처음부터 Gemini를 쓰는데,
 * 정작 우리가 넣어 주는 책의 그림은 그때그때 손으로 만들었다. 그러다 보니 도구가
 * 제각각이 되고(힉스필드 등), 그림체와 인물이 책마다 흔들렸다. 이제 제공 동화도
 * 앱과 같은 길로 그린다 — 같은 키, 같은 모델, 같은 규칙.
 *
 * 쓰는 법:
 *   node --experimental-strip-types --env-file=.env.local scripts/draw-book-pages.mts \
 *        --book "금도끼 은도끼" --pages 4,9 --dry
 *   (--dry 를 빼면 실제로 그린다)
 *
 * 먼저 캐릭터 시트를 만들려면:
 *   ... --book "금도끼 은도끼" --sheet
 *
 * 그림체를 다른 책에 맞추려면 scratch-art/<책>/style-*.webp 에 기준 그림을 넣어 둔다.
 * 있으면 시트와 쪽 그림 모두에 "이 결로 그려라"는 참고로 붙는다.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { generateImage, type GeneratedImage } from "../src/lib/gemini.ts";
import { pageVehicle, safetyRuleLines } from "../src/lib/illustration-rules.ts";

type Page = { text?: string; image?: string; hotspots?: { label: string; line: string }[] };

/** 탈것 이야기가 있는 쪽의 안전 줄 — 없으면 아무것도 붙이지 않는다. */
function vehicleSafetyLines(text: string): string[] {
  const vehicle = pageVehicle({ storyText: text });
  return vehicle.vehicle || vehicle.gotOff || vehicle.vehicleNearby ? safetyRuleLines(vehicle, null) : [];
}
type Book = {
  title: string;
  pages: Page[];
  artStyleId?: string;
  roleOf?: Record<string, string>;
  /*
   * 아래 넷은 책 파일이 직접 들고 올 수 있다.
   * 없으면 이 스크립트 안의 표(STYLE·SETTING·CAST·PAGE_CAST)를 쓴다.
   * 표에만 둘 수 있으면 책 하나 그려 보려고 코드를 고쳐야 한다 — 앱에서 만든
   * 동화처럼 임시로 그려 보는 책은 파일에 적어 두는 편이 낫다.
   */
  style?: string;
  setting?: string;
  cast?: Record<string, string>;
  pageCast?: Record<string, string[]>;
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const DRY = process.argv.includes("--dry");
const SHEET_ONLY = process.argv.includes("--sheet");
// ?? "" 로 받아야 함수 안에서도 string 으로 좁혀진다(throw 로 좁힌 건 클로저 안까지 안 간다).
const TITLE = arg("book") ?? "";
if (!TITLE) throw new Error('--book "책 제목" 이 필요합니다');

/** 책이 어느 파일에 있는지 찾는다. */
/**
 * 책을 찾는다. `--file <경로>` 를 주면 그 파일에서만 찾는다.
 *
 * 왜 필요한가 — 부모가 앱에서 만든 동화는 Supabase 에 있어 이 저장소에 없다.
 * 그런 책의 그림을 다시 그려 보려면(예: 그림 만드는 곳을 바꾼 뒤 어떻게 달라지는지)
 * 원고를 같은 모양의 파일 하나로 적어 두고 그것을 가리키면 된다.
 */
function findBook(): { book: Book; file: string } {
  const only = arg("file");
  const files = only ? [only] : ["src/data/folk-books.json", "src/data/classic-books.json"];
  for (const file of files) {
    const list = JSON.parse(fs.readFileSync(file, "utf8")) as Book[];
    const book = list.find((b) => b.title === TITLE);
    if (book) return { book, file };
  }
  throw new Error(`${TITLE} 를 못 찾았습니다`);
}

const { book } = findBook();
const OUT = path.join("scratch-art", slug(TITLE));
fs.mkdirSync(OUT, { recursive: true });

function slug(s: string): string {
  return s.replace(/\s+/g, "-");
}

/**
 * 그 책이 쓰는 그림 규격을 지금 그림에서 읽어 온다.
 * 쪽마다 크기가 다르면 넘길 때 틀이 흔들려서, 새로 그리는 것도 같은 크기로 맞춘다.
 */
async function bookSize(): Promise<{ width: number; height: number }> {
  const url = book.pages.find((p) => p.image)?.image;
  if (!url) return { width: 1184, height: 864 };
  const buf = url.startsWith("http")
    ? Buffer.from(await (await fetch(url)).arrayBuffer())
    : fs.readFileSync("public" + url.split("?")[0]);
  const m = await sharp(buf).metadata();
  return { width: m.width ?? 1184, height: m.height ?? 864 };
}

/** 이 책의 그림체 한 줄. 앞 그림들과 이어지게 책마다 정해 둔다. */
const STYLE: Record<string, string> = {
  "금도끼 은도끼":
    "soft Studio Ghibli-like watercolor, warm golden light, misty layered Korean mountains, hand-painted texture, muted earthy palette",
  "토끼와 거북이":
    "soft coloured-pencil children's picture book, gentle pastel greens, round friendly animal faces, light paper texture",
  "콩쥐 팥쥐":
    "Korean hanji paper-collage picture book, torn-paper edges, flat muted traditional colours, simple rounded faces",
  // 빨간 모자와 같은 결 — 사장님이 기준 그림체로 정한 책이다.
  "흥부와 놀부":
    "classic European storybook illustration: fine brown ink outlines with light cross-hatching, soft transparent watercolor washes, visible paper texture, warm muted earthy palette (ochre, moss green, terracotta, cream), gentle natural daylight. Flat hand-drawn 2D — NOT 3D render, NOT glossy, NOT plastic, NOT Pixar",
};

/** 배경 세계. 그림체 기준을 다른 나라 책에서 가져올 때 무대까지 따라오지 않게 못 박는다. */
const SETTING: Record<string, string> = {
  "흥부와 놀부":
    "Joseon-era Korean countryside village: hanok houses (Nolbu's is a grand tiled-roof house with a stone wall and big wooden gate; Heungbu's is a tiny crumbling thatched hut), paper-screen doors, persimmon trees, rice paddies and soft mountains. Everyone wears hanbok. Nothing European — no Western cottages, no Western clothes",
};

/**
 * 등장인물 생김새. 시트와 쪽 프롬프트가 **같은 문장**을 쓰게 해서 얼굴·옷이 흔들리지 않게 한다.
 * 열쇠는 책 JSON의 role 아이디(hotspots.label / roleOf 값)와 같다.
 */
const CAST: Record<string, Record<string, string>> = {
  "흥부와 놀부": {
    heungbu:
      "HEUNGBU — the kind younger brother, thin and gentle, warm tired smile, small topknot with a cloth headband, patched worn beige hemp hanbok, straw sandals",
    nolbu:
      "NOLBU — the greedy older brother, stout with a big belly, thick scowling eyebrows and a thin moustache, black horsehair gat hat, fine navy silk durumagi coat",
    heungbuwife:
      "HEUNGBU'S WIFE — slender and gentle, hair in a low bun with a wooden hairpin, faded pale-green jeogori and grey chima, plain apron",
    nolbuwife:
      "NOLBU'S WIFE — plump and haughty with a sharp chin, elaborate braided updo, glossy pink silk hanbok, usually holding a wooden rice paddle",
    kids:
      "HEUNGBU'S FOUR CHILDREN — a group of four different small kids (two boys, two girls), cheerful round faces, ragged little hanbok, bare feet",
    swallow:
      "THE SWALLOW — a small barn swallow, glossy blue-black back, white belly, rust-red throat, long forked tail",
    dokkaebi:
      "DOKKAEBI — Korean goblins, blue-grey skin, one short horn, wild hair, tiger-skin loincloth, knobbly wooden club, mischievous grin",
  },
};

/**
 * 쪽마다 누가 나오는지. hotspots(말풍선 있는 인물)만으로는 부족하다 — 1쪽엔 말풍선이
 * 없어도 두 형제가 서 있고, 22쪽의 "아내"는 흥부 아내가 아니라 놀부 부인이다.
 * 본문을 읽고 손으로 적어 둔 명단이 제일 정확하다.
 */
const PAGE_CAST: Record<string, Record<number, string[]>> = {
  "흥부와 놀부": {
    1: ["heungbu", "nolbu"],
    2: ["nolbu", "heungbu", "heungbuwife", "kids"],
    3: ["heungbu", "heungbuwife", "kids"],
    4: ["heungbu", "kids", "heungbuwife"],
    5: ["heungbuwife", "heungbu"],
    6: ["nolbuwife", "heungbu"],
    7: ["nolbuwife", "heungbu"],
    8: ["swallow", "heungbu", "heungbuwife", "kids"],
    9: ["swallow", "kids"],
    10: ["swallow"],
    11: ["swallow", "heungbu"],
    12: ["heungbu", "swallow"],
    13: ["kids", "swallow"],
    14: ["swallow", "heungbu"],
    15: ["heungbu", "kids"],
    16: ["heungbu", "heungbuwife", "kids"],
    17: ["heungbu", "heungbuwife", "kids"],
    18: ["nolbu"],
    19: ["nolbu", "swallow"],
    20: ["nolbu", "swallow"],
    21: ["nolbu", "nolbuwife", "dokkaebi"],
    22: ["dokkaebi", "nolbu", "nolbuwife"],
    23: ["nolbu", "swallow"],
    24: ["heungbu", "nolbu"],
  },
};

const cast = book.cast ?? CAST[TITLE];

/** 이 쪽에 나오는 인물 설명 줄들. 명단이 있으면 그걸, 없으면 hotspots 라벨을 쓴다. */
function castLines(page: Page, n: number): string[] {
  const roles = book.pageCast?.[String(n)] ?? PAGE_CAST[TITLE]?.[n] ?? (page.hotspots ?? []).map((h) => h.label);
  return roles.map((r) => cast?.[r] ?? r);
}

/** 파일 하나를 참고 그림으로 읽는다. */
function loadImage(file: string): GeneratedImage {
  const ext = path.extname(file).slice(1).toLowerCase();
  const mimeType = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
  return { mimeType, data: fs.readFileSync(file).toString("base64") };
}

// 그림체 기준 그림 — scratch-art/<책>/style-*.webp. 있으면 시트에도 쪽에도 맨 앞에 붙는다.
const styleFiles = fs
  .readdirSync(OUT)
  .filter((f) => /^style-.*\.(webp|png|jpe?g)$/i.test(f))
  .sort()
  .map((f) => path.join(OUT, f));
const styleRefs = styleFiles.map(loadImage);

function styleLines(): string[] {
  if (styleRefs.length === 0) return [];
  return [
    `STYLE REFERENCE: the first ${styleRefs.length} attached image(s) are pages from a DIFFERENT book. Match their rendering style exactly — same ink line quality, same watercolor washes, same paper texture, same palette and level of detail.`,
    "Do NOT copy their characters, clothes, buildings or scenes — only the way they are drawn.",
  ];
}

/**
 * 쪽 그림 프롬프트를 **본문 문장 그대로**에서 만든다.
 *
 * 지난번 금도끼 그림이 글과 어긋난 진짜 원인이 여기였다 — 내가 장면을 요약해서
 * 프롬프트를 썼더니, 본문은 "도끼가 가라앉았다"인데 그림엔 도끼가 물 위에 떠 있었다.
 * 요약하지 말고 본문을 그대로 넘겨 모델이 직접 읽게 한다.
 */
function pagePrompt(page: Page, n: number, style: string, hasSheet: boolean): string {
  const who = castLines(page, n);
  const setting = book.setting ?? SETTING[TITLE];
  return [
    `Korean picture book illustration. Art style: ${style}.`,
    setting ? `Setting: ${setting}.` : "",
    "",
    ...styleLines(),
    hasSheet
      ? "CHARACTER SHEET: the last attached image is this book's character reference sheet. Copy each character's face, hair, body shape and clothes EXACTLY from it."
      : "",
    "",
    "Draw EXACTLY what this page says. Read it sentence by sentence and put every stated fact in the picture — if the text says something sank, it is under the water; if someone is crying, they are crying.",
    "",
    `PAGE ${n} TEXT (Korean):`,
    String(page.text ?? "").trim(),
    "",
    who.length ? "CHARACTERS ON THIS PAGE (only these people — nobody else):" : "",
    ...who.map((w) => `- ${w}`),
    "",
    "ABSOLUTE RULES:",
    "(1) NO TEXT anywhere — no letters, no Korean or Chinese characters, no numbers, no speech bubbles, no signature, no watermark.",
    "(2) Never draw the same character twice. No duplicate figures, no extra background people.",
    "(3) The painting must bleed to all four edges — no white margin, no border, no frame.",
    "(4) The lower quarter must be fully painted, never left blank.",
    "(5) Wholesome, innocent, fully clothed, child-friendly.",
    // 7쪽 시험에서 본문의 두 순간을 좌우 두 칸으로 갈라 그렸다 — 앱은 한 장면만 보여 준다.
    "(6) ONE continuous scene filling the whole picture — never split it into panels, comic frames or a before/after. If the text describes several moments, draw ONLY the single most important moment.",
    /*
     * 탈것 안전 규칙은 앱과 **같은 함수**로 붙인다(illustration-rules.ts).
     * 예전엔 여기에 따로 적은 차 안 판정이 '버스 안·차창'도 승용차로 읽었다 — 버스 장면에 벨트가 붙는다.
     * 한 곳에 두어 앱을 고치면 여기도 함께 고쳐지게 한다. 전래동화 대본엔 장소 줄이 없어 본문만 본다.
     * 단 탈것 이야기가 있는 쪽에만 붙인다 — 예전 이 스크립트는 차 장면에만 차 줄을 붙였고, 금도끼·흥부 같은
     * 옛이야기 쪽에 'seat belt' 낱말이 새로 들어가면 없던 벨트를 부를 수 있다. 프롬프트만 길어지기도 한다.
     */
    ...vehicleSafetyLines(String(page.text ?? "")),
  ]
    .filter((l) => l !== "")
    .join("\n");
}

const style = book.style ?? STYLE[TITLE] ?? "soft watercolor children's picture book, gentle warm palette";
const size = await bookSize();
const sheetPath = path.join(OUT, "sheet.webp");

if (styleRefs.length) console.log(`그림체 기준 ${styleRefs.length}장: ${styleFiles.join(", ")}`);

if (SHEET_ONLY) {
  const entries = cast
    ? Object.values(cast)
    : [...new Set(book.pages.flatMap((p) => (p.hotspots ?? []).map((h) => h.label)))];
  const setting = book.setting ?? SETTING[TITLE];
  const prompt = [
    `Character reference sheet for a Korean picture book. Art style: ${style}.`,
    setting ? `Setting: ${setting}.` : "",
    ...styleLines(),
    `Draw these ${entries.length} entries, each EXACTLY ONCE, full body, front view, standing, evenly spaced on a plain cream background, in this order (two rows if needed):`,
    ...entries.map((e, i) => `${i + 1}. ${e}`),
    "Make them unmistakably different from each other.",
    "Draw every face LARGE and clearly readable — this sheet is the identity reference for every page.",
    "NO text, no letters, no labels, no numbers in the image.",
  ]
    .filter((l) => l !== "")
    .join("\n");
  console.log(DRY ? "[리허설] 캐릭터 시트\n" + prompt : "캐릭터 시트를 그립니다…");
  if (!DRY) {
    const img = await generateImage({
      prompt,
      aspectRatio: "4:3",
      references: styleRefs.length ? styleRefs : undefined,
    });
    await sharp(Buffer.from(img.data, "base64")).webp({ quality: 82 }).toFile(sheetPath);
    console.log("저장:", sheetPath);
  }
  process.exit(0);
}

const pages = (arg("pages") ?? "")
  .split(",")
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => n >= 1 && n <= book.pages.length);
if (pages.length === 0) throw new Error("--pages 4,9 처럼 쪽 번호가 필요합니다");

// 캐릭터 시트가 있으면 참조로 넣는다 — 인물 일관성의 축이다.
const sheet = fs.existsSync(sheetPath) ? loadImage(sheetPath) : null;
if (!sheet) console.log("(캐릭터 시트 없음 — --sheet 로 먼저 만들면 인물이 훨씬 잘 이어집니다)");

// 참고 그림 순서: 그림체 기준들 → 캐릭터 시트. 프롬프트의 "first N" / "last" 가 이 순서를 가리킨다.
const references = [...styleRefs, ...(sheet ? [sheet] : [])];

const ratio = size.width >= size.height ? "4:3" : "3:4";
for (const n of pages) {
  const page = book.pages[n - 1];
  const prompt = pagePrompt(page, n, style, !!sheet);
  if (DRY) {
    console.log(`\n===== ${n}쪽 (${ratio}, ${size.width}x${size.height}) =====\n${prompt}`);
    continue;
  }
  console.log(`${n}쪽 그리는 중…`);
  const img = await generateImage({
    prompt,
    aspectRatio: ratio as "4:3" | "3:4",
    references: references.length ? references : undefined,
  });
  const out = path.join(OUT, `p${n}.webp`);
  await sharp(Buffer.from(img.data, "base64"))
    .resize(size.width, size.height, { fit: "cover", position: "center" })
    .webp({ quality: 82 })
    .toFile(out);
  console.log(`  저장 ${out}  ${(fs.statSync(out).size / 1024).toFixed(0)}KB`);
}
console.log(DRY ? "\n[리허설] 실제로 그리지 않았습니다." : "\n다 그렸습니다. 확인 후 cafe24에 올리세요.");
