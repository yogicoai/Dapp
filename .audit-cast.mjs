import fs from "node:fs";
const { voices: V, books } = JSON.parse(fs.readFileSync("C:/Users/WeMA1/AppData/Local/Temp/claude/c--Users-WeMA1-Desktop-Dong/af71a827-e7c4-4a71-be41-d25cc64de422/scratchpad/audit.json", "utf8"));
const FEMALE = /엄마|어머니|어멈|할머니|공주|아내|며느리|마녀|언니|누이|누나|직녀|선녀|콩쥐|팥쥐|새어머니|여왕|왕비|각시|아주머니|딸|소녀|도로시|그레텔|빨간 모자|형수|암탉|엄마 오리|숙녀|부인/;
const MALE = /아빠|아버지|할아버지|영감|임금|왕자|왕$|오빠|형$|형님|아우|농부|나무꾼|선비|사또|원님|도둑|거인$|남편|아저씨|소년|잭|헨젤|걸리버|모글리|흥부|놀부|견우|신하|재봉사|이장|양반|박상길|사냥꾼|노인|막내$|첫째|둘째|서방|아들|오즈|허수아비|나무꾼|복두장이|용왕|산신령/;
const CHILD = /아이|아기|꼬마|소년|소녀|막내|어린|동생|헨젤|그레텔|도로시|잭|모글리|아이들|형제들/;
const OLD = /할머니|할아버지|영감|노인|산신령|임금|용왕/;
const gOf = (d = "") => /여자|여성/.test(d) ? "F" : /남자|남성/.test(d) ? "M" : "?";
const kidV = (d = "") => /어린이|아이|소녀|소년|아기/.test(d);
const flags = [];
for (const b of books) {
  const names = {};
  for (const [ko, role] of Object.entries(b.roleOf)) (names[role] ??= []).push(ko);
  const used = {};
  const lineCount = {};
  for (const it of b.items) if (it.kind !== "narr") lineCount[it.role] = (lineCount[it.role] || 0) + 1;
  const rows = [];
  for (const [role, v] of Object.entries(b.voiceCast)) {
    const ko = (names[role] || [role]).join("/");
    const d = V[v]?.desc || "?";
    rows.push(`    ${role.padEnd(13)} ${ko.slice(0, 22).padEnd(22)} → ${(V[v]?.label || v).padEnd(7)} (${d})  대사 ${lineCount[role] || 0}`);
    if (role !== "narration" && role !== "crowd" && lineCount[role]) (used[v] ??= []).push(ko);
    const g = gOf(d), n = ko;
    if (role === "narration" || role === "crowd") continue;
    if (FEMALE.test(n) && !MALE.test(n) && g === "M") flags.push(`[성별] ${b.title}: ${n} ← ${V[v]?.label} (${d})`);
    if (MALE.test(n) && !FEMALE.test(n) && g === "F") flags.push(`[성별] ${b.title}: ${n} ← ${V[v]?.label} (${d})`);
    if (OLD.test(n) && kidV(d)) flags.push(`[나이] ${b.title}: ${n} ← ${V[v]?.label} (${d})`);
  }
  // 나레이터가 대사 있는 배역도 맡는 경우 / 대사 있는 두 배역이 같은 성우
  const nar = b.narrator;
  for (const [v, who] of Object.entries(used)) {
    if (v === nar) flags.push(`[나레이터 겸역] ${b.title}: 나레이터 ${V[v]?.label} 가 ${who.join(", ")} 도 연기`);
    if (who.length > 1) flags.push(`[한 목소리 두 배역] ${b.title}: ${V[v]?.label} ← ${who.join(" + ")}`);
  }
  console.log(`■ ${b.title}${b.hidden ? " (숨김)" : ""}  나레이터 ${b.narrators.map((x) => V[x]?.label).join(",")}\n${rows.join("\n")}`);
}
console.log("\n==== 자동 경고 ====");
for (const f of flags) console.log("  " + f);
