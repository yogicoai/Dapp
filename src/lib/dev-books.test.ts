import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { DEV_BOOK_LIKE, DEV_BOOK_PREFIX, isDevBookId } from "./dev-books.ts";

const SRC = new URL("../", import.meta.url); // src/
const read = (rel: string) => readFileSync(new URL(rel, SRC), "utf8");
const filesUnder = (dir: string) =>
  existsSync(new URL(dir, SRC))
    ? (readdirSync(new URL(dir, SRC), { recursive: true }) as unknown[])
        .map((f) => String(f).replace(/\\/g, "/"))
        .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f))
        .map((f) => dir + f)
    : [];

describe("fe 전용 책 아이디", () => {
  it("my-dev- 로 시작하는 아이디만 fe 전용이다", () => {
    assert.equal(isDevBookId("my-dev-mh7k2q-a1b2c3"), true);
    for (const id of ["my-mh7k2q-a1b2c3", "my-devx", "folk-heungbu", "", null, undefined, 42]) {
      assert.equal(isDevBookId(id), false, String(id));
    }
  });

  it("관리실 쿼리 패턴은 같은 앞머리에 %", () => {
    assert.equal(DEV_BOOK_LIKE, `${DEV_BOOK_PREFIX}%`);
  });

  it("'내가 만든 동화' 아이디 모양 검사(^my-…)를 그대로 통과한다 — 뷰어·쪽 다시 그리기 길을 그대로 탄다", () => {
    assert.match("my-dev-mh7k2q-a1b2c3", /^my-[A-Za-z0-9_-]{1,77}$/);
  });
});

describe("관리실은 fe 전용 책을 세지도 보여 주지도 않는다(2026-10-26 사장님)", () => {
  it("관리실 서버·화면의 books 쿼리마다 DEV_BOOK_LIKE 로 뺀다", () => {
    let seen = 0;
    for (const f of [...filesUnder("app/api/admin/"), ...filesUnder("app/admin/"), ...filesUnder("components/admin/")]) {
      const src = read(f);
      for (const m of src.matchAll(/\.from\(\s*["']books["']\s*\)/g)) {
        seen += 1;
        // 이 쿼리 사슬 — 다음 .from( 앞까지(최대 400자)
        const after = src.slice(m.index! + 1);
        const next = after.search(/\.from\(/);
        const chain = after.slice(0, next >= 0 ? Math.min(next, 400) : 400);
        assert.ok(chain.includes("DEV_BOOK_LIKE"), `${f} 의 books 쿼리에 fe 전용 책 빼기가 없다: ${chain.slice(0, 90)}`);
      }
    }
    assert.ok(seen > 0, "관리실 books 쿼리를 하나도 못 찾았다 — 검사 경로가 틀렸다");
  });

  it("관리 화면이 부르는 prefs 의 '전체 책·남의 책' 함수도 뺀다", () => {
    const src = read("lib/prefs.ts");
    for (const fn of ["loadAllBooksBrief", "loadUserBooks", "countBooksWithEmbeddedArt"]) {
      const start = src.indexOf(`export async function ${fn}(`);
      assert.ok(start >= 0, `${fn} 를 못 찾았다`);
      const body = src.slice(start, src.indexOf("\n}\n", start));
      assert.ok(body.includes("DEV_BOOK_LIKE"), `${fn} 에 fe 전용 책 빼기가 없다`);
    }
  });
});
