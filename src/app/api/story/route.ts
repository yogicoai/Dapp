import { NextResponse } from "next/server";
import { generateStory } from "@/lib/anthropic";
import { StoryParseError } from "@/lib/story-format";
import { parseChild, parseOutlineInput } from "../_input";

/**
 * 2단계 — 확정된 줄거리를 8쪽 본문으로. 이야기를 새로 짓지 않고 살만 붙인다.
 *
 * 뼈대가 이미 정해져 있어서 기승전결이 덜 흔들리고, 실패해도 줄거리는 남아
 * 이 단계만 다시 하면 된다.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 본문이 JSON이 아닙니다." }, { status: 400 });
  }

  const input = body as { child?: unknown; outline?: unknown };

  let child, outline;
  try {
    child = parseChild(input.child);
    outline = parseOutlineInput(input.outline);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  try {
    const story = await generateStory({ child, outline });
    return NextResponse.json({ story });
  } catch (e) {
    if (e instanceof StoryParseError) {
      return NextResponse.json(
        { error: "본문 형식이 어긋났습니다. 다시 시도해주세요.", detail: e.message },
        { status: 502 },
      );
    }
    console.error("[story]", e);
    return NextResponse.json({ error: "본문을 만들지 못했습니다." }, { status: 500 });
  }
}
