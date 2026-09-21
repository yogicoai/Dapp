/**
 * 배역별 낭독 굽기 — 지문은 나레이션 성우가, 대사는 그 배역 성우가 읽는다.
 *
 * 왜 미리 굽나 — 전래동화·세계명작은 모든 아이가 같은 글을 듣는다. 한 번 구워 두면
 * 그 뒤로는 파일 재생이라 크레딧이 0이다. 실시간 합성으로 두면 아이가 책을 열 때마다
 * 돈이 나간다.
 *
 * 쓰는 법:
 *   node --experimental-strip-types --env-file=.env.local \n *        scripts/bake-cast-narration.mts --book "흥부와 놀부" --dry   (리허설)
 *   같은 명령에서 --dry 를 빼면 진짜로 굽는다. --book 을 빼면 토끼와 거북이.
 *
 * 이미 있는 파일은 건너뛴다 — 중간에 끊겨도 다시 돌리면 이어서 굽고, 같은 문장에
 * 두 번 과금되지 않는다.
 */
import fs from "node:fs";
import path from "node:path";
import { planPageVoices, unmatchedLines, unassignedDialogue, narratedThoughts, NARRATION, breathe } from "../src/lib/story-cast.ts";

const DRY = process.argv.includes("--dry");
/**
 * --changed 를 주면 '연기가 달라진 줄'만 다시 굽는다.
 * 감정 없이 구운 줄은 결과가 같아서 다시 부를 이유가 없다(크레딧 절약).
 */
const ONLY_CHANGED = process.argv.includes("--changed");
/**
 * --seed 는 아무것도 굽지 않고 '지금 파일이 어떤 조건으로 구워졌는지'만 기록한다.
 * 규칙을 바꾸기 전에 한 번 찍어 두면, 그 뒤로는 정말 달라진 줄만 다시 굽는다.
 */
const SEED = process.argv.includes("--seed");
/**
 * --adopt 는 굽지 않고, **지금 디스크에 있는 파일**을 지금 규칙 그대로 기록만 한다.
 *
 * --seed 와 다른 점: seed 는 '옛 감정 규칙'으로 찍는다(규칙을 바꾸기 직전에 쓰던 것).
 * adopt 는 손대지 않는다 — 기록만 잃어버렸을 때 되살리는 용도다.
 */
const ADOPT = process.argv.includes("--adopt");
/**
 * 굽기 기록 — 파일마다 {성우, 감정, 세기, 읽은 글}을 남긴다.
 *
 * 이게 없으면 '다시 구울 줄'을 감정 규칙의 옛/새 비교로 짐작해야 하는데, 규칙을 두 번
 * 바꾸면 그 짐작이 틀린다. 실제로 이미 고쳐 놓은 21개를 또 굽겠다고 나왔다(349자).
 * 조건을 적어 두면 정확히 달라진 것만 고른다.
 */
const MANIFEST = "scripts/bake-manifest.json";
/*
 * 기록의 열쇠는 **책 폴더까지 붙인다** — 파일 이름만으로는 책이 겹친다.
 *
 * seg-cast-p2-1.mp3 는 흥부에도 팥죽에도 금도끼에도 있다. 이름만 열쇠로 쓰면
 * 나중에 구운 책이 앞 책의 기록을 덮어써서, --changed 를 줘도 "달라졌다"로 잘못
 * 읽고 멀쩡한 조각을 다시 굽는다(실제로 흥부에서 21개·450자가 그렇게 잡혔다).
 */
const keyOf = (file: string) => `${SPEC.root ?? "folk"}/${SPEC.dir}/${file}`;
type Recipe = { voice: string; emotion: string; intensity: number | null; text: string; tempo?: number };
const recorded: Record<string, Recipe> = fs.existsSync(MANIFEST)
  ? JSON.parse(fs.readFileSync(MANIFEST, "utf8"))
  : {};
const fresh: Record<string, Recipe> = {};
const same = (a: Recipe | undefined, b: Recipe) =>
  Boolean(a) &&
  a!.voice === b.voice &&
  a!.emotion === b.emotion &&
  a!.intensity === b.intensity &&
  (a!.tempo ?? 1) === (b.tempo ?? 1) &&
  a!.text === b.text;
const BASE = process.env.BAKE_BASE ?? "http://localhost:3000";


/*
 * 어느 책을 구울지 --book 으로 고른다.
 *
 * 예전엔 책 이름과 폴더가 파일 안에 박혀 있어서, 다른 책을 구우려면 스크립트를
 * 고쳐야 했다. 이제 책마다 한 줄만 등록해 두고 골라 쓴다.
 *   node --experimental-strip-types --env-file=.env.local  *        scripts/bake-cast-narration.mts --book "흥부와 놀부" --dry
 */
type BookSpec = {
  dir: string;
  /**
   * 원고가 든 파일. 안 적으면 전래동화.
   *
   * 세계명작은 classic-books.json 에 살고 소리도 public/classic/ 아래에 둔다.
   * 예전엔 두 경로가 스크립트에 박혀 있어서 전래동화만 구울 수 있었다.
   */
  data?: string;
  /** 소리를 둘 뿌리 폴더(public/<root>/<dir>). 안 적으면 "folk". */
  root?: string;
  /** 미리 구울 나레이션 성우. 여기 없는 성우는 이 책의 고를 수 있는 목록에서도 뺀다. */
  narrators: string[];
  /**
   * 책을 열었을 때 기본으로 읽어 주는 성우. 안 적으면 narrators 의 첫 번째.
   *
   * 예전엔 첫 번째가 곧 대표였는데, 그러면 "다빈은 이미 구워 뒀으니 남겨 두고
   * 아린이를 대표로" 같은 걸 목록 순서로만 표현해야 한다. 숨은 결합이라 실제로
   * 한 번 걸렸다 — 아린이로 바꿔 놨더니 굽고 나서 다빈으로 되돌아갔다.
   */
  defaultNarrator?: string;
  /** 자동 배정에 쓸 등장인물 이름 — 본문에 나오는 그대로. */
  cast: { name: string }[];
};
const BOOKS: Record<string, BookSpec> = {
  /*
   * 알림장으로 만든 데모 한 권 (2026-09-09). 선생님이 적어 준 하루를 그대로
   * 넣어 5장이 버티는지 본 책이라, 원고가 sample-books.json 에 있고
   * 마스터에게만 보인다. 캐스팅: 나레이션 민정 · 하온 수아 · 친구 시우.
   */
  "하온이의 비눗방울 하루": {
    data: "src/data/sample-books.json",
    root: "sample",
    dir: "haon-bubble",
    narrators: ["tc-minjung"],
    defaultNarrator: "tc-minjung",
    cast: [{ name: "하온" }, { name: "친구" }],
  },

  // 호랑이와 곶감 — 사장님 캐스팅(2026-09-17): 나레이션 민정 · 호랑이 심호문 · 엄마 가희 · 소도둑 홍설록.
  // 2026-09-20 검토대에서 엄마 → 민주, 소도둑 → MC콩으로 바꿨다.
  // 소 울음(음매—)과 아기 울음(으앙—)은 배역이 아니라 나레이션이 읽는다.
  "호랑이와 곶감": {
    dir: "gotgam",
    narrators: ["tc-minjung"],
    defaultNarrator: "tc-minjung",
    cast: [{ name: "호랑이" }, { name: "엄마" }, { name: "소도둑" }],
  },
  // 토끼의 재판 — 사장님 캐스팅(2026-09-17): 나레이션 민정 · 나그네 호선 · 호랑이 심호문 ·
  // 나무 종대 · 소 덕구 · 토끼 햄쭈. 소리 흉내(으르렁—)는 나레이션이 읽는다.
  // 2026-09-20 재캐스팅: 나레이션 진서 · 나그네 대진 · 나무 승재 (호랑이 심호문 · 소 덕구 · 토끼 햄쭈 그대로).
  "토끼의 재판": {
    dir: "rabbitjudge",
    narrators: ["tc-minjung"],
    defaultNarrator: "tc-minjung",
    cast: [{ name: "나그네" }, { name: "호랑이" }, { name: "나무" }, { name: "소" }, { name: "토끼" }],
  },
  // 별주부전 — 사장님 캐스팅(2026-09-17): 나레이션 민정 · 용왕 왕권 · 메기 종대 ·
  // 자라 몽군 · 토끼 덕구.
  "별주부전": {
    dir: "byeoljubu",
    narrators: ["tc-minjung"],
    defaultNarrator: "tc-minjung",
    cast: [{ name: "용왕" }, { name: "메기" }, { name: "자라" }, { name: "토끼" }],
  },
  // 청개구리 — 사장님 캐스팅(2026-09-17): 나레이션 민정 · 엄마 청개구리 나진 · 아기 청개구리 덕구.
  // 10쪽 "엄마. 엄마…"는 울부짖으면 안 된다 — 대사집에 세기를 낮게 못 박아 뒀다.
  // 2026-09-20 재캐스팅: 나레이션 진서 · 엄마 청개구리 민주 · 아기 청개구리 토비.
  "청개구리": {
    dir: "greenfrog",
    narrators: ["tc-minjung"],
    defaultNarrator: "tc-minjung",
    cast: [{ name: "엄마 청개구리" }, { name: "아기 청개구리" }],
  },
  // 상길이놈과 박서방 — 사장님 캐스팅(2026-09-17): 나레이션 민정 · 거만한 양반 김고트 ·
  // 정중한 양반 왕권 · 박상길 종대(그림이 60대 어르신이라 창수에서 바꿨다). 그림은 구글(Gemini)로 이 저장소에서 직접 그렸다.
  // 2026-09-20 재캐스팅: 나레이션 진서 · 거만한 양반 진혁 · 정중한 양반 강일 · 박상길 창배.
  "상길이놈과 박서방": {
    dir: "sanggil",
    narrators: ["tc-minjung"],
    defaultNarrator: "tc-minjung",
    cast: [{ name: "거만한 양반" }, { name: "정중한 양반" }, { name: "박상길" }],
  },
  // 우렁각시 — 사장님 캐스팅(2026-09-20 검토대에서 전체 교체): 나레이션 진서 · 농부 희준 ·
  // 우렁각시 지우 · 사또 진혁 · 용왕 왕권. (처음엔 강일·고바야시 미우·샷건·종대였다.)
  // 12쪽 마을 사람들 소문은 crowd 배역으로 나레이션 성우가 읽는다. '번쩍—·뚝—'도 나레이션.
  // 2026-09-20 저녁 재설계(사장님이 "성우 구성을 다시 짜 달라"): 나레이션 민정 · 농부 서준 ·
  // 우렁각시 청아 · 사또 MC콩 · 용왕 왕권(그대로) · 마을 사람들 미소.
  "우렁각시": {
    dir: "ureong",
    narrators: ["tc-minjung"],
    defaultNarrator: "tc-minjung",
    cast: [{ name: "농부" }, { name: "우렁각시" }, { name: "각시" }, { name: "사또" }, { name: "용왕" }],
  },
  // 방귀 며느리 — 사장님 캐스팅(2026-09-19): 나레이션 진서 · 봉 영감 종대 · 며느리 지우 ·
  // 아들 서준 · 도둑 병훈. '끄응—·빠앙!!·우르르 쾅!·뿡—' 같은 소리는 나레이션이 읽는다.
  // 2026-09-20 검토대에서 재캐스팅: 나레이션 민정 · 봉 영감 창배 (며느리 지우 · 아들 서준 · 도둑 병훈 그대로).
  "방귀 며느리": {
    dir: "banggwi",
    narrators: ["tc-minjung"],
    defaultNarrator: "tc-minjung",
    cast: [{ name: "봉 영감" }, { name: "며느리" }, { name: "아들" }, { name: "도둑" }],
  },
  // 도깨비 감투 — 사장님 캐스팅(2026-09-19): 나레이션 혜민 · 선비 태우 · 아내 애란 ·
  // 도깨비 진혁 · 마을 사람 민주. 도깨비는 원고에 대사가 없어 배역만 잡아 뒀다.
  "도깨비 감투": {
    dir: "gamtu",
    narrators: ["tc-minjung"],
    defaultNarrator: "tc-minjung",
    cast: [{ name: "선비" }, { name: "아내" }, { name: "도깨비" }, { name: "마을 사람" }],
  },
  "의좋은 형제": {
    dir: "brothers",
    narrators: ["tc-minjung"],
    defaultNarrator: "tc-minjung",
    cast: [{ name: "형" }, { name: "아우" }],
  },
  // 잭과 콩나무 — F:\Dong 세션이 2026-09-05 밤에 굽고 등록한 것을 가져옴(캐스팅: 나레이션 민정 ·
  // 잭 시우 · 엄마 나진 · 노인 종대 · 거인 심호문 · 거인 아내 이나). 요정 대사는 없고 나레이션이 전한다.
  "잭과 콩나무": {
    data: "src/data/classic-books.json",
    root: "classic",
    dir: "jack",
    narrators: ["tc-minjung"],
    defaultNarrator: "tc-minjung",
    cast: [
      { name: "잭" }, { name: "엄마" }, { name: "노인" },
      { name: "거인" }, { name: "거인 아내" },
    ],
  },
  // 헨젤과 그레텔 — 사장님 캐스팅(2026-09-08): 나레이션 민정 · 헨젤 시우 · 그레텔 햄쭈 ·
  // 마녀 가희 · 아버지 호선. 마녀는 8쪽에서 다정한 척, 9쪽부터 본색이라 폭이 넓어야 한다.
  "헨젤과 그레텔": {
    data: "src/data/classic-books.json",
    root: "classic",
    dir: "hansel",
    narrators: ["tc-minjung"],
    defaultNarrator: "tc-minjung",
    cast: [
      { name: "헨젤" }, { name: "그레텔" }, { name: "마녀" },
      { name: "할머니" }, { name: "아버지" },
    ],
  },
  // 개구리 왕자 — 사장님 캐스팅(2026-09-07): 나레이션 민정 · 공주 아린 · 개구리 호선 · 임금님 종대.
  "개구리 왕자": {
    data: "src/data/classic-books.json",
    root: "classic",
    dir: "frogprince",
    narrators: ["tc-minjung"],
    defaultNarrator: "tc-minjung",
    cast: [{ name: "공주" }, { name: "개구리" }, { name: "임금님" }],
  },
  "장화 신은 고양이": {
    data: "src/data/classic-books.json",
    root: "classic",
    dir: "puss",
    narrators: ["tc-minjung"],
    defaultNarrator: "tc-minjung",
    cast: [
      { name: "고양이" }, { name: "막내" }, { name: "임금님" },
      { name: "공주" }, { name: "괴물" }, { name: "마법사" },
    ],
  },
  "벌거벗은 임금님": {
    data: "src/data/classic-books.json",
    root: "classic",
    dir: "emperor",
    narrators: ["tc-minjung"],
    defaultNarrator: "tc-minjung",
    cast: [
      { name: "임금님" }, { name: "재봉사" }, { name: "신하" },
      { name: "아이" }, { name: "아빠" },
    ],
  },
  "양치기 소년": {
    data: "src/data/classic-books.json",
    root: "classic",
    dir: "shepherdboy",
    narrators: ["tc-minjung"],
    defaultNarrator: "tc-minjung",
    cast: [{ name: "소년" }, { name: "이장 아저씨" }],
  },
  "시골 쥐와 도시 쥐": {
    data: "src/data/classic-books.json",
    root: "classic",
    dir: "twomice",
    narrators: ["tc-minjung"],
    defaultNarrator: "tc-minjung",
    cast: [{ name: "시골 쥐" }, { name: "도시 쥐" }],
  },
  // 북풍과 태양 — 사장님 캐스팅(2026-09-17): 나레이션 민정 · 북풍 시우 · 태양 아린이 · 나그네 호선.
  // 태양은 대사가 한 줄도 없다(원전대로 말없이 웃기만 한다) — 성우는 말풍선용으로만 둔다.
  "북풍과 태양": {
    data: "src/data/classic-books.json",
    root: "classic",
    dir: "northwind",
    narrators: ["tc-minjung"],
    defaultNarrator: "tc-minjung",
    cast: [{ name: "북풍" }, { name: "태양" }, { name: "나그네" }],
  },
  // 걸리버 여행기 1 — 사장님 캐스팅(2026-09-18): 나레이션 민정 · 걸리버 강일 · 임금님 왕권.
  // 1쪽과 14쪽 끝줄은 걸리버가 아이들에게 직접 말을 거는 액자다 — 같은 강일이 읽는다.
  "걸리버 여행기 1": {
    data: "src/data/classic-books.json",
    root: "classic",
    dir: "gulliver1",
    narrators: ["tc-minjung"],
    defaultNarrator: "tc-minjung",
    cast: [{ name: "걸리버" }, { name: "임금님" }],
  },
  // 인어 공주 — 사장님 캐스팅(2026-09-17): 나레이션 민정 · 인어 공주 민정 · 언니 가희 ·
  // 바다 마녀 유빈 · 왕자 티안. 13·16쪽의 작은따옴표 줄은 목소리를 잃은 뒤의 속마음이라
  // 배역을 걸지 않는다 — 나레이션이 읽어야 소리가 안 나는 것이 살아난다.
  // 2026-09-20 재캐스팅: 나레이션 진서 · 왕자 강일 · 언니 민주 (인어 공주 민정 · 바다 마녀 유빈 그대로). 이제 나레이터와 공주가 다른 목소리다.
  "인어 공주": {
    data: "src/data/classic-books.json",
    root: "classic",
    dir: "mermaid",
    narrators: ["tc-minjung"],
    defaultNarrator: "tc-minjung",
    cast: [{ name: "인어 공주" }, { name: "언니" }, { name: "바다 마녀" }, { name: "왕자" }],
  },
  // 오즈의 마법사 — 사장님 캐스팅(2026-09-17): 나레이션 민정 · 도로시 수아 · 허수아비 창수 ·
  // 양철 나무꾼 김고트 · 사자 덕구 · 서쪽 마녀 숙희 · 오즈 종대.
  // 2026-09-20 검토대에서 재캐스팅: 허수아비 강일 · 양철 나무꾼 진혁 · 서쪽 마녀 가희 · 오즈 창배 · 아주머니 민주.
  // 14·18쪽은 그림에 그 인물이 없어 말풍선 없이 낭독만 한다.
  "오즈의 마법사": {
    data: "src/data/classic-books.json",
    root: "classic",
    dir: "oz",
    narrators: ["tc-minjung"],
    defaultNarrator: "tc-minjung",
    cast: [{ name: "도로시" }, { name: "허수아비" }, { name: "양철 나무꾼" }, { name: "사자" }, { name: "서쪽 마녀" }, { name: "오즈" }, { name: "아주머니" }],
  },
  // 신데렐라 — 사장님 캐스팅(2026-09-21, 캐스팅 보드에서 확정): 나레이션 민정 ·
  // 신데렐라 민주 · 새어머니 숙희 · 언니 가희 · 요정 대모 지우 · 왕자 태우 · 신하 대진.
  // 언니는 둘이지만 한 목소리를 쓴다 — 그림으로 구별되고, 둘이 번갈아 말하는 쪽이 없다.
  // "사람들"(13쪽 수군거림)은 배역이 아니라 나레이션이 읽는다.
  "신데렐라": {
    data: "src/data/classic-books.json",
    root: "classic",
    dir: "cinderella",
    narrators: ["tc-minjung"],
    defaultNarrator: "tc-minjung",
    cast: [{ name: "신데렐라" }, { name: "새어머니" }, { name: "언니" }, { name: "요정 대모" }, { name: "왕자" }, { name: "신하" }],
  },
  // 걸리버 여행기 2 — 사장님 캐스팅(2026-09-18): 나레이션 민정 · 걸리버 강일 ·
  // 거인의 딸 수아 · 공주님 아린이. 5쪽 거인 농부는 캐스팅표에 없던 배역이라,
  // 이 원고에 대사가 한 줄도 없는 임금님 자리의 왕권을 돌려 썼다.
  "걸리버 여행기 2": {
    data: "src/data/classic-books.json",
    root: "classic",
    dir: "gulliver2",
    narrators: ["tc-minjung"],
    defaultNarrator: "tc-minjung",
    cast: [{ name: "걸리버" }, { name: "거인의 딸" }, { name: "공주님" }, { name: "농부" }],
  },
  // 걸리버 여행기 3 — 사장님 캐스팅(2026-09-20): 나레이션 민정 · 걸리버 강일(1·2편과 같은 목소리) ·
  // 두드리미 시우(사장님이 하준에서 바꿈) · 임금님 병훈 · 재단사 MC콩 · 박사님 승재 · 무노디 할아버지 종대.
  // 해적과 선장은 대사가 없다. "조금만 더 하면 된다오!"는 13·14·15쪽에 똑같이 나오는 웃음 자리라
  // 셋 다 느긋한 normal 로 같게 굽는다 — 하나만 달라지면 되풀이가 무너진다.
  "걸리버 여행기 3": {
    data: "src/data/classic-books.json",
    root: "classic",
    dir: "gulliver3",
    narrators: ["tc-minjung"],
    defaultNarrator: "tc-minjung",
    cast: [
      { name: "걸리버" }, { name: "두드리미" }, { name: "임금님" },
      { name: "재단사" }, { name: "박사님" }, { name: "무노디 할아버지" },
    ],
  },
  // 걸리버 여행기 4 — 사장님 캐스팅(2026-09-20): 나레이션 민정(처음엔 민주였는데 1~3편과 맞추려고 되돌렸다) ·
  // 걸리버 강일. 나머지 넷은 내가 골랐다 — 회색 말 건석(듬직한 아빠: 걸리버를 거둔 어른 말이자 망아지의 아빠),
  // 망아지 하준(명랑한 남자 어린이), 선원 심호문(능청: 이 책 첫 거짓말이라 겉으로만 밝아야 한다),
  // 막내딸 아린이(밝은 여자아이). 야후·밤색 말·선생님 말은 대사가 없다.
  // 9쪽 회색 말 "그러면 뭐가 좋아요?"를 10쪽에서 망아지가 글자 그대로 따라 한다 — 성우가 달라 두 번 굽지만 연기는 같게 둔다.
  "걸리버 여행기 4": {
    data: "src/data/classic-books.json",
    root: "classic",
    dir: "gulliver4",
    narrators: ["tc-minjung"],
    defaultNarrator: "tc-minjung",
    cast: [
      { name: "걸리버" }, { name: "선원" }, { name: "회색 말" },
      { name: "망아지" }, { name: "막내딸" },
    ],
  },
  "개미와 베짱이": {
    data: "src/data/classic-books.json",
    root: "classic",
    dir: "antgrasshopper",
    narrators: ["tc-minjung"],
    defaultNarrator: "tc-minjung",
    cast: [{ name: "개미" }, { name: "꼬마 개미" }, { name: "베짱이" }],
  },
  "브레멘 음악대": {
    data: "src/data/classic-books.json",
    root: "classic",
    dir: "bremen",
    narrators: ["tc-minjung"],
    defaultNarrator: "tc-minjung",
    cast: [
      { name: "당나귀" }, { name: "개" }, { name: "고양이" },
      { name: "수탉" }, { name: "도둑 두목" },
    ],
  },
  "빨간 모자": {
    data: "src/data/classic-books.json",
    root: "classic",
    dir: "redridinghood",
    narrators: ["tc-minjung"],
    defaultNarrator: "tc-minjung",
    cast: [
      { name: "빨간 모자" }, { name: "엄마" }, { name: "할머니" },
      { name: "늑대" }, { name: "사냥꾼" },
    ],
  },
  "미운오리새끼": {
    data: "src/data/classic-books.json",
    root: "classic",
    dir: "uglyduckling",
    narrators: ["tc-minjung"],
    defaultNarrator: "tc-minjung",
    cast: [
      { name: "엄마 오리" }, { name: "아기 오리" }, { name: "형제들" },
      { name: "기러기" }, { name: "백조" }, { name: "아이들" },
    ],
  },
  // 세계명작 첫 책 — 원고는 classic-books.json, 소리는 public/classic/threepigs.
  "돼지 삼형제": {
    data: "src/data/classic-books.json",
    root: "classic",
    dir: "threepigs",
    narrators: ["tc-minjung"],
    defaultNarrator: "tc-minjung",
    cast: [
      { name: "엄마 돼지" }, { name: "첫째" }, { name: "둘째" },
      { name: "막내" }, { name: "늑대" },
    ],
  },
  "토끼와 거북이": {
    dir: "tortoise",
    // 나레이션 아린·다빈 → 민정 (2026-09-05 재캐스팅, F:\Dong 세션). 옛 아린·다빈 파일은 남아 있다.
    narrators: ["tc-minjung"],
    defaultNarrator: "tc-minjung",
    cast: [{ name: "토끼" }, { name: "거북이" }, { name: "부엉이" }],
  },
  "팥죽 할머니와 호랑이": {
    dir: "patjuk-halmae-tiger",
    // 나레이션 지윤 → 민정 (2026-09-05 재캐스팅, F:\Dong 세션).
    narrators: ["tc-minjung"],
    defaultNarrator: "tc-minjung",
    cast: [
      { name: "할머니" }, { name: "호랑이" }, { name: "알밤" },
      { name: "자라" }, { name: "쇠똥" }, { name: "멍석" }, { name: "지게" },
    ],
  },
  "금도끼 은도끼": {
    dir: "goldaxe",
    // 나레이션 호선 → 민정 (2026-09-01 사장님 캐스팅).
    narrators: ["tc-minjung"],
    defaultNarrator: "tc-minjung",
    cast: [
      { name: "나무꾼" }, { name: "산신령" }, { name: "욕심쟁이" }, { name: "어머니" },
    ],
  },
  "해님 달님": {
    dir: "haedal",
    // 나레이션 정순 → 민정 (2026-09-07 사장님 캐스팅). 임금님도 권일 → 종대.
    narrators: ["tc-minjung"],
    defaultNarrator: "tc-minjung",
    cast: [
      { name: "오빠" }, { name: "누이" }, { name: "동생" },
      { name: "어머니" }, { name: "호랑이" }, { name: "임금님" },
    ],
  },
  "콩쥐 팥쥐": {
    dir: "kongjwi",
    // 나레이션 정순 → 민정 (2026-09-01 사장님 캐스팅).
    narrators: ["tc-minjung"],
    defaultNarrator: "tc-minjung",
    cast: [
      { name: "콩쥐" }, { name: "팥쥐" }, { name: "새어머니" }, { name: "원님" },
      { name: "선녀" }, { name: "황소" }, { name: "두꺼비" }, { name: "참새" },
    ],
  },
  "혹부리 영감": {
    dir: "hokburi",
    // 나레이션은 지윤 — 이야기 할아버지를 쓰면 나레이션과 주인공이 같은 목소리가 된다.
    narrators: ["tc-minjung"],
    defaultNarrator: "tc-minjung",
    cast: [{ name: "할아버지" }, { name: "욕심쟁이" }, { name: "도깨비" }],
  },
  // 임금님 귀는 당나귀 귀 — 사장님 캐스팅(2026-09-04): 나레이션 민정 · 임금님 종대 · 복두장이 덕구.
  // 대숲·산수유 소리와 백성들의 말은 따옴표 없이 써서 나레이션이 읽는다.
  "임금님 귀는 당나귀 귀": {
    dir: "donkeyears",
    narrators: ["tc-minjung"],
    defaultNarrator: "tc-minjung",
    cast: [{ name: "임금님" }, { name: "복두장이" }],
  },
  // 삼년 고개 — 사장님 캐스팅(2026-09-07): 나레이션 민정 · 할아버지 종대 · 할머니 주하 · 소년 시우.
  "삼년 고개": {
    dir: "samnyeon",
    narrators: ["tc-minjung"],
    defaultNarrator: "tc-minjung",
    cast: [{ name: "할아버지" }, { name: "할머니" }, { name: "소년" }],
  },
  // 견우와 직녀 — 사장님 캐스팅(2026-09-04): 나레이션 민정 · 견우 티안 · 직녀 나진 · 임금님 왕권.
  // 이름 없는 무리(사람들·동물들·까치와 까마귀)의 대사는 crowd 배역으로 나레이션 성우가 읽는다.
  "견우와 직녀": {
    dir: "gyeonu",
    narrators: ["tc-minjung"],
    defaultNarrator: "tc-minjung",
    cast: [{ name: "견우" }, { name: "직녀" }, { name: "임금님" }],
  },
  "흥부와 놀부": {
    dir: "heungbu",
    // 나레이션을 이야기 할아버지 → 민정으로 (2026-09-01 사장님 캐스팅).
    narrators: ["tc-minjung"],
    cast: [
      { name: "흥부" }, { name: "놀부" }, { name: "형" }, { name: "형수" },
      { name: "아내" }, { name: "제비" }, { name: "도깨비" }, { name: "아이들" },
    ],
  },
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const TITLE = arg("book") ?? "토끼와 거북이";
const SPEC = BOOKS[TITLE];
if (!SPEC) throw new Error(`${TITLE} 는 BOOKS 에 등록되어 있지 않습니다`);
const DATA = SPEC.data ?? "src/data/folk-books.json";
const ROOT = SPEC.root ?? "folk";
const DIR = `public/${ROOT}/${SPEC.dir}`;
const URL_DIR = `/${ROOT}/${SPEC.dir}`;
const BAKED_NARRATORS = SPEC.narrators;
const DEFAULT_NARRATOR = SPEC.defaultNarrator ?? SPEC.narrators[0];
if (!BAKED_NARRATORS.includes(DEFAULT_NARRATOR)) {
  throw new Error(`대표 성우 ${DEFAULT_NARRATOR} 가 굽는 목록에 없습니다 — 골라도 조용해집니다`);
}
const CAST_NAMES = SPEC.cast;

/** voices.ts에서 성우 id → Typecast voiceId·모델을 읽어 온다(두 벌로 관리하지 않으려고). */
function voiceTable(): Record<string, { voiceId: string; model: string; emotions?: string[]; bakeTempo?: number }> {
  const src = fs.readFileSync("src/lib/voices.ts", "utf8");
  const table: Record<string, { voiceId: string; model: string; emotions?: string[]; bakeTempo?: number }> = {};
  const re = /id:\s*"(tc-[a-z0-9]+)"[\s\S]{0,240}?voiceId:\s*"(tc_[a-f0-9]+)"[\s\S]{0,80}?model:\s*"([^"]+)"/g;
  for (const m of src.matchAll(re)) table[m[1]] = { voiceId: m[2], model: m[3] };
  // 낼 수 있는 감정이 적힌 목소리는 그 목록도 읽는다(한 줄에 한 명씩 적혀 있다).
  for (const m of src.matchAll(/id:\s*"(tc-[a-z0-9]+)".*?emotions:\s*\[([^\]]*)\]/g)) {
    if (table[m[1]]) table[m[1]].emotions = [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  }
  // 성우 고유의 빠르기 보정(voices.ts 의 bakeTempo) — 타고나게 빨리 읽는 성우만 적혀 있다.
  for (const m of src.matchAll(/id:\s*"(tc-[a-z0-9]+)".*?bakeTempo:\s*([0-9.]+)/g)) {
    if (table[m[1]]) table[m[1]].bakeTempo = Number(m[2]);
  }
  return table;
}

/**
 * 그 목소리가 못 내는 감정은 낼 수 있는 것으로 바꾼다.
 *
 * 옛 모델(ssfm-v21)은 normal·happy·sad·angry 넷뿐인데 toneup 을 보내면 합성이
 * 거절당한다. 그러면 그 조각만 통째로 빠져 낭독이 중간에 끊긴다.
 * 치켜 외치는 줄은 happy 가 가장 가깝고, 낮추거나 속삭이는 줄은 normal 이 낫다.
 */
const EMOTION_FALLBACK: Record<string, string> = {
  toneup: "happy",
  tonedown: "normal",
  whisper: "normal",
};
function usableEmotion(v: { emotions?: string[] }, want: string): string {
  if (!v.emotions || v.emotions.includes(want)) return want;
  const alt = EMOTION_FALLBACK[want] ?? "normal";
  return v.emotions.includes(alt) ? alt : "normal";
}

/**
 * 감정 연기 세기.
 *
 * 0.6으로 구웠더니 음정이 깨져 나왔다. 특히 햄쭈처럼 원래 음높이가 높은 성우에
 * 화남·기쁨을 세게 걸면 음색까지 하이톤으로 밀려 올라간다(typecast.ts에 같은
 * 경고가 이미 적혀 있었는데 상한 0.65에 가까운 값을 넣은 게 화근이었다).
 * 연기는 살고 목소리는 안 깨지는 선이 0.4다.
 */
const EMOTION_INTENSITY = 0.4;

/**
 * 배역마다 다르게 주는 감정 세기.
 *
 * 0.4는 햄쭈처럼 원래 음높이가 높은 성우가 안 깨지는 선이다. 그런데 어른 남자
 * 목소리는 음역이 낮아 같은 값이면 연기가 밋밋하게 들린다 — 놀부가 다 잃고
 * 우는 대목이 "그냥 담담하게 말하는" 소리로 나왔다.
 * 그래서 깨질 걱정이 없는 배역만 따로 올린다.
 */
const ROLE_INTENSITY: Record<string, number> = {
  nolbu: 0.6,
  nolbuwife: 0.55,
  heungbu: 0.5,
  // 견우와 직녀 — 7쪽 이별의 슬픔과 12쪽 재회의 기쁨이 0.4에서는 밋밋했다.
  // 둘 다 어른 목소리(호선·나진)라 음정이 깨지는 선(0.6)까지 여유가 있다.
  gyeonu: 0.55,
  jiknyeo: 0.55,
};
const intensityOf = (role: string) => ROLE_INTENSITY[role] ?? EMOTION_INTENSITY;

/**
 * 웃음소리·잠자는 소리 같은 의성어가 든 줄.
 *
 * 여기에 감정 프리셋을 걸면 소리가 뭉개진다. 같은 글자인데 감정을 걸면 소리가
 * 12% 길어지는데(136KB vs 121KB), 그 늘어난 만큼을 억지로 만들어 내면서 "하하하"가
 * 지글거렸다. 의성어는 그 자체가 이미 소리라 연기를 얹을 자리가 없다.
 *
 * 늘어뜨려 읽는 것(say)도 의성어에는 쓰지 않는다 — "드르러엉"처럼 늘이면 더 뭉개진다.
 * 늘어뜨리기가 먹히는 건 "자아, 준비이… 시자악!" 같은 **말**이다.
 */
const LAUGHTER =
  /하하|호호|히히|헤헤|크크|푸하|껄껄|깔깔|부엉부엉|쿨쿨|드르렁|새근|코오|하암|스르르|푸우/;

/** 대사에 얹을 감정 — 지문은 늘 담담하게 읽는다(voices.ts의 규칙과 같은 기준). */
function emotionOf(line: string): string {
  if (LAUGHTER.test(line)) return "normal";
  if (/으악|살려|엉엉|훌쩍|눈물|슬퍼|무서|가엾|흑흑|어떡해|미안/.test(line)) return "sad";
  // '뭐라고?'는 화난 게 아니라 어이없어하는 말이다 — 화남으로 걸었더니
  // "뭐라고? 네가 나랑 시합을?"이 성난 고함처럼 깨져 나왔다.
  if (/안 돼|잡아먹|버럭|어흥|호통|이놈/.test(line)) return "angry";
  // '괜찮아'는 기쁨이 아니라 다독임이다 — 7쪽 "나는 나의 걸음으로 가면 돼"는
  // 신나서 하는 말이 아니라 조용히 다짐하는 말이라, 담담하게 읽는 편이 맞다.
  if (/만세|신나|와아|우와|기뻐|히히|하하|최고|고마워|승리/.test(line)) return "happy";
  return "normal";
}

/**
 * 지금 디스크에 있는 소리가 구워진 기준 — 씨앗(--seed)을 찍을 때만 쓴다.
 *
 * '웃음소리 줄은 감정을 걸지 않는다'는 규칙이 생기기 **직전**의 기준이다.
 * 그래서 지금 규칙과 견주면 정확히 웃음 든 줄만 달라진 것으로 잡힌다.
 * (막연히 '옛날 규칙'을 적어 두면 이미 고쳐 놓은 줄까지 또 굽는다 — 실제로 그랬다.)
 */
function oldEmotionOf(line: string): string {
  if (/하하|호호|히히|헤헤|크크|푸하|껄껄|깔깔|부엉부엉/.test(line)) return "normal";
  if (/으악|살려|엉엉|훌쩍|눈물|슬퍼|무서|가엾|흑흑|어떡해|미안/.test(line)) return "sad";
  if (/안 돼|잡아먹|버럭|어흥|호통|이놈/.test(line)) return "angry";
  if (/만세|신나|와아|우와|기뻐|최고|고마워|승리/.test(line)) return "happy";
  return "normal";
}

/**
 * 다시 구워야 하는 줄인가 — 감정이 바뀌었거나, 감정이 붙어 있어 세기가 달라졌거나.
 * 감정 없이 구운 줄(normal → normal)은 결과가 같으므로 건드리지 않는다(크레딧 절약).
 */
export function needsRebake(line: string): boolean {
  const now = emotionOf(line);
  return now !== oldEmotionOf(line) || now !== "normal";
}

let spent = 0;
let made = 0;
let skipped = 0;

/**
 * 한 조각을 굽는다.
 *
 * force가 아니면 이미 있는 파일은 건너뛴다 — 중간에 끊겨도 다시 돌리면 이어서 굽고
 * 같은 문장에 두 번 과금되지 않는다. 다시 구워야 할 때는 지우지 않고 **덮어쓴다**:
 * 지웠다가 합성이 실패하면 멀쩡하던 소리까지 사라진다.
 */
/**
 * 읽을 글에서 '소리로는 읽지 않을 말'을 뺀다.
 *
 * 글에서 지우는 게 아니라 **합성에 보낼 때만** 뺀다. 화면 글과 조각의 text 는
 * 그대로라 글자 색칠이 어긋나지 않는다. 빼고 나서 남는 게 없으면 빈 문자열을 준다.
 */
function unspokenOut(text: string, list?: string[]): string {
  if (!list?.length) return text.trim();
  let out = text;
  for (const word of list) {
    if (!word) continue;
    out = out.split(word).join(" ");
  }
  return out.replace(/\s+/g, " ").trim();
}

async function bake(
  file: string,
  text: string,
  voice: string,
  emotion: string,
  force = false,
  tempo?: number,
  /** 어느 배역의 줄인가 — 배역마다 연기 세기가 다르다(ROLE_INTENSITY). 지문이면 비운다. */
  role?: string,
  /** 이 줄만의 연기 세기(대사집·말풍선의 intensity). 있으면 배역 세기보다 앞선다. */
  lineIntensity?: number,
) {
  const table = voiceTable();
  const v = table[voice];
  if (!v) throw new Error(`성우 ${voice}를 voices.ts에서 못 찾았습니다`);
  // 빠르기는 줄(대사집 tempo) → 배역(책의 voiceTempo) → 성우(bakeTempo) 순으로 정한다.
  // 지문은 줄·배역 빠르기가 없으니 성우 보정만 받는다 — 진서처럼 빠른 나레이터를 민정에 맞춘다.
  tempo = tempo ?? v.bakeTempo;
  const wanted = emotion;
  emotion = usableEmotion(v, emotion);
  if (emotion !== wanted) console.log(`  (감정 바꿈) ${voice}는 ${wanted}를 못 냅니다 → ${emotion}`);
  const out = path.join(DIR, file);
  // 줄에 적힌 세기가 배역 세기를 이긴다 — 한 줄만 세게 하려고 배역 전체를 올리면
  // 그 배역의 다른 줄까지 같이 세진다(해님 달님 누이 19쪽이 그렇게 망가질 뻔했다).
  const strength = Math.min(0.65, Math.max(0.3, lineIntensity ?? intensityOf(role ?? "")));
  const recipe: Recipe = {
    voice,
    emotion,
    intensity: emotion === "normal" ? null : strength,
    text,
    ...(tempo && tempo !== 1 ? { tempo } : {}),
  };
  fresh[keyOf(file)] = recipe;
  // 기록만 남기는 모드 — 지금 파일을 그대로 인정하고 넘어간다.
  if (SEED) {
    skipped += 1;
    return;
  }
  if (ADOPT) {
    // 파일이 없으면 인정할 것도 없다 — 기록에서 빼서 다음에 굽게 둔다.
    if (!fs.existsSync(out)) delete fresh[keyOf(file)];
    skipped += 1;
    return;
  }
  // 파일이 있고 조건도 똑같으면 다시 부를 이유가 없다.
  if (!force && fs.existsSync(out) && same(recorded[keyOf(file)], recipe)) {
    skipped += 1;
    return;
  }
  spent += text.length;
  if (DRY) {
    made += 1;
    console.log(`  [리허설] ${file}  ${voice}/${emotion}  ${text.length}자  ${text.slice(0, 30)}`);
    return;
  }
  const res = await fetch(`${BASE}/api/tts`, {
    method: "POST",
    redirect: "manual", // 되돌림을 따라가면 남의 앱 로그인 화면(HTML)을 소리로 저장한다
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text,
      voiceId: v.voiceId,
      model: v.model,
      emotion,
      intensity: emotion === "normal" ? undefined : strength,
      tempo,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${file} 실패 (HTTP ${res.status}) ${body.slice(0, 200)}`);
  }
  /*
   * 받은 것이 진짜 소리인지 확인한다.
   *
   * 2026-09-09 에 13개를 헛구웠다. BAKE_BASE 가 가리킨 3000번 포트에 **다른 프로젝트**가
   * 떠 있었고, 그 앱이 /api/tts 를 /login 으로 되돌려서(307) fetch 가 따라갔다.
   * 돌아온 건 HTML 인데 res.ok 가 참이라 그대로 mp3 로 저장됐다 — 13개 파일이 모두
   * 13,549 바이트로 똑같았다. 게다가 기록(manifest)까지 남아서 다시 구우려 해도
   * "이미 있다"고 건너뛴다. 조용히 망가지는 길이라 여기서 막는다.
   */
  const kind = res.headers.get("content-type") ?? "";
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!/^audio\//i.test(kind)) {
    throw new Error(
      `${file} — 소리가 아니라 ${kind || "알 수 없는 것"} 이 왔습니다 (${bytes.length}바이트). ` +
        `BAKE_BASE(${BASE}) 가 이 프로젝트의 개발 서버를 가리키는지 확인하세요.`,
    );
  }
  fs.writeFileSync(out, bytes);

  made += 1;
  console.log(`  구움 ${file}  ${voice}/${emotion}  ${text.length}자`);
  // 몰아치지 않게 살짝 쉰다.
  await new Promise((r) => setTimeout(r, 250));
}

const books = JSON.parse(fs.readFileSync(DATA, "utf8"));
const book = books.find((b: { title: string }) => b.title === TITLE);
if (!book) throw new Error(`${TITLE}를 못 찾았습니다`);
const cast: Record<string, string> = book.voiceCast;
if (!cast?.narration) throw new Error("voiceCast가 없습니다");

// ── 굽기 전 점검: 대사집이 본문과 맞는지, 배역 없는 대사가 없는지
const problems: string[] = [];
/*
 * 막지는 않지만 눈에는 띄어야 하는 것 — 나레이션이 읽게 된 속마음.
 * 조용히 새서 앱에서야 들켰다(해님 달님 6쪽 호랑이 '옳지!…'가 나레이션 목소리로 나갔다).
 */
const notices: string[] = [];
for (const [i, p] of book.pages.entries()) {
  for (const stale of unmatchedLines(String(p.text), p.lines)) {
    problems.push(`${i + 1}쪽 대사집이 본문에 없음: ${stale.text}`);
  }
  const plan = planPageVoices({ text: String(p.text), lines: p.lines, cast: CAST_NAMES, roleOf: book.roleOf });
  for (const s of unassignedDialogue(plan)) problems.push(`${i + 1}쪽 배역 미정: ${s.text.trim()}`);
  for (const s of narratedThoughts(plan)) {
    notices.push(`${i + 1}쪽 속마음을 나레이션이 읽습니다: ${s.text.trim()}`);
  }
  for (const s of plan) {
    if (s.who !== NARRATION && !cast[s.who]) problems.push(`${i + 1}쪽 배역 ${s.who}의 성우가 없음`);
  }
}
if (notices.length) {
  console.log("알림 — 배역을 주려면 대사집(lines)에 적으세요:");
  for (const n of notices) console.log("  · " + n);
  console.log("");
}
if (problems.length) {
  console.error("굽기 전 문제를 먼저 고쳐야 합니다:");
  for (const p of problems) console.error("  ★ " + p);
  process.exit(1);
}

fs.mkdirSync(DIR, { recursive: true });

for (const [i, page] of book.pages.entries()) {
  const n = i + 1;
  const plan = planPageVoices({
    text: String(page.text),
    lines: page.lines,
    cast: CAST_NAMES,
    roleOf: book.roleOf,
  });
  console.log(`[${n}쪽]`);
  const segments: { who: string; src: string; text: string }[] = [];
  for (const [j, seg] of plan.entries()) {
    const text = seg.text.trim();
    if (!text) {
      /*
       * 공백뿐인 조각 — 소리로 만들 것은 없지만 **글자는 잃으면 안 된다**.
       *
       * 대사가 연달아 나오면 그 사이 줄바꿈이 홀로 한 조각이 된다. 예전엔 그냥
       * 건너뛰어서 조각을 이어 붙여도 본문과 한 글자가 어긋났다(돼지 삼형제 9쪽).
       * 색칠은 조각의 글자 수를 세어 따라가므로, 한 글자만 밀려도 그 뒤가 다 밀린다.
       * 앞 조각의 글에 붙여 둔다 — 읽는 글은 trim 해서 넘기므로 소리는 그대로다.
       */
      const prev = segments[segments.length - 1];
      if (prev) prev.text += seg.text;
      continue;
    }
    if (seg.who === NARRATION) {
      /*
       * 화면에는 두고 소리로는 읽지 않을 말(page.unspoken).
       *
       * 소리 흉내 중에는 합성이 유독 뭉개지는 것이 있다 — 해님 달님 7쪽의 "똑똑똑."
       * 이 그랬다(사장님이 듣고 잡아 주셨다). 글에서 빼면 그림책의 맛이 사라지고,
       * 그대로 두면 소리가 깨진다. 그래서 **읽을 때만** 뺀다.
       * 조각의 text 는 그대로 두므로 글자 색칠은 화면 글과 계속 맞는다.
       */
      // 줄만 바꾼 자리에 숨을 넣고(breathe), 소리로 안 읽을 말을 뺀다 — 둘 다 합성에 보낼 글에만.
      const spoken = unspokenOut(breathe(text), page.unspoken);
      if (!spoken) {
        // 통째로 안 읽는 조각 — 소리를 만들지 않고 글만 앞 조각에 붙인다.
        const prev = segments[segments.length - 1];
        if (prev) prev.text += seg.text;
        else console.log(`  (건너뜀) ${n}쪽 첫 조각이 통째로 안 읽는 말입니다`);
        continue;
      }
      // 지문은 고를 수 있는 성우마다 한 벌씩. 뷰어가 seg- 뒤에 성우를 끼워 넣는다.
      for (const voice of BAKED_NARRATORS) {
        await bake(`seg-${voice}-p${n}-${j}.mp3`, spoken, voice, "normal");
      }
      segments.push({ who: NARRATION, src: `${URL_DIR}/seg-p${n}-${j}.mp3`, text: seg.text });
    } else {
      // 대사는 배역이 성우를 정하므로 한 벌이면 된다.
      // 읽기용 표기(say)가 있으면 화면 글 대신 그걸 읽는다 — "자아, 준비이… 시작!"
      const file = `seg-cast-p${n}-${j}.mp3`;
      // 조건이 달라졌는지는 bake()가 기록을 보고 판단한다. --changed가 아니면 전부 다시.
      // 줄 단위 속도(대사집 tempo)가 있으면 그게 배역 속도(voiceTempo)보다 앞선다.
      await bake(
        file,
        breathe(seg.say?.trim() || text),
        cast[seg.who],
        seg.feel ?? emotionOf(text),
        !ONLY_CHANGED,
        seg.tempo ?? book.voiceTempo?.[seg.who],
        seg.who,
        seg.intensity,
      );
      segments.push({ who: seg.who, src: `${URL_DIR}/seg-cast-p${n}-${j}.mp3`, text: seg.text });
    }
  }
  page.segments = segments;

  // 말풍선(그림 속 캐릭터를 눌렀을 때) — 배역 목소리로 다시 굽는다.
  for (const h of page.hotspots ?? []) {
    const voice = cast[h.label];
    if (!voice) {
      console.log(`  (건너뜀) 말풍선 ${h.label} — 배역에 성우가 없음`);
      continue;
    }
    const file = path.posix.basename(String(h.audio));
    const line = String(h.line);
    // 말풍선도 읽기용 표기를 따로 줄 수 있다(말풍선 글은 h.line 그대로 보인다).
    const spoken = breathe(typeof h.say === "string" && h.say.trim() ? h.say.trim() : line);
    // 말풍선도 대사집처럼 연기를 못 박을 수 있다(h.feel) — 자동 판정이 틀리는 줄용.
    // 말풍선도 줄 단위 빠르기(h.tempo)가 배역 빠르기보다 앞선다 — 대사 조각과 같은 규칙.
    await bake(file, spoken, voice, h.feel ?? emotionOf(line), !ONLY_CHANGED, h.tempo ?? book.voiceTempo?.[h.label], h.label, h.intensity);
  }
}

// 미리 구운 성우만 고를 수 있게 목록을 줄인다 — 안 구운 성우를 고르면 조용해진다.
book.narrators = BAKED_NARRATORS;
book.narrator = DEFAULT_NARRATOR;

if (!DRY) {
  fs.writeFileSync(DATA, JSON.stringify(books, null, 2) + "\n", "utf8");
  if (SEED) {
    // 씨앗은 '옛 규칙'으로 찍는다 — 지금 디스크에 있는 소리가 그 규칙으로 구워졌다.
    for (const [key, r] of Object.entries(fresh)) {
      const old = oldEmotionOf(r.text);
      fresh[key] = { ...r, emotion: old, intensity: old === "normal" ? null : EMOTION_INTENSITY };
    }
  }
  console.log("\n책 데이터에 조각 목록을 기록했습니다.");
  /*
   * 기록은 **덮어쓰지 않고 합친다**.
   *
   * 예전엔 이번 책 것(fresh)만 통째로 써서, 흥부와 놀부를 구우면 토끼와 거북이
   * 기록이 지워졌다. 그러면 다음에 --changed 를 줘도 “기록에 없다 → 다 새로 굽자”가
   * 되어 이미 구운 것을 또 굽는다 — 실제로 374자면 될 것을 1,438자 썼다.
   * 기록 파일은 모든 책이 함께 쓰므로 다른 책 줄을 남겨 둔다.
   */
  const merged = { ...recorded, ...fresh };
  fs.writeFileSync(MANIFEST, JSON.stringify(merged, null, 2) + "\n", "utf8");
  console.log(
    `굽기 기록을 ${MANIFEST}에 남겼습니다 ` +
      `(이번 책 ${Object.keys(fresh).length}개 · 전체 ${Object.keys(merged).length}개).`,
  );
}
console.log(`\n${DRY ? "[리허설] " : ""}만든 파일 ${made}개 · 건너뜀 ${skipped}개 · 합성 ${spent}자`);
