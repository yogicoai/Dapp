import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  characterSheetPrompt,
  fixedAdultNotes,
  maxPortraitRefs,
  pickSheetPortraits,
  sheetReferences,
} from "./sheet-prompt.ts";

/*
 * 인물 시트 프롬프트 — 고정 얼굴(가족 캐릭터)을 붙일 때만 달라지고, 없으면 예전 그대로인지.
 */

/*
 * 고정 얼굴을 넣기 전(커밋 42a018d) api/character-sheet 라우트 코드로 뽑은 프롬프트 그대로.
 * 고정 얼굴이 없는 책은 이 글자와 한 글자도 달라지면 안 된다.
 */
const GOLDEN_ONE = [
  "Character reference sheet for a children's picture book, warm soft watercolor storybook illustration.",
  "Characters:",
  "- 하온: 5세 남자아이, 짧은 검은 머리, 노란 티셔츠",
  "The FIRST character is the child hero: a 5-year-old Korean boy. Draw a child of exactly that age — a small child's proportions and face, never older.",
  "The hero's appearance MUST match these traits exactly: straight black short hair, round glasses. Keep these traits visible and consistent — they are how the child recognizes themselves. Hair texture is a hard identity trait: straight hair must stay completely straight with no curls or perm volume; wave, natural curls, and permed curls must remain visually distinct and must never be substituted for one another.",
  "Draw EXACTLY 1 character, one per person listed above, arranged left to right in that order, evenly spaced and clearly separated.",
  "Each listed character appears exactly ONCE. Never repeat a character, never draw twins, never add anyone who is not on the list.",
  "DO NOT invent facial accessories or features for the ADULTS. Never add glasses, sunglasses, a beard, a moustache, a hat, earrings, a mole or a tattoo to any adult unless that exact item is written in their description above. These adults are the child's real family — a father wearing glasses he does not own makes the child fail to recognise him. Tell adults apart by HAIR LENGTH/STYLE and CLOTHING COLOUR only.",
  "LAYOUT — two rows on one simple plain white background.",
  "TOP ROW: each character full body, front view, standing, in the listed order.",
  "BOTTOM ROW: directly under each figure, a LARGE head-and-shoulders close-up of the SAME character (same face, same hair, same expression neutral-friendly), big enough that eyes, nose, mouth, eyebrows, face shape and fringe are sharp and easy to copy.",
  "The close-up must be the same person as the figure above it — identical design, just closer.",
  "Consistent character design to be reused across every page of the book.",
  "Wholesome, innocent, fully clothed, child-friendly.",
  "NO text, no letters, no labels in the image.",
].join("\n");

const GOLDEN_THREE = [
  "Character reference sheet for a children's picture book, warm soft watercolor storybook illustration.",
  "The FIRST attached image is the STYLE SAMPLE for this whole book. Copy its rendering exactly: medium, brush or line quality, edge softness, colour palette and saturation, shading method, paper/texture and finish.",
  "It is a style reference ONLY — do NOT draw the fox, do NOT copy its subject, pose or composition. Only the way it is painted carries over.",
  "Characters:",
  "- 하온: 5세 남자아이, 노란 티셔츠",
  "- 엄마: 어깨까지 오는 검은 머리, 연분홍 니트",
  "- 아빠: 주인공 아이",
  "The FIRST character is the child hero: a young Korean child. Draw a child of exactly that age — a small child's proportions and face, never older.",
  "Draw EXACTLY 3 characters, one per person listed above, arranged left to right in that order, evenly spaced and clearly separated.",
  "Each listed character appears exactly ONCE. Never repeat a character, never draw twins, never add anyone who is not on the list.",
  "Hair colour words in the adult descriptions below: 까만/까만색 = black, 짙은 갈색 = dark brown, 밝은 갈색 = light brown, 붉은 갈색 = auburn, 희끗희끗(한) = black with grey streaks, 회색 = grey, 하얀/흰머리 = white/silver.",
  "The adult \"엄마\" looks EXACTLY like this, chosen by the child's parent (Korean): 까만 단발머리, 안경 안 씀. Follow it literally — if it says they do not wear glasses, draw no glasses.",
  "The adult \"아빠\" looks EXACTLY like this, chosen by the child's parent (Korean): 짧은 머리. Follow it literally — if it says they do not wear glasses, draw no glasses.",
  "DO NOT invent facial accessories or features for the ADULTS. Never add glasses, sunglasses, a beard, a moustache, a hat, earrings, a mole or a tattoo to any adult unless that exact item is written in their description above. These adults are the child's real family — a father wearing glasses he does not own makes the child fail to recognise him. Tell adults apart by HAIR LENGTH/STYLE and CLOTHING COLOUR only.",
  "MAKE THEM UNMISTAKABLY DIFFERENT FROM EACH OTHER. This is the most important rule of this sheet.",
  "Give each character a clearly different hairstyle (length and shape) AND clearly different clothing colours. If two descriptions happen to be similar, push them apart — change one character's hair length and shirt colour so the two can never be confused.",
  "A reader glancing at this sheet must be able to tell instantly which character is which. Two characters that could be mistaken for the same child is a failure.",
  "These are Korean children. ALL of them have black or dark brown hair. Never draw blonde, golden, yellow, red, ginger, silver or light-coloured hair on any child, even if a description hints at it — read such a hint as a dark shade, not a light one. Tell them apart by HAIRSTYLE and CLOTHING COLOUR only.",
  "Follow each description's stated sex exactly. A character described as a boy is drawn as a boy with short hair; a character described as a girl is drawn as a girl. Never infer sex from the name.",
  "Draw every face LARGE and clearly readable — this sheet is the identity reference for every page of the book, so each character's eyes, nose, mouth, hair shape and face shape must be sharp enough to copy. Do not shrink the characters to fit; crop the composition tighter if needed.",
  "LAYOUT — two rows on one simple plain white background.",
  "TOP ROW: each character full body, front view, standing, in the listed order.",
  "BOTTOM ROW: directly under each figure, a LARGE head-and-shoulders close-up of the SAME character (same face, same hair, same expression neutral-friendly), big enough that eyes, nose, mouth, eyebrows, face shape and fringe are sharp and easy to copy.",
  "The close-up must be the same person as the figure above it — identical design, just closer.",
  "Consistent character design to be reused across every page of the book.",
  "Wholesome, innocent, fully clothed, child-friendly.",
  "NO text, no letters, no labels in the image.",
].join("\n");

const STYLE = "warm soft watercolor storybook illustration";
const ONE = {
  stylePrompt: STYLE,
  characters: [{ name: "하온", description: "5세 남자아이, 짧은 검은 머리, 노란 티셔츠" }],
  hero: "a 5-year-old Korean boy",
  looks: "straight black short hair, round glasses",
  adultLooks: [],
  styleSample: false,
  drawing: false,
};
const THREE = {
  stylePrompt: STYLE,
  characters: [
    { name: "하온", description: "5세 남자아이, 노란 티셔츠" },
    { name: "엄마", description: "어깨까지 오는 검은 머리, 연분홍 니트" },
    { name: "아빠", description: "" },
  ],
  hero: "a young Korean child",
  looks: "",
  adultLooks: [
    { name: "엄마", line: "까만 단발머리, 안경 안 씀" },
    { name: "아빠", line: "짧은 머리" },
  ],
  styleSample: true,
  drawing: false,
};

describe("characterSheetPrompt — 고정 얼굴이 없으면 예전 그대로", () => {
  it("한 명 · 생김새 있음", () => {
    assert.equal(characterSheetPrompt(ONE), GOLDEN_ONE);
    assert.equal(characterSheetPrompt({ ...ONE, portraits: [] }), GOLDEN_ONE);
  });

  it("세 명 · 엄마·아빠 생김새 · 그림체 견본", () => {
    assert.equal(characterSheetPrompt(THREE), GOLDEN_THREE);
    assert.equal(characterSheetPrompt({ ...THREE, portraits: [] }), GOLDEN_THREE);
  });
});

describe("characterSheetPrompt — 고정 얼굴", () => {
  const withLooks = { ...THREE, looks: "straight black bob" };
  const prompt = characterSheetPrompt({ ...withLooks, portraits: ["하온", "엄마"], fixedAdults: ["엄마"] });

  it("몇 번째 그림이 누구 얼굴인지 — 견본 다음부터, 등장인물 번호와 함께", () => {
    assert.match(prompt, /^FIXED FACES — /m);
    // 머리글에 아이 쪽 말('child's real family')을 쓰지 않는다 — 안전 검사(family-portrait-prompt 머리말)
    assert.doesNotMatch(prompt, /FIXED FACES — [^\n]*(child|family)/);
    assert.match(prompt, /The FIRST attached image is the STYLE SAMPLE/);
    assert.match(prompt, /- The SECOND attached image is the fixed portrait of "하온" \(character 1 in the list above\)\./);
    assert.match(prompt, /- The THIRD attached image is the fixed portrait of "엄마" \(character 2 in the list above\)\./);
    assert.match(prompt, /If anything else in this prompt — the character list above, [^\n]*the PORTRAIT wins\./);
    // 아빠는 고정 얼굴이 없다
    assert.doesNotMatch(prompt, /fixed portrait of "아빠"/);
  });

  it("문장이 말하는 순서와 붙이는 순서가 같다(sheetReferences)", () => {
    const refs = sheetReferences("견본", ["하온 얼굴", "엄마 얼굴"], null);
    assert.deepEqual(refs, ["견본", "하온 얼굴", "엄마 얼굴"]);
    const ordinals = ["FIRST", "SECOND", "THIRD"];
    assert.match(prompt, new RegExp(`The ${ordinals[refs.indexOf("하온 얼굴")]} attached image is the fixed portrait of "하온"`));
    assert.match(prompt, new RegExp(`The ${ordinals[refs.indexOf("엄마 얼굴")]} attached image is the fixed portrait of "엄마"`));
  });

  it("견본이 없으면 얼굴이 첫 번째, 아이 그림은 얼굴 뒤", () => {
    const p = characterSheetPrompt({ ...THREE, styleSample: false, drawing: true, portraits: ["엄마"] });
    assert.match(p, /- The FIRST attached image is the fixed portrait of "엄마"/);
    assert.match(p, /The SECOND attached image is a CHILD'S OWN DRAWING/);
    assert.deepEqual(sheetReferences(null, ["엄마 얼굴"], "아이 그림"), ["엄마 얼굴", "아이 그림"]);
  });

  it("가족 그림(늘 수채화)의 그림체가 아니라 이 책 그림체로 — 견본이 있으면 견본을 가리킨다", () => {
    assert.match(prompt, /The portraits decide WHO these people are, never HOW they are painted/);
    assert.match(prompt, /in the STYLE SAMPLE's rendering \(the FIRST attached image\)\./);
    assert.doesNotMatch(prompt, /Do NOT restyle, beautify, simplify/);
    const noSample = characterSheetPrompt({ ...THREE, styleSample: false, portraits: ["엄마"] });
    assert.match(noSample, /in this book's style described above\./);
  });

  it("주인공이 고정 얼굴이면 생김새 줄은 '그림이 이긴다'로 바뀐다", () => {
    assert.doesNotMatch(prompt, /The hero's appearance MUST match these traits exactly/);
    assert.match(prompt, /The hero's traits chosen by the parent: straight black bob\. The hero's attached portrait/);
    // 주인공이 고정 얼굴이 아니면 예전 줄 그대로
    const other = characterSheetPrompt({ ...withLooks, portraits: ["엄마"] });
    assert.match(other, /The hero's appearance MUST match these traits exactly: straight black bob\./);
  });

  it("고정 얼굴인 어른의 부모 줄은 옷에만 — 다른 어른은 예전 줄 그대로", () => {
    assert.match(prompt, /The adult "엄마" has a fixed portrait attached/);
    assert.doesNotMatch(prompt, /The adult "엄마" looks EXACTLY like this/);
    assert.match(prompt, /The adult "아빠" looks EXACTLY like this, chosen by the child's parent \(Korean\): 짧은 머리\./);
  });

  it("엄마·아빠 줄은 인물 이름 꼴이 아니라 붙은 얼굴의 사람 id 로 — '엄마 (지은)'·'어머니'도", () => {
    for (const name of ["엄마 (지은)", "지은(엄마)", "어머니", "하온이 엄마"]) {
      const p = characterSheetPrompt({
        ...THREE,
        characters: [THREE.characters[0], { name, description: "" }, THREE.characters[2]],
        portraits: [name],
        fixedAdults: fixedAdultNotes(["mom"]),
      });
      assert.match(p, /The adult "엄마" has a fixed portrait attached \(see FIXED FACES\)/, name);
      assert.doesNotMatch(p, /The adult "엄마" looks EXACTLY like this/, name);
      assert.match(p, /The adult "아빠" looks EXACTLY like this/, name);
    }
    // 이름이 '엄마'로 끝나도 붙은 얼굴이 엄마가 아니면(할머니 그림 …) 부모 줄은 예전 그대로
    const other = characterSheetPrompt({ ...THREE, portraits: ["엄마"], fixedAdults: fixedAdultNotes(["m-grandma0001"]) });
    assert.match(other, /The adult "엄마" looks EXACTLY like this/);
    // 얼굴이 하나도 안 붙었으면 fixedAdults 가 와도 예전 그대로
    assert.equal(characterSheetPrompt({ ...THREE, portraits: [], fixedAdults: ["엄마"] }), GOLDEN_THREE);
  });

  it("fixedAdultNotes — mom·dad 만, 한 번씩", () => {
    assert.deepEqual(fixedAdultNotes(["child", "mom", "m-aaaaaaaaaaaa", "dad", "mom"]), ["엄마", "아빠"]);
    assert.deepEqual(fixedAdultNotes([]), []);
  });

  it("안경·수염 금지와 '서로 다르게' 규칙이 고정 얼굴을 고치지 않게", () => {
    assert.match(prompt, /unless that exact item is written in their description above or clearly visible in their attached portrait\./);
    assert.match(prompt, /Characters with a fixed portrait keep their portrait face and hair exactly — never alter them to create contrast\./);
    assert.match(prompt, /separate them by CLOTHING COLOUR, and change hair only on a character whose hair is set neither by a portrait nor by the parent's chosen traits\./);
    // 주인공이 고정 얼굴이면 위 줄로 덮이고, 아니면 부모가 고른 주인공 머리도 지킨다고 적는다
    assert.doesNotMatch(prompt, /The hero also keeps the hair the parent chose\./);
    assert.match(characterSheetPrompt({ ...withLooks, portraits: ["엄마"] }), /The hero also keeps the hair the parent chose\./);
    assert.doesNotMatch(characterSheetPrompt({ ...THREE, portraits: ["엄마"] }), /The hero also keeps the hair/);
    // 나머지 규칙(인원 수·배치)은 그대로
    assert.match(prompt, /Draw EXACTLY 3 characters, one per person listed above/);
    assert.match(prompt, /LAYOUT — two rows on one simple plain white background\./);
  });
});

describe("pickSheetPortraits — 요청의 고정 얼굴 고르기", () => {
  const PREFIX = "https://yogibo.openhost.cafe24.com/app/img/dapp/family/0a1b2c3d-1111-2222-3333-444455556666/";
  const hex = "0123456789abcdef0123456789abcdef";
  const ref = (id: string, ts = "1759100000000") => `${PREFIX}${id}-${ts}-${hex}-ref.jpg`;
  const cast = [
    { name: "하온", description: "" },
    { name: "엄마", description: "" },
    { name: "할머니", description: "" },
  ];

  it("등장인물 순서로, 검사를 통과한 것만", () => {
    const got = pickSheetPortraits(
      [
        { name: "엄마", ref: ref("mom"), memberId: "mom" },
        { name: " 하온 ", ref: ref("child"), memberId: "child" },
      ],
      cast,
      PREFIX,
      4,
    );
    assert.deepEqual(
      got.portraits.map((p) => [p.name, p.index]),
      [
        ["하온", 0],
        ["엄마", 1],
      ],
    );
    assert.equal(got.portraits[0].url, ref("child"));
    // 사람 id 는 요청 값이 아니라 파일 이름에서 읽는다
    assert.deepEqual(
      got.portraits.map((p) => p.memberId),
      ["child", "mom"],
    );
    assert.equal(got.rejected, 0);
    assert.equal(got.dropped, 0);
  });

  it("등장인물에 없는 이름 · 남의 폴더 · PNG · 사람 id 가 다른 파일은 받지 않는다", () => {
    const other = PREFIX.replace("0a1b2c3d", "ffffffff");
    const got = pickSheetPortraits(
      [
        { name: "이모", ref: ref("m-aaaaaaaaaaaa"), memberId: "m-aaaaaaaaaaaa" },
        { name: "하온", ref: `${other}child-1759100000000-${hex}-ref.jpg`, memberId: "child" },
        { name: "엄마", ref: ref("mom").replace("-ref.jpg", ".png"), memberId: "mom" },
        { name: "할머니", ref: ref("dad"), memberId: "m-bbbbbbbbbbbb" },
        { name: "할머니", ref: ref("mom"), memberId: "BAD ID" },
        { name: "할머니", ref: 42 },
        "하온",
      ],
      cast,
      PREFIX,
      4,
    );
    assert.deepEqual(got.portraits, []);
    assert.equal(got.rejected, 7);
  });

  it("같은 이름·같은 주소는 한 번만", () => {
    const got = pickSheetPortraits(
      [
        { name: "하온", ref: ref("child") },
        { name: "하온", ref: ref("child", "1759100000001") },
        { name: "엄마", ref: ref("child") },
      ],
      cast,
      PREFIX,
      4,
    );
    assert.deepEqual(
      got.portraits.map((p) => [p.name, p.memberId]),
      [["하온", "child"]],
    );
    assert.equal(got.rejected, 2);
  });

  it("상한을 넘으면 뒤 인물부터 뺀다", () => {
    const got = pickSheetPortraits(
      [
        { name: "할머니", ref: ref("m-cccccccccccc") },
        { name: "엄마", ref: ref("mom") },
        { name: "하온", ref: ref("child") },
      ],
      cast,
      PREFIX,
      2,
    );
    assert.deepEqual(
      got.portraits.map((p) => p.name),
      ["하온", "엄마"],
    );
    assert.equal(got.dropped, 1);
  });

  it("설정이 없거나(prefix null) 배열이 아니면 아무것도 안 붙인다", () => {
    assert.deepEqual(pickSheetPortraits([{ name: "하온", ref: ref("child") }], cast, null, 4).portraits, []);
    assert.deepEqual(pickSheetPortraits(undefined, cast, PREFIX, 4), { portraits: [], rejected: 0, dropped: 0 });
    assert.deepEqual(pickSheetPortraits("하온", cast, PREFIX, 4), { portraits: [], rejected: 0, dropped: 0 });
  });
});

describe("maxPortraitRefs — 모델마다 붙일 얼굴 수", () => {
  it("gemini-2.x 는 2장, 3.x·OpenAI 는 4장", () => {
    assert.equal(maxPortraitRefs({}), 2);
    assert.equal(maxPortraitRefs({ GEMINI_IMAGE_MODEL: "gemini-2.5-flash-image" }), 2);
    assert.equal(maxPortraitRefs({ GEMINI_IMAGE_MODEL: "gemini-3.1-flash-image" }), 4);
    assert.equal(maxPortraitRefs({ GEMINI_IMAGE_MODEL: "gemini-3-pro-image-preview" }), 4);
    assert.equal(maxPortraitRefs({ IMAGE_PROVIDER: "openai", GEMINI_IMAGE_MODEL: "gemini-2.5-flash-image" }), 4);
  });
});

describe("characterSheetPrompt — 원본 픽셀 시트의 '나머지 사람들만' 그리기(lib/sheet-compose)", () => {
  const MIXED = {
    ...THREE,
    characters: [{ name: "서연", description: "5세 여자아이, 양갈래 머리, 초록 원피스" }],
    looks: "straight black bob",
    adultLooks: [{ name: "아빠", line: "짧은 머리" }],
    alreadyDrawn: [
      { name: "하온", description: "5세 남자아이, 노란 티셔츠" },
      { name: "엄마", description: "" },
    ],
  };

  it("주인공이 고정 가족이면 '첫 사람이 주인공' 줄과 아이 생김새 줄이 없다", () => {
    const p = characterSheetPrompt({ ...MIXED, heroOnSheet: false });
    assert.doesNotMatch(p, /The FIRST character is the child hero/);
    assert.doesNotMatch(p, /straight black bob/);
    assert.match(p, /Draw EXACTLY 1 character, one per person listed above/);
    assert.match(p, /^- 서연: 5세 여자아이/m);
  });

  it("따로 서는 고정 가족은 그리지 말라고, 'EXACTLY N명' 줄 뒤에 — 그들과 다르게", () => {
    const p = characterSheetPrompt({ ...MIXED, heroOnSheet: false });
    const exactly = p.indexOf("Draw EXACTLY 1 character");
    const block = p.indexOf("OTHER PEOPLE IN THIS BOOK — ALREADY PAINTED separately");
    assert.ok(exactly >= 0 && block > exactly);
    assert.match(p, /^- 하온: 5세 남자아이, 노란 티셔츠$/m);
    assert.match(p, /^- 엄마$/m);
    assert.match(p, /never draw them, not even in the background/);
    assert.match(p, /clearly different from them in hairstyle and clothing colour/);
    // 얼굴을 붙이지 않은 그림 — 고정 얼굴 줄은 없다
    assert.doesNotMatch(p, /FIXED FACES/);
  });

  it("가족 그림에서 잰 옷 색이 있으면 설명 글의 옷보다 그것을 — 없으면 줄은 그대로", () => {
    const p = characterSheetPrompt({
      ...MIXED,
      heroOnSheet: false,
      alreadyDrawn: [
        { name: "하온", description: "5세 남자아이, 노란 티셔츠", outfit: "pale blue (#c7dadc)" },
        { name: "엄마", description: "", outfit: null },
      ],
    });
    assert.match(
      p,
      /^- 하온: 5세 남자아이, 노란 티셔츠 — in their finished picture they wear mostly pale blue \(#c7dadc\); this overrides any clothing named here$/m,
    );
    assert.match(p, /^- 엄마$/m);
  });

  it("주인공이 나머지 쪽이면(고정 안 함) 주인공 줄은 그대로", () => {
    const p = characterSheetPrompt({ ...MIXED, heroOnSheet: true });
    assert.match(p, /The FIRST character is the child hero/);
    assert.match(p, /The hero's appearance MUST match these traits exactly: straight black bob/);
  });

  it("새 칸을 안 주거나 기본값이면 예전 글자 그대로", () => {
    assert.equal(characterSheetPrompt({ ...THREE, heroOnSheet: true, alreadyDrawn: [] }), GOLDEN_THREE);
    assert.equal(characterSheetPrompt({ ...ONE, heroOnSheet: true }), GOLDEN_ONE);
  });
});
