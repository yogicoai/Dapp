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
  redrawLikeness,
  type PortraitInput,
} from "./family-portrait-prompt.ts";
import { headChartRatio, type HeadFix } from "./family-head.ts";
import { readFeatureCard } from "./family-photo-card.ts";
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

  it("아이 카드의 흉터는 특징 하나씩 뺀다(주근깨·점은 둔다) — 어른은 그대로(2026-09-30)", () => {
    const card = "- distinctive: small scar on the chin; dimples\n- skin marks: scar above the image-right eyebrow\n- hair: black bob";
    assert.equal(cardFor(person("child", { age: 6, gender: "girl" }), card), "- distinctive: dimples\n- hair: black bob");
    assert.equal(
      cardFor(person("child", { age: 6 }), "- skin marks: freckles on the nose; scarred knee; small mole"),
      "- skin marks: freckles on the nose; small mole",
    );
    assert.equal(cardFor(person("dad"), card), card);
    // 어른의 피부 점 줄도 두드러진 특징 줄처럼 아이 쪽 말이 든 특징만 뺀다
    assert.equal(cardFor(person("dad"), "- skin marks: freckles; birthmark since he was a baby"), "- skin marks: freckles");
  });

  // 2026-09-30 검토: 아이 사진 프롬프트의 나이·체형 줄 옆에 몸 부위 + 점·상처 말(허벅지의 모반·손의 화상)이 놓이면 안전 검사에 걸리기 쉽다.
  it("아이 카드의 몸 쪽 점·화상·꿰맨 자국은 특징 하나씩 뺀다 — 얼굴 주근깨·점과 체형 말('narrow shoulders')은 둔다", () => {
    const kid = person("child", { age: 6, gender: "girl" });
    assert.equal(
      cardFor(kid, "- distinctive: healed burn mark on the image-left hand; round cheeks; narrow shoulders\n- skin marks: mole on the image-left upper arm; birthmark on the image-right thigh; freckles on the nose"),
      "- distinctive: round cheeks; narrow shoulders\n- skin marks: freckles on the nose",
    );
    assert.equal(cardFor(kid, "- distinctive: stitches above the lip; dimples"), "- distinctive: dimples");
    // 다른 줄의 색 말('burnt orange')은 걸지 않는다 — 두 줄에만
    assert.equal(cardFor(kid, "- clothing: burnt orange T-shirt"), "- clothing: burnt orange T-shirt");
    const p = buildPrompt(kid, PHOTO, "- distinctive: healed burn mark on the image-left hand; round cheeks\n- skin marks: mole on the image-left upper arm\n- hair: black bob");
    assert.ok(!/burn|upper arm/i.test(p), p);
    // 몸 쪽 점이 빠지면 점 막기 줄도 없고 DO NOT 줄은 점·주근깨까지 적힌 글(… stubble, mole, freckles or tattoo …) 그대로
    assert.ok(!p.includes(G_MOLE) && !p.includes("- skin marks:"));
    assert.ok(p.includes("stubble, mole, freckles or tattoo unless it is clearly there."));
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

/*
 * 2026-09-30 엄마 사진(사장님 "100% 비슷하단 느낌이 덜한데") — 사진은 비치는 가운데 앞머리·긴 달걀형 얼굴·좁은 턱·가늘고 긴
 * 홑꺼풀 눈·곧은 콧대·작게 다문 입·주근깨·입가 점인데, 그림은 두꺼운 일자 앞머리·둥근 얼굴·큰 둥근 눈·점 코·주근깨 없음이었다.
 * 그 사진에서 읽혔을 법한 카드(실제 카드는 찍지 않아 모른다 — 모양만 같은 가짜).
 */
const MOM_CARD = [
  "- gender: woman",
  "- age: late 20s",
  "- distinctive: thin see-through fringe parted in the centre; many freckles across the cheeks and nose; long oval face with a narrow chin; long narrow single-lidded eyes",
  "- face shape: long oval, long for its width",
  "- eyes: single, long and narrow, small, straight",
  "- eyebrows: thin, straight, dark brown",
  "- nose: defined and straight bridge, medium, small tip",
  "- mouth: thin, small, closed-lip",
  "- cheeks and jaw: flat cheeks, slim jawline, narrow and pointed chin",
  "- skin tone: light, warm",
  "- skin marks: many freckles across both cheeks and the nose bridge; small mole near the image-left mouth corner",
  "- hair: jaw-length straight black bob",
  "- fringe: see-through wispy; at the brows; parting: centre",
  "- glasses: none",
  "- clothing: white T-shirt",
].join("\n");

/** 아이 카드 — 비치는 가운데 앞머리·긴 얼굴·좁은 턱·주근깨, 그리고 아이 그림에서 뺄 흉터 */
const KID_CARD = [
  "- gender: girl",
  "- age: about 4 years old",
  "- distinctive: see-through wispy fringe; freckles on the nose; small scar on the chin",
  "- face shape: long oval",
  "- eyes: single, long and narrow",
  "- nose: defined straight bridge",
  "- mouth: small, closed-lip",
  "- cheeks and jaw: full cheeks, narrow pointed chin",
  "- skin marks: a few freckles across the nose; small scar above the image-right eyebrow",
  "- hair: black bob",
  "- fringe: see-through wispy, at the brows, centre parting",
].join("\n");

const G_MUST = "MUST KEEP — the ways portraits of this person usually drift; this one must not: ";
const G_FRINGE =
  "the fringe is a few thin, see-through wisps with the forehead showing between them — NOT a heavy, solid or blunt-cut fringe";
const G_CENTRE = "the parting stays in the centre";
const G_FACE = "the face keeps the shape and length the spec gives it — never rounded off into a short, round face";
const G_CHIN = "the chin stays as narrow as the spec gives it — never widened into a broad jaw";
const G_EYES =
  "the eyes keep the eyelids, shape and size the spec gives them — NOT big round picture-book eyes, and never exaggerated into slits";
const G_NOSE = "the nose keeps the clearly visible bridge the spec gives it — never shrunk to a dot or button nose";
const G_MOUTH = "the mouth keeps its small size — a soft closed-lip smile, never a wide open grin";
const G_MOUTH_CLOSED = "the mouth keeps the size the spec gives it, with a soft closed-lip smile — never a wide open grin";
const G_FRINGE_LIGHT = "the fringe stays as light as the spec gives it — NOT a heavy, solid or blunt-cut fringe";
const G_FRECKLES =
  "the freckles are painted as the spec gives them, as many and in the places written — small, soft light-brown dots, subtle but clearly there; never left out, never dark blotches";
const G_MOLE = "each mole or beauty mark is one small dark-brown dot in the place the spec gives";
const SAMPLE_BASE =
  "image = painting-style sample only (never copy its people, animals, subject, pose or composition). Copy only HOW it is painted: medium, brush and line quality, edge softness, colour palette, shading and paper finish.";
const SAMPLE_NO_FACE = " Never copy how it draws faces either — not its dot eyes, open-mouthed grin or pink cheek blush.";
const DO_NOT_OLD_PHOTO =
  "DO NOT invent anything that is neither in the photo nor written above: no glasses, beard, moustache, stubble, mole, freckles or tattoo unless it is clearly there. One invented detail and the portrait no longer looks like them.";

describe("MUST KEEP·ADULT FACE — 카드에 있는 특징이 흔히 어긋나는 쪽을 막는다(2026-09-30 엄마 사진)", () => {
  const mom = person("mom", { callName: "엄마" });
  const guideRefs = portraitReferences({ photo: "P", closeUp: "C", sample: "S", sibling: null, guide: "G" }).attached;

  it("엄마 카드(사진) — 앞머리·가르마·얼굴·턱·눈·코·입·주근깨·점 모두 한 줄에, 카드 묶음 바로 뒤·사진 규칙 앞", () => {
    const p = buildPrompt(mom, guideRefs, MOM_CARD);
    const lines = p.split("\n");
    const must = lines.findIndex((l) => l.startsWith(G_MUST));
    assert.ok(must > 0, p);
    assert.equal(
      lines[must],
      `${G_MUST}${[G_FRINGE, G_CENTRE, G_FACE, G_CHIN, G_EYES, G_NOSE, G_MOUTH, G_FRECKLES, G_MOLE].join("; ")}.`,
    );
    assert.match(lines[must - 1], /^Where the spec disagrees with the WHO line/, "카드 묶음 바로 뒤");
    assert.match(lines[must + 1], /^ADULT FACE: /);
    assert.match(lines[must + 2], /^LIKENESS from the photo/, "사진 규칙 앞");
    assert.ok(!p.includes("no fringe"));
    assert.equal(CHILD_FRAMING.exec(p), null);
    assert.ok(!/torso|\blegs?\b/i.test(p), "사진 갈래에 몸 부위 말을 더하지 않는다");
  });

  it("카드에 주근깨·점이 있으면 DO NOT 줄이 카드와 부딪히지 않게 — '카드가 적은 것 말고는 더하지 말 것'", () => {
    const photo = buildPrompt(mom, PHOTO, MOM_CARD);
    assert.match(
      photo,
      /\nDO NOT invent anything that is neither in the photo nor written above: no glasses, beard, moustache, stubble or tattoo unless it is clearly there, and no freckles or moles beyond those the LIKENESS SPEC gives\. One invented detail and the portrait no longer looks like them\.\n/,
    );
    assert.ok(!photo.includes("stubble, mole, freckles or tattoo"));
    const card = buildPrompt(mom, NO_PHOTO, MOM_CARD);
    assert.match(
      card,
      /\nDO NOT invent anything that is neither in the LIKENESS SPEC nor written above: no glasses, beard, moustache, stubble or tattoo unless it is written, and no freckles or moles beyond those the LIKENESS SPEC gives\. One invented detail and the portrait no longer looks like them\.\n/,
    );
    // 주근깨가 두드러진 특징 줄에만 있어도 같다
    const onlyDistinctive = `${CARD.replace("- distinctive: long narrow face, deep-set eyes", "- distinctive: long narrow face; freckles across the nose")}`;
    const q = buildPrompt(person("dad"), PHOTO, onlyDistinctive);
    assert.match(q, /and no freckles or moles beyond those the LIKENESS SPEC gives\./);
    assert.ok(q.includes(G_FRECKLES) && !q.includes(G_MOLE));
    // 'skin marks: none' 이면 예전 글 그대로
    assert.ok(buildPrompt(person("dad"), PHOTO, `${CARD}\n- skin marks: none`).includes(DO_NOT_OLD_PHOTO));
  });

  it("ADULT FACE — 사진·카드 갈래 어른만, 볼 터치는 사진(카드)에 있을 때만, 아이 쪽 말 없음", () => {
    for (const who of ADULTS) {
      const photo = buildPrompt(who, PHOTO, CARD);
      assert.match(
        photo,
        /\nADULT FACE: paint a grown-up's real face, not the generic cute picture-book face — keep the real eye shape and eye size \(never enlarged into big round eyes\), face length and chin \(never shortened or rounded off into a younger-looking face\), nose bridge \(never shrunk to a tiny dot nose\), mouth size and apparent age \(never younger-looking\)\. No pink blush circles on the cheeks unless the photo shows rosy cheeks\. The picture-book look comes only from the rendering — soft washes and the thin pencil contour\.\n/,
        who.role,
      );
      assert.match(buildPrompt(who, PHOTO), /\nADULT FACE: /, "카드가 없어도(카드가 늦었다) 사진 갈래 어른이면");
      assert.match(buildPrompt(who, NO_PHOTO, CARD), /No pink blush circles on the cheeks unless the LIKENESS SPEC gives rosy cheeks\./);
      assert.equal(CHILD_FRAMING.exec(photo), null, who.role);
    }
  });

  it("그림체 견본 줄 — 사진·카드 갈래 어른만 '견본의 얼굴 그리는 법은 가져오지 말 것'을 붙인다('face style' 이라는 말은 없다)", () => {
    assert.ok(buildPrompt(mom, PHOTO, MOM_CARD).includes(`SECOND ${SAMPLE_BASE}${SAMPLE_NO_FACE}\n`));
    assert.ok(buildPrompt(mom, NO_PHOTO, MOM_CARD).includes(`FIRST ${SAMPLE_BASE}${SAMPLE_NO_FACE}\n`));
    assert.ok(!/face style/.test(buildPrompt(mom, PHOTO, MOM_CARD)));
  });

  it("아빠 카드(시험 카드) — 얼굴·눈만 걸리고 앞머리·주근깨·점 말은 없다, DO NOT 줄은 예전 그대로", () => {
    const p = buildPrompt(person("dad"), PHOTO, CARD);
    const must = p.split("\n").find((l) => l.startsWith(G_MUST));
    assert.equal(must, `${G_MUST}${G_FACE}; ${G_EYES}.`);
    assert.ok(!/fringe|freckl|\bmoles?\b/i.test(must ?? ""), "카드에 없는 특징 말은 적지 않는다(예시 낱말이 옮겨 그려지는 버릇)");
    assert.ok(p.includes(DO_NOT_OLD_PHOTO));
    // 걸 것이 없으면 줄째 없다
    assert.ok(!buildPrompt(person("dad"), PHOTO, "- gender: man\n- hair: short straight black hair\n- glasses: none\n- build: slim\n- clothing: navy").includes("MUST KEEP"));
  });

  it("아이 — 앞머리·가르마·얼굴·턱·눈·주근깨(2026-10-02 눈은 아이도), KID FACE 줄이 붙고 ADULT FACE·견본 얼굴 말·흉터는 없다", () => {
    const kid = person("child", { callName: "하온", age: 6, gender: "girl" });
    for (const refs of [PHOTO, NO_PHOTO]) {
      const p = buildPrompt(kid, refs, KID_CARD);
      const must = p.split("\n").find((l) => l.startsWith(G_MUST));
      assert.equal(must, `${G_MUST}${[G_FRINGE, G_CENTRE, G_FACE, G_CHIN, G_EYES, G_FRECKLES].join("; ")}.`);
      assert.ok(!p.includes("ADULT FACE"));
      // 아이 닮음 줄(2026-10-02 사장님 "보자마자 '어 우리 아이다'") — 사진·카드 갈래 모두
      assert.ok(p.includes("THIS CHILD'S OWN FACE"));
      assert.ok(p.includes("never swapped for generic big round eyes"));
      assert.ok(!p.includes(SAMPLE_NO_FACE));
      assert.ok(!/\bscar/i.test(p), "아이 그림의 흉터 말은 뺀다(아이 나이 줄 옆의 상처 말 — 안전 검사)");
      assert.ok(p.includes("- skin marks: a few freckles across the nose"));
      assert.ok(p.includes("- distinctive: see-through wispy fringe; freckles on the nose"));
    }
  });

  it("앞머리가 없다·두꺼운 일자 앞머리·옆으로 넘긴 앞머리 — 카드가 적은 대로만", () => {
    const withFringe = (f: string) =>
      buildPrompt(person("dad"), PHOTO, `${CARD}\n- fringe: ${f}`).split("\n").find((l) => l.startsWith(G_MUST)) ?? "";
    assert.ok(withFringe("none; parting: image-left").includes("no fringe — the forehead stays open, never add bangs"));
    assert.ok(!withFringe("none; parting: image-left").includes(G_FRINGE));
    // 두꺼운 일자 앞머리면 '비치는 앞머리'를 걸지 않는다 — 'not heavy' 같은 부정은 두꺼운 말로 읽지 않는다
    assert.ok(!withFringe("full blunt, to the brows").includes("fringe"));
    // 2026-09-30 검토: 가벼운(light·thin) 앞머리는 '비치는 몇 가닥, 이마가 보인다'로 풀지 않는다 — 카드의 고를 말도 따로다
    // (예전엔 light 를 비치는 앞머리로 풀어 보통 앞머리 아이가 비치는 앞머리로 그려질 뻔했다). '두껍게 일자로 자르지 말 것'만.
    assert.equal(withFringe("light, not heavy, above the brows"), `${G_MUST}${[G_FRINGE_LIGHT, G_FACE, G_EYES].join("; ")}.`);
    for (const light of ["light; at the brows; none", "thin; to the brows; image-left", "light and airy; above the brows"]) {
      assert.ok(withFringe(light).includes(G_FRINGE_LIGHT), light);
      assert.ok(!/forehead showing|see-through|wisps/.test(withFringe(light)), light);
    }
    assert.ok(withFringe("sparse, see-through; at the brows").includes(G_FRINGE));
    // 커튼 앞머리는 가볍다고 적혀도 커튼 말이 먼저(더 구체적인 말)
    assert.ok(withFringe("light curtain fringe, to the brows").includes("parted curtain-style"));
    assert.ok(!withFringe("light curtain fringe, to the brows").includes(G_FRINGE_LIGHT));
    // 머리 색 'light brown' 은 가벼운 앞머리 말이 아니다
    assert.ok(!withFringe("light brown, to the brows").includes(G_FRINGE));
    assert.ok(withFringe("side-swept to the image-left").includes("the fringe sweeps to the side the spec gives — NOT a straight-across blunt fringe"));
    assert.ok(withFringe("curtain, to the brows").includes("parted curtain-style"));
    for (const centre of ["see-through; parted in the centre", "wispy, center-parted", "light; middle part"]) {
      assert.ok(withFringe(centre).includes(G_CENTRE), centre);
    }
    assert.ok(!withFringe("light fringe covering the centre of the forehead, no parting").includes(G_CENTRE));
  });

  it("얼굴·눈이 정말 둥글거나 크면 걸지 않는다 — 있는 생김새와 부딪히는 말을 적지 않는다", () => {
    const card = CARD.replace("- face shape: long oval, narrow", "- face shape: round, short and wide")
      .replace("- distinctive: long narrow face, deep-set eyes", "- distinctive: deep-set eyes")
      .replace("- eyes: single eyelid, narrow, slightly upturned", "- eyes: double, round, large");
    assert.ok(!buildPrompt(person("dad"), PHOTO, card).includes("MUST KEEP"));
  });

  it("칩 갈래는 예전 그대로 — MUST KEEP·ADULT FACE 없고 견본 줄·DO NOT 줄도 같다", () => {
    for (const who of [person("mom", { callName: "엄마", looks: "까만 단발머리" }), person("dad")]) {
      const p = buildPrompt(who, NO_PHOTO);
      assert.ok(!p.includes("MUST KEEP") && !p.includes("ADULT FACE"), who.role);
      assert.ok(p.split("\n").includes(`FIRST ${SAMPLE_BASE}`));
      assert.match(p, /stubble, mole, freckles or tattoo unless that exact item is written\./);
    }
  });

  it("카드 → 프롬프트 — 글 모델 답의 주근깨·점이 카드를 거쳐 MUST KEEP 까지 간다", () => {
    const reply = MOM_CARD.split("\n")
      .map((l) => l.slice(2))
      .join("\n");
    const card = readFeatureCard(`${reply}\nface box: [120, 300, 520, 700]`);
    assert.ok(card?.includes("- skin marks: many freckles across both cheeks and the nose bridge; small mole near the image-left mouth corner"));
    assert.ok(card?.includes("- fringe: see-through wispy; at the brows; parting: centre"));
    const p = buildPrompt(mom, PHOTO, card);
    assert.ok(p.includes(G_FRECKLES) && p.includes(G_MOLE) && p.includes(G_FRINGE) && p.includes(G_CENTRE), p);
    assert.match(p, /\nLeft and right in the spec \(image-left \/ image-right\)/);
  });

  // 2026-09-30 검토: 'no moles' 의 moles 가 점 막기 줄을 켜 없는 점을 그리게 했고, 'no freckles; small mole' 은 줄째 버려져
  // 있는 점이 막기 줄을 잃었다. 새 부탁 글('freckles …, each mole …; or none')이 이런 답을 부르기 쉽다.
  it("'없다'는 점 말은 막기 줄을 켜지 않는다 — 카드 읽기부터 그림 프롬프트·다시 그리기까지", () => {
    const base = MOM_CARD.split("\n")
      .filter((l) => !l.startsWith("- skin marks: ") && !l.startsWith("- distinctive: "))
      .map((l) => l.slice(2))
      .join("\n");
    const guards = (marks: string, who = mom) => {
      const card = readFeatureCard(`${base}\nskin marks: ${marks}`);
      const must = buildPrompt(who, PHOTO, card)
        .split("\n")
        .find((l) => l.startsWith(G_MUST)) ?? "";
      const again = redrawLikeness(who, card) ?? "";
      return { freckles: must.includes(G_FRECKLES), mole: must.includes(G_MOLE), again, card: card ?? "" };
    };
    // ① 주근깨만 — 'no moles' 로 점 막기 줄이 켜지지 않는다
    const a = guards("some freckles across the nose and cheeks; no moles");
    assert.deepEqual([a.freckles, a.mole], [true, false]);
    assert.ok(!a.again.includes(G_MOLE) && a.again.includes(G_FRECKLES));
    assert.ok(!/no moles/.test(a.card), "카드에도 'no moles' 가 남지 않는다");
    // ② 점만 — 'freckles: none' 으로 주근깨 막기 줄이 켜지지 않고, 있는 점은 막기 줄을 그대로 받는다
    const b = guards("freckles: none; one small mole under the image-left eye");
    assert.deepEqual([b.freckles, b.mole], [false, true]);
    assert.ok(b.again.includes(G_MOLE) && !b.again.includes(G_FRECKLES));
    const b2 = guards("no freckles; one small mole near the image-left mouth corner");
    assert.deepEqual([b2.freckles, b2.mole], [false, true]);
    // ③ 둘 다 없다 — 막기 줄 없음, 아빠도 같다(다시 그리기 LIKENESS 에도)
    for (const who of [mom, person("dad")]) {
      const c = guards("clear skin, no freckles or moles", who);
      assert.deepEqual([c.freckles, c.mole], [false, false], who.role);
      assert.ok(!c.again.includes(G_FRECKLES) && !c.again.includes(G_MOLE), who.role);
    }
    // ④ 주근깨 + 'mole: none'
    const d = guards("freckles (many across the cheeks); mole: none");
    assert.deepEqual([d.freckles, d.mole], [true, false]);
    // 모두 '없다'면 'none' — DO NOT 줄은 예전 글('bag, mole, freckles or tattoo')
    const e = guards("no freckles, moles or scars");
    assert.deepEqual([e.freckles, e.mole], [false, false]);
    assert.ok(e.card.includes("- skin marks: none"));
    assert.ok(buildPrompt(mom, PHOTO, e.card).includes(DO_NOT_OLD_PHOTO));
  });

  it("한 특징 안의 '없다'도 걷는다 — 'freckles but no moles' · 'no moles and some freckles'(카드엔 그대로 남는 꼴)", () => {
    // 두드러진 특징 줄(주근깨가 있다)은 빼고 피부 점 줄만 바꿔 본다
    const must = (marks: string) =>
      buildPrompt(mom, PHOTO, MOM_CARD.replace(/^- distinctive: .*\n/m, "").replace(/^- skin marks: .*$/m, `- skin marks: ${marks}`))
        .split("\n")
        .find((l) => l.startsWith(G_MUST)) ?? "";
    for (const marks of ["freckles but no moles", "no moles and some freckles on the nose", "a few freckles on the nose, no visible moles"]) {
      assert.ok(must(marks).includes(G_FRECKLES), marks);
      assert.ok(!must(marks).includes(G_MOLE), marks);
    }
    for (const marks of ["small mole on the chin, not freckled", "no freckles or other marks, small mole on the chin"]) {
      assert.ok(must(marks).includes(G_MOLE), marks);
      assert.ok(!must(marks).includes(G_FRECKLES), marks);
    }
  });

  // 2026-09-30 검토: 입 막기 줄이 'small·narrow' 에만 걸려, 너비가 medium 인 다문 입(엄마가 활짝 웃게 그려진 쪽)은 막지 못했다.
  it("입 — 작지 않아도 다문 입(closed-lip)이면 '활짝 웃는 입 금지', 이가 보이거나 넓으면 걸지 않는다(어른만)", () => {
    const must = (mouth: string, who = mom) =>
      buildPrompt(who, PHOTO, MOM_CARD.replace(/^- mouth: .*$/m, `- mouth: ${mouth}`))
        .split("\n")
        .find((l) => l.startsWith(G_MUST)) ?? "";
    assert.ok(must("thin lips, medium width, closed-lip").includes(G_MOUTH_CLOSED));
    assert.ok(must("medium, lips together").includes(G_MOUTH_CLOSED));
    assert.ok(must("thin, small, closed-lip").includes(G_MOUTH));
    assert.ok(!must("thin, small, closed-lip").includes(G_MOUTH_CLOSED), "작은 입 말이 먼저 — 한 마디만");
    for (const open of ["full, wide, showing teeth", "medium, medium, showing teeth", "full lips, wide"]) {
      assert.ok(!/the mouth keeps/.test(must(open)), open);
    }
    // 'not showing teeth' 의 teeth 를 이가 보이는 입으로 읽지 않는다
    assert.ok(must("medium, closed-lip, not showing teeth").includes(G_MOUTH_CLOSED));
    // 아이는 입 막기 줄 없음(부드러운 그림책 얼굴 그대로)
    assert.ok(!/the mouth keeps/.test(must("medium, closed-lip", person("child", { age: 6, gender: "girl" }))));
  });
});

describe("redrawLikeness — 사진(카드)으로 그렸으면 머리 비율 다시 그리기에 카드의 얼굴·머리 줄을 다시 적는다(2026-09-30)", () => {
  const MOM: HeadFix = { target: 7, verdict: "big", measured: 4.15 };
  const mom = person("mom", { callName: "엄마" });

  it("어른 — 나이·두드러진 특징·얼굴형·눈·눈썹·코·입·볼과 턱·피부 점·머리·앞머리만, 성별·피부색·안경·옷은 없다", () => {
    const l = redrawLikeness(mom, MOM_CARD);
    assert.ok(l);
    const lines = l.split("\n");
    assert.equal(
      lines[0],
      "LIKENESS SPEC — this person's real, recognisable face and hair, which the FIRST image was painted to match. Keep every trait below; where the FIRST image has drifted from one of them, follow the spec for the face and hair — everything else stays exactly as in the FIRST image.",
    );
    const keys = lines.filter((x) => x.startsWith("- ")).map((x) => x.slice(2, x.indexOf(":")));
    assert.deepEqual(keys, ["age", "distinctive", "face shape", "eyes", "eyebrows", "nose", "mouth", "cheeks and jaw", "skin marks", "hair", "fringe"]);
    assert.ok(lines.includes("Left and right in the spec (image-left / image-right) mean the left and right side of the picture as the viewer sees it, not the person's own left and right."));
    assert.ok(lines.includes(`${G_MUST}${[G_FRINGE, G_CENTRE, G_FACE, G_CHIN, G_EYES, G_NOSE, G_MOUTH, G_FRECKLES, G_MOLE].join("; ")}.`));
    assert.match(lines[lines.length - 1], /^ADULT FACE: .*unless the LIKENESS SPEC gives rosy cheeks\./);
    assert.ok(!/\bphoto|close-up/i.test(l), "다시 그리기에는 사진이 없다");
  });

  it("아이 — 얼굴형·볼과 턱·피부 점·앞머리만, 흉터·아이 쪽 말·ADULT FACE 는 없다", () => {
    const kid = person("child", { callName: "하온", age: 6, gender: "girl" });
    const l = redrawLikeness(kid, KID_CARD.replace("- face shape: long oval", "- face shape: long oval, baby-like"));
    assert.ok(l);
    const keys = l
      .split("\n")
      .filter((x) => x.startsWith("- "))
      .map((x) => x.slice(2, x.indexOf(":")));
    assert.deepEqual(keys, ["face shape", "cheeks and jaw", "skin marks", "fringe"]);
    assert.ok(l.includes("- face shape: long oval\n"), "아이 쪽 말은 특징 하나씩 뺀다");
    assert.ok(l.includes("- skin marks: a few freckles across the nose\n"));
    assert.ok(l.includes(`${G_MUST}${[G_FRINGE, G_CENTRE, G_FACE, G_CHIN, G_FRECKLES].join("; ")}.`));
    assert.ok(!/\bscar|ADULT FACE|\bphoto/i.test(l));
    assert.equal(CHILD_FRAMING.exec(l), null);
    assert.ok(!/\bbaby/i.test(l));
    // 아이 닮음 줄의 다시 그리기 판(2026-10-02) — 아이 쪽 말 없이(위 CHILD_FRAMING 검사가 함께 지킨다)
    assert.ok(l.includes("THIS PERSON'S OWN FACE"));
  });

  it("어른 카드의 아이 쪽 말은 빼고, 남는 칸이 없으면 null(예전 그대로 다시 그린다)", () => {
    const l = redrawLikeness(person("dad"), `${CARD}\n- cheeks and jaw: round baby face\n- skin marks: freckles; birthmark since he was a baby`);
    assert.ok(l && !l.includes("baby") && l.includes("- skin marks: freckles\n"));
    assert.equal(redrawLikeness(person("dad"), null), null);
    assert.equal(redrawLikeness(person("dad"), "- gender: man\n- glasses: none\n- clothing: navy"), null);
  });

  it("안경·수염 말은 두드러진 특징 줄에 섞여 있어도 특징 하나씩 뺀다 — FIRST 줄 '처음 그림에 있을 때만(never add any)'과 부딪히지 않게", () => {
    const dadCard = [
      "- gender: man",
      "- age: late 30s",
      "- distinctive: thick black rectangular glasses; short boxed beard; long narrow face",
      "- face shape: long oval",
      "- mouth: thin lips under a thin moustache, medium",
      "- hair: short black hair that frames the face",
      "- glasses: thick black rectangular frames",
      "- facial hair: short boxed beard",
    ].join("\n");
    const l = redrawLikeness(person("dad"), dadCard);
    assert.ok(l);
    assert.ok(l.includes("- distinctive: long narrow face\n"), l);
    assert.ok(!/glasses|beard|moustache|- glasses:|- facial hair:/i.test(l), l);
    assert.ok(l.includes("- hair: short black hair that frames the face\n"), "'frames the face' 는 머리 말 — 걸지 않는다");
    assert.ok(l.includes("- mouth: medium\n"), l);
  });

  // 2026-09-30 검토: 예전 FIRST 줄('얼굴·앞머리 그대로, 바꾸는 건 머리 크기와 목·몸통·다리뿐')이 뒤의 닮음 줄('어긋났으면 카드대로')을
  // 더 센 말로 막았다 — 닮음 줄이 붙으면 FIRST 줄이 '얼굴·머리는 닮음 줄이 바로잡는 곳만 바꾼다'로 바뀐다. 없으면 예전 글 그대로.
  it("다시 그리기 요청 — 참고 그림은 그대로(처음 그림 + 비율 견본), 닮음 줄은 FIRST 줄 바로 뒤, FIRST 줄은 '닮음 줄이 바로잡는 곳만', 나머지 글은 같다", () => {
    const likeness = redrawLikeness(mom, MOM_CARD);
    assert.ok(likeness);
    const plain = headRedrawRecipe({ first: "F", guide: "G", fix: MOM });
    const r = headRedrawRecipe({ first: "F", guide: "G", fix: MOM, likeness });
    assert.deepEqual(r.references, ["F", "G"]);
    const lines = r.prompt.split("\n");
    const oldFirst = plain.prompt.split("\n")[1];
    assert.equal(
      lines[1],
      "FIRST image = our own earlier painting of this person — repaint THIS SAME character from the FIRST image. Keep exactly as in the FIRST image: glasses, beard or moustache only if the FIRST image has them (never add any), the skin tone, the body build, the clothes, shoes and all their colours, and the watercolor rendering (brushwork, line, soft washes). Keep the face (face shape, eyes, eyebrows, nose, mouth), the hairstyle, hair length, fringe, hair colour and the age the face shows as in the FIRST image too, except where the LIKENESS SPEC below corrects them — there the spec wins. Copy everything else from it EXCEPT its head-to-height ratio — only the head size, the length of the neck, torso and legs, and the face and hair traits the LIKENESS SPEC corrects change.",
    );
    assert.ok(!lines[1].includes("Copy everything from it EXCEPT"), "'얼굴도 그대로, 바꾸는 건 비율뿐'이 닮음 줄을 이기지 않게");
    assert.equal(lines[2], likeness.split("\n")[0]);
    assert.ok(r.prompt.includes(`${likeness}\nSECOND image = PROPORTION GUIDE only`));
    assert.equal(
      r.prompt.replace(`${likeness}\n`, "").replace(lines[1], oldFirst),
      plain.prompt,
      "닮음 줄·FIRST 줄 말고는 예전 글 그대로",
    );
    const hit = /\bphoto|close-up|painting-style sample|another member of the same family|APPEARANCE/i.exec(r.prompt);
    assert.equal(hit, null, `'${hit?.[0]}'`);
    assert.equal(CHILD_FRAMING.exec(r.prompt), null);
    // 칩 갈래(닮음 줄 없음)는 예전과 한 글자도 같다
    assert.equal(headRedrawRecipe({ first: "F", guide: "G", fix: MOM, likeness: null }).prompt, headRedrawPrompt(MOM, { guide: true }));
    assert.equal(plain.prompt, headRedrawPrompt(MOM, { guide: true }));
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

describe("모자·액세서리는 그리지 않는다 — 사진·특징표·칩 어느 갈래든(사장님 2026-10-14 '모자 정도는 빠져야')", () => {
  const NO_ACC = /\nNO HEADWEAR OR ACCESSORIES — this portrait is their base look in every book: never draw a hat, cap, beanie, hood, helmet, hair clip/;

  it("사진·특징표·칩 갈래 모두 금지 줄이 있고, '생김새 줄이 원하면 그린다'는 예외가 없다 — 옛 화면이 모자를 보내도", () => {
    const mom = person("mom", { callName: "엄마", looks: "평소에 모자를 즐겨 한다" });
    for (const p of [buildPrompt(mom, PHOTO), buildPrompt(mom, NO_PHOTO, CARD), buildPrompt(mom, NO_PHOTO)]) {
      assert.match(p, NO_ACC);
      assert.ok(!p.includes("unless the appearance line asks for them"), "사진 규칙의 예외가 없다");
      assert.ok(!/DO NOT invent[^\n]*\bhat\b/.test(p), "DO NOT 줄에 '있으면 그린다'는 모자가 남지 않는다");
    }
  });

  it("안경은 금지 목록에 없다 — 얼굴이라 안경 규칙을 따른다", () => {
    const line = buildPrompt(person("dad"), PHOTO).split("\n").find((l) => l.startsWith("NO HEADWEAR OR ACCESSORIES"));
    assert.ok(line && /glasses are part of the face, not an accessory/.test(line), line);
    assert.ok(line && !/\bglasses,/.test(line.replace(/sunglasses/g, "")), "평범한 안경은 빼라는 목록에 없다");
  });
});
