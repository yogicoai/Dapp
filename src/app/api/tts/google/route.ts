import { NextResponse } from "next/server";
import { GoogleTtsError, synthesizeGoogle } from "@/lib/google-tts";
import { getSupabase } from "@/lib/supabase";

/**
 * 이번 달 무료 한도(100만 자) 아래 안전선. 여기에 닿으면 합성을 막고 무료 음성으로
 * 물러나게 해 "과금"을 원천 차단한다. (버퍼 5만 자 — 동시 요청·오차 여유)
 */
const MONTHLY_SAFE_LIMIT = 950_000;

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

  // 과금 자동 차단 — 이번 달 사용량에 이번 글자수를 더해도 안전선을 안 넘을 때만 합성한다.
  // 넘으면 합성을 막고 429를 준다 → 앱이 무료 브라우저 음성으로 자동 폴백(크레딧 0).
  // 가드가 아직 설정 안 됐거나(함수 없음) 오류면 통과한다 — 무료 100만 자가 1차 안전선이다.
  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb.rpc("tts_reserve", {
        p_add: text.length,
        p_limit: MONTHLY_SAFE_LIMIT,
      });
      if (!error && data != null && Number(data) < 0) {
        return NextResponse.json(
          { error: "이번 달 무료 성우 한도에 가까워 안전하게 잠갔어요. 다음 달에 다시 열려요." },
          { status: 429 },
        );
      }
    } catch {
      /* 가드 호출 실패는 무시하고 통과 — 무료 한도가 1차 안전선 */
    }
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
