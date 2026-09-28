import fs from "node:fs";
const { voices: V, books } = JSON.parse(fs.readFileSync("C:/Users/WeMA1/AppData/Local/Temp/claude/c--Users-WeMA1-Desktop-Dong/af71a827-e7c4-4a71-be41-d25cc64de422/scratchpad/audit.json", "utf8"));
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
const items = books.flatMap((b) => b.items.map((x) => ({ ...x, book: b.title, hidden: b.hidden })));
const rated = items.filter((x) => x.syl >= 12 && x.sec > 0).map((x) => ({ ...x, cps: x.syl / x.sec }));
console.log("== ① 성우별 말 빠르기 (초당 음절, 12음절 이상 파일) ==");
const byVoice = {};
for (const x of rated) (byVoice[x.baked] ??= []).push(x);
const rows = Object.entries(byVoice).map(([v, xs]) => ({ v, label: V[v]?.label, n: xs.length, med: med(xs.map((x) => x.cps)), p10: pct(xs.map((x) => x.cps), 0.1), p90: pct(xs.map((x) => x.cps), 0.9), narr: xs.filter((x) => x.kind === "narr").length }));
rows.sort((a, b) => b.med - a.med);
for (const r of rows) console.log(`  ${(r.label || r.v).padEnd(8)} ${r.v.padEnd(12)} n=${String(r.n).padStart(4)} (나레이션 ${String(r.narr).padStart(4)})  중앙 ${r.med.toFixed(2)}  [${r.p10.toFixed(2)}~${r.p90.toFixed(2)}]`);
const narrAll = rated.filter((x) => x.kind === "narr");
console.log(`  (나레이션 전체 중앙 ${med(narrAll.map((x) => x.cps)).toFixed(2)} · 대사 전체 중앙 ${med(rated.filter((x) => x.kind !== "narr").map((x) => x.cps)).toFixed(2)})`);
console.log("\n== 책별 나레이션 빠르기 ==");
for (const b of books) {
  const xs = rated.filter((x) => x.book === b.title && x.kind === "narr");
  if (xs.length) console.log(`  ${b.title.padEnd(14)} ${String(b.narrators).padEnd(12)} 중앙 ${med(xs.map((x) => x.cps)).toFixed(2)}${b.hidden ? "  (숨김)" : ""}`);
}
console.log("\n== 튀는 파일 (그 성우 중앙값 대비 ±30% 이상) ==");
const vmed = Object.fromEntries(rows.map((r) => [r.v, r.med]));
const odd = rated.filter((x) => x.cps > vmed[x.baked] * 1.3 || x.cps < vmed[x.baked] * 0.7).sort((a, b) => a.cps / vmed[a.baked] - b.cps / vmed[b.baked]);
for (const x of odd) console.log(`  ${(x.cps / vmed[x.baked]).toFixed(2)}배  ${x.book} p${x.page} ${x.kind}/${x.role} ${V[x.baked]?.label} ${x.sec.toFixed(1)}s ${x.syl}음절 tempo=${x.tempo} emo=${x.emotion} | ${x.text.replace(/\n/g, " ").slice(0, 40)}`);
console.log(`  (총 ${odd.length}개)`);
fs.writeFileSync("C:/Users/WeMA1/AppData/Local/Temp/claude/c--Users-WeMA1-Desktop-Dong/af71a827-e7c4-4a71-be41-d25cc64de422/scratchpad/odd.json", JSON.stringify(odd, null, 1));
