import fs from "node:fs";
const END = /[.,!?…~—\-'"’”」』:;)]$/u;
let tot = { seg: 0, segHit: 0, breaks: 0, chars: 0, longRuns: 0 };
const rows = [];
for (const f of ["src/data/classic-books.json", "src/data/folk-books.json"]) {
  for (const b of JSON.parse(fs.readFileSync(f, "utf8"))) {
    if (b.hidden) continue;
    let hitSegs = 0, breaks = 0, chars = 0, runs = 0;
    const narrN = Math.max(1, (b.narrators || []).length);
    for (const p of b.pages || []) for (const s of p.segments || []) {
      tot.seg++;
      const t = s.text.trim();
      const lines = t.split("\n");
      let k = 0;
      for (let i = 0; i < lines.length - 1; i++) if (!END.test(lines[i].trim())) k++;
      // 쉼표·마침표 없이 25음절 넘게 이어지는 덩어리
      for (const chunk of t.split(/[.,!?…~—\n]/)) if ((chunk.match(/[가-힣]/g) || []).length > 25) runs++;
      if (k) { hitSegs++; breaks += k; chars += t.length * (s.who === "narration" ? narrN : 1); }
    }
    tot.segHit += hitSegs; tot.breaks += breaks; tot.chars += chars; tot.longRuns += runs;
    rows.push([b.title, hitSegs, breaks, chars, runs]);
  }
}
rows.sort((a, b) => b[2] - a[2]);
for (const r of rows) console.log(`  ${r[0].padEnd(14)} 줄바꿈만 있는 조각 ${String(r[1]).padStart(3)} · 쉼 없는 줄바꿈 ${String(r[2]).padStart(3)} · 다시 구울 글자 ${String(r[3]).padStart(5)} · 25음절↑ 쉼표없는 덩어리 ${r[4]}`);
console.log(`합계: 조각 ${tot.segHit}/${tot.seg} · 줄바꿈 ${tot.breaks} · 글자 ${tot.chars} · 긴 덩어리 ${tot.longRuns}`);
