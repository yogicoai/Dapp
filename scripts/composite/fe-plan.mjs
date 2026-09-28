/**
 * fe 계정 시험 3권의 쪽별 연출표 → compose.py 가 먹는 계획 파일.
 *
 * 쪽마다: 어느 배경 · 누가 · 어떤 자세 · 어디(잰 자리 id 또는 at:[x,y]).
 * at 을 주면 그 배경의 눈높이·비율로 키를 계산한다(원근 유지). y>1000 이면 발끝이 잘린 반신 구도.
 */
import fs from "node:fs";

const SP = "C:/Users/YOGIBO~1/AppData/Local/Temp/claude/c--Users-Yogibo-Design-Desktop-Dong/f0d0f72c-8637-4ba5-993a-4f2d651a2bb7/scratchpad/fe";
const BGROOT = "C:/Users/Yogibo Design/Desktop/bg";
const lib = JSON.parse(fs.readFileSync("scratch-art/배경목록.json", "utf8"));
const libSpots = JSON.parse(fs.readFileSync("scratch-art/배경-설자리.json", "utf8"));
const genSpots = JSON.parse(fs.readFileSync(`${SP}/gen-spots.json`, "utf8"));

const bg = (key) => {
  if (typeof key === "number") {
    const r = lib.find((x) => x.n === key);
    return { file: `${BGROOT}/${r.folder}/${r.file}`, spots: libSpots.find((x) => x.n === key), name: r.ko };
  }
  return { file: `${SP}/bg/${key}.png`, spots: genSpots.find((x) => x.slug === key), name: key };
};

// 인물 — 포즈 폴더와 실제 키(cm)
const C = {
  하온cap: { sheet: "haon-cap", cm: 110 },
  하온한복: { sheet: "haon-hanbok", cm: 110 },
  하온b3: { sheet: "haon-b3", cm: 110 },
  엄마b1: { sheet: "mom-b1", cm: 162 },
  엄마b2: { sheet: "mom-b2", cm: 162 },
  엄마b3: { sheet: "mom-b3", cm: 162 },
  아빠: { sheet: "dad-b3", cm: 174 },
  할머니: { sheet: "grandma", cm: 152 },
  할아버지: { sheet: "grandpa", cm: 165 },
};
// who, pose, where(spot id 또는 [x,y]), flip, scale
const A = (who, pose, where, flip = false, scale = 1) => ({ who, pose, where, flip, scale });

const BOOKS = [
  {
    id: "my-muf9rkxl-1j3uvd", title: "하온이의 전농동 나들이",
    pages: [
      { bg: "parking", actors: [A("엄마b1", 2, [330, 930]), A("하온cap", 4, [600, 960])] },
      { bg: "parking", actors: [A("엄마b1", 7, [330, 930]), A("하온한복", 4, [560, 960])] },
      { bg: 94, actors: [A("엄마b1", 1, [300, 880]), A("하온한복", 2, [470, 930]), A("할머니", 6, [650, 900]), A("할아버지", 1, [820, 860])] },
      { bg: 111, actors: [A("할머니", 5, [380, 770]), A("하온한복", 6, [560, 790])] },
      { bg: "grandma-night", actors: [A("할머니", 1, [340, 900]), A("하온한복", 4, [620, 950])] },
    ],
  },
  {
    id: "my-mu28fusx-qw03vj", title: "하온이의 한강버스 소풍",
    pages: [
      { bg: 69, actors: [A("엄마b2", 1, [260, 800]), A("하온cap", 4, [470, 930])] },
      { bg: "pier", actors: [A("엄마b2", 3, [330, 1010], true), A("하온cap", 2, [570, 1030])] },
      { bg: "ferry-deck", actors: [A("엄마b2", 1, [360, 990]), A("하온cap", 4, [610, 1010])] },
      { bg: 62, actors: [A("엄마b2", 6, [330, 980]), A("하온cap", 8, [630, 1060])] },
      { bg: 62, actors: [A("엄마b2", 7, [400, 995], false, 1.35), A("하온cap", 6, [610, 1000], false, 1.35)] },
    ],
  },
  {
    id: "my-mu0issap", title: "하늘이 열린 버스, 옛날이 열린 궁궐",
    pages: [
      { bg: "bus-top-deck-2", actors: [A("엄마b3", 1, "stand-left-front"), A("아빠", 1, "stand-right-front"), A("하온b3", 4, "stand-aisle-front")] },
      { bg: "bus-top-deck-2", actors: [A("하온b3", 5, "sit-left-aisle"), A("아빠", 4, "stand-right-front")] },
      { bg: 9, actors: [A("엄마b3", 2, [300, 960]), A("아빠", 3, [720, 950]), A("하온b3", 1, [500, 1020])] },
      { bg: 9, actors: [A("엄마b3", 3, [400, 950]), A("아빠", 3, [620, 940]), A("하온b3", 3, [510, 1000])] },
      { bg: 45, actors: [A("엄마b3", 1, [330, 950]), A("아빠", 1, [720, 945]), A("하온b3", 4, [520, 1020])] },
    ],
  },
];

// 버스 위층은 좌석(sit) 자리를 잰 값으로 고른다.
const pickSpot = (spots, tag) => {
  const S = spots.spots;
  const sit = S.filter((s) => s.pose === "sit").sort((a, b) => b.foot_y - a.foot_y);
  const stand = S.filter((s) => s.pose === "stand").sort((a, b) => b.foot_y - a.foot_y);
  const byX = (arr, lo, hi) => arr.find((s) => s.foot_x >= lo && s.foot_x <= hi) ?? arr[0];
  switch (tag) {
    case "__sit_front": return (sit[0] ?? stand[0]).id;
    case "__near_center": return byX(stand, 380, 620)?.id ?? stand[0].id;
    case "__mid_right": return (stand.slice(1).find((s) => s.foot_x > 520) ?? stand[1] ?? stand[0]).id;
    case "__sit_or_mid_left": return (stand.slice(1).find((s) => s.foot_x < 480) ?? sit[0] ?? stand[0]).id;
  }
  return tag;
};

const plans = [];
for (const b of BOOKS) {
  b.pages.forEach((p, i) => {
    const B = bg(p.bg);
    if (!B.spots) { console.log(`  (건너뜀) ${b.id.slice(3,11)} p${i + 1} — ${p.bg} 설 자리 아직 없음`); return; }
    plans.push({
      book: b.id, page: i + 1, bgName: B.name,
      bg: B.file, spots: B.spots,
      actors: p.actors.map((a) => {
        const c = C[a.who];
        const base = { sheet: `${SP}/cut/${c.sheet}`, pose: a.pose, flip: a.flip, height_cm: c.cm, scale: a.scale, who: a.who };
        return Array.isArray(a.where) ? { ...base, at: a.where } : { ...base, spot: pickSpot(B.spots, a.where) };
      }),
      out: `${SP}/pages/${b.id}/p${i + 1}.webp`,
      width: 1280,
    });
  });
}
fs.writeFileSync(`${SP}/plans.json`, JSON.stringify(plans, null, 1));
console.log(`계획 ${plans.length}쪽 -> ${SP}/plans.json`);
for (const p of plans) console.log(`  ${p.book.slice(3, 11)} p${p.page}  ${p.bgName.padEnd(14)} ${p.actors.map((a) => `${a.who}#${a.pose}${a.flip ? "↔" : ""}@${a.at ? a.at.join(",") : a.spot}`).join("  ")}`);
