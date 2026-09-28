import fs from "node:fs";
const p = "scripts/bake-cast-narration.mts";
let s = fs.readFileSync(p, "utf8");
const note = {
  "토끼의 재판": "2026-09-20 재캐스팅: 나레이션 진서 · 나그네 대진 · 나무 승재 (호랑이 심호문 · 소 덕구 · 토끼 햄쭈 그대로).",
  "청개구리": "2026-09-20 재캐스팅: 나레이션 진서 · 엄마 청개구리 민주 · 아기 청개구리 토비.",
  "상길이놈과 박서방": "2026-09-20 재캐스팅: 나레이션 진서 · 거만한 양반 진혁 · 정중한 양반 강일 · 박상길 창배.",
  "인어 공주": "2026-09-20 재캐스팅: 나레이션 진서 · 왕자 강일 · 언니 민주 (인어 공주 민정 · 바다 마녀 유빈 그대로). 이제 나레이터와 공주가 다른 목소리다.",
};
for (const [t, n] of Object.entries(note)) {
  const head = `  "${t}": {`;
  const at = s.indexOf(head);
  if (at < 0) throw new Error("spec 못 찾음: " + t);
  const end = s.indexOf("\n  },", at);
  let block = s.slice(at, end);
  const nb = block
    .replace('narrators: ["tc-minjung"],', 'narrators: ["tc-jinseo"],')
    .replace('defaultNarrator: "tc-minjung",', 'defaultNarrator: "tc-jinseo",');
  if (nb === block) throw new Error("나레이터 줄 못 찾음: " + t);
  s = s.slice(0, at) + `  // ${n}\n` + nb + s.slice(end);
}
fs.writeFileSync(p, s);
console.log("굽기 설정 4권 → 나레이터 진서");
