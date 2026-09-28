import { NextResponse } from "next/server";
import { callerOf } from "@/lib/api-auth";
import { DEV_ONLY_MESSAGE, isDevUser } from "@/lib/dev-mode";
import { ElevenError, synthesizeEleven } from "@/lib/eleven";

/**
 * 문장 → 복제된 부모 목소리(ElevenLabs)로 mp3.
 * voiceId는 /api/voice/clone에서 받아 저장해둔 복제 목소리 id.
 * 글자 수만큼 크레딧이 나가므로, 같은 (목소리, 문장)은 클라이언트가 기기에 캐시한다.
 */
/*
 * 회원만 부를 수 있다.
 *
 * 예전엔 인증이 한 줄도 없어서, 주소만 알면 로그인 없이 ElevenLabs 크레딧을
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
  // 부모 목소리는 개발자 모드(fe)에서만 — 사장님 결정(2026-09-28). 지금 화면은 이 경로를 안 쓴다.
  if (!isDevUser(caller.username)) {
    return NextResponse.json({ error: DEV_ONLY_MESSAGE }, { status: 403 });
  }
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
