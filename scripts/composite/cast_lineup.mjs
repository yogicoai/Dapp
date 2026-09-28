/**
 * 등장인물 한 줄 세운 판 — 장면을 통째로 그릴 때 '누가 누군지'와 '실제 키 비율'을 알려 주는 참조.
 *
 *   node scripts/composite/cast_lineup.mjs <출력.png> <포즈폴더>:<자세>:<키cm> ...
 *
 * 모두 같은 cm당 픽셀로 세운다 — 아이 110cm 와 어른 162cm 가 실제 비율대로 보인다.
 * 글자는 넣지 않는다(참조 그림의 글자가 결과에 새어 나온다).
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const [out, ...specs] = process.argv.slice(2);
const PX_PER_CM = 5;       // 170cm → 850px
const GAP = 60, PAD = 60;

const items = [];
for (const s of specs) {
  // 경로에 'C:' 가 있으니 뒤에서부터 나눈다: <경로>:<자세>:<키>
  const parts = s.split(":");
  const cm = parts.pop(), pose = parts.pop(), dir = parts.join(":");
  const poses = JSON.parse(fs.readFileSync(path.join(dir, "poses.json"), "utf8"));
  const ref = poses.find((p) => p.ref) ?? poses[0];
  const p = poses.find((q) => q.i === Number(pose));
  // 서 있는 기준 자세(ref)의 키를 실제 키에 맞추고, 같은 배율을 고른 자세에 쓴다.
  const k = (Number(cm) * PX_PER_CM) / ref.h;
  const buf = await sharp(path.join(dir, p.file)).resize(Math.round(p.w * k), Math.round(p.h * k)).png().toBuffer();
  const m = await sharp(buf).metadata();
  items.push({ buf, w: m.width, h: m.height });
}
const W = PAD * 2 + items.reduce((s, i) => s + i.w, 0) + GAP * (items.length - 1);
const H = PAD * 2 + Math.max(...items.map((i) => i.h));
let x = PAD;
const layers = items.map((i) => {
  const l = { input: i.buf, left: x, top: H - PAD - i.h };   // 발끝을 한 줄에 맞춘다
  x += i.w + GAP;
  return l;
});
await sharp({ create: { width: W, height: H, channels: 3, background: "#ffffff" } }).composite(layers).png().toFile(out);
console.log("인물 줄판 ->", out, `${W}x${H}`);
