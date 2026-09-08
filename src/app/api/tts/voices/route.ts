import { NextResponse } from "next/server";
import { TypecastError, listTypecastVoices } from "@/lib/typecast";
import { callerOf, isClonedVoice } from "@/lib/api-auth";

/**
 * Typecast 음성 목록 — 배역 고르는 관리 화면(/tts-test)에서만 쓴다.
 *
 * 마스터만 볼 수 있다. 예전엔 아무나 열 수 있었고, 응답에 회원들이 녹음해 만든
 * 부모 목소리(uc_...)가 이름("아빠", "엄마")까지 그대로 들어 있었다. 그 아이디를
 * /api/tts 에 넘기면 남의 아빠 목소리로 아무 말이나 만들 수 있었다.
 *
 * 그래서 두 겹으로 막는다 — 마스터만 부를 수 있고, 그마저도 복제된 개인 목소리는
 * 목록에서 뺀다. 이 화면은 배역 성우를 고르는 곳이라 개인 목소리가 필요 없다.
 */
export async function GET(request: Request) {
  const caller = await callerOf(request);
  if (!caller) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  if (!caller.isMaster) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }
  try {
    const voices = await listTypecastVoices();
    return NextResponse.json({
      voices: voices.filter((v) => !isClonedVoice(String((v as { id?: unknown }).id ?? ""))),
    });
  } catch (e) {
    if (e instanceof TypecastError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[tts/voices]", e);
    return NextResponse.json({ error: "음성 목록을 가져오지 못했습니다." }, { status: 500 });
  }
}
