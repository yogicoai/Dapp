import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { illustrationCheckParts, type IllustrationCheckInput } from "./gemini.ts";

/*
 * 쪽 그림 검수 요청(validateIllustration) — 고정 가족 원본 그림을 붙일 때만 달라지고, 없으면 예전 그대로인지.
 * 아래 GOLDEN 은 illustrationCheckParts 로 떼어 내기 **전의** validateIllustration 이 실제로 보낸 요청 본문을
 * 가짜 fetch 로 받아 적은 것이다(2026-09-29). 원본 그림이 없는 쪽은 이 글자와 한 글자도 달라지면 안 된다.
 */

const img = (data: string) => ({ mimeType: "image/png", data });

const GOLDEN_A = [
  "You are checking a generated children's-book page for factual illustration errors.",
  "The FIRST attached image is the generated page to check. The SECOND attached image is the whole-book character reference sheet. The THIRD attached image is a previously approved page from this same book — the authoritative rendering-style reference. The FOURTH attached image is the LOCATION reference sheet for this page's place (the place itself, with no people) — its architecture, ground, landmark and colours are mandatory.",
  "Scene instruction: 등장인물 2명: 하온, 엄마. 장소: 거실 — 노란 소파.",
  "Story text: 하온이가 웃었어요.",
  "MANDATORY EXPECTED LOCATION: 거실: 노란 소파. The generated page must visibly depict this exact kind of place.",
  "Expected visible people: exactly 2.",
  "Expected cast:",
  "1. 하온: 5세 남자아이 (fixed family face — judge face and hair against the reference sheet, not this text)",
  "2. 엄마: 단발머리",
  "Required illustration style: warm soft watercolor storybook illustration.",
  "FAIL for any readable or pseudo-readable writing inside the artwork: captions, subtitles, story sentences, English or Korean letters, numbers, labels, signs, logos, signatures, speech bubbles or watermarks. The page must be image-only.",
  "FAIL if the setting contradicts the mandatory expected location. A home/playroom cannot be shown as a forest path, park, hanok courtyard, classroom or generic outdoor landscape. A park cannot be shown as an indoor room. Do not accept a metaphorical or merely pretty substitute for the named place.",
  "The expected location is INDOORS. FAIL if the scene is drawn outdoors, on a street or sidewalk, in front of a shop, or if indoor shelves/furniture stand outside, or if the inside and the outside of a building are combined in one picture (more than a small window view of outdoors).",
  "For a recurring place, FAIL if its fixed architecture, wall/floor colours, windows, large furniture or play equipment visibly change from the approved same-location reference.",
  "A LOCATION reference sheet is attached: the page must clearly be the same place as that sheet — same kind of ground, same big landmark, same wall/floor colours and layout. A different camera angle is fine; a different place, a different landmark or different colours is a FAIL.",
  "FAIL for wrong number of people, an extra/background person, a duplicated person, a missing expected person, identities/outfits swapped, or any visible change from the character reference in face construction, hair shape/colour, clothing design/colour, shoes or accessories.",
  "FAIL for any rendering-style drift from the references: 3D/clay to flat 2D, 2D to 3D, watercolor to vector/anime, different line quality, texture, shading, saturation or finish. Treat the approved-page style as mandatory, not optional.",
  "FAIL if a named character performs or occupies the clearly wrong action or place.",
  "RULE ONE",
  "RULE TWO",
  "FAIL if the characters are split across a barrier: one indoors and another outdoors, one behind glass looking in, or separated by a window frame, doorway, fence or railing — unless the scene explicitly says they are apart. They must share one space.",
  "Also FAIL if the artwork is presented as a page, print, card, panel, framed picture or smaller image inside the canvas; if any white/unpainted margin, border, gutter, strip, rounded-corner frame or letterbox is visible at ANY outer edge; or if the illustration does not fill the canvas edge to edge.",
  "Do not fail for harmless camera-angle or minor pose differences, but location identity, character identity, readable text and rendering medium are never harmless.",
  "Before replying, check in this order: (1) no writing, (2) exact people, (3) exact named location, (4) character match, (5) rendering-style match, (6) everyone in one shared space, (7) the main-child and seat-belt rules above. Reply PASS only if all seven pass. Otherwise reply FAIL: followed by a short concrete correction instruction in English.",
].join("\n");

const GOLDEN_B = [
  "You are checking a generated children's-book page for factual illustration errors.",
  "The FIRST attached image is the generated page to check.",
  "Scene instruction: 빈 놀이터",
  "",
  "Expected visible people: exactly 0.",
  "No person should be visible.",
  "Required illustration style: flat vector.",
  "FAIL for any readable or pseudo-readable writing inside the artwork: captions, subtitles, story sentences, English or Korean letters, numbers, labels, signs, logos, signatures, speech bubbles or watermarks. The page must be image-only.",
  "FAIL if the setting contradicts the mandatory expected location. A home/playroom cannot be shown as a forest path, park, hanok courtyard, classroom or generic outdoor landscape. A park cannot be shown as an indoor room. Do not accept a metaphorical or merely pretty substitute for the named place.",
  "",
  "For a recurring place, FAIL if its fixed architecture, wall/floor colours, windows, large furniture or play equipment visibly change from the approved same-location reference.",
  "",
  "FAIL for wrong number of people, an extra/background person, a duplicated person, a missing expected person, identities/outfits swapped, or any visible change from the character reference in face construction, hair shape/colour, clothing design/colour, shoes or accessories.",
  "FAIL for any rendering-style drift from the references: 3D/clay to flat 2D, 2D to 3D, watercolor to vector/anime, different line quality, texture, shading, saturation or finish. Treat the approved-page style as mandatory, not optional.",
  "FAIL if a named character performs or occupies the clearly wrong action or place.",
  "FAIL if the characters are split across a barrier: one indoors and another outdoors, one behind glass looking in, or separated by a window frame, doorway, fence or railing — unless the scene explicitly says they are apart. They must share one space.",
  "Also FAIL if the artwork is presented as a page, print, card, panel, framed picture or smaller image inside the canvas; if any white/unpainted margin, border, gutter, strip, rounded-corner frame or letterbox is visible at ANY outer edge; or if the illustration does not fill the canvas edge to edge.",
  "Do not fail for harmless camera-angle or minor pose differences, but location identity, character identity, readable text and rendering medium are never harmless.",
  "Before replying, check in this order: (1) no writing, (2) exact people, (3) exact named location, (4) character match, (5) rendering-style match, (6) everyone in one shared space, (7) the main-child and seat-belt rules above. Reply PASS only if all seven pass. Otherwise reply FAIL: followed by a short concrete correction instruction in English.",
].join("\n");

const GOLDEN_C = [
  "You are checking a generated children's-book page for factual illustration errors.",
  "The FIRST attached image is the generated page to check. The SECOND attached image is the whole-book character reference sheet.",
  "Scene instruction: 하온이가 뛴다",
  "",
  "Expected visible people: exactly 1.",
  "Expected cast:",
  "1. 하온: ",
  "Required illustration style: warm soft watercolor storybook illustration.",
  "FAIL for any readable or pseudo-readable writing inside the artwork: captions, subtitles, story sentences, English or Korean letters, numbers, labels, signs, logos, signatures, speech bubbles or watermarks. The page must be image-only.",
  "FAIL if the setting contradicts the mandatory expected location. A home/playroom cannot be shown as a forest path, park, hanok courtyard, classroom or generic outdoor landscape. A park cannot be shown as an indoor room. Do not accept a metaphorical or merely pretty substitute for the named place.",
  "The expected location is OUTDOORS. FAIL if the scene is drawn inside a room or building.",
  "For a recurring place, FAIL if its fixed architecture, wall/floor colours, windows, large furniture or play equipment visibly change from the approved same-location reference.",
  "",
  "FAIL for wrong number of people, an extra/background person, a duplicated person, a missing expected person, identities/outfits swapped, or any visible change from the character reference in face construction, hair shape/colour, clothing design/colour, shoes or accessories.",
  "FAIL for any rendering-style drift from the references: 3D/clay to flat 2D, 2D to 3D, watercolor to vector/anime, different line quality, texture, shading, saturation or finish. Treat the approved-page style as mandatory, not optional.",
  "FAIL if a named character performs or occupies the clearly wrong action or place.",
  "FAIL if the characters are split across a barrier: one indoors and another outdoors, one behind glass looking in, or separated by a window frame, doorway, fence or railing — unless the scene explicitly says they are apart. They must share one space.",
  "Also FAIL if the artwork is presented as a page, print, card, panel, framed picture or smaller image inside the canvas; if any white/unpainted margin, border, gutter, strip, rounded-corner frame or letterbox is visible at ANY outer edge; or if the illustration does not fill the canvas edge to edge.",
  "Do not fail for harmless camera-angle or minor pose differences, but location identity, character identity, readable text and rendering medium are never harmless.",
  "Before replying, check in this order: (1) no writing, (2) exact people, (3) exact named location, (4) character match, (5) rendering-style match, (6) everyone in one shared space, (7) the main-child and seat-belt rules above. Reply PASS only if all seven pass. Otherwise reply FAIL: followed by a short concrete correction instruction in English.",
].join("\n");

const INPUT_A: IllustrationCheckInput = {
  image: img("PAGE"),
  reference: img("SHEET"),
  styleReference: img("STYLE"),
  locationReference: img("LOC"),
  indoor: true,
  scene: "등장인물 2명: 하온, 엄마. 장소: 거실 — 노란 소파.\nStory text: 하온이가 웃었어요.",
  expectedLocation: "거실: 노란 소파",
  cast: [
    { name: "하온", description: "5세 남자아이 (fixed family face — judge face and hair against the reference sheet, not this text)" },
    { name: "엄마", description: "단발머리" },
  ],
  stylePrompt: "warm soft watercolor storybook illustration",
  extraRules: ["RULE ONE", "RULE TWO"],
};
const INPUT_B: IllustrationCheckInput = { image: img("PAGE"), scene: "빈 놀이터", cast: [], stylePrompt: "flat vector" };
const INPUT_C: IllustrationCheckInput = {
  image: img("PAGE"),
  reference: img("SHEET"),
  indoor: false,
  scene: "하온이가 뛴다",
  expectedLocation: "",
  cast: [{ name: "하온", description: "" }],
  stylePrompt: "warm soft watercolor storybook illustration",
};

type Parts = ({ inlineData: { data: string } } | { text: string })[];
const imagesOf = (parts: unknown[]) =>
  (parts as Parts).flatMap((p) => ("inlineData" in p ? [p.inlineData.data] : []));
const textOf = (parts: unknown[]) => (parts as Parts).flatMap((p) => ("text" in p ? [p.text] : [])).join("");

describe("illustrationCheckParts — 원본 그림이 없으면 예전 요청 그대로", () => {
  it("참조 넷 · 실내 · 쪽 규칙", () => {
    const parts = illustrationCheckParts(INPUT_A);
    assert.deepEqual(imagesOf(parts), ["PAGE", "SHEET", "STYLE", "LOC"]);
    assert.equal(textOf(parts), GOLDEN_A);
    assert.equal(textOf(illustrationCheckParts({ ...INPUT_A, portraits: [] })), GOLDEN_A);
    assert.equal(textOf(illustrationCheckParts({ ...INPUT_A, sheetOrder: null })), GOLDEN_A);
    assert.equal(textOf(illustrationCheckParts({ ...INPUT_A, sheetOrder: [] })), GOLDEN_A);
    // 시트가 없으면 순서가 와도 말하지 않는다
    assert.equal(textOf(illustrationCheckParts({ ...INPUT_B, sheetOrder: ["하온"] })), GOLDEN_B);
  });

  it("사람 없음 · 참조 없음", () => {
    const parts = illustrationCheckParts(INPUT_B);
    assert.deepEqual(imagesOf(parts), ["PAGE"]);
    assert.equal(textOf(parts), GOLDEN_B);
  });

  it("시트만 · 실외", () => {
    const parts = illustrationCheckParts(INPUT_C);
    assert.deepEqual(imagesOf(parts), ["PAGE", "SHEET"]);
    assert.equal(textOf(parts), GOLDEN_C);
  });
});

describe("illustrationCheckParts — 고정 가족 원본 그림과 얼굴 견주기", () => {
  const withFaces: IllustrationCheckInput = {
    ...INPUT_A,
    portraits: [
      { name: "하온", image: img("FACE-HAON") },
      { name: "엄마", image: img("FACE-MOM") },
    ],
  };
  const parts = illustrationCheckParts(withFaces);
  const text = textOf(parts);

  it("원본 그림은 시트 바로 뒤에, 이름과 함께 — 서수는 넷째를 넘어간다", () => {
    assert.deepEqual(imagesOf(parts), ["PAGE", "SHEET", "FACE-HAON", "FACE-MOM", "STYLE", "LOC"]);
    assert.match(text, /The THIRD attached image is the ORIGINAL approved portrait of "하온" — the identity reference for 하온's face and hair/);
    assert.match(text, /The FOURTH attached image is the ORIGINAL approved portrait of "엄마"/);
    assert.match(text, /The FIFTH attached image is a previously approved page from this same book/);
    assert.match(text, /The SIXTH attached image is the LOCATION reference sheet/);
  });

  it("얼굴이 확실히 다를 때만 떨어뜨린다 — 자세·표정·옷·작은 얼굴로는 떨어뜨리지 않는다", () => {
    assert.match(text, /^FIXED FAMILY FACES — an approved ORIGINAL portrait is attached for: 하온, 엄마\. FAIL if any of them is visible with a face or hair that clearly differs from their portrait/m);
    for (const feature of ["face shape or eye shape", "hairstyle, hair length, fringe or parting", "straight/curly texture", "glasses or a beard added or removed", "apparent age"]) {
      assert.ok(text.includes(feature), feature);
    }
    assert.match(text, /Do NOT fail for pose, expression, head angle or a mirrored\/turned view \(a parting or fringe that falls on the other side because the head is turned\), lighting, size, brush texture, the portrait's white background or standing pose, clothing \(clothing is judged against the reference sheet\)/);
    // 장면이 모자·목도리·수영모·목욕·잠자리로 머리를 가리면 보이는 머리만 본다(눈 오는 날 모자 쓴 하온이를 떨어뜨리지 않게)
    assert.match(text, /or hair that is covered, tucked, tied up or wet because the scene gives them a hat, hood, helmet, scarf, swim cap, bath or bed — judge only the hair that is visible\./);
    assert.match(text, /If a face is too small, hidden or turned away to judge, do not fail on it\./);
    assert.match(text, /\(4\) character match \(fixed family faces against their attached portraits\)/);
  });

  it("짠 시트의 칸 순서를 붙임 그림 줄 바로 뒤에 한 줄로 — 그 밖은 그대로", () => {
    const withOrder = textOf(illustrationCheckParts({ ...INPUT_A, sheetOrder: ["하온", "엄마", "서연"] }));
    const lines = withOrder.split("\n");
    assert.equal(
      lines[2],
      "The character reference sheet shows, left to right: 1. 하온, 2. 엄마, 3. 서연 (each column: full figure on top, close-up below). Match each person on the page to their own column by this order.",
    );
    assert.equal([...lines.slice(0, 2), ...lines.slice(3)].join("\n"), GOLDEN_A);
  });

  it("원본 그림을 빼면 얼굴 줄도 빠지고 나머지는 예전과 같다", () => {
    const withoutFaceLines = text
      .split("\n")
      .filter((l) => !l.startsWith("FIXED FAMILY FACES — "))
      .join("\n")
      .replace(" (fixed family faces against their attached portraits)", "")
      .replace(/ The THIRD attached image is the ORIGINAL[^.]*\(ignore its white background, standing pose and clothing\)\. The FOURTH attached image is the ORIGINAL[^.]*\(ignore its white background, standing pose and clothing\)\./, "")
      .replace("The FIFTH attached image is a previously", "The THIRD attached image is a previously")
      .replace("The SIXTH attached image is the LOCATION", "The FOURTH attached image is the LOCATION");
    assert.equal(withoutFaceLines, GOLDEN_A);
  });
});
