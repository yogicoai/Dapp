import fs from "node:fs";
const S = "C:/Users/WeMA1/AppData/Local/Temp/claude/c--Users-WeMA1-Desktop-Dong/af71a827-e7c4-4a71-be41-d25cc64de422/scratchpad";
const res = JSON.parse(fs.readFileSync(`${S}/review-results.json`, "utf8"));
const SKIP = [["classic-mermaid", 16], ["folk-gamtu", 0]];
const files = { "src/data/classic-books.json": null, "src/data/folk-books.json": null };
for (const f of Object.keys(files)) files[f] = JSON.parse(fs.readFileSync(f, "utf8"));
const unq = (s) => s.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "");
const count = (hay, n) => hay.split(n).length - 1;
const log = { applied: 0, manual: [], failed: [] };
for (const r of res.results) {
  const book = files[r.file].find((b) => b.id === r.id);
  for (const f of r.confirmed) {
    if (f.severity === "suggestion") continue;
    if (SKIP.some(([id, p]) => id === r.id && p === f.page)) { log.manual.push(`보류 ${r.title} p${f.page}`); continue; }
    if (f.where === "cast") { log.manual.push(`수동 ${r.title} p${f.page}: ${f.current.slice(0, 30)}`); continue; }
    if (f.where === "summary") {
      if (count(book.summary, f.current) === 1) { book.summary = book.summary.replace(f.current, f.proposed); log.applied++; } else log.failed.push(`요약 ${r.title}: ${f.current}`);
      continue;
    }
    const page = book.pages[f.page - 1];
    if (!page) { log.failed.push(`${r.title} p${f.page}: 쪽 없음`); continue; }
    if (r.id === "classic-jack" && f.page === 9 && f.where === "hotspot") {
      const h = page.hotspots.find((x) => x.line.includes("하냥"));
      h.say = h.line; h.line = f.proposed; log.applied++; continue;
    }
    if (f.where === "text") {
      if (count(page.text, f.current) !== 1) { log.failed.push(`${r.title} p${f.page} 본문에 ${count(page.text, f.current)}번: ${f.current.slice(0, 40)}`); continue; }
      page.text = page.text.replace(f.current, f.proposed);
      // 같은 글이 대사집·말풍선에도 있으면 함께 고친다(따옴표는 떼고 비교).
      const cu = unq(f.current), pu = unq(f.proposed);
      for (const l of page.lines || []) if (cu && l.text.includes(cu)) l.text = l.text.replace(cu, pu);
      for (const h of page.hotspots || []) if (cu && h.line.includes(cu)) h.line = h.line.replace(cu, pu);
      log.applied++;
    } else if (f.where === "line") {
      const l = (page.lines || []).find((x) => x.text.includes(f.current));
      if (l) { l.text = l.text.replace(f.current, f.proposed); log.applied++; }
      else if ((page.lines || []).some((x) => x.text.includes(f.proposed))) log.applied++; // 본문 고칠 때 이미 따라 고쳐짐
      else log.failed.push(`${r.title} p${f.page} 대사집: ${f.current.slice(0, 40)}`);
    } else if (f.where === "hotspot") {
      const h = (page.hotspots || []).find((x) => x.line.includes(f.current));
      if (h) { h.line = h.line.replace(f.current, f.proposed); log.applied++; }
      else if ((page.hotspots || []).some((x) => x.line.includes(f.proposed))) log.applied++;
      else log.failed.push(`${r.title} p${f.page} 말풍선: ${f.current.slice(0, 40)}`);
    }
  }
}
// 사람이 정하는 것(where=cast) — 확인한 대로 손으로.
const folk = files["src/data/folk-books.json"];
const hb = folk.find((b) => b.id === "folk-heungbu");
(hb.pages[23].lines ??= []).push({ text: "형님!", who: "heungbu" });
const gf = folk.find((b) => b.id === "folk-greenfrog");
const setWho = (p, text, who) => {
  const page = gf.pages[p - 1];
  const l = (page.lines ??= []).find((x) => x.text === text);
  if (l) l.who = who; else page.lines.push({ text, who });
};
setWho(5, "물가에 가지 마라", "mother");
setWho(6, "'얘가 언제쯤 말을 잘 들을까…'", "mother");
setWho(11, "'엄마 말대로, 이번엔 꼭 할게.'", "child");
for (const [f, data] of Object.entries(files)) fs.writeFileSync(f, JSON.stringify(data, null, 2) + "\n");
console.log(`반영 ${log.applied}건`);
console.log("손으로/보류:\n  " + log.manual.join("\n  "));
console.log(log.failed.length ? "실패:\n  " + log.failed.join("\n  ") : "실패 0");
