import { NextResponse } from "next/server";
import { generateStory } from "@/lib/anthropic";
import { StoryParseError } from "@/lib/story-format";
import { StoryQualityError } from "@/lib/story-quality";
import { parseChild, parseMaterial, parseMood, parseOccasion, parseOutlineInput } from "../_input";

/**
 * 2단계 — 확정된 장면별 줄거리를 본문으로. 장면 하나가 한 쪽이 된다(1:1).
 * 이야기를 새로 짓지 않고 각 장면에 살만 붙인다. 쪽수는 줄거리 장면 수를 따른다.
 *
 * 뼈대가 이미 정해져 있어서 이야기 구조가 덜 흔들리고, 실패해도 줄거리는 남아
 * 이 단계만 다시 하면 된다.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 본문이 JSON이 아닙니다." }, { status: 400 });
  }

  const input = body as {
    child?: unknown;
    outline?: unknown;
    material?: unknown;
    occasion?: unknown;
    mood?: unknown;
    longer?: unknown;
  };

  let child, outline, material, occasion, mood;
  try {
    child = parseChild(input.child);
    outline = parseOutlineInput(input.outline);
    material = parseMaterial(input.material);
    occasion = parseOccasion(input.occasion);
    mood = parseMood(input.mood);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  const longer = input.longer === true;

  try {
    const story = await generateStory({ child, material, outline, occasion, mood, longer });
    return NextResponse.json({ story });
  } catch (e) {
    if (e instanceof StoryParseError) {
      return NextResponse.json(
        { error: "본문 형식이 어긋났습니다. 다시 시도해주세요.", detail: e.message },
        { status: 502 },
      );
    }
    if (e instanceof StoryQualityError) {
      return NextResponse.json(
        { error: "동화 품질 검사를 통과하지 못했어요. 다시 만들면 새로운 구성으로 시도합니다.", detail: e.issues },
        { status: 502 },
      );
    }
    console.error("[story]", e);
    return NextResponse.json({ error: "본문을 만들지 못했습니다." }, { status: 500 });
  }
}
