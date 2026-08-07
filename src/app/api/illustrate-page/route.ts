import { NextResponse } from "next/server";
import { ART_STYLES } from "@/lib/art-styles";
import {
  GeminiError,
  detectBlankCanvasBorder,
  fromDataUrl,
  generateImage,
  repairBlankCanvasBorder,
  toDataUrl,
  validateIllustration,
} from "@/lib/gemini";

/**
 * 쪽별 삽화. 클로드가 쓴 장면 묘사(@@IMG@@) + 그림체 프롬프트 + 캐릭터 시트 참조.
 *
 * 한 번에 한 쪽만 그린다 — 8쪽을 한 요청에 다 그리면 타임아웃에 걸리고, 쪽마다
 * 따로 하면 클라이언트가 진행률(3/8...)을 보여줄 수 있다. 하단 1/4 여백은 뷰어의
 * 텍스트 오버레이 자리라 프롬프트로 확보한다 (배경 아트에서 검증된 기법).
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 본문이 JSON이 아닙니다." }, { status: 400 });
  }

  const input = body as {
    scene?: unknown;
    artStyleId?: unknown;
    characterSheet?: unknown;
    mood?: unknown;
    shape?: unknown;
    cast?: unknown;
    qualityCorrection?: unknown;
  };

  // 어느 화면에서 볼 동화인가 — 핸드폰은 세로(3:4), 태블릿은 가로(4:3)로 그린다.
  // 기기에 맞는 비율로 그려야 위아래(또는 좌우) 빈 띠 없이 그림이 꽉 찬다.
  const phone = input.shape === "phone";
  const aspectRatio = phone ? ("3:4" as const) : ("4:3" as const);

  const scene = typeof input.scene === "string" ? input.scene.trim() : "";
  if (!scene || scene.length > 500) {
    return NextResponse.json({ error: "장면 묘사가 비었거나 너무 깁니다." }, { status: 400 });
  }

  const style =
    ART_STYLES.find((s) => s.id === input.artStyleId) ?? ART_STYLES[0];

  const sheet =
    typeof input.characterSheet === "string" ? fromDataUrl(input.characterSheet) : null;

  const mood = typeof input.mood === "string" ? input.mood.trim().slice(0, 80) : "";
  const qualityCorrection =
    typeof input.qualityCorrection === "string" ? input.qualityCorrection.trim().slice(0, 500) : "";

  /**
   * 등장인물 — 이름만이 아니라 생김새 설명까지 받는다.
   * 그림(캐릭터 시트) 하나만으로는 쪽마다 얼굴·옷이 조금씩 흔들린다. 같은 내용을
   * 글로도 함께 주면 두 갈래로 붙잡혀 훨씬 덜 흔들린다.
   */
  const castRaw = Array.isArray(input.cast) ? (input.cast as unknown[]) : [];
  const cast = castRaw
    .map((c) => {
      if (typeof c === "string") return { name: c.trim(), description: "" };
      const o = c as { name?: unknown; description?: unknown };
      return {
        name: typeof o?.name === "string" ? o.name.trim() : "",
        description: typeof o?.description === "string" ? o.description.trim().slice(0, 300) : "",
      };
    })
    .filter((c) => c.name)
    .slice(0, 6);

  /**
   * 책 전체 인물 중 이 장면에 이름이 실제로 적힌 사람만 보낸다.
   * 전체 cast를 보내면 참조 시트에 있는 친구를 Gemini가 배경 인물로 임의 추가한다.
   */
  const sceneCast = cast.filter((c) => scene.includes(c.name));

  const prompt = [
    `Children's picture book illustration, ${style.prompt}.`,
    [
      `STYLE LOCK — render the entire page ONLY as: ${style.prompt}.`,
      "The character reference sheet is also the rendering-style reference. Match its medium, brush/line quality, shape language, facial construction, shading method, texture, saturation and finish exactly.",
      "Never switch medium or rendering technique between pages. Do not turn watercolor into 3D, vector, crayon, anime, pencil, collage or a different kind of painting. Do not mix two styles in one page.",
    ].join("\n"),
    `Scene: ${scene}`,
    mood ? `Mood: ${mood}.` : "",
    // 캐릭터 시트를 참조로 넣으면 모델이 '생김새'뿐 아니라 시트의 '나란히 선 배치'까지
    // 따라 그려서, 같은 인물이 두 명씩 나오는 일이 생긴다(실제 발생). 그래서
    // "생김새만 참고, 배치는 베끼지 말 것 + 같은 인물 두 번 금지"를 분명히 못박는다.
    sheet
      ? [
          "The attached image is a CHARACTER REFERENCE SHEET. Use it ONLY to know what each character looks like — face, hair, clothing, colors.",
          "Do NOT copy the sheet's layout. The sheet lines characters up side by side on a blank background; this page is a real scene with its own composition.",
          "Each character exists exactly ONCE in this world. NEVER draw the same character twice in one picture — no twins, no repeated faces, no duplicated family members, no mirrored copies.",
          // 시트의 '정면 차렷 자세'까지 베껴 와서, 장면 한가운데 인물만 오려 붙인 것처럼
          // 뻣뻣하게 서 있는 그림이 나왔다(실제 발생). 자세는 장면이 정하게 못박는다.
          "CRITICAL — do NOT copy the sheet's POSE. The sheet shows a neutral standing front view; that is a catalogue pose, not a scene pose.",
          "Draw each character in the middle of the action this scene describes: crouching, reaching, running, leaning, turning, looking at what they are looking at.",
          "Use a natural storytelling camera angle — three-quarter view, profile, from behind, from above or below as the moment needs.",
          "Avoid a symmetrical front-facing full-body figure standing in the centre with arms hanging down and a blank expression. That looks pasted in, not part of the picture.",
          "Characters must physically belong to the scene: touching, holding, standing on, or reacting to what is around them, with an expression that matches the moment.",
        ].join("\n")
      : "",
    /*
     * 같은 아이가 한 화면에 두 번 나오는 사고 — 이 앱에서 가장 자주 나는 그림 오류다.
     *
     * 원인은 "두 번 그려라"가 아니라, 친구의 생김새가 주인공과 비슷하게 정해져
     * 모델이 둘을 구별하지 못하고 주인공을 복사하는 것이다(실제 발생: 놀이터 장면에서
     * 친구가 주인공과 같은 파란 옷·같은 얼굴로 나옴).
     *
     * 그래서 ① 인물마다 무엇이 다른지 대비시켜 주고 ② 다 그린 뒤 얼굴을 세어 보게 하는
     * 확인 절차를 붙인다. 금지만 적는 것보다 확인 단계를 주는 쪽이 훨씬 잘 먹힌다.
     */
    sceneCast.length > 0
      ? [
          `CAST LOCK — draw EXACTLY ${sceneCast.length} people: ${sceneCast.map((c) => c.name).join(", ")}. Every listed person appears exactly once.`,
          `The reference sheet may contain other book characters. They are ABSENT from this page and must be ignored: ${cast.filter((c) => !sceneCast.some((s) => s.name === c.name)).map((c) => c.name).join(", ") || "none"}.`,
          ...sceneCast.filter((c) => c.description).map((c) => `- ${c.name}: ${c.description}`),
          sceneCast.length > 1
            ? [
                "These are DIFFERENT people. They have different hair and different clothing colours — keep those differences obvious and never give one character another character's hair or outfit.",
                "Do not make the friend, sibling or classmate look like a copy of the main child. If the descriptions read alike, differentiate them clearly in the drawing.",
              ].join("\n")
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "",
    [
      `HOW MANY PEOPLE — the exact answer is ${sceneCast.length}. Draw exactly ${sceneCast.length} visible people. No extra background children, no crowd filler, and never a second copy of someone already in the picture.`,
      "If the scene names only one character, exactly one person is in this picture.",
      "Before drawing, assign each named character one position and one action from the Scene. Do not swap who performs an action, who has stopped, who leads, who follows, or which side of an object each person occupies.",
      "FINAL CHECK before you finish: look at every face you drew. If two figures share the same face, the same hair and the same clothes, that is the duplication error — remove one of them or redraw that figure as the correct, visibly different character.",
    ].join("\n"),
    // 일관성 — 이 앱의 핵심 약속이다. 쪽마다 얼굴이나 옷이 바뀌면 "내 동화"가 아니게 된다.
    sheet
      ? [
          "ABSOLUTE RULE — CHARACTER CONSISTENCY.",
          "These characters appear on every page of one book. They must look like the SAME person on page 1 and page 8.",
          // 주인공만 챙기고 친구는 쪽마다 바뀌는 일이 잦았다 — 아이는 친구도 알아본다.
          "This applies to EVERY character, not just the main child. The friend, the sibling, the classmate, the grown-up — each one keeps the exact same hair, face and outfit on every single page. A friend who changes shirt colour between pages breaks the book just as badly as a hero who does.",
          "Copy from the reference sheet without any change: face shape and features, eye shape and colour, eyebrows, hairstyle, hair colour and hair length, skin tone, body proportions and apparent age, EVERY garment with its exact colour and pattern, shoes, and every accessory.",
          "Do NOT restyle, do NOT age the character up or down, do NOT change the haircut, do NOT swap or recolour the outfit, do NOT add or remove accessories, do NOT 'improve' the design.",
          "Only the pose, the expression and the camera angle may change — never the character's appearance.",
        ].join("\n")
      : "",
    /*
     * 쪽마다 그림의 '크기'와 '색감'이 달라 보이는 문제.
     *
     * 크기: 캔버스 비율은 API로 고정하는데도, 모델이 그림 안에 흰 여백이나 액자
     * 테두리를 그려 넣어 어떤 쪽은 그림이 작아 보인다. 책을 넘길 때 그림이 커졌다
     * 작아졌다 하면 인쇄가 잘못된 책처럼 보인다.
     *
     * 색감: 한 쪽은 쨍하고 다음 쪽은 물 빠진 듯 나오면 같은 책 같지가 않다.
     * 다만 낮·밤처럼 장면이 정하는 차이는 살려야 하므로, '무엇을 칠하느냐'가 아니라
     * '어떤 톤으로 칠하느냐'를 맞추라고 이른다.
     */
    [
      "SAME SIZE ON EVERY PAGE — the artwork must fill the entire canvas, edge to edge.",
      "No white margins, no borders, no frames, no rounded corners, no vignette box, no drop shadow around the picture, no paper edge, no letterboxing bars. The illustration itself IS the whole image.",
      "Do not shrink the scene to sit inside a smaller box. Every page in this book must look like the same size of picture.",
      "",
      "SAME COLOUR FEEL ON EVERY PAGE — this book is one set, printed together.",
      "Keep the same palette family, the same saturation level, the same brightness and contrast, and the same softness of light across all pages.",
      "Never make one page vivid and glossy and the next page pale and washed out. Never switch between a warm and a cold overall cast without the story asking for it.",
      "Scene-driven changes are fine and welcome — night is darker, sunset is warmer, indoors is softer. What must stay constant is the TREATMENT: how strong the colours are, how much contrast, how the light is rendered.",
    ].join("\n"),
    "Keep the bottom quarter simple but FULLY PAINTED with scene color (ground, sky, water or another natural background) so text can be placed there. Simple never means white, blank, transparent or unfinished.",
    "Wholesome, innocent, fully clothed, child-friendly.",
    "NO text, no letters, no words in the image.",
    phone
      ? "Tall 3:4 portrait composition, framed for a phone screen held upright."
      : "Wide 4:3 landscape composition.",
    qualityCorrection
      ? `QUALITY CORRECTION FROM THE REJECTED VERSION: ${qualityCorrection}. Draw a new version that corrects this exact character/composition error.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    // 비용 상한: 페이지당 이미지 생성은 정확히 한 번만 호출한다.
    let image = await generateImage({
      prompt,
      references: sheet ? [sheet] : undefined,
      aspectRatio,
    });

    // 흰 테두리는 재생성하지 않고 로컬 이미지 처리로 잘라내므로 AI 토큰이 들지 않는다.
    const borderIssue = await detectBlankCanvasBorder(image);
    if (borderIssue) image = await repairBlankCanvasBorder(image);

    // 판매용 품질 기준: 이미지 생성보다 훨씬 저렴한 멀티모달 검수는 항상 수행한다.
    const check = await validateIllustration({
      image,
      reference: sheet,
      scene,
      cast: sceneCast,
      stylePrompt: style.prompt,
    });
    return NextResponse.json({
      image: toDataUrl(image),
      corrected: Boolean(borderIssue),
      qualityPassed: check.ok,
      ...(check.ok ? {} : { qualityWarning: check.issues }),
    });
  } catch (e) {
    if (e instanceof GeminiError) {
      return NextResponse.json({ error: e.message }, { status: e.status ?? 500 });
    }
    console.error("[illustrate-page]", e);
    return NextResponse.json({ error: "삽화를 그리지 못했습니다." }, { status: 500 });
  }
}
