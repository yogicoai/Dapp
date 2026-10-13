/**
 * 우리 배경을 참조로 물려 한 쪽 장면을 통째로 그린다 (Gemini). ≈ 55원/장.
 *
 *   node --experimental-strip-types --env-file=.env.local scripts/composite/scene_gen.mts \
 *        --bg <배경> --cast <인물 줄판> --people "<왼→오른 인물 설명>" --moment "<그 순간>" --out <저장.png>
 *
 * 스티커 합성을 접은 이유(2026-09-28, 15쪽 검사): 그대로 쓸 쪽 0, 핵심 동작이 보인 쪽 0.
 * 스티커는 서로 안기·잡기·마주 보기를 못 하고 늘 카메라만 본다. 그래서 인물은 장면째 그리되,
 * 장소는 우리 배경을 물려 쪽마다 같게, 결은 배경과 같은 손으로 잡는다.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { logScriptGemini } from "../ai-usage.mts";

const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const bg = arg("bg"), cast = arg("cast"), people = arg("people"), moment = arg("moment"), out = arg("out");
if (!bg || !cast || !people || !moment || !out) {
  console.error("필요: --bg --cast --people --moment --out");
  process.exit(2);
}
const KEY = process.env.GEMINI_API_KEY;
if (!KEY) throw new Error("GEMINI_API_KEY 없음");
const b64 = (p: string) => readFileSync(p).toString("base64");
const mime = (p: string) => (/\.png$/i.test(p) ? "image/png" : /\.webp$/i.test(p) ? "image/webp" : "image/jpeg");

const prompt = `Paint ONE page of a Korean children's picture book. Two reference pictures are attached.

FIRST picture = THE PLACE. Paint the scene in exactly this place: the same architecture, the same objects in the same positions, the same colours and light, and roughly the same camera view. You may move the camera a little closer or change one small detail the moment asks for (for example a door that is now open), but it must be clearly the same place.

SECOND picture = THE PEOPLE, standing left to right at their TRUE RELATIVE HEIGHTS. Copy each person exactly — face, hair, skin, clothes and colours — and KEEP THEIR HEIGHTS IN PROPORTION: the little boy is much shorter than the grown-ups, exactly as shown.
The people, left to right: ${people}

STYLE: paint everything in the SAME hand as the FIRST picture — delicate translucent watercolour on cream paper, a very thin soft sepia contour that often fades out, warm muted palette, airy and low contrast. The people and the place must look painted together by one artist. Never a thick dark outline, never cel shading, never anime, never glossy, never 3D.

THE MOMENT: ${moment}

BODY PROPORTIONS — natural storybook proportions, the same as in the SECOND picture:
- A grown-up's head is about ONE-SEVENTH of their whole height; a 5-year-old's head about ONE-FIFTH.
- NEVER give a grown-up a big, oversized head. No chibi, no super-deformed, no bobble-head look. The father and mother have adult bodies with adult-sized heads.
- Heads, hands and feet stay in scale with each body.

WHICH WAY THEY FACE:
- At most ONE person may look straight at the viewer, and only if the moment needs it. Everyone else turns their head and body toward the other people or toward what the moment is about.
- NEVER line everyone up side by side facing the viewer. Stagger them in depth — someone a little nearer, someone a little further — and use three-quarter and side views.

HOW THE PEOPLE ACT — this is what matters most:
- They are IN the moment, not posing. They look at each other or at what the moment is about. Their bodies turn toward each other. Do NOT line them up in a row facing the viewer like a photograph.
- Where the moment says someone hugs, holds, or touches, their bodies really touch — arms wrapped around, hands really holding.
- Faces stay readable; three-quarter views are good.
- Everyone stands, sits or kneels ON the floor or ground, with soft shadows under them. Nobody floats, and nobody stands on a wall, a railing, a plant pot or furniture.
- The people are large enough to read clearly — the main people fill roughly the lower half of the picture.

Landscape 4:3, painted to all four edges, no border. No text, no letters, no numbers, no signs with writing, no signature, no watermark.`;

const res = await fetch(
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent",
  {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": KEY },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inlineData: { mimeType: mime(bg), data: b64(bg) } },
          { inlineData: { mimeType: mime(cast), data: b64(cast) } },
          { text: prompt },
        ],
      }],
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
await logScriptGemini("scene_gen", "gemini-2.5-flash-image", json);
const part = json.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
if (!part) {
  console.error("그림이 안 왔다", JSON.stringify(json).slice(0, 500));
  process.exit(1);
}
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, Buffer.from(part.inlineData.data, "base64"));
console.log("장면 ->", out);
