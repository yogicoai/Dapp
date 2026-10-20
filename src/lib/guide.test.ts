import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { GUIDE_EXAMPLE, GUIDE_FAQ, GUIDE_PAGE_COUNT, GUIDE_SECTIONS, SCREEN, VIEWER_CONTROLS, guideWaits } from "./guide.ts";

/** src 기준 경로의 파일 글 */
function src(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

/** 한 화면 묶음에서 file 을 뺀 글자들(배열·객체 안까지) */
function textsOf(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(textsOf);
  if (value && typeof value === "object") {
    return Object.entries(value)
      .filter(([k]) => k !== "file" && k !== "icon")
      .flatMap(([, v]) => textsOf(v));
  }
  return [];
}

describe("가이드에 적은 화면 글자가 실제 화면에 그대로 있다", () => {
  for (const [key, screen] of Object.entries(SCREEN)) {
    it(`${key} (${screen.file})`, () => {
      const body = src(screen.file);
      for (const text of textsOf(screen)) assert.ok(body.includes(text), `${screen.file} 에 "${text}" 가 없다 — 화면 문구가 바뀌었으면 lib/guide.ts 도 고친다`);
    });
  }

  it("갈래 아이콘 파일이 실제 화면이 쓰는 것과 같다", () => {
    const body = src(SCREEN.theme.file);
    for (const m of SCREEN.theme.modes) assert.ok(body.includes(m.icon), m.icon);
  });

  it("따라 하기 질문은 '오늘의 이야기' 실제 질문이다(이름 장은 호칭이 들어가는 틀이라 틀을 본다)", () => {
    const body = src("app/create/page.tsx");
    for (const { q } of GUIDE_EXAMPLE.answers) {
      if (q.includes("이름은요?")) assert.ok(body.includes("함께 나오는 ${term} 이름은요?"), q);
      else assert.ok(body.includes(`"${q}"`), q);
    }
  });

  it("첫 질문 장의 보기는 실제 장소 칩과 같은 순서다", () => {
    const body = src("app/create/page.tsx");
    const block = body.slice(body.indexOf("const TODAY_PLACES = ["), body.indexOf("const TODAY_WHO = ["));
    const real = [...block.matchAll(/\{ t: "([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(GUIDE_EXAMPLE.places.map((p) => p.t), [...real, "직접 입력"]);
  });
});

describe("가이드 내용", () => {
  it("예시 대본은 한 권의 장면 수만큼 있다", () => {
    assert.equal(GUIDE_EXAMPLE.pages.length, GUIDE_PAGE_COUNT);
  });

  it("동화 화면 단추 번호가 1부터 빠짐없이 이어진다", () => {
    assert.deepEqual(
      VIEWER_CONTROLS.map((c) => c.n),
      VIEWER_CONTROLS.map((_, i) => i + 1),
    );
  });

  it("목차 id 가 겹치지 않는다", () => {
    const ids = GUIDE_SECTIONS.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("기다리는 시간은 만들기 화면과 같은 '보통 ○분' 글자다", () => {
    const w = guideWaits();
    assert.match(w.script, /분|초/);
    assert.match(w.draw, /분|초/);
  });

  it("고객 화면 글이라 내부 화폐 이름·원가 말이 없다", () => {
    const all = JSON.stringify({ GUIDE_EXAMPLE, GUIDE_FAQ, VIEWER_CONTROLS });
    assert.doesNotMatch(all, /쿠키|토큰|원가|마진|수수료/);
  });
});
