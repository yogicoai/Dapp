import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adultHeightCm, childHeightCm, type FamilyRole } from "./family.ts";
import {
  GROUP_PHOTO,
  blendOverlaps,
  coveredFaces,
  groupLayout,
  guessHead,
  isFrontKid,
  type GroupLayout,
  type GroupPlace,
  type GroupSlot,
} from "./family-group-layout.ts";
import { OPAQUE_PAD, faceLayout, faceSize, headChartRatio } from "./family-head.ts";

/*
 * 하온이네 실제 그림 크기(2026-09-30 시안 D 에 쓴 투명 PNG) — 가로 ÷ 세로와 눈으로 잰 머리 비율.
 * 엄마 351×1266(5.3) · 아빠 345×1043(5.55) · 아이 336×1179(4.45). 조부모는 엄마·아빠 그림을 키만 달리해 쓴다.
 */
const PICS = {
  mom: { aspect: 351 / 1266, ratio: 5.3 },
  dad: { aspect: 345 / 1043, ratio: 5.55 },
  kid: { aspect: 336 / 1179, ratio: 4.45 },
};
/** opaque — 배경 지우기에 실패한 흰 바탕 그림(위·아래 여백 OPAQUE_PAD, 화면에서 곱하기) */
type Who = { id: string; role: FamilyRole; age?: number; pic?: keyof typeof PICS; cm?: number; opaque?: boolean };
const RANK: Record<FamilyRole, number> = { grandpa: 0, mom: 1, sibling: 2, child: 3, friend: 4, dad: 5, grandma: 6 };

const MOM: Who = { id: "mom", role: "mom" };
const DAD: Who = { id: "dad", role: "dad" };
const CHILD: Who = { id: "child", role: "child", age: 5 };
const GRANDMA: Who = { id: "grandma", role: "grandma" };
const GRANDPA: Who = { id: "grandpa", role: "grandpa" };
const sib = (id: string, age: number): Who => ({ id, role: "sibling", age });

function cmOf(w: Who): number {
  if (w.cm) return w.cm;
  if (w.role === "child" || w.role === "sibling" || w.role === "friend") return childHeightCm(w.age ?? 5);
  return adultHeightCm(w.role);
}
function picOf(w: Who): (typeof PICS)[keyof typeof PICS] {
  if (w.pic) return PICS[w.pic];
  if (w.role === "mom" || w.role === "grandma") return PICS.mom;
  if (w.role === "dad" || w.role === "grandpa") return PICS.dad;
  return PICS.kid;
}

/** 단체 사진(components/family/FamilyGroupPhoto)과 같은 셈 — groupOrder 순서로, faceLayout 크기에 그림 폭 */
function slotsOf(list: Who[]): GroupSlot[] {
  const people = [...list].sort((a, b) => RANK[a.role] - RANK[b.role]);
  const plans = faceLayout(
    people.map((w) => ({
      cm: cmOf(w),
      headRatio: picOf(w).ratio,
      face: faceSize(w.role, w.age ?? 5),
      pad: w.opaque ? OPAQUE_PAD : 0,
    })),
  );
  return people.map((w, i) => {
    const plan = plans[i];
    return {
      id: w.id,
      role: w.role,
      age: w.age ?? 5,
      height: plan.height,
      figure: plan.figure ?? plan.height,
      head: plan.split ? plan.split.head : guessHead(plan.height, w.role, w.age, picOf(w).ratio),
      width: picOf(w).aspect * (plan.split ? plan.split.scale : plan.height),
      opaque: !!w.opaque,
    };
  });
}

/** 홈 액자 무대(모바일) — 폭 328 · 높이 200 */
const HOME = { width: 328, height: 200 };

function lay(list: Who[], frame: { width?: number | null; height: number } = HOME) {
  const slots = slotsOf(list);
  const layout = groupLayout(slots, frame);
  const at = (id: string): GroupPlace => layout.places.find((p) => p.id === id)!;
  const slot = (id: string): GroupSlot => slots.find((s) => s.id === id)!;
  /** 그림 상자 양끝(px, 무대 가운데 기준) */
  const edges = (id: string) => {
    const p = at(id);
    const w = slot(id).width * p.px;
    return { left: p.x - w / 2, right: p.x + w / 2, w };
  };
  return { slots, layout, at, slot, edges };
}

/** 두 사람 그림 상자가 겹친 몫 — 두 폭의 평균 대비 */
function overlapShare(r: ReturnType<typeof lay>, a: string, b: string): number {
  const A = r.edges(a);
  const B = r.edges(b);
  const inter = Math.min(A.right, B.right) - Math.max(A.left, B.left);
  return inter / ((A.w + B.w) / 2);
}

const FAMILIES: [string, Who[]][] = [
  ["엄마·아이·아빠", [MOM, CHILD, DAD]],
  ["엄마·아빠·아이·아이", [MOM, DAD, CHILD, sib("sib", 8)]],
  ["엄마·아이", [MOM, CHILD]],
  ["아빠·아이·아이", [DAD, CHILD, sib("sib", 3)]],
  ["할머니·엄마·아이·아빠·할아버지", [GRANDMA, MOM, CHILD, DAD, GRANDPA]],
  ["아이 혼자", [CHILD]],
  ["6명", [GRANDMA, GRANDPA, MOM, DAD, CHILD, sib("sib", 3)]],
  ["아이 둘만", [CHILD, sib("sib", 8)]],
  ["엄마·아빠·아이·11살 형", [MOM, DAD, CHILD, sib("sib", 11)]],
  ["엄마·아빠", [MOM, DAD]],
];

describe("isFrontKid·guessHead", () => {
  it("앞줄은 아이·12살까지(나이 모름 포함) 형제·친구 — 머리 비율표의 아이 갈래와 같다", () => {
    assert.equal(isFrontKid({ role: "child", age: 12 }), true);
    assert.equal(isFrontKid({ role: "sibling", age: 12 }), true);
    assert.equal(isFrontKid({ role: "sibling" }), true);
    assert.equal(isFrontKid({ role: "friend", age: 13 }), false);
    assert.equal(isFrontKid({ role: "mom" }), false);
    assert.equal(isFrontKid({ role: "grandpa" }), false);
  });
  it("잰 비율이 있으면 그것, 없으면 표 × 0.8(모델이 머리를 20% 크게 그리는 버릇)", () => {
    assert.equal(guessHead(170, "dad", null, 5), 34);
    assert.equal(guessHead(175, "dad"), 175 / (headChartRatio("dad") * 0.8));
    assert.equal(guessHead(110, "child", 5), 110 / (5 * 0.8));
  });
});

describe("groupLayout — 사진관 가족사진 구도(사장님 2026-09-30 D안)", () => {
  it("사람이 없으면 빈 자리·그림자 없음", () => {
    assert.deepEqual(groupLayout([], HOME), { places: [], shadow: null, fit: 1 });
  });

  it("엄마·아이·아빠 — 엄마 왼쪽·아빠 오른쪽 뒷줄에 어깨를 붙이고, 아이는 앞 가운데(아래·조금 크게·맨 앞)", () => {
    const r = lay([MOM, CHILD, DAD]);
    const [mom, child, dad] = [r.at("mom"), r.at("child"), r.at("dad")];
    assert.equal(mom.row, "back");
    assert.equal(dad.row, "back");
    assert.equal(child.row, "front");
    assert.ok(mom.x < dad.x);
    // 아이는 두 사람 가운데(어깨 붙은 자리) 앞 — 시안 D
    assert.ok(Math.abs(child.x - (mom.x + dad.x) / 2) < 1, `child ${child.x} vs seam ${(mom.x + dad.x) / 2}`);
    // 두 사람은 저마다 가운데에서 제 폭의 약 40%
    const seam = (mom.x + dad.x) / 2;
    assert.ok(Math.abs((seam - mom.x) / r.edges("mom").w - 0.4) < 0.1);
    assert.ok(Math.abs((dad.x - seam) / r.edges("dad").w - 0.4) < 0.1);
    // 아이 발은 무대 높이의 5% 아래, 6% 크게
    assert.ok(Math.abs(mom.bottom - child.bottom - HOME.height * GROUP_PHOTO.drop) < 0.01);
    assert.equal(mom.bottom, dad.bottom);
    assert.equal(child.bottom, HOME.height * GROUP_PHOTO.ground);
    assert.equal(child.grow, GROUP_PHOTO.grow);
    assert.ok(Math.abs(child.px / mom.px - GROUP_PHOTO.grow) < 1e-9);
    // 겹치는 순서 — 아이가 맨 앞, 아빠(키 큰 사람)가 엄마 뒤
    assert.ok(child.z > mom.z && mom.z > dad.z);
  });

  it("조부모는 뒷줄 양끝(할아버지 왼쪽·할머니 오른쪽), 엄마·아빠는 예전 순서대로 안쪽", () => {
    const r = lay([GRANDMA, MOM, CHILD, DAD, GRANDPA]);
    const xs = ["grandpa", "mom", "dad", "grandma"].map((id) => r.at(id).x);
    assert.deepEqual([...xs].sort((a, b) => a - b), xs);
    for (const id of ["grandpa", "mom", "dad", "grandma"]) assert.equal(r.at(id).row, "back");
    assert.equal(r.at("child").row, "front");
  });

  it("할머니만 둘이면 한쪽에 몰리지 않고 양끝으로 나뉜다", () => {
    const r = lay([{ id: "gm1", role: "grandma" }, { id: "gm2", role: "grandma" }, MOM, DAD, CHILD]);
    const xs = r.layout.places.filter((p) => p.row === "back").sort((a, b) => a.x - b.x).map((p) => p.id);
    assert.equal(xs[0], "gm1");
    assert.equal(xs[xs.length - 1], "gm2");
  });

  it("어깨를 붙인다 — 이웃한 뒷줄 그림은 폭의 10~30%, 앞줄 아이끼리는 5~25% 겹친다", () => {
    for (const [name, list] of FAMILIES) {
      const r = lay(list);
      for (const row of ["back", "front"] as const) {
        const line = r.layout.places.filter((p) => p.row === row).sort((a, b) => a.x - b.x);
        for (let i = 1; i < line.length; i++) {
          const share = overlapShare(r, line[i - 1].id, line[i].id);
          const [lo, hi] = row === "back" ? [0.1, 0.3] : [0.05, 0.25];
          assert.ok(share >= lo && share <= hi, `${name} ${line[i - 1].id}-${line[i].id} ${share.toFixed(3)}`);
        }
      }
    }
  });

  it("앞줄 아이는 모두 뒷줄보다 아래·앞(z)·조금 크게, 앞줄은 뒷줄 가운데 앞에 선다", () => {
    for (const [name, list] of FAMILIES) {
      const { layout } = lay(list);
      const back = layout.places.filter((p) => p.row === "back");
      const front = layout.places.filter((p) => p.row === "front");
      if (front.length === 0) continue;
      for (const f of front) {
        for (const b of back) {
          assert.ok(f.bottom < b.bottom, `${name}: ${f.id} lower than ${b.id}`);
          assert.ok(f.z > b.z, `${name}: ${f.id} in front of ${b.id}`);
        }
        assert.equal(f.grow, GROUP_PHOTO.grow);
      }
      const minB = Math.min(...back.map((p) => p.x));
      const maxB = Math.max(...back.map((p) => p.x));
      for (const f of front) assert.ok(f.x > minB - 40 && f.x < maxB + 40, `${name}: ${f.id} stays in front of the back row`);
    }
  });

  it("앞줄 순서 — 우리 아이가 가운데, 다른 아이는 작은 아이부터 왼쪽·오른쪽 번갈아(큰 아이가 바깥)", () => {
    const r = lay([MOM, DAD, CHILD, sib("big", 9), sib("small", 3)]);
    const line = r.layout.places.filter((p) => p.row === "front").sort((a, b) => a.x - b.x).map((p) => p.id);
    assert.deepEqual(line, ["small", "child", "big"]);
    // 가운데 아이가 가장 앞
    const z = (id: string) => r.at(id).z;
    assert.ok(z("child") > z("small") && z("child") > z("big"));
  });

  it("어느 가족이든 얼굴을 가리지 않는다(아이 머리가 어른 얼굴에, 어른끼리도)", () => {
    for (const [name, list] of FAMILIES) {
      const { slots, layout } = lay(list);
      assert.deepEqual(coveredFaces(slots, layout), [], name);
    }
    // 앨범(186)·완성 화면(224) 높이, 좁은 화면에서도
    for (const frame of [{ width: 320, height: 186 }, { width: 360, height: 224 }, { width: 200, height: 200 }]) {
      for (const [name, list] of FAMILIES) {
        const { slots, layout } = lay(list, frame);
        assert.deepEqual(coveredFaces(slots, layout), [], `${name} @${frame.width}x${frame.height}`);
      }
    }
  });

  it("얼굴 가림 검사는 진짜로 잡는다 — 아이를 엄마 얼굴 앞으로 올리면 [아이, 엄마]", () => {
    const { slots, layout } = lay([MOM, CHILD, DAD]);
    const mom = layout.places.find((p) => p.id === "mom")!;
    const moved: GroupLayout = {
      ...layout,
      places: layout.places.map((p) => (p.id === "child" ? { ...p, x: mom.x, bottom: mom.bottom + 60 } : p)),
    };
    assert.deepEqual(coveredFaces(slots, moved), [["child", "mom"]]);
  });

  it("키 큰 아이(11살)는 앞줄에 서면 엄마 얼굴을 가려 뒷줄 어른 사이로 올라간다 — 작은 아이는 그대로 앞줄", () => {
    const r = lay([MOM, DAD, CHILD, sib("sib", 11)]);
    assert.equal(r.at("sib").row, "back");
    assert.ok(r.at("mom").x < r.at("sib").x && r.at("sib").x < r.at("dad").x);
    assert.equal(r.at("child").row, "front");
    // 8살 형은 엄마 턱 아래라 앞줄 그대로
    assert.equal(lay([MOM, DAD, CHILD, sib("sib", 8)]).at("sib").row, "front");
  });

  it("13살부터 형제·친구는 어른처럼 뒷줄", () => {
    const r = lay([MOM, DAD, CHILD, sib("teen", 15)]);
    assert.equal(r.at("teen").row, "back");
    assert.equal(r.at("child").row, "front");
  });

  it("어른 하나 + 아이 하나 — 아이가 예전 순서 쪽으로 비껴 선다(엄마면 오른쪽, 아빠면 왼쪽), 어른 몸을 다 가리지 않게", () => {
    const m = lay([MOM, CHILD]);
    assert.ok(m.at("child").x > m.at("mom").x);
    assert.equal(m.at("child").row, "front");
    const d = lay([DAD, CHILD]);
    assert.ok(d.at("child").x < d.at("dad").x);
    // 비껴 섰어도 어른 그림과 겹친다(따로 선 것처럼 보이지 않게) — 아이 그림 폭의 30% 넘게
    const share = overlapShare(m, "mom", "child");
    assert.ok(share > 0.3 && share < 0.8, `overlap ${share}`);
  });

  it("어른 하나 + 아이 둘 — 아이 둘이 어른 한가운데 앞(아이들 뒤에 선 아빠)", () => {
    const r = lay([DAD, CHILD, sib("sib", 3)]);
    const f = r.layout.places.filter((p) => p.row === "front");
    assert.equal(f.length, 2);
    const mid = (f[0].x + f[1].x) / 2;
    assert.ok(Math.abs(mid - r.at("dad").x) < 1);
  });

  it("앞줄이 없으면 한 줄로, 크기·높이 그대로 — 아이만·어른만·한 사람", () => {
    for (const list of [[CHILD, sib("sib", 8)], [MOM, DAD], [CHILD], [DAD]]) {
      const { layout } = lay(list);
      for (const p of layout.places) {
        assert.equal(p.row, "back");
        assert.equal(p.grow, 1);
        assert.equal(p.bottom, HOME.height * GROUP_PHOTO.ground);
      }
    }
    // 한 사람은 무대 한가운데
    assert.ok(Math.abs(lay([CHILD]).at("child").x) < 1e-9);
  });

  it("두 줄이어도 맨 위 머리는 예전 자리(무대 위에서 16%) — 홈 인사 말풍선이 어른 얼굴을 덮지 않고, 폴짝 뛰어도 안 잘리게", () => {
    const line = HOME.height * (GROUP_PHOTO.ground + GROUP_PHOTO.stage);
    for (const [name, list] of FAMILIES) {
      const r = lay(list);
      const top = Math.max(...r.layout.places.map((p) => p.bottom + r.slot(p.id).height * p.px));
      assert.ok(top <= line + 1e-6, `${name}: top ${top.toFixed(2)} > ${line}`);
      // 가장 큰 사람(투명 그림 — 그림 높이 = 키)은 그 줄에 딱 닿는다(한 줄일 때와 같은 자리)
      if (r.layout.fit === 1) assert.ok(Math.abs(top - line) < 1e-6, `${name}: top ${top.toFixed(2)} vs ${line}`);
    }
    // 두 줄이면 모두 stage − drop 만큼으로 — 뒷줄 가장 큰 사람 키 = 무대 높이의 73%, 앞줄 아이는 그 6% 크게
    const r = lay([MOM, CHILD, DAD]);
    const dadTall = r.slot("dad").figure! * r.at("dad").px;
    assert.ok(Math.abs(dadTall - HOME.height * (GROUP_PHOTO.stage - GROUP_PHOTO.drop)) < 1e-6);
  });

  it("무리 전체가 가운데에 서고 무대 안에 든다(넘치면 모두 함께 줄인다)", () => {
    for (const frame of [HOME, { width: 200, height: 200 }, { width: 150, height: 224 }]) {
      for (const [name, list] of FAMILIES) {
        const r = lay(list, frame);
        const lefts = r.layout.places.map((p) => r.edges(p.id).left);
        const rights = r.layout.places.map((p) => r.edges(p.id).right);
        const lo = Math.min(...lefts);
        const hi = Math.max(...rights);
        assert.ok(Math.abs(lo + hi) < 1e-6, `${name} centred`);
        if (r.layout.fit > GROUP_PHOTO.minFit) {
          assert.ok(hi - lo <= frame.width - 2 * GROUP_PHOTO.side + 1e-6, `${name} fits ${frame.width}: ${hi - lo}`);
        }
        // 위로도 넘치지 않는다 — 맨 위 그림 꼭대기가 무대 안
        for (const p of r.layout.places) {
          const s = r.slot(p.id);
          assert.ok(p.bottom + s.height * p.px <= frame.height, `${name} top inside`);
          assert.ok(p.bottom >= 0);
        }
      }
    }
  });

  it("넓은 무대에선 줄이지 않고, 좁으면 모두 같은 배율로 줄인다(사람끼리 비율 그대로)", () => {
    const wide = lay([GRANDMA, GRANDPA, MOM, DAD, CHILD, sib("sib", 3)]);
    assert.equal(wide.layout.fit, 1);
    const narrow = lay([GRANDMA, GRANDPA, MOM, DAD, CHILD, sib("sib", 3)], { width: 150, height: 200 });
    assert.ok(narrow.layout.fit < 1);
    for (const p of narrow.layout.places) {
      const w = wide.at(p.id);
      assert.ok(Math.abs(p.px / w.px - narrow.layout.fit) < 1e-9);
    }
    // 폭을 아직 못 쟀으면 줄이지 않는다
    assert.equal(lay([MOM, CHILD, DAD], { width: null, height: 200 }).layout.fit, 1);
  });

  it("그림자는 하나 — 무리 가운데, 무리 폭만큼, 뒷줄 발부터 앞줄 발까지", () => {
    const r = lay([MOM, CHILD, DAD]);
    const sh = r.layout.shadow!;
    assert.equal(sh.x, 0);
    const lo = Math.min(...r.layout.places.map((p) => r.edges(p.id).left));
    const hi = Math.max(...r.layout.places.map((p) => r.edges(p.id).right));
    assert.ok(Math.abs(sh.width - (hi - lo) * GROUP_PHOTO.shadowWidth) < 1e-6);
    assert.ok(sh.bottom < r.at("child").bottom);
    assert.ok(sh.bottom + sh.height > r.at("mom").bottom);
  });
});

/*
 * 흰 바탕 그림(opaque — 배경 지우기 실패)은 화면에서 곱하기로 얹는다. 곱하기는 먼저 그린 것과 모두 섞이므로, 흰 바탕 그림이
 * 다른 사람 위에 겹치면 뒤 사람이 비친다(아이 얼굴에 엄마 머리카락, 청바지가 초록빛 — 리뷰가 실제 그림으로 합성해 확인).
 */
describe("groupLayout — 흰 바탕 그림(곱하기)은 다른 사람 위에 겹치지 않는다", () => {
  const opaque = (w: Who): Who => ({ ...w, opaque: true });

  it("어느 가족이든, 누가 흰 바탕이든(한 사람·모두) 흰 바탕 그림이 먼저 그린 사람과 겹치지 않고 얼굴도 가리지 않는다", () => {
    for (const frame of [HOME, { width: 360, height: 224 }, { width: 200, height: 200 }]) {
      for (const [name, list] of FAMILIES) {
        const variants: [string, Who[]][] = [
          ...list.map((w, n): [string, Who[]] => [w.id, list.map((v, m) => (m === n ? opaque(v) : v))]),
          ["모두", list.map(opaque)],
        ];
        for (const [who, fam] of variants) {
          const { slots, layout } = lay(fam, frame);
          const tag = `${name} (흰 바탕 ${who}) @${frame.width}x${frame.height}`;
          assert.deepEqual(blendOverlaps(slots, layout), [], tag);
          assert.deepEqual(coveredFaces(slots, layout), [], tag);
          for (const p of layout.places) assert.ok(p.bottom + slots.find((s) => s.id === p.id)!.height * p.px <= frame.height, `${tag} top`);
        }
      }
    }
  });

  it("검사는 진짜로 잡는다 — 흰 바탕 아이를 투명 그림일 때 자리(앞줄 가운데) 그대로 두면 [아이, 엄마]·[아이, 아빠]", () => {
    const plain = lay([MOM, CHILD, DAD]);
    const { slots } = lay([MOM, opaque(CHILD), DAD]);
    assert.deepEqual(blendOverlaps(slots, plain.layout).sort(), [["child", "dad"], ["child", "mom"]]);
  });

  it("흰 바탕 아이는 앞줄 대신 뒷줄 엄마·아빠 사이에 서서 맨 뒤로 깔린다(부모 투명 그림이 그 위에 겹친다)", () => {
    const r = lay([MOM, opaque(CHILD), DAD]);
    for (const id of ["mom", "child", "dad"]) assert.equal(r.at(id).row, "back");
    assert.ok(r.at("mom").x < r.at("child").x && r.at("child").x < r.at("dad").x);
    assert.ok(r.at("child").z < r.at("mom").z && r.at("child").z < r.at("dad").z);
    // 앞줄이 없으니 한 줄 크기·높이
    assert.equal(r.at("child").bottom, HOME.height * GROUP_PHOTO.ground);
    // 형제도 흰 바탕이면 앞줄에 서지 않는다. 투명 아이는 앞줄에 서되, 뒷줄 가운데 선 흰 바탕 아이 얼굴을 가리면
    // 여느 때처럼 뒷줄로 올라간다(이 가족은 모두 한 줄 — 겹침·가림 없음은 위 시험이 본다)
    const s = lay([MOM, DAD, CHILD, opaque(sib("sib", 4))]);
    assert.equal(s.at("sib").row, "back");
    assert.deepEqual(blendOverlaps(s.slots, s.layout), []);
  });

  it("흰 바탕 엄마 — D 구도 그대로(아이 앞 가운데), 엄마만 아빠 뒤로", () => {
    const r = lay([opaque(MOM), CHILD, DAD]);
    assert.equal(r.at("child").row, "front");
    assert.ok(r.at("mom").z < r.at("dad").z && r.at("dad").z < r.at("child").z);
    assert.ok(overlapShare(r, "mom", "dad") > 0.1, "어깨는 그대로 붙는다");
  });

  it("엄마·아빠 둘 다 흰 바탕 — 서로 겹치지 않고 닿기만, 투명 아이는 그대로 앞 가운데", () => {
    const r = lay([opaque(MOM), CHILD, opaque(DAD)]);
    assert.ok(Math.abs(overlapShare(r, "mom", "dad")) < 1e-6, `${overlapShare(r, "mom", "dad")}`);
    assert.equal(r.at("child").row, "front");
    assert.ok(r.at("child").z > r.at("mom").z && r.at("child").z > r.at("dad").z);
  });

  it("아이만 있고 한 아이가 흰 바탕 — 한 줄 그대로, 흰 바탕 아이가 맨 뒤", () => {
    const r = lay([opaque(CHILD), sib("sib", 8)]);
    assert.equal(r.at("child").row, "back");
    assert.equal(r.at("sib").row, "back");
    assert.ok(r.at("child").z < r.at("sib").z);
  });

  it("마지막 안전망 — 그래도 흰 바탕 그림이 겹치면 한 줄로 띄워 세운다(아무도 겹치지 않는다)", () => {
    // 폭이 유난히 넓은 흰 바탕 두 사람 사이에 좁은 투명 한 사람 — 줄 안 이웃 셈만으로는 두 흰 바탕이 서로 겹친다
    const wide = (id: string, role: FamilyRole): GroupSlot => ({ id, role, height: 170, figure: 164, head: 30, width: 150, opaque: true });
    const slots: GroupSlot[] = [
      wide("grandpa", "grandpa"),
      { id: "mom", role: "mom", height: 160, head: 29, width: 12 },
      wide("dad", "dad"),
    ];
    const layout = groupLayout(slots, { width: null, height: 200 });
    assert.deepEqual(blendOverlaps(slots, layout), []);
    const xs = layout.places.map((p) => p.x);
    assert.deepEqual([...xs].sort((a, b) => a - b), xs, "넘긴 순서 그대로 왼쪽부터");
    const gap = 200 * GROUP_PHOTO.gap;
    for (let i = 1; i < slots.length; i++) {
      const between = xs[i] - xs[i - 1] - ((slots[i - 1].width + slots[i].width) / 2) * layout.places[i].px;
      assert.ok(Math.abs(between - gap) < 1e-6, `gap ${between}`);
    }
    for (const p of layout.places) {
      assert.equal(p.row, "back");
      assert.equal(p.bottom, 200 * GROUP_PHOTO.ground);
    }
  });
});
