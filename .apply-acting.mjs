// 연기 톤 점검 결과 반영 — 확정된 변경만. 대사 조각은 대사집(lines)에, 말풍선은 hotspot 에 못 박는다.
import fs from "node:fs";
const [, , resultFile] = process.argv;
const res = JSON.parse(fs.readFileSync(resultFile, "utf8"));
const FILES = { classic: "src/data/classic-books.json", folk: "src/data/folk-books.json" };
const data = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, JSON.parse(fs.readFileSync(f, "utf8"))]));
const norm = (t) => t.normalize("NFC").replace(/["“”‘’']/g, "").replace(/\s+/g, "").trim();
const setTone = (obj, to) => {
  obj.feel = to.emotion;
  if (to.emotion !== "normal" && typeof to.intensity === "number") obj.intensity = Math.min(0.6, Math.max(0.3, to.intensity));
  else delete obj.intensity;
  if (typeof to.tempo === "number" && to.tempo !== 1) obj.tempo = Math.min(1.15, Math.max(0.85, to.tempo));
  else delete obj.tempo;
};
let applied = 0;
const failed = [];
for (const r of res.results) {
  const book = data[r.id.startsWith("classic-") ? "classic" : "folk"].find((b) => b.id === r.id);
  for (const c of r.confirmed) {
    const m = c.file.match(/^(seg-cast|say)-p(\d+)-/);
    if (!m) { failed.push(`${r.title}: 파일 이름 ${c.file}`); continue; }
    const page = book.pages[Number(m[2]) - 1];
    if (m[1] === "say") {
      const h = (page.hotspots || []).find((x) => x.audio.endsWith("/" + c.file));
      if (!h) { failed.push(`${r.title}: 말풍선 ${c.file} 없음`); continue; }
      setTone(h, c.to);
    } else {
      const seg = (page.segments || []).find((s) => s.src.endsWith("/" + c.file));
      if (!seg) { failed.push(`${r.title}: 조각 ${c.file} 없음`); continue; }
      const key = norm(seg.text);
      let line = (page.lines ||= []).find((l) => norm(l.text) === key);
      if (!line) {
        line = { text: seg.text.trim().replace(/^["“]|["”]$/g, ""), who: seg.who };
        page.lines.push(line);
      }
      setTone(line, c.to);
    }
    applied++;
  }
}
for (const [k, f] of Object.entries(FILES)) fs.writeFileSync(f, JSON.stringify(data[k], null, 2) + "\n");
console.log(`반영 ${applied}건 · 실패 ${failed.length}`);
if (failed.length) console.log("  " + failed.join("\n  "));
