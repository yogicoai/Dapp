import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectBookScale,
  pageScale,
  readScaleKind,
  scaleCheckLines,
  scaleLockLines,
  withBookScale,
} from "./scale-lock.ts";

/** 2026-10-12 거인국 책 — 5쪽에서 거인이 큰 형으로 그려졌다 */
const HAON = { name: "하온", description: "가족 그림 그대로" };
const POPO = { name: "포포", description: "갈색 곱슬머리, 통통한 볼" };
const GIANT_BOOK = [
  "하온이는 숲속 오솔길에서 반짝이는 황금 문을 발견했어요.",
  "쿵, 쿵, 땅이 울리더니 거인 아이 포포가 나타났어요. 포포는 하온이를 손바닥에 살짝 올려놓았어요.",
  "포포네 성 부엌은 어마어마했어요.",
  "포포가 재빨리 숟가락으로 하온이를 건져 올렸어요.",
  "포포가 커다란 단추를 하나 건네며 방긋 웃었어요.",
  "하온이는 집으로 돌아왔어요.",
];

describe("책에서 크기가 다른 인물 찾기", () => {
  it("본문이 이름을 바로 꾸미면 잡는다 — '거인 아이 포포'(설명 글에 크기 말이 없어도)", () => {
    const s = detectBookScale([HAON, POPO], GIANT_BOOK);
    assert.equal(s.get("포포"), "giant");
    assert.equal(s.has("하온"), false);
  });

  it("설명 글의 크기 말 — 주인공이 아닌 사람만", () => {
    assert.equal(detectBookScale([HAON, { name: "포포", description: "거인 아이(하온이가 손바닥에 올라설 만큼 크다), 곱슬머리" }], []).get("포포"), "giant");
    assert.equal(detectBookScale([HAON, { name: "루루", description: "엄지만 한 요정, 초록 날개" }], []).get("루루"), "tiny");
    // 주인공 설명의 '거인 나라에 간'은 거인이 아니다
    assert.equal(detectBookScale([{ name: "하온", description: "거인 나라에 간 아이" }, POPO], []).has("하온"), false);
  });

  it("꾸밈이 아니면 잡지 않는다 — '거인들이 하온이를', '하온이는 거인 포포를 보았어요'", () => {
    assert.equal(detectBookScale([HAON, POPO], ["거인들이 하온이를 내려다보았어요."]).size, 0);
    const s = detectBookScale([HAON, POPO], ["하온이는 거인 포포를 보았어요."]);
    assert.equal(s.get("포포"), "giant");
    assert.equal(s.has("하온"), false);
  });

  it("풀이말 — '포포는 거인이에요' · '루루는 아주 작은 소인이에요'", () => {
    assert.equal(detectBookScale([HAON, POPO], ["포포는 거인이에요."]).get("포포"), "giant");
    assert.equal(detectBookScale([HAON, { name: "루루", description: "" }], ["루루는 아주 작은 소인이에요."]).get("루루"), "tiny");
    // 주인공이 소인국에서 거인이 되는 책 — 풀이말이면 주인공도 잡는다
    assert.equal(detectBookScale([HAON], ["소인국에서 하온이는 거인이었어요."]).get("하온"), "giant");
  });

  it("보통 책은 아무도 안 잡힌다", () => {
    const s = detectBookScale(
      [HAON, { name: "엄마", description: "긴 갈색 머리" }],
      ["하온이는 거실에서 짐을 싸요.", "엄마는 모자를 챙겨요.", "커다란 여행 가방", "작은 인형"],
    );
    assert.equal(s.size, 0);
  });

  it("withBookScale — 잡힌 사람에게만 scale 칸을 더하고 나머지는 그대로", () => {
    const out = withBookScale([HAON, POPO], GIANT_BOOK);
    assert.deepEqual(out[0], HAON);
    assert.deepEqual(out[1], { ...POPO, scale: "giant" });
    assert.equal(readScaleKind("giant"), "giant");
    assert.equal(readScaleKind("huge"), null);
    assert.equal(readScaleKind(undefined), null);
  });
});

describe("이 쪽의 크기 — 견줄 상대가 있을 때만 잠근다", () => {
  it("5쪽(단추 건네기) — 이 쪽 글에 단서가 없어도 보낸 표시로 잠근다", () => {
    const s = pageScale([HAON, { ...POPO, scale: "giant" }], "하온", [GIANT_BOOK[4]]);
    assert.deepEqual(s, { giants: ["포포"], tinies: [], normals: ["하온"] });
  });

  it("표시가 없으면 설명 글·이 쪽 글에서", () => {
    assert.deepEqual(pageScale([HAON, POPO], "하온", [GIANT_BOOK[1]])?.giants, ["포포"]);
    assert.equal(pageScale([HAON, POPO], "하온", [GIANT_BOOK[4]]), null); // 표시도 단서도 없는 옛 요청
  });

  it("혼자 있는 쪽 · 모두 보통인 쪽 · 거인끼리만 있는 쪽은 잠그지 않는다", () => {
    assert.equal(pageScale([HAON], "하온", GIANT_BOOK), null);
    assert.equal(pageScale([HAON, { name: "엄마", description: "" }], "하온", ["엄마와 하온이"]), null);
    assert.equal(pageScale([{ ...POPO, scale: "giant" }, { name: "모모", description: "", scale: "giant" }], "하온", []), null);
  });
});

describe("SCALE LOCK 줄 · 검수 줄", () => {
  const scale = pageScale([HAON, { ...POPO, scale: "giant" }], "하온", []);

  it("거인 — 손바닥 눈금, 비슷한 키 금지, 한 그림에 담는 법, 시트의 키는 크기가 아님", () => {
    const l = scaleLockLines(scale).join("\n");
    assert.match(l, /^SCALE LOCK/);
    assert.ok(l.includes("포포 is a GIANT; 하온 is ordinary human size"));
    assert.ok(l.includes("stand on 포포's open palm"));
    assert.ok(l.includes("NEVER draw 포포 as merely a bigger or older child beside 하온"));
    assert.ok(l.includes("only part of 포포 may fit in the frame"));
    assert.ok(l.includes("ignore the sizes on the sheet"));
    assert.ok(l.includes("overrides any instruction elsewhere to draw the characters large"));
    assert.ok(l.includes("never a faceless dot"));
  });

  it("소인 — 손보다 크지 않게", () => {
    const tiny = pageScale([HAON, { name: "루루", description: "", scale: "tiny" }], "하온", []);
    const l = scaleLockLines(tiny).join("\n");
    assert.ok(l.includes("루루 is TINY: no taller than 하온's hand"));
    assert.ok(scaleCheckLines(tiny)[0].includes("루루 is tiny"));
  });

  it("검수 — 비슷한 크기면 FAIL, 작게 그려졌다·잘렸다고는 떨어뜨리지 않는다", () => {
    const c = scaleCheckLines(scale);
    assert.equal(c.length, 1);
    assert.ok(c[0].includes("FAIL if they look like two people of similar size"));
    assert.ok(c[0].includes("Do not fail because 하온 is small in the frame"));
  });

  it("잠금이 없으면 줄도 없다 — 보통 책의 프롬프트는 예전 그대로", () => {
    assert.deepEqual(scaleLockLines(null), []);
    assert.deepEqual(scaleCheckLines(null), []);
  });

  it("여럿 — 이름을 and 로 잇고 복수로", () => {
    const many = pageScale(
      [HAON, { name: "엄마", description: "" }, { ...POPO, scale: "giant" }, { name: "모모", description: "", scale: "giant" }],
      "하온",
      [],
    );
    const l = scaleLockLines(many)[0];
    assert.ok(l.includes("포포 and 모모 are GIANTS; 하온 and 엄마 are ordinary human size"));
  });
});

describe("이름에 조사가 붙어도 잡고, 한 글자 이름은 본문으로 잡지 않는다", () => {
  it("'거인 아이 포포에게' · '거인 포포한테'", () => {
    assert.equal(detectBookScale([HAON, POPO], ["하온이는 거인 아이 포포에게 인사했어요."]).get("포포"), "giant");
    assert.equal(detectBookScale([HAON, POPO], ["하온이는 거인 포포한테 달려갔어요."]).get("포포"), "giant");
  });
  it("한 글자 이름 — 본문으로는 안 잡고 설명 글로만", () => {
    assert.equal(detectBookScale([HAON, { name: "곰", description: "" }], ["거인 곰이 나타났어요."]).size, 0);
    assert.equal(detectBookScale([HAON, { name: "곰", description: "거인 곰" }], []).get("곰"), "giant");
  });
});
