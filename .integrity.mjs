import fs from "node:fs";
import { unmatchedLines } from "./src/lib/story-cast.ts";
const issues = [];
const imgs = [];
for (const file of ["src/data/classic-books.json", "src/data/folk-books.json"]) {
  for (const b of JSON.parse(fs.readFileSync(file, "utf8"))) {
    if (b.hidden) continue;
    if (b.coverImage) imgs.push([b.title, "표지", b.coverImage]);
    for (const [i, p] of (b.pages || []).entries()) {
      const n = p.n ?? i + 1;
      if (!p.image) issues.push(`${b.title} ${n}쪽: 그림 없음`); else imgs.push([b.title, `${n}쪽`, p.image]);
      if (!p.segments?.length && !p.audio) issues.push(`${b.title} ${n}쪽: 음성 조각이 없음(실시간 합성으로 넘어감)`);
      const joined = (p.segments || []).map((s) => s.text).join("");
      if (p.segments?.length && joined !== p.text) issues.push(`${b.title} ${n}쪽: 조각 글 합 ≠ 본문 (글자 색칠 어긋남)`);
      for (const l of unmatchedLines(p.text, p.lines || [])) issues.push(`${b.title} ${n}쪽: 대사집 줄이 본문에 없음 — ${l.text}`);
      for (const h of p.hotspots || []) {
        const [t, l, bt, r] = h.box || [];
        if (![t, l, bt, r].every((x) => Number.isFinite(x) && x >= 0 && x <= 1000) || t >= bt || l >= r) issues.push(`${b.title} ${n}쪽: 말풍선 좌표 이상 ${h.label} ${JSON.stringify(h.box)}`);
        if (!b.voiceCast?.[h.label]) issues.push(`${b.title} ${n}쪽: 말풍선 배역 ${h.label} 성우 없음`);
        if (!fs.existsSync("public" + h.audio)) issues.push(`${b.title} ${n}쪽: 말풍선 음성 없음 ${h.audio}`);
      }
      for (const s of p.segments || []) if (s.who !== "narration" && !b.voiceCast?.[s.who]) issues.push(`${b.title} ${n}쪽: 조각 배역 ${s.who} 성우 없음`);
    }
  }
}
let bad = 0, k = 0;
async function w() { while (k < imgs.length) { const [t, where, u] = imgs[k++]; try { const r = await fetch(u, { method: "HEAD" }); if (!r.ok) { bad++; issues.push(`${t} ${where}: 그림 링크 ${r.status}`); } } catch (e) { bad++; issues.push(`${t} ${where}: 그림 링크 실패`); } } }
await Promise.all(Array.from({ length: 12 }, w));
console.log(`그림 ${imgs.length}장 확인 · 깨진 링크 ${bad}`);
console.log(issues.length ? issues.join("\n") : "데이터 무결성 문제 없음");
