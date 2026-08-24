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
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { generateImage, toDataUrl, fromDataUrl } from "../src/lib/gemini.ts";

type Page = { text?: string; image?: string; hotspots?: { label: string; line: string }[] };
type Book = { title: string; pages: Page[]; artStyleId?: string };

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const DRY = process.argv.includes("--dry");
const SHEET_ONLY = process.argv.includes("--sheet");
const TITLE = arg("book");
if (!TITLE) throw new Error('--book "책 제목" 이 필요합니다');

/** 책이 어느 파일에 있는지 찾는다. */
function findBook(): { book: Book; file: string } {
  for (const file of ["src/data/folk-books.json", "src/data/classic-books.json"]) {
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
};

/**
 * 쪽 그림 프롬프트를 **본문 문장 그대로**에서 만든다.
 *
 * 지난번 금도끼 그림이 글과 어긋난 진짜 원인이 여기였다 — 내가 장면을 요약해서
 * 프롬프트를 썼더니, 본문은 "도끼가 가라앉았다"인데 그림엔 도끼가 물 위에 떠 있었다.
 * 요약하지 말고 본문을 그대로 넘겨 모델이 직접 읽게 한다.
 */
function pagePrompt(page: Page, n: number, style: string): string {
  const cast = (page.hotspots ?? []).map((h) => h.label).join(", ");
  return [
    `Korean picture book illustration. Art style: ${style}.`,
    "",
    "Draw EXACTLY what this page says. Read it sentence by sentence and put every stated fact in the picture — if the text says something sank, it is under the water; if someone is crying, they are crying.",
    "",
    `PAGE ${n} TEXT (Korean):`,
    String(page.text ?? "").trim(),
    "",
    cast ? `Characters on this page: ${cast}. Copy their faces and clothes EXACTLY from the attached reference sheet.` : "",
    "",
    "ABSOLUTE RULES:",
    "(1) NO TEXT anywhere — no letters, no Korean or Chinese characters, no numbers, no speech bubbles, no signature, no watermark.",
    "(2) Never draw the same character twice. No duplicate figures, no extra background people.",
    "(3) The painting must bleed to all four edges — no white margin, no border, no frame.",
    "(4) The lower quarter must be fully painted, never left blank.",
    "(5) Wholesome, innocent, fully clothed, child-friendly.",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

const style = STYLE[TITLE] ?? "soft watercolor children's picture book, gentle warm palette";
const size = await bookSize();
const sheetPath = path.join(OUT, "sheet.webp");

if (SHEET_ONLY) {
  const names = [...new Set(book.pages.flatMap((p) => (p.hotspots ?? []).map((h) => h.label)))];
  const prompt = [
    `Character reference sheet for a Korean picture book. Art style: ${style}.`,
    `Draw EXACTLY ${names.length} characters, full body, front view, standing, evenly spaced left to right on a plain cream background: ${names.join(", ")}.`,
    "Each character appears EXACTLY ONCE. Make them unmistakably different from each other.",
    "Draw every face LARGE and clearly readable — this sheet is the identity reference for every page.",
    "NO text, no letters, no labels in the image.",
  ].join("\n");
  console.log(DRY ? "[리허설] 캐릭터 시트\n" + prompt : "캐릭터 시트를 그립니다…");
  if (!DRY) {
    const img = await generateImage({ prompt, aspectRatio: "4:3" });
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
const sheet = fs.existsSync(sheetPath)
  ? fromDataUrl(toDataUrl({ mimeType: "image/webp", data: fs.readFileSync(sheetPath).toString("base64") }))
  : null;
if (!sheet) console.log("(캐릭터 시트 없음 — --sheet 로 먼저 만들면 인물이 훨씬 잘 이어집니다)");

const ratio = size.width >= size.height ? "4:3" : "3:4";
for (const n of pages) {
  const page = book.pages[n - 1];
  const prompt = pagePrompt(page, n, style);
  if (DRY) {
    console.log(`\n===== ${n}쪽 (${ratio}, ${size.width}x${size.height}) =====\n${prompt}`);
    continue;
  }
  console.log(`${n}쪽 그리는 중…`);
  const img = await generateImage({
    prompt,
    aspectRatio: ratio as "4:3" | "3:4",
    references: sheet ? [sheet] : undefined,
  });
  const out = path.join(OUT, `p${n}.webp`);
  await sharp(Buffer.from(img.data, "base64"))
    .resize(size.width, size.height, { fit: "cover", position: "center" })
    .webp({ quality: 82 })
    .toFile(out);
  console.log(`  저장 ${out}  ${(fs.statSync(out).size / 1024).toFixed(0)}KB`);
}
console.log(DRY ? "\n[리허설] 실제로 그리지 않았습니다." : "\n다 그렸습니다. 확인 후 cafe24에 올리세요.");
