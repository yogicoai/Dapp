// 인물별 감정선 대본 — 반영은 했지만 아직 안 구운 '계획된 연기'를 인물마다 이야기 순서대로 늘어놓는다.
// 감정 자동 판정·세기·빠르기 규칙은 scripts/bake-cast-narration.mts 와 같게 옮겨 왔다(대본용 사본).
import fs from "node:fs";
const OUT = "C:/Users/WeMA1/AppData/Local/Temp/claude/c--Users-WeMA1-Desktop-Dong/af71a827-e7c4-4a71-be41-d25cc64de422/scratchpad/arc";
fs.mkdirSync(OUT, { recursive: true });
const LAUGHTER = /하하|호호|히히|헤헤|크크|푸하|껄껄|깔깔|부엉부엉|쿨쿨|드르렁|새근|코오|하암|스르르|푸우/;
function emotionOf(line) {
  if (LAUGHTER.test(line)) return "normal";
  if (/으악|살려|엉엉|훌쩍|눈물|슬퍼|무서|가엾|흑흑|어떡해|미안/.test(line)) return "sad";
  if (/안 돼|잡아먹|버럭|어흥|호통|이놈/.test(line)) return "angry";
  if (/만세|신나|와아|우와|기뻐|히히|하하|최고|고마워|승리/.test(line)) return "happy";
  return "normal";
}
const ROLE_INTENSITY = { nolbu: 0.6, nolbuwife: 0.55, heungbu: 0.5, gyeonu: 0.55, jiknyeo: 0.55 };
const vsrc = fs.readFileSync("src/lib/voices.ts", "utf8");
const V = {};
for (const m of vsrc.matchAll(/id:\s*"(tc-[a-z0-9]+)",\s*label:\s*"([^"]+)"[\s\S]{0,200}?model:\s*"([^"]+)",\s*desc:\s*"([^"]*)"/g)) V[m[1]] ??= { label: m[2], model: m[3], desc: m[4] };
for (const m of vsrc.matchAll(/id:\s*"(tc-[a-z0-9]+)".*?bakeTempo:\s*([0-9.]+)/g)) if (V[m[1]]) V[m[1]].bakeTempo = Number(m[2]);
const norm = (t) => t.normalize("NFC").replace(/["“”‘’']/g, "").replace(/\s+/g, "");
const list = [];
for (const file of ["src/data/classic-books.json", "src/data/folk-books.json"]) {
  for (const b of JSON.parse(fs.readFileSync(file, "utf8"))) {
    if (b.hidden || !b.voiceCast) continue;
    const names = {};
    for (const [ko, role] of Object.entries(b.roleOf || {})) (names[role] ??= []).push(ko);
    const plan = (role, text, pin) => {
      const emotion = pin?.feel ?? emotionOf(text);
      const intensity = emotion === "normal" ? null : pin?.intensity ?? ROLE_INTENSITY[role] ?? 0.4;
      const tempo = pin?.tempo ?? b.voiceTempo?.[role] ?? V[b.voiceCast[role]]?.bakeTempo ?? null;
      return `${emotion}${intensity ? `(${intensity})` : ""}${tempo ? ` 빠르기 ${tempo}` : ""}${pin?.feel ? " [못 박음]" : " [자동]"}`;
    };
    const byRole = {};
    for (const p of b.pages) {
      const n = p.n ?? b.pages.indexOf(p) + 1;
      for (const seg of p.segments || []) {
        if (seg.who === "narration") continue;
        const pin = (p.lines || []).find((l) => norm(l.text) === norm(seg.text));
        (byRole[seg.who] ??= []).push(`${n}쪽 조각 ${seg.src.split("/").pop()} · ${plan(seg.who, seg.text, pin)} · ${seg.text.trim().replace(/\n/g, " ")}`);
      }
      for (const h of p.hotspots || []) {
        (byRole[h.label] ??= []).push(`${n}쪽 말풍선 ${h.audio.split("/").pop()} · ${plan(h.label, h.line, h.feel ? h : null)} · ${h.line}`);
      }
    }
    let s = `# ${b.title} (id=${b.id})\n요약: ${b.summary || ""}\n\n## 줄거리(쪽별 본문)\n`;
    for (const p of b.pages) s += `[${p.n ?? b.pages.indexOf(p) + 1}쪽] ${p.text.replace(/\n/g, " ")}\n`;
    s += `\n## 인물별 대사 — 이야기 순서, 계획된 연기(감정(세기) 빠르기)\n`;
    for (const [role, rows] of Object.entries(byRole)) {
      const v = V[b.voiceCast[role]] || {};
      s += `\n### ${role} — ${(names[role] || [role]).join("/")} — 성우 ${v.label || b.voiceCast[role]} (${v.desc || ""}; ${v.model || ""}${v.model === "ssfm-v21" ? " — 감정은 normal·happy·sad·angry 넷만" : ""})\n${rows.map((r) => "- " + r).join("\n")}\n`;
    }
    fs.writeFileSync(`${OUT}/${b.id}.md`, s);
    list.push({ id: b.id, title: b.title, roles: Object.keys(byRole).length });
  }
}
fs.writeFileSync(`${OUT}/_list.json`, JSON.stringify(list, null, 1));
console.log(`${list.length}권 인물별 감정선 대본 → ${OUT}`);
