/**
 * 스크립트에서 부른 AI 호출도 같은 표(ai_usage)에 남긴다 — 서비스 키로 바로 넣는다(env = script).
 *
 * 앱 서버는 부른 회원의 권한으로 log_ai_usage RPC 를 쓰지만(lib/ai-usage-db), 스크립트에는 회원이 없다.
 * 서비스 키는 .env.local 에만 있다 — 없으면 기록 없이 그대로 그린다(경고 한 줄).
 *
 * 쓰는 법(스크립트 맨 위에서 한 번):
 *   import { recordScriptAiUsage, settleAiUsage } from "./ai-usage.mts";
 *   recordScriptAiUsage("draw-book-pages");   // 이 뒤로 lib/gemini 의 호출이 기록된다
 *   …
 *   await settleAiUsage();                    // 끝내기 전에 다 적는다
 *
 * lib/gemini 를 안 거치고 구글을 직접 부르는 스크립트는 답(JSON)을 logScriptGemini 에 넘긴다.
 */
import { createClient } from "@supabase/supabase-js";
import { geminiUsageRow, reportAiUsage, setDefaultAiUsageSink, settleAiUsage, type AiUsageKind } from "../src/lib/ai-usage.ts";

export { settleAiUsage };

/** 이 스크립트 이름으로 기록을 켠다. 켜졌으면 true */
export function recordScriptAiUsage(script: string): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn("[ai-usage] SUPABASE_SERVICE_ROLE_KEY 가 없어 이 스크립트의 AI 호출은 기록하지 않아요.");
    return false;
  }
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  setDefaultAiUsageSink({
    route: script,
    env: "script",
    sink: async (records) => {
      const { error } = await db.from("ai_usage").insert(records);
      if (error) throw new Error(error.message);
    },
  });
  return true;
}

/** 구글을 직접 부른 스크립트용 — 답(JSON)을 넘기면 한 줄 남기고 다 적을 때까지 기다린다 */
export async function logScriptGemini(script: string, askedModel: string, answer: unknown, kind: AiUsageKind = "image"): Promise<void> {
  if (!recordScriptAiUsage(script)) return;
  reportAiUsage(geminiUsageRow(askedModel, kind, answer));
  await settleAiUsage();
}
