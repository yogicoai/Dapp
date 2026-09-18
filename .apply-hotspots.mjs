// 측정된 박스를 원래 핫스팟(대사·음성)과 다시 합쳐 folk-books.json에 넣는다.
// 사용: node .apply-hotspots.mjs <측정결과.json>
import fs from "node:fs";

const boxesPath = process.argv[2];
const boxes = JSON.parse(fs.readFileSync(boxesPath, "utf8"));
const backup = JSON.parse(fs.readFileSync("src/data/_hotspots-backup-before-portrait.json", "utf8"));
const p = "src/data/folk-books.json";
const books = JSON.parse(fs.readFileSync(p, "utf8"));

let applied = 0, skipped = 0;
for (const [bookId, info] of Object.entries(backup)) {
  const book = books.find((b) => b.id === bookId);
  if (!book) continue;
  for (const entry of info.pages) {
    const old = entry.hotspots || [];
    if (old.length === 0) continue;
    const measured = boxes[`${bookId}:${entry.page}`] || [];
    // label별로 순서대로 짝지어 준다(같은 label이 여럿이면 나온 순서대로).
    const queue = {};
    for (const m of measured) (queue[m.label] ||= []).push(m);
    const rebuilt = [];
    for (const h of old) {
      const m = (queue[h.label] || []).shift();
      if (!m || !m.box) { skipped++; continue; }
      // 대사·음성은 원본 그대로, 위치만 새로 잰 값으로.
      rebuilt.push({ label: h.label, box: m.box.map(Math.round), audio: h.audio, line: h.line });
      applied++;
    }
    if (rebuilt.length) book.pages[entry.page - 1].hotspots = rebuilt;
  }
}
fs.writeFileSync(p, JSON.stringify(books, null, 2) + "\n");
console.log(`  적용 ${applied}개 / 건너뜀 ${skipped}개`);
