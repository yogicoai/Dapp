/**
 * scratch-art 로 그려 둔 쪽 그림을 cafe24 에 올리고, 책 파일의 image 칸을 채운다.
 *
 * 쓰는 법:
 *   node --experimental-strip-types --env-file=.env.local scripts/upload-sample-art.mts \
 *        --file src/data/sample-books.json --id haon-bubble-day --dir 하온이의-비눗방울-하루 --remote sample/haon-bubble
 *
 * ⚠ cafe24 는 주소에 붙은 ?v= 까지 합쳐 7일 캐시한다. 같은 파일을 나중에 바꿔 올리면
 *   반드시 v 를 올려야 새 그림이 보인다. 그래서 처음부터 ?v=1 을 붙여 둔다.
 */
import fs from "node:fs";
import path from "node:path";
import { uploadToCafe24 } from "../src/lib/cafe24.ts";

const arg = (n: string, d = "") => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const FILE = arg("file", "src/data/sample-books.json");
const ID = arg("id");
const DIR = path.join("scratch-art", arg("dir"));
const REMOTE = arg("remote").replace(/^\/+|\/+$/g, "");
const V = arg("v", "1");
if (!ID || !arg("dir") || !REMOTE) throw new Error("--id --dir --remote 가 필요합니다");

const books = JSON.parse(fs.readFileSync(FILE, "utf8")) as { id: string; pages: { image?: string | null }[]; coverImage?: string }[];
const book = books.find((b) => b.id === ID);
if (!book) throw new Error(`${ID} 를 못 찾았습니다`);

for (let i = 0; i < book.pages.length; i++) {
  const local = path.join(DIR, `p${i + 1}.webp`);
  if (!fs.existsSync(local)) {
    console.log(`  ${i + 1}쪽 — 그림 파일이 없어 건너뜁니다 (${local})`);
    continue;
  }
  const { url } = await uploadToCafe24(`${REMOTE}/p${i + 1}.webp`, fs.readFileSync(local));
  book.pages[i].image = `${url}?v=${V}`;
  console.log(`  ${i + 1}쪽 → ${url}?v=${V}`);
}
// 표지는 1쪽 그림을 쓴다 — 제공 동화도 같은 방식이다.
if (book.pages[0]?.image) book.coverImage = book.pages[0].image;

const raw = fs.readFileSync(FILE, "utf8");
const nl = raw.includes("\r\n") ? "\r\n" : "\n";
fs.writeFileSync(FILE, JSON.stringify(books, null, 2).replace(/\n/g, nl) + nl, "utf8");
console.log(`\n${FILE} 갱신했습니다.`);
