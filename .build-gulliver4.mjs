// 걸리버 여행기 4 — 확정 원고(json)와 올린 그림으로 책을 만든다.
//   node .build-gulliver4.mjs <확정본.json>
// 캐스팅: 나레이션 민정(처음엔 민주였는데 사장님이 1~3편과 같은 민정으로 되돌렸다) · 걸리버 강일 + 내가 고른 넷 —
//   회색 말 건석(듬직한 아빠: 걸리버를 거둔 어른 말이자 망아지의 아빠),
//   망아지 하준(명랑한 남자 어린이: 3편 두드리미가 시우라 겹치지 않는다),
//   선원 심호문(능청스럽고 낮은 목소리: "금방 돌아올게요"가 능청이어야 웃기다),
//   막내딸 아린이(밝고 사랑스러운 여자아이: 2편 거인의 딸 수아와 겹치지 않는다).
// 사장님이 주신 그림 파일은 쪽 번호가 아니라 뽑은 차례라 내용대로 맞춰 올렸고,
// 15쪽 그림은 사장님이 뒤늦게 넣어 주셔서 18쪽 모두 그림이 있다.
import fs from "node:fs";

const final = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const S = "C:/Users/WeMA1/AppData/Local/Temp/claude/c--Users-WeMA1-Desktop-Dong/af71a827-e7c4-4a71-be41-d25cc64de422/scratchpad";
const urls = JSON.parse(fs.readFileSync(`${S}/gulliver4-urls.json`, "utf8"));

// 말풍선 자리 — 격자를 씌운 그림에서 직접 잰 천분율 [위, 왼쪽, 아래, 오른쪽].
const BOX = {
  1: { gulliver: [60, 300, 900, 700] },
  2: { sailor: [250, 60, 620, 340] },
  4: { gulliver: [130, 90, 580, 290] },
  5: { gulliver: [230, 10, 900, 290] },
  7: { foal: [340, 620, 710, 900] },
  8: { gulliver: [90, 280, 820, 450], greyhorse: [30, 430, 800, 700] },
  9: { gulliver: [110, 180, 700, 420], greyhorse: [90, 430, 740, 720] },
  10: { foal: [190, 90, 570, 275], greyhorse: [40, 280, 670, 500] },
  11: { foal: [230, 150, 630, 350] },
  12: { greyhorse: [300, 60, 570, 240] },
  14: { gulliver: [190, 240, 710, 420], greyhorse: [210, 60, 570, 200] },
  15: { foal: [280, 90, 830, 350] },
  16: { gulliver: [180, 100, 700, 420], foal: [350, 400, 710, 660] },
  17: { daughter: [100, 330, 490, 500] },
  18: { gulliver: [130, 230, 870, 520] },
};
// 한 배역이 한 쪽에서 두 번 말하면 어느 줄을 말풍선에 걸지 — 안 적으면 첫 줄.
const PICK = { 9: { greyhorse: 0 } };
// 긴 액자 인사는 앞 몇 줄만 말풍선에 건다(3편 18쪽과 같은 방식).
const HEAD = { 1: 2, 18: 2 };

const book = {
  id: "classic-gulliver4",
  lang: "ko",
  title: "걸리버 여행기 4",
  summary: "말들의 나라에 닿은 걸리버 — '거짓말'이라는 낱말조차 없는 곳에서 지내다 가족 품으로 돌아온 마지막 여행 이야기.",
  narrator: "tc-minjung",
  narrators: ["tc-minjung"],
  coverImage: urls.cover,
  voiceCast: {
    narration: "tc-minjung",
    gulliver: "tc-kangil",
    sailor: "tc-homun",
    greyhorse: "tc-gunseok",
    foal: "tc-hajun",
    daughter: "tc-arin",
  },
  roleOf: {
    "걸리버": "gulliver",
    "선원": "sailor", "선원들": "sailor",
    "회색 말": "greyhorse", "회색말": "greyhorse",
    "망아지": "foal",
    "막내딸": "daughter", "딸": "daughter",
  },
  pages: final.pages
    .slice()
    .sort((a, b) => a.n - b.n)
    .map((p) => {
      const seen = {};
      const lines = p.dialogue.map((d) => {
        seen[d.who] = (seen[d.who] ?? -1) + 1;
        const feel = d.feel && d.feel !== "normal" ? { feel: d.feel, intensity: Math.min(0.5, Math.max(0.3, d.intensity ?? 0.4)) } : { feel: "normal" };
        return { text: d.text.trim(), who: d.who, ...feel };
      });
      const boxes = BOX[p.n] ?? {};
      const hotspots = Object.entries(boxes).flatMap(([role, box]) => {
        const mine = p.dialogue.filter((d) => d.who === role);
        const pick = PICK[p.n]?.[role] ?? 0;
        const d = mine[pick];
        if (!d) return [];
        const head = HEAD[p.n];
        const line = head ? d.text.split("\n").slice(0, head).join("\n") : d.text;
        const pin = d.feel && d.feel !== "normal" ? { feel: d.feel, intensity: Math.min(0.5, Math.max(0.3, d.intensity ?? 0.4)) } : {};
        return [{ label: role, line, box, audio: `/classic/gulliver4/say-p${p.n}-${role}.mp3`, ...pin }];
      });
      return {
        n: p.n,
        text: p.text.replace(/\r\n/g, "\n").trimEnd(),
        ...(urls[`p${p.n}`] ? { image: urls[`p${p.n}`] } : {}),
        ...(lines.length ? { lines } : {}),
        ...(hotspots.length ? { hotspots } : {}),
      };
    }),
};

// 검사 — 대사가 본문에 그대로 있는지, 6줄을 넘지 않는지
const norm = (t) => t.normalize("NFC").replace(/["“”‘’']/g, "").replace(/\s+/g, "");
const bad = [];
for (const p of book.pages) {
  if (p.text.split("\n").filter((l) => l.trim()).length > 6) bad.push(`${p.n}쪽이 6줄을 넘음`);
  for (const l of p.lines ?? []) if (!norm(p.text).includes(norm(l.text))) bad.push(`${p.n}쪽 대사가 본문에 없음: ${l.text}`);
  for (const h of p.hotspots ?? []) if (!norm(p.text).includes(norm(h.line))) bad.push(`${p.n}쪽 말풍선 글이 본문에 없음: ${h.line}`);
}
if (bad.length) { console.error("고칠 것:"); for (const b of bad) console.error("  ★ " + b); process.exit(1); }

const path = "src/data/classic-books.json";
const books = JSON.parse(fs.readFileSync(path, "utf8"));
const at = books.findIndex((b) => b.id === book.id);
if (at >= 0) books[at] = book;
else books.splice(books.findIndex((b) => b.id === "classic-gulliver3") + 1, 0, book);
fs.writeFileSync(path, JSON.stringify(books, null, 2) + "\n");
const noImg = book.pages.filter((p) => !p.image).map((p) => p.n);
console.log(`걸리버 여행기 4 ${book.pages.length}쪽 ${at >= 0 ? "교체" : "추가"} · 대사 ${book.pages.reduce((n, p) => n + (p.lines?.length ?? 0), 0)}줄 · 말풍선 ${book.pages.reduce((n, p) => n + (p.hotspots?.length ?? 0), 0)}곳`);
console.log(`그림 없는 쪽: ${noImg.length ? noImg.join(",") : "없음"} · 차례: ${books.map((b) => b.id).slice(17, 22).join(" ")}`);
