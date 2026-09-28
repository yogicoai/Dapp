import fs from "node:fs";
const OUT = "C:/Users/WeMA1/AppData/Local/Temp/claude/c--Users-WeMA1-Desktop-Dong/af71a827-e7c4-4a71-be41-d25cc64de422/scratchpad/review";
fs.mkdirSync(OUT, { recursive: true });
const vsrc = fs.readFileSync("src/lib/voices.ts", "utf8");
const V = {};
for (const m of vsrc.matchAll(/id:\s*"(tc-[a-z0-9]+)",\s*label:\s*"([^"]+)"[\s\S]{0,200}?desc:\s*"([^"]*)"/g)) V[m[1]] ??= `${m[2]} (${m[3]})`;
const list = [];
for (const [file, root] of [["src/data/classic-books.json", "세계명작"], ["src/data/folk-books.json", "전래동화"]]) {
  for (const b of JSON.parse(fs.readFileSync(file, "utf8"))) {
    if (b.hidden) continue;
    const names = {};
    for (const [ko, role] of Object.entries(b.roleOf || {})) (names[role] ??= []).push(ko);
    let s = `# ${b.title}  (${root} · id=${b.id} · 파일=${file})\n요약: ${b.summary || ""}\n\n## 배역 (배역키 → 이름들 → 성우)\n`;
    for (const [role, v] of Object.entries(b.voiceCast || {})) s += `- ${role} → ${(names[role] || [role]).join("/")} → ${V[v] || v}\n`;
    s += `(나레이터: ${V[b.narrator] || b.narrator})\n`;
    for (const p of b.pages || []) {
      const n = p.n ?? b.pages.indexOf(p) + 1;
      s += `\n## ${n}쪽\n[본문]\n${p.text}\n`;
      if (p.lines?.length) s += `[대사집 — 이 줄은 이 배역이 읽음]\n` + p.lines.map((l) => `- ${l.who}: ${l.text}${l.feel ? ` (감정 ${l.feel})` : ""}${l.say ? ` (읽는 소리: ${l.say})` : ""}`).join("\n") + "\n";
      const quoted = (p.segments || []).filter((x) => x.who !== "narration");
      if (quoted.length) s += `[실제 낭독 배정 — 나레이션 외 조각]\n` + quoted.map((x) => `- ${x.who} 가 읽음: ${x.text.trim().replace(/\n/g, " ")}`).join("\n") + "\n";
      const narrQuotes = (p.segments || []).filter((x) => x.who === "narration" && /["“]/.test(x.text));
      if (narrQuotes.length) s += `[주의: 따옴표가 있는데 나레이션이 읽는 조각]\n` + narrQuotes.map((x) => `- ${x.text.trim().replace(/\n/g, " ")}`).join("\n") + "\n";
      if (p.hotspots?.length) s += `[그림 속 인물 누르면 나오는 말풍선]\n` + p.hotspots.map((h) => `- ${h.label}: ${h.line}`).join("\n") + "\n";
    }
    fs.writeFileSync(`${OUT}/${b.id}.md`, s);
    list.push({ id: b.id, title: b.title, file, pages: (b.pages || []).length });
  }
}
fs.writeFileSync(`${OUT}/_list.json`, JSON.stringify(list, null, 1));
console.log(`검토 파일 ${list.length}권 → ${OUT}`);
