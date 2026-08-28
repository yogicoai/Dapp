import { NextResponse } from "next/server";
import { ART_STYLES } from "@/lib/art-styles";
import { pickLocationDetail } from "@/lib/scene-edit";
import { isIndoorPlace, locationKeyOf } from "@/lib/story-quality";
import {
  GeminiError,
  detectBlankCanvasBorder,
  generateImage,
  loadReferenceImage,
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
    storyText?: unknown;
    artStyleId?: unknown;
    characterSheet?: unknown;
    styleReference?: unknown;
    styleReferenceScene?: unknown;
    mood?: unknown;
    shape?: unknown;
    cast?: unknown;
    qualityCorrection?: unknown;
    locationDetail?: unknown;
    locationSheet?: unknown;
  };

  // 어느 화면에서 볼 동화인가 — 핸드폰은 세로(3:4), 태블릿은 가로(4:3)로 그린다.
  // 기기에 맞는 비율로 그려야 위아래(또는 좌우) 빈 띠 없이 그림이 꽉 찬다.
  const phone = input.shape === "phone";
  const aspectRatio = phone ? ("3:4" as const) : ("4:3" as const);

  const scene = typeof input.scene === "string" ? input.scene.trim() : "";
  /*
   * 부모가 대본 화면에서 손으로 적어 준 장소 설명(선택).
   *
   * 장소는 인물과 달리 참조 그림이 없어서 쪽마다 흔들린다("계곡"이 어떤 계곡인지
   * 모델이 매번 새로 상상한다). 부모가 "회색 자갈 바닥, 넓적한 바위 하나"처럼
   * 한 줄만 적어 주면 모든 쪽이 같은 곳을 그린다. 한국어 그대로 넘긴다.
   */
  const locationDetail =
    typeof input.locationDetail === "string" ? input.locationDetail.trim().slice(0, 300) : "";
  const storyText = typeof input.storyText === "string" ? input.storyText.trim().slice(0, 1200) : "";
  /*
   * 상한을 500 → 700으로 올렸다.
   *
   * 장면 한 줄에 등장인물·장소 고정 특징·물건 고정 모습이 모두 들어가면서 500자에
   * 닿는 쪽이 생겼다. 여기서 400을 돌려주면 그 쪽만 그림 없이 남는다 — 길다고 막을
   * 일이 아니다. 상한은 터무니없는 입력을 걸러내는 용도로만 남긴다.
   */
  if (!scene || scene.length > 700) {
    return NextResponse.json({ error: "장면 묘사가 비었거나 너무 깁니다." }, { status: 400 });
  }

  /*
   * 어떤 그림체로 만든 책인지 아는가.
   *
   * 옛 책에는 그림체가 저장돼 있지 않다. 그때 목록의 첫 그림체를 골라 이름으로
   * 못박아 버리면, 그 책이 실제로 어떤 그림체든 상관없이 그것으로 그려진다 —
   * 한 쪽만 다시 그렸을 때 그 쪽만 화풍이 달라지던 원인이다.
   */
  const matchedStyle = ART_STYLES.find((s) => s.id === input.artStyleId);
  const knownStyle = Boolean(matchedStyle);
  const style = matchedStyle ?? ART_STYLES[0];

  const sheet =
    typeof input.characterSheet === "string" ? await loadReferenceImage(input.characterSheet) : null;
  // 주소로 저장된 그림(cafe24)도 참조로 쓸 수 있어야 한다 — 한 쪽만 다시 그릴 때
  // 이 참조가 없으면 그 쪽만 그림체가 어긋난다.
  const styleReference =
    typeof input.styleReference === "string" ? await loadReferenceImage(input.styleReference) : null;
  const styleReferenceScene =
    typeof input.styleReferenceScene === "string" ? input.styleReferenceScene.trim().slice(0, 500) : "";
  const readLocation = (value: string) => {
    const match = /장소\s*:\s*([^\n—.-]+?)\s*[—-]\s*([^\n.]+)/.exec(value);
    return match ? { name: match[1].trim(), description: match[2].trim() } : null;
  };
  /**
   * 장면에 적힌 `물건: 이름 — 고정 모습.`을 모두 읽는다.
   *
   * 두 쪽 이상에 나오는 물건이 매번 다르게 그려지는 것이 가장 흔한 사고다(1쪽은 콘에
   * 담긴 딸기, 3쪽은 컵에 담긴 초코). 인물처럼 참조 그림이 없으니 글로만 잠근다 —
   * 대신 '단순하게' 잠근다. 꾸밀 거리가 많을수록 매번 다르게 그려지기 때문이다.
   */
  const readProps = (value: string) => {
    const found: { name: string; description: string }[] = [];
    const re = /물건\s*:\s*([^\n—.-]+?)\s*[—-]\s*([^\n.]+)/g;
    for (let m = re.exec(value); m && found.length < 3; m = re.exec(value)) {
      found.push({ name: m[1].trim(), description: m[2].trim() });
    }
    return found;
  };
  const props = readProps(scene);

  const currentLocation = readLocation(scene);
  const referenceLocation = readLocation(styleReferenceScene);
  // 이름 글자가 아니라 계열로 본다 — "놀이터"와 "동네 놀이터"는 같은 곳이다.
  const sameReferenceLocation = Boolean(
    currentLocation && referenceLocation &&
    locationKeyOf(currentLocation.name) === locationKeyOf(referenceLocation.name),
  );
  /*
   * 장소 기준 그림(장소 시트) — 인물 없는 그 장소의 그림.
   * 인물 시트가 얼굴을 잡듯 이것이 장소를 잡는다. 만들 때 장소마다 한 장 그려 둔다.
   */
  const locationSheet =
    typeof input.locationSheet === "string" ? await loadReferenceImage(input.locationSheet) : null;
  /*
   * 다른 장소의 그림은 참조로 넣지 않는다.
   *
   * 예전엔 같은 장소 그림이 없으면 1쪽 그림을 그림체 참조로 보내면서 "장소는 따라 하지
   * 마라"고 글로만 말했다. 그림 모델은 받은 그림에 강하게 끌린다 — 거실 그림을 주고
   * 놀이터를 그리라 하면 거실 창문이 섞여 나오고, 인물이 창문 양쪽으로 갈렸다.
   * 그림체는 인물 시트와 그림체 문구가 이미 잡는다. 그림체를 모르는 옛 책만 예외다.
   */
  const usedStyleReference =
    styleReference && (sameReferenceLocation || !knownStyle) ? styleReference : null;
  /*
   * 부모가 적은 장소 칸에서 이 쪽의 장소 부분만 고른다 — 계곡 바위가 거실에 따라오지 않게.
   */
  const pageLocationDetail = currentLocation
    ? pickLocationDetail(locationDetail, currentLocation.name)
    : locationDetail;
  /** 실내(true)·실외(false)·모름(null) — 배경 지시와 품질검사가 이걸 본다. */
  const indoor = currentLocation ? isIndoorPlace(currentLocation.name, currentLocation.description) : null;
  /*
   * 붙이는 그림의 순서 — 인물 시트 → 장소 시트 → 승인 쪽. 프롬프트의 각 문장이
   * "몇 번째 그림"을 말하는지 여기서 정한다. 셋이 다 있으면 '첨부된 그림'이라는 말만으로는
   * 어느 것인지 모델이 헷갈린다.
   */
  const attachedOrder = [
    sheet ? "sheet" : "",
    locationSheet ? "location" : "",
    usedStyleReference ? "style" : "",
  ].filter(Boolean);
  const nth = (kind: string) => ["FIRST", "SECOND", "THIRD"][attachedOrder.indexOf(kind)] ?? "attached";

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
  // 모델이 @@IMG@@에서 친구 이름을 실수로 빠뜨려도, 실제 본문에 이름이 나오면
  // 꽃이나 소품으로 대신하지 못하게 등장인물로 다시 잠근다.
  const sceneCast = cast.filter((c) => scene.includes(c.name) || storyText.includes(c.name));

  const prompt = [
    knownStyle
      ? `Children's picture book illustration, ${style.prompt}.`
      : "Children's picture book illustration in the exact style of the attached reference image(s).",
    /*
     * 글자 금지를 맨 앞에도 둔다.
     *
     * 그림 안에 엉터리 영어 문장이 그려져 나오는 일이 있었다(실제 발생). 아래에서
     * 본문을 '사실 확인용'으로 건네는데, 문장을 받은 그림 모델은 그것을 그려 넣으려
     * 든다. 금지 문구가 프롬프트 맨 끝에만 있으면 앞쪽의 문장에 밀린다.
     */
    "ABSOLUTE RULE — THIS IS A WORDLESS PICTURE. Draw ZERO writing of any kind: no captions, no sentences, no single letters, no numbers, no signs, no labels, no speech bubbles, no signatures, no watermarks — in Korean, English or any other script. Any written mark at all makes this page unusable.",
    /*
     * 그림체 잠금.
     *
     * 조심할 것: 어떤 그림체로 만든 책인지 모를 때(옛 책을 한 쪽만 다시 그릴 때)
     * 목록의 첫 그림체를 이름으로 못박으면, 붙여 준 참조 그림과 정면으로 싸운다.
     * 실제로 한 쪽만 다시 그렸더니 그 쪽만 화풍이 바뀌었다.
     * 그래서 그림체를 모르면 이름을 말하지 않고 참조 그림을 그대로 따르게 한다.
     */
    [
      knownStyle
        ? `STYLE LOCK — render the entire page ONLY as: ${style.prompt}.`
        : "STYLE LOCK — copy the rendering style of the attached reference image(s) exactly. Do not invent or substitute a style of your own; the attached pages define what this book looks like.",
      sheet
        ? `The ${nth("sheet")} attached image (the character reference sheet) is also the rendering-style reference. Match its medium, brush/line quality, shape language, facial construction, shading method, texture, saturation and finish exactly.`
        : "",
      "Never switch medium or rendering technique between pages. Do not turn watercolor into 3D, vector, crayon, anime, pencil, collage or a different kind of painting. Do not mix two styles in one page.",
    ].join("\n"),
    /*
     * 장소 잠금을 그림체 바로 다음, 프롬프트 앞쪽에 둔다.
     *
     * 예전엔 60줄짜리 프롬프트 한가운데 한 줄이었다. 인물 규칙은 대여섯 번 반복되는데
     * 장소는 한 번 — 긴 프롬프트에서 모델은 앞·뒤·반복되는 것을 지키고 중간 한 줄은
     * 흘린다. 장소가 쪽마다 바뀌던 이유 중 하나다. 앞에 두고 끝에서 한 번 더 확인시킨다.
     */
    currentLocation
      ? [
          `LOCATION LOCK — this page takes place at "${currentLocation.name}". Fixed features that MUST be visible: ${currentLocation.description}.`,
          "The place is as important as the characters. Draw exactly this kind of place with exactly these features — never a generic forest, park, hanok, classroom, street or a different house in its place, and never a prettier substitute.",
          locationSheet
            ? `The ${nth("location")} attached image is the LOCATION REFERENCE SHEET (the place with no people). It is the authoritative picture of this place: keep its ground, its big landmark, its architecture, its wall/floor colours and their arrangement. You may change the camera angle and crop; you may not change what the place is made of. Put the characters INTO this place.`
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "",
    `Scene: ${scene}`,
    /*
     * 구도 — 아래가 텅 비지 않게.
     *
     * 세로 판형에서 인물을 화면 위쪽에 몰아 그리고 아래 1/3을 바닥(잔디·타일)으로만
     * 채우는 그림이 반복해서 나왔다. 그림책으로 보면 허전하고, 아이 눈에는 인물이
     * 멀리 있어 표정이 잘 안 보인다.
     */
    [
      "COMPOSITION — fill the frame. Place the characters so they occupy the middle of the picture and reach comfortably into the lower half.",
      "Never leave the bottom third of the picture as bare empty ground, floor or grass with nothing in it. If space is left over, move the characters closer to the viewer and draw them larger rather than adding filler.",
      "Draw the characters large enough that a small child can read their faces and expressions clearly.",
      "Every face must be cleanly and correctly drawn: two clear eyes, a nose and a mouth in the right places, no smeared, doubled, melted or distorted features. A child whose face came out broken is the single most upsetting error in this book.",
      "Draw the expression the text asks for. If the child is looking up at something, their head is tilted back and their eyes point upward, not at the viewer.",
    ].join("\n"),
    /*
     * 배경을 채울 때 한국 = 전통이라고 읽지 않게 한다.
     *
     * 실제로 동물원 장면(회색 보도블록, 기린 우리)의 배경에 기와 지붕 팔각정이
     * 들어왔다. 장소 설명에 없는 건물인데, 모델이 "한국 공원"의 빈자리를 전통
     * 건물로 메운 것이다. 우리 동화는 지금 여기, 요즘 한국이다.
     */
    /*
     * 실내와 실외를 가른다.
     *
     * 아래 '요즘 한국' 줄이 아파트·보도·가로수처럼 바깥 것만 나열해서, 실내 장면에도
     * 그대로 들어가면 마트 진열대가 보도 위에 나오고 뒤에 아파트가 섰다(실제로 났다).
     * 실내면 안쪽만 그리라고 하고 바깥 목록은 뺀다.
     */
    indoor === true
      ? [
          `INDOOR SCENE — "${currentLocation?.name ?? "this place"}" is INSIDE a building. Draw only the interior: its floor, walls, ceiling or ceiling lights, shelves, furniture and fixtures.`,
          "No street, no sidewalk, no shop front, no apartment buildings, no sky, no trees and no outdoor ground may appear — except, at most, as a small view through a window. Never place indoor furniture or shelves outdoors, and never combine the inside and the outside of a building in one picture.",
          "PRESENT-DAY KOREA — the interior is modern: bright floors, plain walls, glass doors, modern fixtures.",
        ].join("\n")
      : "PRESENT-DAY KOREA — this book is set in Korea today. Backgrounds are modern: apartment blocks, concrete and paved walkways, metal or wooden fences, glass windows, ordinary city trees and lawns.",
    /*
     * 아이 안전 — 그림책은 아이가 따라 한다.
     *
     * 실제로 이런 그림이 나왔다. 본문이 "안전벨트를 딸깍 채웠어요"인데 그림에서는
     * 벨트 없이 뒷자리에서 무릎으로 서서 창문 쪽으로 몸을 돌리고 있었다.
     * 또 "소파에서 벌떡 일어났어요"를 소파 **위에 올라선** 모습으로 그렸다.
     * 네 살 아이가 보고 그대로 따라 하는 그림이라, 이건 품질이 아니라 안전 문제다.
     */
    [
      "CHILD SAFETY — a small child copies what they see in a picture book. Never draw a child in a posture that would be dangerous in real life.",
      "In a moving car the child is seated facing FORWARD in a rear seat with the seat belt clearly fastened across their chest and lap (or strapped into a child seat). Never draw a child kneeling, standing, turned backwards, leaning out, or without a visible belt while the car is moving. Adults in the car wear their belts too.",
      "Never draw a child standing on a sofa, chair, table, window sill, railing or stair rail. If the text says they jumped up or sprang up, draw them standing on the floor or sitting up on the seat.",
      "Korean cars are LEFT-hand drive: the steering wheel and the driver are on the LEFT side of the car.",
      "Indoors at home Koreans do not wear shoes, and shoes are left at the entrance, not in the middle of the living room. Inside a car, shoes stay ON.",
    ].join("\n"),
    "Do NOT add traditional Korean architecture that the scene did not ask for — no tiled-roof pavilion, no hanok, no thatched roof, no wooden gate, no paper-screen door, no stone jar terrace. If the location line does not name such a building, none appears in the picture.",
    /*
     * 물건 잠금 — 장소와 같은 이유로 넣는다. 다만 요구는 반대다: 장소는 '더 구체적으로',
     * 물건은 '더 단순하게'. 물건은 꾸밀 거리를 줄여야 다음 쪽에서 같게 그려진다.
     */
    /*
     * 옷이 장소·날씨와 맞아야 한다.
     *
     * 캐릭터 시트의 옷을 그대로 베끼라는 규칙이 세다 보니, 잠옷 차림으로 시작한
     * 아이가 눈밭까지 잠옷에 맨발로 나갔다(실제로 났다). 시트는 '누구인지'를
     * 잠그는 것이지 '무엇을 입고 이 쪽에 있는지'까지 정하지 않는다.
     */
    "CLOTHING MUST FIT THIS PAGE. Keep the character's identity from the sheet (face, hair, body), but dress them for THIS scene's place and weather. Outdoors in snow or cold: coat, hat, scarf, gloves and proper shoes — never pajamas, never bare feet. In bed or just waking: pajamas. Indoors at home: everyday clothes and socks or slippers. If the scene text names what they wear, follow the text.",
    props.length
      ? [
          `PROP LOCK — ${props
            .map((prop) => `"${prop.name}" (${prop.description})`)
            .join("; ")}. These objects come back on other pages and must look IDENTICAL every time.`,
          "Draw each one as a SIMPLE, plain shape in flat color, exactly as described and nothing more. Do not add a second scoop, a different flavor, sprinkles, toppings, patterns, logos, sparkles, ribbons or decoration that is not in the description.",
          "Simplicity is the point: a plain shape is what lets a child recognize it as the same object on the next page. If you are unsure how detailed to make it, make it simpler.",
          "The colour word in the description is EXACT, not a hint. A yellow hat is bright yellow, never straw, beige, tan or gold. A pink box is pink, never red or peach. Do not swap a stated colour for a more 'natural' material colour.",
        ].join("\n")
      : "",
    /*
     * 부모가 적어 준 장소는 모델이 상상한 장소보다 우선한다 — 아이가 실제로 아는
     * 곳이기 때문이다. 다만 이것도 '그릴 것'이지 '쓸 글자'가 아니라고 못박는다.
     */
    pageLocationDetail
      ? [
          `PLACE / OBJECT DETAIL (highest priority, written by the child's parent, Korean): ${pageLocationDetail}`,
          "Build this page's setting and any object it names from this description: the same ground, the same big landmark, the same colors, the same shape of object. If it conflicts with what you would normally imagine, follow this description.",
          "These are things to draw, never words to write in the image.",
        ].join("\n")
      : "",
    /*
     * 본문은 '무슨 일이 일어나는지'를 알려 주려고 건넨다 — 장면 설명만으로는 인물이
     * 무엇을 하는지 어긋나는 일이 있어서다.
     *
     * 그런데 문장을 그대로 주면 모델이 그 문장을 그림 안에 써 넣는다. 실제로 한국어
     * 본문을 옮긴 듯한 엉터리 영어가 그림에 박혀 나왔다. 그래서 '이건 읽을 거리가
     * 아니라 배경 지식'이라고 문장 바로 옆에서 못박는다.
     */
    storyText
      ? [
          "BACKGROUND INFORMATION ONLY — the sentences below tell you what happens so you draw the right action. They are NOT part of the picture.",
          "Never copy, translate, paraphrase or render these words anywhere in the image. Draw what they describe, not the words themselves.",
          `What happens on this page: ${storyText}`,
        ].join("\n")
      : "",
    mood ? `Mood: ${mood}.` : "",
    // 캐릭터 시트를 참조로 넣으면 모델이 '생김새'뿐 아니라 시트의 '나란히 선 배치'까지
    // 따라 그려서, 같은 인물이 두 명씩 나오는 일이 생긴다(실제 발생). 그래서
    // "생김새만 참고, 배치는 베끼지 말 것 + 같은 인물 두 번 금지"를 분명히 못박는다.
    sheet
      ? [
          `The ${nth("sheet")} attached image is the CHARACTER REFERENCE SHEET. Use it ONLY to know what each character looks like — face, hair, clothing, colors.`,
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
    usedStyleReference
      ? [
          `The ${nth("style")} attached image is a previously APPROVED page from this same book.`,
          "Use that approved page as the book-wide rendering reference: identical medium, dimensionality (2D versus 3D), line/edge treatment, textures, facial construction, lighting softness, colour strength and finish.",
          sameReferenceLocation
            ? `SAME LOCATION LOCK — the approved page and this page are both "${currentLocation?.name}". Preserve the same room/outdoor identity, architecture, wall and floor colours, windows, large furniture or play equipment and their stable arrangement. Change only camera angle, character pose and small story props.`
            : "Do not copy its composition or location because this scene uses a different place.",
          "Never change a 3D/clay-like book into a flat 2D drawing, or a flat drawing into 3D.",
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
                "The reference sheet is the ONLY source of each face. Copy each named character's face, hair shape and hair length from the sheet exactly as drawn there — same eyes, same nose, same mouth, same face shape, same fringe. Never invent a new face for someone who is on the sheet, and never redesign a face because this page shows a different angle or mood.",
                "These are Korean children. Every child has black or dark brown hair. Never draw blonde, golden, yellow, red, ginger or silver hair, whatever the wording of a description suggests.",
                "Keep each character's sex as the sheet shows it. Do not give a boy long hair or a bob, and do not turn a girl into a boy, from one page to the next.",
              ].join("\n")
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "",
    [
      `HOW MANY PEOPLE — the exact answer is ${sceneCast.length}. Draw exactly ${sceneCast.length} visible people. No extra background children, no crowd filler, and never a second copy of someone already in the picture.`,
      "If the scene names only one character, exactly one person is in this picture.",
      "Every named character — children AND adults such as a parent, teacher or shopkeeper — must be drawn with the face and hair the reference sheet gives them. An adult whose face changes from page to page reads as a different person to a child.",
      "Before drawing, assign each named character one position and one action from the Scene. Do not swap who performs an action, who has stopped, who leads, who follows, or which side of an object each person occupies.",
      "FINAL CHECK before you finish: look at every face you drew. If two figures share the same face, the same hair and the same clothes, that is the duplication error — remove one of them or redraw that figure as the correct, visibly different character.",
      currentLocation
        ? `Then check the PLACE: is this unmistakably "${currentLocation.name}" with ${currentLocation.description}? If the ground, the landmark or the colours are different, the page is wrong — fix the place before anything else.`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
    /*
     * 인물은 한 공간에 있어야 한다.
     *
     * 실제로 이런 그림이 나왔다 — 본문은 "하온이와 엄마는 집으로 돌아왔어요"인데,
     * 아이는 방 안에 앉아 있고 엄마는 비 오는 창밖에 서서 안을 들여다보고 있었다.
     * 아이 책에서 이건 따뜻한 장면이 아니라 무서운 장면이다.
     *
     * 왜 이렇게 되냐면, 앞 쪽의 장소(골목·놀이터)와 이 쪽의 장소(집)가 둘 다 신호로
     * 들어올 때 모델이 '창문'으로 두 장소를 한 그림에 욱여넣기 때문이다. 그러면서
     * 인물이 유리 양쪽으로 갈린다. 인원 수도 장소도 규칙을 어긴 게 아니라서
     * 지금까지 아무 검사에도 안 걸렸다.
     */
    sceneCast.length > 1
      ? [
          "ONE SHARED SPACE — every named character stands in the SAME physical space, on the same side of every wall, window, door, fence and gate.",
          "Never put one character indoors and another outdoors. Never place a character behind glass looking in at the others. Never separate them with a window frame, a doorway or a railing.",
          "A person standing outside in the rain looking in through a window is frightening in a children's book, not warm — never compose the page that way.",
          "If the story text says they arrived, came home or went somewhere together, they are together INSIDE that place, close enough to touch.",
        ].join("\n")
      : "",
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
    "IMAGE ONLY — absolutely NO captions, subtitles, story sentences, labels, speech bubbles, letters, numbers, logos, signatures, watermarks or readable writing in ANY language, including English and Korean. Leave the painted bottom area empty for the app to overlay text later.",
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
    // 참조 순서 = 프롬프트가 말하는 순서: 인물 시트 → 장소 시트 → (같은 장소의) 승인 쪽.
    let image = await generateImage({
      prompt,
      references: [sheet, locationSheet, usedStyleReference].filter(Boolean) as NonNullable<typeof sheet>[],
      aspectRatio,
    });

    // 흰 테두리는 재생성하지 않고 로컬 이미지 처리로 잘라내므로 AI 토큰이 들지 않는다.
    const borderIssue = await detectBlankCanvasBorder(image);
    if (borderIssue) image = await repairBlankCanvasBorder(image);

    // 판매용 품질 기준: 이미지 생성보다 훨씬 저렴한 멀티모달 검수는 항상 수행한다.
    const check = await validateIllustration({
      image,
      reference: sheet,
      styleReference: usedStyleReference,
      locationReference: locationSheet,
      indoor,
      scene: storyText ? `${scene}\nStory text: ${storyText}` : scene,
      expectedLocation: currentLocation
        ? `${currentLocation.name}: ${currentLocation.description}`
        : "",
      cast: sceneCast,
      stylePrompt: style.prompt,
    });
    /*
     * 글자가 그려진 건 다른 지적과 성격이 다르다.
     *
     * '그림체가 조금 다르다' 같은 지적은 사람에 따라 갈리지만, 그림 안의 글자는
     * 언제나 잘못이고 한눈에 보인다. 부르는 쪽이 이것만 따로 다뤄 꼭 다시 그리게
     * 구분해서 알려 준다.
     */
    const textIssue =
      !check.ok && /\b(text|writing|caption|letter|word|subtitle|script|signage|label)/i.test(check.issues);
    return NextResponse.json({
      image: toDataUrl(image),
      corrected: Boolean(borderIssue),
      qualityPassed: check.ok,
      ...(check.ok ? {} : { qualityWarning: check.issues, qualityIssue: textIssue ? "text" : "other" }),
    });
  } catch (e) {
    if (e instanceof GeminiError) {
      // 로그에 남겨야 "왜 그림이 안 나오지?"를 나중에 추적할 수 있다.
      // 특히 429(몰림·할당량)는 화면만 봐서는 다른 실패와 구분되지 않는다.
      console.error("[illustrate-page] Gemini", e.status, e.message);
      return NextResponse.json({ error: e.message }, { status: e.status ?? 500 });
    }
    console.error("[illustrate-page]", e);
    return NextResponse.json({ error: "삽화를 그리지 못했습니다." }, { status: 500 });
  }
}
