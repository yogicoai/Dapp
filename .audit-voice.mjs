import fs from "node:fs";
import { execFile } from "node:child_process";
const OUT = "C:/Users/WeMA1/AppData/Local/Temp/claude/c--Users-WeMA1-Desktop-Dong/af71a827-e7c4-4a71-be41-d25cc64de422/scratchpad/audit.json";
const vsrc = fs.readFileSync("src/lib/voices.ts", "utf8");
const VOICES = {};
for (const m of vsrc.matchAll(/id:\s*"(tc-[a-z0-9]+)",\s*label:\s*"([^"]+)"[\s\S]{0,200}?voiceId:\s*"(tc_[a-f0-9]+)"[\s\S]{0,60}?model:\s*"([^"]+)",\s*desc:\s*"([^"]*)"/g))
  VOICES[m[1]] ??= { label: m[2], voiceId: m[3], model: m[4], desc: m[5] };
const manifest = JSON.parse(fs.readFileSync("scripts/bake-manifest.json", "utf8"));
const dur = (f) => new Promise((res) => execFile("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], (e, o) => res(e ? null : parseFloat(o))));
const syl = (t) => (t.match(/[가-힣]/g) || []).length;
const jobs = [];
const books = [];
for (const [file, root] of [["src/data/classic-books.json", "classic"], ["src/data/folk-books.json", "folk"]]) {
  for (const b of JSON.parse(fs.readFileSync(file, "utf8"))) {
    const info = { id: b.id, title: b.title, root, hidden: !!b.hidden, narrator: b.narrator, narrators: b.narrators || [], voiceCast: b.voiceCast || {}, roleOf: b.roleOf || {}, voiceTempo: b.voiceTempo || null, items: [] };
    books.push(info);
    for (const p of b.pages || []) {
      const n = p.n ?? b.pages.indexOf(p) + 1;
      for (const s of p.segments || []) {
        const files = s.who === "narration" && info.narrators.length
          ? info.narrators.map((v) => ({ path: s.src.replace("seg-", `seg-${v}-`), want: v }))
          : [{ path: s.src, want: s.who === "narration" ? info.voiceCast.narration : info.voiceCast[s.who] }];
        for (const f of files) jobs.push({ info, kind: s.who === "narration" ? "narr" : "cast", role: s.who, page: n, text: s.text.trim(), ...f });
      }
      for (const h of p.hotspots || []) jobs.push({ info, kind: "say", role: h.label, page: n, text: String(h.line), path: h.audio, want: info.voiceCast[h.label] });
    }
  }
}
let i = 0;
async function worker() {
  while (i < jobs.length) {
    const j = jobs[i++];
    const disk = "public" + j.path;
    const key = j.path.replace(/^\//, "");
    const rec = manifest[key];
    const exists = fs.existsSync(disk);
    const d = exists ? await dur(disk) : null;
    const spoken = rec?.text ?? j.text;
    j.info.items.push({
      kind: j.kind, role: j.role, page: j.page, file: j.path, want: j.want,
      baked: rec?.voice ?? null, emotion: rec?.emotion ?? null, tempo: rec?.tempo ?? 1,
      exists, sec: d, syl: syl(spoken), text: spoken.slice(0, 60),
      status: !exists ? "missing" : !rec ? "unrecorded" : rec.voice !== j.want ? "mismatch" : "ok",
    });
  }
}
await Promise.all(Array.from({ length: 10 }, worker));
fs.writeFileSync(OUT, JSON.stringify({ voices: VOICES, books }, null, 1));
const all = books.flatMap((b) => b.items);
const cnt = (s) => all.filter((x) => x.status === s).length;
console.log(`책 ${books.length}권 · 파일 ${all.length}개 · ok ${cnt("ok")} · 성우불일치 ${cnt("mismatch")} · 기록없음 ${cnt("unrecorded")} · 파일없음 ${cnt("missing")}`);
