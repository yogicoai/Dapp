/**
 * 가족 사진관 배경 고르기 칸의 작은 그림을 만든다 — public/family-studio/bg/<slug>.webp (320×180, webp 72).
 *
 *   node scripts/family-studio-thumbs.mts          # 작은 그림이 없는 배경만
 *   node scripts/family-studio-thumbs.mts --all    # 전부 다시
 *
 * 목록은 src/lib/family-studio-catalog.ts STUDIO_BACKGROUNDS. 원본(cafe24 src)을 받아 사진과 같은 자리
 * (가로 가운데·세로 70% — STUDIO_BG_POSITION)로 잘라 줄인다. 돈 드는 API 는 부르지 않는다(cafe24 그림 받기만).
 * 사장님 전용 가족사진 배경(fp-…)을 목록에 넣은 뒤 한 번 돌리면 된다.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { STUDIO_BACKGROUNDS } from "../src/lib/family-studio-catalog.ts";

const OUT = "public/family-studio/bg";
const W = 320;
const H = 180;
const all = process.argv.includes("--all");

fs.mkdirSync(OUT, { recursive: true });
let made = 0;
for (const b of STUDIO_BACKGROUNDS) {
  const file = path.join(OUT, `${b.slug}.webp`);
  if (!all && fs.existsSync(file)) continue;
  const res = await fetch(b.src);
  if (!res.ok) {
    console.error(`✗ ${b.slug}: ${res.status}`);
    process.exitCode = 1;
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(buf).metadata();
  if (!meta.width || !meta.height) throw new Error(`${b.slug}: 크기를 못 읽음`);
  // object-cover + object-position 50% 70% 와 같은 자르기
  const scale = Math.max(W / meta.width, H / meta.height);
  const sw = Math.round(meta.width * scale);
  const sh = Math.round(meta.height * scale);
  await sharp(buf)
    .resize(sw, sh)
    .extract({ left: Math.round((sw - W) / 2), top: Math.round((sh - H) * 0.7), width: W, height: H })
    .webp({ quality: 72 })
    .toFile(file);
  made++;
  console.log(`✓ ${b.slug}`);
}
console.log(`작은 그림 ${made}장 만듦 (${OUT})`);
