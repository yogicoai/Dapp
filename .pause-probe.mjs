import fs from "node:fs";
import { execFileSync } from "node:child_process";
const S = "C:/Users/WeMA1/AppData/Local/Temp/claude/c--Users-WeMA1-Desktop-Dong/af71a827-e7c4-4a71-be41-d25cc64de422/scratchpad";
const sil = (f) => {
  const out = execFileSync("ffmpeg", ["-hide_banner", "-i", f, "-af", "silencedetect=noise=-38dB:d=0.12", "-f", "null", "-"], { stdio: ["ignore", "pipe", "pipe"] }).toString() + "";
  return out;
};
function gaps(f) {
  let err = "";
  try { execFileSync("ffmpeg", ["-hide_banner", "-i", f, "-af", "silencedetect=noise=-38dB:d=0.12", "-f", "null", "-"], { stdio: ["ignore", "ignore", "pipe"] }); } catch (e) { err = String(e.stderr); }
  const r = require_gaps(f);
  return r;
}
function require_gaps(f) {
  const res = (() => { try { return execFileSync("ffmpeg", ["-hide_banner", "-nostats", "-i", f, "-af", "silencedetect=noise=-38dB:d=0.12", "-f", "null", "-"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); } catch (e) { return String(e.stdout) + String(e.stderr); } })();
  return res;
}
// ffmpeg writes silencedetect to stderr — capture via spawnSync
import { spawnSync } from "node:child_process";
function silences(f) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", f, "-af", "silencedetect=noise=-38dB:d=0.12", "-f", "null", "-"], { encoding: "utf8" });
  const s = r.stderr;
  const out = [];
  for (const m of s.matchAll(/silence_end: ([0-9.]+) \| silence_duration: ([0-9.]+)/g)) out.push(`${(+m[1] - +m[2]).toFixed(2)}~${(+m[1]).toFixed(2)}s(${(+m[2]).toFixed(2)})`);
  const d = s.match(/Duration: (\d+):(\d+):([0-9.]+)/);
  return { dur: d ? (+d[2]) * 60 + +d[3] : null, out };
}
const T = "농부는 일하러 가는 척하고\n돌아와 담 뒤에 몰래 숨었어요.\n그런데 그때, 부엌 항아리가\n번쩍— 하고 빛나는 거예요!";
console.log("원고:", JSON.stringify(T));
const baked = "public/folk/ureong/seg-tc-jinseo-p7-0.mp3";
console.log("구운 파일(현재)", JSON.stringify(silences(baked)));
const VARIANTS = {
  newline: T,
  comma: T.replace(/([^.,!?…~—'"」』])\n/g, "$1,\n"),
};
for (const [k, text] of Object.entries(VARIANTS)) {
  const r = await fetch("http://localhost:3000/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, voiceId: "tc_65bb3a1976b69213594357fc", model: "ssfm-v30", tempo: 0.8 }) });
  const f = `${S}/pause-${k}.mp3`;
  fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
  console.log(k.padEnd(8), JSON.stringify(text.replace(/\n/g, "⏎")), JSON.stringify(silences(f)));
}
