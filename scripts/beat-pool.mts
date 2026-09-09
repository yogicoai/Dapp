/** 어떤 뼈대가 뽑힐 수 있나 — 이야기 갈래·쪽수·나이별 후보 목록. API 안 쓴다. */
import { BEAT_TEMPLATES } from "../src/lib/story-beats";
const age = Number(process.argv[2] ?? 5);
for (const pages of [5, 6]) {
  const pool = BEAT_TEMPLATES.filter(
    (t) => t.kinds.includes("today") && t.minPages <= pages && age >= t.ages[0] && age <= t.ages[1],
  );
  console.log(`\n=== 오늘 이야기 · ${pages}장 · ${age}세 → 후보 ${pool.length}개 (각 ${(100 / pool.length).toFixed(0)}%) ===`);
  for (const t of pool) console.log(`  ${t.id.padEnd(24)} ${t.label.padEnd(12)} 첫 장면: ${t.beats[0].guide.slice(0, 50)}`);
}
