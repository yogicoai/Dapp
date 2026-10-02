import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  arrangePageReferences,
  fixedCheckDescription,
  fixedFamilyFaceLines,
  facialFeatureLines,
  familyFramingCheckLines,
  familyFramingLines,
  maxPagePortraits,
  ordinalWord,
  pageReferenceLabels,
  pickPagePortraits,
  portraitBindingLines,
  portraitKey,
  readPortraitFigure,
  readSheetOrder,
  readSheetOutfits,
  refOrdinal,
  sheetOrderLine,
} from "./page-refs.ts";

/*
 * 쪽 그림 참고 그림 순서 — 고정 가족 원본 그림을 붙일 때 순서와 '몇 번째'가 어긋나지 않는지,
 * 붙이지 않을 때는 예전 그대로인지.
 */

const PREFIX = "https://yogibo.openhost.cafe24.com/app/img/dapp/family/0a1b2c3d-1111-2222-3333-444455556666/";
const HEX = "0123456789abcdef0123456789abcdef";
const ref = (id: string) => `${PREFIX}${id}-1759100000000-${HEX}-ref.jpg`;
const cast = [
  { name: "하온", description: "5세 남자아이" },
  { name: "엄마", description: "단발" },
  { name: "아빠", description: "" },
  { name: "서연", description: "친구" },
];

describe("arrangePageReferences — 시트 → 고정 얼굴 → 장소 → 승인 쪽", () => {
  it("고정 얼굴이 없으면 예전 순서·예전 서수 그대로(FIRST/SECOND/THIRD)", () => {
    const r = arrangePageReferences({ sheet: "S", portraits: [], location: "L", style: "T" });
    assert.deepEqual(r.images, ["S", "L", "T"]);
    assert.deepEqual(r.order, ["sheet", "location", "style"]);
    assert.equal(refOrdinal(r.order, "sheet"), "FIRST");
    assert.equal(refOrdinal(r.order, "location"), "SECOND");
    assert.equal(refOrdinal(r.order, "style"), "THIRD");
    // 없는 것은 빠지고, 모르는 것은 'attached'(예전 nth 와 같다)
    const noLoc = arrangePageReferences({ sheet: "S", portraits: [], location: null, style: "T" });
    assert.deepEqual(noLoc.order, ["sheet", "style"]);
    assert.equal(refOrdinal(noLoc.order, "style"), "SECOND");
    assert.equal(refOrdinal(noLoc.order, "location"), "attached");
  });

  it("얼굴은 시트 바로 뒤, 등장인물 순 — 그림과 서수가 같은 자리", () => {
    const r = arrangePageReferences({
      sheet: "S",
      portraits: [
        { name: "하온", image: "P1" },
        { name: "엄마", image: "P2" },
      ],
      location: "L",
      style: "T",
    });
    assert.deepEqual(r.images, ["S", "P1", "P2", "L", "T"]);
    assert.equal(refOrdinal(r.order, portraitKey("하온")), "SECOND");
    assert.equal(refOrdinal(r.order, portraitKey("엄마")), "THIRD");
    assert.equal(refOrdinal(r.order, "location"), "FOURTH");
    assert.equal(refOrdinal(r.order, "style"), "FIFTH");
    for (const [i, key] of r.order.entries()) assert.equal(refOrdinal(r.order, key), ordinalWord(i));
  });

  it("서수는 열째까지, 그 뒤는 'attached'", () => {
    assert.equal(ordinalWord(6), "SEVENTH");
    assert.equal(ordinalWord(9), "TENTH");
    assert.equal(ordinalWord(10), "attached");
    assert.equal(ordinalWord(-1), "attached");
  });
});

describe("maxPagePortraits — 모델마다 한 쪽에 붙일 얼굴 수", () => {
  it("gemini-2.x 는 1장(참고 그림이 많으면 흐려진다), 3.x·OpenAI 는 시트의 6명까지", () => {
    assert.equal(maxPagePortraits({}), 1);
    assert.equal(maxPagePortraits({ GEMINI_IMAGE_MODEL: "gemini-2.5-flash-image" }), 1);
    assert.equal(maxPagePortraits({ GEMINI_IMAGE_MODEL: "gemini-3.1-flash-image" }), 6);
    assert.equal(maxPagePortraits({ IMAGE_PROVIDER: "openai" }), 6);
  });
});

describe("pickPagePortraits — 이 쪽에 보이는 고정 가족의 원본 그림만(주소 규칙은 시트와 같다)", () => {
  const raw = [
    { name: "아빠", ref: ref("dad"), memberId: "dad" },
    { name: "하온", ref: ref("child"), memberId: "child" },
    { name: "엄마", ref: ref("mom"), memberId: "mom" },
  ];

  it("이 쪽에 보이는 고정 인물만, 등장인물 순으로", () => {
    const got = pickPagePortraits(raw, cast, ["엄마", "하온"], PREFIX, { max: 4, watercolor: true });
    assert.deepEqual(
      got.portraits.map((p) => [p.name, p.memberId]),
      [
        ["하온", "child"],
        ["엄마", "mom"],
      ],
    );
    assert.equal(got.offPage, 1);
    assert.equal(got.rejected, 0);
  });

  it("상한은 이 쪽 사람을 고른 **뒤에** 자른다 — 주인공이 없는 쪽에서 엄마가 밀려나지 않게", () => {
    const got = pickPagePortraits(raw, cast, ["엄마"], PREFIX, { max: 1, watercolor: true });
    assert.deepEqual(got.portraits.map((p) => p.name), ["엄마"]);
    const two = pickPagePortraits(raw, cast, ["하온", "엄마", "아빠"], PREFIX, { max: 1, watercolor: true });
    assert.deepEqual(two.portraits.map((p) => p.name), ["하온"]);
  });

  it("남의 폴더·PNG·사람 id 가 다른 파일·등장인물에 없는 이름은 받지 않는다(마스터가 남의 책을 다시 그릴 때도)", () => {
    const other = PREFIX.replace("0a1b2c3d", "ffffffff");
    const bad = [
      { name: "하온", ref: `${other}child-1759100000000-${HEX}-ref.jpg`, memberId: "child" },
      { name: "엄마", ref: ref("mom").replace("-ref.jpg", ".png"), memberId: "mom" },
      { name: "아빠", ref: ref("mom"), memberId: "dad" },
      { name: "모르는 사람", ref: ref("m-abc"), memberId: "m-abc" },
    ];
    const got = pickPagePortraits(bad, cast, ["하온", "엄마", "아빠"], PREFIX, { max: 4, watercolor: true });
    assert.deepEqual(got.portraits, []);
    assert.equal(got.rejected, 4);
    // 폴더 설정이 없으면(부른 사람을 모르면) 아무것도
    assert.deepEqual(pickPagePortraits(raw, cast, ["하온"], null, { max: 4, watercolor: true }).portraits, []);
  });

  it("수채화 책이 아니거나, 이 쪽에 고정 인물이 없거나, 칸이 없으면 아무것도", () => {
    assert.deepEqual(pickPagePortraits(raw, cast, ["하온"], PREFIX, { max: 4, watercolor: false }).portraits, []);
    assert.deepEqual(pickPagePortraits(raw, cast, [], PREFIX, { max: 4, watercolor: true }).portraits, []);
    assert.deepEqual(pickPagePortraits(undefined, cast, ["하온"], PREFIX, { max: 4, watercolor: true }).portraits, []);
  });
});

describe("readSheetOrder · sheetOrderLine — 시트에 선 순서", () => {
  it("등장인물 이름만, 한 번씩", () => {
    assert.deepEqual(readSheetOrder(["하온", "엄마", "서연", "엄마", "누구", 3], cast), ["하온", "엄마", "서연"]);
    assert.equal(readSheetOrder([], cast), null);
    assert.equal(readSheetOrder("하온", cast), null);
    assert.equal(readSheetOrder(["누구"], cast), null);
  });

  it("왼쪽부터 번호를 붙여 말한다", () => {
    assert.equal(
      sheetOrderLine(["하온", "엄마", "서연"]),
      "The reference sheet shows these people from left to right: 1. 하온, 2. 엄마, 3. 서연. Each column is one person — the full figure on top and the same person's close-up below.",
    );
    assert.equal(sheetOrderLine(["하온", "엄마"], []), sheetOrderLine(["하온", "엄마"]));
  });

  it("섞인 시트 — AI 가 따로 그린 사람은 키가 제 비율이 아니라고, 나이대로 그리라고", () => {
    const one = sheetOrderLine(["하온", "서연", "엄마"], ["서연"]);
    assert.match(one, /close-up below\. 서연 was painted separately at a different scale — heights on this sheet are NOT to scale between people\. Draw every person at the natural height for their age\.$/);
    assert.match(sheetOrderLine(["하온", "엄마", "서연", "선생님"], ["서연", "선생님"]), / 서연, 선생님 were painted separately/);
  });
});

describe("fixedFamilyFaceLines — 이 쪽 고정 가족 줄(원본이 붙은 사람만 '붙은 원본')", () => {
  const OLD =
    "FIXED FAMILY FACES: 하온, 엄마 — face, hairstyle, hair length, hair colour and texture, glasses and body come ONLY from the reference sheet; if their description above words it differently, follow the sheet. Their outfit stays exactly as on the sheet, like everyone else's — change it only where this page's scene text itself dresses them differently.";

  it("원본도 짠 시트도 없으면(옛 책) 예전 한 줄 그대로", () => {
    assert.deepEqual(fixedFamilyFaceLines(["하온", "엄마"], new Set(), false), [OLD]);
    assert.deepEqual(fixedFamilyFaceLines([], new Set(["하온"]), true), []);
  });

  it("원본이 한 사람에게만 붙으면(2.x 1장 상한) 그 사람만 '붙은 원본', 나머지는 시트만", () => {
    const lines = fixedFamilyFaceLines(["하온", "엄마"], new Set(["하온"]), false);
    assert.equal(lines.length, 2);
    assert.match(lines[0], /^FIXED FAMILY FACES: 하온 — [^\n]*ONLY from their attached original portrait \(FIXED FACE PORTRAITS above\)/);
    assert.match(lines[1], /^FIXED FAMILY FACES \(no portrait attached for them on this page\): 엄마 — [^\n]*ONLY from the reference sheet;/);
    assert.doesNotMatch(lines[1], /attached original portrait/);
  });

  it("짠 시트면 설명 글의 옷을 버리고 시트의 옷을 — 장면이 갈아입힐 때만 바꾼다", () => {
    for (const lines of [
      fixedFamilyFaceLines(["하온", "엄마"], new Set(["하온", "엄마"]), true),
      fixedFamilyFaceLines(["하온", "엄마"], new Set(), true),
    ]) {
      assert.equal(lines.length, 1);
      assert.match(lines[0], /Their outfit is exactly the one shown on the reference sheet — ignore any clothing named in their description above; change it only where this page's scene text itself dresses them differently \(pajamas, coat, swimsuit\)\.$/);
    }
  });
});

describe("fixedCheckDescription — 검수에서 고정 가족을 무엇과 견줄지", () => {
  it("옛 책은 예전 꼬리표 그대로(검수 GOLDEN 과 같은 글)", () => {
    assert.equal(fixedCheckDescription("5세 남자아이", false, false), "5세 남자아이 (fixed family face — judge face and hair against the reference sheet, not this text)");
    assert.equal(fixedCheckDescription("", false, false), "(fixed family face — judge face and hair against the reference sheet, not this text)");
  });

  it("원본이 붙으면 얼굴·머리는 원본, 옷은 시트 — 짠 시트에 원본이 안 붙은 사람은 옷까지 시트", () => {
    assert.match(fixedCheckDescription("단발", true, true), /judge face and hair against their attached original portrait and outfit against the reference sheet, not this text\)$/);
    assert.match(fixedCheckDescription("단발", true, false), /attached original portrait and outfit against the reference sheet/);
    assert.equal(fixedCheckDescription("단발, 노란 원피스", false, true), "단발, 노란 원피스 (fixed family face — judge face, hair and outfit against the reference sheet, not this text)");
  });
});

describe("portraitBindingLines — 몇 번째 그림이 누구 얼굴인지", () => {
  it("붙인 순서의 서수로 이름을 묶고, 추가 인물·옷·배경을 막는다", () => {
    const r = arrangePageReferences({
      sheet: "S",
      portraits: [
        { name: "하온", image: "P1" },
        { name: "엄마", image: "P2" },
      ],
      location: null,
      style: "T",
    });
    const lines = portraitBindingLines(r.order, ["하온", "엄마"]);
    const text = lines.join("\n");
    assert.match(text, /^- The SECOND attached image is "하온" — 하온's exact face and hair\. Copy exactly: face shape, eyes/m);
    assert.match(text, /^- The THIRD attached image is "엄마" — 엄마's exact face and hair\./m);
    assert.match(text, /The reference sheet shows the same person\./);
    assert.match(text, /never an additional person and never a second copy/);
    assert.match(text, /Ignore each portrait's white background, standing pose and framing/);
    assert.match(text, /Clothing comes from the reference sheet[^\n]*not from the portrait/);
    assert.match(text, /the PORTRAIT wins/);
    // 승인 쪽이 얼굴을 옮겨 오지 않게 — 승인 쪽에서는 그림체만
    assert.match(text, /if the reference sheet, an approved page or any description disagrees with a portrait about face or hair, the PORTRAIT wins — take only the rendering style from an approved page, never a face\./);
  });

  it("얼굴이 없으면 한 줄도 없다", () => {
    assert.deepEqual(portraitBindingLines(["sheet"], []), []);
  });
});

/* ─────────── 이 책의 옷 — 옷 카드로 입은 고정 가족(2026-09-29 저녁~) ─────────── */

describe("readSheetOutfits — 옷 카드로 입은 고정 가족만", () => {
  const dressedCast = [
    { name: "하온", description: "", fixed: true, outfit: "민트 티셔츠, 베이지 반바지" },
    { name: "엄마", description: "", fixed: true, outfit: "코랄 니트, 연청 바지" },
    { name: "아빠", description: "", fixed: true },
    { name: "서연", description: "", outfit: "노란 원피스" },
  ];

  it("등장인물·고정·옷 글이 있는 이름만, 한 번씩", () => {
    assert.deepEqual(readSheetOutfits(["하온", "엄마", "하온", "아빠", "서연", "누구", 3], dressedCast), ["하온", "엄마"]);
    assert.deepEqual(readSheetOutfits(undefined, dressedCast), []);
    assert.deepEqual(readSheetOutfits("하온", dressedCast), []);
    assert.deepEqual(readSheetOutfits([" 엄마 "], dressedCast), ["엄마"]);
  });
});

describe("sheetOrderLine — 옷 카드 칸", () => {
  it("모두 옷 카드면 '위는 옷만, 아래는 얼굴' — 나머지 사람 말이 없다", () => {
    assert.equal(
      sheetOrderLine(["하온", "엄마"], [], ["하온", "엄마"]),
      "The reference sheet shows these people from left to right: 1. 하온, 2. 엄마. Each column is one person. For 하온, 엄마 the top of the column shows ONLY the clothes they wear in this book (laid out, with no person in them) and the close-up below is their face; dress them in exactly those clothes, and never draw those laid-out clothes as loose objects in the scene. Their faces come ONLY from those close-ups, never from anything in the clothes area.",
    );
  });

  it("섞인 시트 — 나머지 사람은 예전처럼 전신 위·얼굴 아래, 키 줄은 뒤에", () => {
    const line = sheetOrderLine(["하온", "서연", "엄마"], ["서연"], ["하온", "엄마"]);
    assert.match(line, /For 하온, 엄마 the top of the column shows ONLY the clothes they wear in this book/);
    assert.match(line, /loose objects in the scene\. Their faces come ONLY from those close-ups, never from anything in the clothes area\. For everyone else the full figure is on top and the same person's close-up below\. 서연 was painted separately/);
    // 시트에 없는 이름은 말하지 않는다
    assert.equal(sheetOrderLine(["하온"], [], ["엄마"]), sheetOrderLine(["하온"]));
  });
});

describe("fixedFamilyFaceLines — 이 책의 옷", () => {
  const outfits = new Map([
    ["하온", "민트 티셔츠, 베이지 반바지, 흰 운동화"],
    ["엄마", "코랄 니트, 연청 바지"],
  ]);

  it("가족 그림·얼굴 칸 아래 끝의 옷이 아니라 칸 위의 옷을, 옷 글과 함께", () => {
    const lines = fixedFamilyFaceLines(["하온", "엄마"], new Set(["하온", "엄마"]), true, outfits);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^FIXED FAMILY FACES: 하온, 엄마 — [^\n]*follow the portrait\. THIS BOOK'S OUTFIT — 하온, 엄마 do NOT wear the clothes shown in their portrait or at the bottom edge of their close-up\./);
    assert.match(lines[0], /Each wears the clothes-only outfit drawn at the top of their own column on the reference sheet: 하온 — 민트 티셔츠, 베이지 반바지, 흰 운동화; 엄마 — 코랄 니트, 연청 바지\./);
    assert.match(lines[0], /change them only where this page's scene text itself dresses them differently \(pajamas, coat, swimsuit\)\.$/);
    assert.doesNotMatch(lines[0], /ignore any clothing named in their description/);
  });

  it("원본이 한 사람에게만 붙어도 두 줄 모두 이 책의 옷", () => {
    const lines = fixedFamilyFaceLines(["하온", "엄마"], new Set(["하온"]), true, outfits);
    assert.equal(lines.length, 2);
    assert.match(lines[0], /THIS BOOK'S OUTFIT — 하온 do NOT wear[^\n]*: 하온 — 민트 티셔츠/);
    assert.match(lines[1], /^FIXED FAMILY FACES \(no portrait attached for them on this page\): 엄마 — [^\n]*THIS BOOK'S OUTFIT — 엄마 do NOT wear[^\n]*: 엄마 — 코랄 니트, 연청 바지\./);
    // 시트에 전신이 없다 — 얼굴 칸 아래 끝에 닿은 머리는 더 길다(원본이 붙은 하온 줄엔 없다)
    assert.match(
      lines[1],
      /follow the sheet\. On the sheet 엄마 has no full figure and the close-up is cropped at the shoulders: hair that reaches the bottom edge of the close-up keeps going below it \(long hair\) — never shorten it; body build follows their age and role\. THIS BOOK'S OUTFIT/,
    );
    assert.doesNotMatch(lines[0], /cropped at the shoulders/);
  });

  it("옷 글이 없는 사람은 예전 문장 — 빈 지도면 글자 그대로", () => {
    const mixed = fixedFamilyFaceLines(["하온", "아빠"], new Set(["하온", "아빠"]), true, outfits);
    assert.match(mixed[0], /: 하온 — 민트 티셔츠, 베이지 반바지, 흰 운동화\. Copy those[^\n]*\(pajamas, coat, swimsuit\)\. For 아빠: Their outfit is exactly the one shown on the reference sheet/);
    assert.deepEqual(
      fixedFamilyFaceLines(["하온", "엄마"], new Set(["하온"]), true, new Map()),
      fixedFamilyFaceLines(["하온", "엄마"], new Set(["하온"]), true),
    );
  });
});

describe("fixedCheckDescription — 이 책의 옷", () => {
  it("원본이 붙으면 얼굴·머리는 원본, 옷은 칸 위의 옷 — 가족 그림 옷과 견주지 않는다", () => {
    assert.equal(
      fixedCheckDescription("짧은 머리, 민트 티셔츠", true, true, true),
      "짧은 머리, 민트 티셔츠 (fixed family face — judge face and hair against their attached original portrait, and the outfit against the clothes-only outfit at the top of their column on the reference sheet — never against the portrait's clothes)",
    );
  });

  it("원본이 안 붙으면 얼굴·머리는 시트의 얼굴 칸과", () => {
    assert.match(
      fixedCheckDescription("단발", false, true, true),
      /judge face and hair against their close-up on the reference sheet \(cropped at the shoulders — hair that reaches its bottom edge is long: FAIL if drawn clearly shorter\), and the outfit against the clothes-only outfit at the top of their column — never against the clothes at the bottom edge of the close-up\)$/,
    );
  });

  it("dressed 를 안 주면 예전 꼬리표 그대로", () => {
    assert.equal(fixedCheckDescription("단발", true, true, false), fixedCheckDescription("단발", true, true));
    assert.equal(fixedCheckDescription("단발", false, false, false), fixedCheckDescription("단발", false, false));
  });
});

/* ─────────── 얼굴 카드·이름표·사람 많은 쪽(2026-10-01 사장님 "아바타와 너무 달라") ─────────── */

describe("portraitBindingLines — 얼굴 카드로 붙인 사람", () => {
  const r = arrangePageReferences({
    sheet: "S",
    portraits: [
      { name: "하온", image: "P1" },
      { name: "엄마", image: "P2" },
    ],
    location: null,
    style: null,
  });

  it("카드면 한 사람이 두 번(왼쪽 전신·오른쪽 키운 얼굴)이라고, 얼굴은 키운 쪽에서 읽으라고", () => {
    const text = portraitBindingLines(r.order, ["하온", "엄마"], new Set(["하온"])).join("\n");
    assert.match(
      text,
      /^- The SECOND attached image is "하온" — 하온's exact face and hair\. It shows ONE person, 하온, twice: the whole figure on the left and the same face enlarged on the right — read the face from the enlarged close-up\. Copy exactly: face shape, eyes/m,
    );
    // 카드가 아닌 사람은 예전 줄 그대로
    assert.match(text, /^- The THIRD attached image is "엄마" — 엄마's exact face and hair\. Copy exactly: face shape/m);
    assert.match(text, /Ignore each portrait's white background, standing pose and framing \(and the side-by-side layout of a two-panel portrait\): draw the person/);
  });

  it("카드가 없으면 글자 하나 다르지 않다", () => {
    assert.deepEqual(portraitBindingLines(r.order, ["하온", "엄마"], new Set()), portraitBindingLines(r.order, ["하온", "엄마"]));
  });
});

describe("pageReferenceLabels — 붙이는 그림마다 앞에 끼우는 이름표", () => {
  it("order 와 같은 길이·같은 순서, 서수가 프롬프트와 같다", () => {
    const r = arrangePageReferences({
      sheet: "S",
      portraits: [
        { name: "우주", image: "P1" },
        { name: "할머니", image: "P2" },
      ],
      location: "L",
      style: "T",
    });
    const labels = pageReferenceLabels(r.order, new Set(["우주"]));
    assert.equal(labels.length, r.order.length);
    assert.match(labels[0], /^\[FIRST attached image\] The CHARACTER REFERENCE SHEET/);
    assert.match(labels[1], /^\[SECOND attached image\] 우주 — ONLY 우주: the original approved portrait of 우주, whole figure on the left and the same face enlarged on the right \(one person\)\. Copy 우주's face and hair from it\.$/);
    assert.equal(labels[2], "[THIRD attached image] 할머니 — ONLY 할머니: the original approved portrait of 할머니. Copy 할머니's face and hair from it.");
    assert.match(labels[3], /^\[FOURTH attached image\] The LOCATION REFERENCE SHEET/);
    assert.match(labels[4], /^\[FIFTH attached image\] A previously APPROVED page of this book — use it for the rendering style only, never for a face\.$/);
    // 프롬프트의 '몇 번째'와 같은 말
    for (const [i, key] of r.order.entries()) assert.ok(labels[i].startsWith(`[${refOrdinal(r.order, key)} attached image]`));
  });
});

describe("familyFramingLines — 가족 얼굴이 나오는 쪽은 가까운 구도", () => {
  it("넷 이상이면 허리 위로 가까이 모인 구도", () => {
    const lines = familyFramingLines(6, 6);
    assert.equal(lines.length, 2);
    assert.match(lines[0], /^GROUP FRAMING — 6 people are on this page. Frame them as a close, warm group: a medium shot from about the hips up/);
    assert.match(lines[0], /Never a wide shot with small full-body figures/);
    assert.equal(familyFramingLines(4, 1).length, 2);
  });

  it("셋 이하도 허리 위 구도가 기본 — 전신은 다리가 꼭 필요한 동작일 때만(2026-10-01 이목구비가 약하다)", () => {
    const one = familyFramingLines(1, 1);
    assert.match(one[0], /^FAMILY CLOSE FRAMING — the family member on this page must be recognisable by their face. Use a medium shot from about the waist up as the default/);
    const three = familyFramingLines(3, 2);
    assert.match(three[0], /^FAMILY CLOSE FRAMING — the family members on this page/);
    assert.match(three[1], /Show a whole body only when the action truly needs the legs/);
    assert.match(three[1], /Keep enough of the place visible behind them to recognise it.$/);
  });

  it("고정 가족이 없거나 사람이 없으면 아무 줄도 없다(예전 글 그대로)", () => {
    assert.deepEqual(familyFramingLines(3, 0), []);
    assert.deepEqual(familyFramingLines(6, 0), []);
    assert.deepEqual(familyFramingLines(0, 0), []);
  });

  it("검수는 가까운 구도를 받아들인다 — 구도 줄이 있을 때만", () => {
    assert.match(familyFramingCheckLines(familyFramingLines(2, 2))[0], /Do not fail because legs or feet are cropped/);
    assert.deepEqual(familyFramingCheckLines([]), []);
  });
});

describe("facialFeatureLines — 카드의 이목구비를 같은 모양·같은 정도로", () => {
  it("카드로 붙인 사람이 있으면 키운 얼굴에서, 점 눈·평균 얼굴 금지", () => {
    const [line] = facialFeatureLines(["우주", "아빠"], new Set(["우주"]));
    assert.ok(line.startsWith("FACIAL FEATURES — for 우주, 아빠, copy the features from the enlarged face close-up in their attached portrait: eye shape and size (single or double eyelid"), line);
    assert.match(line, /Draw them at the same level of detail as the portrait, never simpler — do not turn anyone.s eyes into generic dots/);
  });

  it("머리는 숱·결·앞머리 쏠림·색 농도까지 — 단정한 기본 머리로 정리하지 않게(2쪽 시험, 아들 머리)", () => {
    const lines = facialFeatureLines(["시우"], new Set(["시우"]));
    assert.equal(lines.length, 2);
    assert.match(lines[1], /^HAIR — for 시우, the hair is as much a part of who they are as the face/);
    assert.match(lines[1], /whether it is tousled and spiky or neat and smooth, the direction the fringe falls/);
    assert.match(lines[1], /a brown-haired child stays brown, not black\)\. Never tidy, smooth, flatten or restyle/);
  });

  it("카드가 없으면 붙인 원본에서, 원본을 안 붙였으면 아무 줄도 없다", () => {
    assert.match(facialFeatureLines(["엄마"])[0], /copy the features from their attached portrait:/);
    assert.deepEqual(facialFeatureLines([]), []);
  });
});

describe("readPortraitFigure — 요청 portraits 칸에서 키·머리 비율", () => {
  it("이름이 같은 줄을 찾고, 없으면 빈 칸", () => {
    const raw = [
      { name: "할머니", ref: "x", memberId: "m-1", heightCm: 152, headRatio: 5.2 },
      { name: " 우주 ", ref: "y", memberId: "child", heightCm: 112 },
    ];
    assert.deepEqual(readPortraitFigure(raw, "할머니"), raw[0]);
    assert.equal(readPortraitFigure(raw, "우주").heightCm, 112);
    assert.deepEqual(readPortraitFigure(raw, "아빠"), {});
    assert.deepEqual(readPortraitFigure(undefined, "할머니"), {});
    assert.deepEqual(readPortraitFigure([null, 3, "할머니"], "할머니"), {});
  });
});
