// 흥부와 놀부 — 사장님이 다시 뽑은 그림(민화풍 수채)으로 갈아 끼우고, 말풍선 자리를 새 그림에서 다시 잰다.
// 파일 이름은 뽑은 차례라 내용대로 쪽을 맞췄다: 10쪽(구렁이) ← p13.jpg, 13쪽(가을 작별) ← p10.jpg,
// 16쪽(첫 박 톱질) ← p15.jpg(p16.jpg 와 같은 파일). 15쪽(박씨 심기·집채만 한 박)은 새 그림이 없어 옛 그림을 그대로 둔다.
import fs from "node:fs";
import sharp from "sharp";
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const { uploadToCafe24 } = await import("./src/lib/cafe24.ts");

const SRC = "C:/Users/WeMA1/Desktop/흥부놀부";
const V = 6; // 주소 뒤 버전 — 같은 이름으로 덮어쓰므로 올려야 새 그림이 보인다
const MAP = {
  1: "p1.jpg", 2: "p2.jpg", 3: "p3.jpg", 4: "p4.jpg", 5: "p5.jpg", 6: "p6.jpg", 7: "p7.jpg", 8: "p8.jpg",
  9: "p9.jpg", 10: "p13.jpg", 11: "p11.jpg", 12: "p12.jpg", 13: "p10.jpg", 14: "p14.jpg",
  16: "p15.jpg", 17: "p17.jpg", 18: "p18.jpg", 19: "p19.jpg", 20: "p20.jpg", 21: "p21.jpg",
  22: "p22.jpg", 23: "p23.jpg", 24: "p24.jpg",
};
// 말풍선 자리 — 격자를 씌운 새 그림에서 직접 잰 천분율 [위, 왼쪽, 아래, 오른쪽].
const BOX = {
  // 세로 값은 격자 눈금(천분율) 기준이다 — 처음엔 일부를 그림 픽셀(750)로 읽어 위로 떠 있었다.
  2: { nolbu: [150, 590, 570, 820] },
  4: { kids: [450, 50, 800, 330] },
  5: { heungbuwife: [410, 60, 830, 340], heungbu: [290, 390, 850, 610] },
  6: { nolbuwife: [150, 580, 720, 810], heungbu: [190, 130, 880, 340] },
  7: { nolbuwife: [110, 670, 680, 870], heungbu: [200, 170, 950, 380] },
  8: { heungbu: [180, 90, 900, 290] },
  9: { kids: [560, 280, 980, 640] },
  11: { swallow: [750, 520, 920, 740] },
  12: { heungbu: [80, 110, 850, 480] },
  13: { swallow: [690, 590, 920, 910] },
  14: { swallow: [190, 480, 440, 650] },
  16: { heungbu: [140, 10, 820, 260], heungbuwife: [210, 760, 830, 990] },
  17: { kids: [360, 60, 780, 340], heungbu: [140, 320, 750, 500] },
  18: { nolbu: [140, 150, 920, 530] },
  19: { swallow: [440, 90, 670, 300] },
  20: { nolbu: [360, 340, 880, 700] },
  21: { nolbuwife: [200, 690, 760, 980], nolbu: [130, 30, 730, 310] },
  22: { dokkaebi: [300, 590, 730, 960] },
  23: { nolbu: [340, 300, 910, 680] },
  24: { nolbu: [300, 560, 930, 820], heungbu: [280, 360, 920, 560] },
};

const path = "src/data/folk-books.json";
const books = JSON.parse(fs.readFileSync(path, "utf8"));
const book = books.find((b) => b.id === "folk-heungbu");

let up = 0;
for (const [n, file] of Object.entries(MAP)) {
  const buf = await sharp(`${SRC}/${file}`).resize({ width: 1448, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  const { url } = await uploadToCafe24(`folk/heungbu/p${n}.webp`, buf);
  book.pages[n - 1].image = `${url}?v=${V}`;
  up += 1;
  console.log(`  ${String(n).padStart(2)}쪽 ← ${file.padEnd(8)} ${(buf.length / 1024) | 0}KB`);
}
book.coverImage = book.pages[0].image;

const missing = [];
let moved = 0;
for (const [i, p] of book.pages.entries()) {
  const n = i + 1;
  for (const h of p.hotspots ?? []) {
    const box = BOX[n]?.[h.label];
    if (box) { h.box = box; moved += 1; }
    else if (MAP[n]) missing.push(`${n}쪽 ${h.label}`);
  }
}
fs.writeFileSync(path, JSON.stringify(books, null, 2) + "\n");
console.log(`그림 ${up}장 교체(표지 포함) · 말풍선 ${moved}곳 다시 잼 · 자리 못 정한 말풍선: ${missing.length ? missing.join(", ") : "없음"}`);
console.log("15쪽은 새 그림이 없어 옛 그림·옛 말풍선 자리 그대로");
