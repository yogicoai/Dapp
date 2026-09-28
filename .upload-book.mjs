import fs from "node:fs";
import sharp from "sharp";
for (const line of fs.readFileSync(".env.local","utf8").split(/\r?\n/)){const m=line.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2];}
const { uploadToCafe24 } = await import("./src/lib/cafe24.ts");
// node .upload-book.mjs <그림 폴더> <cafe24 하위 경로> <쪽수> <결과 json> [p13=p13.png ...]
const [,, SRC, REMOTE, N, OUT, ...pins] = process.argv;
const files = {};
for (const f of fs.readdirSync(SRC)) { const m = f.match(/^(p\d+|cover)\.(png|jpe?g|webp)$/i); if (m) (files[m[1]] ??= []).push(f); }
for (const pin of pins) { const [k, v] = pin.split("="); files[k] = [v]; }
const urls = {};
for (const key of ["cover", ...Array.from({ length: +N }, (_, i) => `p${i + 1}`)]) {
  const cand = files[key];
  if (!cand) throw new Error(`${key} 없음`);
  if (cand.length > 1) throw new Error(`${key} 후보가 여럿: ${cand} — 핀으로 골라 주세요`);
  const buf = await sharp(`${SRC}/${cand[0]}`).resize({ width: 1448, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  const { url } = await uploadToCafe24(`${REMOTE}/${key}.webp`, buf);
  urls[key] = `${url}?v=1`;
  console.log(`  ${key.padEnd(5)} ${cand[0].padEnd(9)} ${(buf.length / 1024) | 0}KB`);
}
fs.writeFileSync(OUT, JSON.stringify(urls, null, 1));
console.log(`${REMOTE} 업로드 ${Object.keys(urls).length}장 완료`);
