import { NextResponse } from "next/server";
import { TypecastError, cloneVoiceTypecast, deleteVoiceTypecast } from "@/lib/typecast";

/**
 * 녹음한 부모 목소리(오디오) → Typecast 퀵 클론 → 커스텀 음성 id(uc_...).
 * 클라이언트가 FormData(audio 파일 + name)로 보내면 Typecast로 넘겨 복제하고 voice_id를 준다.
 * 이 voice_id를 계정(기기)에 저장해두고, 낭독할 때 /api/tts에 넘겨 그 목소리로 읽는다.
 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "오디오 파일(FormData)이 필요합니다." }, { status: 400 });
  }

  const name = String(form.get("name") ?? "").trim() || "우리 목소리";
  const file = form.get("audio");
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "녹음된 오디오가 필요합니다." }, { status: 400 });
  }

  try {
    const voiceId = await cloneVoiceTypecast({ name, audio: file, filename: "voice.webm" });
    return NextResponse.json({ voiceId });
  } catch (e) {
    if (e instanceof TypecastError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[voice/clone]", e);
    return NextResponse.json({ error: "목소리 복제에 실패했습니다." }, { status: 500 });
  }
}

/** 복제된 목소리(uc_...) 삭제 — 부모가 본인 목소리를 지울 때. body: { voiceId }. */
export async function DELETE(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "voiceId(JSON)가 필요합니다." }, { status: 400 });
  }
  const voiceId =
    typeof (body as { voiceId?: unknown }).voiceId === "string"
      ? (body as { voiceId: string }).voiceId.trim()
      : "";
  if (!voiceId) {
    return NextResponse.json({ error: "voiceId가 필요합니다." }, { status: 400 });
  }
  try {
    await deleteVoiceTypecast(voiceId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof TypecastError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[voice/clone DELETE]", e);
    return NextResponse.json({ error: "목소리 삭제에 실패했습니다." }, { status: 500 });
  }
}
