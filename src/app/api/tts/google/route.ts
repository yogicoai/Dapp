import { NextResponse } from "next/server";
import { GoogleTtsError, synthesizeGoogle } from "@/lib/google-tts";

/**
 * 문장 → 성우 음성(Google Cloud TTS). '내가 만든 동화' 실시간 낭독용.
 * 글자 수만큼 무료 크레딧(월 100만 자)에서 차감된다 — 한 쪽(최대 800자)에는 넉넉하다.
 * 같은 (성우, 문장)은 클라이언트가 기기에 캐시하므로 두 번째부터는 호출되지 않는다.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 본문이 JSON이 아닙니다." }, { status: 400 });
  }

  const input = body as { text?: unknown; voiceId?: unknown };
  const text = typeof input.text === "string" ? input.text.trim() : "";
  const voiceId = typeof input.voiceId === "string" ? input.voiceId.trim() : "";

  if (!text || text.length > 800) {
    return NextResponse.json({ error: "문장을 1~800자로 보내주세요." }, { status: 400 });
  }
  if (!voiceId) {
    return NextResponse.json({ error: "voiceId가 필요합니다." }, { status: 400 });
  }

  try {
    const { audio, contentType } = await synthesizeGoogle({ text, voiceId });
    return new Response(audio, {
      headers: { "Content-Type": contentType, "Cache-Control": "no-store" },
    });
  } catch (e) {
    if (e instanceof GoogleTtsError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[tts/google]", e);
    return NextResponse.json({ error: "음성을 만들지 못했습니다." }, { status: 500 });
  }
}
