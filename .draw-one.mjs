/**
 * 쪽 하나를 **그림 지시문까지 얹어서** 다시 그린다.
 *
 * 왜 따로 두나 — draw-book-pages.mts 는 본문 글만 보고 그린다. 그래서 "고기 두
 * 덩이의 크기 차이가 주인공"처럼 글에는 없고 검토대 그림칸에만 적힌 지시가
 * 그림에 안 들어간다. 이 스크립트는 그 한 줄을 프롬프트에 같이 넣는다.
 *
 *   node --experimental-strip-types --env-file=.env.local <이 파일> "<책 제목>" <쪽> "<그림 지시문>"
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { pathToFileURL } from "node:url";
const { generateImage } = await import(pathToFileURL(path.resolve("src/lib/gemini.ts")).href);

const [TITLE, PAGE, ART] = process.argv.slice(2);
if (!TITLE || !PAGE || !ART) throw new Error('쓰는 법: <책 제목> <쪽> "<그림 지시문>"');
const n = Number(PAGE);

let book = null;
for (const f of ["src/data/folk-books.json", "src/data/classic-books.json"]) {
  const found = JSON.parse(fs.readFileSync(f, "utf8")).find((b) => b.title === TITLE);
  if (found) { book = found; break; }
}
if (!book) throw new Error(`${TITLE} 를 못 찾았습니다`);

const OUT = path.join("scratch-art", TITLE.replace(/\s+/g, "-"));
const load = (file) => {
  const ext = path.extname(file).slice(1).toLowerCase();
  return { mimeType: ext === "jpg" ? "image/jpeg" : `image/${ext}`, data: fs.readFileSync(file).toString("base64") };
};
const styleFiles = fs.readdirSync(OUT).filter((f) => /^style-.*\.(webp|png|jpe?g)$/i.test(f)).sort().map((f) => path.join(OUT, f));
const sheetPath = path.join(OUT, "sheet.webp");
const references = [...styleFiles.map(load), ...(fs.existsSync(sheetPath) ? [load(sheetPath)] : [])];

const page = book.pages[n - 1];
const roles = book.pageCast?.[String(n)] ?? [];
const who = roles.map((r) => book.cast?.[r] ?? r);

const prompt = [
  `Korean picture book illustration. Art style: ${book.style}.`,
  `Setting: ${book.setting}.`,
  styleFiles.length
    ? `STYLE REFERENCE: the first ${styleFiles.length} attached image(s) are pages from a DIFFERENT book — match their rendering style exactly, but not their characters or scenes.`
    : "",
  fs.existsSync(sheetPath)
    ? "CHARACTER SHEET: the last attached image is this book's character reference sheet. Copy each character's face, hair, body shape and clothes EXACTLY from it."
    : "",
  "",
  "Draw EXACTLY what this page says, and follow the ART DIRECTION below — it decides the framing.",
  "",
  `PAGE ${n} TEXT (Korean):`,
  String(page.text ?? "").trim(),
  "",
  "ART DIRECTION (this wins over any default framing):",
  ART,
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
  "(6) ONE continuous scene filling the whole picture — never split it into panels, comic frames or a before/after.",
].filter(Boolean).join("\n");

console.log(`${n}쪽 다시 그리는 중…`);
const img = await generateImage({ prompt, aspectRatio: "4:3", references: references.length ? references : undefined });
const out = path.join(OUT, `p${n}.webp`);
await sharp(Buffer.from(img.data, "base64")).resize(1184, 864, { fit: "cover", position: "center" }).webp({ quality: 82 }).toFile(out);
console.log(`저장 ${out}  ${(fs.statSync(out).size / 1024).toFixed(0)}KB`);
