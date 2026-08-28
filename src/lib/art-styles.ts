/**
 * 그림체(삽화 스타일) 목록. 인수인계 앱의 9종 구성을 그대로 이어받았다.
 *
 * image: 선택 카드에 보여줄 견본(여우 그림). 인수인계 작업자가 만든 9종을
 *        style_01~09.webp로 받아 public/art-styles/에 넣었다. 순서는 화면 그대로.
 *
 * '종이접기 콜라주'(collage, style_06)는 뺐다 — 견본은 그럴듯한데 실제로 그리면
 * 종이 질감 때문에 인물 얼굴이 뭉개져 나왔다. 아이 얼굴이 망가지는 건 이 앱에서
 * 가장 속상한 오류라, 되는 그림체만 남긴다. 견본 파일은 지우지 않고 두었다.
 * prompt: 삽화 생성 때 Gemini 프롬프트에 붙는 영문 스타일 지시. 그림체 선택이
 *        실제 그림에 반영되는 지점이라 여기 같이 관리한다.
 */

export type ArtStyle = {
  id: string;
  label: string;
  emoji: string;
  image: string | null;
  prompt: string;
};

/*
 * prompt는 첫 구절이 예전 문구 그대로다 — 옛 책을 한 쪽만 다시 그릴 때 그림체 이름으로
 * 잠그는 자리라, 앞부분이 바뀌면 그 쪽만 결이 달라진다. 뒤에 붙인 설명은 재료·선·색·
 * 질감·마감을 못박아 "따뜻한 수채화"가 날마다 다르게 해석되는 폭을 줄인다.
 */
export const ART_STYLES: ArtStyle[] = [
  {
    id: "watercolor",
    label: "따뜻한 수채화",
    emoji: "🎨",
    image: "/art-styles/style_01.webp",
    prompt:
      "warm soft watercolor storybook illustration, gentle brush strokes; transparent wet-on-dry washes on cream paper, soft bleeding edges, thin sepia pencil contour, warm muted palette (peach, ochre, sage), light left unpainted for highlights, matte paper finish",
  },
  {
    id: "pastel",
    label: "파스텔 디지털",
    emoji: "🖍️",
    image: "/art-styles/style_02.webp",
    prompt:
      "soft pastel digital illustration, gentle gradients, dreamy tones; smooth airbrushed shading with no hard outlines, powdery pastel palette (lilac, mint, baby pink, cream), soft rim light, slight paper grain, clean and calm",
  },
  {
    id: "crayon",
    label: "크레용 그림",
    emoji: "✏️",
    image: "/art-styles/style_03.webp",
    prompt:
      "children's crayon drawing style, waxy texture, playful lines; visible wax-crayon strokes with white paper showing through, wobbly hand-drawn dark outlines, bright primary colours, flat fills with scribbled shading, cheerful and naive",
  },
  {
    id: "ghibli",
    label: "지브리풍 애니",
    emoji: "🌿",
    image: "/art-styles/style_04.webp",
    prompt:
      "classic Japanese animation storybook style, painterly lush backgrounds; hand-painted gouache backgrounds with soft light, clean thin cel outlines on characters, flat cel shading with one shadow tone, natural greens and sky blues, nostalgic film-like softness",
  },
  {
    id: "pixar",
    label: "3D 픽사풍",
    emoji: "🧸",
    image: "/art-styles/style_05.webp",
    prompt:
      "modern 3D animated movie style, glossy soft-toy look, rounded shapes; smooth subsurface-scattering skin, big expressive eyes, soft global illumination with gentle shadows, plush fabric and fur textures, shallow depth of field, saturated but soft colours",
  },
  {
    id: "vector",
    label: "플랫 벡터",
    emoji: "🔷",
    image: "/art-styles/style_07.webp",
    prompt:
      "flat vector illustration, bold simple shapes, clean colors; no outlines or uniform thin outlines, flat colour fills with at most two shade tones, geometric simplified forms, limited harmonious palette, crisp edges, no texture or gradients",
  },
  {
    id: "sketch",
    label: "연필 스케치",
    emoji: "✒️",
    image: "/art-styles/style_08.webp",
    prompt:
      "soft pencil sketch, graphite lines, lightly tinted; loose graphite hatching and construction lines left visible, warm off-white paper, light watercolour tint only on key areas (cheeks, clothing, one object), lots of white space, gentle and hand-made",
  },
  {
    id: "inkwash",
    label: "동양화 먹그림",
    emoji: "🖌️",
    image: "/art-styles/style_09.webp",
    prompt:
      "East Asian ink wash painting, minimal expressive brush strokes; sumi ink on rice paper with graded washes, confident single brush strokes, large empty space, restrained colour accents (one red or ochre touch), soft ink bleeds, calm and poetic",
  },
];

export const DEFAULT_ART_STYLE = ART_STYLES[0];
