import fs from "node:fs";
const S = "C:/Users/WeMA1/AppData/Local/Temp/claude/c--Users-WeMA1-Desktop-Dong/af71a827-e7c4-4a71-be41-d25cc64de422/scratchpad";
const ms = JSON.parse(fs.readFileSync(`${S}/ureong-ms.json`, "utf8"));
const urls = JSON.parse(fs.readFileSync(`${S}/ureong-urls.json`, "utf8"));
const L = (who, text, extra = {}) => ({ text, who, ...extra });
// 쪽마다 대사집 — 원고의 말풍선 표를 그대로 옮기되, 원고 표에서 빠진 3쪽 첫 줄(농부)과
// 12쪽 마을 사람들 소문(crowd → 나레이션 성우)을 채웠다. 16쪽은 두 줄로 갈라 둘 다 toneup.
const LINES = {
  1: [L("farmer", "하아… 이렇게 일해서 뭐 하나. 같이 밥 먹을 사람도 없는데.")],
  2: [L("snail", "저랑 먹고 살면 되죠.")],
  3: [L("farmer", "허참, 잘못 들었나 보다."), L("farmer", "이렇게 일해 봤자 내 짝은 없지. 무슨 소용이람."), L("snail", "저랑 살면 되죠.")],
  4: [L("farmer", "음, 우렁이잖아? 여기 있다가 밟히겠다. 나랑 집에 가자.")],
  5: [L("farmer", "이게 뭐야? 누가 왔다 갔나?")],
  9: [L("farmer", "당신… 누구요?"), L("snail", "사실 저는 용왕님의 딸이에요. 몰래 인간 세상에 왔다가 들켜서, 벌로 우렁이가 되었지요.")],
  11: [L("dragonking", "그동안 고생이 많았구나. 내가 너무 무거운 벌을 주었지. 이제 그 벌은 거두마.")],
  12: [L("crowd", "농부네 각시가 어찌나 곱다던지."), L("magistrate", "농부야, 나와 내기를 하자. 내가 이기면 네 각시를 데려가겠다!")],
  13: [L("snail", "저는 누구의 것도 아닙니다."), L("snail", "아버지가 주신 요술 조롱박이에요. 무슨 내기든 서방님이 이기게 해 줄 거예요.")],
  14: [L("magistrate", "저기 보이는 섬까지 먼저 가는 사람이 이기는 거다!")],
  16: [L("magistrate", "으악! 배가 뒤집힌다!", { feel: "toneup" }), L("magistrate", "살려 주시오! 하라는 대로 다 하겠소!", { feel: "toneup" })],
  17: [L("magistrate", "정말 고맙네. 다시는 안 그러겠네.")],
};
const book = {
  id: "folk-ureong",
  lang: "ko",
  title: "우렁각시",
  summary: "외로운 농부가 논둑에서 데려온 우렁이 — 그 속에 숨어 있던 용왕님의 딸과, 욕심 많은 사또를 건져 준 착한 마음 이야기.",
  hidden: true,
  narrator: "tc-jinseo",
  narrators: ["tc-jinseo"],
  coverImage: urls.cover,
  voiceCast: {
    narration: "tc-jinseo",
    farmer: "tc-kangil",
    snail: "tc-miu",
    magistrate: "tc-shotgun",
    dragonking: "tc-jongdae",
    crowd: "tc-jinseo",
  },
  roleOf: { "농부": "farmer", "우렁각시": "snail", "각시": "snail", "사또": "magistrate", "용왕": "dragonking", "용왕님": "dragonking" },
  pages: ms.pages.map((p) => ({
    n: p.n,
    text: p.text,
    image: urls[`p${p.n}`],
    ...(LINES[p.n] ? { lines: LINES[p.n] } : {}),
  })),
};
const path = "src/data/folk-books.json";
const books = JSON.parse(fs.readFileSync(path, "utf8"));
const at = books.findIndex((b) => b.id === book.id);
if (at >= 0) books[at] = book; else books.push(book);
fs.writeFileSync(path, JSON.stringify(books, null, 2) + "\n");
console.log(`우렁각시 ${book.pages.length}쪽 기록 (${at >= 0 ? "교체" : "추가"}) · 대사 ${Object.values(LINES).flat().length}줄`);
