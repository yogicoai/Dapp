/**
 * 그림체(삽화 스타일) 목록. 인수인계 앱의 9종 구성을 그대로 이어받았다.
 *
 * image: 선택 카드에 보여줄 견본(여우 그림). 인수인계 작업자가 만든 9종을
 *        style_01~09.webp로 받아 public/art-styles/에 넣었다. 순서는 화면 그대로.
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

export const ART_STYLES: ArtStyle[] = [
  {
    id: "watercolor",
    label: "따뜻한 수채화",
    emoji: "🎨",
    image: "/art-styles/style_01.webp",
    prompt: "warm soft watercolor storybook illustration, gentle brush strokes",
  },
  {
    id: "pastel",
    label: "파스텔 디지털",
    emoji: "🖍️",
    image: "/art-styles/style_02.webp",
    prompt: "soft pastel digital illustration, gentle gradients, dreamy tones",
  },
  {
    id: "crayon",
    label: "크레용 그림",
    emoji: "✏️",
    image: "/art-styles/style_03.webp",
    prompt: "children's crayon drawing style, waxy texture, playful lines",
  },
  {
    id: "ghibli",
    label: "지브리풍 애니",
    emoji: "🌿",
    image: "/art-styles/style_04.webp",
    prompt: "classic Japanese animation storybook style, painterly lush backgrounds",
  },
  {
    id: "pixar",
    label: "3D 픽사풍",
    emoji: "🧸",
    image: "/art-styles/style_05.webp",
    prompt: "modern 3D animated movie style, glossy soft-toy look, rounded shapes",
  },
  {
    id: "collage",
    label: "종이접기 콜라주",
    emoji: "📄",
    image: "/art-styles/style_06.webp",
    prompt: "paper cutout collage style, layered torn paper textures",
  },
  {
    id: "vector",
    label: "플랫 벡터",
    emoji: "🔷",
    image: "/art-styles/style_07.webp",
    prompt: "flat vector illustration, bold simple shapes, clean colors",
  },
  {
    id: "sketch",
    label: "연필 스케치",
    emoji: "✒️",
    image: "/art-styles/style_08.webp",
    prompt: "soft pencil sketch, graphite lines, lightly tinted",
  },
  {
    id: "inkwash",
    label: "동양화 먹그림",
    emoji: "🖌️",
    image: "/art-styles/style_09.webp",
    prompt: "East Asian ink wash painting, minimal expressive brush strokes",
  },
];

export const DEFAULT_ART_STYLE = ART_STYLES[0];
