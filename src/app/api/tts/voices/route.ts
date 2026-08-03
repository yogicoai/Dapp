import { NextResponse } from "next/server";
import { TypecastError, listTypecastVoices } from "@/lib/typecast";

/** Typecast 음성 목록 — 키가 없으면 503과 함께 안내 문구를 준다. */
export async function GET() {
  try {
    const voices = await listTypecastVoices();
    return NextResponse.json({ voices });
  } catch (e) {
    if (e instanceof TypecastError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[tts/voices]", e);
    return NextResponse.json({ error: "음성 목록을 가져오지 못했습니다." }, { status: 500 });
  }
}
