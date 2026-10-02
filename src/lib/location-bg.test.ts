import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { findLocationBackground, type LocationBg } from "./location-bg.ts";

const CATALOG = JSON.parse(readFileSync(new URL("../data/backgrounds.json", import.meta.url), "utf8")) as LocationBg[];

describe("장소 시트 ↔ 배경 창고 짝짓기(2026-10-02 — '거실'이 복도로 그려진 사고 막이)", () => {
  it("창고가 269곳이고 거실·부엌·아이 방 같은 집 안 장소가 들어 있다", () => {
    assert.equal(CATALOG.length, 269);
    for (const ko of ["거실", "부엌", "아이 방", "비행기 안", "공항 대합실"]) {
      assert.ok(CATALOG.some((b) => b.ko === ko), ko);
    }
  });

  it("① 이름이 똑같으면 그 배경 — 나트랑 책의 '거실'", () => {
    assert.equal(findLocationBackground("거실", CATALOG)?.slug, "living-room");
    assert.equal(findLocationBackground(" 거실 ", CATALOG)?.slug, "living-room");
    assert.equal(findLocationBackground("거실(밤)", CATALOG)?.ko, "거실(밤)");
  });

  it("② 장소 이름 안에 창고 이름 — 가장 긴 것이 이긴다", () => {
    assert.equal(findLocationBackground("하온이네 거실", CATALOG)?.slug, "living-room");
    assert.equal(findLocationBackground("할머니 댁 거실", CATALOG)?.ko, "할머니 댁 거실");
    assert.equal(findLocationBackground("우리 집 부엌", CATALOG)?.ko, "부엌");
  });

  it("③ 창고 이름 안에 장소 이름 — 하나뿐일 때만(3자 이상)", () => {
    assert.equal(findLocationBackground("수영장", CATALOG)?.ko, "호텔 수영장");
    assert.equal(findLocationBackground("놀이터", CATALOG)?.ko, "아파트 놀이터");
    // '유치원'은 교실·정문·화장실 여럿 — 고르지 않는다
    assert.equal(findLocationBackground("유치원", CATALOG), null);
    // 두 글자는 ③을 타지 않는다 — '병원'이 동물병원에 붙으면 안 된다
    assert.equal(findLocationBackground("병원", CATALOG), null);
  });

  it("모르는 장소·빈 이름은 null — 엉뚱한 배경이 붙는 것이 더 나쁘다", () => {
    assert.equal(findLocationBackground("용암 미끄럼틀 행성", CATALOG), null);
    assert.equal(findLocationBackground("", CATALOG), null);
    assert.equal(findLocationBackground("거", CATALOG), null);
    assert.equal(findLocationBackground("거실", []), null);
  });

  it("창고 줄이 깨져 있어도 던지지 않는다(이름·주소 없는 줄은 건너뛴다)", () => {
    const broken = [{ slug: "x", ko: "", url: "https://a" }, { slug: "y", ko: "마당", url: "" }, ...CATALOG] as LocationBg[];
    assert.equal(findLocationBackground("거실", broken)?.slug, "living-room");
    assert.equal(findLocationBackground("마당", broken), null);
  });
});
