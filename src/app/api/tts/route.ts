import { NextResponse } from "next/server";
import { TypecastError, synthesize } from "@/lib/typecast";

/**
 * 문장 → 성우 음성(Typecast). 글자 수만큼 무료 크레딧(월 3만 자)이 나가므로
 * 한 번에 500자까지만 받는다 — 책 한 쪽(최대 100자)에는 넉넉하다.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 본문이 JSON이 아닙니다." }, { status: 400 });
  }

  const input = body as {
    text?: unknown;
    voiceId?: unknown;
    model?: unknown;
    emotion?: unknown;
    intensity?: unknown;
    tempo?: unknown;
  };
  const text = typeof input.text === "string" ? input.text.trim() : "";
  const voiceId = typeof input.voiceId === "string" ? input.voiceId.trim() : "";
  const model = typeof input.model === "string" ? input.model.trim() : undefined;
  const emotion =
    typeof input.emotion === "string" ? input.emotion.trim().slice(0, 20) : undefined;
  const rawTempo = Number(input.tempo);
  // 0.5~2 밖은 말이 아니라 사고다 — 조용히 무시한다.
  const tempo = Number.isFinite(rawTempo) && rawTempo >= 0.5 && rawTempo <= 2 ? rawTempo : undefined;
  const rawIntensity = Number(input.intensity);
  const intensity = Number.isFinite(rawIntensity)
    ? Math.min(1.2, Math.max(0.3, rawIntensity))
    : undefined;

  if (!text || text.length > 500) {
    return NextResponse.json({ error: "문장을 1~500자로 보내주세요." }, { status: 400 });
  }
  if (!voiceId) {
    return NextResponse.json({ error: "voiceId가 필요합니다." }, { status: 400 });
  }

  try {
    const { audio, contentType } = await synthesize({ text, voiceId, model, emotion, intensity, tempo });
    return new Response(audio, {
      headers: { "Content-Type": contentType, "Cache-Control": "no-store" },
    });
  } catch (e) {
    if (e instanceof TypecastError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[tts]", e);
    return NextResponse.json({ error: "음성을 만들지 못했습니다." }, { status: 500 });
  }
}
