/**
 * Typecast 에서 쓸 수 있는 남자아이 목소리를 찾는다 — 읽기만 한다(무과금).
 * 양치기 소년은 감정 폭이 커서(심심함·장난·외침·울먹임·뉘우침)
 * 감정을 많이 내는 ssfm-v30 목소리라야 한다.
 */
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const res = await fetch("https://api.typecast.ai/v2/voices", {
  headers: { "X-API-KEY": process.env.TYPECAST_API_KEY },
});
if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
const data = await res.json();
const arr = Array.isArray(data) ? data : (data.result ?? []);
console.log(`전체 목소리 ${arr.length}개\n`);

// 이미 등록해 쓰는 것
const mine = new Set([...readFileSync("src/lib/voices.ts", "utf8").matchAll(/voiceId:\s*"(tc_[a-f0-9]+)"/g)].map((m) => m[1]));

const rows = [];
for (const v of arr) {
  const models = Array.isArray(v.models) ? v.models : [];
  const v30 = models.find((m) => m.version === "ssfm-v30");
  const emo = (v30?.emotions ?? models[0]?.emotions ?? []);
  rows.push({
    id: v.voice_id ?? v.id,
    name: v.voice_name ?? v.name ?? "",
    gender: v.gender ?? "",
    age: v.age ?? "",
    v30: !!v30,
    emo: Array.isArray(emo) ? emo : [],
    mine: mine.has(v.voice_id ?? v.id),
  });
}

// 남자 아이
const boys = rows.filter((r) => /child|kid|youth/i.test(String(r.age)) && /male|man|남/i.test(String(r.gender)) && !/female|woman|여/i.test(String(r.gender)));
console.log(`=== 남자 어린이 (${boys.length}명) ===`);
for (const r of boys.sort((a, b) => b.emo.length - a.emo.length)) {
  console.log(`  ${String(r.name).padEnd(16)} ${r.v30 ? "v30" : "구모델"}  감정 ${String(r.emo.length).padStart(2)}개  ${r.mine ? "[이미 씀]" : ""}  ${r.emo.slice(0, 8).join(",")}`);
  console.log(`      ${r.id}`);
}

if (!boys.length) {
  console.log("(나이·성별 칸으로 못 걸렀다 — 전체에서 감정 많은 순으로 상위 25개를 보여 준다)");
  for (const r of rows.sort((a, b) => b.emo.length - a.emo.length).slice(0, 25)) {
    console.log(`  ${String(r.name).padEnd(18)} ${String(r.gender).padEnd(8)} ${String(r.age).padEnd(10)} ${r.v30 ? "v30" : "구"} 감정 ${String(r.emo.length).padStart(2)} ${r.mine ? "[씀]" : ""}  ${r.emo.slice(0, 7).join(",")}`);
    console.log(`      ${r.id}`);
  }
}
