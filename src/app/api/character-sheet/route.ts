import { NextResponse } from "next/server";
import { ART_STYLES } from "@/lib/art-styles";
import { GeminiError, fromDataUrl, generateImage, toDataUrl } from "@/lib/gemini";
import { heroIdentity } from "@/lib/child-looks";

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
    looks?: unknown;
    looksEn?: unknown;
    heroAge?: unknown;
    heroGender?: unknown;
  };

  /**
   * 아이 생김새 — 설정에서 고른 특징(머리·안경·좋아하는 옷 색·주근깨 등)을 한 줄로 받는다.
   * 사진이 아니라 특징만 받는 이유: 아동 얼굴은 개인정보 부담이 크고, 어설프게 닮으면
   * 오히려 실망한다. 특징만으로도 "우리 애 같네"는 충분히 나온다.
   * 이 시트가 모든 쪽 삽화의 기준이므로, 여기 한 번만 넣으면 책 전체에 적용된다.
   *
   * 영어(looksEn)가 오면 그것을 쓴다 — 영어 규칙 사이에 한국어 한 줄이 끼는 것보다
   * 확실히 읽힌다. 옛 호출은 한국어(looks)만 보내므로 그것도 받는다.
   */
  const looksKo = typeof input.looks === "string" ? input.looks.trim().slice(0, 200) : "";
  const looksEn = typeof input.looksEn === "string" ? input.looksEn.trim().slice(0, 400) : "";
  const looks = looksEn || looksKo;
  /*
   * 나이·성별은 이야기(클로드)에만 가고 여기엔 클로드가 쓴 생김새 줄만 왔다.
   * 클로드가 그 줄에 나이를 안 적으면 다섯 살이 여덟 살 얼굴로 나올 수 있었다.
   */
  const heroAge = typeof input.heroAge === "number" ? input.heroAge : null;
  const heroGender = typeof input.heroGender === "string" ? input.heroGender : undefined;
  const hero = heroIdentity(heroAge, heroGender);

  /**
   * 아이가 그린 그림(선택) — 주인공을 이 그림에서 따온다.
   *
   * "동화 속 주인공이 나 같지 않다"는 피드백(7번)의 해법. 아이 사진 대신 아이 '그림'을
   * 받는 이유: 얼굴 데이터를 다루지 않아 개인정보 부담이 없고, 아이에게는
   * "내가 그린 애가 주인공이 됐다"가 훨씬 강한 몰입이다.
   * 시트 한 장이 모든 쪽 삽화의 기준이라, 여기만 물리면 8쪽 전체에 반영된다.
   */
  const drawing = typeof input.drawing === "string" ? fromDataUrl(input.drawing) : null;

  const style =
    ART_STYLES.find((s) => s.id === input.artStyleId) ?? ART_STYLES[0];

  const characters = (input.characters ?? [])
    .map((c) => ({
      name: typeof c.name === "string" ? c.name.trim() : "",
      description: typeof c.description === "string" ? c.description.trim() : "",
    }))
    .filter((c) => c.name)
    /*
     * 상한 6 — 예전엔 4였다. 실제 책에서 아이 1 + 친구 3 + 선생님 = 5명이 나왔고,
     * 다섯째(선생님)가 시트에서 잘려 매 쪽 새 얼굴로 그려졌다. 친구를 3명까지
     * 넣을 수 있으니 어른 한둘을 더해도 6이면 덮인다.
     */
    .slice(0, 6);

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
    // 주인공(첫 번째 인물)은 나이·성별을 못박고, 생김새는 부모가 고른 특징을 그대로 따른다.
    `The FIRST character is the child hero: ${hero}. Draw a child of exactly that age — a small child's proportions and face, never older.`,
    looks
      ? `The hero's appearance MUST match these traits exactly: ${looks}. Keep these traits visible and consistent — they are how the child recognizes themselves. Hair texture is a hard identity trait: straight hair must stay completely straight with no curls or perm volume; wave, natural curls, and permed curls must remain visually distinct and must never be substituted for one another.`
      : "",
    // 아이 그림이 있으면 그 그림이 주인공의 원본이다 — 아이가 자기 캐릭터로 알아보게
    // 눈에 띄는 특징(머리 모양·옷 색·좋아하는 물건)을 반드시 살린다.
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
          "These are Korean children. ALL of them have black or dark brown hair. Never draw blonde, golden, yellow, red, ginger, silver or light-coloured hair on any child, even if a description hints at it — read such a hint as a dark shade, not a light one. Tell them apart by HAIRSTYLE and CLOTHING COLOUR only.",
          "Follow each description's stated sex exactly. A character described as a boy is drawn as a boy with short hair; a character described as a girl is drawn as a girl. Never infer sex from the name.",
          "Draw every face LARGE and clearly readable — this sheet is the identity reference for every page of the book, so each character's eyes, nose, mouth, hair shape and face shape must be sharp enough to copy. Do not shrink the characters to fit; crop the composition tighter if needed.",
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
      references: drawing ? [drawing] : undefined,
      /*
       * 인물이 셋 이상이면 가로로 넓은 4:3에 그린다.
       * 정사각형 한 장에 넷을 나란히 세우면 얼굴 하나가 가로 1/4밖에 안 돼,
       * 매 쪽 삽화가 참조하기엔 너무 흐릿한 기준이 된다(친구 얼굴이 쪽마다
       * 달라지던 실제 원인 중 하나). 넓게 그리면 얼굴에 픽셀이 더 간다.
       */
      aspectRatio: characters.length >= 3 ? "4:3" : "1:1",
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
