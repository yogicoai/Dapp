/**
 * 소리가 깨지는지(찌그러짐) 잰다 — ffmpeg 의 astats 로 최대치에 붙은 표본 수를 본다.
 * 0dB 에 닿은 표본(clipping)이 많을수록 "지직" 하고 깨져 들린다.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

function stats(file) {
  let out = "";
  try {
    execFileSync("ffmpeg",
      ["-hide_banner", "-nostats", "-i", file, "-af", "astats=metadata=1:reset=0", "-f", "null", "-"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    out = String(e.stderr ?? "");
  }
  if (!out) {
    const r = execFileSync("ffmpeg",
      ["-hide_banner", "-nostats", "-i", file, "-af", "astats=metadata=1:reset=0", "-f", "null", "-"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], });
    out = String(r ?? "");
  }
  const pick = (re) => { const m = out.match(re); return m ? Number(m[1]) : null; };
  return {
    peakDb: pick(/Peak level dB:\s*(-?[\d.]+|inf)/),
    rmsDb: pick(/RMS level dB:\s*(-?[\d.]+)/),
    flat: pick(/Flat factor:\s*([\d.]+)/),          // 최대치에 눌러붙은 정도
    clipped: pick(/Number of clipped samples:\s*(\d+)/),
    crest: pick(/Crest factor:\s*([\d.]+)/),
  };
}

const pairs = process.argv.slice(2).map((s) => s.split("="));
console.log("파일".padEnd(22) + "최고(dB)".padEnd(10) + "평균(dB)".padEnd(10) + "눌러붙음".padEnd(10) + "깨진 표본");
for (const [label, file] of pairs) {
  if (!existsSync(file)) { console.log(`${label.padEnd(22)}(파일 없음)`); continue; }
  try {
    const s = stats(file);
    console.log(
      label.padEnd(22) +
      String(s.peakDb ?? "-").padEnd(10) +
      String(s.rmsDb ?? "-").padEnd(10) +
      String(s.flat ?? "-").padEnd(10) +
      String(s.clipped ?? "-"),
    );
  } catch (e) {
    console.log(`${label.padEnd(22)}잴 수 없음: ${String(e.message).slice(0, 60)}`);
  }
}
