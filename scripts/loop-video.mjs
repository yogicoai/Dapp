/**
 * 움직이는 삽화를 끊김 없는 반복으로 만든다.
 *
 *   node scripts/loop-video.mjs <원본.mp4> <결과.mp4> [겹칠초=0.8]
 *
 * 왜 필요하나 — 5초 영상을 그냥 반복하면 끝 장면에서 첫 장면으로 휙 튄다.
 * 끝의 D초 동안 처음 D초를 서서히 겹쳐서, 마지막 장면이 곧 첫 장면이 되게 한다.
 *
 *   원본   0 ──D────────────── T
 *   본체      D ────────────── T      (처음 D초를 잘라 냄)
 *   머리   0──D                       (잘라 낸 것을 본체 끝 D초 위에 서서히 겹침)
 *   결과      D ─────────── T-D 에서 머리가 다 올라와 원본 D 장면 = 결과 첫 장면
 *
 * 그래서 결과 길이는 T-D 초다. 첫 장면이 그림(포스터)에서 D초만큼 움직인 상태로
 * 시작하므로, 움직임이 잔잔한 장면일수록 D 를 작게 잡는다.
 */
import { execFileSync } from "node:child_process";

const [src, out, dArg] = process.argv.slice(2);
if (!src || !out) {
  console.log("node scripts/loop-video.mjs <원본.mp4> <결과.mp4> [겹칠초=0.8]");
  process.exit(1);
}
const D = Number(dArg ?? 0.8);

const probe = JSON.parse(execFileSync("ffprobe", [
  "-v", "error", "-select_streams", "v:0",
  "-show_entries", "stream=width,height,r_frame_rate:format=duration", "-of", "json", src,
]).toString());
const T = Number(probe.format.duration);
if (!(T > 2 * D)) throw new Error(`영상이 너무 짧습니다 (${T}s) — 겹칠 ${D}s 의 두 배보다 길어야 합니다`);

const filter = [
  `[0:v]split[a][b]`,
  `[a]trim=start=${D},setpts=PTS-STARTPTS[main]`,
  `[b]trim=end=${D},setpts=PTS-STARTPTS,format=yuva420p,` +
    `fade=t=in:st=0:d=${D}:alpha=1,setpts=PTS+${(T - 2 * D).toFixed(3)}/TB[head]`,
  `[main][head]overlay=eof_action=pass,scale=1184:864:flags=lanczos,format=yuv420p[v]`,
].join(";");

execFileSync("ffmpeg", [
  "-y", "-v", "error", "-i", src,
  "-filter_complex", filter, "-map", "[v]", "-an",
  "-c:v", "libx264", "-preset", "slow", "-crf", "23",
  "-movflags", "+faststart", "-pix_fmt", "yuv420p",
  out,
], { stdio: "inherit" });

const outDur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out]).toString());
const kb = Math.round(Number(execFileSync("node", ["-e", `console.log(require("fs").statSync(${JSON.stringify(out)}).size)`]).toString()) / 1024);
console.log(`${src.split(/[\\/]/).pop()} ${T.toFixed(2)}s → ${out.split(/[\\/]/).pop()} ${outDur.toFixed(2)}s · ${kb}KB · 겹침 ${D}s`);
