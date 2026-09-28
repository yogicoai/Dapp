import fs from "node:fs";
import sharp from "sharp";
for (const line of fs.readFileSync(".env.local","utf8").split(/\r?\n/)){const m=line.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2];}
const { uploadToCafe24 } = await import("./src/lib/cafe24.ts");
const SRC = "C:/Users/WeMA1/Desktop/Desktop/우렁각시";
const files = {};
for (const f of fs.readdirSync(SRC)) { const m=f.match(/^(p\d+|cover)\.(png|jpe?g|webp)$/i); if(m) files[m[1]]=f; }
const urls = {};
for (const key of ["cover", ...Array.from({length:18},(_,i)=>`p${i+1}`)]) {
  if (!files[key]) throw new Error(`${key} 없음`);
  const buf = await sharp(`${SRC}/${files[key]}`).resize({ width: 1448, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  const meta = await sharp(buf).metadata();
  const { url } = await uploadToCafe24(`folk/ureong/${key}.webp`, buf);
  urls[key] = `${url}?v=1`;
  console.log(`  ${key.padEnd(5)} ${files[key].padEnd(9)} ${meta.width}x${meta.height} ${(buf.length/1024|0)}KB -> ${url}`);
}
fs.writeFileSync("C:/Users/WeMA1/AppData/Local/Temp/claude/c--Users-WeMA1-Desktop-Dong/af71a827-e7c4-4a71-be41-d25cc64de422/scratchpad/ureong-urls.json", JSON.stringify(urls, null, 1));
console.log("업로드 19장 완료");
