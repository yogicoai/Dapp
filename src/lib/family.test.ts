import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  bestFriend,
  byRoleOrder,
  canAddRole,
  currentLockKey,
  familyLooksToPrompt,
  familyMembersOnly,
  familyTitle,
  freeRedrawsLeft,
  groupOrder,
  heightCm,
  hasBatchim,
  heightFor,
  homeMembers,
  isKidRole,
  lockChanges,
  lockedLooksChanged,
  lockKeyChanged,
  lockKeyLooks,
  lookRowsFor,
  mergeFamily,
  mergeRemovals,
  nextDrawCost,
  normalizeFamily,
  normalizeLooksFor,
  normalizeRemovals,
  ourChildrenNames,
  portraitLooksChanged,
  ROLE_ORDER,
  showsLooksChanged,
  withoutRemoved,
  type FamilyMember,
} from "./family.ts";
import {
  adultLookRows,
  CHILD_LOOK_ROWS_ALL,
  GLASSES_ICON,
  glassesChoice,
  glassesPatch,
  LOOK_ICONS,
  lookIcon,
  lookNoteMax,
  lookSwatch,
  migrateLookValue,
  READY_ICONS,
} from "./look-options.ts";
import { mergeRemoteChild, normalizeParents, type ChildPrefs } from "./prefs.ts";

const P = { url: "https://cdn.example.com/family/a.png", ref: "https://cdn.example.com/family/a.jpg", at: "2026-09-28" };

describe("값 — 한 사람 2쿠키(다시 그리기 1번 포함), 그 뒤 1쿠키", () => {
  it("처음은 2, 두 번째는 무료, 세 번째부터 1", () => {
    assert.equal(nextDrawCost(0), 2);
    assert.equal(nextDrawCost(undefined), 2);
    assert.equal(nextDrawCost(1), 0);
    assert.equal(nextDrawCost(2), 1);
    assert.equal(nextDrawCost(5), 1);
  });
  it("남은 무료 다시 그리기", () => {
    assert.equal(freeRedrawsLeft(0), 1);
    assert.equal(freeRedrawsLeft(1), 1);
    assert.equal(freeRedrawsLeft(2), 0);
  });
});

describe("familyTitle — 받침에 따라 '이네'/'네'", () => {
  it("하온 → 하온이네 가족, 지우 → 지우네 가족, 빈 이름 → 우리 가족", () => {
    assert.equal(familyTitle("하온"), "하온이네 가족");
    assert.equal(familyTitle("지우"), "지우네 가족");
    assert.equal(familyTitle(""), "우리 가족");
    assert.equal(familyTitle(undefined), "우리 가족");
  });
  it("이름이 여럿이면 가운뎃점으로 잇고, 마지막 이름 받침을 본다", () => {
    assert.equal(familyTitle(["하온", "하린"]), "하온·하린이네 가족");
    assert.equal(familyTitle(["하온", "지우"]), "하온·지우네 가족");
    assert.equal(familyTitle(["하온"]), "하온이네 가족");
    assert.equal(familyTitle([]), "우리 가족");
    assert.equal(familyTitle(["", " 하린 "]), "하린이네 가족");
  });
});

describe("ourChildrenNames — '우리 아이예요'를 켠 형제", () => {
  const fam: FamilyMember[] = [
    { id: "m-a", role: "sibling", callName: "여동생", name: "하린", isOurChild: true },
    { id: "m-b", role: "sibling", callName: "남동생", isOurChild: true },
    { id: "m-c", role: "sibling", callName: "누나", name: "수아" },
    { id: "m-d", role: "friend", callName: "친구", name: "서준" },
  ];
  it("아이 이름 먼저, 그다음 켠 형제(이름이 없으면 호칭)", () => {
    assert.deepEqual(ourChildrenNames("하온", fam), ["하온", "하린", "남동생"]);
    assert.equal(familyTitle(ourChildrenNames("하온", fam)), "하온·하린·남동생이네 가족");
  });
  it("아무도 안 켰으면 예전과 같다", () => {
    assert.deepEqual(ourChildrenNames("하온", []), ["하온"]);
    assert.equal(familyTitle(ourChildrenNames("하온", undefined)), "하온이네 가족");
    assert.deepEqual(ourChildrenNames("", undefined), []);
  });
});

describe("홈 가족 사진·단짝 친구·순서", () => {
  const fam: FamilyMember[] = [
    { id: "m-f", role: "friend", callName: "친구", portrait: P },
    { id: "mom", role: "mom", callName: "엄마", portrait: P },
    { id: "dad", role: "dad", callName: "아빠" },
    { id: "m-g", role: "grandma", callName: "할머니", portrait: P, showOnHome: false },
    { id: "m-s", role: "sibling", callName: "형", portrait: P },
    { id: "child", role: "child", callName: "하온", portrait: P },
  ];
  it("홈에는 고정된 사람 중 보이기를 켠 사람만 — 처음 값은 가족 켬·단짝 친구 끔", () => {
    assert.deepEqual(homeMembers(fam).map((m) => m.id), ["mom", "m-s", "child"]);
    const friendOn = fam.map((m) => (m.role === "friend" ? { ...m, showOnHome: true } : m));
    assert.deepEqual(homeMembers(friendOn).map((m) => m.id), ["m-f", "mom", "m-s", "child"]);
    assert.deepEqual(homeMembers(fam.map((m) => ({ ...m, showOnHome: false }))), []);
  });
  it("가족만 — 단짝 친구는 명패·숫자에서 빠진다", () => {
    assert.deepEqual(familyMembersOnly(fam).map((m) => m.id), ["mom", "dad", "m-g", "m-s", "child"]);
  });
  it("단짝 친구는 한 명 — 있으면 더 못 넣는다, 엄마·아빠·아이도 한 명", () => {
    assert.equal(bestFriend(fam)?.id, "m-f");
    assert.equal(canAddRole(fam, "friend"), false);
    assert.equal(canAddRole([], "friend"), true);
    assert.equal(canAddRole(fam, "mom"), false);
    assert.equal(canAddRole(fam, "grandpa"), true);
    assert.equal(canAddRole(fam, "sibling"), true);
  });
  it("역할 순서: 아이 → 엄마 → 아빠 → 형제자매 → 할머니 → 할아버지 → 단짝 친구", () => {
    assert.deepEqual(ROLE_ORDER, ["child", "mom", "dad", "sibling", "grandma", "grandpa", "friend"]);
    assert.deepEqual(byRoleOrder(fam).map((m) => m.role), ["child", "mom", "dad", "sibling", "grandma", "friend"]);
  });
  it("normalizeFamily 가 보이기(켬·끔 둘 다)와 '우리 아이'(형제만)를 지킨다", () => {
    const out = normalizeFamily([
      { id: "mom", role: "mom", callName: "엄마", showOnHome: false },
      { id: "m-f", role: "friend", callName: "친구", showOnHome: true, isOurChild: true },
      { id: "m-s", role: "sibling", callName: "형", isOurChild: true, showOnHome: "yes" },
    ]);
    assert.equal(out?.[0].showOnHome, false);
    assert.equal(out?.[1].showOnHome, true);
    assert.equal(out?.[1].isOurChild, undefined);
    assert.equal(out?.[2].isOurChild, true);
    assert.equal("showOnHome" in (out?.[2] ?? {}), false);
  });
});

describe("normalizeFamily", () => {
  it("배열이 아니면 undefined, 빈 배열은 빈 배열(모두 지움을 지킨다)", () => {
    assert.equal(normalizeFamily(undefined), undefined);
    assert.equal(normalizeFamily("x"), undefined);
    assert.deepEqual(normalizeFamily([]), []);
  });
  it("모르는 역할·잘못된 id·중복 id 는 버린다", () => {
    const out = normalizeFamily([
      { id: "mom", role: "mom", callName: "엄마" },
      { id: "mom", role: "mom", callName: "엄마2" },
      { id: "BAD ID", role: "dad" },
      { id: "m-1", role: "alien" },
    ]);
    assert.equal(out?.length, 1);
    assert.equal(out?.[0].callName, "엄마");
  });
  it("그림 주소는 https 만 받는다 — data: URL 은 버린다", () => {
    const out = normalizeFamily([
      { id: "child", role: "child", callName: "하온", portrait: P },
      { id: "mom", role: "mom", callName: "엄마", portrait: { url: "data:image/png;base64,AAAA", ref: P.ref, at: "" } },
    ]);
    assert.deepEqual(out?.[0].portrait, P);
    assert.equal(out?.[1].portrait, undefined);
  });
  it("호칭이 없으면 역할 이름으로 채운다", () => {
    assert.equal(normalizeFamily([{ id: "m-a", role: "grandma" }])?.[0].callName, "할머니");
  });
  it("'특징만 저장됨'(looksOnly)은 true 만 지키고, 합칠 때 나중에 바꾼 목록 쪽을 따른다", () => {
    const out = normalizeFamily([
      { id: "mom", role: "mom", callName: "엄마", looksOnly: true },
      { id: "dad", role: "dad", callName: "아빠", looksOnly: "yes" },
      { id: "m-g", role: "grandma", callName: "할머니", looksOnly: false },
    ]);
    assert.equal(out?.[0].looksOnly, true);
    assert.equal("looksOnly" in (out?.[1] ?? {}), false);
    assert.equal("looksOnly" in (out?.[2] ?? {}), false);
    const server = { family: [{ id: "mom", role: "mom" as const, callName: "엄마" }], familyAt: "2026-09-28T09:00:00Z" };
    const local = {
      family: [{ id: "mom", role: "mom" as const, callName: "엄마", looksOnly: true }],
      familyAt: "2026-09-28T10:00:00Z",
    };
    assert.equal(mergeFamily(server, local).family?.[0].looksOnly, true);
  });
});

describe("mergeRemoteChild — 가족", () => {
  const BASE = { name: "하온", age: 5, gender: "boy" as const };
  const fam: FamilyMember[] = [{ id: "child", role: "child", callName: "하온", portrait: P }];
  it("서버에 가족 칸이 없으면 이 기기 것을 지킨다", () => {
    assert.deepEqual(mergeRemoteChild({ ...BASE }, { ...BASE, family: fam }).family, fam);
  });
  it("서버에 뺀 기록이 있으면 이 기기 목록에서도 빠진다", () => {
    const grandma: FamilyMember = { id: "m-g", role: "grandma", callName: "할머니", addedAt: "2026-09-28T09:00:00Z" };
    const out = mergeRemoteChild(
      { ...BASE, family: fam, familyRemoved: [{ id: "m-g", at: "2026-09-28T09:10:00Z" }] },
      { ...BASE, family: [...fam, grandma] },
    );
    assert.deepEqual(out.family?.map((m) => m.id), ["child"]);
    assert.deepEqual(out.familyRemoved, [{ id: "m-g", at: "2026-09-28T09:10:00Z" }]);
  });
  it("서버 목록이 비어 있어도 뺀 기록이 없으면 이 기기 사람을 지킨다(합집합)", () => {
    assert.deepEqual(mergeRemoteChild({ ...BASE, family: [] }, { ...BASE, family: fam }).family, fam);
  });
  it("홈 액자 접힘 값 — 서버 값(false 도)이 이기고, 서버에 없으면 이 기기 값을 지킨다", () => {
    assert.equal(mergeRemoteChild({ ...BASE, homeFamilyFolded: false }, { ...BASE, homeFamilyFolded: true }).homeFamilyFolded, false);
    assert.equal(mergeRemoteChild({ ...BASE }, { ...BASE, homeFamilyFolded: true }).homeFamilyFolded, true);
  });
});

describe("mergeFamily — 기기·서버 가족 합치기", () => {
  const P2 = { url: "https://cdn.example.com/family/b.png", ref: "https://cdn.example.com/family/b.jpg", at: "2026-09-28T10:00:00Z" };
  const mom = (extra: Partial<FamilyMember> = {}): FamilyMember => ({ id: "mom", role: "mom", callName: "엄마", ...extra });
  const dad = (extra: Partial<FamilyMember> = {}): FamilyMember => ({ id: "dad", role: "dad", callName: "아빠", ...extra });

  it("옛 목록으로 저장해도 다른 기기에서 그린 그림은 남는다", () => {
    // 서버: 아빠를 그려 고정함(09:05). 이 기기: 아빠 그림 없는 옛 목록인데 나중에(09:10) 아무거나 저장.
    const server = { family: [mom(), dad({ portrait: P2, picAt: "2026-09-28T09:05:00Z", draws: 1 })], familyAt: "2026-09-28T09:05:00Z" };
    const local = { family: [mom(), dad()], familyAt: "2026-09-28T09:10:00Z" };
    const out = mergeFamily(server, local);
    assert.deepEqual(out.family?.find((m) => m.id === "dad")?.portrait, P2);
    assert.equal(out.family?.find((m) => m.id === "dad")?.draws, 1);
    assert.equal(out.familyAt, local.familyAt);
  });
  it("나중에 뺀 사람은 되살리지 않는다 — 뺀 기록이 그림보다 나중", () => {
    const server = {
      family: [mom()],
      familyAt: "2026-09-28T09:10:00Z",
      familyRemoved: [{ id: "dad", at: "2026-09-28T09:10:00Z" }],
    };
    const local = { family: [mom(), dad({ portrait: P2, picAt: "2026-09-28T09:00:00Z" })], familyAt: "2026-09-28T09:00:00Z" };
    assert.deepEqual(mergeFamily(server, local).family?.map((m) => m.id), ["mom"]);
    // 뺀 기록이 진 쪽(옛 목록이 이긴 쪽)에만 있어도 뺀다 — 목록 전체가 이기고 지지 않는다.
    const staleLocal = { family: [mom(), dad({ portrait: P2, picAt: "2026-09-28T09:00:00Z" })], familyAt: "2026-09-28T09:30:00Z" };
    assert.deepEqual(mergeFamily(server, staleLocal).family?.map((m) => m.id), ["mom"]);
  });
  it("빼기 뒤에 다른 기기에서 쿠키를 내고 그린 사람은 되살린다", () => {
    const server = { family: [mom()], familyAt: "2026-09-28T09:10:00Z", familyRemoved: [{ id: "dad", at: "2026-09-28T09:10:00Z" }] };
    const local = { family: [mom(), dad({ draft: P2, picAt: "2026-09-28T09:20:00Z" })], familyAt: "2026-09-28T09:00:00Z" };
    assert.deepEqual(mergeFamily(server, local).family?.map((m) => m.id), ["mom", "dad"]);
  });
  it("오래 열어 둔 화면이 아무거나 저장해도 다른 기기에서 넣고 고정한 사람은 남는다(검토 재현)", () => {
    // 서버: 폰에서 할머니를 넣고 2쿠키로 고정(10:00). 태블릿(오래 열어 둔 화면): 할머니를 본 적 없이 엄마 홈 보이기를 끔(10:05).
    const grandma: FamilyMember = { id: "m-grandma1", role: "grandma", callName: "할머니", portrait: P2, picAt: "2026-09-28T10:00:00Z" };
    const child: FamilyMember = { id: "child", role: "child", callName: "하온" };
    const server = { family: [child, mom({ portrait: P2 }), grandma], familyAt: "2026-09-28T10:00:00Z" };
    const tablet = { family: [child, mom({ portrait: P2, showOnHome: false })], familyAt: "2026-09-28T10:05:00Z" };
    const out = mergeFamily(server, tablet);
    assert.deepEqual(out.family?.map((m) => m.id), ["child", "mom", "m-grandma1"]);
    // 칸(홈 보이기)은 나중에 바꾼 쪽을 따른다.
    assert.equal(out.family?.find((m) => m.id === "mom")?.showOnHome, false);
    assert.deepEqual(out.family?.find((m) => m.id === "m-grandma1")?.portrait, P2);
  });
  it("뺐다가 다시 넣은 엄마(같은 id)는 예전 뺀 기록에 걸리지 않는다", () => {
    const removed = [{ id: "mom", at: "2026-09-28T09:10:00Z" }];
    const again = { family: [mom({ addedAt: "2026-09-28T09:20:00Z" })], familyAt: "2026-09-28T09:20:00Z" };
    assert.deepEqual(mergeFamily({ family: [], familyAt: "2026-09-28T09:10:00Z", familyRemoved: removed }, again).family?.map((m) => m.id), ["mom"]);
    // 다시 넣기 전의 옛 엄마(넣은 때 없음)는 빠진다.
    assert.deepEqual(mergeFamily({ family: [], familyRemoved: removed }, { family: [mom()] }).family, []);
  });
  it("뺀 기록 — 같은 사람은 더 나중 시각, 잘못된 값은 버린다, 아이는 빼지 않는다", () => {
    assert.deepEqual(
      mergeRemovals([{ id: "m-a", at: "2026-09-28T09:00:00Z" }], [{ id: "m-a", at: "2026-09-28T09:05:00Z" }]),
      [{ id: "m-a", at: "2026-09-28T09:05:00Z" }],
    );
    assert.equal(mergeRemovals(undefined, []), undefined);
    assert.deepEqual(normalizeRemovals([{ id: "BAD ID", at: "x" }, { id: "m-b" }, { id: "m-c", at: "2026-09-28" }, "x"]), [
      { id: "m-c", at: "2026-09-28" },
    ]);
    const kid: FamilyMember = { id: "child", role: "child", callName: "하온" };
    assert.deepEqual(withoutRemoved([kid], [{ id: "child", at: "2099-01-01" }]), [kid]);
  });
  it("서버 저장이 실패해 이 기기에만 있는 그림 — 불러오기가 서버 옛 값으로 덮지 않는다", () => {
    const server = { family: [mom()], familyAt: "2026-09-28T09:00:00Z" };
    const local = { family: [mom({ draft: P2, picAt: "2026-09-28T09:30:00Z", draws: 1 })], familyAt: "2026-09-28T09:30:00Z" };
    assert.deepEqual(mergeFamily(server, local).family?.[0].draft, P2);
  });
  it("한쪽에 가족 칸이 없으면 다른 쪽을 그대로", () => {
    assert.deepEqual(mergeFamily({}, { family: [mom()] }).family, [mom()]);
    assert.deepEqual(mergeFamily({ family: [] }, {}).family, []);
  });
});

describe("키·순서·생김새", () => {
  it("아이 키는 나이로, 어른은 역할로", () => {
    assert.equal(heightCm({ role: "child" }, 5), 110);
    assert.equal(heightCm({ role: "dad" }), 175);
    assert.equal(heightCm({ role: "sibling", age: 8 }, 5), 128);
  });
  it("단체 사진은 아이가 가운데 쪽, 조부모가 바깥", () => {
    const ms = ["child", "dad", "grandma", "mom", "grandpa"].map((r) => ({ id: r, role: r, callName: r }) as FamilyMember);
    assert.deepEqual(groupOrder(ms).map((m) => m.role), ["grandpa", "mom", "child", "dad", "grandma"]);
  });
  it("생김새 한 줄 — 안경이 없으면 '쓰지 않는다'를 적는다", () => {
    assert.equal(
      familyLooksToPrompt({ hair: "올림머리", hairColor: "흰머리", outfit: "카디건", color: "보라" }),
      "하얀 올림머리, 안경을 쓰지 않는다, 평소에 보라 카디건을 즐겨 입는다",
    );
  });
  it("옷만 바뀌면 다시 그릴지 묻지 않는다", () => {
    assert.equal(lockedLooksChanged({ hair: "단발", color: "노랑" }, { hair: "단발", color: "파랑" }), false);
    assert.equal(lockedLooksChanged({ hair: "단발" }, { hair: "긴 머리" }), true);
  });
});

describe("키 옵션 — 단체 사진 키 비율", () => {
  it("엄마·아빠는 넘긴 키 칩으로, 안 고르면 '보통'(예전 값)", () => {
    assert.equal(heightCm({ role: "mom" }), 163);
    assert.equal(heightCm({ role: "mom" }, null, "작은 편"), 155);
    assert.equal(heightCm({ role: "mom" }, null, "아주 큰 편"), 175);
    assert.equal(heightCm({ role: "dad" }, undefined, "큰 편"), 181);
    assert.equal(heightCm({ role: "dad" }, undefined, "모르는 값"), 175);
  });
  it("할머니·할아버지는 member.looks.height 를 쓴다", () => {
    assert.equal(heightCm({ role: "grandma", looks: { height: "작은 편" } }), 148);
    assert.equal(heightCm({ role: "grandma" }), 154);
    assert.equal(heightCm({ role: "grandpa", looks: { height: "아주 큰 편" } }), 178);
    assert.equal(heightCm({ role: "grandpa" }), 166);
  });
  it("heightFor — 엄마·아빠 키는 설정(parents)에서 찾는다", () => {
    const child = { age: 5, parents: { mom: { height: "큰 편" }, dad: { height: "작은 편" } } };
    assert.equal(heightFor({ role: "mom" }, child), 169);
    assert.equal(heightFor({ role: "dad" }, child), 167);
    assert.equal(heightFor({ role: "child" }, child), 110);
    assert.equal(heightFor({ role: "grandpa", looks: { height: "큰 편" } }, child), 172);
  });
});

describe("어른 생김새 — 새 칸 정규화·옛 값 옮기기", () => {
  it("할머니: 새 칸을 지키고 수염은 버린다, 빈 칸은 두지 않는다", () => {
    const out = normalizeLooksFor(
      {
        hair: "쪽진 머리",
        hairColor: "회색",
        face: "동그래요",
        eyes: "순한 눈매",
        height: "작은 편",
        beard: "콧수염",
        marks: ["점", "점", "", 3],
        accessories: ["스카프", "앞치마"],
        outfit: "스웨터",
        bottom: "",
        items: ["곰인형"],
        unknown: "x",
      },
      "grandma",
    );
    assert.deepEqual(out, {
      hair: "쪽진 머리",
      hairColor: "회색",
      face: "동그래요",
      eyes: "순한 눈매",
      height: "작은 편",
      outfit: "니트",
      marks: ["점"],
      accessories: ["스카프", "앞치마"],
    });
  });
  it("아빠 '아주 짧은 머리'는 반삭으로, 할아버지 '아주 짧은 머리'는 그대로", () => {
    assert.equal(normalizeLooksFor({ hair: "아주 짧은 머리" }, "dad")?.hair, "반삭");
    assert.equal(normalizeLooksFor({ hair: "아주 짧은 머리" }, "grandpa")?.hair, "아주 짧은 머리");
    assert.equal(normalizeLooksFor({ beard: "턱수염" }, "grandpa")?.beard, "턱수염");
  });
  it("안경 — 종류가 있으면 종류로 맞추고, 종류 없는 예전 true 는 살린다", () => {
    assert.deepEqual(normalizeLooksFor({ glassesType: "뿔테" }, "grandpa"), { glassesType: "뿔테", glasses: true });
    assert.deepEqual(normalizeLooksFor({ glassesType: "안 써요", glasses: true }, "grandma"), { glassesType: "안 써요" });
    assert.deepEqual(normalizeLooksFor({ glasses: true }, "grandma"), { glasses: true });
    assert.equal(normalizeLooksFor({}, "grandma"), undefined);
  });
  it("형제·친구: 아이 칩 칸(머리결·앞머리·늘 지니는 것)을 지키고 예전 체형 글자를 아이 칩으로", () => {
    assert.deepEqual(
      normalizeLooksFor({ hairTexture: "곱슬머리", bangs: "있어요", build: "보통", items: ["곰인형"] }, "sibling"),
      { hairTexture: "곱슬머리", bangs: "있어요", build: "보통이에요", items: ["곰인형"] },
    );
    assert.equal(normalizeLooksFor({ items: ["곰인형"] }, "grandma"), undefined);
  });
  it("normalizeFamily 도 역할에 맞게 옮긴다", () => {
    const out = normalizeFamily([{ id: "m-s", role: "sibling", callName: "형", looks: { build: "통통한 편", beard: "콧수염" } }]);
    assert.deepEqual(out?.[0].looks, { build: "통통해요" });
  });
});

describe("생김새 한 줄 — 새 칸", () => {
  it("할아버지 한 줄: 머리·얼굴·안경·수염·이런 점도·옷·늘 하는 것 순서", () => {
    assert.equal(
      familyLooksToPrompt(
        {
          hair: "살짝 벗어진 머리",
          hairColor: "흰머리",
          face: "각진 편",
          brows: "진한 눈썹",
          height: "큰 편",
          glassesType: "뿔테",
          glasses: true,
          beard: "없어요",
          marks: ["웃을 때 눈주름", "점"],
          outfit: "셔츠",
          bottom: "슬랙스",
          color: "네이비",
          accessories: ["시계"],
          note: "늘 웃는다",
        },
        "grandpa",
      ),
      "하얀 살짝 벗어진 머리, 얼굴이 각진 편이다, 눈썹이 진하다, 키가 큰 편이다, 뿔테 안경을 썼다, 수염이 없다, " +
        "웃을 때 생기는 눈주름·얼굴의 점이 있다, 평소에 네이비 셔츠에 슬랙스를 즐겨 입고 시계를 즐겨 한다, 늘 웃는다",
    );
  });
  it("할머니에게 수염 값이 잘못 들어 있어도 적지 않는다", () => {
    assert.equal(familyLooksToPrompt({ beard: "콧수염" }, "grandma"), "안경을 쓰지 않는다");
  });
  it("형제(아이 칩) — 머리결·앞머리·몸집·앞니·늘 지니는 것", () => {
    assert.equal(
      familyLooksToPrompt(
        { hair: "단발", hairTexture: "곧은 생머리", bangs: "있어요", build: "마른 편이에요", marks: ["앞니 빠짐", "보조개"], items: ["곰인형"] },
        "sibling",
      ),
      "단발머리, 머리결은 곧은 생머리로 웨이브·곱슬·파마가 없다, 앞머리가 있다, 마른 편이다, 안경을 쓰지 않는다, 보조개가 있다, 앞니가 하나 빠졌다, 늘 곰인형을 지니고 다닌다",
    );
  });
  it("머리 모양이 명사가 아니면 문장으로, 머리 색은 꾸밈말로 — 무엇이 짧은지 분명하게", () => {
    assert.equal(familyLooksToPrompt({ hair: "아주 짧아요" }, "sibling"), "머리가 아주 짧다, 안경을 쓰지 않는다");
    assert.equal(familyLooksToPrompt({ hair: "아주 짧아요", hairColor: "까만색" }, "friend"), "까만 머리가 아주 짧다, 안경을 쓰지 않는다");
    assert.equal(familyLooksToPrompt({ hair: "하나로 묶기", hairColor: "희끗희끗" }, "mom"), "희끗희끗한 머리를 하나로 묶었다, 안경을 쓰지 않는다");
    assert.equal(familyLooksToPrompt({ hair: "짧은 머리", hairColor: "흰머리" }, "grandpa"), "하얀 짧은 머리, 안경을 쓰지 않는다");
    // 색만 고르면 '머리는 흰머리' 같은 겹말 대신
    assert.equal(familyLooksToPrompt({ hairColor: "흰머리" }, "grandma"), "머리가 하얗다, 안경을 쓰지 않는다");
    assert.equal(familyLooksToPrompt({ hairColor: "까만색" }, "child"), "머리 색은 까맣다, 안경을 쓰지 않는다");
  });
  it("머리 모양이 머리결·앞머리까지 정하면 그 칸은 적지 않는다 — 한 줄에 정반대 말이 없게", () => {
    const perm = familyLooksToPrompt({ hair: "곱슬 파마", hairTexture: "곧은 생머리" }, "mom");
    assert.equal(perm, "곱슬 파마머리, 안경을 쓰지 않는다");
    const bangs = familyLooksToPrompt({ hair: "앞머리 내린 머리", bangs: "없어요(가르마)" }, "dad");
    assert.equal(bangs, "앞머리 내린 머리, 안경을 쓰지 않는다");
    // 머리결을 정하지 않는 머리 모양이면 그대로 적는다.
    assert.ok(familyLooksToPrompt({ hair: "단발", hairTexture: "굵은 웨이브" }, "mom").includes("굵고 큰 웨이브"));
  });
  it("늘 하는 것은 평소 옷과 같은 말투('평소에 … 즐겨 한다') — 모든 쪽에 붙지 않게", () => {
    assert.equal(familyLooksToPrompt({ accessories: ["앞치마", "모자"] }, "mom"), "안경을 쓰지 않는다, 평소에 앞치마·모자를 즐겨 한다");
    assert.ok(!familyLooksToPrompt({ accessories: ["시계"] }, "dad").includes("착용"));
  });
  it("아이도 같은 문장 규칙 — '을(를)'·칩 글자 그대로·이런 점도 늘어놓기가 없다", () => {
    const line = familyLooksToPrompt({ bangs: "없어요", items: ["곰인형"], marks: ["주근깨", "볼이 통통해요"] }, "child");
    assert.equal(line, "앞머리가 없다, 안경을 쓰지 않는다, 주근깨가 있다, 볼이 통통하다, 늘 곰인형을 지니고 다닌다");
    assert.ok(!line.includes("을(를)"));
  });
  it("옷 색만·아래옷만", () => {
    assert.ok(familyLooksToPrompt({ color: "카키" }).endsWith("평소에 카키 옷을 즐겨 입는다"));
    assert.ok(familyLooksToPrompt({ bottom: "청바지" }).endsWith("평소에 청바지를 즐겨 입는다"));
    assert.ok(familyLooksToPrompt({ color: "카키", bottom: "치마" }).endsWith("평소에 카키 옷에 치마를 즐겨 입는다"));
  });
  it("clothes:false — 평소 옷·늘 하는 것만 빼고 나머지는 그대로(이야기가 책마다 옷을 정한다)", () => {
    const l = { hair: "단발", color: "카키", outfit: "카디건", bottom: "치마", accessories: ["앞치마"], items: ["곰인형"], note: "메모" };
    const out = familyLooksToPrompt(l, "mom", { clothes: false });
    assert.equal(out, "단발머리, 안경을 쓰지 않는다, 늘 곰인형을 지니고 다닌다, 메모");
    assert.ok(!/즐겨 입|즐겨 한다|카키|카디건|치마|앞치마/.test(out), out);
    assert.equal(familyLooksToPrompt(l, "mom", {}), familyLooksToPrompt(l, "mom"));
  });
});

describe("'늘 그대로' 견주기 — lockKey", () => {
  const child = (parents: ChildPrefs["parents"], looks?: ChildPrefs["looks"]) => ({ looks, parents });
  const mom: FamilyMember = { id: "mom", role: "mom", callName: "엄마" };

  it("엄마 lockKey 는 설정(parents) 값으로 — 옷·늘 하는 것·메모는 안 들어간다", () => {
    const key = currentLockKey(mom, child({ mom: { hair: "숏컷", face: "갸름해요", color: "파랑", accessories: ["시계"], note: "x" } }));
    assert.equal(key, JSON.stringify([["hair", "숏컷"], ["face", "갸름해요"]]));
  });
  it("평소 옷만 바꾸면 바뀐 게 아니다, 얼굴형·키·이런 점도를 바꾸면 바뀐 것", () => {
    const key = currentLockKey(mom, child({ mom: { hair: "숏컷", marks: ["점", "보조개"] } }));
    const same = child({
      mom: { hair: "숏컷", marks: ["보조개", "점"], outfit: "니트", bottom: "치마", color: "버건디", accessories: ["귀걸이"], note: "메모" },
    });
    assert.equal(lockKeyChanged(key, mom, same), false);
    assert.equal(lockKeyChanged(key, mom, child({ mom: { hair: "숏컷", marks: ["점", "보조개"], face: "계란형" } })), true);
    assert.equal(lockKeyChanged(key, mom, child({ mom: { hair: "숏컷", marks: ["점", "보조개"], height: "큰 편" } })), true);
    assert.equal(lockKeyChanged(key, mom, child({ mom: { hair: "숏컷", marks: ["점"] } })), true);
  });
  it("예전 화면이 적은 lockKey(옛 글자·메모 칸)는 새 글자로 옮겨 견준다", () => {
    const old = JSON.stringify([["hair", "짧은 머리"], ["glasses", true], ["note", "앞치마"]]);
    assert.equal(lockKeyChanged(old, mom, child({ mom: { hair: "숏컷", glasses: true, note: "다른 메모" } })), false);
    assert.equal(lockKeyChanged(old, mom, child({ mom: { hair: "숏컷", glassesType: "뿔테", glasses: true } })), true);
  });
  it("안경 '안 써요'는 안 고른 것과 같다", () => {
    const key = currentLockKey(mom, child({ mom: { hair: "단발" } }));
    assert.equal(lockKeyChanged(key, mom, child({ mom: { hair: "단발", glassesType: "안 써요" } })), false);
  });
  it("lockKey 가 없거나 못 읽으면 견주지 않는다", () => {
    assert.equal(lockKeyChanged(undefined, mom, child({ mom: { hair: "단발" } })), false);
    assert.equal(lockKeyChanged("{broken", mom, child({ mom: { hair: "단발" } })), false);
    assert.equal(portraitLooksChanged(mom, child({ mom: { hair: "단발" } })), false);
  });
  it("아이는 설정 looks, 할머니는 member.looks", () => {
    const kid: FamilyMember = { id: "child", role: "child", callName: "하온" };
    const key = currentLockKey(kid, child(undefined, { hair: "단발", color: "노랑", marks: ["주근깨"] }));
    assert.equal(lockKeyChanged(key, kid, child(undefined, { hair: "단발", color: "파랑", marks: ["주근깨"] })), false);
    assert.equal(lockKeyChanged(key, kid, child(undefined, { hair: "단발", marks: ["주근깨", "보조개"] })), true);
    const gm: FamilyMember = { id: "m-g", role: "grandma", callName: "할머니", looks: { hair: "쪽진 머리", outfit: "카디건" } };
    const gKey = currentLockKey(gm, null);
    assert.equal(portraitLooksChanged({ ...gm, portrait: { ...P, lockKey: gKey }, looks: { hair: "쪽진 머리", outfit: "니트" } }, null), false);
    assert.equal(portraitLooksChanged({ ...gm, portrait: { ...P, lockKey: gKey }, looks: { hair: "단발" } }, null), true);
  });
  it("'모습이 바뀌었어요' 표시 — 확인 전 새 그림이 있으면 묻지 않는다(모아 보기·설정 같은 규칙)", () => {
    const gm: FamilyMember = { id: "m-g", role: "grandma", callName: "할머니", looks: { hair: "쪽진 머리" } };
    const gKey = currentLockKey(gm, null);
    const changed: FamilyMember = { ...gm, portrait: { ...P, lockKey: gKey }, looks: { hair: "단발" } };
    assert.equal(showsLooksChanged(changed, null), true);
    assert.equal(showsLooksChanged({ ...changed, draft: { ...P, lockKey: currentLockKey(changed, null) } }, null), false);
    assert.equal(showsLooksChanged({ ...gm, looks: { hair: "단발" } }, null), false);
  });
  it("바뀐 칸 글자 — '머리 모양: 단발 → 숏컷' 처럼", () => {
    const then = lockKeyLooks(JSON.stringify([["hair", "단발"], ["glasses", true]]));
    assert.deepEqual(lockChanges("mom", then, { hair: "숏컷", glassesType: "동그란 안경", color: "파랑" }), [
      "머리 모양: 단발 → 숏컷",
      "안경: 안경 씀 → 동그란 안경",
    ]);
    assert.deepEqual(lockChanges("sibling", { build: "보통이에요" }, { build: "통통해요" }), ["몸집: 보통이에요 → 통통해요"]);
    assert.deepEqual(lockChanges("grandma", {}, { outfit: "니트" }), []);
  });
  it("사진으로 그린 그림(fromPhoto)은 칩이 비었거나 바뀌어도 '모습이 바뀌었어요'를 띄우지 않는다", () => {
    const gm: FamilyMember = { id: "m-g", role: "grandma", callName: "할머니" };
    // 칩 없이 사진으로 그렸다 — 그때 lockKey 는 빈 목록
    const photoPic = { ...P, lockKey: currentLockKey(gm, null), fromPhoto: true };
    const later: FamilyMember = { ...gm, portrait: photoPic, looks: { hair: "단발", glassesType: "뿔테" } };
    assert.equal(portraitLooksChanged(later, null), false);
    assert.equal(showsLooksChanged(later, null), false);
    // 같은 칩 변화라도 칩으로 그린 그림이면 묻는다(지금까지와 같다)
    const chipPic = { ...P, lockKey: currentLockKey(gm, null) };
    assert.equal(showsLooksChanged({ ...later, portrait: chipPic }, null), true);
  });
  it("fromPhoto 는 true 만 저장하고, 기기끼리 합칠 때 그림과 함께 따라간다 — 사진 자체는 어디에도 없다", () => {
    const out = normalizeFamily([
      { id: "mom", role: "mom", callName: "엄마", portrait: { ...P, fromPhoto: true } },
      { id: "dad", role: "dad", callName: "아빠", portrait: { ...P, fromPhoto: "yes" } },
      // 누가 사진을 끼워 넣어도(옛 코드·손으로 고친 값) 정규화가 버린다 — 알려진 칸만 남긴다.
      { id: "m-g", role: "grandma", callName: "할머니", draft: { ...P, photo: "data:image/jpeg;base64,/9j/AAAA" } },
    ]);
    assert.equal(out?.[0].portrait?.fromPhoto, true);
    assert.equal("fromPhoto" in (out?.[1].portrait ?? {}), false);
    assert.equal(JSON.stringify(out).includes("data:image"), false);
    const server = { family: [{ id: "mom", role: "mom" as const, callName: "엄마" }], familyAt: "2026-09-29T09:00:00Z" };
    const local = {
      family: [{ id: "mom", role: "mom" as const, callName: "엄마", portrait: { ...P, fromPhoto: true }, picAt: "2026-09-29T10:00:00Z" }],
      familyAt: "2026-09-29T08:00:00Z",
    };
    assert.equal(mergeFamily(server, local).family?.[0].portrait?.fromPhoto, true);
  });
  it("headRatio(잰 머리 비율)는 2~10 숫자만 0.01 단위로 지키고, 기기끼리 합칠 때 그림과 함께 따라간다", () => {
    const out = normalizeFamily([
      { id: "dad", role: "dad", callName: "아빠", portrait: { ...P, headRatio: 4.2137 }, draft: { ...P, headRatio: 5.5 } },
      { id: "mom", role: "mom", callName: "엄마", portrait: { ...P, headRatio: "5.5" } },
      { id: "child", role: "child", callName: "하온", portrait: { ...P, headRatio: 42 }, prevDraft: { ...P, headRatio: Number.NaN } },
    ]);
    assert.equal(out?.[0].portrait?.headRatio, 4.21);
    assert.equal(out?.[0].draft?.headRatio, 5.5);
    assert.equal("headRatio" in (out?.[1].portrait ?? {}), false, "글자는 버린다");
    assert.equal("headRatio" in (out?.[2].portrait ?? {}), false, "범위 밖은 버린다");
    assert.equal("headRatio" in (out?.[2].prevDraft ?? {}), false);
    // 없는 그림(예전 그림)은 칸 자체가 없다 — 단체 사진이 실제 키 비율 그대로 세운다
    assert.deepEqual(normalizeFamily([{ id: "child", role: "child", callName: "하온", portrait: P }])?.[0].portrait, P);
    const server = {
      family: [{ id: "dad", role: "dad" as const, callName: "아빠", portrait: P, picAt: "2026-09-29T09:00:00Z" }],
      familyAt: "2026-09-29T09:00:00Z",
    };
    const local = {
      family: [{ id: "dad", role: "dad" as const, callName: "아빠", portrait: { ...P, headRatio: 5.31 }, picAt: "2026-09-29T10:00:00Z" }],
      familyAt: "2026-09-29T08:00:00Z",
    };
    assert.equal(mergeFamily(server, local).family?.[0].portrait?.headRatio, 5.31, "더 새 그림 쪽의 잰 비율");
    assert.equal(mergeFamily(local, { ...server, family: [{ ...server.family[0], picAt: "2026-09-29T11:00:00Z" }] }).family?.[0].portrait?.headRatio, undefined);
  });
  it("bodyStretch(굽기 때 늘인 몸 배율)는 1 초과 ~ 1.5 숫자만 0.01 단위로 지키고 그림과 함께 따라간다", () => {
    const out = normalizeFamily([
      { id: "mom", role: "mom", callName: "엄마", portrait: { ...P, headRatio: 4.8, bodyStretch: 1.3487 } },
      { id: "dad", role: "dad", callName: "아빠", portrait: { ...P, bodyStretch: "1.3" }, draft: { ...P, bodyStretch: 1 } },
      { id: "child", role: "child", callName: "하온", portrait: { ...P, bodyStretch: 3 } },
    ]);
    assert.equal(out?.[0].portrait?.bodyStretch, 1.35);
    assert.equal(out?.[0].portrait?.headRatio, 4.8);
    assert.equal("bodyStretch" in (out?.[1].portrait ?? {}), false, "글자는 버린다");
    assert.equal("bodyStretch" in (out?.[1].draft ?? {}), false, "1 은 안 늘인 것 — 칸이 없다");
    assert.equal("bodyStretch" in (out?.[2].portrait ?? {}), false, "범위 밖은 버린다");
  });
  it("lockedLooksChanged — 옷·메모만 바뀌면 false, 이런 점도 순서는 상관없다", () => {
    assert.equal(lockedLooksChanged({ hair: "단발", outfit: "니트" }, { hair: "단발", outfit: "셔츠", bottom: "치마" }), false);
    assert.equal(lockedLooksChanged({ marks: ["점", "덧니"] }, { marks: ["덧니", "점"] }), false);
    assert.equal(lockedLooksChanged({ face: "갸름해요" }, { face: "동그래요" }), true);
    assert.equal(lockedLooksChanged({ note: "a" }, { note: "b" }), false);
  });
});

describe("칩 줄(look-options)", () => {
  it("엄마 머리 모양 12가지·아빠 9가지 — 사장님 목록 그대로", () => {
    const mom = adultLookRows("mom").find((r) => r.key === "hair");
    assert.deepEqual(mom?.options, [
      "숏컷",
      "짧은 단발",
      "단발",
      "중단발",
      "긴 머리",
      "아주 긴 머리",
      "하나로 묶기",
      "반묶음",
      "올림머리",
      "땋은 머리",
      "굵은 웨이브 파마",
      "곱슬 파마",
    ]);
    assert.equal(adultLookRows("dad").find((r) => r.key === "hair")?.options.length, 9);
  });
  it("수염은 아빠·할아버지만, 할머니·할아버지 머리 색은 따로", () => {
    assert.ok(adultLookRows("dad").some((r) => r.key === "beard"));
    assert.ok(adultLookRows("grandpa").some((r) => r.key === "beard"));
    assert.ok(!adultLookRows("mom").some((r) => r.key === "beard"));
    assert.deepEqual(adultLookRows("grandma").find((r) => r.key === "hairColor")?.options, ["까만색", "희끗희끗", "회색", "흰머리"]);
    assert.equal(adultLookRows("mom").find((r) => r.key === "hairColor")?.options.length, 5);
  });
  it("'늘 그대로' 먼저, '평소 옷' 나중 — 여러 개 고르는 줄은 이런 점도·늘 하는 것", () => {
    const rows = adultLookRows("dad");
    const firstOutfit = rows.findIndex((r) => !r.lock);
    assert.ok(rows.slice(firstOutfit).every((r) => !r.lock));
    assert.deepEqual(rows.filter((r) => r.multi).map((r) => r.key), ["marks", "accessories"]);
    assert.deepEqual(rows.filter((r) => !r.lock).map((r) => r.label), ["옷 종류", "아래옷", "옷 색", "늘 하는 것"]);
    assert.equal(rows.find((r) => r.key === "color")?.options.length, 13);
  });
  it("가족 화면 줄: 할머니는 어른 칩, 형제는 아이 칩 + 옷 종류", () => {
    assert.ok(lookRowsFor("grandma").some((r) => r.key === "face"));
    const sib = lookRowsFor("sibling").map((r) => r.key);
    assert.deepEqual(sib, ["hair", "hairTexture", "bangs", "hairColor", "eyes", "skin", "build", "marks", "outfit", "color", "items"]);
  });
  it("아이 줄은 설정과 같은 10줄 — 가족 화면 아이 탭도 그대로(옷 종류 칸 없음)", () => {
    assert.equal(CHILD_LOOK_ROWS_ALL.length, 10);
    const kid = lookRowsFor("child");
    assert.deepEqual(
      kid.map((r) => r.key).sort(),
      CHILD_LOOK_ROWS_ALL.map((r) => r.key).sort(),
    );
    for (const r of kid) assert.deepEqual(r.options, CHILD_LOOK_ROWS_ALL.find((x) => x.key === r.key)?.opts);
    assert.equal(LOOK_ICONS["곰인형"], "/icons/looks/item-teddy.webp");
  });
  it("아이 쪽 역할 — 아이·형제·단짝 친구", () => {
    assert.deepEqual(ROLE_ORDER.filter(isKidRole), ["child", "sibling", "friend"]);
  });
  it("받침 — 한글 끝 글자만, 아니면 false", () => {
    assert.equal(hasBatchim("하온"), true);
    assert.equal(hasBatchim("지우"), false);
    assert.equal(hasBatchim("Leo"), false);
    assert.equal(hasBatchim(""), false);
  });
  it("색 동그라미 — 옷 색·머리 색·피부 줄만", () => {
    assert.ok(lookSwatch("color", "버건디"));
    assert.ok(lookSwatch("hairColor", "희끗희끗"));
    assert.ok(lookSwatch("skin", "보통이에요"));
    assert.equal(lookSwatch("skin", "보통"), lookSwatch("skin", "보통이에요"));
    assert.equal(lookSwatch("hair", "빨강"), undefined);
  });
  it("메모 길이 — 입력 칸과 저장이 같은 값(아이 100 · 엄마·아빠 40 · 그 밖 60)", () => {
    assert.equal(lookNoteMax("child"), 100);
    assert.equal(lookNoteMax("mom"), 40);
    assert.equal(lookNoteMax("dad"), 40);
    assert.equal(lookNoteMax("grandma"), 60);
    assert.equal(lookNoteMax("friend"), 60);
    const long = "가".repeat(120);
    assert.equal(normalizeParents({ mom: { note: long } })?.mom?.note?.length, 40);
    assert.equal(normalizeLooksFor({ note: long }, "grandpa")?.note?.length, 60);
    assert.equal(normalizeLooksFor({ note: long }, "sibling")?.note?.length, 60);
  });
  it("옛 값 옮기기 표", () => {
    assert.equal(migrateLookValue("mom", "hair", "짧은 머리"), "숏컷");
    assert.equal(migrateLookValue("mom", "hair", "묶은 머리"), "하나로 묶기");
    assert.equal(migrateLookValue("mom", "hair", "파마머리"), "굵은 웨이브 파마");
    assert.equal(migrateLookValue("dad", "hair", "아주 짧은 머리"), "반삭");
    assert.equal(migrateLookValue("grandpa", "hair", "아주 짧은 머리"), "아주 짧은 머리");
    assert.equal(migrateLookValue("mom", "color", "베이지"), "베이지");
  });
  it("안경 칩 — 예전 true 는 '안경 씀', 고르면 glasses 도 같이 맞춘다", () => {
    assert.equal(glassesChoice({ glasses: true }), "안경 씀");
    assert.equal(glassesChoice({ glasses: true, glassesType: "뿔테" }), "뿔테");
    assert.equal(glassesChoice({}), undefined);
    assert.deepEqual(glassesPatch("네모 안경"), { glasses: true, glassesType: "네모 안경" });
    assert.deepEqual(glassesPatch("안 써요"), { glasses: undefined, glassesType: "안 써요" });
    assert.deepEqual(glassesPatch(undefined), { glasses: undefined, glassesType: undefined });
  });
  it("스티커 — 성별판·어른 스티커는 준비 목록(READY_ICONS)에 있을 때만, 없으면 지금 스티커", () => {
    // 준비 목록은 파일이 들어올 때마다 늘어난다 — 목록 내용과 상관없이 규칙만 본다.
    const pick = (name: string, fallback: string) => `/icons/looks/${READY_ICONS.has(name) ? name : fallback}.webp`;
    assert.equal(lookIcon("곧은 생머리", "boy"), pick("hair-straight-boy", "hair-straight"));
    assert.equal(lookIcon("파마머리", "boy"), pick("hair-perm-boy", "hair-perm"));
    assert.equal(lookIcon("주근깨", "girl"), pick("mark-freckles-girl", "mark-freckles"));
    // 반대 성별·성별 모름은 늘 지금 스티커.
    assert.equal(lookIcon("곧은 생머리", "girl"), "/icons/looks/hair-straight.webp");
    assert.equal(lookIcon("곧은 생머리"), "/icons/looks/hair-straight.webp");
    assert.equal(lookIcon("주근깨", "boy"), "/icons/looks/mark-freckles.webp");
    assert.equal(lookIcon("숏컷", undefined, "mom"), READY_ICONS.has("mom-hair-short") ? "/icons/looks/mom-hair-short.webp" : undefined);
    assert.equal(lookIcon("모자"), "/icons/looks/item-hat.webp");
    // 어른 칩에는 아이 스티커를 붙이지 않는다(아빠 '곱슬머리' ≠ 아이 '곱슬머리').
    assert.equal(lookIcon("곱슬머리", undefined, "dad"), undefined);
    assert.equal(lookIcon("모자", undefined, "mom"), undefined);
    // 안경 종류는 준비 전엔 지금 안경 스티커로.
    assert.equal(lookIcon("뿔테", undefined, "dad"), READY_ICONS.has("glasses-horn") ? "/icons/looks/glasses-horn.webp" : GLASSES_ICON);
    assert.equal(lookIcon("안 써요", undefined, "dad"), undefined);
  });
});
