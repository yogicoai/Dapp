/** Import the supplied 18-page 우렁각시 manuscript and artwork, without generating new art.
 * node --env-file=.env.local scripts/import-ureong.mts --source <pasted-text.txt> --images <folder>
 * Existing books are never overwritten. Audio is baked separately with bake-cast-narration.mts.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { uploadToCafe24 } from "../src/lib/cafe24.ts";
import { planPageVoices, unmatchedLines, unassignedDialogue } from "../src/lib/story-cast.ts";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || !process.argv[i + 1]) throw new Error(`--${name} is required`);
  return process.argv[i + 1];
};
const source = fs.readFileSync(arg("source"), "utf8").replace(/\r\n/g, "\n");
const imageDir = arg("images");
const dataFile = "src/data/folk-books.json";
const books = JSON.parse(fs.readFileSync(dataFile, "utf8"));
if (books.some((b: { id: string }) => b.id === "folk-ureong")) throw new Error("folk-ureong already exists");

// Every quoted line is assigned explicitly, including the first line omitted from the pasted dialogue list.
const roles: Record<number, string[]> = {
  1: ["farmer"], 2: ["wife"], 3: ["farmer", "farmer", "wife"],
  4: ["farmer"], 5: ["farmer"], 9: ["farmer", "wife"], 11: ["dragonking"],
  12: ["villagers", "magistrate"], 13: ["wife", "wife"],
  14: ["magistrate"], 16: ["magistrate", "magistrate"], 17: ["magistrate"],
};
const roleOf = { "농부": "farmer", "우렁각시": "wife", "각시": "wife", "사또": "magistrate", "용왕": "dragonking", "마을 사람들": "villagers" };
const cast = Object.keys(roleOf).map((name) => ({ name }));
// Bounds inspected against the supplied illustrations: [top, left, bottom, right], 0–1000.
// Page 2's voice is off-screen; page 13's visible scene is the nighttime gift of the gourd.
const spots: Record<number, { who: string; quotes: number[]; box: [number, number, number, number] }[]> = {
  1: [{ who: "farmer", quotes: [0], box: [80, 265, 920, 510] }],
  3: [{ who: "farmer", quotes: [0, 1], box: [30, 260, 750, 550] }, { who: "wife", quotes: [2], box: [720, 735, 850, 845] }],
  4: [{ who: "farmer", quotes: [0], box: [60, 180, 935, 625] }],
  5: [{ who: "farmer", quotes: [0], box: [20, 70, 725, 605] }],
  9: [{ who: "farmer", quotes: [0], box: [65, 135, 935, 440] }, { who: "wife", quotes: [1], box: [165, 550, 960, 835] }],
  11: [{ who: "dragonking", quotes: [0], box: [180, 435, 855, 715] }],
  12: [{ who: "magistrate", quotes: [1], box: [150, 485, 985, 865] }],
  13: [{ who: "wife", quotes: [1], box: [155, 20, 970, 500] }],
  14: [{ who: "magistrate", quotes: [0], box: [100, 690, 325, 820] }],
  16: [{ who: "magistrate", quotes: [0, 1], box: [425, 370, 800, 750] }],
  17: [{ who: "magistrate", quotes: [0], box: [450, 295, 805, 590] }],
};
const sections = [...source.matchAll(/^(\d+)\n([\s\S]*?)(?=^\d+\n|$(?![\s\S]))/gm)];
if (sections.length !== 18) throw new Error(`Expected 18 pages, found ${sections.length}`);
const pages = sections.map((match, index) => {
  const n = Number(match[1]);
  if (n !== index + 1) throw new Error("Page order mismatch");
  const [body, rest] = match[2].split("\n\n그림 · ");
  if (!rest) throw new Error(`Missing illustration prompt on page ${n}`);
  const text = body.trim();
  const imagePrompt = rest.split("\n\n")[0].trim();
  const quotes = [...text.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (quotes.length !== (roles[n]?.length ?? 0)) throw new Error(`Quote count mismatch on page ${n}`);
  const lines = quotes.map((text, i) => ({ text, who: roles[n][i], feel: n === 16 ? "toneup" : "normal" }));
  // The manuscript expressly asks the narrator to read this inner thought.
  if (n === 6) lines.push({ text: "이상하다… 도대체 누가 다녀가는 거지?", who: "narration", feel: "normal" });
  const plan = planPageVoices({ text, lines, cast, roleOf });
  if (unmatchedLines(text, lines).length || unassignedDialogue(plan).length) throw new Error(`Unassigned dialogue on page ${n}`);
  const hotspots = (spots[n] ?? []).map((spot) => ({
    label: spot.who,
    line: spot.quotes.map((i) => quotes[i].replace(/\s+/g, " ")).join(" "),
    box: spot.box,
    audio: `/folk/ureong/say-p${n}-${spot.who}.mp3`,
    feel: n === 16 ? "toneup" : "normal",
  }));
  return { text, imagePrompt, image: "", ...(lines.length ? { lines } : {}), ...(hotspots.length ? { hotspots } : {}) };
});

const files = fs.readdirSync(imageDir);
const inputs = ["cover", ...pages.map((_, i) => `p${i + 1}`)].map((name) => {
  const file = files.find((f) => new RegExp(`^${name}\\.(jpg|jpeg|png|webp)$`, "i").test(f));
  if (!file) throw new Error(`Missing artwork: ${name}`);
  return { name, file: path.join(imageDir, file) };
});
const urls: Record<string, string> = {};
for (const { name, file } of inputs) {
  const bytes = await sharp(file).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 88 }).toBuffer();
  const { url } = await uploadToCafe24(`folk/ureong/${name}.webp`, bytes);
  const response = await fetch(`${url}?v=1`);
  if (!response.ok || !Buffer.from(await response.arrayBuffer()).equals(bytes)) throw new Error(`Upload verification failed: ${name}`);
  urls[name] = `${url}?v=1`;
  console.log(`Uploaded and verified ${name}: ${bytes.length} bytes`);
}
pages.forEach((page, i) => { page.image = urls[`p${i + 1}`]; });
books.push({
  id: "folk-ureong", lang: "ko", title: "우렁각시",
  summary: "우렁이에서 나타난 각시와 농부가 요술 조롱박으로 욕심 많은 사또의 내기를 이겨 내는 이야기.",
  narrator: "tc-minjung", narrators: ["tc-minjung"], coverImage: urls.cover, pageCount: 18,
  voiceCast: { narration: "tc-minjung", farmer: "tc-hosun", wife: "tc-najin", magistrate: "tc-shotgun", dragonking: "tc-wangkwon", villagers: "tc-minjung" },
  roleOf, pages,
});
fs.writeFileSync(dataFile, JSON.stringify(books, null, 2) + "\n", "utf8");
console.log(`Added 우렁각시: ${pages.length} pages, ${pages.reduce((n, p) => n + (p.hotspots?.length ?? 0), 0)} hotspots`);
