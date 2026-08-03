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

  // 등장인물 이름 — "이 사람들만, 각자 한 번씩"을 못박아 복제를 막는 데 쓴다.
  const cast = Array.isArray(input.cast)
    ? (input.cast as unknown[])
        .map((n) => (typeof n === "string" ? n.trim() : ""))
        .filter(Boolean)
        .slice(0, 6)
    : [];

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
        ].join("\n")
      : "",
    cast.length > 0
      ? `The only people who may appear are: ${cast.join(", ")}. Draw each of them at most once, and only if this scene actually needs them.`
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
