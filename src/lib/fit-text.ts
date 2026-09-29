/**
 * 본문이 칸을 넘칠 때 얼마나 줄일지 고른다 — 그림책에 스크롤바가 보이면 책이 아니게 된다.
 *
 * DOM 재기와 분리해 둔다. 실제 크기는 브라우저만 알지만 "얼마나 줄일까"를 고르는 셈법은
 * 순수하게 떼어낼 수 있고, 그래야 테스트로 지킬 수 있다. 예전에 이 셈법이 조용히
 * 어긋나 긴 쪽 마지막 줄이 뭉텅 잘려 나갔는데 아무도 몰랐다.
 */

/** 아무리 길어도 이보다 작게는 줄이지 않는다 — 더 줄이면 아이가 못 읽는다. */
export const MIN_FIT = 0.42;

/**
 * 들어가는 가장 큰 배율을 찾는다(이분 탐색).
 *
 * @param fits  그 배율로 그렸을 때 칸에 들어가는지. 브라우저에서는 실제로 글자 크기를
 *              바꿔 보고 재는 함수가 들어온다.
 * @param min   더 줄이지 않을 바닥값.
 * @param steps 재는 횟수. 9번이면 1~0.42 구간을 0.2% 안쪽까지 좁힌다.
 * @returns     1이면 줄일 필요가 없다는 뜻.
 *
 * 바닥값에서도 안 들어가면 바닥값을 준다 — 조금 잘리더라도 글자가 읽을 수 없을
 * 만큼 작아지는 것보다 낫다.
 */
export function fitScale(
  fits: (scale: number) => boolean,
  min = MIN_FIT,
  steps = 9,
): number {
  if (fits(1)) return 1;
  let low = min;
  let high = 1;
  for (let n = 0; n < steps; n++) {
    const mid = (low + high) / 2;
    if (fits(mid)) low = mid;
    else high = mid;
  }
  return low;
}

/*
 * ── 표지 제목 ──────────────────────────────────────────────────────────────
 *
 * 표지 명패에 제목을 어디서 끊어 몇 줄로, 몇 px 로 쓸지 정한다.
 *
 * 예전엔 브라우저가 알아서 줄을 바꿨는데, 한글은 기본값이 "글자마다 끊어도 됨"이라
 * "하온이의 포도밭 나들 / 이"처럼 낱말 한가운데가 잘렸다(사장님 제보, 09-29). 게다가
 * 클라이언트 요청이 "하온이의 / 포도밭 나들이"처럼 '누구누구의'를 윗줄에 따로 두는
 * 것이라, 어디서 끊을지를 여기서 직접 고르고 BookCover 는 고른 줄을 그대로 쓴다.
 *
 * 브라우저에서 재지 않고 글자 폭 표로 셈한다. 표지는 한 화면에 여러 권이 깔리는데
 * 권마다 재면 그릴 때마다 레이아웃이 출렁이고, 제목은 미리 알 수 있다.
 */

/** 표지 제목 기본 크기(px). 한 줄 제목은 이 크기로 쓴다. */
const COVER_TITLE_PX = 13;

/** 표지 제목 줄 간격(em). BookCover 가 이 값으로 그리고, 아래 높이 셈도 이 값을 쓴다. */
export const COVER_TITLE_LEADING = 1.15;

/**
 * 두 줄일 때 배율 상한 — 명패 높이가 정한다. 예전 두 줄 값 0.8(10.4px)을 그대로 둔다.
 * 176px 표지에서 명패가 표지 높이의 10%를 넘는 테마(동화나라·공룡·사탕·공주)엔 두 줄이 이
 * 크기로 들어가고, 더 얕은 명패(9~9.6%)에선 coverTitleFontSize 의 높이 한도가 9.7~10.4px 로
 * 마저 줄인다.
 */
const TWO_LINE_SCALE = 0.8;

/**
 * 기준 명패에서 줄이는 바닥(0.62배 ≈ 8px, 예전 가장 작은 값). 이건 기준 크기의 바닥일 뿐이고,
 * 실제 글자 크기의 바닥은 아래 COVER_TITLE_MIN_PX 다 — 폰·좁은 명패에선 그 사이까지 더 준다.
 */
const MIN_COVER_SCALE = 0.62;

/**
 * 표지 제목 글자의 진짜 바닥(px). 이보다 작으면 아이 책 제목으로 못 읽는다.
 *
 * 편집 칸이 제목을 40자까지 받아서, 한 줄에 열몇 자씩 들어가는 아주 긴 제목은 폭 한도만
 * 따르면 5px 까지 내려갔다(리뷰, 09-29). 그런 제목은 이 크기에서 멈추고, 넘치는 낱말은
 * BookCover 가 둘째 줄 끝에서 "…"로 줄인다 — 예전에도 긴 제목은 그렇게 보였다.
 *
 * 값은 보통 제목이 쓰는 가장 작은 크기(폰 우주나라 명패의 두 줄 ≈ 7.8px)보다 살짝 아래라,
 * 보통 제목은 건드리지 않고 아주 긴 제목만 붙잡는다. 그 위로 올리면 얕은 명패에서 두 줄이
 * 명패 높이를 넘는다 — 딸린 책·캡처 제목이 모든 테마에 들어가는지 테스트가 지킨다.
 */
export const COVER_TITLE_MIN_PX = 7.5;

/**
 * 줄을 고를 때 기준으로 삼는 명패 폭(px). 책장 표지는 넓은 화면에서 176px(sm:w-44),
 * 폰에서 144px(w-36)이고, 명패 폭은 테마마다 표지의 49~58%다. 사장님이 보는 넓은
 * 화면·가운데쯤 명패(53%)로 잡는다: 176 × 0.53 ≈ 93px. 사장님 캡처("하온이의 포도밭
 * 나들 / 이")가 딱 이 폭에서 나온 모양이다. 줄 나누기는 어느 화면·테마에서나 같게 하고,
 * 폰·좁은 명패에선 coverTitleFontSize 가 실제 칸에 맞춰 글자만 더 줄인다.
 */
const REF_PLAQUE_PX = 176 * 0.53;

/** 명패의 90%만 글자로 채운다 — 끝까지 꽉 차면 답답하다. */
const COMFORT = 0.9;

/** 13px 로 한 줄에 편히 들어가는 폭(em). ≈6.46em = 한글 7자 + 띄어쓰기 1칸. */
const LINE_CAP_EM = (REF_PLAQUE_PX * COMFORT) / COVER_TITLE_PX;

/**
 * 글자 하나의 폭(em) — 표지 제목 글꼴 Pretendard ExtraBold(wght 800) 폰트 파일의 글자 폭
 * 표에서 잰 값. 한글은 모든 글자가 0.864em 로 같고 띄어쓰기는 그 4분의 1 남짓이라,
 * 글자 수로 세면 띄어쓰기 많은 제목을 부풀려 센다. 숫자·영문·부호는 대략값이다.
 */
function charEm(ch: string): number {
  const c = ch.codePointAt(0) ?? 0;
  if ((c >= 0xac00 && c <= 0xd7a3) || (c >= 0x3131 && c <= 0x318e)) return 0.864;
  if (/\s/.test(ch)) return 0.225;
  if (c >= 0x30 && c <= 0x39) return 0.63;
  if (c >= 0x41 && c <= 0x5a) return 0.68;
  if (c >= 0x61 && c <= 0x7a) return 0.56;
  if (",.:;!'·".includes(ch)) return 0.3;
  if (c < 0x80) return 0.55; // ? ~ - " 같은 나머지 영문 부호
  return 1; // 한자·그림 글자 — 넉넉히 한 칸
}

/** 줄 하나가 차지하는 폭(em). */
export function titleEm(text: string): number {
  let em = 0;
  for (const ch of text) em += charEm(ch);
  return em;
}

/**
 * 한글 글자 몸의 높이(em) — 기준선 위 0.81em, 아래 0.12em. 폰트 파일에서 한글 전부의
 * 가장 높은 곳(ㅎ 꼭지)·가장 낮은 곳을 잰 값이다.
 */
const HANGUL_INK_EM = 0.93;

/**
 * n줄 글자 몸의 높이(em) — 첫 줄 글자 꼭대기부터 끝 줄 글자 바닥까지. 줄 칸(1.15em)엔
 * 글자 위아래로 빈 자리가 조금씩 있어서, 가운데 맞춤한 두 줄이 명패보다 살짝 커도 글자는
 * 명패 안에 있다 — 넘치는 건 이 높이부터. (예전엔 글자 몸을 0.9em 로 잡아 조금 작게 셌다.)
 */
export function inkEm(lines: number): number {
  return COVER_TITLE_LEADING * (lines - 1) + HANGUL_INK_EM;
}

/**
 * 높이 한도에서 미리 빼 두는 몫(px) — 브라우저가 글자 자리를 반올림하는 몫.
 *
 * 브라우저는 글꼴 윗길이·아랫길이를 정수 px 로 반올림하고, 줄 칸 위쪽 빈 자리(글자 몸보다 줄 칸이
 * 좁아 음수다)는 내림한다. 그래서 글자가 계산보다 1~2px 위로 올라갈 수 있다. 크롬에서 재 보니
 * 폰 표지(144px)·배율 1 화면의 얕은 명패(우주나라)에서 첫 줄 꼭대기가 명패 칸 위로 1.8px
 * 나갔다(리뷰, 09-29). 1px 를 빼 두면 모든 테마에서 가장 많이 나가는 곳이 0.7px 로 줄고,
 * 명패 그림엔 잰 칸 위아래로 1px 남짓 크림색 여백이 더 있어 그 안에 머문다. 배율 2·3 화면은
 * 반올림이 절반·삼분의 일이라 거의 안 나간다. 대신 높이가 정하는 두 줄 글자가 0.5px 쯤 작다.
 *
 * 글자가 잘리지 않는 건 이 몫이 아니라 BookCover 가 지킨다 — 명패가 세로로는 자르지 않는다.
 */
export const COVER_TITLE_ROUNDING_PX = 1;

/** 이 말로 끝나는 낱말 뒤는 말이 한 번 쉬는 자리 — "팥죽 할머니와 / 호랑이", "숲속의 / 작은 집". */
const JOINERS = [
  "이랑", "하고", "에서", "에게", "한테", "으로", "처럼", "까지", "부터", "보다",
  "와", "과", "랑", "에", "로", "를", "을", "도", "의",
];

/**
 * 는·은은 "임금님 귀는 / 당나귀 귀"처럼 쉬는 자리일 때도 있지만 "반짝이는 마라카스"처럼
 * 뒷말을 꾸밀 때도 많아서 약하게 본다 — 와·과 같은 더 좋은 자리가 있으면 그쪽이 이긴다.
 * 이·가는 아예 안 본다. "하온이·호랑이·나들이"처럼 이름·낱말 끝 글자와 구별이 안 된다.
 */
const WEAK_JOINERS = ["는", "은"];

/**
 * 끝 글자만 조사처럼 생긴 낱말 — 동화 제목에 잘 나오는 것만 적는다. '도'로 끝나는 땅 이름
 * (제주도·강원도…)은 가족 나들이 이야기에 잘 나와서 넣었다. 안 넣으면 "하온이와 제주도 /
 * 바다 여행"처럼 땅 이름 뒤를 '~도' 조사로 알고 끊었다(리뷰, 09-29).
 */
const NOT_JOINER = new Set([
  "사과", "포도", "지도", "파도", "복도", "사랑", "노랑", "파랑", "미로", "도로",
  "마을", "가을", "노을", "거의", "회의", "주의", "정의", "예의", "태권도",
  "제주도", "강화도", "울릉도", "독도", "거제도", "강원도", "경기도", "충청도", "전라도", "경상도",
]);

/** '누구누구의' — "하온이의", "오즈의". */
function isPossessive(word: string): boolean {
  return word.length >= 2 && word.endsWith("의") && !NOT_JOINER.has(word);
}

const endsWithAny = (word: string, list: string[]) =>
  !NOT_JOINER.has(word) && list.some((j) => word.length > j.length && word.endsWith(j));

/** '~와·~랑' — 둘을 잇는 말. "하온이와 엄마의", "하온이랑 같이". */
const AND_JOINERS = ["이랑", "하고", "와", "과", "랑"];

/**
 * 자리·대상을 나타내는 조사 — "집에", "방에서", "별을", "나라로". 이렇게 끝나는 낱말은 뒤의
 * 움직임 말("간", "생긴")에 붙으니, 바로 앞 '누구누구의'는 제목 전체가 아니라 이 낱말 하나만
 * 꾸민다("할머니의 집에 / 간 하온이"). 그 사이를 끊으면 '할머니의 집'이 두 줄로 찢어진다.
 */
const CASE_JOINERS = ["에서", "에게", "한테", "으로", "처럼", "까지", "부터", "보다", "에", "로", "를", "을"];

/** "함께"·"같이"(와 "함께한"·"함께하는") — '누구와 함께'는 한 덩어리라 그 앞에서 안 끊는다. */
const isTogether = (word: string) => /^(함께|같이)/.test(word);

/**
 * 제목 맨 앞 '누구누구의' 덩어리가 몇 낱말인지 — "하온이의" 1, "하온이와 엄마의" 2, 없으면 0.
 * "하온이와 엄마의 / 봄 소풍"은 '하온이와 엄마의'가 통째로 주인이라 "하온이의 / …"와 같은 자리다.
 */
function ownerWords(words: string[]): number {
  if (isPossessive(words[0])) return 1;
  if (words.length > 2 && endsWithAny(words[0], AND_JOINERS) && isPossessive(words[1])) return 2;
  return 0;
}

/**
 * words[i] 뒤에서 끊기가 얼마나 자연스러운지. 클수록 좋다.
 *
 * 0 으로 막는 자리가 먼저다 — 조사로 끝나도 거기서 끊으면 한 덩어리가 찢어지는 자리:
 * "하온이와 / 함께 떠나는"('와 함께'), "하온이와 / 엄마의 봄 소풍"('와 엄마의'),
 * "할머니의 / 집에 간"('의 집에'). 이런 줄은 한 줄이 짧아 보여도 읽을 때 걸린다(리뷰, 09-29).
 */
function breakStrength(words: string[], i: number, owner: number): number {
  const word = words[i];
  const next = words[i + 1] ?? "";
  if (isTogether(next)) return 0;
  if (endsWithAny(word, AND_JOINERS) && isPossessive(next)) return 0;
  if (isPossessive(word) && endsWithAny(next, CASE_JOINERS)) return 0;
  if (i === owner - 1) return 3; // "하온이의 / 포도밭 나들이" — 클라이언트 요청
  if (/[,.!?:;~·…]$/.test(word)) return 2.5; // 쉼표 뒤는 글에서도 쉬는 자리
  if (isTogether(word)) return 2; // "하온이와 함께 / 떠나는 우주 여행"
  if (endsWithAny(word, JOINERS)) return 2;
  if (endsWithAny(word, WEAK_JOINERS)) return 1;
  return 0;
}

/**
 * '누구누구의' 뒷말이 한 낱말 세 글자 이하면 굳이 두 줄로 안 나눈다 — "오즈의 마법사",
 * "토끼의 재판", "하온이의 생일"은 한 덩어리로 읽히고, 한 줄이면 글자도 더 크다.
 * 뒷말이 두 낱말 이상이거나 네 글자 이상이면("하온이의 / 포도밭 나들이", "서준이의 /
 * 공룡탐험") 한 줄에 들어가더라도 나눈다 — 'OO의' 책이 책장에 나란히 설 때 모양이 같게.
 */
function restIsTiny(rest: string[]): boolean {
  return rest.length === 1 && [...rest[0]].length <= 3;
}

/**
 * 표지 제목을 1~2줄로 나눈다. 낱말 가운데서는 절대 안 끊고 띄어쓰기에서만 끊는다.
 *
 * 1. 맨 앞이 '누구누구의'("하온이의", "하온이와 엄마의")고 뒷말이 짧지 않으면 → 그 뒤에서
 *    끊는다. 단 '누구누구의'가 뒷낱말 하나만 꾸밀 때("할머니의 집에 간 하온이")는 빼고.
 * 2. 아니면 한 줄에 편히 들어가는 제목은 한 줄("흥부와 놀부", "금도끼 은도끼").
 * 3. 두 줄이면 끊을 자리마다 점수를 매긴다: '누구누구의' > 쉼표 > 와·과·에서·를 같은
 *    조사 > 는·은 > 아무 자리. 같은 급이면 두 줄 길이가 고른 쪽. 한 글자만 남는 줄은
 *    마지막 수단. 한 줄이 너무 길어져 글자가 15% 넘게 작아지는 자리는 아예 안 본다.
 *    '와 함께'·'와 엄마의'·'의 집에'처럼 한 덩어리 가운데는 조사가 있어도 안 끊는다.
 *
 * 줄을 이으면 원래 제목과 같다(띄어쓰기 여러 칸은 한 칸으로 — 화면에서도 한 칸이다).
 */
export function coverTitleLines(title: string): string[] {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return words;

  const whole = words.join(" ");
  const owner = ownerWords(words);
  const rest = words.slice(owner);
  const ownerLine = owner > 0 && !restIsTiny(rest) && !endsWithAny(rest[0], CASE_JOINERS);
  if (!ownerLine && titleEm(whole) <= LINE_CAP_EM) return [whole];

  const splits = words.slice(1).map((_, i) => {
    const lines = [words.slice(0, i + 1).join(" "), words.slice(i + 1).join(" ")];
    const ems = lines.map(titleEm);
    return {
      lines,
      ems,
      scale: Math.min(TWO_LINE_SCALE, LINE_CAP_EM / Math.max(...ems)),
      strength: breakStrength(words, i, owner),
    };
  });
  const bestScale = Math.max(...splits.map((s) => s.scale));

  let pick = splits[0];
  let top = -Infinity;
  for (const s of splits) {
    if (s.scale < bestScale * 0.85) continue;
    const balance = Math.min(...s.ems) / Math.max(...s.ems); // 1 = 두 줄 길이가 같음
    const orphan = s.lines.some((l) => [...l].length === 1) ? 2 : 0;
    const score = s.strength + 1.2 * balance - orphan;
    if (score > top) {
      top = score;
      pick = s;
    }
  }
  return pick.lines;
}

/**
 * 표지 명패 안 제목 글자를 기본 13px 에서 얼마나 줄일지 — 기준 명패(REF_PLAQUE_PX)에서.
 *
 * 줄을 직접 나누므로 글자 수가 아니라 "가장 긴 줄"과 "줄 수"로 정한다. 한 줄은 13px,
 * 두 줄은 명패 높이 때문에 0.8배가 상한이고, 긴 줄이 명패 폭을 넘으면 그만큼 더 준다.
 * 예전엔 16자 넘는 제목을 두 줄로 나눠도 0.62배까지 줄였는데, 이제 줄마다 짧으면
 * 0.8배 그대로 크게 쓴다.
 *
 * (예전 제보: 두 줄이 되는 순간 아랫줄이 리본 밖으로 흘러내렸다 — "팥죽 할머니와
 * 호랑이"의 '랑이'가 리본 아래 표지 위에 떠 있었다. 두 줄 상한 0.8은 그때 맞춘 값이다.)
 */
export function coverTitleScale(title: string): number {
  const lines = coverTitleLines(title);
  if (lines.length === 0) return 1;
  const widest = Math.max(...lines.map(titleEm));
  const cap = lines.length > 1 ? TWO_LINE_SCALE : 1;
  return Math.max(MIN_COVER_SCALE, Math.min(cap, LINE_CAP_EM / widest));
}

/** 가장 긴 줄이 명패 폭을 넘지 않게 남겨 두는 여유 — 반올림·글꼴 차이 몫. */
const FIT_SLACK = 0.95;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * 표지 제목의 CSS font-size —
 * `max(바닥px, min(기준 크기px, 폭 한도cqw, calc((명패 높이cqh - 반올림 몫px) / 글자 몸 높이)))`.
 *
 * coverTitleScale 은 기준 명패(넓은 화면, 가운데쯤 폭) 크기다. 그런데 폰 표지는 144px 로
 * 더 작고 명패 폭·높이도 테마마다 달라서, 거기서 13px 를 그대로 쓰면 긴 줄이 명패를 넘는다.
 * 줄을 직접 나눴으니 넘치면 브라우저가 낱말째 셋째 줄로 밀어 가려 버린다. 그래서 실제
 * 명패(표지 대비 %) 안에 가장 긴 줄과 줄 수가 들어가는 크기를 컨테이너 단위로 함께
 * 준다 — BookCover 가 표지 크기의 컨테이너를 깔고 쓴다. 넓은 화면에선 대개 기준 크기가
 * 그대로 이기고, 좁은 칸에서만 한도가 이긴다. 한도가 아무리 작아도 COVER_TITLE_MIN_PX 밑으로는
 * 안 내려간다.
 *
 * @param box 명패의 표지 대비 폭·높이("52.9%" 같은 테마 값).
 */
export function coverTitleFontSize(title: string, box: { width: string; height: string }): string {
  const lines = coverTitleLines(title);
  const parts = [`${round2(COVER_TITLE_PX * coverTitleScale(title))}px`];
  const widest = Math.max(0, ...lines.map(titleEm));
  const w = parseFloat(box.width);
  const h = parseFloat(box.height);
  if (widest > 0 && w > 0) parts.push(`${round2((w * FIT_SLACK) / widest)}cqw`);
  if (lines.length > 0 && h > 0) {
    parts.push(`calc((${h}cqh - ${COVER_TITLE_ROUNDING_PX}px) / ${round2(inkEm(lines.length))})`);
  }
  return `max(${COVER_TITLE_MIN_PX}px, min(${parts.join(", ")}))`;
}
