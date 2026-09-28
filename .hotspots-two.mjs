import fs from "node:fs";
const H = (label, line, box, extra = {}) => ({ label, line, box, ...extra });
const ALL = {
  "folk-banggwi": { dir: "banggwi", spots: {
    2: [H("bong", "네 덕분에 집안에 웃음이 끊이질 않는구나!", [185, 20, 730, 250])],
    4: [H("bong", "얘야, 무슨 걱정이 있는 게냐?", [140, 150, 860, 480]),
        H("bride", "사실은요… 새 식구라 부끄러워서 방귀를 꾹 참고 있었어요.", [285, 485, 890, 790], { feel: "tonedown" })],
    5: [H("son", "에이, 그런 거야 참지 말고 시원하게 뀌면 되지!", [250, 200, 750, 385]),
        H("bride", "그게… 제 방귀는 좀 특별해서요.", [195, 390, 850, 580])],
    6: [H("bong", "방귀가 얼마나 특별하다고. 말 나온 김에 지금 한번 뀌어 보거라.", [255, 35, 785, 255]),
        H("bride", "그러면 아버님은 문고리를 꽉 잡으시고요. 어머님은 솥뚜껑을 꼭 잡으시고, 서방님은 감나무를 꽉 붙잡고 계세요!", [255, 450, 860, 635])],
    10: [H("bong", "잠시 친정에 다녀오는 게 어떻겠니? 그동안 좋은 방법을 함께 생각해 보자꾸나.", [130, 90, 815, 470])],
    11: [H("bong", "어휴, 저 배 하나만 먹으면 얼마나 좋을까.", [135, 255, 905, 480])],
    12: [H("bride", "잠깐만요! 제가 따 드릴 테니 저번처럼 뭐라도 꽉 잡고 계세요!", [365, 400, 890, 710])],
    13: [H("thief", "거기 서라! 가진 거 다 내놔!", [215, 385, 840, 990], { feel: "toneup" })],
    14: [H("bride", "저한테 맡기세요.", [290, 245, 890, 525])],
    15: [H("bong", "너는 우리 집을 지켜 주는 보물 같은 며느리로구나!", [105, 105, 960, 370])],
  } },
  "folk-gamtu": { dir: "gamtu", spots: {
    2: [H("scholar", "어휴, 날도 어두워지고… 오늘 밤은 여기서 좀 쉬고 가야겠군.", [380, 75, 890, 265])],
    4: [H("scholar", "도… 도깨비?", [140, 140, 615, 260], { feel: "toneup" })],
    7: [H("scholar", "어라? 진짜 보이지 않네!", [215, 230, 910, 400])],
    8: [H("scholar", "이 감투만 있으면, 돈도 필요 없지!", [80, 305, 945, 575])],
    9: [H("villager", "물건을 놔두면 순식간에 없어져요.", [170, 825, 775, 995])],
    10: [H("wife", "이 낡은 감투는 뭐야? 버려야겠네.", [140, 135, 590, 480])],
    11: [H("scholar", "조금 찢어진 것쯤이야, 뭐 어때.", [73, 100, 815, 530])],
    13: [H("villager", "어어? 저기 봐! 머리카락이 떠다닌다!", [195, 835, 600, 1000], { feel: "toneup" })],
    14: [H("villager", "아니, 선비님 아니십니까!", [200, 520, 760, 785])],
  } },
};
const path = "src/data/folk-books.json";
const books = JSON.parse(fs.readFileSync(path, "utf8"));
for (const [id, cfg] of Object.entries(ALL)) {
  const b = books.find((x) => x.id === id);
  let n = 0;
  for (const p of b.pages) {
    const s = cfg.spots[p.n];
    if (!s) { delete p.hotspots; continue; }
    p.hotspots = s.map((h) => ({ ...h, audio: `/folk/${cfg.dir}/say-p${p.n}-${h.label}.mp3` }));
    n += s.length;
  }
  console.log(`${b.title}: 말풍선 ${n}곳`);
}
fs.writeFileSync(path, JSON.stringify(books, null, 2) + "\n");
