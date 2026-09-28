// 걸리버 3편 13~18쪽 말투 고침 반영 — 확정본(json)을 받아 본문·대사집·말풍선을 한꺼번에 바꾼다.
//   node .apply-gulliver3-tone.mjs <확정본.json>
// 확정본 = { gag, pages: [{ n, text, dialogue: [{who, text}], changed, why }] }
import fs from "node:fs";

const final = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const path = "src/data/classic-books.json";
const books = JSON.parse(fs.readFileSync(path, "utf8"));
const book = books.find((b) => b.id === "classic-gulliver3");

// 연기는 쪽·배역·차례로 정해 둔 것을 그대로 잇는다(글자가 바뀌어도 감정은 같은 자리다).
const FEEL = {
  "13:professor:0": { feel: "toneup", intensity: 0.4 },   // 두드려 깨어나는 첫마디
  "13:professor:1": { feel: "normal" },                    // 되풀이 말
  "14:gulliver:0": { feel: "normal" },
  "14:professor:0": { feel: "normal" },
  "15:professor:0": { feel: "normal" },
  "16:munodi:0": { feel: "happy", intensity: 0.3 },
  "17:munodi:0": { feel: "happy", intensity: 0.3 },      // 빙그레 웃으며 던지는 대꾸 — 차분함(tonedown)으로는 한 방이 죽는다
  "17:gulliver:0": { feel: "tonedown", intensity: 0.35 }, // 속마음
  "18:gulliver:0": { feel: "normal" },
};
// 말풍선에 걸 대사 — 쪽마다 배역당 하나다. 숫자는 그 배역의 몇 번째 대사인지.
const SPOT_PICK = { 13: { professor: 1 }, 14: { gulliver: 0, professor: 0 }, 15: { professor: 0 }, 16: { munodi: 0 }, 17: { munodi: 0 }, 18: { gulliver: 0 } };
const SPOT_HEAD = { 18: 2 }; // 긴 대사는 앞 몇 줄만 말풍선에 건다

const norm = (t) => t.normalize("NFC").replace(/["“”‘’']/g, "").replace(/\s+/g, "");
const problems = [];
let changedPages = 0;

for (const fp of final.pages) {
  const page = book.pages.find((p) => p.n === fp.n);
  if (!page) { problems.push(`${fp.n}쪽이 책에 없음`); continue; }

  // 1) 본문
  const before = page.text;
  page.text = fp.text.replace(/\r\n/g, "\n").trimEnd();
  if (page.text.split("\n").filter((l) => l.trim()).length > 6) problems.push(`${fp.n}쪽이 6줄을 넘음`);

  // 2) 대사집 — 본문에 그 글자가 실제로 있는지 확인하고 옮긴다
  const seen = {};
  page.lines = fp.dialogue.map((d) => {
    const i = (seen[d.who] = (seen[d.who] ?? -1) + 1);
    if (!norm(page.text).includes(norm(d.text))) problems.push(`${fp.n}쪽 대사가 본문에 없음: ${d.text}`);
    return { text: d.text.trim(), who: d.who, ...(FEEL[`${fp.n}:${d.who}:${i}`] ?? { feel: "normal" }) };
  });

  // 3) 말풍선 — 자리(box)는 그대로 두고 대사만 새 글로 갈아 끼운다
  for (const h of page.hotspots ?? []) {
    const pick = SPOT_PICK[fp.n]?.[h.label];
    if (pick === undefined) { problems.push(`${fp.n}쪽 말풍선 ${h.label} 을 어디에 걸지 모름`); continue; }
    const mine = fp.dialogue.filter((d) => d.who === h.label);
    const line = mine[pick]?.text;
    if (!line) { problems.push(`${fp.n}쪽 ${h.label} 의 ${pick}번째 대사가 없음`); continue; }
    const head = SPOT_HEAD[fp.n];
    h.line = head ? line.split("\n").slice(0, head).join("\n") : line;
  }

  if (before !== page.text) changedPages += 1;
}

// 되풀이 말이 13·14·15쪽에 글자까지 똑같이 있는지
const gag = final.gag.trim();
for (const n of [13, 14, 15]) {
  const p = book.pages.find((x) => x.n === n);
  const hit = (p.lines ?? []).filter((l) => l.who === "professor" && norm(l.text) === norm(gag)).length;
  if (hit !== 1) problems.push(`${n}쪽에 되풀이 말이 ${hit}번 (1번이어야 함): ${gag}`);
}

if (problems.length) {
  console.error("반영 전에 고칠 것:");
  for (const p of problems) console.error("  ★ " + p);
  process.exit(1);
}
fs.writeFileSync(path, JSON.stringify(books, null, 2) + "\n");
console.log(`본문 바뀐 쪽 ${changedPages}개 · 되풀이 말 "${gag}" · 대사 ${final.pages.reduce((n, p) => n + p.dialogue.length, 0)}줄 반영`);
for (const p of final.pages) if (p.changed) console.log(`  ${p.n}쪽: ${p.why}`);
