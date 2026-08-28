import { NextResponse } from "next/server";
import { ART_STYLES } from "@/lib/art-styles";
import { GeminiError, generateImage, loadReferenceImage, toDataUrl } from "@/lib/gemini";
import { isIndoorPlace } from "@/lib/story-quality";

/**
 * 장소 시트 — 인물 시트의 장소판.
 *
 * 인물은 시트 한 장을 매 쪽 참조로 넣어 8쪽 내내 같은 얼굴이 나온다. 장소는 그런 게
 * 없이 글 한 줄뿐이라, "계곡"이 어떤 계곡인지 모델이 쪽마다 새로 상상했다. 장소마다
 * **인물 없는 기준 그림**을 한 장 먼저 그려 두고, 그 장소의 모든 쪽에 참조로 넣는다.
 * 나중에 한 쪽만 다시 그릴 때도 이 그림이 기준이 된다.
 *
 * 인물 시트를 참조로 붙이지 않는다 — 붙이면 그 인물을 장소 그림에 그려 넣는다.
 * 그림체는 만들 때 고른 그림체 문구로 잠근다(만들기 단계라 그림체는 항상 알고 있다).
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 본문이 JSON이 아닙니다." }, { status: 400 });
  }

  const input = body as {
    name?: unknown;
    description?: unknown;
    artStyleId?: unknown;
    shape?: unknown;
    detail?: unknown;
  };
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 60) : "";
  const description = typeof input.description === "string" ? input.description.trim().slice(0, 300) : "";
  if (!name) {
    return NextResponse.json({ error: "장소 이름이 없습니다." }, { status: 400 });
  }
  // 부모가 적어 준 이 장소의 자세한 모습(선택). 모델이 상상한 것보다 우선한다.
  const detail = typeof input.detail === "string" ? input.detail.trim().slice(0, 200) : "";
  const style = ART_STYLES.find((s) => s.id === input.artStyleId) ?? ART_STYLES[0];
  const phone = input.shape === "phone";
  const indoor = isIndoorPlace(name, description);
  // 부모가 고른 그림체 견본(여우 그림)을 참조로 — 문구만으로는 그림체가 매번 조금씩 다르다.
  const styleSample = style.image
    ? await loadReferenceImage(new URL(style.image, request.url).toString()).catch(() => null)
    : null;

  const prompt = [
    `Children's picture book BACKGROUND illustration (an establishing shot of a place), ${style.prompt}.`,
    styleSample
      ? [
          "The attached image is the STYLE SAMPLE for this whole book. Copy its rendering exactly: medium, brush or line quality, edge softness, colour palette and saturation, shading method, paper/texture and finish.",
          "It is a style reference ONLY — do NOT draw the fox or any animal, do NOT copy its subject or composition. Draw the place described below in that painting style.",
        ].join("\n")
      : "",
    "ABSOLUTE RULE — THIS IS A WORDLESS PICTURE. Draw ZERO writing of any kind: no captions, no letters, no numbers, no signs, no labels, no logos, no watermarks, in any script.",
    `STYLE LOCK — render the entire page ONLY as: ${style.prompt}. This image will be the reference for every page set in this place, so the medium, line quality, texture, saturation and finish must be the book's style exactly.`,
    `THIS IS A LOCATION REFERENCE SHEET for the place called "${name}".`,
    description
      ? `Fixed features that MUST be clearly visible: ${description}.`
      : "",
    detail
      ? [
          `PLACE DETAIL (highest priority, written by the child's parent, Korean): ${detail}`,
          "Build the place from this description — the same ground, the same big landmark, the same colours. These are things to draw, never words to write.",
        ].join("\n")
      : "",
    [
      "Show the WHOLE place in one wide, eye-level view: the ground it stands on, its one big landmark, and its main colours, arranged so that another artist could redraw the same place from a different camera angle.",
      "Draw it as an EMPTY STAGE: NO people, NO children, NO adults, NO faces, NO animals, NO characters of any kind. The characters will be placed into this scene on later pages.",
      "Keep it specific and simple — a few clear, memorable features rather than clutter. Everything shown here must be easy to repeat.",
    ].join("\n"),
    // 실내면 안쪽만 — 바깥 목록(아파트·보도)을 주면 마트 안을 마트 앞 길거리로 그린다.
    indoor === true
      ? [
          `INDOOR PLACE — "${name}" is INSIDE a building. Draw only the interior: floor, walls, ceiling or ceiling lights, shelves, furniture and fixtures, from inside the room.`,
          "No street, no sidewalk, no shop front, no building exterior, no sky and no outdoor ground — except, at most, a small view through a window. Never combine the inside and the outside of a building.",
          "PRESENT-DAY KOREA — the interior is modern: bright floors, plain walls, glass doors, modern fixtures.",
        ].join("\n")
      : "PRESENT-DAY KOREA — this book is set in Korea today. Backgrounds are modern: apartment blocks, concrete and paved walkways, metal or wooden fences, glass windows, ordinary city trees and lawns.",
    "Do NOT add traditional Korean architecture that the place description did not ask for — no tiled-roof pavilion, no hanok, no thatched roof, no wooden gate, no paper-screen door, no stone jar terrace.",
    "The artwork must fill the entire canvas edge to edge: no white margins, no borders, no frames, no letterboxing.",
    "Keep the bottom quarter simple but FULLY PAINTED with scene colour (ground, floor, water or sky).",
    "Wholesome, child-friendly.",
    phone
      ? "Tall 3:4 portrait composition, framed for a phone screen held upright."
      : "Wide 4:3 landscape composition.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const image = await generateImage({
      prompt,
      references: styleSample ? [styleSample] : undefined,
      aspectRatio: phone ? "3:4" : "4:3",
    });
    return NextResponse.json({ image: toDataUrl(image) });
  } catch (e) {
    if (e instanceof GeminiError) {
      console.error("[location-sheet] Gemini", e.status, e.message);
      return NextResponse.json({ error: e.message }, { status: e.status ?? 500 });
    }
    console.error("[location-sheet]", e);
    return NextResponse.json({ error: "장소 그림을 그리지 못했습니다." }, { status: 500 });
  }
}
