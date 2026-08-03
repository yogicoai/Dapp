import { NextResponse } from "next/server";
import { ART_STYLES } from "@/lib/art-styles";
import { GeminiError, fromDataUrl, generateImage, toDataUrl } from "@/lib/gemini";

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

  const prompt = [
    `Children's picture book illustration, ${style.prompt}.`,
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
    cast.length > 0
      ? [
          `The only people who may appear are: ${cast.map((c) => c.name).join(", ")}. Draw each of them at most once, and only if this scene actually needs them.`,
          ...cast.filter((c) => c.description).map((c) => `- ${c.name}: ${c.description}`),
        ].join("\n")
      : "",
    // 일관성 — 이 앱의 핵심 약속이다. 쪽마다 얼굴이나 옷이 바뀌면 "내 동화"가 아니게 된다.
    sheet
      ? [
          "ABSOLUTE RULE — CHARACTER CONSISTENCY.",
          "These characters appear on every page of one book. They must look like the SAME person on page 1 and page 8.",
          "Copy from the reference sheet without any change: face shape and features, eye shape and colour, eyebrows, hairstyle, hair colour and hair length, skin tone, body proportions and apparent age, EVERY garment with its exact colour and pattern, shoes, and every accessory.",
          "Do NOT restyle, do NOT age the character up or down, do NOT change the haircut, do NOT swap or recolour the outfit, do NOT add or remove accessories, do NOT 'improve' the design.",
          "Only the pose, the expression and the camera angle may change — never the character's appearance.",
        ].join("\n")
      : "",
    "Keep the bottom quarter of the image simple and uncluttered (plain ground, sky, or soft color) so text can be placed there.",
    "Wholesome, innocent, fully clothed, child-friendly.",
    "NO text, no letters, no words in the image.",
    phone
      ? "Tall 3:4 portrait composition, framed for a phone screen held upright."
      : "Wide 4:3 landscape composition.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const image = await generateImage({
      prompt,
      references: sheet ? [sheet] : undefined,
      aspectRatio,
    });
    return NextResponse.json({ image: toDataUrl(image) });
  } catch (e) {
    if (e instanceof GeminiError) {
      return NextResponse.json({ error: e.message }, { status: e.status ?? 500 });
    }
    console.error("[illustrate-page]", e);
    return NextResponse.json({ error: "삽화를 그리지 못했습니다." }, { status: 500 });
  }
}
