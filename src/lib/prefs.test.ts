import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { looksToPrompt, mergeRemoteChild, normalizeParents, parentLooksToPrompt } from "./prefs.ts";

const BASE = { name: "하온", age: 5, gender: "girl" as const };

describe("mergeRemoteChild — 서버 값과 이 기기 값 합치기", () => {
  it("서버에 아이 특징이 없으면 이 기기 것을 지킨다", () => {
    const local = { ...BASE, looks: { hair: "단발" } };
    const out = mergeRemoteChild({ ...BASE }, local);
    assert.deepEqual(out.looks, { hair: "단발" });
  });

  it("서버에 엄마·아빠 특징이 없으면 이 기기 것을 지킨다 — 이게 사라지던 문제였다", () => {
    const local = { ...BASE, parents: { mom: { hair: "긴 머리" }, dad: { glasses: true } } };
    const out = mergeRemoteChild({ ...BASE }, local);
    assert.deepEqual(out.parents, { mom: { hair: "긴 머리" }, dad: { glasses: true } });
  });

  it("서버에 값이 있으면 서버가 이긴다 — 다른 기기에서 고친 게 반영되게", () => {
    const local = { ...BASE, looks: { hair: "단발" }, parents: { mom: { hair: "긴 머리" } } };
    const remote = { ...BASE, looks: { hair: "짧은 머리" }, parents: { dad: { color: "파랑" } } };
    const out = mergeRemoteChild(remote, local);
    assert.deepEqual(out.looks, { hair: "짧은 머리" });
    assert.deepEqual(out.parents, { dad: { color: "파랑" } });
  });

  it("이름·나이·성별은 서버 값을 그대로 쓴다", () => {
    const out = mergeRemoteChild({ name: "서준", age: 7, gender: "boy" }, { ...BASE });
    assert.equal(out.name, "서준");
    assert.equal(out.age, 7);
    assert.equal(out.gender, "boy");
  });

  it("이 기기에 아무것도 없어도 터지지 않는다", () => {
    const out = mergeRemoteChild({ ...BASE, looks: { hair: "곱슬" } }, null);
    assert.deepEqual(out.looks, { hair: "곱슬" });
    assert.equal(out.parents, undefined);
  });

  it("옛 화면이 덮어쓴 서버 값(schema 없음) — 옛 화면이 모르는 새 칸은 이 기기 값에서 되살린다", () => {
    // 새 화면(이 기기)에서 고른 값. 옛 화면은 머리·안경 여부·옷 색·메모만 남기고 덮어썼다(머리를 단발로 고침, 안경 끔).
    const local = {
      ...BASE,
      schema: 2,
      parents: { mom: { hair: "숏컷", face: "갸름해요", height: "큰 편", glassesType: "동그란 안경", glasses: true, marks: ["보조개"] } },
    };
    const remote = { ...BASE, parents: { mom: { hair: "단발" } } };
    const out = mergeRemoteChild(remote, local);
    assert.deepEqual(out.parents, { mom: { hair: "단발", face: "갸름해요", height: "큰 편", marks: ["보조개"] } });
    assert.equal(out.schema, 2);
  });

  it("옛 화면 값이 안경 '씀'이면 이 기기 안경 종류를 지킨다", () => {
    const local = { ...BASE, schema: 2, parents: { dad: { glassesType: "뿔테", glasses: true, beard: "콧수염" } } };
    const out = mergeRemoteChild({ ...BASE, parents: { dad: { glasses: true } } }, local);
    assert.deepEqual(out.parents?.dad, { glassesType: "뿔테", glasses: true, beard: "콧수염" });
  });

  it("새 화면이 쓴 서버 값(schema 있음)은 예전처럼 서버가 이긴다", () => {
    const local = { ...BASE, schema: 2, parents: { mom: { hair: "숏컷", face: "갸름해요" } } };
    const out = mergeRemoteChild({ ...BASE, schema: 2, parents: { mom: { hair: "단발" } } }, local);
    assert.deepEqual(out.parents, { mom: { hair: "단발" } });
  });

  it("서버에 엄마·아빠 칸이 아예 없으면(뒤처진 서버) 이 기기 값을 그대로 지킨다", () => {
    const parents = { mom: { hair: "숏컷", face: "갸름해요" } };
    assert.deepEqual(mergeRemoteChild({ ...BASE }, { ...BASE, schema: 2, parents }).parents, parents);
  });
});

describe("parentLooksToPrompt — 엄마·아빠 한 줄", () => {
  it("고른 것만 잇는다", () => {
    const out = parentLooksToPrompt({ hair: "긴 머리", glasses: true, color: "파랑" });
    assert.ok(out.includes("긴 머리"), out);
    assert.ok(out.includes("안경"), out);
    assert.ok(out.includes("파랑"), out);
  });

  it("아예 안 적었으면 빈 줄", () => {
    assert.equal(parentLooksToPrompt(undefined), "");
  });

  it("안경 얘기는 늘 넣는다 — 안 넣으면 모델이 없는 안경을 씌운다", () => {
    assert.equal(parentLooksToPrompt({}), "안경을 쓰지 않는다");
    assert.ok(parentLooksToPrompt({ hair: "짧은 머리" }).includes("안경을 쓰지 않는다"));
  });

  it("새 칸까지 자연스러운 한 줄로 — 엄마", () => {
    assert.equal(
      parentLooksToPrompt(
        {
          hair: "중단발",
          hairColor: "짙은 갈색",
          hairTexture: "살짝 웨이브",
          bangs: "시스루",
          face: "계란형",
          eyes: "웃으면 반달",
          skin: "밝은 편",
          build: "마른 편",
          height: "큰 편",
          glassesType: "동그란 안경",
          glasses: true,
          marks: ["보조개"],
          outfit: "블라우스",
          bottom: "치마",
          color: "베이지",
          accessories: ["귀걸이", "목걸이"],
          note: "늘 웃고 있어요",
        },
        "mom",
      ),
      "짙은 갈색 중단발 머리, 머리 끝에만 부드러운 웨이브가 살짝 있다, 시스루 앞머리가 있다, 계란형 얼굴이다, " +
        "웃으면 눈이 반달이 된다, 피부는 밝은 편이다, 마른 편이다, 키가 큰 편이다, 동그란 안경을 썼다, 보조개가 있다, " +
        "평소에 베이지 블라우스에 치마를 즐겨 입고 귀걸이·목걸이를 즐겨 한다, 늘 웃고 있어요",
    );
  });

  it("clothes:false 면 평소 옷·늘 하는 것을 뺀다 — 이야기가 책마다 옷을 정한다", () => {
    const p = { hair: "긴 머리", color: "베이지", outfit: "블라우스", accessories: ["귀걸이"] };
    const out = parentLooksToPrompt(p, "mom", { clothes: false });
    assert.equal(out, "긴 머리, 안경을 쓰지 않는다");
    assert.ok(parentLooksToPrompt(p, "mom").includes("평소에 베이지 블라우스를 즐겨 입고 귀걸이를 즐겨 한다"));
  });

  it("아빠 수염 '없어요'는 '수염이 없다'로 적고, 엄마에게는 수염을 적지 않는다", () => {
    assert.ok(parentLooksToPrompt({ beard: "없어요" }, "dad").includes("수염이 없다"));
    assert.ok(parentLooksToPrompt({ beard: "턱수염" }, "dad").includes("턱수염이 있다"));
    assert.equal(parentLooksToPrompt({ beard: "턱수염" }, "mom"), "안경을 쓰지 않는다");
  });

  it("안경 종류 — '안 써요'는 쓰지 않는다, 종류 없는 예전 값은 '안경을 썼다', 쓰면 늘 '안경을 썼다'로 끝난다", () => {
    assert.equal(parentLooksToPrompt({ glassesType: "안 써요" }), "안경을 쓰지 않는다");
    assert.equal(parentLooksToPrompt({ glasses: true }), "안경을 썼다");
    assert.equal(parentLooksToPrompt({ glassesType: "뿔테", glasses: true }), "뿔테 안경을 썼다");
    assert.equal(parentLooksToPrompt({ glassesType: "반무테", glasses: true }), "반무테 안경을 썼다");
  });
});

describe("normalizeParents — 엄마·아빠 새 칸과 옛 값", () => {
  it("옛 머리 글자를 새 칩 글자로 옮긴다", () => {
    assert.equal(normalizeParents({ mom: { hair: "짧은 머리" } })?.mom?.hair, "숏컷");
    assert.equal(normalizeParents({ mom: { hair: "묶은 머리" } })?.mom?.hair, "하나로 묶기");
    assert.equal(normalizeParents({ mom: { hair: "파마머리" } })?.mom?.hair, "굵은 웨이브 파마");
    assert.equal(normalizeParents({ dad: { hair: "아주 짧은 머리" } })?.dad?.hair, "반삭");
    // 아빠의 '짧은 머리'·'파마머리'는 지금도 있는 칩이라 그대로다.
    assert.equal(normalizeParents({ dad: { hair: "짧은 머리" } })?.dad?.hair, "짧은 머리");
    assert.equal(normalizeParents({ dad: { hair: "파마머리" } })?.dad?.hair, "파마머리");
  });

  it("예전 값(머리·안경·옷 색 10개·메모)은 그대로 살아남는다", () => {
    assert.deepEqual(normalizeParents({ mom: { hair: "단발", glasses: true, color: "베이지", note: "앞치마" }, dad: { color: "검정" } }), {
      mom: { hair: "단발", glasses: true, color: "베이지", note: "앞치마" },
      dad: { color: "검정" },
    });
  });

  it("새 칸을 모두 지키고, 수염은 아빠만, 모르는 칸·빈 칸은 버린다", () => {
    const full = {
      hair: "투블럭",
      bangs: "옆으로 넘겨요",
      hairTexture: "곧은 생머리",
      hairColor: "까만색",
      face: "각진 편",
      eyes: "또렷해요",
      brows: "진한 눈썹",
      skin: "햇볕에 그을림",
      build: "듬직한 편",
      height: "아주 큰 편",
      glassesType: "네모 안경",
      beard: "면도 자국",
      marks: ["점", "덧니"],
      outfit: "정장",
      bottom: "슬랙스",
      color: "네이비",
      accessories: ["시계", "반지"],
      note: "넥타이를 매요",
    };
    const out = normalizeParents({ dad: { ...full, glasses: false, junk: "x", eyesColor: "" }, mom: { ...full } });
    assert.deepEqual(out?.dad, { ...full, glasses: true });
    const { beard: _beard, ...momExpected } = full;
    void _beard;
    assert.deepEqual(out?.mom, { ...momExpected, glasses: true });
    assert.equal(normalizeParents({ mom: {}, dad: { note: "  " } }), undefined);
    assert.equal(normalizeParents("x"), undefined);
  });

  it("메모는 40자까지(설정 입력 칸과 같다)", () => {
    assert.equal(normalizeParents({ mom: { note: "가".repeat(60) } })?.mom?.note?.length, 40);
  });
});

describe("saveChild — 안 넘긴 항목은 그대로 둔다", () => {
  /** 브라우저 저장소 흉내 — node 에서 돌리려고 아주 작게 만든다. */
  function stubWindow() {
    const store = new Map<string, string>();
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    };
    return store;
  }

  it("이름·나이만 바꿔도 아이 특징과 엄마·아빠 특징이 살아남는다", async () => {
    const store = stubWindow();
    const { saveChild, loadChild } = await import("./prefs.ts");
    saveChild({ name: "하온", age: 5, gender: "girl", looks: { hair: "단발" }, parents: { mom: { hair: "긴 머리" } } });
    // 만들기에서 줄거리 지을 때처럼 이름·나이·성별만 넘긴다 — 예전엔 여기서 다 지워졌다.
    saveChild({ name: "하온", age: 6, gender: "girl" });
    const out = loadChild();
    assert.equal(out?.age, 6);
    // (저장을 거치면 안 고른 칸이 undefined 로 채워지므로 고른 값만 본다.)
    assert.equal(out?.looks?.hair, "단발");
    assert.equal(out?.parents?.mom?.hair, "긴 머리");
    assert.ok(store.size > 0);
  });

  it("저장했다 불러와도 엄마·아빠 새 칸이 남고, 옛 글자는 새 글자로 바뀐다", async () => {
    stubWindow();
    const { saveChild, loadChild } = await import("./prefs.ts");
    saveChild({
      name: "하온",
      age: 5,
      gender: "girl",
      parents: {
        mom: { hair: "묶은 머리", face: "갸름해요", height: "작은 편", accessories: ["앞치마"] },
        dad: { hair: "아주 짧은 머리", beard: "콧수염", glassesType: "뿔테", glasses: true },
      },
    });
    const out = loadChild();
    assert.deepEqual(out?.parents?.mom, { hair: "하나로 묶기", face: "갸름해요", height: "작은 편", accessories: ["앞치마"] });
    assert.deepEqual(out?.parents?.dad, { hair: "반삭", beard: "콧수염", glassesType: "뿔테", glasses: true });
  });

  it("빈 값을 대놓고 넘기면 지워진다 — 설정에서 '특징 비우기'가 그대로 동작하게", async () => {
    stubWindow();
    const { saveChild, loadChild } = await import("./prefs.ts");
    saveChild({ name: "하온", age: 5, gender: "girl", looks: { hair: "단발" } });
    saveChild({ name: "하온", age: 5, gender: "girl", looks: {} });
    assert.equal(loadChild()?.looks, undefined);
  });

  it("뺀 기록은 더하기만 하고, 읽을 때 뺀 사람은 회색(빠짐)이 된다 — 저장 모양 판(schema)도 적는다", async () => {
    stubWindow();
    const { saveChild, loadChild, CHILD_SCHEMA } = await import("./prefs.ts");
    const g = { id: "m-g", role: "grandma" as const, callName: "할머니" };
    const s = { id: "m-s", role: "sibling" as const, callName: "누나" };
    saveChild({ name: "하온", family: [g, s], familyRemoved: [{ id: "m-x", at: "2026-09-28T09:00:00Z" }] });
    // 오래 열어 둔 화면이 옛 목록(할머니 있음)으로 저장하면서 할머니 뺀 기록을 더한다.
    saveChild({ name: "하온", family: [g, s], familyRemoved: [{ id: "m-g", at: "2026-09-28T09:10:00Z" }] });
    const out = loadChild();
    assert.deepEqual(out?.familyRemoved?.map((r) => r.id).sort(), ["m-g", "m-x"]);
    assert.deepEqual(out?.family?.map((m) => [m.id, m.inactive === true]), [["m-g", true], ["m-s", false]]);
    assert.equal(out?.schema, CHILD_SCHEMA);
  });
});

describe("looksToPrompt — 아이 한 줄", () => {
  it("clothes:false 면 좋아하는 옷 색만 뺀다(안 주면 예전 그대로)", () => {
    const looks = { hair: "단발", hairColor: "까만색", color: "노랑", items: ["곰인형"] };
    const out = looksToPrompt(looks, { clothes: false });
    assert.ok(!out.includes("즐겨 입"), out);
    assert.ok(out.includes("단발") && out.includes("곰인형"), out);
    assert.ok(looksToPrompt(looks).includes("노랑 옷을 즐겨 입는다"));
    assert.equal(looksToPrompt(looks, {}), looksToPrompt(looks));
  });
});
