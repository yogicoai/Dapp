// 대본 흐름·말투 점검(2차) 반영 — 검증을 통과한 고침만, 한 건씩 넣어 보고 어긋나면 그 건만 되돌린다.
//   node .apply-review2.mjs <결과.json> [--dry]
// 결과 = { results: [{ id, title, confirmed: [{ page, where, kind, current, proposed, reason }] }] }
import fs from "node:fs";

const [, , resultFile, flag] = process.argv;
const DRY = flag === "--dry";
const res = JSON.parse(fs.readFileSync(resultFile, "utf8"));
const FILES = ["src/data/classic-books.json", "src/data/folk-books.json"];
const data = Object.fromEntries(FILES.map((f) => [f, JSON.parse(fs.readFileSync(f, "utf8"))]));
const findBook = (id) => { for (const f of FILES) { const b = data[f].find((x) => x.id === id); if (b) return b; } return null; };

const unq = (s) => s.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "");
const count = (hay, n) => (n ? hay.split(n).length - 1 : 0);
const norm = (t) => t.normalize("NFC").replace(/["“”‘’']/g, "").replace(/\s+/g, "");
const rows = (t) => t.split("\n").filter((l) => l.trim()).length;

const applied = [], failed = [], touched = new Set();
for (const r of res.results) {
  const book = findBook(r.id);
  if (!book) { failed.push(`${r.title}: 책을 못 찾음`); continue; }
  for (const f of r.confirmed) {
    const tag = `${r.title} ${f.page}쪽 [${f.kind}]`;
    if (!f.current || f.current === f.proposed) { failed.push(`${tag} 빈 고침`); continue; }
    if (f.where === "summary") {
      if (count(book.summary ?? "", f.current) !== 1) { failed.push(`${tag} 요약에 ${count(book.summary ?? "", f.current)}번: ${f.current.slice(0, 30)}`); continue; }
      book.summary = book.summary.replace(f.current, f.proposed);
      applied.push({ ...f, title: r.title }); touched.add(r.title);
      continue;
    }
    const page = book.pages[f.page - 1];
    if (!page) { failed.push(`${tag} 쪽 없음`); continue; }
    const hits = count(page.text, f.current);
    if (hits !== 1) { failed.push(`${tag} 본문에 ${hits}번: ${f.current.slice(0, 40)}`); continue; }

    // 한 건을 복사본에 넣어 보고, 대사집·말풍선이 본문과 맞을 때만 받아들인다.
    const trial = JSON.parse(JSON.stringify(page));
    trial.text = trial.text.replace(f.current, f.proposed);
    const cu = unq(f.current), pu = unq(f.proposed);
    for (const l of trial.lines ?? []) if (cu && l.text.includes(cu)) l.text = l.text.replace(cu, pu);
    for (const h of trial.hotspots ?? []) if (cu && h.line.includes(cu)) h.line = h.line.replace(cu, pu);
    const broken = [
      ...(trial.lines ?? []).filter((l) => !norm(trial.text).includes(norm(l.text))).map((l) => `대사집 "${l.text.slice(0, 24)}"`),
      ...(trial.hotspots ?? []).filter((h) => !norm(trial.text).includes(norm(h.line))).map((h) => `말풍선 "${h.line.slice(0, 24)}"`),
    ];
    // 고치기 전부터 어긋나 있던 것은 이 고침 탓이 아니다.
    const before = new Set([
      ...(page.lines ?? []).filter((l) => !norm(page.text).includes(norm(l.text))).map((l) => `대사집 "${l.text.slice(0, 24)}"`),
      ...(page.hotspots ?? []).filter((h) => !norm(page.text).includes(norm(h.line))).map((h) => `말풍선 "${h.line.slice(0, 24)}"`),
    ]);
    const fresh = broken.filter((b) => !before.has(b));
    if (fresh.length) { failed.push(`${tag} 고치면 어긋남 → ${fresh.join(", ")} · ${f.current.slice(0, 30)}`); continue; }
    if (rows(trial.text) > Math.max(6, rows(page.text))) { failed.push(`${tag} 줄 수가 늘어남(${rows(page.text)}→${rows(trial.text)})`); continue; }

    Object.assign(page, trial);
    applied.push({ ...f, title: r.title }); touched.add(r.title);
  }
}

if (!DRY) for (const f of FILES) fs.writeFileSync(f, JSON.stringify(data[f], null, 2) + "\n");
const byKind = applied.reduce((m, a) => ((m[a.kind] = (m[a.kind] ?? 0) + 1), m), {});
console.log(`${DRY ? "[리허설] " : ""}반영 ${applied.length}건 ${JSON.stringify(byKind)} · 실패 ${failed.length}건 · 다시 구울 책 ${touched.size}권`);
if (failed.length) console.log("실패:\n  " + failed.join("\n  "));
const S = "C:/Users/WeMA1/AppData/Local/Temp/claude/c--Users-WeMA1-Desktop-Dong/af71a827-e7c4-4a71-be41-d25cc64de422/scratchpad";
if (!DRY) {
  fs.writeFileSync(`${S}/review2-applied.json`, JSON.stringify(applied, null, 1));
  fs.writeFileSync(`${S}/review2-touched.txt`, [...touched].join("\n") + "\n");
}
