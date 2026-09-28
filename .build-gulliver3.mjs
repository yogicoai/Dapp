// 걸리버 여행기 3 — 원고(gulliver34.json)와 올린 그림으로 책을 만든다.
// 사장님 캐스팅(2026-09-20 검토대 캡처): 나레이션 민정 · 걸리버 강일 · 두드리미 시우(2026-09-20 하준에서 바꿈) ·
// 임금님 병훈 · 재단사 MC콩 · 박사님 승재 · 무노디 할아버지 종대.
// 사장님이 주신 그림 파일은 쪽 번호가 아니라 뽑은 차례라, 올릴 때 내용대로 다시 맞췄다.
import fs from "node:fs";
const S = "C:/Users/WeMA1/AppData/Local/Temp/claude/c--Users-WeMA1-Desktop-Dong/af71a827-e7c4-4a71-be41-d25cc64de422/scratchpad";
const ms = JSON.parse(fs.readFileSync(`${S}/gulliver34.json`, "utf8")).find((b) => b.title.startsWith("걸리버 여행기 3"));
const urls = JSON.parse(fs.readFileSync(`${S}/gulliver3-urls.json`, "utf8"));
const L = (who, text, extra = {}) => ({ text, who, ...extra });

// 2026-09-20 사장님: "오이 장사부터 말투가 이상하다" — 박사님(승재는 젊고 반듯한 목소리)의 '-다오'를
// 해요체로 내리고, 무노디 할아버지는 '-세요 + -랍니다'로 묶었다. 둘을 같은 '-요'로 만들면 두 어른이 한 사람으로 들린다.
// 낭독 규칙은 원고 메모 그대로다. 깜짝 정신이 드는 세 줄(3·7·13쪽)만 toneup 으로 못 박고,
// 되풀이 말 "조금만 더 하면 돼요!"(13·14·15쪽)는 셋 다 느긋한 normal 로 같게 둔다.
const LINES = {
  1: [L("gulliver", "얘들아, 또 만났구나!\n지난번엔 내가 거인의 손바닥에 앉아 있었지?\n이번 이야기에서는 말이야,\n내가 하늘을 나는 섬에 올라간단다.\n섬이 하늘을 난다니, 믿어지니?", { feel: "normal" })],
  // 작은따옴표 속마음은 걸리버 제 목소리로 읽는다(인어 공주 13·16쪽과 같은 방식).
  3: [L("gulliver", "구름이 가린 것 같지는 않은데?", { feel: "normal" }),
      L("gulliver", "세상에! 섬이 하늘에 떠 있잖아!", { feel: "toneup", intensity: 0.4 })],
  4: [L("gulliver", "여기요! 저 좀 올려 주세요!", { feel: "toneup", intensity: 0.35 })],
  6: [L("tapper", "저는 두드리미예요.\n이 콩 주머니로 입을 두드리면 말을 하고,\n귀를 두드리면 남의 말을 들어요!", { feel: "happy", intensity: 0.3 })],
  7: [L("king", "아, 그렇지! 손님이 왔구먼!", { feel: "toneup", intensity: 0.4 })],
  9: [L("tailor", "이상하다, 셈은 딱 맞는데?", { feel: "normal" })],
  10: [L("tapper", "이렇게 기울이면 섬이 떠오르고,\n저렇게 기울이면 내려가요!", { feel: "happy", intensity: 0.3 })],
  11: [L("gulliver", "섬 아래 나라에도 가 보고 싶구나.", { feel: "tonedown", intensity: 0.35 }),
       L("tapper", "이거 가져가세요.\n누가 생각에 푹 빠지면 두드려 주세요!", { feel: "normal" })],
  13: [L("professor", "아, 그렇지! 오이에서 햇빛을 뽑아 병에 담고 있어요.", { feel: "toneup", intensity: 0.4 }),
       L("professor", "조금만 더 하면 돼요!", { feel: "normal" })],
  14: [L("gulliver", "벽은 언제 쌓나요?", { feel: "normal" }),
       L("professor", "조금만 더 하면 돼요!", { feel: "normal" })],
  15: [L("professor", "조금만 더 하면 돼요!", { feel: "normal" })],
  16: [L("munodi", "어서 오세요! 이웃들과 함께 키운 사과랍니다. 하나 드셔 보세요.", { feel: "happy", intensity: 0.3 })],
  17: [L("munodi", "햇빛은 날마다 내 밭에 내려온답니다.", { feel: "happy", intensity: 0.3 }),
       L("gulliver", "생각에 푹 빠지면, 곁에 있는 것도 못 보는구나.", { feel: "tonedown", intensity: 0.35 })],
  18: [L("gulliver", "얘들아, 너희는 두드리지 않아도\n내 이야기를 끝까지 잘 들어 주었구나.\n그런데 말이야, 다음 여행에서는\n말들이 사는 나라에 가게 되었단다.\n그 이야기는 다음에!", { feel: "normal" })],
};

// 말풍선 — 격자를 씌운 그림에서 직접 잰 천분율 [위, 왼쪽, 아래, 오른쪽].
// 한 쪽에 한 배역당 한 자리다. 박사님처럼 대사가 둘인 쪽은 되풀이 말을 건다.
const SPOTS = {
  1: [["gulliver", "얘들아, 또 만났구나!\n지난번엔 내가 거인의 손바닥에 앉아 있었지?\n이번 이야기에서는 말이야,\n내가 하늘을 나는 섬에 올라간단다.", [60, 175, 975, 620]]],
  3: [["gulliver", "세상에! 섬이 하늘에 떠 있잖아!", [265, 225, 890, 480]]],
  4: [["gulliver", "여기요! 저 좀 올려 주세요!", [400, 600, 960, 880]]],
  6: [["tapper", "저는 두드리미예요.\n이 콩 주머니로 입을 두드리면 말을 하고,\n귀를 두드리면 남의 말을 들어요!", [360, 415, 710, 600]]],
  7: [["king", "아, 그렇지! 손님이 왔구먼!", [60, 430, 700, 760]]],
  9: [["tailor", "이상하다, 셈은 딱 맞는데?", [240, 650, 800, 850]]],
  10: [["tapper", "이렇게 기울이면 섬이 떠오르고,\n저렇게 기울이면 내려가요!", [290, 690, 850, 870]]],
  11: [["gulliver", "섬 아래 나라에도 가 보고 싶구나.", [140, 180, 700, 520]],
       ["tapper", "이거 가져가세요.\n누가 생각에 푹 빠지면 두드려 주세요!", [250, 540, 700, 790]]],
  13: [["professor", "조금만 더 하면 돼요!", [130, 150, 700, 410]]],
  14: [["gulliver", "벽은 언제 쌓나요?", [190, 90, 690, 300]],
       ["professor", "조금만 더 하면 돼요!", [380, 300, 700, 450]]],
  15: [["professor", "조금만 더 하면 돼요!", [140, 60, 580, 350]]],
  16: [["munodi", "어서 오세요! 이웃들과 함께 키운 사과랍니다. 하나 드셔 보세요.", [270, 440, 710, 730]]],
  17: [["munodi", "햇빛은 날마다 내 밭에 내려온답니다.", [210, 400, 630, 660]]],
  18: [["gulliver", "얘들아, 너희는 두드리지 않아도\n내 이야기를 끝까지 잘 들어 주었구나.", [40, 180, 740, 560]]],
};

const book = {
  id: "classic-gulliver3",
  lang: "ko",
  title: "걸리버 여행기 3",
  summary: ms.summary,
  narrator: "tc-minjung",
  narrators: ["tc-minjung"],
  coverImage: urls.cover,
  voiceCast: {
    narration: "tc-minjung",
    gulliver: "tc-kangil",
    tapper: "tc-siwoo",
    king: "tc-byunghun",
    tailor: "tc-mckong",
    professor: "tc-seungjae",
    munodi: "tc-jongdae",
  },
  roleOf: {
    "걸리버": "gulliver",
    "두드리미": "tapper",
    "임금님": "king", "임금": "king",
    "재단사": "tailor",
    "박사님": "professor", "박사": "professor",
    "무노디 할아버지": "munodi", "무노디": "munodi", "할아버지": "munodi",
  },
  pages: ms.pages.map((p) => {
    const spots = SPOTS[p.n];
    return {
      n: p.n,
      text: p.text,
      image: urls[`p${p.n}`],
      ...(LINES[p.n] ? { lines: LINES[p.n] } : {}),
      ...(spots ? { hotspots: spots.map(([label, line, box]) => ({ label, line, box, audio: `/classic/gulliver3/say-p${p.n}-${label}.mp3` })) } : {}),
    };
  }),
};

const path = "src/data/classic-books.json";
const books = JSON.parse(fs.readFileSync(path, "utf8"));
const at = books.findIndex((b) => b.id === book.id);
if (at >= 0) books[at] = book;
else books.splice(books.findIndex((b) => b.id === "classic-gulliver2") + 1, 0, book);
fs.writeFileSync(path, JSON.stringify(books, null, 2) + "\n");
console.log(`걸리버 여행기 3 ${book.pages.length}쪽 ${at >= 0 ? "교체" : "추가"} · 대사 ${Object.values(LINES).flat().length}줄 · 말풍선 ${Object.values(SPOTS).flat().length}곳`);
console.log(`차례: ${books.map((b) => b.id).slice(16, 22).join(" ")}`);
