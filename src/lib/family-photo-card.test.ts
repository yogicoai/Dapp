import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CARD_MIN_FIELDS,
  CARD_VALUE_MAX,
  DISTINCTIVE_VALUE_MAX,
  FEATURE_CARD_PROMPT,
  describePhoto,
  keepTraits,
  readFaceBox,
  readFeatureCard,
} from "./family-photo-card.ts";
import type { PortraitPhoto } from "./family-photo.ts";
import { resetImageFallbackForTests } from "./gemini.ts";

const FULL = [
  "gender: man",
  "age: late 30s",
  "distinctive: long narrow face, deep-set eyes, receding hairline",
  "face shape: long oval, narrow",
  "eyes: single eyelid, narrow, slightly upturned, wide-set",
  "eyebrows: thick, straight, black",
  "nose: medium, straight bridge",
  "mouth: wide, thin lips",
  "cheeks and jaw: flat cheeks, square jaw",
  "skin tone: light, warm",
  "hair: short, side parting, no fringe, straight, black",
  "glasses: thin round black metal frame",
  "facial hair: none",
  "build: slim; narrow shoulders",
  "clothing: navy knit sweater, grey trousers",
].join("\n");

describe("readFeatureCard — 글 모델의 답 → 특징 카드", () => {
  it("정해 둔 칸을 정해 둔 순서로 '- 칸: 값' 줄로 적는다", () => {
    const card = readFeatureCard(FULL);
    assert.ok(card);
    const lines = card.split("\n");
    assert.equal(lines.length, 15);
    assert.equal(lines[0], "- gender: man");
    assert.equal(lines[2], "- distinctive: long narrow face, deep-set eyes, receding hairline");
    assert.equal(lines[11], "- glasses: thin round black metal frame");
    assert.equal(lines[12], "- facial hair: none", "없다는 것('none')도 닮음이라 남긴다");
    assert.equal(lines[14], "- clothing: navy knit sweater, grey trousers");
  });

  it("꾸밈(굵게·줄머리 기호·번호)과 조금 다른 칸 이름도 받는다", () => {
    const card = readFeatureCard(
      [
        "Sure! Here is the description:",
        "**Gender:** Female",
        "- **Apparent age:** early 40s",
        "1. Face: round",
        "* Jawline: soft, rounded chin",
        "• Hairstyle: shoulder-length wavy dark brown hair with see-through bangs",
        "Eyewear: none",
      ].join("\n"),
    );
    assert.equal(
      card,
      [
        "- gender: Female",
        "- age: early 40s",
        "- face shape: round",
        "- cheeks and jaw: soft, rounded chin",
        "- hair: shoulder-length wavy dark brown hair with see-through bangs",
        "- glasses: none",
      ].join("\n"),
    );
  });

  it("모르는 칸(not visible·unknown·N/A)은 빼고, 정해 두지 않은 칸(이름 등)과 딴소리는 버린다", () => {
    const card = readFeatureCard(
      `${FULL.replace("nose: medium, straight bridge", "nose: not visible").replace("mouth: wide, thin lips", "mouth: N/A")}\nname: Kim\nidentity: a famous actor`,
    );
    assert.ok(card);
    assert.ok(!card.includes("nose") && !card.includes("mouth"));
    assert.ok(!/Kim|actor|name|identity/i.test(card));
    // 'na…'로 시작하는 낱말(navy·narrow)은 모른다는 답이 아니다
    assert.ok(card.includes("- clothing: navy knit sweater"));
  });

  it("같은 칸이 두 번 오면 앞의 것", () => {
    const card = readFeatureCard(`${FULL}\nsex: female`);
    assert.ok(card?.startsWith("- gender: man\n"), "'sex' 로 적어도 gender 칸이고, 앞의 것이 남는다");
    assert.ok(!card?.includes("female"));
  });

  it("수영복·잠옷·맨살·안은 사람이 적힌 칸은 버린다 — '그대로 맞출 것'으로 그림 프롬프트에 가지 않게", () => {
    const risky: [string, string][] = [
      ["clothing: navy knit sweater, grey trousers", "clothing: pink one-piece swimsuit"],
      ["clothing: navy knit sweater, grey trousers", "clothing: shirtless, blue swim trunks"],
      ["clothing: navy knit sweater, grey trousers", "clothing: striped pajamas"],
      ["clothing: navy knit sweater, grey trousers", "clothing: white T-shirt, holding a toddler"],
      ["build: slim; narrow shoulders", "build: slim, bare shoulders"],
    ];
    for (const [from, to] of risky) {
      const card = readFeatureCard(FULL.replace(from, to));
      assert.ok(card, to);
      const key = to.slice(0, to.indexOf(":"));
      assert.ok(!card.includes(`- ${key}:`), `${to} → 칸째 빠진다`);
      assert.equal(card.split("\n").length, 14);
    }
    // 머리를 묶어 넘긴(held back) 것 같은 흔한 말은 버리지 않는다
    const hair = readFeatureCard(FULL.replace("hair: short, side parting", "hair: long, held back in a low ponytail, side parting"));
    assert.ok(hair?.includes("- hair: long, held back in a low ponytail"));
  });

  it("값은 한 줄로 다듬는다 — 큰따옴표는 작은따옴표로, 제어 글자는 빈칸으로, 길면 낱말 경계에서 자른다", () => {
    // 9글자 낱말을 이어 120자째가 낱말 중간에 걸리게 한다
    const long = "abcdefgh ".repeat(20);
    const card = readFeatureCard(FULL.replace("hair: short", 'hair: "short"\u0007').replace("clothing: navy", `clothing: ${long}navy`));
    assert.ok(card);
    assert.ok(!card.includes('"'));
    assert.ok(card.includes("- hair: 'short' , side parting, no fringe, straight, black"), card);
    assert.ok(!/[\u0000-\u0009\u000b-\u001f]/.test(card));
    const clothing = card.split("\n").find((l) => l.startsWith("- clothing: "));
    assert.ok(clothing);
    const value = clothing.slice("- clothing: ".length);
    assert.ok(value.length <= CARD_VALUE_MAX);
    assert.ok(value.endsWith("abcdefgh"), `낱말 중간에서 자르지 않는다: …${value.slice(-12)}`);
  });

  it("두드러진 특징 줄 — 세미콜론으로 나눈 특징 3~5개를 그대로 두고, 넘기지 않을 특징만 하나씩 뺀다", () => {
    const five = "single eyelids and narrow eyes; straight blunt fringe; dimples; round chin; small mole under the left eye";
    const card = readFeatureCard(FULL.replace("distinctive: long narrow face, deep-set eyes, receding hairline", `distinctive: ${five}`));
    assert.ok(card?.includes(`- distinctive: ${five}`), card ?? "");
    // 쉼표로 나눠도 그대로(부탁 글과 다르게 적는 모델)
    assert.ok(readFeatureCard(FULL)?.includes("- distinctive: long narrow face, deep-set eyes, receding hairline"));
    // 한 특징이 걸려도 줄째 버리지 않는다
    const risky = readFeatureCard(
      FULL.replace("distinctive: long narrow face, deep-set eyes, receding hairline", "distinctive: bare shoulders; thick eyebrows; holding a cup; wide smile"),
    );
    assert.ok(risky?.includes("- distinctive: thick eyebrows; wide smile"), risky ?? "");
    assert.ok(!/bare|holding/.test(risky ?? ""));
    // 다 걸리면 줄째 빠진다
    const gone = readFeatureCard(FULL.replace("distinctive: long narrow face, deep-set eyes, receding hairline", "distinctive: swimsuit; not visible"));
    assert.ok(gone && !gone.includes("- distinctive:"));
  });

  it("두드러진 특징 줄 — 그날만의 것(모자·머리핀·귀걸이·화장·반창고·긁힌 자국·여드름·선글라스)은 특징 하나씩 뺀다", () => {
    const at = (v: string) =>
      readFeatureCard(FULL.replace("distinctive: long narrow face, deep-set eyes, receding hairline", `distinctive: ${v}`))
        ?.split("\n")
        .find((l) => l.startsWith("- distinctive: "));
    assert.equal(
      at("red baseball cap; thick eyebrows; plaster on forehead; dimples; pink hair clip; scratched cheek"),
      "- distinctive: thick eyebrows; dimples",
    );
    assert.equal(at("gold earrings; bright lipstick; acne on chin; sunglasses on head; round chin"), "- distinctive: round chin");
    assert.equal(at("face paint; bruise under eye"), undefined, "다 걸리면 줄째 빠진다");
    // 머리 모양·생김새 낱말은 걸리지 않는다(bowl cut·hooded eyes·cupid's bow, 평소 안경)
    const kept = "bowl cut fringe; hooded eyes; pronounced cupid's bow; thin round glasses; high cheekbones";
    assert.equal(at(kept), `- distinctive: ${kept}`);
  });

  it("두드러진 특징 줄은 글자 상한이 넉넉하고(다른 칸 120자), 넘으면 특징 경계에서 자른다", () => {
    assert.ok(DISTINCTIVE_VALUE_MAX > CARD_VALUE_MAX);
    const trait = (i: number) => `trait number ${i} with a fairly long description`;
    const many = Array.from({ length: 8 }, (_, i) => trait(i + 1)).join("; ");
    const card = readFeatureCard(FULL.replace("distinctive: long narrow face, deep-set eyes, receding hairline", `distinctive: ${many}`));
    const line = card?.split("\n").find((l) => l.startsWith("- distinctive: "));
    assert.ok(line);
    const value = line.slice("- distinctive: ".length);
    assert.ok(value.length <= DISTINCTIVE_VALUE_MAX && value.length > CARD_VALUE_MAX, `${value.length}`);
    assert.ok(value.endsWith("description"), `특징 반쪽이 남지 않는다: …${value.slice(-20)}`);
    assert.ok(value.startsWith(trait(1)));
  });

  it("keepTraits — 나눔표를 지키고, 모르는 특징·걸린 특징만 뺀다", () => {
    assert.equal(keepTraits("a; b; c", /b/), "a; c");
    assert.equal(keepTraits("a, b, c", /c/), "a, b");
    assert.equal(keepTraits("unknown; big eyes.", /x/), "big eyes");
    assert.equal(keepTraits("baby face", /baby/), "");
  });

  it("사람이 없다·거절·칸이 모자라면 null", () => {
    assert.equal(readFeatureCard("NO_PERSON"), null);
    assert.equal(readFeatureCard(`${FULL}\nNO_PERSON`), null);
    assert.equal(readFeatureCard("I can't help with identifying people in images."), null);
    assert.equal(readFeatureCard(""), null);
    const few = FULL.split("\n").slice(0, CARD_MIN_FIELDS - 1).join("\n");
    assert.equal(readFeatureCard(few), null);
    assert.ok(readFeatureCard(FULL.split("\n").slice(0, CARD_MIN_FIELDS).join("\n")));
  });
});

describe("FEATURE_CARD_PROMPT — 부탁 글", () => {
  it("누구인지·이름은 묻지 않고, 줄 16개(카드 15칸 + 얼굴 상자)와 NO_PERSON 을 적는다", () => {
    assert.match(FEATURE_CARD_PROMPT, /Do not say or guess who they are or their name/);
    assert.match(FEATURE_CARD_PROMPT, /do not judge or compliment their looks/);
    assert.match(FEATURE_CARD_PROMPT, /exactly these 16 lines/);
    assert.match(FEATURE_CARD_PROMPT, /NO_PERSON/);
    // 부탁 글의 칸 이름이 읽는 쪽(readFeatureCard·readFaceBox)의 칸 이름과 어긋나지 않는다 — 칸 줄만 모으면 15칸 + 상자 줄
    const fieldLines = FEATURE_CARD_PROMPT.split("\n").filter((l) => /^[a-z ]+: /.test(l));
    assert.equal(fieldLines.length, 16);
    assert.equal(readFeatureCard(fieldLines.join("\n"))?.split("\n").length, 15, "상자 줄은 카드 칸이 아니다");
    const boxLine = fieldLines[fieldLines.length - 1];
    assert.match(boxLine, /^face box: .*\[ymin, xmin, ymax, xmax\].*0-1000/);
    // 상자 줄 이름이 readFaceBox 가 읽는 이름이다
    assert.deepEqual(readFaceBox(`face box: [100, 200, 300, 400]`), [100, 200, 300, 400]);
  });

  it("알아보게 하는 특징 3~5개를 먼저 — 같은 나이·성별의 보통 얼굴과 견줘, 꼴·크기·자리만(예시는 예시일 뿐)", () => {
    const start = FEATURE_CARD_PROMPT.indexOf("Start from what makes this face recognisable");
    assert.ok(start > 0 && start < FEATURE_CARD_PROMPT.indexOf("gender: "), "칸 목록보다 앞에");
    assert.match(
      FEATURE_CARD_PROMPT,
      /pick the 3 to 5 lasting traits of the face, head and hair that most set it apart from other people of the same age and gender who look broadly like them/,
    );
    // 대부분이 가진 것(까만 머리·까만 눈)은 두드러진 특징이 아니다 — 가족 모두 같은 줄이 되지 않게
    assert.match(FEATURE_CARD_PROMPT, /not traits most such people share \(such as dark hair or dark eyes\)/);
    // 그날만의 것은 적지 않는다(모자·화장·반창고 …) — LIKENESS FIRST 가 '또렷이' 그리게 하므로
    assert.match(
      FEATURE_CARD_PROMPT,
      /never the expression, make-up, temporary marks such as spots, scratches or plasters, face paint, hats, hair accessories, jewellery or clothes/,
    );
    assert.match(FEATURE_CARD_PROMPT, /examples only — name what this face really has/);
    assert.match(FEATURE_CARD_PROMPT, /a straight blunt fringe, dimples, ears that stick out, thick straight eyebrows, a round chin, single eyelids, a small mole under the image-left eye/);
    // 고정관념·그날만의 예시는 빠졌다
    assert.ok(!/narrow eyes|gap-toothed/.test(FEATURE_CARD_PROMPT));
    assert.match(FEATURE_CARD_PROMPT, /describe shapes, sizes and positions only/);
    assert.match(FEATURE_CARD_PROMPT, /^distinctive: those 3 to 5 most recognisable traits, the most noticeable first, separated by semicolons$/m);
    // 칸 순서 — 성별·나이 다음, 얼굴형 등 일반 칸보다 앞
    const lines = FEATURE_CARD_PROMPT.split("\n");
    const at = (name: string) => lines.findIndex((l) => l.startsWith(`${name}: `));
    assert.ok(at("age") < at("distinctive") && at("distinctive") < at("face shape"));
    assert.ok(!/beautiful|handsome|pretty|attractive/i.test(FEATURE_CARD_PROMPT.replace("do not judge or compliment their looks", "")));
  });

  it("평균 얼굴이 되지 않게 — 두드러진 특징 칸을 묻고, 같은 나이·성별의 보통 얼굴과 견줘 적게 한다", () => {
    assert.match(FEATURE_CARD_PROMPT, /^distinctive: /m);
    assert.match(FEATURE_CARD_PROMPT, /compared with other people of the same age and gender who look broadly like them; write 'average' only when it truly is/);
    // 좌우는 보는 쪽 기준(그림 프롬프트 cardBlock 이 같은 말로 풀어 준다)
    assert.match(FEATURE_CARD_PROMPT, /Write left and right as image-left \/ image-right, as the viewer sees the photo\./);
    assert.match(FEATURE_CARD_PROMPT, /hairline \(receding/);
    assert.match(FEATURE_CARD_PROMPT, /cheekbones, dimples/);
  });

  it("'sex' 라는 말을 쓰지 않고, 드러낸 옷차림 낱말도 부탁 글에 넣지 않는다(옷은 평범한 옷만 묻는다)", () => {
    assert.ok(!/\bsex\b/i.test(FEATURE_CARD_PROMPT));
    assert.ok(!/swim|underwear|naked|nude|bare skin|sleepwear/i.test(FEATURE_CARD_PROMPT));
    assert.match(FEATURE_CARD_PROMPT, /^clothing: everyday garments .*do not mention any other person or anything held or carried/m);
  });
});

describe("readFaceBox — 같은 답의 얼굴 상자", () => {
  it("'face box:' 줄에서 [위, 왼, 아래, 오른] 0~1000 숫자 넷을 읽는다 — 꾸밈·칸 이름 변형·숫자 이름표가 섞여도", () => {
    assert.deepEqual(readFaceBox(`${FULL}\nface box: [212, 380, 468, 610]`), [212, 380, 468, 610]);
    assert.deepEqual(readFaceBox("- **Face_Box:** [212, 380, 468, 610]"), [212, 380, 468, 610]);
    assert.deepEqual(readFaceBox("face bounding box: ymin 212, xmin 380, ymax 468, xmax 610"), [212, 380, 468, 610]);
    assert.deepEqual(readFaceBox("face bbox: [212.5, 380, 468, 610.5]"), [212.5, 380, 468, 610.5]);
  });

  it("쓸 수 없는 상자는 null — 숫자가 넷이 아니다·0~1000 밖·위>아래·없다·NO_PERSON", () => {
    for (const bad of [
      FULL,
      "face box: not visible",
      "face box: [212, 380, 468]",
      "face box: [212, 380, 468, 610, 700]",
      "face box: [212, 380, 1468, 610]",
      "face box: [-5, 380, 468, 610]",
      "face box: [468, 380, 212, 610]",
      "face box: [212, 610, 468, 380]",
      "face: [212, 380, 468, 610]",
      `NO_PERSON\nface box: [212, 380, 468, 610]`,
      "",
    ]) {
      assert.equal(readFaceBox(bad), null, bad);
    }
  });

  it("상자는 카드 글에 들어가지 않는다(카드는 그림 프롬프트로 간다)", () => {
    const card = readFeatureCard(`${FULL}\nface box: [212, 380, 468, 610]`);
    assert.ok(card && !card.includes("212") && !/box/i.test(card));
  });
});

describe("describePhoto — 사진 → 특징 카드(글 모델 한 번)", () => {
  const PHOTO: PortraitPhoto = { mimeType: "image/jpeg", data: "UEhPVE9EQVRB" };
  const OK_BODY = JSON.stringify({
    candidates: [
      {
        finishReason: "STOP",
        content: { parts: [{ text: "thinking about it", thought: true }, { text: FULL }] },
      },
    ],
  });

  type Call = { url: string; init: RequestInit };

  /** fetch·키·console 을 바꿔 끼우고 돌린 뒤 되돌린다. console 에 찍힌 것은 logs 로 모은다. */
  async function withStubs<T>(
    reply: (call: Call) => Promise<Response>,
    run: (calls: Call[], logs: string[]) => Promise<T>,
    env: { key?: string; model?: string } = { key: "g-test" },
  ): Promise<T> {
    const saved = {
      fetch: globalThis.fetch,
      key: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_VISION_MODEL,
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
    };
    const calls: Call[] = [];
    const logs: string[] = [];
    const capture = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };
    try {
      resetImageFallbackForTests();
      if (env.key === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = env.key;
      if (env.model === undefined) delete process.env.GEMINI_VISION_MODEL;
      else process.env.GEMINI_VISION_MODEL = env.model;
      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const call = { url: String(url), init: init ?? {} };
        calls.push(call);
        return reply(call);
      }) as typeof fetch;
      console.log = capture;
      console.info = capture;
      console.warn = capture;
      console.error = capture;
      return await run(calls, logs);
    } finally {
      globalThis.fetch = saved.fetch;
      if (saved.key === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = saved.key;
      if (saved.model === undefined) delete process.env.GEMINI_VISION_MODEL;
      else process.env.GEMINI_VISION_MODEL = saved.model;
      console.log = saved.log;
      console.info = saved.info;
      console.warn = saved.warn;
      console.error = saved.error;
    }
  }

  it("사진을 먼저, 부탁 글을 뒤에 붙여 검수와 같은 글 모델에 한 번 보낸다 — 생각 글은 빼고 카드를 읽는다", async () => {
    await withStubs(
      async () => new Response(OK_BODY, { status: 200 }),
      async (calls, logs) => {
        const r = await describePhoto(PHOTO, { timeoutMs: 5_000 });
        assert.equal(r.outcome, "ok");
        assert.ok(r.card?.startsWith("- gender: man"));
        assert.ok(!r.card?.includes("thinking"));
        assert.equal(r.faceBox, null, "상자 줄이 없는 답이면 상자 없이");
        assert.equal(calls.length, 1);
        assert.match(calls[0].url, /\/models\/gemini-flash-latest:generateContent$/);
        const body = JSON.parse(String(calls[0].init.body)) as {
          contents: { parts: { inlineData?: { mimeType: string; data: string }; text?: string }[] }[];
          generationConfig: { temperature: number };
        };
        assert.deepEqual(body.contents[0].parts[0].inlineData, { mimeType: "image/jpeg", data: PHOTO.data });
        assert.equal(body.contents[0].parts[1].text, FEATURE_CARD_PROMPT);
        assert.ok(body.generationConfig.temperature <= 0.3);
        assert.deepEqual(logs, [], "사진도 카드도 찍지 않는다(찍는 건 부른 쪽 — 결과 갈래와 시간만)");
      },
    );
  });

  it("같은 답의 얼굴 상자를 함께 돌려준다 — 카드를 읽었을 때만(글 모델은 한 번)", async () => {
    const withBox = (text: string) =>
      JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text }] } }] });
    await withStubs(
      async () => new Response(withBox(`${FULL}\nface box: [212, 380, 468, 610]`), { status: 200 }),
      async (calls, logs) => {
        const r = await describePhoto(PHOTO, { timeoutMs: 5_000 });
        assert.equal(r.outcome, "ok");
        assert.deepEqual(r.faceBox, [212, 380, 468, 610]);
        assert.ok(r.card && !r.card.includes("212"));
        assert.equal(calls.length, 1);
        assert.deepEqual(logs, []);
      },
    );
    // 카드를 못 읽은 답(칸이 모자람)의 상자는 믿지 않는다
    await withStubs(
      async () => new Response(withBox("gender: man\nface box: [212, 380, 468, 610]"), { status: 200 }),
      async () => {
        const r = await describePhoto(PHOTO, { timeoutMs: 5_000 });
        assert.deepEqual([r.card, r.faceBox, r.outcome], [null, null, "unreadable"]);
      },
    );
  });

  it("GEMINI_VISION_MODEL 을 적으면 그 모델로", async () => {
    await withStubs(
      async () => new Response(OK_BODY, { status: 200 }),
      async (calls) => {
        await describePhoto(PHOTO, { timeoutMs: 5_000 });
        assert.match(calls[0].url, /\/models\/my-vision:generateContent$/);
      },
      { key: "g-test", model: "my-vision" },
    );
  });

  it("실패는 조용히 — 키 없음·HTTP 오류·차단·거절·못 읽음은 card null, 결과 갈래에 사진·구글 글이 섞이지 않는다", async () => {
    await withStubs(
      async () => new Response(OK_BODY, { status: 200 }),
      async (calls) => {
        const r = await describePhoto(PHOTO, { timeoutMs: 5_000 });
        assert.deepEqual([r.card, r.faceBox, r.outcome, calls.length], [null, null, "no-key", 0]);
      },
      {},
    );
    const cases: [Response, string][] = [
      [new Response(`{"error":{"message":"bad ${PHOTO.data}"}}`, { status: 400 }), "http 400"],
      [new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }), { status: 200 }), "blocked SAFETY"],
      [new Response(JSON.stringify({ candidates: [{ finishReason: "SAFETY", content: { parts: [] } }] }), { status: 200 }), "finish SAFETY"],
      [new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "NO_PERSON" }] } }] }), { status: 200 }), "no-person"],
      [new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "I can't describe this." }] } }] }), { status: 200 }), "unreadable"],
      [new Response("not json", { status: 200 }), "unreadable"],
    ];
    for (const [res, outcome] of cases) {
      await withStubs(
        async () => res,
        async () => {
          const r = await describePhoto(PHOTO, { timeoutMs: 5_000 });
          assert.equal(r.card, null, outcome);
          assert.equal(r.outcome, outcome);
          assert.ok(!r.outcome.includes(PHOTO.data));
        },
      );
    }
    await withStubs(
      async () => {
        throw new TypeError("fetch failed");
      },
      async () => {
        const r = await describePhoto(PHOTO, { timeoutMs: 5_000 });
        assert.deepEqual([r.card, r.outcome], [null, "network"]);
      },
    );
  });

  it("제한 시간이 지나면 요청을 끊고 card null(timeout)", async () => {
    await withStubs(
      ({ init }) =>
        new Promise<Response>((_, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
      async () => {
        const t0 = Date.now();
        const r = await describePhoto(PHOTO, { timeoutMs: 50 });
        assert.deepEqual([r.card, r.outcome], [null, "timeout"]);
        assert.ok(Date.now() - t0 < 2_000);
      },
    );
  });
});
