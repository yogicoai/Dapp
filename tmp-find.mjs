import fs from "node:fs";
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const res = await fetch("https://api.typecast.ai/v2/voices", {
  headers: { "X-API-KEY": process.env.TYPECAST_API_KEY },
});
if (!res.ok) { console.log("실패", res.status, (await res.text()).slice(0, 200)); process.exit(1); }
const list = await res.json();
const arr = Array.isArray(list) ? list : (list.voices ?? list.data ?? []);
fs.writeFileSync(process.argv[2] + "/tc-all.json", JSON.stringify(arr, null, 1), "utf8");
console.log("전체", arr.length, "개");
const nameOf = (v) => v.voice_name ?? v.name ?? "";
// 민정 · Minjeong · Min Jeong · MinJung … 표기가 갈릴 수 있어 넓게 훑는다
const pat = /민정|min\s*-?\s*je?o?u?ng/i;
const hit = arr.filter((v) => pat.test(nameOf(v)) || pat.test(JSON.stringify(v)));
console.log("찾음", hit.length, "개");
for (const v of hit) console.log(JSON.stringify(v));
