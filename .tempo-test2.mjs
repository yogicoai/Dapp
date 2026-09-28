import fs from "node:fs";
import { execFileSync } from "node:child_process";
const S = "C:/Users/WeMA1/AppData/Local/Temp/claude/c--Users-WeMA1-Desktop-Dong/af71a827-e7c4-4a71-be41-d25cc64de422/scratchpad";
const NARR = "빛 속에서 아름다운 여인이 나타났어요. 여인은 익숙한 듯 콧노래를 부르며 집을 쓸고 닦기 시작했지요.";
const LINE = "어머, 이게 다 뭐예요? 오늘은 정말 신기한 일이 많이 생기는 날이네요!";
const V = { gahee: "tc_624ccc04adcd568510764d3f" };
async function rate(name, text, tempo) {
  const r = await fetch("http://localhost:3000/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, voiceId: V[name], model: "ssfm-v30", tempo }) });
  const f = `${S}/t2-${name}-${tempo}.mp3`;
  fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
  const d = parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());
  return (text.match(/[가-힣]/g).length / d).toFixed(2);
}


for (const n of ["gahee"]) {
  const out = [];
  for (const t of [1, 0.9, 0.85]) out.push(`${t}→${await rate(n, LINE, t)}`);
  console.log(n.padEnd(8), out.join("  "));
}
