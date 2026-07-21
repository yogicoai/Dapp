import { NextResponse } from "next/server";
import { generateOutline } from "@/lib/anthropic";
import { StoryParseError } from "@/lib/story-format";
import { parseChild, parseMood, parseOccasion } from "../_input";

/**
 * 1단계 — 줄거리. 부모가 마음에 들 때까지 굴리는 관문이다.
 *
 * 이 단계가 싼 게 핵심이다(약 ₩22). 확정된 뒤에야 삽화 8장(₩440)이 돌아간다.
 * 무료 한도는 여기가 아니라 삽화 생성에 걸어야 한다.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 본문이 JSON이 아닙니다." }, { status: 400 });
  }

  const input = body as { child?: unknown; theme?: unknown; occasion?: unknown; mood?: unknown };

  let child, occasion, mood;
  try {
    child = parseChild(input.child);
    occasion = parseOccasion(input.occasion);
    mood = parseMood(input.mood);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  // 200자 — 단어뿐 아니라 "오늘 겪은 일" 같은 문장 두엇도 주제로 받는다.
  const theme = typeof input.theme === "string" ? input.theme.trim() : "";
  if (!theme || theme.length > 200) {
    return NextResponse.json({ error: "주제를 1~200자로 적어주세요." }, { status: 400 });
  }

  try {
    const outline = await generateOutline({ child, theme, occasion, mood });
    return NextResponse.json({ outline });
  } catch (e) {
    // 파싱 실패는 모델이 형식을 어긴 것 — 같은 입력으로 다시 하면 대개 통과한다.
    if (e instanceof StoryParseError) {
      return NextResponse.json(
        { error: "줄거리 형식이 어긋났습니다. 다시 시도해주세요.", detail: e.message },
        { status: 502 },
      );
    }
    console.error("[outline]", e);
    return NextResponse.json({ error: "줄거리를 만들지 못했습니다." }, { status: 500 });
  }
}
