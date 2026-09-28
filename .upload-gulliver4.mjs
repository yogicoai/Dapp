// 걸리버 4편 그림 올리기 — 사장님이 주신 파일은 뽑은 차례라, 내용대로 쪽을 다시 맞춘다.
// 15쪽(배 만들기 + 조약돌 선물)은 2026-09-20 저녁에 사장님이 따로 넣어 주셨다(파일 p17.jpg).
import fs from "node:fs";
import sharp from "sharp";
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const { uploadToCafe24 } = await import("./src/lib/cafe24.ts");

const SRC = "C:/Users/WeMA1/Downloads/gulliver_book1_pages_1-12_20260920_094837/gulliver_book1_pages_1-12";
const REMOTE = "classic/gulliver4";
const OUT = "C:/Users/WeMA1/AppData/Local/Temp/claude/c--Users-WeMA1-Desktop-Dong/af71a827-e7c4-4a71-be41-d25cc64de422/scratchpad/gulliver4-urls.json";
// 쪽 → 파일(내용을 보고 맞춘 것). p13·p14 는 p11·p12 와 같은 파일이라 쓰지 않는다.
const MAP = {
  cover: "p4.jpg",
  p1: "p1.jpg", p2: "p2.jpg", p3: "p3.jpg", p4: "p4.jpg", p5: "p5.jpg", p6: "p6.jpg",
  p7: "p7.jpg", p8: "p8.jpg", p9: "p9.jpg", p10: "p10.jpg", p11: "p11.jpg", p12: "p12.jpg",
  p13: "p15.jpg", p14: "p16.jpg", p15: "p17.jpg", p16: "p18.jpg", p17: "p19.jpg", p18: "p20.jpg",
};
const urls = {};
for (const [key, file] of Object.entries(MAP)) {
  const buf = await sharp(`${SRC}/${file}`).resize({ width: 1448, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  const { url } = await uploadToCafe24(`${REMOTE}/${key}.webp`, buf);
  urls[key] = `${url}?v=1`;
  console.log(`  ${key.padEnd(5)} ← ${file.padEnd(8)} ${(buf.length / 1024) | 0}KB`);
}
fs.writeFileSync(OUT, JSON.stringify(urls, null, 1));
console.log(`${REMOTE} 업로드 ${Object.keys(urls).length}장 완료(표지 + 18쪽)`);
