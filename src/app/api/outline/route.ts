import { NextResponse } from "next/server";
import { callerOf } from "@/lib/api-auth";
import { generateOutline } from "@/lib/anthropic";
import { StoryParseError } from "@/lib/story-format";
import {
  parseChild,
  parseMaterial,
  parseMood,
  parseOccasion,
  parsePageCount,
} from "../_input";

/**
 * 1단계 — 줄거리. 부모가 마음에 들 때까지 굴리는 관문이다.
 *
 * 이 단계가 싼 게 핵심이다(약 ₩22). 확정된 뒤에야 삽화 8장(₩440)이 돌아간다.
 * 무료 한도는 여기가 아니라 삽화 생성에 걸어야 한다.
 */
/*
 * 회원만 부를 수 있다.
 *
 * 예전엔 인증이 한 줄도 없어서, 주소만 알면 로그인 없이 Anthropic(줄거리 1회 약 22원) 크레딧을
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
    child?: unknown;
    material?: unknown;
    pageCount?: unknown;
    occasion?: unknown;
    mood?: unknown;
  };

  let child, material, pageCount, occasion, mood;
  try {
    child = parseChild(input.child);
    // 재료는 항목별로 받는다 (소재·누구랑·무슨일·자유입력). 콤마로 뭉치지 않는다.
    material = parseMaterial(input.material);
    pageCount = parsePageCount(input.pageCount);
    occasion = parseOccasion(input.occasion);
    mood = parseMood(input.mood);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  try {
    const outline = await generateOutline({ child, material, pageCount, occasion, mood });
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
