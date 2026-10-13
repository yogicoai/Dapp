/**
 * 목록에 없는 장소의 배경(사람 없는 빈 무대)을 Gemini 로 한 장 그린다. ≈ 55원/장.
 *
 *   node --experimental-strip-types --env-file=.env.local scripts/composite/bg_gen.mts \
 *        --place "<장소 묘사(영어)>" --style <화풍 기준 배경> --out <저장.png> [--ref <모양 참고 그림>]
 *
 * 화풍 기준 = 우리 배경 한 장. 그 붓결로 새 장소를 그려야 한 책 안에서 쪽마다 결이 안 튄다.
 * --ref 를 주면 '무엇이 있는지'(예: 2층 버스 모양)만 참고하고 화풍은 따르지 않는다.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { logScriptGemini } from "../ai-usage.mts";

const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const place = arg("place"), style = arg("style"), out = arg("out"), ref = arg("ref");
if (!place || !style || !out) {
  console.error("필요: --place --style --out");
  process.exit(2);
}
const KEY = process.env.GEMINI_API_KEY;
if (!KEY) throw new Error("GEMINI_API_KEY 없음");
const b64 = (p: string) => readFileSync(p).toString("base64");
const mime = (p: string) => (/\.png$/i.test(p) ? "image/png" : /\.webp$/i.test(p) ? "image/webp" : "image/jpeg");

const prompt = `${ref ? "Two pictures are attached. The FIRST shows WHAT is in the place (use it only for the objects and layout). The SECOND" : "The attached picture"} is an empty watercolour background from our picture book — paint the new place in EXACTLY that hand${ref ? "; take nothing else from the first picture's painting style" : ""}.

STYLE (from our background): delicate watercolour on cream paper, translucent light washes letting the paper show, a very thin soft pencil-and-sepia contour that often fades out, warm muted palette (cream, ochre, pale wood, sage, soft grey-blue), airy low contrast, visible paper grain. NOT vivid, NOT saturated, NOT glossy, NOT 3D, NOT anime, NOT flat vector, NOT photo-real, no thick black outlines.

THE PLACE: ${place}

THIS IS AN EMPTY STAGE — children will be placed into it later:
- Absolutely NO people anywhere. No figures, no silhouettes, no crowds, not even tiny ones far away. No animals.
- Keep the FRONT AND CENTRE of the floor OPEN, with a clear flat standing area across the lower half. Show the ground clearly.
- Put objects to the SIDES and the BACK; never a large object in the centre foreground.
- Near, middle and far depth so people can stand at different distances.

Landscape 4:3, painted to all four edges, no border, no vignette. No text, no letters, no numbers, no signs with writing, no logos, no signature.
Present-day South Korea.`;

const parts: unknown[] = [];
if (ref) parts.push({ inlineData: { mimeType: mime(ref), data: b64(ref) } });
parts.push({ inlineData: { mimeType: mime(style), data: b64(style) } });
parts.push({ text: prompt });

const res = await fetch(
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent",
  {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": KEY },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: "4:3" } },
    }),
  },
);
if (!res.ok) {
  console.error("실패", res.status, (await res.text()).slice(0, 500));
  process.exit(1);
}
const json: any = await res.json();
// 모델·토큰·금액을 앱과 같은 표(ai_usage)에 남긴다
await logScriptGemini("bg_gen", "gemini-2.5-flash-image", json);
const part = json.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
if (!part) {
  console.error("그림이 안 왔다", JSON.stringify(json).slice(0, 500));
  process.exit(1);
}
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, Buffer.from(part.inlineData.data, "base64"));
console.log("배경 ->", out);
