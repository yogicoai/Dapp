import { NextResponse } from "next/server";
import { ElevenError, synthesizeEleven } from "@/lib/eleven";

/**
 * 문장 → 복제된 부모 목소리(ElevenLabs)로 mp3.
 * voiceId는 /api/voice/clone에서 받아 저장해둔 복제 목소리 id.
 * 글자 수만큼 크레딧이 나가므로, 같은 (목소리, 문장)은 클라이언트가 기기에 캐시한다.
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

  if (!text || text.length > 1000) {
    return NextResponse.json({ error: "문장을 1~1000자로 보내주세요." }, { status: 400 });
  }
  if (!voiceId) {
    return NextResponse.json({ error: "voiceId가 필요합니다." }, { status: 400 });
  }

  try {
    const { audio, contentType } = await synthesizeEleven({ text, voiceId });
    return new Response(audio, {
      headers: { "Content-Type": contentType, "Cache-Control": "no-store" },
    });
  } catch (e) {
    if (e instanceof ElevenError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[tts/eleven]", e);
    return NextResponse.json({ error: "음성을 만들지 못했습니다." }, { status: 500 });
  }
}
