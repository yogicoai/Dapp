/**
 * 힉스필드 결과 영상(원격 URL)을 받아 앱에 붙인다.
 *
 *   node scripts/ingest-hf-videos.mjs <목록.json> [--dry]
 *
 * 목록.json = [{ title, n, url }]
 *
 * 한 편마다:
 *   1) 받는다 — 원격 mp4 를 임시 폴더로.
 *   2) 이음매 검사 — 첫 장면과 끝 장면이 얼마나 다른지 잰다. 시작=끝 그림을
 *      같은 걸 줬으니 대개 거의 같지만, 모델이 살짝 흔들리면 scripts/loop-video.mjs 로
 *      끝을 처음에 겹쳐 이음매를 없앤다.
 *   3) public/<root>/<dir>/pN.mp4 로 두고 책의 video 칸에 연결한다.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const [listPath, ...rest] = process.argv.slice(2);
const DRY = rest.includes("--dry");
if (!listPath) {
  console.log("node scripts/ingest-hf-videos.mjs <목록.json> [--dry]");
  process.exit(1);
}
const list = JSON.parse(fs.readFileSync(listPath, "utf8"));

const FILES = { folk: "src/data/folk-books.json", classic: "src/data/classic-books.json" };
const data = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, JSON.parse(fs.readFileSync(f, "utf8"))]));
const find = (title) => {
  for (const k of Object.keys(data)) {
    const b = data[k].find((x) => x.title === title);
    if (b) return { root: k, book: b };
  }
  throw new Error(`책을 못 찾음: ${title}`);
};
const dirOf = (b) => b.pages.find((p) => p.image)?.image.match(/dapp\/(?:folk|classic)\/([^/]+)\//)?.[1]
  ?? b.pages.find((p) => p.image)?.image.match(/dapp\/books\/(?:folk|classic)\/([^/]+)\//)?.[1];

/** 두 장면의 평균 밝기 차이(0~255). 64x48 흑백으로 줄여 비교한다. */
function frameDiff(a, b) {
  const grab = (args) => execFileSync("ffmpeg", ["-v", "error", ...args, "-vf", "scale=64:48,format=gray", "-frames:v", "1", "-f", "rawvideo", "-"]);
  const x = grab(a), y = grab(b);
  let s = 0;
  for (let i = 0; i < x.length; i++) s += Math.abs(x[i] - y[i]);
  return s / x.length;
}
const dur = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "hfvid-"));
const touched = new Set();
let ok = 0, fail = 0;

for (const { title, n, url } of list) {
  const { root, book } = find(title);
  const page = book.pages[n - 1];
  if (!page) { console.log(`✗ ${title} ${n}쪽 — 그런 쪽 없음`); fail++; continue; }
  const dir = dirOf(book);
  if (!dir) { console.log(`✗ ${title} — 그림 폴더를 못 찾음`); fail++; continue; }
  const outRel = `/${root}/${dir}/p${n}.mp4`;
  const out = `public${outRel}`;

  try {
    const raw = path.join(TMP, `${root}-${dir}-p${n}.mp4`);
    execFileSync("curl", ["-sSfL", url, "-o", raw]);
    const seam = frameDiff(["-ss", "0", "-i", raw], ["-sseof", "-0.05", "-i", raw]);
    const needLoop = seam > 6; // 6 이하면 눈으로 이음매가 안 보인다
    console.log(`${title} ${n}쪽 → ${outRel}  이음매 ${seam.toFixed(1)}${needLoop ? " → 겹쳐 잇기" : ""}`);
    if (DRY) continue;

    fs.mkdirSync(path.dirname(out), { recursive: true });
    if (needLoop) {
      execFileSync("node", ["scripts/loop-video.mjs", raw, out, "0.8"], { stdio: "pipe" });
    } else {
      execFileSync("ffmpeg", ["-y", "-v", "error", "-i", raw, "-an",
        "-vf", "scale=1184:864:flags=lanczos,format=yuv420p",
        "-c:v", "libx264", "-preset", "slow", "-crf", "23", "-movflags", "+faststart", out]);
    }
    page.video = outRel;
    touched.add(root);
    ok++;
    console.log(`   ✓ ${(fs.statSync(out).size / 1024).toFixed(0)}KB · ${dur(out).toFixed(2)}s`);
  } catch (e) {
    fail++;
    console.log(`   ✗ ${e.message?.slice(0, 200) ?? e}`);
  }
}

if (!DRY) for (const k of touched) fs.writeFileSync(FILES[k], JSON.stringify(data[k], null, 2) + "\n", "utf8");
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n성공 ${ok} · 실패 ${fail}${DRY ? " (--dry, 아무것도 안 바꿈)" : ` · 책 연결: ${[...touched].join(", ") || "없음"}`}`);
