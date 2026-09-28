import fs from "node:fs";
import sharp from "sharp";
const [,, dataPath, bookId, srcDir, out] = process.argv;
const book = JSON.parse(fs.readFileSync(dataPath, "utf8")).find((b) => b.id === bookId);
const files = {}; for (const f of fs.readdirSync(srcDir)) { const m = f.match(/^(p\d+)\.(png|jpe?g)$/i); if (m && !files[m[1]]) files[m[1]] = f; }
const COLORS = ["#ff2d55", "#00c7ff", "#ffd60a", "#30d158"];
const tiles = [];
for (const [idx, p0] of book.pages.entries()) {
  const p = { ...p0, n: p0.n ?? idx + 1 }; // 옛 책은 쪽 번호가 없어 차례가 곧 쪽이다
  if (!p.hotspots?.length) continue;
  const base = await sharp(`${srcDir}/${files["p" + p.n]}`).resize({ width: 480, height: 360, fit: "fill" }).toBuffer();
  let svg = `<svg width="480" height="360" xmlns="http://www.w3.org/2000/svg">`;
  p.hotspots.forEach((h, i) => {
    const [t, l, b, r] = h.box, c = COLORS[i % 4];
    svg += `<rect x="${l * 0.48}" y="${t * 0.36}" width="${(r - l) * 0.48}" height="${(b - t) * 0.36}" fill="${c}" fill-opacity="0.18" stroke="${c}" stroke-width="3"/>`;
    svg += `<text x="${l * 0.48 + 4}" y="${t * 0.36 + 16}" font-size="15" font-family="Arial" font-weight="bold" fill="${c}" stroke="#000" stroke-width="3" paint-order="stroke">${h.label}</text>`;
  });
  svg += `<text x="6" y="352" font-size="20" font-family="Arial" font-weight="bold" fill="#fff" stroke="#000" stroke-width="4" paint-order="stroke">p${p.n}</text></svg>`;
  tiles.push(await sharp(base).composite([{ input: Buffer.from(svg) }]).png().toBuffer());
}
const cols = 3, rows = Math.ceil(tiles.length / cols);
await sharp({ create: { width: 480 * cols, height: 360 * rows, channels: 3, background: "#222" } })
  .composite(tiles.map((input, i) => ({ input, left: (i % cols) * 480, top: Math.floor(i / cols) * 360 })))
  .jpeg({ quality: 78 }).toFile(out);
console.log(`${tiles.length}쪽 → ${out}`);
