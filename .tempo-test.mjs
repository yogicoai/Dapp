import fs from "node:fs";
import { execFileSync } from "node:child_process";
const S = "C:/Users/WeMA1/AppData/Local/Temp/claude/c--Users-WeMA1-Desktop-Dong/af71a827-e7c4-4a71-be41-d25cc64de422/scratchpad";
const T = "빛 속에서 아름다운 여인이 나타났어요. 여인은 익숙한 듯 콧노래를 부르며 집을 쓸고 닦기 시작했지요.";
const syl = T.match(/[가-힣]/g).length;
for (const [name, voiceId] of [["jinseo", "tc_65bb3a1976b69213594357fc"], ["hyemin", "tc_667ce80314cb3a612d6959e8"], ["minjung", "tc_6699eb0f10b8e361d6a9aba1"]]) {
  for (const tempo of name === "minjung" ? [1] : [1, 0.9, 0.8]) {
    const r = await fetch("http://localhost:3000/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: T, voiceId, model: "ssfm-v30", tempo }) });
    const f = `${S}/t-${name}-${tempo}.mp3`;
    fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
    const d = parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());
    console.log(`${name.padEnd(8)} tempo ${tempo}: ${d.toFixed(2)}s → ${(syl / d).toFixed(2)} 음절/초`);
  }
}
