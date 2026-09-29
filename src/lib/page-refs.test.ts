import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  arrangePageReferences,
  fixedCheckDescription,
  fixedFamilyFaceLines,
  maxPagePortraits,
  ordinalWord,
  pickPagePortraits,
  portraitBindingLines,
  portraitKey,
  readSheetOrder,
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
  it("gemini-2.x 는 1장(참고 그림이 많으면 흐려진다), 3.x·OpenAI 는 4장", () => {
    assert.equal(maxPagePortraits({}), 1);
    assert.equal(maxPagePortraits({ GEMINI_IMAGE_MODEL: "gemini-2.5-flash-image" }), 1);
    assert.equal(maxPagePortraits({ GEMINI_IMAGE_MODEL: "gemini-3.1-flash-image" }), 4);
    assert.equal(maxPagePortraits({ IMAGE_PROVIDER: "openai" }), 4);
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
