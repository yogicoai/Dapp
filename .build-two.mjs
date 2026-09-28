import fs from "node:fs";
const S = "C:/Users/WeMA1/AppData/Local/Temp/claude/c--Users-WeMA1-Desktop-Dong/af71a827-e7c4-4a71-be41-d25cc64de422/scratchpad";
const L = (who, text, extra = {}) => ({ text, who, ...extra });
const BOOKS = [
  {
    ms: "banggwi", urls: "banggwi-urls.json",
    meta: {
      id: "folk-banggwi", lang: "ko", title: "방귀 며느리",
      summary: "새 식구라 방귀를 꾹 참느라 얼굴이 어두워진 며느리 — 그 특별한 방귀가 결국 온 집안과 마을을 지켜 주는 유쾌한 이야기.",
      narrator: "tc-jinseo", narrators: ["tc-jinseo"],
      voiceCast: { narration: "tc-jinseo", bong: "tc-jongdae", bride: "tc-jiwoo", son: "tc-seojoon", thief: "tc-byunghun" },
      roleOf: { "봉 영감": "bong", "영감": "bong", "며느리": "bride", "아들": "son", "도둑": "thief", "도둑들": "thief" },
    },
    // 4쪽 며느리 고백은 원고의 '아주 작은 목소리로' → tonedown. 13쪽 도둑은 원고대로 toneup.
    lines: {
      2: [L("bong", "네 덕분에 집안에 웃음이 끊이질 않는구나!")],
      4: [L("bong", "얘야, 무슨 걱정이 있는 게냐?"), L("bride", "사실은요… 새 식구라 부끄러워서 방귀를 꾹 참고 있었어요.", { feel: "tonedown" })],
      5: [L("son", "에이, 그런 거야 참지 말고 시원하게 뀌면 되지!"), L("bride", "그게… 제 방귀는 좀 특별해서요.")],
      6: [L("bong", "방귀가 얼마나 특별하다고. 말 나온 김에 지금 한번 뀌어 보거라."),
          L("bride", "그러면 아버님은 문고리를 꽉 잡으시고요. 어머님은 솥뚜껑을 꼭 잡으시고, 서방님은 감나무를 꽉 붙잡고 계세요!")],
      10: [L("bong", "얘야, 네 몸도 생각해야 하니 방귀는 참지 말고 뀌어야 하는데, 그때마다 집안이 뒤집히니 큰일이구나. 잠시 친정에 다녀오는 게 어떻겠니? 그동안 좋은 방법을 함께 생각해 보자꾸나.")],
      11: [L("bong", "어휴, 저 배 하나만 먹으면 얼마나 좋을까.")],
      12: [L("bride", "잠깐만요! 제가 따 드릴 테니 저번처럼 뭐라도 꽉 잡고 계세요!")],
      13: [L("thief", "거기 서라! 가진 거 다 내놔!", { feel: "toneup" })],
      14: [L("bride", "저한테 맡기세요.")],
      15: [L("bong", "얘야, 내가 괜한 걱정을 했구나. 너는 우리 집을 지켜 주는 보물 같은 며느리로구나! 자, 이제 다 같이 집으로 돌아가자꾸나.")],
    },
  },
  {
    ms: "dokkaebi", urls: "dokkaebi-urls.json",
    meta: {
      id: "folk-gamtu", lang: "ko", title: "도깨비 감투",
      summary: "도깨비가 떨어뜨린 감투를 쓰고 몰래 물건을 가져가던 선비가, 찢어진 구멍으로 삐죽 나온 머리카락 때문에 들통나는 이야기.",
      narrator: "tc-hyemin", narrators: ["tc-hyemin"],
      // 도깨비(진혁)는 원고에 대사가 없다 — 북풍과 태양의 태양처럼 배역만 잡아 둔다.
      voiceCast: { narration: "tc-hyemin", scholar: "tc-taewoo", wife: "tc-aeran", dokkaebi: "tc-jinhyuk", villager: "tc-minju" },
      roleOf: { "선비": "scholar", "아내": "wife", "도깨비": "dokkaebi", "도깨비들": "dokkaebi", "마을 사람": "villager", "마을 사람들": "villager", "아주머니": "villager" },
    },
    lines: {
      2: [L("scholar", "어휴, 날도 어두워지고… 오늘 밤은 여기서 좀 쉬고 가야겠군.")],
      4: [L("scholar", "도… 도깨비?", { feel: "toneup" })],
      7: [L("scholar", "어라? 진짜 보이지 않네!")],
      8: [L("scholar", "이 감투만 있으면, 돈도 필요 없지!")],
      9: [L("villager", "물건을 놔두면 순식간에 없어져요.")],
      10: [L("wife", "이 낡은 감투는 뭐야? 버려야겠네.")],
      11: [L("scholar", "안 돼!", { feel: "toneup" }), L("scholar", "조금 찢어진 것쯤이야, 뭐 어때.")],
      13: [L("villager", "어어? 저기 봐! 머리카락이 떠다닌다!", { feel: "toneup" }), L("villager", "도둑이야!", { feel: "toneup" })],
      14: [L("villager", "아니, 선비님 아니십니까!")],
    },
  },
];
const path = "src/data/folk-books.json";
const books = JSON.parse(fs.readFileSync(path, "utf8"));
for (const cfg of BOOKS) {
  const ms = JSON.parse(fs.readFileSync(`${S}/${cfg.ms}-ms.json`, "utf8"));
  const urls = JSON.parse(fs.readFileSync(`${S}/${cfg.urls}`, "utf8"));
  const book = {
    ...cfg.meta, hidden: true, coverImage: urls.cover,
    pages: ms.pages.map((p) => ({ n: p.n, text: p.text, image: urls[`p${p.n}`], ...(cfg.lines[p.n] ? { lines: cfg.lines[p.n] } : {}) })),
  };
  const i = books.findIndex((b) => b.id === book.id);
  if (i >= 0) books[i] = book; else books.push(book);
  console.log(`${book.title} ${book.pages.length}쪽 · 대사 ${Object.values(cfg.lines).flat().length}줄 (${i >= 0 ? "교체" : "추가"})`);
}
fs.writeFileSync(path, JSON.stringify(books, null, 2) + "\n");
