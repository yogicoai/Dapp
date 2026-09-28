import fs from "node:fs";
import sharp from "sharp";
const SRC = process.argv[2], OUT = process.argv[3], pages = process.argv[4].split(",");
fs.mkdirSync(OUT, { recursive: true });
const files = {}; for (const f of fs.readdirSync(SRC)) { const m = f.match(/^(p\d+)\.(png|jpe?g)$/i); if (m) files[m[1]] = f; }
for (const p of pages) {
  const base = await sharp(`${SRC}/${files[p]}`).resize({ width: 1000 }).toBuffer();
  const { width: W, height: H } = await sharp(base).metadata();
  let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
  for (let k = 50; k < 1000; k += 50) {
    const strong = k % 100 === 0, x = (k / 1000) * W, y = (k / 1000) * H;
    const st = strong ? 'stroke="#ff0044" stroke-opacity="0.75" stroke-width="1.5"' : 'stroke="#00ffff" stroke-opacity="0.45" stroke-width="1"';
    svg += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" ${st}/><line x1="0" y1="${y}" x2="${W}" y2="${y}" ${st}/>`;
    if (strong) {
      svg += `<text x="${x + 2}" y="14" font-size="13" font-family="Arial" font-weight="bold" fill="#ff0044" stroke="#fff" stroke-width="3" paint-order="stroke">${k}</text>`;
      svg += `<text x="2" y="${y - 3}" font-size="13" font-family="Arial" font-weight="bold" fill="#ff0044" stroke="#fff" stroke-width="3" paint-order="stroke">${k}</text>`;
    }
  }
  svg += `</svg>`;
  await sharp(base).composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 80 }).toFile(`${OUT}/${p}-grid.jpg`);
  console.log(`${p}: ${W}x${H}`);
}
