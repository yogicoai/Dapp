import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import {
  FAMILY_BG_BASE,
  OWN_STICKER_DIR,
  STICKER_GROUPS,
  STUDIO_BACKGROUNDS,
  STUDIO_BG_POSITION,
  STUDIO_GROUPS,
  STUDIO_STICKERS,
  STUDIO_TEXT_STICKERS,
  TEXT_STICKER_FONT,
  stickerSrc,
  studioThumb,
} from "./family-studio-catalog.ts";
import {
  EMPTY_STUDIO,
  LEGACY_SIZE_SCALE,
  SCALE_KEY_STEP,
  SCALE_MAX,
  SCALE_MIN,
  SCALE_STEP,
  SIDE_PINNED,
  STACK_LIST_MIN,
  STACK_PINNED,
  STICKER_BASE,
  STUDIO_MAX,
  STUDIO_SPOTS,
  TEXT_BASE,
  TEXT_CELL_MIN,
  TEXT_SCALE_MIN,
  TEXT_SPOTS,
  clampPos,
  clampScale,
  isDefaultStudio,
  isTextSticker,
  newerStudio,
  nextSpot,
  normalizeStudio,
  pinchScale,
  pointerDistance,
  scaleMinOf,
  sheetRoom,
  sidePreviewWidth,
  stampStudio,
  stickerPx,
  studioBackground,
  studioGroupsInUse,
  studioReducer,
  studioSheetFit,
  studioSticker,
  textPx,
  type FamilyStudio,
  type StudioAction,
  type StudioSticker,
} from "./family-studio.ts";
import { mergeRemoteChild, type ChildPrefs } from "./prefs.ts";

const publicFile = (p: string) => new URL(`../../public${p}`, import.meta.url);
/** 저장소 밖 준비물(scratch-art — .git/info/exclude). 없으면 그 견주기만 건너뛴다. */
const scratch = (p: string) => new URL(`../../scratch-art/${p}`, import.meta.url);

/** 여러 번 바꾸기 */
const run = (actions: StudioAction[], from: FamilyStudio = EMPTY_STUDIO) => actions.reduce(studioReducer, from);
/** 깊이 얼린 복사 — 받은 값을 고치면 던진다 */
function frozen(s: FamilyStudio): FamilyStudio {
  const c: FamilyStudio = { bg: s.bg, stickers: s.stickers.map((t) => Object.freeze({ ...t })) };
  Object.freeze(c.stickers);
  return Object.freeze(c);
}
const at = (x: number, y: number, icon = "heart", scale = 1): StudioSticker => ({ icon, x, y, scale });

/** 사장님 스티커 29장(scratch-art/stickers-v1) + 힉스필드 21장·34장(09-30, stickers-v2·v3) */
const OWN = [
  "sunflower", "speech-bubble", "teddy-bear", "heart-balloon", "kitten", "snowman", "maple-leaves", "moon", "rainbow",
  "sparkles", "chick", "cloud", "garland", "snowflake", "camera", "crown", "cake", "butterfly", "bouquet", "paper-plane",
  "party-hat", "balloons", "cherry-petals", "ladybug", "hot-air-balloon", "penguin", "sun", "bow", "confetti",
  "double-hearts", "flower-crown", "trophy", "gold-medal", "fireworks", "photo-frame", "picnic-basket", "sandcastle",
  "watermelon", "ice-cream", "four-leaf-clover", "rainbow-umbrella", "christmas-tree", "santa-hat", "christmas-stocking",
  "songpyeon", "pumpkin-lantern", "dinosaur-egg", "toy-train", "soap-bubbles", "star-wand",
  "bunny-ears-headband", "cat-ears-headband", "pirate-hat", "wizard-hat", "princess-tiara", "flower-hairpin", "star-sunglasses", "heart-sunglasses", "bow-tie", "paper-crown", "tiger-hat", "chef-hat", "lucky-pouch", "korean-kite", "tteokguk", "yut-sticks", "hanbok", "taegeuk-fan", "carnation", "gift-box", "crayons", "building-blocks", "robot-toy", "unicorn", "baby-dinosaur", "space-rocket", "school-backpack", "baby-footprints", "baby-tooth", "doggy", "rabbit", "squirrel", "panda", "baby-whale",
];
/** 예전 아이콘 스티커 24개 — 이미 붙인 사람이 있어 지우면 안 된다 */
const LEGACY_CHIPS = [
  "heart", "star", "gift", "magic", "princess", "rocket", "sleep", "sprout", "bunny", "puppy", "fox", "dinosaur", "whale",
  "zoo", "daycare", "outing", "forest", "home", "playground", "map", "write", "joyful", "excited", "relieved",
];

describe("가족 사진관 목록 — 배경", () => {
  it("움직이는 배경 13곳은 고르기 목록의 전용 배경이고 영상 파일이 있다(mp4)", () => {
    const moving = STUDIO_BACKGROUNDS.filter((b) => b.video);
    assert.equal(moving.length, 13);
    for (const b of moving) {
      assert.ok(b.slug.startsWith("fam-") && !b.hidden, b.slug);
      assert.equal(b.video, `/family-studio/bg-video/${b.slug}.mp4`);
      const head = fs.readFileSync(publicFile(b.video!)).subarray(4, 8).toString("latin1");
      assert.equal(head, "ftyp", b.slug);
    }
  });

  const visible = STUDIO_BACKGROUNDS.filter((b) => !b.hidden);
  const hidden = STUDIO_BACKGROUNDS.filter((b) => b.hidden);

  it("고르기 목록은 가족사진 전용 28장(fam-… 사장님 25 + 테마 3), 예전 22곳은 숨김으로 남는다, slug 가 겹치지 않는다", () => {
    assert.equal(visible.length, 28);
    assert.equal(hidden.length, 22);
    for (const b of visible) assert.ok(b.slug.startsWith("fam-"), b.slug);
    for (const b of hidden) assert.ok(!b.slug.startsWith("fam-"), b.slug);
    const slugs = STUDIO_BACKGROUNDS.map((b) => b.slug);
    assert.equal(new Set(slugs).size, slugs.length);
  });

  it("전용 배경 주소는 cafe24 family-bg/<slug>.webp?v=<md5 앞 8자>", () => {
    for (const b of visible) {
      assert.match(b.src, /^https:\/\/yogibo\.openhost\.cafe24\.com\/app\/img\/dapp\/family-bg\/fam-[a-z0-9-]+\.webp\?v=[0-9a-f]{8}$/, b.slug);
      assert.equal(b.src.split("?")[0], `${FAMILY_BG_BASE}${b.slug}.webp`, b.slug);
    }
  });

  it("사장님 목록(scratch-art/가족사진배경목록.json)과 slug·주소·무리·이름이 같다", (t) => {
    const file = scratch("가족사진배경목록.json");
    if (!fs.existsSync(file)) return t.skip("scratch-art 목록 없음(저장소 밖)");
    const list = JSON.parse(fs.readFileSync(file, "utf8")) as { slug: string; ko: string; group: string; url: string; md5: string }[];
    assert.deepEqual(visible.map((b) => b.slug).sort(), list.map((b) => b.slug).sort());
    const groupLabel = new Map(STUDIO_GROUPS.map((g) => [g.id, g.label]));
    for (const src of list) {
      const b = studioBackground(src.slug);
      assert.ok(b, src.slug);
      assert.equal(b.src, src.url, src.slug);
      assert.ok(src.url.endsWith(`?v=${src.md5.slice(0, 8)}`), src.slug);
      assert.equal(groupLabel.get(b.group), src.group, src.slug);
      // 이름은 괄호만 뺀다('벚꽃 공원 (낮)' → '벚꽃 공원 낮')
      assert.equal(b.label, src.ko.replace(/[()]/g, "").replace(/\s+/g, " ").trim(), src.slug);
    }
  });

  it("숨긴 22곳은 주소가 배경 창고(backgrounds.json)와 같다 — 이미 고른 사람의 사진이 그대로", () => {
    const lib = JSON.parse(fs.readFileSync(new URL("../data/backgrounds.json", import.meta.url), "utf8")) as {
      slug: string;
      url: string;
    }[];
    const bySlug = new Map(lib.map((b) => [b.slug, b.url]));
    for (const b of hidden) assert.equal(bySlug.get(b.slug), b.src, b.slug);
  });

  it("무리는 모두 아는 무리, 여섯 무리 모두 전용 배경이 있어 고르기 화면에 순서대로 선다", () => {
    const ids = STUDIO_GROUPS.map((g) => g.id);
    for (const b of STUDIO_BACKGROUNDS) assert.ok(ids.includes(b.group), b.slug);
    const shown = studioGroupsInUse();
    assert.deepEqual(
      shown.map((g) => g.id),
      ["home", "town", "outing", "season", "special", "fantasy"],
    );
    // 고르기 화면에는 숨긴 배경이 없다
    assert.equal(shown.reduce((n, g) => n + g.items.length, 0), 28);
    for (const g of shown) for (const b of g.items) assert.ok(!b.hidden, b.slug);
  });

  it("작은 그림이 public 에 다 있다(숨긴 것 포함 — 고른 사람의 칸)", () => {
    for (const b of STUDIO_BACKGROUNDS) {
      assert.ok(fs.existsSync(publicFile(studioThumb(b.slug))), `없음: ${studioThumb(b.slug)}`);
    }
  });

  it("칸 이름은 1~9자", () => {
    for (const b of STUDIO_BACKGROUNDS) {
      assert.ok(b.label.length >= 1 && b.label.length <= 9, `${b.slug}: '${b.label}'`);
    }
  });

  it("고른 배경은 가운데·70% 로 자른다(나라 배경은 예전처럼 맨 아래 — 컴포넌트가 가른다)", () => {
    assert.equal(STUDIO_BG_POSITION, "50% 70%");
  });
});

describe("가족 사진관 목록 — 그림 스티커", () => {
  const BANNED = [
    "angry", "scolded", "hospital", "potty", "sad", "scared", "upset", "worried", "lonely", "jealous", "hurt",
    "mom", "dad", "mom-dad", "baby-brother", "baby-sister", "grandma", "grandpa", "friend", "teacher", "prince",
    "toothbrush", "meal", "mart",
  ];

  it("사장님 스티커 84장이 먼저(축하·꾸미기·사랑·날씨·계절·특별한 날·동물·소품), 예전 아이콘 24개는 그 뒤 '동화 아이콘'", () => {
    assert.equal(STUDIO_STICKERS.length, OWN.length + LEGACY_CHIPS.length);
    const own = STUDIO_STICKERS.slice(0, OWN.length);
    assert.deepEqual(own.map((s) => s.icon).sort(), [...OWN].sort());
    for (const s of own) {
      assert.notEqual(s.group, "icons", s.icon);
      assert.equal(s.src, `${OWN_STICKER_DIR}${s.icon}.webp`);
    }
    const chips = STUDIO_STICKERS.slice(OWN.length);
    assert.deepEqual(chips.map((s) => s.icon), LEGACY_CHIPS);
    for (const s of chips) {
      assert.equal(s.group, "icons", s.icon);
      assert.equal(s.src, `/icons/chips/${s.icon}.webp`);
    }
  });

  it("무리는 STICKER_GROUPS 순서대로 이어져 있고 빈 무리가 없다", () => {
    const order = STICKER_GROUPS.map((g) => g.id);
    const seen = STUDIO_STICKERS.map((s) => s.group).filter((g, i, a) => i === 0 || a[i - 1] !== g);
    assert.deepEqual(seen, order);
  });

  it("아이콘이 겹치지 않고, 그림 파일이 있고(webp), 이름이 있다", () => {
    const icons = STUDIO_STICKERS.map((s) => s.icon);
    assert.equal(new Set(icons).size, icons.length);
    for (const s of STUDIO_STICKERS) {
      const src = stickerSrc(s.icon);
      assert.ok(src, s.icon);
      const file = publicFile(src);
      assert.ok(fs.existsSync(file), `없음: ${src}`);
      const head = fs.readFileSync(file).subarray(0, 12);
      assert.equal(head.subarray(0, 4).toString("latin1"), "RIFF", src);
      assert.equal(head.subarray(8, 12).toString("latin1"), "WEBP", src);
      assert.ok(s.label.length > 0, s.icon);
    }
  });

  it("사장님 스티커는 준비물(scratch-art/stickers-v1·v2·v3)과 같은 파일이다", (t) => {
    const dir = scratch("stickers-v1/");
    if (!fs.existsSync(dir)) return t.skip("scratch-art 스티커 없음(저장소 밖)");
    const dir2 = scratch("stickers-v2/");
    const dir3 = scratch("stickers-v3/");
    for (const icon of OWN) {
      const v1 = new URL(`${icon}.webp`, dir);
      const v2 = new URL(`${icon}.webp`, dir2);
      const a = fs.readFileSync(fs.existsSync(v1) ? v1 : fs.existsSync(v2) ? v2 : new URL(`${icon}.webp`, dir3));
      const b = fs.readFileSync(publicFile(`${OWN_STICKER_DIR}${icon}.webp`));
      assert.ok(a.equals(b), icon);
    }
  });

  it("사람·나쁜 기분·어색한 물건은 없다", () => {
    for (const s of STUDIO_STICKERS) assert.ok(!BANNED.includes(s.icon), s.icon);
  });

  it("모르는 아이콘은 주소가 없다", () => {
    assert.equal(stickerSrc("angry"), undefined);
    assert.equal(stickerSrc("txt-love"), undefined); // 글자 스티커는 그림이 아니다
  });
});

describe("가족 사진관 목록 — 글자 스티커", () => {
  /** 상대 밝기(WCAG) */
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const onWhite = (hex: string) => 1.05 / (lum(hex) + 0.05);

  it("문구 12개 — 사장님이 정한 문구 그대로, id 는 txt-… 로 겹치지 않고 그림 아이콘과도 안 겹친다", () => {
    assert.deepEqual(
      STUDIO_TEXT_STICKERS.map((t) => t.text),
      ["우리 가족", "사랑해", "행복해", "최고야", "고마워", "함께라서 좋아", "생일 축하해", "메리 크리스마스", "소풍 가는 날", "오늘도 반짝", "우리 집 최고", "꿈나라 가자"],
    );
    const ids = STUDIO_TEXT_STICKERS.map((t) => t.icon);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) {
      assert.match(id, /^txt-[a-z]+$/);
      assert.ok(!STUDIO_STICKERS.some((s) => s.icon === id), id);
    }
  });

  it("문구는 한글·띄어쓰기만, 1~8자(한 줄), 앞뒤·겹 띄어쓰기 없음, 화면 읽기 이름 = 문구", () => {
    for (const t of STUDIO_TEXT_STICKERS) {
      assert.equal(t.kind, "text");
      assert.match(t.text, /^[가-힣]+( [가-힣]+)*$/, t.text);
      assert.ok(t.text.length >= 1 && t.text.length <= 8, t.text);
      assert.equal(t.label, t.text);
    }
  });

  it("글자색은 #rrggbb 파스텔 — 흰 테두리 위에서 읽히고(대비 2.2 이상) 너무 어둡지 않다(4.5 미만)", () => {
    for (const t of STUDIO_TEXT_STICKERS) {
      assert.match(t.fill, /^#[0-9a-f]{6}$/, t.icon);
      const c = onWhite(t.fill);
      assert.ok(c >= 2.2 && c < 4.5, `${t.icon} ${t.fill}: ${c.toFixed(2)}`);
    }
  });

  it("글꼴은 레이아웃이 싣는 주아(next/font/google, --font-jua)", () => {
    assert.ok(TEXT_STICKER_FONT.startsWith("var(--font-jua)"), TEXT_STICKER_FONT);
    const layout = fs.readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
    assert.match(layout, /import \{[^}]*\bJua\b[^}]*\} from "next\/font\/google"/);
    assert.match(layout, /Jua\(\{[^)]*variable: "--font-jua"/);
    assert.match(layout, /\$\{jua\.variable\}/);
  });

  it("studioSticker·isTextSticker — 그림·글자 둘 다 찾는다", () => {
    assert.equal(studioSticker("txt-love")?.kind, "text");
    assert.equal(studioSticker("balloons")?.kind, "image");
    assert.equal(studioSticker("heart")?.kind, "image");
    assert.equal(studioSticker("txt-nope"), undefined);
    assert.ok(isTextSticker("txt-family"));
    assert.ok(!isTextSticker("crown"));
    assert.ok(!isTextSticker("모르는 것"));
  });
});

describe("크기 — 배율(scale)·예전 크기 옮기기·범위", () => {
  it("밀대 범위는 예전 '보통'의 0.35~2.2배, 한 칸 0.05, 키보드 0.1", () => {
    assert.equal(SCALE_MIN, 0.35);
    assert.equal(SCALE_MAX, 2.2);
    assert.equal(SCALE_STEP, 0.05);
    assert.equal(SCALE_KEY_STEP, 0.1);
    // 밀대 끝이 한 칸 단위로 맞는다
    assert.equal(Math.round((SCALE_MAX - SCALE_MIN) / SCALE_STEP) * SCALE_STEP + SCALE_MIN, SCALE_MAX);
  });

  it("clampScale — 범위 안으로, 0.01 단위, 숫자가 아니면 1", () => {
    assert.equal(clampScale(1), 1);
    assert.equal(clampScale(0.1), SCALE_MIN);
    assert.equal(clampScale(-3), SCALE_MIN);
    assert.equal(clampScale(9), SCALE_MAX);
    assert.equal(clampScale(1.234), 1.23);
    assert.equal(clampScale(1.235001), 1.24);
    assert.equal(clampScale(Number.NaN), 1);
    assert.equal(clampScale(Number.POSITIVE_INFINITY), 1);
    // @ts-expect-error — 저장값이 글자여도 1
    assert.equal(clampScale("2"), 1);
  });

  it("예전 작게·보통·크게를 옮겨도 같은 크기다(한 변이 높이의 0.2·0.28·0.38 — 1px 안)", () => {
    const old = { s: 0.2, m: 0.28, l: 0.38 } as const;
    for (const h of [140, 186, 200, 224, 240]) {
      for (const k of ["s", "m", "l"] as const) {
        const now = stickerPx(LEGACY_SIZE_SCALE[k], h);
        assert.ok(Math.abs(now - old[k] * h) <= 1, `${k}@${h}: ${now} vs ${old[k] * h}`);
      }
    }
    assert.ok(LEGACY_SIZE_SCALE.s < LEGACY_SIZE_SCALE.m && LEGACY_SIZE_SCALE.m < LEGACY_SIZE_SCALE.l);
    for (const v of Object.values(LEGACY_SIZE_SCALE)) assert.equal(clampScale(v), v);
  });

  it("그림 한 변·글자 크기는 사진 높이 × 기준 × 배율", () => {
    assert.equal(STICKER_BASE, 0.28);
    assert.equal(stickerPx(1, 200), 56);
    assert.equal(stickerPx(SCALE_MIN, 200), 20);
    assert.equal(stickerPx(SCALE_MAX, 200), 123);
    assert.equal(stickerPx(99, 200), 123); // 범위 밖은 끝으로
    assert.equal(TEXT_BASE, 0.1);
    assert.equal(textPx(1, 200), 20);
    assert.equal(textPx(1, 240), 24);
    assert.equal(textPx(1.37, 200), 27.5); // 0.5px 단위
    // 글자는 TEXT_SCALE_MIN 아래로 안 줄어든다 — 0.35 여도 12px(7px 이면 한글이 안 읽힌다)
    assert.equal(textPx(0.35, 200), 12);
    assert.equal(textPx(TEXT_SCALE_MIN, 186), 11); // 모아 보기 액자
  });

  it("글자 스티커는 아래 끝이 따로(0.6) — 그림은 0.35 그대로, 위 끝은 같다", () => {
    assert.equal(TEXT_SCALE_MIN, 0.6);
    assert.equal(scaleMinOf("image"), SCALE_MIN);
    assert.equal(scaleMinOf("text"), TEXT_SCALE_MIN);
    assert.equal(clampScale(0.35), 0.35);
    assert.equal(clampScale(0.35, "text"), TEXT_SCALE_MIN);
    assert.equal(clampScale(0.61, "text"), 0.61);
    assert.equal(clampScale(9, "text"), SCALE_MAX);
    assert.equal(clampScale(Number.NaN, "text"), 1);
    // 글자 밀대 끝도 한 칸 단위로 맞는다
    assert.equal(Math.round(Math.round((SCALE_MAX - TEXT_SCALE_MIN) / SCALE_STEP) * SCALE_STEP * 100 + TEXT_SCALE_MIN * 100) / 100, SCALE_MAX);
    // 가장 작게 해도 200px 사진에서 글자 12px 이상
    assert.ok(textPx(TEXT_SCALE_MIN, 200) >= 12);
  });

  it("크기 바꾸기·두 손가락·불러오기 모두 글자는 TEXT_SCALE_MIN 까지만", () => {
    const s = run([
      { type: "add", icon: "heart" },
      { type: "add", icon: "txt-family" },
    ]);
    const small = studioReducer(studioReducer(s, { type: "scale", index: 0, scale: 0 }), { type: "scale", index: 1, scale: 0 });
    assert.deepEqual(small.stickers.map((t) => t.scale), [SCALE_MIN, TEXT_SCALE_MIN]);
    // 끝에서 더 줄이면(키보드 -) 그대로(저장 안 함)
    assert.equal(studioReducer(small, { type: "scale", index: 1, scale: TEXT_SCALE_MIN - SCALE_KEY_STEP }), small);
    assert.equal(pinchScale(1, 100, 10, "text"), TEXT_SCALE_MIN);
    assert.equal(pinchScale(1, 100, 10), SCALE_MIN);
    assert.equal(pinchScale(0.4, 0, 80, "text"), TEXT_SCALE_MIN); // 처음 배율도
    const loaded = normalizeStudio({
      stickers: [
        { icon: "txt-love", x: 0.5, y: 0.1, scale: 0.35 },
        { icon: "txt-happy", x: 0.5, y: 0.8, scale: 0.59 },
        { icon: "star", x: 0.1, y: 0.2, scale: 0.35 },
      ],
    });
    assert.deepEqual(loaded?.stickers.map((t) => t.scale), [TEXT_SCALE_MIN, TEXT_SCALE_MIN, SCALE_MIN]);
  });

  it("normalizeStudio — 예전 size 는 배율로, 숫자 scale 이 먼저, 이상한 크기는 1(보통)", () => {
    const out = normalizeStudio({
      stickers: [
        { icon: "heart", x: 0.2, y: 0.3, size: "s" },
        { icon: "star", x: 0.2, y: 0.3, size: "m" },
        { icon: "fox", x: 0.2, y: 0.3, size: "l" },
        { icon: "puppy", x: 0.2, y: 0.3, size: "l", scale: 0.5 },
        { icon: "bunny", x: 0.2, y: 0.3, size: "huge" },
        { icon: "balloons", x: 0.2, y: 0.3, scale: 5 },
        { icon: "cake", x: 0.2, y: 0.3, scale: "1.5", size: "l" },
        { icon: "txt-love", x: 0.2, y: 0.3, scale: Number.NaN },
      ],
    });
    assert.deepEqual(
      out?.stickers.map((s) => s.scale),
      [LEGACY_SIZE_SCALE.s, 1, LEGACY_SIZE_SCALE.l, 0.5, 1, SCALE_MAX, LEGACY_SIZE_SCALE.l, 1],
    );
    // 옮긴 값에는 size 가 남지 않는다
    for (const s of out?.stickers ?? []) assert.deepEqual(Object.keys(s).sort(), ["icon", "scale", "x", "y"]);
  });
});

describe("두 손가락 크기 — pinchScale·pointerDistance", () => {
  it("거리는 두 점 사이 직선", () => {
    assert.equal(pointerDistance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
    assert.equal(pointerDistance({ x: 10, y: 10 }, { x: 10, y: 10 }), 0);
  });

  it("처음 배율 × 지금 거리 ÷ 처음 거리, 범위 안으로·0.01 단위", () => {
    assert.equal(pinchScale(1, 100, 150), 1.5);
    assert.equal(pinchScale(1, 100, 50), 0.5);
    assert.equal(pinchScale(0.8, 120, 120), 0.8);
    assert.equal(pinchScale(1.2, 100, 400), SCALE_MAX);
    assert.equal(pinchScale(1, 100, 10), SCALE_MIN);
    assert.equal(pinchScale(1, 100, 0), SCALE_MIN);
    assert.equal(pinchScale(1, 90, 100), 1.11);
  });

  it("처음 거리가 0·음수·숫자가 아니면(나누기 0) 처음 배율 그대로", () => {
    assert.equal(pinchScale(1.3, 0, 80), 1.3);
    assert.equal(pinchScale(1.3, -5, 80), 1.3);
    assert.equal(pinchScale(1.3, Number.NaN, 80), 1.3);
    assert.equal(pinchScale(1.3, 50, Number.NaN), 1.3);
    assert.equal(pinchScale(1.3, 50, -1), 1.3);
    assert.equal(pinchScale(9, 0, 80), SCALE_MAX); // 처음 배율도 범위 안으로
  });

  it("벌렸다가 오므리면 제자리(잔 오차가 쌓이지 않게 늘 처음 값에서 셈)", () => {
    const from = 1;
    const start = 80;
    let s = from;
    for (const d of [90, 120, 160, 130, 95, 80]) s = pinchScale(from, start, d);
    assert.equal(s, from);
  });
});

describe("studioReducer — 스티커", () => {
  it("처음 붙이면 0번 자리·배율 1, 두 번째는 1번 자리", () => {
    const one = run([{ type: "add", icon: "balloons" }]);
    assert.deepEqual(one.stickers, [{ icon: "balloons", x: STUDIO_SPOTS[0][0], y: STUDIO_SPOTS[0][1], scale: 1 }]);
    const two = studioReducer(one, { type: "add", icon: "heart" });
    assert.deepEqual([two.stickers[1].x, two.stickers[1].y], [...STUDIO_SPOTS[1]]);
  });

  it("그림·글자 합쳐 STUDIO_MAX(8)개까지, 아홉 번째는 그대로(같은 값)", () => {
    assert.equal(STUDIO_MAX, 8);
    const icons = ["balloons", "cake", "txt-family", "sun", "kitten", "txt-love", "heart", "crown"];
    const full = run(icons.map((icon) => ({ type: "add", icon }) as const));
    assert.equal(full.stickers.length, STUDIO_MAX);
    assert.equal(studioReducer(full, { type: "add", icon: "bow" }), full);
    assert.equal(studioReducer(full, { type: "add", icon: "txt-happy" }), full);
  });

  it("그림 여섯은 여섯 가장자리 자리를 한 번씩, 7·8번째도 가장자리(얼굴 폭 밖)·사진 안", () => {
    const icons = STUDIO_STICKERS.slice(0, 8).map((s) => s.icon);
    const eight = run(icons.map((icon) => ({ type: "add", icon }) as const));
    assert.deepEqual(
      eight.stickers.slice(0, 6).map((s) => [s.x, s.y]),
      STUDIO_SPOTS.map((p) => [...p]),
    );
    for (const s of eight.stickers) {
      assert.ok(s.x < 0.2 || s.x > 0.8, `${s.icon} x ${s.x}`);
      assert.ok(s.y >= 0.03 && s.y <= 0.97, `${s.icon} y ${s.y}`);
    }
  });

  it("글자 스티커는 가운데 위 → 가운데 아래 → 그보다 조금 위, 얼굴 높이(0.16~0.66)는 피한다", () => {
    const three = run([
      { type: "add", icon: "txt-family" },
      { type: "add", icon: "txt-love" },
      { type: "add", icon: "txt-happy" },
    ]);
    assert.deepEqual(
      three.stickers.map((s) => [s.x, s.y]),
      TEXT_SPOTS.map((p) => [...p]),
    );
    for (const [x, y] of TEXT_SPOTS) {
      assert.equal(x, 0.5);
      // 배율 1 글자의 보이는 높이(한글 약 0.9em + 흰 테두리)는 사진 높이의 약 0.14 — 가운데 ± 0.07 이 얼굴 띠에 닿지 않게
      assert.ok(y + 0.07 <= 0.16 + 1e-9 || y - 0.07 >= 0.66 - 1e-9, `${y}`);
    }
  });

  it("글자와 그림은 서로 자리를 빼앗지 않는다", () => {
    const s = run([
      { type: "add", icon: "txt-family" },
      { type: "add", icon: "balloons" },
      { type: "add", icon: "txt-love" },
      { type: "add", icon: "cake" },
    ]);
    assert.deepEqual([s.stickers[1].x, s.stickers[1].y], [...STUDIO_SPOTS[0]]);
    assert.deepEqual([s.stickers[2].x, s.stickers[2].y], [...TEXT_SPOTS[1]]);
    assert.deepEqual([s.stickers[3].x, s.stickers[3].y], [...STUDIO_SPOTS[1]]);
  });

  it("글자 자리가 다 차면 차례 자리에서 조금 아래, 그래도 사진 안", () => {
    const stickers = TEXT_SPOTS.map(([x, y]) => at(x, y, "txt-love"));
    const p = nextSpot(stickers, "text");
    assert.deepEqual(p, { x: TEXT_SPOTS[0][0], y: clampPos(TEXT_SPOTS[0][1] + 0.05) });
  });

  it("모르는 아이콘은 그대로(같은 값)", () => {
    const s = run([{ type: "add", icon: "heart" }]);
    assert.equal(studioReducer(s, { type: "add", icon: "angry" }), s);
    assert.equal(studioReducer(s, { type: "add", icon: "../../etc" }), s);
    assert.equal(studioReducer(s, { type: "add", icon: "txt-unknown" }), s);
  });

  it("옮기면 사진 안으로 당긴다, NaN 은 가운데", () => {
    const s = run([{ type: "add", icon: "heart" }]);
    const moved = studioReducer(s, { type: "move", index: 0, x: -0.5, y: 1.4 });
    assert.deepEqual([moved.stickers[0].x, moved.stickers[0].y], [0.03, 0.97]);
    const nan = studioReducer(s, { type: "move", index: 0, x: Number.NaN, y: 0.4 });
    assert.deepEqual([nan.stickers[0].x, nan.stickers[0].y], [0.5, 0.4]);
    // 같은 자리로 옮기면 그대로
    assert.equal(studioReducer(s, { type: "move", index: 0, x: s.stickers[0].x, y: s.stickers[0].y }), s);
  });

  it("없는 번호로 옮기기·크기·떼기는 그대로(같은 값)", () => {
    const s = run([{ type: "add", icon: "heart" }]);
    for (const index of [-1, 1, 7, 0.5, Number.NaN]) {
      assert.equal(studioReducer(s, { type: "move", index, x: 0.5, y: 0.5 }), s);
      assert.equal(studioReducer(s, { type: "scale", index, scale: 1.5 }), s);
      assert.equal(studioReducer(s, { type: "remove", index }), s);
    }
  });

  it("크기(scale)는 그 스티커만·범위 안으로·0.01 단위, 같은 배율·숫자 아님은 그대로", () => {
    const s = run([
      { type: "bg", slug: "fam-park-lawn" },
      { type: "add", icon: "heart" },
      { type: "add", icon: "txt-love" },
      { type: "add", icon: "puppy" },
    ]);
    const sized = studioReducer(s, { type: "scale", index: 1, scale: 1.456 });
    assert.deepEqual(sized.stickers.map((t) => t.scale), [1, 1.46, 1]);
    assert.equal(studioReducer(sized, { type: "scale", index: 1, scale: 1.46 }), sized);
    assert.equal(studioReducer(sized, { type: "scale", index: 1, scale: 1.4649 }), sized); // 반올림하면 같다
    assert.equal(studioReducer(s, { type: "scale", index: 0, scale: 40 }).stickers[0].scale, SCALE_MAX);
    assert.equal(studioReducer(s, { type: "scale", index: 0, scale: 0 }).stickers[0].scale, SCALE_MIN);
    assert.equal(studioReducer(s, { type: "scale", index: 0, scale: Number.NaN }), s);
    // @ts-expect-error — 글자 배율은 그대로
    assert.equal(studioReducer(s, { type: "scale", index: 0, scale: "2" }), s);
  });

  it("떼면 나머지 순서 그대로, 모두 떼도 배경은 남는다", () => {
    const s = run([
      { type: "bg", slug: "fam-park-lawn" },
      { type: "add", icon: "heart" },
      { type: "add", icon: "txt-love" },
      { type: "add", icon: "puppy" },
    ]);
    const removed = studioReducer(s, { type: "remove", index: 0 });
    assert.deepEqual(removed.stickers.map((t) => t.icon), ["txt-love", "puppy"]);
    const cleared = studioReducer(s, { type: "clearStickers" });
    assert.deepEqual(cleared, { bg: "fam-park-lawn", stickers: [] });
    assert.equal(studioReducer(cleared, { type: "clearStickers" }), cleared);
  });

  it("스티커를 0번 자리로 끌어 두면 새 스티커는 1번 자리로", () => {
    // 가운데로 옮겨 둔 스티커는 자리를 차지하지 않는다 — 새 스티커는 0번 자리
    const centre = run([
      { type: "add", icon: "heart" },
      { type: "move", index: 0, x: 0.5, y: 0.5 },
    ]);
    const a = studioReducer(centre, { type: "add", icon: "star" });
    assert.deepEqual([a.stickers[1].x, a.stickers[1].y], [...STUDIO_SPOTS[0]]);
    // 0번 자리 근처로 끌어 두면(딱 그 자리가 아니어도) 새 스티커는 1번 자리
    const dragged = studioReducer(centre, { type: "move", index: 0, x: STUDIO_SPOTS[0][0] + 0.03, y: STUDIO_SPOTS[0][1] + 0.06 });
    const b = studioReducer(dragged, { type: "add", icon: "star" });
    assert.deepEqual([b.stickers[1].x, b.stickers[1].y], [...STUDIO_SPOTS[1]]);
  });

  it("여섯 자리가 다 차 있으면 차례 자리에서 조금 아래, 그래도 사진 안", () => {
    // 네 개로 여섯 자리를 다 덮는다(자리 둘 사이에 걸친 스티커)
    const stickers = [
      at(0.11, 0.3, "heart"), // 0번(0.24)
      at(0.1, 0.63, "star"), // 2번(0.76)·4번(0.50)
      at(0.9, 0.45, "fox"), // 1번(0.34)·5번(0.55)
      at(0.9, 0.8, "puppy"), // 3번(0.76)
    ];
    const spot = nextSpot(stickers);
    assert.deepEqual(spot, { x: STUDIO_SPOTS[4][0], y: STUDIO_SPOTS[4][1] + 0.05 });
    // 모든 자리가 차도 끝자리가 사진 밖으로 나가지 않는다
    const full = STUDIO_SPOTS.map(([x, y]) => at(x, y));
    for (let n = 0; n < 12; n++) {
      const p = nextSpot(full.concat(full).slice(0, 6 + (n % 6)));
      assert.ok(p.x >= 0.03 && p.x <= 0.97 && p.y >= 0.03 && p.y <= 0.97, JSON.stringify(p));
    }
  });

  it("받은 값을 고치지 않는다", () => {
    const base = frozen(
      run([
        { type: "bg", slug: "fam-sandy-beach" },
        { type: "add", icon: "heart" },
        { type: "add", icon: "txt-best" },
      ]),
    );
    const snapshot = JSON.stringify(base);
    const actions: StudioAction[] = [
      { type: "bg", slug: "fam-snowy-yard" },
      { type: "bg", slug: null },
      { type: "add", icon: "fox" },
      { type: "move", index: 1, x: 0.4, y: 0.4 },
      { type: "scale", index: 0, scale: 0.5 },
      { type: "remove", index: 0 },
      { type: "clearStickers" },
    ];
    for (const a of actions) {
      const out = studioReducer(base, a);
      assert.notEqual(out, base, a.type);
    }
    assert.equal(JSON.stringify(base), snapshot);
  });
});

describe("studioReducer — 배경", () => {
  it("아는 배경은 고르고, 모르는 배경은 그대로, null 은 기본으로", () => {
    const s = studioReducer(EMPTY_STUDIO, { type: "bg", slug: "fam-campsite" });
    assert.equal(s.bg, "fam-campsite");
    assert.equal(studioReducer(s, { type: "bg", slug: "no-such-place" }), s);
    assert.equal(studioReducer(s, { type: "bg", slug: "fam-campsite" }), s);
    const back = studioReducer(s, { type: "bg", slug: null });
    assert.equal(back.bg, null);
    assert.ok(isDefaultStudio(back));
    assert.equal(studioReducer(EMPTY_STUDIO, { type: "bg", slug: null }), EMPTY_STUDIO);
  });

  it("숨긴 예전 배경도 값으로는 받는다(이미 고른 사람) — 고르기 화면에만 안 나온다", () => {
    assert.equal(studioReducer(EMPTY_STUDIO, { type: "bg", slug: "han-river-park" }).bg, "han-river-park");
    assert.equal(studioBackground("han-river-park")?.hidden, true);
  });

  it("studioBackground — 없거나 모르면 undefined", () => {
    assert.equal(studioBackground(null), undefined);
    assert.equal(studioBackground(""), undefined);
    assert.equal(studioBackground("bakery"), undefined); // 창고에는 있지만 사진관 목록엔 없다
    assert.equal(studioBackground("living-room")?.label, "거실");
    assert.equal(studioBackground("fam-birthday-party")?.label, "생일 파티");
  });

  it("isDefaultStudio — 저장값 없음·빈 값은 기본", () => {
    assert.ok(isDefaultStudio(undefined));
    assert.ok(isDefaultStudio(null));
    assert.ok(isDefaultStudio(EMPTY_STUDIO));
    assert.ok(!isDefaultStudio({ bg: "fam-park-lawn", stickers: [] }));
    assert.ok(!isDefaultStudio(run([{ type: "add", icon: "txt-love" }])));
  });
});

describe("normalizeStudio — 불러올 때 거르기", () => {
  it("객체가 아니면 저장값 없음, 빈 객체는 빈 사진관", () => {
    for (const raw of [undefined, null, "x", 3, true, []]) assert.equal(normalizeStudio(raw), undefined, String(raw));
    assert.deepEqual(normalizeStudio({}), { bg: null, stickers: [] });
  });

  it("모르는 배경은 기본(null)으로, 숨긴 예전 배경·전용 배경은 그대로", () => {
    assert.equal(normalizeStudio({ bg: "no-such-place" })?.bg, null);
    assert.equal(normalizeStudio({ bg: 12 })?.bg, null);
    assert.equal(normalizeStudio({ bg: "old-palace" })?.bg, "old-palace");
    assert.equal(normalizeStudio({ bg: "fam-starry-hill" })?.bg, "fam-starry-hill");
  });

  it("모르는 아이콘·숫자 아닌 자리는 빼고, 넘친 자리는 당긴다", () => {
    const out = normalizeStudio({
      stickers: [
        { icon: "heart", x: 0.2, y: 0.3, scale: 1.2 },
        { icon: "angry", x: 0.2, y: 0.3, scale: 1 },
        { icon: "star", x: "0.5", y: 0.3, scale: 1 },
        { icon: "star", y: 0.3 },
        null,
        "fox",
        { icon: "fox", x: -3, y: 9, scale: 1, extra: "버린다" },
        { icon: "txt-dream", x: 0.5, y: 0.1, scale: 0.8 },
      ],
    });
    assert.deepEqual(out?.stickers, [at(0.2, 0.3, "heart", 1.2), at(0.03, 0.97, "fox"), at(0.5, 0.1, "txt-dream", 0.8)]);
  });

  it("스티커는 앞의 STUDIO_MAX 개만, 배열이 아니면 빈 목록", () => {
    const eleven = Array.from({ length: 11 }, (_, i) => ({ icon: STUDIO_STICKERS[i].icon, x: 0.5, y: 0.5, scale: 1 }));
    const out = normalizeStudio({ stickers: eleven });
    assert.equal(out?.stickers.length, STUDIO_MAX);
    assert.deepEqual(out?.stickers.map((s) => s.icon), eleven.slice(0, STUDIO_MAX).map((s) => s.icon));
    assert.deepEqual(normalizeStudio({ stickers: "heart" })?.stickers, []);
    assert.deepEqual(normalizeStudio({ stickers: { 0: {} } })?.stickers, []);
  });

  it("예전 저장값(작게·보통·크게, 6개까지, 아이콘 스티커)이 그대로 살아난다", () => {
    const legacy = {
      bg: "han-river-park",
      stickers: [
        { icon: "heart", x: 0.12, y: 0.24, size: "s" },
        { icon: "star", x: 0.88, y: 0.34, size: "m" },
        { icon: "puppy", x: 0.1, y: 0.76, size: "l" },
      ],
      at: "2026-09-30T02:00:00.000Z",
    };
    assert.deepEqual(normalizeStudio(legacy), {
      bg: "han-river-park",
      stickers: [at(0.12, 0.24, "heart", LEGACY_SIZE_SCALE.s), at(0.88, 0.34, "star", 1), at(0.1, 0.76, "puppy", LEGACY_SIZE_SCALE.l)],
      at: "2026-09-30T02:00:00.000Z",
    });
  });

  it("꾸민 때(at)는 날짜로 읽히면 두고, 아니면 버린다", () => {
    const when = "2026-09-30T10:00:00.000Z";
    assert.deepEqual(normalizeStudio({ bg: null, stickers: [], at: when }), { bg: null, stickers: [], at: when });
    for (const bad of ["어제", "", 12, null, {}]) {
      assert.equal("at" in (normalizeStudio({ bg: null, stickers: [], at: bad }) ?? {}), false, String(bad));
    }
  });

  it("JSON 으로 오가도 같다", () => {
    const s = run([
      { type: "bg", slug: "fam-castle-clouds" },
      { type: "add", icon: "crown" },
      { type: "add", icon: "txt-dream" },
      { type: "scale", index: 1, scale: 1.65 },
      { type: "move", index: 0, x: 0.5, y: 0.1 },
    ]);
    assert.deepEqual(normalizeStudio(JSON.parse(JSON.stringify(s))), s);
  });
});

describe("studioReducer — 모두 떼기 되돌리기(stickers)", () => {
  it("뗀 스티커를 그대로 돌려놓고(배율까지), 배경은 건드리지 않는다", () => {
    const before = run([
      { type: "bg", slug: "fam-campsite" },
      { type: "add", icon: "heart" },
      { type: "add", icon: "txt-picnic" },
      { type: "scale", index: 1, scale: 1.8 },
    ]);
    const cleared = studioReducer(frozen(before), { type: "clearStickers" });
    assert.deepEqual(cleared.stickers, []);
    const back = studioReducer(frozen(cleared), { type: "stickers", stickers: before.stickers });
    assert.deepEqual(back, before);
  });

  it("불러올 때처럼 거른다 — 모르는 아이콘 빼기·사진 안으로·STUDIO_MAX 개까지", () => {
    const ten = Array.from({ length: 10 }, (_, i) => at(2, -1, STUDIO_STICKERS[i].icon));
    const out = studioReducer(EMPTY_STUDIO, { type: "stickers", stickers: [at(0.5, 0.5, "angry"), ...ten] });
    assert.equal(out.stickers.length, STUDIO_MAX);
    assert.ok(out.stickers.every((t) => t.icon !== "angry" && t.x === 0.97 && t.y === 0.03));
  });

  it("같은 목록이면 받은 값 그대로(저장 안 함)", () => {
    const s = run([{ type: "add", icon: "star" }]);
    assert.equal(studioReducer(s, { type: "stickers", stickers: [...s.stickers] }), s);
  });
});

describe("꾸민 때 — stampStudio · newerStudio", () => {
  const a: FamilyStudio = { bg: "fam-sunny-living-room", stickers: [] };
  const b: FamilyStudio = { bg: "fam-sandy-beach", stickers: [] };

  it("찍으면 at 만 새로, 받은 값은 그대로", () => {
    const now = new Date("2026-09-30T10:00:00.000Z");
    const s = frozen(run([{ type: "add", icon: "heart" }]));
    const t = stampStudio(s, now);
    assert.equal(t.at, "2026-09-30T10:00:00.000Z");
    assert.deepEqual({ bg: t.bg, stickers: t.stickers }, { bg: s.bg, stickers: s.stickers });
    assert.equal(s.at, undefined);
  });

  it("나중에 꾸민 쪽 · 한쪽만 있으면 그쪽 · 같은 때나 둘 다 at 없으면 앞(서버)", () => {
    const old = stampStudio(a, new Date("2026-09-30T10:00:00Z"));
    const neu = stampStudio(b, new Date("2026-09-30T10:05:00Z"));
    assert.equal(newerStudio(old, neu), neu);
    assert.equal(newerStudio(neu, old), neu);
    assert.equal(newerStudio(undefined, old), old);
    assert.equal(newerStudio(old, null), old);
    assert.equal(newerStudio(undefined, undefined), undefined);
    assert.equal(newerStudio(a, b), a);
    assert.equal(newerStudio(a, old), old, "at 없는 값은 가장 옛것");
    assert.equal(newerStudio(old, { ...b, at: old.at }), old);
  });
});

describe("mergeRemoteChild — 사진관", () => {
  const BASE: ChildPrefs = { name: "하온", age: 5, gender: "boy" };
  const mine: FamilyStudio = { bg: "fam-sunny-living-room", stickers: [at(0.12, 0.24, "heart")] };
  const T1 = new Date("2026-09-30T10:00:00Z");
  const T2 = new Date("2026-09-30T10:05:00Z");

  it("나중에 꾸민 쪽이 이긴다 — 다른 기기에서 나중에 꾸민 서버 값, 서버에 못 올라간 이 기기 꾸미기", () => {
    const tablet = stampStudio({ bg: "fam-sandy-beach", stickers: [] }, T2);
    const phone = stampStudio(mine, T1);
    // 폰을 오래 열어 뒀다가 돌아옴 — 태블릿이 나중에 바꾼 바닷가가 이긴다(폰의 옛 거실로 되돌리지 않는다)
    assert.deepEqual(mergeRemoteChild({ ...BASE, familyStudio: tablet }, { ...BASE, familyStudio: phone }).familyStudio, tablet);
    // 이 기기에서 꾸미고 800ms 안에 앱을 닫음 — 서버는 옛 값, 이 기기 값이 이긴다
    const serverOld = stampStudio({ bg: "fam-park-lawn", stickers: [] }, T1);
    const unsent = stampStudio({ bg: "fam-sandy-beach", stickers: [] }, T2);
    assert.deepEqual(mergeRemoteChild({ ...BASE, familyStudio: serverOld }, { ...BASE, familyStudio: unsent }).familyStudio, unsent);
  });

  it("나중에 되돌린 빈 값도 이긴다", () => {
    const reset = stampStudio(EMPTY_STUDIO, T2);
    assert.deepEqual(
      mergeRemoteChild({ ...BASE, familyStudio: reset }, { ...BASE, familyStudio: stampStudio(mine, T1) }).familyStudio,
      reset,
    );
  });

  it("같은 때(또는 at 없음)면 서버 값 — 빈 값(되돌림)도", () => {
    const server: FamilyStudio = { bg: "fam-snowy-yard", stickers: [] };
    assert.deepEqual(mergeRemoteChild({ ...BASE, familyStudio: server }, { ...BASE, familyStudio: mine }).familyStudio, server);
    assert.deepEqual(
      mergeRemoteChild({ ...BASE, familyStudio: EMPTY_STUDIO }, { ...BASE, familyStudio: mine }).familyStudio,
      EMPTY_STUDIO,
    );
  });

  it("서버에 없으면(옛 화면이 schema 2 를 찍으며 버림) 이 기기 값을 지킨다", () => {
    assert.deepEqual(mergeRemoteChild({ ...BASE }, { ...BASE, familyStudio: mine }).familyStudio, mine);
    const stamped = stampStudio(mine, T1);
    assert.deepEqual(mergeRemoteChild({ ...BASE, schema: 2 }, { ...BASE, schema: 2, familyStudio: stamped }).familyStudio, stamped);
    assert.equal(mergeRemoteChild({ ...BASE }, null).familyStudio, undefined);
  });
});

describe("studioSheetFit — 꾸미기 시트 모양", () => {
  /** 세로: 붙은 칸 아래로 보이는 고르기 높이 */
  const listRoom = (vh: number, h: number) => sheetRoom(vh) - STACK_PINNED - h;

  it("보통 폰·태블릿은 홈 액자와 같은 높이(200·240), 세로로 붙인다", () => {
    assert.deepEqual(studioSheetFit(390, 844), { side: false, height: 200 });
    assert.deepEqual(studioSheetFit(360, 740), { side: false, height: 200 });
    assert.deepEqual(studioSheetFit(820, 1180), { side: false, height: 240 });
    assert.deepEqual(studioSheetFit(1180, 820), { side: false, height: 240 });
  });

  it("낮은 세로 화면(아이폰 SE 사파리)은 미리보기를 줄여 고르기가 두 줄은 보인다", () => {
    const f = studioSheetFit(375, 548);
    assert.equal(f.side, false);
    assert.ok(f.height < 200 && f.height >= 140, String(f.height));
    assert.ok(listRoom(548, f.height) >= STACK_LIST_MIN - 1, String(listRoom(548, f.height)));
  });

  it("가로로 눕힌 폰은 두 칸 — 왼쪽 붙은 칸이 시트 안에 들고, 오른쪽 고르기 칸이 200px 은 된다", () => {
    for (const [vw, vh] of [
      [800, 360],
      [740, 360],
      [915, 412],
      [844, 390],
      [667, 375],
      [667, 320],
      [568, 320],
    ]) {
      const f = studioSheetFit(vw, vh);
      assert.equal(f.side, true, `${vw}×${vh}`);
      assert.ok(f.height >= 110 && f.height <= 180, `${vw}×${vh} → ${f.height}`);
      if (f.height > 110) assert.ok(f.height + SIDE_PINNED <= sheetRoom(vh), `${vw}×${vh}: 왼쪽 칸이 넘친다`);
      const right = sideListWidth(vw, f.height);
      assert.ok(right >= 200, `${vw}×${vh}: 오른쪽 ${right}px`);
    }
  });

  it("가로로 눕힌 폰(폭 640 이상)의 글자 칸은 두 칸씩 선다 — 한 칸씩이면 12개가 세 화면을 넘는다", () => {
    // 가장 긴 문구 '메리 크리스마스'(주아 17px, 테두리 여백까지 108px) + 단추 안쪽 여백 4 가 칸에 든다
    assert.ok(TEXT_CELL_MIN >= 108 + 4, String(TEXT_CELL_MIN));
    for (const [vw, vh] of [
      [640, 360],
      [667, 331],
      [736, 414],
      [780, 336],
      [800, 360],
      [844, 340],
      [915, 388],
      [932, 390],
    ]) {
      const f = studioSheetFit(vw, vh);
      assert.equal(f.side, true, `${vw}×${vh}`);
      const right = sideListWidth(vw, f.height);
      // auto-fill minmax(TEXT_CELL_MIN, 1fr) · 칸 사이 6px(gap-1.5)
      const cols = Math.floor((right + 6) / (TEXT_CELL_MIN + 6));
      assert.ok(cols >= 2, `${vw}×${vh}: 오른쪽 ${right}px → ${cols}칸`);
    }
  });
});

/** 두 칸일 때 오른쪽(고르기) 칸 폭 — 시트 폭(max-w-3xl 768)·좌우 여백(px-5)·왼쪽 칸(sidePreviewWidth)·칸 사이(gap-4) */
function sideListWidth(vw: number, height: number): number {
  return Math.min(vw, 768) - 40 - sidePreviewWidth(height) - 16;
}

describe("saveChild — 사진관 저장", () => {
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

  it("사진관만 넘겨도 저장되고, 다른 저장은 사진관을 건드리지 않는다, 빈 값도 남는다", async () => {
    stubWindow();
    const { saveChild, loadChild } = await import("./prefs.ts");
    const s: FamilyStudio = { bg: "fam-campsite", stickers: [at(0.9, 0.76, "fox", 0.71), at(0.5, 0.09, "txt-family", 1.4)] };
    saveChild({ name: "하온", age: 5, gender: "boy" });
    saveChild({ name: "하온", familyStudio: s });
    assert.deepEqual(loadChild()?.familyStudio, s);
    saveChild({ name: "하온", age: 6, homeFamilyFolded: true });
    assert.deepEqual(loadChild()?.familyStudio, s);
    saveChild({ name: "하온", familyStudio: { bg: null, stickers: [] } });
    assert.deepEqual(loadChild()?.familyStudio, { bg: null, stickers: [] });
  });

  it("이 기기에 남은 예전 값(size)은 불러올 때 배율로 옮겨진다", async () => {
    const store = stubWindow();
    const { saveChild, loadChild } = await import("./prefs.ts");
    saveChild({ name: "하온", age: 5, gender: "boy" });
    const [key] = [...store.keys()];
    const raw = JSON.parse(store.get(key) ?? "{}");
    raw.familyStudio = { bg: "living-room", stickers: [{ icon: "heart", x: 0.12, y: 0.24, size: "l" }] };
    store.set(key, JSON.stringify(raw));
    assert.deepEqual(loadChild()?.familyStudio, { bg: "living-room", stickers: [at(0.12, 0.24, "heart", LEGACY_SIZE_SCALE.l)] });
  });
});
