import { NextResponse } from "next/server";
import { TypecastError, cloneVoiceTypecast, deleteVoiceTypecast } from "@/lib/typecast";
import { callerOf, ownsVoice } from "@/lib/api-auth";

/**
 * 녹음한 부모 목소리(오디오) → Typecast 퀵 클론 → 커스텀 음성 id(uc_...).
 * 클라이언트가 FormData(audio 파일 + name)로 보내면 Typecast로 넘겨 복제하고 voice_id를 준다.
 * 이 voice_id를 계정(기기)에 저장해두고, 낭독할 때 /api/tts에 넘겨 그 목소리로 읽는다.
 *
 * 회원만 부를 수 있다 — 복제 한 번에 Typecast 슬롯(라이트 50개)이 하나 나가고
 * 돈도 나간다. 예전엔 아무나 부를 수 있어 슬롯을 통째로 소진시킬 수 있었다.
 */
export async function POST(request: Request) {
  const caller = await callerOf(request);
  if (!caller) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
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
    const voiceId = await cloneVoiceTypecast({ name, audio: file, filename: "voice.wav" });
    return NextResponse.json({ voiceId });
  } catch (e) {
    if (e instanceof TypecastError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[voice/clone]", e);
    return NextResponse.json({ error: "목소리 복제에 실패했습니다." }, { status: 500 });
  }
}

/**
 * 복제된 목소리(uc_...) 삭제 — 부모가 본인 목소리를 지울 때. body: { voiceId }.
 *
 * **자기 목소리이거나 마스터일 때만** 지운다. 예전엔 voiceId 만 주면 누구 것이든
 * 지워졌고, 그 아이디는 /api/tts/voices 목록에서 그냥 얻을 수 있었다 — 남의 부모
 * 목소리를 지울 수 있었다는 뜻이다.
 *
 * 한 가지 남는 것: 지우기가 실패해 기록만 없어진 '떠 있는 클론'은 이제 본인이
 * 다시 지울 수 없다(주인 기록이 사라져 확인할 방법이 없다). 마스터가 정리해야 한다.
 * 슬롯 하나가 도는 것보다 남의 목소리를 지킬 수 있는 쪽이 낫다.
 */
export async function DELETE(request: Request) {
  const caller = await callerOf(request);
  if (!caller) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
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
  if (!(await ownsVoice(caller, voiceId))) {
    return NextResponse.json({ error: "내 목소리가 아닙니다." }, { status: 403 });
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
