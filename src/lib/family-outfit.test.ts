import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import sharp from "sharp";
import { removeWhiteBackground } from "./cutout.ts";
import { CALL_NAMES, mergeFamily, normalizeFamily, siblingGender, type FamilyPortrait } from "./family.ts";
import {
  DEFAULT_KID_AGE,
  NECK_FIT_MAX,
  NECK_FIT_MIN,
  OUTFIT_BODIES_JSON,
  OUTFIT_BODY_EXTS,
  OUTFIT_BODY_ROLES,
  OUTFIT_ORIGINAL_PREVIEW,
  OUTFIT_THEME_IDS,
  OUTFIT_THEMES,
  SKIN_SHIFT_MAX,
  acceptOutfitSource,
  bodyChartWho,
  bodyImagePath,
  bodyKey,
  bodyOverlap,
  bodySolidDepth,
  bodyVersion,
  composeOutfit,
  dressPlan,
  findNeck,
  fitNeckWidth,
  isOutfitBodyRole,
  isOutfitTheme,
  matchBodySkin,
  matchNeckJoin,
  measureBody,
  mergeOutfits,
  neckFitRatio,
  newImage,
  normalizeBodyLibrary,
  normalizeBodyMeta,
  normalizeOutfit,
  normalizeOutfits,
  outfitBackground,
  outfitBodyRole,
  outfitFileStem,
  outfitOf,
  outfitTheme,
  parseOutfitRequest,
  placeBody,
  rateCheck,
  readOutfitTheme,
  scaleBodyMeta,
  skinLike,
  skinTarget,
  splitHead,
  trimToContent,
  withOutfit,
  wornMember,
  wornPortrait,
  type BodyLibrary,
  type BodyMeta,
  type MemberOutfit,
  type OutfitBodyRole,
  type RgbaImage,
} from "./family-outfit.ts";
import { OutfitError, composeWithBody, prepareHead, type OutfitImage } from "./family-outfit-image.ts";
import { STUDIO_BACKGROUNDS } from "./family-studio-catalog.ts";
import {
  EMPTY_STUDIO,
  isDefaultStudio,
  normalizeStudio,
  stampStudio,
  studioReducer,
  studioSheetFit,
  type FamilyStudio,
} from "./family-studio.ts";

const ROOT = new URL("../../", import.meta.url);
const FIXTURES = new URL("./__fixtures__/family-outfit/", import.meta.url);
const publicFile = (p: string) => new URL(`public${p}`, ROOT);

async function decode(buf: Buffer): Promise<RgbaImage> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** 예시 가족 그림(투명 webp) → RGBA */
async function example(who: "dad" | "mom" | "child"): Promise<{ buf: Buffer; img: RgbaImage }> {
  const buf = readFileSync(new URL(`public/family-example/${who}.webp`, ROOT));
  return { buf, img: await decode(buf) };
}

/**
 * 사장님 시안(2026-09-30, 힉스필드로 굽고 눈으로 확인)에서 손으로 맞춘 목 줄 — scratchpad headlock meta.json 의 3배 그림 값 ÷ 3.
 * 엄마는 긴 머리라 손으로 적어 넣은 값(prep-mom2).
 */
const HAND_NECK = { dad: 108.7, mom: 90.7, child: 154.3 } as const;
/** 예시 그림을 눈으로 잰 머리 비율(키 ÷ 머리) — 그리기 경로가 남기는 headRatio 대신 */
const RATIO = { dad: 3.85, mom: 4.9, child: 3.6 } as const;

const P = "https://cdn.example.com/app/family/abc/";
const portrait = (url = `${P}mom-1727000000000-${"a".repeat(32)}.png`): FamilyPortrait => ({
  url,
  ref: url.replace(".png", "-ref.jpg"),
  at: "2026-09-30T00:00:00.000Z",
  headRatio: 5.6,
  bodyStretch: 1.2,
});
const outfit = (
  from: string,
  at = "2026-09-30T01:00:00.000Z",
  url = `${P}mom-outfit-chuseok-1-${"b".repeat(32)}.webp`,
  v?: string,
): MemberOutfit => ({ url, at, from, ...(v ? { v } : {}) });

const META: BodyMeta = { w: 600, h: 1200, neckY: 1, neckLeft: 271, neckRight: 328, feetY: 1197, skin: [240, 208, 179] };

/* ─────────────────────────────── 테마·짝 배경 ─────────────────────────────── */

describe("테마 목록·짝 배경", () => {
  it("8개 — 몸 창고 폴더 이름과 같은 id, 겹치지 않는다, 미리보기 그림이 있다", () => {
    assert.deepEqual(OUTFIT_THEME_IDS, ["chuseok", "seollal", "picnic", "beach", "camping", "christmas", "pajama", "birthday"]);
    assert.equal(new Set(OUTFIT_THEME_IDS).size, 8);
    for (const t of OUTFIT_THEMES) {
      assert.match(t.label, /[가-힣]/);
      assert.ok(existsSync(publicFile(t.preview)), t.preview);
    }
    assert.ok(existsSync(publicFile(OUTFIT_ORIGINAL_PREVIEW)));
  });

  it("짝 배경 — 사장님이 정한 8쌍, 모두 사진관 목록에 있고 숨긴 배경이 아니다", () => {
    const want = {
      chuseok: "fam-chuseok-moon-yard",
      seollal: "fam-seollal-hanok-hall",
      picnic: "fam-cherry-park-day",
      beach: "fam-sandy-beach",
      camping: "fam-campsite",
      christmas: "fam-christmas-living-room",
      pajama: "fam-pajama-party-room",
      birthday: "fam-birthday-party",
    } as const;
    for (const id of OUTFIT_THEME_IDS) {
      assert.equal(outfitBackground(id), want[id]);
      const bg = STUDIO_BACKGROUNDS.find((b) => b.slug === want[id]);
      assert.ok(bg && !bg.hidden, want[id]);
    }
    assert.equal(outfitBackground("halloween"), undefined);
    assert.equal(outfitBackground(null), undefined);
  });

  it("isOutfitTheme·outfitTheme — 아는 테마만 · readOutfitTheme 은 예전 이름 'xmas' 를 'christmas' 로 읽는다", () => {
    assert.equal(isOutfitTheme("christmas"), true);
    assert.equal(isOutfitTheme("xmas"), false);
    assert.equal(readOutfitTheme("xmas"), "christmas");
    assert.equal(readOutfitTheme("beach"), "beach");
    assert.equal(readOutfitTheme("toString"), undefined);
    assert.equal(readOutfitTheme(7), undefined);
    assert.equal(isOutfitTheme(undefined), false);
    assert.equal(outfitTheme("beach")?.label, "여름 바닷가");
  });
});

/* ─────────────────────────────── 몸 종류 ─────────────────────────────── */

describe("몸 종류(outfitBodyRole)", () => {
  it("엄마·아빠·할머니·할아버지는 역할 그대로(성별·나이 칸과 상관없이)", () => {
    assert.equal(outfitBodyRole({ role: "dad" }), "dad");
    assert.equal(outfitBodyRole({ role: "mom" }), "mom");
    assert.equal(outfitBodyRole({ role: "grandpa", gender: "girl" }), "grandpa");
    assert.equal(outfitBodyRole({ role: "grandma", age: 5 }), "grandma");
  });

  it("아이(주인공) — 설정의 성별·나이: 3살까지 아기, 12살까지 아이, 13살부터 엄마·아빠 몸", () => {
    const kid = { role: "child" as const };
    assert.equal(outfitBodyRole(kid, { childGender: "boy", childAge: 2 }), "toddler-boy");
    assert.equal(outfitBodyRole(kid, { childGender: "girl", childAge: 3 }), "toddler-girl");
    assert.equal(outfitBodyRole(kid, { childGender: "boy", childAge: 4 }), "boy");
    assert.equal(outfitBodyRole(kid, { childGender: "girl", childAge: 12 }), "girl");
    assert.equal(outfitBodyRole(kid, { childGender: "girl", childAge: 13 }), "mom");
    assert.equal(outfitBodyRole(kid, { childGender: "boy", childAge: 16 }), "dad");
    // 나이를 모르면 5살(단체 사진 키 셈과 같다)
    assert.equal(DEFAULT_KID_AGE, 5);
    assert.equal(outfitBodyRole(kid, { childGender: "boy", childAge: null }), "boy");
    // 설정 성별이 '안 정함'이면 아이 칸의 성별, 그것도 없으면 고르지 않는다(평소 옷)
    assert.equal(outfitBodyRole({ role: "child", gender: "girl" }, { childGender: "unspecified", childAge: 6 }), "girl");
    assert.equal(outfitBodyRole(kid, { childGender: "unspecified", childAge: 6 }), null);
  });

  it("형제 — 성별 칸, 없으면 호칭(형·누나 …), 나이는 그 사람 나이 → 아이 나이 → 5살", () => {
    assert.equal(outfitBodyRole({ role: "sibling", callName: "누나", age: 9 }), "girl");
    assert.equal(outfitBodyRole({ role: "sibling", callName: "남동생", age: 2 }), "toddler-boy");
    assert.equal(outfitBodyRole({ role: "sibling", callName: "형" }, { childAge: 15 }), "dad");
    assert.equal(outfitBodyRole({ role: "sibling", callName: "형", gender: "girl", age: 8 }), "girl");
    assert.equal(outfitBodyRole({ role: "sibling", callName: "형제자매", age: 8 }), null);
  });

  it("친구 — 성별 칸만(모르면 평소 옷)", () => {
    assert.equal(outfitBodyRole({ role: "friend", gender: "boy", age: 7 }), "boy");
    assert.equal(outfitBodyRole({ role: "friend", age: 7 }), null);
  });

  it("호칭 성별 표가 lib/family siblingGender 와 같다(값을 부르지 않으려고 따로 둔 표)", () => {
    for (const call of CALL_NAMES.sibling ?? []) {
      const g = siblingGender(call);
      assert.equal(outfitBodyRole({ role: "sibling", callName: call, age: 8 }), g ?? null, call);
    }
  });

  it("isOutfitBodyRole·bodyChartWho — 여덟 가지, 아기는 2살·아이는 7살로 어림, 13~19살이 입는 어른 몸은 청소년 표", () => {
    assert.equal(OUTFIT_BODY_ROLES.length, 8);
    assert.equal(isOutfitBodyRole("toddler-girl"), true);
    assert.equal(isOutfitBodyRole("baby"), false);
    assert.deepEqual(bodyChartWho("toddler-boy"), { role: "child", age: 2 });
    assert.deepEqual(bodyChartWho("girl", 9), { role: "child", age: 9 });
    assert.deepEqual(bodyChartWho("dad"), { role: "dad" });
    assert.deepEqual(bodyChartWho("mom", 15), { role: "sibling", age: 15 });
    assert.deepEqual(bodyChartWho("grandma", 70), { role: "grandma" });
  });
});

/* ─────────────────────────────── 몸 창고 목록 ─────────────────────────────── */

describe("몸 창고 목록(bodies.json)", () => {
  it("normalizeBodyMeta — 정수로, 이상한 칸은 버린다", () => {
    assert.deepEqual(normalizeBodyMeta({ ...META, neckY: 1.4 }), META);
    assert.deepEqual(normalizeBodyMeta({ ...META, skin: undefined }), { ...META, skin: null });
    assert.deepEqual(normalizeBodyMeta({ ...META, skin: [1, 2] }), { ...META, skin: null });
    assert.equal(normalizeBodyMeta({ ...META, feetY: 1300 }), undefined);
    assert.equal(normalizeBodyMeta({ ...META, feetY: 10 }), undefined);
    assert.equal(normalizeBodyMeta({ ...META, neckLeft: 400, neckRight: 300 }), undefined);
    assert.equal(normalizeBodyMeta({ ...META, w: "600" }), undefined);
    assert.equal(normalizeBodyMeta([]), undefined);
    assert.equal(normalizeBodyMeta(null), undefined);
  });

  it("normalizeBodyLibrary — 아는 테마/몸 칸만", () => {
    const lib = normalizeBodyLibrary({
      "chuseok/dad": META,
      "chuseok/cat": META,
      "xmas/dad": META,
      "beach/mom": { ...META, feetY: -1 },
      toString: META,
    });
    assert.deepEqual(Object.keys(lib), ["chuseok/dad"]);
    assert.deepEqual(normalizeBodyLibrary("nope"), {});
    assert.equal(bodyKey("beach", "toddler-girl"), "beach/toddler-girl");
    assert.equal(bodyImagePath("beach", "toddler-girl"), "/family-outfits/bodies/beach/toddler-girl.webp");
    assert.equal(bodyImagePath("beach", "toddler-girl", "png"), "/family-outfits/bodies/beach/toddler-girl.png");
    assert.deepEqual(OUTFIT_BODY_EXTS, ["webp", "png"]);
    assert.equal(OUTFIT_BODIES_JSON, "/family-outfits/bodies/bodies.json");
  });

  it("bodyVersion — 칸 값이 바뀌면 달라진다 · scaleBodyMeta — 비율이 같을 때만 옮긴다", () => {
    assert.equal(bodyVersion(META), "600x1200-1-271-328-1197");
    assert.notEqual(bodyVersion({ ...META, neckY: 2 }), bodyVersion(META));
    assert.equal(scaleBodyMeta(META, 600, 1200), META);
    const half = scaleBodyMeta(META, 300, 600)!;
    assert.deepEqual([half.neckLeft, half.neckRight, half.feetY], [136, 164, 599]);
    assert.equal(scaleBodyMeta(META, 600, 900), undefined);
  });
});

/* ─────────────────────────────── 저장 모양 ─────────────────────────────── */

describe("저장 모양(member.outfits)", () => {
  it("normalizeOutfits — 모르는 테마·https 아닌 주소·from 없는 값·이상한 판은 버리고, 비면 undefined", () => {
    const from = portrait().url;
    const raw = {
      chuseok: outfit(from, undefined, undefined, "600x1200-1-271-328-1197"),
      halloween: outfit(from),
      xmas: outfit(from),
      christmas: { url: "http://x/y.png", at: "t", from },
      beach: { url: `${P}x.png`, at: "t" },
      pajama: "nope",
      picnic: { ...outfit(from), v: "../../etc" },
    };
    assert.deepEqual(normalizeOutfits(raw), {
      chuseok: outfit(from, undefined, undefined, "600x1200-1-271-328-1197"),
      picnic: outfit(from),
    });
    assert.equal(normalizeOutfits({ halloween: outfit(from) }), undefined);
    assert.equal(normalizeOutfits(null), undefined);
    assert.equal(normalizeOutfits([outfit(from)]), undefined);
    assert.deepEqual(normalizeOutfit({ url: `${P}a.webp`, from }), { url: `${P}a.webp`, at: "", from });
  });

  it("normalizeOutfits — 예전 이름 xmas 는 christmas 로(새 이름 값이 있으면 그것), 테마 순서대로", () => {
    const from = portrait().url;
    assert.deepEqual(normalizeOutfits({ xmas: outfit(from) }), { christmas: outfit(from) });
    const newer = outfit(from, "2026-09-30T09:00:00.000Z");
    assert.deepEqual(normalizeOutfits({ xmas: outfit(from), christmas: newer }), { christmas: newer });
    assert.deepEqual(Object.keys(normalizeOutfits({ birthday: outfit(from), chuseok: outfit(from) }) ?? {}), ["chuseok", "birthday"]);
  });

  it("normalizeOutfits(portraitUrl) — 지금 그림에서 만든 옷만(얼굴을 다시 고정하면 옛 옷은 버린다)", () => {
    const now = portrait().url;
    const old = `${P}mom-1720000000000-${"c".repeat(32)}.png`;
    assert.deepEqual(normalizeOutfits({ chuseok: outfit(now), christmas: outfit(old) }, now), { chuseok: outfit(now) });
  });

  it("mergeOutfits — 테마마다 더 새것, 지금 그림 것이 아니면 다른 쪽", () => {
    const now = portrait().url;
    const old = `${P}mom-1720000000000-${"c".repeat(32)}.png`;
    const a = { chuseok: outfit(now, "2026-09-30T01:00:00Z"), christmas: outfit(now, "2026-09-30T05:00:00Z") };
    const b = { chuseok: outfit(now, "2026-09-30T02:00:00Z"), christmas: outfit(old, "2026-09-30T09:00:00Z"), beach: outfit(now) };
    const m = mergeOutfits(a, b, now);
    assert.equal(m?.chuseok?.at, "2026-09-30T02:00:00Z");
    assert.equal(m?.christmas?.from, now);
    assert.ok(m?.beach);
    assert.equal(mergeOutfits(undefined, undefined), undefined);
  });

  it("outfitOf·wornPortrait·wornMember — 지금 그림에서 만든 옷이면 주소만 바꾸고(opaque 빼고) 머리 비율은 그대로", () => {
    const p = { ...portrait(), opaque: true };
    const o = outfit(p.url);
    const m = { id: "mom", portrait: p, outfits: { chuseok: o } };
    assert.equal(outfitOf(m, "chuseok"), o);
    assert.equal(outfitOf(m, "christmas"), undefined);
    assert.equal(outfitOf(m, null), undefined);
    const worn = wornPortrait(m, "chuseok")!;
    assert.equal(worn.url, o.url);
    assert.equal(worn.opaque, undefined);
    assert.equal(worn.headRatio, 5.6);
    assert.equal(worn.bodyStretch, 1.2);
    assert.equal(wornPortrait(m, "christmas"), p);
    assert.equal(wornPortrait(m, null), p);
    // 옷이 없으면 받은 값 그대로(===) — 단체 사진이 쓸데없이 새 값을 만들지 않게
    assert.equal(wornMember(m, "beach"), m);
    assert.equal(wornMember(m, "chuseok").portrait?.url, o.url);
    assert.equal(wornMember(m, "chuseok").id, "mom");
    // 다른 그림에서 만든 옷은 없는 것
    const stale = { portrait: portrait(`${P}mom-1729999999999-${"d".repeat(32)}.png`), outfits: { chuseok: o } };
    assert.equal(outfitOf(stale, "chuseok"), undefined);
    assert.equal(wornPortrait(stale, "chuseok"), stale.portrait);
  });

  it("withOutfit — 넣으면서 옛 그림 옷은 치운다. 다른 그림 옷은 넣지 않는다.", () => {
    const p = portrait();
    const old = outfit(`${P}mom-1720000000000-${"c".repeat(32)}.png`);
    const m = { id: "mom", portrait: p, outfits: { christmas: old } };
    const next = withOutfit(m, "chuseok", outfit(p.url));
    assert.deepEqual(Object.keys(next.outfits ?? {}), ["chuseok"]);
    assert.equal(next.id, "mom");
    assert.equal(withOutfit(m, "chuseok", old), m);
    const noPic: { id: string; portrait?: FamilyPortrait } = { id: "x" };
    assert.equal(withOutfit(noPic, "chuseok", outfit(p.url)), noPic); // 고정된 그림이 없으면 그대로
  });
});

describe("저장 — 가족 목록(lib/family)과 함께", () => {
  const url = `${P}mom-1727000000000-${"a".repeat(32)}.png`;
  const base = { id: "mom", role: "mom", callName: "엄마", portrait: portrait(url) };

  it("normalizeFamily — 옷 칸을 거르고(모르는 테마·옛 얼굴 옷·그림 없는 사람), 옛 저장값(옷 칸 없음)은 그대로", () => {
    const fam = normalizeFamily([
      { ...base, outfits: { chuseok: outfit(url), halloween: outfit(url), beach: outfit(`${P}mom-1-${"c".repeat(32)}.png`) } },
      { id: "dad", role: "dad", callName: "아빠", outfits: { chuseok: outfit(url) } },
      { id: "child", role: "child", callName: "하온" },
    ])!;
    assert.deepEqual(fam[0].outfits, { chuseok: outfit(url) });
    assert.equal("outfits" in fam[1], false);
    assert.equal("outfits" in fam[2], false);
    // 옷 칸이 없던 예전 값은 옷 칸 없이 똑같이 읽힌다
    const before = normalizeFamily([base])!;
    assert.equal("outfits" in before[0], false);
    assert.deepEqual(normalizeFamily(JSON.parse(JSON.stringify(before))), before);
  });

  it("mergeFamily — 두 기기의 옷을 테마마다 더 새것으로 모으고, 얼굴이 바뀐 쪽이 이기면 옛 옷은 뺀다", () => {
    const a = normalizeFamily([{ ...base, outfits: { chuseok: outfit(url, "2026-09-30T01:00:00Z") } }])!;
    const b = normalizeFamily([
      { ...base, outfits: { chuseok: outfit(url, "2026-09-30T03:00:00Z", `${P}new.webp`), beach: outfit(url) } },
    ])!;
    const m = mergeFamily({ family: a, familyAt: "2026-09-30T05:00:00Z" }, { family: b, familyAt: "2026-09-30T04:00:00Z" });
    assert.equal(m.family?.[0].outfits?.chuseok?.url, `${P}new.webp`);
    assert.ok(m.family?.[0].outfits?.beach);
    // 다른 기기에서 얼굴을 다시 고정(더 새 그림) — 옛 얼굴로 만든 옷은 남지 않는다
    const url2 = `${P}mom-1728000000000-${"e".repeat(32)}.png`;
    const refixed = normalizeFamily([{ ...base, portrait: { ...portrait(url2), at: "2026-09-30T09:00:00.000Z" }, picAt: "2026-09-30T09:00:00.000Z" }])!;
    const m2 = mergeFamily({ family: a, familyAt: "2026-09-30T05:00:00Z" }, { family: refixed, familyAt: "2026-09-30T01:00:00Z" });
    assert.equal(m2.family?.[0].portrait?.url, url2);
    assert.equal(m2.family?.[0].outfits, undefined);
    // 옷이 어느 쪽에도 없으면 칸도 없다(예전과 같은 모양)
    const plain = mergeFamily({ family: normalizeFamily([base]) }, { family: normalizeFamily([base]) });
    assert.equal("outfits" in (plain.family?.[0] ?? {}), false);
  });
});

/* ─────────────────────────────── 사진관 값(lib/family-studio)과 함께 ─────────────────────────────── */

describe("사진관 — 가족 옷 테마(FamilyStudio.outfit)", () => {
  it("테마를 고르면 짝 배경으로, 배경을 따로 바꿔도 옷은 그대로, '원래 옷으로'는 옷만 벗는다(배경 그대로)", () => {
    const s1 = studioReducer(EMPTY_STUDIO, { type: "outfit", theme: "chuseok" });
    assert.deepEqual(s1, { bg: "fam-chuseok-moon-yard", stickers: [], outfit: "chuseok" });
    const s2 = studioReducer(s1, { type: "bg", slug: "fam-campsite" });
    assert.equal(s2.outfit, "chuseok");
    assert.equal(s2.bg, "fam-campsite");
    const s3 = studioReducer(s2, { type: "outfit", theme: null });
    assert.deepEqual(s3, { bg: "fam-campsite", stickers: [] });
    // 바뀐 게 없으면 받은 값 그대로(===) — 저장하지 않는다
    assert.equal(studioReducer(s1, { type: "outfit", theme: "chuseok" }), s1);
    assert.equal(studioReducer(s3, { type: "outfit", theme: null }), s3);
    assert.equal(studioReducer(s1, { type: "outfit", theme: "halloween" as never }), s1);
    // 같은 테마를 다시 누르면 배경을 짝으로 되돌린다
    assert.equal(studioReducer(s2, { type: "outfit", theme: "chuseok" }).bg, "fam-chuseok-moon-yard");
    // 스티커는 그대로 따라간다
    const withSticker = studioReducer(studioReducer(EMPTY_STUDIO, { type: "add", icon: "heart" }), { type: "outfit", theme: "beach" });
    assert.equal(withSticker.stickers.length, 1);
  });

  it("normalizeStudio·stampStudio — 아는 테마만 남기고, 꾸민 때를 찍어도 옷은 그대로, 예전 값(옷 없음)은 예전 모양 그대로", () => {
    assert.deepEqual(normalizeStudio({ bg: null, stickers: [], outfit: "birthday" }), { bg: null, stickers: [], outfit: "birthday" });
    assert.deepEqual(normalizeStudio({ bg: null, stickers: [], outfit: "xmas" }), { bg: null, stickers: [], outfit: "christmas" });
    assert.deepEqual(normalizeStudio({ bg: null, stickers: [], outfit: "halloween" }), { bg: null, stickers: [] });
    assert.deepEqual(normalizeStudio({ bg: "fam-campsite", stickers: [] }), { bg: "fam-campsite", stickers: [] });
    const stamped = stampStudio({ bg: null, stickers: [], outfit: "pajama" }, new Date("2026-09-30T00:00:00Z"));
    assert.deepEqual(stamped, { bg: null, stickers: [], outfit: "pajama", at: "2026-09-30T00:00:00.000Z" });
    // 칸 순서가 늘 같다(저장값을 글자로 견준다)
    assert.equal(JSON.stringify(normalizeStudio(JSON.parse(JSON.stringify(stamped)))), JSON.stringify(stamped));
    assert.deepEqual(stampStudio({ bg: null, stickers: [] }, new Date("2026-09-30T00:00:00Z")), {
      bg: null,
      stickers: [],
      at: "2026-09-30T00:00:00.000Z",
    });
  });

  it("isDefaultStudio — 옷을 입었으면 기본이 아니다", () => {
    assert.equal(isDefaultStudio(EMPTY_STUDIO), true);
    assert.equal(isDefaultStudio({ bg: null, stickers: [], outfit: "beach" } as FamilyStudio), false);
  });

  it("studioSheetFit — '옷 갈아입기' 줄 높이만큼 세로 미리보기를 줄여 고르기 몫을 지킨다(넓은 화면은 그대로)", () => {
    assert.equal(studioSheetFit(390, 844, 52).height, studioSheetFit(390, 844).height);
    const small = studioSheetFit(375, 560).height;
    assert.ok(studioSheetFit(375, 560, 52).height <= small);
    assert.ok(studioSheetFit(375, 560, 52).height >= 140);
  });
});

/* ─────────────────────────────── 누구를 입히나 ─────────────────────────────── */

describe("dressPlan — 테마 하나의 형편", () => {
  const url = (id: string) => `${P}${id}-1727000000000-${"a".repeat(32)}.png`;
  const lib: BodyLibrary = { "chuseok/dad": META, "chuseok/mom": META, "chuseok/boy": META };
  const v = bodyVersion(META);
  const members = [
    { id: "dad", role: "dad" as const, portrait: portrait(url("dad")), outfits: { chuseok: outfit(url("dad"), undefined, undefined, v) } },
    { id: "mom", role: "mom" as const, portrait: portrait(url("mom")) },
    { id: "child", role: "child" as const, portrait: portrait(url("child")) },
    { id: "m-gma", role: "grandma" as const, portrait: portrait(url("m-gma")) },
    { id: "m-fr", role: "friend" as const, portrait: portrait(url("m-fr")) },
    { id: "m-new", role: "sibling" as const, callName: "형" },
  ];

  it("입음 · 새로 입힘 · 몸 없음(평소 옷) · 성별 모름(평소 옷) — 고정된 그림이 없는 사람은 빠진다", () => {
    const plan = dressPlan(members, "chuseok", lib, { childGender: "boy", childAge: 6 });
    assert.deepEqual(
      plan.map((p) => [p.member.id, p.status, p.body]),
      [
        ["dad", "ready", "dad"],
        ["mom", "dress", "mom"],
        ["child", "dress", "boy"],
        ["m-gma", "no-body", "grandma"],
        ["m-fr", "no-gender", null],
      ],
    );
  });

  it("몸 창고 판이 바뀌면 다시 입힌다 · 창고 목록을 못 읽었으면 서버에 물어본다 · 창고에서 빠진 몸도 전에 만든 옷은 입는다", () => {
    const newer: BodyLibrary = { ...lib, "chuseok/dad": { ...META, neckY: 2 } };
    assert.equal(dressPlan(members, "chuseok", newer)[0].status, "dress");
    assert.equal(dressPlan(members, "chuseok", null)[0].status, "ready");
    assert.equal(dressPlan(members, "chuseok", null)[3].status, "dress");
    assert.equal(dressPlan(members, "chuseok", { "chuseok/mom": META })[0].status, "ready");
    // 판을 모르던 옷(v 없음)은 창고 판이 있으면 다시 입힌다
    const noV = [{ ...members[0], outfits: { chuseok: outfit(url("dad")) } }];
    assert.equal(dressPlan(noV, "chuseok", lib)[0].status, "dress");
    // 다른 얼굴 그림에서 만든 옷은 없는 것
    const refixed = [{ ...members[0], portrait: portrait(url("dad").replace("1727", "1728")) }];
    assert.equal(dressPlan(refixed, "chuseok", lib)[0].status, "dress");
  });
});

/* ─────────────────────────────── 서버 요청 ─────────────────────────────── */

describe("서버 요청", () => {
  const ok = {
    memberId: "mom",
    theme: "chuseok",
    portraitUrl: `${P}mom-1727000000000-${"a".repeat(32)}.png`,
    body: "mom",
    headRatio: 5.61234,
    opaque: true,
    age: 34.4,
  };
  it("parseOutfitRequest — 맞는 본문", () => {
    const r = parseOutfitRequest(ok);
    assert.ok(typeof r !== "string");
    assert.equal(r.theme, "chuseok");
    assert.equal(r.body, "mom");
    assert.equal(r.headRatio, 5.61);
    assert.equal(r.opaque, true);
    assert.equal(r.age, 34);
    const bare = parseOutfitRequest({ ...ok, headRatio: 99, opaque: "yes", age: -1 });
    assert.ok(typeof bare !== "string");
    assert.deepEqual(Object.keys(bare).sort(), ["body", "memberId", "portraitUrl", "theme"]);
  });
  it("parseOutfitRequest — 잘못된 id·테마·몸·주소는 한국어 한 줄", () => {
    for (const bad of [
      { ...ok, memberId: "../x" },
      { ...ok, theme: "xmas" },
      { ...ok, body: "cat" },
      { ...ok, body: "toString" },
      { ...ok, portraitUrl: "http://x.png" },
      { ...ok, portraitUrl: undefined },
      null,
      [],
    ]) {
      const r = parseOutfitRequest(bad);
      assert.equal(typeof r, "string");
      assert.match(r as string, /[가-힣]/);
    }
  });
  it("acceptOutfitSource — 이 회원 폴더의 이 사람 가족 그림 PNG 만(옷 그림·남의 그림·다른 사람 그림은 아님)", () => {
    const hex = "a".repeat(32);
    assert.equal(acceptOutfitSource(`${P}mom-1727000000000-${hex}.png`, P, "mom"), true);
    assert.equal(acceptOutfitSource(`${P}m-1a2b3c-1727000000000-${hex}.png`, P, "m-1a2b3c"), true);
    assert.equal(acceptOutfitSource(`${P}mom-1727000000000-${hex}-ref.jpg`, P, "mom"), false);
    assert.equal(acceptOutfitSource(`${P}dad-1727000000000-${hex}.png`, P, "mom"), false);
    assert.equal(acceptOutfitSource(`${P}mom-outfit-chuseok-1727000000000-${hex}.png`, P, "mom"), false);
    assert.equal(acceptOutfitSource(`${P}mom-outfit-chuseok-1727000000000-${hex}.webp`, P, "mom"), false);
    assert.equal(acceptOutfitSource(`https://evil.example/app/family/abc/mom-1727000000000-${hex}.png`, P, "mom"), false);
    assert.equal(acceptOutfitSource(`${P}mom-1727000000000-${hex}.png`, null, "mom"), false);
  });
  it("outfitFileStem — 회원 폴더 · 사람 · 테마 · 시각 · 임의 글자", () => {
    assert.equal(
      outfitFileStem("abc", "mom", "christmas", 1727000000000, "f".repeat(32)),
      `family/abc/mom-outfit-christmas-1727000000000-${"f".repeat(32)}`,
    );
  });
  it("rateCheck — 1분 창 안의 수만 세고, 넘으면 가장 옛 요청이 창을 벗어날 때까지의 초", () => {
    let times: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = rateCheck(times, 1000 + i, 3, 60_000);
      assert.equal(r.ok, true);
      times = r.kept;
    }
    const full = rateCheck(times, 2000, 3, 60_000);
    assert.equal(full.ok, false);
    assert.equal(full.retryAfter, 59);
    assert.equal(rateCheck(times, 61_001, 3, 60_000).ok, true);
  });
  it("경로는 돈 드는 호출·토큰 셈·DB 표를 부르지 않는다(고객 한 명 0원)", () => {
    const src = readFileSync(new URL("../app/api/family/outfit/route.ts", import.meta.url), "utf8");
    assert.doesNotMatch(src, /gemini|openai|anthropic|higgsfield|generateImage/i);
    assert.doesNotMatch(src, /\.rpc\(|charge_family|token/i);
    assert.match(src, /export const maxDuration = 60;/);
    assert.match(src, /isDevUser\(caller\.username\)/);
  });
});

/* ─────────────────────────────── 그림 셈 — 만든 그림 ─────────────────────────────── */

/** 투명 바탕에 네모를 칠한다 */
function fill(img: RgbaImage, x0: number, y0: number, x1: number, y1: number, rgb: [number, number, number], a = 255) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * img.width + x) * 4;
      img.data[i] = rgb[0];
      img.data[i + 1] = rgb[1];
      img.data[i + 2] = rgb[2];
      img.data[i + 3] = a;
    }
  }
}
const at = (img: RgbaImage, x: number, y: number) => Array.from(img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));

describe("몸 맞추기·목 폭·살색·이음매(만든 그림)", () => {
  it("placeBody — 목 줄 → cut(겹침만큼 위), 발끝 → 원본 발끝, 목 가운데 맞추기", () => {
    const m: BodyMeta = { w: 600, h: 900, neckY: 50, neckLeft: 290, neckRight: 309, feetY: 850, skin: null };
    const p = placeBody({ cut: 100, bottom: 500, cx: 79.5 }, m)!;
    assert.equal(p.scale, 0.5);
    assert.equal(p.top, 100 - 25);
    assert.equal(p.left, 80 - 150);
    assert.deepEqual([p.width, p.height], [300, 450]);
    const q = placeBody({ cut: 100, bottom: 500, cx: 79.5 }, m, 8)!;
    assert.equal(q.scale, 408 / 800);
    // 몸 발끝 줄이 원본 발끝 줄에 온다
    assert.ok(Math.abs(q.top + m.feetY * q.scale - 500) <= 1);
    assert.equal(placeBody({ cut: 100, bottom: 90, cx: 0 }, m), null);
  });

  it("neckFitRatio — 원본 목 바깥 폭 ÷ 몸 목 폭, 끝 안으로", () => {
    const m: BodyMeta = { ...META, neckLeft: 100, neckRight: 139 };
    assert.equal(neckFitRatio({ outerLeft: 0, outerRight: 39 }, m, 1), 1);
    assert.equal(neckFitRatio({ outerLeft: 0, outerRight: 199 }, m, 1), NECK_FIT_MAX);
    assert.equal(neckFitRatio({ outerLeft: 0, outerRight: 9 }, m, 1), NECK_FIT_MIN);
  });

  it("fitNeckWidth — cut 줄에서 목 폭을 k0 배로, 어깨 줄(to)부터 아래는 그대로", () => {
    const body = newImage(100, 60);
    fill(body, 40, 0, 59, 59, [230, 190, 160]); // 목 20px
    fill(body, 10, 30, 89, 59, [60, 90, 160]); // 어깨·옷
    const before = new Uint8Array(body.data);
    const n = fitNeckWidth(body, { left: 0, top: 0, cut: 0, to: 30, cx: 50, k0: 1.4 });
    assert.ok(n > 20);
    const width = (y: number) => {
      let c = 0;
      for (let x = 0; x < 100; x++) if (body.data[(y * 100 + x) * 4 + 3] > 128) c++;
      return c;
    };
    assert.ok(Math.abs(width(0) - 28) <= 1, `row0 ${width(0)}`);
    assert.ok(width(20) < width(0) && width(20) >= 20);
    for (let i = 30 * 100 * 4; i < before.length; i++) if (body.data[i] !== before[i]) assert.fail("rows below the band changed");
    assert.equal(fitNeckWidth(body, { left: 0, top: 0, cut: 0, to: 30, cx: 50, k0: 1.01 }), 0);
  });

  it("matchBodySkin — 목에 닿은 살·작은 살(손)만 옮기고, 살색 비슷한 큰 옷은 두고, 한 채널 cap 까지", () => {
    const body = newImage(200, 300);
    const skin: [number, number, number] = [240, 200, 170];
    fill(body, 90, 0, 109, 20, skin); // 목(목 띠에 닿음)
    fill(body, 20, 150, 29, 159, skin); // 손(작다)
    fill(body, 40, 60, 160, 290, [236, 204, 176]); // 살색 비슷한 큰 원피스
    fill(body, 170, 150, 179, 159, [40, 60, 150]); // 다른 색 소매
    const target: [number, number, number] = [170, 110, 70]; // 햇볕에 그을린 살
    const shift = matchBodySkin(body, { source: skin, target, neckRows: [0, 5] })!;
    assert.deepEqual(shift, [-SKIN_SHIFT_MAX, -SKIN_SHIFT_MAX, -SKIN_SHIFT_MAX]);
    assert.deepEqual(at(body, 100, 10), [180, 140, 110, 255]); // 목
    assert.deepEqual(at(body, 25, 155), [180, 140, 110, 255]); // 손
    assert.deepEqual(at(body, 100, 200), [236, 204, 176, 255]); // 큰 원피스는 그대로
    assert.deepEqual(at(body, 175, 155), [40, 60, 150, 255]); // 소매 그대로
    assert.equal(matchBodySkin(body, { source: skin, target: [241, 201, 171], neckRows: [0, 5] }), null);
  });

  it("skinLike — 살색 칩(밝은 편 ~ 햇볕에 그을림)은 살, 흰 옷·파란 옷·어두운 선은 아님", () => {
    for (const c of [[248, 220, 196], [234, 192, 154], [201, 142, 98], [168, 107, 67]] as const) assert.ok(skinLike([...c]), `${c}`);
    for (const c of [[60, 90, 160], [70, 55, 45], [40, 120, 60]] as const) assert.ok(!skinLike([...c]), `${c}`);
  });

  it("matchNeckJoin — 원본 목 끝줄과 몸 첫줄의 색 차이를 몸 목 위쪽에만 옅어지게, 몸 옷깃은 그대로", () => {
    const original = newImage(60, 40);
    fill(original, 20, 0, 39, 19, [200, 150, 120]); // 원본 목(끝줄이 조금 짙다)
    const body = newImage(60, 40);
    fill(body, 20, 0, 39, 39, [240, 200, 170]); // 몸 목
    fill(body, 20, 12, 39, 13, [250, 250, 250]); // 흰 옷깃 선
    const shift = matchNeckJoin(body, { left: 0, top: 0 }, original, { cut: 20, hair: null, skin: null }, { x0: 20, x1: 39, rows: 10 });
    assert.deepEqual(shift, [-40, -40, -40]);
    const top = at(body, 30, 20);
    const lower = at(body, 30, 28);
    assert.ok(top[0] < 225 && lower[0] > top[0] && lower[0] < 240, `${top} ${lower}`);
    assert.deepEqual(at(body, 30, 35), [240, 200, 170, 255]); // rows 밖
    assert.deepEqual(at(body, 30, 12), [250, 250, 250, 255]); // cut 위(몸) — 건드리지 않음
  });

  it("composeOutfit — cut 위는 머리 층 그대로, 몸은 cut ~ 발끝 + 2 줄에만", () => {
    const head = newImage(50, 100);
    fill(head, 10, 0, 40, 39, [10, 20, 30]); // 머리
    const body = newImage(60, 120);
    fill(body, 0, 0, 59, 119, [200, 100, 50]); // 몸(목 위·발 아래까지 그렸다 치고)
    const { image, ox, oy } = composeOutfit({ head, body, left: -5, top: 20, cut: 40, bottom: 99 });
    const px = (x: number, y: number) => at(image, x + ox, y + oy);
    assert.deepEqual(px(20, 30), [10, 20, 30, 255]); // 머리 층
    assert.deepEqual(px(45, 30), [0, 0, 0, 0]); // cut 위 몸은 지웠다
    assert.deepEqual(px(20, 60), [200, 100, 50, 255]); // cut 아래 몸
    assert.deepEqual(px(20, 101), [200, 100, 50, 255]); // 발끝 + 2 까지
    assert.deepEqual(px(20, 102), [0, 0, 0, 0]); // 그 아래는 잘랐다
  });

  it("trimToContent·measureBody — 그림 있는 곳만 · 머리 없는 몸 재기", () => {
    const img = newImage(20, 20);
    fill(img, 5, 6, 9, 12, [1, 2, 3]);
    const t = trimToContent(img)!;
    assert.deepEqual([t.x, t.y, t.image.width, t.image.height], [5, 6, 5, 7]);
    assert.equal(trimToContent(newImage(4, 4)), null);
    const body = newImage(200, 400);
    fill(body, 90, 50, 110, 70, [240, 210, 190]); // 목 토막
    fill(body, 40, 71, 160, 300, [80, 120, 200]);
    fill(body, 60, 301, 140, 380, [60, 60, 60]);
    const m = measureBody(body)!;
    assert.deepEqual([m.neckY, m.neckLeft, m.neckRight, m.feetY], [50, 90, 110, 380]);
    assert.deepEqual(m.skin, [240, 210, 190]);
  });

  it("bodySolidDepth·bodyOverlap — 목 윗가장자리가 반투명한 줄 수만큼 더 겹친다", () => {
    const body = newImage(100, 200);
    fill(body, 40, 10, 59, 190, [230, 190, 160]);
    fill(body, 40, 10, 59, 12, [230, 190, 160], 120); // 반투명 가장자리 3줄
    const meta = measureBody(body)!;
    assert.equal(meta.neckY, 13); // 알파 128 이하 줄은 그림으로 치지 않는다
    const depth = bodySolidDepth(body, { ...meta, neckY: 10 });
    assert.equal(depth, 3);
    assert.equal(bodyOverlap(500, depth, 1.75), 7); // (3 + 1) × 1.75 = 7 > 기본 6(머리 500 × 0.012)
    assert.equal(bodyOverlap(500, 0, 1), 6);
    assert.equal(bodyOverlap(100, 40, 3), 8); // 머리 높이의 8% 까지
  });
});

/* ─────────────────────────────── 그림 셈 — 예시 가족 ─────────────────────────────── */

describe("목 줄 찾기 — 예시 가족(public/family-example)", () => {
  for (const who of ["dad", "mom", "child"] as const) {
    it(`${who} — 잰 비율이 있어도 없어도 시안에서 손으로 맞춘 목 줄 ±6px 안, 바깥 폭은 살 폭을 품는다`, async () => {
      const { img } = await example(who);
      for (const headRatio of [RATIO[who], undefined]) {
        const n = findNeck(img, { headRatio, fallbackRatio: who === "child" ? 4.4 : 5.6 })!;
        assert.ok(n, `${who} ${headRatio}`);
        assert.ok(Math.abs(n.cut - HAND_NECK[who]) <= 6, `${who} ${headRatio ?? "-"} cut ${n.cut}`);
        assert.ok(n.neckRight - n.neckLeft >= 15, `${who} neck width`);
        assert.ok(n.outerLeft <= n.neckLeft && n.outerRight >= n.neckRight);
        assert.ok(n.outerRight - n.outerLeft <= 1.6 * (n.neckRight - n.neckLeft + 1));
      }
    });
  }

  it("엄마는 긴 머리(가운데 줄기로 찾음), 아빠·아이는 짧은 머리(바깥 윤곽으로 찾음)", async () => {
    const mom = findNeck((await example("mom")).img, { headRatio: RATIO.mom })!;
    const dad = findNeck((await example("dad")).img, { headRatio: RATIO.dad })!;
    const child = findNeck((await example("child")).img, { headRatio: RATIO.child })!;
    assert.equal(mom.longHair, true);
    assert.equal(mom.method, "run");
    assert.equal(dad.longHair, false);
    assert.equal(dad.method, "span");
    assert.equal(child.method, "span");
    assert.equal(dad.agree, true);
    assert.equal(child.agree, true);
  });

  it("skinTarget — 얼굴·목 살색(살색 같을 때만)", async () => {
    const { img } = await example("dad");
    const n = findNeck(img, { headRatio: RATIO.dad })!;
    const t = skinTarget(img, n)!;
    assert.ok(t && skinLike(t));
  });
});

/** 이 줄 구간에서 알파가 있는 픽셀 수 */
function solid(img: RgbaImage, y0: number, y1: number, x0 = 0, x1 = img.width - 1): number {
  let n = 0;
  for (let y = Math.max(0, y0); y <= Math.min(img.height - 1, y1); y++) {
    for (let x = x0; x <= x1; x++) if (img.data[(y * img.width + x) * 4 + 3] > 0) n++;
  }
  return n;
}

describe("머리 떼기 — 예시 가족", () => {
  it("엄마 — 어깨로 내려온 머리카락은 머리 층으로(시안 prep-mom2 를 손 없이)", async () => {
    const { img } = await example("mom");
    const n = findNeck(img, { headRatio: RATIO.mom })!;
    const sp = splitHead(img, n);
    assert.equal(sp.longHair, true);
    assert.ok(sp.hairBottom >= 105 && sp.hairBottom <= 130, `hairBottom ${sp.hairBottom}`);
    const cx = Math.round(n.cx);
    assert.ok(solid(sp.head, n.cut + 3, sp.hairBottom, 0, cx - 15) > 60);
    assert.ok(solid(sp.head, n.cut + 3, sp.hairBottom, cx + 15, img.width - 1) > 60);
    // 목 가운데(목 살 폭 안)는 cut 아래에 머리 층이 없다 — 옛 옷·옛 목은 안 딸려 간다
    assert.equal(solid(sp.head, n.cut, img.height - 1, n.neckLeft + 3, n.neckRight - 3), 0);
  });

  for (const who of ["dad", "child"] as const) {
    it(`${who} — 짧은 머리: cut 아래 머리 층은 비었고, cut 위는 원본과 한 바이트도 다르지 않다`, async () => {
      const { img } = await example(who);
      const n = findNeck(img, { headRatio: RATIO[who] })!;
      const sp = splitHead(img, n);
      assert.equal(sp.longHair, false);
      assert.equal(sp.hairPixels, 0);
      assert.equal(solid(sp.head, n.cut, img.height - 1), 0);
      for (let i = 0; i < n.cut * img.width * 4; i++) {
        if (sp.head.data[i] !== img.data[i]) assert.fail(`head layer differs at byte ${i}`);
      }
    });
  }
});

/**
 * 원본의 cut 위(머리 층)와 합친 그림을 견준다 — 원본 픽셀이 있으면 RGBA 가 같아야 하고, 원본이 빈 곳은 비어 있어야 하고,
 * 원본 폭 바깥의 cut 위도 비어 있어야 한다(몸이 목 위로 올라오지 않았다). 다른 픽셀 수를 돌려준다.
 * off = 원본 (0,0)이 합친 그림에서 놓인 자리.
 */
function headDiff(img: RgbaImage, out: RgbaImage, offX: number, offY: number, cut: number): number {
  let diff = 0;
  for (let Y = 0; Y < Math.min(out.height, cut + offY); Y++) {
    for (let X = 0; X < out.width; X++) {
      const x = X - offX;
      const y = Y - offY;
      const ri = (Y * out.width + X) * 4;
      const inside = x >= 0 && y >= 0 && x < img.width && y < img.height;
      if (!inside) {
        if (out.data[ri + 3] !== 0) diff++;
        continue;
      }
      const oi = (y * img.width + x) * 4;
      if (img.data[oi + 3] === 0) {
        if (out.data[ri + 3] !== 0) diff++;
        continue;
      }
      for (let c = 0; c < 4; c++) if (out.data[ri + c] !== img.data[oi + c]) diff++;
    }
  }
  // 원본의 cut 위 픽셀이 합친 그림 밖으로 잘려 나가지 않았다
  for (let y = 0; y < cut; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] === 0) continue;
      const X = x + offX;
      const Y = y + offY;
      if (X < 0 || Y < 0 || X >= out.width || Y >= out.height) diff++;
    }
  }
  return diff;
}

/** 합친 결과가 지켜야 할 것 — 머리 층 그대로 · 목 위에 몸 없음 · 키 ±2px · 몸이 목 아래를 채움 */
async function assertOutfit(who: "dad" | "mom" | "child", img: RgbaImage, cut: number, r: OutfitImage, label: string) {
  const out = await decode(r.data);
  assert.equal(out.width, r.width);
  assert.equal(out.height, r.height);
  assert.equal(headDiff(img, out, r.offsetX, r.offsetY, cut), 0, `${label}: head layer changed or body above the neck`);
  assert.ok(Math.abs(r.height - img.height) <= 2, `${label}: height ${r.height} vs ${img.height}`);
  assert.ok(solid(out, cut + r.offsetY + 5, out.height - 1) > 0.5 * solid(img, cut + 5, img.height - 1), `${label}: body missing`);
  assert.ok(r.ext === "webp" && r.contentType === "image/webp");
  void who;
}

/** 1단계 힉스필드 몸(흰 바탕, 머리 없음) → 몸 창고 몸처럼(투명 PNG + 잰 칸) */
async function standInBody(file: string): Promise<{ png: Buffer; meta: BodyMeta }> {
  const cut = await removeWhiteBackground(readFileSync(new URL(file, FIXTURES)));
  const meta = measureBody(await decode(cut.png));
  assert.ok(meta, file);
  return { png: cut.png, meta };
}

describe("합치기 — 예시 가족 + 1단계 힉스필드 몸(몸 창고 대신)", () => {
  const cases = [
    ["dad", "model-dad-chuseok.webp"],
    ["mom", "model-mom-xmas.webp"],
    ["child", "model-child-beach.webp"],
  ] as const;

  for (const [who, file] of cases) {
    it(`${who} — 머리 층은 한 바이트도 안 바뀌고, 목 위로 몸이 없고, 키가 원본과 같다(±2px)`, async () => {
      const { buf, img } = await example(who);
      const prep = await prepareHead(buf, { headRatio: RATIO[who] });
      const { png, meta } = await standInBody(file);
      const r = await composeWithBody(prep, png, meta);
      await assertOutfit(who, img, prep.neck.cut, r, `${who}/${file}`);
      assert.ok(r.stats.overlap >= 2);
    });
  }

  it("몸 그림이 목 위에 무엇을 그려 왔어도(어두운 머리 덩어리) 합친 그림의 목 위는 원본 그대로", async () => {
    const { buf, img } = await example("dad");
    const prep = await prepareHead(buf, { headRatio: RATIO.dad });
    const { png, meta } = await standInBody("model-dad-chuseok.webp");
    const raw = await decode(png);
    const pad = 120;
    const tall = newImage(raw.width, raw.height + pad);
    tall.data.set(raw.data, pad * raw.width * 4);
    // 목 토막 위에 머리처럼 어두운 타원
    const cx = (meta.neckLeft + meta.neckRight) / 2;
    for (let y = 10; y < pad; y++) {
      for (let x = 0; x < raw.width; x++) {
        if (((x - cx) / 70) ** 2 + ((y - 65) / 55) ** 2 <= 1) {
          const i = (y * raw.width + x) * 4;
          tall.data.set([58, 42, 32, 255], i);
        }
      }
    }
    const withHead = await sharp(tall.data, { raw: { width: tall.width, height: tall.height, channels: 4 } }).png().toBuffer();
    const shifted: BodyMeta = { ...meta, h: meta.h + pad, neckY: meta.neckY + pad, feetY: meta.feetY + pad };
    const r = await composeWithBody(prep, withHead, shifted);
    await assertOutfit("dad", img, prep.neck.cut, r, "dad + drawn head");
  });

  it("흰 바탕 원본(opaque)은 먼저 바탕을 지우고 같은 목을 찾는다", async () => {
    const { buf } = await example("child");
    const white = await sharp(buf)
      .flatten({ background: "#ffffff" })
      .extend({ top: 20, bottom: 20, left: 20, right: 20, background: "#ffffff" })
      .png()
      .toBuffer();
    const prep = await prepareHead(white, { headRatio: RATIO.child, opaque: true });
    assert.equal(prep.cutoutSource, true);
    assert.ok(Math.abs(prep.neck.cut - HAND_NECK.child) <= 8, `cut ${prep.neck.cut}`);
  });

  it("몸만 팔레트로 줄여도(고를 수 있는 가벼운 판) 머리 층은 그대로", async () => {
    const { buf, img } = await example("mom");
    const prep = await prepareHead(buf, { headRatio: RATIO.mom });
    const { png, meta } = await standInBody("model-mom-xmas.webp");
    const r = await composeWithBody(prep, png, meta, { bodyColours: 128 });
    await assertOutfit("mom", img, prep.neck.cut, r, "mom palette body");
  });

  it("그림이 아닌 원본 · 망가진 몸 · 칸과 비율이 다른 몸은 OutfitError", async () => {
    await assert.rejects(prepareHead(Buffer.from("not an image")), (e: unknown) => e instanceof OutfitError && e.code === "source-read");
    const { buf } = await example("dad");
    const prep = await prepareHead(buf, { headRatio: RATIO.dad });
    const { png, meta } = await standInBody("model-dad-chuseok.webp");
    await assert.rejects(composeWithBody(prep, Buffer.from("nope"), meta), (e: unknown) => e instanceof OutfitError && e.code === "body-read");
    await assert.rejects(
      composeWithBody(prep, png, { ...meta, w: meta.w * 2 }),
      (e: unknown) => e instanceof OutfitError && e.code === "body-meta",
    );
    // 칸과 크기만 다르고 비율이 같으면 칸을 옮겨 쓴다
    const half = await sharp(png).resize(Math.round(meta.w / 2), Math.round(meta.h / 2), { fit: "fill" }).png().toBuffer();
    const r = await composeWithBody(prep, half, meta);
    assert.ok(r.width > 0);
  });
});

/* ─────────────────────────────── 합치기 — 진짜 몸 창고 ─────────────────────────────── */

/** 몸 종류 → 견줄 예시 가족(아이 몸은 아이 그림, 할아버지는 아빠 그림, 할머니는 엄마 그림에 입힌다) */
const EXAMPLE_FOR: Record<OutfitBodyRole, "dad" | "mom" | "child"> = {
  dad: "dad",
  mom: "mom",
  grandpa: "dad",
  grandma: "mom",
  boy: "child",
  girl: "child",
  "toddler-boy": "child",
  "toddler-girl": "child",
};

describe("합치기 — 진짜 몸 창고(public/family-outfits/bodies, 있는 몸만)", () => {
  const jsonFile = publicFile(OUTFIT_BODIES_JSON);
  let lib: BodyLibrary = {};
  try {
    lib = existsSync(jsonFile) ? normalizeBodyLibrary(JSON.parse(readFileSync(jsonFile, "utf8"))) : {};
  } catch {
    lib = {}; // 다른 작업이 쓰는 중이면 다음에
  }
  // 몸 그림은 WebP 가 먼저, 없으면 PNG(경로와 같은 순서)
  const fileOf = (theme: (typeof OUTFIT_THEME_IDS)[number], body: OutfitBodyRole) =>
    OUTFIT_BODY_EXTS.map((ext) => publicFile(bodyImagePath(theme, body, ext))).find((f) => existsSync(f));
  const entries = OUTFIT_THEME_IDS.flatMap((theme) =>
    OUTFIT_BODY_ROLES.map((body) => ({ theme, body, meta: lib[bodyKey(theme, body)], file: fileOf(theme, body) })),
  ).filter((e): e is typeof e & { file: URL } => Boolean(e.meta && e.file));

  it("창고 목록의 칸이 모두 그림 크기와 맞는다", { skip: entries.length === 0 ? "몸 창고가 아직 없다" : false }, async () => {
    for (const e of entries) {
      const m = await sharp(readFileSync(e.file)).metadata();
      assert.ok(scaleBodyMeta(e.meta!, m.width!, m.height!), `${e.theme}/${e.body} ${m.width}x${m.height}`);
    }
  });

  it(
    `있는 몸 모두(${entries.length}벌) — 머리 층 그대로 · 목 위에 몸 없음 · 키 ±2px`,
    { skip: entries.length === 0 ? "몸 창고가 아직 없다" : false },
    async () => {
      const load = async (who: "dad" | "mom" | "child") => {
        const ex = await example(who);
        return { img: ex.img, prep: await prepareHead(ex.buf, { headRatio: RATIO[who] }) };
      };
      const preps = { dad: await load("dad"), mom: await load("mom"), child: await load("child") };
      // 네 벌씩 나란히(sharp 는 스레드를 따로 쓴다)
      const queue = [...entries];
      const worker = async () => {
        for (let e = queue.shift(); e; e = queue.shift()) {
          const who = EXAMPLE_FOR[e.body];
          const { img, prep } = preps[who];
          const r = await composeWithBody(prep, readFileSync(e.file), e.meta!);
          await assertOutfit(who, img, prep.neck.cut, r, `${e.theme}/${e.body}`);
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
    },
  );

  it("WebP 가 없으면 PNG 로도 — 같은 몸이면 둘 다 머리 층 그대로", { skip: entries.length === 0 ? "몸 창고가 아직 없다" : false }, async () => {
    const png = publicFile(bodyImagePath("chuseok", "dad", "png"));
    const meta = lib[bodyKey("chuseok", "dad")];
    if (!existsSync(png) || !meta) return; // PNG 를 지운 뒤에는 WebP 만 본다(위 시험)
    const { buf, img } = await example("dad");
    const prep = await prepareHead(buf, { headRatio: RATIO.dad });
    const r = await composeWithBody(prep, readFileSync(png), meta);
    await assertOutfit("dad", img, prep.neck.cut, r, "chuseok/dad png");
  });

  it("창고에 없는 몸은 없는 것으로 — 그 사람은 평소 옷(dressPlan no-body)", () => {
    const partial: BodyLibrary = Object.fromEntries(Object.entries(lib).filter(([k]) => k !== "beach/grandma"));
    const gma = { id: "m-g", role: "grandma" as const, portrait: portrait(`${P}m-g-1727000000000-${"a".repeat(32)}.png`) };
    assert.equal(dressPlan([gma], "beach", partial)[0].status, "no-body");
    assert.equal(partial["beach/grandma"], undefined);
  });
});

/* ─────────────────────────────── 화면이 불러도 되는 파일 ─────────────────────────────── */

describe("화면이 불러도 되는 파일", () => {
  it("family-outfit.ts 는 sharp·fs 를 부르지 않고, family.ts 에서는 타입만 부른다(서로 물리지 않게)", () => {
    const src = readFileSync(new URL("./family-outfit.ts", import.meta.url), "utf8");
    assert.doesNotMatch(src, /from "sharp"|from "node:/);
    assert.match(src, /import type \{ FamilyMember, FamilyPortrait, FamilyRole \} from "\.\/family\.ts"/);
    assert.doesNotMatch(src, /^import \{[^}]*\} from "\.\/family\.ts"/m);
  });
});

