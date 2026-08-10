import { NextResponse } from "next/server";
import { ART_STYLES } from "@/lib/art-styles";
import { GeminiError, fromDataUrl, generateImage, toDataUrl } from "@/lib/gemini";

/**
 * 캐릭터 시트 — 삽화 일관성의 축.
 *
 * 인수인계 앱이 검증한 방식: 시트를 한 장 만들어 매 쪽 삽화에 참조로 재주입하면
 * 8쪽 내내 같은 얼굴이 나온다. 우리는 사진 없이 클로드가 쓴 인물 묘사(@@CHARACTER@@)
 * 로 시트를 만든다. 역할 분담: 클로드가 묘사를 쓰고, Gemini는 그리기만 한다.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 본문이 JSON이 아닙니다." }, { status: 400 });
  }

  const input = body as {
    characters?: { name?: unknown; description?: unknown }[];
    artStyleId?: unknown;
    drawing?: unknown;
    /** 아이 사진(베타 시험) — 저장하지 않고 이 요청 안에서만 쓴다. */
    photo?: unknown;
    looks?: unknown;
  };

  /**
   * 아이 생김새 — 설정에서 고른 특징(머리·안경·좋아하는 옷 색·주근깨 등)을 한 줄로 받는다.
   * 사진이 아니라 특징만 받는 이유: 아동 얼굴은 개인정보 부담이 크고, 어설프게 닮으면
   * 오히려 실망한다. 특징만으로도 "우리 애 같네"는 충분히 나온다.
   * 이 시트가 모든 쪽 삽화의 기준이므로, 여기 한 번만 넣으면 책 전체에 적용된다.
   */
  const looks = typeof input.looks === "string" ? input.looks.trim().slice(0, 200) : "";

  /**
   * 아이가 그린 그림(선택) — 주인공을 이 그림에서 따온다.
   *
   * "동화 속 주인공이 나 같지 않다"는 피드백(7번)의 해법. 아이 사진 대신 아이 '그림'을
   * 받는 이유: 얼굴 데이터를 다루지 않아 개인정보 부담이 없고, 아이에게는
   * "내가 그린 애가 주인공이 됐다"가 훨씬 강한 몰입이다.
   * 시트 한 장이 모든 쪽 삽화의 기준이라, 여기만 물리면 8쪽 전체에 반영된다.
   */
  const drawing = typeof input.drawing === "string" ? fromDataUrl(input.drawing) : null;
  const photo = typeof input.photo === "string" ? fromDataUrl(input.photo) : null;

  const style =
    ART_STYLES.find((s) => s.id === input.artStyleId) ?? ART_STYLES[0];

  const characters = (input.characters ?? [])
    .map((c) => ({
      name: typeof c.name === "string" ? c.name.trim() : "",
      description: typeof c.description === "string" ? c.description.trim() : "",
    }))
    .filter((c) => c.name)
    .slice(0, 4);

  if (characters.length === 0) {
    return NextResponse.json({ error: "등장인물이 없습니다." }, { status: 400 });
  }

  const cast = characters
    .map((c) => `- ${c.name}: ${c.description || "주인공 아이"}`)
    .join("\n");

  // "wholesome, fully clothed"는 인수인계 문서의 함정 메모 — 유아 장면이 안전필터에
  // 과잉 차단되는 걸 이 순화 문구가 풀어준다.
  const prompt = [
    `Character reference sheet for a children's picture book, ${style.prompt}.`,
    `Characters:\n${cast}`,
    // 주인공(첫 번째 인물)의 생김새는 부모가 고른 특징을 그대로 따른다.
    looks
      ? `The FIRST character is the child hero. Their appearance MUST match these traits exactly: ${looks}. Keep these traits visible and consistent — they are how the child recognizes themselves. Hair texture is a hard identity trait: straight hair must stay completely straight with no curls or perm volume; wave, natural curls, and permed curls must remain visually distinct and must never be substituted for one another.`
      : "",
    // 아이 그림이 있으면 그 그림이 주인공의 원본이다 — 아이가 자기 캐릭터로 알아보게
    // 눈에 띄는 특징(머리 모양·옷 색·좋아하는 물건)을 반드시 살린다.
    /*
     * 아이 사진으로 주인공 만들기 — 베타 시험용(2026-08-10).
     *
     * 사진은 '닮은 초상화'를 그리라는 뜻이 아니다. 사진에서 알아볼 만한 특징
     * (머리색·머리모양·피부톤·눈매·안경)만 읽어, 고른 그림체의 캐릭터로 옮긴다.
     * 사실적으로 그리면 그림책 안에서 그 인물만 붕 떠 보이고, 아이도 자기 캐릭터로
     * 느끼지 못한다.
     *
     * 사진은 어디에도 저장하지 않는다 — 이 요청 안에서만 쓰고 버린다.
     * 임시저장(localStorage)에도 담기지 않는다.
     */
    photo
      ? [
          "The attached image is a PHOTOGRAPH of the real child who is the first character. Use it ONLY as a likeness reference for a stylized character design.",
          "READ these traits from the photo and carry them over: hair colour, hair length and shape, skin tone, eye shape, eyebrow shape, and glasses if worn.",
          "DO NOT draw a realistic portrait, a photo-real face, or a traced likeness. This is a picture-book character, not a portrait.",
          "Render the character fully in the book's illustration style with the soft, simplified features of a children's book hero — the same drawing style you would use for any other character on this sheet.",
          "Draw a full-body character even though the photo shows only a face: invent age-appropriate clothing and a natural standing pose.",
          "The goal is that the child says 'that character looks like me', not 'that is a picture of me'.",
        ].join("\n")
      : "",
    drawing
      ? [
          "The attached image is a CHILD'S OWN DRAWING of the first character. Treat it as a design brief, NOT as art to copy.",
          "COPY these identifying traits exactly so the child recognizes their character: hair color and hairstyle, clothing type and colors, any accessory or object they drew, and any other standout detail.",
          "DO NOT copy the drawing's crude execution: no stick-figure limbs, no triangle body, no flat shapes, no childlike scrawl, no traced outlines.",
          "Instead draw a fully realized, professional picture-book character with natural body proportions for their age, real arms and legs, expressive face, and properly drawn clothing — as a skilled illustrator would when handed a child's sketch and asked to turn it into a real storybook hero.",
          "The child must think 'that's MY character, but drawn beautifully'.",
        ].join("\n")
      : "",
    /*
     * 시트가 흔들리면 책 전체가 흔들린다. 여기서 두 가지를 못박는다.
     *
     * ① 인원 수 — 목록에 없는 인물이 끼거나 같은 인물이 두 번 그려지면, 매 쪽 삽화가
     *    그 시트를 참조하므로 8쪽 내내 같은 사고가 반복된다.
     * ② 서로 달라 보이기 — 주인공과 친구가 비슷하게 그려지면, 쪽 삽화에서 모델이
     *    둘을 구별하지 못해 주인공을 두 번 그린다(실제 발생: 친구가 주인공의 쌍둥이로 나옴).
     *    그래서 머리와 옷 색이 확실히 다르도록 시트 단계에서 갈라 둔다.
     */
    `Draw EXACTLY ${characters.length} character${characters.length > 1 ? "s" : ""}, one per person listed above, arranged left to right in that order, evenly spaced and clearly separated.`,
    "Each listed character appears exactly ONCE. Never repeat a character, never draw twins, never add anyone who is not on the list.",
    characters.length > 1
      ? [
          "MAKE THEM UNMISTAKABLY DIFFERENT FROM EACH OTHER. This is the most important rule of this sheet.",
          "Give each character a clearly different hairstyle (length and shape) AND clearly different clothing colours. If two descriptions happen to be similar, push them apart — change one character's hair length and shirt colour so the two can never be confused.",
          "A reader glancing at this sheet must be able to tell instantly which character is which. Two characters that could be mistaken for the same child is a failure.",
        ].join("\n")
      : "",
    "Full body, front view, standing, simple plain white background.",
    "Consistent character design to be reused across every page of the book.",
    "Wholesome, innocent, fully clothed, child-friendly.",
    "NO text, no letters, no labels in the image.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const image = await generateImage({
      prompt,
      // 사진이 있으면 사진이 기준이다(둘 다 올릴 일은 화면에서 막아 둔다).
      references: photo ? [photo] : drawing ? [drawing] : undefined,
      aspectRatio: "1:1",
    });
    return NextResponse.json({ image: toDataUrl(image) });
  } catch (e) {
    if (e instanceof GeminiError) {
      return NextResponse.json({ error: e.message }, { status: e.status ?? 500 });
    }
    console.error("[character-sheet]", e);
    return NextResponse.json({ error: "캐릭터를 그리지 못했습니다." }, { status: 500 });
  }
}
