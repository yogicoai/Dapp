/**
 * 인물 한 명의 포즈 시트를 Gemini 로 한 장 뽑는다. ≈ 55원/장.
 *
 *   node --experimental-strip-types --env-file=.env.local scripts/composite/pose_sheet.mts \
 *        --who "<인물 설명(영어)>" --id <인물 이름표> --ref <인물 시트 그림> \
 *        --style <화풍 기준 배경> --out <저장 경로.png> [--adult]
 *
 * 참고 그림 두 장을 물린다.
 *   첫째 = 이 책의 기존 인물 시트 — **누구인지(얼굴·머리·옷)** 만 가져온다.
 *   둘째 = 우리 배경 한 장 — **어떻게 칠하는지(수채화 결)** 만 가져온다.
 * 그래서 옛 책의 아이가 얼굴은 그대로, 붓결만 새 배경과 같은 손으로 다시 태어난다.
 *
 * 앱의 IMAGE_PROVIDER(openai) 와 상관없이 **항상 Gemini** 로 그린다 — 사장님 결정(2026-09-28):
 * 배경은 GPT, 인물 스티커는 Gemini.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const who = arg("who"), id = arg("id") ?? "character", ref = arg("ref"), style = arg("style"), out = arg("out");
const adult = process.argv.includes("--adult");
if (!who || !ref || !style || !out) {
  console.error("필요: --who --ref --style --out");
  process.exit(2);
}

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) throw new Error("GEMINI_API_KEY 없음");

const b64 = (p: string) => readFileSync(p).toString("base64");
const mime = (p: string) => (/\.png$/i.test(p) ? "image/png" : /\.webp$/i.test(p) ? "image/webp" : "image/jpeg");

const POSES_CHILD = [
  "FRONT — standing straight and tall, arms relaxed at the sides, a gentle smile, looking at the viewer. (This one is the height reference: fully upright, feet together.)",
  "SIDE VIEW facing RIGHT — walking forward mid-step, arms swinging, in clean profile.",
  "BACK VIEW — seen from behind, walking away, head turned slightly so one cheek shows.",
  "ARMS UP — both arms raised high in delight, big open-mouthed laugh, standing on both feet.",
  "SITTING ON A CHAIR — three-quarter view facing right, bottom on an invisible seat, knees bent, lower legs hanging down, hands on the knees. Draw NO chair.",
  "SITTING ON THE FLOOR — legs crossed, hands in the lap, looking up with a small smile.",
  "CROUCHING — knees bent low, leaning forward, both hands on the knees, looking down with curiosity.",
  "FRONT, WORRIED — standing, hands clasped in front, eyebrows tilted up, a small worried or sad mouth.",
];
const POSES_ADULT = [
  "FRONT — standing straight, arms relaxed at the sides, a warm smile, looking at the viewer. (Height reference: fully upright.)",
  "SIDE VIEW facing RIGHT — walking forward mid-step, in clean profile.",
  "BACK VIEW — seen from behind, walking away.",
  "POINTING — standing, one arm raised pointing ahead with interest, happy face.",
  "SITTING ON A CHAIR — three-quarter view facing right, bottom on an invisible seat, knees bent, feet on the floor. Draw NO chair.",
  "KNEELING — down on one knee, arms open wide as if about to hug a small child, warm smile.",
  "CROUCHING — squatting down low to a child's eye level, hands on knees, gentle face.",
  "FRONT, CONCERNED — standing, one hand on the chest, soft worried face.",
];
// --last "<자세 설명>" — 책에만 필요한 자세(자전거 타기 등)로 8번째를 바꿔 끼운다. 장수·값은 그대로.
const last = arg("last");
const poses = [...(adult ? POSES_ADULT : POSES_CHILD)];
if (last) poses[poses.length - 1] = last;

const prompt = `Two reference pictures are attached.
FIRST picture = WHO this person is. Copy their identity exactly: face shape, eyes, hair style and colour, skin tone, body proportions, and their clothes and colours.
SECOND picture = HOW TO PAINT. It is an empty watercolour background from the same picture book. Paint the person in exactly that hand.
Take ONLY identity from the first picture and ONLY painting style from the second. Do not copy the second picture's scenery.

PAINTING STYLE (from the second picture): delicate translucent watercolour washes, soft muted warm palette, a very thin soft sepia contour that often fades out, low contrast, airy and gentle. Never a thick dark outline, never black ink, never cel shading, never anime, never glossy, never 3D, never flat vector.

THE PERSON: ${who}

LAYOUT: a POSE SHEET of this ONE person — exactly ${poses.length} full-body figures of the SAME person on ONE plain flat WHITE background, in two rows of four, evenly spaced, all drawn at EXACTLY THE SAME SCALE (the same person, the same size, as if photographed from the same distance).
${poses.map((p, i) => `  ${i + 1}. ${p}`).join("\n")}

CRITICAL:
- Plain flat WHITE background, perfectly even and empty. No floor, no ground line, no shadow, no furniture, no props, no scenery, no panel lines, no boxes, no border.
- A WIDE EMPTY GAP between every figure — no figure may touch or overlap another. Every figure fully inside the frame with margin.
- Same face, same hair, same clothes, same colours in all ${poses.length} figures.
- Do NOT paint paper texture or paper grain on the figures.
- Soft even light from above.
- No text, no numbers, no labels, no signature, no watermark.`;

const res = await fetch(
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent",
  {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": KEY },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inlineData: { mimeType: mime(ref), data: b64(ref) } },
          { inlineData: { mimeType: mime(style), data: b64(style) } },
          { text: prompt },
        ],
      }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: "4:3" } },
    }),
  },
);
if (!res.ok) {
  console.error(`[${id}] 실패`, res.status, (await res.text()).slice(0, 500));
  process.exit(1);
}
const json: any = await res.json();
const part = json.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
if (!part) {
  console.error(`[${id}] 그림이 안 왔다`, JSON.stringify(json).slice(0, 500));
  process.exit(1);
}
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, Buffer.from(part.inlineData.data, "base64"));
console.log(`[${id}] 포즈 시트 ${poses.length}자세 -> ${out}`);
