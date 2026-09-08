import { NextResponse } from "next/server";
import { callerOf } from "@/lib/api-auth";
import { ART_STYLES } from "@/lib/art-styles";
import { GeminiError, fromDataUrl, generateImage, loadReferenceImage, shrinkForReference, toDataUrl } from "@/lib/gemini";
import { heroIdentity } from "@/lib/child-looks";

/*
 * 그리는 데 20~30초가 걸린다(검사에 걸려 다시 그리면 그 두 배).
 * 이 값을 안 적으면 배포 환경의 짧은 기본값이 걸려 도중에 잘린다 — 그때 돌아오는
 * 응답은 JSON이 아니라, 부르는 쪽은 이유도 모른 채 그 쪽만 빈 채로 넘어갔다.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 캐릭터 시트 — 삽화 일관성의 축.
 *
 * 인수인계 앱이 검증한 방식: 시트를 한 장 만들어 매 쪽 삽화에 참조로 재주입하면
 * 8쪽 내내 같은 얼굴이 나온다. 우리는 사진 없이 클로드가 쓴 인물 묘사(@@CHARACTER@@)
 * 로 시트를 만든다. 역할 분담: 클로드가 묘사를 쓰고, Gemini는 그리기만 한다.
 */
/*
 * 회원만 부를 수 있다.
 *
 * 예전엔 인증이 한 줄도 없어서, 주소만 알면 로그인 없이 Gemini·GPT 그림(장당 약 55원) 크레딧을
 * 태울 수 있었다. 토큰 차감마저 브라우저가 해서, 경로를 직접 부르면 토큰도 안 깎였다.
 * 막고 있던 것은 화면뿐이었다.
 *
 * 비회원은 깨지지 않는다 — 만들기 화면 자체가 로그인 없으면 되돌려 보내고,
 * 첫 화면의 만들기 단추도 비회원이면 /login 으로 간다.
 * 굽기 스크립트도 이 경로를 부르지 않는다(/api/tts 만 쓴다).
 */
export async function POST(request: Request) {
  const caller = await callerOf(request);
  if (!caller) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
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
    adultLooks?: unknown;
  };
  /**
   * 엄마·아빠 생김새 — 부모가 설정에서 고른 것(선택).
   * 이름(엄마/아빠)별로 한 줄씩. 안 온 사람에겐 아래 '지어내지 말라' 규칙만 걸린다.
   */
  const adultLooks = ((): { name: string; line: string }[] => {
    const v = input.adultLooks as Record<string, unknown> | undefined;
    if (!v || typeof v !== "object") return [];
    return Object.entries(v)
      .filter(([, line]) => typeof line === "string" && line.trim())
      .map(([name, line]) => ({ name, line: String(line).trim().slice(0, 120) }));
  })();

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
  /*
   * 그림체 견본을 참조로 붙인다.
   *
   * 시트는 책 전체의 그림체 기준인데, 정작 시트 자신은 한 줄짜리 영어 문구로만
   * 그렸다. 문구는 해석이 갈린다 — 같은 "따뜻한 수채화"가 어느 날은 진하고 어느 날은
   * 흐리게 나오고, 그 시트를 따라 책 전체가 흔들렸다. 부모가 화면에서 고른 견본
   * (public/art-styles/여우 그림)이 바로 그 그림체의 실물이라 이것을 함께 준다.
   * 요청의 origin으로 받아 온다 — Vercel 서버 함수 안에는 public 파일이 없을 수 있다.
   */
  const styleSample = style.image
    ? await loadReferenceImage(new URL(style.image, request.url).toString()).catch(() => null)
    : null;

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
  // 붙이는 그림 순서: 그림체 견본 → 아이 그림. 문장이 "몇 번째"를 말하게 한다.
  const attached = [styleSample ? "sample" : "", drawing ? "drawing" : ""].filter(Boolean);
  const nth = (k: string) => ["FIRST", "SECOND"][attached.indexOf(k)] ?? "attached";

  const prompt = [
    `Character reference sheet for a children's picture book, ${style.prompt}.`,
    styleSample
      ? [
          `The ${nth("sample")} attached image is the STYLE SAMPLE for this whole book. Copy its rendering exactly: medium, brush or line quality, edge softness, colour palette and saturation, shading method, paper/texture and finish.`,
          "It is a style reference ONLY — do NOT draw the fox, do NOT copy its subject, pose or composition. Only the way it is painted carries over.",
        ].join("\n")
      : "",
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
          `The ${nth("drawing")} attached image is a CHILD'S OWN DRAWING of the first character. Treat it as a design brief, NOT as art to copy.`,
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
    /*
     * 어른에게 안경·수염을 임의로 붙이지 않는다.
     *
     * 이 동화의 어른은 아이의 실제 엄마·아빠다. 안 쓰는 안경을 씌우면 아이가 "우리
     * 아빠"로 못 알아본다(실제로 6쪽 내내 안경잡이 아빠가 그려졌다). 구별은 머리
     * 길이와 옷 색으로 충분하다. 글로 적혀 있을 때만 그린다.
     */
    ...adultLooks.map(
      (a) =>
        `The adult "${a.name}" looks EXACTLY like this, chosen by the child's parent (Korean): ${a.line}. Follow it literally — if it says they do not wear glasses, draw no glasses.`,
    ),
    "DO NOT invent facial accessories or features for the ADULTS. Never add glasses, sunglasses, a beard, a moustache, a hat, earrings, a mole or a tattoo to any adult unless that exact item is written in their description above. These adults are the child's real family — a father wearing glasses he does not own makes the child fail to recognise him. Tell adults apart by HAIR LENGTH/STYLE and CLOTHING COLOUR only.",
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
    /*
     * 얼굴을 크게 — 시트는 매 쪽이 베끼는 원본인데, 전신만 세우면 얼굴이 가로의
     * 1/4~1/6밖에 안 돼 눈·코·입이 흐릿하다. 그래서 쪽마다 얼굴이 조금씩 달라졌다.
     * 위 줄엔 전신, 아래 줄엔 같은 인물의 얼굴 클로즈업을 크게 둔다.
     */
    [
      "LAYOUT — two rows on one simple plain white background.",
      "TOP ROW: each character full body, front view, standing, in the listed order.",
      "BOTTOM ROW: directly under each figure, a LARGE head-and-shoulders close-up of the SAME character (same face, same hair, same expression neutral-friendly), big enough that eyes, nose, mouth, eyebrows, face shape and fringe are sharp and easy to copy.",
      "The close-up must be the same person as the figure above it — identical design, just closer.",
    ].join("\n"),
    "Consistent character design to be reused across every page of the book.",
    "Wholesome, innocent, fully clothed, child-friendly.",
    "NO text, no letters, no labels in the image.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const image = await generateImage({
      prompt,
      // 순서 = 프롬프트의 '몇 번째': 그림체 견본 → 아이 그림
      references: [styleSample, drawing].filter(Boolean) as NonNullable<typeof drawing>[],
      /*
       * 인물이 셋 이상이면 가로로 넓은 4:3에 그린다.
       * 정사각형 한 장에 넷을 나란히 세우면 얼굴 하나가 가로 1/4밖에 안 돼,
       * 매 쪽 삽화가 참조하기엔 너무 흐릿한 기준이 된다(친구 얼굴이 쪽마다
       * 달라지던 실제 원인 중 하나). 넓게 그리면 얼굴에 픽셀이 더 간다.
       */
      aspectRatio: characters.length >= 3 ? "4:3" : "1:1",
    });
    /*
     * 작게 줄여서 돌려준다 — 이 시트는 쪽마다 참조로 **다시 올라가는** 그림이다.
     * 원본(2~3MB)을 그대로 두면 장소 시트와 합쳐 요청이 4.5MB를 넘어 그 쪽들이
     * 통째로 실패한다(2026-08-29 실제 사고).
     */
    return NextResponse.json({ image: toDataUrl(await shrinkForReference(image)) });
  } catch (e) {
    if (e instanceof GeminiError) {
      return NextResponse.json({ error: e.message }, { status: e.status ?? 500 });
    }
    console.error("[character-sheet]", e);
    return NextResponse.json({ error: "캐릭터를 그리지 못했습니다." }, { status: 500 });
  }
}
