import fs from "node:fs";
const OUT = "C:/Users/WeMA1/AppData/Local/Temp/claude/c--Users-WeMA1-Desktop-Dong/af71a827-e7c4-4a71-be41-d25cc64de422/scratchpad/acting";
fs.mkdirSync(OUT, { recursive: true });
const vsrc = fs.readFileSync("src/lib/voices.ts", "utf8");
const V = {};
for (const m of vsrc.matchAll(/id:\s*"(tc-[a-z0-9]+)",\s*label:\s*"([^"]+)"[\s\S]{0,200}?model:\s*"([^"]+)",\s*desc:\s*"([^"]*)"/g)) V[m[1]] ??= { label: m[2], model: m[3], desc: m[4] };
const man = JSON.parse(fs.readFileSync("scripts/bake-manifest.json", "utf8"));
const list = [];
for (const [file, root] of [["src/data/classic-books.json", "classic"], ["src/data/folk-books.json", "folk"]]) {
  for (const b of JSON.parse(fs.readFileSync(file, "utf8"))) {
    if (b.hidden || !b.voiceCast) continue;
    const names = {};
    for (const [ko, role] of Object.entries(b.roleOf || {})) (names[role] ??= []).push(ko);
    let s = `# ${b.title} (id=${b.id})\n요약: ${b.summary || ""}\n\n## 배역 (배역키 → 인물 → 성우)\n`;
    for (const [role, v] of Object.entries(b.voiceCast)) if (role !== "narration") s += `- ${role} → ${(names[role] || [role]).join("/")} → ${V[v]?.label || v} (${V[v]?.desc || ""}; 모델 ${V[v]?.model || "?"}${V[v]?.model === "ssfm-v21" ? " — 감정은 normal·happy·sad·angry 넷만 가능" : ""})\n`;
    let items = 0;
    for (const p of b.pages) {
      const n = p.n ?? b.pages.indexOf(p) + 1;
      s += `\n## ${n}쪽\n[본문]\n${p.text}\n`;
      const rows = [];
      for (const seg of p.segments || []) {
        if (seg.who === "narration") continue;
        const key = seg.src.replace(/^\//, ""); const r = man[key] || {};
        const pinned = (p.lines || []).find((l) => l.text && seg.text.replace(/["'“”‘’\s]/g, "").includes(l.text.replace(/["'“”‘’\s]/g, "")));
        rows.push(`- 조각 ${key.split("/").pop()} · ${seg.who} · 감정 ${r.emotion}${r.intensity ? `(세기 ${r.intensity})` : ""}${r.tempo ? ` · 빠르기 ${r.tempo}` : ""}${pinned?.feel ? " · [대사집에 못 박음]" : " · [자동 판정]"} · ${seg.text.trim().replace(/\n/g, " ")}`);
        items++;
      }
      for (const h of p.hotspots || []) {
        const key = h.audio.replace(/^\//, ""); const r = man[key] || {};
        rows.push(`- 말풍선 ${key.split("/").pop()} · ${h.label} · 감정 ${r.emotion}${r.intensity ? `(세기 ${r.intensity})` : ""}${h.feel ? " · [못 박음]" : " · [자동 판정]"} · ${h.line}${h.say ? ` (읽는 소리: ${h.say})` : ""}`);
        items++;
      }
      if (rows.length) s += `[대사 연기 — 지금 구워진 상태]\n${rows.join("\n")}\n`;
    }
    fs.writeFileSync(`${OUT}/${b.id}.md`, s);
    list.push({ id: b.id, title: b.title, file, items });
  }
}
fs.writeFileSync(`${OUT}/_list.json`, JSON.stringify(list, null, 1));
console.log(`${list.length}권 · 대사 연기 항목 ${list.reduce((a, b) => a + b.items, 0)}개`);
