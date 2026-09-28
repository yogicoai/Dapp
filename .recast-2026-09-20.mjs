// 2026-09-20 저녁 사장님 지시 두 가지를 한 번에 반영한다.
//  ① 나레이션을 모든 책에서 민정으로 통일(진서·지영·혜민으로 읽던 7권).
//  ② 우렁각시 성우 전체 재설계 — 내가 추천한 구성으로.
import fs from "node:fs";

const MINJUNG = "tc-minjung";
// 우렁각시 새 구성 — 까닭은 아래 주석대로.
const UREONG = {
  narration: MINJUNG,
  farmer: "tc-seojoon",      // 서글서글한 젊은 목소리 — 혼잣말이 많은 외로운 농부. 희준은 소년에 가까워 혼자 농사짓는 어른으로는 어렸다.
  snail: "tc-chungah",       // 맑고 청아한 목소리 — 용왕의 딸. 아직 어느 책에도 안 쓴 목소리라 각시가 처음 듣는 사람처럼 들린다.
  magistrate: "tc-mckong",   // 능글맞은 중년 — 큰소리로 내기를 걸다 물에 빠져 싹싹 비는 낙차가 이 책의 웃음이다.
  dragonking: "tc-wangkwon", // 위엄 있는 중년 — 별주부전 용왕과 같은 목소리라 '용왕님'이 책을 건너 이어진다(그대로 둔다).
  crowd: "tc-miso",          // 미소 가득한 엄마 — 12쪽 소문 한 줄. 나레이터가 읽으면 지문에 묻힌다.
};

const FILES = { classic: "src/data/classic-books.json", folk: "src/data/folk-books.json" };
const data = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, JSON.parse(fs.readFileSync(f, "utf8"))]));
const all = [...data.classic, ...data.folk];

const changed = [];
for (const b of all) {
  if (!b.voiceCast) continue;
  const old = b.narrator;
  if (b.id === "folk-ureong") {
    const before = { ...b.voiceCast };
    b.voiceCast = { ...b.voiceCast, ...UREONG };
    b.narrator = MINJUNG;
    b.narrators = [MINJUNG];
    changed.push(`${b.title}: 전체 재설계 ${Object.entries(UREONG).filter(([k, v]) => before[k] !== v).map(([k, v]) => `${k} ${before[k]}→${v}`).join(", ")}`);
    continue;
  }
  if (old === MINJUNG) continue;
  // 나레이터 목소리를 함께 쓰던 배역(마을 사람들 같은 것)도 같이 옮긴다.
  const moved = Object.entries(b.voiceCast).filter(([r, v]) => r !== "narration" && v === old).map(([r]) => r);
  for (const r of moved) b.voiceCast[r] = MINJUNG;
  b.voiceCast.narration = MINJUNG;
  b.narrator = MINJUNG;
  b.narrators = [MINJUNG];
  changed.push(`${b.title}: 나레이션 ${old}→${MINJUNG}${moved.length ? ` (배역 ${moved.join(",")}도 함께)` : ""}`);
}
for (const [k, f] of Object.entries(FILES)) fs.writeFileSync(f, JSON.stringify(data[k], null, 2) + "\n");

// 굽는 스크립트의 책 목록(BOOKS)도 같은 값으로 맞춘다 — 여기가 어긋나면 옛 나레이터로 다시 굽는다.
const P = "scripts/bake-cast-narration.mts";
let src = fs.readFileSync(P, "utf8");
const specTitles = ["빨간 모자", "인어 공주", "토끼의 재판", "청개구리", "상길이놈과 박서방", "우렁각시", "도깨비 감투"];
for (const title of specTitles) {
  const at = src.indexOf(`"${title}": {`);
  if (at < 0) { console.log(`  ! 굽기 설정에서 ${title} 못 찾음`); continue; }
  const end = src.indexOf("},", at);
  const block = src.slice(at, end);
  const fixed = block
    .replace(/narrators: \[[^\]]*\]/, `narrators: ["${MINJUNG}"]`)
    .replace(/defaultNarrator: "[^"]*"/, `defaultNarrator: "${MINJUNG}"`);
  src = src.slice(0, at) + fixed + src.slice(end);
}
src = src.replace(
  '  "우렁각시": {',
  '  // 2026-09-20 저녁 재설계(사장님이 "성우 구성을 다시 짜 달라"): 나레이션 민정 · 농부 서준 ·\n' +
  '  // 우렁각시 청아 · 사또 MC콩 · 용왕 왕권(그대로) · 마을 사람들 미소.\n' +
  '  "우렁각시": {',
);
fs.writeFileSync(P, src);

console.log(changed.map((c) => "  " + c).join("\n"));
console.log(`책 ${changed.length}권 갱신 · 굽기 설정도 민정으로 맞춤`);
