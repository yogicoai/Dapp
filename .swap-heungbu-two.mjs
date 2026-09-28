// 흥부와 놀부 10·15쪽 — 사장님이 다시 뽑아 준 두 장을 갈아 끼운다(2026-09-21).
// 10쪽: 캐릭터 시트가 섞여 나온 그림을 구렁이·돌담·초가 처마·둥지만 있는 그림으로.
// 15쪽: 옛 3D 그림이 남아 있던 쪽 — 이제 24쪽 모두 같은 그림체다. 말풍선(흥부)은 새 그림에서 다시 쟀다.
import fs from "node:fs";
import sharp from "sharp";
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const { uploadToCafe24 } = await import("./src/lib/cafe24.ts");
const SRC = "C:/Users/WeMA1/Desktop/흥부놀부";
const V = 7; // 10쪽은 같은 이름(v=6)으로 이미 올린 적이 있어 한 번 더 올린다
const path = "src/data/folk-books.json";
const books = JSON.parse(fs.readFileSync(path, "utf8"));
const book = books.find((b) => b.id === "folk-heungbu");
for (const [n, file] of [[10, "p10.jpg"], [15, "p15.jpg"]]) {
  const buf = await sharp(`${SRC}/${file}`).resize({ width: 1448, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  const { url } = await uploadToCafe24(`folk/heungbu/p${n}.webp`, buf);
  book.pages[n - 1].image = `${url}?v=${V}`;
  console.log(`  ${n}쪽 ← ${file} ${(buf.length / 1024) | 0}KB`);
}
// 15쪽 흥부 — 왼쪽에서 박씨를 심는 모습. 격자 눈금 기준 천분율 [위, 왼쪽, 아래, 오른쪽].
const h = book.pages[14].hotspots.find((x) => x.label === "heungbu");
h.box = [490, 20, 890, 260];
fs.writeFileSync(path, JSON.stringify(books, null, 2) + "\n");
console.log("10·15쪽 교체 · 15쪽 말풍선 자리 갱신");
