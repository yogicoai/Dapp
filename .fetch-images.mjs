import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

// 인자: <출력디렉터리> <쪽번호>=<URL> ...
const [, , outDir, ...pairs] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
let ok = 0, fail = 0;
for (const pair of pairs) {
  const i = pair.indexOf("=");
  const page = pair.slice(0, i), url = pair.slice(i + 1);
  const out = path.join(outDir, `p${page}.webp`);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    // 원본 1536x2752 -> 폭 1080으로 줄이고 webp로. 기존 책 이미지와 같은 형식.
    await sharp(buf).resize({ width: 1080 }).webp({ quality: 82 }).toFile(out);
    const kb = Math.round(fs.statSync(out).size / 1024);
    console.log(`  p${page}: ${kb}KB`);
    ok++;
  } catch (e) {
    console.log(`  p${page}: 실패 ${e.message}`);
    fail++;
  }
}
console.log(`완료 ${ok}장 / 실패 ${fail}장`);
