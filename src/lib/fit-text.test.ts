import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  COVER_TITLE_MIN_PX,
  COVER_TITLE_ROUNDING_PX,
  coverTitleFontSize,
  coverTitleLines,
  coverTitleScale,
  fitScale,
  inkEm,
  MIN_FIT,
  titleEm,
} from "./fit-text.ts";
import { THEMES } from "./themes.ts";

describe("fitScale — 본문이 칸에 들어가게 줄이기", () => {
  it("이미 들어가면 줄이지 않는다", () => {
    assert.equal(fitScale(() => true), 1);
  });

  it("들어가는 가장 큰 배율을 고른다", () => {
    // 0.7 이하면 들어가는 칸. 0.7 바로 아래를 골라야 한다.
    const scale = fitScale((s) => s <= 0.7);
    assert.ok(scale <= 0.7, `${scale} 는 0.7 보다 크면 안 된다`);
    assert.ok(scale > 0.69, `${scale} 는 0.7 에 바짝 붙어야 한다`);
  });

  it("아무리 줄여도 안 들어가면 바닥값을 준다", () => {
    // 글자가 읽을 수 없을 만큼 작아지느니 조금 잘리는 편이 낫다.
    assert.equal(fitScale(() => false), MIN_FIT);
  });

  it("바닥값 아래로는 내려가지 않는다", () => {
    const seen: number[] = [];
    fitScale((s) => {
      seen.push(s);
      return false;
    });
    assert.ok(Math.min(...seen) >= MIN_FIT, `${Math.min(...seen)} 이 바닥값보다 작다`);
  });

  it("재는 횟수만큼만 부른다 — 느려지면 넘길 때 덜컥거린다", () => {
    let calls = 0;
    fitScale(() => {
      calls += 1;
      return false;
    }, MIN_FIT, 9);
    assert.equal(calls, 10); // 1배율 확인 1번 + 이분 탐색 9번
  });

  it("긴 쪽일수록 더 많이 줄인다", () => {
    // 흥부와 놀부 7쪽(167자)처럼 긴 쪽은 짧은 쪽보다 더 작아져야 한다.
    const short = fitScale((s) => s <= 0.95);
    const long = fitScale((s) => s <= 0.55);
    assert.ok(long < short, `긴 쪽(${long})이 짧은 쪽(${short})보다 작아야 한다`);
  });
});

describe("coverTitleScale", () => {
  it("짧은 제목은 줄이지 않는다", () => {
    assert.equal(coverTitleScale("흥부와 놀부"), 1);
  });

  it("두 줄이면 줄이고, 가장 긴 줄이 길수록 더 줄인다", () => {
    const one = coverTitleScale("흥부와 놀부");
    const a = coverTitleScale("팥죽 할머니와 호랑이");
    const b = coverTitleScale("노란 킥보드와 따르릉 약속");
    const c = coverTitleScale("하온이의 반짝반짝 한강버스 소풍 대작전");
    assert.ok(a < one, "두 줄은 명패 높이 때문에 한 줄보다 작아야 한다");
    // 예전엔 글자 수로 정해서 b 가 a 보다 작았다. 이제 줄을 직접 나누니 "노란 킥보드와 /
    // 따르릉 약속"은 줄마다 짧아 a 와 같은 두 줄 크기로 크게 쓴다 — 줄였던 까닭이 없어졌다.
    assert.equal(b, a);
    assert.ok(c < a, `가장 긴 줄이 명패를 넘으면 더 줄여야 한다 (${c} < ${a})`);
  });

  it("아무리 길어도 읽을 수 있는 선에서 멈춘다", () => {
    assert.ok(coverTitleScale("아주아주 길고 긴 제목을 가진 어떤 동화책 이야기") >= 0.6);
    assert.ok(coverTitleScale("하온이의보물찾기대모험놀이공원") >= 0.6);
  });

  it("앞뒤 공백은 세지 않는다", () => {
    assert.equal(coverTitleScale("  흥부와 놀부  "), coverTitleScale("흥부와 놀부"));
  });
});

/** 딸린 전래동화·세계명작 제목 전부. */
function curatedTitles(): string[] {
  const read = (name: string) =>
    JSON.parse(fs.readFileSync(new URL(`../data/${name}`, import.meta.url), "utf8")) as { title: string }[];
  return [...read("classic-books.json"), ...read("folk-books.json")].map((b) => b.title);
}

/** 사장님 캡처(09-29)에 나온 만든 동화 제목들. */
const SCREENSHOT = [
  "하온이의 포도밭 나들이",
  "하온이의 전농동 나들이",
  "하온이의 나뭇잎 보물찾기",
  "하온이의 한강버스 소풍",
  "요정 하온이와 반짝이는 마라카스",
  "반짝반짝 반딧불이 밤",
];

describe("coverTitleLines — 표지 제목 줄 나누기", () => {
  it("딸린 책 제목은 모두 1~2줄, 낱말 가운데서 안 끊기고 빈 줄이 없다", () => {
    const titles = [...curatedTitles(), ...SCREENSHOT];
    assert.ok(titles.length > 40, "데이터 제목을 못 읽었다");
    for (const title of titles) {
      const lines = coverTitleLines(title);
      assert.ok(lines.length >= 1 && lines.length <= 2, `${title} → ${lines.length}줄`);
      // 줄을 띄어쓰기로 이으면 제목 그대로 — 낱말 가운데서 끊었다면 여기서 틀린다.
      assert.equal(lines.join(" "), title.trim().replace(/\s+/g, " "), title);
      for (const line of lines) {
        assert.ok(line.length > 0 && line === line.trim(), `${title}: 빈 줄·가장자리 공백 ${JSON.stringify(lines)}`);
      }
    }
  });

  it("'누구누구의'는 윗줄에 따로 — 클라이언트 요청", () => {
    assert.deepEqual(coverTitleLines("하온이의 포도밭 나들이"), ["하온이의", "포도밭 나들이"]);
    assert.deepEqual(coverTitleLines("하온이의 전농동 나들이"), ["하온이의", "전농동 나들이"]);
    assert.deepEqual(coverTitleLines("하온이의 나뭇잎 보물찾기"), ["하온이의", "나뭇잎 보물찾기"]);
    assert.deepEqual(coverTitleLines("하온이의 한강버스 소풍"), ["하온이의", "한강버스 소풍"]);
  });

  it("하온이 말고 다른 이름도 같다", () => {
    assert.deepEqual(coverTitleLines("서준이의 공룡 탐험"), ["서준이의", "공룡 탐험"]);
    assert.deepEqual(coverTitleLines("민지의 생일 파티"), ["민지의", "생일 파티"]);
    // 한 줄에 들어가도 나눈다 — 'OO의' 책이 책장에 나란히 설 때 모양이 같게.
    assert.deepEqual(coverTitleLines("지우의 공룡탐험"), ["지우의", "공룡탐험"]);
  });

  it("'OO의' 뒷말이 한 낱말 세 글자 이하면 한 줄 — 한 덩어리로 읽히고 글자도 크다", () => {
    assert.deepEqual(coverTitleLines("오즈의 마법사"), ["오즈의 마법사"]);
    assert.deepEqual(coverTitleLines("토끼의 재판"), ["토끼의 재판"]);
    assert.deepEqual(coverTitleLines("하온이의 생일"), ["하온이의 생일"]);
  });

  it("'OO의'로 나누면 뒷줄이 너무 길어질 땐 고르게 나눈다", () => {
    assert.deepEqual(coverTitleLines("하온이의 반짝반짝 한강버스 소풍 대작전"), [
      "하온이의 반짝반짝",
      "한강버스 소풍 대작전",
    ]);
  });

  it("와·과·는 같은 말이 끝나는 자리에서 끊는다", () => {
    assert.deepEqual(coverTitleLines("요정 하온이와 반짝이는 마라카스"), ["요정 하온이와", "반짝이는 마라카스"]);
    assert.deepEqual(coverTitleLines("팥죽 할머니와 호랑이"), ["팥죽 할머니와", "호랑이"]);
    assert.deepEqual(coverTitleLines("임금님 귀는 당나귀 귀"), ["임금님 귀는", "당나귀 귀"]);
    assert.deepEqual(coverTitleLines("시골 쥐와 도시 쥐"), ["시골 쥐와", "도시 쥐"]);
    assert.deepEqual(coverTitleLines("골디락스와 곰 세 마리"), ["골디락스와", "곰 세 마리"]);
  });

  it("조사처럼 생긴 낱말 끝(마을·사과…)에서는 안 끊는다", () => {
    assert.deepEqual(coverTitleLines("하온이네 마을 축제"), ["하온이네", "마을 축제"]);
    // '도'로 끝나는 땅 이름은 '~도' 조사가 아니다 — "하온이와 제주도 / 바다 여행"이 되면 안 된다.
    assert.deepEqual(coverTitleLines("하온이와 제주도 바다 여행"), ["하온이와", "제주도 바다 여행"]);
  });

  it("'OO의'가 뒷낱말 하나만 꾸미면(집에·방에서) 'OO의 그 낱말'까지 윗줄", () => {
    // 뒷낱말이 자리 조사로 끝나면 '할머니의'는 제목 전체가 아니라 '집'만 꾸민다.
    assert.deepEqual(coverTitleLines("할머니의 집에 간 하온이"), ["할머니의 집에", "간 하온이"]);
    assert.deepEqual(coverTitleLines("하온이의 방에서 생긴 일"), ["하온이의 방에서", "생긴 일"]);
    assert.deepEqual(coverTitleLines("꿈의 나라로 떠난 하온이"), ["꿈의 나라로", "떠난 하온이"]);
    assert.deepEqual(coverTitleLines("하늘의 별을 딴 하온이"), ["하늘의 별을", "딴 하온이"]);
    // 제목 가운데의 'OO의'도 같다.
    assert.deepEqual(coverTitleLines("요정 하온이의 방에서 생긴 일"), ["요정 하온이의 방에서", "생긴 일"]);
  });

  it("'누구와 함께'는 한 덩어리 — 와 뒤가 아니라 함께 뒤에서 끊는다", () => {
    assert.deepEqual(coverTitleLines("하온이와 함께 떠나는 우주 여행"), ["하온이와 함께", "떠나는 우주 여행"]);
    assert.deepEqual(coverTitleLines("강아지와 함께 산책해요"), ["강아지와 함께", "산책해요"]);
    assert.deepEqual(coverTitleLines("하온이랑 같이 놀자"), ["하온이랑 같이", "놀자"]);
    assert.deepEqual(coverTitleLines("뭉치와 함께한 여름"), ["뭉치와 함께한", "여름"]);
  });

  it("'하온이와 엄마의'는 통째로 주인 — 'OO의'처럼 윗줄에 둔다", () => {
    assert.deepEqual(coverTitleLines("하온이와 엄마의 봄 소풍"), ["하온이와 엄마의", "봄 소풍"]);
    assert.deepEqual(coverTitleLines("하온이와 아빠의 비밀"), ["하온이와 아빠의", "비밀"]);
    assert.deepEqual(coverTitleLines("엄마랑 하온이의 캠핑"), ["엄마랑 하온이의", "캠핑"]);
    assert.deepEqual(coverTitleLines("엄마랑 하온이의 첫 캠핑"), ["엄마랑 하온이의", "첫 캠핑"]);
  });

  it("쉼표 뒤에서 끊는다", () => {
    assert.deepEqual(coverTitleLines("꼬마 기관차, 칙칙폭폭 달려라"), ["꼬마 기관차,", "칙칙폭폭 달려라"]);
  });

  it("끊을 말이 없으면 고르게, 한 글자만 남는 줄은 안 만든다", () => {
    assert.deepEqual(coverTitleLines("반짝반짝 반딧불이 밤"), ["반짝반짝", "반딧불이 밤"]);
  });

  it("한 줄에 편히 들어가는 제목은 한 줄", () => {
    for (const title of ["흥부와 놀부", "금도끼 은도끼", "잭과 콩나무", "도깨비 감투", "신데렐라"]) {
      assert.deepEqual(coverTitleLines(title), [title]);
    }
  });

  it("띄어쓰기 없는 제목은 길어도 한 줄 — 낱말을 쪼개지 않는다", () => {
    assert.deepEqual(coverTitleLines("미운오리새끼"), ["미운오리새끼"]);
    assert.deepEqual(coverTitleLines("하온이의보물찾기대모험놀이공원"), ["하온이의보물찾기대모험놀이공원"]);
  });

  it("아주 긴 제목도 두 줄", () => {
    const title = "우리 하온이가 처음으로 혼자 자전거를 탄 날 이야기";
    const lines = coverTitleLines(title);
    assert.equal(lines.length, 2);
    assert.equal(lines.join(" "), title);
  });

  it("빈 제목은 줄이 없다", () => {
    assert.deepEqual(coverTitleLines("   "), []);
  });
});

/**
 * `max(7.5px, min(10.4px, 9.29cqw, calc((10.7cqh - 1px) / 2.08)))` 를 표지 크기(3:4)에서
 * 실제 px 로 푼다.
 */
function resolveFont(css: string, coverWidth: number): number {
  const coverHeight = (coverWidth * 4) / 3;
  const m = css.match(/^max\(([\d.]+)px, min\((.*)\)\)$/);
  assert.ok(m, css);
  const values = m[2].split(", ").map((part) => {
    const calc = part.match(/^calc\(\(([\d.]+)cqh - ([\d.]+)px\) \/ ([\d.]+)\)$/);
    if (calc) return ((Number(calc[1]) * coverHeight) / 100 - Number(calc[2])) / Number(calc[3]);
    const v = parseFloat(part);
    if (part.endsWith("cqw")) return (v * coverWidth) / 100;
    if (part.endsWith("cqh")) return (v * coverHeight) / 100;
    assert.ok(part.endsWith("px"), `모르는 값 ${part} (${css})`);
    return v;
  });
  return Math.max(Number(m[1]), Math.min(...values));
}

describe("coverTitleFontSize — 실제 명패 칸에 맞추기", () => {
  it("모든 테마 명패에 폰(144px)·넓은 화면(176px) 모두 가장 긴 줄과 줄 수가 들어간다", () => {
    const titles = [...curatedTitles(), ...SCREENSHOT, "하온이의 반짝반짝 한강버스 소풍 대작전"];
    for (const theme of Object.values(THEMES)) {
      const box = { width: theme.cover.titleWidth ?? "58%", height: theme.cover.titleHeight ?? "9%" };
      for (const coverWidth of [144, 176]) {
        const plaqueW = (parseFloat(box.width) / 100) * coverWidth;
        const plaqueH = (parseFloat(box.height) / 100) * ((coverWidth * 4) / 3);
        for (const title of titles) {
          const lines = coverTitleLines(title);
          const px = resolveFont(coverTitleFontSize(title, box), coverWidth);
          const widest = Math.max(...lines.map(titleEm)) * px;
          // 글자 몸 높이(첫 줄 꼭대기~끝 줄 바닥). 브라우저 반올림으로 글자가 1~2px 올라가니
          // 그 몫(COVER_TITLE_ROUNDING_PX)만큼은 명패 안에 비어 있어야 한다.
          const ink = inkEm(lines.length) * px;
          const where = `${theme.id} ${coverWidth}px "${title}" ${px.toFixed(2)}px`;
          assert.ok(widest <= plaqueW, `${where}: 폭 ${widest.toFixed(1)} > ${plaqueW.toFixed(1)}`);
          assert.ok(
            ink + COVER_TITLE_ROUNDING_PX <= plaqueH + 0.01,
            `${where}: 높이 ${ink.toFixed(1)} + 여유 ${COVER_TITLE_ROUNDING_PX} > ${plaqueH.toFixed(1)}`,
          );
          // 바닥이 붙잡는 건 아주 긴 제목뿐 — 보통 제목이 바닥에 닿으면 위 두 검사 중 하나가 깨질 자리다.
          assert.ok(px > COVER_TITLE_MIN_PX, `${where}: 보통 제목이 바닥 크기에 닿았다`);
        }
      }
    }
  });

  it("아주 긴 제목도 바닥 크기 밑으로는 안 내려간다 — 넘치는 건 BookCover 가 '…'로 줄인다", () => {
    // 편집 칸이 40자까지 받는다. 예전엔 폭 한도만 따라 5px 대까지 내려갔다.
    const titles = [
      "하온이와 아빠가 함께 떠난 제주도 바닷가 모래성 쌓기 대모험",
      "하온이의 아주 특별한 크리스마스 선물 대작전 이야기",
      "하온이의보물찾기대모험놀이공원",
    ];
    for (const theme of Object.values(THEMES)) {
      const box = { width: theme.cover.titleWidth ?? "58%", height: theme.cover.titleHeight ?? "9%" };
      for (const coverWidth of [144, 176]) {
        for (const title of titles) {
          const px = resolveFont(coverTitleFontSize(title, box), coverWidth);
          assert.ok(px >= COVER_TITLE_MIN_PX, `${theme.id} ${coverWidth}px "${title}" ${px.toFixed(2)}px`);
        }
      }
    }
  });

  it("넓은 화면 기본 테마에선 기준 크기를 그대로 쓴다 — 한도는 좁은 칸에서만 이긴다", () => {
    const box = { width: THEMES.storybook.cover.titleWidth!, height: THEMES.storybook.cover.titleHeight! };
    assert.equal(resolveFont(coverTitleFontSize("흥부와 놀부", box), 176), 13);
    assert.equal(resolveFont(coverTitleFontSize("하온이의 포도밭 나들이", box), 176), 10.4);
  });

  it("폰 표지에선 긴 줄만큼 더 줄어든다", () => {
    const box = { width: THEMES.car.cover.titleWidth!, height: THEMES.car.cover.titleHeight! };
    const title = "요정 하온이와 반짝이는 마라카스";
    assert.ok(resolveFont(coverTitleFontSize(title, box), 144) < resolveFont(coverTitleFontSize(title, box), 176));
  });
});
