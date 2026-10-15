import { NextResponse } from "next/server";
import { TypecastError, synthesize } from "@/lib/typecast";
import { callerOf, isClonedVoice, ownsVoice } from "@/lib/api-auth";
import { DEV_ONLY_MESSAGE, isDevUser } from "@/lib/dev-mode";

/**
 * 문장 → 성우 음성(Typecast). 글자 수만큼 무료 크레딧(월 3만 자)이 나가므로
 * 한 번에 500자까지만 받는다 — 책 한 쪽(최대 100자)에는 넉넉하다.
 *
 * 복제된 부모 목소리(uc_...)로 합성하려면 **그 목소리가 자기 것이어야 한다.**
 * 예전엔 아무나 아무 voiceId 나 넘길 수 있어서, 남의 아빠 목소리로 500자까지
 * 아무 문장이나 만들 수 있었다. 배역 성우(tc_...)는 우리가 고른 공용 목소리라
 * 그대로 둔다 — 여기에 로그인을 걸면 비회원 둘러보기의 낭독이 막힌다.
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
    pitch?: unknown;
  };
  const text = typeof input.text === "string" ? input.text.trim() : "";
  const voiceId = typeof input.voiceId === "string" ? input.voiceId.trim() : "";
  const model = typeof input.model === "string" ? input.model.trim() : undefined;
  const emotion =
    typeof input.emotion === "string" ? input.emotion.trim().slice(0, 20) : undefined;
  const rawTempo = Number(input.tempo);
  // 0.5~2 밖은 말이 아니라 사고다 — 조용히 무시한다.
  const tempo = Number.isFinite(rawTempo) && rawTempo >= 0.5 && rawTempo <= 2 ? rawTempo : undefined;
  // 목소리 높이(반음) — 정수 -6~6 만(그 밖은 성우 목소리가 아니게 된다). 0·잘못된 값은 그대로.
  const rawPitch = Number(input.pitch);
  const pitch = Number.isInteger(rawPitch) && rawPitch >= -6 && rawPitch <= 6 && rawPitch !== 0 ? rawPitch : undefined;
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

  // 복제된 개인 목소리는 주인만 쓸 수 있다.
  if (isClonedVoice(voiceId)) {
    const caller = await callerOf(request);
    if (!caller) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    if (!(await ownsVoice(caller, voiceId))) {
      return NextResponse.json({ error: "내 목소리가 아닙니다." }, { status: 403 });
    }
    // 부모 목소리는 개발자 모드(fe)에서만 — 사장님 결정(2026-09-28).
    if (!isDevUser(caller.username)) {
      return NextResponse.json({ error: DEV_ONLY_MESSAGE }, { status: 403 });
    }
  }

  try {
    const { audio, contentType } = await synthesize({ text, voiceId, model, emotion, intensity, tempo, pitch });
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
