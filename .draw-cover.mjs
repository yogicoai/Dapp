/**
 * 표지 한 장을 그린다 — draw-book-pages.mts 에는 표지 모드가 없어서 따로 둔다.
 *   node --experimental-strip-types --env-file=.env.local <이 파일> "<책 제목>" "<표지 장면 한 줄>"
 * 그림체·무대·인물 설명은 책 파일(style/setting/cast)에서 그대로 가져와
 * 쪽 그림과 표지가 따로 놀지 않게 한다.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { pathToFileURL } from "node:url";
const { generateImage } = await import(pathToFileURL(path.resolve("src/lib/gemini.ts")).href);

const [TITLE, SCENE] = process.argv.slice(2);
if (!TITLE || !SCENE) throw new Error('쓰는 법: <책 제목> "<표지 장면>"');

const files = ["src/data/folk-books.json", "src/data/classic-books.json"];
let book = null;
for (const f of files) {
  const found = JSON.parse(fs.readFileSync(f, "utf8")).find((b) => b.title === TITLE);
  if (found) { book = found; break; }
}
if (!book) throw new Error(`${TITLE} 를 못 찾았습니다`);

const OUT = path.join("scratch-art", TITLE.replace(/\s+/g, "-"));
const load = (file) => ({
  mimeType: path.extname(file).slice(1).toLowerCase() === "jpg" ? "image/jpeg" : `image/${path.extname(file).slice(1).toLowerCase()}`,
  data: fs.readFileSync(file).toString("base64"),
});
const styleFiles = fs.readdirSync(OUT).filter((f) => /^style-.*\.(webp|png|jpe?g)$/i.test(f)).sort().map((f) => path.join(OUT, f));
const sheetPath = path.join(OUT, "sheet.webp");
const references = [...styleFiles.map(load), ...(fs.existsSync(sheetPath) ? [load(sheetPath)] : [])];

const prompt = [
  `Korean picture book COVER illustration. Art style: ${book.style}.`,
  `Setting: ${book.setting}.`,
  styleFiles.length
    ? `STYLE REFERENCE: the first ${styleFiles.length} attached image(s) are pages from a DIFFERENT book — match their rendering style exactly, but not their characters or scenes.`
    : "",
  fs.existsSync(sheetPath)
    ? "CHARACTER SHEET: the last attached image is this book's character reference sheet. Copy each character's face, hair, body shape and clothes EXACTLY from it."
    : "",
  "",
  "COVER SCENE:",
  SCENE,
  "",
  "This is the front cover, so make it warm and inviting, with the main characters large and clearly readable at a glance.",
  "",
  "ABSOLUTE RULES:",
  "(1) NO TEXT anywhere — no letters, no Korean or Chinese characters, no numbers, no title, no signature, no watermark.",
  "(2) Never draw the same character twice. No duplicate figures.",
  "(3) The painting must bleed to all four edges — no white margin, no border, no frame.",
  "(4) The lower quarter must be fully painted, never left blank.",
  "(5) Wholesome, innocent, fully clothed, child-friendly.",
  "(6) ONE continuous scene filling the whole picture — never split into panels.",
].filter(Boolean).join("\n");

console.log("표지를 그립니다…");
const img = await generateImage({ prompt, aspectRatio: "4:3", references: references.length ? references : undefined });
const out = path.join(OUT, "cover.webp");
await sharp(Buffer.from(img.data, "base64")).resize(1184, 864, { fit: "cover", position: "center" }).webp({ quality: 82 }).toFile(out);
console.log(`저장 ${out}  ${(fs.statSync(out).size / 1024).toFixed(0)}KB`);
