import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PHOTO_FALLBACK_MIN_MS,
  buildPrompt,
  cardFor,
  headRedrawPrompt,
  headRedrawRecipe,
  photoFallbackPlan,
  photoRefused,
  portraitReferences,
  type PortraitInput,
} from "./family-portrait-prompt.ts";
import { headChartRatio, type HeadFix } from "./family-head.ts";
import { GeminiError } from "./gemini.ts";

const CARD = [
  "- gender: man",
  "- age: late 30s",
  "- distinctive: long narrow face, deep-set eyes",
  "- face shape: long oval, narrow",
  "- eyes: single eyelid, narrow, slightly upturned",
  "- hair: short straight black hair, side parting",
  "- glasses: thin round black metal frame",
].join("\n");

function person(role: PortraitInput["role"], extra: Partial<PortraitInput> = {}): PortraitInput {
  return { memberId: "m-1", role, callName: "아빠", looks: "", ...extra };
}

/** 사진 갈래(사진 + 그림체 견본, 같은 가족 그림은 받아 두었어도 안 붙는다) */
const PHOTO = portraitReferences({ photo: "P", sample: "S", sibling: "B" }).attached;
/** 칩·대신 그리기 갈래(그림체 견본 + 같은 가족 그림) */
const NO_PHOTO = portraitReferences({ photo: null, sample: "S", sibling: "B" }).attached;

/** 실제 사람 사진과 섞이면 안전 검사에 걸리기 쉬운 아이 쪽 말 */
const CHILD_FRAMING = /\bchild|children|\bkid|innocent|fully clothed|real family/i;

const ADULTS: PortraitInput[] = [
  person("mom", { callName: "엄마" }),
  person("dad"),
  person("grandma", { callName: "할머니" }),
  person("grandpa", { callName: "할아버지" }),
  person("sibling", { callName: "형", age: 25, gender: "boy" }),
  person("friend", { callName: "친구", age: 30 }),
];

describe("portraitReferences — 붙이는 참고 그림과 순서", () => {
  it("사진이 있으면 사진이 첫째, 그림체 견본이 둘째 — 같은 가족 그림은 받아 두었어도 붙이지 않는다", () => {
    const r = portraitReferences({ photo: "P", sample: "S", sibling: "B" });
    assert.deepEqual(r.images, ["P", "S"]);
    assert.deepEqual(r.attached, { photo: true, closeUp: false, sample: true, sibling: false, guide: false });
  });

  it("사진이 없으면(칩·대신 그리기) 예전 그대로 그림체 견본 → 같은 가족 그림", () => {
    assert.deepEqual(portraitReferences({ photo: null, sample: "S", sibling: "B" }).images, ["S", "B"]);
    assert.deepEqual(portraitReferences({ photo: null, sample: null, sibling: "B" }).images, ["B"]);
  });

  it("견본을 못 받았으면 사진 하나만", () => {
    const r = portraitReferences({ photo: "P", sample: null, sibling: "B" });
    assert.deepEqual(r.images, ["P"]);
    assert.deepEqual(r.attached, { photo: true, closeUp: false, sample: false, sibling: false, guide: false });
  });
});

describe("얼굴 클로즈업(closeUp) — 사진 바로 뒤, 사진이 있을 때만", () => {
  const all = { photo: "P", closeUp: "C", sample: "S", sibling: "B", guide: "G" };

  it("붙이는 순서 — 사진 → 클로즈업 → 견본 → 비율 견본, 빠진 것은 건너뛴다", () => {
    const r = portraitReferences(all);
    assert.deepEqual(r.images, ["P", "C", "S", "G"]);
    assert.deepEqual(r.attached, { photo: true, closeUp: true, sample: true, sibling: false, guide: true });
    assert.deepEqual(portraitReferences({ ...all, guide: null }).images, ["P", "C", "S"]);
    assert.deepEqual(portraitReferences({ ...all, sample: null }).images, ["P", "C", "G"]);
    assert.deepEqual(portraitReferences({ ...all, sample: null, guide: null }).images, ["P", "C"]);
    assert.deepEqual(portraitReferences({ ...all, closeUp: null }).images, ["P", "S", "G"]);
  });

  it("사진이 없으면(칩·대신 그리기) 클로즈업을 받아 두었어도 붙이지 않는다 — 사진에서 자른 얼굴만 따로 가지 않게", () => {
    const r = portraitReferences({ ...all, photo: null });
    assert.deepEqual(r.images, ["S", "B", "G"]);
    assert.equal(r.attached.closeUp, false);
    const p = buildPrompt(person("dad"), r.attached, CARD);
    assert.ok(!p.includes("close-up"), p);
  });

  it("프롬프트 몇 번째 — 클로즈업·견본·비율 견본 있음/없음 모두 붙인 순서와 맞는다", () => {
    const cases: [Partial<Record<keyof typeof all, null>>, string[]][] = [
      [{}, ["photo", "closeUp", "sample", "guide"]],
      [{ guide: null }, ["photo", "closeUp", "sample"]],
      [{ sample: null }, ["photo", "closeUp", "guide"]],
      [{ closeUp: null }, ["photo", "sample", "guide"]],
      [{ closeUp: null, guide: null }, ["photo", "sample"]],
    ];
    const label: Record<string, RegExp> = {
      photo: /(\w+) image = a reference PHOTO/,
      closeUp: /(\w+) image = a close-up of the same person's face, cropped and enlarged from the (\w+) image/,
      sample: /(\w+) image = painting-style sample/,
      guide: /(\w+) image = PROPORTION GUIDE only/,
    };
    const ORD = ["FIRST", "SECOND", "THIRD", "FOURTH"];
    for (const [drop, order] of cases) {
      const r = portraitReferences({ ...all, ...drop });
      const p = buildPrompt(person("dad"), r.attached, CARD);
      for (const [kind, re] of Object.entries(label)) {
        const hit = re.exec(p);
        const at = order.indexOf(kind);
        if (at < 0) assert.equal(hit, null, `${kind} 없음: ${JSON.stringify(drop)}`);
        else assert.equal(hit?.[1], ORD[at], `${kind}: ${JSON.stringify(drop)}`);
        // 클로즈업 줄은 사진이 몇 번째인지도 맞게 가리킨다
        if (kind === "closeUp" && hit) assert.equal(hit[2], "FIRST");
      }
      assert.ok(!p.includes("FIFTH"));
      if (order.includes("guide")) {
        assert.match(p, new RegExp(`The ${ORD[order.indexOf("guide")]} image \\(proportion guide\\)`));
      }
    }
  });

  it("클로즈업 줄 — 같은 사람 한 명·전신 구도, 닮음 출처와 '가져오지 말 것'에도 클로즈업이 든다", () => {
    const p = buildPrompt(person("dad"), portraitReferences(all).attached, CARD);
    assert.match(p, /use it for the exact face: face shape, eyes, eyebrows, nose, mouth, cheeks, jaw, hairline and fringe\./);
    // 머리 길이·전체 머리 모양은 사진에서 — 클로즈업은 머리를 자른다(긴 머리가 단발로 짧아지지 않게)
    assert.match(p, /Hair length and the overall hairstyle come from the FIRST image \(the crop cuts the hair off\)\./);
    // 얼굴도 수채화로 — 사진 같은 피부 결·빛·그늘을 가져오지 않는다
    assert.match(p, /Paint that face in the same watercolor style as the rest of the figure — take only its features, never its photographic skin texture, lighting or shadows\./);
    assert.match(
      p,
      /It is the same single person, not a second person, and its tight crop is neither the composition nor the head size — still paint one full-body figure at the PROPORTIONS head-to-height ratio\./,
    );
    assert.match(p, /LIKENESS from the photo, its face close-up and the LIKENESS SPEC — /);
    assert.match(p, /Keep the face proportions faithful to the photo and its face close-up/);
    assert.match(p, /From the photo and the close-up NEVER copy:/);
    // 클로즈업이 없으면 예전 글 그대로
    const plain = buildPrompt(person("dad"), portraitReferences({ ...all, closeUp: null }).attached, CARD);
    assert.ok(!plain.includes("close-up"), plain);
    assert.match(plain, /LIKENESS from the photo and the LIKENESS SPEC — /);
    assert.match(plain, /From the photo NEVER copy:/);
  });

  it("어른 사진 + 클로즈업이어도 아이 쪽 말이 없다", () => {
    for (const who of ADULTS) {
      const p = buildPrompt(who, portraitReferences(all).attached, CARD);
      const hit = CHILD_FRAMING.exec(p);
      assert.equal(hit, null, `${who.role}: '${hit?.[0]}'`);
    }
  });
});

describe("LIKENESS FIRST — 사진·카드 갈래 맨 앞(첫 줄 바로 뒤), 칩 갈래에는 없다", () => {
  const withCloseUp = portraitReferences({ photo: "P", closeUp: "C", sample: "S", sibling: "B", guide: "G" }).attached;
  const cardRefs = portraitReferences({ photo: null, sample: "S", sibling: "B", guide: "G" }).attached;

  it("사진 갈래 — 둘째 줄, 참고 그림 줄들보다 앞, 두드러진 특징 줄을 가리키고 사진·클로즈업을 출처로", () => {
    const p = buildPrompt(person("dad"), withCloseUp, CARD);
    const lines = p.split("\n");
    assert.match(lines[1], /^LIKENESS FIRST — top priority: anyone who knows the person in the reference photo must recognise this exact person at a glance from the painting alone\./);
    assert.ok(p.indexOf("LIKENESS FIRST") < p.indexOf("FIRST image ="));
    assert.match(lines[1], /Keep their distinctive traits \(the 'distinctive' line of the LIKENESS SPEC below\) clearly visible/);
    assert.match(lines[1], /keep the face shape, eye shape, size and spacing, eyebrows, nose, mouth, cheeks, jaw, hairline and hairstyle as in the photo, with the face details from its face close-up\./);
    assert.match(lines[1], /The watercolor picture-book style changes only the rendering \(brushwork, soft washes\), never who they are\./);
  });

  it("또렷이 ≠ 과장 — 실제 그대로(캐리커처 금지), 머리 크기는 PROPORTIONS 줄에서만(얼굴을 보이려 머리를 키우지 않게)", () => {
    const cardRefs2 = portraitReferences({ photo: null, sample: "S", sibling: null, guide: "G" }).attached;
    for (const who of [person("dad"), person("child", { callName: "하온", age: 6, gender: "girl" })]) {
      for (const refs of [withCloseUp, cardRefs2]) {
        for (const card of [CARD, null]) {
          const p = buildPrompt(who, refs, card);
          if (!p.includes("LIKENESS FIRST")) continue; // 카드 없이 사진도 없으면 칩 갈래
          const line = p.split("\n")[1];
          assert.match(line, /clearly visible, true to life — never exaggerated or caricatured; keep the face shape/);
          assert.match(line, /never who they are\. Head size comes only from the PROPORTIONS line — never enlarge the head to show the face\./);
          // 머리 크기 말 뒤에는 아이 규칙만 온다(어른은 여기서 끝난다)
          if (who.role === "dad") assert.match(line, /never enlarge the head to show the face\.$/);
        }
      }
    }
  });

  it("사진 갈래 — 클로즈업·카드가 없으면 그만큼 줄여 적는다", () => {
    const noCloseUp = portraitReferences({ photo: "P", sample: "S", sibling: null, guide: "G" }).attached;
    const a = buildPrompt(person("dad"), noCloseUp, CARD).split("\n")[1];
    assert.match(a, /hairline and hairstyle as in the photo\./);
    assert.ok(!a.includes("close-up"));
    const b = buildPrompt(person("dad"), noCloseUp).split("\n")[1];
    assert.match(b, /^LIKENESS FIRST/);
    assert.match(b, /Keep whatever makes their face distinctive clearly visible/);
    assert.ok(!b.includes("LIKENESS SPEC"), "카드가 없으면 카드를 가리키지 않는다");
    const noDistinctive = CARD.split("\n").filter((l) => !l.startsWith("- distinctive:")).join("\n");
    assert.match(buildPrompt(person("dad"), noCloseUp, noDistinctive), /Keep whatever makes their face distinctive clearly visible/);
  });

  it("카드 갈래(대신 그리기) — 카드를 출처로, 사진·클로즈업 말은 없다", () => {
    const p = buildPrompt(person("mom", { callName: "엄마" }), cardRefs, CARD);
    const line = p.split("\n")[1];
    assert.match(line, /^LIKENESS FIRST — top priority: anyone who knows the person described in the LIKENESS SPEC below must recognise this exact person/);
    assert.match(line, /hairline and hairstyle exactly as the LIKENESS SPEC describes\./);
    assert.match(line, /the 'distinctive' line of the LIKENESS SPEC below/);
    assert.ok(!/photo|close-up/i.test(line), line);
    const noDistinctive = CARD.split("\n").filter((l) => !l.startsWith("- distinctive:")).join("\n");
    assert.match(buildPrompt(person("mom", { callName: "엄마" }), cardRefs, noDistinctive), /Keep every trait in the LIKENESS SPEC below clearly visible/);
  });

  it("아이 — 나이·머리 색은 여전히 WHO 줄과 머리 색 규칙(부모가 나이를 안 알려 줬으면 머리 색만)", () => {
    const kid = buildPrompt(person("child", { callName: "하온", age: 6, gender: "girl" }), withCloseUp, CARD).split("\n")[1];
    assert.match(kid, /Age and hair colour still follow the WHO line and the hair-colour rule below\.$/);
    const noAge = buildPrompt(person("child", { callName: "하온" }), withCloseUp, CARD).split("\n")[1];
    assert.match(noAge, /Hair colour still follows the hair-colour rule below\.$/);
    const card = buildPrompt(person("sibling", { callName: "누나", age: 10 }), cardRefs, CARD).split("\n")[1];
    assert.match(card, /Age and hair colour still follow the WHO line/);
    // 어른은 덧붙이지 않는다
    assert.ok(!/still follow/.test(buildPrompt(person("dad"), withCloseUp, CARD).split("\n")[1]));
  });

  it("아이 쪽 말·가족 말이 없다 — 어른·아이 모두(실제 사람 사진과 섞이면 안전 검사에 걸리기 쉽다)", () => {
    const everyone = [...ADULTS, person("child", { callName: "하온", age: 6, gender: "girl" }), person("friend", { callName: "친구", age: 7 })];
    for (const who of everyone) {
      for (const refs of [withCloseUp, cardRefs]) {
        const line = buildPrompt(who, refs, CARD).split("\n")[1];
        assert.match(line, /^LIKENESS FIRST/);
        assert.equal(/\bchild|children|\bkid|famil/i.exec(line), null, `${who.role}: ${line}`);
      }
    }
  });

  it("칩 갈래에는 없다 — 알아볼 사진·카드가 없고, APPEARANCE 줄이 '적힌 특징을 또렷이'를 맡는다", () => {
    for (const who of [person("dad", { looks: "까만 짧은 머리" }), person("child", { callName: "하온", age: 6 })]) {
      const p = buildPrompt(who, cardRefs);
      assert.ok(!p.includes("LIKENESS FIRST"), p);
      assert.ok(!p.includes("close-up"));
    }
    // 카드를 걸러 남는 줄이 없으면 칩 갈래 — 그때도 없다
    assert.ok(!buildPrompt(person("dad", { looks: "x" }), cardRefs, "- cheeks and jaw: baby face").includes("LIKENESS FIRST"));
  });
});

describe("비율 견본(guide) — 늘 맨 끝 참고 그림, 머리:키 비율만", () => {
  const G = { guide: "G" };
  const KIDS: PortraitInput[] = [
    person("child", { callName: "하온", age: 5, gender: "girl" }),
    person("child", { callName: "하온", age: 8 }),
    person("child", { callName: "하온", age: 11 }),
    person("child", { callName: "하온" }),
    person("sibling", { callName: "누나", age: 15, gender: "girl" }),
    person("sibling", { callName: "동생" }),
    person("friend", { callName: "친구", age: 7 }),
  ];

  it("붙이는 순서 — 칩: 견본 → 같은 가족 → 비율 견본 / 사진: 사진 → 견본 → 비율 견본(사진은 첫째 그대로)", () => {
    assert.deepEqual(portraitReferences({ photo: null, sample: "S", sibling: "B", ...G }).images, ["S", "B", "G"]);
    assert.deepEqual(portraitReferences({ photo: null, sample: "S", sibling: null, ...G }).images, ["S", "G"]);
    assert.deepEqual(portraitReferences({ photo: null, sample: null, sibling: null, ...G }).images, ["G"]);
    const photo = portraitReferences({ photo: "P", sample: "S", sibling: "B", ...G });
    assert.deepEqual(photo.images, ["P", "S", "G"]);
    assert.deepEqual(photo.attached, { photo: true, closeUp: false, sample: true, sibling: false, guide: true });
    assert.deepEqual(portraitReferences({ photo: "P", sample: null, sibling: "B", ...G }).images, ["P", "G"]);
    // 못 만들었으면(null) 예전 그대로
    assert.deepEqual(portraitReferences({ photo: null, sample: "S", sibling: "B", guide: null }).images, ["S", "B"]);
  });

  it("칩 갈래 — THIRD = 비율 견본(견본·같은 가족 그림 뒤), 같은 가족 그림이 없으면 SECOND", () => {
    const refs = portraitReferences({ photo: null, sample: "S", sibling: "B", ...G }).attached;
    const p = buildPrompt(person("dad", { looks: "까만 짧은 머리" }), refs);
    assert.match(p, /FIRST image = painting-style sample/);
    assert.match(p, /SECOND image = another member of the same family/);
    assert.match(p, /THIRD image = PROPORTION GUIDE only — a plain grey mannequin whose head is exactly 1\/7 of its full height/);
    // 그린 뒤 재기와 같은 방식으로 — 머리카락 맨 위 ~ 턱 : 머리카락 맨 위 ~ 신발 바닥
    assert.match(p, /their head, from the top of the hair to the chin, is 1\/7 of their height from the top of the hair to the soles of the shoes/);
    assert.match(p, /NEVER copy anything else from it — not its stiff mannequin shape \(the pose comes from the POSE line\), grey colour, lines, blank face/);
    assert.ok(!/not its pose/.test(p), "견본 자세(정면·팔을 조금 벌림)는 POSE 줄과 같다 — 베끼지 말라고 하지 않는다");
    assert.match(p, /PROPORTIONS: .* The THIRD image \(proportion guide\) shows exactly this head-to-height ratio\./);
    assert.ok(!p.includes("FOURTH"));
    const noSibling = buildPrompt(person("dad"), portraitReferences({ photo: null, sample: "S", sibling: null, ...G }).attached);
    assert.match(noSibling, /SECOND image = PROPORTION GUIDE only/);
    assert.match(noSibling, /The SECOND image \(proportion guide\)/);
  });

  it("사진 갈래 — FIRST = 사진, SECOND = 견본, THIRD = 비율 견본", () => {
    const refs = portraitReferences({ photo: "P", sample: "S", sibling: "B", ...G }).attached;
    for (const card of [null, CARD]) {
      const p = buildPrompt(person("dad"), refs, card);
      const first = p.indexOf("FIRST image = a reference PHOTO");
      const second = p.indexOf("SECOND image = painting-style sample");
      const third = p.indexOf("THIRD image = PROPORTION GUIDE only");
      assert.ok(first >= 0 && second > first && third > second, p);
      assert.ok(!p.includes("another member of the same family"));
      assert.equal(CHILD_FRAMING.exec(p), null, "비율 견본 줄에도 아이 쪽 말이 없다");
    }
  });

  it("대신 그리기(카드) 갈래 — 견본 → 같은 가족 → 비율 견본", () => {
    const refs = portraitReferences({ photo: null, sample: "S", sibling: "B", ...G }).attached;
    const p = buildPrompt(person("mom", { callName: "엄마" }), refs, CARD);
    assert.match(p, /THIRD image = PROPORTION GUIDE only/);
    assert.match(
      p,
      /must look like the LIKENESS SPEC; head size and body proportions come only from the PROPORTIONS line and the proportion guide\./,
    );
  });

  it("같은 가족 그림(대개 아이 그림 1:4)에서 몸 비율을 따르지 않게 — 칩·카드 갈래 모두", () => {
    const withGuide = portraitReferences({ photo: null, sample: "S", sibling: "B", ...G }).attached;
    const p = buildPrompt(person("dad"), withGuide);
    assert.match(p, /NEVER copy that person's face, hair, clothes or body proportions/);
    assert.ok(!p.includes("proportions language"));
    assert.match(buildPrompt(person("dad"), NO_PHOTO), /come only from the PROPORTIONS line\./, "견본이 없으면 PROPORTIONS 줄만");
  });

  it("비율 견본 줄의 비율 = PROPORTIONS 줄의 비율 = 표(headChartRatio) — 어느 역할·나이든", () => {
    const refs = portraitReferences({ photo: null, sample: "S", sibling: null, ...G }).attached;
    for (const who of [...ADULTS, ...KIDS]) {
      const p = buildPrompt(who, refs);
      const guide = /mannequin whose head is exactly 1\/([\d.]+) of/.exec(p)?.[1];
      const prop = /PROPORTIONS: .*?the head is about 1\/([\d.]+) of the full body height/.exec(p)?.[1];
      assert.ok(guide && prop, p);
      assert.equal(guide, prop, `${who.role}(${who.age ?? "-"})`);
      assert.equal(Number(guide), headChartRatio(who.role, who.age), `${who.role}(${who.age ?? "-"})`);
    }
  });

  it("비율표 글(1/5 · 1/5.5 · 1/6 · 1/6.5 · 1/7) — 09-29 오후 되돌림, 1:4 는 대두", () => {
    const p = (who: PortraitInput) => /the head is about (1\/[\d.]+) of the full body height/.exec(buildPrompt(who, NO_PHOTO))?.[1];
    assert.equal(p(person("child", { age: 5 })), "1/5");
    assert.equal(p(person("child", { age: 8 })), "1/5.5");
    assert.equal(p(person("child", { age: 11 })), "1/6");
    assert.equal(p(person("sibling", { callName: "누나", age: 15 })), "1/6.5");
    assert.equal(p(person("dad")), "1/7");
  });

  it("어른 PROPORTIONS 줄은 머리를 키우는 쪽으로 당기지 않는다 — 'NOT a big head'(칩·사진 모두)", () => {
    for (const who of ADULTS) {
      for (const refs of [NO_PHOTO, PHOTO]) {
        const p = buildPrompt(who, refs);
        assert.match(p, /PROPORTIONS: picture-book adult proportions — the head is about 1\/7 of the full body height\. NOT a big head, NOT chibi/);
        assert.ok(!/tiny head/.test(p), `${who.role}`);
      }
    }
  });

  it("사진 갈래 — 사진 그대로는 얼굴 비율만, 머리:키는 PROPORTIONS 줄(실제 아이 사진은 표보다 머리가 작다)", () => {
    for (const who of [person("dad"), person("child", { callName: "하온", age: 5 })]) {
      const p = buildPrompt(who, PHOTO);
      assert.match(p, /never the face proportions, and never exaggerate/);
      assert.match(p, /The head-to-height ratio of the whole figure follows the PROPORTIONS line, not the photo\./);
    }
  });
});

describe("사진의 구도가 머리 크기를 정하지 않는다 — 얼굴이 꽉 찬 사진(셀카)도 전신을 PROPORTIONS 비율로", () => {
  const withCloseUp = portraitReferences({ photo: "P", closeUp: "C", sample: "S", sibling: null, guide: "G" }).attached;

  it("사진 규칙 줄·PROPORTIONS 줄 — 얼굴이 꽉 찬 사진이 큰 머리라는 뜻이 아니다(어른·아이, 클로즈업·카드 있음/없음)", () => {
    for (const who of [person("mom", { callName: "엄마" }), person("child", { callName: "하온", age: 5 })]) {
      for (const refs of [PHOTO, withCloseUp]) {
        for (const card of [null, CARD]) {
          const p = buildPrompt(who, refs, card);
          assert.match(
            p,
            /Even if the photo shows only the face or upper body — a selfie or tight shot where the face fills most of the picture — paint the whole figure at the PROPORTIONS head-to-height ratio: a face-filling photo does NOT mean a big head, and the photo's crop or camera distance never sets the head size\./,
          );
          assert.match(p, /\nPROPORTIONS: [^\n]* However the photo is cropped, this ratio stays the same\.\n/);
          // 몸 부위 말은 사진 갈래에 더하지 않는다(실제 사람 사진 옆 — 안전 검사)
          assert.ok(!/torso|\blegs?\b/i.test(p), `${who.role}`);
        }
      }
    }
  });

  it("칩·대신 그리기(사진 없음)에는 사진 구도 말이 없다", () => {
    for (const card of [null, CARD]) {
      const p = buildPrompt(person("mom", { callName: "엄마" }), NO_PHOTO, card);
      assert.ok(!p.includes("However the photo is cropped"));
      assert.ok(!p.includes("face-filling photo"));
    }
  });
});

describe("headRedrawRecipe — 머리 비율 다시 그리기는 사진 없이 처음 그림에서", () => {
  /** 사장님 시험의 엄마(표 1:7, 처음 1:4.15) */
  const MOM: HeadFix = { target: 7, verdict: "big", measured: 4.15 };

  it("사진 갈래 — 참고 그림은 처음 그림(첫째) + 비율 견본(둘째)뿐, 사진·클로즈업·그림체 견본은 없다", () => {
    const firstDraw = portraitReferences({ photo: "P", closeUp: "C", sample: "S", sibling: "B", guide: "G" });
    assert.deepEqual(firstDraw.images, ["P", "C", "S", "G"], "처음 그리기는 예전 그대로");
    const r = headRedrawRecipe({ first: "F", guide: "G", fix: MOM });
    assert.deepEqual(r.references, ["F", "G"]);
    assert.match(r.prompt, /\nFIRST image = our own earlier painting of this person — repaint THIS SAME character from the FIRST image\./);
    assert.match(r.prompt, /\nSECOND image = PROPORTION GUIDE only — a plain grey mannequin whose head is exactly 1\/7 of its full height/);
    assert.ok(!/THIRD|FOURTH/.test(r.prompt));
    const hit = /\bphoto|close-up|LIKENESS|painting-style sample|another member of the same family|APPEARANCE/i.exec(r.prompt);
    assert.equal(hit, null, `사진·카드·견본·칩 말이 없다: '${hit?.[0]}'`);
  });

  it("칩 갈래도 같은 요청 — 같은 가족 그림·그림체 견본 없이 처음 그림 + 비율 견본(아이 표 1:5)", () => {
    const firstDraw = portraitReferences({ photo: null, sample: "S", sibling: "B", guide: "G" });
    assert.deepEqual(firstDraw.images, ["S", "B", "G"], "처음 그리기는 예전 그대로");
    const r = headRedrawRecipe({ first: "F", guide: "G", fix: { target: 5, verdict: "big", measured: 3.5 } });
    assert.deepEqual(r.references, ["F", "G"]);
    assert.match(r.prompt, /must be 1\/5 of the full height/);
    assert.match(r.prompt, /mannequin whose head is exactly 1\/5 of its full height/);
  });

  it("비율 견본을 못 만들었으면 처음 그림 하나만 — SECOND 줄도 없다", () => {
    const r = headRedrawRecipe({ first: "F", guide: null, fix: MOM });
    assert.deepEqual(r.references, ["F"]);
    assert.ok(!r.prompt.includes("SECOND"));
    assert.ok(!r.prompt.includes("PROPORTION GUIDE"));
  });

  it("바로잡는 글 — 표 비율과 잰 비율, 같은 캐릭터 그대로(얼굴·머리·안경·피부·몸집·옷·색·붓질), 목·몸통·다리를 고르게 늘려", () => {
    const p = headRedrawPrompt(MOM, { guide: true });
    assert.match(p, /the FIRST image drew the head too big \(about 1\/4\.2 of the full height\)/);
    assert.match(
      p,
      /The head, from the top of the hair to the chin, must be 1\/7 of the full height, from the top of the hair to the soles of the shoes — the figure is 7 heads tall, one head-height per band between the SECOND image's lines \(picture-book adult proportions\): paint a clearly smaller head in relation to the whole figure, and make the neck, torso and legs longer to match — evenly, so the figure stays naturally proportioned with a natural-length neck \(never a long, stretched neck\) — never only the legs or only the torso changed\. NOT a big head, NOT chibi, NOT super-deformed\./,
    );
    assert.match(
      p,
      /Keep exactly as in the FIRST image: the face \(face shape, eyes, eyebrows, nose, mouth\), the hairstyle, hair length, fringe and hair colour, glasses, beard or moustache only if the FIRST image has them \(never add any\), the skin tone, the age the face shows, the body build, the clothes, shoes and all their colours, and the watercolor rendering/,
    );
    assert.match(p, /Copy everything from it EXCEPT its head-to-height ratio — only the head size and the length of the neck, torso and legs change\./);
    assert.ok(!p.includes("body proportions"), "'몸 비율은 베끼지 말라'처럼 몸을 새로 그려도 된다고 읽히는 말이 없다");
    // 얼마나 — 틀·여백이 같으니 머리 높이는 처음 그림의 4.15 ÷ 7 ≈ 59%
    assert.match(
      p,
      /The whole figure, from the top of the hair to the soles of the shoes, still spans the same height of the same 3:4 frame with the same margins, so the head comes out smaller in the picture than in the FIRST image — about 59% of its height there: the same face, just smaller\./,
    );
    assert.match(p, /never two figures side by side and never a before-and-after comparison/);
    // 처음 그리기와 같은 자세·틀·흰 바탕·오려 내기·글자 금지
    for (const line of [/\nPOSE: front view/, /\nFRAMING: 3:4 portrait\./, /\nBACKGROUND: one flat pure white/, /\nThe figure is cut out of the white background/, /\nNO text anywhere/]) {
      assert.match(p, line);
    }
    const small = headRedrawPrompt({ target: 5, verdict: "small", measured: 6.3 }, { guide: true });
    assert.match(small, /drew the head too small \(about 1\/6\.3 of the full height\)/);
    assert.match(
      small,
      /must be 1\/5 of the full height, from the top of the hair to the soles of the shoes — the figure is 5 heads tall, one head-height per band between the SECOND image's lines: /,
    );
    assert.match(
      small,
      /paint a clearly bigger head in relation to the whole figure, and make the neck, torso and legs shorter to match — evenly, so the figure stays naturally proportioned — never only the legs or only the torso changed\.\n/,
    );
    assert.match(small, /the head comes out bigger in the picture than in the FIRST image — about 126% of its height there: the same face, just bigger\./);
    assert.ok(!/NOT a big head|stretched neck/.test(small));
  });

  it("몇 등신·어른·청소년 이름 — 표 비율마다, 비율 견본이 없으면 가로줄 말도 없다", () => {
    const teen = headRedrawPrompt({ target: 6.5, verdict: "big", measured: 4.5 }, { guide: true });
    assert.match(teen, /the figure is 6\.5 heads tall, one head-height per band between the SECOND image's lines \(picture-book teenage proportions\): /);
    assert.match(teen, /about 69% of its height there/);
    for (const [target, text] of [
      [5, "5"],
      [5.5, "5\\.5"],
      [6, "6"],
    ] as const) {
      const kid = headRedrawPrompt({ target, verdict: "big", measured: 3.5 }, { guide: true });
      assert.match(kid, new RegExp(`the figure is ${text} heads tall, one head-height per band between the SECOND image's lines: `));
      assert.ok(!/picture-book (adult|teenage) proportions/.test(kid), `${target}`);
    }
    const noGuide = headRedrawPrompt(MOM, { guide: false });
    assert.match(noGuide, /the figure is 7 heads tall \(picture-book adult proportions\): /);
    assert.ok(!noGuide.includes("SECOND"));
  });

  it("아이 쪽 말·가족 말이 없다 — 역할과 상관없이 같은 글(나이는 '처음 그림의 얼굴이 보여 주는 나이 그대로')", () => {
    for (const fix of [
      MOM,
      { target: 5, verdict: "big", measured: 3.5 } as HeadFix,
      { target: 6.5, verdict: "big", measured: 4.5 } as HeadFix,
      { target: 7, verdict: "small", measured: 9 } as HeadFix,
    ]) {
      const p = headRedrawPrompt(fix, { guide: true });
      const hit = CHILD_FRAMING.exec(p);
      assert.equal(hit, null, `'${hit?.[0]}'`);
      assert.match(p, /the age the face shows/);
      assert.ok(!/apparent age/.test(p));
    }
  });

  it("처음 그리기와 같은 틀 글 — 자세·틀·바탕·오려 내기·글자 금지 줄이 buildPrompt 와 글자까지 같다", () => {
    const first = buildPrompt(person("mom", { callName: "엄마" }), PHOTO).split("\n");
    const again = headRedrawPrompt(MOM, { guide: true }).split("\n");
    for (const head of ["POSE:", "FRAMING:", "BACKGROUND:", "The figure is cut out", "NO text"]) {
      const a = first.find((l) => l.startsWith(head));
      assert.ok(a, head);
      assert.equal(again.find((l) => l.startsWith(head)), a, head);
    }
  });
});

describe("buildPrompt — 사진 갈래", () => {
  it("FIRST = 사진, SECOND = 그림체 견본, 같은 가족 그림 줄은 없다", () => {
    const p = buildPrompt(person("dad"), PHOTO);
    const first = p.indexOf("FIRST image = a reference PHOTO");
    const second = p.indexOf("SECOND image = painting-style sample");
    assert.ok(first >= 0 && second > first, p);
    assert.ok(!p.includes("another member of the same family"));
    assert.ok(!p.includes("THIRD"));
  });

  it("어른 사진 프롬프트에는 아이 쪽 말이 없다(아이의 아빠·진짜 가족·innocent·fully clothed) — 카드가 있든 없든", () => {
    for (const who of ADULTS) {
      for (const card of [null, CARD]) {
        const p = buildPrompt(who, PHOTO, card);
        const hit = CHILD_FRAMING.exec(p);
        assert.equal(hit, null, `${who.role}(${who.age ?? "-"}) 카드 ${card ? "있음" : "없음"}: '${hit?.[0]}'`);
      }
    }
  });

  it("사진에서 멀어지게 당기던 말을 뺐다 — 베낀 사본 금지·얼굴 양식 맞추기 대신 '사실적이지 않은 수채화'와 얼굴 비율 그대로", () => {
    const p = buildPrompt(person("dad"), PHOTO);
    assert.ok(!/traced|edited copy|face style/i.test(p));
    assert.match(p, /hand-painted watercolor illustration .*not photorealistic/);
    assert.match(p, /Keep the face proportions faithful to the photo/);
    assert.match(p, /A warm, friendly look in ordinary everyday clothes\./);
  });

  it("특징 카드를 '그대로 맞출 것'으로 적고, WHO 줄보다 앞에 둔다", () => {
    const p = buildPrompt(person("dad", { looks: "까만 짧은 머리" }), PHOTO, CARD);
    const spec = p.indexOf("LIKENESS SPEC —");
    assert.ok(spec >= 0 && spec < p.indexOf("WHO:"), p);
    assert.ok(p.includes(CARD));
    assert.match(p, /Match every trait exactly/);
    assert.match(p, /follow the PHOTO; for everyday clothes, follow this line/);
  });

  it("카드가 없으면 카드 말도 없다", () => {
    const p = buildPrompt(person("mom", { callName: "엄마" }), PHOTO);
    assert.ok(!p.includes("LIKENESS SPEC"));
  });

  it("아이·형제·친구 사진은 아이 규칙(부모가 알려 준 나이·까만 머리)을 그대로 지킨다", () => {
    const kid = buildPrompt(person("child", { callName: "하온", age: 6, gender: "girl" }), PHOTO, CARD);
    assert.match(kid, /a 6-year-old Korean girl/);
    assert.match(kid, /Draw a child of exactly that age/);
    assert.match(kid, /hair is black or dark brown ONLY/);
    assert.match(kid, /This includes the photo/);
    assert.match(kid, /hair length and style still follow the photo exactly/);
    const teen = buildPrompt(person("sibling", { callName: "누나", age: 15, gender: "girl" }), PHOTO);
    assert.match(teen, /a 15-year-old Korean teenage girl/);
    // 아이 사진이어도 'innocent·fully clothed' 는 쓰지 않는다
    assert.ok(!/innocent|fully clothed/i.test(kid + teen));
  });

  it("아이 사진 — 나이는 WHO 줄만(사진은 다른 나이 때일 수 있다), 카드의 나이·성별 줄은 빼고, 머리 색은 카드보다 아이 규칙", () => {
    const kid = buildPrompt(person("child", { callName: "하온", age: 6, gender: "girl" }), PHOTO, CARD);
    assert.match(kid, /Age comes only from the WHO line below, never from the photo/);
    assert.ok(!kid.includes("apparent age,"));
    assert.ok(!kid.includes("- gender:") && !kid.includes("- age:"), kid);
    assert.ok(kid.includes("- face shape: long oval, narrow"));
    assert.match(kid, /the WHO line and the hair-colour rule win/);
    assert.match(kid, /This includes the photo and any LIKENESS SPEC/);
    // 부모가 나이·성별을 안 알려 줬으면 카드 것을 둔다(기댈 게 그것뿐이다)
    const unknown = buildPrompt(person("friend", { callName: "친구" }), PHOTO, CARD);
    assert.ok(unknown.includes("- gender: man") && unknown.includes("- age: late 30s"));
    assert.ok(unknown.includes("apparent age,"));
    assert.ok(!unknown.includes("Age comes only from the WHO line"));
  });

  it("어른 사진은 사진이 생김새를 정한다 — WHO 줄에 'Korean' 을 적지 않는다(카드 갈래·칩은 그대로)", () => {
    assert.match(buildPrompt(person("dad"), PHOTO, CARD), /WHO: exactly one person — a man, the person in the reference photo\./);
    assert.match(
      buildPrompt(person("grandma", { callName: "할머니" }), PHOTO),
      /WHO: exactly one person — an older woman, the person in the reference photo\./,
    );
    assert.match(
      buildPrompt(person("friend", { callName: "친구", age: 30, gender: "girl" }), PHOTO),
      /WHO: exactly one person — a 30-year-old woman, the person in the reference photo\./,
    );
    assert.match(
      buildPrompt(person("dad"), NO_PHOTO, CARD),
      /WHO: exactly one person — a Korean man, the person described in the LIKENESS SPEC\./,
    );
    assert.match(buildPrompt(person("dad"), NO_PHOTO), /a Korean man in his late thirties/);
  });

  it("사진을 '영감'이 아니라 같은 사람으로 — 두드러진 특징 줄이 있으면 그것이 가장 중요하다고 적는다", () => {
    const p = buildPrompt(person("dad"), PHOTO, CARD);
    assert.match(p, /Paint this same person as a friendly picture-book character/);
    assert.ok(!/inspired by/i.test(p));
    assert.match(p, /The 'distinctive' line matters most\./);
    const noDistinctive = CARD.split("\n").filter((l) => !l.startsWith("- distinctive:")).join("\n");
    assert.ok(!buildPrompt(person("dad"), PHOTO, noDistinctive).includes("'distinctive'"));
  });

  it("좌우 — 카드에 좌우 말이 있을 때만 '보는 쪽 기준'이라고 붙인다(점·가르마가 반대로 가지 않게), 카드 바로 뒤", () => {
    const LR = /^Left and right in the spec \(image-left \/ image-right\) mean the left and right side of the picture as the viewer sees it, not the person's own left and right\.$/m;
    const noSides = buildPrompt(person("dad"), PHOTO, CARD);
    assert.ok(!LR.test(noSides), "좌우 말이 없으면 붙이지 않는다");
    for (const side of ["small mole under the image-left eye", "hair parted on the right"]) {
      const card = CARD.replace("- distinctive: long narrow face, deep-set eyes", `- distinctive: long narrow face; ${side}`);
      for (const refs of [PHOTO, NO_PHOTO]) {
        const lines = buildPrompt(person("dad"), refs, card).split("\n");
        const at = lines.findIndex((l) => LR.test(l));
        assert.ok(at > 0, side);
        assert.ok(lines[at - 1].startsWith("- "), "카드 줄 바로 뒤");
        assert.match(lines[at + 1], /^Where the spec disagrees with the WHO line/);
      }
    }
    // 'straight'·'bright' 는 좌우 말이 아니다
    assert.ok(!LR.test(buildPrompt(person("dad"), PHOTO, `${CARD}\n- skin tone: bright, warm`)));
  });
});

describe("buildPrompt — 옷", () => {
  const everyone: PortraitInput[] = [
    ...ADULTS,
    person("child", { callName: "하온", age: 6, gender: "girl" }),
    person("sibling", { callName: "누나", age: 15, gender: "girl" }),
    person("friend", { callName: "친구", age: 7 }),
  ];

  it("사진·카드 갈래는 늘 평범한 옷을 입힌다(CLOTHES 줄) — 칩 갈래는 예전 그대로", () => {
    for (const who of everyone) {
      for (const [refs, card] of [
        [PHOTO, CARD],
        [PHOTO, null],
        [NO_PHOTO, CARD],
        [NO_PHOTO, null],
      ] as const) {
        const p = buildPrompt(who, refs, card);
        if (refs === PHOTO || card) {
          assert.match(p, /CLOTHES: always ordinary everyday clothes — a top with trousers, a skirt or a dress, and shoes/, who.role);
        } else {
          assert.ok(!p.includes("CLOTHES:"), `${who.role}: 칩 갈래는 예전 그대로`);
        }
      }
    }
  });

  it("드러낸 옷차림 낱말은 어느 프롬프트에도 적지 않는다(아이 나이 줄 옆에 놓이면 그 자체가 걸린다)", () => {
    for (const who of everyone) {
      for (const [refs, card] of [
        [PHOTO, CARD],
        [NO_PHOTO, CARD],
        [NO_PHOTO, null],
      ] as const) {
        const p = buildPrompt(who, refs, card);
        const hit = /swim|underwear|lingerie|naked|nude|bare skin|sleepwear|pajama/i.exec(p);
        assert.equal(hit, null, `${who.role}: '${hit?.[0]}'`);
      }
    }
  });
});

describe("cardFor — 특징 카드를 이 사람에게 맞게 거른다", () => {
  it("어른은 아이 쪽 말이 든 줄을 뺀다 — 카드가 아이 쪽 말을 되살리지 않는다", () => {
    const withKid = `${CARD}\n- cheeks and jaw: round baby face\n- build: sturdy, a dad of two kids`;
    assert.equal(cardFor(person("dad"), withKid), CARD);
    const p = buildPrompt(person("dad"), PHOTO, withKid);
    assert.equal(CHILD_FRAMING.exec(p), null);
  });

  it("아이는 부모가 알려 준 나이·성별 줄만 뺀다", () => {
    const kidCard = "- gender: girl\n- age: about 4 years old\n- hair: black bob with a straight fringe";
    assert.equal(cardFor(person("child", { age: 6, gender: "girl" }), kidCard), "- hair: black bob with a straight fringe");
    assert.equal(cardFor(person("child", { age: 6 }), kidCard), "- gender: girl\n- hair: black bob with a straight fringe");
    // 형제는 호칭(누나)으로 성별을 안다
    assert.equal(cardFor(person("sibling", { callName: "누나", age: 10 }), kidCard), "- hair: black bob with a straight fringe");
  });

  it("어른의 두드러진 특징 줄은 아이 쪽 말이 든 특징만 뺀다 — 가장 중요한 줄을 통째로 잃지 않게", () => {
    const card = `${CARD.replace("- distinctive: long narrow face, deep-set eyes", "- distinctive: baby face; thick straight eyebrows; square jaw")}`;
    const out = cardFor(person("dad"), card);
    assert.ok(out?.includes("- distinctive: thick straight eyebrows; square jaw"), out ?? "");
    assert.equal(CHILD_FRAMING.exec(buildPrompt(person("dad"), PHOTO, card)), null);
    // 모두 아이 쪽 말이면 줄째 빠진다
    const all = CARD.replace("- distinctive: long narrow face, deep-set eyes", "- distinctive: baby face; kid-like grin");
    assert.ok(!cardFor(person("dad"), all)?.includes("- distinctive:"));
    // 아이는 거르지 않는다(아이 쪽 말이 제 나이의 말이다)
    assert.ok(cardFor(person("child", { age: 6, gender: "girl" }), card)?.includes("- distinctive: baby face; thick straight eyebrows"));
  });

  it("남는 줄이 없으면 null — 그때는 칩 갈래로 그린다", () => {
    assert.equal(cardFor(person("dad"), null), null);
    assert.equal(cardFor(person("dad"), "- cheeks and jaw: baby face"), null);
    const p = buildPrompt(person("dad", { looks: "까만 짧은 머리" }), NO_PHOTO, "- cheeks and jaw: baby face");
    assert.ok(!p.includes("LIKENESS SPEC"));
    assert.match(p, /\(the child's father\)/);
  });
});

describe("buildPrompt — 카드에 나이 줄이 없을 때", () => {
  it("대신 그리기에서 어른은 30대 후반, 조부모는 60대 후반~70대로 잡는다", () => {
    const noAge = CARD.split("\n").filter((l) => !l.startsWith("- age:")).join("\n");
    assert.match(buildPrompt(person("dad"), NO_PHOTO, noAge), /if it gives none, in his late thirties/);
    assert.match(buildPrompt(person("mom", { callName: "엄마" }), NO_PHOTO, noAge), /if it gives none, in her late thirties/);
    assert.match(
      buildPrompt(person("grandpa", { callName: "할아버지" }), NO_PHOTO, noAge),
      /if it gives none, late sixties to seventies/,
    );
  });
});

describe("buildPrompt — 대신 그리기(사진 없이 특징 카드)", () => {
  it("카드가 사진 자리를 맡는다 — 사진 말은 없고, 같은 가족 그림은 그림체만 맞춘다", () => {
    const p = buildPrompt(person("dad", { looks: "안경을 쓰지 않는다" }), NO_PHOTO, CARD);
    assert.ok(!p.includes("reference PHOTO"));
    assert.ok(p.includes(CARD));
    assert.match(p, /FIRST image = painting-style sample/);
    assert.match(p, /SECOND image = another member of the same family .*must look like the LIKENESS SPEC/);
    assert.ok(!/face style/.test(p));
    assert.match(p, /Glasses follow the LIKENESS SPEC/);
    assert.match(p, /follow the SPEC; for everyday clothes, follow this line/);
  });

  it("어른이면 아이 쪽 말이 없다", () => {
    for (const who of ADULTS) {
      const p = buildPrompt(who, NO_PHOTO, CARD);
      const hit = CHILD_FRAMING.exec(p);
      assert.equal(hit, null, `${who.role}: '${hit?.[0]}'`);
    }
  });
});

describe("buildPrompt — 칩 갈래는 예전 그대로", () => {
  it("아이의 아빠·같은 가족 그림(얼굴 양식)·wholesome 줄이 그대로 있다", () => {
    const p = buildPrompt(person("dad", { looks: "까만 짧은 머리 · 안경을 썼다" }), NO_PHOTO);
    assert.match(p, /^One full-body character portrait of a single person for a Korean children's picture book, /);
    assert.match(p, /a Korean man in his late thirties \(the child's father\)/);
    assert.match(p, /SECOND image = another member of the same family already painted — match the SAME artist hand, line weight, face style/);
    assert.match(p, /APPEARANCE — chosen by the family and written in Korean\. Follow it literally/);
    assert.match(p, /Wholesome, innocent, fully clothed, child-friendly\.$/);
    assert.ok(!p.includes("LIKENESS SPEC"));
  });
});

describe("photoRefused — 사진 탓 거절인가", () => {
  const noImage = (why: string) => {
    const e = new GeminiError("응답에 이미지가 없습니다.", 502);
    e.noImage = why;
    return e;
  };

  it("그림 없는 답(IMAGE_SAFETY·PROHIBITED_CONTENT·글만 옴)·요청 차단(422)·사진을 못 읽음(400)", () => {
    assert.equal(photoRefused(noImage("IMAGE_SAFETY")), true);
    assert.equal(photoRefused(noImage("PROHIBITED_CONTENT")), true);
    assert.equal(photoRefused(noImage("NO_IMAGE")), true);
    assert.equal(photoRefused(new GeminiError("안전필터에 걸렸습니다: OTHER", 422)), true);
    assert.equal(photoRefused(new GeminiError("Gemini 호출 실패 (HTTP 400)", 400)), true);
  });

  it("몰림·서버 문제·키 없음·다른 오류는 사진 탓이 아니다", () => {
    assert.equal(photoRefused(new GeminiError("몰림", 429)), false);
    assert.equal(photoRefused(new GeminiError("서버", 500)), false);
    assert.equal(photoRefused(new GeminiError("키 없음", 503)), false);
    assert.equal(photoRefused(new Error("x")), false);
    assert.equal(photoRefused(null), false);
  });
});

describe("photoFallbackPlan — 사진 거절 뒤 대신 그릴지·무엇으로", () => {
  const ok = PHOTO_FALLBACK_MIN_MS + 1_000;

  it("카드가 있으면 사진 속 특징으로(features), 없고 칩이 있으면 칩으로(looks)", () => {
    assert.equal(photoFallbackPlan({ card: CARD, looks: "까만 짧은 머리", msLeft: ok }), "features");
    assert.equal(photoFallbackPlan({ card: CARD, looks: "", msLeft: ok }), "features");
    assert.equal(photoFallbackPlan({ card: null, looks: "까만 짧은 머리", msLeft: ok }), "looks");
  });

  it("카드도 칩도 없으면 아무나 그리지 않는다 — 되돌리고 알린다", () => {
    assert.equal(photoFallbackPlan({ card: null, looks: "  ", msLeft: ok }), null);
  });

  it("그릴 시간이 모자라면 하지 않는다(끝나기 전에 끊겨 값만 나가지 않게)", () => {
    assert.equal(photoFallbackPlan({ card: CARD, looks: "x", msLeft: PHOTO_FALLBACK_MIN_MS - 1 }), null);
    assert.equal(photoFallbackPlan({ card: CARD, looks: "x", msLeft: Number.NaN }), null);
    assert.equal(photoFallbackPlan({ card: CARD, looks: "x", msLeft: PHOTO_FALLBACK_MIN_MS }), "features");
  });
});
