import fs from "node:fs";
const H = (label, line, box, extra = {}) => ({ label, line, box, ...extra });
// box = [위, 왼쪽, 아래, 오른쪽] 천분율 — 격자를 씌운 그림에서 직접 잰 값.
const SPOTS = {
  1: [H("farmer", "하아… 이렇게 일해서 뭐 하나. 같이 밥 먹을 사람도 없는데.", [85, 265, 770, 500])],
  3: [H("farmer", "이렇게 일해 봤자 내 짝은 없지. 무슨 소용이람.", [15, 265, 720, 550]),
      H("snail", "저랑 살면 되죠.", [715, 740, 825, 860])],
  4: [H("farmer", "음, 우렁이잖아? 여기 있다가 밟히겠다. 나랑 집에 가자.", [55, 190, 930, 630])],
  5: [H("farmer", "이게 뭐야? 누가 왔다 갔나?", [10, 90, 690, 490])],
  9: [H("farmer", "당신… 누구요?", [85, 145, 935, 430]),
      H("snail", "사실 저는 용왕님의 딸이에요. 몰래 인간 세상에 왔다가 들켜서, 벌로 우렁이가 되었지요.", [170, 550, 955, 830])],
  11: [H("dragonking", "그동안 고생이 많았구나. 내가 너무 무거운 벌을 주었지. 이제 그 벌은 거두마.", [225, 460, 850, 720])],
  12: [H("magistrate", "농부야, 나와 내기를 하자. 내가 이기면 네 각시를 데려가겠다!", [140, 490, 930, 800])],
  13: [H("snail", "아버지가 주신 요술 조롱박이에요. 무슨 내기든 서방님이 이기게 해 줄 거예요.", [180, 20, 930, 470])],
  14: [H("magistrate", "저기 보이는 섬까지 먼저 가는 사람이 이기는 거다!", [120, 700, 360, 830])],
  16: [H("magistrate", "살려 주시오! 하라는 대로 다 하겠소!", [405, 395, 775, 750], { feel: "toneup" })],
  17: [H("magistrate", "정말 고맙네. 다시는 안 그러겠네.", [465, 300, 835, 600])],
};
const path = "src/data/folk-books.json";
const books = JSON.parse(fs.readFileSync(path, "utf8"));
const b = books.find((x) => x.id === "folk-ureong");
let count = 0;
for (const p of b.pages) {
  const spots = SPOTS[p.n];
  if (!spots) { delete p.hotspots; continue; }
  p.hotspots = spots.map((s) => ({ ...s, audio: `/folk/ureong/say-p${p.n}-${s.label}.mp3` }));
  count += spots.length;
}
fs.writeFileSync(path, JSON.stringify(books, null, 2) + "\n");
console.log(`말풍선 ${count}곳 기록`);
